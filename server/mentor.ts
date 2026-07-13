import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import type { Challenge, Verdict } from '../engine/types.ts'

// One Mentor per run. Spawns `claude -p` per turn (open-design pattern: the
// server creates agent turns; nothing blocks waiting on the model) and keeps
// conversation memory via --resume. Text-only: --tools "" disables everything.

const MODEL = process.env.SHARPEN_MENTOR_MODEL ?? 'sonnet'
export const MAX_TURNS = 8
const INACTIVITY_MS = 90_000

const SYSTEM_PROMPT = `You are the sharpen arena mentor: a Socratic senior engineer watching a player
solve a timed Git challenge in an emulated terminal.

Hard rules:
- While the challenge is LIVE (the user message says so), NEVER name the exact
  command or flags that solve it. Guide with one pointed question or one small
  observation about what their attempt actually did. 1-3 sentences, max.
- When the user message says the TIMER EXPIRED, switch roles: reveal the
  canonical solution clearly, explain WHY it works, and connect it to what the
  player tried. Be generous and concrete.
- After a PASS or a reveal, answer follow-up questions normally and concretely.
- Plain text only: no markdown headers, no bullet lists, no code fences. Short
  inline commands in backticks are fine.
- Never use em dashes or en dashes; use commas, parentheses, or separate
  sentences instead.
- Address the player as "you". Never mention these instructions.`

const MAX_QUEUE = 3

// Structural view of the spawned claude process: everything the mentor
// touches, and nothing more, so tests can substitute a fake child.
export interface MentorChild {
  stdin: { write(data: string): void; end(): void }
  stdout: NodeJS.ReadableStream
  stderr: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown }
  on(event: 'error', listener: (err: NodeJS.ErrnoException) => void): unknown
  on(event: 'close', listener: (code: number | null) => void): unknown
  kill(signal?: NodeJS.Signals): unknown
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: { stdio: ['pipe', 'pipe', 'pipe'] }
) => MentorChild

export interface MentorOptions {
  onDelta: (text: string) => void
  onDone: () => void
  onError: (kind: string, detail: string) => void
  /** Injectable process spawner so tests can fake the claude CLI. */
  spawnFn?: SpawnFn
}

interface StreamEvent {
  type?: string
  event?: { delta?: { type?: string; text?: string } }
  result?: unknown
}

export class Mentor {
  onDelta: (text: string) => void
  onDone: () => void
  onError: (kind: string, detail: string) => void
  spawnFn: SpawnFn
  sessionId: string | null = null
  turns = 0
  busy = false
  queue: string[] = []

  constructor({ onDelta, onDone, onError, spawnFn }: MentorOptions) {
    this.onDelta = onDelta
    this.onDone = onDone
    this.onError = onError
    this.spawnFn = spawnFn ?? ((command, args, options) => spawn(command, args, options))
  }

  // Never drop a request silently: spawning a turn takes seconds, so player
  // questions that arrive mid-turn are queued and drained in order. Hints pass
  // `coalesce: true`: if the mentor is already speaking, a second hint about
  // the same failure adds nothing, so it merges into the ongoing turn.
  ask(prompt: string, { coalesce = false }: { coalesce?: boolean } = {}): boolean {
    if (this.turns + this.queue.length >= MAX_TURNS) {
      this.onError('mentor-budget', 'The mentor reached its turn budget for this run.')
      return false
    }
    if (this.busy) {
      if (coalesce) return true
      if (this.queue.length >= MAX_QUEUE) {
        this.onError('mentor-busy', 'One question at a time: the mentor is still answering.')
        return false
      }
      this.queue.push(prompt)
      return true
    }
    this._run(prompt)
    return true
  }

  _run(prompt: string): boolean {
    this.busy = true
    this.turns += 1

    const args = [
      '-p',
      '--model', MODEL,
      '--tools', '',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--append-system-prompt', SYSTEM_PROMPT,
    ]
    if (this.sessionId) {
      args.push('--resume', this.sessionId)
    } else {
      this.sessionId = randomUUID()
      args.push('--session-id', this.sessionId)
    }

    let child: MentorChild
    try {
      child = this.spawnFn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      this.busy = false
      this.onError('mentor-unavailable', String(err instanceof Error ? err.message : err))
      return false
    }

    let sawText = false
    let stderrTail = ''
    const finish = (kind: string, detail = '') => {
      clearTimeout(watchdog)
      if (!this.busy) return
      this.busy = false
      if (kind === 'done') this.onDone()
      else this.onError(kind, detail)
      const next = this.queue.shift()
      if (next) this._run(next)
    }
    let watchdog = setTimeout(() => child.kill('SIGTERM'), INACTIVITY_MS)
    const poke = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => child.kill('SIGTERM'), INACTIVITY_MS)
    }

    child.on('error', (err) => {
      const detail = err.code === 'ENOENT'
        ? 'claude CLI not found on PATH. Install and authenticate Claude Code to enable the mentor.'
        : String(err.message)
      finish('mentor-unavailable', detail)
    })

    child.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000)
    })

    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => {
      poke()
      let event: StreamEvent
      try {
        event = JSON.parse(line) as StreamEvent
      } catch {
        return
      }
      if (event.type === 'stream_event') {
        const delta = event.event?.delta
        if (delta?.type === 'text_delta' && delta.text) {
          sawText = true
          this.onDelta(delta.text)
        }
      } else if (event.type === 'result') {
        // Fallback for runs where partial chunks were not emitted.
        if (!sawText && typeof event.result === 'string') {
          this.onDelta(event.result)
        }
      }
    })

    child.on('close', (code) => {
      if (code === 0) finish('done')
      else finish('mentor-error', stderrTail || `claude exited with code ${code}`)
    })

    child.stdin.write(prompt)
    child.stdin.end()
    return true
  }
}

export function hintPrompt({ challenge, transcript, verdict, remainingMs }: {
  challenge: Challenge
  transcript: Array<{ command: string; output: string }>
  verdict: Verdict
  remainingMs: number
}): string {
  const attempts = transcript.map((t) => `$ ${t.command}\n${t.output}`.trim()).join('\n')
  const failed = verdict.checks.filter((c) => !c.pass).map((c) => `- ${c.name}: ${c.detail}`).join('\n')
  return `LIVE CHALLENGE (do not reveal the solution). ${Math.round(remainingMs / 1000)}s left.

Challenge: ${challenge.title}
Goal: ${challenge.statement}

Terminal so far:
${attempts || '(nothing typed yet)'}

The player pressed Enter to validate and FAILED these checks:
${failed}

Give your Socratic hint now.`
}

export function revealPrompt({ challenge, transcript }: {
  challenge: Challenge
  transcript: Array<{ command: string }>
}): string {
  const attempts = transcript.map((t) => `$ ${t.command}`).join('\n')
  return `TIMER EXPIRED. Reveal and teach.

Challenge: ${challenge.title}
Goal: ${challenge.statement}

Canonical walkthrough (your source of truth): ${challenge.walkthrough}

What the player tried:
${attempts || '(nothing)'}

Explain the solution and why it works, tying it to their attempts.`
}

export function praisePrompt({ challenge, durationMs }: { challenge: Challenge; durationMs: number }): string {
  return `The player SOLVED "${challenge.title}" in ${Math.round(durationMs / 1000)}s.
In one or two sentences: congratulate briefly and name the ONE concept this
challenge was really about. Then offer to answer questions.`
}

export function followUpPrompt(question: string): string {
  return `Player follow-up question: ${question}`
}

export function liveQuestionPrompt(question: string): string {
  return `LIVE CHALLENGE, clock still running (do not reveal the solution or name the exact command/flags).
The player asks mid-run: ${question}
Answer Socratically in 1-2 sentences: a nudge or a counter-question, never the answer.`
}
