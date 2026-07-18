---
schema: 2
version: 1
id: git/time-machine-recovery
kind: git
pack: git
title: { en: Time machine recovery, es: Recuperación con la máquina del tiempo }
difficulty: medium
timeLimitMs: 90000
themes: [reflog, reset, hard reset]
spec:
  tree: |
    repo/
    └── src/
        └── ledger.ts   (tip was hard-reset away)
---

## Briefing (en)

You hard-reset `main` one commit too far. The ledger refactor is gone from the branch tip and the worktree looks like the old shell. Git still remembers recent HEAD moves. Find the lost tip and put `main` back on it.

## Briefing (es)

Hiciste un hard reset en `main` un commit de más. El refactor del ledger ya no está en el tip ni en el worktree; parece el shell antiguo. Git todavía recuerda los movimientos recientes de HEAD. Encuentra el tip perdido y vuelve a poner `main` ahí.

## Objective (en)

Recover the lost tip on `main` so the ledger refactor is committed again, the tree is clean, and history has two commits.

## Objective (es)

Recupera el tip perdido en `main` para que el refactor del ledger vuelva a estar commiteado, el árbol limpio y el historial con dos commits.
