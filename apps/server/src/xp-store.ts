import {
  ACHIEVEMENT_XP,
  ACHIEVEMENTS,
  achievementRarity,
  levelOf,
  levelProgress,
  looksAllowed,
  looksShown,
  nextRewards,
  PACK_ACHIEVEMENTS,
  packsByAchievements,
  rewardsUpTo,
  xpForLevel,
  type AchievementId,
  type LooksInput,
  type NickLevel,
  type NickLooks,
  type OwnLevel,
  type PublicLevel,
  type StickerExtra,
} from '@quiz/shared';
import { and, asc, eq, gt, inArray, isNotNull, isNull, notExists, sql } from 'drizzle-orm';
import { loadAchievementGames, type AchievementGame } from './achievement-games';
import type { Db } from './db/client';
import { game, participant, profile, quiz, userAchievement, xpEntry } from './db/schema';
import { ensureProfile } from './profiles';
import { capXp, gameXp, kyivDay, type XpAward } from './xp-rules';
import { reportError } from './log';

/** Скільки ігор ретро й наздоганяння читає за раз. */
const BATCH = 20;

const KNOWN: ReadonlySet<string> = new Set(ACHIEVEMENTS);

const logError = (error: unknown) => reportError(error, { where: 'xp' });

/** Автор вікторини гри; вікторину видалено (чи її не було) — ведучий гри, що й був автором: правило author діє й далі. */
const authorOf = sql<string>`coalesce(${quiz.ownerId}, ${game.hostId})`;

/** Вікторина гри й її автор (автор — власник вікторини, а коли її видалено — ведучий гри). */
interface GameMeta {
  quizId: string | null;
  ownerId: string | null;
}

type EntryInsert = typeof xpEntry.$inferInsert;

function gameEntry(userId: string, loaded: AchievementGame, meta: GameMeta, award: XpAward, amount: number, capped: boolean, retro: boolean): EntryInsert {
  const at = loaded.finishedAt ?? new Date();
  return {
    userId,
    source: 'game',
    gameId: loaded.gameId,
    quizId: meta.quizId,
    amount,
    counted: award.counted,
    reason: award.reason ?? (capped ? 'cap' : null),
    day: kyivDay(at),
    at,
    retro,
    createdAt: new Date(),
  };
}

const gameRows = (userId: string) => and(eq(xpEntry.userId, userId), eq(xpEntry.source, 'game'));

/** Запис цієї людини за цю гру з правилами й стелею; виклик — під замком рядка profile (тож стеля й repeat_quiz не розходяться в гонці). */
async function writeCapped(tx: Db, userId: string, loaded: AchievementGame, meta: GameMeta): Promise<void> {
  const own = await tx
    .select({ id: xpEntry.id })
    .from(xpEntry)
    .where(and(gameRows(userId), eq(xpEntry.gameId, loaded.gameId)))
    .limit(1);
  if (own.length > 0) return;
  const seen =
    meta.quizId !== null &&
    (
      await tx
        .select({ id: xpEntry.id })
        .from(xpEntry)
        .where(and(gameRows(userId), eq(xpEntry.quizId, meta.quizId), eq(xpEntry.counted, true)))
        .limit(1)
    ).length > 0;
  const award = gameXp(loaded, meta.ownerId, (id) => id === userId && seen).find((a) => a.userId === userId);
  if (award === undefined) return;
  const day = kyivDay(loaded.finishedAt ?? new Date());
  const [used] = await tx
    .select({ sum: sql<number>`coalesce(sum(${xpEntry.amount}), 0)::int` })
    .from(xpEntry)
    .where(and(gameRows(userId), eq(xpEntry.day, day)));
  const { amount, capped } = capXp(award.base, Number(used?.sum ?? 0));
  await tx.insert(xpEntry).values(gameEntry(userId, loaded, meta, award, amount, capped, false)).onConflictDoNothing();
}

/** Одна жива гра одній людині: транзакція з select … for update рядка profile — дві гри одночасно разом не перейдуть стелю. */
async function creditCapped(db: Db, userId: string, loaded: AchievementGame, meta: GameMeta): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.select({ id: profile.userId }).from(profile).where(eq(profile.userId, userId)).for('update');
    await writeCapped(tx, userId, loaded, meta);
  });
}

/** Ігри користувача-гравця (рядок з місцем), завершені; since — лише після мітки й без власного рядка. Від найранішої. */
async function playedGames(db: Db, userId: string, since: Date | null): Promise<{ gameId: string; finishedAt: Date | null; meta: GameMeta }[]> {
  const rows = await db
    .select({ id: game.id, finishedAt: game.finishedAt, quizId: game.quizId, ownerId: authorOf })
    .from(participant)
    .innerJoin(game, eq(game.id, participant.gameId))
    .leftJoin(quiz, eq(quiz.id, game.quizId))
    .where(
      and(
        eq(participant.userId, userId),
        isNotNull(participant.rank),
        eq(game.status, 'finished'),
        since === null
          ? undefined
          : and(
              gt(game.finishedAt, since),
              notExists(
                db
                  .select({ one: sql`1` })
                  .from(xpEntry)
                  .where(and(gameRows(userId), eq(xpEntry.gameId, game.id))),
              ),
            ),
      ),
    )
    .orderBy(asc(game.finishedAt), asc(game.id));
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (seen.has(row.id)) return [];
    seen.add(row.id);
    return [{ gameId: row.id, finishedAt: row.finishedAt, meta: { quizId: row.quizId, ownerId: row.ownerId } }];
  });
}

/**
 * Ретро під замком рядка profile: якщо мітки все ще немає — усі завершені ігри користувача за правилами, без стелі, retro true;
 * далі досягнення й мітка (час до читання ігор: гра, що закінчиться пізніше, піде наздоганянням). Повертає мітку, якщо її вже поставив хтось інший.
 */
async function retro(db: Db, userId: string): Promise<Date | null> {
  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ mark: profile.xpSyncedAt }).from(profile).where(eq(profile.userId, userId)).for('update');
    if (locked === undefined) return null;
    if (locked.mark !== null) return locked.mark;
    const since = new Date();
    const games = await playedGames(tx, userId, null);
    const stored = await tx.select({ gameId: xpEntry.gameId, quizId: xpEntry.quizId, counted: xpEntry.counted }).from(xpEntry).where(gameRows(userId));
    const done = new Set(stored.map((row) => row.gameId));
    // Зараховані вікторини: з бази й з цього проходу.
    const seen = new Set(stored.flatMap((row) => (row.counted && row.quizId !== null ? [row.quizId] : [])));
    const metaOf = new Map(games.map((g) => [g.gameId, g.meta]));
    const rows: EntryInsert[] = [];
    const todo = games.filter((g) => !done.has(g.gameId)).map((g) => g.gameId);
    for (let i = 0; i < todo.length; i += BATCH) {
      for (const loaded of await loadAchievementGames(tx, todo.slice(i, i + BATCH))) {
        const meta = metaOf.get(loaded.gameId)!;
        const award = gameXp(loaded, meta.ownerId, (id) => id === userId && meta.quizId !== null && seen.has(meta.quizId)).find((a) => a.userId === userId);
        if (award === undefined) continue;
        if (award.counted && meta.quizId !== null) seen.add(meta.quizId);
        rows.push(gameEntry(userId, loaded, meta, award, award.base, false, true));
      }
    }
    for (let i = 0; i < rows.length; i += 200) await tx.insert(xpEntry).values(rows.slice(i, i + 200)).onConflictDoNothing();
    await creditAchievements(tx, userId);
    await tx.update(profile).set({ xpSyncedAt: since }).where(eq(profile.userId, userId));
    return null;
  });
}

/**
 * Ігри після мітки без власного рядка — зі стелею, кожна у власному try (збій — onError, решта йде далі).
 * Мітка переходить лише на останню гру перед першим збоєм: збійну підбере наступне наздоганяння, а зараховані після неї мають власний рядок і не дублюються.
 */
async function catchUp(db: Db, userId: string, mark: Date, onError: (e: unknown) => void): Promise<void> {
  const missed = await playedGames(db, userId, mark);
  let reached: Date | null = null;
  let failed = false;
  for (const { gameId, finishedAt, meta } of missed) {
    try {
      const [loaded] = await loadAchievementGames(db, [gameId]);
      if (loaded !== undefined) await creditCapped(db, userId, loaded, meta);
      // Від найранішої: поки збою не було, мітка йде за грою.
      if (!failed && finishedAt !== null) reached = finishedAt;
    } catch (error) {
      failed = true;
      onError(error);
    }
  }
  if (reached !== null) {
    await db
      .update(profile)
      .set({ xpSyncedAt: sql`greatest(${profile.xpSyncedAt}, ${reached})` })
      .where(eq(profile.userId, userId));
  }
}

/** Рядки 'achievement' для всіх user_achievement без рядка, з ACHIEVEMENT_XP за рідкістю; at = earned_at. Поза денною стелею. */
export async function creditAchievements(db: Db, userId: string): Promise<void> {
  const rows = await db
    .select({ id: userAchievement.achievementId, earnedAt: userAchievement.earnedAt })
    .from(userAchievement)
    .where(
      and(
        eq(userAchievement.userId, userId),
        notExists(
          db
            .select({ one: sql`1` })
            .from(xpEntry)
            .where(and(eq(xpEntry.userId, userId), eq(xpEntry.source, 'achievement'), eq(xpEntry.achievementId, userAchievement.achievementId))),
        ),
      ),
    );
  const known = rows.filter((row) => KNOWN.has(row.id));
  if (known.length === 0) return;
  const now = new Date();
  await db
    .insert(xpEntry)
    .values(
      known.map(
        (row): EntryInsert => ({
          userId,
          source: 'achievement',
          achievementId: row.id as AchievementId,
          amount: ACHIEVEMENT_XP[achievementRarity(row.id)],
          day: kyivDay(row.earnedAt ?? now),
          at: row.earnedAt,
          createdAt: now,
        }),
      ),
    )
    .onConflictDoNothing();
}

/** Без мітки — ретро всіх finished ігор, де користувач у таблиці (хронологічно, без стелі, retro true), далі досягнення й мітка. З міткою — наздоганяє ігри після неї без власного рядка, зі стелею. */
export async function syncXp(db: Db, userId: string, onError: (e: unknown) => void = logError): Promise<void> {
  const [row] = await db.select({ mark: profile.xpSyncedAt }).from(profile).where(eq(profile.userId, userId));
  if (row === undefined && (await ensureProfile(db, userId)) === null) return;
  const mark = row?.mark ?? (await retro(db, userId));
  if (mark === null) return;
  await catchUp(db, userId, mark, onError);
  await creditAchievements(db, userId);
}

/** Після фінішу: кожен акаунт таблиці — без мітки syncXp (ретро, що включить і цю гру), інакше один рядок зі стелею; далі досягнення (й ведучому та автору). Незавершена гра — нічого. Збій одного — onError, решта йде далі. */
export async function creditGame(db: Db, gameId: string, onError: (e: unknown) => void = logError): Promise<void> {
  const [loaded] = await loadAchievementGames(db, [gameId]);
  if (loaded === undefined) return;
  const [roles] = await db.select({ quizId: game.quizId, hostId: game.hostId, ownerId: authorOf }).from(game).leftJoin(quiz, eq(quiz.id, game.quizId)).where(eq(game.id, gameId));
  const meta: GameMeta = { quizId: roles?.quizId ?? null, ownerId: roles?.ownerId ?? null };
  const players = gameXp(loaded, meta.ownerId, () => false).map((a) => a.userId);
  for (const userId of players) {
    try {
      const [row] = await db.select({ mark: profile.xpSyncedAt }).from(profile).where(eq(profile.userId, userId));
      if (row === undefined || row.mark === null) {
        await syncXp(db, userId, onError);
        // Ретро, що поставило мітку раніше за запис цієї гри, могло її не побачити, а наздоганяння бере лише ігри після мітки.
        // Рядок власний і унікальний: якщо ретро гру вже взяло, тут нічого не допишеться.
        await creditCapped(db, userId, loaded, meta);
      } else {
        await creditCapped(db, userId, loaded, meta);
        await creditAchievements(db, userId);
      }
    } catch (error) {
      onError(error);
    }
  }
  // Ачівки ведучого й автора (12i видає й їм).
  for (const userId of new Set([roles?.hostId ?? null, meta.ownerId])) {
    if (userId === null || players.includes(userId)) continue;
    try {
      await creditAchievements(db, userId);
    } catch (error) {
      onError(error);
    }
  }
}

export async function xpTotals(db: Db, userIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>(userIds.map((id) => [id, 0]));
  if (userIds.length === 0) return totals;
  const rows = await db
    .select({ userId: xpEntry.userId, sum: sql<number>`coalesce(sum(${xpEntry.amount}), 0)::int` })
    .from(xpEntry)
    .where(inArray(xpEntry.userId, userIds))
    .groupBy(xpEntry.userId);
  for (const row of rows) totals.set(row.userId, Number(row.sum));
  return totals;
}

async function looksOf(db: Db, userIds: string[]): Promise<Map<string, NickLooks>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: profile.userId, color: profile.nickColor, frame: profile.nickFrame, badge: profile.badge, photo: profile.photoFrame, font: profile.nickFont, effect: profile.nickEffect })
    .from(profile)
    .where(inArray(profile.userId, userIds));
  return new Map(
    rows.map((row) => [row.userId, { color: row.color ?? null, frame: row.frame ?? null, badge: row.badge ?? null, photo: row.photo ?? null, font: row.font ?? null, effect: row.effect ?? null }]),
  );
}

const NO_LOOKS: NickLooks = { color: null, frame: null, badge: null, photo: null, font: null, effect: null };

/** Для кімнати: syncXp тим, хто без мітки (збій — onError, рівень з наявного), далі NickLevel з looksShown. */
export async function roomLevels(db: Db, userIds: string[], onError: (e: unknown) => void = logError): Promise<Map<string, NickLevel>> {
  const ids = [...new Set(userIds)];
  const levels = new Map<string, NickLevel>();
  if (ids.length === 0) return levels;
  const marks = await db.select({ userId: profile.userId, mark: profile.xpSyncedAt }).from(profile).where(inArray(profile.userId, ids));
  const synced = new Set(marks.filter((row) => row.mark !== null).map((row) => row.userId));
  for (const id of ids) {
    if (synced.has(id)) continue;
    try {
      await syncXp(db, id, onError);
    } catch (error) {
      onError(error);
    }
  }
  const totals = await xpTotals(db, ids);
  const looks = await looksOf(db, ids);
  for (const id of ids) {
    const level = levelOf(totals.get(id) ?? 0);
    const shown = looksShown(looks.get(id) ?? NO_LOOKS, level);
    // Ключ effect — лише коли ефект є (34): старі клієнти й фікстури без нього.
    levels.set(id, { level, color: shown.color, frame: shown.frame, font: shown.font, ...(shown.effect === null ? {} : { effect: shown.effect }) });
  }
  return levels;
}

/** Чисте: мить відкриття кожного досягнутого рівня 1..level з рядків журналу за (at, id); null — рядок без дати (чи рядків немає). */
export function unlockTimes(entries: { at: Date | null; amount: number }[], level: number): Map<number, Date | null> {
  const times = new Map<number, Date | null>();
  let sum = 0;
  let next = 1;
  for (const entry of entries) {
    sum += entry.amount;
    while (next <= level && sum >= xpForLevel(next)) times.set(next++, entry.at);
    if (next > level) break;
  }
  for (; next <= level; next++) times.set(next, null);
  return times;
}

/** Перед читанням рівня — наздогнати (збій не ламає читання). */
async function synced(db: Db, userId: string): Promise<void> {
  try {
    await syncXp(db, userId);
  } catch (error) {
    logError(error);
  }
}

export async function ownLevel(db: Db, userId: string): Promise<OwnLevel> {
  await synced(db, userId);
  const entries = await db
    .select({ at: xpEntry.at, amount: xpEntry.amount })
    .from(xpEntry)
    .where(eq(xpEntry.userId, userId))
    .orderBy(sql`${xpEntry.at} asc nulls first`, asc(xpEntry.id));
  const progress = levelProgress(entries.reduce((sum, e) => sum + e.amount, 0));
  const times = unlockTimes(entries, progress.level);
  const looks = (await looksOf(db, [userId])).get(userId) ?? NO_LOOKS;
  return {
    progress,
    unlocked: rewardsUpTo(progress.level).map(({ level, reward }) => ({ level, reward, at: times.get(level)?.toISOString() ?? null })),
    next: nextRewards(progress.level),
    looks: looksShown(looks, progress.level),
  };
}

export async function publicLevel(db: Db, userId: string): Promise<PublicLevel> {
  await synced(db, userId);
  const level = levelOf((await xpTotals(db, [userId])).get(userId) ?? 0);
  const looks = (await looksOf(db, [userId])).get(userId) ?? NO_LOOKS;
  return { level, looks: looksShown(looks, level) };
}

/** Рівень акаунта (після наздоганяння XP): для перевірки закритого оформлення призів. */
export async function accountLevel(db: Db, userId: string): Promise<number> {
  await synced(db, userId);
  return levelOf((await xpTotals(db, [userId])).get(userId) ?? 0);
}

/** Вбрання з відкритого рівнем; закрите → look_locked. */
export async function saveLooks(db: Db, userId: string, looks: LooksInput): Promise<{ ok: true; looks: NickLooks } | { ok: false; error: 'look_locked' }> {
  // Спершу наздогнати: без ретро користувач бачив би рівень 1 і хибне look_locked.
  await synced(db, userId);
  const level = levelOf((await xpTotals(db, [userId])).get(userId) ?? 0);
  // Відсутні photo/font/effect (старий клієнт) — лишити збережене, але вже після looksShown.
  const stored = looksShown((await looksOf(db, [userId])).get(userId) ?? NO_LOOKS, level);
  const full: NickLooks = { color: looks.color, frame: looks.frame, badge: looks.badge, photo: looks.photo === undefined ? stored.photo : looks.photo, font: looks.font === undefined ? stored.font : looks.font, effect: looks.effect === undefined ? stored.effect : looks.effect };
  if (!looksAllowed(full, level)) return { ok: false, error: 'look_locked' };
  await ensureProfile(db, userId);
  await db.update(profile).set({ nickColor: full.color, nickFrame: full.frame, badge: full.badge, photoFrame: full.photo, nickFont: full.font, nickEffect: full.effect, updatedAt: new Date() }).where(eq(profile.userId, userId));
  return { ok: true, looks: full };
}

/** Скільки профілів знімок успадкування стікерів бере за раз. */
const LEGACY_BATCH = 200;

/**
 * Стікери (34, рішення власника «м'якше»): на старті кожен наявний акаунт (stickers_settled = false) дістає
 * stickers_legacy_level = свій рівень у цю мить — усе, що старе правило серій давало на ньому, лишається відкритим.
 * Нові акаунти створюються вже з true і нічого не успадковують. Без мітки досвіду спершу наздоганяємо (інакше рівень занижено);
 * збій наздоганяння лишає акаунт на наступний старт, а до того stickerAccess рахує рівень наживо (після наздоганяння). Ідемпотентно.
 * Акаунти з історією ігор, але без рядка профілю (з часів до 15a), спершу дістають профіль і стають у ту саму чергу.
 */
export async function settleStickerLegacy(db: Db, onError: (e: unknown) => void = (error) => reportError(error, { where: 'sticker-legacy' })): Promise<void> {
  await adoptProfileless(db, onError);
  let after = '';
  for (;;) {
    const rows = await db
      .select({ userId: profile.userId, mark: profile.xpSyncedAt })
      .from(profile)
      .where(and(eq(profile.stickersSettled, false), gt(profile.userId, after)))
      .orderBy(asc(profile.userId))
      .limit(LEGACY_BATCH);
    if (rows.length === 0) return;
    const ready: string[] = [];
    for (const row of rows) {
      if (row.mark === null) {
        try {
          await syncXp(db, row.userId, onError);
        } catch (error) {
          onError(error);
          continue;
        }
      }
      ready.push(row.userId);
    }
    if (ready.length > 0) {
      const totals = await xpTotals(db, ready);
      const values = sql.join(
        ready.map((id) => sql`(${id}, ${levelOf(totals.get(id) ?? 0)}::int)`),
        sql`, `,
      );
      // stickers_settled = false ще раз: інший екземпляр міг тим часом зробити знімок — не переписуємо.
      await db.execute(sql`
        update profile set stickers_legacy_level = v.level, stickers_settled = true
        from (values ${values}) as v(user_id, level)
        where profile.user_id = v.user_id and profile.stickers_settled = false`);
    }
    if (rows.length < LEGACY_BATCH) return;
    after = rows[rows.length - 1].userId;
  }
}

/**
 * Наявні акаунти без профілю, що грали (participant.user_id): профіль створюється, і знімок для нього ще не зроблено
 * (stickers_settled = false). Новий профіль за замовчуванням «нічого не успадковує» — для давнього гравця це втрата стікерів.
 * Повторний виклик нічого не знаходить: профіль уже є.
 */
async function adoptProfileless(db: Db, onError: (e: unknown) => void): Promise<void> {
  const rows = await db
    .selectDistinct({ userId: participant.userId })
    .from(participant)
    .where(and(isNotNull(participant.userId), notExists(db.select({ one: sql`1` }).from(profile).where(eq(profile.userId, participant.userId)))));
  for (const { userId } of rows) {
    if (userId === null) continue;
    try {
      if ((await ensureProfile(db, userId)) === null) continue;
      // Лише щойно створений: ні мітки досвіду, ні знімка.
      await db
        .update(profile)
        .set({ stickersSettled: false })
        .where(and(eq(profile.userId, userId), isNull(profile.xpSyncedAt), isNull(profile.stickersLegacyLevel)));
    } catch (error) {
      onError(error);
    }
  }
}

/** Ачівки, що відкривають набори стікерів (34). */
const PACK_ACHIEVEMENT_IDS: AchievementId[] = Object.values(PACK_ACHIEVEMENTS);

/**
 * Що відкриває стікери понад рівень (34): набори за здобуті досягнення і рівень успадкування.
 * Акаунт без знімка (збій на старті) — успадковує свій поточний рівень, як дав би знімок, але вже після наздоганяння досвіду
 * (без мітки — syncXp), щоб не впасти тимчасово до рівня 1. Лише серверне: у зріз гри не йде.
 */
export async function stickerAccess(db: Db, userIds: string[]): Promise<Map<string, StickerExtra>> {
  const ids = [...new Set(userIds)];
  const access = new Map<string, StickerExtra>();
  if (ids.length === 0) return access;
  const rows = await db
    .select({ userId: profile.userId, legacy: profile.stickersLegacyLevel, settled: profile.stickersSettled, mark: profile.xpSyncedAt })
    .from(profile)
    .where(inArray(profile.userId, ids));
  for (const row of rows) {
    if (row.settled || row.mark !== null) continue;
    try {
      await syncXp(db, row.userId);
    } catch (error) {
      logError(error);
    }
  }
  const unsettled = rows.filter((row) => !row.settled).map((row) => row.userId);
  const totals = unsettled.length === 0 ? new Map<string, number>() : await xpTotals(db, unsettled);
  const earned = await db
    .select({ userId: userAchievement.userId, id: userAchievement.achievementId })
    .from(userAchievement)
    .where(and(inArray(userAchievement.userId, ids), inArray(userAchievement.achievementId, PACK_ACHIEVEMENT_IDS)));
  for (const id of ids) {
    const row = rows.find((r) => r.userId === id);
    const legacyLevel = row === undefined ? null : row.settled ? row.legacy : levelOf(totals.get(id) ?? 0);
    access.set(id, { packs: packsByAchievements(earned.filter((e) => e.userId === id).map((e) => e.id)), legacyLevel });
  }
  return access;
}

export async function stickerAccessOne(db: Db, userId: string): Promise<StickerExtra> {
  return (await stickerAccess(db, [userId])).get(userId) ?? {};
}
