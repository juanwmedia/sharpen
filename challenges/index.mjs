import cleanSweep from './git/clean-sweep.mjs'

// Single registry consumed by the web bundle (setup + local execution) and the
// server (authoritative replay validation). Order defines display order.
export const challenges = [cleanSweep]

export function getChallenge(id) {
  return challenges.find((c) => c.id === id)
}

export function challengeSummaries() {
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
