import { betMinimum, type BetsRound, type ErrorCode, type FinalRound, type Phase, type Round } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { currentRound, openQuestion, withCurrentPlay, type GameState, type Rng } from './game';

// «Ставки» (27a): перед кожним запитанням таємна ставка від мінімуму, що росте на крок; бали дає лише банк тих, хто грає.

/** Етапи, на яких запитання раунду bets відкрито (банк ще можна перерахувати). */
export const BETS_OPEN_PHASES: readonly Phase[] = ['question', 'locked', 'reveal'];

/** Раунд зі ставками: final або bets. */
export function wagerRound(round: Round | null | undefined): round is FinalRound | BetsRound {
  return round?.type === 'final' || round?.type === 'bets';
}

/** Поточний раунд, якщо це «Ставки». */
function betsRoundOf(state: GameState): BetsRound | null {
  const round = currentRound(state);
  return round?.type === 'bets' ? round : null;
}

/** k — номер запитання раунду bets: на wager — наступного, на question…leaderboard — поточного; поза раундом -1. */
export function betsIndex(state: GameState): number {
  if (betsRoundOf(state) === null) return -1;
  const played = state.plays.filter((play) => play.roundIndex === state.roundIndex).length;
  return state.phase === 'intro' || state.phase === 'wager' ? played : Math.max(0, played - 1);
}

/** Мінімальна ставка запитання k раунду bets; поза ним (чи коли запитань не лишилося) — null. */
export function betsMinimumNow(state: GameState): number | null {
  const round = betsRoundOf(state);
  const index = betsIndex(state);
  if (round === null || index >= round.questions.length) return null;
  return betMinimum(round, index);
}

/** Межа ставки гравця за рахунком зараз: max(0, рахунок), у bets ще не більше betMax. */
export function betLimit(state: GameState, playerId: string): number {
  const score = Math.max(0, state.players.find((p) => p.id === playerId)?.score ?? 0);
  const round = betsRoundOf(state);
  return round === null || round.betMax === null ? score : Math.min(round.betMax, score);
}

/** Межа зі стану ставок (знята на вході в wager, далі йде за балами від ведучого); без запису — 0. */
export function wagerLimitOf(state: GameState, playerId: string): number {
  const limits = state.final?.limits;
  return limits !== undefined && Object.hasOwn(limits, playerId) ? limits[playerId] : 0;
}

/** Ставки запитання k: межа кожного гравця за рахунком, ставок ще немає; таймера немає. */
export function enterBetsWager(state: GameState): GameState {
  const limits = Object.fromEntries(state.players.map((p) => [p.id, betLimit(state, p.id)]));
  return {
    ...state,
    phase: 'wager',
    startedAt: null,
    endsAt: null,
    remainingMs: null,
    final: { limits, wagers: {}, allIn: [], order: [], shown: 0, split: false },
  };
}

/** Відкриває запитання k; грають лише ті, хто поставив і досі може (межа ≥ мінімуму), решта пропускає. */
export function openBetsQuestion(state: GameState, now: number, rng: Rng): GameState {
  const round = betsRoundOf(state);
  const question = round?.questions[betsIndex(state)];
  const minimum = betsMinimumNow(state);
  if (round === null || question === undefined || minimum === null || state.final === null) return state;
  const placed = state.final.wagers;
  const wagers: Record<string, number> = Object.fromEntries(
    state.players
      .filter((p) => Object.hasOwn(placed, p.id) && wagerLimitOf(state, p.id) >= minimum)
      .map((p) => [p.id, placed[p.id]]),
  );
  const opened = openQuestion(state, question, now, rng);
  return withCurrentPlay(opened, { ...opened.plays[opened.questionIndex], final: { wagers, allIn: [], graded: [] } });
}

/** Хто грає поточне запитання bets (ключі play.final.wagers); null поза відкритим запитанням bets. */
export function betsPlaying(state: GameState): string[] | null {
  if (betsRoundOf(state) === null || !BETS_OPEN_PHASES.includes(state.phase)) return null;
  const play = state.plays[state.questionIndex];
  if (play?.final === undefined || play.roundIndex !== state.roundIndex) return null;
  return Object.keys(play.final.wagers);
}

/** 'bet_skipped' для того, хто не грає відкрите запитання bets; інакше null. */
export function betsRefusal(state: GameState, playerId: string): ErrorCode | null {
  const playing = betsPlaying(state);
  return playing !== null && !playing.includes(playerId) ? 'bet_skipped' : null;
}
