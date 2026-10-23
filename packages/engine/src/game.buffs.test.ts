import { DEFAULT_RULES, DEBUFF_KINDS, type Answer, type Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { buffBlock, buffsUsed, fiftyCount, takeBuff } from './buffs';
import { setDebuff } from './debuffs';
import { acceptAnswer, lock, next, override, pause, removePlayer, start, submitAnswer, type GameState } from './game';
import { FIRST_BUFFS, T0, buffQuiz, toBuffCell, toBuffQuestion } from './testing/buffs';
import {
  blitzRound,
  bool,
  boardRound,
  chain,
  finalRound,
  makeQuiz,
  makeRoundsQuiz,
  multi,
  numeric,
  order,
  single,
  single4,
  sortQ,
  text,
  withId,
} from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng0 = () => 0;
const rng9 = () => 0.99;
const answer = (s: GameState, id: string, a: Answer, at: number) => must(submitAnswer(s, id, a, at));
const points = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
const pick = (optionId: string): Answer => ({ type: 'single', optionId });
const buffs = [...FIRST_BUFFS];

/** Від закритого запитання класики до наступного відкритого. */
const toNext = (s: GameState, at: number) => must(next(must(next(s, at, rng0)), at, rng0));

describe('buffs', () => {
  it('the settings decide which buffs exist; each is used once per game', () => {
    expect(takeBuff(toBuffQuestion({ buffs: [] }), 'p1', 'double', T0, rng0)).toEqual({ ok: false, error: 'not_allowed' });
    expect(takeBuff(toBuffQuestion({ buffs: ['shield'] }), 'p1', 'double', T0, rng0)).toEqual({ ok: false, error: 'not_allowed' });
    let s = must(takeBuff(toBuffQuestion(), 'p1', 'double', T0 + 1000, rng0));
    expect(s.plays[0].buffs?.p1).toEqual({ kind: 'double', seq: 1, at: T0 + 1000, removed: [], retry: null, first: null });
    s = must(next(must(lock(s)), T0 + 30_000, rng0)); // reveal
    s = must(next(s, T0 + 31_000, rng0)); // q2
    expect(takeBuff(s, 'p1', 'double', T0 + 32_000, rng0)).toEqual({ ok: false, error: 'buff_used' });
    expect(buffsUsed(s, 'p1')).toEqual(['double']);
    expect(takeBuff(s, 'p9', 'double', T0, rng0)).toEqual({ ok: false, error: 'not_found' });
  });

  it('one buff per question, only before answering, while the question is open', () => {
    let s = must(takeBuff(toBuffQuestion(), 'p1', 'double', T0, rng0));
    expect(takeBuff(s, 'p1', 'shield', T0, rng0)).toEqual({ ok: false, error: 'buff_busy' });
    s = answer(s, 'p2', pick('b'), T0 + 1000);
    expect(takeBuff(s, 'p2', 'double', T0 + 2000, rng0)).toEqual({ ok: false, error: 'already_answered' });
    expect(takeBuff(must(pause(s, T0 + 3000)), 'p3', 'double', T0 + 3000, rng0)).toEqual({ ok: false, error: 'paused' });
    expect(takeBuff(s, 'p3', 'double', T0 + 20_001, rng0)).toEqual({ ok: false, error: 'time_over' });
    expect(takeBuff(must(lock(s)), 'p3', 'double', T0 + 3000, rng0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(buffBlock(s, 'p1', 'shield')).toBe('taken');
    expect(buffBlock(s, 'p2', 'shield')).toBe('answered');
    expect(buffBlock(s, 'p1', 'double')).toBe('used');
    expect(buffBlock(s, 'p3', 'double')).toBeNull();
    expect(buffBlock(s, 'p3', 'double', T0 + 20_001)).toBe('time');
    expect(buffBlock(must(pause(s, T0 + 3000)), 'p3', 'double', T0 + 3000)).toBe('paused');
  });

  it('50/50 removes half of the wrong options at random and never the right one', () => {
    expect(must(takeBuff(toBuffQuestion(), 'p1', 'fifty', T0, rng0)).plays[0].buffs?.p1.removed).toEqual(['a', 'c']);
    expect(must(takeBuff(toBuffQuestion(), 'p1', 'fifty', T0, rng9)).plays[0].buffs?.p1.removed).toEqual(['d', 'c']);
    const options = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, text: `Варіант ${i}` }));
    const singleOf = (n: number): Question => ({ ...single, options: options(n), correctId: 'o0' });
    expect([3, 4, 5, 6, 2].map((n) => fiftyCount(singleOf(n)))).toEqual([1, 2, 2, 3, 0]);
    expect(fiftyCount(multi)).toBe(1);
    expect(fiftyCount({ ...multi, correctIds: ['a', 'b', 'c'] })).toBe(0);
    expect([bool, text, numeric, order].map(fiftyCount)).toEqual([0, 0, 0, 0]);

    let s = toBuffQuestion();
    s = toNext(must(lock(s)), T0); // q2
    s = toNext(must(lock(s)), T0); // q3 bool
    expect(takeBuff(s, 'p1', 'fifty', T0, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
    expect(buffBlock(s, 'p1', 'fifty')).toBe('unfit_type');
    s = toNext(must(lock(s)), T0); // q4
    s = toNext(must(lock(s)), T0); // q5 multi
    expect(must(takeBuff(s, 'p1', 'fifty', T0, rng0)).plays[4].buffs?.p1.removed).toEqual(['b']);

    const two = startRound(lobbyWith(makeQuiz([singleOf(2)], { buffs }), 'Оля'), T0, rng0);
    expect(takeBuff(two, 'p1', 'fifty', T0, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
    expect(buffBlock(two, 'p1', 'fifty')).toBe('unfit_options');
  });

  it('double points: the gain doubles, with the cell multiplier and the streak bonus; a minus does not', () => {
    let s = must(takeBuff(toBuffQuestion(), 'p1', 'double', T0, rng0));
    s = answer(s, 'p1', pick('b'), T0 + 1000);
    expect(s.plays[0].answers.p1).toMatchObject({ basePoints: 2000, points: 2000, buff: 'double' });
    s = answer(s, 'p2', pick('b'), T0 + 1000);
    expect(s.plays[0].answers.p2.points).toBe(1000);
    expect(s.plays[0].answers.p2.buff).toBeUndefined();
    s = must(takeBuff(s, 'p3', 'double', T0 + 2000, rng0));
    s = answer(s, 'p3', pick('a'), T0 + 3000);
    expect(s.plays[0].answers.p3.points).toBe(-1000);
    expect([points(s, 'p1'), points(s, 'p2'), points(s, 'p3')]).toEqual([2000, 1000, -1000]);

    const streakBonusOf = (bonus: { kind: 'fixed' | 'percent'; value: number }) => {
      let g = toBuffQuestion({ rules: { ...DEFAULT_RULES, streak: { length: 2, bonus } } });
      g = toNext(must(lock(answer(g, 'p1', pick('b'), T0 + 1000))), T0 + 2000);
      g = must(takeBuff(g, 'p1', 'double', T0 + 2000, rng0));
      g = must(lock(answer(g, 'p1', { type: 'numeric', value: 2061 }, T0 + 3000)));
      return g.plays[1].answers.p1;
    };
    expect(streakBonusOf({ kind: 'fixed', value: 100 })).toMatchObject({ streakBonus: 200, points: 2200 });
    expect(streakBonusOf({ kind: 'percent', value: 10 })).toMatchObject({ streakBonus: 200, points: 2200 });

    let cell = must(takeBuff(toBuffCell(), 'p1', 'double', T0 + 1000, rng0));
    cell = must(acceptAnswer(answer(cell, 'p1', pick('b'), T0 + 2000), 'p1', T0 + 3000));
    expect(cell.plays[0].answers.p1).toMatchObject({ points: 4000, buff: 'double' });
    expect(points(cell, 'p1')).toBe(4000);
  });

  it('shield: a wrong or missing answer costs nothing, but breaks the streak; useless without a minus', () => {
    let s = must(takeBuff(toBuffQuestion(), 'p1', 'shield', T0, rng0));
    s = must(lock(answer(s, 'p1', pick('a'), T0 + 1000)));
    expect(s.plays[0].answers.p1).toMatchObject({ grade: 'wrong', points: 0, buff: 'shield' });
    expect(points(s, 'p1')).toBe(0);

    const streak = { length: 2, bonus: { kind: 'fixed', value: 100 } } as const;
    let g = toBuffQuestion({ rules: { ...DEFAULT_RULES, penalty: 'minus', streak } });
    g = toNext(must(lock(answer(g, 'p1', pick('b'), T0 + 1000))), T0 + 2000);
    g = must(takeBuff(g, 'p1', 'shield', T0 + 2000, rng0));
    g = must(lock(answer(g, 'p1', { type: 'numeric', value: 0 }, T0 + 3000)));
    expect(g.plays[1].answers.p1.points).toBe(0);
    expect(g.players[0].streak).toBe(0);

    let cell = must(takeBuff(toBuffCell({ penalty: 'minus' }), 'p1', 'shield', T0 + 1000, rng0));
    cell = must(next(must(lock(cell)), T0 + 2000, rng0));
    expect(cell.plays[0].answers.p1).toMatchObject({ grade: 'wrong', points: 0, buff: 'shield' });

    const noMinus = toBuffQuestion({ rules: DEFAULT_RULES });
    expect(takeBuff(noMinus, 'p1', 'shield', T0, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
    expect(buffBlock(noMinus, 'p1', 'shield')).toBe('unfit_penalty');
  });

  it('a host override keeps the buff', () => {
    let s = must(takeBuff(toBuffQuestion(), 'p1', 'double', T0, rng0));
    s = must(takeBuff(s, 'p3', 'shield', T0, rng0));
    s = answer(s, 'p1', pick('a'), T0 + 1000);
    s = answer(s, 'p3', pick('b'), T0 + 1000);
    s = must(next(must(lock(s)), T0 + 2000, rng0)); // reveal
    s = must(override(s, 'p1', 'correct'));
    expect(s.plays[0].answers.p1).toMatchObject({ points: 2000, buff: 'double' });
    s = must(override(s, 'p3', 'wrong'));
    expect(s.plays[0].answers.p3).toMatchObject({ points: 0, buff: 'shield' });
    expect([points(s, 'p1'), points(s, 'p3')]).toEqual([2000, 0]);
  });

  it('buffs work only where the player answers from the phone', () => {
    const wrongPhase = { ok: false, error: 'wrong_phase' };
    const blitz = startRound(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single4])], { buffs }), 'Оля'), T0, rng0);
    expect(takeBuff(blitz, 'p1', 'double', T0, rng0)).toEqual(wrongPhase);
    expect(buffBlock(blitz, 'p1', 'double')).toBe('off_blitz');

    const wager = must(next(must(start(lobbyWith(makeRoundsQuiz([finalRound('f1', single4)], { buffs }), 'Оля'))), T0, rng0));
    const final = must(next(wager, T0, rng0));
    expect(final.phase).toBe('question');
    expect(takeBuff(final, 'p1', 'double', T0, rng0)).toEqual(wrongPhase);
    expect(buffBlock(final, 'p1', 'double')).toBe('off_final');

    for (const [question, reason] of [
      [chain, 'off_chain'],
      [sortQ, 'off_sort'],
    ] as const) {
      const s = startRound(lobbyWith(makeQuiz([question], { buffs }), 'Оля'), T0, rng0);
      expect(takeBuff(s, 'p1', 'double', T0, rng0)).toEqual(wrongPhase);
      expect(buffBlock(s, 'p1', 'double')).toBe(reason);
    }

    const round = boardRound('g1', [
      {
        title: 'Міста',
        cells: [
          { question: withId(single4, 'c11'), kind: 'blitz' },
          { question: withId(single4, 'c12'), answerMode: 'voice' },
          withId(single4, 'c13'),
        ],
      },
    ]);
    const board = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { buffs }), 'Оля', 'Петро'))), T0, rng0));
    const blitzCell = must(pickCell(board, 'p1', 'c11', T0, rng0));
    expect(takeBuff(blitzCell, 'p1', 'double', T0, rng0)).toEqual(wrongPhase);
    expect(buffBlock(blitzCell, 'p1', 'double')).toBe('off_blitz_cell');
    // На усній клітинці бафи тепер діють.
    expect(takeBuff(must(pickCell(board, 'p1', 'c12', T0, rng0)), 'p1', 'double', T0, rng0).ok).toBe(true);
    const cell = toBuffCell();
    expect(takeBuff(cell, 'p2', 'double', T0, rng0)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(buffBlock(cell, 'p2', 'double')).toBe('not_chooser');
    const pending = answer(cell, 'p1', pick('b'), T0 + 1000);
    expect(takeBuff(pending, 'p1', 'double', T0 + 2000, rng0)).toEqual({ ok: false, error: 'already_answered' });
    expect(buffBlock(pending, 'p1', 'double')).toBe('answered');
  });

  it('a kicked player leaves no buffs behind', () => {
    const s = must(removePlayer(must(takeBuff(toBuffQuestion(), 'p1', 'fifty', T0, rng0)), 'p1'));
    expect(s.plays[0].buffs).not.toHaveProperty('p1');
    expect(buffsUsed(s, 'p1')).toEqual([]);
  });

  it('debuffs the quiz does not allow are refused', () => {
    const fogOnly = toBuffQuestion({ debuffs: ['fog'] });
    expect(setDebuff(fogOnly, 'p1', 'shake')).toEqual({ ok: false, error: 'not_allowed' });
    expect(setDebuff(fogOnly, 'p1', 'fog').ok).toBe(true);
    expect(setDebuff(toBuffQuestion({ debuffs: [] }), 'p1', 'fog')).toEqual({ ok: false, error: 'not_allowed' });
    expect(setDebuff(toBuffQuestion({ debuffs: [] }), 'p9', 'fog')).toEqual({ ok: false, error: 'not_found' });
    const plain = startRound(lobbyWith(makeQuiz([single4]), 'Оля'), T0, rng0);
    for (const kind of DEBUFF_KINDS) expect(setDebuff(plain, 'p1', kind).ok).toBe(true);
  });
});
