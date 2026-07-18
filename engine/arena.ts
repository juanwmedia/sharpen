import * as git from 'isomorphic-git'
import type { FsClient } from 'isomorphic-git'
import { Bash, InMemoryFs } from 'just-bash'
import { createGitFs } from './fs-bridge.ts'
import { createGitCommand } from './porcelain/git-command.ts'
import { appendReflog } from './porcelain/reflog.ts'
import { dirname, join } from './paths.ts'
import { takeSnapshot, stateHash } from './snapshot.ts'
import { ARENA_DEFAULT_BRANCH } from './types.ts'
import type { Arena, Scenario, ScenarioSetupEnv } from './types.ts'

export const REPO_DIR = '/repo'
const SETUP_AUTHOR = { name: 'Riley Ortega', email: 'riley@sharpen.local' }
// 2026-01-01T00:00:00Z. A fixed clock keeps scenario OIDs deterministic,
// which is what makes evidence replayable byte for byte.
const BASE_TIMESTAMP = 1767225600

// One arena = one scenario attempt: a fresh virtual filesystem shared by the
// shell and git, a repo built by the scenario's deterministic setup, and a
// bash whose `git` is our porcelain. Runs identically in browser and Node;
// that symmetry is what makes CI replay validation possible later.
export async function createArena(scenario: Scenario): Promise<Arena> {
  const jbFs = new InMemoryFs()
  const gitFs = createGitFs(jbFs)
  // GitFs erases the named PromiseFsClient keys behind a Record (see
  // types.ts), so it is not directly assignable to FsClient; convert once.
  const fs = gitFs as unknown as FsClient
  const dir = REPO_DIR

  let tick = 0
  const clock = () => ({ timestamp: BASE_TIMESTAMP + tick++ * 60, timezoneOffset: 0 })

  await jbFs.mkdir(dir, { recursive: true })
  await git.init({ fs, dir, defaultBranch: ARENA_DEFAULT_BRANCH })

  const setup: ScenarioSetupEnv = {
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
      for (const p of paths) {
        // Real git stages deletions too (`git add <gone-path>` records the
        // removal); isomorphic-git splits that into add/remove, so mirror it.
        if (await jbFs.exists(join(dir, p))) {
          await git.add({ fs, dir, filepath: p })
        } else {
          await git.remove({ fs, dir, filepath: p })
        }
      }
    },
    async commit(message) {
      let oldOid: string | null = null
      try {
        oldOid = await git.resolveRef({ fs, dir, ref: 'HEAD' })
      } catch {
        /* unborn HEAD */
      }
      const when = clock()
      const author = { ...SETUP_AUTHOR, ...when }
      const oid = await git.commit({ fs, dir, message, author, committer: author })
      const branch = (await git.currentBranch({ fs, dir, fullname: false })) ?? ARENA_DEFAULT_BRANCH
      const kind = oldOid ? 'commit' : 'commit (initial)'
      await appendReflog(jbFs, dir, {
        oldOid,
        newOid: oid,
        author: { ...SETUP_AUTHOR, ...when },
        message: `${kind}: ${message.split('\n')[0]}`,
        branch,
      })
      return oid
    },
    async branch(name, { checkout = false } = {}) {
      const head = await git.resolveRef({ fs, dir, ref: 'HEAD' })
      const from = (await git.currentBranch({ fs, dir, fullname: false })) ?? ARENA_DEFAULT_BRANCH
      await git.branch({ fs, dir, ref: name, checkout })
      if (checkout) {
        const when = clock()
        await appendReflog(jbFs, dir, {
          oldOid: head,
          newOid: head,
          author: { ...SETUP_AUTHOR, ...when },
          message: `checkout: moving from ${from} to ${name}`,
          branch: name,
        })
      }
    },
    async checkout(ref) {
      const oldOid = await git.resolveRef({ fs, dir, ref: 'HEAD' })
      const oldBranch = (await git.currentBranch({ fs, dir, fullname: false })) ?? 'HEAD'
      await git.checkout({ fs, dir, ref })
      const newOid = await git.resolveRef({ fs, dir, ref: 'HEAD' })
      const when = clock()
      await appendReflog(jbFs, dir, {
        oldOid,
        newOid,
        author: { ...SETUP_AUTHOR, ...when },
        message: `checkout: moving from ${oldBranch} to ${ref}`,
        branch: (await git.currentBranch({ fs, dir, fullname: false })) ?? undefined,
      })
    },
    async reset({ mode, to }) {
      const branch = (await git.currentBranch({ fs, dir, fullname: false })) ?? ARENA_DEFAULT_BRANCH
      const oldOid = await git.resolveRef({ fs, dir, ref: 'HEAD' })
      let targetOid: string
      if (to === 'HEAD' || to === 'HEAD~' || /^HEAD~\d+$/.test(to)) {
        const n = to === 'HEAD' ? 0 : to === 'HEAD~' ? 1 : Number(to.slice(5))
        const log = await git.log({ fs, dir, depth: n + 1 })
        const entry = log[n]
        if (!entry) throw new Error(`setup reset: cannot resolve ${to}`)
        targetOid = entry.oid
      } else {
        targetOid = await git.resolveRef({ fs, dir, ref: to })
      }
      await git.writeRef({ fs, dir, ref: `refs/heads/${branch}`, value: targetOid, force: true })
      if (mode === 'hard') {
        // Branch name, not oid: oid checkout detaches HEAD in isomorphic-git.
        await git.checkout({ fs, dir, ref: branch, force: true })
      }
      await git.writeRef({
        fs,
        dir,
        ref: 'HEAD',
        value: `refs/heads/${branch}`,
        symbolic: true,
        force: true,
      })
      const when = clock()
      await appendReflog(jbFs, dir, {
        oldOid,
        newOid: targetOid,
        author: { ...SETUP_AUTHOR, ...when },
        message: `reset: moving to ${to}`,
        branch,
      })
    },
  }
  await scenario.setup(setup)

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
    scenario,
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
      const ctx = { snapshot, fs: jbFs, gitFs, git, dir }
      const result = await scenario.assert(ctx)
      const lost = scenario.lostChecks ? await scenario.lostChecks(ctx) : []
      return { ...result, lost, stateHash: await stateHash(snapshot) }
    },
  }
}
