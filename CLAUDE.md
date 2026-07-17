# sharpen: agent guide

Timed Git challenges in the browser with a Socratic mentor. Core mechanic:
EVERY Enter validates. The player's command runs locally, the server replays
the whole transcript with the same engine and returns the authoritative
verdict, and the mentor reacts to what actually happened.

Read `docs/api-notes.md` BEFORE touching engine code: it records verified API
facts (just-bash, isomorphic-git, wterm, claude CLI, vue-i18n) that override
anything you remember about those libraries.

## Map

```
engine/       Deterministic git arena. Framework-agnostic: runs in the
              browser, in server replay, and (v2) in a CI Action.
  types.ts    THE shared contract: Scenario, Check, Evidence, Locale,
              Localized, ARENA_EVENT, MENTOR_ERROR_KIND, ARENA_DEFAULT_BRANCH.
  arena.ts    createArena(scenario): InMemoryFs + git init + setup + bash
              with our porcelain. Fixed clock (BASE_TIMESTAMP + tick).
  porcelain/  Hand-written `git` subcommands over isomorphic-git.
  fs-bridge.ts just-bash IFileSystem -> isomorphic-git PromiseFsClient.
server/       Express + SSE. Authoritative timer, transcript replay,
              evidence + leaderboard (~/.sharpen/), mentor process spawner.
scenarios/    Registry + schema-2 document packages (package/FORMAT.md) + slug.ts.
src/          Vue 3 SPA, Feature-Sliced Design (see below).
test/         Vitest. Run with `npm test`.
skills/       The Claude Code plugin skill that boots the arena.
```

## Non-negotiable contracts

- **Determinism.** Same transcript must produce the same OIDs and stateHash
  everywhere, forever: fixed clock, fixed author, no `Date.now()` or
  randomness anywhere in engine or scenario setup/assert paths. Server-side
  replay is the only authority; the browser verdict is a preview.
- **State-based validation.** `assert` inspects the snapshot (refs, index,
  working tree), NEVER the typed commands. Any correct solution must pass.
- **Faithful porcelain.** Implemented: status, add, commit, log, branch,
  checkout, switch, restore, clean, rm. Output and refusals mirror real git
  (e.g. `clean` without `-f` refuses exactly like git). Unimplemented
  subcommands answer `sharpen: 'git X' is not available in this arena (yet)`.
  Porcelain output is NEVER translated: git speaks English.
- **Evidence.** Schema v1 in `engine/types.ts`; files in
  `~/.sharpen/evidence/`. Scoring: `max(10, 100 - seconds)`, fail/timeout 0.
  Do not change evidence shape or scoring casually: v2's shared ranking
  replays and re-scores these files. The leaderboard has NO UI since 2026-07
  (v2 rebuilds ranking on FrontendLeap): the server still records
  `~/.sharpen/leaderboard.json`, serves GET /api/leaderboard and emits
  `leaderboard-updated`, but no client consumes them. Persisted keys are FROZEN across the
  Challenge -> Scenario rename: evidence, leaderboard entries and learn
  snapshots keep `challengeId` on disk. `scenarioVersion` is additive
  (2026-07): older files lack it, readers must tolerate that.
- **Mentor.** One `Mentor` per run; each turn spawns
  `claude -p --model $SHARPEN_MENTOR_MODEL --tools ""` (default sonnet),
  prompt via stdin, `--session-id`/`--resume` for memory. NO turn budget, in
  any mode, by design: the mentor runs on the player's own subscription.
  Queue: MAX_QUEUE 3, hints coalesce, queued prompts are BUILDERS resolved at
  drain time (live board/clock), and the bubble kind travels with each turn.
  Socratic guardrail lives in the prompts: while
  LIVE it never names the solving command; after timeout it reveals and
  teaches. Tests set `SHARPEN_NO_MENTOR=1` and inject `spawnFn`.
- **Nudge gate.** A failed validation only asks the mentor when the Enter
  left a trace: `verdict.stateHash` delta, a check flip, or a command error
  (`server/nudge.ts`; baseline seeded on start). Empty Enters and read-only
  commands (ls, git status...) stay silent BY STATE, never by parsing the
  typed command. Both signals are player-switchable (MentorNudges panel in
  the arena sidebar, localStorage-persisted, default ON; prefs travel in the
  submit body, absent body = both on). The signals are ENGINE-DEFINED: every
  future engine must say what "state moved" and "your attempt errored" mean
  for its artifact (TS: diagnostics; SQL: query errors). For bash/git, error
  means any command that exited nonzero, typos included: with the switches
  in the player's hands, no hidden filtering on top of them (a toggle that
  says "speaks on errors" must speak on every error). Chat, pass, reveal
  and timeout turns are ungated. The error flag in POST /command is UX
  signal only: it must never feed scoring or evidence. The submit response
  carries `nudged` and the web
  paints the command bubble in the conversation only when it is true: one
  decision drives both the mentor and the chat narrative.

## i18n rules

- UI chrome strings live in `src/shared/i18n/locales/{en,es}.ts`. Never
  hardcode player-facing text in components or the store; add a key to BOTH
  files. `test/i18n.test.ts` enforces key parity, interpolation parity, and
  real compilation of every message.
- intlify treats bare `@` and `|` inside messages as syntax and the failure
  is a RUNTIME SyntaxError that unmounts the component subtree. Escape as
  `{'@'}` / `{'|'}`.
- Scenario content (briefing, objective, check name/detail) is bilingual by contract:
  `Localized = Record<Locale, string>`, the author writes every language and
  TypeScript enforces completeness. English is canonical: mentor prompts and
  evidence always use `.en`. The web picks with `lt()` from `@/shared/i18n`.
- Titles and slugs stay English. The mentor answers in the run's locale via
  `LANGUAGE_RULES` in `server/mentor.ts` (locale travels in POST /api/runs).

## Frontend conventions (src/)

- FSD layers, import direction only downward:
  `app > pages > widgets > features > entities > shared` (plus `@engine` /
  `@scenarios` aliases to the repo root). Every slice exposes an `index.ts`
  public API; import through it, not into slice internals.
- Game state is the singleton store `src/entities/game/model/store.ts`
  (`useGame()`). Non-reactive engine handles (arena, EventSource, terminal
  writer) stay module-level; the Scenario object is `markRaw`ed. Navigation
  belongs to vue-router (`/challenge/:slug`, slug from `scenarios/slug.ts`,
  SPA fallback in `server/app.ts`); the store signals via registered
  handlers, it never imports the router.
- No hardcoded repeated strings: statuses, bubble roles, SSE event names and
  mentor error kinds are `as const` objects with derived union types
  (protocol-level ones in `engine/types.ts`, client-only ones in
  `src/entities/game/model/types.ts`). Tuning numbers live in
  `src/shared/config`. API paths in `src/shared/api`.
- Tailwind 4, CSS-first: every color/font/radius/animation is a token in
  `@theme` (`src/app/styles/main.css`). No new hex values or ad-hoc fonts in
  components; use the token utilities (`bg-surface`, `text-muted`,
  `rounded-panel`, `animate-*`). Plain CSS is allowed only in the components
  layer for third-party DOM (wterm) and the shared `.panel` surface.
- Brand: **Sharpen by FrontendLeap** (frontendleap.com). The accent
  (`--color-accent`) is FrontendLeap sky blue. The FL mark (three concentric
  circles) has ONE source: `public/brand/mark.svg`, referenced by the topbar
  byline (`App.vue`), the favicon (`index.html`) and the README logo; source
  assets live in the fl-next repo. The topbar byline links to
  `FRONTENDLEAP_URL` from `src/shared/config`. Playing never requires a
  FrontendLeap account: the platform is brand and (v2) optional global
  ranking, never a gate.
- Terminal geometry is fixed (`TERMINAL_COLS`/`TERMINAL_ROWS`, autoResize
  false): 20 rows exactly fill the frame so a fresh terminal shows no
  scrollbar. ANSI codes come from `@/shared/lib/ansi.ts`.

## Adding a scenario

Scenarios are **documents, not code** (folder + schema 2). **Source of truth
for authors and agents:** `scenarios/package/FORMAT.md` (layout, envelope vs
vocabulary, boilerplate, checklist). Canonical example:
`scenarios/git/clean-sweep/`.

1. Copy `scenarios/git/clean-sweep/` to `scenarios/<pack>/<name>/` and edit
   `scenario.md`, `scenario.yaml`, `walkthrough.md` (keep `index.ts`).
2. `scenario.yaml` declares setup as steps (ops mirror ScenarioSetupEnv:
   write/remove/add/commit/branch/checkout), checks as predicates
   (untracked/staged/head/file) and `solution.commands` (canonical solving
   commands, never shown to the player). The engine interprets the document:
   deterministic by construction, and the interpreter IS the validator
   (unknown vocabulary fails to load naming what is missing).
3. Checks carry only a bilingual `name`; the pass/fail detail is rendered by
   the engine per predicate, in every language, consistently. State-based
   only: predicates see the snapshot, never the transcript.
4. Copy lives in `scenario.md` (bilingual Briefing/Objective sections,
   `version` integer, `spec.tree` for git); `walkthrough.md` is English only
   (mentor reveal); `themes` are soft UI concept chips (not solving commands).
   Published `version` is immutable: bump it on ANY change; evidence records
   `scenarioVersion`.
5. Register it in `scenarios/index.ts`. The URL becomes
   `/<pack>/<slugify(title)>`; `test/slug.test.ts` guards collisions and
   `test/scenario-dryrun.test.ts` proves solvability (fresh arena must not
   pass; the solution must turn every check green).
6. If it needs a git subcommand the porcelain lacks, extend
   `engine/porcelain/git-command.ts` with faithful output and add cases to
   `test/porcelain.test.ts`. If it needs a new setup op or predicate, extend
   `scenarios/package/kinds/git.ts` (parser + interpreter + details).

## Workflow

- Gate before declaring anything done: `npm test` (all green), `npm run
  typecheck`, `npm run build`. Then the dash gate must come back empty:
  `grep -rnP "\x{2014}|\x{2013}" <changed files>` (that is U+2014 em dash and
  U+2013 en dash; on macOS grep use `perl -ne` or plain grep with the literal
  characters). No em or en dashes anywhere: code, docs or UI copy.
- The server serves `dist/`, so UI changes need `npm run build`. Restarting
  the server kills in-memory runs: say so before doing it. `SHARPEN_PORT`
  and `SHARPEN_DATA_DIR` override defaults (tests use a temp data dir).
- Every release bumps `version` in `.claude-plugin/plugin.json` (keep
  `package.json` in sync): `/plugin update` only refreshes installed copies
  when the version changes. Releasing IS publishing an artifact:
  `npm run release` (scripts/release.mjs) refuses a dirty tree, failing
  gates, an existing tag or an unpushed HEAD; bundles the server with
  esbuild into a single `server.mjs`; smoke-boots that bundle and solves
  clean-sweep through the API; then publishes `sharpen-v<version>.tar.gz` +
  `.sha256` via `gh release create`. The artifact mirrors the repo layout
  (`package.json`, `server/server.mjs`, `dist/`) so path resolution needs no
  special cases (ENGINE_VERSION reads `../package.json` at runtime). The
  launch skill downloads the exact-version asset to
  `~/.sharpen/app/<version>` with checksum verification and falls back to
  building from source, so `dist/` stays out of git and `tsx` plus runtime
  deps stay in `dependencies`, never `devDependencies`. After each release,
  update `https://frontendleap.com/sharpen/version.json` (`{"latest": "x.y.z"}`,
  lives in the fl-next repo): the server checks it once per boot
  (`server/update-check.ts`, `SHARPEN_NO_UPDATE_CHECK=1` and VITEST skip it)
  and `/api/meta.updateAvailable` paints the update chip; the skill does the
  same check and suggests `/plugin update sharpen`.
- Browser verification happens in isolated contexts (chrome-devtools
  `isolatedContext`), never in the user's tab. If a verification run records
  a result, remove its entry from `~/.sharpen/leaderboard.json` and its file
  in `~/.sharpen/evidence/` afterwards; abandoned runs that merely time out
  with no client attached record nothing.
- Everything in the repo is English: code, comments, commits, docs. Comments
  explain why, not how. Never add AI attribution to commits.
