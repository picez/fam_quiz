import { wipeoutStandings, type Answer, type Question, type WipeoutStanding, type WipeoutStep } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; звертання лише під час виклику функцій.
import { autoLock, currentRound, fail, ok, recordOf, withRecord, type GameState, type Play, type Result, type WipeoutPlay } from './game';
import { checkAnswer } from './check';
import { timeOver } from './timing';

const EPSILON = 1e-9;

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
