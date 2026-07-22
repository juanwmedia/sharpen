<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { githubAvatarUrl, githubProfileUrl } from '../lib/github.ts'

const props = defineProps<{ player: string }>()
const { t } = useI18n({ useScope: 'global' })
const imgBroken = ref(false)
</script>

<template>
  <a
    class="group inline-flex items-center gap-[9px] rounded-md text-inherit no-underline outline-none hover:text-accent focus-visible:text-accent"
    :href="githubProfileUrl(props.player)"
    target="_blank"
    rel="noopener noreferrer"
    :title="t('player.profileTitle', { player: props.player })"
  >
    <span
      class="relative inline-grid h-[22px] w-[22px] flex-none place-items-center overflow-hidden rounded-full border border-line bg-surface-2 align-middle group-hover:border-accent"
    >
      <span class="font-mono text-[8.5px] font-bold tracking-[0.02em] text-muted">
        {{ props.player.slice(0, 2).toUpperCase() }}
      </span>
      <img
        v-if="!imgBroken"
        class="absolute inset-0 h-full w-full object-cover"
        :src="githubAvatarUrl(props.player)"
        alt=""
        loading="lazy"
        @error="imgBroken = true"
      />
    </span>
    <span class="hidden sm:inline">{{ props.player }}</span>
  </a>
</template>
