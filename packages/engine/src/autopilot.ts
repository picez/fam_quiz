import { autopilotQuiz, type Quiz } from '@quiz/shared';
import {
  addPlayer,
  createGame,
  fail,
  ok,
  pause,
  resume,
  start,
  type AutopilotState,
  type GameOptions,
  type GameState,
  type Result,
  type Rng,
} from './game';
import { dealTeams, startTeamDice, teamsOn } from './teams';

// Гра без ведучого (11g). Кроки йдуть тими самими функціями рушія, що й кнопки ведучого; правила — план 11g.

/** Нова гра-автопілот: createGame(autopilotQuiz(quiz), options) → addPlayer(author) → autopilot { authorId, at: null }. Помилки нікнейма — з addPlayer. */
export function createAutopilotGame(quiz: Quiz, author: { id: string; nickname: string }, options?: GameOptions): Result {
  const added = addPlayer(createGame(autopilotQuiz(quiz), options), author);
  if (!added.ok) return added;
  return ok({ ...added.state, autopilot: { authorId: author.id, at: null } });
}

/** Чи це автор кімнати-автопілота (у командній грі — id учасника). */
export function isAuthor(state: GameState, personId: string): boolean {
  return state.autopilot !== undefined && state.autopilot.authorId === personId;
}

/** Хтось із людей на зв'язку: соло — players, командна гра — teams.members (awaiting не рахується). */
export function anyonePresent(state: GameState): boolean {
  return teamsOn(state) ? state.teams.members.some((m) => m.connected) : state.players.some((p) => p.connected);
}

/** Стан з іншим autopilot (лише для стану автопілота). */
function withPilot(state: GameState, patch: (pilot: AutopilotState) => AutopilotState): GameState {
  return state.autopilot === undefined ? state : { ...state, autopilot: patch(state.autopilot) };
}

/** Автопілот без ключів паузи. */
function running(pilot: AutopilotState): AutopilotState {
  const { left: _left, hold: _hold, ...rest } = pilot;
  return rest;
}

/** start із прибраним starting (гра вже йде). */
function startNow(state: GameState, now: number): Result {
  const started = start(state, now);
  if (!started.ok) return started;
  return ok(
    withPilot(started.state, (pilot) => {
      const { starting: _starting, ...rest } = pilot;
      return rest;
    }),
  );
}

/** «Почати гру» від автора (правила — план 11g, «Автор»); не автопілот → not_allowed; поза лобі → wrong_phase. */
export function autopilotStart(state: GameState, now: number, rng: Rng): Result {
  if (state.autopilot === undefined) return fail('not_allowed');
  if (state.phase !== 'lobby') return fail('wrong_phase');
  if (!teamsOn(state)) return startNow(state, now);
  const { form, members, dice } = state.teams;
  if (form === 'host' || form === 'random') {
    // Розподілу ведучого немає: склад роздає жереб у мить старту, спосіб лишається тим, що вибрав автор.
    const dealt = dealTeams({ ...state, teams: { ...state.teams, form: 'random' } }, rng);
    if (!dealt.ok) return dealt;
    return startNow({ ...dealt.state, teams: { ...dealt.state.teams!, form } }, now);
  }
  if (form === 'dice' && dice === null && members.length >= 2 && members.some((m) => m.teamId === null)) {
    // Спершу тур кубиків; гра стартує сама, щойно він закриється (крок автопілота).
    const tour = startTeamDice(state);
    if (!tour.ok) return tour;
    return ok(withPilot(tour.state, (pilot) => ({ ...pilot, starting: true })));
  }
  return startNow(state, now);
}

/** Пауза від автора: pause + hold 'author' (left/at ставить planAutopilot); не автопілот → not_allowed. */
export function authorPause(state: GameState, now: number): Result {
  if (state.autopilot === undefined) return fail('not_allowed');
  const paused = pause(state, now);
  if (!paused.ok) return paused;
  return ok(withPilot(paused.state, (pilot) => ({ ...pilot, hold: 'author' })));
}

/** Продовження від автора: resume, hold і left геть (at ставить planAutopilot); будь-яка пауза — і «нікого» теж. */
export function authorResume(state: GameState, now: number): Result {
  if (state.autopilot === undefined) return fail('not_allowed');
  const resumed = resume(state, now);
  if (!resumed.ok) return resumed;
  return ok(withPilot(resumed.state, running));
}

/** Для suspend: гра, що йшла (wasPaused false, не лобі й не фініш) → hold 'nobody', left = max(0, at − savedAt), at null; уже на паузі → at null; лобі — без змін. */
export function suspendAutopilot(state: GameState, savedAt: number, wasPaused: boolean): GameState {
  if (state.phase === 'lobby' || state.phase === 'finished') return state;
  return withPilot(state, (pilot) => {
    if (wasPaused) return { ...pilot, at: null };
    const { left: _left, ...rest } = pilot;
    return { ...rest, at: null, hold: 'nobody', ...(pilot.at === null ? {} : { left: Math.max(0, pilot.at - savedAt) }) };
  });
}
