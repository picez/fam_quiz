import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, ACHIEVEMENT_INFO, type Achievement, type AchievementCard, type AchievementGroup } from '@quiz/shared';

const order = (item: Achievement) => ACHIEVEMENTS.indexOf(item.id);

/** Отримані, найновіші першими: earnedAt спадно, null («давно») після датованих, при рівності — за порядком ACHIEVEMENTS. */
export function recentBadges(achievements: Achievement[]): Achievement[] {
  const time = (item: Achievement) => (item.earnedAt === null ? -Infinity : Date.parse(item.earnedAt) || -Infinity);
  return achievements
    .filter((item) => item.earned)
    .sort((a, b) => time(b) - time(a) || order(a) - order(b));
}

/** Картки за групами в порядку ACHIEVEMENT_GROUPS, у групі — за порядком ACHIEVEMENTS; порожні групи пропущено. */
export function groupCards(items: AchievementCard[]): { group: AchievementGroup; items: AchievementCard[] }[] {
  const sorted = [...items].sort((a, b) => order(a) - order(b));
  return ACHIEVEMENT_GROUPS.map((group) => ({ group, items: sorted.filter((item) => ACHIEVEMENT_INFO[item.id].group === group) })).filter(
    (entry) => entry.items.length > 0,
  );
}
