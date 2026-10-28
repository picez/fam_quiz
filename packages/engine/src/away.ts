// Антигугл (12e): годинник виходів людей із гри. Цей файл views.ts не імпортує; game.ts цей файл не імпортує (без циклу).
import { AWAY_MS, AWAY_PENALTY_ROUNDS, isUnscored, type Phase } from '@quiz/shared';
import { addAdjustment, afterQuestionNow } from './adjust';
import { recordOf, type AwayEntry, type GameState } from './game';
import { hostLive } from './live';
import { memberOf, teamMembers, teamsOn } from './teams';

/** Учасник рушія людини (12e): соло — сам гравець; командна гра — команда людини; null — немає такої людини чи команди. */
export function awayParticipant(state: GameState, personId: string): string | null {
  if (teamsOn(state)) return memberOf(state, personId)?.teamId ?? null;
  return state.players.some((p) => p.id === personId) ? personId : null;
}

/** Люди під наглядом у стані: один прохід hostLive на стан. */
const trackedCache = new WeakMap<GameState, ReadonlySet<string>>();

function trackedPeople(state: GameState): ReadonlySet<string> {
  const cached = trackedCache.get(state);
  if (cached !== undefined) return cached;
  const people = new Set<string>();
  const play = state.plays[state.questionIndex];
  const live = state.phase === 'question' && play !== undefined && play.roundIndex === state.roundIndex ? hostLive(state) : null;
  // Лише рядки, що мають відповідати (answers / blitz); привиди й зал (aside), випробування й дуель — ні.
  if (live !== null && (live.kind === 'answers' || live.kind === 'blitz')) {
    for (const row of live.rows) {
      if (row.answered) continue;
      // Рядок команди — її люди на зв'язку; рядок людини (опитування, хмара) чи соло-гравця — сам id, якщо на зв'язку.
      if (teamsOn(state) && memberOf(state, row.id) === undefined) {
        for (const m of teamMembers(state, row.id)) if (m.connected) people.add(m.id);
      } else if (row.connected) {
        people.add(row.id);
      }
    }
  }
  trackedCache.set(state, people);
  return people;
}

/** Людина під наглядом: етап question поточного раунду, на зв'язку, її рядок «Відповідей наживо» (answers / blitz) ще без відповіді. */
export function awayTracked(state: GameState, personId: string): boolean {
  return trackedPeople(state).has(personId);
}

/** Запис людини в запитанні index; змінений запис — новий стан. */
function withEntry(state: GameState, index: number, personId: string, entry: AwayEntry): GameState {
  const play = state.plays[index];
  const plays = [...state.plays];
  plays[index] = { ...play, away: { ...play.away, [personId]: entry } };
  return { ...state, plays };
}

/** Закриває відкритий інтервал людини в запитанні index (на паузі — до pausedAt); скільки мс додано — added. */
function closeEntry(state: GameState, index: number, personId: string, now: number): { state: GameState; added: number } {
  const entry = state.plays[index]?.away?.[personId];
  if (entry === undefined || entry.since === null) return { state, added: 0 };
  const end = state.paused ? (state.pausedAt ?? now) : now;
  // Заставка безкоштовна: на запитанні, що йде, відлік — не раніше справжнього старту.
  const running = index === state.questionIndex && state.phase === 'question' && !state.paused && state.startedAt !== null;
  const from = running ? Math.max(entry.since, state.startedAt ?? entry.since) : entry.since;
  const added = Math.max(0, end - from);
  const closed: AwayEntry = { ms: entry.ms + added, count: entry.count + (added >= 1 ? 1 : 0), since: null };
  return { state: withEntry(state, index, personId, closed), added };
}

/** Людина пішла: відкриває інтервал (since — не раніше startedAt; на паузі — pausedAt). Не під наглядом чи вже поза грою — той самий об'єкт. */
export function awayStart(state: GameState, personId: string, now: number): GameState {
  if (!awayTracked(state, personId)) return state;
  const index = state.questionIndex;
  const entry = state.plays[index].away?.[personId];
  if (entry !== undefined && entry.since !== null) return state;
  const at = state.paused ? (state.pausedAt ?? now) : now;
  const since = Math.max(at, state.startedAt ?? at);
  return withEntry(state, index, personId, { ms: entry?.ms ?? 0, count: entry?.count ?? 0, since });
}

/** Людина повернулася: закриває інтервал (на паузі — до pausedAt) і додає gapMs, якщо людина під наглядом (не більше now − startedAt). Без змін — той самий об'єкт. */
export function awayEnd(state: GameState, personId: string, now: number, gapMs = 0): GameState {
  const index = state.questionIndex;
  const tracked = gapMs > 0 && awayTracked(state, personId);
  const closed = closeEntry(state, index, personId, now);
  if (!tracked) return closed.state;
  const end = state.paused ? (state.pausedAt ?? now) : now;
  const cap = state.startedAt === null ? 0 : Math.max(0, end - state.startedAt);
  const gap = Math.min(gapMs, cap);
  if (gap <= 0) return closed.state;
  const entry = closed.state.plays[index].away?.[personId] ?? { ms: 0, count: 0, since: null };
  // Розрив — частина того самого виходу: окремо рахується, лише якщо інтервалу (≥ 1 мс) не було.
  return withEntry(closed.state, index, personId, { ...entry, ms: entry.ms + gap, count: entry.count + (closed.added >= 1 ? 0 : 1) });
}

/**
 * Годинник виходів між кроками (12e), викликає RoomManager.commit до stamp:
 * 1) закриває інтервали запитання prev, чиї люди в next уже не під наглядом (подали відповідь, закрито, розрив, вилучення);
 * 2) відкриває інтервали людям із hidden, які в next щойно стали під наглядом;
 * 3) дописує штрафи, бали яких стали остаточними (penaltyDue).
 * Без змін — той самий об'єкт next.
 */
export function awayStep(prev: GameState, next: GameState, at: number, hidden: ReadonlySet<string>): GameState {
  let s = next;
  // 1) Відкриті інтервали запитання prev (і поточного запитання next, якщо інше).
  for (const index of new Set([prev.questionIndex, next.questionIndex])) {
    const away = next.plays[index]?.away;
    if (away === undefined) continue;
    for (const [personId, entry] of Object.entries(away)) {
      if (entry.since === null) continue;
      const watched = index === next.questionIndex && awayTracked(next, personId);
      if (!watched) s = closeEntry(s, index, personId, at).state;
    }
  }
  // 2) Приховані телефони, що щойно стали під наглядом (awayStart без змін, якщо інтервал уже відкритий чи нагляду немає).
  for (const personId of hidden) s = awayStart(s, personId, at);
  // 3) Штрафи запитання prev, бали якого щойно стали остаточними.
  const q = penaltyDue(prev, next);
  return q === null ? s : withPenalties(s, q, at);
}

/** Чи діє штраф на запитанні plays[q]: awayPenalty, раунд з AWAY_PENALTY_ROUNDS, запитання з балами. */
export function awayPenaltyOn(state: GameState, q: number): boolean {
  if (state.quiz.settings.awayPenalty !== true) return false;
  const play = state.plays[q];
  const round = play === undefined ? undefined : state.quiz.rounds[play.roundIndex];
  return round !== undefined && AWAY_PENALTY_ROUNDS.includes(round.type) && !isUnscored(play.question);
}

/** Учасники, яких штраф зачепить на plays[q]: будь-яка людина учасника має ms ≥ AWAY_MS.penalty. Порядок — state.players. */
export function awayPenalized(state: GameState, q: number): string[] {
  if (!awayPenaltyOn(state, q)) return [];
  const hit = new Set<string>();
  for (const [personId, entry] of Object.entries(state.plays[q].away ?? {})) {
    if (entry.ms < AWAY_MS.penalty) continue;
    const participant = awayParticipant(state, personId);
    if (participant !== null) hit.add(participant);
  }
  return state.players.filter((p) => hit.has(p.id)).map((p) => p.id);
}

const OPEN_PHASES: readonly Phase[] = ['question', 'locked', 'reveal'];

/** Запитання q ще «відкрите» (question, locked, reveal; у дуелі — етап, куди гра повернеться). */
function openOn(state: GameState, q: number): boolean {
  const phase = state.phase === 'duel' ? state.duel?.returnPhase : state.phase;
  return state.questionIndex === q && phase !== undefined && phase !== null && OPEN_PHASES.includes(phase);
}

/** Запитання prev, бали якого стали остаточними на кроці prev → next: бліц — на закритті, решта — на виході з розкриття; інакше null. */
function penaltyDue(prev: GameState, next: GameState): number | null {
  const q = prev.questionIndex;
  const play = prev.plays[q];
  if (play === undefined) return null;
  if (play.blitz !== undefined) return prev.phase === 'question' && (next.phase !== 'question' || next.questionIndex !== q) ? q : null;
  return openOn(prev, q) && !openOn(next, q) ? q : null;
}

/** Штрафи 'away' за запитання q: −бали запису (лише додатні), раз на учасника; лише коли q — останнє закрите запитання. */
function withPenalties(state: GameState, q: number, at: number): GameState {
  // Захист від невідомого переходу: штраф стоїть під своїм запитанням (afterQuestion − 1 === q).
  if (afterQuestionNow(state) - 1 !== q) return state;
  const { roundIndex } = state.plays[q];
  let s = state;
  for (const participant of awayPenalized(state, q)) {
    const points = recordOf(s, q, participant)?.points ?? 0;
    if (points <= 0) continue;
    // Раз на учасника: скасований ведучим штраф не повертається.
    if (s.adjustments.some((a) => a.source === 'away' && a.playerId === participant && a.afterQuestion - 1 === q)) continue;
    s = addAdjustment(s, participant, -points, at, 'away', { roundIndex });
  }
  return s;
}
