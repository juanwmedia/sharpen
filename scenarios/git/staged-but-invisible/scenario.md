---
schema: 2
version: 1
id: git/staged-but-invisible
kind: git
pack: git
title: { en: Staged but invisible, es: En el stage, invisible }
difficulty: easy
timeLimitMs: 60000
themes: [diff, staging, index]
spec:
  tree: |
    repo/
    ├── src/
    │   └── auth.ts   (staged fix - keep)
    └── notes.local   (staged by mistake - unstage)
---

## Briefing (en)

`git diff` looks empty. You know you changed something. The auth fix and a private scratch file both went into the index; plain `git diff` only compares the worktree to the index, so staged work is invisible there. `git diff --staged` is how you see what the next commit would ship. Only the auth fix should stay staged.

## Briefing (es)

`git diff` parece vacío. Sabes que cambiaste algo. El fix de auth y un borrador privado entraron los dos en el índice; el `git diff` plano solo compara el worktree con el índice, así que lo staged es invisible ahí. `git diff --staged` es como ves qué viajaría en el próximo commit. Solo el fix de auth debe seguir en el stage.

## Objective (en)

Leave **only** the auth fix staged. `notes.local` must survive on disk as untracked. Do not commit yet.

## Objective (es)

Deja **solo** el fix de auth en el stage. `notes.local` debe seguir en disco sin seguimiento. Aún no hagas commit.
