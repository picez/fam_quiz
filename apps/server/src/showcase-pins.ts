import { SHOWCASE_PIN_LIMITS, type AchievementId, type ShowcasePin, type ShowcasePins } from '@quiz/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { prizeAward, showcasePin, userAchievement } from './db/schema';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current && typeof current === 'object'; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}

/** id нагороди текстом: item_id — text, тож порівняння без приведення тексту до uuid (застарілий рядок може бути будь-чим). */
const awardIdText = sql`${prizeAward.id}::text`;
const ownAward = and(sql`${awardIdText} = ${showcasePin.itemId}`, eq(prizeAward.userId, showcasePin.userId));
const ownAchievement = and(sql`${userAchievement.achievementId} = ${showcasePin.itemId}`, eq(userAchievement.userId, showcasePin.userId));
const ORDER = [asc(showcasePin.pinnedAt), asc(showcasePin.slot)];

/** Закріплене людини: порядок pinned_at, потім slot; лише наявні нагороди (prize_award цього userId) та отримані ачівки (user_achievement). */
export async function showcasePins(db: Db | Tx, userId: string): Promise<ShowcasePins> {
  const prizes = await db
    .select({ id: showcasePin.itemId })
    .from(showcasePin)
    .innerJoin(prizeAward, ownAward)
    .where(and(eq(showcasePin.userId, userId), eq(showcasePin.kind, 'prize')))
    .orderBy(...ORDER);
  const achievements = await db
    .select({ id: showcasePin.itemId })
    .from(showcasePin)
    .innerJoin(userAchievement, ownAchievement)
    .where(and(eq(showcasePin.userId, userId), eq(showcasePin.kind, 'achievement')))
    .orderBy(...ORDER);
  return { prizes: prizes.map((row) => row.id), achievements: achievements.map((row) => row.id as AchievementId) };
}

export type PinResult = { ok: true; pins: ShowcasePins } | { ok: false; error: 'not_found' | 'showcase_full' };

/** Чи є предмет у цієї людини: власна нагорода чи отримана ачівка. */
async function owns(tx: Tx, userId: string, pin: ShowcasePin): Promise<boolean> {
  const rows =
    pin.kind === 'prize'
      ? await tx
          .select({ id: prizeAward.id })
          .from(prizeAward)
          .where(and(sql`${awardIdText} = ${pin.id}`, eq(prizeAward.userId, userId)))
      : await tx
          .select({ id: userAchievement.achievementId })
          .from(userAchievement)
          .where(and(eq(userAchievement.userId, userId), eq(userAchievement.achievementId, pin.id)));
  return rows.length > 0;
}

const pinRow = (userId: string, pin: ShowcasePin) =>
  and(eq(showcasePin.userId, userId), eq(showcasePin.kind, pin.kind), eq(showcasePin.itemId, pin.id));

/**
 * У транзакції: перевірка власності → повтор = ok без змін → прибрати застарілі → ліміт → найменший вільний slot.
 * 23505: той самий предмет уже закріплено (гонка) — ok; інакше slot зайняв інший предмет — ще одна спроба, потім showcase_full.
 */
export async function pinItem(db: Db, userId: string, pin: ShowcasePin, now: Date = new Date()): Promise<PinResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await pinOnce(db, userId, pin, now);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const [existing] = await db.select({ slot: showcasePin.slot }).from(showcasePin).where(pinRow(userId, pin));
      if (existing !== undefined) return { ok: true, pins: await showcasePins(db, userId) };
      if (attempt >= 1) return { ok: false, error: 'showcase_full' };
    }
  }
}

function pinOnce(db: Db, userId: string, pin: ShowcasePin, now: Date): Promise<PinResult> {
  return db.transaction(async (tx): Promise<PinResult> => {
    if (!(await owns(tx, userId, pin))) return { ok: false, error: 'not_found' };
    const [existing] = await tx.select({ slot: showcasePin.slot }).from(showcasePin).where(pinRow(userId, pin));
    if (existing !== undefined) return { ok: true, pins: await showcasePins(tx, userId) };

    // Застарілі рядки цього виду (нагороду видалено, ачівки немає) не займають слотів.
    const live = pin.kind === 'prize' ? sql`exists (select 1 from ${prizeAward} where ${ownAward})` : sql`exists (select 1 from ${userAchievement} where ${ownAchievement})`;
    await tx.delete(showcasePin).where(and(eq(showcasePin.userId, userId), eq(showcasePin.kind, pin.kind), sql`not ${live}`));

    const used = await tx
      .select({ slot: showcasePin.slot })
      .from(showcasePin)
      .where(and(eq(showcasePin.userId, userId), eq(showcasePin.kind, pin.kind)));
    const limit = SHOWCASE_PIN_LIMITS[pin.kind];
    if (used.length >= limit) return { ok: false, error: 'showcase_full' };
    const taken = new Set(used.map((row) => row.slot));
    let slot = 0;
    while (taken.has(slot)) slot += 1;
    await tx.insert(showcasePin).values({ userId, kind: pin.kind, itemId: pin.id, slot, pinnedAt: now });
    return { ok: true, pins: await showcasePins(tx, userId) };
  });
}

/** Ідемпотентно. */
export async function unpinItem(db: Db, userId: string, pin: ShowcasePin): Promise<ShowcasePins> {
  await db.delete(showcasePin).where(pinRow(userId, pin));
  return showcasePins(db, userId);
}

/** Прибрати закріплення нагороди (deleteAward, у тій самій транзакції). */
export async function dropAwardPin(db: Db | Tx, userId: string, awardId: string): Promise<void> {
  await db.delete(showcasePin).where(and(eq(showcasePin.userId, userId), eq(showcasePin.kind, 'prize'), eq(showcasePin.itemId, awardId)));
}
