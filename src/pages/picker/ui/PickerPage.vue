<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { slugify } from '@scenarios/slug.ts'
import { useGame } from '@/entities/game/index.ts'
import { KindFilter, useKindFilter } from '@/features/kind-filter/index.ts'
import { KIND_LOGOS, ROUTE_NAMES } from '@/shared/config/index.ts'
import { lt } from '@/shared/i18n/index.ts'
import { INLINE_MD_CLASS, renderInlineMd } from '@/shared/lib/inline-md.ts'
import { Chip, Eyebrow } from '@/shared/ui/index.ts'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const { state } = useGame()
const filter = useKindFilter()

const visible = computed(() =>
  filter.value === 'all'
    ? state.scenarios
    : state.scenarios.filter((c) => c.kind === filter.value),
)

function enterArena(c: { pack: string; title: { en: string } }): void {
  void router.push({
    name: ROUTE_NAMES.scenario,
    params: { pack: c.pack, slug: slugify(c.title.en) },
  })
}
</script>

<template>
  <main class="w-full px-4 pt-10 pb-16 sm:px-7 sm:pt-14 sm:pb-20">
    <section>
      <Eyebrow>{{ t('picker.eyebrow') }}</Eyebrow>
      <h1 class="mb-3 font-mono text-[clamp(26px,5vw,40px)] tracking-[-0.03em]">{{ t('picker.title') }}</h1>
      <p class="text-[15px] text-muted sm:text-base">
        {{ t(state.mode === 'challenge' ? 'picker.ledeChallenge' : 'picker.ledeLearn') }}
      </p>
      <div class="mt-6 mb-5 flex flex-wrap items-center justify-between gap-3">
        <KindFilter v-model="filter" />
        <span class="font-mono text-[11px] tracking-[0.08em] uppercase text-faint">
          {{ t('picker.count', { n: visible.length }) }}
        </span>
      </div>
      <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6">
        <button
          v-for="c in visible"
          :key="c.id"
          class="panel flex h-full cursor-pointer flex-col gap-3 px-4 py-4 text-left text-ink transition-[border-color,transform] duration-150 outline-none hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-line))] focus-visible:-translate-y-px focus-visible:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-line))] sm:px-5 sm:py-5"
          type="button"
          @click="enterArena(c)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h3 class="m-0 font-mono text-[16px] leading-snug sm:text-[17px]">{{ lt(c.title) }}</h3>
              <Chip v-if="state.completed.includes(c.id)" tone="ok">✓ {{ t('picker.done') }}</Chip>
            </div>
            <img
              v-if="KIND_LOGOS[c.kind]"
              :src="KIND_LOGOS[c.kind]"
              :alt="c.kind"
              class="mt-0.5 h-8 w-8 shrink-0 select-none sm:h-9 sm:w-9"
              draggable="false"
            />
          </div>
          <p
            :class="`m-0 line-clamp-3 text-[14px] leading-relaxed text-muted sm:text-[15px] ${INLINE_MD_CLASS}`"
            v-html="renderInlineMd(lt(c.objective))"
          ></p>
          <div class="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
            <span class="font-mono text-[11px] tracking-[0.08em] uppercase text-faint">
              {{
                t('picker.meta', {
                  pack: c.pack,
                  difficulty: t(`difficulty.${c.difficulty}`),
                  seconds: Math.round(c.timeLimitMs / 1000),
                })
              }}
            </span>
            <span class="font-mono text-[12.5px] text-accent">{{ t('picker.enterArena') }}</span>
          </div>
        </button>
      </div>
    </section>
  </main>
</template>
