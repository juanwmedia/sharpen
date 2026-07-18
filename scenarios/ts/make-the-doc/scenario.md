---
schema: 2
version: 1
id: ts/make-the-doc
kind: ts
pack: ts
title: { en: "Make the doc", es: "Haz el documento" }
difficulty: easy
timeLimitMs: 60000
themes: [unions, functions]
spec:
  entry: src/docs.ts
  tree: |
    workspace/
    └── src/
        └── docs.ts   (always builds an invoice)
---

## Briefing (en)

Billing needs `kind: "invoice" | "credit"` to produce the right document. Today every call builds an invoice, so credit notes invoice the customer again. Shame. Build the right shape for each kind.

## Briefing (es)

Billing necesita que `kind: "invoice" | "credit"` produzca el documento correcto. Hoy todo sale como invoice, así que los abonos vuelven a cobrar. Vergüenza. Construye la forma correcta para cada kind.

## Objective (en)

Each kind must produce its own document shape: invoices keep a positive total; credits negate it. `makeDoc("invoice", 10)` → `{ type: "invoice", total: 10 }`; `makeDoc("credit", 10)` → `{ type: "credit", total: -10 }`.

## Objective (es)

Cada kind debe producir su propia forma de documento: las facturas mantienen total positivo; los abonos lo niegan. `makeDoc("invoice", 10)` → `{ type: "invoice", total: 10 }`; `makeDoc("credit", 10)` → `{ type: "credit", total: -10 }`.
