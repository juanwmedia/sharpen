// Bridges just-bash's IFileSystem to isomorphic-git's PromiseFsClient so both
// the shell and git operate on the SAME virtual filesystem. Contracts verified
// in docs/api-notes.md: read that before changing anything here.

const CODE_RE = /^(E[A-Z]+):/

function nodeify(err) {
  if (err instanceof Error && !err.code) {
    const match = CODE_RE.exec(err.message)
    if (match) err.code = match[1]
  }
  throw err
}

// isomorphic-git normalizes stats with `x % MAX_UINT32`: every numeric field
// must exist or the index gets poisoned with NaN.
function toNodeStat(s) {
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

export function createGitFs(jbFs) {
  const promises = {
    async readFile(path, options) {
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
    async writeFile(path, data, options) {
      const encoding = typeof options === 'string' ? options : options?.encoding
      try {
        await jbFs.writeFile(path, data, encoding ? { encoding } : undefined)
      } catch (err) {
        nodeify(err)
      }
    },
    async unlink(path) {
      try {
        await jbFs.rm(path)
      } catch (err) {
        nodeify(err)
      }
    },
    async readdir(path) {
      try {
        return await jbFs.readdir(path)
      } catch (err) {
        nodeify(err)
      }
    },
    async mkdir(path) {
      try {
        await jbFs.mkdir(path)
      } catch (err) {
        nodeify(err)
      }
    },
    async rmdir(path) {
      try {
        await jbFs.rm(path)
      } catch (err) {
        nodeify(err)
      }
    },
    async stat(path) {
      try {
        return toNodeStat(await jbFs.stat(path))
      } catch (err) {
        nodeify(err)
      }
    },
    async lstat(path) {
      try {
        return toNodeStat(await jbFs.lstat(path))
      } catch (err) {
        nodeify(err)
      }
    },
    async readlink(path) {
      try {
        return await jbFs.readlink(path)
      } catch (err) {
        nodeify(err)
      }
    },
    async symlink(target, path) {
      try {
        await jbFs.symlink(target, path)
      } catch (err) {
        nodeify(err)
      }
    },
    async chmod(path, mode) {
      try {
        await jbFs.chmod(path, mode)
      } catch (err) {
        nodeify(err)
      }
    },
  }
  return { promises }
}
