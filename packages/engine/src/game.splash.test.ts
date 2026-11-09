import { AWAY_MS, blitzLeadMs, CELL_SURPRISE_MS, SPLASH_MS } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { awayEnd, awayStart } from './away';
import { buzz } from './blitz';
import { pickCell } from './board';
import { buffBlock, castVote, takeBuff } from './buffs';
import { setDebuff } from './debuffs';
import { answerDuel, declareDuel, pickDuelCategory } from './duel';
import { createGame, end, endRound, lock, next, pause, recordOf, resume, start, submitAnswer, tick, type GameState } from './game';
import { suspend } from './restore';
import { adjustTime, deadlineOf, overtimeOf } from './timing';
import { playerView, stageView } from './views';
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
/** Поле: a1 звичайна, a2 бліц, a3 бліц з ×2; Анна p1, Богдан p2; поле відкрито о T0 - 5000. */
const boardAt = (lobby: typeof lobbyWith) =>
  must(
    next(
      must(
        start(
          lobby(
            makeRoundsQuiz([
              boardRound(
                'b1',
                [
                  {
                    title: 'Міста',
                    cells: [
                      withId(single, 'a1'),
                      { question: withId(single, 'a2'), kind: 'blitz' },
                      { question: withId(single, 'a3'), kind: 'blitz', mark: 'x2' },
                    ],
                  },
                ],
                { check: 'manual' },
              ),
            ]),
            'Анна',
            'Богдан',
          ),
        ),
      ),
      T0 - 5000,
    ),
  );
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
    expect(s.splash).toEqual({ kind: 'question', at: T0, until: T0 + SPLASH_MS.question });
    expect(s.startedAt).toBe(T0 + SPLASH_MS.question);
    expect(s.endsAt).toBe(T0 + SPLASH_MS.question + 20_000);
  });

  it('nothing a player does counts before the start; an answer right at the start gets the full speed bonus', () => {
    let s = openAt(lobbyWithSplash(classicQuiz(true, ['fifty']), 'Анна', 'Богдан'), T0);
    expect(submitAnswer(s, 'p1', right, T0 + SPLASH_MS.question - 1)).toEqual({ ok: false, error: 'not_started' });
    expect(takeBuff(s, 'p1', 'fifty', T0 + 500, rng0)).toEqual({ ok: false, error: 'not_started' });
    s = must(submitAnswer(s, 'p1', right, T0 + SPLASH_MS.question));
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

  it('a board cell flips for 1 s before its timer', () => {
    // id клітинки — id її запитання (findCell у shared/quiz.ts).
    const s = must(pickCell(boardAt(lobbyWithSplash), 'p1', 'a1', T0, rng0));
    expect(s.splash).toEqual({ kind: 'cell', at: T0, until: T0 + SPLASH_MS.cell });
    expect([s.startedAt, s.endsAt]).toEqual([T0 + SPLASH_MS.cell, T0 + SPLASH_MS.cell + 20_000]);
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
    expect(f.splash).toEqual({ kind: 'question', at: T0, until: T0 + SPLASH_MS.question });
    expect([f.startedAt, f.endsAt]).toEqual([T0 + SPLASH_MS.question, T0 + SPLASH_MS.question + 20_000]);
    expect(submitAnswer(f, 'p1', right, T0 + 1000)).toEqual({ ok: false, error: 'not_started' });

    const v = video();
    expect([v.startedAt, v.endsAt]).toEqual([T0 + SPLASH_MS.question, null]);
    expect(submitAnswer(v, 'p1', right, T0 + 100)).toEqual({ ok: false, error: 'not_started' });
    expect(submitAnswer(v, 'p1', right, T0 + SPLASH_MS.question).ok).toBe(true);
  });

  it('pause during the splash freezes it; the rest plays after resume', () => {
    let s = must(pause(classic(), T0 + 500));
    // На паузі залишок — лише таймер запитання (не більше за ліміт); залишок заставки береться з неї самої.
    expect(s.remainingMs).toBe(20_000);
    s = must(resume(s, T0 + 10_500));
    expect([s.startedAt, s.endsAt]).toEqual([T0 + 10_000 + SPLASH_MS.question, T0 + 10_000 + SPLASH_MS.question + 20_000]);
    expect(s.splash).toEqual({ kind: 'question', at: T0 + 10_000, until: T0 + 10_000 + SPLASH_MS.question });
    expect(submitAnswer(s, 'p1', right, T0 + 10_000 + SPLASH_MS.question - 100)).toEqual({ ok: false, error: 'not_started' });
    expect(recordOf(must(submitAnswer(s, 'p1', right, T0 + 10_000 + SPLASH_MS.question)), 0, 'p1')?.timeMs).toBe(0);

    // Без таймера: startedAt і кінець заставки зсуваються однаково.
    const v = must(resume(must(pause(video(), T0 + 500)), T0 + 10_500));
    expect(v.startedAt).toBe(T0 + 10_000 + SPLASH_MS.question);
    expect(v.splash).toEqual({ kind: 'question', at: T0 + 10_000, until: T0 + 10_000 + SPLASH_MS.question });

    // Пауза після кінця заставки: заставка лишається на місці, годинник зсувається як завжди.
    const late = must(resume(must(pause(classic(), T0 + 5000)), T0 + 6000));
    expect(late.splash).toEqual({ kind: 'question', at: T0, until: T0 + SPLASH_MS.question });
    expect([late.startedAt, late.endsAt]).toEqual([T0 + SPLASH_MS.question + 1000, T0 + SPLASH_MS.question + 21_000]);
  });

  it('±15 s during the splash counts from the question start', () => {
    const plus = must(adjustTime(classic(), 15, T0 + 100));
    expect([plus.startedAt, plus.endsAt, plus.plays[0].extraMs]).toEqual([T0 + SPLASH_MS.question, T0 + SPLASH_MS.question + 35_000, 15_000]);
    const minus = must(adjustTime(classic(), -15, T0 + 100));
    expect([minus.startedAt, minus.endsAt, minus.plays[0].extraMs]).toEqual([T0 + SPLASH_MS.question, T0 + SPLASH_MS.question + 5000, -15_000]);
  });

  it('the host can close the question during the splash; tick waits for endsAt', () => {
    expect(must(lock(classic())).phase).toBe('locked');
    expect(tick(classic(), T0 + SPLASH_MS.question + 20_000 - 1).phase).toBe('question');
    expect(tick(classic(), T0 + SPLASH_MS.question + 20_000).phase).toBe('locked');
  });

  it('debuffs fire at the question start', () => {
    const lobby = lobbyWithSplash(classicQuiz(), 'Анна', 'Богдан');
    const intro = must(start(lobby));
    const s = must(next(must(setDebuff(intro, 'p1', 'fog')), T0, rng0));
    expect(s.debuffs.p1).toMatchObject({ firedAt: 0, since: T0 + SPLASH_MS.question });
  });

  it('a pause during the splash shifts a fired debuff with the question start', () => {
    const intro = must(start(lobbyWithSplash(classicQuiz(), 'Анна', 'Богдан')));
    const s = must(next(must(setDebuff(intro, 'p1', 'fog')), T0, rng0));
    const resumed = must(resume(must(pause(s, T0 + 500)), T0 + 10_500));
    expect(resumed.debuffs.p1).toMatchObject({ firedAt: 0, since: T0 + 10_000 + SPLASH_MS.question });
    expect(resumed.debuffs.p1.since).toBe(resumed.startedAt);
    // Без таймера (відео) — так само.
    const videoIntro = must(start(lobbyWithSplash(makeRoundsQuiz([classicRound('r1', [withVideo(single)])]), 'Анна', 'Богдан')));
    const v = must(next(must(setDebuff(videoIntro, 'p1', 'fog')), T0, rng0));
    const vr = must(resume(must(pause(v, T0 + 500)), T0 + 10_500));
    expect(vr.debuffs.p1.since).toBe(T0 + 10_000 + SPLASH_MS.question);
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
    expect(overtimeOf(s.plays[0], 'p3')).toBe(4000 - SPLASH_MS.question);
    expect(deadlineOf(s, s.plays[0], 'p3')).toBe(T0 + 24_000);

    // Додатковий час — на класиці з бафом time: особистий кінець від endsAt, що вже враховує заставку.
    const timeQuiz = makeRoundsQuiz([classicRound('r1', [single])], { buffs: ['time'] });
    let t = openAt(lobbyWithSplash(timeQuiz, 'Оля', 'Петро'), T0);
    expect(takeBuff(t, 'p1', 'time', T0 + SPLASH_MS.question - 1, rng0)).toEqual({ ok: false, error: 'not_started' });
    t = must(takeBuff(t, 'p1', 'time', T0 + 5000, rng0));
    expect(deadlineOf(t, t.plays[0], 'p1')).toBe(T0 + SPLASH_MS.question + 50_000);
    expect(deadlineOf(t, t.plays[0], 'p2')).toBe(T0 + SPLASH_MS.question + 20_000);
  });
});

describe('the «БЛІЦ!» splash before a board blitz cell (26a)', () => {
  /** Після перегортання клітинки — кінець заставки й старт запитання. */
  const START = T1 + SPLASH_MS.cell + SPLASH_MS.blitz;
  const blitzAt = (lobby: typeof lobbyWith = lobbyWithSplash, cellId = 'a2') => must(pickCell(boardAt(lobby), null, cellId, T1, rng0));

  it('a blitz cell flips, then «БЛІЦ!» stands 3 s; its timer starts after both', () => {
    let s = blitzAt();
    expect(SPLASH_MS.blitz).toBe(3000);
    expect(s.splash).toEqual({ kind: 'blitz', at: T1, until: T1 + SPLASH_MS.cell + 3000 });
    expect([s.startedAt, s.endsAt]).toEqual([T1 + SPLASH_MS.cell + 3000, T1 + SPLASH_MS.cell + 3000 + 20_000]);
    expect(buzz(s, 'p1', T1 + SPLASH_MS.cell + 2999)).toEqual({ ok: false, error: 'not_started' });
    s = must(buzz(s, 'p1', T1 + SPLASH_MS.cell + 3000));
    expect(s.plays[s.questionIndex].blitz?.queue[0]).toMatchObject({ playerId: 'p1', timeMs: 0 });
    expect(blitzLeadMs(s.splash!)).toBe(SPLASH_MS.cell);
  });

  it('a marked blitz cell waits for the «×2!» stamp before «БЛІЦ!»', () => {
    const s = blitzAt(lobbyWithSplash, 'a3');
    expect(s.plays[s.questionIndex].board?.multiplier).toBe(2);
    expect(s.splash!.until - s.splash!.at).toBe(SPLASH_MS.cell + CELL_SURPRISE_MS + 3000);
    expect(blitzLeadMs(s.splash!)).toBe(SPLASH_MS.cell + CELL_SURPRISE_MS);
  });

  it('without transitions a blitz cell still gets «БЛІЦ!» 3 s, without the flip', () => {
    const board = boardAt(lobbyWith);
    const s = must(pickCell(board, null, 'a2', T0, rng0));
    expect(s.splash).toEqual({ kind: 'blitz', at: T0, until: T0 + 3000 });
    expect(s.startedAt).toBe(T0 + 3000);
    expect(blitzLeadMs(s.splash!)).toBe(0);
    expect(buzz(s, 'p1', T0 + 2999)).toEqual({ ok: false, error: 'not_started' });
    // Звичайна клітинка в тій самій грі — як і була.
    const plain = must(pickCell(board, 'p1', 'a1', T0, rng0));
    expect(plain.splash).toBeNull();
    expect(plain.startedAt).toBe(T0);
  });

  it('a blitz splash paused midway shifts the question start by the pause', () => {
    const s = blitzAt();
    const resumed = must(resume(must(pause(s, T1 + 2000)), T1 + 12_000));
    expect(resumed.splash).toEqual({ kind: 'blitz', at: T1 + 10_000, until: s.splash!.until + 10_000 });
    expect(resumed.startedAt).toBe(s.startedAt! + 10_000);
    expect(resumed.endsAt! - resumed.startedAt!).toBe(20_000);
    expect(blitzLeadMs(resumed.splash!)).toBe(SPLASH_MS.cell);
  });

  it('a room saved mid-blitz-splash restores with the rest of the splash before the timer', () => {
    const saved = suspend(blitzAt(), T1 + 1000);
    const back = must(resume(saved, T1 + 60_000));
    expect(back.startedAt).toBe(T1 + 60_000 + (SPLASH_MS.cell + 3000 - 1000));
    expect(back.endsAt! - back.startedAt!).toBe(20_000);
  });

  it('the host can close a blitz cell during «БЛІЦ!»', () => {
    const s = blitzAt();
    const closed = must(lock(s, T1 + 2000));
    expect(closed.phase).not.toBe('question');
    expect(tick(closed, s.endsAt!).phase).toBe(closed.phase);
    expect(tick(closed, s.endsAt! + 1).phase).toBe(closed.phase);
    expect(stageView(closed).splash).toBeNull();
    expect(playerView(closed, 'p1')?.splash).toBeNull();
  });

  it('a player hidden during «БЛІЦ!» is not away before the question starts', () => {
    const s = blitzAt();
    const hidden = awayStart(s, 'p1', T1 + 2000);
    expect(hidden.plays[hidden.questionIndex].away?.p1).toEqual({ ms: 0, count: 0, since: START + AWAY_MS.preGrace });
    // Повернулася до старту запитання — нічого не пораховано.
    expect(awayEnd(hidden, 'p1', START - 100).plays[hidden.questionIndex].away?.p1).toEqual({ ms: 0, count: 0, since: null });
  });

  it('the view shows the blitz splash in the question phase', () => {
    const s = blitzAt();
    expect(s.phase).toBe('question');
    expect(stageView(s).splash).toEqual({ kind: 'blitz', at: T1, until: START });
    expect(playerView(s, 'p1')?.splash?.kind).toBe('blitz');
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
    expect(s.splash).toEqual({ kind: 'round', at: T0, until: T0 + SPLASH_MS.round });
    s = must(next(s, T0 + 500, rng0)); // «Почати раунд» посеред заставки раунду
    expect(s.splash).toEqual({ kind: 'question', at: T0 + 500, until: T0 + 500 + SPLASH_MS.question });
    s = playOut(s, T0 + 30_000);
    expect(s.phase).toBe('round_end');
    s = must(next(s, T1, rng0));
    expect(s.phase).toBe('intro');
    expect(s.splash).toEqual({ kind: 'round', at: T1, until: T1 + SPLASH_MS.round });
  });

  it('the final gets its own longer splash', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single]), finalRound('f1', withId(single, 'qf'))]);
    let s = playOut(must(next(must(start(lobbyWithSplash(quiz, 'Анна'), T0)), T0, rng0)), T0 + 30_000);
    s = must(next(s, T1, rng0));
    expect(s.phase).toBe('intro');
    expect(s.splash).toEqual({ kind: 'final', at: T1, until: T1 + SPLASH_MS.final });
    s = must(next(s, T1 + 5000, rng0));
    expect(s.phase).toBe('wager');
    s = must(next(s, T1 + 10_000, rng0));
    expect(s.splash).toEqual({ kind: 'question', at: T1 + 10_000, until: T1 + 10_000 + SPLASH_MS.question });
    expect(s.startedAt).toBe(T1 + 10_000 + SPLASH_MS.question);
  });

  it('the last round ends with «Підсумки» before the podium, also on an early end', () => {
    const one = () => must(next(must(start(lobbyWithSplash(makeRoundsQuiz([classicRound('r1', [single])]), 'Анна'), T0)), T0, rng0));
    let s = must(next(must(lock(one())), T0 + 30_000, rng0)); // reveal
    expect(s.phase).toBe('reveal');
    s = must(next(s, T1, rng0));
    expect(s.phase).toBe('finished');
    expect(s.splash).toEqual({ kind: 'podium', at: T1, until: T1 + SPLASH_MS.podium });

    const early = must(endRound(one(), T1));
    expect([early.phase, early.splash]).toEqual(['finished', { kind: 'podium', at: T1, until: T1 + SPLASH_MS.podium }]);
    const ended = must(end(one(), T1));
    expect([ended.phase, ended.splash]).toEqual(['finished', { kind: 'podium', at: T1, until: T1 + SPLASH_MS.podium }]);
    expect(must(end(one())).splash).toEqual({ kind: 'question', at: T0, until: T0 + SPLASH_MS.question });

    // Підсумки раунду заставки не мають; endRound не в останньому раунді — теж.
    const two = makeRoundsQuiz([classicRound('r1', [single]), classicRound('r2', [withId(single, 'q2')])]);
    const first = must(next(must(start(lobbyWithSplash(two, 'Анна'), T0)), T0, rng0));
    const roundEnd = playOut(first, T0 + 30_000);
    expect(roundEnd.phase).toBe('round_end');
    expect(roundEnd.splash).toEqual({ kind: 'question', at: T0, until: T0 + SPLASH_MS.question });
    expect(must(endRound(first, T1)).splash).toEqual({ kind: 'question', at: T0, until: T0 + SPLASH_MS.question });
  });

  it('a duel starts with «Дуель!»', () => {
    const declared = must(declareDuel(on(toDeclarable()), 'p1', 'p2'));
    const s = must(next(declared, T0 + 4000, rng0));
    expect(s.phase).toBe('duel');
    expect(s.splash).toEqual({ kind: 'duel', at: T0 + 4000, until: T0 + 4000 + SPLASH_MS.duel });
  });

  it('a duel category picked during the splash starts the duel clock after it', () => {
    const started = must(next(must(declareDuel(on(toDeclarable()), 'p1', 'p2')), T0 + 4000, rng0));
    const early = must(pickDuelCategory(started, null, 'dc1', T0 + 4500, rng0));
    expect([early.startedAt, early.endsAt]).toEqual([T0 + 4000 + SPLASH_MS.duel, T0 + 4000 + SPLASH_MS.duel + 20_000]);
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
    expect([resumed.startedAt, resumed.endsAt]).toEqual([T0 + 10_000 + SPLASH_MS.question, T0 + 10_000 + SPLASH_MS.question + 5000]);
  });

  it('a duel question paused during the «Дуель!» splash keeps its full time', () => {
    const started = must(next(must(declareDuel(on(toDeclarable()), 'p1', 'p2')), T0 + 4000, rng0));
    const early = must(pickDuelCategory(started, null, 'dc1', T0 + 4500, rng0));
    const paused = must(pause(early, T0 + 5000));
    expect(paused.remainingMs).toBe(20_000);
    const resumed = must(resume(paused, T0 + 15_000));
    expect([resumed.startedAt, resumed.endsAt]).toEqual([T0 + 14_000 + SPLASH_MS.duel, T0 + 14_000 + SPLASH_MS.duel + 20_000]);
    expect(resumed.splash).toEqual({ kind: 'duel', at: T0 + 14_000, until: T0 + 14_000 + SPLASH_MS.duel });
  });

  it('a round or final splash paused midway plays the rest after resume; one already over stays put', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single]), finalRound('f1', withId(single, 'qf'))]);
    const intro = must(start(lobbyWithSplash(quiz, 'Анна'), T0));
    const round = must(resume(must(pause(intro, T0 + 1000)), T0 + 6000));
    expect(round.splash).toEqual({ kind: 'round', at: T0 + 5000, until: T0 + 5000 + SPLASH_MS.round });
    expect(must(resume(must(pause(intro, T0 + SPLASH_MS.round + 500)), T0 + 6000)).splash).toEqual({ kind: 'round', at: T0, until: T0 + SPLASH_MS.round });

    let s = playOut(must(next(intro, T0, rng0)), T0 + 30_000);
    s = must(next(s, T1, rng0));
    expect(s.splash?.kind).toBe('final');
    const final = must(resume(must(pause(s, T1 + 3000)), T1 + 4000));
    expect(final.splash).toEqual({ kind: 'final', at: T1 + 1000, until: T1 + 1000 + SPLASH_MS.final });
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
    expect(resumed.splash).toEqual({ kind: 'cell', at: T0 + 5000, until: T0 + 5000 + SPLASH_MS.cell });
    expect([resumed.startedAt, resumed.endsAt]).toEqual([T0 + 5000 + SPLASH_MS.cell, T0 + 5000 + SPLASH_MS.cell + 20_000]);

    const untimed = must(pickCell(board, 'p1', 'a2', T0, rng0));
    expect([untimed.startedAt, untimed.endsAt]).toEqual([T0 + SPLASH_MS.cell, null]);
    const back = must(resume(must(pause(untimed, T0 + 400)), T0 + 5400));
    expect(back.splash).toEqual({ kind: 'cell', at: T0 + 5000, until: T0 + 5000 + SPLASH_MS.cell });
    expect(back.startedAt).toBe(T0 + 5000 + SPLASH_MS.cell);
  });

  it('buffs are blocked as «not started» during the splash, seen only with now', () => {
    const s = openAt(lobbyWithSplash(classicQuiz(true, ['fifty']), 'Анна', 'Богдан'), T0);
    expect(buffBlock(s, 'p1', 'fifty', T0 + 500)).toBe('not_started');
    expect(buffBlock(s, 'p1', 'fifty', T0 + SPLASH_MS.question)).toBeNull();
    expect(buffBlock(must(pause(s, T0 + 500)), 'p1', 'fifty', T0 + 600)).toBe('paused');
  });
});
