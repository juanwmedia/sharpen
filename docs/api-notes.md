# Verified API notes (read before touching engine/web code)

Facts below were verified against installed packages and the local `claude` CLI
(2.1.207) on 2026-07-13. Do not trust memory over these notes; re-verify on
dependency upgrades.

## just-bash 2.14.5 (pinned to v2: @wterm/just-bash 0.3.0 requires `just-bash@^2`)

- `new Bash({ fs, files, env, cwd, customCommands, commands })`: `fs` accepts
  any `IFileSystem`; `customCommands` takes `defineCommand(name, async (args, ctx) => ExecResult)`.
- `CommandContext`: `{ fs, cwd, env: Map, stdin, exec?, ... }`.
- `ExecResult`: `{ stdout, stderr, exitCode }`.
- `Bash.exec(command, { cwd })` is STATELESS between calls: cwd must be threaded
  by the caller. Verified: the result's `env.PWD` carries the FINAL working
  directory, so callers track `cd` by reading `result.env.PWD` after each exec.
  The upstream `@wterm/just-bash` shell instead RE-RUNS the whole command with
  output discarded to probe `pwd` (double side effects on `git commit`!): that
  is why we vendor the shell in `src/shared/lib/bash-shell.ts` and use
  `env.PWD`.
- `IFileSystem` (dist/fs/interface.d.ts): readFile/readFileBuffer/writeFile/
  appendFile/exists/stat/lstat/mkdir/readdir/rm(recursive,force)/cp/mv/
  symlink/readlink/chmod/utimes/resolvePath/getAllPaths. There is no
  unlink/rmdir; both map to `rm`.
- FS errors carry Node-style MESSAGES ("ENOENT: no such file or directory,
  open '/x'") but NO `.code` property: the bridge derives `code` from the
  message prefix.

## isomorphic-git 1.38.x

- `PromiseFsClient`: `{ promises: { readFile, writeFile, unlink, readdir,
  mkdir, rmdir, stat, lstat, readlink, symlink, chmod? } }`.
- Stat results MUST provide numeric `dev, ino, uid, gid, mode, size` and
  ctime/mtime (as `ctimeMs`/`mtimeMs` or Date): `normalizeStats` computes
  `x % MAX_UINT32`, so `undefined` poisons the index with NaN. Also needs
  `isFile()/isDirectory()/isSymbolicLink()` methods.
- Error handling keys off `err.code === 'ENOENT' | 'EEXIST' | ...`.
- No porcelain: reset/clean/reflog/rebase/revert are emulated in
  `engine/porcelain/`.

## @wterm/dom 0.3.0

- `new WTerm(element, { cols, rows, onData, cursorBlink })` then `await
  term.init()`; `term.write(data)`. WASM core is INLINED base64: omit
  `wasmUrl` and no asset copying is needed; esbuild bundles everything.
- `@wterm/just-bash`'s `BashShell` is NOT used directly (no way to inject fs or
  custom commands, plus the double-exec bug). Vendored + adapted under
  Apache-2.0 in `src/shared/lib/bash-shell.ts`.

## vue-i18n 11 (intlify message format)

- `@` and `|` are SPECIAL inside messages: a bare `@` starts a linked message
  and `|` splits plural forms. The offending message compiles lazily and
  throws `SyntaxError` at first render, which unmounts the whole component
  subtree (this silently killed TerminalPane via `you@sharpen`). Escape as
  `{'@'}` / `{'|'}`. Guarded by test/i18n.test.ts, which compiles every
  message of every locale with the real compiler.

## claude CLI (headless mentor)

- Verified flags: `-p`, `--model sonnet`, `--session-id <uuid>` (first turn),
  `--resume <id>` (later turns), `--tools ""` (disables ALL built-in tools,
  making the mentor text-only), `--output-format stream-json
  --include-partial-messages` for streaming, `--append-system-prompt`.
- Prompt goes via stdin to avoid argv size limits.
