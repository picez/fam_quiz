import { DEFAULT_RULES, type Answer, type RoundRules } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { appealPoints, appealReasons } from './appeal';
import { buffBlock, takeBuff } from './buffs';
import { acceptAnswer, end, lock, next, override, recordOf, submitAnswer, type GameState } from './game';
import { undoScore } from './undo';
import { POWERS_STREAK, T0, toBuffCell, toPowersQuestion } from './testing/buffs';
import { blitzRound, bluff, chain, makeQuiz, makeRoundsQuiz, order, poll, single4 } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng0 = () => 0;
const answer = (s: GameState, id: string, a: Answer, at: number) => must(submitAnswer(s, id, a, at));
const take = (s: GameState, id: string, kind: Parameters<typeof takeBuff>[2], at: number) => must(takeBuff(s, id, kind, at, rng0));
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
const streakOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.streak;
const pick = (optionId: string): Answer => ({ type: 'single', optionId });
const RIGHT_Q2: Answer = { type: 'text', value: 'Одеса' };
const WRONG_Q2: Answer = { type: 'text', value: 'Київ' };
const rules = (changes: Partial<RoundRules>): RoundRules => ({ ...DEFAULT_RULES, streak: POWERS_STREAK, ...changes });

/** Від відкритого запитання класики: закриття, розкриття, наступне запитання о at. */
const toNext = (s: GameState, at: number) => must(next(must(next(s.phase === 'question' ? must(lock(s)) : s, at, rng0)), at, rng0));
/** Закриття й розкриття. */
const toReveal = (s: GameState, at: number) => must(next(must(lock(s)), at, rng0));

describe('risk (12h)', () => {
  it('risk triples a right answer and costs the full price for a wrong one even without a penalty', () => {
    let s = must(takeBuff(toPowersQuestion(), 'p1', 'risk', T0 + 500, rng0));
    s = must(takeBuff(s, 'p2', 'risk', T0 + 500, rng0));
    s = must(submitAnswer(s, 'p1', { type: 'single', optionId: 'b' }, T0 + 1000));
    s = must(submitAnswer(s, 'p2', { type: 'single', optionId: 'a' }, T0 + 1000));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ basePoints: 3000, points: 3000, buff: 'risk' });
    expect(recordOf(s, 0, 'p2')).toMatchObject({ basePoints: -1000, points: -1000, buff: 'risk' });
  });

  it('a partial answer keeps its usual points: no triple, no minus', () => {
    let s = toNext(toNext(toPowersQuestion(), T0 + 30_000), T0 + 60_000);
    expect(s.plays[2].question.type).toBe('slider');
    s = take(s, 'p1', 'risk', T0 + 60_500);
    s = answer(s, 'p1', { type: 'slider', value: 59 }, T0 + 61_000);
    s = answer(s, 'p2', { type: 'slider', value: 59 }, T0 + 61_000);
    const plain = recordOf(s, 2, 'p2')!;
    expect(plain.grade).toBe('partial');
    expect(plain.basePoints).toBeGreaterThan(0);
    expect(recordOf(s, 2, 'p1')).toMatchObject({ grade: 'partial', basePoints: plain.basePoints, buff: 'risk' });
  });

  it('silence with risk costs the full price only when the question closes', () => {
    let s = take(toPowersQuestion(), 'p3', 'risk', T0 + 500);
    s = answer(s, 'p1', pick('b'), T0 + 1000);
    expect(recordOf(s, 0, 'p3')).toBeUndefined();
    const locked = must(lock(s));
    expect(recordOf(locked, 0, 'p3')).toEqual({
      answer: null,
      timeMs: 20_000,
      accepted: false,
      accuracy: 0,
      grade: 'wrong',
      basePoints: -1000,
      streakBonus: 0,
      points: -1000,
      overridden: false,
      buff: 'risk',
    });
    expect(recordOf(locked, 0, 'p2')).toBeUndefined();
    expect(score(locked, 'p3')).toBe(-1000);

    // Гру завершено посеред запитання: запитання обірвано, мовчання не карається.
    const ended = must(end(s));
    expect(recordOf(ended, 0, 'p3')).toBeUndefined();
    expect(score(ended, 'p3')).toBe(0);
  });

  it('the stake carries the round multiplier and the cell mark', () => {
    let s = take(toPowersQuestion({ rules: rules({ multiplier: 2 }) }), 'p1', 'risk', T0 + 500);
    s = take(s, 'p3', 'risk', T0 + 500);
    s = must(lock(answer(s, 'p1', pick('b'), T0 + 1000)));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ basePoints: 6000, buff: 'risk' });
    expect(recordOf(s, 0, 'p3')).toMatchObject({ answer: null, points: -2000, buff: 'risk' });

    let right = take(toBuffCell({}, 'auto', ['risk']), 'p1', 'risk', T0 + 500);
    right = must(acceptAnswer(answer(right, 'p1', pick('b'), T0 + 1000), 'p1', T0 + 2000));
    expect(recordOf(right, 0, 'p1')).toMatchObject({ points: 6000, buff: 'risk' });
    expect(score(right, 'p1')).toBe(6000);

    let wrong = take(toBuffCell({}, 'auto', ['risk']), 'p1', 'risk', T0 + 500);
    wrong = must(acceptAnswer(answer(wrong, 'p1', pick('a'), T0 + 1000), 'p1', T0 + 2000));
    expect(recordOf(wrong, 0, 'p1')).toMatchObject({ grade: 'wrong', points: -2000, buff: 'risk' });
    expect(score(wrong, 'p1')).toBe(-2000);
  });

  it('host grades follow the same rule', () => {
    let s = take(toPowersQuestion(), 'p1', 'risk', T0 + 500);
    s = take(s, 'p2', 'risk', T0 + 500);
    s = answer(s, 'p1', pick('a'), T0 + 1000);
    s = answer(s, 'p2', pick('b'), T0 + 1000);
    s = toReveal(s, T0 + 2000);
    s = must(override(s, 'p1', 'correct'));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ grade: 'correct', points: 3000, buff: 'risk' });
    s = must(override(s, 'p2', 'wrong'));
    expect(recordOf(s, 0, 'p2')).toMatchObject({ grade: 'wrong', points: -1000, buff: 'risk' });
    expect([score(s, 'p1'), score(s, 'p2')]).toEqual([3000, -1000]);
  });

  it('an appeal pays the tripled grade; silence with risk has nothing to appeal', () => {
    let s = take(toPowersQuestion(), 'p1', 'risk', T0 + 500);
    s = take(s, 'p3', 'risk', T0 + 500);
    s = answer(s, 'p1', pick('a'), T0 + 1000);
    s = answer(s, 'p2', pick('a'), T0 + 1000);
    s = toReveal(s, T0 + 2000);
    expect(appealPoints(s, 'p1')).toBe(4000);
    expect(appealReasons(s, 'p1')).toContain('grade');
    expect(recordOf(s, 0, 'p3')).toMatchObject({ answer: null, buff: 'risk' });
    expect(appealReasons(s, 'p3')).not.toContain('grade');
  });

  it('undoing the question takes the silence minus back', () => {
    let s = take(toPowersQuestion(), 'p3', 'risk', T0 + 500);
    s = toNext(answer(s, 'p1', pick('b'), T0 + 1000), T0 + 2000);
    expect(score(s, 'p3')).toBe(-1000);
    s = must(undoScore(s, { question: 0, playerId: 'p3' }, T0 + 3000));
    expect(score(s, 'p3')).toBe(0);
  });

  it('the streak bonus comes from the untripled points and is not tripled', () => {
    const second = (bonus: RoundRules['streak']) => {
      let s = toPowersQuestion({ rules: rules({ streak: bonus }) });
      s = toNext(answer(s, 'p1', pick('b'), T0 + 1000), T0 + 30_000);
      s = take(s, 'p1', 'risk', T0 + 30_500);
      s = must(lock(answer(s, 'p1', RIGHT_Q2, T0 + 31_000)));
      return recordOf(s, 1, 'p1');
    };
    expect(second(POWERS_STREAK)).toMatchObject({ basePoints: 3000, streakBonus: 50, points: 3050 });
    expect(second({ length: 2, bonus: { kind: 'percent', value: 10 } })).toMatchObject({ basePoints: 3000, streakBonus: 100, points: 3100 });
  });

  it('where risk does not go', () => {
    const buffs = ['risk', 'double'] as const;
    const open = (q: Parameters<typeof makeQuiz>[0]) => startRound(lobbyWith(makeQuiz(q, { buffs: [...buffs] }), 'Оля', 'Петро'), T0, rng0);
    expect(buffBlock(open([poll]), 'p1', 'risk')).toBe('off_vote');
    expect(buffBlock(open([bluff]), 'p1', 'risk')).toBe('unfit_bluff');
    expect(buffBlock(open([chain]), 'p1', 'risk')).toBe('off_chain');
    expect(buffBlock(open([order]), 'p1', 'risk')).toBe('unfit_type');
    const blitz = startRound(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single4])], { buffs: [...buffs] }), 'Оля'), T0, rng0);
    expect(buffBlock(blitz, 'p1', 'risk')).toBe('off_blitz');
    const doubled = take(open([single4]), 'p1', 'double', T0 + 500);
    expect(buffBlock(doubled, 'p1', 'risk')).toBe('taken');
    expect(takeBuff(doubled, 'p1', 'risk', T0 + 600, rng0)).toEqual({ ok: false, error: 'buff_busy' });
    expect(buffBlock(open([single4]), 'p1', 'risk')).toBeNull();
  });
});

describe('safety catch (12h)', () => {
  it('fits only rounds with a streak', () => {
    expect(buffBlock(toPowersQuestion({ rules: rules({ streak: null }) }), 'p1', 'guard')).toBe('unfit_streak');
    expect(buffBlock(toPowersQuestion(), 'p1', 'guard')).toBeNull();
    expect(takeBuff(toPowersQuestion({ rules: rules({ streak: null }) }), 'p1', 'guard', T0 + 500, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
  });

  /** Оля: q1 правильно; q2 — miss (з «Запобіжником», якщо guard); q3 правильно (повзунок 50). */
  const run = (guard: boolean, miss: Answer | null, patch: Partial<RoundRules> = {}) => {
    let s = toPowersQuestion({ rules: rules(patch) });
    s = toNext(answer(s, 'p1', pick('b'), T0 + 1000), T0 + 30_000);
    if (guard) s = take(s, 'p1', 'guard', T0 + 30_500);
    if (miss !== null) s = answer(s, 'p1', miss, T0 + 31_000);
    const afterMiss = must(lock(s));
    s = must(next(must(next(afterMiss, T0 + 60_000, rng0)), T0 + 60_000, rng0));
    s = must(lock(answer(s, 'p1', { type: 'slider', value: 50 }, T0 + 61_000)));
    return { afterMiss, after: s };
  };

  it('a wrong answer with the safety catch keeps the streak and the next right answer goes on with the bonus', () => {
    const kept = run(true, WRONG_Q2);
    expect(recordOf(kept.afterMiss, 1, 'p1')).toMatchObject({ grade: 'wrong', streakBonus: 0, buff: 'guard' });
    expect(streakOf(kept.afterMiss, 'p1')).toBe(1);
    expect(streakOf(kept.after, 'p1')).toBe(2);
    expect(recordOf(kept.after, 2, 'p1')).toMatchObject({ streakBonus: 50, points: 1050 });

    const broken = run(false, WRONG_Q2);
    expect(streakOf(broken.after, 'p1')).toBe(1);
    expect(recordOf(broken.after, 2, 'p1')).toMatchObject({ streakBonus: 0, points: 1000 });
  });

  it('silence with the safety catch keeps the streak too', () => {
    const kept = run(true, null);
    expect(recordOf(kept.afterMiss, 1, 'p1')).toBeUndefined();
    expect(streakOf(kept.after, 'p1')).toBe(2);
    expect(recordOf(kept.after, 2, 'p1')).toMatchObject({ streakBonus: 50 });
  });

  it('a partial answer with the safety catch keeps the streak', () => {
    let s = toPowersQuestion();
    s = toNext(answer(s, 'p1', pick('b'), T0 + 1000), T0 + 30_000);
    s = toNext(answer(s, 'p1', RIGHT_Q2, T0 + 31_000), T0 + 60_000);
    expect(streakOf(s, 'p1')).toBe(2);
    s = take(s, 'p1', 'guard', T0 + 60_500);
    s = must(lock(answer(s, 'p1', { type: 'slider', value: 59 }, T0 + 61_000)));
    expect(recordOf(s, 2, 'p1')).toMatchObject({ grade: 'partial', streakBonus: 0, buff: 'guard' });
    expect(streakOf(s, 'p1')).toBe(2);
    s = toNext(s, T0 + 90_000);
    s = must(lock(answer(s, 'p1', { type: 'numeric', value: 2061 }, T0 + 91_000)));
    expect(streakOf(s, 'p1')).toBe(3);
    expect(recordOf(s, 3, 'p1')).toMatchObject({ streakBonus: 50, points: 1050 });
  });

  it('a miss with the safety catch earns no bonus itself, even on a long streak', () => {
    let s = toPowersQuestion();
    s = toNext(answer(s, 'p1', pick('b'), T0 + 1000), T0 + 30_000);
    s = toNext(answer(s, 'p1', RIGHT_Q2, T0 + 31_000), T0 + 60_000);
    s = take(s, 'p1', 'guard', T0 + 60_500);
    s = must(lock(answer(s, 'p1', { type: 'slider', value: 0 }, T0 + 61_000)));
    expect(recordOf(s, 2, 'p1')).toMatchObject({ grade: 'wrong', streakBonus: 0, points: 0 });
    expect(score(s, 'p1')).toBe(1000 + 1050);
  });
});
