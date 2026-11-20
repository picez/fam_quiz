import { single } from '@quiz/engine/testing';
import type { GameReplay } from '@quiz/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { adminAction, user } from './db/schema';
import { seedGame } from './testing/history-rows';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Person = Awaited<ReturnType<typeof signUp>> & { id: string };

let db: Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let admin: Person;
let other: Person;
const emails = new Set<string>();
const right = { type: 'single', optionId: 'b' } as const;

const get = (url: string, cookie?: string) => ctx.app.inject({ method: 'GET', url, headers: cookie === undefined ? {} : { cookie } });

async function person(name: string): Promise<Person> {
  const signed = await signUp(ctx.app, name);
  const me = (await get('/api/me', signed.cookie)).json() as { id: string };
  return { ...signed, id: me.id };
}

const replayLogs = () => db.select().from(adminAction).where(and(eq(adminAction.kind, 'game_replay_view'), eq(adminAction.adminId, admin.id)));

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
  admin = await person('Адмін');
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, admin.id));
  emails.add(admin.email.toLowerCase());
  other = await person('Сторонній');
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('GET /api/admin/games/:id/replay (65)', () => {
  it('the admin gets the replay and each view within a minute is one log line', async () => {
    const hostPerson = await person('Ведучий');
    const player = await person('Гравчиня');
    const { gameId } = await seedGame(db, {
      hostId: hostPerson.id,
      startedAt: new Date('2026-11-01T10:00:00Z'),
      title: 'Повтор для адміна',
      players: [
        { userId: player.id, nickname: 'Гравчиня', score: 1000, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 1000, payload: right, timeMs: 1500 }] },
        { userId: other.id, nickname: 'Сторонній', score: 0, rank: 2 },
      ],
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    const response = await get(`/api/admin/games/${gameId}/replay`, admin.cookie);
    expect(response.statusCode).toBe(200);
    const replay = response.json() as GameReplay;
    expect(replay).toMatchObject({ id: gameId, title: 'Повтор для адміна', status: 'finished', recorded: false });
    expect(replay.steps[0].question?.id).toBe(single.id);
    expect(replay.steps[0].scores).toEqual([
      { nickname: 'Гравчиня', score: 1000 },
      { nickname: 'Сторонній', score: 0 },
    ]);
    expect(response.body).not.toContain('@');
    for (const id of [player.id, other.id, hostPerson.id]) expect(response.body).not.toContain(id);

    expect((await get(`/api/admin/games/${gameId}/replay`, admin.cookie)).statusCode).toBe(200);
    const logs = await replayLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ targetUserId: hostPerson.id, details: { title: 'Повтор для адміна', code: replay.code } });

    vi.setSystemTime(new Date('2026-11-20T12:01:01Z'));
    expect((await get(`/api/admin/games/${gameId}/replay`, admin.cookie)).statusCode).toBe(200);
    expect(await replayLogs()).toHaveLength(2);
  });

  it('everyone else gets 404, a running game 409', async () => {
    const { gameId } = await seedGame(db, { hostId: other.id, startedAt: new Date('2026-11-02T10:00:00Z'), players: [{ userId: null, nickname: 'Гість', score: 0, rank: 1 }] });
    const url = `/api/admin/games/${gameId}/replay`;
    const unknown = await get('/api/nope');
    for (const response of [await get(url), await get(url, other.cookie)]) {
      expect(response.statusCode).toBe(404);
      expect(response.body).toBe(unknown.body);
    }
    expect((await get('/api/admin/games/abc/replay', admin.cookie)).statusCode).toBe(404);
    expect((await get('/api/admin/games/00000000-0000-4000-8000-000000000000/replay', admin.cookie)).statusCode).toBe(404);
    const running = await seedGame(db, { hostId: other.id, status: 'running', startedAt: new Date('2026-11-03T10:00:00Z'), players: [] });
    const response = await get(`/api/admin/games/${running.gameId}/replay`, admin.cookie);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'replay_running' });
  });
});
