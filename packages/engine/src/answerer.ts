import { answererModeOf, isUnscored, type AnswererMode, type AnswererScope, type Phase } from '@quiz/shared';
// game.ts (openQuestion) імпортуватиме цей файл, а цей файл — його; звертання лише під час виклику функцій.
import { comingQuestion, currentRound, fail, ok, questionsLeft, type AnswererNow, type AnswererPick, type AnswererTurn, type GameState, type Play, type Result } from './game';
import { trialOpen } from './survival';
import { actorOf } from './team-act';
import { captainOf, memberOf, teamMembers, teamsOn, withTeams } from './teams';
import { inWipeoutRound, wipeoutIn } from './wipeout';

/** Етапи між запитаннями, коли капітан може вибрати відповідача. */
export const ANSWERER_PICK_PHASES: readonly Phase[] = ['guide', 'intro', 'board', 'wager', 'locked', 'reveal', 'leaderboard', 'round_end'];

/** Режим гри: answererModeOf(state.quiz.settings.teams). */
export function answererMode(state: GameState): AnswererMode {
  return answererModeOf(state.quiz.settings.teams);
}

/** Людина memberId, якщо вона з команди teamId і на зв'язку; інакше null. */
function present(state: GameState, teamId: string, memberId: string | undefined): string | null {
  const member = memberId === undefined ? undefined : memberOf(state, memberId);
  return member !== undefined && member.teamId === teamId && member.connected ? member.id : null;
}

/** Вибір, що діє на запитанні q (план 12g, «Хто відповідає»); null — немає. */
export function activePick(state: GameState, teamId: string, q: number): AnswererPick | null {
  const pick = state.teams?.answerers?.[teamId];
  if (pick === undefined) return null;
  if (pick.scope === 'question') return pick.fromQuestion === q ? pick : null;
  return pick.roundIndex !== null && q >= pick.fromQuestion && state.plays[q]?.roundIndex === pick.roundIndex ? pick : null;
}

/** Вибір, що ще діятиме (його запитання не відкрито чи «на раунд» поточного раунду, де ще лишилися запитання); null — немає. */
export function upcomingPick(state: GameState, teamId: string): AnswererPick | null {
  const pick = state.teams?.answerers?.[teamId];
  if (pick === undefined) return null;
  if (pick.roundIndex === null) return pick;
  const roundGoesOn = pick.roundIndex === state.roundIndex && state.phase !== 'round_end' && questionsLeft(state);
  return pick.scope === 'round' && roundGoesOn ? pick : null;
}

/** Наступний по черзі на зв'язку після turns[teamId]; без запису — з капітана; нікого — капітан. */
export function queueNext(state: GameState, teamId: string): string | null {
  const members = teamMembers(state, teamId);
  const captain = captainOf(state, teamId);
  if (members.length === 0) return captain;
  const last = members.findIndex((m) => m.id === state.teams?.turns?.[teamId]?.memberId);
  // Перший хід (чи той, хто відповідав, уже не в команді) — капітан.
  const from = last === -1 ? Math.max(0, members.findIndex((m) => m.id === captain)) : last + 1;
  for (let k = 0; k < members.length; k++) {
    const member = members[(from + k) % members.length];
    if (member.connected) return member.id;
  }
  return captain;
}

/** Бліц, опитування й хмара: відповідача немає (натиснувший чи кожен сам), лишається капітан. */
const freeForAll = (play: Play): boolean => play.blitz !== undefined || isUnscored(play.question);

/**
 * Хто відповідає на поточному запитанні: вибір, чинний на мить відкриття (current), інакше вибір, черга, капітан;
 * поза зв'язком — капітан; бліц і опитування — капітан.
 */
export function answererOf(state: GameState, teamId: string): string | null {
  const captain = captainOf(state, teamId);
  const mode = answererMode(state);
  if (mode === 'captain') return captain;
  const q = state.questionIndex;
  const play = state.plays[q];
  if (play === undefined || freeForAll(play)) return captain;
  const opened = state.teams?.current?.[teamId];
  const turn = state.teams?.turns?.[teamId];
  const candidate =
    (opened?.questionIndex === q ? opened.memberId : undefined) ??
    activePick(state, teamId, q)?.memberId ??
    (mode === 'rotate' && turn?.questionIndex === q ? turn.memberId : undefined);
  return present(state, teamId, candidate) ?? captain;
}

/**
 * Людина команди teamId, що відповідала на запитання index (12i, для запису): бліц — хто натиснув (play.buzzers);
 * поточне запитання — answererOf; давніше — null (рекордер уже записав його раніше).
 */
export function answeredByOf(state: GameState, index: number, teamId: string): string | null {
  const play = state.plays[index];
  if (play === undefined) return null;
  if (play.blitz !== undefined) return play.buzzers?.[teamId] ?? null;
  return index === state.questionIndex ? answererOf(state, teamId) : null;
}

/** Наступне запитання — бліц, опитування чи «хмара» (comingQuestion): відповідача немає, вибір капітана відкладено. */
export function freeForAllNext(state: GameState): boolean {
  const coming = comingQuestion(state);
  return coming !== null && (coming.blitz || isUnscored(coming.question));
}

/**
 * Хто відповідатиме на наступному запитанні (для зрізів між запитаннями); перед бліцом, опитуванням і «хмарою» — капітан.
 * У rotate перед запитанням «Мільйонера» черга рухається лише в учасника: зал (і всі, поки учасника немає) — капітан.
 */
export function nextAnswerer(state: GameState, teamId: string): string | null {
  const captain = captainOf(state, teamId);
  const mode = answererMode(state);
  if (mode === 'captain' || freeForAllNext(state)) return captain;
  const pick = upcomingPick(state, teamId);
  if (pick !== null) return present(state, teamId, pick.memberId) ?? captain;
  if (mode !== 'rotate') return captain;
  const hall = comingQuestion(state)?.ladder === true && state.ladder?.contestantId !== teamId;
  return hall ? captain : queueNext(state, teamId);
}

/** Попереду ще є запитання: comingQuestion чи незіграні клітинки поточного поля. Після останнього запитання гри — ні. */
function questionAhead(state: GameState): boolean {
  if (comingQuestion(state) !== null) return true;
  return currentRound(state)?.type === 'board' && state.phase !== 'round_end' && questionsLeft(state);
}

/** Вибирати нічого: наступне — бліц, опитування чи «хмара», або запитань попереду вже немає. */
const nothingToPick = (state: GameState): boolean => freeForAllNext(state) || !questionAhead(state);

/** Етап запитання: question / locked / reveal. */
export const onQuestion = (state: GameState): boolean => state.phase === 'question' || state.phase === 'locked' || state.phase === 'reveal';

/** Зараз хтось відповідає: етап запитання чи відкрите випробування «Вибування». */
export const answeringNow = (state: GameState): boolean => onQuestion(state) || trialOpen(state);

/** Для зрізів: question / locked / reveal / відкрите випробування — answererOf; інакше nextAnswerer. */
export function shownAnswerer(state: GameState, teamId: string): string | null {
  return answeringNow(state) ? answererOf(state, teamId) : nextAnswerer(state, teamId);
}

/** Капітан може зараз вибрати відповідача: командна гра не в режимі captain, етап між запитаннями, попереду є запитання й воно не бліц і не опитування. */
export function canPickNow(state: GameState): boolean {
  return teamsOn(state) && answererMode(state) !== 'captain' && ANSWERER_PICK_PHASES.includes(state.phase) && !nothingToPick(state);
}

/** Капітан вибирає відповідача (null — прибрати вибір). Коди — план 12g, «Вибір». */
export function pickAnswerer(state: GameState, personId: string, memberId: string | null, scope: AnswererScope): Result {
  if (!teamsOn(state) || answererMode(state) === 'captain') return fail('wrong_phase');
  if (!ANSWERER_PICK_PHASES.includes(state.phase)) return fail('wrong_phase');
  // Перед бліцом, опитуванням, «хмарою» й після останнього запитання гри вибирати нічого (прибрати вибір — можна).
  if (memberId !== null && nothingToPick(state)) return fail('wrong_phase');
  const who = actorOf(state, personId, 'captain');
  if (!who.ok) return fail(who.error);
  if (memberId !== null && memberOf(state, memberId)?.teamId !== who.id) return fail('not_found');
  const { [who.id]: _old, ...answerers } = state.teams.answerers ?? {};
  if (memberId !== null) answerers[who.id] = { memberId, scope, fromQuestion: state.plays.length, roundIndex: null };
  return ok(withTeams(state, { answerers }));
}

/**
 * Хто на записі справді відповідає (і чий вибір на ньому діє, і кого показує сцена): бліц, опитування й хмара — ніхто;
 * «Мільйонер» — учасник і зал (глядачі теж відповідають, за бали залу); поле — хто вибрав клітинку;
 * «Ва-банк» — ті, хто ще в грі (хто забрав банк чи згорів, не відповідає); інакше всі (у «Вибуванні» й привиди: вони відповідають для себе).
 */
export function answeringTeams(state: GameState, play: Play): string[] {
  if (freeForAll(play)) return [];
  if (play.board !== undefined) return [play.board.chooserId];
  if (inWipeoutRound(state)) return wipeoutIn(state);
  return state.players.map((p) => p.id);
}

/** Чия черга (rotate) рухається на записі: як answeringTeams, але в «Мільйонері» — лише учасник (зал черги не рухає). */
function turnTeams(state: GameState, play: Play): string[] {
  return play.ladder !== undefined ? (freeForAll(play) ? [] : [play.ladder.contestantId]) : answeringTeams(state, play);
}

/**
 * Після відкриття запитання. Бліц, опитування й «хмара» нічого не пришпилюють: вибір (і «на одне запитання», і «на весь раунд»)
 * чекає першого запитання, де відповідач є, — «на весь раунд» тоді діє на раунд того запитання. Інакше вибір цього запитання
 * пришпилює раунд, а вибір «на одне запитання» команди, що на ньому не відповідає (answeringTeams), чекає наступного;
 * вибір, чинний на запитанні, записується в current командам answeringTeams; у rotate — черга командам turnTeams без вибору
 * (один раз на запитання). Нічого не змінилося — той самий об'єкт.
 */
export function startAnswerers(state: GameState): GameState {
  if (!teamsOn(state)) return state;
  const mode = answererMode(state);
  const q = state.questionIndex;
  const play = state.plays[q];
  if (mode === 'captain' || play === undefined) return state;
  const answering = answeringTeams(state, play);
  const free = freeForAll(play);
  const due = Object.entries(state.teams.answerers ?? {}).filter(([, pick]) => pick.fromQuestion === q && pick.roundIndex === null);
  const settled = due.map(([team, pick]): [string, AnswererPick] =>
    free || (pick.scope === 'question' && !answering.includes(team)) ? [team, { ...pick, fromQuestion: q + 1 }] : [team, { ...pick, roundIndex: play.roundIndex }],
  );
  const pinned = settled.length === 0 ? state : withTeams(state, { answerers: { ...state.teams.answerers, ...Object.fromEntries(settled) } });
  if (!teamsOn(pinned)) return pinned;
  const current: [string, AnswererNow][] = [];
  for (const team of answering) {
    const pick = activePick(pinned, team, q);
    if (pick !== null && pinned.teams.current?.[team]?.questionIndex !== q) current.push([team, { questionIndex: q, memberId: pick.memberId }]);
  }
  const moved: [string, AnswererTurn][] = [];
  for (const team of mode === 'rotate' ? turnTeams(state, play) : []) {
    // Вибір капітана черги не рухає; черга цього запитання вже записана — не рухає вдруге.
    const turn = activePick(pinned, team, q) === null && state.teams.turns?.[team]?.questionIndex !== q ? queueNext(state, team) : null;
    if (turn !== null) moved.push([team, { questionIndex: q, memberId: turn }]);
  }
  const teams: Partial<typeof pinned.teams> = {};
  if (current.length > 0) teams.current = { ...pinned.teams.current, ...Object.fromEntries(current) };
  if (moved.length > 0) teams.turns = { ...pinned.teams.turns, ...Object.fromEntries(moved) };
  return Object.keys(teams).length === 0 ? pinned : withTeams(pinned, teams);
}
