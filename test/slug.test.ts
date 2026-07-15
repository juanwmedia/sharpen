import { describe, expect, it } from 'vitest'
import { challenges, getChallengeByPackSlug, getChallengeBySlug } from '../challenges/index.ts'
import { slugify } from '../challenges/slug.ts'

// Public URLs are /:pack/:slug (e.g. /git/clean-sweep). Broken or duplicated
// pack/slug pairs mean unreachable or ambiguous scenarios.

describe('challenge slugs', () => {
  it('derives URL-safe slugs from titles', () => {
    expect(slugify('Clean sweep')).toBe('clean-sweep')
    expect(slugify('Árbol ñu, café!')).toBe('arbol-nu-cafe')
    expect(slugify('  --weird -- title--  ')).toBe('weird-title')
  })

  it('resolves every registered challenge by pack and slug, with no collisions', () => {
    const keys = challenges.map((c) => `${c.pack}/${slugify(c.title)}`)
    expect(new Set(keys).size).toBe(challenges.length)
    for (const challenge of challenges) {
      const slug = slugify(challenge.title)
      expect(getChallengeBySlug(slug)).toBe(challenge)
      expect(getChallengeByPackSlug(challenge.pack, slug)).toBe(challenge)
      expect(getChallengeByPackSlug('nope', slug)).toBeUndefined()
    }
  })
})
