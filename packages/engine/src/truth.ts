import { isStorable, LIMITS, truthText, type TruthRound } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { currentRound, fail, ok, type GameState, type Result } from './game';
import { memberOf, teamsOn } from './teams';

// «Правда про гравця» (28b): у лобі кожна людина пише один факт про себе; на старті раунду гра робить з фактів запитання.

/** Поточний раунд, якщо це «Правда про гравця». */
export function truthRoundOf(state: GameState): TruthRound | null {
  const round = currentRound(state);
  return round?.type === 'truth' ? round : null;
}

/** Чи приймаються факти: є state.truth, колоду не роздано, гра не скінчилась. */
export function truthOpen(state: GameState): boolean {
  return state.truth !== undefined && state.truth.deck === undefined && state.phase !== 'finished';
}

/** Людина гри: соло — гравець, командна гра — учасник (зокрема без команди). */
function isPerson(state: GameState, personId: string): boolean {
  return teamsOn(state) ? memberOf(state, personId) !== undefined : state.players.some((p) => p.id === personId);
}

/** Факт людини: '' прибирає; новий текст скидає hidden. truth_closed / truth_text / not_found. */
export function submitTruth(state: GameState, personId: string, raw: string, now: number): Result {
  const truth = state.truth;
  if (truth === undefined || !truthOpen(state)) return fail('truth_closed');
  if (!isPerson(state, personId)) return fail('not_found');
  const text = truthText(raw);
  if (text.length > LIMITS.truthText || !isStorable(text)) return fail('truth_text');
  const old = Object.hasOwn(truth.facts, personId) ? truth.facts[personId] : undefined;
  if (text === '') {
    if (old === undefined) return ok(state);
    const { [personId]: _gone, ...facts } = truth.facts;
    return ok({ ...state, truth: { ...truth, facts } });
  }
  if (old?.text === text) return ok(state);
  // Новий текст ведучий ще не бачив: «сховано» знімається, сховати можна знову.
  return ok({ ...state, truth: { ...truth, facts: { ...truth.facts, [personId]: { text, hidden: false, at: now } } } });
}

/** Ведучий ховає чи показує факт, поки запитання про нього не відкрилося. truth_closed / not_found. */
export function hideTruth(state: GameState, personId: string, hidden: boolean): Result {
  const truth = state.truth;
  if (truth === undefined || state.phase === 'finished') return fail('truth_closed');
  const fact = Object.hasOwn(truth.facts, personId) ? truth.facts[personId] : undefined;
  if (fact === undefined) return fail('not_found');
  // Запитання про цей факт уже відкрито чи зіграно.
  if (state.plays.some((play) => play.truth?.authorId === personId)) return fail('truth_closed');
  if (fact.hidden === hidden) return ok(state);
  return ok({ ...state, truth: { ...truth, facts: { ...truth.facts, [personId]: { ...fact, hidden } } } });
}

/**
 * Вилучені люди до роздачі втрачають факт; після роздачі факт лишається, а автор просто не зіграється (nextQuestion).
 * Внутрішня функція рушія: для removeFromGame, dropMember і withoutTeam.
 */
export function dropTruthFacts<S extends GameState>(state: S, personIds: readonly string[]): S {
  const truth = state.truth;
  if (truth === undefined || truth.deck !== undefined || !personIds.some((id) => Object.hasOwn(truth.facts, id))) return state;
  const facts = Object.fromEntries(Object.entries(truth.facts).filter(([id]) => !personIds.includes(id)));
  return { ...state, truth: { ...truth, facts } };
}
