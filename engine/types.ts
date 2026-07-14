// Shared contracts across engine, server, web, and (in v2) CI replay.
// Change these deliberately: evidence on disk and the SSE protocol depend on
// them.

import type { Bash, ExecResult, IFileSystem } from 'just-bash'
import type * as isogit from 'isomorphic-git'

/** Languages the arena UI and the mentor speak. Part of the API contract:
 * the web sends the locale on run creation, the server steers the mentor. */
export const LOCALES = ['en', 'es'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

/** Branch every arena repo is initialized on; challenges may assume it. */
export const ARENA_DEFAULT_BRANCH = 'main'

/** Player-facing text a challenge author writes in every supported language.
 * English stays canonical for mentor prompts and evidence readability. */
export type Localized = Record<Locale, string>

/** isomorphic-git statusMatrix row: [filepath, head, workdir, stage]. */
export type StatusRow = [string, 0 | 1, 0 | 1 | 2, 0 | 1 | 2 | 3]

export interface Check {
  name: Localized
  pass: boolean
  detail: Localized
}

export interface Verdict {
  pass: boolean
  checks: Check[]
  stateHash: string
}

export interface Snapshot {
  head: { oid: string | null; branch: string | null }
  branches: Record<string, string>
  status: StatusRow[]
  log: Array<{ oid: string; message: string }>
}

export interface ChallengeSetupEnv {
  fs: IFileSystem
  git: typeof isogit
  gitFs: GitFs
  dir: string
  write(path: string, content: string): Promise<void>
  remove(path: string): Promise<void>
  add(...paths: string[]): Promise<void>
  commit(message: string): Promise<string>
  branch(name: string, opts?: { checkout?: boolean }): Promise<void>
  checkout(ref: string): Promise<void>
}

export interface ChallengeAssertContext {
  snapshot: Snapshot
  fs: IFileSystem
  gitFs: GitFs
  git: typeof isogit
  dir: string
}

export interface Challenge {
  id: string
  pack: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  timeLimitMs: number
  statement: Localized
  /** Commands surfaced in the UI and in mentor prompts. */
  focusCommands: string[]
  /** Canonical solution, only revealed by the mentor after timeout. English
   * only: it feeds the mentor, which answers in the player's language. */
  walkthrough: string
  setup(env: ChallengeSetupEnv): Promise<void>
  assert(ctx: ChallengeAssertContext): Promise<{ pass: boolean; checks: Check[] }>
}

export type ChallengeSummary = Pick<
  Challenge,
  'id' | 'pack' | 'title' | 'difficulty' | 'timeLimitMs' | 'statement' | 'focusCommands'
>

/** isomorphic-git PromiseFsClient produced by the fs bridge. */
export interface GitFs {
  promises: Record<string, (...args: never[]) => Promise<unknown>>
}

export interface Arena {
  challenge: Challenge
  jbFs: IFileSystem
  gitFs: GitFs
  bash: Bash
  dir: string
  git: typeof isogit
  readonly cwd: string
  exec(command: string): Promise<ExecResult>
  snapshot(): Promise<Snapshot>
  verdict(): Promise<Verdict>
}

/** Evidence schema v1: the unit of trust for the ranking (see README). */
export interface Evidence {
  schema: 1
  engineVersion: string
  runId: string
  challengeId: string
  player: string
  startedAt: number
  submittedAt: number
  durationMs: number
  attempts: number
  transcript: string[]
  pass: boolean
  checks: Check[]
  stateHash: string
  nonce: string | null
}

export interface LeaderboardRow {
  player: string
  score: number
  solved: number
  attempts: number
  bestMs: number | null
}

/** SSE event names: the wire protocol between server emits and browser
 * listeners. One definition so neither side ever drifts. */
export const ARENA_EVENT = {
  started: 'started',
  verdict: 'verdict',
  timeout: 'timeout',
  mentorThinking: 'mentor-thinking',
  mentorDelta: 'mentor-delta',
  mentorDone: 'mentor-done',
  mentorError: 'mentor-error',
  leaderboardUpdated: 'leaderboard-updated',
} as const
export type ArenaEventName = (typeof ARENA_EVENT)[keyof typeof ARENA_EVENT]

/** Mentor failure kinds carried by the mentor-error event; the web maps each
 * to a localized bubble. */
export const MENTOR_ERROR_KIND = {
  budget: 'mentor-budget',
  busy: 'mentor-busy',
  unavailable: 'mentor-unavailable',
  failed: 'mentor-error',
} as const
export type MentorErrorKind = (typeof MENTOR_ERROR_KIND)[keyof typeof MENTOR_ERROR_KIND]

/** SSE events the server pushes to the arena page. */
export type ArenaEvent =
  | { type: typeof ARENA_EVENT.started; startedAt: number; deadline: number }
  | { type: typeof ARENA_EVENT.verdict; pass: boolean; checks: Check[]; attempts: number }
  | { type: typeof ARENA_EVENT.timeout }
  | { type: typeof ARENA_EVENT.mentorThinking }
  | { type: typeof ARENA_EVENT.mentorDelta; text: string }
  | { type: typeof ARENA_EVENT.mentorDone }
  | { type: typeof ARENA_EVENT.mentorError; kind: MentorErrorKind; detail: string }
  | { type: typeof ARENA_EVENT.leaderboardUpdated }
