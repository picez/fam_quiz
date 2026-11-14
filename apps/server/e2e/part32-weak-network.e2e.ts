import { classicRound, makeRoundsQuiz, single } from '@quiz/engine/testing';
import type { Question, Quiz } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { ukMessages } from '../../web/src/i18n';
import { open, click, join, expectNoSideScroll, register, liveRow, pickOption, scoreOf, slowSocket, waitForServiceWorker, reveal28a, next27a, POLL, sleep, type SocketControl } from './helpers/common';
import { exact, base, ctx, flags, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 32 — слабкий інтернет. Оболонка застосунку з кешу воркера без мережі й сторінка «Немає зв'язку»,
 * заголовки кешування, плашка «📶 Слабкий зв'язок» на повільному сокеті, відповідь навколо обриву зараховується один раз,
 * швидке перепідключення, коли мережа повертається, і зменшення фото в браузері. Потребує зібраного клієнта (pnpm build).
 */

useE2eServer();

const NET_OFFLINE = ukMessages.netOffline;
const NET_WEAK = ukMessages.netWeak;
const ANSWER_PENDING = ukMessages.answerPending;
const OFFLINE_BANNER = ukMessages.offline;
const POINTS = 500;

it('part 32: the cached app opens offline with «Немає інтернету…», hashed assets are immutable and a missing chunk is a 404', async () => {
  try {
    await shellOffline32();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 32: with nothing cached the worker shows «Немає зв’язку» with a retry button that brings the app back', async () => {
  try {
    await offlinePage32();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 32: a slowed socket shows «📶 Слабкий зв’язок» on 375 and on an easy 320 phone and it clears when the connection recovers', async () => {
  try {
    await weakIndicator32();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 32: an answer lost in a blip is re-sent once, an answer whose ack was lost is not, and either way it counts exactly once', async () => {
  try {
    await answerAroundBlip32();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 32: coming back online reconnects at once and the question goes on', async () => {
  try {
    await reconnectOnline32();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 32: a big phone photo is shrunk in the browser to a 1600 px WebP before upload', async () => {
  try {
    await photoShrink32();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

/** Головний чанк зі сторінки: /assets/index-*.js. */
async function mainChunk(page: Page): Promise<string> {
  const html = await (await page.request.get(base)).text();
  const found = /\/assets\/index-[\w-]+\.js/.exec(html);
  expect(found, 'main chunk in index.html').not.toBeNull();
  return found![0];
}

async function shellOffline32() {
  const page = await open('p32-shell', 375, 812);
  await page.goto(base);
  await waitForServiceWorker(page);
  const names = (await page.evaluate('caches.keys()')) as string[];
  expect(names.some((name) => name.startsWith('quiz-shell-'))).toBe(true);

  // ── Заголовки: хешований файл — на рік, відсутній чанк — 404, сторінка — no-cache. ──
  const chunk = await mainChunk(page);
  const asset = await page.request.get(base + chunk, { headers: { 'accept-encoding': 'br' } });
  expect(asset.status()).toBe(200);
  expect(asset.headers()['cache-control']).toContain('immutable');
  expect(asset.headers()['content-encoding']).toBe('br');
  const missing = await page.request.get(`${base}/assets/nope-zzz.js`);
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');
  expect((await page.request.get(base)).headers()['cache-control']).toBe('no-cache');
  expect((await page.request.get(`${base}/sw.js`)).headers()['cache-control']).toBe('no-cache');

  // ── Без мережі: оболонка з кешу, головна з полем коду гри й смуга «Немає інтернету…». ──
  flags.offlineExpected = true;
  await page.context().setOffline(true);
  await page.reload();
  await page.getByLabel('Код гри', exact).or(page.getByRole('button', { name: 'Доєднатись до гри', ...exact })).first().waitFor();
  const banner = page.getByRole('status').filter({ hasText: NET_OFFLINE });
  await banner.waitFor();
  await shot(page, 'part32-shell-offline-375');
  await expectNoSideScroll(page, 'part32-shell-offline-375');

  // Інша сторінка офлайн — та сама оболонка з кешу, а не помилка браузера.
  await page.goto(`${base}/history`);
  await page.locator('nav.menu').waitFor();
  await banner.waitFor();
  expect(await page.title()).not.toBe('');

  await page.context().setOffline(false);
  await expect.poll(() => banner.count(), POLL).toBe(0);
}

async function offlinePage32() {
  const page = await open('p32-offline-page', 375, 812);
  await page.goto(base);
  await waitForServiceWorker(page);
  await page.evaluate(async () => {
    for (const name of await caches.keys()) if (name.startsWith('quiz-shell-')) await caches.delete(name);
  });
  flags.offlineExpected = true;
  await page.context().setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'Немає зв’язку', ...exact }).waitFor();
  const retry = page.getByRole('button', { name: 'Спробувати ще раз', ...exact });
  await retry.waitFor();
  expect(await page.evaluate('document.documentElement.lang')).toBe('uk');
  await shot(page, 'part32-offline-page-375');
  await expectNoSideScroll(page, 'part32-offline-page-375');

  await page.context().setOffline(false);
  await retry.click();
  await page.getByLabel('Код гри', exact).or(page.getByRole('button', { name: 'Доєднатись до гри', ...exact })).first().waitFor();
}

/** Ведучий зберігає вікторину і відкриває гру: код гри. */
async function play32(host: Page, quiz: Quiz): Promise<string> {
  const saved = await host.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: quiz.title }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  return host.url().slice(-6);
}

const questions32: Question[] = [
  { ...single, id: 'w1', text: 'Яке місто стоїть на Дніпрі й має Андріївський узвіз?', options: [{ id: 'a', text: 'Київ' }, { id: 'b', text: 'Черкаси' }, { id: 'c', text: 'Ужгород' }], correctId: 'a', timeLimit: 90, points: POINTS },
  { ...single, id: 'w2', text: 'Яка річка тече через Ужгород?', options: [{ id: 'a', text: 'Уж' }, { id: 'b', text: 'Тиса' }, { id: 'c', text: 'Прут' }], correctId: 'a', timeLimit: 90, points: POINTS },
  { ...single, id: 'w3', text: 'Скільки областей в Україні?', options: [{ id: 'a', text: '22' }, { id: 'b', text: '24' }, { id: 'c', text: '26' }], correctId: 'b', timeLimit: 90, points: POINTS },
];

async function hostGame(name: string, email: string, title: string): Promise<{ host: Page; code: string }> {
  const host = await open(name, 1280, 800);
  await register(host, 'host', 'Ліна Ведуча', email);
  const quiz = { ...makeRoundsQuiz([classicRound(`r-${name}`, questions32, { speedBonus: false, shuffleOptions: false })]), title };
  return { host, code: await play32(host, quiz) };
}

async function startRound(host: Page, phones: Page[]) {
  await click(host, 'Почати гру');
  await afterSplash(host, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, ...phones);
}

const weakPill = (page: Page) => page.getByRole('status').filter({ hasText: NET_WEAK });
/** Вердикт приходить після кількох пінгів (кожні 5 с): до 40 с із запасом. */
const SLOW_POLL = { timeout: 40_000, interval: 500 };

async function weakIndicator32() {
  const { host, code } = await hostGame('host32w', 'host32w@example.com', 'Повільний вечір 32');
  const olya = await open('olya32w', 375, 812);
  const olyaSocket = await slowSocket(olya, { delayMs: 1200 });
  await join(olya, code, 'Оля', false);
  const taras = await open('taras32w', 320, 568, { hasTouch: true, isMobile: true });
  await taras.addInitScript("localStorage.setItem('quiz:easy', 'on')");
  const tarasSocket = await slowSocket(taras, { delayMs: 1200 });
  await join(taras, code, 'Тарас', false);
  await startRound(host, [olya, taras]);
  await olya.locator('.choice').first().waitFor();

  await expect.poll(() => weakPill(olya).count(), SLOW_POLL).toBe(1);
  await expect.poll(() => weakPill(taras).count(), SLOW_POLL).toBe(1);
  expect(await weakPill(olya).getAttribute('title')).toBe(ukMessages.netWeakHint);
  expect(await taras.evaluate("document.documentElement.classList.contains('is-easy')")).toBe(true);
  await shot(olya, 'part32-weak-375');
  await expectNoSideScroll(olya, 'part32-weak-375');
  await expectNoSideScroll(taras, 'part32-weak-easy-320');
  // Плашка в один рядок: не вища за два рядки дрібного тексту й не ширша за екран.
  for (const [page, width] of [[olya, 375], [taras, 320]] as const) {
    const box = (await weakPill(page).boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(width);
    expect(box.height).toBeLessThan(48);
  }
  // На пульті (без затримки) плашки немає.
  expect(await weakPill(host).count()).toBe(0);

  // ── Зв'язок відновився: три швидкі пінги — і плашки немає. ──
  olyaSocket.delayMs = 0;
  tarasSocket.delayMs = 0;
  await expect.poll(() => weakPill(olya).count(), SLOW_POLL).toBe(0);
  await expect.poll(() => weakPill(taras).count(), SLOW_POLL).toBe(0);

  // ── CDP: емуляція повільної мережі в Chromium. Чи гальмує вона вже відкритий WebSocket — фіксуємо, не вимагаємо.
  // Спостережено 2026-11-14: CDP не гальмує вже відкритий WebSocket у Chromium 157 (плашка не з'являється), тож основна
  // перевірка — routeWebSocket вище. ──
  const cdp = await olya.context().newCDPSession(olya);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: 50_000, uploadThroughput: 20_000 });
  const cdpWeak = await expect
    .poll(() => weakPill(olya).count(), { timeout: 30_000, interval: 500 })
    .toBe(1)
    .then(() => true, () => false);
  console.info(`part 32: CDP latency 1500 ms ${cdpWeak ? 'slows' : 'does not slow'} the open WebSocket in ${olya.context().browser()?.version()}`);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}

/** id гравця за ніком і чи є в нього запис на запитанні. */
function answersOf(code: string, nickname: string, playIndex: number): number {
  const state = ctx.manager.get(code)!.state;
  const player = state.players.find((one) => one.nickname === nickname)!;
  const answers = state.plays[playIndex]?.answers ?? {};
  return Object.keys(answers).filter((id) => id === player.id).length;
}

/** Телефон бачить свою відповідь у зрізі: «Відповідь прийнято» чи (усі відповіли) «Чекаємо на правильну відповідь», без рядка «Зв'язок підвис…». */
async function answerSettled(page: Page) {
  await page.getByText(ukMessages.answerSent, exact).or(page.getByText(ukMessages.waitReveal, exact)).first().waitFor({ timeout: 20_000 });
  await expect.poll(() => page.getByText(ANSWER_PENDING).count(), POLL).toBe(0);
  expect(await page.locator('.choice').count()).toBe(0);
}

const reconnected = (control: SocketControl, before: number) => expect.poll(() => control.connections, { timeout: 60_000, interval: 500 }).toBeGreaterThan(before);

async function answerAroundBlip32() {
  const { host, code } = await hostGame('host32a', 'host32a@example.com', 'Обрив 32');
  const olya = await open('olya32a', 375, 812);
  const control = await slowSocket(olya);
  await join(olya, code, 'Оля', false);
  await startRound(host, [olya]);
  await olya.locator('.choice').first().waitFor();
  // Перший пінг має дійти: без відповіді сервера клієнт тайм-аутів не рахує (старий сервер під час деплою).
  await sleep(6000);

  // ── (а) Відповідь загубилась: повідомлення на сервер відкидаються, телефон каже «Зв'язок підвис…». ──
  const first = control.connections;
  control.drop = { connection: first, direction: 'toServer' };
  await pickOption(olya, 'Київ');
  await olya.getByRole('status').filter({ hasText: ANSWER_PENDING }).waitFor({ timeout: 15_000 });
  await shot(olya, 'part32-answer-pending-375');
  await expectNoSideScroll(olya, 'part32-answer-pending-375');
  expect(answersOf(code, 'Оля', 0)).toBe(0);
  // Три пінги без відповіді — клієнт сам перепідключається; нове з'єднання вже чисте.
  await reconnected(control, first);
  await expect.poll(() => answersOf(code, 'Оля', 0), { timeout: 20_000 }).toBe(1);
  expect(control.answersSent).toBe(2);
  expect(control.answersDelivered).toBe(1);
  await liveRow(host, 'Оля').or(host.getByRole('button', { name: 'Показати відповідь', ...exact })).first().waitFor();
  await answerSettled(olya);
  await reveal28a(host);
  expect(await scoreOf(host, 'Оля')).toBe(POINTS);
  await next27a(host);
  await afterSplash(host, olya);
  await olya.locator('.choice').first().waitFor();
  await sleep(6000);

  // ── (б) Загубився лише ack: відповідь дійшла, а відповіді сервера на телефон — ні. Повтору немає. ──
  const second = control.connections;
  const sentBefore = control.answersSent;
  control.drop = { connection: second, direction: 'toPage' };
  await pickOption(olya, 'Уж');
  await expect.poll(() => answersOf(code, 'Оля', 1), { timeout: 10_000 }).toBe(1);
  await reconnected(control, second);
  await answerSettled(olya);
  await sleep(2000);
  expect(control.answersSent - sentBefore).toBe(1);
  expect(answersOf(code, 'Оля', 1)).toBe(1);
  await expect.poll(() => olya.getByText(ANSWER_PENDING).count(), POLL).toBe(0);
  await reveal28a(host);
  expect(await scoreOf(host, 'Оля')).toBe(POINTS);
  expect(ctx.manager.get(code)!.state.players.find((one) => one.nickname === 'Оля')!.score).toBe(2 * POINTS);
}

async function reconnectOnline32() {
  const { host, code } = await hostGame('host32o', 'host32o@example.com', 'Повернення 32');
  const olya = await open('olya32o', 375, 812);
  const control = await slowSocket(olya);
  await join(olya, code, 'Оля', false);
  await startRound(host, [olya]);
  await olya.locator('.choice').first().waitFor();
  const before = ctx.manager.get(code)!.state.questionIndex;

  flags.offlineExpected = true;
  await olya.context().setOffline(true);
  const banner = olya.getByRole('status').filter({ hasText: OFFLINE_BANNER });
  const dropped = await banner.waitFor({ timeout: 8000 }).then(() => true, () => false);
  if (!dropped) {
    // Спостережено 2026-11-14 (Chromium 157): setOffline не рве вже відкритий WebSocket — рвемо його самі, як обрив мережі.
    console.info('part 32: setOffline does not close an open WebSocket in Chromium; closing it through routeWebSocket');
    control.closeCurrent();
    await banner.waitFor({ timeout: 8000 });
  }
  await sleep(5000);
  await shot(olya, 'part32-offline-banner-375');
  const started = Date.now();
  await olya.context().setOffline(false);
  await expect.poll(() => banner.count(), { timeout: 3000, interval: 100 }).toBe(0);
  console.info(`part 32: back online → live in ${Date.now() - started} ms`);
  expect(ctx.manager.get(code)!.state.questionIndex).toBe(before);
  await olya.getByText(questions32[0]!.text).waitFor();
  const timer = async () => Number(await olya.getByRole('timer').first().getAttribute('aria-label'));
  const t1 = await timer();
  await sleep(2100);
  expect(await timer()).toBeLessThan(t1);
  await pickOption(olya, 'Київ');
  await liveRow(host, 'Оля').waitFor();
}

async function photoShrink32() {
  const page = await open('p32-photo', 1280, 900);
  await register(page, 'menu', 'Марко Фото', 'photo32@example.com');
  await page.goto(`${base}/quizzes/new`);
  const input = page.getByLabel('Додати зображення', exact);
  await input.waitFor({ state: 'attached' });
  // «Фото з телефона»: 4000×3000 JPEG із шумом і градієнтами, кілька мегабайтів.
  const photo = (await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(4000, 3000);
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 4000, 3000);
    gradient.addColorStop(0, '#1e5aa8');
    gradient.addColorStop(1, '#f2c14e');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 4000, 3000);
    const image = context.getImageData(0, 0, 4000, 3000);
    for (let i = 0; i < image.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 60;
      image.data[i] += noise;
      image.data[i + 1] += noise;
      image.data[i + 2] += noise;
    }
    context.putImageData(image, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  })) as string;
  const buffer = Buffer.from(photo, 'base64');
  expect(buffer.length).toBeGreaterThan(2 * 1024 * 1024);
  await input.setInputFiles({ name: 'IMG_2026.jpg', mimeType: 'image/jpeg', buffer });
  const image = page.getByAltText('Зображення до запитання');
  await image.waitFor({ timeout: 30_000 });
  const src = (await image.getAttribute('src'))!;
  const uploaded = await page.request.get(base + src);
  expect(uploaded.headers()['content-type']).toBe('image/webp');
  const size = (await uploaded.body()).length;
  expect(size).toBeLessThanOrEqual(2 * 1024 * 1024);
  const natural = (await image.evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight])) as number[];
  expect(natural).toEqual([1600, 1200]);
  console.info(`part 32: a ${buffer.length} B 4000×3000 JPEG became a ${size} B 1600×1200 WebP`);
}
