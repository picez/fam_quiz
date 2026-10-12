import type { Quiz } from '@quiz/shared';
import { addPlayer, createGame, type GameState, type Result } from '../game';

export function must(result: Result): GameState {
  if (!result.ok) throw new Error(`unexpected engine error: ${result.error}`);
  return result.state;
}

/** Лобі з гравцями, які отримують id p1, p2, … у порядку аргументів. */
export function lobbyWith(quiz: Quiz, ...nicknames: string[]): GameState {
  return nicknames.reduce(
    (state, nickname, index) => must(addPlayer(state, { id: `p${index + 1}`, nickname })),
    createGame(quiz),
  );
}
