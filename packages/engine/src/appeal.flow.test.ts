import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer, type RoundRules } from '@quiz/shared';
import { appealOpen, appealsLeft, appealTally, castAppealVote, openAppeal } from './appeal';
import { nextDeadline } from './blitz';
import { declareDuel } from './duel';
import { end, endRound, lock, next, override, pause, removePlayer, resume, setConnected, submitAnswer, tick, type GameState } from './game';
import { classicRound, makeRoundsQuiz, text, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { toDeclarable } from './testing/duel';

const T0 = 1_000_000;
const T1 = T0 + 10_000;
const rng = () => 0;
const t100 = withPoints(text, 100);
const RIGHT: Answer = { type: 'text', value: 'Одеса' };
const WRONG: Answer = { type: 'text', value: 'Одеська' };
const HALF: RoundRules = { ...DEFAULT_RULES, partial: 50 };

/** Класика t1…t3 по 100: Оля «Одеська» (неправильно), Петро й Іра «Одеса»; розкриття t1. */
function toReveal(rules: RoundRules = DEFAULT_RULES): GameState {
  const quiz = makeRoundsQuiz([classicRound('r1', [t100, withId(t100, 't2'), withId(t100, 't3')], { speedBonus: false, rules })], { leaderboard: 'each' });
  let s = startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Іра'), T0, rng);
  for (const [id, answer] of [['p1', WRONG], ['p2', RIGHT], ['p3', RIGHT]] as const) s = must(submitAnswer(s, id, answer, T0 + 1000));
  if (s.phase === 'question') s = must(lock(s));
  return must(next(s, T0 + 1500, rng));
}

const reveal = toReveal();
const open = must(openAppeal(reveal, 'p1', 'grade', T1));

describe('the appeal in the game flow', () => {
  it('«Далі» waits for the hall: appeal_open while the vote is open, then the reveal moves on', () => {
    expect(next(open, T1 + 1000, rng)).toEqual({ ok: false, error: 'appeal_open' });
    expect(tick(open, T1 + 29_999)).toBe(open);
    const closed = tick(open, T1 + 30_000);
    expect(closed.appeals?.[0].outcome).toBe('tie');
    expect(must(next(closed, T1 + 30_001, rng)).phase).toBe('leaderboard');
  });

  it('the clock: the end of the vote is the next deadline; none without an appeal or on a pause', () => {
    expect(nextDeadline(open, T1)).toBe(T1 + 30_000);
    expect(nextDeadline(reveal, T1)).toBeNull();
    expect(nextDeadline(must(pause(open, T1 + 1000)), T1 + 2000)).toBeNull();
    expect(nextDeadline(tick(open, T1 + 30_000), T1 + 30_000)).toBeNull();
  });

  it('a pause stops the clock; resume shifts the end by the pause', () => {
    const paused = must(pause(open, T1 + 5000));
    expect(tick(paused, T1 + 60_000)).toBe(paused);
    const resumed = must(resume(paused, T1 + 65_000));
    expect(appealOpen(resumed)?.endsAt).toBe(T1 + 90_000);
    expect(nextDeadline(resumed, T1 + 65_000)).toBe(T1 + 90_000);
    expect(appealOpen(tick(resumed, T1 + 89_999))).not.toBeNull();
    expect(tick(resumed, T1 + 90_000).appeals?.[0].outcome).toBe('tie');
    // без апеляції resume нічого нового не робить
    expect(must(resume(must(pause(reveal, T1)), T1 + 1000)).appeals).toBeUndefined();
  });

  it('the host grade «correct» closes the appeal as host: the limit is back, the points come with the record', () => {
    const s = must(override(open, 'p1', 'correct'));
    expect(s.appeals?.[0].outcome).toBe('host');
    expect(appealOpen(s)).toBeNull();
    expect(appealsLeft(s, 'p1')).toBe(2);
    expect(s.adjustments).toEqual([]);
    expect(s.players.find((p) => p.id === 'p1')?.score).toBe(100);
    // оцінка іншого гравця апеляцію не чіпає
    expect(appealOpen(must(override(open, 'p2', 'correct')))).not.toBeNull();
  });

  it('a partial grade does not stop the vote', () => {
    const half = must(openAppeal(toReveal(HALF), 'p1', 'grade', T1));
    const s = must(override(half, 'p1', 'partial'));
    expect(appealOpen(s)).toMatchObject({ id: 1, outcome: null });
    expect(appealOpen(must(override(half, 'p1', 'wrong')))).not.toBeNull();
  });

  it('ending the round or the game cancels the appeal without using the limit', () => {
    const ended = must(endRound(open, T1 + 1000));
    expect(ended.appeals?.[0].outcome).toBe('cancelled');
    expect(appealsLeft(ended, 'p1')).toBe(2);
    const finished = must(end(open, T1 + 1000));
    expect(finished.appeals?.[0].outcome).toBe('cancelled');
    expect(appealsLeft(finished, 'p1')).toBe(2);
    expect(must(end(reveal, T1 + 1000)).appeals).toBeUndefined();
  });

  it('kicking the appellant cancels the appeal; a kicked voter just leaves the votes', () => {
    const kicked = must(removePlayer(open, 'p1'));
    expect(kicked.appeals?.[0].outcome).toBe('cancelled');
    const voted = must(castAppealVote(must(castAppealVote(open, 'p2', 1, true, T1 + 1000)), 'p3', 1, false, T1 + 1000));
    expect(voted.appeals?.[0].outcome).toBe('tie');
    const s = must(castAppealVote(open, 'p3', 1, false, T1 + 1000));
    const without = must(removePlayer(s, 'p3'));
    const appeal = appealOpen(without)!;
    expect(appeal.votes).toEqual({});
    expect(appealTally(without, appeal)).toEqual({ yes: 0, no: 0 });
    // Петро лишився єдиним виборцем; його голос закриває апеляцію
    expect(must(castAppealVote(without, 'p2', 1, true, T1 + 2000)).appeals?.[0].outcome).toBe('yes');
  });

  it('when the last voter without a vote leaves or drops out and the rest have voted, the hall decides at once', () => {
    const voted = must(castAppealVote(open, 'p2', 1, true, T1 + 1000));
    const kicked = must(removePlayer(voted, 'p3', T1 + 2000));
    expect(kicked.appeals?.[0].outcome).toBe('yes');
    expect(kicked.adjustments).toEqual([expect.objectContaining({ playerId: 'p1', points: 100, source: 'appeal', at: T1 + 2000 })]);
    const dropped = must(setConnected(voted, 'p3', false, T1 + 2000));
    expect(dropped.appeals?.[0].outcome).toBe('yes');
    // голос того, хто відключився, лишається; без голосів решти — чекаємо
    expect(appealOpen(must(setConnected(open, 'p3', false, T1 + 2000)))).not.toBeNull();
    // на паузі рішення не ухвалюється
    expect(appealOpen(must(setConnected(must(pause(voted, T1 + 1500)), 'p3', false, T1 + 2000)))).not.toBeNull();
  });

  it('a duel declared on the reveal waits for the hall too', () => {
    let s = must(declareDuel(toDeclarable(), 'p1', 'p2'));
    s = { ...s, appeals: [{ id: 1, by: 'p3', questionIndex: s.questionIndex, reason: 'grade', openedAt: T0, endsAt: T0 + 30_000_000, votes: {}, outcome: null }] };
    expect(next(s, T0 + 4000, rng)).toEqual({ ok: false, error: 'appeal_open' });
  });
});
