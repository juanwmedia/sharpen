<script setup lang="ts">
import { WTerm } from '@wterm/dom'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  execCommand,
  livePrompt,
  onCommand,
  registerPromptRefresher,
  registerTerminalWriter,
  submit,
  tabCandidates,
} from '@/entities/game/index.ts'
import { SWAP_SHORTCUT_LABEL, TERMINAL_COLS, TERMINAL_ROWS } from '@/shared/config/index.ts'
import { TermShell } from '@/shared/lib/bash-shell.ts'

defineProps<{ pinned?: boolean }>()
defineEmits<{ 'toggle-pin': [] }>()

const { t } = useI18n({ useScope: 'global' })
const host = ref<HTMLElement | null>(null)
let term: WTerm | null = null

// The page-level focus-swap shortcut drives these. wterm's focusable input
// lives inside the host, so containment answers "am I here".
defineExpose({
  focus: (): void => term?.focus(),
  hasFocus: (): boolean => !!host.value && host.value.contains(document.activeElement),
})

onMounted(async () => {
  if (!host.value) return
  // Rows stay fixed via #terminal height in CSS (TERMINAL_ROWS * row-height).
  // Cols follow the pane width (autoResize): a fixed 100-col grid was blowing
  // the whole arena past the viewport on phones.
  term = new WTerm(host.value, {
    cols: TERMINAL_COLS,
    rows: TERMINAL_ROWS,
    cursorBlink: true,
    autoResize: true,
  })
  await term.init()
  // wterm.init() focuses a textarea it marks aria-hidden (Chromium warns).
  // Expose it to AT and keep desktop autofocus; on phones blur so the first
  // tap is not stolen by an off-screen input.
  const hiddenInput = host.value.querySelector('textarea')
  if (hiddenInput) {
    hiddenInput.removeAttribute('aria-hidden')
    hiddenInput.setAttribute('aria-label', t('terminal.title'))
  }
  if (window.matchMedia('(max-width: 640px)').matches) hiddenInput?.blur()

  const shell = new TermShell({
    exec: execCommand,
    onCommand,
    onSubmit: () => submit(),
    tabCandidates,
    prompt: livePrompt,
  })
  term.onData = (data: string) => void shell.handleInput(data)
  shell.attach((data) => term?.write(data))
  registerTerminalWriter((data) => term?.write(data))
  // The pane can mount before the arena finishes booting (learn mode has no
  // briefing gate), so the store repaints the prompt when the branch lands.
  registerPromptRefresher(() => shell.refreshPrompt())
})

onBeforeUnmount(() => {
  registerTerminalWriter(() => {})
  registerPromptRefresher(null)
  term?.destroy()
})
</script>

<template>
  <div
    class="min-w-0 overflow-hidden rounded-panel border border-line-strong bg-bg-deep shadow-[0_24px_60px_rgb(4_8_16_/_0.55)] transition-[border-color] duration-150 focus-within:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-line-strong))]"
  >
    <div class="flex items-center gap-2 border-b border-line px-3 py-2.5 sm:px-3.5">
      <span class="h-[11px] w-[11px] shrink-0 rounded-full bg-[#ff5f57]"></span>
      <span class="h-[11px] w-[11px] shrink-0 rounded-full bg-[#febc2e]"></span>
      <span class="h-[11px] w-[11px] shrink-0 rounded-full bg-[#28c840]"></span>
      <span class="ml-2 min-w-0 truncate font-mono text-[11.5px] text-faint">{{ t('terminal.title') }}</span>
      <div class="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        <span class="hidden font-mono text-[11px] text-faint sm:inline">
          {{ t('terminal.hint', { enter: 'Enter' }) }}
        </span>
        <kbd :title="t('shortcut.swap')">{{ SWAP_SHORTCUT_LABEL }}</kbd>
        <button
          class="cursor-pointer rounded-[7px] border bg-transparent px-[7px] py-1 text-xs leading-none transition-[opacity,border-color] duration-150"
          :class="
            pinned
              ? 'border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-line))] opacity-100'
              : 'border-line opacity-55 hover:opacity-100'
          "
          type="button"
          :title="pinned ? t('terminal.unpin') : t('terminal.pin')"
          @click="$emit('toggle-pin')"
        >
          {{ pinned ? '📌' : '📍' }}
        </button>
      </div>
    </div>
    <div id="terminal" ref="host"></div>
  </div>
</template>
