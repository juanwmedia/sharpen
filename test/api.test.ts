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

  it('learn snapshot PUT/GET/DELETE round-trips on disk', async () => {
    const id = encodeURIComponent('git/clean-sweep')
    const body = {
      schema: 1,
      challengeId: 'git/clean-sweep',
      locale: 'en',
      status: 'live',
      transcript: [{ command: 'git status', output: 'dirty' }],
      mentorFeed: [{ role: 'mentor', text: 'nudge' }],
      mentorSessionId: 'sess-1',
      mentorTurns: 2,
      updatedAt: 1,
    }
    expect((await request(app).put(`/api/learn/${id}`).send(body)).status).toBe(204)
    const got = await request(app).get(`/api/learn/${id}`)
    expect(got.status).toBe(200)
    expect(got.body).toMatchObject({
      challengeId: 'git/clean-sweep',
      status: 'live',
      mentorSessionId: 'sess-1',
      mentorTurns: 2,
    })
    expect(got.body.transcript).toHaveLength(1)
    expect(existsSync(join(dataDir, 'learn', 'git__clean-sweep.json'))).toBe(true)

    expect((await request(app).delete(`/api/learn/${id}`)).status).toBe(204)
    const empty = await request(app).get(`/api/learn/${id}`)
    expect(empty.status).toBe(200)
    expect(empty.body).toBeNull()
  })

  it('learn API rejects unknown challenge ids', async () => {
    const id = encodeURIComponent('git/nope')
    expect((await request(app).get(`/api/learn/${id}`)).status).toBe(404)
    expect((await request(app).put(`/api/learn/${id}`).send({ schema: 1 })).status).toBe(404)
    expect((await request(app).delete(`/api/learn/${id}`)).status).toBe(404)
  })

  it('learn GET returns null when no snapshot exists yet', async () => {
    const id = encodeURIComponent('git/clean-sweep')
    await request(app).delete(`/api/learn/${id}`)
    const res = await request(app).get(`/api/learn/${id}`)
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
  })

  it('challenge start never writes learn snapshots', async () => {
    const id = encodeURIComponent('git/clean-sweep')
    await request(app).delete(`/api/learn/${id}`)
    const runId = await createRun('challenge')
    await request(app).post(`/api/runs/${runId}/start`)
    expect(existsSync(join(dataDir, 'learn', 'git__clean-sweep.json'))).toBe(false)
  })

  it('learn restore injects transcript before submit', async () => {
    const runId = await createRun('learn')
    const restore = await request(app)
      .post(`/api/runs/${runId}/restore`)
      .send({
        transcript: [{ command: 'git clean -fd', output: '' }],
        status: 'live',
        mentorSessionId: null,
        mentorTurns: 0,
      })
    expect(restore.status).toBe(200)
    await request(app).post(`/api/runs/${runId}/start`)
    const submit = await request(app).post(`/api/runs/${runId}/submit`)
    expect(submit.status).toBe(200)
    expect(submit.body.pass).toBe(true)
  })
})
