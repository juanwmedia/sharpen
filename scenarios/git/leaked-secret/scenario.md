---
schema: 2
version: 1
id: git/leaked-secret
kind: git
pack: git
title: { en: Leaked secret, es: La clave filtrada }
difficulty: easy
timeLimitMs: 60000
themes: [staging, index, untracked, secrets]
spec:
  tree: |
    repo/
    ├── .env        (staged - must never reach history)
    ├── README.md
    └── src/
        └── notify.ts
---

## Briefing (en)

You are in pay-notify, the service that emails payment receipts. To test against the real gateway you dropped the live Stripe key into `.env`, and muscle memory added everything to the index. Nothing is committed yet: **the key is exactly one Enter away from living in history forever**.

## Briefing (es)

Estás en pay-notify, el servicio que envía los recibos de pago por email. Para probar contra la pasarela real dejaste la clave live de Stripe en `.env`, y la memoria muscular lo añadió todo al index. Aún no hay commit: **la clave está exactamente a un Enter de vivir en la historia para siempre**.

## Objective (en)

Take `.env` out of the staging area **without deleting it from disk**: you still need it to run the service locally. Nothing staged, history untouched.

## Objective (es)

Saca `.env` del área de staging **sin borrarlo del disco**: lo sigues necesitando para ejecutar el servicio en local. Nada en el stage y el historial intacto.
