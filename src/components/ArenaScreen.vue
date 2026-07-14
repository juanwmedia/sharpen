<script setup lang="ts">
import { computed, ref } from 'vue'
import ChatPanel from './ChatPanel.vue'
import TerminalPane from './TerminalPane.vue'
import TimerRing from './TimerRing.vue'
import VerdictPanel from './VerdictPanel.vue'
import { useGame } from '../composables/useGame.ts'

const { state, backToPicker, askMentor } = useGame()

const notYet = computed(() => (state.checks ? state.checks.some((c) => !c.pass) : false))
// The terminal is the pinned artifact: it stays put while the conversation
// below grows. The pin is a choice, not a cage.
const terminalPinned = ref(true)
</script>

<template>
  <main id="screen-run" class="screen">
    <section class="arena-main">
      <div class="statement">
        <div class="statement-head">
          <button class="ghost" type="button" title="Back to challenges" @click="backToPicker">←</button>
          <h2>{{ state.challenge?.title }}</h2>
          <span class="chip">{{ state.challenge?.difficulty }}</span>
        </div>
        <p>{{ state.challenge?.statement }}</p>
        <div class="focus-row">
          <span v-for="cmd in state.challenge?.focusCommands ?? []" :key="cmd" class="chip">{{ cmd }}</span>
        </div>
      </div>
      <div class="terminal-slot" :class="{ 'is-pinned': terminalPinned }">
        <TerminalPane
          v-if="state.challenge"
          :key="state.runId ?? ''"
          :challenge-title="state.challenge.title"
          :pinned="terminalPinned"
          @toggle-pin="terminalPinned = !terminalPinned"
        />
      </div>
      <ChatPanel :feed="state.mentorFeed" :busy="state.mentorBusy" :status="state.status" @ask="askMentor" />
    </section>

    <aside class="arena-side">
      <TimerRing
        :status="state.status"
        :deadline="state.deadline"
        :total-ms="state.challenge?.timeLimitMs ?? 60000"
        :not-yet="notYet"
      />
      <VerdictPanel :checks="state.checks" />
    </aside>

    <div v-if="state.countdownNum" class="countdown">
      <span :key="state.countdownNum">{{ state.countdownNum }}</span>
    </div>
  </main>
</template>
