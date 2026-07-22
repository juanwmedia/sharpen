<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGame } from '@/entities/game/index.ts'
import { PlayerLink } from '@/entities/player/index.ts'
import { LanguageSwitch } from '@/features/language-switch/index.ts'
import { RunModeSwitch } from '@/features/run-mode-switch/index.ts'
import { FRONTENDLEAP_URL, ROUTE_NAMES } from '@/shared/config/index.ts'
import { Chip } from '@/shared/ui/index.ts'

const { t } = useI18n({ useScope: 'global' })
const { state, boot } = useGame()
onMounted(() => void boot())
</script>

<template>
  <header
    class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-b border-line px-4 py-3 sm:px-7 sm:py-4"
  >
    <div class="flex min-w-0 items-center gap-2.5 sm:gap-3">
      <RouterLink
        :to="{ name: ROUTE_NAMES.picker }"
        class="font-mono text-[20px] font-extrabold tracking-[-0.04em] whitespace-nowrap text-ink no-underline hover:text-accent sm:text-[22px]"
      >
        sharpen<span class="ml-[3px] inline-block h-[3px] w-[11px] bg-accent align-baseline animate-caret-blink motion-reduce:animate-none"></span>
      </RouterLink>
      <!-- top nudge: the lowercase wordmark's optical mass sits below its line
           box center, so pure flex centering reads as "byline floats high". -->
      <a
        :href="FRONTENDLEAP_URL"
        target="_blank"
        rel="noopener"
        class="group relative top-[2px] flex items-center gap-[7px] no-underline"
      >
        <!-- Single source for the FL mark: public/brand/mark.svg (also the
             favicon and the README logo). -->
        <img src="/brand/mark.svg" alt="" class="h-[18px] w-[18px]" />
        <span class="hidden font-mono text-xs whitespace-nowrap text-muted transition-colors group-hover:text-ink sm:inline">{{ t('app.byline') }}</span>
      </a>
    </div>
    <div class="flex max-w-full flex-wrap items-center justify-end gap-2">
      <Chip v-if="state.player" class="pl-[5px]"><PlayerLink :player="state.player" /></Chip>
      <!-- Wrapper, not a class on Chip: Chip's root is always inline-flex, so
           hidden/md:inline-flex fight in the cascade and lose on small screens. -->
      <span class="hidden md:contents">
        <Chip tone="dim">{{ t('app.engine', { version: state.engineVersion }) }}</Chip>
      </span>
      <Chip v-if="state.updateAvailable" tone="accent" :title="t('app.updateHint')">
        {{ t('app.updateAvailable', { version: state.updateAvailable }) }}
      </Chip>
      <RunModeSwitch />
      <LanguageSwitch />
    </div>
  </header>
  <RouterView />
</template>
