import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz, single } from '@quiz/engine/testing';
import { type AdminBroadcasts, type PushPayload } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { type Locator, type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import webpush from 'web-push';
import { adminEmails } from '../src/config';
import { follow, groupMember, pushSubscription, user } from '../src/db/schema';
import { createGroup } from '../src/group-store';
import type { PushOptions } from '../src/push';
import { bodyText, expectNoSideScroll, myId, open, POLL, register } from './helpers/common';
import { ARTIFACTS, base, browser, contexts, ctx, db, exact, flags, problems, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 59 — push-розсилка адміна: адмін шле розсилку родинній групі, отримують лише її члени з підпискою, крім того, хто вимкнув
 * «Оголошення від адміністраторів»; мертва підписка — помилка й прибирається; друга розсилка впирається в ліміт 10 хв; історія й журнал;
 * календарні пуші доходять і до того, хто вимкнув оголошення; не-адміну — 404; 360 px, світла тема (і кадр вкладки в темній).
 */

useE2eServer();

it('part 59: push broadcast — the admin sends to a family group, only its members get it and not the one who switched admin announcements off, the dead subscription counts as failed, the second send hits the 10-minute limit, the history and the log show it; calendar pushes still reach the one who switched off; a non-admin gets 404; phone 360 px, light theme', async () => {
  try {
    await broadcast59();
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
const ADMIN_EMAIL = 'admin59@example.com';
const TITLE = 'Нова вікторина у бібліотеці';
const TEXT = 'Заходь — там «Карпатські озера».';
const GROUP = 'Поліські вечори';

const light = async (page: Page) => {
  await page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  return page;
};
const opacityOf = (button: Locator) => button.evaluate((el) => getComputedStyle(el).opacity);
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

async function broadcast59() {
  // ── 0. Сервер з адміном і заглушкою push; підписка Петра «мертва» (410). ──
  const endpointOf = (name: string) => `https://fcm.googleapis.com/fcm/send/e2e-${name}59`;
  const { publicKey } = webpush.generateVAPIDKeys();
  const outbox: { endpoint: string; payload: PushPayload; options: PushOptions }[] = [];
  const gone = new Set<string>([endpointOf('petro')]);
  const send = async (target: { endpoint: string }, payload: string, options: PushOptions) => {
    outbox.push({ endpoint: target.endpoint, payload: JSON.parse(payload) as PushPayload, options });
    return { status: gone.has(target.endpoint) ? 410 : 201 };
  };
  const sentTo = (kind: PushPayload['kind']) => outbox.filter((o) => o.payload.kind === kind);
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }), push: { publicKey, send } });
  flags.restarting = false;

  // ── Люди: Адмін 59; Оля, Петро, Ганна (група «Поліські вечори»); Тарас — не в групі. ──
  const named: Record<string, Page> = {};
  for (const [key, name, email] of [
    ['admin', 'Адмін 59', ADMIN_EMAIL],
    ['olya', 'Оля', 'olya59@example.com'],
    ['petro', 'Петро', 'petro59@example.com'],
    ['hanna', 'Ганна', 'hanna59@example.com'],
    ['taras', 'Тарас', 'taras59@example.com'],
  ] as const) {
    const page = await light(await open(`${key}59`, 360, 740, { timezoneId: KYIV }));
    await register(page, 'menu', name, email);
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: name, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olya, petro, hanna, taras } = named as Record<'admin' | 'olya' | 'petro' | 'hanna' | 'taras', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const guest = await light(await open('guest59', 360, 740, { timezoneId: KYIV }));
  const ids = new Map<Page, string>();
  for (const page of [olya, petro, hanna, taras]) ids.set(page, await myId(page));

  for (const [page, name] of [[olya, 'olya'], [petro, 'petro'], [hanna, 'hanna'], [taras, 'taras']] as const) {
    const subscribed = await page.request.post(`${base}/api/me/push`, { data: { endpoint: endpointOf(name), expirationTime: null, keys: { p256dh: 'BPe2e', auth: 'aue2e' } } });
    expect(subscribed.status(), await subscribed.text()).toBeLessThan(300);
  }
  const group = await createGroup(db, ids.get(olya)!, { name: GROUP, emoji: '🏕️', description: '' }, new Date());
  expect(group.ok).toBe(true);
  const groupId = (group as { id: string }).id;
  for (const page of [petro, hanna]) await db.insert(groupMember).values({ groupId, userId: ids.get(page)!, role: 'member', joinedAt: new Date() });

  // ── 1. Ганна вимикає «Оголошення від адміністраторів»; після перезавантаження — вимкнено. ──
  const adminPush = hanna.getByRole('checkbox', { name: 'Отримувати', ...exact });
  await hanna.goto(`${base}/profile/settings`);
  expect(await isLight(hanna)).toBe(true);
  await adminPush.waitFor();
  expect(await adminPush.isChecked(), 'admin announcements are on by default').toBe(true);
  const saved = hanna.waitForResponse((r) => r.url().endsWith('/api/me/admin-push') && r.request().method() === 'PUT');
  await adminPush.uncheck();
  expect((await saved).status()).toBe(200);
  await hanna.reload();
  await adminPush.waitFor();
  await expect.poll(() => adminPush.isChecked(), POLL).toBe(false);
  await adminPush.scrollIntoViewIfNeeded();
  await view(hanna, 'broadcast59-profile-360');

  // ── 2. Адмін на «Розсилці»: група «Поліські вечори» → «Отримають 2 людини» (Оля, Петро). ──
  await admin.goto(`${base}/admin/broadcast`);
  expect(await isLight(admin)).toBe(true);
  const form = admin.locator('section[aria-labelledby="broadcast-new"]');
  const audience = form.locator('.broadcast-audience');
  const sendButton = form.getByRole('button', { name: 'Надіслати', ...exact });
  await form.locator('#broadcast-title').fill(TITLE);
  await form.locator('#broadcast-text').fill(TEXT);
  await form.locator('#broadcast-url').fill('/library');
  await form.getByRole('radio', { name: 'Родинній групі', ...exact }).check();
  await form.locator('#broadcast-group').selectOption({ label: `🏕️ ${GROUP}` });
  await expect.poll(() => audience.innerText(), POLL).toBe('Отримають 2 людини');
  const preview = form.locator('.broadcast-preview');
  expect(await preview.innerText()).toContain(TITLE);
  expect(await preview.innerText()).toContain(TEXT);
  expect(await preview.innerText()).toContain('/library');
  expect(await sendButton.isEnabled()).toBe(true);
  await view(admin, 'broadcast59-form-360');

  // ── 3. «Надіслати» → підтвердження → «Розсилку надіслано.»; двоє отримали, Ганна й Тарас — ні; мертву підписку прибрано. ──
  let confirmText = '';
  // open() сам приймає діалоги; тут лише читаємо текст підтвердження.
  admin.once('dialog', (dialog) => {
    confirmText = dialog.message();
  });
  await sendButton.click();
  await form.getByText('Розсилку надіслано.', exact).waitFor();
  expect(confirmText).toBe(`Надіслати «${TITLE}»? Отримають 2 людини.`);
  await ctx.push!.idle();
  await expect.poll(() => sentTo('broadcast').length, POLL).toBe(2);
  const broadcasts = sentTo('broadcast');
  expect(broadcasts.map((o) => o.endpoint).sort(), 'broadcast recipients').toEqual([endpointOf('olya'), endpointOf('petro')].sort());
  for (const o of broadcasts) expect(o.payload).toMatchObject({ kind: 'broadcast', title: TITLE, text: TEXT, url: '/library' });
  expect(outbox.some((o) => o.endpoint === endpointOf('hanna') || o.endpoint === endpointOf('taras')), 'Ганна or Тарас got a push').toBe(false);
  expect(await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, endpointOf('petro'))), 'the dead subscription').toEqual([]);

  // ── 4. Історія: рядок розсилки з групою, лічильниками й ніком адміна. ──
  const history = admin.locator('section[aria-labelledby="broadcast-history"] li.admin-card', { hasText: TITLE });
  await expect
    .poll(async () => {
      await admin.reload();
      await history.waitFor();
      return history.innerText();
    }, { timeout: 15_000 })
    .toContain('Доставлено на пристрої: 1, помилок: 1');
  const card = await history.innerText();
  expect(card).toContain(`Група «${GROUP}»`);
  expect(card).toContain('Адмін 59');
  expect(card).toContain('Адресатів: 2');
  await history.scrollIntoViewIfNeeded();
  await view(admin, 'broadcast59-history-360');

  // ── 5. Друга розсилка «Усім» (Оля, Тарас): кнопка вимкнена до 10 хв; прямий POST — 409 broadcast_too_soon. ──
  await form.locator('#broadcast-title').fill('Ще одна новина');
  await form.locator('#broadcast-text').fill('Сьогодні ввечері — гра для всіх.');
  await form.getByRole('radio', { name: 'Усім, хто ввімкнув сповіщення', ...exact }).check();
  await expect.poll(() => audience.innerText(), POLL).toBe('Отримають 2 людини');
  await form.getByText(/^Наступну розсилку можна о \d{2}:\d{2}\.$/).waitFor();
  expect(await sendButton.isDisabled(), 'the send button during the 10-minute gap').toBe(true);
  await sendButton.scrollIntoViewIfNeeded();
  expect(await opacityOf(sendButton), 'the disabled primary button is not faded (light)').toBe('1');
  await viewportShot(admin, 'broadcast59-limit-360');
  const before = outbox.length;
  const tooSoon = await admin.request.post(`${base}/api/admin/broadcasts`, { data: { title: 'Ще одна новина', text: 'Сьогодні ввечері — гра для всіх.', url: null, recipients: { kind: 'all' } } });
  expect(tooSoon.status()).toBe(409);
  const refused = (await tooSoon.json()) as { error: string; nextAt: string };
  expect(refused.error).toBe('broadcast_too_soon');
  expect(Number.isNaN(Date.parse(refused.nextAt))).toBe(false);
  await ctx.push!.idle();
  expect(outbox.length, 'no new pushes after the refusal').toBe(before);

  // Темна тема: та сама вкладка в кадрі.
  const darkContext = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'uk-UA', timezoneId: KYIV, colorScheme: 'dark', storageState: { cookies: (await admin.context().storageState()).cookies, origins: [] } });
  contexts.push(darkContext);
  const dark = await darkContext.newPage();
  await dark.goto(`${base}/admin/broadcast`);
  await dark.locator('section[aria-labelledby="broadcast-history"] li.admin-card', { hasText: TITLE }).waitFor();
  expect(await isLight(dark), 'the dark page is dark').toBe(false);
  await dark.locator('#broadcast-title').fill(TITLE);
  await dark.locator('#broadcast-text').fill(TEXT);
  await dark.locator('.broadcast-preview').waitFor();
  const darkSend = dark.getByRole('button', { name: 'Надіслати', ...exact });
  expect(await darkSend.isDisabled(), 'the send button is disabled in the dark theme too').toBe(true);
  expect(await opacityOf(darkSend), 'the disabled primary button is not faded (dark)').toBe('1');
  await darkSend.scrollIntoViewIfNeeded();
  await viewportShot(dark, 'broadcast59-disabled-dark-360');
  await view(dark, 'broadcast59-form-dark-360');
  await dark.locator('section[aria-labelledby="broadcast-history"]').scrollIntoViewIfNeeded();
  await view(dark, 'broadcast59-history-dark-360');
  await dark.close();

  // ── 6. Календар: Оля планує подію, схвалює Ганну; нагадування доходить до Ганни, хоч вона й вимкнула оголошення. ──
  await db.insert(follow).values({ followerId: ids.get(olya)!, followeeId: ids.get(hanna)! });
  const quiz = await olya.request.post(`${base}/api/quizzes`, {
    data: { ...makeRoundsQuiz([classicRound('r59', [{ ...single, id: 's59', timeLimit: 30 }] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]), title: 'Вечір 59' },
  });
  expect(quiz.ok(), await quiz.text()).toBe(true);
  const quizId = ((await quiz.json()) as { id: string }).id;
  const startsAt = new Date(Date.now() + 3 * 3_600_000);
  const planned = await olya.request.post(`${base}/api/calendar`, { data: { title: 'Вечір над Прип’яттю', startsAt: startsAt.toISOString(), quizId } });
  expect(planned.status(), await planned.text()).toBe(201);
  const eventId = ((await planned.json()) as { id: string }).id;
  const asked = await hanna.request.post(`${base}/api/calendar/${eventId}/request`);
  expect(asked.ok(), await asked.text()).toBe(true);
  const approved = await olya.request.post(`${base}/api/calendar/${eventId}/requests/${ids.get(hanna)!}`, { data: { decision: 'approved' } });
  expect(approved.status(), await approved.text()).toBe(204);
  expect(await ctx.push!.remindDue(new Date(startsAt.getTime() - 30 * 60_000))).toBe(1);
  await ctx.push!.idle();
  await expect.poll(() => sentTo('reminder').filter((o) => o.endpoint === endpointOf('hanna')).length, POLL).toBe(1);

  // ── 7. Журнал. ──
  await admin.goto(`${base}/admin/log`);
  await admin.getByText(`Адмін 59 надіслав(-ла) розсилку «${TITLE}», адресатів: 2`, { exact: false }).first().waitFor();
  expect(await admin.locator('main').innerText(), 'the log has an email').not.toContain('@');

  // ── 8. Не-адмін і гість: 404; вкладка не-адміну веде на головну; без email. ──
  const body = { title: 'Т', text: 'Х', url: null, recipients: { kind: 'all' } };
  for (const who of [olya, guest]) {
    expect((await who.request.get(`${base}/api/admin/broadcasts`)).status()).toBe(404);
    expect((await who.request.post(`${base}/api/admin/broadcasts/preview`, { data: { recipients: { kind: 'all' } } })).status()).toBe(404);
    expect((await who.request.post(`${base}/api/admin/broadcasts`, { data: body })).status()).toBe(404);
  }
  await olya.goto(`${base}/admin/broadcast`);
  await olya.waitForURL(`${base}/`);
  expect(await bodyText(olya), 'the broadcast tab for a non-admin').not.toContain('Історія розсилок');
  await admin.goto(`${base}/admin/broadcast`);
  await admin.locator('section[aria-labelledby="broadcast-history"] li.admin-card').first().waitFor();
  expect(await bodyText(admin), 'the broadcast tab has an email').not.toContain('@');
  const json = await admin.request.get(`${base}/api/admin/broadcasts`);
  expect(json.status()).toBe(200);
  const jsonText = await json.text();
  expect(jsonText, 'the broadcasts JSON has an email').not.toContain('@');
  expect(((JSON.parse(jsonText) as AdminBroadcasts).rows).map((row) => row.title)).toEqual([TITLE]);

  const unexpected = problems.filter((line) => !/ (404|409) .*\/api\/admin\//.test(line));
  expect(unexpected, `page errors (${unexpected.length}):\n${unexpected.join('\n')}`).toEqual([]);
}
