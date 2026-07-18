---
schema: 2
version: 3
id: ts/broken-tip
kind: ts
pack: ts
title: { en: Broken tip, es: Propina rota }
difficulty: easy
timeLimitMs: 60000
themes: [functions, numbers, strings]
spec:
  entry: src/price.ts
  tree: |
    workspace/
    └── src/
        └── price.ts   (formatPrice is wrong)
---

## Briefing (en)

Checkout is printing tips as raw cents. `formatPrice` in `src/price.ts` should turn `100` into `"$1.00"`, but something in the division is off. Edit the file and press Run to see what it returns.

## Briefing (es)

El checkout imprime las propinas en céntimos crudos. `formatPrice` en `src/price.ts` debería convertir `100` en `"$1.00"`, pero la división falla. Edita el archivo y pulsa Run para ver qué devuelve.

## Objective (en)

Make `formatPrice(100)` return `"$1.00"`.

## Objective (es)

Haz que `formatPrice(100)` devuelva `"$1.00"`.
