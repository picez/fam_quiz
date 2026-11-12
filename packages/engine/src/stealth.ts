import { allowedBuffs, allowedDebuffs, type StealthMark } from '@quiz/shared';
import { fail, ok, type GameState, type Result } from './game';

/**
 * «Прихований напад» (29h): учасник вмикає баф будь-коли під час гри, і наступний дебаф, який він купить, — анонімний для всіх.
 * Стан окремий (GameState.stealth), а не Play.buffs: баф не прив'язаний до запитання й не займає слот «один баф на запитання».
 */

/** Етапи, на яких баф не вмикається й позначки немає (на finished позначка лишається, увімкнути не можна). */
const OFF_PHASES = ['lobby', 'guide'] as const;

/** Чи може баф діяти в цій грі: дозволений, купівля ввімкнена, є дебафи. */
export function stealthOffered(state: GameState): boolean {
  const quiz = state.quiz;
  return allowedBuffs(quiz).includes('stealth') && quiz.settings.debuffShop !== false && allowedDebuffs(quiz).length > 0;
}

/** Увімкнути (29h). Помилки по черзі: not_found, not_allowed, wrong_phase (lobby/guide/finished), buff_used. Пауза й shopBlock не заважають. */
export function takeStealth(state: GameState, participant: string, now: number): Result {
  if (!state.players.some((p) => p.id === participant)) return fail('not_found');
  if (!stealthOffered(state)) return fail('not_allowed');
  if (state.phase === 'lobby' || state.phase === 'guide' || state.phase === 'finished') return fail('wrong_phase');
  if (state.stealth !== undefined && Object.hasOwn(state.stealth, participant)) return fail('buff_used');
  return ok({ ...state, stealth: { ...state.stealth, [participant]: { at: now, spent: null } } });
}

/** Увімкнено й ще не витрачено. */
export function stealthReady(state: GameState, participant: string): boolean {
  const own = state.stealth !== undefined && Object.hasOwn(state.stealth, participant) ? state.stealth[participant] : undefined;
  return own !== undefined && own.spent === null;
}

/** Позначити витраченим анонімною покупкою з коригуванням seq; без готового бафа — той самий стан. */
export function spendStealth(state: GameState, participant: string, seq: number): GameState {
  if (!stealthReady(state, participant) || state.stealth === undefined) return state;
  return { ...state, stealth: { ...state.stealth, [participant]: { ...state.stealth[participant], spent: seq } } };
}

/** Позначка власника; undefined — !stealthOffered або lobby/guide. */
export function stealthMark(state: GameState, participant: string): StealthMark | undefined {
  if (!stealthOffered(state) || (OFF_PHASES as readonly string[]).includes(state.phase)) return undefined;
  const own = state.stealth !== undefined && Object.hasOwn(state.stealth, participant) ? state.stealth[participant] : undefined;
  if (own === undefined) return 'ready';
  return own.spent === null ? 'armed' : 'used';
}
