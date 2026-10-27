import { describe, expect, it } from 'vitest';
import { adjustScore, adjustmentTotal, lastNotice } from './adjust';
import { placeWager } from './final';
import { end, next, recordOf, removePlayer, start, submitAnswer, type GameState } from './game';
import { classicRound, finalRound, makeQuiz, makeRoundsQuiz, single, text, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { playerView, stageView } from './views';
import { undoScore } from './undo';
import { after1, answerAll, right, T0 as U0 } from './testing/undo';

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

  it('host points during the wager phase move the wager limit and clamp a placed wager', () => {
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
    expect(s.final?.limits).toEqual({ p1: 1000, p2: 1000 });
    s = must(placeWager(s, 'p1', 800, 4000, rng));
    // Мінус: межа падає до рахунку, ставка понад неї зменшується.
    s = must(adjustScore(s, 'p1', -500, 4100));
    expect(s.final?.limits.p1).toBe(500);
    expect(s.final?.wagers).toEqual({ p1: 500 });
    expect(placeWager(s, 'p1', 600, 4200, rng)).toEqual({ ok: false, error: 'wager_invalid' });
    // Нижче нуля межа лишається 0.
    s = must(adjustScore(s, 'p1', -900, 4300));
    expect(s.final?.limits.p1).toBe(0);
    expect(s.final?.wagers).toEqual({ p1: 0 });
    // Плюс піднімає межу, а ставку не чіпає.
    s = must(adjustScore(s, 'p1', 1400, 4400));
    expect(s.final?.limits.p1).toBe(1000);
    expect(s.final?.wagers).toEqual({ p1: 0 });
    // Гравець без ставки: межа оновлюється, ставка не з'являється.
    s = must(adjustScore(s, 'p2', 250, 4500));
    expect(s.final?.limits).toEqual({ p1: 1000, p2: 1250 });
    expect(Object.hasOwn(s.final!.wagers, 'p2')).toBe(false);
    s = must(placeWager(s, 'p2', 1250, 4600, rng));
    expect(s.phase).toBe('question');
  });

  it('host points outside the wager phase leave the final limits alone', () => {
    const finalQuiz = makeRoundsQuiz(
      [classicRound('r1', [single], { speedBonus: false }), finalRound('f', withId(single, 'f1'))],
      { leaderboard: 'end' },
    );
    let s = must(start(lobbyWith(finalQuiz, 'Олена', 'Тарас')));
    s = must(next(s, 0, rng));
    s = must(submitAnswer(s, 'p1', correct, 1000));
    s = must(submitAnswer(s, 'p2', correct, 2000));
    for (let guard = 0; s.phase !== 'wager' && guard < 10; guard += 1) s = must(next(s, 3000 + guard, rng));
    s = must(placeWager(s, 'p1', 300, 4000, rng));
    s = must(placeWager(s, 'p2', 300, 4100, rng));
    expect(s.phase).toBe('question');
    s = must(adjustScore(s, 'p1', -900, 4200));
    expect(s.final?.limits).toEqual({ p1: 1000, p2: 1000 });
  });

  it('lastNotice gives the latest host adjustment with the nickname', () => {
    expect(lastNotice(must(start(lobby())))).toBeNull();
    let state = must(adjustScore(must(start(lobby())), 'p1', -100, T0));
    state = must(adjustScore(state, 'p2', 50, T0 + 10, 'duel'));
    expect(lastNotice(state)).toEqual({ seq: 1, at: T0, nickname: 'Олена', points: -100 });
    expect(lastNotice(must(removePlayer(state, 'p1')))).toBeNull();
  });
});

describe('notices of undo', () => {
  const T = U0 + 3000;

  it('an undo of one answer tells the player, the sum, the round and the question', () => {
    const s = must(undoScore(after1(), { question: 0, playerId: 'p2' }, T));
    expect(lastNotice(s)).toEqual({ seq: 1, at: T, nickname: 'Петро', points: 1000, undo: { redo: false, players: 1, round: 1, question: 1 } });
  });

  it('«Повернути» is a redo notice', () => {
    const s1 = must(undoScore(after1(), { question: 0, playerId: 'p2' }, T));
    const s = must(undoScore(s1, { seq: 1 }, T + 100));
    expect(lastNotice(s)).toMatchObject({ seq: 2, nickname: 'Петро', points: -1000, undo: { redo: true, players: 1, round: 1, question: 1 } });
  });

  it('a whole question with host points of the player', () => {
    const revealed = adjustScore(after1(), 'p3', 50, U0 + 2500);
    const s = must(undoScore(must(revealed), { question: 0 }, T));
    expect(lastNotice(s)).toEqual({ seq: 5, at: T, nickname: 'Іра', points: -1050, undo: { redo: false, players: 3, round: 1, question: 1 } });
  });

  it('a round has no single question', () => {
    const two = must(next(answerAll(must(next(after1(), U0 + 2100, rng)), { p1: right, p2: right, p3: right }, U0 + 2200), U0 + 2600, rng));
    const s = must(undoScore(two, { round: 0 }, T));
    expect(lastNotice(s)).toMatchObject({ undo: { redo: false, players: 3, round: 1, question: null } });
  });

  it('host points after an undo are an ordinary notice again', () => {
    const s0 = must(undoScore(after1(), { question: 0, playerId: 'p2' }, T));
    const s = must(adjustScore(s0, 'p1', 25, T + 100));
    expect(lastNotice(s)).toEqual({ seq: 2, at: T + 100, nickname: 'Оля', points: 25 });
  });

  it('a removed player is skipped: the rest of the action, else the earlier host notice', () => {
    const s = must(undoScore(after1(), { question: 0 }, T));
    expect(lastNotice(must(removePlayer(s, 'p3')))).toMatchObject({ nickname: 'Петро', undo: { players: 2 } });
    const one = must(undoScore(must(adjustScore(after1(), 'p1', 10, U0 + 2500)), { question: 0, playerId: 'p2' }, T));
    expect(lastNotice(must(removePlayer(one, 'p2')))).toEqual({ seq: 1, at: U0 + 2500, nickname: 'Оля', points: 10 });
  });
});
