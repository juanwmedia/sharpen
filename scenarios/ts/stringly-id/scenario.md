---
schema: 2
version: 1
id: ts/stringly-id
kind: ts
pack: ts
title: { en: "Stringly id", es: "Id con comillas" }
difficulty: easy
timeLimitMs: 60000
themes: [typescript, coercion]
spec:
  entry: src/ledger.ts
  tree: |
    workspace/
    └── src/
        └── ledger.ts   (adds strings like a drunk Excel)
---

## Briefing (en)

The ledger **"adds"** invoice ids to amounts. `"1042" + 10` becomes `"104210"` and someone almost paid invoice ten-thousand-something. Treat the id as a number before you do money math, or refuse the garbage.

## Briefing (es)

El ledger **"suma"** ids de factura a importes. `"1042" + 10` vira a `"104210"` y casi pagan la factura diez-mil-y-pico. Convierte el id a número antes de hacer cuentas, o rechaza la basura.

## Objective (en)

Add a delta to a numeric invoice id without string concat. A clean id like `"1042"` plus `10` becomes the number `1052`; garbage like `"nope"` returns `null`.

## Objective (es)

Suma un delta a un id de factura numérico sin concatenar strings. Un id limpio como `"1042"` más `10` da el número `1052`; basura como `"nope"` devuelve `null`.
