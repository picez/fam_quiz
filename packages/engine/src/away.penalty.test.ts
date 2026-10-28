import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer, type Quiz, type QuizSettings, type Round } from '@quiz/shared';
import { awayEnd, awayPenalized, awayPenaltyOn, awayStart, awayStep } from './away';
import { pickCell } from './board';
import { declareDuel, dropDuel } from './duel';
import { placeWager } from './final';
import { endRound, lock, next, override, recordOf, start, submitAnswer, type GameState, type Result } from './game';
import { actAnswer } from './team-act';
import {
  blitzRound,
  boardRound,
  classicRound,
  finalRound,
  ladderRound,
  makeRoundsQuiz,
  poll,
  single,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  wipeoutLadder,
  wipeoutRound,
  withId,
  withPoints,
} from './testing/fixtures';
import { acceptAll, lobbyWith, must, openAt, sendBlitz, startRound } from './testing/helpers';
import { duelQuiz, toDeclarable } from './testing/duel';
import { teamGame, teamQuiz } from './testing/teams';
import { undoScore } from './undo';

const rng = () => 0;
const right: Answer = { type: 'single', optionId: 'b' };
const wrong: Answer = { type: 'single', optionId: 'a' };
const PLAIN = { speedBonus: false, rules: DEFAULT_RULES };
const MINUS = { speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' as const } };
const q100 = withPoints(single, 100);
const q2 = withId(q100, 'q2');
const ON: Partial<QuizSettings> = { awayPenalty: true, leaderboard: 'each' };
const none = new Set<string>();

const quizOf = (rounds: Round[], settings: Partial<QuizSettings> = ON): Quiz => makeRoundsQuiz(rounds, settings);
/** Закритий запис виходу людини на запитанні q (за замовчуванням — поточному). */
function withAway(s: GameState, person: string, ms: number, q = s.questionIndex): GameState {
  const plays = [...s.plays];
  plays[q] = { ...plays[q], away: { ...plays[q].away, [person]: { ms, count: 1, since: null } } };
  return { ...s, plays };
}
/** Крок, як RoomManager.commit: перехід і awayStep. */
const step = (s: GameState, result: Result, at: number) => awayStep(s, must(result), at, none);
const penalties = (s: GameState) => s.adjustments.filter((a) => a.source === 'away');
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;

/** Класика q100, q2 (Оля p1, Петро p2), перше запитання о 1000; Оля виходила ms і відповіла правильно, Петро — неправильно; закрито. */
function classicLocked(ms: number, settings: Partial<QuizSettings> = ON, rules = PLAIN, rounds?: Round[]): GameState {
  let s = startRound(lobbyWith(quizOf(rounds ?? [classicRound('r1', [q100, q2], rules)], settings), 'Оля', 'Петро'), 1000, rng);
  s = withAway(s, 'p1', ms);
  s = must(submitAnswer(s, 'p1', right, 2000));
  s = must(submitAnswer(s, 'p2', wrong, 2000));
  expect(s.phase).toBe('locked');
  return s;
}
/** Вихід із розкриття класики: штрафи, дописані на ньому. */
function leaveReveal(locked: GameState): GameState {
  const reveal = step(locked, next(locked, 9000, rng), 9000);
  return step(reveal, next(reveal, 10_000, rng), 10_000);
}

describe('the away penalty (12e)', () => {
  it('three seconds away cost the positive points of the question once, on leaving the reveal', () => {
    const locked = classicLocked(3500);
    const reveal = must(next(locked, 9000, rng)); // locked → reveal
    expect(awayStep(locked, reveal, 9000, new Set()).adjustments).toEqual([]);
    const moved = must(next(reveal, 10_000, rng)); // reveal → leaderboard
    const s = awayStep(reveal, moved, 10_000, new Set());
    expect(s.adjustments).toEqual([expect.objectContaining({ playerId: 'p1', points: -100, source: 'away', afterQuestion: 1, roundIndex: 0, at: 10_000 })]);
    expect(s.players.find((p) => p.id === 'p1')?.score).toBe(0);
    expect(awayStep(s, s, 11_000, new Set())).toBe(s);
  });

  it('the threshold is three seconds in total', () => {
    expect(penalties(leaveReveal(classicLocked(2900)))).toEqual([]);
    expect(penalties(leaveReveal(classicLocked(3000))).map((a) => a.points)).toEqual([-100]);
    // дві відлучки по 1600 мс — разом 3200
    let s = startRound(lobbyWith(quizOf([classicRound('r1', [q100, q2], PLAIN)]), 'Оля', 'Петро'), 1000, rng);
    s = awayEnd(awayStart(s, 'p1', 1100), 'p1', 2700);
    s = awayEnd(awayStart(s, 'p1', 3000), 'p1', 4600);
    expect(s.plays[0].away?.p1).toEqual({ ms: 3200, count: 2, since: null });
    s = must(submitAnswer(must(submitAnswer(s, 'p1', right, 5000)), 'p2', wrong, 5000));
    expect(penalties(leaveReveal(s)).map((a) => a.playerId)).toEqual(['p1']);
  });

  it('without the setting there is no penalty', () => {
    const s = leaveReveal(classicLocked(10_000, { leaderboard: 'each' }));
    expect(penalties(s)).toEqual([]);
    expect(awayPenaltyOn(s, 0)).toBe(false);
    expect(awayPenalized(s, 0)).toEqual([]);
  });

  it('negative points are not taken away', () => {
    let s = classicLocked(0, ON, MINUS);
    s = withAway(s, 'p2', 5000);
    s = leaveReveal(s);
    expect(recordOf(s, 0, 'p2')?.points).toBe(-100);
    expect(awayPenalized(s, 0)).toEqual(['p2']);
    expect(penalties(s)).toEqual([]);
    expect(score(s, 'p2')).toBe(-100);
  });

  it('the host grade on the reveal counts: the penalty equals the new points', () => {
    let s = startRound(lobbyWith(quizOf([classicRound('r1', [q100, q2], PLAIN)]), 'Оля', 'Петро'), 1000, rng);
    s = withAway(s, 'p1', 3500);
    s = must(submitAnswer(must(submitAnswer(s, 'p1', wrong, 2000)), 'p2', wrong, 2000));
    const reveal = step(s, next(s, 9000, rng), 9000);
    const graded = step(reveal, override(reveal, 'p1', 'correct', 9500), 9500);
    expect(penalties(graded)).toEqual([]);
    expect(recordOf(graded, 0, 'p1')?.points).toBe(100);
    const left = step(graded, next(graded, 10_000, rng), 10_000);
    expect(penalties(left).map((a) => [a.playerId, a.points])).toEqual([['p1', -100]]);
    expect(score(left, 'p1')).toBe(0);
  });

  it('blitz: the penalty comes on the close, the points of the attempts', () => {
    const quiz = quizOf([blitzRound('b1', [q100, q2], { check: 'auto' })]);
    let s = startRound(lobbyWith(quiz, 'Анна', 'Богдан'), 0, rng);
    s = withAway(s, 'p1', 3500);
    const before = s;
    s = acceptAll(sendBlitz(s, 'p1', right, 1000), 1000);
    if (s.phase === 'question') {
      expect(penalties(awayStep(before, s, 1000, none))).toEqual([]);
      s = step(s, lock(s), 2000);
    } else {
      s = awayStep(before, s, 1000, none);
    }
    expect(s.phase).toBe('locked');
    const points = recordOf(s, 0, 'p1')?.points ?? 0;
    expect(points).toBeGreaterThan(0);
    expect(penalties(s)).toEqual([expect.objectContaining({ playerId: 'p1', points: -points, afterQuestion: 1 })]);
    expect(score(s, 'p1')).toBe(0);
    // розкриття й вихід із нього — без другого штрафу
    const reveal = step(s, next(s, 3000, rng), 3000);
    expect(penalties(step(reveal, next(reveal, 4000, rng), 4000))).toHaveLength(1);
  });

  it('board: a normal cell is penalized on leaving the reveal, under the index of the cell', () => {
    const c11 = withPoints(withId(single, 'c11'), 100);
    const c12 = withPoints(withId(single, 'c12'), 200);
    const quiz = quizOf([boardRound('g1', [{ title: 'A', cells: [c11, c12] }])]);
    const intro = must(start(lobbyWith(quiz, 'Анна', 'Богдан')));
    let s = must(pickCell(must(next(intro, 0)), null, 'c11', 0, rng));
    const chooser = s.plays[0].board?.chooserId ?? '';
    s = withAway(s, chooser, 3500);
    s = awayStep(s, acceptAll(must(submitAnswer(s, chooser, right, 1000)), 1000), 1000, none);
    if (s.phase === 'question') s = step(s, lock(s), 1500);
    const reveal = s.phase === 'locked' ? step(s, next(s, 2000, rng), 2000) : s;
    expect(reveal.phase).toBe('reveal');
    expect(penalties(reveal)).toEqual([]);
    const left = step(reveal, next(reveal, 3000, rng), 3000);
    expect(penalties(left)).toEqual([expect.objectContaining({ playerId: chooser, points: -100, afterQuestion: 1 })]);
  });

  it('final: the penalty comes on leaving the reveal of the final, the visible points', () => {
    let s = must(start(lobbyWith(quizOf([classicRound('r1', [q100], PLAIN), finalRound('f', withId(single, 'f1'))], { awayPenalty: true }), 'Анна', 'Богдан')));
    s = must(next(s, 0, rng));
    s = must(submitAnswer(must(submitAnswer(s, 'p1', right, 1000)), 'p2', right, 1000));
    while (s.phase !== 'wager') s = must(next(s, 2000, rng));
    s = must(placeWager(s, 'p1', 50, 3000, rng));
    s = must(placeWager(s, 'p2', 0, 3000, rng));
    expect(s.phase).toBe('question');
    const q = s.questionIndex;
    s = withAway(s, 'p1', 3500);
    s = must(submitAnswer(must(submitAnswer(s, 'p1', right, 4000)), 'p2', wrong, 4000));
    if (s.phase === 'question') s = must(lock(s));
    let t = 5000;
    while (s.phase === 'locked' || s.phase === 'reveal') {
      const moved = step(s, next(s, t, rng), t);
      if (moved.phase === 'reveal') expect(penalties(moved)).toEqual([]);
      s = moved;
      t += 1000;
    }
    expect(s.phase).toBe('finished');
    expect(penalties(s)).toEqual([expect.objectContaining({ playerId: 'p1', points: -50, afterQuestion: q + 1, roundIndex: 1 })]);
    expect(score(s, 'p1')).toBe(100);
  });

  it('wipeout, survival, ladder and polls keep only the mark', () => {
    const settings = { awayPenalty: true };
    const wipe = withAway(startRound(lobbyWith(quizOf([wipeoutRound('w', wipeoutLadder)], settings), 'Оля', 'Петро'), 1000, rng), 'p1', 5000);
    const surv = withAway(openAt(lobbyWith(quizOf([survivalRound('s', survivalQuestions, survivalTrials)], settings), 'Оля', 'Петро'), 1000, rng), 'p1', 5000);
    let lad = must(start(lobbyWith(quizOf([ladderRound('l', undefined, { pick: 'random' })], settings), 'Оля', 'Петро')));
    while (lad.phase !== 'question') lad = must(next(lad, 1000, rng));
    lad = withAway(lad, lad.ladder?.contestantId ?? '', 5000);
    const pol = withAway(startRound(lobbyWith(quizOf([classicRound('r', [poll, q100], PLAIN)], settings), 'Оля', 'Петро'), 1000, rng), 'p1', 5000);
    for (const s of [wipe, surv, lad, pol]) {
      expect(s.phase).toBe('question');
      expect(awayPenaltyOn(s, s.questionIndex)).toBe(false);
      expect(awayPenalized(s, s.questionIndex)).toEqual([]);
      expect(Object.values(s.plays[s.questionIndex].away ?? {})[0]?.ms).toBe(5000);
    }
    // «Ва-банк» до кінця кроку: правильна відповідь і вихід із розкриття — без штрафу
    let w = must(submitAnswer(wipe, 'p1', right, 2000));
    if (w.phase === 'question') w = must(lock(w));
    while (w.phase === 'locked' || w.phase === 'reveal') w = step(w, next(w, 3000, rng), 3000);
    expect(penalties(w)).toEqual([]);
  });

  it('every transition out of the question puts the penalty right after it', () => {
    const two = [classicRound('r1', [q100, q2], PLAIN), classicRound('r2', [withId(q100, 'q3')], PLAIN)];
    // нове запитання (таблиця лише наприкінці)
    const toNext = leaveReveal(classicLocked(3500, { awayPenalty: true, leaderboard: 'end' }, PLAIN, two));
    expect(toNext.phase).toBe('question');
    // таблиця
    const toBoard = leaveReveal(classicLocked(3500, ON, PLAIN, two));
    expect(toBoard.phase).toBe('leaderboard');
    // підсумки раунду: одне запитання в раунді
    const toRoundEnd = leaveReveal(classicLocked(3500, ON, PLAIN, [classicRound('r1', [q100], PLAIN), classicRound('r2', [q2], PLAIN)]));
    expect(toRoundEnd.phase).toBe('round_end');
    // кінець гри
    const toEnd = leaveReveal(classicLocked(3500, ON, PLAIN, [classicRound('r1', [q100], PLAIN)]));
    expect(toEnd.phase).toBe('finished');
    // «Завершити раунд» просто з запитання
    let open = startRound(lobbyWith(quizOf(two), 'Оля', 'Петро'), 1000, rng);
    open = withAway(must(submitAnswer(open, 'p1', right, 2000)), 'p1', 3500);
    const ended = step(open, endRound(open, 3000), 3000);
    expect(ended.phase).toBe('round_end');
    for (const s of [toNext, toBoard, toRoundEnd, toEnd, ended]) {
      expect(penalties(s)).toEqual([expect.objectContaining({ playerId: 'p1', points: -100, afterQuestion: 1, roundIndex: 0 })]);
      expect(score(s, 'p1')).toBe(0);
    }
  });

  it('a duel on the reveal is not the end yet; leaving the reveal after it is', () => {
    const base = duelQuiz();
    const quiz = { ...base, settings: { ...base.settings, awayPenalty: true } };
    let s = withAway(toDeclarable({}, quiz), 'p1', 3500);
    const q = s.questionIndex;
    expect(s.phase).toBe('reveal');
    s = must(declareDuel(s, 'p1', 'p2'));
    const duel = step(s, next(s, 1_004_000, rng), 1_004_000);
    expect(duel.phase).toBe('duel');
    expect(penalties(duel)).toEqual([]);
    const back = awayStep(duel, dropDuel(duel), 1_005_000, none);
    expect(back.phase).toBe('reveal');
    expect(penalties(back)).toEqual([]);
    const left = step(back, next(back, 1_006_000, rng), 1_006_000);
    const points = recordOf(left, q, 'p1')?.points ?? 0;
    expect(points).toBeGreaterThan(0);
    expect(penalties(left)).toEqual([expect.objectContaining({ playerId: 'p1', points: -points, afterQuestion: q + 1 })]);
  });

  it('a team is penalized when any of its people left', () => {
    const base = teamQuiz([classicRound('r1', [q100, q2], PLAIN)]);
    const quiz = { ...base, settings: { ...base.settings, ...ON } };
    let s = must(next(teamGame(quiz, [['Оля', 'Петро'], ['Віра']]), 1000, rng));
    s = withAway(s, 'm2', 3500);
    expect(awayPenalized(s, 0)).toEqual(['t1']);
    s = must(actAnswer(s, 'm1', right, 2000));
    s = must(actAnswer(s, 'm3', wrong, 2000));
    if (s.phase === 'question') s = must(lock(s));
    const left = leaveReveal(s);
    expect(penalties(left)).toEqual([expect.objectContaining({ playerId: 't1', points: -100, afterQuestion: 1 })]);
    expect(score(left, 't1')).toBe(0);
  });

  it('an autopilot game is penalized the same way', () => {
    const locked: GameState = { ...classicLocked(3500), autopilot: { authorId: 'p1', at: null } };
    expect(penalties(leaveReveal(locked)).map((a) => [a.playerId, a.points])).toEqual([['p1', -100]]);
  });

  it('the host undoes the penalty; awayStep does not put it back', () => {
    const locked = classicLocked(3500);
    const reveal = must(next(locked, 9000, rng));
    const s = awayStep(reveal, must(next(reveal, 10_000, rng)), 10_000, none);
    const seq = penalties(s)[0].seq;
    const undone = must(undoScore(s, { seq }, 11_000));
    expect(score(undone, 'p1')).toBe(100);
    const again = awayStep(reveal, undone, 12_000, none);
    expect(penalties(again)).toHaveLength(1);
    expect(score(again, 'p1')).toBe(100);
  });
});
