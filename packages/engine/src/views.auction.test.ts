import { describe, expect, it } from 'vitest';
import { AUCTION_BID_MS, AUCTION_OPEN_MS, type Answer, type AuctionRound, type Question } from '@quiz/shared';
import { adjustScore } from './adjust';
import { placeWager } from './final';
import { lock, next, pause, start, submitAnswer, type GameState } from './game';
import { hostView, playerView, stageView } from './views';
import { auctionRound, betsRound, bool, classicRound, finalRound, makeRoundsQuiz, numeric, single, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const rng = () => 0;
const right: Answer = { type: 'single', optionId: 'b' };
const t0 = 1_000_000;

const IMAGE = '/uploads/0123456789abcdef.jpg';
const AUDIO = '/uploads/fedcba9876543210.mp3';

/** Запитання з картинкою й аудіо; видно лише перші два слова. */
const australia: Question = {
  ...single,
  id: 'a1',
  text: 'Яке місто є столицею Австралії?',
  options: [
    { id: 'a', text: 'Сідней' },
    { id: 'b', text: 'Канберра' },
    { id: 'c', text: 'Мельбурн' },
  ],
  correctId: 'b',
  points: 200,
  imageUrl: IMAGE,
  audio: { source: 'file', url: AUDIO, start: 0, duration: 2 },
  betsCut: 2,
};

type Options = Partial<Omit<AuctionRound, 'id' | 'type' | 'questions'>>;

/** Класичний раунд r1, далі «Аукціон» r2 (ціна 200 / 300 / 200, крок 100). Олена 800, Тарас 500, Віра 300, Хосе 0; гра на заставці r2. */
function toIntro(options: Options = {}, questions: Question[] = [australia, withPoints(withId(bool, 'a2'), 300), withPoints(withId(numeric, 'a3'), 200)]): GameState {
  const quiz = makeRoundsQuiz([classicRound('r1', [single]), auctionRound('r2', questions, { title: 'Географія', bidStep: 100, ...options })]);
  let s = must(start(lobbyWith(quiz, 'Олена', 'Тарас', 'Віра', 'Хосе')));
  s = must(next(s, 0, rng));
  s = must(next(must(lock(s)), 1000, rng));
  s = must(next(s, 2000, rng));
  [800, 500, 300].forEach((points, i) => {
    s = must(adjustScore(s, `p${i + 1}`, points, 3000));
  });
  return must(next(s, 4000, rng));
}

const toBidding = (options: Options = {}, questions?: Question[]) => must(next(toIntro(options, questions), t0, rng));

function bid(state: GameState, bids: [string, number][], now = t0): GameState {
  return bids.reduce((s, [id, amount]) => must(placeWager(s, id, amount, now, rng)), state);
}

const sell = (state: GameState, now = t0 + 1000) => must(next(state, now, rng));

function phone(state: GameState, id: string) {
  const view = playerView(state, id);
  if (view === null) throw new Error(`no player ${id}`);
  return view;
}

describe('auction views (27b)', () => {
  it('the stage sees the theme, price, top bid and its author', () => {
    const s = bid(toBidding(), [['p2', 100], ['p1', 200]]);
    const info = stageView(s).auction;
    expect(info).toMatchObject({
      theme: 'Географія',
      index: 0,
      total: 3,
      price: 200,
      mode: 'step',
      step: 100,
      loss: 'bid',
      bid: 200,
      leader: { playerId: 'p1', nickname: 'Олена' },
      next: 300,
      endsAt: s.endsAt,
      totalMs: AUCTION_BID_MS,
      open: false,
      result: null,
    });
    // До першої ставки — довший годинник.
    expect(stageView(toBidding()).auction).toMatchObject({ bid: 0, leader: null, next: 100, totalMs: AUCTION_OPEN_MS, endsAt: t0 + AUCTION_OPEN_MS });
    expect(phone(s, 'p3').auction).toEqual(info);
  });

  it('intro carries the next question without bids or teaser', () => {
    expect(stageView(toIntro()).auction).toMatchObject({ index: 0, total: 3, price: 200, teaser: null, bid: 0, leader: null, next: 0, endsAt: null, open: false, result: null });
  });

  it('never sends the hidden part, options or media while bidding', () => {
    const s = bid(toBidding(), [['p2', 100]]);
    for (const view of [stageView(s), phone(s, 'p1')]) {
      expect(view.auction?.teaser).toBe('Яке місто');
      expect(view.question).toBeNull();
      const json = JSON.stringify(view);
      for (const secret of ['Австралії', 'Канберра', 'Сідней', IMAGE, AUDIO, '"correctId"']) expect(json).not.toContain(secret);
    }
    const host = hostView(s);
    expect(host.auction?.question.text).toBe('Яке місто є столицею Австралії?');
    expect(host.auction?.teaser).toBe('Яке місто');

    // Торг запитання 2: questionIndex ще вказує на розкрите запитання 1, а запитання 2 не видно.
    const vienna: Question = {
      ...australia,
      id: 'a2',
      text: 'Яка річка тече через Відень?',
      options: [
        { id: 'a', text: 'Рейн' },
        { id: 'b', text: 'Дунай' },
        { id: 'c', text: 'Ельба' },
      ],
      imageUrl: '/uploads/abcdef0123456789.jpg',
      audio: { source: 'file', url: '/uploads/9876543210fedcba.mp3', start: 0, duration: 2 },
    };
    const first = must(submitAnswer(sell(bid(toBidding({}, [australia, vienna, withId(numeric, 'a3')]), [['p1', 100]])), 'p1', right, t0 + 2000));
    const second = must(next(must(next(must(next(first, t0 + 5000, rng)), t0 + 6000, rng)), t0 + 7000, rng));
    expect(second.phase).toBe('wager');
    for (const view of [stageView(second), phone(second, 'p1'), phone(second, 'p4')]) {
      expect(view.auction).toMatchObject({ index: 1, teaser: 'Яка річка' });
      expect(view.question).toBeNull();
      const json = JSON.stringify(view);
      for (const secret of ['Відень', 'Дунай', 'Рейн', 'Ельба', vienna.imageUrl, '/uploads/9876543210fedcba.mp3']) expect(json).not.toContain(secret);
    }
    expect(hostView(second).auction?.question.text).toBe('Яка річка тече через Відень?');
  });

  it('after the sale everyone sees the full question', () => {
    const sold = sell(bid(toBidding(), [['p2', 100], ['p1', 200]]));
    for (const view of [stageView(sold), phone(sold, 'p3'), hostView(sold)]) {
      expect(view.question?.text).toBe('Яке місто є столицею Австралії?');
      expect(view.auction).toMatchObject({ teaser: null, bid: 200, leader: { playerId: 'p1', nickname: 'Олена' }, open: false, next: 0, endsAt: null, result: null });
    }
    const unsold = sell(toBidding());
    expect(stageView(unsold).question?.text).toBe('Яке місто є столицею Австралії?');
    expect(stageView(unsold).auction).toMatchObject({ teaser: null, bid: 0, leader: null, open: true });
    expect(stageView(unsold).playerCount).toBe(4);
    // Продане: відповідає лише переможець.
    expect(stageView(sold).playerCount).toBe(1);
    expect(stageView(must(submitAnswer(sold, 'p1', right, t0 + 2000))).answeredCount).toBe(1);
  });

  it('phone status follows the rules', () => {
    const s = toBidding();
    expect(phone(s, 'p2').me.auction).toEqual({ status: 'bidding', limit: 500, next: 100, canBid: true });
    const led = bid(s, [['p2', 100]]);
    expect(phone(led, 'p2').me.auction).toEqual({ status: 'leading', limit: 500, next: 200, canBid: false });
    expect(phone(led, 'p1').me.auction).toMatchObject({ status: 'bidding', canBid: true });
    const high = bid(s, [['p2', 100], ['p1', 200], ['p2', 300]]);
    expect(phone(high, 'p3').me.auction).toEqual({ status: 'short', limit: 300, next: 400, canBid: false });
    expect(phone(high, 'p4').me.auction).toEqual({ status: 'none', limit: 0, next: 400, canBid: false });
    const paused = must(pause(led, t0 + 1000));
    expect(phone(paused, 'p1').me.auction).toMatchObject({ status: 'bidding', canBid: false });

    const sold = sell(led);
    expect(phone(sold, 'p2').me.auction).toMatchObject({ status: 'winner', canBid: false });
    for (const id of ['p1', 'p3', 'p4']) expect(phone(sold, id).me.auction).toMatchObject({ status: 'watching', canBid: false });
    for (const id of ['p1', 'p2', 'p3', 'p4']) expect(phone(sell(toBidding()), id).me.auction).toMatchObject({ status: 'open', canBid: false });
  });

  it("reveal carries the winner's grade and points only", () => {
    const sold = sell(bid(toBidding(), [['p2', 100], ['p1', 200], ['p2', 300], ['p1', 400]]));
    const answered = must(submitAnswer(sold, 'p1', right, t0 + 2000));
    expect(answered.phase).toBe('locked');
    for (const view of [stageView(sold), stageView(answered), hostView(answered)]) expect(view.auction?.result).toBeNull();
    for (const id of ['p1', 'p2']) expect(phone(answered, id).me.result).toBeNull();
    const revealed = must(next(answered, t0 + 3000, rng));
    expect(revealed.phase).toBe('reveal');
    for (const view of [stageView(revealed), phone(revealed, 'p3'), hostView(revealed)]) {
      expect(view.auction).toMatchObject({ bid: 400, leader: { nickname: 'Олена' }, result: { grade: 'correct', points: 600 } });
    }
    expect(phone(revealed, 'p1').me.result?.points).toBe(600);
    for (const id of ['p2', 'p3', 'p4']) expect(phone(revealed, id).me.result).toBeNull();
  });

  it('the host sees every limit live', () => {
    const s = bid(toBidding(), [['p2', 100], ['p1', 200], ['p2', 300]]);
    expect(hostView(s).auction?.limits).toEqual([
      { playerId: 'p1', nickname: 'Олена', limit: 800, canBid: true },
      { playerId: 'p2', nickname: 'Тарас', limit: 500, canBid: false },
      { playerId: 'p3', nickname: 'Віра', limit: 300, canBid: false },
      { playerId: 'p4', nickname: 'Хосе', limit: 0, canBid: false },
    ]);
    expect(hostView(s).auction).toMatchObject({ manual: false, pending: [] });
    // Ручна перевірка: відповідь переможця чекає на оцінку.
    const sold = sell(bid(toBidding({ check: 'manual' }), [['p2', 100]]));
    expect(hostView(sold).auction?.manual).toBe(true);
    const answered = must(submitAnswer(sold, 'p2', right, t0 + 2000));
    expect(hostView(answered).auction?.pending).toEqual([{ playerId: 'p2', nickname: 'Тарас', answer: right }]);
  });

  it('other views stay as they were', () => {
    const s = sell(bid(toBidding(), [['p2', 100]]));
    for (const state of [toIntro(), toBidding(), s]) {
      for (const view of [stageView(state), hostView(state), phone(state, 'p1')]) {
        expect(view.final).toBeNull();
        expect(Object.hasOwn(view, 'bets')).toBe(false);
      }
      expect(phone(state, 'p1').me.final).toBeNull();
      expect(Object.hasOwn(phone(state, 'p1').me, 'bets')).toBe(false);
    }
    const classic = must(next(must(start(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Анна'))), 0, rng));
    const bets = must(next(must(start(lobbyWith(makeRoundsQuiz([betsRound('b1', [australia])]), 'Анна'))), 0, rng));
    const final = must(next(must(start(lobbyWith(makeRoundsQuiz([finalRound('f1', single)]), 'Анна'))), 0, rng));
    for (const state of [classic, bets, final]) {
      expect(Object.hasOwn(stageView(state), 'auction')).toBe(false);
      expect(Object.hasOwn(hostView(state), 'auction')).toBe(false);
      expect(Object.hasOwn(phone(state, 'p1').me, 'auction')).toBe(false);
    }
  });
});
