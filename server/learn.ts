import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../engine/types.ts'
import { dataDir } from './store.ts'

/** Cap on stored per-command output in learn snapshots (matches run transcript). */
export const LEARN_TRANSCRIPT_OUTPUT_MAX_CHARS = 4000

export const LEARN_STATUSES = ['live', 'passed', 'revealed'] as const
export type LearnStatus = (typeof LEARN_STATUSES)[number]

export interface LearnTranscriptEntry {
  command: string
  output: string
}

export interface LearnMentorItem {
  role: string
  text: string
  meta?: string
}

export interface LearnSnapshot {
  schema: 1
  challengeId: string
  locale: Locale
  status: LearnStatus
  transcript: LearnTranscriptEntry[]
  mentorFeed: LearnMentorItem[]
  mentorSessionId: string | null
  mentorTurns: number
  updatedAt: number
}

const learnDir = join(dataDir, 'learn')

function snapshotPath(challengeId: string): string {
  return join(learnDir, `${challengeId.replaceAll('/', '__')}.json`)
}

async function ensureLearnDir(): Promise<void> {
  await mkdir(learnDir, { recursive: true })
}

/** Drop ephemeral UI bubbles before persisting. */
export function sanitizeMentorFeed(feed: LearnMentorItem[]): LearnMentorItem[] {
  return feed
    .filter((item) => item.role !== 'thinking')
    .map(({ role, text, meta }) => (meta ? { role, text, meta } : { role, text }))
}

export function parseLearnSnapshot(raw: unknown, challengeId: string): LearnSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as Record<string, unknown>
  if (body.schema !== 1) return null
  if (body.challengeId !== challengeId) return null
  const locale = LOCALES.find((l) => l === body.locale) ?? DEFAULT_LOCALE
  const status = LEARN_STATUSES.find((s) => s === body.status)
  if (!status) return null
  if (!Array.isArray(body.transcript) || !Array.isArray(body.mentorFeed)) return null
  const transcript: LearnTranscriptEntry[] = []
  for (const entry of body.transcript) {
    if (!entry || typeof entry !== 'object') return null
    const { command, output } = entry as Record<string, unknown>
    if (typeof command !== 'string') return null
    transcript.push({
      command,
      output: String(output ?? '').slice(0, LEARN_TRANSCRIPT_OUTPUT_MAX_CHARS),
    })
  }
  const mentorFeed = sanitizeMentorFeed(
    (body.mentorFeed as LearnMentorItem[]).filter(
      (item) => item && typeof item.role === 'string' && typeof item.text === 'string'
    )
  )
  const mentorSessionId =
    body.mentorSessionId === null || typeof body.mentorSessionId === 'string'
      ? (body.mentorSessionId as string | null)
      : null
  const mentorTurns = typeof body.mentorTurns === 'number' && body.mentorTurns >= 0 ? body.mentorTurns : 0
  return {
    schema: 1,
    challengeId,
    locale,
    status,
    transcript,
    mentorFeed,
    mentorSessionId,
    mentorTurns,
    updatedAt: typeof body.updatedAt === 'number' ? body.updatedAt : Date.now(),
  }
}

export async function loadLearn(challengeId: string): Promise<LearnSnapshot | null> {
  try {
    const raw = JSON.parse(await readFile(snapshotPath(challengeId), 'utf8')) as unknown
    return parseLearnSnapshot(raw, challengeId)
  } catch {
    return null
  }
}

export async function saveLearn(snapshot: LearnSnapshot): Promise<void> {
  await ensureLearnDir()
  const cleaned: LearnSnapshot = {
    ...snapshot,
    schema: 1,
    mentorFeed: sanitizeMentorFeed(snapshot.mentorFeed),
    transcript: snapshot.transcript.map((t) => ({
      command: t.command,
      output: t.output.slice(0, LEARN_TRANSCRIPT_OUTPUT_MAX_CHARS),
    })),
    updatedAt: Date.now(),
  }
  await writeFile(snapshotPath(snapshot.challengeId), JSON.stringify(cleaned, null, 2))
}

export async function deleteLearn(challengeId: string): Promise<void> {
  try {
    await unlink(snapshotPath(challengeId))
  } catch {
    /* already gone */
  }
}
