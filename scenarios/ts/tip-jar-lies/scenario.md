---
schema: 2
version: 1
id: ts/tip-jar-lies
kind: ts
pack: ts
title: { en: "Tip jar lies", es: "El bote miente" }
difficulty: easy
timeLimitMs: 60000
themes: [functions, numbers, strings]
spec:
  entry: src/tip.ts
  tree: |
    workspace/
    └── src/
        └── tip.ts   (formatTip is cooking the books)
---

## Briefing (en)

Friday tip-out. The jar UI shows **"$100.00"** for a hundred cents. Finance will not find that cute. `formatTip` forgot that money has a denominator. Fix the math before someone screenshots the dashboard for Slack.

## Briefing (es)

Reparto de propinas del viernes. La UI del bote enseña **"$100.00"** por cien céntimos. Finanzas no lo va a encontrar gracioso. `formatTip` se olvidó de que el dinero tiene denominador. Arregla la cuenta antes de que alguien lo suba a Slack.

## Objective (en)

Show tip amounts in dollars, not raw cents. `formatTip(100)` must return `"$1.00"`; `formatTip(0)` must return `"$0.00"`.

## Objective (es)

Muestra las propinas en dólares, no en céntimos crudos. `formatTip(100)` debe devolver `"$1.00"`; `formatTip(0)` debe devolver `"$0.00"`.
