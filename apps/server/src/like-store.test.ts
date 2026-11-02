import { randomUUID } from 'node:crypto';
import { bool, makeQuiz, single, text, withId } from '@quiz/engine/testing';
import type { Quiz } from '@quiz/shared';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from './db/client';
import { quiz, user, userLike } from './db/schema';
import { likeTotals, quizLikes, roomLikes, saveLike, type LikeChange } from './like-store';
import { createQuiz, deleteQuiz, updateQuiz } from './quizzes';
import { createTestDb } from './testing/test-db';

const A = 'like-author';
const O = 'like-olia';
const P = 'like-petro';

let db: Db;
let quizId: string;
const g1 = randomUUID();
const g2 = randomUUID();

const full = (): Quiz => ({ ...makeQuiz([single, withId(bool, 'q2')]), spares: [withId(text, 's1')] });
const withoutQ2 = (): Quiz => ({ ...makeQuiz([single]), spares: [withId(text, 's1')] });

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.delete(userLike);
  await db.delete(quiz);
  for (const id of [A, O, P]) await db.insert(user).values({ id, name: `Гравець ${id}`, email: `${id}@example.com` }).onConflictDoNothing();
  quizId = await createQuiz(db, A, full());
});

const like = (change: Partial<LikeChange> & Pick<LikeChange, 'userId' | 'kind'>) =>
  saveLike(db, { liked: true, gameId: g1, quizId, ...change });

const rows = () => db.select().from(userLike);

describe('saveLike', () => {
  it('один лайк запитання від людини, зарахований власникові вікторини', async () => {
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ userId: O, kind: 'question', targetUserId: A, quizId, questionId: 'q1', gameId: g1, hidden: false });
  });

  it('лайк запитання з іншої гри — той самий лайк; liked: false знімає його', async () => {
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    await like({ userId: O, kind: 'question', questionId: 'q1', gameId: g2 });
    expect(await rows()).toHaveLength(1);
    await like({ userId: O, kind: 'question', questionId: 'q1', gameId: g2, liked: false });
    expect(await rows()).toHaveLength(0);
  });

  it('запасне видно, запитання не з вікторини — приховано', async () => {
    await like({ userId: O, kind: 'question', questionId: 's1' });
    await like({ userId: O, kind: 'question', questionId: 'gone' });
    const all = await rows();
    expect(all.find((r) => r.questionId === 's1')?.hidden).toBe(false);
    expect(all.find((r) => r.questionId === 'gone')?.hidden).toBe(true);
  });

  it('себе й своє не лайкнути', async () => {
    await like({ userId: A, kind: 'quiz' });
    await like({ userId: A, kind: 'question', questionId: 'q1' });
    await like({ userId: O, kind: 'player', targetUserId: O });
    expect(await rows()).toHaveLength(0);
  });

  it('ведучий — за кожну гру; гравці однієї гри — кожен окремо', async () => {
    await like({ userId: O, kind: 'host', targetUserId: A, gameId: g1 });
    await like({ userId: O, kind: 'host', targetUserId: A, gameId: g2 });
    await like({ userId: O, kind: 'host', targetUserId: A, gameId: g2 });
    expect(await rows()).toHaveLength(2);
    await like({ userId: O, kind: 'player', targetUserId: P });
    await like({ userId: O, kind: 'player', targetUserId: A });
    await like({ userId: O, kind: 'player', targetUserId: A });
    expect((await rows()).filter((r) => r.kind === 'player')).toHaveLength(2);
    await like({ userId: O, kind: 'host', targetUserId: A, gameId: g2, liked: false });
    await like({ userId: O, kind: 'player', targetUserId: A, liked: false });
    const left = await rows();
    expect(left.map((r) => `${r.kind}:${r.targetUserId}:${r.gameId}`).sort()).toEqual([`host:${A}:${g1}`, `player:${P}:${g1}`].sort());
  });

  it('видалена вікторина — лайки запитання й вікторини не пишуться', async () => {
    await deleteQuiz(db, A, quizId);
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    await like({ userId: O, kind: 'quiz' });
    await like({ userId: O, kind: 'quiz', quizId: null });
    expect(await rows()).toHaveLength(0);
  });

  it('видалення акаунта забирає його лайки', async () => {
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    await like({ userId: P, kind: 'player', targetUserId: O });
    await like({ userId: P, kind: 'quiz' });
    await db.delete(user).where(eq(user.id, O));
    const left = await rows();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ userId: P, kind: 'quiz' });
  });
});

describe('saveLike: транзакція, зниклі цілі, видалена вікторина, gameId', () => {
  it('пише в одній транзакції (вікторину читає під FOR SHARE)', async () => {
    const spy = vi.spyOn(db, 'transaction');
    try {
      await like({ userId: O, kind: 'question', questionId: 'q1' });
      await like({ userId: O, kind: 'host', targetUserId: A });
      await like({ userId: O, kind: 'host', targetUserId: A, liked: false });
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      spy.mockRestore();
    }
    expect(await rows()).toHaveLength(1);
  });

  it('лайк і збереження вікторини разом — hidden відповідає вікторині, що лишилась', async () => {
    await Promise.all([like({ userId: O, kind: 'question', questionId: 'q2' }), updateQuiz(db, A, quizId, withoutQ2())]);
    expect((await rows()).find((r) => r.questionId === 'q2')?.hidden).toBe(true);
    await Promise.all([updateQuiz(db, A, quizId, full()), like({ userId: P, kind: 'question', questionId: 'q2' })]);
    expect((await rows()).filter((r) => r.questionId === 'q2').map((r) => r.hidden)).toEqual([false, false]);
  });

  it('ціль чи лайкач без акаунта — нічого, без помилки', async () => {
    await expect(like({ userId: O, kind: 'host', targetUserId: 'gone-account' })).resolves.toBeUndefined();
    await expect(like({ userId: O, kind: 'player', targetUserId: 'gone-account' })).resolves.toBeUndefined();
    await expect(like({ userId: 'gone-account', kind: 'quiz' })).resolves.toBeUndefined();
    await expect(like({ userId: 'gone-account', kind: 'player', targetUserId: P })).resolves.toBeUndefined();
    expect(await rows()).toHaveLength(0);
  });

  it('вікторину видалено — liked: false усе ще знімає прихований лайк', async () => {
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    await like({ userId: O, kind: 'quiz' });
    await like({ userId: P, kind: 'quiz' });
    await deleteQuiz(db, A, quizId);
    expect((await rows()).every((r) => r.hidden)).toBe(true);
    await like({ userId: O, kind: 'question', questionId: 'q1', liked: false });
    await like({ userId: O, kind: 'quiz', liked: false });
    const left = await rows();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ userId: P, kind: 'quiz', hidden: true });
  });

  it('gameId не uuid — нічого для будь-якого виду, без помилки', async () => {
    await expect(like({ userId: O, kind: 'question', questionId: 'q1', gameId: 'room-1' })).resolves.toBeUndefined();
    await expect(like({ userId: O, kind: 'quiz', gameId: 'room-1' })).resolves.toBeUndefined();
    await expect(like({ userId: O, kind: 'host', targetUserId: A, gameId: 'room-1' })).resolves.toBeUndefined();
    await expect(like({ userId: O, kind: 'player', targetUserId: P, gameId: 'room-1' })).resolves.toBeUndefined();
    expect(await rows()).toHaveLength(0);
  });
});

describe('likeTotals, quizLikes, hidden', () => {
  beforeEach(async () => {
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    await like({ userId: P, kind: 'question', questionId: 'q2' });
    await like({ userId: O, kind: 'quiz' });
    await like({ userId: O, kind: 'host', targetUserId: A });
  });

  it('підсумки за ролями', async () => {
    expect(await likeTotals(db, A)).toEqual({ author: 3, host: 1, player: 0 });
    await like({ userId: P, kind: 'player', targetUserId: O });
    expect(await likeTotals(db, O)).toEqual({ author: 0, host: 0, player: 1 });
    expect(await likeTotals(db, P)).toEqual({ author: 0, host: 0, player: 0 });
  });

  it('лічильники редактора лише власникові', async () => {
    expect(await quizLikes(db, A, quizId)).toEqual({ quiz: 1, questions: { q1: 1, q2: 1 } });
    expect(await quizLikes(db, P, quizId)).toBeNull();
    expect(await quizLikes(db, A, 'not-a-uuid')).toBeNull();
  });

  it('видалене запитання приховано, повернене — знову видно; видалена вікторина — нуль, рядки лишаються', async () => {
    expect(await updateQuiz(db, A, quizId, withoutQ2())).toBe(true);
    expect((await likeTotals(db, A)).author).toBe(2);
    expect(await quizLikes(db, A, quizId)).toEqual({ quiz: 1, questions: { q1: 1 } });

    expect(await updateQuiz(db, A, quizId, full())).toBe(true);
    expect((await likeTotals(db, A)).author).toBe(3);
    expect(await quizLikes(db, A, quizId)).toEqual({ quiz: 1, questions: { q1: 1, q2: 1 } });

    expect(await deleteQuiz(db, A, quizId)).toBe(true);
    expect(await likeTotals(db, A)).toEqual({ author: 0, host: 1, player: 0 });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(userLike).where(sql`kind in ('question', 'quiz')`);
    expect(n).toBe(3);
  });

  it('лайк запитання, видаленого посеред гри, пишеться прихованим і не рахується', async () => {
    await updateQuiz(db, A, quizId, withoutQ2());
    await like({ userId: O, kind: 'question', questionId: 'q2' });
    expect((await rows()).find((r) => r.userId === O && r.questionId === 'q2')?.hidden).toBe(true);
    expect((await likeTotals(db, A)).author).toBe(2);
    await updateQuiz(db, A, quizId, full());
    expect((await likeTotals(db, A)).author).toBe(4);
    expect(await quizLikes(db, A, quizId)).toEqual({ quiz: 1, questions: { q1: 1, q2: 2 } });
  });

  it('чужа вікторина не змінює чужих лайків', async () => {
    expect(await updateQuiz(db, P, quizId, withoutQ2())).toBe(false);
    expect(await deleteQuiz(db, P, quizId)).toBe(false);
    expect((await likeTotals(db, A)).author).toBe(3);
  });
});

describe('roomLikes', () => {
  it('власник вікторини й ключі кожного акаунта в цій грі', async () => {
    await like({ userId: O, kind: 'question', questionId: 'q1', gameId: g2 });
    await like({ userId: O, kind: 'quiz', gameId: g2 });
    await like({ userId: O, kind: 'host', targetUserId: A, gameId: g1 });
    await like({ userId: O, kind: 'player', targetUserId: P, gameId: g1 });
    await like({ userId: O, kind: 'player', targetUserId: A, gameId: g2 });
    await like({ userId: P, kind: 'question', questionId: 'q2' });
    await like({ userId: P, kind: 'host', targetUserId: A, gameId: g2 });

    const loaded = await roomLikes(db, { quizId, gameId: g1, userIds: [O, P, 'nobody'] });
    expect(loaded.author).toBe(A);
    expect(loaded.mine.get(O)).toEqual(new Set(['q:q1', 'quiz', 'host', `p:${P}`]));
    expect(loaded.mine.get(P)).toEqual(new Set(['q:q2']));
    expect(loaded.mine.get('nobody')).toEqual(new Set());
  });

  it('приховані лайки запитань теж мої (серце заповнене)', async () => {
    await like({ userId: O, kind: 'question', questionId: 'gone' });
    const loaded = await roomLikes(db, { quizId, gameId: g1, userIds: [O] });
    expect(loaded.mine.get(O)).toEqual(new Set(['q:gone']));
  });

  it('вікторини немає — автор null', async () => {
    await deleteQuiz(db, A, quizId);
    const loaded = await roomLikes(db, { quizId, gameId: g1, userIds: [O] });
    expect(loaded.author).toBeNull();
    expect(loaded.mine.get(O)).toEqual(new Set());
  });

  it('без акаунтів — порожньо', async () => {
    const loaded = await roomLikes(db, { quizId, gameId: g1, userIds: [] });
    expect(loaded.author).toBe(A);
    expect(loaded.mine.size).toBe(0);
  });
});
