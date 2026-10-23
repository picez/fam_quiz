import { allowedBuffs, rulesOf, type BuffBlock, type BuffKind, type Question, type RetryStage } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { fail, ok, recordOf, withCurrentPlay, type AnswerRecord, type GameState, type Play, type Result, type Rng } from './game';
import { isTimed, timeOver } from './timing';

/** Баф гравця на одному запитанні. */
export interface BuffPlay {
  kind: BuffKind;
  /** Мить, коли баф узято (час сервера). */
  at: number;
  /** fifty: прибрані неправильні варіанти; інакше []. */
  removed: string[];
  /** retry: стадія; null для інших бафів. */
  retry: RetryStage | null;
  /** retry: перша відповідь (неправильна або часткова), поки друга не зарахована; інакше null. */
  first: AnswerRecord | null;
}

/** Типи запитань, на які діє друга спроба. */
const RETRY_TYPES: Question['type'][] = ['single', 'multi', 'boolean', 'text', 'numeric'];

/** Баф гравця на запитанні; null — немає. */
export function buffOf(play: Play | undefined, playerId: string): BuffPlay | null {
  const buffs = play?.buffs;
  return buffs !== undefined && Object.hasOwn(buffs, playerId) ? buffs[playerId] : null;
}

/** Бафи, які гравець уже використав у грі, у порядку журналу. */
export function buffsUsed(state: GameState, playerId: string): BuffKind[] {
  return state.plays.flatMap((play) => buffOf(play, playerId)?.kind ?? []);
}

/** Скільки варіантів прибирає 50/50; 0 — не діє (unfit_options або не той тип). */
export function fiftyCount(question: Question): number {
  if (question.type === 'single') {
    const n = question.options.length;
    // З двох варіантів прибраний неправильний просто показав би відповідь.
    return n >= 3 ? n - Math.ceil(n / 2) : 0;
  }
  if (question.type === 'multi') {
    const wrong = question.options.filter((o) => !question.correctIds.includes(o.id)).length;
    return wrong >= 2 ? Math.max(1, Math.floor(wrong / 2)) : 0;
  }
  return 0;
}

/** Неправильні варіанти запитання в авторському порядку. */
function wrongOptions(question: Question): string[] {
  if (question.type === 'single') return question.options.filter((o) => o.id !== question.correctId).map((o) => o.id);
  if (question.type === 'multi') return question.options.filter((o) => !question.correctIds.includes(o.id)).map((o) => o.id);
  return [];
}

/** Чи гравець відповідає на поточне запитання з телефона: elsewhere — тут бафів немає; not_chooser — на полі відповідає інший; null — так. */
function placeBlock(state: GameState, play: Play, playerId: string): 'elsewhere' | 'not_chooser' | null {
  const round = state.quiz.rounds[play.roundIndex];
  // Бліц, фінал, а ще ланцюжок і сортування, що рахуються окремо.
  if (play.blitz !== undefined || round.type === 'blitz' || round.type === 'final') return 'elsewhere';
  if (play.question.type === 'chain' || play.question.type === 'sort') return 'elsewhere';
  const board = play.board;
  if (round.type === 'board') {
    if (board === undefined || board.kind !== 'normal' || board.answerMode !== 'phone') return 'elsewhere';
    if (board.chooserId !== playerId) return 'not_chooser';
  }
  return null;
}

/** Відповідь гравця вже надіслана або чекає на ведучого. */
function hasAnswered(state: GameState, play: Play, playerId: string): boolean {
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return true;
  return play.board !== undefined && play.board.chooserId === playerId && play.board.answer !== null;
}

/** Чи баф пасує запитанню; null — так. */
function fitBlock(state: GameState, play: Play, kind: BuffKind): BuffBlock | null {
  const round = state.quiz.rounds[play.roundIndex];
  const { question } = play;
  switch (kind) {
    case 'fifty':
      if (question.type !== 'single' && question.type !== 'multi') return 'unfit_type';
      return fiftyCount(question) === 0 ? 'unfit_options' : null;
    case 'retry':
      if (!RETRY_TYPES.includes(question.type)) return 'unfit_type';
      return round.type === 'board' && round.check === 'manual' ? 'unfit_manual' : null;
    case 'time':
      return isTimed(question) ? null : 'unfit_timer';
    case 'shield':
      return rulesOf(round).penalty === 'none' ? 'unfit_penalty' : null;
    default:
      return null;
  }
}

/**
 * Чому гравець не може взяти цей баф зараз; null — можна. Дозвіл вікторини не перевіряє.
 * Причину time видно лише з now (зрізи без часу її не показують — сплив час рахує телефон).
 */
export function buffBlock(state: GameState, playerId: string, kind: BuffKind, now?: number): BuffBlock | null {
  if (buffsUsed(state, playerId).includes(kind)) return 'used';
  const play = state.phase === 'question' ? state.plays[state.questionIndex] : undefined;
  if (play === undefined) return 'elsewhere';
  if (buffOf(play, playerId) !== null) return 'taken';
  if (hasAnswered(state, play, playerId)) return 'answered';
  if (!state.paused && now !== undefined && timeOver(state, play, now)) return 'time';
  if (state.paused) return 'paused';
  return placeBlock(state, play, playerId) ?? fitBlock(state, play, kind);
}

/** Узяти баф на поточне запитання. fifty тягне rng; time лише записується (сам час — пізніше). */
export function takeBuff(state: GameState, playerId: string, kind: BuffKind, now: number, rng: Rng): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (!allowedBuffs(state.quiz).includes(kind)) return fail('not_allowed');
  if (buffsUsed(state, playerId).includes(kind)) return fail('buff_used');
  const play = state.phase === 'question' ? state.plays[state.questionIndex] : undefined;
  if (play === undefined) return fail('wrong_phase');
  const place = placeBlock(state, play, playerId);
  if (place === 'elsewhere') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (place === 'not_chooser') return fail('not_your_turn');
  if (hasAnswered(state, play, playerId)) return fail('already_answered');
  if (timeOver(state, play, now)) return fail('time_over');
  if (buffOf(play, playerId) !== null) return fail('buff_busy');
  if (fitBlock(state, play, kind) !== null) return fail('buff_unfit');
  const buff: BuffPlay = {
    kind,
    at: now,
    removed: kind === 'fifty' ? pickRemoved(play.question, rng) : [],
    retry: kind === 'retry' ? 'armed' : null,
    first: null,
  };
  return ok(withCurrentPlay(state, { ...play, buffs: { ...play.buffs, [playerId]: buff } }));
}

/** 50/50: fiftyCount разів випадковий неправильний варіант з тих, що лишилися. */
function pickRemoved(question: Question, rng: Rng): string[] {
  const pool = wrongOptions(question);
  const removed: string[] = [];
  for (let i = fiftyCount(question); i > 0; i -= 1) removed.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  return removed;
}

/** Для withRecord: подвійні (+ ×2) і щит (− → 0), позначка buff. Вхід — запис без бафу. */
export function applyBuff(record: AnswerRecord, buff: BuffPlay | null): AnswerRecord {
  const { buff: _stale, ...raw } = record;
  if (buff === null) return raw;
  const doubled = buff.kind === 'double' && raw.basePoints > 0;
  const shielded = buff.kind === 'shield' && raw.basePoints < 0;
  const basePoints = doubled ? raw.basePoints * 2 : shielded ? 0 : raw.basePoints;
  return { ...raw, basePoints, points: basePoints + raw.streakBonus, buff: buff.kind };
}
