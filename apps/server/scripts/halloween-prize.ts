/**
 * Гелловінський кубок до вікторини «Ніч, коли оживають тіні»: обсидіановий кубок у зеленому вогні з моторошними написами.
 *   DATABASE_URL=... pnpm --filter @quiz/server exec tsx scripts/halloween-prize.ts you@example.com
 * Створює приз у складі користувача; ведучий сам прикріплює його до вікторини перед грою.
 */
import { prizeContentSchema, type PrizeContent } from '@quiz/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import type { Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { user } from '../src/db/schema';
import { createPrize } from '../src/prizes';

export const HALLOWEEN_PRIZE: PrizeContent = {
  name: 'Кубок Нічних Жахів',
  trophy: {
    kind: 'cup',
    material: 'obsidian',
    decor: {
      photos: [],
      photoPlace: 'ring',
      frame: 'none',
      photoStyle: 'normal',
      inscriptions: [
        { place: 'rim', text: 'Ніч, коли оживають тіні', font: 'brush', look: 'colored', color: '#39ff14' },
        { place: 'band', text: 'Хто не боїться темряви', font: 'brush', look: 'colored', color: '#ff7518' },
        { place: 'plaque', text: 'Переможцю\nГелловіну', font: 'poster', look: 'embossed', color: '#b3001b' },
      ],
      effect: { kind: 'fire', color: '#39ff14' },
      appearance: 'flash',
      stickers: [],
    },
  },
  engraving: null,
  real: null,
  title: 'Повелитель тіней',
  diploma: true,
};

const email = process.argv.slice(2).find((a) => a.includes('@'));
const url = process.env.DATABASE_URL;
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('halloween-prize.ts')) {
  if (!email || !url) {
    console.error('Usage: DATABASE_URL=... tsx scripts/halloween-prize.ts <email>');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url, ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined });
  const db = drizzle(pool, { schema }) as unknown as Db;
  try {
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (!owner) throw new Error(`No user with email ${email}`);
    const result = await createPrize(db, owner.id, prizeContentSchema.parse(HALLOWEEN_PRIZE));
    if (!result.ok) throw new Error(`Prize not created: ${result.error}`);
    console.log(`created ${result.prize.id} («${HALLOWEEN_PRIZE.name}») for ${email}`);
  } finally {
    await pool.end();
  }
}
