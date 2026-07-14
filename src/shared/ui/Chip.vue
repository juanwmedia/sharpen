<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'default' | 'dim' | 'ink' }>(), { tone: 'default' })

const TONE_CLASS = {
  default: 'text-muted',
  dim: 'text-faint',
  ink: 'text-ink',
} as const
</script>

<template>
  <span
    class="inline-flex items-center gap-[7px] rounded-full border border-line bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] px-[11px] py-[5px] font-mono text-[11.5px]"
    :class="TONE_CLASS[tone]"
  >
    <slot />
  </span>
</template>
