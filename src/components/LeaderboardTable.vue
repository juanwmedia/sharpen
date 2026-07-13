<script setup lang="ts">
import type { LeaderboardRow } from '../../engine/types.ts'
import PlayerLink from './PlayerLink.vue'

defineProps<{ rows: readonly LeaderboardRow[] }>()
</script>

<template>
  <table id="leaderboard">
    <thead>
      <tr><th>#</th><th>engineer</th><th>score</th><th>solved</th><th>best</th></tr>
    </thead>
    <tbody>
      <tr v-for="(row, i) in rows.slice(0, 12)" :key="row.player">
        <td class="rank">{{ i + 1 }}</td>
        <td class="player"><PlayerLink :player="row.player" /></td>
        <td class="score">{{ row.score }}</td>
        <td>{{ row.solved }}/{{ row.attempts }}</td>
        <td>{{ row.bestMs === null ? '-' : `${(row.bestMs / 1000).toFixed(1)}s` }}</td>
      </tr>
    </tbody>
  </table>
  <p v-if="!rows.length" class="board-empty">No runs yet. Be the first blade on the stone.</p>
</template>
