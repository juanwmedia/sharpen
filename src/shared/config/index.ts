// UI-wide tuning knobs. One home so no magic number hides in a component.

/** Pre-run countdown: what is shown and how long each step stays on screen. */
export const COUNTDOWN_STEPS = ['3', '2', '1'] as const
export const COUNTDOWN_STEP_MS = 550

/** Terminal geometry: 20 rows at the 20px row height fills the frame exactly,
 * so a fresh terminal never shows a scrollbar (see TerminalPane). */
export const TERMINAL_COLS = 100
export const TERMINAL_ROWS = 20

/** Commands offered by tab completion (first word only). */
export const SHELL_COMMANDS = [
  'git', 'ls', 'cat', 'rm', 'grep', 'find', 'echo', 'cd', 'pwd', 'head', 'tail', 'wc', 'clear',
] as const

/** Chat follows new messages only when the reader is already near the bottom. */
export const CHAT_FOLLOW_THRESHOLD_PX = 90
export const QUESTION_MAX_LENGTH = 500

export const LEADERBOARD_MAX_ROWS = 12

/** Command output sent to the server transcript is capped at this size. */
export const COMMAND_OUTPUT_MAX_CHARS = 2000

/** Grace period before leaving a run the server no longer knows about. */
export const RUN_LOST_REDIRECT_MS = 2200

/** Timer ring turns red below this remaining time. */
export const TIMER_DANGER_MS = 10_000
export const DEFAULT_TIME_LIMIT_MS = 60_000

export const LOCALE_STORAGE_KEY = 'sharpen.locale'
export const RUN_MODE_STORAGE_KEY = 'sharpen.runMode'

/** Prompt label when the repo is not on any branch (detached HEAD). */
export const DETACHED_HEAD_LABEL = 'HEAD'

/** Route names shared by the router table (app layer) and navigation calls. */
export const ROUTE_NAMES = {
  picker: 'picker',
  challenge: 'challenge',
} as const
