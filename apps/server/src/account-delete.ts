import { BOT_USER_ID, DELETED_NICKNAME, isBotUser, isRecord } from '@quiz/shared';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { isAdmin } from './admin';
import { logAction } from './bans';
import { ensureBotAccount } from './bot-account';
import type { Db } from './db/client';
import { botPlan, game, gameEvent, groupItem, groupMember, liveRoom, participant, pushBroadcast, savedGame, scoreAdjustment, user, verification } from './db/schema';
import { deleteGroup } from './group-store';
import { forgetInPlays } from './forget-plays';
import { ensureProfile } from './profiles';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Пара [id гравця, id акаунта] з цим акаунтом є в масиві playerUsers колонки JSON (і в правилах об'єднання 66). */
export const hasPair = (column: typeof savedGame.data | typeof liveRoom.data, userId: string) =>
  sql`jsonb_typeof(${column}->'playerUsers') = 'array' and ${column}->'playerUsers' @> jsonb_build_array(jsonb_build_array(${userId}::text))`;

/**
 * Видалення акаунта адміном (58) — одна транзакція: збій будь-де нічого не видаляє. not_found — користувача немає;
 * cannot_delete_admin — адмін, сам адмін, що діє, чи бот (в обох випадках журналу немає; маршрут перевіряє те саме раніше).
 * Журнал першим; рядки людини в чужих іграх — «Видалений гравець» (user_id стає null ключем), так само ціль її дебафів у чужих
 * коригуваннях, її ім'я в записах груп і в журналах ігор (game.plays: її факти «Правди про гравця», художник, місця — forgetInPlays); збережені й перервані ігри, які вона вела, — геть (в історії гравців їх немає, а продовжити
 * їх без ведучого нікому), завершені й ті, що ще йдуть (фініш дописує рекордер, кімнату вже віддав боту forgetUser), — за ботом;
 * з playerUsers збережених ігор і живих кімнат у базі — її пари, ведучий знімка її кімнати — бот;
 * з адресатів планів бота — її id; групи, де вона власник, — найранішому іншому учаснику, група без інших — геть;
 * токени входу (verification зі значенням id) — геть; далі delete user, решта — каскадом (див. звіт задачі 5).
 * Завантажені файли в сховищі не видаляються: прив'язки файл → акаунт немає.
 * log: false (66, об'єднання) — без рядка account_delete: журнал пише mergeAccounts одним рядком account_merge; решта та сама.
 * Викликана з транзакцією як db — вкладена транзакція drizzle (savepoint): її збій відкочує й зовнішню.
 */
export async function deleteAccount(
  db: Db,
  input: { adminId: string; userId: string; now: Date; adminEmails: ReadonlySet<string>; log?: boolean },
): Promise<'deleted' | 'not_found' | 'cannot_delete_admin'> {
  const { adminId, userId, now, adminEmails, log = true } = input;
  if (isBotUser(userId) || userId === adminId) return 'cannot_delete_admin';
  await ensureBotAccount(db);
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId)).for('update');
    if (target === undefined) return 'not_found' as const;
    if (await isAdmin(tx, adminEmails, userId)) return 'cannot_delete_admin' as const;
    const label = (await ensureProfile(tx as Db, userId))?.nickname ?? target.email;
    if (log) await logAction(tx, { adminId, kind: 'account_delete', targetUserId: userId, details: { text: label }, now });

    // Ціль дебафу зберігається ніком без id: лише в іграх, де цей нік — саме її рядок, і до перейменування рядків.
    await tx
      .update(scoreAdjustment)
      .set({ targetNickname: DELETED_NICKNAME })
      .where(
        sql`exists (
          select 1 from "participant" buyer join "participant" target on target.game_id = buyer.game_id
          where buyer.id = ${scoreAdjustment.participantId} and target.user_id = ${userId} and target.nickname = ${scoreAdjustment.targetNickname}
        )`,
      );
    await forgetInGamePlays(tx, userId);
    await tx.update(participant).set({ nickname: DELETED_NICKNAME }).where(eq(participant.userId, userId));
    // 65: її події в іграх (приєднання, вилучення, рішення ведучого) — «Видаленим гравцем»; user_id стане null ключем.
    await tx.update(gameEvent).set({ nickname: DELETED_NICKNAME }).where(eq(gameEvent.userId, userId));
    await tx
      .update(groupItem)
      .set({
        about: sql`(
          select jsonb_agg(case when e.value->>'userId' = ${userId}::text then jsonb_set(e.value, '{name}', to_jsonb(${DELETED_NICKNAME}::text)) else e.value end order by e.n)
          from jsonb_array_elements(${groupItem.about}) with ordinality as e(value, n)
        )`,
      })
      .where(sql`${groupItem.about} @> jsonb_build_array(jsonb_build_object('userId', ${userId}::text))`);
    await tx.delete(game).where(and(eq(game.hostId, userId), inArray(game.status, ['saved', 'aborted'])));
    await tx.update(game).set({ hostId: BOT_USER_ID }).where(eq(game.hostId, userId));

    await forgetInSavedGames(tx, userId);
    await forgetInLiveRooms(tx, userId);
    await tx
      .update(botPlan)
      .set({ people: sql`${botPlan.people} - ${userId}::text` })
      .where(sql`${botPlan.people} ? ${userId}::text`);
    // 59: вибрані адресати розсилки; people_count лишається (скільки мали отримати тоді).
    await tx
      .update(pushBroadcast)
      .set({ people: sql`${pushBroadcast.people} - ${userId}::text` })
      .where(sql`${pushBroadcast.people} ? ${userId}::text`);

    await handOverGroups(tx, userId);
    await tx.delete(verification).where(eq(verification.value, userId));
    await tx.delete(user).where(eq(user.id, userId));
    return 'deleted' as const;
  });
}

/** Журнали ігор, де вона грала (до перейменування рядків: нікнейм у грі ще її): forgetInPlays за її учасниками кожної гри. */
async function forgetInGamePlays(tx: Tx, userId: string): Promise<void> {
  const rows = await tx.select({ id: participant.id, gameId: participant.gameId, nickname: participant.nickname }).from(participant).where(eq(participant.userId, userId));
  const byGame = new Map<string, Map<string, string>>();
  for (const row of rows) byGame.set(row.gameId, (byGame.get(row.gameId) ?? new Map()).set(row.id, row.nickname));
  if (byGame.size === 0) return;
  const games = await tx.select({ id: game.id, plays: game.plays }).from(game).where(inArray(game.id, [...byGame.keys()]));
  for (const found of games) {
    const plays = forgetInPlays(found.plays, byGame.get(found.id) ?? new Map());
    if (plays !== found.plays) await tx.update(game).set({ plays }).where(eq(game.id, found.id));
  }
}

/** Її пари геть з playerUsers знімка; її місця — у forgotten (рекордер пише їх «Видаленим гравцем»). */
function withoutPairs(data: Record<string, unknown>, userId: string): { data: Record<string, unknown>; mine: Set<unknown> } {
  const pairs = Array.isArray(data.playerUsers) ? (data.playerUsers as unknown[]) : [];
  const mine = new Set(pairs.flatMap((pair) => (Array.isArray(pair) && pair[1] === userId ? [pair[0]] : [])));
  const before = Array.isArray(data.forgotten) ? (data.forgotten as unknown[]) : [];
  const forgotten = [...new Set([...before, ...mine])].filter((id): id is string => typeof id === 'string');
  return {
    data: { ...data, playerUsers: pairs.filter((pair) => !(Array.isArray(pair) && pair[1] === userId)), ...(forgotten.length === 0 ? {} : { forgotten }) },
    mine,
  };
}

/** Збережені ігри, де вона грала: продовження йде без її акаунта, а її місце рекордер пише «Видаленим гравцем» (forgotten). */
async function forgetInSavedGames(tx: Tx, userId: string): Promise<void> {
  const rows = await tx.select({ gameId: savedGame.gameId, data: savedGame.data }).from(savedGame).where(hasPair(savedGame.data, userId));
  for (const row of rows) {
    if (!isRecord(row.data)) continue;
    await tx.update(savedGame).set({ data: withoutPairs(row.data, userId).data }).where(eq(savedGame.gameId, row.gameId));
  }
}

/**
 * Знімки живих кімнат у базі (на випадок перезапуску до наступного запису): її місця — гостьові (і в forgotten), а її кімната — бота,
 * як RoomManager.forgetUser; піднята після перезапуску кімната не пише гру з ведучим, якого вже немає.
 */
async function forgetInLiveRooms(tx: Tx, userId: string): Promise<void> {
  const rows = await tx
    .select({ code: liveRoom.code, data: liveRoom.data })
    .from(liveRoom)
    .where(sql`(${hasPair(liveRoom.data, userId)}) or ${liveRoom.data}->>'hostUserId' = ${userId}::text`);
  for (const row of rows) {
    if (!isRecord(row.data)) continue;
    const { data, mine } = withoutPairs(row.data, userId);
    if (row.data.hostUserId === userId) data.hostUserId = BOT_USER_ID;
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
