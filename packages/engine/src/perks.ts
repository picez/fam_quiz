import {
  allSpares,
  allowedDebuffs,
  questionsOf,
  type ActivePerk,
  type LevelPerk,
  type PerkBlock,
  type PerkGrant,
  type PerksView,
  type Quiz,
} from '@quiz/shared';
// buffs.ts і debuffs.ts викликають цей файл, а цей — їх і game.ts; усі звертаються одне до одного лише під час виклику.
import { fail, ok, type GameState, type PerkState, type Play, type Result } from './game';
import { buffOf, buffsHere, hasAnswered, questionFor } from './buffs';
import { notStarted } from './splash';
import { teamsOn } from './teams';
import { grantOvertime, isTimed, overtimeOf, timedPlay, timeOverFor } from './timing';

/** Бонуси рівня, які гравець натискає (ряд на телефоні), у порядку ряду. */
const ACTIVE: readonly ActivePerk[] = ['time', 'hint'];

/** Чи діють бонуси рівня в цій грі: вимикач не false і гра не командна (рівень особистий, учасник — команда). */
export function perksOn(state: GameState): boolean {
  return state.quiz.settings.levelBonuses !== false && !teamsOn(state);
}

/** Чи механіка бонусу є у вікторині: time — запитання з таймером; hint — запитання з hint (разом із запасними); ward — дозволені дебафи. */
export function perkFits(quiz: Quiz, kind: LevelPerk): boolean {
  const questions = [...questionsOf(quiz), ...allSpares(quiz)];
  switch (kind) {
    case 'time':
      return questions.some(isTimed);
    case 'hint':
      return questions.some((q) => q.hint !== undefined);
    case 'ward':
      return allowedDebuffs(quiz).length > 0;
  }
}

/** Видача гравця; undefined — немає. */
function perkOf(state: GameState, playerId: string): PerkState | undefined {
  const perks = state.perks;
  return perks !== undefined && Object.hasOwn(perks, playerId) ? perks[playerId] : undefined;
}

/** Копія стану з оновленою видачею гравця. */
function withPerk(state: GameState, playerId: string, perk: PerkState): GameState {
  return { ...state, perks: { ...state.perks, [playerId]: perk } };
}

/**
 * Видати бонуси рівня. Лише для гравців стану без запису; поза lobby/finished; kinds фільтрує perkFits;
 * порожні kinds — без запису. perksOn false — стан без змін.
 */
export function grantPerks(state: GameState, grants: Record<string, PerkGrant>): GameState {
  if (!perksOn(state) || state.phase === 'lobby' || state.phase === 'finished') return state;
  let next = state;
  for (const [playerId, grant] of Object.entries(grants)) {
    if (!state.players.some((p) => p.id === playerId) || perkOf(next, playerId) !== undefined) continue;
    const kinds = grant.kinds.filter((kind, i) => grant.kinds.indexOf(kind) === i && perkFits(state.quiz, kind));
    if (kinds.length === 0) continue;
    next = withPerk(next, playerId, { kinds, timeMs: grant.timeMs, used: {} });
  }
  return next;
}

/** Поточне запитання, якщо етап question; інакше undefined. */
function openPlay(state: GameState): Play | undefined {
  return state.phase === 'question' ? state.plays[state.questionIndex] : undefined;
}

/** Чи бонус не пасує запитанню: time — без таймера; hint — без підказки автора або вже взято баф «Підказка». */
function unfit(state: GameState, play: Play, playerId: string, kind: ActivePerk): boolean {
  if (kind === 'time') return !timedPlay(play);
  return questionFor(state, play, playerId).hint === undefined || buffOf(play, playerId)?.kind === 'hint';
}

/**
 * Чому гравець не може натиснути бонус зараз; null — можна. Видачу не перевіряє.
 * Причини not_started і time видно лише з now (як у buffBlock).
 */
export function perkBlock(state: GameState, playerId: string, kind: ActivePerk, now?: number): PerkBlock | null {
  if (perkOf(state, playerId)?.used[kind] !== undefined) return 'used';
  const play = openPlay(state);
  if (play === undefined || !buffsHere(state, play, playerId)) return 'elsewhere';
  if (hasAnswered(state, play, playerId)) return 'answered';
  if (!state.paused && now !== undefined && notStarted(state, now)) return 'not_started';
  if (!state.paused && now !== undefined && timeOverFor(state, play, playerId, now)) return 'time';
  if (state.paused) return 'paused';
  return unfit(state, play, playerId, kind) ? 'unfit' : null;
}

/**
 * Натиснути бонус рівня на поточному запитанні. time — особистий час overtime + timeMs (додається до «Додаткового часу»);
 * hint — лише позначка used.hint (текст бере perksView). Помилки: not_found, not_allowed (немає видачі цього виду),
 * perk_used, wrong_phase, paused, not_started, already_answered, time_over, perk_unfit.
 */
export function usePerk(state: GameState, playerId: string, kind: ActivePerk, now: number): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const perk = perkOf(state, playerId);
  if (perk === undefined || !perk.kinds.includes(kind)) return fail('not_allowed');
  if (perk.used[kind] !== undefined) return fail('perk_used');
  const play = openPlay(state);
  if (play === undefined || !buffsHere(state, play, playerId)) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (hasAnswered(state, play, playerId)) return fail('already_answered');
  if (timeOverFor(state, play, playerId, now)) return fail('time_over');
  if (unfit(state, play, playerId, kind)) return fail('perk_unfit');
  const used = withPerk(state, playerId, { ...perk, used: { ...perk.used, [kind]: state.questionIndex } });
  return ok(kind === 'time' ? grantOvertime(used, playerId, overtimeOf(play, playerId) + perk.timeMs) : used);
}

/** «+5 с» узято на поточному запитанні: тоді баф часу додається до вже наданого особистого часу, а не замінює його. */
export function perkTimeHere(state: GameState, playerId: string): boolean {
  return perkOf(state, playerId)?.used.time === state.questionIndex;
}

/** Підказка рівня на поточному запитанні: баф «Підказка» на ньому вже не пасує. */
export function perkHintHere(state: GameState, playerId: string): boolean {
  return perkOf(state, playerId)?.used.hint === state.questionIndex;
}

/** Готовий оберіг: видано й ще не спрацював. */
export function wardReady(state: GameState, playerId: string): boolean {
  const perk = perkOf(state, playerId);
  return perk !== undefined && perk.kinds.includes('ward') && perk.used.ward === undefined;
}

/** Оберіг спрацював: used.ward — поточне запитання. Без готового оберегу — стан без змін. */
export function spendWard(state: GameState, playerId: string): GameState {
  const perk = perkOf(state, playerId);
  if (perk === undefined || !wardReady(state, playerId)) return state;
  return withPerk(state, playerId, { ...perk, used: { ...perk.used, ward: state.questionIndex } });
}

/** Ряд бонусів рівня на телефоні; null — немає видачі або в ній лише оберіг. */
export function perksView(state: GameState, playerId: string, now?: number): PerksView | null {
  const perk = perkOf(state, playerId);
  if (perk === undefined) return null;
  const items = ACTIVE.filter((kind) => perk.kinds.includes(kind)).map((kind) => ({ kind, block: perkBlock(state, playerId, kind, now) }));
  if (items.length === 0) return null;
  const play = state.plays[state.questionIndex];
  const shown = play !== undefined && state.phase !== 'finished' && perk.used.hint === state.questionIndex;
  return { items, timeMs: perk.timeMs, hint: shown ? (questionFor(state, play, playerId).hint ?? null) : null };
}

/** Обереги гравців стану: готовий чи спрацював; undefined — жодного оберегу. */
export function wardsView(state: GameState): Record<string, 'ready' | 'spent'> | undefined {
  const wards: Record<string, 'ready' | 'spent'> = {};
  for (const p of state.players) {
    const perk = perkOf(state, p.id);
    if (perk?.kinds.includes('ward')) wards[p.id] = perk.used.ward === undefined ? 'ready' : 'spent';
  }
  return Object.keys(wards).length === 0 ? undefined : wards;
}
