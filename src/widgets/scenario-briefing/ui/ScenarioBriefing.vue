<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Localized } from '@engine/types.ts'
import { Chip, Eyebrow } from '@/shared/ui/index.ts'
import { lt } from '@/shared/i18n/index.ts'

defineProps<{
  briefing: Localized
  tree: string
  objective: Localized
  themes?: readonly string[]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="grid gap-3.5">
    <div>
      <Eyebrow>{{ t('scenario.briefing') }}</Eyebrow>
      <p class="m-0 text-[14px] leading-relaxed text-muted">{{ lt(briefing) }}</p>
    </div>
    <pre
      class="m-0 overflow-x-auto rounded-lg border border-line bg-bg-deep px-3.5 py-3 font-mono text-[12px] leading-[1.45] text-ink whitespace-pre"
    >{{ tree }}</pre>
    <div>
      <Eyebrow>{{ t('scenario.objective') }}</Eyebrow>
      <p class="m-0 text-[14px] leading-relaxed text-muted">{{ lt(objective) }}</p>
    </div>
    <div v-if="themes?.length" class="flex flex-wrap gap-2">
      <Chip v-for="theme in themes" :key="theme" tone="ink">{{ theme }}</Chip>
    </div>
  </div>
</template>
