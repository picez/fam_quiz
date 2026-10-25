import { DOOR_COUNT, LIMITS, survivorsAfter, type Answer, type Grade, type Question } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; звертання лише під час виклику функцій.
import {
  autoLock,
  currentRound,
  fail,
  ok,
  present,
  recordOf,
  withCurrentPlay,
  type GameState,
  type Play,
  type Result,
  type Rng,
  type SurvivalPlay,
  type SurvivalTrial,
} from './game';
import { addAdjustment, afterQuestionNow } from './adjust';
import { verdictOf } from './check';
import { presentPlayers } from './present';
import { notStarted, withSplash } from './splash';
import { timeOver } from './timing';

/** Скільки триває вибір дверей в удачі. */
export const SURVIVAL_LUCK_MS = LIMITS.survivalLuckSeconds * 1000;

/** Чи поточний раунд — «Вибування». */
export function inSurvivalRound(state: GameState): boolean {
  return currentRound(state)?.type === 'survival';
}

/** Поточне запитання «Вибування» з його SurvivalPlay; інакше null. */
export function survivalPlayOf(state: GameState): (Play & { survival: SurvivalPlay }) | null {
  const play = state.plays[state.questionIndex];
  if (play?.survival === undefined || play.roundIndex !== state.roundIndex) return null;
  return { ...play, survival: play.survival };
}

/** Вибулі раунду roundIndex за першими upTo записами журналу (типово — усі), у порядку вибування: out закритих випробувань. */
export function survivalOut(state: GameState, roundIndex: number = state.roundIndex, upTo: number = state.plays.length): string[] {
  const out: string[] = [];
  for (const play of state.plays.slice(0, upTo)) {
    const trial = play.survival?.trial;
    if (play.roundIndex !== roundIndex || trial === null || trial === undefined || trial.stage !== 'closed') continue;
    for (const id of trial.out) if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Живі зараз у поточному раунді «Вибування» (у порядку гравців); поза раундом — []. */
export function survivalAlive(state: GameState): string[] {
  if (!inSurvivalRound(state)) return [];
  return survivorsAfter(
    state.players.map((p) => p.id),
    [survivalOut(state)],
  );
}

/** Живі на початку поточного запитання: випробування після нього ще не рахується. */
function aliveBefore(state: GameState): string[] {
  if (!inSurvivalRound(state)) return [];
  return survivorsAfter(
    state.players.map((p) => p.id),
    [survivalOut(state, state.roundIndex, state.questionIndex)],
  );
}

/** Привид: поточний раунд «Вибування», гравець є й не живий. */
export function isGhost(state: GameState, playerId: string): boolean {
  return inSurvivalRound(state) && state.players.some((p) => p.id === playerId) && !survivalAlive(state).includes(playerId);
}

/**
 * Відповідь привида «для себе»: already_answered (уже є в ghosts), time_over, type_mismatch.
 * Запис у Play.survival.ghosts (correct — verdictOf(...).grade === 'correct'); answers не змінюється; autoLock(now) — привиди його не тримають.
 */
export function submitGhostAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  const play = survivalPlayOf(state);
  if (play === null) return fail('wrong_phase');
  if (Object.hasOwn(play.survival.ghosts, playerId)) return fail('already_answered');
  if (state.startedAt === null || timeOver(state, play, now)) return fail('time_over');
  if (play.question.type !== answer.type) return fail('type_mismatch');
  const timeMs = Math.max(0, now - state.startedAt);
  const correct = verdictOf(play.question, answer, timeMs).grade === 'correct';
  const ghosts = { ...play.survival.ghosts, [playerId]: { answer, correct, timeMs } };
  return ok(autoLock(withCurrentPlay(state, { ...play, survival: { ...play.survival, ghosts } }), now));
}

/** «На межі» зараз: живі без запису поточного запитання або з grade ≠ 'correct' (наживо — оцінка ведучого змінює). */
export function edgeNow(state: GameState): string[] {
  if (survivalPlayOf(state) === null) return [];
  return aliveBefore(state).filter((id) => recordOf(state, state.questionIndex, id)?.grade !== 'correct');
}

/**
 * «Далі» після розкриття: фіксує edge; порожній — етап leaderboard без таймера (усі вціліли);
 * усі живі — leaderboard без таймера (ніхто не вибуває); інакше — випробування.
 */
export function openTrialOrBoard(state: GameState, now: number, rng: Rng): GameState {
  const board: GameState = { ...state, phase: 'leaderboard', startedAt: null, endsAt: null, remainingMs: null };
  const play = survivalPlayOf(state);
  if (play === null) return board;
  const edge = edgeNow(state);
  const fixed = withCurrentPlay(board, { ...play, survival: { ...play.survival, edge, trial: null } });
  if (edge.length === 0 || edge.length === aliveBefore(state).length) return fixed;
  return openTrial(fixed, edge, now, rng);
}

/** Питання на виживання, уже взяті випробуваннями поточного раунду. */
function usedTrialIds(state: GameState): string[] {
  return state.plays.flatMap((play) => {
    const id = play.roundIndex === state.roundIndex ? (play.survival?.trial?.questionId ?? null) : null;
    return id === null ? [] : [id];
  });
}

/** Перше невикористане питання на виживання поточного раунду (за порядком round.trials); null — скінчилися. */
export function unusedTrial(state: GameState): Question | null {
  const round = currentRound(state);
  if (round?.type !== 'survival') return null;
  const used = usedTrialIds(state);
  return round.trials.find((q) => !used.includes(q.id)) ?? null;
}

/** Питання випробування поточного запитання; null — удача чи випробування немає. */
export function trialQuestionOf(state: GameState): Question | null {
  const round = currentRound(state);
  const id = survivalPlayOf(state)?.survival.trial?.questionId ?? null;
  if (round?.type !== 'survival' || id === null) return null;
  return round.trials.find((q) => q.id === id) ?? null;
}

/** Поточне запитання «Вибування» з випробуванням; інакше null. */
function trialPlayOf(state: GameState): { play: Play & { survival: SurvivalPlay }; trial: SurvivalTrial } | null {
  const play = survivalPlayOf(state);
  const trial = play?.survival.trial ?? null;
  return play === null || trial === null ? null : { play, trial };
}

/** Випробування відкрите: етап leaderboard у «Вибуванні», trial.stage 'open' (з таймером або на паузі з remainingMs). */
export function trialOpen(state: GameState): boolean {
  return state.phase === 'leaderboard' && inSurvivalRound(state) && trialPlayOf(state)?.trial.stage === 'open';
}

/** Пастка чи запасні двері з rng: 0…DOOR_COUNT − 1. */
function drawDoor(rng: Rng): number {
  return Math.min(DOOR_COUNT - 1, Math.floor(rng() * DOOR_COUNT));
}

/**
 * Відкриває випробування для edge: вид — round.trial, або 'luck' з fellBack, якщо питань не лишилося.
 * Питання: presented — перемішані rng лише за round.shuffleOptions і типу single. Удача: для кожного з edge у порядку гравців —
 * traps[id] = min(2, ⌊rng()·3⌋), потім fallback[id] так само (рівно два виклики rng на гравця, інших немає).
 * Етап leaderboard, заставка 'trial' (withSplash), startedAt = кінець заставки (або now), endsAt = startedAt + ліміт.
 */
export function openTrial(state: GameState, edge: string[], now: number, rng: Rng): GameState {
  const round = currentRound(state);
  const play = survivalPlayOf(state);
  if (round?.type !== 'survival' || play === null) return state;
  const question = round.trial === 'question' ? unusedTrial(state) : null;
  const traps: Record<string, number> = {};
  const fallback: Record<string, number> = {};
  if (question === null) {
    for (const id of state.players.map((p) => p.id).filter((id) => edge.includes(id))) {
      traps[id] = drawDoor(rng);
      fallback[id] = drawDoor(rng);
    }
  }
  const trial: SurvivalTrial = {
    kind: question === null ? 'luck' : 'question',
    fellBack: round.trial === 'question' && question === null,
    stage: 'open',
    questionId: question?.id ?? null,
    // present перемішує лише single (і лише з прапорцем); boolean, число, текст і повзунок варіантів не мають.
    presented: question === null ? [] : present(question, round.shuffleOptions && question.type === 'single', rng),
    answers: {},
    traps,
    doors: {},
    fallback,
    out: [],
  };
  const splashed = withSplash({ ...state, phase: 'leaderboard', remainingMs: null }, 'trial', now);
  const startedAt = splashed.splash?.until ?? now;
  const limitMs = question === null ? SURVIVAL_LUCK_MS : question.timeLimit * 1000;
  return withTrial({ ...splashed, startedAt, endsAt: startedAt + limitMs }, { ...play, survival: { ...play.survival, edge } }, trial);
}

/** Записує випробування в поточне запитання. */
function withTrial(state: GameState, play: Play & { survival: SurvivalPlay }, trial: SurvivalTrial): GameState {
  return withCurrentPlay(state, { ...play, survival: { ...play.survival, trial } });
}

/** Спільні перевірки відповіді й вибору дверей після wrong_phase; null — можна. */
function trialRefusal(state: GameState, trial: SurvivalTrial, edge: string[], playerId: string, now: number): Result | null {
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (!edge.includes(playerId)) return fail('not_allowed');
  if (Object.hasOwn(trial.answers, playerId) || Object.hasOwn(trial.doors, playerId)) return fail('already_answered');
  // З endsAt включно, як tick: з цієї миті випробування закривається.
  if (state.endsAt !== null && now >= state.endsAt) return fail('time_over');
  return null;
}

/**
 * Відповідь на питання на виживання. Помилки: wrong_phase (не відкрите чи удача), paused, not_started (заставка), not_found,
 * not_allowed (не на межі), already_answered, time_over (now ≥ endsAt), type_mismatch. Потім settleTrial.
 */
export function answerTrial(state: GameState, playerId: string, answer: Answer, now: number): Result {
  const found = trialPlayOf(state);
  const question = trialQuestionOf(state);
  if (found === null || question === null || !trialOpen(state)) return fail('wrong_phase');
  const { play, trial } = found;
  const refusal = trialRefusal(state, trial, play.survival.edge ?? [], playerId, now);
  if (refusal !== null) return refusal;
  if (question.type !== answer.type) return fail('type_mismatch');
  const timeMs = Math.max(0, now - (state.startedAt ?? now));
  const correct = verdictOf(question, answer, timeMs).grade === 'correct';
  const answers = { ...trial.answers, [playerId]: { answer, correct, timeMs, overridden: false } };
  return ok(settleTrial(withTrial(state, play, { ...trial, answers })));
}

/** Вибір дверей (0…DOOR_COUNT − 1). Помилки — як answerTrial, без type_mismatch; wrong_phase — і для питання; двері поза 0…2 — not_found. Потім settleTrial. */
export function pickDoor(state: GameState, playerId: string, door: number, now: number): Result {
  const found = trialPlayOf(state);
  if (found === null || found.trial.kind !== 'luck' || !trialOpen(state)) return fail('wrong_phase');
  const { play, trial } = found;
  const refusal = trialRefusal(state, trial, play.survival.edge ?? [], playerId, now);
  if (refusal !== null) return refusal;
  if (!Number.isInteger(door) || door < 0 || door >= DOOR_COUNT) return fail('not_found');
  return ok(settleTrial(withTrial(state, play, { ...trial, doors: { ...trial.doors, [playerId]: door } })));
}

/** Хто вибуває: питання — «на межі» без правильної відповіді; удача — «на межі», чиї двері (свої чи запасні) = пастка. */
function outOf(state: GameState, trial: SurvivalTrial, edge: string[]): string[] {
  const out =
    trial.kind === 'question'
      ? edge.filter((id) => trial.answers[id]?.correct !== true)
      : edge.filter((id) => (trial.doors[id] ?? trial.fallback[id]) === trial.traps[id]);
  // Захист «помилилися всі»: випробування не вибиває всіх живих (так буває, коли ведучий вилучив гравців не на межі).
  const alive = aliveBefore(state);
  return alive.length > 0 && alive.every((id) => out.includes(id)) ? [] : out;
}

/**
 * Закриває випробування: stage 'closed', out (питання — без правильної відповіді; удача — doors ?? fallback === traps),
 * startedAt/endsAt/remainingMs null. Не відкрите — стан без змін.
 */
export function closeTrial(state: GameState): GameState {
  const found = trialPlayOf(state);
  if (found === null || !trialOpen(state)) return state;
  const { play, trial } = found;
  // Заставка випробування, що ще грала (ведучий закрив рано), зникає разом із ним.
  const splash = state.splash?.kind === 'trial' ? null : state.splash;
  const cleared: GameState = { ...state, startedAt: null, endsAt: null, remainingMs: null, splash };
  return withTrial(cleared, play, { ...trial, stage: 'closed', out: outOf(state, trial, play.survival.edge ?? []) });
}

/** Закриває відкрите випробування, якщо всі присутні на межі вже відповіли / вибрали; на паузі й без присутніх — ні. */
export function settleTrial(state: GameState): GameState {
  const found = trialPlayOf(state);
  if (found === null || state.paused || !trialOpen(state)) return state;
  const { play, trial } = found;
  const present = new Set(presentPlayers(state).map((p) => p.id));
  const waiting = (play.survival.edge ?? []).filter((id) => present.has(id));
  if (waiting.length === 0) return state;
  const done = trial.kind === 'question' ? trial.answers : trial.doors;
  return waiting.every((id) => Object.hasOwn(done, id)) ? closeTrial(state) : state;
}

/**
 * Оцінка ведучого питання на виживання після закриття (той самий етап leaderboard): correct / wrong → перерахунок out;
 * partial → partial_disabled; удача → wrong_phase; немає відповіді → not_found.
 */
export function overrideTrial(state: GameState, playerId: string, grade: Grade): Result {
  const found = trialPlayOf(state);
  if (state.phase !== 'leaderboard' || found === null || found.trial.stage !== 'closed' || found.trial.kind !== 'question') return fail('wrong_phase');
  if (grade === 'partial') return fail('partial_disabled');
  const { play, trial } = found;
  const existing = trial.answers[playerId];
  if (existing === undefined) return fail('not_found');
  const graded: SurvivalTrial = { ...trial, answers: { ...trial.answers, [playerId]: { ...existing, correct: grade === 'correct', overridden: true } } };
  return ok(withTrial(state, play, { ...graded, out: outOf(state, graded, play.survival.edge ?? []) }));
}

/** Вердикт за переліком «на межі» серед живих на початку запитання. */
function verdictFrom(edge: string[], alive: string[]): 'trial' | 'all_wrong' | 'all_right' {
  if (edge.length === 0) return 'all_right';
  return alive.every((id) => edge.includes(id)) ? 'all_wrong' : 'trial';
}

/** Вердикт поточного запитання після розкриття: trial / all_wrong / all_right; до розкриття — null. */
export function survivalVerdict(state: GameState): 'trial' | 'all_wrong' | 'all_right' | null {
  const play = survivalPlayOf(state);
  if (play === null || state.phase === 'question' || state.phase === 'locked') return null;
  // На розкритті — наживо (оцінка ведучого змінює), далі — зафіксований на «Далі» перелік.
  if (state.phase === 'reveal') return verdictFrom(edgeNow(state), aliveBefore(state));
  if (play.survival.edge === null) return null;
  return verdictFrom(play.survival.edge, aliveBefore(state));
}

/** Раунд закінчено: живих ≤ round.survivors і в цьому раунді хтось уже вибув. */
export function survivalOver(state: GameState): boolean {
  const round = currentRound(state);
  if (round?.type !== 'survival') return false;
  return survivalOut(state).length > 0 && survivalAlive(state).length <= round.survivors;
}

/**
 * Кінець раунду «Вибування»: end: true на останньому зіграному запитанні; кожному живому — коригування source 'survival' на bonus
 * (addAdjustment). Ідемпотентно: якщо коригування survival цього раунду вже є — без нових. Поза раундом — стан без змін.
 */
export function awardSurvivalBonus(state: GameState, now: number): GameState {
  const round = currentRound(state);
  if (round?.type !== 'survival') return state;
  // Останнє закрите запитання раунду: відкрите (етап question) ще не зігране.
  let index = afterQuestionNow(state) - 1;
  while (index >= 0 && state.plays[index].roundIndex !== state.roundIndex) index -= 1;
  const play = state.plays[index];
  const survival = play?.survival;
  if (survival === undefined) return state;
  const ended: Play = { ...play, survival: { ...survival, end: true } };
  const marked: GameState = survival.end ? state : { ...state, plays: state.plays.map((p, i) => (i === index ? ended : p)) };
  const paid = state.adjustments.some((a) => a.source === 'survival' && a.roundIndex === state.roundIndex);
  if (round.bonus === 0 || paid) return marked;
  return survivalAlive(marked).reduce((s, id) => addAdjustment(s, id, round.bonus, now, 'survival'), marked);
}
