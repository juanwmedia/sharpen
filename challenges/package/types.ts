import type { Locale } from '../../engine/types.ts'

/** Discriminator for which assembler understands setup/assert/spec. */
export type ScenarioKind = 'git'

export interface ScenarioManifestV1 {
  schema: 1
  id: string
  kind: ScenarioKind
  pack: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  timeLimitMs?: number
  themes?: string[]
  /** Kind-specific open map. Unknown keys are ignored by other kinds. */
  spec?: Record<string, unknown>
}

export interface GitScenarioSpec {
  tree: string
}

export interface ParsedScenarioMd {
  manifest: ScenarioManifestV1
  briefing: Record<Locale, string>
  objective: Record<Locale, string>
}

export const DEFAULT_TIME_LIMIT_MS = 60_000
