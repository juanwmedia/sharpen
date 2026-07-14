import { describe, expect, it } from 'vitest'
import { challenges, getChallengeBySlug } from '../challenges/index.ts'
import { slugify } from '../challenges/slug.ts'

// Slugs are public URLs (/challenge/<slug>): a broken or duplicated slug means
// an unreachable or ambiguous challenge, so this is worth guarding.

describe('challenge slugs', () => {
  it('derives URL-safe slugs from titles', () => {
    expect(slugify('Clean sweep')).toBe('clean-sweep')
    expect(slugify('Árbol ñu, café!')).toBe('arbol-nu-cafe')
    expect(slugify('  --weird -- title--  ')).toBe('weird-title')
  })

  it('resolves every registered challenge by its slug, with no collisions', () => {
    const slugs = challenges.map((c) => slugify(c.title))
    expect(new Set(slugs).size).toBe(challenges.length)
    for (const challenge of challenges) {
      expect(getChallengeBySlug(slugify(challenge.title))).toBe(challenge)
    }
  })
})
