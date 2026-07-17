<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Localized } from '@engine/types.ts'
import { Chip, Eyebrow } from '@/shared/ui/index.ts'
import { lt } from '@/shared/i18n/index.ts'

// In the arena the sections collapse to save vertical space (challenge mode
// starts them closed: the modal was just read). The briefing modal renders
// them fixed open by leaving `collapsible` off.
withDefaults(
  defineProps<{
    briefing: Localized
    tree: string
    objective: Localized
    themes?: readonly string[]
    collapsible?: boolean
    startOpen?: boolean
  }>(),
  { collapsible: false, startOpen: true }
)

const { t } = useI18n()
</script>

<template>
  <div class="grid gap-3.5">
    <details class="group" :open="!collapsible || startOpen">
      <summary
        class="list-none [&::-webkit-details-marker]:hidden"
        :class="collapsible ? 'cursor-pointer select-none' : 'pointer-events-none'"
        :tabindex="collapsible ? undefined : -1"
      >
        <Eyebrow>
          {{ t('scenario.briefing') }}
          <span v-if="collapsible" class="text-faint transition-transform group-open:rotate-90">▸</span>
        </Eyebrow>
      </summary>
      <p class="m-0 text-[14px] leading-relaxed text-muted">{{ lt(briefing) }}</p>
      <pre
        class="m-0 mt-3.5 overflow-x-auto rounded-lg border border-line bg-bg-deep px-3.5 py-3 font-mono text-[12px] leading-[1.45] text-ink whitespace-pre"
      >{{ tree }}</pre>
    </details>
    <details class="group" :open="!collapsible || startOpen">
      <summary
        class="list-none [&::-webkit-details-marker]:hidden"
        :class="collapsible ? 'cursor-pointer select-none' : 'pointer-events-none'"
        :tabindex="collapsible ? undefined : -1"
      >
        <Eyebrow>
          {{ t('scenario.objective') }}
          <span v-if="collapsible" class="text-faint transition-transform group-open:rotate-90">▸</span>
        </Eyebrow>
      </summary>
      <p class="m-0 text-[14px] leading-relaxed text-muted">{{ lt(objective) }}</p>
    </details>
    <div v-if="themes?.length" class="flex flex-wrap gap-2">
      <Chip v-for="theme in themes" :key="theme" tone="ink">{{ theme }}</Chip>
    </div>
  </div>
</template>
