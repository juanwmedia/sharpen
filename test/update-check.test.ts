import { describe, expect, it } from 'vitest'
import { isNewerVersion } from '../server/update-check.ts'

describe('isNewerVersion', () => {
  it('compares semver-ish triples', () => {
    expect(isNewerVersion('0.1.7', '0.1.6')).toBe(true)
    expect(isNewerVersion('0.1.6', '0.1.6')).toBe(false)
    expect(isNewerVersion('0.1.5', '0.1.6')).toBe(false)
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true)
  })

  it('rejects unparsable tags', () => {
    expect(isNewerVersion('nope', '0.1.6')).toBe(false)
    expect(isNewerVersion('0.1.6', 'nope')).toBe(false)
  })
})
