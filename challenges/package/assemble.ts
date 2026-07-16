import type { Challenge } from '../../engine/types.ts'
import { assembleGitChallenge, type ChallengeAssert, type ChallengeSetup } from './kinds/git.ts'
import { parseScenarioMd } from './parse-scenario-md.ts'

export interface AssembleScenarioInput {
  scenarioSrc: string
  walkthroughSrc: string
  setup: ChallengeSetup
  assert: ChallengeAssert
}

/** Turn a schema-1 package (markdown + hooks) into a runtime Challenge. */
export function assembleScenario(input: AssembleScenarioInput): Challenge {
  const parsed = parseScenarioMd(input.scenarioSrc)
  switch (parsed.manifest.kind) {
    case 'git':
      return assembleGitChallenge(parsed, input.walkthroughSrc, input.setup, input.assert)
    default: {
      const kind: never = parsed.manifest.kind
      throw new Error(`assembleScenario: unhandled kind ${String(kind)}`)
    }
  }
}
