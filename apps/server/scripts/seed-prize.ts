/**
 * Кладе один приз у склад користувача за email (як «Мої призи», лише з бази).
 * Запуск: DATABASE_URL=... pnpm --filter @quiz/server exec tsx scripts/seed-prize.ts you@example.com [grail]
 * Поки що є один готовий приз — «grail»: золотий «Сімейний Ґрааль» (3D-кубок із фото по колу).
 * Власник потім сам прикріплює його до вікторини перед грою.
 */
import { type PrizeContent, prizeContentSchema } from '@quiz/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import type { Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { user } from '../src/db/schema';
import { createPrize } from '../src/prizes';

const PRIZES: Record<string, PrizeContent> = {
  grail: {
    name: 'Сімейний Ґрааль',
    trophy: { kind: 'grail', material: 'gold' },
    engraving: "Сімейний Ґрааль сім'ї комендантів — для найрозумнішого Індіани Джонса",
    real: null,
    title: null,
    diploma: false,
  },
};

const args = process.argv.slice(2).filter((a) => a !== '--');
const email = args.find((a) => a.includes('@'));
const name = args.find((a) => a in PRIZES) ?? 'grail';
const url = process.env.DATABASE_URL;
if (!email || !url) {
  console.error('Usage: DATABASE_URL=... seed-prize <email> [' + Object.keys(PRIZES).join('|') + ']');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined });
const db = drizzle(pool, { schema }) as unknown as Db;
try {
  const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!owner) throw new Error(`No user with email ${email}`);
  const content = prizeContentSchema.parse(PRIZES[name]);
  const result = await createPrize(db, owner.id, content);
  if (!result.ok) throw new Error(`Prize not created: ${result.error}`);
  console.log(`Created prize ${result.prize.id} («${content.name}», ${name}) for ${email}`);
} finally {
  await pool.end();
}
