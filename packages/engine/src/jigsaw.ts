import { JIGSAW_HOLD_MS, jigsawFits, questionPrice, rulesOf, type Grade, type JigsawAnswer, type Question } from '@quiz/shared';
import { withPlay } from './blitz';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { autoLock, fail, ok, recordOf, roundQuestionNumber, type AnswerRecord, type GameState, type JigsawBoard, type JigsawPlay, type Play, type Result } from './game';
import { notStarted } from './splash';
import { memberOf, teamsOn } from './teams';
import { limitMsOf, timeOverFor } from './timing';

// «Пазл» (29c): кожен гравець (команда — один спільний пазл) ставить шматочки на місце; сервер перевіряє місце й поворот.
// Бали: перший, хто склав, — максимум; інші — round(максимум × час найшвидшого / свій час); не склав — 0.

export type JigsawQuestion = Extract<Question, { type: 'jigsaw' }>;
type JigsawQuestionPlay = Play & { question: JigsawQuestion; jigsaw: JigsawPlay };
type Hold = { by: string; until: number };

/** Поточне запитання, якщо це пазл (на будь-якому етапі). */
function jigsawPlay(state: GameState): JigsawQuestionPlay | null {
  const play = state.plays[state.questionIndex];
  return play !== undefined && play.question.type === 'jigsaw' && play.jigsaw !== undefined ? (play as JigsawQuestionPlay) : null;
}

/** Поточна дошка гравця (команди); null — не пазл або він ще нічого не поставив. */
export function jigsawOf(state: GameState, actorId: string): JigsawBoard | null {
  const boards = jigsawPlay(state)?.jigsaw.boards;
  return boards !== undefined && Object.hasOwn(boards, actorId) ? boards[actorId] : null;
}

/** Шматочків у пазлі: рядки × стовпці. */
export function jigsawTotal(question: JigsawQuestion): number {
  return question.rows * question.cols;
}

/** Живі блоки дошки на мить now (прострочені відкинуто). */
export function liveHolds(board: JigsawBoard, now: number): Record<string, Hold> {
  return Object.fromEntries(Object.entries(board.held ?? {}).filter(([, hold]) => hold.until > now));
}

/**
 * Найближча мить після now, коли спливає живий блок «тримаю» поточного пазла (на етапі question): тоді зрізи товаришів мають
 * показати шматочок вільним, хоч стан і не змінився. null — живих блоків немає.
 */
export function jigsawHoldsEnd(state: GameState, now: number): number | null {
  const play = jigsawPlay(state);
  if (play === null || state.phase !== 'question') return null;
  const ends = Object.values(play.jigsaw.boards).flatMap((board) => Object.values(liveHolds(board, now)).map((hold) => hold.until));
  return ends.length === 0 ? null : Math.min(...ends);
}

/** Порожня дошка; by і held — лише в командній грі. */
function emptyBoard(state: GameState): JigsawBoard {
  return { placed: [], ...(teamsOn(state) ? { by: [], held: {} } : {}), doneMs: null, seq: 0 };
}

/**
 * Запис гравця (команди). Складений — correct і бали round(round(ціна × множник) × найшвидший / свій час), де найшвидший — серед усіх
 * складених цього запитання (перший складений завжди найшвидший, тож бали остаточні). Не складений — wrong, 0, accuracy = частка шматочків.
 */
function jigsawRecord(state: GameState, play: JigsawQuestionPlay, board: JigsawBoard, timeMs: number): AnswerRecord {
  const total = jigsawTotal(play.question);
  const finished = board.doneMs !== null;
  const base = Math.round(questionPrice(play.question) * rulesOf(state.quiz.rounds[play.roundIndex]).multiplier);
  const times = Object.values(play.answers).flatMap((r) => (r.answer?.type === 'jigsaw' && r.answer.done && r.answer.timeMs !== null ? [r.answer.timeMs] : []));
  const fastest = Math.min(timeMs, ...times);
  const points = finished ? Math.round((base * fastest) / Math.max(1, timeMs)) : 0;
  const grade: Grade = finished ? 'correct' : 'wrong';
  const answer: JigsawAnswer = { type: 'jigsaw', placed: board.placed.length, total, done: finished, timeMs: board.doneMs };
  return { answer, timeMs, accepted: finished, accuracy: finished ? 1 : board.placed.length / total, grade, basePoints: points, streakBonus: 0, points, overridden: false };
}

/**
 * Спільні перевірки «тримаю» й постановки: етап, пауза, старт, гравець (у командах — учасник цієї команди), номер запитання
 * в раунді (jigsaw_stale), тип, час, пазл складено (jigsaw_done).
 */
function jigsawRefusal(state: GameState, actorId: string, memberId: string, questionIndex: number, now: number): Result | JigsawQuestionPlay {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === actorId)) return fail('not_found');
  if (teamsOn(state) && memberOf(state, memberId)?.teamId !== actorId) return fail('not_found');
  // questionIndex — номер запитання в раунді, як у зрізі (view.questionIndex = roundQuestionNumber), а не індекс plays.
  if (questionIndex !== roundQuestionNumber(state)) return fail('jigsaw_stale');
  const play = jigsawPlay(state);
  if (play === null) return fail('type_mismatch');
  if (state.startedAt === null || timeOverFor(state, play, actorId, now)) return fail('time_over');
  if (jigsawOf(state, actorId)?.doneMs != null || recordOf(state, state.questionIndex, actorId) !== undefined) return fail('jigsaw_done');
  return play;
}

/** Перевірки шматочка: поза межами, уже поставлений (товаришем теж), його тримає інший учасник. */
function pieceRefusal(play: JigsawQuestionPlay, board: JigsawBoard | null, memberId: string, piece: number, now: number): Result | null {
  if (!Number.isInteger(piece) || piece < 0 || piece >= jigsawTotal(play.question)) return fail('jigsaw_piece');
  if (board?.placed.includes(piece) === true) return fail('jigsaw_placed');
  const hold = board?.held?.[piece];
  if (hold !== undefined && hold.by !== memberId && hold.until > now) return fail('jigsaw_held');
  return null;
}

/** «Тримаю» учасника команди: блок на JIGSAW_HOLD_MS для решти. Ті самі перевірки, що в постановки, до jigsaw_held; соло — без змін. */
export function jigsawHold(state: GameState, actorId: string, memberId: string, questionIndex: number, piece: number, now: number): Result {
  const checked = jigsawRefusal(state, actorId, memberId, questionIndex, now);
  if (!('question' in checked)) return checked;
  const play = checked;
  const board = jigsawOf(state, actorId);
  const refused = pieceRefusal(play, board, memberId, piece, now);
  if (refused !== null) return refused;
  if (!teamsOn(state)) return ok(state);
  const current = board ?? emptyBoard(state);
  const held = { ...liveHolds(current, now), [piece]: { by: memberId, until: now + JIGSAW_HOLD_MS } };
  return ok(withPlay(state, { ...play, jigsaw: { ...play.jigsaw, boards: { ...play.jigsaw.boards, [actorId]: { ...current, held } } } }));
}

/**
 * Постановка шматочка. Перевірки по черзі: етап, пауза, старт, гравець, номер у раунді (jigsaw_stale), тип, час, складено (jigsaw_done),
 * шматочок поза межами (jigsaw_piece), уже поставлений (jigsaw_placed), тримає інший (jigsaw_held), не прилипає (jigsaw_miss).
 * Останній шматочок — doneMs = now − startedAt, запис з остаточними балами, autoLock.
 */
export function jigsawPlace(state: GameState, actorId: string, memberId: string, questionIndex: number, move: { piece: number; x: number; y: number; rot: number }, now: number): Result {
  const checked = jigsawRefusal(state, actorId, memberId, questionIndex, now);
  if (!('question' in checked)) return checked;
  const play = checked;
  const board = jigsawOf(state, actorId);
  const refused = pieceRefusal(play, board, memberId, move.piece, now);
  if (refused !== null) return refused;
  if (!jigsawFits(play.question, move.piece, move.x, move.y, move.rot)) return fail('jigsaw_miss');
  const current = board ?? emptyBoard(state);
  const placed = [...current.placed, move.piece];
  const done = placed.length === jigsawTotal(play.question);
  const { [move.piece]: _released, ...held } = liveHolds(current, now);
  const written: JigsawBoard = {
    ...current,
    placed,
    ...(current.by !== undefined ? { by: [...current.by, memberId] } : {}),
    ...(current.held !== undefined ? { held } : {}),
    doneMs: done ? Math.max(0, now - (state.startedAt ?? now)) : null,
    seq: current.seq + 1,
  };
  const boards = { ...play.jigsaw.boards, [actorId]: written };
  if (!done) return ok(withPlay(state, { ...play, jigsaw: { ...play.jigsaw, boards } }));
  const record = jigsawRecord(state, play, written, written.doneMs ?? 0);
  const finished = withPlay(state, { ...play, answers: { ...play.answers, [actorId]: record }, jigsaw: { ...play.jigsaw, boards } });
  return ok(autoLock(finished, now));
}

/**
 * На етапі question: записи дошкам без запису (хоч один шматочок) — wrong, 0, час — ліміт запитання. Хто нічого не поставив, запису
 * не отримує (як scorePuzzle). Інакше стан той самий.
 */
export function scoreJigsaw(state: GameState): GameState {
  const play = jigsawPlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const limitMs = limitMsOf(play) ?? 0;
  const answers = { ...play.answers };
  let changed = false;
  for (const [actorId, board] of Object.entries(play.jigsaw.boards)) {
    if (!state.players.some((p) => p.id === actorId) || Object.hasOwn(answers, actorId) || board.placed.length === 0) continue;
    answers[actorId] = jigsawRecord(state, play, board, limitMs);
    changed = true;
  }
  return changed ? withPlay(state, { ...play, answers }) : state;
}

/** Для openQuestion: дошки минулих запитань спорожнюються — підсумок зберігає запис (answer). Нічого спорожнювати — той самий масив. */
export function packJigsaws(plays: Play[]): Play[] {
  let changed = false;
  const out = plays.map((play) => {
    if (play.jigsaw === undefined || Object.keys(play.jigsaw.boards).length === 0) return play;
    changed = true;
    return { ...play, jigsaw: { ...play.jigsaw, boards: {} } };
  });
  return changed ? out : plays;
}
