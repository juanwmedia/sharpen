import { DEFAULT_NUDGE_PREFS, type NudgePrefs, type Verdict } from '../engine/types.ts'

/** What the mentor gate remembers from the previous validated Enter. */
export interface NudgeBaseline {
  stateHash: string
  checksKey: string
}

/** Compact pass/fail fingerprint of a verdict, cheap to compare. */
export function checksKey(verdict: Verdict): string {
  return verdict.checks.map((c) => (c.pass ? '1' : '0')).join('')
}

export function baselineOf(verdict: Verdict): NudgeBaseline {
  return { stateHash: verdict.stateHash, checksKey: checksKey(verdict) }
}

/**
 * State-based mentor gate: a failed validation only deserves a nudge when the
 * Enter left a trace, and only for the signals the player keeps switched on.
 * Empty Enters and read-only commands (ls, cat, git status...) change neither
 * the repo hash nor the checks, so the mentor stays quiet without us ever
 * parsing the typed command (same philosophy as validation). The two signals
 * are engine-defined: for git, "the repo state moved" and "a command ran and
 * failed" (the client already filters typo noise out of the error flag).
 */
export function shouldNudge(
  prev: NudgeBaseline | null,
  verdict: Verdict,
  commandErrored: boolean,
  prefs: NudgePrefs = DEFAULT_NUDGE_PREFS
): boolean {
  if (prefs.onError && commandErrored) return true
  if (!prefs.onChange || !prev) return false
  return verdict.stateHash !== prev.stateHash || checksKey(verdict) !== prev.checksKey
}
