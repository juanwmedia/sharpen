// Vendored and adapted from @wterm/just-bash v0.3.0 (Apache-2.0,
// vercel-labs/wterm). Changes for sharpen:
//  - The shell no longer owns a Bash instance: it delegates every command to
//    an injected `exec(command)` (our arena, which shares fs with git and
//    tracks cwd via env.PWD): this also fixes upstream's double-execution
//    cwd probe.
//  - `onCommand(command, result)` hook so the arena can report the transcript
//    and drive validation after every Enter.
//  - Empty-line Enter triggers `onSubmit()`: in the arena, every Enter
//    validates, an empty one included.

import type { ExecResult } from 'just-bash'

export interface TermShellOptions {
  exec: (command: string) => Promise<ExecResult>
  prompt: () => string
  greeting?: string[]
  onCommand?: (command: string, result: ExecResult) => Promise<void> | void
  onSubmit?: () => Promise<void> | void
  tabCandidates?: (word: string, isFirstWord: boolean) => Promise<string[]>
}

type Writer = (data: string) => void

export class TermShell {
  private _exec: TermShellOptions['exec']
  private _prompt: TermShellOptions['prompt']
  private _greeting: string[]
  private _onCommand: TermShellOptions['onCommand']
  private _onSubmit: TermShellOptions['onSubmit']
  private _tabCandidates: TermShellOptions['tabCandidates']
  private _write: Writer | null = null
  private _line = ''
  private _cursor = 0
  private _history: string[] = []
  private _historyPos = -1
  private _busy = false
  private _locked = false

  constructor(options: TermShellOptions) {
    this._exec = options.exec
    this._prompt = options.prompt
    this._greeting = options.greeting ?? []
    this._onCommand = options.onCommand
    this._onSubmit = options.onSubmit
    this._tabCandidates = options.tabCandidates
  }

  attach(write: Writer): void {
    this._write = write
    if (this._greeting.length) write(this._greeting.join('\r\n') + '\r\n')
    write(this._prompt())
  }

  lock(): void {
    this._locked = true
  }

  unlock(): void {
    this._locked = false
  }

  writeSystemLine(text: string): void {
    if (!this._write) return
    this._write(`\r\x1b[K${text}\r\n`)
    this._write(this._prompt() + this._line)
  }

  async handleInput(data: string): Promise<void> {
    if (!this._write || this._busy || this._locked) return
    const write = this._write

    if (data === '\r') {
      const command = this._line
      this._line = ''
      this._cursor = 0
      write('\r\n')
      if (!command.trim()) {
        if (this._onSubmit) await this._onSubmit()
        write(this._prompt())
        return
      }
      this._history.push(command)
      this._historyPos = -1
      this._busy = true
      try {
        const result = await this._exec(command)
        if (result.stdout) {
          write(result.stdout.replace(/\n/g, '\r\n'))
          if (!result.stdout.endsWith('\n')) write('\r\n')
        }
        if (result.stderr) {
          write(`\x1b[31m${result.stderr.replace(/\n/g, '\r\n')}\x1b[0m`)
          if (!result.stderr.endsWith('\n')) write('\r\n')
        }
        if (this._onCommand) await this._onCommand(command, result)
      } catch (err) {
        write(`\x1b[31m${err instanceof Error ? err.message : 'unknown error'}\x1b[0m\r\n`)
      } finally {
        this._busy = false
      }
      write(this._prompt())
      return
    }

    if (data === '\x7f' || data === '\b') {
      if (this._cursor > 0) {
        const tail = this._line.slice(this._cursor)
        this._line = this._line.slice(0, this._cursor - 1) + tail
        this._cursor--
        write('\b' + tail + '\x1b[K')
        if (tail.length > 0) write(`\x1b[${tail.length}D`)
      }
      return
    }

    if (data === '\x1b[A' || data === '\x1b[B') {
      if (!this._history.length) return
      if (data === '\x1b[A') {
        if (this._historyPos < 0) this._historyPos = this._history.length
        if (this._historyPos > 0) this._historyPos--
      } else {
        if (this._historyPos < 0) return
        this._historyPos++
      }
      let entry = ''
      if (this._historyPos >= 0 && this._historyPos < this._history.length) {
        entry = this._history[this._historyPos] ?? ''
      } else {
        this._historyPos = -1
      }
      write(`\r${this._prompt()}\x1b[K${entry}`)
      this._line = entry
      this._cursor = entry.length
      return
    }

    if (data === '\x1b[D') {
      if (this._cursor > 0) {
        this._cursor--
        write('\x1b[D')
      }
      return
    }
    if (data === '\x1b[C') {
      if (this._cursor < this._line.length) {
        this._cursor++
        write('\x1b[C')
      }
      return
    }
    if (data === '\x15') {
      if (this._cursor > 0) write(`\x1b[${this._cursor}D`)
      write('\x1b[K')
      this._line = ''
      this._cursor = 0
      return
    }
    if (data === '\x01') {
      if (this._cursor > 0) {
        write(`\x1b[${this._cursor}D`)
        this._cursor = 0
      }
      return
    }
    if (data === '\x05') {
      if (this._cursor < this._line.length) {
        write(`\x1b[${this._line.length - this._cursor}C`)
        this._cursor = this._line.length
      }
      return
    }
    if (data === '\x03') {
      this._line = ''
      this._cursor = 0
      write('^C\r\n')
      write(this._prompt())
      return
    }
    if (data === '\x0c') {
      write('\x1b[2J\x1b[H')
      write(this._prompt() + this._line)
      if (this._cursor < this._line.length) write(`\x1b[${this._line.length - this._cursor}D`)
      return
    }
    if (data === '\t') {
      await this._complete()
      return
    }

    if (data.length === 1 && data >= ' ') {
      const tail = this._line.slice(this._cursor)
      this._line = this._line.slice(0, this._cursor) + data + tail
      this._cursor++
      if (tail.length === 0) {
        write(data)
      } else {
        write(data + tail + '\x1b[K')
        write(`\x1b[${tail.length}D`)
      }
      return
    }

    if (data.length > 1) {
      for (const ch of data) await this.handleInput(ch)
    }
  }

  private async _complete(): Promise<void> {
    if (!this._tabCandidates || !this._write) return
    const write = this._write
    const parts = this._line.split(/\s+/)
    const word = parts[parts.length - 1] ?? ''
    let candidates: string[] = []
    try {
      candidates = await this._tabCandidates(word, parts.length <= 1)
    } catch {
      return
    }
    candidates = candidates.filter((c) => c.startsWith(word) && c !== word)
    if (!candidates.length) return
    if (candidates.length === 1) {
      const completion = (candidates[0] ?? '').slice(word.length)
      this._line += completion
      this._cursor += completion.length
      write(completion)
      return
    }
    let common = candidates[0] ?? ''
    for (const candidate of candidates.slice(1)) {
      while (!candidate.startsWith(common)) common = common.slice(0, -1)
    }
    const partial = common.slice(word.length)
    if (partial) {
      this._line += partial
      this._cursor += partial.length
      write(partial)
    } else {
      write('\r\n' + candidates.join('  ') + '\r\n')
      write(this._prompt() + this._line)
    }
  }
}
