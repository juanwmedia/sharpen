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
and opens the arena in your browser.

## Requirements

- Node.js 20+
- Claude Code installed and authenticated (the mentor runs as a headless
  `claude -p --model sonnet` process on your machine, using your account)
- `gh` CLI (only for the shared ranking, coming in v2)

## How it works

```
Browser (SPA)                        Local server (Node)
┌───────────────────────┐   POST    ┌─────────────────────────────────┐
│ challenge + 60s timer │ ────────► │ authoritative timer + replay    │
│ terminal: just-bash   │           │ validation with the same engine │
│ + isomorphic-git      │ ◄──────── │ spawns claude -p (mentor turn)  │
│ mentor panel          │    SSE    │ evidence + leaderboard JSON     │
└───────────────────────┘           └─────────────────────────────────┘
```

- **The repo is real.** isomorphic-git over a virtual filesystem shared with a
  simulated bash (just-bash): pipes, grep, redirections all work. A hand-written
  porcelain layer makes `git status`, `git clean`, `git restore` and friends
  behave and print like real git, including its refusals.
- **State is what counts.** Validation asserts on the final repo state (refs,
  index, working tree), never on what you typed. Any correct solution passes,
  `git clean -fd` and `rm -rf junk/` alike.
- **The verdict is instant and deterministic.** Pressing Enter on an empty
  prompt (or fixing the repo) triggers a server-side replay of your transcript
  with the same engine. The mentor only does pedagogy, never grading.
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

```
npm install
npm run build     # bundle the SPA (esbuild)
npm test          # vitest: porcelain + challenge verdicts
npm run dev       # start the server on http://127.0.0.1:4517
```

Read `docs/api-notes.md` before touching engine code: it records the verified
API contracts (just-bash, isomorphic-git, wterm, claude CLI) this project is
built against.

## Roadmap

- **v1 (now):** local arena, git pack with the first challenge, local ranking.
- **v2:** shared ranking. Submissions via GitHub Issues (identity signed by
  GitHub), CI Action replays every transcript with the same engine and
  regenerates the leaderboard; only verified entries count.
- **v3:** nonce-seeded challenges plus GitHub server timestamps, making claimed
  times attack-resistant. More packs: TypeScript (Monaco editor), Unix 101. A
  challenge declares its artifact; the arena does not change.
