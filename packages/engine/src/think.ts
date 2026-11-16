import { thinkStem, type ThinkWord } from '@quiz/shared';
import { textAccepts } from './check';

/** «Думай інакше» (35): вердикт відповіді учасника на розкритті — не збігся, збігся зі словом ведучого, нічого не написав. */
export type ThinkVerdict = 'safe' | 'hit' | 'empty';

/**
 * Індекс першого слова ведучого, з яким збігається відповідь (стебло = стеблу слова чи синоніма, або textAccepts на стеблах —
 * той самий допуск до одруківки, що в типі text: навмисна описка не рятує); порожня — null.
 */
export function thinkHit(words: readonly ThinkWord[], value: string): number | null {
  const typed = thinkStem(value);
  if (typed === '') return null;
  const index = words.findIndex((w) =>
    [w.word, ...w.synonyms].some((spelling) => {
      const stem = thinkStem(spelling);
      return stem !== '' && (stem === typed || textAccepts([stem], typed));
    }),
  );
  return index === -1 ? null : index;
}
