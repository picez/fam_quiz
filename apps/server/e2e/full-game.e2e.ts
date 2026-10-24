import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { blitzRound, bool as boolQ, boardRound, classicRound, duels as duelPool, finalRound, makeQuiz, makeRoundsQuiz, match as matchQ, multi, numeric as numericQ, order, single, text as textQ, wipeoutRound, withId, withPoints, withVideo } from '@quiz/engine/testing';
import { DEFAULT_RULES } from '@quiz/shared';
import { PIN_PLACES } from '../scripts/pin-places';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { TEST_AUTH } from '../src/testing/accounts';
import { createTestDb } from '../src/testing/test-db';

/**
 * Наскрізний сценарій у справжньому браузері: ведучий реєструється, складає вікторину
 * з усіма шістьма типами запитань і зображенням, двоє гравців із «телефонів» проходять
 * її до подіуму, а підсумок з'являється в історії.
 *
 * Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

const WEB = resolve(import.meta.dirname, '../../web/dist');
// Справжній PNG 1×1: браузер має його намалювати, а не лише отримати.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Видимий тестовий аватар: непрозорий PNG 64×64, жовтий круг на синьому тлі (щоб знімки не скидалися на «порожнє коло»). */
function avatarPng(): Buffer {
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
const exact = { exact: true };
// Відео з цим id повідомляє про помилку так само, як справжній плеєр.
const BROKEN_VIDEO = 'AAAAAAAAAAA';

/** Сторінка вбудовування замість YouTube: для BROKEN_VIDEO помилкою відповідає лише після команди addEventListener на onError (як справжній плеєр); на «listening» усі відповідають initialDelivery. */
function youtubeStub(url: string): string {
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

let ctx: Awaited<ReturnType<typeof buildApp>>;
let browser: Browser;
let base: string;
let db: Awaited<ReturnType<typeof createTestDb>>;
let port: number;
/** Проблеми (помилки консолі й сторінки) лише поточного тесту. */
const problems: string[] = [];
const pages = new Map<string, Page>();
/** Браузерні контексти поточного тесту: закриваються після нього, щоб сокети старих ігор не жили далі. */
const contexts: BrowserContext[] = [];
const ARTIFACTS = resolve(import.meta.dirname, 'artifacts');
/** Грані кубика для наступних кидків (1–6); порожньо — звичайний випадок. */
const rigged: number[] = [];
const rng = () => {
  const face = rigged.shift();
  return face === undefined ? Math.random() : (face - 1) / 6 + 0.01;
};

/** Після невдачі лишає знімок кожного екрана: без нього причину не знайти. */
async function snapshot() {
  mkdirSync(ARTIFACTS, { recursive: true });
  for (const [name, page] of pages) {
    await page.screenshot({ path: resolve(ARTIFACTS, `${name}.png`), fullPage: true }).catch(() => undefined);
    const alert = await page.getByRole('alert').first().textContent({ timeout: 500 }).catch(() => null);
    if (alert !== null) console.error(`${name} shows: ${alert}`);
  }
}

/** Шару заставки зараз немає (його немає — одразу): для знімків, де заставка вже мала б зійти. */
async function noSplashLayer(page: Page) {
  await page.locator('.splash').waitFor({ state: 'detached' });
}

/**
 * Чекає кінця заставки, яку щойно викликав крок ведучого: спершу її появи (стан міг ще не дійти до сторінки —
 * тоді «шару немає» збрехало б), потім зникнення. Заставка, що вже минула, коштує лише очікування появи.
 */
async function afterSplash(...pages: Page[]) {
  await Promise.all(
    pages.map(async (page) => {
      await page.locator('.splash').waitFor({ state: 'attached', timeout: 2000 }).catch(() => undefined);
      await noSplashLayer(page);
    }),
  );
}

/** Половина заставки минула (або її немає). */
const SPLASH_MIDDLE = `(() => {
  const fade = document.querySelector('.splash')?.getAnimations().find((a) => a.animationName === 'splash-fade');
  return !fade || (fade.effect?.getComputedTiming().progress ?? 1) >= 0.5;
})()`;

/** Знімок екрана для перевірки дизайну: лише з E2E_SHOTS=1, у звичайному прогоні нічого не робить. Спершу чекає кінця заставки, якщо не просили саме кадр заставки. */
async function shot(page: Page, name: string, { splash = false }: { splash?: boolean } = {}) {
  if (process.env.E2E_SHOTS !== '1') return;
  if (!splash) await noSplashLayer(page);
  // Кадр заставки — з її середини: на початку шар ще напівпрозорий, а імена й картка ще в русі.
  else await page.waitForFunction(SPLASH_MIDDLE, undefined, { timeout: 3000 }).catch(() => undefined);
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`), fullPage: true });
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => (address !== null && typeof address === 'object' ? done(address.port) : fail(new Error('no port'))));
    });
  });
}

beforeAll(async () => {
  if (!existsSync(resolve(WEB, 'index.html'))) throw new Error('Клієнт не зібрано: спершу виконайте pnpm build.');
  port = await freePort();
  base = `http://localhost:${port}`;
  db = await createTestDb();
  // Кімнати пишуться в базу, як у main.ts: усі сценарії йдуть із записом.
  ctx = await buildApp({ db, auth: { ...TEST_AUTH, baseURL: base }, webRoot: WEB, rng, transitions: true, persist: { instanceId: 'e2e-1' } });
  await ctx.app.listen({ port, host: '127.0.0.1' });
  browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', headless: true });
});

/** Поки сервер перезапускається, браузер журналює невдалі спроби WebSocket: це очікувано. */
let restarting = false;

/** Перезапуск сервера як на Render: зупинка через shutdown (SIGTERM), нова версія на тій самій базі й порті. */
async function restart(between?: () => Promise<void>) {
  restarting = true;
  await ctx.shutdown();
  // Сервер піднімається знову за будь-якого результату between: інакше впалий сценарій лишив би решту без сервера.
  try {
    await between?.();
  } finally {
    await relisten();
  }
}

/** Нова версія сервера на тій самій базі й порті. */
async function relisten() {
  ctx = await buildApp({
    db,
    auth: { ...TEST_AUTH, baseURL: base },
    webRoot: WEB,
    rng,
    transitions: true,
    persist: { instanceId: `e2e-${Date.now()}` },
  });
  await ctx.app.listen({ port, host: '127.0.0.1' });
}

/** Сервер відповідає на /health за 2 с. */
async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  problems.length = 0;
  rigged.length = 0;
  restarting = false;
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

async function open(name: string, width: number, height: number, options: { reducedMotion?: 'reduce' } = {}): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'uk-UA', ...options });
  contexts.push(context);
  // YouTube не вантажиться з мережі: сторінка вбудовування підміняється заглушкою.
  await context.route(/youtube(-nocookie)?\.com|youtu\.be|ytimg\.com/, (route) =>
    route.fulfill({ contentType: 'text/html', body: youtubeStub(route.request().url()) }),
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`${name}: ${error.message} @ ${page.url()}`));
  page.on('console', (message) => {
    // Відвідувач без акаунта отримує 401 на запит «хто я»: це очікувана відповідь, а не збій.
    const expected =
      message.text().includes('401 (Unauthorized)') || (restarting && message.text().includes('WebSocket connection to'));
    if (message.type() === 'error' && !expected) problems.push(`${name} console: ${message.text()} @ ${message.location().url}`);
  });
  page.on('dialog', (dialog) => void dialog.accept());
  pages.set(name, page);
  return page;
}

const click = (page: Page, name: string) => page.getByRole('button', { name, ...exact }).click();
const field = (page: Page, label: string) => page.getByLabel(label, exact);
const questionText = (page: Page) => page.locator('.question-field textarea');

const LONG_RIGHT = 'Уж — річка, що тече через Ужгород і впадає в Лаборець на території Словаччини, довжина 133 км';

/** З'єднує пари на телефоні: дотик ліворуч, потім праворуч. */
async function connect(page: Page, pairs: [string, string][]): Promise<void> {
  for (const [l, r] of pairs) {
    await page.locator('.match-left', { hasText: l }).click();
    await page.locator('.match-right', { hasText: r }).click();
  }
}

/** Залишок часу запитання в секундах із таймера на екрані. */
async function seconds(page: Page): Promise<number> {
  return Number(await page.getByRole('timer').first().getAttribute('aria-label'));
}

/** Розставляє елементи впорядкування на телефоні гравця в потрібному порядку. */
async function arrange(page: Page, wanted: string[]) {
  for (const [target, text] of wanted.entries()) {
    for (;;) {
      const now = await page.locator('.order .order-text').allTextContents();
      if (now.indexOf(text) === target) break;
      await page.getByRole('button', { name: `Перемістити вгору: ${text}`, ...exact }).click();
    }
  }
}

async function join(page: Page, code: string, nickname: string, viaHome: boolean) {
  if (viaHome) {
    await page.goto(base);
    await field(page, 'Код гри').fill(code);
    await click(page, 'Увійти');
  } else {
    await page.goto(`${base}/play/${code}`);
  }
  await field(page, 'Ваше ім’я').fill(nickname);
  await click(page, 'Увійти в гру');
  await page.getByText('Ви в грі. Чекаємо на старт.').waitFor();
}

it('a host and two players go from sign-up to the podium and the history with every question type', async () => {
  try {
    await scenario();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function scenario() {
  const host = await open('host', 1280, 900);

  // Ведучий реєструється.
  await host.goto(base);
  await host.getByRole('link', { name: 'Я ведучий' }).click();
  await click(host, 'Створити акаунт');
  await field(host, 'Ваше ім’я').fill('Олена Ведуча');
  await field(host, 'Email').fill('host@example.com');
  await field(host, 'Пароль').fill('correct horse battery');
  await click(host, 'Зареєструватися');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();

  // Вікторина з усіма шістьма типами запитань.
  await field(host, 'Назва вікторини').fill('Наскрізна вікторина');

  await questionText(host).fill('Столиця України?');
  await host.getByRole('button', { name: 'Додати зображення', ...exact }).setInputFiles({ name: 'map.png', mimeType: 'image/png', buffer: PIXEL });
  await host.getByAltText('Зображення до запитання').waitFor();
  await field(host, 'Варіант 1').fill('Львів');
  await field(host, 'Варіант 2').fill('Київ');
  await field(host, 'Правильний: варіант 2').click();

  await click(host, 'Додати запитання');
  await click(host, 'кілька варіантів');
  await questionText(host).fill('Які міста стоять на Дніпрі?');
  await field(host, 'Варіант 1').click();
  // Третій варіант з'являється після Enter в останньому рядку.
  for (const option of ['Київ', 'Львів', 'Запоріжжя']) {
    await host.keyboard.type(option);
    await host.keyboard.press('Enter');
  }
  // Перший варіант позначено правильним від початку; додаємо третій.
  await field(host, 'Правильний: варіант 3').click();
  for (const [index, pressed] of ['true', 'false', 'true'].entries()) {
    expect(await field(host, `Правильний: варіант ${index + 1}`).getAttribute('aria-pressed')).toBe(pressed);
  }

  await click(host, 'Додати запитання');
  await click(host, 'так чи ні');
  await questionText(host).fill('Говерла є найвищою горою України?');
  await click(host, 'Правильна відповідь: Так');

  await click(host, 'Додати запитання');
  await click(host, 'текст');
  await questionText(host).fill('Яке місто називають перлиною біля моря?');
  await field(host, 'Написання 1').fill('Одеса');

  await click(host, 'Додати запитання');
  await click(host, 'число');
  await questionText(host).fill('Скільки областей в Україні?');
  await field(host, 'Правильне число').fill('24');

  await click(host, 'Додати запитання');
  await click(host, 'порядок');
  await questionText(host).fill('Розставте від найменшого до найбільшого');
  for (const [index, item] of ['Один', 'Два', 'Три'].entries()) await field(host, `Елемент ${index + 1}`).fill(item);

  await click(host, 'Додати запитання');
  await click(host, 'пари');
  await questionText(host).fill('З’єднайте місто з річкою');
  for (const [index, [l, r]] of [['Київ', 'Дніпро'], ['Львів', 'Полтва'], ['Ужгород', LONG_RIGHT]].entries()) {
    await field(host, `Ліворуч ${index + 1}`).fill(l);
    await field(host, `Праворуч ${index + 1}`).fill(r);
  }

  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Наскрізна вікторина' }).waitFor();

  // Гра: пульт, сцена, двоє гравців.
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  expect(stageUrl).toContain(`/stage/${code}#`);
  const stage = await open('stage', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();

  const olya = await open('olya', 390, 844);
  const taras = await open('taras', 360, 740);
  await join(olya, code, 'Оля', true);
  await join(taras, code, 'Тарас', false);
  await stage.getByText('Тарас').waitFor();

  const reveal = async () => {
    await click(host, 'Показати відповідь');
    await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  };
  const toNext = async (last = false) => {
    await click(host, 'Далі');
    if (!last) await click(host, 'Наступне запитання');
  };

  // 1. Один варіант, із зображенням.
  await click(host, 'Почати гру');
  await stage.getByText('Відповідають усі: бали отримує кожен, хто відповів правильно.').waitFor();
  expect(await stage.getByText('Раунд 1 з 1').count()).toBe(0);
  await click(host, 'Почати раунд');
  await olya.getByRole('button', { name: /Київ/ }).waitFor();
  for (const page of [stage, olya, host]) {
    const drawn = await page.locator('img.question-image').evaluate((image) => (image as unknown as { naturalWidth: number }).naturalWidth);
    expect(drawn).toBe(1);
  }
  await olya.getByRole('button', { name: /Київ/ }).click();
  await taras.getByRole('button', { name: /Львів/ }).click();
  await reveal();
  await olya.getByText('Правильно!').waitFor();
  await taras.getByText('Неправильно').waitFor();
  await stage.getByText(/Правильна відповідь: .*Київ/).waitFor();
  await toNext();

  // 2. Кілька варіантів.
  await olya.getByRole('button', { name: /Запоріжжя/ }).waitFor();
  await olya.getByRole('button', { name: /Київ/ }).click();
  await olya.getByRole('button', { name: /Запоріжжя/ }).click();
  await click(olya, 'Відповісти');
  await taras.getByRole('button', { name: /Київ/ }).click();
  await click(taras, 'Відповісти');
  await reveal();
  await olya.getByText('Правильно!').waitFor();
  await taras.getByText('Неправильно').waitFor();
  await toNext();

  // 3. Так чи ні.
  await click(olya, 'Так');
  await click(taras, 'Ні');
  await reveal();
  await toNext();

  // 4. Текст: ведучий вручну зараховує відповідь з іншим написанням.
  await field(olya, 'Ваша відповідь').fill('  одеса ');
  await click(olya, 'Відповісти');
  await field(taras, 'Ваша відповідь').fill('Одесса');
  await click(taras, 'Відповісти');
  await reveal();
  await olya.getByText('Правильно!').waitFor();
  await taras.getByText('Неправильно').waitFor();
  await host.locator('.rows li', { hasText: 'Тарас' }).getByRole('button', { name: 'Зарахувати', ...exact }).click();
  await taras.getByText('Правильно!').waitFor();
  await toNext();

  // 5. Число.
  await field(olya, 'Ваша відповідь').fill('24');
  await click(olya, 'Відповісти');
  await field(taras, 'Ваша відповідь').fill('25');
  await click(taras, 'Відповісти');
  await reveal();
  await toNext();

  // 6. Порядок.
  await olya.locator('.order').waitFor();
  await arrange(olya, ['Один', 'Два', 'Три']);
  await click(olya, 'Відповісти');
  await arrange(taras, ['Три', 'Два', 'Один']);
  await click(taras, 'Відповісти');
  await reveal();
  await olya.getByText('Правильно!').waitFor();
  await toNext();

  // 7. Пари: до розкриття сцена й телефони не бачать правильних пар.
  await olya.locator('.match-right').first().waitFor();
  await stage.locator('.match-columns').waitFor();
  expect(await stage.locator('.match-columns .match-left').count()).toBe(3);
  expect(await stage.locator('.match-columns .match-right').count()).toBe(3);
  expect(await stage.locator('.match-list').count()).toBe(0);
  expect(await stage.locator('body').innerText()).not.toContain('Київ — Дніпро');
  const authorOrder = ['Дніпро', 'Полтва', LONG_RIGHT];
  const shown = await olya.locator('.match-right .match-text').allTextContents();
  expect([...shown].sort()).toEqual([...authorOrder].sort());
  expect(shown).not.toEqual(authorOrder);

  const submit = taras.getByRole('button', { name: 'Відповісти', ...exact });
  await connect(taras, [['Київ', 'Полтва']]);
  await taras.locator('.match-left', { hasText: 'Київ' }).click();
  expect(await taras.locator('.match-badge').count()).toBe(0);
  expect(await submit.isDisabled()).toBe(true);
  await connect(taras, [['Київ', 'Полтва'], ['Львів', 'Дніпро'], ['Ужгород', 'Уж — річка']]);
  expect(await submit.isDisabled()).toBe(false);
  expect(await taras.evaluate(() => (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await shot(taras, 'match-phone');
  await shot(stage, 'match-stage-question');

  await connect(olya, [['Київ', 'Дніпро'], ['Львів', 'Полтва'], ['Ужгород', 'Уж — річка']]);
  await click(olya, 'Відповісти');
  await click(taras, 'Відповісти');
  await reveal();
  await stage.locator('li.match-row.is-correct').nth(2).waitFor();
  expect(await stage.locator('li.match-row.is-correct').count()).toBe(3);
  expect(await stage.locator('li.match-row.is-correct').first().textContent()).toContain('Київ — Дніпро');
  await olya.getByText('Правильно!').waitFor();
  await taras.getByText('Неправильно').waitFor();
  await shot(stage, 'match-stage-reveal');
  await toNext(true);

  // Подіум.
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const podium = await stage.locator('.standings li').allTextContents();
  expect(podium[0]).toContain('Оля');
  expect(podium[1]).toContain('Тарас');
  await host.getByText('Гру завершено').first().waitFor();

  // Історія ведучого.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Наскрізна вікторина/ }).click();
  const rows = host.locator('.standings li');
  await rows.first().waitFor();
  expect(await rows.nth(0).textContent()).toMatch(/Оля.*правильних: 7/);
  expect(await rows.nth(1).textContent()).toMatch(/Тарас.*правильних: 1/);

  // Відповіді гравців під запитанням: пари списком.
  const matchQuestion = host.locator('.rows.stacked > li', { hasText: 'З’єднайте місто з річкою' });
  await matchQuestion.getByText('Відповіді (2)').click();
  const olyaRow = matchQuestion.locator('.responses li', { hasText: 'Оля' });
  await olyaRow.locator('li.match-row').first().waitFor();
  expect(await olyaRow.locator('li.match-row').first().textContent()).toContain('Київ — Дніпро');
  await shot(host, 'history-match');

  expect(problems).toEqual([]);
}

/** Відкриває згорнуті «Налаштування раунду», якщо вони ще закриті. */
async function openRoundSettings(page: Page) {
  const panel = page.locator('details.round-settings');
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
}

it('a two-round game with an early round end reaches the podium and shows both rounds in the history', async () => {
  try {
    await twoRounds();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

const ROUND_NOTE = 'Тут помилка коштує балів #найнайнайнайскладнішийраунд';
const PENALTY_STREAK = 'Помилка: мінус ціна запитання · Серія з 2 правильних: +20%';

async function twoRounds() {
  const host = await open('host2', 1280, 900);

  await host.goto(base);
  await host.getByRole('link', { name: 'Я ведучий' }).click();
  await click(host, 'Створити акаунт');
  await field(host, 'Ваше ім’я').fill('Ірина Ведуча');
  await field(host, 'Email').fill('host2@example.com');
  await field(host, 'Пароль').fill('correct horse battery');
  await click(host, 'Зареєструватися');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Вікторина з раундами');

  // Верх редактора: назва вікторини над смугою раундів на комп'ютері й на телефоні 375.
  const titleAboveRounds = async (label: string) => {
    const titleY = (await field(host, 'Назва вікторини').boundingBox())!.y;
    const roundY = (await host.getByRole('button', { name: '+ Раунд', ...exact }).boundingBox())!.y;
    expect(titleY, `${label}: title is not above the rounds`).toBeLessThan(roundY);
  };
  await titleAboveRounds('desktop');
  await shot(host, 'editor-top-desktop');
  await host.setViewportSize({ width: 375, height: 812 });
  await titleAboveRounds('phone 375');
  await expectNoSideScroll(host, 'editor-top-phone-375');
  // Липка панель «Зберегти» повністю видна над нижнім меню.
  await host.evaluate('window.scrollTo(0, Math.floor((document.documentElement.scrollHeight - innerHeight) / 2))');
  const save375 = (await host.getByRole('button', { name: 'Зберегти', ...exact }).boundingBox())!;
  const menu375 = (await host.locator(MENU).boundingBox())!;
  expect(save375.y, 'editor 375: Save is above the viewport').toBeGreaterThanOrEqual(0);
  expect(save375.y + save375.height, 'editor 375: the menu covers Save').toBeLessThanOrEqual(menu375.y + 0.5);
  await host.setViewportSize({ width: 1280, height: 900 });

  // Раунд 1 «Розминка»: два запитання, правила за замовчуванням.
  await openRoundSettings(host);
  await field(host, 'Назва раунду').fill('Розминка');
  await questionText(host).fill('Столиця України?');
  await field(host, 'Варіант 1').fill('Львів');
  await field(host, 'Варіант 2').fill('Київ');
  await field(host, 'Правильний: варіант 2').click();
  await click(host, 'Додати запитання');
  await click(host, 'так чи ні');
  await questionText(host).fill('Говерла є найвищою горою України?');
  await click(host, 'Правильна відповідь: Так');

  // Раунд 2 «Фінал»: штраф і серії від двох правильних відповідей підряд.
  await click(host, '+ Раунд');
  await click(host, 'Класичний');
  await openRoundSettings(host);
  await field(host, 'Назва раунду').fill('Фінал');
  await field(host, 'Опис раунду для гравців').fill(ROUND_NOTE);
  await field(host, 'Штраф: мінус ціна запитання за хибну відповідь').check();
  await field(host, 'Серії: бонус за правильні відповіді підряд').check();
  // Рендериться лише вибраний раунд, тож це налаштування саме другого.
  await host.locator('details.round-settings .round-streak select').first().selectOption('2');
  const preview = host.locator('details.round-settings .round-brief-preview');
  await preview.getByText(ROUND_NOTE).waitFor();
  await preview.getByText(PENALTY_STREAK).waitFor();
  await shot(host, 'editor-round-brief');
  await questionText(host).fill('Найбільша річка України?');
  await field(host, 'Варіант 1').fill('Дніпро');
  await field(host, 'Варіант 2').fill('Дунай');
  await field(host, 'Правильний: варіант 1').click();
  await click(host, 'Додати запитання');
  await click(host, 'так чи ні');
  await questionText(host).fill('Карпати в Україні?');
  await click(host, 'Правильна відповідь: Так');

  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Вікторина з раундами' }).waitFor();

  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage2', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya2', 390, 844);
  const taras = await open('taras2', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await stage.getByText('Тарас').waitFor();

  const reveal = async () => {
    await click(host, 'Показати відповідь');
    await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  };

  // Раунд 1: заставка, одне запитання, дострокове завершення.
  await click(host, 'Почати гру');
  await stage.getByText('Раунд 1 з 2').first().waitFor();
  await stage.getByText('Відповідають усі: бали отримує кожен, хто відповів правильно.').waitFor();
  expect(await stage.locator('.round-brief-note').count()).toBe(0);
  await click(host, 'Почати раунд');
  await olya.getByRole('button', { name: /Київ/ }).click();
  await taras.getByRole('button', { name: /Львів/ }).click();
  await reveal();
  await olya.getByText('Правильно!').waitFor();
  await click(host, 'Завершити раунд');
  await stage.getByText('Підсумки раунду 1').first().waitFor();
  await olya.getByText('Підсумки раунду 1').waitFor();

  // Раунд 2: перше запитання без серії, але зі штрафом; друге — серія.
  await click(host, 'Наступний раунд');
  await stage.getByText('Раунд 2 з 2').first().waitFor();
  for (const page of [stage, taras]) {
    await page.locator('.round-brief-note').getByText(ROUND_NOTE).waitFor();
    await page.locator('.round-brief-lines').getByText(PENALTY_STREAK).waitFor();
    // Опис і рядки правил починаються на тій самій лінії, що й заголовок раунду.
    const titleX = (await page.locator('h1').first().boundingBox())!.x;
    const noteX = (await page.locator('.round-brief-note').boundingBox())!.x;
    const lineX = (await page.locator('.round-brief-lines li').first().boundingBox())!.x;
    expect(Math.abs(noteX - titleX)).toBeLessThanOrEqual(2);
    expect(Math.abs(lineX - titleX)).toBeLessThanOrEqual(2);
  }
  await shot(stage, 'round-brief-stage');
  await expectNoSideScroll(taras, 'round-brief-phone-360');
  await click(host, 'Почати раунд');
  await olya.getByRole('button', { name: /Дніпро/ }).click();
  await taras.getByRole('button', { name: /Дунай/ }).click();
  await reveal();
  await olya.getByText('Правильно!').waitFor();
  await taras.getByText('Неправильно').waitFor();
  // Штраф: у Тараса не було балів, тож після хибної відповіді рахунок від'ємний.
  await taras.locator('.bar .score').filter({ hasText: /^−\d/ }).waitFor();
  // Перша правильна відповідь серії: бонусу ще немає.
  expect(await olya.getByText(/за серію/).count()).toBe(0);
  await click(host, 'Далі');
  await stage.locator('.standings li').filter({ hasText: /Тарас.*−\d/ }).waitFor();
  await click(host, 'Наступне запитання');
  await click(olya, 'Так');
  await click(taras, 'Так');
  await reveal();
  await olya.getByText(/за серію/).waitFor();
  await click(host, 'Далі');

  // Подіум і історія з двома раундами.
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const podium = await stage.locator('.standings li').allTextContents();
  expect(podium[0]).toContain('Оля');
  expect(podium[1]).toContain('Тарас');
  expect(podium[0]).toMatch(/\d/);

  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Вікторина з раундами/ }).click();
  await host.getByRole('heading', { name: 'Розминка' }).waitFor();
  await host.getByRole('heading', { name: 'Фінал' }).waitFor();
  await host.getByText('Столиця України?').waitFor();
  await host.getByText('Найбільша річка України?').waitFor();
  // Незігране запитання першого раунду в історію не потрапляє.
  expect(await host.getByText('Говерла є найвищою горою України?').count()).toBe(0);

  expect(problems).toEqual([]);
}

it('a blitz round: instant answers in a queue with re-pick, the queue decides, −15 s, the podium shows it', async () => {
  try {
    await blitzGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function blitzGame() {
  const host = await open('host3', 1280, 900);

  await host.goto(base);
  await host.getByRole('link', { name: 'Я ведучий' }).click();
  await click(host, 'Створити акаунт');
  await field(host, 'Ваше ім’я').fill('Марія Ведуча');
  await field(host, 'Email').fill('host3@example.com');
  await field(host, 'Пароль').fill('correct horse battery');
  await click(host, 'Зареєструватися');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Бліц-вікторина');

  // Додаємо бліц, а початковий класичний раунд видаляємо: лишається один раунд бліцу.
  await click(host, '+ Раунд');
  await click(host, 'Бліц');
  await host.getByRole('button', { name: 'Раунд 1', ...exact }).click();
  await click(host, 'Видалити раунд');

  await openRoundSettings(host);
  await field(host, 'Штраф: мінус ціна запитання за хибну відповідь').check();
  await host.locator('label.field', { hasText: 'Перевірка' }).locator('select').selectOption('auto');
  // Автоматичний бліц миттєвий: спроба одна, вікна немає, тож цих полів у редакторі немає.
  expect(await host.locator('label.field', { hasText: 'Спроб на запитання' }).count()).toBe(0);
  expect(await host.locator('label.field', { hasText: 'Вікно відповіді' }).count()).toBe(0);

  await questionText(host).fill('Столиця України?');
  await field(host, 'Варіант 1').fill('Львів');
  await field(host, 'Варіант 2').fill('Київ');
  await field(host, 'Правильний: варіант 2').click();
  await click(host, 'Додати запитання');
  await click(host, 'один варіант');
  await questionText(host).fill('Найбільша річка України?');
  await field(host, 'Варіант 1').fill('Дніпро');
  await field(host, 'Варіант 2').fill('Дунай');
  await field(host, 'Правильний: варіант 1').click();

  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Бліц-вікторина' }).waitFor();

  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage3', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const anna = await open('anna3', 390, 844);
  const boris = await open('boris3', 360, 740);
  await join(anna, code, 'Анна', false);
  await join(boris, code, 'Борис', false);
  await stage.getByText('Борис').waitFor();

  await click(host, 'Почати гру');
  for (const page of [stage, anna, host]) {
    await page.getByText('Бали отримує лише той, хто першим правильно відповість.').waitFor();
    await page.getByText('Помилка: мінус ціна запитання').waitFor();
  }
  await shot(stage, 'blitz-intro-stage');
  await shot(host, 'blitz-intro-host');
  await boris.getByText('Бали отримує лише той, хто першим правильно відповість.').waitFor();
  await expectNoSideScroll(boris, 'blitz-intro-phone-360');
  await click(host, 'Почати раунд');

  // Запитання 1: Анна відповідає першою й помиляється, Борис відповідає правильно. Кнопки «Відповісти» немає: варіанти одразу.
  await anna.getByRole('button', { name: /Львів/ }).waitFor();
  expect(await anna.getByRole('button', { name: 'Відповісти', ...exact }).count()).toBe(0);
  await anna.getByRole('button', { name: /Львів/ }).click();
  // Сцена бачить у черзі лише ім'я: чужий вибір і рядок «Відповідає …» з'являються не раніше розкриття.
  await stage.locator('.blitz-queue li', { hasText: 'Анна' }).waitFor();
  expect(await stage.locator('.choice.is-pending').count()).toBe(0);
  expect(await stage.getByText('Відповідає Анна').count()).toBe(0);
  await host.getByRole('button', { name: 'Прийняти', ...exact }).waitFor();
  await host.getByRole('button', { name: 'Перевибрати', ...exact }).waitFor();
  await shot(host, 'blitz-queue-host');
  await shot(stage, 'blitz-queue-stage');
  await boris.getByRole('button', { name: /Київ/ }).click();
  await boris.getByText('Відповідь надіслано · ви 2-й у черзі').waitFor();
  await shot(boris, 'blitz-queue-phone-other');
  // Перевибір: Анна вибирає ще раз, Борис лишається другим.
  await click(host, 'Перевибрати');
  await anna.getByText('Ведучий просить вибрати ще раз').waitFor();
  await anna.getByRole('button', { name: /Львів/ }).click();
  await anna.getByText('Ведучий перевіряє вашу відповідь').waitFor();
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Львів' }).waitFor();
  await click(host, 'Прийняти');
  // Помилка Анни — ✗ у її рядку черги, правильного варіанта ще немає.
  await stage.locator('.blitz-queue li', { hasText: 'Анна' }).locator('.blitz-mark.is-wrong').waitFor();
  expect(await stage.locator('.choice.is-correct').count()).toBe(0);
  await shot(stage, 'blitz-wrong-stage');
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Борис' }).waitFor();
  await click(host, 'Прийняти');
  // Перша правильна відповідь закриває запитання: переможця видно ще до розкриття.
  await stage.getByText('Першим правильно відповів: Борис').waitFor();
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await click(host, 'Далі');
  await click(host, 'Наступне запитання');

  // Запитання 2: «−15 с» скорочує таймер, далі ніхто не натискає, ведучий закриває запитання.
  await click(host, '−15 с');
  await expect.poll(() => seconds(stage)).toBeLessThanOrEqual(15);
  await shot(host, 'blitz-time-host');
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await stage.getByText('Ніхто не відповів правильно').waitFor();
  await click(host, 'Далі');

  // Подіум: Борис отримав ціну запитання, Анна втратила її.
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const podium = await stage.locator('.standings li').allTextContents();
  expect(podium[0]).toMatch(/Борис.*1000/);
  expect(podium[1]).toMatch(/Анна.*−1000/);

  // Історія: два зіграні запитання й ті самі бали.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Бліц-вікторина/ }).click();
  await host.getByText('Столиця України?').waitFor();
  await host.getByText('Найбільша річка України?').waitFor();
  const rows = host.locator('.standings li');
  await rows.first().waitFor();
  expect(await rows.nth(0).textContent()).toMatch(/Борис.*1000/);
  expect(await rows.nth(1).textContent()).toMatch(/Анна.*−1000/);

  expect(problems).toEqual([]);
}

it('a board round: order, a doubled cell, pending answers with re-pick, ±15 s and an early end', async () => {
  try {
    await boardGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function boardGame() {
  const host = await open('host4', 1280, 900);

  await host.goto(base);
  await host.getByRole('link', { name: 'Я ведучий' }).click();
  await click(host, 'Створити акаунт');
  await field(host, 'Ваше ім’я').fill('Катерина Ведуча');
  await field(host, 'Email').fill('host4@example.com');
  await field(host, 'Пароль').fill('correct horse battery');
  await click(host, 'Зареєструватися');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Вікторина-поле');

  // Додаємо поле, а початковий класичний раунд видаляємо: лишається один раунд поля.
  await click(host, '+ Раунд');
  await click(host, 'Ігрове поле');
  await host.getByRole('button', { name: 'Раунд 1', ...exact }).click();
  await click(host, 'Видалити раунд');

  await openRoundSettings(host);
  await host.locator('label.field', { hasText: 'Спосіб відповіді' }).locator('select').selectOption('phone');
  await host.locator('label.field', { hasText: 'Перевірка' }).locator('select').selectOption('auto');

  // Однаковий час для всіх запитань раунду.
  await field(host, 'Секунд').fill('40');
  await click(host, 'Застосувати');

  // Видалення запитання прямо в сітці: на мінімумі кнопка вимкнена з підказкою, з четвертим запитанням доступна.
  const remove = host.getByRole('button', { name: 'Прибрати запитання', ...exact });
  expect(await remove.isDisabled()).toBe(true);
  await host.getByText('Щонайменше 3 запитання в категорії').waitFor();
  await shot(host, 'editor-cell-remove-min');
  await host.getByRole('button', { name: '+ Запитання', ...exact }).first().click();
  expect(await remove.isDisabled()).toBe(false);
  await shot(host, 'editor-cell-remove');
  await remove.click();
  expect(await host.getByRole('button', { name: /^Категорія 1, клітинка \d+:/ }).count()).toBe(3);
  expect(await remove.isDisabled()).toBe(true);

  // Поле 3×3: категорії «Міста», «Річки», «Гори»; ціни 100, 200, 300 редактор ставить сам.
  const categories = ['Міста', 'Річки', 'Гори'];
  for (const [column, title] of categories.entries()) {
    await field(host, `Назва категорії ${column + 1}`).fill(title);
    for (const row of [0, 1, 2]) {
      const price = (row + 1) * 100;
      await host.getByRole('button', { name: new RegExp(`^Категорія ${column + 1}, клітинка ${row + 1}: ${price}`) }).click();
      await questionText(host).fill(`${title} ${price}?`);
      await field(host, 'Варіант 1').fill('Так');
      await field(host, 'Варіант 2').fill('Ні');
      await field(host, 'Правильний: варіант 1').click();
    }
  }
  await host.getByRole('button', { name: /^Категорія 1, клітинка 1: 100/ }).click();
  expect(await field(host, 'Час, с').inputValue()).toBe('40');
  // Клітинка «Міста, 200» подвоює бали.
  await host.getByRole('button', { name: /^Категорія 1, клітинка 2: 200/ }).click();
  await host.locator('label.field', { hasText: 'Позначка' }).locator('select').selectOption('x2');
  await host.getByRole('button', { name: 'Категорія 1, клітинка 2: 200 ×2', ...exact }).waitFor();
  await shot(host, 'editor-desktop');
  await host.setViewportSize({ width: 390, height: 844 });
  await shot(host, 'editor-phone');
  // Нижня панель меню не закриває липку кнопку «Зберегти».
  await host.evaluate('window.scrollTo(0, Math.floor((document.documentElement.scrollHeight - innerHeight) / 2))');
  const saveBox = (await host.getByRole('button', { name: 'Зберегти', ...exact }).boundingBox())!;
  const menuBox = (await host.locator(MENU).boundingBox())!;
  expect(saveBox.y, 'editor: Save is above the viewport').toBeGreaterThanOrEqual(0);
  expect(saveBox.y + saveBox.height, 'editor: the menu covers Save').toBeLessThanOrEqual(menuBox.y + 0.5);
  await host.setViewportSize({ width: 1280, height: 900 });
  if (process.env.E2E_SHOTS === '1') {
    // Повне поле на 8 категорій для перевірки дизайну, потім повертаємо 3.
    for (let i = 0; i < 5; i++) await click(host, '+ Категорія');
    await shot(host, 'editor-8-desktop');
    for (let i = 0; i < 5; i++) await host.getByRole('button', { name: 'Прибрати категорію' }).last().click();
  }

  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Вікторина-поле' }).waitFor();

  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage4', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const alla = await open('alla4', 390, 844);
  const bohdan = await open('bohdan4', 360, 740);
  await join(alla, code, 'Алла', false);
  await join(bohdan, code, 'Богдан', false);
  await stage.getByText('Богдан').waitFor();

  // Заставка: кубики на сцені (ведучий кидає за всіх), потім порядок за приєднанням, старт раунду.
  await click(host, 'Почати гру');
  rigged.push(4, 2);
  await click(host, 'Кидати кубики');
  await click(host, 'Кинути за тих, хто лишився');
  await stage.locator('.dice-rows .die').first().waitFor();
  await stage.getByText('Порядок визначено').waitFor();
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');

  const cell = (page: Page, category: string, price: number) =>
    page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    // Після кожного запитання може з'явитися рейтинг; тоді рухаємося далі.
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };

  // Хід 1: Алла вибирає «Міста, 100» і відповідає правильно.
  await alla.getByText('Ваш хід: виберіть клітинку').waitFor();
  await shot(host, 'board-host');
  await shot(stage, 'board-stage');
  await shot(alla, 'board-phone-chooser');
  await shot(bohdan, 'board-phone-other');
  await cell(alla, 'Міста', 100).click();
  await alla.getByRole('button', { name: /Так/ }).waitFor();
  await shot(host, 'question-host');
  await shot(stage, 'question-stage');
  await shot(alla, 'question-phone-chooser');
  await shot(bohdan, 'question-phone-other');
  expect(await seconds(stage)).toBeLessThanOrEqual(40);
  await click(host, '+15 с');
  await expect.poll(() => seconds(stage)).toBeGreaterThan(40);
  await expect.poll(() => seconds(bohdan)).toBeGreaterThan(40);
  await shot(host, 'board-time-host');
  // Алла відповідає «Ні»: помаранчева відповідь, таймер стоїть.
  await alla.getByRole('button', { name: /Ні/ }).click();
  await stage.locator('.choice.is-pending', { hasText: 'Ні' }).waitFor();
  expect(await stage.locator('.choice.is-correct').count()).toBe(0);
  await bohdan.getByText('Відповідає Алла').waitFor();
  await bohdan.locator('.choice.is-pending').waitFor();
  await host.getByRole('button', { name: 'Прийняти', ...exact }).waitFor();
  await shot(host, 'board-pending-host');
  await shot(stage, 'board-pending-stage');
  await shot(bohdan, 'board-pending-phone-other');
  const frozen = await seconds(stage);
  await stage.waitForTimeout(1500);
  expect(await seconds(stage)).toBe(frozen);
  // Перевибір: Алла бачить варіанти знову й відповідає правильно.
  await click(host, 'Перевибрати');
  await alla.getByRole('button', { name: /Так/ }).waitFor();
  await alla.getByRole('button', { name: /Так/ }).click();
  await stage.locator('.choice.is-pending', { hasText: 'Так' }).waitFor();
  await click(host, 'Прийняти');
  await stage.locator('.choice.is-correct', { hasText: 'Так' }).waitFor();
  await alla.getByText('Правильно!').waitFor();
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await toBoard();

  // Хід 2: Богдан вибирає подвоєну клітинку «Міста, 200» і відповідає правильно.
  await bohdan.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(bohdan, 'Міста', 200).click();
  await bohdan.getByRole('button', { name: /Так/ }).click();
  await click(host, 'Прийняти');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await bohdan.getByText('Правильно!').waitFor();
  await toBoard();

  // Коло 2 починає Богдан: «Річки, 100» і хибна відповідь.
  await bohdan.getByText('Ваш хід: виберіть клітинку').waitFor();
  await shot(host, 'board2-host');
  await shot(stage, 'board2-stage');
  await shot(bohdan, 'board2-phone-chooser');
  await cell(bohdan, 'Річки', 100).click();
  await bohdan.getByRole('button', { name: /Ні/ }).click();
  await click(host, 'Прийняти');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await bohdan.getByText('Неправильно').waitFor();
  await stage.locator('.choice.is-wrong', { hasText: 'Ні' }).waitFor();
  await stage.locator('.choice.is-correct', { hasText: 'Так' }).waitFor();
  await shot(stage, 'board-wrong-stage');
  await toBoard();

  // Хід Алли: ведучий завершує гру.
  await alla.getByText('Ваш хід: виберіть клітинку').waitFor();
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const podium = await stage.locator('.standings li').allTextContents();
  expect(podium[0]).toMatch(/^\d+Богдан400$/);
  expect(podium[1]).toMatch(/^\d+Алла100$/);

  // Історія: три зіграні клітинки з балами, решта поля не показана.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Вікторина-поле/ }).click();
  const played = host.locator('.rows.stacked > li');
  await played.first().waitFor();
  await shot(host, 'history');
  expect(await played.count()).toBe(3);
  expect(await played.nth(0).textContent()).toMatch(/Міста · 100.*Алла: \+100(?!\d)/);
  expect(await played.nth(1).textContent()).toMatch(/Міста · 200.*×2.*Богдан: \+400(?!\d)/);
  expect(await played.nth(2).textContent()).toMatch(/Річки · 100.*Богдан: 0(?!\d)/);

  expect(problems).toEqual([]);
}

it('a mixed board: a phone cell, blitz cells won by an opponent and by the chooser with penalty for all, a voice cell', async () => {
  try {
    await mixedBoard();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function mixedBoard() {
  const host = await open('host5', 1280, 900);

  await host.goto(base);
  await host.getByRole('link', { name: 'Я ведучий' }).click();
  await click(host, 'Створити акаунт');
  await field(host, 'Ваше ім’я').fill('Дарина Ведуча');
  await field(host, 'Email').fill('host5@example.com');
  await field(host, 'Пароль').fill('correct horse battery');
  await click(host, 'Зареєструватися');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Мішане поле');

  await click(host, '+ Раунд');
  await click(host, 'Ігрове поле');
  await host.getByRole('button', { name: 'Раунд 1', ...exact }).click();
  await click(host, 'Видалити раунд');

  await openRoundSettings(host);
  await host.locator('label.field', { hasText: 'Спосіб відповіді' }).locator('select').selectOption('phone');
  await host.locator('label.field', { hasText: 'Перевірка' }).locator('select').selectOption('auto');
  await field(host, 'Секунд').fill('40');
  await click(host, 'Застосувати');

  const categories = ['Міста', 'Річки', 'Гори'];
  for (const [column, title] of categories.entries()) {
    await field(host, `Назва категорії ${column + 1}`).fill(title);
    for (const row of [0, 1, 2]) {
      const price = (row + 1) * 100;
      await host.getByRole('button', { name: new RegExp(`^Категорія ${column + 1}, клітинка ${row + 1}: ${price}`) }).click();
      await questionText(host).fill(`${title} ${price}?`);
      await field(host, 'Варіант 1').fill('Так');
      await field(host, 'Варіант 2').fill('Ні');
      await field(host, 'Правильний: варіант 1').click();
    }
  }
  const select = (label: string) => host.locator('label.field', { hasText: label }).locator('select');
  const editCell = (column: number, row: number) =>
    host.getByRole('button', { name: new RegExp(`^Категорія ${column}, клітинка ${row}: ${row * 100}`) }).click();
  // «Річки, 100»: бліц без штрафу.
  await editCell(2, 1);
  await select('Тип клітинки').selectOption('blitz');
  // «Гори, 100»: бліц, мінус для всіх, ×2.
  await editCell(3, 1);
  await select('Тип клітинки').selectOption('blitz');
  await select('Штраф бліцу').selectOption('all');
  await select('Позначка').selectOption('x2');
  // «Міста, 200»: усна звичайна клітинка.
  await editCell(1, 2);
  await select('Як відповідати').selectOption('voice');
  // «Міста, 300»: усний бліц.
  await editCell(1, 3);
  await select('Тип клітинки').selectOption('blitz');
  await select('Як відповідати').selectOption('voice');
  await editCell(3, 1);
  await shot(host, 'cells-editor');
  await host.setViewportSize({ width: 390, height: 844 });
  await shot(host, 'cells-editor-phone');
  await host.setViewportSize({ width: 1280, height: 900 });

  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Мішане поле' }).waitFor();
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage5', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const alla = await open('alla5', 390, 844);
  const bohdan = await open('bohdan5', 360, 740);
  const vira = await open('vira5', 360, 740);
  await join(alla, code, 'Алла', false);
  await join(bohdan, code, 'Богдан', false);
  await join(vira, code, 'Віра', false);
  await stage.getByText('Віра').waitFor();

  await click(host, 'Почати гру');
  rigged.push(6, 4, 2);
  await click(host, 'Кидати кубики');
  await click(host, 'Кинути за тих, хто лишився');
  await stage.getByText('Порядок визначено').waitFor();
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');

  const cell = (page: Page, category: string, price: number) =>
    page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };
  const score = async (nickname: string) =>
    Number(
      (await host.locator('.rows > li:has(button)', { hasText: nickname }).locator('.score').first().textContent())!
        .replace('−', '-')
        .replace(/\s/g, ''),
    );

  // Хід 1: Алла, звичайна клітинка з телефона.
  await alla.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(alla, 'Міста', 100).click();
  await alla.getByRole('button', { name: /Так/ }).click();
  await click(host, 'Прийняти');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  expect(await score('Алла')).toBe(100);
  await toBoard();

  // Хід 2: Богдан, бліц без штрафу; вид клітинки ще до вибору бачать усі: пульт, сцена й телефони (план 7a), а сцена має легенду.
  await bohdan.getByText('Ваш хід: виберіть клітинку').waitFor();
  for (const page of [host, stage, alla, bohdan]) expect(await page.locator('.gb-cell.is-blitz').count()).toBeGreaterThan(0);
  await stage.getByRole('list', { name: 'Види клітинок' }).waitFor();
  await cell(bohdan, 'Річки', 100).click();
  for (const page of [stage, alla, bohdan, vira]) await page.getByText('Бліц', exact).first().waitFor();
  // Телефонний бліц з автоперевіркою миттєвий: варіанти одразу в усіх, і в того, хто вибрав клітинку.
  for (const page of [bohdan, alla]) {
    await page.getByRole('button', { name: /Так/ }).waitFor();
    expect(await page.getByRole('button', { name: 'Відповісти', ...exact }).count()).toBe(0);
  }
  await shot(alla, 'blitz-cell-buzz-phone');
  await shot(bohdan, 'blitz-cell-buzz-chooser');
  await alla.getByRole('button', { name: /Ні/ }).click();
  await stage.locator('.blitz-queue li', { hasText: 'Алла' }).waitFor();
  expect(await stage.locator('.choice.is-pending').count()).toBe(0);
  expect(await stage.locator('.choice.is-correct').count()).toBe(0);
  await vira.locator('.blitz-queue li', { hasText: 'Алла' }).waitFor();
  await shot(stage, 'blitz-cell-pending-stage');
  await shot(host, 'blitz-cell-pending-host');
  await shot(vira, 'blitz-cell-phone-other');
  await vira.getByRole('button', { name: /Так/ }).click();
  await host.locator('.blitz-queue li', { hasText: 'Віра' }).waitFor();
  await click(host, 'Прийняти');
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Віра' }).waitFor();
  await click(host, 'Прийняти');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  expect(await score('Віра')).toBe(100);
  expect(await score('Богдан')).toBe(0);
  await toBoard();

  // Хід 3: Віра, бліц «Мінус для всіх» ×2; вибирала вона, тож відповідає правильно в ×2.
  await vira.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(vira, 'Гори', 100).click();
  for (const page of [alla, bohdan, vira]) await page.getByText('Мінус для всіх, хто не відповість правильно').waitFor();
  await bohdan.getByRole('button', { name: /Ні/ }).click();
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Богдан' }).waitFor();
  await click(host, 'Прийняти');
  await vira.getByRole('button', { name: /Так/ }).click();
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Віра' }).waitFor();
  await click(host, 'Прийняти');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  expect(await score('Віра')).toBe(500);
  expect(await score('Алла')).toBe(-100);
  expect(await score('Богдан')).toBe(-200);
  await shot(stage, 'blitz-cell-reveal-stage');
  await shot(vira, 'blitz-cell-reveal-phone');
  await toBoard();

  // Коло 2 починає Богдан, а потім Віра: ведучий пропускає їхні ходи, щоб клітинку вибрала Алла.
  await bohdan.getByText('Ваш хід: виберіть клітинку').waitFor();
  await click(host, 'Пропустити хід');
  await vira.getByText('Ваш хід: виберіть клітинку').waitFor();
  await click(host, 'Пропустити хід');

  // Хід 4: Алла, усна клітинка.
  await alla.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(alla, 'Міста', 200).click();
  await alla.getByText('Відповідайте вголос').waitFor();
  await shot(alla, 'voice-cell-phone');
  await click(host, 'Зарахувати');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  expect(await score('Алла')).toBe(100);
  await toBoard();

  // Хід 5: Віра (коло 3 починає вона), усний бліц: черга чекає на ведучого, клітинку закривають без балів.
  await vira.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(vira, 'Міста', 300).click();
  await click(alla, 'Відповісти');
  await alla.getByText('Відповідайте вголос').waitFor();
  await host.getByRole('button', { name: 'Неправильно', ...exact }).waitFor();
  await shot(host, 'voice-blitz-host');
  await shot(stage, 'voice-blitz-stage');
  await click(host, 'Закрити клітинку');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  expect(await score('Алла')).toBe(100);
  expect(await score('Богдан')).toBe(-200);
  await toBoard();

  // Кінець гри.
  await alla.getByText('Ваш хід: виберіть клітинку').waitFor();
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  // Історія: бліц з балами кожного, зокрема штрафом.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Мішане поле/ }).click();
  const played = host.locator('.rows.stacked > li');
  await played.first().waitFor();
  await shot(host, 'history-cells');
  expect(await played.count()).toBe(5);
  const gory = played.filter({ hasText: 'Гори · 100' });
  expect(await gory.textContent()).toMatch(/Бліц/);
  expect(await gory.textContent()).toMatch(/Віра: \+400, Алла: −200, Богдан: −200/);

  expect(problems).toEqual([]);
}

it('a video question: link with a preview in the editor, no timer anywhere, closes when everyone answered; an unavailable video', async () => {
  try {
    await videoGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function videoGame() {
  const host = await open('host7', 1280, 900);

  await host.goto(base);
  await host.getByRole('link', { name: 'Я ведучий' }).click();
  await click(host, 'Створити акаунт');
  await field(host, 'Ваше ім’я').fill('Марта Ведуча');
  await field(host, 'Email').fill('host7@example.com');
  await field(host, 'Пароль').fill('correct horse battery');
  await click(host, 'Зареєструватися');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Вікторина з відео');

  // Запитання 1: неправильне посилання, потім правильне з часом; поля часу немає.
  await questionText(host).fill('Хто співає цю пісню?');
  await field(host, 'Варіант 1').fill('Rick Astley');
  await field(host, 'Варіант 2').fill('Sting');
  await field(host, 'Правильний: варіант 1').click();
  await field(host, 'Відео з YouTube').fill('https://www.example.com/x');
  await host.getByText('Це не посилання на відео YouTube').waitFor();
  await field(host, 'Відео з YouTube').fill('https://youtu.be/dQw4w9WgXcQ?t=1m30s');
  await host.getByText('Це не посилання на відео YouTube').waitFor({ state: 'hidden' });
  const preview = await host.locator('.video-field iframe').getAttribute('src');
  expect(preview).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  expect(preview).toContain('start=90');
  expect(preview).not.toContain('autoplay');
  expect(await host.getByLabel('Час, с', exact).count()).toBe(0);
  await shot(host, 'video-editor');

  // Запитання 2: так чи ні з відео, яке не відтворюється.
  await click(host, 'Додати запитання');
  await click(host, 'так чи ні');
  await questionText(host).fill('Так чи ні?');
  await click(host, 'Правильна відповідь: Так');
  await field(host, 'Відео з YouTube').fill(`https://www.youtube.com/watch?v=${BROKEN_VIDEO}`);

  // «Однаковий час» запитання з відео пропускає: поле часу в першому так і не з'являється.
  await openRoundSettings(host);
  await field(host, 'Секунд').fill('40');
  await click(host, 'Застосувати');
  await host.getByRole('button', { name: /^Запитання 1 / }).click();
  expect(await host.getByLabel('Час, с', exact).count()).toBe(0);

  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Вікторина з відео' }).waitFor();
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const alla = await open('alla7', 390, 844);
  const bohdan = await open('bohdan7', 360, 740);
  await join(alla, code, 'Алла', false);
  await join(bohdan, code, 'Богдан', false);
  await stage.getByText('Богдан').waitFor();

  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');

  // Запитання 1: плеєр скрізь, таймера ніде.
  const embed = 'iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]';
  for (const page of [stage, host, alla, bohdan]) await page.locator(embed).waitFor();
  for (const page of [stage, host, alla, bohdan]) expect(await page.getByRole('timer').count()).toBe(0);
  expect(await host.getByRole('button', { name: '−15 с', ...exact }).count()).toBe(0);
  expect(await host.getByRole('button', { name: '+15 с', ...exact }).count()).toBe(0);
  await shot(stage, 'video-stage');
  await shot(alla, 'video-phone');
  await shot(host, 'video-host');

  // Позначаємо iframe сцени й пульта: після закриття це має бути той самий елемент (плеєр не перемонтовується).
  for (const page of [stage, host]) await page.locator(embed).evaluate((frame) => frame.setAttribute('data-mark', 'same'));

  await alla.getByRole('button', { name: /Rick Astley/ }).click();
  await host.getByRole('button', { name: 'Закрити запитання', ...exact }).waitFor();
  expect(await host.getByRole('button', { name: 'Показати відповідь', ...exact }).count()).toBe(0);
  await bohdan.getByRole('button', { name: /Sting/ }).click();
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  for (const page of [stage, host]) await page.locator(`${embed}[data-mark="same"]`).waitFor();

  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  for (const page of [stage, host]) await page.locator(`${embed}[data-mark="same"]`).waitFor();
  // Бонусу за швидкість немає: рівно 1000.
  const allaScore = host.locator('li', { hasText: 'Алла' }).locator('.score').first();
  expect((await allaScore.textContent())!.replace(/\s/g, '')).toBe('1000');
  await click(host, 'Далі');
  await click(host, 'Наступне запитання');

  // Запитання 2: відео недоступне, плеєра немає.
  for (const page of [stage, alla, bohdan]) await page.getByText('Відео недоступне').waitFor();
  for (const page of [stage, alla, bohdan]) expect(await page.locator('iframe').count()).toBe(0);
  await shot(alla, 'video-unavailable-phone');
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  // Останнє запитання єдиного раунду: після «Далі» гра завершується сама.
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  expect(problems).toEqual([]);
}

it('a final round: secret wagers, a video question without a timer, a one-by-one reveal and the history', async () => {
  try {
    await finalGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Увесь видимий текст сторінки. */
const bodyText = (page: Page) => page.locator('body').innerText();

/** Телефон на своїй ширині: без прокручування вбік. */
async function expectNoSideScroll(page: Page, name: string) {
  const fits = (await page.evaluate('document.documentElement.scrollWidth <= innerWidth')) as boolean;
  expect(fits, `${name}: horizontal scroll`).toBe(true);
  await shot(page, name);
}

async function finalGame() {
  const host = await open('host9', 1280, 900);

  await host.goto(base);
  await host.getByRole('link', { name: 'Я ведучий' }).click();
  await click(host, 'Створити акаунт');
  await field(host, 'Ваше ім’я').fill('Надія Ведуча');
  await field(host, 'Email').fill('host9@example.com');
  await field(host, 'Пароль').fill('correct horse battery');
  await click(host, 'Зареєструватися');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Вікторина з фіналом');

  // Класичний раунд: без бонусу за швидкість, одне запитання за 1000.
  await openRoundSettings(host);
  await field(host, 'Бали за швидкість: швидша правильна відповідь дає більше').setChecked(false);
  await questionText(host).fill('Столиця України?');
  await field(host, 'Варіант 1').fill('Львів');
  await field(host, 'Варіант 2').fill('Київ');
  await field(host, 'Правильний: варіант 2').click();

  // Фінал: тема, одне запитання з відео, без полів «Бали» й «Час, с».
  await click(host, '+ Раунд');
  await click(host, 'Фінал');
  await openRoundSettings(host);
  await field(host, 'Тема фіналу').fill('Космос');
  await questionText(host).fill('Яка планета найбільша?');
  await field(host, 'Варіант 1').fill('Сатурн');
  await field(host, 'Варіант 2').fill('Юпітер');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Відео з YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
  expect(await host.getByLabel('Бали', exact).count()).toBe(0);
  expect(await host.getByLabel('Час, с', exact).count()).toBe(0);

  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Вікторина з фіналом' }).waitFor();
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage9', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const alla = await open('alla9', 390, 844);
  const bohdan = await open('bohdan9', 360, 740);
  const vira = await open('vira9', 360, 740);
  await join(alla, code, 'Алла', false);
  await join(bohdan, code, 'Богдан', false);
  await join(vira, code, 'Віра', false);
  await stage.getByText('Віра').waitFor();

  // Класичний раунд: Алла й Богдан по 1000, Віра неправильно.
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  await alla.getByRole('button', { name: /Київ/ }).click();
  await bohdan.getByRole('button', { name: /Київ/ }).click();
  await vira.getByRole('button', { name: /Львів/ }).click();
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');

  // Фінал: сцена показує тему.
  await stage.getByRole('heading', { name: 'Космос' }).waitFor();
  await click(host, 'Почати фінал');

  // Ставки: у Віри рахунок 0, їй доступна лише «Поставити 0».
  await bohdan.getByText('Ваша ставка від 0 до 1000').waitFor();
  await vira.getByRole('button', { name: 'Поставити 0', ...exact }).waitFor();
  await expectNoSideScroll(bohdan, 'final-wager-phone-360');
  await shot(bohdan, 'final-wager-phone');
  await expectNoSideScroll(vira, 'final-wager-phone-zero-360');
  await alla.getByLabel('Ставка', exact).fill('1000');
  await click(alla, 'Поставити');
  await alla.getByText('Ваша ставка: 1000').waitFor();
  await bohdan.getByLabel('Ставка', exact).fill('300');
  await click(bohdan, 'Поставити');
  await bohdan.getByText('Ваша ставка: 300').waitFor();
  await host.getByText('Поставили 2 з 3').waitFor();
  await stage.getByText('Ставки зроблено: 2 з 3').waitFor();
  // Ставки таємні: ні сцена, ні чужі телефони їх не показують.
  expect(await bodyText(stage)).not.toContain('Ставка');
  expect(await bodyText(vira)).not.toMatch(/1000|300/);
  expect(await bodyText(bohdan)).not.toContain('Ставка: 1000');
  await shot(stage, 'final-wager-stage');
  await shot(host, 'final-wager-host');

  await click(vira, 'Поставити 0');
  // Поставили всі: запитання відкривається само, кнопки ведучій не треба.
  const embed = 'iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]';
  for (const page of [stage, host, alla, bohdan, vira]) await page.locator(embed).waitFor();
  for (const page of [stage, host, alla, bohdan, vira]) expect(await page.getByRole('timer').count()).toBe(0);
  expect(await host.getByRole('button', { name: '−15 с', ...exact }).count()).toBe(0);
  expect(await host.getByRole('button', { name: '+15 с', ...exact }).count()).toBe(0);

  // Алла помиляється, Богдан і Віра відповідають правильно; запитання закривається саме.
  await alla.getByRole('button', { name: /Сатурн/ }).click();
  await bohdan.getByRole('button', { name: /Юпітер/ }).click();
  // Під час запитання чужих ставок і нових рахунків ніде немає.
  expect(await bodyText(vira)).not.toMatch(/1000|300/);
  expect(await bodyText(stage)).not.toMatch(/Ставка|→|1300/);
  await vira.getByRole('button', { name: /Юпітер/ }).click();
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();

  // Розкриття по одному: Віра, Алла, Богдан.
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Наступний гравець', ...exact }).waitFor();
  for (const page of [stage, alla, bohdan, vira]) expect(await bodyText(page)).not.toMatch(/Ставка 1000|Ставка 300|1300/);
  await shot(host, 'final-reveal-host');
  const row = (name: string) => stage.locator('.wager-list li', { hasText: name });
  await click(host, 'Наступний гравець');
  await row('Віра').waitFor();
  expect((await row('Віра').textContent())!.replace(/\s/g, '')).toContain('0→0');
  expect(await row('Алла').count()).toBe(0);
  await bohdan.getByText('Чекаємо на розкриття').waitFor();
  await alla.getByText('Чекаємо на розкриття').waitFor();
  for (const page of [stage, alla, bohdan]) expect(await bodyText(page)).not.toMatch(/Ставка 1000|Ставка 300|1300/);
  await click(host, 'Наступний гравець');
  await row('Алла').waitFor();
  expect((await row('Алла').textContent())!.replace(/\s/g, '')).toContain('1000→0');
  expect(await row('Богдан').count()).toBe(0);
  await bohdan.getByText('Чекаємо на розкриття').waitFor();
  for (const page of [stage, bohdan]) expect(await bodyText(page)).not.toMatch(/Ставка 300|1300/);
  // Найновіший розкритий рядок видно на екрані сцени без прокрутки.
  const latest = await stage.locator('.wager-latest').boundingBox();
  const viewport = stage.viewportSize();
  expect(latest).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(latest!.y).toBeGreaterThanOrEqual(0);
  expect(latest!.y + latest!.height).toBeLessThanOrEqual(viewport!.height);
  await shot(stage, 'final-reveal-stage');
  await click(host, 'Наступний гравець');
  await row('Богдан').waitFor();
  expect((await row('Богдан').textContent())!.replace(/\s/g, '')).toContain('1000→1300');
  await bohdan.getByText('+300').waitFor();

  // Подіум: Богдан першим з 1300, решта по 0.
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const podium = (await stage.locator('.standings li').allTextContents()).map((text) => text.replace(/\s/g, ''));
  expect(podium[0]).toContain('Богдан');
  expect(podium[0]).toContain('1300');
  expect(podium[1]).toMatch(/(Алла|Віра)\D*0$/);
  expect(podium[2]).toMatch(/(Алла|Віра)\D*0$/);

  // Історія: ставки фіналу.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Вікторина з фіналом/ }).click();
  await host.getByText('Ставки фіналу').waitFor();
  const lines = (await host.locator('.wager-list li').allTextContents()).map((text) => text.replace(/\s/g, ''));
  expect(lines).toEqual(expect.arrayContaining(['Алла:ставка1000,−1000', 'Богдан:ставка300,+300', 'Віра:ставка0,0']));

  expect(problems).toEqual([]);
}

it('the menu stays off the game screens; a player’s profile counts the game, changes nickname and avatar, and gets a friend', async () => {
  try {
    await menuProfileFriends();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

const MENU = 'nav[aria-label="Меню"]';
const menuLinks = async (page: Page) =>
  (await page.locator(MENU).getByRole('link').allTextContents()).map((text) => text.replace(/^[^\p{L}]+/u, ''));

/** Телефон: сторінка не гортається вбік, а нижня панель не закриває останній елемент. */
async function expectPhoneFit(page: Page, name: string) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  const fit = (await page.evaluate(`(() => {
    let last = document.querySelector('main') ?? document.body;
    while (last.lastElementChild) last = last.lastElementChild;
    return { wide: document.documentElement.scrollWidth <= innerWidth, bottom: last.getBoundingClientRect().bottom };
  })()`)) as { wide: boolean; bottom: number };
  const bar = await page.locator(MENU).boundingBox();
  // Підписи карток статистики не розриваються посеред слова: кожне слово займає один рядок.
  const split = (await page.evaluate(`(() => {
    const broken = [];
    for (const dt of document.querySelectorAll('.stat dt')) {
      const node = dt.firstChild;
      if (!node || node.nodeType !== 3) continue;
      for (const match of node.textContent.matchAll(/\\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        if (range.getClientRects().length > 1) broken.push(match[0]);
      }
    }
    return broken;
  })()`)) as string[];
  expect(split, `${name}: stat label words are split`).toEqual([]);
  expect(fit.wide, `${name}: horizontal scroll`).toBe(true);
  expect(bar).not.toBeNull();
  expect(fit.bottom, `${name}: the menu covers the last element`).toBeLessThanOrEqual(bar!.y + 0.5);
  await shot(page, name);
}

const stat = (page: Page, label: string) =>
  page.locator('.stat').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) });

async function menuProfileFriends() {
  // 1. Відвідувач на телефоні: лише «Приєднатися» й «Увійти», панель унизу.
  const visitor = await open('visitor', 390, 844);
  await visitor.goto(base);
  await visitor.locator(MENU).getByRole('link', { name: 'Увійти' }).waitFor();
  expect(await menuLinks(visitor)).toEqual(['Приєднатися', 'Увійти']);
  const barBox = (await visitor.locator(MENU).boundingBox())!;
  expect(Math.abs(barBox.y + barBox.height - 844)).toBeLessThanOrEqual(2);
  await shot(visitor, 'menu-visitor-phone');

  // 2. Ведуча на комп'ютері: чотири пункти, рядок угорі.
  const host = await open('host8', 1280, 900);
  await host.goto(base);
  await host.getByRole('link', { name: 'Я ведучий' }).click();
  await click(host, 'Створити акаунт');
  await field(host, 'Ваше ім’я').fill('Галина Ведуча');
  await field(host, 'Email').fill('host8@example.com');
  await field(host, 'Пароль').fill('correct horse battery');
  await click(host, 'Зареєструватися');
  await host.locator(MENU).getByRole('link', { name: 'Профіль' }).waitFor();
  expect(await menuLinks(host)).toEqual(['Приєднатися', 'Мої вікторини', 'Історія', 'Профіль']);
  expect((await host.locator(MENU).boundingBox())!.y).toBeLessThanOrEqual(1);
  await shot(host, 'menu-host-desktop');

  const saved = await host.request.post(`${base}/api/quizzes`, { data: makeQuiz([single], { speedBonus: false }) });
  expect(saved.ok()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  expect(await host.locator(MENU).count()).toBe(0);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage8', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  expect(await stage.locator(MENU).count()).toBe(0);

  // 3. Гравець на телефоні: реєстрація з меню, повернення на «Приєднатися»; гість без акаунта.
  const olya = await open('olya8', 390, 844);
  await olya.goto(base);
  await olya.locator(MENU).getByRole('link', { name: 'Увійти' }).click();
  await click(olya, 'Створити акаунт');
  await field(olya, 'Ваше ім’я').fill('Оля Гравець');
  await field(olya, 'Email').fill('olya8@example.com');
  await field(olya, 'Пароль').fill('correct horse battery');
  await click(olya, 'Зареєструватися');
  await olya.locator(MENU).getByRole('link', { name: 'Профіль' }).waitFor();
  await olya.locator(MENU).getByRole('link', { name: 'Приєднатися' }).click();
  await field(olya, 'Код гри').fill(code);
  await click(olya, 'Увійти');
  await field(olya, 'Ваше ім’я').fill('Оля');
  await click(olya, 'Увійти в гру');
  await olya.getByText('Ви в грі. Чекаємо на старт.').waitFor();
  expect(await olya.locator(MENU).count()).toBe(0);

  const taras = await open('taras8', 360, 740);
  await join(taras, code, 'Тарас', false);
  expect(await taras.locator(MENU).count()).toBe(0);
  await stage.getByText('Тарас').waitFor();

  // 4. Гра: Оля вибирає правильне, Тарас неправильне.
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  await olya.getByRole('button', { name: /Київ/ }).click();
  await taras.getByRole('button', { name: /Львів/ }).click();
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  expect(await stage.locator(MENU).count()).toBe(0);
  expect(await host.locator(MENU).count()).toBe(0);

  // 5. Профіль Олі.
  await olya.goto(base);
  await olya.locator(MENU).getByRole('link', { name: 'Профіль' }).click();
  await olya.getByRole('heading', { name: 'Статистика' }).waitFor();
  expect(await stat(olya, 'гра').textContent()).toBe('1гра');
  expect(await stat(olya, 'перемога').textContent()).toBe('1перемога');
  expect(await stat(olya, 'правильних відповідей').textContent()).toBe('100%правильних відповідей');
  for (const name of ['Перша гра', 'Перша перемога']) {
    expect(await olya.locator('.achievements li:not(.locked)', { hasText: name }).count()).toBe(1);
  }
  expect(await olya.getByLabel('10 ігор (ще не отримано)', exact).count()).toBe(1);
  await olya.locator('.profile-list li', { hasText: '«Тестова вікторина», 1 місце' }).waitFor();
  await shot(olya, 'profile-own-phone');

  // Нікнейм за замовчуванням — лише ім'я з акаунта «Оля Гравець».
  await olya.getByRole('heading', { name: 'Оля', exact: true }).waitFor();
  await click(olya, 'Змінити нікнейм / аватар');
  await field(olya, 'Нікнейм').fill('Зірка');
  await olya.locator('.profile-editor input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: avatarPng() });
  await olya.locator('.profile-editor img').waitFor();
  await click(olya, 'Зберегти');
  await olya.getByRole('heading', { name: 'Зірка' }).waitFor();
  await olya.getByAltText('Аватар Зірка').first().waitFor();
  await olya.getByRole('link', { name: 'Мій публічний профіль' }).click();
  await olya.waitForURL(/\/profile\/[^/]+$/);
  const publicUrl = olya.url();
  const olyaId = publicUrl.slice(publicUrl.lastIndexOf('/') + 1);
  await olya.getByText('email приховано').waitFor();

  // Телефон 375 пікселів: без прокручування вбік, панель не закриває кінець сторінки.
  await expectPhoneFit(olya, 'profile-public-phone-375');
  await olya.goto(base);
  await olya.locator(MENU).getByRole('link', { name: 'Профіль' }).waitFor();
  await expectPhoneFit(olya, 'home-phone-375');
  await olya.goto(`${base}/profile`);
  await olya.getByRole('heading', { name: 'Статистика' }).waitFor();
  await expectPhoneFit(olya, 'profile-own-phone-375');
  await visitor.setViewportSize({ width: 375, height: 812 });
  await visitor.goto(base);
  await visitor.locator(MENU).getByRole('link', { name: 'Увійти' }).waitFor();
  await expectPhoneFit(visitor, 'home-visitor-phone-375');

  // 6. Ведуча відкриває публічний профіль Олі і додає її в друзі.
  await host.goto(publicUrl);
  await host.getByRole('heading', { name: 'Зірка', exact: true }).waitFor();
  await host.getByText('email приховано').waitFor();
  expect(await host.content()).not.toContain('olya8@example.com');
  await shot(host, 'profile-public-desktop');
  await host.getByRole('button', { name: 'Додати в друзі', ...exact }).click();
  await host.getByText('У друзях', exact).waitFor();

  await host.locator(MENU).getByRole('link', { name: 'Профіль' }).click();
  await host.getByRole('heading', { name: 'Статистика' }).waitFor();
  expect(await stat(host, 'проведена гра').textContent()).toBe('1проведена гра');
  expect(await host.locator('.achievements li:not(.locked)', { hasText: 'Ведучий' }).count()).toBe(1);
  const friend = host.locator('.friend-list a', { hasText: 'Зірка' });
  await friend.waitFor();
  await shot(host, 'profile-own-desktop');
  await friend.click();
  await host.waitForURL(`${base}/profile/${olyaId}`);
  await host.getByRole('heading', { name: 'Зірка', exact: true }).waitFor();

  // 7. Приватність через API: у відповіді немає приватних ключів.
  const response = await host.request.get(`${base}/api/profiles/${olyaId}`);
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as Record<string, unknown>;
  for (const key of ['email', 'quizzes', 'friends', 'wins']) expect(body).not.toHaveProperty(key);

  expect(problems).toEqual([]);
}

/** Вводить слово ланцюжка й тисне «Перевірити». */
async function guess(page: Page, word: string, accepted = true): Promise<void> {
  await field(page, 'Наступне слово').fill(word);
  await click(page, 'Перевірити');
  // Наступне слово вводимо, лише коли відповідь сервера вже оброблено: поле очистилося (або форма зникла).
  if (accepted) {
    await page.waitForFunction(
      "(() => { const input = document.querySelector('.chain-form input'); return input === null || input.value === ''; })()",
    );
  }
}

const LONG_WORD = 'Найнайнайвисокогірнішоокеанний';

it('a word chain: first letters for all, a private hint with time penalty, the fastest wins', async () => {
  try {
    await chainGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function chainGame() {
  const host = await open('host10', 1280, 900);

  await host.goto(base);
  await host.getByRole('link', { name: 'Я ведучий' }).click();
  await click(host, 'Створити акаунт');
  await field(host, 'Ваше ім’я').fill('Ірина Ведуча');
  await field(host, 'Email').fill('host10@example.com');
  await field(host, 'Пароль').fill('correct horse battery');
  await click(host, 'Зареєструватися');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Ланцюжок');

  // Редактор: ланцюжок з п'яти слів, підказка 5 с, час 60 с, відео немає.
  await click(host, 'ланцюжок');
  await questionText(host).fill('Від форелі до корабля');
  await field(host, 'Слово 1').fill('Форель');
  await field(host, 'Слово 2').fill('Риба');
  await field(host, 'Слово 3').fill('Океан');
  await click(host, 'Додати слово');
  await field(host, 'Слово 4').fill(LONG_WORD);
  await click(host, 'Додати слово');
  await field(host, 'Слово 5').fill('Корабель');
  await field(host, 'Підказка додає, с').fill('5');
  await field(host, 'Час, с').fill('60');
  expect(await host.getByLabel('Відео з YouTube', exact).count()).toBe(0);
  await shot(host, 'chain-editor');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Ланцюжок' }).waitFor();
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage10', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya10', 390, 844);
  const taras = await open('taras10', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await stage.getByText('Тарас').waitFor();

  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');

  // Перше слово й перші літери видно всім, решти слів у сторінці немає.
  await stage.getByText('Форель').first().waitFor();
  await stage.getByLabel('Р___', exact).waitFor();
  await olya.getByLabel('Р___', exact).waitFor();
  await taras.getByLabel('Р___', exact).waitFor();
  for (const page of [stage, olya, taras]) {
    const text = (await bodyText(page)).toLowerCase();
    for (const hidden of ['риба', 'океан', 'корабель', LONG_WORD.toLowerCase()]) expect(text).not.toContain(hidden);
    const html = (await page.content()).toLowerCase();
    for (const hidden of ['риба', 'океан', 'корабель']) expect(html).not.toContain(hidden);
  }
  await shot(stage, 'chain-stage-question');

  // Тарас: хибне слово, потім приватна підказка.
  await guess(taras, 'Сом', false);
  await taras.getByText('Не те слово. Спробуйте ще.').waitFor();
  await click(taras, 'Підказка (+5 с)');
  await taras.getByLabel('Ри__', exact).waitFor();
  expect(await olya.getByLabel('Р___', exact).count()).toBe(1);
  expect(await olya.getByLabel('Ри__', exact).count()).toBe(0);
  expect(await stage.getByLabel('Ри__', exact).count()).toBe(0);
  await taras.getByText(/Ваш час: \d+(,\d+)? с/).waitFor();
  const penalised = await taras.locator('.chain-clock').textContent();
  expect(Number(penalised!.match(/(\d+(?:,\d+)?)/)![1]!.replace(',', '.'))).toBeGreaterThanOrEqual(5);
  await expectNoSideScroll(taras, 'chain-phone-360');
  await shot(taras, 'chain-phone-hint');

  // Оля проходить ланцюжок першою.
  await guess(olya, 'риба');
  await guess(olya, 'Океан');
  await guess(olya, LONG_WORD.toLowerCase());
  await guess(olya, 'Корабель');
  await olya.getByText(/Ланцюжок пройдено за/).waitFor();
  await stage.getByText('Пройшли 1 з 2').waitFor();
  const olyaBoard = stage.locator('.chain-board li', { hasText: 'Оля' });
  await olyaBoard.waitFor();
  expect(await olyaBoard.textContent()).toMatch(/\d+(,\d+)? с/);
  await host.getByRole('heading', { name: 'Ланцюжок', exact: true }).waitFor();
  await shot(stage, 'chain-stage-progress');
  await shot(host, 'chain-host');

  // Тарас доходить до кінця: запитання закривається само.
  await guess(taras, 'Риба');
  await guess(taras, 'Океан');
  await expectNoSideScroll(taras, 'chain-phone-360-long');
  // Довге слово лишається в одному рядку (не вище за коротке), поле не менше 16 px, кнопки видно без прокручування.
  const layout = await taras.evaluate(
    "(() => { const words = [...document.querySelectorAll('.chain-play .chain-word')].map((w) => w.getBoundingClientRect().height); const input = document.querySelector('.chain-form input'); const buttons = [...document.querySelectorAll('.chain-form .btn')].map((b) => b.getBoundingClientRect().bottom); return { words, font: parseFloat(getComputedStyle(input).fontSize), bottom: Math.max(...buttons), viewport: window.innerHeight }; })()",
  ) as { words: number[]; font: number; bottom: number; viewport: number };
  expect(Math.max(...layout.words)).toBeLessThan(Math.min(...layout.words) * 1.5);
  expect(layout.font).toBeGreaterThanOrEqual(16);
  expect(layout.bottom).toBeLessThanOrEqual(layout.viewport);
  await guess(taras, LONG_WORD);
  await guess(taras, 'Корабель');
  await taras.getByText('Чекаємо на результати').waitFor();
  await taras.getByRole('heading', { name: /Ланцюжок пройдено за/ }).waitFor();
  await expectNoSideScroll(taras, 'chain-phone-locked');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();

  // Розкриття: ланцюжок зеленим, рейтинг за часом.
  await click(host, 'Показати відповідь');
  await stage.locator('.chain-words.is-correct').getByLabel('Риба', exact).waitFor();
  const first = stage.locator('.chain-board li').first();
  expect(await first.textContent()).toContain('Оля');
  expect((await first.textContent())!.replace(/\s/g, '')).toContain('+1000');
  await taras.getByText('Правильно!').waitFor();
  const earned = Number((await taras.locator('.earned').textContent())!.replace(/\D/g, ''));
  expect(earned).toBeGreaterThanOrEqual(500);
  expect(earned).toBeLessThanOrEqual(999);
  await shot(stage, 'chain-stage-reveal');
  await shot(taras, 'chain-phone-reveal');

  // Подіум: Оля перша.
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const podium = await stage.locator('.standings li').allTextContents();
  expect(podium[0]).toContain('Оля');
  expect(podium[1]).toContain('Тарас');

  // Історія: підсумок ланцюжка в відповіді.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Ланцюжок/ }).click();
  const chainQuestion = host.locator('.rows.stacked > li', { hasText: 'Від форелі до корабля' });
  await chainQuestion.getByText('Відповіді (2)').click();
  const olyaRow = chainQuestion.locator('.responses li', { hasText: 'Оля' });
  await olyaRow.getByText(/Пройдено за/).waitFor();
  await shot(host, 'history-chain');

  expect(problems).toEqual([]);
}

it('a host invites a friend from the lobby; the friend sees the badge, joins from the profile, and they compare', async () => {
  try {
    await invitesAndVersus();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function register(page: Page, via: 'host' | 'menu', name: string, email: string) {
  await page.goto(base);
  if (via === 'host') await page.getByRole('link', { name: 'Я ведучий' }).click();
  else await page.locator(MENU).getByRole('link', { name: 'Увійти' }).click();
  await click(page, 'Створити акаунт');
  await field(page, 'Ваше ім’я').fill(name);
  await field(page, 'Email').fill(email);
  await field(page, 'Пароль').fill('correct horse battery');
  await click(page, 'Зареєструватися');
  await page.locator(MENU).getByRole('link', { name: 'Профіль' }).waitFor();
}

async function myId(page: Page): Promise<string> {
  const me = (await (await page.request.get(`${base}/api/me`)).json()) as { id?: string; user?: { id: string } };
  return (me.user?.id ?? me.id)!;
}

const noSideScroll = (page: Page) => page.evaluate('document.documentElement.scrollWidth <= innerWidth');

/** Один круг гри: ведуча стартує, гравці відповідають (Київ правильно, Львів ні), гра доходить до фінішу. */
async function playOut(host: Page, answers: [Page, boolean][]) {
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  for (const [page, right] of answers) await page.getByRole('button', { name: right ? /Київ/ : /Львів/ }).click();
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await click(host, 'Далі');
  await host.getByText('Гру завершено').first().waitFor();
}

async function invitesAndVersus() {
  const host = await open('inv-host', 1280, 900);
  await register(host, 'host', 'Ніна Ведуча', 'invhost@example.com');
  const olya = await open('inv-olya', 375, 812);
  await register(olya, 'menu', 'Оксана Гравець', 'involya@example.com');
  const hostId = await myId(host);
  const olyaId = await myId(olya);
  expect((await host.request.put(`${base}/api/me/friends/${olyaId}`)).ok()).toBe(true);

  const quiz = { ...makeQuiz([single], { speedBonus: false }), title: 'Вечір друзів' };
  expect((await host.request.post(`${base}/api/quizzes`, { data: quiz })).ok()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);

  // Запрошення з лобі.
  await click(host, 'Запросити друзів');
  const row = host.locator('.invite-friends li', { hasText: 'Оксана' });
  await row.getByRole('button', { name: 'Запросити', ...exact }).click();
  await row.getByRole('button', { name: 'Запрошено', ...exact }).waitFor();
  await shot(host, 'invite-lobby-host');
  await host.setViewportSize({ width: 375, height: 812 });
  expect(await noSideScroll(host), 'invite panel on 375: horizontal scroll').toBe(true);
  const nameBox = (await row.locator('.name').boundingBox())!;
  const buttonBox = (await row.getByRole('button', { name: 'Запрошено', ...exact }).boundingBox())!;
  expect(buttonBox.y < nameBox.y + nameBox.height && nameBox.y < buttonBox.y + buttonBox.height, 'invite row on 375: button on the name line').toBe(true);
  await shot(host, 'invite-lobby-host-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  // Позначка в меню на телефоні.
  await olya.goto(base);
  const badge = olya.getByLabel('Запрошень: 1', exact);
  await badge.waitFor();
  const item = (await olya.locator(MENU).getByRole('link', { name: /Профіль/ }).boundingBox())!;
  const mark = (await badge.boundingBox())!;
  expect(mark.height).toBeLessThanOrEqual(22);
  expect(mark.x).toBeGreaterThanOrEqual(item.x - 0.5);
  expect(mark.y).toBeGreaterThanOrEqual(item.y - 0.5);
  expect(mark.x + mark.width).toBeLessThanOrEqual(item.x + item.width + 0.5);
  expect(mark.y + mark.height).toBeLessThanOrEqual(item.y + item.height + 0.5);
  await shot(olya, 'invite-badge-phone');
  await olya.locator(MENU).getByRole('link', { name: /Профіль/ }).click();
  await olya.getByRole('heading', { name: 'Вас запросили' }).waitFor();
  await olya.getByText(`Ніна запрошує: «Вечір друзів», код ${code.slice(0, 3)} ${code.slice(3)}`).waitFor();
  await expectPhoneFit(olya, 'invite-profile-phone-375');

  // Сторонній користувач нічого не бачить і не може запрошувати.
  const vira = await open('inv-vira', 390, 844);
  await register(vira, 'menu', 'Віра', 'invvira@example.com');
  const viraId = await myId(vira);
  expect(await (await vira.request.get(`${base}/api/me/invites`)).json()).toEqual([]);
  const foreign = await vira.request.post(`${base}/api/games/by-code/${code}/invites`, { data: { userIds: [olyaId] } });
  expect(foreign.status()).toBe(404);

  // Оксана приєднується з профілю.
  await olya.locator('.invite-list').getByRole('link', { name: 'Приєднатися', ...exact }).click();
  await olya.waitForURL(`${base}/play/${code}`);
  await field(olya, 'Ваше ім’я').fill('Оксана');
  await click(olya, 'Увійти в гру');
  await olya.getByText('Ви в грі. Чекаємо на старт.').waitFor();
  const taras = await open('inv-taras', 360, 740);
  await join(taras, code, 'Тарас', false);
  await playOut(host, [[olya, true], [taras, false]]);
  expect(await (await olya.request.get(`${base}/api/me/invites`)).json()).toEqual([]);

  // Ведуча не грала в спільних іграх.
  await host.goto(`${base}/profile/${olyaId}`);
  await host.getByRole('heading', { name: 'Ви і Оксана' }).waitFor();
  await host.getByText('Ви ще не грали разом.').waitFor();

  // Друга гра: Оксана й Віра з акаунтів.
  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code2 = host.url().slice(-6);
  await join(olya, code2, 'Оксана', false);
  await join(vira, code2, 'Віра', false);
  await playOut(host, [[olya, true], [vira, false]]);

  await olya.goto(`${base}/profile/${viraId}`);
  await olya.getByRole('heading', { name: 'Ви і Віра' }).waitFor();
  await stat(olya, 'гра разом').waitFor();
  expect(await stat(olya, 'гра разом').textContent()).toBe('1гра разом');
  expect(await stat(olya, 'гра, де ви вище').textContent()).toBe('1гра, де ви вище');
  expect(await stat(olya, 'ігор, де Віра вище').textContent()).toBe('0ігор, де Віра вище');
  expect(await stat(olya, 'правильних відповідей у вас').textContent()).toBe('100%правильних відповідей у вас');
  expect(await stat(olya, 'правильних відповідей — Віра').textContent()).toBe('0%правильних відповідей — Віра');
  await olya.locator('.versus-games li', { hasText: '«Вечір друзів»: ви — 1 місце, Віра — 2 місце' }).waitFor();
  await expectPhoneFit(olya, 'versus-phone-375');
  await vira.goto(`${base}/profile/${olyaId}`);
  await vira.getByRole('heading', { name: 'Ви і Оксана' }).waitFor();
  await vira.setViewportSize({ width: 1280, height: 900 });
  await shot(vira, 'versus-desktop');

  // Нові ачівки.
  await olya.goto(`${base}/profile`);
  await olya.getByRole('heading', { name: 'Статистика' }).waitFor();
  expect(await olya.locator('.achievements li').count()).toBe(16);
  expect(await noSideScroll(olya)).toBe(true);
  await shot(olya, 'achievements-16-phone');

  // Приватність на рівні API.
  const anonymous = await browser.newContext();
  const denied = await anonymous.request.get(`${base}/api/me/versus/${olyaId}`);
  expect(denied.status()).toBe(401);
  await anonymous.close();
  const versusText = await (await olya.request.get(`${base}/api/me/versus/${viraId}`)).text();
  expect(versusText).not.toContain('Тарас');
  expect(versusText).not.toContain('@');
  expect(versusText).not.toContain(hostId);
  const publicProfile = (await (await host.request.get(`${base}/api/profiles/${olyaId}`)).json()) as Record<string, unknown>;
  expect(Object.keys(publicProfile).sort()).toEqual(['achievements', 'avatar', 'following', 'id', 'nickname', 'stats']);

  expect(problems).toEqual([]);
}

it('part 7a: a bigger coloured board with a legend, round facts, the host timer, options and verdict blinks for everyone, a masked video, order labels and picture options', async () => {
  try {
    await clarityGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function clarityGame() {
  const host = await open('host7a', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host7a@example.com');

  // Картинки варіантів: завантаження у сховище, як у редакторі.
  const upload = async () => {
    const response = await host.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } });
    expect(response.ok()).toBe(true);
    return ((await response.json()) as { url: string }).url;
  };
  const [flagA, flagB] = [await upload(), await upload(), await upload(), await upload()];

  const oceans = {
    ...order,
    id: 'q-order',
    text: 'Розставте океани від найбільшого до найменшого',
    items: [
      { id: 'p', text: 'Тихий' },
      { id: 'a', text: 'Атлантичний' },
      { id: 'i', text: 'Індійський' },
      { id: 'n', text: 'Північний Льодовитий' },
    ],
    topLabel: 'Найбільший',
    bottomLabel: 'Найменший',
    timeLimit: 30,
  };
  const flags = {
    ...single,
    id: 'q-flag',
    text: 'Який прапор України?',
    options: [
      { id: 'a', text: '', imageUrl: flagA! },
      { id: 'b', text: 'Польща', imageUrl: flagB! },
      { id: 'c', text: 'Італія' },
    ],
    correctId: 'a',
    timeLimit: 20,
  };
  const titles = ['Географія та подорожі світом', 'Міста', 'Річки', 'Гори', 'Озера', 'Моря', 'Країни', 'Острови'];
  const special: Record<string, object> = {
    'Міста 200': { answerMode: 'voice' },
    'Міста 300': { mark: 'x2' },
    'Річки 100': { kind: 'blitz', penalty: 'all' },
    'Гори 300': { mark: 'x3' },
  };
  const categories = titles.map((title, column) => ({
    title,
    cells: [100, 200, 300].map((price) => ({
      ...special[`${title} ${price}`],
      question: withPoints(withId(single, `q-${column}-${price}`), price),
    })),
  }));
  const data = {
    ...makeRoundsQuiz([
      classicRound('r1', [oceans, flags, withId(withVideo(single), 'q-video')], { speedBonus: false }),
      boardRound('r2', categories),
    ]),
    title: 'Ясність',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7a', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya7a', 375, 812);
  const taras = await open('taras7a', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await stage.getByText('Тарас').waitFor();

  // 1. Заставка раунду 1: кількість запитань і час (відео без таймера не рахується).
  await click(host, 'Почати гру');
  for (const page of [stage, olya, host]) await page.locator('.round-facts', { hasText: '3 запитання · 20–30 с на кожне' }).waitFor();
  await shot(stage, 'intro-facts-stage');
  await shot(olya, 'intro-facts-phone');

  // 2. Порядок з підписами; таймер «/ 30 с» на сцені й у ведучого.
  await click(host, 'Почати раунд');
  await stage.locator('.bar', { hasText: 'Запитання 1 з 3 · лишилося 2' }).waitFor();
  await stage.locator('.timer-total', { hasText: '/ 30 с' }).waitFor();
  const top = olya.locator('.order-label.is-top');
  const bottom = olya.locator('.order-label.is-bottom');
  expect(await top.textContent()).toBe('↑ Найбільший');
  expect(await bottom.textContent()).toBe('↓ Найменший');
  const list = (await olya.locator('ol.order').boundingBox())!;
  expect((await top.boundingBox())!.y).toBeLessThan(list.y);
  expect((await bottom.boundingBox())!.y).toBeGreaterThan(list.y + list.height - 1);
  await stage.getByText('Розставте на телефоні: зверху — Найбільший, знизу — Найменший', exact).waitFor();
  await host.getByRole('timer').waitFor();
  await host.locator('.host-time .timer-total', { hasText: '/ 30 с' }).waitFor();
  await shot(olya, 'order-labels-phone');
  await shot(stage, 'order-labels-stage');
  await shot(host, 'timer-host');
  // Рядок таймера ведучого (таймер і ±15 с) на телефоні 375 px не виходить за край.
  await host.setViewportSize({ width: 375, height: 812 });
  const row = host.locator('.host-time');
  expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const rowBox = (await row.boundingBox())!;
  for (const part of await row.locator('.timer, button').all()) {
    const box = (await part.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(rowBox.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
  }
  await expectNoSideScroll(host, 'timer-host-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  await arrange(olya, ['Тихий', 'Атлантичний', 'Індійський', 'Північний Льодовитий']);
  await click(olya, 'Відповісти');
  await arrange(taras, ['Атлантичний', 'Тихий', 'Індійський', 'Північний Льодовитий']);
  await click(taras, 'Відповісти');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await stage.locator('.answer', { hasText: '(зверху — Найбільший, знизу — Найменший)' }).waitFor();
  await shot(stage, 'order-labels-reveal-stage');
  await click(host, 'Далі');
  await click(host, 'Наступне запитання');

  // 3. Варіанти-картинки: сітка з літерами на сцені, мініатюри на телефоні.
  await stage.locator('.choices.has-images img').first().waitFor();
  expect(await stage.locator('.choices.has-images img').count()).toBe(2);
  expect(await stage.locator('.choices.has-images .letter').allTextContents()).toEqual(['A', 'B', 'C']);
  await taras.getByRole('button').filter({ has: taras.locator('img[alt="Картинка A"]') }).waitFor();
  await shot(stage, 'image-options-stage');
  await shot(taras, 'image-options-phone');
  await expectNoSideScroll(olya, 'image-options-phone-375');
  await olya.getByRole('button').filter({ has: olya.locator('img[alt="Картинка A"]') }).click();
  await taras.getByRole('button', { name: /Італія/ }).click();
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await stage.getByText('Правильна відповідь: A. картинка').waitFor();
  await click(host, 'Далі');
  await click(host, 'Наступне запитання');

  // 4. Відео: маска над назвою до розкриття ловить дотики.
  for (const page of [stage, olya]) await page.locator('.video-mask', { hasText: 'Назву відео приховано до відповіді' }).waitFor();
  const video = (await stage.locator('.question-video').boundingBox())!;
  const masked = await stage.evaluate(
    `document.elementFromPoint(${video.x + video.width / 2}, ${video.y + 10})?.closest('.video-mask') !== null`,
  );
  expect(masked).toBe(true);
  await shot(stage, 'video-mask-stage');
  await shot(olya, 'video-mask-phone');
  await olya.getByRole('button', { name: /Київ/ }).click();
  await taras.getByRole('button', { name: /Львів/ }).click();
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await stage.locator('.choice.is-correct', { hasText: 'Київ' }).waitFor();
  expect(await stage.locator('.video-mask').count()).toBe(0);
  await shot(stage, 'video-unmasked-stage');
  await click(host, 'Далі');

  // 5. Заставка поля.
  await click(host, 'Наступний раунд');
  for (const page of [stage, olya, host]) await page.locator('.round-facts', { hasText: '24 клітинки · 20 с на кожну' }).waitFor();
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');

  // 6. Поле з кольорами й легендою: на сцені збоку, на телефоні й у ведучого під полем.
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await stage.locator('.board-with-legend').waitFor();
  const legend = stage.getByRole('list', { name: 'Види клітинок' });
  for (const item of [
    'Звичайна',
    'Бліц: бали першому, хто правильно відповість',
    'Відповідь уголос',
    '×2 — подвійна ціна',
    '×3 — потрійна ціна',
    '−всім: мінус для всіх, хто не вгадав',
  ])
    await legend.getByText(item, exact).waitFor();
  expect(await legend.getByText('🎤 Бліц уголос').count()).toBe(0);
  for (const page of [host, stage, olya, taras]) {
    expect(await page.locator('.gb-cell.is-blitz').count()).toBe(1);
    expect(await page.locator('.gb-cell.is-voice').count()).toBe(1);
  }
  await expectNoSideScroll(olya, 'board-legend-phone-375');
  expect(await olya.locator('.gb-scroll').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  for (const page of [olya, stage]) {
    const longTitle = (await page.locator('.gb-title').first().boundingBox())!;
    const shortTitle = (await page.locator('.gb-title', { hasText: 'Міста' }).boundingBox())!;
    expect(longTitle.height, 'a long category title wraps').toBeGreaterThan(shortTitle.height);
  }
  console.log(`stage 1600: board ${Math.round((await stage.locator('.gb').boundingBox())!.width)} px wide`);
  await shot(stage, 'board-legend-stage');
  await shot(host, 'board-legend-host');
  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
  ] as const) {
    await stage.setViewportSize({ width, height });
    console.log(`stage ${width}: board ${Math.round((await stage.locator('.gb').boundingBox())!.width)} px wide`);
    expect(await noSideScroll(stage)).toBe(true);
    await shot(stage, `board-legend-stage-${width}`);
  }
  await stage.setViewportSize({ width: 1600, height: 900 });

  const cell = (page: Page, category: string, price: number) =>
    page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };

  // 7. Телефонна клітинка: варіанти бачать усі ще до відповіді, вердикт мигає.
  await cell(olya, 'Міста', 100).click();
  await taras.locator('.choice').first().waitFor();
  expect(await taras.locator('.choice').allTextContents()).toEqual(['AЛьвів', 'BКиїв', 'CОдеса']);
  await shot(taras, 'spotlight-before-answer-phone-other');
  await stage.locator('.bar', { hasText: 'Клітинка 1 з 24 · лишилося 23' }).waitFor();
  const before = (await taras.locator('.choice').first().boundingBox())!;
  await olya.getByRole('button', { name: /Київ/ }).click();
  for (const page of [taras, stage]) await page.locator('.choice.is-pending', { hasText: 'Київ' }).waitFor();
  await stage.getByText('Чекає рішення ведучого', exact).waitFor();
  // Стан годинника стає на місце «/ 20 с»: варіанти в Тараса не з’їжджають.
  await taras.locator('.timer-status', { hasText: 'Чекає рішення ведучого' }).waitFor();
  expect((await taras.locator('.choice').first().boundingBox())!.y, 'the phone does not jump when held').toBe(before.y);
  await shot(taras, 'held-phone-other');
  await click(host, 'Прийняти');
  for (const page of [stage, taras]) await page.locator('.choice.is-correct.is-blinking', { hasText: 'Київ' }).waitFor();
  await shot(stage, 'verdict-blink-stage');
  await shot(taras, 'verdict-blink-phone-other');
  await shot(host, 'verdict-blink-host');
  await expect.poll(() => stage.locator('.is-blinking').count(), { timeout: 6000 }).toBe(0);
  expect(await stage.locator('.choice.is-correct', { hasText: 'Київ' }).count()).toBe(1);
  await toBoard();

  // 8–9. Усна клітинка: ведучий позначає названий варіант; вердикт лише на розкритті; в Олі без анімації.
  await olya.emulateMedia({ reducedMotion: 'reduce' });
  await taras.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(taras, 'Міста', 200).click();
  await taras.getByText('Відповідайте вголос').waitFor();
  expect(await taras.locator('.choice').count()).toBe(3);
  await host.getByText('Торкніться варіанта, який назвав гравець', exact).waitFor();
  await host.locator('button.choice', { hasText: 'Одеса' }).click();
  for (const page of [stage, olya]) await page.locator('.choice.is-pending', { hasText: 'Одеса' }).waitFor();
  await shot(stage, 'voice-named-stage');
  await shot(olya, 'voice-named-phone-other');
  await shot(host, 'voice-named-host');
  await click(host, 'Не зараховувати');
  // Закрите запитання (locked): позначка лишається помаранчевою на сцені й на телефонах, вердикту ще немає.
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  for (const page of [stage, olya, taras]) await page.locator('.choice.is-pending', { hasText: 'Одеса' }).waitFor();
  for (const page of [stage, olya, taras]) expect(await page.locator('.is-wrong').count()).toBe(0);
  expect(await taras.locator('.choice').count()).toBe(3);
  await shot(taras, 'voice-locked-phone');
  await click(host, 'Показати відповідь');
  for (const page of [stage, taras]) {
    await page.locator('.choice.is-wrong.is-blinking', { hasText: 'Одеса' }).waitFor();
    await page.locator('.choice.is-correct', { hasText: 'Київ' }).waitFor();
  }
  await shot(stage, 'voice-verdict-stage');
  await shot(taras, 'voice-verdict-phone');
  const wrong = olya.locator('.choice.is-wrong', { hasText: 'Одеса' });
  await wrong.waitFor();
  expect(await wrong.evaluate((el) => (globalThis as unknown as { getComputedStyle: (e: unknown) => { animationName: string } }).getComputedStyle(el).animationName)).toBe('none');

  // 10. Кінець гри.
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  expect(problems).toEqual([]);
}

it('part 7b: an instant blitz — options at once, a live queue with times, a wrong head then the next, the winner closes, nothing moves; a voice blitz keeps its button', async () => {
  try {
    await instantBlitzGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Верх кожного варіанта на екрані (px): варіанти не мають рухатися, поки росте черга. */
const yOf = (page: Page) =>
  page.locator('.choice').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
/** Блок черги: верх і висота (резерв не змінюється від кількості рядків). */
const queueBox = (page: Page) =>
  page.locator('.blitz-queue').evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { top: Math.round(box.top), height: Math.round(box.height) };
  });
/** Верх кожного рядка черги (px). */
const rowsY = (page: Page) =>
  page.locator('.blitz-queue li').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));

async function instantBlitzGame() {
  const host = await open('host7b', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host7b@example.com');

  // Старі значення вікна й спроб (20 с, 3 спроби) миттєвий бліц ігнорує: одна спроба, без вікна.
  const capital = { ...single, id: 'q-capital', timeLimit: 30 };
  const river = {
    ...single,
    id: 'q-river',
    text: 'Найбільша річка?',
    options: [
      { id: 'a', text: 'Дніпро' },
      { id: 'b', text: 'Дунай' },
      { id: 'c', text: 'Десна' },
    ],
    correctId: 'a',
    timeLimit: 30,
  };
  const data = {
    ...makeRoundsQuiz([
      blitzRound('r1', [capital, river], {
        check: 'auto',
        answerWindow: 20,
        attempts: 3,
        rules: { penalty: 'minus', partial: null, streak: null, multiplier: 1 },
      }),
      boardRound('r2', [
        {
          title: 'Міста',
          cells: [
            { kind: 'blitz', question: withPoints(withId(single, 'q-c100'), 100) },
            { kind: 'blitz', answerMode: 'voice', question: withPoints(withId(single, 'q-c200'), 200) },
            withPoints(withId(single, 'q-c300'), 300),
          ],
        },
        // Поле потребує щонайменше трьох категорій; ці дві — звичайні клітинки.
        ...['Річки', 'Гори'].map((title, column) => ({
          title,
          cells: [100, 200, 300].map((price) => withPoints(withId(single, `q-${column}-${price}`), price)),
        })),
      ]),
    ]),
    title: 'Миттєвий бліц',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7b', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya7b', 375, 812);
  const taras = await open('taras7b', 360, 740);
  const ira = await open('ira7b', 390, 844);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();

  const score = async (nickname: string) =>
    Number(
      (await host.locator('.rows > li:has(button)', { hasText: nickname }).locator('.score').first().textContent())!
        .replace('−', '-')
        .replace(/\s/g, ''),
    );
  const answerButton = (page: Page) => page.getByRole('button', { name: 'Відповісти', ...exact });

  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');

  // 1. Варіанти одразу, без кнопки «Відповісти».
  for (const page of [olya, taras, ira]) {
    await page.getByRole('button', { name: /Київ/ }).waitFor();
    expect(await answerButton(page).count()).toBe(0);
  }
  await stage.locator('.blitz-queue', { hasText: 'Відповідей ще немає' }).waitFor();
  await shot(olya, 'blitz7b-options-phone');
  const olyaY = await yOf(olya);
  const stageY = await yOf(stage);
  expect(olyaY).toHaveLength(3);
  expect(stageY).toHaveLength(3);
  const olyaQueue = await queueBox(olya);
  const stageQueue = await queueBox(stage);
  expect(olyaQueue.height).toBeGreaterThan(0);

  // 2. Черга з часом: Тарас, потім Іра. Іншим видно лише ім'я, час і позначку.
  await taras.getByRole('button', { name: /Львів/ }).click();
  for (const page of [stage, olya]) await page.locator('.blitz-queue li', { hasText: 'Тарас' }).waitFor();
  const firstRow = { olya: (await rowsY(olya))[0], stage: (await rowsY(stage))[0] };
  await ira.getByRole('button', { name: /Київ/ }).click();
  for (const page of [stage, olya]) {
    const rows = page.locator('.blitz-queue li');
    await expect.poll(() => rows.count()).toBe(2);
    expect(await rows.nth(0).innerText()).toContain('Тарас');
    expect(await rows.nth(0).innerText()).toMatch(/\d+,\d с/);
    expect(await rows.nth(1).innerText()).toContain('Іра');
    expect(await page.locator('.blitz-queue .given').count()).toBe(0);
  }
  expect(await stage.locator('.blitz-queue').innerText()).not.toContain('Львів');
  await taras.locator('.choice.is-pending', { hasText: 'Львів' }).waitFor();
  await taras.getByText('Ведучий перевіряє вашу відповідь').waitFor();
  await ira.getByText(/ви 2-й у черзі/).waitFor();
  const hostRows = host.locator('.blitz-queue li');
  await expect.poll(() => hostRows.count()).toBe(2);
  const given = await host.locator('.blitz-queue .given').allInnerTexts();
  expect(given[0]).toContain('Львів');
  expect(given[1]).toContain('Київ');
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Тарас' }).waitFor();
  expect(await hostRows.first().getAttribute('class')).toContain('is-pending');
  await host.getByRole('button', { name: 'Прийняти', ...exact }).waitFor();
  await host.getByRole('button', { name: 'Перевибрати', ...exact }).waitFor();
  await shot(stage, 'blitz7b-queue-stage');
  await shot(olya, 'blitz7b-queue-phone-other');
  await shot(taras, 'blitz7b-queue-phone-mine');
  // Пульт вищий за вікно: на повному знімку нижня панель кнопок інакше лягає на чергу.
  await host.setViewportSize({ width: 1280, height: 1400 });
  await shot(host, 'blitz7b-queue-host');
  await host.setViewportSize({ width: 1280, height: 900 });
  // Нічого не рухається: варіанти, блок черги й перший рядок на своїх місцях.
  expect(await yOf(olya)).toEqual(olyaY);
  expect(await yOf(stage)).toEqual(stageY);
  expect(await queueBox(olya)).toEqual(olyaQueue);
  expect(await queueBox(stage)).toEqual(stageQueue);
  expect((await rowsY(olya))[0]).toBe(firstRow.olya);
  expect((await rowsY(stage))[0]).toBe(firstRow.stage);
  await expectNoSideScroll(olya, 'blitz7b-queue-phone-375');

  // 3. Хибна голова, далі наступний.
  await click(host, 'Прийняти');
  for (const page of [stage, olya]) await page.locator('.blitz-queue li', { hasText: 'Тарас' }).locator('.blitz-mark.is-wrong').waitFor();
  await stage.locator('.blitz-mark.is-blinking').waitFor();
  await taras.locator('.choice.is-wrong.is-blinking', { hasText: 'Львів' }).waitFor();
  await taras.getByText('Неправильно — чекаємо інших').waitFor();
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Іра' }).waitFor();
  await shot(stage, 'blitz7b-wrong-stage');
  await shot(taras, 'blitz7b-wrong-phone-mine');
  expect(await yOf(olya)).toEqual(olyaY);
  expect(await yOf(stage)).toEqual(stageY);
  expect(await queueBox(olya)).toEqual(olyaQueue);
  expect(await queueBox(stage)).toEqual(stageQueue);

  // 4. Переможець закриває запитання; хто що вибрав — лише з розкриттям.
  await click(host, 'Прийняти');
  for (const page of [stage, olya]) await page.getByText('Першим правильно відповів: Іра').waitFor();
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  expect(await olya.getByRole('button', { name: /Київ/ }).count()).toBe(0);
  expect(await stage.locator('.blitz-queue .given').count()).toBe(0);
  await shot(stage, 'blitz7b-winner-stage');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await stage.locator('.blitz-queue .given', { hasText: 'Львів' }).waitFor();
  await stage.locator('.blitz-queue .given', { hasText: 'Київ' }).waitFor();
  await stage.locator('.choice.is-correct', { hasText: 'Київ' }).waitFor();
  await shot(stage, 'blitz7b-reveal-stage');
  expect(await score('Іра')).toBe(1000);
  expect(await score('Тарас')).toBe(-1000);
  expect(await score('Оля')).toBe(0);
  await click(host, 'Далі');
  await click(host, 'Наступне запитання');

  // 5. Усі помилилися: запитання закривається само.
  await olya.getByRole('button', { name: /Дунай/ }).click();
  await taras.getByRole('button', { name: /Десна/ }).click();
  await ira.getByRole('button', { name: /Дунай/ }).click();
  await expect.poll(() => host.locator('.blitz-queue li').count()).toBe(3);
  for (const nickname of ['Оля', 'Тарас', 'Іра']) {
    await host.locator('.blitz-queue li.is-pending', { hasText: nickname }).waitFor();
    await click(host, 'Прийняти');
  }
  await stage.getByText('Ніхто не відповів правильно').waitFor();
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  expect(await host.getByRole('button', { name: 'Закрити запитання', ...exact }).count()).toBe(0);
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');

  // Заставка поля.
  await click(host, 'Наступний раунд');
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  const cell = (page: Page, category: string, price: number) =>
    page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };

  // 6. Бліц-клітинка телефоном: варіанти одразу і в того, хто вибрав, і в інших.
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(olya, 'Міста', 100).click();
  for (const page of [olya, taras]) {
    await page.getByRole('button', { name: /Київ/ }).waitFor();
    expect(await answerButton(page).count()).toBe(0);
  }
  await taras.getByRole('button', { name: /Київ/ }).click();
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Тарас' }).waitFor();
  await click(host, 'Прийняти');
  await stage.getByText('Першим правильно відповів: Тарас').waitFor();
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await shot(stage, 'blitz7b-cell-stage');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await toBoard();

  // 7. Усний бліц лишається з кнопкою, і рядок «Відповідає …» не зсуває варіантів.
  await taras.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(taras, 'Міста', 200).click();
  for (const page of [olya, ira]) await answerButton(page).waitFor();
  const iraY = await yOf(ira);
  expect(iraY).toHaveLength(3);
  await shot(ira, 'blitz7b-voice-button-phone');
  await click(olya, 'Відповісти');
  await ira.getByText('Відповідає Оля').waitFor();
  expect(await yOf(ira)).toEqual(iraY);
  await shot(ira, 'blitz7b-voice-answering-phone');
  await click(host, 'Закрити клітинку');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await toBoard();

  // 8. Кінець гри.
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  expect(problems).toEqual([]);
}

it('part 7c: each phone rolls its die, everyone sees the spin and results, a tie re-rolls, the host rolls for an absent player, the schedule of circles and the turn queue beside the board', async () => {
  try {
    await diceGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Кубик крутиться 1,2 с: результат чекаємо довше за типову секунду expect.poll. */
const POLL = { timeout: 5000 };
/** Верх кожного рядка кидків (px): рядки не рухаються, коли приходять результати. */
const diceRowsY = (page: Page) =>
  page.locator('.dice-rows li').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
/** Рядок кидків гравця. */
const diceRow = (page: Page, nickname: string) =>
  page.locator('.dice-rows li').filter({ has: page.locator('.name').getByText(nickname, exact) });
const diceValue = (page: Page, nickname: string) => diceRow(page, nickname).locator('.dice-value').textContent();
/** Тексти кіл розкладу з нормалізованими пробілами. */
const circleTexts = (page: Page, scope = 'body') =>
  page
    .locator(`${scope} li.turn-circle`)
    .evaluateAll((els) => els.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()));

/** Вікторина з одним раундом поля 3×3 (9 клітинок, для 4 гравців — 3 кола); повертає код гри й посилання на сцену. */
async function hostDiceQuiz(host: Page): Promise<{ code: string; stageUrl: string }> {
  const data = {
    ...makeRoundsQuiz([
      boardRound(
        'r1',
        ['Міста', 'Річки', 'Гори'].map((title, column) => ({
          title,
          cells: [100, 200, 300].map((price) => withPoints(withId(single, `q-${column}-${price}`), price)),
        })),
      ),
    ]),
    title: 'Кубики',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  return { code, stageUrl: stageUrl! };
}

/** Заставка поля на сцені вміщається в екран: розклад і останній рядок кидків не нижче краю, без прокрутки вбік. */
async function expectIntroFits(stage: Page, name: string) {
  const height = (await stage.evaluate('innerHeight')) as number;
  const schedule = (await stage.locator('.turn-schedule').boundingBox())!;
  const lastRow = (await stage.locator('.dice-rows li').last().boundingBox())!;
  console.log(`${name}: schedule bottom ${Math.round(schedule.y + schedule.height)} px, last dice row bottom ${Math.round(lastRow.y + lastRow.height)} px of ${height}`);
  expect(schedule.y + schedule.height, `${name}: the schedule runs off the screen`).toBeLessThanOrEqual(height);
  expect(lastRow.y + lastRow.height, `${name}: the dice rows run off the screen`).toBeLessThanOrEqual(height);
  expect(await noSideScroll(stage), `${name}: horizontal scroll`).toBe(true);
}

async function diceGame() {
  const host = await open('host7c', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host7c@example.com');
  const { code, stageUrl } = await hostDiceQuiz(host);
  const stage = await open('stage7c', 1600, 900);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya7c', 375, 812);
  const petro = await open('petro7c', 360, 740);
  const ira = await open('ira7c', 390, 844);
  const maks = await open('maks7c', 375, 812);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await join(maks, code, 'Макс', false);
  await stage.getByText('Макс').waitFor();
  // Макс іде: за нього кидатиме ведучий.
  await maks.context().close();
  pages.delete('maks7c');
  await host.locator('.rows li', { hasText: 'Макс' }).getByText('немає зв’язку', exact).waitFor();

  // 1. Початок кидків.
  await click(host, 'Почати гру');
  await click(host, 'Кидати кубики');
  for (const page of [olya, petro, ira]) await page.getByRole('button', { name: 'Кинути кубик', ...exact }).waitFor();
  await stage.locator('.dice-rows li').nth(3).waitFor();
  expect(await stage.locator('.dice-rows li .name').allTextContents()).toEqual(['Оля', 'Петро', 'Іра', 'Макс']);
  expect(await stage.locator('.dice-rows li .die.is-empty').count()).toBe(4);
  await stage.locator('.dice-status').getByText('Кидають: Оля, Петро, Іра, Макс', exact).waitFor();
  const start = host.getByRole('button', { name: 'Почати раунд', ...exact });
  expect(await start.isDisabled()).toBe(true);
  await host.getByText('Ще не кинули: Оля, Петро, Іра, Макс. Можна кинути за них.', exact).waitFor();
  const stageY = await diceRowsY(stage);
  const olyaY = await diceRowsY(olya);
  expect(stageY).toHaveLength(4);
  expect(olyaY).toHaveLength(4);
  const dieBox = (await stage.locator('.dice-rows li .die').first().boundingBox())!;
  await shot(host, 'dice7c-start-host');

  // 2. Кожен телефон кидає сам: кубик крутиться на телефоні й на сцені, потім результат у всіх.
  rigged.push(5);
  // Кадри крутіння: заставка «Раунд 1» має зійти до кидка, інакше кубик докрутиться під нею.
  await afterSplash(stage, olya);
  await click(olya, 'Кинути кубик');
  await diceRow(olya, 'Оля').locator('.die.is-rolling').waitFor();
  await shot(olya, 'dice7c-rolling-phone-olya');
  await diceRow(stage, 'Оля').locator('.die.is-rolling').waitFor();
  await shot(stage, 'dice7c-rolling-stage');
  // Поки кубик крутиться, результату не видно.
  expect(await diceValue(stage, 'Оля')).toBe('');
  for (const page of [stage, petro, host]) await expect.poll(() => diceValue(page, 'Оля'), POLL).toBe('5');
  // Кубик з результатом займає те саме місце, що й порожній.
  const shownBox = (await diceRow(stage, 'Оля').locator('.die').boundingBox())!;
  expect([shownBox.x, shownBox.y, shownBox.width, shownBox.height]).toEqual([dieBox.x, dieBox.y, dieBox.width, dieBox.height]);

  rigged.push(5);
  await click(petro, 'Кинути кубик');
  await diceRow(petro, 'Петро').locator('.die.is-rolling').waitFor();
  await shot(petro, 'dice7c-rolling-phone-petro');
  for (const page of [stage, olya]) await expect.poll(() => diceValue(page, 'Петро'), POLL).toBe('5');

  rigged.push(2);
  await click(ira, 'Кинути кубик');
  await diceRow(ira, 'Іра').locator('.die.is-rolling').waitFor();
  await shot(ira, 'dice7c-rolling-phone-ira');
  for (const page of [stage, olya, ira]) await expect.poll(() => diceValue(page, 'Іра'), POLL).toBe('2');
  await ira.getByText('Кубик кинуто. Чекаємо інших', exact).waitFor();
  expect(await diceRowsY(stage), 'stage dice rows moved').toEqual(stageY);
  expect(await diceRowsY(olya), 'phone dice rows moved').toEqual(olyaY);
  await stage.locator('.dice-status').getByText('Кидають: Макс', exact).waitFor();
  await shot(stage, 'dice7c-results-stage');

  // 3. Перепідключення: результати одразу, без повторного кружляння.
  await ira.reload();
  await ira.locator('.dice-rows li').nth(3).waitFor();
  expect(await ira.locator('.die.is-rolling').count()).toBe(0);
  expect(await diceValue(ira, 'Іра')).toBe('2');
  expect(await diceValue(ira, 'Оля')).toBe('5');

  // 4. Ведучий кидає за відсутнього Макса.
  rigged.push(3);
  await click(host, 'Кинути за тих, хто лишився');
  for (const page of [host, stage]) await expect.poll(() => diceValue(page, 'Макс'), POLL).toBe('3');
  await shot(host, 'dice7c-roll-for-rest-host');

  // 5. Нічия між Олею й Петром: перекидають лише вони.
  await stage.locator('.dice-status').getByText('Нічия! Перекидають: Оля, Петро', exact).waitFor();
  for (const page of [olya, petro]) await page.getByRole('button', { name: 'Кинути кубик', ...exact }).waitFor();
  await ira.getByText('Кубик кинуто. Чекаємо інших', exact).waitFor();
  expect(await ira.getByRole('button', { name: 'Кинути кубик', ...exact }).count()).toBe(0);
  expect(await start.isDisabled()).toBe(true);
  await host.getByText('Ще не кинули: Оля, Петро. Можна кинути за них.', exact).waitFor();
  expect(await diceRowsY(stage), 'stage dice rows moved on the tie').toEqual(stageY);
  await shot(stage, 'dice7c-tie-stage');
  await shot(olya, 'dice7c-tie-phone-olya');
  rigged.push(6);
  await click(olya, 'Кинути кубик');
  await expect.poll(() => diceValue(stage, 'Оля'), POLL).toBe('6');
  rigged.push(1);
  await click(petro, 'Кинути кубик');
  await expect.poll(() => diceValue(stage, 'Петро'), POLL).toBe('1');
  await stage.locator('.dice-status').getByText('Порядок визначено', exact).waitFor();
  expect(await diceRow(olya, 'Оля').locator('.dice-throws').textContent()).toBe('5 →');
  await expect.poll(() => diceValue(olya, 'Оля'), POLL).toBe('6');
  expect(await diceRowsY(stage), 'stage dice rows moved after the re-roll').toEqual(stageY);
  expect(await diceRowsY(olya), 'phone dice rows moved after the re-roll').toEqual(olyaY);

  // 6. Розклад кіл, коли кубики зупинилися.
  const circles = ['Коло 1: Оля → Петро → Макс → Іра', 'Коло 2: Петро → Макс → Іра → Оля', 'Коло 3: Макс → Іра → Оля → Петро'];
  for (const page of [stage, olya, host]) {
    await page.getByRole('heading', { name: 'Розклад ходів', ...exact }).waitFor();
    expect(await circleTexts(page)).toEqual(circles);
    expect(await page.getByText('Далі черга повторюється').count()).toBe(0);
    const lastRow = (await page.locator('.dice-rows li').last().boundingBox())!;
    const schedule = (await page.locator('.turn-schedule').boundingBox())!;
    if (page === stage) {
      // Широка сцена: розклад праворуч від рядків кидків, а не під ними.
      expect(schedule.x, 'stage: the schedule is not beside the dice').toBeGreaterThan(lastRow.x + lastRow.width - 1);
      expect(schedule.y, 'stage: the schedule is not beside the dice').toBeLessThan(lastRow.y);
    } else {
      // Телефон і ведучий: розклад нижче рядків кидків.
      expect(schedule.y).toBeGreaterThan(lastRow.y + lastRow.height - 1);
    }
  }
  // Поява розкладу не зсуває рядки кидків.
  expect(await diceRowsY(stage), 'stage dice rows moved when the schedule appeared').toEqual(stageY);
  expect(await diceRowsY(olya), 'phone dice rows moved when the schedule appeared').toEqual(olyaY);
  // Кубик стоїть поруч з ім'ям, а не на іншому краю сцени.
  const olyaRow = diceRow(stage, 'Оля');
  const nameBox = (await olyaRow.locator('.name').boundingBox())!;
  const olyaDie = (await olyaRow.locator('.die').boundingBox())!;
  expect(olyaDie.x - nameBox.x, 'stage: the die is far from the name').toBeLessThan(600);
  await expectIntroFits(stage, '7c intro 1600×900');
  await shot(stage, 'dice7c-schedule-stage');
  // Телевізор 720p: заставка разом із розкладом вміщається без прокрутки.
  await stage.setViewportSize({ width: 1280, height: 720 });
  await expectIntroFits(stage, '7c intro 1280×720');
  await shot(stage, 'dice7c-schedule-stage-1280');
  await stage.setViewportSize({ width: 1600, height: 900 });
  await shot(olya, 'dice7c-schedule-phone');
  await shot(host, 'dice7c-schedule-host');
  await expectNoSideScroll(olya, 'dice7c-schedule-phone-375');
  expect(await noSideScroll(petro), 'the 360 px phone scrolls sideways').toBe(true);
  expect(await start.isDisabled()).toBe(false);

  // 7. «Черга ходів» під час вибору клітинки.
  await click(host, 'Почати раунд');
  const aside = stage.locator('.board-aside');
  await aside.getByRole('heading', { name: 'Черга ходів', ...exact }).waitFor();
  expect(await circleTexts(stage, '.board-aside')).toEqual(circles);
  expect(await aside.locator('.turn-name.is-turn').allTextContents()).toEqual(['Оля']);
  await shot(stage, 'dice7c-queue-stage');
  // Поле з панеллю черги: поле ліворуч від колонки, не стиснуте, без прокрутки вбік.
  for (const [width, height] of [
    [1600, 900],
    [1280, 720],
    [1920, 1080],
  ] as const) {
    await stage.setViewportSize({ width, height });
    const board = (await stage.locator('.gb').boundingBox())!;
    const column = (await aside.boundingBox())!;
    console.log(`7c stage ${width}: board ${Math.round(board.width)}×${Math.round(board.height)} px, aside ${Math.round(column.width)} px`);
    expect(board.x + board.width, `stage ${width}: the board runs under the queue`).toBeLessThanOrEqual(column.x);
    expect(board.width, `stage ${width}: the board is squeezed`).toBeGreaterThan(width * 0.5);
    expect(column.y + column.height, `stage ${width}: the queue runs off the screen`).toBeLessThanOrEqual(height);
    expect(await noSideScroll(stage), `stage ${width}: horizontal scroll`).toBe(true);
    if (width !== 1600) await shot(stage, `dice7c-queue-stage-${width}`);
  }
  await stage.setViewportSize({ width: 1600, height: 900 });

  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  const queue = olya.locator('.turn-schedule');
  await queue.getByRole('heading', { name: 'Черга ходів', ...exact }).waitFor();
  expect(await queue.locator('.turn-name.is-turn').allTextContents()).toEqual(['Оля']);
  const legend = olya.locator('.gb-legend');
  const anchor = (await legend.count()) > 0 ? (await legend.boundingBox())! : (await olya.locator('.gb').boundingBox())!;
  expect((await queue.boundingBox())!.y, 'the queue sits under the legend').toBeGreaterThan(anchor.y + anchor.height - 1);
  await shot(olya, 'dice7c-queue-phone');
  await expectNoSideScroll(olya, 'dice7c-queue-phone-375');

  await olya.getByRole('button', { name: 'Міста, 100', ...exact }).click();
  await olya.getByRole('button', { name: /Київ/ }).click();
  await click(host, 'Прийняти');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await click(host, 'Далі');
  const nextQuestion = host.getByRole('button', { name: 'Наступне запитання', ...exact });
  const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
  await Promise.race([nextQuestion.waitFor(), picking.waitFor()]);
  if (await nextQuestion.isVisible()) await nextQuestion.click();
  await picking.waitFor();
  await expect.poll(() => aside.locator('.turn-name.is-turn').allTextContents(), POLL).toEqual(['Петро']);
  expect(await aside.locator('.turn-name.is-done').allTextContents()).toEqual(['Оля']);
  await shot(stage, 'dice7c-queue-next-stage');
  const hostQueue = host.locator('.turn-schedule');
  await hostQueue.getByRole('heading', { name: 'Черга ходів', ...exact }).waitFor();
  expect(await hostQueue.locator('.turn-name.is-turn').allTextContents()).toEqual(['Петро']);
  await shot(host, 'dice7c-queue-host');

  // 8. Кінець гри.
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  expect(problems).toEqual([]);
}

it('part 7c: eight players — the stage board intro with dice in two columns and the schedule fits a 720p screen', async () => {
  try {
    await eightDice();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function eightDice() {
  const host = await open('host7c8', 1280, 900);
  await register(host, 'host', 'Ніна Ведуча', 'host7c8@example.com');
  const { code, stageUrl } = await hostDiceQuiz(host);
  const stage = await open('stage7c8', 1280, 720);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const names = ['Оля', 'Петро', 'Іра', 'Макс', 'Анастасія', 'Богдан', 'Віра', 'Ґанна'];
  // Дешевше за вісім живих телефонів: кожен заходить і йде, за всіх кидає ведучий.
  for (const [index, nickname] of names.entries()) {
    const name = `p7c8-${index}`;
    const phone = await open(name, 360, 640);
    await join(phone, code, nickname, false);
    await phone.context().close();
    pages.delete(name);
  }
  await stage.getByText('Ґанна').waitFor();

  await click(host, 'Почати гру');
  await click(host, 'Кидати кубики');
  await stage.locator('.dice-rows li').nth(7).waitFor();
  expect(await stage.locator('.dice-rows.is-many').count()).toBe(1);
  const startY = await diceRowsY(stage);
  // Довгий рядок стану з вісьмома іменами видно цілим і без прокрутки вбік.
  const status = (await stage.locator('.dice-status').evaluate((el) => ({ full: el.scrollWidth <= el.clientWidth }))) as { full: boolean };
  expect(status.full, 'stage: the status line is cut').toBe(true);
  expect(await noSideScroll(stage), 'stage 8 players: horizontal scroll').toBe(true);
  await shot(stage, 'dice7c-start-stage-8-1280');
  // Нічия Олі з Вірою й Петра з Ґанною, потім перекидання без нічиєї.
  rigged.push(6, 5, 4, 3, 2, 1, 6, 5);
  await click(host, 'Кинути за тих, хто лишився');
  await stage.locator('.dice-status').getByText('Нічия! Перекидають: Оля, Петро, Віра, Ґанна', exact).waitFor();
  rigged.push(6, 5, 4, 3);
  await click(host, 'Кинути за тих, хто лишився');
  await stage.locator('.dice-status').getByText('Порядок визначено', exact).waitFor();
  await stage.getByRole('heading', { name: 'Розклад ходів', ...exact }).waitFor();
  expect(await diceRowsY(stage), 'stage dice rows moved').toEqual(startY);
  await expectIntroFits(stage, '7c 8 players 1280×720');
  await shot(stage, 'dice7c-schedule-stage-8-1280');
  await stage.setViewportSize({ width: 1600, height: 900 });
  await expectIntroFits(stage, '7c 8 players 1600×900');
  await shot(stage, 'dice7c-schedule-stage-8-1600');

  expect(problems).toEqual([]);
}

it('part 7d: host points with a notice everywhere, totals in the history and my games; six debuffs on the target phone only, a bug on the stage, cancel before it fires, answering still works', async () => {
  try {
    await pranksGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

type Box = { x: number; y: number; width: number; height: number };
/** Чи перетинаються два прямокутники (з допуском у пів пікселя). */
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/** Фіксований елемент не накриває жодного з інших. */
async function expectApart(page: Page, fixed: string, others: string[], label: string) {
  const box = await page.locator(fixed).boundingBox();
  expect(box, `${label}: ${fixed} is not shown`).not.toBeNull();
  for (const selector of others) {
    const items = page.locator(selector);
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const other = await items.nth(i).boundingBox();
      if (other !== null) expect(overlaps(box!, other), `${label}: ${fixed} covers ${selector} #${i}`).toBe(false);
    }
  }
}

/**
 * Протирає мишею з натиснутою кнопкою: наведення без кнопки туману й бруду не чіпає.
 * Кнопку натискаємо й відпускаємо в куті над шапкою, тож натискання не стає кліком по варіанту.
 */
async function wipeWithMouse(page: Page, points: number[][]): Promise<void> {
  await page.mouse.move(8, 8);
  await page.mouse.down();
  for (const [x, y] of points) await page.mouse.move(x!, y!);
  await page.mouse.move(8, 8);
  await page.mouse.up();
}

async function pranksGame() {
  const host = await open('host7d', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host7d@example.com');
  const olya = await open('olya7d', 375, 812);
  await register(olya, 'menu', 'Оля', 'olya7d@example.com');

  // Шість запитань з одним варіантом і останнє з кнопкою «Відповісти»: сповіщення внизу не має її закривати.
  // Чотири варіанти: на сцені нижній правий кут зайнятий, значки й сповіщення не мають його накривати.
  const options = [...single.options, { id: 'd', text: 'Харків' }];
  const questions = [
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ ...withId(single, `q${n}`), options, text: `Запитання ${n}: столиця України?`, timeLimit: 30 })),
    { ...withId(multi, 'q7'), text: 'Запитання 7: які міста стоять на Дніпрі?', timeLimit: 30 },
  ];
  const data = { ...makeQuiz(questions, { speedBonus: false }), title: 'Пакості' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7d', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const petro = await open('petro7d', 360, 740);
  const ira = await open('ira7d', 390, 844);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const rowScore = async (nickname: string) => (await row(nickname).locator('.score').textContent())!;
  const tool = async (nickname: string, kind: 'Бали' | 'Дебаф') => {
    const button = row(nickname).getByRole('button', { name: kind, ...exact });
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await row(nickname).locator('.player-tools').waitFor();
  };
  const cast = async (nickname: string, kind: RegExp) => {
    await tool(nickname, 'Дебаф');
    await row(nickname).locator('.player-tools').getByRole('button', { name: kind }).click();
    await row(nickname).locator('.debuff-tag').waitFor();
  };
  const badge = (nickname: string) => stage.locator('.stage-debuffs li', { hasText: nickname });
  // Останній, хто відповів, одразу бачить «Чекаємо на правильну відповідь»: запитання закривається само.
  const answer = async (page: Page, text: RegExp) => {
    await page.getByRole('button', { name: text }).click();
    await page.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
  };
  const toTable = async () => {
    await click(host, 'Показати відповідь');
    await click(host, 'Далі');
    await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();
  };
  const nextQuestion = async (n: number) => {
    await click(host, 'Наступне запитання');
    await olya.locator('h1', { hasText: `Запитання ${n}:` }).waitFor();
  };
  const zoneKind = (page: Page) => page.locator('.debuff-zone').getAttribute('data-debuff');

  // 1. Лобі: біля гравця лише «Вилучити».
  await row('Оля').waitFor();
  expect(await row('Оля').getByRole('button', { name: 'Бали', ...exact }).count()).toBe(0);
  expect(await row('Оля').getByRole('button', { name: 'Дебаф', ...exact }).count()).toBe(0);
  expect(await row('Оля').getByRole('button', { name: 'Вилучити', ...exact }).count()).toBe(1);

  // 2. Бали з заставки: −100 Олі, сповіщення на сцені й у всіх телефонах, нічого не зсувається.
  await click(host, 'Почати гру');
  await petro.locator('h1').first().waitFor();
  const petroH1 = (await petro.locator('h1').first().boundingBox())!.y;
  await tool('Оля', 'Бали');
  await row('Оля').getByLabel('Своя сума', exact).waitFor();
  await shot(host, 'points7d-panel-host');
  await row('Оля').getByRole('button', { name: '−100', ...exact }).click();
  for (const page of [stage, olya, petro, ira]) await page.locator('.live-notice').getByText('Ведучий: −100 — Оля', exact).waitFor();
  await stage.waitForTimeout(300); // сповіщення проявляється 0,25 с
  await shot(stage, 'points7d-notice-stage');
  await shot(petro, 'points7d-notice-phone-petro');
  expect((await petro.locator('h1').first().boundingBox())!.y).toBe(petroH1);
  expect(await olya.locator('header.bar .score').textContent()).toBe('−100');
  expect(await rowScore('Оля')).toBe('−100');
  await petro.locator('.live-notice').waitFor({ state: 'detached', timeout: 6000 });
  await stage.locator('.live-notice').waitFor({ state: 'detached', timeout: 1000 });
  expect((await petro.locator('h1').first().boundingBox())!.y).toBe(petroH1);

  // 3. Туман Олі: значок на сцені, ціль до запитання нічого не бачить.
  await tool('Оля', 'Дебаф');
  await shot(host, 'debuff7d-panel-host');
  await row('Оля').locator('.player-tools').getByRole('button', { name: /Туман/ }).click();
  await row('Оля').locator('.debuff-tag').getByText('🌫️ Туман · чекає', exact).waitFor();
  await badge('Оля').getByText('🐞 Оля', exact).waitFor();
  await shot(stage, 'debuff7d-badge-stage');
  expect(await olya.locator('.debuff-zone').count()).toBe(0);
  expect(await olya.getByText('На вас наслано').count()).toBe(0);

  await click(host, 'Почати раунд');
  await olya.locator('.debuff-zone[data-debuff="fog"]').waitFor();
  await olya.getByText('На вас наслано: Туман').waitFor();
  // Банер — смужка внизу: запитання й варіанти під туманом лишаються видимими.
  await expectApart(olya, '.debuff-banner', ['.debuff-zone h1', '.choice'], 'fog banner 375×812');
  await shot(olya, 'debuff7d-fog-phone');
  for (const page of [petro, ira]) {
    await page.locator('.debuff-zone').waitFor();
    expect(await zoneKind(page)).toBeNull();
    expect(await page.locator('.debuff-layer').count()).toBe(0);
  }
  expect(await stage.locator('[data-debuff]').count()).toBe(0);
  await badge('Оля').waitFor();
  await row('Оля').locator('.debuff-tag').getByText('🌫️ Туман · діє', exact).waitFor();
  expect(await host.getByRole('button', { name: 'Скасувати дебаф', ...exact }).count()).toBe(0);
  const zone = (await olya.locator('.debuff-zone').boundingBox())!;
  await wipeWithMouse(
    olya,
    [[0.2, 0.3], [0.5, 0.35], [0.8, 0.4], [0.5, 0.6], [0.3, 0.7]].map(([fx, fy]) => [zone.x + zone.width * fx!, zone.y + zone.height * fy!]),
  );
  await expect.poll(async () => Number(await olya.locator('.debuff-fog').getAttribute('data-cleared'))).toBeGreaterThan(0);
  await olya.waitForTimeout(100);
  await shot(olya, 'debuff7d-fog-wiped');
  await answer(olya, /Київ/);
  await expectNoSideScroll(olya, 'debuff7d-fog-375');
  await answer(petro, /Львів/);
  await answer(ira, /Київ/);
  await stage.locator('.stage-debuffs').waitFor({ state: 'detached' });
  await toTable();

  // 4. Три дебафи разом: значки на сцені 1280×720 не накривають таблицю, запитання й таймер.
  await cast('Іра', /Тремтіння/);
  await cast('Петро', /Заморозка/);
  await cast('Оля', /Тремтіння/);
  await stage.locator('.stage-debuffs li').nth(2).waitFor();
  await stage.setViewportSize({ width: 1280, height: 720 });
  await expectApart(stage, '.stage-debuffs', ['.standings li', 'h1'], 'stage table 1280×720');
  await shot(stage, 'debuff7d-badges3-table-stage-1280');

  // 5. Тремтіння (Іра, Оля) і заморозка (Петро) на запитанні 2.
  await nextQuestion(2);
  await stage.getByRole('timer').first().waitFor();
  await expectApart(stage, '.stage-debuffs', ['h1', '[role="timer"]', '.choice', '.question-head'], 'stage question 1280×720');
  await shot(stage, 'debuff7d-badges3-question-stage-1280');
  await stage.setViewportSize({ width: 1600, height: 900 });
  await ira.locator('.debuff-zone.is-shake').waitFor();
  await shot(ira, 'debuff7d-shake-phone');
  await petro.locator('fieldset.debuff-content[disabled]').waitFor();
  await petro.locator('.debuff-ice').waitFor();
  // Банер живе 3 с від спрацювання: перевіряємо, якщо він ще на екрані.
  if ((await petro.locator('.debuff-banner').count()) > 0) {
    await expectApart(petro, '.debuff-banner', ['.debuff-zone h1', '.choice'], 'freeze banner 360×740');
  }
  await shot(petro, 'debuff7d-freeze-phone');
  const petroKyiv = petro.getByRole('button', { name: /Київ/ });
  expect(await petroKyiv.isDisabled()).toBe(true);
  await answer(ira, /Київ/);
  await answer(olya, /Київ/);
  await expect.poll(() => petroKyiv.isDisabled(), { timeout: 7000 }).toBe(false);
  await answer(petro, /Київ/);
  await toTable();

  // 6. Дзеркало (Іра) на запитанні 3: варіанти міняються місцями, вибір іде за id.
  await cast('Іра', /Дзеркало/);
  await nextQuestion(3);
  await ira.locator('.debuff-zone.is-mirror').waitFor();
  const transform = await ira
    .locator('.debuff-content')
    .evaluate((el) => (globalThis as unknown as { getComputedStyle: (e: unknown) => { transform: string } }).getComputedStyle(el).transform);
  expect(transform).toMatch(/^matrix\(-1/);
  const before = await ira.locator('.choice').allTextContents();
  await expect.poll(() => ira.locator('.choice').allTextContents(), { timeout: 5500 }).not.toEqual(before);
  await shot(ira, 'debuff7d-mirror-phone');
  await answer(ira, /Київ/);
  await answer(olya, /Київ/);
  await answer(petro, /Київ/);
  await click(host, 'Показати відповідь');
  await ira.getByText('Правильно!').waitFor();
  await click(host, 'Далі');
  await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();

  // 7. Скасування до спрацювання (Петро) і бруд (Оля) на запитанні 4.
  await cast('Петро', /Гості/);
  await badge('Петро').getByText('🐞 Петро', exact).waitFor();
  await row('Петро').getByRole('button', { name: 'Скасувати дебаф', ...exact }).click();
  await badge('Петро').waitFor({ state: 'detached' });
  await row('Петро').locator('.debuff-tag').waitFor({ state: 'detached' });
  await cast('Оля', /Брудний/);
  await nextQuestion(4);
  await petro.locator('.debuff-zone').waitFor();
  expect(await zoneKind(petro)).toBeNull();
  await olya.locator('.debuff-splat').nth(5).waitFor();
  expect(await olya.locator('.debuff-splat').count()).toBe(6);
  await olya.getByText('На вас наслано: Брудний екран').waitFor();
  await expectApart(olya, '.debuff-banner', ['.debuff-zone h1', '.choice'], 'mud banner 375×812');
  await shot(olya, 'debuff7d-mud-phone');
  const splat = (await olya.locator('.debuff-splat').first().boundingBox())!;
  await wipeWithMouse(
    olya,
    Array.from({ length: 5 }, (_, i) => [splat.x + splat.width / 2 + (i % 2 === 0 ? -2 : 2), splat.y + splat.height / 2]),
  );
  await expect.poll(() => olya.locator('.debuff-splat').count()).toBe(5);
  await answer(olya, /Київ/);
  await expectNoSideScroll(olya, 'debuff7d-mud-375');
  await answer(petro, /Київ/);
  await answer(ira, /Київ/);
  await toTable();

  // 8. Спокійні варіанти: гості (Оля) і тремтіння (Іра) зі зменшеною анімацією.
  await olya.emulateMedia({ reducedMotion: 'reduce' });
  await ira.emulateMedia({ reducedMotion: 'reduce' });
  await cast('Оля', /Гості/);
  await cast('Іра', /Тремтіння/);
  await nextQuestion(5);
  await olya.locator('.debuff-zone.is-guests.is-calm').waitFor();
  expect(await olya.locator('.debuff-guest').count()).toBe(5);
  await olya.waitForTimeout(2000); // спокійні гості повільно проявляються
  await shot(olya, 'debuff7d-guests-calm-phone');
  await expectNoSideScroll(olya, 'debuff7d-guests-375');
  await ira.locator('.debuff-zone.is-shake.is-calm').waitFor();
  await shot(ira, 'debuff7d-shake-calm-phone');
  await answer(olya, /Київ/);
  await answer(ira, /Київ/);
  await answer(petro, /Київ/);
  await olya.emulateMedia({ reducedMotion: 'no-preference' });
  await ira.emulateMedia({ reducedMotion: 'no-preference' });
  await toTable();

  // 9. Гості з анімацією (Петро) на запитанні 6; в інших дебафу немає.
  await cast('Петро', /Гості/);
  await nextQuestion(6);
  await petro.locator('.debuff-zone.is-guests:not(.is-calm)').waitFor();
  await petro.waitForTimeout(1500);
  await shot(petro, 'debuff7d-guests-phone');
  expect(await zoneKind(olya)).toBeNull();
  expect(await zoneKind(ira)).toBeNull();
  await answer(petro, /Київ/);
  await answer(olya, /Київ/);
  await answer(ira, /Київ/);
  await toTable();

  // 10. Своя сума посеред запитання 7: сповіщення внизу не заважає відповісти й не накриває запитання на сцені.
  await nextQuestion(7);
  const petroScore = await rowScore('Петро');
  await tool('Петро', 'Бали');
  await row('Петро').getByLabel('Своя сума', exact).fill('abc');
  await row('Петро').getByRole('button', { name: 'Нарахувати', ...exact }).click();
  await row('Петро').getByText('Введіть ціле число, наприклад −150 або 75.').waitFor();
  expect(await rowScore('Петро')).toBe(petroScore);
  await row('Петро').getByLabel('Своя сума', exact).fill('75');
  await row('Петро').getByRole('button', { name: 'Нарахувати', ...exact }).click();
  await olya.locator('.live-notice').getByText('Ведучий: +75 — Петро', exact).waitFor();
  await stage.locator('.live-notice').getByText('Ведучий: +75 — Петро', exact).waitFor();
  await olya.getByRole('button', { name: /Київ/ }).click();
  await olya.getByRole('button', { name: /Черкаси/ }).click();
  const submit = olya.getByRole('button', { name: 'Відповісти', ...exact });
  const noticeBox = (await olya.locator('.live-notice').boundingBox())!;
  expect(overlaps(noticeBox, (await submit.boundingBox())!), 'the notice covers «Відповісти» on 375').toBe(false);
  await olya.waitForTimeout(300); // сповіщення проявляється 0,25 с
  await shot(olya, 'points7d-notice-question-phone-375');
  await shot(stage, 'points7d-notice-question-stage');
  await expectApart(stage, '.live-notice', ['h1', '[role="timer"]', '.choice'], 'stage notice during a question');
  await submit.click();
  await olya.getByText('Відповідь прийнято').waitFor();
  expect(await olya.locator('.live-notice').count(), 'the answer went while the notice was still shown').toBe(1);
  for (const page of [petro, ira]) {
    await page.getByRole('button', { name: /Київ/ }).click();
    await page.getByRole('button', { name: /Черкаси/ }).click();
    await click(page, 'Відповісти');
  }
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');

  // 11. Підсумки: таблиця сцени = історія = «Мої ігри».
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const scores = async (page: Page) => {
    const rows = page.locator('.standings li');
    await rows.first().waitFor();
    const result: Record<string, string> = {};
    for (let i = 0; i < (await rows.count()); i++) {
      result[(await rows.nth(i).locator('.name').textContent())!] = (await rows.nth(i).locator('.score').textContent())!;
    }
    return result;
  };
  const totals = await scores(stage);
  expect(totals).toEqual({ Іра: '7000', Оля: '6900', Петро: '6075' });
  await shot(stage, 'points7d-final-stage');

  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Пакості/ }).click();
  expect(await scores(host)).toEqual(totals);
  await host.getByText('Бали від ведучого: Оля −100, Петро +75', exact).waitFor();
  await shot(host, 'points7d-history-host');

  await olya.goto(`${base}/me`);
  const mine = olya.locator('.quiz-list li', { hasText: 'Пакості' });
  await mine.waitFor();
  expect(await mine.textContent()).toContain(`${totals['Оля']} балів`);
  await expectNoSideScroll(olya, 'points7d-my-games-phone');

  expect(problems).toEqual([]);
}

it('part 7e: all-in on the phone and ВА-БАНК! on the stage, the wager type in the editor, a bank final with a growing bank and a proportional split with the remainder, a refund when nobody is right, the history and my games match', async () => {
  try {
    await bankGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function bankGame() {
  const host = await open('host7e', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host7e@example.com');
  const petro = await open('petro7e', 360, 740);
  await register(petro, 'menu', 'Петро', 'petro7e@example.com');

  // Класичний раунд без бонусу за швидкість і два фінали: «Космос» (поки класичний) і «Історія» (спільний банк).
  const question = (id: string, text: string, points: number) => ({ ...withId(withPoints(single, points), id), text, timeLimit: 30 });
  const rounds = [
    classicRound('r1', [question('q1', 'Запитання 1: столиця України?', 1000), question('q2', 'Запитання 2: столиця України?', 500)], {
      speedBonus: false,
    }),
    finalRound('r2', question('f1', 'Фінал 1: столиця України?', 1000), { title: 'Космос', wagerMode: 'classic' }),
    finalRound('r3', question('f2', 'Фінал 2: столиця України?', 1000), { title: 'Історія', wagerMode: 'bank' }),
  ];
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end' }), title: 'Банк' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Редактор: у фіналі «Космос» тип ставок стає «Спільний банк», з'являється підказка.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Банк' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.getByRole('button', { name: 'Космос', ...exact }).click();
  await openRoundSettings(host);
  const mode = host.locator('label.field', { hasText: 'Тип ставок' }).locator('select');
  expect(await mode.inputValue()).toBe('classic');
  await host.getByText('Правильна відповідь додає ставку, неправильна забирає.', exact).waitFor();
  await mode.selectOption('bank');
  await host
    .getByText('Хто помилився, віддає ставку в банк; хто відповів правильно, ділить банк пропорційно своїм ставкам.', exact)
    .waitFor();
  await shot(host, 'bank7e-editor-host');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'bank7e-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  await host.locator('.quiz-list li', { hasText: 'Банк' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7e', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya7e', 375, 812);
  const ira = await open('ira7e', 390, 844);
  const marko = await open('marko7e', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await join(marko, code, 'Марко', false);
  await stage.getByText('Марко').waitFor();

  const phones = [olya, petro, ira, marko];
  const pick = async (page: Page, right: boolean) => {
    await page.getByRole('button', { name: right ? /Київ/ : /Львів/ }).click();
    await page.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
  };
  const hostScore = async (nickname: string) => (await host.locator('.player-row', { hasText: nickname }).locator('.score').textContent())!;
  const flat = (text: string | null) => (text ?? '').replace(/\s/g, '');
  // Без коду гри: у ньому випадково можуть трапитися ті самі цифри, що й у частках.
  const visible = async (page: Page) => (await bodyText(page)).replaceAll(`${code.slice(0, 3)} ${code.slice(3)}`, '').replaceAll(code, '');
  const row = (nickname: string) => stage.locator('.wager-list li', { hasText: nickname });
  const rowText = async (nickname: string) => flat(await row(nickname).textContent());
  const meter = stage.locator('.bank-meter');
  const meterSays = (text: string) => meter.getByText(text, exact).waitFor();
  const meterY = async () => (await meter.boundingBox())!.y;
  const meterH = async () => (await meter.boundingBox())!.height;
  // Розташування колонок рядка на сцені: розподіл і повернення ставок не мають нічого зсувати.
  const columns = async (nickname: string) => {
    const box = async (selector: string) => {
      const b = (await row(nickname).locator(selector).boundingBox())!;
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width)];
    };
    return { given: await box('.given'), stake: await box('.wager-stake'), delta: await box('.wager-delta'), share: await box('.wager-share') };
  };

  // 1. Класичний раунд: Оля 1500, Петро 1000, Іра 500, Марко 1000.
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  await olya.locator('h1', { hasText: 'Запитання 1:' }).waitFor();
  await pick(olya, true);
  await pick(petro, true);
  await pick(ira, false);
  await pick(marko, true);
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await olya.locator('h1', { hasText: 'Запитання 2:' }).waitFor();
  await pick(olya, true);
  await pick(petro, false);
  await pick(ira, true);
  await pick(marko, false);
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await host.getByRole('button', { name: 'Наступний раунд', ...exact }).waitFor();
  await expect
    .poll(async () => [await hostScore('Оля'), await hostScore('Петро'), await hostScore('Іра'), await hostScore('Марко')])
    .toEqual(['1500', '1000', '500', '1000']);

  // 2. Заставка фіналу 1: тема й правило спільного банку.
  await click(host, 'Наступний раунд');
  await stage.getByRole('heading', { name: 'Космос' }).waitFor();
  await stage
    .getByText('Хто помилився або не відповів, віддає ставку в спільний банк; хто відповів правильно, зберігає свою й ділить банк пропорційно ставкам.', exact)
    .waitFor();
  await shot(stage, 'bank7e-intro-stage');

  // 3. Ставки: Іра — ва-банк кнопкою, Оля 1000, Петро 300, Марко 400.
  await click(host, 'Почати фінал');
  await ira.getByText('Ваша ставка від 0 до 500', exact).waitFor();
  await ira.getByText('Спільний банк: помилка віддає ставку в банк, правильні відповіді його ділять.', exact).waitFor();
  await click(ira, 'Ва-банк');
  await ira.getByText('Ваша ставка: 500 — ва-банк!', exact).waitFor();
  await shot(ira, 'bank7e-allin-phone');
  await olya.getByRole('button', { name: 'Ва-банк', ...exact }).waitFor();
  await expectNoSideScroll(olya, 'bank7e-wager-375');
  // «Ва-банк» стоїть у рядку з полем ставки й не переноситься.
  const input = (await olya.getByLabel('Ставка', exact).boundingBox())!;
  const allInButton = (await olya.getByRole('button', { name: 'Ва-банк', ...exact }).boundingBox())!;
  expect(allInButton.y).toBeLessThan(input.y + input.height);
  expect(allInButton.y + allInButton.height).toBeGreaterThan(input.y);
  await olya.getByLabel('Ставка', exact).fill('1000');
  await click(olya, 'Поставити');
  await olya.getByText('Ваша ставка: 1000', exact).waitFor();
  await petro.getByLabel('Ставка', exact).fill('300');
  await click(petro, 'Поставити');
  await petro.getByText('Ваша ставка: 300', exact).waitFor();
  await host.getByText('Поставили 3 з 4').waitFor();
  const allInRows = host.locator('li', { has: host.locator('.allin-tag') });
  await allInRows.first().waitFor();
  expect(await allInRows.count()).toBe(1);
  expect(await allInRows.textContent()).toContain('Іра');
  await shot(host, 'bank7e-wagers-host');
  await stage.getByText('Ставки зроблено: 3 з 4').waitFor();
  expect(await bodyText(stage)).not.toMatch(/ва-банк|Ставка/i);
  await marko.getByLabel('Ставка', exact).fill('400');
  await click(marko, 'Поставити');

  // 4. Запитання відкривається само: Оля й Іра помиляються, Петро й Марко відповідають правильно.
  await olya.locator('h1', { hasText: 'Фінал 1:' }).waitFor();
  await pick(olya, false);
  await pick(ira, false);
  await pick(petro, true);
  await pick(marko, true);
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  expect(await bodyText(stage)).not.toMatch(/ВА-БАНК|Банк:/);

  // 5. Розкриття від найменшого рахунку: Іра 500, Петро 1000, Марко 1000, Оля 1500.
  await click(host, 'Показати відповідь');
  await meterSays('Банк: 0');
  expect(await stage.locator('.wager-list li').count()).toBe(0);
  for (const page of [stage, ...phones]) expect(await visible(page)).not.toMatch(/ВА-БАНК|з банку|ставки повертаються/);
  // Від першого розкриття до розподілу лічильник банку стоїть на місці.
  const y0 = await meterY();

  await click(host, 'Наступний гравець');
  await row('Іра').waitFor();
  await meterSays('Банк: 500');
  const ira1 = await rowText('Іра');
  expect(ira1).toContain('ВА-БАНК!');
  expect(ira1).toContain('убанк');
  expect(ira1).toContain('500→0');
  expect(await stage.locator('.wager-list li').count()).toBe(1);
  expect(await meterY()).toBe(y0);
  await shot(stage, 'bank7e-allin-stage');

  await click(host, 'Наступний гравець');
  await row('Петро').waitFor();
  const petro1 = await rowText('Петро');
  expect(petro1).toContain('ставкузбережено');
  expect(petro1).toContain('1000→1000');
  expect(petro1).not.toContain('ВА-БАНК');
  await meterSays('Банк: 500');
  await petro.getByText('Ставку збережено — чекаємо на розподіл банку', exact).waitFor();
  expect(await row('Марко').count()).toBe(0);
  expect(await row('Оля').count()).toBe(0);
  for (const page of [stage, ...phones]) expect(await visible(page)).not.toMatch(/642|858|з банку|ставки повертаються/);
  expect(await meterY()).toBe(y0);

  await click(host, 'Наступний гравець');
  await row('Марко').waitFor();
  expect(await rowText('Марко')).toContain('1000→1000');
  await meterSays('Банк: 500');
  expect(await row('Оля').count()).toBe(0);
  await olya.getByText('Чекаємо на розкриття', exact).waitFor();
  for (const page of [stage, ...phones]) expect(await visible(page)).not.toMatch(/642|858|1500→500|з банку|ставки повертаються/);
  expect(await meterY()).toBe(y0);

  await click(host, 'Наступний гравець');
  await row('Оля').waitFor();
  await meterSays('Банк: 1500');
  const olya1 = await rowText('Оля');
  expect(olya1).toContain('убанк');
  expect(olya1).toContain('1500→500');
  expect(olya1).not.toContain('ВА-БАНК');
  for (const page of [stage, ...phones]) expect(await visible(page)).not.toMatch(/642|858|з банку|ставки повертаються|Розділити/);
  expect(await meterY()).toBe(y0);
  await shot(stage, 'bank7e-bank-grown-stage');

  // Розподіл: кнопку бачить лише ведучий; частки 642 і 858 (залишок 1 — Маркові з найбільшою ставкою).
  await host.getByRole('button', { name: 'Розділити банк', ...exact }).waitFor();
  const beforeSplit = { petro: await columns('Петро'), ira: await columns('Іра') };
  // «ВА-БАНК!» Іри живе в колонці імені: відповідь, ставка й рахунок стоять у тих самих колонках, що в Петра.
  expect(beforeSplit.ira.given[0]).toBe(beforeSplit.petro.given[0]);
  expect(beforeSplit.ira.stake[0]).toBe(beforeSplit.petro.stake[0]);
  expect(beforeSplit.ira.delta[0]).toBe(beforeSplit.petro.delta[0]);
  const hostShareBefore = (await host.locator('.wager-list li', { hasText: 'Петро' }).locator('.wager-share').boundingBox())!;
  await click(host, 'Розділити банк');
  await meterSays('Банк 1500 розділено');
  await expect.poll(() => rowText('Петро')).toContain('1000→1642');
  expect({ petro: await columns('Петро'), ira: await columns('Іра') }).toEqual(beforeSplit);
  await host.locator('.wager-list li', { hasText: 'Петро' }).getByText('+642 з банку', exact).waitFor();
  const hostShareAfter = (await host.locator('.wager-list li', { hasText: 'Петро' }).locator('.wager-share').boundingBox())!;
  expect([hostShareAfter.x, hostShareAfter.y, hostShareAfter.width]).toEqual([hostShareBefore.x, hostShareBefore.y, hostShareBefore.width]);
  expect(await rowText('Петро')).toContain('+642збанку');
  expect(await rowText('Марко')).toContain('1000→1858');
  expect(await rowText('Марко')).toContain('+858збанку');
  expect(await rowText('Оля')).toContain('1500→500');
  expect(await rowText('Іра')).toContain('500→0');
  expect(await meterY()).toBe(y0);
  await petro.getByText('+642 з банку', exact).waitFor();
  await petro.getByText('Рахунок: 1642', exact).waitFor();
  await olya.getByText('Ставка пішла в банк', exact).waitFor();
  await shot(stage, 'bank7e-split-stage');
  await shot(petro, 'bank7e-split-phone');
  await expectNoSideScroll(olya, 'bank7e-result-375');

  // 6. Фінал 2: ніхто не відповідає правильно — ставки повертаються.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await stage.getByRole('heading', { name: 'Історія' }).waitFor();
  await click(host, 'Почати фінал');
  await ira.getByRole('button', { name: 'Поставити 0', ...exact }).waitFor();
  expect(await ira.getByRole('button', { name: 'Ва-банк', ...exact }).count()).toBe(0);
  await click(ira, 'Поставити 0');
  await olya.getByText('Ваша ставка від 0 до 500', exact).waitFor();
  await click(olya, 'Ва-банк');
  await olya.getByText('Ваша ставка: 500 — ва-банк!', exact).waitFor();
  await petro.getByText('Ваша ставка від 0 до 1642', exact).waitFor();
  await petro.getByLabel('Ставка', exact).fill('600');
  await click(petro, 'Поставити');
  await petro.getByText('Ваша ставка: 600', exact).waitFor();
  await marko.getByLabel('Ставка', exact).fill('0');
  await click(marko, 'Поставити');
  await olya.locator('h1', { hasText: 'Фінал 2:' }).waitFor();
  await pick(ira, false);
  await pick(olya, false);
  await pick(petro, false);
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  await meterSays('Банк: 0');
  expect(await stage.locator('.wager-list li').count()).toBe(0);

  // Розкриття: Іра 0, Оля 500, Петро 1642, Марко 1858.
  await click(host, 'Наступний гравець');
  await row('Іра').waitFor();
  await meterSays('Банк: 0');
  expect(await rowText('Іра')).toContain('0→0');
  await click(host, 'Наступний гравець');
  await row('Оля').waitFor();
  await meterSays('Банк: 500');
  expect(await rowText('Оля')).toContain('ВА-БАНК!');
  expect(await rowText('Оля')).toContain('500→0');
  expect(await row('Петро').count()).toBe(0);
  for (const page of [stage, ...phones]) expect(await visible(page)).not.toMatch(/ставки повертаються|1100/);
  await click(host, 'Наступний гравець');
  await row('Петро').waitFor();
  await meterSays('Банк: 1100');
  expect(await rowText('Петро')).toContain('1642→1042');
  await click(host, 'Наступний гравець');
  await row('Марко').waitFor();
  await meterSays('Банк: 1100');
  expect(await rowText('Марко')).toContain('1858→1858');
  for (const page of [stage, ...phones]) expect(await visible(page)).not.toMatch(/ставки повертаються|Розділити/);
  expect(await rowText('Іра')).not.toContain('убанк');
  const beforeRefund = { olya: await columns('Оля'), meter: await meterH(), y: await meterY() };

  await click(host, 'Розділити банк');
  // На сцені коротко й в один рядок; повне пояснення — на телефоні.
  await meterSays('Ставки повернуто');
  await expect.poll(() => rowText('Оля')).toContain('500→500');
  expect(await rowText('Петро')).toContain('1642→1642');
  expect(await rowText('Оля')).toContain('ставкуповернуто');
  expect(await rowText('Петро')).toContain('ставкуповернуто');
  expect(await rowText('Іра')).not.toMatch(/убанк|повернуто/);
  expect(await visible(stage)).not.toMatch(/у банк|з банку/);
  expect({ olya: await columns('Оля'), meter: await meterH(), y: await meterY() }).toEqual(beforeRefund);
  await olya.getByText('Ніхто не відповів правильно — ставки повертаються', exact).waitFor();
  await shot(stage, 'bank7e-refund-stage');

  // 7. Переможці: Марко 1858, Петро 1642, Оля 500, Іра 0.
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const scores = async (page: Page) => {
    const rows = page.locator('.standings li');
    await rows.first().waitFor();
    const result: [string, string][] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      result.push([(await rows.nth(i).locator('.name').textContent())!, (await rows.nth(i).locator('.score').textContent())!]);
    }
    return result;
  };
  const totals = await scores(stage);
  expect(totals).toEqual([
    ['Марко', '1858'],
    ['Петро', '1642'],
    ['Оля', '500'],
    ['Іра', '0'],
  ]);
  await shot(stage, 'bank7e-final-stage');

  // 8. Історія: ті самі рахунки, ставки зі збереженої колонки, обидва фінали — спільний банк.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Банк/ }).click();
  expect(await scores(host)).toEqual(totals);
  const finals = host.locator('div.wager-list');
  await finals.nth(1).waitFor();
  expect(await finals.count()).toBe(2);
  const lines = async (at: number) => (await finals.nth(at).locator('li').allTextContents()).map(flat);
  expect(await finals.nth(0).locator('h4').textContent()).toBe('Ставки фіналу · спільний банк');
  expect(await finals.nth(1).locator('h4').textContent()).toBe('Ставки фіналу · спільний банк');
  expect(await lines(0)).toEqual(
    expect.arrayContaining(['Оля:ставка1000,−1000', 'Петро:ставка300,+642', 'Іра:ставка500,−500', 'Марко:ставка400,+858']),
  );
  expect(await lines(1)).toEqual(expect.arrayContaining(['Оля:ставка500,0', 'Петро:ставка600,0', 'Іра:ставка0,0', 'Марко:ставка0,0']));
  await shot(host, 'bank7e-history-host');

  // 9. «Мої ігри» й ачівка Петра.
  await petro.goto(`${base}/me`);
  const mine = petro.locator('.quiz-list li', { hasText: 'Банк' });
  await mine.waitFor();
  expect(await mine.textContent()).toContain('1642 бали');
  await expectNoSideScroll(petro, 'bank7e-my-games-phone');
  await petro.goto(`${base}/profile`);
  await petro.locator('.achievements li:not(.locked)', { hasText: 'Влучна ставка' }).waitFor();

  expect(problems).toEqual([]);
}

it('part 7f: sorting — the editor, 2/3/4 zones by drag, tap and arrow, a mistake with a lock and a retry, stage progress without answers, the reveal by category, a board cell for the chooser only, a blitz won by the fastest, a final only for all words, the history', async () => {
  try {
    await sortGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Слово на 40 символів без пробілів: найгірший випадок для середини телефона з чотирма зонами. */
const LONG_SORT = 'Найнайнайзолотистожовтогарячолистопадний';
const SORT_ARROWS: Record<string, string> = { left: 'ArrowLeft', right: 'ArrowRight', top: 'ArrowUp', bottom: 'ArrowDown' };
const sortZone = (page: Page, name: string) => page.getByRole('button', { name: `Категорія «${name}»`, ...exact });
/** Текст поточної картки; null — картки немає. */
const sortCard = async (page: Page) => (await page.evaluate("document.querySelector('.sort-card')?.textContent ?? null")) as string | null;
/** Прямокутники зон у порядку сторінки, округлені до пікселя. */
async function sortZoneBoxes(page: Page): Promise<number[][]> {
  const zones = page.locator('.sort-zone');
  const result: number[][] = [];
  for (let i = 0; i < (await zones.count()); i++) {
    const box = (await zones.nth(i).boundingBox())!;
    result.push([box.x, box.y, box.width, box.height].map(Math.round));
  }
  return result;
}

/**
 * Один хід сортування: дотик до зони, стрілка її позиції або перетягування картки мишею в зону.
 * Чекає, поки картка зміниться, зникне або з'явиться підвисання. Хід, який телефон пропустив
 * (відповідь сервера на попередній ще летіла), повторюється.
 */
async function sortBy(page: Page, how: 'tap' | 'key' | 'drag', zone: string) {
  const before = await sortCard(page);
  const target = sortZone(page, zone);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (how === 'tap') await target.click();
    else if (how === 'key') await page.keyboard.press(SORT_ARROWS[(await target.getAttribute('data-pos'))!]!);
    else {
      const card = (await page.locator('.sort-card').boundingBox())!;
      const to = (await target.boundingBox())!;
      await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
      await page.mouse.up();
    }
    const moved = await page
      .waitForFunction(
        `(() => { const card = document.querySelector('.sort-card'); return document.querySelector('.sort-lock') !== null || card === null || card.textContent !== ${JSON.stringify(before)}; })()`,
        undefined,
        { timeout: 2500 },
      )
      .then(
        () => true,
        () => false,
      );
    if (moved) return;
  }
  throw new Error(`sortBy(${how}, ${zone}): the card «${before}» did not move`);
}

async function sortGame() {
  const host = await open('host7f', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host7f@example.com');

  /** Правильна категорія кожного слова: лише в тесті, телефон її не знає. */
  const where: Record<string, string> = {};
  const sortQuestion = (id: string, text: string, categories: string[], words: [string, number][], points: number, lockSeconds: number, timeLimit: number) => {
    for (const [word, at] of words) where[word] = categories[at]!;
    return {
      id,
      type: 'sort' as const,
      text,
      imageUrl: null,
      video: null,
      timeLimit,
      points,
      lockSeconds,
      categories: categories.map((category, at) => ({ id: `${id}-c${at}`, text: category })),
      words: words.map(([word, at], index) => ({ id: `${id}-w${index}`, text: word, categoryId: `${id}-c${at}` })),
    };
  };
  const s1Words = ['Морква', 'Яблуко', 'Буряк', 'Груша'];
  const s1 = sortQuestion('s1', 'Овочі чи фрукти?', ['Овочі', 'Фрукти'], [['Морква', 0], ['Яблуко', 1], ['Буряк', 0], ['Груша', 1]], 100, 3, 60);
  const s2Words = ['Кит', 'Сова', 'Щука', 'Кажан', 'Пінгвін', 'Карась'];
  const s2 = sortQuestion('s2', 'Хто це?', ['Ссавці', 'Птахи', 'Риби'], [['Кит', 0], ['Сова', 1], ['Щука', 2], ['Кажан', 0], ['Пінгвін', 1], ['Карась', 2]], 50, 3, 60);
  const s3 = sortQuestion('s3', 'Пори року', ['Зима', 'Весна', 'Літо', 'Осінь'], [['Січень', 0], ['Квітень', 1], ['Липень', 2], [LONG_SORT, 3]], 100, 1, 45);
  const s4Words = ['Яблуня', 'Смородина', 'Вишня', 'Аґрус'];
  const s4 = sortQuestion('s4', 'Дерево чи кущ?', ['Дерево', 'Кущ'], [['Яблуня', 0], ['Смородина', 1], ['Вишня', 0], ['Аґрус', 1]], 50, 3, 45);
  const s5 = sortQuestion('s5', 'Чай чи кава?', ['Чай', 'Кава'], [['Капучино', 1], ['Улун', 0], ['Еспресо', 1], ['Пуер', 0]], 100, 3, 45);
  const s6Words = ['Залізо', 'Кисень', 'Мідь', 'Сірка'];
  const s6 = sortQuestion('s6', 'Метал чи неметал?', ['Метал', 'Неметал'], [['Залізо', 0], ['Кисень', 1], ['Мідь', 0], ['Сірка', 1]], 100, 3, 30);
  const cellQ = (id: string, text: string, points: number) => ({ ...withPoints(withId(single, id), points), text, timeLimit: 30 });
  const rounds = [
    classicRound('r1', [s1, s2, s3], {
      title: 'Розминка',
      speedBonus: true,
      rules: { penalty: 'minus', partial: null, streak: { length: 2, bonus: { kind: 'fixed', value: 100 } }, multiplier: 1 },
    }),
    boardRound(
      'r2',
      [
        { title: 'Міста', cells: [cellQ('b11', 'Місто за 100?', 100), cellQ('b12', 'Місто за 200?', 200), cellQ('b13', 'Місто за 300?', 300)] },
        { title: 'Сад', cells: [cellQ('b21', 'Сад за 100?', 100), cellQ('b22', 'Сад за 300?', 300), { question: s4, mark: 'x2', answerMode: 'phone' }] },
        { title: 'Річки', cells: [cellQ('b31', 'Річка за 100?', 100), cellQ('b32', 'Річка за 200?', 200), cellQ('b33', 'Річка за 300?', 300)] },
      ],
      { title: 'Поле' },
    ),
    blitzRound('r3', [s5], { title: 'Бліц', check: 'auto' }),
    finalRound('r4', s6, { title: 'Хімія', wagerMode: 'classic' }),
  ];
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end' }), title: 'Сортування' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Редактор: категорії, слова з категорією, бали за слово з сумою; підвисання 3 → 2.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Сортування' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.getByRole('button', { name: /^Запитання 1 Овочі чи фрукти\?/ }).click();
  expect(await field(host, 'Категорія 1').inputValue()).toBe('Овочі');
  expect(await field(host, 'Категорія 2').inputValue()).toBe('Фрукти');
  for (const [index, word] of s1Words.entries()) {
    expect(await field(host, `Слово ${index + 1}`).inputValue()).toBe(word);
    expect(await host.getByLabel(`Категорія слова ${index + 1}`, exact).locator('option:checked').textContent()).toBe(where[word]);
  }
  expect(await field(host, 'Бали за слово').inputValue()).toBe('100');
  await host.getByText('Разом до 400 балів (не більше 2000)', exact).waitFor();
  const lock = field(host, 'Підвисання після помилки, с');
  expect(await lock.inputValue()).toBe('3');
  await lock.fill('2');
  await shot(host, 'sort7f-editor-host');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'sort7f-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  // Клітинка поля з сортуванням: ціна — найбільша сума (4 × 50), без перемикачів типу й способу.
  await host.getByRole('button', { name: 'Поле', ...exact }).click();
  await host.getByRole('button', { name: 'Категорія 2, клітинка 3: 200 ×2', ...exact }).click();
  await host.getByText('Сортує лише той, хто вибрав клітинку, з телефона. Бали — за кожне відсортоване слово.', exact).waitFor();
  expect(await host.locator('label.field', { hasText: 'Тип клітинки' }).count()).toBe(0);
  expect(await host.locator('label.field', { hasText: 'Як відповідати' }).count()).toBe(0);
  await shot(host, 'sort7f-editor-board-cell');
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // 2. Гра: сцена, Оля 375 px, Петро 360 px.
  await host.locator('.quiz-list li', { hasText: 'Сортування' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7f', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya7f', 375, 812);
  const petro = await open('petro7f', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();

  const hostScore = async (nickname: string) => (await host.locator('.player-row', { hasText: nickname }).locator('.score').textContent())!;
  const scores = async () => [await hostScore('Оля'), await hostScore('Петро')];
  /** До розкриття: у сторінці немає жодного слова, крім дозволеної картки. */
  const noLeaks = async (page: Page, words: string[], allowed: string | null, label: string) => {
    const html = await page.content();
    for (const word of words) if (word !== allowed) expect(html, `${label}: «${word}» leaked`).not.toContain(word);
  };
  const zonesAt = async (page: Page) =>
    Object.fromEntries(
      await Promise.all(
        (await page.locator('button.sort-zone').all()).map(async (zone) => [await zone.getAttribute('data-pos'), await zone.textContent()] as const),
      ),
    );
  /** Сортує все правильно, поки є картка; повертає слова в тому порядку, як вони приходили. */
  const sortRest = async (page: Page, how: 'tap' | 'key' | 'drag' = 'tap') => {
    const seen: string[] = [];
    for (let card = await sortCard(page); card !== null; card = await sortCard(page)) {
      seen.push(card);
      await sortBy(page, how, where[card]!);
    }
    return seen;
  };
  const stageRows = stage.locator('.sort-board li');
  const stageRowsShape = async () => {
    const result: number[] = [];
    for (let i = 0; i < (await stageRows.count()); i++) result.push(Math.round((await stageRows.nth(i).boundingBox())!.height));
    return result;
  };
  const toNextRound = async () => {
    await click(host, 'Далі');
    await click(host, 'Наступний раунд');
  };
  // Смужки прогресу плавно доростають (0,3 с): знімок — після того, як вони стали на місце.
  const barsSettled = () =>
    stage.waitForFunction("document.getAnimations().every((a) => a.playState === 'finished' || !a.effect?.target?.classList.contains('sort-bar-fill'))");

  // 3. s1, дві зони: Оля сортує перетягуванням, дотиком і стрілками; зони не рухаються.
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  await olya.locator('.sort-card').waitFor();
  await petro.locator('.sort-card').waitFor();
  expect(await zonesAt(olya)).toEqual({ left: 'Овочі', right: 'Фрукти' });
  await expectNoSideScroll(olya, 'sort7f-phone-2');
  await expectNoSideScroll(petro, 'sort7f-phone-2-360');
  await stageRows.nth(1).waitFor();
  expect(await stageRows.count()).toBe(2);
  const rowsBefore = await stageRowsShape();
  await noLeaks(stage, s1Words, null, 'stage s1');
  await noLeaks(olya, s1Words, await sortCard(olya), 'olya s1');
  await noLeaks(petro, s1Words, await sortCard(petro), 'petro s1');
  // Порядок слів однаковий для всіх.
  expect(await sortCard(petro)).toBe(await sortCard(olya));
  const olyaZones = await sortZoneBoxes(olya);
  for (const [index, how] of (['drag', 'tap', 'key', 'key'] as const).entries()) {
    const card = (await sortCard(olya))!;
    await noLeaks(olya, s1Words, card, `olya s1 move ${index + 1}`);
    await sortBy(olya, how, where[card]!);
    await olya.locator('.sort-progress', { hasText: `${index + 1} з 4` }).waitFor();
    expect(await olya.locator('.sort-lock').count(), `olya s1: ${how} was a mistake`).toBe(0);
    expect(await sortZoneBoxes(olya)).toEqual(olyaZones);
  }
  await olya.locator('.sort-done').waitFor();

  // Петро помиляється: картка трусить, підвисання з відліком, дотик під час нього нічого не робить.
  const missed = (await sortCard(petro))!;
  const wrong = where[missed] === 'Овочі' ? 'Фрукти' : 'Овочі';
  const petroZones = await sortZoneBoxes(petro);
  const shook = petro.locator('.sort-card.is-shaking').waitFor({ timeout: 5000 });
  await sortBy(petro, 'tap', wrong);
  await shook;
  await petro.locator('.sort-lock').getByText('Помилка! Підвисання: 2 с', exact).waitFor();
  expect(await sortCard(petro)).toBe(missed);
  expect(await sortZoneBoxes(petro)).toEqual(petroZones);
  await shot(petro, 'sort7f-lock-phone');
  await sortZone(petro, where[missed]!).click({ force: true });
  expect(await petro.locator('.sort-progress').textContent()).toBe('0 з 4');
  expect(await sortCard(petro)).toBe(missed);
  // Сцена: прогрес обох без жодного слова; рядків стільки ж і тієї самої висоти.
  await expect.poll(async () => (await stageRows.filter({ hasText: 'Петро' }).textContent()) ?? '').toContain('помилок: 1');
  const olyaRow = (await stageRows.filter({ hasText: 'Оля' }).innerText()).replace(/\s+/g, ' ');
  expect(olyaRow).toMatch(/4\/4 \d+(,\d)? с/);
  expect(await stageRowsShape()).toEqual(rowsBefore);
  await noLeaks(stage, s1Words, null, 'stage s1 progress');
  await barsSettled();
  await shot(stage, 'sort7f-stage-progress');
  await shot(host, 'sort7f-host-progress');
  // Пульт на телефоні 375 px: рядок з довгим іменем і помилками не дає бічної прокрутки, тисне лише ім'я.
  await host.setViewportSize({ width: 375, height: 812 });
  const petroRow = host.locator('.sort-board li', { hasText: 'Петро' });
  const petroName = petroRow.locator('.name');
  type NameCell = { textContent: string | null; dataset: Record<string, string | undefined>; scrollWidth: number; clientWidth: number };
  await petroName.evaluate((el: NameCell) => {
    el.dataset.was = el.textContent ?? '';
    el.textContent = 'Петро Довгопрізвищенко-Найдовшеімʼяненко';
  });
  expect(await petroRow.innerText()).toContain('помилок: 1');
  await expectNoSideScroll(host, 'sort7f-host-progress-375');
  expect(await petroName.evaluate((el: NameCell) => el.scrollWidth > el.clientWidth), 'the long name is cut with an ellipsis').toBe(true);
  await petroName.evaluate((el: NameCell) => {
    el.textContent = el.dataset.was ?? '';
  });
  await host.setViewportSize({ width: 1280, height: 900 });
  await petro.locator('.sort-lock').waitFor({ state: 'detached', timeout: 5000 });
  const petroOrder = await sortRest(petro);
  expect(petroOrder.at(-1)).toBe(missed);
  expect(petroOrder).toHaveLength(4);
  // Обидва закінчили: запитання закривається саме.
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await noLeaks(stage, s1Words, null, 'stage s1 locked');
  await click(host, 'Показати відповідь');
  const column = (name: string) => stage.locator('.sort-reveal.is-open .sort-reveal-col', { has: stage.locator('h3', { hasText: name }) });
  await column('Овочі').waitFor();
  expect(await column('Овочі').locator('li').allTextContents()).toEqual(['Морква', 'Буряк']);
  expect(await column('Фрукти').locator('li').allTextContents()).toEqual(['Яблуко', 'Груша']);
  expect(await stage.evaluate('document.documentElement.scrollHeight <= innerHeight'), 'stage reveal scrolls').toBe(true);
  await barsSettled();
  await shot(stage, 'sort7f-stage-reveal');
  await expect.poll(scores).toEqual(['400', '400']);

  // 4. s2, три зони: «Риби» вгорі; Оля все, Петро три слова; ведучий закриває.
  await click(host, 'Далі');
  await petro.locator('h1', { hasText: 'Хто це?' }).waitFor();
  await petro.locator('.sort-card').waitFor();
  expect(await zonesAt(petro)).toEqual({ left: 'Ссавці', right: 'Птахи', top: 'Риби' });
  await expectNoSideScroll(petro, 'sort7f-phone-3');
  await noLeaks(stage, s2Words, null, 'stage s2');
  await noLeaks(petro, s2Words, await sortCard(petro), 'petro s2');
  await sortRest(olya, 'key');
  await olya.locator('.sort-done').waitFor();
  for (let i = 0; i < 3; i++) {
    const card = (await sortCard(petro))!;
    await sortBy(petro, i === 1 ? 'drag' : 'tap', where[card]!);
  }
  await petro.locator('.sort-progress', { hasText: '3 з 6' }).waitFor();
  await noLeaks(stage, s2Words, null, 'stage s2 progress');
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  await expect.poll(scores).toEqual(['800', '550']);

  // 5. s3, чотири зони, зменшений рух: помилка без трусіння, відлік видно; слово на 40 символів не розпирає екран.
  await olya.emulateMedia({ reducedMotion: 'reduce' });
  await click(host, 'Далі');
  await olya.locator('h1', { hasText: 'Пори року' }).waitFor();
  await olya.locator('.sort-card').waitFor();
  expect(await zonesAt(olya)).toEqual({ left: 'Зима', right: 'Весна', top: 'Літо', bottom: 'Осінь' });
  await shot(olya, 'sort7f-phone-4');
  await expectNoSideScroll(petro, 'sort7f-phone-4-360');
  const first = (await sortCard(olya))!;
  await sortBy(olya, 'key', where[first] === 'Осінь' ? 'Зима' : 'Осінь');
  await olya.locator('.sort-lock').getByText('Помилка! Підвисання: 1 с', exact).waitFor();
  expect(await olya.locator('.sort-card').getAttribute('class')).toBe('sort-card');
  await shot(olya, 'sort7f-reduced-lock');
  await olya.locator('.sort-lock').waitFor({ state: 'detached', timeout: 5000 });
  for (let card = await sortCard(olya); card !== null; card = await sortCard(olya)) {
    if (card === LONG_SORT) {
      await expectNoSideScroll(olya, 'sort7f-phone-4-375');
      await expectApart(olya, '.sort-card', ['.sort-zone'], 's3 long word');
    }
    await sortBy(olya, 'key', where[card]!);
  }
  await olya.locator('.sort-done').waitFor();
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  await expect.poll(scores).toEqual(['1300', '550']);
  await olya.emulateMedia({ reducedMotion: 'no-preference' });

  // 6. Поле: сортує лише Оля, Петро бачить, хто сортує й скільки лишилося.
  await toNextRound();
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await olya.getByRole('button', { name: 'Сад, 200', ...exact }).click();
  await olya.locator('.sort-card').waitFor();
  await petro.getByText('Оля сортує слова', exact).waitFor();
  await petro.locator('.sort-progress', { hasText: '0 з 4' }).waitFor();
  expect(await petro.locator('.sort-card').count()).toBe(0);
  expect(await petro.locator('button.sort-zone').count()).toBe(0);
  // План 9a: на полі глядачі й сцена бачать усі слова — за абеткою, без категорій, доки немає розкриття.
  const boardWords = [...s4Words].sort((a, b) => a.localeCompare(b, 'uk'));
  for (const page of [petro, stage]) {
    await page.locator('.sort-words li').first().waitFor();
    expect(await page.locator('.sort-words li').allTextContents()).toEqual(boardWords);
    expect(await page.locator('.sort-reveal.is-open').count(), 'the board reveal opened early').toBe(0);
  }
  await expectNoSideScroll(petro, 'sort7f-board-watch-phone');
  // Глядач бачить живий прогрес того, хто сортує; останнє слово одразу відкриває відповідь.
  for (let i = 0; i < 3; i++) await sortBy(olya, 'tap', where[(await sortCard(olya))!]!);
  await petro.locator('.sort-progress', { hasText: '3 з 4' }).waitFor();
  expect(await petro.locator('.sort-reveal.is-open').count(), 'the board reveal opened early').toBe(0);
  await sortRest(olya);
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await expect.poll(async () => (await stageRows.filter({ hasText: 'Оля' }).textContent()) ?? '').toContain('4/4');
  expect(await stageRows.count()).toBe(1);
  await petro.getByText('Відповідав Оля', exact).waitFor();
  await shot(stage, 'sort7f-board-stage');
  await shot(petro, 'sort7f-board-reveal-phone');
  await expect.poll(scores).toEqual(['1700', '550']);
  await click(host, 'Далі');
  const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
  const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
  await Promise.race([next.waitFor(), picking.waitFor()]);
  if (await next.isVisible()) await next.click();
  await picking.waitFor();
  await click(host, 'Завершити раунд');
  await click(host, 'Наступний раунд');

  // 7. Бліц: Петро першим сортує все й забирає суму, Оля — нуль.
  await click(host, 'Почати раунд');
  await olya.locator('.sort-card').waitFor();
  await petro.locator('.sort-card').waitFor();
  await sortBy(olya, 'tap', where[(await sortCard(olya))!]!);
  await sortRest(petro);
  for (const page of [stage, olya, petro]) await page.getByText('Найшвидше все відсортовано: Петро', exact).waitFor();
  await barsSettled();
  await shot(stage, 'sort7f-blitz-winner');
  await shot(olya, 'sort7f-blitz-winner-phone');
  await click(host, 'Показати відповідь');
  await expect.poll(scores).toEqual(['1700', '950']);

  // 8. Фінал: Оля ставить 1000, Петро ва-банк; сцена не бачить прогресу.
  await toNextRound();
  await stage.getByRole('heading', { name: 'Хімія' }).waitFor();
  await click(host, 'Почати фінал');
  await olya.getByLabel('Ставка', exact).fill('1000');
  await click(olya, 'Поставити');
  await olya.getByText('Ваша ставка: 1000', exact).waitFor();
  await click(petro, 'Ва-банк');
  await olya.locator('.sort-card').waitFor();
  await petro.locator('.sort-card').waitFor();
  await sortRest(olya);
  for (let i = 0; i < 3; i++) await sortBy(petro, 'tap', where[(await sortCard(petro))!]!);
  await petro.locator('.sort-progress', { hasText: '3 з 4' }).waitFor();
  expect(await stage.locator('.sort-board').count()).toBe(0);
  expect(await bodyText(stage)).not.toContain('Усе відсортували');
  await noLeaks(stage, s6Words, null, 'stage final');
  await shot(stage, 'sort7f-final-stage');
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  const wager = (nickname: string) => stage.locator('.wager-list li', { hasText: nickname });
  const flat = async (nickname: string) => ((await wager(nickname).textContent()) ?? '').replace(/\s/g, '');
  await click(host, 'Наступний гравець');
  await wager('Петро').waitFor();
  expect(await flat('Петро')).toContain('950→0');
  expect(await wager('Оля').count()).toBe(0);
  await click(host, 'Наступний гравець');
  await wager('Оля').waitFor();
  expect(await flat('Оля')).toContain('1700→2700');
  await shot(stage, 'sort7f-final-reveal');
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const standings = async (page: Page) => {
    const rows = page.locator('.standings li');
    await rows.first().waitFor();
    const result: [string, string][] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      result.push([(await rows.nth(i).locator('.name').textContent())!, (await rows.nth(i).locator('.score').textContent())!]);
    }
    return result;
  };
  const totals = await standings(stage);
  expect(totals).toEqual([
    ['Оля', '2700'],
    ['Петро', '0'],
  ]);

  // 9. Історія: ті самі рахунки, підсумки сортування й правильний розклад.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Сортування/ }).click();
  expect(await standings(host)).toEqual(totals);
  const played = (text: string) => host.locator('.rows.stacked > li', { hasText: text });
  const responses = async (text: string) => {
    await played(text).getByText(/^Відповіді \(\d+\)$/).click();
    return Object.fromEntries(
      await Promise.all(
        (await played(text).locator('.responses li').all()).map(
          async (row) => [await row.locator('.responses-name').textContent(), await row.locator('.responses-answer').textContent()] as const,
        ),
      ),
    );
  };
  const r1 = await responses('Овочі чи фрукти?');
  expect(r1['Оля']).toMatch(/^Відсортовано 4 з 4 за \d+(,\d)? с, помилок: 0$/);
  expect(r1['Петро']).toMatch(/^Відсортовано 4 з 4 за \d+(,\d)? с, помилок: 1$/);
  expect((await responses('Хто це?'))['Петро']).toBe('Відсортовано 3 з 6, помилок: 0');
  await played('Овочі чи фрукти?').getByText('Правильна відповідь: Овочі: Морква, Буряк; Фрукти: Яблуко, Груша', exact).waitFor();
  const cellRow = (await played('Дерево чи кущ?').innerText()).replace(/\s+/g, ' ');
  expect(cellRow).toContain('Сад · 200');
  expect(cellRow).toContain('×2');
  expect(cellRow).toContain('Оля: +400');
  await shot(host, 'sort7f-history-host');

  expect(problems).toEqual([]);
}

it('part 7g: duels — the editor section, the button after a third, an opponent picked, others disabled, the duel on the stage, phones and host, a category, first right answer wins, retries, a skip, a tie, a stake moved with a line in the history, a cancel, the game going on where it stood', async () => {
  try {
    await duelGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Дуелянт вписує відповідь і тисне «Відповісти»; чекає ack: поле очистилося (спроба) або зникло (правильна відповідь закрила запитання). */
async function duelAnswer(page: Page, text: string) {
  await field(page, 'Ваша відповідь').fill(text);
  await click(page, 'Відповісти');
  await page.waitForFunction("(() => { const input = document.querySelector('.duel-answer input'); return input === null || input.value === ''; })()");
}

/** Кожен гравець відповідає правильно кнопкою варіанта; ведучий відкриває відповідь. */
async function answerAll(host: Page, players: Page[]) {
  for (const page of players) {
    await page.getByRole('button', { name: /Київ/ }).click();
    await page.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
  }
  await click(host, 'Показати відповідь');
  for (const page of players) await page.locator('section.result').first().waitFor();
}

/** Усі тексти, що сторінка отримала сокетом: витік видно ще до того, як щось намальовано. */
function socketFrames(page: Page): string[] {
  const list: string[] = [];
  page.on('websocket', (socket) => socket.on('framereceived', (frame) => list.push(String(frame.payload))));
  return list;
}

const duelButton = (page: Page) => page.getByRole('button', { name: '⚔ Дуель', ...exact });

/** Прямокутники частин сцени дуелі, округлені до пікселя (null — немає), і чи вміщається сцена без прокрутки. */
const DUEL_STAGE_GEOMETRY = `(() => {
  const box = (selector) => {
    const element = document.querySelector(selector);
    if (element === null) return null;
    const r = element.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map(Math.round);
  };
  return {
    challenger: box('.duel-stage-side.is-challenger'),
    opponent: box('.duel-stage-side.is-opponent'),
    score: box('.duel-stage-score'),
    body: box('.duel-stage-body'),
    question: box('.duel-stage-question'),
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight,
    wide: document.documentElement.scrollWidth <= innerWidth,
  };
})()`;
type DuelGeometry = {
  challenger: number[] | null;
  opponent: number[] | null;
  score: number[] | null;
  body: number[] | null;
  question: number[] | null;
  scrollHeight: number;
  innerHeight: number;
  wide: boolean;
};
const duelGeometry = async (page: Page) => (await page.evaluate(DUEL_STAGE_GEOMETRY)) as DuelGeometry;

async function duelGame() {
  const host = await open('host7g', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host7g@example.com');

  const q = (n: number) => ({ ...withPoints(withId(single, `q${n}`), 100), text: `Запитання ${n}: столиця України?`, timeLimit: 20 });
  const rounds = [
    classicRound('r1', [q(1), q(2), q(3)], { title: 'Розминка', speedBonus: false }),
    classicRound('r2', [q(4), q(5), q(6)], { title: 'Другий', speedBonus: false }),
    finalRound('r3', { ...withPoints(withId(single, 'f1'), 100), text: 'Фінал: столиця України?' }, { title: 'Фінал' }),
  ];
  const duels = {
    categories: [
      {
        id: 'dc1',
        title: 'Столиці',
        questions: [
          { id: 'd1', text: 'Столиця Франції?', accepted: ['Париж'] },
          { id: 'd2', text: 'Столиця Італії?', accepted: ['Рим'] },
          { id: 'd3', text: 'Столиця Польщі?', accepted: ['Варшава'] },
        ],
      },
      {
        id: 'dc2',
        title: 'Хімія',
        questions: [
          { id: 'd4', text: 'Символ Fe — це…', accepted: ['Залізо', 'Ферум'] },
          { id: 'd5', text: 'Символ Au — це…', accepted: ['Золото', 'Аурум'] },
          { id: 'd6', text: 'Символ O — це…', accepted: ['Кисень', 'Оксиген'] },
        ],
      },
    ],
    questionsPerDuel: 2,
    timeLimit: 30,
    stake: 300,
  };
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end' }), title: 'Дуелі', duels };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Редактор: розділ «Дуелі» з пулом; 4 запитання за дуель не зберігаються.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Дуелі' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('details.duels > summary').click();
  expect(await field(host, 'Запитань за дуель').inputValue()).toBe('2');
  expect(await field(host, 'Ставка: програвший віддає переможцю').inputValue()).toBe('300');
  await host.getByRole('button', { name: 'Столиці · 3 запитання', ...exact }).waitFor();
  await host.getByRole('button', { name: 'Хімія · 3 запитання', ...exact }).waitFor();
  await field(host, 'Запитань за дуель').fill('4');
  await click(host, 'Зберегти');
  await host.locator('.problems', { hasText: 'Дуелі, «Столиці»: замало запитань — потрібно щонайменше 4.' }).waitFor();
  expect(host.url()).not.toMatch(/\/quizzes$/);
  await field(host, 'Запитань за дуель').fill('2');
  await shot(host, 'duel7g-editor');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'duel7g-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // Гра: сцена 1600 × 900, Оля 375, Петро 360, Іра 390.
  await host.locator('.quiz-list li', { hasText: 'Дуелі' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7g', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya7g', 375, 812);
  const petro = await open('petro7g', 360, 740);
  const ira = await open('ira7g', 390, 844);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const iraFrames = socketFrames(ira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];

  const hostScore = async (nickname: string) => (await host.locator('.player-row', { hasText: nickname }).locator('.score').textContent())!;
  const scores = async () => ({ Оля: await hostScore('Оля'), Петро: await hostScore('Петро'), Іра: await hostScore('Іра') });
  /** Ні DOM сторінок, ні їхні сокети не містять тексту. */
  const nowhere = async (where: [Page, string[]][], text: string, label: string) => {
    for (const [page, frames] of where) {
      expect(await page.content(), `${label}: «${text}» in the DOM`).not.toContain(text);
      expect(
        frames.some((frame) => frame.includes(text)),
        `${label}: «${text}» came over the socket`,
      ).toBe(false);
    }
  };
  const stageSay = (text: string) => stage.locator('.duel-stage').getByText(text, exact).waitFor();
  const stageScore = (text: string) => stage.locator('.duel-stage-score', { hasText: text }).waitFor();
  const geometry: Record<string, DuelGeometry> = {};

  // 1. До третини: після q1 кнопки немає; після q2 — є в усіх, а шапка Петра не виросла.
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  await olya.locator('h1', { hasText: 'Запитання 1:' }).waitFor();
  await answerAll(host, phones);
  for (const page of phones) expect(await duelButton(page).count()).toBe(0);
  await click(host, 'Далі');
  await petro.locator('h1', { hasText: 'Запитання 2:' }).waitFor();
  expect(await duelButton(petro).count()).toBe(0);
  const petroQuestionY = (await petro.locator('h1.question').first().boundingBox())!.y;
  const petroBarHeight = (await petro.locator('header.bar').boundingBox())!.height;
  await answerAll(host, phones);
  for (const page of phones) await duelButton(page).waitFor();
  expect(await duelButton(olya).isEnabled()).toBe(true);
  expect((await petro.locator('header.bar').boundingBox())!.height).toBe(petroBarHeight);
  await shot(petro, 'duel7g-button-phone');

  // 2. Оголошення: Оля вибирає Петра; у Петра й Іри кнопка вимкнена, в Олі її немає; смуга всюди.
  await duelButton(olya).click();
  const dialog = olya.getByRole('dialog', { name: 'Кого викликати на дуель?' });
  await dialog.waitFor();
  expect(await dialog.getByRole('button').allTextContents()).toEqual(['Петро', 'Іра', 'Скасувати']);
  await shot(olya, 'duel7g-pick-phone');
  await expectNoSideScroll(olya, 'duel7g-pick-375');
  await dialog.getByRole('button', { name: 'Петро', ...exact }).click();
  const banner = '⚔ Дуель: Оля — Петро. Почнеться, щойно ведучий продовжить гру.';
  for (const page of [stage, ...phones]) await page.locator('.duel-banner').getByText(banner, exact).waitFor();
  await expect.poll(() => duelButton(petro).isDisabled()).toBe(true);
  await expect.poll(() => duelButton(ira).isDisabled()).toBe(true);
  expect(await duelButton(olya).count()).toBe(0);
  for (const [page, width] of [
    [olya, 375],
    [petro, 360],
    [ira, 390],
  ] as const)
    await expectNoSideScroll(page, `duel7g-banner-${width}`);
  // Смуга не закриває результату й запитання: сторінка тримає під нею запас.
  await petro.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  await expectApart(petro, '.duel-banner', ['section.result', 'h1.question'], 'declared banner 360');
  await shot(stage, 'duel7g-declared-stage');
  await host.getByText('Оголошено дуель: Оля — Петро', exact).waitFor();
  await host.getByRole('button', { name: 'Почати дуель', ...exact }).waitFor();
  expect(await host.getByRole('button', { name: 'Далі', ...exact }).count()).toBe(0);

  // 3. Категорія: вибирає Оля, Петро й сцена бачать, хто вибирає.
  await click(host, 'Почати дуель');
  await stageSay('Оля вибирає категорію');
  await stage.locator('.duel-stage-categories li', { hasText: 'Столиці · лишилося 3' }).waitFor();
  await stage.locator('.duel-stage-categories li', { hasText: 'Хімія · лишилося 3' }).waitFor();
  expect(await stage.locator('.duel-banner').count()).toBe(0);
  await petro.getByText('Оля вибирає категорію', exact).waitFor();
  expect(await petro.locator('.duel-categories').count()).toBe(0);
  await olya.getByRole('button', { name: 'Хімія · лишилося 3', ...exact }).waitFor();
  await shot(olya, 'duel7g-category-phone');
  await shot(stage, 'duel7g-category-stage');
  geometry.category = await duelGeometry(stage);
  rigged.push(1);
  await click(olya, 'Столиці · лишилося 3');

  // 4. Запитання 1: спробу Петра бачать лише він і ведучий; Оля відповідає правильно.
  await stage.locator('.duel-stage-question', { hasText: 'Столиця Франції?' }).waitFor();
  await stageScore('0 : 0');
  expect(await stage.locator('.duel-stage-side.is-challenger').textContent()).toBe('Оля');
  expect(await stage.locator('.duel-stage-side.is-opponent').textContent()).toBe('Петро');
  await stageSay('Запитання 1 з 2 · Столиці');
  await stage.locator('.duel-stage').getByRole('timer').waitFor();
  await olya.locator('.duel-score').getByText('Оля 0 : 0 Петро', exact).waitFor();
  await ira.locator('h1', { hasText: 'Столиця Франції?' }).waitFor();
  expect(await ira.locator('.duel-answer').count(), 'a watcher has no answer field').toBe(0);
  expect(await bodyText(stage)).not.toContain('Париж');
  expect(await bodyText(ira)).not.toContain('Париж');
  geometry.question = await duelGeometry(stage);
  const petroAnswerBox = (await petro.locator('.duel-answer').boundingBox())!;
  const petroTriesBox = (await petro.locator('.duel-tries').boundingBox())!;
  await duelAnswer(petro, 'Ліон');
  await petro.locator('.duel-tries').getByText('✗ Ліон', exact).waitFor();
  expect(await petro.locator('.duel-answer').boundingBox()).toEqual(petroAnswerBox);
  expect(await petro.locator('.duel-tries').boundingBox()).toEqual(petroTriesBox);
  await stageSay('Спроби: Оля 0 · Петро 1');
  await ira.getByText('Спроби: Оля 0 · Петро 1', exact).waitFor();
  await olya.getByText('Спроби: Оля 0 · Петро 1', exact).waitFor();
  await host.getByText('Прийнятні відповіді: Париж', exact).waitFor();
  await host.getByText('Спроби Петро: Ліон', exact).waitFor();
  await host.getByRole('button', { name: 'Пропустити запитання', ...exact }).waitFor();
  await host.getByRole('button', { name: 'Скасувати дуель', ...exact }).waitFor();
  await host.getByRole('button', { name: 'Пауза', ...exact }).first().waitFor();
  // Ведучий бачить таймер дуелі; «Завершити раунд» під час дуелі немає.
  await host.locator('.duel-host').getByRole('timer').waitFor();
  expect(await host.getByRole('button', { name: 'Завершити раунд', ...exact }).count()).toBe(0);
  await shot(host, 'duel7g-question-host');
  await nowhere(
    [
      [stage, stageFrames],
      [olya, olyaFrames],
      [ira, iraFrames],
    ],
    'Ліон',
    'a try of Петро',
  );
  await petro.reload();
  await field(petro, 'Ваша відповідь').waitFor();
  await petro.locator('.duel-tries').getByText('✗ Ліон', exact).waitFor();
  await expectNoSideScroll(petro, 'duel7g-question-360');
  await nowhere(
    [
      [stage, stageFrames],
      [olya, olyaFrames],
      [petro, petroFrames],
      [ira, iraFrames],
    ],
    'Париж',
    'the answer before it closed',
  );
  await duelAnswer(olya, 'париж');
  await stageSay('Правильна відповідь: Париж');
  await stageSay('Це запитання виграє Оля: «париж»');
  await stageScore('1 : 0');
  await olya.locator('.duel-score').getByText('Оля 1 : 0 Петро', exact).waitFor();
  geometry.answer = await duelGeometry(stage);
  await shot(stage, 'duel7g-answer-stage');

  // 5. Пропуск: «Столиця Італії?» знімається, приходить «Столиця Польщі?» тим самим номером.
  rigged.push(1);
  await click(host, 'Наступне запитання дуелі');
  await stage.locator('.duel-stage-question', { hasText: 'Столиця Італії?' }).waitFor();
  rigged.push(1);
  await click(host, 'Пропустити запитання');
  await stage.locator('.duel-stage-question', { hasText: 'Столиця Польщі?' }).waitFor();
  await stageSay('Запитання 2 з 2 · Столиці');
  await duelAnswer(petro, 'Варшава');
  await stageScore('1 : 1');
  await host.getByRole('button', { name: 'Підсумок дуелі', ...exact }).waitFor();

  // 6. Нічия: бали ті самі; гра йде далі з q3, смуги немає.
  await click(host, 'Підсумок дуелі');
  await stageSay('Нічия — бали не змінюються');
  for (const page of phones) await page.getByText('Нічия — бали не змінюються', exact).waitFor();
  geometry.result = await duelGeometry(stage);
  await shot(stage, 'duel7g-tie-stage');
  expect(await scores()).toEqual({ Оля: '200', Петро: '200', Іра: '200' });
  await click(host, 'Продовжити гру');
  await stage.locator('h1', { hasText: 'Запитання 3:' }).waitFor();
  await petro.locator('h1', { hasText: 'Запитання 3:' }).waitFor();
  for (const page of [stage, ...phones]) expect(await page.locator('.duel-banner').count()).toBe(0);
  await duelButton(petro).waitFor();
  expect((await petro.locator('h1.question').first().boundingBox())!.y, 'the header button moved the question').toBe(petroQuestionY);
  expect((await petro.locator('header.bar').boundingBox())!.height).toBe(petroBarHeight);
  // Сцена дуелі на 1600 × 900: без прокрутки, імена й рахунок між етапами на місці.
  console.log(`duel stage 1600×900: ${JSON.stringify(geometry)}`);
  for (const [name, at] of Object.entries(geometry)) {
    expect(at.wide && at.scrollHeight <= at.innerHeight, `stage duel ${name} overflows`).toBe(true);
    expect([at.challenger, at.opponent, at.score], `stage duel ${name} moved the names or the score`).toEqual([
      geometry.category!.challenger,
      geometry.category!.opponent,
      geometry.category!.score,
    ]);
  }
  await answerAll(host, phones);
  expect(await scores()).toEqual({ Оля: '300', Петро: '300', Іра: '300' });

  // 7. Ставка: Іра викликає Олю; ведучий вибирає категорію за Іру; Іра виграє 2 : 0.
  expect(await duelButton(olya).count(), 'Оля already used her duel').toBe(0);
  await duelButton(ira).click();
  await ira.getByRole('dialog').getByRole('button', { name: 'Оля', ...exact }).click();
  await ira.locator('.duel-banner').getByText('⚔ Дуель: Іра — Оля. Почнеться, щойно ведучий продовжить гру.', exact).waitFor();
  await expect.poll(() => duelButton(petro).isDisabled()).toBe(true);
  await click(host, 'Почати дуель');
  await stageSay('Іра вибирає категорію');
  const hostPanel = host.locator('.duel-host');
  await hostPanel.getByText('Категорію вибирає Іра. Якщо треба, виберіть за гравця:', exact).waitFor();
  await shot(host, 'duel7g-host-pick');
  rigged.push(1);
  await hostPanel.getByRole('button', { name: 'Хімія · лишилося 3', ...exact }).click();
  await stage.locator('.duel-stage-question', { hasText: 'Символ Fe — це…' }).waitFor();
  await duelAnswer(ira, 'Залізо');
  await stageScore('1 : 0');
  rigged.push(1);
  await click(host, 'Наступне запитання дуелі');
  await stage.locator('.duel-stage-question', { hasText: 'Символ Au — це…' }).waitFor();
  await duelAnswer(ira, 'Аурум');
  await stageScore('2 : 0');
  await stage.locator('.duel-stage-side.is-challenger', { hasText: 'Іра' }).waitFor();
  await click(host, 'Підсумок дуелі');
  await stageSay('Перемога в дуелі: Іра!');
  await stageSay('Іра +300 · Оля −300');
  await olya.getByText('Іра +300 · Оля −300', exact).waitFor();
  await shot(stage, 'duel7g-result-stage');
  await shot(olya, 'duel7g-result-phone');
  await expect.poll(scores).toEqual({ Оля: '0', Петро: '300', Іра: '600' });
  expect(await olya.locator('header.bar .score').textContent()).toBe('0');
  await click(host, 'Продовжити гру');
  await host.getByRole('button', { name: 'Наступний раунд', ...exact }).waitFor();

  // 8. Скасування: Петро викликає Іру на підсумках раунду; ведучий скасовує — ті самі підсумки, бали ті самі.
  await duelButton(petro).click();
  await petro.getByRole('dialog').getByRole('button', { name: 'Іра', ...exact }).click();
  await host.getByText('Оголошено дуель: Петро — Іра', exact).waitFor();
  await click(host, 'Почати дуель');
  await stageSay('Петро вибирає категорію');
  await hostPanel.getByRole('button', { name: 'Скасувати дуель', ...exact }).click();
  await host.getByRole('button', { name: 'Наступний раунд', ...exact }).waitFor();
  expect(await host.locator('.duel-host').count()).toBe(0);
  expect(await stage.locator('.duel-stage').count()).toBe(0);
  expect(await scores()).toEqual({ Оля: '0', Петро: '300', Іра: '600' });
  expect(await duelButton(petro).count()).toBe(0);
  await click(host, 'Наступний раунд');
  await stage.locator('h1', { hasText: 'Другий' }).waitFor();
  await ira.locator('h1', { hasText: 'Другий' }).waitFor();
  for (const page of phones) expect(await duelButton(page).count(), 'everyone used the duel').toBe(0);

  // 9. Історія: та сама таблиця й рядок дуелі в раунді 1, без «Бали від ведучого».
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Дуелі/ }).click();
  const rows = host.locator('.standings li');
  await rows.first().waitFor();
  const table: [string, string][] = [];
  for (let i = 0; i < (await rows.count()); i++) {
    table.push([(await rows.nth(i).locator('.name').textContent())!, (await rows.nth(i).locator('.score').textContent())!]);
  }
  expect(table).toEqual([
    ['Іра', '600'],
    ['Петро', '300'],
    ['Оля', '0'],
  ]);
  const roundOne = host.locator('.round-group', { has: host.locator('.round-title', { hasText: 'Розминка' }) });
  expect(await roundOne.locator('.history-duel').allTextContents()).toEqual(['Дуель: Іра +300, Оля −300']);
  expect(await host.locator('.history-duel').count()).toBe(1);
  expect(await host.getByText(/Бали від ведучого/).count()).toBe(0);
  await shot(host, 'duel7g-history-host');
  await expectNoSideScroll(olya, 'duel7g-phone-375');

  expect(problems).toEqual([]);
}

it('part 7g: duel layout — a debuff banner, the duel banner and a points notice stacked on 375 px, a long nickname keeps the header, a long duel question on 720p and 900p stages', async () => {
  try {
    await duelLayout();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Нік на 20 літер — найдовший дозволений. */
const LONG_NICK = 'Олександра-Марійка К';
/** Запитання дуелі на ~250 символів: найгірший випадок для сцени. */
const LONG_DUEL_1 =
  'Як називається явище, коли в довгому запитанні дуелі текст займає кілька рядків на великому екрані, а ведучий хоче, щоб імена суперників, рахунок, таймер і кількість спроб лишалися на своїх місцях між вибором категорії, запитанням, розкриттям і підсумком?';
const LONG_DUEL_2 =
  'Яке слово відповідає на друге довге запитання дуелі, у якому так само багато слів, ком і пояснень, щоб перевірити, що сцена на 1280 × 720 і на 1600 × 900 не прокручується, не обрізає таймер і не зсуває імена дуелянтів під час розкриття правильної відповіді?';

async function duelLayout() {
  expect(LONG_DUEL_1.length).toBeGreaterThanOrEqual(240);
  expect(LONG_DUEL_2.length).toBeGreaterThanOrEqual(240);
  const host = await open('host7gl', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host7gl@example.com');
  const q = (n: number) => ({ ...withPoints(withId(single, `q${n}`), 100), text: `Запитання ${n}: столиця України?`, timeLimit: 60 });
  const rounds = [
    classicRound('r1', [q(1), q(2), q(3), q(4)], { title: 'Розминка', speedBonus: false }),
    classicRound('r2', [q(5)], { title: 'Другий', speedBonus: false }),
  ];
  const duels = {
    categories: [
      {
        id: 'dl1',
        title: 'Довгі запитання',
        questions: [
          { id: 'l1', text: LONG_DUEL_1, accepted: ['Так'] },
          { id: 'l2', text: LONG_DUEL_2, accepted: ['Ні'] },
          { id: 'l3', text: 'Коротке?', accepted: ['Так'] },
        ],
      },
    ],
    questionsPerDuel: 2,
    timeLimit: 60,
    stake: 100,
  };
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end' }), title: 'Довгі дуелі', duels };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage900 = await open('stage7gl-900', 1600, 900);
  const stage720 = await open('stage7gl-720', 1280, 720);
  for (const stage of [stage900, stage720]) {
    await stage.goto(stageUrl!);
    await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  }
  const long = await open('long7gl', 375, 812);
  const olya = await open('olya7gl', 375, 812);
  const petro = await open('petro7gl', 360, 740);
  await join(long, code, LONG_NICK, false);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await stage900.getByText('Петро').waitFor();

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const tool = async (nickname: string, kind: 'Бали' | 'Дебаф') => {
    const button = row(nickname).getByRole('button', { name: kind, ...exact });
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await row(nickname).locator('.player-tools').waitFor();
  };
  /** Запитання без відповідей: ведучий закриває й відкриває відповідь. */
  const closeAndReveal = async () => {
    await click(host, 'Закрити запитання');
    await click(host, 'Показати відповідь');
    await olya.locator('section.result').first().waitFor();
  };

  // 1. Довгий нік у шапці: поява кнопки «⚔ Дуель» не змінює висоти шапки.
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  await long.locator('h1', { hasText: 'Запитання 1:' }).waitFor();
  const bar = long.locator('header.bar');
  const barBefore = (await bar.boundingBox())!;
  expect(await duelButton(long).count()).toBe(0);
  await closeAndReveal();
  await click(host, 'Далі');
  await long.locator('h1', { hasText: 'Запитання 2:' }).waitFor();
  await closeAndReveal();
  await duelButton(long).waitFor();
  const barAfter = (await bar.boundingBox())!;
  expect(barAfter.height, 'the duel button made the header taller').toBe(barBefore.height);
  // Кнопка — на рядку шапки, праворуч від ніка, і не налазить на запитання.
  const buttonBox = (await duelButton(long).boundingBox())!;
  const nickBox = (await bar.locator('span').first().boundingBox())!;
  expect(buttonBox.y < nickBox.y + nickBox.height && nickBox.y < buttonBox.y + buttonBox.height, 'the button is on the nickname line').toBe(true);
  expect(nickBox.x + nickBox.width <= buttonBox.x + 0.5, 'the nickname runs under the button').toBe(true);
  expect(buttonBox.y + buttonBox.height <= (await long.locator('h1.question').first().boundingBox())!.y + 0.5, 'the button covers the question').toBe(true);
  await expectNoSideScroll(long, 'duel7g-long-name-375');

  // 2. Туман для Олі чекає наступного запитання; Петро відкриває діалог заздалегідь; панель балів Олі відкрита.
  await tool('Оля', 'Дебаф');
  await row('Оля').locator('.player-tools').getByRole('button', { name: /Туман/ }).click();
  await row('Оля').locator('.debuff-tag').waitFor();
  await tool('Оля', 'Бали');
  await duelButton(petro).click();
  const petroDialog = petro.getByRole('dialog');
  await petroDialog.waitFor();

  // 3. Запитання 3: банер дебафу (3 с), смуга дуелі й сповіщення про бали в Олі одночасно — стосом, без накладань.
  await click(host, 'Далі');
  await olya.locator('.debuff-banner').waitFor();
  await petroDialog.getByRole('button', { name: LONG_NICK, ...exact }).click();
  await row('Оля').getByRole('button', { name: '+100', ...exact }).click();
  await olya.locator('.duel-banner').waitFor();
  await olya.locator('.live-notice').waitFor();
  await olya.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  const stack = (await olya.evaluate(`(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (element === null) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const items = [...document.querySelectorAll('.choice, .debuff-content button, .debuff-content h1')];
    const content = items.length === 0 ? null : Math.max(...items.map((element) => element.getBoundingClientRect().bottom));
    return {
      notice: box('.live-notice'),
      duel: box('.duel-banner'),
      debuff: box('.debuff-banner'),
      content,
      wide: document.documentElement.scrollWidth <= innerWidth,
      width: innerWidth,
    };
  })()`)) as {
    notice: Box | null;
    duel: Box | null;
    debuff: Box | null;
    content: number | null;
    wide: boolean;
    width: number;
  };
  await shot(olya, 'duel7g-banners-375');
  console.log(`phone stack 375×812: ${JSON.stringify(stack)}`);
  expect(stack.debuff, 'the debuff banner was gone before the check (3 s)').not.toBeNull();
  expect(stack.duel).not.toBeNull();
  expect(stack.notice).not.toBeNull();
  const { notice, duel, debuff } = stack as { notice: Box; duel: Box; debuff: Box };
  expect(stack.wide, 'banners: horizontal scroll').toBe(true);
  for (const [name, box] of Object.entries({ notice, duel, debuff })) {
    expect(box.x >= 0 && box.x + box.width <= stack.width, `${name} leaves the screen`).toBe(true);
  }
  expect(overlaps(notice, duel) || overlaps(duel, debuff) || overlaps(notice, debuff), 'the banners overlap').toBe(false);
  expect(notice.y + notice.height <= duel.y + 0.5, 'the notice is above the duel banner').toBe(true);
  expect(duel.y + duel.height <= debuff.y + 0.5, 'the duel banner is above the debuff banner').toBe(true);
  expect(stack.content! <= duel.y + 0.5, 'the page padding does not clear the banners').toBe(true);
  await expectApart(long, '.duel-banner', ['h1.question', '.choice'], 'long-name duel banner 375');
  await expectNoSideScroll(long, 'duel7g-long-banner-375');

  // 4. Дуель Петро — довгий нік з довгими запитаннями: обидві сцени на кожному етапі.
  const geometry: Record<string, Record<string, DuelGeometry>> = { 900: {}, 720: {} };
  const measure = async (name: string) => {
    geometry[900]![name] = await duelGeometry(stage900);
    geometry[720]![name] = await duelGeometry(stage720);
  };
  await closeAndReveal();
  await click(host, 'Почати дуель');
  for (const stage of [stage900, stage720]) await stage.locator('.duel-stage').getByText('Петро вибирає категорію', exact).waitFor();
  await measure('category');
  await shot(stage720, 'duel7g-long-stage-720-category');
  rigged.push(1);
  await click(petro, 'Довгі запитання · лишилося 3');
  for (const stage of [stage900, stage720]) await stage.locator('.duel-stage-question', { hasText: LONG_DUEL_1 }).waitFor();
  await measure('question');
  await shot(stage720, 'duel7g-long-stage-720-question');
  await shot(stage900, 'duel7g-long-stage-900-question');
  await expectNoSideScroll(long, 'duel7g-long-question-375');
  await duelAnswer(long, 'Так');
  for (const stage of [stage900, stage720]) await stage.locator('.duel-stage-score', { hasText: '0 : 1' }).waitFor();
  await measure('answer');
  await shot(stage720, 'duel7g-long-stage-720-answer');
  await shot(stage900, 'duel7g-long-stage-900-answer');
  rigged.push(1);
  await click(host, 'Наступне запитання дуелі');
  for (const stage of [stage900, stage720]) await stage.locator('.duel-stage-question', { hasText: LONG_DUEL_2 }).waitFor();
  await measure('question2');
  await duelAnswer(long, 'Ні');
  for (const stage of [stage900, stage720]) await stage.locator('.duel-stage-score', { hasText: '0 : 2' }).waitFor();
  await click(host, 'Підсумок дуелі');
  for (const stage of [stage900, stage720]) await stage.locator('.duel-stage').getByText(`Перемога в дуелі: ${LONG_NICK}!`, exact).waitFor();
  await measure('result');
  await shot(stage720, 'duel7g-long-stage-720-result');
  await shot(stage900, 'duel7g-long-stage-900-result');
  console.log(`long duel stage: ${JSON.stringify(geometry)}`);
  for (const size of ['900', '720']) {
    for (const [name, at] of Object.entries(geometry[size]!)) {
      expect(at.wide, `stage ${size} duel ${name}: horizontal scroll`).toBe(true);
      expect(at.scrollHeight, `stage ${size} duel ${name}: vertical scroll`).toBeLessThanOrEqual(at.innerHeight);
    }
  }

  await click(host, 'Продовжити гру');
  await stage900.locator('h1', { hasText: 'Запитання 4:' }).waitFor();
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();
  expect(problems).toEqual([]);
}

it('part 8a: buffs and debuffs in the editor, a buff row on the phone, 50/50, double points, a second try with a choice, extra time with «Не чекати», a shield, double points on a x2 cell, icons and totals in the history', async () => {
  try {
    await buffsGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

const buffButton = (page: Page, name: string) => page.locator('.buff-row').getByRole('button', { name, ...exact });

/** Баф двома дотиками: перший просить підтвердження, другий бере; чекає, поки кнопка стане активною. */
async function takeBuff(page: Page, name: string) {
  await buffButton(page, name).click();
  await page.locator('.buff-why').getByText(`Ще раз — узяти «${name}»`, exact).waitFor();
  await buffButton(page, name).click();
  await expect.poll(() => buffButton(page, name).getAttribute('class')).toContain('is-active');
}

/** Дотик неактивної кнопки бафу: рядок пояснень пише причину. */
async function tapBuff(page: Page, name: string, why: string) {
  // aria-disabled: Playwright вважає кнопку вимкненою, але дотик пояснює причину.
  await buffButton(page, name).click({ force: true });
  await page.locator('.buff-why').getByText(why, exact).waitFor();
}

/** Дотик варіанта відповіді. */
const pickOption = (page: Page, text: string) => page.getByRole('button', { name: new RegExp(text) }).click();

/** Число в полі відповіді й «Відповісти». */
async function numericAnswer(page: Page, value: string) {
  await field(page, 'Ваша відповідь').fill(value);
  await click(page, 'Відповісти');
}

/** Верх і висота елемента, округлені до пікселя. */
const boxOf = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { y: Math.round(box.y), height: Math.round(box.height) };
};

async function buffsGame() {
  const host = await open('host8a', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host8a@example.com');

  const choice = (id: string, text: string, timeLimit: number, options: string[]) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit,
    points: 100,
    options: options.map((option, at) => ({ id: `${id}o${at}`, text: option })),
    correctId: `${id}o0`,
  });
  const base8a = { imageUrl: null, video: null, points: 100 };
  const q1 = choice('q1', 'Найбільше озеро України?', 20, ['Ялпуг', 'Світязь', 'Синевир', 'Кугурлуй']);
  const q2 = { ...base8a, id: 'q2', type: 'numeric' as const, text: 'Рік проголошення незалежності України?', timeLimit: 30, correct: 1991, tolerance: 10 };
  const q3 = choice('q3', 'Столиця Буковини?', 5, ['Чернівці', 'Ужгород', 'Луцьк']);
  const q4 = { ...base8a, id: 'q4', type: 'boolean' as const, text: 'Дніпро впадає в Чорне море?', timeLimit: 5, correct: true };
  const cellQ = (category: string, price: number) => ({
    ...withPoints(withId(single, `b-${category}-${price}`), price),
    text: `${category} ${price}: столиця України?`,
  });
  const rounds = [
    classicRound('r1', [q1, q2, q3, q4], { title: 'Розминка', speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' } }),
    boardRound(
      'r2',
      ['Міста', 'Річки', 'Гори'].map((title, column) => ({
        title,
        cells: [100, 200, 300].map((price) =>
          column === 0 && price === 100 ? { question: cellQ(title, price), mark: 'x2' as const } : cellQ(title, price),
        ),
      })),
      { title: 'Поле', answerMode: 'phone', check: 'auto' },
    ),
  ];
  const data = {
    ...makeRoundsQuiz(rounds, { leaderboard: 'end', debuffs: ['fog', 'shake'], buffs: ['fifty', 'double', 'retry', 'time', 'shield'] }),
    title: 'Бафи',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Редактор: розділ «Бафи й дебафи» з чинними значеннями; «Жодного» / «Усі» / знову два дебафи.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Бафи' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('details.powers > summary').click();
  const debuffGroup = host.locator('fieldset.powers-group').nth(0);
  const buffGroup = host.locator('fieldset.powers-group').nth(1);
  const box = (group: typeof debuffGroup, name: string) => group.locator('label.powers-item', { hasText: name }).locator('input');
  const debuffNames = ['Тремтіння екрана', 'Туман', 'Заморозка', 'Дзеркало', 'Гості на екрані', 'Брудний екран'];
  const checkedDebuffs = async () => {
    const on: string[] = [];
    for (const name of debuffNames) if (await box(debuffGroup, name).isChecked()) on.push(name);
    return on;
  };
  expect(await checkedDebuffs()).toEqual(['Тремтіння екрана', 'Туман']);
  for (const name of ['50/50', 'Подвійні бали', 'Друга спроба', 'Додатковий час', 'Щит']) expect(await box(buffGroup, name).isChecked(), name).toBe(true);
  // Усі вісім бафів можна вибрати: жодного «скоро».
  for (const name of ['Запитання в залі', 'Підказка ведучого', 'Заміна запитання']) {
    expect(await box(buffGroup, name).isDisabled(), name).toBe(false);
    expect(await box(buffGroup, name).isChecked(), name).toBe(false);
  }
  expect(await buffGroup.getByText('скоро').count()).toBe(0);
  await shot(host, 'buff8a-editor');
  await debuffGroup.getByRole('button', { name: 'Жодного', ...exact }).click();
  expect(await checkedDebuffs()).toEqual([]);
  await debuffGroup.getByRole('button', { name: 'Усі', ...exact }).click();
  expect(await checkedDebuffs()).toEqual(debuffNames);
  for (const name of ['Заморозка', 'Дзеркало', 'Гості на екрані', 'Брудний екран']) await box(debuffGroup, name).uncheck();
  expect(await checkedDebuffs()).toEqual(['Тремтіння екрана', 'Туман']);
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'buff8a-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // Гра: сцена 1600 × 900, Оля 375, Петро 360, Іра 390.
  await host.locator('.quiz-list li', { hasText: 'Бафи' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage8a', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya8a', 375, 812);
  const petro = await open('petro8a', 360, 740);
  const ira = await open('ira8a', 390, 844);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const hostScore = async (nickname: string) => (await row(nickname).locator('.score').textContent())!;
  const scores = async () => ({ Оля: await hostScore('Оля'), Петро: await hostScore('Петро'), Іра: await hostScore('Іра') });
  const response = (nickname: string) => host.locator('.rows li', { has: host.locator('.given') }).filter({ hasText: nickname });
  const reveal = async () => {
    await click(host, 'Показати відповідь');
    for (const page of phones) await page.locator('section.result').first().waitFor();
  };

  // Пульт: «Дебаф» біля Олі пропонує лише «Тремтіння екрана» і «Туман».
  await click(host, 'Почати гру');
  await row('Оля').getByRole('button', { name: 'Дебаф', ...exact }).click();
  const picks = row('Оля').locator('.player-tools .debuff-picks button');
  await picks.first().waitFor();
  const pickTexts = await picks.allTextContents();
  expect(pickTexts).toHaveLength(2);
  expect(pickTexts[0]).toMatch(/Тремтіння екрана$/);
  expect(pickTexts[1]).toMatch(/Туман$/);
  await shot(host, 'buff8a-host-debuffs');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'buff8a-host-debuffs-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await row('Оля').getByRole('button', { name: 'Дебаф', ...exact }).click();
  await row('Оля').locator('.player-tools').waitFor({ state: 'detached' });

  // 1. q1: ряд із п'яти бафів у кожного; 50/50 Олі прибирає «Світязь» і «Синевир» на місці.
  await click(host, 'Почати раунд');
  for (const page of phones) {
    await page.locator('h1', { hasText: 'Найбільше озеро України?' }).waitFor();
    expect(await page.locator('.buff-row .buff-btn').count()).toBe(5);
  }
  await expectNoSideScroll(olya, 'buff8a-row-375');
  const petroQuestion = await boxOf(petro, 'h1.question');
  const petroRow = await boxOf(petro, '.buff-row');
  const olyaChoices = await yOf(olya);
  rigged.push(1, 1);
  await takeBuff(olya, '50/50');
  for (const text of ['Світязь', 'Синевир']) await olya.locator('.choice.is-removed', { hasText: text }).waitFor();
  for (const text of ['Ялпуг', 'Кугурлуй']) expect(await olya.getByRole('button', { name: new RegExp(text) }).isEnabled(), text).toBe(true);
  expect(await olya.locator('.choice.is-removed').count()).toBe(2);
  expect(await yOf(olya), '50/50 moved the options').toEqual(olyaChoices);
  await stage.locator('.stage-buffs li').getByText('½ Оля', exact).waitFor();
  await stage.locator('.live-notice.is-buff').getByText('Оля: 50/50', exact).waitFor();
  await petro.locator('.live-notice.is-buff').getByText('Оля: 50/50', exact).waitFor();
  expect(await boxOf(petro, 'h1.question'), 'a buff of Оля moved the question of Петро').toEqual(petroQuestion);
  expect(await boxOf(petro, '.buff-row'), 'a buff of Оля moved the buff row of Петро').toEqual(petroRow);
  expect(await bodyText(stage)).not.toContain('прибрано');
  expect(await bodyText(petro)).not.toContain('прибрано');
  await expectNoSideScroll(olya, 'buff8a-fifty-375');
  await shot(stage, 'buff8a-fifty-stage');
  await shot(petro, 'buff8a-notice-phone');
  await takeBuff(petro, 'Подвійні бали');
  await takeBuff(ira, 'Щит');
  await stage.locator('.stage-buffs li').getByText('🛡 Іра', exact).waitFor();
  await pickOption(olya, 'Ялпуг');
  await pickOption(petro, 'Ялпуг');
  await pickOption(ira, 'Синевир');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await reveal();
  await response('Петро').locator('.buff-tag').getByText('×2', exact).waitFor();
  await response('Іра').locator('.buff-tag').getByText('🛡', exact).waitFor();
  await response('Оля').locator('.buff-tag').getByText('½', exact).waitFor();
  await shot(host, 'buff8a-reveal-host');
  await expect.poll(scores).toEqual({ Оля: '100', Петро: '200', Іра: '0' });

  // 2. q2: 50/50 Олі вже використано; друга спроба з вибором (Оля) і після помилки (Петро).
  await click(host, 'Далі');
  await olya.locator('h1', { hasText: 'Рік проголошення' }).waitFor();
  expect(await buffButton(olya, '50/50').getAttribute('class')).toContain('is-used');
  await tapBuff(olya, '50/50', 'Уже використано.');
  await takeBuff(olya, 'Друга спроба');
  await numericAnswer(olya, '1996');
  await olya.getByText(/^Частково правильно: \+75\. Залишити чи ще спроба\?$/).waitFor();
  await shot(olya, 'buff8a-retry-choice');
  await click(olya, 'Ще спроба');
  await numericAnswer(olya, '1991');
  await olya.getByText('Відповідь прийнято', exact).waitFor();
  const petroBar = await boxOf(petro, '.buff-bar');
  await takeBuff(petro, 'Друга спроба');
  await numericAnswer(petro, '2005');
  await petro.locator('.buff-why').getByText('Неправильно, ще одна спроба', exact).waitFor();
  expect(await boxOf(petro, '.buff-bar'), 'the retry prompt changed the buff row').toEqual(petroBar);
  await shot(petro, 'buff8a-retry-again');
  for (const page of [stage, ira]) {
    const html = await page.content();
    expect(html, 'a first try leaked').not.toContain('1996');
    expect(html, 'a first try leaked').not.toContain('2005');
  }
  await numericAnswer(petro, '1991');
  await numericAnswer(ira, '1991');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await reveal();
  await expect.poll(scores).toEqual({ Оля: '200', Петро: '300', Іра: '100' });
  for (const page of [stage, ira]) {
    const text = await bodyText(page);
    expect(text).not.toContain('1996');
    expect(text).not.toContain('2005');
  }

  // 3. q3 (5 с): Іра бере додатковий час; після спільних 5 с усі чекають на неї, вона відповідає сама.
  await click(host, 'Далі');
  await ira.locator('h1', { hasText: 'Столиця Буковини?' }).waitFor();
  await takeBuff(ira, 'Додатковий час');
  await ira.locator('.buff-why').getByText('+30 с — ваш час', exact).waitFor();
  await pickOption(olya, 'Чернівці');
  await pickOption(petro, 'Чернівці');
  const stageWait = stage.locator('.buff-wait');
  await stageWait.waitFor({ timeout: 8000 });
  expect(await stageWait.textContent()).toMatch(/^Чекаємо: Іра · 0:\d\d$/);
  await host.getByRole('button', { name: 'Не чекати', ...exact }).waitFor();
  await petro.locator('.question-head .buff-wait', { hasText: /^Чекаємо: Іра · 0:\d\d$/ }).waitFor();
  await shot(stage, 'buff8a-overtime-stage');
  await shot(petro, 'buff8a-overtime-phone');
  await shot(ira, 'buff8a-overtime-mine');
  await shot(host, 'buff8a-overtime-host');
  await host.setViewportSize({ width: 375, height: 812 });
  await host.getByRole('button', { name: 'Не чекати', ...exact }).waitFor();
  await expectNoSideScroll(host, 'buff8a-overtime-host-375');
  // На 375 px імена в рядках пульта не рвуться посеред слова, а відлік «Чекаємо» видно повністю.
  const brokenNames = await host.locator('.rows .name').evaluateAll((names) =>
    names
      .filter((name) => !/\s/.test(name.textContent ?? '') && name.getClientRects().length > 0)
      .filter((name) => {
        const range = name.ownerDocument.createRange();
        range.selectNodeContents(name);
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1;
      })
      .map((name) => name.textContent),
  );
  expect(brokenNames).toEqual([]);
  const timeShown = async (page: Page) =>
    page.locator('.buff-wait').evaluate((line) => {
      const time = line.querySelector('.buff-wait-time')!.getBoundingClientRect();
      return time.width > 0 && time.right <= line.getBoundingClientRect().right + 0.5;
    });
  expect(await timeShown(host)).toBe(true);
  expect(await timeShown(petro)).toBe(true); // телефон Петра — 360 px
  expect(await timeShown(stage)).toBe(true);
  await host.setViewportSize({ width: 1280, height: 900 });
  await stage.waitForTimeout(1500);
  await pickOption(ira, 'Чернівці');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await reveal();
  await expect.poll(scores).toEqual({ Оля: '300', Петро: '400', Іра: '200' });

  // 4. q4 (5 с): 50/50 не діє на «так / ні»; Петро бере час, ведучий не чекає.
  await click(host, 'Далі');
  await ira.locator('h1', { hasText: 'Дніпро впадає' }).waitFor();
  const iraBar = await boxOf(ira, '.buff-bar');
  await tapBuff(ira, '50/50', '50/50 діє лише на запитаннях з варіантами.');
  expect(await boxOf(ira, '.buff-bar'), 'the reason changed the buff row').toEqual(iraBar);
  await takeBuff(petro, 'Додатковий час');
  await click(olya, 'Так');
  await click(ira, 'Так');
  await host.getByRole('button', { name: 'Не чекати', ...exact }).waitFor({ timeout: 8000 });
  await click(host, 'Не чекати');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await shot(host, 'buff8a-nowait-host');
  await reveal();
  await expect.poll(scores).toEqual({ Оля: '400', Петро: '400', Іра: '300' });

  // 5. Поле: Оля вибирає «×2» за 100; щит тут не потрібен; подвійні бали на ×2 — +400.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await olya.getByRole('button', { name: 'Міста, 100', ...exact }).click();
  for (const page of phones) await page.locator('h1', { hasText: 'Міста 100' }).waitFor();
  await tapBuff(olya, 'Щит', 'Щит не потрібен: у цьому раунді помилка не коштує балів.');
  expect(await petro.locator('.buff-row').count(), 'not the chooser: no buff row').toBe(0);
  expect(await ira.locator('.buff-row').count(), 'not the chooser: no buff row').toBe(0);
  await takeBuff(olya, 'Подвійні бали');
  await pickOption(olya, 'Київ');
  await click(host, 'Прийняти');
  await olya.getByText('Правильно!').waitFor();
  await shot(olya, 'buff8a-board-phone');
  await expect.poll(scores).toEqual({ Оля: '800', Петро: '400', Іра: '300' });

  // 6. Історія: та сама таблиця, значки бафів біля відповідей.
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();
  await expectNoSideScroll(olya, 'buff8a-phone-375');
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Бафи/ }).click();
  const standings = host.locator('.standings li');
  await standings.first().waitFor();
  const table: [string, string][] = [];
  for (let i = 0; i < (await standings.count()); i++) {
    table.push([(await standings.nth(i).locator('.name').textContent())!, (await standings.nth(i).locator('.score').textContent())!]);
  }
  expect(table).toEqual([
    ['Оля', '800'],
    ['Петро', '400'],
    ['Іра', '300'],
  ]);
  await host.evaluate("document.querySelectorAll('details.responses').forEach((d) => { d.open = true; })");
  const line = (question: string, nickname: string) =>
    host
      .locator('.rows.stacked > li', { hasText: question })
      .locator('details.responses li', { has: host.locator('.responses-name', { hasText: nickname }) });
  const badgeOf = async (question: string, nickname: string) => {
    const tags = await line(question, nickname).locator('.buff-tag').allTextContents();
    return tags.length === 0 ? null : tags.join(' ');
  };
  expect(await badgeOf('Найбільше озеро', 'Оля')).toBe('½');
  expect(await badgeOf('Найбільше озеро', 'Петро')).toBe('×2');
  expect(await badgeOf('Найбільше озеро', 'Іра')).toBe('🛡');
  expect(await badgeOf('Рік проголошення', 'Оля')).toBe('↻');
  expect(await badgeOf('Рік проголошення', 'Петро')).toBe('↻');
  expect(await badgeOf('Рік проголошення', 'Іра')).toBe(null);
  for (const nickname of ['Оля', 'Петро']) expect(await line('Рік проголошення', nickname).locator('.responses-answer').textContent()).toBe('1991');
  expect(await badgeOf('Столиця Буковини', 'Іра')).toBe('⏱');
  expect(await badgeOf('Міста 100', 'Оля')).toBe('×2');
  await shot(host, 'buff8a-history-host');

  expect(problems).toEqual([]);
}

it('part 8b: hints and spares in the editor, a written hint, the audience vote with percentages and guesses, a host hint and «Підказав уголос», a spare question on one phone and on the board stage, «Не чекати» for a swap, spares in the history', async () => {
  try {
    await sparesGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Текст у полі відповіді й «Відповісти». */
const textAnswer = numericAnswer;

/** Голос в аркуші «… питає зал»: дотик варіанта або поле й «Голосувати»; чекає «Голос прийнято». */
async function vote(page: Page, text: string) {
  const sheet = page.locator('.vote-sheet');
  const input = sheet.getByLabel('Ваша відповідь', exact);
  if ((await input.count()) > 0) {
    await input.fill(text);
    await sheet.getByRole('button', { name: 'Голосувати', ...exact }).click();
  } else {
    await sheet.getByRole('button', { name: new RegExp(text) }).click();
  }
  await sheet.getByText('Голос прийнято', exact).waitFor();
}

async function sparesGame() {
  const host = await open('host8b', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host8b@example.com');

  const choice = (id: string, text: string, timeLimit: number, options: string[]) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit,
    points: 100,
    options: options.map((option, at) => ({ id: `${id}o${at}`, text: option })),
    correctId: `${id}o0`,
  });
  const base8b = { imageUrl: null, video: null, points: 100 };
  const q1 = { ...choice('q1', 'Найдовша річка України?', 30, ['Дніпро', 'Дністер', 'Південний Буг', 'Десна']), hint: 'Тече через Київ' };
  const q2 = { ...base8b, id: 'q2', type: 'numeric' as const, text: 'Скільки областей в Україні?', timeLimit: 30, correct: 24, tolerance: 0 };
  // 60 с: на цьому запитанні — підказка від ведучого, заміна й два голосування, а кадри з E2E_SHOTS забирають час.
  const q3 = { ...base8b, id: 'q3', type: 'text' as const, text: 'Столиця Галичини?', timeLimit: 60, accepted: ['Львів'] };
  // 8 с замість 5: підказку «уголос» і заміну треба встигнути до спільного кінця.
  const q4 = choice('q4', 'Найвища гора України?', 8, ['Говерла', 'Піп Іван', 'Петрос']);
  const cellQ = (category: string, price: number) => ({
    ...withPoints(withId(single, `b-${category}-${price}`), price),
    text: `${category} ${price}: столиця України?`,
  });
  const rounds = [
    classicRound('r1', [q1, q2, q3, q4], { title: 'Розминка', speedBonus: false }),
    boardRound(
      'r2',
      ['Міста', 'Річки', 'Гори'].map((title) => ({ title, cells: [100, 200, 300].map((price) => cellQ(title, price)) })),
      { title: 'Поле', answerMode: 'phone', check: 'auto' },
    ),
  ];
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end', buffs: ['audience', 'hint'] }), title: 'Бафи 2' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Редактор: підказка q1; заміна без пулу не зберігається; три запасні без часу, балів і підказки.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Бафи 2' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('label.hint-field', { hasText: "Підказка (необов'язково)" }).first().waitFor();
  expect(await host.locator('.hint-field textarea').first().inputValue()).toBe('Тече через Київ');
  await shot(host, 'buff8b-editor-hint');
  await host.locator('details.powers > summary').click();
  const buffGroup = host.locator('fieldset.powers-group').nth(1);
  expect(await buffGroup.getByText('скоро').count()).toBe(0);
  for (const item of await buffGroup.locator('label.powers-item input').all()) expect(await item.isDisabled()).toBe(false);
  await buffGroup.locator('label.powers-item', { hasText: 'Заміна запитання' }).locator('input').check();
  await buffGroup.locator('.powers-warn').getByText('Заміна запитання: додайте запасні запитання', exact).waitFor();
  const sparesBox = host.locator('details.spares');
  expect(await sparesBox.getAttribute('open')).toBeNull();
  await click(host, 'Зберегти');
  await host.getByText('Заміна запитання: додайте запасні запитання.', exact).waitFor();
  await expect.poll(() => sparesBox.getAttribute('open')).not.toBeNull();
  expect(host.url()).not.toMatch(/\/quizzes$/);
  await shot(host, 'buff8b-editor-empty');
  const spareText = sparesBox.locator('.question-field textarea');
  await sparesBox.getByRole('button', { name: 'Додати запасне', ...exact }).click();
  await sparesBox.getByRole('button', { name: 'так чи ні', ...exact }).click();
  await spareText.fill('Чорне море солоніше за Азовське?');
  await sparesBox.getByRole('button', { name: 'Правильна відповідь: Так', ...exact }).click();
  await sparesBox.getByRole('button', { name: 'Додати запасне', ...exact }).click();
  await sparesBox.getByRole('button', { name: 'текст', ...exact }).click();
  await spareText.fill('Столиця Буковини?');
  await sparesBox.getByLabel('Написання 1', exact).fill('Чернівці');
  await sparesBox.getByRole('button', { name: 'Додати запасне', ...exact }).click();
  await sparesBox.getByRole('button', { name: 'число', ...exact }).click();
  await spareText.fill('Скільки днів у високосному році?');
  await sparesBox.getByLabel('Правильне число', exact).fill('366');
  for (const label of ['Запасне 1 · так чи ні', 'Запасне 2 · текст', 'Запасне 3 · число']) await sparesBox.getByRole('button', { name: label, ...exact }).waitFor();
  expect(await sparesBox.getByLabel('Час, с', exact).count()).toBe(0);
  expect(await sparesBox.getByLabel('Бали', exact).count()).toBe(0);
  expect(await sparesBox.locator('.hint-field').count()).toBe(0);
  await shot(host, 'buff8b-editor-spares');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'buff8b-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // Гра: сцена 1600 × 900, Оля 375, Петро 360, Іра 390.
  await host.locator('.quiz-list li', { hasText: 'Бафи 2' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage8b', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya8b', 375, 812);
  const petro = await open('petro8b', 360, 740);
  const ira = await open('ira8b', 390, 844);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const hostScore = async (nickname: string) => (await row(nickname).locator('.score').textContent())!;
  const scores = async () => ({ Оля: await hostScore('Оля'), Петро: await hostScore('Петро'), Іра: await hostScore('Іра') });
  const response = (nickname: string) => host.locator('.rows li', { has: host.locator('.given') }).filter({ hasText: nickname });
  const reveal = async () => {
    await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
    await click(host, 'Показати відповідь');
    for (const page of phones) await page.locator('section.result').first().waitFor();
  };
  const panel = (page: Page) => page.locator('.buff-panel');
  const answerY = async (page: Page) => Math.round((await field(page, 'Ваша відповідь').boundingBox())!.y);

  // 1. q1: підказка з редактора — одразу й лише в Олі; на сцені значок і сповіщення.
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  for (const page of phones) {
    await page.locator('h1', { hasText: 'Найдовша річка України?' }).waitFor();
    expect(await page.locator('.buff-row .buff-btn').allTextContents()).toEqual(['%', '?', '⇄']);
  }
  await takeBuff(olya, 'Підказка ведучого');
  await panel(olya).getByText('? Тече через Київ', exact).waitFor();
  await shot(olya, 'buff8b-hint-written');
  await expectNoSideScroll(olya, 'buff8b-hint-375');
  await stage.locator('.stage-buffs li').getByText('? Оля', exact).waitFor();
  await stage.locator('.live-notice.is-buff').getByText('Оля: Підказка ведучого', exact).waitFor();
  for (const page of [stage, petro, ira]) expect(await page.content()).not.toContain('Тече через Київ');
  await pickOption(olya, 'Дніпро');
  await pickOption(petro, 'Дніпро');
  await pickOption(ira, 'Дністер');
  await reveal();
  for (const page of [stage, petro, ira]) expect(await page.content()).not.toContain('Тече через Київ');
  await expect.poll(scores).toEqual({ Оля: '100', Петро: '100', Іра: '0' });

  // 2. q2: зал голосує числом; аркуш не зсуває запитання; здогадки лише в Олі.
  await click(host, 'Далі');
  await petro.locator('h1', { hasText: 'Скільки областей' }).waitFor();
  await numericAnswer(petro, '24');
  await numericAnswer(ira, '25');
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await ira.getByText('Відповідь прийнято', exact).waitFor();
  const petroQuestion = await boxOf(petro, 'h1.question');
  await takeBuff(olya, 'Запитання в залі');
  for (const page of [petro, ira]) await page.locator('.vote-sheet').getByText('Оля питає зал: як думаєте?', exact).waitFor();
  await petro.waitForTimeout(300); // аркуш виїжджає 0,2 с: кадр — після анімації
  await shot(petro, 'buff8b-vote-sheet');
  expect(await boxOf(petro, 'h1.question'), 'the vote sheet moved the question').toEqual(petroQuestion);
  expect(await noSideScroll(petro), 'vote sheet: horizontal scroll').toBe(true);
  await vote(petro, '24');
  await panel(olya).getByText('Здогадки залу: 24 ×1', exact).waitFor();
  await vote(ira, '25');
  await panel(olya).getByText('Здогадки залу: 24 ×1, 25 ×1', exact).waitFor();
  await shot(olya, 'buff8b-vote-guesses');
  expect(await bodyText(stage)).not.toContain('Здогадки');
  expect(await bodyText(ira)).not.toContain('Здогадки');
  await numericAnswer(olya, '24');
  await reveal();
  await expect.poll(scores).toEqual({ Оля: '200', Петро: '200', Іра: '0' });

  // 3. q3: голосувати нікому; підказка від ведучого; заміна в Олі; голос текстом.
  await click(host, 'Далі');
  await ira.locator('h1', { hasText: 'Столиця Галичини?' }).waitFor();
  await tapBuff(ira, 'Запитання в залі', 'Поки ніхто не може проголосувати.');
  await takeBuff(petro, 'Підказка ведучого');
  await panel(petro).getByText('Ведучий думає…', exact).waitFor();
  const petroPanel = await boxOf(petro, '.buff-panel');
  const petroField = await answerY(petro);
  const card = host.locator('.hint-request', { hasText: 'Петро просить підказку' });
  await card.waitFor();
  await shot(host, 'buff8b-hint-request');
  await host.setViewportSize({ width: 375, height: 812 });
  await card.scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'buff8b-hint-request-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await card.locator('textarea').fill('Місто Лева');
  await card.getByRole('button', { name: 'Надіслати', ...exact }).click();
  await panel(petro).getByText('? Місто Лева', exact).waitFor();
  await card.waitFor({ state: 'detached' });
  expect(await answerY(petro), 'the host hint moved the answer field').toBe(petroField);
  expect(await boxOf(petro, '.buff-panel'), 'the host hint resized the panel').toEqual(petroPanel);
  for (const page of [stage, olya, ira]) expect(await page.content()).not.toContain('Місто Лева');
  await takeBuff(olya, 'Заміна запитання');
  await olya.locator('h1', { hasText: 'Чорне море солоніше за Азовське?' }).waitFor();
  for (const name of ['Так', 'Ні']) await olya.getByRole('button', { name, ...exact }).waitFor();
  await olya.locator('.question-meta .spare-tag').getByText('Запасне запитання', exact).waitFor();
  await olya.locator('.buff-why').getByText('⇄ Запасне запитання: щонайменше 20 с', exact).waitFor();
  await shot(olya, 'buff8b-swap-phone');
  await expectNoSideScroll(olya, 'buff8b-swap-375');
  await stage.locator('.stage-buffs li').getByText('⇄ Оля відповідає на запасне', exact).waitFor();
  await stage.locator('h1', { hasText: 'Столиця Галичини?' }).waitFor();
  for (const page of [stage, petro, ira]) expect(await page.content()).not.toContain('Чорне море');
  await shot(stage, 'buff8b-swap-stage');
  await textAnswer(petro, 'Львів');
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await takeBuff(ira, 'Запитання в залі');
  await petro.locator('.vote-sheet').getByText('Іра питає зал: як думаєте?', exact).waitFor();
  expect(await olya.locator('.vote-sheet').count(), 'a player on a spare votes on the main question').toBe(0);
  await vote(petro, 'Львів');
  await panel(ira).getByText('Здогадки залу: Львів ×1', exact).waitFor();
  await textAnswer(ira, 'Львів');
  await click(olya, 'Так');
  await reveal();
  await olya.getByText('Правильна відповідь: Так', exact).waitFor();
  expect(await bodyText(stage)).not.toContain('Чорне море');
  await response('Оля').locator('.spare-tag').getByText('запасне', exact).waitFor();
  expect(await response('Оля').locator('.spare-tag').getAttribute('title')).toBe('Чорне море солоніше за Азовське?');
  expect(await response('Оля').locator('.given').textContent()).toBe('Так');
  await shot(host, 'buff8b-swap-reveal-host');
  await expect.poll(scores).toEqual({ Оля: '300', Петро: '300', Іра: '100' });

  // 4. q4 (8 с): Іра просить підказку, ведучий «Підказав уголос»; заміна Петра чекає 20 с, ведучий не чекає.
  await click(host, 'Далі');
  await ira.locator('h1', { hasText: 'Найвища гора України?' }).waitFor();
  await takeBuff(ira, 'Підказка ведучого');
  await panel(ira).getByText('Ведучий думає…', exact).waitFor();
  await host.locator('.hint-request', { hasText: 'Іра просить підказку' }).getByRole('button', { name: 'Підказав уголос', ...exact }).click();
  await panel(ira).getByText('Ведучий підказав уголос', exact).waitFor();
  await takeBuff(petro, 'Заміна запитання');
  await petro.locator('h1', { hasText: 'Столиця Буковини?' }).waitFor();
  await field(petro, 'Ваша відповідь').waitFor();
  expect(await seconds(petro)).toBeGreaterThanOrEqual(17);
  await pickOption(olya, 'Говерла');
  await pickOption(ira, 'Говерла');
  const stageWait = stage.locator('.buff-wait');
  await stageWait.waitFor({ timeout: 10000 });
  expect(await stageWait.textContent()).toMatch(/^Чекаємо: Петро · 0:1\d$/);
  await shot(stage, 'buff8b-swap-wait-stage');
  await click(host, 'Не чекати');
  await reveal();
  await expect.poll(scores).toEqual({ Оля: '400', Петро: '300', Іра: '200' });

  // 5. Поле: голосують усі, крім вибравшого; заміна на полі — запасне бачать усі.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  const cell = (page: Page, category: string, price: number) => page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(olya, 'Міста', 100).click();
  await olya.locator('h1', { hasText: 'Міста 100' }).waitFor();
  await pickOption(olya, 'Київ');
  await click(host, 'Прийняти');
  await olya.getByText('Правильно!').waitFor();
  await expect.poll(scores).toEqual({ Оля: '500', Петро: '300', Іра: '200' });
  await toBoard();

  await petro.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(petro, 'Річки', 100).click();
  for (const page of phones) await page.locator('h1', { hasText: 'Річки 100' }).waitFor();
  await takeBuff(petro, 'Запитання в залі');
  for (const page of [olya, ira]) await page.locator('.vote-sheet').getByText('Петро питає зал: як думаєте?', exact).waitFor();
  await olya.waitForTimeout(300);
  await expectNoSideScroll(olya, 'buff8b-vote-board-375');
  await vote(olya, 'Київ');
  await vote(ira, 'Київ');
  await panel(petro).locator('.vote-row', { hasText: 'Київ' }).locator('.vote-pct').getByText('100 %', exact).waitFor();
  await shot(petro, 'buff8b-vote-board-pct');
  // Усі варіанти влазять у панель сталої висоти: прокрутки всередині немає.
  expect(await panel(petro).evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  expect(await bodyText(stage)).not.toContain(' %');
  await pickOption(petro, 'Київ');
  await click(host, 'Прийняти');
  await petro.getByText('Правильно!').waitFor();
  await expect.poll(scores).toEqual({ Оля: '500', Петро: '400', Іра: '200' });
  await toBoard();

  await ira.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(ira, 'Гори', 100).click();
  await ira.locator('h1', { hasText: 'Гори 100' }).waitFor();
  await takeBuff(ira, 'Заміна запитання');
  for (const page of [stage, ...phones]) await page.locator('h1', { hasText: 'Скільки днів у високосному році?' }).waitFor();
  await stage.locator('.stage-buffs li').getByText('⇄ Іра: запасне запитання', exact).waitFor();
  await shot(stage, 'buff8b-swap-board-stage');
  await numericAnswer(ira, '366');
  await click(host, 'Прийняти');
  await ira.getByText('Правильно!').waitFor();
  await expect.poll(scores).toEqual({ Оля: '500', Петро: '400', Іра: '300' });

  // 6. Історія: та сама таблиця; запасні з текстом і відповіддю, значки бафів.
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();
  await expectNoSideScroll(olya, 'buff8b-phone-375');
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Бафи 2/ }).click();
  const standings = host.locator('.standings li');
  await standings.first().waitFor();
  const table: [string, string][] = [];
  for (let i = 0; i < (await standings.count()); i++) {
    table.push([(await standings.nth(i).locator('.name').textContent())!, (await standings.nth(i).locator('.score').textContent())!]);
  }
  expect(table).toEqual([
    ['Оля', '500'],
    ['Петро', '400'],
    ['Іра', '300'],
  ]);
  await host.evaluate("document.querySelectorAll('details.responses').forEach((d) => { d.open = true; })");
  const line = (question: string, nickname: string) =>
    host
      .locator('.rows.stacked > li', { hasText: question })
      .locator('details.responses li', { has: host.locator('.responses-name', { hasText: nickname }) });
  expect(await line('Найдовша річка', 'Оля').locator('.buff-tag').allTextContents()).toEqual(['?']);
  const olyaSpare = line('Столиця Галичини', 'Оля');
  expect(await olyaSpare.locator('.buff-tag').allTextContents()).toEqual(['⇄']);
  expect(await olyaSpare.locator('.spare-tag').textContent()).toBe('запасне');
  expect(await olyaSpare.locator('.spare-text').textContent()).toBe('Запасне: Чорне море солоніше за Азовське?');
  expect(await olyaSpare.locator('.responses-answer').textContent()).toBe('Так');
  const iraSpare = line('Гори 100', 'Іра');
  expect(await iraSpare.locator('.spare-text').textContent()).toBe('Запасне: Скільки днів у високосному році?');
  expect(await iraSpare.locator('.responses-answer').textContent()).toBe('366');
  await shot(host, 'buff8b-history-host');

  expect(problems).toEqual([]);
}

it('part 8c: «Раунд N» on the stage and phones, «Запитання N» with the timer after it, ±15 s during a splash, a pause mid-splash, a flipping cell, «Дуель!», a festive final with a reconnect mid-splash, «Підсумки» before the podium, reduced motion', async () => {
  try {
    await transitionsGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Чекає шар заставки потрібного виду. */
async function splashOn(page: Page, kind: string) {
  await page.locator(`.splash.is-${kind}`).waitFor();
}

async function transitionsGame() {
  const host = await open('host8c', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host8c@example.com');

  const choice = (id: string, text: string, timeLimit: number, options: string[]) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit,
    points: 100,
    options: options.map((option, at) => ({ id: `${id}o${at}`, text: option })),
    correctId: `${id}o0`,
  });
  const LONG_ROUND = 'Столиці дуже далеких і дуже цікавих країн світу';
  const cellQ = (category: string, price: number) => ({
    ...withPoints(withId(single, `b-${category}-${price}`), price),
    text: `${category} ${price}: столиця України?`,
    timeLimit: 20,
  });
  const rounds = [
    classicRound(
      'r1',
      [
        choice('q1', 'Столиця Франції?', 20, ['Париж', 'Ліон', 'Марсель']),
        choice('q2', 'Столиця Італії?', 20, ['Рим', 'Мілан', 'Неаполь']),
        choice('q3', 'Столиця Іспанії?', 20, ['Мадрид', 'Барселона', 'Севілья']),
      ],
      { title: LONG_ROUND, speedBonus: false },
    ),
    boardRound(
      'r2',
      ['Міста', 'Річки', 'Гори'].map((title) => ({
        title,
        cells: [100, 200, 300].map((price) =>
          title === 'Міста' && price === 300 ? { question: cellQ(title, price), mark: 'x2' as const } : cellQ(title, price),
        ),
      })),
      { title: 'Поле', answerMode: 'phone', check: 'auto' },
    ),
    finalRound('r3', choice('f1', 'Перша людина в космосі?', 30, ['Гагарін', 'Армстронг']), { title: 'Космос' }),
  ];
  const duels = {
    categories: [
      {
        id: 'dc1',
        title: 'Мови',
        questions: [
          { id: 'd1', text: 'Hello українською?', accepted: ['привіт'] },
          { id: 'd2', text: 'Thank you українською?', accepted: ['дякую'] },
        ],
      },
    ],
    questionsPerDuel: 1,
    timeLimit: 20,
    stake: 0,
  };
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end' }), title: 'Переходи', duels };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Гра: сцена 1600 × 900, Оля 375, Петро 360, Іра 390 з «менше руху».
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Переходи' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage8c', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya8c', 375, 812);
  const petro = await open('petro8c', 360, 740);
  const calm = await open('calm8c', 390, 844, { reducedMotion: 'reduce' });
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(calm, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, calm];
  const all = [stage, ...phones];
  const splashText = async (page: Page) => (await page.locator('.splash').textContent()) ?? '';
  const reveal = async () => {
    await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
    await click(host, 'Показати відповідь');
    for (const page of phones) await page.locator('section.result').first().waitFor();
  };

  // 1. «Раунд 1» з довгою назвою на сцені й меншим шаром на телефоні; пульт вільний.
  await click(host, 'Почати гру');
  await splashOn(stage, 'round');
  expect(await splashText(stage)).toContain('Раунд 1');
  expect(await splashText(stage)).toContain(LONG_ROUND);
  await olya.locator('.splash.is-round.is-phone').waitFor();
  expect(await noSideScroll(olya), 'transition8c-round-375: horizontal scroll').toBe(true);
  expect(await host.locator('.splash').count(), 'the host console is covered').toBe(0);
  await host.getByText('На екрані заставка', exact).waitFor();
  expect(await host.getByRole('button', { name: 'Почати раунд', ...exact }).isEnabled()).toBe(true);
  await Promise.all([shot(stage, 'transition8c-round-stage', { splash: true }), shot(olya, 'transition8c-round-375', { splash: true })]);
  await afterSplash(stage, olya);
  await stage.locator('.round-facts', { hasText: '3 запитання · 20 с' }).waitFor();
  expect(await stage.locator('.splash').count()).toBe(0);
  await host.getByText('На екрані заставка', exact).waitFor({ state: 'detached' });

  // 2. «Запитання 1 з 3»; запитання вже стоїть під шаром і не зсувається; таймер — повний після заставки.
  await click(host, 'Почати раунд');
  await splashOn(stage, 'question');
  await olya.locator('.splash.is-question.is-phone').waitFor();
  const under = (await olya.evaluate(
    "(() => ({ splash: document.querySelector('.splash') !== null, y: Math.round(document.querySelector('h1.question').getBoundingClientRect().top) }))()",
  )) as { splash: boolean; y: number };
  expect(under.splash, 'the question was measured after the splash').toBe(true);
  expect(await splashText(stage)).toContain('Запитання 1');
  expect(await splashText(stage)).toContain('з 3');
  await petro.locator('.splash.is-question.is-phone').waitFor();
  await Promise.all([shot(stage, 'transition8c-question-stage', { splash: true }), shot(petro, 'transition8c-question-360', { splash: true })]);
  await afterSplash(olya, stage);
  expect(Math.round((await olya.locator('h1.question').boundingBox())!.y), 'the question moved after the splash').toBe(under.y);
  expect(await seconds(olya)).toBeGreaterThanOrEqual(19);
  expect(await seconds(stage)).toBeGreaterThanOrEqual(19);
  for (const page of phones) await pickOption(page, 'Париж');
  await reveal();

  // 3. «+15 с» посеред заставки рахується від старту запитання.
  await click(host, 'Далі');
  await splashOn(stage, 'question');
  await click(host, '+15 с');
  await afterSplash(stage);
  expect(await host.getByRole('alert').count(), 'the host got an error for +15 s').toBe(0);
  expect(await seconds(stage)).toBeGreaterThanOrEqual(34);
  await afterSplash(...phones);
  await pickOption(olya, 'Рим');
  await pickOption(petro, 'Рим');
  await pickOption(calm, 'Неаполь');
  await reveal();

  // Пауза посеред заставки: шару немає; після «Продовжити» догравається решта, таймер повний.
  await click(host, 'Далі');
  await host.getByRole('button', { name: 'Пауза', ...exact }).first().click();
  await stage.locator('.banner', { hasText: 'Пауза' }).waitFor();
  for (const page of all) expect(await page.locator('.splash').count(), 'a splash during the pause').toBe(0);
  await shot(stage, 'transition8c-paused-stage');
  await stage.waitForTimeout(2000);
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();
  await splashOn(stage, 'question');
  expect(await splashText(stage)).toContain('Запитання 3');
  await afterSplash(...all);
  expect(await seconds(stage)).toBeGreaterThanOrEqual(19);
  for (const page of phones) await pickOption(page, 'Мадрид');
  await reveal();

  // 4. «Раунд 2» — у Іри лише проявлення; поле; клітинка перегортається.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await splashOn(stage, 'round');
  await splashOn(calm, 'round');
  const motion = (await calm.evaluate(
    "(() => ({ layer: getComputedStyle(document.querySelector('.splash')).animationName, card: getComputedStyle(document.querySelector('.splash-card')).animationName }))()",
  )) as { layer: string; card: string };
  expect(motion).toEqual({ layer: 'splash-fade', card: 'none' });
  await shot(calm, 'transition8c-reduced-390', { splash: true });
  await afterSplash(...all);
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await olya.getByRole('button', { name: 'Міста, 300', ...exact }).click();
  await splashOn(stage, 'cell');
  await olya.locator('.splash.is-cell.is-phone').waitFor();
  const flip = (await stage.locator('.splash-flip').textContent()) ?? '';
  expect(flip).toContain('Міста · 300');
  // План 9a: позначка — сюрприз наприкінці перегортання, штамп «×2!» поверх картки.
  await stage.locator('.splash-surprise', { hasText: '×2!' }).waitFor();
  await Promise.all([shot(stage, 'transition8c-cell-stage', { splash: true }), shot(olya, 'transition8c-cell-375', { splash: true })]);
  await afterSplash(...all);
  expect(await seconds(olya)).toBeGreaterThanOrEqual(19);
  await pickOption(olya, 'Київ');
  await click(host, 'Прийняти');
  await olya.getByText('Правильно!').waitFor();

  // 5. «Дуель!»: категорію ведучий вибирає ще під час заставки (у претендентки кнопки вимкнені), таймер дуелі стартує після неї.
  await duelButton(olya).click();
  await olya.getByRole('dialog').getByRole('button', { name: 'Петро', ...exact }).click();
  await host.getByText('Оголошено дуель: Оля — Петро', exact).waitFor();
  await click(host, 'Почати дуель');
  await splashOn(stage, 'duel');
  // Претендентка під шаром «Дуель!» наосліп категорію не вибере: кнопки вимкнені, вибирає ведучий.
  await olya.locator('.splash.is-duel.is-phone').waitFor();
  expect(await olya.getByRole('button', { name: 'Мови · лишилося 2', ...exact }).isDisabled(), 'a category under the splash').toBe(true);
  rigged.push(1);
  await host.locator('.duel-host').getByRole('button', { name: 'Мови · лишилося 2', ...exact }).click();
  const pair = await splashText(stage);
  for (const part of ['Дуель!', 'Оля', '⚔', 'Петро']) expect(pair).toContain(part);
  await petro.locator('.splash.is-duel.is-phone').waitFor();
  await Promise.all([shot(stage, 'transition8c-duel-stage', { splash: true }), shot(petro, 'transition8c-duel-360', { splash: true })]);
  await afterSplash(stage);
  await stage.locator('.duel-stage-question', { hasText: 'Hello українською?' }).waitFor();
  expect(await seconds(stage)).toBeGreaterThanOrEqual(19);
  await afterSplash(olya);
  await duelAnswer(olya, 'привіт');
  await stage.locator('.duel-stage-score', { hasText: '1 : 0' }).waitFor();
  await click(host, 'Підсумок дуелі');
  await click(host, 'Продовжити гру');
  await stage.locator('.duel-stage').waitFor({ state: 'detached' });

  // 6. Фінал: урочиста заставка; телефон перезавантажується посеред неї й продовжує з того самого місця.
  await click(host, 'Завершити раунд');
  await host.getByRole('button', { name: 'Наступний раунд', ...exact }).waitFor();
  expect(await stage.locator('.splash').count(), 'round results have no splash').toBe(0);
  await click(host, 'Наступний раунд');
  await splashOn(stage, 'final');
  const finalSeen = Date.now();
  expect(await splashText(stage)).toContain('Фінал');
  expect(await splashText(stage)).toContain('Космос');
  await stage.locator('.splash-rays').waitFor();
  await shot(stage, 'transition8c-final-stage', { splash: true });
  // Перезавантаження локально триває ~50 мс: спершу частина заставки минає, щоб «з того самого місця» було видно.
  await olya.waitForTimeout(Math.max(0, 600 - (Date.now() - finalSeen)));
  await olya.reload();
  await olya.locator('.splash.is-final').waitFor();
  const style = (await olya.locator('.splash').getAttribute('style')) ?? '';
  const resumedAt = Number.parseFloat(/--splash-elapsed:\s*(-?[\d.]+)ms/.exec(style)?.[1] ?? 'NaN');
  expect(resumedAt, `the final splash started over after the reload: ${style}`).toBeLessThanOrEqual(-300);
  await shot(olya, 'transition8c-final-reconnect-375', { splash: true });
  await afterSplash(...all);
  await click(host, 'Почати фінал');
  // Остання ставка одразу відкриває запитання: підтвердження чекаємо лише в перших двох.
  for (const page of phones) {
    await page.getByLabel('Ставка', exact).fill('0');
    await click(page, 'Поставити');
    if (page !== calm) await page.getByText('Ваша ставка: 0').waitFor();
  }
  await splashOn(stage, 'question');
  expect(await splashText(stage)).toContain('Запитання фіналу');
  expect(await splashText(stage)).not.toContain('з 1');
  await afterSplash(...all);
  expect(await seconds(stage)).toBeGreaterThanOrEqual(29);
  for (const page of phones) await pickOption(page, 'Гагарін');

  // 7. «Підсумки» перед п'єдесталом.
  await click(host, 'Показати відповідь');
  for (let i = 0; i < phones.length; i++) await click(host, 'Наступний гравець');
  await click(host, 'Далі');
  await splashOn(stage, 'podium');
  expect(await splashText(stage)).toContain('Підсумки');
  expect(await splashText(stage)).toContain('Хто ж переміг?');
  await olya.locator('.splash.is-podium.is-phone').waitFor();
  await shot(stage, 'transition8c-podium-stage', { splash: true });
  await afterSplash(stage, olya);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await shot(stage, 'transition8c-podium-after');
  await expectNoSideScroll(olya, 'transition8c-phone-375');

  expect(problems).toEqual([]);
}

it('part 8d: «Як грати» built from the quiz on the stage, phones and host — paging, a reload mid-guide, «До гри», then «Раунд 1»; a round reminder; a tip above the first question of each type with the timer running; the editor flag', async () => {
  try {
    await newcomersGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Чекає сторінку «Як грати» з потрібним заголовком. */
async function guideOn(page: Page, title: string) {
  await page.locator('.guide-title', { hasText: title }).waitFor();
}

async function newcomersGame() {
  const host = await open('host8d', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host8d@example.com');

  const choice = (id: string, text: string, timeLimit: number, options: string[]) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit,
    points: 100,
    options: options.map((option, at) => ({ id: `${id}o${at}`, text: option })),
    correctId: `${id}o0`,
  });
  const OCEANS = ['Тихий', 'Атлантичний', 'Індійський'];
  const oceans = {
    id: 'q2',
    type: 'order' as const,
    text: 'Розставте океани за площею',
    imageUrl: null,
    video: null,
    timeLimit: 30,
    points: 100,
    items: OCEANS.map((text, at) => ({ id: `q2i${at}`, text })),
    topLabel: 'Найбільший',
    bottomLabel: 'Найменший',
  };
  const rounds = [
    classicRound(
      'r1',
      [choice('q1', 'Столиця Франції?', 20, ['Париж', 'Ліон', 'Марсель']), oceans, choice('q3', 'Столиця Італії?', 20, ['Рим', 'Мілан'])],
      { title: 'Розминка', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES },
    ),
    finalRound('r2', choice('f1', 'Перша людина в космосі?', 30, ['Гагарін', 'Армстронг']), { title: 'Космос', wagerMode: 'bank' }),
  ];
  const duels = {
    categories: [
      {
        id: 'dc1',
        title: 'Мови',
        questions: [
          { id: 'd1', text: 'Hello українською?', accepted: ['привіт'] },
          { id: 'd2', text: 'Thank you українською?', accepted: ['дякую'] },
        ],
      },
    ],
    questionsPerDuel: 1,
    timeLimit: 20,
    stake: 200,
  };
  const data = {
    ...makeRoundsQuiz(rounds, { leaderboard: 'end', newcomers: true, buffs: ['fifty', 'double'], debuffs: ['fog'] }),
    title: 'Для новачків',
    duels,
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Редактор: у «Правилах гри» прапорець «Пояснення для новачків» увімкнений.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Для новачків' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('details.rules > summary', { hasText: 'Правила гри' }).click();
  const flag = host.locator('label.field-check', { hasText: 'Пояснення для новачків' }).locator('input');
  expect(await flag.isChecked(), 'the newcomers flag').toBe(true);
  await shot(host, 'guide8d-editor');
  await host.goto(`${base}/quizzes`);

  // Гра: сцена 1280 × 720, Оля 375, Петро 360.
  await host.locator('.quiz-list li', { hasText: 'Для новачків' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage8d', 1280, 720);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya8d', 375, 812);
  const petro = await open('petro8d', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();
  const phones = [olya, petro];
  const all = [stage, ...phones];
  const kicker = (page: Page) => page.locator('.guide-kicker').textContent();
  const hostButton = (name: string) => host.getByRole('button', { name, ...exact });
  const fitsStage = () => stage.evaluate('document.documentElement.scrollHeight <= innerHeight');
  const reveal = async () => {
    await hostButton('Показати відповідь').waitFor();
    await click(host, 'Показати відповідь');
    for (const page of phones) await page.locator('section.result').first().waitFor();
  };

  // 2. Сторінка 1: «Як грати» до заставки раунду.
  await click(host, 'Почати гру');
  await guideOn(stage, 'Відповідайте з телефона');
  expect(await kicker(stage)).toBe('Як грати · 1 з 6');
  for (const page of phones) await guideOn(page, 'Відповідайте з телефона');
  for (const page of all) expect(await page.locator('.splash').count(), 'a splash before the guide ends').toBe(0);
  for (const name of ['Далі', 'До гри', 'Пауза', 'Завершити гру']) await hostButton(name).waitFor();
  expect(await hostButton('Завершити раунд').count(), 'end round in the guide').toBe(0);
  expect(await fitsStage(), 'guide8d-phone-page-stage: vertical scroll').toBe(true);
  await Promise.all([shot(stage, 'guide8d-phone-page-stage'), shot(olya, 'guide8d-phone-page-375'), shot(host, 'guide8d-host')]);

  // 3. Раунди: класика й фінал із банком; на телефоні без значків.
  await click(host, 'Далі');
  await guideOn(stage, 'Раунди цієї гри');
  const stageGuide = stage.locator('.guide');
  for (const name of ['Класичний', 'Фінал']) await stageGuide.locator('.guide-name', { hasText: name }).waitFor();
  expect(await stageGuide.textContent()).toContain('віддає ставку в спільний банк');
  await guideOn(olya, 'Раунди цієї гри');
  for (const name of ['Класичний', 'Фінал']) await olya.locator('.guide-name', { hasText: name }).waitFor();
  expect(await olya.locator('.guide-icon').count(), 'icons on the phone').toBe(0);
  expect(await fitsStage(), 'guide8d-rounds-stage: vertical scroll').toBe(true);
  await Promise.all([shot(stage, 'guide8d-rounds-stage'), shot(olya, 'guide8d-rounds-375')]);

  // 4. Перезавантаження посеред «Як грати» — та сама сторінка.
  await olya.reload();
  await guideOn(olya, 'Раунди цієї гри');
  expect(await kicker(olya)).toContain('2 з 6');

  // 5. Типи запитань з підписом порядку.
  await click(host, 'Далі');
  for (const page of all) {
    await guideOn(page, 'Типи запитань');
    const text = (await page.locator('.guide').textContent()) ?? '';
    expect(text).toContain('Торкніться одного правильного варіанта.');
    expect(text).toContain('Розставте рядки стрілками ↑ ↓ (зверху — найбільший) і натисніть «Відповісти».');
  }
  expect(await noSideScroll(olya), 'guide8d-types-375: horizontal scroll').toBe(true);
  expect(await noSideScroll(petro), 'guide8d-types-360: horizontal scroll').toBe(true);
  expect(await fitsStage(), 'guide8d-types-stage: vertical scroll').toBe(true);
  await Promise.all([shot(stage, 'guide8d-types-stage'), shot(olya, 'guide8d-types-375'), shot(petro, 'guide8d-types-360')]);

  // 6. Бафи; пауза ховає «Далі» й «До гри», сторінка та сама.
  await click(host, 'Далі');
  await guideOn(stage, 'Бафи — ваші допомоги');
  const buffsText = (await stageGuide.textContent()) ?? '';
  for (const part of ['50/50', 'Подвійні бали', 'Кнопки — під запитанням']) expect(buffsText).toContain(part);
  expect(buffsText).not.toContain('Заміна запитання');
  expect(await fitsStage(), 'guide8d-buffs-stage: vertical scroll').toBe(true);
  await shot(stage, 'guide8d-buffs-stage');
  await hostButton('Пауза').click();
  await stage.locator('.banner', { hasText: 'Пауза' }).waitFor();
  await hostButton('Далі').waitFor({ state: 'detached' });
  expect(await hostButton('До гри').count(), '«До гри» on pause').toBe(0);
  await hostButton('Продовжити').click();
  await hostButton('Далі').waitFor();
  await hostButton('До гри').waitFor();
  await guideOn(stage, 'Бафи — ваші допомоги');
  expect(await kicker(stage)).toBe('Як грати · 4 з 6');

  // 7. «До гри» → заставка «Раунд 1» → пам'ятка раунду.
  await click(host, 'До гри');
  await splashOn(stage, 'round');
  expect((await stage.locator('.splash').textContent()) ?? '').toContain('Раунд 1');
  await afterSplash(stage, olya, petro);
  for (const page of [stage, olya]) {
    const text = await page.locator('body').innerText();
    expect(text).toContain('Як проходить раунд');
    expect(text).toContain('Запитання йдуть по черзі');
  }
  expect(await noSideScroll(olya), 'guide8d-reminder-375: horizontal scroll').toBe(true);
  await Promise.all([shot(stage, 'guide8d-reminder-stage'), shot(olya, 'guide8d-reminder-375')]);

  // 8. Підказка над першим single: з першої миті, таймер іде, відповідь приймається.
  await click(host, 'Почати раунд');
  await splashOn(stage, 'question');
  await olya.locator('.splash.is-question.is-phone').waitFor();
  const under = (await olya.evaluate(
    "(() => ({ splash: document.querySelector('.splash') !== null, tip: document.querySelector('.type-tip') !== null, y: Math.round(document.querySelector('h1.question').getBoundingClientRect().top) }))()",
  )) as { splash: boolean; tip: boolean; y: number };
  expect(under.splash, 'the question was measured after the splash').toBe(true);
  expect(under.tip, 'the tip is there under the splash').toBe(true);
  await afterSplash(...all);
  expect(Math.round((await olya.locator('h1.question').boundingBox())!.y), 'the question moved after the splash').toBe(under.y);
  for (const page of phones) expect(await page.locator('.type-tip').textContent()).toContain('Торкніться одного правильного варіанта.');
  expect(await stage.locator('.type-tip').count(), 'a tip on the stage').toBe(0);
  const before = await seconds(olya);
  await olya.waitForTimeout(2000);
  expect(await seconds(olya), 'the timer stopped for the tip').toBeLessThan(before);
  expect(await noSideScroll(olya), 'guide8d-tip-single-375: horizontal scroll').toBe(true);
  await shot(olya, 'guide8d-tip-single-375');
  for (const page of phones) await pickOption(page, 'Париж');
  await reveal();

  // 9. Порядок: підказка з підписом верху.
  await click(host, 'Далі');
  await afterSplash(...all);
  await olya.locator('h1.question', { hasText: 'Розставте океани за площею' }).waitFor();
  expect(await olya.locator('.type-tip').textContent()).toContain('зверху — найбільший');
  expect(await noSideScroll(olya), 'guide8d-tip-order-375: horizontal scroll').toBe(true);
  expect(await noSideScroll(petro), 'guide8d-tip-order-360: horizontal scroll').toBe(true);
  await Promise.all([shot(olya, 'guide8d-tip-order-375'), shot(petro, 'guide8d-tip-order-360')]);
  for (const page of phones) {
    await arrange(page, OCEANS);
    await click(page, 'Відповісти');
  }
  await reveal();

  // 10. Повторний тип — без підказки.
  await click(host, 'Далі');
  await afterSplash(...all);
  await olya.locator('h1.question', { hasText: 'Столиця Італії?' }).waitFor();
  for (const page of phones) expect(await page.locator('.type-tip').count(), 'a tip for a repeated type').toBe(0);
  for (const page of phones) await pickOption(page, 'Рим');
  await reveal();

  // 11. Фінал: пам'ятка зі ставкою, підказки немає.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await splashOn(stage, 'final');
  await afterSplash(...all);
  const finalText = await stage.locator('body').innerText();
  expect(finalText).toContain('Як проходить раунд');
  expect(finalText).toContain('Спершу таємна ставка');
  expect(await fitsStage(), 'guide8d-reminder-final-stage: vertical scroll').toBe(true);
  await shot(stage, 'guide8d-reminder-final-stage');
  await click(host, 'Почати фінал');
  // Остання ставка одразу відкриває запитання: підтвердження чекаємо лише в першій.
  await olya.getByLabel('Ставка', exact).fill('0');
  await click(olya, 'Поставити');
  await olya.getByText('Ваша ставка: 0').waitFor();
  await petro.getByLabel('Ставка', exact).fill('0');
  await click(petro, 'Поставити');
  await splashOn(stage, 'question');
  await afterSplash(...all);
  await olya.locator('h1.question', { hasText: 'Перша людина в космосі?' }).waitFor();
  for (const page of phones) expect(await page.locator('.type-tip').count(), 'a tip in the final').toBe(0);
  for (const page of phones) await pickOption(page, 'Гагарін');
  await click(host, 'Показати відповідь');
  for (let i = 0; i < phones.length; i++) await click(host, 'Наступний гравець');
  await click(host, 'Далі');
  await splashOn(stage, 'podium');
  await afterSplash(stage);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  expect(problems).toEqual([]);
}

it('part 8d: the densest «Як грати» pages — four kinds of rounds, five question types, all eight buffs, six debuffs and duels — fit the 1280×720 stage without scrolling', async () => {
  try {
    await denseGuide();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function denseGuide() {
  const host = await open('host8d2', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host8d2@example.com');
  const cells = ['Міста', 'Річки', 'Гори'].map((title, column) => ({
    title,
    cells: [100, 200, 300].map((price) => withPoints(withId(single, `b-${column}-${price}`), price)),
  }));
  const rounds = [
    classicRound('r1', [single, multi, boolQ, textQ, numericQ, { ...order, topLabel: 'Захід', bottomLabel: 'Схід' }, matchQ]),
    blitzRound('r2', [withId(single, 'z1'), withId(single, 'z2')]),
    boardRound('r3', cells),
    finalRound('r4', withId(single, 'f1'), { wagerMode: 'bank' }),
  ];
  const data = {
    ...makeRoundsQuiz(rounds, {
      newcomers: true,
      buffs: ['fifty', 'double', 'retry', 'time', 'shield', 'audience', 'hint', 'swap'],
      debuffs: ['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud'],
    }),
    title: 'Щільний гайд',
    spares: [withId(single, 's1')],
    duels: duelPool,
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Щільний гайд' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage8d2', 1280, 720);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya8d2', 375, 812);
  await join(olya, code, 'Оля', false);
  await stage.getByText('Оля').waitFor();

  await click(host, 'Почати гру');
  const pages: [string, string, number][] = [
    ['Відповідайте з телефона', 'phone', 0],
    ['Раунди цієї гри', 'rounds', 4],
    ['Типи запитань', 'types-5', 5],
    ['Типи запитань', 'types-2', 2],
    ['Бафи — ваші допомоги', 'buffs-8', 8],
    ['Дебафи', 'debuffs-6', 6],
    ['Дуелі', 'duels', 0],
  ];
  for (const [at, [title, name, items]] of pages.entries()) {
    await stage.locator('.guide-kicker', { hasText: `${at + 1} з ${pages.length}` }).waitFor();
    await guideOn(stage, title);
    expect(await stage.locator('.guide-item').count(), `guide8d-dense-${name}: items`).toBe(items);
    await shot(stage, `guide8d-dense-${name}-stage`);
    expect(await stage.evaluate('document.documentElement.scrollHeight <= innerHeight'), `guide8d-dense-${name}-stage: vertical scroll`).toBe(true);
    if (at < pages.length - 1) await click(host, 'Далі');
  }
  expect(await stage.locator('.guide').textContent()).toContain('Викликати можна до фіналу.');
  await click(host, 'До гри');
  await stage.locator('.splash').first().waitFor();

  expect(problems).toEqual([]);
}

it('part 9a: 50/50 struck through for the taker and on the stage for a board cell, the audience with +15 s and a folding sheet, buffs on a voice cell, «?» help and exact reasons, «Таблиця» at any time, hidden ×2 with a «×2!» surprise, board sorting for everybody with equal zones, «До меню» after the game', async () => {
  try {
    await afterThirdGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Тексти прибраних 50/50 варіантів без позначки «прибрано», літери й тексту для читачів екрана. */
async function removedTexts(page: Page): Promise<string[]> {
  return page.locator('.choice.is-removed').evaluateAll((els) =>
    els.map((el) => {
      const copy = el.cloneNode(true) as typeof el;
      copy.querySelectorAll('.removed-tag, .sr-only, .letter').forEach((node: { remove: () => void }) => node.remove());
      return (copy.textContent ?? '').trim();
    }),
  );
}

async function afterThirdGame() {
  const host = await open('host9a', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host9a@example.com');

  const options = (id: string, texts: string[]) => texts.map((text, at) => ({ id: `${id}o${at}`, text }));
  const choice = (id: string, text: string, texts: string[], points = 100) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit: 30,
    points,
    options: options(id, texts),
    correctId: `${id}o0`,
  });
  const q1 = choice('q1', 'Найбільше озеро України?', ['Ялпуг', 'Світязь', 'Синевир', 'Кагул']);
  const q2 = {
    id: 'q2',
    type: 'multi' as const,
    text: 'Які міста стоять на Дніпрі?',
    imageUrl: null,
    video: null,
    timeLimit: 30,
    points: 100,
    options: options('q2', ['Київ', 'Дніпро', 'Черкаси', 'Львів', 'Ужгород', 'Одеса']),
    correctIds: ['q2o0', 'q2o1', 'q2o2'],
  };
  const q3 = { id: 'q3', type: 'text' as const, text: 'Столиця Франції?', imageUrl: null, video: null, timeLimit: 30, points: 100, accepted: ['Париж'] };
  /** Правильна категорія кожного слова: лише в тесті. */
  const where: Record<string, string> = {};
  const sortCategories = ['Овочі', 'Фрукти', 'Ягоди'];
  const sortPairs: [string, number][] = [
    ['Морква', 0],
    ['Яблуко', 1],
    ['Малина', 2],
    ['Буряк', 0],
    ['Груша', 1],
    ['Смородина', 2],
  ];
  for (const [word, at] of sortPairs) where[word] = sortCategories[at]!;
  // 6 слів × 25 = клітинка «Їжа, 150»: ціна сортування — сума за всі слова.
  const sortQ = {
    id: 'b-sort',
    type: 'sort' as const,
    text: 'Овочі, фрукти чи ягоди?',
    imageUrl: null,
    video: null,
    timeLimit: 60,
    points: 25,
    lockSeconds: 1,
    categories: sortCategories.map((text, at) => ({ id: `bs-c${at}`, text })),
    words: sortPairs.map(([text, at], index) => ({ id: `bs-w${index}`, text, categoryId: `bs-c${at}` })),
  };
  const rounds = [
    classicRound('r1', [q1, q2, q3], { title: 'Розминка', speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' } }),
    boardRound(
      'r2',
      [
        {
          title: 'Міста',
          cells: [
            choice('b11', 'Столиця Італії?', ['Рим', 'Мілан', 'Неаполь', 'Турин'], 100),
            { answerMode: 'voice' as const, question: choice('b12', 'Столиця Іспанії?', ['Мадрид', 'Барселона', 'Севілья'], 200) },
            { mark: 'x2' as const, question: choice('b13', 'Столиця Польщі?', ['Варшава', 'Краків', 'Гданськ'], 300) },
          ],
        },
        {
          title: 'Їжа',
          cells: [
            { answerMode: 'phone' as const, question: sortQ },
            { kind: 'blitz' as const, question: choice('b22', 'Борщ — це суп?', ['Так, суп', 'Ні, салат'], 200) },
            choice('b23', 'Головне в варениках з картоплею?', ['Картопля', 'Рис'], 300),
          ],
        },
        { title: 'Гори', cells: [100, 200, 300].map((price) => choice(`b3${price}`, `Гори ${price}: найвища гора України?`, ['Говерла', 'Петрос'], price)) },
      ],
      { title: 'Поле', answerMode: 'phone', check: 'auto', rules: { ...DEFAULT_RULES, penalty: 'minus' } },
    ),
  ];
  const data = {
    ...makeRoundsQuiz(rounds, { leaderboard: 'end', buffs: ['fifty', 'double', 'retry', 'time', 'shield', 'audience', 'hint', 'swap'] }),
    spares: [{ id: 'sp1', type: 'boolean' as const, text: 'Сонце — зірка?', imageUrl: null, video: null, timeLimit: 30, points: 100, correct: true }],
    title: 'Після третьої гри',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Після третьої гри' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage9a', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya9a', 375, 812);
  const petro = await open('petro9a', 360, 740);
  const ira = await open('ira9a', 390, 844);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];
  const all = [stage, host, ...phones];

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const hostScore = async (nickname: string) =>
    Number((await row(nickname).locator('.score').textContent())!.replace('−', '-').replace(/\s/g, ''));
  const reveal = async () => {
    await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
    await click(host, 'Показати відповідь');
    for (const page of phones) await page.locator('section.result').first().waitFor();
  };
  const cell = (page: Page, category: string, price: number) => page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const shown = host.getByRole('button', { name: 'Показати відповідь', ...exact });
  const after = host.getByRole('button', { name: 'Далі', ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 1. q1, класика: «?» — вісім бафів із «Де: …»; 50/50 Олі закреслює два варіанти на місці, інші їх не бачать.
  for (const page of phones) await page.locator('h1', { hasText: 'Найбільше озеро України?' }).waitFor();
  await olya.getByRole('button', { name: 'Що роблять бафи', ...exact }).click();
  const help = olya.locator('.buff-help-sheet');
  await help.getByRole('heading', { name: 'Бафи', ...exact }).waitFor();
  expect(await help.locator('li').count()).toBe(8);
  const wheres = await help.locator('.buff-where').allTextContents();
  expect(wheres).toHaveLength(8);
  for (const line of wheres) expect(line).toMatch(/^Де: /);
  await shot(olya, 'buff9a-help-375');
  await expectNoSideScroll(olya, 'buff9a-help-375');
  await olya.keyboard.press('Escape');
  await help.waitFor({ state: 'detached' });
  const olyaChoices = await yOf(olya);
  await takeBuff(olya, '50/50');
  await expect.poll(() => olya.locator('.choice.is-removed').count()).toBe(2);
  const goneQ1 = await removedTexts(olya);
  expect(goneQ1).not.toContain('Ялпуг');
  for (const text of goneQ1) expect(['Світязь', 'Синевир', 'Кагул']).toContain(text);
  expect(await olya.locator('.choice.is-removed .removed-tag').allTextContents()).toEqual(['прибрано', 'прибрано']);
  expect(await yOf(olya), '50/50 moved the options').toEqual(olyaChoices);
  await shot(olya, 'buff9a-fifty-375');
  await expectNoSideScroll(olya, 'buff9a-fifty-375');
  await stage.locator('.live-notice.is-buff').getByText('Оля: 50/50', exact).waitFor();
  for (const page of [stage, petro, ira]) expect(await page.locator('.choice.is-removed').count(), 'classic: only the taker sees 50/50').toBe(0);
  await pickOption(olya, 'Ялпуг');
  await pickOption(petro, 'Ялпуг');
  await pickOption(ira, 'Світязь');
  await reveal();

  // 2. q2, кілька відповідей: 50/50 Петра прибирає 2 з 3 неправильних.
  await click(host, 'Далі');
  await afterSplash(...all);
  await petro.locator('h1', { hasText: 'Які міста стоять на Дніпрі?' }).waitFor();
  await takeBuff(petro, '50/50');
  await expect.poll(() => petro.locator('.choice.is-removed').count()).toBe(2);
  for (const text of await removedTexts(petro)) expect(['Львів', 'Ужгород', 'Одеса']).toContain(text);
  await shot(petro, 'buff9a-fifty-multi-360');
  await expectNoSideScroll(petro, 'buff9a-fifty-multi-360');
  for (const page of phones) {
    for (const text of ['Київ', 'Дніпро', 'Черкаси']) await pickOption(page, text);
    await click(page, 'Відповісти');
  }
  await reveal();

  // 3–4. q3: зал дає Олі +15 с; компактний аркуш, що згортається; «Таблиця» в Іри — лише власний рядок.
  await click(host, 'Далі');
  await afterSplash(...all);
  await olya.locator('h1', { hasText: 'Столиця Франції?' }).waitFor();
  await textAnswer(petro, 'Париж');
  await textAnswer(ira, 'Париж');
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await ira.getByText('Відповідь прийнято', exact).waitFor();
  await takeBuff(olya, 'Запитання в залі');
  await expect.poll(async () => (await seconds(olya)) - (await seconds(stage))).toBeGreaterThanOrEqual(14);
  const sheet = petro.locator('.vote-sheet');
  await sheet.getByText('Оля питає зал: як думаєте?', exact).waitFor();
  await petro.waitForTimeout(300);
  const openSheet = await boxOf(petro, '.vote-sheet');
  expect(openSheet.height, 'the vote sheet is taller than 35 % of the screen').toBeLessThanOrEqual(0.35 * 740 + 1);
  await shot(petro, 'buff9a-vote-360');
  await expectNoSideScroll(petro, 'buff9a-vote-360');
  await sheet.getByRole('button', { name: 'Згорнути', ...exact }).click();
  const unfold = sheet.getByRole('button', { name: 'Розгорнути', ...exact });
  await unfold.waitFor();
  expect(await unfold.getAttribute('aria-expanded')).toBe('false');
  expect((await boxOf(petro, '.vote-sheet')).height, 'folding did not shrink the sheet').toBeLessThan(openSheet.height);
  await shot(petro, 'buff9a-vote-folded-360');
  await unfold.click();
  await vote(petro, 'Париж');
  // «Таблиця» поверх запитання: leaderboard end — лише власне місце.
  const iraTitle = await boxOf(ira, 'h1');
  await ira.getByRole('button', { name: 'Таблиця', ...exact }).click();
  const table = ira.locator('.table-sheet');
  await table.getByRole('heading', { name: 'Таблиця', ...exact }).waitFor();
  expect(await table.locator('.standings li').count()).toBe(1);
  expect(await table.locator('.standings li').textContent()).toContain('Іра');
  await table.getByText('Повна таблиця — наприкінці гри.', exact).waitFor();
  await shot(ira, 'buff9a-table-390');
  await expectNoSideScroll(ira, 'buff9a-table-390');
  await table.locator('h2').click();
  await table.waitFor({ state: 'detached' });
  expect(await boxOf(ira, 'h1'), 'the table moved the question').toEqual(iraTitle);
  // Спільний час минає — чекаємо на Олю, вона відповідає у свій час.
  await stage.locator('.buff-wait', { hasText: /^Чекаємо: Оля · 0:\d\d$/ }).waitFor({ timeout: 40000 });
  await textAnswer(olya, 'Париж');
  await reveal();

  // 5. Поле: позначок немає на сцені й телефонах, у ведучого «×2»; легенда каже, що вони є.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await afterSplash(...all);
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  for (const page of [stage, ...phones]) expect(await page.locator('.gb-mark').count(), 'a mark before the choice').toBe(0);
  await host.locator('.gb-mark', { hasText: '×2' }).first().waitFor();
  const legend = stage.locator('.gb-legend');
  await legend.getByText('×2 — подвійна ціна', exact).waitFor();
  await legend.getByText('Де ×2 і ×3 — сюрприз.', exact).waitFor();
  await shot(stage, 'buff9a-board-stage');
  await shot(olya, 'buff9a-board-375');

  // 6. Оля сортує на полі; Петро, Іра й сцена бачать категорії й усі слова за абеткою; зони рівні.
  const sortWords = ['Буряк', 'Груша', 'Малина', 'Морква', 'Смородина', 'Яблуко'];
  await cell(olya, 'Їжа', 150).click();
  await afterSplash(...all);
  await olya.locator('.sort-card').waitFor();
  for (const page of [petro, ira]) {
    await page.getByText('Оля сортує слова', exact).waitFor();
    expect(await page.locator('.sort-play.is-watching .sort-zone').count()).toBe(3);
    expect(await page.locator('button.sort-zone').count()).toBe(0);
    expect(await page.locator('.sort-words li').allTextContents()).toEqual(sortWords);
  }
  await stage.locator('.sort-words li').first().waitFor();
  expect(await stage.locator('.sort-words li').allTextContents()).toEqual(sortWords);
  for (const page of [olya, petro]) {
    const zones = await sortZoneBoxes(page);
    expect(zones).toHaveLength(3);
    for (const [, , width, height] of zones) {
      expect(Math.abs(width! - zones[0]![2]!), 'unequal zone widths').toBeLessThanOrEqual(1);
      expect(Math.abs(height! - zones[0]![3]!), 'unequal zone heights').toBeLessThanOrEqual(1);
    }
  }
  // Слова глядачів під ареною, а не поверх неї.
  const arenaBottom = await petro.locator('.sort-arena').evaluate((el) => el.getBoundingClientRect().bottom);
  const wordsTop = await petro.locator('.sort-words').evaluate((el) => el.getBoundingClientRect().top);
  expect(wordsTop, 'the words overlap the arena').toBeGreaterThanOrEqual(arenaBottom - 0.5);
  await expectNoSideScroll(petro, 'sort9a-watch-360');
  await expectNoSideScroll(olya, 'sort9a-play-375');
  await Promise.all([shot(petro, 'sort9a-watch-360'), shot(olya, 'sort9a-play-375'), shot(stage, 'sort9a-stage')]);
  // Сортування на полі — без бафів: ряд є, усі кнопки неактивні з причиною.
  for (const button of await olya.locator('.buff-row .buff-btn').all()) expect(await button.getAttribute('aria-disabled')).toBe('true');
  await tapBuff(olya, 'Подвійні бали', 'На сортуванні бафів немає.');
  // Кожне слово в картці посередині «хреста» — цілим рядком, без розриву посеред слова.
  const cardLines = () =>
    olya.locator('.sort-card').evaluate((card) => {
      const range = card.ownerDocument.createRange();
      range.selectNodeContents(card);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    });
  for (let i = 0; i < sortWords.length; i++) {
    const card = await sortCard(olya);
    if (card === null) break;
    expect(await cardLines(), `«${card}» broke in the card`).toBe(1);
    await sortBy(olya, 'tap', where[card]!);
  }
  await after.waitFor();
  const petroReveal = petro.locator('.sort-reveal.is-open');
  await petroReveal.waitFor();
  for (const category of sortCategories) {
    const column = petroReveal.locator('.sort-reveal-col', { hasText: category });
    for (const word of sortWords.filter((w) => where[w] === category)) await column.getByText(word, exact).waitFor();
  }
  await shot(petro, 'sort9a-reveal-360');
  await toBoard();

  // 7. Усна клітинка Петра: «Друга спроба» пояснює причину, подвійні бали — +400 за ціну 200.
  await petro.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(petro, 'Міста', 200).click();
  await afterSplash(...all);
  await petro.getByText('Відповідайте вголос').waitFor();
  await tapBuff(petro, 'Друга спроба', 'Друга спроба не діє, коли відповідаєте вголос.');
  const petroBefore = await hostScore('Петро');
  await takeBuff(petro, 'Подвійні бали');
  await shot(petro, 'buff9a-voice-360');
  await expectNoSideScroll(petro, 'buff9a-voice-360');
  await host.locator('button.choice', { hasText: 'Мадрид' }).click();
  await host.getByRole('button', { name: /^(Прийняти|Зарахувати)$/ }).first().click();
  await Promise.race([shown.waitFor(), after.waitFor()]);
  if (await shown.isVisible()) await shown.click();
  await expect.poll(() => hostScore('Петро')).toBe(petroBefore + 400);
  await toBoard();

  // 8. Іра: «Міста, 300» — перегортання закінчується «×2!»; її 50/50 видно на сцені, у ведучого й на інших телефонах.
  await ira.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(ira, 'Міста', 300).click();
  await splashOn(stage, 'cell');
  await stage.locator('.splash-surprise', { hasText: '×2!' }).waitFor();
  await ira.locator('.splash-surprise', { hasText: '×2!' }).waitFor();
  await shot(ira, 'buff9a-surprise-390', { splash: true });
  // Штамп з'являється після перегортання (1 с із 1,8 с): кадр сцени — трохи пізніше за середину заставки.
  if (process.env.E2E_SHOTS === '1') await stage.waitForTimeout(250);
  await shot(stage, 'buff9a-surprise-stage', { splash: true });
  await afterSplash(...all);
  expect(await seconds(ira)).toBeGreaterThanOrEqual(19);
  await takeBuff(ira, '50/50');
  for (const page of [stage, host, olya, petro, ira]) {
    await expect.poll(() => page.locator('.choice.is-removed').count(), { message: 'one option removed' }).toBe(1);
    expect(await page.locator('.choice.is-removed .removed-tag').textContent()).toBe('прибрано');
    expect(await removedTexts(page)).not.toContain('Варшава');
  }
  await shot(stage, 'buff9a-board-fifty-stage');
  await shot(host, 'buff9a-board-fifty-host');
  await shot(olya, 'buff9a-board-fifty-375');
  await pickOption(ira, 'Варшава');
  await click(host, 'Прийняти');
  await ira.getByText('Правильно!').waitFor();
  await toBoard();

  // 9. Коло 2 починає Петро: бліц-клітинка — у кожного компактний рядок причини замість ряду бафів, черга лишається на екрані.
  await petro.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(petro, 'Їжа', 200).click();
  await afterSplash(...all);
  for (const page of phones) await page.locator('.buff-off').getByText('На бліц-клітинках бафів немає.', exact).waitFor();
  for (const page of phones) expect(await page.locator('.buff-row').count(), 'a buff row in a blitz cell').toBe(0);
  const queue = await olya.locator('.blitz-queue').boundingBox();
  expect(queue, 'no queue').not.toBeNull();
  expect(queue!.y + queue!.height, 'the queue fell below the screen').toBeLessThanOrEqual(812);
  await expectNoSideScroll(olya, 'buff9a-blitz-375');
  await shot(olya, 'buff9a-blitz-375');
  await olya.getByRole('button', { name: /Так, суп/ }).click();
  const acceptBlitz = host.getByRole('button', { name: 'Прийняти', ...exact });
  await Promise.race([shown.waitFor(), acceptBlitz.waitFor(), after.waitFor()]);
  if (await acceptBlitz.isVisible()) await acceptBlitz.click();
  await Promise.race([shown.waitFor(), after.waitFor()]);
  if (await shown.isVisible()) await shown.click();
  await after.waitFor();

  // 10. Кінець гри: «До меню» в гравця, «До вікторин» і «Історія ігор» у ведучого, мала кнопка на сцені.
  await click(host, 'Завершити гру');
  await afterSplash(...all);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const toMenu = olya.getByRole('link', { name: 'До меню', ...exact });
  await toMenu.waitFor();
  expect(await toMenu.getAttribute('href')).toBe('/');
  expect(await host.getByRole('link', { name: 'До вікторин', ...exact }).getAttribute('href')).toBe('/quizzes');
  expect(await host.getByRole('link', { name: 'Історія ігор', ...exact }).getAttribute('href')).toBe('/history');
  await stage.locator('.stage-menu').waitFor();
  expect(await stage.locator('.stage-menu').getAttribute('href')).toBe('/');
  await expectNoSideScroll(olya, 'menu9a-player-375');
  await Promise.all([shot(olya, 'menu9a-player-375'), shot(host, 'menu9a-host'), shot(stage, 'menu9a-stage')]);
  await toMenu.click();
  await olya.waitForURL(`${base}/`);
  await host.getByRole('link', { name: 'Історія ігор', ...exact }).click();
  await host.waitForURL(/\/history$/);
  await host.getByRole('link', { name: /Після третьої гри/ }).first().waitFor();

  expect(problems).toEqual([]);
}

it('part 9b: the server restarts in the middle of a question — the phones, the stage and the host show «Сервер перезапускається…», come back to a paused question with the answers kept, the host resumes and the game finishes into the history', async () => {
  try {
    await restartGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
  // Два перезапуски й ціла гра: довше за типові 180 с на повільній машині.
}, 300_000);

const RESTARTING_TEXT = 'Сервер перезапускається… Гра продовжиться сама.';

async function restartGame() {
  const host = await open('host9b', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host9b@example.com');

  const q1 = {
    id: 'q1',
    type: 'single' as const,
    text: 'Найбільше озеро України?',
    imageUrl: null,
    video: null,
    timeLimit: 60,
    points: 100,
    options: ['Ялпуг', 'Світязь', 'Синевир', 'Кагул'].map((option, at) => ({ id: `q1o${at}`, text: option })),
    correctId: 'q1o0',
  };
  const q2 = { id: 'q2', type: 'text' as const, text: 'Столиця Франції?', imageUrl: null, video: null, timeLimit: 30, points: 100, accepted: ['Париж'] };
  const rounds = [classicRound('r1', [q1, q2], { speedBonus: false, shuffleOptions: false })];
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'each', buffs: ['time'] }), title: 'Перезапуск' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Перезапуск' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage9b', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya9b', 375, 812);
  const petro = await open('petro9b', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();
  const phones = [olya, petro];
  const screens = [olya, petro, stage, host];

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const hostScore = async (nickname: string) => (await row(nickname).locator('.score').textContent())!;
  const scores = async () => ({ Оля: await hostScore('Оля'), Петро: await hostScore('Петро') });

  await click(host, 'Почати гру');
  await afterSplash(stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(stage, ...phones);
  for (const page of phones) await page.locator('h1', { hasText: 'Найбільше озеро України?' }).waitFor();

  // 1. До перезапуску: Оля бере «Додатковий час» і відповідає; Петро ще думає.
  await takeBuff(olya, 'Додатковий час');
  await pickOption(olya, 'Ялпуг');
  await olya.getByText('Відповідь прийнято', exact).waitFor();
  const sentBefore = await olya.locator('section.sent').textContent();
  expect(sentBefore).toContain('Ялпуг');
  const buffBefore = await buffButton(olya, 'Додатковий час').getAttribute('class');
  expect(buffBefore).toContain('is-active');
  const before = await seconds(stage);
  expect(before).toBeGreaterThan(40);

  // 2. Перезапуск: поки сервера немає, усі бачать «Сервер перезапускається…», а не «гри немає».
  await restart(async () => {
    for (const page of screens) await page.getByText(RESTARTING_TEXT, exact).waitFor();
    for (const page of screens) expect(await bodyText(page)).not.toContain('Цієї гри вже немає');
    await shot(olya, 'restart9b-down-375');
    await shot(stage, 'restart9b-down-stage');
    await shot(host, 'restart9b-down-host');
    await expectNoSideScroll(olya, 'restart9b-down-375');
    // Гра лишається під банером.
    await olya.locator('h1', { hasText: 'Найбільше озеро України?' }).waitFor();
  });

  // 3. Після перезапуску: без перезавантаження сторінок — те саме запитання на паузі, відповідь і баф Олі на місці.
  for (const page of screens) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  restarting = false;
  for (const page of [stage, ...phones]) {
    await page.locator('h1', { hasText: 'Найбільше озеро України?' }).waitFor();
    await page.locator('.banner', { hasText: 'Пауза' }).first().waitFor();
  }
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().waitFor();
  expect(await olya.locator('section.sent').textContent()).toBe(sentBefore);
  expect(await buffButton(olya, 'Додатковий час').getAttribute('class')).toBe(buffBefore);
  const back = await seconds(stage);
  expect(back).toBeLessThanOrEqual(before);
  expect(back).toBeGreaterThanOrEqual(before - 2);
  await stage.waitForTimeout(3000);
  expect(await seconds(stage), 'the paused timer ran').toBe(back);
  for (const page of screens) expect(await bodyText(page)).not.toContain('Цієї гри вже немає');
  await shot(olya, 'restart9b-back-375');
  await shot(stage, 'restart9b-back-stage');
  await shot(host, 'restart9b-back-host');

  // 4. Ведучий продовжує: таймер іде, Петро відповідає, розкриття рахує обох.
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();
  await expect.poll(() => seconds(stage), { timeout: 5000 }).toBeLessThan(back);
  await pickOption(petro, 'Світязь');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await click(host, 'Показати відповідь');
  for (const page of phones) await page.locator('section.result').first().waitFor();
  await olya.getByText('Правильно!').waitFor();
  await petro.getByText('Неправильно').waitFor();
  await expect.poll(scores).toEqual({ Оля: '100', Петро: '0' });

  // 5. Перезавантаження після перезапуску: Петро — тим самим токеном, ведучий — на тому самому пульті.
  await petro.reload();
  await petro.getByText('Неправильно').waitFor();
  expect(await petro.getByLabel('Ваше ім’я', exact).count(), 'Петро got the join form').toBe(0);
  await host.reload();
  // Відхід ведучого (перезавантаження) ставить гру на паузу, як і без перезапуску.
  await host.getByRole('button', { name: 'Продовжити', ...exact }).last().click();
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await expect.poll(scores).toEqual({ Оля: '100', Петро: '0' });

  // 6. Друге запитання й фініш; історія — завершена гра з тими самими балами.
  await click(host, 'Далі');
  await click(host, 'Наступне запитання');
  await afterSplash(stage, ...phones);
  for (const page of phones) {
    await page.locator('h1', { hasText: 'Столиця Франції?' }).waitFor();
    await field(page, 'Ваша відповідь').fill('Париж');
    await click(page, 'Відповісти');
  }
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await click(host, 'Показати відповідь');
  for (const page of phones) await page.getByText('Правильно!').waitFor();
  await expect.poll(scores).toEqual({ Оля: '200', Петро: '100' });
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();

  await host.goto(`${base}/history`);
  const top = host.locator('.quiz-list li').first();
  await top.getByRole('link', { name: 'Перезапуск', ...exact }).waitFor();
  expect(await top.locator('.meta').first().textContent()).toContain('завершено');
  await top.getByRole('link', { name: 'Перезапуск', ...exact }).click();
  const standings = host.locator('.standings li');
  await standings.first().waitFor();
  const table: [string, string][] = [];
  for (let i = 0; i < (await standings.count()); i++) {
    table.push([(await standings.nth(i).locator('.name').textContent())!, (await standings.nth(i).locator('.score').textContent())!]);
  }
  expect(table).toEqual([
    ['Оля', '200'],
    ['Петро', '100'],
  ]);

  // 7. «Цієї гри вже немає» — лише коли сервер справді не знає кімнати: сцена й телефон зі старим токеном.
  let gone = '000000';
  while (ctx.manager.get(gone) !== undefined) gone = String(Number(gone) + 1).padStart(6, '0');
  await stage.goto(stageUrl!.replace(`/stage/${code}`, `/stage/${gone}`));
  await stage.getByText('Цієї гри вже немає', { exact: false }).waitFor();
  await petro.evaluate(([key, token]) => localStorage.setItem(key, token), [`quiz:player:${gone}`, 'stale-token']);
  await petro.goto(`${base}/play/${gone}`);
  await petro.getByText('Цієї гри вже немає', { exact: false }).waitFor();
  expect(await bodyText(petro)).not.toContain('Сервер перезапускається');

  expect(problems).toEqual([]);
}

it('part 9c: a player buys every debuff for a rival with points — prices from the editor, not enough points, one per question, a busy rival, the buyer named on every screen; each debuff is clearly visible on a 375 px phone and the rival still answers; purchases in the history', async () => {
  try {
    await debuffShopGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/**
 * Розкид яскравості (стандартне відхилення luma 0…255) знімка елемента: однотонний «білий екран» дає ~0.
 * Декодування — у самій сторінці (createImageBitmap + canvas), без нових залежностей.
 */
async function lumaSpread(page: Page, selector: string): Promise<number> {
  const png = await page.locator(selector).first().screenshot();
  return (await page.evaluate(`(async () => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(png.toString('base64'))}), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let sum = 0;
    let squares = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += luma;
      squares += luma * luma;
    }
    return Math.sqrt(Math.max(0, squares / n - (sum / n) ** 2));
  })()`)) as number;
}

/**
 * Зсув .debuff-content по x за ~ms, вибірка на кожен кадр (requestAnimationFrame): найбільший |зсув|
 * і частка кадрів у спокої (|зсув| < 0,5 px).
 */
async function shakeSamples(page: Page, ms = 3000): Promise<{ max: number; calm: number }> {
  const xs = (await page.evaluate(`new Promise((done) => {
    const el = document.querySelector('.debuff-content');
    const out = [];
    const end = performance.now() + ${ms};
    const step = () => {
      out.push(parseFloat(getComputedStyle(el).translate) || 0);
      if (performance.now() < end) requestAnimationFrame(step);
      else done(out);
    };
    requestAnimationFrame(step);
  })`)) as number[];
  return { max: Math.max(...xs.map(Math.abs)), calm: xs.filter((x) => Math.abs(x) < 0.5).length / xs.length };
}

/** Частка площі зони, яку вкривають елементи selector (сума площ їхніх перетинів із зоною). */
const COVERED = (selector: string) => `(() => {
  const zone = document.querySelector('.debuff-zone').getBoundingClientRect();
  let area = 0;
  for (const el of document.querySelectorAll(${JSON.stringify(selector)})) {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, zone.right) - Math.max(r.left, zone.left));
    const h = Math.max(0, Math.min(r.bottom, zone.bottom) - Math.max(r.top, zone.top));
    area += w * h;
  }
  return area / (zone.width * zone.height);
})()`;

/** Висота найвищого видимого гостя, що перетинає зону, px; 0 — немає. */
const TALLEST_GUEST = `(() => {
  const zone = document.querySelector('.debuff-zone').getBoundingClientRect();
  let tallest = 0;
  for (const el of document.querySelectorAll('.debuff-guest')) {
    const r = el.getBoundingClientRect();
    const inside = r.right > zone.left && r.left < zone.right && r.bottom > zone.top && r.top < zone.bottom;
    if (inside && Number(getComputedStyle(el).opacity) > 0.5) tallest = Math.max(tallest, r.height);
  }
  return tallest;
})()`;

/** Шапка телефона в один рядок і в межах екрана: кожен її елемент перетинається по вертикалі з кожним. */
const HEADER_ONE_LINE = `(() => {
  const items = [...document.querySelectorAll('header.bar > *')].map((el) => el.getBoundingClientRect()).filter((r) => r.height > 0);
  const header = document.querySelector('header.bar').getBoundingClientRect();
  return Math.max(...items.map((r) => r.top)) < Math.min(...items.map((r) => r.bottom)) && header.right <= innerWidth;
})()`;

const CONTENT_X = `parseFloat(getComputedStyle(document.querySelector('.debuff-content')).translate) || 0`;

async function debuffShopGame() {
  const host = await open('host9c', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host9c@example.com');

  const options = [...single.options, { id: 'd', text: 'Харків' }];
  const questions = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    ...withId(single, `q${n}`),
    options,
    text: `Запитання ${n}: столиця України?`,
    points: 100,
    timeLimit: 30,
  }));
  const data = {
    ...makeRoundsQuiz([classicRound('r1', questions, { speedBonus: false, shuffleOptions: false })], {
      leaderboard: 'each',
      debuffs: ['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud'],
    }),
    title: 'Дебафи',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Редактор: ціни Туману й Тремтіння, решта — плейсхолдер 200.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Дебафи' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('details.powers > summary').click();
  const price = (name: string) => host.locator('.powers-row', { hasText: name }).getByLabel('Ціна, балів', exact);
  await price('Туман').fill('100');
  await price('Тремтіння').fill('150');
  for (const name of ['Заморозка', 'Дзеркало', 'Гості', 'Брудний']) {
    expect(await price(name).inputValue(), name).toBe('');
    expect(await price(name).getAttribute('placeholder'), name).toBe('200');
  }
  await shot(host, 'debuff9c-editor-prices');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'debuff9c-editor-prices-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  await host.locator('.quiz-list li', { hasText: 'Дебафи' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage9c', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya9c', 375, 812);
  const petro = await open('petro9c', 375, 812);
  const ira = await open('ira9c', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const all = [stage, host, olya, petro, ira];

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const rowScore = async (nickname: string) => (await row(nickname).locator('.score').textContent())!;
  const tool = async (nickname: string, kind: 'Бали' | 'Дебаф') => {
    const button = row(nickname).getByRole('button', { name: kind, ...exact });
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await row(nickname).locator('.player-tools').waitFor();
  };
  const give = async (nickname: string, points: number) => {
    await tool(nickname, 'Бали');
    await row(nickname).getByLabel('Своя сума', exact).fill(String(points));
    await row(nickname).getByRole('button', { name: 'Нарахувати', ...exact }).click();
    await expect.poll(() => rowScore(nickname)).toBe(String(points));
  };
  const sheet = (page: Page) => page.getByRole('dialog', { name: 'Дебафи для суперників' });
  const openShop = async (page: Page) => {
    await page.getByRole('button', { name: 'Дебафи', ...exact }).click();
    await sheet(page).waitFor();
  };
  const notice = (page: Page) => page.locator('.live-notice.is-debuff');
  const bought = 'Оля насилає дебаф на гравця Петро';
  /** Покупка в аркуші: дебаф → суперник → «Купити за …»; аркуш закривається, сповіщення в Іри (жертві — ні: банер назве покупця). */
  const buy = async (page: Page, debuff: RegExp, target: string, cost: number) => {
    await openShop(page);
    await sheet(page).locator('.shop-item', { hasText: debuff }).click();
    await sheet(page).locator('.shop-target', { hasText: target }).click();
    await sheet(page).getByRole('button', { name: `Купити за ${cost}`, ...exact }).click();
    await sheet(page).waitFor({ state: 'detached' });
    await notice(ira).getByText(bought, exact).waitFor();
    expect(await notice(petro).count(), 'the victim gets no purchase notice').toBe(0);
  };
  const answer = async (page: Page) => {
    await page.getByRole('button', { name: /Київ/ }).click();
    await page.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
  };
  const everyoneAnswers = async () => {
    await answer(petro);
    await answer(olya);
    await answer(ira);
  };
  const toTable = async () => {
    await click(host, 'Показати відповідь');
    await click(host, 'Далі');
    await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();
  };
  const nextQuestion = async (n: number) => {
    await click(host, 'Наступне запитання');
    await petro.locator('h1', { hasText: `Запитання ${n}:` }).waitFor();
  };

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await host.getByRole('button', { name: 'Почати раунд', ...exact }).waitFor();

  // 1. Без балів: усі шість вимкнені з «Не вистачає балів», ціни 150 / 100 / 200; Escape закриває, фокус на кнопці.
  await openShop(ira);
  const items = sheet(ira).locator('.shop-item');
  expect(await items.count()).toBe(6);
  for (let i = 0; i < 6; i++) {
    expect(await items.nth(i).isDisabled()).toBe(true);
    await items.nth(i).getByText('Не вистачає балів', exact).waitFor();
  }
  expect(await sheet(ira).locator('.shop-item-price').allTextContents()).toEqual(['150', '100', '200', '200', '200', '200']);
  await shot(ira, 'debuff9c-shop-poor-360');
  await expectNoSideScroll(ira, 'debuff9c-shop-poor-360');
  await ira.keyboard.press('Escape');
  await sheet(ira).waitFor({ state: 'detached' });
  expect(await ira.evaluate('document.activeElement?.getAttribute("aria-label")')).toBe('Дебафи');

  // 2–3. Бали Олі від ведучого; покупка Туману для Петра; сповіщення без виду дебафу на кожному екрані.
  await give('Оля', 2000);
  await olya.locator('header.bar .score').getByText('2000', exact).waitFor();
  expect(await olya.evaluate(HEADER_ONE_LINE), 'the phone header wraps at 375').toBe(true);
  await shot(olya, 'debuff9c-header-375');
  await openShop(olya);
  await sheet(olya).locator('.shop-item', { hasText: /Туман/ }).click();
  await sheet(olya).getByText('🌫️ Туман · 100').waitFor();
  await sheet(olya).locator('.shop-target', { hasText: 'Петро' }).click();
  await shot(olya, 'debuff9c-shop-pick-375');
  await expectNoSideScroll(olya, 'debuff9c-shop-pick-375');
  await sheet(olya).getByRole('button', { name: 'Купити за 100', ...exact }).click();
  await sheet(olya).waitFor({ state: 'detached' });
  await olya.locator('header.bar .score').getByText('1900', exact).waitFor();
  for (const page of [stage, host, olya, ira]) {
    await notice(page).getByText(bought, exact).waitFor();
    expect(await notice(page).textContent()).not.toContain('Туман');
  }
  // Жертві сповіщення про покупку немає: її дебаф чекає, а банер, коли спрацює, назве покупця.
  expect(await notice(petro).count(), 'the victim gets no purchase notice').toBe(0);
  await stage.waitForTimeout(300); // сповіщення проявляється 0,25 с
  await shot(stage, 'debuff9c-notice-stage');
  await shot(olya, 'debuff9c-notice-375');
  await expectApart(olya, '.live-notice.is-debuff', ['header.bar'], 'purchase notice 375×812');
  await row('Петро').locator('.debuff-tag').getByText('🌫️ Туман від гравця Оля · чекає', exact).waitFor();
  await tool('Петро', 'Дебаф');
  await row('Петро').getByText('Куплено гравцем — скасувати не можна.', exact).waitFor();
  expect(await host.getByRole('button', { name: 'Скасувати дебаф', ...exact }).count()).toBe(0);
  await shot(host, 'debuff9c-host-row');
  expect(await petro.locator('.debuff-zone').count()).toBe(0);

  // 4. Обмеження: друга покупка Олі в тому ж циклі; Петро вже має дебаф — в Іри він вимкнений.
  await openShop(olya);
  await sheet(olya).getByText('Ви вже купили дебаф до наступного запитання', exact).waitFor();
  for (let i = 0; i < 6; i++) expect(await sheet(olya).locator('.shop-item').nth(i).isDisabled()).toBe(true);
  await olya.keyboard.press('Escape');
  await sheet(olya).waitFor({ state: 'detached' });
  await give('Іра', 300);
  await ira.locator('header.bar .score').getByText('300', exact).waitFor();
  await openShop(ira);
  await sheet(ira).locator('.shop-item', { hasText: /Заморозка/ }).click();
  const petroTarget = sheet(ira).locator('.shop-target', { hasText: 'Петро' });
  expect(await petroTarget.isDisabled()).toBe(true);
  await petroTarget.getByText('Уже має дебаф', exact).waitFor();
  expect(await sheet(ira).locator('.shop-target', { hasText: 'Оля' }).isDisabled()).toBe(false);
  await shot(ira, 'debuff9c-shop-busy-360');
  await ira.keyboard.press('Escape');
  await sheet(ira).waitFor({ state: 'detached' });

  // 5. Туман (Q1): розмито, але не однотонно; протирається; відповідь проходить.
  await click(host, 'Почати раунд');
  await petro.locator('.debuff-zone[data-debuff="fog"]').waitFor();
  await petro.getByText('Оля насилає на вас: Туман', exact).waitFor();
  await afterSplash(...all);
  await olya.locator('.debuff-zone h1', { hasText: 'Запитання 1:' }).waitFor();
  if ((await petro.locator('.debuff-banner').count()) > 0) {
    await expectApart(petro, '.debuff-banner', ['.debuff-zone h1', '.choice'], 'fog banner 375×812');
  }
  const clear = await lumaSpread(olya, '.debuff-zone h1');
  const foggy = await lumaSpread(petro, '.debuff-zone h1');
  console.log(`fog luma spread: ${foggy.toFixed(1)} under fog vs ${clear.toFixed(1)} clear`);
  expect(foggy, `fog spread ${foggy} vs clear ${clear}: a flat wall`).toBeGreaterThan(0.15 * clear);
  expect(foggy, `fog spread ${foggy} vs clear ${clear}: not blurred`).toBeLessThan(0.9 * clear);
  const fogStyle = (await petro.evaluate(`(() => {
    const style = getComputedStyle(document.querySelector('.debuff-fog'));
    return { background: style.backgroundColor, filter: style.backdropFilter || style.webkitBackdropFilter };
  })()`)) as { background: string; filter: string };
  const alpha = /rgba?\(.*[,/]\s*([\d.]+)\)$/.exec(fogStyle.background)?.[1];
  expect(Number(alpha ?? 1), fogStyle.background).toBeLessThanOrEqual(0.4);
  expect(fogStyle.filter).toContain('blur(');
  await shot(petro, 'debuff9c-fog-375');
  const fogZone = (await petro.locator('.debuff-zone').boundingBox())!;
  await wipeWithMouse(
    petro,
    [0.1, 0.3, 0.5, 0.7, 0.9].map((fx) => [fogZone.x + fogZone.width * fx, fogZone.y + fogZone.height * 0.5]),
  );
  await expect.poll(async () => Number(await petro.locator('.debuff-fog').getAttribute('data-cleared'))).toBeGreaterThan(0);
  await petro.waitForTimeout(100);
  await shot(petro, 'debuff9c-fog-wiped-375');
  await answer(petro);
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await expectNoSideScroll(petro, 'debuff9c-fog-answered-375');
  await answer(olya);
  await answer(ira);
  await toTable();

  // 6. Тремтіння (Q2): сильні поштовхи й спокій між ними.
  await buy(olya, /Тремтіння/, 'Петро', 150);
  await nextQuestion(2);
  await petro.locator('.debuff-zone.is-shake').waitFor();
  await petro.getByText('Оля насилає на вас: Тремтіння екрана', exact).waitFor();
  await afterSplash(...all);
  await petro.waitForFunction(`Math.abs(${CONTENT_X}) > 6`, undefined, { timeout: 4000 });
  await shot(petro, 'debuff9c-shake-burst-375');
  const shake = await shakeSamples(petro);
  console.log(`shake samples: ${JSON.stringify(shake)}`);
  expect(shake.max, `shake ${JSON.stringify(shake)}`).toBeGreaterThanOrEqual(10);
  expect(shake.calm, `shake ${JSON.stringify(shake)}`).toBeGreaterThanOrEqual(0.5);
  // Кадр і відповідь у спокої між поштовхами.
  await petro.waitForFunction(`${CONTENT_X} === 0`);
  await shot(petro, 'debuff9c-shake-375');
  await answer(petro);
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await answer(olya);
  await answer(ira);
  await toTable();

  // 7. Заморозка (Q3): лід на всю зону, відповісти не можна; до 5,5 с лід тане, і відповідь проходить.
  await buy(olya, /Заморозка/, 'Петро', 200);
  await nextQuestion(3);
  // Лід тане через 5 с від кінця заставки «Запитання 3» (since = startedAt), а не від її появи.
  await afterSplash(petro);
  await petro.locator('.debuff-ice').waitFor();
  const kyiv = petro.getByRole('button', { name: /Київ/ });
  expect(await kyiv.isDisabled()).toBe(true);
  expect(await petro.evaluate(COVERED('.debuff-ice'))).toBeGreaterThanOrEqual(0.9);
  await shot(petro, 'debuff9c-freeze-375');
  await petro.locator('fieldset.debuff-content:not([disabled])').waitFor({ timeout: 5500 });
  expect(await kyiv.isDisabled()).toBe(false);
  await shot(petro, 'debuff9c-freeze-thawed-375');
  await answer(petro);
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await answer(olya);
  await answer(ira);
  await toTable();

  // 8. Дзеркало (Q4) на 375×667: банер жертви й сповіщення про бали — одне над одним, остання відповідь видна; перевернуто, але відповісти можна.
  await buy(olya, /Дзеркало/, 'Петро', 200);
  await petro.setViewportSize({ width: 375, height: 667 });
  await tool('Петро', 'Бали');
  await nextQuestion(4);
  await petro.locator('.debuff-banner').waitFor();
  await row('Петро').getByRole('button', { name: '+100', ...exact }).click();
  await petro.locator('.live-notice').waitFor();
  await petro.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  const victim = (await petro.evaluate(`(() => {
    const box = (element) => {
      if (element === null) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const choices = [...document.querySelectorAll('.choice')];
    return {
      banner: box(document.querySelector('.debuff-banner')),
      notices: [...document.querySelectorAll('.live-notice')].map(box),
      content: Math.max(...choices.map((element) => element.getBoundingClientRect().bottom)),
    };
  })()`)) as { banner: Box | null; notices: Box[]; content: number };
  console.log(`victim stack 375×667: ${JSON.stringify(victim)}`);
  await shot(petro, 'debuff9c-victim-notice-375x667');
  expect(victim.banner, 'the debuff banner was gone before the check (3 s)').not.toBeNull();
  expect(victim.notices.length).toBe(1);
  const [pointsNotice] = victim.notices as [Box];
  expect(overlaps(pointsNotice, victim.banner!), 'the notice covers the banner').toBe(false);
  expect(pointsNotice.y + pointsNotice.height <= victim.banner!.y + 0.5, 'the notice is above the banner').toBe(true);
  expect(victim.content <= pointsNotice.y + 0.5, 'the last answer is under the notice').toBe(true);
  await petro.setViewportSize({ width: 375, height: 812 });
  await petro.locator('.debuff-zone.is-mirror').waitFor();
  await afterSplash(...all);
  expect(await petro.evaluate(`getComputedStyle(document.querySelector('.debuff-content')).transform`)).toMatch(/^matrix\(-1/);
  await shot(petro, 'debuff9c-mirror-375');
  await everyoneAnswers();
  await toTable();

  // 9. Гості (Q5): великі, видно протягом 2 с; дотик крізь гостя проходить.
  await buy(olya, /Гості/, 'Петро', 200);
  await nextQuestion(5);
  await petro.locator('.debuff-zone.is-guests').waitFor();
  await afterSplash(...all);
  expect(await petro.locator('.debuff-guest').count()).toBe(5);
  await expect.poll(async () => (await petro.evaluate(TALLEST_GUEST)) as number, { timeout: 2000, interval: 100 }).toBeGreaterThanOrEqual(70);
  await shot(petro, 'debuff9c-guests-375');
  await everyoneAnswers();
  await toTable();

  // 10. Бруд (Q6): шість великих плям, протирання зменшує їх.
  await buy(olya, /Брудний/, 'Петро', 200);
  await nextQuestion(6);
  await petro.locator('.debuff-splat').nth(5).waitFor();
  await afterSplash(...all);
  expect(await petro.locator('.debuff-splat').count()).toBe(6);
  expect(await petro.evaluate(COVERED('.debuff-splat'))).toBeGreaterThanOrEqual(0.25);
  await shot(petro, 'debuff9c-mud-375');
  const mudLeft = async () =>
    ((await petro.evaluate(`[...document.querySelectorAll('.debuff-splat')].map((el) => Number(el.style.opacity))`)) as number[]).reduce(
      (a, b) => a + b,
      0,
    );
  const mudBefore = await mudLeft();
  const splat = (await petro.locator('.debuff-splat').first().boundingBox())!;
  await wipeWithMouse(
    petro,
    Array.from({ length: 4 }, (_, i) => [splat.x + splat.width / 2 + (i % 2 === 0 ? -2 : 2), splat.y + splat.height / 2]),
  );
  await expect.poll(mudLeft).toBeLessThan(mudBefore);
  await petro.waitForTimeout(250);
  await shot(petro, 'debuff9c-mud-wiped-375');
  await answer(petro);
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await expectNoSideScroll(petro, 'debuff9c-mud-answered-375');
  await answer(olya);
  await answer(ira);
  await toTable();

  // 11. Q7 без дебафу; рахунок Олі: 2000 + 7 × 100 − (100 + 150 + 4 × 200) = 1650 — шапка, пульт і сцена.
  await nextQuestion(7);
  expect(await petro.locator('.debuff-zone').getAttribute('data-debuff')).toBeNull();
  await everyoneAnswers();
  await click(host, 'Показати відповідь');
  await olya.getByText('Правильно!').waitFor();
  await olya.locator('header.bar .score').getByText('1650', exact).waitFor();
  expect(await rowScore('Оля')).toBe('1650');
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const standing = stage.locator('.standings li', { hasText: 'Оля' });
  await standing.waitFor();
  expect(await standing.locator('.score').textContent()).toBe('1650');

  // 12. Історія: шість рядків покупок.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Дебафи/ }).click();
  await host.getByText('Оля купує 🌫️ Туман для гравця Петро: −100', exact).waitFor();
  await host.getByText('Оля купує 📳 Тремтіння екрана для гравця Петро: −150', exact).waitFor();
  expect(await host.getByText(/^Оля купує .+ для гравця Петро: −200$/).count()).toBe(4);
  await shot(host, 'debuff9c-history');

  expect(problems).toEqual([]);
}

it('part 9d: spares of a board category — the editor adds a spare to a category and warns about an empty one, swap on a board cell takes a spare of the same category, an empty category explains why swap is off, a classic round keeps the global pool, category spares in the history', async () => {
  try {
    await categorySparesGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function categorySparesGame() {
  const host = await open('host9d', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host9d@example.com');

  const base9d = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
  const warmup = {
    ...base9d,
    id: 'q1',
    type: 'single' as const,
    text: 'Розминка: столиця України?',
    options: ['Київ', 'Львів', 'Одеса'].map((text, at) => ({ id: `q1o${at}`, text })),
    correctId: 'q1o0',
  };
  const cellQ = (category: string, price: number) => ({
    ...withPoints(withId(single, `b-${category}-${price}`), price),
    text: `${category} ${price}: столиця України?`,
  });
  const sportSpares = [
    { ...base9d, id: 'sp1', type: 'boolean' as const, text: 'Футбольний м’яч — круглий?', correct: true },
    { ...base9d, id: 'sp2', type: 'numeric' as const, text: 'Скільки гравців у волейбольній команді на майданчику?', correct: 6, tolerance: 0 },
  ];
  const rounds = [
    classicRound('r1', [warmup], { title: 'Розминка', speedBonus: false }),
    boardRound(
      'r2',
      ['Спорт', 'Міста', 'Річки'].map((title) => ({
        title,
        cells: [100, 200, 300].map((price) => cellQ(title, price)),
        ...(title === 'Спорт' ? { spares: sportSpares } : {}),
      })),
      { title: 'Поле', answerMode: 'phone', check: 'auto' },
    ),
  ];
  const spares = [{ ...base9d, id: 'g1', type: 'text' as const, text: 'Яке місто стоїть на Пруті?', accepted: ['Чернівці'] }];
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end', buffs: ['swap'] }), spares, title: 'Запасні 9d' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Редактор: попередження про категорії без запасних; запасне для «Міста»; збереження не блокується.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Запасні 9d' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('details.powers > summary').click();
  const buffGroup = host.locator('fieldset.powers-group').nth(1);
  const warns = () => buffGroup.locator('.powers-warn').allTextContents();
  await buffGroup
    .locator('.powers-warn')
    .getByText('Заміна запитання: немає запасних у категоріях: Поле · Міста, Поле · Річки — на їхніх клітинках заміни не буде.', exact)
    .waitFor();
  expect(await warns()).not.toContain('Заміна запитання: додайте запасні запитання');
  await host.locator('.round-tabs').getByRole('button', { name: 'Поле', ...exact }).click();
  await host.getByRole('button', { name: /^Категорія 2, клітинка 1: 100/ }).click();
  const citySpares = host.locator('section.category-spares');
  await citySpares.getByRole('heading', { name: /^Запасні категорії «Міста»/ }).waitFor();
  await citySpares.getByText('Немає запасних: на клітинках цієї категорії заміна буде недоступна.', exact).waitFor();
  await citySpares.scrollIntoViewIfNeeded();
  await shot(host, 'spares9d-editor-empty');
  await citySpares.getByRole('button', { name: 'Додати запасне', ...exact }).click();
  await citySpares.getByRole('button', { name: 'так чи ні', ...exact }).click();
  await citySpares.locator('.question-field textarea').fill('Львів — обласний центр?');
  await citySpares.getByRole('button', { name: 'Правильна відповідь: Так', ...exact }).click();
  await citySpares.getByRole('button', { name: 'Запасне 1 · так чи ні', ...exact }).waitFor();
  expect(await citySpares.getByText('Немає запасних: на клітинках цієї категорії заміна буде недоступна.', exact).count()).toBe(0);
  const badge = host.locator('.board-column').nth(1).locator('.board-edit-spares');
  expect(await badge.textContent()).toBe('⇄ 1');
  expect(await badge.getAttribute('aria-label')).toBe('Запасних: 1');
  expect(await host.locator('.board-column').nth(0).locator('.board-edit-spares').textContent()).toBe('⇄ 2');
  expect(await host.locator('.board-column').nth(2).locator('.board-edit-spares').count()).toBe(0);
  await expect.poll(warns).toContain('Заміна запитання: немає запасних у категоріях: Поле · Річки — на їхніх клітинках заміни не буде.');
  await shot(host, 'spares9d-editor-category');
  await host.setViewportSize({ width: 375, height: 812 });
  await citySpares.scrollIntoViewIfNeeded();
  await shot(host, 'spares9d-editor-category-375');
  await expectNoSideScroll(host, 'spares9d-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // 2. Гра: сцена 1600 × 900, три телефони 375 × 812; черга поля — Оля, Петро, Іра.
  await host.locator('.quiz-list li', { hasText: 'Запасні 9d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage9d', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya9d', 375, 812);
  const petro = await open('petro9d', 375, 812);
  const ira = await open('ira9d', 375, 812);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];
  const all = [stage, ...phones];
  const cell = (page: Page, category: string, price: number) => page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };
  const pick = async (page: Page, category: string, price: number) => {
    await page.getByText('Ваш хід: виберіть клітинку').waitFor();
    await cell(page, category, price).click();
    await afterSplash(...all);
    for (const each of all) await each.locator('h1', { hasText: `${category} ${price}` }).waitFor();
  };

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 3. Класика — загальний пул.
  for (const page of phones) await page.locator('h1', { hasText: 'Розминка: столиця України?' }).waitFor();
  await takeBuff(ira, 'Заміна запитання');
  await ira.locator('h1', { hasText: 'Яке місто стоїть на Пруті?' }).waitFor();
  await textAnswer(ira, 'Чернівці');
  await ira.getByText('Відповідь прийнято', exact).waitFor();
  await pickOption(olya, 'Київ');
  await pickOption(petro, 'Київ');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await click(host, 'Показати відповідь');
  for (const page of phones) await page.locator('section.result').first().waitFor();
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await afterSplash(...all);
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 4. «Спорт» — запасне Спорту, не загальне.
  await pick(olya, 'Спорт', 100);
  await takeBuff(olya, 'Заміна запитання');
  for (const page of all) await page.locator('h1', { hasText: 'Футбольний м’яч — круглий?' }).waitFor();
  for (const page of all) expect(await page.content()).not.toContain('Яке місто стоїть на Пруті?');
  await stage.locator('.stage-buffs li').getByText('⇄ Оля: запасне запитання', exact).waitFor();
  await shot(olya, 'spares9d-board-swap-375');
  await shot(stage, 'spares9d-board-swap-stage');
  await expectNoSideScroll(olya, 'spares9d-board-swap-375');
  await click(olya, 'Так');
  await click(host, 'Прийняти');
  await olya.getByText('Правильно!').waitFor();
  await toBoard();

  // 5. «Річки» — запасних немає: кнопка неактивна з причиною; «?» каже про категорію.
  await pick(petro, 'Річки', 100);
  await tapBuff(petro, 'Заміна запитання', 'У цій категорії немає запасних запитань.');
  expect(await buffButton(petro, 'Заміна запитання').getAttribute('aria-disabled')).toBe('true');
  await shot(petro, 'spares9d-swap-off-375');
  await expectNoSideScroll(petro, 'spares9d-swap-off-375');
  await petro.getByRole('button', { name: 'Що роблять бафи', ...exact }).click();
  const help = petro.locator('.buff-help-sheet');
  await help.getByRole('heading', { name: 'Бафи', ...exact }).waitFor();
  await help.locator('.buff-where').getByText('Де: класика й поле у свій хід. На полі — запасне з тієї ж категорії.', exact).waitFor();
  await shot(petro, 'spares9d-help-375');
  await expectNoSideScroll(petro, 'spares9d-help-375');
  await petro.keyboard.press('Escape');
  await help.waitFor({ state: 'detached' });
  await pickOption(petro, 'Київ');
  await click(host, 'Прийняти');
  await petro.getByText('Правильно!').waitFor();
  await toBoard();

  // 6. Іра вже використала заміну в класиці.
  await pick(ira, 'Міста', 100);
  await tapBuff(ira, 'Заміна запитання', 'Уже використано.');
  await pickOption(ira, 'Київ');
  await click(host, 'Прийняти');
  await ira.getByText('Правильно!').waitFor();
  await toBoard();

  // 7. Друге коло починає Петро: «Міста» — запасне з редактора, не Спорту й не загальне.
  await pick(petro, 'Міста', 200);
  await takeBuff(petro, 'Заміна запитання');
  for (const page of all) await page.locator('h1', { hasText: 'Львів — обласний центр?' }).waitFor();
  for (const page of all) {
    const html = await page.content();
    expect(html).not.toContain('Скільки гравців у волейбольній');
    expect(html).not.toContain('Яке місто стоїть на Пруті?');
  }
  await shot(petro, 'spares9d-board-swap-cities-375');
  await click(petro, 'Так');
  await click(host, 'Прийняти');
  await petro.getByText('Правильно!').waitFor();

  // 8. Історія: три запасні — загальне в класиці й два категорійні на полі.
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Запасні 9d/ }).click();
  await host.locator('.standings li').first().waitFor();
  await host.evaluate("document.querySelectorAll('details.responses').forEach((d) => { d.open = true; })");
  const line = (question: string, nickname: string) =>
    host
      .locator('.rows.stacked > li', { hasText: question })
      .locator('details.responses li', { has: host.locator('.responses-name', { hasText: nickname }) });
  expect(await line('Розминка: столиця', 'Іра').locator('.spare-text').textContent()).toBe('Запасне: Яке місто стоїть на Пруті?');
  expect(await line('Спорт 100', 'Оля').locator('.spare-text').textContent()).toBe('Запасне: Футбольний м’яч — круглий?');
  expect(await line('Міста 200', 'Петро').locator('.spare-text').textContent()).toBe('Запасне: Львів — обласний центр?');
  await shot(host, 'spares9d-history');

  expect(problems).toEqual([]);
}

it('part 10a: host help — ⓘ in the editor for a setting, a buff, a blitz cell and a round type, a sheet on a phone, reading help leaves the quiz unchanged; the reference with topics, search and an anchor; ⓘ on the host console that never stops the game', async () => {
  try {
    await hostHelpGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function hostHelpGame() {
  const host = await open('host10a', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host10a@example.com');

  const warmup = {
    imageUrl: null,
    video: null,
    timeLimit: 30,
    points: 100,
    id: 'q1',
    type: 'single' as const,
    text: 'Столиця України?',
    options: ['Київ', 'Львів', 'Одеса'].map((text, at) => ({ id: `q1o${at}`, text })),
    correctId: 'q1o0',
  };
  const cellQ = (category: string, price: number) => ({
    ...withPoints(withId(single, `b-${category}-${price}`), price),
    text: `${category} ${price}: столиця України?`,
  });
  const cells = (title: string) =>
    [100, 200, 300].map((price) => {
      const question = cellQ(title, price);
      if (title === 'Міста' && price === 100) return { kind: 'blitz' as const, question };
      if (title === 'Річки' && price === 100) return { answerMode: 'voice' as const, question };
      if (title === 'Гори' && price === 300) return { mark: 'x2' as const, question };
      return question;
    });
  const rounds = [
    classicRound('r1', [warmup], { title: 'Розминка', speedBonus: true }),
    boardRound(
      'r2',
      ['Міста', 'Річки', 'Гори'].map((title) => ({ title, cells: cells(title) })),
      { title: 'Поле', answerMode: 'phone', check: 'auto' },
    ),
  ];
  const spares = [{ ...warmup, id: 'g1', type: 'text' as const, text: 'Яке місто стоїть на Пруті?', accepted: ['Чернівці'] }];
  const data = {
    ...makeRoundsQuiz(rounds, { leaderboard: 'end', buffs: ['fifty', 'double', 'retry', 'time', 'shield', 'audience', 'hint', 'swap'] }),
    spares,
    title: 'Довідка 10a',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Діалоги підтвердження (вихід зі зміненого редактора) не мають з'являтися.
  const dialogs: string[] = [];
  host.on('dialog', (dialog) => dialogs.push(dialog.message()));

  // 1. Список вікторин.
  await host.goto(`${base}/quizzes`);
  expect(await host.getByRole('link', { name: 'Довідка ведучого', ...exact }).getAttribute('href')).toBe('/help');

  // 2. Редактор.
  await host.locator('.quiz-list li', { hasText: 'Довідка 10a' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  expect(await host.locator('main.editor').getByRole('link', { name: 'Довідка ведучого', ...exact }).getAttribute('target')).toBe('_blank');
  const dialog = (name: string) => host.getByRole('dialog', { name, ...exact });

  await host.locator('details.rules').first().locator('summary').click();
  await host.getByRole('button', { name: 'Довідка: Показувати рейтинг', ...exact }).click();
  await dialog('Показувати рейтинг').waitFor();
  await dialog('Показувати рейтинг').getByText(/Лише в кінці гри/).first().waitFor();
  await shot(host, 'help10a-editor-setting');
  await host.keyboard.press('Escape');
  await dialog('Показувати рейтинг').waitFor({ state: 'detached' });
  expect(await host.evaluate("document.activeElement?.getAttribute('aria-label')")).toBe('Довідка: Показувати рейтинг');

  await host.locator('details.powers > summary').click();
  await host.getByRole('button', { name: 'Довідка: Заміна запитання', ...exact }).click();
  const buffDialog = dialog('Заміна запитання');
  await buffDialog.waitFor();
  for (const heading of ['Що це', 'Як іде в грі', 'Бали', 'Порада', 'Обмеження']) {
    await buffDialog.getByRole('heading', { name: heading, ...exact }).waitFor();
  }
  expect(await buffDialog.getByRole('link', { name: 'Усі пояснення' }).getAttribute('href')).toBe('/help#help-buff-swap');
  await shot(host, 'help10a-editor-buff');
  await host.keyboard.press('Escape');
  await buffDialog.waitFor({ state: 'detached' });

  await host.locator('.round-tabs').getByRole('button', { name: 'Поле', ...exact }).click();
  await host.getByRole('button', { name: /^Категорія 1, клітинка 1: 100 бліц/ }).click();
  await host.getByRole('button', { name: 'Довідка: Бліц-клітинка', ...exact }).first().click();
  await dialog('Бліц-клітинка').getByText(/Мінус для всіх/).first().waitFor();
  await shot(host, 'help10a-editor-cell');
  await host.keyboard.press('Escape');
  await dialog('Бліц-клітинка').waitFor({ state: 'detached' });

  await click(host, '+ Раунд');
  await host.getByRole('button', { name: 'Довідка: Фінал', ...exact }).click();
  await dialog('Фінал').waitFor();
  await shot(host, 'help10a-editor-round');
  await dialog('Фінал').getByRole('button', { name: 'Закрити', ...exact }).click();
  await dialog('Фінал').waitFor({ state: 'detached' });

  await host.setViewportSize({ width: 375, height: 812 });
  await host.locator('.round-tabs').getByRole('button', { name: 'Розминка', ...exact }).click();
  await host.getByRole('button', { name: 'Довідка: Один правильний варіант', ...exact }).click();
  const sheet = dialog('Один правильний варіант');
  await sheet.waitFor();
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(375);
  // На телефоні аркуш висить зверху (до половини екрана) і лишає нижню частину доступною.
  expect(box.y).toBeLessThanOrEqual(1);
  expect(box.height).toBeLessThanOrEqual(812 / 2 + 1);
  await sheet.getByRole('button', { name: 'Закрити', ...exact }).waitFor();
  await shot(host, 'help10a-editor-sheet-375');
  await expectNoSideScroll(host, 'help10a-editor-375');
  await host.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  await host.setViewportSize({ width: 1280, height: 900 });

  await click(host, 'Скасувати');
  await host.waitForURL(/\/quizzes$/);
  expect(dialogs).toEqual([]);

  // 3. Довідник.
  await host.goto(`${base}/help`);
  await host.getByRole('heading', { level: 1, name: 'Довідка ведучого', ...exact }).waitFor();
  expect(await host.locator('h2').allTextContents()).toEqual(['Раунди', 'Типи запитань', 'Клітинки поля', 'Бафи', 'Дебафи', 'Налаштування']);
  await shot(host, 'help10a-reference');
  const search = host.getByLabel('Пошук за назвою', exact);
  await search.fill('щит');
  await expect.poll(() => host.locator('h3:visible').allTextContents()).toEqual(['🛡 Щит']);
  await shot(host, 'help10a-reference-search');
  await search.fill('зззз');
  await host.getByText('Нічого не знайдено.', exact).waitFor();
  await search.fill('');
  await host.goto(`${base}/help#help-buff-swap`);
  const target = host.locator('article#help-buff-swap');
  await target.waitFor();
  expect(await target.getAttribute('class')).toContain('is-target');
  await expect.poll(async () => (await target.boundingBox())!.y).toBeLessThan(900);
  await host.setViewportSize({ width: 375, height: 812 });
  await host.goto(`${base}/help`);
  await host.getByRole('heading', { level: 1, name: 'Довідка ведучого', ...exact }).waitFor();
  await expectNoSideScroll(host, 'help10a-reference-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  // 4. Пульт.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Довідка 10a' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const helpLink = host.getByRole('link', { name: 'Довідка ведучого', ...exact });
  expect(await helpLink.getAttribute('href')).toBe('/help');
  expect(await helpLink.getAttribute('target')).toBe('_blank');
  const olya = await open('olya10a', 375, 812);
  await join(olya, code, 'Оля', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olya);
  await host.getByRole('button', { name: 'Довідка: Класичний', ...exact }).waitFor();
  await click(host, 'Почати раунд');
  await afterSplash(host, olya);

  const context = host.locator('.host-context');
  await expect.poll(() => context.textContent()).toContain('Розминка');
  expect(await context.textContent()).toContain('Один правильний варіант');
  await host.getByRole('button', { name: 'Довідка: Один правильний варіант', ...exact }).click();
  await dialog('Один правильний варіант').waitFor();
  await shot(host, 'help10a-host-popover');
  const before = await seconds(host);
  await host.waitForTimeout(1500);
  expect(await seconds(host)).toBeLessThan(before);
  expect(await host.locator('p.banner[role="status"]', { hasText: 'Пауза' }).count()).toBe(0);
  await click(host, 'Пауза');
  await host.locator('p.banner[role="status"]', { hasText: 'Пауза' }).waitFor();
  await click(host, 'Продовжити');
  await host.locator('p.banner[role="status"]', { hasText: 'Пауза' }).waitFor({ state: 'detached' });

  await olya.getByRole('button', { name: /Київ/ }).click();
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await dialog('Один правильний варіант').waitFor({ state: 'detached' });
  await host.getByText(/Правильна відповідь: .*Київ/).first().waitFor();
  await shot(host, 'help10a-host-reveal');

  expect(problems).toEqual([]);
}

it('part 10b: slider, audio and revealing picture — the editor builds them, the host plays a clip without a stage, the stage plays and obeys replay/stop, the timer waits for a long clip, the slider scale on the reveal, the picture sharpens with time and pays less later', async () => {
  try {
    await sliderAudioRevealGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Секунда тиші MP3 (кадри MPEG-1 Layer III з нульовими даними): Chromium її декодує. */
function silentMp3(frames = 38): Buffer {
  return Buffer.concat(Array.from({ length: frames }, () => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)])));
}

/** Стадія проявлення картинки на сторінці (data-stage). */
const revealStageOf = async (page: Page) => Number(await page.locator('[data-stage]').first().getAttribute('data-stage'));

/** Бали гравця за запитання з рядка відповідей пульта. */
async function scoreOf(host: Page, nickname: string): Promise<number> {
  const text = await host.locator('li', { hasText: nickname }).locator('.score').first().textContent();
  return Number(text!.replace(/[^\d-]/g, ''));
}

/** «Далі» з розкриття до наступного запитання (через проміжні кроки, якщо вони є). */
async function toNextQuestion(host: Page) {
  await click(host, 'Далі');
  const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
  await next.waitFor({ timeout: 3000 }).then(() => next.click(), () => undefined);
}

async function sliderAudioRevealGame() {
  const host = await open('host10b', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10b@example.com');
  const img = ((await (await host.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } })).json()) as { url: string }).url;

  const common = { imageUrl: null, video: null, points: 1000 };
  const options = (id: string, right: string, wrong: string) => [
    { id: `${id}o0`, text: right },
    { id: `${id}o1`, text: wrong },
  ];
  const questions = [
    { ...common, id: 'a1', type: 'single' as const, text: 'Що це за звук?', options: options('a1', 'Тиша', 'Дзвін'), correctId: 'a1o0', timeLimit: 20 },
    {
      ...common,
      id: 's1',
      type: 'slider' as const,
      text: 'Скільки відсотків поверхні Землі вкриває вода?',
      min: 0,
      max: 100,
      step: 1,
      correct: 71,
      tolerance: 2,
      zeroBeyond: 12,
      unit: '%',
      timeLimit: 30,
    },
    {
      ...common,
      id: 'y1',
      type: 'single' as const,
      text: 'Назвіть гурт',
      options: options('y1', 'Queen', 'ABBA'),
      correctId: 'y1o0',
      timeLimit: 5,
      audio: { source: 'youtube' as const, id: 'fJ9rUzIMcZQ', start: 0, duration: 8 },
    },
    { ...common, id: 'p1', type: 'text' as const, text: 'Що на картинці?', accepted: ['Коло', 'Жовте коло'], imageUrl: img, reveal: 'pixels' as const, timeLimit: 12 },
  ];
  const data = {
    ...makeRoundsQuiz([classicRound('r1', questions as never, { title: 'Звуки й картинки', speedBonus: true })]),
    title: 'Звуки й картинки 10b',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Звуки й картинки 10b' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();

  await host.getByRole('button', { name: /^Запитання 1 / }).click();
  await host.locator('.audio-field input[type=file]').setInputFiles({ name: 'silence.mp3', mimeType: 'audio/mpeg', buffer: silentMp3() });
  await host.getByText('Аудіофайл', exact).first().waitFor();
  await field(host, 'Початок, с').waitFor();
  const duration = field(host, 'Тривалість, с');
  await duration.waitFor();
  expect(Number(await duration.inputValue())).toBeLessThanOrEqual(15);
  await duration.fill('2');
  await host.getByText('Таймер іде разом зі звуком.', exact).waitFor();
  await shot(host, 'p10b-editor-audio');

  await host.getByRole('button', { name: /^Запитання 2 / }).click();
  await field(host, 'Мінімум').waitFor();
  expect(await field(host, 'Мінімум').inputValue()).toBe('0');
  expect(await field(host, 'Максимум').inputValue()).toBe('100');
  expect(await field(host, 'Правильне значення').inputValue()).toBe('71');
  expect(await field(host, 'Нуль балів далі ніж ±').inputValue()).toBe('12');
  await shot(host, 'p10b-editor-slider');
  await field(host, 'Мінімум').fill('100');
  await click(host, 'Зберегти');
  await host.locator('ul.problems').getByText('повзунок — перевірте мінімум, максимум і крок', { exact: false }).waitFor();
  await field(host, 'Мінімум').fill('0');

  await host.getByRole('button', { name: /^Запитання 4 / }).click();
  const pixels = host.getByRole('button', { name: 'З пікселів', ...exact });
  await pixels.waitFor();
  expect(await pixels.getAttribute('aria-pressed')).toBe('true');
  await shot(host, 'p10b-editor-reveal');

  await host.getByRole('button', { name: /^Запитання 3 / }).click();
  await host.getByText('YouTube — лише звук', { exact: false }).first().waitFor();
  await host.getByText('Фрагмент 8 с довший за час 5 с: таймер стартує після фрагмента (разом 13 с).', exact).waitFor();

  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'p10b-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { questions: { id: string; audio?: { source: string; url?: string; duration: number } }[] }[] };
  const audio = stored.rounds[0]!.questions.find((question) => question.id === 'a1')!.audio!;
  expect(audio.source).toBe('file');
  expect(audio.url).toMatch(/^\/uploads\/[0-9a-f]+\.mp3$/);
  expect(audio.duration).toBe(2);

  // 2. Гра без сцени.
  await host.locator('.quiz-list li', { hasText: 'Звуки й картинки 10b' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const olya = await open('olya10b', 375, 812);
  const petro = await open('petro10b', 375, 812);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olya, petro);
  await click(host, 'Почати раунд');
  await afterSplash(host, olya, petro);

  await host.getByText('🎵 Сцена не відкрита — звук грає тут', exact).waitFor();
  const unlock = host.getByRole('button', { name: '🔊 Увімкнути звук', ...exact });
  if (await unlock.isVisible()) await unlock.click();
  await expect.poll(() => host.locator('[data-plays]').getAttribute('data-plays'), POLL).toBe('1');
  await shot(host, 'p10b-audio-host-local');
  await click(host, 'Програти ще раз');
  await expect.poll(() => host.locator('[data-plays]').getAttribute('data-plays'), POLL).toBe('2');
  for (const phone of [olya, petro]) expect(await phone.locator('audio, .audio-card, .audio-only-frame, iframe').count()).toBe(0);
  await olya.getByRole('button', { name: /Тиша/ }).click();
  await petro.getByRole('button', { name: /Дзвін/ }).click();
  await click(host, 'Показати відповідь');
  await toNextQuestion(host);
  await afterSplash(host, olya, petro);

  // 3. Сцена й повзунок.
  const stage = await open('stage10b', 1280, 720);
  await stage.goto(stageUrl);
  await stage.getByText('Тягніть повзунок на телефоні: від 0 до 100 %', exact).waitFor();
  await expect.poll(() => olya.locator('.slider-value').textContent(), POLL).toMatch(/^50\s*%$/);
  for (let i = 0; i < 3; i++) await olya.getByRole('button', { name: 'Більше на 1', ...exact }).click();
  await expect.poll(() => olya.locator('.slider-value').textContent(), POLL).toMatch(/^53\s*%$/);
  await olya.getByRole('slider', { name: 'Повзунок', ...exact }).fill('70');
  await expect.poll(() => olya.locator('.slider-value').textContent(), POLL).toMatch(/^70\s*%$/);
  await shot(olya, 'p10b-phone-slider');
  await expectNoSideScroll(olya, 'p10b-phone-slider');
  await click(olya, 'Відповісти');
  await petro.getByRole('slider', { name: 'Повзунок', ...exact }).fill('80');
  await click(petro, 'Відповісти');
  await click(host, 'Показати відповідь');
  const scale = stage.locator('.slider-scale');
  await scale.waitFor();
  await scale.getByRole('img', { name: 'Оля: 70 %', ...exact }).first().waitFor({ state: 'attached' });
  await scale.getByRole('img', { name: 'Петро: 80 %', ...exact }).first().waitFor({ state: 'attached' });
  await scale.getByText('71 %', exact).first().waitFor();
  await shot(stage, 'p10b-stage-scale');
  await olya.getByText(/Твоя відповідь: 70\s*% · правильна: 71\s*% \(± 2\)/).first().waitFor();
  const olyaScore = await scoreOf(host, 'Оля');
  const petroScore = await scoreOf(host, 'Петро');
  expect(olyaScore).toBeGreaterThan(0);
  expect(petroScore).toBeGreaterThan(0);
  expect(petroScore).toBeLessThan(olyaScore);
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 4. Аудіо з YouTube, довгий фрагмент.
  const stageUnlock = stage.getByRole('button', { name: '🔊 Увімкнути звук', ...exact });
  if (await stageUnlock.isVisible()) await stageUnlock.click();
  await expect.poll(() => stage.locator('[data-plays]').getAttribute('data-plays'), POLL).toBe('1');
  expect(await stage.locator('.audio-only-frame').getAttribute('aria-hidden')).toBe('true');
  await stage.getByText('🎵 Слухайте', exact).first().waitFor();
  await shot(stage, 'p10b-audio-stage-listening');
  await host.getByText('🎵 Звук грає на сцені', exact).waitFor();
  expect(await host.locator('[data-plays]').count()).toBe(0);
  await click(host, 'Програти ще раз');
  await expect.poll(() => stage.locator('[data-plays]').getAttribute('data-plays'), POLL).toBe('2');
  await click(host, 'Стоп');
  await expect.poll(() => stage.locator('[data-plays]').getAttribute('data-state'), POLL).toBe('stopped');
  await shot(host, 'p10b-audio-host-controls');
  await stage.waitForTimeout(1000);
  expect(await seconds(stage)).toBe(5);
  await olya.getByRole('button', { name: /Queen/ }).click();
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  // Запитання з проявленням відкривається не раніше цієї миті й не пізніше, ніж зникне заставка:
  // очікувана стадія виводиться з виміряного часу, а не з припущень про швидкість машини.
  const revealOpenedAfter = Date.now();
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);
  const revealOpenedBy = Date.now();
  const REVEAL_WINDOW_MS = 12_000;
  const stageAt = (ms: number) => Math.floor((Math.max(0, ms) / REVEAL_WINDOW_MS) * 10);
  /** Стадія на сторінці в межах того, що дозволяє виміряний час (± 1 на округлення й годинники). */
  const expectRevealStage = async (page: Page) => {
    const at = Date.now();
    const shown = await revealStageOf(page);
    const after = Date.now();
    expect(shown).toBeGreaterThanOrEqual(Math.max(0, stageAt(at - revealOpenedBy) - 1));
    expect(shown).toBeLessThanOrEqual(Math.min(9, stageAt(after - revealOpenedAfter) + 1));
    return shown;
  };

  // 5. Картинка, що проявляється.
  await expectRevealStage(stage);
  await shot(stage, 'p10b-reveal-stage-early');
  await petro.getByText('Картинка проявляється: що раніше відповіси, то більше балів.').waitFor();
  await olya.waitForTimeout(1000);
  await field(olya, 'Ваша відповідь').fill('Коло');
  await click(olya, 'Відповісти');
  const olyaAnsweredBy = Date.now();
  await olya.waitForTimeout(6000);
  // Хто вже відповів, бачить стадію за часом, а не повну картинку.
  await expectRevealStage(olya);
  await shot(olya, 'p10b-reveal-phone-mid');
  await field(petro, 'Ваша відповідь').fill('Квадрат');
  await click(petro, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  await expect
    .poll(async () => (await stage.locator('canvas[data-stage]').count()) === 0 || (await revealStageOf(stage)) === 10, POLL)
    .toBe(true);
  await shot(stage, 'p10b-reveal-stage-full');
  await click(host, 'Показати відповідь');
  const gained = await scoreOf(host, 'Оля');
  // Ціна спадає зі 100 до 30 % за 12 с; Оля відповіла не пізніше olyaAnsweredBy.
  const latest = Math.min(1, (olyaAnsweredBy - revealOpenedAfter) / REVEAL_WINDOW_MS);
  expect(gained).toBeGreaterThanOrEqual(Math.floor(1000 * (1 - 0.7 * latest)) - 1);
  expect(gained).toBeLessThan(1000);
  expect(await scoreOf(host, 'Петро')).toBe(0);

  expect(problems).toEqual([]);
}

/** Дотик у частку (x, y) мапи: рахує піксель з рамки .pin-frame (без наближення). */
async function tapMap(page: Page, point: { x: number; y: number }): Promise<void> {
  const frame = page.locator('.pin-frame').first();
  await frame.scrollIntoViewIfNeeded();
  const box = (await frame.boundingBox())!;
  await page.mouse.click(box.x + point.x * box.width, box.y + point.y * box.height);
}

/** Тексти відкритих підказок на сторінці (з номерами: `.clue-n` + `.clue-text`). */
const shownClues = async (page: Page) => page.locator('.clue:not(.is-hidden)').allTextContents();
/** Лише тексти відкритих підказок, без номерів. */
const clueTexts = async (page: Page) => page.locator('.clue:not(.is-hidden) .clue-text').allTextContents();

it('part 10c: «Who am I?» and pins — the editor builds both (375 px too), clues open one by one and never leak, the pin moves until submit and zooms, the stage reveals every pin with circles, the host opens clues on a voice cell', async () => {
  try {
    await cluesPinGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function cluesPinGame() {
  const host = await open('host10c', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10c@example.com');
  // Збірка кладе поруч із мапами стиснені копії, сервер віддає їх за Accept-Encoding.
  for (const encoding of ['br', 'gzip']) {
    const map = await host.request.get(`${base}/maps/world.svg`, { headers: { 'accept-encoding': encoding } });
    expect(map.ok()).toBe(true);
    expect(map.headers()['content-encoding'], `/maps/world.svg with ${encoding}`).toBe(encoding);
  }

  const common = { imageUrl: null, video: null, points: 1000 };
  const FIVE = 'Я написав «Кобзар».';
  const c1 = {
    ...common,
    id: 'c1',
    type: 'clues' as const,
    text: 'Хто я?',
    clues: ['Я народився в Моринцях.', 'Я був кріпаком.', 'Я художник і поет.', 'Мій портрет — на 100 гривнях.'],
    accepted: ['Шевченко', 'Тарас Шевченко'],
    // 3 × 8 + 5 = 29 ≤ 30; між підказками досить часу, щоб гравці встигли відповісти саме на потрібній.
    interval: 8,
    timeLimit: 30,
  };
  const p1 = {
    ...common,
    id: 'p1',
    type: 'pin' as const,
    text: 'Де на мапі Львів?',
    map: 'world' as const,
    aspect: 2,
    target: { x: 0.5, y: 0.5 },
    fullRadius: 3,
    zeroRadius: 15,
    timeLimit: 30,
  };
  const voiceClues = {
    ...common,
    id: 'v1',
    type: 'clues' as const,
    text: 'Хто я?',
    clues: ['Я народилася в Новограді-Волинському.', 'Я писала «Лісову пісню».', 'Мій псевдонім — Леся.'],
    accepted: ['Леся Українка'],
    interval: 8,
    timeLimit: 30,
    points: 300,
  };
  const filler = (category: string, row: number) => ({ ...withPoints(withId(textQ, `f-${category}-${row}`), (row + 3) * 100), text: `${category} ${row + 1}?` });
  const categories = ['Міста', 'Річки', 'Гори'].map((title, column) => ({
    title,
    cells: [0, 1, 2].map((row) => (column === 0 && row === 0 ? voiceClues : filler(title, row))),
  }));
  const data = {
    ...makeRoundsQuiz(
      [
        classicRound('r1', [c1, p1] as never, { title: 'Хто я й де це', speedBonus: false, rules: DEFAULT_RULES }),
        boardRound('r2', categories as never, { title: 'Поле', answerMode: 'voice', check: 'manual' }),
      ],
      { leaderboard: 'end' },
    ),
    title: 'Хто я й де це 10c',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Хто я й де це 10c' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();

  await host.getByRole('button', { name: /^Запитання 1 / }).click();
  for (const n of [1, 2, 3, 4]) await field(host, `Підказка ${n}`).waitFor();
  await host.getByText('Остання підказка відкриється на 24-й секунді з 30.', exact).waitFor();
  await click(host, 'Додати підказку');
  await field(host, 'Підказка 5').fill(FIVE);
  // П'ята підказка піднімає час до 4 × 8 + 5 = 37 с.
  await host.getByText('Остання підказка відкриється на 32-й секунді з 37.', exact).waitFor();
  await shot(host, 'p10c-editor-clues');

  await host.getByRole('button', { name: /^Запитання 2 / }).click();
  const baseChips = host.getByRole('group', { name: 'Основа точки', ...exact });
  await baseChips.getByRole('button', { name: 'Україна', ...exact }).click();
  expect(await baseChips.getByRole('button', { name: 'Україна', ...exact }).getAttribute('aria-pressed')).toBe('true');
  await tapMap(host, PIN_PLACES.ukraine.lviv);
  await host.locator('.pin-frame .pin-target').waitFor();
  await host.locator('.pin-frame .pin-circle-full').waitFor({ state: 'attached' });
  await host.locator('.pin-frame .pin-circle-zero').waitFor({ state: 'attached' });
  await shot(host, 'p10c-editor-pin');

  await field(host, 'Нуль балів далі ніж, %').fill('2');
  await click(host, 'Зберегти');
  await host.locator('ul.problems').getByText('радіус нуля має бути більшим', { exact: false }).waitFor();
  await field(host, 'Нуль балів далі ніж, %').fill('15');

  await host.setViewportSize({ width: 375, height: 812 });
  await click(host, 'Попереднє запитання');
  await field(host, 'Підказка 5').waitFor();
  await expectNoSideScroll(host, 'p10c-editor-clues-375');
  await click(host, 'Наступне запитання');
  await host.locator('.pin-frame').waitFor();
  await expectNoSideScroll(host, 'p10c-editor-pin-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as {
    rounds: { questions?: { id: string; clues?: string[]; map?: string; aspect?: number; target?: { x: number; y: number } }[] }[];
  };
  const [storedClues, storedPin] = [stored.rounds[0]!.questions![0]!, stored.rounds[0]!.questions![1]!];
  expect(storedClues.clues).toHaveLength(5);
  expect(storedClues.clues![4]).toBe(FIVE);
  expect(storedPin.map).toBe('ukraine');
  expect(storedPin.aspect).toBeCloseTo(16 / 11, 5);
  expect(Math.abs(storedPin.target!.x - PIN_PLACES.ukraine.lviv.x)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(storedPin.target!.y - PIN_PLACES.ukraine.lviv.y)).toBeLessThanOrEqual(0.01);

  // 2. Гра.
  await host.locator('.quiz-list li', { hasText: 'Хто я й де це 10c' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10c', 1280, 720);
  await stage.goto(stageUrl);
  const olya = await open('olya10c', 375, 812);
  const petro = await open('petro10c', 375, 812);
  const frames = socketFrames(olya);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olya, petro, stage);
  await click(host, 'Почати раунд');
  await afterSplash(host, olya, petro, stage);

  // 3. «Хто я?» (класика).
  await olya.locator('.clues-list').waitFor();
  expect(await clueTexts(olya)).toEqual([c1.clues[0]]);
  expect(await clueTexts(stage)).toEqual([c1.clues[0]]);
  expect((await shownClues(olya)).length).toBe(1);
  await olya.locator('.clue.is-hidden').first().getByText(/^Підказка 2 — за \d+ с$/).waitFor();
  await expect.poll(async () => (await clueTexts(olya)).length, { timeout: 15000 }).toBe(2);
  await olya.getByText(/Підказка 2 з 5: правильна відповідь зараз — 80\s*%\s*ціни/).waitFor();
  await shot(olya, 'p10c-phone-clues');
  await expectNoSideScroll(olya, 'p10c-phone-clues');
  const early = frames.join('\n');
  for (const secret of ['Я художник і поет.', 'Мій портрет — на 100 гривнях.', FIVE, 'Шевченко']) {
    expect(early.includes(secret), `a clue or spelling leaked to the phone: ${secret}`).toBe(false);
  }
  await field(olya, 'Ваша відповідь').fill('Шевченко');
  await click(olya, 'Відповісти');
  await expect.poll(async () => (await clueTexts(petro)).length, { timeout: 15000 }).toBe(3);
  await field(petro, 'Ваша відповідь').fill('Франко');
  await click(petro, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await expect.poll(async () => (await clueTexts(stage)).length).toBe(5);
  await host.locator('li', { hasText: 'Оля' }).getByText('на підказці 2', exact).waitFor();
  expect(await scoreOf(host, 'Оля')).toBe(800);
  expect(await scoreOf(host, 'Петро')).toBe(0);
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 4. Точка (класика).
  await stage.locator('img.pin-base[src*="/maps/ukraine.svg"]').waitFor();
  await stage.getByText('Ставте точку на телефоні', exact).waitFor();
  expect(await stage.locator('.pin-target').count()).toBe(0);
  const submit = olya.getByRole('button', { name: 'Відповісти', ...exact });
  await olya.locator('.pin-frame').waitFor();
  expect(await submit.isDisabled()).toBe(true);
  await tapMap(olya, PIN_PLACES.ukraine.kharkiv);
  await tapMap(olya, PIN_PLACES.ukraine.lviv);
  expect(await olya.locator('.pin-mark.is-mine').count()).toBe(1);
  expect(await submit.isDisabled()).toBe(false);
  await click(olya, 'Наблизити');
  expect(await olya.locator('.pin-zoom-layer').getAttribute('style')).toMatch(/scale\(1\.5\)/);
  await shot(olya, 'p10c-phone-pin');
  await expectNoSideScroll(olya, 'p10c-phone-pin');
  await click(olya, 'Уся мапа');
  expect(await olya.locator('.pin-zoom-layer').getAttribute('style')).toMatch(/scale\(1\)/);
  await submit.click();
  await tapMap(petro, PIN_PLACES.ukraine.kharkiv);
  await click(petro, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  const beforeReveal = frames.join('\n');
  for (const key of ['"target"', '"fullRadius"', '"zeroRadius"']) {
    expect(beforeReveal.includes(key), `the pin answer leaked to the phone before the reveal: ${key}`).toBe(false);
  }
  await expect.poll(() => host.locator('.host-pin .pin-mark').count()).toBe(2);
  await host.locator('.host-pin .pin-target').waitFor();
  await shot(host, 'p10c-host-pins');
  await click(host, 'Показати відповідь');
  await stage.locator('.pin-mark.is-best[aria-label="Оля"]').waitFor();
  await stage.locator('.pin-mark[aria-label="Петро"]').waitFor();
  await stage.locator('.pin-target').waitFor();
  await stage.locator('.pin-circle-full').waitFor({ state: 'attached' });
  await stage.locator('.pin-circle-zero').waitFor({ state: 'attached' });
  await stage.getByText(/Найближче: Оля/).waitFor();
  await shot(stage, 'p10c-stage-pins');
  // Сцена 1280 × 720 вміщає все разом із «Найближче», а мапа бере решту висоти.
  const pageHeight = (await stage.evaluate('document.documentElement.scrollHeight')) as number;
  const best = (await stage.locator('.pin-best').boundingBox())!;
  const board = (await stage.locator('.stage-pin .pin-board').boundingBox())!;
  expect(pageHeight, 'the stage pin reveal scrolls').toBeLessThanOrEqual(720);
  expect(best.y + best.height).toBeLessThanOrEqual(720);
  expect(board.height, 'the stage map is too small').toBeGreaterThanOrEqual(400);
  // Рядок пульта показує бали за запитання: коло повних балів, без бонусу за швидкість.
  expect(await scoreOf(host, 'Оля')).toBe(1000);
  expect(await scoreOf(host, 'Петро')).toBe(0);
  await olya.locator('.pin-mark').first().waitFor();
  await olya.locator('.pin-target').waitFor();
  await olya.locator('.pin-circle-full').waitFor({ state: 'attached' });
  await olya.locator('.pin-circle-zero').waitFor({ state: 'attached' });
  await shot(olya, 'p10c-phone-pin-reveal');

  // 5. «Хто я?» на усній клітинці.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await afterSplash(host, olya, petro, stage);
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await olya.getByRole('button', { name: 'Міста, 300', ...exact }).click();
  await afterSplash(host, olya, petro, stage);
  const panel = host.locator('.host-clues');
  await panel.waitFor();
  expect(await panel.locator('.clue-state', { hasText: 'відкрито' }).count()).toBe(1);
  await click(host, 'Відкрити підказку 2');
  await expect.poll(async () => (await clueTexts(stage)).length).toBe(2);
  await expect.poll(async () => (await clueTexts(petro)).length).toBe(2);
  await host.getByText(/Відкрито 2 з 3: правильна відповідь зараз — 67\s*%\s*ціни/).waitFor();
  await shot(host, 'p10c-host-clues');
  await stage.waitForTimeout(10_000);
  expect((await clueTexts(stage)).length, 'a voice cell opens no clue by itself').toBe(2);
  expect(await panel.locator('.clue-state', { hasText: 'відкрито' }).count()).toBe(2);
  await click(host, 'Зарахувати');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await click(host, 'Показати відповідь');
  // 300 × 2 / 3: відкрито дві підказки з трьох.
  expect(await scoreOf(host, 'Оля')).toBe(200);

  expect(problems).toEqual([]);
}

/** Торкається плиток стіни за текстами й (якщо не просили інакше) натискає «Перевірити». */
async function pickWall(page: Page, texts: string[], submit = true): Promise<void> {
  for (const text of texts) await page.locator(`.wall-tile[aria-label="${text}"]`).click();
  if (submit) await click(page, 'Перевірити');
}

/** Кадри сокета до першого кадру з phase "reveal" (для перевірки витоку). */
const framesBeforeReveal = (frames: string[]) => frames.slice(0, Math.max(0, frames.findIndex((f) => f.includes('"phase":"reveal"'))));

/** Сума гравця в рядку «Гравці» пульта (не бали за запитання). */
async function totalOf(host: Page, nickname: string): Promise<number> {
  const text = await host.locator('.player-row', { hasText: nickname }).locator('.score').first().textContent();
  return Number(text!.replace(/[^\d-]/g, ''));
}

/** Сцена 1280 × 720 не прокручується вниз. */
async function expectStageFits(stage: Page, name: string) {
  const height = (await stage.evaluate('document.documentElement.scrollHeight')) as number;
  expect(height, `${name}: the stage scrolls (${height}px)`).toBeLessThanOrEqual(720);
}

it('part 10d: wall, poll and word cloud — the editor builds a wall (375 px too), wall groups never leak to phones or the stage, the phone finds groups and locks at the limit, the stage reveals groups with names, poll bars and a word cloud on the reveal, the host hides a word', async () => {
  try {
    await wallPollCloudGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function wallPollCloudGame() {
  const host = await open('host10d', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10d@example.com');

  const common = { imageUrl: null, video: null };
  const tile = (prefix: string, texts: string[]) => texts.map((text, i) => ({ id: `${prefix}-${i + 1}`, text }));
  const w1 = {
    ...common,
    id: 'w1',
    type: 'wall' as const,
    text: 'Знайдіть зв’язки',
    points: 1000,
    timeLimit: 90,
    mistakes: 2,
    groups: [
      { id: 'g-river', name: 'Річки', tiles: tile('river', ['Дніпро', 'Десна', 'Рось', 'Псел']) },
      { id: 'g-peak', name: 'Гори', tiles: tile('peak', ['Говерла', 'Петрос', 'Піп Іван', 'Бребенескул']) },
      { id: 'g-lake', name: 'Озера', tiles: tile('lake', ['Світязь', 'Синевир', 'Ялпуг', 'Кагул']) },
      { id: 'g-isle', name: 'Ост', tiles: tile('isle', ['Хортиця', 'Джарилгач', 'Зміїний', 'Бірючий']) },
    ],
  };
  const season = (id: string, text: string) => ({ id, text });
  const p1 = {
    ...common,
    id: 'p1',
    type: 'poll' as const,
    text: 'Найкраща пора року?',
    points: 0,
    timeLimit: 20,
    options: [season('p1-spring', 'Весна'), season('p1-summer', 'Літо'), season('p1-autumn', 'Осінь'), season('p1-winter', 'Зима')],
  };
  const k1 = { ...common, id: 'k1', type: 'wordcloud' as const, text: 'Одним словом: з чим асоціюється Київ?', points: 0, timeLimit: 30, words: 3 };
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [w1, p1, k1] as never, { title: 'Стіна й голоси', speedBonus: false, rules: DEFAULT_RULES, shuffleOptions: false })]),
    title: 'Стіна й голоси 10d',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Стіна й голоси 10d' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();

  await host.getByRole('button', { name: /^Запитання 1 / }).click();
  expect(await host.locator('.wall-group-edit').count()).toBe(4);
  expect(await field(host, 'Помилок до замикання').inputValue()).toBe('2');
  await host.getByText('Кожна група — 250 балів. Остання складається сама, тож за всю стіну — 750.', exact).waitFor();
  await field(host, 'Назва групи 4').fill('Острови');
  await shot(host, 'p10d-editor-wall');

  const second = host.getByRole('group', { name: 'Група 2', ...exact });
  await second.getByLabel('Плитка 1', exact).fill('Дніпро');
  await click(host, 'Зберегти');
  await host.locator('ul.problems').getByText('плитка «дніпро» повторюється', { exact: false }).waitFor();
  await second.getByLabel('Плитка 1', exact).fill('Говерла');

  await host.setViewportSize({ width: 375, height: 812 });
  await host.locator('.wall-group-edit').last().scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10d-editor-wall-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  await host.getByRole('button', { name: /^Запитання 2 / }).click();
  await host.getByText('Правильної відповіді немає', { exact: false }).waitFor();
  expect(await field(host, 'Бали').count(), 'a poll has no points field').toBe(0);
  await host.getByText('Без балів', { exact: false }).first().waitFor();
  await shot(host, 'p10d-editor-poll');

  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as {
    rounds: { questions?: { id: string; points: number; groups?: { name: string }[] }[] }[];
  };
  const [storedWall, storedPoll] = [stored.rounds[0]!.questions![0]!, stored.rounds[0]!.questions![1]!];
  expect(storedWall.groups![3]!.name).toBe('Острови');
  expect(storedWall.groups![1]!.name).toBe('Гори');
  expect(storedPoll.points).toBe(0);

  // 2. Гра.
  await host.locator('.quiz-list li', { hasText: 'Стіна й голоси 10d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10d', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya10d', 375, 812);
  const petro = await open('petro10d', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olya, petro, stage);
  await click(host, 'Почати раунд');
  await afterSplash(host, olya, petro, stage);

  // 3. Стіна.
  await stage.locator('.wall-tile').first().waitFor();
  expect(await stage.locator('.wall-tile').count()).toBe(16);
  expect(await stage.locator('[class*="wall-color-"]').count()).toBe(0);
  await stage.getByText('Шукайте групи на телефоні', exact).waitFor();
  await expectStageFits(stage, 'stage wall');
  await shot(stage, 'p10d-stage-wall-question');

  await olya.locator('.wall-tile').first().waitFor();
  expect(await olya.getByRole('button', { name: 'Перевірити', ...exact }).isDisabled()).toBe(true);
  await pickWall(olya, ['Дніпро', 'Десна', 'Рось', 'Псел']);
  await expect.poll(async () => (await olya.locator('.wall-tile.wall-color-0').allTextContents()).sort()).toEqual(['Десна', 'Дніпро', 'Псел', 'Рось']);
  expect(await olya.locator('.wall-grid .wall-tile').first().getAttribute('class')).toContain('wall-color-0');
  await olya.getByRole('img', { name: 'Помилок: 0 з 2', ...exact }).waitFor();

  await pickWall(olya, ['Говерла', 'Петрос', 'Світязь', 'Хортиця']);
  await olya.getByRole('img', { name: 'Помилок: 1 з 2', ...exact }).waitFor();
  expect(await olya.locator('.wall-tile.is-selected').count()).toBe(0);

  await pickWall(olya, ['Світязь', 'Синевир'], false);
  await olya.getByText('Вибрано 2 з 4', exact).waitFor();
  await shot(olya, 'p10d-phone-wall');
  await expectNoSideScroll(olya, 'p10d-phone-wall');
  await pickWall(olya, ['Ялпуг', 'Кагул']);
  await expect.poll(() => olya.locator('.wall-tile.wall-color-1').count()).toBe(4);

  await pickWall(petro, ['Дніпро', 'Говерла', 'Світязь', 'Хортиця']);
  await petro.getByRole('img', { name: 'Помилок: 1 з 2', ...exact }).waitFor();
  await pickWall(petro, ['Десна', 'Петрос', 'Синевир', 'Джарилгач']);
  await petro.getByText('Стіну замкнено', { exact: false }).waitFor();

  await pickWall(olya, ['Говерла', 'Петрос', 'Піп Іван', 'Бребенескул']);
  // Обидва закінчили: запитання закривається одразу, тож «Стіну складено!» може не встигнути з'явитися.
  await host.getByText('Запитання закрите').waitFor();
  await expect.poll(() => olya.locator('.wall-tile.wall-color-3').count()).toBe(4);

  // Витік: до розкриття жодних груп, назв чи id плиток.
  await click(host, 'Показати відповідь');
  await stage.locator('.wall-reveal').waitFor();
  for (const [who, frames] of [['olya', olyaFrames], ['petro', petroFrames], ['stage', stageFrames]] as const) {
    const early = framesBeforeReveal(frames);
    expect(early.length, `${who}: no frames before the reveal`).toBeGreaterThan(0);
    const text = early.join('\n');
    // Власна відповідь телефона містить лише число груп (`"groups":4`), а не самі групи.
    for (const secret of ['Річки', 'Гори', 'Озера', 'Острови', '"groups":[', 'river-1', 'peak-1', 'lake-1', 'isle-1', 'g-river']) {
      const at = text.indexOf(secret);
      expect(at < 0, `${who} got «${secret}» before the reveal: ${text.slice(Math.max(0, at - 150), at + 150)}`).toBe(true);
    }
  }

  const groups = stage.locator('.wall-reveal .wall-group');
  expect(await groups.count()).toBe(4);
  expect(await groups.allTextContents()).toEqual(
    expect.arrayContaining([expect.stringContaining('Річки'), expect.stringContaining('Гори'), expect.stringContaining('Озера'), expect.stringContaining('Острови')]),
  );
  const olyaRow = stage.locator('.wall-table tbody tr', { hasText: 'Оля' });
  const petroRow = stage.locator('.wall-table tbody tr', { hasText: 'Петро' });
  expect(await olyaRow.textContent()).toMatch(/4 \/ 4.*склав/);
  expect(await petroRow.textContent()).toMatch(/0 \/ 4.*замкнено/);
  await expectStageFits(stage, 'stage wall reveal');
  await shot(stage, 'p10d-stage-wall');
  expect(await scoreOf(host, 'Оля')).toBe(750);
  expect(await scoreOf(host, 'Петро')).toBe(0);
  await olya.getByText('Груп: 4 з 4 · 750', { exact: false }).waitFor();
  expect(await olya.locator('.wall-reveal .wall-group').count()).toBe(4);
  await shot(olya, 'p10d-phone-wall-reveal');
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 4. Опитування.
  await stage.getByText('Проголосували 0 з 2', exact).waitFor();
  for (const name of ['Весна', 'Літо', 'Осінь', 'Зима']) await stage.getByText(name, exact).waitFor();
  expect(await stage.locator('.poll-bars').count()).toBe(0);
  await olya.getByRole('button', { name: /Літо/ }).click();
  await petro.getByRole('button', { name: /Літо/ }).click();
  await olya.getByText('Голос прийнято', exact).waitFor();
  const sent = await olya.locator('.sent').innerText();
  expect(sent).not.toMatch(/бал|правильно/i);
  const pollBar = (page: Page | ReturnType<Page['locator']>, name: string) => page.locator('.poll-bar', { hasText: name });
  await host.getByText('Запитання закрите').waitFor();
  await expect.poll(async () => await pollBar(host.locator('.host-poll'), 'Літо').textContent()).toContain('100 % · 2');
  await click(host, 'Показати результати');
  await stage.locator('.poll-bars').waitFor();
  expect(await pollBar(stage, 'Літо').textContent()).toContain('100 % · 2');
  expect(await pollBar(stage, 'Весна').textContent()).toContain('0 % · 0');
  expect(await stage.getByText('Правильна відповідь', { exact: false }).count()).toBe(0);
  await expectStageFits(stage, 'stage poll');
  await shot(stage, 'p10d-stage-poll');
  expect(await totalOf(host, 'Оля')).toBe(750);
  expect(await totalOf(host, 'Петро')).toBe(0);
  await olya.getByText('Результати — на екрані.', exact).waitFor();
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 5. Хмара слів.
  await stage.getByText('Пишіть до 3 слів на телефоні', exact).waitFor();
  expect(await stage.locator('.word-cloud').count()).toBe(0);
  await field(olya, 'Слово 1').fill('Каштани');
  await click(olya, '＋ Ще слово');
  await field(olya, 'Слово 2').fill('Лайкаслово');
  await click(olya, 'Відповісти');
  await field(petro, 'Слово 1').fill(' каштани ');
  await click(petro, '＋ Ще слово');
  await field(petro, 'Слово 2').fill('Дніпро');
  await click(petro, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();

  const hostWord = (name: string) => host.locator('.host-cloud').getByRole('button', { name, ...exact });
  await hostWord('Лайкаслово').waitFor();
  await hostWord('Дніпро').waitFor();
  expect(await host.locator('.host-cloud li', { hasText: /каштани/i }).locator('.host-cloud-count').textContent()).toBe('2');
  await hostWord('Лайкаслово').click();
  await expect.poll(() => hostWord('Лайкаслово').getAttribute('aria-pressed')).toBe('true');
  const box = (await hostWord('Лайкаслово').boundingBox())!;
  expect(box.height, 'cloud word button is a tap target').toBeGreaterThanOrEqual(44);
  await shot(host, 'p10d-host-cloud-hide');

  await click(host, 'Показати результати');
  await stage.locator('.word-cloud').waitFor();
  const sizeOf = async (word: RegExp) =>
    parseFloat(await stage.locator('.word-cloud .word', { hasText: word }).evaluate((el) => (globalThis as unknown as { getComputedStyle: (e: unknown) => { fontSize: string } }).getComputedStyle(el).fontSize));
  expect(await sizeOf(/каштани/i)).toBeGreaterThan(await sizeOf(/Дніпро/));
  expect(await stage.locator('.word-cloud').innerText()).not.toContain('Лайкаслово');
  await expectStageFits(stage, 'stage cloud');
  await shot(stage, 'p10d-stage-cloud');
  for (const [who, frames] of [['stage', stageFrames], ['petro', petroFrames]] as const) {
    expect(frames.join('\n').includes('Лайкаслово'), `${who} got the hidden word`).toBe(false);
  }

  // Повернути слово й сховати знову.
  await hostWord('Лайкаслово').click();
  await expect.poll(() => stage.locator('.word-cloud .word', { hasText: 'Лайкаслово' }).count()).toBe(1);
  await hostWord('Лайкаслово').click();
  await expect.poll(() => stage.locator('.word-cloud .word', { hasText: 'Лайкаслово' }).count()).toBe(0);
  expect(await totalOf(host, 'Оля')).toBe(750);
  expect(await totalOf(host, 'Петро')).toBe(0);

  // 6. Історія.
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Стіна й голоси 10d/ }).click();
  const items = host.locator('.rows.stacked > li');
  await items.first().waitFor();
  expect(await items.count()).toBe(3);
  expect(await items.nth(0).locator('.wall-reveal .wall-group').count()).toBe(4);
  expect(await items.nth(0).textContent()).toContain('Острови');
  await items.nth(0).getByText('Відповіді (2)').click();
  await items.nth(0).locator('.responses li', { hasText: 'Оля' }).getByText('Стіну складено, помилок: 1', { exact: false }).waitFor();
  await items.nth(0).locator('.responses li', { hasText: 'Петро' }).getByText('0 з 4 груп, помилок: 2', { exact: false }).waitFor();
  await items.nth(1).getByText('Проголосували: 2', exact).waitFor();
  expect(await pollBar(items.nth(1), 'Літо').textContent()).toContain('100 % · 2');
  await items.nth(2).getByText('Проголосували: 2', exact).waitFor();
  const cloudWords = await items.nth(2).locator('.history-cloud li').allTextContents();
  expect(cloudWords.some((w) => /^каштани · 2$/i.test(w))).toBe(true);
  expect(cloudWords).toContain('Дніпро · 1');
  expect(cloudWords).toContain('приховано · 1');
  expect(cloudWords.join('\n')).not.toContain('Лайкаслово');
  await shot(host, 'p10d-history');

  expect(problems).toEqual([]);
}

/** Заповнює поля «Відповідь N» значеннями (не чіпаючи решти). */
async function fillSurvey(page: Page, values: string[]): Promise<void> {
  for (const [i, value] of values.entries()) await field(page, `Відповідь ${i + 1}`).fill(value);
}

/** Заповнює поля «Відповідь N» значеннями й натискає «Відповісти». */
async function answerSurvey(page: Page, values: string[]): Promise<void> {
  await fillSurvey(page, values);
  await click(page, 'Відповісти');
}

/** Тексти відкритих рядків табло на сторінці (зверху вниз). */
const openRows = async (page: Page) => page.locator('.survey-row:not(.is-closed) .survey-text').allTextContents();

/** Кадри сокета від `from` до першого кадру з phase "reveal" після нього (для перевірки витоку). */
const framesUntilReveal = (frames: string[], from: number) => {
  const tail = frames.slice(from);
  const at = tail.findIndex((f) => f.includes('"phase":"reveal"'));
  return at < 0 ? tail : tail.slice(0, at);
};

/** Відкритий рядок табло з текстом. */
const surveyRow = (scope: Page | ReturnType<Page['locator']>, text: string) => scope.locator('.survey-row:not(.is-closed)', { hasText: text });

it('part 10e: «100 до 1» — the editor builds a host board and a cloud board (375 px too), rows never leak before the reveal, the stage opens rows bottom-up with names, popularity scoring with the cap, a cloud board without hidden words, a skipped survey warns the host', async () => {
  try {
    await surveyGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function surveyGame() {
  const host = await open('host10e', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10e@example.com');

  const common = { imageUrl: null, video: null };
  const fruit = (id: string, text: string, popularity: number, accepted: string[] = []) => ({ id, text, popularity, accepted });
  const k1 = { ...common, id: 'k1', type: 'wordcloud' as const, text: 'Назвіть фрукт', points: 0, timeLimit: 30, words: 3 };
  const s1 = {
    ...common,
    id: 's1',
    type: 'survey' as const,
    text: 'Назвіть фрукт, який люблять діти',
    points: 1000,
    timeLimit: 45,
    answers: 3,
    rows: [
      fruit('row-apple', 'Яблуко', 32, ['яблучко']),
      fruit('row-banana', 'Банан', 25),
      fruit('row-straw', 'Полуниця', 15),
      fruit('row-melon', 'Кавун', 10),
      fruit('row-pear', 'Груша', 8),
    ],
  };
  const s2 = { ...common, id: 's2', type: 'survey' as const, text: 'Фрукти залу: назвіть два', points: 1000, timeLimit: 45, answers: 2, cloudId: 'k1', rows: [] };
  const k2 = { ...common, id: 'k2', type: 'wordcloud' as const, text: 'Назвіть овоч', points: 0, timeLimit: 20, words: 1 };
  const s3 = { ...common, id: 's3', type: 'survey' as const, text: 'Овочі залу', points: 1000, timeLimit: 45, answers: 2, cloudId: 'k2', rows: [] };
  const q1 = {
    ...common,
    id: 'q1',
    type: 'single' as const,
    text: 'Кінець?',
    points: 100,
    timeLimit: 20,
    options: [
      { id: 'q1-yes', text: 'Так' },
      { id: 'q1-no', text: 'Ні' },
    ],
    correctId: 'q1-yes',
  };
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [k1, s1, s2, k2, s3, q1] as never, { title: 'Сто до одного', speedBonus: false, rules: DEFAULT_RULES, shuffleOptions: false })], { leaderboard: 'end' }),
    title: 'Сто до одного 10e',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Сто до одного 10e' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();

  await host.getByRole('button', { name: /^Запитання 2 / }).click();
  expect(await host.locator('.survey-row-edit').count()).toBe(5);
  await host.getByText('Разом: 90 зі 100', exact).waitFor();
  expect(await field(host, 'Відповідей від гравця').inputValue()).toBe('3');
  await field(host, 'Людей зі 100').first().fill('50');
  await host.getByText('Разом: 108 зі 100', { exact: false }).waitFor();
  await host.getByText('Понад 100', { exact: false }).waitFor();
  await field(host, 'Людей зі 100').first().fill('32');
  await host.getByText('Разом: 90 зі 100', exact).waitFor();
  await shot(host, 'p10e-editor-survey');

  await host.setViewportSize({ width: 375, height: 812 });
  await host.locator('.survey-row-edit').first().scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10e-editor-survey-375');
  await host.locator('.survey-row-edit').last().scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10e-editor-survey-375-end');
  await host.setViewportSize({ width: 1280, height: 900 });

  await host.getByRole('button', { name: /^Запитання 3 / }).click();
  expect(await host.getByRole('button', { name: 'Відповіді з хмари', ...exact }).getAttribute('aria-pressed')).toBe('true');
  expect(await host.getByLabel('Хмара слів для дошки').inputValue()).toBe('k1');
  expect(await host.locator('select option:checked').filter({ hasText: 'Хмара №1: «Назвіть фрукт»' }).count()).toBeGreaterThan(0);
  await host.getByText('Якщо хмара не дасть жодного слова, запитання пропуститься.', exact).waitFor();
  await shot(host, 'p10e-editor-survey-cloud');

  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as {
    rounds: { questions?: { id: string; cloudId?: string; rows?: unknown[] }[] }[];
  };
  const storedS2 = stored.rounds[0]!.questions!.find((q) => q.id === 's2')!;
  expect(storedS2.cloudId).toBe('k1');
  expect(storedS2.rows).toEqual([]);

  // 2. Гра.
  await host.locator('.quiz-list li', { hasText: 'Сто до одного 10e' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10e', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya10e', 375, 812);
  const petro = await open('petro10e', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olya, petro, stage);
  await click(host, 'Почати раунд');
  await afterSplash(host, olya, petro, stage);

  // 3. Хмара k1.
  await stage.getByText('Пишіть до 3 слів на телефоні', exact).waitFor();
  const cloudWords = async (page: Page, words: string[]) => {
    await field(page, 'Слово 1').fill(words[0]!);
    for (const [i, word] of words.slice(1).entries()) {
      await click(page, '＋ Ще слово');
      await field(page, `Слово ${i + 2}`).fill(word);
    }
    await click(page, 'Відповісти');
  };
  await cloudWords(olya, ['Яблуко', 'Банан', 'Вишня']);
  await cloudWords(petro, ['яблуко', 'Слива']);
  await host.getByText('Запитання закрите').waitFor();
  const hostWord = (name: string) => host.locator('.host-cloud').getByRole('button', { name, ...exact });
  await hostWord('Слива').click();
  await expect.poll(() => hostWord('Слива').getAttribute('aria-pressed')).toBe('true');
  await click(host, 'Показати результати');
  await stage.locator('.word-cloud').waitFor();
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 4. Дошка ведучого s1.
  const from = { stage: stageFrames.length, olya: olyaFrames.length, petro: petroFrames.length };
  await stage.locator('.survey-row.is-closed').first().waitFor();
  expect(await stage.locator('.survey-row.is-closed').count()).toBe(5);
  expect(await stage.locator('.survey-row:not(.is-closed)').count()).toBe(0);
  await stage.getByText('Пишіть до 3 відповідей на телефоні', exact).waitFor();
  await shot(stage, 'p10e-stage-survey-question');

  await field(olya, 'Відповідь 3').waitFor();
  await fillSurvey(olya, ['яблучко', 'Банан']);
  await expectNoSideScroll(olya, 'p10e-phone-survey');
  const inputBox = (await field(olya, 'Відповідь 1').boundingBox())!;
  expect(inputBox.height, 'survey field is a tap target').toBeGreaterThanOrEqual(44);
  await answerSurvey(olya, ['яблучко', 'Банан', 'ананас']);
  await olya.getByText('Відповіді надіслано', exact).waitFor();

  await field(petro, 'Відповідь 2').waitFor();
  await fillSurvey(petro, ['Яблуко', ' яблуко ']);
  await petro.getByText('Ця відповідь уже є', exact).first().waitFor();
  await answerSurvey(petro, ['Яблуко', ' яблуко ', 'Кавун']);
  await petro.getByText('Відповіді надіслано', exact).waitFor();
  await host.getByText('Запитання закрите').waitFor();

  const hostBoard = host.locator('.host-survey');
  await hostBoard.waitFor();
  expect(await hostBoard.locator('.survey-row').count()).toBe(5);
  const apple = await surveyRow(hostBoard, 'Яблуко').textContent();
  expect(apple).toContain('Оля');
  expect(apple).toContain('Петро');
  const melon = await surveyRow(hostBoard, 'Кавун').textContent();
  expect(melon).toContain('Петро');
  expect(melon).not.toContain('Оля');
  expect(await host.getByRole('button', { name: /^(Правильно|Частково|Не зараховувати)/ }).count(), 'no grading buttons').toBe(0);
  await hostBoard.scrollIntoViewIfNeeded();
  await shot(host, 'p10e-host-survey');

  // До розкриття на телефони й сцену не потрапляє жоден рядок дошки.
  await click(host, 'Показати відповідь');
  await stage.locator('.survey-row.is-closed').first().waitFor();
  for (const [who, frames, start] of [['olya', olyaFrames, from.olya], ['petro', petroFrames, from.petro], ['stage', stageFrames, from.stage]] as const) {
    const early = framesUntilReveal(frames, start);
    expect(early.length, `${who}: no frames before the reveal`).toBeGreaterThan(0);
    const text = early.join('\n');
    for (const secret of ['Полуниця', 'Груша', 'row-straw', 'row-pear', '"popularity":3']) {
      const at = text.indexOf(secret);
      expect(at < 0, `${who} got «${secret}» before the reveal: ${text.slice(Math.max(0, at - 150), at + 150)}`).toBe(true);
    }
  }

  // Розкриття знизу вгору: рядок за рядком.
  const nextRow = host.getByRole('button', { name: /^Відкрити рядок / });
  await host.getByRole('button', { name: 'Відкрити рядок 1 з 5', ...exact }).waitFor();
  expect((await nextRow.boundingBox())!.height, 'next row button is a tap target').toBeGreaterThanOrEqual(44);
  await nextRow.click();
  await expect.poll(() => openRows(stage)).toHaveLength(1);
  await host.getByRole('button', { name: 'Відкрити рядок 2 з 5', ...exact }).click();
  await expect.poll(async () => (await openRows(stage)).map((text) => (text.startsWith('Кавун') ? 'Кавун' : text.startsWith('Груша') ? 'Груша' : text))).toEqual(['Кавун', 'Груша']);
  expect(await surveyRow(stage, 'Груша').textContent()).toContain('Ніхто не назвав');
  const stageMelon = await surveyRow(stage, 'Кавун').textContent();
  expect(stageMelon).toContain('Петро');
  expect(stageMelon).not.toContain('Оля');
  expect(await bodyText(stage)).not.toContain('Яблуко');
  expect(await stage.locator('.survey-row.is-closed').count()).toBe(3);
  // Телефон до повного розкриття: власні рядки без результату.
  await olya.getByText('ананас', { exact: false }).first().waitFor();
  expect(await bodyText(olya)).not.toContain('місце');
  await expect.poll(() => stage.locator('.survey-row.is-flipping').count()).toBe(0);
  await shot(stage, 'p10e-stage-survey-half');

  await click(host, 'Відкрити всі');
  await expect.poll(() => openRows(stage)).toHaveLength(5);
  const apples = await surveyRow(stage, 'Яблуко').textContent();
  expect(apples).toContain('Оля');
  expect(apples).toContain('Петро');
  expect((await openRows(stage))[0]).toContain('Яблуко');
  await expect.poll(() => stage.locator('.survey-row.is-flipping').count()).toBe(0);
  await expectStageFits(stage, 'p10e-stage-survey-full');
  await shot(stage, 'p10e-stage-survey-full');

  await olya.getByText('яблучко — місце 1, 32', exact).waitFor();
  await olya.getByText('Банан — місце 2, 25', exact).waitFor();
  await olya.getByText('ананас — немає на табло', exact).waitFor();
  expect(await bodyText(olya)).toContain('570');
  await expectNoSideScroll(olya, 'p10e-phone-survey-result');
  expect(await scoreOf(host, 'Оля')).toBe(570);
  expect(await scoreOf(host, 'Петро')).toBe(420);
  expect(await totalOf(host, 'Оля')).toBe(570);
  expect(await totalOf(host, 'Петро')).toBe(420);
  expect(await host.getByRole('button', { name: /^Відкрити/ }).count(), 'no row buttons once everything is open').toBe(0);
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 5. Дошка з хмари s2.
  await stage.locator('.survey-row.is-closed').first().waitFor();
  expect(await stage.locator('.survey-row.is-closed').count()).toBe(3);
  await stage.getByText('Дошка з ваших відповідей у хмарі слів', exact).waitFor();
  const cloudBoard = host.locator('.host-survey');
  await cloudBoard.waitFor();
  expect(await cloudBoard.locator('.survey-row').count()).toBe(3);
  expect(await surveyRow(cloudBoard, 'Яблуко').locator('.survey-pop').textContent()).toContain('100');
  expect(await surveyRow(cloudBoard, 'Банан').locator('.survey-pop').textContent()).toContain('50');
  expect(await surveyRow(cloudBoard, 'Вишня').locator('.survey-pop').textContent()).toContain('50');
  expect(await cloudBoard.innerText()).not.toContain('Слива');
  await answerSurvey(olya, ['яблуко', 'банан']);
  await answerSurvey(petro, ['Слива', 'Вишня']);
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Відкрити всі');
  await expect.poll(() => openRows(stage)).toHaveLength(3);
  await expect.poll(() => stage.locator('.survey-row.is-flipping').count()).toBe(0);
  expect(await stage.locator('.stage-survey').innerText()).not.toContain('Слива');
  await expectStageFits(stage, 'p10e-stage-survey-cloud');
  await shot(stage, 'p10e-stage-survey-cloud');
  expect(await scoreOf(host, 'Оля')).toBe(1000);
  expect(await scoreOf(host, 'Петро')).toBe(500);
  expect(await totalOf(host, 'Оля')).toBe(1570);
  expect(await totalOf(host, 'Петро')).toBe(920);
  for (const [who, frames] of [['stage', stageFrames], ['olya', olyaFrames], ['petro', petroFrames]] as const) {
    expect(frames.join('\n').includes('"text":"Слива"'), `${who} got the hidden word as a board row`).toBe(false);
  }
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 6. Пропуск s3: хмара k2 порожня.
  await stage.getByText('Пишіть до 1 слів на телефоні', { exact: false }).waitFor();
  await click(host, 'Закрити запитання');
  await click(host, 'Показати результати');
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);
  await stage.getByText('Кінець?', exact).waitFor();
  expect(await bodyText(stage)).not.toContain('Овочі залу');
  const warning = host.locator('.host-warning');
  await warning.getByText('Запитання «Овочі залу» пропущено: хмара не дала слів', { exact: false }).waitFor();
  expect(await host.locator('main').innerText()).toMatch(/Запитання \d+ з 5\b/);
  await shot(host, 'p10e-host-skip');
  await olya.getByRole('button', { name: /Так/ }).click();
  await petro.getByRole('button', { name: /Ні/ }).click();
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');

  // 7. Історія.
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Сто до одного 10e/ }).click();
  const items = host.locator('.rows.stacked > li');
  await items.first().waitFor();
  expect(await host.locator('main').innerText()).not.toContain('Овочі залу');
  const first = items.filter({ hasText: 'Назвіть фрукт, який люблять діти' });
  const history1 = await first.locator('.history-survey').innerText();
  expect(history1).toContain('Яблуко');
  expect(history1).toContain('Оля');
  expect(history1).toContain('Петро');
  expect(history1).not.toContain('Дошка з хмари слів');
  await first.getByText('Відповіді (2)').click();
  await first.locator('.responses li', { hasText: 'Оля' }).getByText('яблучко ✓, Банан ✓, ананас ✗', { exact: false }).waitFor();
  const second = items.filter({ hasText: 'Фрукти залу' });
  const history2 = await second.locator('.history-survey').innerText();
  expect(history2).toContain('Дошка з хмари слів');
  for (const word of ['Яблуко', 'Банан', 'Вишня']) expect(history2).toContain(word);
  expect(history2).not.toContain('Слива');
  await shot(host, 'p10e-history');

  expect(problems).toEqual([]);
}

/** Пише вигадку й натискає «Надіслати вигадку». */
async function writeLie(page: Page, text: string): Promise<void> {
  await field(page, 'Твоя вигадка').fill(text);
  await click(page, 'Надіслати вигадку');
}

/** Торкається варіанта з текстом на телефоні. */
async function pickBluff(page: Page, text: string): Promise<void> {
  await page.locator('.bluff-choice button').filter({ has: page.getByText(text, exact) }).click();
}

/** Тексти відкритих варіантів на сторінці (зверху вниз). */
const openOptions = async (page: Page) => page.locator('.bluff-row:not(.is-closed) .bluff-text').allTextContents();

/** Рядок варіанта блефу з точним текстом. */
const bluffRow = (scope: Page | ReturnType<Page['locator']>, text: string) => {
  const owner = 'goto' in scope ? scope : scope.page();
  return scope.locator('.bluff-row').filter({ has: owner.locator('.bluff-text').getByText(text, exact) });
};

it('part 10f: bluff — the editor builds a bluff (375 px too), the truth is refused as a lie, equal lies merge, spares fill up to five, truth, spares and authors never leak before their time, the host removes a lie, options open one by one with the truth last, truth and fooled-player scoring', async () => {
  try {
    await bluffGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function bluffGame() {
  const host = await open('host10f', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10f@example.com');

  const common = { imageUrl: null, video: null };
  const b1 = {
    ...common,
    id: 'b1',
    type: 'bluff' as const,
    text: 'Ейфелеву вежу спершу пропонували поставити в …, але місто відмовилося.',
    points: 1000,
    timeLimit: 60,
    choiceTime: 30,
    accepted: ['Барселона', 'Барселоні'],
    lies: ['Мадрид', 'Лондон', 'Брюссель'],
  };
  // Південний Буг (806 км) — найдовша річка лише в Україні: Дніпро й Дністер довші, але течуть і в інших країнах.
  const b2 = {
    ...common,
    id: 'b2',
    type: 'bluff' as const,
    text: 'Найдовша річка, що тече лише Україною, — …',
    points: 1000,
    timeLimit: 60,
    choiceTime: 30,
    accepted: ['Південний Буг', 'Буг'],
    lies: ['Сула', 'Псел'],
  };
  const q1 = {
    ...common,
    id: 'q1',
    type: 'single' as const,
    text: 'Кінець?',
    points: 100,
    timeLimit: 20,
    options: [
      { id: 'q1-yes', text: 'Так' },
      { id: 'q1-no', text: 'Ні' },
    ],
    correctId: 'q1-yes',
  };
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [b1, b2, q1] as never, { title: 'Блеф', speedBonus: true, rules: DEFAULT_RULES, shuffleOptions: false })], { leaderboard: 'end' }),
    title: 'Блеф 10f',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Блеф 10f' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  await host.getByRole('button', { name: /^Запитання 1 / }).click();
  expect(await field(host, 'Правда').inputValue()).toBe('Барселона');
  expect(await field(host, 'Написання 1').inputValue()).toBe('Барселоні');
  for (const [i, lie] of ['Мадрид', 'Лондон', 'Брюссель'].entries()) expect(await field(host, `Запасна вигадка ${i + 1}`).inputValue()).toBe(lie);
  expect(await field(host, 'Час на вигадки, с').inputValue()).toBe('60');
  expect(await field(host, 'Час на вибір, с').inputValue()).toBe('30');
  await shot(host, 'p10f-editor-bluff');

  await field(host, 'Запасна вигадка 3').fill('барселоні');
  await click(host, 'Зберегти');
  await host.getByText('запасна вигадка «барселоні» — це правда', { exact: false }).waitFor();
  await shot(host, 'p10f-editor-bluff-problem');
  await field(host, 'Запасна вигадка 3').fill('Брюссель');

  await host.setViewportSize({ width: 375, height: 812 });
  await field(host, 'Правда').scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10f-editor-bluff-375');
  await field(host, 'Час на вибір, с').scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10f-editor-bluff-375-end');
  await host.setViewportSize({ width: 1280, height: 900 });

  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as {
    rounds: { questions?: { id: string; choiceTime?: number; lies?: string[] }[] }[];
  };
  const storedB1 = stored.rounds[0]!.questions!.find((q) => q.id === 'b1')!;
  expect(storedB1.choiceTime).toBe(30);
  expect(storedB1.lies).toHaveLength(3);

  // 2. Гра.
  await host.locator('.quiz-list li', { hasText: 'Блеф 10f' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10f', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya10f', 375, 812);
  const petro = await open('petro10f', 375, 812);
  const vira = await open('vira10f', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const viraFrames = socketFrames(vira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(vira, code, 'Віра', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olya, petro, vira, stage);
  await click(host, 'Почати раунд');
  await afterSplash(host, olya, petro, vira, stage);

  // 3. b1, вигадки.
  await stage.getByText('Вигадайте відповідь на телефоні', exact).waitFor();
  await shot(stage, 'p10f-stage-lies');
  await writeLie(olya, 'Рим');
  await olya.getByText('Твоя вигадка: «Рим»', { exact: false }).waitFor();
  await stage.getByText('Вигадали 1 з 3', exact).waitFor();

  await writeLie(petro, 'барселоні');
  await petro.getByText('Це правда! Вигадай щось інше', exact).waitFor();
  expect(await field(petro, 'Твоя вигадка').inputValue(), 'a refused lie stays in the field').toBe('барселоні');
  await expectNoSideScroll(petro, 'p10f-phone-truth-refused');
  await writeLie(petro, 'РИМ');
  await petro.getByText('Твоя вигадка: «РИМ»', { exact: false }).waitFor();
  await stage.getByText('Вигадали 2 з 3', exact).waitFor();

  const liveLies = host.locator('.bluff-live');
  await liveLies.getByText('Оля: Рим', exact).waitFor();
  await liveLies.getByText('Петро: РИМ', exact).waitFor();
  await shot(host, 'p10f-host-lies');

  // Витік (вигадки): ні правди, ні запасних, ні чужих вигадок.
  const liesFrames = { stage: stageFrames.length, olya: olyaFrames.length, petro: petroFrames.length, vira: viraFrames.length };
  for (const [who, frames, upTo] of [['stage', stageFrames, liesFrames.stage], ['olya', olyaFrames, liesFrames.olya], ['petro', petroFrames, liesFrames.petro], ['vira', viraFrames, liesFrames.vira]] as const) {
    const text = frames.slice(0, upTo).join('\n');
    for (const secret of ['Барселона', 'Мадрид', 'Лондон', 'Брюссель']) {
      const at = text.indexOf(secret);
      expect(at < 0, `${who} got «${secret}» during the lies: ${text.slice(Math.max(0, at - 150), at + 150)}`).toBe(true);
    }
  }
  for (const [who, frames, upTo] of [['stage', stageFrames, liesFrames.stage], ['vira', viraFrames, liesFrames.vira]] as const) {
    expect(frames.slice(0, upTo).join('\n').includes('Рим'), `${who} got a lie of another player during the lies`).toBe(false);
  }
  const fromChoice = { stage: stageFrames.length, olya: olyaFrames.length, petro: petroFrames.length, vira: viraFrames.length };

  await writeLie(vira, 'Мілан');

  // 4. b1, вибір.
  await stage.getByText('Що з цього правда?', exact).waitFor();
  await expect.poll(() => stage.locator('.bluff-row').count()).toBe(5);
  const stageChoice = await stage.locator('.bluff-text').allTextContents();
  expect(stageChoice.filter((text) => text === 'Рим'), 'merged lie appears once').toHaveLength(1);
  expect(stageChoice).toEqual(expect.arrayContaining(['Мілан', 'Барселона']));
  expect(stageChoice.filter((text) => ['Мадрид', 'Лондон', 'Брюссель'].includes(text)), 'two spares fill up to five').toHaveLength(2);
  await expectStageFits(stage, 'p10f-stage-choice');
  await shot(stage, 'p10f-stage-choice');

  await expect.poll(() => olya.locator('.bluff-choice button').count()).toBe(5);
  const olyaRim = olya.locator('.bluff-choice button').filter({ has: olya.getByText('Рим', exact) });
  expect(await olyaRim.isDisabled()).toBe(true);
  await olyaRim.getByText('Твоя вигадка', exact).waitFor();
  expect(await olya.locator('.bluff-choice button:disabled').count()).toBe(1);
  for (const button of await olya.locator('.bluff-choice button').all()) expect((await button.boundingBox())!.height, 'option is a tap target').toBeGreaterThanOrEqual(44);
  await expectNoSideScroll(olya, 'p10f-phone-choice');
  await petro.locator('.bluff-choice button').first().waitFor();
  expect(await petro.locator('.bluff-choice button').filter({ has: petro.getByText('Рим', exact) }).isDisabled()).toBe(true);
  expect(await petro.locator('.bluff-choice button:disabled').count()).toBe(1);

  // Витік (вибір): варіанти без виду, авторів і виборів.
  const choiceLeak = (who: string, frames: string[], from: number) => {
    const text = framesBeforeReveal(frames).slice(from).join('\n');
    for (const secret of [/"kind":"(truth|lie|spare)"/, /"authors":\["/, /"pickedBy":\["/]) {
      const at = text.search(secret);
      expect(at < 0, `${who} got ${secret} before the reveal: ${text.slice(Math.max(0, at - 150), at + 150)}`).toBe(true);
    }
  };
  choiceLeak('stage', stageFrames, fromChoice.stage);
  choiceLeak('olya', olyaFrames, fromChoice.olya);
  choiceLeak('petro', petroFrames, fromChoice.petro);
  choiceLeak('vira', viraFrames, fromChoice.vira);

  await pickBluff(olya, 'Мілан');
  await pickBluff(petro, 'Барселона');
  await pickBluff(vira, 'Рим');
  await host.getByText('Запитання закрите').waitFor();

  const hostBoard = host.locator('.bluff-host .bluff-board');
  await hostBoard.waitFor();
  const rimRow = bluffRow(hostBoard, 'Рим');
  expect(await rimRow.innerText()).toContain('Вигадка: Оля, Петро');
  expect(await rimRow.innerText()).toContain('Купилися: Віра');
  expect(await bluffRow(hostBoard, 'Барселона').innerText()).toContain('Правда');
  expect(await host.getByRole('button', { name: /^(Правильно|Частково|Не зараховувати)/ }).count(), 'no grading buttons').toBe(0);
  await hostBoard.scrollIntoViewIfNeeded();
  await shot(host, 'p10f-host-choice');

  // 5. b1, розкриття.
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Відкрити варіант 1 з 5', ...exact }).waitFor();
  expect(await openOptions(stage), 'nothing is open yet').toEqual([]);
  const nextOption = host.getByRole('button', { name: /^Відкрити варіант / });
  expect((await nextOption.boundingBox())!.height, 'next option button is a tap target').toBeGreaterThanOrEqual(44);
  let afterFour: string[] = [];
  for (let n = 1; n <= 4; n += 1) {
    await host.getByRole('button', { name: `Відкрити варіант ${n} з 5`, ...exact }).click();
    await expect.poll(async () => (await openOptions(stage)).length).toBe(n);
    afterFour = await openOptions(stage);
    expect(afterFour, `the truth opens last, not at step ${n}`).not.toContain('Барселона');
  }
  const opened = (await stage.locator('.bluff-row:not(.is-closed)').allInnerTexts()).join('\n');
  expect((opened.match(/Запасна вигадка ведучого/g) ?? []).length).toBe(2);
  const stageMilan = await bluffRow(stage, 'Мілан').innerText();
  expect(stageMilan).toContain('Вигадка: Віра');
  expect(stageMilan).toContain('Купилися: Оля');
  expect(await bluffRow(stage, 'Рим').innerText()).toContain('Вигадка: Оля, Петро');
  expect(await stage.locator('.bluff-row.is-truth').count(), 'the truth is not marked yet').toBe(0);
  expect(await stage.locator('.bluff-row.is-closed').count()).toBe(1);
  expect(await stage.locator('.bluff-row.is-closed .bluff-text').innerText()).toBe('Барселона');
  await expect.poll(() => stage.locator('.bluff-row.is-flipping').count()).toBe(0);
  await expectStageFits(stage, 'p10f-stage-reveal-half');
  await shot(stage, 'p10f-stage-reveal-half');

  await petro.getByText('Правду відкриють останньою', exact).waitFor();
  expect(await bodyText(petro)).not.toContain('Ти знайшов правду');
  expect(await bodyText(petro)).not.toMatch(/1\s?500/);
  for (const [who, frames] of [['stage', stageFrames], ['olya', olyaFrames], ['petro', petroFrames], ['vira', viraFrames]] as const) {
    expect(frames.join('\n').includes('"kind":"truth"'), `${who} got the truth before it was opened`).toBe(false);
  }

  await host.getByRole('button', { name: 'Відкрити варіант 5 з 5', ...exact }).click();
  await expect.poll(async () => (await openOptions(stage)).length).toBe(5);
  expect((await openOptions(stage)).filter((text) => !afterFour.includes(text))).toEqual(['Барселона']);
  const truthRow = bluffRow(stage, 'Барселона');
  expect(await truthRow.innerText()).toContain('Правда');
  expect(await truthRow.innerText()).toContain('Купилися: Петро');
  await expect.poll(() => stage.locator('.bluff-row.is-flipping').count()).toBe(0);
  await expectStageFits(stage, 'p10f-stage-reveal-full');
  await shot(stage, 'p10f-stage-reveal-full');
  expect(await host.getByRole('button', { name: /^Відкрити/ }).count(), 'no open buttons once everything is open').toBe(0);

  await petro.getByText('Ти знайшов правду!', exact).waitFor();
  await petro.getByText('На твою вигадку купилися: 1', exact).waitFor();
  expect(await bodyText(petro)).toMatch(/1\s?500/);
  await expectNoSideScroll(petro, 'p10f-phone-result');
  expect(await totalOf(host, 'Оля')).toBe(500);
  expect(await totalOf(host, 'Петро')).toBe(1500);
  expect(await totalOf(host, 'Віра')).toBe(500);
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, vira, stage);

  // 6. b2: без вигадки, «До вибору», «Прибрати».
  await stage.getByText('Вигадайте відповідь на телефоні', exact).waitFor();
  await writeLie(olya, 'Дурня');
  await writeLie(petro, 'Сула');
  await stage.getByText('Вигадали 2 з 3', exact).waitFor();
  await click(host, 'До вибору');
  await stage.getByText('Що з цього правда?', exact).waitFor();
  await expect.poll(() => stage.locator('.bluff-row').count()).toBe(4);
  expect(await stage.locator('.bluff-text').allTextContents()).toEqual(expect.arrayContaining(['Дурня', 'Південний Буг', 'Псел', 'Сула']));

  const removeLie = host.getByRole('button', { name: 'Прибрати «Дурня»', ...exact });
  expect((await removeLie.boundingBox())!.height, 'remove is a tap target').toBeGreaterThanOrEqual(44);
  await removeLie.click();
  await expect.poll(() => stage.locator('.bluff-row').count()).toBe(3);
  await expect.poll(() => vira.locator('.bluff-choice button').count()).toBe(3);
  await expect.poll(() => olya.locator('.bluff-choice button').count()).toBe(3);
  expect(await stage.locator('.bluff-text').allTextContents()).not.toContain('Дурня');
  expect(await vira.locator('.bluff-choice').innerText()).not.toContain('Дурня');
  await host.locator('.bluff-row.is-removed').waitFor();
  await host.locator('.bluff-host').scrollIntoViewIfNeeded();
  await shot(host, 'p10f-host-removed');

  await pickBluff(olya, 'Південний Буг');
  await pickBluff(petro, 'Псел');
  await pickBluff(vira, 'Сула');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Відкрити всі');
  await expect.poll(() => openOptions(stage)).toHaveLength(3);
  expect(await openOptions(stage)).not.toContain('Дурня');
  await expect.poll(() => stage.locator('.bluff-row.is-flipping').count()).toBe(0);
  await expectStageFits(stage, 'p10f-stage-reveal-b2');
  await shot(stage, 'p10f-stage-reveal-b2');
  expect(await totalOf(host, 'Оля')).toBe(1500);
  expect(await totalOf(host, 'Петро')).toBe(2000);
  expect(await totalOf(host, 'Віра')).toBe(500);
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, vira, stage);

  // 7. q1.
  await stage.getByText('Кінець?', exact).waitFor();
  await olya.getByRole('button', { name: /Так/ }).click();
  await petro.getByRole('button', { name: /Так/ }).click();
  await vira.getByRole('button', { name: /Ні/ }).click();
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');

  // 8. Історія.
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Блеф 10f/ }).click();
  const items = host.locator('.rows.stacked > li');
  await items.first().waitFor();
  const first = items.filter({ hasText: 'Ейфелеву вежу' });
  const history1 = await first.locator('.history-bluff').innerText();
  expect(history1).toContain('Правда');
  expect(history1).toContain('Вигадка: Оля, Петро');
  expect(history1).toContain('Купилися: Віра');
  await first.getByText('Відповіді (3)').click();
  await first.locator('.responses li', { hasText: 'Оля' }).getByText('вигадка «Рим» · вибір «Мілан» ✗ · купилися: 1', { exact: false }).waitFor();
  const second = items.filter({ hasText: 'Найдовша річка' });
  const history2 = await second.locator('.history-bluff').innerText();
  expect(history2).toContain('Дурня');
  expect(history2).toContain('Прибрано');
  await shot(host, 'p10f-history');

  expect(problems).toEqual([]);
}

/** Натискає «Далі» (take false) чи «Забрати …» (take true) на телефоні. */
async function decide(page: Page, take: boolean): Promise<void> {
  const button = take ? page.getByRole('button', { name: /^Забрати \d/ }) : page.getByRole('button', { name: 'Далі', ...exact });
  expect((await button.boundingBox())!.height, 'decision button is a tap target').toBeGreaterThanOrEqual(44);
  await button.click();
}

/** Стан гравця на драбині сцени чи пульта: текст групи, у якій стоїть нікнейм. */
async function ladderGroupOf(page: Page, nickname: string): Promise<string> {
  const group = page.locator('.wipeout-group').filter({ has: page.locator('li .name', { hasText: new RegExp(`^${nickname}$`) }) });
  return (await group.locator('h3').first().textContent())!.trim();
}

const NL = '\n';

/** Кадри від позиції from до першого розкриття після неї (для перевірки витоку одного запитання). */
const framesUntilNextReveal = (frames: string[], from: number) => {
  const rest = frames.slice(from);
  const at = rest.findIndex((f) => f.includes('"phase":"reveal"'));
  return at < 0 ? rest : rest.slice(0, at);
};

it('part 10g: wipeout — the editor builds a ladder with rising prices (375 px too), only players still in answer, a wrong answer burns the bank, take or go on the phone with a countdown, the host waits and pauses the window, a text verdict overridden on the reveal, survivors cash in at the end, no buffs or debuffs, the ladder instead of the leaderboard, banks never leak before the reveal, ladder states in the history', async () => {
  try {
    await wipeoutGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function wipeoutGame() {
  const host = await open('host10g', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10g@example.com');

  const common = { imageUrl: null, video: null, timeLimit: 20 };
  const q0 = { ...common, id: 'q0', type: 'single' as const, text: 'Розминка: 2 + 2?', points: 100, options: [{ id: 'q0-4', text: '4' }, { id: 'q0-5', text: '5' }], correctId: 'q0-4' };
  const w1 = {
    ...common,
    id: 'w1',
    type: 'single' as const,
    text: 'Столиця Канади?',
    points: 100,
    options: [{ id: 'w1-a', text: 'Оттава' }, { id: 'w1-b', text: 'Торонто' }, { id: 'w1-c', text: 'Монреаль' }],
    correctId: 'w1-a',
  };
  const w2 = { ...common, id: 'w2', type: 'boolean' as const, text: 'Канберра — столиця Австралії', points: 200, correct: true };
  const w3 = { ...common, id: 'w3', type: 'numeric' as const, text: 'Скільки сантиметрів в одному метрі?', points: 300, correct: 100, tolerance: 0 };
  const w4 = { ...common, id: 'w4', type: 'text' as const, text: 'Столиця Туреччини?', points: 400, accepted: ['Анкара'] };
  const w5 = { ...common, id: 'w5', type: 'slider' as const, text: 'Скільки країн-членів має ООН?', points: 500, min: 150, max: 210, step: 1, correct: 193, tolerance: 2 };
  const data = {
    ...makeRoundsQuiz(
      [
        classicRound('r1', [q0] as never, { title: 'Розминка', speedBonus: false, rules: DEFAULT_RULES, shuffleOptions: false }),
        wipeoutRound('rw', [w1, w2, w3, w4, w5] as never, { title: 'Драбина', shuffleOptions: false }),
        classicRound('r3', [{ ...q0, id: 'q9', text: 'Кінець?' }] as never, { title: 'Після драбини', speedBonus: false, rules: DEFAULT_RULES, shuffleOptions: false }),
      ],
      { leaderboard: 'each', buffs: ['double'], debuffs: ['fog'] },
    ),
    title: 'Ва-банк 10g',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Ва-банк 10g' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  await host.locator('.round-tab', { hasText: 'Драбина' }).click();
  await expect.poll(() => host.locator('.question-list .question-item-price').allTextContents()).toEqual(['100', '200', '300', '400', '500']);
  await openRoundSettings(host);
  const settingsPanel = host.locator('details.round-settings');
  await settingsPanel.getByText('Правил балів, бафів, дебафів і дуелей у «Ва-банк» немає.', exact).waitFor();
  await settingsPanel.locator('.with-help button').first().waitFor();
  expect(await host.getByLabel(/Штраф|Мінус за помилку/).count(), 'no penalty rule in a wipeout').toBe(0);
  await shot(host, 'p10g-editor-wipeout');
  expect(await host.getByRole('group', { name: 'Тип запитання', ...exact }).getByRole('button').count(), 'five question types').toBe(5);

  await click(host, '+ Раунд');
  await click(host, 'Ва-банк');
  await expect.poll(() => host.locator('.question-list .question-item-price').allTextContents()).toEqual(['100', '200', '300', '400', '500']);
  await shot(host, 'p10g-editor-new-wipeout');
  await click(host, 'Додати запитання');
  await expect.poll(() => host.locator('.question-list .question-item-price').allTextContents()).toEqual(['100', '200', '300', '400', '500', '600']);
  await click(host, 'Видалити раунд');
  await host.locator('.round-tab', { hasText: 'Драбина' }).click();
  expect(await host.locator('.round-tab').count()).toBe(3);

  await host.setViewportSize({ width: 375, height: 812 });
  await settingsPanel.scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10g-editor-wipeout-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // 2. Гра.
  await host.locator('.quiz-list li', { hasText: 'Ва-банк 10g' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10g', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya10g', 375, 812);
  const petro = await open('petro10g', 375, 812);
  const vira = await open('vira10g', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const viraFrames = socketFrames(vira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(vira, code, 'Віра', false);
  const phones = [olya, petro, vira];
  const all = [host, stage, ...phones];
  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // Розминка: усі «4», по 100.
  for (const page of phones) await page.getByRole('button', { name: /(^|\s)4$/ }).click();
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await afterSplash(...all);

  // 3. Інтро «Ва-банк»: на сцені лише сходинки.
  await stage.locator('.wipeout-ladder').waitFor();
  await expect.poll(() => stage.locator('.wipeout-step').count()).toBe(5);
  expect(await stage.locator('.wipeout-group').count(), 'the intro ladder shows steps only').toBe(0);
  await expectStageFits(stage, 'p10g-stage-intro');
  await shot(stage, 'p10g-stage-intro');
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 4. w1.
  await stage.getByText('Столиця Канади?', exact).waitFor();
  await expectStageFits(stage, 'p10g-stage-question');
  await tapBuff(olya, 'Подвійні бали', 'У «Ва-банк» бафів немає.');
  await shot(olya, 'p10g-phone-no-buffs');
  expect(await host.locator('.player-row', { hasText: 'Оля' }).getByRole('button', { name: 'Дебаф', ...exact }).count(), 'no debuffs in a wipeout').toBe(0);
  for (const page of phones) await pickOption(page, 'Оттава');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  for (const page of phones) await page.getByText('Банк: 100', exact).waitFor();
  await shot(olya, 'p10g-phone-reveal');

  await click(host, 'Далі');
  await stage.getByText('Вирішили 0 з 3', exact).waitFor();
  await stage.locator('[role=timer]').waitFor();
  await expectStageFits(stage, 'p10g-stage-ladder');
  await shot(stage, 'p10g-stage-ladder');
  const deciding = host.getByRole('button', { name: /^Гравці вирішують/ });
  await deciding.waitFor();
  expect(await deciding.isDisabled(), 'the host waits while players decide').toBe(true);
  await shot(host, 'p10g-host-deciding');

  // Пауза: відлік стоїть, поки вікно на паузі (повільні перевірки — під паузою, щоб вікно не збігло).
  await host.getByRole('button', { name: 'Пауза', ...exact }).first().click();
  await petro.getByText('Не вибереш за 10 с — банк забереться сам.', exact).waitFor();
  await petro.getByRole('button', { name: 'Забрати 100', ...exact }).waitFor();
  await petro.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await expectNoSideScroll(petro, 'p10g-phone-decide');
  await vira.getByRole('button', { name: 'Таблиця', ...exact }).click();
  const sheet = vira.getByRole('dialog', { name: 'Таблиця', ...exact });
  await sheet.waitFor();
  for (const nick of ['Оля', 'Петро', 'Віра']) await sheet.getByText(nick, exact).first().waitFor();
  expect(await sheet.innerText()).toContain('100');
  await vira.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  const timerOf = () => petro.locator('[role=timer]').getAttribute('aria-label');
  const held = await timerOf();
  await petro.waitForTimeout(1500);
  expect(await timerOf(), 'the countdown stands still on pause').toBe(held);
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();

  // Рішення наживо: пульт бачить вибір, сцена й чужі телефони — лише «вирішив».
  await decide(petro, false);
  await host.locator('.host-wipeout li', { hasText: 'Петро' }).getByText('іде далі', exact).waitFor();
  await stage.locator('.wipeout-group li', { hasText: 'Петро' }).getByText('✓ вирішив', exact).waitFor();
  await stage.getByText('Вирішили 1 з 3', exact).waitFor();
  for (const [who, page] of [['stage', stage], ['olya', olya], ['vira', vira]] as const) {
    expect(await bodyText(page), `${who} sees a decision`).not.toMatch(/забирає|іде далі/);
  }
  await decide(olya, false);
  await decide(vira, false);
  await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();
  await expect.poll(() => stage.locator('[role=timer]').count(), POLL).toBe(0);
  expect(await ladderGroupOf(stage, 'Петро')).toBe('У грі');

  const fromW2 = { stage: stageFrames.length, petro: petroFrames.length, vira: viraFrames.length };
  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 5. w2: Оля помиляється.
  await stage.getByText('Канберра — столиця Австралії', exact).waitFor();
  await pickOption(olya, '(^|\\s)Ні$');
  await pickOption(petro, '(^|\\s)Так$');
  await pickOption(vira, '(^|\\s)Так$');
  await host.getByText('Запитання закрите').waitFor();
  for (const [who, frames, from] of [['stage', stageFrames, fromW2.stage], ['petro', petroFrames, fromW2.petro], ['vira', viraFrames, fromW2.vira]] as const) {
    const text = framesUntilNextReveal(frames, from).join('\n');
    const at = text.indexOf('"status":"burned"');
    expect(at < 0, `${who} got a burned status before the reveal: ${text.slice(Math.max(0, at - 150), at + 150)}`).toBe(true);
  }
  await click(host, 'Показати відповідь');
  await olya.getByText('Банк згорів', exact).first().waitFor();
  await expectNoSideScroll(olya, 'p10g-phone-burned');
  await click(host, 'Далі');
  await stage.getByText('Вирішили 0 з 2', exact).waitFor();
  expect(await ladderGroupOf(stage, 'Оля')).toBe('Згоріли');
  expect(await olya.getByRole('button', { name: /^Забрати/ }).count(), 'a burned player cannot decide').toBe(0);
  await decide(petro, true);
  await host.locator('.host-wipeout li', { hasText: 'Петро' }).getByText('забирає', exact).waitFor();
  await shot(host, 'p10g-host-live');
  for (const [who, page] of [['stage', stage], ['olya', olya], ['vira', vira]] as const) {
    expect(await bodyText(page), `${who} sees the take`).not.toMatch(/забирає|іде далі/);
  }
  await decide(vira, false);
  await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();
  expect(await totalOf(host, 'Петро')).toBe(400);
  expect(await totalOf(host, 'Віра')).toBe(100);

  // Рішення інших не доходять до сцени; Оля й Віра не бачили, що забрав Петро (власне «далі» вони бачать).
  expect(stageFrames.join(NL), 'the stage got a live decision').not.toMatch(/"decision":"(take|stay)"/);
  for (const [who, frames] of [['olya', olyaFrames], ['vira', viraFrames]] as const) {
    expect(frames.join(NL), `${who} got the take of Petro`).not.toContain('"decision":"take"');
  }

  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 6. w3: грає лише Віра.
  await stage.getByText('Скільки сантиметрів в одному метрі?', exact).waitFor();
  await olya.getByText('Ти вже не граєш у цьому раунді — дивись.', exact).waitFor();
  expect(await field(olya, 'Ваша відповідь').count(), 'no answer field for a burned player').toBe(0);
  await shot(olya, 'p10g-phone-out');
  await petro.getByText('Ти вже не граєш у цьому раунді — дивись.', exact).waitFor();
  expect(await field(petro, 'Ваша відповідь').count()).toBe(0);
  await numericAnswer(vira, '100');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await vira.getByText('Банк: 600', exact).waitFor();
  for (const page of [olya, petro]) await page.getByText('Ти дивишся', exact).first().waitFor();
  for (const [who, page] of [['stage', stage], ['olya', olya], ['petro', petro]] as const) expect(await bodyText(page), `${who} sees the bank of Vira`).not.toContain('Банк: 600');
  await click(host, 'Далі');
  await decide(vira, false);
  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 7. w4: ручна оцінка.
  await stage.getByText('Столиця Туреччини?', exact).waitFor();
  await numericAnswer(vira, 'Анкарра');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await vira.getByText('Банк згорів', exact).first().waitFor();
  await host.locator('.rows li', { hasText: 'Віра' }).getByRole('button', { name: 'Зарахувати', ...exact }).click();
  await vira.getByText('Банк: 1000', exact).waitFor();
  await shot(host, 'p10g-host-override');
  await click(host, 'Далі');
  await decide(vira, false);
  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 8. w5: повзунок у межах допуску, банк доноситься до кінця.
  await stage.getByText('Скільки країн-членів має ООН?', exact).waitFor();
  await vira.getByRole('slider', { name: 'Повзунок', ...exact }).fill('195');
  await click(vira, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await vira.getByText('Банк: 1500', exact).waitFor();
  await click(host, 'Далі');
  await vira.getByText('Донесено до кінця: 1500', exact).waitFor();
  await olya.getByText('Банк згорів', exact).first().waitFor();
  await petro.getByText('Забрано 300', exact).first().waitFor();
  await expectNoSideScroll(vira, 'p10g-phone-survived');
  expect(await totalOf(host, 'Віра')).toBe(1600);
  expect(await totalOf(host, 'Петро')).toBe(400);
  expect(await totalOf(host, 'Оля')).toBe(100);
  await shot(stage, 'p10g-stage-round-end');
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  // 9. Історія.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Ва-банк 10g/ }).click();
  const items = host.locator('.rows.stacked > li');
  await items.first().waitFor();
  const history2 = await items.filter({ hasText: 'Канберра' }).innerText();
  expect(history2).toContain('Оля — банк згорів');
  expect(history2).toContain('Петро — забрав(-ла) 300');
  expect(await items.filter({ hasText: 'країн-членів' }).innerText()).toContain('Віра — доніс(-ла) 1500');
  await shot(host, 'p10g-history');

  expect(problems).toEqual([]);
}
