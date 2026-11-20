import { FAVORITE_STICKERS_MAX, isRecord, type AchievementId } from '@quiz/shared';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { MergeRule } from './account-merge-rules';
import type { Db } from './db/client';
import {
  adminAction,
  botPlan,
  feedEvent,
  gameEvent,
  groupItem,
  leagueChampion,
  leaguePoint,
  liveRoom,
  participant,
  profile,
  pushBroadcast,
  savedGame,
  userAchievement,
  userLike,
  xpEntry,
} from './db/schema';
import { ensureProfile } from './profiles';

/**
 * 66: правила «історія й рахунок» (1–8 плану) і JSON з id акаунтів. P — головний (лишається), S — другорядний (зникне).
 * Усі вони йдуть до вкладеного deleteAccount (задача 5): той перейменовує рядки й події S у «Видаленого гравця» —
 * після цих правил у S їх уже немає.
 */

/**
 * 1. Рядки гри. Та сама гра в обох — лишається рядок з більшим score (рівно — P) з user_id = P, інші — user_id null
 * (гостьові рядки зі своїм ніком: рахунки й місця нікого не змінюються). Ігри, де лишився рядок S, — у secondaryWonGames.
 */
const participantRule: MergeRule = {
  keys: ['participant.user_id'],
  async run(tx, { primaryId: P, secondaryId: S, summary, secondaryWonGames }) {
    const rows = await tx
      .select({ id: participant.id, gameId: participant.gameId, userId: participant.userId, score: participant.score })
      .from(participant)
      .where(inArray(participant.userId, [P, S]));
    const byGame = new Map<string, typeof rows>();
    for (const row of rows) byGame.set(row.gameId, [...(byGame.get(row.gameId) ?? []), row]);
    const guests: string[] = [];
    for (const [gameId, inGame] of byGame) {
      const best = (userId: string) => inGame.filter((row) => row.userId === userId).sort((a, b) => b.score - a.score)[0];
      const mine = best(P);
      const theirs = best(S);
      if (mine === undefined || theirs === undefined) continue;
      const kept = theirs.score > mine.score ? theirs : mine;
      if (kept === theirs) secondaryWonGames.add(gameId);
      guests.push(...inGame.filter((row) => row !== kept).map((row) => row.id));
      summary.sameGames += 1;
    }
    if (guests.length > 0) await tx.update(participant).set({ userId: null }).where(inArray(participant.id, guests));
    const moved = await tx.update(participant).set({ userId: P }).where(eq(participant.userId, S)).returning({ id: participant.id });
    summary.games += moved.length;
  },
};

/**
 * 1a (65). Події ігор: подія рядка, що став гостьовим (правило 1), — user_id null; решта подій S — P. Нік події лишається ніком
 * у грі (як participant.nickname).
 * Має йти після правила 1 і до вкладеного deleteAccount (він перейменував би події S у «Видаленого гравця»).
 */
const gameEventRule: MergeRule = {
  keys: ['game_event.user_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    await tx
      .update(gameEvent)
      .set({ userId: null })
      .where(
        and(
          inArray(gameEvent.userId, [P, S]),
          sql`exists (select 1 from "participant" p where p.id = ${gameEvent.participantId} and p.user_id is null)`,
        ),
      );
    await tx.update(gameEvent).set({ userId: P }).where(eq(gameEvent.userId, S));
  },
};

/** earned_at null — «давно», найраніша дата. */
const earlier = (a: Date | null, b: Date | null): boolean => (a === null ? b !== null : b !== null && a < b);

/** 2. Досягнення в обох — лишається раніша дата з її грою (рівно — P); раніша в S — id у earlierOnSecondary. */
const achievementRule: MergeRule = {
  keys: ['user_achievement.user_id'],
  async run(tx, { primaryId: P, secondaryId: S, summary, earlierOnSecondary }) {
    const mine = new Map((await tx.select().from(userAchievement).where(eq(userAchievement.userId, P))).map((row) => [row.achievementId, row]));
    const theirs = await tx.select().from(userAchievement).where(eq(userAchievement.userId, S));
    const same: AchievementId[] = [];
    for (const row of theirs) {
      const kept = mine.get(row.achievementId);
      if (kept === undefined) continue;
      same.push(row.achievementId);
      if (!earlier(row.earnedAt, kept.earnedAt)) continue;
      await tx
        .update(userAchievement)
        .set({ earnedAt: row.earnedAt, gameId: row.gameId })
        .where(and(eq(userAchievement.userId, P), eq(userAchievement.achievementId, row.achievementId)));
      earlierOnSecondary.add(row.achievementId);
    }
    if (same.length > 0) await tx.delete(userAchievement).where(and(eq(userAchievement.userId, S), inArray(userAchievement.achievementId, same)));
    const moved = await tx.update(userAchievement).set({ userId: P }).where(eq(userAchievement.userId, S)).returning({ id: userAchievement.achievementId });
    summary.achievements += moved.length;
    summary.sameAchievements += same.length;
  },
};

/** 3. Досвід — сума журналів. Та сама гра — лишається більший amount (рівно — P); те саме досягнення — рядок P; admin — усі. */
const xpRule: MergeRule = {
  keys: ['xp_entry.user_id'],
  async run(tx, { primaryId: P, secondaryId: S, summary }) {
    const sameGame = (owner: string, op: '>=' | '>') =>
      sql`exists (select 1 from "xp_entry" x where x.user_id = ${owner} and x.source = 'game' and x.game_id = ${xpEntry.gameId} and x.amount ${sql.raw(op)} ${xpEntry.amount})`;
    await tx.delete(xpEntry).where(and(eq(xpEntry.userId, S), eq(xpEntry.source, 'game'), sameGame(P, '>=')));
    await tx.delete(xpEntry).where(and(eq(xpEntry.userId, P), eq(xpEntry.source, 'game'), sameGame(S, '>')));
    await tx
      .delete(xpEntry)
      .where(
        and(
          eq(xpEntry.userId, S),
          eq(xpEntry.source, 'achievement'),
          sql`exists (select 1 from "xp_entry" x where x.user_id = ${P} and x.source = 'achievement' and x.achievement_id = ${xpEntry.achievementId})`,
        ),
      );
    const moved = await tx.update(xpEntry).set({ userId: P }).where(eq(xpEntry.userId, S)).returning({ amount: xpEntry.amount });
    summary.xp += moved.reduce((sum, row) => sum + row.amount, 0);
  },
};

/** 4. Бали ліги: та сама гра — лишається більше points (рівно — P); суми місяця рахуються з рядків. */
const leaguePointRule: MergeRule = {
  keys: ['league_point.user_id'],
  async run(tx, { primaryId: P, secondaryId: S, summary }) {
    const sameGame = (owner: string, op: '>=' | '>') =>
      sql`exists (select 1 from "league_point" l where l.user_id = ${owner} and l.game_id = ${leaguePoint.gameId} and l.points ${sql.raw(op)} ${leaguePoint.points})`;
    await tx.delete(leaguePoint).where(and(eq(leaguePoint.userId, S), sameGame(P, '>=')));
    await tx.delete(leaguePoint).where(and(eq(leaguePoint.userId, P), sameGame(S, '>')));
    const moved = await tx.update(leaguePoint).set({ userId: P }).where(eq(leaguePoint.userId, S)).returning({ id: leaguePoint.gameId });
    summary.league += moved.length;
  },
};

/** 5. Чемпіони: той самий місяць тієї самої групи (без групи — та сама назва) — points сумуються в рядок P. */
const leagueChampionRule: MergeRule = {
  keys: ['league_champion.user_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    const mine = await tx.select().from(leagueChampion).where(eq(leagueChampion.userId, P));
    const theirs = await tx.select().from(leagueChampion).where(eq(leagueChampion.userId, S));
    for (const row of theirs) {
      const kept = mine.find((m) => m.month === row.month && (row.groupId === null ? m.groupId === null && m.groupName === row.groupName : m.groupId === row.groupId));
      if (kept === undefined) continue;
      await tx.update(leagueChampion).set({ points: sql`${leagueChampion.points} + ${row.points}` }).where(eq(leagueChampion.id, kept.id));
      await tx.delete(leagueChampion).where(eq(leagueChampion.id, row.id));
    }
    await tx.update(leagueChampion).set({ userId: P }).where(eq(leagueChampion.userId, S));
  },
};

/**
 * 6. Стрічка: ключі з id S — на P (game:<g>:S, achievement:S:<a>, level:S:<n>; prize:/planned: id не містять).
 * Конфлікт ключа: game — подія того, чий рядок гри лишився; achievement — того, чия дата раніша; level — подія P.
 * Лайки події йдуть на ключ, що лишився; той самий лайк уже на ньому — лайк старого ключа геть.
 */
const feedRule: MergeRule = {
  keys: ['feed_event.user_id'],
  async run(tx, { primaryId: P, secondaryId: S, secondaryWonGames, earlierOnSecondary }) {
    const theirs = await tx.select({ id: feedEvent.id, key: feedEvent.key }).from(feedEvent).where(eq(feedEvent.userId, S));
    for (const event of theirs) {
      const rekeyed = rekey(event.key, S, P);
      if (rekeyed === null) {
        await tx.update(feedEvent).set({ userId: P }).where(eq(feedEvent.id, event.id));
        continue;
      }
      const [taken] = await tx.select({ id: feedEvent.id }).from(feedEvent).where(eq(feedEvent.key, rekeyed.key));
      if (taken !== undefined) {
        const secondaryWins =
          rekeyed.kind === 'game' ? secondaryWonGames.has(rekeyed.ref) : rekeyed.kind === 'achievement' ? earlierOnSecondary.has(rekeyed.ref as AchievementId) : false;
        await tx.delete(feedEvent).where(eq(feedEvent.id, secondaryWins ? taken.id : event.id));
        if (secondaryWins) await tx.update(feedEvent).set({ key: rekeyed.key, userId: P }).where(eq(feedEvent.id, event.id));
      } else {
        await tx.update(feedEvent).set({ key: rekeyed.key, userId: P }).where(eq(feedEvent.id, event.id));
      }
      await tx
        .delete(userLike)
        .where(
          and(
            eq(userLike.kind, 'event'),
            eq(userLike.eventKey, event.key),
            sql`exists (select 1 from "user_like" l where l.kind = 'event' and l.user_id = ${userLike.userId} and l.event_key = ${rekeyed.key})`,
          ),
        );
      await tx
        .update(userLike)
        .set({ eventKey: rekeyed.key })
        .where(and(eq(userLike.kind, 'event'), eq(userLike.eventKey, event.key)));
    }
  },
};

/** Новий ключ події S на P; null — ключ без id акаунта. ref — id гри чи досягнення. */
function rekey(key: string, S: string, P: string): { key: string; kind: 'game' | 'achievement' | 'level'; ref: string } | null {
  if (key.startsWith('game:') && key.endsWith(`:${S}`)) {
    const gameId = key.slice('game:'.length, key.length - S.length - 1);
    return { key: `game:${gameId}:${P}`, kind: 'game', ref: gameId };
  }
  for (const kind of ['achievement', 'level'] as const) {
    const prefix = `${kind}:${S}:`;
    if (key.startsWith(prefix)) return { key: `${kind}:${P}:${key.slice(prefix.length)}`, kind, ref: key.slice(prefix.length) };
  }
  return null;
}

/**
 * 7. Лайки: лайки між P і S (стали б лайком самому собі) — геть; лайк S, що повторив би лайк P (часткові унікальні за видом),
 * і чужий лайк гравцеві S, коли той самий є гравцеві P, — геть; далі обидві колонки — P.
 */
const likeRule: MergeRule = {
  keys: ['user_like.user_id', 'user_like.target_user_id'],
  async run(tx, { primaryId: P, secondaryId: S, summary }) {
    await tx.delete(userLike).where(and(inArray(userLike.userId, [P, S]), inArray(userLike.targetUserId, [P, S])));
    await tx.delete(userLike).where(
      and(
        eq(userLike.userId, S),
        sql`exists (select 1 from "user_like" l where l.user_id = ${P} and l.kind = ${userLike.kind} and (
          (l.kind = 'question' and l.quiz_id = ${userLike.quizId} and l.question_id = ${userLike.questionId})
          or (l.kind = 'quiz' and l.quiz_id = ${userLike.quizId})
          or (l.kind = 'host' and l.game_id = ${userLike.gameId})
          or (l.kind = 'player' and l.game_id = ${userLike.gameId} and l.target_user_id = ${userLike.targetUserId})
          or (l.kind = 'event' and l.event_key = ${userLike.eventKey})))`,
      ),
    );
    await tx
      .delete(userLike)
      .where(
        and(
          eq(userLike.targetUserId, S),
          eq(userLike.kind, 'player'),
          sql`exists (select 1 from "user_like" l where l.user_id = ${userLike.userId} and l.kind = 'player' and l.game_id = ${userLike.gameId} and l.target_user_id = ${P})`,
        ),
      );
    const given = await tx.update(userLike).set({ userId: P }).where(eq(userLike.userId, S)).returning({ id: userLike.id });
    await tx.update(userLike).set({ targetUserId: P }).where(eq(userLike.targetUserId, S));
    summary.likes += given.length;
  },
};

const later = (a: Date | null, b: Date | null): Date | null => (a === null ? b : b === null || a >= b ? a : b);
const higher = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : Math.max(a, b));
/** Мітки наздоганяння: раніша з двох; null, якщо хоч одна null (ще не синхронізовано). */
const earlierMark = (a: Date | null, b: Date | null): Date | null => (a === null || b === null ? null : a <= b ? a : b);

/**
 * 8. Профіль: у P лишаються нік, аватар, вбрання, мова, режими й мітки перегляду; останній візит — пізніший, рівні — більші,
 * стікери — улюблені P, далі відсутні з S до межі; мітки синхронізації — раніші (наздоганяння перевірить об'єднану історію).
 * Рядок профілю S прибирає каскад deleteAccount.
 */
const profileRule: MergeRule = {
  keys: ['profile.user_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    const [theirs] = await tx.select().from(profile).where(eq(profile.userId, S));
    if (theirs === undefined) return;
    await ensureProfile(tx as Db, P);
    const [mine] = await tx.select().from(profile).where(eq(profile.userId, P));
    if (mine === undefined) return;
    const stickers = [...mine.favoriteStickers, ...theirs.favoriteStickers.filter((id) => !mine.favoriteStickers.includes(id))].slice(0, FAVORITE_STICKERS_MAX);
    await tx
      .update(profile)
      .set({
        lastSeenAt: later(mine.lastSeenAt, theirs.lastSeenAt),
        favoriteStickers: stickers,
        feedLevel: higher(mine.feedLevel, theirs.feedLevel),
        stickersLegacyLevel: higher(mine.stickersLegacyLevel, theirs.stickersLegacyLevel),
        stickersSettled: mine.stickersSettled && theirs.stickersSettled,
        xpSyncedAt: earlierMark(mine.xpSyncedAt, theirs.xpSyncedAt),
        achievementsSyncedAt: earlierMark(mine.achievementsSyncedAt, theirs.achievementsSyncedAt),
      })
      .where(eq(profile.userId, P));
  },
};

/** Правила 1–8 плану по порядку: рядки гри до подій, досягнень і стрічки (їхні рішення — у ctx). */
export const HISTORY_RULES: readonly MergeRule[] = [
  participantRule,
  gameEventRule,
  achievementRule,
  xpRule,
  leaguePointRule,
  leagueChampionRule,
  feedRule,
  likeRule,
  profileRule,
];

/** Пара [id гравця, id акаунта] з цим акаунтом є в масиві playerUsers (як hasPair у account-delete). */
const hasPair = (column: typeof savedGame.data | typeof liveRoom.data, userId: string) =>
  sql`jsonb_typeof(${column}->'playerUsers') = 'array' and ${column}->'playerUsers' @> jsonb_build_array(jsonb_build_array(${userId}::text))`;

/** Пари S — на P; якщо P уже сидить у цій грі — пари S геть (місце стає гостьовим зі своїм ніком, не forgotten). */
function rebindPairs(data: Record<string, unknown>, S: string, P: string): Record<string, unknown> {
  const pairs = Array.isArray(data.playerUsers) ? (data.playerUsers as unknown[]) : [];
  const isOf = (pair: unknown, id: string) => Array.isArray(pair) && pair[1] === id;
  const seated = pairs.some((pair) => isOf(pair, P));
  const playerUsers = seated ? pairs.filter((pair) => !isOf(pair, S)) : pairs.map((pair) => (isOf(pair, S) ? [(pair as unknown[])[0], P] : pair));
  return { ...data, playerUsers };
}

const savedGameRule: MergeRule = {
  keys: ['saved_game.data'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    const rows = await tx.select({ gameId: savedGame.gameId, data: savedGame.data }).from(savedGame).where(hasPair(savedGame.data, S));
    for (const row of rows) {
      if (!isRecord(row.data)) continue;
      await tx.update(savedGame).set({ data: rebindPairs(row.data, S, P) }).where(eq(savedGame.gameId, row.gameId));
    }
  },
};

/** Кімнати в базі (лише finished — живу гру відмовляє маршрут і mergeAccounts): ведучий S — P, пари — як у збереженій грі. */
const liveRoomRule: MergeRule = {
  keys: ['live_room.data'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    const rows = await tx
      .select({ code: liveRoom.code, data: liveRoom.data })
      .from(liveRoom)
      .where(or(hasPair(liveRoom.data, S), sql`${liveRoom.data}->>'hostUserId' = ${S}::text`));
    for (const row of rows) {
      if (!isRecord(row.data)) continue;
      const data = rebindPairs(row.data, S, P);
      if (row.data.hostUserId === S) data.hostUserId = P;
      await tx.update(liveRoom).set({ data }).where(eq(liveRoom.code, row.code));
    }
  },
};

/** Записи груп: елемент про S — про P з поточним ніком P; P уже є в тому самому about — елемент S геть. */
const groupAboutRule: MergeRule = {
  keys: ['group_item.about'],
  async run(tx, { primaryId: P, secondaryId: S, primaryNickname }) {
    const moved = primaryNickname === null ? sql`jsonb_set(e.value, '{userId}', to_jsonb(${P}::text))` : sql`jsonb_set(jsonb_set(e.value, '{userId}', to_jsonb(${P}::text)), '{name}', to_jsonb(${primaryNickname}::text))`;
    await tx
      .update(groupItem)
      .set({
        about: sql`coalesce((
          select jsonb_agg(case when e.value->>'userId' = ${S}::text then ${moved} else e.value end order by e.n)
          from jsonb_array_elements(${groupItem.about}) with ordinality as e(value, n)
          where not (e.value->>'userId' = ${S}::text and ${groupItem.about} @> jsonb_build_array(jsonb_build_object('userId', ${P}::text)))
        ), '[]'::jsonb)`,
      })
      .where(sql`${groupItem.about} @> jsonb_build_array(jsonb_build_object('userId', ${S}::text))`);
  },
};

/** Список id (jsonb-масив рядків): S — на P на тому самому місці; P уже є — S просто геть. people_count не змінюється. */
const replacedInPeople = (column: typeof botPlan.people | typeof pushBroadcast.people, S: string, P: string) => sql`case
  when ${column} ? ${P}::text then ${column} - ${S}::text
  else (select jsonb_agg(case when t.v = ${S}::text then ${P}::text else t.v end order by t.n) from jsonb_array_elements_text(${column}) with ordinality as t(v, n))
end`;

const botPlanRule: MergeRule = {
  keys: ['bot_plan.people'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    await tx
      .update(botPlan)
      .set({ people: replacedInPeople(botPlan.people, S, P) })
      .where(sql`${botPlan.people} ? ${S}::text`);
  },
};

const broadcastRule: MergeRule = {
  keys: ['push_broadcast.people'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    await tx
      .update(pushBroadcast)
      .set({ people: replacedInPeople(pushBroadcast.people, S, P) })
      .where(sql`${pushBroadcast.people} ? ${S}::text`);
  },
};

/** Ціль дій адмінів (без зовнішнього ключа): уся історія — на картці P; target_label (знімок) не змінюється. */
const adminTargetRule: MergeRule = {
  keys: ['admin_action.target_user_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    await tx.update(adminAction).set({ targetUserId: P }).where(eq(adminAction.targetUserId, S));
  },
};

/** JSON і колонки з id акаунтів без зовнішнього ключа — після MERGE_RULES. verification.value = S прибирає deleteAccount. */
export const MERGE_JSON_RULES: readonly MergeRule[] = [savedGameRule, liveRoomRule, groupAboutRule, botPlanRule, broadcastRule, adminTargetRule];
