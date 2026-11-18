import { CHALLENGE_CODE, challengeQuiz } from '@quiz/shared';
import { makeQuiz, poll, single } from '@quiz/engine/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  activeForQuiz,
  attemptByGame,
  attemptOf,
  challengeByCode,
  challengeResults,
  claimAttempt,
  createChallenge,
  isActive,
  myActiveChallenges,
  playedCount,
} from './challenges';
import type { Db } from './db/client';
import { challengeAttempt, game, participant, user } from './db/schema';
import { newCode } from './group-store';
import { ensureProfile } from './profiles';
import { createQuiz, updateQuiz } from './quizzes';
import { createTestDb } from './testing/test-db';

let db: Db;
let n = 0;
const T = new Date('2026-11-18T10:00:00.000Z');
const DAY = 86_400_000;

beforeAll(async () => {
  db = await createTestDb();
});

async function person(name: string) {
  n += 1;
  const id = `ch${n}`;
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  await ensureProfile(db, id);
  return id;
}

const soloQuiz = () => makeQuiz([single]);

async function ready(owner: string, quiz = soloQuiz()) {
  const quizId = await createQuiz(db, owner, quiz);
  const made = await createChallenge(db, owner, quizId, T);
  if (!made.ok) throw new Error(made.error);
  return { quizId, challenge: made.challenge };
}

describe('newCode', () => {
  it('gives the asked length from the alphabet and skips biased bytes', () => {
    expect(newCode(12)).toMatch(CHALLENGE_CODE);
    expect(newCode(12, (size) => new Uint8Array(size))).toBe('aaaaaaaaaaaa');
    // 255 лежить поза рівним діапазоном і пропускається, лишається 0 → 'a'.
    expect(newCode(3, () => new Uint8Array([255, 255, 0, 255, 0, 0]))).toBe('aaa');
  });
});

describe('challenge store (38a)', () => {
  it('creates a 7-day challenge with a snapshot that later quiz edits do not change', async () => {
    const owner = await person('Автор');
    const source = soloQuiz();
    const { quizId, challenge } = await ready(owner, source);
    expect(challenge.expiresAt.getTime() - challenge.createdAt.getTime()).toBe(7 * DAY);
    expect(challenge.code).toMatch(CHALLENGE_CODE);
    expect(challenge.snapshot).toEqual(challengeQuiz(source).quiz);
    expect(challenge.endedAt).toBeNull();

    await updateQuiz(db, owner, quizId, { ...source, title: 'Змінена' });
    const loaded = await challengeByCode(db, challenge.code);
    expect(loaded?.snapshot).toEqual(challengeQuiz(source).quiz);
    expect(loaded?.title).toBe(source.title);
  });

  it('finds nothing for a malformed or unknown code', async () => {
    expect(await challengeByCode(db, 'short')).toBeNull();
    expect(await challengeByCode(db, 'a'.repeat(12))).toBeNull();
  });

  it('refuses an empty or foreign quiz', async () => {
    const owner = await person('Автор');
    const stranger = await person('Чужий');
    const emptyId = await createQuiz(db, owner, makeQuiz([poll]));
    expect(await createChallenge(db, owner, emptyId, T)).toEqual({ ok: false, error: 'challenge_empty' });
    const quizId = await createQuiz(db, owner, soloQuiz());
    expect(await createChallenge(db, stranger, quizId, T)).toEqual({ ok: false, error: 'not_found' });
    expect(await createChallenge(db, owner, 'not-a-uuid', T)).toEqual({ ok: false, error: 'not_found' });
  });

  it('a new challenge ends the old one but its table stays readable', async () => {
    const owner = await person('Автор');
    const first = await ready(owner);
    const second = await createChallenge(db, owner, first.quizId, new Date(T.getTime() + 1000));
    if (!second.ok) throw new Error(second.error);
    const old = await challengeByCode(db, first.challenge.code);
    expect(old?.endedAt).not.toBeNull();
    expect(second.challenge.code).not.toBe(first.challenge.code);
    expect((await activeForQuiz(db, owner, first.quizId, T))?.code).toBe(second.challenge.code);
    expect(await challengeResults(db, old!, owner)).toEqual([]);
    expect((await myActiveChallenges(db, owner, T)).map((c) => c.code)).toEqual([second.challenge.code]);
  });

  it('active means not ended and not expired', async () => {
    const owner = await person('Автор');
    const { challenge } = await ready(owner);
    expect(isActive(challenge, new Date(T.getTime() + 6 * DAY))).toBe(true);
    expect(isActive(challenge, new Date(T.getTime() + 7 * DAY))).toBe(false);
    expect(isActive({ ...challenge, endedAt: T }, T)).toBe(false);
    expect(await activeForQuiz(db, owner, challenge.quizId!, new Date(T.getTime() + 8 * DAY))).toBeNull();
  });

  it('claims one attempt per account, even in parallel', async () => {
    const owner = await person('Автор');
    const player = await person('Гравець');
    const { challenge } = await ready(owner);
    const [a, b] = await Promise.all([
      claimAttempt(db, challenge.id, player, 'Гравець', T),
      claimAttempt(db, challenge.id, player, 'Гравець', T),
    ]);
    expect(a.gameId).toBe(b.gameId);
    expect([a.fresh, b.fresh].filter(Boolean)).toHaveLength(1);
    const again = await claimAttempt(db, challenge.id, player, 'Інший нік', T);
    expect(again).toEqual({ gameId: a.gameId, fresh: false });
    expect(await playedCount(db, challenge.id)).toBe(1);
    expect(await attemptOf(db, challenge.id, player)).toMatchObject({ gameId: a.gameId, nickname: 'Гравець' });
    expect(await attemptOf(db, challenge.id, owner)).toBeNull();
    expect((await attemptByGame(db, a.gameId))?.id).toBe(challenge.id);
    expect(await attemptByGame(db, '99999999-9999-4999-8999-999999999999')).toBeNull();
  });

  it('results sort by score, then time; only your own row is me', async () => {
    const owner = await person('Автор');
    const p1 = await person('Один');
    const p2 = await person('Два');
    const p3 = await person('Три');
    const p4 = await person('Чотири');
    const { challenge } = await ready(owner);
    const play = async (userId: string, status: 'finished' | 'running' | null, score: number, timeMs: number, minutes: number) => {
      const at = new Date(T.getTime() + minutes * 60_000);
      const claimed = await claimAttempt(db, challenge.id, userId, `нік-${userId}`, at);
      if (status === null) return claimed.gameId;
      await db.insert(game).values({
        id: claimed.gameId,
        hostId: userId,
        code: 'ABCD',
        status,
        title: 'Q',
        quizSnapshot: challenge.snapshot,
        startedAt: at,
        finishedAt: status === 'finished' ? new Date(at.getTime() + 60_000) : null,
      });
      await db.insert(participant).values({ id: crypto.randomUUID(), gameId: claimed.gameId, nickname: `гра-${userId}`, userId, score, totalTimeMs: timeMs });
      return claimed.gameId;
    };
    await play(p1, 'finished', 500, 40_000, 1);
    await play(p2, 'finished', 500, 30_000, 2);
    await play(p3, 'running', 700, 10_000, 3);
    await play(p4, null, 0, 0, 4);
    await play(owner, 'finished', 100, 5000, 5);

    const rows = await challengeResults(db, challenge, p2);
    expect(rows.map((r) => [r.place, r.score, r.timeMs, r.done])).toEqual([
      [1, 700, 10_000, false],
      [2, 500, 30_000, true],
      [3, 500, 40_000, true],
      [4, 100, 5000, true],
      [5, 0, 0, false],
    ]);
    expect(rows.filter((r) => r.me).map((r) => r.nickname)).toEqual([`гра-${p2}`]);
    expect(rows.filter((r) => r.author)).toHaveLength(1);
    expect(rows[3].author).toBe(true);
    expect(rows[4].nickname).toBe(`нік-${p4}`);
    expect(rows[0].at).toBe(new Date(T.getTime() + 3 * 60_000).toISOString());
    expect(rows[1].at).toBe(new Date(T.getTime() + 3 * 60_000).toISOString());
    expect(await db.select().from(challengeAttempt)).toBeTruthy();
  });
});
