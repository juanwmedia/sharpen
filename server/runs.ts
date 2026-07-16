import { randomUUID } from 'node:crypto'
import type { Response } from 'express'
import { createArena } from '../engine/arena.ts'
import { getChallenge } from '../challenges/index.ts'
import type { Snapshot } from '../engine/types.ts'
import {
  ARENA_EVENT,
  DEFAULT_LOCALE,
  DEFAULT_RUN_MODE,
  MENTOR_BUBBLE,
  type ArenaEventName,
  type Challenge,
  type Locale,
  type MentorBubble,
  type RunMode,
  type Verdict,
} from '../engine/types.ts'
import type { Mentor } from './mentor.ts'
import type { LearnStatus } from './learn.ts'

const HEARTBEAT_MS = 15_000
const RUN_ID_CHARS = 8
/** Cap on stored per-command output: it feeds mentor prompts and evidence. */
export const TRANSCRIPT_OUTPUT_MAX_CHARS = 4000

export const RUN_STATUS = {
  ready: 'ready',
  live: 'live',
  passed: 'passed',
  revealed: 'revealed',
} as const
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS]

export interface TranscriptEntry {
  command: string
  output: string
}

export interface Run {
  id: string
  challengeId: string
  challenge: Challenge
  player: string
  /** UI language of the player; the mentor answers in it. */
  locale: Locale
  /** Learn: no timer, no local ranking. Challenge: timed + evidence. */
  mode: RunMode
  status: RunStatus
  transcript: TranscriptEntry[]
  attempts: number
  startedAt: number | null
  deadline: number | null
  timer: NodeJS.Timeout | null
  clients: Set<Response>
  mentor: Mentor | null
  /** Bubble kind for the mentor turn currently streaming (or next ask). */
  mentorBubble: MentorBubble
  /** Seeds for Mentor when restoring a learn session. */
  mentorSessionId: string | null
  mentorTurns: number
  /** Applied in start() after going live (learn restore of a finished run). */
  restoredStatus: LearnStatus | null
}

// In-memory run registry. One run = one attempt at one challenge by the local
// player. The browser executes commands locally for instant feedback; the
// server replays the transcript with the SAME engine to produce the
// authoritative verdict and the evidence: the exact code path CI will run
// in v2.
export class RunStore {
  runs = new Map<string, Run>()

  create({
    challengeId,
    player,
    locale,
    mode,
  }: {
    challengeId: string
    player: string
    locale?: Locale
    mode?: RunMode
  }): Run | null {
    const challenge = getChallenge(challengeId)
    if (!challenge) return null
    const run: Run = {
      id: randomUUID().slice(0, RUN_ID_CHARS),
      challengeId,
      challenge,
      player,
      locale: locale ?? DEFAULT_LOCALE,
      mode: mode ?? DEFAULT_RUN_MODE,
      status: RUN_STATUS.ready, // ready -> live -> passed | revealed
      transcript: [],
      attempts: 0,
      startedAt: null,
      deadline: null,
      timer: null,
      clients: new Set(),
      mentor: null,
      mentorBubble: MENTOR_BUBBLE.mentor,
      mentorSessionId: null,
      mentorTurns: 0,
      restoredStatus: null,
    }
    this.runs.set(run.id, run)
    return run
  }

  get(id: string): Run | undefined {
    return this.runs.get(id)
  }

  addClient(run: Run, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write(': connected\n\n')
    const heartbeat = setInterval(() => res.write(': keepalive\n\n'), HEARTBEAT_MS)
    run.clients.add(res)
    res.on('close', () => {
      clearInterval(heartbeat)
      run.clients.delete(res)
    })
  }

  emit(run: Run, event: ArenaEventName, data: unknown = {}): void {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const client of run.clients) client.write(frame)
  }

  start(run: Run, onTimeout: (run: Run) => void): Run {
    if (run.status !== RUN_STATUS.ready) return run
    run.status = RUN_STATUS.live
    run.startedAt = Date.now()
    if (run.mode === 'challenge') {
      run.deadline = run.startedAt + run.challenge.timeLimitMs
      run.timer = setTimeout(() => {
        if (run.status === RUN_STATUS.live) {
          run.status = RUN_STATUS.revealed
          onTimeout(run)
        }
      }, run.challenge.timeLimitMs)
    }
    this.emit(run, ARENA_EVENT.started, { startedAt: run.startedAt, deadline: run.deadline })
    if (run.restoredStatus === 'passed' || run.restoredStatus === 'revealed') {
      run.status = run.restoredStatus
    }
    run.restoredStatus = null
    return run
  }

  /** Learn restore: inject transcript + mentor seeds while still ready for start(). */
  restore(
    run: Run,
    {
      transcript,
      status,
      mentorSessionId,
      mentorTurns,
    }: {
      transcript: TranscriptEntry[]
      status: LearnStatus
      mentorSessionId: string | null
      mentorTurns: number
    }
  ): boolean {
    if (run.mode !== 'learn' || run.status !== RUN_STATUS.ready) return false
    run.transcript = transcript.map((t) => ({
      command: t.command,
      output: String(t.output ?? '').slice(0, TRANSCRIPT_OUTPUT_MAX_CHARS),
    }))
    run.mentorSessionId = mentorSessionId
    run.mentorTurns = Math.max(0, mentorTurns)
    run.restoredStatus = status === 'passed' || status === 'revealed' ? status : null
    return true
  }

  /** Learn-mode voluntary reveal: same mentor teach path as challenge timeout,
   * without evidence or leaderboard side effects. */
  reveal(run: Run): boolean {
    if (run.mode !== 'learn' || run.status !== RUN_STATUS.live) return false
    run.status = RUN_STATUS.revealed
    return true
  }

  recordCommand(run: Run, command: string, output: unknown): void {
    run.transcript.push({ command, output: String(output ?? '').slice(0, TRANSCRIPT_OUTPUT_MAX_CHARS) })
  }

  /** Replay transcript into a fresh arena. No attempt counter / status side effects. */
  async replay(run: Run): Promise<{ snapshot: Snapshot; verdict: Verdict }> {
    const arena = await createArena(run.challenge)
    for (const { command } of run.transcript) {
      await arena.exec(command)
    }
    const [snapshot, verdict] = await Promise.all([arena.snapshot(), arena.verdict()])
    return { snapshot, verdict }
  }

  /** Mentor context: current board + checks without counting a submit. */
  async inspect(run: Run): Promise<{ snapshot: Snapshot; verdict: Verdict }> {
    return this.replay(run)
  }

  // Authoritative verdict: fresh arena + transcript replay. Deterministic by
  // construction (fixed clocks), so browser and server always agree.
  async submit(run: Run): Promise<{ snapshot: Snapshot; verdict: Verdict }> {
    run.attempts += 1
    const result = await this.replay(run)
    if (result.verdict.pass && run.status === RUN_STATUS.live) {
      clearTimeout(run.timer ?? undefined)
      run.status = RUN_STATUS.passed
    }
    return result
  }

  finish(run: Run): void {
    clearTimeout(run.timer ?? undefined)
    for (const client of run.clients) client.end()
    this.runs.delete(run.id)
  }
}
