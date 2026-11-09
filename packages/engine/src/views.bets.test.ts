import { describe, expect, it } from 'vitest';
import type { Answer, BetsRound, Question } from '@quiz/shared';
import { adjustScore } from './adjust';
import { placeWager } from './final';
import { lock, next, override, pause, start, submitAnswer, type GameState } from './game';
import { hostView, playerView, stageView } from './views';
import { betsRound, bool, classicRound, finalRound, makeRoundsQuiz, numeric, single, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng = () => 0;
const right: Answer = { type: 'single', optionId: 'b' };
const wrong: Answer = { type: 'single', optionId: 'a' };
const T = 100_000;

const IMAGE = '/uploads/0123456789abcdef.jpg';
const AUDIO = '/uploads/fedcba9876543210.mp3';

/** Запитання з картинкою й аудіо; видно лише перші два слова. */
const australia: Question = {
  ...single,
  id: 'b1',
  text: 'Яке місто є столицею Австралії?',
  options: [
    { id: 'a', text: 'Сідней' },
    { id: 'b', text: 'Канберра' },
    { id: 'c', text: 'Мельбурн' },
  ],
  correctId: 'b',
  imageUrl: IMAGE,
  audio: { source: 'file', url: AUDIO, start: 0, duration: 2 },
  betsCut: 2,
};

type Options = Partial<Omit<BetsRound, 'id' | 'type' | 'questions'>>;

/**
 * Класичний раунд r1, далі «Ставки» r2 «Географія» (три запитання, betMax 600).
 * Олена p1, Тарас p2, Віра p3, Хосе p4; на round_end r1 ведучий дає 800 / 500 / 300 / 0. Гра — на заставці r2.
 */
function toIntro(options: Options = {}, questions: Question[] = [australia, withId(bool, 'b2'), withId(numeric, 'b3')]): GameState {
  const quiz = makeRoundsQuiz([classicRound('r1', [single]), betsRound('r2', questions, { title: 'Географія', betMax: 600, ...options })]);
  let s = must(start(lobbyWith(quiz, 'Олена', 'Тарас', 'Віра', 'Хосе')));
  s = must(next(s, 0, rng));
  s = must(next(must(lock(s)), 1000, rng));
  s = must(next(s, 2000, rng));
  [800, 500, 300].forEach((points, i) => {
    s = must(adjustScore(s, `p${i + 1}`, points, 3000));
  });
  return must(next(s, 4000, rng));
}

const toWager = (options: Options = {}, questions?: Question[]) => must(next(toIntro(options, questions), T, rng));

function bet(state: GameState, wagers: Record<string, number>): GameState {
  return Object.entries(wagers).reduce((s, [id, amount]) => must(placeWager(s, id, amount, T, rng)), state);
}

function answer(state: GameState, answers: Record<string, Answer>): GameState {
  return Object.entries(answers).reduce((s, [id, a]) => must(submitAnswer(s, id, a, T + 1000)), state);
}

/** Олена 400, Тарас 200, Віра 300 — запитання 1 відкрито. */
const opened = (options: Options = {}) => bet(toWager(options), { p1: 400, p2: 200, p3: 300 });

/** Зріз телефона гравця (гравець є). */
function phone(state: GameState, id: string) {
  const view = playerView(state, id);
  if (view === null) throw new Error(`no player ${id}`);
  return view;
}

const me = (state: GameState, id: string) => phone(state, id).me;

describe('bets views (27a)', () => {
  it('the stage sees the theme, number, minimum, bank and who placed, never the sums', () => {
    const intro = stageView(toIntro()).bets;
    expect(intro).toMatchObject({ theme: 'Географія', index: 0, total: 3, teaser: null, rows: null, bank: 0, placed: [] });

    const s = bet(toWager(), { p1: 400, p2: 200 });
    const view = stageView(s);
    expect(view.bets).toMatchObject({ theme: 'Географія', index: 0, total: 3, minimum: 200, maximum: 600, bank: 600, eligible: 3, rows: null, refund: false });
    expect(view.bets?.placed).toEqual([
      { playerId: 'p1', nickname: 'Олена' },
      { playerId: 'p2', nickname: 'Тарас' },
    ]);
    expect(JSON.stringify(view)).not.toContain('"wager":400');
    expect(JSON.stringify(phone(s, 'p2'))).not.toContain('400');
  });

  it('never sends the hidden part, options or media during bets', () => {
    const s = toWager();
    for (const view of [stageView(s), phone(s, 'p1')]) {
      expect(view.bets?.teaser).toBe('Яке місто');
      expect(view.question).toBeNull();
      const json = JSON.stringify(view);
      for (const secret of ['Австралії', 'Канберра', 'Сідней', IMAGE, AUDIO]) expect(json).not.toContain(secret);
    }
    expect(hostView(s).bets?.question.text).toBe('Яке місто є столицею Австралії?');
  });

  it('cut at zero shows nothing and cut past the end shows the whole text', () => {
    expect(stageView(toWager({}, [{ ...australia, betsCut: 0 }])).bets?.teaser).toBe('');
    expect(stageView(toWager({}, [{ ...australia, betsCut: 99 }])).bets?.teaser).toBe('Яке місто є столицею Австралії?');
  });

  it('after opening everyone sees the full question', () => {
    const s = opened();
    expect(s.phase).toBe('question');
    const view = stageView(s);
    expect(view.question?.text).toBe('Яке місто є столицею Австралії?');
    expect(view.bets?.teaser).toBeNull();
    expect(view.bets).toMatchObject({ bank: 900, eligible: 0, rows: null });
    expect(view.bets?.placed.map((p) => p.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(phone(s, 'p4').question?.text).toBe('Яке місто є столицею Австралії?');
  });

  it('phone status follows the rules', () => {
    const wager = toWager();
    expect(me(wager, 'p1').bets).toEqual({ status: 'choosing', wager: null, minimum: 200, limit: 600, canBet: true });
    const placed = bet(wager, { p1: 400 });
    expect(me(placed, 'p1').bets).toEqual({ status: 'placed', wager: 400, minimum: 200, limit: 600, canBet: true });
    expect(me(placed, 'p4').bets).toEqual({ status: 'low', wager: null, minimum: 200, limit: 0, canBet: false });

    const early = must(next(placed, T, rng));
    expect(early.phase).toBe('question');
    expect(me(early, 'p2').bets).toMatchObject({ status: 'late', wager: null, canBet: false });
    expect(me(early, 'p1').bets).toMatchObject({ status: 'playing', wager: 400, canBet: false });

    const paused = must(pause(placed, T));
    expect(me(paused, 'p1').bets).toMatchObject({ status: 'placed', canBet: false });
  });

  it("reveal rows carry every bettor's wager and win, and the refund flag", () => {
    const question = opened();
    expect(stageView(question).bets?.rows).toBeNull();
    expect(me(question, 'p1').result).toBeNull();
    const locked = answer(question, { p1: right, p2: wrong, p3: wrong });
    expect(locked.phase).toBe('locked');
    expect(stageView(locked).bets?.rows).toBeNull();
    expect(me(locked, 'p1').result).toBeNull();

    const reveal = must(next(locked, T + 5000, rng));
    expect(reveal.phase).toBe('reveal');
    expect(stageView(reveal).bets?.rows).toEqual([
      { playerId: 'p1', nickname: 'Олена', wager: 400, grade: 'correct', points: 500, score: 1300 },
      { playerId: 'p2', nickname: 'Тарас', wager: 200, grade: 'wrong', points: -200, score: 300 },
      { playerId: 'p3', nickname: 'Віра', wager: 300, grade: 'wrong', points: -300, score: 0 },
    ]);
    expect(stageView(reveal).bets?.refund).toBe(false);
    expect(me(reveal, 'p1').result?.points).toBe(500);

    const refund = must(next(answer(opened(), { p1: wrong, p2: wrong, p3: wrong }), T + 5000, rng));
    expect(stageView(refund).bets?.refund).toBe(true);
    expect(stageView(refund).bets?.rows?.map((r) => r.points)).toEqual([0, 0, 0]);
  });

  it('the host sees every wager and limit live', () => {
    const view = hostView(bet(toWager(), { p1: 400 })).bets;
    expect(view?.wagers).toEqual([
      { playerId: 'p1', nickname: 'Олена', wager: 400, limit: 600, canBet: true },
      { playerId: 'p2', nickname: 'Тарас', wager: null, limit: 500, canBet: true },
      { playerId: 'p3', nickname: 'Віра', wager: null, limit: 300, canBet: true },
      { playerId: 'p4', nickname: 'Хосе', wager: null, limit: 0, canBet: false },
    ]);
    expect(view?.manual).toBe(false);
    expect(view?.pending).toEqual([]);

    const locked = answer(opened({ check: 'manual' }), { p1: right, p2: wrong, p3: wrong });
    const host = hostView(locked).bets;
    expect(host?.manual).toBe(true);
    expect(host?.pending.map((p) => p.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(host?.pending[0]).toEqual({ playerId: 'p1', nickname: 'Олена', answer: right });
    expect(hostView(must(override(locked, 'p1', 'correct'))).bets?.pending.map((p) => p.playerId)).toEqual(['p2', 'p3']);
  });

  it('final views stay as they were and other rounds have no bets key', () => {
    for (const s of [toWager(), opened()]) {
      expect(stageView(s).final).toBeNull();
      expect(hostView(s).final).toBeNull();
      expect(me(s, 'p1').final).toBeNull();
    }
    const leaderboard = must(next(must(next(answer(opened(), { p1: right, p2: wrong, p3: wrong }), T + 5000, rng)), T + 6000, rng));
    expect(leaderboard.phase).toBe('leaderboard');
    expect(stageView(leaderboard).bets).toMatchObject({ index: 0, teaser: null, rows: null, bank: 0, placed: [] });

    const classic = startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Олена'), 0, rng);
    const final = must(next(must(start(lobbyWith(makeRoundsQuiz([finalRound('r1', single)]), 'Олена'))), 0, rng));
    for (const s of [classic, final, must(next(final, T, rng))]) {
      expect('bets' in stageView(s)).toBe(false);
      expect('bets' in hostView(s)).toBe(false);
      expect('bets' in me(s, 'p1')).toBe(false);
    }
  });
});
