import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

/** Vite/Vitest: treat .md imports as `export default "<contents>"`. */
export function mdAsModulePlugin(): Plugin {
  return {
    name: 'sharpen-md-as-module',
    enforce: 'pre',
    load(id) {
      const file = id.split('?')[0] ?? id
      if (!file.endsWith('.md')) return null
      const source = readFileSync(file, 'utf8')
      return `export default ${JSON.stringify(source)}\n`
    },
  }
}
