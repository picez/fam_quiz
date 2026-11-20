import { ACHIEVEMENTS, ADMIN_CARD_BANS, ADMIN_CARD_GAMES, ADMIN_CARD_XP, levelOf, questionsOf, type AchievementId, type AdminPlayerCard } from '@quiz/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { logAction } from './bans';
import type { Db } from './db/client';
import { achievementBlock, adminAction, feedEvent, game, groupMember, participant, profile, quiz, showcasePin, user, userAchievement, xpEntry } from './db/schema';
import { announceLevels } from './feed-publish';
import { reportError } from './log';
import { playerGames } from './history';
import { ensureProfile, friendsOf } from './profiles';
import { creditAchievements, syncXp, xpTotals } from './xp-store';
import { kyivDay } from './xp-rules';

/** Причина рядка, що повертає суму до нуля, коли зняте досягнення забрало більше, ніж лишалось. */
const BALANCE_NOTE = 'Вирівнювання до нуля після зняття досягнення';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

interface AchievementInput {
  adminId: string;
  userId: string;
  achievementId: AchievementId;
  now: Date;
}

async function exists(tx: Tx, userId: string): Promise<boolean> {
  const [row] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId));
  return row !== undefined;
}

/** Рівень підвищився — подія стрічки, як після гри (без гри); пониження нічого не оголошує. Збій не ламає дії адміна. */
async function announce(db: Db, userId: string, now: Date): Promise<void> {
  try {
    await announceLevels(db, [userId], null, now);
  } catch (error) {
    reportError(error, { where: 'player-card' });
  }
}

/**
 * 58: видати досягнення вручну — знімає заборону, user_achievement { earned_at: now, game_id: null } і рядок досвіду за рідкістю,
 * журнал — у тій самій транзакції. Уже є — 'owned' без журналу. Подію стрічки ручна видача не пише.
 */
export async function grantAchievement(db: Db, input: AchievementInput): Promise<'granted' | 'owned' | 'not_found'> {
  const result = await db.transaction(async (tx) => {
    if (!(await exists(tx, input.userId))) return 'not_found' as const;
    await tx.delete(achievementBlock).where(and(eq(achievementBlock.userId, input.userId), eq(achievementBlock.achievementId, input.achievementId)));
    const inserted = await tx
      .insert(userAchievement)
      .values({ userId: input.userId, achievementId: input.achievementId, earnedAt: input.now, gameId: null })
      .onConflictDoNothing()
      .returning({ id: userAchievement.achievementId });
    if (inserted.length === 0) return 'owned' as const;
    await creditAchievements(tx, input.userId);
    await logAction(tx, { adminId: input.adminId, kind: 'achievement_grant', targetUserId: input.userId, details: { achievementId: input.achievementId }, now: input.now });
    return 'granted' as const;
  });
  if (result === 'granted') await announce(db, input.userId, input.now);
  return result;
}

/**
 * 58: забрати досягнення — разом з його досвідом, подією стрічки й закріпленням на вітрині; заборона не дає жодній синхронізації
 * повернути його, доки адмін не видасть знову. Під замком профілю; сума після зняття нижче нуля — рядок 'admin', що повертає її рівно до 0.
 * Немає користувача чи досягнення — 'not_found' без журналу.
 */
export async function revokeAchievement(db: Db, input: AchievementInput): Promise<'revoked' | 'not_found'> {
  const { userId, achievementId } = input;
  const result = await db.transaction(async (tx) => {
    if (!(await exists(tx, userId))) return 'not_found' as const;
    // Той самий замок, що в adjustXp і в записі syncAchievements: сума не піде нижче нуля, а синхронізація не запише забране.
    await ensureProfile(tx as Db, userId);
    await tx.select({ id: profile.userId }).from(profile).where(eq(profile.userId, userId)).for('update');
    const removed = await tx
      .delete(userAchievement)
      .where(and(eq(userAchievement.userId, userId), eq(userAchievement.achievementId, achievementId)))
      .returning({ id: userAchievement.achievementId });
    if (removed.length === 0) return 'not_found' as const;
    await tx.delete(xpEntry).where(and(eq(xpEntry.userId, userId), eq(xpEntry.source, 'achievement'), eq(xpEntry.achievementId, achievementId)));
    const left = (await xpTotals(tx, [userId])).get(userId) ?? 0;
    if (left < 0) {
      const { now } = input;
      await tx.insert(xpEntry).values({ userId, source: 'admin', amount: -left, note: BALANCE_NOTE, day: kyivDay(now), at: now, createdAt: now, counted: false, reason: null });
    }
    await tx
      .insert(achievementBlock)
      .values({ userId, achievementId, blockedAt: input.now })
      .onConflictDoUpdate({ target: [achievementBlock.userId, achievementBlock.achievementId], set: { blockedAt: input.now } });
    await tx.delete(feedEvent).where(eq(feedEvent.key, `achievement:${userId}:${achievementId}`));
    await tx.delete(showcasePin).where(and(eq(showcasePin.userId, userId), eq(showcasePin.kind, 'achievement'), eq(showcasePin.itemId, achievementId)));
    await logAction(tx, { adminId: input.adminId, kind: 'achievement_revoke', targetUserId: userId, details: { achievementId }, now: input.now });
    return 'revoked' as const;
  });
  if (result === 'revoked') await announce(db, userId, input.now);
  return result;
}

/**
 * 58: ручний досвід — рядок xp_entry 'admin' з причиною: рахується в рівень, не в денну стелю ігор, переживає ретро й наздоганяння.
 * Спершу syncXp (поза транзакцією), далі під замком профілю: сума + amount < 0 — xp_below_zero, нічого не пишеться.
 */
export async function adjustXp(
  db: Db,
  input: { adminId: string; userId: string; amount: number; reason: string; now: Date },
): Promise<{ ok: true; xp: number; level: number } | { ok: false; error: 'not_found' | 'xp_below_zero' }> {
  const { userId, amount, now } = input;
  try {
    // Пропущене ретро лише додало б досвіду: перевірка «не нижче нуля» без нього не хибить на користь віднімання.
    await syncXp(db, userId);
  } catch (error) {
    reportError(error, { where: 'player-card' });
  }
  const result = await db.transaction(async (tx) => {
    if (!(await exists(tx, userId))) return { ok: false as const, error: 'not_found' as const };
    const [locked] = await tx.select({ id: profile.userId }).from(profile).where(eq(profile.userId, userId)).for('update');
    if (locked === undefined) return { ok: false as const, error: 'not_found' as const };
    const xp = ((await xpTotals(tx, [userId])).get(userId) ?? 0) + amount;
    if (xp < 0) return { ok: false as const, error: 'xp_below_zero' as const };
    await tx.insert(xpEntry).values({ userId, source: 'admin', amount, note: input.reason, day: kyivDay(now), at: now, createdAt: now, counted: false, reason: null });
    await logAction(tx, { adminId: input.adminId, kind: 'xp_adjust', targetUserId: userId, details: { amount, reason: input.reason }, now });
    return { ok: true as const, xp, level: levelOf(xp) };
  });
  if (result.ok) await announce(db, userId, now);
  return result;
}

const KNOWN = new Set<string>(ACHIEVEMENTS);

/**
 * 58: картка гравця для адміна — лише читання: огляд (рівень і досвід після syncXp, збій не ламає), досягнення й заборони, останні ігри,
 * вікторини, бани й розбани, ручний досвід. Досягнення читаються як є, без запуску синхронізації. Немає користувача — null.
 */
export async function playerCard(db: Db, userId: string, now: Date): Promise<AdminPlayerCard | null> {
  void now;
  const [account] = await db.select({ createdAt: user.createdAt }).from(user).where(eq(user.id, userId));
  if (account === undefined) return null;
  try {
    await syncXp(db, userId);
  } catch (error) {
    reportError(error, { where: 'player-card' });
  }
  const [found] = await db.select({ avatar: profile.avatar, lastSeenAt: profile.lastSeenAt }).from(profile).where(eq(profile.userId, userId));
  const xp = (await xpTotals(db, [userId])).get(userId) ?? 0;
  const [counts] = await db
    .select({
      games: sql<number>`(select count(distinct p.game_id)::int from ${participant} p join ${game} g on g.id = p.game_id where p.user_id = ${userId} and g.status = 'finished')`,
      wins: sql<number>`(select count(distinct p.game_id)::int from ${participant} p join ${game} g on g.id = p.game_id where p.user_id = ${userId} and g.status = 'finished' and p.rank = 1)`,
      groups: sql<number>`(select count(*)::int from ${groupMember} where ${groupMember.userId} = ${userId})`,
    })
    .from(user)
    .where(eq(user.id, userId));
  const quizzes = await db.select().from(quiz).where(eq(quiz.ownerId, userId)).orderBy(desc(quiz.updatedAt), quiz.id);
  const earned = await db.select({ id: userAchievement.achievementId, earnedAt: userAchievement.earnedAt }).from(userAchievement).where(eq(userAchievement.userId, userId));
  const blocked = await db.select({ id: achievementBlock.achievementId }).from(achievementBlock).where(eq(achievementBlock.userId, userId));
  const rank = (id: string) => ACHIEVEMENTS.indexOf(id as AchievementId);
  const bans = await db
    .select({ at: adminAction.at, kind: adminAction.kind, admin: adminAction.adminLabel, details: adminAction.details })
    .from(adminAction)
    .where(and(eq(adminAction.targetUserId, userId), inArray(adminAction.kind, ['ban', 'unban'])))
    .orderBy(desc(adminAction.at), desc(adminAction.id))
    .limit(ADMIN_CARD_BANS);
  const manual = await db
    .select({ id: xpEntry.id, amount: xpEntry.amount, note: xpEntry.note, at: xpEntry.at, createdAt: xpEntry.createdAt })
    .from(xpEntry)
    .where(and(eq(xpEntry.userId, userId), eq(xpEntry.source, 'admin')))
    .orderBy(desc(xpEntry.createdAt), desc(xpEntry.id))
    .limit(ADMIN_CARD_XP);
  const recent = await playerGames(db, userId, ADMIN_CARD_GAMES);
  return {
    overview: {
      avatar: found?.avatar ?? null,
      registeredAt: account.createdAt.toISOString(),
      lastSeenAt: found?.lastSeenAt?.toISOString() ?? null,
      level: levelOf(xp),
      xp,
      games: counts?.games ?? 0,
      wins: counts?.wins ?? 0,
      quizzes: quizzes.length,
      friends: (await friendsOf(db, userId)).length,
      groups: counts?.groups ?? 0,
    },
    achievements: earned
      .filter((row) => KNOWN.has(row.id))
      .sort((x, y) => rank(x.id) - rank(y.id))
      .map((row) => ({ id: row.id, earnedAt: row.earnedAt?.toISOString() ?? null })),
    blocked: blocked.map((row) => row.id).filter((id) => KNOWN.has(id)).sort((x, y) => rank(x) - rank(y)),
    games: recent.map(({ played }) => ({ gameId: played.gameId, title: played.title, startedAt: played.startedAt, rank: played.rank, playerCount: played.playerCount, score: played.score })),
    quizzes: quizzes.map((row) => ({ id: row.id, title: row.title, questions: questionsOf(row).length, updatedAt: row.updatedAt.toISOString() })),
    bans: bans.map((row) => ({ at: row.at.toISOString(), kind: row.kind === 'ban' ? ('ban' as const) : ('unban' as const), admin: row.admin, reason: row.details.reason ?? null })),
    xp: manual.map((row) => ({ id: row.id, amount: row.amount, note: row.note ?? '', at: row.at?.toISOString() ?? row.createdAt.toISOString() })),
  };
}
