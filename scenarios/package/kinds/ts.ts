import { parse as parseYaml } from 'yaml'
import type {
  Check,
  Localized,
  Scenario,
  ScenarioAssertContext,
  ScenarioSetupEnv,
} from '../../../engine/types.ts'
import { callExport, hasNamedExport } from '../../../engine/ts-runtime.ts'
import type { ParsedScenarioMd } from '../types.ts'
import { DEFAULT_TIME_LIMIT_MS } from '../types.ts'

// Schema-2 TypeScript mechanics: documents, not Jasmine. Setup writes files;
// checks call exports with fixed args (engine harness). Pass/fail is only in
// those checks; default Run is derived from the first returns on spec.entry.

const SETUP_OPS = ['write', 'remove'] as const

type SetupStep =
  | { op: 'write'; path: string; content: string }
  | { op: 'remove'; path: string }

type CheckSpec =
  | {
      predicate: 'exports'
      entry: string
      export: string
    }
  | {
      predicate: 'returns'
      entry: string
      export: string
      args: unknown[]
      equals: unknown
    }
  | { predicate: 'file'; path: string; contentEquals: string }

interface ScenarioCheck {
  name: Localized
  spec: CheckSpec
}

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
        default: {
          const never: never = step
          throw new Error(`unreachable setup op ${String(never)}`)
        }
      }
    }
  }
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

function parseCheckSpec(raw: unknown, at: string): CheckSpec {
  const { key: predicate, value } = singleKeyOf(raw, `${at}: expect`)
  switch (predicate) {
    case 'exports': {
      const v = value as { entry?: unknown; export?: unknown } | null
      if (
        !v ||
        typeof v !== 'object' ||
        typeof v.entry !== 'string' ||
        !v.entry ||
        typeof v.export !== 'string' ||
        !v.export
      ) {
        throw new Error(`${at}: expect.exports needs { entry, export }`)
      }
      return { predicate: 'exports', entry: v.entry, export: v.export }
    }
    case 'returns': {
      const v = value as {
        entry?: unknown
        export?: unknown
        args?: unknown
        equals?: unknown
      } | null
      if (
        !v ||
        typeof v !== 'object' ||
        typeof v.entry !== 'string' ||
        !v.entry ||
        typeof v.export !== 'string' ||
        !v.export ||
        !('equals' in v)
      ) {
        throw new Error(`${at}: expect.returns needs { entry, export, equals, args? }`)
      }
      const args = v.args === undefined ? [] : v.args
      if (!Array.isArray(args)) throw new Error(`${at}: expect.returns.args must be a list`)
      return {
        predicate: 'returns',
        entry: v.entry,
        export: v.export,
        args,
        equals: v.equals,
      }
    }
    case 'file': {
      const v = value as { path?: unknown; contentEquals?: unknown } | null
      if (
        !v ||
        typeof v !== 'object' ||
        typeof v.path !== 'string' ||
        !v.path ||
        typeof v.contentEquals !== 'string'
      ) {
        throw new Error(`${at}: expect.file needs { path, contentEquals }`)
      }
      return { predicate: 'file', path: v.path, contentEquals: v.contentEquals }
    }
    default:
      throw new Error(
        `${at}: unknown predicate "${predicate}"; this engine supports: exports, returns, file`
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

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

async function evaluateCheck(check: ScenarioCheck, ctx: ScenarioAssertContext): Promise<Check> {
  const { spec } = check
  switch (spec.predicate) {
    case 'exports': {
      const result = await hasNamedExport(ctx.fs, ctx.dir, spec.entry, spec.export)
      return {
        name: check.name,
        pass: result.ok,
        detail: result.ok
          ? {
              en: `${spec.entry} exports function ${spec.export}`,
              es: `${spec.entry} exporta la función ${spec.export}`,
            }
          : {
              en: result.error ?? `${spec.export} is not exported from ${spec.entry}`,
              es: result.error ?? `${spec.export} no se exporta desde ${spec.entry}`,
            },
      }
    }
    case 'returns': {
      const result = await callExport(ctx.fs, ctx.dir, spec.entry, spec.export, spec.args)
      if (!result.ok) {
        return {
          name: check.name,
          pass: false,
          detail: {
            en: `${spec.export}(...): ${result.error}`,
            es: `${spec.export}(...): ${result.error}`,
          },
        }
      }
      const pass = sameValue(result.value, spec.equals)
      return {
        name: check.name,
        pass,
        detail: pass
          ? {
              en: `${spec.export} returned ${JSON.stringify(result.value)}`,
              es: `${spec.export} devolvió ${JSON.stringify(result.value)}`,
            }
          : {
              en: `${spec.export} returned ${JSON.stringify(result.value)} (expected ${JSON.stringify(spec.equals)})`,
              es: `${spec.export} devolvió ${JSON.stringify(result.value)} (esperado ${JSON.stringify(spec.equals)})`,
            },
      }
    }
    case 'file': {
      let content: string | null = null
      try {
        content = await ctx.fs.readFile(`${ctx.dir}/${spec.path}`, 'utf8')
      } catch {
        content = null
      }
      const pass = content === spec.contentEquals
      return {
        name: check.name,
        pass,
        detail: pass
          ? { en: `${spec.path} is as expected`, es: `${spec.path} está como se espera` }
          : {
              en: content === null ? `${spec.path} is missing` : `${spec.path} does not match`,
              es: content === null ? `${spec.path} no existe` : `${spec.path} no coincide`,
            },
      }
    }
    default: {
      const never: never = spec
      throw new Error(`unreachable predicate ${String(never)}`)
    }
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

export interface TsMechanics {
  setup: SetupStep[]
  checks: ScenarioCheck[]
  solution: string[]
}

export function parseTsMechanics(source: string): TsMechanics {
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

function parseTsSpec(spec: Record<string, unknown> | undefined): { tree: string; entry: string } {
  if (!spec || typeof spec.tree !== 'string' || !spec.tree.trim()) {
    throw new Error('scenario.md: kind "ts" requires spec.tree (non-empty string)')
  }
  if (typeof spec.entry !== 'string' || !spec.entry.trim()) {
    throw new Error('scenario.md: kind "ts" requires spec.entry (main .ts file)')
  }
  if (spec.probe !== undefined) {
    throw new Error(
      'scenario.md: kind "ts" no longer takes spec.probe; Run uses the first expect.returns check on spec.entry'
    )
  }
  return {
    tree: spec.tree.replace(/\n$/, ''),
    entry: spec.entry.trim(),
  }
}

/** Default Run / Monaco probe: first returns check on the entry file. */
function deriveTsProbe(
  entry: string,
  checks: ScenarioCheck[]
): { entry: string; exportName: string; args: unknown[] } {
  const onEntry = checks.find((c) => c.spec.predicate === 'returns' && c.spec.entry === entry)
  if (!onEntry || onEntry.spec.predicate !== 'returns') {
    throw new Error(
      `kind=ts: need at least one expect.returns check with entry "${entry}" (Run is derived from it)`
    )
  }
  return {
    entry: onEntry.spec.entry,
    exportName: onEntry.spec.export,
    args: onEntry.spec.args,
  }
}

export function assembleTsScenario(
  parsed: ParsedScenarioMd,
  walkthroughSrc: string,
  mechanicsSrc: string
): Scenario {
  const { manifest, briefing, objective } = parsed
  const { tree, entry } = parseTsSpec(manifest.spec)
  const walkthrough = walkthroughSrc.trim()
  if (!walkthrough) throw new Error('walkthrough.md: body is empty')
  const mechanics = parseTsMechanics(mechanicsSrc)
  const tsProbe = deriveTsProbe(entry, mechanics.checks)

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
    tsProbe,
    setup: buildSetup(mechanics.setup),
    assert: buildAssert(mechanics.checks),
  }
}
