import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { adminEmails } from '../src/config';
import { feedEvent, groupMember, user, userLike } from '../src/db/schema';
import { createItem } from '../src/group-items';
import { createGroup } from '../src/group-store';
import { bodyText, expectNoSideScroll, myId, open, POLL, register } from './helpers/common';
import { ARTIFACTS, base, browser, contexts, ctx, db, exact, flags, problems, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 63 — модерація стрічки й груп та журнал: адмін ховає подію друга (друг її не бачить, автор бачить «Приховано модератором»),
 * вилучає учасника й ховає родинну групу (учасникам 404, власник бачить причину), фільтрує журнал і вивантажує CSV (BOM, «;», київський час);
 * не-адміну — 404; 360 px, світла тема (і кадри в темній).
 */

useE2eServer();

it('part 63: moderation — the admin hides a friend’s feed event (the friend no longer sees it, the author sees «hidden by a moderator»), hides a family group (members get 404, the owner sees the reason), removes a member, filters the log and exports CSV; a non-admin gets 404; phone 360 px, light theme', async () => {
  try {
    await moderation63();
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

const KYIV = 'Europe/Kyiv';
const ADMIN_EMAIL = 'admin63@example.com';
const GROUP = 'Поліські вечори';
const REASON = 'Перевірка модератором';

const light = async (page: Page) => {
  await page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  return page;
};
const isLight = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('is-light'));
/** Кадр лише видимої частини екрана 360 × 740: що бачить людина без прокручування. */
const viewportShot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}-viewport.png`) });
};
const view = async (page: Page, name: string) => {
  await viewportShot(page, name);
  await expectNoSideScroll(page, name);
};
/** Сьогодні за Києвом: YYYY-MM-DD і YYYY-MM-DD HH:MM:SS. */
const kyivDay = (at: Date) => at.toLocaleDateString('en-CA', { timeZone: KYIV });
const kyivStamp = (at: Date) => at.toLocaleString('sv-SE', { timeZone: KYIV });

async function moderation63() {
  // ── 0. Сервер з адміном. ──
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }) });
  flags.restarting = false;

  const named: Record<string, Page> = {};
  for (const [key, name, email] of [
    ['admin', 'Адмін 63', ADMIN_EMAIL],
    ['olya', 'Оля', 'olya63@example.com'],
    ['petro', 'Петро', 'petro63@example.com'],
    ['taras', 'Тарас', 'taras63@example.com'],
  ] as const) {
    const page = await light(await open(`${key}63`, 360, 740, { timezoneId: KYIV }));
    await register(page, 'menu', name, email);
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: name, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olya, petro, taras } = named as Record<'admin' | 'olya' | 'petro' | 'taras', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const guest = await light(await open('guest63', 360, 740, { timezoneId: KYIV }));
  const olyaId = await myId(olya);
  const petroId = await myId(petro);
  const tarasId = await myId(taras);

  // ── 1. Оля й Петро — взаємні друзі; подія рівня Олі; Петро її бачить і вподобав. ──
  expect((await olya.request.put(`${base}/api/me/friends/${petroId}`)).ok()).toBe(true);
  expect((await petro.request.put(`${base}/api/me/friends/${olyaId}`)).ok()).toBe(true);
  const at = new Date();
  const [event] = await db
    .insert(feedEvent)
    .values({ key: `level:${olyaId}:7`, userId: olyaId, kind: 'level', gameId: null, data: { kind: 'level', level: 7 }, at, createdAt: at })
    .returning();
  await petro.goto(`${base}/feed`);
  const seen = petro.locator('.feed-card', { hasText: 'досяг(-ла) рівня 7' });
  await seen.waitFor();
  await seen.getByRole('button', { name: 'Вподобати подію', ...exact }).click();
  await expect.poll(async () => (await db.select().from(userLike).where(and(eq(userLike.userId, petroId), eq(userLike.eventKey, event!.key)))).length, POLL).toBe(1);

  // ── 2. Адмін: «Стрічка» → фільтр за Олею → «Сховати». ──
  await admin.goto(`${base}/admin/feed`);
  expect(await isLight(admin)).toBe(true);
  await admin.getByLabel('Пошук за ніком', exact).fill('Оля');
  await admin.locator('.admin-bot-found').getByRole('button', { name: 'Оля', ...exact }).click();
  const row = admin.locator('li.admin-feed-row', { hasText: 'досяг(-ла) рівня 7' });
  await row.waitFor();
  expect(await row.innerText()).toContain('❤️ 1');
  await view(admin, '63-admin-feed');
  await row.getByRole('button', { name: 'Сховати', ...exact }).click();
  await row.getByText('Приховано', exact).waitFor();
  await row.getByRole('button', { name: 'Показати', ...exact }).waitFor();
  await view(admin, '63-admin-feed-hidden');
  // Вподобайки під подією сховано разом з нею.
  const likeRow = (await db.select().from(userLike).where(and(eq(userLike.userId, petroId), eq(userLike.eventKey, event!.key))))[0];
  expect(likeRow?.hidden, 'the like under a hidden event').toBe(true);
  // Друг: події немає.
  await petro.goto(`${base}/feed`);
  await petro.locator('.feed-empty').waitFor();
  expect(await petro.locator('.feed-card', { hasText: 'рівня 7' }).count(), 'Петро still sees the hidden event').toBe(0);
  expect((await petro.request.post(`${base}/api/feed/${event!.id}/like`, { data: { liked: true } })).status(), 'a like on a hidden event').toBe(404);
  // Автор: бачить подію з позначкою, без лайка.
  await olya.goto(`${base}/feed`);
  const own = olya.locator('.feed-card', { hasText: 'досяг(-ла) рівня 7' });
  await own.waitFor();
  await own.getByText('Приховано модератором', exact).waitFor();
  expect(await own.locator('.feed-like, .feed-like-count').count(), 'a heart under a hidden event').toBe(0);
  await view(olya, '63-feed-hidden-author');

  // ── 3. Група «Поліські вечори»: Оля — власниця, Петро й Тарас — члени, один запис. ──
  const created = await createGroup(db, olyaId, { name: GROUP, emoji: '🏕️', description: '' }, new Date());
  expect(created.ok).toBe(true);
  const groupId = (created as { id: string }).id;
  for (const id of [petroId, tarasId]) await db.insert(groupMember).values({ groupId, userId: id, role: 'member', joinedAt: new Date() });
  const item = await createItem(db, groupId, olyaId, { kind: 'story', text: 'Як ми ловили карасів на Прип’яті', about: [], answer: null, year: null, photo: null, surprise: false }, new Date());
  expect(item.ok).toBe(true);

  await admin.goto(`${base}/admin/groups`);
  await admin.getByLabel('Назва групи чи нік власника', exact).fill('полісь');
  await admin.getByRole('button', { name: 'Шукати', ...exact }).click();
  const card = admin.locator('li.admin-group-card', { hasText: GROUP });
  await card.waitFor();
  expect(await admin.locator('li.admin-group-card').count(), 'the search finds one group').toBe(1);
  expect(await card.innerText()).toContain('Власник: Оля');
  expect(await card.innerText()).toContain('3 людини');
  await view(admin, '63-admin-groups');
  await card.getByRole('link').click();
  await admin.getByRole('heading', { level: 2, name: 'Учасники', ...exact }).waitFor();
  const members = admin.locator('section', { has: admin.getByRole('heading', { level: 2, name: 'Учасники', ...exact }) });
  const tarasRow = members.locator('li.admin-card', { hasText: 'Тарас' });
  await tarasRow.waitFor();
  await tarasRow.getByRole('button', { name: 'Вилучити', ...exact }).click(); // open() приймає підтвердження
  await expect.poll(() => tarasRow.count(), POLL).toBe(0);
  expect(await members.locator('li.admin-card').count(), 'two members are left').toBe(2);
  await view(admin, '63-admin-group');
  await admin.locator('#admin-group-reason').fill(REASON);
  await admin.getByRole('button', { name: 'Сховати групу', ...exact }).click();
  await admin.getByRole('button', { name: 'Повернути', ...exact }).waitFor();
  await admin.locator('main').getByText('Приховано', exact).first().waitFor();
  await view(admin, '63-admin-group-hidden');

  // Петро: група — 404 і в списку немає.
  await petro.goto(`${base}/profile/groups/${groupId}`);
  await petro.getByText(/Групу не знайдено/).waitFor();
  expect((await petro.request.get(`${base}/api/groups/${groupId}`)).status()).toBe(404);
  await petro.goto(`${base}/profile/groups`);
  await petro.getByText(/^Ще жодної групи\./).waitFor();
  expect(await bodyText(petro)).not.toContain(GROUP);
  // Оля: картка з позначкою й причиною, не посилання; відкрити не можна.
  await olya.goto(`${base}/profile/groups`);
  const hidden = olya.locator('.group-card.is-hidden', { hasText: GROUP });
  await hidden.waitFor();
  expect(await hidden.innerText()).toContain('Приховано модератором: група недоступна');
  expect(await hidden.innerText()).toContain(`Причина: ${REASON}`);
  expect(await olya.locator('a.group-card').count(), 'a link to the hidden group').toBe(0);
  expect((await olya.request.get(`${base}/api/groups/${groupId}`)).status()).toBe(404);
  await view(olya, '63-group-hidden-owner');
  // Тарас: вилучений, групи в списку немає.
  await taras.goto(`${base}/profile/groups`);
  await taras.getByText(/^Ще жодної групи\./).waitFor();
  expect(await bodyText(taras)).not.toContain(GROUP);

  // ── 4. Журнал: «Модерація», «Від» = «До» = сьогодні (Київ) → три рядки; пошук «полісь» → два. ──
  const today = kyivDay(new Date());
  await admin.goto(`${base}/admin/log`);
  const entries = admin.locator('ul.admin-list > li.admin-card');
  await entries.first().waitFor();
  const moderationBox = admin.getByRole('checkbox', { name: 'Модерація', ...exact });
  await moderationBox.click();
  await expect.poll(() => moderationBox.isChecked(), POLL).toBe(true);
  await admin.getByLabel('Від', exact).fill(today);
  await admin.getByLabel('До', exact).fill(today);
  await expect.poll(() => entries.count(), POLL).toBe(3);
  const lines = await entries.allInnerTexts();
  expect(lines.filter((line) => line.includes(`сховав(-ла) групу «${GROUP}» (Оля)`)).length, 'group_hide').toBe(1);
  expect(lines.filter((line) => line.includes(`вилучив(-ла) Тарас з групи «${GROUP}»`)).length, 'group_member_remove').toBe(1);
  expect(lines.filter((line) => line.includes('сховав(-ла) подію стрічки Оля')).length, 'feed_hide').toBe(1);
  expect(lines.join('\n'), 'the log has an email').not.toContain('@');
  await admin.getByLabel('Пошук', exact).fill('полісь');
  await admin.getByRole('button', { name: 'Шукати', ...exact }).click();
  await expect.poll(() => entries.count(), POLL).toBe(2);
  expect(admin.url()).toContain('groups=moderation');
  expect(admin.url()).toContain(`from=${today}`);
  await admin.evaluate('window.scrollTo(0, 0)');
  await view(admin, '63-admin-log-filters');
  // Інша доба — нічого.
  const later = kyivDay(new Date(Date.now() + 2 * 86_400_000));
  await admin.getByLabel('До', exact).fill(later);
  await expect.poll(() => entries.count(), POLL).toBe(2);
  await admin.getByLabel('Від', exact).fill(later);
  await admin.getByText('За цими фільтрами записів немає.', exact).waitFor();
  await admin.getByLabel('Від', exact).fill(today);
  await admin.getByLabel('До', exact).fill(today);
  await expect.poll(() => entries.count(), POLL).toBe(2);

  // «Вивантажити CSV»: BOM, «;», київський час, код виду.
  const downloading = admin.waitForEvent('download');
  await admin.getByRole('button', { name: 'Вивантажити CSV', ...exact }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`admin-log-${today}.csv`);
  const bytes = readFileSync((await download.path())!);
  expect([...bytes.subarray(0, 3)], 'the BOM').toEqual([0xef, 0xbb, 0xbf]);
  const csvLines = bytes.toString('utf8').slice(1).split('\r\n').filter((line) => line !== '');
  expect(csvLines[0]).toBe('Час (Київ);Адмін;Дія;Ціль;Подробиці');
  expect(csvLines.length, 'a header and two rows').toBe(3);
  const stamps = csvLines.slice(1).map((line) => line.split(';')[0]!);
  for (const stamp of stamps) {
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(Math.abs(Date.parse(`${stamp}Z`) - Date.parse(`${kyivStamp(new Date())}Z`)), 'Kyiv time, not UTC').toBeLessThan(15 * 60_000);
  }
  expect(csvLines.filter((line) => line.split(';')[2] === 'group_hide').length).toBe(1);
  expect(csvLines.filter((line) => line.split(';')[2] === 'group_member_remove').length).toBe(1);
  expect(csvLines.join('\n'), 'the CSV has an email').not.toContain('@');

  // ── 5. Не-адмін і гість: 404. ──
  for (const who of [petro, guest]) {
    for (const path of ['/api/admin/feed', '/api/admin/groups', `/api/admin/groups/${groupId}`, '/api/admin/log', '/api/admin/log/export']) {
      expect((await who.request.get(`${base}${path}`)).status(), path).toBe(404);
    }
    expect((await who.request.put(`${base}/api/admin/feed/${event!.id}/hidden`, { data: { hidden: false } })).status()).toBe(404);
    expect((await who.request.put(`${base}/api/admin/groups/${groupId}/hidden`, { data: { hidden: false } })).status()).toBe(404);
  }
  expect((await admin.request.get(`${base}/api/admin/log/export`)).status()).toBe(200);

  // ── 6. Кадри в темній темі: ті самі сторінки. ──
  const darkOf = async (source: Page, path: string, name: string, ready: (page: Page) => Promise<unknown>) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'uk-UA', timezoneId: KYIV, colorScheme: 'dark', storageState: { cookies: (await source.context().storageState()).cookies, origins: [] } });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(`${base}${path}`);
    await ready(page);
    expect(await isLight(page), `${name} is dark`).toBe(false);
    await view(page, `${name}-dark`);
    await context.close();
  };
  await darkOf(admin, '/admin/feed', '63-admin-feed', (page) => page.locator('li.admin-feed-row').first().waitFor());
  await darkOf(admin, '/admin/groups', '63-admin-groups', (page) => page.locator('li.admin-group-card').first().waitFor());
  await darkOf(admin, `/admin/groups/${groupId}`, '63-admin-group', (page) => page.getByRole('button', { name: 'Повернути', ...exact }).waitFor());
  await darkOf(admin, `/admin/log?groups=moderation&from=${today}&to=${today}&q=${encodeURIComponent('полісь')}`, '63-admin-log-filters', (page) => page.locator('ul.admin-list > li.admin-card').first().waitFor());
  await darkOf(olya, '/profile/groups', '63-group-hidden-owner', (page) => page.locator('.group-card.is-hidden').waitFor());
  await darkOf(olya, '/feed', '63-feed-hidden-author', (page) => page.getByText('Приховано модератором', exact).waitFor());

  const unexpected = problems.filter((line) => !/ 404 .*\/api\/(admin|groups|feed)\//.test(line));
  expect(unexpected, `page errors (${unexpected.length}):\n${unexpected.join('\n')}`).toEqual([]);
}
