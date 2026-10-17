import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
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
const exact = { exact: true };

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

it('a host and two players go from sign-up to the podium and the history', async () => {
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
  expect(await rows.nth(0).textContent()).toMatch(/Оля.*правильних: 6/);
  expect(await rows.nth(1).textContent()).toMatch(/Тарас.*правильних: 1/);

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
  await field(host, 'Штраф: мінус ціна запитання за хибну відповідь').check();
  await field(host, 'Серії: бонус за правильні відповіді підряд').check();
  // Рендериться лише вибраний раунд, тож це налаштування саме другого.
  await host.locator('details.round-settings .round-streak select').first().selectOption('2');
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

it('a blitz round: the queue decides, a wrong attempt costs points, the podium shows it', async () => {
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

  // Запитання 1: Анна натискає першою й помиляється, Борис відповідає правильно.
  await click(anna, 'Відповісти');
  await anna.getByText('Ви 1-й у черзі').waitFor();
  await click(boris, 'Відповісти');
  await boris.getByText('Ви 2-й у черзі').waitFor();
  await anna.getByRole('button', { name: /Львів/ }).click();
  await boris.getByRole('button', { name: /Київ/ }).click();
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await stage.getByText('Першим правильно відповів: Борис').waitFor();
  await click(host, 'Далі');
  await click(host, 'Наступне запитання');

  // Запитання 2: ніхто не натискає, ведучий закриває запитання.
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
