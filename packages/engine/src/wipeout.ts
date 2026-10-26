import { LIMITS, wipeoutStandings, type Answer, type Question, type WipeoutChoice, type WipeoutStanding, type WipeoutStep } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; звертання лише під час виклику функцій.
import { autoLock, currentRound, fail, ok, recordOf, withCurrentPlay, withRecord, withTotals, type GameState, type Play, type Result, type WipeoutPlay } from './game';
import { checkAnswer } from './check';
import { presentPlayers } from './present';
import { notStarted, splashLead } from './splash';
import { timeOver } from './timing';

const EPSILON = 1e-9;

/** Скільки триває вікно «Далі / Забрати» після розкриття. */
export const WIPEOUT_DECIDE_MS = LIMITS.wipeoutDecideSeconds * 1000;

/** Чи поточний раунд — «Ва-банк». */
export function inWipeoutRound(state: GameState): boolean {
  return currentRound(state)?.type === 'wipeout';
}

/** Чи відповідь правильна для «Ва-банк»: повзунок — лише в допуску, число — у допуску, решта — як checkAnswer. */
export function wipeoutCorrect(question: Question, answer: Answer): boolean {
  if (question.type === 'slider') {
    if (answer.type !== 'slider') return false;
    const distance = Math.abs(answer.value - question.correct);
    return Number.isFinite(distance) && distance <= question.tolerance + EPSILON;
  }
  return checkAnswer(question, answer).accepted;
}

/** Скільки записів журналу закрито: відкрите запитання завжди останнє. */
function closedCount(state: GameState): number {
  return state.phase === 'question' ? state.plays.length - 1 : state.plays.length;
}

/**
 * Драбина раунду roundIndex за першими upTo записами журналу (типово — закриті запитання):
 * кроки — запитання цього раунду з правильними (grade 'correct') і took; over — Play.wipeout.end на останньому, фаза finished
 * або гра вже в пізнішому раунді.
 */
export function wipeoutTable(state: GameState, roundIndex: number = state.roundIndex, upTo: number = closedCount(state)): Record<string, WipeoutStanding> {
  const plays = state.plays.slice(0, upTo).filter((play) => play.roundIndex === roundIndex);
  const steps: WipeoutStep[] = plays.map((play) => ({
    price: play.question.points,
    correct: Object.entries(play.answers)
      .filter(([, record]) => record.grade === 'correct')
      .map(([id]) => id),
    took: play.wipeout?.took ?? [],
  }));
  const over = plays.at(-1)?.wipeout?.end === true || state.phase === 'finished' || state.roundIndex > roundIndex;
  return wipeoutStandings(
    state.players.map((p) => p.id),
    steps,
    over,
  );
}

/** Хто зараз «у грі» в поточному раунді «Ва-банк» за закритими запитаннями; поза раундом — []. */
export function wipeoutIn(state: GameState): string[] {
  if (!inWipeoutRound(state)) return [];
  const table = wipeoutTable(state);
  return state.players.filter((p) => table[p.id]?.status === 'in').map((p) => p.id);
}

/**
 * Відповідь у «Ва-банк»: not_allowed — гравець не в грі; already_answered; time_over (timeOver); type_mismatch.
 * Запис: accepted = correct, accuracy 1/0, grade correct/wrong, basePoints = points = 0, streakBonus 0; далі autoLock(now).
 */
export function submitWipeoutAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  if (!wipeoutIn(state).includes(playerId)) return fail('not_allowed');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  const play = state.plays[state.questionIndex];
  if (state.startedAt === null || timeOver(state, play, now)) return fail('time_over');
  if (play.question.type !== answer.type) return fail('type_mismatch');
  const correct = wipeoutCorrect(play.question, answer);
  return ok(
    autoLock(
      withRecord(state, playerId, {
        answer,
        timeMs: Math.max(0, now - state.startedAt),
        accepted: correct,
        accuracy: correct ? 1 : 0,
        grade: correct ? 'correct' : 'wrong',
        basePoints: 0,
        streakBonus: 0,
        points: 0,
        overridden: false,
      }),
      now,
    ),
  );
}

/**
 * Перераховує записи закритих запитань раундів «Ва-банк»: запис кроку, на якому гравець забрав чи доніс банк, — bank;
 * решта — 0; streakBonus 0. Інші раунди не чіпає (той самий об'єкт, якщо «Ва-банк» у журналі немає).
 */
export function withWipeoutPoints(state: GameState): GameState {
  const closed = closedCount(state);
  const rounds = new Set(
    state.plays.slice(0, closed).filter((play) => state.quiz.rounds[play.roundIndex]?.type === 'wipeout').map((play) => play.roundIndex),
  );
  if (rounds.size === 0) return state;
  const tables = new Map([...rounds].map((roundIndex) => [roundIndex, wipeoutTable(state, roundIndex, closed)]));
  // Номер кроку кожного запису в його раунді.
  const steps = new Map<number, number>();
  const plays = state.plays.map((play, index): Play => {
    const table = tables.get(play.roundIndex);
    if (index >= closed || table === undefined) return play;
    const step = steps.get(play.roundIndex) ?? 0;
    steps.set(play.roundIndex, step + 1);
    const answers = Object.fromEntries(
      Object.entries(play.answers).map(([id, record]) => {
        const standing = table[id];
        const cashed = standing !== undefined && standing.step === step && (standing.status === 'took' || standing.status === 'survived');
        const points = cashed ? standing.bank : 0;
        return [id, { ...record, basePoints: points, streakBonus: 0, points }];
      }),
    );
    return { ...play, answers };
  });
  return { ...state, plays };
}

/** Ставить end: true на останньому зіграному запитанні поточного раунду «Ва-банк»; інакше стан без змін. */
export function markWipeoutEnd(state: GameState): GameState {
  if (!inWipeoutRound(state)) return state;
  let index = state.plays.length - 1;
  while (index >= 0 && state.plays[index].roundIndex !== state.roundIndex) index -= 1;
  const play = state.plays[index];
  if (play?.wipeout === undefined || play.wipeout.end) return state;
  const marked: Play = { ...play, wipeout: { ...play.wipeout, end: true } };
  return { ...state, plays: state.plays.map((p, i) => (i === index ? marked : p)) };
}

/** Поточне запитання «Ва-банк» з його WipeoutPlay; інакше null. */
export function wipeoutPlayOf(state: GameState): (Play & { wipeout: WipeoutPlay }) | null {
  const play = state.plays[state.questionIndex];
  if (play?.wipeout === undefined || play.roundIndex !== state.roundIndex) return null;
  return { ...play, wipeout: play.wipeout };
}

/** Вікно рішення відкрите: етап leaderboard у «Ва-банк» з endsAt (або на паузі з remainingMs). */
export function decisionOpen(state: GameState): boolean {
  if (state.phase !== 'leaderboard' || !inWipeoutRound(state) || wipeoutPlayOf(state) === null) return false;
  return state.endsAt !== null || (state.paused && state.remainingMs !== null);
}

/** Етап leaderboard з вікном: startedAt = now, endsAt = now + WIPEOUT_DECIDE_MS, remainingMs null. */
export function openDecision(state: GameState, now: number): GameState {
  return { ...state, phase: 'leaderboard', startedAt: now, endsAt: now + WIPEOUT_DECIDE_MS, remainingMs: null };
}

/** Хто в грі й ще не вирішив у відкритому вікні (ті, хто забрав, уже не в грі). */
function undecided(state: GameState, play: Play & { wipeout: WipeoutPlay }): string[] {
  return wipeoutIn(state).filter((id) => !play.wipeout.stay.includes(id));
}

/**
 * «Далі» (take false) чи «Забрати» (take true). Помилки: wrong_phase (не вікно або його час уже сплив, з endsAt включно, як у tick), paused, not_found,
 * not_allowed (не в грі), already_answered. Рішення одне й остаточне; коли вирішили всі присутні в грі — closeDecision.
 */
export function decideWipeout(state: GameState, playerId: string, take: boolean, now: number): Result {
  const play = wipeoutPlayOf(state);
  if (play === null || !decisionOpen(state)) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (state.endsAt !== null && now >= state.endsAt) return fail('wrong_phase');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  // Хто вже забрав, за драбиною не в грі, але вирішував саме в цьому вікні.
  const decided = play.wipeout.took.includes(playerId) || play.wipeout.stay.includes(playerId);
  if (!decided && !wipeoutIn(state).includes(playerId)) return fail('not_allowed');
  if (decided) return fail('already_answered');
  const wipeout = take ? { ...play.wipeout, took: [...play.wipeout.took, playerId] } : { ...play.wipeout, stay: [...play.wipeout.stay, playerId] };
  return ok(settleDecision(withTotals(withCurrentPlay(state, { ...play, wipeout }))));
}

/**
 * Закриває вікно: невирішені в грі → took (типово «Забрати») і auto (11e: auto лише непорожній),
 * startedAt/endsAt/remainingMs null; підсумок — withTotals.
 */
export function closeDecision(state: GameState): GameState {
  const play = wipeoutPlayOf(state);
  const cleared: GameState = { ...state, startedAt: null, endsAt: null, remainingMs: null };
  if (play === null) return cleared;
  const rest = undecided(state, play);
  const took = [...play.wipeout.took, ...rest];
  const auto = rest.length === 0 ? {} : { auto: [...(play.wipeout.auto ?? []), ...rest] };
  return withTotals(withCurrentPlay(cleared, { ...play, wipeout: { ...play.wipeout, took, ...auto } }));
}

/** Екран рішень (11e): leaderboard «Ва-банк» із записом поточного запитання після закриття вікна. */
export function decisionsShown(state: GameState): boolean {
  return state.phase === 'leaderboard' && inWipeoutRound(state) && wipeoutPlayOf(state) !== null && !decisionOpen(state);
}

/** Відкритий вибір гравця в записі запитання (11e): stay → 'stay', auto → 'auto', took → 'took', інакше null. */
export function wipeoutChoiceOf(play: Play & { wipeout: WipeoutPlay }, playerId: string): WipeoutChoice | null {
  if (play.wipeout.stay.includes(playerId)) return 'stay';
  if ((play.wipeout.auto ?? []).includes(playerId)) return 'auto';
  if (play.wipeout.took.includes(playerId)) return 'took';
  return null;
}

/**
 * Закриває відкрите вікно, якщо вирішили всі присутні в грі (як autoLock для відповідей); на паузі й без присутніх у грі — ні:
 * тоді вікно закриє таймер чи ведучий.
 */
export function settleDecision(state: GameState): GameState {
  const play = wipeoutPlayOf(state);
  if (play === null || state.paused || !decisionOpen(state)) return state;
  const present = new Set(presentPlayers(state).map((p) => p.id));
  const eligible = [...wipeoutIn(state), ...play.wipeout.took].filter((id) => present.has(id));
  if (eligible.length === 0) return state;
  return undecided(state, play).some((id) => present.has(id)) ? state : closeDecision(state);
}

/**
 * Ведучий завершує раунд чи гру, поки заставка запитання «Ва-банк» ще грає (зокрема на паузі): відповісти не міг ніхто,
 * тож запитання вважається незіграним — його запис зникає з журналу, а банки лишаються, як після попереднього кроку.
 * Інакше (і без now) стан без змін.
 */
export function dropUnstarted(state: GameState, now: number | undefined): GameState {
  if (now === undefined || state.phase !== 'question' || !inWipeoutRound(state) || state.questionIndex !== state.plays.length - 1) return state;
  const splashing = notStarted(state, now) || (state.paused && splashLead(state, state.pausedAt ?? now) > 0);
  if (!splashing) return state;
  const plays = state.plays.slice(0, -1);
  return { ...state, phase: 'reveal', plays, questionIndex: plays.length - 1, startedAt: null, endsAt: null, remainingMs: null, splash: null };
}
