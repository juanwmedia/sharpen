import { describe, expect, it } from 'vitest'
import { createArena } from '../engine/arena.ts'
import scenario from '../scenarios/git/clean-sweep/index.ts'

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

async function freshArena() {
  return createArena(scenario)
}

describe('git porcelain', () => {
  it('reports the scenario mess in status --short', async () => {
    const arena = await freshArena()
    const r = await arena.exec('git status --short')
    const out = strip(r.stdout)
    expect(out).toContain('?? tmp/debug.log')
    expect(out).toContain('?? notes/ideas.md')
    expect(out).toContain(' M src/api/client.ts')
    expect(r.exitCode).toBe(0)
  })

  it('unknown commands exit 127 with a bash-style message, like a real shell', async () => {
    const arena = await freshArena()
    const r = await arena.exec('yo')
    expect(r.exitCode).toBe(127)
    expect(r.stderr).toContain('command not found')
  })

  it('refuses git clean without -f or -n, like real git', async () => {
    const arena = await freshArena()
    const r = await arena.exec('git clean')
    expect(r.exitCode).toBe(128)
    expect(r.stderr).toContain('refusing to clean')
  })

  it('clean -fd sweeps untracked files and directories only', async () => {
    const arena = await freshArena()
    const r = await arena.exec('git clean -fd')
    expect(r.exitCode).toBe(0)
    expect(strip(r.stdout)).toContain('Removing tmp/')
    const status = strip((await arena.exec('git status --short')).stdout)
    expect(status.trim()).toBe('M src/api/client.ts')
  })

  it('clean -f without -d leaves untracked directories alone', async () => {
    const arena = await freshArena()
    await arena.exec('git clean -f')
    const status = strip((await arena.exec('git status --short')).stdout)
    expect(status).not.toContain('build.log')
    expect(status).toContain('?? tmp/')
  })

  it('supports pipes through just-bash: git branch --list | grep', async () => {
    const arena = await freshArena()
    await arena.exec('git branch fix/stda-cleanup')
    const r = await arena.exec('git branch --list | grep stda')
    expect(strip(r.stdout)).toContain('fix/stda-cleanup')
  })

  it('add + commit -m creates a commit on the current branch', async () => {
    const arena = await freshArena()
    await arena.exec('git add src/api/client.ts')
    const r = await arena.exec('git commit -m "fix: handle failed fetch"')
    expect(r.exitCode).toBe(0)
    expect(strip(r.stdout)).toMatch(/^\[main [0-9a-f]{7}\] fix: handle failed fetch/)
    const log = strip((await arena.exec('git log --oneline')).stdout)
    expect(log.split('\n').filter(Boolean)).toHaveLength(3)
  })

  it('restore --staged unstages without touching the worktree', async () => {
    const arena = await freshArena()
    await arena.exec('git add src/api/client.ts')
    await arena.exec('git restore --staged src/api/client.ts')
    const status = strip((await arena.exec('git status --short')).stdout)
    expect(status).toContain(' M src/api/client.ts')
  })

  it('restore <file> discards worktree changes', async () => {
    const arena = await freshArena()
    await arena.exec('git restore src/api/client.ts')
    const status = strip((await arena.exec('git status --short')).stdout)
    expect(status).not.toContain('src/api/client.ts')
  })

  it('restore refuses a staged deletion like real git: the index has no entry to restore from', async () => {
    const arena = await freshArena()
    await arena.exec('git rm README.md')
    const direct = await arena.exec('git restore README.md')
    expect(direct.exitCode).toBe(1)
    expect(strip(direct.stderr)).toContain("pathspec 'README.md' did not match any file(s) known to git")
    // The faithful route: unstage the deletion first, then restore.
    await arena.exec('git restore --staged README.md')
    await arena.exec('git restore README.md')
    const status = strip((await arena.exec('git status --short')).stdout)
    expect(status).not.toContain('README.md')
  })

  it('checkout -b creates and switches, branch lists it', async () => {
    const arena = await freshArena()
    const r = await arena.exec('git checkout -b feat/backoff')
    expect(strip(r.stdout)).toContain("Switched to a new branch 'feat/backoff'")
    const list = strip((await arena.exec('git branch')).stdout)
    expect(list).toContain('* feat/backoff')
    expect(list).toContain('  main')
  })

  it('branch -d refuses unmerged and current branches like real git; -D force-deletes', async () => {
    const arena = await freshArena()
    await arena.exec('git switch -c spike/idea')
    await arena.exec('git commit -am "spike work"')
    await arena.exec('git switch main')

    const unmerged = await arena.exec('git branch -d spike/idea')
    expect(unmerged.exitCode).toBe(1)
    expect(strip(unmerged.stderr)).toContain("the branch 'spike/idea' is not fully merged")
    expect(strip(unmerged.stderr)).toContain('git branch -D spike/idea')

    const current = await arena.exec('git branch -d main')
    expect(current.exitCode).toBe(1)
    expect(strip(current.stderr)).toContain("cannot delete branch 'main'")

    const force = await arena.exec('git branch -D spike/idea')
    expect(strip(force.stdout)).toMatch(/^Deleted branch spike\/idea \(was [0-9a-f]{7}\)\.$/m)

    // A merged branch (tip reachable from HEAD) deletes fine with plain -d.
    await arena.exec('git branch tmp')
    const merged = await arena.exec('git branch -d tmp')
    expect(merged.exitCode).toBe(0)
    expect(strip(merged.stdout)).toContain('Deleted branch tmp')
  })

  it('reset unstages like real git and lists what remains unstaged', async () => {
    const arena = await freshArena()
    await arena.exec('git add src/api/client.ts')
    const r = await arena.exec('git reset')
    expect(r.exitCode).toBe(0)
    expect(strip(r.stdout)).toContain('Unstaged changes after reset:')
    expect(strip(r.stdout)).toContain('M\tsrc/api/client.ts')
    const status = strip((await arena.exec('git status --short')).stdout)
    expect(status).toContain(' M src/api/client.ts')
  })

  it('reset refuses the history-moving forms honestly', async () => {
    const arena = await freshArena()
    const hard = await arena.exec('git reset --hard')
    expect(hard.exitCode).toBe(1)
    expect(strip(hard.stderr)).toContain("'git reset --hard' is not available in this arena (yet)")
    const back = await arena.exec('git reset HEAD~1')
    expect(back.exitCode).toBe(1)
    expect(strip(back.stderr)).toContain("'git reset HEAD~1' is not available in this arena (yet)")
  })

  it('diff shows unstaged tracked changes only; once staged it goes quiet and --staged takes over', async () => {
    const arena = await freshArena()
    const before = strip((await arena.exec('git diff')).stdout)
    expect(before).toContain('diff --git a/src/api/client.ts b/src/api/client.ts')
    expect(before).toContain('--- a/src/api/client.ts')
    expect(before).toContain("+  if (!response.ok) throw new Error('notes fetch failed')")
    // Untracked junk never shows in git diff, exactly like real git.
    expect(before).not.toContain('build.log')

    await arena.exec('git add src/api/client.ts')
    expect((await arena.exec('git diff')).stdout).toBe('')
    const stagedOut = strip((await arena.exec('git diff --staged')).stdout)
    expect(stagedOut).toContain('diff --git a/src/api/client.ts b/src/api/client.ts')
    expect(stagedOut).toContain("+  if (!response.ok) throw new Error('notes fetch failed')")
  })

  it('diff --staged renders a staged new file like real git', async () => {
    const arena = await freshArena()
    await arena.exec('git add build.log')
    const out = strip((await arena.exec('git diff --staged')).stdout)
    expect(out).toContain('new file mode 100644')
    expect(out).toContain('index 0000000..')
    expect(out).toContain('--- /dev/null')
    expect(out).toContain('+++ b/build.log')
    expect(out).toContain('@@ -0,0 +1 @@')
    expect(out).toContain('+webpack compiled with 1 warning')
  })

  it('never loses uncommitted work across branch switches (the .env incident)', async () => {
    const arena = await freshArena()
    await arena.exec('git add build.log')
    const out = await arena.exec('git checkout -b jander')
    expect(strip(out.stdout + out.stderr)).toContain("Switched to a new branch 'jander'")
    const back = await arena.exec('git checkout main')
    expect(back.exitCode).toBe(0)
    expect(strip(back.stdout)).toContain('A\tbuild.log')
    expect(strip(back.stdout)).toContain("Switched to branch 'main'")
    const status = strip((await arena.exec('git status --short')).stdout)
    expect(status).toContain('A  build.log')
    const ls = strip((await arena.exec('ls')).stdout)
    expect(ls).toContain('build.log')
  })

  it('switch refuses when local changes would be overwritten, like real git', async () => {
    const arena = await freshArena()
    await arena.exec('git switch -c experiment')
    await arena.exec('git commit -am "experiment snapshot"')
    await arena.exec('git switch main')
    await arena.exec("echo 'const localEdit = true' >> src/api/client.ts")
    const refuse = await arena.exec('git switch experiment')
    expect(refuse.exitCode).toBe(1)
    expect(strip(refuse.stderr)).toContain(
      'Your local changes to the following files would be overwritten by checkout:'
    )
    expect(strip(refuse.stderr)).toContain('\tsrc/api/client.ts')
    expect(strip(refuse.stderr)).toContain('Aborting')
    // Nothing moved: still on main, the local edit intact.
    const branch = strip((await arena.exec('git branch')).stdout)
    expect(branch).toContain('* main')
    const status = strip((await arena.exec('git status --short')).stdout)
    expect(status).toContain(' M src/api/client.ts')
  })

  it("switching to the current branch says Already on and lists carried changes", async () => {
    const arena = await freshArena()
    const r = await arena.exec('git switch main')
    expect(r.exitCode).toBe(0)
    expect(strip(r.stdout)).toContain("Already on 'main'")
    expect(strip(r.stdout)).toContain('M\tsrc/api/client.ts')
  })

  it('rm refuses staged or locally modified files like real git; -f forces', async () => {
    const arena = await freshArena()
    const modified = await arena.exec('git rm src/api/client.ts')
    expect(modified.exitCode).toBe(1)
    expect(strip(modified.stderr)).toContain('error: the following file has local modifications:')
    expect(strip(modified.stderr)).toContain('(use --cached to keep the file, or -f to force removal)')

    await arena.exec('git add src/api/client.ts')
    const staged = await arena.exec('git rm src/api/client.ts')
    expect(staged.exitCode).toBe(1)
    expect(strip(staged.stderr)).toContain('error: the following file has changes staged in the index:')

    const forced = await arena.exec('git rm -f src/api/client.ts')
    expect(forced.exitCode).toBe(0)
    expect(strip(forced.stdout)).toContain("rm 'src/api/client.ts'")
    const status = strip((await arena.exec('git status --short')).stdout)
    expect(status).toContain('D  src/api/client.ts')
  })

  it('serves arena help cards instead of real manuals', async () => {
    const arena = await freshArena()
    const card = await arena.exec('git restore --help')
    expect(card.exitCode).toBe(0)
    expect(card.stdout).toContain('git restore:')
    expect(card.stdout).toContain('supported here: git restore <path>... | git restore --staged <path>...')
    expect(card.stdout).toContain('ask in the chat')
    const viaHelp = await arena.exec('git help clean')
    expect(viaHelp.stdout).toContain('git clean:')
    const missing = await arena.exec('git stash --help')
    expect(missing.exitCode).toBe(1)
    expect(missing.stderr).toContain("'git stash' is not available in this arena (yet)")
  })

  it('is honest about commands outside the arena whitelist', async () => {
    const arena = await freshArena()
    const r = await arena.exec('git rebase -i HEAD~2')
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain("'git rebase' is not available in this arena")
  })
})

describe('clean-sweep scenario verdict', () => {
  it('fails before any action', async () => {
    const arena = await freshArena()
    const verdict = await arena.verdict()
    expect(verdict.pass).toBe(false)
  })

  it('passes with git clean -fd', async () => {
    const arena = await freshArena()
    await arena.exec('git clean -fd')
    const verdict = await arena.verdict()
    expect(verdict.pass).toBe(true)
    expect(verdict.stateHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('passes with plain rm: state is what counts, not the command', async () => {
    const arena = await freshArena()
    await arena.exec('rm -rf tmp notes build.log')
    const verdict = await arena.verdict()
    expect(verdict.pass).toBe(true)
  })

  it('fails if the player nukes their work in progress', async () => {
    const arena = await freshArena()
    await arena.exec('git restore src/api/client.ts')
    await arena.exec('git clean -fd')
    const verdict = await arena.verdict()
    expect(verdict.pass).toBe(false)
    const failing = verdict.checks.filter((c) => !c.pass).map((c) => c.name.en)
    expect(failing).toContain('Work in progress survived, unstaged')
  })

  it('fails if the player commits the junk instead', async () => {
    const arena = await freshArena()
    await arena.exec('git add -A')
    await arena.exec('git commit -m "wip"')
    const verdict = await arena.verdict()
    expect(verdict.pass).toBe(false)
  })

  it('replays deterministically: same commands, same state hash', async () => {
    const a = await freshArena()
    const b = await freshArena()
    await a.exec('git clean -fd')
    await b.exec('git clean -fd')
    expect((await a.verdict()).stateHash).toBe((await b.verdict()).stateHash)
  })
})
