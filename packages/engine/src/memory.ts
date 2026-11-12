import { MEMORY_SHOW_MS, MEMORY_TURN_MS, memoryGridSize, memoryLayout, memoryPairOf, memoryPoints, questionPrice, rulesOf, type ErrorCode, type Grade, type MemoryAnswer, type Question } from '@quiz/shared';
import { withPlay } from './blitz';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { autoLock, fail, recordOf, roundQuestionNumber, type AnswerRecord, type GameState, type MemoryBoard, type MemoryPlay, type Play, type Result } from './game';
import { notStarted } from './splash';
import { memberOf, teamsOn } from './teams';
import { limitMsOf, timeOverFor } from './timing';

// «Пам'ять» (29f): кожен гравець (команда — одна спільна сітка) відкриває по дві картки; пара лишається відкритою, непара
// показується MEMORY_SHOW_MS і закривається. Розклад — memoryLayout(пар, question.seed), рахується з запитання, у стан не пишеться.
// Бали: перший, хто знайшов усі пари, — максимум; інші — round(максимум × час найшвидшого / свій час); не знайшов усіх — 0.

export type MemoryQuestion = Extract<Question, { type: 'memory' }>;
type MemoryQuestionPlay = Play & { question: MemoryQuestion; memory: MemoryPlay };

/** Відкриття: open — перша картка ходу, match — друга й пара, miss — друга й непара (показана MEMORY_SHOW_MS). */
export type MemoryFlip = { ok: true; state: GameState; outcome: 'open' | 'match' | 'miss' } | { ok: false; error: ErrorCode };

/** Поточне запитання, якщо це «Пам'ять» (на будь-якому етапі). */
function memoryPlay(state: GameState): MemoryQuestionPlay | null {
  const play = state.plays[state.questionIndex];
  return play !== undefined && play.question.type === 'memory' && play.memory !== undefined ? (play as MemoryQuestionPlay) : null;
}

/** Поточна дошка гравця (команди) як записана (не осіла); null — не «Пам'ять» або він ще нічого не відкрив. */
export function memoryOf(state: GameState, actorId: string): MemoryBoard | null {
  const boards = memoryPlay(state)?.memory.boards;
  return boards !== undefined && Object.hasOwn(boards, actorId) ? boards[actorId] : null;
}

/**
 * Дошка на мить now: прострочена непара (shown.until ≤ now) закрита, прострочений хід (turn.until ≤ now) знято разом із
 * відкритою першою карткою. Без змін — той самий об'єкт.
 */
export function settleMemory(board: MemoryBoard, now: number): MemoryBoard {
  const shownOver = board.shown !== null && board.shown.until <= now;
  const turnOver = board.turn != null && board.turn.until <= now;
  if (!shownOver && !turnOver) return board;
  return { ...board, ...(shownOver ? { shown: null } : {}), ...(turnOver ? { turn: null, open: null } : {}) };
}

/** Порожня дошка; by і turn — лише в командній грі. */
function emptyBoard(state: GameState): MemoryBoard {
  return { matched: [], ...(teamsOn(state) ? { by: [], turn: null } : {}), open: null, shown: null, moves: 0, doneMs: null, seq: 0 };
}

/**
 * Запис гравця (команди). Знайшов усе — correct і memoryPoints(round(ціна × множник), найшвидший, свій час), де найшвидший — серед
 * усіх завершених цього запитання (перший завжди найшвидший, тож бали остаточні). Ні — wrong, 0, accuracy = частка пар.
 */
function memoryRecord(state: GameState, play: MemoryQuestionPlay, board: MemoryBoard, timeMs: number): AnswerRecord {
  const total = play.question.pairs.length;
  const pairs = board.matched.length / 2;
  const done = board.doneMs !== null;
  const base = Math.round(questionPrice(play.question) * rulesOf(state.quiz.rounds[play.roundIndex]).multiplier);
  const times = Object.values(play.answers).flatMap((r) => (r.answer?.type === 'memory' && r.answer.done && r.answer.timeMs !== null ? [r.answer.timeMs] : []));
  const fastest = Math.min(timeMs, ...times);
  const points = done ? memoryPoints(base, fastest, timeMs) : 0;
  const grade: Grade = done ? 'correct' : 'wrong';
  const answer: MemoryAnswer = { type: 'memory', pairs, total, done, timeMs: board.doneMs, moves: board.moves };
  return { answer, timeMs, accepted: done, accuracy: done ? 1 : total === 0 ? 0 : pairs / total, grade, basePoints: points, streakBonus: 0, points, overridden: false };
}

/**
 * Перевірки по черзі: етап, пауза, старт, гравець (у командах — учасник цієї команди), номер запитання в раунді (memory_stale),
 * тип, час, усе знайдено чи запис уже є (memory_done).
 */
function memoryRefusal(state: GameState, actorId: string, memberId: string, questionIndex: number, now: number): Result | MemoryQuestionPlay {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === actorId)) return fail('not_found');
  if (teamsOn(state) && memberOf(state, memberId)?.teamId !== actorId) return fail('not_found');
  // questionIndex — номер запитання в раунді, як у зрізі (view.questionIndex = roundQuestionNumber), а не індекс plays.
  if (questionIndex !== roundQuestionNumber(state)) return fail('memory_stale');
  const play = memoryPlay(state);
  if (play === null) return fail('type_mismatch');
  if (state.startedAt === null || timeOverFor(state, play, actorId, now)) return fail('time_over');
  if (memoryOf(state, actorId)?.doneMs != null || recordOf(state, state.questionIndex, actorId) !== undefined) return fail('memory_done');
  return play;
}

/**
 * Людина memberId за гравця (команду) actorId відкриває клітинку cell. Після memoryRefusal: клітинка поза сіткою (memory_cell); на осілій
 * дошці показана непара (memory_wait), хід іншого учасника (memory_busy), клітинка вже знайдена (memory_matched), та сама відкрита (memory_open).
 * Далі: перша картка (у командах — хід на MEMORY_TURN_MS), пара або непара (показана MEMORY_SHOW_MS). Кожна зміна — seq + 1.
 * Остання пара — doneMs = now − startedAt, запис з остаточними балами, autoLock.
 */
export function memoryFlip(state: GameState, actorId: string, memberId: string, questionIndex: number, cell: number, now: number): MemoryFlip {
  const checked = memoryRefusal(state, actorId, memberId, questionIndex, now);
  if (!('question' in checked)) return checked.ok ? { ok: false, error: 'wrong_phase' } : checked;
  const play = checked;
  const { cols, rows } = memoryGridSize(play.question.grid);
  if (!Number.isInteger(cell) || cell < 0 || cell >= cols * rows) return { ok: false, error: 'memory_cell' };
  const current = settleMemory(memoryOf(state, actorId) ?? emptyBoard(state), now);
  if (current.shown !== null) return { ok: false, error: 'memory_wait' };
  if (current.turn != null && current.turn.by !== memberId) return { ok: false, error: 'memory_busy' };
  if (current.matched.includes(cell)) return { ok: false, error: 'memory_matched' };
  if (current.open === cell) return { ok: false, error: 'memory_open' };
  const team = teamsOn(state);
  const withBoard = (board: MemoryBoard): MemoryQuestionPlay => ({ ...play, memory: { ...play.memory, boards: { ...play.memory.boards, [actorId]: board } } });
  if (current.open === null) {
    const written: MemoryBoard = { ...current, open: cell, ...(team ? { turn: { by: memberId, until: now + MEMORY_TURN_MS } } : {}), seq: current.seq + 1 };
    return { ok: true, state: withPlay(state, withBoard(written)), outcome: 'open' };
  }
  const first = current.open;
  const layout = memoryLayout(play.question.pairs.length, play.question.seed);
  const after = { ...current, open: null, ...(team ? { turn: null } : {}), moves: current.moves + 1, seq: current.seq + 1 };
  if (memoryPairOf(layout, first) !== memoryPairOf(layout, cell)) {
    const written: MemoryBoard = { ...after, shown: { cells: [first, cell], until: now + MEMORY_SHOW_MS } };
    return { ok: true, state: withPlay(state, withBoard(written)), outcome: 'miss' };
  }
  const matched = [...current.matched, first, cell];
  const done = matched.length === play.question.pairs.length * 2;
  const written: MemoryBoard = {
    ...after,
    matched,
    ...(current.by !== undefined ? { by: [...current.by, memberId] } : {}),
    doneMs: done ? Math.max(0, now - (state.startedAt ?? now)) : null,
  };
  const next = withBoard(written);
  if (!done) return { ok: true, state: withPlay(state, next), outcome: 'match' };
  const record = memoryRecord(state, next, written, written.doneMs ?? 0);
  const finished = withPlay(state, { ...next, answers: { ...next.answers, [actorId]: record } });
  return { ok: true, state: autoLock(finished, now), outcome: 'match' };
}

/**
 * Найближча мить після now, коли на поточній «Пам'яті» (етап question) спливає показ непари чи хід команди: тоді зрізи мають показати
 * картки закритими, хоч стан і не змінився. null — таких таймерів немає.
 */
export function memoryTimersEnd(state: GameState, now: number): number | null {
  const play = memoryPlay(state);
  if (play === null || state.phase !== 'question') return null;
  const ends = Object.values(play.memory.boards).flatMap((board) => [board.shown?.until, board.turn?.until].filter((until): until is number => until !== undefined && until > now));
  return ends.length === 0 ? null : Math.min(...ends);
}

/**
 * На етапі question: записи дошкам без запису (дошка з'являється з першою карткою) — wrong, 0, accuracy = частка пар, час — ліміт.
 * Хто не відкрив жодної картки, запису не отримує. Інакше стан той самий.
 */
export function scoreMemory(state: GameState): GameState {
  const play = memoryPlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const limitMs = limitMsOf(play) ?? 0;
  const answers = { ...play.answers };
  let changed = false;
  for (const [actorId, board] of Object.entries(play.memory.boards)) {
    if (!state.players.some((p) => p.id === actorId) || Object.hasOwn(answers, actorId)) continue;
    answers[actorId] = memoryRecord(state, play, board, limitMs);
    changed = true;
  }
  return changed ? withPlay(state, { ...play, answers }) : state;
}

/** Для openQuestion: дошки минулих запитань спорожнюються — підсумок зберігає запис (answer). Нічого спорожнювати — той самий масив. */
export function packMemories(plays: Play[]): Play[] {
  let changed = false;
  const out = plays.map((play) => {
    if (play.memory === undefined || Object.keys(play.memory.boards).length === 0) return play;
    changed = true;
    return { ...play, memory: { ...play.memory, boards: {} } };
  });
  return changed ? out : plays;
}
