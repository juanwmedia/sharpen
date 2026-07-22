<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Check } from '@engine/types.ts'
import { lt } from '@/shared/i18n/index.ts'
import { Eyebrow } from '@/shared/ui/index.ts'

defineProps<{ checks: readonly Check[] | null }>()
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <div class="panel">
    <Eyebrow>{{ t('verdict.eyebrow') }}</Eyebrow>
    <ul class="m-0 grid list-none gap-2 p-0">
      <li v-if="checks === null" class="text-[13px] text-faint">{{ t('verdict.loading') }}</li>
      <li
        v-for="check in checks ?? []"
        :key="check.name.en"
        class="relative pl-[22px] text-[13px]"
        :class="check.pass ? 'text-ink' : 'text-muted'"
      >
        <span class="absolute left-0 font-mono font-bold" :class="check.pass ? 'text-ok' : 'text-err'">
          {{ check.pass ? '✓' : '✗' }}
        </span>
        {{ lt(check.name) }}
        <span class="block text-[11.5px] text-faint">{{ lt(check.detail) }}</span>
      </li>
    </ul>
  </div>
</template>
