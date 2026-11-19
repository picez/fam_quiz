import { randomUUID } from 'node:crypto';
import { classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { BOT_USER_ID, type Quiz } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { ensureBotAccount } from './bot-account';
import type { Db } from './db/client';
import { feedEvent, game, participant, savedGame, user, userAchievement, xpEntry } from './db/schema';
import { createQuiz } from './quizzes';
import { abandonRooms, parkInterrupted } from './saved-games';
import { FakeScheduler } from './testing/fake-scheduler';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';
import type { Room } from './rooms/manager';

const right = { type: 'single', optionId: 'b' } as const;
const quizOf = (): Quiz => ({
  ...makeRoundsQuiz([classicRound('r0', [single, withId(single, 'q2'), withId(single, 'q3')].map((q) => ({ ...q, timeLimit: 30 })), { speedBonus: false })]),
  title: 'Річки України 54',
});

let db: Db;
let ctx: Awaited<ReturnType<typeof buildApp>>;
const scheduler = new FakeScheduler();

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH, scheduler });
  await ensureBotAccount(db);
});
afterAll(async () => {
  await ctx.app.close();
});

async function account(name: string) {
  const made = await signUp(ctx.app, name);
  const [row] = await db.select().from(user).where(eq(user.email, made.email));
  return { ...made, id: row.id };
}

async function botRoom(): Promise<Room> {
  const quizId = await createQuiz(db, BOT_USER_ID, quizOf());
  const created = ctx.manager.createBotRoom(quizOf(), quizId);
  if (!created.ok) throw new Error(created.error);
  return created.room;
}

function enter(room: Room, nickname: string, userId: string) {
  const joined = ctx.manager.join(room.code, nickname, userId);
  if (!joined.ok) throw new Error(joined.error);
  ctx.manager.connect(room, { role: 'player', playerId: joined.playerId });
  return joined.playerId;
}

/** Ходить автопілотом: гравці відповідають, годинник крутиться; зупиняється, коли гру завершено чи закрито стільки запитань, скільки просили. */
async function play(room: Room, answering: string[], until: number) {
  for (let guard = 0; guard < 400 && room.state.phase !== 'finished'; guard++) {
    if (room.state.phase === 'question') for (const id of answering) ctx.manager.answer(room, id, right);
    if (room.state.plays.length >= until) break;
    scheduler.advance(1000);
  }
  await ctx.recorder.idle();
}

describe('bot rewards (54)', () => {
  it('a finished bot game credits the players and gives the bot nothing', async () => {
    const olya = await account('Оля');
    const petro = await account('Петро');
    const room = await botRoom();
    const a = enter(room, 'Оля', olya.id);
    enter(room, 'Петро', petro.id);
    expect(ctx.manager.botAct(room.code, 'start')).toEqual({ ok: true });
    await play(room, [a], 3);
    expect(ctx.manager.botAct(room.code, 'end')).toEqual({ ok: true });
    await ctx.recorder.idle();

    const [row] = await db.select().from(game).where(eq(game.id, room.id));
    expect(row).toMatchObject({ hostId: BOT_USER_ID, autopilot: true, status: 'finished' });
    const people = (await db.select().from(participant).where(eq(participant.gameId, room.id))).map((p) => p.userId);
    expect(people).toEqual(expect.arrayContaining([olya.id, petro.id]));
    expect(people).not.toContain(BOT_USER_ID);
    expect(await db.select().from(xpEntry).where(eq(xpEntry.userId, olya.id))).not.toHaveLength(0);
    expect(await db.select().from(xpEntry).where(eq(xpEntry.userId, BOT_USER_ID))).toHaveLength(0);
    expect(await db.select().from(userAchievement).where(eq(userAchievement.userId, BOT_USER_ID))).toHaveLength(0);
    expect(await db.select().from(feedEvent).where(eq(feedEvent.userId, BOT_USER_ID))).toHaveLength(0);

    const history = await ctx.app.inject({ method: 'GET', url: '/api/me/history', headers: { cookie: olya.cookie } });
    expect((history.json() as { gameId: string; autopilot: boolean }[]).find((g) => g.gameId === room.id)).toMatchObject({ autopilot: true });
  });

  it('abandoning a bot room never parks it as a saved game of the bot', async () => {
    const olya = await account('Оля б');
    const room = await botRoom();
    const a = enter(room, 'Оля', olya.id);
    expect(ctx.manager.botAct(room.code, 'start')).toEqual({ ok: true });
    await play(room, [a], 1);
    const [before] = await db.select().from(game).where(eq(game.id, room.id));
    expect(before).toMatchObject({ status: 'running' });
    expect(before!.questionsPlayed).toBeGreaterThan(0);

    const errors: unknown[] = [];
    await abandonRooms(db, [{ roomId: room.id, data: ctx.manager.snapshot(room) }], (e) => errors.push(e));
    expect(errors).toEqual([]);
    const [after] = await db.select().from(game).where(eq(game.id, room.id));
    expect(after!.status).toBe('aborted');
    expect(await db.select().from(savedGame).where(eq(savedGame.gameId, room.id))).toHaveLength(0);
  });

  it('a restart does not park an interrupted bot game, but still parks an ordinary one', async () => {
    const host = await account('Ведуча');
    const base = { quizSnapshot: quizOf(), status: 'running' as const, questionsPlayed: 2, startedAt: new Date(), autopilot: true };
    const botGame = randomUUID();
    const ordinary = randomUUID();
    await db.insert(game).values([
      { ...base, id: botGame, hostId: BOT_USER_ID, code: '555001', title: 'Бот' },
      { ...base, id: ordinary, hostId: host.id, code: '555002', title: 'Звичайна' },
    ]);
    await parkInterrupted(db, []);
    expect((await db.select().from(game).where(eq(game.id, botGame)))[0]!.status).toBe('aborted');
    expect(await db.select().from(savedGame).where(eq(savedGame.gameId, botGame))).toHaveLength(0);
    expect((await db.select().from(game).where(eq(game.id, ordinary)))[0]!.status).toBe('saved');
  });
});
