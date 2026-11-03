import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AchievementId } from '@quiz/shared';
import type { Db } from './db/client';
import { prizeAward, showcasePin, user, userAchievement } from './db/schema';
import { deleteAward, showcaseOf } from './prizes';
import { pinItem, showcasePins, unpinItem } from './showcase-pins';
import { createTestDb } from './testing/test-db';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
  await db.insert(user).values(['u1', 'u2'].map((id) => ({ id, name: id, email: `${id}@example.com` })));
});

const base = new Date('2026-11-01T12:00:00Z');
/** Мить через n секунд після base: порядок закріплення не залежить від годинника. */
const t = (n: number) => new Date(base.getTime() + n * 1000);

async function award(userId = 'u1', awardedAt = base): Promise<string> {
  const [row] = await db
    .insert(prizeAward)
    .values({
      userId,
      prizeId: randomUUID(),
      gameId: randomUUID(),
      place: 1,
      content: { name: 'Кубок', trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false },
      quizTitle: 'Україна',
      nickname: 'Оля',
      awardedAt,
    })
    .returning({ id: prizeAward.id });
  return row!.id;
}
const earn = (ids: AchievementId[], userId = 'u1') =>
  db.insert(userAchievement).values(ids.map((achievementId) => ({ userId, achievementId, earnedAt: base })));
const prizePin = (id: string) => ({ kind: 'prize' as const, id });

/**
 * db, у транзакціях якого перші `failures` вставок кидають 23505 (як драйвер: код у cause) —
 * імітація гонки на PGlite з одним з'єднанням: інший предмет зайняв той самий slot.
 */
function collidingDb(failures: number): { db: Db; inserts: () => number } {
  let inserts = 0;
  const wrapTx = (tx: object) =>
    new Proxy(tx, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (key !== 'insert' || typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          inserts += 1;
          if (inserts <= failures) throw Object.assign(new Error('Failed query'), { cause: { code: '23505' } });
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  const wrapped = new Proxy(db, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (key !== 'transaction') return typeof value === 'function' ? value.bind(target) : value;
      return (run: (tx: object) => Promise<unknown>) => target.transaction((tx) => run(wrapTx(tx)));
    },
  });
  return { db: wrapped, inserts: () => inserts };
}

describe('showcase pins', () => {
  it('pins 3 awards in the order of pinning and refuses the 4th', async () => {
    const ids = [await award(), await award(), await award(), await award()];
    for (const [i, id] of [ids[2]!, ids[0]!, ids[1]!].entries()) expect((await pinItem(db, 'u1', prizePin(id), t(i))).ok).toBe(true);
    expect((await showcasePins(db, 'u1')).prizes).toEqual([ids[2], ids[0], ids[1]]);
    expect(await pinItem(db, 'u1', prizePin(ids[3]!), t(9))).toEqual({ ok: false, error: 'showcase_full' });
  });

  it('refuses an award of another person and an achievement not earned', async () => {
    const theirs = await award('u2');
    expect(await pinItem(db, 'u1', prizePin(theirs))).toEqual({ ok: false, error: 'not_found' });
    expect(await pinItem(db, 'u1', { kind: 'achievement', id: 'sniper' })).toEqual({ ok: false, error: 'not_found' });
    expect(await pinItem(db, 'u1', prizePin(randomUUID()))).toEqual({ ok: false, error: 'not_found' });
  });

  it('keeps the order on a repeat of the same pin', async () => {
    const [a, b] = [await award(), await award()];
    await pinItem(db, 'u1', prizePin(a), t(0));
    await pinItem(db, 'u1', prizePin(b), t(1));
    expect(await pinItem(db, 'u1', prizePin(a), t(2))).toEqual({ ok: true, pins: { prizes: [a, b], achievements: [] } });
    expect(await db.select().from(showcasePin)).toHaveLength(2);
  });

  it('unpins the middle one and puts a new pin last', async () => {
    const [a, b, c, d] = [await award(), await award(), await award(), await award()];
    for (const [i, id] of [a, b, c].entries()) await pinItem(db, 'u1', prizePin(id), t(i));
    expect((await unpinItem(db, 'u1', prizePin(b))).prizes).toEqual([a, c]);
    expect((await unpinItem(db, 'u1', prizePin(b))).prizes).toEqual([a, c]);
    const result = await pinItem(db, 'u1', prizePin(d), t(5));
    expect(result).toEqual({ ok: true, pins: { prizes: [a, c, d], achievements: [] } });
  });

  it('drops a pin when the award is deleted and frees its slot', async () => {
    const [a, b, c, d] = [await award(), await award(), await award(), await award()];
    for (const [i, id] of [a, b, c].entries()) await pinItem(db, 'u1', prizePin(id), t(i));
    expect(await deleteAward(db, b)).not.toBeNull();
    expect((await showcasePins(db, 'u1')).prizes).toEqual([a, c]);
    expect(await db.select().from(showcasePin)).toHaveLength(2);
    expect((await pinItem(db, 'u1', prizePin(d), t(5))).ok).toBe(true);
  });

  it('is not blocked by a stale row of a gone award', async () => {
    await db.insert(showcasePin).values({ userId: 'u1', kind: 'prize', itemId: randomUUID(), slot: 0, pinnedAt: base });
    await db.insert(showcasePin).values({ userId: 'u1', kind: 'prize', itemId: 'not-a-uuid', slot: 1, pinnedAt: base });
    expect((await showcasePins(db, 'u1')).prizes).toEqual([]);
    const ids = [await award(), await award(), await award()];
    for (const [i, id] of ids.entries()) expect((await pinItem(db, 'u1', prizePin(id), t(i))).ok).toBe(true);
    expect((await showcasePins(db, 'u1')).prizes).toEqual(ids);
    expect(await db.select().from(showcasePin).where(eq(showcasePin.userId, 'u1'))).toHaveLength(3);
  });

  it('lets exactly 3 of 4 parallel pins through', async () => {
    const ids = [await award(), await award(), await award(), await award()];
    const results = await Promise.all(ids.map((id) => pinItem(db, 'u1', prizePin(id))));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'showcase_full' }]);
    expect(await db.select().from(showcasePin)).toHaveLength(3);
  });

  it('retries once when another item took the same slot (23505) and pins into a free slot', async () => {
    const [a, b] = [await award(), await award()];
    await pinItem(db, 'u1', prizePin(a), t(0));
    const flaky = collidingDb(1);
    expect(await pinItem(flaky.db, 'u1', prizePin(b), t(1))).toEqual({ ok: true, pins: { prizes: [a, b], achievements: [] } });
    expect(flaky.inserts()).toBe(2);
  });

  it('answers showcase_full when the slot collides twice', async () => {
    const a = await award();
    const flaky = collidingDb(2);
    expect(await pinItem(flaky.db, 'u1', prizePin(a), t(0))).toEqual({ ok: false, error: 'showcase_full' });
    expect(flaky.inserts()).toBe(2);
    expect(await db.select().from(showcasePin)).toHaveLength(0);
  });

  it('pins up to 5 earned achievements', async () => {
    const six: AchievementId[] = ['first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host'];
    await earn(six);
    for (const [i, id] of six.slice(0, 5).entries()) expect((await pinItem(db, 'u1', { kind: 'achievement', id }, t(i))).ok).toBe(true);
    expect(await pinItem(db, 'u1', { kind: 'achievement', id: 'host' }, t(9))).toEqual({ ok: false, error: 'showcase_full' });
    expect((await showcasePins(db, 'u1')).achievements).toEqual(six.slice(0, 5));
  });

  it('keeps the kinds apart', async () => {
    await earn(['sniper']);
    const a = await award();
    await pinItem(db, 'u1', { kind: 'achievement', id: 'sniper' });
    await pinItem(db, 'u1', prizePin(a));
    expect(await showcasePins(db, 'u1')).toEqual({ prizes: [a], achievements: ['sniper'] });
    expect(await showcasePins(db, 'u2')).toEqual({ prizes: [], achievements: [] });
  });

  it('showcaseOf carries a pinned award older than the 60 newest', async () => {
    const old = await award('u1', new Date('2020-01-01T00:00:00Z'));
    for (let i = 0; i < 60; i += 1) await award('u1', t(i));
    await pinItem(db, 'u1', prizePin(old));
    const showcase = await showcaseOf(db, 'u1');
    expect(showcase.awards).toHaveLength(61);
    expect(showcase.awards.at(-1)!.id).toBe(old);
    expect(showcase.pins).toEqual({ prizes: [old], achievements: [] });
  });
});
