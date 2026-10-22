import { fail, ok, openFinalQuestion, type GameState, type Result, type Rng } from './game';

/**
 * Таємна ставка гравця у фіналі: ціле число від 0 до межі; до відкриття запитання її можна змінити.
 * Коли поставили всі підключені гравці (і хоч один підключений), запитання відкривається.
 */
export function placeWager(state: GameState, playerId: string, amount: number, now: number, rng: Rng): Result {
  if (state.phase !== 'wager' || state.final === null) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const limit = Object.hasOwn(state.final.limits, playerId) ? state.final.limits[playerId] : 0;
  if (!Number.isInteger(amount) || amount < 0 || amount > limit) return fail('wager_invalid');
  const final = { ...state.final, wagers: { ...state.final.wagers, [playerId]: amount } };
  const placed = { ...state, final };
  const connected = placed.players.filter((p) => p.connected);
  const everyone = connected.length > 0 && connected.every((p) => Object.hasOwn(final.wagers, p.id));
  return ok(everyone ? openFinalQuestion(placed, now, rng) : placed);
}
