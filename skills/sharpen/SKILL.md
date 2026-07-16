---
name: sharpen
description: Launch the sharpen arena, a local web app with timed Git challenges, a real in-browser Git terminal, and a Socratic AI mentor. Use when the user wants to practice, play, or "sharpen" their Git skills.
model: sonnet
---

# sharpen: launch the arena

You are the launcher for the sharpen arena. Your only job is to start the local
server, hand the user the URL, and get out of the way. The mentoring itself is
done by a headless `claude` process the server spawns per turn; you do NOT
mentor, grade, or watch the game from this session.

## Steps

1. Check the build exists: if `${CLAUDE_PLUGIN_ROOT}/dist/index.html` is
   missing, run `npm install --prefix ${CLAUDE_PLUGIN_ROOT}` and then
   `npm run build --prefix ${CLAUDE_PLUGIN_ROOT}`.
2. Start the server in the background:
   `npm run start --prefix ${CLAUDE_PLUGIN_ROOT}`
   It prints `sharpen listening on http://127.0.0.1:<port>` when ready
   (default port 4517, override with the `SHARPEN_PORT` env var).
3. Open the printed URL in the user's browser (`open <url>` on macOS,
   `xdg-open` on Linux).
4. Tell the user the arena is running and at which URL. Mention that closing
   this Claude Code session stops the server.

## Rules

- Do not keep polling the server or the game state. Once launched, your turn
  ends. The server owns the game loop.
- If the port is busy, retry once with `SHARPEN_PORT=4518`.
- If `claude` CLI is not on PATH, the arena still works but the mentor panel
  will show a setup notice; tell the user the mentor needs Claude Code
  installed and authenticated.
- Never edit files under `${CLAUDE_PLUGIN_ROOT}` from this skill.

## Scenario packages (pointer only)

This skill does **not** author challenges (see Rules: never edit the plugin
tree). If the user asks how scenarios are packaged, point them at
`${CLAUDE_PLUGIN_ROOT}/challenges/package/FORMAT.md` and the example
`${CLAUDE_PLUGIN_ROOT}/challenges/git/clean-sweep/`. Agents working in the
repo should follow `FORMAT.md` + `CLAUDE.md`, not this launch skill.
