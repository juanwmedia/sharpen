<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RUN_STATUS } from '@/entities/game/index.ts'
import type { RunStatus } from '@/entities/game/index.ts'
import { ConfirmModal, Eyebrow } from '@/shared/ui/index.ts'

const props = defineProps<{
  status: RunStatus
  mentorBusy: boolean
}>()

const emit = defineEmits<{ reveal: []; wipe: [] }>()

const { t } = useI18n({ useScope: 'global' })
const revealOpen = ref(false)
const wipeOpen = ref(false)

const statusLabel = computed(() => {
  if (props.status === RUN_STATUS.passed) return t('learn.solved')
  if (props.status === RUN_STATUS.revealed) return t('learn.revealed')
  if (props.status === RUN_STATUS.live) return t('learn.practicing')
  return t('learn.ready')
})

const canReveal = computed(() => props.status === RUN_STATUS.live)
const inRun = computed(
  () =>
    props.status === RUN_STATUS.live ||
    props.status === RUN_STATUS.passed ||
    props.status === RUN_STATUS.revealed
)

function openReveal(): void {
  if (!canReveal.value || props.mentorBusy) return
  revealOpen.value = true
}

function openWipe(): void {
  if (!inRun.value || props.mentorBusy) return
  wipeOpen.value = true
}

function onRevealConfirm(): void {
  revealOpen.value = false
  emit('reveal')
}

function onWipeConfirm(): void {
  wipeOpen.value = false
  emit('wipe')
}
</script>

<template>
  <div class="panel grid gap-3.5 px-[18px] py-4">
    <Eyebrow>{{ t('learn.eyebrow') }}</Eyebrow>
    <div
      class="font-mono text-[12px] tracking-[0.14em] uppercase"
      :class="
        status === RUN_STATUS.passed || status === RUN_STATUS.revealed ? 'text-ok' : 'text-faint'
      "
    >
      {{ statusLabel }}
    </div>
    <div class="grid gap-2">
      <button
        v-if="canReveal"
        class="cursor-pointer rounded-lg border border-[color-mix(in_srgb,var(--color-ok)_40%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-ok)_12%,var(--color-surface-2))] px-3 py-2.5 font-mono text-[12.5px] text-ok transition-colors hover:border-ok disabled:cursor-not-allowed disabled:opacity-45"
        type="button"
        :disabled="mentorBusy"
        @click="openReveal"
      >
        {{ t('learn.reveal') }}
      </button>
      <button
        v-if="inRun"
        class="cursor-pointer rounded-lg border border-line bg-transparent px-3 py-2.5 font-mono text-[12.5px] text-muted transition-colors hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
        type="button"
        :disabled="mentorBusy"
        @click="openWipe"
      >
        {{ t('learn.wipe') }}
      </button>
    </div>
    <ConfirmModal
      :open="revealOpen"
      :title="t('revealModal.title')"
      :body="t('revealModal.body')"
      :confirm-label="t('revealModal.confirm')"
      :cancel-label="t('revealModal.cancel')"
      @confirm="onRevealConfirm"
      @cancel="revealOpen = false"
    />
    <ConfirmModal
      :open="wipeOpen"
      :title="t('wipeModal.title')"
      :body="t('wipeModal.body')"
      :confirm-label="t('wipeModal.confirm')"
      :cancel-label="t('wipeModal.cancel')"
      @confirm="onWipeConfirm"
      @cancel="wipeOpen = false"
    />
  </div>
</template>
