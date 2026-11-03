import type { Locale } from '@quiz/shared';
import type { Issue } from './checks';

/**
 * Свідомі винятки з перевірок повноти: мова → вид перевірки → ключі.
 * Кожен ключ — з причиною в коментарі поруч. Спочатку порожньо.
 */
export const L10N_EXCEPTIONS: Record<Exclude<Locale, 'uk'>, Partial<Record<Issue['kind'], string[]>>> = {
  en: {},
  pl: {},
  de: {},
  es: {},
  it: {},
  ar: {},
};
