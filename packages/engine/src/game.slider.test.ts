import { DEFAULT_RULES, type Answer, type Question, type RoundRules } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { buffBlock, takeBuff, voteTally } from './buffs';
import { placeWager } from './final';
import { acceptAnswer, lock, next, recordOf, start, submitAnswer, type GameState } from './game';
import { blitzRound, boardRound, classicRound, finalRound, makeRoundsQuiz, numeric, slider, withId } from './testing/fixtures';
import { acceptAll, lobbyWith, must, sendBlitz, startRound } from './testing/helpers';

const at = (value: number): Answer => ({ type: 'slider', value });
const rules = (patch: Partial<RoundRules>): RoundRules => ({ ...DEFAULT_RULES, ...patch });
const rng = () => 0;

/** Класика, перше запитання відкрите в момент 0; гравці Анна p1, Богдан p2. */
function openClassic(questions: Question[] = [slider], options: { speedBonus?: boolean; rules?: RoundRules; buffs?: ('retry' | 'audience')[] } = {}): GameState {
  const { speedBonus = false, rules: roundRules = DEFAULT_RULES, buffs } = options;
  const quiz = makeRoundsQuiz([classicRound('r1', questions, { speedBonus, rules: roundRules })], buffs ? { buffs } : {});
  return startRound(lobbyWith(quiz, 'Анна', 'Богдан'), 0, rng);
}

/** Поле з однією клітинкою; Анна вибрала її в момент 0. */
function pickedCell(question: Question, partial: number | null = null): GameState {
  const round = boardRound('g1', [{ title: 'A', cells: [question] }], { rules: rules({ partial }) });
  const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан')));
  return must(pickCell(must(next(intro, 0)), null, question.id, 0, rng));
}

describe('a slider in the classic round', () => {
  it('a slider scores full inside the tolerance and falls linearly to zero', () => {
    let s = openClassic([slider]);
    s = must(submitAnswer(s, 'p1', at(52), 1000));
    s = must(submitAnswer(s, 'p2', at(57), 1000));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 1000, accepted: true, grade: 'correct' });
    expect(recordOf(s, 0, 'p2')).toMatchObject({ points: 500, accepted: true, grade: 'correct' });
  });

  it('half the price is correct, less is partial and not accepted', () => {
    const s = must(submitAnswer(openClassic(), 'p1', at(58), 1000));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 400, accepted: false, grade: 'partial' });
  });

  it('beyond the zero distance gives nothing; the minus penalty applies only to a zero', () => {
    const minus = rules({ penalty: 'minus' });
    let s = openClassic([slider], { rules: minus });
    s = must(submitAnswer(s, 'p1', at(63), 1000));
    s = must(submitAnswer(s, 'p2', at(58), 1000));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: -1000, accepted: false, grade: 'wrong' });
    expect(recordOf(s, 0, 'p2')).toMatchObject({ points: 400, grade: 'partial' });
  });

  it('without a zero distance a slider is all or nothing', () => {
    const exact: Question = { ...slider, zeroBeyond: undefined };
    let s = openClassic([exact]);
    s = must(submitAnswer(s, 'p1', at(52), 1000));
    s = must(submitAnswer(s, 'p2', at(53), 1000));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 1000, grade: 'correct' });
    expect(recordOf(s, 0, 'p2')).toMatchObject({ points: 0, accepted: false, grade: 'wrong' });
  });

  it('out of range or the wrong answer type is rejected', () => {
    const s = must(submitAnswer(openClassic(), 'p1', at(101), 1000));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 0, accepted: false, grade: 'wrong' });
    expect(submitAnswer(openClassic(), 'p1', { type: 'numeric', value: 50 }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('the speed bonus applies like a number', () => {
    const s = must(submitAnswer(openClassic([slider], { speedBonus: true }), 'p1', at(52), 10_000));
    expect(recordOf(s, 0, 'p1')?.points).toBe(750);
  });

  it('a streak continues on a half-price slider and breaks below half', () => {
    const streak = { length: 2, bonus: { kind: 'fixed', value: 100 } } as const;
    const questions = [slider, withId(slider, 'q11'), withId(slider, 'q12')];
    const toNext = (s: GameState) => {
      let current = s.phase === 'question' ? must(lock(s)) : s;
      while (current.phase !== 'question') current = must(next(current, 0, rng));
      return current;
    };
    let s = openClassic(questions, { rules: rules({ streak }) });
    s = must(submitAnswer(s, 'p1', at(57), 1000));
    s = toNext(s);
    s = must(lock(must(submitAnswer(s, 'p1', at(52), 1000))));
    expect(s.players[0].streak).toBe(2);
    expect(recordOf(s, 1, 'p1')?.streakBonus).toBe(100);
    s = toNext(s);
    s = must(lock(must(submitAnswer(s, 'p1', at(58), 1000))));
    expect(s.players[0].streak).toBe(0);
  });
});

describe('a slider elsewhere', () => {
  it('on a board cell a slider gets its share without the partial rule', () => {
    const s = must(acceptAnswer(must(submitAnswer(pickedCell(slider), 'p1', at(57), 1000)), 'p1', 1000));
    expect(s.plays.at(-1)?.answers.p1).toMatchObject({ points: 500, accepted: true, grade: 'correct' });
    const low = must(acceptAnswer(must(submitAnswer(pickedCell(slider), 'p1', at(58), 1000)), 'p1', 1000));
    expect(low.plays.at(-1)?.answers.p1).toMatchObject({ points: 400, accepted: false, grade: 'partial' });
  });

  it('a number off the exact value still gets 0 on a board without the partial rule', () => {
    const s = must(acceptAnswer(must(submitAnswer(pickedCell(numeric), 'p1', { type: 'numeric', value: 2111 }, 1000)), 'p1', 1000));
    expect(s.plays.at(-1)?.answers.p1).toMatchObject({ points: 0, accepted: false, grade: 'wrong' });
  });

  it('in a blitz a slider counts only inside the tolerance', () => {
    const open = () => startRound(lobbyWith(makeRoundsQuiz([blitzRound('b1', [slider])]), 'Анна', 'Богдан'), 0);
    const near = acceptAll(sendBlitz(open(), 'p1', at(57), 1000), 1000);
    expect(near.plays[0].blitz?.attempts.map((a) => a.grade)).toEqual(['wrong']);
    const inside = acceptAll(sendBlitz(open(), 'p1', at(52), 1000), 1000);
    expect(inside.plays[0].blitz?.attempts.map((a) => a.grade)).toEqual(['correct']);
  });

  it('in the final a slider counts only inside the tolerance', () => {
    const open = () => {
      let s = must(next(must(start(lobbyWith(makeRoundsQuiz([finalRound('f', slider)]), 'Анна', 'Богдан'))), 0, rng));
      s = must(placeWager(s, 'p1', 0, 1000, rng));
      return must(placeWager(s, 'p2', 0, 1000, rng));
    };
    const near = must(submitAnswer(open(), 'p1', at(57), 2000));
    expect(recordOf(near, near.questionIndex, 'p1')).toMatchObject({ accepted: false, grade: 'wrong' });
    const inside = must(submitAnswer(open(), 'p1', at(52), 2000));
    expect(recordOf(inside, inside.questionIndex, 'p1')).toMatchObject({ accepted: true, grade: 'correct' });
  });

  it('the audience groups slider votes by value', () => {
    expect(voteTally(slider, { p2: at(40), p3: at(40), p4: at(60) })).toEqual({
      cast: 3,
      counts: {},
      guesses: [
        { text: '40', count: 2 },
        { text: '60', count: 1 },
      ],
    });
  });

  it('retry is offered after a slider answer outside the tolerance', () => {
    let s = openClassic([slider], { buffs: ['retry'] });
    expect(buffBlock(s, 'p1', 'retry')).toBeNull();
    s = must(takeBuff(s, 'p1', 'retry', 500, rng));
    s = must(submitAnswer(s, 'p1', at(57), 1000));
    expect(s.plays[0].buffs?.p1?.retry).toBe('choice');
    expect(recordOf(s, 0, 'p1')).toBeUndefined();
  });
});
