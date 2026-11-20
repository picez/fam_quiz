import { levelOf, type AchievementId } from '@quiz/shared';
import { and, eq } from 'drizzle-orm';
import { logAction } from './bans';
import type { Db } from './db/client';
import { achievementBlock, feedEvent, profile, showcasePin, user, userAchievement, xpEntry } from './db/schema';
import { announceLevels } from './feed-publish';
import { reportError } from './log';
import { creditAchievements, syncXp, xpTotals } from './xp-store';
import { kyivDay } from './xp-rules';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

interface AchievementInput {
  adminId: string;
  userId: string;
  achievementId: AchievementId;
  now: Date;
}

async function exists(tx: Tx, userId: string): Promise<boolean> {
  const [row] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId));
  return row !== undefined;
}

/** Рівень підвищився — подія стрічки, як після гри (без гри); пониження нічого не оголошує. Збій не ламає дії адміна. */
async function announce(db: Db, userId: string, now: Date): Promise<void> {
  try {
    await announceLevels(db, [userId], null, now);
  } catch (error) {
    reportError(error, { where: 'player-card' });
  }
}

/**
 * 58: видати досягнення вручну — знімає заборону, user_achievement { earned_at: now, game_id: null } і рядок досвіду за рідкістю,
 * журнал — у тій самій транзакції. Уже є — 'owned' без журналу. Подію стрічки ручна видача не пише.
 */
export async function grantAchievement(db: Db, input: AchievementInput): Promise<'granted' | 'owned' | 'not_found'> {
  const result = await db.transaction(async (tx) => {
    if (!(await exists(tx, input.userId))) return 'not_found' as const;
    await tx.delete(achievementBlock).where(and(eq(achievementBlock.userId, input.userId), eq(achievementBlock.achievementId, input.achievementId)));
    const inserted = await tx
      .insert(userAchievement)
      .values({ userId: input.userId, achievementId: input.achievementId, earnedAt: input.now, gameId: null })
      .onConflictDoNothing()
      .returning({ id: userAchievement.achievementId });
    if (inserted.length === 0) return 'owned' as const;
    await creditAchievements(tx, input.userId);
    await logAction(tx, { adminId: input.adminId, kind: 'achievement_grant', targetUserId: input.userId, details: { achievementId: input.achievementId }, now: input.now });
    return 'granted' as const;
  });
  if (result === 'granted') await announce(db, input.userId, input.now);
  return result;
}

/**
 * 58: забрати досягнення — разом з його досвідом, подією стрічки й закріпленням на вітрині; заборона не дає жодній синхронізації
 * повернути його, доки адмін не видасть знову. Немає користувача чи досягнення — 'not_found' без журналу.
 */
export async function revokeAchievement(db: Db, input: AchievementInput): Promise<'revoked' | 'not_found'> {
  const { userId, achievementId } = input;
  const result = await db.transaction(async (tx) => {
    if (!(await exists(tx, userId))) return 'not_found' as const;
    const removed = await tx
      .delete(userAchievement)
      .where(and(eq(userAchievement.userId, userId), eq(userAchievement.achievementId, achievementId)))
      .returning({ id: userAchievement.achievementId });
    if (removed.length === 0) return 'not_found' as const;
    await tx.delete(xpEntry).where(and(eq(xpEntry.userId, userId), eq(xpEntry.source, 'achievement'), eq(xpEntry.achievementId, achievementId)));
    await tx
      .insert(achievementBlock)
      .values({ userId, achievementId, blockedAt: input.now })
      .onConflictDoUpdate({ target: [achievementBlock.userId, achievementBlock.achievementId], set: { blockedAt: input.now } });
    await tx.delete(feedEvent).where(eq(feedEvent.key, `achievement:${userId}:${achievementId}`));
    await tx.delete(showcasePin).where(and(eq(showcasePin.userId, userId), eq(showcasePin.kind, 'achievement'), eq(showcasePin.itemId, achievementId)));
    await logAction(tx, { adminId: input.adminId, kind: 'achievement_revoke', targetUserId: userId, details: { achievementId }, now: input.now });
    return 'revoked' as const;
  });
  if (result === 'revoked') await announce(db, userId, input.now);
  return result;
}

/**
 * 58: ручний досвід — рядок xp_entry 'admin' з причиною: рахується в рівень, не в денну стелю ігор, переживає ретро й наздоганяння.
 * Спершу syncXp (поза транзакцією), далі під замком профілю: сума + amount < 0 — xp_below_zero, нічого не пишеться.
 */
export async function adjustXp(
  db: Db,
  input: { adminId: string; userId: string; amount: number; reason: string; now: Date },
): Promise<{ ok: true; xp: number; level: number } | { ok: false; error: 'not_found' | 'xp_below_zero' }> {
  const { userId, amount, now } = input;
  try {
    // Пропущене ретро лише додало б досвіду: перевірка «не нижче нуля» без нього не хибить на користь віднімання.
    await syncXp(db, userId);
  } catch (error) {
    reportError(error, { where: 'player-card' });
  }
  const result = await db.transaction(async (tx) => {
    if (!(await exists(tx, userId))) return { ok: false as const, error: 'not_found' as const };
    const [locked] = await tx.select({ id: profile.userId }).from(profile).where(eq(profile.userId, userId)).for('update');
    if (locked === undefined) return { ok: false as const, error: 'not_found' as const };
    const xp = ((await xpTotals(tx, [userId])).get(userId) ?? 0) + amount;
    if (xp < 0) return { ok: false as const, error: 'xp_below_zero' as const };
    await tx.insert(xpEntry).values({ userId, source: 'admin', amount, note: input.reason, day: kyivDay(now), at: now, createdAt: now, counted: false, reason: null });
    await logAction(tx, { adminId: input.adminId, kind: 'xp_adjust', targetUserId: userId, details: { amount, reason: input.reason }, now });
    return { ok: true as const, xp, level: levelOf(xp) };
  });
  if (result.ok) await announce(db, userId, now);
  return result;
}
