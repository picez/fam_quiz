import type { Locale } from '@quiz/shared';
import type { Issue } from './checks';

/**
 * Свідомі винятки з перевірок повноти: мова → вид перевірки → ключі.
 * Кожен ключ — з причиною в коментарі поруч. Спочатку порожньо.
 */
/** 27d: приклади слів і літер «Слів з літер» — українські (ґ/г, м’ясо, морква), тож кирилиця в цих текстах навмисна. */
const LETTER_WORD_EXAMPLES = ['question.letterwords.how.1', 'question.letterwords.points.0', 'question.letterwords.points.1', 'question.letterwords.points.2'];

export const L10N_EXCEPTIONS: Record<Exclude<Locale, 'uk'>, Partial<Record<Issue['kind'], string[]>>> = {
  en: { cyrillic: LETTER_WORD_EXAMPLES },
  pl: { cyrillic: LETTER_WORD_EXAMPLES },
  de: { cyrillic: LETTER_WORD_EXAMPLES },
  es: { cyrillic: LETTER_WORD_EXAMPLES },
  it: { cyrillic: LETTER_WORD_EXAMPLES },
  ar: { cyrillic: LETTER_WORD_EXAMPLES },
};
