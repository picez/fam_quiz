import { describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { user, xpEntry } from './db/schema';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';

// Прохідний мок: рахує лише виклики syncXp з profiles.ts (ownLevel кличе свій усередині xp-store).
const calls = vi.hoisted(() => ({ sync: 0 }));
vi.mock('./xp-store', async (importOriginal) => {
  const real = await importOriginal<typeof import('./xp-store')>();
  return {
    ...real,
    syncXp: async (...args: Parameters<typeof real.syncXp>) => {
      calls.sync += 1;
      return real.syncXp(...args);
    },
  };
});

const { ownProfile } = await import('./profiles');
const { xpTotals } = await import('./xp-store');

describe('ownProfile and XP (15a)', () => {
  it('syncs XP once — inside ownLevel — and the level already counts the retro games', async () => {
    const db = await createTestDb();
    const ids = ['me', 'x', 'y', 'host'];
    for (const id of ids) await db.insert(user).values({ id, name: `Гравець ${id}`, email: `${id}@example.com` });
    await seedGame(db, {
      hostId: 'host',
      startedAt: new Date('2026-09-01T10:00:00Z'),
      finishedAt: new Date('2026-09-01T10:30:00Z'),
      questionsPlayed: 5,
      players: ['me', 'x', 'y'].map((userId, i) => ({ userId, nickname: `Нік ${i}`, score: 10 - i, rank: i + 1 })),
    });
    const own = await ownProfile(db, { id: 'me', email: 'me@example.com' } as Parameters<typeof ownProfile>[1]);
    expect(calls.sync).toBe(0);
    // Рядок гри (50 участь + 100 за перше місце) уже записано ретро, і рівень його рахує.
    const [row] = await db.select().from(xpEntry).where(and(eq(xpEntry.userId, 'me'), eq(xpEntry.source, 'game')));
    expect(row).toMatchObject({ amount: 150, retro: true });
    expect(own.level.progress.xp).toBe((await xpTotals(db, ['me'])).get('me'));
    expect(own.level.progress.xp).toBeGreaterThanOrEqual(150);
  });
});
