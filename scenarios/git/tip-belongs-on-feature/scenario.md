---
schema: 2
version: 1
id: git/tip-belongs-on-feature
kind: git
pack: git
title: { en: Tip belongs on a feature, es: Ese tip era de una feature }
difficulty: medium
timeLimitMs: 90000
themes: [reset, hard reset, branches]
spec:
  tree: |
    repo/
    └── src/
        └── theme.ts   (committed on main by mistake)
---

## Briefing (en)

You built the dark-theme toggle and committed it on `main`. That tip should have been a feature branch from the start. `main` needs to go back to the previous commit; the work must not vanish: label the tip first, then rewind `main`.

## Briefing (es)

Montaste el toggle de tema oscuro y lo commiteaste en `main`. Ese tip debía ser una feature desde el principio. `main` tiene que volver al commit anterior; el trabajo no puede evaporarse: etiqueta el tip primero y luego rebobina `main`.

## Objective (en)

Point a new branch `feature/dark-mode` at the current tip, then put `main` back one commit with a hard reset. Stay on `main`. The feature branch keeps the dark-mode commit.

## Objective (es)

Apunta una rama nueva `feature/dark-mode` al tip actual y después deja `main` un commit atrás con un hard reset. Quédate en `main`. La rama feature conserva el commit del tema oscuro.
