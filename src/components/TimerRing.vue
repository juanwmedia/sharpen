<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { RunStatus } from '../composables/useGame.ts'

const props = defineProps<{ status: RunStatus; deadline: number; totalMs: number; notYet?: boolean }>()

const RING = 326.7 // 2πr for r=52
const remainingMs = ref(props.totalMs)
let raf = 0

function tick(): void {
  cancelAnimationFrame(raf)
  const step = () => {
    if (props.status === 'passed') return
    remainingMs.value = Math.max(0, props.deadline - Date.now())
    if (remainingMs.value > 0 && props.status === 'live') raf = requestAnimationFrame(step)
  }
  step()
}

watch(
  () => [props.status, props.deadline] as const,
  () => {
    if (props.status === 'live') tick()
    if (props.status === 'countdown') remainingMs.value = props.totalMs
    if (props.status === 'revealed') remainingMs.value = 0
  },
  { immediate: true }
)
onBeforeUnmount(() => cancelAnimationFrame(raf))

const seconds = computed(() => Math.max(0, Math.ceil(remainingMs.value / 1000)))
const dashOffset = computed(() => RING * (1 - remainingMs.value / props.totalMs))
const danger = computed(() => props.status === 'live' && remainingMs.value > 0 && remainingMs.value < 10_000)
const statusLabel = computed(() => {
  if (props.status === 'passed') return 'solved'
  if (props.status === 'revealed') return 'time out'
  if (props.status === 'live') return props.notYet ? 'not yet' : 'live'
  return 'get ready'
})
</script>

<template>
  <div class="timer-card">
    <div class="timer" :class="{ danger, done: status === 'passed' }">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle class="track" cx="60" cy="60" r="52" stroke-width="7" fill="none"></circle>
        <circle
          class="arc"
          cx="60"
          cy="60"
          r="52"
          stroke-width="7"
          fill="none"
          stroke-linecap="round"
          stroke-dasharray="326.7"
          :style="{ strokeDashoffset: dashOffset }"
        ></circle>
      </svg>
      <div class="timer-num">{{ seconds }}</div>
    </div>
    <div class="run-status" :class="{ pass: status === 'passed', fail: status === 'revealed' || (status === 'live' && notYet) }">
      {{ statusLabel }}
    </div>
  </div>
</template>
