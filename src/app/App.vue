<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGame } from '@/entities/game/index.ts'
import { PlayerLink } from '@/entities/player/index.ts'
import { LanguageSwitch } from '@/features/language-switch/index.ts'
import { RunModeSwitch } from '@/features/run-mode-switch/index.ts'
import { ROUTE_NAMES } from '@/shared/config/index.ts'
import { Chip } from '@/shared/ui/index.ts'

const { t } = useI18n()
const { state, boot } = useGame()
onMounted(() => void boot())
</script>

<template>
  <header class="flex items-center justify-between border-b border-line px-7 py-4">
    <RouterLink
      :to="{ name: ROUTE_NAMES.picker }"
      class="font-mono text-[22px] font-extrabold tracking-[-0.04em] text-ink no-underline hover:text-accent"
    >
      sharpen<span class="ml-[3px] inline-block h-[3px] w-[11px] bg-accent align-baseline animate-caret-blink motion-reduce:animate-none"></span>
    </RouterLink>
    <div class="flex items-center gap-2">
      <Chip v-if="state.player" class="pl-[5px]"><PlayerLink :player="state.player" /></Chip>
      <Chip tone="dim">{{ t('app.engine', { version: state.engineVersion }) }}</Chip>
      <RunModeSwitch />
      <LanguageSwitch />
    </div>
  </header>
  <RouterView />
</template>
