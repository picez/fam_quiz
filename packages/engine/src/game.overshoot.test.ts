import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Question } from '@quiz/shared';
import { buffBlock, takeBuff } from './buffs';
import { setDebuff } from './debuffs';
import { end, lock, next, override, recordOf, submitAnswer, type GameState } from './game';
import { overshootRows, overshootWinners } from './overshoot';
import { FIRST_BUFFS } from './testing/buffs';
import { classicRound, makeRoundsQuiz, overshoot, overshootQuiz } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

/** p1 Оля, p2 Тарас, p3 Петро. */
const PLAYERS = ['Оля', 'Тарас', 'Петро'];
const rng0 = () => 0;

const quizOf = (question: Question, rules: Partial<typeof DEFAULT_RULES> = {}, buffs = false) =>
  makeRoundsQuiz([classicRound('c1', [question], { rules: { ...DEFAULT_RULES, ...rules } })], buffs ? { buffs: [...FIRST_BUFFS], debuffs: ['fog'] } : {});
const fresh = (question: Question = overshoot, rules: Partial<typeof DEFAULT_RULES> = {}, buffs = false) => startRound(lobbyWith(quizOf(question, rules, buffs), ...PLAYERS), 0);
const say = (s: GameState, id: string, value: number, t: number) => must(submitAnswer(s, id, { type: 'numeric', value }, t));
const rec = (s: GameState, id: string) => recordOf(s, s.questionIndex, id);
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
/** Закрити, якщо ще відкрите (коли відповіли всі, гра закривається сама). */
const close = (s: GameState) => (s.phase === 'question' ? must(lock(s, 25_000)) : s);
const toReveal = (s: GameState) => must(next(close(s), 25_000, rng0));

describe('numeric: no overshoot (37d)', () => {
  it('the closest from below takes the full price', () => {
    let s = fresh();
    s = say(s, 'p1', 85, 1000);
    s = say(s, 'p2', 90, 5000);
    s = say(s, 'p3', 80, 20_000);
    s = close(s);
    expect(rec(s, 'p1')).toMatchObject({ points: 1000, grade: 'correct', accepted: true });
    expect(rec(s, 'p2')).toMatchObject({ points: 0, grade: 'wrong' });
    expect(rec(s, 'p3')).toMatchObject({ points: 0, grade: 'wrong' });
    expect(score(s, 'p1')).toBe(1000);
  });

  it('an exact answer is the closest', () => {
    let s = fresh();
    s = say(s, 'p1', 88, 1000);
    s = say(s, 'p2', 87, 1000);
    s = close(s);
    expect(rec(s, 'p1')?.points).toBe(1000);
    expect(rec(s, 'p2')?.points).toBe(0);
  });

  it('ties share the full price', () => {
    let s = fresh();
    s = say(s, 'p1', 85, 1000);
    s = say(s, 'p3', 85.0, 2000);
    s = say(s, 'p2', 90, 2000);
    s = close(s);
    expect([rec(s, 'p1')?.points, rec(s, 'p3')?.points, rec(s, 'p2')?.points]).toEqual([1000, 1000, 0]);
    const decimals = fresh({ ...overshoot, correct: 10 });
    const closed = close(say(say(decimals, 'p1', 8.5, 1000), 'p2', 8.5 + 1e-12, 1000));
    expect([rec(closed, 'p1')?.points, rec(closed, 'p2')?.points]).toEqual([1000, 1000]);
  });

  it('tolerance does not apply', () => {
    const s = close(say(fresh(), 'p2', 90, 1000));
    expect(rec(s, 'p2')).toMatchObject({ points: 0, grade: 'wrong' });
  });

  it('everybody overshot, or nobody answered', () => {
    let s = fresh();
    s = say(say(say(s, 'p1', 89, 1000), 'p2', 90, 1000), 'p3', 100, 1000);
    s = close(s);
    expect(s.players.map((p) => p.score)).toEqual([0, 0, 0]);
    expect(overshootWinners(s, s.questionIndex)).toEqual([]);
    const silent = close(fresh());
    expect(silent.phase).toBe('locked');
    expect(overshootWinners(silent, silent.questionIndex)).toEqual([]);
  });

  it('negative numbers', () => {
    let s = fresh({ ...overshoot, correct: -40 });
    s = say(say(say(s, 'p1', -41, 1000), 'p2', -45, 1000), 'p3', -39, 1000);
    s = close(s);
    expect([rec(s, 'p1')?.points, rec(s, 'p2')?.points, rec(s, 'p3')?.points]).toEqual([1000, 0, 0]);
  });

  it('answers stay at zero until the lock', () => {
    const s = say(fresh(), 'p1', 85, 1000);
    expect(rec(s, 'p1')).toMatchObject({ points: 0, grade: 'wrong', accepted: false });
    expect(score(s, 'p1')).toBe(0);
  });

  it('no minus and the round multiplier counts', () => {
    let s = fresh(overshoot, { penalty: 'minus', multiplier: 2 });
    s = say(say(s, 'p1', 85, 1000), 'p2', 90, 1000);
    s = close(s);
    expect(rec(s, 'p1')?.points).toBe(2000);
    expect(rec(s, 'p2')?.points).toBe(0);
    expect(score(s, 'p2')).toBe(0);
  });

  it('ending the game scores the open question', () => {
    let s = fresh();
    s = say(say(s, 'p1', 85, 1000), 'p2', 90, 1000);
    s = must(end(s, 5000));
    expect(s.phase).toBe('finished');
    expect(score(s, 'p1')).toBe(1000);
    expect(score(s, 'p2')).toBe(0);
  });

  it('the host override pays without speed', () => {
    let s = fresh(overshoot, { partial: 50 });
    s = toReveal(say(say(s, 'p1', 85, 1000), 'p2', 90, 1000));
    const right = must(override(s, 'p2', 'correct'));
    expect(rec(right, 'p2')?.points).toBe(1000);
    const half = must(override(s, 'p2', 'partial'));
    expect(rec(half, 'p2')?.points).toBe(500);
  });

  it('buffs and debuffs are off', () => {
    const s = fresh(overshoot, {}, true);
    for (const kind of FIRST_BUFFS) expect([kind, buffBlock(s, 'p1', kind)]).toEqual([kind, 'off_overshoot']);
    expect(takeBuff(s, 'p1', 'double', 1000, rng0).ok).toBe(false);
    expect(setDebuff(s, 'p1', 'fog')).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('the same numeric without the switch keeps tolerance', () => {
    const { noOvershoot: _off, ...plain } = overshoot;
    const s = close(say(fresh(plain as Question, { partial: 50 }), 'p2', 90, 1000));
    expect(rec(s, 'p2')).toMatchObject({ grade: 'partial' });
    expect(rec(s, 'p2')?.points).toBeGreaterThan(0);
    expect(overshootRows(s)).toBeUndefined();
  });

  it('reveal rows mark who overshot, and nothing shows before the reveal', () => {
    let s = fresh();
    s = say(say(say(s, 'p1', 85, 1000), 'p2', 90, 1000), 'p3', 80, 20_000);
    for (const phase of [s, close(s)]) {
      expect(overshootRows(phase)).toBeUndefined();
      expect(JSON.stringify(stageView(phase))).not.toContain('"overshoot"');
      expect(JSON.stringify(playerView(phase, 'p1'))).not.toContain('"overshoot"');
      expect(JSON.stringify(hostView(phase))).not.toContain('"overshoot"');
    }
    const revealed = toReveal(s);
    const rows = [
      { playerId: 'p1', nickname: 'Оля', value: 85, over: false, points: 1000 },
      { playerId: 'p3', nickname: 'Петро', value: 80, over: false, points: 0 },
      { playerId: 'p2', nickname: 'Тарас', value: 90, over: true, points: 0 },
    ];
    expect(overshootRows(revealed)).toEqual(rows);
    expect(stageView(revealed).overshoot).toEqual(rows);
    expect(playerView(revealed, 'p1')?.overshoot).toEqual(rows);
    expect(hostView(revealed).overshoot).toEqual(rows);
  });
});
