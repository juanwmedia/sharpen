---
schema: 2
version: 1
id: git/soft-landing-wrong-branch
kind: git
pack: git
title: { en: 'Soft landing, wrong branch', es: 'Aterrizaje suave, rama equivocada' }
difficulty: medium
timeLimitMs: 90000
themes: [reset, soft reset, branches, commit]
spec:
  tree: |
    repo/
    └── src/
        └── banner.ts   (committed on release by mistake)
---

## Briefing (en)

The promo banner landed as a commit on `release`. It belongs on `feature/promo-banner`, which already points at the same base as `release` did before the slip. The work itself is good; only the branch tip is wrong. You want the changes to travel with you, not disappear.

## Briefing (es)

El banner de promo aterrizó como commit en `release`. Debe vivir en `feature/promo-banner`, que ya apunta a la misma base que tenía `release` antes del fallo. El trabajo en sí está bien; solo el tip de la rama está mal. Quieres que los cambios viajen contigo, no que desaparezcan.

## Objective (en)

Move that commit onto `feature/promo-banner`. `release` must go back to one commit. Finish on the feature branch with the banner committed and a clean tree.

## Objective (es)

Mueve ese commit a `feature/promo-banner`. `release` debe volver a un commit. Termina en la rama feature con el banner commiteado y el árbol limpio.
