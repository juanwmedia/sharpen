---
schema: 2
version: 2
id: git/clean-sweep
kind: git
pack: git
title: { en: Clean sweep, es: Limpieza general }
difficulty: medium
timeLimitMs: 60000
themes: [working tree, untracked, tracked, staging]
spec:
  tree: |
    repo/
    ├── README.md
    ├── build.log
    ├── notes/
    │   └── ideas.md
    ├── src/
    │   ├── index.ts
    │   └── api/
    │       ├── client.ts   (modified - keep)
    │       └── retry.ts
    └── tmp/
        ├── cache.json
        └── debug.log
---

## Briefing (en)

You are in noa-notes, a small patient-notes client. Someone left real work in progress next to debug junk: logs, a scratch `notes/` folder, and a `tmp/` cache. The tracked edit in `src/api/client.ts` is intentional and **must survive**.

## Briefing (es)

Estás en noa-notes, un cliente pequeño de notas de pacientes. Alguien dejó trabajo real en curso junto a basura de depuración: logs, una carpeta `notes/` de borrador y una caché en `tmp/`. El cambio trackeado en `src/api/client.ts` es intencional y **tiene que sobrevivir**.

## Objective (en)

Remove **every untracked file and directory**. Keep the modifications in `src/api/client.ts`. Leave nothing staged, and keep history on `main` untouched.

## Objective (es)

Elimina **todos los archivos y directorios sin seguimiento**. Conserva las modificaciones de `src/api/client.ts`. No dejes nada en el stage y mantén el historial en `main` intacto.
