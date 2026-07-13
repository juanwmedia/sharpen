import { randomUUID } from 'node:crypto'
import type { Response } from 'express'
import { createArena } from '../engine/arena.ts'
import { getChallenge } from '../challenges/index.ts'
import type { Challenge, Verdict } from '../engine/types.ts'
import type { Mentor } from './mentor.ts'

const HEARTBEAT_MS = 15_000

export type RunStatus = 'ready' | 'live' | 'passed' | 'revealed'

export interface TranscriptEntry {
  command: string
  output: string
}

export interface Run {
  id: string
  challengeId: string
  challenge: Challenge
  player: string
  status: RunStatus
  transcript: TranscriptEntry[]
  attempts: number
  startedAt: number | null
  deadline: number | null
  timer: NodeJS.Timeout | null
  clients: Set<Response>
  mentor: Mentor | null
}

// In-memory run registry. One run = one attempt at one challenge by the local
// player. The browser executes commands locally for instant feedback; the
// server replays the transcript with the SAME engine to produce the
// authoritative verdict and the evidence: the exact code path CI will run
// in v2.
export class RunStore {
  runs = new Map<string, Run>()

  create({ challengeId, player }: { challengeId: string; player: string }): Run | null {
    const challenge = getChallenge(challengeId)
    if (!challenge) return null
    const run: Run = {
      id: randomUUID().slice(0, 8),
      challengeId,
      challenge,
      player,
      status: 'ready', // ready -> live -> passed | revealed
      transcript: [],
      attempts: 0,
      startedAt: null,
      deadline: null,
      timer: null,
      clients: new Set(),
      mentor: null,
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

  emit(run: Run, event: string, data: unknown = {}): void {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const client of run.clients) client.write(frame)
  }

  start(run: Run, onTimeout: (run: Run) => void): Run {
    if (run.status !== 'ready') return run
    run.status = 'live'
    run.startedAt = Date.now()
    run.deadline = run.startedAt + run.challenge.timeLimitMs
    run.timer = setTimeout(() => {
      if (run.status === 'live') {
        run.status = 'revealed'
        onTimeout(run)
      }
    }, run.challenge.timeLimitMs)
    this.emit(run, 'started', { startedAt: run.startedAt, deadline: run.deadline })
    return run
  }

  recordCommand(run: Run, command: string, output: unknown): void {
    run.transcript.push({ command, output: String(output ?? '').slice(0, 4000) })
  }

  // Authoritative verdict: fresh arena + transcript replay. Deterministic by
  // construction (fixed clocks), so browser and server always agree.
  async submit(run: Run): Promise<Verdict> {
    run.attempts += 1
    const arena = await createArena(run.challenge)
    for (const { command } of run.transcript) {
      await arena.exec(command)
    }
    const verdict = await arena.verdict()
    if (verdict.pass && run.status === 'live') {
      clearTimeout(run.timer ?? undefined)
      run.status = 'passed'
    }
    return verdict
  }

  finish(run: Run): void {
    clearTimeout(run.timer ?? undefined)
    for (const client of run.clients) client.end()
    this.runs.delete(run.id)
  }
}
