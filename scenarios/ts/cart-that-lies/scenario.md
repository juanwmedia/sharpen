---
schema: 2
version: 1
id: ts/cart-that-lies
kind: ts
pack: ts
title: { en: "Cart that lies", es: "El carrito miente" }
difficulty: easy
timeLimitMs: 60000
themes: [arrays, reduce]
spec:
  entry: src/cart.ts
  tree: |
    workspace/
    └── src/
        └── cart.ts   (qty is decorative)
---

## Briefing (en)

Checkout totals **one unit per line**, every time. Someone ordered 6 licenses; the invoice billed 1. The customer is not wrong. `cartTotal` never met `qty`.

## Briefing (es)

El checkout suma **una unidad por línea**, siempre. Alguien pidió 6 licencias; la factura cobró 1. El cliente no está loco. `cartTotal` nunca conoció a `qty`.

## Objective (en)

Cart total must multiply price by quantity per line, then sum. For two lines (100¢×2 and 50¢×3) the total is `350`. An empty cart is `0`.

## Objective (es)

El total del carrito debe multiplicar precio por cantidad en cada línea y sumar. Con dos líneas (100¢×2 y 50¢×3) el total es `350`. Un carrito vacío es `0`.
