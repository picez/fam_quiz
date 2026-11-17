import { LIMITS } from '@quiz/shared';

/** «Думай інакше» (35): синоніми з рядка «через кому» (редактор і пульт): обрізані, без порожніх, не більше дозволеного. */
export function parseSynonyms(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s !== '')
    .slice(0, LIMITS.maxThinkSynonyms);
}
