import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { buildApp, type AppOptions } from '../../src/app';
import { TEST_AUTH } from '../../src/testing/accounts';
import { createTestDb } from '../../src/testing/test-db';

/**
 * Спільне для наскрізних тестів (виділено з full-game.e2e.ts у 30b): сервер, база, браузер, стан поточного тесту, перезапуск, знімки.
 * Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */
export const WEB = resolve(import.meta.dirname, '../../../web/dist');

/** Видимий тестовий аватар: непрозорий PNG 64×64, жовтий круг на синьому тлі (щоб знімки не скидалися на «порожнє коло»). */
export function avatarPng(): Buffer {
  const size = 64;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const inside = (x - 32) ** 2 + (y - 32) ** 2 < 18 ** 2;
      const at = y * (size * 3 + 1) + 1 + x * 3;
      [raw[at], raw[at + 1], raw[at + 2]] = inside ? [250, 204, 21] : [37, 99, 235];
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
export const exact = { exact: true };
// Відео з цим id повідомляє про помилку так само, як справжній плеєр.
export const BROKEN_VIDEO = 'AAAAAAAAAAA';

/** Сторінка вбудовування замість YouTube: для BROKEN_VIDEO помилкою відповідає лише після команди addEventListener на onError (як справжній плеєр); на «listening» усі відповідають initialDelivery. */
export function youtubeStub(url: string): string {
  const failing = url.includes(BROKEN_VIDEO)
    ? `addEventListener('message', (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.event === 'command' && m.func === 'addEventListener' && Array.isArray(m.args) && m.args.includes('onError'))
          parent.postMessage(JSON.stringify({ event: 'onError', info: 150, id: m.id, channel: 'widget' }), '*');
      });`
    : '';
  const script = `<script>addEventListener('message', (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.event === 'listening') parent.postMessage(JSON.stringify({ event: 'initialDelivery', id: m.id, channel: 'widget' }), '*');
  });${failing}</script>`;
  return `<!doctype html><title>stub</title>${script}`;
}

export let ctx: Awaited<ReturnType<typeof buildApp>>;
export let browser: Browser;
export let base: string;
export let db: Awaited<ReturnType<typeof createTestDb>>;
export let port: number;
/** Проблеми (помилки консолі й сторінки) лише поточного тесту. */
export const problems: string[] = [];
export const pages = new Map<string, Page>();
/** Браузерні контексти поточного тесту: закриваються після нього, щоб сокети старих ігор не жили далі. */
export const contexts: BrowserContext[] = [];
export const ARTIFACTS = resolve(import.meta.dirname, '../artifacts');
/** Грані кубика для наступних кидків (1–6); порожньо — звичайний випадок. */
export const rigged: number[] = [];
export const rng = () => {
  const face = rigged.shift();
  return face === undefined ? Math.random() : (face - 1) / 6 + 0.01;
};

/** Після невдачі лишає знімок кожного екрана: без нього причину не знайти. */
export async function snapshot() {
  mkdirSync(ARTIFACTS, { recursive: true });
  for (const [name, page] of pages) {
    await page.screenshot({ path: resolve(ARTIFACTS, `${name}.png`), fullPage: true }).catch(() => undefined);
    const alert = await page.getByRole('alert').first().textContent({ timeout: 500 }).catch(() => null);
    if (alert !== null) console.error(`${name} shows: ${alert}`);
  }
}

/** Шару заставки зараз немає (його немає — одразу): для знімків, де заставка вже мала б зійти. */
export async function noSplashLayer(page: Page) {
  await page.locator('.splash').waitFor({ state: 'detached' });
}

/**
 * Чекає кінця заставки, яку щойно викликав крок ведучого: спершу її появи (стан міг ще не дійти до сторінки —
 * тоді «шару немає» збрехало б), потім зникнення. Заставка, що вже минула, коштує лише очікування появи.
 */
export async function afterSplash(...pages: Page[]) {
  await Promise.all(
    pages.map(async (page) => {
      await page.locator('.splash').waitFor({ state: 'attached', timeout: 2000 }).catch(() => undefined);
      await noSplashLayer(page);
    }),
  );
}

/** Половина заставки минула (або її немає). */
export const SPLASH_MIDDLE = `(() => {
  const fade = document.querySelector('.splash')?.getAnimations().find((a) => a.animationName === 'splash-fade');
  return !fade || (fade.effect?.getComputedTiming().progress ?? 1) >= 0.5;
})()`;

/** Знімок екрана для перевірки дизайну: лише з E2E_SHOTS=1, у звичайному прогоні нічого не робить. Спершу чекає кінця заставки, якщо не просили саме кадр заставки. */
export async function shot(page: Page, name: string, { splash = false }: { splash?: boolean } = {}) {
  if (process.env.E2E_SHOTS !== '1') return;
  if (!splash) await noSplashLayer(page);
  // Кадр заставки — з її середини: на початку шар ще напівпрозорий, а імена й картка ще в русі.
  else await page.waitForFunction(SPLASH_MIDDLE, undefined, { timeout: 3000 }).catch(() => undefined);
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`), fullPage: true });
}

export function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => (address !== null && typeof address === 'object' ? done(address.port) : fail(new Error('no port'))));
    });
  });
}
/** Прапорці очікуваних помилок консолі (їх читає open): тести ставлять їх як flags.restarting = true. */
export const flags = {
  /** Поки сервер перезапускається, браузер журналює невдалі спроби WebSocket: це очікувано. */
  restarting: false,
  /** Лише частини 13b і 9b (їхні сценарії ставлять і знімають): тихий 404 на /slots для коду, якого вже немає, там очікуваний. */
  slots404Expected: false,
  /** Лише частина 21a: закрите лобі забороненого (404 на код гри) і відмова у вході (403) очікувані. */
  banExpected: false,
};

/** Перезапуск сервера як на Render: зупинка через shutdown (SIGTERM), нова версія на тій самій базі й порті. */
export async function restart(between?: () => Promise<void>) {
  flags.restarting = true;
  await ctx.shutdown();
  // Сервер піднімається знову за будь-якого результату between: інакше впалий сценарій лишив би решту без сервера.
  try {
    await between?.();
  } finally {
    await relisten();
  }
}

/** Нова версія сервера на тій самій базі й порті. */
export async function relisten(extra: Partial<AppOptions> = {}) {
  ctx = await buildApp({
    db,
    auth: { ...TEST_AUTH, baseURL: base },
    webRoot: WEB,
    rng,
    transitions: true,
    pacing: true,
    persist: { instanceId: `e2e-${Date.now()}` },
    stickerFixtures: true,
    ...extra,
  });
  await ctx.app.listen({ port, host: '127.0.0.1' });
}

/** Сервер відповідає на /health за 2 с. */
export async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Сервер, база й браузер на весь файл тестів, прибирання сторінок після кожного тесту: викликати один раз на верхньому рівні кожного *.e2e.ts. */
export function useE2eServer(): void {
  beforeAll(async () => {
    if (!existsSync(resolve(WEB, 'index.html'))) throw new Error('Клієнт не зібрано: спершу виконайте pnpm build.');
    port = await freePort();
    base = `http://localhost:${port}`;
    db = await createTestDb();
    // Кімнати пишуться в базу, як у main.ts: усі сценарії йдуть із записом.
    ctx = await buildApp({ db, auth: { ...TEST_AUTH, baseURL: base }, webRoot: WEB, rng, transitions: true, pacing: true, persist: { instanceId: 'e2e-1' }, stickerFixtures: true });
    await ctx.app.listen({ port, host: '127.0.0.1' });
    browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', headless: true });
  });

  beforeEach(async () => {
    problems.length = 0;
    rigged.length = 0;
    flags.restarting = false;
    // Попередній сценарій міг упасти посеред перезапуску: піднімаємо сервер, щоб решта не падала слідом.
    if (!(await healthy())) {
      await ctx.app.close().catch(() => undefined);
      await relisten();
    }
  });

  afterEach(async () => {
    await Promise.all(contexts.map((c) => c.close().catch(() => undefined)));
    contexts.length = 0;
    pages.clear();
  });

  afterAll(async () => {
    await browser?.close();
    await ctx?.app.close();
  });
}
