import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import { adminEmails } from '../src/config';
import { quiz, user } from '../src/db/schema';
import { bodyText, expectNoSideScroll, field, open, POLL, register } from './helpers/common';
import { ARTIFACTS, base, ctx, db, exact, flags, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 73 — особисті категорії в «Моїх вікторинах» (створити, «вище», перекласти вікторину, фільтр у адресі,
 * видалити категорію — вікторини лишаються), дати створення й порядок (нові, давні, за назвою, нещодавно змінені);
 * чужі категорії — 404; адмінка — дати й порядок без категорій. Телефон 360 px і ПК 1920 px, світла тема (один кадр — темна).
 */

useE2eServer();

it('part 73: quiz folders — the author adds «Для Асі» and «Кіно», moves one up, files quizzes, filters by a folder kept in the URL across a reload, sorts by name and oldest, an edit keeps the folder and puts the quiz first among recently changed, deleting a folder keeps its quizzes, a demo is folderless; someone else gets 404; the admin sees created dates and sorts by name; 360 and 1920 px, light theme, no side scroll', async () => {
  try {
    await folders73();
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    // Сервер лишається з адміном лише на цей тест.
    flags.restarting = true;
    await ctx.shutdown().catch(() => undefined);
    await relisten();
    flags.restarting = false;
  }
}, 600_000);

const ADMIN_EMAIL = 'admin73@example.com';
const KYIV = 'Europe/Kyiv';

const light = async (page: Page) => {
  await page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  return page;
};
/** Кадр лише видимої частини екрана: що бачить людина без прокручування. */
const viewportShot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}-viewport.png`) });
};
const view = async (page: Page, name: string) => {
  await viewportShot(page, name);
  await expectNoSideScroll(page, name);
};

const titles = (page: Page) => page.locator('ul.quiz-list > li h2').allTextContents();
const chips = (page: Page) => page.getByRole('group', { name: 'Категорії', ...exact }).getByRole('button').allTextContents();
const card = (page: Page, title: string) => page.locator('ul.quiz-list > li', { has: page.getByRole('heading', { name: title, ...exact }) });

async function folders73() {
  // ── 0. Сервер з адміном. ──
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }) });
  flags.restarting = false;

  // ── 1. Олена й три вікторини з розведеними датами. ──
  const olena = await light(await open('olena73', 360, 800, { timezoneId: KYIV }));
  await register(olena, 'menu', 'Олена 73', 'olena73@example.com');
  const ids: Record<string, string> = {};
  for (const title of ['Гора', 'Ґанок', 'Дім']) {
    const saved = await olena.request.post(`${base}/api/quizzes`, { data: { ...makeQuiz([single], { speedBonus: false }), title } });
    expect(saved.ok(), await saved.text()).toBe(true);
    ids[title] = ((await saved.json()) as { id: string }).id;
  }
  // Створено: Дім — найдавніша, потім Гора, потім Ґанок; змінено — Гора найсвіжіша.
  const dates: Record<string, [string, string]> = {
    Дім: ['2026-09-01T09:00:00Z', '2026-10-01T09:00:00Z'],
    Гора: ['2026-09-10T09:00:00Z', '2026-11-10T09:00:00Z'],
    Ґанок: ['2026-09-20T09:00:00Z', '2026-10-20T09:00:00Z'],
  };
  for (const [title, [created, changed]] of Object.entries(dates)) {
    await db.update(quiz).set({ createdAt: new Date(created), updatedAt: new Date(changed) }).where(eq(quiz.id, ids[title]!));
  }

  // ── 2. 360 px: дати на картках; дві категорії, «Кіно» вгору. ──
  await olena.goto(`${base}/quizzes`);
  await card(olena, 'Дім').waitFor();
  expect(await titles(olena)).toEqual(['Гора', 'Ґанок', 'Дім']);
  expect(await card(olena, 'Дім').locator('.quiz-dates').textContent()).toBe('Створено 1 вересня 2026 · змінено 1 жовтня 2026');
  expect(await olena.locator('.quiz-dates').count()).toBe(3);
  const manage = olena.getByRole('button', { name: 'Керувати категоріями', ...exact });
  await manage.click();
  expect(await manage.getAttribute('aria-expanded')).toBe('true');
  const manager = olena.getByRole('region', { name: 'Керувати категоріями', ...exact });
  for (const name of ['Для Асі', 'Кіно']) {
    await field(olena, 'Нова категорія').fill(name);
    await manager.getByRole('button', { name: 'Додати', ...exact }).click();
    await manager.getByRole('button', { name: `Вище: ${name}`, ...exact }).waitFor();
    expect(await field(olena, 'Нова категорія').inputValue()).toBe('');
  }
  await manager.getByRole('button', { name: 'Вище: Кіно', ...exact }).click();
  await expect.poll(() => chips(olena), POLL).toEqual(['Усі (3)', 'Кіно (0)', 'Для Асі (0)', 'Без категорії (3)']);
  expect(await manager.getByRole('button', { name: 'Вище: Кіно', ...exact }).isDisabled()).toBe(true);
  await view(olena, '73-folders-manage-360');

  // ── 3. Перекласти «Ґанок» і «Дім»; фільтр в адресі переживає оновлення. ──
  await card(olena, 'Ґанок').locator('.quiz-folder-pick select').selectOption({ label: 'Для Асі' });
  await card(olena, 'Дім').locator('.quiz-folder-pick select').selectOption({ label: 'Кіно' });
  await expect.poll(() => chips(olena), POLL).toEqual(['Усі (3)', 'Кіно (1)', 'Для Асі (1)', 'Без категорії (1)']);
  await manage.click();
  await olena.getByRole('button', { name: 'Для Асі (1)', ...exact }).click();
  await expect.poll(() => titles(olena), POLL).toEqual(['Ґанок']);
  expect(olena.url()).toMatch(/\/quizzes\?folder=[0-9a-f-]{36}$/);
  await olena.reload();
  await card(olena, 'Ґанок').waitFor();
  expect(await titles(olena)).toEqual(['Ґанок']);
  expect(await olena.getByRole('button', { name: 'Для Асі (1)', ...exact }).getAttribute('aria-pressed')).toBe('true');
  await view(olena, '73-folder-filter-360');

  // ── 4. Порядок на «Усі»: за назвою, давні. ──
  await olena.getByRole('button', { name: 'Усі (3)', ...exact }).click();
  await olena.locator('.quiz-folder-sort select').selectOption({ label: 'За назвою' });
  await expect.poll(() => titles(olena), POLL).toEqual(['Гора', 'Ґанок', 'Дім']);
  await olena.locator('.quiz-folder-sort select').selectOption({ label: 'Спершу давні' });
  await expect.poll(() => titles(olena), POLL).toEqual(['Дім', 'Гора', 'Ґанок']);
  expect(new URL(olena.url()).search).toBe('?sort=old');
  await olena.locator('.quiz-folder-sort select').selectOption({ label: 'Спершу нові' });
  await expect.poll(() => titles(olena), POLL).toEqual(['Ґанок', 'Гора', 'Дім']);

  // ── 5. Редагування «Ґанок»: категорія та сама, у «Нещодавно змінених» — перша. ──
  await olena.goto(`${base}/quizzes/${ids['Ґанок']}`);
  await field(olena, 'Назва вікторини').fill('Ґанок і сад');
  await olena.getByRole('button', { name: 'Зберегти', ...exact }).click();
  await olena.getByRole('heading', { name: 'Ґанок і сад', ...exact }).waitFor();
  await olena.goto(`${base}/quizzes`);
  await card(olena, 'Ґанок і сад').waitFor();
  expect(await titles(olena)).toEqual(['Ґанок і сад', 'Гора', 'Дім']);
  expect(await card(olena, 'Ґанок і сад').locator('.quiz-folder-pick select').locator('option:checked').textContent()).toBe('Для Асі');

  // ── 6. Видалити «Для Асі»: вікторина лишається, тепер без категорії. ──
  await manage.click();
  const asyaRow = manager.locator('li', { has: olena.getByRole('button', { name: 'Вище: Для Асі', ...exact }) });
  await asyaRow.getByRole('button', { name: 'Видалити категорію', ...exact }).click();
  await expect.poll(() => chips(olena), POLL).toEqual(['Усі (3)', 'Кіно (1)', 'Без категорії (2)']);
  await card(olena, 'Ґанок і сад').waitFor();
  const folders = (await (await olena.request.get(`${base}/api/quiz-folders`)).json()) as { id: string; name: string }[];
  expect(folders.map((one) => one.name)).toEqual(['Кіно']);

  // ── 7. «Додати приклад» — нова вікторина без категорії. ──
  await olena.getByRole('button', { name: 'Додати приклад', ...exact }).click();
  await expect.poll(() => chips(olena), POLL).toEqual(['Усі (4)', 'Кіно (1)', 'Без категорії (3)']);
  await manage.click();

  // ── 8. 1920 px: чипи й «Порядок» в одному рядку, картки сіткою. ──
  await olena.setViewportSize({ width: 1920, height: 1080 });
  await olena.evaluate('new Promise(requestAnimationFrame)');
  const chipTop = (await olena.locator('.quiz-folder-chip').first().boundingBox())!.y;
  const sortTop = (await olena.locator('.quiz-folder-sort select').boundingBox())!.y;
  expect(Math.abs(chipTop - sortTop), 'chips and sort on one row').toBeLessThanOrEqual(8);
  const tops = await olena.locator('ul.quiz-list > li').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(tops.filter((top) => top === tops[0]).length, 'cards in a row').toBeGreaterThanOrEqual(3);
  await view(olena, '73-quizzes-1920');
  await manage.click();
  await view(olena, '73-folders-manage-1920');
  await manage.click();

  // Темна тема — один кадр.
  // Темна — типова тема: ключа теми немає (E2E_THEME=light ставить його — тут прибираємо).
  const dark = await open('olena73dark', 1920, 1080, { timezoneId: KYIV });
  await dark.context().addInitScript(() => localStorage.removeItem('quiz:theme'));
  await dark.context().addCookies(await olena.context().cookies());
  await dark.goto(`${base}/quizzes`);
  await card(dark, 'Дім').waitFor();
  await view(dark, '73-quizzes-1920-dark');
  await dark.setViewportSize({ width: 360, height: 800 });
  await dark.evaluate('new Promise(requestAnimationFrame)');
  await view(dark, '73-quizzes-360-dark');

  // ── 9. Чуже — 404. ──
  const petro = await light(await open('petro73', 360, 800, { timezoneId: KYIV }));
  await register(petro, 'menu', 'Петро 73', 'petro73@example.com');
  expect(await (await petro.request.get(`${base}/api/quiz-folders`)).json()).toEqual([]);
  const kino = folders[0]!.id;
  expect((await petro.request.put(`${base}/api/quizzes/${ids['Дім']}/folder`, { data: { folderId: null } })).status()).toBe(404);
  const own = await petro.request.post(`${base}/api/quizzes`, { data: { ...makeQuiz([single], { speedBonus: false }), title: 'Петрова' } });
  const ownId = ((await own.json()) as { id: string }).id;
  expect((await petro.request.put(`${base}/api/quizzes/${ownId}/folder`, { data: { folderId: kino } })).status()).toBe(404);

  // ── 10. Адмін: дати й порядок; категорій немає. ──
  const admin = await light(await open('admin73', 360, 800, { timezoneId: KYIV }));
  await register(admin, 'menu', 'Адмін 73', ADMIN_EMAIL);
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  await admin.goto(`${base}/admin/quizzes`);
  const adminTitles = () => admin.locator('ul.admin-list > li h2').allTextContents();
  await admin.getByRole('heading', { name: 'Дім', ...exact }).waitFor();
  const domCard = admin.locator('ul.admin-list > li', { has: admin.getByRole('heading', { name: 'Дім', ...exact }) });
  expect(await domCard.locator('.quiz-dates').textContent()).toBe('Створено 1 вересня 2026 · змінено 1 жовтня 2026');
  await admin.locator('.admin-quiz-sort select').selectOption({ label: 'За назвою' });
  await expect.poll(async () => (await adminTitles()).filter((one) => ['Гора', 'Ґанок і сад', 'Дім', 'Петрова'].includes(one)), POLL).toEqual(['Гора', 'Ґанок і сад', 'Дім', 'Петрова']);
  expect(new URL(admin.url()).search).toBe('?sort=name');
  expect(await bodyText(admin)).not.toContain('Категор');
  await view(admin, '73-admin-quizzes-360');
  await admin.setViewportSize({ width: 1920, height: 1080 });
  await admin.evaluate('new Promise(requestAnimationFrame)');
  await view(admin, '73-admin-quizzes-1920');

  // «Вікторини бота»: копія Олениної вікторини від адміна — з рядком «Створено …».
  const adminQuiz = await admin.request.post(`${base}/api/quizzes`, { data: { ...makeQuiz([single], { speedBonus: false }), title: 'Для бота 73' } });
  expect(adminQuiz.ok()).toBe(true);
  await admin.goto(`${base}/admin/bot`);
  const copySection = admin.locator('section[aria-labelledby="admin-bot-copy"]');
  await copySection.locator('li', { hasText: 'Для бота 73' }).getByRole('button', { name: 'Передати боту копію', ...exact }).click();
  const botQuizzes = admin.locator('section[aria-labelledby="admin-bot-quizzes"]');
  const botCard = botQuizzes.locator('li', { hasText: 'Для бота 73' });
  await botCard.waitFor();
  expect(await botCard.locator('.quiz-dates').textContent()).toMatch(/^Створено \d{1,2} \S+ \d{4}$/);
  await botQuizzes.locator('.admin-quiz-sort select').waitFor();
  expect(await bodyText(admin)).not.toContain('Категор');
  await botQuizzes.scrollIntoViewIfNeeded();
  await view(admin, '73-admin-bot-1920');
}
