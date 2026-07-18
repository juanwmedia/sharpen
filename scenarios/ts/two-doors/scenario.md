---
schema: 2
version: 1
id: ts/two-doors
kind: ts
pack: ts
title: { en: "Two doors", es: "Dos puertas" }
difficulty: medium
timeLimitMs: 90000
themes: [async-await, concurrency]
spec:
  entry: src/dashboard.ts
  tree: |
    workspace/
    └── src/
        └── dashboard.ts   (awaits A before starting B; A refuses)
---

## Briefing (en)

The home dashboard loads **user then prefs**, in series. A nasty gate in `fetchUser` only resolves if prefs has already been kicked off; sequential waiting dead-ends. The two loads have to overlap.

## Briefing (es)

El dashboard carga **user y luego prefs**, en serie. Un candado en `fetchUser` solo resuelve si prefs ya arrancó: esperar en serie se suicida. Las dos cargas tienen que solaparse.

## Objective (en)

Home must load user and prefs together without deadlocking on the sequential gate. `loadHome()` resolves to `{ user: "Ada", theme: "dark" }`.

## Objective (es)

Home debe cargar user y prefs juntos sin quedarse atrapado en el candado secuencial. `loadHome()` resuelve a `{ user: "Ada", theme: "dark" }`.
