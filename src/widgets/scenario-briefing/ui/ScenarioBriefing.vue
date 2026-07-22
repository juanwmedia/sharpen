<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Localized } from '@engine/types.ts'
import { Chip, Eyebrow } from '@/shared/ui/index.ts'
import { lt } from '@/shared/i18n/index.ts'
import { INLINE_MD_CLASS, renderInlineMd } from '@/shared/lib/inline-md.ts'

// Scenario copy carries inline markdown (bold + code); rendered HTML is
// escaped by renderInlineMd, so v-html stays safe.
const COPY_CLASS = `m-0 text-[15px] leading-relaxed text-muted [overflow-wrap:anywhere] ${INLINE_MD_CLASS}`

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

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <div class="grid min-w-0 gap-3.5">
    <details class="group min-w-0" :open="!collapsible || startOpen">
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
      <p :class="COPY_CLASS" v-html="renderInlineMd(lt(briefing))"></p>
      <pre
        class="m-0 mt-3.5 max-w-full overflow-x-auto rounded-lg border border-line bg-bg-deep px-3 py-3 font-mono text-[11.5px] leading-[1.45] text-ink whitespace-pre sm:px-3.5 sm:text-[12px]"
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
      <p :class="COPY_CLASS" v-html="renderInlineMd(lt(objective))"></p>
    </details>
    <div v-if="themes?.length" class="flex flex-wrap gap-2">
      <Chip v-for="theme in themes" :key="theme" tone="ink">{{ theme }}</Chip>
    </div>
  </div>
</template>
