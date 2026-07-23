<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'default' | 'dim' | 'ink' | 'accent' | 'ok' | 'err' }>(), {
  tone: 'default',
})

const TONE_CLASS = {
  default:
    'border-line bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] text-muted',
  dim: 'border-line bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] text-faint',
  ink: 'border-line bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] text-ink',
  accent: 'border-line bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] text-accent',
  ok: 'border-line bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] text-ok',
  err: 'border-[color-mix(in_srgb,var(--color-err)_55%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-err)_18%,transparent)] text-err',
} as const
</script>

<template>
  <span
    class="inline-flex items-center gap-[7px] rounded-full border px-[11px] py-[5px] font-mono text-[11.5px]"
    :class="TONE_CLASS[tone]"
  >
    <slot />
  </span>
</template>
