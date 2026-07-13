import * as git from 'isomorphic-git'
import type { FsClient } from 'isomorphic-git'
import { defineCommand } from 'just-bash'
import type { Command, ExecResult, IFileSystem } from 'just-bash'
import { dirname, repoRelative, resolve } from '../paths.ts'
import type { GitFs, StatusRow } from '../types.ts'

// Hand-written git porcelain over isomorphic-git. This is the layer that makes
// the arena feel like real git: faithful output, faithful refusals, and
// state-changing semantics that hold up when the player probes them.
// Whitelisted per design: anything not implemented says so honestly.

const ANSI = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
}

const PLAYER = { name: 'you', email: 'you@sharpen.arena' }

// Implemented elsewhere in git but intentionally absent here (yet). Kept
// separate from unknown commands so the arena never lies about what git is.
const NOT_IN_ARENA = [
  'rebase', 'reflog', 'stash', 'reset', 'revert', 'cherry-pick', 'merge',
  'diff', 'mv', 'bisect', 'remote', 'push', 'pull', 'fetch', 'tag', 'clone',
  'show', 'blame', 'apply', 'format-patch', 'worktree', 'submodule',
]

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0 })
const fail = (stderr: string, exitCode = 1): ExecResult => ({ stdout: '', stderr, exitCode })

// isomorphic-git errors carry code/data/message; a cast keeps the original
// output byte-identical (including "undefined" for message-less throws).
interface GitErrorLike {
  code?: string
  message?: string
  data?: { filepaths?: string[] }
}
const gitError = (err: unknown): GitErrorLike => err as GitErrorLike

function shortOid(oid: string): string {
  return oid.slice(0, 7)
}

export interface GitCommandDeps {
  gitFs: GitFs
  jbFs: IFileSystem
  dir: string
  clock: () => { timestamp: number; timezoneOffset: number }
}

// --- status matrix interpretation -----------------------------------------
// Row: [filepath, head(0|1), workdir(0|1|2), stage(0|1|2|3)]

function classifyRow([, head, workdir, stage]: StatusRow) {
  return {
    untracked: head === 0 && workdir === 2 && stage === 0,
    stagedNew: head === 0 && stage >= 2,
    stagedModified: head === 1 && stage >= 2,
    stagedDeleted: head === 1 && workdir !== 1 && stage === 0,
    unstagedModified: workdir === 2 && (stage === 1 || stage === 3),
    unstagedDeleted: workdir === 0 && stage >= 1,
    clean: head === 1 && workdir === 1 && stage === 1,
  }
}

function shortStatusCode(row: StatusRow): string {
  const c = classifyRow(row)
  if (c.untracked) return '??'
  let index = ' '
  let worktree = ' '
  if (c.stagedNew) index = 'A'
  else if (c.stagedModified) index = 'M'
  else if (c.stagedDeleted) index = 'D'
  if (c.unstagedModified) worktree = 'M'
  else if (c.unstagedDeleted) worktree = 'D'
  return index + worktree
}

// --- context helpers --------------------------------------------------------

export function createGitCommand({ gitFs, jbFs, dir, clock }: GitCommandDeps): Command {
  // GitFs erases the named PromiseFsClient keys behind a Record (see
  // types.ts), so it is not directly assignable to FsClient; convert once.
  const fs = gitFs as unknown as FsClient

  function toRepoPath(cwd: string, arg: string): string {
    const rel = repoRelative(dir, resolve(cwd, arg))
    if (rel === null) {
      throw new Error(`fatal: '${arg}' is outside repository at '${dir}'`)
    }
    return rel
  }

  // Expand a path argument (file, directory, or '.') to matching matrix rows.
  function matchRows(matrix: StatusRow[], repoPath: string): StatusRow[] {
    if (repoPath === '.') return matrix
    return matrix.filter(([file]) => file === repoPath || file.startsWith(repoPath + '/'))
  }

  async function statusMatrix(): Promise<StatusRow[]> {
    return git.statusMatrix({ fs, dir })
  }

  async function currentBranch(): Promise<string | null> {
    return (await git.currentBranch({ fs, dir, fullname: false })) ?? null
  }

  async function stageTrackedChanges(matrix: StatusRow[]): Promise<void> {
    for (const row of matrix) {
      const c = classifyRow(row)
      if (c.unstagedModified && row[1] === 1) {
        await git.add({ fs, dir, filepath: row[0] })
      } else if (c.unstagedDeleted) {
        await git.remove({ fs, dir, filepath: row[0] })
      }
    }
  }

  // --- subcommands -----------------------------------------------------------

  async function cmdStatus(args: string[]): Promise<ExecResult> {
    const short = args.includes('-s') || args.includes('--short')
    const matrix = await statusMatrix()
    const branch = await currentBranch()

    if (short) {
      const lines: string[] = []
      for (const row of matrix) {
        const code = shortStatusCode(row)
        if (code === '  ') continue
        const color = code === '??' || code[1] !== ' ' ? ANSI.red : ANSI.green
        lines.push(`${color}${code}${ANSI.reset} ${row[0]}`)
      }
      return ok(lines.length ? lines.join('\n') + '\n' : '')
    }

    const staged: string[] = []
    const unstaged: string[] = []
    const untracked: string[] = []
    for (const row of matrix) {
      const c = classifyRow(row)
      if (c.untracked) untracked.push(row[0])
      if (c.stagedNew) staged.push(`new file:   ${row[0]}`)
      else if (c.stagedModified) staged.push(`modified:   ${row[0]}`)
      else if (c.stagedDeleted) staged.push(`deleted:    ${row[0]}`)
      if (c.unstagedModified) unstaged.push(`modified:   ${row[0]}`)
      else if (c.unstagedDeleted && !c.stagedDeleted) unstaged.push(`deleted:    ${row[0]}`)
    }

    let out = `On branch ${branch ?? '(detached HEAD)'}\n`
    if (staged.length) {
      out += '\nChanges to be committed:\n  (use "git restore --staged <file>..." to unstage)\n'
      out += staged.map((l) => `\t${ANSI.green}${l}${ANSI.reset}`).join('\n') + '\n'
    }
    if (unstaged.length) {
      out += '\nChanges not staged for commit:\n'
      out += '  (use "git add <file>..." to update what will be committed)\n'
      out += '  (use "git restore <file>..." to discard changes in working directory)\n'
      out += unstaged.map((l) => `\t${ANSI.red}${l}${ANSI.reset}`).join('\n') + '\n'
    }
    if (untracked.length) {
      out += '\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n'
      out += untracked.map((f) => `\t${ANSI.red}${f}${ANSI.reset}`).join('\n') + '\n'
    }
    if (!staged.length && !unstaged.length && !untracked.length) {
      out += 'nothing to commit, working tree clean\n'
    } else if (!staged.length) {
      out += '\nno changes added to commit (use "git add" and/or "git commit -a")\n'
    }
    return ok(out)
  }

  async function cmdAdd(args: string[], cwd: string): Promise<ExecResult> {
    const paths = args.filter((a) => !a.startsWith('-'))
    const all = args.includes('-A') || args.includes('--all')
    if (!paths.length && !all) {
      return fail('Nothing specified, nothing added.\nhint: Maybe you wanted to say \'git add .\'?\n')
    }
    const matrix = await statusMatrix()
    const targets: StatusRow[] = all ? matrix : []
    if (!all) {
      for (const p of paths) {
        const repoPath = toRepoPath(cwd, p)
        const rows = matchRows(matrix, repoPath)
        if (!rows.length) {
          return fail(`fatal: pathspec '${p}' did not match any files\n`, 128)
        }
        targets.push(...rows)
      }
    }
    for (const row of targets) {
      const c = classifyRow(row)
      if (c.unstagedDeleted) await git.remove({ fs, dir, filepath: row[0] })
      else if (c.untracked || c.unstagedModified) await git.add({ fs, dir, filepath: row[0] })
    }
    return ok()
  }

  async function cmdCommit(args: string[]): Promise<ExecResult> {
    const mIndex = args.indexOf('-m')
    const all = args.includes('-a') || args.includes('-am')
    if (args.includes('-am')) args.splice(args.indexOf('-am'), 0, '-m')
    const msgIdx = args.indexOf('-m') >= 0 ? args.indexOf('-m') : mIndex
    const message = msgIdx >= 0 ? args[msgIdx + 1] : undefined
    if (!message) {
      return fail('error: no commit message provided (use git commit -m "message")\n', 1)
    }
    let matrix = await statusMatrix()
    if (all) {
      await stageTrackedChanges(matrix)
      matrix = await statusMatrix()
    }
    const hasStaged = matrix.some((row) => {
      const c = classifyRow(row)
      return c.stagedNew || c.stagedModified || c.stagedDeleted
    })
    const branch = await currentBranch()
    if (!hasStaged) {
      const dirty = matrix.some((row) => !classifyRow(row).clean)
      return fail(
        dirty
          ? `On branch ${branch}\nno changes added to commit (use "git add" and/or "git commit -a")\n`
          : `On branch ${branch}\nnothing to commit, working tree clean\n`,
        1
      )
    }
    const when = clock()
    const author = { ...PLAYER, ...when }
    const oid = await git.commit({ fs, dir, message, author, committer: author })
    return ok(`[${branch} ${shortOid(oid)}] ${message}\n`)
  }

  async function cmdLog(args: string[]): Promise<ExecResult> {
    const oneline = args.includes('--oneline')
    let depth: number | undefined
    const nIdx = args.indexOf('-n')
    if (nIdx >= 0) depth = Number(args[nIdx + 1])
    const dashN = args.find((a) => /^-\d+$/.test(a))
    if (dashN) depth = Number(dashN.slice(1))

    let commits
    try {
      commits = await git.log({ fs, dir, depth })
    } catch {
      const branch = await currentBranch()
      return fail(`fatal: your current branch '${branch}' does not have any commits yet\n`, 128)
    }
    const branch = await currentBranch()
    const decorate = (i: number) =>
      i === 0 ? ` ${ANSI.yellow}(${ANSI.cyan}HEAD -> ${ANSI.green}${branch}${ANSI.yellow})${ANSI.reset}` : ''

    if (oneline) {
      const lines = commits.map(
        (c, i) => `${ANSI.yellow}${shortOid(c.oid)}${ANSI.reset}${decorate(i)} ${c.commit.message.split('\n')[0]}`
      )
      return ok(lines.join('\n') + '\n')
    }
    const blocks = commits.map((c, i) => {
      const date = new Date(c.commit.author.timestamp * 1000).toUTCString()
      return (
        `${ANSI.yellow}commit ${c.oid}${ANSI.reset}${decorate(i)}\n` +
        `Author: ${c.commit.author.name} <${c.commit.author.email}>\n` +
        `Date:   ${date}\n\n` +
        c.commit.message.trim().split('\n').map((l) => `    ${l}`).join('\n') + '\n'
      )
    })
    return ok(blocks.join('\n'))
  }

  async function cmdBranch(args: string[]): Promise<ExecResult> {
    const flags = args.filter((a) => a.startsWith('-'))
    const names = args.filter((a) => !a.startsWith('-'))
    const first = names[0]
    if (flags.includes('-d') || flags.includes('-D')) {
      const name = first
      if (!name) return fail('fatal: branch name required\n', 128)
      try {
        await git.deleteBranch({ fs, dir, ref: name })
        return ok(`Deleted branch ${name}.\n`)
      } catch {
        return fail(`error: branch '${name}' not found.\n`, 1)
      }
    }
    if (first === undefined) {
      const branches = await git.listBranches({ fs, dir })
      const current = await currentBranch()
      const lines = branches.map((b) =>
        b === current ? `* ${ANSI.green}${b}${ANSI.reset}` : `  ${b}`
      )
      return ok(lines.join('\n') + (lines.length ? '\n' : ''))
    }
    try {
      await git.branch({ fs, dir, ref: first })
      return ok()
    } catch (err) {
      return fail(`fatal: ${gitError(err).message}\n`, 128)
    }
  }

  async function checkoutPaths(cwd: string, paths: string[]): Promise<ExecResult> {
    const matrix = await statusMatrix()
    const filepaths: string[] = []
    for (const p of paths) {
      const repoPath = toRepoPath(cwd, p)
      const rows = matchRows(matrix, repoPath).filter((row) => row[1] === 1)
      if (!rows.length) {
        return fail(`error: pathspec '${p}' did not match any file(s) known to git\n`, 1)
      }
      filepaths.push(...rows.map((row) => row[0]))
    }
    // Approximation: restores from HEAD (real git restores from the index).
    // Identical behavior whenever the path has nothing staged.
    await git.checkout({ fs, dir, force: true, filepaths })
    return ok()
  }

  async function switchBranch(name: string): Promise<ExecResult> {
    try {
      await git.checkout({ fs, dir, ref: name })
      return ok(`Switched to branch '${name}'\n`)
    } catch (err) {
      const e = gitError(err)
      if (e.code === 'NotFoundError') {
        return fail(`error: pathspec '${name}' did not match any file(s) known to git\n`, 1)
      }
      if (e.code === 'CheckoutConflictError') {
        return fail(
          'error: Your local changes to the following files would be overwritten by checkout:\n' +
            (e.data?.filepaths ?? []).map((f) => `\t${f}`).join('\n') +
            '\nPlease commit your changes or stash them before you switch branches.\nAborting\n',
          1
        )
      }
      return fail(`fatal: ${e.message}\n`, 128)
    }
  }

  async function cmdCheckout(args: string[], cwd: string): Promise<ExecResult> {
    const first = args[0]
    if (first === undefined) return fail('fatal: you must specify a branch or paths\n', 128)
    const dashdash = args.indexOf('--')
    if (dashdash >= 0) return checkoutPaths(cwd, args.slice(dashdash + 1))
    if (first === '-b') {
      const name = args[1]
      if (!name) return fail('fatal: branch name required\n', 128)
      try {
        await git.branch({ fs, dir, ref: name, checkout: true })
        return ok(`Switched to a new branch '${name}'\n`)
      } catch (err) {
        return fail(`fatal: ${gitError(err).message}\n`, 128)
      }
    }
    const branches = await git.listBranches({ fs, dir })
    if (branches.includes(first)) return switchBranch(first)
    return checkoutPaths(cwd, args)
  }

  async function cmdSwitch(args: string[]): Promise<ExecResult> {
    if (args[0] === '-c') {
      const name = args[1]
      if (!name) return fail('fatal: branch name required\n', 128)
      try {
        await git.branch({ fs, dir, ref: name, checkout: true })
        return ok(`Switched to a new branch '${name}'\n`)
      } catch (err) {
        return fail(`fatal: ${gitError(err).message}\n`, 128)
      }
    }
    const target = args[0]
    if (!target) return fail('fatal: missing branch or commit argument\n', 128)
    return switchBranch(target)
  }

  async function cmdRestore(args: string[], cwd: string): Promise<ExecResult> {
    const staged = args.includes('--staged')
    const paths = args.filter((a) => !a.startsWith('-'))
    if (!paths.length) return fail('fatal: you must specify path(s) to restore\n', 128)
    if (staged) {
      const matrix = await statusMatrix()
      for (const p of paths) {
        const repoPath = toRepoPath(cwd, p)
        const rows = matchRows(matrix, repoPath).filter((row) => {
          const c = classifyRow(row)
          return c.stagedNew || c.stagedModified || c.stagedDeleted
        })
        if (!rows.length && !matchRows(matrix, repoPath).length) {
          return fail(`error: pathspec '${p}' did not match any file(s) known to git\n`, 1)
        }
        for (const row of rows) {
          await git.resetIndex({ fs, dir, filepath: row[0] })
        }
      }
      return ok()
    }
    return checkoutPaths(cwd, paths)
  }

  async function cmdClean(args: string[], cwd: string): Promise<ExecResult> {
    let force = false
    let dryRun = false
    let dirs = false
    const paths: string[] = []
    for (const a of args) {
      if (a.startsWith('-') && a !== '--') {
        for (const ch of a.slice(1)) {
          if (ch === 'f') force = true
          else if (ch === 'n') dryRun = true
          else if (ch === 'd') dirs = true
          else return fail(`error: unknown switch '${ch}'\n`, 128)
        }
      } else if (a !== '--') {
        paths.push(a)
      }
    }
    if (!force && !dryRun) {
      return fail(
        'fatal: clean.requireForce defaults to true and neither -i, -n, nor -f given; refusing to clean\n',
        128
      )
    }

    const matrix = await statusMatrix()
    let untracked = matrix
      .filter((row) => classifyRow(row).untracked)
      .map(([file]) => file)

    if (paths.length) {
      const scopes = paths.map((p) => toRepoPath(cwd, p))
      untracked = untracked.filter((f) =>
        scopes.some((s) => f === s || f.startsWith(s + '/') || s === '.')
      )
    }

    // Directories are untracked when no tracked file lives under them.
    const trackedDirs = new Set(['.'])
    for (const row of matrix) {
      if (classifyRow(row).untracked) continue
      let d = dirname('/' + row[0]).slice(1)
      while (d) {
        trackedDirs.add(d)
        d = dirname('/' + d).slice(1)
      }
    }

    const removeFiles: string[] = []
    const removeDirs = new Set<string>()
    for (const file of untracked) {
      const parent = dirname('/' + file).slice(1)
      if (!parent || trackedDirs.has(parent)) {
        removeFiles.push(file)
      } else {
        // Topmost untracked ancestor directory.
        let top = parent
        let up = dirname('/' + top).slice(1)
        while (up && !trackedDirs.has(up)) {
          top = up
          up = dirname('/' + top).slice(1)
        }
        removeDirs.add(top + '/')
      }
    }

    const items = [...removeFiles, ...(dirs ? [...removeDirs] : [])].sort()
    const skippedDirs = dirs ? [] : [...removeDirs].sort()
    const verb = dryRun ? 'Would remove' : 'Removing'
    let out = items.map((i) => `${verb} ${i}`).join('\n')
    if (skippedDirs.length) {
      out += (out ? '\n' : '') + skippedDirs.map((d) => `Would not remove ${d}`).join('\n')
    }
    if (!dryRun) {
      for (const file of removeFiles) {
        await jbFs.rm(`${dir}/${file}`)
      }
      if (dirs) {
        for (const d of removeDirs) {
          await jbFs.rm(`${dir}/${d.slice(0, -1)}`, { recursive: true, force: true })
        }
      }
    }
    return ok(out ? out + '\n' : '')
  }

  async function cmdRm(args: string[], cwd: string): Promise<ExecResult> {
    const cached = args.includes('--cached')
    const paths = args.filter((a) => !a.startsWith('-'))
    if (!paths.length) return fail('fatal: No pathspec was given. Which files should I remove?\n', 128)
    const matrix = await statusMatrix()
    const out: string[] = []
    for (const p of paths) {
      const repoPath = toRepoPath(cwd, p)
      const rows = matchRows(matrix, repoPath).filter((row) => row[1] === 1 || row[3] >= 1)
      if (!rows.length) {
        return fail(`fatal: pathspec '${p}' did not match any files\n`, 128)
      }
      for (const row of rows) {
        await git.remove({ fs, dir, filepath: row[0] })
        if (!cached) await jbFs.rm(`${dir}/${row[0]}`, { force: true })
        out.push(`rm '${row[0]}'`)
      }
    }
    return ok(out.join('\n') + '\n')
  }

  function cmdHelp(): ExecResult {
    return ok(
      'sharpen arena git: supported commands:\n' +
        '  status [-s|--short]      add <path>|-A          commit -m <msg> [-a]\n' +
        '  log [--oneline] [-n N]   branch [--list|-d]     checkout <branch>|-b|-- <path>\n' +
        '  switch <branch>|-c       restore [--staged]     clean [-n|-f] [-d]\n' +
        '  rm [--cached] <path>\n' +
        'Anything else is real git, but not available in this arena (yet).\n'
    )
  }

  // --- dispatch ---------------------------------------------------------------

  return defineCommand('git', async (args, ctx) => {
    const [sub, ...rest] = args
    if (!sub || sub === '--help' || sub === 'help') return cmdHelp()
    if (sub === '--version') return ok('git version 2.50.0.sharpen\n')
    try {
      switch (sub) {
        case 'status':
          return await cmdStatus(rest)
        case 'add':
          return await cmdAdd(rest, ctx.cwd)
        case 'commit':
          return await cmdCommit(rest)
        case 'log':
          return await cmdLog(rest)
        case 'branch':
          return await cmdBranch(rest)
        case 'checkout':
          return await cmdCheckout(rest, ctx.cwd)
        case 'switch':
          return await cmdSwitch(rest)
        case 'restore':
          return await cmdRestore(rest, ctx.cwd)
        case 'clean':
          return await cmdClean(rest, ctx.cwd)
        case 'rm':
          return await cmdRm(rest, ctx.cwd)
        case 'init':
          return fail('fatal: this arena repo is already initialized\n', 128)
        default:
          if (NOT_IN_ARENA.includes(sub)) {
            return fail(`sharpen: 'git ${sub}' is not available in this arena (yet)\n`, 1)
          }
          return fail(`git: '${sub}' is not a git command. See 'git --help'.\n`, 1)
      }
    } catch (err) {
      return fail(`fatal: ${gitError(err).message}\n`, 128)
    }
  })
}
