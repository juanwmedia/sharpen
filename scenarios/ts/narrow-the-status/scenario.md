---
schema: 2
version: 1
id: ts/narrow-the-status
kind: ts
pack: ts
title: { en: "Narrow the status", es: "Estrecha el status" }
difficulty: medium
timeLimitMs: 90000
themes: [typescript, narrowing, unions]
spec:
  entry: src/result.ts
  tree: |
    workspace/
    └── src/
        └── result.ts   (treats err like ok)
---

## Briefing (en)

`describe` gets a tagged union `{ok:true,value}|{ok:false,error}` and **always reads `.value`**. On errors you concatenate `undefined` into the UI copy. Error paths must format the error string.

## Briefing (es)

`describe` recibe una unión etiquetada `{ok:true,value}|{ok:false,error}` y **siempre lee `.value`**. En error concatenas `undefined` al copy. Las ramas de error deben formatear el string de error.

## Objective (en)

Format success and failure differently: ok values as `"ok:…"`, errors as `"err:…"` (never `"ok:undefined"`). `describe({ok:true,value:"x"})` → `"ok:x"`; `describe({ok:false,error:"boom"})` → `"err:boom"`.

## Objective (es)

Formatea éxito y fallo distinto: valores ok como `"ok:…"`, errores como `"err:…"` (nunca `"ok:undefined"`). `describe({ok:true,value:"x"})` → `"ok:x"`; `describe({ok:false,error:"boom"})` → `"err:boom"`.
