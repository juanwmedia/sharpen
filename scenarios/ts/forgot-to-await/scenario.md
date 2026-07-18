---
schema: 2
version: 1
id: ts/forgot-to-await
kind: ts
pack: ts
title: { en: "Forgot to await", es: "Se te olvidó el await" }
difficulty: medium
timeLimitMs: 90000
themes: [async-await, promises]
spec:
  entry: src/greeter.ts
  tree: |
    workspace/
    └── src/
        └── greeter.ts   (welcomes "Welcome undefined")
---

## Briefing (en)

Onboarding emails say **"Welcome undefined"**. `welcome` treated a Promise like a user object and asked it for `.name` like it owed you rent.

## Briefing (es)

Los emails de onboarding dicen **"Welcome undefined"**. `welcome` trató una Promise como un usuario y le pediste `.name` como si te debiera dinero.

## Objective (en)

The greeting must use the loaded user's name. `welcome(7)` resolves to `"Welcome, Ada"` (not `"Welcome undefined"`).

## Objective (es)

El saludo debe usar el nombre del usuario ya cargado. `welcome(7)` resuelve a `"Welcome, Ada"` (no `"Welcome undefined"`).
