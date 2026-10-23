import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { blitzRound, boardRound, classicRound, makeQuiz, makeRoundsQuiz, multi, order, single, withId, withPoints, withVideo } from '@quiz/engine/testing';
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
  for (const [fx, fy] of [[0.2, 0.3], [0.5, 0.35], [0.8, 0.4], [0.5, 0.6], [0.3, 0.7]]) {
    await olya.mouse.move(zone.x + zone.width * fx!, zone.y + zone.height * fy!);
  }
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
  await shot(olya, 'debuff7d-mud-phone');
  const splat = (await olya.locator('.debuff-splat').first().boundingBox())!;
  for (let i = 0; i < 5; i++) {
    await olya.mouse.move(splat.x + splat.width / 2 + (i % 2 === 0 ? -2 : 2), splat.y + splat.height / 2);
  }
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
