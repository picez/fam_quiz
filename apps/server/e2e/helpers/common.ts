import { deflateSync } from 'node:zlib';
import { type PlayerView, type StateMeta } from '@quiz/shared';
import { type Locator, type Page } from 'playwright-core';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { expect } from 'vitest';
import { ukMessages } from '../../../web/src/i18n';
import { exact, youtubeStub, browser, base, problems, pages, contexts, shot, flags } from './setup';

/** Помічники, якими користуються кілька файлів наскрізних тестів (виділено з full-game.e2e.ts у 30b; порядок — як в оригіналі). */
export async function open(
  name: string,
  width: number,
  height: number,
  options: { reducedMotion?: 'reduce'; timezoneId?: string; permissions?: string[]; userAgent?: string; locale?: string; hasTouch?: boolean; isMobile?: boolean; deviceScaleFactor?: number } = {},
): Promise<Page> {
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
    // Частина 13b: форма входу питає місця збереженої гри й для коду, якого вже немає, — тихий 404 на /slots очікуваний лише там.
    const expected =
      message.text().includes('401 (Unauthorized)') ||
      (flags.restarting && message.text().includes('WebSocket connection to')) ||
      (flags.slots404Expected && message.text().includes('404 (Not Found)') && /\/api\/games\/by-code\/\d{6}\/slots$/.test(message.location().url)) ||
      (flags.banExpected && /403 \(Forbidden\)|404 \(Not Found\)/.test(message.text()) && /\/api\/(auth\/sign-in\/email|games\/by-code\/\d{6}(\/slots)?)$/.test(message.location().url));
    if (message.type() === 'error' && !expected) problems.push(`${name} console: ${message.text()} @ ${message.location().url}`);
  });
  page.on('dialog', (dialog) => void dialog.accept());
  pages.set(name, page);
  return page;
}

export const click = (page: Page, name: string) => page.getByRole('button', { name, ...exact }).click();
/** Рядок «Відповідей наживо» на пульті (11c). */
export const liveRow = (host: Page, name: string) => host.locator('#live-answers .live-row', { has: host.locator('.name', { hasText: name }) });
export const field = (page: Page, label: string) => page.getByLabel(label, exact);
export const questionText = (page: Page) => page.locator('.question-field textarea');

/** З'єднує пари на телефоні: дотик ліворуч, потім праворуч. */
export async function connect(page: Page, pairs: [string, string][]): Promise<void> {
  for (const [l, r] of pairs) {
    await page.locator('.match-left', { hasText: l }).click();
    await page.locator('.match-right', { hasText: r }).click();
  }
}

/** Залишок часу запитання в секундах із таймера на екрані. */
export async function seconds(page: Page): Promise<number> {
  return Number(await page.getByRole('timer').first().getAttribute('aria-label'));
}

/** Розставляє елементи впорядкування на телефоні гравця в потрібному порядку. */
export async function arrange(page: Page, wanted: string[]) {
  for (const [target, text] of wanted.entries()) {
    for (;;) {
      const now = await page.locator('.order .order-text').allTextContents();
      if (now.indexOf(text) === target) break;
      await page.getByRole('button', { name: `Перемістити вгору: ${text}`, ...exact }).click();
    }
  }
}

/** Поле коду на головній; тому, хто увійшов, — спершу плитка «Доєднатись до гри» стартового меню (24a). */
export async function homeCodeField(page: Page): Promise<Locator> {
  const input = field(page, 'Код гри');
  const tile = page.getByRole('button', { name: 'Доєднатись до гри', ...exact });
  await input.or(tile).first().waitFor();
  if ((await tile.isVisible()) && (await tile.getAttribute('aria-expanded')) !== 'true') await tile.click();
  return input;
}

export async function join(page: Page, code: string, nickname: string, viaHome: boolean) {
  if (viaHome) {
    await page.goto(base);
    await (await homeCodeField(page)).fill(code);
    await click(page, 'Увійти');
  } else {
    await page.goto(`${base}/play/${code}`);
  }
  const input = field(page, 'Ваше ім’я');
  await input.fill(nickname);
  // Увійшовшому форма сама підставляє нік профілю, лише поки поле порожнє; якщо відповідь прийшла посеред fill (поле вже
  // виділене, але ще порожнє), текст дописується до підставленого («ОляОля»). Після fill поле вже не порожнє, тож досить одного повтору.
  if ((await input.inputValue()) !== nickname) await input.fill(nickname);
  await click(page, 'Увійти в гру');
  await page.getByText('Ви в грі. Чекаємо на старт.').waitFor();
}

/** Відкриває згорнуті «Налаштування раунду», якщо вони ще закриті. */
export async function openRoundSettings(page: Page) {
  const panel = page.locator('details.round-settings');
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
}

/** Увесь видимий текст сторінки. */
export const bodyText = (page: Page) => page.locator('body').innerText();

/** Телефон на своїй ширині: без прокручування вбік. */
export async function expectNoSideScroll(page: Page, name: string) {
  const fits = (await page.evaluate('document.documentElement.scrollWidth <= innerWidth')) as boolean;
  expect(fits, `${name}: horizontal scroll`).toBe(true);
  await shot(page, name);
}

export const MENU = 'nav.menu';
export const MENU_ITEMS_23A = ['Меню', 'Стрічка', 'Мої вікторини', 'Історія', 'Профіль'];
export const menuLinks = async (page: Page) =>
  (await page.locator(MENU).getByRole('link').allTextContents()).map((text) => text.replace(/^[^\p{L}]+/u, ''));

/** Телефон: сторінка не гортається вбік, а нижня панель не закриває останній елемент. */
export async function expectPhoneFit(page: Page, name: string) {
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

export const stat = (page: Page, label: string) =>
  page.locator('.stat').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) });

export async function register(page: Page, via: 'host' | 'menu', name: string, email: string) {
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

export async function myId(page: Page): Promise<string> {
  const me = (await (await page.request.get(`${base}/api/me`)).json()) as { id?: string; user?: { id: string } };
  return (me.user?.id ?? me.id)!;
}

export const noSideScroll = (page: Page) => page.evaluate('document.documentElement.scrollWidth <= innerWidth');

/** Верх кожного варіанта на екрані (px): варіанти не мають рухатися, поки росте черга. */
export const yOf = (page: Page) =>
  page.locator('.choice').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));

/** Кубик крутиться 1,2 с: результат чекаємо довше за типову секунду expect.poll. */
export const POLL = { timeout: 5000 };

export type Box = { x: number; y: number; width: number; height: number };
/** Чи перетинаються два прямокутники (з допуском у пів пікселя). */
export const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/** Фіксований елемент не накриває жодного з інших. */
export async function expectApart(page: Page, fixed: string, others: string[], label: string) {
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
export async function wipeWithMouse(page: Page, points: number[][]): Promise<void> {
  await page.mouse.move(8, 8);
  await page.mouse.down();
  for (const [x, y] of points) await page.mouse.move(x!, y!);
  await page.mouse.move(8, 8);
  await page.mouse.up();
}
export const SORT_ARROWS: Record<string, string> = { left: 'ArrowLeft', right: 'ArrowRight', top: 'ArrowUp', bottom: 'ArrowDown' };
export const sortZone = (page: Page, name: string) => page.getByRole('button', { name: `Категорія «${name}»`, ...exact });
/** Текст поточної картки; null — картки немає. */
export const sortCard = async (page: Page) => (await page.evaluate("document.querySelector('.sort-card')?.textContent ?? null")) as string | null;
/** Прямокутники зон у порядку сторінки, округлені до пікселя. */
export async function sortZoneBoxes(page: Page): Promise<number[][]> {
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
export async function sortBy(page: Page, how: 'tap' | 'key' | 'drag', zone: string) {
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

/** Дуелянт вписує відповідь і тисне «Відповісти»; чекає ack: поле очистилося (спроба) або зникло (правильна відповідь закрила запитання). */
export async function duelAnswer(page: Page, text: string) {
  await field(page, 'Ваша відповідь').fill(text);
  await click(page, 'Відповісти');
  await page.waitForFunction("(() => { const input = document.querySelector('.duel-answer input'); return input === null || input.value === ''; })()");
}

/** Кожен гравець відповідає правильно кнопкою варіанта; ведучий відкриває відповідь. */
export async function answerAll(host: Page, players: Page[]) {
  for (const page of players) {
    await page.getByRole('button', { name: /Київ/ }).click();
    await page.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
  }
  await click(host, 'Показати відповідь');
  for (const page of players) await page.locator('section.result').first().waitFor();
}

/** Усі тексти, що сторінка отримала сокетом: витік видно ще до того, як щось намальовано. */
export function socketFrames(page: Page): string[] {
  const list: string[] = [];
  page.on('websocket', (socket) => socket.on('framereceived', (frame) => list.push(String(frame.payload))));
  return list;
}

export const duelButton = (page: Page) => page.getByRole('button', { name: '⚔ Дуель', ...exact });

export const buffButton = (page: Page, name: string) => page.locator('.buff-row').getByRole('button', { name, ...exact });

/** Баф двома дотиками: перший просить підтвердження, другий бере; чекає, поки кнопка стане активною. */
export async function takeBuff(page: Page, name: string) {
  await buffButton(page, name).click();
  await page.locator('.buff-why').getByText(`Ще раз — узяти «${name}»`, exact).waitFor();
  await buffButton(page, name).click();
  await expect.poll(() => buffButton(page, name).getAttribute('class')).toContain('is-active');
}

/** Дотик неактивної кнопки бафу: рядок пояснень пише причину. */
export async function tapBuff(page: Page, name: string, why: string) {
  // aria-disabled: Playwright вважає кнопку вимкненою, але дотик пояснює причину.
  await buffButton(page, name).click({ force: true });
  await page.locator('.buff-why').getByText(why, exact).waitFor();
}

/** Дотик варіанта відповіді. */
export const pickOption = (page: Page, text: string) => page.getByRole('button', { name: new RegExp(text) }).click();

/** Число в полі відповіді й «Відповісти». */
export async function numericAnswer(page: Page, value: string) {
  await field(page, 'Ваша відповідь').fill(value);
  await click(page, 'Відповісти');
}

/** Верх і висота елемента, округлені до пікселя. */
export const boxOf = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { y: Math.round(box.y), height: Math.round(box.height) };
};

/** Текст у полі відповіді й «Відповісти». */
export const textAnswer = numericAnswer;

/** Голос в аркуші «… питає зал»: дотик варіанта або поле й «Голосувати»; чекає «Голос прийнято». */
export async function vote(page: Page, text: string) {
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

/** Чекає шар заставки потрібного виду. */
export async function splashOn(page: Page, kind: string) {
  await page.locator(`.splash.is-${kind}`).waitFor();
}

/** Чекає сторінку «Як грати» з потрібним заголовком. */
export async function guideOn(page: Page, title: string) {
  await page.locator('.guide-title', { hasText: title }).waitFor();
}

export const RESTARTING_TEXT = 'Сервер перезапускається… Гра продовжиться сама.';

/** Частка площі зони, яку вкривають елементи selector (сума площ їхніх перетинів із зоною). */
export const COVERED = (selector: string) => `(() => {
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

/** Шапка телефона в один рядок і в межах екрана: кожен її елемент перетинається по вертикалі з кожним. */
export const HEADER_ONE_LINE = `(() => {
  const items = [...document.querySelectorAll('header.bar > *')].map((el) => el.getBoundingClientRect()).filter((r) => r.height > 0);
  const header = document.querySelector('header.bar').getBoundingClientRect();
  return Math.max(...items.map((r) => r.top)) < Math.min(...items.map((r) => r.bottom)) && header.right <= innerWidth;
})()`;

/** Секунда тиші MP3 (кадри MPEG-1 Layer III з нульовими даними): Chromium її декодує. */
export function silentMp3(frames = 38): Buffer {
  return Buffer.concat(Array.from({ length: frames }, () => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)])));
}

/** Бали гравця за запитання з рядка відповідей пульта. */
export async function scoreOf(host: Page, nickname: string): Promise<number> {
  // 11c: до розкриття рядків відповідей немає (їх заступає панель наживо) — інакше .score знайшовся б у рядку «Гравці».
  await host.locator('#live-answers').waitFor({ state: 'detached' });
  const text = await host.locator('li', { hasText: nickname }).locator('.score').first().textContent();
  return Number(text!.replace(/[^\d-]/g, ''));
}

/** «Далі» з розкриття до наступного запитання (через проміжні кроки, якщо вони є). */
export async function toNextQuestion(host: Page) {
  await click(host, 'Далі');
  const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
  await next.waitFor({ timeout: 3000 }).then(() => next.click(), () => undefined);
}
/** Лише тексти відкритих підказок, без номерів. */
export const clueTexts = async (page: Page) => page.locator('.clue:not(.is-hidden) .clue-text').allTextContents();

/** Кадри сокета до першого кадру з phase "reveal" (для перевірки витоку). */
export const framesBeforeReveal = (frames: string[]) => frames.slice(0, Math.max(0, frames.findIndex((f) => f.includes('"phase":"reveal"'))));

/** Сума гравця в рядку «Гравці» пульта (не бали за запитання). */
export async function totalOf(host: Page, nickname: string): Promise<number> {
  const text = await host.locator('.player-row', { hasText: nickname }).locator('.score').first().textContent();
  return Number(text!.replace(/[^\d-]/g, ''));
}

/** Сцена 1280 × 720 не прокручується вниз. */
export async function expectStageFits(stage: Page, name: string) {
  const height = (await stage.evaluate('document.documentElement.scrollHeight')) as number;
  expect(height, `${name}: the stage scrolls (${height}px)`).toBeLessThanOrEqual(720);
}

/** Сцена без прокрутки й без обрізання: кожен блок сцени (і його прямі нащадки) в межах вікна — зверху теж. */
export async function expectStageInView(stage: Page, name: string) {
  await expectStageFits(stage, name);
  const clipped = (await stage.evaluate(`[...document.querySelectorAll('.stage-board, .stage-board > *, .stage-board > * > *, .stage-question > *')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.height > 0 && (r.top < -1 || r.bottom > innerHeight + 1))
    .map(({ el, r }) => el.className + ' ' + Math.round(r.top) + '..' + Math.round(r.bottom))`)) as string[];
  expect(clipped, `${name}: clipped by the screen edge`).toEqual([]);
}

/** Заповнює поля «Відповідь N» значеннями (не чіпаючи решти). */
export async function fillSurvey(page: Page, values: string[]): Promise<void> {
  for (const [i, value] of values.entries()) await field(page, `Відповідь ${i + 1}`).fill(value);
}

/** Заповнює поля «Відповідь N» значеннями й натискає «Відповісти». */
export async function answerSurvey(page: Page, values: string[]): Promise<void> {
  await fillSurvey(page, values);
  await click(page, 'Відповісти');
}

/** Пише вигадку й натискає «Надіслати вигадку». */
export async function writeLie(page: Page, text: string): Promise<void> {
  await field(page, 'Твоя вигадка').fill(text);
  await click(page, 'Надіслати вигадку');
}

/** Торкається варіанта з текстом на телефоні. */
export async function pickBluff(page: Page, text: string): Promise<void> {
  await page.locator('.bluff-choice button').filter({ has: page.getByText(text, exact) }).click();
}

/** Натискає «Далі» (take false) чи «Забрати …» (take true) на телефоні. */
export async function decide(page: Page, take: boolean): Promise<void> {
  const button = take ? page.getByRole('button', { name: /^Забрати \d/ }) : page.getByRole('button', { name: 'Далі', ...exact });
  expect((await button.boundingBox())!.height, 'decision button is a tap target').toBeGreaterThanOrEqual(44);
  await button.click();
}

/** Текст позначки вибору гравця на екрані «Рішення»; null — його там немає. */
export async function choiceOf(page: Page, nickname: string): Promise<string | null> {
  const li = page.locator('.wipeout-group.is-choices li').filter({ has: page.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) });
  return (await li.count()) === 0 ? null : (await li.locator('.wipeout-choice').textContent())!.trim();
}
/** Рядок гравця в колонці сцени чи списку сходинки. */
export const sideRow = (page: Page, nickname: string) => page.locator('.wipeout-side li, .wipeout-step-list li').filter({ has: page.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) });

export const NL = '\n';

/** Кадри від позиції from до першого розкриття після неї (для перевірки витоку одного запитання). */
export const framesUntilNextReveal = (frames: string[], from: number) => {
  const rest = frames.slice(from);
  const at = rest.findIndex((f) => f.includes('"phase":"reveal"'));
  return at < 0 ? rest : rest.slice(0, at);
};

/** Група, у якій стоїть нікнейм на дошці «живі / привиди» (сцена чи пульт): «Живі», «На межі» чи «Привиди». */
export async function survivalGroupOf(page: Page, nickname: string): Promise<string> {
  const group = page.locator('.survival-group').filter({ has: page.locator('li .name', { hasText: new RegExp(`^${nickname}$`) }) });
  return (await group.locator('h3').first().textContent())!.trim();
}

/** Підсумковий рахунок гравця в списку фінального екрана пульта. */
export async function podiumScore(host: Page, nickname: string): Promise<number> {
  const text = await host.locator('li', { hasText: nickname }).first().innerText();
  return Number(text.trim().split(/\s+/).pop());
}

export type SurvivalFrameView = { trial: Record<string, unknown> | null; rows: Record<string, unknown>[] };

/** Усі зрізи «Вибування» (об'єкти з rows, trial і verdict) у кадрах сокета. */
export function survivalViews(frames: string[]): SurvivalFrameView[] {
  const found: SurvivalFrameView[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value === null || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.rows) && 'trial' in object && 'verdict' in object) found.push(object as unknown as SurvivalFrameView);
    Object.values(object).forEach(walk);
  };
  for (const frame of frames) {
    const at = frame.indexOf('[');
    if (at < 0) continue;
    try {
      walk(JSON.parse(frame.slice(at)));
    } catch {
      // не JSON (службовий кадр)
    }
  }
  return found;
}

/** Поки випробування відкрите, у кадрах немає ні правильної відповіді, ні пасток, ні чужих дверей, ні чужих відповідей. Повертає, скільки таких кадрів було. */
export function openTrialLeaks(who: string, frames: string[], kind: 'question' | 'luck'): number {
  const open = survivalViews(frames).filter((view) => view.trial !== null && view.trial.stage === 'open' && view.trial.kind === kind);
  for (const view of open) {
    const trial = view.trial!;
    expect(trial.reveal, `${who}: the trial answer leaks while open`).toBeNull();
    if (trial.question !== null) expect(Object.keys(trial.question as object), `${who}: the trial question has a correct key`).not.toContain('correct');
    for (const row of view.rows) {
      expect(row.answer, `${who}: a trial answer is visible while open`).toBeNull();
      const door = row.door as { picked: number | null; trap: number | null } | null;
      if (door !== null) {
        expect(door.trap, `${who}: a trap is visible while open`).toBeNull();
        expect(door.picked, `${who}: a door pick of another player is visible while open`).toBeNull();
      }
    }
  }
  return open.length;
}

/** Натискає кнопку команди на телефоні в лобі. */
export async function pickTeamOn(page: Page, name: string): Promise<void> {
  const button = page.locator('.team-pick', { has: page.locator('.team-pick-name', { hasText: name }) });
  expect((await button.boundingBox())!.height, 'a team button is a tap target').toBeGreaterThanOrEqual(44);
  await button.click();
  await expect.poll(() => button.getAttribute('aria-pressed'), POLL).toBe('true');
}

/** Нікнейми в колонці команди на сцені. */
export async function stageTeam(stage: Page, name: string): Promise<string[]> {
  const column = stage.locator('.stage-team', { has: stage.locator('.stage-team-name', { hasText: name }) });
  return (await column.locator('.stage-team-members li').allTextContents()).map((text) => text.replace(/👑|капітан/g, '').trim());
}

/** Усі тексти, що сторінка надіслала сокетом. */
export function sentFrames(page: Page): string[] {
  const list: string[] = [];
  page.on('websocket', (socket) => socket.on('framesent', (frame) => list.push(String(frame.payload))));
  return list;
}

/** Рядок команди на пульті (за початком тексту: у рядку іншої команди може стояти «від гравця Сині»). */
export const teamRowOf = (host: Page, name: string) => host.locator('.player-row', { hasText: new RegExp(`^${name}`) });

/** Сума команди в рядку «Гравці» пульта. */
export async function teamTotal(host: Page, name: string): Promise<number> {
  const text = await teamRowOf(host, name).locator('.score').first().textContent();
  return Number(text!.replace(/[^\d-]/g, ''));
}

/** Клітинки раундів і Σ рядка учасника в таблиці 11f (аркуш телефона, пульт, історія). */
export async function scoreCells(scope: Locator, nickname: string): Promise<string[]> {
  const row = scope.locator('tr.score-row').filter({ has: scope.page().locator('.name', { hasText: nickname }) });
  return (await row.locator('td.round, td.total').allTextContents()).map((text) => text.trim());
}

/** Тексти рядків відкритої розбивки «мітка значення». */
export async function breakdownTexts(scope: Locator): Promise<string[]> {
  return (await scope.locator('.score-breakdown li').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
}

/** Гравець без браузера: вхід через API й сокет; сцені вистачає його рядка в таблиці. */
export async function socketPlayer(sockets: Socket[], code: string, nickname: string) {
  const response = await fetch(`${base}/api/games/by-code/${code}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  expect(response.status, nickname).toBe(201);
  const { token } = (await response.json()) as { token: string };
  const socket = connectSocket(base, { auth: { code, role: 'player', token }, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  await new Promise<void>((done, fail) => {
    socket.once('connect', () => done());
    socket.once('connect_error', fail);
  });
  return {
    nickname,
    socket,
    answer: async (value: boolean) => {
      const ack = await new Promise<{ ok: boolean }>((done) => socket.emit('player:answer', { type: 'boolean', value }, done));
      expect(ack.ok, `${nickname} answers`).toBe(true);
    },
  };
}

// ——— 11g: гра без ведучого. Учасники — сокети без браузера, сцена — сторінка 1280 × 720. ———

export const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
export type PilotAck = { ok: true } | { ok: false; error: string };
/** Допуск проміжків 11g: ранній таймер (PACE_GRACE_MS) і мережа з перемальовуванням. */
export const EARLY = 150;
export const LATE = 1500;

/** Учасник гри без браузера (11g): сокет за токеном, усі кадри state (at — час сервера в мить надсилання), дії з підтвердженням; reconnect — новий сокет з тим самим токеном. */
export async function pilotSocket(sockets: Socket[], code: string, token: string, nickname: string) {
  const frames: { view: PlayerView; meta: StateMeta; at: number }[] = [];
  const raw: string[] = [];
  /** Причини, з якими сервер закрив гру для цього учасника ('kicked' після вилучення). */
  const closed: string[] = [];
  let socket!: Socket;
  const connectOnce = () =>
    new Promise<void>((done, fail) => {
      const next = connectSocket(base, { auth: { code, role: 'player', token }, transports: ['websocket'], reconnection: false });
      sockets.push(next);
      next.on('state', (view: PlayerView, meta: StateMeta) => {
        frames.push({ view, meta, at: meta.serverNow });
        raw.push(JSON.stringify(view));
      });
      next.on('closed', (reason: string) => closed.push(reason));
      next.once('connect', () => {
        socket = next;
        done();
      });
      next.once('connect_error', (error) => {
        next.close();
        fail(error);
      });
    });
  const connect = async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await connectOnce();
      } catch (error) {
        if (attempt >= 5) throw error;
        await sleep(300);
      }
    }
  };
  await connect();
  return {
    nickname,
    frames,
    raw,
    closed,
    emit: (event: string, payload?: unknown) =>
      new Promise<PilotAck>((done) => {
        const timer = setTimeout(() => done({ ok: false, error: 'no_ack' }), 5000);
        const ack = (result: PilotAck) => {
          clearTimeout(timer);
          done(result);
        };
        if (payload === undefined) socket.emit(event, ack);
        else socket.emit(event, payload, ack);
      }),
    close: () => socket.close(),
    reconnect: async () => {
      socket.close();
      await connect();
    },
  };
}
export type Pilot = Awaited<ReturnType<typeof pilotSocket>>;

/** Вхід через API (/join) → pilotSocket. */
export async function pilotPlayer(sockets: Socket[], code: string, nickname: string): Promise<Pilot> {
  const response = await fetch(`${base}/api/games/by-code/${code}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  expect(response.status, nickname).toBe(201);
  const { token } = (await response.json()) as { token: string };
  return pilotSocket(sockets, code, token, nickname);
}

/** Чекає кадру, що задовольняє умову (серед кадрів з індексу from), і повертає його. */
export async function frame(player: Pilot, test: (view: PlayerView) => boolean, from = 0, timeout = 90_000) {
  const find = () => {
    const index = player.frames.findIndex((f, i) => i >= from && test(f.view));
    return index < 0 ? null : { ...player.frames[index]!, index };
  };
  await expect.poll(() => find() !== null, { timeout, interval: 25, message: `${player.nickname} never got the frame` }).toBe(true);
  return find()!;
}

/** Дія учасника, що має вдатися (кадр міг прийти раніше, ніж сервер відкрив крок: до 5 с повторів). */
export async function emitOk(player: Pilot, event: string, payload?: unknown) {
  const until = Date.now() + 5000;
  let result = await player.emit(event, payload);
  while (!result.ok && Date.now() < until) {
    await sleep(100);
    result = await player.emit(event, payload);
  }
  expect(result, `${player.nickname} ${event}`).toEqual({ ok: true });
}

/** Проміжок у допуску: від −150 мс (ранній таймер) до +late. */
export function expectGap(gap: number, wanted: number, label: string, late = LATE) {
  const note = `${label}: ${gap} ms, wanted ${wanted} −${EARLY} … +${late}`;
  expect(gap, note).toBeGreaterThanOrEqual(wanted - EARLY);
  expect(gap, note).toBeLessThanOrEqual(wanted + late);
}

/** Кімната-автопілот зі збереженої вікторини: токена ведучого немає, автор — гравець. */
export async function createAutopilot(author: Page, quizId: string) {
  const created = await author.request.post(`${base}/api/games`, { data: { quizId, autopilot: true, nickname: 'Марта' } });
  expect(created.status()).toBe(201);
  const room = (await created.json()) as { code: string; token: string; stageToken: string; hostToken?: string };
  expect(room.hostToken, 'an autopilot room has no host token').toBeUndefined();
  return room;
}

/** Кадри state з необроблених кадрів сокета сторінки. */
export function stateViews(frames: string[]): PlayerView[] {
  const views: PlayerView[] = [];
  for (const text of frames) {
    if (!text.startsWith('42["state",')) continue;
    try {
      views.push((JSON.parse(text.slice(2)) as [string, PlayerView])[1]);
    } catch {
      // Кадр обрізано.
    }
  }
  return views;
}

/** «Провести ботом» у списку вікторин → нікнейм → «Створити кімнату»; повертає код кімнати. */
export async function launchBot11h(page: Page, title: string, nickname: string): Promise<string> {
  await page.goto(`${base}/quizzes`);
  await page.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Провести ботом', ...exact }).click();
  const dialog = page.getByRole('dialog', { name: 'Гра без ведучого', ...exact });
  await dialog.getByLabel('Твій нікнейм у грі').fill(nickname);
  await dialog.getByRole('button', { name: 'Створити кімнату', ...exact }).click();
  await page.waitForURL(/\/play\/[^/]+$/);
  return page.url().split('/').pop()!;
}

/** Гість заходить у кімнату формою на /play/<code>. */
export async function joinBy11h(page: Page, code: string, nickname: string): Promise<void> {
  await page.goto(`${base}/play/${code}`);
  await field(page, 'Ваше ім’я').fill(nickname);
  await click(page, 'Увійти в гру');
  await page.getByText('Ви в грі. Чекаємо на старт.').waitFor();
}

/** Тексти рядків аркуша «Скасування балів» у групі запитання. */
export async function undoRows(scope: Locator): Promise<string[]> {
  return (await scope.locator('.undo-row .undo-row-text').allTextContents()).map((text) => text.trim());
}

/** Рядок розкриття 12d на сторінці (сцена, телефон чи пульт); null — його немає. */
export const revealLine = async (page: Page) => (await page.locator('.reveal-facts').first().textContent({ timeout: 500 }).catch(() => null))?.trim() ?? null;

/** Текст без зайвих пробілів (NBSP перед «с» — звичайний пробіл). */
export const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();
/** Телефон без прокрутки вбік — з цифрами в повідомленні. */
export async function expectFitsWidth13a(page: Page, name: string) {
  const [scroll, client] = (await page.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth]')) as [number, number];
  expect(scroll, `${name}: horizontal scroll (${scroll} > ${client})`).toBeLessThanOrEqual(client);
}

/** Меню телефона (14a; з 23a — п'ять пунктів): висота, прокрутка вбік і чи влазить кожен короткий підпис (::after з data-short) у свій пункт. */
export const MENU_FITS_14A = `(() => {
  const nav = document.querySelector('nav.menu');
  const links = [...nav.querySelectorAll('a')];
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:0;top:0';
  document.body.append(probe);
  const clipped = [];
  const shown = [];
  for (const a of links) {
    const after = getComputedStyle(a, '::after');
    shown.push(after.content);
    for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing']) probe.style[key] = after[key];
    probe.textContent = a.dataset.short;
    const style = getComputedStyle(a);
    const inner = a.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const width = probe.getBoundingClientRect().width;
    if (width > inner + 0.5 || a.scrollWidth > a.clientWidth) clipped.push(a.dataset.short + ': ' + width.toFixed(1) + ' > ' + inner.toFixed(1));
    const box = a.getBoundingClientRect();
    if (box.left < -0.5 || box.right > innerWidth + 0.5) clipped.push(a.dataset.short + ': outside the screen');
  }
  probe.remove();
  return {
    count: links.length,
    height: nav.getBoundingClientRect().height,
    wide: document.documentElement.scrollWidth <= innerWidth && nav.scrollWidth <= nav.clientWidth,
    shown,
    clipped,
  };
})()`;

export function prizeQuestions14a() {
  const common = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  return [
    { ...common, id: 'p1', type: 'single' as const, text: 'Яке місто називають столицею Галичини?', options: options('Львів', 'Тернопіль', 'Івано-Франківськ', 'Дрогобич'), correctId: 'a' },
    { ...common, id: 'p2', type: 'single' as const, text: 'Яке море омиває Одесу?', options: options('Чорне', 'Азовське', 'Середземне', 'Балтійське'), correctId: 'a' },
  ];
}

/** Запити до 3D: файли моделей і чанк рушія трофеїв (three.js). */
export const isTrophyRequest = (url: string) => /\.glb(\?|$)/.test(url) || /\/assets\/(trophy-engine|three)[^/]*\.js/.test(url);

/** П'ять пунктів на ширині width: count 5; ≤ 700 px — висота ≤ 60 і один рядок; без прокрутки вбік; жоден підпис не ширший за пункт. Замінює expectEightItems18a. */
export async function expectFiveItems(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 812 });
  const fit = (await page.evaluate(MENU_FITS_14A)) as { count: number; height: number; wide: boolean; shown: string[]; clipped: string[] };
  expect(fit.count, `menu-${width}: items`).toBe(5);
  expect(fit.wide, `menu-${width}: horizontal scroll`).toBe(true);
  expect(fit.clipped, `menu-${width}: clipped labels`).toEqual([]);
  const rows = await page.locator(`${MENU} a`).evaluateAll((links) =>
    links.map((a) => ({ y: Math.round(a.getBoundingClientRect().top), over: a.scrollWidth > a.clientWidth })),
  );
  expect(rows.filter((r) => r.over), `menu-${width}: a label is wider than its item`).toEqual([]);
  if (width <= 700) {
    expect((await page.locator(MENU).boundingBox())!.height, `menu-${width}: height`).toBeLessThanOrEqual(60);
    expect(new Set(rows.map((r) => r.y)).size, `menu-${width}: the items are not in one row`).toBe(1);
  }
}

/** З будь-якої сторінки: меню «Профіль» → плитка з ім'ям name → чекає h1 name. */
export async function openProfileTile(page: Page, name: string): Promise<void> {
  await page.locator(MENU).getByRole('link', { name: 'Профіль' }).click();
  // Плитки з числом звуться «Призи, 2»; без числа — лише підпис.
  await page.locator('nav.profile-tiles').getByRole('link', { name: new RegExp(`^${name}(, \\d+)?$`) }).click();
  await page.getByRole('heading', { level: 1, name, exact: true }).waitFor();
}

export type Dict22a = Readonly<Record<string, string>>;

/**
 * Підпис мовою dict для українського тексту ukText: усі uk-ключі з цим значенням мають тут один переклад — його й повертає.
 * Різні переклади (як «Далі» в de) — помилка з переліком ключів: тоді сценарій бере потрібний ключ явно.
 */
export function label(dict: Dict22a, ukText: string): string {
  const keys = Object.entries(ukMessages as Dict22a)
    .filter(([, value]) => value === ukText)
    .map(([key]) => key);
  if (keys.length === 0) throw new Error(`no uk key says «${ukText}»`);
  const texts = new Set(keys.map((key) => dict[key] ?? (ukMessages as Dict22a)[key]!));
  if (texts.size !== 1) throw new Error(`«${ukText}» has different translations: ${keys.map((key) => `${key}=${dict[key]}`).join(', ')}`);
  return [...texts][0]!;
}

export const htmlLang = (page: Page) => page.evaluate('document.documentElement.lang') as Promise<string>;
export const htmlDir = (page: Page) => page.evaluate('document.documentElement.dir') as Promise<string>;
/** Напрямок, що діє для елемента: dir найближчого предка з атрибутом (або самого елемента). */
export const ownDir = (locator: Locator) => locator.evaluate((element) => element.closest('[dir]')?.getAttribute('dir') ?? '');

/** Вхід у гру з телефона мовою dict. Увійшовшому форма сама підставляє нік профілю — як у join(), досить одного повтору. */
export async function join22a(page: Page, dict: Dict22a, code: string, nickname: string) {
  await page.goto(`${base}/play/${code}`);
  const input = field(page, label(dict, 'Ваше ім’я'));
  await input.fill(nickname);
  if ((await input.inputValue()) !== nickname) await input.fill(nickname);
  await click(page, label(dict, 'Увійти в гру'));
  await page.getByText(label(dict, 'Ви в грі. Чекаємо на старт.'), exact).waitFor();
}

/** Кнопка ведучого з витримкою (11b): чекає, доки вона стане активною. */
export async function step27a(host: Page, name: string) {
  const button = host.getByRole('button', { name, ...exact });
  await expect.poll(() => button.isDisabled().catch(() => true), { timeout: 15_000 }).toBe(false);
  await button.click();
}

/** «Далі» після розкриття; якщо раунд показує таблицю після кожного запитання — ще й «Наступне запитання». */
export async function next27a(host: Page) {
  await step27a(host, 'Далі');
  const leaderboard = host.getByRole('button', { name: 'Наступне запитання', ...exact });
  if (await leaderboard.waitFor({ timeout: 3000 }).then(() => true, () => false)) await step27a(host, 'Наступне запитання');
}

/** Рахунок гравця у шапці його телефона. */
export const phoneScore27a = (page: Page) => page.locator('.bar .score');

/** Список у редакторі за підписом: назва select-а з обгорткою label містить і вибраний варіант, тож getByLabel його не знаходить. */
export async function select27b(page: Page, label: string, value: string) {
  await page.locator('label.field', { has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).locator('select').selectOption(value);
}

/** «Далі» з розкриття до кінця гри: проходить таблицю, доки сцена не покаже переможців. */
export async function toWinners27c(host: Page, stage: Page) {
  await step27a(host, 'Далі');
  const winners = stage.getByRole('heading', { name: 'Переможці' });
  for (let tries = 0; tries < 3; tries++) {
    if (await winners.waitFor({ timeout: 4000 }).then(() => true, () => false)) return;
    for (const name of ['Наступне запитання', 'Далі', 'Завершити гру']) {
      const button = host.getByRole('button', { name, ...exact });
      if ((await button.count()) > 0 && !(await button.isDisabled())) {
        await button.click();
        break;
      }
    }
  }
  await winners.waitFor();
}

/** Порівняння «Більше чи менше» для e2e: [запитання, варіант А, значення А, варіант Б, значення Б, правильний, бали]. */
export type Pair28a = [string, string, string, string, string, 'a' | 'b', number];

/** Командне запитання з трьох порівнянь. */
export const PAIRS28A_TEAM: Pair28a[] = [
  ['Чого більше?', 'Ніг у павука', '8', 'Ніг у мухи', '6', 'a', 100],
  ['Що важче?', 'Кілограм пір’я', '1 кг', 'Кавун', '8 кг', 'b', 100],
  ['Чого більше?', 'Хвилин у добі', '1440', 'Секунд у годині', '3600', 'b', 100],
];

/** Запитання «Більше чи менше» для API. */
export function moreLess28a(id: string, text: string, pairs: Pair28a[], timeLimit: number) {
  const list = pairs.map(([prompt, a, va, b, vb, correct, points], at) => ({ id: `${id}p${at + 1}`, prompt, a: { text: a, value: va }, b: { text: b, value: vb }, correct, points }));
  return { id, text, imageUrl: null, video: null, timeLimit, type: 'moreless' as const, pairs: list, points: list.reduce((sum, pair) => sum + pair.points, 0) };
}

/** Натиск кнопки варіанта за текстом: чекає, поки кнопки знову активні (після переходу вони гаснуть на 350 мс). */
export async function morelessPick28a(page: Page, option: string) {
  const button = page.locator('button.moreless-option', { hasText: new RegExp(`^${option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
  await expect.poll(() => button.getAttribute('aria-disabled').catch(() => 'true'), POLL).toBe('false');
  await button.click();
}
/** Лічильник «3 / 8» на телефоні; null — лічильника немає (пройдено все чи не той екран). */
export const morelessCounter28a = (page: Page) => page.evaluate("document.querySelector('.moreless-counter')?.textContent ?? null") as Promise<string | null>;

/** Проходить ряд: answers — 'a'/'b' по порядку; лічильник росте після кожного натиску, правильності не видно. */
export async function morelessRun28a(page: Page, pairs: Pair28a[], answers: ('a' | 'b')[], from = 0) {
  for (const [at, side] of answers.entries()) {
    const index = from + at;
    const pair = pairs[index]!;
    expect(await morelessCounter28a(page), `the counter before pick ${index + 1}`).toBe(`${index + 1} / ${pairs.length}`);
    await morelessPick28a(page, side === 'a' ? pair[1] : pair[3]);
    if (index + 1 < pairs.length) await expect.poll(() => morelessCounter28a(page), POLL).toBe(`${index + 2} / ${pairs.length}`);
    expect(await page.locator('.moreless-mark, .moreless-right, .moreless-reveal').count(), 'rightness shown before the reveal').toBe(0);
  }
}

/** Закриває запитання (якщо ще відкрите) і показує відповідь. */
export async function reveal28a(host: Page) {
  const close = host.getByRole('button', { name: 'Закрити запитання', ...exact });
  const show = host.getByRole('button', { name: 'Показати відповідь', ...exact });
  const ready = (button: Locator) => button.isEnabled({ timeout: 200 }).catch(() => false);
  for (const until = Date.now() + 20_000; Date.now() < until; await sleep(200)) {
    if (await ready(show)) return show.click();
    if (await ready(close)) await close.click().catch(() => undefined);
  }
  throw new Error('no «Показати відповідь» on the host');
}

/** Пише (чи стирає — '') факт на телефоні й тисне «Зберегти»; чекає збереженого рядка (чи його зникнення). */
export async function writeFact28b(page: Page, text: string, dict?: Record<string, string>) {
  await field(page, dict?.truthFactLabel ?? 'Ваш маловідомий факт').fill(text);
  await click(page, dict?.truthFactSave ?? 'Зберегти');
  if (text === '') await expect.poll(() => page.locator('.truth-saved').count(), POLL).toBe(0);
  else await expect.poll(() => page.locator('.truth-saved').textContent(), POLL).toBe((dict?.truthFactSaved ?? 'Ваш факт: «{text}»').replace('{text}', text));
}

/** Автор поточного запитання — з пульта («Автор: Оля»). */
export async function hostAuthor28b(host: Page): Promise<string> {
  await host.locator('.truth-host-author').waitFor();
  return (await host.locator('.truth-host-author').textContent())!.replace(/^Автор: /, '');
}

/** Вибір імені на телефоні: кнопки зникають, коли відповідь прийнято. */
export async function pickName28b(page: Page, nickname: string) {
  await page.locator('button.truth-name', { hasText: new RegExp(`^${nickname}$`) }).click();
  await expect.poll(() => page.locator('button.truth-name').count(), POLL).toBe(0);
}

/** «Готово» з підтвердженням (кнопка «Так» перші 350 мс глуха). */
export async function done28d(page: Page) {
  await page.locator('button.puzzle-done').click();
  await page.locator('.puzzle-confirm').waitFor();
  await sleep(400);
  await click(page, 'Так, зафіксувати');
  await page.getByText('Розв’язання зафіксовано. Чекаємо інших', exact).first().waitFor();
}

/** PNG з піксельної функції (як sectorsPng29c): без файлів з диска й без справжніх фото. */
export function png29d(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      [raw[at], raw[at + 1], raw[at + 2]] = pixel(x, y);
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
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
