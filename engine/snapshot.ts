import * as git from 'isomorphic-git'
import type { FsClient } from 'isomorphic-git'
import type { GitFs, Snapshot } from './types.ts'

// GitFs erases the named PromiseFsClient keys behind a Record (see types.ts),
// so it is not directly assignable to FsClient; convert once per entry point.
function asFsClient(gitFs: GitFs): FsClient {
  return gitFs as unknown as FsClient
}

// A snapshot is the single source of truth for challenge assertions and for
// the evidence state hash. Assertions inspect repo STATE, never what the
// player typed, so any correct solution passes.
export async function takeSnapshot({ fs: gitFs, dir }: { fs: GitFs; dir: string }): Promise<Snapshot> {
  const fs = asFsClient(gitFs)
  let head: string | null = null
  try {
    head = await git.resolveRef({ fs, dir, ref: 'HEAD' })
  } catch {
    // Unborn HEAD (no commits yet) is a legal state.
  }

  let branch: string | null = null
  try {
    branch = (await git.currentBranch({ fs, dir, fullname: false })) ?? null
  } catch {
    branch = null
  }

  const branches: Record<string, string> = {}
  for (const name of await git.listBranches({ fs, dir })) {
    branches[name] = await git.resolveRef({ fs, dir, ref: name })
  }

  const status = await git.statusMatrix({ fs, dir })

  let log: Snapshot['log'] = []
  if (head) {
    const commits = await git.log({ fs, dir })
    log = commits.map((c) => ({ oid: c.oid, message: c.commit.message.trim() }))
  }

  return { head: { oid: head, branch }, branches, status, log }
}

export async function stateHash(snapshot: Snapshot): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(snapshot))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Convenience accessors so challenge assert() functions stay readable.
export function statusOf(snapshot: Snapshot, filepath: string): string {
  const row = snapshot.status.find(([file]) => file === filepath)
  if (!row) return 'absent'
  const [, headState, workdir, stage] = row
  if (headState === 0 && workdir === 2 && stage === 0) return 'untracked'
  if (headState === 1 && workdir === 1 && stage === 1) return 'unmodified'
  if (workdir === 2 && stage === 1) return 'modified'
  if (workdir === 2 && stage >= 2) return 'staged'
  if (workdir === 0 && stage === 0 && headState === 1) return 'deleted-staged'
  if (workdir === 0 && headState === 1) return 'deleted'
  return 'other'
}

export function untrackedFiles(snapshot: Snapshot): string[] {
  return snapshot.status
    .filter(([, head, workdir, stage]) => head === 0 && workdir === 2 && stage === 0)
    .map(([file]) => file)
}
