import ts from 'typescript'
import type { IFileSystem } from 'just-bash'

// Deterministic TypeScript harness for kind=ts. Transpile-only (like FL's
// playground), then evaluate a named export with fixed args. No Jasmine:
// scenarios declare returns/throws predicates; this module is the engine.

export interface TsCallResult {
  ok: boolean
  value?: unknown
  error?: string
  stdout: string
}

/** Transpile a TS/JS source string to plain JS (ES2017, no modules). */
export function transpileTs(source: string, fileName = 'module.ts'): string {
  const out = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2017,
      module: ts.ModuleKind.CommonJS,
      strict: false,
      skipLibCheck: true,
      removeComments: false,
    },
    fileName,
    reportDiagnostics: false,
  })
  return out.outputText
}

type LoadedModule =
  | { ok: true; bag: Record<string, unknown>; stdout: string }
  | { ok: false; error: string; stdout: string }

async function loadModule(jbFs: IFileSystem, dir: string, entry: string): Promise<LoadedModule> {
  const absolute = entry.startsWith('/') ? entry : `${dir}/${entry}`
  let source: string
  try {
    source = await jbFs.readFile(absolute, 'utf8')
  } catch {
    return { ok: false, error: `file not found: ${entry}`, stdout: '' }
  }

  const logs: string[] = []
  const fakeConsole = {
    log: (...parts: unknown[]) => {
      logs.push(parts.map(String).join(' '))
    },
    error: (...parts: unknown[]) => {
      logs.push(parts.map(String).join(' '))
    },
    warn: (...parts: unknown[]) => {
      logs.push(parts.map(String).join(' '))
    },
    info: (...parts: unknown[]) => {
      logs.push(parts.map(String).join(' '))
    },
  }

  try {
    const js = transpileTs(source, entry)
    // CommonJS-ish bag: user code may assign exports.foo or module.exports.
    const module = { exports: {} as Record<string, unknown> }
    const exports = module.exports
    const fn = new Function('exports', 'module', 'console', `${js}\n; return module.exports;`)
    const bag = fn(exports, module, fakeConsole) as Record<string, unknown>
    return { ok: true, bag: bag ?? exports, stdout: logs.join('\n') }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message, stdout: logs.join('\n') }
  }
}

/** True when `exportName` is a function on the transpiled module. */
export async function hasNamedExport(
  jbFs: IFileSystem,
  dir: string,
  entry: string,
  exportName: string
): Promise<{ ok: boolean; error?: string }> {
  const loaded = await loadModule(jbFs, dir, entry)
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const target = loaded.bag[exportName]
  if (typeof target !== 'function') {
    return { ok: false, error: `export '${exportName}' is not a function in ${entry}` }
  }
  return { ok: true }
}

/**
 * Load a workspace file, transpile, and call `exportName(...args)`.
 * Captures console.log into stdout for the optional `run` porcelain.
 */
export async function callExport(
  jbFs: IFileSystem,
  dir: string,
  entry: string,
  exportName: string,
  args: unknown[]
): Promise<TsCallResult> {
  const loaded = await loadModule(jbFs, dir, entry)
  if (!loaded.ok) return { ok: false, error: loaded.error, stdout: loaded.stdout }
  const target = loaded.bag[exportName]
  if (typeof target !== 'function') {
    return {
      ok: false,
      error: `export '${exportName}' is not a function in ${entry}`,
      stdout: loaded.stdout,
    }
  }
  try {
    const value = (target as (...a: unknown[]) => unknown)(...args)
    return { ok: true, value, stdout: loaded.stdout }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message, stdout: loaded.stdout }
  }
}

/** List relative file paths under dir (non-.git), sorted. */
export async function listWorkspaceFiles(jbFs: IFileSystem, dir: string): Promise<string[]> {
  const out: string[] = []
  async function walk(abs: string, rel: string): Promise<void> {
    let entries: string[]
    try {
      entries = await jbFs.readdir(abs)
    } catch {
      return
    }
    for (const name of entries.sort()) {
      if (name === '.git') continue
      const childAbs = `${abs}/${name}`
      const childRel = rel ? `${rel}/${name}` : name
      const st = await jbFs.stat(childAbs)
      // just-bash stats expose booleans, not Node's isDirectory() methods.
      if (st.isDirectory) await walk(childAbs, childRel)
      else out.push(childRel)
    }
  }
  await walk(dir, '')
  return out
}
