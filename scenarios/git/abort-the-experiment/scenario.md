---
schema: 2
version: 1
id: git/abort-the-experiment
kind: git
pack: git
title: { en: Abort the experiment, es: Abortar misión }
difficulty: medium
timeLimitMs: 90000
themes: [branches, spike, unmerged, history]
spec:
  tree: |
    repo/               (HEAD: spike/cache-ttl)
    └── src/
        ├── cache.ts    (the expiry experiment, committed on this spike)
        └── server.ts
---

## Briefing (en)

Good habits: the cache-expiry experiment for edge-proxy went to its own spike branch, `spike/cache-ttl`, and you are standing on it right now with the experiment committed. The verdict just came from your own testing: expiring entries means faking time across half the service, and that rewrite is not worth it. **The spike is a dead end.** Abort the mission: back to solid ground, and no zombie branch left behind; dead spikes pile up fast in a busy repo.

## Briefing (es)

Buenas costumbres: el experimento de caducidad de la caché de edge-proxy fue a su propia rama spike, `spike/cache-ttl`, y ahora mismo estás subido a ella con el experimento commiteado. El veredicto acaba de llegar de tus propias pruebas: caducar entradas implica falsear el tiempo en media aplicación, y esa reescritura no compensa. **El spike es un callejón sin salida.** Aborta la misión: de vuelta a tierra firme, y sin dejar una rama zombi por detrás; los spikes muertos se acumulan rápido en un repo con movimiento.

## Objective (en)

Get back to `main` with a clean working tree and make the spike branch disappear completely. History on `main` must stay exactly as it was: **one commit**.

## Objective (es)

Vuelve a `main` con el working tree limpio y haz desaparecer la rama del spike por completo. El historial de `main` tiene que quedarse exactamente como estaba: **un commit**.
