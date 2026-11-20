import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import type { Db } from './db/client';
import {
  BACKUP_EVERY_MS,
  CHECK_EVERY_MS,
  FIRST_CHECK_MS,
  KEEP_BACKUPS,
  backupKey,
  backupsEnabled,
  dbBackups,
  expiredBackups,
  isBackupDue,
  latestBackup,
  parseBackupKey,
  r2BackupStore,
  writeBackup,
} from './db-backup';
import { setErrorReporter, type ErrorContext } from './log';
import { isMediaName, isStickerKey, type ImageStorage } from './storage/images';
import { r2Storage } from './storage/r2';
import { r2Objects, type StoredObject } from './storage/r2-objects';
import { TEST_AUTH } from './testing/accounts';
import { FakeScheduler } from './testing/fake-scheduler';
import { fakeR2 } from './testing/fake-r2';
import { createTestDb } from './testing/test-db';

const DAY = 24 * 60 * 60 * 1000;
const object = (key: string): StoredObject => ({ key, size: 1, lastModified: new Date(0) });

describe('backup keys', () => {
  it('name the moment (UTC, to the second) and the migration level', () => {
    const key = backupKey(new Date('2026-11-16T10:05:07.123Z'), 37);
    expect(key).toBe('backups/db/2026-11-16T10-05-07Z-m0037.jsonl.gz');
    expect(parseBackupKey(key)).toEqual({ at: new Date('2026-11-16T10:05:07Z'), level: 37 });
    for (const other of ['backups/db/notes.txt', 'backups/db/2026-11-16T10-05-07Z.jsonl.gz', '0123456789abcdef.png', 'backups/db/x/2026-11-16T10-05-07Z-m0037.jsonl.gz']) {
      expect(parseBackupKey(other), other).toBeNull();
    }
  });

  it('are never media names or sticker keys, so neither r2Storage nor /uploads and /stickers can reach them', async () => {
    const key = backupKey(new Date(), 37);
    const file = key.slice('backups/db/'.length);
    for (const name of [key, file]) {
      expect(isMediaName(name), name).toBe(false);
      expect(isStickerKey(name), name).toBe(false);
    }
    let fetched = 0;
    const r2 = r2Storage({ accountId: 'a', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's', fetch: async () => (fetched++, new Response('x')) });
    expect(await r2.get(key)).toBeNull();
    expect(fetched).toBe(0);

    const asked: string[] = [];
    // Сховище, яке віддало б будь-що, — маршрут не має навіть питати його.
    const leaky: ImageStorage = {
      put: async () => {},
      get: async (name) => (asked.push(name), { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) }),
    };
    const { app } = await buildApp({ db: await createTestDb(), auth: TEST_AUTH, storage: leaky });
    for (const url of [`/uploads/${encodeURIComponent(key)}`, `/uploads/${key}`, `/uploads/${file}`, `/uploads/..%2F${encodeURIComponent(key)}`, `/stickers/${encodeURIComponent(key)}`]) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
    expect(asked).toEqual([]);
    await app.close();
  });
});

describe('latestBackup', () => {
  it('latestBackup picks the newest backup key and ignores foreign keys', () => {
    const objects = [
      object(backupKey(new Date('2026-11-09T10:00:00Z'), 39)),
      object(backupKey(new Date('2026-11-16T10:00:00Z'), 40)),
      object('backups/db/notes.txt'),
    ];
    expect(latestBackup(objects)).toBe(objects[1]);
    expect(latestBackup([])).toBeNull();
  });
});

describe('backup schedule rules', () => {
  const now = new Date('2026-11-16T12:00:00Z');

  it('is due with no backups or when the newest is a week old', () => {
    expect(isBackupDue([], now)).toBe(true);
    expect(isBackupDue([object('backups/db/readme.txt')], now)).toBe(true);
    expect(isBackupDue([object(backupKey(new Date(now.getTime() - 6 * DAY), 37))], now)).toBe(false);
    expect(isBackupDue([object(backupKey(new Date(now.getTime() - 9 * DAY), 37)), object(backupKey(new Date(now.getTime() - DAY), 37))], now)).toBe(false);
    expect(isBackupDue([object(backupKey(new Date(now.getTime() - BACKUP_EVERY_MS), 37))], now)).toBe(true);
  });

  it('runs in production unless DB_BACKUP=off; elsewhere only with DB_BACKUP=on', () => {
    expect(backupsEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(backupsEnabled({ NODE_ENV: 'production', DB_BACKUP: 'off' })).toBe(false);
    expect(backupsEnabled({ NODE_ENV: 'production', DB_BACKUP: ' OFF ' })).toBe(false);
    expect(backupsEnabled({})).toBe(false);
    expect(backupsEnabled({ NODE_ENV: 'development', DB_BACKUP: 'on' })).toBe(true);
  });

  it('keeps the newest twelve and never touches other keys', () => {
    const keys = Array.from({ length: 15 }, (_, week) => backupKey(new Date(now.getTime() - week * BACKUP_EVERY_MS), 30 + (week % 3)));
    const objects = [...keys, 'backups/db/readme.txt'].reverse().map(object);
    expect(expiredBackups(objects).sort()).toEqual(keys.slice(KEEP_BACKUPS).sort());
    expect(expiredBackups(objects.slice(0, 5))).toEqual([]);
    // 30 щотижневих: видаляються 18 найстаріших.
    const thirty = Array.from({ length: 30 }, (_, week) => backupKey(new Date(now.getTime() - week * BACKUP_EVERY_MS), 37));
    expect(expiredBackups(thirty.map(object)).sort()).toEqual(thirty.slice(12).sort());
  });

  it('retention keeps the 12 newest and the newest of each of 12 weeks, so manual copies never push weekly ones out', () => {
    const HOUR = 60 * 60 * 1000;
    const newest = now.getTime();
    // 12 ручних за останню добу.
    const manual = Array.from({ length: 12 }, (_, n) => backupKey(new Date(newest - n * 2 * HOUR), 40));
    // Щотижневі: 11 штук, по одній у кожному з вікон 1…11, і одна — у 13-му (старша за 12 тижнів).
    const weekly = Array.from({ length: 11 }, (_, w) => backupKey(new Date(newest - (w + 1) * BACKUP_EVERY_MS - 2 * HOUR), 39));
    const ancient = backupKey(new Date(newest - 12 * BACKUP_EVERY_MS - 2 * HOUR), 30);
    const objects = [...manual, ...weekly, ancient].map(object);
    expect(expiredBackups(objects)).toEqual([ancient]);
    // Дублі в одному вікні: лишається найновіша з вікна, якщо вона не серед найновіших.
    const twin = backupKey(new Date(newest - 7 * BACKUP_EVERY_MS - 5 * HOUR), 39);
    expect(expiredBackups([...objects, object(twin)]).sort()).toEqual([ancient, twin].sort());
  });
});

describe('R2 objects for backups', () => {
  it('uploads big objects in equal parts and small ones with one PUT', async () => {
    const r2 = fakeR2();
    const objects = r2Objects(r2.settings, 1024);
    const bytes = new Uint8Array(3000).map((_, index) => index % 251);
    const sink = objects.upload('backups/db/big', 'application/gzip');
    for (let at = 0; at < bytes.length; at += 333) await sink.write(bytes.subarray(at, at + 333));
    await sink.close();
    expect([...r2.objects.get('backups/db/big')!.bytes]).toEqual([...bytes]);
    expect(r2.requests.filter((request) => request.url.includes('partNumber')).length).toBe(3);

    const small = objects.upload('backups/db/small', 'application/gzip');
    await small.write(new Uint8Array([1, 2, 3]));
    await small.close();
    expect([...r2.objects.get('backups/db/small')!.bytes]).toEqual([1, 2, 3]);
    expect(r2.requests.some((request) => request.url.includes('small?uploads'))).toBe(false);
  });

  it('aborts an unfinished multipart upload', async () => {
    const r2 = fakeR2();
    const sink = r2Objects(r2.settings, 10).upload('backups/db/cut', 'application/gzip');
    await sink.write(new Uint8Array(25));
    expect(r2.uploads.size).toBe(1);
    await sink.abort();
    expect(r2.uploads.size).toBe(0);
    expect(r2.objects.has('backups/db/cut')).toBe(false);
  });

  it('lists every page under the prefix and downloads', async () => {
    const r2 = fakeR2({ pageSize: 2 });
    for (const name of ['a', 'b', 'c', 'd', 'e']) r2.objects.set(`backups/db/${name}`, { bytes: new Uint8Array([1]), lastModified: new Date() });
    r2.objects.set('0123456789abcdef.png', { bytes: new Uint8Array([2]), lastModified: new Date() });
    const objects = r2Objects(r2.settings);
    expect((await objects.list('backups/db/')).map((found) => found.key)).toEqual(['a', 'b', 'c', 'd', 'e'].map((name) => `backups/db/${name}`));
    const body = await objects.download('backups/db/a');
    expect([...new Uint8Array(await new Response(body).arrayBuffer())]).toEqual([1]);
    expect(await objects.download('backups/db/none')).toBeNull();
  });

  it('the backup store deletes only backup keys', async () => {
    const r2 = fakeR2();
    r2.objects.set('backups/db/readme.txt', { bytes: new Uint8Array([1]), lastModified: new Date() });
    const store = r2BackupStore(r2.settings);
    await expect(store.remove('backups/db/readme.txt')).rejects.toThrow('not a backup key');
    await expect(store.remove('0123456789abcdef.png')).rejects.toThrow('not a backup key');
    expect(r2.objects.has('backups/db/readme.txt')).toBe(true);
  });
});

describe('scheduled backups', () => {
  let db: Db;
  let reported: { error: unknown; context: ErrorContext }[];
  let unhook: () => void;

  beforeEach(async () => {
    db = await createTestDb();
    reported = [];
    unhook = setErrorReporter((error, context) => reported.push({ error, context }));
  });
  afterEach(() => unhook());

  const backupsIn = (r2: ReturnType<typeof fakeR2>) => [...r2.objects.keys()].filter((key) => parseBackupKey(key) !== null).sort();

  it('makes a backup when none exists, then waits a week', async () => {
    const r2 = fakeR2();
    const scheduler = new FakeScheduler();
    const backups = dbBackups({ db, store: r2BackupStore(r2.settings), scheduler, pauseMs: 0 });
    const first = await backups.check();
    expect(first).toMatchObject({ tables: expect.any(Number), rows: expect.any(Number), bytes: expect.any(Number) });
    expect(backupsIn(r2)).toHaveLength(1);
    const lines = gunzipSync(r2.objects.get(backupsIn(r2)[0]!)!.bytes).toString('utf8').trim().split('\n');
    expect(JSON.parse(lines[0]!)).toMatchObject({ $: 'header', format: 'quiz-db-backup', skipped: ['live_room', 'session', 'verification'] });
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ $: 'footer' });

    expect(await backups.check()).toBe('fresh');
    scheduler.advance(BACKUP_EVERY_MS - 1000);
    expect(await backups.check()).toBe('fresh');
    scheduler.advance(1000);
    expect(await backups.check()).toMatchObject({ key: expect.any(String) });
    expect(backupsIn(r2)).toHaveLength(2);
    expect(reported).toEqual([]);
  });

  it('runs the first check after a delay and then hourly; stop cancels', async () => {
    const r2 = fakeR2();
    const scheduler = new FakeScheduler();
    const backups = dbBackups({ db, store: r2BackupStore(r2.settings), scheduler, pauseMs: 0 });
    backups.start();
    expect(scheduler.pending()).toEqual([FIRST_CHECK_MS]);
    scheduler.advance(FIRST_CHECK_MS);
    await vi.waitFor(() => expect(scheduler.pending()).toEqual([CHECK_EVERY_MS]));
    expect(backupsIn(r2)).toHaveLength(1);
    backups.stop();
    expect(scheduler.pending()).toEqual([]);
  });

  it('a second check while one runs does nothing', async () => {
    const r2 = fakeR2();
    const backups = dbBackups({ db, store: r2BackupStore(r2.settings), scheduler: new FakeScheduler(), pauseMs: 0 });
    const [one, two] = await Promise.all([backups.check(), backups.check()]);
    expect(one).toMatchObject({ key: expect.any(String) });
    expect(two).toBe('busy');
    expect(backupsIn(r2)).toHaveLength(1);
  });

  it('another instance holding the lock, or a backup appearing meanwhile, means no backup', async () => {
    const r2 = fakeR2();
    const store = r2BackupStore(r2.settings);
    const locked = dbBackups({ db, store, scheduler: new FakeScheduler(), pauseMs: 0, tryLock: async () => false });
    expect(await locked.check()).toBe('locked');
    expect(r2.objects.size).toBe(0);

    // Поки чекали блокування, копію зняв інший екземпляр: після блокування список перевіряється ще раз.
    const other = backupKey(new Date(), 37);
    const late = dbBackups({
      db,
      store,
      scheduler: new FakeScheduler(),
      pauseMs: 0,
      tryLock: async () => {
        r2.objects.set(other, { bytes: new Uint8Array([1]), lastModified: new Date() });
        return true;
      },
    });
    expect(await late.check()).toBe('locked');
    expect([...r2.objects.keys()]).toEqual([other]);
  });

  it('the real advisory lock is taken and released with the transaction', async () => {
    const r2 = fakeR2();
    const store = r2BackupStore(r2.settings);
    expect(await writeBackup(db, { open: (key) => store.upload(key), pauseMs: 0 })).toMatchObject({ key: expect.any(String) });
    expect(await writeBackup(db, { open: (key) => store.upload(key), pauseMs: 0, now: new Date(Date.now() + 1000) })).toMatchObject({ key: expect.any(String) });
  });

  it('deletes backups past the newest twelve after a successful one', async () => {
    const r2 = fakeR2();
    const scheduler = new FakeScheduler();
    const old = Array.from({ length: 13 }, (_, week) => backupKey(new Date(scheduler.now() - (week + 1) * BACKUP_EVERY_MS), 37));
    for (const key of [...old, 'backups/db/readme.txt']) r2.objects.set(key, { bytes: new Uint8Array([1]), lastModified: new Date() });
    const made = await dbBackups({ db, store: r2BackupStore(r2.settings), scheduler, pauseMs: 0 }).check();
    expect(made).toMatchObject({ key: expect.any(String) });
    const kept = backupsIn(r2);
    expect(kept).toHaveLength(KEEP_BACKUPS);
    expect(kept).toContain((made as { key: string }).key);
    expect(kept).not.toContain(old.at(-1));
    expect(kept).not.toContain(old.at(-2));
    expect(r2.objects.has('backups/db/readme.txt')).toBe(true);
  });

  it('a failing bucket is reported, aborts the upload and never throws', async () => {
    const r2 = fakeR2({ failOn: (request) => request.url.includes('partNumber=2') });
    const store = r2BackupStore(r2.settings, 64);
    const backups = dbBackups({ db, store, scheduler: new FakeScheduler(), pauseMs: 0 });
    expect(await backups.check()).toBe('failed');
    expect(reported.map((entry) => entry.context.where)).toEqual(['db-backup']);
    expect(r2.uploads.size).toBe(0);
    expect(backupsIn(r2)).toEqual([]);

    const down = dbBackups({ db, store: r2BackupStore(fakeR2({ failOn: () => true }).settings), scheduler: new FakeScheduler(), pauseMs: 0 });
    await expect(down.check()).resolves.toBe('failed');
    // Після збою база жива: наступна копія знімається.
    expect(await dbBackups({ db, store: r2BackupStore(fakeR2().settings), scheduler: new FakeScheduler(), pauseMs: 0 }).check()).toMatchObject({ key: expect.any(String) });
  });

  it('stopping the server cuts a running backup short without a report and leaves nothing behind', async () => {
    const r2 = fakeR2();
    const backups = dbBackups({ db, store: r2BackupStore(r2.settings, 64), scheduler: new FakeScheduler(), pauseMs: 0 });
    const running = backups.check();
    backups.stop();
    expect(await running).toBe('failed');
    expect(reported).toEqual([]);
    expect(r2.objects.size).toBe(0);
    expect(r2.uploads.size).toBe(0);
    // З'єднання повернуто: база відповідає.
    expect(await writeBackup(db, { open: (key) => r2BackupStore(r2.settings).upload(key), pauseMs: 0 })).not.toBeNull();
  });

  it('runNow takes a copy the same way as the weekly one', async () => {
    const r2 = fakeR2();
    const backups = dbBackups({ db, store: r2BackupStore(r2.settings), scheduler: new FakeScheduler(), pauseMs: 0 });
    expect(backups.status()).toEqual({ running: false, last: null });
    expect(await backups.runNow()).toEqual({ started: true });
    expect(backups.status().running).toBe(true);
    await backups.idle();
    const keys = backupsIn(r2);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^backups\/db\/.*-m00\d\d\.jsonl\.gz$/);
    const status = backups.status();
    expect(status.running).toBe(false);
    expect(status.last).toMatchObject({ by: 'admin', outcome: 'ok', key: keys[0], bytes: r2.objects.get(keys[0]!)!.bytes.byteLength });
    expect(reported).toEqual([]);
  });

  it('the scheduled check records itself as the last attempt', async () => {
    const r2 = fakeR2();
    const backups = dbBackups({ db, store: r2BackupStore(r2.settings), scheduler: new FakeScheduler(), pauseMs: 0 });
    await backups.check();
    expect(backups.status().last).toMatchObject({ by: 'schedule', outcome: 'ok', key: backupsIn(r2)[0] });
  });

  it('runNow refuses within an hour, even after a restart', async () => {
    const r2 = fakeR2();
    const scheduler = new FakeScheduler();
    const copyAt = new Date(scheduler.now() - 30 * 60_000);
    r2.objects.set(backupKey(copyAt, 37), { bytes: new Uint8Array([1]), lastModified: copyAt });
    const restarted = dbBackups({ db, store: r2BackupStore(r2.settings), scheduler, pauseMs: 0 });
    expect(await restarted.runNow()).toEqual({ started: false, reason: 'recent', nextAt: new Date(copyAt.getTime() + 3_600_000).toISOString() });
    expect(backupsIn(r2)).toHaveLength(1);
    scheduler.advance(31 * 60_000);
    expect(await restarted.runNow()).toEqual({ started: true });
    await restarted.idle();
    expect(backupsIn(r2)).toHaveLength(2);
  });

  it('runNow while a copy runs is busy; a second instance gets the lock refusal', async () => {
    const r2 = fakeR2();
    const store = r2BackupStore(r2.settings);
    const one = dbBackups({ db, store, scheduler: new FakeScheduler(), pauseMs: 0 });
    expect(await one.runNow()).toEqual({ started: true });
    expect(await one.runNow()).toEqual({ started: false, reason: 'busy' });
    expect(await one.check()).toBe('busy');
    await one.idle();
    expect(backupsIn(r2)).toHaveLength(1);

    const locked = dbBackups({ db, store, scheduler: new FakeScheduler(), pauseMs: 0, tryLock: async () => false });
    expect(await locked.runNow()).toEqual({ started: false, reason: 'recent', nextAt: expect.any(String) });
    const empty = fakeR2();
    const blocked = dbBackups({ db, store: r2BackupStore(empty.settings), scheduler: new FakeScheduler(), pauseMs: 0, tryLock: async () => false });
    expect(await blocked.runNow()).toEqual({ started: true });
    await blocked.idle();
    expect(blocked.status().last).toMatchObject({ by: 'admin', outcome: 'locked', key: null, bytes: null });
    expect(empty.objects.size).toBe(0);
  });

  it('two instances over one database take one copy; the other reports locked', async () => {
    const r2 = fakeR2();
    const store = r2BackupStore(r2.settings);
    const one = dbBackups({ db, store, scheduler: new FakeScheduler(), pauseMs: 0 });
    const two = dbBackups({ db, store, scheduler: new FakeScheduler(), pauseMs: 0 });
    expect(await one.runNow()).toEqual({ started: true });
    expect(await two.runNow()).toEqual({ started: true });
    await Promise.all([one.idle(), two.idle()]);
    expect(backupsIn(r2)).toHaveLength(1);
    expect([one.status().last?.outcome, two.status().last?.outcome].sort()).toEqual(['locked', 'ok']);
  });

  it('stop aborts a manual copy and leaves nothing half-written', async () => {
    const r2 = fakeR2();
    const backups = dbBackups({ db, store: r2BackupStore(r2.settings, 64), scheduler: new FakeScheduler(), pauseMs: 0 });
    expect(await backups.runNow()).toEqual({ started: true });
    backups.stop();
    await backups.idle();
    expect(backups.status()).toMatchObject({ running: false, last: { by: 'admin', outcome: 'failed' } });
    expect(reported).toEqual([]);
    expect(r2.objects.size).toBe(0);
    expect(r2.uploads.size).toBe(0);
  });

  it('runNow after stop starts nothing and records no attempt', async () => {
    const r2 = fakeR2();
    const backups = dbBackups({ db, store: r2BackupStore(r2.settings), scheduler: new FakeScheduler(), pauseMs: 0 });
    backups.stop();
    expect(await backups.runNow()).toEqual({ started: false, reason: 'busy' });
    await backups.idle();
    expect(backups.status()).toEqual({ running: false, last: null });
    expect(r2.objects.size).toBe(0);
  });

  it('retention never runs after a failed or refused copy, and never while a copy is running', async () => {
    const r2 = fakeR2();
    const scheduler = new FakeScheduler();
    const old = Array.from({ length: 14 }, (_, week) => backupKey(new Date(scheduler.now() - (week + 1) * BACKUP_EVERY_MS), 37));
    for (const key of old) r2.objects.set(key, { bytes: new Uint8Array([1]), lastModified: new Date() });
    const store = r2BackupStore(r2.settings);
    const removed: string[] = [];
    const watching = { ...store, remove: async (key: string) => (removed.push(key), store.remove(key)) };
    // Збій: нічого не видаляється.
    const failing = dbBackups({ db, store: { ...watching, upload: () => { throw new Error('r2 down'); } }, scheduler, pauseMs: 0 });
    expect(await failing.check()).toBe('failed');
    // Блокування в іншого екземпляра: нічого не видаляється.
    expect(await dbBackups({ db, store: watching, scheduler, pauseMs: 0, tryLock: async () => false }).check()).toBe('locked');
    expect(removed).toEqual([]);
    // Видалення — лише після того, як копію дописано й закрито (жодного відкритого вивантаження), і лише старі за нову.
    let during = '';
    const backups = dbBackups({
      db,
      store: {
        ...watching,
        remove: async (key) => {
          during += `${r2.uploads.size}${[...r2.objects.keys()].filter((k) => k > key).length > 0 ? 'n' : 'x'}${(await backups.runNow()).started ? 'S' : 'b'};`;
          removed.push(key);
        },
      },
      scheduler,
      pauseMs: 0,
    });
    const made = await backups.check();
    expect(made).toMatchObject({ key: expect.any(String) });
    expect(removed.length).toBeGreaterThan(0);
    // Жодного відкритого вивантаження, є новіша копія, нова копія під час видалення не стартує (задача ще не завершена).
    expect(during).toBe(removed.map(() => '0nb;').join(''));
  });

  it('retention never deletes the only copy or the newest', () => {
    const only = [object(backupKey(new Date('2020-01-01T00:00:00Z'), 37))];
    expect(expiredBackups(only)).toEqual([]);
    expect(expiredBackups(only, 0)).toEqual([]);
    const two = [object(backupKey(new Date('2020-01-01T00:00:00Z'), 37)), object(backupKey(new Date('2026-01-01T00:00:00Z'), 37))];
    expect(expiredBackups(two, 0)).toEqual([two[0]!.key]);
    expect(expiredBackups([])).toEqual([]);
  });

  it('a backup into a stream yields JSON lines (smoke)', async () => {
    const chunks: Uint8Array[] = [];
    await writeBackup(db, { open: () => ({ write: async (chunk) => void chunks.push(chunk), close: async () => {}, abort: async () => {} }), pauseMs: 0 });
    const text = gunzipSync(Buffer.concat(chunks)).toString('utf8');
    expect(text.endsWith('\n')).toBe(true);
  });
});
