// Tiny path helpers shared by engine code that must run in both Node and the
// browser bundle (so no node:path dependency).

export function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return '/' + parts.join('/')
}

export function resolve(base: string, path: string): string {
  if (path.startsWith('/')) return normalize(path)
  return normalize(base + '/' + path)
}

export function join(...parts: string[]): string {
  return normalize(parts.join('/'))
}

export function dirname(path: string): string {
  const normalized = normalize(path)
  const idx = normalized.lastIndexOf('/')
  return idx <= 0 ? '/' : normalized.slice(0, idx)
}

/** Repo-relative path for an absolute path inside the repo, or null if outside. */
export function repoRelative(repoDir: string, absolute: string): string | null {
  const normalized = normalize(absolute)
  if (normalized === repoDir) return '.'
  if (normalized.startsWith(repoDir + '/')) return normalized.slice(repoDir.length + 1)
  return null
}
