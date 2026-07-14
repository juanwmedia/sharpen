<script setup lang="ts">
import { WTerm } from '@wterm/dom'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { TermShell } from '../vendor/bash-shell.ts'
import { execCommand, onCommand, registerTerminalWriter, submit, tabCandidates, useGame } from '../composables/useGame.ts'

const props = defineProps<{ challengeTitle: string; pinned?: boolean }>()
defineEmits<{ 'toggle-pin': [] }>()

const { state } = useGame()
const host = ref<HTMLElement | null>(null)
let term: WTerm | null = null

onMounted(async () => {
  if (!host.value) return
  // Fixed geometry: 20 rows at the 20px row height equals the container
  // exactly, so a fresh terminal never shows a scrollbar. Long output rolls
  // into wterm's scrollback, which is when a scrollbar SHOULD appear.
  term = new WTerm(host.value, { cols: 100, rows: 20, cursorBlink: true, autoResize: false })
  await term.init()

  const shell = new TermShell({
    exec: execCommand,
    onCommand,
    onSubmit: () => submit(),
    tabCandidates,
    prompt: () =>
      `\x1b[38;5;209m➜\x1b[0m \x1b[36mrepo\x1b[0m \x1b[38;5;245mgit:(\x1b[0m\x1b[31m${state.branch}\x1b[38;5;245m)\x1b[0m `,
    greeting: [
      `\x1b[38;5;209msharpen arena\x1b[0m · ${props.challengeTitle}`,
      `\x1b[38;5;245mThe repo is real. The clock is not your friend. Every Enter validates.\x1b[0m`,
      '',
    ],
  })
  term.onData = (data: string) => void shell.handleInput(data)
  shell.attach((data) => term?.write(data))
  registerTerminalWriter((data) => term?.write(data))
  term.focus()
})

onBeforeUnmount(() => {
  registerTerminalWriter(() => {})
  term?.destroy()
})
</script>

<template>
  <div class="term-frame">
    <div class="term-bar">
      <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
      <span class="term-title">you@sharpen · /repo</span>
      <span class="term-hint">every <kbd>Enter</kbd> validates</span>
      <button
        class="pin-btn"
        :class="{ active: pinned }"
        type="button"
        :title="pinned ? 'Unpin terminal (scrolls with the page)' : 'Pin terminal (stays visible)'"
        @click="$emit('toggle-pin')"
      >
        {{ pinned ? '📌' : '📍' }}
      </button>
    </div>
    <div id="terminal" ref="host"></div>
  </div>
</template>
