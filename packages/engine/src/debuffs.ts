import { allowedDebuffs, type DebuffKind } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { fail, ok, type DebuffState, type GameState, type Play, type Result } from './game';

/**
 * Наслати дебаф. Етапи lobby/finished → wrong_phase; невідомий гравець → not_found;
 * вікторина не дозволяє цей дебаф → not_allowed; дебаф чекає або діє → debuff_busy; застарілий спрацьований перезаписується.
 */
export function setDebuff(state: GameState, playerId: string, kind: DebuffKind): Result {
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (!allowedDebuffs(state.quiz).includes(kind)) return fail('not_allowed');
  if (shownDebuff(state, playerId) !== null) return fail('debuff_busy');
  return ok({ ...state, debuffs: { ...state.debuffs, [playerId]: { kind, firedAt: null, since: null } } });
}

/** Скасувати дебаф, що чекає. Немає дебафу → not_found; дебаф уже діє → wrong_phase. */
export function cancelDebuff(state: GameState, playerId: string): Result {
  const debuff = shownDebuff(state, playerId);
  if (debuff === null) return fail('not_found');
  if (debuff.firedAt !== null) return fail('wrong_phase');
  return ok({ ...state, debuffs: withoutKey(state.debuffs, playerId) });
}

/**
 * Гравці, що відповідають на це запитання зі свого телефона: на звичайній клітинці поля — лише вибравший
 * (усна — ніхто), на бліц-клітинці й в усіх інших раундах — усі.
 */
export function answerersOf(state: GameState, play: Play): string[] {
  const board = play.board;
  if (board !== undefined && board.kind !== 'blitz') return board.answerMode === 'voice' ? [] : [board.chooserId];
  return state.players.map((p) => p.id);
}

/** Викликається в кінці openQuestion: прибирає застарілі спрацьовані, запускає ті, що чекають, для підключених answerersOf. */
export function fireDebuffs(state: GameState, now: number): GameState {
  const play = state.plays[state.questionIndex];
  const answering = new Set(play === undefined ? [] : answerersOf(state, play));
  const connected = new Set(state.players.filter((p) => p.connected).map((p) => p.id));
  const debuffs: Record<string, DebuffState> = {};
  for (const [playerId, debuff] of Object.entries(state.debuffs)) {
    if (debuff.firedAt !== null) continue;
    const fires = answering.has(playerId) && connected.has(playerId);
    debuffs[playerId] = fires ? { ...debuff, firedAt: state.questionIndex, since: now } : debuff;
  }
  return { ...state, debuffs };
}

/** Викликається в lockNow: прибирає спрацьовані. */
export function spendDebuffs(state: GameState): GameState {
  const entries = Object.entries(state.debuffs);
  if (entries.every(([, debuff]) => debuff.firedAt === null)) return state;
  return { ...state, debuffs: Object.fromEntries(entries.filter(([, debuff]) => debuff.firedAt === null)) };
}

/** Дебаф, що діє зараз: firedAt === questionIndex і етап question; інакше null. */
export function activeDebuff(state: GameState, playerId: string): DebuffState | null {
  const debuff = Object.hasOwn(state.debuffs, playerId) ? state.debuffs[playerId] : undefined;
  if (debuff === undefined || debuff.firedAt === null) return null;
  return state.phase === 'question' && debuff.firedAt === state.questionIndex ? debuff : null;
}

/** Дебаф, що чекає або діє (для значка сцени й пульта); застарілий або після кінця гри — null. */
export function shownDebuff(state: GameState, playerId: string): DebuffState | null {
  const debuff = Object.hasOwn(state.debuffs, playerId) ? state.debuffs[playerId] : undefined;
  if (debuff === undefined || state.phase === 'finished') return null;
  return debuff.firedAt === null ? debuff : activeDebuff(state, playerId);
}

/** Копія записів без гравця. */
function withoutKey<T>(record: Record<string, T>, playerId: string): Record<string, T> {
  const { [playerId]: _removed, ...rest } = record;
  return rest;
}
