import { ACHIEVEMENTS, cluesAt, FACT_LIMITS, isSelfPaced, isWin, surveyHitsOf, type AchievementId } from '@quiz/shared';
import { checkAnswer } from '@quiz/engine';
import type { AchievementGame, AchievementQuestion, AchievementRow } from './achievement-games';
import { PENALTY_ATTEMPT } from './db/schema';

/** Пороги ігрових ачівок (12i). */
export const ACHIEVEMENT_LIMITS = {
  fastMs: 2000,
  fastTenMs: 3000,
  fastTen: 10,
  lastSecondMs: 1000,
  sniperShare: 0.9,
  sniperQuestions: 10,
  bluffFooled: 3,
  bluffsAll: 3,
  boardCells: 5,
  buffs: 4,
  debuffed: 3,
  marathon: 50,
  nightEnd: 5,
  morning: [5, 8],
} as const;

/** За кого рахуємо: participantId — учасник таблиці; personId — рядок людини в командній грі (null — соло). */
export interface AchievementWho {
  participantId: string;
  personId: string | null;
}

const EPSILON = 1e-9;

/** Свої рядки: соло — рядки учасника; людина команди — рядки команди, де відповідала вона (без answeredBy — нічиї). */
function ownRows(game: AchievementGame, who: AchievementWho): AchievementRow[] {
  return game.rows.filter((r) => r.participantId === who.participantId && (who.personId === null || r.answeredBy === who.personId));
}

/** Рядок-відповідь: спроба, а не штраф. */
const answerRow = (row: AchievementRow) => row.attempt >= 0;

/** Мовчання з «Ризиком»: штраф за невідповідь під бафом. */
const silentRisk = (row: AchievementRow) => row.attempt === PENALTY_ATTEMPT && row.buff === 'risk';

let kyivFormat: Intl.DateTimeFormat | undefined;

/** Година за київським часом (0–23). */
export function kyivHour(date: Date): number {
  if (kyivFormat === undefined) {
    const options = { hour: '2-digit', hourCycle: 'h23' } as const;
    try {
      kyivFormat = new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'Europe/Kyiv' });
    } catch (error) {
      // Старіший ICU знає лише давню назву поясу.
      if (!(error instanceof RangeError)) throw error;
      kyivFormat = new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'Europe/Kiev' });
    }
  }
  return Number(kyivFormat.format(date)) % 24;
}

/** Ачівки однієї завершеної гри (26 ігрових, «Рішення плану»); незавершена гра — []. Порядок — як у ACHIEVEMENTS. */
export function gameAchievements(game: AchievementGame, who: AchievementWho): AchievementId[] {
  if (game.status !== 'finished') return [];
  const L = ACHIEVEMENT_LIMITS;
  const questions = new Map(game.questions.map((q) => [q.index, q]));
  const own = ownRows(game, who);
  const answers = own.filter(answerRow);
  const accepted = answers.filter((r) => r.accepted);
  /** Прийняті свої рядки зі справжнім часом. */
  const timed = accepted.flatMap((r) => {
    const limitMs = questions.get(r.questionIndex)?.limitMs ?? null;
    return limitMs === null ? [] : [{ row: r, limitMs }];
  });
  /** Свій рядок на основному запитанні (не запасному) з питанням зі знімка. */
  const onMain = (r: AchievementRow): AchievementQuestion['question'] | null => (r.spareId === null ? (questions.get(r.questionIndex)?.question ?? null) : null);
  const got = new Set<AchievementId>();

  if (timed.some(({ row }) => row.timeMs > 0 && row.timeMs < L.fastMs)) got.add('fast_answer');
  if (new Set(timed.filter(({ row }) => row.timeMs > 0 && row.timeMs < L.fastTenMs).map(({ row }) => row.questionIndex)).size >= L.fastTen) got.add('fast_10');
  if (timed.some(({ row, limitMs }) => row.timeMs <= limitMs && limitMs - row.timeMs <= L.lastSecondMs)) got.add('last_second');

  // Снайпер: свої запитання — з відповіддю чи мовчанням «Ризику»; соло ще й мовчання на запитаннях з балами в класиці й фіналі.
  const asked = new Set(own.filter((r) => answerRow(r) || silentRisk(r)).map((r) => r.questionIndex));
  if (who.personId === null) {
    for (const q of game.questions) {
      if (q.scored && (q.roundType === 'classic' || q.roundType === 'final') && q.cell === null && !q.blitz) asked.add(q.index);
    }
  }
  const right = new Set(accepted.map((r) => r.questionIndex));
  if (asked.size >= L.sniperQuestions && right.size >= L.sniperShare * asked.size - EPSILON) got.add('sniper');

  if (
    accepted.some((r) => {
      const question = onMain(r);
      return question?.type === 'pin' && r.payload?.type === 'pin' && checkAnswer(question, r.payload).accuracy >= 1 - EPSILON;
    })
  )
    got.add('eagle_eye');
  if (
    answers.some((r) => {
      const question = onMain(r);
      return (
        (question?.type === 'slider' && r.payload?.type === 'slider' && Math.abs(r.payload.value - question.correct) <= EPSILON) ||
        (question?.type === 'numeric' && r.payload?.type === 'numeric' && Math.abs(r.payload.value - question.correct) <= EPSILON)
      );
    })
  )
    got.add('jeweler');
  if (
    accepted.some((r) => {
      const question = onMain(r);
      if (question?.type !== 'clues') return false;
      if (r.clue !== null) return r.clue === 1;
      // Старий рядок без номера підказки: відновлюємо його лише з таймера підказок поза полем.
      return !isSelfPaced(question) && questions.get(r.questionIndex)?.cell === null && cluesAt(question, r.timeMs) === 1;
    })
  )
    got.add('clairvoyant');
  if (
    answers.some((r) => {
      const question = onMain(r);
      const hits = surveyHitsOf(r.payload);
      if (question?.type !== 'survey' || hits === null) return false;
      const board = questions.get(r.questionIndex)?.ref.surveyRows ?? question.rows;
      // Перший рядок з найбільшою популярністю.
      const top = board.reduce<(typeof board)[number] | undefined>((best, row) => (best === undefined || row.popularity > best.popularity ? row : best), undefined);
      return top !== undefined && hits.includes(top.id);
    })
  )
    got.add('survey_top');

  // Самотня зірка: основні перші спроби всіх учасників на запитанні з балами поза бліцом і полем.
  const mine = new Set(own);
  for (const q of game.questions) {
    if (!q.scored || q.blitz || q.cell !== null) continue;
    const main = game.rows.filter((r) => r.questionIndex === q.index && r.attempt === 0 && r.spareId === null);
    if (new Set(main.map((r) => r.participantId)).size < FACT_LIMITS.geniusAnswers) continue;
    const correct = main.filter((r) => r.accepted);
    if (correct.length === 1 && mine.has(correct[0])) {
      got.add('lone_genius');
      break;
    }
  }

  const player = game.players.find((p) => p.participantId === who.participantId);
  if (
    game.teams &&
    player !== undefined &&
    isWin({ status: game.status, rank: player.rank, score: player.score, playerCount: game.players.length, correct: 0, questionsPlayed: 0 })
  )
    got.add('team_win');
  if (game.finishedAt !== null && kyivHour(game.finishedAt) < L.nightEnd) got.add('night_owl');
  const startHour = kyivHour(game.startedAt);
  if (startHour >= L.morning[0] && startHour < L.morning[1]) got.add('early_bird');
  if (game.questionsPlayed >= L.marathon) got.add('marathon');

  return ACHIEVEMENTS.filter((id) => got.has(id));
}
