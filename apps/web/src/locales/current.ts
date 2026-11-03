import type { Locale } from '@quiz/shared';
import { INTL_TAGS } from './locales';

/** Активна мова без словників: модуль годиться й для сервіс-воркера. */
let current: Locale = 'uk';
const listeners = new Set<() => void>();

export function currentLocale(): Locale {
  return current;
}

export function intlTag(locale?: Locale): string {
  return INTL_TAGS[locale ?? currentLocale()];
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Кличе лише i18n.activateLocale (і activateLocaleForTests): мова й словник змінюються разом. Сповіщає, лише коли мова інша. */
export function setCurrentLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  for (const listener of [...listeners]) listener();
}
