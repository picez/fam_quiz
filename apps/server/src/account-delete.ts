import { BOT_USER_ID, DELETED_NICKNAME, isBotUser, isRecord } from '@quiz/shared';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { logAction } from './bans';
import { ensureBotAccount } from './bot-account';
import type { Db } from './db/client';
import { botPlan, game, groupMember, liveRoom, participant, savedGame, user, verification } from './db/schema';
import { deleteGroup } from './group-store';
import { ensureProfile } from './profiles';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Пара [id гравця, id акаунта] з цим акаунтом є в масиві playerUsers колонки JSON. */
const hasPair = (column: typeof savedGame.data | typeof liveRoom.data, userId: string) =>
  sql`jsonb_typeof(${column}->'playerUsers') = 'array' and ${column}->'playerUsers' @> jsonb_build_array(jsonb_build_array(${userId}::text))`;

/**
 * Видалення акаунта адміном (58) — одна транзакція: збій будь-де нічого не видаляє. false — користувача немає (журналу теж).
 * Журнал першим; рядки людини в чужих іграх — «Видалений гравець» (user_id стає null ключем); незавершені ігри, які вона вела, — геть,
 * завершені — за прихованим ботом (лишаються в історії гравців); з playerUsers збережених ігор і живих кімнат у базі — її пари;
 * з адресатів планів бота — її id; групи, де вона власник, — найранішому іншому учаснику, група без інших — геть;
 * токени входу (verification зі значенням id) — геть; далі delete user, решта — каскадом (див. звіт задачі 5).
 * Завантажені файли в сховищі не видаляються: прив'язки файл → акаунт немає.
 */
export async function deleteAccount(db: Db, input: { adminId: string; userId: string; now: Date }): Promise<boolean> {
  const { adminId, userId, now } = input;
  if (isBotUser(userId)) return false;
  await ensureBotAccount(db);
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId)).for('update');
    if (target === undefined) return false;
    const label = (await ensureProfile(tx as Db, userId))?.nickname ?? target.email;
    await logAction(tx, { adminId, kind: 'account_delete', targetUserId: userId, details: { text: label }, now });

    await tx.update(participant).set({ nickname: DELETED_NICKNAME }).where(eq(participant.userId, userId));
    await tx.delete(game).where(and(eq(game.hostId, userId), ne(game.status, 'finished')));
    await tx.update(game).set({ hostId: BOT_USER_ID }).where(eq(game.hostId, userId));

    await tx
      .update(savedGame)
      .set({
        data: sql`jsonb_set(${savedGame.data}, '{playerUsers}', coalesce((
          select jsonb_agg(e.value order by e.n) from jsonb_array_elements(${savedGame.data}->'playerUsers') with ordinality as e(value, n)
          where e.value->>1 is distinct from ${userId}::text
        ), '[]'::jsonb))`,
      })
      .where(hasPair(savedGame.data, userId));
    await forgetInLiveRooms(tx, userId);
    await tx
      .update(botPlan)
      .set({ people: sql`${botPlan.people} - ${userId}::text` })
      .where(sql`${botPlan.people} ? ${userId}::text`);

    await handOverGroups(tx, userId);
    await tx.delete(verification).where(eq(verification.value, userId));
    await tx.delete(user).where(eq(user.id, userId));
    return true;
  });
}

/** Знімки живих кімнат у базі (на випадок перезапуску до наступного запису): її місця — гостьові, як RoomManager.forgetUser. */
async function forgetInLiveRooms(tx: Tx, userId: string): Promise<void> {
  const rows = await tx.select({ code: liveRoom.code, data: liveRoom.data }).from(liveRoom).where(hasPair(liveRoom.data, userId));
  for (const row of rows) {
    if (!isRecord(row.data) || !Array.isArray(row.data.playerUsers)) continue;
    const pairs = row.data.playerUsers as unknown[];
    const mine = new Set(pairs.flatMap((pair) => (Array.isArray(pair) && pair[1] === userId ? [pair[0]] : [])));
    const data: Record<string, unknown> = { ...row.data, playerUsers: pairs.filter((pair) => !(Array.isArray(pair) && pair[1] === userId)) };
    const continued = row.data.continued;
    if (isRecord(continued) && Array.isArray(continued.bound)) data.continued = { ...continued, bound: continued.bound.filter((id) => !mine.has(id)) };
    await tx.update(liveRoom).set({ data }).where(eq(liveRoom.code, row.code));
  }
}

/** Групи, де вона власник: інший учасник з найменшим joined_at (далі user_id) стає власником; без інших — deleteGroup. */
async function handOverGroups(tx: Tx, userId: string): Promise<void> {
  const owned = await tx
    .select({ groupId: groupMember.groupId })
    .from(groupMember)
    .where(and(eq(groupMember.userId, userId), eq(groupMember.role, 'owner')));
  for (const { groupId } of owned) {
    const [heir] = await tx
      .select({ userId: groupMember.userId })
      .from(groupMember)
      .where(and(eq(groupMember.groupId, groupId), ne(groupMember.userId, userId)))
      .orderBy(asc(groupMember.joinedAt), asc(groupMember.userId))
      .limit(1);
    if (heir === undefined) {
      await deleteGroup(tx as Db, groupId);
      continue;
    }
    // Спершу її рядок геть: частковий унікальний індекс не допускає двох власників навіть на мить.
    await tx.delete(groupMember).where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)));
    await tx.update(groupMember).set({ role: 'owner' }).where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, heir.userId)));
  }
}
