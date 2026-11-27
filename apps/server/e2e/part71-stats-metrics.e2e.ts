import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { adminEmails } from '../src/config';
import { activityDay, user } from '../src/db/schema';
import { click, expectNoSideScroll, field, join, myId, open, POLL, register } from './helpers/common';
import { ARTIFACTS, base, ctx, db, exact, flags, relisten, shot, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 71 — час у редакторі, метрики за період (плитки, графіки, «Розгорнути»), стан сервера групами;
 * телефон 360 px і широкі екрани, світла тема (і темні кадри діалогу та розділів).
 */

useE2eServer();

const ADMIN_EMAIL = 'admin71@example.com';
const PASSWORD = 'correct horse battery';
const QUESTION = 'Київ стоїть на Дніпрі?';

/** Світла тема на кожному завантаженні, поки пристрій не позначено «темним». */
const light = async (page: Page) => {
  await page.context().addInitScript(() => {
    if (localStorage.getItem('quiz:force-dark') !== '1') localStorage.setItem('quiz:theme', 'light');
  });
  return page;
};
/** Темна тема з наступного завантаження (тема пристрою — за замовчуванням темна). */
const toDark = async (page: Page) => {
  await page.evaluate(() => {
    localStorage.setItem('quiz:force-dark', '1');
    localStorage.removeItem('quiz:theme');
  });
  await page.reload();
};
const isLight = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('is-light'));
/** Кадр лише видимої частини екрана. */
const viewportShot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}-viewport.png`) });
};

/** Кадр одного елемента (картки, групи) — щоб роздивитись підписи осей на вузькому екрані. */
const partShot = async (locator: ReturnType<Page['locator']>, name: string) => {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await locator.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`) });
};
/** Кадри перших карток графіків, плиток і списків. */
const cardShots = async (page: Page, name: string) => {
  await partShot(page.locator('.admin-kpis'), `${name}-kpis`);
  const charts = page.locator('.admin-metric-charts figure.chart-card');
  for (const i of [0, 2, 3, 4, 11]) await partShot(charts.nth(i), `${name}-chart${i}`);
  await partShot(page.locator('.admin-metric-lists figure.chart-card').first(), `${name}-list0`);
};

const nickname = async (page: Page, nick: string) => {
  const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: nick, avatar: null } });
  expect(saved.ok(), await saved.text()).toBe(true);
};

/** Сервер з адміном — лише на один сценарій. */
async function withAdmin(run: () => Promise<void>) {
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }) });
  flags.restarting = false;
  try {
    await run();
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    flags.restarting = true;
    await ctx.shutdown().catch(() => undefined);
    await relisten();
  }
}

/** Адмін: перший сценарій створює акаунт, наступні входять ним. */
async function adminPage(key: string, width = 360, height = 740): Promise<Page> {
  const page = await light(await open(key, width, height));
  await page.goto(base);
  const signedIn = await page.request.post(`${base}/api/auth/sign-in/email`, { data: { email: ADMIN_EMAIL, password: PASSWORD }, headers: { origin: base } });
  if (!signedIn.ok()) {
    await register(page, 'menu', 'Адмін 71', ADMIN_EMAIL);
    await nickname(page, 'Адмін 71');
  }
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  return page;
}

/** Коротка гра до кінця: одне запитання «так/ні», двоє гостей. */
async function playShortGame(tag: string) {
  const host = await light(await open(`host71${tag}`, 1280, 900));
  await register(host, 'host', `Ведуча 71${tag}`, `host71${tag}@example.com`);
  const common = { imageUrl: null, video: null, timeLimit: 25, points: 1000 };
  const title = `Річки 71${tag}`;
  const data = { ...makeRoundsQuiz([classicRound('c71', [{ ...common, id: 'q71', type: 'boolean', text: QUESTION, correct: true }] as never, { title: 'Річки', speedBonus: false, shuffleOptions: false })]), title };
  expect((await host.request.post(`${base}/api/quizzes`, { data })).ok()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const players: [Page, string][] = [
    [await open(`olya71${tag}`, 360, 740), 'Так'],
    [await open(`petro71${tag}`, 360, 740), 'Ні'],
  ];
  await join(players[0]![0], code, 'Оля', false);
  await join(players[1]![0], code, 'Петро', false);
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  for (const [page] of players) await page.getByText(QUESTION).first().waitFor({ timeout: 120_000 });
  for (const [page, answer] of players) await click(page, answer);
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Завершити гру');
  for (const [page] of players) await page.getByText('Гру завершено').first().waitFor({ timeout: 30_000 });
}

const tile = (page: Page, label: string) => page.locator('.admin-kpis .admin-stat', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) });
const card = (page: Page, title: string) => page.locator('.admin-metrics figure.chart-card', { has: page.getByRole('heading', { name: title, ...exact }) });

it('part 71: the editor counts active time — a signed-in person types for a few seconds, «Скасувати» sends the rest, the day row has editor seconds and one session', async () => {
  const olya = await light(await open('olya71-editor', 360, 740));
  await register(olya, 'menu', 'Оля 71', 'olya71editor@example.com');
  const id = await myId(olya);
  await olya.goto(`${base}/quizzes/new`);
  await field(olya, 'Назва вікторини').fill('Чернетка 71');
  // Дія кожні 2 с упродовж ~7 с: лічильник тікає раз на 5 с.
  for (let i = 0; i < 4; i += 1) {
    await olya.keyboard.press('End');
    await olya.waitForTimeout(2000);
  }
  await click(olya, 'Скасувати');
  await olya.waitForURL(`${base}/quizzes`);
  await expect.poll(async () => (await db.select().from(activityDay).where(eq(activityDay.userId, id)))[0]?.editorSec ?? 0, POLL).toBeGreaterThanOrEqual(5);
  const rows = await db.select().from(activityDay).where(eq(activityDay.userId, id));
  // Рядок дня з'явився ще від /api/me (відвідування), до нього додався час редактора.
  expect(rows).toHaveLength(1);
  expect(rows[0]!.editorSessions).toBe(1);
}, 120_000);

it('part 71: metrics — after a short game the admin sees games and players for 30 days, «Рік» goes to ?period=365 with week labels and stays after a reload; a guest gets 404, the JSON has no email', async () => {
  await withAdmin(metrics71);
}, 300_000);

async function metrics71() {
  await playShortGame('m');
  const admin = await adminPage('admin71-metrics');
  const guest = await open('guest71-metrics', 360, 740);
  expect((await guest.request.get(`${base}/api/admin/metrics?period=30`)).status()).toBe(404);
  const own = await admin.request.get(`${base}/api/admin/metrics?period=30`);
  expect(own.status()).toBe(200);
  expect(await own.text(), 'metrics have an email').not.toContain('@');

  await admin.goto(`${base}/admin`);
  expect(await isLight(admin)).toBe(true);
  const section = admin.locator('.admin-metrics');
  await section.getByRole('heading', { name: 'Метрики за період', ...exact }).waitFor();
  expect(await section.getByRole('radio', { name: '30 днів', ...exact }).isChecked()).toBe(true);
  await tile(admin, 'Ігор').waitFor();
  expect(Number(await tile(admin, 'Ігор').locator('dd').first().innerText())).toBeGreaterThanOrEqual(1);
  expect(await tile(admin, 'Гравців у грі').locator('dd').first().innerText()).toBe('2');

  await section.getByText('Рік', exact).click();
  await admin.waitForURL(/[?&]period=365/);
  const games = card(admin, 'Ігор за день');
  await expect.poll(() => games.locator('.chart-x').first().textContent(), POLL).toMatch(/^з /);
  await admin.reload();
  await tile(admin, 'Ігор').waitFor();
  expect(await admin.locator('.admin-metrics').getByRole('radio', { name: 'Рік', ...exact }).isChecked()).toBe(true);
  await expectNoSideScroll(admin, 'metrics71-year-360');
  await partShot(games, 'p71-year-360-games');
}

it('part 71: expand — «Ігри за ведучим» opens a dialog with a three-row legend and numbers over bars, a table view, Esc returns focus; the card chart answers the keyboard; wide grid puts two cards in a row; shots in light and dark', async () => {
  await withAdmin(expand71);
}, 300_000);

async function expand71() {
  await playShortGame('e');
  const admin = await adminPage('admin71-expand', 1366, 900);
  await admin.goto(`${base}/admin?period=7`);
  const host = card(admin, 'Ігри за ведучим');
  await host.locator('rect.chart-bar').first().waitFor();

  // ── Широкий екран: сітка в кілька колонок — дві перші картки на одному рядку. ──
  const cards = admin.locator('.admin-metric-charts figure.chart-card');
  const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(a!.y).toBe(b!.y);
  await expectNoSideScroll(admin, 'metrics71-1366');

  // ── «Розгорнути…» → діалог: легенда з трьома рядами, числа над стовпчиками (7 днів на широкому — місця досить). ──
  const expand = host.getByRole('button', { name: 'Розгорнути «Ігри за ведучим»', ...exact });
  await expand.click();
  const dialog = admin.getByRole('dialog', { name: 'Ігри за ведучим' });
  await dialog.waitFor();
  expect(await dialog.locator('.chart-legend li').count()).toBe(3);
  expect(await dialog.locator('.chart-value').count()).toBeGreaterThan(0);
  await shot(admin, 'metrics71-dialog-1366');
  await dialog.getByRole('button', { name: 'Показати таблицею', ...exact }).click();
  await dialog.locator('table.chart-table').waitFor();
  expect(await dialog.locator('table.chart-table tbody tr').count()).toBe(7);
  await admin.keyboard.press('Escape');
  await expect.poll(() => admin.getByRole('dialog').count(), POLL).toBe(0);
  expect(await expand.evaluate((node) => node === document.activeElement)).toBe(true);

  // ── Клавіатура на графіку картки: Tab до SVG, ← → плашка з датою. ──
  await admin.keyboard.press('Tab');
  await admin.keyboard.press('Shift+Tab');
  const svg = host.locator('svg[role="img"]');
  await svg.focus();
  await admin.keyboard.press('ArrowLeft');
  await host.locator('.chart-tip').waitFor();
  expect(await host.locator('.chart-tip p').innerText()).toMatch(/\d/);

  // ── Телефон 360: без бічного скролу; діалог на весь екран. ──
  await admin.setViewportSize({ width: 360, height: 740 });
  await admin.goto(`${base}/admin?period=30`);
  await card(admin, 'Ігри за ведучим').locator('rect.chart-bar').first().waitFor();
  await expectNoSideScroll(admin, 'metrics71-360');
  await viewportShot(admin, 'metrics71-360');
  await cardShots(admin, 'p71-360');
  await card(admin, 'Ігри за ведучим').getByRole('button', { name: 'Розгорнути «Ігри за ведучим»', ...exact }).click();
  await admin.getByRole('dialog').waitFor();
  await expectNoSideScroll(admin, 'metrics71-dialog-360');
  await viewportShot(admin, 'metrics71-dialog-360');
  await admin.keyboard.press('Escape');

  // ── Широкий 1920 і темна тема: кадри розділу й діалогу. ──
  await admin.setViewportSize({ width: 1920, height: 1080 });
  await admin.goto(`${base}/admin?period=30`);
  await card(admin, 'Ігри за ведучим').locator('rect.chart-bar').first().waitFor();
  await expectNoSideScroll(admin, 'metrics71-1920');
  await cardShots(admin, 'p71-1920');
  await card(admin, 'Ігри за ведучим').getByRole('button', { name: 'Розгорнути «Ігри за ведучим»', ...exact }).click();
  await admin.getByRole('dialog').waitFor();
  await shot(admin, 'metrics71-dialog-1920');
  await admin.keyboard.press('Escape');
  await toDark(admin);
  expect(await isLight(admin)).toBe(false);
  await card(admin, 'Ігри за ведучим').locator('rect.chart-bar').first().waitFor();
  await expectNoSideScroll(admin, 'metrics71-1920-dark');
  await card(admin, 'Ігри за ведучим').getByRole('button', { name: 'Розгорнути «Ігри за ведучим»', ...exact }).click();
  await admin.getByRole('dialog').waitFor();
  await shot(admin, 'metrics71-dialog-1920-dark');
  await admin.keyboard.press('Escape');
  await admin.setViewportSize({ width: 360, height: 740 });
  await admin.reload();
  await card(admin, 'Ігри за ведучим').locator('rect.chart-bar').first().waitFor();
  await expectNoSideScroll(admin, 'metrics71-360-dark');
  await cardShots(admin, 'p71-360-dark');
  await card(admin, 'Ігри за ведучим').getByRole('button', { name: 'Розгорнути «Ігри за ведучим»', ...exact }).click();
  await admin.getByRole('dialog').waitFor();
  await viewportShot(admin, 'metrics71-dialog-360-dark');
}

it('part 71: health — four groups, row counts with accounts, «Оновити» refreshes «Перевірено …» without «Завантажуємо…», no side scroll on 360 px; shots light and dark, 360 and 1920', async () => {
  await withAdmin(health71);
}, 300_000);

async function health71() {
  const admin = await adminPage('admin71-health');
  await admin.goto(`${base}/admin`);
  const health = admin.locator('.admin-health');
  await health.locator('.admin-health-group').first().waitFor();
  expect(await health.locator('.admin-health-group h3').allInnerTexts()).toEqual(['Сервер', 'Ігри зараз', 'База даних', 'Проблеми']);
  const rows = health.locator('.admin-stat', { has: admin.locator('dt', { hasText: 'Рядків у таблицях' }) });
  expect(await rows.innerText()).toContain('акаунти');
  const checked = health.getByText(/^Перевірено /);
  const before = await checked.innerText();
  await health.getByRole('button', { name: 'Оновити', ...exact }).click();
  await expect.poll(() => health.getByRole('button', { name: 'Оновити', ...exact }).isEnabled(), POLL).toBe(true);
  expect(await health.getByText('Завантажуємо…').count()).toBe(0);
  expect((await checked.innerText()).startsWith('Перевірено ')).toBe(true);
  expect(before.startsWith('Перевірено ')).toBe(true);
  await health.scrollIntoViewIfNeeded();
  await expectNoSideScroll(admin, 'health71-360');
  for (const i of [0, 1, 2, 3]) await partShot(health.locator('.admin-health-group').nth(i), `p71-health-360-${i}`);
  await viewportShot(admin, 'health71-360');
  await admin.setViewportSize({ width: 1920, height: 1080 });
  await admin.reload();
  await health.locator('.admin-health-group').first().waitFor();
  await expectNoSideScroll(admin, 'health71-1920');
  await toDark(admin);
  await health.locator('.admin-health-group').first().waitFor();
  await expectNoSideScroll(admin, 'health71-1920-dark');
  await admin.setViewportSize({ width: 360, height: 740 });
  await admin.reload();
  await health.locator('.admin-health-group').first().waitFor();
  await health.scrollIntoViewIfNeeded();
  await expectNoSideScroll(admin, 'health71-360-dark');
  await viewportShot(admin, 'health71-360-dark');
}
