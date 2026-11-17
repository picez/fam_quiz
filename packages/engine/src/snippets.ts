import { SNIPPET_STEP_COUNT, type Question } from '@quiz/shared';
// game.ts імпортує цей файл, а цей файл — його; звертання лише під час виклику функцій.
import { fail, ok, recordOf, roundQuestionNumber, withCurrentPlay, type GameState, type MelodyPlay, type Play, type Result } from './game';
import { notStarted } from './splash';
import { memberOf, teamsOn } from './teams';
import { timeOverFor } from './timing';

// Запитання «за шматками» — «Мелодія за нотами» (29e) і «Відео за фрагментами» (36): кожен гравець (команда — спільно) відкриває шматки
// 1, 2, 4, 8, 16 с по черзі й один раз відповідає текстом через submitAnswer. Бали — частка ціни за найдовшим відкритим шматком
// (snippetShare), без бонусу швидкості. Відкриті шматки обох типів — у необов'язковому Play.melody (нового поля стану немає).

export type SnippetQuestion = Extract<Question, { type: 'melody' | 'videoclip' }>;

/** Запитання «за шматками»: melody чи videoclip. */
export function isSnippetQuestion(question: Question): question is SnippetQuestion {
  return question.type === 'melody' || question.type === 'videoclip';
}

/** Скільки шматків відкрив гравець рушія (команда); 0 — не відкривав або тип не «за шматками». */
export function snippetHeard(play: Play, actorId: string): number {
  if (!isSnippetQuestion(play.question)) return 0;
  const heard = play.melody?.heard;
  return heard !== undefined && Object.hasOwn(heard, actorId) ? heard[actorId] : 0;
}

/** За скількома шматками платить відповідь: для запитання «за шматками» — snippetHeard; інакше undefined. */
export function snippetPaid(play: Play, actorId: string): number | undefined {
  return isSnippetQuestion(play.question) ? snippetHeard(play, actorId) : undefined;
}

/**
 * Людина memberId за гравця (команду) actorId відкриває шматок step. Перевірки по черзі: етап (wrong_phase), пауза чи утримання (paused),
 * заставка (not_started), гравець — у командах учасник цієї команди (not_found), номер запитання в раунді (melody_stale), тип (type_mismatch),
 * запис уже є (already_answered), час (time_over), шматок не по черзі (melody_step). Уже відкритий — той самий стан.
 */
export function snippetOpen(state: GameState, actorId: string, memberId: string, questionIndex: number, step: number, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused || state.heldAt !== null) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === actorId)) return fail('not_found');
  if (teamsOn(state) && memberOf(state, memberId)?.teamId !== actorId) return fail('not_found');
  // questionIndex — номер запитання в раунді, як у зрізі (view.questionIndex = roundQuestionNumber), а не індекс plays.
  if (questionIndex !== roundQuestionNumber(state)) return fail('melody_stale');
  const play = state.plays[state.questionIndex];
  if (play === undefined || !isSnippetQuestion(play.question)) return fail('type_mismatch');
  if (recordOf(state, state.questionIndex, actorId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || timeOverFor(state, play, actorId, now)) return fail('time_over');
  const heard = snippetHeard(play, actorId);
  if (!Number.isInteger(step) || step < 1 || step > SNIPPET_STEP_COUNT || step > heard + 1) return fail('melody_step');
  if (step <= heard) return ok(state);
  const current: MelodyPlay = play.melody ?? (teamsOn(state) ? { heard: {}, by: {} } : { heard: {} });
  const melody: MelodyPlay = {
    heard: { ...current.heard, [actorId]: step },
    ...(teamsOn(state) ? { by: { ...current.by, [actorId]: memberId } } : {}),
  };
  return ok(withCurrentPlay(state, { ...play, melody }));
}

/**
 * Мить, коли спливає заставка перед запитанням «за шматками» (29e, 36): зрізи, збудовані під нею, мають canOpen = false, а сама заставка подій не дає —
 * кімната шле зрізи ще раз у цю мить (watchTimers; +10 мс, щоб таймер не спрацював раніше). null — тип інший, заставки немає чи вона вже мине.
 */
export function snippetStartEnd(state: GameState, now: number): number | null {
  if (state.phase !== 'question' || state.startedAt === null || state.startedAt <= now) return null;
  // «Пам'ять» (29f) так само: canFlip = false під заставкою.
  const type = state.plays[state.questionIndex]?.question.type;
  return type === 'melody' || type === 'videoclip' || type === 'memory' ? state.startedAt + 10 : null;
}
