import { describe, expect, it } from 'vitest';
import { buzz } from './blitz';
import { pickCell } from './board';
import { castVote, takeBuff } from './buffs';
import { setDebuff } from './debuffs';
import { createGame, lock, next, pause, recordOf, resume, start, submitAnswer, tick, type GameState } from './game';
import { adjustTime, deadlineOf, overtimeOf } from './timing';
import { othersQuiz } from './testing/buffs';
import { blitzRound, boardRound, classicRound, finalRound, makeRoundsQuiz, single, withId, withVideo } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, openAt } from './testing/helpers';

const T0 = 1_000_000;
const T1 = T0 + 60_000;
const rng0 = () => 0;
const right = { type: 'single', optionId: 'b' } as const;
const classicQuiz = (speedBonus = true, buffs?: ['fifty']) =>
  makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], { speedBonus })], buffs ? { buffs } : {});
/** Класика із заставками: `single` (20 с, 1000 балів), відкрито о T0. */
const classic = (speedBonus = true) => openAt(lobbyWithSplash(classicQuiz(speedBonus), 'Анна', 'Богдан'), T0);
/** Класика із заставками, де перше запитання з відео (без таймера), відкрито о T0. */
const video = () =>
  openAt(lobbyWithSplash(makeRoundsQuiz([classicRound('r1', [withVideo(single), withId(single, 'q2')])]), 'Анна', 'Богдан'), T0);

describe('the question splash', () => {
  it('a game is created without transitions unless asked', () => {
    expect(createGame(classicQuiz()).transitions).toBe(false);
    expect(createGame(classicQuiz()).splash).toBeNull();
    expect(createGame(classicQuiz(), { transitions: true }).transitions).toBe(true);
  });

  it('the classic question timer starts after the splash', () => {
    const s = classic();
    expect(s.splash).toEqual({ kind: 'question', at: T0, until: T0 + 1200 });
    expect(s.startedAt).toBe(T0 + 1200);
    expect(s.endsAt).toBe(T0 + 21_200);
  });

  it('nothing a player does counts before the start; an answer right at the start gets the full speed bonus', () => {
    let s = openAt(lobbyWithSplash(classicQuiz(true, ['fifty']), 'Анна', 'Богдан'), T0);
    expect(submitAnswer(s, 'p1', right, T0 + 1199)).toEqual({ ok: false, error: 'not_started' });
    expect(takeBuff(s, 'p1', 'fifty', T0 + 500, rng0)).toEqual({ ok: false, error: 'not_started' });
    s = must(submitAnswer(s, 'p1', right, T0 + 1200));
    // Та сама відповідь у грі без заставок рівно на відкритті — еталон повного бонусу швидкості.
    const plain = must(submitAnswer(openAt(lobbyWith(classicQuiz(), 'Анна', 'Богдан'), T0), 'p1', right, T0));
    expect(recordOf(s, 0, 'p1')?.timeMs).toBe(0);
    expect(recordOf(s, 0, 'p1')?.points).toBe(recordOf(plain, 0, 'p1')?.points);
  });

  it('without transitions nothing changes', () => {
    const s = openAt(lobbyWith(classicQuiz(), 'Анна', 'Богдан'), T0);
    expect(s.splash).toBeNull();
    expect([s.startedAt, s.endsAt]).toEqual([T0, T0 + 20_000]);
    expect(submitAnswer(s, 'p1', right, T0).ok).toBe(true);
  });

  it('a board cell flips for 1 s before its timer; a blitz cell waits too', () => {
    // id клітинки — id її запитання (findCell у shared/quiz.ts).
    const quiz = makeRoundsQuiz([
      boardRound('b1', [{ title: 'Міста', cells: [withId(single, 'a1'), { question: withId(single, 'a2'), kind: 'blitz' }] }], {
        check: 'manual',
      }),
    ]);
    let s = must(next(must(start(lobbyWithSplash(quiz, 'Анна', 'Богдан'))), T0 - 5000)); // intro → поле
    s = must(pickCell(s, 'p1', 'a1', T0, rng0));
    expect(s.splash).toEqual({ kind: 'cell', at: T0, until: T0 + 1000 });
    expect([s.startedAt, s.endsAt]).toEqual([T0 + 1000, T0 + 21_000]);
    // a1 закрити й розкрити, повернутися на поле; Богдан вибирає a2 (бліц) о T1.
    s = must(lock(s));
    while (s.phase !== 'board') s = must(next(s, T0 + 30_000, rng0));
    s = must(pickCell(s, 'p2', 'a2', T1, rng0));
    expect(s.splash).toEqual({ kind: 'cell', at: T1, until: T1 + 1000 });
    expect(buzz(s, 'p1', T1 + 999)).toEqual({ ok: false, error: 'not_started' });
    s = must(buzz(s, 'p1', T1 + 1000));
    expect(s.plays[s.questionIndex].blitz?.queue[0]).toMatchObject({ playerId: 'p1', timeMs: 0 });
  });

  it('blitz rounds have no splash', () => {
    const s = openAt(lobbyWithSplash(makeRoundsQuiz([blitzRound('z1', [single], { check: 'manual' })]), 'Анна', 'Богдан'), T0);
    expect(s.splash).toBeNull();
    expect(s.startedAt).toBe(T0);
    expect(buzz(s, 'p1', T0).ok).toBe(true);
  });

  it('the final question has a splash too; a video question without a timer still waits for it', () => {
    let f = must(start(lobbyWithSplash(makeRoundsQuiz([finalRound('f', withId(single, 'f1'))]), 'Анна', 'Богдан')));
    f = must(next(f, T0 - 10_000, rng0)); // intro → ставки
    expect(f.phase).toBe('wager');
    f = must(next(f, T0, rng0)); // ставки → запитання
    expect(f.phase).toBe('question');
    expect(f.splash).toEqual({ kind: 'question', at: T0, until: T0 + 1200 });
    expect([f.startedAt, f.endsAt]).toEqual([T0 + 1200, T0 + 21_200]);
    expect(submitAnswer(f, 'p1', right, T0 + 1000)).toEqual({ ok: false, error: 'not_started' });

    const v = video();
    expect([v.startedAt, v.endsAt]).toEqual([T0 + 1200, null]);
    expect(submitAnswer(v, 'p1', right, T0 + 100)).toEqual({ ok: false, error: 'not_started' });
    expect(submitAnswer(v, 'p1', right, T0 + 1200).ok).toBe(true);
  });

  it('pause during the splash freezes it; the rest plays after resume', () => {
    let s = must(pause(classic(), T0 + 500));
    expect(s.remainingMs).toBe(20_700);
    s = must(resume(s, T0 + 10_500));
    expect([s.startedAt, s.endsAt]).toEqual([T0 + 11_200, T0 + 31_200]);
    expect(s.splash).toEqual({ kind: 'question', at: T0 + 10_000, until: T0 + 11_200 });
    expect(submitAnswer(s, 'p1', right, T0 + 11_100)).toEqual({ ok: false, error: 'not_started' });
    expect(recordOf(must(submitAnswer(s, 'p1', right, T0 + 11_200)), 0, 'p1')?.timeMs).toBe(0);

    // Без таймера: startedAt і кінець заставки зсуваються однаково.
    const v = must(resume(must(pause(video(), T0 + 500)), T0 + 10_500));
    expect(v.startedAt).toBe(T0 + 11_200);
    expect(v.splash).toEqual({ kind: 'question', at: T0 + 10_000, until: T0 + 11_200 });

    // Пауза після кінця заставки: заставка лишається на місці, годинник зсувається як завжди.
    const late = must(resume(must(pause(classic(), T0 + 5000)), T0 + 6000));
    expect(late.splash).toEqual({ kind: 'question', at: T0, until: T0 + 1200 });
    expect([late.startedAt, late.endsAt]).toEqual([T0 + 2200, T0 + 22_200]);
  });

  it('±15 s during the splash counts from the question start', () => {
    const plus = must(adjustTime(classic(), 15, T0 + 100));
    expect([plus.startedAt, plus.endsAt, plus.plays[0].extraMs]).toEqual([T0 + 1200, T0 + 36_200, 15_000]);
    const minus = must(adjustTime(classic(), -15, T0 + 100));
    expect([minus.startedAt, minus.endsAt, minus.plays[0].extraMs]).toEqual([T0 + 1200, T0 + 6200, -15_000]);
  });

  it('the host can close the question during the splash; tick waits for endsAt', () => {
    expect(must(lock(classic())).phase).toBe('locked');
    expect(tick(classic(), T0 + 21_199).phase).toBe('question');
    expect(tick(classic(), T0 + 21_200).phase).toBe('locked');
  });

  it('debuffs fire at the question start', () => {
    const lobby = lobbyWithSplash(classicQuiz(), 'Анна', 'Богдан');
    const intro = must(start(lobby));
    const s = must(next(must(setDebuff(intro, 'p1', 'fog')), T0, rng0));
    expect(s.debuffs.p1).toMatchObject({ firedAt: 0, since: T0 + 1200 });
  });

  it('buffs keep their clocks after a splash', () => {
    /** Оля p1, Петро p2, Іра p3; q1 othersQuiz відкрито о T0 із заставкою. */
    const opened = (): GameState => openAt(lobbyWithSplash(othersQuiz(), 'Оля', 'Петро', 'Іра'), T0, rng0);
    let s = opened();
    expect(takeBuff(s, 'p1', 'audience', T0 + 1000, rng0)).toEqual({ ok: false, error: 'not_started' });
    s = must(submitAnswer(s, 'p2', { type: 'single', optionId: 'b' }, T0 + 2000));
    s = must(takeBuff(s, 'p1', 'audience', T0 + 3000, rng0));
    expect(s.plays[0].buffs?.p1.vote?.endsAt).toBe(T0 + 18_000);
    expect(castVote(s, 'p2', 'p1', { type: 'single', optionId: 'b' }, T0 + 4000).ok).toBe(true);

    s = must(takeBuff(s, 'p3', 'swap', T0 + 4000, rng0));
    expect(s.plays[0].buffs?.p3.spare).toMatchObject({ startedAt: T0 + 4000, limitMs: 20_000 });
    expect(overtimeOf(s.plays[0], 'p3')).toBe(2800);
    expect(deadlineOf(s, s.plays[0], 'p3')).toBe(T0 + 24_000);

    // Додатковий час — на класиці з бафом time: особистий кінець від endsAt, що вже враховує заставку.
    const timeQuiz = makeRoundsQuiz([classicRound('r1', [single])], { buffs: ['time'] });
    let t = openAt(lobbyWithSplash(timeQuiz, 'Оля', 'Петро'), T0);
    expect(takeBuff(t, 'p1', 'time', T0 + 1199, rng0)).toEqual({ ok: false, error: 'not_started' });
    t = must(takeBuff(t, 'p1', 'time', T0 + 5000, rng0));
    expect(deadlineOf(t, t.plays[0], 'p1')).toBe(T0 + 51_200);
    expect(deadlineOf(t, t.plays[0], 'p2')).toBe(T0 + 21_200);
  });
});
