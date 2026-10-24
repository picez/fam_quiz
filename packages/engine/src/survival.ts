import { survivorsAfter, type Answer } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; звертання лише під час виклику функцій.
import { autoLock, currentRound, fail, ok, recordOf, withCurrentPlay, type GameState, type Play, type Result, type Rng, type SurvivalPlay } from './game';
import { addAdjustment, afterQuestionNow } from './adjust';
import { verdictOf } from './check';
import { timeOver } from './timing';

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
  // задача 3: випробування (openTrial з now і rng); поки — сторінка без таймера.
  void now;
  void rng;
  return fixed;
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
