import { LIMITS, type AdjustmentNotice, type AdjustmentSource } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { fail, ok, withTotals, type GameState, type Result, type ScoreAdjustment } from './game';

/**
 * Коригування рахунку гравця поза відповідями (бали від ведучого, пізніше — дуелі).
 * Етапи lobby і finished → wrong_phase; невідомий гравець → not_found; не ціле, 0 або |points| > maxAdjust → points_invalid.
 */
export function adjustScore(state: GameState, playerId: string, points: number, now: number, source: AdjustmentSource = 'host'): Result {
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > LIMITS.maxAdjust) return fail('points_invalid');
  return ok(addAdjustment(state, playerId, points, now, source));
}

/** Скільки запитань журналу закрито зараз: відкрите запитання — останнє в журналі. */
export function afterQuestionNow(state: GameState): number {
  return state.phase === 'question' ? state.plays.length - 1 : state.plays.length;
}

/** Дописати коригування в журнал (без перевірок) і перерахувати бали; adjustScore, buyDebuff і undoScore стоять на ньому. */
export function addAdjustment(
  state: GameState,
  playerId: string,
  points: number,
  now: number,
  source: AdjustmentSource,
  extra: Pick<ScoreAdjustment, 'target' | 'debuff' | 'undoes' | 'batch'> & { roundIndex?: number } = {},
): GameState {
  const seq = state.adjustmentSeq + 1;
  // Скасування (12a) стоїть у раунді того, що скасовує; решта — у поточному.
  const { roundIndex = state.roundIndex, ...fields } = extra;
  const adjustment: ScoreAdjustment = {
    seq,
    playerId,
    points,
    roundIndex,
    afterQuestion: afterQuestionNow(state),
    source,
    at: now,
    ...fields,
  };
  return followWagerLimit(withTotals({ ...state, adjustments: [...state.adjustments, adjustment], adjustmentSeq: seq }), playerId);
}

/**
 * На етапі ставок межа йде за рахунком, тож «ставка ≤ рахунок» тримається і після балів від ведучого:
 * межа стає max(0, рахунок), а вже зроблена ставка понад неї зменшується до межі.
 * Ставка ва-банк дорівнює новій межі (і вгору, і вниз); межа 0 знімає ва-банк.
 */
function followWagerLimit(state: GameState, playerId: string): GameState {
  if (state.phase !== 'wager' || state.final === null) return state;
  const score = state.players.find((p) => p.id === playerId)?.score ?? 0;
  const limit = Math.max(0, score);
  const limits = { ...state.final.limits, [playerId]: limit };
  const placed = state.final.wagers;
  const has = Object.hasOwn(placed, playerId);
  const followsLimit = has && (state.final.allIn.includes(playerId) || placed[playerId] > limit);
  const wagers = followsLimit ? { ...placed, [playerId]: limit } : placed;
  const allIn = limit === 0 ? state.final.allIn.filter((id) => id !== playerId) : state.final.allIn;
  return { ...state, final: { ...state.final, limits, wagers, allIn } };
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
