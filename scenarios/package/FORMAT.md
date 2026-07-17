# Scenario package format (schema 2)

A scenario is a **document, not code**: a folder of markdown prose plus one
declarative mechanics file. Nothing in a package executes; the engine
interprets it. That is what makes scenarios safe to distribute, automatic to
validate, and replayable in CI.

Canonical example: [`scenarios/git/clean-sweep/`](../git/clean-sweep/).
Copy that folder when adding a git scenario.

## Layout

```text
scenarios/<pack>/<name>/
  scenario.md       # YAML frontmatter (identity) + localized prose sections
  scenario.yaml     # mechanics: setup steps, check predicates, solution
  walkthrough.md    # English mentor reveal (body only)
  index.ts          # assembleScenario(...) + default export (boilerplate)
```

Register the package explicitly in [`scenarios/index.ts`](../index.ts)
(no filesystem scan). Display order = array order.

## File roles

| File | Role | Who reads it |
|------|------|----------------|
| `scenario.md` | Identity, version, themes, kind `spec`, briefing/objective | UI, picker summary, mentor `Goal:` (objective.en) |
| `scenario.yaml` | Setup steps, check predicates, canonical solution | Engine interpreter (browser arena + server replay + dry-run) |
| `walkthrough.md` | Canonical solution prose (English) | Mentor only, on reveal / timeout |
| `index.ts` | Wire the three sources through `assembleScenario` | Registry import |

## The two-layer contract

The **envelope** is engine-agnostic and stable: `schema`, `id`, `kind`,
`version`, prose sections, "setup is a list of tagged steps", "checks are
name + expect", "solution proves solvability". The **vocabulary** (which
steps, which predicates, what the solution looks like) belongs to each
`kind` and grows additively.

**The interpreter is the validator.** A document using an op or predicate
this engine does not know fails to load with an error naming exactly what is
missing (e.g. `unknown op "stash"; this engine supports: write, remove, add,
commit, branch, checkout`). That message is the capability boundary: no
`requires.engine` bookkeeping, the document IS its own requirements.

## scenario.md

```yaml
---
schema: 2
version: 1
id: git/clean-sweep
kind: git
pack: git
title: Clean sweep
difficulty: medium
timeLimitMs: 60000
themes: [working tree, untracked, tracked, staging]
spec:
  tree: |
    repo/
    └── ...
---

## Briefing (en)
...

## Briefing (es)
...

## Objective (en)
...

## Objective (es)
...
```

- `version` is a positive integer and published versions are **immutable**:
  any change to a distributed scenario bumps it. Evidence records
  `scenarioVersion`, so rankings know exactly what was played.
- Section headings must be exactly `## Briefing (locale)` /
  `## Objective (locale)` for every locale in `LOCALES` (`en`, `es`).
- For `kind: git`, `spec.tree` is the English ASCII snapshot shown in the UI.
  Keep it aligned with what `setup` actually creates. No em or en dashes.

## scenario.yaml (kind: git vocabulary)

```yaml
setup:
  - write: { path: a.txt, content: "hello\n" }   # or block scalars for code
  - add: [a.txt]
  - commit: 'feat: initial'
  - branch: feature            # or { name: feature, checkout: true }
  - checkout: main
  - remove: a.txt

checks:
  - name: { en: No untracked files remain, es: No queda nada sin seguimiento }
    expect: { untracked: none }
  - name: { en: Nothing staged, es: Nada en el stage }
    expect: { staged: none }
  - name: { en: History intact, es: Historial intacto }
    expect: { head: { branch: main, commits: 2 } }
  - name: { en: Edit survived, es: El cambio sobrevivió }
    expect:
      file: { path: a.txt, status: modified, contentEquals: "hello\n" }

solution:
  commands:
    - git clean -fd
```

- **Setup ops** mirror `ScenarioSetupEnv` one to one: `write`, `remove`,
  `add`, `commit`, `branch`, `checkout`. Deterministic by construction: a
  document cannot call `Date.now()`.
- **Check predicates**: `untracked: none`, `staged: none`,
  `head: { branch?, commits? }`, `file: { path, status?, contentEquals? }`.
  Authors write only the bilingual `name`; the pass/fail **detail is rendered
  by the engine** (both languages, consistent everywhere). Extending either
  vocabulary means implementing it in `kinds/git.ts` first.
- **YAML anchors** share content between setup and checks (write with
  `content: &name |` and assert with `contentEquals: *name`).
- **`solution.commands`** is the machine proof of solvability. The dry-run
  test (`test/scenario-dryrun.test.ts`) replays every registered scenario:
  fresh arena must NOT pass, then the solution runs, then every check must
  pass. A scenario that cannot prove itself does not ship. It is never shown
  to the player.

## walkthrough.md

Plain English body (no frontmatter). Spoiler for the mentor after reveal.
Describe the canonical approach and note that any state-correct solution passes.

## index.ts (boilerplate)

```ts
import { assembleScenario } from '../../package/assemble.ts'
import scenarioSrc from './scenario.md'
import mechanicsSrc from './scenario.yaml'
import walkthroughSrc from './walkthrough.md'

export default assembleScenario({
  scenarioSrc,
  walkthroughSrc,
  mechanicsSrc,
})
```

## Register

In `scenarios/index.ts`:

```ts
import newScenario from './git/my-scenario/index.ts'
export const scenarios: Scenario[] = [cleanSweep, newScenario]
```

## Authoring invariants (humans and agents)

- Briefing and objective never name the solving command.
- Themes are concept chips (English git vocabulary), not commands.
- Checks are state-based only: they see the snapshot, never the transcript.
- Check `name` bilingual; titles and `spec.tree` English; `walkthrough.md`
  English only.
- Published `version` is immutable: bump it on any change.
- If the scenario needs a git subcommand the porcelain lacks, extend
  `engine/porcelain/git-command.ts` and add cases in `test/porcelain.test.ts`.
  If it needs a new setup op or predicate, extend `kinds/git.ts` (parser +
  interpreter + rendered details) and cover it in
  `test/scenario-package.test.ts`.
- Gate: `npm test` (includes the dry-run), `npm run typecheck`,
  `npm run build`, no em/en dashes in touched files.

## Adding a scenario (checklist)

1. Copy `scenarios/git/clean-sweep/` to `scenarios/<pack>/<name>/`.
2. Edit `scenario.md`, `scenario.yaml`, `walkthrough.md` (keep `index.ts`).
3. Import and append in `scenarios/index.ts`.
4. Run the gate. `test/slug.test.ts` fails on title/slug collisions and
   `test/scenario-dryrun.test.ts` fails if the solution does not prove the
   scenario solvable.

## Adding a future kind

1. Extend `ScenarioKind` in `scenarios/package/types.ts`.
2. Add `scenarios/package/kinds/<kind>.ts`: parser + interpreter for that
   kind's setup/check/solution vocabulary, with engine-rendered details.
3. Branch in `assemble.ts`.
4. Drop the kind's logo in `public/kinds/<kind>.svg` and map it in
   `KIND_LOGOS` (`src/shared/config`) so scenario cards show it.
5. Document the kind's vocabulary here. Do not bump `schema` unless the
   **envelope** contract breaks (the vocabulary grows additively inside the
   kind).
