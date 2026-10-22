import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from './testing/test-db';
import { profile, user } from './db/schema';
import { ensureProfile, saveProfile } from './profiles';

const addUser = (db: Awaited<ReturnType<typeof createTestDb>>, id: string, name: string) =>
  db.insert(user).values({ id, name, email: `${id}@example.com` });

describe('default nickname', () => {
  it('makes a default nickname from the account name', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Олена Петренко');

    expect(await ensureProfile(db, 'u1')).toEqual({ id: 'u1', nickname: 'Олена Петренко', avatar: null });
    expect(await ensureProfile(db, 'u1')).toEqual({ id: 'u1', nickname: 'Олена Петренко', avatar: null });
    expect(await db.select().from(profile)).toHaveLength(1);
  });

  it('adds a number when the default nickname is taken', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Олена');
    await addUser(db, 'u2', 'Олена');
    await addUser(db, 'u3', 'олена');

    expect((await ensureProfile(db, 'u1'))?.nickname).toBe('Олена');
    expect((await ensureProfile(db, 'u2'))?.nickname).toBe('Олена 2');
    expect((await ensureProfile(db, 'u3'))?.nickname).toBe('олена 3');
  });

  it('fits a long name with its number into 20 characters and replaces an unusable one', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Олександра-Анастасія Ш');
    await addUser(db, 'u2', 'Олександра-Анастасія Ш');
    await addUser(db, 'u3', 'Я');

    expect((await ensureProfile(db, 'u1'))?.nickname).toBe('Олександра-Анастасія');
    expect((await ensureProfile(db, 'u2'))?.nickname).toBe('Олександра-Анастас 2');
    expect((await ensureProfile(db, 'u3'))?.nickname).toBe('Гравець');
  });

  it('two simultaneous first reads create one profile', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Олена');

    const [a, b] = await Promise.all([ensureProfile(db, 'u1'), ensureProfile(db, 'u1')]);
    expect(a).toEqual(b);
    expect(await db.select().from(profile).where(eq(profile.userId, 'u1'))).toHaveLength(1);
  });

  it('has no profile for an unknown user', async () => {
    const db = await createTestDb();
    expect(await ensureProfile(db, 'nobody')).toBeNull();
  });
});

describe('saving a profile', () => {
  it('nicknames are unique regardless of case, spacing and apostrophes', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Один');
    await addUser(db, 'u2', 'Два');

    expect(await saveProfile(db, 'u1', { nickname: 'Оля К’', avatar: null })).toMatchObject({ ok: true });
    expect(await saveProfile(db, 'u2', { nickname: "оля к'", avatar: null })).toEqual({ ok: false, error: 'nickname_taken' });
    expect(await saveProfile(db, 'u1', { nickname: 'ОЛЯ К’', avatar: '/uploads/0123456789abcdef.png' })).toEqual({
      ok: true,
      profile: { id: 'u1', nickname: 'ОЛЯ К’', avatar: '/uploads/0123456789abcdef.png' },
    });
  });
});
