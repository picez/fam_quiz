import type { BlitzRound, ErrorCode } from '@quiz/shared';
import { checkAnswer } from './check';
// З game.ts лише типи: game.ts сам викликає цей файл, цикл під час виконання не потрібен.
import type { AnswerRecord, Attempt, BuzzEntry, GameState, Play, Result } from './game';
import { answerPoints } from './score';

const refuse = (error: ErrorCode): Result => ({ ok: false, error });

interface OpenBlitz {
  play: Play;
  blitz: { queue: BuzzEntry[]; attempts: Attempt[] };
  round: BlitzRound;
}

/** Поточне запитання бліцу разом з його раундом; null поза етапом question або в класичному раунді. */
function openBlitz(state: GameState): OpenBlitz | null {
  if (state.phase !== 'question') return null;
  const play = state.plays[state.questionIndex];
  const blitz = play?.blitz;
  const round = play === undefined ? undefined : state.quiz.rounds[play.roundIndex];
  return round?.type === 'blitz' && blitz !== undefined ? { play, blitz, round } : null;
}

/** Замінює поточне запитання в журналі. */
export function withPlay(state: GameState, play: Play): GameState {
  return { ...state, plays: state.plays.map((p, index) => (index === state.questionIndex ? play : p)) };
}

export function attemptsUsed(play: Play, playerId: string): number {
  return play.blitz?.attempts.filter((attempt) => attempt.playerId === playerId).length ?? 0;
}

function hasAttemptsLeft(round: BlitzRound, play: Play, playerId: string): boolean {
  return round.attempts === null || attemptsUsed(play, playerId) < round.attempts;
}

export function buzz(state: GameState, playerId: string, now: number): Result {
  const open = openBlitz(state);
  if (open === null) return refuse('wrong_phase');
  if (state.paused) return refuse('paused');
  if (!state.players.some((p) => p.id === playerId)) return refuse('not_found');
  if (state.endsAt === null || now > state.endsAt) return refuse('time_over');
  const { play, blitz, round } = open;
  if (blitz.queue.some((entry) => entry.playerId === playerId)) return refuse('already_queued');
  if (!hasAttemptsLeft(round, play, playerId)) return refuse('no_attempts');
  const entry: BuzzEntry = {
    playerId,
    at: now,
    deadline: round.answerWindow === null ? null : now + round.answerWindow * 1000,
    answer: null,
  };
  return { ok: true, state: withPlay(state, { ...play, blitz: { ...blitz, queue: [...blitz.queue, entry] } }) };
}

/** Підсумок усіх спроб гравця на запитання як звичайна відповідь. */
function summaryOf(attempts: Attempt[]): AnswerRecord {
  const won = attempts.some((attempt) => attempt.grade === 'correct');
  const basePoints = attempts.reduce((sum, attempt) => sum + attempt.points, 0);
  return {
    answer: attempts[attempts.length - 1].answer,
    timeMs: attempts[0].timeMs,
    accepted: won,
    accuracy: won ? 1 : 0,
    grade: won ? 'correct' : 'wrong',
    basePoints,
    streakBonus: 0,
    points: basePoints,
    overridden: false,
  };
}

/**
 * Розглядає чергу з голови. verdict — оцінка ведучого для голови з відповіддю в ручному режимі;
 * вона діє лише на першу ітерацію.
 */
function settle(state: GameState, now: number | null, verdict?: boolean): GameState {
  const open = openBlitz(state);
  if (open === null) return state;
  const { play, blitz, round } = open;
  const price = (accuracy: number) =>
    answerPoints({
      points: play.question.points,
      accuracy,
      speed: 1,
      multiplier: round.rules.multiplier,
      penalty: round.rules.penalty,
    });

  let { queue, attempts } = blitz;
  let pending = verdict;
  while (queue.length > 0 && !attempts.some((attempt) => attempt.grade === 'correct')) {
    const [head, ...rest] = queue;
    let correct: boolean;
    if (head.answer !== null) {
      // Ручну перевірку робить ведучий.
      if (round.check === 'manual') {
        if (pending === undefined) break;
        correct = pending;
        pending = undefined;
      } else {
        correct = checkAnswer(play.question, head.answer).accuracy === 1;
      }
    } else {
      const limit = head.deadline ?? state.endsAt;
      if (now === null || limit === null || now < limit) break;
      correct = false;
    }
    const attempt: Attempt = {
      playerId: head.playerId,
      answer: head.answer,
      timeMs: Math.max(0, head.at - (state.startedAt ?? head.at)),
      grade: correct ? 'correct' : 'wrong',
      points: price(correct ? 1 : 0),
    };
    attempts = [...attempts, attempt];
    // Після переможця решта натискань просто зникає, без штрафу.
    queue = correct ? [] : rest;
  }
  if (attempts === blitz.attempts) return state;

  const answers = { ...play.answers };
  for (const playerId of new Set(attempts.slice(blitz.attempts.length).map((a) => a.playerId))) {
    answers[playerId] = summaryOf(attempts.filter((attempt) => attempt.playerId === playerId));
  }
  return withPlay(state, { ...play, answers, blitz: { queue, attempts } });
}

export function settleQueue(state: GameState, now: number | null): GameState {
  return settle(state, now);
}

/** Ведучий оцінює голову черги з відповіддю. Закриття запитання лишається за викликачем (judge у game.ts). */
export function applyVerdict(state: GameState, playerId: string, correct: boolean, now: number): Result {
  const open = openBlitz(state);
  if (open === null || open.round.check !== 'manual') return refuse('wrong_phase');
  if (state.paused) return refuse('paused');
  const head = open.blitz.queue[0];
  if (head === undefined || head.playerId !== playerId || head.answer === null) return refuse('not_found');
  return { ok: true, state: settle(state, now, correct) };
}

/** Найближча мить після now, коли tick може змінити стан; null — чекати нічого. */
export function nextDeadline(state: GameState, now: number): number | null {
  if (state.phase !== 'question' || state.paused || state.endsAt === null) return null;
  const times = [state.endsAt, ...(state.plays[state.questionIndex]?.blitz?.queue.map((e) => e.deadline) ?? [])];
  const upcoming = times.filter((time): time is number => time !== null && time > now);
  return upcoming.length === 0 ? null : Math.min(...upcoming);
}

export function blitzDone(state: GameState, now: number | null): boolean {
  const open = openBlitz(state);
  if (open === null) return false;
  const { play, blitz, round } = open;
  if (blitz.attempts.some((attempt) => attempt.grade === 'correct')) return true;
  if (blitz.queue.length > 0) return false;
  if (now !== null && state.endsAt !== null && now >= state.endsAt) return true;
  const connected = state.players.filter((p) => p.connected);
  return connected.length > 0 && connected.every((p) => !hasAttemptsLeft(round, play, p.id));
}
