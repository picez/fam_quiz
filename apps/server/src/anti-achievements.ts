import { AWAY_MS, isLastPlace, wipeoutStandings, type AchievementId } from '@quiz/shared';
import type { AchievementGame, AchievementRow } from './achievement-games';
import { answerRow, groupRounds, ownRows, participantRows, silentRisk } from './achievement-rows';
import { PENALTY_ATTEMPT } from './db/schema';
import type { AchievementWho } from './game-achievements';

/** Пороги антидосягнень (12j). */
export const ANTI_LIMITS = {
  zeroQuestions: 5,
  blackStripe: 5,
  soCloseShare: 0.1,
  gullible: 3,
  slowAnswers: 5,
  slowPlayers: 3,
  debuffed: 3,
  wandered: 3,
} as const;

/**
 * Ігрові антидосягнення завершеної гри (15, план 12j, «Рішення»); незавершена — порожньо.
 * За відповіді — свої рядки (людина з answeredBy), за результат — рядки й місце учасника таблиці (уся команда).
 */
export function antiAchievements(game: AchievementGame, who: AchievementWho): Set<AchievementId> {
  const got = new Set<AchievementId>();
  if (game.status !== 'finished') return got;
  const L = ANTI_LIMITS;
  const questions = new Map(game.questions.map((q) => [q.index, q]));
  const own = ownRows(game, who);
  const answers = own.filter(answerRow);
  const mine = participantRows(game, who);
  const player = game.players.find((p) => p.participantId === who.participantId);

  // Результат учасника таблиці.
  if (player !== undefined) {
    if (player.score < 0) got.add('in_debt');
    if (player.score === 0 && game.questionsPlayed >= L.zeroQuestions) got.add('zero');
    if (isLastPlace({ status: game.status, rank: player.rank, playerCount: game.players.length })) got.add('last_place');
    const winners = game.players.filter((p) => p.rank === 1);
    if (player.rank === 2 && winners.length === 1 && winners[0].score > 0 && player.score > 0 && winners[0].score - player.score < L.soCloseShare * winners[0].score) {
      got.add('so_close');
    }
  }

  // Чорна смуга: свої запитання з балами в порядку гри; без своїх рядків-відповідей запитання пропускається.
  const wonAppeal = new Set(game.appeals.filter((a) => a.participantId === who.participantId && a.outcome === 'yes').map((a) => a.questionIndex));
  let stripe = 0;
  let longest = 0;
  for (const q of [...game.questions].sort((a, b) => a.index - b.index)) {
    if (!q.scored) continue;
    const tries = own.filter((r) => r.questionIndex === q.index && (answerRow(r) || silentRisk(r)));
    if (tries.length === 0) continue;
    const points = tries.reduce((sum, r) => sum + r.points, 0);
    const miss = !tries.some((r) => r.accepted) && points <= 0 && !wonAppeal.has(q.index);
    stripe = miss ? stripe + 1 : 0;
    longest = Math.max(longest, stripe);
  }
  if (longest >= L.blackStripe) got.add('black_stripe');

  if (new Set(answers.filter((r) => r.payload?.type === 'bluff' && r.payload.pick !== null && !r.payload.truth).map((r) => r.questionIndex)).size >= L.gullible) {
    got.add('gullible');
  }

  // Ва-банк (фінал, «Ставки»): ставку робить учасник рушія, тож рахуються його рядки. Повернена ставка (банк без переможців) — не втрата.
  for (const q of game.questions) {
    if (!(q.ref.final?.allIn.includes(who.participantId) ?? false)) continue;
    const tried = mine.filter((r) => r.questionIndex === q.index && (r.attempt === 0 || r.attempt === PENALTY_ATTEMPT));
    if (!tried.some((r) => r.accepted) && tried.reduce((sum, r) => sum + r.points, 0) < 0) {
      got.add('all_in_lost');
      break;
    }
  }

  // «Ва-банк» (раунд): згоріти на останньому кроці, коли до нього банк був.
  const accepted = new Set(mine.filter((r) => r.attempt === 0 && r.accepted).map((r) => r.questionIndex));
  for (const round of groupRounds(game.questions)) {
    if (round[0].roundType !== 'wipeout' || !round.some((q) => q.ref.wipeout?.end === true)) continue;
    const steps = round.map((q) => ({ price: q.question.points, correct: accepted.has(q.index) ? [who.participantId] : [], took: q.ref.wipeout?.took ?? [] }));
    const end = wipeoutStandings([who.participantId], steps, true)[who.participantId];
    const before = wipeoutStandings([who.participantId], steps.slice(0, -1), false)[who.participantId];
    if (end.status === 'burned' && end.step === steps.length - 1 && before.status === 'in' && before.bank > 0) got.add('burned');
  }

  if (answers.some((r) => r.accepted && r.buff === 'shield')) got.add('umbrella');
  if (answers.some((r) => !r.accepted && r.buff === 'retry' && r.points <= 0)) got.add('same_river');

  // Черепаха: середній час «часових» відповідей учасників таблиці.
  const timedOf = (rows: AchievementRow[]) =>
    rows.filter((r) => {
      const q = questions.get(r.questionIndex);
      return answerRow(r) && r.spareId === null && q !== undefined && q.limitMs !== null && !q.blitz && r.timeMs > 0;
    });
  const averages = game.players.flatMap((p) => {
    const timed = timedOf(game.rows.filter((r) => r.participantId === p.participantId));
    return timed.length >= L.slowAnswers ? [{ id: p.participantId, average: timed.reduce((sum, r) => sum + r.timeMs, 0) / timed.length }] : [];
  });
  const slow = averages.find((a) => a.id === who.participantId);
  if (averages.length >= L.slowPlayers && slow !== undefined && averages.every((a) => a.id === who.participantId || a.average < slow.average)) got.add('slowpoke');

  if (new Set(mine.filter((r) => r.debuff !== null).map((r) => r.questionIndex)).size >= L.debuffed) got.add('debuff_magnet');

  if (
    own.some((r) => {
      const question = r.spareId === null && r.attempt === 0 ? questions.get(r.questionIndex)?.question : undefined;
      return question?.type === 'clues' && !r.accepted && r.clue !== null && r.clue === question.clues.length;
    })
  )
    got.add('who_am_i');

  if (game.appeals.some((a) => a.participantId === who.participantId && a.outcome === 'no' && a.yes === 0)) got.add('hammer');

  // Поза грою: лише соло — у командній грі рядок команди не каже, хто саме виходив.
  if (who.personId === null && !game.teams) {
    const away = own.filter((r) => r.awayMs !== null && r.awayMs >= AWAY_MS.mark && (questions.get(r.questionIndex)?.scored ?? false));
    if (new Set(away.map((r) => r.questionIndex)).size >= L.wandered) got.add('wanderer');
  }

  return got;
}
