import { DrizzleQueryError, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from './db/client';
import { adminAction, problemReport, serverError, user } from './db/schema';
import { createErrorStore, listServerErrors, problemsBadge, resolveServerError } from './error-store';
import { log, setErrorReporter } from './log';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';

const T0 = new Date('2026-11-20T10:00:00.000Z');
const HOUR = 3_600_000;

let clock = T0.getTime();
const now = () => new Date(clock);
let level: string;

beforeEach(() => {
  clock = T0.getTime();
  level = log.level;
  log.level = 'silent';
});

afterEach(() => {
  log.level = level;
  vi.restoreAllMocks();
});

async function rows(db: Db) {
  return db.select().from(serverError).orderBy(serverError.firstAt);
}

describe('stored server errors (64)', () => {
  it('groups repeats into one row with a total and a day count', async () => {
    const db = await createTestDb();
    const store = createErrorStore({ db, now });
    for (let i = 0; i < 3; i += 1) store.record(new Error(`room ${100000 + i} not found`), { where: 'socket', event: 'player:join' });
    await store.flush();
    let all = await rows(db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ where: 'socket', event: 'player:join', what: null, name: 'Error', count: 3, dayCount: 3, status: 'new' });
    let listed = await listServerErrors(db, { status: 'new', page: 1 }, now());
    expect(listed).toMatchObject({ total: 1, page: 1, pages: 1 });
    expect(listed.rows[0]).toMatchObject({ count: 3, dayCount: 3, status: 'new', resolvedBy: null, firstAt: T0.toISOString(), lastAt: T0.toISOString() });

    clock += 25 * HOUR;
    store.record(new Error('room 222222 not found'), { where: 'socket', event: 'player:join' });
    await store.flush();
    all = await rows(db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ count: 4, dayCount: 1 });
    expect(all[0].lastAt.toISOString()).toBe(now().toISOString());
    expect(all[0].firstAt.toISOString()).toBe(T0.toISOString());

    // Добове вікно минуло без повторів — за добу 0.
    listed = await listServerErrors(db, { status: 'new', page: 1 }, new Date(clock + 25 * HOUR));
    expect(listed.rows[0]).toMatchObject({ count: 4, dayCount: 0 });
    await store.stop();
  });

  it('stores no personal data', async () => {
    const db = await createTestDb();
    const store = createErrorStore({ db, now });
    const error = Object.assign(new Error('no user olya@example.com, token=abc123'), { detail: 'Key (email)=(olya@example.com)', params: ['olya@example.com'] });
    store.record(error, { where: 'store' });
    store.record(new Error('connect postgres://app:secret@db/x with Bearer eyJhbGciOiJIUzI1NiJ9.abc.def and {"password":"qwerty"}'), { where: 'store', what: 'pool' });
    await store.flush();
    const all = await rows(db);
    expect(all).toHaveLength(2);
    const text = JSON.stringify(all);
    for (const secret of ['@example', 'abc123', 'secret', 'eyJ', 'qwerty', 'Key (email)']) expect(text).not.toContain(secret);
    const email = all.find((r) => r.what === null)!;
    expect(email.message).not.toContain('@');
    // У стеку лишаються хіба назви пакетів npm (node_modules/@scope/…) — не особисте.
    expect(email.stack).toBeTypeOf('string');
    expect(email.stack!.replace(/node_modules\/@/g, '')).not.toContain('@');
    expect(all.find((r) => r.what === 'pool')!.message).toContain('//[hidden]@db/x');
    expect(all.find((r) => r.what === null)?.message).toBe('no user [email], token=[hidden]');
    await store.stop();
  });

  it('a stack is cut to 4 KB and a message to 500 characters', async () => {
    const db = await createTestDb();
    const store = createErrorStore({ db, now });
    const error = new Error('м'.repeat(800));
    error.stack = 'Error: big\n' + '    at fn (/srv/apps/server/src/x.ts:1:1) ї\n'.repeat(500);
    expect(Buffer.byteLength(error.stack)).toBeGreaterThan(20_000);
    store.record(error, { where: 'store' });
    await store.flush();
    const [row] = await rows(db);
    expect(Buffer.byteLength(row.stack!)).toBeLessThanOrEqual(4096);
    expect(row.stack).not.toContain('�');
    expect(row.message).toHaveLength(500);
    await store.stop();
  });

  it('a storm is one write per fingerprint and the buffer is bounded', async () => {
    const queries: string[] = [];
    const db = await createTestDb({ onQuery: (query) => queries.push(query) });
    const store = createErrorStore({ db, now });
    for (let i = 0; i < 10_000; i += 1) store.record(new Error(`room ${i} not found`), { where: 'socket' });
    expect(queries).toHaveLength(0);
    await store.flush();
    expect(queries).toHaveLength(1);
    const [row] = await rows(db);
    expect(row.count).toBe(10_000);

    const warn = vi.spyOn(log, 'warn');
    await db.delete(serverError);
    for (let i = 0; i < 60; i += 1) store.record(new Error(`kind ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`), { where: 'socket' });
    await store.flush();
    expect(await rows(db)).toHaveLength(50);
    expect(warn).toHaveBeenCalledTimes(1);
    await store.stop();
  });

  it('flushes on its own timer and stop writes the rest', async () => {
    const db = await createTestDb();
    const scheduler = new FakeScheduler();
    const store = createErrorStore({ db, now, scheduler, flushMs: 5000 });
    store.record(new Error('one'), { where: 'socket' });
    expect(scheduler.pending()).toContain(5000);
    scheduler.advance(5000);
    await vi.waitFor(async () => expect(await rows(db)).toHaveLength(1));
    store.record(new Error('two'), { where: 'socket' });
    await store.stop();
    expect(await rows(db)).toHaveLength(2);
    expect(scheduler.pending()).toEqual([]);
    // Після зупинки нічого не збирається.
    store.record(new Error('three'), { where: 'socket' });
    await store.flush();
    expect(await rows(db)).toHaveLength(2);
  });

  it('a resolved error comes back as a new row', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'adm', name: 'Адмін', email: 'adm@example.com' });
    const store = createErrorStore({ db, now });
    store.record(new Error('room 123456 not found'), { where: 'store' });
    await store.flush();
    expect(await problemsBadge(db)).toEqual({ errors: 1, reports: 0 });
    const [first] = await rows(db);

    expect(await resolveServerError(db, { adminId: 'adm', id: first.id, now: now() })).toBe('ok');
    const log1 = await db.select().from(adminAction);
    expect(log1).toHaveLength(1);
    expect(log1[0]).toMatchObject({ kind: 'server_error_resolve', adminId: 'adm', targetUserId: null, details: { title: 'store: room 123456 not found' } });
    expect(await resolveServerError(db, { adminId: 'adm', id: first.id, now: now() })).toBe('already');
    expect(await db.select().from(adminAction)).toHaveLength(1);
    expect(await resolveServerError(db, { adminId: 'adm', id: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b', now: now() })).toBe('not_found');
    expect(await resolveServerError(db, { adminId: 'adm', id: 'nope', now: now() })).toBe('not_found');
    expect(await problemsBadge(db)).toEqual({ errors: 0, reports: 0 });

    clock += HOUR;
    store.record(new Error('room 654321 not found'), { where: 'store' });
    await store.flush();
    const all = await rows(db);
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ id: first.id, status: 'resolved', count: 1, resolvedBy: 'adm' });
    expect(all[1]).toMatchObject({ status: 'new', count: 1 });
    expect(await problemsBadge(db)).toEqual({ errors: 1, reports: 0 });

    const resolved = await listServerErrors(db, { status: 'resolved', page: 1 }, now());
    expect(resolved.rows).toHaveLength(1);
    expect(resolved.rows[0].resolvedBy).toBeTypeOf('string');
    expect(resolved.rows[0].resolvedAt).toBe(T0.toISOString());

    await db.insert(problemReport).values({ userId: null, fromAccount: false, text: 'Не відкривається таблиця', createdAt: now() });
    expect(await problemsBadge(db)).toEqual({ errors: 1, reports: 1 });
    await db.update(problemReport).set({ status: 'resolved' }).where(eq(problemReport.fromAccount, false));
    expect(await problemsBadge(db)).toEqual({ errors: 1, reports: 0 });
    await store.stop();
  });

  it('a broken database never throws and never loops', async () => {
    const db = await createTestDb();
    const store = createErrorStore({ db, now });
    const reported = vi.fn();
    const unhook = setErrorReporter(reported);
    const warn = vi.spyOn(log, 'warn');
    try {
      await (db as unknown as { $client: { close(): Promise<void> } }).$client.close();
      store.record(new Error('boom'), { where: 'store' });
      await expect(store.flush()).resolves.toBeUndefined();
      await expect(store.stop()).resolves.toBeUndefined();
      expect(reported).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    } finally {
      unhook();
    }
  });

  it('a failing query is stored without its params and groups into one row', async () => {
    const db = await createTestDb();
    const store = createErrorStore({ db, now });
    await db.insert(user).values({ id: 'u1', name: 'Ольга Малинська', email: 'olya@example.com' });
    const failures: unknown[] = [];
    for (const [name, email] of [['Ольга Малинська', 'olya@example.com'], ['Тарас Шевчук', 'taras.sh@example.com']]) {
      try {
        await db.insert(user).values({ id: 'u1', name, email });
      } catch (error) {
        failures.push(error);
      }
    }
    expect(failures).toHaveLength(2);
    expect(failures[0]).toBeInstanceOf(DrizzleQueryError);
    for (const failure of failures) store.record(failure, { where: 'store' });
    await store.flush();
    const all = await rows(db);
    expect(all).toHaveLength(1);
    expect(all[0].count).toBe(2);
    const text = JSON.stringify(all);
    for (const secret of ['Ольга', 'Малинська', 'Тарас', 'olya', 'taras', 'params']) expect(text).not.toContain(secret);
    expect(all[0].message).toContain('insert into "user"');
    await store.stop();
  });

  it('a value that is not an Error is stored too', async () => {
    const db = await createTestDb();
    const store = createErrorStore({ db, now });
    store.record('plain olya@example.com', { where: 'process', what: 'rejection' });
    store.record({ toString: () => { throw new Error('no'); } }, { where: 'process' });
    await store.flush();
    const all = await rows(db);
    expect(all.map((r) => r.message).sort()).toEqual(['[object]', 'plain [email]']);
    await store.stop();
  });

  it('old rows are pruned after 30 days', async () => {
    const db = await createTestDb();
    const store = createErrorStore({ db, now });
    const old = new Date(T0.getTime() - 31 * 24 * HOUR);
    const recent = new Date(T0.getTime() - 29 * 24 * HOUR);
    const base = { fingerprint: 'f', where: 'store', name: 'Error', message: 'm', dayStart: old, firstAt: old };
    await db.insert(serverError).values([
      { ...base, fingerprint: 'old', lastAt: old },
      { ...base, fingerprint: 'old-resolved', lastAt: old, status: 'resolved' },
      { ...base, fingerprint: 'recent', lastAt: recent },
    ]);
    // Перша година після старту — без чистки.
    await store.flush();
    expect(await rows(db)).toHaveLength(3);
    clock += HOUR;
    await store.flush();
    expect((await rows(db)).map((r) => r.fingerprint)).toEqual(['recent']);
    await store.stop();
  });
});
