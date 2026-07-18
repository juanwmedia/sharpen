---
schema: 2
version: 1
id: ts/one-client
kind: ts
pack: ts
title: { en: "One client", es: "Un solo cliente" }
difficulty: medium
timeLimitMs: 90000
themes: [modules, references]
spec:
  entry: src/db.ts
  tree: |
    workspace/
    └── src/
        └── db.ts   (new client every call; pool crying)
---

## Briefing (en)

`getClient()` **news up a connection** on every call. The pool hit 400 before lunch. Two callers should not each walk away with a brand-new toy.

## Briefing (es)

`getClient()` **abre conexión nueva** en cada llamada. El pool tocó 400 antes de comer. Dos callers no deberían irse cada uno con un juguete nuevo.

## Objective (en)

Stop minting a new connection on every call: two `getClient()` results must be the same object reference (pool stays calm).

## Objective (es)

Deja de abrir conexión nueva en cada llamada: dos resultados de `getClient()` deben ser la misma referencia de objeto (el pool se tranquiliza).
