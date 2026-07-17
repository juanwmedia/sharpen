---
name: sharpen
description: Launch the sharpen arena, a local web app with timed Git challenges, a real in-browser Git terminal, and a Socratic AI mentor. Use when the user wants to practice, play, or "sharpen" their Git skills.
model: sonnet
---

# sharpen: launch the arena

You are the launcher for the sharpen arena. Your job is to get the local
server running (downloading the prebuilt app on first boot), hand the user
the URL, and get out of the way. The mentoring itself is done by a headless
`claude` process the server spawns per turn; you do NOT mentor, grade, or
watch the game from this session.

## Steps

1. Preflight: run `node --version`. If Node is missing or older than 20, stop
   and tell the user to install Node 20+ first; that is the only hard
   requirement. Also check `claude` is on PATH (see Rules if it is not).
2. Resolve the app. Read the plugin version:
   `VERSION=$(node -p "require('${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json').version")`
   The prebuilt app for that version lives at `~/.sharpen/app/$VERSION`.
   If that directory exists, skip to step 3. Otherwise download the release
   artifact (a few MB, seconds):
   - Download both files from
     `https://github.com/juanwmedia/sharpen/releases/download/v$VERSION/`:
     `sharpen-v$VERSION.tar.gz` and `sharpen-v$VERSION.tar.gz.sha256`
     (`curl -fL --retry 2 -o <file> <url>`, into a fresh temp dir).
   - Verify BEFORE extracting: `shasum -a 256 -c sharpen-v$VERSION.tar.gz.sha256`
     (`sha256sum -c` on Linux), running it in that temp dir. Abort and report
     on mismatch; never run an artifact that fails its checksum.
   - Extract into the temp dir, then move atomically:
     `mkdir -p ~/.sharpen/app && mv <extracted> ~/.sharpen/app/$VERSION`.
     Afterwards delete other versions under `~/.sharpen/app/`.
   If the download is impossible (offline, blocked network, missing release),
   fall back to building from source; see Fallback below.
3. Start the server in the background:
   `node ~/.sharpen/app/$VERSION/server/server.mjs`
   It prints `sharpen listening on http://127.0.0.1:<port>` when ready
   (default port 4517, override with the `SHARPEN_PORT` env var).
4. Open the printed URL in the user's browser: `open <url>` on macOS,
   `xdg-open <url>` on Linux, `cmd.exe /c start <url>` on Windows.
5. Tell the user the arena is running and at which URL. Mention that closing
   this Claude Code session stops the server.
6. Update notice (best effort, never blocks or delays the launch): fetch
   `curl -fsSL -m 3 https://api.github.com/repos/juanwmedia/sharpen/releases/latest`
   and read its `tag_name` field (e.g. `v0.1.4`). If it names a newer version
   than `$VERSION`, tell the user a newer sharpen exists and that
   `/plugin update sharpen` gets it. On any fetch error or missing field,
   say nothing about updates.

## Fallback: build from source

The plugin ships the full source tree, so the arena can always be built
locally. Decide by looking at `${CLAUDE_PLUGIN_ROOT}/dist/index.html` and
`${CLAUDE_PLUGIN_ROOT}/node_modules`:

- Both present: start with `npm run start --prefix ${CLAUDE_PLUGIN_ROOT}`.
- `dist/` present, `node_modules` missing: run
  `npm ci --omit=dev --prefix ${CLAUDE_PLUGIN_ROOT}`, then start.
- `dist/` missing: tell the user this build takes about 2 minutes, then run
  `npm install --prefix ${CLAUDE_PLUGIN_ROOT}` and
  `npm run build --prefix ${CLAUDE_PLUGIN_ROOT}`, then start.

If an install or build fails, do not give up and do not dump raw npm output
at the user: read the error, diagnose (Node version, npm cache, network,
partial node_modules; deleting `node_modules` and retrying is a legitimate
fix), retry, and only then report what is wrong in plain words.

## Rules

- Do not keep polling the server or the game state. Once launched, your turn
  ends. The server owns the game loop.
- If the port is busy, retry once with `SHARPEN_PORT=4518`.
- If `claude` CLI is not on PATH, the arena still works but the mentor panel
  will show a setup notice; tell the user the mentor needs Claude Code
  installed and authenticated. On Windows the mentor needs the native
  Claude Code installer (`claude.exe`); the npm `.cmd` shim cannot be
  spawned by the server.
- Never edit source files under `${CLAUDE_PLUGIN_ROOT}`. The downloaded app
  lives in `~/.sharpen/app/<version>`; installing dependencies and building
  (`node_modules/`, `dist/`) are the only writes the fallback makes to the
  plugin tree.

## Scenario packages (pointer only)

This skill does **not** author challenges (see Rules: never edit the plugin
tree). If the user asks how scenarios are packaged, point them at
`${CLAUDE_PLUGIN_ROOT}/scenarios/package/FORMAT.md` and the example
`${CLAUDE_PLUGIN_ROOT}/scenarios/git/clean-sweep/`. Agents working in the
repo should follow `FORMAT.md` + `CLAUDE.md`, not this launch skill.
