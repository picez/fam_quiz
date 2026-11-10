import { applyDrawOp, LIMITS, questionPrice, rulesOf, strokePoints, type DrawOp, type Grade, type Question } from '@quiz/shared';
import { withPlay } from './blitz';
import { textAccepts } from './check';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { autoLock, fail, ok, recordOf, type AnswerRecord, type DrawingPlay, type DrawTurns, type GameState, type Play, type Result } from './game';
import { presentPlayers } from './present';
import { notStarted } from './splash';
import { actorOf } from './team-act';
import { memberOf, teamMembers, teamsOn } from './teams';
import { limitMsOf, timeOverFor } from './timing';

// «Малюнок» (28c): кожне наступне запитання малює наступна сторона (у командах — її учасники по черзі), решта вгадує слово.
// Вгадувач — ціна × множник раунду, остаточно в мить вгадування; художник — частка ціни за кожного, хто вгадав, при закритті.

type DrawingQuestion = Extract<Question, { type: 'drawing' }>;
type DrawPlay = Play & { question: DrawingQuestion; drawing: DrawingPlay };

const NO_TURNS: DrawTurns = { last: null, members: {} };

/** Поточне запитання, якщо це «Малюнок» (на будь-якому етапі). */
function drawPlay(state: GameState): DrawPlay | null {
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'drawing' && play.drawing !== undefined ? (play as DrawPlay) : null;
}

/** Людина на зв'язку чи її чекають після перезапуску (awaiting). */
function online(state: GameState, connected: boolean, id: string): boolean {
  return connected || state.awaiting.includes(id);
}

/** Елементи по колу, починаючи з наступного після last (last не знайдено чи null — з першого). */
function after<T extends { id: string }>(items: readonly T[], last: string | null | undefined): T[] {
  const from = items.findIndex((item) => item.id === last) + 1;
  return [...items.slice(from), ...items.slice(0, from)];
}

/**
 * Хто малює наступне запитання: соло — наступний гравець після drawTurns.last, що на зв'язку (чи в awaiting); нікого — перший кандидат.
 * Командна гра — наступна команда з учасником на зв'язку, а в ній наступний після drawTurns.members[команда] учасник на зв'язку.
 * Гравців немає — null.
 */
export function pickDrawer(state: GameState): { drawerId: string; side: string } | null {
  const turns = state.drawTurns ?? NO_TURNS;
  const sides = after(state.players, turns.last);
  if (sides.length === 0) return null;
  if (!teamsOn(state)) {
    const chosen = sides.find((p) => online(state, p.connected, p.id)) ?? sides[0];
    return { drawerId: chosen.id, side: chosen.id };
  }
  const memberFor = (team: string) => {
    const queue = after(teamMembers(state, team), turns.members[team]);
    return queue.find((m) => online(state, m.connected, m.id)) ?? null;
  };
  for (const side of sides) {
    const member = memberFor(side.id);
    if (member !== null) return { drawerId: member.id, side: side.id };
  }
  // Ніхто не на зв'язку: перша команда-кандидат і її наступний учасник.
  for (const side of sides) {
    const first = after(teamMembers(state, side.id), turns.members[side.id])[0];
    if (first !== undefined) return { drawerId: first.id, side: side.id };
  }
  return null;
}

/** Для openQuestion: Play.drawing (порожній малюнок) і лічильник черги після цього вибору. */
export function openDrawing(state: GameState): { drawing: DrawingPlay; drawTurns: DrawTurns } {
  const turns = state.drawTurns ?? NO_TURNS;
  const pick = pickDrawer(state);
  const drawing: DrawingPlay = { drawerId: pick?.drawerId ?? null, side: pick?.side ?? null, strokes: [], rev: 0, guessed: [] };
  if (pick === null) return { drawing, drawTurns: turns };
  const members = teamsOn(state) ? { ...turns.members, [pick.side]: pick.drawerId } : turns.members;
  return { drawing, drawTurns: { last: pick.side, members } };
}

/** Малюнок поточного запитання на етапах question, locked і reveal; інакше null. */
export function drawingOf(state: GameState): DrawingPlay | null {
  if (state.phase !== 'question' && state.phase !== 'locked' && state.phase !== 'reveal') return null;
  return drawPlay(state)?.drawing ?? null;
}

/** Людина гри: соло — гравець, командна гра — учасник. */
function isPerson(state: GameState, personId: string): boolean {
  return teamsOn(state) ? memberOf(state, personId) !== undefined : state.players.some((p) => p.id === personId);
}

/** Чи операція вмістилася б у межі штрихів і точок. */
function fits(strokes: DrawingPlay['strokes'], op: DrawOp): boolean {
  if (op.op === 'begin') {
    const points = op.p.length / 2;
    return strokes.length < LIMITS.maxStrokes && points <= LIMITS.maxStrokePoints && strokePoints(strokes) + points <= LIMITS.maxDrawingPoints;
  }
  if (op.op === 'more') {
    const points = op.p.length / 2;
    const last = strokes[op.index];
    return last !== undefined && last.p.length / 2 + points <= LIMITS.maxStrokePoints && strokePoints(strokes) + points <= LIMITS.maxDrawingPoints;
  }
  return true;
}

/**
 * Операція художника, по черзі: етап, пауза, старт, людина, тип, художник, час; more не до останнього штриха — drawing_stale;
 * «крок назад» чи «очистити» порожнього малюнка — той самий стан; понад межі — drawing_full. Інакше applyDrawOp і rev + 1.
 * Координати й індекси кольорів перевіряє схема події (drawOpSchema).
 */
export function drawStroke(state: GameState, memberId: string, op: DrawOp, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!isPerson(state, memberId)) return fail('not_found');
  const play = drawPlay(state);
  if (play === null) return fail('type_mismatch');
  const drawing = play.drawing;
  if (drawing.drawerId === null || drawing.drawerId !== memberId) return fail('drawing_not_drawer');
  if (state.startedAt === null || timeOverFor(state, play, drawing.side ?? memberId, now)) return fail('time_over');
  if (op.op === 'more' && op.index !== drawing.strokes.length - 1) return fail('drawing_stale');
  if ((op.op === 'undo' || op.op === 'clear') && drawing.strokes.length === 0) return ok(state);
  if (!fits(drawing.strokes, op)) return fail('drawing_full');
  return ok(withPlay(state, { ...play, drawing: { ...drawing, strokes: applyDrawOp(drawing.strokes, op), rev: drawing.rev + 1 } }));
}

/** Бали вгадувача: round(ціна × множник раунду), без швидкості, серії й бафів. */
export function drawingPoints(state: GameState, play: Play): number {
  if (play.question.type !== 'drawing') return 0;
  return Math.round(questionPrice(play.question) * rulesOf(state.quiz.rounds[play.roundIndex]).multiplier);
}

/**
 * Спроба вгадати, по черзі: етап, пауза, старт, людина (сторона — actorOf 'answer'), тип, час; сторона художника — drawing_own;
 * сторона вже вгадала — already_answered; слово не прийнято (textAccepts) — drawing_miss, стан той самий і нікуди не пишеться.
 * Вгадано — запис сторони з остаточними балами, сторона в guessed, autoLock.
 */
export function drawGuess(state: GameState, memberId: string, text: string, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!isPerson(state, memberId)) return fail('not_found');
  const play = drawPlay(state);
  if (play === null) return fail('type_mismatch');
  const who = actorOf(state, memberId, 'answer');
  if (!who.ok) return fail(who.error);
  const side = who.id;
  if (!state.players.some((p) => p.id === side)) return fail('not_found');
  if (state.startedAt === null || timeOverFor(state, play, side, now)) return fail('time_over');
  if (side === play.drawing.side) return fail('drawing_own');
  if (recordOf(state, state.questionIndex, side) !== undefined) return fail('already_answered');
  if (!textAccepts(play.question.accepted, text)) return fail('drawing_miss');
  const points = drawingPoints(state, play);
  const record: AnswerRecord = {
    answer: { type: 'drawing', guess: text, drew: null },
    timeMs: Math.max(0, now - state.startedAt),
    accepted: true,
    accuracy: 1,
    grade: 'correct',
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
  const guessed = withPlay(state, { ...play, answers: { ...play.answers, [side]: record }, drawing: { ...play.drawing, guessed: [...play.drawing.guessed, side] } });
  return ok(autoLock(guessed, now));
}

/** Сторони, що могли вгадати: усі, крім художника, що на зв'язку (чи в awaiting) або вже вгадали; у порядку гравців. */
export function drawingCould(state: GameState, play: Play): string[] {
  const drawing = play.drawing;
  if (drawing === undefined) return [];
  const present = new Set(presentPlayers(state).map((p) => p.id));
  return state.players.map((p) => p.id).filter((id) => id !== drawing.side && (present.has(id) || drawing.guessed.includes(id)));
}

/** На етапі question: хоч одна сторона могла вгадати, і всі такі вгадали. */
export function drawingDone(state: GameState): boolean {
  const play = drawPlay(state);
  if (state.phase !== 'question' || play === null) return false;
  const could = drawingCould(state, play);
  return could.length > 0 && could.every((id) => play.drawing.guessed.includes(id));
}

/** Запис без вгадування (і без малювання): 0 балів, «неправильно». */
function silentRecord(timeMs: number): AnswerRecord {
  return {
    answer: { type: 'drawing', guess: null, drew: null },
    timeMs,
    accepted: false,
    accuracy: 0,
    grade: 'wrong',
    basePoints: 0,
    streakBonus: 0,
    points: 0,
    overridden: false,
  };
}

/**
 * На етапі question: художникові (його стороні, якщо вона ще в грі) — round(ціна × множник × вгадали / могли), оцінка correct
 * (усі, хто міг), partial (хоч один) чи wrong (ніхто); решті сторін без запису — 0 і wrong (мінус раунду не діє).
 * Лічильники заморожуються в scored: вилучення після закриття їх і балів не змінює. Інакше стан той самий.
 */
export function scoreDrawing(state: GameState): GameState {
  const play = drawPlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const drawing = play.drawing;
  const limitMs = limitMsOf(play) ?? 0;
  const could = drawingCould(state, play);
  const guessed = could.filter((id) => drawing.guessed.includes(id)).length;
  const answers = { ...play.answers };
  const side = drawing.side;
  if (side !== null && state.players.some((p) => p.id === side) && !Object.hasOwn(answers, side)) {
    const multiplier = rulesOf(state.quiz.rounds[play.roundIndex]).multiplier;
    const share = could.length === 0 ? 0 : Math.round((questionPrice(play.question) * multiplier * guessed) / could.length);
    const grade: Grade = could.length > 0 && guessed === could.length ? 'correct' : guessed > 0 ? 'partial' : 'wrong';
    answers[side] = {
      answer: { type: 'drawing', guess: null, drew: { guessed, could: could.length } },
      timeMs: limitMs,
      accepted: grade === 'correct',
      accuracy: could.length === 0 ? 0 : guessed / could.length,
      grade,
      basePoints: share,
      streakBonus: 0,
      points: share,
      overridden: false,
    };
  }
  for (const player of state.players) if (!Object.hasOwn(answers, player.id)) answers[player.id] = silentRecord(limitMs);
  return withPlay(state, { ...play, answers, drawing: { ...drawing, scored: { guessed, could: could.length } } });
}

/**
 * Після вилучення (removePlayer): на ще не закритому малюнку художник, якого більше немає, — null; сторона, якої немає, — null
 * і зникає з guessed. Закритий малюнок (scored) не змінюється. Внутрішня функція рушія.
 */
export function dropFromDrawing(state: GameState): GameState {
  const play = drawPlay(state);
  if (play === null || play.drawing.scored !== undefined) return state;
  const drawing = play.drawing;
  const inPlayers = (id: string) => state.players.some((p) => p.id === id);
  const drawerId = drawing.drawerId !== null && isPerson(state, drawing.drawerId) ? drawing.drawerId : null;
  const side = drawing.side !== null && inPlayers(drawing.side) ? drawing.side : null;
  const guessed = drawing.guessed.filter(inPlayers);
  if (drawerId === drawing.drawerId && side === drawing.side && guessed.length === drawing.guessed.length) return state;
  return withPlay(state, { ...play, drawing: { ...drawing, drawerId, side, guessed } });
}
