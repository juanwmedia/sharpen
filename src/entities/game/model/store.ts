import { markRaw, reactive, readonly } from 'vue'
import type { FsClient } from 'isomorphic-git'
import type { ExecResult } from 'just-bash'
import { getChallenge } from '@challenges/index.ts'
import { createArena } from '@engine/arena.ts'
import {
  ARENA_DEFAULT_BRANCH,
  ARENA_EVENT,
  DEFAULT_RUN_MODE,
  MENTOR_BUBBLE,
  MENTOR_ERROR_KIND,
  RUN_MODES,
} from '@engine/types.ts'
import type {
  Arena,
  Check,
  ChallengeSummary,
  LeaderboardRow,
  MentorBubble,
  MentorErrorKind,
  RunMode,
} from '@engine/types.ts'
import { apiRoutes, getJson, postJson } from '@/shared/api/index.ts'
import {
  COMMAND_OUTPUT_MAX_CHARS,
  COUNTDOWN_STEPS,
  COUNTDOWN_STEP_MS,
  DEFAULT_TIME_LIMIT_MS,
  DETACHED_HEAD_LABEL,
  RUN_LOST_REDIRECT_MS,
  RUN_MODE_STORAGE_KEY,
  SHELL_COMMANDS,
} from '@/shared/config/index.ts'
import { currentLocale, t } from '@/shared/i18n/index.ts'
import { ansi, CRLF } from '@/shared/lib/ansi.ts'
import { MENTOR_ROLE, RUN_STATUS } from './types.ts'
import type { GameState, MentorItem, MentorRole } from './types.ts'

function storedRunMode(): RunMode {
  try {
    const value = localStorage.getItem(RUN_MODE_STORAGE_KEY)
    if (value && (RUN_MODES as readonly string[]).includes(value)) return value as RunMode
  } catch {
    /* storage unavailable: fall through */
  }
  return DEFAULT_RUN_MODE
}

const state = reactive<GameState>({
  player: '',
  engineVersion: '',
  challenges: [],
  leaderboard: [],
  mode: storedRunMode(),
  challenge: null,
  runId: null,
  status: RUN_STATUS.idle,
  deadline: 0,
  countdownNum: null,
  checks: null,
  branch: ARENA_DEFAULT_BRANCH,
  mentorFeed: [],
  mentorBusy: false,
})

// Non-reactive: the engine instance and the terminal writer registered by the
// TerminalPane widget. Wrapping the arena in a Proxy buys nothing.
let arena: Arena | null = null
let events: EventSource | null = null
let termWrite: (data: string) => void = () => {}
// Navigation is the router's job (app layer): when the server forgets a run,
// the arena page registers what "go home" means.
let runLostHandler: () => void = () => {}
let shellTipShown = false
// Each mentor turn gets its own bubble; deltas within a turn append.
let mentorNewTurn = true
/** Role for the mentor turn currently streaming (set from the first delta). */
let mentorTurnRole: MentorRole = MENTOR_ROLE.mentor

/** Server error kinds mapped to localized bubbles (see server/mentor.ts). */
const MENTOR_ERROR_KEYS: Record<MentorErrorKind, string> = {
  [MENTOR_ERROR_KIND.budget]: 'mentorError.budget',
  [MENTOR_ERROR_KIND.busy]: 'mentorError.busy',
  [MENTOR_ERROR_KIND.unavailable]: 'mentorError.unavailable',
  [MENTOR_ERROR_KIND.failed]: 'mentorError.failed',
}

export function registerTerminalWriter(writer: (data: string) => void): void {
  termWrite = writer
}

export function registerRunLostHandler(handler: () => void): void {
  runLostHandler = handler
}

function setRunMode(mode: RunMode): void {
  state.mode = mode
  try {
    localStorage.setItem(RUN_MODE_STORAGE_KEY, mode)
  } catch {
    /* storage unavailable: the choice just does not persist */
  }
}

async function boot(): Promise<void> {
  const meta = await getJson<{ player: string; engineVersion: string }>(apiRoutes.meta)
  state.player = meta.player
  state.engineVersion = meta.engineVersion
  state.challenges = await getJson<ChallengeSummary[]>(apiRoutes.challenges)
}

async function refreshLeaderboard(): Promise<void> {
  state.leaderboard = await getJson<LeaderboardRow[]>(apiRoutes.leaderboard)
}

async function startRun(challengeId: string): Promise<void> {
  const challenge = getChallenge(challengeId)
  if (!challenge) return

  // Locale + mode ride along so the server steers timer and mentor language.
  const { runId } = await postJson<{ runId: string }>(apiRoutes.runs, {
    challengeId,
    locale: currentLocale(),
    mode: state.mode,
  })

  // markRaw: a Challenge carries setup/assert functions; proxying it deeply
  // would be pure overhead (and reactivity on it is never needed).
  state.challenge = markRaw(challenge)
  state.runId = runId
  state.branch = ARENA_DEFAULT_BRANCH
  state.checks = null
  state.mentorFeed = []
  state.mentorBusy = false
  shellTipShown = false

  arena = await createArena(challenge)
  connectEvents(runId)

  if (state.mode === 'challenge') {
    state.status = RUN_STATUS.countdown
    for (const step of COUNTDOWN_STEPS) {
      state.countdownNum = step
      await new Promise((resolve) => setTimeout(resolve, COUNTDOWN_STEP_MS))
    }
    state.countdownNum = null
  }

  const started = await postJson<{ deadline: number | null }>(apiRoutes.runStart(runId))
  state.status = RUN_STATUS.live
  state.deadline = started.deadline ?? 0
  await refreshChecks()
}

/** Rubric from the local arena: same assert() as the server, no submit side effects. */
async function refreshChecks(): Promise<void> {
  if (!arena) return
  const verdict = await arena.verdict()
  state.checks = verdict.checks
}

// Called when the arena page unmounts (back button, browser back, run lost):
// the run's client-side life ends here. Idempotent.
function leaveRun(): void {
  events?.close()
  events = null
  state.status = RUN_STATUS.idle
  state.runId = null
}

async function revealSolution(): Promise<void> {
  if (state.mode !== 'learn' || state.status !== RUN_STATUS.live || !state.runId) return
  const res = await fetch(apiRoutes.runReveal(state.runId), { method: 'POST' })
  if (!res.ok) return
  state.status = RUN_STATUS.revealed
  termWrite(ansi.yellow(t('terminal.revealed')) + CRLF)
}

// ---------- terminal integration -------------------------------------------

export async function execCommand(command: string): Promise<ExecResult> {
  if (!arena) throw new Error('arena not ready')
  const result = await arena.exec(command)
  state.branch =
    (await arena.git
      // GitFs deliberately hides isomorphic-git's named keys (see types.ts).
      .currentBranch({ fs: arena.gitFs as unknown as FsClient, dir: arena.dir, fullname: false })
      .catch(() => null)) ?? DETACHED_HEAD_LABEL
  return result
}

// Runs AFTER the shell flushed the command output. Core mechanic: EVERY Enter
// validates, so the arena judges the state each command leaves behind.
export async function onCommand(command: string, result: ExecResult): Promise<void> {
  // The mentor's creator tried to greet it right here in the shell, so this
  // tip is not optional: humans WILL talk to the terminal.
  if (result.stderr.includes('command not found') && !shellTipShown) {
    shellTipShown = true
    termWrite(ansi.dim(t('terminal.shellTip')) + CRLF)
  }
  // Every command joins the conversation as a player bubble: the chat is the
  // narrative of the run, the terminal keeps the full output.
  const firstErrLine = result.exitCode !== 0 ? (result.stderr.split('\n')[0] ?? '') : ''
  state.mentorFeed.push({ role: MENTOR_ROLE.youCmd, text: command, ...(firstErrLine ? { meta: firstErrLine } : {}) })
  if (state.status !== RUN_STATUS.live) return
  await fetch(apiRoutes.runCommand(state.runId ?? ''), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command, output: (result.stdout + result.stderr).slice(0, COMMAND_OUTPUT_MAX_CHARS) }),
  }).catch(() => {})
  await submit({ quiet: true })
}

export async function submit({ quiet = false }: { quiet?: boolean } = {}): Promise<void> {
  if (state.status === RUN_STATUS.revealed) {
    if (!quiet) termWrite(ansi.yellow(t('terminal.timeUp')) + CRLF)
    return
  }
  if (state.status === RUN_STATUS.passed) {
    if (!quiet) termWrite(ansi.dim(t('terminal.alreadySolved')) + CRLF)
    return
  }
  if (state.status !== RUN_STATUS.live || !state.runId) return
  const res = await fetch(apiRoutes.runSubmit(state.runId), { method: 'POST' })
  if (!res.ok) return
  const verdict = (await res.json()) as { pass: boolean; checks: Check[] }
  state.checks = verdict.checks
  if (verdict.pass) {
    state.status = RUN_STATUS.passed
    termWrite(ansi.green(t('terminal.solved')) + CRLF)
  } else {
    const green = verdict.checks.filter((c) => c.pass).length
    termWrite(
      quiet
        ? ansi.dim(t('terminal.notYetQuiet', { green, total: verdict.checks.length })) + CRLF
        : ansi.red(t('terminal.notYetLoud')) + CRLF
    )
  }
}

export async function tabCandidates(word: string, isFirstWord: boolean): Promise<string[]> {
  if (!arena) return []
  const cwd = arena.cwd
  let dir = cwd
  let prefix = word
  if (word.includes('/')) {
    const cut = word.lastIndexOf('/')
    const rawDir = word.slice(0, cut + 1)
    prefix = word.slice(cut + 1)
    dir = rawDir.startsWith('/') ? rawDir : `${cwd}/${rawDir}`
  }
  let names: string[] = []
  try {
    names = (await arena.jbFs.readdir(dir)).filter((n) => n.startsWith(prefix))
  } catch {
    names = []
  }
  const base = word.includes('/') ? word.slice(0, word.lastIndexOf('/') + 1) : ''
  const out: string[] = []
  for (const name of names) {
    let suffix = ''
    try {
      if ((await arena.jbFs.stat(`${dir}/${name}`)).isDirectory) suffix = '/'
    } catch {
      /* keep plain */
    }
    out.push(base + name + suffix)
  }
  if (isFirstWord && !word.includes('/')) out.push(...SHELL_COMMANDS.filter((c) => c.startsWith(word)))
  return out
}

// ---------- mentor chat -----------------------------------------------------

async function askMentor(question: string): Promise<void> {
  const trimmed = question.trim()
  if (!trimmed || !state.runId) return
  state.mentorFeed.push({ role: MENTOR_ROLE.you, text: trimmed })
  // Rejections (budget reached, queue full) surface through the SSE
  // mentor-error event with a localized bubble, so the response body is not
  // inspected here: doing both painted the same failure twice.
  await fetch(apiRoutes.runAsk(state.runId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: trimmed }),
  }).catch(() => {})
}

// ---------- SSE -------------------------------------------------------------

function pushMentorError(kind: string, detail: string): void {
  const key = MENTOR_ERROR_KEYS[kind as MentorErrorKind]
  // Budget/busy are self-explanatory; the other kinds keep the raw detail as
  // a secondary line because it names the actual failure (e.g. missing CLI).
  const keepDetail = kind !== MENTOR_ERROR_KIND.budget && kind !== MENTOR_ERROR_KIND.busy
  const item: MentorItem = key
    ? { role: MENTOR_ROLE.system, text: t(key), ...(keepDetail ? { meta: detail } : {}) }
    : { role: MENTOR_ROLE.system, text: detail }
  state.mentorFeed = state.mentorFeed.filter((m) => m.role !== MENTOR_ROLE.thinking)
  state.mentorFeed.push(item)
  state.mentorBusy = false
}

function bubbleToRole(bubble?: MentorBubble): MentorRole {
  return bubble === MENTOR_BUBBLE.reveal ? MENTOR_ROLE.reveal : MENTOR_ROLE.mentor
}

function connectEvents(runId: string): void {
  events?.close()
  events = new EventSource(apiRoutes.runEvents(runId))

  // Runs live in server memory: if the server restarts mid-run, detect it
  // instead of leaving the player in a dead page.
  events.onerror = async () => {
    if (state.status === RUN_STATUS.idle) return
    try {
      const res = await fetch(apiRoutes.run(runId))
      if (res.status === 404) runLost()
    } catch {
      /* transient blip: EventSource retries */
    }
  }

  events.addEventListener(ARENA_EVENT.verdict, (e) => {
    const data = JSON.parse((e as MessageEvent).data) as { checks: Check[] }
    state.checks = data.checks
  })
  events.addEventListener(ARENA_EVENT.timeout, () => {
    if (state.mode === 'learn') return
    state.status = RUN_STATUS.revealed
    const seconds = Math.round((state.challenge?.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS) / 1000)
    termWrite(ansi.yellow(t('terminal.timeout', { seconds })) + CRLF)
    void fetch(apiRoutes.runExpire(runId), { method: 'POST' }).catch(() => {})
  })
  events.addEventListener(ARENA_EVENT.mentorThinking, () => {
    state.mentorBusy = true
    if (!state.mentorFeed.some((m) => m.role === MENTOR_ROLE.thinking)) {
      state.mentorFeed.push({ role: MENTOR_ROLE.thinking, text: t('chat.thinking') })
    }
  })
  events.addEventListener(ARENA_EVENT.mentorDelta, (e) => {
    const { text, bubble } = JSON.parse((e as MessageEvent).data) as {
      text: string
      bubble?: MentorBubble
    }
    state.mentorFeed = state.mentorFeed.filter((m) => m.role !== MENTOR_ROLE.thinking)
    const role = bubbleToRole(bubble)
    const last = state.mentorFeed[state.mentorFeed.length - 1]
    if (!mentorNewTurn && last && last.role === mentorTurnRole) {
      last.text += text
    } else {
      mentorTurnRole = role
      state.mentorFeed.push({ role, text })
      mentorNewTurn = false
    }
  })
  events.addEventListener(ARENA_EVENT.mentorDone, () => {
    state.mentorBusy = false
    mentorNewTurn = true
  })
  events.addEventListener(ARENA_EVENT.mentorError, (e) => {
    const { kind, detail } = JSON.parse((e as MessageEvent).data) as { kind?: string; detail: string }
    pushMentorError(kind ?? '', detail)
  })
  events.addEventListener(ARENA_EVENT.leaderboardUpdated, () => void refreshLeaderboard())
}

function runLost(): void {
  if (state.status === RUN_STATUS.idle) return
  state.status = RUN_STATUS.idle
  events?.close()
  termWrite(CRLF + ansi.yellow(t('terminal.runLost')) + CRLF)
  setTimeout(() => runLostHandler(), RUN_LOST_REDIRECT_MS)
}

export function useGame() {
  return {
    state: readonly(state),
    boot,
    startRun,
    leaveRun,
    askMentor,
    refreshLeaderboard,
    setRunMode,
    revealSolution,
  }
}
