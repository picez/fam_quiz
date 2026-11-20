import type { AdminFeedRow, AdminGroupDetail, AdminGroupRow, AdminList, AdminLogEntry } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { feedEvent, groupMember, user } from './db/schema';
import { createGroup } from './group-store';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'PUT' | 'DELETE';

const NOW = new Date();
const call = (ctx: Ctx, method: Method, url: string, cookie?: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });

describe('admin moderation routes: feed and groups (63)', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let ctx: Ctx;
  let admin: { cookie: string; id: string };
  let olya: { cookie: string; id: string };
  let petro: string;
  let taras: string;
  let groupId: string;
  let eventId: string;
  const emails = new Set<string>();

  async function person(name: string) {
    const signed = await signUp(ctx.app, name);
    const me = (await call(ctx, 'GET', '/api/me', signed.cookie)).json() as { id: string };
    return { ...signed, id: me.id };
  }

  beforeAll(async () => {
    db = await createTestDb();
    ctx = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
    const a = await person('Адмін');
    emails.add(a.email.toLowerCase());
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, a.id));
    admin = a;
    olya = await person('Оля');
    petro = (await person('Петро')).id;
    taras = (await person('Тарас')).id;
    const made = await createGroup(db, olya.id, { name: 'Малинські', emoji: '🏡', description: '' }, NOW);
    if (!made.ok) throw new Error(made.error);
    groupId = made.id;
    await db.insert(groupMember).values([
      { groupId, userId: petro, role: 'member', joinedAt: NOW },
      { groupId, userId: taras, role: 'member', joinedAt: NOW },
    ]);
    const [row] = await db
      .insert(feedEvent)
      .values({ key: `level:${olya.id}:3`, userId: olya.id, kind: 'level', data: { kind: 'level', level: 3 }, at: NOW, createdAt: NOW })
      .returning({ id: feedEvent.id });
    eventId = row!.id;
  });
  afterAll(async () => {
    await ctx.shutdown();
  });

  it('the admin hides and shows a feed event', async () => {
    const url = `/api/admin/feed/${eventId}/hidden`;
    const hid = await call(ctx, 'PUT', url, admin.cookie, { hidden: true });
    expect(hid.statusCode).toBe(200);
    expect(hid.json()).toEqual({ changed: true });
    const again = await call(ctx, 'PUT', url, admin.cookie, { hidden: true });
    expect(again.json()).toEqual({ changed: false });
    const list = (await call(ctx, 'GET', `/api/admin/feed?user=${olya.id}`, admin.cookie)).json() as AdminList<AdminFeedRow>;
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]!.hidden).not.toBeNull();
    expect((await call(ctx, 'PUT', url, admin.cookie, { hidden: 'x' })).statusCode).toBe(400);
    expect((await call(ctx, 'PUT', '/api/admin/feed/not-a-uuid/hidden', admin.cookie, { hidden: true })).statusCode).toBe(404);
    expect((await call(ctx, 'PUT', url, admin.cookie, { hidden: false })).json()).toEqual({ changed: true });
    const shown = (await call(ctx, 'GET', `/api/admin/feed?user=${olya.id}&kind=level`, admin.cookie)).json() as AdminList<AdminFeedRow>;
    expect(shown.rows[0]!.hidden).toBeNull();
  });

  it('the admin moderates a group end to end', async () => {
    const found = (await call(ctx, 'GET', '/api/admin/groups?q=малин&page=1', admin.cookie)).json() as AdminList<AdminGroupRow>;
    expect(found.rows.map((r) => r.id)).toEqual([groupId]);
    const card = (await call(ctx, 'GET', `/api/admin/groups/${groupId}`, admin.cookie)).json() as AdminGroupDetail;
    expect(card.group.name).toBe('Малинські');
    expect(card.members).toHaveLength(3);

    const hide = await call(ctx, 'PUT', `/api/admin/groups/${groupId}/hidden`, admin.cookie, { hidden: true, reason: 'скарга' });
    expect(hide.statusCode).toBe(200);
    expect(hide.json()).toEqual({ changed: true });
    expect((await call(ctx, 'GET', `/api/groups/${groupId}`, olya.cookie)).statusCode).toBe(404);
    expect((await call(ctx, 'PUT', `/api/admin/groups/${groupId}/hidden`, admin.cookie, { hidden: 1 })).statusCode).toBe(400);

    expect((await call(ctx, 'DELETE', `/api/admin/groups/${groupId}/members/${petro}`, admin.cookie)).statusCode).toBe(200);
    const owner = await call(ctx, 'DELETE', `/api/admin/groups/${groupId}/members/${olya.id}`, admin.cookie);
    expect(owner.statusCode).toBe(409);
    expect(owner.json()).toEqual({ error: 'owner_must_transfer' });
    expect((await call(ctx, 'DELETE', `/api/admin/groups/${groupId}/members/${petro}`, admin.cookie)).statusCode).toBe(404);

    const pass = await call(ctx, 'PUT', `/api/admin/groups/${groupId}/owner`, admin.cookie, { userId: taras });
    expect(pass.statusCode).toBe(200);
    expect(pass.json()).toEqual({ changed: true });

    const wrong = await call(ctx, 'DELETE', `/api/admin/groups/${groupId}`, admin.cookie, { name: 'Інша' });
    expect(wrong.statusCode).toBe(409);
    expect(wrong.json()).toEqual({ error: 'group_name_mismatch' });
    const del = await call(ctx, 'DELETE', `/api/admin/groups/${groupId}`, admin.cookie, { name: 'Малинські' });
    expect(del.statusCode).toBe(204);
    const gone = await call(ctx, 'GET', `/api/admin/groups/${groupId}`, admin.cookie);
    expect(gone.statusCode).toBe(404);
    expect(gone.json()).toEqual({ error: 'group_not_found' });
    expect((await call(ctx, 'GET', '/api/admin/groups/not-a-uuid', admin.cookie)).statusCode).toBe(404);

    const log = (await call(ctx, 'GET', '/api/admin/log', admin.cookie)).json() as AdminList<AdminLogEntry>;
    const kinds = log.rows.map((r) => r.kind).filter((k) => k.startsWith('group_'));
    expect(kinds).toEqual(['group_delete', 'group_owner_transfer', 'group_member_remove', 'group_hide']);
  });

  it('item routes answer 404 for a missing group or record', async () => {
    const missing = '11111111-1111-4111-8111-111111111111';
    const res = await call(ctx, 'PUT', `/api/admin/groups/${missing}/items/${missing}/hidden`, admin.cookie, { hidden: true });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'group_not_found' });
    expect((await call(ctx, 'PUT', `/api/admin/groups/${missing}/items/x/hidden`, admin.cookie, { hidden: true })).statusCode).toBe(404);
  });

  it('responses carry no emails', async () => {
    const other = await createGroup(db, olya.id, { name: 'Друзі', emoji: '🏡', description: '' }, NOW);
    if (!other.ok) throw new Error(other.error);
    for (const url of ['/api/admin/feed', '/api/admin/groups', `/api/admin/groups/${other.id}`]) {
      const response = await call(ctx, 'GET', url, admin.cookie);
      expect(response.statusCode, url).toBe(200);
      expect(response.body, url).not.toContain('@');
    }
  });
});
