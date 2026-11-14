import type { Locale } from '@quiz/shared';
import ar from './strings/ar.json';
import de from './strings/de.json';
import en from './strings/en.json';
import es from './strings/es.json';
import it from './strings/it.json';
import pl from './strings/pl.json';

/** Тексти сповіщень: єдине джерело. Сервіс-воркер бере їх звідси (без i18n.ts, щоб не тягти весь словник у sw.js), i18n.ts розгортає їх у словник. */
export const pushStrings = {
  pushReminderTitle: 'Скоро гра «{title}»',
  pushReminderBody: 'Початок о {time}. Не запізнюйся!',
  pushOpenedTitle: 'Гра «{title}» почалась',
  pushOpenedBody: 'Ведучий відкрив гру. Торкнися, щоб приєднатися.',
  pushCancelledTitle: 'Гру «{title}» скасовано',
  pushCancelledBody: 'Ведучий скасував гру {when}.',
  pushFallbackTitle: 'Квіз',
  pushFallbackBody: 'Є оновлення щодо запланованої гри.',
  // Сторінка «Немає зв’язку» воркера (32): ні мережі, ні кешу.
  swOfflineTitle: 'Немає зв’язку',
  swOfflineBody: 'Сторінку не вдалося відкрити: немає інтернету або сервер недоступний.',
  swOfflineRetry: 'Спробувати ще раз',
} as const;

export type PushStringKey = keyof typeof pushStrings;

/** Копія LOCALES із shared (воркер не тягне shared); тест звіряє їх. */
export const LOCALE_CODES: readonly string[] = ['uk', 'en', 'pl', 'de', 'es', 'it', 'ar'];

/** uk — pushStrings, решта — JSON (спершу порожні: нема ключа → uk). Статичні імпорти: воркер не вантажить нічого динамічно. */
export const PUSH_STRINGS: Record<Locale, Partial<Record<PushStringKey, string>>> = { uk: pushStrings, en, pl, de, es, it, ar };

/** Невідоме чи відсутнє → uk. */
export function pushLocale(value: unknown): Locale {
  return typeof value === 'string' && LOCALE_CODES.includes(value) ? (value as Locale) : 'uk';
}

/** Тексти пуша мовою одержувача; невідома мова чи ключ без перекладу → uk. Без zod: воркер лишається малим. */
export function pushStringsFor(locale: unknown): (key: PushStringKey, vars?: Record<string, string>) => string {
  const dict = PUSH_STRINGS[pushLocale(locale)];
  return (key, vars = {}) => (dict[key] ?? pushStrings[key]).replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
