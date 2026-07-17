<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { getChallengeByPackSlug } from '@challenges/index.ts'
import { RUN_STATUS, registerRunLostHandler, useGame } from '@/entities/game/index.ts'
import { MentorNudges } from '@/features/mentor-nudges/index.ts'
import { BriefingModal, Chip } from '@/shared/ui/index.ts'
import { LearnPanel } from '@/widgets/learn-panel/index.ts'
import { MentorChat } from '@/widgets/mentor-chat/index.ts'
import { ScenarioBriefing } from '@/widgets/scenario-briefing/index.ts'
import { TerminalPane } from '@/widgets/terminal-pane/index.ts'
import { TimerRing } from '@/widgets/run-timer/index.ts'
import { VerdictPanel } from '@/widgets/verdict-panel/index.ts'
import { DEFAULT_TIME_LIMIT_MS, ROUTE_NAMES, SWAP_SHORTCUT_CODES } from '@/shared/config/index.ts'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { state, prepareScenario, startRun, beginChallenge, leaveRun, askMentor, revealSolution, wipeLearn } =
  useGame()

const inBriefing = computed(() => state.status === RUN_STATUS.briefing)

const terminalPane = ref<InstanceType<typeof TerminalPane> | null>(null)
const chatPane = ref<InstanceType<typeof MentorChat> | null>(null)

// Ctrl + the physical key above Tab cycles focus terminal <-> chat, hands
// never leaving the keyboard. Capture phase: it must win over wterm's own
// key handling when the terminal has focus.
function onSwapShortcut(e: KeyboardEvent): void {
  if (!e.ctrlKey || e.metaKey || e.altKey || !SWAP_SHORTCUT_CODES.includes(e.code)) return
  if (inBriefing.value) return
  e.preventDefault()
  if (terminalPane.value?.hasFocus()) chatPane.value?.focus()
  else terminalPane.value?.focus()
}

// The URL owns the scenario: /:pack/:slug (e.g. /git/clean-sweep). Learn
// starts immediately; challenge waits on the briefing modal until Start.
onMounted(() => {
  const challenge = getChallengeByPackSlug(
    String(route.params.pack ?? ''),
    String(route.params.slug ?? '')
  )
  if (!challenge) {
    void router.replace({ name: ROUTE_NAMES.picker })
    return
  }
  registerRunLostHandler(() => void router.replace({ name: ROUTE_NAMES.picker }))
  window.addEventListener('keydown', onSwapShortcut, true)
  if (state.mode === 'challenge') {
    prepareScenario(challenge.id)
  } else {
    void startRun(challenge.id)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onSwapShortcut, true)
  registerRunLostHandler(() => {})
  leaveRun()
})

function backToPicker(): void {
  void router.push({ name: ROUTE_NAMES.picker })
}

async function onBriefingStart(): Promise<void> {
  await beginChallenge()
}

const notYet = computed(() => (state.checks ? state.checks.some((c) => !c.pass) : false))
// The terminal is the pinned artifact: it stays put while the conversation
// below grows. The pin is a choice, not a cage.
const terminalPinned = ref(true)
</script>

<template>
  <main class="relative mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)_320px] gap-[22px] px-7 pt-[26px] pb-[60px] max-[980px]:grid-cols-1">
    <section class="grid content-start gap-4">
      <div v-if="state.challenge && !inBriefing" class="panel px-[22px]">
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
        <ScenarioBriefing
          :briefing="state.challenge.briefing"
          :tree="state.challenge.tree"
          :objective="state.challenge.objective"
          :themes="state.challenge.themes"
          collapsible
          :start-open="state.mode === 'learn'"
        />
      </div>
      <template v-if="!inBriefing">
        <div :class="{ 'sticky top-3 z-10': terminalPinned }">
          <TerminalPane
            v-if="state.challenge"
            ref="terminalPane"
            :key="state.runId ?? ''"
            :pinned="terminalPinned"
            @toggle-pin="terminalPinned = !terminalPinned"
          />
        </div>
        <MentorChat
          ref="chatPane"
          :feed="state.mentorFeed"
          :busy="state.mentorBusy"
          :status="state.status"
          @ask="askMentor"
        />
      </template>
    </section>

    <aside v-if="!inBriefing" class="grid content-start gap-4">
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
      <MentorNudges />
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

    <BriefingModal
      v-if="state.challenge"
      :open="inBriefing"
      :title="state.challenge.title"
      :difficulty="t(`difficulty.${state.challenge.difficulty}`)"
      @start="onBriefingStart"
      @cancel="backToPicker"
    >
      <ScenarioBriefing
        :briefing="state.challenge.briefing"
        :tree="state.challenge.tree"
        :objective="state.challenge.objective"
        :themes="state.challenge.themes"
      />
    </BriefingModal>
  </main>
</template>
