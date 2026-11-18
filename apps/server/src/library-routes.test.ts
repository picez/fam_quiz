import type { LibraryCard, LibraryDetail, LibraryMine, LibraryPage, Quiz } from '@quiz/shared';
import { blitzRound, bool, classicRound, makeRoundsQuiz, multi, numeric, order, single, text } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { libraryEntry, profile, userBan, userLike, userReport } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Db = Awaited<ReturnType<typeof createTestDb>>;
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
interface Person {
  cookie: string;
  id: string;
  email: string;
  nick: string;
}

const MISSING = '99999999-9999-4999-8999-999999999999';

let ctx: Ctx;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.shutdown();
});

const call = (method: Method, url: string, cookie?: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });

async function person(name: string): Promise<Person> {
  const { cookie, email } = await signUp(ctx.app, name);
  const id = ((await call('GET', '/api/me', cookie)).json() as { id: string }).id;
  await call('GET', '/api/me/profile', cookie);
  const [row] = await db.select({ nickname: profile.nickname }).from(profile).where(eq(profile.userId, id));
  return { cookie, id, email, nick: row?.nickname ?? '' };
}

/** Шість запитань у двох раундах; відповіді («Черкаси», «Одеса», «Говерла») не мають потрапляти в каталог. */
function riversQuiz(count = 6): Quiz {
  const questions = [single, multi, bool, text, numeric, order].slice(0, count);
  const rounds = count > 4 ? [classicRound('r1', questions.slice(0, 4), { title: 'Міста' }), blitzRound('r2', questions.slice(4), { title: 'Річки' })] : [classicRound('r1', questions, { title: 'Міста' })];
  return { ...makeRoundsQuiz(rounds), title: 'Річки й міста', description: 'Про Дніпро й міста над ним' };
}

async function saveQuiz(owner: Person, count = 6): Promise<string> {
  const response = await call('POST', '/api/quizzes', owner.cookie, riversQuiz(count));
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

/** Власник відкриває вікторину; повертає id вікторини й запису. */
async function opened(owner: Person, count = 6) {
  const quizId = await saveQuiz(owner, count);
  const response = await call('PUT', `/api/library/mine/${quizId}`, owner.cookie, { language: 'uk' });
  expect(response.statusCode).toBe(200);
  return { quizId, entryId: (response.json() as { entryId: string }).entryId };
}

describe('library routes (38g)', () => {
  it('the author opens, updates, closes and appeals', async () => {
    const olena = await person('Олена');
    const stranger = await person('Тарас');
    const quizId = await saveQuiz(olena);

    expect((await call('PUT', `/api/library/mine/${quizId}`, undefined, { language: 'uk' })).statusCode).toBe(401);
    expect((await call('PUT', `/api/library/mine/${quizId}`, stranger.cookie, { language: 'uk' })).statusCode).toBe(404);
    expect((await call('PUT', `/api/library/mine/${MISSING}`, olena.cookie, { language: 'uk' })).statusCode).toBe(404);
    expect((await call('PUT', `/api/library/mine/${quizId}`, olena.cookie, { language: 'ru' })).statusCode).toBe(400);
    const few = await saveQuiz(olena, 4);
    const refused = await call('PUT', `/api/library/mine/${few}`, olena.cookie, { language: 'uk' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'library_too_few' });

    const open = await call('PUT', `/api/library/mine/${quizId}`, olena.cookie, { language: 'uk' });
    expect(open.statusCode).toBe(200);
    const { entryId } = open.json() as { entryId: string };
    const again = await call('PUT', `/api/library/mine/${quizId}`, olena.cookie, { language: 'en' });
    expect((again.json() as { entryId: string }).entryId).toBe(entryId);

    expect((await call('GET', '/api/library/mine')).statusCode).toBe(401);
    expect((await call('GET', '/api/library/mine', stranger.cookie)).json()).toEqual([]);
    const mine = (await call('GET', '/api/library/mine', olena.cookie)).json() as LibraryMine[];
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ quizId, entryId, listed: true, moderation: 'ok', appealed: false, appealOpen: false, language: 'en', likes: 0, plays: 0 });

    expect((await call('POST', `/api/library/mine/${quizId}/appeal`, olena.cookie)).json()).toEqual({ error: 'library_not_hidden' });
    expect((await call('POST', `/api/library/mine/${quizId}/appeal`, stranger.cookie)).statusCode).toBe(404);
    expect((await call('POST', `/api/library/mine/${quizId}/appeal`)).statusCode).toBe(401);

    await db.update(libraryEntry).set({ moderation: 'hidden' }).where(eq(libraryEntry.id, entryId));
    expect((await call('PUT', `/api/library/mine/${quizId}`, olena.cookie, { language: 'uk' })).json()).toEqual({ error: 'library_hidden' });
    expect((await call('POST', `/api/library/mine/${quizId}/appeal`, olena.cookie)).statusCode).toBe(204);
    expect((await call('POST', `/api/library/mine/${quizId}/appeal`, olena.cookie)).json()).toEqual({ error: 'library_appeal_used' });
    await db.update(libraryEntry).set({ moderation: 'ok' }).where(eq(libraryEntry.id, entryId));

    expect((await call('GET', '/api/library')).json<LibraryPage>().items.map((i) => i.id)).toContain(entryId);
    expect((await call('DELETE', `/api/library/mine/${quizId}`, stranger.cookie)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/library/mine/${quizId}`)).statusCode).toBe(401);
    expect((await call('DELETE', `/api/library/mine/${quizId}`, olena.cookie)).statusCode).toBe(204);
    expect((await call('GET', '/api/library')).json<LibraryPage>().items.map((i) => i.id)).not.toContain(entryId);
    expect((await call('GET', '/api/library/mine', olena.cookie)).json<LibraryMine[]>()[0]).toMatchObject({ listed: false });
  });

  it('guests browse, the catalog never has answers', async () => {
    const olena = await person('Олена');
    const { entryId } = await opened(olena);

    const listing = await call('GET', '/api/library?sort=new&lang=uk');
    expect(listing.statusCode).toBe(200);
    const page = listing.json<LibraryPage>();
    const card = page.items.find((i) => i.id === entryId) as LibraryCard;
    expect(card).toMatchObject({ title: 'Річки й міста', author: olena.nick, questionCount: 6, roundTypes: ['classic', 'blitz'], language: 'uk' });
    expect(card.liked).toBeUndefined();
    expect(card.mine).toBeUndefined();

    const detailResponse = await call('GET', `/api/library/${entryId}`);
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json<LibraryDetail>().rounds).toEqual([
      { title: 'Міста', type: 'classic' },
      { title: 'Річки', type: 'blitz' },
    ]);
    expect((await call('GET', `/api/library/${MISSING}`)).statusCode).toBe(404);
    expect((await call('GET', '/api/library/not-a-uuid')).statusCode).toBe(404);

    // Ні запитань, ні варіантів, ні відповідей, ні пошти й id автора.
    for (const body of [listing.body, detailResponse.body]) {
      for (const secret of ['Столиця України', 'Які з цих міст', 'Черкаси', 'Одеса', 'Говерла', 'Харків', olena.id, olena.email, 'ownerId', 'quizId', 'accepted', 'correct']) {
        expect(body).not.toContain(secret);
      }
    }

    expect((await call('GET', '/api/library?sort=top')).statusCode).toBe(400);
    expect((await call('GET', '/api/library?lang=ru')).json()).toEqual({ error: 'invalid_payload' });
    // Невідомі параметри (мітки, кеш-бастери) не ламають каталог.
    expect((await call('GET', '/api/library?utm_source=x&_=123')).statusCode).toBe(200);

    const asOwner = (await call('GET', `/api/library/${entryId}`, olena.cookie)).json<LibraryDetail>();
    expect(asOwner).toMatchObject({ mine: true, liked: false });
    const filtered = (await call('GET', '/api/library?q=%D0%A0%D1%96%D1%87%D0%BA%D0%B8&lang=en')).json<LibraryPage>();
    expect(filtered.items).toHaveLength(0);
  });

  it('likes need an account and count once', async () => {
    const olena = await person('Олена');
    const taras = await person('Тарас');
    const iryna = await person('Ірина');
    const { entryId, quizId } = await opened(olena);
    const url = `/api/library/${entryId}/like`;

    expect((await call('PUT', url, undefined, { liked: true })).statusCode).toBe(401);
    expect((await call('PUT', url, taras.cookie, { liked: 'yes' })).statusCode).toBe(400);
    expect((await call('PUT', `/api/library/${MISSING}/like`, taras.cookie, { liked: true })).statusCode).toBe(404);

    expect((await call('PUT', url, taras.cookie, { liked: true })).json()).toEqual({ likes: 1, liked: true });
    expect((await call('PUT', url, taras.cookie, { liked: true })).json()).toEqual({ likes: 1, liked: true });
    // ❤️ з фінального екрана гри — той самий лічильник.
    await db.insert(userLike).values({ userId: iryna.id, kind: 'quiz', targetUserId: olena.id, quizId, gameId: MISSING, hidden: false, createdAt: new Date() });
    expect((await call('PUT', url, iryna.cookie, { liked: true })).json()).toEqual({ likes: 2, liked: true });
    expect((await call('GET', `/api/library/${entryId}`, taras.cookie)).json<LibraryDetail>()).toMatchObject({ likes: 2, liked: true });
    expect((await call('PUT', url, taras.cookie, { liked: false })).json()).toEqual({ likes: 1, liked: false });
    expect((await call('PUT', url, olena.cookie, { liked: true })).json()).toEqual({ likes: 1, liked: false });

    await db.update(libraryEntry).set({ moderation: 'hidden' }).where(eq(libraryEntry.id, entryId));
    expect((await call('PUT', url, taras.cookie, { liked: true })).statusCode).toBe(404);
    await db.update(libraryEntry).set({ moderation: 'ok' }).where(eq(libraryEntry.id, entryId));

    const fan = await person('Фанат');
    let last = 0;
    for (let i = 0; i < 31; i += 1) last = (await call('PUT', url, fan.cookie, { liked: i % 2 === 0 })).statusCode;
    expect(last).toBe(429);
  });

  it('copy needs an account', async () => {
    const olena = await person('Олена');
    const taras = await person('Тарас');
    const { entryId } = await opened(olena);
    const url = `/api/library/${entryId}/copy`;

    expect((await call('POST', url, undefined, { locale: 'uk' })).statusCode).toBe(401);
    expect((await call('POST', url, taras.cookie, { locale: 'ru' })).statusCode).toBe(400);
    expect((await call('POST', url, taras.cookie, {})).statusCode).toBe(400);
    expect((await call('POST', url, olena.cookie, { locale: 'uk' })).json()).toEqual({ error: 'library_own' });
    expect((await call('POST', `/api/library/${MISSING}/copy`, taras.cookie, { locale: 'uk' })).statusCode).toBe(404);

    const copied = await call('POST', url, taras.cookie, { locale: 'uk' });
    expect(copied.statusCode).toBe(201);
    const { id } = copied.json() as { id: string };
    const full = (await call('GET', `/api/quizzes/${id}`, taras.cookie)).json() as Quiz;
    expect(full.title).toBe('Річки й міста');
    expect(full.description).toBe(`Автор: ${olena.nick}\nПро Дніпро й міста над ним`);
    expect(full.rounds.flatMap((r) => ('questions' in r ? r.questions : []))).toHaveLength(6);
    expect(JSON.stringify(full)).toContain('Черкаси');

    const english = await call('POST', url, taras.cookie, { locale: 'en' });
    const enCopy = (await call('GET', `/api/quizzes/${(english.json() as { id: string }).id}`, taras.cookie)).json() as Quiz;
    expect(enCopy.description).toBe(`Author: ${olena.nick}\nПро Дніпро й міста над ним`);

    await db.update(libraryEntry).set({ moderation: 'auto_hidden' }).where(eq(libraryEntry.id, entryId));
    expect((await call('POST', url, taras.cookie, { locale: 'uk' })).statusCode).toBe(404);
    await db.update(libraryEntry).set({ moderation: 'ok' }).where(eq(libraryEntry.id, entryId));

    const hoarder = await person('Збирач');
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) codes.push((await call('POST', url, hoarder.cookie, { locale: 'uk' })).statusCode);
    expect(codes.slice(0, 10).every((code) => code === 201)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('closed and held entries never leak: like and copy of a closed one, detail of an auto-hidden one', async () => {
    const olena = await person('Олена');
    const taras = await person('Тарас');
    const { entryId, quizId } = await opened(olena);
    expect((await call('DELETE', `/api/library/mine/${quizId}`, olena.cookie)).statusCode).toBe(204);
    expect((await call('PUT', `/api/library/${entryId}/like`, taras.cookie, { liked: true })).statusCode).toBe(404);
    expect((await call('POST', `/api/library/${entryId}/copy`, taras.cookie, { locale: 'uk' })).statusCode).toBe(404);
    expect((await call('GET', `/api/library/${entryId}`, taras.cookie)).statusCode).toBe(404);

    await db.update(libraryEntry).set({ listed: true, moderation: 'auto_hidden' }).where(eq(libraryEntry.id, entryId));
    for (const cookie of [undefined, olena.cookie, taras.cookie]) {
      const response = await call('GET', `/api/library/${entryId}`, cookie);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found' });
    }
  });

  it('a snapshot that no longer parses gives 409 on copy, not 500', async () => {
    const olena = await person('Олена');
    const taras = await person('Тарас');
    const { entryId } = await opened(olena);
    await db.update(libraryEntry).set({ snapshot: { title: 'Зламаний', rounds: 'ні' } }).where(eq(libraryEntry.id, entryId));
    const response = await call('POST', `/api/library/${entryId}/copy`, taras.cookie, { locale: 'uk' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'library_invalid' });
  });

  it('the like count leaves out banned accounts', async () => {
    const olena = await person('Олена');
    const taras = await person('Тарас');
    const iryna = await person('Ірина');
    const { entryId, quizId } = await opened(olena);
    await db.insert(userLike).values({ userId: iryna.id, kind: 'quiz', targetUserId: olena.id, quizId, gameId: null, hidden: false, createdAt: new Date() });
    await db.insert(userBan).values({ userId: iryna.id, reason: null, bannedBy: null, bannedAt: new Date() });
    expect((await call('PUT', `/api/library/${entryId}/like`, taras.cookie, { liked: true })).json()).toEqual({ likes: 1, liked: true });
  });

  it('banned author disappears', async () => {
    const olena = await person('Олена');
    const { entryId } = await opened(olena);
    expect((await call('GET', '/api/library')).json<LibraryPage>().items.map((i) => i.id)).toContain(entryId);
    await db.insert(userBan).values({ userId: olena.id, reason: null, bannedBy: null, bannedAt: new Date() });
    expect((await call('GET', '/api/library')).json<LibraryPage>().items.map((i) => i.id)).not.toContain(entryId);
    expect((await call('GET', `/api/library/${entryId}`)).statusCode).toBe(404);
  });

  it('reports need an account and are rate-limited', async () => {
    const olena = await person('Олена');
    const taras = await person('Тарас');
    const { entryId } = await opened(olena);
    const body = { target: { kind: 'quiz', entryId }, reason: 'spam' };
    expect((await call('POST', '/api/reports', undefined, body)).statusCode).toBe(401);
    expect((await call('POST', '/api/reports', taras.cookie, { ...body, reason: 'ugly' })).statusCode).toBe(400);
    const sent = await call('POST', '/api/reports', taras.cookie, { ...body, text: '  нісенітниця  ' });
    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toEqual({ ok: true });
    const [stored] = await db.select({ text: userReport.text }).from(userReport).where(eq(userReport.reporterId, taras.id));
    expect(stored?.text).toBe('нісенітниця');
    const again = await call('POST', '/api/reports', taras.cookie, body);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'already_reported' });
    const self = await call('POST', '/api/reports', olena.cookie, body);
    expect(self.statusCode).toBe(409);
    expect(self.json()).toEqual({ error: 'cannot_report_self' });
    // Тарас уже зробив 3 запити за хвилину; 4-й і 5-й доходять до логіки, 6-й — 429 (ліміт 5/хв).
    expect((await call('POST', '/api/reports', taras.cookie, { target: { kind: 'profile', userId: olena.id }, reason: 'other' })).statusCode).toBe(201);
    expect((await call('POST', '/api/reports', taras.cookie, body)).statusCode).toBe(409);
    expect((await call('POST', '/api/reports', taras.cookie, body)).statusCode).toBe(429);
  });
});
