import { DEFAULT_ANSWER_WINDOW, type ErrorCode } from '@quiz/shared';
import { cellBlitzRules } from './board-cells';
import { BOARD_AWAY_MS } from './board-turns';
import { chainDeadline } from './chain';
// З game.ts лише типи, але chain.ts (вище) під час виконання імпортує game.ts, тож цикл є:
// game.ts → blitz.ts → chain.ts → game.ts. Він безпечний, бо всі звертання відбуваються лише під час виклику функцій.
import type { AnswerRecord, Attempt, BlitzPlay, BuzzEntry, GameState, Play, Result } from './game';
import { clockOf, holdAt, thaw } from './hold';
import { answerPoints } from './score';
import { closesAt, isTimed, timeOver } from './timing';
import { notStarted } from './splash';

const refuse = (error: ErrorCode): Result => ({ ok: false, error });

/** Правила черги одного запитання: бліц-раунд або бліц-клітинка. */
export interface BlitzRules {
  /** Секунди вікна після натискання; null — без вікна. */
  answerWindow: number | null;
  attempts: 1 | 2 | 3 | null;
  /**
   * 'auto' — миттєвий бліц без кнопки: усі відповідають одразу, черга — порядок відповідей, годинник не утримується.
   * 'voice' — відповідь уголос: голову черги оцінює лише ведучий, без утримання й без автоматичного відкидання.
   */
  check: 'auto' | 'manual' | 'voice';
  /** Бали спроби (без серії). */
  points(playerId: string, correct: boolean): number;
}

/** Миттєвий бліц: кнопки «Відповісти» немає, кожен відповідає один раз, черга — порядок відповідей. */
export function isInstant(rules: BlitzRules): boolean {
  return rules.check === 'auto';
}

/** Правила черги запитання: з бліц-раунду або з бліц-клітинки; null — запитання без черги. */
export function blitzRulesOf(state: GameState, play: Play): BlitzRules | null {
  const round = state.quiz.rounds[play.roundIndex];
  if (round?.type === 'blitz') {
    const { multiplier, penalty } = round.rules;
    // Миттєвий бліц ігнорує збережені вікно й спроби: одна відповідь, без вікна.
    const instant = round.check === 'auto';
    return {
      // Без таймера запитання вікно потрібне завжди, інакше мовчазна голова тримала б чергу без кінця.
      answerWindow: instant ? null : (round.answerWindow ?? (isTimed(play.question) ? null : DEFAULT_ANSWER_WINDOW)),
      attempts: instant ? 1 : round.attempts,
      check: round.check,
      points: (_playerId, correct) =>
        answerPoints({ points: play.question.points, accuracy: correct ? 1 : 0, speed: 1, multiplier, penalty }),
    };
  }
  if (round?.type === 'board' && play.board?.kind === 'blitz') return cellBlitzRules(round, play.board);
  return null;
}

interface OpenBlitz {
  play: Play;
  blitz: BlitzPlay;
  rules: BlitzRules;
}

/** Поточне запитання з чергою разом з її правилами; null поза етапом question або без черги. */
function openBlitz(state: GameState): OpenBlitz | null {
  if (state.phase !== 'question') return null;
  const play = state.plays[state.questionIndex];
  const blitz = play?.blitz;
  const rules = blitz === undefined ? null : blitzRulesOf(state, play);
  return blitz !== undefined && rules !== null ? { play, blitz, rules } : null;
}

/** Замінює поточне запитання в журналі. */
export function withPlay(state: GameState, play: Play): GameState {
  return { ...state, plays: state.plays.map((p, index) => (index === state.questionIndex ? play : p)) };
}

export function attemptsUsed(play: Play, playerId: string): number {
  return play.blitz?.attempts.filter((attempt) => attempt.playerId === playerId).length ?? 0;
}

function hasAttemptsLeft(rules: BlitzRules, play: Play, playerId: string): boolean {
  return rules.attempts === null || attemptsUsed(play, playerId) < rules.attempts;
}

export function buzz(state: GameState, playerId: string, now: number): Result {
  const open = openBlitz(state);
  if (open === null) return refuse('wrong_phase');
  if (state.paused) return refuse('paused');
  if (notStarted(state, now)) return refuse('not_started');
  if (!state.players.some((p) => p.id === playerId)) return refuse('not_found');
  // У миттєвому бліці кнопки немає: відповідь сама ставить гравця в чергу.
  if (isInstant(open.rules)) return refuse('wrong_phase');
  // Під час утримання натискання стає в чергу за замороженим годинником: його вікно піде після зняття утримання.
  const clock = clockOf(state, now);
  const { play, blitz, rules } = open;
  if (timeOver(state, play, clock)) return refuse('time_over');
  if (blitz.queue.some((entry) => entry.playerId === playerId)) return refuse('already_queued');
  if (!hasAttemptsLeft(rules, play, playerId)) return refuse('no_attempts');
  const entry: BuzzEntry = {
    playerId,
    at: clock,
    timeMs: Math.max(0, clock - (state.startedAt ?? clock)),
    deadline: rules.answerWindow === null ? null : clock + rules.answerWindow * 1000,
    answer: null,
  };
  const buzzed = blitz.buzzed.includes(playerId) ? blitz.buzzed : [...blitz.buzzed, playerId];
  return { ok: true, state: withPlay(state, { ...play, blitz: { ...blitz, queue: [...blitz.queue, entry], buzzed } }) };
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
 * Розглядає чергу з голови. Голова з відповіддю чекає на рішення ведучого (за будь-якої перевірки),
 * за усної відповіді голова чекає на нього завжди: verdict — це рішення, воно діє лише на першу ітерацію.
 * Коли черга зупинилася на голові з відповіддю, а now відомий, годинник запитання стає (heldAt) — крім миттєвого бліцу.
 * Після переможця нерозглянуті відповіді переходять у dropped.
 */
function settle(state: GameState, now: number | null, verdict?: boolean): GameState {
  const open = openBlitz(state);
  if (open === null) return state;
  const { play, blitz, rules } = open;

  let { queue, attempts } = blitz;
  let dropped = blitz.dropped;
  let pending = verdict;
  while (queue.length > 0 && !attempts.some((attempt) => attempt.grade === 'correct')) {
    const [head, ...rest] = queue;
    let correct: boolean;
    if (head.answer !== null || rules.check === 'voice') {
      if (pending === undefined) break;
      correct = pending;
      pending = undefined;
    } else {
      const limit = head.deadline ?? state.endsAt;
      if (now === null || limit === null || now < limit) break;
      correct = false;
    }
    const attempt: Attempt = {
      playerId: head.playerId,
      answer: head.answer,
      timeMs: head.timeMs,
      grade: correct ? 'correct' : 'wrong',
      points: rules.points(head.playerId, correct),
    };
    attempts = [...attempts, attempt];
    // Після переможця решта черги лишається лише для показу, без балів і штрафу.
    if (correct) dropped = [...dropped, ...rest];
    queue = correct ? [] : rest;
  }
  // Миттєвий бліц не утримує годинник: час у черзі — справжній час від відкриття.
  const waiting = queue[0] !== undefined && queue[0].answer !== null && !isInstant(rules);
  if (attempts === blitz.attempts) return waiting && now !== null ? holdAt(state, now) : state;

  const answers = { ...play.answers };
  for (const playerId of new Set(attempts.slice(blitz.attempts.length).map((a) => a.playerId))) {
    answers[playerId] = summaryOf(attempts.filter((attempt) => attempt.playerId === playerId));
  }
  const settled = withPlay(state, { ...play, answers, blitz: { ...blitz, queue, attempts, dropped } });
  return waiting && now !== null ? holdAt(settled, now) : settled;
}

export function settleQueue(state: GameState, now: number | null): GameState {
  return settle(state, now);
}

/**
 * Рішення щодо відповіді голови черги («Прийняти» або оцінка ведучого): годинник рушає, черга йде далі.
 * Вид перевірки й закриття запитання лишаються за викликачем (acceptAnswer і judge у game.ts).
 */
export function applyVerdict(state: GameState, playerId: string, correct: boolean, now: number): Result {
  const open = openBlitz(state);
  if (open === null) return refuse('wrong_phase');
  if (state.paused) return refuse('paused');
  const head = open.blitz.queue[0];
  if (head === undefined || head.playerId !== playerId) return refuse('not_found');
  if (head.answer === null && open.rules.check !== 'voice') return refuse('not_found');
  return { ok: true, state: settle(thaw(state, now), now, correct) };
}

/** Найближча мить після now, коли tick може змінити стан; null — чекати нічого. */
export function nextDeadline(state: GameState, now: number): number | null {
  if (state.phase === 'board') {
    const since = state.board?.awaySince ?? null;
    if (state.paused || since === null) return null;
    return since + BOARD_AWAY_MS > now ? since + BOARD_AWAY_MS : null;
  }
  // Годинник запитання дуелі; на інших етапах дуелі чекати нічого.
  if (state.phase === 'duel') {
    if (state.paused || state.endsAt === null) return null;
    return state.endsAt > now ? state.endsAt : null;
  }
  // Під час утримання годинник стоїть: tick нічого не змінить, доки ведучий не вирішить.
  if (state.phase !== 'question' || state.paused || state.heldAt !== null) return null;
  const away = state.board?.awaySince ?? null;
  const play = state.plays[state.questionIndex];
  // Особистий дедлайн ланцюжка раніший за endsAt на штраф гравця; хто вже пройшов, не чекає.
  const chainers = Object.keys(play?.chain ?? {}).filter((id) => !Object.hasOwn(play.answers, id));
  // Спільний кінець або пізніший особистий кінець того, хто ще не відповів (додатковий час).
  const times = [
    closesAt(state),
    away === null ? null : away + BOARD_AWAY_MS,
    ...(play?.blitz?.queue.map((e) => e.deadline) ?? []),
    ...chainers.map((id) => chainDeadline(state, id)),
  ];
  const upcoming = times.filter((time): time is number => time !== null && time > now);
  return upcoming.length === 0 ? null : Math.min(...upcoming);
}

export function blitzDone(state: GameState, now: number | null): boolean {
  const open = openBlitz(state);
  if (open === null) return false;
  const { play, blitz, rules } = open;
  if (blitz.attempts.some((attempt) => attempt.grade === 'correct')) return true;
  if (blitz.queue.length > 0) return false;
  if (now !== null && state.endsAt !== null && now >= state.endsAt) return true;
  const connected = state.players.filter((p) => p.connected);
  return connected.length > 0 && connected.every((p) => !hasAttemptsLeft(rules, play, p.id));
}
