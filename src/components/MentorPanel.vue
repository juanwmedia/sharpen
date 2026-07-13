<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { MentorItem, RunStatus } from '../composables/useGame.ts'

const props = defineProps<{
  feed: readonly MentorItem[]
  busy: boolean
  status: RunStatus
  challengeTitle: string
  statement: string
}>()
const emit = defineEmits<{ ask: [question: string] }>()

const question = ref('')
const feedEl = ref<HTMLElement | null>(null)

// fl-next scroll ownership, simplified: follow the stream only when the
// reader is already near the bottom; never yank them up mid-read.
watch(
  () => props.feed.length + (props.feed[props.feed.length - 1]?.text.length ?? 0),
  async () => {
    const el = feedEl.value
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (nearBottom) {
      await nextTick()
      el.scrollTop = el.scrollHeight
    }
  }
)

function send(): void {
  const q = question.value.trim()
  if (!q) return
  question.value = ''
  emit('ask', q)
}
</script>

<template>
  <div class="mentor-card">
    <p class="eyebrow">mentor <span class="mentor-dot" :class="{ live: busy }"></span></p>
    <div ref="feedEl" class="mentor-feed">
      <!-- The challenge statement stays pinned while the conversation grows
           below it (pattern borrowed from FrontendLeap's pinned snippet). -->
      <div class="pinned-statement">
        <strong>{{ challengeTitle }}</strong>
        <span>{{ statement }}</span>
      </div>
      <p v-if="!feed.length" class="mentor-idle">
        Ask me here anytime. While the clock runs I only nudge, never spoil; when it ends, I teach.
      </p>
      <p
        v-for="(item, i) in feed"
        :key="i"
        class="msg"
        :class="{ you: item.role === 'you', system: item.role === 'system', thinking: item.role === 'thinking' }"
      >
        {{ item.text }}
      </p>
    </div>
    <form class="mentor-form" @submit.prevent="send">
      <input
        v-model="question"
        type="text"
        :placeholder="status === 'live' ? 'Ask for a nudge…' : 'Ask the mentor anything…'"
        autocomplete="off"
        maxlength="500"
      />
      <button type="submit">→</button>
    </form>
  </div>
</template>
