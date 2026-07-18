---
schema: 2
version: 1
id: ts/weekend-rate
kind: ts
pack: ts
title: { en: "Weekend rate", es: "Tarifa de fin de semana" }
difficulty: easy
timeLimitMs: 60000
themes: [functions]
spec:
  entry: src/pricing.ts
  tree: |
    workspace/
    └── src/
        └── pricing.ts   (weekend surcharge never clocks in)
---

## Briefing (en)

Surge pricing: **weekdays 1x, weekends 1.5x**. Right now everything is weekday. Saturday must hurt on purpose.

## Briefing (es)

Surge: **entre semana 1x, fin de semana 1.5x**. Ahora todo es entre semana. El sábado tiene que doler a propósito.

## Objective (en)

Weekdays keep the base price; weekends apply the 1.5x surcharge. `priceCents(100, "weekday")` → `100`; `priceCents(100, "weekend")` → `150`.

## Objective (es)

Entre semana se mantiene el precio base; el fin de semana aplica el recargo 1.5x. `priceCents(100, "weekday")` → `100`; `priceCents(100, "weekend")` → `150`.
