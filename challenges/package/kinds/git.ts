import type { Challenge, ChallengeAssertContext, ChallengeSetupEnv, Check } from '../../../engine/types.ts'
import type { GitScenarioSpec, ParsedScenarioMd } from '../types.ts'
import { DEFAULT_TIME_LIMIT_MS } from '../types.ts'

export type ChallengeSetup = (env: ChallengeSetupEnv) => Promise<void>
export type ChallengeAssert = (
  ctx: ChallengeAssertContext
) => Promise<{ pass: boolean; checks: Check[] }>

function parseGitSpec(spec: Record<string, unknown> | undefined): GitScenarioSpec {
  if (!spec || typeof spec.tree !== 'string' || !spec.tree.trim()) {
    throw new Error('scenario.md: kind "git" requires spec.tree (non-empty string)')
  }
  return { tree: spec.tree.replace(/\n$/, '') }
}

export function assembleGitChallenge(
  parsed: ParsedScenarioMd,
  walkthroughSrc: string,
  setup: ChallengeSetup,
  assert: ChallengeAssert
): Challenge {
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
