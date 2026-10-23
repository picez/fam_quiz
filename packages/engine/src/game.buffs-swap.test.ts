import type { Answer, BuffKind } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { buffBlock, takeBuff } from './buffs';
import { acceptAnswer, lock, next, override, pause, recordOf, removePlayer, resume, submitAnswer, tick, type GameState } from './game';
import { answerPoints, speedFactor } from './score';
import { othersQuiz, T0, toOthersCell, toOthersQuestion } from './testing/buffs';
import { bool, makeQuiz, single4, withId, withVideo } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { closesAt, deadlineOf, overtimeOf } from './timing';

const rng0 = () => 0;
const answer = (s: GameState, id: string, a: Answer, at: number) => must(submitAnswer(s, id, a, at));
const single = (optionId: string): Answer => ({ type: 'single', optionId });
const yes: Answer = { type: 'boolean', value: true };
const take = (s: GameState, id: string, kind: BuffKind, at: number) => must(takeBuff(s, id, kind, at, rng0));
const toNext = (s: GameState, at: number) => must(next(must(next(s, at, rng0)), at, rng0));

describe('swap', () => {
  it('swap gives the next unused spare at least 20 s, the reveal waits for it', () => {
    const s = take(toOthersQuestion(), 'p1', 'swap', T0 + 15_000);
    expect(s.plays[0].buffs?.p1.spare).toEqual({ id: 's1', presented: [], startedAt: T0 + 15_000, limitMs: 20_000 });
    expect(s.sparesUsed).toEqual(['s1']);
    expect(deadlineOf(s, s.plays[0], 'p1')).toBe(T0 + 35_000);
    expect(closesAt(s)).toBe(T0 + 35_000);
    // Лишилося 15 с — до 20 с бракує 5 с; лишилося 19 с — 1 с.
    expect(overtimeOf(take(toOthersQuestion(), 'p1', 'swap', T0 + 5000).plays[0], 'p1')).toBe(5000);
    expect(overtimeOf(take(toOthersQuestion(), 'p1', 'swap', T0 + 1000).plays[0], 'p1')).toBe(1000);
    // Лишилося не менше 20 с: особистого часу немає, межа — решта.
    const long = take(toOthersQuestion({ spares: [withId(bool, 's1')] }), 'p1', 'swap', T0);
    expect(overtimeOf(long.plays[0], 'p1')).toBe(0);
    const roomy = take(
      startRound(lobbyWith({ ...makeQuiz([{ ...single4, timeLimit: 30 }], { buffs: ['swap'] }), spares: [withId(bool, 's1')] }, 'Оля'), T0, rng0),
      'p1',
      'swap',
      T0 + 5000,
    );
    expect(overtimeOf(roomy.plays[0], 'p1')).toBe(0);
    expect(roomy.plays[0].buffs?.p1.spare?.limitMs).toBe(25_000);
  });

  it('the spare is checked instead of the main question and worth the main points', () => {
    let s = take(toOthersQuestion(), 'p1', 'swap', T0 + 15_000);
    expect(submitAnswer(s, 'p1', single('b'), T0 + 19_000)).toEqual({ ok: false, error: 'type_mismatch' });
    s = answer(s, 'p1', yes, T0 + 19_000);
    expect(recordOf(s, 0, 'p1')).toMatchObject({ accepted: true, points: 1000, spare: 's1', buff: 'swap', timeMs: 4000 });
    // Решта відповідає на основне.
    s = answer(s, 'p2', single('b'), T0 + 19_500);
    expect(recordOf(s, 0, 'p2')).toMatchObject({ accepted: true, points: 1000 });
    expect(recordOf(s, 0, 'p2')?.spare).toBeUndefined();
  });

  it('the speed bonus counts from the moment the spare arrived, without the pause', () => {
    let s = take(toOthersQuestion({ speedBonus: true }), 'p1', 'swap', T0 + 10_000);
    expect(s.plays[0].buffs?.p1.spare?.limitMs).toBe(20_000);
    s = must(pause(s, T0 + 12_000));
    s = must(resume(s, T0 + 72_000));
    expect(s.plays[0].buffs?.p1.spare?.startedAt).toBe(T0 + 70_000);
    s = answer(s, 'p1', yes, T0 + 75_000);
    const points = answerPoints({ points: 1000, accuracy: 1, speed: speedFactor(5000, 20_000, true), multiplier: 1, penalty: 'none' });
    expect(recordOf(s, 0, 'p1')).toMatchObject({ timeMs: 5000, points, spare: 's1' });
    s = must(lock(s));
    s = must(next(s, T0 + 76_000, rng0));
    expect(s.phase).toBe('reveal');
    s = must(override(s, 'p1', 'wrong'));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 0, spare: 's1' });
    s = must(override(s, 'p1', 'correct'));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points, spare: 's1', buff: 'swap' });
  });

  it('swap waits at least 20 s; the host may not wait; a missing spare answer is absent', () => {
    let s = answer(answer(toOthersQuestion(), 'p2', single('b'), T0 + 1000), 'p3', single('a'), T0 + 2000);
    s = take(s, 'p1', 'swap', T0 + 18_000);
    expect(tick(s, T0 + 20_001).phase).toBe('question');
    const closed = tick(s, T0 + 38_001);
    expect(closed.phase).toBe('locked');
    expect(recordOf(closed, 0, 'p1')).toBeUndefined();
    // «Не чекати»: ведучий закриває запитання раніше.
    const locked = must(lock(s));
    expect(locked.phase).toBe('locked');
    expect(recordOf(locked, 0, 'p1')).toBeUndefined();
    // Відповідь на запасне від останнього, хто не відповів, закриває запитання одразу.
    const done = answer(s, 'p1', yes, T0 + 30_000);
    expect(done.phase).toBe('locked');
    expect(recordOf(done, 0, 'p1')).toMatchObject({ spare: 's1', accepted: true });
  });

  it('each spare is used once per game; when the pool runs out the button explains', () => {
    let s = startRound(lobbyWith(othersQuiz(), 'Оля', 'Петро', 'Іра', 'Марко'), T0, rng0);
    s = take(take(take(s, 'p1', 'swap', T0 + 1000), 'p2', 'swap', T0 + 1000), 'p3', 'swap', T0 + 1000);
    expect(s.plays[0].buffs?.p3.spare?.id).toBe('s3');
    expect(s.sparesUsed).toEqual(['s1', 's2', 's3']);
    s = toNext(must(lock(s)), T0 + 30_000);
    for (const id of ['p1', 'p2', 'p3']) expect(buffBlock(s, id, 'swap')).toBe('used');
    expect(buffBlock(s, 'p4', 'swap')).toBe('spares_out');
    expect(takeBuff(s, 'p4', 'swap', T0 + 31_000, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
    expect(must(removePlayer(s, 'p1')).sparesUsed).toEqual(['s1', 's2', 's3']);
  });

  it('swap on a board cell: the spare for the chooser, the cell multiplier applies', () => {
    let s = take(toOthersCell(), 'p1', 'swap', T0 + 1000);
    expect(s.plays[0].buffs?.p1.spare?.id).toBe('s1');
    expect(submitAnswer(s, 'p1', single('b'), T0 + 2000)).toEqual({ ok: false, error: 'type_mismatch' });
    s = answer(s, 'p1', yes, T0 + 2000);
    s = must(acceptAnswer(s, 'p1', T0 + 3000));
    expect(s.phase).toBe('reveal');
    expect(recordOf(s, 0, 'p1')).toMatchObject({ accepted: true, points: 2000, spare: 's1', buff: 'swap' });
  });

  it('swap shuffles spare options when the round shuffles', () => {
    const spares = [withId(single4, 's3')];
    const shuffled = take(toOthersQuestion({ shuffleOptions: true, spares }), 'p1', 'swap', T0 + 1000);
    const presented = shuffled.plays[0].buffs?.p1.spare?.presented ?? [];
    expect([...presented].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(presented).not.toEqual(['a', 'b', 'c', 'd']);
    const plain = take(toOthersQuestion({ spares }), 'p1', 'swap', T0 + 1000);
    expect(plain.plays[0].buffs?.p1.spare?.presented).toEqual(['a', 'b', 'c', 'd']);
  });

  it('swap without a timer gives no personal time', () => {
    const quiz = { ...makeQuiz([withVideo(single4)], { buffs: ['swap'], speedBonus: true }), spares: [withId(bool, 's1')] };
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро'), T0, rng0);
    s = take(s, 'p1', 'swap', T0 + 1000);
    expect(s.plays[0].buffs?.p1.spare).toMatchObject({ id: 's1', limitMs: null });
    expect(overtimeOf(s.plays[0], 'p1')).toBe(0);
    s = answer(s, 'p1', yes, T0 + 90_000);
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 1000, timeMs: 89_000, spare: 's1' });
  });
});
