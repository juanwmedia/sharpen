import { markRaw, reactive, readonly } from 'vue'
import type { FsClient } from 'isomorphic-git'
import type { ExecResult } from 'just-bash'
import { getScenario } from '@scenarios/index.ts'
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
  ScenarioSummary,
  LeaderboardRow,
  MentorBubble,
  MentorErrorKind,
  RunMode,
} from '@engine/types.ts'
import { apiRoutes, deleteJson, getJson, postJson, putJson } from '@/shared/api/index.ts'
import {
  COMMAND_OUTPUT_MAX_CHARS,
  COUNTDOWN_STEPS,
  COUNTDOWN_STEP_MS,
  DEFAULT_TIME_LIMIT_MS,
  DETACHED_HEAD_LABEL,
  LEARN_SAVE_DEBOUNCE_MS,
  RUN_LOST_REDIRECT_MS,
  RUN_MODE_STORAGE_KEY,
  SHELL_COMMANDS,
} from '@/shared/config/index.ts'
import { currentLocale, t } from '@/shared/i18n/index.ts'
import { ansi, CRLF } from '@/shared/lib/ansi.ts'
import { nudgePrefs } from './nudges.ts'
import { MENTOR_ROLE, RUN_STATUS } from './types.ts'
import type { GameState, MentorItem, MentorRole } from './types.ts'

interface LearnTranscriptEntry {
  command: string
  output: string
}

interface LearnSnapshot {
  schema: 1
  /** Persisted schema-1 key: stays `challengeId` on disk and on the wire. */
  challengeId: string
  locale: string
  status: 'live' | 'passed' | 'revealed'
  transcript: LearnTranscriptEntry[]
  mentorFeed: MentorItem[]
  mentorSessionId: string | null
  mentorTurns: number
  updatedAt: number
}

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
  scenarios: [],
  leaderboard: [],
  mode: storedRunMode(),
  scenario: null,
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
// Each mentor turn gets its own bubble; deltas within a turn append.
let mentorNewTurn = true
/** Role for the mentor turn currently streaming (set from the first delta). */
let mentorTurnRole: MentorRole = MENTOR_ROLE.mentor

/** Mirror of server transcript for learn-mode persistence. */
let learnTranscript: LearnTranscriptEntry[] = []
let mentorSessionId: string | null = null
let mentorTurns = 0
let learnSaveTimer: ReturnType<typeof setTimeout> | null = null
/** Replay into the terminal once the writer is registered. */
let pendingTerminalReplay: LearnTranscriptEntry[] | null = null

/** Server error kinds mapped to localized bubbles (see server/mentor.ts). */
const MENTOR_ERROR_KEYS: Record<MentorErrorKind, string> = {
  [MENTOR_ERROR_KIND.busy]: 'mentorError.busy',
  [MENTOR_ERROR_KIND.unavailable]: 'mentorError.unavailable',
  [MENTOR_ERROR_KIND.failed]: 'mentorError.failed',
}

function historyPrompt(): string {
  return `${ansi.dim('➜')} ${ansi.dim('repo')} ${ansi.dim('git:(')}${ansi.dim(state.branch)}${ansi.dim(')')} `
}

/** The one place the live prompt is built; TerminalPane reuses it. */
export function livePrompt(): string {
  return `${ansi.brand('➜')} ${ansi.cyan('repo')} ${ansi.dim('git:(')}${ansi.red(state.branch)}${ansi.dim(')')} `
}

/** Stored output is stdout+stderr concatenated; paint the common error cases red. */
function styleStoredOutput(output: string): string {
  const normalized = output.replace(/\n/g, CRLF).replace(/(?:\r?\n)+$/, '')
  if (!normalized) return ''
  if (/^(bash|sharpen|git):/m.test(normalized) || /command not found|not a git repository/i.test(normalized)) {
    return ansi.red(normalized) + CRLF
  }
  return normalized + CRLF
}

function flushTerminalReplay(): void {
  if (!pendingTerminalReplay) return
  const entries = pendingTerminalReplay
  pendingTerminalReplay = null
  if (!entries.length) return
  // TermShell.attach may already have drawn a live prompt on this line.
  termWrite(`\r\x1b[K${ansi.dim(t('terminal.restored', { count: entries.length }))}${CRLF}`)
  for (const entry of entries) {
    termWrite(historyPrompt() + entry.command + CRLF)
    termWrite(styleStoredOutput(entry.output))
  }
  termWrite(livePrompt())
}

export function registerTerminalWriter(writer: (data: string) => void): void {
  termWrite = writer
  flushTerminalReplay()
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
  state.scenarios = await getJson<ScenarioSummary[]>(apiRoutes.scenarios)
}

async function refreshLeaderboard(): Promise<void> {
  state.leaderboard = await getJson<LeaderboardRow[]>(apiRoutes.leaderboard)
}

function learnPersistStatus(): LearnSnapshot['status'] | null {
  if (state.status === RUN_STATUS.live) return 'live'
  if (state.status === RUN_STATUS.passed) return 'passed'
  if (state.status === RUN_STATUS.revealed) return 'revealed'
  return null
}

function scheduleLearnSave(): void {
  if (state.mode !== 'learn' || !state.scenario) return
  const persistStatus = learnPersistStatus()
  if (!persistStatus) return
  if (learnSaveTimer) clearTimeout(learnSaveTimer)
  learnSaveTimer = setTimeout(() => {
    learnSaveTimer = null
    void persistLearnNow()
  }, LEARN_SAVE_DEBOUNCE_MS)
}

async function persistLearnNow(): Promise<void> {
  if (state.mode !== 'learn' || !state.scenario) return
  const persistStatus = learnPersistStatus()
  if (!persistStatus) return
  const snapshot: LearnSnapshot = {
    schema: 1,
    challengeId: state.scenario.id,
    locale: currentLocale(),
    status: persistStatus,
    transcript: learnTranscript.map((t) => ({
      command: t.command,
      output: t.output.slice(0, COMMAND_OUTPUT_MAX_CHARS),
    })),
    mentorFeed: state.mentorFeed.filter((m) => m.role !== MENTOR_ROLE.thinking),
    mentorSessionId,
    mentorTurns,
    updatedAt: Date.now(),
  }
  await putJson(apiRoutes.learn(state.scenario.id), snapshot).catch(() => {})
}

async function fetchLearnSnapshot(scenarioId: string): Promise<LearnSnapshot | null> {
  try {
    const res = await fetch(apiRoutes.learn(scenarioId))
    if (!res.ok) return null
    const data = (await res.json()) as LearnSnapshot | null
    return data
  } catch {
    return null
  }
}

function resetClientRunFields(): void {
  learnTranscript = []
  mentorSessionId = null
  mentorTurns = 0
  pendingTerminalReplay = null
  if (learnSaveTimer) {
    clearTimeout(learnSaveTimer)
    learnSaveTimer = null
  }
  events?.close()
  events = null
  arena = null
  state.runId = null
  state.branch = ARENA_DEFAULT_BRANCH
  state.checks = null
  state.mentorFeed = []
  state.mentorBusy = false
  state.deadline = 0
  state.countdownNum = null
}

/** Scenario mode only: load the scenario into the UI without creating a
 * server run. The timer starts when beginChallenge() calls startRun. */
function prepareScenario(scenarioId: string): void {
  const scenario = getScenario(scenarioId)
  if (!scenario) return
  resetClientRunFields()
  // markRaw: a Scenario carries setup/assert functions; proxying it deeply
  // would be pure overhead (and reactivity on it is never needed).
  state.scenario = markRaw(scenario)
  state.status = RUN_STATUS.briefing
}

/** Modal Start (challenge) or Arena mount (learn): create the server run,
 * optional countdown, then go live. */
async function startRun(scenarioId: string): Promise<void> {
  const scenario = getScenario(scenarioId)
  if (!scenario) return

  resetClientRunFields()

  const snapshot = state.mode === 'learn' ? await fetchLearnSnapshot(scenarioId) : null

  // Locale + mode ride along so the server steers timer and mentor language.
  const { runId } = await postJson<{ runId: string }>(apiRoutes.runs, {
    scenarioId,
    locale: currentLocale(),
    mode: state.mode,
  })

  state.scenario = markRaw(scenario)
  state.runId = runId

  arena = await createArena(scenario)
  connectEvents(runId)

  if (snapshot && state.mode === 'learn') {
    await postJson(apiRoutes.runRestore(runId), {
      transcript: snapshot.transcript,
      status: snapshot.status,
      mentorSessionId: snapshot.mentorSessionId,
      mentorTurns: snapshot.mentorTurns,
    })
    learnTranscript = snapshot.transcript.map((t) => ({ ...t }))
    mentorSessionId = snapshot.mentorSessionId
    mentorTurns = snapshot.mentorTurns
    state.mentorFeed = snapshot.mentorFeed.filter((m) => m.role !== MENTOR_ROLE.thinking)
    for (const { command } of snapshot.transcript) {
      await arena.exec(command)
    }
    pendingTerminalReplay = snapshot.transcript.map((t) => ({ ...t }))
  }

  if (state.mode === 'challenge') {
    state.status = RUN_STATUS.countdown
    for (const step of COUNTDOWN_STEPS) {
      state.countdownNum = step
      await new Promise((resolve) => setTimeout(resolve, COUNTDOWN_STEP_MS))
    }
    state.countdownNum = null
  }

  const started = await postJson<{ deadline: number | null; status?: string }>(apiRoutes.runStart(runId))
  state.deadline = started.deadline ?? 0
  if (snapshot && state.mode === 'learn' && (snapshot.status === 'passed' || snapshot.status === 'revealed')) {
    state.status = snapshot.status === 'passed' ? RUN_STATUS.passed : RUN_STATUS.revealed
  } else {
    state.status = RUN_STATUS.live
  }
  await refreshChecks()
  flushTerminalReplay()
}

async function beginChallenge(): Promise<void> {
  if (state.status !== RUN_STATUS.briefing || !state.scenario) return
  await startRun(state.scenario.id)
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
  if (state.mode === 'learn' && state.scenario) {
    if (learnSaveTimer) {
      clearTimeout(learnSaveTimer)
      learnSaveTimer = null
    }
    void persistLearnNow()
  }
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
  scheduleLearnSave()
}

async function wipeLearn(): Promise<void> {
  if (state.mode !== 'learn' || !state.scenario) return
  const scenarioId = state.scenario.id
  if (learnSaveTimer) {
    clearTimeout(learnSaveTimer)
    learnSaveTimer = null
  }
  await deleteJson(apiRoutes.learn(scenarioId)).catch(() => {})
  events?.close()
  events = null
  state.status = RUN_STATUS.idle
  state.runId = null
  await startRun(scenarioId)
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

let pendingCommandBubble: MentorItem | null = null

/** New conversation items land BEFORE the thinking indicator: the mentor
 * composing is always the newest thing happening, so it stays at the bottom
 * even when commands keep arriving mid-turn. */
function pushBeforeThinking(item: MentorItem): void {
  const idx = state.mentorFeed.findIndex((m) => m.role === MENTOR_ROLE.thinking)
  if (idx === -1) state.mentorFeed.push(item)
  else state.mentorFeed.splice(idx, 0, item)
}

function flushCommandBubble(): void {
  if (!pendingCommandBubble) return
  pushBeforeThinking(pendingCommandBubble)
  pendingCommandBubble = null
}

// Runs AFTER the shell flushed the command output. Core mechanic: EVERY Enter
// validates, so the arena judges the state each command leaves behind.
export async function onCommand(command: string, result: ExecResult): Promise<void> {
  if (state.status !== RUN_STATUS.live) return
  // The command bubble waits for the server's nudge decision: an Enter that
  // wakes nobody (ls, git status, empty) does not belong in the conversation.
  // Flushed by whoever learns the decision first: the submit response or the
  // mentor-thinking SSE frame (they race).
  const firstErrLine = result.exitCode !== 0 ? (result.stderr.split('\n')[0] ?? '') : ''
  pendingCommandBubble = { role: MENTOR_ROLE.youCmd, text: command, ...(firstErrLine ? { meta: firstErrLine } : {}) }
  const output = (result.stdout + result.stderr).slice(0, COMMAND_OUTPUT_MAX_CHARS)
  if (state.mode === 'learn') {
    learnTranscript.push({ command, output })
  }
  await fetch(apiRoutes.runCommand(state.runId ?? ''), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command, output, error: result.exitCode !== 0 }),
  }).catch(() => {})
  await submit({ quiet: true })
  scheduleLearnSave()
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
  const res = await fetch(apiRoutes.runSubmit(state.runId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nudges: { ...nudgePrefs } }),
  })
  if (!res.ok) {
    pendingCommandBubble = null
    return
  }
  const verdict = (await res.json()) as { pass: boolean; checks: Check[]; nudged?: boolean }
  state.checks = verdict.checks
  if (verdict.nudged) flushCommandBubble()
  else pendingCommandBubble = null
  if (verdict.pass) {
    state.status = RUN_STATUS.passed
    termWrite(ansi.green(t('terminal.solved')) + CRLF)
    scheduleLearnSave()
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
  pushBeforeThinking({ role: MENTOR_ROLE.you, text: trimmed })
  scheduleLearnSave()
  // Rejections (queue full) surface through the SSE mentor-error event with a
  // localized bubble, so the response body is not inspected here: doing both
  // painted the same failure twice.
  await fetch(apiRoutes.runAsk(state.runId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: trimmed }),
  }).catch(() => {})
}

// ---------- SSE -------------------------------------------------------------

function pushMentorError(kind: string, detail: string): void {
  const key = MENTOR_ERROR_KEYS[kind as MentorErrorKind]
  // Busy is self-explanatory; the other kinds keep the raw detail as a
  // secondary line because it names the actual failure (e.g. missing CLI).
  const keepDetail = kind !== MENTOR_ERROR_KIND.busy
  const item: MentorItem = key
    ? { role: MENTOR_ROLE.system, text: t(key), ...(keepDetail ? { meta: detail } : {}) }
    : { role: MENTOR_ROLE.system, text: detail }
  state.mentorFeed = state.mentorFeed.filter((m) => m.role !== MENTOR_ROLE.thinking)
  state.mentorFeed.push(item)
  state.mentorBusy = false
  scheduleLearnSave()
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
    const seconds = Math.round((state.scenario?.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS) / 1000)
    termWrite(ansi.yellow(t('terminal.timeout', { seconds })) + CRLF)
    void fetch(apiRoutes.runExpire(runId), { method: 'POST' }).catch(() => {})
  })
  events.addEventListener(ARENA_EVENT.mentorThinking, () => {
    state.mentorBusy = true
    // The SSE frame can beat the submit response: land the command bubble
    // before the thinking indicator so the conversation reads in order.
    flushCommandBubble()
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
  events.addEventListener(ARENA_EVENT.mentorDone, (e) => {
    state.mentorBusy = false
    mentorNewTurn = true
    try {
      const data = JSON.parse((e as MessageEvent).data || '{}') as {
        mentorSessionId?: string | null
        mentorTurns?: number
      }
      if (data.mentorSessionId !== undefined) mentorSessionId = data.mentorSessionId
      if (typeof data.mentorTurns === 'number') mentorTurns = data.mentorTurns
    } catch {
      /* empty mentor-done payloads are fine */
    }
    scheduleLearnSave()
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
    prepareScenario,
    startRun,
    beginChallenge,
    leaveRun,
    askMentor,
    refreshLeaderboard,
    setRunMode,
    revealSolution,
    wipeLearn,
  }
}
