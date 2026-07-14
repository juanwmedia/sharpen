<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { LOCALES, setLocale, type Locale } from '@/shared/i18n/index.ts'

const { locale, t } = useI18n({ useScope: 'global' })

function pick(next: Locale): void {
  setLocale(next)
}
</script>

<template>
  <div
    class="inline-flex overflow-hidden rounded-full border border-line"
    role="group"
    :aria-label="t('lang.label')"
  >
    <button
      v-for="code in LOCALES"
      :key="code"
      class="cursor-pointer border-none bg-transparent px-2.5 py-[5px] font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-150"
      :class="locale === code ? 'bg-accent-soft text-accent' : 'text-faint hover:text-ink'"
      type="button"
      :aria-pressed="locale === code"
      @click="pick(code)"
    >
      {{ code }}
    </button>
  </div>
</template>
