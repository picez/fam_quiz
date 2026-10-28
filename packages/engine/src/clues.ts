import { cluesAt, isSelfPaced, type Question } from '@quiz/shared';
// game.ts імпортує цей файл, а цей файл — його; звертання лише під час виклику функцій.
import { buffOf, questionFor } from './buffs';
import { fail, ok, recordOf, withCurrentPlay, type GameState, type Play, type Result } from './game';
import { clockOf } from './hold';
import { notStarted } from './splash';
import { timeOverFor } from './timing';

/** Підказки відкриває ведучий: звичайна усна клітинка поля. */
export function cluesByHost(play: Play): boolean {
  return play.board !== undefined && play.board.kind !== 'blitz' && play.board.answerMode === 'voice';
}

/** Скільки підказок відкрито в play; сирий стан без поля — 1. */
export function cluesOpen(play: Play): number {
  return play.clues ?? 1;
}

/** Кожен відкриває підказки сам (12c): cluePace 'self' у класиці чи на звичайній клітинці з телефона; на усній клітинці відкриває ведучий. */
export function cluesBySelf(play: Play): boolean {
  return isSelfPaced(play.question) && play.blitz === undefined && play.final === undefined && !cluesByHost(play);
}

/** Скільки підказок відкрив гравець рушія (12c); немає запису — 1. */
export function cluesOpenBy(play: Play, playerId: string): number {
  return play.clueOpens?.[playerId] ?? 1;
}

/** Скільки підказок бачить гравець: власний темп — свої (на полі — того, хто вибрав клітинку); інакше спільне cluesOpen(play). */
export function cluesSeenBy(play: Play, viewerId: string): number {
  if (!cluesBySelf(play)) return cluesOpen(play);
  return cluesOpenBy(play, play.board?.chooserId ?? viewerId);
}

/** За скількома підказками платить відповідь: усна клітинка — cluesOpen(play); власний темп — cluesOpenBy; інакше undefined (за часом). */
export function cluesPaid(play: Play, playerId: string): number | undefined {
  if (cluesByHost(play)) return cluesOpen(play);
  return cluesBySelf(play) ? cluesOpenBy(play, playerId) : undefined;
}

/**
 * Поточне запитання «Хто я?» на етапі question, якщо його бачать усі; інакше null.
 * На полі після заміни всі бачать запасне (простий тип), тож підказок основного вже немає — null.
 */
function openClues(state: GameState): { play: Play; question: Extract<Question, { type: 'clues' }> } | null {
  if (state.phase !== 'question') return null;
  const play = state.plays[state.questionIndex];
  if (play === undefined || play.question.type !== 'clues') return null;
  if (play.board !== undefined && questionFor(state, play, play.board.chooserId) !== play.question) return null;
  return { play, question: play.question };
}

/**
 * Мить (час сервера), коли відкриється наступна підказка: startedAt + cluesOpen × interval × 1000.
 * null — не етап question, не «Хто я?», на полі вибирач замінив запитання запасним, ведучий відкриває сам (усна клітинка), кожен відкриває сам (12c),
 * усі відкриті, пауза, утримання або startedAt === null.
 */
export function nextClueAt(state: GameState): number | null {
  const open = openClues(state);
  if (open === null || state.paused || state.heldAt !== null || state.startedAt === null) return null;
  const { play, question } = open;
  if (cluesByHost(play) || cluesBySelf(play)) return null;
  const opened = cluesOpen(play);
  if (opened >= question.clues.length) return null;
  return state.startedAt + opened * question.interval * 1000;
}

/** Відкриває підказки, чий час настав (за clockOf − startedAt); той самий об’єкт, якщо нічого не змінилось (і у власному темпі 12c). */
export function openDueClues(state: GameState, now: number): GameState {
  const open = openClues(state);
  if (open === null || state.paused || state.heldAt !== null || state.startedAt === null) return state;
  const { play, question } = open;
  if (cluesByHost(play) || cluesBySelf(play) || now < state.startedAt) return state;
  const due = cluesAt(question, clockOf(state, now) - state.startedAt);
  return due > cluesOpen(play) ? withCurrentPlay(state, { ...play, clues: due }) : state;
}

/**
 * Ведучий відкриває наступну підказку на усній клітинці.
 * Помилки: wrong_phase — не етап question, поточне запитання не «Хто я?» або клітинка не усна; paused; not_started — ще йде заставка; clues_done — усі відкриті.
 */
export function nextClue(state: GameState, now: number): Result {
  const open = openClues(state);
  if (open === null || !cluesByHost(open.play)) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  const { play, question } = open;
  const opened = cluesOpen(play);
  if (opened >= question.clues.length) return fail('clues_done');
  return ok(withCurrentPlay(state, { ...play, clues: opened + 1 }));
}

/**
 * Гравець (команда) відкриває собі наступну підказку (12c).
 * Помилки: wrong_phase — не етап question, не «Хто я?», не власний темп (зокрема усна клітинка) або гравець відповідає на запасне;
 * not_found — гравця немає; not_your_turn — на полі не той, хто вибрав клітинку; already_answered — є запис, відповідь поля
 * чекає «Прийняти» або є перша спроба; paused — пауза чи утримання; not_started — ще йде заставка; time_over — сплив особистий
 * кінець, а запитання ще відкрите; clues_done — усі відкриті.
 */
export function openClue(state: GameState, playerId: string, now: number): Result {
  const open = openClues(state);
  if (open === null || !cluesBySelf(open.play)) return fail('wrong_phase');
  const { play, question } = open;
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (play.board !== undefined && play.board.chooserId !== playerId) return fail('not_your_turn');
  if (questionFor(state, play, playerId) !== play.question) return fail('wrong_phase');
  const answered =
    recordOf(state, state.questionIndex, playerId) !== undefined || (play.board?.answer ?? null) !== null || buffOf(play, playerId)?.first != null;
  if (answered) return fail('already_answered');
  if (state.paused || state.heldAt !== null) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (timeOverFor(state, play, playerId, now)) return fail('time_over');
  const opened = cluesOpenBy(play, playerId);
  if (opened >= question.clues.length) return fail('clues_done');
  return ok(withCurrentPlay(state, { ...play, clueOpens: { ...play.clueOpens, [playerId]: opened + 1 } }));
}

/** На якій підказці дано відповідь: усна клітинка — cluesOpen(play); власний темп — скільки відкрив гравець; інакше cluesAt. Для інших типів — null. */
export function cluesAnswered(play: Play, question: Question, timeMs: number, playerId: string): number | null {
  if (question.type !== 'clues') return null;
  return cluesPaid(play, playerId) ?? cluesAt(question, timeMs);
}
