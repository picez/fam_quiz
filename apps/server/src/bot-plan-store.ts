import {
  BOT_PLAN_AHEAD_MS,
  BOT_PLAN_HISTORY,
  BOT_PLANS_MAX,
  BOT_USER_ID,
  type AdminActionKind,
  type AdminBotGroup,
  type AdminBotPlan,
  type AdminBotPlanTo,
  type BotPlanInput,
  type BotPlanRecipients,
} from '@quiz/shared';
import { and, asc, count, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { logAction } from './bans';
import type { Db } from './db/client';
import { botPlan, familyGroup, groupMember, profile, pushSubscription, user } from './db/schema';
import { notHidden } from './feed-store';
import { kyivWallTime } from './kyiv-time';
import { getQuiz } from './quizzes';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type BotPlanRow = typeof botPlan.$inferSelect;
export type BotPlanError = 'not_found' | 'invalid_payload' | 'plan_time' | 'plans_full' | 'plan_locked';
export type BotPlanResult = { ok: true; plan: AdminBotPlan } | { ok: false; error: BotPlanError };

const ACTIVE = ['scheduled', 'opened'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: BotPlanError) => ({ ok: false, error }) as const;

/** Поля рядка з вводу адміна (title — знімок назви вікторини). */
interface Fields {
  quizId: string;
  title: string;
  startsAt: Date;
  recipients: BotPlanRow['recipients'];
  groupId: string | null;
  people: string[];
  autoStartMin: number | null;
  weekly: boolean;
  wallTime: string;
}

/** Перевірки вводу: момент, вікторина бота, наявна група, видимі люди. */
async function validate(db: Db | Tx, input: BotPlanInput, now: Date): Promise<{ ok: true; fields: Fields } | { ok: false; error: BotPlanError }> {
  const startsAt = new Date(input.startsAt);
  if (startsAt.getTime() <= now.getTime() || startsAt.getTime() > now.getTime() + BOT_PLAN_AHEAD_MS) return fail('plan_time');
  const quiz = await getQuiz(db as Db, BOT_USER_ID, input.quizId);
  if (quiz === null) return fail('not_found');
  const to = input.recipients;
  if (to.kind === 'group') {
    const [group] = await db.select({ id: familyGroup.id }).from(familyGroup).where(eq(familyGroup.id, to.groupId));
    if (group === undefined) return fail('invalid_payload');
  }
  if (to.kind === 'people') {
    const found = await db
      .select({ id: profile.userId })
      .from(profile)
      .where(and(inArray(profile.userId, to.userIds), notHidden(profile.userId)));
    if (found.length !== to.userIds.length) return fail('invalid_payload');
  }
  return {
    ok: true,
    fields: {
      quizId: input.quizId,
      title: quiz.title,
      startsAt,
      recipients: to.kind,
      groupId: to.kind === 'group' ? to.groupId : null,
      people: to.kind === 'people' ? to.userIds : [],
      autoStartMin: input.autoStartMin,
      weekly: input.weekly,
      wallTime: kyivWallTime(startsAt),
    },
  };
}

/** Рядки → вигляд адмінки; назви груп і ніки людей — по одному пакетному запиту. */
async function views(db: Db | Tx, rows: BotPlanRow[]): Promise<AdminBotPlan[]> {
  const groupIds = [...new Set(rows.flatMap((row) => (row.recipients === 'group' && row.groupId !== null ? [row.groupId] : [])))];
  const personIds = [...new Set(rows.flatMap((row) => (row.recipients === 'people' ? row.people : [])))];
  const groups = new Map<string, string>();
  if (groupIds.length > 0) {
    for (const g of await db.select({ id: familyGroup.id, name: familyGroup.name }).from(familyGroup).where(inArray(familyGroup.id, groupIds))) groups.set(g.id, g.name);
  }
  const nicknames = new Map<string, string>();
  if (personIds.length > 0) {
    for (const p of await db.select({ id: profile.userId, nickname: profile.nickname }).from(profile).where(inArray(profile.userId, personIds))) {
      nicknames.set(p.id, p.nickname ?? '');
    }
  }
  return rows.map((row) => {
    let to: AdminBotPlanTo;
    if (row.recipients === 'group') to = { kind: 'group', groupId: row.groupId ?? '', name: row.groupId === null ? null : (groups.get(row.groupId) ?? null) };
    else if (row.recipients === 'people') to = { kind: 'people', people: row.people.flatMap((id) => (nicknames.has(id) ? [{ id, nickname: nicknames.get(id)! }] : [])) };
    else to = { kind: row.recipients };
    return {
      id: row.id,
      quizId: row.quizId,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      to,
      autoStartMin: row.autoStartMin,
      weekly: row.weekly,
      status: row.status,
      reason: row.reason,
      code: row.roomCode,
    };
  });
}

/** Спершу всі scheduled/opened від найближчого, далі до BOT_PLAN_HISTORY завершених від найновішого. */
export async function listPlans(db: Db): Promise<AdminBotPlan[]> {
  const active = await db.select().from(botPlan).where(inArray(botPlan.status, [...ACTIVE])).orderBy(asc(botPlan.startsAt), asc(botPlan.id));
  const finished = await db
    .select()
    .from(botPlan)
    .where(notInArray(botPlan.status, [...ACTIVE]))
    .orderBy(desc(botPlan.startsAt), desc(botPlan.id))
    .limit(BOT_PLAN_HISTORY);
  return views(db, [...active, ...finished]);
}

/** Усі родинні групи з кількістю видимих учасників, за назвою. */
export async function botGroups(db: Db): Promise<AdminBotGroup[]> {
  const rows = await db
    .select({
      id: familyGroup.id,
      name: familyGroup.name,
      emoji: familyGroup.emoji,
      members: sql<number>`(select count(*)::int from ${groupMember} where ${groupMember.groupId} = ${familyGroup.id} and ${notHidden(groupMember.userId)})`,
    })
    .from(familyGroup)
    .orderBy(asc(familyGroup.name), asc(familyGroup.id));
  return rows.map((row) => ({ ...row, members: Number(row.members) }));
}

/** Один замок на всі плани: лічба scheduled і вставка не розійдуться між паралельними створеннями (і наступником серії, 56). */
export async function lockPlans(tx: Tx): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('bot_plans'))`);
}

async function log(tx: Tx, adminId: string, kind: AdminActionKind, row: BotPlanRow, now: Date): Promise<void> {
  await logAction(tx, { adminId, kind, targetUserId: BOT_USER_ID, details: { title: row.title, when: row.startsAt.toISOString() }, now });
}

export async function createPlan(db: Db, adminId: string, input: BotPlanInput, now: Date): Promise<BotPlanResult> {
  const checked = await validate(db, input, now);
  if (!checked.ok) return checked;
  return db.transaction(async (tx) => {
    await lockPlans(tx);
    const [scheduled] = await tx.select({ n: count() }).from(botPlan).where(eq(botPlan.status, 'scheduled'));
    if (Number(scheduled?.n ?? 0) >= BOT_PLANS_MAX) return fail('plans_full');
    const [row] = await tx
      .insert(botPlan)
      .values({ ...checked.fields, createdBy: adminId, createdAt: now, updatedAt: now })
      .returning();
    await log(tx, adminId, 'bot_plan_create', row!, now);
    return { ok: true, plan: (await views(tx, [row!]))[0]! } as const;
  });
}

/** Лише scheduled; новий час скидає нагадування. */
export async function updatePlan(db: Db, adminId: string, id: string, input: BotPlanInput, now: Date): Promise<BotPlanResult> {
  if (!UUID.test(id)) return fail('not_found');
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(botPlan).where(eq(botPlan.id, id)).for('update');
    if (current === undefined) return fail('not_found');
    if (current.status !== 'scheduled') return fail('plan_locked');
    const checked = await validate(tx, input, now);
    if (!checked.ok) return checked;
    const moved = checked.fields.startsAt.getTime() !== current.startsAt.getTime();
    const [row] = await tx
      .update(botPlan)
      .set({ ...checked.fields, updatedAt: now, ...(moved ? { remindedAt: null } : {}) })
      .where(eq(botPlan.id, id))
      .returning();
    await log(tx, adminId, 'bot_plan_update', row!, now);
    return { ok: true, plan: (await views(tx, [row!]))[0]! } as const;
  });
}

/** Лише scheduled; разом зупиняє й щотижневу серію (наступний план з'являється тільки при відкритті). */
export async function cancelPlan(db: Db, adminId: string, id: string, now: Date): Promise<BotPlanResult> {
  if (!UUID.test(id)) return fail('not_found');
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(botPlan)
      .set({ status: 'cancelled', finishedAt: now, updatedAt: now })
      .where(and(eq(botPlan.id, id), eq(botPlan.status, 'scheduled')))
      .returning();
    if (row === undefined) {
      const [exists] = await tx.select({ id: botPlan.id }).from(botPlan).where(eq(botPlan.id, id));
      return fail(exists === undefined ? 'not_found' : 'plan_locked');
    }
    await log(tx, adminId, 'bot_plan_cancel', row, now);
    return { ok: true, plan: (await views(tx, [row]))[0]! } as const;
  });
}

/** Кому слати пуш плану: ніколи не бот і не забанені (на момент відправки). */
export async function recipientsOf(db: Db, plan: BotPlanRow): Promise<string[]> {
  return recipientsFor(db, planRecipients(plan));
}

/** Адресати з рядка плану: групу видалено чи людей не лишилось — нікому. */
function planRecipients(plan: BotPlanRow): BotPlanRecipients {
  switch (plan.recipients) {
    case 'none':
    case 'all':
      return { kind: plan.recipients };
    case 'group':
      return plan.groupId === null ? { kind: 'none' } : { kind: 'group', groupId: plan.groupId };
    case 'people':
      return plan.people.length === 0 ? { kind: 'none' } : { kind: 'people', userIds: plan.people };
  }
}

/** Кому слати пуш (56, 59): ніколи не бот і не забанені; all — лише ті, хто має підписку; people — у порядку вибору. */
export async function recipientsFor(db: Db, to: BotPlanRecipients): Promise<string[]> {
  switch (to.kind) {
    case 'none':
      return [];
    case 'all': {
      const rows = await db.selectDistinct({ id: pushSubscription.userId }).from(pushSubscription).where(notHidden(pushSubscription.userId));
      return rows.map((row) => row.id);
    }
    case 'group': {
      const rows = await db
        .select({ id: groupMember.userId })
        .from(groupMember)
        .where(and(eq(groupMember.groupId, to.groupId), notHidden(groupMember.userId)));
      return rows.map((row) => row.id);
    }
    case 'people': {
      if (to.userIds.length === 0) return [];
      const rows = await db
        .select({ id: user.id })
        .from(user)
        .where(and(inArray(user.id, to.userIds), notHidden(user.id)));
      const visible = new Set(rows.map((row) => row.id));
      return to.userIds.filter((id) => visible.has(id));
    }
  }
}
