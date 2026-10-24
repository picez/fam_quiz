import { DEFAULT_RULES, type Answer, type BuffKind, type Question, type RoundRules } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { buffBlock } from './buffs';
import { acceptAnswer, next, recordOf, start, submitAnswer, type GameState } from './game';
import { boardRound, classicRound, makeRoundsQuiz, pin } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const at = (x: number, y = 0.5): Answer => ({ type: 'pin', x, y });
const rules = (patch: Partial<RoundRules>): RoundRules => ({ ...DEFAULT_RULES, ...patch });
const rng = () => 0;

/** Класика без бонусу швидкості, точка на мапі «Світ» (2 : 1) відкрита в момент 0; гравці Анна p1, Богдан p2. */
function openClassic(options: { speedBonus?: boolean; rules?: RoundRules; buffs?: BuffKind[] } = {}, questions: Question[] = [pin]): GameState {
  const round = classicRound('r1', questions, { speedBonus: options.speedBonus ?? false, rules: options.rules ?? DEFAULT_RULES });
  return startRound(lobbyWith(makeRoundsQuiz([round], options.buffs ? { buffs: options.buffs } : {}), 'Анна', 'Богдан'), 0, rng);
}

const answered = (answer: Answer, s: GameState = openClassic(), time = 1000) => recordOf(must(submitAnswer(s, 'p1', answer, time)), 0, 'p1');

describe('a pin in the classic round', () => {
  it('full inside the inner circle, half on the middle, nothing outside', () => {
    expect(answered(at(0.52))).toMatchObject({ points: 1000, accepted: true, grade: 'correct' });
    expect(answered(at(0.59))).toMatchObject({ points: 500, accepted: true, grade: 'correct' });
    // Висота «Світу» — половина ширини: 0,18 висоти — ті самі 9 % довшої сторони.
    expect(answered(at(0.5, 0.68))).toMatchObject({ points: 500, accepted: true, grade: 'correct' });
    expect(answered(at(0.62))).toMatchObject({ points: 250, accepted: false, grade: 'partial' });
    expect(answered(at(0.66))).toMatchObject({ points: 0, accepted: false, grade: 'wrong' });
  });

  it('the minus penalty only for zero', () => {
    const minus = rules({ penalty: 'minus' });
    expect(answered(at(0.66), openClassic({ rules: minus }))).toMatchObject({ points: -1000, grade: 'wrong' });
    expect(answered(at(0.62), openClassic({ rules: minus }))).toMatchObject({ points: 250, grade: 'partial' });
  });

  it('the speed bonus applies like a slider', () => {
    expect(answered(at(0.52), openClassic({ speedBonus: true }), 15_000)?.points).toBe(750);
  });

  it('50/50, a second try and the audience are not available', () => {
    const s = openClassic({ buffs: ['fifty', 'retry', 'audience'] });
    expect(buffBlock(s, 'p1', 'fifty')).toBe('unfit_type');
    expect(buffBlock(s, 'p1', 'retry')).toBe('unfit_type');
    expect(buffBlock(s, 'p1', 'audience')).toBe('unfit_type');
  });

  it('a wrong answer type is a type_mismatch', () => {
    expect(submitAnswer(openClassic(), 'p1', { type: 'slider', value: 50 }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
  });
});

describe('a pin on a board', () => {
  it('on a board phone cell a pin gets its share without the partial rule', () => {
    const round = boardRound('g1', [{ title: 'A', cells: [pin] }], { rules: rules({ partial: null }) });
    const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан')));
    let s = must(pickCell(must(next(intro, 0)), null, pin.id, 0, rng));
    s = must(acceptAnswer(must(submitAnswer(s, 'p1', at(0.59), 1000)), 'p1', 2000));
    expect(s.plays.at(-1)?.answers.p1).toMatchObject({ points: 500, accepted: true, grade: 'correct' });
  });
});
