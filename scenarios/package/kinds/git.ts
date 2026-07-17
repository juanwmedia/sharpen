import type { Scenario, ScenarioAssertContext, ScenarioSetupEnv, Check } from '../../../engine/types.ts'
import type { GitScenarioSpec, ParsedScenarioMd } from '../types.ts'
import { DEFAULT_TIME_LIMIT_MS } from '../types.ts'

export type ScenarioSetup = (env: ScenarioSetupEnv) => Promise<void>
export type ScenarioAssert = (
  ctx: ScenarioAssertContext
) => Promise<{ pass: boolean; checks: Check[] }>

function parseGitSpec(spec: Record<string, unknown> | undefined): GitScenarioSpec {
  if (!spec || typeof spec.tree !== 'string' || !spec.tree.trim()) {
    throw new Error('scenario.md: kind "git" requires spec.tree (non-empty string)')
  }
  return { tree: spec.tree.replace(/\n$/, '') }
}

export function assembleGitScenario(
  parsed: ParsedScenarioMd,
  walkthroughSrc: string,
  setup: ScenarioSetup,
  assert: ScenarioAssert
): Scenario {
  const { manifest, briefing, objective } = parsed
  const { tree } = parseGitSpec(manifest.spec)
  const walkthrough = walkthroughSrc.trim()
  if (!walkthrough) throw new Error('walkthrough.md: body is empty')

  return {
    id: manifest.id,
    pack: manifest.pack,
    title: manifest.title,
    difficulty: manifest.difficulty,
    timeLimitMs: manifest.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS,
    briefing,
    tree,
    objective,
    themes: manifest.themes ?? [],
    walkthrough,
    setup,
    assert,
  }
}
