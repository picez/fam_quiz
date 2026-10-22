import type { Quiz } from '@quiz/shared';
import { acceptAnswer, addPlayer, createGame, next, start, type GameState, type Result, type Rng } from '../game';
import { pendingOf } from '../hold';

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

/** Ведучий тисне «Почати гру», а тоді «Почати раунд» у той самий момент: відкрито перше запитання. */
export function startRound(lobby: GameState, now: number, rng?: Rng): GameState {
  return must(next(must(start(lobby)), now, rng));
}

/** Ведучий тисне «Прийняти», доки є відповідь, що чекає на рішення. */
export function acceptAll(state: GameState, now: number): GameState {
  let current = state;
  while (pendingOf(current) !== null) current = must(acceptAnswer(current, pendingOf(current)?.playerId ?? '', now));
  return current;
}
