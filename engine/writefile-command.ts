import { defineCommand } from 'just-bash'
import type { Command, ExecResult, IFileSystem } from 'just-bash'
import { dirname } from './paths.ts'

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0 })
const fail = (stderr: string, exitCode = 1): ExecResult => ({ stdout: '', stderr, exitCode })

function decodeBase64(b64: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/**
 * writefile <path> <content...>
 * Prefer a single b64:<base64> payload so shell word-splitting cannot mangle
 * source. Plain text args are joined with spaces; \\n becomes newlines.
 */
export function createWritefileCommand(opts: { jbFs: IFileSystem; dir: string }): Command {
  const { jbFs, dir } = opts
  return defineCommand('writefile', async (args) => {
    const path = args[0]
    if (!path || args.length < 2) {
      return fail('usage: writefile <path> b64:<base64> | <content...>\n', 1)
    }
    const payload = args.slice(1).join(' ')
    let content: string
    if (payload.startsWith('b64:')) {
      content = decodeBase64(payload.slice(4))
    } else {
      content = payload.replace(/\\n/g, '\n')
    }
    const absolute = path.startsWith('/') ? path : `${dir}/${path}`
    const parent = dirname(absolute)
    if (!(await jbFs.exists(parent))) await jbFs.mkdir(parent, { recursive: true })
    await jbFs.writeFile(absolute, content)
    return ok()
  })
}
