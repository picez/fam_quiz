import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer, type QuizSettings } from '@quiz/shared';
import { addAdjustment } from './adjust';
import { castAppealVote, openAppeal } from './appeal';
import { awayEnd, awayStart } from './away';
import { lock, next, pause, setConnected, submitAnswer, type GameState } from './game';
import { actAnswer } from './team-act';
import { classicRound, makeRoundsQuiz, text, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { undoScore } from './undo';
import { hostView, playerView, stageView } from './views';

const T0 = 1_000_000;
const T1 = T0 + 10_000;
const rng = () => 0;
const t100 = withPoints(text, 100);
const RIGHT: Answer = { type: 'text', value: 'Одеса' };
const WRONG: Answer = { type: 'text', value: 'Одеська' };

const quizOf = (settings: Partial<QuizSettings> = {}) =>
  makeRoundsQuiz([classicRound('r1', [t100, withId(t100, 't2')], { speedBonus: false, rules: DEFAULT_RULES })], { leaderboard: 'each', ...settings });

/** Відповіді Олі p1, Петра p2 й Іри p3, закриття; без розкриття. */
function answered(s0: GameState, answers: [Answer, Answer, Answer] = [WRONG, RIGHT, RIGHT]): GameState {
  let s = s0;
  answers.forEach((answer, i) => {
    s = must(submitAnswer(s, `p${i + 1}`, answer, T0 + 1000));
  });
  return s.phase === 'question' ? must(lock(s)) : s;
}

const start = (settings: Partial<QuizSettings> = {}) => startRound(lobbyWith(quizOf(settings), 'Оля', 'Петро', 'Іра'), T0, rng);
/** Класика по 100: Оля «Одеська» (неправильно), Петро й Іра «Одеса»; розкриття t1. */
const reveal = must(next(answered(start()), T0 + 1500, rng));
/** Апеляція Олі за оцінку, Петро — «так». */
const voted = must(castAppealVote(must(openAppeal(reveal, 'p1', 'grade', T1)), 'p2', 1, true, T1 + 1000));

const me = (s: GameState, id: string) => playerView(s, id)?.me.appeal;

describe('the phone appeal button', () => {
  it('Оля (wrong) may appeal the grade with two left; Петро (right) has no button', () => {
    expect(me(reveal, 'p1')).toEqual({ left: 2, reasons: ['grade'], block: null, voter: false, vote: null });
    expect(me(reveal, 'p2')).toEqual({ left: 2, reasons: [], block: null, voter: false, vote: null });
  });

  it('is null on locked and on the leaderboard', () => {
    const locked = answered(start());
    expect(locked.phase).toBe('locked');
    expect(me(locked, 'p1')).toBeNull();
    const table = must(next(reveal, T1, rng));
    expect(table.phase).toBe('leaderboard');
    expect(me(table, 'p1')).toBeNull();
  });

  it('no one to vote: Петро and Іра are offline', () => {
    const s = must(setConnected(must(setConnected(reveal, 'p2', false, T1)), 'p3', false, T1));
    expect(me(s, 'p1')).toEqual({ left: 2, reasons: [], block: 'no_voters', voter: false, vote: null });
  });

  it('no button on a pause (openAppeal would refuse)', () => {
    expect(me(must(pause(reveal, T1)), 'p1')).toEqual({ left: 2, reasons: [], block: null, voter: false, vote: null });
  });

  it('the left count drops after a counted appeal', () => {
    const decided = must(castAppealVote(voted, 'p3', 1, false, T1 + 2000));
    expect(decided.appeals?.[0].outcome).toBe('tie');
    expect(me(decided, 'p1')).toMatchObject({ left: 1, reasons: [] });
  });
});

describe('an open appeal', () => {
  it('every role sees the same card with counts only', () => {
    const card = {
      id: 1,
      by: { playerId: 'p1', nickname: 'Оля' },
      reason: 'grade',
      answer: WRONG,
      yes: 1,
      no: 0,
      waiting: 1,
      outcome: null,
      endsAt: T1 + 30_000,
      remainingMs: null,
      points: 100,
      undone: false,
    };
    expect(stageView(voted).appeal).toMatchObject(card);
    expect(stageView(voted).appeal?.question.id).toBe(t100.id);
    expect(hostView(voted).appeal).toEqual(stageView(voted).appeal);
    for (const id of ['p1', 'p2', 'p3']) expect(playerView(voted, id)?.appeal).toEqual(stageView(voted).appeal);
  });

  it('the phones get voter and only their own vote', () => {
    expect(me(voted, 'p2')).toMatchObject({ voter: true, vote: true, reasons: [] });
    expect(me(voted, 'p3')).toMatchObject({ voter: true, vote: null, reasons: [] });
    expect(me(voted, 'p1')).toMatchObject({ voter: false, vote: null, reasons: [], block: null });
  });

  it('on a pause the countdown stands: no endsAt, the remainder instead', () => {
    const s = must(pause(voted, T1 + 5000));
    expect(stageView(s).appeal).toMatchObject({ endsAt: null, remainingMs: 25_000 });
  });

  it('no view carries a voter id, a voter nickname or the votes', () => {
    const views = [stageView(voted), hostView(voted), ...['p1', 'p2', 'p3'].map((id) => playerView(voted, id)!)];
    for (const view of views) {
      const card = JSON.stringify(view.appeal);
      for (const secret of ['p2', 'p3', 'Петро', 'Іра']) expect(card).not.toContain(secret);
      expect(JSON.stringify(view)).not.toContain('"votes"');
    }
  });
});

describe('the decision', () => {
  it('yes shows what it gave and stops the clock; the leaderboard has no card', () => {
    const s = must(castAppealVote(voted, 'p3', 1, true, T1 + 2000));
    expect(stageView(s).appeal).toMatchObject({ outcome: 'yes', points: 100, endsAt: null, remainingMs: null, waiting: 0, yes: 2, no: 0 });
    expect(me(s, 'p2')).toMatchObject({ voter: false, vote: null });
    expect(stageView(must(next(s, T1 + 3000, rng))).appeal).toBeNull();
  });

  it('the appeal row cannot be undone on the same reveal: the undo panel hides the current question', () => {
    const s = must(castAppealVote(voted, 'p3', 1, true, T1 + 2000));
    const seq = s.adjustments.find((a) => a.source === 'appeal')!.seq;
    expect(undoScore(s, { seq }, T1 + 3000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(stageView(s).appeal).toMatchObject({ outcome: 'yes', undone: false });
  });

  it('an undone yes says so and shows 0 points (defensive: the reveal hides the row)', () => {
    const s = must(castAppealVote(voted, 'p3', 1, true, T1 + 2000));
    const row = s.adjustments.find((a) => a.source === 'appeal')!;
    const undone = addAdjustment(s, row.playerId, -row.points, T1 + 3000, 'undo', { undoes: { seq: row.seq }, batch: s.adjustmentSeq + 1, roundIndex: row.roundIndex });
    expect(stageView(undone).appeal).toMatchObject({ outcome: 'yes', undone: true, points: 0 });
  });

  it('a tie gives 0 points', () => {
    const s = must(castAppealVote(voted, 'p3', 1, false, T1 + 2000));
    expect(stageView(s).appeal).toMatchObject({ outcome: 'tie', points: 0, yes: 1, no: 1, waiting: 0 });
  });
});

describe('the away reason', () => {
  it('has no answer and shows the points the penalty would take', () => {
    let s = start({ awayPenalty: true });
    s = awayEnd(awayStart(s, 'p1', T0 + 500), 'p1', T0 + 4000);
    s = must(next(answered(s, [RIGHT, RIGHT, RIGHT]), T0 + 5000, rng));
    expect(me(s, 'p1')).toMatchObject({ reasons: ['away'] });
    s = must(openAppeal(s, 'p1', 'away', T1));
    expect(stageView(s).appeal).toMatchObject({ reason: 'away', answer: null, points: 100, outcome: null });
    s = must(castAppealVote(must(castAppealVote(s, 'p2', 1, true, T1 + 1)), 'p3', 1, true, T1 + 2));
    expect(stageView(s).appeal).toMatchObject({ reason: 'away', outcome: 'yes', points: 100 });
  });
});

describe('team appeals', () => {
  /** Червоні t1 (Оля m1 — капітан, Петро m2) «Одеська», Сині t2 (Віра m3 — капітан, Іра m4) «Одеса»; розкриття. */
  function teamReveal(): GameState {
    let s = must(next(teamGame(teamQuiz([classicRound('r1', [t100], { speedBonus: false, rules: DEFAULT_RULES })]), [['Оля', 'Петро'], ['Віра', 'Іра']]), T0, rng));
    s = must(actAnswer(must(actAnswer(s, 'm1', WRONG, T0 + 1000)), 'm3', RIGHT, T0 + 1000));
    if (s.phase === 'question') s = must(lock(s));
    return must(next(s, T0 + 2000, rng));
  }
  const s0 = teamReveal();

  it('the captain gets the button, the other member is told the captain appeals', () => {
    expect(me(s0, 'm1')).toEqual({ left: 2, reasons: ['grade'], block: null, voter: false, vote: null });
    expect(me(s0, 'm2')).toEqual({ left: 2, reasons: [], block: 'captain', voter: false, vote: null });
    expect(me(s0, 'm3')).toEqual({ left: 2, reasons: [], block: null, voter: false, vote: null });
  });

  it('teammates of the appellant are not voters; the other team votes person by person, each seeing only the own vote', () => {
    const s = must(castAppealVote(must(openAppeal(s0, 'm1', 'grade', T1)), 'm3', 1, false, T1 + 1000));
    expect(me(s, 'm1')).toMatchObject({ voter: false, vote: null });
    expect(me(s, 'm2')).toMatchObject({ voter: false, vote: null });
    expect(me(s, 'm3')).toMatchObject({ voter: true, vote: false });
    expect(me(s, 'm4')).toMatchObject({ voter: true, vote: null });
    const card = stageView(s).appeal!;
    expect(card).toMatchObject({ by: { playerId: 't1' }, yes: 0, no: 1, waiting: 1 });
    const views = [stageView(s), hostView(s), ...['m1', 'm2', 'm3', 'm4'].map((id) => playerView(s, id)!)];
    for (const view of views) {
      const json = JSON.stringify(view.appeal);
      for (const secret of ['m1', 'm2', 'm3', 'm4', 'Оля', 'Петро', 'Віра', 'Іра']) expect(json).not.toContain(secret);
      expect(JSON.stringify(view)).not.toContain('"votes"');
    }
  });
});
