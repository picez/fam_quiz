import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Question } from '@quiz/shared';
import { pickCell } from './board';
import { guessWord } from './chain';
import { placeWager } from './final';
import { lock, next, pause, resume, start, type GameState } from './game';
import { sortWord } from './sort';
import { blitzRound, boardRound, chain, finalRound, makeRoundsQuiz, single, sortQ, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { head, right, sortAll, toSort, wrong } from './testing/sort';
import { hostView, playerView, stageView } from './views';

const rng = () => 0;
const wordOf = (id: string) => {
  const word = sortQ.words.find((w) => w.id === id);
  return { id, text: word?.text ?? '' };
};
const toReveal = (s: GameState, now: number) => must(next(must(lock(s)), now, rng));

/** Поле з p1 «Анна» і p2 «Богдан»: p1 вибрав клітинку ×2 із сортуванням о 1000. */
function onBoardSort(): GameState {
  const round = boardRound(
    'g1',
    [
      { title: 'Сортування', cells: [{ mark: 'x2', answerMode: 'phone', question: sortQ }] },
      { title: 'Інше', cells: [withPoints(withId(single, 's1'), 300)] },
    ],
    { rules: DEFAULT_RULES },
  );
  const board = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Анна', 'Богдан'))), 0));
  return must(pickCell(board, 'p1', 'q9', 1000, rng));
}

/** Фінал-раунд з одним запитанням; ставки 0, запитання відкрито о 2000. */
function inFinal(question: Question, check: 'auto' | 'manual' = 'auto'): GameState {
  let s = must(start(lobbyWith(makeRoundsQuiz([finalRound('f', question, { check })], { leaderboard: 'end' }), 'Анна', 'Богдан')));
  while (s.phase !== 'wager') s = must(next(s, 0, rng));
  s = must(placeWager(s, 'p1', 0, 1000, rng));
  return must(placeWager(s, 'p2', 0, 2000, rng));
}

describe('sort views', () => {
  it("never sends a word's category or other words before the reveal", () => {
    let s = toSort();
    s = must(sortWord(s, 'p1', head(s, 'p1'), right(head(s, 'p1')), 2000));
    const stage = JSON.stringify(stageView(s));
    const player = JSON.stringify(playerView(s, 'p2'));
    expect(stage).not.toContain('categoryId');
    expect(player).not.toContain('categoryId');
    for (const w of sortQ.words) expect(stage).not.toContain(w.text);
    // У зрізі p2 є лише текст його поточної картки.
    expect(sortQ.words.filter((w) => player.includes(w.text)).map((w) => w.id)).toEqual([head(s, 'p2')]);
    const own = JSON.stringify(playerView(s, 'p1'));
    expect(sortQ.words.filter((w) => own.includes(w.text)).map((w) => w.id)).toEqual([head(s, 'p1')]);
    expect(JSON.stringify(stageView(must(lock(s))))).not.toContain('categoryId');
    const revealed = stageView(toReveal(s, 3000));
    expect(revealed.reveal).toMatchObject({ type: 'sort', words: sortQ.words });
  });

  it('the stage sees the categories and live progress', () => {
    let s = toSort();
    expect(stageView(s).question?.sort).toEqual({
      categories: [
        { id: 'c1', text: 'Овочі' },
        { id: 'c2', text: 'Фрукти' },
      ],
      total: 4,
      lockSeconds: 3,
    });
    s = sortAll(s, 'p1', 9000);
    s = must(sortWord(s, 'p2', head(s, 'p2'), wrong(head(s, 'p2')), 9000));
    expect(stageView(s).sort).toEqual({
      total: 4,
      rows: [
        { playerId: 'p1', nickname: 'Анна', sorted: 4, misses: 0, timeMs: 8000, points: null },
        { playerId: 'p2', nickname: 'Богдан', sorted: 0, misses: 1, timeMs: null, points: null },
      ],
      winner: null,
    });
    expect(hostView(s).sort?.rows.map((r) => r.points)).toEqual([null, null]);
    expect(stageView(toReveal(s, 10_000)).sort?.rows.map((r) => r.points)).toEqual([400, 0]);
  });

  it('progress rows keep the player order during the question; from locked: finishers by time, then by sorted words, then in player order', () => {
    let s = startRound(lobbyWith(toSort().quiz, 'Анна', 'Богдан', 'Віра'), 1000, rng);
    s = must(sortWord(s, 'p3', head(s, 'p3'), right(head(s, 'p3')), 2000));
    expect(stageView(s).sort?.rows.map((r) => r.playerId)).toEqual(['p1', 'p2', 'p3']);
    s = sortAll(s, 'p2', 3000);
    expect(stageView(s).sort?.rows.map((r) => r.playerId)).toEqual(['p1', 'p2', 'p3']);
    s = must(lock(s));
    expect(stageView(s).sort?.rows.map((r) => r.playerId)).toEqual(['p2', 'p3', 'p1']);
    expect(stageView(must(next(s, 10_000, rng))).sort?.rows.map((r) => r.playerId)).toEqual(['p2', 'p3', 'p1']);
  });

  it('a non-sort question has no sort data', () => {
    const s = startRound(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single])]), 'Анна'), 1000, rng);
    expect(stageView(s).question?.sort).toBeNull();
    expect(stageView(s).sort).toBeNull();
    expect(hostView(s).sort).toBeNull();
    expect(playerView(s, 'p1')?.me.sort).toBeNull();
  });

  it('the player sees only the own card, lock and progress', () => {
    let s = toSort();
    expect(playerView(s, 'p1')?.me.sort).toEqual({
      card: wordOf(head(s, 'p1')),
      sorted: 0,
      total: 4,
      misses: 0,
      lockedUntil: null,
      lockRemainingMs: null,
      missed: null,
      canSort: true,
      timeMs: null,
    });
    const first = head(s, 'p1');
    s = must(sortWord(s, 'p1', first, wrong(first), 2000));
    expect(playerView(s, 'p1')?.me.sort).toEqual({
      card: wordOf(head(s, 'p1')),
      sorted: 0,
      total: 4,
      misses: 1,
      lockedUntil: 5000,
      lockRemainingMs: null,
      missed: wordOf(first),
      canSort: true,
      timeMs: null,
    });
    s = must(pause(s, 3000));
    expect(playerView(s, 'p1')?.me.sort).toMatchObject({ lockedUntil: null, lockRemainingMs: 2000, canSort: false });
    s = must(resume(s, 4000));
    expect(playerView(s, 'p1')?.me.sort).toMatchObject({ lockedUntil: 6000, lockRemainingMs: null, canSort: true });
    s = sortAll(s, 'p1', 7000);
    expect(playerView(s, 'p1')?.me.sort).toMatchObject({ card: null, sorted: 4, misses: 1, canSort: false, timeMs: 5000 });
    expect(playerView(must(lock(s)), 'p2')?.me.sort).toMatchObject({ canSort: false });
  });

  it('the board shows a sort cell at its full price: words × points per word', () => {
    const s = onBoardSort();
    expect(stageView(s).board?.categories[0]?.cells[0]?.price).toBe(400);
    expect(playerView(s, 'p2')?.board?.categories[0]?.cells[0]?.price).toBe(400);
    expect(stageView(s).board?.cell?.price).toBe(400);
  });

  it("a board sort: the chooser plays, the others watch only the chooser's row", () => {
    let s = onBoardSort();
    s = must(sortWord(s, 'p1', head(s, 'p1'), right(head(s, 'p1')), 2000));
    expect(playerView(s, 'p2')?.me.sort).toBeNull();
    expect(playerView(s, 'p1')?.me.sort).toMatchObject({ sorted: 1, canSort: true });
    expect(stageView(s).sort?.rows.map((r) => [r.playerId, r.sorted])).toEqual([['p1', 1]]);
    expect(playerView(s, 'p2')?.sort?.rows.map((r) => r.playerId)).toEqual(['p1']);
    const p2 = JSON.stringify(playerView(s, 'p2'));
    for (const w of sortQ.words) expect(p2).not.toContain(w.text);
    expect(stageView(s).spotlight).toBeNull();
    const locked = must(lock(s));
    expect(stageView(locked).spotlight).toBeNull();
    const revealed = must(next(locked, 3000, rng));
    expect(revealed.phase).toBe('reveal');
    expect(stageView(revealed).spotlight).toBeNull();
    expect(hostView(revealed).spotlight).toBeNull();
    expect(stageView(revealed).sort?.rows).toEqual([
      { playerId: 'p1', nickname: 'Анна', sorted: 1, misses: 0, timeMs: null, points: 200 },
    ]);
  });

  it('a sort final hides the others and counts movers, not finishers', () => {
    let s = inFinal(sortQ, 'manual');
    s = sortAll(s, 'p1', 3000);
    s = must(sortWord(s, 'p2', head(s, 'p2'), right(head(s, 'p2')), 3000));
    expect(s.phase).toBe('question');
    expect(stageView(s).sort).toBeNull();
    expect(playerView(s, 'p2')?.sort).toBeNull();
    expect(playerView(s, 'p2')?.me.sort).toMatchObject({ sorted: 1, canSort: true });
    expect(hostView(s).sort?.rows).toHaveLength(2);
    expect(Object.keys(s.plays[0].answers)).toEqual(['p1']);
    expect(stageView(s).answeredCount).toBe(2);
    expect(hostView(s).answeredCount).toBe(2);
    // Ручна перевірка для сортування не діє: відповіді не чекають на оцінку.
    expect(hostView(s).final?.manual).toBe(true);
    expect(hostView(s).final?.pending).toEqual([]);
    expect(hostView(must(lock(s))).final?.pending).toEqual([]);
  });

  it('a manual chain final has no pending answers either', () => {
    let s = inFinal(chain, 'manual');
    s = ['Риба', 'Океан', 'Корабель'].reduce((current, word) => must(guessWord(current, 'p1', word, 3000)), s);
    s = must(guessWord(s, 'p2', 'Риба', 3000));
    expect(hostView(s).final?.pending).toEqual([]);
    expect(hostView(must(lock(s))).final?.pending).toEqual([]);
  });

  it('the blitz winner shows to everyone once the question is closed', () => {
    const round = blitzRound('b1', [sortQ], { check: 'manual', rules: { ...DEFAULT_RULES, partial: null } });
    let s = startRound(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Анна', 'Богдан'), 1000, rng);
    s = must(sortWord(s, 'p2', head(s, 'p2'), right(head(s, 'p2')), 1500));
    expect(stageView(s).sort?.winner).toBeNull();
    expect(hostView(s).sort?.winner).toBeNull();
    s = sortAll(s, 'p1', 2000);
    expect(s.phase).toBe('locked');
    expect(stageView(s).sort?.winner).toEqual({ playerId: 'p1', nickname: 'Анна' });
    expect(playerView(s, 'p2')?.sort?.winner).toEqual({ playerId: 'p1', nickname: 'Анна' });
    expect(stageView(must(next(s, 3000, rng))).sort?.winner).toEqual({ playerId: 'p1', nickname: 'Анна' });
  });

  it('a classic sort has no winner', () => {
    const s = sortAll(toSort(), 'p1', 2000);
    expect(stageView(must(lock(s))).sort?.winner).toBeNull();
  });
});
