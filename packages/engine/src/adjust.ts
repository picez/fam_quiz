import { LIMITS, type AdjustmentNotice, type AdjustmentSource } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { fail, ok, withTotals, type GameState, type Result } from './game';

/**
 * Коригування рахунку гравця поза відповідями (бали від ведучого, пізніше — дуелі).
 * Етапи lobby і finished → wrong_phase; невідомий гравець → not_found; не ціле, 0 або |points| > maxAdjust → points_invalid.
 */
export function adjustScore(state: GameState, playerId: string, points: number, now: number, source: AdjustmentSource = 'host'): Result {
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > LIMITS.maxAdjust) return fail('points_invalid');
  const seq = state.adjustmentSeq + 1;
  // Відкрите запитання завжди останнє в журналі.
  const afterQuestion = state.phase === 'question' ? state.plays.length - 1 : state.plays.length;
  const adjustment = { seq, playerId, points, roundIndex: state.roundIndex, afterQuestion, source, at: now };
  return ok(withTotals({ ...state, adjustments: [...state.adjustments, adjustment], adjustmentSeq: seq }));
}

/** Сума всіх коригувань гравця. */
export function adjustmentTotal(state: GameState, playerId: string): number {
  return state.adjustments.reduce((sum, a) => (a.playerId === playerId ? sum + a.points : sum), 0);
}

/** Останнє коригування з source 'host' гравця, який ще в грі; інакше null. */
export function lastNotice(state: GameState): AdjustmentNotice | null {
  for (let i = state.adjustments.length - 1; i >= 0; i -= 1) {
    const adjustment = state.adjustments[i];
    if (adjustment.source !== 'host') continue;
    const player = state.players.find((p) => p.id === adjustment.playerId);
    if (player === undefined) continue;
    return { seq: adjustment.seq, at: adjustment.at, nickname: player.nickname, points: adjustment.points };
  }
  return null;
}
