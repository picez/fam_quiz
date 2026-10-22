import { describe, expect, it } from 'vitest';
import { adjustScore, adjustmentTotal, lastNotice } from './adjust';
import { placeWager } from './final';
import { end, next, recordOf, removePlayer, start, submitAnswer, type GameState } from './game';
import { classicRound, finalRound, makeQuiz, makeRoundsQuiz, single, text, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { playerView, stageView } from './views';

const T0 = 1_000_000;
const quiz = makeQuiz([single, text]);
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const rng = () => 0;

const lobby = () => lobbyWith(quiz, 'Олена', 'Тарас');
const score = (state: GameState, playerId: string) => state.players.find((p) => p.id === playerId)?.score;

describe('host score adjustments', () => {
  it('the host adds or takes points at any stage of the game but not in the lobby or after the end', () => {
    expect(adjustScore(lobby(), 'p1', -100, T0)).toEqual({ ok: false, error: 'wrong_phase' });
    const intro = must(start(lobby()));
    const state = must(adjustScore(intro, 'p1', -100, T0));
    expect(state.players.find((p) => p.id === 'p1')?.score).toBe(-100);
    expect(state.adjustments).toEqual([{ seq: 1, playerId: 'p1', points: -100, roundIndex: 0, afterQuestion: 0, source: 'host', at: T0 }]);
    expect(adjustScore(must(end(state)), 'p1', 50, T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('refuses zero, fractions, too large sums and unknown players', () => {
    const intro = must(start(lobby()));
    for (const points of [0, 1.5, 10_001, -10_001, Number.NaN]) {
      expect(adjustScore(intro, 'p1', points, T0)).toEqual({ ok: false, error: 'points_invalid' });
    }
    expect(adjustScore(intro, 'p9', 50, T0)).toEqual({ ok: false, error: 'not_found' });
    expect(must(adjustScore(intro, 'p1', 10_000, T0)).players[0].score).toBe(10_000);
    expect(must(adjustScore(intro, 'p1', -10_000, T0)).players[0].score).toBe(-10_000);
  });

  it('adjustments add to the score, survive recomputation and vanish with a kicked player', () => {
    let state = must(adjustScore(startRound(lobby(), T0), 'p1', 75, T0 + 1000)); // під час запитання
    expect(state.adjustments[0]).toMatchObject({ afterQuestion: 0, seq: 1 });
    expect(score(state, 'p1')).toBe(75);
    state = must(submitAnswer(state, 'p1', correct, T0 + 2000));
    state = must(submitAnswer(state, 'p2', wrong, T0 + 2000)); // закриття перераховує рахунок
    expect(state.phase).toBe('locked');
    expect(state.players[0].score).toBe(recordOf(state, 0, 'p1')!.points + 75);
    state = must(adjustScore(state, 'p2', -50, T0 + 3000));
    expect(state.adjustments.map((a) => [a.seq, a.afterQuestion])).toEqual([[1, 0], [2, 1]]);
    expect(adjustmentTotal(state, 'p2')).toBe(-50);
    expect(score(state, 'p2')).toBe(-50);
    state = must(removePlayer(state, 'p1'));
    expect(state.adjustments.map((a) => a.playerId)).toEqual(['p2']);
    expect(must(adjustScore(state, 'p2', 10, T0)).adjustments.at(-1)?.seq).toBe(3); // номер не перевикористовується
  });

  it('the final reveal still conceals the result with an adjustment', () => {
    const finalQuiz = makeRoundsQuiz(
      [classicRound('r1', [single], { speedBonus: false }), finalRound('f', withId(single, 'f1'))],
      { leaderboard: 'end' },
    );
    let s = must(start(lobbyWith(finalQuiz, 'Олена', 'Тарас')));
    s = must(next(s, 0, rng));
    s = must(submitAnswer(s, 'p1', correct, 1000));
    s = must(submitAnswer(s, 'p2', correct, 2000));
    for (let guard = 0; s.phase !== 'wager' && guard < 10; guard += 1) s = must(next(s, 3000 + guard, rng));
    expect(s.phase).toBe('wager');
    s = must(placeWager(s, 'p1', 200, 4000, rng));
    s = must(placeWager(s, 'p2', 500, 4500, rng));
    expect(s.phase).toBe('question');
    s = must(submitAnswer(s, 'p1', correct, 5000));
    s = must(submitAnswer(s, 'p2', wrong, 5500));
    s = must(next(s, 6000, rng));
    expect(s.phase).toBe('reveal');
    expect(s.final?.order).toEqual(['p1', 'p2']);
    s = must(adjustScore(s, 'p2', 100, 6500));
    // До розкриття p2 бачить рахунок до фіналу з коригуванням, без результату фіналу.
    expect(playerView(s, 'p2')?.me.score).toBe(1100);
    s = must(next(s, 7000, rng));
    s = must(next(s, 8000, rng));
    expect(s.final?.shown).toBe(2);
    expect(playerView(s, 'p2')?.me.score).toBe(600);
    const shown = stageView(s).final?.shown.find((entry) => entry.playerId === 'p2');
    expect(shown).toMatchObject({ before: 1100, after: 600 });
  });

  it('lastNotice gives the latest host adjustment with the nickname', () => {
    expect(lastNotice(must(start(lobby())))).toBeNull();
    let state = must(adjustScore(must(start(lobby())), 'p1', -100, T0));
    state = must(adjustScore(state, 'p2', 50, T0 + 10, 'duel'));
    expect(lastNotice(state)).toEqual({ seq: 1, at: T0, nickname: 'Олена', points: -100 });
    expect(lastNotice(must(removePlayer(state, 'p1')))).toBeNull();
  });
});
