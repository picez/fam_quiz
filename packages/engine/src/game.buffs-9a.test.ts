import type { Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { AUDIENCE_MS, fiftyCount, takeBuff } from './buffs';
import { lock, next, submitAnswer } from './game';
import { deadlineOf, overtimeOf } from './timing';
import { hostView, playerView, stageView } from './views';
import { T0, othersQuiz, toBuffCell, toBuffQuestion, toOthersQuestion } from './testing/buffs';
import { multi, single4, withVideo } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng0 = () => 0;
const options = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, text: `Варіант ${i}` }));
/** multi з n варіантами, з яких перші right правильні. */
const multiOf = (n: number, right: number): Question => ({ ...multi, options: options(n), correctIds: options(right).map((o) => o.id) });
const kyiv = { type: 'single', optionId: 'b' } as const;

describe('50/50 that everybody sees', () => {
  it('a multi question loses half of its wrong options rounded up, but one wrong always stays', () => {
    // неправильних: 2 → 1, 3 → 2, 4 → 2, 5 → 3
    expect([multiOf(4, 2), multiOf(4, 1), multiOf(6, 2), multiOf(6, 1)].map(fiftyCount)).toEqual([1, 2, 2, 3]);
    expect(fiftyCount(multiOf(3, 1))).toBe(1);
    expect(fiftyCount(multiOf(3, 2))).toBe(0);
  });

  it('on a board cell everybody sees what 50/50 removed; in classic only the taker', () => {
    const cell = must(takeBuff(toBuffCell(), 'p1', 'fifty', T0 + 1000, rng0));
    const removed = cell.plays[0].buffs?.p1.removed ?? [];
    expect(removed).toHaveLength(2);
    expect(removed).not.toContain('b');
    expect(stageView(cell).removed).toEqual(removed);
    expect(hostView(cell).removed).toEqual(removed);
    expect(playerView(cell, 'p2')?.removed).toEqual(removed);
    expect(playerView(cell, 'p1')?.removed).toEqual(removed);
    expect(playerView(cell, 'p1')?.me.buffs?.active?.removed).toEqual(removed);
    // після закриття й на розкритті позначка лишається
    const locked = must(lock(cell));
    expect(locked.phase).toBe('locked');
    expect(stageView(locked).removed).toEqual(removed);
    const revealed = must(next(locked, T0 + 30_000));
    expect(revealed.phase).toBe('reveal');
    expect(stageView(revealed).removed).toEqual(removed);
    expect(playerView(revealed, 'p3')?.removed).toEqual(removed);

    const classic = must(takeBuff(toBuffQuestion(), 'p1', 'fifty', T0 + 1000, rng0));
    expect(stageView(classic).removed).toEqual([]);
    expect(hostView(classic).removed).toEqual([]);
    expect(playerView(classic, 'p2')?.removed).toEqual([]);
    expect(playerView(classic, 'p1')?.removed).toEqual([]);
    expect(playerView(classic, 'p1')?.me.buffs?.active?.removed).toEqual(['a', 'c']);
  });

  it('nothing is removed before a buff and between questions', () => {
    expect(stageView(toBuffCell()).removed).toEqual([]);
    expect(playerView(toBuffCell(), 'p2')?.removed).toEqual([]);
    // поле після розкриття й «Далі» (етап board): removed []
    const cell = must(takeBuff(toBuffCell(), 'p1', 'fifty', T0 + 1000, rng0));
    const board = must(next(must(next(must(lock(cell)), T0 + 30_000)), T0 + 31_000));
    expect(board.phase).toBe('board');
    expect(stageView(board).removed).toEqual([]);
    expect(hostView(board).removed).toEqual([]);
    expect(playerView(board, 'p2')?.removed).toEqual([]);
  });
});

describe('the audience buff', () => {
  it('gives the asker 15 s of their own time, like extra time', () => {
    const answered = must(submitAnswer(toOthersQuestion(), 'p2', kyiv, T0 + 2000));
    const s = must(takeBuff(answered, 'p1', 'audience', T0 + 5000, rng0));
    const play = s.plays[0];
    expect(play.buffs?.p1.vote?.endsAt).toBe(T0 + 5000 + AUDIENCE_MS);
    expect(overtimeOf(play, 'p1')).toBe(AUDIENCE_MS);
    expect(deadlineOf(s, play, 'p1')).toBe(T0 + 20_000 + AUDIENCE_MS);
    expect(playerView(s, 'p1')?.me.overtime).toEqual({ deadline: T0 + 35_000, remainingMs: null });
    expect(submitAnswer(s, 'p1', kyiv, T0 + 30_000).ok).toBe(true);
    expect(submitAnswer(s, 'p1', kyiv, T0 + 35_001)).toEqual({ ok: false, error: 'time_over' });
    // сцена показує «Чекаємо: Оля» до особистого кінця
    expect(stageView(s).overtime).toEqual([expect.objectContaining({ playerId: 'p1', deadline: T0 + 35_000, remainingMs: null })]);
  });

  it('a question without a timer gives no extra time', () => {
    const quiz = othersQuiz();
    const round = quiz.rounds[0];
    if (round.type !== 'classic') throw new Error('othersQuiz is classic');
    const [first, ...rest] = round.questions;
    const video = { ...quiz, rounds: [{ ...round, questions: [withVideo(first ?? single4), ...rest] }] };
    const s0 = startRound(lobbyWith(video, 'Оля', 'Петро', 'Іра'), T0, rng0);
    const answered = must(submitAnswer(s0, 'p2', kyiv, T0 + 2000));
    const s = must(takeBuff(answered, 'p1', 'audience', T0 + 5000, rng0));
    const play = s.plays[0];
    expect(play.buffs?.p1.vote?.endsAt).toBe(T0 + 5000 + AUDIENCE_MS);
    expect(overtimeOf(play, 'p1')).toBe(0);
    expect(deadlineOf(s, play, 'p1')).toBeNull();
  });
});
