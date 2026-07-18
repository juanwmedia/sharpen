<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { registerStatusSink, RUN_STATUS, useGame } from '@/entities/game/index.ts'
import { SWAP_SHORTCUT_LABEL, TS_RUN_SHORTCUT_LABEL } from '@/shared/config/index.ts'
import { createMonacoEditor, loadMonaco, type MonacoHandle } from '@/shared/lib/monaco.ts'

defineProps<{ pinned: boolean }>()
defineEmits<{ 'toggle-pin': [] }>()

const { t } = useI18n()
const { state, readArenaFile, runTsWorkspace } = useGame()

type ConsoleLine = { id: string; kind: 'log' | 'error' | 'result'; text: string; at: Date }

const root = ref<HTMLElement | null>(null)
const host = ref<HTMLElement | null>(null)
const consoleRef = ref<HTMLElement | null>(null)
const consoleExpanded = ref(false)
const messages = ref<ConsoleLine[]>([])
const busy = ref(false)
const loadError = ref('')
let monaco: MonacoHandle | null = null
let seedGeneration = 0

// Same contract as TerminalPane: ArenaPage Ctrl+` cycles workspace <-> chat.
// DOM containment only: Monaco's hasTextFocus can stay true after focus leaves.
defineExpose({
  focus: (): void => monaco?.focus(),
  hasFocus: (): boolean => !!root.value && root.value.contains(document.activeElement),
})

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function clearConsole(): void {
  messages.value = []
}

function pushLine(kind: ConsoleLine['kind'], text: string): void {
  messages.value.push({
    id: `${Date.now()}-${Math.random()}`,
    kind,
    text,
    at: new Date(),
  })
}

async function scrollConsoleToBottom(): Promise<void> {
  await nextTick()
  if (consoleRef.value) consoleRef.value.scrollTop = consoleRef.value.scrollHeight
}

function toggleConsole(): void {
  consoleExpanded.value = !consoleExpanded.value
}

/** Pull entry from the live arena; retry briefly after wipe/restart. */
async function seedFromArena(): Promise<void> {
  const entry = state.scenario?.tsProbe?.entry
  if (!entry || !monaco) return
  const gen = ++seedGeneration
  for (let i = 0; i < 40; i++) {
    if (gen !== seedGeneration) return
    const code = await readArenaFile(entry)
    if (code != null) {
      monaco.setCode(code)
      return
    }
    await new Promise((r) => setTimeout(r, 50))
  }
}

onMounted(async () => {
  registerStatusSink((kind, text) => {
    consoleExpanded.value = true
    pushLine(kind === 'ok' ? 'result' : kind === 'error' ? 'error' : 'log', text)
    void scrollConsoleToBottom()
  })
  if (!host.value) return
  try {
    await loadMonaco()
    monaco = createMonacoEditor(host.value, '', 'typescript', {
      onRun: () => {
        void onRun()
      },
    })
    await seedFromArena()
    monaco.focus()
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
})

onBeforeUnmount(() => {
  registerStatusSink(null)
  seedGeneration++
  monaco?.dispose()
  monaco = null
})

// Wipe / new run: reseed on runId only. Do not clear on pass/reveal or the
// solve line from registerStatusSink disappears.
watch(
  () => state.runId,
  (runId) => {
    if (!runId) return
    if (state.status !== RUN_STATUS.live && state.status !== RUN_STATUS.passed && state.status !== RUN_STATUS.revealed) {
      return
    }
    clearConsole()
    void seedFromArena()
  }
)

async function onRun(): Promise<void> {
  if (!monaco || busy.value) return
  busy.value = true
  clearConsole()
  consoleExpanded.value = true
  try {
    const { consoleText } = await runTsWorkspace(monaco.getCode())
    const lines = (consoleText || '').split('\n').filter(Boolean)
    if (!lines.length) pushLine('log', t('tsPane.consoleEmptyRun'))
    for (const line of lines) {
      const kind = line.startsWith('Error:') ? 'error' : line.startsWith('=>') ? 'result' : 'log'
      pushLine(kind, line)
    }
  } catch (err) {
    pushLine('error', err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
    await scrollConsoleToBottom()
  }
}
</script>

<template>
  <div
    ref="root"
    class="overflow-hidden rounded-panel border border-line-strong bg-bg-deep shadow-[0_24px_60px_rgb(4_8_16_/_0.55)] transition-[border-color] duration-150 focus-within:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-line-strong))]"
  >
    <div class="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
      <span class="h-[11px] w-[11px] rounded-full bg-[#ff5f57]"></span>
      <span class="h-[11px] w-[11px] rounded-full bg-[#febc2e]"></span>
      <span class="h-[11px] w-[11px] rounded-full bg-[#28c840]"></span>
      <span class="ml-2 min-w-0 truncate font-mono text-[11.5px] text-faint">
        {{ t('tsPane.windowTitle', { file: state.scenario?.tsProbe?.entry ?? '…' }) }}
      </span>
      <span class="ml-auto hidden shrink-0 items-center gap-1.5 font-mono text-[11px] text-faint sm:flex">
        {{ t('tsPane.hint') }}
        <kbd :title="t('tsPane.runShortcut')">{{ TS_RUN_SHORTCUT_LABEL }}</kbd>
      </span>
      <kbd class="shrink-0" :title="t('shortcut.swap')">{{ SWAP_SHORTCUT_LABEL }}</kbd>
      <button
        type="button"
        class="cursor-pointer rounded-[7px] border border-accent bg-accent/15 px-2.5 py-1 font-mono text-[12px] font-semibold text-accent hover:bg-accent/25 disabled:cursor-wait disabled:opacity-60"
        :disabled="busy || !!loadError"
        :title="t('tsPane.runShortcut')"
        @click="onRun"
      >
        {{ busy ? t('tsPane.running') : t('tsPane.run') }}
      </button>
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

    <p v-if="loadError" class="m-0 px-[18px] py-3 font-mono text-[13px] text-err">{{ loadError }}</p>
    <div ref="host" class="h-[340px] w-full" />

    <div class="border-t border-line bg-surface">
      <div
        class="flex cursor-pointer items-center justify-between px-[18px] py-3 transition-colors hover:bg-surface-2"
        @click="toggleConsole"
      >
        <div class="flex items-center gap-2">
          <span
            class="inline-block text-[12px] text-muted transition-transform duration-200"
            :class="consoleExpanded ? 'rotate-90' : 'rotate-0'"
          >▶</span>
          <span class="font-mono text-[13px] font-medium tracking-wide text-ink">{{
            t('tsPane.console')
          }}</span>
          <span
            v-if="messages.length"
            class="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted"
          >{{ messages.length }}</span>
        </div>
        <button
          v-if="consoleExpanded"
          type="button"
          class="cursor-pointer rounded px-2 py-1 font-mono text-[12px] text-muted hover:bg-surface-2 hover:text-ink"
          @click.stop="clearConsole"
        >
          {{ t('tsPane.consoleClear') }}
        </button>
      </div>

      <div
        v-if="consoleExpanded"
        ref="consoleRef"
        class="max-h-60 overflow-y-auto border-t border-line bg-bg-deep"
      >
        <div class="space-y-1 p-3 font-mono text-[12px] leading-relaxed">
          <div v-if="!messages.length" class="text-faint italic">
            {{ t('tsPane.consoleIdle') }}
          </div>
          <div v-for="msg in messages" :key="msg.id" class="py-0.5">
            <span class="select-none text-faint">[{{ formatTime(msg.at) }}]</span>
            <span
              class="ml-2 break-words"
              :class="{
                'text-err': msg.kind === 'error',
                'text-ok': msg.kind === 'result',
                'text-term-ink': msg.kind === 'log',
              }"
            >{{ msg.text }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
