import type { Answer } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell, rollOrder, setOrder, skipTurn } from './board';
import { nextDeadline } from './blitz';
import { end, endRound, lock, next, override, pause, removePlayer, resume, setConnected, start, submitAnswer, tick, type GameState } from './game';
import { boardRound, classicRound, makeRoundsQuiz, order, single, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const q = (id: string, points: number) => withPoints(withId(single, id), points);
const c11 = q('c11', 100);
const c12 = q('c12', 200);
const c21 = q('c21', 100);
const c22 = q('c22', 200);
const c23 = q('c23', 300);

const field = () =>
  boardRound('g1', [
    { title: 'Міста', cells: [c11, c12] },
    { title: 'Річки', cells: [c21, c22, { mark: 'x3', question: c23 }] },
  ]);

/** Гра на етапі вибору клітинки (після заставки). */
function onBoard(round = field(), settings = {}): GameState {
  const quiz = makeRoundsQuiz([round], settings);
  const intro = must(start(lobbyWith(quiz, 'Анна', 'Богдан', 'Віра'), 0));
  return must(next(intro, 0));
}

/** Закриває запитання й іде далі до вибору клітинки або кінця. */
function finishCell(state: GameState): GameState {
  let current = must(lock(state));
  while (current.phase !== 'board' && current.phase !== 'finished') current = must(next(current, 0));
  return current;
}

describe('board turns', () => {
  it('a board round always starts with an intro and the join order', () => {
    const quiz = makeRoundsQuiz([field()]);
    const state = must(start(lobbyWith(quiz, 'Анна', 'Богдан', 'Віра'), 0));
    expect(state.phase).toBe('intro');
    expect(state.board?.circle).toEqual(['p1', 'p2', 'p3']);
    expect(state.board?.done).toBe(0);
  });

  it('the host sets the order or rolls the dice before the round starts', () => {
    const quiz = makeRoundsQuiz([field()]);
    const intro = must(start(lobbyWith(quiz, 'Анна', 'Богдан', 'Віра'), 0));
    expect(must(setOrder(intro, ['p3', 'p1', 'p2'])).board?.circle).toEqual(['p3', 'p1', 'p2']);
    expect(setOrder(intro, ['p1', 'p2'])).toEqual({ ok: false, error: 'not_found' });
    expect(setOrder(intro, ['p1', 'p2', 'p9'])).toEqual({ ok: false, error: 'not_found' });
    const rolled = must(rollOrder(intro, () => 0));
    expect([...(rolled.board?.circle ?? [])].sort()).toEqual(['p1', 'p2', 'p3']);
    expect(rolled.board?.rolls).toBe(1);
    expect(must(rollOrder(rolled, () => 0.99)).board?.rolls).toBe(2);
    const started = must(next(intro, 0));
    expect(started.phase).toBe('board');
    expect(setOrder(started, ['p1', 'p2', 'p3'])).toEqual({ ok: false, error: 'wrong_phase' });
    expect(rollOrder(started, () => 0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('turns rotate by one after every circle', () => {
    const round = boardRound('g1', [
      { title: 'A', cells: [q('a1', 100), q('a2', 100), q('a3', 100)] },
      { title: 'B', cells: [q('b1', 100), q('b2', 100), q('b3', 100)] },
      { title: 'C', cells: [q('d1', 100), q('d2', 100), q('d3', 100)] },
    ]);
    let state = onBoard(round, { leaderboard: 'end' });
    const ids = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'd1', 'd2', 'd3'];
    const choosers: string[] = [];
    for (const id of ids) {
      expect(state.phase).toBe('board');
      const play = must(pickCell(state, null, id, 0, Math.random));
      choosers.push(play.plays.at(-1)?.board?.chooserId ?? '');
      state = finishCell(play);
    }
    expect(choosers).toEqual(['p1', 'p2', 'p3', 'p2', 'p3', 'p1', 'p3', 'p1', 'p2']);
    expect(state.phase).toBe('finished');
  });

  it('only the chooser or the host can pick, and only an unplayed cell', () => {
    const state = onBoard();
    expect(pickCell(state, 'p2', 'c11', 0, Math.random)).toEqual({ ok: false, error: 'not_your_turn' });
    const picked = must(pickCell(state, null, 'c11', 0, Math.random));
    expect(picked.phase).toBe('question');
    expect(picked.plays.at(-1)?.board?.price).toBe(100);
    expect(picked.plays.at(-1)?.board?.chooserId).toBe('p1');
    expect(pickCell(picked, 'p2', 'c12', 0, Math.random)).toEqual({ ok: false, error: 'wrong_phase' });
    const after = finishCell(picked);
    expect(pickCell(after, null, 'c11', 0, Math.random)).toEqual({ ok: false, error: 'cell_closed' });
    expect(pickCell(after, null, 'nope', 0, Math.random)).toEqual({ ok: false, error: 'not_found' });
  });

  it('a cell carries its own question points and mark', () => {
    const picked = must(pickCell(onBoard(), null, 'c23', 0, Math.random));
    expect(picked.plays.at(-1)?.board).toMatchObject({ cellId: 'c23', price: 300, multiplier: 3, answer: null });
    const plain = must(pickCell(onBoard(), null, 'c12', 0, Math.random));
    expect(plain.plays.at(-1)?.board).toMatchObject({ price: 200, multiplier: 1 });
  });

  it('skipping a turn passes it on and keeps the rotation', () => {
    const state = onBoard();
    const skipped = must(skipTurn(state, 0));
    expect(skipped.phase).toBe('board');
    expect(must(pickCell(skipped, null, 'c11', 0, Math.random)).plays.at(-1)?.board?.chooserId).toBe('p2');
    expect(must(skipTurn(must(skipTurn(must(skipTurn(state, 0)), 0)), 0)).board).toMatchObject({
      circle: ['p2', 'p3', 'p1'],
      done: 0,
    });
    const picked = must(pickCell(state, null, 'c11', 0, Math.random));
    expect(skipTurn(picked, 0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('the round ends after the last cell even with a leaderboard after each question', () => {
    const round = boardRound('g1', [{ title: 'Міста', cells: [c11] }]);
    const state = onBoard(round, { leaderboard: 'each' });
    const picked = must(pickCell(state, null, 'c11', 0, Math.random));
    const reveal = must(next(must(lock(picked)), 0));
    expect(reveal.phase).toBe('reveal');
    expect(must(next(reveal, 0)).phase).toBe('finished');
  });

  it('a leaderboard after each question comes before the next pick', () => {
    const state = onBoard(field(), { leaderboard: 'each' });
    const reveal = must(next(must(lock(must(pickCell(state, null, 'c11', 0, Math.random)))), 0));
    const leaderboard = must(next(reveal, 0));
    expect(leaderboard.phase).toBe('leaderboard');
    expect(must(next(leaderboard, 0)).phase).toBe('board');
  });

  it('the host can end the board round while a player is choosing', () => {
    const quiz = makeRoundsQuiz([field(), classicRound('r2', [single])]);
    const intro = must(start(lobbyWith(quiz, 'Анна', 'Богдан'), 0));
    const choosing = must(next(intro, 0));
    expect(choosing.phase).toBe('board');
    const ended = must(endRound(choosing, 0));
    expect(ended.phase).toBe('round_end');
    const classic = must(next(ended, 0));
    expect(classic.phase).toBe('intro');
    expect(classic.board).toBeNull();
    expect(must(end(choosing)).phase).toBe('finished');
  });

  it('awaySince is cleared when the turn is picked or the round ends', () => {
    const quiz = makeRoundsQuiz([field(), classicRound('r2', [single])]);
    const lobby = lobbyWith(quiz, 'Анна', 'Богдан', 'Віра');
    const intro = must(start(must(setConnected(lobby, 'p1', false, 0)), 0));
    const away = must(next(intro, 5000));
    expect(away.board?.awaySince).toBe(5000);
    expect(must(pickCell(away, null, 'c11', 6000, Math.random)).board?.awaySince).toBeNull();
    expect(must(endRound(away, 6000)).board?.awaySince).toBeNull();
    expect(must(end(away)).board?.awaySince).toBeNull();
  });

  it('pick and skip are refused on pause, and the order needs unique ids', () => {
    const paused = must(pause(onBoard(), 0));
    expect(pickCell(paused, null, 'c11', 0, Math.random)).toEqual({ ok: false, error: 'paused' });
    expect(skipTurn(paused, 0)).toEqual({ ok: false, error: 'paused' });
    const quiz = makeRoundsQuiz([field()]);
    const intro = must(start(lobbyWith(quiz, 'Анна', 'Богдан', 'Віра'), 0));
    expect(setOrder(intro, ['p1', 'p1', 'p2'])).toEqual({ ok: false, error: 'not_found' });
  });
});

const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

/** Гра, де p1 вибрав клітинку й відкрито запитання. */
function picked(cellId: string, round = field(), settings = {}): GameState {
  return must(pickCell(onBoard(round, settings), null, cellId, 0, Math.random));
}

const score = (state: GameState, id: string) => state.players.find((p) => p.id === id)?.score;

describe('board answers and points', () => {
  it('only the chooser answers and a correct answer earns the question points', () => {
    const state = picked('c12');
    expect(submitAnswer(state, 'p2', right, 1000)).toEqual({ ok: false, error: 'not_your_turn' });
    const done = must(submitAnswer(state, 'p1', right, 1000));
    expect(done.phase).toBe('locked');
    expect(done.plays.at(-1)?.answers.p1).toMatchObject({ grade: 'correct', points: 200 });
    expect(score(done, 'p1')).toBe(200);
    expect(submitAnswer(done, 'p1', right, 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(submitAnswer(state, 'p1', { type: 'boolean', value: true }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(state, 'p1', right, 99_000)).toEqual({ ok: false, error: 'time_over' });
  });

  it('round and cell multipliers multiply, and so does the penalty', () => {
    const round = boardRound('g1', [{ title: 'A', cells: [c11, { mark: 'x3', question: c12 }] }], {
      rules: { penalty: 'minus', partial: null, streak: null, multiplier: 2 },
    });
    expect(score(must(submitAnswer(picked('c12', round), 'p1', right, 1000)), 'p1')).toBe(1200);
    expect(score(must(submitAnswer(picked('c12', round), 'p1', wrong, 1000)), 'p1')).toBe(-1200);
  });

  it('partial accuracy pays a share only with partial credit on', () => {
    const o = withPoints(withId(order, 'o1'), 200);
    const half: Answer = { type: 'order', itemIds: ['u', 'l', 'h', 'k'] };
    const cells = [{ title: 'A', cells: [o] }];
    const off = must(submitAnswer(picked('o1', boardRound('g1', cells)), 'p1', half, 1000));
    expect(off.plays.at(-1)?.answers.p1).toMatchObject({ grade: 'wrong', accuracy: 0, points: 0 });
    const on = boardRound('g1', cells, { rules: { penalty: 'none', partial: 50, streak: null, multiplier: 1 } });
    const partial = must(submitAnswer(picked('o1', on), 'p1', half, 1000));
    expect(partial.plays.at(-1)?.answers.p1).toMatchObject({ grade: 'partial', accuracy: 0.5, points: 100 });
  });

  it('a missing answer is wrong at the reveal and the penalty applies', () => {
    const round = boardRound('g1', [{ title: 'A', cells: [c11, c12] }], {
      rules: { penalty: 'minus', partial: null, streak: null, multiplier: 1 },
    });
    const state = picked('c11', round);
    const locked = tick(state, state.endsAt ?? 0);
    expect(locked.phase).toBe('locked');
    expect(locked.plays.at(-1)?.answers.p1).toBeUndefined();
    const reveal = must(next(locked, 0));
    expect(reveal.plays.at(-1)?.answers.p1).toMatchObject({ grade: 'wrong', answer: null, points: -100 });
    expect(score(reveal, 'p1')).toBe(-100);
  });

  it('without a penalty a wrong answer earns nothing', () => {
    const done = must(submitAnswer(picked('c12'), 'p1', wrong, 1000));
    expect(done.plays.at(-1)?.answers.p1).toMatchObject({ grade: 'wrong', points: 0 });
    expect(score(done, 'p1')).toBe(0);
  });

  it('voice mode: the host grades during the question, partial included', () => {
    const round = boardRound('g1', [{ title: 'A', cells: [c11, c12] }], {
      answerMode: 'voice',
      rules: { penalty: 'none', partial: 50, streak: null, multiplier: 1 },
    });
    const state = picked('c12', round);
    expect(submitAnswer(state, 'p1', right, 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    const graded = must(override(state, 'p1', 'partial', 1000));
    expect(graded.phase).toBe('locked');
    expect(graded.plays.at(-1)?.answers.p1).toMatchObject({ grade: 'partial', points: 100, timeMs: 1000, overridden: false });
    expect(score(graded, 'p1')).toBe(100);
    expect(override(state, 'p2', 'correct', 1000)).toEqual({ ok: false, error: 'not_found' });
  });

  it('manual check waits for the host after the phone answer', () => {
    const state = picked('c12', boardRound('g1', [{ title: 'A', cells: [c11, c12] }], { check: 'manual' }));
    expect(override(state, 'p1', 'correct', 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    const locked = must(submitAnswer(state, 'p1', right, 1000));
    expect(locked.phase).toBe('locked');
    expect(locked.plays.at(-1)?.answers.p1).toBeUndefined();
    expect(locked.plays.at(-1)?.board?.answer).toEqual(right);
    const graded = must(override(locked, 'p1', 'correct', 2000));
    expect(graded.plays.at(-1)?.answers.p1).toMatchObject({ answer: right, grade: 'correct', points: 200, overridden: false });
  });

  it('the host can change a board grade at the reveal and points follow', () => {
    const reveal = must(next(must(submitAnswer(picked('c12'), 'p1', right, 1000)), 0));
    expect(score(reveal, 'p1')).toBe(200);
    const changed = must(override(reveal, 'p1', 'wrong', 2000));
    expect(changed.plays.at(-1)?.answers.p1).toMatchObject({ grade: 'wrong', points: 0, overridden: true });
    expect(score(changed, 'p1')).toBe(0);
    expect(override(reveal, 'p1', 'partial', 2000)).toEqual({ ok: false, error: 'partial_disabled' });
  });

  it("a board streak counts only the player's own turns", () => {
    const cells = ['a', 'b', 'c', 'd'].map((id) => q(id, 100));
    const round = boardRound('g1', [{ title: 'A', cells }], {
      rules: { penalty: 'none', partial: null, streak: { length: 2, bonus: { kind: 'fixed', value: 300 } }, multiplier: 1 },
    });
    let state = onBoard(round, { leaderboard: 'end' });
    const answers = [right, wrong, right, right];
    const turns = ['p1', 'p2', 'p3', 'p1'];
    for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) {
      // Після кола ротація віддає хід p2; ведучий пропускає його, щоб знову ходив p1.
      while (i === 3 && state.board?.circle[state.board.done] !== 'p1') state = must(skipTurn(state, 0));
      state = must(submitAnswer(must(pickCell(state, null, id, 0, Math.random)), turns[i], answers[i], 1000));
      while (i < 3 && state.phase !== 'board') state = must(next(state, 0));
    }
    expect(state.plays[3].answers.p1).toMatchObject({ streakBonus: 300, points: 400 });
    expect(state.plays[2].answers.p3?.streakBonus).toBe(0);
    expect(score(state, 'p1')).toBe(500);
  });
});

describe('absent chooser, kicks and pause', () => {
  it('an absent chooser loses the turn after thirty seconds', () => {
    const state = must(setConnected(onBoard(), 'p1', false, 1000));
    expect(state.board?.awaySince).toBe(1000);
    expect(nextDeadline(state, 1000)).toBe(31000);
    expect(tick(state, 30999)).toBe(state);
    const skipped = tick(state, 31000);
    expect(skipped.board?.awaySince).toBeNull();
    expect(skipped.board?.circle[skipped.board.done]).toBe('p2');
    expect(skipped.board?.circle).toEqual(['p1', 'p2', 'p3']);
    expect(skipped.board?.done).toBe(1);
  });

  it('a chooser who comes back keeps the turn', () => {
    const away = must(setConnected(onBoard(), 'p1', false, 1000));
    const back = must(setConnected(away, 'p1', true, 5000));
    expect(back.board?.awaySince).toBeNull();
    expect(tick(back, 31000)).toBe(back);
  });

  it('a pause stops the absence clock', () => {
    const away = must(setConnected(onBoard(), 'p1', false, 1000));
    const paused = must(pause(away, 20000));
    expect(paused.board?.awaySince).toBeNull();
    expect(nextDeadline(paused, 20000)).toBeNull();
    expect(tick(paused, 10_000_000)).toBe(paused);
    expect(pickCell(paused, null, 'c11', 0, Math.random)).toEqual({ ok: false, error: 'paused' });
    expect(skipTurn(paused, 0)).toEqual({ ok: false, error: 'paused' });
    const resumed = must(resume(paused, 10_000_000));
    expect(resumed.board?.awaySince).toBe(10_000_000);
    expect(tick(resumed, 10_029_999)).toBe(resumed);
    expect(chooserOfCircle(tick(resumed, 10_030_000))).toBe('p2');
  });

  it('kicking the chooser passes the turn on', () => {
    const state = must(skipTurn(onBoard(), 0));
    expect(chooserOfCircle(state)).toBe('p2');
    const kicked = must(removePlayer(state, 'p2'));
    expect(kicked.board?.circle).toEqual(['p1', 'p3']);
    expect(chooserOfCircle(kicked)).toBe('p3');
  });

  it('kicking a player who already moved keeps the rest of the circle', () => {
    const state = must(skipTurn(must(skipTurn(onBoard(), 0)), 0));
    expect(chooserOfCircle(state)).toBe('p3');
    const kicked = must(removePlayer(state, 'p1'));
    expect(kicked.board?.circle).toEqual(['p2', 'p3']);
    expect(kicked.board?.done).toBe(1);
    expect(chooserOfCircle(kicked)).toBe('p3');
  });

  it('a disconnected next chooser after a kick gets the absence clock from tick', () => {
    const state = must(setConnected(must(skipTurn(onBoard(), 0)), 'p3', false, 500));
    expect(state.board?.awaySince).toBeNull();
    const kicked = must(removePlayer(state, 'p2'));
    expect(kicked.board?.awaySince).toBeNull();
    expect(tick(kicked, 7000).board?.awaySince).toBe(7000);
  });
});

const chooserOfCircle = (state: GameState) => state.board?.circle[state.board.done];
