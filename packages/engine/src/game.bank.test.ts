import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type FinalRound, type Question } from '@quiz/shared';
import { adjustScore } from './adjust';
import { guessWord } from './chain';
import { placeWager } from './final';
import { finalOutcome, lock, next, override, recordOf, removePlayer, start, submitAnswer, tick, type GameState } from './game';
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

function quizWith(final: FinalOptions = {}, question: Question = f1) {
  return makeRoundsQuiz(
    [
      classicRound('r1', [single, q2], { speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' } }),
      finalRound('f', question, final),
    ],
    { leaderboard: 'end' },
  );
}

/** Класичний раунд зіграно, гра на етапі ставок фіналу. Рахунки 1000, 400, −400. */
function toWagers(final: FinalOptions = {}, question: Question = f1): GameState {
  let s = must(start(lobbyWith(quizWith(final, question), 'Анна', 'Богдан', 'Віра')));
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
function toBankQuestion(final: FinalOptions = {}): GameState {
  let s = toWagers({ wagerMode: 'bank', ...final });
  s = must(adjustScore(s, 'p3', 1000, 8500));
  expect(s.final?.limits.p3).toBe(600);
  s = must(placeWager(s, 'p1', 1000, 9000, rng));
  s = must(placeWager(s, 'p2', 400, 9500, rng));
  s = must(placeWager(s, 'p3', 200, 10_000, rng));
  expect(s.phase).toBe('question');
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
