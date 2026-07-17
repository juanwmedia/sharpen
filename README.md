<p align="center">
  <a href="https://frontendleap.com"><img src="public/brand/mark.svg" width="72" alt="FrontendLeap logo" /></a>
</p>

<h1 align="center">sharpen</h1>

<p align="center">
  Timed Git challenges in your browser, with a Socratic AI mentor.<br />
  A Claude Code plugin by <a href="https://frontendleap.com">FrontendLeap</a>.
</p>

## Install

```
/plugin marketplace add juanwmedia/sharpen
/plugin install sharpen@sharpen
```

Then run `/sharpen` in any Claude Code session. The first boot downloads the
prebuilt arena for your plugin version (a few MB, seconds; it builds from
source only if the download is not possible); after that it just starts a
local server and opens the arena in your browser. Stop it anytime with
`/sharpen stop`.
Each scenario has its own URL (`/git/clean-sweep`), so you can deep-link
straight into a run.

## Requirements

- Node.js 20+
- Claude Code installed and authenticated (the mentor runs as a headless
  `claude -p` process on your machine, using your account; model defaults to
  `sonnet`, override with `SHARPEN_MENTOR_MODEL=haiku`)
- `gh` CLI (only for the shared ranking, coming in v2)

## The core loop

Every scenario is the same ritual, and the ritual is the product:

1. **Read the briefing.** A real situation, the file tree it left behind, and
   one objective. The check rubric is on the table before you start, so you
   always know what "solved" means.
2. **Press Start and type real git.** The repo is real and runs entirely in
   your browser: `git status` tells you the truth, pipes and `rm -rf` work,
   and wrong moves have consequences.
3. **Every Enter validates.** Each command you run makes the server replay
   your whole transcript with the same engine and re-judge the final state of
   the repo. The verdict panel flips check by check as you close in.
4. **The mentor watches, Socratically.** Stuck? Ask. Fail a check? It nudges.
   While you are live it answers with questions and concepts, never with the
   solving command. You do the thinking; that is the whole pedagogy.
5. **Solve it, or learn it.** Pass and your speed becomes your score. Run out
   of clock and the mentor drops the guardrail and teaches the canonical
   walkthrough properly. Either way you leave knowing more git than you came
   with.

Two ways to play, one switch in the top bar:

- **Challenge:** 60 seconds against the clock, your speed is your score. The
  adrenaline mode. (Attempts are recorded locally; the shared ranking arrives
  in v2.)
- **Learn:** no clock, no ranking. Progress persists between sessions and you
  decide when to reveal the solution. The mastery mode.

## Languages

The arena speaks English and Spanish: switch with the EN/ES toggle in the top
bar (persisted locally, English by default). The mentor answers in your
language too. Scenario content (briefing, objective, and verdict checks) is
written in both languages by the scenario author and the type system enforces
it; the ASCII tree and titles/URL slugs stay in English, and the emulated git
speaks English like the real one.

## Under the hood

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
npm run release    # gate, bundle, smoke-test and publish a GitHub Release
```

Releases are prebuilt artifacts: `npm run release` refuses a dirty tree,
failing gates or an existing tag, bundles the server into a single
`server.mjs`, boots that bundle and solves a scenario through the API, and
only then publishes `sharpen-v<version>.tar.gz` (plus checksum) to a GitHub
Release. The launch skill downloads exactly the artifact matching the
installed plugin version.

To add a scenario: create a package folder `scenarios/<pack>/<name>/` with
`scenario.md` (schema 2 frontmatter + bilingual sections), `scenario.yaml`
(declarative setup steps, check predicates and the canonical solution) and
`walkthrough.md`, then register it in `scenarios/index.ts`. Scenarios are
documents, not code: the engine interprets and validates them. See
`scenarios/package/FORMAT.md`. Its URL becomes `/<pack>/<slug-of-title>`.

Architecture, contracts and conventions live in `CLAUDE.md`. Verified
third-party API facts (just-bash, isomorphic-git, wterm, claude CLI, vue-i18n)
live in `docs/api-notes.md`: read them before touching engine code.

## Roadmap

- **v1 (now):** local arena, git pack with the first scenario, local ranking.
- **v2:** shared ranking. Submissions via GitHub Issues (identity signed by
  GitHub), CI Action replays every transcript with the same engine and
  regenerates the leaderboard; only verified entries count.
- **v3:** nonce-seeded scenarios plus GitHub server timestamps, making claimed
  times attack-resistant. More packs: TypeScript (Monaco editor), Unix 101. A
  challenge declares its artifact; the arena does not change.
