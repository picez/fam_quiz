import { z } from 'zod';
import { ACHIEVEMENTS, type Achievement, type AchievementId } from './achievements';
import type { AwardCard } from './prizes';

/** Скільки предметів кожного виду можна закріпити на вітрині (23a). */
export const SHOWCASE_PIN_LIMITS = { prize: 3, achievement: 5 } as const;
export const SHOWCASE_PIN_KINDS = ['prize', 'achievement'] as const;
export type ShowcasePinKind = (typeof SHOWCASE_PIN_KINDS)[number];
export type ShowcasePin = { kind: 'prize'; id: string } | { kind: 'achievement'; id: AchievementId };

/** Тіло POST /api/me/showcase/pins: нагорода за uuid (prize_award) чи ачівка за id. */
export const showcasePinSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('prize'), id: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('achievement'), id: z.enum(ACHIEVEMENTS) }).strict(),
]) as unknown as z.ZodType<ShowcasePin>;

/** Закріплене людини в порядку закріплення. */
export interface ShowcasePins {
  prizes: string[];
  achievements: AchievementId[];
}
export const EMPTY_PINS: ShowcasePins = Object.freeze({ prizes: Object.freeze([]) as unknown as string[], achievements: Object.freeze([]) as unknown as AchievementId[] });

/** Група автовибору: 0 — з трофеєм, 1 — диплом, 2 — решта. */
const awardGroup = (award: AwardCard) => (award.content.trophy !== null ? 0 : award.content.diploma ? 1 : 2);

/** Полиця: закріплені (у їхньому порядку, лише наявні) або автовибір; не більше SHOWCASE_PIN_LIMITS.prize. */
export function shelfAwards(awards: AwardCard[], pinned: string[]): AwardCard[] {
  const byId = new Map(awards.map((award) => [award.id, award]));
  const chosen = pinned.flatMap((id) => byId.get(id) ?? []);
  if (chosen.length > 0) return chosen.slice(0, SHOWCASE_PIN_LIMITS.prize);
  return awards
    .map((award, index) => ({ award, index }))
    .sort((a, b) => awardGroup(a.award) - awardGroup(b.award) || b.award.awardedAt.localeCompare(a.award.awardedAt) || a.index - b.index)
    .slice(0, SHOWCASE_PIN_LIMITS.prize)
    .map(({ award }) => award);
}

const ORDER = new Map<AchievementId, number>(ACHIEVEMENTS.map((id, index) => [id, index]));

/** Ачівки профілю: закріплені отримані в порядку закріплення або найновіші отримані; не більше 5. */
export function shelfAchievements(achievements: Achievement[], pinned: AchievementId[]): Achievement[] {
  const earned = achievements.filter((achievement) => achievement.earned);
  const byId = new Map(earned.map((achievement) => [achievement.id, achievement]));
  const chosen = pinned.flatMap((id) => byId.get(id) ?? []);
  if (chosen.length > 0) return chosen.slice(0, SHOWCASE_PIN_LIMITS.achievement);
  const time = (achievement: Achievement) => (achievement.earnedAt === null ? null : Date.parse(achievement.earnedAt));
  return [...earned]
    .sort((a, b) => {
      const ta = time(a);
      const tb = time(b);
      if (ta !== tb) {
        if (ta === null) return 1;
        if (tb === null) return -1;
        return tb - ta;
      }
      return (ORDER.get(a.id) ?? 0) - (ORDER.get(b.id) ?? 0);
    })
    .slice(0, SHOWCASE_PIN_LIMITS.achievement);
}

/** Порядок показу на полиці: 3 → [b, a, c] (перший у центрі); інакше як є. */
export function shelfColumns<T>(items: T[]): T[] {
  if (items.length !== 3) return [...items];
  const [a, b, c] = items as [T, T, T];
  return [b, a, c];
}
