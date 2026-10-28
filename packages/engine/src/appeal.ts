// Апеляція гравця (12f): голосування залу за 30 с. Цей файл views.ts не імпортує.
// game.ts викликатиме цей файл (задача 4), а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import {
  APPEAL_MS,
  APPEAL_ROUNDS,
  APPEALS_PER_GAME,
  appealCounted,
  appealDecision,
  undoLedger,
  type AppealReason,
} from '@quiz/shared';
import { addAdjustment } from './adjust';
import { awayPenalized } from './away';
import { fail, ok, override, recordOf, type Appeal, type GameState, type Result } from './game';
import { presentPlayers } from './present';
import { actorOf } from './team-act';
import { memberOf, presentMembers, teamsOn } from './teams';

/** Остання апеляція, що задовольняє test; null — немає. */
function lastWhere(state: GameState, test: (a: Appeal) => boolean): Appeal | null {
  const appeals = state.appeals ?? [];
  for (let i = appeals.length - 1; i >= 0; i -= 1) if (test(appeals[i])) return appeals[i];
  return null;
}

/** Відкрита апеляція (outcome null); null — немає. */
export function appealOpen(state: GameState): Appeal | null {
  return lastWhere(state, (a) => a.outcome === null);
}

/** Остання апеляція на поточному запитанні на етапі reveal; інакше null. */
export function lastAppeal(state: GameState): Appeal | null {
  if (state.phase !== 'reveal') return null;
  return lastWhere(state, (a) => a.questionIndex === state.questionIndex);
}

/** Скільки апеляцій ще має учасник рушія: APPEALS_PER_GAME − раховані (appealCounted). */
export function appealsLeft(state: GameState, participant: string): number {
  const used = (state.appeals ?? []).filter((a) => a.by === participant && appealCounted(a.outcome)).length;
  return Math.max(0, APPEALS_PER_GAME - used);
}

/** Хто голосує в апеляції учасника by: присутні люди, крім by (у командній грі — люди інших команд). */
export function appealVoters(state: GameState, by: string): string[] {
  if (!teamsOn(state)) return presentPlayers(state).filter((p) => p.id !== by).map((p) => p.id);
  return presentMembers(state)
    .filter((m) => m.teamId !== null && m.teamId !== by && state.players.some((p) => p.id === m.teamId))
    .map((m) => m.id);
}

/** Скільки дасть «так» за оцінку: бали override(…, 'correct') мінус бали запису на поточному запитанні; не вийшло — 0. */
export function appealPoints(state: GameState, participant: string): number {
  const record = recordOf(state, state.questionIndex, participant);
  if (record === undefined) return 0;
  // Результат override у стан не потрапляє: серія й рахунок не змінюються.
  const graded = override(state, participant, 'correct');
  if (!graded.ok) return 0;
  const points = recordOf(graded.state, state.questionIndex, participant)?.points;
  return points === undefined ? 0 : points - record.points;
}

/** Ledger скасувань стану (12a). */
function ledgerOf(state: GameState) {
  return undoLedger(state.adjustments.map((a) => ({ seq: a.seq, who: a.playerId, source: a.source, undoes: a.undoes })));
}

/** Нескасовані коригування джерела source учасника під запитанням q (afterQuestion − 1 === q). */
function openRows(state: GameState, source: 'appeal' | 'away', participant: string, q: number) {
  const own = state.adjustments.filter((a) => a.source === source && a.playerId === participant && a.afterQuestion - 1 === q);
  if (own.length === 0) return own;
  const undone = ledgerOf(state).adjustments;
  return own.filter((a) => !undone.has(a.seq));
}

/** Сума нескасованих коригувань 'appeal' учасника під запитанням q (afterQuestion − 1 === q). */
export function appealAdjustmentTotal(state: GameState, participant: string, q: number): number {
  return openRows(state, 'appeal', participant, q).reduce((sum, a) => sum + a.points, 0);
}

/** Штраф 'away' учасника за q є, і кожен такий рядок скасовано. */
function penaltyUndone(state: GameState, participant: string, q: number): boolean {
  const any = state.adjustments.some((a) => a.source === 'away' && a.playerId === participant && a.afterQuestion - 1 === q);
  return any && openRows(state, 'away', participant, q).length === 0;
}

/** Підстави, з якими учасник може оскаржити поточне запитання (лише придатність відповіді, без ліміту, відкритої апеляції й виборців). */
export function appealReasons(state: GameState, participant: string): AppealReason[] {
  if (state.phase !== 'reveal' || !state.players.some((p) => p.id === participant)) return [];
  const q = state.questionIndex;
  const play = state.plays[q];
  const round = play === undefined ? undefined : state.quiz.rounds[play.roundIndex];
  if (round === undefined || !APPEAL_ROUNDS.includes(round.type)) return [];
  if (round.type === 'board' && (play.board?.kind !== 'normal' || play.board.chooserId !== participant)) return [];
  const record = recordOf(state, q, participant);
  // Усна відповідь (без відповіді з телефона) не оскаржується: залу нема що побачити.
  if (record === undefined || record.answer === null) return [];
  // Одна апеляція на учасника на запитання, хоч би чим вона скінчилася.
  if ((state.appeals ?? []).some((a) => a.by === participant && a.questionIndex === q)) return [];
  const reasons: AppealReason[] = [];
  if (record.grade !== 'correct' && appealPoints(state, participant) > 0) reasons.push('grade');
  if (
    awayPenalized(state, q).includes(participant) &&
    !penaltyUndone(state, participant, q) &&
    record.points + appealAdjustmentTotal(state, participant, q) > 0
  ) {
    reasons.push('away');
  }
  return reasons;
}

/** Хтось ще може відкрити апеляцію: придатна підстава, ліміт є, відкритої немає, голосувати є кому. */
export function appealPossible(state: GameState): boolean {
  if (appealOpen(state) !== null) return false;
  return state.players.some(
    (p) => appealReasons(state, p.id).length > 0 && appealsLeft(state, p.id) > 0 && appealVoters(state, p.id).length > 0,
  );
}

/** Людина є в грі: соло — гравець; командна гра — учасник. */
function personIn(state: GameState, personId: string): boolean {
  return teamsOn(state) ? memberOf(state, personId) !== undefined : state.players.some((p) => p.id === personId);
}

/** «так» і «ні» апеляції: лише голоси людей, що є в грі. */
export function appealTally(state: GameState, appeal: Appeal): { yes: number; no: number } {
  let yes = 0;
  let no = 0;
  for (const [personId, vote] of Object.entries(appeal.votes)) {
    if (!personIn(state, personId)) continue;
    if (vote) yes += 1;
    else no += 1;
  }
  return { yes, no };
}

/** Заміна апеляції за id. */
function withAppeal(state: GameState, appeal: Appeal): GameState {
  return { ...state, appeals: (state.appeals ?? []).map((a) => (a.id === appeal.id ? appeal : a)) };
}

/** Відкрити апеляцію (personId — соло-гравець чи учасник команди, тоді лише капітан). Коди — план 12f, «Порядок перевірок openAppeal». */
export function openAppeal(state: GameState, personId: string, reason: AppealReason, now: number): Result {
  if (state.phase !== 'reveal') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  const who = actorOf(state, personId, 'captain');
  if (!who.ok) return fail(who.error);
  const by = who.id;
  if (!state.players.some((p) => p.id === by)) return fail('not_found');
  if (appealOpen(state) !== null) return fail('appeal_open');
  if (!appealReasons(state, by).includes(reason)) return fail('appeal_unfit');
  if (appealsLeft(state, by) <= 0) return fail('appeals_used');
  if (appealVoters(state, by).length === 0) return fail('no_voters');
  const appeals = state.appeals ?? [];
  const appeal: Appeal = {
    id: appeals.length + 1,
    by,
    questionIndex: state.questionIndex,
    reason,
    openedAt: now,
    endsAt: now + APPEAL_MS.vote,
    votes: {},
    outcome: null,
  };
  return ok({ ...state, appeals: [...appeals, appeal] });
}

/** Голос людини в апеляції appealId; останній голос присутніх закриває її рішенням. Коди — план 12f, «Голос». */
export function castAppealVote(state: GameState, personId: string, appealId: number, yes: boolean, now: number): Result {
  if (!personIn(state, personId)) return fail('not_found');
  const open = appealOpen(state);
  if (open === null || open.id !== appealId) return fail('vote_closed');
  if (state.paused) return fail('paused');
  const voters = appealVoters(state, open.by);
  if (!voters.includes(personId)) return fail('vote_denied');
  const appeal: Appeal = { ...open, votes: { ...open.votes, [personId]: yes } };
  const voted = withAppeal(state, appeal);
  // Проголосували всі присутні виборці — рішення одразу.
  return ok(voters.every((id) => Object.hasOwn(appeal.votes, id)) ? decideAppeal(voted, now) : voted);
}

/** Рішення відкритої апеляції зараз (план 12f, «Рішення»); немає відкритої — той самий об'єкт. */
export function decideAppeal(state: GameState, now: number): GameState {
  const open = appealOpen(state);
  if (open === null) return state;
  const { yes, no } = appealTally(state, open);
  const outcome = appealDecision(yes, no);
  let s = state;
  let points = 0;
  if (outcome === 'yes' && state.players.some((p) => p.id === open.by)) {
    // grade — бали відповіді як «правильно» мінус бали запису; away — штраф, якщо він уже є (зазвичай ще немає).
    points =
      open.reason === 'grade'
        ? appealPoints(state, open.by)
        : -openRows(state, 'away', open.by, open.questionIndex).reduce((sum, a) => sum + a.points, 0);
  }
  let closed: Appeal = { ...open, outcome };
  if (points > 0) {
    const roundIndex = state.plays[open.questionIndex]?.roundIndex ?? state.roundIndex;
    s = addAdjustment(s, open.by, points, now, 'appeal', { roundIndex });
    closed = { ...closed, adjustmentSeq: s.adjustmentSeq };
  }
  return withAppeal(s, closed);
}
