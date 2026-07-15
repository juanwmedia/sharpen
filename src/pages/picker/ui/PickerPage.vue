<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { slugify } from '@challenges/slug.ts'
import { useGame } from '@/entities/game/index.ts'
import { ROUTE_NAMES } from '@/shared/config/index.ts'
import { lt } from '@/shared/i18n/index.ts'
import { Eyebrow } from '@/shared/ui/index.ts'
import { LeaderboardTable } from '@/widgets/leaderboard/index.ts'

const { t } = useI18n()
const router = useRouter()
const { state, refreshLeaderboard } = useGame()

onMounted(() => void refreshLeaderboard())

function enterArena(title: string): void {
  void router.push({ name: ROUTE_NAMES.challenge, params: { slug: slugify(title) } })
}
</script>

<template>
  <main class="mx-auto grid max-w-[1160px] grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] gap-12 px-7 pt-14 pb-20 max-[980px]:grid-cols-1">
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
          v-for="c in state.challenges"
          :key="c.id"
          class="panel grid cursor-pointer gap-2 px-[22px] py-5 text-left text-ink transition-[border-color,transform] duration-150 outline-none hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-line))] focus-visible:-translate-y-px focus-visible:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-line))]"
          type="button"
          @click="enterArena(c.title)"
        >
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
          <p class="m-0 text-sm text-muted">{{ lt(c.statement) }}</p>
          <span class="mt-1 font-mono text-[12.5px] text-accent">{{ t('picker.enterArena') }}</span>
        </button>
      </div>
    </section>
    <aside class="pt-[74px] max-[980px]:pt-0">
      <Eyebrow>{{ t('board.eyebrow') }}</Eyebrow>
      <h2 class="mb-4 font-mono text-[19px] tracking-[-0.02em]">{{ t('board.title') }}</h2>
      <LeaderboardTable :rows="state.leaderboard" />
    </aside>
  </main>
</template>
