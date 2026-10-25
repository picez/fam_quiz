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

  it('an automatic blitz is instant: one attempt, no window, whatever was stored', () => {
    expect(roundBrief(blitzRound('b1', [single], { answerWindow: 30, attempts: 3 }))).toEqual({ ...emptyBrief('blitz'), instant: true, attempts: 1 });
    expect(roundBrief(blitzRound('b1', [single], { check: 'manual', answerWindow: 15, attempts: 2 }))).toEqual({ ...emptyBrief('blitz'), attempts: 2, answerWindow: 15 });
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
    expect(roundBrief(finalRound('f1', single))).toEqual({ ...emptyBrief('final'), wagerMode: 'classic' });
    expect(roundBrief(finalRound('f1', single, { wagerMode: 'bank' }))).toEqual({ ...emptyBrief('final'), wagerMode: 'bank' });
    expect(roundBrief(classicRound('r1', [single])).wagerMode).toBeNull();
  });

  it('describes a survival round: classic rules plus the trial, the survivors and the bonus', () => {
    const rules = { penalty: 'minus' as const, partial: null, streak: null, multiplier: 2 as const };
    const round = {
      id: 'sv', type: 'survival' as const, title: '', speedBonus: true, shuffleOptions: false, rules,
      questions: [single, { ...single, id: 'x2' }, { ...single, id: 'x3' }], trials: [{ ...single, id: 't1' }],
      trial: 'question' as const, survivors: 1, bonus: 500,
    };
    expect(roundBrief(round)).toEqual({
      ...emptyBrief('survival'), speedBonus: true, penalty: true, multiplier: 2, survival: { trial: 'question', survivors: 1, bonus: 500 },
    });
    expect(emptyBrief('classic').survival).toBeNull();
    expect(roundBrief(classicRound('r1', [single])).survival).toBeNull();
  });
});
