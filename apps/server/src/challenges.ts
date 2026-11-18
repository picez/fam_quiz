import {
  CHALLENGE_CODE,
  CHALLENGE_DAYS,
  CHALLENGE_CODE_LENGTH,
  challengeQuiz,
  upgradeQuiz,
  type ChallengeMine,
  type ChallengeResultRow,
  type Quiz,
} from '@quiz/shared';
import { and, asc, count, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from './db/client';
import { challenge, challengeAttempt, game, participant } from './db/schema';
import { CODE_ATTEMPTS, isUniqueViolation } from './db/unique';
import { newCode } from './group-store';
import { getQuiz } from './quizzes';

const DAY_MS = 86_400_000;

export interface ChallengeRow {
  id: string;
  code: string;
  quizId: string | null;
  ownerId: string;
  title: string;
  snapshot: Quiz;
  createdAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
}

type StoredRow = typeof challenge.$inferSelect;

function rowOf(row: StoredRow): ChallengeRow {
  return {
    id: row.id,
    code: row.code,
    quizId: row.quizId,
    ownerId: row.ownerId,
    title: row.title,
    snapshot: upgradeQuiz(row.quizSnapshot) as Quiz,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    endedAt: row.endedAt,
  };
}

/** Активний = не завершений вручну й не прострочений. */
export function isActive(row: Pick<ChallengeRow, 'expiresAt' | 'endedAt'>, now: Date): boolean {
  return row.endedAt === null && row.expiresAt.getTime() > now.getTime();
}

const mineOf = (row: { quizId: string | null; code: string; expiresAt: Date }, played: number): ChallengeMine => ({
  quizId: row.quizId ?? '',
  code: row.code,
  expiresAt: row.expiresAt.toISOString(),
  played,
});

/**
 * Новий виклик на вікторину автора: знімок без того, що потребує інших гравців; попередній незавершений завершується.
 * Код — випадковий; повтор на колізії (23505) до 3 разів.
 */
export async function createChallenge(
  db: Db,
  ownerId: string,
  quizId: string,
  now: Date,
): Promise<{ ok: true; challenge: ChallengeRow } | { ok: false; error: 'not_found' | 'challenge_empty' }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const source = await getQuiz(tx as unknown as Db, ownerId, quizId);
        if (source === null) return { ok: false, error: 'not_found' } as const;
        const { quiz: snapshot } = challengeQuiz(source);
        if (snapshot === null) return { ok: false, error: 'challenge_empty' } as const;
        await tx
          .update(challenge)
          .set({ endedAt: now })
          .where(and(eq(challenge.quizId, quizId), isNull(challenge.endedAt)));
        const [created] = await tx
          .insert(challenge)
          .values({
            code: newCode(CHALLENGE_CODE_LENGTH),
            quizId,
            ownerId,
            title: source.title,
            quizSnapshot: snapshot,
            createdAt: now,
            expiresAt: new Date(now.getTime() + CHALLENGE_DAYS * DAY_MS),
          })
          .returning();
        return { ok: true, challenge: rowOf(created) } as const;
      });
    } catch (error) {
      if (attempt >= CODE_ATTEMPTS || !isUniqueViolation(error)) throw error;
    }
  }
}

/** Виклик за кодом; невірний формат — null без запиту. */
export async function challengeByCode(db: Db, code: string): Promise<ChallengeRow | null> {
  if (!CHALLENGE_CODE.test(code)) return null;
  const [row] = await db.select().from(challenge).where(eq(challenge.code, code));
  return row === undefined ? null : rowOf(row);
}

export async function playedCount(db: Db, challengeId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(challengeAttempt).where(eq(challengeAttempt.challengeId, challengeId));
  return row?.n ?? 0;
}

/** Активний виклик цієї вікторини цього автора. */
export async function activeForQuiz(db: Db, ownerId: string, quizId: string, now: Date): Promise<ChallengeMine | null> {
  const [row] = await db
    .select()
    .from(challenge)
    .where(and(eq(challenge.ownerId, ownerId), eq(challenge.quizId, quizId), isNull(challenge.endedAt), gt(challenge.expiresAt, now)));
  return row === undefined ? null : mineOf(row, await playedCount(db, row.id));
}

/** Активні виклики автора, найновіші першими. */
export async function myActiveChallenges(db: Db, ownerId: string, now: Date): Promise<ChallengeMine[]> {
  const rows = await db
    .select()
    .from(challenge)
    .where(and(eq(challenge.ownerId, ownerId), isNull(challenge.endedAt), gt(challenge.expiresAt, now)))
    .orderBy(desc(challenge.createdAt));
  return Promise.all(rows.map(async (row) => mineOf(row, await playedCount(db, row.id))));
}

export async function attemptOf(
  db: Db,
  challengeId: string,
  userId: string,
): Promise<{ gameId: string; nickname: string; startedAt: Date } | null> {
  const [row] = await db
    .select({ gameId: challengeAttempt.gameId, nickname: challengeAttempt.nickname, startedAt: challengeAttempt.startedAt })
    .from(challengeAttempt)
    .where(and(eq(challengeAttempt.challengeId, challengeId), eq(challengeAttempt.userId, userId)));
  return row ?? null;
}

/**
 * Одна спроба на акаунт: вставка з новим id гри; конфлікт ключа (друга спроба чи паралельний запит) — повертає наявну.
 * Ключ у базі, тож паралельні виклики теж дають одну спробу.
 */
export async function claimAttempt(
  db: Db,
  challengeId: string,
  userId: string,
  nickname: string,
  now: Date,
): Promise<{ gameId: string; fresh: boolean }> {
  const gameId = crypto.randomUUID();
  const inserted = await db
    .insert(challengeAttempt)
    .values({ challengeId, userId, gameId, nickname, startedAt: now })
    .onConflictDoNothing({ target: [challengeAttempt.challengeId, challengeAttempt.userId] })
    .returning({ gameId: challengeAttempt.gameId });
  if (inserted.length > 0) return { gameId, fresh: true };
  const existing = await attemptOf(db, challengeId, userId);
  if (existing === null) throw new Error('challenge attempt vanished');
  return { gameId: existing.gameId, fresh: false };
}

/** Виклик, до якого належить гра (спроба за id гри). */
export async function attemptByGame(db: Db, gameId: string): Promise<ChallengeRow | null> {
  const [row] = await db
    .select({ challenge })
    .from(challengeAttempt)
    .innerJoin(challenge, eq(challenge.id, challengeAttempt.challengeId))
    .where(eq(challengeAttempt.gameId, gameId));
  return row === undefined ? null : rowOf(row.challenge);
}

/** Таблиця: бали спадно, за рівних — завершені вище, далі час зростанням, початок зростанням; місця підряд 1…n. */
export async function challengeResults(db: Db, source: ChallengeRow, viewerId: string): Promise<ChallengeResultRow[]> {
  const rows = await db
    .select({
      userId: challengeAttempt.userId,
      attemptNick: challengeAttempt.nickname,
      startedAt: challengeAttempt.startedAt,
      status: game.status,
      finishedAt: game.finishedAt,
      nickname: participant.nickname,
      score: participant.score,
      totalTimeMs: participant.totalTimeMs,
    })
    .from(challengeAttempt)
    .leftJoin(game, eq(game.id, challengeAttempt.gameId))
    .leftJoin(
      participant,
      and(eq(participant.gameId, challengeAttempt.gameId), eq(participant.userId, challengeAttempt.userId), eq(participant.isTeam, false)),
    )
    .where(eq(challengeAttempt.challengeId, source.id))
    .orderBy(asc(challengeAttempt.startedAt));
  const sorted = rows
    .map((row) => ({
      row,
      score: row.score ?? 0,
      timeMs: row.totalTimeMs ?? 0,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.row.status === 'finished') - Number(a.row.status === 'finished') ||
        a.timeMs - b.timeMs ||
        a.row.startedAt.getTime() - b.row.startedAt.getTime(),
    );
  return sorted.map(({ row, score, timeMs }, i) => ({
    place: i + 1,
    nickname: row.nickname ?? row.attemptNick,
    score,
    timeMs,
    at: (row.finishedAt ?? row.startedAt).toISOString(),
    done: row.status === 'finished',
    author: row.userId === source.ownerId,
    me: row.userId === viewerId,
  }));
}
