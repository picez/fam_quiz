// Антигугл (12e): годинник виходів людей із гри. Цей файл views.ts не імпортує; game.ts цей файл не імпортує (без циклу).
// live.ts імпортує цей файл, а цей — hostLive: цикл лише між функціями (на верхньому рівні жоден не викликає іншого).
import { AWAY_MS, AWAY_PENALTY_ROUNDS, isUnscored, undoLedger, type AwayMark, type OwnAway, type Phase } from '@quiz/shared';
import { addAdjustment, afterQuestionNow } from './adjust';
import { recordOf, type AwayEntry, type GameState } from './game';
import { limitMsOf } from './timing';
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
      // Друга спроба (again / choice): перша відповідь у рядку є, але людина ще відповідає.
      const retry = play?.buffs?.[row.id]?.retry;
      if (row.answered && retry !== 'again' && retry !== 'choice') continue;
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
  // Заставку відсікає since (awayStart), паузу — зсув since у resumeClock; startedAt тут ні до чого (блеф і утримання його рухають).
  const added = Math.max(0, end - entry.since);
  const closed: AwayEntry = { ms: entry.ms + added, count: entry.count + (added >= 1 ? 1 : 0), since: null };
  return { state: withEntry(state, index, personId, closed), added };
}

/** Кінець заставки перед запитанням (question / cell), що ще йде на мить at; інакше at. Пауза зсуває заставку й since разом. */
function splashEnd(state: GameState, at: number): number {
  const splash = state.splash;
  return splash !== null && (splash.kind === 'question' || splash.kind === 'cell') && splash.until > at ? splash.until : at;
}

/**
 * Відкриває інтервал людини, яка вже під наглядом (перевіряє той, хто кличе); вже поза грою — той самий об'єкт.
 * grace — телефон сховано ще до справжнього старту запитання (лежав заблокований): since = старт + AWAY_MS.preGrace,
 * тож повернення в ці 5 с не рахується зовсім (закриття дає 0 мс і count не росте).
 */
function openEntry(state: GameState, personId: string, now: number, grace = false): GameState {
  const index = state.questionIndex;
  const entry = state.plays[index].away?.[personId];
  if (entry !== undefined && entry.since !== null) return state;
  const at = state.paused ? (state.pausedAt ?? now) : now;
  const since = splashEnd(state, at) + (grace ? AWAY_MS.preGrace : 0);
  return withEntry(state, index, personId, { ms: entry?.ms ?? 0, count: entry?.count ?? 0, since });
}

/**
 * Людина пішла: відкриває інтервал (since — не раніше кінця заставки; на паузі — pausedAt). Вихід під час заставки —
 * ще до справжнього старту, тож з пільгою AWAY_MS.preGrace. Не під наглядом чи вже поза грою — той самий об'єкт.
 */
export function awayStart(state: GameState, personId: string, now: number): GameState {
  if (!awayTracked(state, personId)) return state;
  const at = state.paused ? (state.pausedAt ?? now) : now;
  return openEntry(state, personId, now, splashEnd(state, at) > at);
}

/**
 * Скільки йде відповідь на поточне запитання на мить end — межа розриву в awayEnd. На паузі з таймером startedAt немає:
 * ліміт мінус залишок (залишок заставки не включає). Межа наближена: вибір блефу й утримання рухають startedAt уперед, тож вона менша за справжню.
 */
function answeringMs(state: GameState, end: number): number {
  const play = state.plays[state.questionIndex];
  if (state.paused && state.startedAt === null && state.remainingMs !== null && play !== undefined) {
    return Math.max(0, (limitMsOf(play) ?? 0) - state.remainingMs);
  }
  return state.startedAt === null ? 0 : Math.max(0, end - state.startedAt);
}

/**
 * Годинник відповіді поточного запитання на мить now (12e): скільки мс запитання вже йде без заставки й пауз (на паузі — до pausedAt).
 * Поза етапом question — 0. Менеджер міряє ним розрив: частина розриву всередині поточного запитання — різниця годинника.
 */
export function awayClock(state: GameState, now: number): number {
  if (state.phase !== 'question') return 0;
  return answeringMs(state, state.paused ? (state.pausedAt ?? now) : now);
}

/**
 * Людина повернулася: закриває інтервал (на паузі — до pausedAt) і додає gapMs, якщо людина під наглядом (не більше за answeringMs).
 * counted — цей вихід уже порахований разом (інтервал закрито в мить розриву на цьому запитанні): ні інтервал після
 * перепідключення, ні розрив нового разу не додають. Без змін — той самий об'єкт.
 */
export function awayEnd(state: GameState, personId: string, now: number, gapMs = 0, counted = false): GameState {
  const index = state.questionIndex;
  const tracked = gapMs > 0 && awayTracked(state, personId);
  const before = state.plays[index]?.away?.[personId]?.count ?? 0;
  const closed = counted ? uncounted(closeEntry(state, index, personId, now), index, personId, before) : closeEntry(state, index, personId, now);
  if (!tracked) return closed.state;
  const end = state.paused ? (state.pausedAt ?? now) : now;
  const gap = Math.min(gapMs, answeringMs(state, end));
  if (gap <= 0) return closed.state;
  const entry = closed.state.plays[index].away?.[personId] ?? { ms: 0, count: 0, since: null };
  // Розрив — частина того самого виходу: окремо рахується, лише якщо інтервалу (≥ 1 мс) не було й вихід ще не порахований.
  return withEntry(closed.state, index, personId, { ...entry, ms: entry.ms + gap, count: entry.count + (closed.added >= 1 || counted ? 0 : 1) });
}

/** Закриття без нового разу: count повертається до before (вихід уже порахований на розриві). */
function uncounted(closed: { state: GameState; added: number }, index: number, personId: string, before: number): { state: GameState; added: number } {
  const entry = closed.state.plays[index]?.away?.[personId];
  if (entry === undefined || entry.count === before) return closed;
  return { state: withEntry(closed.state, index, personId, { ...entry, count: before }), added: closed.added };
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
  const indexes = [...new Set([prev.questionIndex, next.questionIndex])];
  const open = indexes.some((index) => Object.values(next.plays[index]?.away ?? {}).some((e) => e.since !== null));
  if (open || hidden.size > 0) {
    // Нагляд — один раз зі стану next (зміни away на нього не впливають).
    const watched = trackedPeople(next);
    // 1) Відкриті інтервали запитання prev (і поточного запитання next, якщо інше).
    for (const index of open ? indexes : []) {
      for (const [personId, entry] of Object.entries(next.plays[index]?.away ?? {})) {
        if (entry.since === null) continue;
        if (index !== next.questionIndex || !watched.has(personId)) s = closeEntry(s, index, personId, at).state;
      }
    }
    // 2) Приховані телефони, що щойно стали під наглядом (без змін, якщо інтервал уже відкритий). На старті запитання
    // (prev — не це запитання на етапі question) телефон сховано ще до нього: пільга AWAY_MS.preGrace. Посеред запитання
    // (друга спроба) — без пільги.
    const starting = prev.phase !== 'question' || prev.questionIndex !== next.questionIndex;
    for (const personId of hidden) if (watched.has(personId)) s = openEntry(s, personId, at, starting);
  }
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

/** Перезапуск сервера (suspend): відкриті інтервали поточного запитання закриваються на мить at (на паузі — на pausedAt). */
export function awayCloseAll(state: GameState, at: number): GameState {
  let s = state;
  for (const [personId, entry] of Object.entries(state.plays[state.questionIndex]?.away ?? {})) {
    if (entry.since !== null) s = closeEntry(s, state.questionIndex, personId, at).state;
  }
  return s;
}

/** Нікнейм людини: учасник команди чи соло-гравець; немає — null. */
function personNickname(state: GameState, personId: string): string | null {
  if (teamsOn(state)) return memberOf(state, personId)?.nickname ?? null;
  return state.players.find((p) => p.id === personId)?.nickname ?? null;
}

/** Позначка людини на поточному запитанні: від AWAY_MS.mark або зараз поза грою; інакше null. ms — закритий час (без відкритого інтервалу). */
export function awayMarkOf(state: GameState, personId: string): AwayMark | null {
  const entry = state.plays[state.questionIndex]?.away?.[personId];
  if (entry === undefined) return null;
  const out = entry.since !== null;
  if (!out && entry.ms < AWAY_MS.mark) return null;
  const nickname = personNickname(state, personId);
  return nickname === null ? null : { personId, nickname, ms: entry.ms, count: entry.count, out };
}

/** Люди учасника рушія: соло — гравець; команда — її люди в порядку teams.members; людина (голос у командній грі) — сама. */
function peopleOf(state: GameState, participantId: string): string[] {
  if (!teamsOn(state) || memberOf(state, participantId) !== undefined) return [participantId];
  return teamMembers(state, participantId).map((m) => m.id);
}

/** Позначки людей учасника рушія (соло — гравець; команда — її люди в порядку teams.members). */
export function awayPeople(state: GameState, participantId: string): AwayMark[] {
  // Без записів — швидкий вихід: рядки пульта будуються часто.
  if (state.plays[state.questionIndex]?.away === undefined) return [];
  return peopleOf(state, participantId).flatMap((id) => awayMarkOf(state, id) ?? []);
}

/** Нікнейми з позначкою (ms ≥ mark) для сцени: question, locked, reveal; інакше []. Лише імена, без секунд; порядок — гравці (у командній — їхні люди). */
export function stageAway(state: GameState): string[] {
  const away = state.plays[state.questionIndex]?.away;
  if (away === undefined || !OPEN_PHASES.includes(state.phase)) return [];
  return state.players
    .flatMap((p) => peopleOf(state, p.id))
    .filter((id) => (away[id]?.ms ?? 0) >= AWAY_MS.mark)
    .flatMap((id) => personNickname(state, id) ?? []);
}

/**
 * Свій вихід людини на запитанні plays[q]; null — запису немає.
 * penalty — штраф діє на цьому запитанні й поріг пройдено людиною чи її командою (закритий час), а запис учасника, якщо є, не від'ємний.
 * penalty буває й при 0 балах (неправильна відповідь): «0 балів за це запитання» тоді теж правда — так і має бути.
 * Штраф учасника за q, який ведучий скасував, знімає penalty: бали повернулися, а штраф не дописується вдруге.
 */
function ownAwayAt(state: GameState, personId: string, q: number): OwnAway | null {
  const entry = state.plays[q]?.away?.[personId];
  if (entry === undefined) return null;
  const participant = awayParticipant(state, personId);
  const points = participant === null ? undefined : recordOf(state, q, participant)?.points;
  const penalty =
    participant !== null && (points === undefined || points >= 0) && awayPenalized(state, q).includes(participant) && !penaltyUndone(state, participant, q);
  return { play: q, ms: entry.ms, count: entry.count, out: entry.since !== null, penalty };
}

/** Штраф 'away' учасника за запитання q є, і кожен такий рядок зараз скасовано (з урахуванням «Повернути»). */
function penaltyUndone(state: GameState, participant: string, q: number): boolean {
  const own = state.adjustments.filter((a) => a.source === 'away' && a.playerId === participant && a.afterQuestion - 1 === q);
  if (own.length === 0) return false;
  const ledger = undoLedger(state.adjustments.map((a) => ({ seq: a.seq, who: a.playerId, source: a.source, undoes: a.undoes })));
  return own.every((a) => ledger.adjustments.has(a.seq));
}

/**
 * Свій вихід людини на поточному запитанні; null — запису немає чи етап не question / locked / reveal.
 * Етап duel (дуель, що вклинилася) теж дає null: позначки повертаються разом із грою на запитання.
 */
export function ownAway(state: GameState, personId: string): OwnAway | null {
  return OPEN_PHASES.includes(state.phase) ? ownAwayAt(state, personId, state.questionIndex) : null;
}

/**
 * Останній вихід людини з позначкою (ms ≥ AWAY_MS.mark): від поточного запитання назад; на будь-якому етапі, крім лобі (і в кінці гри).
 * Тож телефон, що повернувся лише на таблиці чи на наступному запитанні, однаково бачить закритий вихід (тривога, штраф). null — такого немає.
 * Відкритий інтервал поточного запитання (людина зараз поза грою) — це він з out: true за будь-якого ms: вихід, що тягнеться
 * з попереднього запитання в це (пільга AWAY_MS.preGrace тримає ms під позначкою), не дає тривоги за попереднє, а потім ще одної.
 */
export function lastAway(state: GameState, personId: string): OwnAway | null {
  if (state.phase === 'lobby') return null;
  if (state.plays[state.questionIndex]?.away?.[personId]?.since != null) return ownAwayAt(state, personId, state.questionIndex);
  for (let q = Math.min(state.questionIndex, state.plays.length - 1); q >= 0; q--) {
    const entry = state.plays[q]?.away?.[personId];
    if (entry !== undefined && entry.ms >= AWAY_MS.mark) return ownAwayAt(state, personId, q);
  }
  return null;
}
