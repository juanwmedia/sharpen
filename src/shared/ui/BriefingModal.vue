<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  open: boolean
  title: string
  difficulty: string
}>()

const emit = defineEmits<{ start: []; cancel: [] }>()

const { t } = useI18n()
const startEl = ref<HTMLButtonElement | null>(null)

function onKeydown(e: KeyboardEvent): void {
  if (!props.open) return
  // Escape leaves to the picker; it must never skip into the run.
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
      startEl.value?.focus()
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
      class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[rgb(10_15_24_/_0.78)] px-5 py-8 backdrop-blur-[4px]"
      role="presentation"
      @click.self="emit('cancel')"
    >
      <div
        class="panel w-full max-w-[560px] px-[26px] py-[22px] shadow-[0_24px_60px_rgb(0_0_0_/_0.45)]"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'briefing-modal-title'"
      >
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <h2 id="briefing-modal-title" class="m-0 font-mono text-[19px] tracking-[-0.02em]">
            {{ title }}
          </h2>
          <span class="rounded-lg border border-line px-2.5 py-[2px] font-mono text-[11px] tracking-[0.04em] text-muted">
            {{ difficulty }}
          </span>
        </div>
        <slot />
        <div class="mt-5 flex justify-end gap-2.5">
          <button
            class="cursor-pointer rounded-lg border border-line bg-transparent px-3.5 py-2 text-[13px] text-muted hover:border-accent hover:text-ink"
            type="button"
            @click="emit('cancel')"
          >
            {{ t('briefingModal.back') }}
          </button>
          <button
            ref="startEl"
            class="cursor-pointer rounded-lg border-none bg-ok px-3.5 py-2 text-[13px] font-semibold text-bg hover:brightness-110"
            type="button"
            @click="emit('start')"
          >
            {{ t('briefingModal.start') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
