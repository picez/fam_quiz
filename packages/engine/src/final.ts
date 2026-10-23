import { fail, ok, openFinalQuestion, type GameState, type Result, type Rng } from './game';

/**
 * Таємна ставка гравця у фіналі: ціле число від 0 до межі; до відкриття запитання її можна змінити.
 * allIn — «Ва-банк»: ставиться вся межа (amount ігнорується); якщо межа > 0, ставка йде за межею до відкриття запитання.
 * Звичайна ставка знімає ва-банк. Коли поставили всі підключені гравці (і хоч один підключений), запитання відкривається.
 */
export function placeWager(state: GameState, playerId: string, amount: number, now: number, rng: Rng, allIn = false): Result {
  if (state.phase !== 'wager' || state.final === null) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const limit = Object.hasOwn(state.final.limits, playerId) ? state.final.limits[playerId] : 0;
  const amountToPlace = allIn ? limit : amount;
  if (!Number.isInteger(amountToPlace) || amountToPlace < 0 || amountToPlace > limit) return fail('wager_invalid');
  const others = state.final.allIn.filter((id) => id !== playerId);
  const final = {
    ...state.final,
    wagers: { ...state.final.wagers, [playerId]: amountToPlace },
    allIn: allIn && limit > 0 ? [...others, playerId] : others,
  };
  const placed = { ...state, final };
  const connected = placed.players.filter((p) => p.connected);
  const everyone = connected.length > 0 && connected.every((p) => Object.hasOwn(final.wagers, p.id));
  return ok(everyone ? openFinalQuestion(placed, now, rng) : placed);
}
