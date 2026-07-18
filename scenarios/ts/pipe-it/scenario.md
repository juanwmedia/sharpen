---
schema: 2
version: 1
id: ts/pipe-it
kind: ts
pack: ts
title: { en: "Pipe it", es: "Encádenalo" }
difficulty: easy
timeLimitMs: 60000
themes: [functions]
spec:
  entry: src/pipeline.ts
  tree: |
    workspace/
    └── src/
        └── pipeline.ts   (god function; validate unused)
---

## Briefing (en)

A "temporary" **god function** inlines parse and format, and quietly drops validation. Garbage like `"nope"` still formats. Wire the pipeline so invalid input dies as `null`.

## Briefing (es)

Una **"función dios" temporal** inlinea parse y format, y se salta la validación. Basura como `"nope"` sigue formateando. Encaja el pipeline para que el input inválido muera como `null`.

## Objective (en)

Valid trimmed digits format to a label; invalid input must stop as `null` (not a fake `VAL:…`). `processInput("  42  ")` → `"VAL:42"`; `processInput("nope")` → `null`.

## Objective (es)

Los dígitos válidos (tras trim) formatean a una etiqueta; el input inválido debe parar en `null` (no un `VAL:…` falso). `processInput("  42  ")` → `"VAL:42"`; `processInput("nope")` → `null`.
