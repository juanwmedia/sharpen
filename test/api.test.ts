import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { Check } from '../engine/types.ts'

// Both env vars must be set BEFORE the app module loads: store.ts resolves
// SHARPEN_DATA_DIR at import time, and SHARPEN_NO_MENTOR keeps submit from
// spawning the real claude CLI (see askMentor in server/app.ts).
const dataDir = mkdtempSync(join(tmpdir(), 'sharpen-api-test-'))
process.env.SHARPEN_DATA_DIR = dataDir
process.env.SHARPEN_NO_MENTOR = '1'

const { app } = await import('../server/app.ts')

async function createRun(mode?: 'learn' | 'challenge'): Promise<string> {
  const res = await request(app)
    .post('/api/runs')
    .send({ challengeId: 'git/clean-sweep', player: 'tester', ...(mode ? { mode } : {}) })
  expect(res.status).toBe(200)
  if (mode) expect(res.body.mode).toBe(mode)
  return res.body.runId as string
}

describe('sharpen API', () => {
  it('lists challenge summaries without engine internals', async () => {
    const res = await request(app).get('/api/challenges')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const [first] = res.body as Array<Record<string, unknown>>
    expect(first).toMatchObject({
      id: 'git/clean-sweep',
      pack: 'git',
      title: 'Clean sweep',
      difficulty: 'medium',
      timeLimitMs: 60_000,
    })
    // Challenge content is bilingual: authors write every language.
    expect(typeof (first!.statement as Record<string, unknown>).en).toBe('string')
    expect(typeof (first!.statement as Record<string, unknown>).es).toBe('string')
    expect(first!.focusCommands).toEqual(['git status', 'git clean'])
    // Summaries must not leak the solution or the executable hooks.
    expect(first).not.toHaveProperty('walkthrough')
    expect(first).not.toHaveProperty('setup')
    expect(first).not.toHaveProperty('assert')
  })

  it('defaults to learn mode: start has no deadline', async () => {
    const runId = await createRun()
    const start = await request(app).post(`/api/runs/${runId}/start`)
    expect(start.status).toBe(200)
    expect(typeof start.body.startedAt).toBe('number')
    expect(start.body.deadline).toBeNull()
    expect(start.body.mode).toBe('learn')
  })

  it('challenge mode start sets a deadline from the challenge time limit', async () => {
    const runId = await createRun('challenge')
    const start = await request(app).post(`/api/runs/${runId}/start`)
    expect(start.status).toBe(200)
    expect(typeof start.body.startedAt).toBe('number')
    expect(start.body.deadline).toBe(start.body.startedAt + 60_000)
    expect(start.body.mode).toBe('challenge')
  })

  it('create -> start -> submit returns an authoritative verdict with 4 checks', async () => {
    const runId = await createRun('learn')
    await request(app).post(`/api/runs/${runId}/start`)

    // Empty transcript: the replay produces the initial (dirty) state.
    const submit = await request(app).post(`/api/runs/${runId}/submit`)
    expect(submit.status).toBe(200)
    expect(submit.body.pass).toBe(false)
    const checks = submit.body.checks as Check[]
    expect(checks).toHaveLength(4)
    for (const check of checks) {
      expect(typeof check.name.en).toBe('string')
      expect(typeof check.name.es).toBe('string')
      expect(typeof check.pass).toBe('boolean')
      expect(typeof check.detail.en).toBe('string')
      expect(typeof check.detail.es).toBe('string')
    }
  })

  it('learn reveal returns 204 and rejects a second reveal', async () => {
    const runId = await createRun('learn')
    await request(app).post(`/api/runs/${runId}/start`)
    const reveal = await request(app).post(`/api/runs/${runId}/reveal`)
    expect(reveal.status).toBe(204)
    const again = await request(app).post(`/api/runs/${runId}/reveal`)
    expect(again.status).toBe(409)
  })

  it('challenge mode rejects voluntary reveal', async () => {
    const runId = await createRun('challenge')
    await request(app).post(`/api/runs/${runId}/start`)
    const reveal = await request(app).post(`/api/runs/${runId}/reveal`)
    expect(reveal.status).toBe(409)
  })

  it('learn pass does not write leaderboard entries', async () => {
    const runId = await createRun('learn')
    await request(app).post(`/api/runs/${runId}/start`)
    await request(app)
      .post(`/api/runs/${runId}/command`)
      .send({ command: 'git clean -fd', output: '' })
    const submit = await request(app).post(`/api/runs/${runId}/submit`)
    expect(submit.status).toBe(200)
    expect(submit.body.pass).toBe(true)
    expect(existsSync(join(dataDir, 'leaderboard.json'))).toBe(false)
  })

  it('challenge pass records a leaderboard entry', async () => {
    const runId = await createRun('challenge')
    await request(app).post(`/api/runs/${runId}/start`)
    await request(app)
      .post(`/api/runs/${runId}/command`)
      .send({ command: 'git clean -fd', output: '' })
    const submit = await request(app).post(`/api/runs/${runId}/submit`)
    expect(submit.status).toBe(200)
    expect(submit.body.pass).toBe(true)
    const board = JSON.parse(readFileSync(join(dataDir, 'leaderboard.json'), 'utf8')) as {
      entries: Array<{ runId: string; pass: boolean }>
    }
    expect(board.entries.some((e) => e.runId === runId && e.pass)).toBe(true)
  })

  it('returns 404 for an unknown run', async () => {
    const res = await request(app).get('/api/runs/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'unknown run' })
  })

  it('rejects an empty mentor question with 400', async () => {
    const runId = await createRun()
    const res = await request(app).post(`/api/runs/${runId}/ask`).send({ question: '   ' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'empty question' })
  })
})
