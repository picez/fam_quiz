import { describe, expect, it } from 'vitest';
import { LIMITS, ROUND_TYPES, type Question } from '@quiz/shared';
import { QUESTION_TYPES, maxTimeOf, minTimeOf, questionTypesFor } from './draft';

describe('editor type menu before the registry (30e)', () => {
  it('menu of every round', () => {
    const firm = ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'wordladder', 'sort', 'slider'];
    expect(Object.fromEntries(ROUND_TYPES.map((r) => [r, questionTypesFor(r)]))).toEqual({
      classic: [
        'single',
        'multi',
        'boolean',
        'text',
        'numeric',
        'order',
        'match',
        'chain',
        'wordladder',
        'sort',
        'slider',
        'clues',
        'pin',
        'wall',
        'poll',
        'wordcloud',
        'survey',
        'timedlist',
        'letterwords',
        'moreless',
        'drawing',
        'jigsaw',
        'spotdiff',
        'memory',
        'melody',
        'bluff',
      ],
      blitz: ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'sort', 'slider'],
      board: ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'sort', 'slider', 'clues', 'pin', 'wall', 'survey', 'timedlist', 'letterwords', 'moreless'],
      final: firm,
      bets: firm,
      auction: firm,
      truth: [
        'single',
        'multi',
        'boolean',
        'text',
        'numeric',
        'order',
        'match',
        'chain',
        'wordladder',
        'sort',
        'slider',
        'clues',
        'pin',
        'wall',
        'poll',
        'wordcloud',
        'survey',
        'timedlist',
        'letterwords',
        'moreless',
        'bluff',
      ],
      puzzles: ['sudoku', 'crossword', 'jigsaw', 'spotdiff', 'memory'],
      wipeout: ['single', 'boolean', 'numeric', 'text', 'slider'],
      survival: ['single', 'boolean', 'numeric', 'text', 'slider'],
      ladder: ['single'],
      quest: ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'slider'],
    });
  });

  it('time bounds of every type', () => {
    const plain = [LIMITS.minTime, LIMITS.maxTime];
    expect(Object.fromEntries(QUESTION_TYPES.map((type) => [type, [minTimeOf({ type }), maxTimeOf({ type })]]))).toEqual({
      single: plain,
      multi: plain,
      boolean: plain,
      text: plain,
      numeric: plain,
      order: plain,
      match: plain,
      chain: plain,
      wordladder: plain,
      sort: plain,
      slider: plain,
      clues: plain,
      pin: plain,
      wall: plain,
      poll: plain,
      wordcloud: plain,
      survey: plain,
      timedlist: plain,
      letterwords: plain,
      moreless: plain,
      drawing: plain,
      sudoku: [LIMITS.minTime, LIMITS.maxPuzzleTime],
      crossword: [LIMITS.minTime, LIMITS.maxPuzzleTime],
      jigsaw: [LIMITS.minJigsawTime, LIMITS.maxPuzzleTime],
      spotdiff: [LIMITS.minSpotdiffTime, LIMITS.maxPuzzleTime],
      memory: [LIMITS.minMemoryTime, LIMITS.maxPuzzleTime],
      melody: [LIMITS.minMelodyTime, LIMITS.maxTime],
      bluff: plain,
    });
  });

  it('falls back to the general bounds for an unknown type from an old draft', () => {
    const unknown = { type: 'gone' } as unknown as Pick<Question, 'type'>;
    expect([minTimeOf(unknown), maxTimeOf(unknown)]).toEqual([LIMITS.minTime, LIMITS.maxTime]);
  });
});
