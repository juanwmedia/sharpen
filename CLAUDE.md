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
  types.ts    THE shared contract: Challenge, Check, Evidence, Locale,
              Localized, ARENA_EVENT, MENTOR_ERROR_KIND, ARENA_DEFAULT_BRANCH.
  arena.ts    createArena(challenge): InMemoryFs + git init + setup + bash
              with our porcelain. Fixed clock (BASE_TIMESTAMP + tick).
  porcelain/  Hand-written `git` subcommands over isomorphic-git.
  fs-bridge.ts just-bash IFileSystem -> isomorphic-git PromiseFsClient.
server/       Express + SSE. Authoritative timer, transcript replay,
              evidence + leaderboard (~/.sharpen/), mentor process spawner.
challenges/   Registry (index.ts) + one file per challenge + slug.ts.
src/          Vue 3 SPA, Feature-Sliced Design (see below).
test/         Vitest. Run with `npm test`.
skills/       The Claude Code plugin skill that boots the arena.
```

## Non-negotiable contracts

- **Determinism.** Same transcript must produce the same OIDs and stateHash
  everywhere, forever: fixed clock, fixed author, no `Date.now()` or
  randomness anywhere in engine or challenge setup/assert paths. Server-side
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
  replays and re-scores these files.
- **Mentor.** One `Mentor` per run; each turn spawns
  `claude -p --model $SHARPEN_MENTOR_MODEL --tools ""` (default sonnet),
  prompt via stdin, `--session-id`/`--resume` for memory. Queue: MAX_TURNS 8,
  MAX_QUEUE 3, hints coalesce. Socratic guardrail lives in the prompts: while
  LIVE it never names the solving command; after timeout it reveals and
  teaches. Tests set `SHARPEN_NO_MENTOR=1` and inject `spawnFn`.

## i18n rules

- UI chrome strings live in `src/shared/i18n/locales/{en,es}.ts`. Never
  hardcode player-facing text in components or the store; add a key to BOTH
  files. `test/i18n.test.ts` enforces key parity, interpolation parity, and
  real compilation of every message.
- intlify treats bare `@` and `|` inside messages as syntax and the failure
  is a RUNTIME SyntaxError that unmounts the component subtree. Escape as
  `{'@'}` / `{'|'}`.
- Challenge content (statement, check name/detail) is bilingual by contract:
  `Localized = Record<Locale, string>`, the author writes every language and
  TypeScript enforces completeness. English is canonical: mentor prompts and
  evidence always use `.en`. The web picks with `lt()` from `@/shared/i18n`.
- Titles and slugs stay English. The mentor answers in the run's locale via
  `LANGUAGE_RULES` in `server/mentor.ts` (locale travels in POST /api/runs).

## Frontend conventions (src/)

- FSD layers, import direction only downward:
  `app > pages > widgets > features > entities > shared` (plus `@engine` /
  `@challenges` aliases to the repo root). Every slice exposes an `index.ts`
  public API; import through it, not into slice internals.
- Game state is the singleton store `src/entities/game/model/store.ts`
  (`useGame()`). Non-reactive engine handles (arena, EventSource, terminal
  writer) stay module-level; the Challenge object is `markRaw`ed. Navigation
  belongs to vue-router (`/challenge/:slug`, slug from `challenges/slug.ts`,
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
- Terminal geometry is fixed (`TERMINAL_COLS`/`TERMINAL_ROWS`, autoResize
  false): 20 rows exactly fill the frame so a fresh terminal shows no
  scrollbar. ANSI codes come from `@/shared/lib/ansi.ts`.

## Adding a challenge

1. Create `challenges/<pack>/<name>.ts`, default-export an object that
   `satisfies Challenge`.
2. `setup(env)`: build the repo with the env helpers (write/add/commit/
   branch/checkout). It must be deterministic; the fixed clock and author
   come from the arena.
3. `assert(ctx)`: pure state checks over `ctx.snapshot` (plus `ctx.fs` for
   file contents). Each check carries bilingual `name` and `detail`.
4. `statement` bilingual; `walkthrough` English only (mentor source of truth
   for the reveal); `themes` for soft UI concept chips (not solving commands).
5. Register it in `challenges/index.ts`. The URL becomes
   `/<pack>/<slugify(title)>`; `test/slug.test.ts` guards collisions.
6. If it needs a git subcommand the porcelain lacks, extend
   `engine/porcelain/git-command.ts` with faithful output and add cases to
   `test/porcelain.test.ts`.

## Workflow

- Gate before declaring anything done: `npm test` (all green), `npm run
  typecheck`, `npm run build`. Then the dash gate must come back empty:
  `grep -rnP "\x{2014}|\x{2013}" <changed files>` (that is U+2014 em dash and
  U+2013 en dash; on macOS grep use `perl -ne` or plain grep with the literal
  characters). No em or en dashes anywhere: code, docs or UI copy.
- The server serves `dist/`, so UI changes need `npm run build`. Restarting
  the server kills in-memory runs: say so before doing it. `SHARPEN_PORT`
  and `SHARPEN_DATA_DIR` override defaults (tests use a temp data dir).
- Browser verification happens in isolated contexts (chrome-devtools
  `isolatedContext`), never in the user's tab. If a verification run records
  a result, remove its entry from `~/.sharpen/leaderboard.json` and its file
  in `~/.sharpen/evidence/` afterwards; abandoned runs that merely time out
  with no client attached record nothing.
- Everything in the repo is English: code, comments, commits, docs. Comments
  explain why, not how. Never add AI attribution to commits.
