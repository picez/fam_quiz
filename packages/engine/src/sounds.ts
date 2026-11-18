import { ok, type GameState, type Result } from './game';

/**
 * Вимикач звуків сцени (40): будь-який етап, і на паузі — це налаштування показу, не хід гри.
 * on — прибрати ключ; те саме значення — ok без змін.
 */
export function setSounds(state: GameState, on: boolean): Result {
  if (on) {
    if (state.soundsOff === undefined) return ok(state);
    const { soundsOff: _off, ...rest } = state;
    return ok(rest);
  }
  if (state.soundsOff === true) return ok(state);
  return ok({ ...state, soundsOff: true });
}
