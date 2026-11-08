/**
 * Сімейний «Ґрааль» (25a): грааль із trophy.decor — фото по колу, рим і табличка написами.
 * Створити в складі користувача за email (як «Мої призи», лише з бази):
 *   DATABASE_URL=... SITE_URL=... GRAIL_PHOTOS=<тека> pnpm --filter @quiz/server exec tsx scripts/seed-prize.ts you@example.com grail
 * Перенести наявний грааль без decor (запечена модель) на decor:
 *   DATABASE_URL=... SITE_URL=... GRAIL_PHOTOS=<тека> pnpm --filter @quiz/server exec tsx scripts/seed-prize.ts --update <prizeId> grail
 * Фото з GRAIL_PHOTOS (jpg/png/webp, у порядку імен) завантажуються на SITE_URL через тимчасовий акаунт, як у seed-demo.
 * Власник потім сам прикріплює приз до вікторини перед грою.
 */
import { prizeContentSchema, type PrizeContent } from '@quiz/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, ne, sql } from 'drizzle-orm';
import { basename } from 'node:path';
import pg from 'pg';
import type { Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { prize, prizeAward, user } from '../src/db/schema';
import { createPrize, updatePrize } from '../src/prizes';
import { grailContent } from './grail-prize';
import { localPhotos, uploadImages } from './site-uploads';

/** Зміст до оформлення: напис тепер на римі й табличці, engraving grailContent прибирає. */
const GRAIL_BASE: PrizeContent = {
  name: 'Сімейний Ґрааль',
  trophy: { kind: 'grail', material: 'gold' },
  engraving: null,
  real: null,
  title: null,
  diploma: false,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE = [
  'Usage: DATABASE_URL=... SITE_URL=... GRAIL_PHOTOS=<dir> seed-prize <email> grail',
  '       DATABASE_URL=... SITE_URL=... GRAIL_PHOTOS=<dir> seed-prize --update <prizeId> grail',
].join('\n');

// pnpm може передати й сам роздільник «--».
const args = process.argv.slice(2).filter((a) => a !== '--');
const updating = args[0] === '--update';
const prizeId = updating ? args[1] : undefined;
const email = updating ? undefined : args.find((a) => a.includes('@'));
const name = updating ? args[2] : (args.find((a) => !a.includes('@')) ?? 'grail');
const url = process.env.DATABASE_URL;
const site = process.env.SITE_URL?.replace(/\/$/, '');
const photoDir = process.env.GRAIL_PHOTOS;
const valid = updating ? prizeId !== undefined && UUID.test(prizeId) : email !== undefined;
if (!valid || name !== 'grail' || !url || !site || !photoDir) {
  console.error(USAGE);
  process.exit(1);
}

const isGrail = (column: typeof prize.content | typeof prizeAward.content) => sql`${column} -> 'trophy' ->> 'kind' = 'grail'`;

/** Грааль може бути лише один: інший у prize чи prize_award (крім except) — зупинка. */
async function assertNoOtherGrail(db: Db, except: string | null): Promise<void> {
  const prizes = await db
    .select({ id: prize.id, ownerId: prize.ownerId, status: prize.status })
    .from(prize)
    .where(except === null ? isGrail(prize.content) : and(isGrail(prize.content), ne(prize.id, except)));
  const awards = await db
    .select({ id: prizeAward.id, prizeId: prizeAward.prizeId, userId: prizeAward.userId })
    .from(prizeAward)
    .where(except === null ? isGrail(prizeAward.content) : and(isGrail(prizeAward.content), ne(prizeAward.prizeId, except)));
  if (prizes.length > 0 || awards.length > 0) {
    console.error('Other grails:', JSON.stringify({ prizes, awards }, null, 2));
    throw new Error('Another grail already exists; nothing written');
  }
  console.log('no other grail');
}

/** Фото теки в порядку localPhotos → адреси на сайті в тому ж порядку; хоч одне не завантажилось — виняток. */
async function uploadGrailPhotos(db: Db): Promise<string[]> {
  const files = localPhotos(photoDir!);
  console.log(`Photos (${files.length}) in order:`);
  files.forEach((file, i) => console.log(`  ${i + 1}. ${basename(file)}`));
  if (files.length === 0) throw new Error(`No photos in ${photoDir}`);
  const keys = files.map((file) => basename(file));
  const uploaded = await uploadImages(site!, db, keys, async () => Object.fromEntries(files.map((file, i) => [keys[i]!, `file:${file}`])));
  const missing = keys.filter((key) => uploaded[key] === undefined);
  if (missing.length > 0) throw new Error(`Not uploaded: ${missing.join(', ')}; nothing written`);
  return keys.map((key) => uploaded[key]!);
}

function printResult(content: PrizeContent, urls: string[]): void {
  console.log('content:', JSON.stringify(content, null, 2));
  console.log('urls:');
  urls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
}

const pool = new pg.Pool({ connectionString: url, ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined });
const db = drizzle(pool, { schema }) as unknown as Db;
try {
  if (prizeId !== undefined) {
    // Власника не перевіряємо: скрипт запускає адміністратор. Беремо його з рядка, щоб скористатися тим самим updatePrize, що й редактор.
    const [row] = await db.select().from(prize).where(eq(prize.id, prizeId));
    if (!row) throw new Error(`No prize with id ${prizeId}`);
    if (row.status !== 'free') throw new Error(`Prize ${prizeId} is ${row.status}: its snapshot in a room has no decor; wait until the game ends and retry`);
    if (row.content.trophy?.kind !== 'grail') throw new Error(`Prize ${prizeId} is not a grail (${row.content.trophy?.kind ?? 'no trophy'})`);
    if (row.content.trophy.decor !== undefined && row.content.trophy.decor !== null) throw new Error(`Prize ${prizeId} already has decor; nothing to move`);
    await assertNoOtherGrail(db, prizeId);
    const urls = await uploadGrailPhotos(db);
    const content = grailContent(row.content, urls);
    // Вид не змінюється (grail → grail), тож замок недоступного виду не заважає.
    const result = await updatePrize(db, row.ownerId, prizeId, content);
    if (!result.ok) throw new Error(`Prize ${prizeId} was not updated: ${result.error}`);
    console.log(`updated ${prizeId} («${result.prize.content.name}»)`);
    printResult(result.prize.content, urls);
  } else {
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email!));
    if (!owner) throw new Error(`No user with email ${email}`);
    await assertNoOtherGrail(db, null);
    const urls = await uploadGrailPhotos(db);
    const content = prizeContentSchema.parse(grailContent(GRAIL_BASE, urls));
    const result = await createPrize(db, owner.id, content);
    if (!result.ok) throw new Error(`Prize not created: ${result.error}`);
    console.log(`created ${result.prize.id} («${content.name}») for ${email}`);
    printResult(result.prize.content, urls);
  }
} finally {
  await pool.end();
}
