import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { Check } from '../engine/types.ts'

// Both env vars must be set BEFORE the app module loads: store.ts resolves
// SHARPEN_DATA_DIR at import time, and SHARPEN_NO_MENTOR keeps submit from
// spawning the real claude CLI (see askMentor in server/app.ts).
process.env.SHARPEN_DATA_DIR = mkdtempSync(join(tmpdir(), 'sharpen-api-test-'))
process.env.SHARPEN_NO_MENTOR = '1'

const { app } = await import('../server/app.ts')

async function createRun(): Promise<string> {
  const res = await request(app)
    .post('/api/runs')
    .send({ challengeId: 'git/clean-sweep', player: 'tester' })
  expect(res.status).toBe(200)
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
    expect(typeof first!.statement).toBe('string')
    expect(first!.focusCommands).toEqual(['git status', 'git clean'])
    // Summaries must not leak the solution or the executable hooks.
    expect(first).not.toHaveProperty('walkthrough')
    expect(first).not.toHaveProperty('setup')
    expect(first).not.toHaveProperty('assert')
  })

  it('create -> start -> submit returns an authoritative verdict with 4 checks', async () => {
    const runId = await createRun()

    const start = await request(app).post(`/api/runs/${runId}/start`)
    expect(start.status).toBe(200)
    expect(typeof start.body.startedAt).toBe('number')
    expect(start.body.deadline).toBe(start.body.startedAt + 60_000)

    // Empty transcript: the replay produces the initial (dirty) state.
    const submit = await request(app).post(`/api/runs/${runId}/submit`)
    expect(submit.status).toBe(200)
    expect(submit.body.pass).toBe(false)
    const checks = submit.body.checks as Check[]
    expect(checks).toHaveLength(4)
    for (const check of checks) {
      expect(typeof check.name).toBe('string')
      expect(typeof check.pass).toBe('boolean')
      expect(typeof check.detail).toBe('string')
    }
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
