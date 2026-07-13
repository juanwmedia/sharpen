import './vendor/buffer-shim.js'
import '@wterm/dom/css'
import { WTerm } from '@wterm/dom'
import { getChallenge } from '../../challenges/index.mjs'
import { createArena } from '../../engine/arena.mjs'
import { TermShell } from './vendor/bash-shell.js'

const $ = (id) => document.getElementById(id)

const COMMANDS = ['git', 'ls', 'cat', 'rm', 'grep', 'find', 'echo', 'cd', 'pwd', 'head', 'tail', 'wc', 'clear']
const RING = 326.7 // 2πr for r=52

const state = {
  challenge: null,
  arena: null,
  runId: null,
  status: 'idle', // idle | live | passed | revealed
  deadline: null,
  timerRaf: null,
  term: null,
  shell: null,
  events: null,
  mentorMsg: null,
  branch: 'main',
}

// ---------- boot ----------------------------------------------------------

async function boot() {
  const meta = await (await fetch('/api/meta')).json()
  $('player-chip').textContent = ''
  $('player-chip').append(playerLink(meta.player))
  $('player-chip').classList.add('with-avatar')
  $('version-chip').textContent = `engine ${meta.engineVersion}`

  const challenges = await (await fetch('/api/challenges')).json()
  const list = $('challenge-list')
  list.innerHTML = ''
  for (const c of challenges) {
    const card = document.createElement('button')
    card.className = 'card'
    card.innerHTML = `
      <div class="card-top"><h3>${c.title}</h3>
        <span class="meta">${c.pack} · ${c.difficulty} · ${Math.round(c.timeLimitMs / 1000)}s</span></div>
      <p>${c.statement}</p>
      <span class="go">→ enter the arena</span>`
    card.addEventListener('click', () => startRun(c.id))
    list.appendChild(card)
  }
  await refreshLeaderboard()
}

// Player names are GitHub logins when gh is available, so the avatar is one
// URL away. Broken avatars (offline, or a non-GitHub name) fall back to an
// initials badge.
function avatarFor(player) {
  const wrap = document.createElement('span')
  wrap.className = 'avatar'
  const initials = document.createElement('span')
  initials.className = 'avatar-fallback'
  initials.textContent = player.slice(0, 2).toUpperCase()
  const img = document.createElement('img')
  img.src = `https://github.com/${encodeURIComponent(player)}.png?size=48`
  img.alt = ''
  img.loading = 'lazy'
  img.addEventListener('error', () => img.remove())
  wrap.append(initials, img)
  return wrap
}

// Avatar + name linking to the player's GitHub profile, in a new tab.
function playerLink(player) {
  const a = document.createElement('a')
  a.className = 'player-link'
  a.href = `https://github.com/${encodeURIComponent(player)}`
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.title = `Open ${player}'s GitHub profile`
  a.append(avatarFor(player), document.createTextNode(player))
  return a
}

async function refreshLeaderboard() {
  const rows = await (await fetch('/api/leaderboard')).json()
  const tbody = $('leaderboard').querySelector('tbody')
  tbody.innerHTML = ''
  $('board-empty').classList.toggle('hidden', rows.length > 0)
  rows.slice(0, 12).forEach((r, i) => {
    const tr = document.createElement('tr')
    const cells = {
      rank: String(i + 1),
      player: null,
      score: String(r.score),
      solved: `${r.solved}/${r.attempts}`,
      best: r.bestMs === null ? '-' : `${(r.bestMs / 1000).toFixed(1)}s`,
    }
    for (const [key, text] of Object.entries(cells)) {
      const td = document.createElement('td')
      td.className = key
      if (key === 'player') {
        td.append(playerLink(r.player))
      } else {
        td.textContent = text
      }
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  })
}

// ---------- run lifecycle --------------------------------------------------

async function startRun(challengeId) {
  const challenge = getChallenge(challengeId)
  if (!challenge) return

  const { runId } = await (
    await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId }),
    })
  ).json()

  state.challenge = challenge
  state.runId = runId
  state.status = 'idle'
  state.branch = 'main'
  state.mentorMsg = null

  $('run-title').textContent = challenge.title
  $('run-difficulty').textContent = challenge.difficulty
  $('run-statement').textContent = challenge.statement
  $('run-focus').innerHTML = challenge.focusCommands
    .map((c) => `<span class="chip">${c}</span>`)
    .join('')
  $('checks').innerHTML = '<li class="pending">Validate to see the checks.</li>'
  $('mentor-feed').innerHTML =
    '<p class="mentor-idle">Ask me here anytime. While the clock runs I only nudge, never spoil; when it ends, I teach.</p>'
  $('mentor-input').placeholder = 'Ask for a nudge…'
  state.cmdTipShown = false
  setStatus('get ready', '')
  setTimer(challenge.timeLimitMs / 1000, 1)

  $('screen-select').classList.add('hidden')
  $('screen-run').classList.remove('hidden')

  state.arena = await createArena(challenge)
  await mountTerminal()
  connectEvents()
  await countdown()
  const started = await (await fetch(`/api/runs/${runId}/start`, { method: 'POST' })).json()
  state.status = 'live'
  state.deadline = started.deadline
  setStatus('live', '')
  tickTimer()
  state.term.focus()
}

async function mountTerminal() {
  const host = $('terminal')
  host.innerHTML = ''
  if (state.term) state.term.destroy()

  const term = new WTerm(host, { cols: 100, rows: 26, cursorBlink: true, autoResize: true })
  await term.init()
  state.term = term

  const shell = new TermShell({
    exec: execCommand,
    onCommand: reportAndAutoValidate,
    prompt: () =>
      `\x1b[38;5;209m➜\x1b[0m \x1b[36mrepo\x1b[0m \x1b[38;5;245mgit:(\x1b[0m\x1b[31m${state.branch}\x1b[38;5;245m)\x1b[0m `,
    greeting: [
      `\x1b[38;5;209msharpen arena\x1b[0m · ${state.challenge.title}`,
      `\x1b[38;5;245mThe repo is real. The clock is not your friend. Every Enter validates.\x1b[0m`,
      '',
    ],
    onSubmit: submit,
    tabCandidates,
  })
  state.shell = shell
  term.onData = (data) => shell.handleInput(data)
  shell.attach((data) => term.write(data))
}

async function tabCandidates(word, isFirst) {
  const fs = state.arena.jbFs
  const cwd = state.arena.cwd
  let dir = cwd
  let prefix = word
  if (word.includes('/')) {
    const cut = word.lastIndexOf('/')
    const rawDir = word.slice(0, cut + 1)
    prefix = word.slice(cut + 1)
    dir = rawDir.startsWith('/') ? rawDir : `${cwd}/${rawDir}`
  }
  let names = []
  try {
    names = (await fs.readdir(dir)).filter((n) => n.startsWith(prefix))
  } catch {
    names = []
  }
  const base = word.includes('/') ? word.slice(0, word.lastIndexOf('/') + 1) : ''
  const out = []
  for (const n of names) {
    let suffix = ''
    try {
      if ((await fs.stat(`${dir}/${n}`)).isDirectory) suffix = '/'
    } catch {
      /* keep plain */
    }
    out.push(base + n + suffix)
  }
  if (isFirst && !word.includes('/')) out.push(...COMMANDS.filter((c) => c.startsWith(word)))
  return out
}

async function execCommand(command) {
  const result = await state.arena.exec(command)
  state.branch = (await state.arena.git.currentBranch({
    fs: state.arena.gitFs,
    dir: state.arena.dir,
    fullname: false,
  }).catch(() => null)) ?? 'HEAD'
  return result
}

// Runs AFTER the shell has flushed the command's output, so arena messages
// land below it in the terminal, in natural reading order.
async function reportAndAutoValidate(command, result) {
  // The mentor's creator tried to greet it right here in the shell, so this
  // tip is not optional: humans WILL talk to the terminal.
  if (result.stderr.includes('command not found') && !state.cmdTipShown) {
    state.cmdTipShown = true
    state.term.write(
      '\x1b[38;5;245mThat is the shell, not the mentor. Ask the mentor in the side panel; ' +
        'every Enter validates your repo state.\x1b[0m\r\n'
    )
  }
  if (state.status !== 'live') return
  await fetch(`/api/runs/${state.runId}/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command, output: (result.stdout + result.stderr).slice(0, 2000) }),
  }).catch(() => {})
  // Core mechanic: EVERY Enter validates. The command ran; now the arena
  // judges the resulting state and the mentor reacts to it.
  await submit({ quiet: true })
}

// Called in-flow (every Enter: after a command, or on an empty line): the
// shell prints the next prompt right after we return, so plain writes suffice.
// quiet = after-command validation; the terminal line stays compact.
async function submit({ quiet = false } = {}) {
  if (state.status === 'revealed') {
    if (!quiet) state.term.write('\x1b[33mTime is up. The mentor is teaching. You can keep experimenting.\x1b[0m\r\n')
    return
  }
  if (state.status === 'passed') {
    if (!quiet) state.term.write('\x1b[38;5;245mAlready solved. Ask the mentor in the side panel, or go back for the next challenge.\x1b[0m\r\n')
    return
  }
  if (state.status !== 'live') return
  const res = await fetch(`/api/runs/${state.runId}/submit`, { method: 'POST' })
  if (!res.ok) return
  const verdict = await res.json()
  renderChecks(verdict.checks)
  if (verdict.pass) {
    state.status = 'passed'
    setStatus('solved', 'pass')
    $('timer').classList.add('done')
    $('timer').classList.remove('danger')
    $('mentor-input').placeholder = 'Ask the mentor anything…'
    state.term.write('\x1b[32m✓ Challenge solved. The arena validated your repo state.\x1b[0m\r\n')
  } else {
    setStatus('not yet', 'fail')
    const failing = verdict.checks.filter((c) => !c.pass).length
    state.term.write(
      quiet
        ? `\x1b[38;5;245m✗ not yet: ${verdict.checks.length - failing}/${verdict.checks.length} checks green\x1b[0m\r\n`
        : '\x1b[31m✗ Not yet. Check the verdict panel. The mentor has a hint.\x1b[0m\r\n'
    )
  }
}

function renderChecks(checks) {
  $('checks').innerHTML = checks
    .map(
      (c) =>
        `<li class="${c.pass ? 'pass' : 'fail'}">${c.name}<span class="detail">${c.detail}</span></li>`
    )
    .join('')
}

// ---------- SSE -------------------------------------------------------------

function connectEvents() {
  if (state.events) state.events.close()
  const events = new EventSource(`/api/runs/${state.runId}/events`)
  state.events = events

  // Runs live in server memory: if the server restarts mid-run, the run is
  // gone. Detect it instead of leaving the player in a dead page.
  events.onerror = async () => {
    if (state.status === 'idle') return
    try {
      const res = await fetch(`/api/runs/${state.runId}`)
      if (res.status === 404) runLost()
    } catch {
      /* transient network blip: EventSource will retry */
    }
  }

  events.addEventListener('verdict', (e) => {
    const data = JSON.parse(e.data)
    renderChecks(data.checks)
  })
  events.addEventListener('timeout', async () => {
    state.status = 'revealed'
    setStatus('time out', 'fail')
    setTimer(0, 0)
    $('mentor-input').placeholder = 'Ask the mentor anything…'
    state.shell.writeSystemLine('\x1b[33m⏱ 60 seconds are gone. Mentor incoming, and you can keep typing.\x1b[0m')
    await fetch(`/api/runs/${state.runId}/expire`, { method: 'POST' }).catch(() => {})
  })
  events.addEventListener('mentor-thinking', () => {
    $('mentor-dot').classList.add('live')
    if (!$('mentor-feed').querySelector('.thinking')) {
      const p = document.createElement('p')
      p.className = 'msg thinking'
      p.textContent = 'thinking…'
      $('mentor-feed').querySelector('.mentor-idle')?.remove()
      $('mentor-feed').appendChild(p)
      $('mentor-feed').scrollTop = $('mentor-feed').scrollHeight
    }
  })
  events.addEventListener('mentor-delta', (e) => {
    const { text } = JSON.parse(e.data)
    mentorAppend(text)
  })
  events.addEventListener('mentor-done', () => {
    state.mentorMsg = null
    $('mentor-dot').classList.remove('live')
  })
  events.addEventListener('mentor-error', (e) => {
    const { detail } = JSON.parse(e.data)
    const feed = $('mentor-feed')
    const p = document.createElement('p')
    p.className = 'msg system'
    p.textContent = detail
    feed.appendChild(p)
    $('mentor-dot').classList.remove('live')
  })
  events.addEventListener('leaderboard-updated', refreshLeaderboard)
}

function runLost() {
  if (state.status === 'idle') return
  state.status = 'idle'
  state.events?.close()
  cancelAnimationFrame(state.timerRaf)
  state.term?.write('\r\n\x1b[33mThe arena server restarted and this run is gone. Taking you back to the challenges…\x1b[0m\r\n')
  setTimeout(() => {
    $('screen-run').classList.add('hidden')
    $('screen-select').classList.remove('hidden')
    refreshLeaderboard()
  }, 2200)
}

function mentorSystem(text) {
  const feed = $('mentor-feed')
  feed.querySelector('.mentor-idle')?.remove()
  const p = document.createElement('p')
  p.className = 'msg system'
  p.textContent = text
  feed.appendChild(p)
  feed.scrollTop = feed.scrollHeight
}

function mentorAppend(text) {
  const feed = $('mentor-feed')
  feed.querySelector('.mentor-idle')?.remove()
  feed.querySelector('.thinking')?.remove()
  if (!state.mentorMsg) {
    state.mentorMsg = document.createElement('p')
    state.mentorMsg.className = 'msg'
    feed.appendChild(state.mentorMsg)
    $('mentor-dot').classList.add('live')
  }
  state.mentorMsg.textContent += text
  feed.scrollTop = feed.scrollHeight
}

// ---------- timer -----------------------------------------------------------

function setStatus(text, cls) {
  const el = $('run-status')
  el.textContent = text
  el.className = 'run-status' + (cls ? ` ${cls}` : '')
}

function setTimer(seconds, fraction) {
  $('timer-num').textContent = String(Math.max(0, Math.ceil(seconds)))
  $('timer-arc').style.strokeDashoffset = String(RING * (1 - fraction))
}

function tickTimer() {
  cancelAnimationFrame(state.timerRaf)
  const total = state.challenge.timeLimitMs
  const step = () => {
    if (state.status === 'passed') return
    const left = Math.max(0, state.deadline - Date.now())
    setTimer(left / 1000, left / total)
    $('timer').classList.toggle('danger', left > 0 && left < 10_000 && state.status === 'live')
    if (left > 0 && (state.status === 'live' || state.status === 'idle')) {
      state.timerRaf = requestAnimationFrame(step)
    }
  }
  step()
}

async function countdown() {
  const overlay = $('countdown')
  const num = $('countdown-num')
  overlay.classList.remove('hidden')
  for (const n of ['3', '2', '1']) {
    num.textContent = n
    num.style.animation = 'none'
    void num.offsetWidth // restart the drop animation
    num.style.animation = ''
    await new Promise((r) => setTimeout(r, 550))
  }
  overlay.classList.add('hidden')
}

// ---------- mentor chat + navigation ----------------------------------------

$('mentor-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const input = $('mentor-input')
  const question = input.value.trim()
  if (!question) return
  input.value = ''
  const feed = $('mentor-feed')
  const p = document.createElement('p')
  p.className = 'msg you'
  p.textContent = `you: ${question}`
  feed.appendChild(p)
  feed.scrollTop = feed.scrollHeight
  const res = await fetch(`/api/runs/${state.runId}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  if (res.ok || res.status === 429) {
    const { accepted } = await res.json().catch(() => ({ accepted: false }))
    if (accepted) $('mentor-dot').classList.add('live')
    else mentorSystem('The mentor cannot take that question right now (turn budget reached).')
  }
})

$('btn-back').addEventListener('click', () => {
  if (state.events) state.events.close()
  cancelAnimationFrame(state.timerRaf)
  state.status = 'idle'
  $('screen-run').classList.add('hidden')
  $('screen-select').classList.remove('hidden')
  refreshLeaderboard()
})

boot()
