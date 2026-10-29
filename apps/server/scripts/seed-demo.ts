/**
 * Додає демо-вікторину користувачу за email або оновлює вже наявну вікторину за її id.
 * Запуск: DATABASE_URL=... pnpm --filter @quiz/server seed:demo you@example.com [demo|party|party-media|movies|erudite|school|mosaic|compass|horizon|teams|showcase|grand|family|family2]
 * Оновлення: DATABASE_URL=... pnpm --filter @quiz/server seed:demo --update <quizId> <seedName>
 * — замінює назву, опис, налаштування й раунди рядка новим вмістом сіда (як збереження в редакторі,
 * з новим updatedAt); власник лишається той самий, вікторина зберігає своє посилання й історію ігор.
 * party-media також потребує SITE_URL: картинки з Вікіпедії завантажуються на сайт
 * через тимчасовий акаунт, який потім видаляється. showcase з SITE_URL так само завантажує дві картинки,
 * що проявляються; без SITE_URL ці два запитання лишаються звичайними, текстовими. grand і family так само завантажують по три картинки.
 */
import { randomBytes } from 'node:crypto';
import { quizSchema, type Quiz } from '@quiz/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import type { Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { quiz, user } from '../src/db/schema';
import { compassQuiz } from './compass-quiz';
import { horizonQuiz } from './horizon-quiz';
import { createQuiz, updateQuiz } from '../src/quizzes';
import { demoQuiz } from './demo-quiz';
import { partyQuiz } from './party-quiz';
import { movieQuiz } from './movie-quiz';
import { eruditeQuiz } from './erudite-quiz';
import { schoolQuiz } from './school-quiz';
import { mosaicQuiz } from './mosaic-quiz';
import { teamsQuiz } from './teams-quiz';
import { SHOWCASE_IMAGES, showcaseQuiz } from './showcase-quiz';
import { GRAND_IMAGES, grandQuiz } from './grand-quiz';
import { FAMILY_IMAGES, familyQuiz } from './family-quiz';
import { family2Quiz } from './family2-quiz';

/** Ключ картинки → стаття англійської Вікіпедії, чия головна ілюстрація підходить до запитання. */
const ARTICLES: Record<string, string> = {
  octopus: 'Octopus',
  elephant: 'Elephant',
  wall: 'Great_Wall_of_China',
  scotland: 'Royal_coat_of_arms_of_Scotland',
  napoleon: 'Napoleon',
  wombat: 'Wombat',
  moon: 'Apollo_11',
  recorder: 'Flight_recorder',
  cheetah: 'Cheetah',
  mercury: 'Mercury_(element)',
  wasabi: 'Wasabi',
  saffron: 'Saffron',
  flamingo: 'American_flamingo',
  hubble: 'Hubble_Space_Telescope',
  hoverla: 'Hoverla',
  sophia: 'Saint_Sophia_Cathedral,_Kyiv',
  stonehenge: 'Stonehenge',
  mazepa: 'Ivan_Mazepa',
  saturn: 'Saturn',
  vatican: 'Vatican_City',
  pillars: 'Pillars_of_Creation',
  petrykivka: 'Petrykivka_painting',
  lubart: "Lubart's_Castle",
  fallingwater: 'Fallingwater',
  flytrap: 'Venus_flytrap',
};

const UA = { 'user-agent': 'fam-quiz-seed/1.0 (demo content)' };

async function thumbnails(keys: readonly string[]): Promise<Record<string, string>> {
  const titles = keys.map((key) => ARTICLES[key]).join('|');
  const api = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&pithumbsize=800&format=json&redirects=1&titles=${encodeURIComponent(titles)}`;
  const body = (await (await fetch(api, { headers: UA })).json()) as {
    query: { pages: Record<string, { title: string; thumbnail?: { source: string } }>; redirects?: { from: string; to: string }[] };
  };
  const byTitle = new Map(Object.values(body.query.pages).map((page) => [page.title, page.thumbnail?.source]));
  const resolve = (title: string) => body.query.redirects?.find((r) => r.from === title)?.to ?? title;
  const result: Record<string, string> = {};
  for (const key of keys) {
    const article = ARTICLES[key];
    const source = byTitle.get(resolve(article.replaceAll('_', ' ')));
    if (source) result[key] = source;
    else console.warn(`No image for ${article}`);
  }
  return result;
}

/** Завантажує картинки keys на сайт від імені тимчасового акаунта; повертає ключ → /uploads/… */
async function uploadImages(site: string, db: Db, keys: readonly string[] = Object.keys(ARTICLES)): Promise<Record<string, string>> {
  const email = `seed-${randomBytes(6).toString('hex')}@example.invalid`;
  const signUp = await fetch(`${site}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: site },
    body: JSON.stringify({ email, password: randomBytes(16).toString('hex'), name: 'Seed' }),
  });
  if (!signUp.ok) throw new Error(`Sign-up failed: ${signUp.status} ${await signUp.text()}`);
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  try {
    const urls: Record<string, string> = {};
    for (const [key, source] of Object.entries(await thumbnails(keys))) {
      const image = await fetch(source, { headers: UA });
      const type = image.headers.get('content-type')?.split(';')[0] ?? '';
      if (!image.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
        console.warn(`Skip ${key}: ${image.status} ${type}`);
        continue;
      }
      const upload = await fetch(`${site}/api/uploads`, {
        method: 'POST',
        headers: { 'content-type': type, cookie, origin: site },
        body: Buffer.from(await image.arrayBuffer()),
      });
      if (!upload.ok) {
        console.warn(`Upload ${key} failed: ${upload.status} ${await upload.text()}`);
        continue;
      }
      urls[key] = ((await upload.json()) as { url: string }).url;
      console.log(`Uploaded ${key} → ${urls[key]}`);
    }
    return urls;
  } finally {
    await db.delete(user).where(eq(user.email, email));
  }
}

const SEEDS = ['demo', 'party', 'party-media', 'movies', 'erudite', 'school', 'mosaic', 'compass', 'horizon', 'teams', 'showcase', 'grand', 'family', 'family2'] as const;
type SeedName = (typeof SEEDS)[number];
const isSeed = (arg: string | undefined): arg is SeedName => (SEEDS as readonly string[]).includes(arg ?? '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Вміст сіда name; для party-media і showcase картинки завантажуються на site. */
async function seedQuiz(name: SeedName, db: Db, site: string | undefined): Promise<Quiz> {
  switch (name) {
    case 'demo':
      return demoQuiz;
    case 'party':
      return partyQuiz();
    case 'movies':
      return movieQuiz;
    case 'erudite':
      return eruditeQuiz;
    case 'school':
      return schoolQuiz;
    case 'mosaic':
      return mosaicQuiz;
    case 'compass':
      return compassQuiz;
    case 'horizon':
      return horizonQuiz;
    case 'teams':
      return teamsQuiz();
    case 'showcase':
      if (!site) console.warn('No SITE_URL: the revealing pictures stay plain text questions');
      return showcaseQuiz(site ? await uploadImages(site, db, SHOWCASE_IMAGES) : {});
    case 'grand':
      if (!site) console.warn('No SITE_URL: the revealing pictures stay plain text questions');
      return grandQuiz(site ? await uploadImages(site, db, GRAND_IMAGES) : {});
    case 'family':
      if (!site) console.warn('No SITE_URL: the revealing pictures stay plain text questions');
      return familyQuiz(site ? await uploadImages(site, db, FAMILY_IMAGES) : {});
    case 'family2':
      return family2Quiz();
    case 'party-media': {
      const base = partyQuiz(await uploadImages(site!, db));
      return { ...base, title: `${base.title} (з картинками)` };
    }
  }
}

const USAGE = [
  'Usage: DATABASE_URL=... [SITE_URL=...] seed-demo <email> [' + SEEDS.join('|') + ']',
  '       DATABASE_URL=... [SITE_URL=...] seed-demo --update <quizId> <' + SEEDS.join('|') + '>',
].join('\n');

// pnpm може передати й сам роздільник «--».
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const updating = args[0] === '--update';
const quizId = updating ? args[1] : undefined;
const email = updating ? undefined : args.find((arg) => arg.includes('@'));
const name: SeedName | undefined = updating ? (isSeed(args[2]) ? args[2] : undefined) : (args.find(isSeed) ?? 'demo');
const url = process.env.DATABASE_URL;
const site = process.env.SITE_URL?.replace(/\/$/, '');
const valid = updating ? quizId !== undefined && UUID.test(quizId) && name !== undefined : email !== undefined;
if (!valid || !url || !name || (name === 'party-media' && !site)) {
  console.error(USAGE);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined });
const db = drizzle(pool, { schema }) as unknown as Db;
try {
  if (quizId !== undefined) {
    // Власника не перевіряємо: скрипт запускає адміністратор. Беремо його з рядка, щоб скористатися тим самим updateQuiz, що й редактор.
    const [row] = await db.select({ ownerId: quiz.ownerId }).from(quiz).where(eq(quiz.id, quizId));
    if (!row) throw new Error(`No quiz with id ${quizId}`);
    const data = quizSchema.parse(await seedQuiz(name, db, site));
    if (!(await updateQuiz(db, row.ownerId, quizId, data))) throw new Error(`Quiz ${quizId} was not updated`);
    console.log(`Updated quiz ${quizId} from the ${name} seed: «${data.title}»`);
  } else {
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email!));
    if (!owner) throw new Error(`No user with email ${email}`);
    const data = quizSchema.parse(await seedQuiz(name, db, site));
    // createQuiz, а не прямий insert: дуелі зберігаються в settings, окремої колонки немає.
    const id = await createQuiz(db, owner.id, data);
    console.log(`Created quiz ${id} for ${email}`);
  }
} finally {
  await pool.end();
}
