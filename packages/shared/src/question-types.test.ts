import { describe, expect, it } from 'vitest';
import { LIMITS, QUESTION_TYPES, QUESTION_TYPE_TRAITS, ROUND_TYPES, questionSchema, typesWhere, type QuestionType } from './index';

const traitsOf = (type: string) => QUESTION_TYPE_TRAITS[type as QuestionType];

describe('question type registry (30e)', () => {
  it('has an entry per type, in editor order', () => {
    expect(Object.keys(QUESTION_TYPE_TRAITS)).toEqual([...QUESTION_TYPES]);
  });

  it('covers every type of questionSchema', () => {
    const types = questionSchema.options.map((o) => o.shape.type.value);
    for (const type of types) expect(Object.keys(QUESTION_TYPE_TRAITS)).toContain(type);
    expect(types).toHaveLength(Object.keys(QUESTION_TYPE_TRAITS).length);
  });

  it('time bounds match the zod variants', () => {
    for (const option of questionSchema.options) {
      const { time } = traitsOf(option.shape.type.value);
      expect([option.shape.type.value, option.shape.timeLimit.minValue, option.shape.timeLimit.maxValue]).toEqual([
        option.shape.type.value,
        LIMITS[time.min],
        LIMITS[time.max],
      ]);
    }
  });

  it('pins every trait set', () => {
    expect(typesWhere((t) => t.simple)).toEqual(['single', 'multi', 'boolean', 'text', 'numeric', 'slider']);
    expect(typesWhere((t) => t.reveal)).toEqual(['single', 'text', 'numeric']);
    expect(typesWhere((t) => t.unscored)).toEqual(['poll', 'wordcloud']);
    expect(typesWhere((t) => t.puzzle)).toEqual(['sudoku', 'crossword']);
    expect(typesWhere((t) => t.proximity)).toEqual(['slider', 'pin', 'wall', 'survey']);
    expect(typesWhere((t) => t.wholeRow)).toEqual(['timedlist', 'letterwords', 'moreless', 'drawing', 'sudoku', 'crossword', 'jigsaw', 'spotdiff', 'memory']);
    expect(typesWhere((t) => !t.speed)).toEqual(['wordladder', 'timedlist', 'letterwords', 'moreless', 'drawing', 'sudoku', 'crossword', 'jigsaw', 'spotdiff', 'memory']);
    // Склад — з live.ts (PROGRESS_TYPES, UNGRADABLE); порядок — QUESTION_TYPES (там списки лише для includes).
    const progress = ['chain', 'wordladder', 'sort', 'wall', 'timedlist', 'letterwords', 'moreless', 'drawing', 'sudoku', 'crossword', 'jigsaw', 'spotdiff', 'memory', 'bluff'];
    expect(typesWhere((t) => t.progress)).toEqual(progress);
    expect(typesWhere((t) => !t.hostGraded)).toEqual(['chain', 'wordladder', 'sort', 'wall', 'survey', 'timedlist', 'letterwords', 'moreless', 'drawing', 'sudoku', 'crossword', 'jigsaw', 'spotdiff', 'memory', 'bluff']);
    expect(typesWhere((t) => t.teamWide)).toEqual(['timedlist', 'letterwords', 'drawing', 'sudoku', 'crossword', 'jigsaw', 'spotdiff', 'memory', 'melody']);
    expect(typesWhere((t) => t.buffs.risk)).toEqual(['single', 'multi', 'boolean', 'text', 'numeric', 'slider', 'clues', 'pin']);
    expect(typesWhere((t) => t.buffs.letter)).toEqual(['text', 'clues']);
    expect(typesWhere((t) => t.buffs.scope)).toEqual(['numeric', 'slider', 'pin']);
  });

  it('rounds give the editor menu', () => {
    const firm = ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'wordladder', 'sort', 'slider'];
    const menu = {
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
      wipeout: ['single', 'boolean', 'text', 'numeric', 'slider'],
      survival: ['single', 'boolean', 'text', 'numeric', 'slider'],
      ladder: ['single'],
      quest: ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'slider'],
    };
    expect(Object.fromEntries(ROUND_TYPES.map((r) => [r, typesWhere((t) => t.rounds.includes(r))]))).toEqual(menu);
    const lead: QuestionType[] = ['single', 'boolean', 'numeric'];
    expect(typesWhere((t) => t.rounds.includes('wipeout'), lead)).toEqual(['single', 'boolean', 'numeric', 'text', 'slider']);
    expect(typesWhere((t) => t.rounds.includes('survival'), lead)).toEqual(['single', 'boolean', 'numeric', 'text', 'slider']);
  });

  it('typesWhere keeps editor order, puts passing lead types first and returns a new array', () => {
    expect(typesWhere((_, type) => type === 'bluff' || type === 'single' || type === 'pin')).toEqual(['single', 'pin', 'bluff']);
    expect(typesWhere((_, type) => type === 'bluff' || type === 'single' || type === 'pin', ['pin', 'bluff'])).toEqual(['pin', 'bluff', 'single']);
    expect(typesWhere((_, type) => type === 'single' || type === 'pin', ['memory', 'pin'])).toEqual(['pin', 'single']);
    const a = typesWhere((t) => t.simple);
    const b = typesWhere((t) => t.simple);
    expect(a).not.toBe(b);
    expect(a).not.toBe(QUESTION_TYPES);
    expect(typesWhere(() => true)).not.toBe(QUESTION_TYPES);
  });
});
