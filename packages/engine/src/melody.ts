import type { Question } from '@quiz/shared';
// game.ts імпортує цей файл, а цей файл — його (через snippets.ts); звертання лише під час виклику функцій.
import type { GameState, Play, Result } from './game';
import { snippetHeard, snippetOpen, snippetPaid, snippetStartEnd } from './snippets';

// «Мелодія за нотами» (29e): кожен гравець (команда — спільно) відкриває шматки 1, 2, 4, 8, 16 с по черзі й один раз
// відповідає текстом через submitAnswer. Бали — частка ціни за найдовшим відкритим шматком (melodyShare), без бонусу швидкості.
// Логіка шматків з 36 — у snippets.ts (спільна з «Відео за фрагментами»); тут — старі назви як тонкі обгортки.

export type MelodyQuestion = Extract<Question, { type: 'melody' }>;

/** Скільки шматків відкрив гравець рушія (команда); 0 — не відкривав або тип не «за шматками» (snippetHeard). */
export function melodyHeard(play: Play, actorId: string): number {
  return snippetHeard(play, actorId);
}

/** За скількома шматками платить відповідь (snippetPaid). */
export function melodyPaid(play: Play, actorId: string): number | undefined {
  return snippetPaid(play, actorId);
}

/** Відкрити шматок (snippetOpen): з 36 — і на videoclip, сервер кличе саме цю назву. */
export function melodyOpen(state: GameState, actorId: string, memberId: string, questionIndex: number, step: number, now: number): Result {
  return snippetOpen(state, actorId, memberId, questionIndex, step, now);
}

/** Мить, коли спливає заставка (snippetStartEnd): melody, videoclip, memory. */
export function melodyStartEnd(state: GameState, now: number): number | null {
  return snippetStartEnd(state, now);
}
