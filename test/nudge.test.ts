import { describe, expect, it } from 'vitest'
import type { Verdict } from '../engine/types.ts'
import { baselineOf, checksKey, shouldNudge } from '../server/nudge.ts'

function verdict(stateHash: string, passes: boolean[]): Verdict {
  return {
    pass: passes.every(Boolean),
    stateHash,
    lost: [],
    checks: passes.map((pass, i) => ({
      name: { en: `check ${i}`, es: `check ${i}` },
      pass,
      detail: { en: '', es: '' },
    })),
  }
}

describe('mentor nudge gate', () => {
  it('fingerprints checks as a pass/fail string', () => {
    expect(checksKey(verdict('a', [false, true, true]))).toBe('011')
    expect(baselineOf(verdict('a', [false, true]))).toEqual({ stateHash: 'a', checksKey: '01' })
  })

  it('stays silent when nothing changed (empty Enter, ls, git status)', () => {
    const prev = baselineOf(verdict('hash-1', [false, true, true, true]))
    expect(shouldNudge(prev, verdict('hash-1', [false, true, true, true]), false)).toBe(false)
  })

  it('nudges when the repo state changed, even without a check flip', () => {
    const prev = baselineOf(verdict('hash-1', [false, true, true, true]))
    expect(shouldNudge(prev, verdict('hash-2', [false, true, true, true]), false)).toBe(true)
  })

  it('nudges when a check flipped in either direction', () => {
    const prev = baselineOf(verdict('hash-1', [false, true, true, true]))
    expect(shouldNudge(prev, verdict('hash-1', [true, true, true, true]), false)).toBe(true)
    expect(shouldNudge(prev, verdict('hash-1', [false, false, true, true]), false)).toBe(true)
  })

  it('always nudges on a command error: git refusing is a teachable moment', () => {
    const prev = baselineOf(verdict('hash-1', [false, true, true, true]))
    expect(shouldNudge(prev, verdict('hash-1', [false, true, true, true]), true)).toBe(true)
    expect(shouldNudge(null, verdict('hash-1', [false, true, true, true]), true)).toBe(true)
  })

  it('stays silent without a baseline: the gate only opens after start seeds it', () => {
    expect(shouldNudge(null, verdict('hash-1', [false]), false)).toBe(false)
  })

  it('respects the player switches: each signal mutes independently', () => {
    const prev = baselineOf(verdict('hash-1', [false]))
    const moved = verdict('hash-2', [false])
    expect(shouldNudge(prev, moved, false, { onChange: false, onError: true })).toBe(false)
    expect(shouldNudge(prev, verdict('hash-1', [false]), true, { onChange: true, onError: false })).toBe(false)
    // Both off: nothing typed in the terminal ever wakes the mentor.
    expect(shouldNudge(prev, moved, true, { onChange: false, onError: false })).toBe(false)
    // Omitted prefs keep both signals on.
    expect(shouldNudge(prev, moved, false)).toBe(true)
  })
})
