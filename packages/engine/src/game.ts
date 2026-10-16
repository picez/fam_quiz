import {
  LIMITS,
  type Answer,
  type ErrorCode,
  type Grade,
  type Phase,
  type Question,
  type Quiz,
  type Round,
} from '@quiz/shared';
import { checkAnswer } from './check';
import { normalizeText } from './normalize';
import { answerPoints, speedFactor, streakBonus } from './score';

export interface PlayerState {
  id: string;
  nickname: string;
  connected: boolean;
  score: number;
  totalTimeMs: number;
  /** Поточна серія правильних відповідей у поточному раунді. */
  streak: number;
}

export interface AnswerRecord {
  answer: Answer;
  timeMs: number;
  accepted: boolean;
  accuracy: number;
  grade: Grade;
  /** Бали за відповідь без бонусу серії, зі штрафом. */
  basePoints: number;
  streakBonus: number;
  /** basePoints + streakBonus. */
  points: number;
  overridden: boolean;
}

/** Одне зігране запитання; ключ answers є id гравця. */
export interface Play {
  roundIndex: number;
  question: Question;
  answers: Record<string, AnswerRecord>;
}

export interface GameState {
  quiz: Quiz;
  phase: Phase;
  /** -1 у лобі. */
  roundIndex: number;
  /** Індекс у plays: поточне або останнє зігране запитання; -1 до першого. */
  questionIndex: number;
  players: PlayerState[];
  /** Журнал запитань у порядку гри. */
  plays: Play[];
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
    roundIndex: -1,
    questionIndex: -1,
    players: [],
    plays: [],
    presented: [],
    startedAt: null,
    endsAt: null,
    paused: false,
    remainingMs: null,
  };
}

export function recordOf(state: GameState, playIndex: number, playerId: string): AnswerRecord | undefined {
  const byPlayer = state.plays[playIndex]?.answers;
  return byPlayer !== undefined && Object.hasOwn(byPlayer, playerId) ? byPlayer[playerId] : undefined;
}

export function currentRound(state: GameState): Round | null {
  return state.quiz.rounds[state.roundIndex] ?? null;
}

/** 0-базовий номер поточного запитання в раунді; -1, поки в раунді не було запитань. */
export function roundQuestionNumber(state: GameState): number {
  const upToCurrent = state.plays.slice(0, state.questionIndex + 1);
  return upToCurrent.filter((play) => play.roundIndex === state.roundIndex).length - 1;
}

/** Оцінка відповіді за точністю автоматичної перевірки. */
function gradeOf(accuracy: number): Grade {
  return accuracy >= 1 ? 'correct' : accuracy <= 0 ? 'wrong' : 'partial';
}

/** Записує відповідь гравця в поточне запитання. */
function withRecord(state: GameState, playerId: string, record: AnswerRecord): GameState {
  const plays = state.plays.map((play, index) =>
    index === state.questionIndex ? { ...play, answers: { ...play.answers, [playerId]: record } } : play,
  );
  return { ...state, plays };
}

export function addPlayer(state: GameState, player: { id: string; nickname: string }): Result {
  if (state.phase !== 'lobby') return fail('wrong_phase');
  const nickname = player.nickname.replace(/\s+/g, ' ').trim();
  if (nickname.length < LIMITS.nicknameMin || nickname.length > LIMITS.nicknameMax) return fail('nickname_invalid');
  if (state.players.length >= LIMITS.maxPlayers) return fail('room_full');
  const key = normalizeText(nickname);
  if (state.players.some((p) => normalizeText(p.nickname) === key)) return fail('nickname_taken');
  const added: PlayerState = { id: player.id, nickname, connected: true, score: 0, totalTimeMs: 0, streak: 0 };
  return ok({ ...state, players: [...state.players, added] });
}

export function removePlayer(state: GameState, playerId: string): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const plays = state.plays.map((play) => {
    const { [playerId]: _removed, ...rest } = play.answers;
    return { ...play, answers: rest };
  });
  return ok(autoLock({ ...state, players: state.players.filter((p) => p.id !== playerId), plays }));
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

/** Наступне запитання поточного раунду: перше за порядком, якого ще немає в журналі цього раунду. */
function nextQuestion(state: GameState): Question | undefined {
  const round = currentRound(state);
  if (round === null) return undefined;
  const played = new Set(state.plays.filter((p) => p.roundIndex === state.roundIndex).map((p) => p.question.id));
  return round.questions.find((question) => !played.has(question.id));
}

function openQuestion(state: GameState, question: Question, now: number, rng: Rng): GameState {
  const round = state.quiz.rounds[state.roundIndex];
  const play: Play = { roundIndex: state.roundIndex, question, answers: {} };
  return {
    ...state,
    phase: 'question',
    questionIndex: state.plays.length,
    plays: [...state.plays, play],
    presented: present(question, round.shuffleOptions, rng),
    startedAt: now,
    endsAt: now + question.timeLimit * 1000,
    remainingMs: null,
  };
}

/** Після останнього раунду гра закінчується, інакше показуються підсумки раунду. */
function finishRound(state: GameState): GameState {
  const isLastRound = state.roundIndex === state.quiz.rounds.length - 1;
  return { ...state, phase: isLastRound ? 'finished' : 'round_end' };
}

/** Відкриває наступне запитання раунду, а коли їх не лишилося, завершує раунд. */
function advance(state: GameState, now: number, rng: Rng): GameState {
  const question = nextQuestion(state);
  return question !== undefined ? openQuestion(state, question, now, rng) : finishRound(state);
}

/**
 * Серія кожного гравця після перших upTo запитань журналу: поспіль правильні відповіді в раунді
 * останнього з них. Без відповіді серія перервана; на межі раундів вона скидається;
 * якщо правил серії в тому раунді немає, серій немає.
 */
export function streakCounts(state: GameState, upTo: number): Record<string, number> {
  const last = state.plays[upTo - 1];
  if (last === undefined || state.quiz.rounds[last.roundIndex].rules.streak === null) return {};
  const counts: Record<string, number> = {};
  for (const player of state.players) {
    let count = 0;
    for (let i = upTo - 1; i >= 0 && state.plays[i].roundIndex === last.roundIndex; i -= 1) {
      const record = recordOf(state, i, player.id);
      if (record === undefined || record.accuracy < 1) break;
      count += 1;
    }
    counts[player.id] = count;
  }
  return counts;
}

/** Перераховує рахунок, серії й сумарний час за всіма вже закритими запитаннями. */
function withTotals(state: GameState): GameState {
  // Відкрите запитання завжди останнє в журналі.
  const closedCount = state.phase === 'question' ? state.plays.length - 1 : state.plays.length;
  const plays = state.plays.map((play, index) => {
    if (index >= closedCount) return play;
    const streak = state.quiz.rounds[play.roundIndex].rules.streak;
    if (streak === null) return play;
    // Серія враховує і саме це запитання.
    const counters = streakCounts(state, index + 1);
    const answers = { ...play.answers };
    for (const player of state.players) {
      const record = Object.hasOwn(answers, player.id) ? answers[player.id] : undefined;
      if (record === undefined) continue;
      const bonus = (counters[player.id] ?? 0) >= streak.length ? streakBonus(record.basePoints, streak.bonus) : 0;
      answers[player.id] = { ...record, streakBonus: bonus, points: record.basePoints + bonus };
    }
    return { ...play, answers };
  });

  const counters = state.plays[closedCount - 1]?.roundIndex === state.roundIndex ? streakCounts(state, closedCount) : {};
  const players = state.players.map((player) => {
    let score = 0;
    let totalTimeMs = 0;
    for (const play of plays.slice(0, closedCount)) {
      const record = Object.hasOwn(play.answers, player.id) ? play.answers[player.id] : undefined;
      score += record ? record.points : 0;
      totalTimeMs += record ? record.timeMs : play.question.timeLimit * 1000;
    }
    return { ...player, score, totalTimeMs, streak: counters[player.id] ?? 0 };
  });
  return { ...state, plays, players };
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
  const first = { ...state, roundIndex: 0 };
  // Вікторина з одним раундом обходиться без заставки, як і раніше.
  if (state.quiz.rounds.length > 1) return ok({ ...first, phase: 'intro' });
  return ok(advance(first, now, rng));
}

export function submitAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || state.endsAt === null || now > state.endsAt) return fail('time_over');

  const { question, roundIndex } = state.plays[state.questionIndex];
  if (question.type !== answer.type) return fail('type_mismatch');
  const round = state.quiz.rounds[roundIndex];

  const timeMs = Math.max(0, now - state.startedAt);
  const { accepted, accuracy } = checkAnswer(question, answer);
  const speed = speedFactor(timeMs, question.timeLimit * 1000, round.speedBonus);
  const points = answerPoints({
    points: question.points,
    accuracy,
    speed,
    multiplier: round.rules.multiplier,
    penalty: round.rules.penalty,
  });
  const record: AnswerRecord = {
    answer,
    timeMs,
    accepted,
    accuracy,
    grade: gradeOf(accuracy),
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
  return ok(autoLock(withRecord(state, playerId, record)));
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
  switch (state.phase) {
    case 'intro':
      return ok(advance(state, now, rng));
    case 'locked':
      return ok({ ...state, phase: 'reveal' });
    case 'reveal':
      if (nextQuestion(state) === undefined) return ok(finishRound(state));
      if (state.quiz.settings.leaderboard === 'each') return ok({ ...state, phase: 'leaderboard' });
      return ok(advance(state, now, rng));
    case 'leaderboard':
      return ok(advance(state, now, rng));
    case 'round_end':
      // Нова серія в новому раунді починається з нуля.
      return ok(withTotals({ ...state, phase: 'intro', roundIndex: state.roundIndex + 1 }));
    default:
      return fail('wrong_phase');
  }
}

const IN_ROUND: Phase[] = ['intro', 'question', 'locked', 'reveal', 'leaderboard'];

/** Ведучий завершує раунд достроково; незіграні запитання раунду так і лишаються незіграними. */
export function endRound(state: GameState, now: number): Result {
  if (!IN_ROUND.includes(state.phase)) return fail('wrong_phase');
  // Відкрите запитання спершу закривається й оцінюється, як при lock.
  const closed = state.phase === 'question' ? lockNow(state) : state;
  return ok(finishRound({ ...closed, paused: false, startedAt: null, endsAt: null, remainingMs: null }));
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
    const limitMs = state.plays[state.questionIndex].question.timeLimit * 1000;
    const endsAt = now + state.remainingMs;
    // startedAt зсувається так, щоб час відповіді не включав паузу.
    return ok(autoLock({ ...state, paused: false, remainingMs: null, endsAt, startedAt: endsAt - limitMs }));
  }
  return ok({ ...state, paused: false });
}

/** Ведучий вручну виставляє оцінку відповіді на поточне запитання. */
export function override(state: GameState, playerId: string, grade: Grade): Result {
  if (state.phase !== 'reveal') return fail('wrong_phase');
  const record = recordOf(state, state.questionIndex, playerId);
  if (record === undefined) return fail('not_found');

  const { question, roundIndex } = state.plays[state.questionIndex];
  const round = state.quiz.rounds[roundIndex];
  if (grade === 'partial' && round.rules.partial === null) return fail('partial_disabled');
  const accuracy = grade === 'correct' ? 1 : grade === 'partial' ? (round.rules.partial ?? 0) / 100 : 0;
  const speed = speedFactor(record.timeMs, question.timeLimit * 1000, round.speedBonus);
  const points = answerPoints({
    points: question.points,
    accuracy,
    speed,
    multiplier: round.rules.multiplier,
    penalty: round.rules.penalty,
  });
  const updated: AnswerRecord = {
    ...record,
    accepted: grade === 'correct',
    accuracy,
    grade,
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: true,
  };
  return ok(withTotals(withRecord(state, playerId, updated)));
}

export function end(state: GameState): Result {
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  return ok(
    withTotals({ ...state, phase: 'finished', paused: false, startedAt: null, endsAt: null, remainingMs: null }),
  );
}
