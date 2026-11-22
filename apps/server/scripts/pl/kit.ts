/**
 * Zestaw dla czterech polskich quizów (sidy `pl-light`, `pl-geo`, `pl-big`, `pl-fun`): pomocnicze funkcje pytań i wspólne ustawienia.
 * Identyfikatory pytaniom nadaje zbieracz w pliku quizu (tag), więc w treści pytań id nie są potrzebne.
 * Gry słowne oparte na ukraińskim słowniku (krzyżówka, „Zgadnij słowo”, drabina, „Słowa z liter”) tu nie występują.
 */
import { BUFF_KINDS, DEBUFF_KINDS, type Question, type QuizSettings } from '@quiz/shared';
import type { Cell } from '../mix-quiz';

export { bluff, bool, cell, chain, clues, match, multi, numeric, order, pin, rules, single, slider, sort, textQ, wall } from '../demo-quiz';
export { blank, cut, drawing, list, moreless, scatter, sudoku, yt, type Cell } from '../mix-quiz';
export { img, memory, melody, reveal } from '../mega/kit';
export { jigsaw } from '../mix2/kit';
export { clip, spy } from '../school3/kit';

/** Zdjęcia: klucz → adres na stronie (/uploads/…). */
export type Photos = (key: string) => string;

/** Pięć pól jednej kategorii planszy: ceny 100…500 według trudności (scatter rozkłada ×2/×3 i pole błyskawiczne losowo). */
export type Slot = Cell[];

/** „Więcej czy mniej” z krokiem: każde kolejne porównanie droższe o step. */
export const stepped = (question: Question, step: number): Question => (question.type === 'moreless' ? { ...question, step } : question);

/** Wspólne ustawienia: każdy gra na siebie, wyjaśnienia dla nowych, tryb rodzinny; bez bonusu „Podpowiedź prowadzącego” i „Zamiany pytania”. */
export const settings = (debuffPrices: QuizSettings['debuffPrices']): QuizSettings => ({
  leaderboard: 'each',
  newcomers: true,
  family: true,
  buffs: BUFF_KINDS.filter((b) => b !== 'hint' && b !== 'swap'),
  debuffs: [...DEBUFF_KINDS],
  debuffPrices,
  debuffShop: true,
});
