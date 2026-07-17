import type { Scenario } from '../../engine/types.ts'
import { assembleGitScenario, type ScenarioAssert, type ScenarioSetup } from './kinds/git.ts'
import { parseScenarioMd } from './parse-scenario-md.ts'

export interface AssembleScenarioInput {
  scenarioSrc: string
  walkthroughSrc: string
  setup: ScenarioSetup
  assert: ScenarioAssert
}

/** Turn a schema-1 package (markdown + hooks) into a runtime Scenario. */
export function assembleScenario(input: AssembleScenarioInput): Scenario {
  const parsed = parseScenarioMd(input.scenarioSrc)
  switch (parsed.manifest.kind) {
    case 'git':
      return assembleGitScenario(parsed, input.walkthroughSrc, input.setup, input.assert)
    default: {
      const kind: never = parsed.manifest.kind
      throw new Error(`assembleScenario: unhandled kind ${String(kind)}`)
    }
  }
}
