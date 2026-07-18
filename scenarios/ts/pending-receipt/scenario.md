---
schema: 2
version: 1
id: ts/pending-receipt
kind: ts
pack: ts
title: { en: "Pending receipt", es: "Recibo en pending" }
difficulty: easy
timeLimitMs: 60000
themes: [callbacks, strings]
spec:
  entry: src/payout.ts
  tree: |
    workspace/
    └── src/
        └── payout.ts   (nest from 2014; receipt says pending)
---

## Briefing (en)

Payments still has a **callback nest** from another decade. Atmosphere aside, the receipt comes back wrong: `"pending:42"` instead of paid. Helpers stay callback-based. Fix the payout result.

## Briefing (es)

Payments sigue con un **nido de callbacks** de otra década. Atmósfera aparte, el recibo sale mal: `"pending:42"` en vez de paid. Los helpers se quedan a callbacks. Arregla el resultado del payout.

## Objective (en)

When payout finishes, the receipt must say paid, not pending. `runPayout(42)` resolves to `"paid:42"`.

## Objective (es)

Cuando el payout termina, el recibo debe decir paid, no pending. `runPayout(42)` resuelve a `"paid:42"`.
