import { questionPrice, rulesOf, type Grade, type MoreLessSide, type Question } from '@quiz/shared';
import { withPlay } from './blitz';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { betsRefusal } from './bets';
import { autoLock, fail, ok, recordOf, revealNow, type AnswerRecord, type GameState, type MoreLessPlay, type MoreLessProgress, type Play, type Result } from './game';
import { notStarted } from './splash';
import { limitMsOf, timeOverFor } from './timing';

// «Більше чи менше» (28a): гравець (команда) у своєму темпі проходить ряд порівнянь, вибираючи сторону a чи b.
// Бали за кожне правильне порівняння окремо; правильність до розкриття не показується.

const UNTOUCHED: MoreLessProgress = { picks: [] };

type MoreLessQuestion = Extract<Question, { type: 'moreless' }>;
type RowPlay = Play & { question: MoreLessQuestion };

/** Поточне запитання, якщо воно «Більше чи менше». */
function rowPlay(state: GameState): RowPlay | null {
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'moreless' ? (play as RowPlay) : null;
}

/** Вибори гравця (команди) на поточному запитанні; без запису — { picks: [] }. */
export function moreLessOf(state: GameState, playerId: string): MoreLessProgress {
  const progress = state.plays[state.questionIndex]?.moreless?.progress;
  return progress !== undefined && Object.hasOwn(progress, playerId) ? progress[playerId] : UNTOUCHED;
}

/** Скільки виборів збігається з правильною стороною (зайві вибори понад ряд не рахуються). */
function rightOf(question: MoreLessQuestion, picks: readonly MoreLessSide[]): number {
  return question.pairs.filter((pair, i) => picks[i] === pair.correct).length;
}

/** Бали за вибори: сума балів правильних × множник раунду × позначка клітинки, не більше questionPrice × множники. */
export function moreLessPoints(state: GameState, play: Play, picks: readonly MoreLessSide[]): number {
  const question = play.question;
  if (question.type !== 'moreless') return 0;
  const multiplier = rulesOf(state.quiz.rounds[play.roundIndex]).multiplier * (play.board?.multiplier ?? 1);
  const cap = Math.round(questionPrice(question) * multiplier);
  const sum = question.pairs.reduce((total, pair, i) => total + (picks[i] === pair.correct ? pair.points : 0), 0);
  return Math.min(cap, Math.round(sum * multiplier));
}

/** Скільки гравців (команд) відповіли правильно на кожне порівняння: після закриття — scored, до того — за поточним станом. */
export function moreLessRight(state: GameState, play: Play): number[] {
  const question = play.question;
  if (question.type !== 'moreless') return [];
  if (play.moreless?.scored !== undefined) return play.moreless.scored.right;
  const rows = Object.entries(play.moreless?.progress ?? {})
    .filter(([id]) => state.players.some((p) => p.id === id))
    .map(([, progress]) => progress.picks);
  return question.pairs.map((pair, i) => rows.filter((picks) => picks[i] === pair.correct).length);
}

/**
 * Запис гравця (команди): правильно — увесь ряд правильно; частково — хоча б одне правильне (неповний ряд — завжди не вище);
 * неправильно — жодного. Бали остаточні: вони залежать лише від запитання, а не від інших гравців.
 */
function rowRecord(state: GameState, play: RowPlay, picks: MoreLessSide[], timeMs: number): AnswerRecord {
  const total = play.question.pairs.length;
  const right = rightOf(play.question, picks);
  const grade: Grade = right === total ? 'correct' : right > 0 ? 'partial' : 'wrong';
  const points = moreLessPoints(state, play, picks);
  return {
    answer: { type: 'moreless', picks, right, total },
    timeMs,
    accepted: grade === 'correct',
    accuracy: total === 0 ? 0 : right / total,
    grade,
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
}

/**
 * Вибір гравця (команди) у порівнянні index, по черзі: етап, пауза, старт, гравець, ставки, тип, черга клітинки, запис, час;
 * index не поточне порівняння (подвійний натиск, пізня відповідь) — moreless_stale, стан той самий.
 * Після останнього порівняння — запис з остаточними балами й autoLock (на клітинці поля — revealNow).
 */
export function moreLessPick(state: GameState, playerId: string, index: number, pick: MoreLessSide, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const skipped = betsRefusal(state, playerId);
  if (skipped !== null) return fail(skipped);
  const play = rowPlay(state);
  if (play === null) return fail('type_mismatch');
  if (play.board !== undefined && play.board.chooserId !== playerId) return fail('not_your_turn');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || timeOverFor(state, play, playerId, now)) return fail('time_over');
  const progress = moreLessOf(state, playerId);
  if (index !== progress.picks.length || index >= play.question.pairs.length) return fail('moreless_stale');

  const row = play.moreless ?? { progress: {} };
  const picks = [...progress.picks, pick];
  const moved = withPlay(state, { ...play, moreless: { ...row, progress: { ...row.progress, [playerId]: { picks } } } });
  if (picks.length < play.question.pairs.length) return ok(moved);

  const current = moved.plays[moved.questionIndex] as RowPlay;
  const record = rowRecord(moved, current, picks, Math.max(0, now - state.startedAt));
  const done = withPlay(moved, { ...current, answers: { ...current.answers, [playerId]: record } });
  // На полі останній вибір закриває клітинку й одразу розкриває оцінку, як у сортуванні.
  return ok(play.board !== undefined ? revealNow(done) : autoLock(done, now));
}

/**
 * На етапі question: записи тим, хто вибирав і не пройшов ряд до кінця (без балів за решту); на клітинці поля той, хто вибрав
 * і мовчить, — запис з 0 (інакше unansweredIsWrong дав би мінус ціни клітинки). Лічильники правильних заморожуються в scored,
 * тож вилучення гравця після закриття таблицю не змінює. Інакше стан той самий. Швидкість, «частково», мінус раунду й бафи не діють.
 */
export function scoreMoreLess(state: GameState): GameState {
  const play = rowPlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const limitMs = limitMsOf(play) ?? 0;
  const answers = { ...play.answers };
  for (const [playerId, progress] of Object.entries(play.moreless?.progress ?? {})) {
    if (!state.players.some((p) => p.id === playerId) || Object.hasOwn(answers, playerId)) continue;
    answers[playerId] = rowRecord(state, play, progress.picks, limitMs);
  }
  const chooser = play.board?.chooserId;
  if (chooser !== undefined && state.players.some((p) => p.id === chooser) && !Object.hasOwn(answers, chooser)) {
    answers[chooser] = rowRecord(state, play, [], limitMs);
  }
  const row: MoreLessPlay = play.moreless ?? { progress: {} };
  return withPlay(state, { ...play, answers, moreless: { ...row, scored: { right: moreLessRight(state, play) } } });
}
