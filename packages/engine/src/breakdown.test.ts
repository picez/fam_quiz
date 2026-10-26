import { describe, expect, it } from 'vitest';
import { breakdownOf, DEFAULT_RULES, roundTotals, type Answer, type BoardCell } from '@quiz/shared';
import { adjustScore } from './adjust';
import { buzz } from './blitz';
import { pickCell } from './board';
import { scoreLines, roundCount } from './breakdown';
import { takeBuff } from './buffs';
import { buyDebuff } from './debuffs';
import { answerDuel, declareDuel, duelQuestionOf, pickDuelCategory } from './duel';
import { placeWager } from './final';
import { acceptAnswer, judge, lock, next, start, submitAnswer, tick, withCurrentPlay, withTotals, type GameState, type SurvivalTrial } from './game';
import { decideLadder, pickContestant } from './ladder';
import { survivalPlayOf } from './survival';
import { actAnswer } from './team-act';
import { decisionOpen, wipeoutPlayOf } from './wipeout';
import { T0 as BUFF_T0, toBuffQuestion } from './testing/buffs';
import { rich, T0 as DEBUFF_T0 } from './testing/debuffs';
import { T0 as DUEL_T0, toDeclarable } from './testing/duel';
import {
  blitzRound,
  boardRound,
  classicRound,
  finalRound,
  ladderRound,
  LADDER_RIGHT,
  makeQuiz,
  makeRoundsQuiz,
  single,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  wipeoutLadder,
  wipeoutRound,
  withId,
  withPoints,
} from './testing/fixtures';
import { lobbyWith, lobbyWithGuide, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const rng = () => 0;
const MINUS = { speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' as const } };
const kyiv = { type: 'single', optionId: 'b' } as const;
const lviv = { type: 'single', optionId: 'a' } as const;
/** Два класичні раунди по одному запитанню (1000, штраф −1000, без бонусу швидкості); Оля p1, Петро p2. */
const twoRounds = () => lobbyWith(makeRoundsQuiz([classicRound('r1', [single], MINUS), classicRound('r2', [withId(single, 'q2')], MINUS)]), 'Оля', 'Петро');
const sumOf = (s: GameState, id: string) => scoreLines(s).filter((l) => l.playerId === id).reduce((n, l) => n + l.points, 0);
const linesOf = (s: GameState, id: string) => scoreLines(s).filter((l) => l.playerId === id);

/** Відповіді на поточне запитання о now; відкрите запитання закривається. */
function answer(s: GameState, answers: Record<string, Answer>, now: number): GameState {
  let current = s;
  for (const [id, a] of Object.entries(answers)) current = must(submitAnswer(current, id, a, now));
  return current.phase === 'question' ? must(lock(current)) : current;
}

/** «Далі», доки гра не дійде до етапу phase. */
function to(s: GameState, phase: GameState['phase'], now: number): GameState {
  let current = s;
  while (current.phase !== phase) current = must(next(current, now, rng));
  return current;
}

/** Σ рядків кожного гравця = рахунок, і розбивка дає той самий рахунок. */
function expectBalanced(s: GameState): void {
  for (const player of s.players) {
    expect(sumOf(s, player.id), player.id).toBe(player.score);
    const { plus, minus } = breakdownOf(linesOf(s, player.id));
    expect(plus + minus, player.id).toBe(player.score);
  }
}

/** Перший раунд «двох раундів»: Оля правильно, Петро ні; підсумки раунду й +50 Олі від ведучого. */
function firstRoundEnd(): GameState {
  const s = to(answer(startRound(twoRounds(), 1000, rng), { p1: kyiv, p2: lviv }, 2000), 'round_end', 3000);
  return must(adjustScore(s, 'p1', 50, 3500));
}

describe('score lines (11f)', () => {
  it('two rounds: answer lines, then adjustments; totals per round and the breakdown', () => {
    let s = firstRoundEnd();
    expect(scoreLines(s).map(({ playerId, roundIndex, source, points, questionIndex }) => [playerId, roundIndex, source, points, questionIndex])).toEqual([
      ['p1', 0, 'answers', 1000, 0],
      ['p2', 0, 'answers', -1000, 0],
      ['p1', 0, 'host', 50, null],
    ]);
    s = to(answer(to(s, 'question', 4000), { p1: lviv, p2: kyiv }, 5000), 'finished', 6000);
    expect(roundTotals(linesOf(s, 'p1'), roundCount(s))).toEqual([1050, -1000]);
    expect(roundTotals(linesOf(s, 'p2'), roundCount(s))).toEqual([-1000, 1000]);
    expect(breakdownOf(linesOf(s, 'p1'))).toEqual({
      parts: [
        { source: 'answers', plus: 1000, minus: -1000 },
        { source: 'host', plus: 50, minus: 0 },
      ],
      plus: 1050,
      minus: -1000,
    });
    expectBalanced(s);
  });

  it('the open question does not count until it closes', () => {
    const open = must(submitAnswer(to(firstRoundEnd(), 'question', 4000), 'p1', lviv, 5000));
    expect(open.phase).toBe('question');
    expect(scoreLines(open).some((l) => l.questionIndex === 1)).toBe(false);
    expectBalanced(open);
    const locked = must(lock(open));
    expect(scoreLines(locked).filter((l) => l.questionIndex === 1).map((l) => [l.playerId, l.points])).toEqual([['p1', -1000]]);
    expectBalanced(locked);
  });

  it('roundCount: none in the lobby and the guide, then up to the current round', () => {
    const lobby = twoRounds();
    expect(roundCount(lobby)).toBe(0);
    expect(roundCount(startRound(lobby, 1000, rng))).toBe(1);
    const intro = must(next(firstRoundEnd(), 4000, rng));
    expect(intro.phase).toBe('intro');
    expect(roundCount(intro)).toBe(2);
    expect(roundCount(to(answer(to(intro, 'question', 4500), { p1: kyiv }, 5000), 'finished', 6000))).toBe(2);
    const guide = must(start(lobbyWithGuide(makeQuiz([single]), 'Оля')));
    expect(guide.phase).toBe('guide');
    expect(roundCount(guide)).toBe(0);
  });

  it('blitz: a line per attempt, so a wrong and a right attempt show as minus and plus', () => {
    const quiz = makeRoundsQuiz([blitzRound('b1', [single], { check: 'manual', attempts: 2, rules: { ...DEFAULT_RULES, partial: null, penalty: 'minus' } })]);
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро'), 0, rng);
    s = must(judge(must(submitAnswer(must(buzz(s, 'p2', 1000)), 'p2', lviv, 1000)), 'p2', false, 1000));
    s = must(judge(must(submitAnswer(must(buzz(s, 'p2', 2000)), 'p2', kyiv, 2000)), 'p2', true, 2000));
    expect(s.phase).toBe('locked');
    expect(s.plays[0].answers.p2.points).toBe(0);
    expect(linesOf(s, 'p2').map((l) => [l.points, l.source])).toEqual([
      [-1000, 'answers'],
      [1000, 'answers'],
    ]);
    expect(breakdownOf(linesOf(s, 'p2'))).toMatchObject({ plus: 1000, minus: -1000 });
    expectBalanced(s);
  });

  it('blitz: the streak bonus belongs to the winning attempt', () => {
    const streak = { length: 2, bonus: { kind: 'percent', value: 50 } } as const;
    const quiz = makeRoundsQuiz([blitzRound('b1', [single, withId(single, 'q2')], { check: 'manual', attempts: 2, rules: { ...DEFAULT_RULES, partial: null, penalty: 'minus', streak } })]);
    const turn = (s: GameState, correct: boolean, now: number) => must(judge(must(submitAnswer(must(buzz(s, 'p1', now)), 'p1', correct ? kyiv : lviv, now)), 'p1', correct, now));
    let s = turn(startRound(lobbyWith(quiz, 'Оля', 'Петро'), 0, rng), true, 1000);
    s = to(s, 'question', 1500);
    s = turn(turn(s, false, 2000), true, 3000);
    expect(s.phase).toBe('locked');
    expect(linesOf(s, 'p1').map((l) => l.points)).toEqual([1000, -1000, 1500]);
    expectBalanced(s);
  });

  it('a blitz cell penalty for everyone is a line of its own', () => {
    const c11 = withPoints(withId(single, 'c11'), 100);
    const c12 = withPoints(withId(single, 'c12'), 200);
    const cell: BoardCell = { question: c11, kind: 'blitz', penalty: 'all', mark: 'x2' } as BoardCell;
    const round = boardRound('g1', [{ title: 'A', cells: [cell, c12] }]);
    const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан', 'Віра')));
    let s = must(pickCell(must(next(intro, 0)), null, 'c11', 0, rng));
    s = must(acceptAnswer(must(submitAnswer(s, 'p1', lviv, 1000)), 'p1', 1000));
    s = must(acceptAnswer(must(submitAnswer(s, 'p2', kyiv, 2000)), 'p2', 2000));
    s = must(next(s, 3000));
    expect(s.players.map((p) => p.score)).toEqual([-200, 200, -200]);
    expect(linesOf(s, 'p3').map((l) => [l.points, l.source])).toEqual([[-200, 'answers']]);
    expectBalanced(s);
  });
});

describe('score lines sum to every score (11f)', () => {
  it('classic with a penalty, a streak and the speed bonus', () => {
    const streak = { length: 2, bonus: { kind: 'fixed', value: 100 } } as const;
    const quiz = makeQuiz(['q1', 'q2', 'q3'].map((id) => withId(single, id)), { speedBonus: true, rules: { ...DEFAULT_RULES, penalty: 'minus', streak } });
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро'), 0, rng);
    s = answer(s, { p1: kyiv, p2: lviv }, 3000);
    s = answer(to(s, 'question', 10_000), { p1: kyiv, p2: kyiv }, 12_000);
    s = answer(to(s, 'question', 20_000), { p1: kyiv }, 21_000);
    s = to(s, 'finished', 30_000);
    expect(s.plays[2].answers.p1.streakBonus).toBeGreaterThan(0);
    expectBalanced(s);
  });

  it('the double buff', () => {
    let s = must(takeBuff(toBuffQuestion(), 'p1', 'double', BUFF_T0, rng));
    s = answer(s, { p1: kyiv, p2: lviv }, BUFF_T0 + 1000);
    s = must(next(s, BUFF_T0 + 2000, rng));
    expect(s.players[0].score).toBe(2000);
    expectBalanced(s);
  });

  describe('the final', () => {
    const f1 = withId(single, 'f1');
    const quizWith = (wagerMode: 'classic' | 'bank') =>
      makeRoundsQuiz([classicRound('r1', [single, withId(withPoints(single, 400), 'q2')], MINUS), finalRound('f', f1, { wagerMode })], { leaderboard: 'end' });
    /** Рахунки 1000, 400, −400 перед фіналом; гра на етапі ставок. */
    function toWagers(wagerMode: 'classic' | 'bank'): GameState {
      let s = must(start(lobbyWith(quizWith(wagerMode), 'Анна', 'Богдан', 'Віра')));
      s = must(next(s, 0, rng));
      s = answer(s, { p1: kyiv }, 1000);
      s = must(next(s, 2000, rng));
      s = answer(must(next(s, 3000, rng)), { p2: kyiv, p3: lviv }, 4000);
      s = must(next(s, 5000, rng));
      return to(s, 'wager', 6000);
    }

    it('classic wagers: every reveal step', () => {
      let s = toWagers('classic');
      s = must(placeWager(s, 'p1', 500, 9000, rng));
      s = must(placeWager(s, 'p2', 400, 9500, rng));
      s = must(placeWager(s, 'p3', 0, 10_000, rng));
      s = answer(s, { p1: kyiv, p2: lviv }, 11_000);
      s = must(next(s, 13_000, rng));
      while (s.phase !== 'finished') {
        expectBalanced(s);
        s = must(next(s, 14_000, rng));
      }
      expectBalanced(s);
      expect(linesOf(s, 'p1').filter((l) => l.questionIndex === 2).map((l) => [l.source, l.points])).toEqual([['final', 500]]);
      expect(linesOf(s, 'p2').filter((l) => l.questionIndex === 2).map((l) => [l.source, l.points])).toEqual([['final', -400]]);
    });

    it('the shared bank after everyone is revealed', () => {
      let s = toWagers('bank');
      s = must(adjustScore(s, 'p3', 1000, 8500));
      s = must(placeWager(s, 'p1', 1000, 9000, rng));
      s = must(placeWager(s, 'p2', 400, 9500, rng));
      s = must(placeWager(s, 'p3', 200, 10_000, rng));
      s = answer(s, { p1: lviv, p2: kyiv, p3: kyiv }, 11_000);
      s = must(next(s, 13_000, rng));
      while (s.phase !== 'finished') {
        expectBalanced(s);
        s = must(next(s, 14_000, rng));
      }
      expectBalanced(s);
      expect(scoreLines(s).filter((l) => l.questionIndex === 2).every((l) => l.source === 'final')).toBe(true);
    });
  });

  it('wipeout: a taken bank and a carried bank are wipeout lines on the question where they were taken', () => {
    const RIGHT: Answer[] = [
      { type: 'single', optionId: 'b' },
      { type: 'boolean', value: true },
      { type: 'numeric', value: 2100 },
      { type: 'text', value: 'Одеса' },
      { type: 'slider', value: 52 },
    ];
    const quiz = makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder), classicRound('r2', [single])]);
    const stay = (s: GameState, ...ids: string[]) => {
      const play = wipeoutPlayOf(s);
      if (play === null) throw new Error('no wipeout play');
      return withCurrentPlay(s, { ...play, wipeout: { ...play.wipeout, stay: [...play.wipeout.stay, ...ids] } });
    };
    const toNext = (s: GameState, now: number) => {
      let current = must(next(s, now, rng));
      while (current.phase !== 'question' && current.phase !== 'round_end' && current.phase !== 'finished') {
        if (decisionOpen(current)) current = tick(current, current.endsAt ?? now);
        current = must(next(current, now, rng));
      }
      return current;
    };
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'), 0, rng);
    for (let i = 0; i < 5; i += 1) {
      const now = 10_000 * (i + 1);
      s = answer(s, { p1: RIGHT[i], ...(i === 0 ? { p2: RIGHT[0], p3: lviv } : {}) }, now);
      s = must(next(s, now + 500, rng));
      expectBalanced(s);
      if (i < 4) s = toNext(stay(s, 'p1'), now + 1000);
    }
    s = must(next(s, 70_000, rng));
    expect(s.phase).toBe('round_end');
    expectBalanced(s);
    expect(linesOf(s, 'p2').map((l) => [l.source, l.points, l.questionIndex])).toEqual([['wipeout', 100, 0]]);
    expect(linesOf(s, 'p1').map((l) => [l.source, l.points, l.questionIndex])).toEqual([['wipeout', 1500, 4]]);
    expect(linesOf(s, 'p3')).toEqual([]);
  });

  it('survival: the bonus is a survival line', () => {
    const RIGHT: Answer = { type: 'single', optionId: 'b' };
    const quiz = makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials), classicRound('r2', [single])], { leaderboard: 'each' });
    let s = answer(startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'), 0, rng), { p1: RIGHT, p2: lviv, p3: lviv }, 1000);
    s = must(next(must(next(s, 1500, rng)), 2000, rng));
    const current = survivalPlayOf(s);
    if (current === null) throw new Error('no survival play');
    const trial: SurvivalTrial = { kind: 'question', fellBack: false, stage: 'closed', questionId: 't1', presented: [], answers: {}, traps: {}, doors: {}, fallback: {}, out: ['p2', 'p3'] };
    s = withTotals(withCurrentPlay(s, { ...current, survival: { ...current.survival, trial } }));
    s = must(next(s, 3000, rng));
    expect(s.phase).toBe('round_end');
    expectBalanced(s);
    expect(linesOf(s, 'p1').map((l) => [l.source, l.points])).toEqual([
      ['answers', 100],
      ['survival', 500],
    ]);
  });

  it('ladder: the prize is a ladder line, the hall answers are answers', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single]), ladderRound('rl'), classicRound('r3', [withId(single, 'q3')])]);
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'), 0, rng);
    s = must(lock(s));
    while (!(s.phase === 'intro' && s.roundIndex === 1)) s = must(next(s, 2000, rng));
    s = must(next(must(pickContestant(s, 'p2')), 10_000, rng));
    s = answer(s, { p2: LADDER_RIGHT[0], p1: LADDER_RIGHT[0], p3: lviv }, 11_000);
    s = must(next(s, 11_100, rng));
    s = must(next(s, 12_000, rng));
    s = must(decideLadder(s, 'p2', true, 12_100));
    expectBalanced(s);
    expect(linesOf(s, 'p2').map((l) => [l.source, l.points])).toEqual([['ladder', 100]]);
    expect(linesOf(s, 'p1').map((l) => [l.source, l.points])).toEqual([['answers', 10]]);
  });

  it('a duel with a stake: plus to the winner, minus to the loser', () => {
    let s = must(next(must(declareDuel(toDeclarable(), 'p1', 'p2')), DUEL_T0 + 4000, rng));
    s = must(pickDuelCategory(s, 'p1', 'dc1', DUEL_T0 + 5000, rng));
    while (s.duel?.stage !== 'result') {
      s = must(answerDuel(s, 'p1', duelQuestionOf(s)?.accepted[0] ?? '', DUEL_T0 + 6000));
      s = must(next(s, DUEL_T0 + 6000, rng));
    }
    s = must(next(s, DUEL_T0 + 7000, rng));
    expectBalanced(s);
    expect(scoreLines(s).filter((l) => l.source === 'duel').map((l) => [l.playerId, l.points])).toEqual([
      ['p1', 300],
      ['p2', -300],
    ]);
  });

  it('buying a debuff is a debuff minus', () => {
    const s = must(buyDebuff(rich(), 'p1', 'p2', 'fog', DEBUFF_T0));
    expectBalanced(s);
    expect(linesOf(s, 'p1').map((l) => [l.source, l.points])).toEqual([
      ['host', 500],
      ['debuff', -200],
    ]);
  });

  it('a team game: lines only for the teams', () => {
    let s = must(next(teamGame(teamQuiz([classicRound('r1', [single], MINUS)]), [['Оля', 'Петро'], ['Іра', 'Марко']]), 0, rng));
    s = must(actAnswer(s, 'm1', kyiv, 1000));
    s = must(actAnswer(s, 'm3', lviv, 1000));
    if (s.phase === 'question') s = must(lock(s));
    s = must(next(s, 2000, rng));
    expectBalanced(s);
    expect(scoreLines(s).map((l) => [l.playerId, l.points])).toEqual([
      ['t1', 1000],
      ['t2', -1000],
    ]);
  });
});
