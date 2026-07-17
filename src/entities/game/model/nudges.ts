import { reactive } from 'vue'
import { DEFAULT_NUDGE_PREFS, type NudgePrefs } from '@engine/types.ts'
import { MENTOR_NUDGES_STORAGE_KEY } from '@/shared/config/index.ts'

function storedPrefs(): Partial<NudgePrefs> {
  try {
    return JSON.parse(localStorage.getItem(MENTOR_NUDGES_STORAGE_KEY) ?? '{}') as Partial<NudgePrefs>
  } catch {
    return {}
  }
}

// The poor man's user profile, same pattern as locale and run mode: a
// localStorage-backed preference, both signals ON by default.
export const nudgePrefs = reactive<NudgePrefs>({
  onChange: storedPrefs().onChange ?? DEFAULT_NUDGE_PREFS.onChange,
  onError: storedPrefs().onError ?? DEFAULT_NUDGE_PREFS.onError,
})

export function setNudgePref(key: keyof NudgePrefs, value: boolean): void {
  nudgePrefs[key] = value
  localStorage.setItem(MENTOR_NUDGES_STORAGE_KEY, JSON.stringify({ ...nudgePrefs }))
}
