import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assembleScenario } from '../scenarios/package/assemble.ts'
import { parseGitMechanics } from '../scenarios/package/kinds/git.ts'
import { parseScenarioMd } from '../scenarios/package/parse-scenario-md.ts'
import cleanSweep from '../scenarios/git/clean-sweep/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const packageDir = join(here, '../scenarios/git/clean-sweep')

function minimalScenario(overrides: { frontmatter?: string; body?: string }): string {
  const frontmatter =
    overrides.frontmatter ??
    `schema: 2
version: 1
id: test/demo
kind: git
pack: git
title: Demo
difficulty: easy
spec:
  tree: |
    repo/
    └── a.txt`
  const body =
    overrides.body ??
    `## Briefing (en)

Hello.

## Briefing (es)

Hola.

## Objective (en)

Done.

## Objective (es)

Hecho.`
  return `---\n${frontmatter}\n---\n\n${body}\n`
}

const MINIMAL_MECHANICS = `setup:
  - write: { path: a.txt, content: "hi\\n" }
  - add: [a.txt]
  - commit: 'feat: a'
checks:
  - name: { en: Clean tree, es: Árbol limpio }
    expect: { untracked: none }
solution:
  commands:
    - git status
`

describe('parseScenarioMd', () => {
  it('parses core fields, version, and localized sections', () => {
    const parsed = parseScenarioMd(minimalScenario({}))
    expect(parsed.manifest).toMatchObject({
      schema: 2,
      version: 1,
      id: 'test/demo',
      kind: 'git',
      pack: 'git',
      title: 'Demo',
      difficulty: 'easy',
    })
    expect(parsed.manifest.spec?.tree).toContain('repo/')
    expect(parsed.briefing.en).toBe('Hello.')
    expect(parsed.briefing.es).toBe('Hola.')
    expect(parsed.objective.en).toBe('Done.')
    expect(parsed.objective.es).toBe('Hecho.')
  })

  it('rejects old schema / missing version / unknown kind / missing locale', () => {
    expect(() =>
      parseScenarioMd(
        minimalScenario({ frontmatter: 'schema: 1\nid: x\nkind: git\npack: git\ntitle: T\ndifficulty: easy' })
      )
    ).toThrow(/unsupported schema/)
    expect(() =>
      parseScenarioMd(
        minimalScenario({ frontmatter: 'schema: 2\nid: x\nkind: git\npack: git\ntitle: T\ndifficulty: easy' })
      )
    ).toThrow(/version must be a positive integer/)
    expect(() =>
      parseScenarioMd(
        minimalScenario({
          frontmatter:
            'schema: 2\nversion: 1\nid: x\nkind: sql\npack: sql\ntitle: T\ndifficulty: easy\nspec:\n  tree: |\n    x',
        })
      )
    ).toThrow(/unknown kind/)
    expect(() =>
      parseScenarioMd(
        minimalScenario({
          body: `## Briefing (en)

Only English.

## Objective (en)

Only English.`,
        })
      )
    ).toThrow(/Briefing \(es\)/)
  })
})

describe('parseGitMechanics (the interpreter IS the validator)', () => {
  it('parses steps, checks and solution', () => {
    const mechanics = parseGitMechanics(MINIMAL_MECHANICS)
    expect(mechanics.setup).toHaveLength(3)
    expect(mechanics.checks).toHaveLength(1)
    expect(mechanics.solution).toEqual(['git status'])
  })

  it('rejects an unknown setup op naming the supported vocabulary', () => {
    const doc = MINIMAL_MECHANICS.replace('- add: [a.txt]', '- stash: {}')
    expect(() => parseGitMechanics(doc)).toThrow(
      /unknown op "stash"; this engine supports: write, remove, add, commit, branch, checkout/
    )
  })

  it('rejects an unknown check predicate naming the supported vocabulary', () => {
    const doc = MINIMAL_MECHANICS.replace('{ untracked: none }', '{ stashDepth: 1 }')
    expect(() => parseGitMechanics(doc)).toThrow(
      /unknown predicate "stashDepth"; this engine supports: untracked, staged, head, file/
    )
  })

  it('requires bilingual check names and a non-empty solution', () => {
    expect(() =>
      parseGitMechanics(MINIMAL_MECHANICS.replace('{ en: Clean tree, es: Árbol limpio }', '{ en: Clean tree }'))
    ).toThrow(/name needs non-empty \{ en, es \}/)
    expect(() => parseGitMechanics(MINIMAL_MECHANICS.replace('    - git status\n', ''))).toThrow(
      /solution\.commands/
    )
  })
})

describe('assembleScenario', () => {
  it('assembles Clean sweep with the same public shape as before, plus schema-2 fields', () => {
    expect(cleanSweep.id).toBe('git/clean-sweep')
    expect(cleanSweep.version).toBe(1)
    expect(cleanSweep.pack).toBe('git')
    expect(cleanSweep.title).toBe('Clean sweep')
    expect(cleanSweep.difficulty).toBe('medium')
    expect(cleanSweep.timeLimitMs).toBe(60_000)
    expect(cleanSweep.themes).toEqual(['working tree', 'untracked', 'tracked', 'staging'])
    expect(cleanSweep.tree).toContain('client.ts   (modified - keep)')
    expect(cleanSweep.briefing.en).toMatch(/noa-notes/)
    expect(cleanSweep.briefing.es).toMatch(/noa-notes/)
    expect(cleanSweep.objective.en).toMatch(/untracked/)
    expect(cleanSweep.walkthrough).toMatch(/git clean/)
    expect(cleanSweep.solution).toEqual(['git clean -fd'])
    expect(typeof cleanSweep.setup).toBe('function')
    expect(typeof cleanSweep.assert).toBe('function')
  })

  it('fails loud when git spec.tree is missing', () => {
    expect(() =>
      assembleScenario({
        scenarioSrc: minimalScenario({
          frontmatter: `schema: 2
version: 1
id: test/demo
kind: git
pack: git
title: Demo
difficulty: easy`,
        }),
        walkthroughSrc: 'Do the thing.',
        mechanicsSrc: MINIMAL_MECHANICS,
      })
    ).toThrow(/spec\.tree/)
  })

  it('round-trips package files through the parsers', () => {
    const scenarioSrc = readFileSync(join(packageDir, 'scenario.md'), 'utf8')
    const parsed = parseScenarioMd(scenarioSrc)
    expect(parsed.manifest.id).toBe('git/clean-sweep')
    expect(parsed.manifest.kind).toBe('git')
    const mechanics = parseGitMechanics(readFileSync(join(packageDir, 'scenario.yaml'), 'utf8'))
    expect(mechanics.setup.length).toBeGreaterThan(5)
    expect(mechanics.checks).toHaveLength(4)
  })
})
