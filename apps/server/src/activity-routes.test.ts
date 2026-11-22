import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { activityDay, user } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;

describe('editor time route (71)', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let ctx: Ctx;

  const post = (payload: unknown, cookie?: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/me/editor-time', payload: payload as object, headers: cookie === undefined ? {} : { cookie } });

  async function account(name: string): Promise<{ cookie: string; id: string }> {
    const made = await signUp(ctx.app, name);
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, made.email));
    return { cookie: made.cookie, id: row!.id };
  }
  const daysOf = (userId: string) =>
    db.select({ sec: activityDay.editorSec, sessions: activityDay.editorSessions }).from(activityDay).where(eq(activityDay.userId, userId));

  beforeAll(async () => {
    db = await createTestDb();
    ctx = await buildApp({ db, auth: TEST_AUTH });
  });
  afterAll(async () => {
    await ctx.shutdown();
  });

  it('a guest gets 401', async () => {
    const response = await post({ seconds: 60, start: true });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
  });

  it('a signed-in person adds a portion; 204 and the row of the day', async () => {
    const olya = await account('Оля');
    const response = await post({ seconds: 60, start: true }, olya.cookie);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(await daysOf(olya.id)).toEqual([{ sec: 60, sessions: 1 }]);
  });

  it('a bad portion is 400', async () => {
    const payloads = [{ seconds: 0, start: true }, { seconds: 91, start: true }, { seconds: 60, start: true, quizId: 'q' }, { seconds: 60 }];
    for (const [index, payload] of payloads.entries()) {
      // Своя людина на кожну порцію: більше трьох за хвилину — уже 429.
      const taras = await account(`Тарас ${index}`);
      const response = await post(payload, taras.cookie);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_payload' });
    }
  });

  it('the 4th portion in a minute is 429: a day cannot be inflated in minutes', async () => {
    const petro = await account('Петро');
    for (let i = 0; i < 3; i += 1) expect((await post({ seconds: 90, start: true }, petro.cookie)).statusCode).toBe(204);
    expect((await post({ seconds: 90, start: true }, petro.cookie)).statusCode).toBe(429);
    expect(await daysOf(petro.id)).toEqual([{ sec: 270, sessions: 3 }]);
  });
});
