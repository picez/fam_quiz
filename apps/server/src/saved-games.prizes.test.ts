import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import type { ContinueResponse, PrizeContent } from '@quiz/shared';
import { buildApp } from './app';
import type { Db } from './db/client';
import { prize, savedGame, user } from './db/schema';
import { createPrize, deletePrize, reservePlaces } from './prizes';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';
import { toQuestion } from './testing/team-game';

const quizOf = () =>
  makeRoundsQuiz([
    classicRound('r0', [single, withId(single, 'q2')], { speedBonus: false }),
    classicRound('r1', [withId(single, 'q3'), withId(single, 'q4')], { speedBonus: false }),
  ]);
const right = { type: 'single', optionId: 'b' } as const;
const content = (name: string): PrizeContent => ({ name, trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false });

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

const call = (method: 'GET' | 'POST' | 'DELETE', url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });

async function account(name: string) {
  const made = await signUp(ctx.app, name);
  const [row] = await db.select().from(user).where(eq(user.email, made.email));
  return { ...made, id: row.id };
}

const statusOf = async (id: string) => (await db.select().from(prize).where(eq(prize.id, id)))[0]?.status;

/** Гра ведучої з кубком на 1-му місці: Оля входить, перше запитання закрито, ведуча зберігає. */
async function savedWithPrize() {
  const owner = await account('Ведуча');
  const quizId = ((await call('POST', '/api/quizzes', owner.cookie, quizOf())).json() as { id: string }).id;
  const created = (await call('POST', '/api/games', owner.cookie, { quizId })).json() as { gameId: string; code: string };
  const room = ctx.manager.get(created.code)!;
  const made = await createPrize(db, owner.id, content('Кубок'));
  if (!made.ok) throw new Error(made.error);
  const cup = made.prize.id;
  const reserved = await reservePlaces(db, owner.id, room.id, [cup, null, null]);
  if (!reserved.ok) throw new Error(reserved.error);
  expect(ctx.manager.setPrizes(room, reserved.placed)).toEqual({ ok: true });
  const { playerId } = (await call('POST', `/api/games/by-code/${created.code}/join`, undefined, { nickname: 'Оля' })).json() as { playerId: string };
  ctx.manager.connect(room, { role: 'player', playerId });
  expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
  toQuestion(ctx.manager, room);
  ctx.manager.answer(room, playerId, right);
  ctx.manager.host(room, { type: 'lock' });
  ctx.manager.host(room, { type: 'next' });
  toQuestion(ctx.manager, room);
  expect(ctx.manager.host(room, { type: 'save' })).toEqual({ ok: true });
  await ctx.recorder.idle();
  expect(await statusOf(cup)).toBe('reserved');
  return { owner, gameId: created.gameId, cup };
}

describe('prizes of a saved game', () => {
  it('deleting the saved game gives its prize back', async () => {
    const s = await savedWithPrize();
    expect((await call('DELETE', `/api/games/${s.gameId}`, s.owner.cookie)).statusCode).toBe(200);
    expect(await statusOf(s.cup)).toBe('free');
  });

  it('an exact continuation plays for the same prize', async () => {
    const s = await savedWithPrize();
    const body = (await call('POST', `/api/games/${s.gameId}/continue`, s.owner.cookie)).json() as ContinueResponse;
    expect(body.gameId).toBe(s.gameId);
    const room = ctx.manager.get(body.code)!;
    expect(room.prizes.map((p) => p.id)).toEqual([s.cup]);
    expect(ctx.manager.view(room, { role: 'stage', playerId: null })?.prizes?.places).toHaveLength(1);
    expect(await statusOf(s.cup)).toBe('reserved');
  });

  it('an exact continuation leaves out a prize deleted while the game was saved', async () => {
    const s = await savedWithPrize();
    expect(await deletePrize(db, ctx.manager, s.cup, s.owner.id)).toBe('deleted');
    const body = (await call('POST', `/api/games/${s.gameId}/continue`, s.owner.cookie)).json() as ContinueResponse;
    expect(ctx.manager.get(body.code)!.prizes).toEqual([]);
  });

  it('a restart from an unreadable save gives the prize back for the new lobby', async () => {
    const s = await savedWithPrize();
    await db.update(savedGame).set({ stateVersion: 999 }).where(eq(savedGame.gameId, s.gameId));
    const response = await call('POST', `/api/games/${s.gameId}/continue`, s.owner.cookie);
    expect(response.statusCode).toBe(201);
    const body = response.json() as ContinueResponse;
    expect(body.gameId).not.toBe(s.gameId);
    expect(ctx.manager.get(body.code)!.prizes).toEqual([]);
    expect(await statusOf(s.cup)).toBe('free');
  });
});
