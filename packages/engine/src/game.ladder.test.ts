import { describe, expect, it } from 'vitest';
import type { Answer, QuizSettings } from '@quiz/shared';
import { adjustScore } from './adjust';
import { end, endRound, lock, next, override, pause, recordOf, removePlayer, setConnected, submitAnswer, type GameState, type Rng } from './game';
import { awardLadder, contestantOf, decideLadder, decisionPending, ladderPlayOf, pickContestant, stopLadder } from './ladder';
import { classicRound, ladderRound, LADDER_RIGHT, LADDER_WRONG, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, startRound } from './testing/helpers';

const rng = () => 0;
const T = 10_000;
const kyiv: Answer = { type: 'single', optionId: 'b' };

type LadderOptions = Parameters<typeof ladderRound>[2];

const quizWith = (options: LadderOptions = {}, settings: Partial<QuizSettings> = {}) =>
  makeRoundsQuiz([classicRound('r1', [single]), ladderRound('rl', undefined, options), classicRound('r3', [withId(single, 'q3')])], settings);

/** Гра на заставці раунду «Мільйонер» (Оля p1, Петро p2, Віра p3); answers — відповіді на q1 першого раунду. */
function toIntro(
  options: LadderOptions = {},
  answers: Record<string, Answer> = {},
  settings: Partial<QuizSettings> = {},
  lobby: typeof lobbyWith = lobbyWith,
): GameState {
  let s = startRound(lobby(quizWith(options, settings), 'Оля', 'Петро', 'Віра'), 0, rng);
  for (const [id, answer] of Object.entries(answers)) s = must(submitAnswer(s, id, answer, 1000));
  if (s.phase === 'question') s = must(lock(s));
  while (!(s.phase === 'intro' && s.roundIndex === 1)) s = must(next(s, 2000, rng));
  return s;
}

/** rng з лічильником викликів. */
function counting(values: number[]): { rng: Rng; calls: () => number } {
  let calls = 0;
  return {
    rng: () => {
      calls += 1;
      return values.shift() ?? 0;
    },
    calls: () => calls,
  };
}

/** Ведучий вибрав Петра; l1 відкрито о T. */
function climb(options: LadderOptions = {}, settings: Partial<QuizSettings> = {}): GameState {
  return must(next(must(pickContestant(toIntro(options, {}, settings), 'p2')), T, rng));
}

/** Відповіді на поточну сходинку о at (типово через секунду після старту), закриття (якщо ще відкрито) й розкриття. */
function rung(state: GameState, answers: Record<string, Answer>, at = (state.startedAt ?? T) + 1000): GameState {
  let s = state;
  for (const [id, answer] of Object.entries(answers)) s = must(submitAnswer(s, id, answer, at));
  if (s.phase === 'question') s = must(lock(s));
  return must(next(s, at + 100, rng));
}

const stepOf = (s: GameState) => ladderPlayOf(s)?.ladder.step ?? -1;

/** Петро правильно на поточній сходинці, «Граю далі» — і наступне запитання. */
function pass(state: GameState): GameState {
  let s = rung(state, { p2: LADDER_RIGHT[stepOf(state)] });
  s = must(next(s, T + 2000, rng));
  s = must(decideLadder(s, 'p2', false, T + 2100));
  return must(next(s, T + 2200, rng));
}

/** Петро пройшов n сходинок; відкрито n + 1-шу. */
function passed(n: number, options: LadderOptions = {}): GameState {
  let s = climb(options);
  for (let i = 0; i < n; i += 1) s = pass(s);
  return s;
}

const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
const ladderAdjustments = (s: GameState) => s.adjustments.filter((a) => a.source === 'ladder');
const roundPlays = (s: GameState, roundIndex = 1) => s.plays.filter((p) => p.roundIndex === roundIndex);
const lastLadder = (s: GameState) => roundPlays(s).at(-1)?.ladder;

describe('ladder: the contestant', () => {
  it('the host picks the contestant on the intro', () => {
    let s = toIntro();
    expect(s.ladder).toEqual({ contestantId: null, drawn: false });
    expect(next(s, T, rng)).toEqual({ ok: false, error: 'ladder_pick' });
    s = must(pickContestant(s, 'p1'));
    expect(s.ladder).toEqual({ contestantId: 'p1', drawn: false });
    s = must(pickContestant(s, 'p2'));
    expect(contestantOf(s)).toBe('p2');
    s = must(next(s, T, rng));
    expect(s.phase).toBe('question');
    expect(s.plays.at(-1)?.question.id).toBe('l1');
    expect(s.plays.at(-1)?.ladder).toEqual({ contestantId: 'p2', step: 0, level: 100, timed: false, lifelines: {}, decision: null, outcome: null });
    expect(pickContestant(s, 'p1')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('pick errors', () => {
    const s = toIntro();
    expect(pickContestant(s, 'p9')).toEqual({ ok: false, error: 'not_found' });
    expect(pickContestant(must(setConnected(s, 'p3', false, T)), 'p3')).toEqual({ ok: false, error: 'target_offline' });
    expect(pickContestant(must(pause(s, T)), 'p1')).toEqual({ ok: false, error: 'paused' });
    const classic = startRound(lobbyWith(quizWith(), 'Оля', 'Петро'), 0, rng);
    expect(pickContestant(classic, 'p1')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a random draw takes one rng number', () => {
    const draw = counting([0.5]);
    let s = must(next(toIntro({ pick: 'random' }), T, draw.rng));
    expect(s.ladder).toEqual({ contestantId: 'p2', drawn: true });
    expect(s.phase).toBe('intro');
    expect(draw.calls()).toBe(1);
    s = must(next(s, T, rng));
    expect(s.phase).toBe('question');
    expect(s.plays.at(-1)?.question.id).toBe('l1');
    expect(s.plays.at(-1)?.ladder?.contestantId).toBe('p2');
  });

  it('the lowest score goes, ties by rng', () => {
    const tied = toIntro({ pick: 'lowest' }, { p1: kyiv });
    expect(score(tied, 'p1')).toBeGreaterThan(0);
    expect([score(tied, 'p2'), score(tied, 'p3')]).toEqual([0, 0]);
    const draw = counting([0.9]);
    expect(must(next(tied, T, draw.rng)).ladder).toEqual({ contestantId: 'p3', drawn: true });
    expect(draw.calls()).toBe(1);
    const lowest = must(adjustScore(tied, 'p2', -50, T));
    const once = counting([0.9]);
    expect(must(next(lowest, T, once.rng)).ladder).toEqual({ contestantId: 'p2', drawn: true });
    expect(once.calls()).toBe(1);
  });

  it('absent players are not drawn', () => {
    const s = must(setConnected(toIntro({ pick: 'random' }), 'p2', false, T));
    expect(must(next(s, T, counting([0.5]).rng)).ladder?.contestantId).toBe('p3');
    const empty = ['p1', 'p3'].reduce((acc, id) => must(setConnected(acc, id, false, T)), s);
    expect(next(empty, T, rng)).toEqual({ ok: false, error: 'no_players' });
  });
});

describe('ladder: answers', () => {
  it('the ladder round has no timer by default', () => {
    const s = climb();
    expect(s.startedAt).toBe(T);
    expect(s.endsAt).toBeNull();
    expect(submitAnswer(s, 'p2', LADDER_RIGHT[0], T + 600_000).ok).toBe(true);
    expect(climb({ timer: true }).endsAt).toBe(T + 20_000);
  });

  it('the contestant scores nothing per answer, the hall gets 10 %', () => {
    let s = climb();
    s = must(submitAnswer(s, 'p2', LADDER_RIGHT[0], T + 1000));
    s = must(submitAnswer(s, 'p1', LADDER_RIGHT[0], T + 1000));
    s = must(submitAnswer(s, 'p3', LADDER_WRONG[0], T + 1000));
    expect(s.phase).toBe('locked');
    expect(recordOf(s, s.questionIndex, 'p2')).toMatchObject({ points: 0, grade: 'correct', accuracy: 1, streakBonus: 0 });
    expect(recordOf(s, s.questionIndex, 'p1')).toMatchObject({ points: 10, grade: 'correct', streakBonus: 0 });
    expect(recordOf(s, s.questionIndex, 'p3')).toMatchObject({ points: 0, grade: 'wrong' });
    expect(score(s, 'p1')).toBe(10);
    expect(score(s, 'p2')).toBe(0);
    expect(s.players.every((p) => p.streak === 0)).toBe(true);
  });

  it('the question closes when the contestant and the present hall answered', () => {
    let s = climb();
    s = must(submitAnswer(s, 'p1', LADDER_RIGHT[0], T + 1000));
    s = must(submitAnswer(s, 'p3', LADDER_RIGHT[0], T + 1000));
    expect(s.phase).toBe('question');
    expect(must(submitAnswer(s, 'p2', LADDER_RIGHT[0], T + 1000)).phase).toBe('locked');
    let away = must(setConnected(climb(), 'p3', false, T));
    away = must(submitAnswer(away, 'p1', LADDER_RIGHT[0], T + 1000));
    expect(must(submitAnswer(away, 'p2', LADDER_RIGHT[0], T + 1000)).phase).toBe('locked');
    let gone = must(setConnected(climb(), 'p2', false, T));
    gone = must(submitAnswer(gone, 'p1', LADDER_RIGHT[0], T + 1000));
    expect(must(submitAnswer(gone, 'p3', LADDER_RIGHT[0], T + 1000)).phase).toBe('question');
  });
});

describe('ladder: steps and the prize', () => {
  it('correct means a decision before the next question', () => {
    let s = rung(climb(), { p2: LADDER_RIGHT[0] });
    expect(s.phase).toBe('reveal');
    s = must(next(s, T + 2000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(decisionPending(s)).toBe(true);
    expect(s.endsAt).toBeNull();
    expect(next(s, T + 2000, rng)).toEqual({ ok: false, error: 'deciding' });
    s = must(decideLadder(s, 'p2', false, T + 2100));
    expect(lastLadder(s)?.decision).toBe('go');
    expect(decisionPending(s)).toBe(false);
    s = must(next(s, T + 2200, rng));
    expect(s.phase).toBe('question');
    expect(ladderPlayOf(s)?.ladder).toMatchObject({ step: 1, level: 300, decision: null, outcome: null });
  });

  it('taking the money pays the last passed level', () => {
    let s = rung(passed(2), { p2: LADDER_RIGHT[2] });
    s = must(next(s, T + 3000, rng));
    s = must(decideLadder(s, 'p2', true, T + 3100));
    expect(lastLadder(s)?.decision).toBe('take');
    expect(lastLadder(s)?.outcome).toEqual({ kind: 'took', passed: 3, points: 1000 });
    expect(ladderAdjustments(s)).toEqual([expect.objectContaining({ source: 'ladder', playerId: 'p2', points: 1000, roundIndex: 1 })]);
    expect(score(s, 'p2')).toBe(1000);
    s = must(next(s, T + 3200, rng));
    expect(s.phase).toBe('round_end');
    expect(roundPlays(s).map((p) => p.question.id)).toEqual(['l1', 'l2', 'l3']);
  });

  it('a wrong answer falls to the last passed safe level', () => {
    let s = rung(passed(4), { p2: LADDER_WRONG[4] });
    s = must(next(s, T + 3000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(lastLadder(s)?.outcome).toEqual({ kind: 'wrong', passed: 4, points: 1000 });
    expect(score(s, 'p2')).toBe(1000);
    expect(must(next(s, T + 3100, rng)).phase).toBe('round_end');
  });

  it('a wrong answer before any safe level pays nothing', () => {
    const s = must(next(rung(passed(1), { p2: LADDER_WRONG[1] }), T + 3000, rng));
    expect(lastLadder(s)?.outcome).toEqual({ kind: 'wrong', passed: 1, points: 0 });
    expect(ladderAdjustments(s)).toEqual([]);
  });

  it('silence is a wrong answer', () => {
    const s = must(next(rung(climb(), {}), T + 3000, rng));
    expect(lastLadder(s)?.outcome).toEqual({ kind: 'wrong', passed: 0, points: 0 });
  });

  it('the top of the ladder', () => {
    let s = rung(passed(4), { p2: LADDER_RIGHT[4] });
    s = must(next(s, T + 3000, rng));
    expect(lastLadder(s)?.outcome).toEqual({ kind: 'top', passed: 5, points: 10000 });
    expect(lastLadder(s)?.decision).toBeNull();
    expect(decisionPending(s)).toBe(false);
    expect(score(s, 'p2')).toBe(10000);
    expect(must(next(s, T + 3100, rng)).phase).toBe('round_end');
  });

  it('only the contestant or the host decides', () => {
    const open = must(next(rung(climb(), { p2: LADDER_RIGHT[0] }), T + 2000, rng));
    expect(decideLadder(open, 'p1', true, T + 2100)).toEqual({ ok: false, error: 'not_allowed' });
    expect(decideLadder(must(pause(open, T + 2050)), 'p2', true, T + 2100)).toEqual({ ok: false, error: 'paused' });
    const took = must(decideLadder(open, 'host', true, T + 2100));
    expect(lastLadder(took)?.outcome).toEqual({ kind: 'took', passed: 1, points: 100 });
    expect(decideLadder(took, 'p2', false, T + 2200)).toEqual({ ok: false, error: 'already_answered' });
    expect(decideLadder(climb(), 'p2', true, T + 100)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('the prize is paid once', () => {
    const open = must(next(rung(climb(), { p2: LADDER_RIGHT[0] }), T + 2000, rng));
    const outcome = { kind: 'took' as const, passed: 1, points: 100 };
    const twice = awardLadder(awardLadder(open, outcome, T + 2100), outcome, T + 2200);
    expect(ladderAdjustments(twice)).toHaveLength(1);
    expect(score(twice, 'p2')).toBe(100);
    expect(stopLadder(twice, T + 2300)).toEqual(twice);
  });

  it('a host override on the reveal changes the outcome', () => {
    const revealed = rung(passed(1), { p2: LADDER_WRONG[1], p1: LADDER_WRONG[1], p3: LADDER_WRONG[1] });
    expect(revealed.phase).toBe('reveal');
    const fixed = must(override(revealed, 'p2', 'correct'));
    expect(recordOf(fixed, fixed.questionIndex, 'p2')).toMatchObject({ grade: 'correct', points: 0, overridden: true });
    expect(decisionPending(must(next(fixed, T + 3000, rng)))).toBe(true);
    const hall = must(override(revealed, 'p1', 'correct'));
    expect(recordOf(hall, hall.questionIndex, 'p1')).toMatchObject({ grade: 'correct', points: 30, overridden: true });
    expect(override(revealed, 'p1', 'partial')).toEqual({ ok: false, error: 'partial_disabled' });
  });

  it('the leaderboard setting does not matter', () => {
    const s = rung(climb({}, { leaderboard: 'end' }), { p2: LADDER_RIGHT[0] });
    expect(must(next(s, T + 2000, rng)).phase).toBe('leaderboard');
  });
});

describe('ladder: stopping', () => {
  it('ending the round mid-question keeps what was passed', () => {
    let s = passed(2);
    s = must(submitAnswer(s, 'p2', LADDER_RIGHT[2], T + 3000));
    s = must(submitAnswer(s, 'p1', LADDER_RIGHT[2], T + 3000));
    expect(s.phase).toBe('question');
    s = must(endRound(s, T + 4000));
    expect(s.phase).toBe('round_end');
    expect(lastLadder(s)?.outcome).toEqual({ kind: 'stopped', passed: 2, points: 300 });
    expect(ladderAdjustments(s)).toEqual([expect.objectContaining({ playerId: 'p2', points: 300 })]);
    expect(roundPlays(s).at(-1)?.answers.p1).toMatchObject({ grade: 'correct', points: 100 });
    expect(score(s, 'p2')).toBe(300);
  });

  it('ending on the reveal counts the question', () => {
    const right = must(endRound(rung(passed(2), { p2: LADDER_RIGHT[2] }), T + 4000));
    expect(lastLadder(right)?.outcome).toEqual({ kind: 'stopped', passed: 3, points: 1000 });
    const wrong = must(endRound(rung(passed(2), { p2: LADDER_WRONG[2] }), T + 4000));
    expect(lastLadder(wrong)?.outcome).toEqual({ kind: 'wrong', passed: 2, points: 0 });
  });

  it('ending during the decision takes the money', () => {
    const open = must(next(rung(passed(1), { p2: LADDER_RIGHT[1] }), T + 3000, rng));
    const s = must(endRound(open, T + 4000));
    expect(lastLadder(s)?.outcome).toEqual({ kind: 'took', passed: 2, points: 300 });
    expect(score(s, 'p2')).toBe(300);
  });

  it('ending before the ladder starts pays nothing', () => {
    const s = must(endRound(must(pickContestant(toIntro(), 'p2')), T));
    expect(s.phase).toBe('round_end');
    expect(ladderAdjustments(s)).toEqual([]);
  });

  it('ending the game pays the prize too', () => {
    const s = must(end(passed(1), T + 5000));
    expect(s.phase).toBe('finished');
    expect(lastLadder(s)?.outcome).toEqual({ kind: 'stopped', passed: 1, points: 100 });
    expect(ladderAdjustments(s)).toEqual([expect.objectContaining({ playerId: 'p2', points: 100 })]);
    expect(score(s, 'p2')).toBe(100);
  });

  it('kicking the contestant stops the ladder with nothing', () => {
    let s = passed(1);
    s = must(submitAnswer(s, 'p1', LADDER_RIGHT[1], T + 3000));
    s = must(removePlayer(s, 'p2'));
    expect(lastLadder(s)?.outcome).toEqual({ kind: 'stopped', passed: 1, points: 0 });
    // зал догравав запитання: без учасника автозакриття немає
    s = must(submitAnswer(s, 'p3', LADDER_RIGHT[1], T + 3000));
    expect(s.phase).toBe('question');
    s = must(next(must(lock(s)), T + 4000, rng));
    expect(recordOf(s, s.questionIndex, 'p3')?.points).toBe(30);
    s = must(next(s, T + 5000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(lastLadder(s)?.outcome).toEqual({ kind: 'stopped', passed: 1, points: 0 });
    expect(ladderAdjustments(s)).toEqual([]);
    expect(must(next(s, T + 6000, rng)).phase).toBe('round_end');
    const intro = must(removePlayer(must(pickContestant(toIntro(), 'p2')), 'p2'));
    expect(intro.ladder).toEqual({ contestantId: null, drawn: false });
  });
});

describe('ladder: around the round', () => {
  it('a ladder question opens with the «Запитання N» splash', () => {
    const s = must(next(must(pickContestant(toIntro({}, {}, {}, lobbyWithSplash), 'p2')), T, rng));
    expect(s.phase).toBe('question');
    expect(s.splash?.kind).toBe('question');
  });

  it('the classic round after it plays as before', () => {
    let s = must(next(rung(climb(), {}), T + 3000, rng));
    s = must(next(s, T + 4000, rng));
    expect(s.phase).toBe('round_end');
    s = must(next(s, T + 5000, rng));
    expect(s.phase).toBe('intro');
    expect(s.roundIndex).toBe(2);
    expect('ladder' in s).toBe(false);
    s = must(next(s, T + 6000, rng));
    expect(s.plays.at(-1)?.question.id).toBe('q3');
    const before = score(s, 'p1') ?? 0;
    s = must(lock(must(submitAnswer(s, 'p1', kyiv, T + 7000))));
    expect(score(s, 'p1')).toBeGreaterThan(before);
  });
});
