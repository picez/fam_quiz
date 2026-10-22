import { describe, expect, it } from 'vitest';
import { emptyBrief, roundBrief } from '@quiz/shared';
import { blitzRound, boardRound, classicRound, finalRound, single } from './testing/fixtures';

describe('roundBrief', () => {
  it('describes a classic round', () => {
    const streak = { length: 3, bonus: { kind: 'percent' as const, value: 20 } };
    const round = classicRound('r1', [single], {
      speedBonus: true,
      rules: { penalty: 'minus', partial: null, streak, multiplier: 2 },
    });
    expect(roundBrief(round)).toEqual({ ...emptyBrief('classic'), speedBonus: true, penalty: true, streak, multiplier: 2 });
  });

  it('describes a blitz round', () => {
    expect(roundBrief(blitzRound('b1', [single], { answerWindow: 15, attempts: 1 }))).toEqual({
      ...emptyBrief('blitz'),
      attempts: 1,
      answerWindow: 15,
    });
    expect(roundBrief(blitzRound('b1', [single], { answerWindow: null, attempts: null }))).toEqual(emptyBrief('blitz'));
  });

  it('describes a board round', () => {
    const cells = [
      { ...single, id: 'a' },
      { question: { ...single, id: 'b' }, mark: 'x2' as const },
      { question: { ...single, id: 'c' }, kind: 'blitz' as const, penalty: 'all' as const },
      { question: { ...single, id: 'd' }, answerMode: 'voice' as const },
    ];
    expect(roundBrief(boardRound('g1', [{ title: 'A', cells: cells.slice(0, 3) }, { title: 'B', cells: [cells[3], { ...single, id: 'e' }, { ...single, id: 'f' }] }]))).toEqual({
      ...emptyBrief('board'),
      marks: true,
      blitzCells: true,
      penaltyAll: true,
      answerModes: ['phone', 'voice'],
    });
    const plain = [{ ...single, id: 'a' }, { ...single, id: 'b' }, { ...single, id: 'c' }];
    expect(roundBrief(boardRound('g1', [{ title: 'A', cells: plain }]))).toEqual({ ...emptyBrief('board'), answerModes: ['phone'] });
  });

  it('describes a final round', () => {
    expect(roundBrief(finalRound('f1', single))).toEqual(emptyBrief('final'));
  });
});
