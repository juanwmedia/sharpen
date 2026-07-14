<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MENTOR_ROLE, RUN_STATUS } from '@/entities/game/index.ts'
import type { MentorItem, MentorRole, RunStatus } from '@/entities/game/index.ts'
import { CHAT_FOLLOW_THRESHOLD_PX, QUESTION_MAX_LENGTH } from '@/shared/config/index.ts'
import { Eyebrow } from '@/shared/ui/index.ts'

const props = defineProps<{
  feed: readonly MentorItem[]
  busy: boolean
  status: RunStatus
}>()
const emit = defineEmits<{ ask: [question: string] }>()

const { t } = useI18n()
const question = ref('')
const feedEl = ref<HTMLElement | null>(null)

const BUBBLE_CLASS: Record<MentorRole, string> = {
  [MENTOR_ROLE.mentor]: 'border border-line bg-surface-2 rounded-bl-[5px]',
  [MENTOR_ROLE.you]:
    'border border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-accent)_16%,var(--color-surface-2))] rounded-br-[5px]',
  [MENTOR_ROLE.youCmd]:
    'border border-[color-mix(in_srgb,var(--color-accent)_30%,var(--color-line))] bg-bg-deep font-mono text-[12.5px] text-term-ink rounded-br-[5px]',
  [MENTOR_ROLE.system]:
    'border border-[color-mix(in_srgb,var(--color-warn)_35%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-warn)_10%,var(--color-surface-2))] text-[12.5px] text-warn',
  [MENTOR_ROLE.thinking]:
    'border border-dashed border-line bg-surface-2 italic text-faint animate-thinking motion-reduce:animate-none',
}

function isMine(item: MentorItem): boolean {
  return item.role === MENTOR_ROLE.you || item.role === MENTOR_ROLE.youCmd
}

// Scroll ownership (fl-next pattern): follow the conversation only when the
// reader is already near the bottom; never yank them up mid-read.
watch(
  () => props.feed.length + (props.feed[props.feed.length - 1]?.text.length ?? 0),
  async () => {
    const el = feedEl.value
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < CHAT_FOLLOW_THRESHOLD_PX
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
  <div class="panel">
    <Eyebrow>
      {{ t('chat.eyebrow') }}
      <span
        class="inline-block h-2 w-2 rounded-full"
        :class="busy ? 'bg-ok animate-pulse-dot motion-reduce:animate-none' : 'bg-faint'"
      ></span>
    </Eyebrow>
    <div ref="feedEl" class="grid max-h-[46vh] gap-2.5 overflow-y-auto px-0.5 py-1">
      <p v-if="!feed.length" class="m-0 text-[13px] text-faint">{{ t('chat.idle') }}</p>
      <div v-for="(item, i) in feed" :key="i" class="flex" :class="{ 'justify-end': isMine(item) }">
        <div
          class="max-w-[76%] rounded-panel px-[13px] py-[9px] text-[13.5px] whitespace-pre-wrap [overflow-wrap:anywhere]"
          :class="BUBBLE_CLASS[item.role]"
        >
          <span v-if="item.role === MENTOR_ROLE.youCmd" class="mr-[7px] text-accent">➜</span>{{ item.text
          }}<span v-if="item.meta" class="mt-1 block font-mono text-[11.5px] text-err">{{ item.meta }}</span>
        </div>
      </div>
    </div>
    <form class="mt-3.5 flex gap-2" @submit.prevent="send">
      <input
        v-model="question"
        class="flex-1 rounded-lg border border-line bg-bg-deep px-3 py-2 font-sans text-[13px] text-ink focus:border-accent focus:outline-none"
        type="text"
        :placeholder="status === RUN_STATUS.live ? t('chat.placeholderLive') : t('chat.placeholderFree')"
        autocomplete="off"
        :maxlength="QUESTION_MAX_LENGTH"
      />
      <button
        class="w-[38px] cursor-pointer rounded-lg border-none bg-accent font-bold text-bg"
        type="submit"
        :aria-label="t('chat.send')"
      >
        →
      </button>
    </form>
  </div>
</template>
