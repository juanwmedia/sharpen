<script setup lang="ts">
import LeaderboardTable from './LeaderboardTable.vue'
import { useGame } from '../composables/useGame.ts'

const { state, startRun } = useGame()
</script>

<template>
  <main id="screen-select" class="screen">
    <section class="picker">
      <p class="eyebrow">git pack</p>
      <h1>Pick your challenge</h1>
      <p class="lede">
        60 seconds on the clock, a real repo in your browser, a Socratic mentor watching. Every
        <kbd>Enter</kbd> validates: run a command and the arena judges the repo state it leaves
        behind. Any correct solution passes.
      </p>
      <div class="cards">
        <button
          v-for="c in state.challenges"
          :key="c.id"
          class="card"
          type="button"
          @click="startRun(c.id)"
        >
          <div class="card-top">
            <h3>{{ c.title }}</h3>
            <span class="meta">{{ c.pack }} · {{ c.difficulty }} · {{ Math.round(c.timeLimitMs / 1000) }}s</span>
          </div>
          <p>{{ c.statement }}</p>
          <span class="go">→ enter the arena</span>
        </button>
      </div>
    </section>
    <aside class="board">
      <p class="eyebrow">leaderboard</p>
      <h2>Sharpest today</h2>
      <LeaderboardTable :rows="state.leaderboard" />
    </aside>
  </main>
</template>
