import cleanSweep from './git/clean-sweep.ts'
import type { Challenge, ChallengeSummary } from '../engine/types.ts'

// Single registry consumed by the web bundle (setup + local execution) and the
// server (authoritative replay validation). Order defines display order.
export const challenges: Challenge[] = [cleanSweep]

export function getChallenge(id: string): Challenge | undefined {
  return challenges.find((c) => c.id === id)
}

export function challengeSummaries(): ChallengeSummary[] {
  return challenges.map(({ id, pack, title, difficulty, timeLimitMs, statement, focusCommands }) => ({
    id,
    pack,
    title,
    difficulty,
    timeLimitMs,
    statement,
    focusCommands,
  }))
}
