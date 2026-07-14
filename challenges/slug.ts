// URL slugs derive from the challenge TITLE (one slug across languages:
// challenge content is not translated). Deliberately ASCII-only and stable:
// slugs are public URLs.
const COMBINING_MARKS = /[\u0300-\u036f]/g

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
