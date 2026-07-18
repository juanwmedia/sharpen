---
schema: 2
version: 1
id: git/ship-only-the-fix
kind: git
pack: git
title: { en: Ship only the fix, es: Solo el fix }
difficulty: easy
timeLimitMs: 60000
themes: [staging, atomic commits, working tree]
spec:
  tree: |
    repo/
    ├── TODO.md          (edited - keep local)
    ├── debug.log        (junk from the repro)
    └── src/
        └── invoice.ts   (the fix - ship it)
---

## Briefing (en)

Invoices in billing-core were rounding to whole euros and finance noticed. You fixed `src/invoice.ts`, but the working tree also carries your personal edit to `TODO.md` and a `debug.log` you used to reproduce the bug. Review culture here is strict: **one commit, one concern**.

## Briefing (es)

Las facturas de billing-core redondeaban a euros enteros y finanzas se dio cuenta. Arreglaste `src/invoice.ts`, pero el working tree también arrastra tu edición personal de `TODO.md` y un `debug.log` que usaste para reproducir el bug. La cultura de review aquí es estricta: **un commit, un asunto**.

## Objective (en)

Commit the invoice fix **and nothing else**: history gains exactly one commit, your `TODO.md` edit stays uncommitted, and `debug.log` never enters the repo.

## Objective (es)

Commitea el fix de facturación **y nada más**: el historial gana exactamente un commit, tu edición de `TODO.md` se queda sin commitear y `debug.log` no entra en el repo.
