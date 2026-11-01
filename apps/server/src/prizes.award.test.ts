import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { TITLE_MS, type PrizeContent } from '@quiz/shared';
import { createTestDb } from './testing/test-db';
import { prize, prizeAward, user, userTitle } from './db/schema';
import { awardPrizes, createPrize, currentTitles, deleteAward, listPrizes, reservePlaces, showcaseOf } from './prizes';

const content = (name: string, title: string | null = null): PrizeContent => ({ name, trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title, diploma: false });

let db: Awaited<ReturnType<typeof createTestDb>>;
const g1 = randomUUID();
const at = new Date('2026-11-01T12:00:00Z');
beforeEach(async () => {
  db = await createTestDb();
  await db.insert(user).values(['u1', 'u2', 'u3', 'u4'].map((id) => ({ id, name: id, email: `${id}@example.com` })));
});

const make = async (name: string, title: string | null = null) => {
  const r = await createPrize(db, 'u1', content(name, title));
  if (!r.ok) throw new Error('create failed');
  return r.prize.id;
};
const rowOf = async (id: string) => (await db.select().from(prize).where(eq(prize.id, id)))[0]!;
const awards = () => db.select().from(prizeAward);
const run = (outcomes: Parameters<typeof awardPrizes>[1]['outcomes']) => awardPrizes(db, { gameId: g1, quizTitle: 'Україна', at, outcomes });

describe('awardPrizes', () => {
  it('moves a solo prize to awarded and shows it in the winner showcase without the name', async () => {
    const cup = await make('Кубок');
    await reservePlaces(db, 'u1', g1, [cup, null, null]);
    await run([{ place: 1, prizeId: cup, winners: [{ userId: 'u2', nickname: 'Оля' }] }]);
    expect((await rowOf(cup)).status).toBe('awarded');
    expect(await listPrizes(db, 'u1')).toEqual([]);
    const { awards: list } = await showcaseOf(db, 'u2');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ place: 1, nickname: 'Оля', quizTitle: 'Україна' });
    expect('name' in list[0]!.content).toBe(false);
  });

  it('is idempotent on repeat', async () => {
    const cup = await make('Кубок', '👑 Король');
    await reservePlaces(db, 'u1', g1, [cup, null, null]);
    const outcomes = [{ place: 1 as const, prizeId: cup, winners: [{ userId: 'u2', nickname: 'Оля' }] }];
    await run(outcomes);
    await run(outcomes);
    expect(await awards()).toHaveLength(1);
    expect(await db.select().from(userTitle)).toHaveLength(1);
  });

  it('gives every account of a team its own row, awarding the prize once', async () => {
    const cup = await make('Кубок');
    await reservePlaces(db, 'u1', g1, [cup, null, null]);
    await run([{ place: 1, prizeId: cup, winners: ['u2', 'u3', 'u4'].map((userId) => ({ userId, nickname: `n-${userId}` })) }]);
    expect(await awards()).toHaveLength(3);
    expect((await rowOf(cup)).status).toBe('awarded');
  });

  it('gives a guest-only place back to the owner', async () => {
    const cup = await make('Кубок');
    await reservePlaces(db, 'u1', g1, [cup, null, null]);
    await run([{ place: 1, prizeId: cup, winners: [] }]);
    const row = await rowOf(cup);
    expect(row.status).toBe('free');
    expect(row.reservedGame).toBeNull();
    expect(await awards()).toEqual([]);
  });

  it('keeps one title per account, the newest wins, and expires after 7 days', async () => {
    const a = await make('A', '👑 Король вікторини');
    await reservePlaces(db, 'u1', g1, [a, null, null]);
    await run([{ place: 1, prizeId: a, winners: [{ userId: 'u2', nickname: 'Оля' }] }]);
    expect((await currentTitles(db, ['u2'], at)).get('u2')).toBe('👑 Король вікторини');
    const g2 = randomUUID();
    const c = await make('C', '🧠 Ерудит');
    await reservePlaces(db, 'u1', g2, [c, null, null]);
    const at2 = new Date(at.getTime() + 1000);
    await awardPrizes(db, { gameId: g2, quizTitle: 'Q', at: at2, outcomes: [{ place: 1, prizeId: c, winners: [{ userId: 'u3', nickname: 'Петро' }, { userId: 'u2', nickname: 'Оля' }] }] });
    expect((await currentTitles(db, ['u2', 'u3'], at)).get('u2')).toBe('🧠 Ерудит');
    const late = new Date(at2.getTime() + TITLE_MS + 1);
    expect((await currentTitles(db, ['u2'], late)).size).toBe(0);
    expect((await showcaseOf(db, 'u2', late)).title).toBeNull();
    expect((await showcaseOf(db, 'u2', at)).title?.text).toBe('🧠 Ерудит');
  });

  it('returns reserved prizes that are not among the outcomes', async () => {
    const a = await make('A');
    const b = await make('B');
    await reservePlaces(db, 'u1', g1, [a, b, null]);
    await run([{ place: 1, prizeId: a, winners: [{ userId: 'u2', nickname: 'Оля' }] }]);
    expect((await rowOf(b)).status).toBe('free');
  });

  it('ignores an outcome for a prize that no longer exists', async () => {
    await run([{ place: 1, prizeId: randomUUID(), winners: [{ userId: 'u2', nickname: 'Оля' }] }]);
    expect(await awards()).toEqual([]);
  });
});

describe('showcase', () => {
  it('returns at most 60 awards, newest first, and deleteAward removes a row', async () => {
    await db.insert(prizeAward).values(
      Array.from({ length: 61 }, (_, i) => ({
        userId: 'u2',
        prizeId: randomUUID(),
        gameId: randomUUID(),
        place: 1 as const,
        content: content('X'),
        quizTitle: `Q${i}`,
        nickname: 'Оля',
        awardedAt: new Date(at.getTime() + i * 1000),
      })),
    );
    const { awards: list } = await showcaseOf(db, 'u2');
    expect(list).toHaveLength(60);
    expect(list[0]!.quizTitle).toBe('Q60');
    expect(await deleteAward(db, list[0]!.id)).toBe(true);
    expect(await deleteAward(db, list[0]!.id)).toBe(false);
  });
});
