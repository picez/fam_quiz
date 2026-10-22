import { describe, expect, it } from 'vitest';
import { setOrder } from './board';
import { diceOrder, rollDie, rollForRest, startDice } from './board-dice';
import { endRound, next, pause, removePlayer, setConnected, start, type GameState } from './game';
import { boardRound, makeRoundsQuiz, single, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const q = (id: string, points: number) => withPoints(withId(single, id), points);

const field = (id = 'g1') =>
  boardRound(id, [
    { title: 'Міста', cells: [q(`${id}-c11`, 100), q(`${id}-c12`, 200)] },
    { title: 'Річки', cells: [q(`${id}-c21`, 100)] },
  ]);

/** rng, що дає задані грані кубика по черзі. */
const faces = (...values: number[]) => {
  const queue = values.map((v) => (v - 1) / 6 + 0.01);
  return () => queue.shift() ?? 0;
};

/** Заставка поля з гравцями p1, p2, … у порядку аргументів. */
function intro(...names: string[]): GameState {
  return must(start(lobbyWith(makeRoundsQuiz([field()]), ...names)));
}

const roll = (s: GameState, id: string, face: number) => must(rollDie(s, id, faces(face)));

describe('board dice', () => {
  it('everyone rolls on their own phone; the order is by descending result', () => {
    let state = must(startDice(intro('Анна', 'Богдан', 'Віра')));
    expect(state.board?.dice).toEqual({ throws: {}, tour: ['p1', 'p2', 'p3'], waiting: ['p1', 'p2', 'p3'], tourNo: 1 });
    state = roll(state, 'p2', 4);
    state = roll(state, 'p1', 2);
    expect(state.board?.circle).toEqual(['p1', 'p2', 'p3']); // поки тур триває, коло старе
    state = roll(state, 'p3', 6);
    expect(state.board?.dice).toMatchObject({ throws: { p1: [2], p2: [4], p3: [6] }, tour: [], waiting: [] });
    expect(state.board).toMatchObject({ circle: ['p3', 'p2', 'p1'], done: 0, circleNo: 1 });
  });

  it('tied players re-roll among themselves until the tie is gone', () => {
    let state = must(startDice(intro('Анна', 'Богдан', 'Віра')));
    state = roll(roll(roll(state, 'p1', 5), 'p2', 5), 'p3', 2);
    expect(state.board?.dice).toMatchObject({ tour: ['p1', 'p2'], waiting: ['p1', 'p2'], tourNo: 2 });
    expect(rollDie(state, 'p3', faces(6))).toEqual({ ok: false, error: 'not_your_turn' });
    state = roll(roll(state, 'p1', 3), 'p2', 3);
    expect(state.board?.dice).toMatchObject({ tour: ['p1', 'p2'], tourNo: 3 });
    state = roll(roll(state, 'p2', 6), 'p1', 1);
    expect(state.board?.dice?.throws).toEqual({ p1: [5, 3, 1], p2: [5, 3, 6], p3: [2] });
    expect(state.board?.circle).toEqual(['p2', 'p1', 'p3']);
  });

  it('a player rolls once per tour; not while paused; not outside the dice', () => {
    const intro3 = intro('Анна', 'Богдан', 'Віра');
    expect(rollDie(intro3, 'p1', faces(3))).toEqual({ ok: false, error: 'wrong_phase' });
    const state = roll(must(startDice(intro3)), 'p1', 3);
    expect(rollDie(state, 'p1', faces(4))).toEqual({ ok: false, error: 'not_your_turn' });
    expect(rollDie(must(pause(state, 0)), 'p2', faces(4))).toEqual({ ok: false, error: 'paused' });
    expect(startDice(state)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('the host rolls for the rest; a new tie needs another tap', () => {
    let state = roll(must(startDice(intro('Анна', 'Богдан', 'Віра'))), 'p1', 4);
    state = must(rollForRest(state, faces(4, 1))); // p2 — 4, p3 — 1
    expect(state.board?.dice).toMatchObject({ tour: ['p1', 'p2'], waiting: ['p1', 'p2'], tourNo: 2 });
    state = must(rollForRest(state, faces(2, 5)));
    expect(state.board?.circle).toEqual(['p2', 'p1', 'p3']);
    expect(rollForRest(state, faces(1))).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('the round cannot start while someone has to roll; manual order cancels the dice', () => {
    const state = roll(must(startDice(intro('Анна', 'Богдан', 'Віра'))), 'p1', 4);
    expect(next(state, 0)).toEqual({ ok: false, error: 'dice_pending' });
    const manual = must(setOrder(state, ['p3', 'p1', 'p2']));
    expect(manual.board).toMatchObject({ dice: null, circle: ['p3', 'p1', 'p2'] });
    expect(must(next(manual, 0)).phase).toBe('board');
    const done = must(rollForRest(state, faces(6, 1)));
    expect(must(next(done, 0)).phase).toBe('board');
  });

  it('the dice can start again after the order is set', () => {
    const done = must(rollForRest(must(startDice(intro('Анна', 'Богдан'))), faces(6, 1)));
    expect(must(startDice(done)).board?.dice).toEqual({ throws: {}, tour: ['p1', 'p2'], waiting: ['p1', 'p2'], tourNo: 1 });
  });

  it('a single player needs no roll', () => {
    // Як за приходом: без кубиків, тож на екранах немає порожнього кубика.
    expect(must(startDice(intro('Анна'))).board).toMatchObject({ circle: ['p1'], done: 0, circleNo: 1, dice: null });
  });

  it('kicking a tied player ends the tie-break', () => {
    let state = must(startDice(intro('Анна', 'Богдан', 'Віра')));
    state = must(rollForRest(state, faces(5, 5, 2)));
    state = must(removePlayer(state, 'p2'));
    expect(state.board?.dice).toMatchObject({ tour: [], waiting: [] });
    expect(state.board?.circle).toEqual(['p1', 'p3']);
  });

  it('kicking the last player who has to roll closes the first tour', () => {
    let state = roll(roll(must(startDice(intro('Анна', 'Богдан', 'Віра'))), 'p1', 3), 'p2', 6);
    state = must(removePlayer(state, 'p3'));
    expect(state.board).toMatchObject({ circle: ['p2', 'p1'], dice: { tour: [] } });
  });

  it('a disconnected player stays in the tour', () => {
    const state = must(setConnected(must(startDice(intro('Анна', 'Богдан'))), 'p2', false, 0));
    expect(state.board?.dice?.waiting).toEqual(['p1', 'p2']);
  });

  it('every board round starts without dice and in join order', () => {
    const quiz = makeRoundsQuiz([field('g1'), field('g2')]);
    let state = must(start(lobbyWith(quiz, 'Анна', 'Богдан', 'Віра')));
    state = must(rollForRest(must(startDice(state)), faces(1, 6, 3)));
    expect(state.board?.circle).toEqual(['p2', 'p3', 'p1']);
    state = must(endRound(must(next(state, 0)), 0));
    while (state.phase !== 'intro') state = must(next(state, 0));
    expect(state.roundIndex).toBe(1);
    expect(state.board).toMatchObject({ circle: ['p1', 'p2', 'p3'], dice: null, circleNo: 1, done: 0 });
  });

  it('diceOrder compares the throws lexicographically', () => {
    expect(diceOrder(['a', 'b', 'c', 'd'], { a: [2], b: [5, 1], c: [5, 6], d: [3] })).toEqual(['c', 'b', 'd', 'a']);
  });
});
