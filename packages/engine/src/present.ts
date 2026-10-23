import type { GameState, PlayerState } from './game';

/** Гравці, на яких чекають «усі відповіли» й «усі поставили»: підключені й ті, хто ще не повернувся після перезапуску. */
export function presentPlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.connected || state.awaiting.includes(p.id));
}
