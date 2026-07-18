---
schema: 2
version: 1
id: git/the-vanished-file
kind: git
pack: git
title: { en: The vanished file, es: Esfumado }
difficulty: easy
timeLimitMs: 60000
themes: [working tree, deleted, restore]
spec:
  tree: |
    repo/
    ├── README.md
    ├── deploy.sh        (just deleted from disk)
    └── scripts/
        └── healthcheck.sh   (also gone)
---

## Briefing (en)

Friday afternoon cleanup in status-page went one `rm -rf` too far: `deploy.sh` and the whole `scripts/` folder are **gone from disk**, and the release pipeline exits red on the very first step. Everything was committed, nobody touched the stage, and the deploy window closes soon.

## Briefing (es)

La limpieza del viernes por la tarde en status-page se pasó un `rm -rf` de largo: `deploy.sh` y la carpeta `scripts/` entera han **desaparecido del disco**, y el pipeline de release sale en rojo en el primer paso. Todo estaba commiteado, nadie tocó el stage, y la ventana de deploy se cierra pronto.

## Objective (en)

Bring **every deleted file** back exactly as committed, byte for byte. Nothing staged, history untouched.

## Objective (es)

Recupera **todos los archivos borrados** exactamente como se commitearon, byte a byte. Nada en el stage y el historial intacto.
