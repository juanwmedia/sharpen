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
  'git', 'run', 'writefile', 'ls', 'cat', 'rm', 'grep', 'find', 'echo', 'cd', 'pwd', 'head', 'tail', 'wc', 'clear',
] as const

/** The conversation box caps near the terminal frame height and scrolls
 * inside; the newest message is always kept in view. */
export const CHAT_FEED_MAX_HEIGHT_PX = 440
export const QUESTION_MAX_LENGTH = 500

/** Focus swap between terminal and chat: the physical key above Tab (` on
 * ANSI, º on Spanish ISO). Chromium on ISO Macs swaps Backquote and
 * IntlBackslash, so both codes mean that key somewhere. */
export const SWAP_SHORTCUT_CODES: readonly string[] = ['Backquote', 'IntlBackslash']
export const SWAP_SHORTCUT_LABEL = 'Ctrl+`'

/** kind=ts Run while Monaco has focus. Monaco KeyMod.CtrlCmd = Cmd on macOS. */
export const TS_RUN_SHORTCUT_LABEL =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘+Enter'
    : 'Ctrl+Enter'

/** Logo shown on scenario cards per artifact kind (assets in public/kinds/).
 * A kind without an entry simply shows no logo. */
export const KIND_LOGOS: Readonly<Record<string, string>> = {
  git: '/kinds/git.svg',
  ts: '/kinds/ts.svg',
}

/** Command output sent to the server transcript is capped at this size. */
export const COMMAND_OUTPUT_MAX_CHARS = 2000

/** Grace period before leaving a run the server no longer knows about. */
export const RUN_LOST_REDIRECT_MS = 2200

/** Timer ring turns red below this remaining time. */
export const TIMER_DANGER_MS = 10_000
export const DEFAULT_TIME_LIMIT_MS = 60_000

export const LOCALE_STORAGE_KEY = 'sharpen.locale'
export const RUN_MODE_STORAGE_KEY = 'sharpen.runMode'
export const MENTOR_NUDGES_STORAGE_KEY = 'sharpen.mentorNudges'

/** Debounce for writing learn progress to ~/.sharpen/learn/. */
export const LEARN_SAVE_DEBOUNCE_MS = 400

/** Prompt label when the repo is not on any branch (detached HEAD). */
export const DETACHED_HEAD_LABEL = 'HEAD'

/** Home of the brand this arena belongs to (topbar byline link). */
export const FRONTENDLEAP_URL = 'https://frontendleap.com'

/** Route names shared by the router table (app layer) and navigation calls. */
export const ROUTE_NAMES = {
  picker: 'picker',
  scenario: 'scenario',
} as const
