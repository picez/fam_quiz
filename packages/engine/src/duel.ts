import { LIMITS, duelCutoff, duelThreshold, type DuelQuestion, type Phase, type Quiz } from '@quiz/shared';
import { adjustScore } from './adjust';
import { textMatches } from './check';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { fail, next, ok, type DuelQuestionPlay, type DuelState, type GameState, type Result, type Rng } from './game';

/** Етапи гри, на яких можна оголосити дуель. */
const DECLARE_PHASES: Phase[] = ['intro', 'board', 'question', 'locked', 'reveal', 'leaderboard', 'round_end'];

/** Етапи, з яких оголошена дуель стартує замість звичайного кроку. */
const START_PHASES: Phase[] = ['intro', 'reveal', 'leaderboard', 'round_end'];

// Поріг і межа живуть у shared: редактор перевіряє ту саму умову, що й гра.
export { duelCutoff, duelThreshold };

/** Скільки запитань не-фінальних раундів уже закрито. */
export function duelPlayed(state: GameState): number {
  // Відкрите запитання завжди останнє в журналі.
  const closed = state.phase === 'question' ? state.plays.length - 1 : state.plays.length;
  return state.plays.slice(0, closed).filter((play) => state.quiz.rounds[play.roundIndex]?.type !== 'final').length;
}

/** Чи можна зараз оголосити дуель за етапом, межею й порогом (без перевірок гравця й зайнятості). */
export function duelWindowOpen(state: GameState): boolean {
  const threshold = duelThreshold(state.quiz);
  if (threshold === null || !DECLARE_PHASES.includes(state.phase)) return false;
  return state.roundIndex >= 0 && state.roundIndex < duelCutoff(state.quiz) && duelPlayed(state) >= threshold;
}

/** Невикористані запитання категорії в авторському порядку; невідома категорія — []. */
function unusedOf(state: GameState, categoryId: string): DuelQuestion[] {
  const category = state.quiz.duels?.categories.find((c) => c.id === categoryId);
  return category === undefined ? [] : category.questions.filter((q) => !state.duelUsed.includes(q.id));
}

/** Категорії пулу в авторському порядку зі скількома невикористаними запитаннями; [] без duels. */
export function duelCategoriesLeft(state: GameState): { id: string; title: string; left: number }[] {
  return (state.quiz.duels?.categories ?? []).map((c) => ({ id: c.id, title: c.title, left: unusedOf(state, c.id).length }));
}

/** Поточне запитання дуелі (етапи question, answer); інакше null. */
export function duelQuestionOf(state: GameState): DuelQuestion | null {
  const duel = state.duel;
  if (state.phase !== 'duel' || duel === null || (duel.stage !== 'question' && duel.stage !== 'answer')) return null;
  const id = duel.questions.at(-1)?.questionId;
  for (const category of state.quiz.duels?.categories ?? []) {
    const found = category.questions.find((q) => q.id === id);
    if (found !== undefined) return found;
  }
  return null;
}

/** Гравець оголошує дуель суперникові; суперник не може відмовитися. */
export function declareDuel(state: GameState, challengerId: string, opponentId: string): Result {
  if (state.quiz.duels === undefined) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  const known = (id: string) => state.players.some((p) => p.id === id);
  if (!known(challengerId) || !known(opponentId) || challengerId === opponentId) return fail('not_found');
  if (state.duelsDeclared.includes(challengerId)) return fail('duel_used');
  if (state.duel !== null) return fail('duel_busy');
  if (!duelWindowOpen(state)) return fail('wrong_phase');
  if (duelCategoriesLeft(state).every((c) => c.left === 0)) return fail('duel_empty');
  const duel: DuelState = {
    challengerId,
    opponentId,
    stage: 'declared',
    returnPhase: null,
    categoryId: null,
    total: 0,
    questions: [],
    winnerId: null,
  };
  return ok({ ...state, duel, duelsDeclared: [...state.duelsDeclared, challengerId] });
}

/** Ведучий: прибирає оголошену або поточну дуель (dropDuel); немає дуелі → not_found. */
export function cancelDuel(state: GameState): Result {
  if (state.duel === null) return fail('not_found');
  return ok(dropDuel(state));
}

/** Поточна дуель на етапі гри duel; інакше null. */
function runningDuel(state: GameState): DuelState | null {
  return state.phase === 'duel' ? state.duel : null;
}

/** Відкриває випадкове невикористане запитання категорії дуелі зі свіжим таймером; порожня категорія — null. */
function openDuelQuestion(state: GameState, duel: DuelState, now: number, rng: Rng): GameState | null {
  const pool = unusedOf(state, duel.categoryId ?? '');
  const duels = state.quiz.duels;
  if (pool.length === 0 || duels === undefined) return null;
  const question = pool[Math.floor(rng() * pool.length)];
  const play: DuelQuestionPlay = { questionId: question.id, tries: {}, winnerId: null, answer: null, timeMs: null };
  return {
    ...state,
    duel: { ...duel, stage: 'question', questions: [...duel.questions, play] },
    duelUsed: [...state.duelUsed, question.id],
    startedAt: now,
    endsAt: now + duels.timeLimit * 1000,
    remainingMs: null,
  };
}

/** playerId null — ведучий за гравця. */
export function pickDuelCategory(state: GameState, playerId: string | null, categoryId: string, now: number, rng: Rng): Result {
  const duel = runningDuel(state);
  if (duel === null || duel.stage !== 'category') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (playerId !== null && playerId !== duel.challengerId) return fail('not_your_turn');
  const left = duelCategoriesLeft(state).find((c) => c.id === categoryId);
  if (left === undefined) return fail('not_found');
  if (left.left === 0) return fail('duel_empty');
  const total = Math.min(state.quiz.duels?.questionsPerDuel ?? 0, left.left);
  const opened = openDuelQuestion(state, { ...duel, categoryId, total }, now, rng);
  return opened === null ? fail('duel_empty') : ok(opened);
}

/** Замінює останнє запитання дуелі. */
function withLastQuestion(duel: DuelState, play: DuelQuestionPlay): DuelState {
  return { ...duel, questions: [...duel.questions.slice(0, -1), play] };
}

/** Відповідь дуелянта: неправильна йде в його спроби, перша правильна виграє запитання. */
export function answerDuel(state: GameState, playerId: string, text: string, now: number): Result {
  const duel = runningDuel(state);
  const play = duel?.questions.at(-1);
  if (duel === null || duel.stage !== 'question' || play === undefined) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (playerId !== duel.challengerId && playerId !== duel.opponentId) return fail('not_your_turn');
  if (state.endsAt === null || now > state.endsAt) return fail('time_over');
  const tries = Object.hasOwn(play.tries, playerId) ? play.tries[playerId] : [];
  if (tries.length >= LIMITS.maxDuelTries) return fail('no_attempts');
  const question = duelQuestionOf(state);
  if (question === null || !textMatches(question.accepted, text)) {
    return ok({ ...state, duel: withLastQuestion(duel, { ...play, tries: { ...play.tries, [playerId]: [...tries, text] } }) });
  }
  const won: DuelQuestionPlay = { ...play, winnerId: playerId, answer: text, timeMs: Math.max(0, now - (state.startedAt ?? now)) };
  return ok({ ...state, duel: { ...withLastQuestion(duel, won), stage: 'answer' }, startedAt: null, endsAt: null, remainingMs: null });
}

/** Скільки запитань дуелі виграв кожен дуелянт. */
function winsOf(duel: DuelState): { challenger: number; opponent: number } {
  const count = (id: string) => duel.questions.filter((q) => q.winnerId === id).length;
  return { challenger: count(duel.challengerId), opponent: count(duel.opponentId) };
}

/** Підсумок: більше виграних — переможець, нічия — без змін; ставка — два коригування 'duel' (переможець першим). */
function settleDuel(state: GameState, duel: DuelState, now: number): GameState {
  const wins = winsOf(duel);
  const winnerId = wins.challenger > wins.opponent ? duel.challengerId : wins.opponent > wins.challenger ? duel.opponentId : null;
  const settled: GameState = { ...state, duel: { ...duel, stage: 'result', winnerId }, startedAt: null, endsAt: null, remainingMs: null };
  const stake = state.quiz.duels?.stake ?? 0;
  if (winnerId === null || stake === 0) return settled;
  const loserId = winnerId === duel.challengerId ? duel.opponentId : duel.challengerId;
  const gained = adjustScore(settled, winnerId, stake, now, 'duel');
  const after = gained.ok ? gained.state : settled;
  const lost = adjustScore(after, loserId, -stake, now, 'duel');
  return lost.ok ? lost.state : after;
}

/** Ведучий пропускає запитання дуелі: воно не рахується, одразу береться інше з тієї самої категорії. */
export function skipDuelQuestion(state: GameState, now: number, rng: Rng): Result {
  const duel = runningDuel(state);
  if (duel === null || duel.stage !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  const without: DuelState = { ...duel, questions: duel.questions.slice(0, -1) };
  return ok(openDuelQuestion(state, without, now, rng) ?? settleDuel(state, without, now));
}

/** Чи веде наступне «Далі» з етапу answer до підсумку. */
export function duelEnds(state: GameState): boolean {
  const duel = runningDuel(state);
  if (duel === null || duel.stage !== 'answer') return false;
  const played = duel.questions.length;
  const wins = winsOf(duel);
  const remaining = duel.total - played;
  return played >= duel.total || Math.abs(wins.challenger - wins.opponent) > remaining || unusedOf(state, duel.categoryId ?? '').length === 0;
}

// Далі — внутрішні функції рушія: експортовано для game.ts, не для сервера.

/** Оголошена дуель стартує на цьому next: етап intro, reveal, leaderboard або round_end і roundIndex < duelCutoff. */
export function duelDue(state: GameState): boolean {
  return state.duel?.stage === 'declared' && START_PHASES.includes(state.phase) && state.roundIndex < duelCutoff(state.quiz);
}

/** phase 'duel', stage 'category', returnPhase = поточний етап, годинник порожній. */
export function beginDuel(state: GameState): GameState {
  if (state.duel === null) return state;
  return {
    ...state,
    phase: 'duel',
    duel: { ...state.duel, stage: 'category', returnPhase: state.phase },
    startedAt: null,
    endsAt: null,
    remainingMs: null,
  };
}

/** next на етапі duel: answer → наступне запитання або підсумок; result → повернення; інакше wrong_phase. */
export function advanceDuel(state: GameState, now: number, rng: Rng): Result {
  const duel = runningDuel(state);
  if (duel === null) return fail('wrong_phase');
  if (duel.stage === 'answer') {
    if (duelEnds(state)) return ok(settleDuel(state, duel, now));
    return ok(openDuelQuestion(state, duel, now, rng) ?? settleDuel(state, duel, now));
  }
  if (duel.stage === 'result') {
    // Гра робить той самий крок, який зробила б без дуелі; якщо його не можна зробити (кубики), лишається на місці.
    const back = dropDuel(state);
    const moved = next(back, now, rng);
    return moved.ok ? moved : ok(back);
  }
  return fail('wrong_phase');
}

/** tick на етапі duel: час запитання сплив → answer без переможця. */
export function tickDuel(state: GameState, now: number): GameState {
  const duel = runningDuel(state);
  if (duel === null || duel.stage !== 'question' || state.endsAt === null || now < state.endsAt) return state;
  return { ...state, duel: { ...duel, stage: 'answer' }, startedAt: null, endsAt: null, remainingMs: null };
}

/** Прибирає дуель; на етапі duel повертає returnPhase з порожнім годинником (startedAt, endsAt, remainingMs — null). */
export function dropDuel(state: GameState): GameState {
  if (state.phase !== 'duel') return { ...state, duel: null };
  return { ...state, phase: state.duel?.returnPhase ?? 'reveal', duel: null, startedAt: null, endsAt: null, remainingMs: null };
}
