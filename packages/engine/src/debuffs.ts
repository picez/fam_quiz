import { allowedDebuffs, debuffPrice, type DebuffKind, type Phase, type ShopBlock } from '@quiz/shared';
import { addAdjustment, afterQuestionNow } from './adjust';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { currentRound, fail, ok, type DebuffState, type GameState, type Play, type Result } from './game';

/**
 * Наслати дебаф. Етапи lobby/finished → wrong_phase; невідомий гравець → not_found;
 * вікторина не дозволяє цей дебаф → not_allowed; дебаф чекає або діє → debuff_busy; застарілий спрацьований перезаписується.
 */
export function setDebuff(state: GameState, playerId: string, kind: DebuffKind): Result {
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (!allowedDebuffs(state.quiz).includes(kind)) return fail('not_allowed');
  if (shownDebuff(state, playerId) !== null) return fail('debuff_busy');
  return ok({ ...state, debuffs: { ...state.debuffs, [playerId]: { kind, firedAt: null, since: null, by: null } } });
}

/**
 * Скасувати дебаф, що чекає. Немає дебафу → not_found; куплений гравцем → not_allowed (бали вже сплачено);
 * дебаф уже діє → wrong_phase.
 */
export function cancelDebuff(state: GameState, playerId: string): Result {
  const debuff = shownDebuff(state, playerId);
  if (debuff === null) return fail('not_found');
  if (debuff.by !== null) return fail('not_allowed');
  if (debuff.firedAt !== null) return fail('wrong_phase');
  return ok({ ...state, debuffs: withoutKey(state.debuffs, playerId) });
}

/** Етапи, у які гравець може купити дебаф (поза фінальним раундом). */
export const SHOP_PHASES: readonly Phase[] = ['intro', 'question', 'reveal', 'board', 'leaderboard', 'round_end'];

/**
 * Чому покупцеві зараз не купити: phase (етап поза SHOP_PHASES або фінальний раунд — ставки йдуть за рахунком),
 * paused, bought (уже купив у цьому циклі запитання); null — можна.
 * Цикл запитання — від закриття попереднього запитання до закриття поточного (той самий лічильник afterQuestion).
 */
export function shopBlock(state: GameState, buyerId: string): ShopBlock | null {
  if (!SHOP_PHASES.includes(state.phase) || currentRound(state)?.type === 'final') return 'phase';
  if (state.paused) return 'paused';
  const cycle = afterQuestionNow(state);
  const bought = state.adjustments.some((a) => a.source === 'debuff' && a.playerId === buyerId && a.afterQuestion === cycle);
  return bought ? 'bought' : null;
}

/** Код помилки покупки для кожної причини shopBlock. */
const BLOCK_ERRORS = { phase: 'wrong_phase', paused: 'paused', bought: 'debuff_bought' } as const;

/**
 * Гравець купує дебаф для суперника за debuffPrice. Помилки в такому порядку: not_found (немає покупця чи цілі),
 * not_allowed (ціль — сам покупець, дебаф не дозволено або купівлю вимкнено settings.debuffShop), wrong_phase / paused /
 * debuff_bought (shopBlock), debuff_busy (на цілі вже чекає або діє дебаф), points_short (score < ціна: у мінус не можна).
 * Успіх: коригування −ціна з source 'debuff', target, debuff; дебаф цілі { kind, firedAt: null, since: null, by: buyerId }.
 */
export function buyDebuff(state: GameState, buyerId: string, targetId: string, kind: DebuffKind, now: number): Result {
  const buyer = state.players.find((p) => p.id === buyerId);
  if (buyer === undefined || !state.players.some((p) => p.id === targetId)) return fail('not_found');
  if (targetId === buyerId || state.quiz.settings.debuffShop === false || !allowedDebuffs(state.quiz).includes(kind)) {
    return fail('not_allowed');
  }
  const block = shopBlock(state, buyerId);
  if (block !== null) return fail(BLOCK_ERRORS[block]);
  if (shownDebuff(state, targetId) !== null) return fail('debuff_busy');
  const price = debuffPrice(state.quiz, kind);
  // На дозволених етапах прихованих балів немає, тож score — справжній рахунок.
  if (buyer.score < price) return fail('points_short');
  const charged = addAdjustment(state, buyerId, -price, now, 'debuff', { target: targetId, debuff: kind });
  return ok({ ...charged, debuffs: { ...charged.debuffs, [targetId]: { kind, firedAt: null, since: null, by: buyerId } } });
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

/** Після паузи: since дебафів, що діють на цьому запитанні, зсувається на shiftMs — пауза не з'їдає їхній час. */
export function shiftDebuffClocks(state: GameState, shiftMs: number): GameState {
  if (shiftMs === 0) return state;
  let changed = false;
  const debuffs: Record<string, DebuffState> = {};
  for (const [playerId, debuff] of Object.entries(state.debuffs)) {
    const fired = debuff.firedAt === state.questionIndex && debuff.since !== null;
    debuffs[playerId] = fired ? { ...debuff, since: (debuff.since ?? 0) + shiftMs } : debuff;
    changed ||= fired;
  }
  return changed ? { ...state, debuffs } : state;
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
