import { describe, expect, it } from 'vitest';
import type { Answer, BetsRound, Question, QuizSettings } from '@quiz/shared';
import { adjustScore } from './adjust';
import { awayStart, awayTracked } from './away';
import { hostLive } from './live';
import { betLimit, betsMinimumNow, betsPlaying } from './bets';
import { guessWord, takeHint } from './chain';
import { placeWager } from './final';
import { end, endRound, finalOutcome, lock, next, override, recordOf, removePlayer, setConnected, speedOn, start, submitAnswer, tick, type GameState } from './game';
import { sortOf, sortWord } from './sort';
import { ladderBack, ladderWord } from './wordladder';
import { betsRound, bool, chain, classicRound, makeRoundsQuiz, numeric, single, sortQ, withId, withPoints, wordladder } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must } from './testing/helpers';

const rng = () => 0;
const right: Answer = { type: 'single', optionId: 'b' };
const wrong: Answer = { type: 'single', optionId: 'a' };
const T = 100_000;

const b1 = withId(single, 'b1');
const b2 = withId(bool, 'b2');
const b3 = withId(numeric, 'b3');

const scores = (state: GameState) => state.players.map((p) => p.score);
const current = (state: GameState) => state.plays[state.questionIndex];
const pointsOf = (state: GameState, playerId: string) => recordOf(state, state.questionIndex, playerId)?.points;

type Options = Partial<Omit<BetsRound, 'id' | 'type' | 'questions'>>;

/**
 * Класичний раунд r1 (одне запитання, ніхто не відповідає), далі «Ставки» r2 (b1 single, b2 boolean, b3 numeric; типово betMax 600).
 * Гравці Олена p1, Тарас p2, Віра p3, Хосе p4; на round_end r1 ведучий дає 800 / 500 / 300 / 0. Гра — на заставці r2.
 */
function toIntro(options: Options = {}, settings: Partial<QuizSettings> = {}, questions: Question[] = [b1, b2, b3], given = [800, 500, 300, 0]): GameState {
  const quiz = makeRoundsQuiz([classicRound('r1', [single]), betsRound('r2', questions, { betMax: 600, ...options })], settings);
  let s = must(start(lobbyWith(quiz, 'Олена', 'Тарас', 'Віра', 'Хосе')));
  s = must(next(s, 0, rng));
  s = must(next(must(lock(s)), 1000, rng));
  s = must(next(s, 2000, rng));
  expect(s.phase).toBe('round_end');
  given.forEach((points, i) => {
    if (points !== 0) s = must(adjustScore(s, `p${i + 1}`, points, 3000));
  });
  return must(next(s, 4000, rng));
}

/** Етап ставок запитання 1 раунду r2. */
function toWager(options: Options = {}, settings: Partial<QuizSettings> = {}, questions?: Question[], given?: number[]): GameState {
  return must(next(toIntro(options, settings, questions, given), T, rng));
}

/** Ставки по черзі (о now). */
function bet(state: GameState, wagers: Record<string, number>, now = T): GameState {
  return Object.entries(wagers).reduce((s, [id, amount]) => must(placeWager(s, id, amount, now, rng)), state);
}

/** Відповіді по черзі (о now + 1000). */
function answer(state: GameState, answers: Record<string, Answer>, now = T): GameState {
  return Object.entries(answers).reduce((s, [id, a]) => must(submitAnswer(s, id, a, now + 1000)), state);
}

/** Олена 400, Тарас 200, Віра 300 — запитання 1 відкрито. */
const opened = (options: Options = {}, settings: Partial<QuizSettings> = {}) => bet(toWager(options, settings), { p1: 400, p2: 200, p3: 300 });

describe('the bets round (27a)', () => {
  it('each question starts with secret bets from a growing minimum', () => {
    const wager = toWager();
    expect(wager.phase).toBe('wager');
    expect(wager.final).toEqual({ limits: { p1: 600, p2: 500, p3: 300, p4: 0 }, wagers: {}, allIn: [], order: [], shown: 0, split: false });
    expect(wager.startedAt).toBeNull();
    expect(wager.endsAt).toBeNull();
    expect(betsMinimumNow(wager)).toBe(200);
    expect(tick(wager, 1e9)).toBe(wager);

    // Запитання 2 і 3: мінімум 300 і 400; ніхто не ставить, ведучий відкриває сам.
    let s = must(next(wager, T, rng));
    s = must(next(must(lock(s)), T + 1000, rng));
    s = must(next(s, T + 2000, rng));
    expect(s.phase).toBe('leaderboard');
    s = must(next(s, T + 3000, rng));
    expect(s.phase).toBe('wager');
    expect(betsMinimumNow(s)).toBe(300);
    s = must(next(s, T + 4000, rng));
    expect(current(s).question.id).toBe('b2');
    s = must(next(must(next(must(next(must(lock(s)), T + 5000, rng)), T + 6000, rng)), T + 7000, rng));
    expect(s.phase).toBe('wager');
    expect(betsMinimumNow(s)).toBe(400);
  });

  it('refuses bets outside the range and from players below the minimum', () => {
    const wager = toWager();
    const before = JSON.parse(JSON.stringify(wager)) as GameState;
    for (const [id, amount, error] of [
      ['p1', 700, 'bet_range'],
      ['p1', 199, 'bet_range'],
      ['p1', 2.5, 'bet_range'],
      ['p4', 200, 'bet_skipped'],
    ] as const) {
      expect(placeWager(wager, id, amount, T, rng)).toEqual({ ok: false, error });
    }
    // Відмова стану не чіпає: ані ставок, ані етапу.
    expect(wager).toEqual(before);
    expect(wager.final?.wagers).toEqual({});
    const placed = bet(wager, { p1: 400 });
    expect(placed.final?.wagers).toEqual({ p1: 400 });
    const changed = bet(placed, { p1: 450 });
    expect(changed.final?.wagers).toEqual({ p1: 450 });
    expect(changed.phase).toBe('wager');
  });

  it('opens when everyone who can bet has placed', () => {
    const s = opened();
    expect(s.phase).toBe('question');
    expect(current(s).question.id).toBe('b1');
    expect(current(s).final).toEqual({ wagers: { p1: 400, p2: 200, p3: 300 }, allIn: [], graded: [] });
    expect(betsPlaying(s)).toEqual(['p1', 'p2', 'p3']);
  });

  it('the host can open early; who did not bet skips', () => {
    const s = must(next(bet(toWager(), { p1: 400 }), T, rng));
    expect(s.phase).toBe('question');
    expect(current(s).final?.wagers).toEqual({ p1: 400 });
    expect(betsPlaying(s)).toEqual(['p1']);
  });

  it('only those who play are expected live and watched for leaving', () => {
    const s = must(next(bet(toWager(), { p1: 400, p3: 300 }), T, rng));
    const live = hostLive(s);
    expect(live?.rows.map((r) => r.id)).toEqual(['p1', 'p3']);
    expect(live?.total).toBe(2);
    expect(['p1', 'p2', 'p3', 'p4'].map((id) => awayTracked(s, id))).toEqual([true, false, true, false]);
    // Хто пропускає, той може відкласти телефон: запису виходу немає, на сцені його немає.
    const left = awayStart(awayStart(s, 'p2', T + 1000), 'p4', T + 1000);
    expect(left).toBe(s);
    expect(Object.keys(current(awayStart(left, 'p1', T + 1000)).away ?? {})).toEqual(['p1']);
  });

  it('splits the bank of the losers among the winners by stake', () => {
    const s = must(next(answer(opened(), { p1: right, p2: wrong, p3: wrong }), T + 5000, rng));
    expect(s.phase).toBe('reveal');
    expect([pointsOf(s, 'p1'), pointsOf(s, 'p2'), pointsOf(s, 'p3')]).toEqual([500, -200, -300]);
    expect(scores(s)).toEqual([1300, 300, 0, 0]);
    expect(recordOf(s, s.questionIndex, 'p4')).toBeUndefined();

    const two = must(next(answer(opened(), { p1: right, p2: right, p3: wrong }), T + 5000, rng));
    expect([pointsOf(two, 'p1'), pointsOf(two, 'p2'), pointsOf(two, 'p3')]).toEqual([200, 100, -300]);
  });

  it('everyone wrong gets the stakes back', () => {
    const s = must(next(answer(opened(), { p1: wrong, p2: wrong, p3: wrong }), T + 5000, rng));
    expect([pointsOf(s, 'p1'), pointsOf(s, 'p2'), pointsOf(s, 'p3')]).toEqual([0, 0, 0]);
    expect(finalOutcome(s)?.refund).toBe(true);
    expect(scores(s)).toEqual([800, 500, 300, 0]);
  });

  it('a bettor who stays silent loses the stake', () => {
    const answered = answer(opened(), { p1: right, p3: wrong });
    expect(answered.phase).toBe('question');
    const locked = tick(answered, T + 60_000);
    expect(locked.phase).toBe('locked');
    const s = must(next(locked, T + 61_000, rng));
    expect(recordOf(s, s.questionIndex, 'p2')).toMatchObject({ grade: 'wrong', answer: null, points: -200 });
    expect(pointsOf(s, 'p1')).toBe(500);
    expect(recordOf(s, s.questionIndex, 'p4')).toBeUndefined();
  });

  it('the question closes when every present bettor has answered', () => {
    const s = answer(opened(), { p1: right, p2: wrong, p3: wrong });
    expect(s.phase).toBe('locked');
  });

  it('reveal shows everyone at once and goes on like a classic round', () => {
    const locked = answer(opened(), { p1: right, p2: wrong, p3: wrong });
    const reveal = must(next(locked, T + 5000, rng));
    expect(reveal.phase).toBe('reveal');
    expect(reveal.final?.order.length).toBeGreaterThan(0);
    expect(reveal.final?.shown).toBe(reveal.final?.order.length);
    expect(reveal.final?.split).toBe(true);
    const board = must(next(reveal, T + 6000, rng));
    expect(board.phase).toBe('leaderboard');
    const second = must(next(board, T + 7000, rng));
    expect(second.phase).toBe('wager');
    expect(second.final).toMatchObject({ wagers: {}, allIn: [], order: [], shown: 0, split: false });
    expect(second.final?.limits).toEqual({ p1: 600, p2: 300, p3: 0, p4: 0 });

    const straight = must(next(must(next(answer(opened({}, { leaderboard: 'end' }), { p1: right, p2: wrong, p3: wrong }), T + 5000, rng)), T + 6000, rng));
    expect(straight.phase).toBe('wager');
    expect(betsMinimumNow(straight)).toBe(300);

    // Решту запитань ведучий відкриває без ставок; після останнього — кінець гри (r2 — останній раунд).
    let s = straight;
    for (const at of [T + 10_000, T + 20_000]) s = must(next(must(next(must(lock(must(next(s, at, rng)))), at + 1000, rng)), at + 2000, rng));
    expect(s.phase).toBe('finished');
  });

  it('a player who lost everything skips the rest of the round', () => {
    const reveal = must(next(answer(opened({}, { leaderboard: 'end' }), { p1: right, p2: wrong, p3: wrong }), T + 5000, rng));
    const second = must(next(reveal, T + 6000, rng));
    expect(scores(second)[2]).toBe(0);
    expect(placeWager(second, 'p3', 300, T + 7000, rng)).toEqual({ ok: false, error: 'bet_skipped' });
    expect(placeWager(second, 'p2', 300, T + 7000, rng).ok).toBe(true);
  });

  it('host points during bets move the limit and can drop a bet', () => {
    const wager = bet(toWager(), { p2: 500 });
    const lower = must(adjustScore(wager, 'p2', -100, T));
    expect(betLimit(lower, 'p2')).toBe(400);
    expect(lower.final?.limits.p2).toBe(400);
    expect(lower.final?.wagers.p2).toBe(400);

    const higher = must(adjustScore(wager, 'p1', 1000, T));
    expect(higher.final?.limits.p1).toBe(600);

    // Запитання 2 (мінімум 300): Тарас з 300 ставить 300, ведучий −50 — межа 250, ставку знято.
    const reveal = must(next(answer(opened({}, { leaderboard: 'end' }), { p1: right, p2: wrong, p3: wrong }), T + 5000, rng));
    const second = bet(must(next(reveal, T + 6000, rng)), { p2: 300 }, T + 7000);
    expect(second.final?.wagers).toEqual({ p2: 300 });
    const dropped = must(adjustScore(second, 'p2', -50, T + 7000));
    expect(dropped.final?.limits.p2).toBe(250);
    expect(dropped.final?.wagers).toEqual({});
    expect(placeWager(dropped, 'p2', 250, T + 8000, rng)).toEqual({ ok: false, error: 'bet_skipped' });
    // Олена — остання, хто може ставити: її ставка відкриває запитання.
    const open = bet(dropped, { p1: 300 }, T + 8000);
    expect(open.phase).toBe('question');
    expect(betsPlaying(open)).toEqual(['p1']);
  });

  it('away and removed players neither hold the bets nor re-split a shown question', () => {
    const away = must(setConnected(toWager({}, { leaderboard: 'end' }), 'p3', false, T));
    const s = bet(away, { p1: 400, p2: 200 });
    expect(s.phase).toBe('question');
    expect(current(s).final?.wagers).toEqual({ p1: 400, p2: 200 });
    const reveal = must(next(answer(s, { p1: right, p2: wrong }), T + 5000, rng));
    expect([pointsOf(reveal, 'p1'), pointsOf(reveal, 'p2')]).toEqual([200, -200]);
    const second = must(next(reveal, T + 6000, rng));
    expect(second.phase).toBe('wager');
    const first = second.questionIndex;
    for (const removed of ['p3', 'p2']) {
      const without = must(removePlayer(second, removed));
      expect(recordOf(without, first, 'p1')?.points).toBe(200);
      if (removed === 'p3') expect(recordOf(without, first, 'p2')?.points).toBe(-200);
    }
  });

  it('a skipper cannot answer or move in any question type', () => {
    const questions = [b1, withId(chain, 'b2'), withId(sortQ, 'b3'), withId(wordladder, 'b4')];
    let s = toWager({ betMax: null }, { leaderboard: 'end' }, questions);
    const skipped = { ok: false, error: 'bet_skipped' };
    for (let k = 0; k < questions.length; k++) {
      const at = T + k * 100_000;
      s = must(next(bet(s, { p1: betsMinimumNow(s) ?? 0 }, at), at, rng));
      expect(s.phase).toBe('question');
      const now = at + 1000;
      const type = current(s).question.type;
      if (type === 'single') expect(submitAnswer(s, 'p4', right, now)).toEqual(skipped);
      if (type === 'chain') {
        expect(guessWord(s, 'p4', 'Риба', now)).toEqual(skipped);
        expect(takeHint(s, 'p4', now)).toEqual(skipped);
        expect(guessWord(s, 'p1', 'Риба', now).ok).toBe(true);
      }
      if (type === 'sort') {
        expect(sortWord(s, 'p4', 'w1', 'c1', now)).toEqual(skipped);
        const head = sortQ.words.find((w) => w.id === sortOf(s, 'p1').queue[0]);
        expect(sortWord(s, 'p1', head?.id ?? '', head?.categoryId ?? '', now).ok).toBe(true);
      }
      if (type === 'wordladder') {
        expect(ladderWord(s, 'p4', 'пола', now, () => false)).toEqual(skipped);
        expect(ladderBack(s, 'p4', now)).toEqual(skipped);
        expect(ladderWord(s, 'p1', 'пола', now, () => false).ok).toBe(true);
      }
      s = must(next(must(next(must(lock(s)), at + 2000, rng)), at + 3000, rng));
    }
    expect(s.phase).toBe('finished');
  });

  it('a bet after the question opened is refused', () => {
    const s = opened();
    const before = JSON.parse(JSON.stringify(s)) as GameState;
    expect(placeWager(s, 'p1', 400, T + 1000, rng)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(s).toEqual(before);
  });

  it('manual check and the host grade recompute the bank', () => {
    const locked = answer(opened({ check: 'manual' }), { p1: right, p2: wrong, p3: wrong });
    expect(locked.phase).toBe('locked');
    for (const id of ['p1', 'p2', 'p3']) expect(recordOf(locked, locked.questionIndex, id)?.grade).toBe('wrong');
    const graded = must(override(locked, 'p1', 'correct'));
    expect([pointsOf(graded, 'p1'), pointsOf(graded, 'p2'), pointsOf(graded, 'p3')]).toEqual([500, -200, -300]);
    const reveal = must(next(graded, T + 5000, rng));
    expect([pointsOf(reveal, 'p1'), pointsOf(reveal, 'p2'), pointsOf(reveal, 'p3')]).toEqual([500, -200, -300]);
    const regraded = must(override(reveal, 'p2', 'correct'));
    expect([pointsOf(regraded, 'p1'), pointsOf(regraded, 'p2'), pointsOf(regraded, 'p3')]).toEqual([200, 100, -300]);
    expect(scores(regraded)).toEqual([1000, 600, 0, 0]);
  });

  it('no speed, price or multiplier counts', () => {
    const quizRound = betsRound('r', [withPoints(b1, 5000)]);
    expect(speedOn(quizRound)).toBe(false);
    const wager = toWager({}, {}, [withPoints(b1, 5000), b2]);
    const s = must(next(answer(bet(wager, { p1: 400, p2: 200, p3: 300 }), { p1: right, p2: wrong, p3: wrong }), T + 5000, rng));
    expect([pointsOf(s, 'p1'), pointsOf(s, 'p2'), pointsOf(s, 'p3')]).toEqual([500, -200, -300]);
    expect(recordOf(s, s.questionIndex, 'p1')).toMatchObject({ basePoints: 500, streakBonus: 0 });
  });

  it('nobody can bet', () => {
    const wager = toWager({}, {}, undefined, [0, 0, 0, 0]);
    expect(wager.phase).toBe('wager');
    for (const id of ['p1', 'p2', 'p3', 'p4']) expect(placeWager(wager, id, 200, T, rng)).toEqual({ ok: false, error: 'bet_skipped' });
    const open = must(next(wager, T, rng));
    expect(open.phase).toBe('question');
    expect(current(open).final?.wagers).toEqual({});
    expect(betsPlaying(open)).toEqual([]);
    expect(submitAnswer(open, 'p1', right, T + 1000)).toEqual({ ok: false, error: 'bet_skipped' });
    const reveal = must(next(must(lock(open)), T + 2000, rng));
    expect(reveal.phase).toBe('reveal');
    expect(current(reveal).answers).toEqual({});
    expect(scores(reveal)).toEqual([0, 0, 0, 0]);
  });

  it('ending the game or the round on an open question settles the bettors only', () => {
    const answered = answer(opened(), { p1: right });
    for (const closed of [must(end(answered, T + 2000)), must(endRound(answered, T + 2000))]) {
      expect(closed.phase).toBe('finished');
      expect(recordOf(closed, closed.questionIndex, 'p2')).toMatchObject({ grade: 'wrong', answer: null, points: -200 });
      expect([pointsOf(closed, 'p1'), pointsOf(closed, 'p3')]).toEqual([500, -300]);
      expect(recordOf(closed, closed.questionIndex, 'p4')).toBeUndefined();
      expect(scores(closed)).toEqual([1300, 300, 0, 0]);
    }
  });

  it('the round opens with the round splash and each question with the question splash', () => {
    const quiz = makeRoundsQuiz([betsRound('r', [b1])]);
    const intro = must(start(lobbyWithSplash(quiz, 'Олена'), T));
    expect(intro.splash?.kind).toBe('round');
    expect(intro.final).toEqual({ limits: {}, wagers: {}, allIn: [], order: [], shown: 0, split: false });
    const open = must(next(must(next(intro, T + 10_000, rng)), T + 20_000, rng));
    expect(open.phase).toBe('question');
    expect(open.splash?.kind).toBe('question');
  });
});
