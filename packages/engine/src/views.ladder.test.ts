import { describe, expect, it } from 'vitest';
import type { Answer, Question, Round } from '@quiz/shared';
import { giveHint } from './buffs';
import { lock, next, pause, setConnected, start, submitAnswer, tick, type GameState } from './game';
import { decideLadder, ladderPlayOf, pickContestant, useLifeline } from './ladder';
import { classicRound, ladderQuestions, ladderRound, LADDER_RIGHT, LADDER_WRONG, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const rng = () => 0;
const T = 10_000;
const opt = (optionId: string): Answer => ({ type: 'single', optionId });
type LadderOptions = Parameters<typeof ladderRound>[2];

const phone = (s: GameState, id: string) => {
  const view = playerView(s, id);
  if (view === null) throw new Error('no view');
  return view;
};
const ladderOf = (s: GameState) => {
  const info = stageView(s).ladder;
  if (info === null) throw new Error('no ladder');
  return info;
};

function intro(options: LadderOptions = {}, questions: Question[] = ladderQuestions, extra: Round[] = [classicRound('r2', [withId(single, 'q2')])]): GameState {
  return must(start(lobbyWith(makeRoundsQuiz([ladderRound('rl', questions, options), ...extra]), 'Оля', 'Петро', 'Віра')));
}

/** Петро (p2) — учасник; l1 відкрито о T. Глядачі: Оля (p1), Віра (p3). */
function climb(options: LadderOptions = {}, questions: Question[] = ladderQuestions): GameState {
  return must(next(must(pickContestant(intro(options, questions), 'p2')), T, rng));
}

/** Закрито, розкрито, сторінка драбини. */
function toReveal(s: GameState): GameState {
  return must(next(s.phase === 'question' ? must(lock(s)) : s, T + 5000, rng));
}

describe('ladder views', () => {
  it('the intro shows the ladder and who climbs', () => {
    const s = intro();
    let info = ladderOf(s);
    expect(info.contestant).toBeNull();
    expect(info.steps).toHaveLength(5);
    expect(info.steps.map((step) => step.safe)).toEqual([false, false, true, false, false]);
    expect(info.steps.every((step) => step.state === 'ahead')).toBe(true);
    expect(info.current).toBe(-1);
    const picked = must(pickContestant(s, 'p2'));
    info = ladderOf(picked);
    expect(info.contestant?.nickname).toBe('Петро');
    expect(info.drawn).toBe(false);
    const drawn = must(next(intro({ pick: 'random' }), T, rng));
    expect(ladderOf(drawn).drawn).toBe(true);
    expect(ladderOf(drawn).contestant).not.toBeNull();
  });

  it('nothing is decided before the reveal', () => {
    let s = climb();
    s = must(submitAnswer(s, 'p2', opt('b'), T + 1000));
    s = must(submitAnswer(s, 'p1', opt('c'), T + 2000));
    expect(s.phase).toBe('question');
    expect(JSON.stringify(stageView(s))).not.toContain('"correctId"');
    expect(JSON.stringify(phone(s, 'p1'))).not.toContain('"correctId"');
    expect(ladderOf(s).contestantPick).toBeNull();
    expect(ladderOf(s).hall).toEqual({ answered: 1, total: 2, right: null });
    expect(phone(s, 'p1').ladder).not.toBeNull();
    expect(hostView(s).ladder?.contestantPick).toBe('b');
    s = must(lock(s));
    expect(ladderOf(s).contestantPick).toBe('b');
    expect(ladderOf(s).hall.right).toBeNull();
    expect(ladderOf(s).outcome).toBeNull();
    expect(JSON.stringify(stageView(s))).not.toContain('"correctId"');
    s = must(next(s, T + 5000, rng));
    expect(s.phase).toBe('reveal');
    expect(ladderOf(s).hall.right).toBe(0);
    expect(ladderOf(s).steps[0].state).toBe('current');
  });

  it('the outcome only from the leaderboard', () => {
    let s = climb();
    s = must(submitAnswer(s, 'p2', LADDER_WRONG[0], T + 1000));
    s = must(next(must(lock(s)), T + 5000, rng));
    expect(s.phase).toBe('reveal');
    expect(ladderOf(s).outcome).toBeNull();
    expect(ladderOf(s).steps[0].state).toBe('failed');
    expect(hostView(s).ladder?.outcome).toBeNull();
    s = must(next(s, T + 6000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(ladderOf(s).outcome).toEqual({ kind: 'wrong', passed: 0, points: 0 });
    expect(ladderOf(s).steps[0].state).toBe('failed');
  });

  it('fifty is seen by everyone', () => {
    const s = must(useLifeline(climb(), 'p2', 'fifty', T + 1000, rng));
    const removed = ladderOf(s).fifty;
    expect(removed).toHaveLength(2);
    expect(removed).not.toContain('b');
    expect(phone(s, 'p1').ladder?.fifty).toEqual(removed);
    expect(phone(s, 'p2').ladder?.fifty).toEqual(removed);
    expect(hostView(s).ladder?.fifty).toEqual(removed);
    expect(JSON.stringify(phone(s, 'p3'))).toContain(JSON.stringify(removed));
  });

  it('the hall tally only after the vote closes', () => {
    let s = must(useLifeline(climb(), 'p2', 'audience', T + 1000, rng));
    s = must(submitAnswer(s, 'p1', opt('b'), T + 2000));
    for (const view of [stageView(s).ladder, phone(s, 'p2').ladder, hostView(s).ladder]) {
      expect(view?.audience).toMatchObject({ state: 'voting', voted: 1, total: 2, tally: null });
    }
    expect(ladderOf(s).audience?.endsAt).toBe(T + 1000 + 15_000);
    s = must(submitAnswer(s, 'p3', opt('c'), T + 3000));
    for (const info of [stageView(s).ladder, phone(s, 'p2').ladder, hostView(s).ladder]) {
      expect(info?.audience?.state).toBe('closed');
      expect(info?.audience?.tally).toEqual({ cast: 2, counts: { b: 1, c: 1 } });
    }
  });

  it('the hint text only for the contestant and the host', () => {
    const questions = ladderQuestions.map((q, i) => (i === 0 ? { ...q, hint: 'Секретна підказка' } : q));
    let s = must(useLifeline(climb({}, questions), 'p2', 'hint', T + 1000, rng));
    expect(ladderOf(s).hint).toBe('text');
    expect(JSON.stringify(stageView(s))).not.toContain('Секретна підказка');
    expect(JSON.stringify(phone(s, 'p1'))).not.toContain('Секретна підказка');
    expect(phone(s, 'p2').me.ladder?.hint).toEqual({ state: 'text', text: 'Секретна підказка' });
    // Без підказки з редактора: ведучий бачить запит і відповідає.
    s = must(useLifeline(climb(), 'p2', 'hint', T + 1000, rng));
    expect(ladderOf(s).hint).toBe('waiting');
    expect(hostView(s).hints.map((h) => h.playerId)).toEqual(['p2']);
    expect(phone(s, 'p2').me.ladder?.hint).toEqual({ state: 'waiting', text: null });
    s = must(giveHint(s, 'p2', 'Це на Б'));
    expect(ladderOf(s).hint).toBe('text');
    expect(JSON.stringify(stageView(s))).not.toContain('Це на Б');
    expect(JSON.stringify(phone(s, 'p3'))).not.toContain('Це на Б');
    expect(phone(s, 'p2').me.ladder?.hint).toEqual({ state: 'text', text: 'Це на Б' });
    expect(hostView(s).hints).toEqual([]);
  });

  it('me.ladder: the contestant', () => {
    let s = climb();
    expect(phone(s, 'p2').me.ladder).toMatchObject({ role: 'contestant', canLifeline: true, canDecide: false, hallClosed: false, hallPoints: null, won: null });
    expect(phone(must(pause(s, T + 100)), 'p2').me.ladder?.canLifeline).toBe(false);
    s = must(submitAnswer(s, 'p2', LADDER_RIGHT[0], T + 1000));
    expect(phone(s, 'p2').me.ladder?.canLifeline).toBe(false);
    s = must(next(must(lock(s)), T + 5000, rng));
    s = must(next(s, T + 6000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(phone(s, 'p2').me.ladder?.canDecide).toBe(true);
    expect(phone(must(pause(s, T + 7000)), 'p2').me.ladder?.canDecide).toBe(false);
    expect(phone(s, 'p1').me.ladder?.canDecide).toBe(false);
    s = must(decideLadder(s, 'p2', true, T + 7000));
    expect(phone(s, 'p2').me.ladder?.canDecide).toBe(false);
  });

  it('me.ladder: the hall and the prize', () => {
    let s = must(useLifeline(climb(), 'p2', 'audience', T + 1000, rng));
    expect(phone(s, 'p1').me.ladder).toMatchObject({ role: 'hall', canLifeline: false, hallPoints: 10, hallClosed: false, won: null });
    s = must(submitAnswer(s, 'p2', LADDER_RIGHT[0], T + 2000));
    expect(phone(s, 'p1').me.ladder?.hallClosed).toBe(true);
    // Голосування закрите — зал уже не відповідає, запитання закрилося відповіддю учасника.
    expect(s.phase).toBe('locked');
    s = must(next(s, T + 5000, rng));
    s = must(next(s, T + 6000, rng));
    s = must(decideLadder(s, 'p2', true, T + 7000));
    s = must(next(s, T + 8000, rng));
    expect(s.phase).toBe('round_end');
    expect(phone(s, 'p2').me.ladder?.won).toBe(100);
    expect(phone(s, 'p1').me.ladder?.won).toBeNull();
  });

  it('the prize of a climb to 1000', () => {
    let s = climb();
    for (let step = 0; step < 3; step += 1) {
      const now = s.startedAt ?? T;
      s = must(submitAnswer(s, 'p2', LADDER_RIGHT[step], now + 1000));
      s = must(next(must(lock(s)), now + 5000, rng));
      s = must(next(s, now + 6000, rng));
      s = must(decideLadder(s, 'p2', step === 2, now + 7000));
      if (step < 2) s = must(next(s, now + 8000, rng));
    }
    s = must(next(s, T + 99_000, rng));
    expect(s.phase).toBe('round_end');
    expect(phone(s, 'p2').me.ladder?.won).toBe(1000);
    expect(ladderOf(s).outcome).toEqual({ kind: 'took', passed: 3, points: 1000 });
  });

  it('lifelines state', () => {
    let s = climb({ lifelines: ['fifty', 'hint'] });
    expect(ladderOf(s).lifelines).toEqual([
      { kind: 'fifty', state: 'ready' },
      { kind: 'hint', state: 'ready' },
    ]);
    s = must(useLifeline(s, 'p2', 'fifty', T + 1000, rng));
    expect(ladderOf(s).lifelines).toEqual([
      { kind: 'fifty', state: 'active' },
      { kind: 'hint', state: 'ready' },
    ]);
    s = must(submitAnswer(s, 'p2', LADDER_RIGHT[0], T + 2000));
    s = must(next(must(lock(s)), T + 5000, rng));
    s = must(next(s, T + 6000, rng));
    s = must(next(must(decideLadder(s, 'p2', false, T + 7000)), T + 8000, rng));
    expect(ladderPlayOf(s)?.ladder.step).toBe(1);
    expect(ladderOf(s).lifelines[0]).toEqual({ kind: 'fifty', state: 'used' });
    expect(ladderOf(s).fifty).toBeNull();
  });

  it('banked and guaranteed', () => {
    let s = climb();
    const pass = (state: GameState, step: number) => {
      const now = state.startedAt ?? T;
      let n = must(submitAnswer(state, 'p2', LADDER_RIGHT[step], now + 1000));
      n = must(next(must(lock(n)), now + 5000, rng));
      return must(next(n, now + 6000, rng));
    };
    const go = (state: GameState) => must(next(must(decideLadder(state, 'p2', false, T + 90_000)), T + 91_000, rng));
    s = pass(s, 0);
    s = go(s);
    s = pass(s, 1);
    expect(ladderOf(s)).toMatchObject({ banked: 300, guaranteed: 0 });
    s = go(s);
    s = pass(s, 2);
    expect(ladderOf(s)).toMatchObject({ banked: 1000, guaranteed: 1000 });
    expect(ladderOf(s).steps.map((step) => step.state)).toEqual(['passed', 'passed', 'passed', 'ahead', 'ahead']);
  });

  it('no timer on the phone', () => {
    const quiet = climb({ timer: false });
    expect(phone(quiet, 'p1').question?.timeLimit).toBeNull();
    expect(stageView(quiet).question?.timeLimit).toBeNull();
    expect(stageView(quiet).round?.times).toBeNull();
    const timed = climb({ timer: true });
    expect(phone(timed, 'p1').question?.timeLimit).toBe(20);
    expect(stageView(timed).round?.times).toEqual({ min: 20, max: 20 });
  });

  it('the ladder replaces the leaderboard, the table button still works', () => {
    const quiz = makeRoundsQuiz([ladderRound('rl'), classicRound('r2', [withId(single, 'q2')])], { leaderboard: 'end' });
    let s = must(next(must(pickContestant(must(start(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'))), 'p2')), T, rng));
    s = must(submitAnswer(s, 'p2', LADDER_RIGHT[0], T + 1000));
    s = must(next(must(lock(s)), T + 5000, rng));
    s = must(next(s, T + 6000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(stageView(s).standings).toBeNull();
    expect(phone(s, 'p1').standings).toBeNull();
    expect(phone(s, 'p1').table).not.toBeNull();
    // leaderboard 'end': поза підсумками лише власний рядок.
    expect(phone(s, 'p1').table?.full).toBe(false);
    expect(phone(s, 'p1').table?.rows).toHaveLength(1);
  });

  it('a hall player who dropped is not counted once away and silent', () => {
    let s = climb();
    s = must(setConnected(s, 'p3', false, T + 500));
    expect(ladderOf(s).hall.total).toBe(1);
    s = must(submitAnswer(s, 'p1', opt('b'), T + 1000));
    expect(ladderOf(s).hall).toEqual({ answered: 1, total: 1, right: null });
  });

  it('outside the ladder there is none', () => {
    const s = must(start(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля', 'Петро')));
    expect(stageView(s).ladder).toBeNull();
    expect(hostView(s).ladder).toBeNull();
    expect(phone(s, 'p1').ladder).toBeNull();
    expect(phone(s, 'p1').me.ladder).toBeNull();
  });

  it('the clock is stopped on pause for the audience vote', () => {
    let s = must(useLifeline(climb({ timer: true }), 'p2', 'audience', T + 1000, rng));
    s = must(pause(s, T + 4000));
    expect(ladderOf(s).audience).toMatchObject({ state: 'voting', endsAt: null, remainingMs: 12_000 });
    expect(tick(s, T + 60_000).phase).toBe('question');
  });
});
