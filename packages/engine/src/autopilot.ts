import { AUTOPILOT_MS, autopilotIntroMs, autopilotQuiz, type Quiz, type TeamForm } from '@quiz/shared';
import { skipTurn } from './board';
import { dicePending, rollForRest, startDice } from './board-dice';
import { chooserOf } from './board-turns';
import { bluffOrder, bluffPlayOf } from './bluff';
import { cancelDuel, duelCategoriesLeft, pickDuelCategory } from './duel';
import {
  addPlayer,
  createGame,
  currentRound,
  fail,
  lock,
  next,
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
import { decideLadder, decisionPending } from './ladder';
import { paceWindow, stepKey, type PacedAction } from './pacing';
import { splashUntil } from './splash';
import { surveyPlayOf } from './survey';
import { trialOpen } from './survival';
import { dealTeams, rollTeamRest, setTeamForm, startTeamDice, teamsOn } from './teams';
import { timedPlay } from './timing';
import { decisionOpen, decisionsShown } from './wipeout';

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
  if (form === 'dice' && dice === null && members.some((m) => m.teamId === null)) {
    // Спершу тур кубиків; гра стартує сама, щойно він закриється (крок автопілота). Менше двох учасників → teams_few.
    const tour = startTeamDice(state);
    if (!tour.ok) return tour;
    return ok(withPilot(tour.state, (pilot) => ({ ...pilot, starting: true })));
  }
  return startNow(state, now);
}

/** Спосіб формування команд від автора: setTeamForm і starting геть (незакритий тур скасовано, тож старт після нього теж). */
export function authorTeamForm(state: GameState, form: TeamForm): Result {
  if (state.autopilot === undefined) return fail('not_allowed');
  const changed = setTeamForm(state, form);
  if (!changed.ok) return changed;
  return ok(
    withPilot(changed.state, (pilot) => {
      const { starting: _starting, ...rest } = pilot;
      return rest;
    }),
  );
}

/**
 * Пауза від автора: pause + hold 'author' (left/at ставить planAutopilot); не автопілот → not_allowed.
 * На паузі «нікого» пауза стає паузою автора (at геть, left лишається): сама гра вже не продовжиться.
 */
export function authorPause(state: GameState, now: number): Result {
  if (state.autopilot === undefined) return fail('not_allowed');
  if (state.paused && state.autopilot.hold === 'nobody') return ok(withPilot(state, (pilot) => ({ ...pilot, at: null, hold: 'author' })));
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

// ——— Коли й що робить автопілот (задача 4 плану 11g) ———

/** Крок автопілота для стану, що йде: мить за таблицею (без вікна 11b), дія 11b для затримки й сама дія функціями рушія. */
interface Move {
  at: number;
  pace: PacedAction | null;
  act: (state: GameState, now: number, rng: Rng) => Result;
}

const nextAt = (at: number): Move => ({ at, pace: 'next', act: (state, now, rng) => next(state, now, rng) });

/** Тур кубиків команд у лобі триває. */
const teamTourOn = (state: GameState): boolean => (state.teams?.dice?.tour.length ?? 0) > 0;

/** Категорія дуелі жеребом (одним викликом rng) серед тих, де лишилися запитання; таких немає — дуель скасовано. */
function pickCategory(state: GameState, now: number, rng: Rng): Result {
  const left = duelCategoriesLeft(state).filter((c) => c.left > 0);
  if (left.length === 0) return cancelDuel(state);
  const category = left[Math.min(left.length - 1, Math.floor(rng() * left.length))];
  return pickDuelCategory(state, null, category.id, now, rng);
}

/** Розкриття фіналу: запитання фіналу поточного раунду. */
function finalReveal(state: GameState): boolean {
  const play = state.plays[state.questionIndex];
  return state.final !== null && play?.final !== undefined && play.roundIndex === state.roundIndex;
}

/** Скільки триває поточний крок розкриття. */
function revealMs(state: GameState): number {
  const survey = surveyPlayOf(state);
  if (survey !== null) return survey.survey.shown < survey.question.rows.length ? AUTOPILOT_MS.row : AUTOPILOT_MS.rowsTail;
  const bluff = bluffPlayOf(state);
  if (bluff !== null) return bluff.bluff.shown < bluffOrder(bluff).length ? AUTOPILOT_MS.row : AUTOPILOT_MS.rowsTail;
  return finalReveal(state) ? AUTOPILOT_MS.finalRow : AUTOPILOT_MS.reveal;
}

/** Заставка раунду: кубики поля, перше запитання «Мільйонера» після жеребу, інакше час опису від кінця заставки раунду. */
function introMove(state: GameState, from: number): Move {
  const round = currentRound(state);
  if (round?.type === 'board' && state.board !== null) {
    if (state.board.dice === null && state.players.length >= 2) return { at: from, pace: null, act: (s) => startDice(s) };
    if (dicePending(state.board)) return { at: from + AUTOPILOT_MS.boardDice, pace: null, act: (s, _now, rng) => rollForRest(s, rng) };
  }
  if (round?.type === 'ladder' && (state.ladder?.contestantId ?? null) !== null) return nextAt(from + AUTOPILOT_MS.introDrawn);
  const shown = paceWindow(state, 'next')?.from ?? from;
  return nextAt(shown + (round === null ? AUTOPILOT_MS.intro : autopilotIntroMs(round)));
}

function leaderboardMove(state: GameState, from: number): Move | null {
  // Вікно «Ва-банк» і випробування «Вибування» закриває tick рушія.
  if (decisionOpen(state) || trialOpen(state)) return null;
  if (decisionPending(state)) return { at: from + AUTOPILOT_MS.ladderDecision, pace: null, act: (s, now) => decideLadder(s, 'host', true, now) };
  return nextAt(from + (decisionsShown(state) ? AUTOPILOT_MS.decisions : AUTOPILOT_MS.leaderboard));
}

function duelMove(state: GameState, from: number): Move | null {
  switch (state.duel?.stage) {
    case 'category':
      return { at: (splashUntil(state, 'duel') ?? from) + AUTOPILOT_MS.duelCategory, pace: null, act: pickCategory };
    case 'answer':
      return nextAt(from + AUTOPILOT_MS.duelAnswer);
    case 'result':
      return nextAt(from + AUTOPILOT_MS.duelResult);
    default:
      // Запитання дуелі закриває tickDuel.
      return null;
  }
}

/** Таблиця плану 11g, «Час етапів»: крок для стану, що йде, з підкроком від from; null — чекати нічого. */
function moveOf(state: GameState, from: number): Move | null {
  switch (state.phase) {
    case 'lobby':
      if (teamTourOn(state)) return { at: from + AUTOPILOT_MS.teamDice, pace: null, act: (s, _now, rng) => rollTeamRest(s, rng) };
      return state.autopilot?.starting === true ? { at: from, pace: null, act: (s, now) => startNow(s, now) } : null;
    case 'guide':
      return nextAt(from + AUTOPILOT_MS.guide);
    case 'intro':
      return introMove(state, from);
    case 'wager':
      return nextAt(from + AUTOPILOT_MS.wager);
    case 'question': {
      // Запитання з таймером закриває рушій (таймер чи «відповіли всі»); без таймера — автопілот через timeLimit від старту.
      const play = state.plays[state.questionIndex];
      if (play === undefined || timedPlay(play)) return null;
      const limit: unknown = play.question.timeLimit;
      const ms = typeof limit === 'number' ? limit * 1000 : AUTOPILOT_MS.untimed;
      return { at: (state.startedAt ?? from) + ms, pace: 'lock', act: (s, now) => lock(s, now) };
    }
    case 'locked':
      return nextAt(from + AUTOPILOT_MS.locked);
    case 'reveal':
      return nextAt(from + revealMs(state));
    case 'leaderboard':
      return leaderboardMove(state, from);
    case 'board':
      return { at: from + AUTOPILOT_MS.boardTurn, pace: 'skip', act: (s, now) => skipTurn(s, now) };
    case 'round_end':
      return nextAt(from + AUTOPILOT_MS.roundEnd);
    case 'duel':
      return duelMove(state, from);
    default:
      return null;
  }
}

/** Не раніше за вікно 11b дії кроку. */
const notBefore = (state: GameState, move: Move, at: number): number =>
  Math.max(at, move.pace === null ? 0 : (paceWindow(state, move.pace)?.until ?? 0));

/**
 * Ключ підкроку автопілота: stepKey + тури кубиків поля й команд (номер, чи триває) + starting + той, чий хід на полі;
 * без paused/at/left/hold. Хід на полі — бо вилучення гравця, чий хід, stepKey не змінює, а відлік ходу має початися знову.
 */
export function pilotKey(state: GameState): string {
  return [
    stepKey(state),
    state.board?.dice?.tourNo,
    dicePending(state.board),
    state.teams?.dice?.tourNo,
    teamTourOn(state),
    state.autopilot?.starting === true,
    chooserOf(state),
  ]
    .map((part) => (part === undefined || part === null ? '' : String(part)))
    .join('|');
}

/**
 * Мить наступного кроку для стану, що йде (не на паузі), якщо підкрок почався в from; null — чекати нічого (рушій сам, гравці, лобі, фініш).
 * Таблиця плану 11g, «Час етапів»; завжди ≥ paceWindow(state, дія)?.until.
 */
export function autopilotDue(state: GameState, from: number): number | null {
  const move = moveOf(state, from);
  return move === null ? null : notBefore(state, move, move.at);
}

/** Мить кроку для next, що йде: після продовження — залишок (той самий ключ) чи наново; інакше нова мить лише на зміну ключа. */
function runningAt(prev: GameState, next: GameState, now: number): number | null {
  const same = pilotKey(prev) === pilotKey(next);
  if (prev.paused) {
    // authorResume прибирає left, тож залишок — з prev.
    const left = prev.autopilot?.left;
    if (!same || left === undefined) return autopilotDue(next, now);
    const move = moveOf(next, now);
    return move === null ? null : notBefore(next, move, now + left);
  }
  return same ? (next.autopilot?.at ?? null) : autopilotDue(next, now);
}

const leftOf = (at: number | null, now: number): { left?: number } => (at === null ? {} : { left: Math.max(0, at - now) });

/**
 * Після кожної зміни стану (сервер — у commit, після stamp): пауза «нікого», відлік продовження, залишок на паузі, нова мить на зміну pilotKey.
 * Не автопілот → next без змін. Правила — план 11g, «Пауза й продовження».
 */
export function planAutopilot(prev: GameState, next: GameState, now: number): GameState {
  const pilot = next.autopilot;
  if (pilot === undefined) return next;
  if (!next.paused) {
    const at = runningAt(prev, next, now);
    if (next.phase !== 'lobby' && next.phase !== 'finished' && !anyonePresent(next)) {
      const paused = pause(next, now);
      if (paused.ok) return withPilot(paused.state, (p) => ({ ...running(p), at: null, hold: 'nobody', ...leftOf(at, now) }));
    }
    return withPilot(next, (p) => ({ ...running(p), at }));
  }
  // На паузі: щойно поставлена — залишок до кроку, що стояв; уже стояла — залишок лишається, поки підкрок той самий.
  const { left: _left, ...rest } = pilot;
  const kept = pilotKey(prev) === pilotKey(next) && pilot.left !== undefined ? { left: pilot.left } : {};
  const left = prev.paused ? kept : leftOf(pilot.at, now);
  // Пауза «нікого» і хтось на зв'язку: відлік продовження, що вже йде, не перезапускається.
  const countdown = prev.paused ? pilot.at : null;
  const at = pilot.hold === 'nobody' && anyonePresent(next) ? (countdown ?? now + AUTOPILOT_MS.resume) : null;
  return { ...next, autopilot: { ...rest, ...left, at } };
}

/**
 * Крок у мить now ≥ autopilot.at: продовження з паузи «нікого» або дія з таблиці тими самими функціями рушія, що й кнопки ведучого.
 * Завжди повертає стан з at: null (і коли дія не вдалася); now < at, at null чи не автопілот → той самий об'єкт.
 */
export function pilotStep(state: GameState, now: number, rng: Rng): GameState {
  const pilot = state.autopilot;
  if (pilot === undefined || pilot.at === null || now < pilot.at) return state;
  const idle = withPilot(state, (p) => ({ ...p, at: null }));
  if (state.paused) {
    if (pilot.hold !== 'nobody' || !anyonePresent(state)) return idle;
    // Залишок (left) поверне planAutopilot.
    const resumed = resume(idle, now);
    if (!resumed.ok) return idle;
    return withPilot(resumed.state, (p) => {
      const { hold: _hold, ...kept } = p;
      return kept;
    });
  }
  const move = moveOf(state, now);
  if (move === null) return idle;
  const done = move.act(idle, now, rng);
  return done.ok ? done.state : idle;
}
