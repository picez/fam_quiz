import { questionPrice, rulesOf, SPOTDIFF_FREEZE_MS, SPOTDIFF_MISSES, spotHit, spotPoints, type ErrorCode, type Grade, type Question, type SpotdiffAnswer } from '@quiz/shared';
import { withPlay } from './blitz';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { autoLock, fail, recordOf, roundQuestionNumber, type AnswerRecord, type GameState, type Play, type Result, type SpotdiffBoard, type SpotdiffPlay } from './game';
import { notStarted } from './splash';
import { memberOf, teamsOn } from './teams';
import { limitMsOf, timeOverFor } from './timing';

// «Знайди відмінності» (29d): кожен гравець (команда — одна спільна дошка) тапає по картинках; сервер перевіряє влучання з допуском.
// Бали: усі знайдені — повна ціна; інакше round(ціна × знайдено / усього). Після SPOTDIFF_MISSES промахів підряд людина замерзає.

export type SpotdiffQuestion = Extract<Question, { type: 'spotdiff' }>;
type SpotdiffQuestionPlay = Play & { question: SpotdiffQuestion; spotdiff: SpotdiffPlay };

/** Тап: hit — знайдено нове коло, miss — промах, freeze — промах, що заморозив людину. */
export type SpotTap = { ok: true; state: GameState; outcome: 'hit' | 'miss' | 'freeze' } | { ok: false; error: ErrorCode };

/** Поточне запитання, якщо це «Знайди відмінності» (на будь-якому етапі). */
function spotdiffPlay(state: GameState): SpotdiffQuestionPlay | null {
  const play = state.plays[state.questionIndex];
  return play !== undefined && play.question.type === 'spotdiff' && play.spotdiff !== undefined ? (play as SpotdiffQuestionPlay) : null;
}

/** Поточна дошка гравця (команди); null — не «Знайди відмінності» або він ще не тапав. */
export function spotdiffOf(state: GameState, actorId: string): SpotdiffBoard | null {
  const boards = spotdiffPlay(state)?.spotdiff.boards;
  return boards !== undefined && Object.hasOwn(boards, actorId) ? boards[actorId] : null;
}

/** Порожня дошка; by — лише в командній грі. */
function emptyBoard(state: GameState): SpotdiffBoard {
  return { found: [], ...(teamsOn(state) ? { by: [] } : {}), misses: {}, frozenUntil: {}, doneMs: null, seq: 0 };
}

/**
 * Запис гравця (команди): бали spotPoints(round(ціна × множник), знайдено, усього); correct — усі, partial — хоч одне, інакше wrong.
 * timeMs — мить останньої знахідки, якщо знайдено все, інакше ліміт (його передає виклик).
 */
function spotdiffRecord(state: GameState, play: SpotdiffQuestionPlay, board: SpotdiffBoard, timeMs: number): AnswerRecord {
  const total = play.question.spots.length;
  const found = board.found.length;
  const done = board.doneMs !== null;
  const base = Math.round(questionPrice(play.question) * rulesOf(state.quiz.rounds[play.roundIndex]).multiplier);
  const points = spotPoints(base, found, total);
  const grade: Grade = done ? 'correct' : found > 0 ? 'partial' : 'wrong';
  const answer: SpotdiffAnswer = { type: 'spotdiff', found, total, done, timeMs: board.doneMs };
  return { answer, timeMs, accepted: done, accuracy: total === 0 ? 0 : found / total, grade, basePoints: points, streakBonus: 0, points, overridden: false };
}

/**
 * Перевірки тапу по черзі: етап, пауза, старт, гравець (у командах — учасник цієї команди), номер запитання в раунді
 * (spotdiff_stale), тип, час, усе знайдено чи запис уже є (spotdiff_done), людина замерзла (spotdiff_frozen).
 */
function spotdiffRefusal(state: GameState, actorId: string, memberId: string, questionIndex: number, now: number): Result | SpotdiffQuestionPlay {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === actorId)) return fail('not_found');
  if (teamsOn(state) && memberOf(state, memberId)?.teamId !== actorId) return fail('not_found');
  // questionIndex — номер запитання в раунді, як у зрізі (view.questionIndex = roundQuestionNumber), а не індекс plays.
  if (questionIndex !== roundQuestionNumber(state)) return fail('spotdiff_stale');
  const play = spotdiffPlay(state);
  if (play === null) return fail('type_mismatch');
  if (state.startedAt === null || timeOverFor(state, play, actorId, now)) return fail('time_over');
  const board = spotdiffOf(state, actorId);
  if (board?.doneMs != null || recordOf(state, state.questionIndex, actorId) !== undefined) return fail('spotdiff_done');
  if (board !== null && now < (board.frozenUntil[memberId] ?? 0)) return fail('spotdiff_frozen');
  return play;
}

/**
 * Тап людини memberId за гравця (команду) actorId у (x, y) — частки картинки — при ширині картинки width CSS px.
 * Влучання — нове коло, промахи людини обнуляються; тап по вже знайденому — spotdiff_found без змін; промах — лічильник + 1,
 * на SPOTDIFF_MISSES — обнулення й заморозка на SPOTDIFF_FREEZE_MS. Останнє коло — doneMs, запис, autoLock.
 */
export function spotdiffTap(state: GameState, actorId: string, memberId: string, questionIndex: number, tap: { x: number; y: number; width: number }, now: number): SpotTap {
  const checked = spotdiffRefusal(state, actorId, memberId, questionIndex, now);
  if (!('question' in checked)) return checked.ok ? { ok: false, error: 'wrong_phase' } : checked;
  const play = checked;
  const current = spotdiffOf(state, actorId) ?? emptyBoard(state);
  const hit = spotHit(play.question, tap.x, tap.y, tap.width, new Set(current.found));
  if (hit === 'found') return { ok: false, error: 'spotdiff_found' };
  const withBoard = (board: SpotdiffBoard): SpotdiffQuestionPlay => ({ ...play, spotdiff: { ...play.spotdiff, boards: { ...play.spotdiff.boards, [actorId]: board } } });
  if (hit === null) {
    const misses = (current.misses[memberId] ?? 0) + 1;
    const freeze = misses >= SPOTDIFF_MISSES;
    const written: SpotdiffBoard = {
      ...current,
      misses: { ...current.misses, [memberId]: freeze ? 0 : misses },
      frozenUntil: freeze ? { ...current.frozenUntil, [memberId]: now + SPOTDIFF_FREEZE_MS } : current.frozenUntil,
    };
    return { ok: true, state: withPlay(state, withBoard(written)), outcome: freeze ? 'freeze' : 'miss' };
  }
  const found = [...current.found, hit];
  const done = found.length === play.question.spots.length;
  const written: SpotdiffBoard = {
    ...current,
    found,
    ...(current.by !== undefined ? { by: [...current.by, memberId] } : {}),
    misses: { ...current.misses, [memberId]: 0 },
    doneMs: done ? Math.max(0, now - (state.startedAt ?? now)) : null,
    seq: current.seq + 1,
  };
  const next = withBoard(written);
  if (!done) return { ok: true, state: withPlay(state, next), outcome: 'hit' };
  const record = spotdiffRecord(state, next, written, written.doneMs ?? 0);
  const finished = withPlay(state, { ...next, answers: { ...next.answers, [actorId]: record } });
  return { ok: true, state: autoLock(finished, now), outcome: 'hit' };
}

/**
 * На етапі question: записи дошкам без запису (людина хоч раз тапнула) — бали за часткою знайденого, час — ліміт запитання.
 * Хто не тапнув ні разу, запису не отримує. Інакше стан той самий.
 */
export function scoreSpotdiff(state: GameState): GameState {
  const play = spotdiffPlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const limitMs = limitMsOf(play) ?? 0;
  const answers = { ...play.answers };
  let changed = false;
  for (const [actorId, board] of Object.entries(play.spotdiff.boards)) {
    if (!state.players.some((p) => p.id === actorId) || Object.hasOwn(answers, actorId)) continue;
    answers[actorId] = spotdiffRecord(state, play, board, limitMs);
    changed = true;
  }
  return changed ? withPlay(state, { ...play, answers }) : state;
}

/** Для openQuestion: дошки минулих запитань спорожнюються — підсумок зберігає запис (answer). Нічого спорожнювати — той самий масив. */
export function packSpotdiffs(plays: Play[]): Play[] {
  let changed = false;
  const out = plays.map((play) => {
    if (play.spotdiff === undefined || Object.keys(play.spotdiff.boards).length === 0) return play;
    changed = true;
    return { ...play, spotdiff: { ...play.spotdiff, boards: {} } };
  });
  return changed ? out : plays;
}
