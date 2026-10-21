import {
  LIMITS,
  type Answer,
  type ErrorCode,
  type Grade,
  type Phase,
  type Question,
  type Quiz,
  type BoardRound,
  type Round,
} from '@quiz/shared';
import { applyVerdict, blitzDone, settleQueue, withPlay } from './blitz';
import { advanceTurn, BOARD_AWAY_MS, boardPoints, chooserOf, dropFromCircle, enterBoard, hasActiveCells, initBoard } from './board-turns';
import { checkAnswer } from './check';
import { clockOf, holdAt, pendingOf, releaseStaleHold, shiftQueue, thaw } from './hold';
import { normalizeText } from './normalize';
import { answerPoints, speedFactor, streakBonus } from './score';
import { limitMsOf } from './timing';

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
  /** null — бліц, гравець натиснув, але не встиг відповісти. */
  answer: Answer | null;
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

/** Натискання «Відповісти» в бліці. */
export interface BuzzEntry {
  playerId: string;
  /** Час натискання. */
  at: number;
  /** Кінець вікна відповіді; null — до кінця таймера запитання. */
  deadline: number | null;
  answer: Answer | null;
}

/** Розглянута спроба в бліці. */
export interface Attempt {
  playerId: string;
  /** null — не встиг відповісти. */
  answer: Answer | null;
  /** Від відкриття запитання до натискання. */
  timeMs: number;
  grade: 'correct' | 'wrong';
  /** round(P × множник) за правильну, штраф або 0 за неправильну; без бонусу серії. */
  points: number;
}

/**
 * Одне зігране запитання; ключ answers є id гравця. У бліці answers містить підсумок усіх спроб
 * гравця, а blitz — чергу натискань і розглянуті спроби.
 */
export interface Play {
  roundIndex: number;
  question: Question;
  answers: Record<string, AnswerRecord>;
  blitz?: BlitzPlay;
  /** Сума змін часу ведучим («±15 с»), мс. */
  extraMs: number;
  /** Клітинка поля, з якої відкрито запитання. */
  board?: BoardPlay;
}

/** Стан ходів у раунді поля. */
export interface BoardState {
  /** Порядок поточного кола. */
  circle: string[];
  /** Скільки гравців поточного кола вже походили (вибрали клітинку або пропустили хід). */
  done: number;
  /** Скільки разів у раунді кидали кубик; сцена показує анімацію, коли число змінилося. */
  rolls: number;
  /** Відколи гравець, чий хід, відключений; null — на місці, пауза або не етап board. */
  awaySince: number | null;
}

/** Запитання, відкрите з клітинки поля. */
export interface BoardPlay {
  cellId: string;
  /** Хто вибрав клітинку; відповідає лише він. */
  chooserId: string;
  /** points запитання. */
  price: number;
  /** Множник клітинки: x2 → 2, x3 → 3, інакше 1. */
  multiplier: 1 | 2 | 3;
  /** Відповідь з телефону, що чекає на рішення ведучого («Прийняти», оцінка або «Перевибрати»); інакше null. */
  answer: Answer | null;
}

/** Бліц у межах одного запитання. */
export interface BlitzPlay {
  queue: BuzzEntry[];
  attempts: Attempt[];
  /** Хто натискав на цьому запитанні, без повторів; потрібне для серій, бо скинуті натискання зникають. */
  buzzed: string[];
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
  /** Момент, коли гру поставили на паузу; null без паузи. */
  pausedAt: number | null;
  /** Ходи раунду поля; null поза раундом поля. */
  board: BoardState | null;
  /** Відколи годинник запитання стоїть, бо відповідь чекає на ведучого; null — іде. */
  heldAt: number | null;
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
    pausedAt: null,
    board: null,
    heldAt: null,
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
  const plays = state.plays.map((play): Play => {
    const { [playerId]: _removed, ...rest } = play.answers;
    if (play.blitz === undefined) return { ...play, answers: rest };
    const blitz = {
      queue: play.blitz.queue.filter((e) => e.playerId !== playerId),
      attempts: play.blitz.attempts.filter((a) => a.playerId !== playerId),
      buzzed: play.blitz.buzzed.filter((id) => id !== playerId),
    };
    return { ...play, answers: rest, blitz };
  });
  // Гравець зникає з кола; відлік відсутності скидається, його заново ставить tick.
  const board = state.board === null ? null : { ...dropFromCircle(state.board, playerId), awaySince: null };
  const kicked = { ...state, players: state.players.filter((p) => p.id !== playerId), plays, board };
  // Наступний у черзі, який уже відповів, перевіряється одразу; на паузі — після продовження.
  return ok(autoLock(kicked.paused ? kicked : settleQueue(kicked, null)));
}

export function setConnected(state: GameState, playerId: string, connected: boolean, now: number): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const players = state.players.map((p) => (p.id === playerId ? { ...p, connected } : p));
  const changed = { ...state, players };
  // Відлік 30 секунд іде лише для гравця, чий хід, і не на паузі.
  if (state.phase === 'board' && state.board !== null && !state.paused && chooserOf(state) === playerId) {
    return ok({ ...changed, board: { ...state.board, awaySince: connected ? null : (state.board.awaySince ?? now) } });
  }
  return ok(autoLock(changed));
}

export type Rng = () => number;

export function shuffle<T>(items: T[], rng: Rng): T[] {
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
  if (question.type === 'match') {
    // Правий стовпчик перемішується завжди; на одному рівні з лівим він видав би відповідь.
    const ids = question.pairs.map((pair) => pair.right.id);
    const mixed = shuffle(ids, rng);
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
  if (round === null || round.type === 'board') return undefined;
  const played = new Set(state.plays.filter((p) => p.roundIndex === state.roundIndex).map((p) => p.question.id));
  return round.questions.find((question) => !played.has(question.id));
}

export function openQuestion(state: GameState, question: Question, now: number, rng: Rng, board?: BoardPlay): GameState {
  const round = state.quiz.rounds[state.roundIndex];
  const play: Play = {
    roundIndex: state.roundIndex,
    question,
    answers: {},
    extraMs: 0,
    ...(board !== undefined ? { board } : {}),
    ...(round.type === 'blitz' ? { blitz: { queue: [], attempts: [], buzzed: [] } } : {}),
  };
  return {
    ...state,
    phase: 'question',
    questionIndex: state.plays.length,
    plays: [...state.plays, play],
    presented: present(question, round.shuffleOptions, rng),
    startedAt: now,
    endsAt: now + question.timeLimit * 1000,
    remainingMs: null,
    heldAt: null,
  };
}

/** Відлік відсутності має сенс лише на етапі board. */
function clearAway(board: BoardState | null): BoardState | null {
  return board === null ? null : { ...board, awaySince: null };
}

/** Після останнього раунду гра закінчується, інакше показуються підсумки раунду. */
function finishRound(state: GameState): GameState {
  const isLastRound = state.roundIndex === state.quiz.rounds.length - 1;
  return { ...state, phase: isLastRound ? 'finished' : 'round_end', board: clearAway(state.board) };
}

/** Відкриває наступне запитання раунду, а коли їх не лишилося, завершує раунд. */
function advance(state: GameState, now: number, rng: Rng): GameState {
  const question = nextQuestion(state);
  return question !== undefined ? openQuestion(state, question, now, rng) : finishRound(state);
}

/**
 * Серія кожного гравця після перших upTo запитань журналу: поспіль правильні відповіді в раунді
 * останнього з них. Без відповіді серія перервана, але в бліці запитання, де гравець не натискав,
 * серію не обриває й не продовжує (натискання без правильної спроби обриває); на межі раундів вона скидається;
 * якщо правил серії в тому раунді немає, серій немає.
 */
export function streakCounts(state: GameState, upTo: number): Record<string, number> {
  const last = state.plays[upTo - 1];
  if (last === undefined) return {};
  const round = state.quiz.rounds[last.roundIndex];
  if (round.rules.streak === null) return {};
  const counts: Record<string, number> = {};
  for (const player of state.players) {
    let count = 0;
    for (let i = upTo - 1; i >= 0 && state.plays[i].roundIndex === last.roundIndex; i -= 1) {
      const record = recordOf(state, i, player.id);
      const blitz = state.plays[i].blitz;
      if (record === undefined && blitz !== undefined && !blitz.buzzed.includes(player.id)) continue;
      // На полі серію рахують лише власні ходи гравця.
      const board = state.plays[i].board;
      if (board !== undefined && board.chooserId !== player.id) continue;
      if (record === undefined || record.accuracy < 1) break;
      count += 1;
    }
    counts[player.id] = count;
  }
  return counts;
}

/** Від чого рахується бонус серії: у бліці від виграшної спроби, бо basePoints містить і штрафи. */
function streakBase(play: Play, playerId: string, record: AnswerRecord): number {
  if (play.blitz === undefined) return record.basePoints;
  return play.blitz.attempts.find((a) => a.playerId === playerId && a.grade === 'correct')?.points ?? 0;
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
      const bonus = (counters[player.id] ?? 0) >= streak.length ? streakBonus(streakBase(play, player.id, record), streak.bonus) : 0;
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
      // Час для рівного рахунку йде лише за класичні раунди.
      if (state.quiz.rounds[play.roundIndex].type !== 'classic') continue;
      totalTimeMs += record ? record.timeMs : limitMsOf(play);
    }
    return { ...player, score, totalTimeMs, streak: counters[player.id] ?? 0 };
  });
  return { ...state, plays, players };
}

/** Нерозглянуті натискання бліцу зникають без балів і штрафу. */
function dropQueue(state: GameState): GameState {
  const play = state.plays[state.questionIndex];
  if (play?.blitz === undefined || play.blitz.queue.length === 0) return state;
  const closed: Play = { ...play, blitz: { ...play.blitz, queue: [] } };
  return withPlay(state, closed);
}

function lockNow(state: GameState): GameState {
  return withTotals({ ...dropQueue(state), phase: 'locked', startedAt: null, endsAt: null, remainingMs: null, heldAt: null });
}

/** Закриває запитання поля й одразу розкриває оцінку: так відповідь світиться зеленим або червоним. */
function revealNow(state: GameState): GameState {
  return withTotals({ ...lockNow(state), phase: 'reveal' });
}

/** Закриває запитання, якщо відповіли всі підключені гравці (у бліці: якщо запитання вже вирішене). */
function autoLock(state: GameState): GameState {
  if (state.phase !== 'question' || state.paused) return state;
  if (currentRound(state)?.type === 'blitz') return blitzDone(state, null) ? lockNow(state) : state;
  // На полі запитання закриває сама відповідь або оцінка ведучого.
  if (currentRound(state)?.type === 'board') return state;
  const connected = state.players.filter((p) => p.connected);
  if (connected.length === 0) return state;
  const everyoneAnswered = connected.every((p) => recordOf(state, state.questionIndex, p.id) !== undefined);
  return everyoneAnswered ? lockNow(state) : state;
}

export function start(state: GameState, now: number, rng: Rng = Math.random): Result {
  if (state.phase !== 'lobby') return fail('wrong_phase');
  if (state.players.length === 0) return fail('no_players');
  const isBoard = state.quiz.rounds[0]?.type === 'board';
  const first = { ...state, roundIndex: 0, board: isBoard ? initBoard(state) : null };
  // Вікторина з одним раундом обходиться без заставки, як і раніше; раунд поля завжди з заставкою.
  if (state.quiz.rounds.length > 1 || isBoard) return ok({ ...first, phase: 'intro' });
  return ok(advance(first, now, rng));
}

export function submitAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const play = state.plays[state.questionIndex];
  const { question, roundIndex } = play;
  const round = state.quiz.rounds[roundIndex];
  if (round.type === 'blitz') return submitBlitzAnswer(state, playerId, answer, now);
  if (round.type === 'board') return submitBoardAnswer(state, round, playerId, answer, now);
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || state.endsAt === null || now > state.endsAt) return fail('time_over');
  if (question.type !== answer.type) return fail('type_mismatch');

  const timeMs = Math.max(0, now - state.startedAt);
  const { accepted, accuracy } = checkAnswer(question, answer);
  const speed = speedFactor(timeMs, limitMsOf(play), round.type === 'classic' && round.speedBonus);
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

/** Відповідь на запитання поля: лише від гравця, чий хід; годинник стоїть, поки ведучий не прийме відповідь або не дасть перевибрати. */
function submitBoardAnswer(state: GameState, round: BoardRound, playerId: string, answer: Answer, now: number): Result {
  const play = state.plays[state.questionIndex];
  const board = play.board;
  if (board === undefined || round.answerMode === 'voice') return fail('wrong_phase');
  if (playerId !== board.chooserId) return fail('not_your_turn');
  if (recordOf(state, state.questionIndex, playerId) !== undefined || board.answer !== null) return fail('already_answered');
  if (state.startedAt === null || state.endsAt === null || now > state.endsAt) return fail('time_over');
  if (play.question.type !== answer.type) return fail('type_mismatch');
  return ok(holdAt(withBoard(state, { ...board, answer }), now));
}

/** «Прийняти» за автоматичної перевірки. */
export function acceptAnswer(state: GameState, playerId: string, now: number): Result {
  const pending = pendingOf(state);
  if (pending === null) return fail('wrong_phase');
  // Ведучий називає відповідь: подвійний дотик не має прийняти наступну, яку він ще не бачив.
  if (pending.playerId !== playerId) return fail('not_found');
  if (state.paused) return fail('paused');
  const play = state.plays[state.questionIndex];
  const round = state.quiz.rounds[play.roundIndex];
  if (round.type === 'blitz') {
    if (round.check === 'manual') return fail('wrong_phase');
    const correct = checkAnswer(play.question, pending.answer).accuracy === 1;
    return closeIfDone(applyVerdict(state, pending.playerId, correct, now), now);
  }
  if (round.type !== 'board' || play.board === undefined || round.check === 'manual') return fail('wrong_phase');

  const checked = checkAnswer(play.question, pending.answer);
  // Часткові бали лише за увімкненого правила; інакше неповна відповідь неправильна.
  const accuracy = checked.accuracy >= 1 ? 1 : checked.accuracy > 0 && round.rules.partial !== null ? checked.accuracy : 0;
  const points = boardPoints(round, play.board, accuracy);
  const record: AnswerRecord = {
    answer: pending.answer,
    timeMs: Math.max(0, clockOf(state, now) - (state.startedAt ?? now)),
    accepted: accuracy >= 1,
    accuracy,
    grade: gradeOf(accuracy),
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
  return ok(revealNow(withRecord(state, pending.playerId, record)));
}

/** «Перевибрати»: відповідь знято, годинник (у бліці й вікно голови черги) іде з того самого залишку. */
export function repick(state: GameState, playerId: string, now: number): Result {
  const pending = pendingOf(state);
  if (pending === null) return fail('wrong_phase');
  if (pending.playerId !== playerId) return fail('not_found');
  if (state.paused) return fail('paused');
  const play = state.plays[state.questionIndex];
  if (play.blitz !== undefined) {
    const queue = play.blitz.queue.map((e, index) => (index === 0 ? { ...e, answer: null } : e));
    return ok(thaw(withPlay(state, { ...play, blitz: { ...play.blitz, queue } }), now));
  }
  const board = play.board;
  if (board === undefined) return fail('wrong_phase');
  return ok(thaw(withBoard(state, { ...board, answer: null }), now));
}

/** Замінює клітинку в поточному запитанні поля. */
function withBoard(state: GameState, board: BoardPlay): GameState {
  const plays = state.plays.map((play, index) => (index === state.questionIndex ? { ...play, board } : play));
  return { ...state, plays };
}

/**
 * Відповідь у бліці записується в чергу. Коли гравець стане першим, вона чекає на ведучого,
 * а годинник запитання стоїть. Під час утримання вікно перевіряється за замороженим годинником.
 */
function submitBlitzAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  const play = state.plays[state.questionIndex];
  const entry = play.blitz?.queue.find((e) => e.playerId === playerId);
  if (play.blitz === undefined || entry === undefined) return fail('not_in_queue');
  if (entry.answer !== null) return fail('already_answered');
  const clock = clockOf(state, now);
  const limit = entry.deadline ?? state.endsAt;
  if (limit === null || clock > limit) return fail('time_over');
  if (play.question.type !== answer.type) return fail('type_mismatch');

  const queue = play.blitz.queue.map((e) => (e === entry ? { ...e, answer } : e));
  const answered: Play = { ...play, blitz: { ...play.blitz, queue } };
  return ok(settleQueue(withPlay(state, answered), clock));
}

/** Після рішення щодо голови черги бліцу запитання закривається, якщо воно вже вирішене. */
function closeIfDone(result: Result, now: number): Result {
  if (!result.ok) return result;
  return ok(blitzDone(result.state, now) ? lockNow(result.state) : result.state);
}

/** Ведучий оцінює відповідь голови черги в бліці з ручною перевіркою. */
export function judge(state: GameState, playerId: string, correct: boolean, now: number): Result {
  const round = currentRound(state);
  if (round?.type !== 'blitz' || round.check !== 'manual') return fail('wrong_phase');
  return closeIfDone(applyVerdict(state, playerId, correct, now), now);
}

export function lock(state: GameState): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  return ok(lockNow(state));
}

/** Сервер викликає періодично; закриває запитання, коли сплив час. У бліці також згоряють вікна відповіді. */
export function tick(state: GameState, now: number): GameState {
  if (state.phase === 'board' && state.board !== null) return state.paused ? state : tickBoard(state, state.board, now);
  if (state.phase !== 'question' || state.paused) return state;
  const running = releaseStaleHold(state, now);
  // Поки відповідь чекає на ведучого, годинник стоїть.
  if (running.heldAt !== null) return running;
  if (currentRound(running)?.type === 'blitz') {
    const settled = settleQueue(running, now);
    return blitzDone(settled, now) ? lockNow(settled) : settled;
  }
  const expired = running.endsAt !== null && now >= running.endsAt;
  return expired ? lockNow(running) : running;
}

/** Етап вибору клітинки: стартує відлік для відключеного гравця й пропускає хід, коли 30 секунд сплило. */
function tickBoard(state: GameState, board: BoardState, now: number): GameState {
  const chooser = chooserOf(state);
  const away = chooser !== null && state.players.some((p) => p.id === chooser && !p.connected);
  if (board.awaySince === null) return away ? { ...state, board: { ...board, awaySince: now } } : state;
  if (now < board.awaySince + BOARD_AWAY_MS) return state;
  return enterBoard({ ...state, board: advanceTurn(board) }, now);
}

/** Під час розкриття гравець, чий хід, без оцінки отримує «неправильно» (зі штрафом, якщо він увімкнений). */
function unansweredIsWrong(state: GameState): GameState {
  const round = currentRound(state);
  const play = state.plays[state.questionIndex];
  if (round?.type !== 'board' || play?.board === undefined) return state;
  const { chooserId } = play.board;
  if (!state.players.some((p) => p.id === chooserId) || recordOf(state, state.questionIndex, chooserId) !== undefined) return state;
  const points = boardPoints(round, play.board, 0);
  return withRecord(state, chooserId, {
    answer: play.board.answer,
    timeMs: limitMsOf(play),
    accepted: false,
    accuracy: 0,
    grade: 'wrong',
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  });
}

/** Ходи раунду поля починаються з нуля. */
function enterRound(state: GameState): GameState {
  return { ...state, board: state.quiz.rounds[state.roundIndex]?.type === 'board' ? initBoard(state) : null };
}

export function next(state: GameState, now: number, rng: Rng = Math.random): Result {
  if (state.paused) return fail('paused');
  switch (state.phase) {
    case 'intro':
      if (currentRound(state)?.type === 'board') return ok(enterBoard(state, now));
      return ok(advance(state, now, rng));
    case 'locked':
      return ok(currentRound(state)?.type === 'board' ? withTotals(unansweredIsWrong({ ...state, phase: 'reveal' })) : { ...state, phase: 'reveal' });
    case 'reveal':
      if (currentRound(state)?.type === 'board') {
        if (!hasActiveCells(state)) return ok(finishRound(state));
        return ok(state.quiz.settings.leaderboard === 'each' ? { ...state, phase: 'leaderboard' } : enterBoard(state, now));
      }
      if (nextQuestion(state) === undefined) return ok(finishRound(state));
      if (state.quiz.settings.leaderboard === 'each') return ok({ ...state, phase: 'leaderboard' });
      return ok(advance(state, now, rng));
    case 'leaderboard':
      if (currentRound(state)?.type === 'board') return ok(enterBoard(state, now));
      return ok(advance(state, now, rng));
    case 'round_end':
      // Нова серія в новому раунді починається з нуля.
      return ok(withTotals(enterRound({ ...state, phase: 'intro', roundIndex: state.roundIndex + 1 })));
    default:
      return fail('wrong_phase');
  }
}

const IN_ROUND: Phase[] = ['intro', 'board', 'question', 'locked', 'reveal', 'leaderboard'];

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
  // Під час утримання годинник уже стоїть: пауза його не чіпає.
  if (state.phase === 'question' && state.heldAt !== null) return ok({ ...state, paused: true, pausedAt: now });
  if (state.phase === 'question' && state.endsAt !== null) {
    const remainingMs = Math.max(0, state.endsAt - now);
    return ok({ ...state, paused: true, pausedAt: now, remainingMs, startedAt: null, endsAt: null });
  }
  return ok({ ...state, paused: true, pausedAt: now, board: clearAway(state.board) });
}

export function resume(state: GameState, now: number): Result {
  if (!state.paused) return fail('wrong_phase');
  // Годинник стоїть і далі, доки ведучий не вирішить; якщо гравця вилучили на паузі, він рушає зараз.
  if (state.phase === 'question' && state.heldAt !== null) {
    // Якщо утримання знялося, а відповідати вже нікому, запитання закривається одразу.
    return ok(autoLock(settleQueue(releaseStaleHold({ ...state, paused: false, pausedAt: null }, now), now)));
  }
  if (state.phase === 'question' && state.remainingMs !== null) {
    const limitMs = limitMsOf(state.plays[state.questionIndex]);
    const endsAt = now + state.remainingMs;
    // startedAt зсувається так, щоб час відповіді не включав паузу.
    const resumed = { ...state, paused: false, pausedAt: null, remainingMs: null, endsAt, startedAt: endsAt - limitMs };
    // Чергу, яку не розглядали на паузі (наприклад, після вилучення голови), розглядаємо зараз.
    return ok(autoLock(settleQueue(shiftQueue(resumed, now - (state.pausedAt ?? now)), now)));
  }
  const resumed = { ...state, paused: false, pausedAt: null };
  // Після паузи відсутній гравець знову має повні 30 секунд.
  return ok(resumed.phase === 'board' ? enterBoard(resumed, now) : resumed);
}

/** Оцінка ведучого на полі: у питанні (голос або ручна перевірка після відповіді), після закриття й на розкритті. */
function overrideBoard(state: GameState, round: BoardRound, playerId: string, grade: Grade, now: number | undefined): Result {
  const play = state.plays[state.questionIndex];
  const board = play?.board;
  const phase = state.phase;
  if (board === undefined || (phase !== 'question' && phase !== 'locked' && phase !== 'reveal')) return fail('wrong_phase');
  if (phase === 'question' && round.answerMode !== 'voice' && board.answer === null) return fail('wrong_phase');
  if (playerId !== board.chooserId || !state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (grade === 'partial' && round.rules.partial === null) return fail('partial_disabled');
  const accuracy = grade === 'correct' ? 1 : grade === 'partial' ? (round.rules.partial ?? 0) / 100 : 0;
  const existing = recordOf(state, state.questionIndex, playerId);
  const limitMs = limitMsOf(play);
  const spentMs =
    phase === 'question' && now !== undefined && state.startedAt !== null ? Math.max(0, clockOf(state, now) - state.startedAt) : limitMs;
  const points = boardPoints(round, board, accuracy);
  const record: AnswerRecord = {
    answer: existing?.answer ?? board.answer,
    timeMs: existing?.timeMs ?? spentMs,
    accepted: grade === 'correct',
    accuracy,
    grade,
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: phase === 'reveal',
  };
  const graded = withRecord(state, playerId, record);
  if (phase !== 'question') return ok(withTotals(graded));
  // Оцінка відповіді з телефона одразу розкривається; усна відповідь лише закриває запитання.
  return ok(board.answer !== null ? revealNow(graded) : lockNow(graded));
}

/** Ведучий вручну виставляє оцінку відповіді на поточне запитання. */
export function override(state: GameState, playerId: string, grade: Grade, now?: number): Result {
  const current = currentRound(state);
  if (current?.type === 'board') return overrideBoard(state, current, playerId, grade, now);
  if (state.phase !== 'reveal') return fail('wrong_phase');
  const play = state.plays[state.questionIndex];
  const { question, roundIndex } = play;
  const round = state.quiz.rounds[roundIndex];
  // Оцінка в бліці остаточна, навіть для гравця без запису.
  if (round.type === 'blitz') return fail('wrong_phase');
  const record = recordOf(state, state.questionIndex, playerId);
  if (record === undefined) return fail('not_found');
  if (grade === 'partial' && round.rules.partial === null) return fail('partial_disabled');
  const accuracy = grade === 'correct' ? 1 : grade === 'partial' ? (round.rules.partial ?? 0) / 100 : 0;
  const speed = speedFactor(record.timeMs, limitMsOf(play), round.type === 'classic' && round.speedBonus);
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
    withTotals({
      ...dropQueue(state),
      phase: 'finished',
      board: clearAway(state.board),
      paused: false,
      startedAt: null,
      endsAt: null,
      remainingMs: null,
      heldAt: null,
    }),
  );
}
