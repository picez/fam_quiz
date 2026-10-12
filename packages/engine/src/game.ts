import { LIMITS, type Answer, type ErrorCode, type Phase, type Quiz } from '@quiz/shared';
import { normalizeText } from './normalize';

export interface PlayerState {
  id: string;
  nickname: string;
  connected: boolean;
  score: number;
  totalTimeMs: number;
}

export interface AnswerRecord {
  answer: Answer;
  timeMs: number;
  accepted: boolean;
  accuracy: number;
  points: number;
  overridden: boolean;
}

export interface GameState {
  quiz: Quiz;
  phase: Phase;
  /** -1 у лобі. */
  questionIndex: number;
  players: PlayerState[];
  /** Індекс масиву дорівнює індексу запитання; ключ об'єкта є id гравця. */
  answers: Record<string, AnswerRecord>[];
  /** Порядок варіантів або елементів поточного запитання, однаковий для всіх. */
  presented: string[];
  startedAt: number | null;
  endsAt: number | null;
  paused: boolean;
  /** Залишок часу запитання під час паузи. */
  remainingMs: number | null;
}

export type Result = { ok: true; state: GameState } | { ok: false; error: ErrorCode };

export const ok = (state: GameState): Result => ({ ok: true, state });
export const fail = (error: ErrorCode): Result => ({ ok: false, error });

export function createGame(quiz: Quiz): GameState {
  return {
    quiz,
    phase: 'lobby',
    questionIndex: -1,
    players: [],
    answers: quiz.questions.map(() => ({})),
    presented: [],
    startedAt: null,
    endsAt: null,
    paused: false,
    remainingMs: null,
  };
}

export function recordOf(state: GameState, questionIndex: number, playerId: string): AnswerRecord | undefined {
  const byPlayer = state.answers[questionIndex];
  return byPlayer !== undefined && Object.hasOwn(byPlayer, playerId) ? byPlayer[playerId] : undefined;
}

export function addPlayer(state: GameState, player: { id: string; nickname: string }): Result {
  if (state.phase !== 'lobby') return fail('wrong_phase');
  const nickname = player.nickname.replace(/\s+/g, ' ').trim();
  if (nickname.length < LIMITS.nicknameMin || nickname.length > LIMITS.nicknameMax) return fail('nickname_invalid');
  if (state.players.length >= LIMITS.maxPlayers) return fail('room_full');
  const key = normalizeText(nickname);
  if (state.players.some((p) => normalizeText(p.nickname) === key)) return fail('nickname_taken');
  const added: PlayerState = { id: player.id, nickname, connected: true, score: 0, totalTimeMs: 0 };
  return ok({ ...state, players: [...state.players, added] });
}

export function removePlayer(state: GameState, playerId: string): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const answers = state.answers.map((byPlayer) => {
    const { [playerId]: _removed, ...rest } = byPlayer;
    return rest;
  });
  return ok({ ...state, players: state.players.filter((p) => p.id !== playerId), answers });
}

export function setConnected(state: GameState, playerId: string, connected: boolean): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const players = state.players.map((p) => (p.id === playerId ? { ...p, connected } : p));
  return ok({ ...state, players });
}
