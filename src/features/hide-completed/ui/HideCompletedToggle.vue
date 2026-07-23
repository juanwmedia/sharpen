<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Toggle } from '@/shared/ui/index.ts'

const { t } = useI18n({ useScope: 'global' })
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label
    class="inline-flex cursor-pointer items-center gap-2.5 rounded-full border px-3 py-[6px] transition-colors duration-150"
    :class="
      model
        ? 'border-accent bg-accent-soft text-accent'
        : 'border-line bg-transparent text-faint hover:text-ink'
    "
  >
    <span class="font-mono text-[11px] uppercase tracking-[0.08em] whitespace-nowrap">
      {{ t('picker.hideCompleted') }}
    </span>
    <Toggle
      :model-value="model"
      :label="t('picker.hideCompleted')"
      @update:model-value="(v) => (model = v)"
    />
  </label>
</template>
