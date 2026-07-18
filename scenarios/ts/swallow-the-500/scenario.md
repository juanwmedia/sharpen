---
schema: 2
version: 1
id: ts/swallow-the-500
kind: ts
pack: ts
title: { en: "Swallow the 500", es: "Tragarse el 500" }
difficulty: medium
timeLimitMs: 90000
themes: [errors, async-await]
spec:
  entry: src/api.ts
  tree: |
    workspace/
    └── src/
        └── api.ts   (catch → null; UI shows "success")
---

## Briefing (en)

The API helper **eats every failure** and returns `null`. The UI draws an empty success state while ops pages a real 500. On failure, `fetchOrder` must reject: do not launder errors into silence.

## Briefing (es)

El helper de API **se traga cada fallo** y devuelve `null`. La UI pinta un éxito vacío mientras ops pagina un 500 de verdad. Si falla, `fetchOrder` debe rechazar: no blanquees errores en silencio.

## Objective (en)

Success still returns the order; failures must surface, not become silent `null`. `fetchOrder(1)` → `{ id: 1 }`. `fetchOrder(500)` rejects with a message containing `ORDER_500`.

## Objective (es)

El éxito sigue devolviendo el pedido; los fallos deben aflorar, no convertirse en `null` silencioso. `fetchOrder(1)` → `{ id: 1 }`. `fetchOrder(500)` rechaza con un mensaje que contenga `ORDER_500`.
