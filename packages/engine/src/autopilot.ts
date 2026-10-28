import { AUTOPILOT_MAX_RETRIES, AUTOPILOT_MS, autopilotIntroMs, autopilotQuiz, boardCells, type ErrorCode, type Quiz, type ResumeSetup, type TeamForm } from '@quiz/shared';
import { appealOpen, appealPossible, lastAppeal } from './appeal';
import { pickCell, skipTurn } from './board';
import { dicePending, rollForRest, startDice } from './board-dice';
import { cellPlayed, chooserOf } from './board-turns';
import { bluffOrder, bluffPlayOf, removeBluffOption } from './bluff';
import { resumeError } from './carry';
import { checkAnswer } from './check';
import { cancelDuel, duelCategoriesLeft, pickDuelCategory } from './duel';
import {
  acceptAnswer,
  addPlayer,
  createGame,
  currentRound,
  fail,
  judge,
  lock,
  next,
  ok,
  override,
  pause,
  resume,
  start,
  type AutopilotState,
  type GameOptions,
  type GameState,
  type Result,
  type Rng,
} from './game';
import { pendingOf, type Pending } from './hold';
import { decideLadder, decisionPending } from './ladder';
import { paceWindow, stepKey, type PacedAction } from './pacing';
import { splashUntil } from './splash';
import { surveyPlayOf } from './survey';
import { trialOpen } from './survival';
import { dealTeams, rollTeamRest, setTeamForm, startTeamDice, teamOf, teamsOn } from './teams';
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

/** Автопілот без starting і без його resume (12r). */
function notStarting(state: GameState): GameState {
  return withPilot(state, (pilot) => {
    const { starting: _starting, resume: _resume, ...rest } = pilot;
    return rest;
  });
}

/** start із прибраним starting (гра вже йде); resume — «Продовжити гру» (12r). */
function startNow(state: GameState, now: number, resume?: ResumeSetup): Result {
  const started = start(state, now, resume);
  if (!started.ok) return started;
  return ok(notStarting(started.state));
}

/** Старт після туру кубиків команд з відкладеним resume: не вдався (teams_few після вилучення тощо) — starting геть, гра лишається в лобі. */
function startAfterTour(state: GameState, now: number): Result {
  const started = startNow(state, now, state.autopilot?.resume);
  return started.ok ? started : ok(notStarting(state));
}

/**
 * «Почати гру» від автора (правила — план 11g, «Автор»); не автопілот → not_allowed; поза лобі → wrong_phase.
 * resume — «Продовжити гру» (12r): хибні дані → помилка ще до туру кубиків; тур зберігає їх до старту після нього.
 */
export function autopilotStart(state: GameState, now: number, rng: Rng, resume?: ResumeSetup): Result {
  if (state.autopilot === undefined) return fail('not_allowed');
  if (state.phase !== 'lobby') return fail('wrong_phase');
  if (resume !== undefined) {
    const error = resumeError(state, resume);
    if (error !== null) return fail(error);
  }
  if (!teamsOn(state)) return startNow(state, now, resume);
  const { form, members, dice } = state.teams;
  if (form === 'host' || form === 'random') {
    // Розподілу ведучого немає: склад роздає жереб у мить старту, спосіб лишається тим, що вибрав автор.
    const dealt = dealTeams({ ...state, teams: { ...state.teams, form: 'random' } }, rng);
    if (!dealt.ok) return dealt;
    return startNow({ ...dealt.state, teams: { ...dealt.state.teams!, form } }, now, resume);
  }
  if (form === 'dice' && dice === null && members.some((m) => m.teamId === null)) {
    // Спершу тур кубиків; гра стартує сама, щойно він закриється (крок автопілота). Менше двох учасників → teams_few.
    const tour = startTeamDice(state);
    if (!tour.ok) return tour;
    return ok(withPilot(tour.state, (pilot) => ({ ...pilot, starting: true, ...(resume === undefined ? {} : { resume }) })));
  }
  return startNow(state, now, resume);
}

/** Спосіб формування команд від автора: setTeamForm, starting і resume геть (незакритий тур скасовано, тож старт після нього теж). */
export function authorTeamForm(state: GameState, form: TeamForm): Result {
  if (state.autopilot === undefined) return fail('not_allowed');
  const changed = setTeamForm(state, form);
  if (!changed.ok) return changed;
  return ok(notStarting(changed.state));
}

/**
 * Автор прибирає вигадку (фаза вибору блефу). Автор — гравець, що набирає бали: прибирати вигадки до свого вибору він не може
 * (інакше лишилася б правда). Тож до вибору автора (у командній грі — його команди) будь-який варіант → pick_first, однаково
 * для правди й вигадок; варіант, який хтось уже вибрав (і сам автор), → not_allowed (вибір не знімається); далі — removeBluffOption.
 */
export function authorRemoveBluff(state: GameState, optionId: string): Result {
  const pilot = state.autopilot;
  if (pilot === undefined) return fail('not_allowed');
  const play = bluffPlayOf(state);
  if (state.phase !== 'question' || play === null || play.bluff.stage !== 'choice') return fail('wrong_phase');
  const picker = teamsOn(state) ? teamOf(state, pilot.authorId) : pilot.authorId;
  if (picker === null || !Object.hasOwn(play.bluff.picks, picker)) return fail('pick_first');
  // Вибраний варіант (свій чи чужий) не прибирається: чужий вибір не знімається, і ніхто не вибирає вдруге.
  if (Object.values(play.bluff.picks).some((pick) => pick.optionId === optionId)) return fail('not_allowed');
  return removeBluffOption(state, optionId);
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

/**
 * Для suspend: гра, що йшла (wasPaused false, не лобі й не фініш) → hold 'nobody', left = max(0, at − savedAt), at null; уже на паузі → at null;
 * лобі → at null (тур кубиків чи старт після нього planAutopilot спланує наново, щойно хтось повернеться); фініш — без змін.
 */
export function suspendAutopilot(state: GameState, savedAt: number, wasPaused: boolean): GameState {
  if (state.phase === 'finished') return state;
  if (state.phase === 'lobby') return withPilot(state, (pilot) => ({ ...pilot, at: null }));
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
  const at = shown + (round === null ? AUTOPILOT_MS.intro : autopilotIntroMs(round));
  // Кубики поля вже кинуто: результат видно щонайменше diceShown після закриття туру.
  const dice = round?.type === 'board' && (state.board?.dice ?? null) !== null;
  return nextAt(dice ? Math.max(at, from + AUTOPILOT_MS.diceShown) : at);
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

/** Ходи поля, пропущені автопілотом поспіль з останньої вибраної клітинки (будь-яка нова клітинка дає новий запис у plays). */
function skipsInRow(state: GameState): number {
  const pilot = state.autopilot;
  return pilot?.skips !== undefined && pilot.skipPlays === state.plays.length ? pilot.skips : 0;
}

/**
 * Хід на полі через 30 с: skipTurn. Щоб поле з гравцями, що мовчать, не крутилося без кінця: коли поспіль пропущено
 * стільки ходів, скільки людей у колі, клітинку тому, чий хід, вибирає жереб (pickCell від ведучого, by null).
 */
function boardTurnMove(state: GameState, now: number, rng: Rng): Result {
  const round = currentRound(state);
  const circle = state.board?.circle.length ?? 0;
  const skips = skipsInRow(state);
  const open = round?.type === 'board' ? boardCells(round).filter(({ cell }) => !cellPlayed(state, cell.question.id)) : [];
  if (round?.type === 'board' && circle > 0 && skips >= circle && open.length > 0) {
    const cell = open[Math.min(open.length - 1, Math.floor(rng() * open.length))].cell;
    return pickCell(state, null, cell.question.id, now, rng);
  }
  const skipped = skipTurn(state, now);
  if (!skipped.ok) return skipped;
  return ok(withPilot(skipped.state, (pilot) => ({ ...pilot, skips: skips + 1, skipPlays: skipped.state.plays.length })));
}

/**
 * Відповідь, що чекає ведучого, — за ключем тими самими функціями, що й кнопки пульта: «Прийняти» (автоматична перевірка,
 * «100 до 1»); ручна перевірка бліцу (і бліц-клітинки) — оцінка голови черги judge; ручна перевірка клітинки поля — override.
 */
function judgeByKey(state: GameState, pending: Pending, now: number): Result {
  const accepted = acceptAnswer(state, pending.playerId, now);
  if (accepted.ok) return accepted;
  const play = state.plays[state.questionIndex];
  if (play === undefined) return accepted;
  const accuracy = checkAnswer(play.question, pending.answer).accuracy;
  if (play.blitz !== undefined) return judge(state, pending.playerId, accuracy === 1, now);
  if (accuracy >= 1) return override(state, pending.playerId, 'correct', now);
  // Частково — лише за правилом раунду (partial_disabled → неправильно).
  const partial = accuracy > 0 ? override(state, pending.playerId, 'partial', now) : null;
  return partial?.ok === true ? partial : override(state, pending.playerId, 'wrong', now);
}

/** Таблиця плану 11g, «Час етапів»: крок для стану, що йде, з підкроком від from; null — чекати нічого. */
function moveOf(state: GameState, from: number): Move | null {
  switch (state.phase) {
    case 'lobby':
      if (teamTourOn(state)) return { at: from + AUTOPILOT_MS.teamDice, pace: null, act: (s, _now, rng) => rollTeamRest(s, rng) };
      return state.autopilot?.starting === true ? { at: from, pace: null, act: (s, now) => startAfterTour(s, now) } : null;
    case 'guide':
      return nextAt(from + AUTOPILOT_MS.guide);
    case 'intro':
      return introMove(state, from);
    case 'wager':
      return nextAt(from + AUTOPILOT_MS.wager);
    case 'question': {
      // Запитання з таймером закриває рушій (таймер чи «відповіли всі»); без таймера — автопілот через timeLimit від старту.
      // Відповідь, що чекала б «Прийняти» ведучого (поле, бліц за ключем), автопілот приймає одразу (розділ 11 п. 3).
      const pending = pendingOf(state);
      if (pending !== null) return { at: from, pace: null, act: (s, now) => judgeByKey(s, pending, now) };
      const play = state.plays[state.questionIndex];
      if (play === undefined || timedPlay(play)) return null;
      const limit: unknown = play.question.timeLimit;
      const ms = typeof limit === 'number' ? limit * 1000 : AUTOPILOT_MS.untimed;
      return { at: (state.startedAt ?? from) + ms, pace: 'lock', act: (s, now) => lock(s, now) };
    }
    case 'locked':
      return nextAt(from + AUTOPILOT_MS.locked);
    case 'reveal': {
      // Апеляція (12f): голосування закриває tick рушія; після рішення — ще appealShown; поки хтось може оскаржити — не менше appealWindow від початку розкриття.
      if (appealOpen(state) !== null) return null;
      // Скасована апеляція картки не має (appealView): показувати нема чого, розкриття йде своїм часом.
      const last = lastAppeal(state);
      const decided = last !== null && last.outcome !== 'cancelled';
      const base = from + (decided ? AUTOPILOT_MS.appealShown : revealMs(state));
      // appealPossible читається лише тут, а мить перераховується тільки на зміну pilotKey (відкриття, рішення апеляції тощо):
      // якщо можливість оскаржити зникне інакше (хтось вийшов зі зв'язку), вікно, що вже стоїть, лишається — це лише кілька зайвих секунд.
      const window = appealPossible(state) ? (state.stepAt ?? from) + AUTOPILOT_MS.appealWindow : 0;
      return nextAt(Math.max(base, window));
    }
    case 'leaderboard':
      return leaderboardMove(state, from);
    case 'board':
      return { at: from + AUTOPILOT_MS.boardTurn, pace: 'skip', act: boardTurnMove };
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

/** Підкрок апеляції (12f): кількість апеляцій на поточному запитанні й рішення останньої ('open' — відкрита). */
function appealKey(state: GameState): string {
  if (state.phase !== 'reveal') return '';
  const here = (state.appeals ?? []).filter((a) => a.questionIndex === state.questionIndex);
  const last = here.at(-1);
  return last === undefined ? '' : `${here.length}:${last.outcome ?? 'open'}`;
}

/**
 * Ключ підкроку автопілота: stepKey + тури кубиків поля й команд (номер, чи триває) + starting + той, чий хід на полі
 * + чия відповідь чекає «Прийняти» і скільки спроб бліцу розглянуто (відповідь на полі ставить утримання, stepKey його не бачить)
 * + апеляція на розкритті (12f: відкриття й рішення починають новий відлік); без paused/at/left/hold. Хід на полі — бо вилучення гравця, чий хід, stepKey не змінює, а відлік ходу має початися знову.
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
    pendingOf(state)?.playerId,
    state.plays[state.questionIndex]?.blitz?.attempts.length,
    appealKey(state),
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
    const kept = runningAt(prev, next, now);
    // Лобі без миті (відновлене після перезапуску): план наново, щойно хтось на зв'язку.
    const at = kept === null && next.phase === 'lobby' && anyonePresent(next) ? autopilotDue(next, now) : kept;
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

/** Крок автопілота й помилка дії, коли та не вдалася (сервер її записує в журнал). */
export interface PilotStep {
  state: GameState;
  error: ErrorCode | null;
}

/** Автопілот без лічильника повторів (крок вдався). */
function noRetries(state: GameState): GameState {
  return withPilot(state, (pilot) => {
    const { retries: _retries, ...rest } = pilot;
    return rest;
  });
}

/**
 * Рушій відхилив крок: повтор через AUTOPILOT_MS.retry (той самий підкрок, тож planAutopilot мить лишає), retries + 1.
 * Після AUTOPILOT_MAX_RETRIES повторів поспіль — пауза автора (hold 'author', at null, лічильник геть; пауза «нікого» лишає залишок):
 * далі гру веде автор, а сервер знімає її за 10 хв без автора й закінчує за 30 хв без нікого.
 */
function retryLater(state: GameState, now: number, error: ErrorCode): PilotStep {
  const retries = (state.autopilot?.retries ?? 0) + 1;
  if (retries > AUTOPILOT_MAX_RETRIES) {
    const held = state.paused ? ok(state) : pause(state, now);
    if (held.ok) {
      const pilot = withPilot(held.state, (p) => {
        const { retries: _retries, left, ...rest } = p;
        return { ...rest, ...(state.paused && left !== undefined ? { left } : {}), at: null, hold: 'author' as const };
      });
      return { state: pilot, error };
    }
  }
  return { state: withPilot(state, (p) => ({ ...p, at: now + AUTOPILOT_MS.retry, retries: Math.min(retries, AUTOPILOT_MAX_RETRIES) })), error };
}

/**
 * Крок у мить now ≥ autopilot.at: продовження з паузи «нікого» або дія з таблиці тими самими функціями рушія, що й кнопки ведучого.
 * Відхилене рушієм (дія чи продовження) — retryLater з помилкою в error: гра не стає й не крутиться без пауз.
 * Інакше at: null (нову мить ставить planAutopilot) і лічильник повторів геть. now < at, at null чи не автопілот → той самий об'єкт.
 */
export function pilotTry(state: GameState, now: number, rng: Rng): PilotStep {
  const pilot = state.autopilot;
  if (pilot === undefined || pilot.at === null || now < pilot.at) return { state, error: null };
  const idle = withPilot(state, (p) => ({ ...p, at: null }));
  if (state.paused) {
    if (pilot.hold !== 'nobody' || !anyonePresent(state)) return { state: idle, error: null };
    // Залишок (left) поверне planAutopilot.
    const resumed = resume(idle, now);
    if (!resumed.ok) return retryLater(state, now, resumed.error);
    const kept = withPilot(resumed.state, (p) => {
      const { hold: _hold, ...rest } = p;
      return rest;
    });
    return { state: noRetries(kept), error: null };
  }
  const move = moveOf(state, now);
  if (move === null) return { state: noRetries(idle), error: null };
  const done = move.act(idle, now, rng);
  if (done.ok) return { state: noRetries(done.state), error: null };
  return retryLater(state, now, done.error);
}

/** pilotTry без помилки. */
export function pilotStep(state: GameState, now: number, rng: Rng): GameState {
  return pilotTry(state, now, rng).state;
}
