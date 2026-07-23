import { ref, watch, type Ref } from 'vue'
import { HIDE_COMPLETED_STORAGE_KEY } from '@/shared/config/index.ts'

function readStored(): boolean {
  try {
    return localStorage.getItem(HIDE_COMPLETED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Default off. When on, the picker hides scenarios in `state.completed`. */
export function useHideCompleted(): Ref<boolean> {
  const hide = ref(readStored())
  watch(hide, (value) => {
    try {
      localStorage.setItem(HIDE_COMPLETED_STORAGE_KEY, value ? '1' : '0')
    } catch {
      /* ignore */
    }
  })
  return hide
}
