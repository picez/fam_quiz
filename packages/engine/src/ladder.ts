import { hallPoints, ladderPrize, LIFELINES, type Answer, type LadderOutcomeKind, type LadderRound, type LifelineKind } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; звертання лише під час виклику функцій.
import {
  autoLock,
  currentRound,
  fail,
  ok,
  recordOf,
  withCurrentPlay,
  withRecord,
  type GameState,
  type LadderOutcome,
  type LadderPlay,
  type Play,
  type Result,
  type Rng,
} from './game';
import { addAdjustment } from './adjust';
import { AUDIENCE_MS, pickRemoved } from './buffs';
import { checkAnswer } from './check';
import { presentPlayers } from './present';
import { notStarted } from './splash';
import { grantOvertime, timedPlay, timeOverFor } from './timing';

/** Чи поточний раунд — «Мільйонер». */
export function inLadderRound(state: GameState): boolean {
  return currentRound(state)?.type === 'ladder';
}

/** Поточний раунд «Мільйонер»; інакше null. */
function ladderRoundOf(state: GameState): LadderRound | null {
  const round = currentRound(state);
  return round?.type === 'ladder' ? round : null;
}

/** Поточне запитання «Мільйонера» з його LadderPlay; інакше null. */
export function ladderPlayOf(state: GameState): (Play & { ladder: LadderPlay }) | null {
  const play = state.plays[state.questionIndex];
  if (play?.ladder === undefined || play.roundIndex !== state.roundIndex) return null;
  return { ...play, ladder: play.ladder };
}

/** Учасник поточного раунду «Мільйонер»; null — не вибрано, вилучено або не той раунд. */
export function contestantOf(state: GameState): string | null {
  if (!inLadderRound(state)) return null;
  const id = state.ladder?.contestantId ?? null;
  return id !== null && state.players.some((p) => p.id === id) ? id : null;
}

/** Ведучий вибирає учасника на intro: wrong_phase, paused, not_found, target_offline. */
export function pickContestant(state: GameState, playerId: string): Result {
  if (state.phase !== 'intro' || !inLadderRound(state)) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (!presentPlayers(state).some((p) => p.id === playerId)) return fail('target_offline');
  return ok({ ...state, ladder: { contestantId: playerId, drawn: false } });
}

/**
 * «Далі» на intro без учасника: pick 'host' → ladder_pick; random — rng серед присутніх; lowest — найменший рахунок серед присутніх,
 * рівні — rng. Рівно один виклик rng. Присутніх немає → no_players. drawn: true, етап intro.
 */
export function drawContestant(state: GameState, rng: Rng): Result {
  const round = ladderRoundOf(state);
  if (round === null || state.phase !== 'intro') return fail('wrong_phase');
  if (round.pick === 'host') return fail('ladder_pick');
  const present = presentPlayers(state);
  if (present.length === 0) return fail('no_players');
  const lowest = Math.min(...present.map((p) => p.score));
  const candidates = round.pick === 'lowest' ? present.filter((p) => p.score === lowest) : present;
  // Один виклик rng і без нічиєї: перебіг детермінований для тестів і e2e.
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return ok({ ...state, ladder: { contestantId: candidates[index].id, drawn: true } });
}

/** Відповіді глядачів (усіх, крім учасника) на запис. */
function hallAnswers(play: Play & { ladder: LadderPlay }): Record<string, Answer> {
  return Object.fromEntries(
    Object.entries(play.answers)
      .filter(([id, record]) => id !== play.ladder.contestantId && record.answer !== null)
      .map(([id, record]) => [id, record.answer as Answer]),
  );
}

/** Закриває голосування залу поточного запитання: ballots — відповіді глядачів у цю мить; без відкритого голосування — стан без змін. */
export function closeAudience(state: GameState): GameState {
  const play = ladderPlayOf(state);
  const audience = play?.ladder.lifelines.audience;
  if (play === null || audience === undefined || audience.closed) return state;
  const lifelines = { ...play.ladder.lifelines, audience: { ...audience, closed: true, ballots: hallAnswers(play) } };
  return withCurrentPlay(state, { ...play, ladder: { ...play.ladder, lifelines } });
}

/** Присутні глядачі (без учасника). */
function presentHall(state: GameState, contestantId: string): string[] {
  return presentPlayers(state)
    .map((p) => p.id)
    .filter((id) => id !== contestantId);
}

/** Голосування залу відкрите: є audience, closed false. */
export function audienceOpen(state: GameState): boolean {
  return ladderPlayOf(state)?.ladder.lifelines.audience?.closed === false;
}

/** Закриває відкрите голосування, якщо відповіли всі присутні глядачі; на паузі — ні. */
export function settleAudience(state: GameState): GameState {
  const play = ladderPlayOf(state);
  if (state.paused || play === null || play.ladder.lifelines.audience?.closed !== false) return state;
  const hall = presentHall(state, play.ladder.contestantId);
  return hall.every((id) => recordOf(state, state.questionIndex, id) !== undefined) ? closeAudience(state) : state;
}

/**
 * Відповідь у «Мільйонері»: already_answered; глядач після закриття голосування залу → vote_closed; time_over; type_mismatch.
 * Учасник: запис з checkAnswer, points 0; закриває голосування залу (closeAudience). Глядач: points = correct ? hallPoints(level) : 0.
 * Потім settleAudience (останній присутній глядач закриває голосування) і autoLock(now).
 */
export function submitLadderAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  const play = ladderPlayOf(state);
  if (play === null) return fail('wrong_phase');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  const isContestant = playerId === play.ladder.contestantId;
  if (!isContestant && play.ladder.lifelines.audience?.closed === true) return fail('vote_closed');
  if (state.startedAt === null || timeOverFor(state, play, playerId, now)) return fail('time_over');
  if (play.question.type !== answer.type) return fail('type_mismatch');
  // Варіант, прибраний 50/50, неправильний і так: checkAnswer приймає лише правильний.
  const correct = checkAnswer(play.question, answer).accuracy === 1;
  // Учасник виграє суму рівня коригуванням, а не балами за відповідь; зал — 10 % рівня без правил раунду.
  const points = !isContestant && correct ? hallPoints(play.ladder.level) : 0;
  const recorded = withRecord(state, playerId, {
    answer,
    timeMs: Math.max(0, now - state.startedAt),
    accepted: correct,
    accuracy: correct ? 1 : 0,
    grade: correct ? 'correct' : 'wrong',
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  });
  return ok(autoLock(settleAudience(isContestant ? closeAudience(recorded) : recorded), now));
}

/** Учасник відповів і відповіли всі присутні глядачі; учасника немає серед присутніх — false (закриє ведучий чи таймер). */
export function ladderAnswered(state: GameState): boolean {
  const play = ladderPlayOf(state);
  if (play === null) return false;
  const present = presentPlayers(state).map((p) => p.id);
  if (!present.includes(play.ladder.contestantId)) return false;
  return present.every((id) => recordOf(state, state.questionIndex, id) !== undefined);
}

/** Скільки сходинок пройдено: записи раунду з grade 'correct' учасника поспіль від першого; includeCurrent — разом із поточним записом. */
export function passedSteps(state: GameState, includeCurrent: boolean): number {
  const upTo = includeCurrent ? state.questionIndex + 1 : state.questionIndex;
  let count = 0;
  for (const play of state.plays.slice(0, upTo)) {
    if (play.roundIndex !== state.roundIndex || play.ladder === undefined) continue;
    const id = play.ladder.contestantId;
    if (!Object.hasOwn(play.answers, id) || play.answers[id].grade !== 'correct') break;
    count += 1;
  }
  return count;
}

/** Підсумок виду kind після passed сходинок з виграшем за рівнями раунду. */
function outcomeOf(round: LadderRound, kind: LadderOutcomeKind, passed: number): LadderOutcome {
  return { kind, passed, points: ladderPrize(round.levels, round.safe, passed, kind) };
}

/**
 * Результат розкритого запитання: учасника немає — stopped (0); правильно й не остання — null (рішення);
 * правильно й остання — top; неправильно чи мовчання — wrong.
 */
function revealedOutcome(state: GameState, round: LadderRound, play: Play & { ladder: LadderPlay }): LadderOutcome | null {
  const { contestantId, step } = play.ladder;
  if (!state.players.some((p) => p.id === contestantId)) return { kind: 'stopped', passed: passedSteps(state, false), points: 0 };
  const correct = recordOf(state, state.questionIndex, contestantId)?.grade === 'correct';
  if (!correct) return outcomeOf(round, 'wrong', step);
  return step >= round.questions.length - 1 ? outcomeOf(round, 'top', step + 1) : null;
}

/**
 * «Далі» після розкриття: етап leaderboard; правильно й не остання — рішення відкрите; правильно й остання — top;
 * неправильно чи мовчання — wrong; учасника немає — stopped (0). Підсумок → awardLadder.
 */
export function settleStep(state: GameState, now: number): GameState {
  const board: GameState = { ...state, phase: 'leaderboard', startedAt: null, endsAt: null, remainingMs: null };
  const round = ladderRoundOf(state);
  const play = ladderPlayOf(state);
  if (round === null || play === null || play.ladder.outcome !== null) return board;
  const outcome = revealedOutcome(state, round, play);
  return outcome === null ? board : awardLadder(board, outcome, now);
}

/** Рішення відкрите: етап leaderboard «Мільйонера», decision null, outcome null. */
export function decisionPending(state: GameState): boolean {
  const play = ladderPlayOf(state);
  return state.phase === 'leaderboard' && play !== null && play.ladder.decision === null && play.ladder.outcome === null;
}

/** «Граю далі» (take false) чи «Забрати» (take true); by — id гравця або 'host'. Помилки: wrong_phase, paused, not_allowed, already_answered. */
export function decideLadder(state: GameState, by: string, take: boolean, now: number): Result {
  const round = ladderRoundOf(state);
  const play = ladderPlayOf(state);
  if (round === null || play === null || state.phase !== 'leaderboard') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (by !== 'host' && by !== play.ladder.contestantId) return fail('not_allowed');
  if (play.ladder.decision !== null) return fail('already_answered');
  // Підсумок без рішення (помилка, верх, вилучення): рішення не пропонувалось.
  if (play.ladder.outcome !== null) return fail('wrong_phase');
  const decided = withCurrentPlay(state, { ...play, ladder: { ...play.ladder, decision: take ? 'take' : 'go' } });
  return ok(take ? awardLadder(decided, outcomeOf(round, 'took', play.ladder.step + 1), now) : decided);
}

/** Ставить outcome на поточному записі раунду й додає коригування 'ladder' (points > 0, учасник є, ще не додано в цьому раунді). */
export function awardLadder(state: GameState, outcome: LadderOutcome, now: number): GameState {
  const play = ladderPlayOf(state);
  if (play === null) return state;
  // Підсумок фіксується раз: повторний виклик нічого не змінює.
  const marked = play.ladder.outcome !== null ? state : withCurrentPlay(state, { ...play, ladder: { ...play.ladder, outcome } });
  const paid = state.adjustments.some((a) => a.source === 'ladder' && a.roundIndex === state.roundIndex);
  const { contestantId } = play.ladder;
  if (paid || outcome.points <= 0 || !state.players.some((p) => p.id === contestantId)) return marked;
  return addAdjustment(marked, contestantId, outcome.points, now, 'ladder');
}

/**
 * Ведучий завершує раунд чи гру: підсумок, якщо його ще немає. Відкрите запитання для учасника не рахується (stopped);
 * закрите чи розкрите — як після розкриття (правильна й не остання — stopped з цією сходинкою); рішення відкрите — took.
 * Поза драбиною (зокрема на intro) — стан без змін.
 */
export function stopLadder(state: GameState, now: number): GameState {
  const round = ladderRoundOf(state);
  const play = ladderPlayOf(state);
  if (round === null || play === null || play.ladder.outcome !== null) return state;
  const { step } = play.ladder;
  if (state.phase === 'question') return awardLadder(state, outcomeOf(round, 'stopped', passedSteps(state, false)), now);
  if (state.phase === 'locked' || state.phase === 'reveal') {
    return awardLadder(state, revealedOutcome(state, round, play) ?? outcomeOf(round, 'stopped', step + 1), now);
  }
  if (state.phase === 'leaderboard') {
    // Учасник забирає те, що вже має; «Граю далі» без відкритого запитання — те саме, але як зупинка.
    return awardLadder(state, outcomeOf(round, play.ladder.decision === 'go' ? 'stopped' : 'took', step + 1), now);
  }
  return state;
}

/** Підказки, уже використані на драбині поточного раунду (у порядку LIFELINES). */
export function lifelinesUsed(state: GameState): LifelineKind[] {
  const used = new Set(
    state.plays.flatMap((play) => (play.roundIndex === state.roundIndex && play.ladder !== undefined ? Object.keys(play.ladder.lifelines) : [])),
  );
  return LIFELINES.filter((kind) => used.has(kind));
}

/**
 * Учасник бере підказку. Помилки за порядком: wrong_phase, not_found, not_allowed (не учасник або не ввімкнено), buff_used,
 * paused, not_started, already_answered, time_over, buff_unfit (зал без присутніх глядачів).
 * fifty — pickRemoved(question, rng); audience — endsAt = now + AUDIENCE_MS, за timedPlay — grantOvertime(учасник, AUDIENCE_MS);
 * hint — text = question.hint ?? null. Кілька підказок на одне запитання можна. Бафи вікторини тут не важать.
 */
export function useLifeline(state: GameState, playerId: string, kind: LifelineKind, now: number, rng: Rng): Result {
  const round = ladderRoundOf(state);
  const play = state.phase === 'question' ? ladderPlayOf(state) : null;
  if (round === null || play === null) return fail('wrong_phase');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (playerId !== play.ladder.contestantId || !round.lifelines.includes(kind)) return fail('not_allowed');
  if (lifelinesUsed(state).includes(kind)) return fail('buff_used');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (timeOverFor(state, play, playerId, now)) return fail('time_over');
  if (kind === 'audience' && presentHall(state, playerId).length === 0) return fail('buff_unfit');
  const lifelines = { ...play.ladder.lifelines };
  if (kind === 'fifty') lifelines.fifty = { removed: pickRemoved(play.question, rng), at: now };
  if (kind === 'audience') lifelines.audience = { endsAt: now + AUDIENCE_MS, closed: false, ballots: {}, at: now };
  if (kind === 'hint') lifelines.hint = { text: play.question.hint ?? null, aloud: false, at: now };
  const taken = withCurrentPlay(state, { ...play, ladder: { ...play.ladder, lifelines } });
  // Поки зал голосує, учасник не втрачає часу: +15 с особистого, як баф 8b. Без таймера часу немає.
  const granted = kind === 'audience' && timedPlay(play) ? grantOvertime(taken, playerId, AUDIENCE_MS) : taken;
  // Відповіді залу, що вже були, — теж голоси: якщо відповіли всі присутні, голосування одразу закривається.
  return ok(kind === 'audience' ? settleAudience(granted) : granted);
}

/** Ведучий відповідає на запит підказки учасника: text або null («уголос»); not_found — немає запиту, що чекає. Пауза не заважає. */
export function giveLadderHint(state: GameState, playerId: string, text: string | null): Result {
  const play = state.phase === 'question' ? ladderPlayOf(state) : null;
  if (play === null) return fail('wrong_phase');
  const hint = play.ladder.lifelines.hint;
  // Немає запиту, що чекає: уже підказано, підказка з редактора або гравець не учасник.
  if (playerId !== play.ladder.contestantId || hint === undefined || hint.text !== null || hint.aloud) return fail('not_found');
  const lifelines = { ...play.ladder.lifelines, hint: { ...hint, text, aloud: text === null } };
  return ok(withCurrentPlay(state, { ...play, ladder: { ...play.ladder, lifelines } }));
}

/** Після паузи: endsAt відкритого голосування залу зсувається на shiftMs. */
export function shiftLadderClocks(state: GameState, shiftMs: number): GameState {
  const play = ladderPlayOf(state);
  const audience = play?.ladder.lifelines.audience;
  if (play === null || audience === undefined || audience.closed || shiftMs === 0) return state;
  const lifelines = { ...play.ladder.lifelines, audience: { ...audience, endsAt: audience.endsAt + shiftMs } };
  return withCurrentPlay(state, { ...play, ladder: { ...play.ladder, lifelines } });
}
