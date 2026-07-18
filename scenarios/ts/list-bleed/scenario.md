---
schema: 2
version: 1
id: ts/list-bleed
kind: ts
pack: ts
title: { en: "List bleed", es: "La lista se sangra" }
difficulty: easy
timeLimitMs: 60000
themes: [arrays, mutation]
spec:
  entry: src/inventory.ts
  tree: |
    workspace/
    └── src/
        └── inventory.ts   (returns the live stock array)
---

## Briefing (en)

Warehouse API promised a **snapshot**. Callers push into the array you returned and suddenly production stock includes `"leak"`. `getStock` handed out the live shelf.

## Briefing (es)

La API del almacén prometió una **foto**. Los callers hacen push al array que devolviste y de pronto el stock de producción incluye `"leak"`. `getStock` entregó la estantería en vivo.

## Objective (en)

Callers may mutate what `getStock` returns without corrupting the store. After a push of `"leak"`, a fresh `getStock()` must still be `["pen","ink"]` (length 2).

## Objective (es)

El caller puede mutar lo que devuelve `getStock` sin corromper el almacén. Tras un push de `"leak"`, un nuevo `getStock()` debe seguir siendo `["pen","ink"]` (length 2).
