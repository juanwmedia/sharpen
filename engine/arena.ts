import * as git from 'isomorphic-git'
import type { FsClient } from 'isomorphic-git'
import { Bash, InMemoryFs } from 'just-bash'
import { createGitFs } from './fs-bridge.ts'
import { createGitCommand } from './porcelain/git-command.ts'
import { dirname, join } from './paths.ts'
import { takeSnapshot, stateHash } from './snapshot.ts'
import type { Arena, Challenge, ChallengeSetupEnv } from './types.ts'

export const REPO_DIR = '/repo'
const SETUP_AUTHOR = { name: 'Riley Ortega', email: 'riley@sharpen.local' }
// 2026-01-01T00:00:00Z. A fixed clock keeps challenge OIDs deterministic,
// which is what makes evidence replayable byte for byte.
const BASE_TIMESTAMP = 1767225600

// One arena = one challenge attempt: a fresh virtual filesystem shared by the
// shell and git, a repo built by the challenge's deterministic setup, and a
// bash whose `git` is our porcelain. Runs identically in browser and Node;
// that symmetry is what makes CI replay validation possible later.
export async function createArena(challenge: Challenge): Promise<Arena> {
  const jbFs = new InMemoryFs()
  const gitFs = createGitFs(jbFs)
  // GitFs erases the named PromiseFsClient keys behind a Record (see
  // types.ts), so it is not directly assignable to FsClient; convert once.
  const fs = gitFs as unknown as FsClient
  const dir = REPO_DIR

  let tick = 0
  const clock = () => ({ timestamp: BASE_TIMESTAMP + tick++ * 60, timezoneOffset: 0 })

  await jbFs.mkdir(dir, { recursive: true })
  await git.init({ fs, dir, defaultBranch: 'main' })

  const setup: ChallengeSetupEnv = {
    fs: jbFs,
    git,
    gitFs,
    dir,
    async write(path, content) {
      const absolute = join(dir, path)
      const parent = dirname(absolute)
      if (!(await jbFs.exists(parent))) await jbFs.mkdir(parent, { recursive: true })
      await jbFs.writeFile(absolute, content)
    },
    async remove(path) {
      await jbFs.rm(join(dir, path), { recursive: true, force: true })
    },
    async add(...paths) {
      for (const p of paths) await git.add({ fs, dir, filepath: p })
    },
    async commit(message) {
      const author = { ...SETUP_AUTHOR, ...clock() }
      return git.commit({ fs, dir, message, author, committer: author })
    },
    async branch(name, { checkout = false } = {}) {
      await git.branch({ fs, dir, ref: name, checkout })
    },
    async checkout(ref) {
      await git.checkout({ fs, dir, ref })
    },
  }
  await challenge.setup(setup)

  const gitCommand = createGitCommand({ gitFs, jbFs, dir, clock })
  const bash = new Bash({
    fs: jbFs,
    cwd: dir,
    env: {
      HOME: '/root',
      USER: 'you',
      SHELL: '/bin/bash',
      TERM: 'xterm-256color',
      PS1: '$ ',
    },
    customCommands: [gitCommand],
  })

  let cwd = dir

  return {
    challenge,
    jbFs,
    gitFs,
    bash,
    dir,
    git,
    get cwd() {
      return cwd
    },
    // Single execution path for the browser shell, tests, and future CI
    // replay: cwd is threaded through env.PWD (see docs/api-notes.md).
    async exec(command) {
      const result = await bash.exec(command, { cwd })
      if (result.env?.PWD) cwd = result.env.PWD
      return result
    },
    snapshot: () => takeSnapshot({ fs: gitFs, dir }),
    async verdict() {
      const snapshot = await takeSnapshot({ fs: gitFs, dir })
      const result = await challenge.assert({ snapshot, fs: jbFs, gitFs, git, dir })
      return { ...result, stateHash: await stateHash(snapshot) }
    },
  }
}
