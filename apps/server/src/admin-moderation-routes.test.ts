import { BOT_USER_ID, type AdminFeedRow, type AdminGroupDetail, type AdminGroupRow, type AdminList, type AdminLogEntry, type GroupItem, type InboxPage, type PushPayload } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { feedEvent, groupItem, groupMember, user } from './db/schema';
import { createGroup } from './group-store';
import { saveSubscription } from './push-store';
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

describe('admin moderation routes: adding to a group (72)', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let ctx: Ctx;
  let plain: Ctx;
  let admin: { cookie: string; id: string };
  let olya: { cookie: string; id: string };
  let petro: { cookie: string; id: string };
  let groupId: string;
  const emails = new Set<string>();
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: 'BP', auth: 'a' } });
  const post = (app: Ctx, url: string, cookie?: string, payload?: unknown) =>
    app.app.inject({ method: 'POST', url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });

  async function person(name: string) {
    const signed = await signUp(ctx.app, name);
    const me = (await call(ctx, 'GET', '/api/me', signed.cookie)).json() as { id: string };
    return { ...signed, id: me.id };
  }
  async function family(name: string) {
    const made = await createGroup(db, olya.id, { name, emoji: '🏡', description: '' }, NOW);
    if (!made.ok) throw new Error(made.error);
    return made.id;
  }
  const membersOf = async (id: string) => (await db.select().from(groupMember).where(eq(groupMember.groupId, id))).map((m) => m.userId).sort();

  beforeAll(async () => {
    db = await createTestDb();
    const send = vi.fn(async (target: { endpoint: string }, body: string) => {
      sent.push({ endpoint: target.endpoint, payload: JSON.parse(body) as PushPayload });
      return { status: 201 };
    });
    ctx = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails, push: { publicKey: 'BPublicKey', send } });
    // Той самий сервер без push-служби.
    plain = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
    const a = await person('Адмін');
    emails.add(a.email.toLowerCase());
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, a.id));
    admin = a;
    olya = await person('Оля');
    petro = await person('Петро');
    groupId = await family('Карпатські вечори');
  });
  afterAll(async () => {
    await ctx.shutdown();
    await plain.shutdown();
  });

  it('adds a subscribed person: 200 pushed, one group_added push to them, a «Вхідні» notice', async () => {
    await saveSubscription(db, petro.id, sub('petro'), NOW);
    sent.length = 0;
    const res = await post(ctx, `/api/admin/groups/${groupId}/members`, admin.cookie, { userId: petro.id });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ changed: true, pushed: true });
    await ctx.push!.idle();
    expect(sent).toEqual([{ endpoint: sub('petro').endpoint, payload: { kind: 'group_added', groupId, title: 'Карпатські вечори', locale: 'uk' } }]);
    expect(await membersOf(groupId)).toEqual([olya.id, petro.id].sort());
    const inbox = (await call(ctx, 'GET', '/api/me/inbox', petro.cookie)).json() as InboxPage;
    expect(inbox.items).toEqual([expect.objectContaining({ kind: 'group_added', group: { id: groupId, title: 'Карпатські вечори' }, read: false })]);
    // Власник групи нічого не отримує.
    expect(((await call(ctx, 'GET', '/api/me/inbox', olya.cookie)).json() as InboxPage).items).toEqual([]);

    const again = await post(ctx, `/api/admin/groups/${groupId}/members`, admin.cookie, { userId: petro.id });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'already_member' });
  });

  it('without a subscription or without the push service: pushed false, still a member', async () => {
    const ira = await person('Іра');
    sent.length = 0;
    const res = await post(ctx, `/api/admin/groups/${groupId}/members`, admin.cookie, { userId: ira.id });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ changed: true, pushed: false });
    await ctx.push!.idle();
    expect(sent).toEqual([]);

    const ivan = await person('Іван');
    await saveSubscription(db, ivan.id, sub('ivan'), NOW);
    const noService = await post(plain, `/api/admin/groups/${groupId}/members`, admin.cookie, { userId: ivan.id });
    expect(noService.statusCode).toBe(200);
    expect(noService.json()).toEqual({ changed: true, pushed: false });
    expect(await membersOf(groupId)).toContain(ivan.id);
  });

  it('maps every refusal to its status', async () => {
    const full = await family('Повна родина');
    for (let i = 0; i < 29; i++) {
      const id = `full-${i}`;
      await db.insert(user).values({ id, name: `Родич ${i}`, email: `${id}@example.com` });
      await db.insert(groupMember).values({ groupId: full, userId: id, role: 'member', joinedAt: NOW });
    }
    const busy = await person('Зайнятий');
    for (let i = 0; i < 10; i++) {
      const made = await createGroup(db, busy.id, { name: `Коло ${i}`, emoji: '🏡', description: '' }, NOW);
      if (!made.ok) throw new Error(made.error);
    }
    const banned = await person('Тарас');
    expect((await post(ctx, `/api/admin/users/${banned.id}/ban`, admin.cookie, {})).statusCode).toBeLessThan(300);
    const hidden = await family('Схована');
    expect((await call(ctx, 'PUT', `/api/admin/groups/${hidden}/hidden`, admin.cookie, { hidden: true })).statusCode).toBe(200);
    const nobody = await person('Новенька');

    const cases: [string, unknown, number, unknown][] = [
      [full, { userId: nobody.id }, 409, { error: 'group_full' }],
      [groupId, { userId: busy.id }, 409, { error: 'member_too_many_groups' }],
      [groupId, { userId: banned.id }, 409, { error: 'member_banned' }],
      [hidden, { userId: nobody.id }, 409, { error: 'group_hidden' }],
      [groupId, { userId: 'nobody-at-all' }, 404, { error: 'user_not_found' }],
      ['11111111-1111-4111-8111-111111111111', { userId: nobody.id }, 404, { error: 'group_not_found' }],
      ['not-a-uuid', { userId: nobody.id }, 404, { error: 'not_found' }],
      [groupId, {}, 400, { error: 'invalid_payload' }],
      [groupId, { userId: nobody.id, role: 'owner' }, 400, { error: 'invalid_payload' }],
    ];
    for (const [id, body, status, json] of cases) {
      const res = await post(ctx, `/api/admin/groups/${id}/members`, admin.cookie, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(status);
      expect(res.json()).toEqual(json);
    }
    expect(await membersOf(groupId)).not.toContain(nobody.id);
  });

  it('a non-admin and a guest get 404 and change nothing', async () => {
    const stranger = await person('Сторонній');
    const before = await membersOf(groupId);
    for (const cookie of [olya.cookie, undefined]) {
      const add = await post(ctx, `/api/admin/groups/${groupId}/members`, cookie, { userId: stranger.id });
      expect(add.statusCode).toBe(404);
      expect(add.json()).toEqual({ error: 'not_found' });
      const item = await post(ctx, `/api/admin/groups/${groupId}/items`, cookie, { kind: 'fact', text: 'Ні', about: [], answer: null, year: null, photo: null, surprise: false });
      expect(item.statusCode).toBe(404);
    }
    expect(await membersOf(groupId)).toEqual(before);
    expect(await db.select().from(groupItem).where(eq(groupItem.groupId, groupId))).toEqual([]);
  });

  it('adds a quiz-bot record a member sees with the bot as author; refusals keep their reasons', async () => {
    const item = { kind: 'fact', text: 'Дідусь Іван щоліта ходив на Говерлу', about: [{ kind: 'member', userId: olya.id }], answer: null, year: 1975, photo: null, surprise: false };
    const made = await post(ctx, `/api/admin/groups/${groupId}/items`, admin.cookie, item);
    expect(made.statusCode).toBe(201);
    const { id } = made.json() as { id: string };
    const list = (await call(ctx, 'GET', `/api/groups/${groupId}/items`, petro.cookie)).json() as GroupItem[];
    expect(list.find((i) => i.id === id)).toMatchObject({ text: item.text, author: { id: BOT_USER_ID, nickname: 'Квіз-бот' }, mine: false, canDelete: false });

    const bad: [unknown, number, unknown][] = [
      [{ ...item, surprise: true }, 400, { error: 'invalid_payload' }],
      [{ ...item, photo: '/uploads/abcdef0123456789.webp' }, 400, { error: 'invalid_payload' }],
      [{ ...item, text: '  ' }, 400, { error: 'invalid_payload', reason: 'item_text' }],
      [{ ...item, about: [{ kind: 'member', userId: 'chuzhyi' }] }, 400, { error: 'invalid_payload', reason: 'about_not_member' }],
    ];
    for (const [body, status, json] of bad) {
      const res = await post(ctx, `/api/admin/groups/${groupId}/items`, admin.cookie, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(status);
      expect(res.json()).toEqual(json);
    }
    const hidden = await family('Ще схована');
    await call(ctx, 'PUT', `/api/admin/groups/${hidden}/hidden`, admin.cookie, { hidden: true });
    const toHidden = await post(ctx, `/api/admin/groups/${hidden}/items`, admin.cookie, item);
    expect(toHidden.statusCode).toBe(409);
    expect(toHidden.json()).toEqual({ error: 'group_hidden' });
    const many = await family('Скриня');
    await db.insert(groupItem).values(Array.from({ length: 500 }, (_, i) => ({ groupId: many, authorId: olya.id, kind: 'fact' as const, text: `Факт ${i}` })));
    const toFull = await post(ctx, `/api/admin/groups/${many}/items`, admin.cookie, { ...item, about: [] });
    expect(toFull.statusCode).toBe(409);
    expect(toFull.json()).toEqual({ error: 'group_items_full' });
    expect((await post(ctx, '/api/admin/groups/not-a-uuid/items', admin.cookie, item)).statusCode).toBe(404);
  });
});
