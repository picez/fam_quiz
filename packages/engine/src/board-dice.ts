import { fail, ok, type BoardState, type DiceState, type GameState, type Result, type Rng } from './game';

/** Кубики кидають лише на заставці раунду поля. */
function inBoardIntro(state: GameState): boolean {
  return state.phase === 'intro' && state.board !== null;
}

/** Порядок за спаданням послідовностей кидків; рівні (без кидків) — у порядку playerIds. */
export function diceOrder(playerIds: string[], throws: Record<string, number[]>): string[] {
  return playerIds
    .map((id, index) => ({ id, index, seq: throws[id] ?? [] }))
    .sort((a, b) => compareThrows(b.seq, a.seq) || a.index - b.index)
    .map((entry) => entry.id);
}

/** Лексикографічне порівняння: [5, 6] > [5, 1] > [3] > [2]. */
function compareThrows(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

const sameThrows = (a: number[], b: number[]) => compareThrows(a, b) === 0;

/** Тур триває: заставку не можна пройти. */
export function dicePending(board: BoardState | null): boolean {
  return board?.dice != null && board.dice.tour.length > 0;
}

/** Тур закрито, коли всі кинули або в ньому менше двох гравців; нічия дає новий тур, інакше — порядок. */
function settle(board: BoardState, playerIds: string[]): BoardState {
  const dice = board.dice;
  if (dice === null) return board;
  const known = new Set(playerIds);
  const tour = dice.tour.filter((id) => known.has(id));
  const waiting = dice.waiting.filter((id) => known.has(id));
  if (waiting.length > 0 && tour.length >= 2) return { ...board, dice: { ...dice, tour, waiting } };
  const seqOf = (id: string) => dice.throws[id] ?? [];
  const tied = playerIds.filter((id) => playerIds.some((other) => other !== id && sameThrows(seqOf(id), seqOf(other))));
  if (tied.length > 0) return { ...board, dice: { ...dice, tour: tied, waiting: [...tied], tourNo: dice.tourNo + 1 } };
  return {
    ...board,
    circle: diceOrder(playerIds, dice.throws),
    done: 0,
    circleNo: 1,
    dice: { ...dice, tour: [], waiting: [] },
  };
}

const idsOf = (state: GameState) => state.players.map((p) => p.id);

/** Ведучий вмикає кубики: кожен гравець кидає сам. Поки тур триває — wrong_phase. */
export function startDice(state: GameState): Result {
  if (!inBoardIntro(state) || state.board === null || dicePending(state.board)) return fail('wrong_phase');
  const ids = idsOf(state);
  // Одному гравцеві кидати ні з ким: порядок як за приходом, без кубиків (інакше лишився б порожній кубик).
  if (ids.length < 2) return ok({ ...state, board: { ...state.board, circle: ids, done: 0, circleNo: 1, dice: null } });
  const dice: DiceState = { throws: {}, tour: [...ids], waiting: [...ids], tourNo: 1 };
  return ok({ ...state, board: settle({ ...state.board, dice }, ids) });
}

function throwFor(dice: DiceState, playerId: string, rng: Rng): DiceState {
  const face = Math.floor(rng() * 6) + 1;
  return {
    ...dice,
    throws: { ...dice.throws, [playerId]: [...(dice.throws[playerId] ?? []), face] },
    waiting: dice.waiting.filter((id) => id !== playerId),
  };
}

/** Гравець кидає свій кубик; у кожному турі — один раз. */
export function rollDie(state: GameState, playerId: string, rng: Rng): Result {
  if (state.paused) return fail('paused');
  const dice = state.board?.dice ?? null;
  if (!inBoardIntro(state) || state.board === null || dice === null || !dicePending(state.board)) return fail('wrong_phase');
  if (!dice.waiting.includes(playerId)) return fail('not_your_turn');
  return ok({ ...state, board: settle({ ...state.board, dice: throwFor(dice, playerId, rng) }, idsOf(state)) });
}

/** Ведучий кидає за всіх, хто в поточному турі ще не кинув. */
export function rollForRest(state: GameState, rng: Rng): Result {
  const start = state.board?.dice ?? null;
  if (!inBoardIntro(state) || state.board === null || start === null || !dicePending(state.board)) return fail('wrong_phase');
  const dice = start.waiting.reduce((acc, id) => throwFor(acc, id, rng), start);
  return ok({ ...state, board: settle({ ...state.board, dice }, idsOf(state)) });
}

/** Вилучення гравця: зникає з throws/tour/waiting; тур, що через це скінчився, рахується. */
export function dropFromDice(board: BoardState, playerId: string, playerIds: string[]): BoardState {
  if (board.dice === null) return board;
  const { [playerId]: _gone, ...throws } = board.dice.throws;
  const wasPending = board.dice.tour.length > 0;
  const dice: DiceState = {
    ...board.dice,
    throws,
    tour: board.dice.tour.filter((id) => id !== playerId),
    waiting: board.dice.waiting.filter((id) => id !== playerId),
  };
  const remaining = playerIds.filter((id) => id !== playerId);
  return wasPending ? settle({ ...board, dice }, remaining) : { ...board, dice };
}
