import { DEFAULT_RULES, type RoundRules } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { lock, next, override, recordOf, start, submitAnswer, type GameState } from './game';
import { classicRound, makeQuiz, makeRoundsQuiz, single, text } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const T0 = 1_000_000;
const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const rules = (patch: Partial<RoundRules>): RoundRules => ({ ...DEFAULT_RULES, ...patch });
const copies = (...ids: string[]) => ids.map((id) => ({ ...single, id }));

/** Іде далі, доки не відкриється запитання. */
function toQuestion(state: GameState): GameState {
  let current = state;
  while (current.phase !== 'question') current = must(next(current, T0));
  return current;
}

/** Відповідає на поточне запитання першого гравця (або пропускає його) й доходить до розкриття. */
function play(state: GameState, answer: typeof right | typeof wrong | null): GameState {
  const closed = answer ? must(submitAnswer(state, 'p1', answer, T0)) : must(lock(state));
  return must(next(closed, T0));
}

describe('penalty', () => {
  const quiz = makeQuiz([single], { speedBonus: false, rules: rules({ penalty: 'minus' }) });

  it('takes points for a wrong answer', () => {
    const open = must(start(lobbyWith(quiz, 'Олена', 'Тарас'), T0));
    const state = must(submitAnswer(must(submitAnswer(open, 'p1', wrong, T0)), 'p2', right, T0));
    expect(recordOf(state, 0, 'p1')?.points).toBe(-1000);
    expect(state.players.map((p) => p.score)).toEqual([-1000, 1000]);
  });

  it('does not take points from a player who did not answer', () => {
    const open = must(start(lobbyWith(quiz, 'Олена', 'Тарас'), T0));
    const state = must(lock(must(submitAnswer(open, 'p1', wrong, T0))));
    expect(state.players.map((p) => p.score)).toEqual([-1000, 0]);
  });
});

describe('multiplier', () => {
  it('multiplies points for a correct answer', () => {
    const quiz = makeQuiz([single], { speedBonus: false, rules: rules({ multiplier: 2 }) });
    const state = must(submitAnswer(must(start(lobbyWith(quiz, 'Олена'), T0)), 'p1', right, T0));
    expect(recordOf(state, 0, 'p1')?.points).toBe(2000);
  });
});

describe('streak', () => {
  const streak = { length: 2, bonus: { kind: 'fixed', value: 100 } } as const;
  const quiz = makeQuiz(copies('q1', 'q2', 'q3'), { speedBonus: false, rules: rules({ streak }) });
  const bonuses = (state: GameState) => state.plays.map((p) => p.answers.p1?.streakBonus);

  it('adds a bonus from the streak length on', () => {
    let state = toQuestion(must(start(lobbyWith(quiz, 'Олена'), T0)));
    state = toQuestion(play(state, right));
    state = toQuestion(play(state, right));
    state = must(submitAnswer(state, 'p1', right, T0));
    expect(bonuses(state)).toEqual([0, 100, 100]);
    expect(state.players[0].streak).toBe(3);
    expect(state.players[0].score).toBe(3200);
  });

  it('is broken by a missing answer', () => {
    let state = toQuestion(must(start(lobbyWith(quiz, 'Олена'), T0)));
    state = toQuestion(play(state, right));
    state = toQuestion(play(state, null));
    state = must(submitAnswer(state, 'p1', right, T0));
    expect(bonuses(state)).toEqual([0, undefined, 0]);
    expect(state.players[0].streak).toBe(1);
  });

  it('does not carry into the next round', () => {
    const round = (id: string, ids: string[]) =>
      classicRound(id, copies(...ids), { speedBonus: false, rules: rules({ streak }) });
    const quiz2 = makeRoundsQuiz([round('r1', ['a1', 'a2']), round('r2', ['b1', 'b2'])]);
    let state = toQuestion(must(start(lobbyWith(quiz2, 'Олена'), T0)));
    state = toQuestion(play(state, right));
    state = must(submitAnswer(state, 'p1', right, T0));
    expect(state.players[0].streak).toBe(2);
    while (state.phase !== 'intro') state = must(next(state, T0));
    expect(state.roundIndex).toBe(1);
    expect(state.players[0].streak).toBe(0);
    state = must(submitAnswer(toQuestion(state), 'p1', right, T0));
    expect(state.plays[2].answers.p1.streakBonus).toBe(0);
    expect(state.players[0].streak).toBe(1);
  });

  it('is recalculated when the host overrides the last answer', () => {
    let state = toQuestion(must(start(lobbyWith(quiz, 'Олена'), T0)));
    state = toQuestion(play(state, right));
    state = toQuestion(play(state, right));
    state = play(state, right);
    expect(state.phase).toBe('reveal');
    expect(state.players[0].streak).toBe(3);
    state = must(override(state, 'p1', 'wrong'));
    expect(recordOf(state, 2, 'p1')?.streakBonus).toBe(0);
    expect(state.players[0].streak).toBe(0);
    expect(state.players[0].score).toBe(2100);
  });
});

describe('override with a partial grade', () => {
  const reveal = (partial: number | null) => {
    const quiz = makeQuiz([text], { speedBonus: false, rules: rules({ partial }) });
    const open = must(start(lobbyWith(quiz, 'Олена'), T0));
    return must(next(must(submitAnswer(open, 'p1', { type: 'text', value: 'Адеса' }, T0)), T0));
  };

  it('gives the configured share of points', () => {
    const state = must(override(reveal(50), 'p1', 'partial'));
    expect(recordOf(state, 0, 'p1')).toMatchObject({ points: 500, grade: 'partial', accepted: false, overridden: true });
    expect(state.players[0].score).toBe(500);
  });

  it('is refused when partial credit is off', () => {
    expect(override(reveal(null), 'p1', 'partial')).toEqual({ ok: false, error: 'partial_disabled' });
  });
});
