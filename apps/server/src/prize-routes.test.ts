import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { EMPTY_DECOR, STICKERS, xpForLevel } from '@quiz/shared';
import type { PrizeContent, PrizeItem, PrizePlacesInfo, TrophyDecor } from '@quiz/shared';
import { buildApp } from './app';
import type { Db } from './db/client';
import { game, user, xpEntry } from './db/schema';
import { createPrize } from './prizes';
import { TEST_AUTH, signUp, startGame } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});
afterAll(async () => {
  await ctx.app.close();
});

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });

const content = (name: string, extra: Partial<PrizeContent> = {}): PrizeContent => ({
  name,
  trophy: { kind: 'cup', material: 'gold' },
  engraving: null,
  real: null,
  title: null,
  diploma: false,
  ...extra,
});
const quiz = () => makeRoundsQuiz([classicRound('r0', [single, withId(single, 'q2')], { speedBonus: false })]);

async function newPrize(cookie: string, name: string, extra: Partial<PrizeContent> = {}) {
  const response = await call('POST', '/api/me/prizes', cookie, content(name, extra));
  expect(response.statusCode).toBe(201);
  return response.json() as PrizeItem;
}
const stage = (code: string) => ctx.manager.view(ctx.manager.get(code)!, { role: 'stage', playerId: null })!;
const placesOf = (code: string) => (stage(code).prizes?.places ?? []).map((p) => p.place);

async function joinPlayer(code: string, nickname: string): Promise<string> {
  const response = await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname });
  const { playerId } = response.json() as { playerId: string };
  ctx.manager.connect(ctx.manager.get(code)!, { role: 'player', playerId });
  return playerId;
}

describe('the store of prizes (14a)', () => {
  it('creates, lists, renames and deletes a prize of the owner', async () => {
    const { cookie } = await signUp(ctx.app, 'Склад');
    const made = await newPrize(cookie, 'Кубок');
    expect(made.status).toBe('free');
    expect(((await call('GET', '/api/me/prizes', cookie)).json() as PrizeItem[]).map((p) => p.id)).toEqual([made.id]);

    const renamed = await call('PUT', `/api/me/prizes/${made.id}`, cookie, content('Великий кубок'));
    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as PrizeItem).content.name).toBe('Великий кубок');

    expect((await call('DELETE', `/api/me/prizes/${made.id}`, cookie)).statusCode).toBe(204);
    expect((await call('GET', '/api/me/prizes', cookie)).json()).toEqual([]);
  });

  it('hides a prize of another account, wants a sign-in and checks the body', async () => {
    const owner = await signUp(ctx.app, 'Власник');
    const other = await signUp(ctx.app, 'Чужий');
    const made = await newPrize(owner.cookie, 'Кубок');
    expect((await call('PUT', `/api/me/prizes/${made.id}`, other.cookie, content('Ой'))).statusCode).toBe(404);
    expect((await call('DELETE', `/api/me/prizes/${made.id}`, other.cookie)).statusCode).toBe(404);
    expect((await call('DELETE', '/api/me/prizes/not-a-uuid', owner.cookie)).statusCode).toBe(404);
    expect((await call('GET', '/api/me/prizes')).statusCode).toBe(401);
    expect((await call('POST', '/api/me/prizes', undefined, content('x'))).statusCode).toBe(401);
    const empty = await call('POST', '/api/me/prizes', owner.cookie, { ...content('Пусто'), trophy: null, engraving: null, real: null, title: null, diploma: false });
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toEqual({ error: 'invalid_payload' });
  });

  it('the grail can be made and chosen', async () => {
    const { cookie } = await signUp(ctx.app, 'Грааль');
    const grail = content('Грааль', { trophy: { kind: 'grail', material: 'gold' } });
    const made = await call('POST', '/api/me/prizes', cookie, grail);
    expect(made.statusCode).toBe(201);
    expect((made.json() as PrizeItem).content.trophy?.decor).toEqual(EMPTY_DECOR);

    const cup = await newPrize(cookie, 'Кубок');
    const switched = await call('PUT', `/api/me/prizes/${cup.id}`, cookie, grail);
    expect(switched.statusCode).toBe(200);
  });

  it('a new grail always has decor', async () => {
    const { cookie } = await signUp(ctx.app, 'Грааль завжди');
    const grail = content('Грааль', { trophy: { kind: 'grail', material: 'gold', decor: null } });
    const made = await call('POST', '/api/me/prizes', cookie, grail);
    expect(made.statusCode).toBe(201);
    expect((made.json() as PrizeItem).content.trophy?.decor).toEqual(EMPTY_DECOR);
    const id = (made.json() as PrizeItem).id;
    const put = await call('PUT', `/api/me/prizes/${id}`, cookie, grail);
    expect(put.statusCode).toBe(200);
    expect((put.json() as PrizeItem).content.trophy?.decor).toEqual(EMPTY_DECOR);
    // Без ключа decor лишається збережений напис.
    const text = { ...EMPTY_DECOR, inscriptions: [{ place: 'rim' as const, text: 'Ася', font: null, look: 'engraved' as const, color: '#3a2a0e' }] };
    await call('PUT', `/api/me/prizes/${id}`, cookie, content('Грааль', { trophy: { kind: 'grail', material: 'gold', decor: text } }));
    const kept = await call('PUT', `/api/me/prizes/${id}`, cookie, content('Грааль 2', { trophy: { kind: 'grail', material: 'gold' } }));
    expect((kept.json() as PrizeItem).content.trophy?.decor).toEqual(text);
  });
});

describe('trophy decor over HTTP (25a)', () => {
  const photo = (n: number) => ({ url: `/uploads/${n.toString(16).padStart(32, '0')}.jpg`, crop: { x: 0.5, y: 0.5, scale: 1 } });
  const decor: TrophyDecor = {
    photos: [photo(1), photo(2)],
    photoPlace: 'ring',
    frame: 'none',
    photoStyle: 'normal',
    inscriptions: [{ place: 'rim', text: 'Для найкращих', font: null, look: 'engraved', color: '#3a2a0e' }],
    effect: { kind: 'none' },
    appearance: 'spin',
    stickers: [],
  };

  it('stores a valid decor and returns it from POST and GET', async () => {
    const { cookie } = await signUp(ctx.app, 'Оформлення');
    const response = await call('POST', '/api/me/prizes', cookie, content('Кубок', { trophy: { kind: 'cup', material: 'gold', decor } }));
    expect(response.statusCode).toBe(201);
    expect((response.json() as PrizeItem).content.trophy?.decor).toEqual(decor);
    const listed = (await call('GET', '/api/me/prizes', cookie)).json() as PrizeItem[];
    expect(listed[0]!.content.trophy?.decor).toEqual(decor);
  });

  it('refuses 17 photos on the ring', async () => {
    const { cookie } = await signUp(ctx.app, 'Багато');
    const many = { ...decor, photos: Array.from({ length: 17 }, (_, i) => photo(i + 1)) };
    const response = await call('POST', '/api/me/prizes', cookie, content('Кубок', { trophy: { kind: 'cup', material: 'gold', decor: many } }));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_payload' });
  });

  it('keeps the decor of a seeded grail when an old client renames it', async () => {
    const { cookie, email } = await signUp(ctx.app, 'Ясин грааль');
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    const seeded = await createPrize(db, owner!.id, content('Грааль', { trophy: { kind: 'grail', material: 'gold', decor } }));
    if (!seeded.ok) throw new Error('seed failed');
    const renamed = await call('PUT', `/api/me/prizes/${seeded.prize.id}`, cookie, content('Наш Ґрааль', { trophy: { kind: 'grail', material: 'gold' } }));
    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as PrizeItem).content.trophy).toEqual({ kind: 'grail', material: 'gold', decor });
  });
});

describe('prizes of a lobby (14a)', () => {
  it('places prizes, shows them on the stage, and refuses a player, a start and duplicates', async () => {
    const { cookie } = await signUp(ctx.app, 'Ведуча');
    const a = await newPrize(cookie, 'Перший');
    const b = await newPrize(cookie, 'Третій');
    const { game: g } = await startGame(ctx.app, quiz(), cookie);

    const info = await call('GET', `/api/games/by-code/${g.code}/prizes`, cookie);
    expect((info.json() as PrizePlacesInfo).places).toEqual([null, null, null]);
    expect((info.json() as PrizePlacesInfo).options.map((o) => o.id).sort()).toEqual([a.id, b.id].sort());

    const put = await call('PUT', `/api/games/by-code/${g.code}/prizes`, cookie, { places: [a.id, null, b.id] });
    expect(put.statusCode).toBe(200);
    expect((put.json() as PrizePlacesInfo).places).toEqual([a.id, null, b.id]);
    expect(placesOf(g.code)).toEqual([1, 3]);

    // Той самий приз на двох місцях: prize_twice зі схеми → 400.
    const twice = await call('PUT', `/api/games/by-code/${g.code}/prizes`, cookie, { places: [a.id, a.id, null] });
    expect(twice.statusCode).toBe(400);
    expect(twice.json()).toEqual({ error: 'invalid_payload' });
    expect(placesOf(g.code)).toEqual([1, 3]);

    // Без входу й чужа людина: кімнати для них немає.
    expect((await call('PUT', `/api/games/by-code/${g.code}/prizes`, undefined, { places: [a.id, null, null] })).statusCode).toBe(401);
    const stranger = await signUp(ctx.app, 'Чужа');
    expect((await call('PUT', `/api/games/by-code/${g.code}/prizes`, stranger.cookie, { places: [a.id, null, null] })).statusCode).toBe(404);
    expect((await call('GET', `/api/games/by-code/${g.code}/prizes`, stranger.cookie)).statusCode).toBe(404);

    // Другий приз у другій кімнаті того ж ведучого: prize_taken, перша кімната нічого не втрачає.
    const second = await startGame(ctx.app, quiz(), cookie);
    const taken = await call('PUT', `/api/games/by-code/${second.game.code}/prizes`, cookie, { places: [a.id, null, null] });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: 'prize_taken' });
    expect(placesOf(g.code)).toEqual([1, 3]);

    // Старт гри: місця змінювати вже не можна.
    await joinPlayer(g.code, 'Оля');
    expect(ctx.manager.host(ctx.manager.get(g.code)!, { type: 'start' })).toEqual({ ok: true });
    const late = await call('PUT', `/api/games/by-code/${g.code}/prizes`, cookie, { places: [null, null, null] });
    expect(late.statusCode).toBe(409);
    expect(late.json()).toEqual({ error: 'wrong_phase' });
    expect(placesOf(g.code)).toEqual([1, 3]);
  });

  it('takes a deleted prize off its place in a lobby, and keeps it in a started game', async () => {
    const { cookie } = await signUp(ctx.app, 'Видаляє');
    const a = await newPrize(cookie, 'Перший');
    const b = await newPrize(cookie, 'Другий');
    const { game: g } = await startGame(ctx.app, quiz(), cookie);
    await call('PUT', `/api/games/by-code/${g.code}/prizes`, cookie, { places: [a.id, b.id, null] });

    const edit = await call('PUT', `/api/me/prizes/${a.id}`, cookie, content('Інакше'));
    expect(edit.statusCode).toBe(409);
    expect(edit.json()).toEqual({ error: 'prize_in_game' });

    expect((await call('DELETE', `/api/me/prizes/${a.id}`, cookie)).statusCode).toBe(204);
    expect(placesOf(g.code)).toEqual([2]);

    await joinPlayer(g.code, 'Оля');
    expect(ctx.manager.host(ctx.manager.get(g.code)!, { type: 'start' })).toEqual({ ok: true });
    const blocked = await call('DELETE', `/api/me/prizes/${b.id}`, cookie);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ error: 'prize_in_game' });
    expect(placesOf(g.code)).toEqual([2]);
  });

  it('lets the author of an autopilot room place prizes', async () => {
    const { cookie } = await signUp(ctx.app, 'Автор');
    const a = await newPrize(cookie, 'Автопризи');
    const saved = await call('POST', '/api/quizzes', cookie, quiz());
    const { id: quizId } = saved.json() as { id: string };
    const created = await call('POST', '/api/games', cookie, { quizId, autopilot: true, nickname: 'Автор' });
    expect(created.statusCode).toBe(201);
    const { code } = created.json() as { code: string };
    const put = await call('PUT', `/api/games/by-code/${code}/prizes`, cookie, { places: [a.id, null, null] });
    expect(put.statusCode).toBe(200);
    expect(placesOf(code)).toEqual([1]);
  });

  it('marks a prize that waits in a saved game', async () => {
    const { cookie } = await signUp(ctx.app, 'Зберігає');
    const a = await newPrize(cookie, 'Чекає');
    const { game: g } = await startGame(ctx.app, quiz(), cookie);
    await call('PUT', `/api/games/by-code/${g.code}/prizes`, cookie, { places: [a.id, null, null] });
    let item = ((await call('GET', '/api/me/prizes', cookie)).json() as PrizeItem[])[0]!;
    expect(item.status).toBe('reserved');
    expect(item.inSavedGame).toBeUndefined();
    // Рядок гри з'являється, коли гра стартує.
    await joinPlayer(g.code, 'Оля');
    expect(ctx.manager.host(ctx.manager.get(g.code)!, { type: 'start' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    await db.update(game).set({ status: 'saved' }).where(eq(game.id, g.gameId));
    item = ((await call('GET', '/api/me/prizes', cookie)).json() as PrizeItem[])[0]!;
    expect(item).toMatchObject({ id: a.id, status: 'reserved', inSavedGame: true });
  });

  it('applies overlapping PUTs of the places in order, even when the first one waits longer for the base', async () => {
    // Окремий застосунок на тій самій базі: перша транзакція після «armed» чекає 50 мс, наступні — ні.
    let armed = false;
    const slowDb = new Proxy(db, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver) as unknown;
        if (key !== 'transaction' || typeof value !== 'function') return value;
        return async (...args: unknown[]) => {
          if (armed) {
            armed = false;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    const slow = await buildApp({ db: slowDb, auth: TEST_AUTH });
    try {
      const put = (cookie: string, code: string, places: (string | null)[]) =>
        slow.app.inject({ method: 'PUT', url: `/api/games/by-code/${code}/prizes`, payload: { places }, headers: { cookie } });
      const { cookie } = await signUp(slow.app, 'Поспішає');
      const make = async (name: string) => (await slow.app.inject({ method: 'POST', url: '/api/me/prizes', payload: content(name), headers: { cookie } })).json() as PrizeItem;
      const a = await make('Перший');
      const b = await make('Другий');
      const { game: g } = await startGame(slow.app, quiz(), cookie);
      armed = true;
      const [first, second] = await Promise.all([put(cookie, g.code, [a.id, null, null]), put(cookie, g.code, [null, null, b.id])]);
      expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
      expect((first.json() as PrizePlacesInfo).places).toEqual([a.id, null, null]);
      expect((second.json() as PrizePlacesInfo).places).toEqual([null, null, b.id]);
      const room = slow.manager.get(g.code)!;
      expect(room.prizes.map((p) => [p.place, p.id])).toEqual([[3, b.id]]);
      const items = (await slow.app.inject({ method: 'GET', url: '/api/me/prizes', headers: { cookie } })).json() as PrizeItem[];
      expect(Object.fromEntries(items.map((item) => [item.id, item.status]))).toEqual({ [a.id]: 'free', [b.id]: 'reserved' });
    } finally {
      await slow.app.close();
    }
  });
});

describe('level locks over HTTP (25c)', () => {
  const withFont = (font: string | null, place = 'rim'): TrophyDecor =>
    ({ ...EMPTY_DECOR, inscriptions: [{ place, text: 'Ася', font, look: 'engraved', color: '#3a2a0e' }] }) as TrophyDecor;
  const prizeWith = (name: string, decor: TrophyDecor) => content(name, { trophy: { kind: 'cup', material: 'gold', decor } });
  const stickerOf = (series: string) => STICKERS.find((s) => s.series === series)!.id;
  const ownerId = async (email: string) => (await db.select({ id: user.id }).from(user).where(eq(user.email, email)))[0]!.id;

  it('a locked font or sticker is refused', async () => {
    const { cookie } = await signUp(ctx.app, 'Закрите');
    const mono = await call('POST', '/api/me/prizes', cookie, prizeWith('A', withFont('mono')));
    expect(mono.statusCode).toBe(409);
    expect(mono.json()).toEqual({ error: 'decor_locked' });
    expect((await call('POST', '/api/me/prizes', cookie, prizeWith('B', withFont('hand')))).statusCode).toBe(201);
    const sticker = { ...EMPTY_DECOR, stickers: [{ id: stickerOf('nyaa'), place: 'front' as const }] };
    expect((await call('POST', '/api/me/prizes', cookie, prizeWith('C', sticker))).statusCode).toBe(409);
  });

  it('level unlocks', async () => {
    const { cookie, email } = await signUp(ctx.app, 'Рівень');
    const userId = await ownerId(email);
    const at = new Date('2026-10-22T10:00:00Z');
    await db.insert(xpEntry).values({ userId, source: 'game', amount: xpForLevel(3), counted: true, day: '2026-10-22', at, createdAt: at });
    expect((await call('POST', '/api/me/prizes', cookie, prizeWith('A', withFont('mono')))).statusCode).toBe(201);
  });

  it('a stored font stays valid', async () => {
    const { cookie, email } = await signUp(ctx.app, 'Збережений');
    const userId = await ownerId(email);
    const seeded = await createPrize(db, userId, prizeWith('Старий', withFont('heavy')));
    if (!seeded.ok) throw new Error('seed failed');
    const url = `/api/me/prizes/${seeded.prize.id}`;
    expect((await call('PUT', url, cookie, prizeWith('Нова назва', withFont('heavy')))).statusCode).toBe(200);
    expect((await call('PUT', url, cookie, prizeWith('Інше місце', withFont('heavy', 'band')))).statusCode).toBe(200);
    const added = { ...withFont('heavy', 'band'), inscriptions: [...withFont('heavy', 'band').inscriptions, { place: 'rim' as const, text: 'Ще', font: 'pixel' as const, look: 'engraved' as const, color: '#3a2a0e' }] };
    expect((await call('PUT', url, cookie, prizeWith('Піксель', added))).statusCode).toBe(409);
  });

  it('an old client keeps decor', async () => {
    const { cookie, email } = await signUp(ctx.app, 'Старий клієнт');
    const userId = await ownerId(email);
    const decor = withFont('heavy');
    const seeded = await createPrize(db, userId, prizeWith('Старий', decor));
    if (!seeded.ok) throw new Error('seed failed');
    const put = await call('PUT', `/api/me/prizes/${seeded.prize.id}`, cookie, content('Нова', { trophy: { kind: 'cup', material: 'silver' } }));
    expect(put.statusCode).toBe(200);
    expect((put.json() as PrizeItem).content.trophy).toEqual({ kind: 'cup', material: 'silver', decor });
  });
});
