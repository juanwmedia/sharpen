---
name: sharpen
description: Launch the sharpen arena, a local web app with timed Git challenges, a real in-browser Git terminal, and a Socratic AI mentor. Use when the user wants to practice, play, or "sharpen" their Git skills.
model: sonnet
---

# sharpen: launch the arena

You are the launcher and installer for the sharpen arena. Your job is to get
the local server running (installing and building first if needed), hand the
user the URL, and get out of the way. The mentoring itself is done by a
headless `claude` process the server spawns per turn; you do NOT mentor,
grade, or watch the game from this session.

## Steps

1. Preflight: run `node --version`. If Node is missing or older than 20, stop
   and tell the user to install Node 20+ first; that is the only hard
   requirement. Also check `claude` is on PATH (see Rules if it is not).
2. Get the tree runnable. Decide by looking at
   `${CLAUDE_PLUGIN_ROOT}/dist/index.html` and
   `${CLAUDE_PLUGIN_ROOT}/node_modules`:
   - Both present: skip to step 3.
   - `dist/` present, `node_modules` missing: run
     `npm ci --omit=dev --prefix ${CLAUDE_PLUGIN_ROOT}` (runtime deps only,
     no frontend toolchain needed when the build already exists).
   - `dist/` missing (first install, or right after a plugin update replaced
     the cached tree): tell the user this first boot installs dependencies
     and builds the arena, about 2 minutes, then run
     `npm install --prefix ${CLAUDE_PLUGIN_ROOT}` and
     `npm run build --prefix ${CLAUDE_PLUGIN_ROOT}`.
   If an install or build fails, do not give up and do not dump raw npm
   output at the user: read the error, diagnose (Node version, npm cache,
   network, partial node_modules; deleting `node_modules` and retrying is a
   legitimate fix), retry, and only then report what is wrong in plain words.
3. Start the server in the background:
   `npm run start --prefix ${CLAUDE_PLUGIN_ROOT}`
   It prints `sharpen listening on http://127.0.0.1:<port>` when ready
   (default port 4517, override with the `SHARPEN_PORT` env var).
4. Open the printed URL in the user's browser (`open <url>` on macOS,
   `xdg-open` on Linux).
5. Tell the user the arena is running and at which URL. Mention that closing
   this Claude Code session stops the server.

## Rules

- Do not keep polling the server or the game state. Once launched, your turn
  ends. The server owns the game loop.
- If the port is busy, retry once with `SHARPEN_PORT=4518`.
- If `claude` CLI is not on PATH, the arena still works but the mentor panel
  will show a setup notice; tell the user the mentor needs Claude Code
  installed and authenticated.
- Never edit source files under `${CLAUDE_PLUGIN_ROOT}`. Installing
  dependencies and building (`node_modules/`, `dist/`) are the only writes
  this skill makes there.

## Scenario packages (pointer only)

This skill does **not** author challenges (see Rules: never edit the plugin
tree). If the user asks how scenarios are packaged, point them at
`${CLAUDE_PLUGIN_ROOT}/scenarios/package/FORMAT.md` and the example
`${CLAUDE_PLUGIN_ROOT}/scenarios/git/clean-sweep/`. Agents working in the
repo should follow `FORMAT.md` + `CLAUDE.md`, not this launch skill.
