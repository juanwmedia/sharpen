---
schema: 2
version: 1
id: ts/then-chain
kind: ts
pack: ts
title: { en: "Then chain", es: "Encadena o muere" }
difficulty: easy
timeLimitMs: 60000
themes: [promises]
spec:
  entry: src/stock.ts
  tree: |
    workspace/
    └── src/
        └── stock.ts   (.then forgotten; UI shows [object Promise])
---

## Briefing (en)

Inventory badge renders **"[object Promise]"** on the warehouse TV. `stockLabel` returns the Promise itself instead of waiting for the SKU value. Wait for the number, then build the label string.

## Briefing (es)

El badge de inventario pinta **"[object Promise]"** en la tele del almacén. `stockLabel` devuelve la Promise en vez de esperar el SKU. Espera el número y construye la etiqueta.

## Objective (en)

The inventory badge needs the finished label string, not a Promise on screen. `stockLabel("sku-1")` must resolve to `"SKU sku-1: 3 left"`.

## Objective (es)

El badge de inventario necesita la etiqueta ya resuelta, no una Promise en pantalla. `stockLabel("sku-1")` debe resolverse a `"SKU sku-1: 3 left"`.
