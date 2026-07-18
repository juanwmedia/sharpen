import type { Locale, Localized } from '../../engine/types.ts'

/** Discriminator for which assembler understands setup/assert/spec. */
export type ScenarioKind = 'git' | 'ts'

export interface TsScenarioSpec {
  tree: string
  /** Main entry file players edit / run. */
  entry: string
}

export interface ScenarioManifest {
  schema: 2
  /** Immutable per-scenario version: bump on ANY published change. */
  version: number
  id: string
  kind: ScenarioKind
  pack: string
  title: Localized
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
  manifest: ScenarioManifest
  briefing: Record<Locale, string>
  objective: Record<Locale, string>
}

export const DEFAULT_TIME_LIMIT_MS = 60_000
