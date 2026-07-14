import { reactive, readonly } from 'vue'
import type { FsClient } from 'isomorphic-git'
import type { ExecResult } from 'just-bash'
import { getChallenge } from '../../challenges/index.ts'
import { createArena } from '../../engine/arena.ts'
import type { Arena, Challenge, ChallengeSummary, Check, LeaderboardRow } from '../../engine/types.ts'

export type RunStatus = 'idle' | 'countdown' | 'live' | 'passed' | 'revealed'

export interface MentorItem {
  role: 'mentor' | 'you' | 'you-cmd' | 'system' | 'thinking'
  text: string
  /** Secondary line, e.g. the error a failed command printed. */
  meta?: string
}

interface GameState {
  screen: 'picker' | 'arena'
  player: string
  engineVersion: string
  challenges: ChallengeSummary[]
  leaderboard: LeaderboardRow[]
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

const state = reactive<GameState>({
  screen: 'picker',
  player: '',
  engineVersion: '',
  challenges: [],
  leaderboard: [],
  challenge: null,
  runId: null,
  status: 'idle',
  deadline: 0,
  countdownNum: null,
  checks: null,
  branch: 'main',
  mentorFeed: [],
  mentorBusy: false,
})

// Non-reactive: the engine instance and the terminal writer registered by the
// TerminalPane component. Wrapping the arena in a Proxy buys nothing.
let arena: Arena | null = null
let events: EventSource | null = null
let termWrite: (data: string) => void = () => {}
let cmdTipShown = false
// Each mentor turn gets its own bubble; deltas within a turn append.
let mentorNewTurn = true

export function registerTerminalWriter(writer: (data: string) => void): void {
  termWrite = writer
}

async function boot(): Promise<void> {
  const meta = (await (await fetch('/api/meta')).json()) as { player: string; engineVersion: string }
  state.player = meta.player
  state.engineVersion = meta.engineVersion
  state.challenges = (await (await fetch('/api/challenges')).json()) as ChallengeSummary[]
  await refreshLeaderboard()
}

async function refreshLeaderboard(): Promise<void> {
  state.leaderboard = (await (await fetch('/api/leaderboard')).json()) as LeaderboardRow[]
}

async function startRun(challengeId: string): Promise<void> {
  const challenge = getChallenge(challengeId)
  if (!challenge) return

  const { runId } = (await (
    await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId }),
    })
  ).json()) as { runId: string }

  state.challenge = challenge
  state.runId = runId
  state.status = 'countdown'
  state.branch = 'main'
  state.checks = null
  state.mentorFeed = []
  state.mentorBusy = false
  state.screen = 'arena'
  cmdTipShown = false

  arena = await createArena(challenge)
  connectEvents(runId)

  for (const n of ['3', '2', '1']) {
    state.countdownNum = n
    await new Promise((resolve) => setTimeout(resolve, 550))
  }
  state.countdownNum = null

  const started = (await (await fetch(`/api/runs/${runId}/start`, { method: 'POST' })).json()) as {
    deadline: number
  }
  state.status = 'live'
  state.deadline = started.deadline
}

function backToPicker(): void {
  events?.close()
  events = null
  state.status = 'idle'
  state.screen = 'picker'
  void refreshLeaderboard()
}

// ---------- terminal integration -------------------------------------------

export async function execCommand(command: string): Promise<ExecResult> {
  if (!arena) throw new Error('arena not ready')
  const result = await arena.exec(command)
  state.branch =
    (await arena.git
      // GitFs deliberately hides isomorphic-git's named keys (see types.ts).
      .currentBranch({ fs: arena.gitFs as unknown as FsClient, dir: arena.dir, fullname: false })
      .catch(() => null)) ?? 'HEAD'
  return result
}

// Runs AFTER the shell flushed the command output. Core mechanic: EVERY Enter
// validates, so the arena judges the state each command leaves behind.
export async function onCommand(command: string, result: ExecResult): Promise<void> {
  // The mentor's creator tried to greet it right here in the shell, so this
  // tip is not optional: humans WILL talk to the terminal.
  if (result.stderr.includes('command not found') && !cmdTipShown) {
    cmdTipShown = true
    termWrite(
      '\x1b[38;5;245mThat is the shell, not the mentor. Ask the mentor in the side panel; ' +
        'every Enter validates your repo state.\x1b[0m\r\n'
    )
  }
  // Every command joins the conversation as a player bubble: the chat is the
  // narrative of the run, the terminal keeps the full output.
  const firstErrLine = result.exitCode !== 0 ? (result.stderr.split('\n')[0] ?? '') : ''
  state.mentorFeed.push({ role: 'you-cmd', text: command, ...(firstErrLine ? { meta: firstErrLine } : {}) })
  if (state.status !== 'live') return
  await fetch(`/api/runs/${state.runId}/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command, output: (result.stdout + result.stderr).slice(0, 2000) }),
  }).catch(() => {})
  await submit({ quiet: true })
}

export async function submit({ quiet = false }: { quiet?: boolean } = {}): Promise<void> {
  if (state.status === 'revealed') {
    if (!quiet) termWrite('\x1b[33mTime is up. The mentor is teaching. You can keep experimenting.\x1b[0m\r\n')
    return
  }
  if (state.status === 'passed') {
    if (!quiet)
      termWrite('\x1b[38;5;245mAlready solved. Ask the mentor in the side panel, or go back for the next challenge.\x1b[0m\r\n')
    return
  }
  if (state.status !== 'live') return
  const res = await fetch(`/api/runs/${state.runId}/submit`, { method: 'POST' })
  if (!res.ok) return
  const verdict = (await res.json()) as { pass: boolean; checks: Check[] }
  state.checks = verdict.checks
  if (verdict.pass) {
    state.status = 'passed'
    termWrite('\x1b[32m✓ Challenge solved. The arena validated your repo state.\x1b[0m\r\n')
  } else {
    const green = verdict.checks.filter((c) => c.pass).length
    termWrite(
      quiet
        ? `\x1b[38;5;245m✗ not yet: ${green}/${verdict.checks.length} checks green\x1b[0m\r\n`
        : '\x1b[31m✗ Not yet. Check the verdict panel. The mentor has a hint.\x1b[0m\r\n'
    )
  }
}

export async function tabCandidates(word: string, isFirstWord: boolean): Promise<string[]> {
  if (!arena) return []
  const COMMANDS = ['git', 'ls', 'cat', 'rm', 'grep', 'find', 'echo', 'cd', 'pwd', 'head', 'tail', 'wc', 'clear']
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
  if (isFirstWord && !word.includes('/')) out.push(...COMMANDS.filter((c) => c.startsWith(word)))
  return out
}

// ---------- mentor chat -----------------------------------------------------

async function askMentor(question: string): Promise<void> {
  const trimmed = question.trim()
  if (!trimmed || !state.runId) return
  state.mentorFeed.push({ role: 'you', text: trimmed })
  const res = await fetch(`/api/runs/${state.runId}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: trimmed }),
  })
  if (res.ok || res.status === 429) {
    const { accepted } = (await res.json().catch(() => ({ accepted: false }))) as { accepted: boolean }
    if (!accepted) {
      state.mentorFeed.push({
        role: 'system',
        text: 'The mentor cannot take that question right now (turn budget reached).',
      })
    }
  }
}

// ---------- SSE -------------------------------------------------------------

function connectEvents(runId: string): void {
  events?.close()
  events = new EventSource(`/api/runs/${runId}/events`)

  // Runs live in server memory: if the server restarts mid-run, detect it
  // instead of leaving the player in a dead page.
  events.onerror = async () => {
    if (state.status === 'idle') return
    try {
      const res = await fetch(`/api/runs/${runId}`)
      if (res.status === 404) runLost()
    } catch {
      /* transient blip: EventSource retries */
    }
  }

  events.addEventListener('verdict', (e) => {
    const data = JSON.parse((e as MessageEvent).data) as { checks: Check[] }
    state.checks = data.checks
  })
  events.addEventListener('timeout', () => {
    state.status = 'revealed'
    termWrite('\x1b[33m⏱ 60 seconds are gone. Mentor incoming, and you can keep typing.\x1b[0m\r\n')
    void fetch(`/api/runs/${state.runId}/expire`, { method: 'POST' }).catch(() => {})
  })
  events.addEventListener('mentor-thinking', () => {
    state.mentorBusy = true
    if (!state.mentorFeed.some((m) => m.role === 'thinking')) {
      state.mentorFeed.push({ role: 'thinking', text: 'thinking…' })
    }
  })
  events.addEventListener('mentor-delta', (e) => {
    const { text } = JSON.parse((e as MessageEvent).data) as { text: string }
    state.mentorFeed = state.mentorFeed.filter((m) => m.role !== 'thinking')
    const last = state.mentorFeed[state.mentorFeed.length - 1]
    if (!mentorNewTurn && last && last.role === 'mentor') {
      last.text += text
    } else {
      state.mentorFeed.push({ role: 'mentor', text })
      mentorNewTurn = false
    }
  })
  events.addEventListener('mentor-done', () => {
    state.mentorBusy = false
    mentorNewTurn = true
  })
  events.addEventListener('mentor-error', (e) => {
    const { detail } = JSON.parse((e as MessageEvent).data) as { detail: string }
    state.mentorFeed = state.mentorFeed.filter((m) => m.role !== 'thinking')
    state.mentorFeed.push({ role: 'system', text: detail })
    state.mentorBusy = false
  })
  events.addEventListener('leaderboard-updated', () => void refreshLeaderboard())
}

function runLost(): void {
  if (state.status === 'idle') return
  state.status = 'idle'
  events?.close()
  termWrite('\r\n\x1b[33mThe arena server restarted and this run is gone. Taking you back to the challenges…\x1b[0m\r\n')
  setTimeout(() => {
    state.screen = 'picker'
    void refreshLeaderboard()
  }, 2200)
}

export function useGame() {
  return { state: readonly(state), boot, startRun, backToPicker, askMentor, refreshLeaderboard }
}
