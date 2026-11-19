import { ACHIEVEMENTS, type AchievementId, type AchievementShares } from '@quiz/shared';
import { and, countDistinct, eq, exists, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { game, participant, userAchievement } from './db/schema';

/** Скільки живуть пораховані частки: рідкість не потребує свіжості до хвилини. */
export const SHARES_TTL_MS = 3_600_000;

const KNOWN: ReadonlySet<string> = new Set(ACHIEVEMENTS);

let cached: { at: number; value: AchievementShares } | null = null;
let pending: Promise<AchievementShares> | null = null;

export function forgetAchievementShares(): void {
  cached = null;
  pending = null;
}

/** Акаунти з місцем у завершеній грі: база часток. */
const hasFinishedGame = (db: Db) =>
  db
    .select({ one: sql`1` })
    .from(participant)
    .innerJoin(game, eq(game.id, participant.gameId))
    .where(and(eq(participant.userId, userAchievement.userId), isNotNull(participant.rank), eq(game.status, 'finished')));

async function read(db: Db): Promise<AchievementShares> {
  const [[base], rows] = await Promise.all([
    db
      .select({ n: countDistinct(participant.userId) })
      .from(participant)
      .innerJoin(game, eq(game.id, participant.gameId))
      .where(and(isNotNull(participant.userId), isNotNull(participant.rank), eq(game.status, 'finished'))),
    db
      .select({ id: userAchievement.achievementId, n: countDistinct(userAchievement.userId) })
      .from(userAchievement)
      .where(and(inArray(userAchievement.achievementId, [...ACHIEVEMENTS]), exists(hasFinishedGame(db))))
      .groupBy(userAchievement.achievementId),
  ]);
  const holders: Partial<Record<AchievementId, number>> = {};
  for (const row of rows) if (KNOWN.has(row.id) && row.n > 0) holders[row.id] = Number(row.n);
  return { players: Number(base?.n ?? 0), holders };
}

/** База — акаунти з місцем у завершеній грі; власники — лише серед бази; кеш у пам'яті на SHARES_TTL_MS, одночасні виклики ділять проміс, збій не кешується. */
export async function achievementShares(db: Db, now: number = Date.now()): Promise<AchievementShares> {
  if (cached !== null && now - cached.at < SHARES_TTL_MS) return cached.value;
  if (pending !== null) return pending;
  const run = read(db).then(
    (value) => {
      cached = { at: now, value };
      pending = null;
      return value;
    },
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  pending = run;
  return run;
}
