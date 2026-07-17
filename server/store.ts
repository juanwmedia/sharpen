import { appendFileSync, mkdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import type { Evidence, LeaderboardRow, Verdict } from '../engine/types.ts'
import type { Run } from './runs.ts'

const require = createRequire(import.meta.url)
const ENGINE_VERSION = (require('../package.json') as { version: string }).version

export const dataDir = process.env.SHARPEN_DATA_DIR ?? join(homedir(), '.sharpen')
const leaderboardPath = join(dataDir, 'leaderboard.json')
const evidenceDir = join(dataDir, 'evidence')

interface LeaderboardEntry {
  player: string
  /** Persisted schema-1 key: stays `challengeId` on disk (see Evidence). */
  challengeId: string
  pass: boolean
  durationMs: number
  attempts: number
  score: number
  runId: string
  stateHash: string
  date: string
}

interface LeaderboardFile {
  schema: number
  entries: LeaderboardEntry[]
}

async function ensureDirs(): Promise<void> {
  await mkdir(evidenceDir, { recursive: true })
}

// Append-only operational log: the mentor pipeline was undebuggable without
// it (stdout goes nowhere when the server runs detached).
const logPath = join(dataDir, 'server.log')
export function slog(message: string): void {
  try {
    mkdirSync(dataDir, { recursive: true })
    appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`)
  } catch {
    /* logging must never break the game */
  }
}

// Evidence is the unit of trust for the ranking. It already carries every
// field v2's CI replay validation needs (nonce stays null until v3).
export async function saveEvidence(run: Run, verdict: Verdict): Promise<Evidence> {
  await ensureDirs()
  const evidence: Evidence = {
    schema: 1,
    engineVersion: ENGINE_VERSION,
    runId: run.id,
    challengeId: run.scenarioId,
    scenarioVersion: run.scenario.version,
    player: run.player,
    // Evidence is only written for runs that have started, so startedAt is set.
    startedAt: run.startedAt!,
    submittedAt: Date.now(),
    durationMs: Date.now() - run.startedAt!,
    attempts: run.attempts,
    transcript: run.transcript.map((t) => t.command),
    pass: verdict.pass,
    checks: verdict.checks,
    stateHash: verdict.stateHash,
    nonce: null,
  }
  await writeFile(join(evidenceDir, `${run.id}.json`), JSON.stringify(evidence, null, 2))
  return evidence
}

async function loadLeaderboard(): Promise<LeaderboardFile> {
  try {
    return JSON.parse(await readFile(leaderboardPath, 'utf8')) as LeaderboardFile
  } catch {
    return { schema: 1, entries: [] }
  }
}

// Scoring policy v1 (documented in README; versioned with the engine):
// pass => max(10, 100 - seconds elapsed). Fail/timeout => 0 (evidence is
// still recorded). No attempt penalty: every Enter validates by design, so
// "attempts" measures commands, not deliberate tries.
export function scoreFor({ pass, durationMs }: { pass: boolean; durationMs: number }): number {
  if (!pass) return 0
  return Math.max(10, 100 - Math.floor(durationMs / 1000))
}

export async function recordResult(evidence: Evidence): Promise<void> {
  await ensureDirs()
  const board = await loadLeaderboard()
  board.entries.push({
    player: evidence.player,
    challengeId: evidence.challengeId,
    pass: evidence.pass,
    durationMs: evidence.durationMs,
    attempts: evidence.attempts,
    score: scoreFor(evidence),
    runId: evidence.runId,
    stateHash: evidence.stateHash,
    date: new Date(evidence.submittedAt).toISOString(),
  })
  await writeFile(leaderboardPath, JSON.stringify(board, null, 2))
}

export async function leaderboard(): Promise<LeaderboardRow[]> {
  const board = await loadLeaderboard()
  const byPlayer = new Map<string, LeaderboardRow>()
  for (const entry of board.entries) {
    const agg = byPlayer.get(entry.player) ?? {
      player: entry.player,
      score: 0,
      solved: 0,
      attempts: 0,
      bestMs: null,
    }
    agg.score += entry.score
    agg.attempts += 1
    if (entry.pass) {
      agg.solved += 1
      if (agg.bestMs === null || entry.durationMs < agg.bestMs) agg.bestMs = entry.durationMs
    }
    byPlayer.set(entry.player, agg)
  }
  return [...byPlayer.values()].sort((a, b) => b.score - a.score)
}

export { ENGINE_VERSION }
