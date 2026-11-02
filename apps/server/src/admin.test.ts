import { beforeAll, describe, expect, it } from 'vitest';
import { isAdmin, isAdminEmail } from './admin';
import type { Db } from './db/client';
import { user } from './db/schema';
import { createTestDb } from './testing/test-db';

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

const set = (...emails: string[]) => new Set(emails);

describe('isAdminEmail', () => {
  it('matches trimmed, case-insensitive, verified addresses only', () => {
    expect(isAdminEmail(set('a@example.com'), ' A@EXAMPLE.com ', true)).toBe(true);
    expect(isAdminEmail(set('a@example.com'), 'a@example.com', false)).toBe(false);
    expect(isAdminEmail(set('a@example.com'), 'z@example.com', true)).toBe(false);
  });
});

describe('isAdmin', () => {
  it('reads the account email and its verification', async () => {
    await db.insert(user).values([
      { id: 'ad1', name: 'ad1', email: 'A@example.com', emailVerified: true },
      { id: 'ad2', name: 'ad2', email: 'A2@example.com', emailVerified: false },
    ]);
    expect(await isAdmin(db, new Set(), 'ad1')).toBe(false);
    expect(await isAdmin(db, set('a@example.com'), 'ad1')).toBe(true);
    expect(await isAdmin(db, set('a2@example.com'), 'ad2')).toBe(false);
    expect(await isAdmin(db, set('a@example.com'), 'nobody')).toBe(false);
  });
});
