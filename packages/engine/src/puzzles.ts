import { crosswordCells, crosswordLetter, isPuzzle, LIMITS, questionPrice, rulesOf, type Grade, type PuzzleAnswer, type Question } from '@quiz/shared';
import { withPlay } from './blitz';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { autoLock, fail, ok, recordOf, type AnswerRecord, type GameState, type Play, type PuzzleBoard, type PuzzlePlay, type Result } from './game';
import { notStarted } from './splash';
import { memberOf, teamsOn } from './teams';
import { limitMsOf, timeOverFor } from './timing';

// «Головоломки» (28d): кожен гравець (команда — одна спільна сітка, вписує будь-хто з учасників) розв'язує свою судоку чи кросворд.
// Оцінка — лише «розв'язано повністю» (у кросворді з ключем — ключове слово) чи ні; без швидкості, серії, мінусу й бафів.

type SudokuQuestion = Extract<Question, { type: 'sudoku' }>;
type CrosswordQuestion = Extract<Question, { type: 'crossword' }>;
export type PuzzleQuestion = SudokuQuestion | CrosswordQuestion;
type PuzzleQuestionPlay = Play & { question: PuzzleQuestion; puzzle: PuzzlePlay };

/** Поточне запитання, якщо це головоломка (на будь-якому етапі). */
function puzzlePlay(state: GameState): PuzzleQuestionPlay | null {
  const play = state.plays[state.questionIndex];
  return play !== undefined && isPuzzle(play.question) && play.puzzle !== undefined ? (play as PuzzleQuestionPlay) : null;
}

/** Поточна дошка гравця (команди); null — не головоломка або він ще нічого не вписав. */
export function puzzleOf(state: GameState, actorId: string): PuzzleBoard | null {
  const boards = puzzlePlay(state)?.puzzle.boards;
  return boards !== undefined && Object.hasOwn(boards, actorId) ? boards[actorId] : null;
}

/** Клітинок у сітці: судоку — 36, кросворд — ширина × висота (без розкладки — 0). */
export function puzzleSize(question: PuzzleQuestion): number {
  if (question.type === 'sudoku') return question.givens.length;
  return question.layout === null ? 0 : question.layout.width * question.layout.height;
}

/** Правильні значення за клітинками для вписування: '' — блок кросворду чи задана клітинка судоку (вони не вписуються). */
export function puzzleSolution(question: PuzzleQuestion): string[] {
  if (question.type === 'sudoku') return [...question.solution].map((digit, i) => (question.givens[i] === '0' ? digit : ''));
  return question.layout === null ? [] : crosswordCells(question.layout, question.entries).map((letter) => letter ?? '');
}

/** Клітинок для вписування: судоку — порожні, кросворд — літери. */
export function puzzleTotal(question: PuzzleQuestion): number {
  return puzzleSolution(question).filter((v) => v !== '').length;
}

/** Клітинки, від яких залежить оцінка: кросворд з ключем — keyCells, інакше всі для вписування. */
export function scoredCells(question: PuzzleQuestion, solution: readonly string[]): number[] {
  if (question.type === 'crossword' && question.mode === 'key') return question.layout?.keyCells ?? [];
  return solution.flatMap((v, i) => (v === '' ? [] : [i]));
}

/** Розв'язано: судоку й кросворд full — усі клітинки для вписування збігаються; key — ключові клітинки збігаються з ключем по порядку. */
export function puzzleSolved(question: PuzzleQuestion, cells: readonly string[]): boolean {
  const solution = puzzleSolution(question);
  const scored = scoredCells(question, solution);
  return scored.length > 0 && scored.every((i) => cells[i] === solution[i]);
}

/** Порожня дошка; by — лише в командній грі. */
function emptyBoard(state: GameState, question: PuzzleQuestion): PuzzleBoard {
  const size = puzzleSize(question);
  return { cells: new Array<string>(size).fill(''), ...(teamsOn(state) ? { by: new Array<string>(size).fill('') } : {}), last: null, seq: 0, done: false };
}

/** Сітка одним рядком для історії: судоку — 36 цифр ('0' порожньо, задані на своїх місцях); кросворд — літери, '.' порожньо, '#' блок. */
function gridOf(question: PuzzleQuestion, solution: readonly string[], cells: readonly string[]): string {
  if (question.type === 'sudoku') return [...question.givens].map((given, i) => (given !== '0' ? given : cells[i] || '0')).join('');
  return solution.map((v, i) => (v === '' ? '#' : cells[i] || '.')).join('');
}

/**
 * Запис гравця (команди): correct — розв'язано (бали round(ціна × множник раунду)), інакше wrong і 0. Бали остаточні: вони
 * залежать лише від сітки. accuracy — частка правильних клітинок серед тих, від яких залежить оцінка (лише для статистики).
 */
function puzzleRecord(state: GameState, play: PuzzleQuestionPlay, board: PuzzleBoard, timeMs: number): AnswerRecord {
  const question = play.question;
  const solution = puzzleSolution(question);
  const scored = scoredCells(question, solution);
  const right = scored.filter((i) => board.cells[i] === solution[i]).length;
  const solved = scored.length > 0 && right === scored.length;
  const grade: Grade = solved ? 'correct' : 'wrong';
  const points = solved ? Math.round(questionPrice(question) * rulesOf(state.quiz.rounds[play.roundIndex]).multiplier) : 0;
  const answer: PuzzleAnswer = {
    type: 'puzzle',
    kind: question.type,
    grid: gridOf(question, solution, board.cells),
    filled: solution.filter((v, i) => v !== '' && board.cells[i] !== '').length,
    total: solution.filter((v) => v !== '').length,
    solved,
  };
  return { answer, timeMs, accepted: solved, accuracy: scored.length === 0 ? 0 : right / scored.length, grade, basePoints: points, streakBonus: 0, points, overridden: false };
}

/** Спільні перевірки пакета й «Готово»: етап, пауза, старт, гравець (у командах — учасник memberId цієї команди), запитання, тип, час, здана сітка. */
function puzzleRefusal(state: GameState, actorId: string, memberId: string | null, questionIndex: number, now: number): Result | PuzzleQuestionPlay {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === actorId)) return fail('not_found');
  if (memberId !== null && teamsOn(state) && memberOf(state, memberId)?.teamId !== actorId) return fail('not_found');
  if (questionIndex !== state.questionIndex) return fail('puzzle_stale');
  const play = puzzlePlay(state);
  if (play === null) return fail('type_mismatch');
  if (state.startedAt === null || timeOverFor(state, play, actorId, now)) return fail('time_over');
  if (puzzleOf(state, actorId)?.done === true || recordOf(state, state.questionIndex, actorId) !== undefined) return fail('puzzle_done');
  return play;
}

/** Значення клітинки після перевірки: судоку — '1'…'6', кросворд — одна українська літера (crosswordLetter), '' — стерти; інакше null. */
function cellValue(question: PuzzleQuestion, v: string): string | null {
  if (v === '') return '';
  if (question.type === 'sudoku') return /^[1-6]$/.test(v) ? v : null;
  return crosswordLetter(v);
}

/**
 * Пакет клітинок гравця (команди actorId; у командах memberId — учасник, що вписує). Перевірки по черзі: етап, пауза, старт, гравець
 * (учасник цієї команди), questionIndex не поточне — puzzle_stale, тип, час, сітку здано — puzzle_done; далі кожна клітинка:
 * поза сіткою чи блок кросворду — puzzle_cell, задана судоку — puzzle_given, значення — puzzle_cell. Пакет приймається чи відкидається
 * цілком; останній запис виграє (і в пакеті, і між учасниками). Без жодної зміни — той самий стан.
 */
export function puzzleFill(state: GameState, actorId: string, memberId: string, questionIndex: number, cells: readonly { i: number; v: string }[], now: number): Result {
  const checked = puzzleRefusal(state, actorId, memberId, questionIndex, now);
  if (!('question' in checked)) return checked;
  const play = checked;
  const question = play.question;
  if (cells.length > LIMITS.puzzleBatch) return fail('puzzle_cell');
  const solution = puzzleSolution(question);
  const values: { i: number; v: string }[] = [];
  for (const { i, v } of cells) {
    if (!Number.isInteger(i) || i < 0 || i >= puzzleSize(question)) return fail('puzzle_cell');
    if (question.type === 'crossword' && solution[i] === '') return fail('puzzle_cell');
    if (question.type === 'sudoku' && question.givens[i] !== '0') return fail('puzzle_given');
    const value = cellValue(question, v);
    if (value === null) return fail('puzzle_cell');
    values.push({ i, v: value });
  }
  const board = puzzleOf(state, actorId) ?? emptyBoard(state, question);
  const next = [...board.cells];
  const by = board.by === undefined ? undefined : [...board.by];
  for (const { i, v } of values) {
    next[i] = v;
    if (by !== undefined) by[i] = v === '' ? '' : memberId;
  }
  if (next.every((v, i) => v === board.cells[i])) return ok(state);
  const last = values[values.length - 1].i;
  const written: PuzzleBoard = { ...board, cells: next, ...(by !== undefined ? { by } : {}), last, seq: board.seq + 1 };
  return ok(withPlay(state, { ...play, puzzle: { ...play.puzzle, boards: { ...play.puzzle.boards, [actorId]: written } } }));
}

/**
 * «Готово» гравця (команди): ті самі перевірки, що в пакета, до puzzle_done. Сітка фіксується (done, безповоротно; порожня теж),
 * запис з остаточними балами, далі autoLock — запитання закривається, коли запис мають усі присутні.
 */
export function puzzleFinish(state: GameState, actorId: string, questionIndex: number, now: number): Result {
  const checked = puzzleRefusal(state, actorId, null, questionIndex, now);
  if (!('question' in checked)) return checked;
  const play = checked;
  const board: PuzzleBoard = { ...(puzzleOf(state, actorId) ?? emptyBoard(state, play.question)), done: true };
  const record = puzzleRecord(state, play, board, Math.max(0, now - (state.startedAt ?? now)));
  const finished = withPlay(state, {
    ...play,
    answers: { ...play.answers, [actorId]: record },
    puzzle: { ...play.puzzle, boards: { ...play.puzzle.boards, [actorId]: board } },
  });
  return ok(autoLock(finished, now));
}

/**
 * На етапі question: записи дошкам без запису (повністю правильна сітка без «Готово» — теж correct), час — ліміт запитання.
 * Хто нічого не вписав, запису не отримує (як у «Більше чи менше»): історія, профіль і ачівки не рахують «був у кімнаті» відповіддю,
 * а мінусу в раунді немає. Записи остаточні, тож вилучення після закриття нічиїх балів не змінює. Інакше стан той самий.
 */
export function scorePuzzle(state: GameState): GameState {
  const play = puzzlePlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const limitMs = limitMsOf(play) ?? 0;
  const answers = { ...play.answers };
  let changed = false;
  for (const [actorId, board] of Object.entries(play.puzzle.boards)) {
    if (!state.players.some((p) => p.id === actorId) || Object.hasOwn(answers, actorId)) continue;
    answers[actorId] = puzzleRecord(state, play, board, limitMs);
    changed = true;
  }
  return changed ? withPlay(state, { ...play, answers }) : state;
}

/**
 * Для openQuestion: дошки всіх запитань спорожнюються — сітку кожного зберігає запис (answer.grid), тож стан кімнати
 * не росте з кожною головоломкою. Нічого спорожнювати — той самий масив.
 */
export function packPuzzles(plays: Play[]): Play[] {
  let changed = false;
  const out = plays.map((play) => {
    if (play.puzzle === undefined || Object.keys(play.puzzle.boards).length === 0) return play;
    changed = true;
    return { ...play, puzzle: { ...play.puzzle, boards: {} } };
  });
  return changed ? out : plays;
}
