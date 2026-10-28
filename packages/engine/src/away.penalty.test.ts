import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer, type Quiz, type QuizSettings, type Round } from '@quiz/shared';
import { adjustScore } from './adjust';
import { castAppealVote, openAppeal } from './appeal';
import { awayEnd, awayPenalized, awayPenaltyOn, awayStart, awayStep, ownAway } from './away';
import { pickCell } from './board';
import { declareDuel, dropDuel } from './duel';
import { placeWager } from './final';
import { end, endRound, lock, next, override, recordOf, start, submitAnswer, type GameState, type Result } from './game';
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
import { undoPanel, undoScore } from './undo';

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
/**
 * Класика q100 (Анна p1 і Богдан p2 відповідають правильно: по 100), фінал f1 з wagerMode; ставки 50 і 50.
 * Анна виходила 3500 мс у фіналі й відповідає p1Answer, Богдан — неправильно; гра пройдена до кінця кроками з awayStep.
 */
function playFinal(p1Answer: Answer, wagerMode: 'classic' | 'bank' = 'classic'): GameState {
  let s = must(start(lobbyWith(quizOf([classicRound('r1', [q100], PLAIN), finalRound('f', withId(single, 'f1'), { wagerMode })], { awayPenalty: true }), 'Анна', 'Богдан')));
  s = must(next(s, 0, rng));
  s = must(submitAnswer(must(submitAnswer(s, 'p1', right, 1000)), 'p2', right, 1000));
  while (s.phase !== 'wager') s = must(next(s, 2000, rng));
  s = must(placeWager(s, 'p1', 50, 3000, rng));
  s = must(placeWager(s, 'p2', 50, 3000, rng));
  expect(s.phase).toBe('question');
  expect(s.questionIndex).toBe(1);
  s = withAway(s, 'p1', 3500);
  s = must(submitAnswer(must(submitAnswer(s, 'p1', p1Answer, 4000)), 'p2', wrong, 4000));
  expect(s.phase).toBe('locked');
  let t = 5000;
  while (s.phase === 'locked' || s.phase === 'reveal') {
    const moved = step(s, next(s, t, rng), t);
    if (moved.phase === 'reveal') expect(penalties(moved)).toEqual([]);
    s = moved;
    t += 1000;
  }
  expect(s.phase).toBe('finished');
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
    // той самий крок ще раз (повторний commit) — без другого штрафу
    expect(awayStep(reveal, s, 10_000, new Set())).toBe(s);
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
    // відповідь чекає в черзі (question), «Прийняти» закриває запитання (locked)
    const sent = awayStep(s, sendBlitz(s, 'p1', right, 1000), 1000, none);
    expect(sent.phase).toBe('question');
    expect(penalties(sent)).toEqual([]);
    s = awayStep(sent, acceptAll(sent, 1000), 1000, none);
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
    // відповідь чекає на ведучого (question), «Прийняти» відкриває розкриття клітинки
    const held = step(s, submitAnswer(s, chooser, right, 1000), 1000);
    expect(held.phase).toBe('question');
    const reveal = awayStep(held, acceptAll(held, 1000), 1000, none);
    expect(reveal.phase).toBe('reveal');
    expect(penalties(reveal)).toEqual([]);
    const left = step(reveal, next(reveal, 3000, rng), 3000);
    expect(penalties(left)).toEqual([expect.objectContaining({ playerId: chooser, points: -100, afterQuestion: 1 })]);
  });

  it('final: the penalty comes on leaving the reveal of the final, the visible points', () => {
    const s = playFinal(right);
    expect(penalties(s)).toEqual([expect.objectContaining({ playerId: 'p1', points: -50, afterQuestion: 2, roundIndex: 1 })]);
    expect(score(s, 'p1')).toBe(100);
    // повторний commit того самого кроку штрафу не подвоює
    expect(awayStep(s, s, 99_000, none)).toBe(s);
  });

  it('final: a wrong answer loses the wager, no penalty row on top', () => {
    const s = playFinal(wrong);
    expect(recordOf(s, 1, 'p1')?.points).toBe(-50);
    expect(penalties(s)).toEqual([]);
    expect(score(s, 'p1')).toBe(50);
  });

  it('final in the bank mode: the penalty takes the share after the split', () => {
    const s = playFinal(right, 'bank');
    const points = recordOf(s, 1, 'p1')?.points ?? 0;
    expect(points).toBeGreaterThan(0);
    expect(penalties(s)).toEqual([expect.objectContaining({ playerId: 'p1', points: -points, afterQuestion: 2, roundIndex: 1 })]);
    expect(score(s, 'p1')).toBe(100);
  });

  it('end() straight from the question decides the penalty; a double commit adds nothing', () => {
    let open = startRound(lobbyWith(quizOf([classicRound('r1', [q100, q2], PLAIN)]), 'Оля', 'Петро'), 1000, rng);
    open = withAway(must(submitAnswer(open, 'p1', right, 2000)), 'p1', 3500);
    const ended = step(open, end(open, 3000), 3000);
    expect(ended.phase).toBe('finished');
    expect(penalties(ended)).toEqual([expect.objectContaining({ playerId: 'p1', points: -100, afterQuestion: 1, roundIndex: 0 })]);
    expect(score(ended, 'p1')).toBe(0);
    expect(awayStep(open, ended, 3000, none)).toBe(ended);
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
    expect(w.phase).toBe('question'); // Петро ще не відповів
    w = must(lock(w));
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
    expect(s.phase).toBe('locked');
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

  it('undoing the answer of the question undoes its penalty too; bringing the answer back brings the penalty back', () => {
    const locked = classicLocked(3500);
    const s = leaveReveal(locked);
    const seq = penalties(s)[0].seq;
    const undone = must(undoScore(s, { question: 0, playerId: 'p1' }, 11_000));
    const undos = undone.adjustments.filter((a) => a.source === 'undo');
    expect(undos.map((a) => [a.playerId, a.points, a.undoes])).toEqual([
      ['p1', -100, { question: 0 }],
      ['p1', 100, { seq }],
    ]);
    expect(new Set(undos.map((a) => a.batch)).size).toBe(1);
    expect(score(undone, 'p1')).toBe(0);
    // «Повернути» відповідь — повертається й штраф: знову 0 за запитання
    const redone = must(undoScore(undone, { seq: undos[0].seq }, 12_000));
    expect(redone.adjustments.slice(-2).map((a) => [a.points, a.undoes])).toEqual([
      [100, { seq: undos[0].seq }],
      [-100, { seq: undos[1].seq }],
    ]);
    expect(score(redone, 'p1')).toBe(0);
    // уже скасований штраф друге скасування відповіді не чіпає
    const penaltyOnly = must(undoScore(s, { seq }, 11_000));
    const answerToo = must(undoScore(penaltyOnly, { question: 0, playerId: 'p1' }, 12_000));
    expect(answerToo.adjustments.length - penaltyOnly.adjustments.length).toBe(1);
    expect(score(answerToo, 'p1')).toBe(0);
  });

  it('after the end of the game only the penalty can be undone and brought back', () => {
    const s = playFinal(right);
    const seq = penalties(s)[0].seq;
    const panel = undoPanel(s);
    expect(panel?.rounds.map((r) => r.questions.map((q) => q.rows.map((row) => [row.kind, row.playerId, row.points])))).toEqual([[[['away', 'p1', -50]]]]);
    expect(panel?.rounds[0].loose).toEqual([]);
    expect(undoScore(s, { question: 1, playerId: 'p1' }, 99_000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(undoScore(s, { question: 0, playerId: 'p2' }, 99_000)).toEqual({ ok: false, error: 'wrong_phase' });
    const undone = must(undoScore(s, { seq }, 99_000));
    expect(score(undone, 'p1')).toBe(150);
    expect(undoPanel(undone)?.rounds[0].questions[0].rows[0].undoneBy).not.toBeNull();
    const undoSeq = undone.adjustments.at(-1)!.seq;
    const redone = must(undoScore(undone, { seq: undoSeq }, 99_500));
    expect(score(redone, 'p1')).toBe(100);
    // масова дія за запитання після кінця — лише штраф
    const mass = must(undoScore(s, { question: 1 }, 99_000));
    expect(mass.adjustments.length - s.adjustments.length).toBe(1);
    expect(score(mass, 'p1')).toBe(150);
    // без штрафу після кінця панелі немає, бали ведучого не скасовуються
    const host = must(end(must(adjustScore(classicLocked(0), 'p2', 50, 9000)), 9500));
    expect(undoPanel(host)).toBeNull();
    expect(undoScore(host, { seq: 1 }, 9600)).toEqual({ ok: false, error: 'wrong_phase' });
    // автопілот — без панелі й без скасування, як і раніше
    const pilot: GameState = { ...s, autopilot: { authorId: 'p1', at: null } };
    expect(undoPanel(pilot)).toBeNull();
    expect(undoScore(pilot, { seq }, 99_000)).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('the away penalty and the appeal (12f)', () => {
  /** Розкриття класики: Оля виходила 3500 мс і відповіла p1Answer, Петро — навпаки; Оля оскаржує з підставою reason, Петро голосує yes. */
  function appealed(p1Answer: Answer, reason: 'grade' | 'away', yes: boolean): GameState {
    let s = startRound(lobbyWith(quizOf([classicRound('r1', [q100, q2], PLAIN)]), 'Оля', 'Петро'), 1000, rng);
    s = withAway(s, 'p1', 3500);
    s = must(submitAnswer(s, 'p1', p1Answer, 2000));
    s = must(submitAnswer(s, 'p2', p1Answer === right ? wrong : right, 2000));
    s = step(s, next(s, 9000, rng), 9000);
    expect(s.phase).toBe('reveal');
    s = must(openAppeal(s, 'p1', reason, 9500));
    return must(castAppealVote(s, 'p2', 1, yes, 9600));
  }
  const leave = (s: GameState) => step(s, next(s, 10_000, rng), 10_000);

  it('a passed away appeal drops the coming penalty', () => {
    const s = appealed(right, 'away', true);
    expect(s.appeals?.[0].outcome).toBe('yes');
    expect(awayPenalized(s, 0)).toEqual([]);
    expect(ownAway(s, 'p1')?.penalty).toBe(false);
    const left = leave(s);
    expect(penalties(left)).toEqual([]);
    expect(score(left, 'p1')).toBe(100);
  });

  it('a lost away appeal keeps the penalty', () => {
    const s = appealed(right, 'away', false);
    expect(s.appeals?.[0].outcome).toBe('no');
    expect(awayPenalized(s, 0)).toEqual(['p1']);
    expect(ownAway(s, 'p1')?.penalty).toBe(true);
    const left = leave(s);
    expect(penalties(left)).toEqual([expect.objectContaining({ playerId: 'p1', points: -100 })]);
    expect(score(left, 'p1')).toBe(0);
  });

  it('a passed grade appeal with a 3.5 s leave: the penalty also takes the appeal points, zero for the question', () => {
    const s = appealed(wrong, 'grade', true);
    expect(s.adjustments).toEqual([expect.objectContaining({ playerId: 'p1', points: 100, source: 'appeal' })]);
    expect(score(s, 'p1')).toBe(100);
    const left = leave(s);
    expect(penalties(left)).toEqual([expect.objectContaining({ playerId: 'p1', points: -100, afterQuestion: 1 })]);
    expect(score(left, 'p1')).toBe(0);
  });
});
