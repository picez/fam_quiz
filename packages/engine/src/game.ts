import { LIMITS, type Answer, type ErrorCode, type Phase, type Question, type Quiz } from '@quiz/shared';
import { checkAnswer } from './check';
import { normalizeText } from './normalize';
import { scorePoints, speedFactor } from './score';

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
  return ok(autoLock({ ...state, players: state.players.filter((p) => p.id !== playerId), answers }));
}

export function setConnected(state: GameState, playerId: string, connected: boolean): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const players = state.players.map((p) => (p.id === playerId ? { ...p, connected } : p));
  return ok(autoLock({ ...state, players }));
}

export type Rng = () => number;

function shuffle<T>(items: T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function present(question: Question, shuffleOptions: boolean, rng: Rng): string[] {
  if (question.type === 'order') {
    const ids = question.items.map((item) => item.id);
    const mixed = shuffle(ids, rng);
    // Гравець не повинен отримати готову правильну відповідь.
    return mixed.every((id, index) => id === ids[index]) ? [...ids.slice(1), ids[0]] : mixed;
  }
  if (question.type === 'single' || question.type === 'multi') {
    const ids = question.options.map((option) => option.id);
    return shuffleOptions ? shuffle(ids, rng) : ids;
  }
  return [];
}

function openQuestion(state: GameState, index: number, now: number, rng: Rng): GameState {
  const question = state.quiz.questions[index];
  return {
    ...state,
    phase: 'question',
    questionIndex: index,
    presented: present(question, state.quiz.settings.shuffleOptions, rng),
    startedAt: now,
    endsAt: now + question.timeLimit * 1000,
    remainingMs: null,
  };
}

/** Перераховує рахунок і сумарний час за всіма вже закритими запитаннями. */
function withTotals(state: GameState): GameState {
  const open = state.phase === 'lobby' || state.phase === 'question';
  const lastClosed = open ? state.questionIndex - 1 : state.questionIndex;
  const players = state.players.map((player) => {
    let score = 0;
    let totalTimeMs = 0;
    for (let index = 0; index <= lastClosed; index++) {
      const record = recordOf(state, index, player.id);
      score += record ? record.points : 0;
      totalTimeMs += record ? record.timeMs : state.quiz.questions[index].timeLimit * 1000;
    }
    return { ...player, score, totalTimeMs };
  });
  return { ...state, players };
}

function lockNow(state: GameState): GameState {
  return withTotals({ ...state, phase: 'locked', startedAt: null, endsAt: null, remainingMs: null });
}

/** Закриває запитання, якщо відповіли всі підключені гравці. */
function autoLock(state: GameState): GameState {
  if (state.phase !== 'question' || state.paused) return state;
  const connected = state.players.filter((p) => p.connected);
  if (connected.length === 0) return state;
  const everyoneAnswered = connected.every((p) => recordOf(state, state.questionIndex, p.id) !== undefined);
  return everyoneAnswered ? lockNow(state) : state;
}

export function start(state: GameState, now: number, rng: Rng = Math.random): Result {
  if (state.phase !== 'lobby') return fail('wrong_phase');
  if (state.players.length === 0) return fail('no_players');
  return ok(openQuestion(state, 0, now, rng));
}

export function submitAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || state.endsAt === null || now > state.endsAt) return fail('time_over');

  const question = state.quiz.questions[state.questionIndex];
  if (question.type !== answer.type) return fail('type_mismatch');

  const timeMs = Math.max(0, now - state.startedAt);
  const { accepted, accuracy } = checkAnswer(question, answer);
  const speed = speedFactor(timeMs, question.timeLimit * 1000, state.quiz.settings.speedBonus);
  const record: AnswerRecord = {
    answer,
    timeMs,
    accepted,
    accuracy,
    points: scorePoints(question.points, accuracy, speed),
    overridden: false,
  };
  const answers = state.answers.map((byPlayer, index) =>
    index === state.questionIndex ? { ...byPlayer, [playerId]: record } : byPlayer,
  );
  return ok(autoLock({ ...state, answers }));
}

export function lock(state: GameState): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  return ok(lockNow(state));
}

/** Сервер викликає періодично; закриває запитання, коли сплив час. */
export function tick(state: GameState, now: number): GameState {
  const expired = state.phase === 'question' && !state.paused && state.endsAt !== null && now >= state.endsAt;
  return expired ? lockNow(state) : state;
}

export function next(state: GameState, now: number, rng: Rng = Math.random): Result {
  if (state.paused) return fail('paused');
  const isLast = state.questionIndex === state.quiz.questions.length - 1;
  switch (state.phase) {
    case 'locked':
      return ok({ ...state, phase: 'reveal' });
    case 'reveal':
      if (isLast) return ok({ ...state, phase: 'finished' });
      if (state.quiz.settings.leaderboard === 'each') return ok({ ...state, phase: 'leaderboard' });
      return ok(openQuestion(state, state.questionIndex + 1, now, rng));
    case 'leaderboard':
      return ok(openQuestion(state, state.questionIndex + 1, now, rng));
    default:
      return fail('wrong_phase');
  }
}

export function pause(state: GameState, now: number): Result {
  if (state.paused) return fail('paused');
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  if (state.phase === 'question' && state.endsAt !== null) {
    const remainingMs = Math.max(0, state.endsAt - now);
    return ok({ ...state, paused: true, remainingMs, startedAt: null, endsAt: null });
  }
  return ok({ ...state, paused: true });
}

export function resume(state: GameState, now: number): Result {
  if (!state.paused) return fail('wrong_phase');
  if (state.phase === 'question' && state.remainingMs !== null) {
    const limitMs = state.quiz.questions[state.questionIndex].timeLimit * 1000;
    const endsAt = now + state.remainingMs;
    // startedAt зсувається так, щоб час відповіді не включав паузу.
    return ok(autoLock({ ...state, paused: false, remainingMs: null, endsAt, startedAt: endsAt - limitMs }));
  }
  return ok({ ...state, paused: false });
}

/** Ведучий вручну зараховує або відхиляє відповідь на поточне запитання. */
export function override(state: GameState, playerId: string, accepted: boolean): Result {
  if (state.phase !== 'reveal') return fail('wrong_phase');
  const record = recordOf(state, state.questionIndex, playerId);
  if (record === undefined) return fail('not_found');

  const question = state.quiz.questions[state.questionIndex];
  const accuracy = accepted ? 1 : 0;
  const speed = speedFactor(record.timeMs, question.timeLimit * 1000, state.quiz.settings.speedBonus);
  const updated: AnswerRecord = {
    ...record,
    accepted,
    accuracy,
    points: scorePoints(question.points, accuracy, speed),
    overridden: true,
  };
  const answers = state.answers.map((byPlayer, index) =>
    index === state.questionIndex ? { ...byPlayer, [playerId]: updated } : byPlayer,
  );
  return ok(withTotals({ ...state, answers }));
}

export function end(state: GameState): Result {
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  return ok(
    withTotals({ ...state, phase: 'finished', paused: false, startedAt: null, endsAt: null, remainingMs: null }),
  );
}
