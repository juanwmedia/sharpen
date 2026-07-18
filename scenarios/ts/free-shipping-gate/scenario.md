---
schema: 2
version: 1
id: ts/free-shipping-gate
kind: ts
pack: ts
title: { en: "Free shipping gate", es: "Envío gratis... o no" }
difficulty: easy
timeLimitMs: 60000
themes: [control-flow, booleans]
spec:
  entry: src/shipping.ts
  tree: |
    workspace/
    └── src/
        └── shipping.ts   (threshold is upside down)
---

## Briefing (en)

Growth wanted **"free shipping over $50"**. What shipped is free shipping *under* $50. Carts at $12 sail free; carts at $80 get charged. Support is already writing the apology email. Flip the gate.

## Briefing (es)

Growth quería **"envío gratis a partir de $50"**. Lo que salió es envío gratis *por debajo* de $50. Los carritos de $12 van gratis; los de $80 pagan. Soporte ya está redactando la disculpa. Dale la vuelta a la condición.

## Objective (en)

Free shipping starts at $50 inclusive (amounts are cents). Just under the threshold must pay shipping; the threshold and above must qualify. `qualifiesForFreeShipping(4999)` → `false`; `qualifiesForFreeShipping(5000)` → `true`.

## Objective (es)

Envío gratis a partir de $50 inclusive (importes en céntimos). Por debajo se paga; en el umbral o más, califica. `qualifiesForFreeShipping(4999)` → `false`; `qualifiesForFreeShipping(5000)` → `true`.
