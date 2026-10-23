import type { Answer, Quiz } from '@quiz/shared';
import { blitzRulesOf, buzz, isInstant } from '../blitz';
import { acceptAnswer, addPlayer, createGame, next, start, submitAnswer, type GameState, type Result, type Rng } from '../game';
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

/** Як lobbyWith, але гра із заставками. */
export function lobbyWithSplash(quiz: Quiz, ...nicknames: string[]): GameState {
  return nicknames.reduce(
    (state, nickname, index) => must(addPlayer(state, { id: `p${index + 1}`, nickname })),
    createGame(quiz, { transitions: true }),
  );
}

/** Лобі вікторини з поясненнями для новачків (settings.newcomers = true), гравці p1, p2, … */
export function lobbyWithGuide(quiz: Quiz, ...nicknames: string[]): GameState {
  return lobbyWith({ ...quiz, settings: { ...quiz.settings, newcomers: true } }, ...nicknames);
}

/** «Почати гру» (без now — без заставки раунду), потім «Почати раунд» о now. */
export function openAt(lobby: GameState, now: number, rng?: Rng): GameState {
  return must(next(must(start(lobby)), now, rng));
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

/** Відповідь у бліці: з кнопкою спершу натискання, у миттєвому бліці лише відповідь. */
export function sendBlitz(state: GameState, playerId: string, answer: Answer, now: number): GameState {
  const play = state.plays[state.questionIndex];
  const rules = play === undefined ? null : blitzRulesOf(state, play);
  const queued = rules !== null && isInstant(rules) ? state : must(buzz(state, playerId, now));
  return must(submitAnswer(queued, playerId, answer, now));
}
