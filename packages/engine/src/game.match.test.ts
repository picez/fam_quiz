import { DEFAULT_RULES, type Answer } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { acceptAnswer, next, override, start, submitAnswer, type GameState } from './game';
import { blitzRound, boardRound, makeQuiz, makeRoundsQuiz, match, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const right: Answer = {
  type: 'match',
  links: [
    { left: 'a', right: 'x' },
    { left: 'b', right: 'y' },
    { left: 'c', right: 'z' },
  ],
};
const wrong: Answer = {
  type: 'match',
  links: [
    { left: 'a', right: 'y' },
    { left: 'b', right: 'x' },
    { left: 'c', right: 'z' },
  ],
};
const score = (state: GameState, id: string) => state.players.find((p) => p.id === id)?.score;

describe('match question in a classic round', () => {
  it('a classic round scores a correct match fully and a wrong one with nothing', () => {
    const quiz = makeQuiz([match], { speedBonus: false });
    let state = startRound(lobbyWith(quiz, 'Олена', 'Тарас'), 0);
    state = must(submitAnswer(state, 'p1', right, 1000));
    state = must(submitAnswer(state, 'p2', wrong, 1000));
    expect(state.phase).toBe('locked');
    state = must(next(state, 2000));
    expect(state.phase).toBe('reveal');
    expect([score(state, 'p1'), score(state, 'p2')]).toEqual([1000, 0]);
  });

  it('the host can grade a wrong match answer as partial when the round allows it', () => {
    const quiz = makeQuiz([match], { speedBonus: false, rules: { ...DEFAULT_RULES, partial: 50 } });
    let state = startRound(lobbyWith(quiz, 'Олена', 'Тарас'), 0);
    state = must(submitAnswer(state, 'p1', right, 1000));
    state = must(submitAnswer(state, 'p2', wrong, 1000));
    state = must(next(state, 2000));
    expect(score(state, 'p2')).toBe(0);
    state = must(override(state, 'p2', 'partial'));
    expect(score(state, 'p2')).toBe(500);
    expect(state.plays.at(-1)?.answers.p2).toMatchObject({ grade: 'partial', points: 500 });
  });
});

describe('match question in a blitz round', () => {
  it('a blitz round accepts a match answer from the head of the queue', () => {
    const quiz = makeRoundsQuiz([blitzRound('b1', [match])]);
    let state = startRound(lobbyWith(quiz, 'Анна', 'Богдан'), 0);
    state = must(submitAnswer(state, 'p1', right, 200));
    expect(state.phase).toBe('question');
    state = must(acceptAnswer(state, 'p1', 300));
    expect(state.phase).toBe('locked');
    expect(state.plays.at(-1)?.answers.p1).toMatchObject({ accepted: true, points: 1000 });
    state = must(next(state, 400));
    expect(state.phase).toBe('reveal');
    expect(score(state, 'p1')).toBe(1000);
    expect(score(state, 'p2')).toBe(0);
  });
});

describe('match question on the board', () => {
  const cell = withPoints(withId(match, 'c11'), 300);
  const picked = (options = {}) => {
    const round = boardRound('g1', [{ title: 'Міста', cells: [cell] }], options);
    const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан', 'Віра')));
    return must(pickCell(must(next(intro, 0)), null, 'c11', 0, Math.random));
  };

  it('a board cell plays a match question by phone: the answer waits, then the host accepts it', () => {
    let state = must(submitAnswer(picked(), 'p1', right, 1000));
    expect(state.phase).toBe('question');
    expect(state.plays.at(-1)?.board?.answer).toEqual(right);
    state = must(acceptAnswer(state, 'p1', 2000));
    expect(state.phase).toBe('reveal');
    expect(score(state, 'p1')).toBe(300);
  });

  it('a wrong phone answer on the board earns nothing', () => {
    const state = must(acceptAnswer(must(submitAnswer(picked(), 'p1', wrong, 1000)), 'p1', 2000));
    expect(score(state, 'p1')).toBe(0);
  });

  it('a board cell plays a match question by voice: the host grades, there is no phone answer', () => {
    const state = picked({ answerMode: 'voice' });
    expect(submitAnswer(state, 'p1', right, 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    const graded = must(override(state, 'p1', 'correct', 1000));
    expect(score(graded, 'p1')).toBe(300);
    expect(graded.plays.at(-1)?.board?.answer).toBeNull();
  });
});
