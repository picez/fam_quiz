import { rulesOf, type ErrorCode, type Question, type SortWordMark } from '@quiz/shared';
import { withPlay } from './blitz';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { autoLock, fail, lockNow, ok, recordOf, revealNow, withFinalPoints, type AnswerRecord, type GameState, type Play, type Result, type SortProgress } from './game';
import { finalPoints } from './score';
import { limitMsOf, timeOver } from './timing';
import { notStarted } from './splash';
import { teamsOn } from './teams';

type SortQuestion = Extract<Question, { type: 'sort' }>;
type SortPlay = Play & { question: SortQuestion };

/** Поточне запитання, якщо воно сортування. */
function sortPlay(state: GameState): SortPlay | null {
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'sort' ? (play as SortPlay) : null;
}

/** Поступ гравця; без ходів — { queue: state.presented, sorted: [], misses: 0, lockedUntil: null, missed: null }. */
export function sortOf(state: GameState, playerId: string): SortProgress {
  const progress = state.plays[state.questionIndex]?.sort;
  if (progress !== undefined && Object.hasOwn(progress, playerId)) return progress[playerId];
  return { queue: [...state.presented], sorted: [], misses: 0, lockedUntil: null, missed: null };
}

/** Чи відповідає гравець на це сортування: на звичайній клітинці поля — лише той, хто вибрав; інакше будь-який гравець. */
export function sortsHere(state: GameState, play: Play, playerId: string): boolean {
  if (!state.players.some((p) => p.id === playerId)) return false;
  return play.board === undefined || play.board.kind !== 'normal' || play.board.chooserId === playerId;
}

/** Бали за sortedCount слів за правилами раунду (× множник раунду, на полі ще × множник клітинки; ціна клітинки не діє). */
export function sortPoints(state: GameState, play: Play, sortedCount: number): number {
  const cell = play.board?.multiplier ?? 1;
  return Math.round(sortedCount * play.question.points * cell * rulesOf(state.quiz.rounds[play.roundIndex]).multiplier);
}

function withProgress(state: GameState, play: Play, playerId: string, progress: SortProgress): GameState {
  return withPlay(state, { ...play, sort: { ...play.sort, [playerId]: progress } });
}

/** Чи зіграно запитання в раунді фіналу. */
function isFinal(state: GameState, play: Play): boolean {
  return state.quiz.rounds[play.roundIndex]?.type === 'final';
}

/** Чи зіграно запитання в бліц-раунді: перемагає перший, хто відсортував усе. */
function isBlitz(state: GameState, play: Play): boolean {
  return state.quiz.rounds[play.roundIndex]?.type === 'blitz';
}

function wagerOf(play: Play, playerId: string): number {
  const wagers = play.final?.wagers;
  return wagers !== undefined && Object.hasOwn(wagers, playerId) ? wagers[playerId] : 0;
}

/**
 * Хід: слово wordId (має бути головою черги) — у категорію categoryId. Правильно — наступна картка;
 * неправильно — слово в кінець черги й підвисання на lockSeconds. Після останнього слова — запис «правильно».
 */
export function sortWord(state: GameState, playerId: string, wordId: string, categoryId: string, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const play = sortPlay(state);
  if (play === null) return fail('type_mismatch');
  if (!sortsHere(state, play, playerId)) return fail('not_your_turn');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || timeOver(state, play, now)) return fail('time_over');
  const progress = sortOf(state, playerId);
  if (progress.lockedUntil !== null && now < progress.lockedUntil) return fail('sort_locked');
  if (wordId !== progress.queue[0]) return fail('sort_stale');
  if (!play.question.categories.some((c) => c.id === categoryId)) return fail('not_found');

  const word = play.question.words.find((w) => w.id === wordId);
  const [, ...rest] = progress.queue;
  if (word?.categoryId !== categoryId) {
    const locked: SortProgress = {
      queue: [...rest, wordId],
      sorted: progress.sorted,
      misses: progress.misses + 1,
      lockedUntil: now + play.question.lockSeconds * 1000,
      missed: wordId,
      missedInto: categoryId,
      wordMisses: { ...progress.wordMisses, [wordId]: (progress.wordMisses?.[wordId] ?? 0) + 1 },
    };
    return ok(withProgress(state, play, playerId, locked));
  }
  const advanced = withProgress(state, play, playerId, {
    queue: rest,
    sorted: [...progress.sorted, wordId],
    misses: progress.misses,
    lockedUntil: null,
    missed: null,
    ...(progress.wordMisses === undefined ? {} : { wordMisses: progress.wordMisses }),
  });
  if (rest.length > 0) return ok(advanced);

  const total = play.question.words.length;
  const timeMs = Math.max(0, now - state.startedAt);
  const points = isFinal(state, play) ? finalPoints(wagerOf(play, playerId), true) : sortPoints(state, play, total);
  const record: AnswerRecord = {
    answer: { type: 'sort', sorted: total, total, misses: progress.misses, timeMs },
    timeMs,
    accepted: true,
    accuracy: 1,
    grade: 'correct',
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
  const current = advanced.plays[advanced.questionIndex];
  const done = withPlay(advanced, { ...current, answers: { ...current.answers, [playerId]: record } });
  // На полі останнє слово закриває клітинку й одразу розкриває оцінку, як «Прийняти».
  if (play.board !== undefined) return ok(revealNow(done));
  // У бліці перший, хто відсортував усе, — переможець: запитання закривається одразу.
  if (isBlitz(state, play)) return ok(lockNow(done));
  // У фіналі бали рахуються за типом ставок (спільний банк залежить від інших записів).
  return ok(autoLock(withFinalPoints(done), now));
}

/**
 * На етапі question: записи тим, хто ходив і не закінчив (у бліці — 0 балів, мінус раунду не діє);
 * на полі той, хто вибрав, отримує запис завжди, тож мінусу за мовчання немає. Інакше стан без змін.
 */
export function scoreSort(state: GameState): GameState {
  const play = sortPlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const limitMs = limitMsOf(play) ?? 0;
  const final = isFinal(state, play);
  const blitz = isBlitz(state, play);
  const total = play.question.words.length;
  const answers = { ...play.answers };
  const sorters = Object.keys(play.sort ?? {});
  const chooser = play.board?.chooserId;
  if (chooser !== undefined && state.players.some((p) => p.id === chooser) && !sorters.includes(chooser)) sorters.push(chooser);
  for (const playerId of sorters) {
    if (Object.hasOwn(answers, playerId)) continue;
    const progress = sortOf(state, playerId);
    const sorted = progress.sorted.length;
    const accuracy = final || blitz ? 0 : sorted / total;
    const points = final ? finalPoints(wagerOf(play, playerId), false) : blitz ? 0 : sortPoints(state, play, sorted);
    answers[playerId] = {
      answer: { type: 'sort', sorted, total, misses: progress.misses, timeMs: null },
      timeMs: limitMs,
      accepted: false,
      accuracy,
      grade: accuracy > 0 ? 'partial' : 'wrong',
      basePoints: points,
      streakBonus: 0,
      points,
      overridden: false,
    };
  }
  return withPlay(state, { ...play, answers });
}

/** Зсуває всі lockedUntil поточного сортування на shiftMs (після паузи). */
export function shiftSortLocks(state: GameState, shiftMs: number): GameState {
  const play = sortPlay(state);
  if (play?.sort === undefined || shiftMs === 0) return state;
  const sort = Object.fromEntries(
    Object.entries(play.sort).map(([id, p]) => [id, p.lockedUntil === null ? p : { ...p, lockedUntil: p.lockedUntil + shiftMs }]),
  );
  return withPlay(state, { ...play, sort });
}

/** Ходів зроблено: правильні + помилки (11d) — ключ польоту картки й свіжості нахилу. */
export function sortSeq(progress: SortProgress): number {
  return progress.sorted.length + progress.misses;
}

/** Останній хід для глядачів: помилка — у зону missedInto, інакше останнє розкладене слово; null — ходів немає або помилка без зони (стан до 11d). */
export function lastSortMove(question: SortQuestion, progress: SortProgress): { wordId: string; to: string; hit: boolean } | null {
  if (progress.missed !== null) {
    return progress.missedInto === undefined ? null : { wordId: progress.missed, to: progress.missedInto, hit: false };
  }
  const wordId = progress.sorted.at(-1);
  if (wordId === undefined) return null;
  return { wordId, to: question.words.find((w) => w.id === wordId)?.categoryId ?? '', hit: true };
}

/**
 * Позначки слів на розкритті в порядку слів запитання, лише зі «✗N» або «не встиг»; finished — запис accepted.
 * «✗N» — лише коли лічильник по словах повний (сума дорівнює misses); інакше (стан до 11d) — 0 у всіх.
 */
export function sortMarks(question: SortQuestion, progress: SortProgress, finished: boolean): SortWordMark[] {
  const counts = progress.wordMisses ?? {};
  const whole = Object.values(counts).reduce((sum, n) => sum + n, 0) === progress.misses;
  return question.words
    .map((w) => ({
      wordId: w.id,
      misses: whole ? (counts[w.id] ?? 0) : 0,
      late: !finished && progress.queue.includes(w.id),
    }))
    .filter((mark) => mark.misses > 0 || mark.late);
}

/** Де живий показ дозволено (11d): 'all' — звичайна клітинка поля; 'team' — командна гра поза нею; null — сортують усі одночасно. */
export function sortAudience(state: GameState, play: Play): 'all' | 'team' | null {
  if (play.board?.kind === 'normal') return 'all';
  return teamsOn(state) ? 'team' : null;
}

/**
 * Чи можна зараз слати нахил (11d): ті самі умови й порядок, що й у sortWord (categoryId null — «відпустив без ходу»),
 * а наприкінці — чи дозволено живий показ (sortAudience); null — можна.
 */
export function tiltRefusal(state: GameState, sorterId: string, wordId: string, categoryId: string | null, now: number): ErrorCode | null {
  if (state.phase !== 'question') return 'wrong_phase';
  if (state.paused) return 'paused';
  if (notStarted(state, now)) return 'not_started';
  if (!state.players.some((p) => p.id === sorterId)) return 'not_found';
  const play = sortPlay(state);
  if (play === null) return 'type_mismatch';
  if (!sortsHere(state, play, sorterId)) return 'not_your_turn';
  if (recordOf(state, state.questionIndex, sorterId) !== undefined) return 'already_answered';
  if (state.startedAt === null || timeOver(state, play, now)) return 'time_over';
  const progress = sortOf(state, sorterId);
  if (progress.lockedUntil !== null && now < progress.lockedUntil) return 'sort_locked';
  if (wordId !== progress.queue[0]) return 'sort_stale';
  if (categoryId !== null && !play.question.categories.some((c) => c.id === categoryId)) return 'not_found';
  if (sortAudience(state, play) === null) return 'wrong_phase';
  return null;
}
