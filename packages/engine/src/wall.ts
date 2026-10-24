import { rulesOf, wallShare, type Question } from '@quiz/shared';
import { withPlay } from './blitz';
import { boardPoints } from './board-turns';
import { shareVerdict } from './check';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import {
  autoLock,
  fail,
  ok,
  recordOf,
  revealNow,
  shuffle,
  type AnswerRecord,
  type GameState,
  type Play,
  type Result,
  type Rng,
  type WallProgress,
} from './game';
import { answerPoints } from './score';
import { notStarted } from './splash';
import { limitMsOf, timeOver } from './timing';

type WallQuestion = Extract<Question, { type: 'wall' }>;
type WallPlay = Play & { question: WallQuestion };

/** Скільки разів перемішати плитки, перш ніж узяти «по одній з кожної групи». */
const SHUFFLE_TRIES = 20;

/** Поточне запитання, якщо воно стіна. */
function wallPlay(state: GameState): WallPlay | null {
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'wall' ? (play as WallPlay) : null;
}

/** Чи якийсь ряд показу (позиції k·n … k·n + n − 1) складається з плиток однієї групи. */
function groupedRow(question: WallQuestion, order: string[]): boolean {
  const n = question.groups.length;
  for (let row = 0; row * n < order.length; row += 1) {
    const ids = new Set(order.slice(row * n, row * n + n));
    if (question.groups.some((g) => g.tiles.every((t) => ids.has(t.id)))) return true;
  }
  return false;
}

/** Порядок показу плиток (id): перемішано rng; жоден ряд з n плиток не є групою (20 спроб, далі — по одній з кожної групи). */
export function wallPresent(question: WallQuestion, rng: Rng): string[] {
  let mixed = shuffle(
    question.groups.flatMap((g) => g.tiles.map((t) => t.id)),
    rng,
  );
  for (let tries = 0; groupedRow(question, mixed) && tries < SHUFFLE_TRIES; tries += 1) mixed = shuffle(mixed, rng);
  if (!groupedRow(question, mixed)) return mixed;
  // Кожен ряд — по плитці з усіх груп, і групи зсунуті з рядка в рядок, тож ні ряд, ні стовпець не є групою.
  const n = question.groups.length;
  return Array.from({ length: n }, (_, t) => question.groups.map((_g, j) => question.groups[(j + t) % n].tiles[t].id)).flat();
}

/** Поступ гравця; без ходів — { found: [], mistakes: 0, tried: [] }. */
export function wallOf(state: GameState, playerId: string): WallProgress {
  const progress = state.plays[state.questionIndex]?.wall;
  if (progress !== undefined && Object.hasOwn(progress, playerId)) return progress[playerId];
  return { found: [], mistakes: 0, tried: [] };
}

/** Чи гравець складає цю стіну: на клітинці поля — лише той, хто вибрав; інакше будь-який гравець. */
export function wallsHere(state: GameState, play: Play, playerId: string): boolean {
  if (!state.players.some((p) => p.id === playerId)) return false;
  return play.board === undefined || play.board.kind !== 'normal' || play.board.chooserId === playerId;
}

/** Чи гравець закінчив: є запис (склав, замкнув або закрито запитання). */
export function wallDone(state: GameState, playerId: string): boolean {
  return recordOf(state, state.questionIndex, playerId) !== undefined;
}

/** Бали за found груп: класика — answerPoints, поле — boardPoints; accuracy = wallShare. */
export function wallPoints(state: GameState, play: Play, found: number): number {
  const groups = play.question.type === 'wall' ? play.question.groups.length : 0;
  const share = wallShare(found, groups);
  const round = state.quiz.rounds[play.roundIndex];
  if (play.board !== undefined && round.type === 'board') return boardPoints(round, play.board, share);
  const rules = rulesOf(round);
  // Спадання вже вбудоване (остання група без балів), тож бонусу швидкості немає, як у сортуванні.
  return answerPoints({ points: play.question.points, accuracy: share, speed: 1, multiplier: rules.multiplier, penalty: rules.penalty });
}

/** Запис стіни: частка ціни й вердикт за shareVerdict (половина ціни — «правильно»). */
function wallRecord(play: WallPlay, progress: WallProgress, points: number, timeMs: number, answerTimeMs: number | null): AnswerRecord {
  const groups = play.question.groups.length;
  const { accepted, accuracy, grade } = shareVerdict(wallShare(progress.found.length, groups));
  return {
    answer: { type: 'wall', found: progress.found.length, groups, mistakes: progress.mistakes, timeMs: answerTimeMs },
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

/** Чи позиції — рівно n різних цілих у межах показу. */
function validPick(positions: number[], n: number, shown: number): boolean {
  return (
    positions.length === n &&
    new Set(positions).size === n &&
    positions.every((p) => Number.isInteger(p) && p >= 0 && p < shown)
  );
}

/**
 * Хід: positions — позиції в state.presented. Правильно — група в found (на n − 1 — і остання);
 * неправильно — помилка (повтор — wall_repeat); на ліміті помилок або після останньої групи — запис.
 */
export function guessWall(state: GameState, playerId: string, positions: number[], now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const play = wallPlay(state);
  if (play === null) return fail('type_mismatch');
  if (!wallsHere(state, play, playerId)) return fail('not_your_turn');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || timeOver(state, play, now)) return fail('time_over');

  const { groups, mistakes: maxMistakes } = play.question;
  const n = groups.length;
  const progress = wallOf(state, playerId);
  if (!validPick(positions, n, state.presented.length)) return fail('wall_pick');
  const picked = positions.map((p) => state.presented[p]);
  const taken = new Set(groups.filter((g) => progress.found.includes(g.id)).flatMap((g) => g.tiles.map((t) => t.id)));
  if (picked.some((id) => taken.has(id))) return fail('wall_pick');

  const chosen = new Set(picked);
  const group = groups.find((g) => g.tiles.every((t) => chosen.has(t.id)));
  let next: WallProgress;
  if (group !== undefined) {
    const found = [...progress.found, group.id];
    // Коли лишилася одна група, вона складається сама.
    if (found.length === n - 1) found.push(...groups.filter((g) => !found.includes(g.id)).map((g) => g.id));
    next = { ...progress, found };
  } else {
    const key = [...picked].sort().join(',');
    if (progress.tried.includes(key)) return fail('wall_repeat');
    next = { ...progress, mistakes: progress.mistakes + 1, tried: [...progress.tried, key] };
  }
  const moved = withPlay(state, { ...play, wall: { ...play.wall, [playerId]: next } });
  if (next.found.length < n && next.mistakes < maxMistakes) return ok(moved);

  const timeMs = Math.max(0, now - state.startedAt);
  const record = wallRecord(play, next, wallPoints(state, play, next.found.length), timeMs, timeMs);
  const current = moved.plays[moved.questionIndex];
  const done = withPlay(moved, { ...current, answers: { ...current.answers, [playerId]: record } });
  // На полі кінець стіни закриває клітинку й одразу розкриває оцінку, як «Прийняти».
  if (play.board !== undefined) return ok(revealNow(done));
  return ok(autoLock(done, now));
}

/** На етапі question: записи тим, хто ходив і не закінчив; на полі той, хто вибрав, отримує запис завжди. */
export function scoreWall(state: GameState): GameState {
  const play = wallPlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const limitMs = limitMsOf(play) ?? 0;
  const answers = { ...play.answers };
  const progress = play.wall ?? {};
  const players = Object.keys(progress);
  const chooser = play.board?.chooserId;
  if (chooser !== undefined && state.players.some((p) => p.id === chooser) && !players.includes(chooser)) players.push(chooser);
  for (const playerId of players) {
    if (Object.hasOwn(answers, playerId)) continue;
    const tried = Object.hasOwn(progress, playerId);
    const own = tried ? progress[playerId] : { found: [], mistakes: 0, tried: [] };
    // Хто вибрав клітинку й не торкався стіни, отримує 0 без мінуса: мінус лише за спробу без жодної групи.
    const points = tried ? wallPoints(state, play, own.found.length) : 0;
    answers[playerId] = wallRecord(play, own, points, limitMs, null);
  }
  return withPlay(state, { ...play, answers });
}
