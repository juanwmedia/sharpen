import { InMemoryFs } from 'just-bash'
import { describe, expect, it } from 'vitest'
import { createGitFs } from '../engine/fs-bridge.ts'

// The GitFs contract erases parameter types behind a Record (see types.ts);
// tests talk to the bridge through the shape isomorphic-git actually uses.
interface NodeStatLike {
  dev: number
  ino: number
  uid: number
  gid: number
  mode: number
  size: number
  mtimeMs: number
  ctimeMs: number
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

interface BridgePromises {
  readFile(path: string, options?: string): Promise<string | Uint8Array>
  writeFile(path: string, data: string | Uint8Array): Promise<void>
  mkdir(path: string): Promise<void>
  stat(path: string): Promise<NodeStatLike>
  lstat(path: string): Promise<NodeStatLike>
}

function bridge() {
  const jbFs = new InMemoryFs()
  const p = createGitFs(jbFs).promises as unknown as BridgePromises
  return { jbFs, p }
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
    return undefined
  } catch (err) {
    return (err as NodeJS.ErrnoException).code
  }
}

describe('fs-bridge error contract', () => {
  // isomorphic-git keys error handling off err.code; just-bash errors only
  // carry the code in the message prefix, so the bridge must derive it.
  it('read of a missing file surfaces err.code ENOENT', async () => {
    const { p } = bridge()
    expect(await codeOf(p.readFile('/nope.txt', 'utf8'))).toBe('ENOENT')
  })

  it('stat of a missing path surfaces err.code ENOENT', async () => {
    const { p } = bridge()
    expect(await codeOf(p.stat('/missing'))).toBe('ENOENT')
  })

  it('mkdir without an existing parent surfaces err.code ENOENT', async () => {
    const { p } = bridge()
    expect(await codeOf(p.mkdir('/deep/nested/dir'))).toBe('ENOENT')
  })
})

describe('fs-bridge stat shape', () => {
  // isomorphic-git normalizes stats with `x % MAX_UINT32`: a single undefined
  // numeric field poisons the index with NaN.
  it('file stats carry every numeric field and type methods', async () => {
    const { jbFs, p } = bridge()
    await jbFs.writeFile('/file.txt', 'hello')
    const s = await p.stat('/file.txt')
    for (const field of ['dev', 'ino', 'uid', 'gid', 'mode', 'size'] as const) {
      expect(typeof s[field], field).toBe('number')
      expect(Number.isNaN(s[field]), field).toBe(false)
    }
    expect(typeof s.mtimeMs).toBe('number')
    expect(typeof s.ctimeMs).toBe('number')
    expect(s.size).toBe(5)
    expect(s.isFile()).toBe(true)
    expect(s.isDirectory()).toBe(false)
    expect(s.isSymbolicLink()).toBe(false)
  })

  it('directory stats report isDirectory()', async () => {
    const { jbFs, p } = bridge()
    await jbFs.mkdir('/dir')
    const s = await p.lstat('/dir')
    expect(s.isDirectory()).toBe(true)
    expect(s.isFile()).toBe(false)
    expect(typeof s.mtimeMs).toBe('number')
  })
})
