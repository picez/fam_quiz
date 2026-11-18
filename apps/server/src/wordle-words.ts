import { roundQuestions, roundTrials, wordleKey, type Quiz } from '@quiz/shared';
import type { NounDictionary } from './wordladder/nouns';

/** Слова запитань wordle вікторини, яких немає в словнику (у порядку запитань); усі є — []. */
export function wordleUnknown(quiz: Quiz, nouns: NounDictionary): string[] {
  const unknown: string[] = [];
  for (const question of quiz.rounds.flatMap((round) => [...roundQuestions(round), ...roundTrials(round)])) {
    if (question.type !== 'wordle') continue;
    const key = wordleKey(question.word);
    if (key === null || !nouns.isNoun(key)) unknown.push(question.word);
  }
  return unknown;
}
