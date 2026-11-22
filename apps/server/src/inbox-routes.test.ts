import type { InboxPage } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { pushBroadcast, user } from './db/schema';
import { addBroadcast } from './inbox-store';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;

describe('inbox routes (70)', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let ctx: Ctx;

  const get = (url: string, cookie?: string) => ctx.app.inject({ method: 'GET', url, headers: cookie === undefined ? {} : { cookie } });
  const read = (payload: unknown, cookie?: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/me/inbox/read', payload: payload as object, headers: cookie === undefined ? {} : { cookie } });

  async function account(name: string): Promise<{ cookie: string; id: string }> {
    const made = await signUp(ctx.app, name);
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, made.email));
    return { cookie: made.cookie, id: row!.id };
  }

  async function broadcastTo(userId: string, title: string, at: Date): Promise<void> {
    const [row] = await db.insert(pushBroadcast).values({ title, text: 'Текст', recipients: 'people', people: [userId], peopleCount: 1, createdAt: at }).returning();
    await addBroadcast(db, { broadcastId: row.id, userIds: [userId], now: at });
  }

  beforeAll(async () => {
    db = await createTestDb();
    ctx = await buildApp({ db, auth: TEST_AUTH });
  });
  afterAll(async () => {
    await ctx.shutdown();
  });

  it('a guest gets 401 on all three', async () => {
    for (const response of [await get('/api/me/inbox'), await get('/api/me/inbox/badge'), await read({ upTo: new Date().toISOString() })]) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('an empty inbox, then two items, then read up to the newest', async () => {
    const olya = await account('Оля');
    const taras = await account('Тарас');
    expect((await get('/api/me/inbox', olya.cookie)).json()).toEqual({ items: [], unread: 0 });
    expect((await get('/api/me/inbox/badge', olya.cookie)).json()).toEqual({ unread: 0 });

    await broadcastTo(olya.id, 'Перша', new Date('2026-11-20T10:00:00.000Z'));
    await broadcastTo(olya.id, 'Друга', new Date('2026-11-20T11:00:00.000Z'));
    await broadcastTo(taras.id, 'Чужа', new Date('2026-11-20T12:00:00.000Z'));
    expect((await get('/api/me/inbox/badge', olya.cookie)).json()).toEqual({ unread: 2 });
    const page = (await get('/api/me/inbox', olya.cookie)).json() as InboxPage;
    expect(page.items.map((item) => item.kind === 'broadcast' && item.title)).toEqual(['Друга', 'Перша']);
    expect(page.unread).toBe(2);

    const marked = await read({ upTo: page.items[0]!.at }, olya.cookie);
    expect(marked.statusCode).toBe(200);
    expect(marked.json()).toEqual({ unread: 0 });
    const again = (await get('/api/me/inbox', olya.cookie)).json() as InboxPage;
    expect(again.items.map((item) => item.read)).toEqual([true, true]);
    expect((await get('/api/me/inbox/badge', taras.cookie)).json()).toEqual({ unread: 1 });
  });

  it('a bad read body is 400', async () => {
    const olya = await account('Оля');
    for (const payload of [{ upTo: 'вчора' }, {}, { upTo: new Date().toISOString(), all: true }]) {
      const response = await read(payload, olya.cookie);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_payload' });
    }
  });

  it('each route is rate limited per account', async () => {
    const olya = await account('Оля');
    const taras = await account('Тарас');
    for (let i = 0; i < 60; i += 1) expect((await get('/api/me/inbox/badge', olya.cookie)).statusCode).toBe(200);
    expect((await get('/api/me/inbox/badge', olya.cookie)).statusCode).toBe(429);
    for (let i = 0; i < 60; i += 1) expect((await get('/api/me/inbox', olya.cookie)).statusCode).toBe(200);
    expect((await get('/api/me/inbox', olya.cookie)).statusCode).toBe(429);
    const upTo = new Date().toISOString();
    for (let i = 0; i < 30; i += 1) expect((await read({ upTo }, olya.cookie)).statusCode).toBe(200);
    expect((await read({ upTo }, olya.cookie)).statusCode).toBe(429);
    // В іншого акаунта свій лічильник.
    expect((await get('/api/me/inbox/badge', taras.cookie)).statusCode).toBe(200);
    expect((await read({ upTo }, taras.cookie)).statusCode).toBe(200);
  });
});
