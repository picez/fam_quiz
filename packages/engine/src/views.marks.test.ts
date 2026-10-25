import { SPLASH_MS, type BoardInfo } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { lock, next, start } from './game';
import { CELL_SURPRISE_MS } from './splash';
import { hostView, playerView, stageView } from './views';
import { boardRound, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must } from './testing/helpers';

const T0 = 1_000_000;
const rng0 = () => 0;
/** Міста: a1 x2, a2; Річки: b1 x3, b2 — усі single, з телефона. */
const quiz = makeRoundsQuiz([
  boardRound('g1', [
    { title: 'Міста', cells: [{ question: withId(single, 'a1'), mark: 'x2' }, withId(single, 'a2')] },
    { title: 'Річки', cells: [{ question: withId(single, 'b1'), mark: 'x3' }, withId(single, 'b2')] },
  ]),
]);
const toBoard = (lobby = lobbyWith(quiz, 'Оля', 'Петро')) => must(next(must(start(lobby)), T0));
const marksOf = (board: BoardInfo | null | undefined) => board?.categories.flatMap((c) => c.cells.map((cell) => cell.mark));

describe('hidden ×2/×3', () => {
  it('the stage and the phones get no marks of unplayed cells; the host sees all', () => {
    const s = toBoard();
    expect(s.phase).toBe('board');
    expect(marksOf(stageView(s).board)).toEqual(['none', 'none', 'none', 'none']);
    expect(marksOf(playerView(s, 'p1')?.board)).toEqual(['none', 'none', 'none', 'none']);
    expect(marksOf(hostView(s).board)).toEqual(['x2', 'none', 'x3', 'none']);
    expect(JSON.stringify(stageView(s))).not.toMatch(/"mark":"x[23]"/);
    expect(JSON.stringify(playerView(s, 'p1'))).not.toMatch(/"mark":"x[23]"/);
    expect(stageView(s).board).toMatchObject({ marks: ['x2', 'x3'], marksHidden: true });
    expect(playerView(s, 'p2')?.board).toMatchObject({ marks: ['x2', 'x3'], marksHidden: true });
    expect(hostView(s).board).toMatchObject({ marks: ['x2', 'x3'], marksHidden: false });
  });

  it('a chosen cell shows its mark to everybody; a played cell keeps it', () => {
    const open = must(pickCell(toBoard(), 'p1', 'a1', T0, rng0));
    expect(stageView(open).board?.cell?.mark).toBe('x2');
    expect(playerView(open, 'p2')?.board?.cell?.mark).toBe('x2');
    expect(marksOf(playerView(open, 'p2')?.board)).toEqual(['x2', 'none', 'none', 'none']);
    expect(marksOf(stageView(open).board)).toEqual(['x2', 'none', 'none', 'none']);
    let back = must(lock(open));
    while (back.phase !== 'board') back = must(next(back, T0));
    expect(marksOf(stageView(back).board)).toEqual(['x2', 'none', 'none', 'none']);
    expect(marksOf(playerView(back, 'p1')?.board)).toEqual(['x2', 'none', 'none', 'none']);
    expect(marksOf(hostView(back).board)).toEqual(['x2', 'none', 'x3', 'none']);
  });

  it('a round without marks lists none', () => {
    const plain = makeRoundsQuiz([boardRound('g1', [{ title: 'Міста', cells: [withId(single, 'a1')] }])]);
    const s = must(next(must(start(lobbyWith(plain, 'Оля'))), T0));
    expect(stageView(s).board).toMatchObject({ marks: [], marksHidden: true });
  });

  it('a marked cell flips longer for the surprise; an unmarked one keeps 1 s', () => {
    const marked = must(pickCell(toBoard(lobbyWithSplash(quiz, 'Оля', 'Петро')), 'p1', 'a1', T0, rng0));
    expect(marked.splash).toEqual({ kind: 'cell', at: T0, until: T0 + SPLASH_MS.cell + CELL_SURPRISE_MS });
    expect(marked.startedAt).toBe(T0 + SPLASH_MS.cell + CELL_SURPRISE_MS);
    expect(marked.endsAt).toBe(T0 + SPLASH_MS.cell + CELL_SURPRISE_MS + 20_000);
    const x3 = must(pickCell(toBoard(lobbyWithSplash(quiz, 'Оля', 'Петро')), 'p1', 'b1', T0, rng0));
    expect(x3.splash).toEqual({ kind: 'cell', at: T0, until: T0 + SPLASH_MS.cell + CELL_SURPRISE_MS });
    const plain = must(pickCell(toBoard(lobbyWithSplash(quiz, 'Оля', 'Петро')), 'p1', 'a2', T0, rng0));
    expect(plain.splash).toEqual({ kind: 'cell', at: T0, until: T0 + SPLASH_MS.cell });
    expect(plain.startedAt).toBe(T0 + SPLASH_MS.cell);
    const bare = must(pickCell(toBoard(), 'p1', 'a1', T0, rng0));
    expect(bare.splash).toBeNull();
    expect(bare.startedAt).toBe(T0);
  });
});
