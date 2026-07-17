import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import express from 'express'
import { scenarioSummaries, getScenario } from '../scenarios/index.ts'
import { formatBoard } from '../engine/board.ts'
import {
  ARENA_EVENT,
  DEFAULT_LOCALE,
  DEFAULT_NUDGE_PREFS,
  DEFAULT_RUN_MODE,
  LOCALES,
  MENTOR_BUBBLE,
  RUN_MODES,
  type Check,
  type MentorBubble,
  type NudgePrefs,
  type Snapshot,
} from '../engine/types.ts'
import {
  deleteLearn,
  LEARN_STATUSES,
  loadLearn,
  parseLearnSnapshot,
  saveLearn,
} from './learn.ts'
import {
  Mentor,
  MENTOR_HOW_CLOSED,
  MENTOR_PHASE,
  MENTOR_TRIGGER,
  buildMentorPrompt,
  type MentorHowClosed,
  type MentorPromptSource,
  type MentorTrigger,
} from './mentor.ts'
import { baselineOf, shouldNudge } from './nudge.ts'
import { RUN_STATUS, RunStore, type Run, type TranscriptEntry } from './runs.ts'
import { ENGINE_VERSION, leaderboard, recordResult, saveEvidence, slog } from './store.ts'
import { checkForUpdate } from './update-check.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Input caps: nothing here is security, just sane bounds on what lands in
// prompts, logs and evidence files.
const PLAYER_NAME_MAX_CHARS = 60
const QUESTION_MAX_CHARS = 2000
const LOG_DETAIL_MAX_CHARS = 300

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
      locale: run.locale,
      sessionId: run.mentorSessionId,
      turns: run.mentorTurns,
      onDelta: (text, bubble) => runs.emit(run, ARENA_EVENT.mentorDelta, { text, bubble }),
      onDone: () => {
        slog(`run=${run.id} mentor turn done`)
        run.mentorSessionId = run.mentor?.sessionId ?? null
        run.mentorTurns = run.mentor?.turns ?? 0
        runs.emit(run, ARENA_EVENT.mentorDone, {
          mentorSessionId: run.mentorSessionId,
          mentorTurns: run.mentorTurns,
        })
      },
      onError: (kind, detail) => {
        slog(`run=${run.id} mentor ${kind}: ${String(detail).slice(0, LOG_DETAIL_MAX_CHARS)}`)
        runs.emit(run, ARENA_EVENT.mentorError, { kind, detail })
      },
    })
  }
  return run.mentor
}

// Every mentor request goes through here so the player immediately sees the
// thinking indicator: a fresh `claude -p` takes seconds to first token, and
// that silence must have a face.
function askMentor(
  run: Run,
  source: MentorPromptSource,
  opts?: { coalesce?: boolean; bubble?: MentorBubble }
): boolean {
  // Hermetic-test escape hatch: SHARPEN_NO_MENTOR=1 skips spawning the claude
  // CLI entirely. Chosen over a mentorFactory injection because this module
  // exports a built app instance, not a builder, so an env flag is the
  // cleanest seam. No mentor events are emitted and asks report accepted=false.
  if (process.env.SHARPEN_NO_MENTOR === '1') return false
  const mentor = mentorFor(run)
  const accepted = mentor.ask(source, opts)
  slog(`run=${run.id} mentor ask accepted=${accepted} turns=${mentor.turns} queued=${mentor.queue.length}`)
  if (accepted) runs.emit(run, ARENA_EVENT.mentorThinking, {})
  return accepted
}

function mentorPromptFor(
  run: Run,
  trigger: MentorTrigger,
  {
    snapshot,
    checks,
    playerQuestion,
    durationSec,
  }: {
    snapshot: Snapshot
    checks: Check[]
    playerQuestion?: string
    durationSec?: number
  }
): string {
  const open = run.status === RUN_STATUS.live || run.status === RUN_STATUS.ready
  const howClosed: MentorHowClosed | undefined =
    run.status === RUN_STATUS.passed
      ? MENTOR_HOW_CLOSED.passed
      : run.status === RUN_STATUS.revealed
        ? MENTOR_HOW_CLOSED.revealed
        : undefined
  return buildMentorPrompt({
    phase: open ? MENTOR_PHASE.open : MENTOR_PHASE.closed,
    howClosed,
    trigger,
    scenario: run.scenario,
    board: formatBoard(snapshot),
    transcript: run.transcript,
    checks,
    clockSec: open && run.deadline != null ? Math.max(0, (run.deadline - Date.now()) / 1000) : null,
    durationSec,
    playerQuestion,
  })
}

function mentorFromInspect(
  run: Run,
  trigger: MentorTrigger,
  opts?: { playerQuestion?: string; bubble?: MentorBubble; coalesce?: boolean }
): boolean {
  // The prompt is a builder on purpose: it resolves when the mentor actually
  // picks the turn up, so a question queued behind a long answer sees the
  // board, transcript and clock as they are then, not as they were on ask.
  return askMentor(
    run,
    async () => {
      const { snapshot, verdict } = await runs.inspect(run)
      return mentorPromptFor(run, trigger, {
        snapshot,
        checks: verdict.checks,
        playerQuestion: opts?.playerQuestion,
      })
    },
    { bubble: opts?.bubble, coalesce: opts?.coalesce }
  )
}

// One check per server lifetime; every /api/meta awaits the same promise.
const updateAvailable = checkForUpdate(ENGINE_VERSION)

app.get('/api/meta', async (_req, res) => {
  res.json({
    engineVersion: ENGINE_VERSION,
    player: await defaultPlayer(),
    updateAvailable: await updateAvailable,
  })
})

app.get('/api/scenarios', (_req, res) => {
  res.json(scenarioSummaries())
})

app.get('/api/leaderboard', async (_req, res) => {
  res.json(await leaderboard())
})

app.get('/api/learn/:scenarioId', async (req, res) => {
  const scenarioId = decodeURIComponent(req.params.scenarioId)
  if (!getScenario(scenarioId)) return res.status(404).json({ error: 'unknown scenario' })
  // 200 + null when empty: a 404 is correct REST but the browser paints every
  // failed fetch red in the console on every Learn enter.
  const snapshot = await loadLearn(scenarioId)
  res.json(snapshot)
})

app.put('/api/learn/:scenarioId', async (req, res) => {
  const scenarioId = decodeURIComponent(req.params.scenarioId)
  if (!getScenario(scenarioId)) return res.status(404).json({ error: 'unknown scenario' })
  // The URL owns the id; the body key keeps the persisted name (see LearnSnapshot).
  const snapshot = parseLearnSnapshot({ ...req.body, challengeId: scenarioId }, scenarioId)
  if (!snapshot) return res.status(400).json({ error: 'invalid snapshot' })
  await saveLearn(snapshot)
  res.status(204).end()
})

app.delete('/api/learn/:scenarioId', async (req, res) => {
  const scenarioId = decodeURIComponent(req.params.scenarioId)
  if (!getScenario(scenarioId)) return res.status(404).json({ error: 'unknown scenario' })
  await deleteLearn(scenarioId)
  res.status(204).end()
})

app.post('/api/runs', async (req, res) => {
  const player = (req.body?.player ?? (await defaultPlayer())).slice(0, PLAYER_NAME_MAX_CHARS)
  const locale = LOCALES.find((l) => l === req.body?.locale) ?? DEFAULT_LOCALE
  const mode = RUN_MODES.find((m) => m === req.body?.mode) ?? DEFAULT_RUN_MODE
  const run = runs.create({ scenarioId: req.body?.scenarioId, player, locale, mode })
  if (!run) return res.status(404).json({ error: 'unknown scenario' })
  res.json({ runId: run.id, player, mode: run.mode })
})

app.get('/api/runs/:id', (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  res.json({
    status: run.status,
    deadline: run.deadline,
    mentorSessionId: run.mentor?.sessionId ?? run.mentorSessionId,
    mentorTurns: run.mentor?.turns ?? run.mentorTurns,
  })
})

app.get('/api/runs/:id/events', (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).end()
  runs.addClient(run, res)
})

app.post('/api/runs/:id/start', async (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  const wasReady = run.status === RUN_STATUS.ready
  runs.start(run, (timedOut) => {
    slog(`run=${timedOut.id} timeout`)
    runs.emit(timedOut, ARENA_EVENT.timeout, {})
    mentorFromInspect(timedOut, MENTOR_TRIGGER.timeout, { bubble: MENTOR_BUBBLE.reveal })
  })
  if (wasReady) {
    // Seed the nudge gate with the opening board (or the restored transcript
    // in learn) so a first read-only Enter stays silent.
    const { verdict } = await runs.inspect(run)
    run.nudgeBaseline = baselineOf(verdict)
  }
  slog(`run=${run.id} started player=${run.player} scenario= mode=${run.mode}`)
  res.json({ startedAt: run.startedAt, deadline: run.deadline, mode: run.mode, status: run.status })
})

app.post('/api/runs/:id/restore', (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  const status = LEARN_STATUSES.find((s) => s === req.body?.status)
  if (!status || !Array.isArray(req.body?.transcript)) {
    return res.status(400).json({ error: 'invalid restore body' })
  }
  const transcript = (req.body.transcript as TranscriptEntry[]).map((t) => ({
    command: String(t.command ?? ''),
    output: String(t.output ?? ''),
  }))
  const mentorSessionId =
    req.body.mentorSessionId === null || typeof req.body.mentorSessionId === 'string'
      ? (req.body.mentorSessionId as string | null)
      : null
  const mentorTurns = typeof req.body.mentorTurns === 'number' ? req.body.mentorTurns : 0
  if (!runs.restore(run, { transcript, status, mentorSessionId, mentorTurns })) {
    return res.status(409).json({ error: `cannot restore: mode=${run.mode} status=${run.status}` })
  }
  // Attach mentor early so session seeds are ready before the first ask.
  mentorFor(run)
  res.json({
    mentorSessionId: run.mentorSessionId,
    mentorTurns: run.mentorTurns,
  })
})

app.post('/api/runs/:id/reveal', async (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  if (!runs.reveal(run)) {
    return res.status(409).json({ error: `cannot reveal: mode=${run.mode} status=${run.status}` })
  }
  slog(`run=${run.id} reveal`)
  mentorFromInspect(run, MENTOR_TRIGGER.reveal, { bubble: MENTOR_BUBBLE.reveal })
  res.status(204).end()
})

app.post('/api/runs/:id/command', (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  if (run.status === RUN_STATUS.live && typeof req.body?.command === 'string') {
    runs.recordCommand(run, req.body.command, req.body.output)
    // UX signal only (never affects scoring): feeds the error switch of the
    // nudge gate on the next submit.
    run.lastCommandErrored = req.body.error === true
  }
  res.status(204).end()
})

/** The player's nudge switches travel in each submit; absent body = both on. */
function nudgePrefsFrom(body: unknown): NudgePrefs {
  const prefs = (body as { nudges?: Partial<NudgePrefs> } | undefined)?.nudges
  return {
    onChange: prefs?.onChange ?? DEFAULT_NUDGE_PREFS.onChange,
    onError: prefs?.onError ?? DEFAULT_NUDGE_PREFS.onError,
  }
}

app.post('/api/runs/:id/submit', async (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  if (run.status !== RUN_STATUS.live) return res.status(409).json({ error: `run is ${run.status}` })

  const { snapshot, verdict } = await runs.submit(run)
  runs.emit(run, ARENA_EVENT.verdict, { pass: verdict.pass, checks: verdict.checks, attempts: run.attempts })

  // Policy outcome, not ask acceptance: the web uses it to decide whether the
  // command deserves a bubble in the conversation (same gate, one decision).
  let nudged = true
  if (verdict.pass) {
    if (run.mode === 'challenge') {
      const evidence = await saveEvidence(run, verdict)
      await recordResult(evidence)
      runs.emit(run, ARENA_EVENT.leaderboardUpdated, {})
    }
    const durationSec = (Date.now() - (run.startedAt ?? Date.now())) / 1000
    askMentor(
      run,
      mentorPromptFor(run, MENTOR_TRIGGER.submitPass, {
        snapshot,
        checks: verdict.checks,
        durationSec,
      })
    )
  } else if (shouldNudge(run.nudgeBaseline, verdict, run.lastCommandErrored, nudgePrefsFrom(req.body))) {
    askMentor(
      run,
      mentorPromptFor(run, MENTOR_TRIGGER.submitFail, { snapshot, checks: verdict.checks }),
      { coalesce: true }
    )
  } else {
    nudged = false
    slog(`run=${run.id} nudge gated: no state delta`)
  }
  run.nudgeBaseline = baselineOf(verdict)
  run.lastCommandErrored = false
  slog(`run=${run.id} submit attempt=${run.attempts} pass=${verdict.pass}`)
  res.json({ pass: verdict.pass, checks: verdict.checks, nudged })
})

// Chat: same Open/Closed context as other turns; trigger is chat.
app.post('/api/runs/:id/ask', async (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  const question = String(req.body?.question ?? '').slice(0, QUESTION_MAX_CHARS)
  if (!question.trim()) return res.status(400).json({ error: 'empty question' })
  const accepted = mentorFromInspect(run, MENTOR_TRIGGER.chat, { playerQuestion: question })
  res.status(accepted ? 202 : 429).json({ accepted })
})

// Timeout evidence: when the timer fires the run is over; record the state as
// it stood so the leaderboard reflects the attempt (score 0).
app.post('/api/runs/:id/expire', async (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'unknown run' })
  if (run.status !== RUN_STATUS.revealed) return res.status(409).json({ error: `run is ${run.status}` })
  const { verdict } = await runs.submit(run)
  const evidence = await saveEvidence(run, verdict)
  await recordResult(evidence)
  runs.emit(run, ARENA_EVENT.leaderboardUpdated, {})
  res.json({ recorded: true })
})

// SPA fallback: deep links like /git/clean-sweep must serve the app shell.
// express.static above already answered real files; anything else that is not
// an API call falls through to index.html and the router takes over.
// A relative path with an explicit `root` is mandatory, not stylistic: given
// an absolute path, `send` walks every segment and its default dotfiles:
// 'ignore' 404s any path crossing a dot dir. The launcher installs the app
// under ~/.sharpen/app/<version>, so the absolute form silently broke every
// deep link in the shipped artifact while dev (no dot segment) looked fine.
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile('index.html', { root: join(root, 'dist') })
})
