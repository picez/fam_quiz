/**
 * Додає демо-вікторину користувачу за email.
 * Запуск: DATABASE_URL=... pnpm --filter @quiz/server seed:demo you@example.com [demo|party|party-media|movies|erudite|school|mosaic]
 * party-media також потребує SITE_URL: картинки з Вікіпедії завантажуються на сайт
 * через тимчасовий акаунт, який потім видаляється.
 */
import { randomBytes } from 'node:crypto';
import { quizSchema, type Quiz } from '@quiz/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { user } from '../src/db/schema';
import { createQuiz } from '../src/quizzes';
import { demoQuiz } from './demo-quiz';
import { partyQuiz } from './party-quiz';
import { movieQuiz } from './movie-quiz';
import { eruditeQuiz } from './erudite-quiz';
import { schoolQuiz } from './school-quiz';
import { mosaicQuiz } from './mosaic-quiz';

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
  laika: 'Laika',
  hoverla: 'Hoverla',
  mriya: 'Antonov_An-225_Mriya',
  mazepa: 'Ivan_Mazepa',
  saturn: 'Saturn',
  vatican: 'Vatican_City',
};

const UA = { 'user-agent': 'fam-quiz-seed/1.0 (demo content)' };

async function thumbnails(): Promise<Record<string, string>> {
  const titles = Object.values(ARTICLES).join('|');
  const api = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&pithumbsize=800&format=json&redirects=1&titles=${encodeURIComponent(titles)}`;
  const body = (await (await fetch(api, { headers: UA })).json()) as {
    query: { pages: Record<string, { title: string; thumbnail?: { source: string } }>; redirects?: { from: string; to: string }[] };
  };
  const byTitle = new Map(Object.values(body.query.pages).map((page) => [page.title, page.thumbnail?.source]));
  const resolve = (title: string) => body.query.redirects?.find((r) => r.from === title)?.to ?? title;
  const result: Record<string, string> = {};
  for (const [key, article] of Object.entries(ARTICLES)) {
    const source = byTitle.get(resolve(article.replaceAll('_', ' ')));
    if (source) result[key] = source;
    else console.warn(`No image for ${article}`);
  }
  return result;
}

/** Завантажує картинки на сайт від імені тимчасового акаунта; повертає ключ → /uploads/… */
async function uploadImages(site: string, db: ReturnType<typeof drizzle>): Promise<Record<string, string>> {
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
    for (const [key, source] of Object.entries(await thumbnails())) {
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

const args = process.argv.slice(2);
const email = args.find((arg) => arg.includes('@'));
const name = args.find((arg) => ['demo', 'party', 'party-media', 'movies', 'erudite', 'school', 'mosaic'].includes(arg)) ?? 'demo';
const url = process.env.DATABASE_URL;
const site = process.env.SITE_URL?.replace(/\/$/, '');
if (!email || !url || (name === 'party-media' && !site)) {
  console.error('Usage: DATABASE_URL=... [SITE_URL=...] seed-demo <email> [demo|party|party-media|movies|erudite|school|mosaic]');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined });
const db = drizzle(pool);
try {
  const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!owner) throw new Error(`No user with email ${email}`);
  let source: Quiz = demoQuiz;
  if (name === 'party') source = partyQuiz();
  if (name === 'movies') source = movieQuiz;
  if (name === 'erudite') source = eruditeQuiz;
  if (name === 'school') source = schoolQuiz;
  if (name === 'mosaic') source = mosaicQuiz;
  if (name === 'party-media') {
    const base = partyQuiz(await uploadImages(site!, db));
    source = { ...base, title: `${base.title} (з картинками)` };
  }
  const data = quizSchema.parse(source);
  // createQuiz, а не прямий insert: дуелі зберігаються в settings, окремої колонки немає.
  const id = await createQuiz(db, owner.id, data);
  console.log(`Created quiz ${id} for ${email}`);
} finally {
  await pool.end();
}
