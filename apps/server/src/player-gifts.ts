import { TITLE_MS, type FeedData } from '@quiz/shared';
import { and, eq, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { logAction } from './bans';
import type { Db } from './db/client';
import { feedEvent, prize, prizeAward, user, userTitle } from './db/schema';
import { deleteAward } from './prizes';
import { ensureProfile } from './profiles';

/**
 * 58: подарунок адміна — копія змісту одного з його призів (free чи reserved; сам приз лишається й його можна дарувати ще).
 * Нагорода без гри: game_id = id нагороди, місце 1, gift = true; титул — як у звичайного призу, подія стрічки — напряму.
 * Чужий, вручений чи неіснуючий приз — prize_not_found; немає отримувача — not_found. Усе в одній транзакції з журналом.
 */
export async function giftPrize(
  db: Db,
  input: { adminId: string; userId: string; prizeId: string; note: string | null; now: Date },
): Promise<{ ok: true; awardId: string } | { ok: false; error: 'not_found' | 'prize_not_found' }> {
  const { adminId, userId, prizeId, note, now } = input;
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId));
    if (target === undefined) return { ok: false as const, error: 'not_found' as const };
    const [source] = await tx
      .select({ content: prize.content })
      .from(prize)
      .where(and(eq(prize.id, prizeId), eq(prize.ownerId, adminId), ne(prize.status, 'awarded')));
    if (source === undefined) return { ok: false as const, error: 'prize_not_found' as const };
    const content = source.content;
    const nickname = (await ensureProfile(tx as Db, userId))?.nickname ?? '';
    const awardId = randomUUID();
    await tx.insert(prizeAward).values({ id: awardId, userId, prizeId, gameId: awardId, place: 1, content, quizTitle: '', nickname, awardedAt: now, gift: true, giftNote: note });
    if (content.title !== null) {
      const expiresAt = new Date(now.getTime() + TITLE_MS);
      await tx
        .insert(userTitle)
        .values({ userId, text: content.title, gameId: awardId, awardedAt: now, expiresAt })
        .onConflictDoUpdate({ target: userTitle.userId, set: { text: content.title, gameId: awardId, awardedAt: now, expiresAt } });
    }
    const data: FeedData = { kind: 'prize', place: 1, name: content.name, title: '', nickTitle: content.title, gift: true };
    await tx.insert(feedEvent).values({ key: `prize:${awardId}`, userId, kind: 'prize', gameId: null, data, at: now, createdAt: now });
    await logAction(tx, { adminId, kind: 'prize_gift', targetUserId: userId, details: { title: content.name, content }, now });
    return { ok: true as const, awardId };
  });
}

/** 58: забрати подарунок (лише gift = true): нагорода, титул, закріплення й подія стрічки. Не подарунок чи немає — false, без змін. */
export async function revokeGift(db: Db, input: { adminId: string; awardId: string; now: Date }): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ userId: prizeAward.userId, gift: prizeAward.gift }).from(prizeAward).where(eq(prizeAward.id, input.awardId));
    if (row === undefined || !row.gift) return false;
    const removed = await deleteAward(tx, input.awardId);
    if (removed === null) return false;
    await tx.delete(feedEvent).where(eq(feedEvent.key, `prize:${input.awardId}`));
    await logAction(tx, { adminId: input.adminId, kind: 'gift_revoke', targetUserId: removed.userId, details: { title: removed.content.name, content: removed.content }, now: input.now });
    return true;
  });
}
