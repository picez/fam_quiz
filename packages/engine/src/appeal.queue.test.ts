import { describe, expect, it } from 'vitest';
import { APPEAL_MS, AUTOPILOT_MS, DEFAULT_RULES, type Answer, type Question, type Quiz } from '@quiz/shared';
import { appealOpen, appealPossible, appealsLeft, castAppealVote, openAppeal } from './appeal';
import { autopilotStart, createAutopilotGame, pilotStep, planAutopilot } from './autopilot';
import { addPlayer, lock, next, override, pause, removePlayer, resume, submitAnswer, tick, type GameState, type Result, type Rng } from './game';import { stamp } from './pacing';
import { suspend } from './restore';
import { playerView } from './views';
import { classicRound, makeRoundsQuiz, single, text, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { actAnswer } from './team-act';

// Черга апеляцій (29k): поки зал голосує за одну, інший гравець подає свою — вона відкривається одразу після рішення.

const T0 = 1_000_000;
const T1 = T0 + 10_000;
const rng: Rng = () => 0;
const t100 = withPoints(text, 100);
const RIGHT: Answer = { type: 'text', value: 'Одеса' };
const WRONG: Answer = { type: 'text', value: 'Одеська' };

/** Класика t1…t2 по 100: answers — відповіді Олі p1, Петра p2, Іри p3; розкриття t1. */
function toReveal(answers: [Answer, Answer, Answer] = [WRONG, WRONG, RIGHT], names = ['Оля', 'Петро', 'Іра']): GameState {
  const quiz = makeRoundsQuiz([classicRound('r1', [t100, withId(t100, 't2')], { speedBonus: false, rules: DEFAULT_RULES })], { leaderboard: 'each' });
  let s = startRound(lobbyWith(quiz, ...names), T0, rng);
  answers.forEach((answer, i) => {
    if (i < names.length) s = must(submitAnswer(s, `p${i + 1}`, answer, T0 + 1000));
  });
  if (s.phase === 'question') s = must(lock(s));
  return must(next(s, T0 + 1500, rng));
}

const me = (s: GameState, id: string) => playerView(s, id)?.me.appeal;

describe('the appeal queue (29k)', () => {
  const reveal = toReveal();
  const first = must(openAppeal(reveal, 'p1', 'grade', T1));
  const queued = must(openAppeal(first, 'p2', 'grade', T1 + 2000));

  it('a second player files while the hall votes on the first: the appeal waits in the queue', () => {
    expect(appealOpen(queued)).toMatchObject({ id: 1, by: 'p1' });
    expect(queued.appeals).toHaveLength(1);
    expect(queued.appealQueue).toEqual([{ by: 'p2', questionIndex: 0, reason: 'grade', at: T1 + 2000 }]);
    // одна апеляція на запитання: удруге — appeal_queued
    expect(openAppeal(queued, 'p2', 'grade', T1 + 3000)).toEqual({ ok: false, error: 'appeal_queued' });
    // черга рахується в ліміт, як відкрита
    expect(appealsLeft(queued, 'p2')).toBe(1);
  });

  it('the second phone: the button is live during the first vote, after filing it says «next»', () => {
    expect(me(first, 'p2')).toEqual({ left: 2, reasons: ['grade'], block: null, voter: true, vote: null });
    expect(me(queued, 'p2')).toEqual({ left: 1, reasons: [], block: null, voter: true, vote: null, queued: true });
    expect(appealPossible(first)).toBe(true);
    expect(appealPossible(queued)).toBe(false);
  });

  it('the queued appeal opens right after the decision; «Далі» waits for both, in turn', () => {
    expect(next(queued, T1 + 3000, rng)).toEqual({ ok: false, error: 'appeal_open' });
    let s = must(castAppealVote(queued, 'p2', 1, true, T1 + 4000));
    s = must(castAppealVote(s, 'p3', 1, true, T1 + 5000));
    expect(s.appeals?.[0].outcome).toBe('yes');
    expect(appealOpen(s)).toMatchObject({ id: 2, by: 'p2', openedAt: T1 + 5000, endsAt: T1 + 5000 + APPEAL_MS.vote, outcome: null });
    expect(s.appealQueue).toBeUndefined();
    expect(me(s, 'p2')).toEqual({ left: 1, reasons: [], block: null, voter: false, vote: null });
    expect(next(s, T1 + 6000, rng)).toEqual({ ok: false, error: 'appeal_open' });
    // Оля, щойно оскаржувала, тепер голосує за Петра; час спливає — нічия.
    expect(me(s, 'p1')).toMatchObject({ voter: true });
    s = tick(s, T1 + 5000 + APPEAL_MS.vote);
    expect(s.appeals?.[1].outcome).toBe('tie');
    expect(must(next(s, T1 + 40_000, rng)).phase).not.toBe('reveal');
  });

  it('the vote clock closing the first opens the queued one', () => {
    const s = tick(queued, T1 + APPEAL_MS.vote);
    expect(s.appeals?.[0].outcome).toBe('tie');
    expect(appealOpen(s)).toMatchObject({ id: 2, by: 'p2', openedAt: T1 + APPEAL_MS.vote });
  });

  it('three in a row: FIFO', () => {
    let s = toReveal([WRONG, WRONG, WRONG], ['Оля', 'Петро', 'Іра', 'Віра']);
    s = must(openAppeal(s, 'p3', 'grade', T1));
    s = must(openAppeal(s, 'p1', 'grade', T1 + 100));
    s = must(openAppeal(s, 'p2', 'grade', T1 + 200));
    expect(s.appealQueue?.map((q) => q.by)).toEqual(['p1', 'p2']);
    s = tick(s, T1 + APPEAL_MS.vote);
    expect(appealOpen(s)?.by).toBe('p1');
    s = tick(s, T1 + 2 * APPEAL_MS.vote);
    expect(appealOpen(s)?.by).toBe('p2');
    s = tick(s, T1 + 3 * APPEAL_MS.vote);
    expect(appealOpen(s)).toBeNull();
    expect(s.appeals?.map((a) => a.by)).toEqual(['p3', 'p1', 'p2']);
  });

  it('the host grades the open appellant right: the queued one opens', () => {
    const s = must(override(queued, 'p1', 'correct', T1 + 4000));
    expect(s.appeals?.[0].outcome).toBe('host');
    expect(appealOpen(s)).toMatchObject({ by: 'p2', openedAt: T1 + 4000 });
  });

  it('the host grades the queued player right: the queue drops him, the game is not held', () => {
    const s = must(override(queued, 'p2', 'correct', T1 + 4000));
    expect(s.appealQueue).toBeUndefined();
    expect(appealsLeft(s, 'p2')).toBe(2);
    const decided = tick(s, T1 + APPEAL_MS.vote);
    expect(appealOpen(decided)).toBeNull();
  });

  it('removing the queued player takes his appeal off the queue', () => {
    const s = must(removePlayer(queued, 'p2', T1 + 3000));
    expect(s.appealQueue).toBeUndefined();
    expect(appealOpen(s)?.by).toBe('p1');
    expect(appealOpen(tick(s, T1 + APPEAL_MS.vote))).toBeNull();
  });

  it('removing the open appellant cancels his appeal and opens the queued one', () => {
    const s = must(removePlayer(queued, 'p1', T1 + 3000));
    expect(s.appeals?.[0].outcome).toBe('cancelled');
    expect(appealOpen(s)).toMatchObject({ by: 'p2', openedAt: T1 + 3000 });
  });

  it('a queued appeal opening while paused gets its full time after the pause', () => {
    const paused = must(pause(queued, T1 + 3000));
    const s = must(override(paused, 'p1', 'correct', T1 + 4000));
    expect(appealOpen(s)?.by).toBe('p2');
    const back = must(resume(s, T1 + 10_000));
    expect(appealOpen(back)?.endsAt).toBe(T1 + 10_000 + APPEAL_MS.vote);
  });

  it('the queue survives a restart (suspend) and moves on after resume', () => {
    const saved = JSON.parse(JSON.stringify(suspend(queued, T1 + 3000))) as GameState;
    expect(saved.appealQueue).toEqual(queued.appealQueue);
    const back = must(resume(saved, T1 + 100_000));
    const s = tick(back, appealOpen(back)!.endsAt);
    expect(appealOpen(s)?.by).toBe('p2');
  });
});

describe('the appeal queue with the autopilot host (29k)', () => {
  const T = 1_000_000;
  const R1: Answer = { type: 'single', optionId: 'b' };
  const W1: Answer = { type: 'single', optionId: 'a' };
  const plan = (prev: GameState, nextState: GameState, now: number): GameState => planAutopilot(prev, stamp(prev, nextState, now), now);
  const act = (prev: GameState, result: Result, now: number): GameState => plan(prev, must(result), now);
  const step = (state: GameState, now: number): GameState => plan(state, pilotStep(state, now, rng), now);
  const atOf = (state: GameState) => state.autopilot?.at;
  const go = (state: GameState): GameState => step(state, atOf(state)!);
  const quiz: Quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')] as Question[])]);

  function pilotReveal(): { s: GameState; R: number } {
    const created = must(createAutopilotGame(quiz, { id: 'a', nickname: 'Оля' }, { transitions: false }));
    const lobby = must(addPlayer(must(addPlayer(created, { id: 'p2', nickname: 'Петро' })), { id: 'p3', nickname: 'Іра' }));
    let s = go(act(lobby, autopilotStart(lobby, T, rng), T));
    const t = s.startedAt! + 1000;
    s = plan(s, must(submitAnswer(must(submitAnswer(must(submitAnswer(s, 'a', R1, t)), 'p2', W1, t)), 'p3', W1, t)), t);
    s = go(s);
    expect(s.phase).toBe('reveal');
    return { s, R: t + 1500 };
  }

  it('the second player files during the first vote; the autopilot waits for both, then the usual window', () => {
    let { s, R } = pilotReveal();
    s = act(s, openAppeal(s, 'p2', 'grade', R + 1000), R + 1000);
    expect(atOf(s)).toBeNull();
    // Іра голосує й подає свою, поки зал ще голосує за Петра.
    s = act(s, castAppealVote(s, 'p3', 1, false, R + 2000), R + 2000);
    s = act(s, openAppeal(s, 'p3', 'grade', R + 2500), R + 2500);
    expect(atOf(s)).toBeNull();
    s = act(s, castAppealVote(s, 'a', 1, false, R + 3000), R + 3000);
    expect(s.appeals?.[0].outcome).toBe('no');
    // Апеляція Іри відкрилася одразу: автопілот і далі чекає.
    expect(appealOpen(s)).toMatchObject({ id: 2, by: 'p3' });
    expect(atOf(s)).toBeNull();
    const pushed = pilotStep(s, R + 20_000, rng);
    expect(pushed.phase).toBe('reveal');
    expect(appealOpen(pushed)?.by).toBe('p3');
    // Час голосування спливає — нічия; оскаржити більше нікому: appealShown від рішення.
    const endsAt = appealOpen(s)!.endsAt;
    s = plan(s, tick(s, endsAt), endsAt);
    expect(s.appeals?.[1].outcome).toBe('tie');
    expect(appealOpen(s)).toBeNull();
    expect(atOf(s)).toBe(endsAt + AUTOPILOT_MS.appealShown);
    expect(go(s).phase).not.toBe('reveal');
  });

  it('after the queue someone can still appeal: the usual window from the last decision', () => {
    const created = must(createAutopilotGame(quiz, { id: 'a', nickname: 'Оля' }, { transitions: false }));
    let lobby = created;
    for (const [id, nickname] of [['p2', 'Петро'], ['p3', 'Іра'], ['p4', 'Віра']]) lobby = must(addPlayer(lobby, { id, nickname }));
    let s = go(act(lobby, autopilotStart(lobby, T, rng), T));
    const t = s.startedAt! + 1000;
    for (const id of ['a', 'p2', 'p3', 'p4']) s = plan(s, must(submitAnswer(s, id, id === 'a' ? R1 : W1, t)), t);
    s = go(s);
    const R = t + 1500;
    s = act(s, openAppeal(s, 'p2', 'grade', R + 1000), R + 1000);
    s = act(s, openAppeal(s, 'p3', 'grade', R + 1500), R + 1500);
    s = plan(s, tick(s, R + 1000 + APPEAL_MS.vote), R + 1000 + APPEAL_MS.vote);
    expect(appealOpen(s)?.by).toBe('p3');
    expect(atOf(s)).toBeNull();
    const second = appealOpen(s)!.endsAt;
    s = plan(s, tick(s, second), second);
    // Віра ще може оскаржити: вікно 8 с від останнього рішення.
    expect(atOf(s)).toBe(second + AUTOPILOT_MS.appealWindow);
  });
});

describe('the appeal queue when a whole appellant team leaves (29k, fix round 1)', () => {
  /** t1 — лише Оля (m1), t2 — Віра й Іра (m2, m3, правильно), t3 — лише Петро (m4); t1 і t3 «Одеська». */
  function teamReveal(): GameState {
    const quiz = teamQuiz([classicRound('r1', [t100, withId(t100, 't2')], { speedBonus: false, rules: DEFAULT_RULES })], 3);
    let s = must(next(teamGame(quiz, [['Оля'], ['Віра', 'Іра'], ['Петро']]), T0, rng));
    s = must(actAnswer(must(actAnswer(must(actAnswer(s, 'm1', WRONG, T0 + 1000)), 'm2', RIGHT, T0 + 1000)), 'm4', WRONG, T0 + 1000));
    if (s.phase === 'question') s = must(lock(s));
    return must(next(s, T0 + 2000, rng));
  }

  it('removing the only member of the appellant team opens the queued appeal; «Далі» still waits', () => {
    let s = must(openAppeal(teamReveal(), 'm1', 'grade', T1));
    s = must(openAppeal(s, 'm4', 'grade', T1 + 500));
    expect(appealOpen(s)?.by).toBe('t1');
    expect(s.appealQueue?.map((q) => q.by)).toEqual(['t3']);
    s = must(removePlayer(s, 'm1', T1 + 1000));
    expect(s.players.some((p) => p.id === 't1')).toBe(false);
    expect(s.appeals?.[0].outcome).toBe('cancelled');
    expect(appealOpen(s)).toMatchObject({ id: 2, by: 't3', openedAt: T1 + 1000 });
    expect(s.appealQueue).toBeUndefined();
    expect(next(s, T1 + 2000, rng)).toEqual({ ok: false, error: 'appeal_open' });
  });

  it('a queue without an open appeal never lets «Далі» skip it: next opens the queued one first', () => {
    const queued = must(openAppeal(must(openAppeal(toReveal(), 'p1', 'grade', T1)), 'p2', 'grade', T1 + 2000));
    // Стан, якого рушій сам не дає: відкриту закрито, а черга лишилась.
    const orphan: GameState = { ...queued, appeals: queued.appeals?.map((a) => ({ ...a, votes: {}, yes: 0, no: 0, outcome: 'tie' as const })) };
    expect(appealOpen(orphan)).toBeNull();
    const opened = must(next(orphan, T1 + 3000, rng));
    expect(opened.phase).toBe('reveal');
    expect(appealOpen(opened)).toMatchObject({ by: 'p2', openedAt: T1 + 3000 });
    expect(next(opened, T1 + 4000, rng)).toEqual({ ok: false, error: 'appeal_open' });
  });

  it('filing again while queued is appeal_queued', () => {
    const queued = must(openAppeal(must(openAppeal(toReveal(), 'p1', 'grade', T1)), 'p2', 'grade', T1 + 2000));
    expect(openAppeal(queued, 'p2', 'grade', T1 + 3000)).toEqual({ ok: false, error: 'appeal_queued' });
  });
});
