import { publicContent, type PrizeContent } from '@quiz/shared';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { adminAction, feedEvent, follow, prize, prizeAward, profile, showcasePin, user, userTitle } from './db/schema';
import { backfillFeed } from './feed-publish';
import { feedPage } from './feed-store';
import { hostGame } from './history';
import { giftPrize, revokeGift } from './player-gifts';
import { createPrize, currentTitles, listPrizes, showcaseOf } from './prizes';
import { createTestDb } from './testing/test-db';

const ADMIN = 'pg-admin';
const NOW = new Date('2026-11-20T10:00:00.000Z');
const CONTENT: PrizeContent = { name: 'Кубок весни 58', trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: 'Майстер весни', diploma: false };

let db: Db;
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values({ id: ADMIN, name: 'Адмін 58', email: 'pg-admin@example.com' });
  await db.insert(profile).values({ userId: ADMIN, nickname: 'Адмін 58', nicknameKey: 'адмін58г' });
});

async function person(name: string): Promise<string> {
  n += 1;
  const id = `pg-${n}`;
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  await db.insert(profile).values({ userId: id, nickname: `${name} ${n}`, nicknameKey: `${name.toLowerCase()}${n}г` });
  return id;
}

async function adminPrize(owner = ADMIN): Promise<string> {
  const result = await createPrize(db, owner, CONTENT);
  if (!result.ok) throw new Error('prize');
  return result.prize.id;
}

const logOf = (userId: string) => db.select().from(adminAction).where(eq(adminAction.targetUserId, userId));
const awardsOf = (userId: string) => db.select().from(prizeAward).where(eq(prizeAward.userId, userId));
const eventOf = (awardId: string) => db.select().from(feedEvent).where(eq(feedEvent.key, `prize:${awardId}`));

describe('gifting a prize', () => {
  it("a gift copies the admin's prize into the showcase with the mark", async () => {
    const olia = await person('Оля');
    const prizeId = await adminPrize();
    const result = await giftPrize(db, { adminId: ADMIN, userId: olia, prizeId, note: 'З днем народження', now: NOW });
    expect(result.ok).toBe(true);
    const showcase = await showcaseOf(db, olia, NOW);
    expect(showcase.awards).toHaveLength(1);
    expect(showcase.awards[0]).toMatchObject({ place: 1, quizTitle: '', gift: { note: 'З днем народження' } });
    expect(showcase.awards[0].content).toEqual(publicContent(CONTENT));
    const mine = await listPrizes(db, ADMIN);
    expect(mine.find((p) => p.id === prizeId)?.status).toBe('free');
    const [row] = await db.select().from(prize).where(eq(prize.id, prizeId));
    expect(row.status).toBe('free');
    const [line] = await logOf(olia);
    expect(line).toMatchObject({ kind: 'prize_gift', adminId: ADMIN });
    expect(line.details).toMatchObject({ title: 'Кубок весни 58', content: CONTENT, text: 'З днем народження' });
  });

  it('a gift has a feed event and the title like a won prize', async () => {
    const olia = await person('Оля');
    const friend = await person('Тарас');
    await db.insert(follow).values([
      { followerId: olia, followeeId: friend },
      { followerId: friend, followeeId: olia },
    ]);
    const prizeId = await adminPrize();
    const result = await giftPrize(db, { adminId: ADMIN, userId: olia, prizeId, note: null, now: NOW });
    if (!result.ok) throw new Error('gift');
    const [event] = await eventOf(result.awardId);
    expect(event.gameId).toBeNull();
    expect(event.userId).toBe(olia);
    expect(event.data).toMatchObject({ kind: 'prize', place: 1, name: 'Кубок весни 58', nickTitle: 'Майстер весни', gift: true });
    expect((await currentTitles(db, [olia], NOW)).get(olia)).toBe('Майстер весни');
    const page = await feedPage(db, friend, null, NOW);
    expect(page.events.some((e) => e.data.kind === 'prize' && e.who && e.mine === false)).toBe(true);
    expect((await showcaseOf(db, olia, NOW)).awards[0].gift).toEqual({ note: null });
  });

  it('the same prize can be gifted twice', async () => {
    const olia = await person('Оля');
    const prizeId = await adminPrize();
    const a = await giftPrize(db, { adminId: ADMIN, userId: olia, prizeId, note: null, now: NOW });
    const b = await giftPrize(db, { adminId: ADMIN, userId: olia, prizeId, note: 'ще раз', now: new Date(NOW.getTime() + 1000) });
    expect(a.ok && b.ok).toBe(true);
    expect(await awardsOf(olia)).toHaveLength(2);
  });

  it("only the admin's own prize", async () => {
    const olia = await person('Оля');
    const other = await person('Тарас');
    const theirs = await adminPrize(other);
    const awarded = await adminPrize();
    await db.update(prize).set({ status: 'awarded' }).where(eq(prize.id, awarded));
    const missing = '00000000-0000-4000-8000-000000000058';
    for (const prizeId of [theirs, awarded, missing]) {
      expect(await giftPrize(db, { adminId: ADMIN, userId: olia, prizeId, note: null, now: NOW })).toEqual({ ok: false, error: 'prize_not_found' });
    }
    const own = await adminPrize();
    expect(await giftPrize(db, { adminId: ADMIN, userId: 'nobody', prizeId: own, note: null, now: NOW })).toEqual({ ok: false, error: 'not_found' });
    expect(await logOf(olia)).toHaveLength(0);
    expect(await awardsOf(olia)).toHaveLength(0);
  });
});

describe('revoking a gift', () => {
  it('removes the award, the title, the pin and the event', async () => {
    const olia = await person('Оля');
    const prizeId = await adminPrize();
    const result = await giftPrize(db, { adminId: ADMIN, userId: olia, prizeId, note: null, now: NOW });
    if (!result.ok) throw new Error('gift');
    await db.insert(showcasePin).values({ userId: olia, kind: 'prize', itemId: result.awardId, slot: 0, pinnedAt: NOW });
    expect(await revokeGift(db, { adminId: ADMIN, awardId: result.awardId, now: NOW })).toBe(true);
    expect(await awardsOf(olia)).toHaveLength(0);
    expect(await db.select().from(userTitle).where(eq(userTitle.userId, olia))).toHaveLength(0);
    expect(await db.select().from(showcasePin).where(eq(showcasePin.userId, olia))).toHaveLength(0);
    expect(await eventOf(result.awardId)).toHaveLength(0);
    const lines = await logOf(olia);
    expect(lines.map((l) => l.kind)).toEqual(['prize_gift', 'gift_revoke']);
    expect(lines[0]?.details).not.toHaveProperty('text');
    expect(await revokeGift(db, { adminId: ADMIN, awardId: result.awardId, now: NOW })).toBe(false);
  });

  it('refuses an award from a game and leaves its row', async () => {
    const olia = await person('Оля');
    const id = '00000000-0000-4000-8000-0000000000a1';
    await db.insert(prizeAward).values({ id, userId: olia, prizeId: id, gameId: id, place: 1, content: CONTENT, quizTitle: 'Гра', nickname: 'Оля', awardedAt: NOW });
    expect(await revokeGift(db, { adminId: ADMIN, awardId: id, now: NOW })).toBe(false);
    expect(await awardsOf(olia)).toHaveLength(1);
    expect(await logOf(olia)).toHaveLength(0);
  });
});

describe('gifts stay out of game history and the feed backfill', () => {
  it('neither the backfill nor the history sees a gift', async () => {
    const olia = await person('Оля');
    const prizeId = await adminPrize();
    const result = await giftPrize(db, { adminId: ADMIN, userId: olia, prizeId, note: null, now: NOW });
    if (!result.ok) throw new Error('gift');
    const [before] = await eventOf(result.awardId);
    await backfillFeed(db, NOW);
    const after = await eventOf(result.awardId);
    expect(after).toHaveLength(1);
    expect(after[0].data).toEqual(before.data);
    expect(after[0].gameId).toBeNull();
    expect(await db.select().from(feedEvent).where(and(eq(feedEvent.userId, olia), eq(feedEvent.kind, 'prize')))).toHaveLength(1);
    const [award] = await awardsOf(olia);
    expect(await hostGame(db, ADMIN, award.gameId)).toBeNull();
  });
});
