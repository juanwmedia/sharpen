import cleanSweep from './git/clean-sweep/index.ts'
import { slugify } from './slug.ts'
import type { Scenario, ScenarioSummary } from '../engine/types.ts'

// Single registry consumed by the web bundle (setup + local execution) and the
// server (authoritative replay validation). Order defines display order.
export const scenarios: Scenario[] = [cleanSweep]

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find((c) => c.id === id)
}

export function getScenarioBySlug(slug: string): Scenario | undefined {
  return scenarios.find((c) => slugify(c.title) === slug)
}

/** Resolve a public URL /:pack/:slug to a registered scenario. */
export function getScenarioByPackSlug(pack: string, slug: string): Scenario | undefined {
  return scenarios.find((c) => c.pack === pack && slugify(c.title) === slug)
}

export function scenarioSummaries(): ScenarioSummary[] {
  return scenarios.map(({ id, pack, title, difficulty, timeLimitMs, briefing, tree, objective, themes }) => ({
    id,
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
