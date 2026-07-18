import abortTheExperiment from './git/abort-the-experiment/index.ts'
import cleanSweep from './git/clean-sweep/index.ts'
import halfDeleted from './git/half-deleted/index.ts'
import leakedSecret from './git/leaked-secret/index.ts'
import shipOnlyTheFix from './git/ship-only-the-fix/index.ts'
import theVanishedFile from './git/the-vanished-file/index.ts'
import wrongBranchWetPaint from './git/wrong-branch-wet-paint/index.ts'
import { slugify } from './slug.ts'
import type { Scenario, ScenarioSummary } from '../engine/types.ts'

// Single registry consumed by the web bundle (setup + local execution) and the
// server (authoritative replay validation). Order defines display order and is
// curated easy to hard: concept progression, not alphabet.
// The two restore-family scenarios (vanished file, abort experiment) are
// deliberately non-adjacent: same command, different situation, spaced reps.
export const scenarios: Scenario[] = [
  theVanishedFile,
  leakedSecret,
  shipOnlyTheFix,
  wrongBranchWetPaint,
  abortTheExperiment,
  halfDeleted,
  cleanSweep,
]

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find((c) => c.id === id)
}

export function getScenarioBySlug(slug: string): Scenario | undefined {
  return scenarios.find((c) => slugify(c.title.en) === slug)
}

/** Resolve a public URL /:pack/:slug to a registered scenario. */
export function getScenarioByPackSlug(pack: string, slug: string): Scenario | undefined {
  return scenarios.find((c) => c.pack === pack && slugify(c.title.en) === slug)
}

export function scenarioSummaries(): ScenarioSummary[] {
  return scenarios.map(({ id, kind, pack, title, difficulty, timeLimitMs, briefing, tree, objective, themes }) => ({
    id,
    kind,
    pack,
    title,
    difficulty,
    timeLimitMs,
    briefing,
    tree,
    objective,
    themes,
  }))
}
