import abortTheExperiment from './git/abort-the-experiment/index.ts'
import cleanSweep from './git/clean-sweep/index.ts'
import forgotTheReceipt from './git/forgot-the-receipt/index.ts'
import halfDeleted from './git/half-deleted/index.ts'
import leakedSecret from './git/leaked-secret/index.ts'
import notOnMain from './git/not-on-main/index.ts'
import saveYourWork from './git/save-your-work/index.ts'
import shipOnlyTheFix from './git/ship-only-the-fix/index.ts'
import softLandingWrongBranch from './git/soft-landing-wrong-branch/index.ts'
import stagedButInvisible from './git/staged-but-invisible/index.ts'
import takeItBack from './git/take-it-back/index.ts'
import theVanishedFile from './git/the-vanished-file/index.ts'
import timeMachineRecovery from './git/time-machine-recovery/index.ts'
import tipBelongsOnFeature from './git/tip-belongs-on-feature/index.ts'
import wrongBranchWetPaint from './git/wrong-branch-wet-paint/index.ts'
import brokenTip from './ts/broken-tip/index.ts'
import { slugify } from './slug.ts'
import type { Scenario, ScenarioSummary } from '../engine/types.ts'

// Display order is curated easy to hard (concept progression, not alphabet).
// Same-family scenarios stay spaced: restore path vs deleted; first branch
// vs wet-paint; unstage inspect vs secret stakes. POC kind=ts follows the
// git pack for now.
export const scenarios: Scenario[] = [
  saveYourWork,
  takeItBack,
  notOnMain,
  shipOnlyTheFix,
  stagedButInvisible,
  leakedSecret,
  theVanishedFile,
  cleanSweep,
  wrongBranchWetPaint,
  abortTheExperiment,
  forgotTheReceipt,
  softLandingWrongBranch,
  tipBelongsOnFeature,
  timeMachineRecovery,
  halfDeleted,
  brokenTip,
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
