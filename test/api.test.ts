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

const { app, runs } = await import('../server/app.ts')

async function createRun(mode?: 'learn' | 'challenge', scenarioId = 'git/clean-sweep'): Promise<string> {
  const res = await request(app)
    .post('/api/runs')
    .send({ scenarioId, player: 'tester', ...(mode ? { mode } : {}) })
  expect(res.status).toBe(200)
  if (mode) expect(res.body.mode).toBe(mode)
  return res.body.runId as string
}

describe('sharpen API', () => {
  it('lists scenario summaries without engine internals', async () => {
    const res = await request(app).get('/api/scenarios')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // Registry order is curated (easy to hard), so look clean-sweep up by id.
    const first = (res.body as Array<Record<string, unknown>>).find((s) => s.id === 'git/clean-sweep')
    expect(first).toMatchObject({
      id: 'git/clean-sweep',
      pack: 'git',
      title: { en: 'Clean sweep', es: 'Limpieza general' },
      difficulty: 'medium',
      timeLimitMs: 60_000,
    })
    // Scenario content is bilingual: authors write every language.
    expect(typeof (first!.briefing as Record<string, unknown>).en).toBe('string')
    expect(typeof (first!.briefing as Record<string, unknown>).es).toBe('string')
    expect(typeof first!.tree).toBe('string')
    expect(typeof (first!.objective as Record<string, unknown>).en).toBe('string')
    expect(typeof (first!.objective as Record<string, unknown>).es).toBe('string')
    expect(first!.themes).toEqual(['working tree', 'untracked', 'tracked', 'staging'])
    expect(first).not.toHaveProperty('statement')
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
      // Persisted schema-1 key: the wire and disk format keeps challengeId.
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

  it('learn API rejects unknown scenario ids', async () => {
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

  it('seeds the nudge baseline on start and rolls it forward on submit', async () => {
    const runId = await createRun('challenge')
    await request(app).post(`/api/runs/${runId}/start`)
    const run = runs.get(runId)!
    expect(run.nudgeBaseline).not.toBeNull()
    const seeded = run.nudgeBaseline!

    // Empty Enter: state untouched, no nudge, baseline stays byte-identical.
    const quiet = await request(app).post(`/api/runs/${runId}/submit`)
    expect(quiet.body.nudged).toBe(false)
    expect(run.nudgeBaseline).toEqual(seeded)

    // A state-changing command nudges and moves the baseline with the new hash.
    await request(app)
      .post(`/api/runs/${runId}/command`)
      .send({ command: 'rm build.log', output: '', error: false })
    const loud = await request(app).post(`/api/runs/${runId}/submit`)
    expect(loud.body.nudged).toBe(true)
    expect(run.nudgeBaseline!.stateHash).not.toBe(seeded.stateHash)
  })

  it('honors the nudge switches sent with submit', async () => {
    const runId = await createRun('challenge')
    await request(app).post(`/api/runs/${runId}/start`)
    await request(app)
      .post(`/api/runs/${runId}/command`)
      .send({ command: 'rm build.log', output: '', error: false })
    const res = await request(app)
      .post(`/api/runs/${runId}/submit`)
      .send({ nudges: { onChange: false, onError: false } })
    // The state moved, but the player muted both signals.
    expect(res.body.nudged).toBe(false)
  })

  it('records and clears the command error flag around submit', async () => {
    const runId = await createRun('challenge')
    await request(app).post(`/api/runs/${runId}/start`)
    const run = runs.get(runId)!
    await request(app)
      .post(`/api/runs/${runId}/command`)
      .send({ command: 'git clean', output: 'fatal: refusing to clean', error: true })
    expect(run.lastCommandErrored).toBe(true)
    // The refused command changed nothing, but the error makes it a nudge.
    const submit = await request(app).post(`/api/runs/${runId}/submit`)
    expect(submit.body.nudged).toBe(true)
    expect(run.lastCommandErrored).toBe(false)
  })

  it('progress reports scenarios solved via challenge evidence or passed learn snapshots', async () => {
    // A challenge pass earlier in this suite already recorded evidence for
    // clean-sweep; a passed learn snapshot marks a second scenario.
    const learnId = encodeURIComponent('git/leaked-secret')
    await request(app)
      .put(`/api/learn/${learnId}`)
      .send({
        schema: 1,
        challengeId: 'git/leaked-secret',
        locale: 'en',
        status: 'passed',
        transcript: [],
        mentorFeed: [],
        mentorSessionId: null,
        mentorTurns: 0,
        updatedAt: 1,
      })

    const res = await request(app).get('/api/progress')
    expect(res.status).toBe(200)
    const completed = res.body.completed as string[]
    expect(completed).toContain('git/clean-sweep')
    expect(completed).toContain('git/leaked-secret')
    // Never played: must not be reported as done.
    expect(completed).not.toContain('git/half-deleted')

    await request(app).delete(`/api/learn/${learnId}`)
  })

  it('flags a dead-end run: destroyed uncommitted work that git cannot recover', async () => {
    const runId = await createRun('learn', 'git/ship-only-the-fix')
    await request(app).post(`/api/runs/${runId}/start`)

    // Fresh run: failing checks, but nothing lost yet.
    const before = await request(app).post(`/api/runs/${runId}/submit`)
    expect(before.body.lost).toEqual([])

    // The incident: restore discards the TODO edit, which lives in no commit.
    await request(app)
      .post(`/api/runs/${runId}/command`)
      .send({ command: 'git restore TODO.md', output: '' })
    const after = await request(app).post(`/api/runs/${runId}/submit`)
    expect(after.body.pass).toBe(false)
    const lost = after.body.lost as Array<{ en: string; es: string }>
    expect(lost).toHaveLength(1)
    expect(lost[0]!.en).toBe('Your TODO edit stays local')
  })

  it('stays silent when the required content still exists as a git blob (conservative)', async () => {
    const runId = await createRun('learn', 'git/ship-only-the-fix')
    await request(app).post(`/api/runs/${runId}/start`)

    // Staging writes the edited blob into the object database; the later
    // worktree restore fails the check but the content is still reachable.
    await request(app)
      .post(`/api/runs/${runId}/command`)
      .send({ command: 'git add TODO.md', output: '' })
    await request(app)
      .post(`/api/runs/${runId}/command`)
      .send({ command: 'git restore TODO.md', output: '' })
    const res = await request(app).post(`/api/runs/${runId}/submit`)
    expect(res.body.pass).toBe(false)
    expect(res.body.lost).toEqual([])
  })

  // Deep links (a reload on /git/clean-sweep) must fall through to the SPA
  // shell, not 404. Guards the fallback wiring; the dotfile-path variant of
  // this bug is exercised by the release smoke test from a dot dir.
  it('serves the SPA shell on a deep link, and still 404s unknown API routes', async () => {
    const deep = await request(app).get('/git/clean-sweep')
    expect(deep.status).toBe(200)
    expect(deep.type).toBe('text/html')
    expect(deep.text).toContain('<div id="app">')

    const missingApi = await request(app).get('/api/does-not-exist')
    expect(missingApi.status).toBe(404)
  })
})
