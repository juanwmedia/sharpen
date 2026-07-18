import { parse as parseYaml } from 'yaml'
import type { FsClient } from 'isomorphic-git'
import {
  FILE_STATUS,
  statusOf,
  untrackedFiles,
  type FileStatus,
} from '../../../engine/snapshot.ts'
import type {
  Check,
  Localized,
  Scenario,
  ScenarioAssertContext,
  ScenarioSetupEnv,
} from '../../../engine/types.ts'
import type { GitScenarioSpec, ParsedScenarioMd } from '../types.ts'
import { DEFAULT_TIME_LIMIT_MS } from '../types.ts'

// Schema-2 git mechanics: scenarios are DOCUMENTS, not code. scenario.yaml
// declares setup as steps and checks as predicates; this module interprets
// both. The interpreter IS the validator: an op or predicate this engine does
// not know makes the document unloadable, with an error naming exactly what
// is missing (the capability boundary that tells old plugins to update).

// --- setup steps -------------------------------------------------------------

/** The setup vocabulary. One-to-one with ScenarioSetupEnv helpers: extending
 * it means adding a helper first, then a parser case here. */
const SETUP_OPS = ['write', 'remove', 'add', 'commit', 'branch', 'checkout', 'reset'] as const

type SetupStep =
  | { op: 'write'; path: string; content: string }
  | { op: 'remove'; path: string }
  | { op: 'add'; paths: string[] }
  | { op: 'commit'; message: string }
  | { op: 'branch'; name: string; checkout: boolean }
  | { op: 'checkout'; ref: string }
  | { op: 'reset'; mode: 'soft' | 'hard'; to: string }

function singleKeyOf(raw: unknown, at: string): { key: string; value: unknown } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${at}: must be a map with exactly one key`)
  }
  const keys = Object.keys(raw)
  if (keys.length !== 1) {
    throw new Error(`${at}: must have exactly one key (got: ${keys.join(', ') || 'none'})`)
  }
  const key = keys[0]!
  return { key, value: (raw as Record<string, unknown>)[key] }
}

function parseSetupStep(raw: unknown, index: number): SetupStep {
  const at = `scenario.yaml: setup step ${index + 1}`
  const { key: op, value } = singleKeyOf(raw, at)
  switch (op) {
    case 'write': {
      const v = value as { path?: unknown; content?: unknown } | null
      if (!v || typeof v !== 'object' || typeof v.path !== 'string' || !v.path || typeof v.content !== 'string') {
        throw new Error(`${at}: write needs { path, content }`)
      }
      return { op: 'write', path: v.path, content: v.content }
    }
    case 'remove': {
      if (typeof value !== 'string' || !value) throw new Error(`${at}: remove needs a path string`)
      return { op: 'remove', path: value }
    }
    case 'add': {
      if (!Array.isArray(value) || !value.length || value.some((p) => typeof p !== 'string' || !p)) {
        throw new Error(`${at}: add needs a non-empty list of paths`)
      }
      return { op: 'add', paths: value as string[] }
    }
    case 'commit': {
      if (typeof value !== 'string' || !value.trim()) throw new Error(`${at}: commit needs a message`)
      return { op: 'commit', message: value }
    }
    case 'branch': {
      if (typeof value === 'string' && value) return { op: 'branch', name: value, checkout: false }
      const v = value as { name?: unknown; checkout?: unknown } | null
      if (v && typeof v === 'object' && typeof v.name === 'string' && v.name) {
        return { op: 'branch', name: v.name, checkout: v.checkout === true }
      }
      throw new Error(`${at}: branch needs a name string or { name, checkout }`)
    }
    case 'checkout': {
      if (typeof value !== 'string' || !value) throw new Error(`${at}: checkout needs a ref string`)
      return { op: 'checkout', ref: value }
    }
    case 'reset': {
      const v = value as { mode?: unknown; to?: unknown } | null
      if (
        !v ||
        typeof v !== 'object' ||
        (v.mode !== 'soft' && v.mode !== 'hard') ||
        typeof v.to !== 'string' ||
        !v.to
      ) {
        throw new Error(`${at}: reset needs { mode: soft|hard, to }`)
      }
      return { op: 'reset', mode: v.mode, to: v.to }
    }
    default:
      throw new Error(`${at}: unknown op "${op}"; this engine supports: ${SETUP_OPS.join(', ')}`)
  }
}

function buildSetup(steps: SetupStep[]): (env: ScenarioSetupEnv) => Promise<void> {
  return async (env) => {
    for (const step of steps) {
      switch (step.op) {
        case 'write':
          await env.write(step.path, step.content)
          break
        case 'remove':
          await env.remove(step.path)
          break
        case 'add':
          await env.add(...step.paths)
          break
        case 'commit':
          await env.commit(step.message)
          break
        case 'branch':
          await env.branch(step.name, step.checkout ? { checkout: true } : undefined)
          break
        case 'checkout':
          await env.checkout(step.ref)
          break
        case 'reset':
          await env.reset({ mode: step.mode, to: step.to })
          break
        default: {
          const never: never = step
          throw new Error(`unreachable setup op ${String(never)}`)
        }
      }
    }
  }
}

// --- check predicates --------------------------------------------------------

/** The predicate vocabulary. Authors write name + expect; the pass/fail
 * DETAIL is rendered here, once, in every language, so every scenario gets
 * consistent verdict copy for free. */
const CHECK_PREDICATES = ['untracked', 'staged', 'head', 'branch', 'file'] as const

type CheckSpec =
  | { predicate: 'untracked' }
  | { predicate: 'staged' }
  | { predicate: 'head'; branch?: string; commits?: number }
  | { predicate: 'branch'; name: string; commits?: number; absent?: true }
  | { predicate: 'file'; path: string; status?: FileStatus; contentEquals?: string }

interface ScenarioCheck {
  name: Localized
  spec: CheckSpec
}

function parseLocalized(raw: unknown, at: string): Localized {
  const v = raw as { en?: unknown; es?: unknown } | null
  if (
    !v ||
    typeof v !== 'object' ||
    typeof v.en !== 'string' ||
    !v.en.trim() ||
    typeof v.es !== 'string' ||
    !v.es.trim()
  ) {
    throw new Error(`${at}: name needs non-empty { en, es }`)
  }
  return { en: v.en, es: v.es }
}

const FILE_STATUSES = Object.values(FILE_STATUS)

function parseCheckSpec(raw: unknown, at: string): CheckSpec {
  const { key: predicate, value } = singleKeyOf(raw, `${at}: expect`)
  switch (predicate) {
    case 'untracked':
    case 'staged': {
      if (value !== 'none') throw new Error(`${at}: expect.${predicate} only supports "none"`)
      return { predicate }
    }
    case 'head': {
      const v = value as { branch?: unknown; commits?: unknown } | null
      if (!v || typeof v !== 'object') throw new Error(`${at}: expect.head needs { branch and/or commits }`)
      let commits: number | undefined
      if (v.commits !== undefined) {
        if (typeof v.commits !== 'number' || !Number.isInteger(v.commits) || v.commits < 0) {
          throw new Error(`${at}: expect.head.commits must be a non-negative integer`)
        }
        commits = v.commits
      }
      const branch = v.branch === undefined ? undefined : String(v.branch)
      if (branch === undefined && commits === undefined) {
        throw new Error(`${at}: expect.head needs branch and/or commits`)
      }
      return {
        predicate: 'head',
        ...(branch !== undefined ? { branch } : {}),
        ...(commits !== undefined ? { commits } : {}),
      }
    }
    case 'branch': {
      // Unlike head, this inspects ANY branch tip: it is how a scenario
      // proves a protected branch (usually main) never moved, or that a
      // deleted branch is really gone (absent: true).
      const v = value as { name?: unknown; commits?: unknown; absent?: unknown } | null
      if (!v || typeof v !== 'object' || typeof v.name !== 'string' || !v.name) {
        throw new Error(`${at}: expect.branch needs { name, commits? | absent: true }`)
      }
      if (v.absent !== undefined) {
        if (v.absent !== true) throw new Error(`${at}: expect.branch.absent only supports true`)
        if (v.commits !== undefined) {
          throw new Error(`${at}: expect.branch.absent excludes commits (a gone branch has no count)`)
        }
        return { predicate: 'branch', name: v.name, absent: true }
      }
      let commits: number | undefined
      if (v.commits !== undefined) {
        if (typeof v.commits !== 'number' || !Number.isInteger(v.commits) || v.commits < 0) {
          throw new Error(`${at}: expect.branch.commits must be a non-negative integer`)
        }
        commits = v.commits
      }
      return { predicate: 'branch', name: v.name, ...(commits !== undefined ? { commits } : {}) }
    }
    case 'file': {
      const v = value as { path?: unknown; status?: unknown; contentEquals?: unknown } | null
      if (!v || typeof v !== 'object' || typeof v.path !== 'string' || !v.path) {
        throw new Error(`${at}: expect.file needs { path, status and/or contentEquals }`)
      }
      let status: FileStatus | undefined
      if (v.status !== undefined) {
        if (!FILE_STATUSES.includes(v.status as FileStatus)) {
          throw new Error(`${at}: expect.file.status must be one of: ${FILE_STATUSES.join(', ')}`)
        }
        status = v.status as FileStatus
      }
      const contentEquals = v.contentEquals === undefined ? undefined : String(v.contentEquals)
      if (status === undefined && contentEquals === undefined) {
        throw new Error(`${at}: expect.file needs status and/or contentEquals`)
      }
      return {
        predicate: 'file',
        path: v.path,
        ...(status !== undefined ? { status } : {}),
        ...(contentEquals !== undefined ? { contentEquals } : {}),
      }
    }
    default:
      throw new Error(
        `${at}: unknown predicate "${predicate}"; this engine supports: ${CHECK_PREDICATES.join(', ')}`
      )
  }
}

function parseCheck(raw: unknown, index: number): ScenarioCheck {
  const at = `scenario.yaml: check ${index + 1}`
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${at}: must be a map with name and expect`)
  }
  const v = raw as { name?: unknown; expect?: unknown }
  return { name: parseLocalized(v.name, at), spec: parseCheckSpec(v.expect, at) }
}

/** Files with a staged change (index differs from HEAD). */
function stagedFiles(ctx: ScenarioAssertContext): string[] {
  return ctx.snapshot.status.filter(([, , , stage]) => stage >= 2).map(([path]) => path)
}

function nCommits(n: number): string {
  return n === 1 ? '1 commit' : `${n} commits`
}

async function evaluateCheck(check: ScenarioCheck, ctx: ScenarioAssertContext): Promise<Check> {
  const { spec } = check
  switch (spec.predicate) {
    case 'untracked': {
      const files = untrackedFiles(ctx.snapshot)
      return {
        name: check.name,
        pass: files.length === 0,
        detail: files.length
          ? { en: `still untracked: ${files.join(', ')}`, es: `todavía sin seguimiento: ${files.join(', ')}` }
          : { en: 'no untracked files left', es: 'no queda nada sin seguimiento' },
      }
    }
    case 'staged': {
      const files = stagedFiles(ctx)
      return {
        name: check.name,
        pass: files.length === 0,
        detail: files.length
          ? { en: `staged: ${files.join(', ')}`, es: `en el stage: ${files.join(', ')}` }
          : { en: 'index untouched', es: 'índice intacto' },
      }
    }
    case 'head': {
      const branch = ctx.snapshot.head.branch ?? '(detached)'
      const commits = ctx.snapshot.log.length
      const pass =
        (spec.branch === undefined || branch === spec.branch) &&
        (spec.commits === undefined || commits === spec.commits)
      // The expected fragment is composed per language: joining with an
      // English connective leaked "with" into the Spanish detail.
      const expectedParts = (join: string) =>
        [
          spec.branch !== undefined ? spec.branch : null,
          spec.commits !== undefined ? nCommits(spec.commits) : null,
        ]
          .filter(Boolean)
          .join(join)
      return {
        name: check.name,
        pass,
        detail: {
          en: `HEAD is ${branch} with ${nCommits(commits)} (expected ${expectedParts(' with ')})`,
          es: `HEAD es ${branch} con ${nCommits(commits)} (esperado ${expectedParts(' con ')})`,
        },
      }
    }
    case 'branch': {
      const tip = ctx.snapshot.branches[spec.name]
      if (spec.absent) {
        return {
          name: check.name,
          pass: !tip,
          detail: tip
            ? { en: `branch ${spec.name} still exists`, es: `la rama ${spec.name} todavía existe` }
            : { en: `branch ${spec.name} is gone`, es: `la rama ${spec.name} ya no existe` },
        }
      }
      if (!tip) {
        return {
          name: check.name,
          pass: false,
          detail: {
            en: `branch ${spec.name} does not exist`,
            es: `la rama ${spec.name} no existe`,
          },
        }
      }
      if (spec.commits === undefined) {
        return {
          name: check.name,
          pass: true,
          detail: { en: `branch ${spec.name} exists`, es: `la rama ${spec.name} existe` },
        }
      }
      const fs = ctx.gitFs as unknown as FsClient
      const commits = (await ctx.git.log({ fs, dir: ctx.dir, ref: spec.name })).length
      return {
        name: check.name,
        pass: commits === spec.commits,
        detail: {
          en: `${spec.name} is at ${nCommits(commits)} (expected ${nCommits(spec.commits)})`,
          es: `${spec.name} está en ${nCommits(commits)} (esperado ${nCommits(spec.commits)})`,
        },
      }
    }
    case 'file': {
      const status = statusOf(ctx.snapshot, spec.path)
      let content: string | null = null
      if (spec.contentEquals !== undefined) {
        try {
          content = await ctx.fs.readFile(`${ctx.dir}/${spec.path}`, 'utf8')
        } catch {
          content = null
        }
      }
      const statusOk = spec.status === undefined || status === spec.status
      const contentOk = spec.contentEquals === undefined || content === spec.contentEquals
      const detail = !statusOk
        ? {
            en: `${spec.path} is ${status} (expected ${spec.status})`,
            es: `${spec.path} está ${status} (esperado ${spec.status})`,
          }
        : !contentOk
          ? {
              en: `${spec.path} does not have the expected content`,
              es: `${spec.path} no tiene el contenido esperado`,
            }
          : {
              en: `${spec.path} is as expected`,
              es: `${spec.path} está como se espera`,
            }
      return { name: check.name, pass: statusOk && contentOk, detail }
    }
    default: {
      const never: never = spec
      throw new Error(`unreachable predicate ${String(never)}`)
    }
  }
}

/** Names of failing contentEquals checks whose required content git can no
 * longer produce: not on disk at the path, and not a blob anywhere in the
 * object database (index or any commit). Deliberately conservative: if the
 * blob exists somewhere, stay silent. The player could always retype the
 * content by hand, so the message wording is "git cannot bring it back",
 * never "impossible". */
function buildLostChecks(
  checks: ScenarioCheck[]
): (ctx: ScenarioAssertContext) => Promise<Localized[]> {
  return async (ctx) => {
    const lost: Localized[] = []
    const fs = ctx.gitFs as unknown as FsClient
    for (const check of checks) {
      const { spec } = check
      if (spec.predicate !== 'file' || spec.contentEquals === undefined) continue
      const evaluated = await evaluateCheck(check, ctx)
      if (evaluated.pass) continue
      let reachable = false
      try {
        const current = await ctx.fs.readFile(`${ctx.dir}/${spec.path}`, 'utf8')
        if (current === spec.contentEquals) reachable = true
      } catch {
        /* absent from the worktree */
      }
      if (!reachable) {
        try {
          const { oid } = await ctx.git.hashBlob({ object: spec.contentEquals })
          await ctx.git.readBlob({ fs, dir: ctx.dir, oid })
          reachable = true
        } catch {
          /* not in the object database either */
        }
      }
      if (!reachable) lost.push(check.name)
    }
    return lost
  }
}

function buildAssert(
  checks: ScenarioCheck[]
): (ctx: ScenarioAssertContext) => Promise<{ pass: boolean; checks: Check[] }> {
  return async (ctx) => {
    const results: Check[] = []
    for (const check of checks) results.push(await evaluateCheck(check, ctx))
    return { pass: results.every((c) => c.pass), checks: results }
  }
}

// --- mechanics document ------------------------------------------------------

export interface GitMechanics {
  setup: SetupStep[]
  checks: ScenarioCheck[]
  /** Canonical solving commands: the machine proof that the scenario is
   * solvable (dry-run test), never shown to the player. */
  solution: string[]
}

export function parseGitMechanics(source: string): GitMechanics {
  let raw: unknown
  try {
    raw = parseYaml(source)
  } catch (err) {
    throw new Error(`scenario.yaml: invalid YAML: ${(err as Error).message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('scenario.yaml: must be a YAML object')
  }
  const doc = raw as { setup?: unknown; checks?: unknown; solution?: unknown }
  if (!Array.isArray(doc.setup) || !doc.setup.length) {
    throw new Error('scenario.yaml: setup must be a non-empty list of steps')
  }
  if (!Array.isArray(doc.checks) || !doc.checks.length) {
    throw new Error('scenario.yaml: checks must be a non-empty list')
  }
  const solution = (doc.solution as { commands?: unknown } | null)?.commands
  if (!Array.isArray(solution) || !solution.length || solution.some((c) => typeof c !== 'string' || !c.trim())) {
    throw new Error('scenario.yaml: solution.commands must be a non-empty list of commands')
  }
  return {
    setup: doc.setup.map(parseSetupStep),
    checks: doc.checks.map(parseCheck),
    solution: solution as string[],
  }
}

// --- assembler ---------------------------------------------------------------

function parseGitSpec(spec: Record<string, unknown> | undefined): GitScenarioSpec {
  if (!spec || typeof spec.tree !== 'string' || !spec.tree.trim()) {
    throw new Error('scenario.md: kind "git" requires spec.tree (non-empty string)')
  }
  return { tree: spec.tree.replace(/\n$/, '') }
}

export function assembleGitScenario(
  parsed: ParsedScenarioMd,
  walkthroughSrc: string,
  mechanicsSrc: string
): Scenario {
  const { manifest, briefing, objective } = parsed
  const { tree } = parseGitSpec(manifest.spec)
  const walkthrough = walkthroughSrc.trim()
  if (!walkthrough) throw new Error('walkthrough.md: body is empty')
  const mechanics = parseGitMechanics(mechanicsSrc)

  return {
    id: manifest.id,
    version: manifest.version,
    kind: manifest.kind,
    pack: manifest.pack,
    title: manifest.title,
    difficulty: manifest.difficulty,
    timeLimitMs: manifest.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS,
    briefing,
    tree,
    objective,
    themes: manifest.themes ?? [],
    walkthrough,
    solution: mechanics.solution,
    setup: buildSetup(mechanics.setup),
    assert: buildAssert(mechanics.checks),
    lostChecks: buildLostChecks(mechanics.checks),
  }
}
