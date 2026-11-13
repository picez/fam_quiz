/**
 * Завантаження картинок на сайт для сід-скриптів (seed-demo, seed-prize): через тимчасовий акаунт і /api/uploads.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Db } from '../src/db/client';
import { user } from '../src/db/schema';

export const UA = { 'user-agent': 'fam-quiz-seed/1.0 (demo content)' };

const PHOTO = /\.(jpe?g|png|webp)$/i;

/** Тип локального файла за розширенням. */
function localType(path: string): string {
  const ext = extname(path).toLowerCase();
  return ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : '';
}

/** Картинки теки dir (jpg, jpeg, png, webp) у порядку readdirSync(dir).sort() — повні шляхи. */
export function localPhotos(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => PHOTO.test(name))
    .sort()
    .map((name) => join(dir, name));
}

/**
 * Завантажує картинки keys на сайт від імені тимчасового акаунта; повертає ключ → /uploads/…
 * sources дає ключ → адреса в мережі або «file:<шлях>» (локальний файл, тип за розширенням); keys — очікувані ключі (для джерел за замовчуванням у seed-demo).
 */
export async function uploadImages(
  site: string,
  db: Db,
  keys: readonly string[],
  sources: () => Promise<Record<string, string>>,
): Promise<Record<string, string>> {
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
    for (const [key, source] of Object.entries(await sources())) {
      // «file:<шлях>» — локальний файл (намальовані картинки logic, фото граалю), інакше — адреса в мережі.
      const local = source.startsWith('file:');
      let image = local ? null : await fetch(source, { headers: UA });
      // Сховище Wikimedia теж обмежує частоту (429): чекаємо й пробуємо ще.
      for (let attempt = 1; image?.status === 429 && attempt <= 8; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
        image = await fetch(source, { headers: UA });
      }
      const type = local ? localType(source) : (image!.headers.get('content-type')?.split(';')[0] ?? '');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(type) || (image && !image.ok)) {
        console.warn(`Skip ${key}: ${image?.status ?? 'file'} ${type}`);
        continue;
      }
      const bytes = local ? readFileSync(source.slice('file:'.length)) : Buffer.from(await image!.arrayBuffer());
      const send = () => fetch(`${site}/api/uploads`, { method: 'POST', headers: { 'content-type': type, cookie, origin: site }, body: bytes });
      let upload = await send();
      // Ліміт завантажень (429): чекаємо retry-after (або 30 с) і пробуємо знову, до 6 разів.
      for (let attempt = 0; upload.status === 429 && attempt < 6; attempt += 1) {
        const wait = Number(upload.headers.get('retry-after')) || 30;
        console.log(`Upload ${key}: rate limited, waiting ${wait} s`);
        await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000));
        upload = await send();
      }
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
