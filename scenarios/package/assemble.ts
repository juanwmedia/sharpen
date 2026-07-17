import type { Scenario } from '../../engine/types.ts'
import { assembleGitScenario } from './kinds/git.ts'
import { parseScenarioMd } from './parse-scenario-md.ts'

export interface AssembleScenarioInput {
  scenarioSrc: string
  walkthroughSrc: string
  /** scenario.yaml source: declarative setup steps, check predicates and the
   * canonical solution (see kinds/<kind>.ts for each kind's vocabulary). */
  mechanicsSrc: string
}

/** Turn a schema-2 package (markdown + mechanics document) into a runtime
 * Scenario. Interpreting the document IS validating it: unknown vocabulary
 * throws with the exact op/predicate this engine is missing. */
export function assembleScenario(input: AssembleScenarioInput): Scenario {
  const parsed = parseScenarioMd(input.scenarioSrc)
  switch (parsed.manifest.kind) {
    case 'git':
      return assembleGitScenario(parsed, input.walkthroughSrc, input.mechanicsSrc)
    default: {
      const kind: never = parsed.manifest.kind
      throw new Error(`assembleScenario: unhandled kind ${String(kind)}`)
    }
  }
}
