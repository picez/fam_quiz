import { describe, expect, it } from 'vitest';
import { pickCell, rollOrder, setOrder, skipTurn } from './board';
import { end, endRound, lock, next, pause, setConnected, start, type GameState } from './game';
import { boardRound, classicRound, makeRoundsQuiz, single, withId, withPoints } from './testing/fixtures';
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
    const intro = must(start(must(setConnected(lobby, 'p1', false)), 0));
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
