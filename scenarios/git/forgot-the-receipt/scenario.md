---
schema: 2
version: 1
id: git/forgot-the-receipt
kind: git
pack: git
title: { en: Forgot the receipt, es: Se te olvidó el recibo }
difficulty: easy
timeLimitMs: 60000
themes: [amend, staging, commit]
spec:
  tree: |
    repo/
    ├── src/
    │   └── tip.ts
    └── receipt.md   (forgot to include)
---

## Briefing (en)

You just committed the tip-jar helper. Thirty seconds later you notice `receipt.md` still sitting untracked: the copy that belongs in that same tip. History is local; nobody else has the commit yet. Do not stack a second commit on top.

## Briefing (es)

Acabas de hacer commit del helper del tip-jar. Treinta segundos después ves que `receipt.md` sigue sin seguimiento: el texto que debía ir en ese mismo tip. El historial es local; nadie más tiene el commit. No apiles un segundo commit encima.

## Objective (en)

Fold `receipt.md` into the tip you just made. Keep a **single** commit on `main` with both files. Leave nothing staged or untracked.

## Objective (es)

Incluye `receipt.md` en el tip que acabas de crear. Deja **un solo** commit en `main` con ambos archivos. No dejes nada en el stage ni sin seguimiento.
