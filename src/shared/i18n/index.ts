import { createI18n } from 'vue-i18n'
import { DEFAULT_LOCALE, LOCALES, type Locale, type Localized } from '@engine/types.ts'
import { LOCALE_STORAGE_KEY } from '../config/index.ts'
import en from './locales/en.ts'
import es from './locales/es.ts'

function storedLocale(): Locale {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (value && (LOCALES as readonly string[]).includes(value)) return value as Locale
  } catch {
    /* storage unavailable (private mode): fall through to the default */
  }
  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: storedLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { en, es },
})

/** t() usable outside components (the game store writes terminal lines). */
export const t = i18n.global.t

/** Picks the active language from author-written challenge content. Reactive
 * in templates: reading locale.value subscribes the component render. */
export function lt(text: Localized): string {
  return text[i18n.global.locale.value as Locale]
}

export function currentLocale(): Locale {
  return i18n.global.locale.value as Locale
}

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    /* storage unavailable: the choice just does not persist */
  }
}

export { DEFAULT_LOCALE, LOCALES, type Locale }
