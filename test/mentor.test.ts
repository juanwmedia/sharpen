import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import cleanSweep from '../scenarios/git/clean-sweep/index.ts'
import tipJar from '../scenarios/ts/tip-jar-lies/index.ts'
import { MENTOR_BUBBLE } from '../engine/types.ts'
import {
  buildMentorPrompt,
  Mentor,
  MENTOR_HOW_CLOSED,
  MENTOR_PHASE,
  MENTOR_PROMPT,
  MENTOR_TRIGGER,
  MENTOR_TURN_TIMEOUT_MS,
} from '../server/mentor.ts'
import type { SpawnFn } from '../server/mentor.ts'

const boardSample = `branch: main
untracked: build.log, notes/ideas.md
modified: src/api/client.ts
staged: (none)`

const failChecks = [
  {
    name: { en: 'No untracked files remain', es: 'x' },
    pass: false,
    detail: { en: 'still untracked: build.log', es: 'x' },
  },
]

// EventEmitter-based fake of the spawned claude CLI: real streams so the
// mentor's readline wiring is exercised, no real process.
class FakeChild extends EventEmitter {
  stdinData = ''
  stdinEnded = false
  stdin = {
    write: (data: string) => {
      this.stdinData += data
    },
    end: () => {
      this.stdinEnded = true
    },
  }
  stdout = new PassThrough()
  stderr = new PassThrough()
  killedWith: string | null = null
  kill(signal?: string) {
    // Mirror a real child: kill eventually yields close. Ignore repeat kills
    // (SIGTERM then SIGKILL grace) so finish/retry logic sees one close.
    if (this.killedWith !== null) return true
    this.killedWith = signal ?? null
    queueMicrotask(() => this.emit('close', 143))
    return true
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

function harness() {
  const children: FakeChild[] = []
  const spawnFn: SpawnFn = () => {
    const child = new FakeChild()
    children.push(child)
    return child
  }
  const onDelta = vi.fn()
  const onDone = vi.fn()
  const onError = vi.fn()
  const mentor = new Mentor({ onDelta, onDone, onError, spawnFn })
  return { mentor, children, onDelta, onDone, onError }
}

// Streams the answer, then exits. The tick between stdout and close mirrors
// the real process, where output always lands before the exit event.
async function complete(child: FakeChild, { code = 0, text = 'answer' } = {}) {
  if (code === 0) {
    child.stdout.write(JSON.stringify({ type: 'result', result: text }) + '\n')
  }
  child.stdout.end()
  await tick()
  child.emit('close', code)
  await tick()
}

describe('Mentor queue', () => {
  it('resumes a seeded sessionId with --resume on the first spawn', async () => {
    const children: FakeChild[] = []
    const spawnFn: SpawnFn = (_cmd, args) => {
      const child = new FakeChild()
      ;(child as FakeChild & { args: string[] }).args = args
      children.push(child)
      return child
    }
    const mentor = new Mentor({
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      spawnFn,
      sessionId: 'restored-session',
      turns: 3,
    })
    expect(mentor.sessionId).toBe('restored-session')
    expect(mentor.turns).toBe(3)
    mentor.ask('follow-up')
    expect(children).toHaveLength(1)
    const args = (children[0] as FakeChild & { args: string[] }).args
    expect(args).toContain('--resume')
    expect(args).toContain('restored-session')
    expect(args).not.toContain('--session-id')
    await complete(children[0]!)
    expect(mentor.turns).toBe(4)
  })

  it('self-heals a vanished session: retries the same prompt on a fresh session', async () => {
    const children: Array<FakeChild & { args?: string[] }> = []
    const spawnFn: SpawnFn = (_cmd, args) => {
      const child = new FakeChild() as FakeChild & { args?: string[] }
      child.args = args
      children.push(child)
      return child
    }
    const onDone = vi.fn()
    const onError = vi.fn()
    const mentor = new Mentor({
      onDelta: vi.fn(),
      onDone,
      onError,
      spawnFn,
      sessionId: 'gone-session',
      turns: 3,
    })

    mentor.ask('nudge me')
    expect(children).toHaveLength(1)
    expect(children[0]!.args).toContain('--resume')

    // claude cannot find the session: the exact failure a stale learn
    // snapshot (or a cleaned ~/.claude) produces.
    children[0]!.stderr.write('No conversation found with session ID: gone-session')
    await tick()
    await complete(children[0]!, { code: 1 })

    // The mentor dropped the dead id and replayed the SAME prompt fresh.
    expect(children).toHaveLength(2)
    expect(children[1]!.args).toContain('--session-id')
    expect(children[1]!.args).not.toContain('gone-session')
    expect(children[1]!.stdinData).toBe('nudge me')

    await complete(children[1]!)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(mentor.sessionId).not.toBe('gone-session')
    // The healed turn counts once, not twice.
    expect(mentor.turns).toBe(4)
  })

  it('drains three rapid asks serially, in order', async () => {
    const { mentor, children, onDone } = harness()

    expect(mentor.ask('q1')).toBe(true)
    expect(mentor.ask('q2')).toBe(true)
    expect(mentor.ask('q3')).toBe(true)

    // Only the first turn spawns; the rest wait in the queue.
    expect(children).toHaveLength(1)
    expect(children[0]!.stdinData).toBe('q1')
    expect(children[0]!.stdinEnded).toBe(true)

    await complete(children[0]!)
    expect(children).toHaveLength(2)
    expect(children[1]!.stdinData).toBe('q2')

    await complete(children[1]!)
    expect(children).toHaveLength(3)
    expect(children[2]!.stdinData).toBe('q3')

    await complete(children[2]!)
    expect(children).toHaveLength(3)
    expect(onDone).toHaveBeenCalledTimes(3)
    expect(mentor.queue).toHaveLength(0)
  })

  it('coalesce: true while busy merges into the ongoing turn instead of queueing', async () => {
    const { mentor, children, onError } = harness()

    mentor.ask('q1')
    expect(mentor.ask('hint about the same failure', { coalesce: true })).toBe(true)
    expect(mentor.queue).toHaveLength(0)

    await complete(children[0]!)
    // Nothing was enqueued, so nothing new spawns.
    expect(children).toHaveLength(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('has no turn budget: every ask keeps spawning, in any quantity', async () => {
    const { mentor, children, onError } = harness()

    // Well past the old cap of 8: the mentor runs on the player's own
    // subscription, so nothing rations it.
    for (let i = 0; i < 12; i++) {
      expect(mentor.ask(`q${i}`)).toBe(true)
      await complete(children[i]!)
    }
    expect(children).toHaveLength(12)
    expect(mentor.turns).toBe(12)
    expect(onError).not.toHaveBeenCalled()
  })

  it('resolves queued prompt builders at drain time, not enqueue time', async () => {
    const { mentor, children } = harness()

    mentor.ask('q1')
    let board = 'stale'
    const builder = vi.fn(async () => `state: ${board}`)
    expect(mentor.ask(builder)).toBe(true)
    expect(builder).not.toHaveBeenCalled()

    // The state moves while the question waits in the queue.
    board = 'fresh'
    await complete(children[0]!)
    await tick()
    expect(builder).toHaveBeenCalledTimes(1)
    expect(children[1]!.stdinData).toBe('state: fresh')
    await complete(children[1]!)
  })

  it('the bubble kind travels with each turn, not with the latest ask', async () => {
    const { mentor, children, onDelta } = harness()

    mentor.ask('q1')
    mentor.ask('reveal it', { bubble: MENTOR_BUBBLE.reveal })

    // Deltas of the first turn keep its bubble even though a reveal ask is
    // already queued behind it.
    children[0]!.stdout.write(
      JSON.stringify({ type: 'stream_event', event: { delta: { type: 'text_delta', text: 'hi' } } }) + '\n'
    )
    await tick()
    expect(onDelta).toHaveBeenLastCalledWith('hi', MENTOR_BUBBLE.mentor)
    await complete(children[0]!)

    children[1]!.stdout.write(
      JSON.stringify({ type: 'stream_event', event: { delta: { type: 'text_delta', text: 'walkthrough' } } }) + '\n'
    )
    await tick()
    expect(onDelta).toHaveBeenLastCalledWith('walkthrough', MENTOR_BUBBLE.reveal)
    await complete(children[1]!)
  })

  it('surfaces the stderr tail on non-zero exit and still drains the queue', async () => {
    const { mentor, children, onError } = harness()

    mentor.ask('q1')
    mentor.ask('q2') // queued behind the failing turn
    expect(children).toHaveLength(1)

    children[0]!.stderr.write('claude: out of credits')
    await tick()
    await complete(children[0]!, { code: 2 })

    expect(onError).toHaveBeenCalledWith('mentor-error', expect.stringContaining('out of credits'))
    // The failure freed the slot: the queued question runs next.
    expect(children).toHaveLength(2)
    expect(children[1]!.stdinData).toBe('q2')
  })

  it('text-timeout kills only the spawned child, retries once, then errors', async () => {
    vi.useFakeTimers()
    const children: FakeChild[] = []
    const spawnFn: SpawnFn = () => {
      const child = new FakeChild()
      children.push(child)
      return child
    }
    const onDone = vi.fn()
    const onError = vi.fn()
    const mentor = new Mentor({
      onDelta: vi.fn(),
      onDone,
      onError,
      spawnFn,
      turnTimeoutMs: 30,
    })

    mentor.ask('stuck question')
    expect(children).toHaveLength(1)

    // Non-text stream noise must NOT reset the watchdog.
    children[0]!.stdout.write(
      JSON.stringify({ type: 'stream_event', event: { delta: { type: 'input_json_delta' } } }) + '\n'
    )
    await vi.advanceTimersByTimeAsync(30)
    await Promise.resolve() // close microtask from kill → silent retry

    expect(children[0]!.killedWith).toBe('SIGTERM')
    expect(children).toHaveLength(2)
    expect(children[1]!.stdinData).toBe('stuck question')
    expect(onError).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(30)
    await Promise.resolve()

    expect(children[1]!.killedWith).toBe('SIGTERM')
    expect(onError).toHaveBeenCalledWith('mentor-error', expect.stringContaining('timed out'))
    expect(onDone).not.toHaveBeenCalled()
    expect(children).toHaveLength(2)

    vi.useRealTimers()
  })

  it('text-timeout after a partial answer keeps the reply instead of retrying', async () => {
    vi.useFakeTimers()
    const children: FakeChild[] = []
    const spawnFn: SpawnFn = () => {
      const child = new FakeChild()
      children.push(child)
      return child
    }
    const onDelta = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()
    const mentor = new Mentor({
      onDelta,
      onDone,
      onError,
      spawnFn,
      turnTimeoutMs: 30,
    })

    mentor.ask('slow closer')
    children[0]!.stdout.write(
      JSON.stringify({
        type: 'stream_event',
        event: { delta: { type: 'text_delta', text: 'Almost there' } },
      }) + '\n'
    )
    await Promise.resolve()

    await vi.advanceTimersByTimeAsync(30)
    await Promise.resolve()

    expect(onDelta).toHaveBeenCalledWith('Almost there', MENTOR_BUBBLE.mentor)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(children).toHaveLength(1)

    vi.useRealTimers()
  })

  it('exports a 30s default turn timeout', () => {
    expect(MENTOR_TURN_TIMEOUT_MS).toBe(30_000)
  })
})

describe('buildMentorPrompt', () => {
  it('Open + chat includes board and objective, never walkthrough', () => {
    const prompt = buildMentorPrompt({
      phase: MENTOR_PHASE.open,
      trigger: MENTOR_TRIGGER.chat,
      scenario: cleanSweep,
      board: boardSample,
      transcript: [],
      checks: [],
      clockSec: null,
      playerQuestion: 'hola',
    })
    expect(prompt).toContain(MENTOR_PROMPT.openAttempt)
    expect(prompt).toContain(MENTOR_PROMPT.boardAuthoritative)
    expect(prompt).toContain(cleanSweep.title.en)
    expect(prompt).toContain(cleanSweep.objective.en.slice(0, 40))
    expect(prompt).toContain(MENTOR_PROMPT.repoBoard)
    expect(prompt).toContain('untracked: build.log')
    expect(prompt).toContain(MENTOR_PROMPT.nothingTyped)
    expect(prompt).toContain(MENTOR_PROMPT.transcriptTerminal)
    expect(prompt).toContain('hola')
    expect(prompt).not.toContain(cleanSweep.walkthrough.slice(0, 30))
    expect(prompt).not.toContain(MENTOR_PROMPT.walkthrough)
  })

  it('TS runs label the workspace transcript and redact writefile b64', () => {
    const prompt = buildMentorPrompt({
      phase: MENTOR_PHASE.open,
      trigger: MENTOR_TRIGGER.submitFail,
      scenario: tipJar,
      board: 'files: src/tip.ts',
      transcript: [
        {
          command: 'writefile src/tip.ts b64:YWJjZGVmZ2g=',
          output: '',
        },
        { command: 'run src/tip.ts formatTip 100', output: '=> "$1.00"' },
      ],
      checks: [],
      clockSec: 30,
    })
    expect(prompt).toContain(MENTOR_PROMPT.transcriptWorkspace)
    expect(prompt).toContain('writefile src/tip.ts (edited, 12 b64 chars)')
    expect(prompt).not.toContain('b64:YWJj')
    expect(prompt).toContain('$ run src/tip.ts formatTip 100')
  })

  it('Open + submitFail includes failed checks and board', () => {
    const prompt = buildMentorPrompt({
      phase: MENTOR_PHASE.open,
      trigger: MENTOR_TRIGGER.submitFail,
      scenario: cleanSweep,
      board: boardSample,
      transcript: [{ command: 'git status', output: '...' }],
      checks: failChecks,
      clockSec: 42,
    })
    expect(prompt).toContain('Validation failed')
    expect(prompt).toContain(`${MENTOR_PROMPT.checkFail} No untracked files remain`)
    expect(prompt).toContain('$ git status')
    expect(prompt).toContain('42s left')
    expect(prompt).toContain(MENTOR_PROMPT.repoBoard)
  })

  it('Closed + revealed includes walkthrough and howClosed', () => {
    const prompt = buildMentorPrompt({
      phase: MENTOR_PHASE.closed,
      howClosed: MENTOR_HOW_CLOSED.revealed,
      trigger: MENTOR_TRIGGER.reveal,
      scenario: cleanSweep,
      board: boardSample,
      transcript: [],
      checks: failChecks,
    })
    expect(prompt).toContain(MENTOR_PROMPT.closedAttempt)
    expect(prompt).toContain(`${MENTOR_PROMPT.howClosedKey}: ${MENTOR_HOW_CLOSED.revealed}`)
    expect(prompt).toContain(MENTOR_PROMPT.walkthrough)
    expect(prompt).toContain(cleanSweep.walkthrough.slice(0, 40))
  })

  it('Closed + passed includes walkthrough, passed, and duration', () => {
    const prompt = buildMentorPrompt({
      phase: MENTOR_PHASE.closed,
      howClosed: MENTOR_HOW_CLOSED.passed,
      trigger: MENTOR_TRIGGER.submitPass,
      scenario: cleanSweep,
      board: boardSample,
      transcript: [{ command: 'git clean -fd' }],
      checks: failChecks.map((c) => ({ ...c, pass: true, detail: { en: 'ok', es: 'ok' } })),
      durationSec: 12,
    })
    expect(prompt).toContain(`${MENTOR_PROMPT.howClosedKey}: ${MENTOR_HOW_CLOSED.passed}`)
    expect(prompt).toContain('Solved in 12s')
    expect(prompt).toContain(MENTOR_PROMPT.walkthrough)
    expect(prompt).toContain('Congratulate briefly')
    expect(prompt).toContain('craft opportunity')
    expect(prompt).toContain('skip the opportunity')
  })
})
