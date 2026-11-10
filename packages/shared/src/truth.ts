/** Префікс id згенерованого запитання раунду «Правда про гравця» (28b): `truth-<номер у колоді>`, непрозорий — не id автора. */
export const TRUTH_QUESTION_PREFIX = 'truth-';

/** Факт про себе: пробіли й переноси зведено до одного пробілу, краї обрізано (довжину міряє рушій). */
export function truthText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
