import { describe, expect, it } from 'vitest';
import { buzz } from './blitz';
import { pickCell } from './board';
import { buffBlock, castVote, takeBuff } from './buffs';
import { setDebuff } from './debuffs';
import { answerDuel, declareDuel, pickDuelCategory } from './duel';
import { createGame, end, endRound, lock, next, pause, recordOf, resume, start, submitAnswer, tick, type GameState } from './game';
import { adjustTime, deadlineOf, overtimeOf } from './timing';
import { othersQuiz } from './testing/buffs';
import { toDeclarable } from './testing/duel';
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
    // На паузі залишок — лише таймер запитання (не більше за ліміт); залишок заставки береться з неї самої.
    expect(s.remainingMs).toBe(20_000);
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

  it('a pause during the splash shifts a fired debuff with the question start', () => {
    const intro = must(start(lobbyWithSplash(classicQuiz(), 'Анна', 'Богдан')));
    const s = must(next(must(setDebuff(intro, 'p1', 'fog')), T0, rng0));
    const resumed = must(resume(must(pause(s, T0 + 500)), T0 + 10_500));
    expect(resumed.debuffs.p1).toMatchObject({ firedAt: 0, since: T0 + 11_200 });
    expect(resumed.debuffs.p1.since).toBe(resumed.startedAt);
    // Без таймера (відео) — так само.
    const videoIntro = must(start(lobbyWithSplash(makeRoundsQuiz([classicRound('r1', [withVideo(single)])]), 'Анна', 'Богдан')));
    const v = must(next(must(setDebuff(videoIntro, 'p1', 'fog')), T0, rng0));
    const vr = must(resume(must(pause(v, T0 + 500)), T0 + 10_500));
    expect(vr.debuffs.p1.since).toBe(T0 + 11_200);
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

const on = (s: GameState): GameState => ({ ...s, transitions: true });

/** Закриває поточне запитання й іде «Далі», доки не дійде до round_end або finished (о мить now). */
function playOut(s: GameState, now: number): GameState {
  let r = must(lock(s));
  while (r.phase !== 'round_end' && r.phase !== 'finished') r = must(next(r, now, rng0));
  return r;
}

describe('round, final, duel and podium splashes', () => {
  it('a round starts with «Раунд N»; the host is never held by it', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single]), classicRound('r2', [withId(single, 'q2')])]);
    let s = must(start(lobbyWithSplash(quiz, 'Анна'), T0));
    expect(s.phase).toBe('intro');
    expect(s.splash).toEqual({ kind: 'round', at: T0, until: T0 + 2500 });
    s = must(next(s, T0 + 500, rng0)); // «Почати раунд» посеред заставки раунду
    expect(s.splash).toEqual({ kind: 'question', at: T0 + 500, until: T0 + 1700 });
    s = playOut(s, T0 + 30_000);
    expect(s.phase).toBe('round_end');
    s = must(next(s, T1, rng0));
    expect(s.phase).toBe('intro');
    expect(s.splash).toEqual({ kind: 'round', at: T1, until: T1 + 2500 });
  });

  it('the final gets its own longer splash', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single]), finalRound('f1', withId(single, 'qf'))]);
    let s = playOut(must(next(must(start(lobbyWithSplash(quiz, 'Анна'), T0)), T0, rng0)), T0 + 30_000);
    s = must(next(s, T1, rng0));
    expect(s.phase).toBe('intro');
    expect(s.splash).toEqual({ kind: 'final', at: T1, until: T1 + 3200 });
    s = must(next(s, T1 + 5000, rng0));
    expect(s.phase).toBe('wager');
    s = must(next(s, T1 + 10_000, rng0));
    expect(s.splash).toEqual({ kind: 'question', at: T1 + 10_000, until: T1 + 11_200 });
    expect(s.startedAt).toBe(T1 + 11_200);
  });

  it('the last round ends with «Підсумки» before the podium, also on an early end', () => {
    const one = () => must(next(must(start(lobbyWithSplash(makeRoundsQuiz([classicRound('r1', [single])]), 'Анна'), T0)), T0, rng0));
    let s = must(next(must(lock(one())), T0 + 30_000, rng0)); // reveal
    expect(s.phase).toBe('reveal');
    s = must(next(s, T1, rng0));
    expect(s.phase).toBe('finished');
    expect(s.splash).toEqual({ kind: 'podium', at: T1, until: T1 + 2500 });

    const early = must(endRound(one(), T1));
    expect([early.phase, early.splash]).toEqual(['finished', { kind: 'podium', at: T1, until: T1 + 2500 }]);
    const ended = must(end(one(), T1));
    expect([ended.phase, ended.splash]).toEqual(['finished', { kind: 'podium', at: T1, until: T1 + 2500 }]);
    expect(must(end(one())).splash).toEqual({ kind: 'question', at: T0, until: T0 + 1200 });

    // Підсумки раунду заставки не мають; endRound не в останньому раунді — теж.
    const two = makeRoundsQuiz([classicRound('r1', [single]), classicRound('r2', [withId(single, 'q2')])]);
    const first = must(next(must(start(lobbyWithSplash(two, 'Анна'), T0)), T0, rng0));
    const roundEnd = playOut(first, T0 + 30_000);
    expect(roundEnd.phase).toBe('round_end');
    expect(roundEnd.splash).toEqual({ kind: 'question', at: T0, until: T0 + 1200 });
    expect(must(endRound(first, T1)).splash).toEqual({ kind: 'question', at: T0, until: T0 + 1200 });
  });

  it('a duel starts with «Дуель!»', () => {
    const declared = must(declareDuel(on(toDeclarable()), 'p1', 'p2'));
    const s = must(next(declared, T0 + 4000, rng0));
    expect(s.phase).toBe('duel');
    expect(s.splash).toEqual({ kind: 'duel', at: T0 + 4000, until: T0 + 6000 });
  });

  it('a duel category picked during the splash starts the duel clock after it', () => {
    const started = must(next(must(declareDuel(on(toDeclarable()), 'p1', 'p2')), T0 + 4000, rng0));
    const early = must(pickDuelCategory(started, null, 'dc1', T0 + 4500, rng0));
    expect([early.startedAt, early.endsAt]).toEqual([T0 + 6000, T0 + 26_000]);
    expect(answerDuel(early, 'p1', 'будь-що', T0 + 5000)).toEqual({ ok: false, error: 'not_started' });
    const late = must(pickDuelCategory(started, null, 'dc1', T1, rng0));
    expect([late.startedAt, late.endsAt]).toEqual([T1, T1 + 20_000]);
    // Друге запитання дуелі стартує одразу.
    const won = must(answerDuel(early, 'p1', 'Париж', T0 + 7000));
    const second = must(next(won, T0 + 8000, rng0));
    expect([second.startedAt, second.endsAt]).toEqual([T0 + 8000, T0 + 28_000]);
  });

  it('without transitions or now there are no splashes', () => {
    expect(must(start(lobbyWith(classicQuiz(), 'Анна'), T0)).splash).toBeNull();
    expect(must(start(lobbyWithSplash(classicQuiz(), 'Анна'))).splash).toBeNull();
    const started = must(next(must(declareDuel(toDeclarable(), 'p1', 'p2')), T0 + 4000, rng0));
    expect(started.splash).toBeNull();
    expect(must(pickDuelCategory(started, null, 'dc1', T0 + 4500, rng0)).startedAt).toBe(T0 + 4500);
    expect(must(end(openAt(lobbyWith(classicQuiz(), 'Анна'), T0), T1)).splash).toBeNull();
  });
});

describe('pause and buffs around the question splash', () => {
  it('±15 s on pause during the splash keeps the 5 s and 120 s limits exact', () => {
    const paused = must(pause(classic(), T0 + 500));
    const minus = must(adjustTime(paused, -15, T0 + 600));
    expect(minus.remainingMs).toBe(5000);
    let plus = paused;
    for (let i = 0; i < 6; i += 1) plus = must(adjustTime(plus, 15, T0 + 600));
    expect(plus.remainingMs).toBe(110_000);
    plus = must(adjustTime(plus, 15, T0 + 600));
    expect(plus.remainingMs).toBe(120_000);
    expect(adjustTime(plus, 15, T0 + 600)).toEqual({ ok: false, error: 'time_limit' });
    const resumed = must(resume(minus, T0 + 10_500));
    expect([resumed.startedAt, resumed.endsAt]).toEqual([T0 + 11_200, T0 + 16_200]);
  });

  it('a duel question paused during the «Дуель!» splash keeps its full time', () => {
    const started = must(next(must(declareDuel(on(toDeclarable()), 'p1', 'p2')), T0 + 4000, rng0));
    const early = must(pickDuelCategory(started, null, 'dc1', T0 + 4500, rng0));
    const paused = must(pause(early, T0 + 5000));
    expect(paused.remainingMs).toBe(20_000);
    const resumed = must(resume(paused, T0 + 15_000));
    expect([resumed.startedAt, resumed.endsAt]).toEqual([T0 + 16_000, T0 + 36_000]);
    expect(resumed.splash).toEqual({ kind: 'duel', at: T0 + 14_000, until: T0 + 16_000 });
  });

  it('a round or final splash paused midway plays the rest after resume; one already over stays put', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single]), finalRound('f1', withId(single, 'qf'))]);
    const intro = must(start(lobbyWithSplash(quiz, 'Анна'), T0));
    const round = must(resume(must(pause(intro, T0 + 1000)), T0 + 6000));
    expect(round.splash).toEqual({ kind: 'round', at: T0 + 5000, until: T0 + 7500 });
    expect(must(resume(must(pause(intro, T0 + 3000)), T0 + 6000)).splash).toEqual({ kind: 'round', at: T0, until: T0 + 2500 });

    let s = playOut(must(next(intro, T0, rng0)), T0 + 30_000);
    s = must(next(s, T1, rng0));
    expect(s.splash?.kind).toBe('final');
    const final = must(resume(must(pause(s, T1 + 3000)), T1 + 4000));
    expect(final.splash).toEqual({ kind: 'final', at: T1 + 1000, until: T1 + 4200 });
  });

  it('a cell flip paused midway delays the cell timer by the pause; an untimed cell too', () => {
    const quiz = makeRoundsQuiz([
      boardRound('b1', [{ title: 'Міста', cells: [withId(single, 'a1'), withId(withVideo(single), 'a2')] }], { check: 'manual' }),
    ]);
    const board = must(next(must(start(lobbyWithSplash(quiz, 'Анна', 'Богдан'))), T0 - 5000));
    const cell = must(pickCell(board, 'p1', 'a1', T0, rng0));
    const paused = must(pause(cell, T0 + 400));
    expect(paused.remainingMs).toBe(20_000);
    const resumed = must(resume(paused, T0 + 5400));
    expect(resumed.splash).toEqual({ kind: 'cell', at: T0 + 5000, until: T0 + 6000 });
    expect([resumed.startedAt, resumed.endsAt]).toEqual([T0 + 6000, T0 + 26_000]);

    const untimed = must(pickCell(board, 'p1', 'a2', T0, rng0));
    expect([untimed.startedAt, untimed.endsAt]).toEqual([T0 + 1000, null]);
    const back = must(resume(must(pause(untimed, T0 + 400)), T0 + 5400));
    expect(back.splash).toEqual({ kind: 'cell', at: T0 + 5000, until: T0 + 6000 });
    expect(back.startedAt).toBe(T0 + 6000);
  });

  it('buffs are blocked as «not started» during the splash, seen only with now', () => {
    const s = openAt(lobbyWithSplash(classicQuiz(true, ['fifty']), 'Анна', 'Богдан'), T0);
    expect(buffBlock(s, 'p1', 'fifty', T0 + 500)).toBe('not_started');
    expect(buffBlock(s, 'p1', 'fifty', T0 + 1200)).toBeNull();
    expect(buffBlock(must(pause(s, T0 + 500)), 'p1', 'fifty', T0 + 600)).toBe('paused');
  });
});
