// Shared contracts across engine, server, web, and (in v2) CI replay.
// Change these deliberately: evidence on disk and the SSE protocol depend on
// them.

import type { Bash, ExecResult, IFileSystem } from 'just-bash'
import type * as isogit from 'isomorphic-git'

/** isomorphic-git statusMatrix row: [filepath, head, workdir, stage]. */
export type StatusRow = [string, 0 | 1, 0 | 1 | 2, 0 | 1 | 2 | 3]

export interface Check {
  name: string
  pass: boolean
  detail: string
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
  statement: string
  /** Commands surfaced in the UI and in mentor prompts. */
  focusCommands: string[]
  /** Canonical solution, only revealed by the mentor after timeout. */
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

/** SSE events the server pushes to the arena page. */
export type ArenaEvent =
  | { type: 'started'; startedAt: number; deadline: number }
  | { type: 'verdict'; pass: boolean; checks: Check[]; attempts: number }
  | { type: 'timeout' }
  | { type: 'mentor-thinking' }
  | { type: 'mentor-delta'; text: string }
  | { type: 'mentor-done' }
  | { type: 'mentor-error'; kind: string; detail: string }
  | { type: 'leaderboard-updated' }
