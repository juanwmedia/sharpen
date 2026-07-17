#!/usr/bin/env node
// Release ritual: verify, build, bundle, smoke-test the artifact, publish.
//
// The artifact mirrors the repo layout (package.json at the root, then
// server/server.mjs next to dist/) so the server's own path resolution
// (dist static root, ENGINE_VERSION via require('../package.json')) works
// unchanged in both worlds. The launch skill downloads the tarball for the
// exact plugin version into ~/.sharpen/app/<version>.
//
// --dry-run: build, bundle and smoke-test, but skip the publish guards and
// the gh upload. Use it to rehearse the pipeline mid-work.
import { execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const SMOKE_PORT = 4519
const SMOKE_SCENARIO = 'git/clean-sweep'
const SMOKE_SOLUTION = 'git clean -fd'

const sh = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' })
const capture = (cmd) => execSync(cmd, { cwd: root }).toString().trim()
const fail = (msg) => {
  console.error(`release: ${msg}`)
  process.exit(1)
}
const step = (msg) => console.log(`\nrelease: ${msg}`)

// 1. Version: plugin.json is the single source; package.json must agree.
const plugin = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = plugin.version
if (pkg.version !== version) {
  fail(`version mismatch: plugin.json ${version} vs package.json ${pkg.version}`)
}
const tag = `v${version}`
const artifactName = `sharpen-${tag}.tar.gz`

// 2. Publish guards. A release ships exactly what origin/main says it ships.
if (!dryRun) {
  step('guards')
  if (capture('git status --porcelain') !== '') fail('working tree is dirty; commit first')
  if (capture(`git tag -l ${tag}`) !== '') fail(`local tag ${tag} already exists; bump the version`)
  if (capture(`git ls-remote --tags origin refs/tags/${tag}`) !== '') {
    fail(`remote tag ${tag} already exists; bump the version`)
  }
  sh('git fetch origin main --quiet')
  if (capture('git rev-parse HEAD') !== capture('git rev-parse origin/main')) {
    fail('HEAD is not origin/main; push first (releases build from published code)')
  }
  try {
    execSync('gh auth status', { cwd: root, stdio: 'ignore' })
  } catch {
    fail('gh is not authenticated; run `gh auth login`')
  }
}

// 3. Gates.
step('gates: npm test')
sh('npm test')
step('gates: npm run build (typecheck + vite)')
sh('npm run build')

// 4. Bundle. One plain-node file: no tsx, no node_modules on player machines.
step('bundling server.mjs')
const stage = mkdtempSync(join(tmpdir(), 'sharpen-release-'))
await build({
  entryPoints: [join(root, 'server/index.ts')],
  outfile: join(stage, 'server/server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  loader: { '.md': 'text', '.yaml': 'text' },
  // just-bash lazily requires optional native compression backends (zstd,
  // lzma). They are absent in the artifact on purpose: just-bash degrades
  // exactly like in the browser bundle, and no scenario offers those
  // commands. External keeps the requires lazy instead of failing the build.
  external: ['@mongodb-js/zstd', 'node-liblzma'],
  // Bundled CJS deps still call require() for node builtins at runtime;
  // esbuild's __require helper defers to a scope-level `require` when one
  // exists. Aliased import: the bundle itself also imports createRequire.
  banner: {
    js: "import { createRequire as __sharpenRequire } from 'node:module'; const require = __sharpenRequire(import.meta.url);",
  },
  logLevel: 'warning',
})
cpSync(join(root, 'dist'), join(stage, 'dist'), { recursive: true })
// ENGINE_VERSION reads ../package.json relative to server/server.mjs at runtime.
cpSync(join(root, 'package.json'), join(stage, 'package.json'))

// 5. Smoke-test the artifact itself: it must boot and solve a scenario
// through the API. A release that cannot play does not get published.
step('smoke-testing the bundle')
await smokeTest(stage)

// 6. Package.
step('packaging')
const outDir = mkdtempSync(join(tmpdir(), 'sharpen-artifact-'))
const artifactPath = join(outDir, artifactName)
sh(`tar -czf "${artifactPath}" -C "${stage}" package.json server dist`)
const sha = createHash('sha256').update(readFileSync(artifactPath)).digest('hex')
writeFileSync(`${artifactPath}.sha256`, `${sha}  ${artifactName}\n`)
rmSync(stage, { recursive: true, force: true })
console.log(`release: artifact ${artifactPath}`)
console.log(`release: sha256 ${sha}`)

// 7. Publish.
if (dryRun) {
  console.log('release: dry run, skipping gh release create; artifact kept for inspection')
  process.exit(0)
}
step(`publishing ${tag}`)
sh(`gh release create ${tag} "${artifactPath}" "${artifactPath}.sha256" --target main --title "sharpen ${tag}" --generate-notes`)
rmSync(outDir, { recursive: true, force: true })
// Publishing IS the announcement: the update check reads the latest release
// tag straight from GitHub, so there is no version feed to refresh.
console.log(`\nrelease: ${tag} published`)

async function smokeTest(stageDir) {
  const dataDir = mkdtempSync(join(tmpdir(), 'sharpen-smoke-'))
  const child = spawn(process.execPath, [join(stageDir, 'server/server.mjs')], {
    env: {
      ...process.env,
      SHARPEN_PORT: String(SMOKE_PORT),
      SHARPEN_DATA_DIR: dataDir,
      SHARPEN_NO_MENTOR: '1',
      SHARPEN_NO_UPDATE_CHECK: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.on('data', (c) => (log += c))
  child.stderr.on('data', (c) => (log += c))
  const base = `http://127.0.0.1:${SMOKE_PORT}`
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`smoke: ${msg}`)
  }
  try {
    await waitForBoot(child, base)

    const home = await fetch(`${base}/`)
    assert(home.ok, `GET / returned ${home.status}`)
    assert((home.headers.get('content-type') ?? '').includes('text/html'), 'GET / did not serve dist')

    const scenarios = await (await fetch(`${base}/api/scenarios`)).json()
    assert(
      Array.isArray(scenarios) && scenarios.some((s) => s.id === SMOKE_SCENARIO),
      `${SMOKE_SCENARIO} missing from /api/scenarios`
    )

    const created = await postJson(`${base}/api/runs`, {
      scenarioId: SMOKE_SCENARIO,
      mode: 'learn',
      locale: 'en',
      player: 'release-smoke',
    })
    await postJson(`${base}/api/runs/${created.runId}/start`, {})
    const cmd = await fetch(`${base}/api/runs/${created.runId}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: SMOKE_SOLUTION, output: '' }),
    })
    assert(cmd.ok, `command returned ${cmd.status}`)
    const verdict = await postJson(`${base}/api/runs/${created.runId}/submit`, {})
    assert(verdict.pass === true, `bundle cannot solve ${SMOKE_SCENARIO}: ${JSON.stringify(verdict.checks)}`)
    console.log('release: smoke ok (boot, dist, scenarios, solved run)')
  } catch (err) {
    console.error(log)
    throw err
  } finally {
    child.kill('SIGTERM')
    rmSync(dataDir, { recursive: true, force: true })
  }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`smoke: POST ${url} returned ${res.status}`)
  return res.json()
}

async function waitForBoot(child, base, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let exited = false
  child.on('close', () => (exited = true))
  while (Date.now() < deadline) {
    if (exited) throw new Error('smoke: server exited during boot')
    try {
      const res = await fetch(`${base}/api/meta`)
      if (res.ok) return
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('smoke: server did not come up in time')
}
