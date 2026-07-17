import { describe, expect, it } from 'vitest'
import { scenarios, getScenarioByPackSlug, getScenarioBySlug } from '../scenarios/index.ts'
import { slugify } from '../scenarios/slug.ts'

// Public URLs are /:pack/:slug (e.g. /git/clean-sweep). Broken or duplicated
// pack/slug pairs mean unreachable or ambiguous scenarios.

describe('scenario slugs', () => {
  it('derives URL-safe slugs from titles', () => {
    expect(slugify('Clean sweep')).toBe('clean-sweep')
    expect(slugify('Árbol ñu, café!')).toBe('arbol-nu-cafe')
    expect(slugify('  --weird -- title--  ')).toBe('weird-title')
  })

  it('resolves every registered scenario by pack and slug, with no collisions', () => {
    const keys = scenarios.map((c) => `${c.pack}/${slugify(c.title)}`)
    expect(new Set(keys).size).toBe(scenarios.length)
    for (const scenario of scenarios) {
      const slug = slugify(scenario.title)
      expect(getScenarioBySlug(slug)).toBe(scenario)
      expect(getScenarioByPackSlug(scenario.pack, slug)).toBe(scenario)
      expect(getScenarioByPackSlug('nope', slug)).toBeUndefined()
    }
  })
})
