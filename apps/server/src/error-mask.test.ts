import { describe, expect, it } from 'vitest';
import { errorFingerprint, maskPersonal, shortenStack, truncateBytes } from './error-mask';

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
});
