import { overshootOn, rulesOf, type OvershootRow } from '@quiz/shared';
import { withPlay } from './blitz';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { type AnswerRecord, type GameState } from './game';

// «Не перебільш» (37d): числове запитання з перемикачем. Хто назвав більше за правду — перебільшив і отримує 0;
// серед решти найбільше значення (рівні в межах EPSILON — усі) бере повну ціну. Без швидкості й без мінуса.
// До закриття відповіді лежать з 0: тимчасова «правильність» видала б, що відповідач нижче за правду.

const EPSILON = 1e-9;

type NumericRecord = AnswerRecord & { answer: { type: 'numeric'; value: number } };

/** Числова відповідь запису; інакше null. */
function valueOf(record: AnswerRecord | undefined): number | null {
  return record?.answer?.type === 'numeric' && Number.isFinite(record.answer.value) ? record.answer.value : null;
}

/** Поточне запитання з noOvershoot: його правда; інакше null. */
function truthOf(state: GameState, index: number): number | null {
  const question = state.plays[index]?.question;
  return question !== undefined && overshootOn(question) && question.type === 'numeric' ? question.correct : null;
}

/** Id записів-переможців запитання: найбільші value ≤ correct (± EPSILON); [] — немає таких. Порядок state.players. */
export function overshootWinners(state: GameState, index: number): string[] {
  const correct = truthOf(state, index);
  const answers = state.plays[index]?.answers ?? {};
  if (correct === null) return [];
  const under = state.players.flatMap((player) => {
    const value = valueOf(answers[player.id]);
    return value !== null && value <= correct + EPSILON ? [{ id: player.id, value }] : [];
  });
  if (under.length === 0) return [];
  const best = Math.max(...under.map((entry) => entry.value));
  return under.filter((entry) => best - entry.value <= EPSILON).map((entry) => entry.id);
}

/**
 * На етапі question поточного запитання з noOvershoot переписує не overridden записи: переможці — повна ціна × множник раунду,
 * решта — 0 (wrong). Інакше стан той самий.
 */
export function scoreOvershoot(state: GameState): GameState {
  const play = state.plays[state.questionIndex];
  if (state.phase !== 'question' || play === undefined || truthOf(state, state.questionIndex) === null) return state;
  const winners = new Set(overshootWinners(state, state.questionIndex));
  const multiplier = rulesOf(state.quiz.rounds[play.roundIndex]).multiplier;
  const win = Math.round(play.question.points * multiplier);
  const answers: Record<string, AnswerRecord> = { ...play.answers };
  for (const [playerId, record] of Object.entries(play.answers)) {
    if (record.overridden || valueOf(record) === null) continue;
    const won = winners.has(playerId);
    const scored: AnswerRecord = {
      ...record,
      accepted: won,
      accuracy: won ? 1 : 0,
      grade: won ? 'correct' : 'wrong',
      basePoints: won ? win : 0,
      streakBonus: 0,
      points: won ? win : 0,
    };
    answers[playerId] = scored;
  }
  return withPlay(state, { ...play, answers });
}

/** Лише reveal запитання з noOvershoot; інакше undefined. Спершу не перебільшені за значенням спадно, потім перебільшені зростанно. */
export function overshootRows(state: GameState): OvershootRow[] | undefined {
  const correct = truthOf(state, state.questionIndex);
  if (state.phase !== 'reveal' || correct === null) return undefined;
  const answers = state.plays[state.questionIndex].answers;
  const rows = state.players.flatMap((player): (OvershootRow & { order: number })[] => {
    const record = answers[player.id];
    const value = valueOf(record);
    if (record === undefined || value === null) return [];
    return [{ playerId: player.id, nickname: player.nickname, value, over: value > correct + EPSILON, points: record.points, order: 0 }];
  });
  const sorted = rows
    .map((row, order) => ({ ...row, order }))
    .sort((a, b) => Number(a.over) - Number(b.over) || (a.over ? a.value - b.value : b.value - a.value) || a.order - b.order);
  return sorted.map(({ order: _order, ...row }) => row);
}
