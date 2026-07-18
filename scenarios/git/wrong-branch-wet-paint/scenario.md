---
schema: 2
version: 2
id: git/wrong-branch-wet-paint
kind: git
pack: git
title: { en: 'Wrong branch, wet paint', es: Pintura fresca en main }
difficulty: medium
timeLimitMs: 90000
spec:
  tree: |
    repo/
    └── src/
        └── client.ts   (30 minutes of uncommitted work)
themes: [branches, working tree, staging]
---

## Briefing (en)

Thirty minutes into the retry logic for flaky endpoints you glance at the prompt: **you have been editing on `main` the whole time**. Nothing is committed yet. Team policy is not negotiable: `main` only moves through pull requests, and yours is not one.

## Briefing (es)

Media hora con la lógica de retry para endpoints inestables y miras el prompt: **llevas todo el rato editando en `main`**. Aún no hay nada commiteado. La política del equipo no se negocia: `main` solo se mueve por pull request, y esto no lo es.

## Objective (en)

Land the retry work as **a single commit** on a new branch named `feature/retry-loop`. `main` must stay exactly where it was.

## Objective (es)

Deja el trabajo de retry como **un único commit** en una rama nueva llamada `feature/retry-loop`. `main` tiene que quedarse exactamente donde estaba.
