import { answererModeOf, isUnscored, type AnswererMode, type AnswererScope, type Phase } from '@quiz/shared';
// game.ts (openQuestion) імпортуватиме цей файл, а цей файл — його; звертання лише під час виклику функцій.
import { fail, ok, type AnswererPick, type AnswererTurn, type GameState, type Play, type Result } from './game';
import { trialOpen } from './survival';
import { actorOf } from './team-act';
import { captainOf, memberOf, teamMembers, teamsOn, withTeams } from './teams';

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

/** Вибір, що ще діятиме (його запитання не відкрито чи «на раунд» поточного раунду); null — немає. */
export function upcomingPick(state: GameState, teamId: string): AnswererPick | null {
  const pick = state.teams?.answerers?.[teamId];
  if (pick === undefined) return null;
  if (pick.roundIndex === null) return pick;
  return pick.scope === 'round' && pick.roundIndex === state.roundIndex && state.phase !== 'round_end' ? pick : null;
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

/** Хто відповідає на поточному запитанні: вибір, черга, капітан; поза зв'язком — капітан; бліц і опитування — капітан. */
export function answererOf(state: GameState, teamId: string): string | null {
  const captain = captainOf(state, teamId);
  const mode = answererMode(state);
  if (mode === 'captain') return captain;
  const q = state.questionIndex;
  const play = state.plays[q];
  if (play === undefined || freeForAll(play)) return captain;
  const turn = state.teams?.turns?.[teamId];
  const candidate = activePick(state, teamId, q)?.memberId ?? (mode === 'rotate' && turn?.questionIndex === q ? turn.memberId : undefined);
  return present(state, teamId, candidate) ?? captain;
}

/** Хто відповідатиме на наступному запитанні (для зрізів між запитаннями). */
export function nextAnswerer(state: GameState, teamId: string): string | null {
  const captain = captainOf(state, teamId);
  const mode = answererMode(state);
  if (mode === 'captain') return captain;
  const pick = upcomingPick(state, teamId);
  if (pick !== null) return present(state, teamId, pick.memberId) ?? captain;
  return mode === 'rotate' ? queueNext(state, teamId) : captain;
}

/** Для зрізів: question / locked / reveal / відкрите випробування — answererOf; інакше nextAnswerer. */
export function shownAnswerer(state: GameState, teamId: string): string | null {
  const now = state.phase === 'question' || state.phase === 'locked' || state.phase === 'reveal' || trialOpen(state);
  return now ? answererOf(state, teamId) : nextAnswerer(state, teamId);
}

/** Капітан вибирає відповідача (null — прибрати вибір). Коди — план 12g, «Вибір». */
export function pickAnswerer(state: GameState, personId: string, memberId: string | null, scope: AnswererScope): Result {
  if (!teamsOn(state) || answererMode(state) === 'captain') return fail('wrong_phase');
  if (!ANSWERER_PICK_PHASES.includes(state.phase)) return fail('wrong_phase');
  const who = actorOf(state, personId, 'captain');
  if (!who.ok) return fail(who.error);
  if (memberId !== null && memberOf(state, memberId)?.teamId !== who.id) return fail('not_found');
  const { [who.id]: _old, ...answerers } = state.teams.answerers ?? {};
  if (memberId !== null) answerers[who.id] = { memberId, scope, fromQuestion: state.plays.length, roundIndex: null };
  return ok(withTeams(state, { answerers }));
}

/** Хто на записі справді відповідає: бліц, опитування й хмара — ніхто; «Мільйонер» — учасник; поле — хто вибрав клітинку; інакше всі. */
function actingTeams(state: GameState, play: Play): string[] {
  if (freeForAll(play)) return [];
  if (play.ladder !== undefined) return [play.ladder.contestantId];
  if (play.board !== undefined) return [play.board.chooserId];
  return state.players.map((p) => p.id);
}

/** Після відкриття запитання: пришпилити раунд виборам цього запитання; у rotate — черга командам actingTeams без вибору. */
export function startAnswerers(state: GameState): GameState {
  if (!teamsOn(state)) return state;
  const mode = answererMode(state);
  const q = state.questionIndex;
  const play = state.plays[q];
  if (mode === 'captain' || play === undefined) return state;
  const toPin = Object.entries(state.teams.answerers ?? {}).filter(([, pick]) => pick.fromQuestion === q && pick.roundIndex === null);
  const pinned =
    toPin.length === 0
      ? state
      : withTeams(state, {
          answerers: { ...state.teams.answerers, ...Object.fromEntries(toPin.map(([team, pick]) => [team, { ...pick, roundIndex: play.roundIndex }])) },
        });
  if (mode !== 'rotate' || !teamsOn(pinned)) return pinned;
  const moved: [string, AnswererTurn][] = [];
  for (const team of actingTeams(state, play)) {
    const memberId = activePick(pinned, team, q) === null ? queueNext(state, team) : null;
    if (memberId !== null) moved.push([team, { questionIndex: q, memberId }]);
  }
  return moved.length === 0 ? pinned : withTeams(pinned, { turns: { ...state.teams.turns, ...Object.fromEntries(moved) } });
}
