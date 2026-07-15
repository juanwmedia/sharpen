<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
}>()

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const confirmEl = ref<HTMLButtonElement | null>(null)

function onKeydown(e: KeyboardEvent): void {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      confirmEl.value?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown)
    }
  }
)

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 grid place-items-center bg-[rgb(10_15_24_/_0.78)] px-5 backdrop-blur-[4px]"
      role="presentation"
      @click.self="emit('cancel')"
    >
      <div
        class="panel w-full max-w-[420px] px-[26px] py-[22px] shadow-[0_24px_60px_rgb(0_0_0_/_0.45)]"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'confirm-modal-title'"
      >
        <h2 id="confirm-modal-title" class="m-0 font-mono text-[17px] tracking-[-0.02em]">
          {{ title }}
        </h2>
        <p class="mt-2.5 mb-0 text-[14px] leading-relaxed text-muted">{{ body }}</p>
        <div class="mt-5 flex justify-end gap-2.5">
          <button
            class="cursor-pointer rounded-lg border border-line bg-transparent px-3.5 py-2 text-[13px] text-muted hover:border-accent hover:text-ink"
            type="button"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </button>
          <button
            ref="confirmEl"
            class="cursor-pointer rounded-lg border-none bg-ok px-3.5 py-2 text-[13px] font-semibold text-bg hover:brightness-110"
            type="button"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
