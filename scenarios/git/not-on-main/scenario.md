---
schema: 2
version: 1
id: git/not-on-main
kind: git
pack: git
title: { en: Not on main, es: Eso no va en main }
difficulty: easy
timeLimitMs: 60000
themes: [branches, working tree, commit]
spec:
  tree: |
    repo/
    ├── README.md
    └── src/
        └── banner.ts    (new work, still untracked)
---

## Briefing (en)

First week. They told you in the welcome doc, twice: **nothing lands on `main` except through a pull request.** You still built the welcome banner in `src/banner.ts` while the prompt said `main`. It is not committed yet. Your stomach knows the plot: one wrong Enter and you are the person who pushed straight to main on day four. The banner is fine. The branch is wrong.

## Briefing (es)

Primera semana. Te lo dijeron en el doc de bienvenida, dos veces: **en `main` no aterriza nada excepto por pull request.** Aun así montaste el banner de bienvenida en `src/banner.ts` con el prompt en `main`. Aún no está commiteado. Tu estómago ya conoce el guion: un Enter mal y eres quien empujó directo a main el día cuatro. El banner está bien. La rama no.

## Objective (en)

Land the banner as **one commit** on a new branch named `feature/welcome-banner`. `main` must stay exactly where it was. Nothing left staged or untracked.

## Objective (es)

Deja el banner como **un commit** en una rama nueva llamada `feature/welcome-banner`. `main` tiene que quedarse exactamente donde estaba. No dejes nada en el stage ni sin seguimiento.
