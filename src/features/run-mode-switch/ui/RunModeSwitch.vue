<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RUN_MODES, type RunMode } from '@engine/types.ts'
import { RUN_STATUS, useGame } from '@/entities/game/index.ts'

const { t } = useI18n({ useScope: 'global' })
const { state, setRunMode } = useGame()

const locked = computed(() => state.status !== RUN_STATUS.idle)

function pick(mode: RunMode): void {
  if (locked.value) return
  setRunMode(mode)
}
</script>

<template>
  <div
    class="inline-flex overflow-hidden rounded-full border border-line"
    :class="{ 'opacity-55': locked }"
    role="group"
    :aria-label="t('mode.label')"
  >
    <button
      v-for="mode in RUN_MODES"
      :key="mode"
      class="border-none bg-transparent px-2.5 py-[5px] font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-150"
      :class="[
        state.mode === mode ? 'bg-accent-soft text-accent' : 'text-faint',
        locked ? 'cursor-not-allowed' : 'cursor-pointer hover:text-ink',
      ]"
      type="button"
      :aria-pressed="state.mode === mode"
      :disabled="locked"
      @click="pick(mode)"
    >
      {{ t(`mode.${mode}`) }}
    </button>
  </div>
</template>
