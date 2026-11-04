import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bool, makeQuiz, single, text, withId } from '@quiz/engine/testing';
import type { Quiz } from '@quiz/shared';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIGRATIONS, type Db } from './db/client';
import { profile, quiz, user, userLike } from './db/schema';
import { givenLikes, likeTotals, quizLikes, receivedLikes, roomLikes, saveLike, type LikeChange } from './like-store';
import { createQuiz, deleteQuiz, updateQuiz } from './quizzes';
import { createTestDb, createTestDbUpTo } from './testing/test-db';

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

describe('лайк події стрічки (event)', () => {
  const event = (change: Partial<LikeChange>) =>
    saveLike(db, { userId: O, kind: 'event', eventKey: 'level:p:3', gameId: null, targetUserId: P, quizId: null, liked: true, ...change });

  it('один рядок на (людина, подія) з game_id null; liked: false знімає', async () => {
    await event({});
    await event({});
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ userId: O, kind: 'event', eventKey: 'level:p:3', gameId: null, targetUserId: P, quizId: null, questionId: null, hidden: false });
    await event({ liked: false });
    expect(await rows()).toHaveLength(0);
  });

  it('різні події — різні рядки; gameId-uuid зберігається', async () => {
    await event({ eventKey: 'prize:x', gameId: g1 });
    await event({ eventKey: 'achievement:p:first' });
    const all = await rows();
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.eventKey === 'prize:x')?.gameId).toBe(g1);
  });

  it('liked: false знімає лише свою подію (ключ — event_key), а не лайк player тієї ж гри', async () => {
    await event({ eventKey: 'prize:x', gameId: g1 });
    await event({ eventKey: 'prize:y', gameId: g1 });
    await like({ userId: O, kind: 'player', targetUserId: P, gameId: g1 });
    await event({ eventKey: 'prize:x', gameId: g1, liked: false });
    expect((await rows()).map((r) => r.eventKey ?? r.kind).sort()).toEqual(['player', 'prize:y']);
  });

  it('себе — ні; без eventKey — ні; gameId не uuid — ні', async () => {
    await event({ targetUserId: O });
    await event({ eventKey: undefined });
    await event({ gameId: 'not-a-uuid' });
    expect(await rows()).toHaveLength(0);
  });

  it('likeTotals зараховує event у player', async () => {
    await like({ userId: O, kind: 'player', targetUserId: P, gameId: g1 });
    await event({});
    expect(await likeTotals(db, P)).toEqual({ author: 0, host: 0, player: 2 });
  });

  it('roomLikes і quizLikes рядка event не бачать', async () => {
    await event({ gameId: g1, quizId });
    const loaded = await roomLikes(db, { quizId, gameId: g1, userIds: [O] });
    expect(loaded.mine.get(O)).toEqual(new Set());
    expect(await quizLikes(db, A, quizId)).toEqual({ quiz: 0, questions: {} });
  });
});

describe('міграція 0024_feed', () => {
  it('позначає наявні профілі переглянутими одним UPDATE', () => {
    const text = readFileSync(join(MIGRATIONS, '0024_feed.sql'), 'utf8');
    expect(text).toContain('UPDATE "profile" SET "feed_seen_at" = now();');
  });

  it('наявний профіль дістає feed_seen_at, наявний лайк лишається; новий профіль — null', async () => {
    const { db: old, migrateRest } = await createTestDbUpTo('0023_likes');
    await old.insert(user).values([
      { id: 'u-old', name: 'Old', email: 'old@example.com' },
      { id: 'u-new', name: 'New', email: 'new@example.com' },
    ]);
    await old.execute(sql`insert into profile (user_id, nickname, nickname_key) values ('u-old', 'Old', 'old')`);
    await old.execute(
      sql`insert into user_like (user_id, kind, target_user_id, game_id, created_at) values ('u-old', 'player', 'u-new', ${g1}, now())`,
    );
    await migrateRest();
    await old.insert(profile).values({ userId: 'u-new', nickname: 'New', nicknameKey: 'new' });
    const all = await old.select().from(profile);
    const oldRow = all.find((r) => r.userId === 'u-old')!;
    const newRow = all.find((r) => r.userId === 'u-new')!;
    expect(oldRow.feedSeenAt).toBeInstanceOf(Date);
    expect(oldRow.feedLevel).toBeNull();
    expect(newRow.feedSeenAt).toBeNull();
    expect(newRow.feedLevel).toBeNull();
    expect(await old.select().from(userLike)).toMatchObject([{ userId: 'u-old', kind: 'player', gameId: g1, eventKey: null }]);
  });
});

describe('givenLikes, receivedLikes (24b)', () => {
  const textOf = (id: string) => [...full().rounds.flatMap((r) => ('questions' in r ? r.questions : [])), ...(full().spares ?? [])].find((q) => q.id === id)!.text;
  const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n));

  beforeEach(async () => {
    await db.delete(profile);
    await db.insert(profile).values({ userId: A, nickname: 'Автор', nicknameKey: 'avtor' });
  });

  it('given: рядок на вікторину, мої вподобання вікторині й запитанням, тексти в порядку вікторини', async () => {
    await like({ userId: O, kind: 'question', questionId: 'q2' });
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    await like({ userId: O, kind: 'quiz' });
    const page = await givenLikes(db, O, 0);
    expect(page.next).toBeNull();
    expect(page.items).toEqual([
      {
        quizId,
        quiz: { title: expect.any(String), author: { id: A, nickname: 'Автор', avatar: null } },
        count: 3,
        lastAt: expect.any(String),
        quizLiked: true,
        questions: [textOf('q1'), textOf('q2')],
        gone: 0,
      },
    ]);
  });

  it('given: автор без профілю — нік і аватар null', async () => {
    await db.delete(profile);
    await like({ userId: O, kind: 'quiz' });
    expect((await givenLikes(db, O, 0)).items[0]!.quiz!.author).toEqual({ id: A, nickname: null, avatar: null });
  });

  it('given: чужі вподобання й host/player/event не входять', async () => {
    await like({ userId: P, kind: 'question', questionId: 'q1' });
    await like({ userId: O, kind: 'host', targetUserId: A });
    await like({ userId: O, kind: 'player', targetUserId: P });
    await saveLike(db, { userId: O, kind: 'event', eventKey: 'level:p:3', gameId: null, targetUserId: P, quizId: null, liked: true });
    expect((await givenLikes(db, O, 0)).items).toEqual([]);
  });

  it('given: новіші вище', async () => {
    const second = await createQuiz(db, A, { ...full(), title: 'Друга' });
    await like({ userId: O, kind: 'quiz' });
    await like({ userId: O, kind: 'quiz', quizId: second });
    await db.update(userLike).set({ createdAt: at(1) }).where(eq(userLike.quizId, second));
    await db.update(userLike).set({ createdAt: at(2) }).where(eq(userLike.quizId, quizId));
    expect((await givenLikes(db, O, 0)).items.map((i) => i.quizId)).toEqual([quizId, second]);
    await db.update(userLike).set({ createdAt: at(3) }).where(eq(userLike.quizId, second));
    expect((await givenLikes(db, O, 0)).items.map((i) => i.quizId)).toEqual([second, quizId]);
  });

  it('given: removed question — без тексту й лічильника, gone = 1', async () => {
    await like({ userId: O, kind: 'question', questionId: 'q2' });
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    await updateQuiz(db, A, quizId, withoutQ2());
    const [item] = (await givenLikes(db, O, 0)).items;
    expect(item).toMatchObject({ count: 1, quizLiked: false, questions: [textOf('q1')], gone: 1 });
  });

  it('given: усі мої вподобання приховані, вікторина є — рядка немає', async () => {
    await like({ userId: O, kind: 'question', questionId: 'q2' });
    await updateQuiz(db, A, quizId, withoutQ2());
    expect((await givenLikes(db, O, 0)).items).toEqual([]);
  });

  it('given: deleted quiz — quiz null, count 0, questions [], gone 0', async () => {
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    await like({ userId: O, kind: 'quiz' });
    await deleteQuiz(db, A, quizId);
    expect((await givenLikes(db, O, 0)).items).toEqual([{ quizId, quiz: null, count: 0, lastAt: expect.any(String), quizLiked: false, questions: [], gone: 0 }]);
  });

  it('received: total, people, top-3 з лічильником, лише мої вікторини', async () => {
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    await like({ userId: O, kind: 'question', questionId: 'q2' });
    await like({ userId: O, kind: 'quiz' });
    await like({ userId: P, kind: 'question', questionId: 'q1' });
    const other = await createQuiz(db, O, full());
    await saveLike(db, { userId: P, kind: 'quiz', liked: true, gameId: g1, quizId: other });
    const page = await receivedLikes(db, A, 0);
    expect(page).toEqual({
      items: [{ quizId, title: expect.any(String), total: 4, people: 2, top: [{ text: textOf('q1'), count: 2 }, { text: textOf('q2'), count: 1 }] }],
      next: null,
    });
    expect((await receivedLikes(db, P, 0)).items).toEqual([]);
  });

  it('received: top не більше трьох', async () => {
    await updateQuiz(db, A, quizId, { ...full(), spares: [withId(text, 's1'), withId(text, 's2')] });
    for (const id of ['q1', 'q2', 's1', 's2']) await like({ userId: O, kind: 'question', questionId: id });
    await like({ userId: P, kind: 'question', questionId: 's2' });
    const [item] = (await receivedLikes(db, A, 0)).items;
    expect(item!.top).toHaveLength(3);
    expect(item!.top[0]).toEqual({ text: text.text, count: 2 });
  });

  it('received: removed question не рахується й не в топі; deleted quiz зникає', async () => {
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    await like({ userId: O, kind: 'question', questionId: 'q2' });
    await updateQuiz(db, A, quizId, withoutQ2());
    const [item] = (await receivedLikes(db, A, 0)).items;
    expect(item).toMatchObject({ total: 1, people: 1, top: [{ text: textOf('q1'), count: 1 }] });
    await deleteQuiz(db, A, quizId);
    expect((await receivedLikes(db, A, 0)).items).toEqual([]);
  });

  it('received: більше вподобань — вище; рівно — за назвою', async () => {
    const b = await createQuiz(db, A, { ...full(), title: 'Б' });
    const a = await createQuiz(db, A, { ...full(), title: 'А' });
    const c = await createQuiz(db, A, { ...full(), title: 'В' });
    await saveLike(db, { userId: O, kind: 'quiz', liked: true, gameId: g1, quizId: b });
    await saveLike(db, { userId: O, kind: 'quiz', liked: true, gameId: g1, quizId: a });
    await saveLike(db, { userId: O, kind: 'quiz', liked: true, gameId: g1, quizId: c });
    await saveLike(db, { userId: P, kind: 'quiz', liked: true, gameId: g1, quizId: c });
    expect((await receivedLikes(db, A, 0)).items.map((i) => i.quizId)).toEqual([c, a, b]);
  });

  it('pages: 20 → next null; 21 → next 20, друга сторінка — один інший рядок', async () => {
    const ids = [quizId];
    for (let i = 1; i < 21; i++) ids.push(await createQuiz(db, A, { ...full(), title: `Вікторина ${i}` }));
    for (const id of ids.slice(0, 20)) await saveLike(db, { userId: O, kind: 'quiz', liked: true, gameId: g1, quizId: id });
    expect((await givenLikes(db, O, 0)).items).toHaveLength(20);
    expect((await givenLikes(db, O, 0)).next).toBeNull();
    expect((await receivedLikes(db, A, 0)).next).toBeNull();
    await saveLike(db, { userId: O, kind: 'quiz', liked: true, gameId: g1, quizId: ids[20]! });
    const first = await givenLikes(db, O, 0);
    const second = await givenLikes(db, O, 20);
    expect(first.items).toHaveLength(20);
    expect(first.next).toBe(20);
    expect(second.items).toHaveLength(1);
    expect(second.next).toBeNull();
    expect(new Set([...first.items, ...second.items].map((i) => i.quizId)).size).toBe(21);
    const r1 = await receivedLikes(db, A, 0);
    const r2 = await receivedLikes(db, A, 20);
    expect(r1.next).toBe(20);
    expect(r2.items).toHaveLength(1);
    expect(new Set([...r1.items, ...r2.items].map((i) => i.quizId)).size).toBe(21);
  });
});
