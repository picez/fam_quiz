import { describe, expect, it } from 'vitest';
import { SCORE_SOURCES, adjustmentSource, answerSource, breakdownOf, roundTotals } from './breakdown';

describe('score sources', () => {
  it('lists the sources in breakdown order', () => {
    expect([...SCORE_SOURCES]).toEqual(['answers', 'final', 'duel', 'debuff', 'host', 'undo', 'away', 'wipeout', 'survival', 'ladder']);
  });

  it('classifies answer rows by round type', () => {
    for (const type of ['classic', 'blitz', 'board', 'survival', 'ladder'] as const) expect(answerSource(type)).toBe('answers');
    expect(answerSource('final')).toBe('final');
    expect(answerSource('wipeout')).toBe('wipeout');
    expect(answerSource(undefined)).toBe('answers');
  });

  it('maps adjustment sources to themselves', () => {
    for (const source of ['host', 'undo', 'away', 'duel', 'debuff', 'survival', 'ladder'] as const) expect(adjustmentSource(source)).toBe(source);
  });
});

describe('roundTotals', () => {
  it('sums lines per round and ignores rounds out of range', () => {
    const lines = [
      { roundIndex: 0, source: 'answers' as const, points: 1000 },
      { roundIndex: 0, source: 'host' as const, points: 50 },
      { roundIndex: 1, source: 'answers' as const, points: -1000 },
      { roundIndex: 3, source: 'answers' as const, points: 7 },
    ];
    expect(roundTotals(lines, 2)).toEqual([1050, -1000]);
    expect(roundTotals(lines, 0)).toEqual([]);
    expect(roundTotals([], 3)).toEqual([0, 0, 0]);
  });
});

describe('breakdownOf', () => {
  it('splits plus and minus per source in SCORE_SOURCES order', () => {
    const line = (source: (typeof SCORE_SOURCES)[number], points: number) => ({ roundIndex: 0, source, points });
    const lines = [
      line('answers', 1000), line('answers', -1000), line('answers', 200), line('host', 50),
      line('duel', 300), line('duel', -300), line('wipeout', 600), line('answers', 0),
    ];
    expect(breakdownOf(lines)).toEqual({
      parts: [
        { source: 'answers', plus: 1200, minus: -1000 },
        { source: 'duel', plus: 300, minus: -300 },
        { source: 'host', plus: 50, minus: 0 },
        { source: 'wipeout', plus: 600, minus: 0 },
      ],
      plus: 2150,
      minus: -1300,
    });
  });

  it('puts the undo rows after the host rows', () => {
    const line = (source: (typeof SCORE_SOURCES)[number], points: number) => ({ roundIndex: 0, source, points });
    expect(breakdownOf([line('host', 50), line('undo', -50), line('undo', 1000)])).toEqual({
      parts: [
        { source: 'host', plus: 50, minus: 0 },
        { source: 'undo', plus: 1000, minus: -50 },
      ],
      plus: 1050,
      minus: -50,
    });
  });

  it('is empty without lines', () => {
    expect(breakdownOf([])).toEqual({ parts: [], plus: 0, minus: 0 });
  });
});
