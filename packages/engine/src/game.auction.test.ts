import { describe, expect, it } from 'vitest';
import { AUCTION_OPEN_MS, type Answer, type AuctionRound, type Question, type QuizSettings } from '@quiz/shared';
import { adjustScore } from './adjust';
import { auctionLeader, auctionNextNow } from './auction';
import { betsPlaying } from './bets';
import { guessWord, takeHint } from './chain';
import { checkAnswer } from './check';
import { placeWager } from './final';
import { lock, next, override, pause, recordOf, removePlayer, resume, speedOn, start, submitAnswer, tick, type GameState } from './game';
import { sortOf, sortWord } from './sort';
import { ladderBack, ladderWord } from './wordladder';
import { auctionRound, bool, chain, classicRound, makeRoundsQuiz, multi, numeric, single, sortQ, withId, withPoints, wordladder } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const rng = () => 0;
const right: Answer = { type: 'single', optionId: 'b' };
const wrong: Answer = { type: 'single', optionId: 'a' };
const t0 = 1_000_000;

const a1 = withPoints(withId(single, 'a1'), 200);
const a2 = withPoints(withId(bool, 'a2'), 300);
const a3 = withPoints(withId(numeric, 'a3'), 200);

const scores = (state: GameState) => state.players.map((p) => p.score);
const current = (state: GameState) => state.plays[state.questionIndex];
const pointsOf = (state: GameState, playerId: string) => recordOf(state, state.questionIndex, playerId)?.points;
const snapshot = (state: GameState) => JSON.parse(JSON.stringify(state)) as GameState;

type Options = Partial<Omit<AuctionRound, 'id' | 'type' | 'questions'>>;

/**
 * Класичний раунд r1 (одне запитання, ніхто не відповідає), далі «Аукціон» r2 (a1 single 200, a2 boolean 300, a3 numeric 200).
 * Гравці Олена p1, Тарас p2, Віра p3, Хосе p4; на round_end r1 ведучий дає 800 / 500 / 300 / 0. Гра — на заставці r2.
 */
function toIntro(options: Options = {}, settings: Partial<QuizSettings> = {}, questions: Question[] = [a1, a2, a3]): GameState {
  const quiz = makeRoundsQuiz([classicRound('r1', [single]), auctionRound('r2', questions, options)], settings);
  let s = must(start(lobbyWith(quiz, 'Олена', 'Тарас', 'Віра', 'Хосе')));
  s = must(next(s, 0, rng));
  s = must(next(must(lock(s)), 1000, rng));
  s = must(next(s, 2000, rng));
  expect(s.phase).toBe('round_end');
  [800, 500, 300, 0].forEach((points, i) => {
    if (points !== 0) s = must(adjustScore(s, `p${i + 1}`, points, 3000));
  });
  return must(next(s, 4000, rng));
}

/** Торг запитання 1 раунду r2 (о t0). */
function toBidding(options: Options = {}, settings: Partial<QuizSettings> = {}, questions?: Question[]): GameState {
  return must(next(toIntro(options, settings, questions), t0, rng));
}

/** Ставки по черзі (о now). */
function bid(state: GameState, bids: [string, number][], now = t0): GameState {
  return bids.reduce((s, [id, amount]) => must(placeWager(s, id, amount, now, rng)), state);
}

/** Торг продано ведучим («Продано») о now. */
const sell = (state: GameState, now = t0 + 1000) => must(next(state, now, rng));

/** locked → reveal. */
const reveal = (state: GameState, now = t0 + 30_000) => must(next(state.phase === 'question' ? must(lock(state)) : state, now, rng));

describe('the auction round (27b)', () => {
  it('bidding starts with the theme clock and no leader', () => {
    const s = toBidding();
    expect(s.phase).toBe('wager');
    expect(s.final?.limits).toEqual({ p1: 800, p2: 500, p3: 300, p4: 0 });
    expect(s.final?.wagers).toEqual({});
    expect(s.startedAt).toBe(t0);
    expect(s.endsAt).toBe(t0 + AUCTION_OPEN_MS);
    expect(auctionNextNow(s)).toBe(100);
    expect(auctionLeader(s)).toBeNull();
  });

  it('bids outbid each other in steps', () => {
    let s = bid(toBidding(), [['p2', 100]]);
    expect(auctionLeader(s)).toEqual({ playerId: 'p2', bid: 100 });
    s = bid(s, [['p1', 200]]);
    expect(auctionLeader(s)).toEqual({ playerId: 'p1', bid: 200 });
    expect(s.final?.wagers).toEqual({ p1: 200 });
    s = bid(s, [['p2', 300]]);
    expect(auctionLeader(s)).toEqual({ playerId: 'p2', bid: 300 });
    expect(auctionNextNow(s)).toBe(400);
  });

  it('refuses bids that are low, over the score, from the leader or from zero', () => {
    const s = bid(toBidding(), [
      ['p2', 100],
      ['p1', 200],
      ['p2', 300],
    ]);
    const before = snapshot(s);
    for (const [id, amount, error] of [
      ['p1', 300, 'bid_low'],
      ['p1', 500, 'bid_low'],
      ['p2', 400, 'bid_leader'],
      ['p3', 400, 'bid_over'],
      ['p4', 400, 'bid_none'],
    ] as const) {
      expect(placeWager(s, id, amount, t0 + 1000, rng)).toEqual({ ok: false, error });
    }
    expect(s).toEqual(before);

    const free = toBidding({ bidMode: 'free' });
    const freeBefore = snapshot(free);
    expect(auctionNextNow(free)).toBe(1);
    expect(placeWager(free, 'p1', 300.5, t0, rng)).toEqual({ ok: false, error: 'bid_low' });
    expect(placeWager(free, 'p1', 0, t0, rng)).toEqual({ ok: false, error: 'bid_low' });
    expect(free).toEqual(freeBefore);
    // Будь-яка сума від наступної до меж балів.
    const placed = bid(free, [['p1', 350]]);
    expect(placed.final?.wagers).toEqual({ p1: 350 });
    expect(placeWager(placed, 'p2', 350, t0, rng)).toEqual({ ok: false, error: 'bid_low' });
    expect(bid(placed, [['p2', 500]]).final?.wagers).toEqual({ p2: 500 });
  });

  it('two equal step bids — the second is too low', () => {
    const s = bid(toBidding(), [['p1', 100]]);
    expect(placeWager(s, 'p3', 100, t0, rng)).toEqual({ ok: false, error: 'bid_low' });
    expect(auctionLeader(s)).toEqual({ playerId: 'p1', bid: 100 });
  });

  it('every bid restarts the five-second clock', () => {
    let s = bid(toBidding(), [['p2', 100]], t0 + 3000);
    expect(s.startedAt).toBe(t0 + 3000);
    expect(s.endsAt).toBe(t0 + 8000);
    expect(tick(s, t0 + 7999, rng).phase).toBe('wager');
    // Відмова годинник не чіпає.
    expect(placeWager(s, 'p2', 200, t0 + 6000, rng).ok).toBe(false);
    s = bid(s, [['p1', 200]], t0 + 7000);
    expect(s.endsAt).toBe(t0 + 12_000);
    expect(tick(s, t0 + 11_999, rng).phase).toBe('wager');
    const sold = tick(s, t0 + 12_000, rng);
    expect(sold.phase).toBe('question');
    expect(current(sold).question.id).toBe('a1');
    expect(current(sold).final).toEqual({ wagers: { p1: 200 }, allIn: [], graded: [] });
  });

  it('a bid after the clock ran out is refused until the sale', () => {
    const s = bid(toBidding(), [['p2', 100]], t0);
    expect(placeWager(s, 'p1', 200, t0 + 5000, rng)).toEqual({ ok: false, error: 'time_over' });
  });

  it('nobody bids — the theme clock sells to nobody', () => {
    const s = toBidding();
    expect(tick(s, t0 + AUCTION_OPEN_MS - 1, rng)).toBe(s);
    const open = tick(s, t0 + AUCTION_OPEN_MS, rng);
    expect(open.phase).toBe('question');
    expect(current(open).question.id).toBe('a1');
    expect(current(open).final).toBeUndefined();
    expect(betsPlaying(open)).toBeNull();
  });

  it('the host sells early', () => {
    const sold = sell(bid(toBidding(), [['p2', 100]]));
    expect(sold.phase).toBe('question');
    expect(current(sold).final?.wagers).toEqual({ p2: 100 });
    expect(betsPlaying(sold)).toEqual(['p2']);
    const unsold = sell(toBidding());
    expect(unsold.phase).toBe('question');
    expect(current(unsold).final).toBeUndefined();
  });

  it('pause keeps the bidding clock', () => {
    const s = bid(toBidding(), [['p2', 100]], t0);
    expect(s.endsAt).toBe(t0 + 5000);
    const paused = must(pause(s, t0 + 2000));
    expect(paused.remainingMs).toBe(3000);
    expect(paused.endsAt).toBeNull();
    expect(placeWager(paused, 'p1', 200, t0 + 2500, rng)).toEqual({ ok: false, error: 'paused' });
    expect(tick(paused, t0 + 1e9, rng)).toBe(paused);
    const resumed = must(resume(paused, t0 + 60_000));
    expect(resumed.endsAt).toBe(t0 + 63_000);
    expect(resumed.remainingMs).toBeNull();
    expect(tick(resumed, t0 + 62_999, rng).phase).toBe('wager');
    expect(tick(resumed, t0 + 63_000, rng).phase).toBe('question');
  });

  it('only the winner answers', () => {
    const sold = sell(bid(toBidding(), [['p2', 100], ['p1', 200]]));
    expect(submitAnswer(sold, 'p2', right, t0 + 2000)).toEqual({ ok: false, error: 'bet_skipped' });
    expect(submitAnswer(sold, 'p4', right, t0 + 2000)).toEqual({ ok: false, error: 'bet_skipped' });
    const answered = must(submitAnswer(sold, 'p1', right, t0 + 2000));
    expect(answered.phase).toBe('locked');

    // Ланцюжок, сортування, драбина: хто не купив, не ходить.
    const questions = [withId(chain, 'c1'), withId(sortQ, 's1'), withId(wordladder, 'w1')];
    let s = toBidding({}, { leaderboard: 'end' }, questions);
    const skipped = { ok: false, error: 'bet_skipped' };
    for (let k = 0; k < questions.length; k++) {
      // Торг наступного запитання почався на «Далі» після розкриття попереднього.
      const at = s.startedAt ?? t0;
      s = sell(bid(s, [['p1', 100]], at), at);
      expect(s.phase).toBe('question');
      const now = at + 1000;
      const type = current(s).question.type;
      if (type === 'chain') {
        expect(guessWord(s, 'p4', 'Риба', now)).toEqual(skipped);
        expect(takeHint(s, 'p4', now)).toEqual(skipped);
        expect(guessWord(s, 'p1', 'Риба', now).ok).toBe(true);
      }
      if (type === 'sort') {
        expect(sortWord(s, 'p2', 'w1', 'c1', now)).toEqual(skipped);
        const head = sortQ.words.find((w) => w.id === sortOf(s, 'p1').queue[0]);
        expect(sortWord(s, 'p1', head?.id ?? '', head?.categoryId ?? '', now).ok).toBe(true);
      }
      if (type === 'wordladder') {
        expect(ladderWord(s, 'p3', 'пола', now, () => false)).toEqual(skipped);
        expect(ladderBack(s, 'p3', now)).toEqual(skipped);
        expect(ladderWord(s, 'p1', 'пола', now, () => false).ok).toBe(true);
      }
      s = must(next(must(next(must(lock(s)), at + 2000, rng)), at + 3000, rng));
    }
    expect(s.phase).toBe('finished');
  });

  it('the winner gains price and bid when right', () => {
    const sold = sell(bid(toBidding({ bidMode: 'free' }), [['p1', 400]]));
    const s = reveal(must(submitAnswer(sold, 'p1', right, t0 + 2000)));
    expect(s.phase).toBe('reveal');
    expect(pointsOf(s, 'p1')).toBe(600);
    expect(Object.keys(current(s).answers)).toEqual(['p1']);
    expect(scores(s)).toEqual([1400, 500, 300, 0]);
  });

  it('the winner loses the bid, or the bid and the price', () => {
    const lose = (options: Options) => {
      const sold = sell(bid(toBidding(options, {}, [a2]), [['p2', 100]]));
      return reveal(must(submitAnswer(sold, 'p2', { type: 'boolean', value: false }, t0 + 2000)));
    };
    const bidOnly = lose({ loss: 'bid' });
    expect(pointsOf(bidOnly, 'p2')).toBe(-100);
    expect(scores(bidOnly)).toEqual([800, 400, 300, 0]);
    const both = lose({ loss: 'bid_price' });
    expect(pointsOf(both, 'p2')).toBe(-400);
    expect(scores(both)).toEqual([800, 100, 300, 0]);
  });

  it('a silent winner loses as if wrong', () => {
    const sold = sell(bid(toBidding({ loss: 'bid_price' }), [['p2', 100]]));
    const locked = tick(sold, t0 + 60_000, rng);
    expect(locked.phase).toBe('locked');
    const s = must(next(locked, t0 + 61_000, rng));
    expect(recordOf(s, s.questionIndex, 'p2')).toMatchObject({ grade: 'wrong', answer: null, points: -300 });
    expect(Object.keys(current(s).answers)).toEqual(['p2']);
    expect(scores(s)).toEqual([800, 200, 300, 0]);
  });

  it('partial is not right for the winner', () => {
    const sold = sell(bid(toBidding({ bidMode: 'free' }, {}, [withPoints(withId(multi, 'm1'), 200)]), [['p1', 100]]));
    const s = reveal(must(submitAnswer(sold, 'p1', { type: 'multi', optionIds: ['a'] }, t0 + 2000)));
    expect(recordOf(s, s.questionIndex, 'p1')).toMatchObject({ grade: 'wrong', points: -100 });
  });

  it('an unsold question is a normal question for everyone', () => {
    expect(speedOn(auctionRound('r', [a1]))).toBe(false);
    const open = tick(toBidding({ check: 'manual' }, {}, [a3]), t0 + AUCTION_OPEN_MS, rng);
    expect(open.phase).toBe('question');
    const near: Answer = { type: 'numeric', value: 2120 };
    let s = open;
    for (const [id, answer] of [
      ['p1', { type: 'numeric', value: 2061 }],
      ['p2', near],
      ['p3', { type: 'numeric', value: 5000 }],
      ['p4', { type: 'numeric', value: 2061 }],
    ] as const) {
      s = must(submitAnswer(s, id, answer, t0 + AUCTION_OPEN_MS + 1000));
    }
    expect(s.phase).toBe('locked');
    const accuracy = checkAnswer(a3, near).accuracy;
    expect(accuracy).toBeGreaterThan(0);
    expect(accuracy).toBeLessThan(1);
    const shown = reveal(s);
    expect(['p1', 'p2', 'p3', 'p4'].map((id) => pointsOf(shown, id))).toEqual([200, Math.round(200 * accuracy), 0, 200]);
    expect(scores(shown)).toEqual([1000, 500 + Math.round(200 * accuracy), 300, 200]);
    // Оцінка ведучого — класична: запис стає «неправильно», бали — ціна × точність.
    const graded = must(override(shown, 'p4', 'wrong'));
    expect(recordOf(graded, graded.questionIndex, 'p4')).toMatchObject({ grade: 'wrong', points: 0, overridden: true });
    expect(current(graded).final).toBeUndefined();
    expect(scores(graded)[3]).toBe(0);

    // Ланцюжок і сортування непроданого запитання — звичайні бали класики.
    const chainOpen = tick(toBidding({}, {}, [withId(chain, 'c1')]), t0 + AUCTION_OPEN_MS, rng);
    let c = chainOpen;
    for (const word of chain.words.slice(1)) c = must(guessWord(c, 'p4', word, t0 + AUCTION_OPEN_MS + 1000));
    expect(pointsOf(reveal(c), 'p4')).toBe(chain.points);
    const sortOpen = tick(toBidding({}, {}, [withId(sortQ, 's1')]), t0 + AUCTION_OPEN_MS, rng);
    let o = sortOpen;
    while (recordOf(o, o.questionIndex, 'p4') === undefined) {
      const head = sortQ.words.find((w) => w.id === sortOf(o, 'p4').queue[0]);
      o = must(sortWord(o, 'p4', head?.id ?? '', head?.categoryId ?? '', t0 + AUCTION_OPEN_MS + 1000));
    }
    expect(pointsOf(reveal(o), 'p4')).toBe(sortQ.words.length * sortQ.points);
  });

  it('reveal shows the winner at once and goes on like bets', () => {
    const answered = (settings: Partial<QuizSettings>) =>
      must(submitAnswer(sell(bid(toBidding({}, settings), [['p1', 100]])), 'p1', right, t0 + 2000));
    const shown = reveal(answered({ leaderboard: 'each' }));
    expect(shown.phase).toBe('reveal');
    expect(shown.final?.order.length).toBeGreaterThan(0);
    expect(shown.final?.shown).toBe(shown.final?.order.length);
    const board = must(next(shown, t0 + 40_000, rng));
    expect(board.phase).toBe('leaderboard');
    const second = must(next(board, t0 + 50_000, rng));
    expect(second.phase).toBe('wager');
    expect(second.final).toMatchObject({ wagers: {}, allIn: [], order: [], shown: 0, split: false });
    expect(second.final?.limits).toEqual({ p1: 1100, p2: 500, p3: 300, p4: 0 });
    expect(second.endsAt).toBe(t0 + 50_000 + AUCTION_OPEN_MS);

    const straight = must(next(reveal(answered({ leaderboard: 'end' })), t0 + 40_000, rng));
    expect(straight.phase).toBe('wager');
    expect(straight.endsAt).toBe(t0 + 40_000 + AUCTION_OPEN_MS);

    // Решта запитань — без ставок; після останнього — кінець гри (r2 — останній раунд).
    let s = straight;
    for (const at of [t0 + 100_000, t0 + 200_000]) s = must(next(reveal(sell(s, at), at + 1000), at + 2000, rng));
    expect(s.phase).toBe('finished');
  });

  it('host points and removal during bidding', () => {
    let s = toBidding();
    for (const id of ['p2', 'p1', 'p2', 'p1', 'p2', 'p1']) s = bid(s, [[id, auctionNextNow(s) ?? 0]]);
    expect(auctionLeader(s)).toEqual({ playerId: 'p1', bid: 600 });
    const endsAt = s.endsAt;
    const lower = must(adjustScore(s, 'p1', -300, t0 + 1000));
    expect(lower.final?.limits.p1).toBe(500);
    expect(lower.final?.wagers).toEqual({ p1: 500 });
    expect(lower.endsAt).toBe(endsAt);
    const zero = must(adjustScore(lower, 'p1', -500, t0 + 1000));
    expect(zero.final?.limits.p1).toBe(0);
    expect(zero.final?.wagers).toEqual({});
    expect(auctionLeader(zero)).toBeNull();
    expect(auctionNextNow(zero)).toBe(100);
    expect(zero.endsAt).toBe(endsAt);
    // Бали, що не зачіпають ставку лідера, її не змінюють.
    expect(must(adjustScore(s, 'p1', 100, t0 + 1000)).final?.wagers).toEqual({ p1: 600 });

    const led = bid(toBidding(), [['p1', 100]]);
    const removed = must(removePlayer(led, 'p1'));
    expect(removed.phase).toBe('wager');
    expect(removed.final?.wagers).toEqual({});
    expect(sell(removed).plays.at(-1)?.final).toBeUndefined();

    const sold = sell(bid(toBidding(), [['p1', 100]]));
    const gone = must(removePlayer(sold, 'p1'));
    expect(gone.phase).toBe('question');
    expect(submitAnswer(gone, 'p2', right, t0 + 2000)).toEqual({ ok: false, error: 'bet_skipped' });
    const locked = tick(gone, t0 + 60_000, rng);
    expect(locked.phase).toBe('locked');
    const shown = must(next(locked, t0 + 61_000, rng));
    expect(shown.phase).toBe('reveal');
    expect(current(shown).answers).toEqual({});
    expect(scores(shown)).toEqual([500, 300, 0]);
  });

  it('manual check and the host grade', () => {
    const sold = sell(bid(toBidding({ check: 'manual' }), [['p1', 100]]));
    const locked = must(submitAnswer(sold, 'p1', right, t0 + 2000));
    expect(locked.phase).toBe('locked');
    expect(recordOf(locked, locked.questionIndex, 'p1')).toMatchObject({ grade: 'wrong', points: -100 });
    const graded = must(override(locked, 'p1', 'correct'));
    expect(pointsOf(graded, 'p1')).toBe(300);
    const shown = reveal(graded);
    expect(pointsOf(shown, 'p1')).toBe(300);
    expect(scores(shown)).toEqual([1100, 500, 300, 0]);
    const regraded = must(override(shown, 'p1', 'wrong'));
    expect(pointsOf(regraded, 'p1')).toBe(-100);
    expect(scores(regraded)).toEqual([700, 500, 300, 0]);
    expect(override(shown, 'p1', 'partial')).toEqual({ ok: false, error: 'partial_disabled' });
  });
});
