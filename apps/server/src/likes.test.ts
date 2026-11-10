import { afterEach, describe, expect, it, vi } from 'vitest';
import { bool, classicRound, makeRoundsQuiz, single, truthRound, withId } from '@quiz/engine/testing';
import type { GameView, PlayerView, Quiz } from '@quiz/shared';
import { user, userLike } from './db/schema';
import * as store from './like-store';
import { attachLikes } from './likes';
import { createQuiz } from './quizzes';
import { RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';

vi.mock('./like-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('./like-store')>();
  return { ...original, roomLikes: vi.fn(original.roomLikes), saveLike: vi.fn(original.saveLike) };
});

afterEach(() => {
  vi.mocked(store.roomLikes).mockClear();
  vi.mocked(store.saveLike).mockClear();
});

/** Лайки зрізу гравця (у зрізах сцени й пульта поля немає). */
const likesOf = (view: GameView | null) => (view as PlayerView | null)?.likes;
const HOST = { role: 'host', playerId: null } as const;

const likeQuiz = (): Quiz => ({
  ...makeRoundsQuiz([classicRound('r1', [withId(single, 'q1'), withId(single, 'q2')])], { leaderboard: 'end' }),
  spares: [withId(bool, 's1')],
});

async function world(quiz: Quiz = likeQuiz()) {
  const db = await createTestDb();
  await db.insert(user).values([
    { id: 'a', name: 'Автор', email: 'a@example.com' },
    { id: 'o', name: 'Оля', email: 'o@example.com' },
    { id: 'p', name: 'Петро', email: 'p@example.com' },
  ]);
  const quizId = await createQuiz(db, 'a', quiz);
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const likes = attachLikes(manager, db, (error) => errors.push(error));
  const room = manager.create(quiz, 'a', quizId);
  manager.connect(room, HOST);
  const enter = (nickname: string, userId: string | null, into: Room = room, using: RoomManager = manager) => {
    const joined = using.join(into.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    using.connect(into, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const toReveal = (into: Room = room, using: RoomManager = manager) => {
    if (into.state.phase === 'lobby') expect(using.host(into, { type: 'start' })).toEqual({ ok: true });
    while (into.state.phase !== 'reveal') expect(using.host(into, { type: into.state.phase === 'question' ? 'lock' : 'next' })).toEqual({ ok: true });
  };
  const toFinished = () => {
    if (room.state.phase === 'lobby') expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    while (room.state.phase !== 'finished') expect(manager.host(room, { type: room.state.phase === 'question' ? 'lock' : 'next' })).toEqual({ ok: true });
  };
  const rows = () => db.select().from(userLike);
  return { db, quiz, quizId, scheduler, manager, likes, errors, room, enter, toReveal, toFinished, rows };
}

describe('likes of accounts in the room', () => {
  it('a truth question cannot be liked', async () => {
    const w = await world(makeRoundsQuiz([truthRound('r1'), classicRound('r2', [withId(single, 'q1')])], { leaderboard: 'end' }));
    const olya = w.enter('Оля', 'o');
    const petro = w.enter('Петро', 'p');
    await w.likes.idle();
    expect(w.manager.truth(w.room, petro, 'Я бачив північне сяйво')).toEqual({ ok: true });
    w.toReveal();
    expect(w.room.state.plays[w.room.state.questionIndex].question.id).toBe('truth-0');
    await w.likes.idle();
    // серця на запитанні-факті немає
    expect(likesOf(w.manager.view(w.room, { role: 'player', playerId: olya }))).toBeUndefined();
    expect(w.manager.like(w.room, olya, { target: 'question', liked: true })).toEqual({ ok: false, error: 'not_allowed' });
    await w.likes.idle();
    expect(await w.rows()).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  it('a change reads each account once and gives Оля her heart', async () => {
    const w = await world();
    const olya = w.enter('Оля', 'o');
    await w.likes.idle();
    w.enter('Петро', 'p');
    w.enter('Гість', null);
    await w.likes.idle();
    expect(w.errors).toEqual([]);
    expect(vi.mocked(store.roomLikes).mock.calls.flatMap(([, input]) => input.userIds)).toEqual(['o', 'p']);
    expect(w.room.likes.author).toBe('a');
    w.toReveal();
    await w.likes.idle();
    expect(likesOf(w.manager.view(w.room, { role: 'player', playerId: olya }))).toEqual({ question: false });
    expect(vi.mocked(store.roomLikes).mock.calls).toHaveLength(2);
  });

  it('like then unlike leaves no row; writes keep their order', async () => {
    const w = await world();
    const olya = w.enter('Оля', 'o');
    await w.likes.idle();
    w.toReveal();
    expect(w.manager.like(w.room, olya, { target: 'question', liked: true })).toEqual({ ok: true });
    expect(w.manager.like(w.room, olya, { target: 'question', liked: false })).toEqual({ ok: true });
    await w.likes.idle();
    expect(await w.rows()).toEqual([]);
    expect(vi.mocked(store.saveLike).mock.calls.map(([, change]) => change.liked)).toEqual([true, false]);
    expect(w.manager.like(w.room, olya, { target: 'question', liked: true })).toEqual({ ok: true });
    await w.likes.idle();
    expect(await w.rows()).toMatchObject([{ userId: 'o', kind: 'question', questionId: 'q1', targetUserId: 'a', gameId: w.room.id, hidden: false }]);
    expect(w.errors).toEqual([]);
  });

  it('a failed write goes to onError and the heart is re-read from the database', async () => {
    const w = await world();
    const olya = w.enter('Оля', 'o');
    await w.likes.idle();
    w.toReveal();
    vi.mocked(store.saveLike).mockRejectedValueOnce(new Error('db down'));
    expect(w.manager.like(w.room, olya, { target: 'question', liked: true })).toEqual({ ok: true });
    expect(likesOf(w.manager.view(w.room, { role: 'player', playerId: olya }))).toEqual({ question: true });
    await w.likes.idle();
    expect(w.errors).toHaveLength(1);
    expect(await w.rows()).toEqual([]);
    expect(likesOf(w.manager.view(w.room, { role: 'player', playerId: olya }))).toEqual({ question: false });
  });

  it('a failed write followed by a later change keeps the later state', async () => {
    const w = await world();
    const olya = w.enter('Оля', 'o');
    await w.likes.idle();
    w.toReveal();
    vi.mocked(store.saveLike).mockRejectedValueOnce(new Error('db down'));
    w.manager.like(w.room, olya, { target: 'question', liked: true });
    w.manager.like(w.room, olya, { target: 'question', liked: false });
    w.manager.like(w.room, olya, { target: 'question', liked: true });
    await w.likes.idle();
    expect(w.errors).toHaveLength(1);
    expect(await w.rows()).toHaveLength(1);
    expect(likesOf(w.manager.view(w.room, { role: 'player', playerId: olya }))).toEqual({ question: true });
  });

  it('a restored room has no heart until read, then shows the like and a tap removes it', async () => {
    const w = await world();
    const olya = w.enter('Оля', 'o');
    await w.likes.idle();
    w.toReveal();
    w.manager.like(w.room, olya, { target: 'question', liked: true });
    await w.likes.idle();
    const saved = JSON.parse(JSON.stringify(w.manager.snapshot(w.room)));
    w.manager.evict(w.room);
    const next = new RoomManager(new FakeScheduler(), () => 0.5);
    const errors: unknown[] = [];
    const likes = attachLikes(next, w.db, (error) => errors.push(error));
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = vi.mocked(store.roomLikes).getMockImplementation()!;
    vi.mocked(store.roomLikes).mockImplementationOnce(async (...args) => {
      await gate;
      return original(...args);
    });
    const room = next.restore(saved)!;
    expect(room.state.phase).toBe('reveal');
    expect(likesOf(next.view(room, { role: 'player', playerId: olya }))).toBeUndefined();
    expect(next.like(room, olya, { target: 'question', liked: false })).toEqual({ ok: false, error: 'like_unavailable' });
    release();
    await likes.idle();
    expect(errors).toEqual([]);
    expect(likesOf(next.view(room, { role: 'player', playerId: olya }))).toEqual({ question: true });
    expect(next.like(room, olya, { target: 'question', liked: false })).toEqual({ ok: true });
    await likes.idle();
    expect(await w.rows()).toEqual([]);
  });

  it('a failed write for one key is re-read even when a later write for another key of the account succeeds', async () => {
    const w = await world();
    const olya = w.enter('Оля', 'o');
    await w.likes.idle();
    w.toFinished();
    vi.mocked(store.saveLike).mockRejectedValueOnce(new Error('db down'));
    expect(w.manager.like(w.room, olya, { target: 'quiz', liked: true })).toEqual({ ok: true });
    expect(w.manager.like(w.room, olya, { target: 'host', liked: true })).toEqual({ ok: true });
    await w.likes.idle();
    expect(w.errors).toHaveLength(1);
    expect(await w.rows()).toMatchObject([{ kind: 'host' }]);
    expect(likesOf(w.manager.view(w.room, { role: 'player', playerId: olya }))).toMatchObject({ quiz: false, host: true });
  });

  it('a tap during the re-read after a failure is not overwritten by that read', async () => {
    const w = await world();
    const olya = w.enter('Оля', 'o');
    await w.likes.idle();
    w.toFinished();
    vi.mocked(store.saveLike).mockRejectedValueOnce(new Error('db down'));
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = vi.mocked(store.roomLikes).getMockImplementation()!;
    vi.mocked(store.roomLikes).mockImplementationOnce(async (...args) => {
      const load = await original(...args);
      await gate;
      return load;
    });
    const reads = vi.mocked(store.roomLikes).mock.calls.length;
    expect(w.manager.like(w.room, olya, { target: 'quiz', liked: true })).toEqual({ ok: true });
    await vi.waitFor(() => expect(vi.mocked(store.roomLikes).mock.calls.length).toBe(reads + 1));
    expect(w.manager.like(w.room, olya, { target: 'host', liked: true })).toEqual({ ok: true });
    release();
    await w.likes.idle();
    expect(w.errors).toHaveLength(1);
    expect(await w.rows()).toMatchObject([{ kind: 'host' }]);
    expect(likesOf(w.manager.view(w.room, { role: 'player', playerId: olya }))).toMatchObject({ quiz: false, host: true });
    expect(w.room.likes.mine.get('o')).toEqual(new Set(['host']));
  });

  it('a closed room does not get setLikes', async () => {
    const w = await world();
    let release: (value: Awaited<ReturnType<typeof store.roomLikes>>) => void = () => {};
    vi.mocked(store.roomLikes).mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const setLikes = vi.spyOn(w.manager, 'setLikes');
    w.enter('Оля', 'o');
    w.manager.evict(w.room);
    release({ author: 'a', mine: new Map([['o', new Set()]]) });
    await w.likes.idle();
    expect(setLikes).not.toHaveBeenCalled();
    expect(w.errors).toEqual([]);
  });

  it('a failed read is retried on the next change', async () => {
    const w = await world();
    vi.mocked(store.roomLikes).mockRejectedValueOnce(new Error('db down'));
    const olya = w.enter('Оля', 'o');
    await w.likes.idle();
    expect(w.errors).toHaveLength(1);
    expect(w.room.likes.mine.has('o')).toBe(false);
    w.toReveal();
    await w.likes.idle();
    expect(likesOf(w.manager.view(w.room, { role: 'player', playerId: olya }))).toEqual({ question: false });
  });
});
