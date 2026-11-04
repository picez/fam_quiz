import { makeQuiz, single } from '@quiz/engine/testing';
import { and, eq, inArray } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { profile, quiz, user, userAchievement, xpEntry } from './db/schema';
import { ensureProfile } from './profiles';
import { seedGame, type SeedPlayer } from './testing/history-rows';
import { createTestDb } from './testing/test-db';
import { creditAchievements, creditGame, ownLevel, publicLevel, roomLevels, saveLooks, syncXp, unlockTimes, xpTotals } from './xp-store';

const HOST = 'xp-host';
const AUTHOR = 'xp-author';

let db: Db;
let users = 0;

beforeAll(async () => {
  db = await createTestDb();
  await addUser(HOST);
  await addUser(AUTHOR);
});

async function addUser(id: string) {
  await db.insert(user).values({ id, name: `Гравець ${id}`, email: `${id}@example.com` });
}

/** Нові акаунти для одного тесту. */
async function accounts(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    users += 1;
    const id = `xp-user-${users}`;
    await addUser(id);
    ids.push(id);
  }
  return ids;
}

async function newQuiz(owner = AUTHOR): Promise<string> {
  const sample = makeQuiz([single]);
  const [row] = await db.insert(quiz).values({ ownerId: owner, title: 'Карпати', description: '', settings: sample.settings, rounds: sample.rounds }).returning();
  return row.id;
}

/** Завершена гра: у кожного гравця correct правильних запитань (0…correct−1); guests — гравці без акаунта. */
async function finishedGame(spec: {
  quizId?: string | null;
  hostId?: string;
  players: { userId: string | null; rank: number | null; correct: number }[];
  questions: number;
  finishedAt: Date;
}): Promise<string> {
  const players: SeedPlayer[] = spec.players.map((p, i) => ({
    userId: p.userId,
    nickname: `Нік ${i}`,
    score: 100 - i,
    rank: p.rank,
    rows: Array.from({ length: p.correct }, (_, q) => ({ questionIndex: q, accepted: true, points: 10 })),
  }));
  const { gameId } = await seedGame(db, {
    hostId: spec.hostId ?? HOST,
    quizId: spec.quizId ?? undefined,
    startedAt: new Date(spec.finishedAt.getTime() - 30 * 60_000),
    finishedAt: spec.finishedAt,
    questionsPlayed: spec.questions,
    players,
  });
  return gameId;
}

/**
 * db, у якого n-та транзакція (від 1) поводиться інакше: before виконується перед нею, а fail — замість неї кидає збій.
 * Решта викликів іде до справжньої бази.
 */
function hooked(n: number, hook: { before?: () => Promise<void>; fail?: boolean }): Db {
  let calls = 0;
  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (prop !== 'transaction' || typeof value !== 'function') return typeof value === 'function' ? value.bind(target) : value;
      return async (...args: unknown[]) => {
        calls += 1;
        if (calls === n) {
          if (hook.fail === true) throw new Error('збій транзакції');
          await hook.before?.();
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

const rowsOf = (userId: string) => db.select().from(xpEntry).where(eq(xpEntry.userId, userId));
const gameRow = async (userId: string, gameId: string) =>
  (await db.select().from(xpEntry).where(and(eq(xpEntry.userId, userId), eq(xpEntry.gameId, gameId)))).at(0);
const total = async (userId: string) => (await xpTotals(db, [userId])).get(userId);
/** Мітка є (наче ретро вже зроблено) — нарахування живих ігор зі стелею. */
async function synced(userId: string, at = new Date('2026-01-01T00:00:00Z')) {
  await syncXp(db, userId);
  await db.update(profile).set({ xpSyncedAt: at }).where(eq(profile.userId, userId));
}

describe('crediting a finished game', () => {
  it('writes one row per account with the sums of the rules; a repeat adds nothing', async () => {
    const [a, b, c, d] = await accounts(4);
    const quizId = await newQuiz();
    const gameId = await finishedGame({
      quizId,
      questions: 5,
      finishedAt: new Date('2026-10-10T18:00:00Z'),
      players: [
        { userId: a, rank: 1, correct: 3 },
        { userId: b, rank: 2, correct: 2 },
        { userId: null, rank: 3, correct: 5 },
        { userId: c, rank: 4, correct: 1 },
        { userId: d, rank: 5, correct: 0 },
      ],
    });
    await creditGame(db, gameId);
    const totals = await xpTotals(db, [a, b, c, d]);
    expect(Object.fromEntries(totals)).toEqual({ [a]: 50 + 30 + 100, [b]: 50 + 20 + 60, [c]: 50 + 10, [d]: 50 });
    const row = await gameRow(a, gameId);
    expect(row).toMatchObject({ source: 'game', quizId, amount: 180, counted: true, reason: null, day: '2026-10-10' });
    expect(row?.at).toEqual(new Date('2026-10-10T18:00:00Z'));

    await creditGame(db, gameId);
    for (const id of [a, b, c, d]) expect(await rowsOf(id)).toHaveLength(1);
    expect(Object.fromEntries(await xpTotals(db, [a, b, c, d]))).toEqual(Object.fromEntries(totals));
  });

  it('an unfinished game credits nothing', async () => {
    const [a, b, c] = await accounts(3);
    const { gameId } = await seedGame(db, {
      hostId: HOST,
      status: 'running',
      startedAt: new Date('2026-10-10T18:00:00Z'),
      questionsPlayed: 6,
      players: [a, b, c].map((userId, i) => ({ userId, nickname: `Н${i}`, score: 0, rank: i + 1 })),
    });
    await creditGame(db, gameId);
    expect(await rowsOf(a)).toHaveLength(0);
  });

  it('marks the rows retro until the first sync, then live', async () => {
    const [a, b, c] = await accounts(3);
    const players = (correct: number) => [
      { userId: a, rank: 1, correct },
      { userId: b, rank: 2, correct: 0 },
      { userId: c, rank: 3, correct: 0 },
    ];
    const first = await finishedGame({ questions: 5, finishedAt: new Date('2026-10-11T18:00:00Z'), players: players(1) });
    await creditGame(db, first);
    expect(await gameRow(a, first)).toMatchObject({ retro: true });
    const [mark] = await db.select({ at: profile.xpSyncedAt }).from(profile).where(eq(profile.userId, a));
    expect(mark.at).toBeInstanceOf(Date);

    const second = await finishedGame({ questions: 5, finishedAt: new Date(Date.now() + 60_000), players: players(2) });
    await creditGame(db, second);
    expect(await gameRow(a, second)).toMatchObject({ retro: false, amount: 50 + 20 + 100 });
  });
});

describe('the daily cap', () => {
  /** Гра, де me перший з correct правильними, і ще двоє нових акаунтів. */
  async function win(me: string, correct: number, finishedAt: Date, quizId: string | null = null) {
    const [x, y] = await accounts(2);
    return finishedGame({
      quizId,
      questions: Math.max(5, correct),
      finishedAt,
      players: [
        { userId: me, rank: 1, correct },
        { userId: x, rank: 2, correct: 0 },
        { userId: y, rank: 3, correct: 0 },
      ],
    });
  }

  it('three games of one Kyiv day at 250 give 250, 250, 100; the next day is full again', async () => {
    const [me] = await accounts(1);
    await synced(me);
    const games = [];
    for (const hour of ['08', '12', '20']) games.push(await win(me, 10, new Date(`2026-10-13T${hour}:00:00Z`)));
    for (const g of games) await creditGame(db, g);
    const rows = await Promise.all(games.map((g) => gameRow(me, g)));
    expect(rows.map((r) => r?.amount)).toEqual([250, 250, 100]);
    expect(rows.map((r) => r?.reason)).toEqual([null, null, 'cap']);
    expect(rows[2]?.counted).toBe(true);

    // 22:30 UTC 13.10 — уже 14.10 за Києвом (UTC+3).
    const next = await win(me, 10, new Date('2026-10-13T22:30:00Z'));
    await creditGame(db, next);
    expect(await gameRow(me, next)).toMatchObject({ amount: 250, reason: null, day: '2026-10-14' });
    expect(await total(me)).toBe(850);
  });

  it('two games finishing at once share the cap: 400 + 400 → 600', async () => {
    const [me] = await accounts(1);
    await synced(me);
    const g1 = await win(me, 25, new Date('2026-10-15T10:00:00Z'));
    const g2 = await win(me, 25, new Date('2026-10-15T10:00:01Z'));
    await Promise.all([creditGame(db, g1), creditGame(db, g2)]);
    const amounts = [(await gameRow(me, g1))?.amount, (await gameRow(me, g2))?.amount].sort();
    expect(amounts).toEqual([200, 400]);
    expect(await total(me)).toBe(600);
  });
});

describe('retro and catching up', () => {
  it('the first sync replays old games in order without the cap, with repeat_quiz, and sets the mark', async () => {
    const [me, x, y] = await accounts(3);
    const same = await newQuiz();
    const other = await newQuiz();
    const players = [
      { userId: me, rank: 1, correct: 16 },
      { userId: x, rank: 2, correct: 0 },
      { userId: y, rank: 3, correct: 0 },
    ];
    const g1 = await finishedGame({ quizId: same, questions: 16, finishedAt: new Date('2026-09-01T08:00:00Z'), players });
    const g2 = await finishedGame({ quizId: same, questions: 16, finishedAt: new Date('2026-09-01T10:00:00Z'), players });
    const g3 = await finishedGame({ quizId: other, questions: 16, finishedAt: new Date('2026-09-01T12:00:00Z'), players });

    await syncXp(db, me);
    expect(await gameRow(me, g1)).toMatchObject({ amount: 310, counted: true, retro: true, reason: null });
    expect(await gameRow(me, g2)).toMatchObject({ amount: 0, counted: false, retro: true, reason: 'repeat_quiz' });
    expect(await gameRow(me, g3)).toMatchObject({ amount: 310, counted: true, retro: true, reason: null });
    expect(await total(me)).toBe(620);
    const [mark] = await db.select({ at: profile.xpSyncedAt }).from(profile).where(eq(profile.userId, me));
    expect(mark.at).toBeInstanceOf(Date);

    await syncXp(db, me);
    expect(await rowsOf(me)).toHaveLength(3);
  });

  it('catches up a game finished after the mark without its own row, under the cap, and moves the mark', async () => {
    const [me, x, y] = await accounts(3);
    await synced(me, new Date('2026-10-01T00:00:00Z'));
    const players = [
      { userId: me, rank: 1, correct: 25 },
      { userId: x, rank: 2, correct: 0 },
      { userId: y, rank: 3, correct: 0 },
    ];
    const credited = await finishedGame({ questions: 25, finishedAt: new Date('2026-10-05T08:00:00Z'), players });
    await creditGame(db, credited);
    // Нарахування цієї гри загубилось (вичерпані повтори рекордера).
    const lost = await finishedGame({ questions: 25, finishedAt: new Date('2026-10-05T12:00:00Z'), players });

    await syncXp(db, me);
    expect(await gameRow(me, lost)).toMatchObject({ amount: 200, reason: 'cap', retro: false });
    const [mark] = await db.select({ at: profile.xpSyncedAt }).from(profile).where(eq(profile.userId, me));
    expect(mark.at).toEqual(new Date('2026-10-05T12:00:00Z'));
    await syncXp(db, me);
    expect(await rowsOf(me)).toHaveLength(2);
  });

  it('a first sync racing the live credit of a just-finished game writes one row and the same total', async () => {
    const run = async (together: boolean) => {
      const [me, x, y] = await accounts(3);
      const quizId = await newQuiz();
      const players = [
        { userId: me, rank: 1, correct: 2 },
        { userId: x, rank: 2, correct: 0 },
        { userId: y, rank: 3, correct: 0 },
      ];
      await finishedGame({ quizId, questions: 5, finishedAt: new Date('2026-09-20T18:00:00Z'), players });
      const fresh = await finishedGame({ quizId, questions: 5, finishedAt: new Date('2026-09-21T18:00:00Z'), players });
      if (together) await Promise.all([syncXp(db, me), creditGame(db, fresh)]);
      else {
        await syncXp(db, me);
        await creditGame(db, fresh);
      }
      const rows = (await rowsOf(me)).filter((r) => r.gameId === fresh);
      return { rows, sum: await total(me), reason: rows[0]?.reason };
    };
    const raced = await run(true);
    const serial = await run(false);
    expect(raced.rows).toHaveLength(1);
    expect(raced.sum).toBe(serial.sum);
    expect(raced.reason).toBe('repeat_quiz');
    expect(serial.reason).toBe('repeat_quiz');
  });

  it('a game zeroed by few_accounts does not use up the quiz', async () => {
    const [a, b, c] = await accounts(3);
    const quizId = await newQuiz();
    const pair = await finishedGame({
      quizId,
      questions: 5,
      finishedAt: new Date('2026-10-16T10:00:00Z'),
      players: [
        { userId: a, rank: 1, correct: 1 },
        { userId: b, rank: 2, correct: 0 },
        { userId: null, rank: 3, correct: 0 },
      ],
    });
    await creditGame(db, pair);
    expect(await gameRow(a, pair)).toMatchObject({ amount: 0, counted: false, reason: 'few_accounts' });
    const three = await finishedGame({
      quizId,
      questions: 5,
      finishedAt: new Date('2026-10-16T12:00:00Z'),
      players: [
        { userId: a, rank: 1, correct: 1 },
        { userId: b, rank: 2, correct: 0 },
        { userId: c, rank: 3, correct: 0 },
      ],
    });
    await creditGame(db, three);
    expect(await gameRow(a, three)).toMatchObject({ amount: 160, counted: true, reason: null });
  });

  it('the quiz author in the table gets a zero row and does not count towards the three accounts', async () => {
    const [author, a, b, c] = await accounts(4);
    const quizId = await newQuiz(author);
    const players = (third: string | null) => [
      { userId: author, rank: 1, correct: 5 },
      { userId: a, rank: 2, correct: 0 },
      { userId: b, rank: 3, correct: 0 },
      { userId: third, rank: 4, correct: 0 },
    ];
    const short = await finishedGame({ quizId, questions: 5, finishedAt: new Date('2026-10-17T10:00:00Z'), players: players(null) });
    await creditGame(db, short);
    expect(await gameRow(a, short)).toMatchObject({ reason: 'few_accounts' });
    const full = await finishedGame({ quizId, questions: 5, finishedAt: new Date('2026-10-17T12:00:00Z'), players: players(c) });
    await creditGame(db, full);
    expect(await gameRow(author, full)).toMatchObject({ amount: 0, reason: 'author' });
    expect(await gameRow(a, full)).toMatchObject({ amount: 110, counted: true });
  });
});

describe('races and failures', () => {
  it('a mark already past the game (set by a racing first sync that missed it) still gets the game credited, exactly once', async () => {
    const accountsHere = await accounts(3);
    for (const id of accountsHere) await ensureProfile(db, id);
    const finishedAt = new Date('2026-10-20T18:00:00Z');
    const gameId = await finishedGame({
      questions: 5,
      finishedAt,
      players: accountsHere.map((userId, i) => ({ userId, rank: i + 1, correct: 1 })),
    });
    // Перед першою транзакцією (ретро першого гравця) інший прохід уже поставив мітку пізніше за гру, не побачивши її.
    const raced = hooked(1, {
      before: async () => {
        await db.update(profile).set({ xpSyncedAt: new Date('2026-10-20T19:00:00Z') }).where(inArray(profile.userId, accountsHere));
      },
    });
    await creditGame(raced, gameId);
    for (const id of accountsHere) expect((await rowsOf(id)).filter((r) => r.gameId === gameId)).toHaveLength(1);
    await creditGame(db, gameId);
    for (const id of accountsHere) await syncXp(db, id);
    for (const id of accountsHere) expect((await rowsOf(id)).filter((r) => r.gameId === gameId)).toHaveLength(1);
  });

  it('catch-up credits each game on its own and moves the mark only up to the last game before a failure', async () => {
    const [me, x, y] = await accounts(3);
    await synced(me, new Date('2026-10-01T00:00:00Z'));
    const players = [
      { userId: me, rank: 1, correct: 1 },
      { userId: x, rank: 2, correct: 0 },
      { userId: y, rank: 3, correct: 0 },
    ];
    const g1 = await finishedGame({ questions: 5, finishedAt: new Date('2026-10-06T08:00:00Z'), players });
    const g2 = await finishedGame({ questions: 5, finishedAt: new Date('2026-10-07T08:00:00Z'), players });
    const g3 = await finishedGame({ questions: 5, finishedAt: new Date('2026-10-08T08:00:00Z'), players });
    const errors: unknown[] = [];
    // Друга транзакція — нарахування g2 — падає.
    await syncXp(hooked(2, { fail: true }), me, (e) => errors.push(e));
    expect(errors).toHaveLength(1);
    expect(await gameRow(me, g1)).toBeDefined();
    expect(await gameRow(me, g2)).toBeUndefined();
    expect(await gameRow(me, g3)).toBeDefined();
    const mark = async () => (await db.select({ at: profile.xpSyncedAt }).from(profile).where(eq(profile.userId, me)))[0].at;
    expect(await mark()).toEqual(new Date('2026-10-06T08:00:00Z'));
    // Наступне наздоганяння підбирає g2, g1 і g3 не дублює, мітка — на найпізнішій.
    await syncXp(db, me);
    expect(await gameRow(me, g2)).toBeDefined();
    expect((await rowsOf(me)).filter((r) => r.source === 'game')).toHaveLength(3);
    // g3 уже має власний рядок: наздоганяння його не бере, мітка — на g2
    expect(await mark()).toEqual(new Date('2026-10-07T08:00:00Z'));
    await syncXp(db, me);
    expect((await rowsOf(me)).filter((r) => r.source === 'game')).toHaveLength(3);
  });

  it('the author of a deleted quiz who hosted the game still gets the author zero', async () => {
    const [author, a, b, c] = await accounts(4);
    const quizId = await newQuiz(author);
    const gameId = await finishedGame({
      quizId,
      hostId: author,
      questions: 5,
      finishedAt: new Date('2026-10-21T18:00:00Z'),
      players: [
        { userId: author, rank: 1, correct: 5 },
        { userId: a, rank: 2, correct: 0 },
        { userId: b, rank: 3, correct: 0 },
        { userId: c, rank: 4, correct: 0 },
      ],
    });
    await db.delete(quiz).where(eq(quiz.id, quizId));
    await creditGame(db, gameId);
    expect(await gameRow(author, gameId)).toMatchObject({ amount: 0, reason: 'author' });
    expect(await gameRow(a, gameId)).toMatchObject({ amount: 50 + 60, counted: true });
    // ретро (без мітки) так само
    const [author2, d, e, f] = await accounts(4);
    const quiz2 = await newQuiz(author2);
    const old = await finishedGame({
      quizId: quiz2,
      hostId: author2,
      questions: 5,
      finishedAt: new Date('2026-09-21T18:00:00Z'),
      players: [author2, d, e, f].map((userId, i) => ({ userId, rank: i + 1, correct: 0 })),
    });
    await db.delete(quiz).where(eq(quiz.id, quiz2));
    await syncXp(db, author2);
    expect(await gameRow(author2, old)).toMatchObject({ amount: 0, reason: 'author' });
  });
});

describe('achievements', () => {
  it('credits each achievement once by rarity, outside the daily cap; the old one has no date', async () => {
    const [me] = await accounts(1);
    await synced(me);
    const earned = new Date('2026-10-18T09:00:00Z');
    await db.insert(xpEntry).values({ userId: me, source: 'game', amount: 600, counted: true, day: '2026-10-18', at: earned, createdAt: earned });
    await db.insert(userAchievement).values([
      { userId: me, achievementId: 'first_game', earnedAt: null },
      { userId: me, achievementId: 'veteran', earnedAt: earned },
    ]);
    await creditAchievements(db, me);
    const rows = (await rowsOf(me)).filter((r) => r.source === 'achievement');
    expect(rows.map((r) => [r.achievementId, r.amount, r.at]).sort()).toEqual(
      [
        ['first_game', 25, null],
        ['veteran', 100, earned],
      ].sort(),
    );
    await creditAchievements(db, me);
    expect(await total(me)).toBe(725);
  });
});

describe('levels and looks', () => {
  it('unlockTimes finds the moment each level was reached', () => {
    const d1 = new Date('2026-10-01T10:00:00Z');
    const d2 = new Date('2026-10-02T10:00:00Z');
    const d3 = new Date('2026-10-03T10:00:00Z');
    const times = unlockTimes(
      [
        { at: d1, amount: 200 },
        { at: d2, amount: 100 },
        { at: d3, amount: 300 },
      ],
      3,
    );
    expect(Object.fromEntries(times)).toEqual({ 1: d1, 2: d2, 3: d3 });
    expect(Object.fromEntries(unlockTimes([{ at: null, amount: 300 }], 2))).toEqual({ 1: null, 2: null });
  });

  it('ownLevel at 600 XP is level 3 with rewards 1–3 unlocked and 4–6 next', async () => {
    const [me] = await accounts(1);
    await synced(me);
    const at = new Date('2026-10-19T10:00:00Z');
    await db.insert(xpEntry).values({ userId: me, source: 'game', amount: 600, counted: true, day: '2026-10-19', at, createdAt: at });
    const own = await ownLevel(db, me);
    expect(own.progress).toEqual({ level: 3, xp: 600, levelAt: 520, nextAt: 800 });
    expect(own.unlocked.map((u) => u.level)).toEqual([1, 2, 3, 3]);
    expect(own.unlocked[2]).toEqual({ level: 3, reward: { kind: 'stickers', series: 'nyaa' }, at: at.toISOString() });
    expect(own.next.map((n) => n.level)).toEqual([4, 4, 5, 6, 6]);
    expect(own.looks).toEqual({ color: null, frame: null, badge: null, photo: null, font: null });
  });

  it('saveLooks refuses a colour above the level and saves it once the level is there', async () => {
    const [me] = await accounts(1);
    await synced(me);
    const looks = { color: 'sky' as const, frame: null, badge: null, photo: null, font: null };
    expect(await saveLooks(db, me, looks)).toEqual({ ok: false, error: 'look_locked' });
    const at = new Date('2026-10-20T10:00:00Z');
    await db.insert(xpEntry).values({ userId: me, source: 'game', amount: 300, counted: true, day: '2026-10-20', at, createdAt: at });
    expect(await saveLooks(db, me, looks)).toEqual({ ok: true, looks });
    expect(await publicLevel(db, me)).toEqual({ level: 2, looks });
  });

  it('roomLevels: an account without rows is level 1 with nothing worn; worn looks above the level are hidden', async () => {
    const [fresh, worn] = await accounts(2);
    await synced(worn);
    const at = new Date('2026-10-21T10:00:00Z');
    await db.insert(xpEntry).values({ userId: worn, source: 'game', amount: 300, counted: true, day: '2026-10-21', at, createdAt: at });
    // Рамка bronze — з 8-го рівня: її не показують на 2-му.
    await db.update(profile).set({ nickColor: 'sky', nickFrame: 'bronze' }).where(eq(profile.userId, worn));
    const levels = await roomLevels(db, [fresh, worn]);
    expect(levels.get(fresh)).toEqual({ level: 1, color: null, frame: null, font: null });
    expect(levels.get(worn)).toEqual({ level: 2, color: 'sky', frame: null, font: null });
    const [mark] = await db.select({ at: profile.xpSyncedAt }).from(profile).where(eq(profile.userId, fresh));
    expect(mark.at).toBeInstanceOf(Date);
  });
});
