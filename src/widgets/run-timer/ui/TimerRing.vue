<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RUN_STATUS } from '@/entities/game/index.ts'
import type { RunStatus } from '@/entities/game/index.ts'
import { TIMER_DANGER_MS } from '@/shared/config/index.ts'

const props = defineProps<{ status: RunStatus; deadline: number; totalMs: number; notYet?: boolean }>()

const { t } = useI18n({ useScope: 'global' })

const RING_SIZE = 120
const RING_RADIUS = 52
const RING_STROKE = 7
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const remainingMs = ref(props.totalMs)
let raf = 0

function tick(): void {
  cancelAnimationFrame(raf)
  const step = () => {
    if (props.status === RUN_STATUS.passed) return
    remainingMs.value = Math.max(0, props.deadline - Date.now())
    if (remainingMs.value > 0 && props.status === RUN_STATUS.live) raf = requestAnimationFrame(step)
  }
  step()
}

watch(
  () => [props.status, props.deadline] as const,
  () => {
    if (props.status === RUN_STATUS.live) tick()
    if (props.status === RUN_STATUS.countdown) remainingMs.value = props.totalMs
    if (props.status === RUN_STATUS.revealed) remainingMs.value = 0
  },
  { immediate: true }
)
onBeforeUnmount(() => cancelAnimationFrame(raf))

const seconds = computed(() => Math.max(0, Math.ceil(remainingMs.value / 1000)))
const dashOffset = computed(() => RING_CIRCUMFERENCE * (1 - remainingMs.value / props.totalMs))
const danger = computed(
  () => props.status === RUN_STATUS.live && remainingMs.value > 0 && remainingMs.value < TIMER_DANGER_MS
)
const solved = computed(() => props.status === RUN_STATUS.passed)
const failing = computed(
  () =>
    props.status === RUN_STATUS.revealed || (props.status === RUN_STATUS.live && (props.notYet ?? false))
)
const statusLabel = computed(() => {
  if (props.status === RUN_STATUS.passed) return t('timer.solved')
  if (props.status === RUN_STATUS.revealed) return t('timer.timeout')
  if (props.status === RUN_STATUS.live) return props.notYet ? t('timer.notYet') : t('timer.live')
  return t('timer.ready')
})
</script>

<template>
  <div class="panel grid justify-items-center gap-2.5">
    <div class="relative h-[120px] w-[120px]">
      <svg class="-rotate-90" :width="RING_SIZE" :height="RING_SIZE" :viewBox="`0 0 ${RING_SIZE} ${RING_SIZE}`">
        <circle
          class="stroke-line"
          :cx="RING_SIZE / 2"
          :cy="RING_SIZE / 2"
          :r="RING_RADIUS"
          :stroke-width="RING_STROKE"
          fill="none"
        ></circle>
        <circle
          class="transition-[stroke] duration-300"
          :class="danger ? 'stroke-err' : solved ? 'stroke-ok' : 'stroke-accent'"
          :cx="RING_SIZE / 2"
          :cy="RING_SIZE / 2"
          :r="RING_RADIUS"
          :stroke-width="RING_STROKE"
          fill="none"
          stroke-linecap="round"
          :stroke-dasharray="RING_CIRCUMFERENCE"
          :style="{ strokeDashoffset: dashOffset }"
        ></circle>
      </svg>
      <div
        class="absolute inset-0 grid place-items-center font-mono text-[32px] font-extrabold tabular-nums"
        :class="{ 'text-err animate-pulse-beat motion-reduce:animate-none': danger }"
      >
        {{ seconds }}
      </div>
    </div>
    <div
      class="font-mono text-[11.5px] tracking-[0.14em] uppercase"
      :class="solved ? 'text-ok' : failing ? 'text-err' : 'text-faint'"
    >
      {{ statusLabel }}
    </div>
  </div>
</template>
