import * as git from 'isomorphic-git'
import type { FsClient } from 'isomorphic-git'
import { Bash, InMemoryFs } from 'just-bash'
import { createGitFs } from './fs-bridge.ts'
import { dirname, join } from './paths.ts'
import { createRunCommand } from './run-command.ts'
import { createWritefileCommand } from './writefile-command.ts'
import { stateHash } from './snapshot.ts'
import { listWorkspaceFiles } from './ts-runtime.ts'
import type { Arena, Scenario, ScenarioSetupEnv, Snapshot } from './types.ts'

export const WORKSPACE_DIR = '/repo'

async function takeTsSnapshot(jbFs: InMemoryFs, dir: string): Promise<Snapshot> {
  const paths = await listWorkspaceFiles(jbFs, dir)
  const files: Record<string, string> = {}
  for (const rel of paths) {
    files[rel] = await jbFs.readFile(`${dir}/${rel}`, 'utf8')
  }
  // Git-shaped shell so existing board/types keep compiling; kind=ts board
  // reads `files` instead of statusMatrix.
  return {
    head: { oid: null, branch: 'workspace' },
    branches: {},
    status: [],
    log: [],
    files,
  }
}

function stubGit(name: string): never {
  throw new Error(`ts arena: git.${name} is not available (kind=ts)`)
}

/** TypeScript workspace arena: virtual FS + bash + `run`, no git porcelain. */
export async function createTsArena(scenario: Scenario): Promise<Arena> {
  const jbFs = new InMemoryFs()
  const gitFs = createGitFs(jbFs)
  const fs = gitFs as unknown as FsClient
  const dir = WORKSPACE_DIR

  await jbFs.mkdir(dir, { recursive: true })
  // Minimal git init so Arena.git / gitFs stay typed; no porcelain is registered.
  await git.init({ fs, dir, defaultBranch: 'workspace' })

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
    async add() {
      stubGit('add')
    },
    async commit() {
      stubGit('commit')
    },
    async branch() {
      stubGit('branch')
    },
    async checkout() {
      stubGit('checkout')
    },
    async reset() {
      stubGit('reset')
    },
  }
  await scenario.setup(setup)

  const runCommand = createRunCommand({ jbFs, dir })
  const writefileCommand = createWritefileCommand({ jbFs, dir })
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
    customCommands: [runCommand, writefileCommand],
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
    async exec(command) {
      const result = await bash.exec(command, { cwd })
      if (result.env?.PWD) cwd = result.env.PWD
      return result
    },
    snapshot: () => takeTsSnapshot(jbFs, dir),
    async verdict() {
      const snapshot = await takeTsSnapshot(jbFs, dir)
      const ctx = { snapshot, fs: jbFs, gitFs, git, dir }
      const result = await scenario.assert(ctx)
      const lost = scenario.lostChecks ? await scenario.lostChecks(ctx) : []
      return { ...result, lost, stateHash: await stateHash(snapshot) }
    },
  }
}
