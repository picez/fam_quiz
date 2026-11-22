import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { BOT_USER_ID, type PushPayload } from '@quiz/shared';
import { and, eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import webpush from 'web-push';
import { adminEmails } from '../src/config';
import { groupItem, groupMember, inboxItem, user } from '../src/db/schema';
import { createGroup } from '../src/group-store';
import type { PushOptions } from '../src/push';
import { expectNoSideScroll, myId, open, POLL, register } from './helpers/common';
import { ARTIFACTS, base, browser, contexts, ctx, db, exact, flags, problems, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 72 — адмін додає людину до родинної групи (вона одразу учасник, сповіщення у «Вхідних» і пуш)
 * і запис від імені Квіз-бота (учасники бачать автора «Квіз-бот», власник може видалити); заблокованого не додати, повтор — 409;
 * журнал «Модерація» з обома рядками; не-адміну й гостю — 404; 360 px, світла тема (і кадр у темній).
 */

useE2eServer();

it('part 72: groups from the admin — the admin adds a person to a family group (a «Вхідні» notice and a push), a banned one cannot be added, a record from the quiz bot shows to the members with the bot as author; both are in the log; a non-admin gets 404; phone 360 px, light theme', async () => {
  try {
    await groupsAdmin72();
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    // Сервер лишається з адміном і заглушкою push лише на цей тест.
    flags.restarting = true;
    await ctx.shutdown().catch(() => undefined);
    await relisten();
    flags.restarting = false;
  }
}, 600_000);

const KYIV = 'Europe/Kyiv';
const ADMIN_EMAIL = 'admin72@example.com';
const GROUP = 'Карпатські вечори';
const RECORD = 'Дідусь Іван щоліта ходив на Говерлу';

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

async function groupsAdmin72() {
  // ── 0. Сервер з адміном і заглушкою push. ──
  const endpointOf = (name: string) => `https://fcm.googleapis.com/fcm/send/e2e-${name}72`;
  const { publicKey } = webpush.generateVAPIDKeys();
  const outbox: { endpoint: string; payload: PushPayload; options: PushOptions }[] = [];
  const send = async (target: { endpoint: string }, payload: string, options: PushOptions) => {
    outbox.push({ endpoint: target.endpoint, payload: JSON.parse(payload) as PushPayload, options });
    return { status: 201 };
  };
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }), push: { publicKey, send } });
  flags.restarting = false;

  // ── 1. Люди: адмін, Оля (власниця), Петро (не друг Олі, з підпискою на пуш), Тарас (заблокований). ──
  const named: Record<string, Page> = {};
  for (const [key, name, email] of [
    ['admin', 'Адмін 72', ADMIN_EMAIL],
    ['olya', 'Оля', 'olya72@example.com'],
    ['petro', 'Петро', 'petro72@example.com'],
    ['taras', 'Тарас', 'taras72@example.com'],
  ] as const) {
    const page = await light(await open(`${key}72`, 360, 740, { timezoneId: KYIV }));
    await register(page, 'menu', name, email);
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: name, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olya, petro, taras } = named as Record<'admin' | 'olya' | 'petro' | 'taras', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const guest = await light(await open('guest72', 360, 740, { timezoneId: KYIV }));
  const olyaId = await myId(olya);
  const petroId = await myId(petro);
  const tarasId = await myId(taras);
  const subscribed = await petro.request.post(`${base}/api/me/push`, { data: { endpoint: endpointOf('petro'), expirationTime: null, keys: { p256dh: 'BPe2e', auth: 'aue2e' } } });
  expect(subscribed.status(), await subscribed.text()).toBeLessThan(300);
  const banned = await admin.request.post(`${base}/api/admin/users/${tarasId}/ban`, { data: {} });
  expect(banned.status(), await banned.text()).toBeLessThan(300);
  const created = await createGroup(db, olyaId, { name: GROUP, emoji: '⛰️', description: '' }, new Date());
  expect(created.ok).toBe(true);
  const groupId = (created as { id: string }).id;

  // ── 2. Адмін: картка групи → «Додати учасника»: «Пе» → «Петро» → «Додати до групи» (open() приймає підтвердження). ──
  await admin.goto(`${base}/admin/groups/${groupId}`);
  const addSection = admin.locator('section.admin-group-add');
  await addSection.getByRole('heading', { level: 2, name: 'Додати учасника', ...exact }).waitFor();
  expect(await isLight(admin)).toBe(true);
  const addButton = addSection.getByRole('button', { name: 'Додати до групи', ...exact });
  expect(await addButton.isDisabled(), 'the add button with nobody picked').toBe(true);
  // Тарас заблокований: пошук його не знаходить.
  const searched = admin.waitForResponse((response) => response.url().includes('/api/admin/bot/people') && response.url().includes(encodeURIComponent('Тар')));
  await addSection.getByLabel('Пошук за ніком', exact).fill('Тар');
  await searched;
  expect(await addSection.locator('.admin-bot-found').getByRole('button', { name: 'Тарас', ...exact }).count(), 'a banned person is found').toBe(0);
  await addSection.getByLabel('Пошук за ніком', exact).fill('Пе');
  await addSection.locator('.admin-bot-found').getByRole('button', { name: 'Петро', ...exact }).click();
  await view(admin, '72-admin-group-add-picked');
  await addButton.click();
  await addSection.getByText('Петро тепер у групі. Сповіщення — у «Вхідних» і пушем.', exact).waitFor();
  // Картку перечитано: Петро серед учасників.
  const members = admin.locator('section', { has: admin.getByRole('heading', { level: 2, name: 'Учасники', ...exact }) });
  await members.locator('li.admin-card', { hasText: 'Петро' }).waitFor();
  await addSection.scrollIntoViewIfNeeded();
  await view(admin, '72-admin-group-add');

  // ── 3. Пуш — рівно один, Петру, з назвою групи; у «Вхідних» Петра — сповіщення. ──
  await ctx.push!.idle();
  await expect.poll(() => outbox.length, POLL).toBe(1);
  expect(outbox[0]!.endpoint).toBe(endpointOf('petro'));
  expect(outbox[0]!.payload).toMatchObject({ kind: 'group_added', groupId, title: GROUP });
  expect((await db.select().from(inboxItem).where(eq(inboxItem.userId, petroId))).map((row) => [row.kind, row.groupId])).toEqual([['group_added', groupId]]);
  expect(await db.select().from(inboxItem).where(eq(inboxItem.userId, olyaId)), 'the owner gets nothing').toEqual([]);

  // ── 4. Петро: «Вхідні» → «Тебе додали до групи…» → «Відкрити групу»; у «Моїх групах» — картка; у групі він серед учасників. ──
  await petro.goto(`${base}/inbox`);
  const notice = petro.locator('li.inbox-item', { hasText: `Тебе додали до групи «${GROUP}»` });
  await notice.waitFor();
  expect(await notice.innerText()).toContain('Нове');
  await view(petro, '72-inbox-group-added');
  await notice.getByRole('link', { name: 'Відкрити групу', ...exact }).click();
  await petro.waitForURL(`${base}/profile/groups/${groupId}`);
  await petro.getByRole('tab', { name: 'Учасники', ...exact }).click();
  const panel = petro.locator('#group-panel-people');
  await panel.waitFor();
  await expect.poll(() => panel.innerText(), POLL).toContain('Петро');
  expect(await panel.innerText()).toContain('Оля');
  await petro.goto(`${base}/profile/groups`);
  await petro.locator('.group-card', { hasText: GROUP }).waitFor();

  // ── 5. API: заблокованого — 409 member_banned; Петра вдруге — 409 already_member. ──
  const tarasAdd = await admin.request.post(`${base}/api/admin/groups/${groupId}/members`, { data: { userId: tarasId } });
  expect(tarasAdd.status()).toBe(409);
  expect(await tarasAdd.json()).toEqual({ error: 'member_banned' });
  const again = await admin.request.post(`${base}/api/admin/groups/${groupId}/members`, { data: { userId: petroId } });
  expect(again.status()).toBe(409);
  expect(await again.json()).toEqual({ error: 'already_member' });
  expect(outbox.length, 'refusals push nothing').toBe(1);

  // ── 6. Адмін: «Новий запис» — «Факт», текст, про Олю, рік 1975 → «Запис додано.»; у списку — «✍️ Квіз-бот». ──
  await admin.goto(`${base}/admin/groups/${groupId}`);
  const newItem = admin.locator('.admin-group-new-item');
  await newItem.getByRole('heading', { level: 3, name: 'Новий запис', ...exact }).waitFor();
  await newItem.getByLabel('Факт', exact).check();
  await newItem.getByLabel('Текст', exact).fill(RECORD);
  await newItem.getByLabel('Оля', exact).check();
  await newItem.getByLabel('Рік', exact).fill('1975');
  await newItem.scrollIntoViewIfNeeded();
  await view(admin, '72-admin-group-item-form');
  await newItem.getByRole('button', { name: 'Додати запис', ...exact }).click();
  await newItem.getByText('Запис додано.', exact).waitFor();
  const adminRecord = admin.locator('li.admin-card', { hasText: RECORD });
  await adminRecord.waitFor();
  expect(await adminRecord.innerText()).toContain('✍️ Квіз-бот');
  await view(admin, '72-admin-group-item');
  const [stored] = await db.select().from(groupItem).where(and(eq(groupItem.groupId, groupId), eq(groupItem.text, RECORD)));
  expect(stored).toMatchObject({ authorId: BOT_USER_ID, year: 1975, photo: null, surprise: false, about: [{ kind: 'member', userId: olyaId, name: 'Оля' }] });
  expect(outbox.length, 'members get no push about a record').toBe(1);

  // ── 7. Петро бачить запис від «Квіз-бот» (не «вже не в групі»), без «Видалити»; Оля — власниця — з «Видалити». ──
  await petro.goto(`${base}/profile/groups/${groupId}`);
  const petroRecord = petro.locator('article.group-item', { hasText: RECORD });
  await petroRecord.waitFor();
  expect(await petroRecord.innerText()).toContain('✍️ Квіз-бот');
  expect(await petroRecord.innerText()).not.toContain('вже не в групі');
  expect(await petroRecord.getByRole('button', { name: 'Видалити', ...exact }).count()).toBe(0);
  await view(petro, '72-group-bot-record');
  await olya.goto(`${base}/profile/groups/${groupId}`);
  const olyaRecord = olya.locator('article.group-item', { hasText: RECORD });
  await olyaRecord.waitFor();
  await olyaRecord.getByRole('button', { name: 'Видалити', ...exact }).waitFor();

  // ── 8. Журнал «Модерація»: по рядку на кожну дію. ──
  await admin.goto(`${base}/admin/log?groups=moderation`);
  const entries = admin.locator('ul.admin-list > li.admin-card');
  await entries.first().waitFor();
  await expect.poll(async () => (await entries.allInnerTexts()).filter((line) => line.includes(`додав(-ла) Петро до групи «${GROUP}»`)).length, POLL).toBe(1);
  const lines = await entries.allInnerTexts();
  expect(lines.filter((line) => line.includes(`додав(-ла) запис «${RECORD}» у групу «${GROUP}» від Квіз-бота (Оля)`)).length, 'group_item_add').toBe(1);
  await view(admin, '72-admin-log');

  // ── 9. Не-адмін і гість: 404, у базі нічого нового. ──
  const membersBefore = (await db.select().from(groupMember).where(eq(groupMember.groupId, groupId))).length;
  const itemsBefore = (await db.select().from(groupItem).where(eq(groupItem.groupId, groupId))).length;
  for (const who of [petro, guest]) {
    expect((await who.request.post(`${base}/api/admin/groups/${groupId}/members`, { data: { userId: tarasId } })).status()).toBe(404);
    expect((await who.request.post(`${base}/api/admin/groups/${groupId}/items`, { data: { kind: 'fact', text: 'Ні', about: [], answer: null, year: null, photo: null, surprise: false } })).status()).toBe(404);
  }
  expect((await db.select().from(groupMember).where(eq(groupMember.groupId, groupId))).length).toBe(membersBefore);
  expect((await db.select().from(groupItem).where(eq(groupItem.groupId, groupId))).length).toBe(itemsBefore);

  // ── 10. Кадр у темній темі: картка групи з обома розділами. ──
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'uk-UA', timezoneId: KYIV, colorScheme: 'dark', storageState: { cookies: (await admin.context().storageState()).cookies, origins: [] } });
  contexts.push(context);
  const dark = await context.newPage();
  await dark.goto(`${base}/admin/groups/${groupId}`);
  await dark.locator('section.admin-group-add').waitFor();
  expect(await isLight(dark), 'the dark shot is dark').toBe(false);
  await dark.locator('section.admin-group-add').scrollIntoViewIfNeeded();
  await view(dark, '72-admin-group-add-dark');
  await context.close();

  const unexpected = problems.filter((line) => !/ 40[49] .*\/api\/admin\//.test(line));
  expect(unexpected, `page errors (${unexpected.length}):\n${unexpected.join('\n')}`).toEqual([]);
}
