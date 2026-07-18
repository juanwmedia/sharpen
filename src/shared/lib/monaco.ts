import { ref } from 'vue'

// Minimal CDN Monaco (same pattern as FL TutorSnippet). Idempotent load.

const MONACO_VS = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.41.0/min/vs'

const isMonacoLoaded = ref(false)
let loading: Promise<void> | null = null

export async function loadMonaco(): Promise<void> {
  if (typeof window === 'undefined') return
  if ((window as unknown as { monaco?: unknown }).monaco) {
    isMonacoLoaded.value = true
    return
  }
  if (loading) return loading

  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${MONACO_VS}/loader.min.js`
    script.onload = () => {
      const requireFn = (window as unknown as { require: { config: (c: unknown) => void; (m: string[], cb: () => void): void } }).require
      requireFn.config({ paths: { vs: MONACO_VS } })
      requireFn(['vs/editor/editor.main'], () => {
        isMonacoLoaded.value = true
        resolve()
      })
    }
    script.onerror = () => {
      loading = null
      reject(new Error('Failed to load Monaco editor'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export interface MonacoHandle {
  getCode(): string
  setCode(code: string): void
  focus(): void
  hasFocus(): boolean
  dispose(): void
}

export interface MonacoEditorOptions {
  /** Mod+Enter (Cmd on macOS, Ctrl elsewhere): same as the Run button. */
  onRun?: () => void
}

type MonacoNs = {
  KeyMod: { CtrlCmd: number }
  KeyCode: { Enter: number }
  editor: {
    create: (el: HTMLElement, opts: Record<string, unknown>) => MonacoEditor
  }
}

export function createMonacoEditor(
  container: HTMLElement,
  code: string,
  language = 'typescript',
  options: MonacoEditorOptions = {}
): MonacoHandle {
  const monaco = (window as unknown as { monaco: MonacoNs }).monaco
  if (!monaco) throw new Error('Monaco editor not available')

  const editor = monaco.editor.create(container, {
    value: code,
    language,
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    fontFamily: "'IBM Plex Mono', 'SF Mono', ui-monospace, monospace",
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    glyphMargin: false,
    fixedOverflowWidgets: true,
    padding: { top: 12, bottom: 12 },
    scrollbar: {
      vertical: 'visible',
      horizontal: 'visible',
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
  })

  if (options.onRun) {
    const run = options.onRun
    // CtrlCmd: Cmd on macOS, Ctrl on Win/Linux. Avoids browser reload (Mod+R).
    editor.addAction({
      id: 'sharpen.ts.run',
      label: 'Run',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => run(),
    })
  }

  return {
    getCode: () => editor.getValue(),
    setCode: (next) => editor.setValue(next),
    focus: () => {
      // editor.focus() alone often loses to a focused <input> (chat).
      const active = document.activeElement
      if (active instanceof HTMLElement && !editor.getDomNode()?.contains(active)) {
        active.blur()
      }
      editor.focus()
      editor.getDomNode()?.querySelector('textarea')?.focus()
    },
    hasFocus: () => editor.hasTextFocus(),
    dispose: () => editor.dispose(),
  }
}

interface MonacoEditor {
  getValue(): string
  setValue(v: string): void
  focus(): void
  hasTextFocus(): boolean
  getDomNode(): HTMLElement | null
  dispose(): void
  addAction(desc: {
    id: string
    label: string
    keybindings: number[]
    run: () => void
  }): void
}

export { isMonacoLoaded }
