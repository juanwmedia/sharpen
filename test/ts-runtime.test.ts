import { InMemoryFs } from 'just-bash'
import { describe, expect, it } from 'vitest'
import { callExport, loadExport, valuesEqual } from '../engine/ts-runtime.ts'

describe('valuesEqual', () => {
  it('treats object key order as irrelevant', () => {
    expect(valuesEqual({ user: 'Ada', theme: 'dark' }, { theme: 'dark', user: 'Ada' })).toBe(true)
  })

  it('compares nested structures and arrays', () => {
    expect(valuesEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(valuesEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false)
  })
})

describe('callExport', () => {
  async function withFile(source: string) {
    const fs = new InMemoryFs()
    await fs.mkdir('/w/src', { recursive: true })
    await fs.writeFile('/w/src/mod.ts', source)
    return fs
  }

  it('awaits a resolved Promise and returns its value', async () => {
    const fs = await withFile(`
export function go(): Promise<string> {
  return Promise.resolve('ok')
}
`)
    const result = await callExport(fs, '/w', 'src/mod.ts', 'go', [])
    expect(result).toEqual({ ok: true, value: 'ok', stdout: '' })
  })

  it('marks a thrown / rejected call as reason reject', async () => {
    const fs = await withFile(`
export async function go(): Promise<never> {
  throw new Error('ORDER_500 upstream')
}
`)
    const result = await callExport(fs, '/w', 'src/mod.ts', 'go', [])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('reject')
    expect(result.error).toContain('ORDER_500')
  })

  it('marks missing file / export as reason harness', async () => {
    const fs = new InMemoryFs()
    await fs.mkdir('/w', { recursive: true })
    const missing = await callExport(fs, '/w', 'src/nope.ts', 'go', [])
    expect(missing.ok).toBe(false)
    if (missing.ok) throw new Error('unreachable')
    expect(missing.reason).toBe('harness')

    const fs2 = await withFile(`export function other() { return 1 }\n`)
    const noExport = await callExport(fs2, '/w', 'src/mod.ts', 'go', [])
    expect(noExport.ok).toBe(false)
    if (noExport.ok) throw new Error('unreachable')
    expect(noExport.reason).toBe('harness')
  })

  it('loadExport keeps one module instance across calls (sameRef)', async () => {
    const fs = await withFile(`
let n = 0
export function get(): { id: number } {
  n += 1
  return { id: n }
}
`)
    const loaded = await loadExport(fs, '/w', 'src/mod.ts', 'get')
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw new Error('unreachable')
    const a = await loaded.call()
    const b = await loaded.call()
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) throw new Error('unreachable')
    expect(Object.is(a.value, b.value)).toBe(false)
    expect(a.value).toEqual({ id: 1 })
    expect(b.value).toEqual({ id: 2 })
  })

  it('loadExport same instance sees mutation bleeds', async () => {
    const fs = await withFile(`
const FLAGS = { beta: false }
export function getFlags() { return FLAGS }
`)
    const loaded = await loadExport(fs, '/w', 'src/mod.ts', 'getFlags')
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw new Error('unreachable')
    const first = await loaded.call()
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error('unreachable')
    ;(first.value as { beta: boolean }).beta = true
    const second = await loaded.call()
    expect(second.ok).toBe(true)
    if (!second.ok) throw new Error('unreachable')
    expect((second.value as { beta: boolean }).beta).toBe(true)
  })

  it('loadExport same instance sees array push bleeds; copy does not', async () => {
    const live = await withFile(`
const STOCK = ['pen', 'ink']
export function getStock() { return STOCK }
`)
    const liveLoaded = await loadExport(live, '/w', 'src/mod.ts', 'getStock')
    expect(liveLoaded.ok).toBe(true)
    if (!liveLoaded.ok) throw new Error('unreachable')
    const a = await liveLoaded.call()
    expect(a.ok).toBe(true)
    if (!a.ok) throw new Error('unreachable')
    ;(a.value as string[]).push('leak')
    const b = await liveLoaded.call()
    expect(b.ok).toBe(true)
    if (!b.ok) throw new Error('unreachable')
    expect((b.value as string[]).length).toBe(3)

    const copy = await withFile(`
const STOCK = ['pen', 'ink']
export function getStock() { return [...STOCK] }
`)
    const copyLoaded = await loadExport(copy, '/w', 'src/mod.ts', 'getStock')
    expect(copyLoaded.ok).toBe(true)
    if (!copyLoaded.ok) throw new Error('unreachable')
    const c = await copyLoaded.call()
    expect(c.ok).toBe(true)
    if (!c.ok) throw new Error('unreachable')
    ;(c.value as string[]).push('leak')
    const d = await copyLoaded.call()
    expect(d.ok).toBe(true)
    if (!d.ok) throw new Error('unreachable')
    expect(d.value).toEqual(['pen', 'ink'])
  })
})
