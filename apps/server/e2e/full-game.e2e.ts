import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
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

  await click(olya, 'Змінити нікнейм / аватар');
  await field(olya, 'Нікнейм').fill('Зірка');
  await olya.locator('.profile-editor input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PIXEL });
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
