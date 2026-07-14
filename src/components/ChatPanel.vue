<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { MentorItem, RunStatus } from '../composables/useGame.ts'

const props = defineProps<{
  feed: readonly MentorItem[]
  busy: boolean
  status: RunStatus
}>()
const emit = defineEmits<{ ask: [question: string] }>()

const question = ref('')
const feedEl = ref<HTMLElement | null>(null)

// Scroll ownership (fl-next pattern): follow the conversation only when the
// reader is already near the bottom; never yank them up mid-read.
watch(
  () => props.feed.length + (props.feed[props.feed.length - 1]?.text.length ?? 0),
  async () => {
    const el = feedEl.value
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90
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
  <div class="chat-card">
    <p class="eyebrow">conversation <span class="mentor-dot" :class="{ live: busy }"></span></p>
    <div ref="feedEl" class="chat-feed">
      <p v-if="!feed.length" class="mentor-idle">
        Your commands and the mentor's replies land here as a conversation. While the clock runs the
        mentor only nudges, never spoils; when it ends, it teaches.
      </p>
      <div
        v-for="(item, i) in feed"
        :key="i"
        class="bubble-row"
        :class="{ mine: item.role === 'you' || item.role === 'you-cmd' }"
      >
        <div
          class="bubble"
          :class="{
            cmd: item.role === 'you-cmd',
            you: item.role === 'you',
            mentor: item.role === 'mentor',
            system: item.role === 'system',
            thinking: item.role === 'thinking',
          }"
        >
          <span v-if="item.role === 'you-cmd'" class="cmd-prompt">➜</span>{{ item.text }}
          <span v-if="item.meta" class="bubble-meta">{{ item.meta }}</span>
        </div>
      </div>
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
