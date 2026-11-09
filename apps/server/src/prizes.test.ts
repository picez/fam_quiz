import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PrizeContent, TrophyDecor } from '@quiz/shared';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';
import { liveRoom, prize, user } from './db/schema';
import { createPrize, deletePrize, listAllPrizes, listPrizes, releasePrizes, releaseStalePrizes, reservePlaces, updatePrize } from './prizes';
import { RoomManager } from './rooms/manager';

const content = (name: string): PrizeContent => ({ name, trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false });

let db: Awaited<ReturnType<typeof createTestDb>>;
let manager: RoomManager;
beforeEach(async () => {
  db = await createTestDb();
  manager = new RoomManager(new FakeScheduler());
  await db.insert(user).values([
    { id: 'u1', name: 'One', email: 'u1@example.com' },
    { id: 'u2', name: 'Two', email: 'u2@example.com' },
  ]);
});

const make = async (owner: string, name: string) => {
  const result = await createPrize(db, owner, content(name));
  if (!result.ok) throw new Error('create failed');
  return result.prize.id;
};
const rowOf = async (id: string) => (await db.select().from(prize).where(eq(prize.id, id)))[0];

describe('prize storage', () => {
  it('creates free prizes, lists newest first for the owner only, and caps the store at 50', async () => {
    const a = await make('u1', 'A');
    const b = await make('u1', 'B');
    const list = await listPrizes(db, 'u1');
    expect(list.map((p) => p.id)).toEqual([b, a]);
    expect(list[0]!.status).toBe('free');
    expect(await listPrizes(db, 'u2')).toEqual([]);
    for (let i = 2; i < 50; i += 1) await make('u1', `P${i}`);
    expect(await createPrize(db, 'u1', content('51'))).toEqual({ ok: false, error: 'too_many_prizes' });
  });

  it('edits only free prizes of the owner', async () => {
    const a = await make('u1', 'A');
    const renamed = await updatePrize(db, 'u1', a, content('New'));
    expect(renamed.ok && renamed.prize.content.name).toBe('New');
    expect(await updatePrize(db, 'u2', a, content('X'))).toEqual({ ok: false, error: 'not_found' });
    await reservePlaces(db, 'u1', randomUUID(), [a, null, null]);
    expect(await updatePrize(db, 'u1', a, content('Y'))).toEqual({ ok: false, error: 'prize_in_game' });
  });
});

const photo = (n: number) => ({ url: `/uploads/${n.toString(16).padStart(32, '0')}.jpg`, crop: { x: 0.5, y: 0.5, scale: 1 } });
const decor: TrophyDecor = {
  photos: [photo(1), photo(2)],
  photoPlace: 'ring',
  frame: 'none',
  photoStyle: 'normal',
  inscriptions: [{ place: 'rim', text: 'Для найкращих', font: null, look: 'engraved', color: '#3a2a0e' }],
  effect: { kind: 'none' },
  appearance: 'spin',
  stickers: [],
};
const withTrophy = (name: string, trophy: PrizeContent['trophy']): PrizeContent => ({ ...content(name), trophy });

describe('trophy decor', () => {
  const makeDecorated = async () => {
    const r = await createPrize(db, 'u1', withTrophy('D', { kind: 'cup', material: 'gold', decor }));
    if (!r.ok) throw new Error('create failed');
    return r.prize.id;
  };

  it('old client omits decor: the stored decor survives an update without it', async () => {
    const id = await makeDecorated();
    const result = await updatePrize(db, 'u1', id, withTrophy('D', { kind: 'cup', material: 'silver' }));
    expect(result.ok).toBe(true);
    expect((await rowOf(id))!.content.trophy).toEqual({ kind: 'cup', material: 'silver', decor });
  });

  it('decor null removes it', async () => {
    const id = await makeDecorated();
    await updatePrize(db, 'u1', id, withTrophy('D', { kind: 'cup', material: 'gold', decor: null }));
    const trophy = (await rowOf(id))!.content.trophy!;
    expect(trophy).toEqual({ kind: 'cup', material: 'gold' });
    expect('decor' in trophy).toBe(false);
  });

  it('kind change keeps decor', async () => {
    const id = await makeDecorated();
    await updatePrize(db, 'u1', id, withTrophy('D', { kind: 'star', material: 'gold' }));
    expect((await rowOf(id))!.content.trophy).toEqual({ kind: 'star', material: 'gold', decor });
  });

  it('an explicit new decor replaces the stored one', async () => {
    const id = await makeDecorated();
    const next = { ...decor, photos: [photo(3)] };
    await updatePrize(db, 'u1', id, withTrophy('D', { kind: 'cup', material: 'gold', decor: next }));
    expect((await rowOf(id))!.content.trophy).toEqual({ kind: 'cup', material: 'gold', decor: next });
  });

  it('a prize without a trophy stays without one', async () => {
    const id = await makeDecorated();
    await updatePrize(db, 'u1', id, withTrophy('D', null));
    expect((await rowOf(id))!.content.trophy).toBeNull();
  });

  it('create checks the level only when one is given', async () => {
    const locked = { ...decor, inscriptions: [{ place: 'rim' as const, text: 'Ася', font: 'brush' as const, look: 'engraved' as const, color: '#3a2a0e' }] };
    const trophy = { kind: 'cup' as const, material: 'gold' as const, decor: locked };
    expect(await createPrize(db, 'u1', withTrophy('L', trophy), 1)).toEqual({ ok: false, error: 'decor_locked' });
    expect((await createPrize(db, 'u1', withTrophy('L', trophy))).ok).toBe(true);
  });

  it('create drops a null decor', async () => {
    const r = await createPrize(db, 'u1', withTrophy('N', { kind: 'cup', material: 'gold', decor: null }));
    if (!r.ok) throw new Error('create failed');
    expect('decor' in (await rowOf(r.prize.id))!.content.trophy!).toBe(false);
    expect('decor' in r.prize.content.trophy!).toBe(false);
  });
});

describe('reserving places', () => {
  it('reserves prizes for a game and returns them in place order', async () => {
    const [a, b] = [await make('u1', 'A'), await make('u1', 'B')];
    const g1 = randomUUID();
    const result = await reservePlaces(db, 'u1', g1, [a, null, b]);
    expect(result.ok && result.placed.map((p) => [p.place, p.id])).toEqual([[1, a], [3, b]]);
    expect((await rowOf(a))!.status).toBe('reserved');
    expect((await rowOf(b))!.reservedGame).toBe(g1);
  });

  it('lets the same game take its own prizes again and frees the ones left out', async () => {
    const [a, b] = [await make('u1', 'A'), await make('u1', 'B')];
    const g1 = randomUUID();
    await reservePlaces(db, 'u1', g1, [a, null, b]);
    const again = await reservePlaces(db, 'u1', g1, [b, a, null]);
    expect(again.ok && again.placed.map((p) => [p.place, p.id])).toEqual([[1, b], [2, a]]);
    await reservePlaces(db, 'u1', g1, [a, null, null]);
    expect(await rowOf(b)).toMatchObject({ status: 'free', reservedGame: null });
  });

  it('refuses a prize held by another game and rolls everything back', async () => {
    const [a, b] = [await make('u1', 'A'), await make('u1', 'B')];
    const [g1, g2] = [randomUUID(), randomUUID()];
    await reservePlaces(db, 'u1', g1, [a, null, null]);
    await reservePlaces(db, 'u1', g2, [null, b, null]);
    const c = await make('u1', 'C');
    expect(await reservePlaces(db, 'u1', g2, [c, a, null])).toEqual({ ok: false, error: 'prize_taken' });
    expect(await rowOf(a)).toMatchObject({ status: 'reserved', reservedGame: g1 });
    expect(await rowOf(b)).toMatchObject({ status: 'reserved', reservedGame: g2 });
    expect(await rowOf(c)).toMatchObject({ status: 'free', reservedGame: null });
  });

  it('refuses a prize of someone else', async () => {
    const a = await make('u1', 'A');
    expect(await reservePlaces(db, 'u2', randomUUID(), [a, null, null])).toEqual({ ok: false, error: 'prize_taken' });
    expect((await rowOf(a))!.status).toBe('free');
  });
});

describe('giving prizes back', () => {
  it('releases the reservations of a game but not awarded prizes', async () => {
    const [a, b] = [await make('u1', 'A'), await make('u1', 'B')];
    const g1 = randomUUID();
    await reservePlaces(db, 'u1', g1, [a, b, null]);
    await db.update(prize).set({ status: 'awarded' }).where(eq(prize.id, b));
    await releasePrizes(db, g1);
    expect(await rowOf(a)).toMatchObject({ status: 'free', reservedGame: null });
    expect((await rowOf(b))!.status).toBe('awarded');
  });

  it('sweeps reservations of games that are not alive', async () => {
    const [a, b] = [await make('u1', 'A'), await make('u1', 'B')];
    const [g1, g2] = [randomUUID(), randomUUID()];
    await reservePlaces(db, 'u1', g1, [a, null, null]);
    await reservePlaces(db, 'u1', g2, [b, null, null]);
    expect(await releaseStalePrizes(db, [g1])).toBe(1);
    expect((await rowOf(a))!.status).toBe('reserved');
    expect((await rowOf(b))!.status).toBe('free');
  });
});

describe('deleting prizes', () => {
  it('deletes a free prize and a stale reservation', async () => {
    const [a, b] = [await make('u1', 'A'), await make('u1', 'B')];
    await reservePlaces(db, 'u1', randomUUID(), [b, null, null]);
    expect(await deletePrize(db, manager, a, 'u1')).toBe('deleted');
    expect(await deletePrize(db, manager, b, 'u1')).toBe('deleted');
    expect(await listPrizes(db, 'u1')).toEqual([]);
  });

  it('keeps a prize that lies in a game stored elsewhere', async () => {
    const a = await make('u1', 'A');
    const g1 = randomUUID();
    await reservePlaces(db, 'u1', g1, [a, null, null]);
    await db.insert(liveRoom).values({ code: 'ABCD', roomId: g1, data: {}, updatedAt: new Date() });
    expect(await deletePrize(db, manager, a, 'u1')).toBe('prize_in_game');
    expect(await rowOf(a)).toBeDefined();
  });

  it('refuses with prize_in_game when the prize was put into a game between the read and the delete', async () => {
    const a = await make('u1', 'A');
    const g1 = randomUUID();
    // У мить видалення інший запит кладе приз у гру; база виконує його раніше (той самий черговий зв'язок).
    const racing = new Proxy(db, {
      get(target, key, receiver) {
        if (key === 'delete') void reservePlaces(target, 'u1', g1, [a, null, null]);
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    expect(await deletePrize(racing, manager, a, 'u1')).toBe('prize_in_game');
    expect(await rowOf(a)).toMatchObject({ status: 'reserved', reservedGame: g1 });
  });

  it('does not delete a prize of someone else or one already awarded', async () => {
    const [a, b] = [await make('u1', 'A'), await make('u1', 'B')];
    await db.update(prize).set({ status: 'awarded' }).where(eq(prize.id, b));
    expect(await deletePrize(db, manager, a, 'u2')).toBe('not_found');
    expect(await deletePrize(db, manager, b, 'u1')).toBe('not_found');
  });

  it('lets the admin delete reserved and awarded prizes and list all of them', async () => {
    const [a, b] = [await make('u1', 'A'), await make('u2', 'B')];
    await reservePlaces(db, 'u1', randomUUID(), [a, null, null]);
    await db.update(prize).set({ status: 'awarded' }).where(eq(prize.id, b));
    const all = await listAllPrizes(db);
    expect(all.map((p) => [p.ownerId, p.status]).sort()).toEqual([['u1', 'reserved'], ['u2', 'awarded']]);
    expect(await deletePrize(db, manager, a, null)).toBe('deleted');
    expect(await deletePrize(db, manager, b, null)).toBe('deleted');
    expect(await deletePrize(db, manager, b, null)).toBe('not_found');
  });
});
