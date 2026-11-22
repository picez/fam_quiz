import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { DEFAULT_RULES, type PushPayload } from '@quiz/shared';
import { and, eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import webpush from 'web-push';
import { adminEmails } from '../src/config';
import { inboxItem, pushBroadcast, user } from '../src/db/schema';
import type { PushOptions } from '../src/push';
import { afterSplash, ARTIFACTS, base, browser, contexts, ctx, db, exact, flags, problems, relisten, shot, snapshot, useE2eServer } from './helpers/setup';
import { bodyText, click, expectNoSideScroll, join, open, pickOption, POLL, reveal28a, register } from './helpers/common';

/**
 * Наскрізні тести: частина 70 — «Звернення» в адмінці, «Вхідні» на сайті, момент гри у скарзі «Щось не працює».
 * Розсилка без push лягає у «Вхідні» (дзвіночок, /inbox, «Нове», бейдж зникає після показу); скарга з пульта гравця несе код кімнати, раунд, запитання;
 * адмін бачить її в одній вкладці «Звернення» (старі адреси ведуть на нові), відповідь лягає у «Вхідні»; розсилка «Усім» з push — одне повідомлення
 * підписаному й рядок у вхідних кожному; після гри — тиха панель «Не пропускай новини» (раз на 14 днів); гість на /inbox іде на вхід;
 * нижнє меню адміна вміщається в трьох мовах на 360, 344 і 320 px; 360 px, світла тема (і кадри в темній).
 */

useE2eServer();

it('part 70: appeals and inbox — a broadcast reaches the inbox without push, an in-game problem report carries the moment, the admin reply lands in the inbox, old admin addresses redirect, the post-game push invite stays quiet after «Не зараз»; phone 360 px, light theme', async () => {
  try {
    await appealsInbox70();
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

const ADMIN_EMAIL = 'admin70@example.com';
const TITLE = 'Субота у «Вікторині»';
const TEXT = 'Заходь о 19:00 — нова гра.';
const QUIZ_TITLE = 'Вікторина 70';
const QUESTION = 'Яка річка протікає через Київ?';
const PROBLEM = 'Не рахує бали на пульті';
const REPLY = 'Виправили, дякуємо!';

const light = async (page: Page) => {
  await page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  return page;
};
const isLight = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('is-light'));
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
const darkOf = async (page: Page, width = 360, height = 740) => {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'uk-UA', colorScheme: 'dark', storageState: { cookies: (await page.context().storageState()).cookies, origins: [] } });
  contexts.push(context);
  return context.newPage();
};

/** Нижнє меню: жоден пункт не виходить за екран, не накриває сусіда й не обрізає підпис. */
const menuFits = async (page: Page, label: string) => {
  const result = (await page.evaluate(`(() => {
    const nav = document.querySelector('nav.menu');
    const width = innerWidth;
    const items = [...nav.children];
    const rects = items.map((item) => item.getBoundingClientRect());
    const bad = [];
    items.forEach((item, i) => {
      if (rects[i].left < -0.5 || rects[i].right > width + 0.5) bad.push('outside ' + i);
      if (item.scrollWidth > item.clientWidth + 1) bad.push('clipped ' + i + ' ' + item.textContent);
    });
    for (let i = 1; i < rects.length; i++) if (Math.min(rects[i].right, rects[i - 1].right) - Math.max(rects[i].left, rects[i - 1].left) > 1) bad.push('overlap ' + i);
    if (nav.scrollWidth > nav.clientWidth) bad.push('nav scrolls: ' + nav.scrollWidth + ' > ' + nav.clientWidth + '; items ' + rects.map((r) => Math.round(r.width)).join(','));
    return { bad, wide: document.documentElement.scrollWidth <= width, count: items.length };
  })()`)) as { bad: string[]; wide: boolean; count: number };
  expect(result.bad, `${label}: the bottom menu`).toEqual([]);
  expect(result.wide, `${label}: horizontal scroll`).toBe(true);
  expect(result.count, `${label}: items (five + admin + bell + theme)`).toBe(8);
};

async function appealsInbox70() {
  // ── 0. Сервер з адміном, БЕЗ push. ──
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }) });
  flags.restarting = false;

  const named: Record<string, Page> = {};
  for (const [key, name, email] of [
    ['admin', 'Адмін 70', ADMIN_EMAIL],
    ['olya', 'Оля 70', 'olya70@example.com'],
    ['taras', 'Тарас 70', 'taras70@example.com'],
  ] as const) {
    const page = await light(await open(`${key}70`, 360, 740));
    await register(page, 'menu', name, email);
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: name, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olya, taras } = named as Record<'admin' | 'olya' | 'taras', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const guest = await light(await open('guest70', 360, 740));
  const bell = (page: Page) => page.locator('nav.menu a.menu-inbox');

  // ── 1. Розсилка без push: «Люди: Оля 70» → «Отримають на сайті: 1, з них сповіщенням: 0» → надіслати. ──
  await admin.goto(`${base}/admin/broadcast`);
  expect(await isLight(admin)).toBe(true);
  const form = admin.locator('section[aria-labelledby="broadcast-new"]');
  await form.getByText('Сповіщення на сервері не налаштовано — розсилка прийде лише у «Вхідні» на сайті.', exact).waitFor();
  await form.locator('#broadcast-title').fill(TITLE);
  await form.locator('#broadcast-text').fill(TEXT);
  await form.locator('#broadcast-url').fill('/library');
  await form.getByRole('radio', { name: 'Вибраним людям', ...exact }).check();
  await form.getByRole('searchbox').fill('Оля 70');
  await form.getByRole('button', { name: 'Оля 70', ...exact }).click();
  const audience = form.locator('.broadcast-audience');
  await expect.poll(() => audience.innerText(), POLL).toBe('Отримають на сайті: 1, з них сповіщенням: 0');
  await view(admin, 'p70-broadcast-nopush-360');
  await form.getByRole('button', { name: 'Надіслати', ...exact }).click();
  await form.getByText('Розсилку надіслано.', exact).waitFor();

  // ── Дзвіночок Олі: «1» після переходу; /inbox — розсилка з «Нове»; після показу бейджа немає. ──
  await olya.goto(base);
  const olyaBell = bell(olya);
  await olyaBell.waitFor();
  await expect.poll(() => olyaBell.getAttribute('aria-label'), POLL).toBe('Вхідні, непрочитаних: 1');
  expect(await olyaBell.locator('.menu-badge').innerText()).toBe('1');
  expect(await olyaBell.getAttribute('href')).toBe('/inbox');
  await view(olya, 'p70-menu-bell-360');
  await olya.setViewportSize({ width: 375, height: 812 });
  await shot(olya, 'p70-menu-bell-375');
  await olya.setViewportSize({ width: 1920, height: 1080 });
  await shot(olya, 'p70-menu-bell-1920');
  await olya.setViewportSize({ width: 360, height: 740 });
  await olyaBell.click();
  await olya.waitForURL(`${base}/inbox`);
  const broadcastCard = olya.locator('li.inbox-item', { hasText: TITLE });
  await broadcastCard.waitFor();
  expect(await broadcastCard.innerText()).toContain('Нове');
  expect(await broadcastCard.innerText()).toContain(TEXT);
  expect(await broadcastCard.innerText()).toContain('Від адміністрації');
  expect(await broadcastCard.getByRole('link', { name: 'Відкрити', ...exact }).getAttribute('href')).toBe('/library');
  await expect.poll(() => olyaBell.getAttribute('aria-label'), POLL).toBe('Вхідні');
  await view(olya, 'p70-inbox-broadcast-360');
  await olya.locator('nav.menu a:not(.menu-inbox)').first().click();
  await expect.poll(() => olyaBell.locator('.menu-badge').count(), POLL).toBe(0);
  // Тарас — не адресат: «Вхідні» порожні.
  await taras.goto(`${base}/inbox`);
  await taras.getByText("Тут з'являться повідомлення від адміністрації й відповіді на твої звернення.", exact).waitFor();
  expect(await bell(taras).locator('.menu-badge').count()).toBe(0);
  await view(taras, 'p70-inbox-empty-360');

  // ── 2. Гра: Оля на першому запитанні тисне «Повідомити про проблему» → нова вкладка з моментом гри. ──
  const common = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
  const question = {
    ...common,
    id: 'q70-1',
    type: 'single' as const,
    text: QUESTION,
    options: [{ id: 'q70-a', text: 'Дніпро' }, { id: 'q70-b', text: 'Десна' }, { id: 'q70-c', text: 'Прип’ять' }, { id: 'q70-d', text: 'Ірпінь' }],
    correctId: 'q70-a',
  };
  const quizData = { ...makeRoundsQuiz([classicRound('r70', [question] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES })]), title: QUIZ_TITLE };
  const saved = await admin.request.post(`${base}/api/quizzes`, { data: quizData });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;
  const startGame = async (): Promise<string> => {
    await admin.goto(`${base}/quizzes`);
    await admin.locator('.quiz-list li', { hasText: QUIZ_TITLE }).getByRole('button', { name: 'Грати', ...exact }).click();
    await admin.waitForURL(/\/host\/\d{6}$/);
    return admin.url().slice(-6);
  };
  const code = await startGame();
  await join(olya, code, 'Оля 70', false);
  await click(admin, 'Почати гру');
  await afterSplash(admin, olya);
  await click(admin, 'Почати раунд');
  await afterSplash(admin, olya);
  await olya.locator('h1', { hasText: QUESTION }).waitFor();
  const [popup] = await Promise.all([olya.context().waitForEvent('page'), olya.getByRole('link', { name: 'Повідомити про проблему', ...exact }).click()]);
  await popup.waitForURL(`${base}/report?from=${encodeURIComponent(`/play/${code}`)}`);
  await popup.getByText(`Гра ${code}: раунд 1, запитання 1`, exact).waitFor();
  await popup.getByLabel('Що сталося', exact).fill(PROBLEM);
  await view(popup, 'p70-report-moment-360');
  await popup.getByRole('button', { name: 'Надіслати', ...exact }).click();
  await popup.getByText('Дякуємо! Ми отримали повідомлення.', exact).waitFor();
  expect(await popup.evaluate("localStorage.getItem('quiz:problem-moment')"), 'the moment is cleared after sending').toBeNull();
  await popup.close();

  // ── 3. Адмін: «Звернення» з бейджем; старі адреси ведуть на нові; три підвкладки без бічного скролу; картка з моментом гри; відповідь. ──
  await admin.goto(`${base}/admin`);
  const tabs = admin.locator('nav.admin-tabs a');
  await tabs.first().waitFor();
  expect(await tabs.count(), 'twelve admin tabs').toBe(12);
  const tab = admin.locator('nav.admin-tabs a[href="/admin/appeals"]');
  await expect.poll(async () => Number(await tab.locator('.menu-badge').innerText().catch(() => '0')), POLL).toBeGreaterThanOrEqual(1);
  expect(await tab.locator('.menu-badge').getAttribute('aria-label')).toMatch(/^Звернення, нових: \d+$/);
  await admin.goto(`${base}/admin/errors?view=reports`);
  await admin.waitForURL(`${base}/admin/appeals/problems`);
  await admin.goto(`${base}/admin/reports`);
  await admin.waitForURL(`${base}/admin/appeals/complaints`);
  await admin.goto(`${base}/admin/errors`);
  await admin.waitForURL(`${base}/admin/appeals/errors`);
  await admin.goto(`${base}/admin/appeals`);
  // Голий адрес відкриває першу підвкладку, де є нове: скарг на вікторини немає, «Щось не працює» — одна.
  await admin.waitForURL(`${base}/admin/appeals/problems`);
  const views = admin.locator('nav.admin-appeals-views a');
  expect(await views.count()).toBe(3);
  expect((await views.allInnerTexts()).map((text) => text.replace(/\s*\d+$/, '').trim())).toEqual(['Скарги на вікторини й профілі', 'Щось не працює', 'Збої сервера']);
  expect(await views.nth(1).getAttribute('aria-current')).toBe('page');
  const card = admin.locator('li.admin-card', { hasText: PROBLEM });
  await card.waitFor();
  const game = card.locator('.admin-problem-game');
  const gameText = await game.innerText();
  expect(gameText).toContain(`Гра ${code}`);
  expect(gameText).toContain('Скаржився гравець');
  expect(gameText).toContain(`Вікторина: ${QUIZ_TITLE}`);
  expect(gameText).toContain('Запитання 1 — Один правильний варіант');
  expect(gameText).toContain(`Текст запитання: ${QUESTION}`);
  expect(await game.getByRole('link', { name: 'Відкрити вікторину', ...exact }).getAttribute('href')).toBe(`/admin/quizzes/${quizId}`);
  await view(admin, 'p70-admin-appeals-problems-360');
  await card.getByRole('button', { name: 'Відповісти', ...exact }).click();
  await card.getByText('Відповідь прийде гравцю у «Вхідні» на сайті.', exact).waitFor();
  await card.getByLabel('Відповідь автору', exact).fill(REPLY);
  await card.getByRole('button', { name: 'Надіслати відповідь', ...exact }).click();
  await admin.getByText('Відповідь у вхідних гравця (сповіщень у нього немає).', exact).waitFor();

  // ── 4. Оля: дзвіночок «1» → /inbox: відповідь із цитатою; після показу бейдж 0; на /report відповідь теж є. ──
  await olya.goto(base);
  await expect.poll(() => bell(olya).getAttribute('aria-label'), POLL).toBe('Вхідні, непрочитаних: 1');
  await bell(olya).click();
  await olya.waitForURL(`${base}/inbox`);
  const replyCard = olya.locator('li.inbox-item', { hasText: REPLY });
  await replyCard.waitFor();
  const replyText = await replyCard.innerText();
  expect(replyText).toContain('Відповідь на твоє повідомлення');
  expect(replyText).toContain(`Ти писав(-ла): ${PROBLEM}`);
  expect(replyText).toContain('Нове');
  await expect.poll(() => bell(olya).getAttribute('aria-label'), POLL).toBe('Вхідні');
  await view(olya, 'p70-inbox-reply-360');
  await replyCard.getByRole('link', { name: 'Усі мої повідомлення', ...exact }).click();
  await olya.waitForURL(`${base}/report`);
  await olya.locator('section[aria-labelledby="problem-mine-title"] li', { hasText: PROBLEM }).getByText(`Відповідь адміністратора: ${REPLY}`, exact).waitFor();

  // ── Темна тема: «Вхідні» Олі й «Звернення» адміна. ──
  const olyaDark = await darkOf(olya);
  await olyaDark.goto(`${base}/inbox`);
  await olyaDark.locator('li.inbox-item', { hasText: REPLY }).waitFor();
  expect(await isLight(olyaDark), 'the dark page is dark').toBe(false);
  await view(olyaDark, 'p70-inbox-dark-360');
  await olyaDark.close();
  const adminDark = await darkOf(admin);
  await adminDark.goto(`${base}/admin/appeals/problems`);
  await adminDark.getByRole('button', { name: 'Вирішені', ...exact }).waitFor();
  expect(await isLight(adminDark), 'the dark page is dark').toBe(false);
  await view(adminDark, 'p70-admin-appeals-dark-360');
  await adminDark.close();
  await admin.goto(`${base}/admin/appeals/problems`);
  await admin.getByRole('button', { name: 'Вирішені', ...exact }).waitFor();
  await admin.setViewportSize({ width: 1920, height: 1080 });
  await shot(admin, 'p70-admin-appeals-1920');
  await admin.setViewportSize({ width: 360, height: 740 });

  // ── 5. Сервер із заглушкою push: Оля підписується; розсилка «Усім» → одне повідомлення Олі, у «Вхідних» — усім акаунтам. ──
  const endpointOf = (name: string) => `https://fcm.googleapis.com/fcm/send/e2e-${name}70`;
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
  const subscribed = await olya.request.post(`${base}/api/me/push`, { data: { endpoint: endpointOf('olya'), expirationTime: null, keys: { p256dh: 'BPe2e', auth: 'aue2e' } } });
  expect(subscribed.status(), await subscribed.text()).toBeLessThan(300);
  // Перша розсилка була менш ніж 10 хв тому: «старимо» її, щоб ліміт не заважав.
  await db.update(pushBroadcast).set({ createdAt: new Date(Date.now() - 3_600_000) });
  await admin.goto(`${base}/admin/broadcast`);
  const form2 = admin.locator('section[aria-labelledby="broadcast-new"]');
  await form2.locator('#broadcast-title').fill('Ще одна новина');
  await form2.locator('#broadcast-text').fill('Сьогодні ввечері — гра для всіх.');
  await expect.poll(() => form2.locator('.broadcast-audience').innerText(), POLL).toMatch(/^Отримають на сайті: \d+, з них сповіщенням: 1$/);
  await form2.getByRole('button', { name: 'Надіслати', ...exact }).click();
  await form2.getByText('Розсилку надіслано.', exact).waitFor();
  await ctx.push!.idle();
  await expect.poll(() => outbox.filter((o) => o.payload.kind === 'broadcast').length, POLL).toBe(1);
  expect(outbox.filter((o) => o.payload.kind === 'broadcast')[0]!.endpoint).toBe(endpointOf('olya'));
  const [sent] = await db.select().from(pushBroadcast).where(eq(pushBroadcast.title, 'Ще одна новина'));
  const inboxOf = async (email: string) => {
    const [who] = await db.select().from(user).where(eq(user.email, email));
    return db.select().from(inboxItem).where(and(eq(inboxItem.userId, who!.id), eq(inboxItem.broadcastId, sent!.id)));
  };
  expect(await inboxOf('olya70@example.com'), 'Оля has it in the inbox').toHaveLength(1);
  expect(await inboxOf('taras70@example.com'), 'Тарас has it in the inbox without a subscription').toHaveLength(1);
  const history = admin.locator('section[aria-labelledby="broadcast-history"] li.admin-card', { hasText: 'Ще одна новина' });
  await history.waitFor();
  expect(await history.innerText()).toMatch(/У вхідних: \d+, прочитали: 0; сповіщенням: 1/);
  await history.scrollIntoViewIfNeeded();
  await view(admin, 'p70-broadcast-history-360');
  await taras.goto(base);
  await expect.poll(() => bell(taras).getAttribute('aria-label'), POLL).toBe('Вхідні, непрочитаних: 1');

  // ── 6. Запрошення після гри: Тарас доходить до кінця — «Не пропускай новини»; «Не зараз» ховає, після перезавантаження — тиша. ──
  const code2 = await startGame();
  await join(taras, code2, 'Тарас 70', false);
  await click(admin, 'Почати гру');
  await afterSplash(admin, taras);
  await click(admin, 'Почати раунд');
  await afterSplash(admin, taras);
  await taras.locator('h1', { hasText: QUESTION }).waitFor();
  await pickOption(taras, 'Дніпро');
  await reveal28a(admin);
  await click(admin, 'Завершити гру');
  await taras.getByText('Гру завершено').first().waitFor({ timeout: 30_000 });
  const invite = taras.locator('section.push-invite');
  await invite.waitFor();
  expect(await invite.innerText()).toContain('Не пропускай новини');
  expect(await taras.evaluate("localStorage.getItem('quiz:push-invite-at')"), 'the time of showing is remembered').not.toBeNull();
  await afterSplash(taras);
  await invite.scrollIntoViewIfNeeded();
  await view(taras, 'p70-push-invite-360');
  await click(taras, 'Не зараз');
  await invite.waitFor({ state: 'detached' });
  await taras.reload();
  await taras.getByText('Гру завершено').first().waitFor({ timeout: 30_000 });
  await taras.waitForTimeout(1500);
  expect(await taras.locator('section.push-invite').count(), 'no invite for 14 days after showing').toBe(0);

  // ── 7. Гість: /inbox → вхід; API — 401. ──
  await guest.goto(`${base}/inbox`);
  await guest.waitForURL(`${base}/login?next=%2Finbox`);
  expect((await guest.request.get(`${base}/api/me/inbox`)).status()).toBe(401);
  expect((await guest.request.get(`${base}/api/me/inbox/badge`)).status()).toBe(401);
  expect(await guest.locator('nav.menu a.menu-inbox').count(), 'a guest has no bell').toBe(0);

  // ── 8. Нижнє меню адміна (п'ять пунктів + «Адмінка» + дзвіночок + тема) у трьох мовах на 360, 344 і 320 px. ──
  for (const lang of ['uk', 'de', 'it', 'ar']) {
    const changed = await admin.request.put(`${base}/api/me/locale`, { data: { locale: lang } });
    expect(changed.ok(), await changed.text()).toBe(true);
    await admin.goto(base);
    await admin.locator('nav.menu a.menu-inbox').waitFor();
    for (const width of [360, 344, 320]) {
      await admin.setViewportSize({ width, height: 740 });
      await menuFits(admin, `${lang} ${width}`);
      if (width === 320) await viewportShot(admin, `p70-menu-admin-${lang}-320`);
    }
  }
  await admin.request.put(`${base}/api/me/locale`, { data: { locale: 'uk' } });

  expect(await bodyText(guest)).not.toContain('undefined');
  const unexpected = problems.filter((line) => !/ (400|401|404|409|429) .*\/api\//.test(line));
  expect(unexpected, `page errors (${unexpected.length}):\n${unexpected.join('\n')}`).toEqual([]);
}
