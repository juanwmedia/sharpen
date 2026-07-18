import { parse as parseYaml } from 'yaml'
import { LOCALES, type Locale } from '../../engine/types.ts'
import type { ParsedScenarioMd, ScenarioKind, ScenarioManifest } from './types.ts'

const SECTION_RE = /^##\s+([A-Za-z][A-Za-z0-9 ]*?)\s*\((\w+)\)\s*$/gm

const KNOWN_KINDS = new Set<ScenarioKind>(['git', 'ts'])

function emptyLocalized(): Record<Locale, string> {
  return { en: '', es: '' }
}

function requireNonEmpty(label: string, value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`scenario.md: ${label} is empty`)
  return trimmed
}

function parseManifest(raw: unknown): ScenarioManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('scenario.md: frontmatter must be a YAML object')
  }
  const data = raw as Record<string, unknown>

  if (data.schema !== 2) {
    throw new Error(`scenario.md: unsupported schema ${String(data.schema)} (expected 2)`)
  }
  if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1) {
    throw new Error('scenario.md: version must be a positive integer (bump it on any published change)')
  }
  for (const key of ['id', 'kind', 'pack', 'difficulty'] as const) {
    if (typeof data[key] !== 'string' || !(data[key] as string).trim()) {
      throw new Error(`scenario.md: missing or invalid "${key}"`)
    }
  }

  const kind = data.kind as string
  if (!KNOWN_KINDS.has(kind as ScenarioKind)) {
    throw new Error(`scenario.md: unknown kind "${kind}" (known: ${[...KNOWN_KINDS].join(', ')})`)
  }

  const difficulty = data.difficulty as string
  if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') {
    throw new Error(`scenario.md: invalid difficulty "${difficulty}"`)
  }

  // Bilingual like briefing/objective; the slug keeps deriving from title.en.
  const rawTitle = data.title as Record<string, unknown> | null | undefined
  if (!rawTitle || typeof rawTitle !== 'object' || Array.isArray(rawTitle)) {
    throw new Error('scenario.md: title must be localized, e.g. { en: ..., es: ... }')
  }
  const title = emptyLocalized()
  for (const locale of LOCALES) {
    const value = rawTitle[locale]
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`scenario.md: missing or invalid "title.${locale}"`)
    }
    title[locale] = value.trim()
  }

  let timeLimitMs: number | undefined
  if (data.timeLimitMs !== undefined) {
    if (typeof data.timeLimitMs !== 'number' || !Number.isFinite(data.timeLimitMs) || data.timeLimitMs <= 0) {
      throw new Error('scenario.md: timeLimitMs must be a positive number')
    }
    timeLimitMs = data.timeLimitMs
  }

  let themes: string[] | undefined
  if (data.themes !== undefined) {
    if (!Array.isArray(data.themes) || data.themes.some((t) => typeof t !== 'string')) {
      throw new Error('scenario.md: themes must be a string array')
    }
    themes = data.themes as string[]
  }

  let spec: Record<string, unknown> | undefined
  if (data.spec !== undefined) {
    if (!data.spec || typeof data.spec !== 'object' || Array.isArray(data.spec)) {
      throw new Error('scenario.md: spec must be an object')
    }
    spec = data.spec as Record<string, unknown>
  }

  return {
    schema: 2,
    version: data.version,
    id: (data.id as string).trim(),
    kind: kind as ScenarioKind,
    pack: (data.pack as string).trim(),
    title,
    difficulty,
    ...(timeLimitMs !== undefined ? { timeLimitMs } : {}),
    ...(themes !== undefined ? { themes } : {}),
    ...(spec !== undefined ? { spec } : {}),
  }
}

function parseSections(body: string): {
  briefing: Record<Locale, string>
  objective: Record<Locale, string>
} {
  const briefing = emptyLocalized()
  const objective = emptyLocalized()
  const matches = [...body.matchAll(SECTION_RE)]

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!
    const name = match[1]!.trim().toLowerCase()
    const locale = match[2]!.trim().toLowerCase() as Locale
    if (!(LOCALES as readonly string[]).includes(locale)) {
      throw new Error(`scenario.md: unsupported locale "${locale}" in section heading`)
    }
    const start = match.index! + match[0].length
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : body.length
    const content = body.slice(start, end).trim()
    if (name === 'briefing') briefing[locale] = content
    else if (name === 'objective') objective[locale] = content
    else throw new Error(`scenario.md: unknown section "${match[1]}" (expected Briefing or Objective)`)
  }

  for (const locale of LOCALES) {
    requireNonEmpty(`Briefing (${locale})`, briefing[locale])
    requireNonEmpty(`Objective (${locale})`, objective[locale])
  }

  return { briefing, objective }
}

/** Parse schema-2 scenario.md (YAML frontmatter + localized sections). */
export function parseScenarioMd(source: string): ParsedScenarioMd {
  const trimmed = source.replace(/^\uFEFF/, '').trimStart()
  if (!trimmed.startsWith('---')) {
    throw new Error('scenario.md: missing YAML frontmatter (must start with ---)')
  }
  const end = trimmed.indexOf('\n---', 3)
  if (end === -1) {
    throw new Error('scenario.md: unterminated YAML frontmatter')
  }
  const yamlSrc = trimmed.slice(3, end).trim()
  const body = trimmed.slice(end + 4).trim()

  let raw: unknown
  try {
    raw = parseYaml(yamlSrc)
  } catch (err) {
    throw new Error(`scenario.md: invalid YAML frontmatter: ${(err as Error).message}`)
  }

  const manifest = parseManifest(raw)
  const { briefing, objective } = parseSections(body)
  return { manifest, briefing, objective }
}
