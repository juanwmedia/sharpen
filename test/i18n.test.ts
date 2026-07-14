import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import en from '../src/shared/i18n/locales/en.ts'
import es from '../src/shared/i18n/locales/es.ts'

// A locale that drifts breaks the UI silently (raw keys or broken
// interpolations on screen), so both dictionaries must stay isomorphic.

type Messages = Record<string, unknown>

function keyPaths(obj: Messages, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'object' && value !== null ? keyPaths(value as Messages, path) : [path]
  })
}

function valueAt(obj: Messages, path: string): string {
  let node: unknown = obj
  for (const part of path.split('.')) node = (node as Messages)[part]
  return String(node)
}

function params(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort()
}

describe('i18n locales', () => {
  it('es mirrors en key for key', () => {
    expect(keyPaths(es as Messages).sort()).toEqual(keyPaths(en as Messages).sort())
  })

  it('every message keeps the same interpolation params in both languages', () => {
    for (const path of keyPaths(en as Messages)) {
      expect(params(valueAt(es as Messages, path)), `params of "${path}"`).toEqual(
        params(valueAt(en as Messages, path))
      )
    }
  })

  // Regression guard: intlify gives @ and | special meaning, so an unescaped
  // one compiles fine at build time and explodes at render time (it silently
  // unmounted the whole TerminalPane once). Compile every message for real.
  it('every message compiles with the real vue-i18n compiler', () => {
    for (const locale of ['en', 'es'] as const) {
      const i18n = createI18n({ legacy: false, locale, messages: { en, es } })
      for (const path of keyPaths(en as Messages)) {
        expect(() => i18n.global.t(path), `${locale} "${path}"`).not.toThrow()
      }
    }
  })
})
