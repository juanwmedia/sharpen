<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { nudgePrefs, setNudgePref } from '@/entities/game/index.ts'
import { Eyebrow, Toggle } from '@/shared/ui/index.ts'

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <section class="panel">
    <Eyebrow>{{ t('mentorNudges.eyebrow') }}</Eyebrow>
    <div class="mt-3 grid gap-2.5">
      <label class="flex cursor-pointer items-center justify-between gap-3">
        <span class="text-[13px] text-muted">{{ t('mentorNudges.onChange') }}</span>
        <Toggle
          :model-value="nudgePrefs.onChange"
          :label="t('mentorNudges.onChange')"
          @update:model-value="(v) => setNudgePref('onChange', v)"
        />
      </label>
      <label class="flex cursor-pointer items-center justify-between gap-3">
        <span class="text-[13px] text-muted">{{ t('mentorNudges.onError') }}</span>
        <Toggle
          :model-value="nudgePrefs.onError"
          :label="t('mentorNudges.onError')"
          @update:model-value="(v) => setNudgePref('onError', v)"
        />
      </label>
    </div>
    <p class="mt-3 mb-0 text-[11.5px] leading-relaxed text-faint">{{ t('mentorNudges.note') }}</p>
  </section>
</template>
