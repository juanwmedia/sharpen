import cleanSweep from './git/clean-sweep.ts'
import { slugify } from './slug.ts'
import type { Challenge, ChallengeSummary } from '../engine/types.ts'

// Single registry consumed by the web bundle (setup + local execution) and the
// server (authoritative replay validation). Order defines display order.
export const challenges: Challenge[] = [cleanSweep]

export function getChallenge(id: string): Challenge | undefined {
  return challenges.find((c) => c.id === id)
}

export function getChallengeBySlug(slug: string): Challenge | undefined {
  return challenges.find((c) => slugify(c.title) === slug)
}

/** Resolve a public URL /:pack/:slug to a registered scenario. */
export function getChallengeByPackSlug(pack: string, slug: string): Challenge | undefined {
  return challenges.find((c) => c.pack === pack && slugify(c.title) === slug)
}

export function challengeSummaries(): ChallengeSummary[] {
  return challenges.map(({ id, pack, title, difficulty, timeLimitMs, statement, themes }) => ({
    id,
    pack,
    title,
    difficulty,
    timeLimitMs,
    statement,
    themes,
  }))
}
