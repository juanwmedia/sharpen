// Bridges just-bash's IFileSystem to isomorphic-git's PromiseFsClient so both
// the shell and git operate on the SAME virtual filesystem. Contracts verified
// in docs/api-notes.md: read that before changing anything here.

import type { BufferEncoding, FsStat, IFileSystem } from 'just-bash'
import type { GitFs } from './types.ts'

// isomorphic-git passes either an encoding string or an options bag.
type EncodingOption = BufferEncoding | { encoding?: BufferEncoding | null }

const CODE_RE = /^(E[A-Z]+):/

// just-bash errors carry Node-style messages but no `.code`; isomorphic-git
// keys its error handling off `err.code`, so derive it from the message.
function nodeify(err: unknown): never {
  if (err instanceof Error) {
    const errno = err as NodeJS.ErrnoException
    if (!errno.code) {
      const match = CODE_RE.exec(err.message)
      if (match) errno.code = match[1]
    }
  }
  throw err
}

// isomorphic-git normalizes stats with `x % MAX_UINT32`: every numeric field
// must exist or the index gets poisoned with NaN.
function toNodeStat(s: FsStat) {
  const mtimeMs = s.mtime.valueOf()
  return {
    dev: 1,
    ino: 0,
    uid: 0,
    gid: 0,
    mode: s.mode,
    size: s.size,
    mtimeMs,
    ctimeMs: mtimeMs,
    mtime: s.mtime,
    ctime: s.mtime,
    isFile: () => s.isFile,
    isDirectory: () => s.isDirectory,
    isSymbolicLink: () => s.isSymbolicLink,
  }
}

export function createGitFs(jbFs: IFileSystem): GitFs {
  const promises = {
    async readFile(path: string, options?: EncodingOption): Promise<string | Uint8Array> {
      const encoding = typeof options === 'string' ? options : options?.encoding
      try {
        if (encoding === 'utf8' || encoding === 'utf-8') {
          return await jbFs.readFile(path, 'utf8')
        }
        return await jbFs.readFileBuffer(path)
      } catch (err) {
        nodeify(err)
      }
    },
    async writeFile(path: string, data: string | Uint8Array, options?: EncodingOption): Promise<void> {
      const encoding = typeof options === 'string' ? options : options?.encoding
      try {
        await jbFs.writeFile(path, data, encoding ? { encoding } : undefined)
      } catch (err) {
        nodeify(err)
      }
    },
    async unlink(path: string): Promise<void> {
      try {
        await jbFs.rm(path)
      } catch (err) {
        nodeify(err)
      }
    },
    async readdir(path: string): Promise<string[]> {
      try {
        return await jbFs.readdir(path)
      } catch (err) {
        nodeify(err)
      }
    },
    async mkdir(path: string): Promise<void> {
      try {
        await jbFs.mkdir(path)
      } catch (err) {
        nodeify(err)
      }
    },
    async rmdir(path: string): Promise<void> {
      try {
        await jbFs.rm(path)
      } catch (err) {
        nodeify(err)
      }
    },
    async stat(path: string) {
      try {
        return toNodeStat(await jbFs.stat(path))
      } catch (err) {
        nodeify(err)
      }
    },
    async lstat(path: string) {
      try {
        return toNodeStat(await jbFs.lstat(path))
      } catch (err) {
        nodeify(err)
      }
    },
    async readlink(path: string): Promise<string> {
      try {
        return await jbFs.readlink(path)
      } catch (err) {
        nodeify(err)
      }
    },
    async symlink(target: string, path: string): Promise<void> {
      try {
        await jbFs.symlink(target, path)
      } catch (err) {
        nodeify(err)
      }
    },
    async chmod(path: string, mode: number): Promise<void> {
      try {
        await jbFs.chmod(path, mode)
      } catch (err) {
        nodeify(err)
      }
    },
  }
  return { promises }
}
