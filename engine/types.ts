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

/** How a run is scored and timed. Learn: no timer, no local ranking.
 * Challenge: countdown + timer, local evidence on pass/timeout. */
export const RUN_MODES = ['learn', 'challenge'] as const
export type RunMode = (typeof RUN_MODES)[number]
export const DEFAULT_RUN_MODE: RunMode = 'learn'

/** Which signals auto-wake the mentor after a failed validation. Part of the
 * API contract: the web sends them in every submit body; what each signal
 * MEANS is engine-defined (git: repo hash moved / command exited nonzero). */
export interface NudgePrefs {
  onChange: boolean
  onError: boolean
}
export const DEFAULT_NUDGE_PREFS: NudgePrefs = { onChange: true, onError: true }

/** Mentor bubble kind on mentor-delta SSE; omit for the default mentor style. */
export const MENTOR_BUBBLE = {
  mentor: 'mentor',
  reveal: 'reveal',
} as const
export type MentorBubble = (typeof MENTOR_BUBBLE)[keyof typeof MENTOR_BUBBLE]

/** Branch every arena repo is initialized on; scenarios may assume it. */
export const ARENA_DEFAULT_BRANCH = 'main'

/** Player-facing text a scenario author writes in every supported language.
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

export interface ScenarioSetupEnv {
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

export interface ScenarioAssertContext {
  snapshot: Snapshot
  fs: IFileSystem
  gitFs: GitFs
  git: typeof isogit
  dir: string
}

export interface Scenario {
  id: string
  /** Immutable published version: bump on ANY change to a distributed
   * scenario. Evidence records it so rankings know what was actually played. */
  version: number
  /** Artifact kind ('git', later 'ts', 'sql'...): declares which vocabulary
   * interprets the document and which logo the UI shows for the scenario. */
  kind: string
  pack: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  timeLimitMs: number
  /** Situation narrative. No solving commands. */
  briefing: Localized
  /** ASCII directory snapshot of the initial state. English paths only. */
  tree: string
  /** What "done" looks like in human terms. */
  objective: Localized
  /** Concept chips (English git vocabulary). Not solving commands. */
  themes: string[]
  /** Canonical solution, revealed by the mentor after timeout (challenge) or
   * voluntary reveal (learn). English only: it feeds the mentor. */
  walkthrough: string
  /** Canonical solving commands: machine proof of solvability (the dry-run
   * validator replays them). Never shown to the player. */
  solution: string[]
  setup(env: ScenarioSetupEnv): Promise<void>
  assert(ctx: ScenarioAssertContext): Promise<{ pass: boolean; checks: Check[] }>
}

export type ScenarioSummary = Pick<
  Scenario,
  'id' | 'kind' | 'pack' | 'title' | 'difficulty' | 'timeLimitMs' | 'briefing' | 'tree' | 'objective' | 'themes'
>

/** isomorphic-git PromiseFsClient produced by the fs bridge. */
export interface GitFs {
  promises: Record<string, (...args: never[]) => Promise<unknown>>
}

export interface Arena {
  scenario: Scenario
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
  /** Persisted schema-1 key: stays `challengeId` on disk (the entity renamed
   * to Scenario in code, but evidence files predate that and v2 replays them). */
  challengeId: string
  /** Version of the scenario that was played (additive since 2026-07: older
   * evidence files lack it, readers must tolerate its absence). */
  scenarioVersion?: number
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
  busy: 'mentor-busy',
  unavailable: 'mentor-unavailable',
  failed: 'mentor-error',
} as const
export type MentorErrorKind = (typeof MENTOR_ERROR_KIND)[keyof typeof MENTOR_ERROR_KIND]

/** SSE events the server pushes to the arena page. */
export type ArenaEvent =
  | { type: typeof ARENA_EVENT.started; startedAt: number; deadline: number | null }
  | { type: typeof ARENA_EVENT.verdict; pass: boolean; checks: Check[]; attempts: number }
  | { type: typeof ARENA_EVENT.timeout }
  | { type: typeof ARENA_EVENT.mentorThinking }
  | { type: typeof ARENA_EVENT.mentorDelta; text: string; bubble?: MentorBubble }
  | { type: typeof ARENA_EVENT.mentorDone; mentorSessionId?: string | null; mentorTurns?: number }
  | { type: typeof ARENA_EVENT.mentorError; kind: MentorErrorKind; detail: string }
  | { type: typeof ARENA_EVENT.leaderboardUpdated }
