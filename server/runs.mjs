import { randomUUID } from 'node:crypto'
import { createArena } from '../engine/arena.mjs'
import { getChallenge } from '../challenges/index.mjs'

const HEARTBEAT_MS = 15_000

// In-memory run registry. One run = one attempt at one challenge by the local
// player. The browser executes commands locally for instant feedback; the
// server replays the transcript with the SAME engine to produce the
// authoritative verdict and the evidence: the exact code path CI will run
// in v2.
export class RunStore {
  constructor() {
    this.runs = new Map()
  }

  create({ challengeId, player }) {
    const challenge = getChallenge(challengeId)
    if (!challenge) return null
    const run = {
      id: randomUUID().slice(0, 8),
      challengeId,
      challenge,
      player,
      status: 'ready', // ready -> live -> passed | revealed
      transcript: [], // { command, output }
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

  get(id) {
    return this.runs.get(id)
  }

  addClient(run, res) {
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

  emit(run, event, data = {}) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const client of run.clients) client.write(frame)
  }

  start(run, onTimeout) {
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

  recordCommand(run, command, output) {
    run.transcript.push({ command, output: String(output ?? '').slice(0, 4000) })
  }

  // Authoritative verdict: fresh arena + transcript replay. Deterministic by
  // construction (fixed clocks), so browser and server always agree.
  async submit(run) {
    run.attempts += 1
    const arena = await createArena(run.challenge)
    for (const { command } of run.transcript) {
      await arena.exec(command)
    }
    const verdict = await arena.verdict()
    if (verdict.pass && run.status === 'live') {
      clearTimeout(run.timer)
      run.status = 'passed'
    }
    return verdict
  }

  finish(run) {
    clearTimeout(run.timer)
    for (const client of run.clients) client.end()
    this.runs.delete(run.id)
  }
}
