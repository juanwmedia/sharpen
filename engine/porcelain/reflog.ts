import type { IFileSystem } from 'just-bash'

// Minimal deterministic reflog for the arena. isomorphic-git has no general
// reflog; we append the same on-disk format real git uses under .git/logs/
// so `git reflog` and `HEAD@{n}` resolve like the real tool.

export interface ReflogAuthor {
  name: string
  email: string
  timestamp: number
  timezoneOffset: number
}

export interface ReflogEntry {
  oldOid: string
  newOid: string
  message: string
}

const ZERO = '0'.repeat(40)

function logPath(dir: string, ref: string): string {
  // HEAD -> .git/logs/HEAD; refs/heads/main -> .git/logs/refs/heads/main
  if (ref === 'HEAD') return `${dir}/.git/logs/HEAD`
  if (ref.startsWith('refs/')) return `${dir}/.git/logs/${ref}`
  return `${dir}/.git/logs/refs/heads/${ref}`
}

function formatTz(offsetMinutes: number): string {
  const sign = offsetMinutes <= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${sign}${hh}${mm}`
}

async function ensureParent(jbFs: IFileSystem, filePath: string): Promise<void> {
  const slash = filePath.lastIndexOf('/')
  if (slash <= 0) return
  const parent = filePath.slice(0, slash)
  if (!(await jbFs.exists(parent))) await jbFs.mkdir(parent, { recursive: true })
}

/** Append one reflog line for HEAD and, when on a branch, that branch tip. */
export async function appendReflog(
  jbFs: IFileSystem,
  dir: string,
  opts: {
    oldOid: string | null
    newOid: string
    author: ReflogAuthor
    message: string
    /** Also write the branch log (refs/heads/<name>). */
    branch?: string | null
  }
): Promise<void> {
  const oldOid = opts.oldOid && /^[0-9a-f]{40}$/i.test(opts.oldOid) ? opts.oldOid : ZERO
  const line =
    `${oldOid} ${opts.newOid} ${opts.author.name} <${opts.author.email}> ` +
    `${opts.author.timestamp} ${formatTz(opts.author.timezoneOffset)}\t${opts.message}\n`

  for (const ref of ['HEAD', ...(opts.branch ? [`refs/heads/${opts.branch}`] : [])]) {
    const path = logPath(dir, ref)
    await ensureParent(jbFs, path)
    const prev = (await jbFs.exists(path)) ? await jbFs.readFile(path, 'utf8') : ''
    await jbFs.writeFile(path, prev + line)
  }
}

export async function readReflog(
  jbFs: IFileSystem,
  dir: string,
  ref = 'HEAD'
): Promise<ReflogEntry[]> {
  const path = logPath(dir, ref)
  if (!(await jbFs.exists(path))) return []
  const text = await jbFs.readFile(path, 'utf8')
  const entries: ReflogEntry[] = []
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    const tab = raw.indexOf('\t')
    if (tab < 0) continue
    const meta = raw.slice(0, tab)
    const message = raw.slice(tab + 1)
    const parts = meta.split(' ')
    if (parts.length < 2) continue
    const oldOid = parts[0]!
    const newOid = parts[1]!
    entries.push({ oldOid, newOid, message })
  }
  return entries
}

/** Resolve HEAD@{n} (n=0 is the newest entry). */
export async function resolveReflogAt(
  jbFs: IFileSystem,
  dir: string,
  index: number,
  ref = 'HEAD'
): Promise<string | null> {
  const entries = await readReflog(jbFs, dir, ref)
  if (!entries.length || index < 0 || index >= entries.length) return null
  // File order is oldest-first; display/index is newest-first.
  const entry = entries[entries.length - 1 - index]!
  return entry.newOid
}

/** Format like `git reflog` / `git reflog -n N` (newest first). */
export function formatReflog(entries: ReflogEntry[], limit?: number): string {
  const newestFirst = [...entries].reverse()
  const slice = limit !== undefined ? newestFirst.slice(0, limit) : newestFirst
  if (!slice.length) return ''
  return (
    slice
      .map((e, i) => `${e.newOid.slice(0, 7)} HEAD@{${i}}: ${e.message}`)
      .join('\n') + '\n'
  )
}
