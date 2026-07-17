import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

/** Vite/Vitest: treat .md and .yaml imports as `export default "<contents>"`. */
export function mdAsModulePlugin(): Plugin {
  return {
    name: 'sharpen-text-as-module',
    enforce: 'pre',
    load(id) {
      const file = id.split('?')[0] ?? id
      if (!file.endsWith('.md') && !file.endsWith('.yaml')) return null
      const source = readFileSync(file, 'utf8')
      return `export default ${JSON.stringify(source)}\n`
    },
  }
}
