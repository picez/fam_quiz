import type { Answer, BuffKind } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { takeBuff } from './buffs';
import { pause, submitAnswer, type GameState } from './game';
import { T0, toBuffQuestion, toOthersCell } from './testing/buffs';
import { must } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const rng0 = () => 0;
const take = (s: GameState, id: string, kind: BuffKind, at: number) => must(takeBuff(s, id, kind, at, rng0));
const answer = (s: GameState, id: string, a: Answer, at: number) => must(submitAnswer(s, id, a, at));
const pick = (optionId: string): Answer => ({ type: 'single', optionId });

describe('closing clock: when the question really closes', () => {
  it('swap on a board cell: the stage, host and watchers see the swapper’s end, the swapper keeps their own', () => {
    // Спільний кінець T0 + 20 000; заміна о T0 + 15 000 дає щонайменше 20 с — до T0 + 35 000.
    const s = take(toOthersCell(), 'p1', 'swap', T0 + 15_000);
    const closing = { endsAt: T0 + 35_000, remainingMs: null };
    expect(stageView(s).closing).toEqual(closing);
    expect(hostView(s).closing).toEqual(closing);
    expect(playerView(s, 'p1')?.me.overtime).toEqual({ deadline: T0 + 35_000, remainingMs: null });
    expect(playerView(s, 'p1')?.me.closing).toBeUndefined();
    // Хто не вибирав клітинку, не відповідає: табло — до справжнього кінця, а не до T0 + 20 000.
    expect(playerView(s, 'p2')?.me.closing).toEqual(closing);
    expect(playerView(s, 'p3')?.me.closing).toEqual(closing);
    // Пауза: годинник стоїть, залишок до кінця заміни.
    const paused = must(pause(s, T0 + 16_000));
    expect(stageView(paused).closing).toEqual({ endsAt: null, remainingMs: 19_000 });
    expect(playerView(paused, 'p2')?.me.closing).toEqual({ endsAt: null, remainingMs: 19_000 });
  });

  it('no overtime: no closing key anywhere', () => {
    const s = toOthersCell();
    expect('closing' in stageView(s)).toBe(false);
    expect('closing' in hostView(s)).toBe(false);
    expect('closing' in (playerView(s, 'p2')?.me ?? {})).toBe(false);
  });

  it('time buff in classic: those still answering keep the shared end, those who answered see the real close', () => {
    let s = take(toBuffQuestion(), 'p1', 'time', T0);
    const closing = { endsAt: T0 + 50_000, remainingMs: null };
    expect(stageView(s).closing).toEqual(closing);
    // p2 ще відповідає: його кінець — спільний.
    expect(playerView(s, 'p2')?.me.closing).toBeUndefined();
    s = answer(s, 'p2', pick('b'), T0 + 1000);
    expect(playerView(s, 'p2')?.me.closing).toEqual(closing);
    expect(playerView(s, 'p3')?.me.closing).toBeUndefined();
    // Власник часу відповів — запитання вже ніхто не тримає.
    s = answer(s, 'p1', pick('b'), T0 + 2000);
    expect(stageView(s).closing).toBeUndefined();
    expect(playerView(s, 'p2')?.me.closing).toBeUndefined();
  });
});
