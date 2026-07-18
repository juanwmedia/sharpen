/** Tailwind utilities that style the tags renderInlineMd emits. One source:
 * briefing copy, picker objectives and mentor bubbles must look identical. */
export const INLINE_MD_CLASS =
  '[&_code]:rounded [&_code]:border [&_code]:border-line [&_code]:bg-bg-deep [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-ink [&_strong]:font-semibold [&_strong]:text-ink'

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Minimal inline markdown for scenario copy: `code` and **bold** only.
 * Escapes HTML first so authored documents can never inject markup; the
 * output is safe for v-html by construction.
 */
export function renderInlineMd(text: string): string {
  const escaped = text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]!)
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}
