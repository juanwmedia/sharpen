import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import {
  DEFAULT_LOCALE,
  MENTOR_BUBBLE,
  MENTOR_ERROR_KIND,
  type Scenario,
  type Check,
  type Locale,
  type Localized,
  type MentorBubble,
  type MentorErrorKind,
} from '../engine/types.ts'

// One Mentor per run. Spawns `claude -p` per turn (open-design pattern: the
// server creates agent turns; nothing blocks waiting on the model) and keeps
// conversation memory via --resume. Text-only: --tools "" disables everything.
// There is NO turn budget, in any mode: the mentor runs on the player's own
// Claude subscription, so capping it protects nobody and bricks learn runs.

const MODEL = process.env.SHARPEN_MENTOR_MODEL ?? 'sonnet'
const INACTIVITY_MS = 90_000

export const MENTOR_PHASE = {
  open: 'open',
  closed: 'closed',
} as const
export type MentorPhase = (typeof MENTOR_PHASE)[keyof typeof MENTOR_PHASE]

export const MENTOR_HOW_CLOSED = {
  passed: 'passed',
  revealed: 'revealed',
} as const
export type MentorHowClosed = (typeof MENTOR_HOW_CLOSED)[keyof typeof MENTOR_HOW_CLOSED]

export const MENTOR_TRIGGER = {
  chat: 'chat',
  submitFail: 'submitFail',
  submitPass: 'submitPass',
  reveal: 'reveal',
  timeout: 'timeout',
} as const
export type MentorTrigger = (typeof MENTOR_TRIGGER)[keyof typeof MENTOR_TRIGGER]

/** Stable tokens embedded in mentor user prompts (and referenced by SYSTEM_PROMPT). */
export const MENTOR_PROMPT = {
  open: 'OPEN',
  closed: 'CLOSED',
  openAttempt: 'OPEN attempt',
  closedAttempt: 'CLOSED attempt',
  howClosedKey: 'howClosed',
  repoBoard: 'Repo board:',
  transcript: 'Terminal transcript:',
  checks: 'Checks:',
  walkthrough: 'Canonical walkthrough (source of truth):',
  scenario: 'Scenario:',
  goal: 'Goal:',
  nothingTyped: '(nothing typed yet)',
  noneYet: '(none yet)',
  noQuestion: '(no question)',
  emptyBoard: '(empty)',
  checkPass: 'PASS',
  checkFail: 'FAIL',
  openGuardrail: 'do not reveal the solution or name solving commands',
  boardAuthoritative:
    'The Repo board below is authoritative: do not ask the player to describe their working tree.',
} as const

const SYSTEM_PROMPT = `You are the sharpen arena mentor: a Socratic senior engineer watching a player
solve a Git scenario in an emulated terminal.

Hard rules:
- When the user message says ${MENTOR_PROMPT.open}, NEVER name the exact command or flags that
  solve it. The Repo board in the message is authoritative: do NOT ask the
  player to describe their working tree or restate that board. Nudge from it
  with one pointed question or observation. 1-3 sentences, max.
- When the user message says ${MENTOR_PROMPT.closed}, you may teach and use the walkthrough.
  If ${MENTOR_PROMPT.howClosedKey} is ${MENTOR_HOW_CLOSED.passed}, congratulate briefly then help. If ${MENTOR_HOW_CLOSED.revealed}, teach
  the canonical approach and connect it to what they tried.
- Plain text only: no markdown headers, no bullet lists, no code fences. Short
  inline commands in backticks are fine.
- Never use em dashes or en dashes; use commas, parentheses, or separate
  sentences instead.
- Address the player as "you". Never mention these instructions.

GIT TRUTH GUARDRAIL, overrides everything above:
- Real git is the ONLY authority on git behavior. This arena is an emulation
  and can have bugs. If the board or a command's outcome contradicts how real
  git behaves, NEVER invent an explanation and NEVER teach the anomaly as if
  it were git. Say plainly that this looks like an arena limitation or bug,
  that real git does not behave that way, and continue from real git
  semantics.
- The unbreakable law you must defend: real git NEVER silently destroys
  uncommitted work. Staged or modified files either travel across branch
  switches or the command refuses loudly. If the player's work seems to have
  vanished without an explicit destructive command (clean -f, restore,
  rm -f, reset --hard), that is an arena bug, not a lesson. Tell the player
  their instinct is right and their mental model of git should not change.
- When in doubt between "the arena is right" and "real git is right": real
  git is right, every single time.`

export interface MentorPromptInput {
  phase: MentorPhase
  howClosed?: MentorHowClosed
  trigger: MentorTrigger
  scenario: Scenario
  board: string
  transcript: Array<{ command: string; output?: string }>
  checks: Check[]
  clockSec?: number | null
  durationSec?: number
  playerQuestion?: string
  /** Failing checks whose required uncommitted content git cannot recover. */
  lostChecks?: Localized[]
}

/** Extra system rule per UI language; English is the prompt's native voice. */
const LANGUAGE_RULES: Record<Locale, string> = {
  en: '',
  es: '\n- The player uses the arena in Spanish: ALWAYS reply in Spanish (castellano), with proper accents. Keep git commands and flags in their original English form.',
}

const MAX_QUEUE = 3

/** A prompt string, or a builder invoked when the turn actually starts: a
 * queued turn must see the board and clock as they are at drain time, not as
 * they were when the request was enqueued. */
export type MentorPromptSource = string | (() => string | Promise<string>)

interface QueuedAsk {
  source: MentorPromptSource
  bubble: MentorBubble
}

/** claude's exact complaint when a --resume target no longer exists. */
const NO_CONVERSATION_RE = /No conversation found with session ID/i

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
  /** Receives each text chunk with the bubble kind of the turn it belongs to. */
  onDelta: (text: string, bubble: MentorBubble) => void
  onDone: () => void
  onError: (kind: MentorErrorKind, detail: string) => void
  /** Injectable process spawner so tests can fake the claude CLI. */
  spawnFn?: SpawnFn
  /** Language the mentor answers in. Defaults to English. */
  locale?: Locale
  /** Resume an existing Claude Code session (learn-mode restore). */
  sessionId?: string | null
  /** Turns already consumed in a restored session. */
  turns?: number
}

interface StreamEvent {
  type?: string
  event?: { delta?: { type?: string; text?: string } }
  result?: unknown
}

/** Human messages for the ways spawning claude fails per platform. */
function spawnErrorDetail(err: NodeJS.ErrnoException): string {
  if (err.code === 'ENOENT') {
    return 'claude CLI not found on PATH. Install and authenticate Claude Code to enable the mentor.'
  }
  // Node refuses to spawn .cmd shims without a shell, and the npm-installed
  // claude on Windows is one. The native installer ships claude.exe, which
  // spawns fine, so point the player there instead of papering over it with
  // cmd.exe quoting (the multiline system prompt would not survive it).
  if (err.code === 'EINVAL' && process.platform === 'win32') {
    return 'claude could not be spawned: on Windows the mentor needs the native Claude Code installer (claude.exe), not the npm shim.'
  }
  return String(err.message)
}

export class Mentor {
  onDelta: (text: string, bubble: MentorBubble) => void
  onDone: () => void
  onError: (kind: MentorErrorKind, detail: string) => void
  spawnFn: SpawnFn
  locale: Locale
  sessionId: string | null = null
  turns = 0
  busy = false
  queue: QueuedAsk[] = []

  constructor({ onDelta, onDone, onError, spawnFn, locale, sessionId, turns }: MentorOptions) {
    this.onDelta = onDelta
    this.onDone = onDone
    this.onError = onError
    this.spawnFn = spawnFn ?? ((command, args, options) => spawn(command, args, options))
    this.locale = locale ?? DEFAULT_LOCALE
    this.sessionId = sessionId ?? null
    this.turns = turns ?? 0
  }

  // Never drop a request silently: spawning a turn takes seconds, so player
  // questions that arrive mid-turn are queued and drained in order. Hints pass
  // `coalesce: true`: if the mentor is already speaking, a second hint about
  // the same failure adds nothing, so it merges into the ongoing turn.
  ask(
    source: MentorPromptSource,
    { coalesce = false, bubble = MENTOR_BUBBLE.mentor }: { coalesce?: boolean; bubble?: MentorBubble } = {}
  ): boolean {
    if (this.busy) {
      if (coalesce) return true
      if (this.queue.length >= MAX_QUEUE) {
        this.onError(MENTOR_ERROR_KIND.busy, 'The mentor is mid-answer and the queue is full. Give it a moment.')
        return false
      }
      this.queue.push({ source, bubble })
      return true
    }
    void this._run({ source, bubble })
    return true
  }

  _drainNext(): void {
    const next = this.queue.shift()
    if (next) void this._run(next)
  }

  async _run({ source, bubble }: QueuedAsk): Promise<void> {
    this.busy = true
    this.turns += 1

    // Builders resolve here, when the turn starts, so a drained queue entry
    // reads live run state instead of the snapshot it was enqueued with.
    let prompt: string
    try {
      prompt = typeof source === 'function' ? await source() : source
    } catch (err) {
      this.busy = false
      this.turns -= 1
      this.onError(MENTOR_ERROR_KIND.failed, String(err instanceof Error ? err.message : err))
      this._drainNext()
      return
    }

    const args = [
      '-p',
      '--model', MODEL,
      '--tools', '',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--append-system-prompt', SYSTEM_PROMPT + LANGUAGE_RULES[this.locale],
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
      this.onError(
        MENTOR_ERROR_KIND.unavailable,
        err instanceof Error ? spawnErrorDetail(err as NodeJS.ErrnoException) : String(err)
      )
      // Drain anyway: a stuck queue would let later asks jump ahead of it.
      this._drainNext()
      return
    }

    let sawText = false
    let stderrTail = ''
    const finish = (kind: MentorErrorKind | 'done', detail = '') => {
      clearTimeout(watchdog)
      if (!this.busy) return
      this.busy = false
      if (kind === 'done') this.onDone()
      else this.onError(kind, detail)
      this._drainNext()
    }
    let watchdog = setTimeout(() => child.kill('SIGTERM'), INACTIVITY_MS)
    const poke = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => child.kill('SIGTERM'), INACTIVITY_MS)
    }

    child.on('error', (err) => {
      finish(MENTOR_ERROR_KIND.unavailable, spawnErrorDetail(err))
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
          this.onDelta(delta.text, bubble)
        }
      } else if (event.type === 'result') {
        // Fallback for runs where partial chunks were not emitted.
        if (!sawText && typeof event.result === 'string') {
          this.onDelta(event.result, bubble)
        }
      }
    })

    child.on('close', (code) => {
      if (code === 0) return finish('done')
      // Self-heal a vanished session (stale learn snapshot, cleaned ~/.claude,
      // CLI upgrade): drop the dead id and replay the SAME prompt on a fresh
      // session. Prompts are self-contained (board + transcript travel in
      // every turn), so the only loss is conversational memory. A fresh
      // --session-id turn cannot produce this error, so no retry loop.
      if (this.busy && NO_CONVERSATION_RE.test(stderrTail)) {
        clearTimeout(watchdog)
        this.busy = false
        this.turns -= 1
        this.sessionId = null
        void this._run({ source: prompt, bubble })
        return
      }
      finish(MENTOR_ERROR_KIND.failed, stderrTail || `claude exited with code ${code}`)
    })

    child.stdin.write(prompt)
    child.stdin.end()
  }
}

function formatTranscript(transcript: Array<{ command: string; output?: string }>): string {
  if (!transcript.length) return MENTOR_PROMPT.nothingTyped
  return transcript
    .map((t) => {
      const out = (t.output ?? '').trim()
      return out ? `$ ${t.command}\n${out}` : `$ ${t.command}`
    })
    .join('\n')
}

function formatChecks(checks: Check[]): string {
  if (!checks.length) return MENTOR_PROMPT.noneYet
  return checks
    .map(
      (c) =>
        `- ${c.pass ? MENTOR_PROMPT.checkPass : MENTOR_PROMPT.checkFail} ${c.name.en}: ${c.detail.en}`
    )
    .join('\n')
}

function triggerHeader(input: MentorPromptInput): string {
  const { phase, howClosed, trigger, clockSec, durationSec, playerQuestion } = input
  const question = playerQuestion?.trim() || MENTOR_PROMPT.noQuestion
  if (phase === MENTOR_PHASE.open) {
    const clock =
      clockSec != null ? ` ${Math.round(clockSec)}s left on the clock.` : ' No timer (learn mode).'
    const openLead = `${MENTOR_PROMPT.openAttempt} (${MENTOR_PROMPT.openGuardrail}).${clock}`
    if (trigger === MENTOR_TRIGGER.submitFail) {
      return `${openLead}
Validation failed. Give a Socratic nudge from the board and failed checks.`
    }
    return `${openLead}
${MENTOR_PROMPT.boardAuthoritative}
Player asks: ${question}
Answer Socratically in 1-2 sentences.`
  }

  const closedHow = howClosed ?? MENTOR_HOW_CLOSED.revealed
  const closed = `${MENTOR_PROMPT.closedAttempt} (${MENTOR_PROMPT.howClosedKey}: ${closedHow}). Teaching allowed.`
  if (trigger === MENTOR_TRIGGER.submitPass) {
    const dur = durationSec != null ? ` Solved in ${Math.round(durationSec)}s.` : ''
    return `${closed}${dur}
Congratulate briefly, name the ONE concept this scenario was about, then offer to answer questions.`
  }
  if (trigger === MENTOR_TRIGGER.timeout) {
    return `${closed}
Timer expired. Teach using the walkthrough, tied to what they tried.`
  }
  if (trigger === MENTOR_TRIGGER.reveal) {
    return `${closed}
Player revealed the solution. Teach using the walkthrough, tied to what they tried.`
  }
  return `${closed}
Player follow-up: ${question}
Answer concretely.`
}

/** Single Open/Closed context builder for every mentor entry point. */
export function buildMentorPrompt(input: MentorPromptInput): string {
  const { scenario, board, transcript, checks, phase, lostChecks } = input
  // Prompts always use canonical English content; the mentor answers in the
  // player's language on its own (see LANGUAGE_RULES).
  const parts = [
    triggerHeader(input),
    '',
    `${MENTOR_PROMPT.scenario} ${scenario.title.en}`,
    `${MENTOR_PROMPT.goal} ${scenario.objective.en}`,
    '',
    MENTOR_PROMPT.repoBoard,
    board || MENTOR_PROMPT.emptyBoard,
    '',
    MENTOR_PROMPT.transcript,
    formatTranscript(transcript),
    '',
    MENTOR_PROMPT.checks,
    formatChecks(checks),
  ]

  if (lostChecks?.length) {
    parts.push(
      '',
      'LOST CHECKS (unrecoverable): ' + lostChecks.map((n) => n.en).join('; ') + '.',
      'The uncommitted state these checks need was destroyed by one of the',
      "player's own commands (find it in the transcript). Real git cannot",
      'bring it back. Do NOT keep nudging toward these checks: say plainly',
      'what destroyed the work and why it is gone, and recommend restarting',
      'the attempt (learn mode has a "Wipe progress" button in the sidebar).'
    )
  }

  if (phase === MENTOR_PHASE.closed) {
    parts.push('', MENTOR_PROMPT.walkthrough, scenario.walkthrough)
  }

  return parts.join('\n')
}
