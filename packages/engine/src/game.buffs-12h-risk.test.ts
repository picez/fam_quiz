import { DEFAULT_RULES, defaultTeams, type Answer, type RoundRules } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { appealPoints, appealReasons } from './appeal';
import { pickCell } from './board';
import { buffBlock, takeBuff } from './buffs';
import { factInput } from './facts';
import { acceptAnswer, end, lock, next, override, recordOf, start, submitAnswer, type GameState } from './game';
import { undoScore } from './undo';
import { POWERS_STREAK, T0, toBuffCell, toPowersQuestion } from './testing/buffs';
import { blitzRound, bluff, boardRound, chain, classicRound, makeQuiz, makeRoundsQuiz, order, poll, single4, withId } from './testing/fixtures';
import { teamGame } from './testing/teams';
import { actAnswer } from './team-act';
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

describe('risk (12h): silence, boards, teams and grades', () => {
  /** Іра з «Ризиком» мовчить, Оля відповідає правильно; запитання закрите й розкрите. */
  const silent = () => toReveal(answer(take(toPowersQuestion(), 'p3', 'risk', T0 + 500), 'p1', pick('b'), T0 + 1000), T0 + 2000);

  it('silence with risk is a penalty, not an answer: no fact row, no buff used', () => {
    const rows = factInput(silent()).rows;
    expect(rows.filter((r) => r.playerId === 'p3')).toEqual([]);
    expect(rows.some((r) => r.buff === 'risk')).toBe(false);
    expect(rows.filter((r) => r.playerId === 'p1')).toHaveLength(1);
  });

  it('the host cannot grade silence with risk; nothing to appeal', () => {
    const s = silent();
    expect(override(s, 'p3', 'correct')).toEqual({ ok: false, error: 'not_found' });
    expect(appealPoints(s, 'p3')).toBe(0);
    expect(score(s, 'p3')).toBe(-1000);
  });

  it('the host can give a partial grade to a risk answer: usual points, no minus', () => {
    let s = take(toPowersQuestion({ rules: rules({ partial: 50 }) }), 'p1', 'risk', T0 + 500);
    s = toReveal(answer(s, 'p1', pick('a'), T0 + 1000), T0 + 2000);
    s = must(override(s, 'p1', 'partial'));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ grade: 'partial', basePoints: 500, buff: 'risk' });
  });

  it('a wrong risk answer with a minus round costs the stake once, not stake plus penalty', () => {
    let s = take(toPowersQuestion({ rules: rules({ penalty: 'minus' }) }), 'p1', 'risk', T0 + 500);
    s = must(lock(answer(s, 'p1', pick('a'), T0 + 1000)));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ basePoints: -1000, points: -1000 });
    expect(score(s, 'p1')).toBe(-1000);
  });

  it('who am I: the triple is of the clue-reduced points, the stake is the full price', () => {
    let s = toPowersQuestion();
    for (let i = 0; i < 5; i++) s = toNext(s, T0 + 30_000 * (i + 1));
    expect(s.plays[5].question.type).toBe('clues');
    const at = T0 + 150_000;
    s = take(s, 'p1', 'risk', at + 100);
    s = take(s, 'p3', 'risk', at + 100);
    s = answer(s, 'p1', { type: 'clues', value: 'Шевченко' }, at + 11_000);
    s = answer(s, 'p2', { type: 'clues', value: 'Шевченко' }, at + 11_000);
    s = answer(s, 'p3', { type: 'clues', value: 'Франко' }, at + 11_000);
    const plain = recordOf(s, 5, 'p2')!.basePoints;
    expect(plain).toBeGreaterThan(0);
    expect(plain).toBeLessThan(1000);
    expect(recordOf(s, 5, 'p1')?.basePoints).toBe(plain * 3);
    expect(recordOf(s, 5, 'p3')?.basePoints).toBe(-1000);
  });

  it('teams: the answering team takes risk; a silent team pays the stake', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single4, withId(single4, 'q2')], { speedBonus: false })], {
      teams: defaultTeams(2),
      buffs: ['risk'],
    });
    let s = must(next(teamGame(quiz, [['Оля', 'Петро'], ['Іра', 'Денис']]), T0, rng0));
    expect(s.phase).toBe('question');
    s = take(s, 't1', 'risk', T0 + 500);
    s = take(s, 't2', 'risk', T0 + 500);
    s = must(actAnswer(s, 'm1', pick('b'), T0 + 1000));
    expect(recordOf(s, 0, 't1')).toMatchObject({ basePoints: 3000, buff: 'risk' });
    s = must(lock(s));
    expect(recordOf(s, 0, 't2')).toMatchObject({ answer: null, points: -1000, buff: 'risk' });
    expect([score(s, 't1'), score(s, 't2')]).toEqual([3000, -1000]);
  });

  it('a phone board cell: silence pays once; an answer waiting for the host is not silence', () => {
    let quiet = must(lock(take(toBuffCell({}, 'auto', ['risk']), 'p1', 'risk', T0 + 500)));
    expect(recordOf(quiet, 0, 'p1')).toMatchObject({ answer: null, points: -2000, buff: 'risk' });
    quiet = must(next(quiet, T0 + 30_000, rng0));
    expect(quiet.phase).toBe('reveal');
    expect(score(quiet, 'p1')).toBe(-2000);

    let pending = answer(take(toBuffCell({}, 'auto', ['risk']), 'p1', 'risk', T0 + 500), 'p1', pick('b'), T0 + 1000);
    expect(recordOf(pending, 0, 'p1')).toBeUndefined();
    pending = must(lock(pending));
    expect(recordOf(pending, 0, 'p1')).toBeUndefined();
    pending = must(next(pending, T0 + 30_000, rng0));
    expect(recordOf(pending, 0, 'p1')).toMatchObject({ answer: pick('b'), grade: 'wrong', points: -2000, buff: 'risk' });
    expect(score(pending, 'p1')).toBe(-2000);
  });

  it('a voice board cell: the host grades it after the close and risk pays the triple', () => {
    const round = boardRound('g1', [{ title: 'Міста', cells: [{ question: withId(single4, 'c11'), answerMode: 'voice' }, withId(single4, 'c12')] }]);
    const board = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { buffs: ['risk'] }), 'Оля', 'Петро'))), T0, rng0));
    let s = take(must(pickCell(board, 'p1', 'c11', T0, rng0)), 'p1', 'risk', T0 + 500);
    s = must(lock(s));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ answer: null, points: -1000, buff: 'risk' });
    s = must(override(s, 'p1', 'correct'));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ grade: 'correct', points: 3000, buff: 'risk' });
    expect(score(s, 'p1')).toBe(3000);
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
