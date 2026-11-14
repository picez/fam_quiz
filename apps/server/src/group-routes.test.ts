import type { GroupDetail, GroupInviteCard, GroupItem } from '@quiz/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { groupItem, groupMember, user } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Db = Awaited<ReturnType<typeof createTestDb>>;
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
interface Person {
  cookie: string;
  id: string;
}

const MISSING = '99999999-9999-4999-8999-999999999999';
const group = { name: 'Родина Квіткових', emoji: '🌻', description: 'Усі, хто збирається на свята в бабусі' };
const record = { kind: 'story', text: 'Як тато заблукав у лісі по гриби', about: [], answer: 'Тато', year: 1998, photo: null, surprise: false };

let ctx: Ctx;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.shutdown();
});

const call = (method: Method, url: string, cookie?: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });

async function person(name: string): Promise<Person> {
  const { cookie } = await signUp(ctx.app, name);
  const id = ((await call('GET', '/api/me', cookie)).json() as { id: string }).id;
  await call('GET', '/api/me/profile', cookie);
  return { cookie, id };
}

/** Оля створює групу, Петро вступає за посиланням. */
async function family() {
  const olia = await person('Оля');
  const petro = await person('Петро');
  const created = await call('POST', '/api/groups', olia.cookie, group);
  expect(created.statusCode).toBe(201);
  const detail = created.json() as GroupDetail;
  expect(detail.inviteCode).toBeDefined();
  const code = detail.inviteCode as string;
  expect((await call('POST', `/api/groups/join/${code}`, petro.cookie)).statusCode).toBe(200);
  return { olia, petro, id: detail.id, code };
}

describe('group routes (12k)', () => {
  it('checks membership on every group route: a stranger gets the same 404 as a missing group', async () => {
    const { olia, id } = await family();
    const vira = await person('Віра');
    const item = (await call('POST', `/api/groups/${id}/items`, olia.cookie, record)).json() as GroupItem;
    const routes = (groupId: string): [Method, string, unknown?][] => [
      ['GET', `/api/groups/${groupId}`],
      ['PUT', `/api/groups/${groupId}`, group],
      ['DELETE', `/api/groups/${groupId}`],
      ['POST', `/api/groups/${groupId}/code`],
      ['POST', `/api/groups/${groupId}/owner`, { userId: vira.id }],
      ['DELETE', `/api/groups/${groupId}/members/${olia.id}`],
      ['POST', `/api/groups/${groupId}/leave`],
      ['POST', `/api/groups/${groupId}/invites`, { userIds: [vira.id] }],
      ['DELETE', `/api/groups/${groupId}/invites/${vira.id}`],
      ['GET', `/api/groups/${groupId}/items`],
      ['POST', `/api/groups/${groupId}/items`, record],
      ['PUT', `/api/groups/${groupId}/items/${item.id}`, record],
      ['DELETE', `/api/groups/${groupId}/items/${item.id}`],
      ['POST', `/api/groups/${groupId}/uses`, { quizId: MISSING, itemIds: [item.id] }],
    ];
    const missing = routes(MISSING);
    for (const [index, [method, url, payload]] of routes(id).entries()) {
      const stranger = await call(method, url, vira.cookie, payload);
      const absent = await call(missing[index][0], missing[index][1], vira.cookie, missing[index][2]);
      expect([method, url, stranger.statusCode], `${method} ${url}`).toEqual([method, url, 404]);
      expect(stranger.json()).toEqual({ error: 'group_not_found' });
      expect(stranger.body).toBe(absent.body);
      expect((await call(method, url, undefined, payload)).statusCode, `${method} ${url} without a session`).toBe(401);
    }
    for (const [method, url, payload] of routes('not-a-uuid')) {
      expect((await call(method, url, olia.cookie, payload)).statusCode, `${method} ${url}`).toBe(404);
    }
    // Група Олі ціла.
    expect((await call('GET', `/api/groups/${id}/items`, olia.cookie)).json()).toHaveLength(1);
  });

  it('owner-only routes answer 403 to a member and work for the owner', async () => {
    const { olia, petro, id } = await family();
    const ira = await person('Іра');
    await call('PUT', `/api/me/friends/${ira.id}`, olia.cookie);
    const ownerOnly: [Method, string, unknown?][] = [
      ['PUT', `/api/groups/${id}`, group],
      ['POST', `/api/groups/${id}/code`],
      ['POST', `/api/groups/${id}/owner`, { userId: olia.id }],
      ['DELETE', `/api/groups/${id}/members/${olia.id}`],
      ['POST', `/api/groups/${id}/invites`, { userIds: [ira.id] }],
      ['DELETE', `/api/groups/${id}/invites/${ira.id}`],
      ['DELETE', `/api/groups/${id}`],
    ];
    for (const [method, url, payload] of ownerOnly) {
      const answer = await call(method, url, petro.cookie, payload);
      expect([method, url, answer.statusCode, answer.json()]).toEqual([method, url, 403, { error: 'not_owner' }]);
    }
    expect((await call('PUT', `/api/groups/${id}`, olia.cookie, { ...group, name: 'Квіткові' })).json()).toMatchObject({ name: 'Квіткові' });
    expect((await call('POST', `/api/groups/${id}/invites`, olia.cookie, { userIds: [ira.id] })).statusCode).toBe(200);
    expect((await call('DELETE', `/api/groups/${id}/invites/${ira.id}`, olia.cookie)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/groups/${id}/members/${petro.id}`, olia.cookie)).statusCode).toBe(204);
    expect((await call('GET', `/api/groups/${id}`, petro.cookie)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/groups/${id}`, olia.cookie)).statusCode).toBe(204);
    expect((await call('GET', `/api/groups/${id}`, olia.cookie)).statusCode).toBe(404);
  });

  it('joins by link with a preview; a fresh code kills the old link; a member sees no code', async () => {
    const olia = await person('Оля');
    const petro = await person('Петро');
    const created = (await call('POST', '/api/groups', olia.cookie, group)).json() as GroupDetail;
    const code = created.inviteCode as string;
    const preview = await call('GET', `/api/groups/join/${code}`, petro.cookie);
    expect(preview.json()).toMatchObject({ id: created.id, name: 'Родина Квіткових', people: 1, member: false, owner: { id: olia.id } });
    expect((await call('GET', `/api/groups/join/${code}`)).statusCode).toBe(401);
    expect((await call('POST', `/api/groups/join/${code}`, petro.cookie)).json()).toEqual({ id: created.id });

    const fresh = await call('POST', `/api/groups/${created.id}/code`, olia.cookie);
    const { inviteCode } = fresh.json() as { inviteCode: string };
    expect(inviteCode).not.toBe(code);
    expect((await call('GET', `/api/groups/join/${code}`, petro.cookie)).statusCode).toBe(404);
    expect((await call('POST', `/api/groups/join/${code}`, petro.cookie)).json()).toEqual({ error: 'group_not_found' });

    const forPetro = (await call('GET', `/api/groups/${created.id}`, petro.cookie)).json() as GroupDetail;
    expect(forPetro.members.map((m) => m.id)).toEqual([olia.id, petro.id]);
    expect(forPetro).not.toHaveProperty('inviteCode');
    expect(forPetro).not.toHaveProperty('pending');
    expect(((await call('GET', '/api/groups', petro.cookie)).json() as { groups: { id: string }[] }).groups.map((g) => g.id)).toEqual([created.id]);
  });

  it('invites a friend; the friend accepts', async () => {
    const { olia, id } = await family();
    const ira = await person('Іра');
    const vira = await person('Віра');
    expect((await call('PUT', `/api/me/friends/${ira.id}`, olia.cookie)).statusCode).toBeLessThan(300);
    const sent = await call('POST', `/api/groups/${id}/invites`, olia.cookie, { userIds: [ira.id, vira.id] });
    expect((sent.json() as { invited: { id: string }[] }).invited.map((p) => p.id)).toEqual([ira.id]);
    const invites = (await call('GET', '/api/me/group-invites', ira.cookie)).json() as GroupInviteCard[];
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ group: { id, name: 'Родина Квіткових', people: 2 }, from: { id: olia.id } });
    expect((await call('GET', '/api/me/group-invites', vira.cookie)).json()).toEqual([]);
    expect((await call('POST', `/api/me/group-invites/${id}/accept`, vira.cookie)).json()).toEqual({ error: 'invite_not_found' });

    expect((await call('POST', `/api/me/group-invites/${id}/accept`, ira.cookie)).json()).toEqual({ id });
    const detail = (await call('GET', `/api/groups/${id}`, olia.cookie)).json() as GroupDetail;
    expect(detail.members.map((m) => m.id)).toContain(ira.id);
    expect((await call('GET', '/api/me/group-invites', ira.cookie)).json()).toEqual([]);

    await call('POST', `/api/groups/${id}/invites`, olia.cookie, { userIds: [ira.id] });
    const another = await person('Марко');
    await call('PUT', `/api/me/friends/${another.id}`, olia.cookie);
    await call('POST', `/api/groups/${id}/invites`, olia.cookie, { userIds: [another.id] });
    expect((await call('DELETE', `/api/me/group-invites/${id}`, another.cookie)).statusCode).toBe(204);
    expect((await call('GET', '/api/me/group-invites', another.cookie)).json()).toEqual([]);
  });

  it('hides a surprise from the member it is about', async () => {
    const { olia, petro, id, code } = await family();
    const ira = await person('Іра');
    await call('POST', `/api/groups/join/${code}`, ira.cookie);
    const created = await call('POST', `/api/groups/${id}/items`, petro.cookie, {
      ...record,
      kind: 'fact',
      text: 'Оля колись пекла торт без борошна',
      about: [{ kind: 'member', userId: olia.id }],
      answer: null,
      surprise: true,
    });
    expect(created.statusCode).toBe(201);
    const surprise = created.json() as GroupItem;
    expect(surprise.about).toEqual([expect.objectContaining({ kind: 'member', userId: olia.id, former: false })]);
    expect(((await call('GET', `/api/groups/${id}/items`, olia.cookie)).json() as GroupItem[]).map((i) => i.id)).not.toContain(surprise.id);
    expect(((await call('GET', `/api/groups/${id}/items`, ira.cookie)).json() as GroupItem[]).map((i) => i.id)).toContain(surprise.id);
    const put = await call('PUT', `/api/groups/${id}/items/${surprise.id}`, olia.cookie, { ...record, text: 'Інше' });
    expect([put.statusCode, put.json()]).toEqual([404, { error: 'item_not_found' }]);
    const del = await call('DELETE', `/api/groups/${id}/items/${surprise.id}`, olia.cookie);
    expect([del.statusCode, del.json()]).toEqual([404, { error: 'item_not_found' }]);
    expect((await call('GET', `/api/groups/${id}`, olia.cookie)).json()).toMatchObject({ items: 0 });
    expect((await call('GET', `/api/groups/${id}`, ira.cookie)).json()).toMatchObject({ items: 1 });

    expect((await call('PUT', `/api/groups/${id}/items/${surprise.id}`, ira.cookie, record)).json()).toEqual({ error: 'not_author' });
    expect((await call('PUT', `/api/groups/${id}/items/not-a-uuid`, petro.cookie, record)).statusCode).toBe(404);
  });

  it('the owner hands over before leaving', async () => {
    const { olia, petro, id } = await family();
    const left = await call('POST', `/api/groups/${id}/leave`, olia.cookie);
    expect([left.statusCode, left.json()]).toEqual([409, { error: 'owner_must_transfer' }]);
    const stranger = await person('Віра');
    expect((await call('POST', `/api/groups/${id}/owner`, olia.cookie, { userId: stranger.id })).json()).toEqual({ error: 'member_not_found' });
    const moved = await call('POST', `/api/groups/${id}/owner`, olia.cookie, { userId: petro.id });
    expect(moved.json()).toMatchObject({ role: 'member' });
    expect((moved.json() as GroupDetail).members[0]).toMatchObject({ id: petro.id, role: 'owner' });
    expect((await call('POST', `/api/groups/${id}/leave`, olia.cookie)).statusCode).toBe(204);
    expect((await call('GET', `/api/groups/${id}`, olia.cookie)).statusCode).toBe(404);
  });

  it('limits through the routes: 10 groups, 30 people, 500 records', async () => {
    const busy = await person('Дана');
    for (let i = 0; i < 10; i++) expect((await call('POST', '/api/groups', busy.cookie, { ...group, name: `Група ${i}` })).statusCode).toBe(201);
    const eleventh = await call('POST', '/api/groups', busy.cookie, group);
    expect([eleventh.statusCode, eleventh.json()]).toEqual([409, { error: 'too_many_groups' }]);

    const { olia, id, code } = await family();
    const rows = Array.from({ length: 28 }, (_, i) => ({ id: `gr-filler-${i}`, name: `Гість ${i}`, email: `gr-filler-${i}@example.com` }));
    await db.insert(user).values(rows);
    await db.insert(groupMember).values(rows.map((r) => ({ groupId: id, userId: r.id, role: 'member' as const, joinedAt: new Date() })));
    const late = await person('Марко');
    const full = await call('POST', `/api/groups/join/${code}`, late.cookie);
    expect([full.statusCode, full.json()]).toEqual([409, { error: 'group_full' }]);

    await db.insert(groupItem).values(Array.from({ length: 500 }, (_, i) => ({ groupId: id, authorId: olia.id, kind: 'fact' as const, text: `Факт ${i}` })));
    const tooMany = await call('POST', `/api/groups/${id}/items`, olia.cookie, record);
    expect([tooMany.statusCode, tooMany.json()]).toEqual([409, { error: 'group_items_full' }]);
  });

  it('400 names the reason', async () => {
    const { olia, id } = await family();
    const long = await call('POST', '/api/groups', olia.cookie, { ...group, name: 'а'.repeat(41) });
    expect([long.statusCode, long.json()]).toEqual([400, { error: 'invalid_payload', reason: 'group_name' }]);
    const surprise = await call('POST', `/api/groups/${id}/items`, olia.cookie, { ...record, about: [{ kind: 'name', name: 'бабуся Ніна' }], surprise: true });
    expect([surprise.statusCode, surprise.json()]).toEqual([400, { error: 'invalid_payload', reason: 'surprise_needs_member' }]);
    const stranger = await person('Віра');
    const notMember = await call('POST', `/api/groups/${id}/items`, olia.cookie, { ...record, about: [{ kind: 'member', userId: stranger.id }] });
    expect([notMember.statusCode, notMember.json()]).toEqual([400, { error: 'invalid_payload', reason: 'about_not_member' }]);
    const bare = await call('POST', `/api/groups/${id}/items`, olia.cookie, { ...record, year: 'давно' });
    expect([bare.statusCode, bare.json()]).toEqual([400, { error: 'invalid_payload' }]);
  });

  it('the public profile says nothing about groups', async () => {
    const { olia, petro } = await family();
    const page = await call('GET', `/api/profiles/${olia.id}`, petro.cookie);
    expect(page.statusCode).toBe(200);
    expect(page.body).not.toMatch(/group/i);
    expect(page.body).not.toContain('Родина Квіткових');
  });

  it('throttles join-link checks: the 21st in a minute is 429', async () => {
    const { code } = await family();
    const guesser = await person('Гість');
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await call('GET', `/api/groups/join/${code}`, guesser.cookie)).statusCode);
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe('group record uses route (12l)', () => {
  async function quizOf(ownerId: string, title: string): Promise<string> {
    const { makeQuiz, single } = await import('@quiz/engine/testing');
    const { quiz } = await import('./db/schema');
    const source = makeQuiz([single]);
    const [row] = await db
      .insert(quiz)
      .values({ ownerId, title, description: '', settings: source.settings, rounds: source.rounds })
      .returning();
    return row.id;
  }

  it('marks records used only in my own quiz; the list shows the title', async () => {
    const { olia, petro, id } = await family();
    const item = (await call('POST', `/api/groups/${id}/items`, olia.cookie, record)).json() as GroupItem;
    expect(item.uses).toEqual([]);
    const quizId = await quizOf(olia.id, 'Родинна розминка');

    const foreign = await call('POST', `/api/groups/${id}/uses`, petro.cookie, { quizId, itemIds: [item.id] });
    expect([foreign.statusCode, foreign.json()]).toEqual([404, { error: 'quiz_not_found' }]);
    const empty = await call('POST', `/api/groups/${id}/uses`, olia.cookie, { quizId, itemIds: [] });
    expect([empty.statusCode, empty.json()]).toEqual([400, { error: 'invalid_payload' }]);

    const marked = await call('POST', `/api/groups/${id}/uses`, olia.cookie, { quizId, itemIds: [item.id] });
    expect([marked.statusCode, marked.json()]).toEqual([200, { marked: 1 }]);
    const forPetro = (await call('GET', `/api/groups/${id}/items`, petro.cookie)).json() as GroupItem[];
    expect(forPetro[0].uses).toMatchObject([{ quizId, title: 'Родинна розминка', mine: false }]);
  });
});
