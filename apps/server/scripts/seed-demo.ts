/**
 * Додає демо-вікторину користувачу за email (чи «Квіз-боту» за --bot) або оновлює вже наявну вікторину за її id.
 * Запуск: DATABASE_URL=... pnpm --filter @quiz/server seed:demo you@example.com [demo|party|party-media|movies|erudite|school|mosaic|compass|horizon|teams|showcase|grand|family|family2|evening|classroom|movies90|logic|world|fun|halloween|mix|quick|mix2|mega|fest|detective|think|video|alike|spy|school3|wordle|big1|big2|big3|filmbluff|fantasy|pl-light|pl-geo|pl-big|pl-fun|knee|screen|party-en]
 * Бот: DATABASE_URL=... pnpm --filter @quiz/server seed:demo --bot <seedName> — створює акаунт бота, якщо його ще нема, і дає йому вікторину.
 * Оновлення: DATABASE_URL=... pnpm --filter @quiz/server seed:demo --update <quizId> <seedName>
 * — замінює назву, опис, налаштування й раунди рядка новим вмістом сіда (як збереження в редакторі,
 * з новим updatedAt); власник лишається той самий, вікторина зберігає своє посилання й історію ігор.
 * party-media також потребує SITE_URL: картинки з Вікіпедії завантажуються на сайт
 * через тимчасовий акаунт, який потім видаляється. showcase з SITE_URL так само завантажує дві картинки,
 * що проявляються; без SITE_URL ці два запитання лишаються звичайними, текстовими. grand і family так само завантажують по три картинки.
 * logic потребує SITE_URL: завантажує намальовані PNG з scripts/logic/img і фото з Вікіпедії.
 * detective потребує SITE_URL: завантажує дві намальовані PNG «Знайди відмінності» з scripts/detective/img.
 * big2 потребує SITE_URL: завантажує фото для пазлів і картини для «Пам’яті» з Wikimedia Commons (BIG2_PHOTOS).
 * big3 потребує SITE_URL: «Знайди відмінності» — картина Аверкампа з Wikimedia Commons (BIG3_PHOTOS) і її змінена копія scripts/big3/img (BIG3_FILES).
 * fantasy потребує SITE_URL: одинадцять картинок з Wikimedia Commons (FANTASY_PHOTOS) — фото, мініатюра, актори, пазл.
 * screen потребує SITE_URL: сімнадцять картинок з Wikimedia Commons (SCREEN_PHOTOS) — місця зйомок, актори, пазл.
 * knee потребує SITE_URL: малюнки зі слайдів лекції (PDF у .superpowers/materials/knee чи KNEE_PDF_DIR, поза git) рендерить scripts/knee/images.ts.
 * pl-light, pl-geo і pl-big потребують SITE_URL: фото й картини з Wikimedia Commons (PL_*_PHOTOS); pl-fun — без картинок, SITE_URL не потрібен.
 */
import { join } from 'node:path';
import { BOT_USER_ID, quizSchema, type Quiz } from '@quiz/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import type { Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { quiz, user } from '../src/db/schema';
import { compassQuiz } from './compass-quiz';
import { horizonQuiz } from './horizon-quiz';
import { ensureBotAccount } from '../src/bot-account';
import { createQuiz, updateQuiz } from '../src/quizzes';
import { parseSeedArgs } from './seed-args';
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
import { EVENING_IMAGES, eveningQuiz } from './evening-quiz';
import { CLASSROOM_IMAGES, classroomQuiz } from './classroom-quiz';
import { MOVIES90_IMAGES, movies90Quiz } from './movies90-quiz';
import { LOGIC_FILES, LOGIC_PHOTOS, logicQuiz } from './logic-quiz';
import { worldQuiz } from './world-quiz';
import { UA, uploadImages as uploadSiteImages } from './site-uploads';
import { funQuiz } from './fun-quiz';
import { halloweenQuiz } from './halloween-quiz';
import { mixQuiz } from './mix-quiz';
import { quickQuiz } from './quick-quiz';
import { MEGA_FILES, MEGA_IMAGES, megaQuiz } from './mega-quiz';
import { FEST_FILES, FEST_IMAGES, festQuiz } from './fest-quiz';
import { MIX2_PHOTOS, mix2Quiz } from './mix2-quiz';
import { DETECTIVE_FILES, detectiveQuiz } from './detective-quiz';
import { thinkQuiz } from './think-quiz';
import { videoQuiz } from './video-quiz';
import { alikeQuiz } from './alike-quiz';
import { spyQuiz } from './spy-quiz';
import { school3Quiz } from './school3-quiz';
import { filmbluffQuiz } from './filmbluff-quiz';
import { wordleQuiz } from './wordle-quiz';
import { big1Quiz } from './big1-quiz';
import { BIG2_PHOTOS, big2Quiz } from './big2-quiz';
import { BIG3_FILES, BIG3_PHOTOS, big3Quiz } from './big3-quiz';
import { FANTASY_PHOTOS, fantasyQuiz } from './fantasy-quiz';
import { kneeQuiz } from './knee-quiz';
import { SCREEN_PHOTOS, screenQuiz } from './screen-quiz';
import { partyEnQuiz } from './party-en-quiz';
import { KNEE_KEYS, KNEE_OUT_DIR, KNEE_PDF_DIR, renderKneeImages } from './knee/images';
import { ARTICLES } from './seed-articles';
import { PL_BIG_PHOTOS, PL_GEO_PHOTOS, PL_LIGHT_PHOTOS, plBigQuiz, plFunQuiz, plGeoQuiz, plLightQuiz } from './pl-quiz';

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

/**
 * Мініатюри 1280 px для карти ключ → стаття англійської Вікіпедії або «File:…» з Commons.
 */
async function wideSources(map: Record<string, string>): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [key, title] of Object.entries(map)) {
    const api = title.startsWith('File:')
      ? `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&iiurlwidth=1280&format=json&titles=${encodeURIComponent(title)}`
      : `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&pithumbsize=1280&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
    let response = await fetch(api, { headers: UA });
    // Wikimedia обмежує частоту запитів: на 429 чекаємо й пробуємо ще.
    for (let attempt = 1; response.status === 429 && attempt <= 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
      response = await fetch(api, { headers: UA });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const body = (await response.json()) as {
      query: { pages: Record<string, { thumbnail?: { source: string }; imageinfo?: { thumburl?: string; url: string }[] }> };
    };
    const page = Object.values(body.query.pages)[0];
    const source = page?.thumbnail?.source ?? page?.imageinfo?.[0]?.thumburl ?? page?.imageinfo?.[0]?.url;
    if (source) result[key] = source;
    else console.warn(`No image for ${title}`);
  }
  return result;
}

/** Картинки keys на сайт (site-uploads); за замовчуванням — головні ілюстрації статей ARTICLES. */
const uploadImages = (
  site: string,
  db: Db,
  keys: readonly string[] = Object.keys(ARTICLES),
  sources: () => Promise<Record<string, string>> = () => thumbnails(keys),
): Promise<Record<string, string>> => uploadSiteImages(site, db, keys, sources);

const SEEDS = ['demo', 'party', 'party-media', 'movies', 'erudite', 'school', 'mosaic', 'compass', 'horizon', 'teams', 'showcase', 'grand', 'family', 'family2', 'evening', 'classroom', 'movies90', 'logic', 'world', 'fun', 'halloween', 'mix', 'quick', 'mix2', 'mega', 'fest', 'detective', 'think', 'video', 'alike', 'spy', 'school3', 'wordle', 'big1', 'big2', 'big3', 'filmbluff', 'fantasy', 'pl-light', 'pl-geo', 'pl-big', 'pl-fun', 'knee', 'screen', 'party-en'] as const;
type SeedName = (typeof SEEDS)[number];
const isSeed = (arg: string | undefined): arg is SeedName => (SEEDS as readonly string[]).includes(arg ?? '');

/** Вміст сіда name; для party-media і showcase картинки завантажуються на site. */
async function seedQuiz(name: SeedName, db: Db, site: string | undefined): Promise<Quiz> {
  switch (name) {
    case 'demo':
      return demoQuiz;
    case 'world':
      return worldQuiz();
    case 'fun':
      return funQuiz();
    case 'halloween':
      return halloweenQuiz();
    case 'mix':
      return mixQuiz();
    case 'think':
      return thinkQuiz();
    case 'alike':
      return alikeQuiz();
    case 'spy':
      return spyQuiz();
    case 'school3':
      return school3Quiz();
    case 'filmbluff':
      return filmbluffQuiz();
    case 'pl-fun':
      return plFunQuiz();
    case 'party-en':
      return partyEnQuiz();
    case 'pl-light':
    case 'pl-geo':
    case 'pl-big': {
      if (!site) throw new Error(`The ${name} quiz needs SITE_URL: its pictures are required`);
      const [photos, build] =
        name === 'pl-light' ? [PL_LIGHT_PHOTOS, plLightQuiz] : name === 'pl-geo' ? [PL_GEO_PHOTOS, plGeoQuiz] : [PL_BIG_PHOTOS, plBigQuiz];
      const urls = await uploadImages(site, db, Object.keys(photos), () => wideSources(photos));
      return build((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'wordle':
      return wordleQuiz();
    case 'big1':
      return big1Quiz();
    case 'video':
      return videoQuiz();
    case 'quick':
      return quickQuiz();
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
    case 'evening': {
      if (!site) throw new Error('The evening quiz needs SITE_URL: its pictures are required');
      const urls = await uploadImages(site, db, Object.keys(EVENING_IMAGES), () => wideSources(EVENING_IMAGES));
      return eveningQuiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'classroom': {
      if (!site) throw new Error('The classroom quiz needs SITE_URL: its pictures are required');
      const urls = await uploadImages(site, db, Object.keys(CLASSROOM_IMAGES), () => wideSources(CLASSROOM_IMAGES));
      return classroomQuiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'movies90': {
      if (!site) throw new Error('The movies90 quiz needs SITE_URL: its pictures are required');
      const urls = await uploadImages(site, db, Object.keys(MOVIES90_IMAGES), () => wideSources(MOVIES90_IMAGES));
      return movies90Quiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'big2': {
      if (!site) throw new Error('The big2 quiz needs SITE_URL: its jigsaw photos and memory paintings are required');
      const urls = await uploadImages(site, db, Object.keys(BIG2_PHOTOS), () => wideSources(BIG2_PHOTOS));
      return big2Quiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'big3': {
      if (!site) throw new Error('The big3 quiz needs SITE_URL: its spot-the-difference pictures are required');
      const files = Object.fromEntries(BIG3_FILES.map((key) => [key, `file:${join(import.meta.dirname, 'big3', 'img', `${key}.png`)}`]));
      const keys = [...BIG3_FILES, ...Object.keys(BIG3_PHOTOS)];
      const urls = await uploadImages(site, db, keys, async () => ({ ...files, ...(await wideSources(BIG3_PHOTOS)) }));
      return big3Quiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'fantasy': {
      if (!site) throw new Error('The fantasy quiz needs SITE_URL: its pictures are required');
      const urls = await uploadImages(site, db, Object.keys(FANTASY_PHOTOS), () => wideSources(FANTASY_PHOTOS));
      return fantasyQuiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'screen': {
      if (!site) throw new Error('The screen quiz needs SITE_URL: its pictures are required');
      const urls = await uploadImages(site, db, Object.keys(SCREEN_PHOTOS), () => wideSources(SCREEN_PHOTOS));
      return screenQuiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'knee': {
      if (!site) throw new Error('The knee quiz needs SITE_URL: its pictures are required');
      const files = renderKneeImages(KNEE_PDF_DIR, KNEE_OUT_DIR);
      const urls = await uploadImages(site, db, KNEE_KEYS, async () => Object.fromEntries(Object.entries(files).map(([key, path]) => [key, `file:${path}`])));
      return kneeQuiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'mix2': {
      if (!site) throw new Error('The mix2 quiz needs SITE_URL: its jigsaw photos are required');
      const urls = await uploadImages(site, db, Object.keys(MIX2_PHOTOS), () => wideSources(MIX2_PHOTOS));
      return mix2Quiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'mega': {
      if (!site) throw new Error('The mega quiz needs SITE_URL: its pictures are required');
      const files = Object.fromEntries(MEGA_FILES.map((key) => [key, `file:${join(import.meta.dirname, 'mega', 'img', `${key}.png`)}`]));
      const keys = [...MEGA_FILES, ...Object.keys(MEGA_IMAGES)];
      const urls = await uploadImages(site, db, keys, async () => ({ ...files, ...(await wideSources(MEGA_IMAGES)) }));
      return megaQuiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'fest': {
      if (!site) throw new Error('The fest quiz needs SITE_URL: its pictures are required');
      const files = Object.fromEntries(FEST_FILES.map((key) => [key, `file:${join(import.meta.dirname, 'fest', 'img', `${key}.png`)}`]));
      const keys = [...FEST_FILES, ...Object.keys(FEST_IMAGES)];
      const urls = await uploadImages(site, db, keys, async () => ({ ...files, ...(await wideSources(FEST_IMAGES)) }));
      return festQuiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'detective': {
      if (!site) throw new Error('The detective quiz needs SITE_URL: its spot-the-difference pictures are required');
      const files = Object.fromEntries(DETECTIVE_FILES.map((key) => [key, `file:${join(import.meta.dirname, 'detective', 'img', `${key}.png`)}`]));
      const urls = await uploadImages(site, db, [...DETECTIVE_FILES], async () => files);
      return detectiveQuiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'logic': {
      if (!site) throw new Error('The logic quiz needs SITE_URL: its pictures are required');
      const files = Object.fromEntries(LOGIC_FILES.map((key) => [key, `file:${join(import.meta.dirname, 'logic', 'img', `${key}.png`)}`]));
      const keys = [...LOGIC_FILES, ...Object.keys(LOGIC_PHOTOS)];
      const urls = await uploadImages(site, db, keys, async () => ({ ...files, ...(await wideSources(LOGIC_PHOTOS)) }));
      return logicQuiz((key) => {
        const url = urls[key];
        if (!url) throw new Error(`Picture ${key} was not uploaded`);
        return url;
      });
    }
    case 'party-media': {
      const base = partyQuiz(await uploadImages(site!, db));
      return { ...base, title: `${base.title} (з картинками)` };
    }
  }
}

const USAGE = [
  'Usage: DATABASE_URL=... [SITE_URL=...] seed-demo <email> [' + SEEDS.join('|') + ']',
  '       DATABASE_URL=... [SITE_URL=...] seed-demo --bot <' + SEEDS.join('|') + '>',
  '       DATABASE_URL=... [SITE_URL=...] seed-demo --update <quizId> <' + SEEDS.join('|') + '>',
].join('\n');

const parsed = parseSeedArgs(process.argv.slice(2), SEEDS);
const name = parsed !== null && isSeed(parsed.seed) ? parsed.seed : undefined;
const url = process.env.DATABASE_URL;
const site = process.env.SITE_URL?.replace(/\/$/, '');
if (!parsed || !url || !name || (name === 'party-media' && !site)) {
  console.error(USAGE);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined });
const db = drizzle(pool, { schema }) as unknown as Db;
try {
  if (parsed.mode === 'update') {
    // Власника не перевіряємо: скрипт запускає адміністратор. Беремо його з рядка (і для вікторини бота теж), щоб скористатися тим самим updateQuiz, що й редактор.
    const [row] = await db.select({ ownerId: quiz.ownerId }).from(quiz).where(eq(quiz.id, parsed.quizId));
    if (!row) throw new Error(`No quiz with id ${parsed.quizId}`);
    const data = quizSchema.parse(await seedQuiz(name, db, site));
    if (!(await updateQuiz(db, row.ownerId, parsed.quizId, data))) throw new Error(`Quiz ${parsed.quizId} was not updated`);
    console.log(`Updated quiz ${parsed.quizId} from the ${name} seed: «${data.title}»`);
  } else if (parsed.mode === 'bot') {
    if (!(await ensureBotAccount(db))) throw new Error('The bot email belongs to another user: no bot account');
    const data = quizSchema.parse(await seedQuiz(name, db, site));
    const id = await createQuiz(db, BOT_USER_ID, data);
    console.log(`Created quiz ${id} for the bot`);
  } else {
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, parsed.email));
    if (!owner) throw new Error(`No user with email ${parsed.email}`);
    const data = quizSchema.parse(await seedQuiz(name, db, site));
    // createQuiz, а не прямий insert: дуелі зберігаються в settings, окремої колонки немає.
    const id = await createQuiz(db, owner.id, data);
    console.log(`Created quiz ${id} for ${parsed.email}`);
  }
} finally {
  await pool.end();
}
