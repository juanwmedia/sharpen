---
schema: 2
version: 1
id: ts/maybe-null
kind: ts
pack: ts
title: { en: "Maybe null", es: "Quizá null" }
difficulty: easy
timeLimitMs: 60000
themes: [nullish, optional]
spec:
  entry: src/title.ts
  tree: |
    workspace/
    └── src/
        └── title.ts   (page can be null; empty heading is legal)
---

## Briefing (en)

CMS preview blows up when the page row is missing, and empty headings get rewritten to **"Untitled"** like the author never meant a blank. `pageTitle` trusts `.heading` a little too much.

## Briefing (es)

La preview del CMS explota cuando falta la fila de página, y los headings vacíos se reescriben a **"Untitled"** como si el autor no hubiera querido el blanco. `pageTitle` confía demasiado en `.heading`.

## Objective (en)

Survive a missing page and keep empty headings empty. `pageTitle(null)` → `"Untitled"`; `pageTitle({ heading: "" })` → `""`; `pageTitle({ heading: "Hi" })` → `"Hi"`.

## Objective (es)

Sobrevive a una página ausente y mantén un heading vacío como cadena vacía. `pageTitle(null)` → `"Untitled"`; `pageTitle({ heading: "" })` → `""`; `pageTitle({ heading: "Hi" })` → `"Hi"`.
