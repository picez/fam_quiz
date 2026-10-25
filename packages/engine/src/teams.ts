import { bandSizes, LIMITS, type TeamForm } from '@quiz/shared';
// game.ts імпортує цей файл, а цей файл — його; звертання лише під час виклику функцій.
import { dropBallots } from './buffs';
import { settleDice, throwFor } from './board-dice';
import {
  autoLock,
  fail,
  ok,
  removePlayer,
  setConnected,
  shuffle,
  type DiceState,
  type GameState,
  type Play,
  type PlayerState,
  type Result,
  type Rng,
  type TeamMember,
  type TeamsState,
} from './game';
import { normalizeText } from './normalize';

type TeamGame = GameState & { teams: TeamsState };

/** Чи гра командна. */
export function teamsOn(state: GameState): state is TeamGame {
  return state.teams !== undefined;
}

/** Учасник за id; немає — undefined (і в соло-грі). */
export function memberOf(state: GameState, memberId: string): TeamMember | undefined {
  return state.teams?.members.find((m) => m.id === memberId);
}

/** Команда учасника; null — без команди або не учасник. */
export function teamOf(state: GameState, memberId: string): string | null {
  return memberOf(state, memberId)?.teamId ?? null;
}

/** Учасники команди в порядку приходу. */
export function teamMembers(state: GameState, teamId: string): TeamMember[] {
  return state.teams?.members.filter((m) => m.teamId === teamId) ?? [];
}

/** Ефективний капітан: вибраний чи перший; не на зв'язку — наступний по колу на зв'язку; нікого — вибраний чи перший; null — команда порожня. */
export function captainOf(state: GameState, teamId: string): string | null {
  const members = teamMembers(state, teamId);
  if (members.length === 0) return null;
  const chosen = state.teams?.captains[teamId];
  const from = Math.max(0, members.findIndex((m) => m.id === chosen));
  for (let k = 0; k < members.length; k++) {
    const member = members[(from + k) % members.length];
    if (member.connected) return member.id;
  }
  return members[from].id;
}

/** Дуелянт команди: вибраний капітаном і на зв'язку, інакше капітан. */
export function duelistOf(state: GameState, teamId: string): string | null {
  const chosen = state.teams?.duelists[teamId];
  const duelist = teamMembers(state, teamId).find((m) => m.id === chosen);
  return duelist !== undefined && duelist.connected ? duelist.id : captainOf(state, teamId);
}

/** Люди на зв'язку плюс усі люди команд з awaiting (для голосів без балів). */
export function presentMembers(state: GameState): TeamMember[] {
  return state.teams?.members.filter((m) => m.connected || (m.teamId !== null && state.awaiting.includes(m.teamId))) ?? [];
}

const withTeams = (state: TeamGame, teams: Partial<TeamsState>): GameState => ({ ...state, teams: { ...state.teams, ...teams } });

const teamLobby = (state: GameState): state is TeamGame => teamsOn(state) && state.phase === 'lobby';

const dicePending = (dice: DiceState | null): boolean => dice !== null && dice.tour.length > 0;

/** Без записів із цими значеннями (капітани, дуелянти після вилучення людини). */
const withoutValues = (record: Record<string, string>, ids: string[]): Record<string, string> =>
  Object.fromEntries(Object.entries(record).filter(([, id]) => !ids.includes(id)));

/**
 * Закриття туру кубиків лобі: у турі — учасники, що кидали або чекають кидка (хто прийшов пізніше — поза ним).
 * Тур закрито без нічиєї → учасники за спаданням кидків розкладаються смугами по командах.
 */
function settleTeamDice(state: TeamGame, start: DiceState): GameState {
  const ids = state.teams.members.filter((m) => Object.hasOwn(start.throws, m.id) || start.tour.includes(m.id)).map((m) => m.id);
  const { dice, order } = settleDice(start, ids);
  if (order === null) return withTeams(state, { dice });
  const sizes = bandSizes(order.length, state.teams.list.length);
  const teamFor = new Map<string, string>();
  let at = 0;
  sizes.forEach((size, band) => {
    for (const id of order.slice(at, at + size)) teamFor.set(id, state.teams.list[band].id);
    at += size;
  });
  const members = state.teams.members.map((m) => (teamFor.has(m.id) ? { ...m, teamId: teamFor.get(m.id) ?? null } : m));
  return withTeams(state, { dice, members });
}

/** Лобі, ведучий: спосіб формування; незакритий тур кубиків скасовується, склад лишається. wrong_phase поза лобі чи в соло-грі. */
export function setTeamForm(state: GameState, form: TeamForm): Result {
  if (!teamLobby(state)) return fail('wrong_phase');
  // Кидки закритого туру лишаються для показу, лише поки спосіб — кубик.
  const dice = dicePending(state.teams.dice) || form !== 'dice' ? null : state.teams.dice;
  return ok(withTeams(state, { form, dice }));
}

/** Лобі, учасник: вибір команди; лише 'pick' (team_form); not_found — немає команди чи учасника. */
export function pickTeam(state: GameState, memberId: string, teamId: string): Result {
  if (!teamLobby(state)) return fail('wrong_phase');
  if (state.teams.form !== 'pick') return fail('team_form');
  return moveMember(state, memberId, teamId);
}

/** Лобі, ведучий: перемістити учасника (null — без команди); будь-який спосіб; dice_pending — тур кубиків триває. */
export function assignTeam(state: GameState, memberId: string, teamId: string | null): Result {
  if (!teamLobby(state)) return fail('wrong_phase');
  if (dicePending(state.teams.dice)) return fail('dice_pending');
  return moveMember(state, memberId, teamId);
}

function moveMember(state: TeamGame, memberId: string, teamId: string | null): Result {
  if (memberOf(state, memberId) === undefined) return fail('not_found');
  if (teamId !== null && !state.teams.list.some((t) => t.id === teamId)) return fail('not_found');
  return ok(withTeams(state, { members: state.teams.members.map((m) => (m.id === memberId ? { ...m, teamId } : m)) }));
}

/** Лобі, ведучий: 'random' (team_form) — перемішати всіх і роздати по колу; учасників 0 → teams_few. */
export function dealTeams(state: GameState, rng: Rng): Result {
  if (!teamLobby(state)) return fail('wrong_phase');
  if (state.teams.form !== 'random') return fail('team_form');
  if (state.teams.members.length === 0) return fail('teams_few');
  const list = state.teams.list;
  const teamFor = new Map(shuffle(state.teams.members.map((m) => m.id), rng).map((id, i) => [id, list[i % list.length].id]));
  return ok(withTeams(state, { members: state.teams.members.map((m) => ({ ...m, teamId: teamFor.get(m.id) ?? null })) }));
}

/** Лобі, ведучий: 'dice' (team_form) — тур для всіх учасників; < 2 → teams_few; тур уже триває → dice_pending. */
export function startTeamDice(state: GameState): Result {
  if (!teamLobby(state)) return fail('wrong_phase');
  if (state.teams.form !== 'dice') return fail('team_form');
  if (dicePending(state.teams.dice)) return fail('dice_pending');
  if (state.teams.members.length < 2) return fail('teams_few');
  const ids = state.teams.members.map((m) => m.id);
  return ok(withTeams(state, { dice: { throws: {}, tour: [...ids], waiting: [...ids], tourNo: 1 } }));
}

/** Лобі, учасник: кидок у турі; not_your_turn — не чекає кидка; wrong_phase — туру немає. Тур закрито → смуги. */
export function rollTeamDie(state: GameState, memberId: string, rng: Rng): Result {
  if (!teamLobby(state) || state.teams.dice === null || !dicePending(state.teams.dice)) return fail('wrong_phase');
  if (!state.teams.dice.waiting.includes(memberId)) return fail('not_your_turn');
  return ok(settleTeamDice(state, throwFor(state.teams.dice, memberId, rng)));
}

/** Лобі, ведучий: кинути за всіх, хто в турі ще не кинув. */
export function rollTeamRest(state: GameState, rng: Rng): Result {
  if (!teamLobby(state) || state.teams.dice === null || !dicePending(state.teams.dice)) return fail('wrong_phase');
  const start = state.teams.dice;
  return ok(settleTeamDice(state, start.waiting.reduce((acc, id) => throwFor(acc, id, rng), start)));
}

/** Ведучий: капітан команди; будь-коли, крім finished (wrong_phase); not_found — учасник не з цієї команди. */
export function setCaptain(state: GameState, teamId: string, memberId: string): Result {
  if (!teamsOn(state) || state.phase === 'finished') return fail('wrong_phase');
  if (teamOf(state, memberId) !== teamId) return fail('not_found');
  return ok(withTeams(state, { captains: { ...state.teams.captains, [teamId]: memberId } }));
}

/** Внутрішня (для game.ts): новий учасник у лобі, без команди; нікнейм уже очищено й перевірено на довжину. */
export function addMember(state: GameState, member: { id: string; nickname: string }): Result {
  if (!teamLobby(state)) return fail('wrong_phase');
  if (state.teams.members.length >= LIMITS.maxPlayers) return fail('room_full');
  const key = normalizeText(member.nickname);
  if (state.teams.members.some((m) => normalizeText(m.nickname) === key)) return fail('nickname_taken');
  const added: TeamMember = { id: member.id, nickname: member.nickname, connected: true, teamId: null };
  return ok(withTeams(state, { members: [...state.teams.members, added] }));
}

/** Журнал без слідів цих людей: голоси (відповіді під їхніми id), бюлетені залу, натиски бліцу за команду. */
function withoutPeople(plays: Play[], ids: string[]): Play[] {
  return plays.map((play) => {
    const answers = Object.fromEntries(Object.entries(play.answers).filter(([id]) => !ids.includes(id)));
    const kept: Play = { ...play, answers };
    if (play.buffs !== undefined) kept.buffs = ids.reduce((buffs, id) => dropBallots(buffs, id), play.buffs);
    if (play.buzzers !== undefined) kept.buzzers = withoutValues(play.buzzers, ids);
    return kept;
  });
}

/**
 * Внутрішня (для removePlayer з id команди): команда зникає з teams разом зі своїми людьми та їхніми голосами;
 * гравця рушія прибирає далі наявний шлях вилучення.
 */
export function withoutTeam(state: GameState, teamId: string): GameState {
  if (!teamsOn(state)) return state;
  const gone = teamMembers(state, teamId).map((m) => m.id);
  const { [teamId]: _captain, ...captains } = state.teams.captains;
  const { [teamId]: _duelist, ...duelists } = state.teams.duelists;
  const plays = withoutPeople(state.plays, gone).map((play) => {
    if (play.buzzers === undefined) return play;
    const { [teamId]: _buzzer, ...buzzers } = play.buzzers;
    return { ...play, buzzers };
  });
  return withTeams(
    { ...state, plays },
    {
      list: state.teams.list.filter((t) => t.id !== teamId),
      members: state.teams.members.filter((m) => m.teamId !== teamId),
      captains,
      duelists,
    },
  );
}

/** Вилучення учасника: лобі — з members і кидків; у грі — ще голоси, капітан, дуелянт, натиснувший; останній у команді → removePlayer(teamId). */
export function dropMember(state: GameState, memberId: string): Result {
  if (!teamsOn(state)) return fail('not_found');
  const member = memberOf(state, memberId);
  if (member === undefined) return fail('not_found');
  const team = member.teamId;
  if (state.phase !== 'lobby' && team !== null && state.players.some((p) => p.id === team) && teamMembers(state, team).length === 1) {
    return removePlayer(state, team);
  }
  const members = state.teams.members.filter((m) => m.id !== memberId);
  const left = withTeams(
    { ...state, plays: withoutPeople(state.plays, [memberId]) },
    { members, captains: withoutValues(state.teams.captains, [memberId]), duelists: withoutValues(state.teams.duelists, [memberId]) },
  ) as TeamGame;
  if (state.phase === 'lobby') {
    const dice = left.teams.dice;
    if (dice === null) return ok(left);
    const { [memberId]: _gone, ...throws } = dice.throws;
    const without: DiceState = {
      ...dice,
      throws,
      tour: dice.tour.filter((id) => id !== memberId),
      waiting: dice.waiting.filter((id) => id !== memberId),
    };
    // Тур, що через вилучення скінчився, рахується (як dropFromDice на полі).
    return ok(dicePending(dice) ? settleTeamDice(left, without) : withTeams(left, { dice: without }));
  }
  // Команда на зв'язку, поки хтось із її людей на зв'язку.
  const players = left.players.map((p): PlayerState => (p.id === team ? { ...p, connected: members.some((m) => m.teamId === team && m.connected) } : p));
  return ok(autoLock({ ...left, players }));
}

/** Зв'язок учасника; якщо змінилося «хтось із команди на зв'язку» — setConnected(команда); повернувся — команда зникає з awaiting. */
export function memberConnected(state: GameState, memberId: string, connected: boolean, now: number): Result {
  if (!teamsOn(state)) return fail('not_found');
  if (memberOf(state, memberId) === undefined) return fail('not_found');
  const updated = withTeams(state, { members: state.teams.members.map((m) => (m.id === memberId ? { ...m, connected } : m)) });
  const team = teamOf(state, memberId);
  const player = team === null ? undefined : state.players.find((p) => p.id === team);
  if (team === null || player === undefined) return ok(updated);
  const present = teamMembers(updated, team).some((m) => m.connected);
  const returned = connected && state.awaiting.includes(team);
  return present !== player.connected || returned ? setConnected(updated, team, present, now) : ok(updated);
}

/** Старт: без команди — у найменші; порожні відпадають; < 2 команд чи < 2 учасників → teams_few; players = команди. */
export function formTeams(state: GameState): Result {
  if (!teamLobby(state)) return fail('wrong_phase');
  const { list } = state.teams;
  const sizes = list.map((t) => state.teams.members.filter((m) => m.teamId === t.id).length);
  // Без команди — у найменшу на цю мить, за рівності — у першу за порядком; роздача в порядку приходу.
  const members = state.teams.members.map((m) => {
    if (m.teamId !== null) return m;
    const smallest = sizes.indexOf(Math.min(...sizes));
    sizes[smallest] += 1;
    return { ...m, teamId: list[smallest].id };
  });
  const kept = list.filter((t) => members.some((m) => m.teamId === t.id));
  if (kept.length < 2 || members.length < 2) return fail('teams_few');
  const players = kept.map(
    (t): PlayerState => ({
      id: t.id,
      nickname: t.name,
      connected: members.some((m) => m.teamId === t.id && m.connected),
      score: 0,
      totalTimeMs: 0,
      streak: 0,
    }),
  );
  return ok(withTeams({ ...state, players }, { list: kept, members, dice: null }));
}
