<script setup lang="ts">
import { onMounted } from 'vue'
import ArenaScreen from './components/ArenaScreen.vue'
import PickerScreen from './components/PickerScreen.vue'
import PlayerLink from './components/PlayerLink.vue'
import { useGame } from './composables/useGame.ts'

const { state, boot } = useGame()
onMounted(() => void boot())
</script>

<template>
  <header class="topbar">
    <div class="brand">sharpen<span class="caret"></span></div>
    <div class="topbar-meta">
      <span v-if="state.player" class="chip with-avatar"><PlayerLink :player="state.player" /></span>
      <span class="chip dim">engine {{ state.engineVersion }}</span>
    </div>
  </header>
  <PickerScreen v-if="state.screen === 'picker'" />
  <ArenaScreen v-else />
</template>
