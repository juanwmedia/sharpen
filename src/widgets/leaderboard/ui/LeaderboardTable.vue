<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { LeaderboardRow } from '@engine/types.ts'
import { PlayerLink } from '@/entities/player/index.ts'
import { LEADERBOARD_MAX_ROWS } from '@/shared/config/index.ts'

defineProps<{ rows: readonly LeaderboardRow[] }>()
const { t } = useI18n()

const TH_CLASS = 'border-b border-line px-2 py-1.5 text-left font-mono text-[10.5px] tracking-[0.12em] uppercase text-faint'
const TD_CLASS = 'border-b border-line px-2 py-[9px] text-[13.5px]'
</script>

<template>
  <table class="w-full border-collapse tabular-nums">
    <thead>
      <tr>
        <th :class="TH_CLASS">{{ t('board.rank') }}</th>
        <th :class="TH_CLASS">{{ t('board.engineer') }}</th>
        <th :class="TH_CLASS">{{ t('board.score') }}</th>
        <th :class="TH_CLASS">{{ t('board.solved') }}</th>
        <th :class="TH_CLASS">{{ t('board.best') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, i) in rows.slice(0, LEADERBOARD_MAX_ROWS)" :key="row.player">
        <td :class="TD_CLASS" class="w-[30px] font-mono text-accent">{{ i + 1 }}</td>
        <td :class="TD_CLASS" class="flex items-center"><PlayerLink :player="row.player" /></td>
        <td :class="TD_CLASS" class="font-mono font-bold">{{ row.score }}</td>
        <td :class="TD_CLASS">{{ row.solved }}/{{ row.attempts }}</td>
        <td :class="TD_CLASS">{{ row.bestMs === null ? '-' : `${(row.bestMs / 1000).toFixed(1)}s` }}</td>
      </tr>
    </tbody>
  </table>
  <p v-if="!rows.length" class="text-[13.5px] text-faint">{{ t('board.empty') }}</p>
</template>
