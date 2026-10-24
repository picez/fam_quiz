import { answerKey } from '@quiz/shared';

/** Нормалізація текстової відповіді: той самий ключ, що й answerKey у схемі (перевірка написань «100 до 1»). */
export function normalizeText(value: string): string {
  return answerKey(value);
}
