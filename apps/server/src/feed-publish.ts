import { ACHIEVEMENTS, FEED_RETENTION_DAYS, levelOf, type FeedData } from '@quiz/shared';
import { and, asc, eq, gt, gte, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { feedEvent, game, participant, profile, quiz } from './db/schema';
import { xpTotals } from './xp-store';

/** Що обрати: одна гра (крок рекордера) чи всі finished ігри з finished_at >= since (історія). */
type Scope = { gameId: string } | { since: Date };

/** Скільки ігор історії йде в один insert … select; скільки профілів — в одне оновлення feed_level. */
const GAME_BATCH = 100;
const PROFILE_BATCH = 500;
const DAY_MS = 86_400_000;

const KNOWN_ACHIEVEMENTS = sql.join(
  ACHIEVEMENTS.map((id) => sql`${id}`),
  sql`, `,
);

/** Ігри scope порціями: одна гра — одна порція (статус перевіряє сам запит), історія — id finished ігор з finished_at >= since, по GAME_BATCH. */
async function* batches(db: Db, scope: Scope): AsyncGenerator<string[]> {
  if ('gameId' in scope) {
    yield [scope.gameId];
    return;
  }
  // Ключ порцій — id гри: точний (на відміну від finished_at з мікросекундами) і з індексом первинного ключа.
  let after: string | null = null;
  for (;;) {
    const rows: { id: string }[] = await db
      .select({ id: game.id })
      .from(game)
      .where(and(eq(game.status, 'finished'), gte(game.finishedAt, scope.since), after === null ? undefined : gt(game.id, after)))
      .orderBy(asc(game.id))
      .limit(GAME_BATCH);
    if (rows.length === 0) return;
    yield rows.map((row) => row.id);
    if (rows.length < GAME_BATCH) return;
    after = rows[rows.length - 1].id;
  }
}

/** Ігри порції, що справді finished, — у сирому SQL під псевдонімом g. */
const finishedIn = (ids: string[]): SQL =>
  sql`g.status = 'finished' and g.finished_at is not null and g.id in (${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;

/**
 * created_at: для історії — сам at (бейдж не світиться), для живої гри — мить запису (з точністю до мілісекунд).
 * Живу мить беремо навмисно раз на порцію (один insert … select), а не now() бази: усі рядки порції мають ту саму мілісекундну мітку.
 */
const createdAt = (history: boolean, at: SQL): SQL => (history ? at : sql`${new Date().toISOString()}::timestamptz`);

async function each(db: Db, scope: Scope, write: (ids: string[]) => SQL): Promise<void> {
  for await (const ids of batches(db, scope)) await db.execute(write(ids));
}

/** Події game: одна на акаунт таблиці з найкращим місцем; гості й ведучий без місця подій не мають. */
export async function writeGameEvents(db: Db, scope: Scope, history: boolean): Promise<void> {
  const at = sql`date_trunc('milliseconds', g.finished_at)`;
  await each(
    db,
    scope,
    (ids) => sql`
      insert into feed_event (key, user_id, kind, game_id, data, at, created_at)
      select distinct on (g.id, p.user_id)
        'game:' || g.id::text || ':' || p.user_id,
        p.user_id,
        'game',
        g.id,
        jsonb_build_object(
          'kind', 'game',
          'title', g.title,
          'place', p.rank,
          'of', (select count(*)::int from participant c where c.game_id = g.id and c.team_id is null),
          'team', t.nickname
        ),
        ${at},
        ${createdAt(history, at)}
      from game g
      join participant p on p.game_id = g.id
      left join participant t on t.id = p.team_id
      where ${finishedIn(ids)} and p.user_id is not null
      order by g.id, p.user_id, p.rank asc nulls last
      on conflict (key) do nothing`,
  );
}

/** Події achievement: датовані ачівки гри (гравців, ведучого, автора); давні (earned_at null) і невідомі id — ні. */
export async function writeAchievementEvents(db: Db, scope: Scope, history: boolean): Promise<void> {
  const at = sql`date_trunc('milliseconds', ua.earned_at)`;
  await each(
    db,
    scope,
    (ids) => sql`
      insert into feed_event (key, user_id, kind, game_id, data, at, created_at)
      select
        'achievement:' || ua.user_id || ':' || ua.achievement_id,
        ua.user_id,
        'achievement',
        g.id,
        jsonb_build_object('kind', 'achievement', 'achievementId', ua.achievement_id),
        ${at},
        ${createdAt(history, at)}
      from user_achievement ua
      join game g on g.id = ua.game_id
      where ${finishedIn(ids)} and ua.earned_at is not null and ua.achievement_id in (${KNOWN_ACHIEVEMENTS})
      on conflict (key) do nothing`,
  );
}

/** Події prize: вручені призи гри; титул 14a — nickTitle; справжній приз (фото, текст) не показується. */
export async function writePrizeEvents(db: Db, scope: Scope, history: boolean): Promise<void> {
  const at = sql`date_trunc('milliseconds', pa.awarded_at)`;
  await each(
    db,
    scope,
    (ids) => sql`
      insert into feed_event (key, user_id, kind, game_id, data, at, created_at)
      select
        'prize:' || pa.id::text,
        pa.user_id,
        'prize',
        g.id,
        jsonb_build_object(
          'kind', 'prize',
          'place', pa.place,
          'name', pa.content->>'name',
          'title', pa.quiz_title,
          'nickTitle', pa.content->>'title'
        ),
        ${at},
        ${createdAt(history, at)}
      from prize_award pa
      join game g on g.id = pa.game_id
      where ${finishedIn(ids)}
      on conflict (key) do nothing`,
  );
}

/** Для кожного акаунта: levelOf(xpTotals) > coalesce(feed_level, 1) → подія level найвищого рівня й feed_level = він, в одній транзакції. */
export async function announceLevels(db: Db, userIds: string[], gameId: string, at: Date): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  const totals = await xpTotals(db, ids);
  for (const userId of ids) {
    const level = levelOf(totals.get(userId) ?? 0);
    if (level <= 1) continue;
    await db.transaction(async (tx) => {
      // Умова в оновленні: два процеси чи повтор рекордера оголошують рівень лише раз (а ключ не дасть дубля події).
      const raised = await tx
        .update(profile)
        .set({ feedLevel: level })
        .where(and(eq(profile.userId, userId), or(isNull(profile.feedLevel), lt(profile.feedLevel, level))))
        .returning({ userId: profile.userId });
      if (raised.length === 0) return;
      const data: FeedData = { kind: 'level', level };
      await tx
        .insert(feedEvent)
        .values({ key: `level:${userId}:${level}`, userId, kind: 'level', gameId, data, at, createdAt: new Date() })
        .onConflictDoNothing({ target: feedEvent.key });
    });
  }
}

/** Крок рекордера: гра не finished — нічого; далі три write*(…, { gameId }, false) і announceLevels(гравці-акаунти + ведучий + автор). */
export async function publishGameFeed(db: Db, gameId: string): Promise<void> {
  const [row] = await db
    .select({ status: game.status, finishedAt: game.finishedAt, hostId: game.hostId, ownerId: quiz.ownerId })
    .from(game)
    .leftJoin(quiz, eq(quiz.id, game.quizId))
    .where(eq(game.id, gameId));
  if (row === undefined || row.status !== 'finished' || row.finishedAt === null) return;
  const scope = { gameId };
  await writeGameEvents(db, scope, false);
  await writeAchievementEvents(db, scope, false);
  await writePrizeEvents(db, scope, false);
  const players = await db
    .selectDistinct({ userId: participant.userId })
    .from(participant)
    .where(and(eq(participant.gameId, gameId), isNotNull(participant.userId)));
  const candidates = [...players.map((p) => p.userId!), row.hostId, row.ownerId ?? row.hostId];
  await announceLevels(db, candidates, gameId, row.finishedAt);
}

/**
 * На старті, у фоні після listen: write*({ since: now − 90 д }, true) — події завершених ігор за 90 днів з created_at = at (бейдж не світиться).
 * Дописування може записати події щойно завершеної гри з created_at = at, тож другу, чия позначка «переглянуто» пізніша за finished_at, бейдж за неї не покаже (подія в стрічці лишається) — прийнято.
 * Ідемпотентно (ключі): обірване зупинкою дописування наступний старт продовжить. Рівнів не пише — це settleFeedLevels.
 */
export async function backfillFeed(db: Db, now: Date): Promise<void> {
  const scope = { since: new Date(now.getTime() - FEED_RETENTION_DAYS * DAY_MS) };
  await writeGameEvents(db, scope, true);
  await writeAchievementEvents(db, scope, true);
  await writePrizeEvents(db, scope, true);
}

/**
 * На старті, до підняття кімнат: feed_level = levelOf(xp) профілям з feed_level null, без подій — наявні рівні не оголошуються всі разом.
 * До boot, щоб кімната, піднята в finished, не оголосила давнього рівня. Порціями по PROFILE_BATCH, по одному оновленню на порцію.
 */
export async function settleFeedLevels(db: Db): Promise<void> {
  let after = '';
  for (;;) {
    const rows = await db
      .select({ userId: profile.userId })
      .from(profile)
      .where(and(isNull(profile.feedLevel), gt(profile.userId, after)))
      .orderBy(asc(profile.userId))
      .limit(PROFILE_BATCH);
    if (rows.length === 0) return;
    const ids = rows.map((r) => r.userId);
    const totals = await xpTotals(db, ids);
    const values = sql.join(
      ids.map((id) => sql`(${id}, ${levelOf(totals.get(id) ?? 0)}::int)`),
      sql`, `,
    );
    // feed_level is null ще раз: рекордер міг тим часом оголосити рівень — його не переписуємо.
    await db.execute(sql`
      update profile set feed_level = v.level
      from (values ${values}) as v(user_id, level)
      where profile.user_id = v.user_id and profile.feed_level is null`);
    if (rows.length < PROFILE_BATCH) return;
    after = ids[ids.length - 1];
  }
}
