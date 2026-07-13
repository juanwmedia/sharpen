<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ player: string }>()
const imgBroken = ref(false)
</script>

<template>
  <a
    class="player-link"
    :href="`https://github.com/${encodeURIComponent(props.player)}`"
    target="_blank"
    rel="noopener noreferrer"
    :title="`Open ${props.player}'s GitHub profile`"
  >
    <span class="avatar">
      <span class="avatar-fallback">{{ props.player.slice(0, 2).toUpperCase() }}</span>
      <img
        v-if="!imgBroken"
        :src="`https://github.com/${encodeURIComponent(props.player)}.png?size=48`"
        alt=""
        loading="lazy"
        @error="imgBroken = true"
      />
    </span>
    {{ props.player }}
  </a>
</template>
