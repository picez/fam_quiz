import { isBotUser, levelOf, MERGE_LOGINS, type AccountMergePreview, type MergeRefusal, type MergeSide, type MergeSummary } from '@quiz/shared';
import { and, eq, or, sql } from 'drizzle-orm';
import { deleteAccount, hasPair } from './account-delete';
import { MERGE_JSON_RULES } from './account-merge-history';
import { loginOf } from './account-merge-people';
import { applyMergeRules, MERGE_RULES, mergeContext, type Tx } from './account-merge-rules';
import { isAdmin } from './admin';
import { isBanned, logAction } from './bans';
import type { Db } from './db/client';
import { account, liveRoom, user } from './db/schema';
import { announceLevels } from './feed-publish';
import { reportError } from './log';
import { rememberMergedEmail } from './merged-email';
import { ensureProfile } from './profiles';
import { xpTotals } from './xp-store';

/** 66: P — primaryId (лишається), S — secondaryId (зникне); adminId — хто діє. */
export interface MergeInput {
  adminId: string;
  primaryId: string;
  secondaryId: string;
  now: Date;
  adminEmails: ReadonlySet<string>;
}

export type MergeOutcome = { ok: true; summary: MergeSummary; after: { level: number; xp: number } } | { ok: false; error: 'not_found' | MergeRefusal };

/** Перегляд пройшов усе об'єднання й відкочує транзакцію, несучи результат назовні. */
class MergeRollback extends Error {
  constructor(readonly outcome: MergeOutcome) {
    super('merge preview rollback');
  }
}

/**
 * 66: чи хтось із цих акаунтів у живій грі за рядками live_room (кімнати інших процесів; кімнати в пам'яті цього процесу
 * перевіряє маршрут через RoomManager.inLiveGame): ведучий чи пара в playerUsers, а фаза не finished. Рядок без фази — теж
 * живий (обережно: об'єднання таку кімнату не переписало б).
 */
export async function liveInDb(db: Db | Tx, userIds: string[]): Promise<boolean> {
  if (userIds.length === 0) return false;
  const rows = await db
    .select({ code: liveRoom.code })
    .from(liveRoom)
    .where(
      and(
        or(...userIds.flatMap((id) => [hasPair(liveRoom.data, id), sql`${liveRoom.data}->>'hostUserId' = ${id}::text`])),
        sql`coalesce(${liveRoom.data}->'state'->>'phase', '') <> 'finished'`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** 66: мітка акаунта, як у 58: нікнейм (ensureProfile), без нього — email; null — акаунта немає. */
export async function mergeLabel(db: Db | Tx, userId: string): Promise<string | null> {
  const profile = await ensureProfile(db as Db, userId);
  if (profile?.nickname != null) return profile.nickname;
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  return row?.email ?? null;
}

/**
 * Замок обох рядків user (for update, у порядку id — два об'єднання з тими самими людьми не переплітаються) і всі відмови —
 * до будь-якого правила. Повертає адресу S або причину відмови.
 */
async function lockAndCheck(tx: Tx, input: MergeInput): Promise<{ secondaryEmail: string } | { error: 'not_found' | MergeRefusal }> {
  const { adminId, primaryId: P, secondaryId: S, adminEmails } = input;
  if (P === S) return { error: 'merge_same' };
  if (isBotUser(P) || isBotUser(S)) return { error: 'not_found' };
  const emails = new Map<string, string>();
  for (const id of [P, S].sort()) {
    const [row] = await tx.select({ email: user.email }).from(user).where(eq(user.id, id)).for('update');
    if (row === undefined) return { error: 'not_found' };
    emails.set(id, row.email);
  }
  // S-адмін не видалився б (58); P-адмін — лише свій: адмін зливає свій другий акаунт у свій головний.
  if (S === adminId || (await isAdmin(tx, adminEmails, S))) return { error: 'merge_admin' };
  if (P !== adminId && (await isAdmin(tx, adminEmails, P))) return { error: 'merge_admin' };
  if ((await isBanned(tx, P)) || (await isBanned(tx, S))) return { error: 'merge_banned' };
  if (await liveInDb(tx, [P, S])) return { error: 'merge_live' };
  return { secondaryEmail: emails.get(S)! };
}

/**
 * Усе об'єднання в транзакції того, хто викликає: відмови під замком, MERGE_RULES, MERGE_JSON_RULES, адреса S — псевдонім P,
 * порожній S — процедурою 58 без її рядка журналу (вкладена транзакція — savepoint), один рядок account_merge з підсумком.
 */
async function runMerge(tx: Tx, input: MergeInput): Promise<MergeOutcome> {
  const { adminId, primaryId: P, secondaryId: S, now, adminEmails } = input;
  const checked = await lockAndCheck(tx, input);
  if ('error' in checked) return { ok: false, error: checked.error };
  const label = (await mergeLabel(tx, S)) ?? checked.secondaryEmail;
  const ctx = mergeContext(P, S, (await ensureProfile(tx as unknown as Db, P))?.nickname ?? null);
  await applyMergeRules(tx, ctx, MERGE_RULES);
  await applyMergeRules(tx, ctx, MERGE_JSON_RULES);
  await rememberMergedEmail(tx, { email: checked.secondaryEmail, userId: P, now });
  const deleted = await deleteAccount(tx as unknown as Db, { adminId, userId: S, now, adminEmails, log: false });
  if (deleted !== 'deleted') throw new Error(`merge: deleting the secondary account returned ${deleted}`);
  await logAction(tx, { adminId, kind: 'account_merge', targetUserId: P, details: { text: label, merge: ctx.summary }, now });
  const xp = (await xpTotals(tx as unknown as Db, [P])).get(P) ?? 0;
  return { ok: true, summary: ctx.summary, after: { level: levelOf(xp), xp } };
}

/** Рівень з об'єднаного досвіду: підвищення — подія стрічки (пониження неможливе). Збій не ламає вже зроблене об'єднання. */
async function announce(db: Db, userId: string, now: Date): Promise<void> {
  try {
    await announceLevels(db, [userId], null, now);
  } catch (error) {
    reportError(error, { where: 'account-merge' });
  }
}

/**
 * 66: об'єднати S у P однією транзакцією — збій будь-де нічого не переносить і журналу не пише. Відмова — { ok: false } без змін.
 * Кімнати в пам'яті (rebindUser) і живу гру в пам'яті — маршрут; тут — рівень після фіксації.
 */
export async function mergeAccounts(db: Db, input: MergeInput): Promise<MergeOutcome> {
  const outcome = await db.transaction((tx) => runMerge(tx, input));
  if (outcome.ok) await announce(db, input.primaryId, input.now);
  return outcome;
}

async function sideOf(db: Db, userId: string): Promise<MergeSide | null> {
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (row === undefined) return null;
  const profile = await ensureProfile(db, userId);
  const xp = (await xpTotals(db, [userId])).get(userId) ?? 0;
  const providers = await db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, userId));
  const logins = new Set(providers.map((p) => loginOf(p.providerId)));
  return { id: userId, nickname: profile?.nickname ?? null, email: row.email, avatar: profile?.avatar ?? null, level: levelOf(xp), xp, logins: MERGE_LOGINS.filter((l) => logins.has(l)) };
}

/**
 * 66: попередній перегляд — той самий runMerge, завершений відкатом (MergeRollback): підсумок і «після» дорівнюють тому, що
 * зробить об'єднання, а база не змінюється. null — котрогось немає чи бот; відмова — refusal без summary й after.
 */
export async function previewMerge(db: Db, input: MergeInput): Promise<AccountMergePreview | null> {
  const { primaryId: P, secondaryId: S } = input;
  if (isBotUser(P) || isBotUser(S)) return null;
  const primary = await sideOf(db, P);
  const secondary = await sideOf(db, S);
  if (primary === null || secondary === null) return null;
  let outcome: MergeOutcome;
  try {
    await db.transaction(async (tx) => {
      throw new MergeRollback(await runMerge(tx, input));
    });
    throw new Error('merge preview: the transaction was not rolled back');
  } catch (error) {
    if (!(error instanceof MergeRollback)) throw error;
    outcome = error.outcome;
  }
  const confirm = secondary.nickname ?? secondary.email;
  if (outcome.ok) return { primary, secondary, confirm, refusal: null, summary: outcome.summary, after: outcome.after };
  if (outcome.error === 'not_found') return null;
  return { primary, secondary, confirm, refusal: outcome.error, summary: null, after: null };
}
