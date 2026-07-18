---
schema: 2
version: 1
id: ts/config-bleed
kind: ts
pack: ts
title: { en: "Config bleed", es: "El config se sangra" }
difficulty: easy
timeLimitMs: 60000
themes: [objects, mutation]
spec:
  entry: src/flags.ts
  tree: |
    workspace/
    └── src/
        └── flags.ts   (returns the live object)
---

## Briefing (en)

Feature flags are **"read-only"** until a test mutates the object you returned and production dark-launches itself. `getFlags` hands out something callers can rewrite in place. After that rewrite, the store must not have changed.

## Briefing (es)

Los feature flags son **"de solo lectura"** hasta que un test muta el objeto que devolviste y producción se auto-lanza a oscuras. `getFlags` entrega algo que el caller puede reescribir in situ. Tras esa mutación, el almacén no debe haber cambiado.

## Objective (en)

Callers may mutate what `getFlags` returns without corrupting the store. After `getFlags().beta = true`, a fresh `getFlags().beta` must still be `false`.

## Objective (es)

El caller puede mutar lo que devuelve `getFlags` sin corromper el almacén. Tras `getFlags().beta = true`, un nuevo `getFlags().beta` debe seguir siendo `false`.
