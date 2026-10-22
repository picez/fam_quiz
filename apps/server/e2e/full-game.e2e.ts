import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { makeQuiz, single } from '@quiz/engine/testing';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
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
const problems: string[] = [];
const pages = new Map<string, Page>();
const ARTIFACTS = resolve(import.meta.dirname, 'artifacts');

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
  ctx = await buildApp({ db: await createTestDb(), auth: { ...TEST_AUTH, baseURL: base }, webRoot: WEB });
  await ctx.app.listen({ port, host: '127.0.0.1' });
  browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', headless: true });
});

afterAll(async () => {
  await browser?.close();
  await ctx?.app.close();
});

async function open(name: string, width: number, height: number): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'uk-UA' });
  // YouTube не вантажиться з мережі: сторінка вбудовування підміняється заглушкою.
  await context.route(/youtube(-nocookie)?\.com|youtu\.be|ytimg\.com/, (route) =>
    route.fulfill({ contentType: 'text/html', body: youtubeStub(route.request().url()) }),
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`${name}: ${error.message}`));
  page.on('console', (message) => {
    // Відвідувач без акаунта отримує 401 на запит «хто я»: це очікувана відповідь, а не збій.
    const expected = message.text().includes('401 (Unauthorized)');
    if (message.type() === 'error' && !expected) problems.push(`${name} console: ${message.text()}`);
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
  await host.locator('.file-pick input').setInputFiles({ name: 'map.png', mimeType: 'image/png', buffer: PIXEL });
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

it('a blitz round: pending answers with re-pick, the queue decides, −15 s, the podium shows it', async () => {
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
  await host.locator('label.field', { hasText: 'Спроб на запитання' }).locator('select').selectOption('1');
  await host.locator('label.field', { hasText: 'Перевірка' }).locator('select').selectOption('auto');

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

  // Запитання 1: Анна натискає першою й помиляється, Борис відповідає правильно.
  await click(anna, 'Відповісти');
  await anna.getByText('Ви 1-й у черзі').waitFor();
  await anna.getByRole('button', { name: /Львів/ }).click();
  // Помаранчевий стан: відповідь Анни бачить уся кімната, ведучий вирішує.
  await stage.getByText('Відповідає Анна').waitFor();
  await stage.locator('.choice.is-pending', { hasText: 'Львів' }).waitFor();
  await host.getByRole('button', { name: 'Прийняти', ...exact }).waitFor();
  await host.getByRole('button', { name: 'Перевибрати', ...exact }).waitFor();
  await shot(host, 'blitz-pending-host');
  await shot(stage, 'blitz-pending-stage');
  await click(boris, 'Відповісти');
  await boris.getByText('Ви 2-й у черзі').waitFor();
  await boris.getByText('Відповідає Анна').waitFor();
  await shot(boris, 'blitz-pending-phone-other');
  // Перевибір: Анна знову вибирає, Борис відповідає зі своєї черги.
  await click(host, 'Перевибрати');
  await anna.getByRole('button', { name: /Львів/ }).click();
  await stage.locator('.choice.is-pending', { hasText: 'Львів' }).waitFor();
  await click(host, 'Прийняти');
  // Помилка Анни світиться червоним, правильного варіанта ще немає. Борис ще не відповів, тож наступним помаранчевим буде лише його вибір.
  await stage.locator('.choice.is-wrong', { hasText: 'Львів' }).waitFor();
  expect(await stage.locator('.choice.is-correct').count()).toBe(0);
  await shot(stage, 'blitz-wrong-stage');
  await boris.getByRole('button', { name: /Київ/ }).click();
  await stage.locator('.choice.is-pending', { hasText: 'Київ' }).waitFor();
  await click(host, 'Прийняти');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await stage.getByText('Першим правильно відповів: Борис').waitFor();
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

  // Заставка: кубик на сцені, порядок за приєднанням, старт раунду.
  await click(host, 'Почати гру');
  await click(host, 'Кинути кубик');
  await stage.locator('.dice.is-rolling').waitFor();
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
  await click(host, 'Кинути кубик');
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

  // Хід 2: Богдан, бліц без штрафу; до вибору сцена й телефони не бачать типу, пульт бачить.
  await bohdan.getByText('Ваш хід: виберіть клітинку').waitFor();
  expect(await host.locator('.gb-kind').count()).toBeGreaterThan(0);
  expect(await stage.locator('.gb-kind').count()).toBe(0);
  expect(await alla.locator('.gb-kind').count()).toBe(0);
  expect(await bohdan.locator('.gb-kind').count()).toBe(0);
  await cell(bohdan, 'Річки', 100).click();
  for (const page of [stage, alla, bohdan, vira]) await page.getByText('Бліц', exact).first().waitFor();
  await bohdan.getByRole('button', { name: 'Відповісти', ...exact }).waitFor();
  await alla.getByRole('button', { name: 'Відповісти', ...exact }).waitFor();
  await shot(alla, 'blitz-cell-buzz-phone');
  await shot(bohdan, 'blitz-cell-buzz-chooser');
  await click(alla, 'Відповісти');
  await click(vira, 'Відповісти');
  await alla.getByRole('button', { name: /Ні/ }).click();
  await stage.locator('.choice.is-pending', { hasText: 'Ні' }).waitFor();
  expect(await stage.locator('.choice.is-correct').count()).toBe(0);
  await vira.getByText('Відповідає Алла').waitFor();
  await shot(stage, 'blitz-cell-pending-stage');
  await shot(host, 'blitz-cell-pending-host');
  await shot(vira, 'blitz-cell-phone-other');
  await click(host, 'Прийняти');
  await vira.getByRole('button', { name: /Так/ }).click();
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
  await click(bohdan, 'Відповісти');
  await bohdan.getByRole('button', { name: /Ні/ }).click();
  await click(host, 'Прийняти');
  await click(vira, 'Відповісти');
  await vira.getByRole('button', { name: /Так/ }).click();
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
  await host.getByRole('heading', { name: 'Зірка' }).waitFor();
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
  await host.getByRole('heading', { name: 'Зірка' }).waitFor();

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
