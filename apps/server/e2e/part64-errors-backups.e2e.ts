import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type PushPayload } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import webpush from 'web-push';
import { adminEmails } from '../src/config';
import { user } from '../src/db/schema';
import { dbBackups, r2BackupStore } from '../src/db-backup';
import { reportError } from '../src/log';
import type { PushOptions } from '../src/push';
import { fakeR2 } from '../src/testing/fake-r2';
import { bodyText, expectNoSideScroll, open, POLL, register } from './helpers/common';
import { ARTIFACTS, base, browser, contexts, ctx, db, exact, flags, problems, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 64 — збої сервера й скарги гравців, копії бази. Збій записується замаскованим і згрупованим, вирішується, бейдж на вкладці «Збої»;
 * гість і акаунт скаржаться, адмін відповідає пушем, автор бачить відповідь; «зробити копію зараз» у підробний R2, далі ліміт години; лише інструкція відновлення;
 * не-адміну 404; 360 px, світла тема (і кадри в темній).
 */

useE2eServer();

it('part 64: errors, problem reports and backups — a stored server error is masked, grouped and resolved with a badge; a guest and an account report a problem, the admin replies by push and the author sees it; a copy now, then the hourly limit; restore instructions only; a non-admin gets 404; phone 360 px, light theme', async () => {
  try {
    await errorsBackups64();
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    // Сервер лишається з адміном, заглушкою push і копіями лише на цей тест.
    flags.restarting = true;
    await ctx.shutdown().catch(() => undefined);
    await relisten();
    flags.restarting = false;
  }
}, 600_000);

const ADMIN_EMAIL = 'admin64@example.com';
const GUEST_TEXT = 'Не відкривається бібліотека';
const OLYA_TEXT = 'Таблиця не оновлюється';
const REPLY = 'Виправили, дякуємо!';

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

async function errorsBackups64() {
  // ── 0. Сервер з адміном, заглушкою push і копіями над підробним R2. ──
  const endpointOf = (name: string) => `https://fcm.googleapis.com/fcm/send/e2e-${name}64`;
  const { publicKey } = webpush.generateVAPIDKeys();
  const outbox: { endpoint: string; payload: PushPayload; options: PushOptions }[] = [];
  const send = async (target: { endpoint: string }, payload: string, options: PushOptions) => {
    outbox.push({ endpoint: target.endpoint, payload: JSON.parse(payload) as PushPayload, options });
    return { status: 201 };
  };
  const r2 = fakeR2();
  const store = r2BackupStore(r2.settings);
  const backups = dbBackups({ db, store, pauseMs: 0 });
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({
    adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }),
    push: { publicKey, send },
    backupList: () => store.list(),
    backups,
  });
  flags.restarting = false;

  // ── Люди: Адмін 64; Оля — акаунт з підпискою; гість — окремий контекст без входу. ──
  const named: Record<string, Page> = {};
  for (const [key, name, email] of [
    ['admin', 'Адмін 64', ADMIN_EMAIL],
    ['olya', 'Оля', 'olya64@example.com'],
  ] as const) {
    const page = await light(await open(`${key}64`, 360, 740));
    await register(page, 'menu', name, email);
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: name, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olya } = named as Record<'admin' | 'olya', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const guest = await light(await open('guest64', 360, 740));
  const subscribed = await olya.request.post(`${base}/api/me/push`, { data: { endpoint: endpointOf('olya'), expirationTime: null, keys: { p256dh: 'BPe2e', auth: 'aue2e' } } });
  expect(subscribed.status(), await subscribed.text()).toBeLessThan(300);

  // ── 1. Двічі той самий збій з особистим у тексті; запис у базу. ──
  for (let i = 0; i < 2; i += 1) reportError(new Error('e2e64 no user olya@example.com token=abc123def'), { where: 'e2e64' });
  await ctx.errors!.flush();

  // ── 2. Гість: «Повідомити про проблему» → /report?from=%2F → надіслати; ще запити — 429 на четвертому за годину. ──
  await guest.goto(base);
  expect(await isLight(guest)).toBe(true);
  await guest.getByRole('link', { name: 'Повідомити про проблему', ...exact }).click();
  await guest.waitForURL(`${base}/report?from=%2F`);
  await guest.getByLabel('Що сталося', exact).fill(GUEST_TEXT);
  await guest.getByRole('button', { name: 'Надіслати', ...exact }).click();
  await guest.getByText('Дякуємо! Ми отримали повідомлення.', exact).waitFor();
  await view(guest, 'problem64-guest-360');
  // Ліміт рахує запити, а не збережені скарги: порожній текст → 400 (не плодить скарг), четвертий запит за годину → 429.
  const statuses: number[] = [];
  for (let i = 0; i < 3; i += 1) statuses.push((await guest.request.post(`${base}/api/problem-reports`, { data: { text: '', page: null } })).status());
  expect(statuses, 'the guest limit: 4th request in an hour').toEqual([400, 400, 429]);

  // ── 3. Оля з налаштувань профілю → посилання → скарга; «Мої повідомлення» — «Відкрите». ──
  await olya.goto(`${base}/profile/settings`);
  await olya.getByRole('link', { name: 'Повідомити про проблему', ...exact }).click();
  await olya.waitForURL(`${base}/report?from=%2Fprofile%2Fsettings`);
  await olya.getByLabel('Що сталося', exact).fill(OLYA_TEXT);
  await olya.getByRole('button', { name: 'Надіслати', ...exact }).click();
  await olya.getByText('Дякуємо! Ми отримали повідомлення.', exact).waitFor();
  const mine = olya.locator('section[aria-labelledby="problem-mine-title"]');
  await mine.locator('li', { hasText: OLYA_TEXT }).getByText('Відкрите', exact).waitFor();
  await view(olya, 'problem64-olya-360');

  // ── 4. Адмін: бейдж «3» на «Збоях»; список збоїв замаскований; вирішення. ──
  await admin.goto(`${base}/admin`);
  expect(await isLight(admin)).toBe(true);
  const tab = admin.locator('nav.admin-tabs a[href="/admin/errors"]');
  await expect.poll(() => tab.locator('.menu-badge').innerText(), POLL).toBe('3');
  expect(await tab.locator('.menu-badge').getAttribute('aria-label')).toBe('Збої, нових: 3');
  await tab.click();
  await admin.waitForURL(`${base}/admin/errors`);
  const card = admin.locator('li.admin-card', { hasText: 'e2e64' });
  await card.getByText('Де: e2e64', exact).waitFor();
  const cardText = await card.innerText();
  expect(cardText).toContain('Повторів: 2');
  expect(cardText).toContain('[email]');
  const pageText = await bodyText(admin);
  expect(pageText, 'an email in the error list').not.toContain('olya@example.com');
  expect(pageText, 'a token in the error list').not.toContain('abc123def');
  await card.locator('details summary').click();
  await view(admin, 'errors64-list-360');
  await card.getByRole('button', { name: 'Позначити як вирішене', ...exact }).click();
  await admin.getByText('Збоїв немає.', exact).waitFor();
  await admin.getByRole('button', { name: 'Вирішені', ...exact }).click();
  await admin.locator('li.admin-card', { hasText: 'e2e64' }).waitFor();
  // Бейдж після переходу: лишилось 2 скарги.
  await admin.getByRole('link', { name: 'Скарги гравців', ...exact }).click();
  await admin.waitForURL(`${base}/admin/errors?view=reports`);
  await expect.poll(() => tab.locator('.menu-badge').innerText(), POLL).toBe('2');

  // ── 5. Скарги: гість без «Відповісти»; Оля — відомості про сторінку; відповідь пушем; гостьову закрито. ──
  const guestCard = admin.locator('li.admin-card', { hasText: GUEST_TEXT });
  const olyaCard = admin.locator('li.admin-card', { hasText: OLYA_TEXT });
  await guestCard.waitFor();
  await olyaCard.waitFor();
  expect(await guestCard.innerText()).toContain('Гість');
  expect(await guestCard.getByRole('button', { name: 'Відповісти', ...exact }).count(), 'a guest report has a reply button').toBe(0);
  const olyaText = await olyaCard.innerText();
  expect(olyaText).toContain('Сторінка: /profile/settings');
  expect(olyaText).toContain('Екран: 360x740');
  expect(olyaText).toContain('Тема: світла');
  await olyaCard.getByRole('button', { name: 'Відповісти', ...exact }).click();
  await olyaCard.getByLabel('Відповідь автору', exact).fill(REPLY);
  await view(admin, 'problems64-reply-360');
  await olyaCard.getByRole('button', { name: 'Надіслати відповідь', ...exact }).click();
  await olyaCard.waitFor({ state: 'detached' });
  await ctx.push!.idle();
  await expect.poll(() => outbox.filter((o) => o.payload.kind === 'problem_reply').length, POLL).toBe(1);
  const replies = outbox.filter((o) => o.payload.kind === 'problem_reply');
  expect(replies[0]!.endpoint).toBe(endpointOf('olya'));
  expect(replies[0]!.payload).toMatchObject({ kind: 'problem_reply', text: REPLY });
  await admin.locator('li.admin-card', { hasText: GUEST_TEXT }).getByRole('button', { name: 'Вирішено', ...exact }).click();
  await admin.getByText('Скарг немає.', exact).waitFor();
  // Бейдж перечитується на кожен перехід (не на дію в тій самій адресі): клік по вкладці — новий location.key.
  await tab.click();
  await expect.poll(() => tab.locator('.menu-badge').count(), POLL).toBe(0);
  await admin.getByRole('link', { name: 'Скарги гравців', ...exact }).click();
  await admin.getByRole('button', { name: 'Вирішені', ...exact }).click();
  await admin.locator('li.admin-card', { hasText: OLYA_TEXT }).waitFor();
  await admin.locator('li.admin-card', { hasText: GUEST_TEXT }).waitFor();
  await view(admin, 'problems64-list-360');

  // ── 6. Оля перезавантажує /report: «Вирішене» і відповідь. ──
  await olya.goto(`${base}/report`);
  const item = olya.locator('section[aria-labelledby="problem-mine-title"] li', { hasText: OLYA_TEXT });
  await item.getByText('Вирішене', exact).waitFor();
  await item.getByText(`Відповідь адміністратора: ${REPLY}`, exact).waitFor();
  await view(olya, 'problem64-olya-replied-360');

  // ── 7. «Копії»: порожньо, інструкція відновлення без кнопки; копія на вимогу; ліміт години. ──
  await admin.goto(`${base}/admin/backups`);
  await admin.getByText('Копій ще немає.', exact).waitFor();
  const restore = admin.locator('section[aria-labelledby="backups-restore"]');
  await restore.waitFor();
  expect(await restore.innerText()).toContain('db:restore');
  expect(await admin.getByRole('button', { name: /Відновити/ }).count(), 'a restore button').toBe(0);
  await view(admin, 'backups64-empty-360');
  const now = admin.getByRole('button', { name: 'Зробити копію зараз', ...exact });
  await now.click(); // діалог підтвердження приймає open()
  await admin.getByText(/^Остання спроба: вдалася .*\(вручну\)/).waitFor({ timeout: 30_000 });
  await backups.idle();
  await admin.reload();
  const row = admin.locator('ul.admin-list li.admin-card');
  await row.waitFor();
  // Рівень копії — скільки міграцій у журналі drizzle (0000…), а не число з голови.
  const migrations = (JSON.parse(readFileSync(resolve(import.meta.dirname, '../drizzle/meta/_journal.json'), 'utf8')) as { entries: unknown[] }).entries.length;
  expect(await row.innerText()).toContain(`міграцій: ${migrations}`);
  await admin.getByText(/^Наступну копію можна о \d{2}:\d{2}\.$/).waitFor();
  expect(await now.isDisabled(), 'the copy-now button during the hourly gap').toBe(true);
  expect([...r2.objects.keys()].filter((key) => key.startsWith('backups/db/'))).toHaveLength(1);
  const again = await admin.request.post(`${base}/api/admin/backups`);
  expect(again.status()).toBe(409);
  expect(((await again.json()) as { error: string }).error).toBe('backup_recent');
  await view(admin, 'backups64-360');

  // ── 8. Журнал. ──
  await admin.goto(`${base}/admin/log`);
  await admin.getByText(/^Адмін 64 позначив\(-ла\) збій «e2e64: .*» як вирішений/).first().waitFor();
  await admin.getByText(`Адмін 64 відповів(-ла) Оля на скаргу: «${REPLY}»`, exact).first().waitFor();
  await admin.getByText(`Адмін 64 закрив(-ла) скаргу «${GUEST_TEXT}»`, exact).first().waitFor();
  await admin.getByText('Адмін 64 зробив(-ла) копію бази вручну', exact).first().waitFor();
  expect(await admin.locator('main').innerText(), 'the log has an email').not.toContain('@');

  // ── 9. Не-адмін і гість: 404, вкладка веде на головну; у JSON немає email. ──
  for (const who of [olya, guest]) {
    for (const path of ['/api/admin/errors', '/api/admin/problems', '/api/admin/problems/badge']) expect((await who.request.get(`${base}${path}`)).status(), path).toBe(404);
    expect((await who.request.post(`${base}/api/admin/backups`)).status()).toBe(404);
    expect((await who.request.post(`${base}/api/admin/backups/restore`)).status()).toBe(404);
  }
  await olya.goto(`${base}/admin/errors`);
  await olya.waitForURL(`${base}/`);
  for (const path of ['/api/admin/errors?status=resolved', '/api/admin/problems?status=resolved', '/api/admin/problems/badge', '/api/admin/backups']) {
    const response = await admin.request.get(`${base}${path}`);
    expect(response.status(), path).toBe(200);
    expect(await response.text(), `${path} has an email`).not.toContain('@');
  }

  // ── Темна тема: кадри «Збоїв» (збій і скарги), «Копій» і /report у тому самому телефоні. ──
  const darkContext = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'uk-UA', colorScheme: 'dark', storageState: { cookies: (await admin.context().storageState()).cookies, origins: [] } });
  contexts.push(darkContext);
  const dark = await darkContext.newPage();
  await dark.goto(`${base}/admin/errors`);
  await dark.getByRole('button', { name: 'Вирішені', ...exact }).click();
  const darkCard = dark.locator('li.admin-card', { hasText: 'e2e64' });
  await darkCard.waitFor();
  expect(await isLight(dark), 'the dark page is dark').toBe(false);
  await darkCard.locator('details summary').click();
  await view(dark, 'errors64-list-dark-360');
  await dark.goto(`${base}/admin/errors?view=reports`);
  await dark.getByRole('button', { name: 'Вирішені', ...exact }).click();
  await dark.locator('li.admin-card', { hasText: OLYA_TEXT }).waitFor();
  await view(dark, 'problems64-list-dark-360');
  await dark.goto(`${base}/admin/backups`);
  await dark.locator('ul.admin-list li.admin-card').waitFor();
  await view(dark, 'backups64-dark-360');
  await dark.goto(`${base}/report?from=%2Fprofile%2Fsettings`);
  await dark.getByLabel('Що сталося', exact).waitFor();
  await dark.getByLabel('Що сталося', exact).fill(OLYA_TEXT);
  await view(dark, 'problem64-dark-360');
  await dark.close();

  const unexpected = problems.filter((line) => !/ (400|404|409|429) .*\/api\//.test(line));
  expect(unexpected, `page errors (${unexpected.length}):\n${unexpected.join('\n')}`).toEqual([]);
}
