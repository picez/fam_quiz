import type { AdminBackups } from '@quiz/shared';
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { adminAction, user } from './db/schema';
import { backupKey, dbBackups, r2BackupStore } from './db-backup';
import { TEST_AUTH, signUp } from './testing/accounts';
import { fakeR2 } from './testing/fake-r2';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'POST';

const call = (ctx: Ctx, method: Method, url: string, cookie?: string) => ctx.app.inject({ method, url, headers: cookie === undefined ? {} : { cookie } });
const DAY = 24 * 60 * 60 * 1000;

describe('admin backups (64)', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  const emails = new Set<string>();
  let admin: { cookie: string; id: string };
  let plain: { cookie: string };
  const open: Ctx[] = [];

  const lastKinds = async () => (await db.select({ kind: adminAction.kind }).from(adminAction).orderBy(desc(adminAction.at), desc(adminAction.id)).limit(5)).map((row) => row.kind);
  async function build(options: { stored: boolean; backups: boolean; r2?: ReturnType<typeof fakeR2> }) {
    const r2 = options.r2 ?? fakeR2();
    const store = r2BackupStore(r2.settings);
    const backups = dbBackups({ db, store, pauseMs: 0 });
    const ctx = await buildApp({
      db,
      auth: TEST_AUTH,
      adminEmails: emails,
      backupList: options.stored ? () => store.list() : undefined,
      backups: options.backups ? backups : undefined,
    });
    open.push(ctx);
    return { ctx, r2, backups };
  }
  const put = (r2: ReturnType<typeof fakeR2>, at: Date, level: number, size = 3) => r2.objects.set(backupKey(at, level), { bytes: new Uint8Array(size), lastModified: at });

  beforeAll(async () => {
    db = await createTestDb();
    const boot = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
    open.push(boot);
    for (const name of ['Адмін', 'Звичайний']) {
      const signed = await signUp(boot.app, name);
      const me = (await call(boot, 'GET', '/api/me', signed.cookie)).json() as { id: string };
      if (name === 'Адмін') {
        emails.add(signed.email.toLowerCase());
        await db.update(user).set({ emailVerified: true }).where(eq(user.id, me.id));
        admin = { cookie: signed.cookie, id: me.id };
      } else plain = { cookie: signed.cookie };
    }
  });
  afterAll(async () => {
    for (const ctx of open) await ctx.shutdown();
  });

  it('lists backups newest first with size and level, skips foreign keys', async () => {
    const { ctx, r2 } = await build({ stored: true, backups: true });
    const older = new Date(Date.now() - 10 * DAY);
    const newer = new Date(Date.now() - 3 * DAY);
    put(r2, older, 38, 111);
    put(r2, newer, 40, 222);
    r2.objects.set('backups/db/readme.txt', { bytes: new Uint8Array(1), lastModified: new Date() });
    const body = (await call(ctx, 'GET', '/api/admin/backups', admin.cookie)).json() as AdminBackups;
    expect(body.rows.map((row) => ({ at: row.at, bytes: row.bytes, level: row.level }))).toEqual([
      { at: new Date(Math.floor(newer.getTime() / 1000) * 1000).toISOString(), bytes: 222, level: 40 },
      { at: new Date(Math.floor(older.getTime() / 1000) * 1000).toISOString(), bytes: 111, level: 38 },
    ]);
    expect(body).toMatchObject({ stored: true, enabled: true, running: false, last: null, nextAt: null });
    expect(JSON.stringify(body)).not.toContain('@');
  });

  it('takes a copy now, then says when the next one is allowed', async () => {
    const { ctx, r2, backups } = await build({ stored: true, backups: true });
    put(r2, new Date(Date.now() - 10 * DAY), 38);
    put(r2, new Date(Date.now() - 3 * DAY), 40);
    const before = (await lastKinds()).filter((kind) => kind === 'backup_now').length;
    const started = await call(ctx, 'POST', '/api/admin/backups', admin.cookie);
    expect(started.statusCode).toBe(202);
    expect(started.json()).toEqual({});
    expect((await lastKinds())[0]).toBe('backup_now');
    await backups.idle();
    const body = (await call(ctx, 'GET', '/api/admin/backups', admin.cookie)).json() as AdminBackups;
    expect(body.rows).toHaveLength(3);
    expect(body.running).toBe(false);
    expect(body.last).toMatchObject({ by: 'admin', outcome: 'ok', key: expect.any(String) });
    const gap = new Date(body.nextAt!).getTime() - Date.now();
    expect(gap).toBeGreaterThan(59 * 60_000);
    expect(gap).toBeLessThanOrEqual(3_600_000);

    const again = await call(ctx, 'POST', '/api/admin/backups', admin.cookie);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'backup_recent', nextAt: body.nextAt });
    expect((await lastKinds()).filter((kind) => kind === 'backup_now').length).toBe(before + 1);
    expect(r2.objects.size).toBe(3);
  });

  it('two at once take one copy; the second is busy', async () => {
    const { ctx, r2, backups } = await build({ stored: true, backups: true });
    const [one, two] = await Promise.all([call(ctx, 'POST', '/api/admin/backups', admin.cookie), call(ctx, 'POST', '/api/admin/backups', admin.cookie)]);
    expect([one.statusCode, two.statusCode].sort()).toEqual([202, 409]);
    const refused = [one, two].find((response) => response.statusCode === 409)!;
    expect(['backup_busy', 'backup_recent']).toContain((refused.json() as { error: string }).error);
    await backups.idle();
    expect([...r2.objects.keys()]).toHaveLength(1);
  });

  it('off without scheduled backups', async () => {
    const off = await build({ stored: true, backups: false });
    const body = (await call(off.ctx, 'GET', '/api/admin/backups', admin.cookie)).json() as AdminBackups;
    expect(body).toMatchObject({ stored: true, enabled: false, rows: [], running: false, last: null, nextAt: null });
    const before = await lastKinds();
    const refused = await call(off.ctx, 'POST', '/api/admin/backups', admin.cookie);
    expect(refused.statusCode).toBe(503);
    expect(refused.json()).toEqual({ error: 'backup_off' });
    expect(await lastKinds()).toEqual(before);
    expect(off.r2.objects.size).toBe(0);

    const unstored = await build({ stored: false, backups: false });
    expect(((await call(unstored.ctx, 'GET', '/api/admin/backups', admin.cookie)).json() as AdminBackups).stored).toBe(false);
  });

  it('a failing list answers 200 with an empty list and the error flag', async () => {
    const store = r2BackupStore(fakeR2().settings);
    const ctx = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails, backupList: async () => { throw new Error('r2 down'); }, backups: dbBackups({ db, store }) });
    open.push(ctx);
    const response = await call(ctx, 'GET', '/api/admin/backups', admin.cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ rows: [], error: true });
  });

  it('there is no restore route, and everyone but an admin gets the same 404', async () => {
    const { ctx } = await build({ stored: true, backups: true });
    expect((await call(ctx, 'POST', '/api/admin/backups/restore', admin.cookie)).statusCode).toBe(404);
    const unknown = await call(ctx, 'GET', '/api/nope');
    for (const [method, cookie] of [['GET', undefined], ['GET', plain.cookie], ['POST', undefined], ['POST', plain.cookie]] as const) {
      const response = await call(ctx, method, '/api/admin/backups', cookie);
      expect(response.statusCode).toBe(404);
      expect(response.body).toBe(unknown.body);
    }
  });
});
