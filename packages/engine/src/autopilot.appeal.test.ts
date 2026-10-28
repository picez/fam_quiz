import { describe, expect, it } from 'vitest';
import { APPEAL_MS, AUTOPILOT_MS, type Answer, type Question, type Quiz } from '@quiz/shared';
import { appealOpen, castAppealVote, openAppeal } from './appeal';
import { authorPause, authorResume, autopilotStart, createAutopilotGame, pilotKey, pilotStep, planAutopilot } from './autopilot';
import { nextDeadline } from './blitz';
import { addPlayer, lock, removePlayer, setConnected, submitAnswer, tick, type GameState, type Result, type Rng } from './game';
import { suspend } from './restore';
import { stageView } from './views';
import { stamp } from './pacing';
import { classicRound, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { must } from './testing/helpers';

// Автопілот і апеляція (12f, задача 5): розкриття ≥ appealWindow, поки хтось може оскаржити; чекає голосування; appealShown після рішення.

const T = 1_000_000;
const rng: Rng = () => 0.3;
const RIGHT: Answer = { type: 'single', optionId: 'b' };
const WRONG: Answer = { type: 'single', optionId: 'a' };

const plan = (prev: GameState, next: GameState, now: number): GameState => planAutopilot(prev, stamp(prev, next, now), now);
const act = (prev: GameState, result: Result, now: number): GameState => plan(prev, must(result), now);
const step = (state: GameState, now: number): GameState => plan(state, pilotStep(state, now, rng), now);
const atOf = (state: GameState): number | null | undefined => state.autopilot?.at;
const go = (state: GameState): GameState => {
  const at = atOf(state);
  if (at === null || at === undefined) throw new Error('no autopilot step planned');
  return step(state, at);
};

const classicQuiz = (...questions: Question[]): Quiz => makeRoundsQuiz([classicRound('r1', questions)]);

/** Автопілот: автор Оля (a), Петро (p2) і, з third, Іра (p3); гра почалася о T. */
function begin(quiz: Quiz, third = false): GameState {
  const created = must(createAutopilotGame(quiz, { id: 'a', nickname: 'Оля' }, { transitions: false }));
  const two = must(addPlayer(created, { id: 'p2', nickname: 'Петро' }));
  const lobby = third ? must(addPlayer(two, { id: 'p3', nickname: 'Іра' })) : two;
  return act(lobby, autopilotStart(lobby, T, rng), T);
}

/** Розкриття першого запитання: кожен гравець відповідає answers[id]; R — початок розкриття. */
function toReveal(answers: Record<string, Answer>, quiz: Quiz = classicQuiz(single, withId(single, 'q2'))): { s: GameState; R: number } {
  let s = go(begin(quiz, 'p3' in answers));
  expect(s.phase).toBe('question');
  const t = s.startedAt! + 1000;
  s = plan(s, Object.entries(answers).reduce((acc, [id, answer]) => must(submitAnswer(acc, id, answer, t)), s), t);
  expect(s.phase).toBe('locked');
  s = go(s);
  expect(s.phase).toBe('reveal');
  return { s, R: t + 1500 };
}

describe('the autopilot and the appeal (12f)', () => {
  it('someone can appeal: the reveal lasts appealWindow instead of reveal', () => {
    const { s, R } = toReveal({ a: RIGHT, p2: WRONG });
    expect(AUTOPILOT_MS.appealWindow).toBeGreaterThan(AUTOPILOT_MS.reveal);
    expect(atOf(s)).toBe(R + AUTOPILOT_MS.appealWindow);
    const next = go(s);
    expect(next.phase).not.toBe('reveal');
  });

  it('nobody can appeal (everyone right): the old reveal time', () => {
    const { s, R } = toReveal({ a: RIGHT, p2: RIGHT });
    expect(atOf(s)).toBe(R + AUTOPILOT_MS.reveal);
  });

  it('no appeals left: the old reveal time', () => {
    const quiz = classicQuiz(single, withId(single, 'q2'), withId(single, 'q3'));
    let { s, R } = toReveal({ a: RIGHT, p2: WRONG }, quiz);
    // Петро витрачає обидві апеляції на першому й другому запитаннях (зал каже «ні»).
    for (let q = 0; q < 2; q++) {
      s = act(s, openAppeal(s, 'p2', 'grade', R + 1000), R + 1000);
      s = act(s, castAppealVote(s, 'a', appealOpen(s)!.id, false, R + 2000), R + 2000);
      expect(appealOpen(s)).toBeNull();
      for (let guard = 0; s.phase !== 'question'; guard++) {
        if (guard > 10) throw new Error('the autopilot did not reach the next question');
        s = go(s);
      }
      const t = s.startedAt! + 1000;
      s = plan(s, must(submitAnswer(must(submitAnswer(s, 'a', RIGHT, t)), 'p2', WRONG, t)), t);
      s = go(s);
      expect(s.phase).toBe('reveal');
      R = t + 1500;
    }
    expect(s.questionIndex).toBe(2);
    expect(atOf(s)).toBe(R + AUTOPILOT_MS.reveal);
  });

  it('waits while the hall votes; the decision shows appealShown more', () => {
    let { s, R } = toReveal({ a: RIGHT, p2: WRONG });
    s = act(s, openAppeal(s, 'p2', 'grade', R + 2000), R + 2000);
    expect(appealOpen(s)).not.toBeNull();
    expect(atOf(s)).toBeNull();
    // Рішення на 3-й секунді: оскаржувати більше нікому, тож вікна немає — лише appealShown.
    const early = act(s, castAppealVote(s, 'a', appealOpen(s)!.id, true, R + 3000), R + 3000);
    expect(appealOpen(early)).toBeNull();
    expect(early.appeals?.[0].outcome).toBe('yes');
    expect(atOf(early)).toBe(R + 3000 + AUTOPILOT_MS.appealShown);
    // Рішення на 7-й секунді.
    const late = act(s, castAppealVote(s, 'a', appealOpen(s)!.id, false, R + 7000), R + 7000);
    expect(atOf(late)).toBe(R + 7000 + AUTOPILOT_MS.appealShown);
    expect(go(late).phase).not.toBe('reveal');
  });

  it('an early decision while someone else can still appeal: not before the window', () => {
    let { s, R } = toReveal({ a: RIGHT, p2: WRONG, p3: WRONG });
    expect(atOf(s)).toBe(R + AUTOPILOT_MS.appealWindow);
    s = act(s, openAppeal(s, 'p2', 'grade', R + 1000), R + 1000);
    expect(atOf(s)).toBeNull();
    s = act(s, castAppealVote(s, 'a', appealOpen(s)!.id, true, R + 2000), R + 2000);
    s = act(s, castAppealVote(s, 'p3', appealOpen(s)!.id, true, R + 2000), R + 2000);
    expect(s.appeals?.[0].outcome).toBe('yes');
    // Іра ще може оскаржити: 2 + 3 < 8, тож до кінця вікна.
    expect(atOf(s)).toBe(R + AUTOPILOT_MS.appealWindow);
  });

  it('time runs out: tick closes the vote at endsAt (tie), then appealShown', () => {
    let { s, R } = toReveal({ a: RIGHT, p2: WRONG });
    s = act(s, openAppeal(s, 'p2', 'grade', R + 2000), R + 2000);
    const endsAt = appealOpen(s)!.endsAt;
    expect(endsAt).toBe(R + 2000 + APPEAL_MS.vote);
    expect(nextDeadline(s, R + 2000)).toBe(endsAt);
    s = plan(s, tick(s, endsAt), endsAt);
    expect(s.appeals?.[0].outcome).toBe('tie');
    expect(atOf(s)).toBe(endsAt + AUTOPILOT_MS.appealShown);
  });

  it('the author pause stops the vote clock; resume goes on from the same remainder', () => {
    let { s, R } = toReveal({ a: RIGHT, p2: WRONG });
    s = act(s, openAppeal(s, 'p2', 'grade', R + 2000), R + 2000);
    const endsAt = appealOpen(s)!.endsAt;
    s = act(s, authorPause(s, R + 5000), R + 5000);
    expect(s.paused).toBe(true);
    expect(atOf(s)).toBeNull();
    expect(nextDeadline(s, R + 5000)).toBeNull();
    // Через endsAt на паузі нічого не закривається.
    expect(tick(s, endsAt + 1)).toBe(s);
    s = act(s, authorResume(s, R + 65_000), R + 65_000);
    expect(s.paused).toBe(false);
    expect(appealOpen(s)?.endsAt).toBe(endsAt + 60_000);
    expect(atOf(s)).toBeNull();
    expect(nextDeadline(s, R + 65_000)).toBe(endsAt + 60_000);
    // Залишок добігає: tick закриває голосування на новому кінці, далі — appealShown.
    s = plan(s, tick(s, endsAt + 60_000), endsAt + 60_000);
    expect(s.appeals?.[0].outcome).toBe('tie');
    expect(atOf(s)).toBe(endsAt + 60_000 + AUTOPILOT_MS.appealShown);
  });

  it('a restart (suspend) keeps the vote time left; the author resume runs the rest', () => {
    let { s, R } = toReveal({ a: RIGHT, p2: WRONG });
    s = act(s, openAppeal(s, 'p2', 'grade', R + 2000), R + 2000);
    const endsAt = appealOpen(s)!.endsAt;
    const saved = suspend(s, R + 5000);
    expect(saved.paused).toBe(true);
    expect(appealOpen(saved)?.endsAt).toBe(endsAt);
    expect(stageView(saved).appeal).toMatchObject({ endsAt: null, remainingMs: endsAt - (R + 5000) });
    const back = act(saved, authorResume(saved, R + 65_000), R + 65_000);
    expect(appealOpen(back)?.endsAt).toBe(endsAt + 60_000);
    expect(atOf(back)).toBeNull();
  });

  it('kicking the appellant cancels the appeal: no result to show, the plain reveal time', () => {
    let { s, R } = toReveal({ a: RIGHT, p2: WRONG });
    s = act(s, openAppeal(s, 'p2', 'grade', R + 2000), R + 2000);
    s = act(s, removePlayer(s, 'p2', R + 3000), R + 3000);
    expect(s.appeals?.[0].outcome).toBe('cancelled');
    expect(atOf(s)).toBe(R + 3000 + AUTOPILOT_MS.reveal);
  });

  it('a tie while someone else can still appeal: the window is the floor', () => {
    let { s, R } = toReveal({ a: RIGHT, p2: WRONG, p3: WRONG });
    s = act(s, openAppeal(s, 'p2', 'grade', R + 1000), R + 1000);
    s = act(s, castAppealVote(s, 'a', appealOpen(s)!.id, true, R + 2000), R + 2000);
    s = act(s, castAppealVote(s, 'p3', appealOpen(s)!.id, false, R + 2000), R + 2000);
    expect(s.appeals?.[0].outcome).toBe('tie');
    expect(atOf(s)).toBe(R + AUTOPILOT_MS.appealWindow);
  });

  it('a second appeal on the same reveal waits again and then shows appealShown', () => {
    let { s, R } = toReveal({ a: RIGHT, p2: WRONG, p3: WRONG });
    s = act(s, openAppeal(s, 'p2', 'grade', R + 1000), R + 1000);
    s = act(s, castAppealVote(s, 'a', 1, false, R + 1500), R + 1500);
    s = act(s, castAppealVote(s, 'p3', 1, false, R + 1500), R + 1500);
    s = act(s, openAppeal(s, 'p3', 'grade', R + 2000), R + 2000);
    expect(atOf(s)).toBeNull();
    s = act(s, castAppealVote(s, 'a', 2, true, R + 9000), R + 9000);
    s = act(s, castAppealVote(s, 'p2', 2, true, R + 9000), R + 9000);
    expect(s.appeals?.[1].outcome).toBe('yes');
    // Оскаржити більше нікому: вікна немає.
    expect(atOf(s)).toBe(R + 9000 + AUTOPILOT_MS.appealShown);
  });

  it('nobody to vote (the only other person is offline): the old reveal time', () => {
    let s = go(begin(classicQuiz(single, withId(single, 'q2'))));
    const t = s.startedAt! + 1000;
    s = plan(s, must(submitAnswer(s, 'a', RIGHT, t)), t);
    s = plan(s, must(setConnected(s, 'a', false, t)), t);
    s = plan(s, must(submitAnswer(s, 'p2', WRONG, t)), t);
    if (s.phase === 'question') s = plan(s, must(lock(s, t)), t);
    s = go(s);
    expect(s.phase).toBe('reveal');
    expect(atOf(s)).toBe(t + 1500 + AUTOPILOT_MS.reveal);
  });

  it('pilotKey changes when the appeal opens and when it is decided', () => {
    const { s: reveal, R } = toReveal({ a: RIGHT, p2: WRONG });
    const opened = act(reveal, openAppeal(reveal, 'p2', 'grade', R + 2000), R + 2000);
    expect(pilotKey(opened)).not.toBe(pilotKey(reveal));
    const decided = act(opened, castAppealVote(opened, 'a', appealOpen(opened)!.id, true, R + 3000), R + 3000);
    expect(pilotKey(decided)).not.toBe(pilotKey(opened));
    expect(pilotKey(decided)).not.toBe(pilotKey(reveal));
  });
});
