<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { slugify } from '@scenarios/slug.ts'
import { useGame } from '@/entities/game/index.ts'
import { KIND_LOGOS, ROUTE_NAMES } from '@/shared/config/index.ts'
import { lt } from '@/shared/i18n/index.ts'
import { Eyebrow } from '@/shared/ui/index.ts'

const { t } = useI18n()
const router = useRouter()
const { state } = useGame()

function enterArena(c: { pack: string; title: string }): void {
  void router.push({
    name: ROUTE_NAMES.scenario,
    params: { pack: c.pack, slug: slugify(c.title) },
  })
}
</script>

<template>
  <main class="mx-auto max-w-[840px] px-7 pt-14 pb-20">
    <section>
      <Eyebrow>{{ t('picker.eyebrow') }}</Eyebrow>
      <h1 class="mb-3 font-mono text-[clamp(28px,4vw,40px)] tracking-[-0.03em]">{{ t('picker.title') }}</h1>
      <i18n-t
        :keypath="state.mode === 'challenge' ? 'picker.ledeChallenge' : 'picker.ledeLearn'"
        tag="p"
        class="max-w-[58ch] text-muted"
      >
        <template #enter><kbd>Enter</kbd></template>
      </i18n-t>
      <div class="mt-7 grid gap-3.5">
        <button
          v-for="c in state.scenarios"
          :key="c.id"
          class="panel flex cursor-pointer items-start justify-between gap-5 px-[22px] py-5 text-left text-ink transition-[border-color,transform] duration-150 outline-none hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-line))] focus-visible:-translate-y-px focus-visible:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-line))]"
          type="button"
          @click="enterArena(c)"
        >
          <div class="grid gap-2">
            <div class="flex items-baseline gap-3">
              <h3 class="m-0 font-mono text-[17px]">{{ c.title }}</h3>
              <span class="font-mono text-[11px] tracking-[0.1em] uppercase text-faint">
                {{
                  t('picker.meta', {
                    pack: c.pack,
                    difficulty: t(`difficulty.${c.difficulty}`),
                    seconds: Math.round(c.timeLimitMs / 1000),
                  })
                }}
              </span>
            </div>
            <p class="m-0 text-sm text-muted">{{ lt(c.objective) }}</p>
            <span class="mt-1 font-mono text-[12.5px] text-accent">{{ t('picker.enterArena') }}</span>
          </div>
          <img
            v-if="KIND_LOGOS[c.kind]"
            :src="KIND_LOGOS[c.kind]"
            :alt="c.kind"
            class="mt-1 h-9 w-9 shrink-0 select-none"
            draggable="false"
          />
        </button>
      </div>
    </section>
  </main>
</template>
