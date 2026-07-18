---
schema: 2
version: 1
id: git/save-your-work
kind: git
pack: git
title: { en: Save your work, es: Guarda el trabajo }
difficulty: easy
timeLimitMs: 60000
themes: [working tree, untracked, staging, commit]
spec:
  tree: |
    repo/
    ├── README.md
    ├── scratch.txt      (your panic notes - keep local)
    └── src/
        └── badge.ts     (the thing that actually works)
---

## Briefing (en)

Day three. You finally made the status badge render. It lives in `src/badge.ts`, it works on your machine, and **it is not in git**. Only on disk. Your lead just pinged: "get that committed before standup." Standup is in twelve minutes. Next to it sits `scratch.txt`, the ugly notes you wrote while debugging. That garbage is not the badge. If the laptop dies between now and the meeting, the badge dies with it.

## Briefing (es)

Día tres. Por fin hiciste que el badge de estado pinte. Está en `src/badge.ts`, funciona en tu máquina, y **no está en git**. Solo en el disco. Tu lead acaba de escribir: "deja eso commiteado antes del standup." El standup es en doce minutos. Al lado tienes `scratch.txt`, las notas cutres que soltaste mientras depurabas. Esa basura no es el badge. Si el portátil muere entre ahora y la reunión, el badge se muere con él.

## Objective (en)

Put the badge into history as **one new commit** on `main`. Leave `scratch.txt` out of the repo. Nothing left staged.

## Objective (es)

Mete el badge en la historia como **un commit nuevo** en `main`. Deja `scratch.txt` fuera del repo. No dejes nada en el stage.
