import { assembleScenario } from '../../package/assemble.ts'
import { assert } from './assert.ts'
import scenarioSrc from './scenario.md'
import { setup } from './setup.ts'
import walkthroughSrc from './walkthrough.md'

export default assembleScenario({
  scenarioSrc,
  walkthroughSrc,
  setup,
  assert,
})
