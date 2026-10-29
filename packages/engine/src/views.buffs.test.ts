import { LEGACY_DEBUFFS, type Answer } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { takeBuff } from './buffs';
import { lock, next, pause, removePlayer, start, submitAnswer, type GameState } from './game';
import { FIRST_BUFFS, T0, toBuffCell, toBuffQuestion } from './testing/buffs';
import { blitzRound, finalRound, makeQuiz, makeRoundsQuiz, single, single4, text } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const rng0 = () => 0;
const buffs = [...FIRST_BUFFS];
const answer = (s: GameState, id: string, a: Answer, at: number) => must(submitAnswer(s, id, a, at));
const pick = (optionId: string): Answer => ({ type: 'single', optionId });
const num = (value: number): Answer => ({ type: 'numeric', value });
const take = (s: GameState, id: string, kind: (typeof FIRST_BUFFS)[number], at = T0) => must(takeBuff(s, id, kind, at, rng0));
/** Від закритого запитання класики до наступного відкритого. */
const toNext = (s: GameState, at: number) => must(next(must(next(s, at, rng0)), at, rng0));
const slotsOf = (s: GameState, id: string) => playerView(s, id)?.me.buffs?.slots.map((slot) => [slot.kind, slot.state, slot.block]);

describe('buff views', () => {
  it('phones get their own buff row with reasons; the same slots in every state', () => {
    let s = toBuffQuestion();
    const kinds = (id: string) => playerView(s, id)?.me.buffs?.slots.map((slot) => slot.kind);
    expect(kinds('p1')).toEqual(['fifty', 'double', 'retry', 'time', 'shield']);
    expect(playerView(s, 'p1')?.me.buffs?.slots.every((slot) => slot.state === 'ready' && slot.block === null)).toBe(true);
    s = take(s, 'p1', 'double');
    expect(slotsOf(s, 'p1')).toEqual([
      ['fifty', 'blocked', 'taken'],
      ['double', 'active', null],
      ['retry', 'blocked', 'taken'],
      ['time', 'blocked', 'taken'],
      ['shield', 'blocked', 'taken'],
    ]);
    expect(playerView(s, 'p1')?.me.buffs?.active).toEqual({ kind: 'double', removed: [], retry: null, first: null, hint: null, votes: null, spare: false, letter: null, scope: null, peek: null });
    expect(playerView(s, 'p2')?.me.buffs?.active).toBeNull();

    s = must(lock(s));
    expect(playerView(s, 'p1')?.me.buffs).toBeNull();
    s = must(next(s, T0, rng0));
    expect(s.phase).toBe('reveal');
    expect(playerView(s, 'p1')?.me.buffs).toBeNull();
    s = must(next(s, T0, rng0)); // q2
    s = toNext(must(lock(s)), T0); // q3 bool
    expect(slotsOf(s, 'p1')).toEqual([
      ['fifty', 'blocked', 'unfit_type'],
      ['double', 'used', 'used'],
      ['retry', 'ready', null],
      ['time', 'ready', null],
      ['shield', 'ready', null],
    ]);
    s = answer(s, 'p1', { type: 'boolean', value: true }, T0 + 1000);
    expect(slotsOf(s, 'p1')).toEqual([
      ['fifty', 'blocked', 'answered'],
      ['double', 'used', 'used'],
      ['retry', 'blocked', 'answered'],
      ['time', 'blocked', 'answered'],
      ['shield', 'blocked', 'answered'],
    ]);
    expect(slotsOf(must(pause(s, T0 + 2000)), 'p2')?.[2]).toEqual(['retry', 'blocked', 'paused']);

    const blitz = startRound(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single4])], { buffs }), 'Оля'), T0, rng0);
    // Ряд є й там, де бафів немає: усі кнопки неактивні з причиною.
    expect(slotsOf(blitz, 'p1')?.map(([, state, block]) => [state, block])).toEqual(buffs.map(() => ['blocked', 'off_blitz']));
    const wager = must(next(must(start(lobbyWith(makeRoundsQuiz([finalRound('f1', single4)], { buffs }), 'Оля'))), T0, rng0));
    const final = must(next(wager, T0, rng0));
    expect(final.phase).toBe('question');
    expect(slotsOf(final, 'p1')?.map(([, state, block]) => [state, block])).toEqual(buffs.map(() => ['blocked', 'off_final']));
    const cell = toBuffCell();
    expect(playerView(cell, 'p2')?.me.buffs).toBeNull();
    expect(playerView(cell, 'p1')?.me.buffs?.slots).toHaveLength(5);
  });

  it('50/50 removed options reach only the player who took it, and never the right one', () => {
    const s = take(toBuffQuestion(), 'p1', 'fifty');
    const removed = playerView(s, 'p1')?.me.buffs?.active?.removed;
    expect(removed).toEqual(['a', 'c']);
    expect(removed).not.toContain('b');
    expect(playerView(s, 'p2')?.me.buffs?.active).toBeNull();
    // У класиці спільне поле removed порожнє для всіх ролей — прибрані є лише в me.buffs самого гравця.
    for (const view of [stageView(s), hostView(s), playerView(s, 'p2')]) expect(JSON.stringify(view)).not.toContain('"removed":["');
    for (const view of [stageView(s), playerView(s, 'p1'), playerView(s, 'p2')]) expect(JSON.stringify(view)).not.toContain('correctId');
  });

  it('the stage and others see who took which buff, not what it did', () => {
    let s = take(take(toBuffQuestion(), 'p1', 'fifty'), 'p2', 'double', T0 + 500);
    const tags = [
      { playerId: 'p1', nickname: 'Оля', kind: 'fifty', target: null },
      { playerId: 'p2', nickname: 'Петро', kind: 'double', target: null },
    ];
    expect(stageView(s).buffs).toEqual(tags);
    expect(playerView(s, 'p3')?.buffs).toEqual(tags);
    expect(hostView(s).buffs).toEqual(tags);
    s = must(lock(s));
    expect(stageView(s).buffs).toEqual(tags);
    s = must(next(s, T0, rng0));
    expect(stageView(s).buffs).toEqual(tags);
    s = must(next(s, T0, rng0)); // q2
    expect(stageView(s).buffs).toEqual([]);
  });

  it('a buff notice for everyone: «Оля: 50/50»', () => {
    let s = toBuffQuestion();
    expect(stageView(s).buffNotice).toBeNull();
    s = take(s, 'p1', 'fifty', T0 + 1000);
    expect(stageView(s).buffNotice).toEqual({ seq: 1, at: T0 + 1000, playerId: 'p1', nickname: 'Оля', kind: 'fifty', questionIndex: 0, target: null });
    s = take(s, 'p2', 'double', T0 + 2000);
    expect(playerView(s, 'p3')?.buffNotice).toEqual({ seq: 2, at: T0 + 2000, playerId: 'p2', nickname: 'Петро', kind: 'double', questionIndex: 0, target: null });
    expect(hostView(s).buffNotice?.seq).toBe(2);
    s = must(removePlayer(s, 'p2'));
    expect(stageView(s).buffNotice).toEqual({ seq: 1, at: T0 + 1000, playerId: 'p1', nickname: 'Оля', kind: 'fifty', questionIndex: 0, target: null });
    s = take(s, 'p3', 'double', T0 + 3000); // номер не перевикористовується після вилучення
    expect(stageView(s).buffNotice).toEqual({ seq: 3, at: T0 + 3000, playerId: 'p3', nickname: 'Іра', kind: 'double', questionIndex: 0, target: null });
    // На наступному запитанні сповіщення лишається в зрізі, але з номером свого запитання: екрани його не покажуть.
    s = must(lock(s));
    s = must(next(s, T0, rng0));
    s = must(next(s, T0, rng0));
    expect(stageView(s).questionIndex).toBe(1);
    expect(stageView(s).buffNotice?.questionIndex).toBe(0);
  });

  it('overtime rows for the stage and host; the player gets a personal timer', () => {
    let s = take(toBuffQuestion(), 'p1', 'time');
    const row = { playerId: 'p1', nickname: 'Оля', deadline: T0 + 50_000, remainingMs: null };
    expect(stageView(s).overtime).toEqual([row]);
    expect(hostView(s).overtime).toEqual([row]);
    expect(playerView(s, 'p1')?.me.overtime).toEqual({ deadline: T0 + 50_000, remainingMs: null });
    expect(playerView(s, 'p2')?.me.overtime).toBeNull();
    const paused = must(pause(s, T0 + 10_000));
    expect(stageView(paused).overtime).toEqual([{ ...row, deadline: null, remainingMs: 40_000 }]);
    expect(playerView(paused, 'p1')?.me.overtime).toEqual({ deadline: null, remainingMs: 40_000 });
    // Пауза вже в додатковому часі: спільний кінець T0 + 20 000, витрачено 5 с із 30 — лишається 25 с.
    const late = must(pause(s, T0 + 25_000));
    expect(stageView(late).overtime).toEqual([{ ...row, deadline: null, remainingMs: 25_000 }]);
    expect(playerView(late, 'p1')?.me.overtime).toEqual({ deadline: null, remainingMs: 25_000 });
    // Годинник стоїть (утримання) і до, і після спільного кінця: залишок від heldAt.
    expect(playerView({ ...s, heldAt: T0 + 10_000 }, 'p1')?.me.overtime).toEqual({ deadline: null, remainingMs: 40_000 });
    expect(stageView({ ...s, heldAt: T0 + 25_000 }).overtime).toEqual([{ ...row, deadline: null, remainingMs: 25_000 }]);
    s = answer(s, 'p1', pick('b'), T0 + 1000);
    expect(stageView(s).overtime).toEqual([]);
    expect(playerView(s, 'p1')?.me.overtime).toBeNull();
  });

  it('retry shows the first answer to its owner only', () => {
    let s = toNext(must(lock(toBuffQuestion())), T0); // q2 numeric
    s = take(s, 'p1', 'retry');
    s = answer(s, 'p1', num(2111), T0 + 1000);
    const mine = playerView(s, 'p1');
    expect(mine?.me.buffs?.active).toEqual({ kind: 'retry', removed: [], retry: 'choice', first: { answer: num(2111), points: 750 }, hint: null, votes: null, spare: false, letter: null, scope: null, peek: null });
    expect(mine?.me.answer).toBeNull();
    expect(hostView(s).responses.map((r) => r.playerId)).not.toContain('p1');
    for (const view of [playerView(s, 'p2'), stageView(s)]) expect(JSON.stringify(view)).not.toContain('2111');
    // Лічильник не видає неправильну першу спробу: той, хто відповів, уже відповів.
    expect(stageView(s).answeredCount).toBe(1);
    expect(hostView(s).answeredCount).toBe(1);

    let w = take(toBuffQuestion(), 'p1', 'retry');
    expect(playerView(w, 'p1')?.me.buffs?.active).toMatchObject({ retry: 'armed', first: null });
    w = answer(w, 'p1', pick('a'), T0 + 1000);
    expect(playerView(w, 'p1')?.me.buffs?.active).toMatchObject({ retry: 'again', first: { answer: pick('a'), points: -1000 } });
    expect(playerView(w, 'p2')?.answeredCount).toBe(1);
  });

  it('the host sees allowed debuffs and buffs, and the buff of each response', () => {
    let s = toBuffQuestion({ debuffs: ['fog', 'mud'] });
    expect(hostView(s).allowed).toEqual({ debuffs: ['fog', 'mud'], buffs });
    s = answer(take(s, 'p1', 'double'), 'p1', pick('b'), T0 + 1000);
    s = answer(s, 'p2', pick('b'), T0 + 1000);
    expect(hostView(s).responses.map((r) => [r.playerId, r.buff])).toEqual([
      ['p1', 'double'],
      ['p2', null],
    ]);
  });

  it('a quiz without buffs changes nothing on the screens', () => {
    const s = startRound(lobbyWith(makeQuiz([single, text]), 'Оля', 'Петро'), T0, rng0);
    const me = playerView(s, 'p1');
    expect(me?.me.buffs).toBeNull();
    expect(me?.me.overtime).toBeNull();
    const stage = stageView(s);
    expect([stage.buffs, stage.buffNotice, stage.overtime]).toEqual([[], null, []]);
    expect(hostView(s).allowed).toEqual({ debuffs: [...LEGACY_DEBUFFS], buffs: [] });
  });
});
