import { DEFAULT_RULES, type BoardCell } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { buzz } from './blitz';
import { pickCell } from './board';
import { chooserOf } from './board-turns';
import {
  acceptAnswer,
  endRound,
  judge,
  lock,
  next,
  override,
  removePlayer,
  repick,
  start,
  submitAnswer,
  tick,
  type GameState,
} from './game';
import { pendingOf } from './hold';
import { boardRound, makeRoundsQuiz, single, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const q = (id: string, points: number) => withPoints(withId(single, id), points);
const c11 = q('c11', 100);
const c12 = q('c12', 200);
const b = { type: 'single', optionId: 'b' } as const;

function picked(cells: Parameters<typeof boardRound>[1][number]['cells'], options = {}): GameState {
  const round = boardRound('g1', [{ title: 'A', cells }], options);
  const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан', 'Віра'), 0));
  return must(pickCell(must(next(intro, 0)), null, 'c11', 0, Math.random));
}

describe('answer mode of a board cell', () => {
  it('a phone cell in a voice round takes the answer from the phone', () => {
    const state = picked([{ question: c11, answerMode: 'phone' }, c12], { answerMode: 'voice' });
    const answered = must(submitAnswer(state, 'p1', b, 1000));
    expect(pendingOf(answered)).toMatchObject({ playerId: 'p1' });
    const revealed = must(acceptAnswer(answered, 'p1', 2000));
    expect(revealed.phase).toBe('reveal');
    expect(revealed.plays[0].answers.p1.points).toBe(100);
  });

  it('a voice cell in a phone round is graded by the host', () => {
    const state = picked([{ question: c11, answerMode: 'voice' }, c12], { answerMode: 'phone' });
    expect(submitAnswer(state, 'p1', b, 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(state.heldAt).toBeNull();
    const graded = must(override(state, 'p1', 'correct', 2000));
    expect(graded.phase).toBe('locked');
    const revealed = must(next(graded, 3000));
    expect(revealed.phase).toBe('reveal');
    expect(revealed.plays[0].answers.p1.points).toBe(100);
  });

  it('a cell without its own mode follows the round', () => {
    expect(picked([c11, c12], { answerMode: 'voice' }).plays[0].board).toMatchObject({ answerMode: 'voice', kind: 'normal', penalty: 'none' });
    expect(picked([c11, c12], { answerMode: 'phone' }).plays[0].board?.answerMode).toBe('phone');
  });

  it('the cell kind and penalty are taken when it opens', () => {
    const state = picked([{ question: c11, kind: 'blitz', penalty: 'all' }, c12]);
    expect(state.plays[0].board).toMatchObject({ kind: 'blitz', penalty: 'all' });
  });
});

const a = { type: 'single', optionId: 'a' } as const;
const score = (state: GameState, playerId: string) => state.players.find((p) => p.id === playerId)?.score;
const scores = (state: GameState) => state.players.map((p) => p.score);

/** Бліц-клітинка c11 за 100 (правильна b, 20 с) і звичайна c12; p1 вибрав c11 у момент 0. */
function blitzCell(cell: Partial<BoardCell> = {}, options = {}): GameState {
  return picked([{ question: c11, kind: 'blitz', ...cell }, c12], options);
}

/** Натискання (якщо ще не в черзі), відповідь і «Прийняти». */
function answered(state: GameState, playerId: string, answer: typeof b | typeof a, now: number): GameState {
  const queued = state.plays[0].blitz?.queue.some((e) => e.playerId === playerId) ? state : must(buzz(state, playerId, now));
  return must(acceptAnswer(must(submitAnswer(queued, playerId, answer, now)), playerId, now));
}

describe('blitz cell', () => {
  it('everyone including the chooser may buzz', () => {
    let state = must(buzz(blitzCell(), 'p1', 1000));
    state = must(buzz(state, 'p2', 2000));
    expect(state.plays[0].blitz?.queue.map((e) => e.playerId)).toEqual(['p1', 'p2']);
    expect(state.plays[0].blitz?.queue[0].deadline).toBe(16000);
  });

  it('the chooser answering first gets the price twice', () => {
    const state = answered(blitzCell(), 'p1', b, 1000);
    expect(state.phase).toBe('locked');
    const revealed = must(next(state, 2000));
    expect(revealed.phase).toBe('reveal');
    expect(scores(revealed)).toEqual([200, 0, 0]);
  });

  it('an opponent answering first gets the price', () => {
    const state = answered(blitzCell(), 'p2', b, 1000);
    expect(state.phase).toBe('locked');
    expect(scores(state)).toEqual([0, 100, 0]);
  });

  it('the cell mark and the round multiplier stack on top', () => {
    const options = { rules: { ...DEFAULT_RULES, multiplier: 2 } };
    expect(score(answered(blitzCell({ mark: 'x3' }, options), 'p1', b, 1000), 'p1')).toBe(1200);
    expect(score(answered(blitzCell({ mark: 'x3' }, options), 'p2', b, 1000), 'p2')).toBe(600);
  });

  it('a wrong answer passes the queue on and the wrong player may buzz again at the end', () => {
    let state = must(buzz(blitzCell(), 'p2', 1000));
    state = must(buzz(state, 'p3', 1500));
    state = answered(state, 'p2', a, 2000);
    expect(state.plays[0].blitz?.queue.map((e) => e.playerId)).toEqual(['p3']);
    expect(state.plays[0].blitz?.attempts).toMatchObject([{ playerId: 'p2', grade: 'wrong', points: 0 }]);
    state = must(buzz(state, 'p2', 3000));
    expect(state.plays[0].blitz?.queue.map((e) => e.playerId)).toEqual(['p3', 'p2']);
    state = answered(state, 'p3', a, 4000);
    state = answered(state, 'p2', a, 5000);
    expect(state.phase).toBe('question');
    expect(buzz(state, 'p2', 6000).ok).toBe(true);
  });

  it('after the timer no new buzz is taken and the queue is still decided in order', () => {
    let state = must(buzz(blitzCell(), 'p2', 10000));
    expect(state.plays[0].blitz?.queue[0].deadline).toBe(25000);
    state = must(buzz(state, 'p3', 19000));
    state = tick(state, 21000);
    expect(state.phase).toBe('question');
    expect(buzz(state, 'p1', 21000)).toEqual({ ok: false, error: 'time_over' });
    state = must(submitAnswer(state, 'p2', a, 22000));
    expect(state.heldAt).toBe(22000);
    state = must(acceptAnswer(state, 'p2', 22000));
    expect(state.plays[0].blitz?.queue[0].playerId).toBe('p3');
    state = must(acceptAnswer(must(submitAnswer(state, 'p3', b, 22000)), 'p3', 22000));
    expect(state.phase).toBe('locked');
    expect(score(state, 'p3')).toBe(100);
  });

  it('nobody correct gives nobody points', () => {
    let state = answered(blitzCell(), 'p2', a, 2000);
    state = tick(state, 20000);
    expect(state.phase).toBe('locked');
    expect(scores(state)).toEqual([0, 0, 0]);
    const revealed = must(next(state, 21000));
    expect(scores(revealed)).toEqual([0, 0, 0]);
    expect(revealed.plays[0].answers.p1).toBeUndefined();
  });

  it('the host closes the cell at any time, a pending answer gives nothing', () => {
    const state = must(submitAnswer(must(buzz(blitzCell(), 'p2', 1000)), 'p2', b, 2000));
    expect(pendingOf(state)).toMatchObject({ playerId: 'p2' });
    const closed = must(lock(state));
    expect(closed.phase).toBe('locked');
    const revealed = must(next(closed, 3000));
    expect(revealed.phase).toBe('reveal');
    expect(scores(revealed)).toEqual([0, 0, 0]);
  });

  it('the turn moves on as usual after a blitz cell', () => {
    let state = must(lock(must(buzz(blitzCell(), 'p2', 1000))));
    while (state.phase !== 'board') state = must(next(state, 2000));
    expect(chooserOf(state)).toBe('p2');
  });

  it('a voice blitz cell: the host judges the head, the timer runs, the queue waits after the timer', () => {
    let state = must(buzz(blitzCell({ answerMode: 'voice' }), 'p2', 1000));
    expect(state.plays[0].blitz?.queue[0].deadline).toBeNull();
    expect(submitAnswer(state, 'p2', b, 2000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(state.heldAt).toBeNull();
    expect(acceptAnswer(state, 'p2', 2000)).toEqual({ ok: false, error: 'wrong_phase' });
    state = must(judge(state, 'p2', false, 3000));
    expect(state.plays[0].blitz?.queue).toEqual([]);
    expect(state.phase).toBe('question');
    state = must(buzz(state, 'p3', 15000));
    state = tick(state, 25000);
    expect(state.phase).toBe('question');
    state = must(judge(state, 'p3', true, 26000));
    expect(state.phase).toBe('locked');
    expect(score(state, 'p3')).toBe(100);
  });

  it('manual check on a phone blitz cell goes through judge', () => {
    const state = must(submitAnswer(must(buzz(blitzCell({}, { check: 'manual' }), 'p2', 1000)), 'p2', b, 2000));
    expect(pendingOf(state)).toMatchObject({ playerId: 'p2' });
    expect(acceptAnswer(state, 'p2', 3000)).toEqual({ ok: false, error: 'wrong_phase' });
    const judged = must(judge(state, 'p2', true, 3000));
    expect(judged.phase).toBe('locked');
    expect(score(judged, 'p2')).toBe(100);
  });

  it('judge is refused on an auto-checked phone blitz cell', () => {
    const state = must(submitAnswer(must(buzz(blitzCell(), 'p2', 1000)), 'p2', b, 2000));
    expect(judge(state, 'p2', true, 3000)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('repick on a blitz cell lets the head answer again from the same window', () => {
    let state = must(submitAnswer(must(buzz(blitzCell(), 'p2', 1000)), 'p2', a, 3000));
    expect(state.heldAt).toBe(3000);
    state = must(repick(state, 'p2', 9000));
    expect(state.heldAt).toBeNull();
    expect(state.plays[0].blitz?.queue[0].deadline).toBe(22000);
    state = must(acceptAnswer(must(submitAnswer(state, 'p2', b, 10000)), 'p2', 10000));
    expect(score(state, 'p2')).toBe(100);
  });

  it('a host grade is refused on a blitz cell', () => {
    const revealed = must(next(must(lock(must(buzz(blitzCell(), 'p2', 1000)))), 2000));
    expect(revealed.phase).toBe('reveal');
    expect(override(revealed, 'p2', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(override(revealed, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('kicking the chooser or the pending head keeps a blitz cell going', () => {
    let state = must(buzz(blitzCell(), 'p2', 1000));
    state = must(buzz(state, 'p3', 1500));
    state = must(submitAnswer(state, 'p2', a, 2000));
    state = must(submitAnswer(state, 'p3', b, 2500));
    state = must(removePlayer(state, 'p2'));
    expect(pendingOf(state)).toMatchObject({ playerId: 'p3' });
    state = must(removePlayer(state, 'p1'));
    expect(state.phase).toBe('question');
    state = must(acceptAnswer(state, 'p3', 3000));
    expect(state.phase).toBe('locked');
    expect(score(state, 'p3')).toBe(100);
  });
});

describe('blitz cell penalty', () => {
  const minus = (cell: Partial<BoardCell> = {}, options = {}) => blitzCell({ mark: 'x2', penalty: 'all', ...cell }, options);

  it('penalty all charges everyone but the winner, the chooser included, never the ×2', () => {
    let state = answered(minus(), 'p1', a, 1000);
    state = answered(state, 'p2', b, 2000);
    expect(state.phase).toBe('locked');
    const revealed = must(next(state, 3000));
    expect(scores(revealed)).toEqual([-200, 200, -200]);
  });

  it('penalty all when the chooser wins: the chooser keeps ×2, the others lose the price', () => {
    const revealed = must(next(answered(minus(), 'p1', b, 1000), 2000));
    expect(scores(revealed)).toEqual([400, -200, -200]);
  });

  it('nobody correct with penalty all: everyone loses', () => {
    const state = tick(minus(), 20000);
    expect(state.phase).toBe('locked');
    expect(scores(must(next(state, 21000)))).toEqual([-200, -200, -200]);
  });

  it('closing the cell with a pending answer gives nobody points and charges everyone once', () => {
    const state = must(submitAnswer(must(buzz(minus(), 'p2', 1000)), 'p2', b, 2000));
    expect(pendingOf(state)).toMatchObject({ playerId: 'p2' });
    const closed = must(lock(state));
    const revealed = must(next(closed, 3000));
    expect(revealed.phase).toBe('reveal');
    expect(scores(revealed)).toEqual([-200, -200, -200]);
    expect(scores(must(endRound(revealed, 4000)))).toEqual([-200, -200, -200]);
  });

  it('ending the round with the cell open charges everyone once', () => {
    expect(scores(must(endRound(minus(), 1000)))).toEqual([-200, -200, -200]);
  });

  it('penalty none charges nobody', () => {
    let state = answered(blitzCell({ mark: 'x2' }), 'p2', a, 1000);
    state = tick(state, 20000);
    expect(scores(must(next(state, 21000)))).toEqual([0, 0, 0]);
  });

  it('the round penalty never applies to a blitz cell', () => {
    let state = answered(blitzCell({}, { rules: { ...DEFAULT_RULES, penalty: 'minus' } }), 'p2', a, 1000);
    expect(state.plays[0].blitz?.attempts[0].points).toBe(0);
    state = tick(state, 20000);
    const revealed = must(next(state, 21000));
    expect(revealed.phase).toBe('reveal');
    expect(scores(revealed)).toEqual([0, 0, 0]);
    expect(revealed.plays[0].answers.p1).toBeUndefined();
  });

  it('a kicked player is not charged', () => {
    const state = must(removePlayer(minus(), 'p3'));
    const locked = must(lock(state));
    expect(locked.plays[0].answers.p3).toBeUndefined();
    expect(scores(locked)).toEqual([-200, -200]);
  });
});
