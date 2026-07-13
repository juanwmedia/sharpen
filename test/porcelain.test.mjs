import { describe, expect, it } from 'vitest'
import { createArena } from '../engine/arena.mjs'
import challenge from '../challenges/git/clean-sweep.mjs'

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')

async function freshArena() {
  return createArena(challenge)
}

describe('git porcelain', () => {
  it('reports the challenge mess in status --short', async () => {
    const arena = await freshArena()
    const r = await arena.exec('git status --short')
    const out = strip(r.stdout)
    expect(out).toContain('?? tmp/debug.log')
    expect(out).toContain('?? notes/ideas.md')
    expect(out).toContain(' M src/api/client.ts')
    expect(r.exitCode).toBe(0)
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

  it('checkout -b creates and switches, branch lists it', async () => {
    const arena = await freshArena()
    const r = await arena.exec('git checkout -b feat/backoff')
    expect(strip(r.stdout)).toContain("Switched to a new branch 'feat/backoff'")
    const list = strip((await arena.exec('git branch')).stdout)
    expect(list).toContain('* feat/backoff')
    expect(list).toContain('  main')
  })

  it('is honest about commands outside the arena whitelist', async () => {
    const arena = await freshArena()
    const r = await arena.exec('git rebase -i HEAD~2')
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain("'git rebase' is not available in this arena")
  })
})

describe('clean-sweep challenge verdict', () => {
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
    const failing = verdict.checks.filter((c) => !c.pass).map((c) => c.name)
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
