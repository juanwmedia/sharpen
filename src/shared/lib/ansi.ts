// ANSI helpers for everything the arena writes into the terminal. The escape
// codes live here once; call sites read as prose.

const wrap = (open: string) => (text: string) => `\x1b[${open}m${text}\x1b[0m`

export const ansi = {
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  cyan: wrap('36'),
  /** 256-color sky blue, the FrontendLeap brand accent. */
  brand: wrap('38;5;39'),
  /** 256-color gray used for de-emphasized lines. */
  dim: wrap('38;5;245'),
} as const

export const CRLF = '\r\n'
