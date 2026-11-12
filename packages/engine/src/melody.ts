import { MELODY_STEP_COUNT, type Question } from '@quiz/shared';
// game.ts імпортує цей файл, а цей файл — його; звертання лише під час виклику функцій.
import { fail, ok, recordOf, roundQuestionNumber, withCurrentPlay, type GameState, type MelodyPlay, type Play, type Result } from './game';
import { notStarted } from './splash';
import { memberOf, teamsOn } from './teams';
import { timeOverFor } from './timing';

// «Мелодія за нотами» (29e): кожен гравець (команда — спільно) відкриває шматки 1, 2, 4, 8, 16 с по черзі й один раз
// відповідає текстом через submitAnswer. Бали — частка ціни за найдовшим відкритим шматком (melodyShare), без бонусу швидкості.

export type MelodyQuestion = Extract<Question, { type: 'melody' }>;

/** Скільки шматків відкрив гравець рушія (команда); 0 — не відкривав або запитання не melody. */
export function melodyHeard(play: Play, actorId: string): number {
  if (play.question.type !== 'melody') return 0;
  const heard = play.melody?.heard;
  return heard !== undefined && Object.hasOwn(heard, actorId) ? heard[actorId] : 0;
}

/** За скількома шматками платить відповідь: для melody — melodyHeard; інакше undefined. */
export function melodyPaid(play: Play, actorId: string): number | undefined {
  return play.question.type === 'melody' ? melodyHeard(play, actorId) : undefined;
}

/**
 * Людина memberId за гравця (команду) actorId відкриває шматок step. Перевірки по черзі: етап (wrong_phase), пауза чи утримання (paused),
 * заставка (not_started), гравець — у командах учасник цієї команди (not_found), номер запитання в раунді (melody_stale), тип (type_mismatch),
 * запис уже є (already_answered), час (time_over), шматок не по черзі (melody_step). Уже відкритий — той самий стан.
 */
export function melodyOpen(state: GameState, actorId: string, memberId: string, questionIndex: number, step: number, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused || state.heldAt !== null) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === actorId)) return fail('not_found');
  if (teamsOn(state) && memberOf(state, memberId)?.teamId !== actorId) return fail('not_found');
  // questionIndex — номер запитання в раунді, як у зрізі (view.questionIndex = roundQuestionNumber), а не індекс plays.
  if (questionIndex !== roundQuestionNumber(state)) return fail('melody_stale');
  const play = state.plays[state.questionIndex];
  if (play === undefined || play.question.type !== 'melody') return fail('type_mismatch');
  if (recordOf(state, state.questionIndex, actorId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || timeOverFor(state, play, actorId, now)) return fail('time_over');
  const heard = melodyHeard(play, actorId);
  if (!Number.isInteger(step) || step < 1 || step > MELODY_STEP_COUNT || step > heard + 1) return fail('melody_step');
  if (step <= heard) return ok(state);
  const current: MelodyPlay = play.melody ?? (teamsOn(state) ? { heard: {}, by: {} } : { heard: {} });
  const melody: MelodyPlay = {
    heard: { ...current.heard, [actorId]: step },
    ...(teamsOn(state) ? { by: { ...current.by, [actorId]: memberId } } : {}),
  };
  return ok(withCurrentPlay(state, { ...play, melody }));
}
