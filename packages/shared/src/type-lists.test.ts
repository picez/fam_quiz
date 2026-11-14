import { describe, expect, it } from 'vitest';
import {
  LETTER_TYPES,
  PUZZLES_ROUND_TYPES,
  PUZZLE_TYPES,
  QUESTION_TYPES,
  QUEST_TYPES,
  REVEAL_TYPES,
  RISK_TYPES,
  SCOPE_TYPES,
  SIMPLE_TYPES,
  SURVIVAL_TYPES,
  UNSCORED_TYPES,
  WIPEOUT_TYPES,
  factLimitMs,
  fitsPuzzlesRound,
  isPuzzle,
  isUnscored,
  proximityPartial,
  wholeRowQuestion,
  type Question,
  type Round,
} from './index';

describe('question type lists before the registry (30e)', () => {
  it('named lists, in their order', () => {
    expect(SIMPLE_TYPES).toEqual(['single', 'multi', 'boolean', 'text', 'numeric', 'slider']);
    expect(REVEAL_TYPES).toEqual(['single', 'text', 'numeric']);
    expect(UNSCORED_TYPES).toEqual(['poll', 'wordcloud']);
    expect(PUZZLE_TYPES).toEqual(['sudoku', 'crossword']);
    expect(PUZZLES_ROUND_TYPES).toEqual(['sudoku', 'crossword', 'jigsaw', 'spotdiff', 'memory']);
    expect(WIPEOUT_TYPES).toEqual(['single', 'boolean', 'numeric', 'text', 'slider']);
    expect(SURVIVAL_TYPES).toEqual(['single', 'boolean', 'numeric', 'text', 'slider']);
    expect(QUEST_TYPES).toEqual(['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'slider']);
    expect(RISK_TYPES).toEqual(['single', 'multi', 'boolean', 'text', 'numeric', 'slider', 'clues', 'pin']);
    expect(LETTER_TYPES).toEqual(['text', 'clues']);
    expect(SCOPE_TYPES).toEqual(['numeric', 'slider', 'pin']);
  });

  it('membership predicates over every type', () => {
    expect(QUESTION_TYPES.filter((type) => isPuzzle({ type }))).toEqual(['sudoku', 'crossword']);
    expect(QUESTION_TYPES.filter((type) => fitsPuzzlesRound({ type }))).toEqual(['sudoku', 'crossword', 'jigsaw', 'spotdiff', 'memory']);
    expect(QUESTION_TYPES.filter((type) => isUnscored({ type }))).toEqual(['poll', 'wordcloud']);
    expect(QUESTION_TYPES.filter((type) => proximityPartial({ type } as Question))).toEqual(['slider', 'pin', 'wall', 'survey']);
    expect(QUESTION_TYPES.filter((type) => wholeRowQuestion({ type } as Question))).toEqual([
      'timedlist',
      'letterwords',
      'moreless',
      'drawing',
      'sudoku',
      'crossword',
      'jigsaw',
      'spotdiff',
      'memory',
    ]);
  });

  it('factLimitMs: types whose speed does not count', () => {
    const round = { type: 'classic' } as Round;
    const question = (type: string) => ({ type, timeLimit: 30, video: null, choiceTime: 20 }) as Question;
    expect(QUESTION_TYPES.filter((type) => factLimitMs(question(type), round, false) === null)).toEqual([
      'wordladder',
      'timedlist',
      'letterwords',
      'moreless',
      'drawing',
      'sudoku',
      'crossword',
      'jigsaw',
      'spotdiff',
      'memory',
    ]);
    expect(factLimitMs(question('bluff'), round, false)).toBe(20 * 1000);
  });

  it('an unknown type belongs to no list', () => {
    expect(isUnscored({ type: 'nope' } as never)).toBe(false);
    expect(isPuzzle({ type: 'nope' } as never)).toBe(false);
    expect(fitsPuzzlesRound({ type: 'nope' } as never)).toBe(false);
  });
});
