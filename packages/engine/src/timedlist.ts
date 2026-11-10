import { rulesOf, type ErrorCode, type Question, type TimedListItem } from '@quiz/shared';
import { withPlay } from './blitz';
import { shareVerdict, textAccepts, textMatches } from './check';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { autoLock, recordOf, revealNow, type AnswerRecord, type GameState, type Play, type TimedListProgress } from './game';
import { normalizeText } from './normalize';
import { listShare } from './score';
import { notStarted } from './splash';
import { limitMsOf, timeOverFor } from './timing';

// «Список на час» (27c): гравець (команда) шукає пункти схованого списку; бали за пункт — за рідкісністю серед тих, хто грав.

const UNTOUCHED: TimedListProgress = { found: [], wrong: 0 };

type ListPlay = Play & { question: Extract<Question, { type: 'timedlist' }> };

/** Поточне запитання, якщо воно список. */
function listPlay(state: GameState): ListPlay | null {
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'timedlist' ? (play as ListPlay) : null;
}

export type ListHit = { kind: 'found'; id: string } | { kind: 'repeat'; id: string } | { kind: 'miss' };

const spellings = (item: TimedListItem) => [item.text, ...item.accepted];

/**
 * Чим є слово: спершу точний збіг з будь-яким написанням (за порядком пунктів), потім описка серед незнайдених пунктів
 * (found), потім описка серед знайдених (repeat); інакше miss. Порожнє після normalizeText слово — miss.
 */
export function listHit(items: readonly TimedListItem[], found: readonly string[], value: string): ListHit {
  if (normalizeText(value) === '') return { kind: 'miss' };
  const hit = (item: TimedListItem): ListHit => (found.includes(item.id) ? { kind: 'repeat', id: item.id } : { kind: 'found', id: item.id });
  const exact = items.find((item) => textMatches(spellings(item), value));
  if (exact !== undefined) return hit(exact);
  // Описка, ближча до вже знайденого пункту, не забирає незнайдений: незнайдені перевіряються першими.
  const fresh = items.find((item) => !found.includes(item.id) && textAccepts(spellings(item), value));
  if (fresh !== undefined) return { kind: 'found', id: fresh.id };
  const again = items.find((item) => found.includes(item.id) && textAccepts(spellings(item), value));
  return again !== undefined ? { kind: 'repeat', id: again.id } : { kind: 'miss' };
}

/** Знахідки гравця (команди) на поточному запитанні; без запису — { found: [], wrong: 0 }. */
export function timedListOf(state: GameState, playerId: string): TimedListProgress {
  const progress = state.plays[state.questionIndex]?.timedlist?.progress;
  return progress !== undefined && Object.hasOwn(progress, playerId) ? progress[playerId] : UNTOUCHED;
}

/** Гравці, що грали запитання (N): present ∪ ключі progress серед state.players, у порядку гравців. */
export function listPlayers(state: GameState, play: Play): string[] {
  const list = play.timedlist;
  if (list === undefined) return [];
  const ids = new Set([...list.present, ...Object.keys(list.progress)]);
  return state.players.filter((p) => ids.has(p.id)).map((p) => p.id);
}

/** Множник ціни: раунду × позначка клітинки поля (ціна клітинки не діє, як у сортуванні). */
function multiplierOf(state: GameState, play: Play): number {
  return rulesOf(state.quiz.rounds[play.roundIndex]).multiplier * (play.board?.multiplier ?? 1);
}

/** Бали за кожен пункт для кожного знахідника за поточним станом (для зрізу reveal і для scoreTimedList); ключ — id пункту. */
export function listItemPoints(state: GameState, play: Play): Record<string, { finders: string[]; points: number }> {
  if (play.question.type !== 'timedlist') return {};
  const players = listPlayers(state, play);
  const progress = play.timedlist?.progress ?? {};
  const unit = play.question.points * multiplierOf(state, play);
  return Object.fromEntries(
    play.question.items.map((item) => {
      const finders = players.filter((id) => Object.hasOwn(progress, id) && progress[id].found.includes(item.id));
      const points = finders.length === 0 ? 0 : Math.round(unit * listShare(players.length, finders.length));
      return [item.id, { finders, points }];
    }),
  );
}

export type ListResult = { ok: true; state: GameState; hit: ListHit['kind'] } | { ok: false; error: ErrorCode };

const refuse = (error: ErrorCode): ListResult => ({ ok: false, error });

/** Знахідки гравця на запитанні. */
function withProgress(state: GameState, play: ListPlay, playerId: string, progress: TimedListProgress): GameState {
  const list = play.timedlist ?? { present: [], progress: {} };
  return withPlay(state, { ...play, timedlist: { ...list, progress: { ...list.progress, [playerId]: progress } } });
}

/** Запис списку; бали ставить scoreTimedList. */
function listRecord(play: ListPlay, progress: TimedListProgress, points: number, timeMs: number): AnswerRecord {
  const total = play.question.items.length;
  const { accepted, accuracy, grade } = shareVerdict(total === 0 ? 0 : progress.found.length / total);
  return {
    answer: { type: 'timedlist', found: progress.found, total, wrong: progress.wrong },
    timeMs,
    accepted,
    accuracy,
    grade,
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
}

/**
 * Слово гравця (команди). found — пункт у знахідки; знайдено все — запис одразу (бали 0 до закриття) і autoLock
 * (на клітинці поля — revealNow). repeat — стан той самий. miss — wrong + 1 лише з Enter, з мінусом і непорожнім словом, інакше стан той самий.
 */
export function listEntry(state: GameState, playerId: string, word: string, enter: boolean, now: number): ListResult {
  if (state.phase !== 'question') return refuse('wrong_phase');
  if (state.paused) return refuse('paused');
  if (notStarted(state, now)) return refuse('not_started');
  if (!state.players.some((p) => p.id === playerId)) return refuse('not_found');
  const play = listPlay(state);
  if (play === null) return refuse('type_mismatch');
  if (play.board !== undefined && play.board.chooserId !== playerId) return refuse('not_your_turn');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return refuse('already_answered');
  if (state.startedAt === null || timeOverFor(state, play, playerId, now)) return refuse('time_over');

  const progress = timedListOf(state, playerId);
  const hit = listHit(play.question.items, progress.found, word);
  if (hit.kind === 'repeat') return { ok: true, state, hit: 'repeat' };
  if (hit.kind === 'miss') {
    const costs = enter && play.question.minus !== null && normalizeText(word) !== '';
    return { ok: true, state: costs ? withProgress(state, play, playerId, { ...progress, wrong: progress.wrong + 1 }) : state, hit: 'miss' };
  }
  const next: TimedListProgress = { ...progress, found: [...progress.found, hit.id] };
  const moved = withProgress(state, play, playerId, next);
  if (next.found.length < play.question.items.length) return { ok: true, state: moved, hit: 'found' };

  const current = moved.plays[moved.questionIndex] as ListPlay;
  const record = listRecord(current, next, 0, Math.max(0, now - state.startedAt));
  const done = withPlay(moved, { ...current, answers: { ...current.answers, [playerId]: record } });
  return { ok: true, state: play.board !== undefined ? revealNow(done) : autoLock(done, now), hit: 'found' };
}

/**
 * На етапі question: бали за рідкісністю кожного знайденого пункту мінус промахи з Enter; записи тим, хто має знахідки чи промахи
 * (наявні записи тих, хто знайшов усе, отримують справжні бали). Інакше стан той самий. Швидкість, «частково», мінус-штраф раунду й бафи не діють.
 */
export function scoreTimedList(state: GameState): GameState {
  const play = listPlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const byItem = listItemPoints(state, play);
  const multiplier = multiplierOf(state, play);
  const minus = play.question.minus === null ? 0 : Math.round(play.question.minus * multiplier);
  const limitMs = limitMsOf(play) ?? 0;
  const answers = { ...play.answers };
  for (const [playerId, progress] of Object.entries(play.timedlist?.progress ?? {})) {
    if (!state.players.some((p) => p.id === playerId)) continue;
    const found = progress.found.reduce((sum, id) => sum + (byItem[id]?.finders.includes(playerId) ? byItem[id].points : 0), 0);
    const points = found - progress.wrong * minus;
    const timeMs = Object.hasOwn(answers, playerId) ? answers[playerId].timeMs : limitMs;
    answers[playerId] = listRecord(play, progress, points, timeMs);
  }
  return withPlay(state, { ...play, answers });
}
