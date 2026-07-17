# Scenario package format (schema 1)

A scenario is a **folder you can zip and share**. The loader turns it into the
runtime `Scenario` object the arena already understands. UI copy (briefing,
objective, tree) is never hardcoded in the product: it is read from the package.

Canonical example: [`scenarios/git/clean-sweep/`](../git/clean-sweep/).
Copy that folder when adding a git scenario.

## Layout

```text
scenarios/<pack>/<name>/
  scenario.md       # YAML frontmatter + localized sections
  walkthrough.md    # English mentor reveal (body only)
  setup.ts          # deterministic initial state
  assert.ts         # state-based checks
  index.ts          # assembleScenario(...) + default export
```

Register the package explicitly in [`scenarios/index.ts`](../index.ts)
(no filesystem scan). Display order = array order.

## File roles

| File | Role | Who reads it |
|------|------|----------------|
| `scenario.md` | Identity, themes, kind `spec`, player-facing briefing/objective | UI, picker summary, mentor `Goal:` (objective.en) |
| `walkthrough.md` | Canonical solution (English) | Mentor only, on reveal / timeout |
| `setup.ts` | Build the initial arena state | Browser arena + server replay |
| `assert.ts` | Rubric over final state | Every Enter / submit (local + authoritative) |
| `index.ts` | Wire md + hooks through `assembleScenario` | Registry import |

## Core vs kind vs pack

| Field | Role |
|-------|------|
| **Core** (`schema`, `id`, `kind`, `pack`, `title`, `difficulty`) | Required. Stable across domains. |
| **Optional core** (`timeLimitMs`, `themes`) | Defaults: 60000 ms, `[]`. |
| **`spec`** | Open map for kind-specific data. Git requires `spec.tree`. Unknown keys are ignored by other kinds. |
| **`kind`** | Which assembler understands hooks + `spec` (`git` today). |
| **`pack`** | Catalog / URL grouping (`/:pack/:slug`). May differ from `kind` later. |

Conventions:

- `id` is usually `<pack>/<folder-name>` (e.g. `git/clean-sweep`).
- Public URL is `/<pack>/<slugify(title)>` (title slug, not folder name).
- Adding SQL later = new `kind` assembler + new `spec` keys. Existing git
  packages need **no** changes. Do not put domain fields on the root manifest.

## scenario.md

```yaml
---
schema: 1
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

Section headings must be exactly `## Briefing (locale)` / `## Objective (locale)`
for every locale in `LOCALES` (`en`, `es`). Missing or empty sections fail load.

For `kind: git`, `spec.tree` is the English ASCII snapshot shown in the UI.
Keep it aligned with what `setup.ts` actually creates (paths + light notes like
`(modified - keep)`). No em dashes or en dashes anywhere (use ASCII `-`).

## walkthrough.md

Plain English body (no frontmatter). Spoiler for the mentor after reveal.
Describe the canonical approach and note that any state-correct solution passes.

## setup.ts / assert.ts (git)

```ts
// setup.ts
import type { ScenarioSetupEnv } from '../../../engine/types.ts'

export async function setup(env: ScenarioSetupEnv): Promise<void> {
  await env.write('README.md', '# demo\n')
  await env.add('README.md')
  await env.commit('init')
  // ... more writes / add / commit / branch / checkout
}
```

`ScenarioSetupEnv` helpers: `write`, `remove`, `add`, `commit`, `branch`,
`checkout`, plus `fs` / `git` / `dir` if needed. Deterministic only: no
`Date.now()`, no randomness (arena supplies fixed clock and author).

```ts
// assert.ts
import { statusOf, untrackedFiles } from '../../../engine/snapshot.ts'
import type { ScenarioAssertContext, Check } from '../../../engine/types.ts'

export async function assert(
  ctx: ScenarioAssertContext
): Promise<{ pass: boolean; checks: Check[] }> {
  const checks: Check[] = []
  // Inspect ctx.snapshot (and ctx.fs for file bytes). Never the transcript.
  // Each check: bilingual name + detail ({ en, es }), and pass: boolean.
  return { pass: checks.every((c) => c.pass), checks }
}
```

Useful snapshot helpers live in `engine/snapshot.ts` (`statusOf`,
`untrackedFiles`, …).

## index.ts (boilerplate)

```ts
import { assembleScenario } from '../../package/assemble.ts'
import { assert } from './assert.ts'
import scenarioSrc from './scenario.md'
import { setup } from './setup.ts'
import walkthroughSrc from './walkthrough.md'

export default assembleScenario({
  scenarioSrc,
  walkthroughSrc,
  setup,
  assert,
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
- `setup` deterministic; `assert` state-based only.
- Check `name` / `detail` bilingual; titles and `spec.tree` English.
- `walkthrough.md` English only.
- If the scenario needs a git subcommand the porcelain lacks, extend
  `engine/porcelain/git-command.ts` and add cases in `test/porcelain.test.ts`.
- Gate: `npm test`, `npm run typecheck`, `npm run build`, no em/en dashes in
  touched files.

## Adding a scenario (checklist)

1. Copy `scenarios/git/clean-sweep/` to `scenarios/<pack>/<name>/`.
2. Edit `scenario.md`, `walkthrough.md`, `setup.ts`, `assert.ts` (keep `index.ts`
   shape unless imports change).
3. Import and append in `scenarios/index.ts`.
4. Run the gate. `test/slug.test.ts` fails on title/slug collisions.

## Adding a future kind

1. Extend `ScenarioKind` in `scenarios/package/types.ts`.
2. Add `scenarios/package/kinds/<kind>.ts` assembler.
3. Branch in `assemble.ts`.
4. Document kind-specific `spec` keys here. Do not bump `schema` unless the
   **core** contract breaks.
