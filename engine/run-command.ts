import { defineCommand } from 'just-bash'
import type { Command, ExecResult, IFileSystem } from 'just-bash'
import { callExport } from './ts-runtime.ts'

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0 })
const fail = (stderr: string, exitCode = 1): ExecResult => ({ stdout: '', stderr, exitCode })

/**
 * Arena `run`: execute a named export and print the result (player feedback,
 * like git status). Does not decide pass/fail; checks own that.
 *
 * Usage: run <entry> <exportName> [jsonArgs...]
 * Example: run src/price.ts formatPrice 100
 */
export function createRunCommand(opts: { jbFs: IFileSystem; dir: string }): Command {
  const { jbFs, dir } = opts
  return defineCommand('run', async (args) => {
    const entry = args[0]
    const exportName = args[1]
    if (!entry || !exportName) {
      return fail(
        'usage: run <entry.ts> <exportName> [arg]...\n' +
          'args after the export name are JSON values (numbers, strings, arrays).\n',
        1
      )
    }
    const rawArgs = args.slice(2)
    const callArgs: unknown[] = []
    for (const a of rawArgs) {
      try {
        callArgs.push(JSON.parse(a))
      } catch {
        callArgs.push(a)
      }
    }
    const result = await callExport(jbFs, dir, entry, exportName, callArgs)
    const lines: string[] = []
    if (result.stdout) lines.push(result.stdout)
    if (!result.ok) {
      lines.push(`Error: ${result.error}`)
      return { stdout: lines.join('\n') + (lines.length ? '\n' : ''), stderr: '', exitCode: 1 }
    }
    lines.push(`=> ${JSON.stringify(result.value)}`)
    return ok(lines.join('\n') + '\n')
  })
}
