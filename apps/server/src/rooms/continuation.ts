import { READABLE_STATE_VERSIONS, type GameState } from '@quiz/engine';

/** Версія формату saved_game.data (13b). */
export const SAVED_GAME_VERSION = 1;

/** Що лежить у saved_game.data. */
export interface SavedGameData {
  v: typeof SAVED_GAME_VERSION;
  stateVersion: number;
  /** Контрольна точка: стан на межі між запитаннями (restPoint). */
  state: GameState;
  /** Мить контрольної точки за годинником менеджера. */
  at: number;
  /** Лише люди контрольної точки (slotsOf і гравці рушія). */
  playerUsers: [string, string][];
  quizId: string | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** v === 1, stateVersion — число, state — об'єкт із масивом players, at — число, playerUsers — масив. Версію стану НЕ перевіряє. */
export function isSavedGameData(raw: unknown): raw is SavedGameData {
  if (!isObject(raw)) return false;
  return (
    raw.v === SAVED_GAME_VERSION &&
    typeof raw.stateVersion === 'number' &&
    isObject(raw.state) &&
    Array.isArray(raw.state.players) &&
    typeof raw.at === 'number' &&
    Array.isArray(raw.playerUsers)
  );
}

/** isSavedGameData і READABLE_STATE_VERSIONS.includes(stateVersion). */
export function exactSaved(raw: unknown): raw is SavedGameData {
  return isSavedGameData(raw) && READABLE_STATE_VERSIONS.includes(raw.stateVersion);
}
