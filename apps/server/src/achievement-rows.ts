import type { AchievementGame, AchievementQuestion, AchievementRow } from './achievement-games';
import { PENALTY_ATTEMPT } from './db/schema';
import type { AchievementWho } from './game-achievements';

/** Свої рядки: соло — рядки учасника; людина команди — рядки команди, де відповідала вона (без answeredBy — нічиї). */
export function ownRows(game: AchievementGame, who: AchievementWho): AchievementRow[] {
  return game.rows.filter((r) => r.participantId === who.participantId && (who.personId === null || r.answeredBy === who.personId));
}

/** Рядки учасника таблиці (соло — гравець, командна гра — команда): для умов «за результат». */
export function participantRows(game: AchievementGame, who: AchievementWho): AchievementRow[] {
  return game.rows.filter((r) => r.participantId === who.participantId);
}

/** Рядок-відповідь: спроба, а не штраф. */
export const answerRow = (row: AchievementRow) => row.attempt >= 0;

/** Мовчання з «Ризиком»: штраф за невідповідь під бафом. */
export const silentRisk = (row: AchievementRow) => row.attempt === PENALTY_ATTEMPT && row.buff === 'risk';

/** Зіграні запитання за раундами, у порядку гри. */
export function groupRounds(questions: AchievementQuestion[]): AchievementQuestion[][] {
  const rounds = new Map<number, AchievementQuestion[]>();
  for (const q of questions) {
    const list = rounds.get(q.roundIndex);
    if (list === undefined) rounds.set(q.roundIndex, [q]);
    else list.push(q);
  }
  return [...rounds.values()];
}
