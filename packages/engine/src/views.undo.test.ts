import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '@quiz/shared';
import { castAppealVote, openAppeal } from './appeal';
import { awayStep } from './away';
import { lobbyWith, must, openAt } from './testing/helpers';
import { end, next, override, submitAnswer, type GameState } from './game';
import { classicRound, makeRoundsQuiz, single, withId, withPoints } from './testing/fixtures';
import { after1, right, rng, U_T0 as T0, undoQuiz, wrong } from './testing/undo';
import { undoPanel, undoScore } from './undo';
import { hostView, playerView, stageView } from './views';

describe('the undo panel in the views', () => {
  it('the host view carries the panel, and null in the lobby', () => {
    expect(hostView(after1()).undo).toEqual(undoPanel(after1()));
    expect(hostView(after1()).undo).not.toBeNull();
    expect(hostView(lobbyWith(undoQuiz, 'Оля')).undo).toBeNull();
  });

  it('the host view has no panel after the end', () => {
    expect(hostView(must(end(after1(), T0 + 5000))).undo).toBeNull();
  });

  it('the stage and the phones never get it', () => {
    const s = after1();
    expect('undo' in stageView(s)).toBe(false);
    expect('undo' in playerView(s, 'p1')!).toBe(false);
    expect(JSON.stringify(stageView(s))).not.toContain('"undo":{"rounds"');
    expect(JSON.stringify(playerView(s, 'p1'))).not.toContain('"undo":{"rounds"');
  });

  it('everyone sees the notice; the breakdown and the leaderboard follow the undo', () => {
    const s = must(undoScore(after1(), { question: 0, playerId: 'p2' }, T0 + 3000));
    expect(stageView(s).notice?.undo).toBeDefined();
    expect(playerView(s, 'p2')!.notice?.undo).toBeDefined();
    expect(playerView(s, 'p2')!.myBreakdown!.parts).toContainEqual({ source: 'undo', plus: 1000, minus: 0 });
    expect(stageView(s).standings!.find((r) => r.nickname === 'Петро')!.score).toBe(0);
  });
});

describe('the away penalty in the undo panel (12e)', () => {
  const q100 = withPoints(single, 100);
  const quiz = makeRoundsQuiz([classicRound('r1', [q100, withId(q100, 'q2')], { speedBonus: false, rules: DEFAULT_RULES })], { awayPenalty: true, leaderboard: 'each' });
  /** Оля виходила 3500 мс і відповіла правильно (+100), Петро — неправильно; гра на розкритті. */
  function revealed(): GameState {
    let s = openAt(lobbyWith(quiz, 'Оля', 'Петро'), T0, rng);
    s = { ...s, plays: [{ ...s.plays[0], away: { p1: { ms: 3500, count: 1, since: null } } }] };
    s = must(submitAnswer(must(submitAnswer(s, 'p1', right, T0 + 1000)), 'p2', wrong, T0 + 1000));
    return must(next(s, T0 + 2000, rng));
  }
  const left = () => {
    const reveal = revealed();
    return awayStep(reveal, must(next(reveal, T0 + 3000, rng)), T0 + 3000, new Set());
  };

  it('the penalty is an away row under its question once the reveal is over', () => {
    expect(undoPanel(revealed())!.rounds).toEqual([]);
    const s = left();
    const seq = s.adjustments.find((a) => a.source === 'away')!.seq;
    const rows = undoPanel(s)!.rounds[0].questions[0].rows;
    expect(undoPanel(s)!.rounds[0].questions[0].index).toBe(0);
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'answer', playerId: 'p1', points: 100 }),
      { kind: 'away', playerId: 'p1', nickname: 'Оля', points: -100, target: { seq }, undoneBy: null },
    ]);
  });

  it('undoing everything of the question gives zero for it', () => {
    const s = must(undoScore(left(), { question: 0 }, T0 + 4000));
    expect(s.players.find((p) => p.id === 'p1')!.score).toBe(0);
    expect(undoPanel(s)!.rounds[0].questions[0].rows.every((r) => r.undoneBy !== null)).toBe(true);
  });
});

describe('the appeal in the undo panel (12f)', () => {
  const q100 = withPoints(single, 100);
  const half = { ...DEFAULT_RULES, partial: 50 };
  const quiz = makeRoundsQuiz([classicRound('r1', [q100, withId(q100, 'q2')], { speedBonus: false, rules: half })], { leaderboard: 'each' });
  /** Оля відповіла неправильно (partial — ведучий дав «частково», +50), Петро — правильно; Оля оскаржила, Петро «так»; гра на розкритті. */
  function appealed(partial = false): GameState {
    let s = openAt(lobbyWith(quiz, 'Оля', 'Петро'), T0, rng);
    s = must(submitAnswer(must(submitAnswer(s, 'p1', wrong, T0 + 1000)), 'p2', right, T0 + 1000));
    s = must(next(s, T0 + 2000, rng));
    if (partial) s = must(override(s, 'p1', 'partial'));
    s = must(openAppeal(s, 'p1', 'grade', T0 + 2500));
    return must(castAppealVote(s, 'p2', 1, true, T0 + 2600));
  }
  const left = (partial = false) => must(next(appealed(partial), T0 + 3000, rng));
  const score = (s: GameState) => s.players.find((p) => p.id === 'p1')!.score;

  it('the appeal is an appeal row under its question once the reveal is over', () => {
    expect(undoPanel(appealed())!.rounds).toEqual([]);
    const s = left();
    const seq = s.appeals![0].adjustmentSeq!;
    expect(undoPanel(s)!.rounds[0].questions[0].rows).toEqual([
      expect.objectContaining({ kind: 'answer', playerId: 'p2' }),
      { kind: 'appeal', playerId: 'p1', nickname: 'Оля', points: 100, target: { seq }, undoneBy: null },
    ]);
  });

  it('the host undoes the appeal row and brings it back', () => {
    const s = left();
    const undone = must(undoScore(s, { seq: s.appeals![0].adjustmentSeq! }, T0 + 4000));
    expect(score(undone)).toBe(0);
    const redone = must(undoScore(undone, { seq: undone.adjustments.at(-1)!.seq }, T0 + 5000));
    expect(score(redone)).toBe(100);
  });

  it('undoing the answer undoes its appeal too; bringing the answer back brings both', () => {
    const s = left(true);
    expect(score(s)).toBe(100);
    const undone = must(undoScore(s, { question: 0, playerId: 'p1' }, T0 + 4000));
    const undos = undone.adjustments.filter((a) => a.source === 'undo');
    expect(undos.map((a) => [a.points, a.undoes])).toEqual([
      [-50, { question: 0 }],
      [-50, { seq: s.appeals![0].adjustmentSeq }],
    ]);
    expect(score(undone)).toBe(0);
    const redone = must(undoScore(undone, { seq: undos[0].seq }, T0 + 5000));
    expect(score(redone)).toBe(100);
  });
});
