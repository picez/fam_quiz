import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type FinalRound, type Question, type Round } from '@quiz/shared';
import { adjustScore } from './adjust';
import { guessWord } from './chain';
import { placeWager } from './final';
import { end, endRound, finalOutcome, lock, needsSplit, next, override, recordOf, removePlayer, start, submitAnswer, tick, type GameState } from './game';
import { hostView, playerView, stageView } from './views';
import { chain, classicRound, finalRound, makeRoundsQuiz, single, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const rng = () => 0;
const q2 = withId(withPoints(single, 400), 'q2');
const f1 = withId(single, 'f1');

type FinalOptions = Partial<Omit<FinalRound, 'id' | 'type' | 'questions'>>;

const scores = (state: GameState) => state.players.map((p) => p.score);
const finalRecord = (state: GameState, playerId: string) => recordOf(state, state.plays.length - 1, playerId);

function quizWith(final: FinalOptions = {}, question: Question = f1, tail: Round[] = []) {
  return makeRoundsQuiz(
    [
      classicRound('r1', [single, q2], { speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' } }),
      finalRound('f', question, final),
      ...tail,
    ],
    { leaderboard: 'end' },
  );
}

/** Класичний раунд зіграно, гра на етапі ставок фіналу. Рахунки 1000, 400, −400. */
function toWagers(final: FinalOptions = {}, question: Question = f1, tail: Round[] = []): GameState {
  let s = must(start(lobbyWith(quizWith(final, question, tail), 'Анна', 'Богдан', 'Віра')));
  s = must(next(s, 0, rng));
  s = must(submitAnswer(s, 'p1', right, 1000));
  s = must(next(must(lock(s)), 2000, rng));
  s = must(next(s, 3000, rng));
  s = must(submitAnswer(s, 'p2', right, 4000));
  s = must(submitAnswer(s, 'p3', wrong, 4000));
  s = must(next(must(lock(s)), 5000, rng));
  s = must(next(s, 6000, rng));
  s = must(next(s, 7000, rng));
  return must(next(s, 8000, rng));
}

/** Банк: Віра отримує 1000 від ведучого (межа 600); ставки 1000 / 400 / 200; запитання відкрито. */
function toBankQuestion(final: FinalOptions = {}, tail: Round[] = []): GameState {
  let s = toWagers({ wagerMode: 'bank', ...final }, f1, tail);
  s = must(adjustScore(s, 'p3', 1000, 8500));
  expect(s.final?.limits.p3).toBe(600);
  s = must(placeWager(s, 'p1', 1000, 9000, rng));
  s = must(placeWager(s, 'p2', 400, 9500, rng));
  s = must(placeWager(s, 'p3', 200, 10_000, rng));
  expect(s.phase).toBe('question');
  return s;
}

/** Банк: p1 неправильно, p2 і p3 правильно; reveal, порядок p2, p3, p1 (до фіналу 400 / 600 / 1000). */
function toBankReveal(final: FinalOptions = {}, tail: Round[] = []): GameState {
  let s = toBankQuestion(final, tail);
  s = must(submitAnswer(s, 'p1', wrong, 11_000));
  s = must(submitAnswer(s, 'p2', right, 11_500));
  s = must(submitAnswer(s, 'p3', right, 12_000));
  s = must(next(s, 13_000, rng));
  expect(s.final?.order).toEqual(['p2', 'p3', 'p1']);
  return s;
}

/** Розкриває всіх гравців (без кроку розподілу). */
function revealAll(state: GameState): GameState {
  let s = state;
  while (s.final !== null && s.final.shown < s.final.order.length) s = must(next(s, 14_000, rng));
  return s;
}

/** Ставки 500 / 400 / 0, запитання відкрито. */
function toQuestion(final: FinalOptions = {}, question: Question = f1): GameState {
  let s = toWagers(final, question);
  s = must(placeWager(s, 'p1', 500, 9000, rng));
  s = must(placeWager(s, 'p2', 400, 9500, rng));
  return must(placeWager(s, 'p3', 0, 10_000, rng));
}

describe('the shared bank final', () => {
  it('bank points land in the scores: losers pay their stake, winners split it by stakes', () => {
    let s = toBankQuestion();
    s = must(submitAnswer(s, 'p1', wrong, 11_000));
    s = must(submitAnswer(s, 'p2', right, 11_500));
    s = must(submitAnswer(s, 'p3', right, 12_000));
    expect(s.phase).toBe('locked');
    expect([0, 1, 2].map((i) => finalRecord(s, `p${i + 1}`)?.points)).toEqual([-1000, 667, 333]);
    expect(scores(s)).toEqual([0, 1067, 933]);
    expect(finalOutcome(s)).toMatchObject({ bank: 1000, refund: false });
  });

  it('silence is a loss and nobody right returns the stakes', () => {
    let s = toQuestion({ wagerMode: 'bank' });
    s = must(submitAnswer(s, 'p1', wrong, 11_000));
    s = must(submitAnswer(s, 'p3', wrong, 11_500));
    s = must(next(must(lock(s)), 13_000, rng));
    expect(s.phase).toBe('reveal');
    for (const id of ['p1', 'p2', 'p3']) expect(finalRecord(s, id)).toMatchObject({ grade: 'wrong', points: 0, basePoints: 0 });
    expect(scores(s)).toEqual([1000, 400, -400]);
    expect(finalOutcome(s)).toMatchObject({ bank: 900, refund: true });
  });

  it('bank points survive a kick and a manual grade', () => {
    let s = toBankQuestion({ check: 'manual' });
    s = must(submitAnswer(s, 'p1', wrong, 11_000));
    s = must(submitAnswer(s, 'p2', right, 11_500));
    s = must(submitAnswer(s, 'p3', right, 12_000));
    expect(s.phase).toBe('locked');
    expect(finalOutcome(s)).toMatchObject({ bank: 1600, refund: true });
    expect(scores(s)).toEqual([1000, 400, 600]);
    s = must(override(s, 'p2', 'correct'));
    expect(finalRecord(s, 'p2')?.points).toBe(1200);
    expect(scores(s)).toEqual([0, 1600, 400]);
    s = must(removePlayer(s, 'p1'));
    expect(finalOutcome(s)).toMatchObject({ bank: 200, refund: false });
    expect(scores(s)).toEqual([600, 400]);
  });

  it('a classic final still adds or takes the wager', () => {
    let s = toQuestion();
    s = must(submitAnswer(s, 'p1', right, 11_000));
    s = must(submitAnswer(s, 'p2', wrong, 11_500));
    s = must(next(must(lock(s)), 13_000, rng));
    expect(scores(s)).toEqual([1500, 0, -400]);
    expect(finalOutcome(s)).toEqual({ bank: 0, refund: false, points: { p1: 500, p2: -400, p3: 0 } });
  });

  it('a chain final in the bank mode', () => {
    let s = toQuestion({ wagerMode: 'bank' }, chain);
    s = ['Риба', 'Океан', 'Корабель'].reduce((current, word) => must(guessWord(current, 'p1', word, 15_000)), s);
    s = must(guessWord(s, 'p2', 'Риба', 12_000));
    s = tick(s, 30_000);
    expect(s.phase).toBe('locked');
    s = must(next(s, 31_000, rng));
    expect(finalRecord(s, 'p1')).toMatchObject({ grade: 'correct', points: 400 });
    expect(finalRecord(s, 'p2')).toMatchObject({ grade: 'wrong', points: -400 });
    expect(finalRecord(s, 'p3')).toMatchObject({ answer: null, points: 0 });
    expect(scores(s)).toEqual([1400, 0, -400]);
  });
});

describe('the bank reveal', () => {
  it('the bank reveal: losers pay in one by one, winners wait, the split comes last', () => {
    let s = must(next(toBankReveal(), 14_000, rng)); // p2
    let stage = stageView(s).final!;
    expect(stage.mode).toBe('bank');
    expect(stage.shown.map((e) => [e.nickname, e.before, e.after, e.allIn, e.share])).toEqual([['Богдан', 400, 400, true, null]]);
    expect([stage.bank, stage.split]).toEqual([0, null]);
    expect(playerView(s, 'p2')!.me).toMatchObject({ score: 400, result: { points: 0 } });
    s = must(next(s, 15_000, rng)); // p3
    s = must(next(s, 16_000, rng)); // p1
    stage = stageView(s).final!;
    expect(stage.shown.at(-1)).toMatchObject({ nickname: 'Анна', before: 1000, after: 0, allIn: true });
    expect([stage.bank, stage.left]).toEqual([1000, 0]);
    expect(playerView(s, 'p1')!.me).toMatchObject({ score: 0, result: { points: -1000 } });
    expect(hostView(s).final?.splitNext).toBe(true);
    s = must(next(s, 17_000, rng)); // розподіл
    expect([s.phase, s.final?.split]).toEqual(['reveal', true]);
    stage = stageView(s).final!;
    expect(stage.split).toEqual({
      bank: 1000,
      refund: false,
      shares: [
        { playerId: 'p2', nickname: 'Богдан', wager: 400, share: 667 },
        { playerId: 'p3', nickname: 'Віра', wager: 200, share: 333 },
      ],
    });
    expect(stage.bank).toBe(1000);
    expect(stage.shown.find((e) => e.playerId === 'p2')).toMatchObject({ after: 1067, share: 667 });
    expect(stage.shown.find((e) => e.playerId === 'p1')).toMatchObject({ after: 0, share: null });
    expect(playerView(s, 'p2')!.me).toMatchObject({ score: 1067, result: { points: 667 } });
    expect(hostView(s).final?.splitNext).toBe(false);
    expect(must(next(s, 18_000, rng)).phase).toBe('finished');
  });

  it('nothing about unrevealed players or the split leaks to the stage or phones', () => {
    const s = must(next(toBankReveal(), 14_000, rng)); // p2
    const stage = stageView(s);
    for (const json of [JSON.stringify(stage), JSON.stringify(playerView(s, 'p3')), JSON.stringify(playerView(s, 'p2'))]) {
      for (const leak of ['667', '1067', '333', '933']) expect(json).not.toContain(leak);
    }
    expect(stage.final?.bank).toBe(0);
    expect(playerView(s, 'p1')!.me).toMatchObject({ score: 1000, result: null });
    expect(playerView(s, 'p3')!.me).toMatchObject({ score: 600, result: null });
    expect(stage.final).not.toHaveProperty('splitNext');
    expect(playerView(s, 'p1')!.final).not.toHaveProperty('splitNext');
    // Ведучий бачить справжні бали, як і досі.
    expect(hostView(s).final?.entries.find((e) => e.playerId === 'p2')?.after).toBe(1067);
  });

  it('a refund: the losers scores come back on the split step', () => {
    let s = toQuestion({ wagerMode: 'bank' });
    s = must(submitAnswer(s, 'p1', wrong, 11_000));
    s = must(submitAnswer(s, 'p3', wrong, 11_500));
    s = must(next(must(lock(s)), 13_000, rng));
    expect(s.final?.order).toEqual(['p3', 'p2', 'p1']);
    s = revealAll(s);
    let stage = stageView(s).final!;
    expect(stage.bank).toBe(900);
    expect(stage.split).toBeNull();
    expect(stage.shown.find((e) => e.playerId === 'p2')).toMatchObject({ before: 400, after: 0 });
    expect(playerView(s, 'p1')!.me.score).toBe(500);
    expect(JSON.stringify(stageView(s))).not.toContain('refund');
    expect(hostView(s).final?.splitNext).toBe(true);
    s = must(next(s, 15_000, rng));
    stage = stageView(s).final!;
    expect(stage.split).toEqual({ bank: 900, refund: true, shares: [] });
    expect(stage.shown.find((e) => e.playerId === 'p2')).toMatchObject({ after: 400, share: null });
    expect(playerView(s, 'p1')!.me).toMatchObject({ score: 1000, result: { points: 0 } });
    expect(must(next(s, 16_000, rng)).phase).toBe('finished');
  });

  it('the split step exists only when the bank is not empty', () => {
    let s = toQuestion({ wagerMode: 'bank' });
    for (const id of ['p1', 'p2', 'p3']) s = must(submitAnswer(s, id, right, 11_000));
    s = must(next(s, 13_000, rng));
    s = revealAll(s);
    expect(needsSplit(s)).toBe(false);
    expect(hostView(s).final?.splitNext).toBe(false);
    expect(stageView(s).final?.bank).toBe(0);
    expect(must(next(s, 15_000, rng)).phase).toBe('finished');

    let c = toQuestion();
    c = must(submitAnswer(c, 'p1', right, 11_000));
    c = must(submitAnswer(c, 'p2', wrong, 11_500));
    c = must(next(must(lock(c)), 13_000, rng));
    for (let step = 0; step < 3; step += 1) {
      expect(needsSplit(c)).toBe(false);
      c = must(next(c, 14_000 + step, rng));
    }
    expect(needsSplit(c)).toBe(false);
    expect(hostView(c).final?.splitNext).toBe(false);
    expect(must(next(c, 15_000, rng)).phase).toBe('finished');
  });

  it('ending the round or the game during the bank reveal splits it', () => {
    const revealed = must(next(toBankReveal(), 14_000, rng));
    for (const ended of [must(endRound(revealed, 15_000)), must(end(revealed))]) {
      expect(ended.final?.split).toBe(true);
      expect(ended.final?.shown).toBe(3);
      expect(scores(ended)).toEqual([0, 1067, 933]);
      expect(playerView(ended, 'p2')!.me.score).toBe(1067);
    }
  });

  it('a right answer with a zero stake gets no share on a refund', () => {
    let s = toQuestion({ wagerMode: 'bank' });
    s = must(submitAnswer(s, 'p1', wrong, 11_000));
    s = must(submitAnswer(s, 'p2', wrong, 11_500));
    s = must(submitAnswer(s, 'p3', right, 12_000));
    s = must(next(s, 13_000, rng));
    s = must(next(revealAll(s), 15_000, rng));
    const stage = stageView(s).final!;
    expect(stage.split).toMatchObject({ refund: true, shares: [] });
    expect(stage.shown.find((e) => e.playerId === 'p3')).toMatchObject({ grade: 'correct', share: null });
    expect(hostView(s).final?.entries.every((e) => e.share === null)).toBe(true);
  });

  it('kicking a loser after the bank final keeps the winners scores', () => {
    const tail = [classicRound('r3', [withId(single, 'q3')], { speedBonus: false })];
    let s = revealAll(toBankReveal({}, tail));
    s = must(next(s, 15_000, rng));
    expect(s.final?.split).toBe(true);
    s = must(next(s, 16_000, rng));
    expect(s.phase).toBe('round_end');
    expect(scores(s)).toEqual([0, 1067, 933]);
    const kicked = must(removePlayer(s, 'p1'));
    expect(scores(kicked)).toEqual([1067, 933]);
    expect([finalRecord(kicked, 'p2')?.points, finalRecord(kicked, 'p3')?.points]).toEqual([667, 333]);
    const adjusted = must(adjustScore(kicked, 'p2', 10, 17_000));
    expect(scores(adjusted)).toEqual([1077, 933]);
    const ended = must(removePlayer(must(end(s)), 'p1'));
    expect(scores(ended)).toEqual([1067, 933]);
  });

  it('the host regrades a revealed player and the bank follows', () => {
    let s = toBankQuestion({ check: 'manual' });
    s = must(submitAnswer(s, 'p1', wrong, 11_000));
    s = must(submitAnswer(s, 'p2', right, 11_500));
    s = must(submitAnswer(s, 'p3', right, 12_000));
    s = must(override(s, 'p2', 'correct'));
    s = must(override(s, 'p3', 'correct'));
    s = must(next(s, 13_000, rng));
    s = revealAll(s);
    s = must(next(s, 15_000, rng));
    expect(stageView(s).final?.split?.shares.map((e) => e.share)).toEqual([667, 333]);
    s = must(override(s, 'p3', 'wrong'));
    expect(finalRecord(s, 'p2')?.points).toBe(1200);
    const stage = stageView(s).final!;
    expect(stage.bank).toBe(1200);
    expect(stage.split).toEqual({ bank: 1200, refund: false, shares: [{ playerId: 'p2', nickname: 'Богдан', wager: 400, share: 1200 }] });
    expect(stage.shown.find((e) => e.playerId === 'p3')).toMatchObject({ before: 600, after: 400, share: null });
  });
});
