---
schema: 2
version: 1
id: ts/stale-paint
kind: ts
pack: ts
title: { en: "Stale paint", es: "Pintura vieja" }
difficulty: hard
timeLimitMs: 120000
themes: [async-await, concurrency]
spec:
  entry: src/search.ts
  tree: |
    workspace/
    └── src/
        └── search.ts   (slow response paints over the latest)
---

## Briefing (en)

Typeahead fires two searches. The **slow one finishes last** and paints over the name you already showed. Support gets screenshots of Ada when Bob was the last query. Last started must win the paint.

## Briefing (es)

El typeahead lanza dos búsquedas. La **lenta termina al final** y pinta encima del nombre que ya mostraste. Soporte recibe capturas de Ada cuando Bob era la última query. Quien arrancó último debe ganar el paint.

## Objective (en)

When two fetches overlap, the last request started must own the painted name. `paintNames()` resolves to `"Bob"` (not `"Ada"` from the slower first request).

## Objective (es)

Cuando dos fetches se solapan, la última petición arrancada debe poseer el nombre pintado. `paintNames()` resuelve a `"Bob"` (no `"Ada"` de la primera petición más lenta).
