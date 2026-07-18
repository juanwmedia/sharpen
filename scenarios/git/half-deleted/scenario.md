---
schema: 2
version: 2
id: git/half-deleted
kind: git
pack: git
title: { en: Half-deleted, es: Borrado a medias }
difficulty: medium
timeLimitMs: 90000
themes: [index, staging, deleted, pathspec]
spec:
  tree: |
    repo/
    ├── src/
    │   ├── app.ts
    │   └── legacy/
    │       └── parser.ts       (deletion staged - undo this one)
    └── tests/
        └── legacy-rows.csv     (deletion staged - this one is right)
---

## Briefing (en)

Prepping the cleanup PR for import-service you ran `git rm` on two files at once: the legacy CSV parser and its test fixture. Both deletions are sitting in the index, ready to ship. Then a `grep` through the import pipeline stopped you cold: **production still calls the parser every night**. The fixture is genuinely dead; the parser is not.

Each deletion lives in two places at once: the staging area (ready to ship) and the working tree (gone from disk). For the parser you need both layers right again; the fixture stays ready to ship.

## Briefing (es)

Preparando la PR de limpieza de import-service ejecutaste `git rm` sobre dos archivos de una tacada: el parser CSV legacy y su fixture de tests. Los dos borrados están en el index, listos para salir. Entonces un `grep` por el pipeline de importación te paró en seco: **producción sigue llamando al parser cada noche**. El fixture está muerto de verdad; el parser no. Cada borrado vive a la vez en dos sitios: el área de staging (listo para salir) y el working tree (fuera del disco). Para el parser necesitas las dos capas bien otra vez; el fixture se queda listo para salir.

## Objective (en)

Undo **only the parser's deletion**, completely: `src/legacy/parser.ts` back on disk exactly as committed. The fixture's deletion stays staged, ready to ship, and history must not move.

## Objective (es)

Deshaz **solo el borrado del parser**, por completo: `src/legacy/parser.ts` de vuelta en disco exactamente como se commiteó. El borrado del fixture se queda staged, listo para salir, y el historial no puede moverse.
