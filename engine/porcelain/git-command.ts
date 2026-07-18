import { structuredPatch } from 'diff'
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
  'rebase', 'reflog', 'stash', 'revert', 'cherry-pick', 'merge',
  'mv', 'bisect', 'remote', 'push', 'pull', 'fetch', 'tag', 'clone',
  'show', 'blame', 'apply', 'format-patch', 'worktree', 'submodule',
]

// Real git's diff palette, verified byte for byte against real git output:
// bold headers, cyan hunk ranges, red/green lines, and the SHORT reset (ESC[m).
const DIFF = {
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  reset: '\x1b[m',
}
const ZERO_OID = '0000000'

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0 })
const fail = (stderr: string, exitCode = 1): ExecResult => ({ stdout: '', stderr, exitCode })

/** Real git option errors exit 129 with this shape (LC_ALL=C). */
function unknownOption(flag: string, usage: string): ExecResult {
  const name = flag.replace(/^--?/, '')
  return fail(`error: unknown option \`${name}'\nusage: ${usage}\n`, 129)
}

function switchRequiresValue(sw: string): ExecResult {
  return fail(`error: switch \`${sw}' requires a value\n`, 129)
}

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
    // Real git has no --cached on status (verified LC_ALL=C, 2026-07-18).
    const unknown = args.find(
      (a) => a.startsWith('-') && a !== '--' && a !== '-s' && a !== '--short'
    )
    if (unknown) return unknownOption(unknown, 'git status [<options>] [--] [<pathspec>...]')
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
    // Supported here: paths, -A/--all. Real git rejects --cached on add
    // (that flag is rm/diff); silently ignoring it used to stage anyway
    // (verified LC_ALL=C, 2026-07-18). Flags that exist in real git but not
    // here name the arena gap instead of "unknown option".
    const ADD_SUPPORTED = new Set(['-A', '--all', '--'])
    const ADD_REAL_BUT_MISSING = new Set([
      '-u',
      '--update',
      '-p',
      '--patch',
      '-n',
      '--dry-run',
      '-f',
      '--force',
      '-v',
      '--verbose',
      '-i',
      '--interactive',
      '-N',
      '--intent-to-add',
    ])
    for (const a of args) {
      if (!a.startsWith('-') || a === '--') continue
      if (ADD_SUPPORTED.has(a)) continue
      if (ADD_REAL_BUT_MISSING.has(a)) {
        return fail(`sharpen: 'git add ${a}' is not available in this arena (yet)\n`, 1)
      }
      return unknownOption(a, 'git add [<options>] [--] <pathspec>...')
    }
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
    // Parse -a / -m / -am like real git: -am is -a plus -m, and -m always
    // requires a following value. Bare `git commit -am` used to commit with
    // message "-am" (wet-paint incident); real git exits 129 with
    // switch `m' requires a value (LC_ALL=C, 2026-07-18).
    let all = false
    let message: string | undefined
    let expectingMessage = false
    for (const a of args) {
      if (expectingMessage) {
        message = a
        expectingMessage = false
        continue
      }
      if (a === '-am') {
        all = true
        expectingMessage = true
        continue
      }
      if (a === '-a') {
        all = true
        continue
      }
      if (a === '-m') {
        expectingMessage = true
        continue
      }
      if (a.startsWith('-')) {
        return fail(`sharpen: 'git commit ${a}' is not available in this arena (yet)\n`, 1)
      }
      return fail(`sharpen: 'git commit' with path arguments is not available in this arena (yet)\n`, 1)
    }
    if (expectingMessage) return switchRequiresValue('m')
    if (message === undefined) {
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
    // Supported: --oneline, -n N, -N. Real-but-missing flags name the gap;
    // invented flags get git's unknown-option refusal.
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!
      if (!a.startsWith('-')) continue
      if (a === '--oneline' || /^-\d+$/.test(a)) continue
      if (a === '-n') {
        if (args[i + 1] === undefined || args[i + 1]!.startsWith('-')) return switchRequiresValue('n')
        i += 1
        continue
      }
      if (a === '-p' || a === '--patch' || a === '--stat' || a === '--all' || a === '--graph') {
        return fail(`sharpen: 'git log ${a}' is not available in this arena (yet)\n`, 1)
      }
      return unknownOption(a, 'git log [<options>]')
    }
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
      const current = await currentBranch()
      if (name === current) {
        // Real git refuses to delete the checked-out branch (verified
        // against real git 2026-07-17).
        return fail(`error: cannot delete branch '${name}' used by worktree at ${dir}\n`, 1)
      }
      let tip: string
      try {
        tip = await git.resolveRef({ fs, dir, ref: `refs/heads/${name}` })
      } catch {
        return fail(`error: branch '${name}' not found.\n`, 1)
      }
      if (!flags.includes('-D')) {
        // -d only deletes branches whose tip is reachable from HEAD: an
        // unmerged branch would lose commits, so real git refuses and
        // points at -D. Same probe as above.
        let merged: boolean
        try {
          const head = await git.resolveRef({ fs, dir, ref: 'HEAD' })
          merged = tip === head || (await git.isDescendent({ fs, dir, oid: head, ancestor: tip }))
        } catch {
          merged = false
        }
        if (!merged) {
          return fail(
            `error: the branch '${name}' is not fully merged\n` +
              `hint: If you are sure you want to delete it, run 'git branch -D ${name}'\n`,
            1
          )
        }
      }
      await git.deleteBranch({ fs, dir, ref: name })
      return ok(`Deleted branch ${name} (was ${shortOid(tip)}).\n`)
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
      // Real git sources the worktree copy from the INDEX, so a path whose
      // entry is gone (staged deletion) matches nothing and errors; verified
      // against real git 2026-07-17. Hence row[3] >= 1: an index entry must
      // exist. Content still comes from HEAD (approximation below).
      const rows = matchRows(matrix, repoPath).filter((row) => row[1] === 1 && row[3] >= 1)
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

  /** Uncommitted changes carried across a switch, as real git lists them. */
  async function carriedChanges(): Promise<string> {
    const matrix = await statusMatrix()
    const lines = matrix
      .map((row) => ({ file: row[0], c: classifyRow(row) }))
      .filter(({ c }) => !c.clean && !c.untracked)
      .map(({ file, c }) => {
        const letter = c.stagedNew ? 'A' : c.stagedDeleted || c.unstagedDeleted ? 'D' : 'M'
        return `${letter}\t${file}`
      })
    return lines.length ? lines.join('\n') + '\n' : ''
  }

  /** Branch switching NEVER goes through isomorphic-git's checkout(): that
   * API resets index and worktree to the target tree, which destroys
   * staged-new files (verified 2026-07-18; it cost a player their work).
   * Real git's sacred rule instead: HEAD moves as a symbolic ref, only
   * paths that DIFFER between the two commits are touched, and if any of
   * those carries local changes the switch REFUSES. Uncommitted work either
   * travels or blocks the switch; it is never lost. */
  async function switchBranch(name: string): Promise<ExecResult> {
    let targetOid: string
    try {
      targetOid = await git.resolveRef({ fs, dir, ref: `refs/heads/${name}` })
    } catch {
      return fail(`error: pathspec '${name}' did not match any file(s) known to git\n`, 1)
    }
    const current = await currentBranch()
    if (name === current) {
      return ok((await carriedChanges()) + `Already on '${name}'\n`)
    }
    const headOid = await git.resolveRef({ fs, dir, ref: 'HEAD' })

    if (targetOid !== headOid) {
      // Blobs that differ between the two commits.
      const walked = (await git.walk({
        fs,
        dir,
        trees: [git.TREE({ ref: headOid }), git.TREE({ ref: targetOid })],
        map: async (filepath, entries) => {
          const [from, to] = entries ?? []
          if (filepath === '.') return true
          const fromType = from ? await from.type() : null
          const toType = to ? await to.type() : null
          if (fromType === 'tree' || toType === 'tree') return true
          const fromOid = fromType === 'blob' ? await from!.oid() : null
          const toOid = toType === 'blob' ? await to!.oid() : null
          if (fromOid === toOid) return true
          return { filepath, toOid }
        },
      })) as unknown[]
      const diffs = (walked.flat(Infinity) as unknown[]).filter(
        (c): c is { filepath: string; toOid: string | null } => typeof c === 'object' && c !== null
      )

      const matrix = await statusMatrix()
      const state = new Map(matrix.map((row) => [row[0], classifyRow(row)]))
      const trackedConflicts: string[] = []
      const untrackedConflicts: string[] = []
      for (const d of diffs) {
        const c = state.get(d.filepath)
        if (!c || c.clean) continue
        if (c.untracked) {
          if (d.toOid) untrackedConflicts.push(d.filepath)
        } else {
          trackedConflicts.push(d.filepath)
        }
      }
      if (trackedConflicts.length) {
        return fail(
          'error: Your local changes to the following files would be overwritten by checkout:\n' +
            trackedConflicts.map((f) => `\t${f}`).join('\n') +
            '\nPlease commit your changes or stash them before you switch branches.\nAborting\n',
          1
        )
      }
      if (untrackedConflicts.length) {
        return fail(
          'error: The following untracked working tree files would be overwritten by checkout:\n' +
            untrackedConflicts.map((f) => `\t${f}`).join('\n') +
            '\nPlease move or remove them before you switch branches.\nAborting\n',
          1
        )
      }
      // Apply the target version of every differing, locally-clean path.
      for (const d of diffs) {
        if (d.toOid) {
          const absolute = `${dir}/${d.filepath}`
          const parent = dirname(absolute)
          if (!(await jbFs.exists(parent))) await jbFs.mkdir(parent, { recursive: true })
          await jbFs.writeFile(absolute, await blobText(d.toOid))
          await git.add({ fs, dir, filepath: d.filepath })
        } else {
          await jbFs.rm(`${dir}/${d.filepath}`, { force: true })
          await git.remove({ fs, dir, filepath: d.filepath })
        }
      }
    }
    await git.writeRef({ fs, dir, ref: 'HEAD', value: `refs/heads/${name}`, symbolic: true, force: true })
    return ok((await carriedChanges()) + `Switched to branch '${name}'\n`)
  }

  /** checkout -b and switch -c: create at HEAD and move the label. Never
   * touches worktree or index, so uncommitted work always travels. */
  async function createAndSwitch(name: string | undefined): Promise<ExecResult> {
    if (!name) return fail('fatal: branch name required\n', 128)
    try {
      await git.branch({ fs, dir, ref: name, checkout: true })
      return ok(`Switched to a new branch '${name}'\n`)
    } catch (err) {
      return fail(`fatal: ${gitError(err).message}\n`, 128)
    }
  }

  async function cmdCheckout(args: string[], cwd: string): Promise<ExecResult> {
    const first = args[0]
    if (first === undefined) return fail('fatal: you must specify a branch or paths\n', 128)
    // Real git: no --cached on checkout (LC_ALL=C, 2026-07-18). Supported
    // here: -b, -- <paths>, branch name, pathspecs.
    const dashdash = args.indexOf('--')
    const flagArgs = (dashdash >= 0 ? args.slice(0, dashdash) : args).filter((a) => a.startsWith('-'))
    for (const a of flagArgs) {
      if (a === '-b' || a === '--') continue
      if (a === '-B' || a === '-f' || a === '--force' || a === '-d' || a === '--detach') {
        return fail(`sharpen: 'git checkout ${a}' is not available in this arena (yet)\n`, 1)
      }
      return unknownOption(a, 'git checkout [<options>] <branch>')
    }
    if (dashdash >= 0) return checkoutPaths(cwd, args.slice(dashdash + 1))
    if (first === '-b') {
      if (!args[1] || args[1].startsWith('-')) return fail('fatal: branch name required\n', 128)
      return createAndSwitch(args[1])
    }
    const branches = await git.listBranches({ fs, dir })
    if (branches.includes(first)) return switchBranch(first)
    return checkoutPaths(cwd, args)
  }

  async function cmdSwitch(args: string[]): Promise<ExecResult> {
    // Real git: no --cached on switch (LC_ALL=C, 2026-07-18). Supported: -c, branch.
    for (const a of args) {
      if (!a.startsWith('-')) continue
      if (a === '-c') continue
      if (a === '-C' || a === '-d' || a === '--detach' || a === '-f' || a === '--force') {
        return fail(`sharpen: 'git switch ${a}' is not available in this arena (yet)\n`, 1)
      }
      return unknownOption(a, 'git switch [<options>] [<branch>]')
    }
    if (args[0] === '-c') {
      if (!args[1] || args[1].startsWith('-')) return fail('fatal: branch name required\n', 128)
      return createAndSwitch(args[1])
    }
    const target = args[0]
    if (!target) return fail('fatal: missing branch or commit argument\n', 128)
    return switchBranch(target)
  }

  async function cmdRestore(args: string[], cwd: string): Promise<ExecResult> {
    // Real git restore accepts --staged, not --cached (unlike diff/rm). A
    // silent ignore turned `git restore --cached .env` into a worktree restore
    // and a misleading pathspec error (verified LC_ALL=C, 2026-07-18).
    const unknown = args.find((a) => a.startsWith('-') && a !== '--' && a !== '--staged')
    if (unknown) {
      const flag = unknown.replace(/^--?/, '')
      return fail(
        `error: unknown option \`${flag}'\n` +
          'usage: git restore [<options>] [--source=<branch>] <file>...\n',
        129
      )
    }
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
    for (const a of args) {
      if (!a.startsWith('-') || a === '--') continue
      if (a === '--cached' || a === '-f' || a === '--force') continue
      if (a === '-r' || a === '--recursive') {
        return fail(`sharpen: 'git rm ${a}' is not available in this arena (yet)\n`, 1)
      }
      return unknownOption(a, 'git rm [<options>] [--] <file>...')
    }
    const cached = args.includes('--cached')
    const force = args.includes('-f') || args.includes('--force')
    const paths = args.filter((a) => !a.startsWith('-'))
    if (!paths.length) return fail('fatal: No pathspec was given. Which files should I remove?\n', 128)
    const matrix = await statusMatrix()
    const targets: StatusRow[] = []
    for (const p of paths) {
      const repoPath = toRepoPath(cwd, p)
      const rows = matchRows(matrix, repoPath).filter((row) => row[1] === 1 || row[3] >= 1)
      if (!rows.length) {
        return fail(`fatal: pathspec '${p}' did not match any files\n`, 128)
      }
      targets.push(...rows)
    }
    // Real git refuses to delete work it cannot get back (verified
    // 2026-07-18): staged changes first, then local modifications.
    if (!cached && !force) {
      const staged = targets.filter((row) => {
        const c = classifyRow(row)
        return c.stagedNew || c.stagedModified
      })
      const modified = targets.filter((row) => classifyRow(row).unstagedModified)
      const refuse = (rows: StatusRow[], reason: string) =>
        fail(
          `error: the following ${rows.length === 1 ? 'file has' : 'files have'} ${reason}:\n` +
            rows.map((row) => `    ${row[0]}`).join('\n') +
            '\n(use --cached to keep the file, or -f to force removal)\n',
          1
        )
      if (staged.length) return refuse(staged, 'changes staged in the index')
      if (modified.length) return refuse(modified, 'local modifications')
    }
    const out: string[] = []
    for (const row of targets) {
      await git.remove({ fs, dir, filepath: row[0] })
      if (!cached) await jbFs.rm(`${dir}/${row[0]}`, { force: true })
      out.push(`rm '${row[0]}'`)
    }
    return ok(out.join('\n') + '\n')
  }

  /** Blob oid of every index entry; STAGE walk visits blobs only when we
   * keep returning truthy (pruning happens on falsy returns). */
  async function stageOids(): Promise<Map<string, string>> {
    const oids = new Map<string, string>()
    await git.walk({
      fs,
      dir,
      trees: [git.STAGE()],
      map: async (filepath, [entry]) => {
        if (entry && (await entry.type()) === 'blob') oids.set(filepath, await entry.oid())
        return true
      },
    })
    return oids
  }

  async function blobText(oid: string): Promise<string> {
    const { blob } = await git.readBlob({ fs, dir, oid })
    return new TextDecoder().decode(blob)
  }

  async function headBlob(filepath: string): Promise<{ oid: string; text: string } | null> {
    try {
      const head = await git.resolveRef({ fs, dir, ref: 'HEAD' })
      const { blob, oid } = await git.readBlob({ fs, dir, oid: head, filepath })
      return { oid, text: new TextDecoder().decode(blob) }
    } catch {
      return null
    }
  }

  async function workdirBlob(filepath: string): Promise<{ oid: string; text: string } | null> {
    try {
      const text = await jbFs.readFile(`${dir}/${filepath}`, 'utf8')
      const { oid } = await git.hashBlob({ object: text })
      return { oid, text }
    } catch {
      return null
    }
  }

  function renderDiffBlock(
    file: string,
    oldSide: { oid: string; text: string } | null,
    newSide: { oid: string; text: string } | null
  ): string {
    const b = (line: string) => `${DIFF.bold}${line}${DIFF.reset}`
    const lines: string[] = [b(`diff --git a/${file} b/${file}`)]
    if (!oldSide) lines.push(b('new file mode 100644'))
    if (!newSide) lines.push(b('deleted file mode 100644'))
    const mode = oldSide && newSide ? ' 100644' : ''
    lines.push(b(`index ${shortOid(oldSide?.oid ?? ZERO_OID)}..${shortOid(newSide?.oid ?? ZERO_OID)}${mode}`))
    lines.push(b(`--- ${oldSide ? `a/${file}` : '/dev/null'}`))
    lines.push(b(`+++ ${newSide ? `b/${file}` : '/dev/null'}`))
    const patch = structuredPatch(file, file, oldSide?.text ?? '', newSide?.text ?? '', undefined, undefined, {
      context: 3,
    })
    // Git prints empty ranges anchored one line earlier (@@ -0,0 +1 @@) and
    // omits the count when it is exactly 1; jsdiff anchors empties at 1.
    const range = (start: number, count: number) =>
      count === 1 ? `${start}` : `${count === 0 ? start - 1 : start},${count}`
    for (const hunk of patch.hunks) {
      lines.push(
        `${DIFF.cyan}@@ -${range(hunk.oldStart, hunk.oldLines)} +${range(hunk.newStart, hunk.newLines)} @@${DIFF.reset}`
      )
      for (const line of hunk.lines) {
        if (line.startsWith('+')) {
          // Real git colors the marker and the text as separate spans.
          lines.push(`${DIFF.green}+${DIFF.reset}${DIFF.green}${line.slice(1)}${DIFF.reset}`)
        } else if (line.startsWith('-')) {
          lines.push(`${DIFF.red}${line}${DIFF.reset}`)
        } else if (line.startsWith('\\')) {
          lines.push(line)
        } else {
          lines.push(`${line}${DIFF.reset}`)
        }
      }
    }
    return lines.join('\n') + '\n'
  }

  async function cmdDiff(args: string[], cwd: string): Promise<ExecResult> {
    const staged = args.includes('--staged') || args.includes('--cached')
    const unknown = args.find((a) => a.startsWith('-') && !['--', '--staged', '--cached'].includes(a))
    if (unknown) {
      return fail(`sharpen: 'git diff ${unknown}' is not available in this arena (yet)\n`, 1)
    }
    const scopes = args.filter((a) => a !== '--' && !a.startsWith('-')).map((p) => toRepoPath(cwd, p))
    const inScope = (file: string) =>
      !scopes.length || scopes.some((s) => s === '.' || file === s || file.startsWith(s + '/'))

    const matrix = await statusMatrix()
    const oids = await stageOids()
    const blocks: string[] = []
    for (const row of matrix) {
      const [file] = row
      if (!inScope(file)) continue
      const c = classifyRow(row)
      let oldSide: { oid: string; text: string } | null = null
      let newSide: { oid: string; text: string } | null = null
      if (staged) {
        // Index vs HEAD: what the next commit would ship.
        if (!(c.stagedNew || c.stagedModified || c.stagedDeleted)) continue
        oldSide = await headBlob(file)
        const stagedOid = oids.get(file)
        newSide = stagedOid ? { oid: stagedOid, text: await blobText(stagedOid) } : null
      } else {
        // Worktree vs index. Untracked files never show, like real git.
        if (!(c.unstagedModified || c.unstagedDeleted)) continue
        const stagedOid = oids.get(file)
        oldSide = stagedOid ? { oid: stagedOid, text: await blobText(stagedOid) } : await headBlob(file)
        newSide = await workdirBlob(file)
      }
      if (!oldSide && !newSide) continue
      if (oldSide && newSide && oldSide.oid === newSide.oid) continue
      blocks.push(renderDiffBlock(file, oldSide, newSide))
    }
    return ok(blocks.join(''))
  }

  async function cmdReset(args: string[], cwd: string): Promise<ExecResult> {
    // Only the unstage form (a mixed reset against HEAD) exists for now; the
    // history-moving forms land with their own scenarios.
    const flag = args.find((a) => a.startsWith('-') && a !== '--')
    if (flag) {
      return fail(`sharpen: 'git reset ${flag}' is not available in this arena (yet)\n`, 1)
    }
    let paths = args.filter((a) => a !== '--' && !a.startsWith('-'))
    if (paths[0] === 'HEAD') paths = paths.slice(1)
    if (paths[0] && /^HEAD[~^@]/.test(paths[0])) {
      return fail(`sharpen: 'git reset ${paths[0]}' is not available in this arena (yet)\n`, 1)
    }
    let matrix = await statusMatrix()
    let targets: StatusRow[]
    if (paths.length) {
      targets = []
      for (const p of paths) {
        const repoPath = toRepoPath(cwd, p)
        const rows = matchRows(matrix, repoPath)
        if (!rows.length) {
          return fail(
            `fatal: ambiguous argument '${p}': unknown revision or path not in the working tree.\n` +
              "Use '--' to separate paths from revisions, like this:\n" +
              "'git <command> [<revision>...] -- [<file>...]'\n",
            128
          )
        }
        targets.push(...rows)
      }
    } else {
      targets = matrix
    }
    for (const row of targets) {
      const c = classifyRow(row)
      if (c.stagedNew || c.stagedModified || c.stagedDeleted) {
        await git.resetIndex({ fs, dir, filepath: row[0] })
      }
    }
    // Real git then reports what remains unstaged: tracked changes only.
    matrix = await statusMatrix()
    const remaining = matrix
      .map((row) => ({ file: row[0], c: classifyRow(row) }))
      .filter(({ c }) => c.unstagedModified || c.unstagedDeleted)
      .map(({ file, c }) => `${c.unstagedDeleted ? 'D' : 'M'}\t${file}`)
    return ok(remaining.length ? `Unstaged changes after reset:\n${remaining.join('\n')}\n` : '')
  }

  function cmdHelp(): ExecResult {
    return ok(
      'sharpen arena git: supported commands:\n' +
        '  status [-s|--short]      add <path>|-A          commit -m <msg> [-a]\n' +
        '  log [--oneline] [-n N]   branch [--list|-d]     checkout <branch>|-b|-- <path>\n' +
        '  switch <branch>|-c       restore [--staged]     clean [-n|-f] [-d]\n' +
        '  rm [--cached] <path>     reset [HEAD] [<path>]  diff [--staged] [<path>]\n' +
        "git <command> --help shows what each one supports in this arena.\n" +
        'Anything else is real git, but not available in this arena (yet).\n'
    )
  }

  // Arena help cards: --help never replicates real git's manuals. One line of
  // purpose, the exact surface this arena supports, and a pointer to the
  // mentor, who owns the concepts. Static text: replay stays deterministic.
  const HELP_CARDS: Record<string, { what: string; usage: string }> = {
    status: { what: 'where every file stands: staged, modified, untracked', usage: 'git status [-s|--short]' },
    add: { what: 'stage changes (deletions included) for the next commit', usage: 'git add <path>... | git add -A' },
    commit: { what: 'record what is staged as a new commit', usage: 'git commit -m <msg> [-a] | git commit -am <msg>' },
    log: { what: 'walk the commit history from HEAD', usage: 'git log [--oneline] [-n <N>]' },
    branch: { what: 'list, create or delete branches', usage: 'git branch [<name>] | git branch -d|-D <name>' },
    checkout: { what: 'switch branches or restore paths (the older spelling)', usage: 'git checkout <branch> | git checkout -b <name> | git checkout -- <path>...' },
    switch: { what: 'move HEAD to another branch', usage: 'git switch <branch> | git switch -c <name>' },
    restore: { what: 'put working-tree files back; --staged resets index entries instead', usage: 'git restore <path>... | git restore --staged <path>...' },
    clean: { what: 'delete untracked files (refuses without force, like real git)', usage: 'git clean [-n] [-f] [-d]' },
    rm: { what: 'remove files and stage the deletion; --cached keeps the file on disk, -f overrides the safety refusals', usage: 'git rm [--cached|-f] <path>...' },
    reset: { what: 'unstage: reset index entries back to HEAD', usage: 'git reset [HEAD] [<path>...]' },
    diff: { what: 'what changed: worktree vs index; --staged compares index vs HEAD', usage: 'git diff [--staged|--cached] [<path>...]' },
    init: { what: 'start a repository (this arena repo already is one)', usage: 'git init' },
  }

  function helpFor(sub: string): ExecResult {
    const card = HELP_CARDS[sub]
    if (card) {
      return ok(
        `git ${sub}: ${card.what}\n` +
          `supported here: ${card.usage}\n` +
          "the concept behind it is the mentor's turf: ask in the chat\n"
      )
    }
    if (NOT_IN_ARENA.includes(sub)) {
      return fail(`sharpen: 'git ${sub}' is not available in this arena (yet)\n`, 1)
    }
    return fail(`git: '${sub}' is not a git command. See 'git --help'.\n`, 1)
  }

  // --- dispatch ---------------------------------------------------------------

  return defineCommand('git', async (args, ctx) => {
    const [sub, ...rest] = args
    if (sub === 'help' && rest[0]) return helpFor(rest[0])
    if (!sub || sub === '--help' || sub === 'help') return cmdHelp()
    if (sub === '--version') return ok('git version 2.50.0.sharpen\n')
    if (rest.includes('--help') || rest.includes('-h')) return helpFor(sub)
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
        case 'reset':
          return await cmdReset(rest, ctx.cwd)
        case 'diff':
          return await cmdDiff(rest, ctx.cwd)
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
