<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { KIND_FILTERS, type KindFilterId } from '../model/filter.ts'

const { t } = useI18n({ useScope: 'global' })
const model = defineModel<KindFilterId>({ required: true })
</script>

<template>
  <div
    class="inline-flex max-w-full overflow-x-auto overflow-y-hidden rounded-full border border-line"
    role="group"
    :aria-label="t('picker.filterLabel')"
  >
    <button
      v-for="f in KIND_FILTERS"
      :key="f"
      class="cursor-pointer border-none bg-transparent px-3 py-[6px] font-mono text-[11px] uppercase tracking-[0.08em] whitespace-nowrap transition-colors duration-150"
      :class="model === f ? 'bg-accent-soft text-accent' : 'text-faint hover:text-ink'"
      type="button"
      :aria-pressed="model === f"
      @click="model = f"
    >
      {{ t(`picker.filter.${f}`) }}
    </button>
  </div>
</template>
