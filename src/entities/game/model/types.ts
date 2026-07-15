import type { Challenge, ChallengeSummary, Check, LeaderboardRow, RunMode } from '@engine/types.ts'

/** Client-side run lifecycle. Distinct from the server's (it adds the
 * pre-network idle/countdown phases). */
export const RUN_STATUS = {
  idle: 'idle',
  /** Challenge mode: scenario loaded, waiting for Start (no server run yet). */
  briefing: 'briefing',
  countdown: 'countdown',
  live: 'live',
  passed: 'passed',
  revealed: 'revealed',
} as const
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS]

/** Who speaks in a conversation bubble. */
export const MENTOR_ROLE = {
  mentor: 'mentor',
  reveal: 'reveal',
  you: 'you',
  youCmd: 'you-cmd',
  system: 'system',
  thinking: 'thinking',
} as const
export type MentorRole = (typeof MENTOR_ROLE)[keyof typeof MENTOR_ROLE]

export interface MentorItem {
  role: MentorRole
  text: string
  /** Secondary line, e.g. the error a failed command printed. */
  meta?: string
}

export interface GameState {
  player: string
  engineVersion: string
  challenges: ChallengeSummary[]
  leaderboard: LeaderboardRow[]
  /** Preferred mode for the next run; persisted in localStorage. */
  mode: RunMode
  challenge: Challenge | null
  runId: string | null
  status: RunStatus
  deadline: number
  countdownNum: string | null
  checks: Check[] | null
  branch: string
  mentorFeed: MentorItem[]
  mentorBusy: boolean
}
