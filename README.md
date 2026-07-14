# sharpen

Timed Git challenges in your browser, with a Socratic AI mentor. A Claude Code
plugin.

You get 60 seconds, a real Git repository running entirely in your browser, and
a mentor who watches every command. Fail a validation and the mentor nudges you
with a question, never the answer. Run out of time and it teaches you the
solution properly. Solve it and you climb the leaderboard.

## Install

```
/plugin marketplace add juanwmedia/sharpen
/plugin install sharpen@sharpen
```

Then run `/sharpen` in any Claude Code session. The skill starts a local server
and opens the arena in your browser. Each challenge has its own URL
(`/challenge/clean-sweep`), so you can deep-link straight into a run.

## Requirements

- Node.js 20+
- Claude Code installed and authenticated (the mentor runs as a headless
  `claude -p` process on your machine, using your account; model defaults to
  `sonnet`, override with `SHARPEN_MENTOR_MODEL=haiku`)
- `gh` CLI (only for the shared ranking, coming in v2)

## Languages

The arena speaks English and Spanish: switch with the EN/ES toggle in the top
bar (persisted locally, English by default). The mentor answers in your
language too. Challenge content (statement and verdict checks) is written in
both languages by the challenge author and the type system enforces it; titles
and URL slugs stay in English, and the emulated git speaks English like the
real one.

## How it works

```
Browser (SPA)                        Local server (Node)
┌───────────────────────┐   POST    ┌─────────────────────────────────┐
│ challenge + 60s timer │ ────────► │ authoritative timer + replay    │
│ terminal: just-bash   │           │ validation with the same engine │
│ + isomorphic-git      │ ◄──────── │ spawns claude -p (mentor turn)  │
│ mentor conversation   │    SSE    │ evidence + leaderboard JSON     │
└───────────────────────┘           └─────────────────────────────────┘
```

- **The repo is real.** isomorphic-git over a virtual filesystem shared with a
  simulated bash (just-bash): pipes, grep, redirections all work. A hand-written
  porcelain layer makes `git status`, `git clean`, `git restore` and friends
  behave and print like real git, including its refusals.
- **State is what counts.** Validation asserts on the final repo state (refs,
  index, working tree), never on what you typed. Any correct solution passes,
  `git clean -fd` and `rm -rf junk/` alike.
- **Every Enter validates.** Each command (or an empty Enter) triggers a
  server-side replay of your transcript with the same engine, and the mentor
  reacts to what actually happened. The mentor only does pedagogy, never
  grading.
- **Everything is evidence.** Each run records its transcript, engine version,
  duration and a state hash to `~/.sharpen/evidence/`. That package is exactly
  what CI replay validation will verify for the shared ranking (v2), with
  GitHub Issues as the submission channel and GitHub's own clock closing the
  timing hole (v3).

## Scoring (v1)

Pass: `max(10, 100 - seconds elapsed)`. Timeout or fail: 0, but the attempt is
recorded. Every Enter validates (that is the core mechanic), so speed is the
only score input. The policy is versioned with the engine; it will not change
silently under a live ranking.

## Development

Stack: Vue 3 + TypeScript (strict) + Vite + Tailwind 4 + vue-i18n + vue-router
for the arena SPA, organized as Feature-Sliced Design under `src/`. The engine
and the Node server are plain TypeScript (run via tsx). The engine stays
framework-agnostic on purpose: it runs in the browser, in the server's replay
validation, and in v2's CI Action.

```
npm install
npm run dev        # Vite dev server with HMR (proxies /api to :4517)
npm run start      # the arena server on http://127.0.0.1:4517
npm run build      # typecheck (vue-tsc) + production build to dist/
npm test           # vitest: porcelain, verdicts, fs bridge, mentor queue, API, i18n, slugs
npm run typecheck  # vue-tsc --noEmit
```

To add a challenge: create `challenges/<pack>/<name>.ts` exporting an object
that `satisfies Challenge` (deterministic `setup`, state-based `assert`,
bilingual `statement` and check texts), then register it in
`challenges/index.ts`. Its URL becomes `/challenge/<slug-of-title>`.

Architecture, contracts and conventions live in `CLAUDE.md`. Verified
third-party API facts (just-bash, isomorphic-git, wterm, claude CLI, vue-i18n)
live in `docs/api-notes.md`: read them before touching engine code.

## Roadmap

- **v1 (now):** local arena, git pack with the first challenge, local ranking.
- **v2:** shared ranking. Submissions via GitHub Issues (identity signed by
  GitHub), CI Action replays every transcript with the same engine and
  regenerates the leaderboard; only verified entries count.
- **v3:** nonce-seeded challenges plus GitHub server timestamps, making claimed
  times attack-resistant. More packs: TypeScript (Monaco editor), Unix 101. A
  challenge declares its artifact; the arena does not change.
