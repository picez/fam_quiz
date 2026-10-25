import { describe, expect, it } from 'vitest';
import { PACE_MS, SPLASH_MS, type Answer } from '@quiz/shared';
import { skipTurn } from './board';
import { bluffOrder, bluffPlayOf, writeLie } from './bluff';
import { answerDuel, declareDuel, duelQuestionOf, pickDuelCategory } from './duel';
import { endRound, lock, next, pause, resume, skipGuide, start, submitAnswer, tick, type GameState, type Result } from './game';
import { decisionPending } from './ladder';
import { paceWindow, stamp, stepKey, tooSoon } from './pacing';
import { revealSurveyAll } from './survey';
import { trialOpen } from './survival';
import { decisionOpen } from './wipeout';
import { T0 } from './testing/buffs';
import { toDeclarable } from './testing/duel';
import {
  bluff,
  boardRound,
  classicRound,
  finalRound,
  LADDER_RIGHT,
  ladderRound,
  makeRoundsQuiz,
  single,
  survey,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  wipeoutLadder,
  wipeoutRound,
  withId,
} from './testing/fixtures';
import { lobbyWith, lobbyWithGuide, lobbyWithSplash, must } from './testing/helpers';

const rng0 = () => 0;
/** Крок рушія, як його проводить сервер з pacing: результат через stamp на ту саму мить. */
const go = (prev: GameState, result: Result, now: number) => stamp(prev, must(result), now);
const win = (from: number, ms: number) => ({ from, until: from + ms });
const RIGHT: Answer = { type: 'single', optionId: 'b' };

const quiz2 = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q1b')]), classicRound('r2', [withId(single, 'q2a')])], { leaderboard: 'each' });

/** «Почати гру» на T0 через stamp: етап intro з stepAt = T0. */
const started = () => {
  const lobby = lobbyWith(quiz2, 'Оля', 'Петро');
  return go(lobby, start(lobby, T0), T0);
};

describe('pacing: the moment of the step', () => {
  it('no stepAt — no limit', () => {
    const lobby = lobbyWith(quiz2, 'Оля', 'Петро');
    expect('stepAt' in lobby).toBe(false);
    expect(paceWindow(lobby, 'next')).toBeNull();
    expect(paceWindow(lobby, 'lock')).toBeNull();
    expect(paceWindow(lobby, 'skip')).toBeNull();
    const plain = must(start(lobby, T0));
    expect(paceWindow(plain, 'next')).toBeNull();
    expect(tooSoon(plain, 'next', T0)).toBe(false);
  });

  it('stamp sets stepAt only when the step changes', () => {
    const s = started();
    expect(s.phase).toBe('intro');
    expect(s.stepAt).toBe(T0);
    expect(stamp(s, { ...s, players: [...s.players] }, T0 + 500).stepAt).toBe(T0);
    expect(stamp(s, s, T0 + 500)).toBe(s);
    const lobby = lobbyWith(quiz2, 'Оля', 'Петро');
    expect('stepAt' in stamp(lobby, { ...lobby, players: [...lobby.players] }, T0)).toBe(false);
  });

  it('the step key ignores pause, clocks and the splash', () => {
    const s = started();
    expect(stepKey({ ...s, paused: true, pausedAt: T0, remainingMs: 5, endsAt: T0 + 9, splash: { kind: 'round', at: T0, until: T0 + 1 } })).toBe(stepKey(s));
  });
});

describe('pacing: windows', () => {
  it('intro without transitions: 3 s from the step', () => {
    const s = started();
    expect(paceWindow(s, 'next')).toEqual(win(T0, PACE_MS.intro));
    expect(PACE_MS.intro).toBe(3000);
    expect(tooSoon(s, 'next', T0 + 2999)).toBe(true);
    expect(tooSoon(s, 'next', T0 + 3000)).toBe(false);
  });

  it('a question: next is not paced, early close 3 s after the start; an answer keeps the stamp', () => {
    const s = started();
    const q = go(s, next(s, T0 + 3000), T0 + 3000);
    expect(q.phase).toBe('question');
    expect(q.stepAt).toBe(T0 + 3000);
    expect(paceWindow(q, 'next')).toBeNull();
    expect(paceWindow(q, 'lock')).toEqual({ from: T0 + 3000, until: T0 + 6000 });
    const answered = go(q, submitAnswer(q, 'p1', RIGHT, T0 + 4000), T0 + 4000);
    expect(answered.stepAt).toBe(T0 + 3000);
  });

  it('pause and resume keep the stamp; the close window moves with startedAt', () => {
    const s = started();
    const q = go(s, next(s, T0 + 3000), T0 + 3000);
    const p = go(q, pause(q, T0 + 4000), T0 + 4000);
    expect(p.stepAt).toBe(T0 + 3000);
    const r = go(p, resume(p, T0 + 14_000), T0 + 14_000);
    expect(r.stepAt).toBe(T0 + 3000);
    expect(paceWindow(r, 'lock')).toEqual({ from: T0 + 13_000, until: T0 + 16_000 });
  });

  it('locked is not paced, reveal and leaderboard 2 s', () => {
    const s = started();
    const q = go(s, next(s, T0 + 3000), T0 + 3000);
    const locked = go(q, lock(q, T0 + 6000), T0 + 6000);
    expect(locked.phase).toBe('locked');
    expect(paceWindow(locked, 'next')).toBeNull();
    const reveal = go(locked, next(locked, T0 + 7000), T0 + 7000);
    expect(reveal.phase).toBe('reveal');
    expect(paceWindow(reveal, 'next')).toEqual({ from: T0 + 7000, until: T0 + 9000 });
    const board = go(reveal, next(reveal, T0 + 9000), T0 + 9000);
    expect(board.phase).toBe('leaderboard');
    expect(paceWindow(board, 'next')).toEqual({ from: T0 + 9000, until: T0 + 11_000 });
    expect(paceWindow(board, 'lock')).toBeNull();
    expect(paceWindow(board, 'skip')).toBeNull();
  });

  it('round end 2 s, the next round intro 3 s', () => {
    const s = started();
    const q = go(s, next(s, T0 + 3000), T0 + 3000);
    const roundEnd = go(q, endRound(q, T0 + 20_000), T0 + 20_000);
    expect(roundEnd.phase).toBe('round_end');
    expect(paceWindow(roundEnd, 'next')).toEqual({ from: T0 + 20_000, until: T0 + 22_000 });
    const intro = go(roundEnd, next(roundEnd, T0 + 22_000), T0 + 22_000);
    expect(intro).toMatchObject({ phase: 'intro', roundIndex: 1 });
    expect(paceWindow(intro, 'next')).toEqual({ from: T0 + 22_000, until: T0 + 25_000 });
  });

  it('intro with a round splash: 3 s after the splash ends; the question close window starts after its splash', () => {
    const lobby = lobbyWithSplash(quiz2, 'Оля', 'Петро');
    const s = go(lobby, start(lobby, T0), T0);
    expect(paceWindow(s, 'next')).toEqual({ from: T0 + SPLASH_MS.round, until: T0 + SPLASH_MS.round + PACE_MS.intro });
    const T1 = T0 + SPLASH_MS.round + PACE_MS.intro;
    expect(tooSoon(s, 'next', T1 - 1)).toBe(true);
    const q = go(s, next(s, T1), T1);
    expect(q.phase).toBe('question');
    expect(paceWindow(q, 'lock')).toEqual({ from: T1 + SPLASH_MS.question, until: T1 + SPLASH_MS.question + PACE_MS.lock });
  });

  it('final intro: 3 s after the final splash', () => {
    const lobby = lobbyWithSplash(makeRoundsQuiz([finalRound('f', withId(single, 'f1'))]), 'Оля', 'Петро');
    const s = go(lobby, start(lobby, T0), T0);
    expect(s.splash?.kind).toBe('final');
    expect(paceWindow(s, 'next')).toEqual({ from: T0 + SPLASH_MS.final, until: T0 + SPLASH_MS.final + PACE_MS.intro });
  });

  it('guide pages: 2 s each; «До гри» stamps the intro', () => {
    const lobby = lobbyWithGuide(quiz2, 'Оля', 'Петро');
    const s = go(lobby, start(lobby, T0), T0);
    expect(s.phase).toBe('guide');
    expect(paceWindow(s, 'next')).toEqual({ from: T0, until: T0 + 2000 });
    const page = go(s, next(s, T0 + 2000), T0 + 2000);
    expect(page).toMatchObject({ phase: 'guide', guidePage: 1, stepAt: T0 + 2000 });
    const intro = go(page, skipGuide(page, T0 + 2100), T0 + 2100);
    expect(intro).toMatchObject({ phase: 'intro', stepAt: T0 + 2100 });
  });

  it('«100 до 1»: 2 s to the first row, 1 s per next row, 2 s after the last; «Відкрити всі» stamps', () => {
    const lobby = lobbyWith(makeRoundsQuiz([classicRound('r1', [survey])]), 'Оля', 'Петро');
    let s = go(lobby, start(lobby, T0), T0);
    s = go(s, next(s, T0 + 3000), T0 + 3000);
    s = go(s, submitAnswer(s, 'p1', { type: 'survey', values: ['Яблуко'] }, T0 + 4000), T0 + 4000);
    s = go(s, lock(s, T0 + 5000), T0 + 5000);
    const R = T0 + 6000;
    s = go(s, next(s, R), R);
    expect(s.phase).toBe('reveal');
    expect(s.plays[0].survey?.shown).toBe(0);
    expect(paceWindow(s, 'next')).toEqual({ from: R, until: R + 2000 });
    s = go(s, next(s, R + 2000), R + 2000);
    expect(s.plays[0].survey?.shown).toBe(1);
    expect(paceWindow(s, 'next')).toEqual({ from: R + 2000, until: R + 3000 });
    const one = s;
    s = go(s, next(s, R + 3000), R + 3000);
    expect(s.plays[0].survey?.shown).toBe(2);
    expect(paceWindow(s, 'next')).toEqual({ from: R + 3000, until: R + 4000 });
    let t = R + 3000;
    for (let i = 0; i < 3; i += 1) {
      t += 1000;
      s = go(s, next(s, t), t);
    }
    expect(s.plays[0].survey?.shown).toBe(survey.rows.length);
    expect(paceWindow(s, 'next')).toEqual({ from: t, until: t + 2000 });
    const all = go(one, revealSurveyAll(one), R + 2500);
    expect(all.plays[0].survey?.shown).toBe(survey.rows.length);
    expect(all.stepAt).toBe(R + 2500);
    expect(paceWindow(all, 'next')).toEqual({ from: R + 2500, until: R + 4500 });
  });

  it('bluff: close windows from each phase start, the reveal paced by option like «100 до 1»', () => {
    const lobby = lobbyWith(makeRoundsQuiz([classicRound('r1', [bluff, single])]), 'Оля', 'Петро', 'Віра');
    let s = go(lobby, start(lobby, T0), T0);
    s = go(s, next(s, T0 + 3000, rng0), T0 + 3000);
    expect(s.plays[0].bluff?.stage).toBe('lies');
    expect(paceWindow(s, 'lock')).toEqual({ from: T0 + 3000, until: T0 + 6000 });
    s = go(s, writeLie(s, 'p1', 'Рим', T0 + 4000), T0 + 4000);
    s = go(s, writeLie(s, 'p2', 'Мілан', T0 + 4500), T0 + 4500);
    s = go(s, lock(s, T0 + 7000), T0 + 7000);
    expect(s.plays[0].bluff?.stage).toBe('choice');
    expect(s.stepAt).toBe(T0 + 7000);
    expect(s.startedAt).not.toBeNull();
    expect(paceWindow(s, 'lock')).toEqual({ from: s.startedAt, until: (s.startedAt ?? 0) + 3000 });
    s = go(s, lock(s, T0 + 12_000), T0 + 12_000);
    expect(s.phase).toBe('locked');
    const R = T0 + 13_000;
    s = go(s, next(s, R), R);
    expect(s.phase).toBe('reveal');
    expect(paceWindow(s, 'next')).toEqual({ from: R, until: R + 2000 });
    const total = bluffOrder(bluffPlayOf(s)!).length;
    expect(total).toBeGreaterThan(2);
    let t = R;
    for (let shown = 1; shown < total; shown += 1) {
      t += 1000;
      s = go(s, next(s, t), t);
      expect(s.plays[0].bluff?.shown).toBe(shown);
      expect(paceWindow(s, 'next')).toEqual({ from: t, until: t + 1000 });
    }
    t += 1000;
    s = go(s, next(s, t), t);
    expect(s.plays[0].bluff?.shown).toBe(total);
    expect(paceWindow(s, 'next')).toEqual({ from: t, until: t + 2000 });
  });

  it('board: skip 2 s from the step, next is not paced; a skip stamps', () => {
    const field = boardRound('g1', [
      { title: 'Міста', cells: [withId(single, 'c11'), withId(single, 'c12')] },
      { title: 'Річки', cells: [withId(single, 'c21'), withId(single, 'c22')] },
    ]);
    const lobby = lobbyWith(makeRoundsQuiz([field]), 'Анна', 'Богдан', 'Віра');
    let s = go(lobby, start(lobby, T0), T0);
    const t = T0 + 3000;
    s = go(s, next(s, t), t);
    expect(s.phase).toBe('board');
    expect(paceWindow(s, 'skip')).toEqual({ from: t, until: t + 2000 });
    expect(paceWindow(s, 'next')).toBeNull();
    const skipped = go(s, skipTurn(s, t + 2000), t + 2000);
    expect(skipped.board?.done).not.toBe(s.board?.done);
    expect(skipped.stepAt).toBe(t + 2000);
  });

  it('duel: the answer stage is not paced, «Продовжити гру» from the result 2 s', () => {
    const declared = must(declareDuel(toDeclarable(), 'p1', 'p2'));
    let s = go(declared, next(declared, T0 + 4000, rng0), T0 + 4000);
    let t = T0 + 5000;
    s = go(s, pickDuelCategory(s, 'p1', 'dc1', t, rng0), t);
    let sawAnswer = false;
    while (s.duel?.stage !== 'result') {
      t += 1000;
      s = go(s, answerDuel(s, s.duel?.challengerId ?? '', duelQuestionOf(s)?.accepted[0] ?? '', t), t);
      expect(s.duel?.stage).toBe('answer');
      expect(paceWindow(s, 'next')).toBeNull();
      sawAnswer = true;
      t += 1000;
      s = go(s, next(s, t, rng0), t);
    }
    expect(sawAnswer).toBe(true);
    expect(paceWindow(s, 'next')).toEqual({ from: t, until: t + 2000 });
  });

  it('survival: an open trial 3 s from its start, after the close a new stamp and 2 s', () => {
    const lobby = lobbyWith(makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials), classicRound('r2', [single])]), 'Оля', 'Петро', 'Віра', 'Гліб');
    let s = go(lobby, start(lobby, T0), T0);
    s = go(s, next(s, T0 + 3000, rng0), T0 + 3000);
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      s = go(s, submitAnswer(s, id, id === 'p2' || id === 'p3' ? { type: 'single', optionId: 'a' } : RIGHT, T0 + 4000), T0 + 4000);
    }
    expect(s.phase).toBe('locked');
    s = go(s, next(s, T0 + 4500, rng0), T0 + 4500);
    s = go(s, next(s, T0 + 5000, rng0), T0 + 5000);
    expect(trialOpen(s)).toBe(true);
    const from = s.startedAt ?? s.stepAt ?? 0;
    expect(paceWindow(s, 'next')).toEqual({ from, until: from + 3000 });
    const closed = go(s, next(s, T0 + 9000, rng0), T0 + 9000);
    expect(closed.plays[closed.questionIndex].survival?.trial?.stage).toBe('closed');
    expect(closed.stepAt).toBe(T0 + 9000);
    expect(paceWindow(closed, 'next')).toEqual({ from: T0 + 9000, until: T0 + 11_000 });
  });

  it('«Ва-банк»: no window while the decision is open; its end by tick stamps and gives 2 s', () => {
    const lobby = lobbyWith(makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder)]), 'Оля', 'Петро');
    let s = go(lobby, start(lobby, T0), T0);
    s = go(s, next(s, T0 + 3000, rng0), T0 + 3000);
    s = go(s, submitAnswer(s, 'p1', RIGHT, T0 + 4000), T0 + 4000);
    s = go(s, submitAnswer(s, 'p2', RIGHT, T0 + 4000), T0 + 4000);
    s = go(s, next(s, T0 + 5000, rng0), T0 + 5000);
    expect(s.phase).toBe('reveal');
    s = go(s, next(s, T0 + 6000, rng0), T0 + 6000);
    expect(decisionOpen(s)).toBe(true);
    expect(paceWindow(s, 'next')).toBeNull();
    const endsAt = s.endsAt ?? 0;
    const ended = stamp(s, tick(s, endsAt), endsAt);
    expect(decisionOpen(ended)).toBe(false);
    expect(ended.stepAt).toBe(endsAt);
    expect(paceWindow(ended, 'next')).toEqual({ from: endsAt, until: endsAt + 2000 });
  });

  it('«Мільйонер»: the draw stamps the intro, a pending decision has no window', () => {
    const lobby = lobbyWith(makeRoundsQuiz([ladderRound('rl', undefined, { pick: 'random' })]), 'Оля', 'Петро');
    let s = go(lobby, start(lobby, T0), T0);
    expect(s.ladder?.contestantId ?? null).toBeNull();
    s = go(s, next(s, T0 + 3000, rng0), T0 + 3000);
    expect(s.phase).toBe('intro');
    expect(s.ladder?.contestantId).not.toBeNull();
    expect(s.stepAt).toBe(T0 + 3000);
    expect(paceWindow(s, 'next')).toEqual({ from: T0 + 3000, until: T0 + 6000 });
    s = go(s, next(s, T0 + 6000, rng0), T0 + 6000);
    expect(s.phase).toBe('question');
    s = go(s, submitAnswer(s, 'p1', LADDER_RIGHT[0], T0 + 7000), T0 + 7000);
    s = go(s, submitAnswer(s, 'p2', LADDER_RIGHT[0], T0 + 7000), T0 + 7000);
    if (s.phase === 'question') s = go(s, lock(s, T0 + 7500), T0 + 7500);
    s = go(s, next(s, T0 + 8000, rng0), T0 + 8000);
    expect(s.phase).toBe('reveal');
    s = go(s, next(s, T0 + 10_000, rng0), T0 + 10_000);
    expect(decisionPending(s)).toBe(true);
    expect(paceWindow(s, 'next')).toBeNull();
  });

  it('a state from before 11b (no stepAt) has no windows', () => {
    const s = started();
    const q = go(s, next(s, T0 + 3000), T0 + 3000);
    const lobby = lobbyWith(makeRoundsQuiz([boardRound('g1', [{ title: 'A', cells: [single] }])]), 'Анна');
    const intro = go(lobby, start(lobby, T0), T0);
    const onBoard = go(intro, next(intro, T0 + 1000), T0 + 1000);
    expect(onBoard.phase).toBe('board');
    for (const state of [s, q, onBoard]) {
      const { stepAt: _, ...old } = state;
      expect(paceWindow(old, 'next')).toBeNull();
      expect(paceWindow(old, 'lock')).toBeNull();
      expect(paceWindow(old, 'skip')).toBeNull();
    }
  });
});
