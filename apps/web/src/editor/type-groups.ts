import { type QuestionType } from './draft';

/** Групи типів запитань для комбобокса вибору типу (план 74). */
export type TypeGroupId = 'choice' | 'input' | 'media' | 'games' | 'polls';

/** Кожен із типів — рівно в одній групі; порядок груп і типів усередині — порядок у списку. */
export const TYPE_GROUPS: readonly { id: TypeGroupId; types: readonly QuestionType[] }[] = [
  { id: 'choice', types: ['single', 'multi', 'boolean', 'order', 'match', 'sort', 'slider'] },
  { id: 'input', types: ['text', 'numeric', 'chain', 'wordladder', 'letterwords', 'timedlist', 'wordle'] },
  { id: 'media', types: ['melody', 'videoclip', 'drawing', 'pin', 'jigsaw', 'spotdiff', 'memory'] },
  { id: 'games', types: ['clues', 'wall', 'moreless', 'survey', 'bluff', 'spy', 'thinkalike', 'think', 'crossword', 'sudoku'] },
  { id: 'polls', types: ['poll', 'wordcloud'] },
];

/** Лише дозволені типи; порядок груп і порядок усередині групи — як у TYPE_GROUPS; порожні групи відкинуто. */
export function groupedTypes(allowed: readonly QuestionType[]): { id: TypeGroupId; types: QuestionType[] }[] {
  return TYPE_GROUPS.map((group) => ({ id: group.id, types: group.types.filter((type) => allowed.includes(type)) })).filter((group) => group.types.length > 0);
}
