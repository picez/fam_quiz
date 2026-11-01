import {
  PRIZE_LIMITS,
  SHOWCASE_MAX,
  TITLE_MS,
  publicContent,
  type AwardCard,
  type PlacedPrize,
  type PrizeContent,
  type PrizeItem,
  type PrizePlace,
  type Showcase,
} from '@quiz/shared';
import { and, count, desc, eq, gt, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { liveRoom, prize, prizeAward, userTitle } from './db/schema';
import type { RoomManager } from './rooms/manager';

type Row = typeof prize.$inferSelect;
type Status = Row['status'];
type Places = [string | null, string | null, string | null];

const itemOf = (row: Row): PrizeItem => ({
  id: row.id,
  content: row.content,
  status: row.status === 'reserved' ? 'reserved' : 'free',
  createdAt: row.createdAt!.toISOString(),
});

/** Склад ведучого: free і reserved, найновіші першими. */
export async function listPrizes(db: Db, ownerId: string): Promise<PrizeItem[]> {
  const rows = await db
    .select()
    .from(prize)
    .where(and(eq(prize.ownerId, ownerId), ne(prize.status, 'awarded')))
    .orderBy(desc(prize.createdAt), desc(prize.id));
  return rows.map(itemOf);
}

/** Адмінка: усі призи з власником і статусом (і awarded). */
export async function listAllPrizes(
  db: Db,
): Promise<(Omit<PrizeItem, 'status'> & { ownerId: string; status: Status; reservedGame: string | null })[]> {
  const rows = await db.select().from(prize).orderBy(desc(prize.createdAt), desc(prize.id));
  return rows.map((row) => ({ id: row.id, content: row.content, createdAt: row.createdAt!.toISOString(), ownerId: row.ownerId, status: row.status, reservedGame: row.reservedGame }));
}

export async function createPrize(
  db: Db,
  ownerId: string,
  content: PrizeContent,
): Promise<{ ok: true; prize: PrizeItem } | { ok: false; error: 'too_many_prizes' }> {
  return db.transaction(async (tx) => {
    // Ліміт тримає склад (free + reserved); вручені до нього не рахуються.
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(prize)
      .where(and(eq(prize.ownerId, ownerId), ne(prize.status, 'awarded')));
    if (n >= PRIZE_LIMITS.perOwner) return { ok: false as const, error: 'too_many_prizes' as const };
    const now = new Date();
    const [row] = await tx.insert(prize).values({ ownerId, content, status: 'free', createdAt: now, updatedAt: now }).returning();
    return { ok: true as const, prize: itemOf(row!) };
  });
}

/** Лише free і свій; reserved → prize_in_game; немає / чужий / awarded → not_found. */
export async function updatePrize(
  db: Db,
  ownerId: string,
  id: string,
  content: PrizeContent,
): Promise<{ ok: true; prize: PrizeItem } | { ok: false; error: 'not_found' | 'prize_in_game' }> {
  const [row] = await db.select().from(prize).where(and(eq(prize.id, id), eq(prize.ownerId, ownerId)));
  if (row === undefined || row.status === 'awarded') return { ok: false, error: 'not_found' };
  if (row.status === 'reserved') return { ok: false, error: 'prize_in_game' };
  const [updated] = await db
    .update(prize)
    .set({ content, updatedAt: new Date() })
    .where(and(eq(prize.id, id), eq(prize.status, 'free')))
    .returning();
  // Приз встигли покласти в гру між читанням і записом.
  return updated === undefined ? { ok: false, error: 'prize_in_game' } : { ok: true, prize: itemOf(updated) };
}

/** Правила видалення (план 14a); ownerId null — адмінка: будь-який приз, знімає з кімнати цього процесу в будь-якій фазі. */
export async function deletePrize(
  db: Db,
  manager: RoomManager,
  id: string,
  ownerId: string | null,
): Promise<'deleted' | 'not_found' | 'prize_in_game'> {
  const [row] = await db.select().from(prize).where(ownerId === null ? eq(prize.id, id) : and(eq(prize.id, id), eq(prize.ownerId, ownerId)));
  if (row === undefined) return 'not_found';
  if (row.status === 'awarded' && ownerId !== null) return 'not_found';
  if (row.status === 'reserved' && row.reservedGame !== null) {
    const room = manager.rooms().find((r) => r.id === row.reservedGame);
    if (room !== undefined) {
      if (ownerId !== null && room.state.phase !== 'lobby') return 'prize_in_game';
      manager.unplacePrize(room, id);
    } else if (ownerId !== null) {
      const [stored] = await db.select({ code: liveRoom.code }).from(liveRoom).where(eq(liveRoom.roomId, row.reservedGame));
      if (stored !== undefined) return 'prize_in_game';
    }
  }
  await db.delete(prize).where(eq(prize.id, id));
  return 'deleted';
}

class Taken extends Error {}

/**
 * Одна транзакція: свої призи цієї гри, яких немає в places, → free; places → reserved за gameId, якщо вони свої й (free або вже за gameId).
 * Не всі взялись → відкат і prize_taken. Повертає PlacedPrize[] у порядку місць.
 */
export async function reservePlaces(
  db: Db,
  ownerId: string,
  gameId: string,
  places: Places,
): Promise<{ ok: true; placed: PlacedPrize[] } | { ok: false; error: 'prize_taken' }> {
  const ids = places.filter((id): id is string => id !== null);
  try {
    return await db.transaction(async (tx) => {
      const mine = and(eq(prize.ownerId, ownerId), eq(prize.status, 'reserved'), eq(prize.reservedGame, gameId));
      const now = new Date();
      await tx
        .update(prize)
        .set({ status: 'free', reservedGame: null, updatedAt: now })
        .where(ids.length === 0 ? mine : and(mine, notInArray(prize.id, ids)));
      if (ids.length === 0) return { ok: true as const, placed: [] };
      const taken = await tx
        .update(prize)
        .set({ status: 'reserved', reservedGame: gameId, updatedAt: now })
        .where(
          and(
            inArray(prize.id, ids),
            eq(prize.ownerId, ownerId),
            or(eq(prize.status, 'free'), and(eq(prize.status, 'reserved'), eq(prize.reservedGame, gameId))),
          ),
        )
        .returning();
      if (taken.length !== ids.length) throw new Taken();
      const byId = new Map(taken.map((row) => [row.id, row]));
      const placed: PlacedPrize[] = [];
      places.forEach((id, index) => {
        if (id !== null) placed.push({ place: (index + 1) as PrizePlace, id, content: byId.get(id)!.content });
      });
      return { ok: true as const, placed };
    });
  } catch (error) {
    if (error instanceof Taken) return { ok: false, error: 'prize_taken' };
    throw error;
  }
}

/** Резерви гри → free (reserved_game null). awarded не чіпає. */
export async function releasePrizes(db: Db, gameId: string): Promise<void> {
  await db
    .update(prize)
    .set({ status: 'free', reservedGame: null, updatedAt: new Date() })
    .where(and(eq(prize.status, 'reserved'), eq(prize.reservedGame, gameId)));
}

/** Старт сервера: reserved з reserved_game поза keep (і reserved без гри) → free; повертає, скільки повернуто. */
export async function releaseStalePrizes(db: Db, keep: string[]): Promise<number> {
  const stale = and(eq(prize.status, 'reserved'), keep.length === 0 ? sql`true` : or(isNull(prize.reservedGame), notInArray(prize.reservedGame, keep)));
  const rows = await db
    .update(prize)
    .set({ status: 'free', reservedGame: null, updatedAt: new Date() })
    .where(stale)
    .returning({ id: prize.id });
  return rows.length;
}


/** Що дає місце (задача 4 рахує з кімнати). winners — акаунти людей місця з ніком у грі; [] — гості чи нікого. */
export interface PrizeOutcome {
  place: PrizePlace;
  prizeId: string;
  winners: { userId: string; nickname: string }[];
}
export interface AwardInput {
  gameId: string;
  quizTitle: string;
  at: Date;
  outcomes: PrizeOutcome[];
}

/**
 * Для кожного місця своя транзакція. Перехід reserved → awarded умовний, тож повтор нічого не змінює;
 * вітрина й титул пишуться лише разом із першим переходом.
 */
export async function awardPrizes(db: Db, input: AwardInput): Promise<void> {
  const { gameId, quizTitle, at } = input;
  for (const outcome of input.outcomes) {
    await db.transaction(async (tx) => {
      const mine = and(eq(prize.id, outcome.prizeId), eq(prize.status, 'reserved'), eq(prize.reservedGame, gameId));
      if (outcome.winners.length === 0) {
        await tx.update(prize).set({ status: 'free', reservedGame: null, updatedAt: new Date() }).where(mine);
        return;
      }
      const [row] = await tx.update(prize).set({ status: 'awarded', reservedGame: null, updatedAt: new Date() }).where(mine).returning();
      if (row === undefined) return;
      const content = row.content;
      for (const winner of outcome.winners) {
        await tx
          .insert(prizeAward)
          .values({ userId: winner.userId, prizeId: row.id, gameId, place: outcome.place, content, quizTitle, nickname: winner.nickname, awardedAt: at })
          .onConflictDoNothing();
        if (content.title !== null) {
          const expiresAt = new Date(at.getTime() + TITLE_MS);
          await tx
            .insert(userTitle)
            .values({ userId: winner.userId, text: content.title, gameId, awardedAt: at, expiresAt })
            .onConflictDoUpdate({ target: userTitle.userId, set: { text: content.title, gameId, awardedAt: at, expiresAt } });
        }
      }
    });
  }
  // Резерви гри, яких немає серед місць (кімната без призів після відкату), повертаються.
  await releasePrizes(db, gameId);
}

/** Чинні титули (expires_at > now): userId → текст. */
export async function currentTitles(db: Db, userIds: string[], now: Date = new Date()): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: userTitle.userId, text: userTitle.text })
    .from(userTitle)
    .where(and(inArray(userTitle.userId, userIds), gt(userTitle.expiresAt, now)));
  return new Map(rows.map((row) => [row.userId, row.text]));
}

/** Вітрина: чинний титул і нагороди (найновіші першими, не більше SHOWCASE_MAX), зміст без name. */
export async function showcaseOf(db: Db, userId: string, now: Date = new Date()): Promise<Showcase> {
  const [titleRow] = await db
    .select()
    .from(userTitle)
    .where(and(eq(userTitle.userId, userId), gt(userTitle.expiresAt, now)));
  const rows = await db
    .select()
    .from(prizeAward)
    .where(eq(prizeAward.userId, userId))
    .orderBy(desc(prizeAward.awardedAt), desc(prizeAward.id))
    .limit(SHOWCASE_MAX);
  const awards: AwardCard[] = rows.map((row) => ({
    id: row.id,
    place: row.place,
    content: publicContent(row.content),
    quizTitle: row.quizTitle,
    nickname: row.nickname,
    awardedAt: row.awardedAt!.toISOString(),
  }));
  return { title: titleRow === undefined ? null : { text: titleRow.text, until: titleRow.expiresAt!.toISOString() }, awards };
}

/** Адмінка: прибрати рядок вітрини. */
export async function deleteAward(db: Db, awardId: string): Promise<boolean> {
  const rows = await db.delete(prizeAward).where(eq(prizeAward.id, awardId)).returning({ id: prizeAward.id });
  return rows.length > 0;
}
