import { cluesAt, type Question } from '@quiz/shared';
// game.ts імпортує цей файл, а цей файл — його; звертання лише під час виклику функцій.
import { questionFor } from './buffs';
import { fail, ok, withCurrentPlay, type GameState, type Play, type Result } from './game';
import { clockOf } from './hold';
import { notStarted } from './splash';

/** Підказки відкриває ведучий: звичайна усна клітинка поля. */
export function cluesByHost(play: Play): boolean {
  return play.board !== undefined && play.board.kind !== 'blitz' && play.board.answerMode === 'voice';
}

/** Скільки підказок відкрито в play; сирий стан без поля — 1. */
export function cluesOpen(play: Play): number {
  return play.clues ?? 1;
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
 * null — не етап question, не «Хто я?», на полі вибирач замінив запитання запасним, ведучий відкриває сам (усна клітинка), усі відкриті, пауза, утримання або startedAt === null.
 */
export function nextClueAt(state: GameState): number | null {
  const open = openClues(state);
  if (open === null || state.paused || state.heldAt !== null || state.startedAt === null) return null;
  const { play, question } = open;
  if (cluesByHost(play)) return null;
  const opened = cluesOpen(play);
  if (opened >= question.clues.length) return null;
  return state.startedAt + opened * question.interval * 1000;
}

/** Відкриває підказки, чий час настав (за clockOf − startedAt); той самий об’єкт, якщо нічого не змінилось. */
export function openDueClues(state: GameState, now: number): GameState {
  const open = openClues(state);
  if (open === null || state.paused || state.heldAt !== null || state.startedAt === null) return state;
  const { play, question } = open;
  if (cluesByHost(play) || now < state.startedAt) return state;
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

/** На якій підказці дано відповідь: усна клітинка — cluesOpen(play); інакше cluesAt(question, timeMs). Для інших типів — null. */
export function cluesAnswered(play: Play, question: Question, timeMs: number): number | null {
  if (question.type !== 'clues') return null;
  return cluesByHost(play) ? cluesOpen(play) : cluesAt(question, timeMs);
}
