import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { blitzRound, boardRound, classicRound, finalRound, makeQuiz, makeRoundsQuiz, multi, order, single, withId, withPoints, withVideo } from '@quiz/engine/testing';
import { DEFAULT_RULES } from '@quiz/shared';
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

/** Знімок екрана для перевірки дизайну: лише з E2E_SHOTS=1, у звичайному прогоні нічого не робить. */
async function shot(page: Page, name: string) {
  if (process.env.E2E_SHOTS !== '1') return;
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
  const port = await freePort();
  base = `http://localhost:${port}`;
  ctx = await buildApp({ db: await createTestDb(), auth: { ...TEST_AUTH, baseURL: base }, webRoot: WEB, rng });
  await ctx.app.listen({ port, host: '127.0.0.1' });
  browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', headless: true });
});

beforeEach(() => {
  problems.length = 0;
  rigged.length = 0;
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

async function open(name: string, width: number, height: number): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'uk-UA' });
  contexts.push(context);
  // YouTube не вантажиться з мережі: сторінка вбудовування підміняється заглушкою.
  await context.route(/youtube(-nocookie)?\.com|youtu\.be|ytimg\.com/, (route) =>
    route.fulfill({ contentType: 'text/html', body: youtubeStub(route.request().url()) }),
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`${name}: ${error.message} @ ${page.url()}`));
  page.on('console', (message) => {
    // Відвідувач без акаунта отримує 401 на запит «хто я»: це очікувана відповідь, а не збій.
    const expected = message.text().includes('401 (Unauthorized)');
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
  expect(await olya.locator('.debuff-guest').count()).toBe(4);
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
  await noLeaks(petro, s4Words, null, 'petro board');
  await noLeaks(stage, s4Words, null, 'stage board');
  await expectNoSideScroll(petro, 'sort7f-board-watch-phone');
  // Глядач бачить живий прогрес того, хто сортує; останнє слово одразу відкриває відповідь.
  for (let i = 0; i < 3; i++) await sortBy(olya, 'tap', where[(await sortCard(olya))!]!);
  await petro.locator('.sort-progress', { hasText: '3 з 4' }).waitFor();
  await noLeaks(petro, s4Words, null, 'petro board progress');
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
  for (const name of ['Запитання в залі', 'Підказка ведучого', 'Заміна запитання']) {
    expect(await box(buffGroup, name).isDisabled(), name).toBe(true);
    expect(await box(buffGroup, name).isChecked(), name).toBe(false);
    await buffGroup.locator('label.powers-item', { hasText: name }).locator('.powers-soon').getByText('скоро', exact).waitFor();
  }
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
  await petro.locator('.question-head .buff-wait').getByText(/^Чекаємо: Іра · 0:\d\d$/).waitFor();
  await shot(stage, 'buff8a-overtime-stage');
  await shot(petro, 'buff8a-overtime-phone');
  await shot(ira, 'buff8a-overtime-mine');
  await shot(host, 'buff8a-overtime-host');
  await host.setViewportSize({ width: 375, height: 812 });
  await host.getByRole('button', { name: 'Не чекати', ...exact }).waitFor();
  await expectNoSideScroll(host, 'buff8a-overtime-host-375');
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
  await tapBuff(ira, '50/50', '«50/50» не діє на запитання цього типу.');
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
