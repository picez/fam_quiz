import { randomUUID } from 'node:crypto';
import { questionsOf } from '@quiz/shared';
import { bool, makeQuiz, single, text } from '@quiz/engine/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { adminLog, adminQuiz, adminQuizzes, adminStats, adminUser, adminUsers, kyivMidnight } from './admin-store';
import { banUser, logAction } from './bans';
import type { Db } from './db/client';
import { game, participant, prize, prizeAward, profile, quiz, user, userTitle } from './db/schema';
import { ensureProfile } from './profiles';
import { createTestDb } from './testing/test-db';

let db: Db;
const NOW = new Date('2026-11-07T10:00:00.000Z');
const at = (s: string) => new Date(s);
const none = new Set<string>();
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
});

async function person(name: string, extra: { email?: string; createdAt?: Date; verified?: boolean; lastSeen?: Date } = {}) {
  n += 1;
  const id = `as${n}`;
  await db.insert(user).values({ id, name, email: extra.email ?? `${id}@example.com`, emailVerified: extra.verified ?? false, createdAt: extra.createdAt ?? NOW });
  await db.insert(profile).values({ userId: id, nickname: name, nicknameKey: name.toLowerCase().replace(/\s/g, ''), lastSeenAt: extra.lastSeen ?? null });
  return id;
}

async function makeQuizRow(ownerId: string, title: string, updatedAt = NOW) {
  const data = makeQuiz([single, text]);
  const [row] = await db
    .insert(quiz)
    .values({ ownerId, title, description: '', settings: data.settings, rounds: data.rounds, createdAt: updatedAt, updatedAt })
    .returning();
  return row!;
}

async function makeGame(hostId: string, quizId: string | null, status: 'finished' | 'running', finishedAt: Date | null) {
  const id = randomUUID();
  await db.insert(game).values({ id, quizId, hostId, code: String(n++), status, title: 't', quizSnapshot: {}, startedAt: NOW, finishedAt });
  return id;
}

describe('kyivMidnight', () => {
  it('is local midnight in winter and summer time', () => {
    expect(kyivMidnight(at('2026-11-07T10:00:00.000Z')).toISOString()).toBe('2026-11-06T22:00:00.000Z');
    expect(kyivMidnight(at('2026-07-01T10:00:00.000Z')).toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(kyivMidnight(at('2026-11-06T22:30:00.000Z')).toISOString()).toBe('2026-11-06T22:00:00.000Z');
  });
});

describe('admin store', () => {
  it('counts users, games, quizzes and the top ten', async () => {
    db = await createTestDb();
    const own = db;
    const author = await person('Автор Статистики', { createdAt: at('2026-11-07T09:00:00.000Z'), lastSeen: new Date(NOW.getTime() - 4 * 60_000) });
    await person('Другий', { createdAt: at('2026-11-03T12:00:00.000Z'), lastSeen: new Date(NOW.getTime() - 6 * 60_000) });
    await person('Третій', { createdAt: at('2026-10-20T12:00:00.000Z') });
    await person('Четвертий', { createdAt: at('2026-09-01T12:00:00.000Z') });
    const a = (await own.insert(quiz).values({ ownerId: author, title: 'Карпати', description: '', settings: makeQuiz([single]).settings, rounds: makeQuiz([single]).rounds }).returning())[0]!;
    const b = (await own.insert(quiz).values({ ownerId: author, title: 'Дніпро', description: '', settings: makeQuiz([single]).settings, rounds: makeQuiz([single]).rounds }).returning())[0]!;
    const g = async (quizId: string, status: 'finished' | 'running', finishedAt: Date | null) =>
      own.insert(game).values({ id: randomUUID(), quizId, hostId: author, code: 'x', status, title: 't', quizSnapshot: {}, startedAt: NOW, finishedAt });
    await g(a.id, 'finished', at('2026-11-06T22:30:00.000Z'));
    await g(a.id, 'finished', at('2026-11-06T21:30:00.000Z'));
    await g(b.id, 'finished', at('2026-10-25T12:00:00.000Z'));
    await g(b.id, 'finished', at('2026-09-01T12:00:00.000Z'));
    await g(randomUUID(), 'finished', at('2026-11-07T08:00:00.000Z'));
    await g(a.id, 'running', null);

    const stats = await adminStats(own, 1, NOW);
    expect(stats.users).toEqual({ total: 4, new7: 2, new30: 3, online: 1 });
    expect(stats.games).toEqual({ live: 1, today: 2, days7: 3, days30: 4 });
    expect(stats.quizzes.total).toBe(2);
    expect(stats.topQuizzes).toEqual([
      { id: b.id, title: 'Дніпро', author: 'Автор Статистики', games: 2 },
      { id: a.id, title: 'Карпати', author: 'Автор Статистики', games: 2 },
    ]);
  });

  it('pages and searches users', async () => {
    db = await createTestDb();
    const own = db;
    {
      for (let i = 0; i < 49; i += 1) await person(`Гравець ${i}`, { createdAt: new Date(NOW.getTime() - (i + 10) * 60_000) });
      const first = await person('Оля Перша', { createdAt: NOW });
      await person('Другий', { email: 'second@example.com', createdAt: new Date(NOW.getTime() - 5 * 60_000) });
      const emails = new Set(['admin21a@example.com']);

      const p1 = await adminUsers(own, emails, { page: 1 });
      expect([p1.rows.length, p1.total, p1.pages]).toEqual([50, 51, 2]);
      expect(p1.rows[0]!.id).toBe(first);
      expect((await adminUsers(own, emails, { page: 2 })).rows.length).toBe(1);

      expect((await adminUsers(own, emails, { q: 'оля', page: 1 })).rows.map((r) => r.nickname)).toEqual(['Оля Перша']);
      expect((await adminUsers(own, emails, { q: 'second@', page: 1 })).rows.map((r) => r.nickname)).toEqual(['Другий']);
      expect((await adminUsers(own, emails, { q: '%', page: 1 })).total).toBe(51);
      expect((await adminUsers(own, emails, { q: '%%', page: 1 })).rows).toEqual([]);
      expect((await adminUsers(own, emails, { q: 'о', page: 1 })).total).toBe(51);
    }
  });

  it('builds the user row with games, quizzes, admin flag and ban', async () => {
    const adminId = await person('Адмін Ада', { email: 'Admin21a@Example.com', verified: true });
    const unverified = await person('Фальшивий', { email: 'admin21a@example.com', verified: false });
    const bad = await person('Порушник');
    const q = await makeQuizRow(bad, 'Вікторина порушника');
    await makeQuizRow(bad, 'Друга вікторина порушника');
    const emails = new Set(['admin21a@example.com']);
    const g1 = await makeGame(adminId, q.id, 'finished', NOW);
    const g2 = await makeGame(adminId, q.id, 'running', null);
    for (const [gid, pid] of [[g1, randomUUID()], [g1, randomUUID()], [g2, randomUUID()]] as const) {
      await db.insert(participant).values({ id: pid, gameId: gid, nickname: 'x', userId: bad, score: 0, totalTimeMs: 0 });
    }
    await banUser(db, { adminId, targetId: bad, reason: 'спам', now: NOW });

    const rows = (await adminUsers(db, emails, { q: 'порушник', page: 1 })).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: bad, games: 1, quizzes: 2, admin: false, banned: { at: NOW.toISOString(), reason: 'спам' } });
    const all = await adminUsers(db, emails, { q: 'Адмін Ада', page: 1 });
    expect(all.rows[0]).toMatchObject({ admin: true, banned: null, email: 'Admin21a@Example.com' });
    expect((await adminUsers(db, emails, { q: 'Фальшивий', page: 1 })).rows[0]!.admin).toBe(false);
    void unverified;
  });

  it('shows the stock, every award and the current title of a person', async () => {
    const id = await person('Володар призів');
    const content = (name: string) => ({ name, trophy: null, engraving: null, real: null, title: null, diploma: true });
    await db.insert(prize).values({ ownerId: id, content: content('Вільний'), status: 'free', createdAt: at('2026-11-01T00:00:00Z'), updatedAt: NOW });
    await db.insert(prize).values({ ownerId: id, content: content('Резерв'), status: 'reserved', createdAt: at('2026-11-02T00:00:00Z'), updatedAt: NOW });
    await db.insert(prize).values({ ownerId: id, content: content('Вручений'), status: 'awarded', createdAt: at('2026-11-03T00:00:00Z'), updatedAt: NOW });
    for (let i = 0; i < 25; i += 1) {
      await db.insert(prizeAward).values({
        userId: id, prizeId: randomUUID(), gameId: randomUUID(), place: 1, content: content(`Нагорода ${i}`), quizTitle: 'Q', nickname: 'Володар призів', awardedAt: new Date(NOW.getTime() - i * 1000),
      });
    }
    await db.insert(userTitle).values({ userId: id, text: 'Чемпіон', gameId: randomUUID(), awardedAt: NOW, expiresAt: at('2026-12-01T00:00:00Z') });

    const detail = await adminUser(db, none, id, NOW);
    expect(detail!.stock.map((p) => [p.content.name, p.status])).toEqual([['Резерв', 'reserved'], ['Вільний', 'free']]);
    expect(detail!.stock[0]).not.toHaveProperty('awarded');
    expect(detail!.awards).toHaveLength(25);
    expect(detail!.awards[0]!.content.name).toBe('Нагорода 0');
    expect(detail!.title).toEqual({ text: 'Чемпіон', until: '2026-12-01T00:00:00.000Z' });
    expect(detail!.user.nickname).toBe('Володар призів');
    expect(await adminUser(db, none, 'no-such', NOW)).toBeNull();
    expect((await adminUser(db, none, id, at('2027-01-01T00:00:00Z')))!.title).toBeNull();
  });

  it('creates a profile for a user who has none', async () => {
    await db.insert(user).values({ id: 'noprof', name: 'Без Профілю', email: 'noprof@example.com' });
    const detail = await adminUser(db, none, 'noprof', NOW);
    expect(detail!.user.nickname).not.toBe('');
    expect((await ensureProfile(db, 'noprof'))!.nickname).toBe(detail!.user.nickname);
  });

  it('lists and searches quizzes, and views one with effects', async () => {
    const author = await person('Авторка Карпат');
    const banned = await person('Заблокований автор');
    await banUser(db, { adminId: author, targetId: banned, reason: null, now: NOW });
    const a = await makeQuizRow(author, 'Карпатські вершини', at('2026-11-07T09:00:00Z'));
    const b = await makeQuizRow(banned, 'Лише для бану', at('2026-11-07T08:00:00Z'));
    await makeGame(author, a.id, 'finished', NOW);
    await makeGame(author, a.id, 'finished', NOW);
    await makeGame(author, a.id, 'running', null);

    const byTitle = await adminQuizzes(db, { q: 'карпатські', page: 1 });
    expect(byTitle.rows).toHaveLength(1);
    expect(byTitle.rows[0]).toMatchObject({ id: a.id, games: 2, authorBanned: false, author: { id: author, nickname: 'Авторка Карпат' }, questionCount: questionsOf(a).length });
    expect((await adminQuizzes(db, { q: 'заблокований', page: 1 })).rows.map((r) => [r.id, r.authorBanned])).toEqual([[b.id, true]]);
    expect((await adminQuizzes(db, { q: '%', page: 1 })).total).toBeGreaterThan(1);

    const view = await adminQuiz(db, a.id);
    expect(view).toMatchObject({ id: a.id, author: { id: author, nickname: 'Авторка Карпат' }, updatedAt: '2026-11-07T09:00:00.000Z' });
    expect(Object.keys(view!.effects).sort()).toEqual(questionsOf(view!.quiz).map((q) => q.id).sort());
    expect(await adminQuiz(db, randomUUID())).toBeNull();
    expect(await adminQuiz(db, 'not-a-uuid')).toBeNull();
    void bool;
  });

  it('reads the action log newest first, 50 per page', async () => {
    const own = await createTestDb();
    await own.insert(user).values({ id: 'ad', name: 'Адмін', email: 'ad@example.com' });
    await own.insert(user).values({ id: 'tg', name: 'Ціль', email: 'tg@example.com' });
    const base = NOW.getTime();
    await logAction(own, { adminId: 'ad', kind: 'ban', targetUserId: 'tg', details: { reason: 'спам' }, now: new Date(base) });
    await logAction(own, { adminId: 'ad', kind: 'unban', targetUserId: 'tg', details: {}, now: new Date(base + 1000) });
    await logAction(own, { adminId: 'ad', kind: 'quiz_delete', targetUserId: 'tg', details: { title: 'Q' }, now: new Date(base + 2000) });
    const log = await adminLog(own, 1);
    expect(log.rows.map((r) => r.kind)).toEqual(['quiz_delete', 'unban', 'ban']);
    expect(log.rows[2]).toMatchObject({ admin: 'Адмін', target: 'Ціль', details: { reason: 'спам' }, at: new Date(base).toISOString() });
    expect([log.total, log.pages]).toEqual([3, 1]);
    for (let i = 0; i < 50; i += 1) await logAction(own, { adminId: 'ad', kind: 'ban', targetUserId: 'tg', details: {}, now: new Date(base + 10_000 + i) });
    const page1 = await adminLog(own, 1);
    expect([page1.rows.length, page1.total, page1.pages]).toEqual([50, 53, 2]);
    expect((await adminLog(own, 2)).rows.length).toBe(3);
  });
});

