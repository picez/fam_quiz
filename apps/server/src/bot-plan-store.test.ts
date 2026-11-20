import { classicRound, makeRoundsQuiz, single } from '@quiz/engine/testing';
import { BOT_PLANS_MAX, BOT_USER_ID, type BotPlanInput, type Quiz } from '@quiz/shared';
import { desc, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { banUser } from './bans';
import { botGroups, cancelPlan, createPlan, listPlans, recipientsOf, updatePlan } from './bot-plan-store';
import { ensureBotAccount } from './bot-account';
import type { Db } from './db/client';
import { adminAction, botPlan, groupMember, user, userBan } from './db/schema';
import { createGroup, deleteGroup } from './group-store';
import { ensureProfile } from './profiles';
import { saveSubscription } from './push-store';
import { createQuiz } from './quizzes';
import { createTestDb } from './testing/test-db';

let db: Db;
let quizId: string;
let foreignQuizId: string;
const NOW = new Date('2026-11-20T10:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 86_400_000;
const at = (ms: number) => new Date(NOW.getTime() + ms);
const TITLE = 'Карпатські вершини 56';
const peaks = (): Quiz => ({
  ...makeRoundsQuiz([classicRound('r0', [single, { ...single, id: 'q2' }].map((q) => ({ ...q, timeLimit: 30 })))]),
  title: TITLE,
});
const input = (extra: Partial<BotPlanInput> = {}): BotPlanInput => ({
  quizId,
  startsAt: at(DAY).toISOString(),
  recipients: { kind: 'none' },
  autoStartMin: null,
  weekly: false,
  listed: true,
  ...extra,
});
const logRows = () => db.select().from(adminAction).orderBy(desc(adminAction.at));
const logOf = async (kind: string) => (await db.select().from(adminAction).where(eq(adminAction.kind, kind as never))).map((row) => ({ adminId: row.adminId, targetUserId: row.targetUserId, details: row.details }));

async function person(id: string, name: string) {
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  await ensureProfile(db, id);
}
const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: 'BP', auth: 'a' } });

beforeAll(async () => {
  db = await createTestDb();
  expect(await ensureBotAccount(db)).toBe(true);
  await person('adm', 'Адмін 56');
  await person('olya', 'Оля');
  await person('petro', 'Петро');
  await person('bad', 'Порушник');
  await banUser(db, { adminId: 'adm', targetId: 'bad', reason: null, now: NOW });
  quizId = await createQuiz(db, BOT_USER_ID, peaks());
  foreignQuizId = await createQuiz(db, 'adm', peaks());
});

async function reset() {
  await db.delete(botPlan);
  await db.delete(adminAction);
}

describe('bot plan store (56)', () => {
  it('creates a plan with a title snapshot and logs it', async () => {
    await reset();
    const made = await createPlan(db, 'adm', input({ autoStartMin: 10, weekly: true }), NOW);
    expect(made).toMatchObject({ ok: true, plan: { quizId, title: TITLE, status: 'scheduled', autoStartMin: 10, weekly: true, reason: null, code: null } });
    if (!made.ok) throw new Error('not made');
    expect(made.plan.startsAt).toBe(at(DAY).toISOString());
    const listed = await listPlans(db);
    expect(listed).toEqual([made.plan]);
    expect(listed[0]!.to).toEqual({ kind: 'none' });
    const [row] = await db.select().from(botPlan);
    expect(row).toMatchObject({ createdBy: 'adm', recipients: 'none', people: [], groupId: null, remindedAt: null, wallTime: '12:00' });
    expect(await logOf('bot_plan_create')).toEqual([{ adminId: 'adm', targetUserId: BOT_USER_ID, details: { title: TITLE, when: at(DAY).toISOString() } }]);
  });

  it('refuses a past moment, a far moment, a foreign quiz, a missing group and an unknown or banned person', async () => {
    await reset();
    expect(await createPlan(db, 'adm', input({ startsAt: NOW.toISOString() }), NOW)).toEqual({ ok: false, error: 'plan_time' });
    expect(await createPlan(db, 'adm', input({ startsAt: at(-HOUR).toISOString() }), NOW)).toEqual({ ok: false, error: 'plan_time' });
    expect(await createPlan(db, 'adm', input({ startsAt: at(61 * DAY).toISOString() }), NOW)).toEqual({ ok: false, error: 'plan_time' });
    expect((await createPlan(db, 'adm', input({ startsAt: at(60 * DAY).toISOString() }), NOW)).ok).toBe(true);
    await reset();
    expect(await createPlan(db, 'adm', input({ quizId: foreignQuizId }), NOW)).toEqual({ ok: false, error: 'not_found' });
    expect(await createPlan(db, 'adm', input({ quizId: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b' }), NOW)).toEqual({ ok: false, error: 'not_found' });
    const noGroup = { kind: 'group' as const, groupId: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' };
    expect(await createPlan(db, 'adm', input({ recipients: noGroup }), NOW)).toEqual({ ok: false, error: 'invalid_payload' });
    for (const userIds of [['olya', 'ghost'], ['olya', 'bad'], [BOT_USER_ID]]) {
      expect(await createPlan(db, 'adm', input({ recipients: { kind: 'people', userIds } }), NOW)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await logRows()).toEqual([]);
    expect(await db.select().from(botPlan)).toEqual([]);
  });

  it('a plan keeps listed (62)', async () => {
    await reset();
    const made = await createPlan(db, 'adm', input({ listed: false }), NOW);
    if (!made.ok) throw new Error(made.error);
    expect(made.plan.listed).toBe(false);
    expect((await listPlans(db))[0]!.listed).toBe(false);
    const updated = await updatePlan(db, 'adm', made.plan.id, input({ listed: true }), NOW);
    expect(updated).toMatchObject({ ok: true, plan: { listed: true } });
    expect((await db.select().from(botPlan))[0]!.listed).toBe(true);
  });

  it('the 21st scheduled plan is refused, a cancelled one frees the place', async () => {
    await reset();
    const ids: string[] = [];
    for (let i = 0; i < BOT_PLANS_MAX; i++) {
      const made = await createPlan(db, 'adm', input({ startsAt: at(DAY + i * HOUR).toISOString() }), NOW);
      if (!made.ok) throw new Error(made.error);
      ids.push(made.plan.id);
    }
    const logged = (await logRows()).length;
    expect(await createPlan(db, 'adm', input(), NOW)).toEqual({ ok: false, error: 'plans_full' });
    expect((await logRows()).length).toBe(logged);
    expect((await cancelPlan(db, 'adm', ids[0]!, NOW)).ok).toBe(true);
    expect((await createPlan(db, 'adm', input(), NOW)).ok).toBe(true);
    expect(await createPlan(db, 'adm', input(), NOW)).toEqual({ ok: false, error: 'plans_full' });

    await reset();
    for (let i = 0; i < BOT_PLANS_MAX - 1; i++) {
      expect((await createPlan(db, 'adm', input(), NOW)).ok).toBe(true);
    }
    const both = await Promise.all([createPlan(db, 'adm', input(), NOW), createPlan(db, 'adm', input(), NOW)]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.filter((r) => !r.ok && r.error === 'plans_full')).toHaveLength(1);
    expect((await db.select().from(botPlan).where(eq(botPlan.status, 'scheduled'))).length).toBe(BOT_PLANS_MAX);
  });

  it('only a scheduled plan changes or cancels; a new time forgets the reminder', async () => {
    await reset();
    const made = await createPlan(db, 'adm', input({ startsAt: at(HOUR).toISOString() }), NOW);
    if (!made.ok) throw new Error(made.error);
    const id = made.plan.id;
    await db.update(botPlan).set({ remindedAt: NOW }).where(eq(botPlan.id, id));

    const same = await updatePlan(db, 'adm', id, input({ startsAt: at(HOUR).toISOString(), autoStartMin: 15 }), NOW);
    expect(same).toMatchObject({ ok: true, plan: { autoStartMin: 15 } });
    expect((await db.select().from(botPlan))[0]!.remindedAt).toEqual(NOW);

    const moved = await updatePlan(db, 'adm', id, input({ startsAt: at(2 * HOUR).toISOString(), recipients: { kind: 'all' } }), NOW);
    expect(moved).toMatchObject({ ok: true, plan: { id, startsAt: at(2 * HOUR).toISOString(), to: { kind: 'all' } } });
    expect((await db.select().from(botPlan))[0]!.remindedAt).toBeNull();
    expect((await db.select().from(botPlan))[0]!.wallTime).toBe('14:00');
    expect((await logOf('bot_plan_update')).map((row) => row.details)).toEqual([
      { title: TITLE, when: at(HOUR).toISOString() },
      { title: TITLE, when: at(2 * HOUR).toISOString() },
    ]);
    expect(await updatePlan(db, 'adm', id, input({ startsAt: NOW.toISOString() }), NOW)).toEqual({ ok: false, error: 'plan_time' });

    const missing = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
    expect(await updatePlan(db, 'adm', missing, input(), NOW)).toEqual({ ok: false, error: 'not_found' });
    expect(await cancelPlan(db, 'adm', missing, NOW)).toEqual({ ok: false, error: 'not_found' });
    expect(await cancelPlan(db, 'adm', 'not-a-uuid', NOW)).toEqual({ ok: false, error: 'not_found' });

    const opened = await createPlan(db, 'adm', input(), NOW);
    if (!opened.ok) throw new Error(opened.error);
    await db.update(botPlan).set({ status: 'opened', roomCode: '123456' }).where(eq(botPlan.id, opened.plan.id));
    const logged = (await logRows()).length;
    expect(await updatePlan(db, 'adm', opened.plan.id, input(), NOW)).toEqual({ ok: false, error: 'plan_locked' });
    expect(await cancelPlan(db, 'adm', opened.plan.id, NOW)).toEqual({ ok: false, error: 'plan_locked' });
    expect((await logRows()).length).toBe(logged);

    const cancelled = await cancelPlan(db, 'adm', id, at(1000));
    expect(cancelled).toMatchObject({ ok: true, plan: { id, status: 'cancelled' } });
    expect((await db.select().from(botPlan).where(eq(botPlan.id, id)))[0]!.finishedAt).toEqual(at(1000));
    expect(await logOf('bot_plan_cancel')).toEqual([{ adminId: 'adm', targetUserId: BOT_USER_ID, details: { title: TITLE, when: at(2 * HOUR).toISOString() } }]);
    expect(await cancelPlan(db, 'adm', id, NOW)).toEqual({ ok: false, error: 'plan_locked' });
  });

  it('recipients: all with a subscription, a group, chosen people, never the banned or the bot', async () => {
    await reset();
    await saveSubscription(db, 'olya', sub('o1'), NOW);
    await saveSubscription(db, 'olya', sub('o2'), NOW);
    await saveSubscription(db, 'bad', sub('b1'), NOW);
    await saveSubscription(db, BOT_USER_ID, sub('q1'), NOW);
    const plan = async (recipients: BotPlanInput['recipients']) => {
      const made = await createPlan(db, 'adm', input({ recipients }), NOW);
      if (!made.ok) throw new Error(made.error);
      return (await db.select().from(botPlan).where(eq(botPlan.id, made.plan.id)))[0]!;
    };

    expect(await recipientsOf(db, await plan({ kind: 'none' }))).toEqual([]);
    expect(await recipientsOf(db, await plan({ kind: 'all' }))).toEqual(['olya']);

    const group = await createGroup(db, 'adm', { name: 'Родина 56', emoji: '🏡', description: '' }, NOW);
    if (!group.ok) throw new Error(group.error);
    await db.insert(groupMember).values([
      { groupId: group.id, userId: 'petro', role: 'member', joinedAt: NOW },
      { groupId: group.id, userId: 'bad', role: 'member', joinedAt: NOW },
    ]);
    const inGroup = await plan({ kind: 'group', groupId: group.id });
    expect((await recipientsOf(db, inGroup)).sort()).toEqual(['adm', 'petro']);
    await deleteGroup(db, group.id);
    const orphan = (await db.select().from(botPlan).where(eq(botPlan.id, inGroup.id)))[0]!;
    expect(await recipientsOf(db, orphan)).toEqual([]);

    const chosen = await plan({ kind: 'people', userIds: ['petro', 'olya'] });
    expect(await recipientsOf(db, chosen)).toEqual(['petro', 'olya']);
    await banUser(db, { adminId: 'adm', targetId: 'petro', reason: null, now: NOW });
    expect(await recipientsOf(db, chosen)).toEqual(['olya']);
    await db.delete(userBan).where(eq(userBan.userId, 'petro'));
  });

  it('the list shows active plans first and at most 20 finished ones with group names and nicknames', async () => {
    await reset();
    const group = await createGroup(db, 'olya', { name: 'Сусіди 56', emoji: '🌻', description: '' }, NOW);
    if (!group.ok) throw new Error(group.error);
    await db.insert(groupMember).values({ groupId: group.id, userId: 'petro', role: 'member', joinedAt: NOW });

    const later = await createPlan(db, 'adm', input({ startsAt: at(3 * HOUR).toISOString(), recipients: { kind: 'group', groupId: group.id } }), NOW);
    const sooner = await createPlan(db, 'adm', input({ startsAt: at(2 * HOUR).toISOString(), recipients: { kind: 'people', userIds: ['petro', 'olya'] } }), NOW);
    const opened = await createPlan(db, 'adm', input({ startsAt: at(4 * HOUR).toISOString() }), NOW);
    if (!later.ok || !sooner.ok || !opened.ok) throw new Error('not made');
    await db.update(botPlan).set({ status: 'opened', roomId: 'room-1', roomCode: '654321' }).where(eq(botPlan.id, opened.plan.id));

    const finishedRow = (i: number, status: 'played' | 'nobody' | 'failed' | 'cancelled') => ({
      quizId,
      title: `Минуле ${i}`,
      startsAt: at(-(i + 1) * HOUR),
      recipients: 'none' as const,
      status,
      reason: status === 'failed' ? ('server_down' as const) : null,
      finishedAt: at(-(i + 1) * HOUR),
      createdAt: NOW,
      updatedAt: NOW,
    });
    const kinds = ['played', 'nobody', 'failed', 'cancelled'] as const;
    await db.insert(botPlan).values(Array.from({ length: 25 }, (_, i) => finishedRow(i, kinds[i % 4]!)));

    const listed = await listPlans(db);
    expect(listed.map((p) => p.id).slice(0, 3)).toEqual([sooner.plan.id, later.plan.id, opened.plan.id]);
    expect(listed).toHaveLength(3 + 20);
    expect(listed.slice(3).map((p) => p.title)).toEqual(Array.from({ length: 20 }, (_, i) => `Минуле ${i}`));
    expect(listed[0]!.to).toEqual({ kind: 'people', people: [{ id: 'petro', nickname: 'Петро' }, { id: 'olya', nickname: 'Оля' }] });
    expect(listed[1]!.to).toEqual({ kind: 'group', groupId: group.id, name: 'Сусіди 56' });
    expect(listed[2]).toMatchObject({ status: 'opened', code: '654321' });
    expect(listed[5]).toMatchObject({ status: 'failed', reason: 'server_down', code: null });
    expect(JSON.stringify(listed)).not.toContain('@');

    expect(await botGroups(db)).toEqual([{ id: group.id, name: 'Сусіди 56', emoji: '🌻', members: 2 }]);
    await deleteGroup(db, group.id);
    expect((await listPlans(db))[1]!.to).toEqual({ kind: 'group', groupId: '', name: null });
    expect(await botGroups(db)).toEqual([]);
  });
});
