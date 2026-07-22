import { ref, watch, type Ref } from 'vue'
import { KIND_FILTER_STORAGE_KEY } from '@/shared/config/index.ts'

/** Picker pack filter. `all` is the default; other values match Scenario.kind. */
export const KIND_FILTERS = ['all', 'git', 'ts'] as const
export type KindFilterId = (typeof KIND_FILTERS)[number]

function readStored(): KindFilterId {
  try {
    const raw = localStorage.getItem(KIND_FILTER_STORAGE_KEY)
    if (raw && (KIND_FILTERS as readonly string[]).includes(raw)) return raw as KindFilterId
  } catch {
    /* private mode / blocked storage */
  }
  return 'all'
}

/** Reactive filter backed by localStorage. One watch, no page-level glue. */
export function useKindFilter(): Ref<KindFilterId> {
  const filter = ref<KindFilterId>(readStored())
  watch(filter, (value) => {
    try {
      localStorage.setItem(KIND_FILTER_STORAGE_KEY, value)
    } catch {
      /* ignore */
    }
  })
  return filter
}
