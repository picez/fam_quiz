import { QUEST_WINDOW_MS, questKey, questPoints, type BuffKind, type Phase, type QuestRound } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; звертання лише під час виклику функцій (як auction.ts).
import { addAdjustment } from './adjust';
import { appealPassedGradeAt } from './appeal';
import { currentRound, fail, ok, type GameState, type Result } from './game';
import { actorOf } from './team-act';
import { teamsOn } from './teams';

// «Квест із кодом» (29g): звичайні запитання раунду і надбудова — код, позиції за порядком автора, спроби, бонус.
// Відкриті позиції не зберігаються: їх рахує questOpened із записів розкритих запитань раунду.

/** Спроба коду (29g): нормалізований рядок, мить, скільки запитань раунду було розкрито (k), хто з команди ввів (лише команди), чи правильна. */
export interface QuestTry {
  code: string;
  at: number;
  after: number;
  by?: string;
  right: boolean;
}

/** «Квест із кодом» (29g): ключ є лише в раунді quest від intro до round_end. */
export interface QuestState {
  /** Спроби учасника рушія (у командах — команди) у порядку введення. */
  tries: Record<string, QuestTry[]>;
  /** play — запитання раунду; window — 30 с після запитань (етап leaderboard з годинником); shown — код показано всім. */
  stage: 'play' | 'window' | 'shown';
}

/** Етапи, на яких можна ввести код. */
const ENTER_PHASES: readonly Phase[] = ['intro', 'question', 'locked', 'reveal', 'leaderboard', 'duel'];

/** Поточний раунд quest із state.quest; інакше null. */
export function questRoundOf(state: GameState): QuestRound | null {
  const round = currentRound(state);
  return round?.type === 'quest' && state.quest !== undefined ? round : null;
}

/** Індекси записів журналу поточного раунду, які вже розкрито: до questionIndex, і поточний — поза question і locked. */
function revealedIndexes(state: GameState): number[] {
  const current = state.phase !== 'question' && state.phase !== 'locked';
  const indexes: number[] = [];
  state.plays.forEach((play, index) => {
    if (play.roundIndex !== state.roundIndex) return;
    if (index < state.questionIndex || (index === state.questionIndex && current)) indexes.push(index);
  });
  return indexes;
}

/** Скільки запитань раунду розкрито (k): на intro — 0, посеред запитання i (0-базово) — i, після запитань — їх кількість. */
export function questAfter(state: GameState): number {
  return revealedIndexes(state).length;
}

/** Відкрито позицій (0…length): розкриті запитання раунду з оцінкою «правильно» чи з прийнятою апеляцією на оцінку. */
export function questOpened(state: GameState, actorId: string): number {
  const round = questRoundOf(state);
  if (round === null) return 0;
  const right = revealedIndexes(state).filter((index) => {
    const answers = state.plays[index].answers;
    const record = Object.hasOwn(answers, actorId) ? answers[actorId] : undefined;
    return record?.grade === 'correct' || appealPassedGradeAt(state, actorId, index);
  }).length;
  return Math.min(right, Array.from(round.code).length);
}

/** Спроби учасника; без спроб — []. */
function triesOf(state: GameState, actorId: string): QuestTry[] {
  const tries = state.quest?.tries;
  return tries !== undefined && Object.hasOwn(tries, actorId) ? tries[actorId] : [];
}

/** Розв'язання раунду за місцем: за миттю правильної спроби, за рівності — порядком у журналі спроб. */
export function questSolved(state: GameState): { actorId: string; at: number; after: number }[] {
  const solved = Object.entries(state.quest?.tries ?? {}).flatMap(([actorId, tries]) => {
    const right = tries.find((t) => t.right);
    return right === undefined ? [] : [{ actorId, at: right.at, after: right.after }];
  });
  // sort стабільний: за рівності лишається порядок ключів журналу.
  return solved.sort((a, b) => a.at - b.at);
}

/** Розв'язав або вичерпав спроби. */
export function questDone(state: GameState, actorId: string): boolean {
  const round = questRoundOf(state);
  if (round === null) return false;
  const tries = triesOf(state, actorId);
  return tries.some((t) => t.right) || tries.filter((t) => !t.right).length >= round.tries;
}

/** Усі учасники рушія розв'язали або вичерпали спроби (порожня гра — ні). */
function allDone(state: GameState): boolean {
  return state.players.length > 0 && state.players.every((p) => questDone(state, p.id));
}

/** Стан зі stage. */
function withStage(state: GameState, stage: QuestState['stage']): GameState {
  return state.quest === undefined ? state : { ...state, quest: { ...state.quest, stage } };
}

/** Вікно коду відкрите: етап leaderboard раунду quest зі stage 'window' (годинник іде або стоїть на паузі із залишком). */
export function questWindowOpen(state: GameState): boolean {
  return state.phase === 'leaderboard' && questRoundOf(state) !== null && state.quest?.stage === 'window';
}

/** Вікно після запитань: leaderboard, годинник QUEST_WINDOW_MS від now; якщо всі вже розв'язали чи вичерпали спроби — одразу shown. */
export function openQuestWindow(state: GameState, now: number): GameState {
  if (allDone(state)) return withStage({ ...state, phase: 'leaderboard', startedAt: null, endsAt: null, remainingMs: null }, 'shown');
  return withStage({ ...state, phase: 'leaderboard', startedAt: now, endsAt: now + QUEST_WINDOW_MS, remainingMs: null }, 'window');
}

/** Закриває вікно: код показано всім, годинника немає. */
export function closeQuestWindow(state: GameState): GameState {
  return withStage({ ...state, startedAt: null, endsAt: null, remainingMs: null }, 'shown');
}

/** Код показано (кінець раунду чи гри); поза раундом quest — стан без змін. */
export function showQuestCode(state: GameState): GameState {
  return state.quest === undefined || state.quest.stage === 'shown' ? state : withStage(state, 'shown');
}

/** Відкрите вікно закривається, якщо всі розв'язали чи вичерпали спроби; на паузі — ні (закриє resume). */
export function settleQuestWindow(state: GameState): GameState {
  return questWindowOpen(state) && !state.paused && allDone(state) ? closeQuestWindow(state) : state;
}

/**
 * Спроба коду від учасника рушія actorId (у командах — команда; memberId — людина, яка ввела). Перевірки по черзі:
 * не раунд quest чи не той етап — wrong_phase; пауза — paused; учасника немає — not_found; код показано (чи вікно сплило) — quest_closed;
 * уже розв'язано — quest_solved; спроби вичерпано — quest_tries; не та довжина — quest_length; такий рядок уже був — quest_repeat
 * (дві останні не згоряють). Правильна дає бонус: бали — коригування 'quest', баф — ще одне використання (усім чи першим N).
 */
export function enterQuestCode(state: GameState, actorId: string, memberId: string, raw: string, now: number): Result {
  const round = questRoundOf(state);
  const quest = state.quest;
  if (round === null || quest === undefined || !ENTER_PHASES.includes(state.phase)) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (!state.players.some((p) => p.id === actorId)) return fail('not_found');
  if (quest.stage === 'shown') return fail('quest_closed');
  if (questWindowOpen(state) && state.endsAt !== null && now >= state.endsAt) return fail('quest_closed');
  const tries = triesOf(state, actorId);
  if (tries.some((t) => t.right)) return fail('quest_solved');
  if (tries.filter((t) => !t.right).length >= round.tries) return fail('quest_tries');
  const code = questKey(raw);
  if (Array.from(code).length !== Array.from(round.code).length) return fail('quest_length');
  if (tries.some((t) => t.code === code)) return fail('quest_repeat');
  const right = code === round.code;
  const after = questAfter(state);
  const entry: QuestTry = { code, at: now, after, ...(teamsOn(state) ? { by: memberId } : {}), right };
  const place = questSolved(state).length + 1;
  const recorded: GameState = { ...state, quest: { ...quest, tries: { ...quest.tries, [actorId]: [...tries, entry] } } };
  const rewarded = right ? reward(recorded, round, actorId, after, place, now) : recorded;
  return ok(settleQuestWindow(rewarded));
}

/** Бонус правильної спроби: бали — max(1, round(bonus × частка)) без множника раунду; баф — усім або першим first. */
function reward(state: GameState, round: QuestRound, actorId: string, after: number, place: number, now: number): GameState {
  const bonus = round.bonus;
  if (bonus.kind === 'points') return addAdjustment(state, actorId, questPoints(bonus.points, after, round.questions.length), now, 'quest');
  if (bonus.first !== null && place > bonus.first) return state;
  const old = state.questBuffs !== undefined && Object.hasOwn(state.questBuffs, actorId) ? state.questBuffs[actorId] : [];
  return { ...state, questBuffs: { ...state.questBuffs, [actorId]: [...old, bonus.buff] } };
}

/** Видані квестом бафи учасника цього виду. */
export function questGranted(state: GameState, actorId: string, kind: BuffKind): number {
  const granted = state.questBuffs !== undefined && Object.hasOwn(state.questBuffs, actorId) ? state.questBuffs[actorId] : [];
  return granted.filter((k) => k === kind).length;
}

/** Вилучений учасник рушія зникає зі спроб і виданих бафів. */
export function dropFromQuest(state: GameState, actorId: string): GameState {
  let next = state;
  if (next.quest !== undefined && Object.hasOwn(next.quest.tries, actorId)) {
    const { [actorId]: _tries, ...tries } = next.quest.tries;
    next = { ...next, quest: { ...next.quest, tries } };
  }
  if (next.questBuffs !== undefined && Object.hasOwn(next.questBuffs, actorId)) {
    const { [actorId]: _buffs, ...questBuffs } = next.questBuffs;
    next = { ...next, questBuffs };
  }
  return next;
}

/** Код від людини: соло — сам гравець; командна — будь-хто з команди за команду (actorOf 'quest'). */
export function actQuest(state: GameState, memberId: string, raw: string, now: number): Result {
  const who = actorOf(state, memberId, 'quest');
  if (!who.ok) return fail(who.error);
  return enterQuestCode(state, who.id, memberId, raw, now);
}
