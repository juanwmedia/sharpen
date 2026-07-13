import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { MAX_TURNS, Mentor } from '../server/mentor.ts'
import type { SpawnFn } from '../server/mentor.ts'

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
    this.killedWith = signal ?? null
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

  it('rejects asks beyond the turn budget with mentor-budget', async () => {
    const { mentor, children, onError } = harness()

    for (let i = 0; i < MAX_TURNS; i++) {
      expect(mentor.ask(`q${i}`)).toBe(true)
      await complete(children[i]!)
    }
    expect(children).toHaveLength(MAX_TURNS)

    expect(mentor.ask('one too many')).toBe(false)
    expect(onError).toHaveBeenCalledWith('mentor-budget', expect.stringContaining('turn budget'))
    expect(children).toHaveLength(MAX_TURNS)
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
})
