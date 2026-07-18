# POC: kind=ts pack (`poc/ts-kind`)

TypeScript scenarios on the same contracts as git: state checks, transcript
replay, Socratic mentor. No Jasmine. Monaco + Run for the workspace.

## Harness

- Transpile-only + named export call
- Awaits Promises; `rejects` predicate for call failures only (load/transpile
  errors are harness failures, not rejections)
- Predicates: `exports`, `returns`, `rejects`, `stableAfterMutate`,
  `sameRef`, `arrayPushStable`, `file`
- `equals` uses deep equality (object key order does not matter)

## Pack order (18)

1. Tip jar lies: numbers / strings
2. Free shipping gate: control flow
3. Cart that lies: arrays
4. Stringly id: coercion / narrowing
5. Maybe null: `?.` / `??`
6. List bleed: array reference isolation
7. Config bleed: object mutation
8. Weekend rate: pick the rate function
9. Make the doc: union branch
10. Pipe it: validate in the pipeline
11. Pending receipt: callback nest atmosphere, receipt string
12. Then chain: Promises `.then`
13. Forgot to await: `async`/`await`
14. Swallow the 500: errors must surface
15. Two doors: concurrent start
16. One client: shared instance
17. Narrow the status: tagged unions
18. Stale paint: last-started wins the paint

## Known holes (POC)

- Structure (no nested callbacks, must use `.then`, must call helpers) is not
  enforceable with current predicates; copy must not claim what checks cannot
  grade. Isolation / reference use engine-owned `stableAfterMutate` /
  `sameRef` / `arrayPushStable`.
- `two-doors` gate flag still lives in the player file (single-file harness);
  a determined player can short-circuit it.
- `stale-paint` is state-based on the final string: a stub that returns
  `"Bob"` greens the board without fixing the race (same contract as other
  return checks).

## Authoring

`node scripts/gen-ts-pack.mjs` regenerates `scenarios/ts/*` from embedded data.
It does not touch `scenarios/index.ts`. Fix the script before regenerating.

## Dev

```bash
# UI :5174 → API :4518 (see vite.config.ts)
npm run start   # SHARPEN_PORT=4518
npm run dev
```

Open `/ts/tip-jar-lies` (or the picker root; both packs list until a
selector lands).
