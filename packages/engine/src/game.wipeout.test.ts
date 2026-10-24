import { describe, expect, it } from 'vitest';
import type { Answer } from '@quiz/shared';
import { end, endRound, lock, next, recordOf, start, submitAnswer, withCurrentPlay, withTotals, type GameState } from './game';
import { classicRound, makeRoundsQuiz, single, wipeoutLadder, wipeoutRound } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, startRound } from './testing/helpers';
import { wipeoutCorrect, wipeoutIn, wipeoutPlayOf, wipeoutTable } from './wipeout';

const rng = () => 0;
const quiz = makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder), classicRound('r2', [single])]);
const lobby = () => lobbyWith(quiz, 'Оля', 'Петро', 'Віра');

/** Правильна й неправильна відповідь на кожну сходинку w1…w5. */
const RIGHT: Answer[] = [
  { type: 'single', optionId: 'b' },
  { type: 'boolean', value: true },
  { type: 'numeric', value: 2100 },
  { type: 'text', value: 'Одеса' },
  { type: 'slider', value: 52 },
];
const WRONG: Answer[] = [
  { type: 'single', optionId: 'a' },
  { type: 'boolean', value: false },
  { type: 'numeric', value: 3000 },
  { type: 'text', value: 'Львів' },
  { type: 'slider', value: 53 },
];

const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;

/** Гравці вибирають «Далі» (до задачі 3 — прямо в журналі). */
function stay(s: GameState, ...ids: string[]): GameState {
  const play = wipeoutPlayOf(s);
  if (play === null) throw new Error('no wipeout play');
  return withCurrentPlay(s, { ...play, wipeout: { ...play.wipeout, stay: [...play.wipeout.stay, ...ids] } });
}

/** «Далі», доки не відкриється наступне запитання або раунд не скінчиться. */
function toNext(s: GameState, now: number): GameState {
  let current = must(next(s, now, rng));
  while (current.phase !== 'question' && current.phase !== 'round_end' && current.phase !== 'finished') current = must(next(current, now, rng));
  return current;
}

/** Відповіді на поточну сходинку о now, закриття й розкриття. */
function playRung(s: GameState, answers: Record<string, Answer>, now: number): GameState {
  let current = s;
  for (const [id, answer] of Object.entries(answers)) current = must(submitAnswer(current, id, answer, now));
  if (current.phase === 'question') current = must(lock(current));
  return must(next(current, now + 500, rng));
}

describe('wipeout: answers and banks', () => {
  it('everyone is in at the start and answers the first rung', () => {
    const s = startRound(lobby(), 0, rng);
    expect(s.phase).toBe('question');
    expect(wipeoutIn(s)).toEqual(['p1', 'p2', 'p3']);
    expect(s.plays[0].wipeout).toEqual({ took: [], stay: [], end: false });
  });

  it('a right answer is correct with no points yet; a wrong one burns', () => {
    let s = startRound(lobby(), 0, rng);
    s = must(submitAnswer(s, 'p1', RIGHT[0], 1000));
    s = must(submitAnswer(s, 'p2', WRONG[0], 1000));
    s = must(lock(s));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ grade: 'correct', accepted: true, accuracy: 1, points: 0, basePoints: 0 });
    expect(recordOf(s, 0, 'p2')).toMatchObject({ grade: 'wrong', accepted: false, accuracy: 0, points: 0 });
    s = must(next(s, 2000, rng));
    expect(s.phase).toBe('reveal');
    expect(wipeoutTable(s)).toEqual({
      p1: { status: 'in', bank: 100, step: null },
      p2: { status: 'burned', bank: 0, step: 0 },
      p3: { status: 'burned', bank: 0, step: 0 },
    });
    expect(wipeoutIn(s)).toEqual(['p1']);
  });

  it('a burned player cannot answer the next rung', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: WRONG[0] }, 1000);
    s = toNext(stay(s, 'p1'), 3000);
    expect(s.phase).toBe('question');
    expect(s.plays[1].question.id).toBe('w2');
    expect(submitAnswer(s, 'p2', RIGHT[1], 4000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(submitAnswer(s, 'p3', RIGHT[1], 4000)).toEqual({ ok: false, error: 'not_allowed' });
    // Оля — єдина в грі: її відповідь закриває запитання
    const answered = must(submitAnswer(s, 'p1', RIGHT[1], 4000));
    expect(answered.phase).toBe('locked');
  });

  it('a player still in cannot answer twice', () => {
    let s = startRound(lobby(), 0, rng);
    s = must(submitAnswer(s, 'p1', RIGHT[0], 1000));
    expect(submitAnswer(s, 'p1', RIGHT[0], 1500)).toEqual({ ok: false, error: 'already_answered' });
    expect(submitAnswer(s, 'p2', { type: 'boolean', value: true }, 1500)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p2', RIGHT[0], 20_001)).toEqual({ ok: false, error: 'time_over' });
  });

  it('slider counts only inside the tolerance', () => {
    const w5 = wipeoutLadder[4];
    expect(wipeoutCorrect(w5, { type: 'slider', value: 52 })).toBe(true);
    expect(wipeoutCorrect(w5, { type: 'slider', value: 48 })).toBe(true);
    // 53: частка ≥ 0,5 за 10b, але тут — поза допуском
    expect(wipeoutCorrect(w5, { type: 'slider', value: 53 })).toBe(false);
    expect(wipeoutCorrect(w5, { type: 'numeric', value: 50 })).toBe(false);
  });

  it('numeric inside the tolerance is right even off the exact value', () => {
    const w3 = wipeoutLadder[2];
    expect(wipeoutCorrect(w3, { type: 'numeric', value: 2100 })).toBe(true);
    expect(wipeoutCorrect(w3, { type: 'numeric', value: 2162 })).toBe(false);
    expect(wipeoutCorrect(wipeoutLadder[3], { type: 'text', value: ' одеса ' })).toBe(true);
    expect(wipeoutCorrect(wipeoutLadder[1], { type: 'boolean', value: false })).toBe(false);
  });

  it('survivors cash in when the last rung closes the round', () => {
    let s = startRound(lobby(), 0, rng);
    for (let i = 0; i < 5; i += 1) {
      const now = 10_000 * (i + 1);
      s = playRung(s, { p1: RIGHT[i], ...(i === 0 ? { p2: WRONG[0] } : {}) }, i === 0 ? 1000 : now);
      if (i < 4) s = toNext(stay(s, 'p1'), now + 1000);
    }
    expect(s.phase).toBe('reveal');
    // до кінця раунду банк ще в драбині, не в балах
    expect(score(s, 'p1')).toBe(0);
    s = must(next(s, 70_000, rng));
    expect(s.phase).toBe('round_end');
    expect(s.plays[4].wipeout?.end).toBe(true);
    expect(s.plays.slice(0, 4).map((p) => p.wipeout?.end)).toEqual([false, false, false, false]);
    expect(recordOf(s, 4, 'p1')?.points).toBe(1500);
    expect(recordOf(s, 4, 'p1')?.basePoints).toBe(1500);
    expect([0, 1, 2, 3].map((i) => recordOf(s, i, 'p1')?.points)).toEqual([0, 0, 0, 0]);
    expect(score(s, 'p1')).toBe(1500);
    expect(score(s, 'p2')).toBe(0);
    expect(wipeoutTable(s).p1).toEqual({ status: 'survived', bank: 1500, step: 4 });
  });

  it('a bank taken after a rung moves into the score', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: RIGHT[0] }, 1000);
    const play = wipeoutPlayOf(s)!;
    // рішення вписано прямо в журнал (до задачі 3); рахунок перераховує withTotals
    s = withTotals(withCurrentPlay(s, { ...play, wipeout: { ...play.wipeout, took: ['p2'], stay: ['p1'] } }));
    s = toNext(s, 3000);
    expect(wipeoutIn(s)).toEqual(['p1']);
    expect(recordOf(s, 0, 'p2')?.points).toBe(100);
    expect(score(s, 'p2')).toBe(100);
    expect(score(s, 'p1')).toBe(0);
  });

  it('nobody in ends the round early', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: WRONG[0], p2: WRONG[0], p3: WRONG[0] }, 1000);
    expect(wipeoutIn(s)).toEqual([]);
    s = must(next(s, 3000, rng));
    expect(s.phase).toBe('round_end');
    expect(s.plays).toHaveLength(1);
    expect(s.plays[0].wipeout?.end).toBe(true);
    expect(s.players.map((p) => p.score)).toEqual([0, 0, 0]);
  });

  it('ending the round mid-question is like time over', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: WRONG[0], p3: RIGHT[0] }, 1000);
    s = toNext(stay(s, 'p1', 'p3'), 3000);
    s = must(submitAnswer(s, 'p1', RIGHT[1], 4000));
    expect(s.phase).toBe('question');
    s = must(endRound(s, 5000));
    expect(s.phase).toBe('round_end');
    expect(recordOf(s, 1, 'p3')).toBeUndefined();
    expect(wipeoutTable(s)).toEqual({
      p1: { status: 'survived', bank: 300, step: 1 },
      p2: { status: 'burned', bank: 0, step: 0 },
      p3: { status: 'burned', bank: 0, step: 1 },
    });
    expect(recordOf(s, 1, 'p1')?.points).toBe(300);
    expect(s.players.map((p) => p.score)).toEqual([300, 0, 0]);
  });

  it('ending the game moves the banks too', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: WRONG[0], p3: RIGHT[0] }, 1000);
    s = toNext(stay(s, 'p1', 'p3'), 3000);
    s = playRung(s, { p1: RIGHT[1], p3: RIGHT[1] }, 4000);
    expect(s.phase).toBe('reveal');
    s = must(end(s, 6000));
    expect(s.phase).toBe('finished');
    expect(s.players.map((p) => p.score)).toEqual([300, 0, 300]);
    expect(wipeoutTable(s, 0).p3).toEqual({ status: 'survived', bank: 300, step: 1 });
  });

  it('ending the game mid-question burns those who have not answered', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p3: RIGHT[0] }, 1000);
    s = toNext(stay(s, 'p1', 'p3'), 3000);
    s = must(submitAnswer(s, 'p1', RIGHT[1], 4000));
    s = must(end(s, 5000));
    expect(s.players.map((p) => p.score)).toEqual([300, 0, 0]);
  });

  it('no streaks, no speed bonus, no time for ties', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: RIGHT[0], p3: RIGHT[0] }, 1000);
    s = toNext(stay(s, 'p1', 'p2', 'p3'), 3000);
    s = playRung(s, { p1: RIGHT[1], p2: RIGHT[1], p3: RIGHT[1] }, 4000);
    s = must(endRound(s, 6000));
    for (const play of s.plays) for (const record of Object.values(play.answers)) expect(record.streakBonus).toBe(0);
    expect(s.players.map((p) => p.totalTimeMs)).toEqual([0, 0, 0]);
    expect(s.players.map((p) => p.streak)).toEqual([0, 0, 0]);
    expect(s.players.map((p) => p.score)).toEqual([300, 300, 300]);
  });

  it('a wipeout question opens with the «Запитання N» splash', () => {
    const s = must(next(must(start(lobbyWithSplash(quiz, 'Оля', 'Петро'))), 0, rng));
    expect(s.phase).toBe('question');
    expect(s.splash?.kind).toBe('question');
  });

  it('the classic round after it plays as before', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: WRONG[0], p3: WRONG[0] }, 1000);
    s = toNext(stay(s, 'p1'), 3000);
    s = must(endRound(playRung(s, { p1: RIGHT[1] }, 4000), 6000));
    expect(score(s, 'p1')).toBe(300);
    s = must(next(s, 7000, rng));
    expect(s.phase).toBe('intro');
    expect(wipeoutIn(s)).toEqual([]);
    s = must(next(s, 8000, rng));
    expect(s.phase).toBe('question');
    expect(s.plays[s.questionIndex].wipeout).toBeUndefined();
    s = must(submitAnswer(s, 'p1', RIGHT[0], 9000));
    s = must(submitAnswer(s, 'p2', RIGHT[0], 9000));
    s = must(submitAnswer(s, 'p3', RIGHT[0], 9000));
    const classic = recordOf(s, s.questionIndex, 'p1')?.points ?? 0;
    expect(classic).toBeGreaterThan(0);
    expect(score(s, 'p1')).toBe(300 + classic);
    // перенесений банк лишається в балах
    expect(recordOf(s, 1, 'p1')?.points).toBe(300);
  });
});
