import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assembleScenario } from '../challenges/package/assemble.ts'
import { parseScenarioMd } from '../challenges/package/parse-scenario-md.ts'
import cleanSweep from '../challenges/git/clean-sweep/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const packageDir = join(here, '../challenges/git/clean-sweep')

function minimalScenario(overrides: {
  frontmatter?: string
  body?: string
}): string {
  const frontmatter =
    overrides.frontmatter ??
    `schema: 1
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

describe('parseScenarioMd', () => {
  it('parses core fields and localized sections', () => {
    const parsed = parseScenarioMd(minimalScenario({}))
    expect(parsed.manifest).toMatchObject({
      schema: 1,
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

  it('rejects missing schema / unknown kind / missing locale', () => {
    expect(() => parseScenarioMd(minimalScenario({ frontmatter: 'schema: 2\nid: x\nkind: git\npack: git\ntitle: T\ndifficulty: easy' }))).toThrow(
      /unsupported schema/
    )
    expect(() =>
      parseScenarioMd(
        minimalScenario({
          frontmatter:
            'schema: 1\nid: x\nkind: sql\npack: sql\ntitle: T\ndifficulty: easy\nspec:\n  tree: |\n    x',
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

describe('assembleScenario', () => {
  it('assembles Clean sweep with the same public shape as before', () => {
    expect(cleanSweep.id).toBe('git/clean-sweep')
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
    expect(typeof cleanSweep.setup).toBe('function')
    expect(typeof cleanSweep.assert).toBe('function')
  })

  it('fails loud when git spec.tree is missing', () => {
    expect(() =>
      assembleScenario({
        scenarioSrc: minimalScenario({
          frontmatter: `schema: 1
id: test/demo
kind: git
pack: git
title: Demo
difficulty: easy`,
        }),
        walkthroughSrc: 'Do the thing.',
        setup: async () => {},
        assert: async () => ({ pass: true, checks: [] }),
      })
    ).toThrow(/spec\.tree/)
  })

  it('round-trips package markdown files through the parser', () => {
    const scenarioSrc = readFileSync(join(packageDir, 'scenario.md'), 'utf8')
    const parsed = parseScenarioMd(scenarioSrc)
    expect(parsed.manifest.id).toBe('git/clean-sweep')
    expect(parsed.manifest.kind).toBe('git')
  })
})
