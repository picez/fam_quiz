import type { AdminList, AdminProblemReport, AdminProblemsBadge, AdminServerError, InboxPage, MyProblemReport, PushPayload } from '@quiz/shared';
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { adminAction, inboxItem, problemReport, profile, user } from './db/schema';
import { makeQuiz } from '@quiz/engine/testing';
import { appealEntry, openEntry } from './library-store';
import { reportError } from './log';
import { createQuiz } from './quizzes';
import { actOnQuiz, fileReport } from './report-store';
import { ensureProfile } from './profiles';
import { saveSubscription } from './push-store';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'POST';

const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: 'BP', auth: 'a' } });
const call = (ctx: Ctx, method: Method, url: string, cookie?: string, payload?: unknown, ip?: string) =>
  ctx.app.inject({ method, url, payload: payload as object, headers: { ...(cookie === undefined ? {} : { cookie }), ...(ip === undefined ? {} : { 'x-forwarded-for': ip }) } });
let hop = 0;
const fresh = () => `10.65.${(hop += 1)}.1`;

describe('admin errors and problem reports (64)', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let ctx: Ctx;
  let admin: { cookie: string; id: string };
  const sent: PushPayload[] = [];
  const emails = new Set<string>();

  async function person(name: string) {
    const signed = await signUp(ctx.app, name);
    const me = (await call(ctx, 'GET', '/api/me', signed.cookie)).json() as { id: string };
    return { ...signed, id: me.id };
  }
  const report = async (text: string, cookie?: string) => {
    const response = await call(ctx, 'POST', '/api/problem-reports', cookie, { text, page: null }, fresh());
    expect(response.statusCode).toBe(201);
    return (response.json() as { id: string }).id;
  };
  const lastLog = async () => (await db.select().from(adminAction).orderBy(desc(adminAction.at), desc(adminAction.id)).limit(1))[0];

  beforeAll(async () => {
    db = await createTestDb();
    const send = vi.fn(async (_target: { endpoint: string }, body: string) => {
      sent.push(JSON.parse(body) as PushPayload);
      return { status: 201 };
    });
    ctx = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails, trustProxy: true, push: { publicKey: 'BPublicKey', send } });
    const a = await person('Адмін');
    emails.add(a.email.toLowerCase());
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, a.id));
    admin = a;
  });
  afterAll(async () => {
    await ctx.shutdown();
  });

  it('errors list, filter and resolve', async () => {
    reportError(new Error('перша біда'), { where: 'test-a' });
    reportError(new Error('друга біда'), { where: 'test-b' });
    await ctx.errors!.flush();
    const all = (await call(ctx, 'GET', '/api/admin/errors', admin.cookie)).json() as AdminList<AdminServerError>;
    expect(all.rows).toHaveLength(2);
    expect(((await call(ctx, 'GET', '/api/admin/problems/badge', admin.cookie)).json() as AdminProblemsBadge).errors).toBe(2);
    const id = all.rows[0].id;
    const done = await call(ctx, 'POST', `/api/admin/errors/${id}/resolve`, admin.cookie, {});
    expect(done.statusCode).toBe(200);
    expect(await lastLog()).toMatchObject({ kind: 'server_error_resolve' });
    const resolved = (await call(ctx, 'GET', '/api/admin/errors?status=resolved', admin.cookie)).json() as AdminList<AdminServerError>;
    expect(resolved.rows).toHaveLength(1);
    expect(resolved.rows[0]).toMatchObject({ id, status: 'resolved', resolvedBy: 'Адмін' });
    expect(((await call(ctx, 'GET', '/api/admin/problems/badge', admin.cookie)).json() as AdminProblemsBadge).errors).toBe(1);
    expect((await call(ctx, 'POST', '/api/admin/errors/6f1c9b0e-1111-4111-8111-111111111111/resolve', admin.cookie, {})).statusCode).toBe(404);
    expect((await call(ctx, 'POST', '/api/admin/errors/abc/resolve', admin.cookie, {})).statusCode).toBe(404);
  });

  it('reports: who, resolve, reply by push', async () => {
    const olya = await person('Оля');
    const petro = await person('Петро');
    await saveSubscription(db, olya.id, sub('olya'), new Date());
    const guestId = await report('гість скаржиться');
    const olyaId = await report('Оля скаржиться', olya.cookie);
    await report('Петро скаржиться', petro.cookie);
    await db.delete(user).where(eq(user.id, petro.id));

    const listed = (await call(ctx, 'GET', '/api/admin/problems', admin.cookie)).json() as AdminList<AdminProblemReport>;
    const byText = (text: string) => listed.rows.find((r) => r.text === text)!;
    expect(byText('гість скаржиться').who).toEqual({ kind: 'guest' });
    expect(byText('Оля скаржиться').who).toEqual({ kind: 'account', id: olya.id, nickname: 'Оля', push: true });
    expect(byText('Петро скаржиться').who).toEqual({ kind: 'deleted' });
    expect(((await call(ctx, 'GET', '/api/admin/problems/badge', admin.cookie)).json() as AdminProblemsBadge).reports).toBe(3);

    const replied = await call(ctx, 'POST', `/api/admin/problems/${olyaId}/reply`, admin.cookie, { text: 'Виправили, дякуємо!' });
    expect(replied.statusCode).toBe(200);
    expect(replied.json()).toEqual({ pushed: true, inbox: true });
    await ctx.push!.idle();
    expect(sent).toContainEqual({ kind: 'problem_reply', reportId: olyaId, text: 'Виправили, дякуємо!', locale: 'uk' });
    const [row] = await db.select().from(problemReport).where(eq(problemReport.id, olyaId));
    expect(row).toMatchObject({ status: 'resolved', reply: 'Виправили, дякуємо!' });
    expect(await lastLog()).toMatchObject({ kind: 'problem_reply', targetUserId: olya.id, details: { text: 'Виправили, дякуємо!' } });
    const again = await call(ctx, 'POST', `/api/admin/problems/${olyaId}/reply`, admin.cookie, { text: 'ще раз' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'problem_replied' });
    // 70: відповідь — один рядок у «Вхідних» Олі, повтор другого не додає.
    expect((await db.select().from(inboxItem).where(eq(inboxItem.problemId, olyaId))).map((r) => [r.userId, r.kind, r.readAt])).toEqual([[olya.id, 'problem_reply', null]]);
    const toGuest = await call(ctx, 'POST', `/api/admin/problems/${guestId}/reply`, admin.cookie, { text: 'привіт' });
    expect(toGuest.statusCode).toBe(409);
    expect(toGuest.json()).toEqual({ error: 'problem_no_account' });
    expect((await call(ctx, 'POST', `/api/admin/problems/${guestId}/reply`, admin.cookie, { text: '' })).statusCode).toBe(400);

    expect((await call(ctx, 'POST', `/api/admin/problems/${guestId}/resolve`, admin.cookie, {})).statusCode).toBe(200);
    expect(await lastLog()).toMatchObject({ kind: 'problem_resolve', details: { text: 'гість скаржиться' } });
    expect(await db.select().from(inboxItem).where(eq(inboxItem.problemId, guestId))).toEqual([]);
    expect((await call(ctx, 'POST', '/api/admin/problems/abc/resolve', admin.cookie, {})).statusCode).toBe(404);
    expect((await call(ctx, 'POST', '/api/admin/problems/6f1c9b0e-1111-4111-8111-111111111111/resolve', admin.cookie, {})).statusCode).toBe(404);

    const mine = (await call(ctx, 'GET', '/api/me/problem-reports', olya.cookie)).json() as MyProblemReport[];
    expect(mine[0]).toMatchObject({ status: 'resolved', reply: 'Виправили, дякуємо!' });
    const open = (await call(ctx, 'GET', '/api/admin/problems', admin.cookie)).json() as AdminList<AdminProblemReport>;
    expect(open.rows.map((r) => r.text)).toEqual(['Петро скаржиться']);
  });

  it('a reply still comes to whoever switched admin announcements off', async () => {
    const hanna = await person('Ганна');
    await saveSubscription(db, hanna.id, sub('hanna'), new Date());
    await ensureProfile(db, hanna.id);
    await db.update(profile).set({ adminPush: false }).where(eq(profile.userId, hanna.id));
    const id = await report('Ганна скаржиться', hanna.cookie);
    sent.length = 0;
    const replied = await call(ctx, 'POST', `/api/admin/problems/${id}/reply`, admin.cookie, { text: 'Готово' });
    expect(replied.json()).toEqual({ pushed: true, inbox: true });
    await ctx.push!.idle();
    expect(sent.map((p) => p.kind)).toEqual(['problem_reply']);
  });

  it('a reply without push lands only in the inbox (70)', async () => {
    const taras = await person('Тарас');
    const id = await report('Тарас скаржиться', taras.cookie);
    const closed = await report('Тарас ще раз', taras.cookie);
    expect((await call(ctx, 'POST', `/api/admin/problems/${closed}/resolve`, admin.cookie, {})).statusCode).toBe(200);
    sent.length = 0;
    const replied = await call(ctx, 'POST', `/api/admin/problems/${id}/reply`, admin.cookie, { text: 'Готово' });
    expect(replied.json()).toEqual({ pushed: false, inbox: true });
    await ctx.push!.idle();
    expect(sent).toEqual([]);
    const inbox = (await call(ctx, 'GET', '/api/me/inbox', taras.cookie)).json() as InboxPage;
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({ kind: 'problem_reply', reply: 'Готово', read: false, problem: { id, text: 'Тарас скаржиться' } });
  });

  it('the list carries the game moment (70)', async () => {
    const game = { code: '123456', role: 'player', phase: 'question', round: 1, roundTitle: 'Кіно', question: 0, type: 'single', text: 'Хто зняв?' };
    const response = await call(ctx, 'POST', '/api/problem-reports', undefined, { text: 'Не видно варіантів', game }, fresh());
    expect(response.statusCode).toBe(201);
    const listed = (await call(ctx, 'GET', '/api/admin/problems', admin.cookie)).json() as AdminList<AdminProblemReport>;
    expect(listed.rows.find((r) => r.text === 'Не видно варіантів')!.game).toEqual({ ...game, quizId: null, quizTitle: null });
    expect(listed.rows.filter((r) => r.text !== 'Не видно варіантів').every((r) => r.game === null)).toBe(true);
  });

  it('the badge counts open moderation items too (70)', async () => {
    const badge = async () => (await call(ctx, 'GET', '/api/admin/problems/badge', admin.cookie)).json() as AdminProblemsBadge;
    const before = await badge();
    expect(Object.keys(before).sort()).toEqual(['complaints', 'errors', 'reports']);
    const author = await person('Автор');
    const iryna = await person('Ірина');
    const petro = await person('Петро');
    const now = new Date();
    const library = async (title: string) => {
      const quizId = await createQuiz(db, author.id, { ...makeQuiz(), title });
      const opened = await openEntry(db, author.id, quizId, 'uk', now);
      if (!opened.ok) throw new Error(opened.error);
      return { quizId, entryId: opened.entryId };
    };
    const first = await library('Карпати');
    await fileReport(db, iryna.id, { target: { kind: 'quiz', entryId: first.entryId }, reason: 'spam' }, now);
    await fileReport(db, petro.id, { target: { kind: 'quiz', entryId: first.entryId }, reason: 'spam' }, now);
    expect((await badge()).complaints).toBe(before.complaints + 1);
    await fileReport(db, iryna.id, { target: { kind: 'profile', userId: petro.id }, reason: 'offensive' }, now);
    expect((await badge()).complaints).toBe(before.complaints + 2);
    const second = await library('Дніпро');
    await actOnQuiz(db, { adminId: admin.id, entryId: second.entryId, action: 'hide', now });
    expect(await appealEntry(db, author.id, second.quizId, now)).toBe('ok');
    const after = await badge();
    expect(after).toEqual({ errors: before.errors, reports: before.reports, complaints: before.complaints + 3 });
  });

  it('no email anywhere', async () => {
    for (const url of ['/api/admin/problems/badge', '/api/admin/errors', '/api/admin/errors?status=resolved', '/api/admin/problems', '/api/admin/problems?status=resolved']) {
      const response = await call(ctx, 'GET', url, admin.cookie);
      expect(response.statusCode, url).toBe(200);
      expect(response.body, url).not.toContain('@');
    }
  });
});
