import type { AdminBroadcast, AdminBroadcasts, PushPayload } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { groupMember, profile, pushBroadcast, pushSubscription, user } from './db/schema';
import { createGroup } from './group-store';
import { ensureProfile } from './profiles';
import { saveSubscription } from './push-store';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'POST';

const PUB = 'BPublicKey';
const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: 'BP', auth: 'a' } });
const call = (ctx: Ctx, method: Method, url: string, cookie?: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });

describe('admin push broadcast routes (59)', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let ctx: Ctx;
  let admin: { cookie: string; id: string };
  let groupId: string;
  let olya: string;
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const status: Record<string, number> = {};
  const emails = new Set<string>();
  const NOW = new Date();

  async function person(c: Ctx, name: string) {
    const signed = await signUp(c.app, name);
    const me = (await call(c, 'GET', '/api/me', signed.cookie)).json() as { id: string };
    return { ...signed, id: me.id };
  }
  const input = (extra: object = {}) => ({ title: 'Нова вікторина', text: 'Заходьте грати', url: '/library', recipients: { kind: 'group', groupId }, ...extra });
  const list = async () => (await call(ctx, 'GET', '/api/admin/broadcasts', admin.cookie)).json() as AdminBroadcasts;
  const reset = async () => {
    await db.delete(pushBroadcast);
    sent.length = 0;
  };

  beforeAll(async () => {
    db = await createTestDb();
    const send = vi.fn(async (target: { endpoint: string }, body: string) => {
      sent.push({ endpoint: target.endpoint, payload: JSON.parse(body) as PushPayload });
      return { status: status[target.endpoint] ?? 201 };
    });
    ctx = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails, push: { publicKey: PUB, send } });
    const a = await person(ctx, 'Адмін');
    emails.add(a.email.toLowerCase());
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, a.id));
    admin = a;
    const o = await person(ctx, 'Оля');
    const t = await person(ctx, 'Тарас');
    const h = await person(ctx, 'Ганна');
    olya = o.id;
    await saveSubscription(db, o.id, sub('olya'), NOW);
    await saveSubscription(db, h.id, sub('hanna'), NOW);
    await ensureProfile(db, h.id);
    await db.update(profile).set({ adminPush: false }).where(eq(profile.userId, h.id));
    const group = await createGroup(db, t.id, { name: 'Малинські', emoji: '🏡', description: '' }, NOW);
    if (!group.ok) throw new Error(group.error);
    groupId = group.id;
    await db.insert(groupMember).values([
      { groupId, userId: o.id, role: 'member', joinedAt: NOW },
      { groupId, userId: h.id, role: 'member', joinedAt: NOW },
    ]);
  });
  afterAll(async () => {
    await ctx.shutdown();
  });

  it('the preview counts who will get it', async () => {
    const ok = await call(ctx, 'POST', '/api/admin/broadcasts/preview', admin.cookie, { recipients: { kind: 'group', groupId } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ people: 1 });
    const bad = await call(ctx, 'POST', '/api/admin/broadcasts/preview', admin.cookie, { recipients: { kind: 'none' } });
    expect(bad.statusCode).toBe(400);
  });

  it('send reaches only the audience and records delivered and failed', async () => {
    await reset();
    const made = await call(ctx, 'POST', '/api/admin/broadcasts', admin.cookie, input());
    expect(made.statusCode).toBe(201);
    expect(made.json()).toMatchObject({ status: 'sending', people: 1, title: 'Нова вікторина' });
    await ctx.push!.idle();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.endpoint).toContain('olya');
    expect(sent[0]!.payload).toMatchObject({ kind: 'broadcast', title: 'Нова вікторина', text: 'Заходьте грати', url: '/library' });
    const rows = (await list()).rows;
    expect(rows[0]).toMatchObject({ status: 'sent', delivered: 1, failed: 0 });

    // Друга розсилка після зсуву в минуле: мертвий ендпоінт рахується як помилка й зникає.
    await db.update(pushBroadcast).set({ createdAt: new Date(Date.now() - 3_600_000) });
    status['https://fcm.googleapis.com/fcm/send/olya'] = 410;
    const again = await call(ctx, 'POST', '/api/admin/broadcasts', admin.cookie, input());
    expect(again.statusCode).toBe(201);
    await ctx.push!.idle();
    const latest = (await list()).rows[0]!;
    expect(latest).toMatchObject({ status: 'sent', delivered: 0, failed: 1 });
    expect(await db.select().from(pushSubscription).where(eq(pushSubscription.userId, olya))).toEqual([]);
    delete status['https://fcm.googleapis.com/fcm/send/olya'];
    await saveSubscription(db, olya, sub('olya'), NOW);
  });

  it('nobody to send to is a clear error and no row', async () => {
    await reset();
    const response = await call(ctx, 'POST', '/api/admin/broadcasts', admin.cookie, input({ recipients: { kind: 'people', userIds: ['нема'] } }));
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'broadcast_nobody' });
    expect(await db.select().from(pushBroadcast)).toEqual([]);
    expect((await list()).limits).toMatchObject({ nextAt: null, lastDay: 0 });
  });

  it('the limit answers with the next time', async () => {
    await reset();
    expect((await call(ctx, 'POST', '/api/admin/broadcasts', admin.cookie, input())).statusCode).toBe(201);
    await ctx.push!.idle();
    const second = await call(ctx, 'POST', '/api/admin/broadcasts', admin.cookie, input());
    expect(second.statusCode).toBe(409);
    const body = second.json() as { error: string; nextAt: string };
    expect(body.error).toBe('broadcast_too_soon');
    const { limits } = await list();
    expect(limits).toEqual({ nextAt: body.nextAt, lastDay: 1, dayMax: 10 });
  });

  it('a title of 61 or a text of 161 is 400', async () => {
    await reset();
    expect((await call(ctx, 'POST', '/api/admin/broadcasts', admin.cookie, input({ title: 'а'.repeat(61) }))).statusCode).toBe(400);
    expect((await call(ctx, 'POST', '/api/admin/broadcasts', admin.cookie, input({ text: 'а'.repeat(161) }))).statusCode).toBe(400);
    expect(await db.select().from(pushBroadcast)).toEqual([]);
  });

  it('no push on the server is 503 push_off and pushOn false', async () => {
    const off = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
    try {
      const second = await signUp(off.app, 'Адмін2');
      const { cookie } = second;
      emails.add(second.email.toLowerCase());
      await db.update(user).set({ emailVerified: true }).where(eq(user.email, second.email));
      const post = await call(off, 'POST', '/api/admin/broadcasts', cookie, input());
      expect(post.statusCode).toBe(503);
      expect(post.json()).toEqual({ error: 'push_off' });
      expect(((await call(off, 'GET', '/api/admin/broadcasts', cookie)).json() as AdminBroadcasts).pushOn).toBe(false);
    } finally {
      await off.shutdown();
    }
  });

  it('no email anywhere', async () => {
    await reset();
    const post = await call(ctx, 'POST', '/api/admin/broadcasts', admin.cookie, input());
    await ctx.push!.idle();
    expect(post.body).not.toContain('@');
    expect((await call(ctx, 'GET', '/api/admin/broadcasts', admin.cookie)).body).not.toContain('@');
    expect((post.json() as AdminBroadcast).admin).not.toBeNull();
  });
});
