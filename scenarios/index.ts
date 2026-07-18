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
import tipJarLies from './ts/tip-jar-lies/index.ts'
import freeShippingGate from './ts/free-shipping-gate/index.ts'
import cartThatLies from './ts/cart-that-lies/index.ts'
import stringlyId from './ts/stringly-id/index.ts'
import maybeNull from './ts/maybe-null/index.ts'
import listBleed from './ts/list-bleed/index.ts'
import configBleed from './ts/config-bleed/index.ts'
import weekendRate from './ts/weekend-rate/index.ts'
import makeTheDoc from './ts/make-the-doc/index.ts'
import pipeIt from './ts/pipe-it/index.ts'
import pendingReceipt from './ts/pending-receipt/index.ts'
import thenChain from './ts/then-chain/index.ts'
import forgotToAwait from './ts/forgot-to-await/index.ts'
import swallowThe500 from './ts/swallow-the-500/index.ts'
import twoDoors from './ts/two-doors/index.ts'
import oneClient from './ts/one-client/index.ts'
import narrowTheStatus from './ts/narrow-the-status/index.ts'
import stalePaint from './ts/stale-paint/index.ts'
import { slugify } from './slug.ts'
import type { Scenario, ScenarioSummary } from '../engine/types.ts'

// Full registry (git + ts). TS pack first (concept ladder), then git.
// Pack selector / filter UI is a follow-up on the picker.
export const scenarios: Scenario[] = [
  tipJarLies,
  freeShippingGate,
  cartThatLies,
  stringlyId,
  maybeNull,
  listBleed,
  configBleed,
  weekendRate,
  makeTheDoc,
  pipeIt,
  pendingReceipt,
  thenChain,
  forgotToAwait,
  swallowThe500,
  twoDoors,
  oneClient,
  narrowTheStatus,
  stalePaint,
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
