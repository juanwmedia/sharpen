# POC: kind=ts (worktree `poc/ts-kind`)

Proof that sharpen's git contracts map to TypeScript **without Jasmine**.

## What shipped in this spike

| Git | TypeScript (POC) |
|-----|------------------|
| `createArena` + porcelain | `createTsArena` + `run` / `writefile` |
| Predicates on repo snapshot | `exports` / `returns` / `file` via harness |
| `git status` feedback | Run (from first `returns` check) |
| Server replay of commands | Same transcript replay |
| Dry-run solvability | `ts/broken-tip` green |
| Board for mentor | `workspace` + file list |

## Scenario

`scenarios/ts/broken-tip/` — fix `formatPrice` so `100` → `"$1.00"`.

Try locally (from this worktree):

```bash
npm test -- test/scenario-dryrun.test.ts
npm run start   # :4517
npm run dev     # :5173 → /ts/broken-tip
```

In the terminal:

```text
run src/price.ts formatPrice 100
# => "$100.00" while broken
# edit src/price.ts (writefile or cat), then run again
```

## UI (added)

kind=ts swaps `TerminalPane` for `TsWorkspacePane`: Monaco (CDN 0.41) +
Console + **Run**. Run writes `writefile … b64:…` then `run …` into the
transcript and submits (same authority path as git Enter).

## Explicitly NOT in this POC

- Typecheck-as-check (transpile-only, like FL playground)
- Full mentor copy rewrite per kind
- Packaging a ts pack for release

## Branch

```text
poc/ts-kind   (checked out in the main sharpen repo)
```

Vite POC ports: UI `:5174`, API `:4518` (see `vite.config.ts`).
