---
schema: 2
version: 2
id: git/leaked-secret
kind: git
pack: git
title: { en: Leaked secret, es: La clave filtrada }
difficulty: easy
timeLimitMs: 60000
themes: [staging, index, untracked, secrets, pathspec]
spec:
  tree: |
    repo/
    ├── .env             (staged - must never reach history)
    ├── README.md
    └── src/
        └── notify.ts    (staged fix - this one should ship)
---

## Briefing (en)

You are in pay-notify, the service that emails payment receipts. You staged a real fix in `src/notify.ts`, then to test against the real gateway you dropped the live Stripe key into `.env` and muscle memory added that too. Nothing is committed yet: **the key is exactly one Enter away from living in history forever**, but the notify fix still needs to stay ready to ship.

## Briefing (es)

Estás en pay-notify, el servicio que envía los recibos de pago por email. Dejaste staged un fix real en `src/notify.ts`, luego para probar contra la pasarela real metiste la clave live de Stripe en `.env` y la memoria muscular lo añadió también. Aún no hay commit: **la clave está exactamente a un Enter de vivir en la historia para siempre**, pero el fix de notify tiene que seguir listo para salir.

## Objective (en)

Take `.env` out of the staging area **without deleting it from disk**: you still need it to run the service locally. Leave the notify fix staged. History untouched.

## Objective (es)

Saca `.env` del área de staging **sin borrarlo del disco**: lo sigues necesitando para ejecutar el servicio en local. Deja el fix de notify en el stage. Historial intacto.
