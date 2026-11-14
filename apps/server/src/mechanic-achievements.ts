import { isSelfPaced, TEAM_WIDE_TYPES, type AchievementId } from '@quiz/shared';
import type { AchievementGame } from './achievement-games';
import { answerRow, ownRows } from './achievement-rows';
import type { AchievementWho } from './game-achievements';

/**
 * Ігрові досягнення механік 12c–12h (5): lawyer, own_pace, risky, peeker, chosen_one; незавершена гра — порожньо.
 * Виграна апеляція відповіді прийнятою не робить: «Ризик», «Підглянути» й «Вибір капітана» її не зараховують.
 */
export function mechanicAchievements(game: AchievementGame, who: AchievementWho): Set<AchievementId> {
  const got = new Set<AchievementId>();
  if (game.status !== 'finished') return got;
  const questions = new Map(game.questions.map((q) => [q.index, q]));
  const own = ownRows(game, who);
  const accepted = own.filter((r) => answerRow(r) && r.accepted);

  // Апеляцію подає учасник рушія: уся команда.
  if (game.appeals.some((a) => a.participantId === who.participantId && a.outcome === 'yes')) got.add('lawyer');

  if (
    accepted.some((r) => {
      const question = r.spareId === null && r.attempt === 0 ? questions.get(r.questionIndex)?.question : undefined;
      if (question === undefined || !isSelfPaced(question) || r.clue !== 1) return false;
      return game.rows.some((other) => other.participantId !== who.participantId && other.questionIndex === r.questionIndex && other.spareId === null && other.attempt === 0 && (other.clue ?? 0) > 1);
    })
  )
    got.add('own_pace');

  // Мовчання з «Ризиком» (PENALTY_ATTEMPT) — «узято, мимо»: рядком-відповіддю не є й досягнення не дає.
  if (accepted.some((r) => r.buff === 'risk')) got.add('risky');
  if (accepted.some((r) => r.buff === 'peek')) got.add('peeker');

  // Відповідача обирають капітан чи черга; у бліці й типах, де діє вся команда (TEAM_WIDE_TYPES), — не вибір.
  if (game.teams && who.personId !== null && (game.answerer === 'chosen' || game.answerer === 'rotate')) {
    if (
      accepted.some((r) => {
        const q = questions.get(r.questionIndex);
        // «Правда про гравця»: відповідає капітан, нікого не вибирали.
        return q !== undefined && !q.blitz && q.roundType !== 'truth' && !TEAM_WIDE_TYPES.includes(q.question.type);
      })
    )
      got.add('chosen_one');
  }

  return got;
}
