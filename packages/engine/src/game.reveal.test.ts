import { DEFAULT_RULES, type Answer, type Question, type RoundRules } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { buffBlock, takeBuff } from './buffs';
import { acceptAnswer, lock, next, override, recordOf, start, submitAnswer, type GameState } from './game';
import { boardRound, classicRound, makeRoundsQuiz, numeric, single, text, withReveal } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const odesa: Answer = { type: 'text', value: 'Одеса' };
const kyiv: Answer = { type: 'text', value: 'Київ' };
const rng = () => 0;

/** Класика з бонусом швидкості, перше запитання відкрите в момент 0; гравці Анна p1, Богдан p2. */
function openClassic(question: Question = withReveal(text), rules: Partial<RoundRules> = {}, buffs?: ('retry' | 'time')[]): GameState {
  const round = classicRound('r1', [question], { speedBonus: true, rules: { ...DEFAULT_RULES, ...rules } });
  return startRound(lobbyWith(makeRoundsQuiz([round], buffs ? { buffs } : {}), 'Анна', 'Богдан'), 0, rng);
}

const answered = (at: number, answer: Answer = odesa, s: GameState = openClassic()) => recordOf(must(submitAnswer(s, 'p1', answer, at)), 0, 'p1');

describe('a revealing picture in the classic round', () => {
  it('a correct answer at once gets the full price — no speed bonus on top', () => {
    expect(answered(0)).toMatchObject({ points: 1000, accepted: true, grade: 'correct' });
  });

  it('the price falls to 30 % at full reveal', () => {
    expect(answered(10_000)).toMatchObject({ points: 650, accepted: true, grade: 'correct' });
    expect(answered(20_000)).toMatchObject({ points: 300, accepted: true, grade: 'correct' });
    // Правильна відповідь лишається правильною для серій і точності, хоч і дає менше половини ціни.
    expect(answered(15_000)).toMatchObject({ points: 475, accepted: true, grade: 'correct' });
  });

  it('a wrong answer gets 0, or minus with the penalty', () => {
    expect(answered(1000, kyiv)).toMatchObject({ points: 0, accepted: false, grade: 'wrong' });
    expect(answered(1000, kyiv, openClassic(withReveal(text), { penalty: 'minus' }))).toMatchObject({ points: -1000, grade: 'wrong' });
  });

  it('a number with a tolerance multiplies its accuracy by the reveal share', () => {
    const exact = answered(10_000, { type: 'numeric', value: 2061 }, openClassic(withReveal(numeric)));
    expect(exact).toMatchObject({ points: 650, grade: 'correct' });
    const off = answered(10_000, { type: 'numeric', value: 2111 }, openClassic(withReveal(numeric)));
    expect(off).toMatchObject({ points: 488, accepted: true, grade: 'partial' });
  });

  it('retry is not available on a revealing picture', () => {
    expect(buffBlock(openClassic(withReveal(text), {}, ['retry']), 'p1', 'retry')).toBe('unfit_reveal');
    expect(buffBlock(openClassic(text, {}, ['retry']), 'p1', 'retry')).toBeNull();
  });

  it('extra time does not push the share below 30 %', () => {
    const s = must(takeBuff(openClassic(withReveal(text), {}, ['time']), 'p1', 'time', 1000, rng));
    expect(answered(25_000, odesa, s)).toMatchObject({ points: 300, grade: 'correct' });
  });

  it('a host override still gives the full price', () => {
    const s = must(next(must(lock(must(submitAnswer(openClassic(), 'p1', kyiv, 12_000)))), 13_000, rng));
    expect(recordOf(must(override(s, 'p1', 'correct')), 0, 'p1')).toMatchObject({ points: 1000, grade: 'correct' });
  });
});

describe('a revealing picture on a board cell', () => {
  it('on a board cell the time to submit counts, not the time the host takes', () => {
    const cell = withReveal(single);
    const round = boardRound('g1', [{ title: 'A', cells: [cell] }]);
    const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан')));
    let s = must(pickCell(must(next(intro, 0)), null, cell.id, 0, rng));
    s = must(submitAnswer(s, 'p1', { type: 'single', optionId: 'b' }, 5000));
    s = must(acceptAnswer(s, 'p1', 9000));
    expect(s.plays.at(-1)?.answers.p1).toMatchObject({ points: 825, accepted: true, grade: 'correct' });
  });
});
