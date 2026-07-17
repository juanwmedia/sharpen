import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Node custom loader: .md and .yaml imports yield `export default "<file text>"`. */
export async function load(url, context, nextLoad) {
  if (url.endsWith('.md') || url.endsWith('.yaml')) {
    const source = readFileSync(fileURLToPath(url), 'utf8')
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(source)}\n`,
    }
  }
  return nextLoad(url, context)
}
