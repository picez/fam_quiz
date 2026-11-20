import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { errorFingerprint, errorParts, maskPersonal, shortenStack, truncateBytes } from './error-mask';

describe('error masking (64)', () => {
  it('masks emails, tokens, passwords and URL credentials, keeps room codes and ids', () => {
    expect(maskPersonal('no user olya@example.com in room 123456')).toBe('no user [email] in room 123456');
    const bearer = maskPersonal('Authorization: Bearer eyJhbGciOi.abc.def');
    expect(bearer).toContain('Bearer [hidden]');
    expect(bearer).not.toContain('eyJ');
    expect(maskPersonal('GET /api/x?token=abc123&page=2')).toContain('token=[hidden]&page=2');
    expect(maskPersonal('GET /api/x?access_token=abc123&page=2')).not.toContain('abc123');
    const json = maskPersonal('{"password":"qwerty"}');
    expect(json).not.toContain('qwerty');
    expect(json).toContain('[hidden]');
    expect(maskPersonal("password: 'qwe rty'")).not.toContain('qwe');
    expect(maskPersonal('Cookie: session=s3cr3tvalue')).not.toContain('s3cr3tvalue');
    expect(maskPersonal('secret=abc; key: zzz, sig=q1')).not.toMatch(/abc|zzz|q1/);
    const url = maskPersonal('connect postgres://app:secret@db:5432/quiz failed');
    expect(url).toContain('//[hidden]@db:5432/quiz');
    expect(url).not.toContain('secret');
    expect(maskPersonal('postgres://app:pw@db.example.com/x')).not.toMatch(/app:|pw/);
    const long = 'aB3_-'.repeat(8);
    expect(long).toHaveLength(40);
    expect(maskPersonal(`state ${long} expired`)).toBe('state [hidden] expired');
    expect(maskPersonal('sha ' + 'a1'.repeat(20))).toBe('sha [hidden]');
    const id = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
    expect(maskPersonal(`quiz ${id} not found`)).toBe(`quiz ${id} not found`);
    expect(maskPersonal('plain message')).toBe('plain message');
  });

  it('stack paths start at apps/ or node_modules/, without home folders or the pnpm store', () => {
    const stack = [
      'Error: boom',
      '    at load (C:\\Users\\Olya\\quiz\\apps\\server\\src\\store.ts:10:5)',
      '    at run (file:///home/olya/quiz/node_modules/.pnpm/@vitest+runner@4.0.1/node_modules/@vitest/runner/dist/index.js:1:2)',
      '    at /opt/render/project/src/apps/server/dist/main.js:3:4',
      '    at node:internal/process/task_queues:95:5',
    ].join('\n');
    expect(shortenStack(stack)).toBe(
      [
        'Error: boom',
        '    at load (apps/server/src/store.ts:10:5)',
        '    at run (node_modules/@vitest/runner/dist/index.js:1:2)',
        '    at apps/server/dist/main.js:3:4',
        '    at node:internal/process/task_queues:95:5',
      ].join('\n'),
    );
  });

  it('cuts by bytes without breaking a character', () => {
    const cut = truncateBytes('ї'.repeat(3000), 4096);
    expect(Buffer.byteLength(cut)).toBeLessThanOrEqual(4096);
    expect(cut).not.toContain('�');
    expect(cut).toBe('ї'.repeat(2048));
    expect(truncateBytes('a😀', 3)).toBe('a');
    expect(truncateBytes('short', 4096)).toBe('short');
  });

  it('groups errors that differ only in numbers and ids', () => {
    const a = errorFingerprint(new Error('room 123456 not found'), { where: 'socket' });
    const b = errorFingerprint(new Error('room 654321 not found'), { where: 'socket' });
    const c = errorFingerprint(new Error('room 654321 not found'), { where: 'http' });
    const d = errorFingerprint(new Error('quiz 3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b gone'), { where: 'socket' });
    const e = errorFingerprint(new Error('quiz 11111111-2222-4333-8444-555555555555 gone'), { where: 'socket' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(d).toBe(e);
    expect(errorFingerprint(new TypeError('room 1 not found'), { where: 'socket' })).not.toBe(errorFingerprint(new Error('room 1 not found'), { where: 'socket' }));
    expect(errorFingerprint('plain', { where: 'socket', what: 'x' })).not.toBe(errorFingerprint('plain', { where: 'socket', what: 'y' }));
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });

  it('masking is bounded: 100 KB of tricky input takes well under 50 ms', () => {
    const inputs = [
      'a'.repeat(100_000),
      'a.'.repeat(50_000),
      'a'.repeat(100_000) + '@',
      ('x'.repeat(60) + '@' + 'b-'.repeat(40)).repeat(500),
      '%40'.repeat(33_000),
      '//'.repeat(50_000),
      'token='.repeat(16_000),
      'Cookie: ' + 'a=b; '.repeat(20_000),
    ];
    for (const input of inputs) {
      const started = performance.now();
      maskPersonal(input);
      expect(performance.now() - started).toBeLessThan(50);
    }
    // errorParts cuts a huge message and stack before any masking.
    const huge = new Error('m '.repeat(200_000) + 'olya@example.com');
    huge.stack = 'Error: x\n' + '    at f (apps/server/src/x.ts:1:1)\n'.repeat(20_000);
    const started = performance.now();
    const parts = errorParts(huge);
    errorFingerprint(huge, { where: 'store' });
    maskPersonal(parts.message);
    maskPersonal(parts.stack!);
    expect(performance.now() - started).toBeLessThan(50);
    expect(parts.message.length).toBeLessThanOrEqual(8192);
    expect(parts.stack!.length).toBeLessThanOrEqual(8192);
  });

  it('a drizzle query error keeps the SQL and the database message, never the params', () => {
    const cause = new Error('duplicate key value violates unique constraint "user_email_unique"');
    const sqlText = 'insert into "user" ("id", "name", "email") values ($1, $2, $3)';
    const a = new DrizzleQueryError(sqlText, ['u1', 'Ольга Малинська', 'olya@example.com'], cause);
    const b = new DrizzleQueryError(sqlText, ['u2', 'Тарас Шевчук', 'taras@example.com'], cause);
    const parts = errorParts(a);
    const all = parts.message + '\n' + parts.stack;
    for (const secret of ['Ольга', 'Малинська', 'olya', 'u1', 'params']) expect(all).not.toContain(secret);
    expect(parts.message).toContain('duplicate key value violates unique constraint');
    expect(parts.message).toContain(sqlText);
    expect(parts.stack).toMatch(/\n\s+at /);
    expect(errorFingerprint(a, { where: 'store' })).toBe(errorFingerprint(b, { where: 'store' }));
    // The same for any message with params (another drizzle copy, a wrapper), even with a newline inside a param.
    const plain = new Error('Failed query: select 1\nparams: Ольга,olya@example.com');
    plain.stack = 'Error: Failed query: select 1\nparams: Ольга,\nolya@example.com\n    at q (apps/server/src/x.ts:1:1)';
    const p2 = errorParts(plain);
    expect(p2.message + p2.stack).not.toMatch(/Ольга|olya|params/);
    expect(p2.message).toBe('Failed query: select 1');
    expect(p2.stack).toContain('at q (apps/server/src/x.ts:1:1)');
  });

  it('masks Basic auth, every cookie and URL-encoded emails', () => {
    expect(maskPersonal('Authorization: Basic dXNlcjpwYXNzd29yZA==')).not.toContain('dXNlcjpwYXNzd29yZA');
    expect(maskPersonal('auth=Basic dXNlcjpwYXNz')).not.toContain('dXNlcjpwYXNz');
    expect(maskPersonal('{"authorization":"Basic dXNlcjpwYXNz"}')).not.toContain('dXNlcjpwYXNz');
    const cookie = maskPersonal('Cookie: theme=light; connect.sid=s%3Aabc; quiz_session=zzz\nnext line');
    for (const secret of ['light', 's%3Aabc', 'zzz']) expect(cookie).not.toContain(secret);
    expect(cookie).toContain('next line');
    expect(maskPersonal('set-cookie: a=1; b=2')).not.toMatch(/a=1|b=2/);
    expect(maskPersonal('GET /invite?to=olya%40example.com&x=1')).toBe('GET /invite?to=[email]&x=1');
    expect(maskPersonal('to=olya%40Example.COM')).toBe('to=[email]');
    expect(maskPersonal('postgres://app:p@ss@db/x')).toBe('postgres://[hidden]@db/x');
  });

  it('the fingerprint frame is a stack frame, not a message line with a path', () => {
    const a = new Error('x');
    a.stack = "Error: ENOENT '/srv/apps/server/uploads/123.png'\n    at load (/srv/apps/server/src/up.ts:1:1)";
    const b = new Error('x');
    b.stack = "Error: ENOENT '/srv/apps/server/uploads/456.png'\n    at load (/srv/apps/server/src/up.ts:9:9)";
    expect(errorFingerprint(a, { where: 'http' })).toBe(errorFingerprint(b, { where: 'http' }));
  });
});
