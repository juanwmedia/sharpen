<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { getChallengeBySlug } from '@challenges/index.ts'
import { registerRunLostHandler, useGame } from '@/entities/game/index.ts'
import { Chip } from '@/shared/ui/index.ts'
import { LearnPanel } from '@/widgets/learn-panel/index.ts'
import { MentorChat } from '@/widgets/mentor-chat/index.ts'
import { TerminalPane } from '@/widgets/terminal-pane/index.ts'
import { TimerRing } from '@/widgets/run-timer/index.ts'
import { VerdictPanel } from '@/widgets/verdict-panel/index.ts'
import { DEFAULT_TIME_LIMIT_MS, ROUTE_NAMES } from '@/shared/config/index.ts'
import { lt } from '@/shared/i18n/index.ts'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { state, startRun, leaveRun, askMentor, revealSolution, wipeLearn } = useGame()

// The URL owns the challenge: /challenge/<slug> starts a fresh run on entry,
// and an unknown slug goes home instead of showing an empty arena.
onMounted(() => {
  const challenge = getChallengeBySlug(String(route.params.slug ?? ''))
  if (!challenge) {
    void router.replace({ name: ROUTE_NAMES.picker })
    return
  }
  registerRunLostHandler(() => void router.replace({ name: ROUTE_NAMES.picker }))
  void startRun(challenge.id)
})

onBeforeUnmount(() => {
  registerRunLostHandler(() => {})
  leaveRun()
})

function backToPicker(): void {
  void router.push({ name: ROUTE_NAMES.picker })
}

const notYet = computed(() => (state.checks ? state.checks.some((c) => !c.pass) : false))
// The terminal is the pinned artifact: it stays put while the conversation
// below grows. The pin is a choice, not a cage.
const terminalPinned = ref(true)
</script>

<template>
  <main class="relative mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)_320px] gap-[22px] px-7 pt-[26px] pb-[60px] max-[980px]:grid-cols-1">
    <section class="grid content-start gap-4">
      <div v-if="state.challenge" class="panel px-[22px]">
        <div class="mb-1.5 flex items-center gap-3.5">
          <button
            class="cursor-pointer rounded-lg border border-line bg-transparent px-2.5 py-[3px] text-[15px] text-muted hover:border-accent hover:text-ink"
            type="button"
            :title="t('arena.back')"
            @click="backToPicker"
          >
            ←
          </button>
          <h2 class="m-0 font-mono text-[19px] tracking-[-0.02em]">{{ state.challenge.title }}</h2>
          <Chip>{{ t(`difficulty.${state.challenge.difficulty}`) }}</Chip>
        </div>
        <p class="mt-1 mb-2.5 text-muted">{{ lt(state.challenge.statement) }}</p>
        <div class="flex flex-wrap gap-2">
          <Chip v-for="cmd in state.challenge.focusCommands" :key="cmd" tone="ink">{{ cmd }}</Chip>
        </div>
      </div>
      <div :class="{ 'sticky top-3 z-10': terminalPinned }">
        <TerminalPane
          v-if="state.challenge"
          :key="state.runId ?? ''"
          :challenge-title="state.challenge.title"
          :pinned="terminalPinned"
          @toggle-pin="terminalPinned = !terminalPinned"
        />
      </div>
      <MentorChat :feed="state.mentorFeed" :busy="state.mentorBusy" :status="state.status" @ask="askMentor" />
    </section>

    <aside class="grid content-start gap-4">
      <TimerRing
        v-if="state.mode === 'challenge'"
        :status="state.status"
        :deadline="state.deadline"
        :total-ms="state.challenge?.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS"
        :not-yet="notYet"
      />
      <LearnPanel
        v-else
        :status="state.status"
        :mentor-busy="state.mentorBusy"
        @reveal="revealSolution"
        @wipe="wipeLearn"
      />
      <VerdictPanel :checks="state.checks" />
    </aside>

    <div
      v-if="state.countdownNum"
      class="fixed inset-0 z-10 grid place-items-center bg-[rgb(10_15_24_/_0.82)] backdrop-blur-[3px]"
    >
      <span
        :key="state.countdownNum"
        class="font-mono text-[140px] font-extrabold text-accent animate-drop-in motion-reduce:animate-none"
      >
        {{ state.countdownNum }}
      </span>
    </div>
  </main>
</template>
