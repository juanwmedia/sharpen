import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import express from 'express'
import { challengeSummaries } from '../challenges/index.ts'
import { Mentor, followUpPrompt, hintPrompt, liveQuestionPrompt, praisePrompt, revealPrompt } from './mentor.ts'
import { RunStore, type Run } from './runs.ts'
import { ENGINE_VERSION, leaderboard, recordResult, saveEvidence, slog } from './store.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export const app = express()
app.use(express.json())
app.use(express.static(join(root, 'dist')))

export const runs = new RunStore()

// The GitHub login is the canonical player identity (it is also what v2's
// Issue-based submissions will be signed with) and it makes avatars work:
// https://github.com/<login>.png. Fallbacks: git config name, then anonymous.
let cachedPlayer: string | null = null
async function defaultPlayer(): Promise<string> {
  if (cachedPlayer) return cachedPlayer
  const exec = promisify(execFile)
  try {
    const { stdout } = await exec('gh', ['api', 'user', '--jq', '.login'])
    cachedPlayer = stdout.trim()
  } catch {
    try {
      const { stdout } = await exec('git', ['config', 'user.name'])
      cachedPlayer = stdout.trim()
    } catch {
      /* fall through */
    }
  }
  cachedPlayer = cachedPlayer || 'anonymous'
  return cachedPlayer
}

function mentorFor(run: Run): Mentor {
  if (!run.mentor) {
    run.mentor = new Mentor({
      onDelta: (text) => runs.emit(run, 'mentor-delta', { text }),
      onDone: () => {
        slog(`run=${run.id} mentor turn done`)
        runs.emit(run, 'mentor-done')
      },
      onError: (kind, detail) => {
        slog(`run=${run.id} mentor ${kind}: ${String(detail).slice(0, 300)}`)
        runs.emit(run, 'mentor-error', { kind, detail })
      },
    })
  }
  return run.mentor
}

// Every mentor request goes through here so the player immediately sees the
// thinking indicator: a fresh `claude -p` takes seconds to first token, and
// that silence must have a face.
function askMentor(run: Run, prompt: string, opts?: { coalesce?: boolean }): boolean {
  // Hermetic-test escape hatch: SHARPEN_NO_MENTOR=1 skips spawning the claude
  // CLI entirely. Chosen over a mentorFactory injection because this module
  // exports a built app instance, not a builder, so an env flag is the
  // cleanest seam. No mentor events are emitted and asks report accepted=false.
  if (process.env.SHARPEN_NO_MENTOR === '1') return false
  const mentor = mentorFor(run)
  const accepted = mentor.ask(prompt, opts)
  slog(`run=${run.id} mentor ask accepted=${accepted} turns=${mentor.turns} queued=${mentor.queue.length}`)
  if (accepted) runs.emit(run, 'mentor-thinking', {})
  return accepted
}

app.get('/api/meta', async (_req, res) => {
  res.json({ engineVersion: ENGINE_VERSION, player: await defaultPlayer() })
})

app.get('/api/challenges', (_req, res) => {
  res.json(challengeSummaries())
})

app.get('/api/leaderboard', async (_req, res) => {
  res.json(await leaderboard())
})

app.post('/api/runs', async (req, res) => {
  const player = (req.body?.player ?? (await defaultPlayer())).slice(0, 60)
  const run = runs.create({ challengeId: req.body?.challengeId, player })
  if (!run) return res.status(404).json({ error: 'unknown challenge' })
  res.json({ runId: run.id, player })
})

app.get('/api/runs/:id', (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  res.json({ status: run.status, deadline: run.deadline })
})

app.get('/api/runs/:id/events', (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).end()
  runs.addClient(run, res)
})

app.post('/api/runs/:id/start', (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  runs.start(run, (timedOut) => {
    slog(`run=${timedOut.id} timeout`)
    runs.emit(timedOut, 'timeout', {})
    askMentor(timedOut, revealPrompt(timedOut))
  })
  slog(`run=${run.id} started player=${run.player} challenge=${run.challengeId}`)
  res.json({ startedAt: run.startedAt, deadline: run.deadline })
})

app.post('/api/runs/:id/command', (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  if (run.status === 'live' && typeof req.body?.command === 'string') {
    runs.recordCommand(run, req.body.command, req.body.output)
  }
  res.status(204).end()
})

app.post('/api/runs/:id/submit', async (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  if (run.status !== 'live') return res.status(409).json({ error: `run is ${run.status}` })

  const verdict = await runs.submit(run)
  runs.emit(run, 'verdict', { pass: verdict.pass, checks: verdict.checks, attempts: run.attempts })

  if (verdict.pass) {
    const evidence = await saveEvidence(run, verdict)
    await recordResult(evidence)
    runs.emit(run, 'leaderboard-updated', {})
    askMentor(run, praisePrompt({ challenge: run.challenge, durationMs: evidence.durationMs }))
  } else {
    askMentor(
      run,
      hintPrompt({
        challenge: run.challenge,
        transcript: run.transcript,
        verdict,
        remainingMs: Math.max(0, (run.deadline ?? 0) - Date.now()),
      }),
      { coalesce: true }
    )
  }
  slog(`run=${run.id} submit attempt=${run.attempts} pass=${verdict.pass}`)
  res.json({ pass: verdict.pass, checks: verdict.checks })
})

// Chat works in every phase. Mid-run questions get the Socratic guardrail
// (nudges only); after pass/reveal the mentor answers plainly.
app.post('/api/runs/:id/ask', (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  const question = String(req.body?.question ?? '').slice(0, 2000)
  if (!question.trim()) return res.status(400).json({ error: 'empty question' })
  const prompt = run.status === 'live' ? liveQuestionPrompt(question) : followUpPrompt(question)
  const accepted = askMentor(run, prompt)
  res.status(accepted ? 202 : 429).json({ accepted })
})

// Timeout evidence: when the timer fires the run is over; record the state as
// it stood so the leaderboard reflects the attempt (score 0).
app.post('/api/runs/:id/expire', async (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  if (run.status !== 'revealed') return res.status(409).json({ error: `run is ${run.status}` })
  const verdict = await runs.submit(run)
  const evidence = await saveEvidence(run, verdict)
  await recordResult(evidence)
  runs.emit(run, 'leaderboard-updated', {})
  res.json({ recorded: true })
})
