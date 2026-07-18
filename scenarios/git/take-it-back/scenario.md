---
schema: 2
version: 1
id: git/take-it-back
kind: git
pack: git
title: { en: Take it back, es: Deshaz eso }
difficulty: easy
timeLimitMs: 60000
themes: [working tree, restore, tracked]
spec:
  tree: |
    repo/
    └── src/
        └── welcome.ts   (you "improved" the copy - undo it)
---

## Briefing (en)

You opened `src/welcome.ts` to "tighten the copy" and somehow left a joke in the empty-state string. It was funny for four seconds. Your lead is screensharing the onboarding flow in five minutes and that line will be on the wall. The good version is already committed. What sits on disk right now is the mistake. You do not want a new commit. You want the file to look like it never happened.

## Briefing (es)

Abriste `src/welcome.ts` para "afinar el copy" y de alguna forma dejaste un chiste en el string del empty state. Fue gracioso cuatro segundos. Tu lead va a compartir pantalla del onboarding en cinco minutos y esa línea va a estar en la pared. La versión buena ya está commiteada. Lo que hay ahora en disco es el fallo. No quieres un commit nuevo. Quieres que el archivo parezca que esto no pasó.

## Objective (en)

Make `src/welcome.ts` match the committed version again. Leave history on `main` untouched. Nothing staged.

## Objective (es)

Haz que `src/welcome.ts` vuelva a coincidir con la versión commiteada. Deja el historial de `main` intacto. Nada en el stage.
