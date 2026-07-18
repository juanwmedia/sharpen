import { assembleScenario } from '../../package/assemble.ts'
import scenarioSrc from './scenario.md'
import mechanicsSrc from './scenario.yaml'
import walkthroughSrc from './walkthrough.md'

export default assembleScenario({
  scenarioSrc,
  walkthroughSrc,
  mechanicsSrc,
})
