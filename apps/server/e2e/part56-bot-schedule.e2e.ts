import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz, single } from '@quiz/engine/testing';
import { type AdminBot, type AdminBotPlan, type PushPayload } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import webpush from 'web-push';
import { adminEmails } from '../src/config';
import { botPlan, groupMember, user } from '../src/db/schema';
import { createGroup } from '../src/group-store';
import { ensureProfile } from '../src/profiles';
import type { PushOptions } from '../src/push';
import { saveSubscription } from '../src/push-store';
import { bodyText, expectNoSideScroll, join, myId, open, POLL, register } from './helpers/common';
import { ARTIFACTS, base, browser, contexts, ctx, db, exact, flags, problems, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 56 — розклад ігор бота: адмін планує гру бота за хвилину наперед для родинної групи з автостартом, група отримує нагадування й код, кімната відкривається й сама стартує,
 * гра з нікому не прийшов закриває лобі, скасований план нічого не відкриває, пропущений старт — збій «сервер був недоступний», журнал має всі кроки; не-адмін отримує 404; 360 px, світла тема.
 * Час рухає ctx.botSchedule.tick(<Date>) руками: хвилинний тікер у e2e вимкнено.
 */

useE2eServer();

it('part 56: bot schedule — the admin plans a bot game a minute ahead for a family group with auto start, the group gets the 15-minute push and the code push, the room opens, starts by itself with a player and is played; a second plan nobody joins closes as nobody came; a cancelled plan opens nothing; a missed start fails as server down; the log has every step; a non-admin gets 404; phone 360 px, light theme', async () => {
  try {
    await schedule56();
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
}, 1_200_000);

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

const KYIV = 'Europe/Kyiv';
const MINUTE = 60_000;
const TITLE = 'Поліські озера 56';
const ADMIN_EMAIL = 'admin56@example.com';
/** Київський настінний час для `datetime-local`: «2026-11-20T19:00». */
function kyivInput(ms: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: KYIV, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
const wall = (ms: number) => kyivInput(ms).slice(11);

async function schedule56() {
  // ── 0. Сервер з адміном і заглушкою push; люди: Адмін 56, Оля (акаунт у браузері), Петро й Тарас (акаунти в базі). ──
  const { publicKey } = webpush.generateVAPIDKeys();
  const outbox: { endpoint: string; payload: PushPayload; options: PushOptions }[] = [];
  const send = async (target: { endpoint: string }, payload: string, options: PushOptions) => {
    outbox.push({ endpoint: target.endpoint, payload: JSON.parse(payload) as PushPayload, options });
    return { status: 201 };
  };
  const botPushes = (code: string | null | 'any' = 'any') => outbox.filter((o) => o.payload.kind === 'bot' && (code === 'any' || (o.payload as { code: string | null }).code === code));
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }), push: { publicKey, send } });
  flags.restarting = false;

  const named: Record<string, Page> = {};
  for (const [key, name, email] of [
    ['admin', 'Адмін 56', ADMIN_EMAIL],
    ['olya', 'Оля', 'olya56@example.com'],
  ] as const) {
    const page = await light(await open(`${key}56`, 360, 740, { timezoneId: KYIV }));
    await register(page, 'menu', name, email);
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: name, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olya } = named as Record<'admin' | 'olya', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const guest = await light(await open('guest56', 360, 740, { timezoneId: KYIV }));
  const olyaId = await myId(olya);
  for (const [id, name] of [['petro56', 'Петро'], ['taras56', 'Тарас']] as const) {
    await db.insert(user).values({ id, name, email: `${id}@example.com` });
    await ensureProfile(db, id);
  }
  const sub = (name: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/e2e56-${name}`, keys: { p256dh: 'BPe2e', auth: 'aue2e' } });
  await saveSubscription(db, olyaId, sub('olya'), new Date());
  await saveSubscription(db, 'petro56', sub('petro'), new Date());
  // Тарас — акаунт без підписки; група «Малинські» — Оля (власниця) й Петро.
  const group = await createGroup(db, olyaId, { name: 'Малинські', emoji: '🏡', description: '' }, new Date());
  expect(group.ok).toBe(true);
  await db.insert(groupMember).values({ groupId: (group as { id: string }).id, userId: 'petro56', role: 'member', joinedAt: new Date() });
  const OLYA = sub('olya').endpoint;
  const PETRO = sub('petro').endpoint;

  // ── Вікторина бота «Поліські озера 56»: три «single» по 30 с. ──
  const questions = [0, 1, 2].map((n) => ({ ...single, id: `s56${n}`, timeLimit: 30 }));
  const quiz = { ...makeRoundsQuiz([classicRound('r56', questions as never, { title: 'Озера', speedBonus: false, shuffleOptions: false })]), title: TITLE };
  const saved = await admin.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(saved.status(), await saved.text()).toBeLessThan(300);

  const rooms = admin.locator('section[aria-labelledby="admin-bot-rooms"]');
  const copySection = admin.locator('section[aria-labelledby="admin-bot-copy"]');
  const botQuizzes = admin.locator('section[aria-labelledby="admin-bot-quizzes"]');
  const section = admin.locator('section[aria-labelledby="admin-bot-schedule"]');
  const cards = section.locator('ul.admin-list > li.admin-card');
  const refresh = async () => {
    await admin.getByRole('button', { name: 'Оновити', ...exact }).click();
  };
  const plansNow = async (): Promise<AdminBotPlan[]> => {
    const response = await admin.request.get(`${base}/api/admin/bot`);
    expect(response.status()).toBe(200);
    return ((await response.json()) as AdminBot).schedule.plans;
  };
  const seen = new Set<string>();
  const newest = async (): Promise<AdminBotPlan> => {
    const fresh = (await plansNow()).filter((plan) => !seen.has(plan.id));
    expect(fresh.length, 'exactly one new plan').toBe(1);
    seen.add(fresh[0]!.id);
    return fresh[0]!;
  };

  // ── 1. Копія вікторини боту; у «Розкладі» план на «за 1 хв» для «Малинські» з автостартом 5 хв і повтором. ──
  await admin.goto(`${base}/admin/bot`);
  expect(await isLight(admin)).toBe(true);
  await copySection.locator('li', { hasText: TITLE }).waitFor();
  await copySection.getByRole('button', { name: 'Передати боту копію', ...exact }).click();
  await botQuizzes.locator('li', { hasText: TITLE }).waitFor();
  await section.getByRole('heading', { name: 'Розклад', ...exact }).waitFor();

  const fillWhen = async (ms: number) => {
    // Хвилина вгору: час має бути попереду, а `min` форми — поточна хвилина Києва.
    const when = Math.ceil(ms / MINUTE) * MINUTE;
    await section.getByLabel('Дата й час (за київським часом)', exact).fill(kyivInput(when));
  };
  await fillWhen(Date.now() + MINUTE);
  await section.getByLabel('Родинній групі', exact).check();
  await section.locator('#bot-plan-group').selectOption({ label: '🏡 Малинські' });
  await section.getByLabel('Почати автоматично, якщо є гравці', exact).check();
  await section.getByLabel('Через скільки хвилин (5–30)', exact).fill('5');
  await section.getByLabel('Повторювати щотижня в цей день і час', exact).check();
  await section.locator('form').scrollIntoViewIfNeeded();
  await section.getByRole('heading', { name: 'Запланувати гру', ...exact }).scrollIntoViewIfNeeded();
  await view(admin, 'schedule56-form-360');
  await section.getByRole('button', { name: 'Запланувати', ...exact }).click();
  await section.getByRole('status').filter({ hasText: 'Гру заплановано.' }).waitFor();
  const first = cards.filter({ hasText: 'Малинські' });
  await first.waitFor();
  await first.getByText('Заплановано', exact).waitFor();
  await first.getByText('Автостарт через 5 хв', exact).waitFor();
  await first.getByText('Щотижня', exact).waitFor();
  await first.getByText('(Київ)', { exact: false }).waitFor();
  const plan1 = await newest();
  const start1 = new Date(plan1.startsAt).getTime();
  expect(start1, 'the plan is a minute or two ahead').toBeGreaterThan(Date.now());
  expect(start1).toBeLessThanOrEqual(Date.now() + 2 * MINUTE);
  expect(plan1.to).toMatchObject({ kind: 'group', name: 'Малинські' });
  expect(plan1.autoStartMin).toBe(5);
  expect(plan1.weekly).toBe(true);

  // ── 2. За хвилину до старту: два «bot» без коду — лише Оля й Петро. ──
  expect(botPushes().length, 'nothing is pushed before the reminder').toBe(0);
  const reminded = await ctx.botSchedule.tick(new Date(start1 - MINUTE));
  expect(reminded).toMatchObject({ reminded: 1, opened: 0, failed: 0 });
  await ctx.botSchedule.idle();
  await expect.poll(() => botPushes(null).length, POLL).toBe(2);
  expect(botPushes(null).map((o) => o.endpoint).sort()).toEqual([OLYA, PETRO].sort());
  for (const o of botPushes(null)) expect(o.payload).toMatchObject({ kind: 'bot', planId: plan1.id, title: TITLE, startsAt: plan1.startsAt, code: null });
  // Той самий момент удруге нагадування не шле.
  await ctx.botSchedule.tick(new Date(start1 - MINUTE));
  await ctx.botSchedule.idle();
  expect(botPushes(null).length, 'no second reminder').toBe(2);

  // ── 3. Старт: кімната відкрита, картка «Відкрито» з кодом, пуш із кодом Олі й Петру, наступний щотижневий план. ──
  const opened = await ctx.botSchedule.tick(new Date(start1));
  expect(opened).toMatchObject({ opened: 1, failed: 0 });
  await ctx.botSchedule.idle();
  await refresh();
  const openedCard = cards.filter({ hasText: 'Відкрито' });
  await openedCard.waitFor();
  const code = /Код (\d{6})/.exec(await openedCard.innerText())![1]!;
  await rooms.locator('li.admin-card', { hasText: `Код ${code}` }).locator('.admin-mark', { hasText: 'Лобі' }).waitFor();
  await expect.poll(() => botPushes(code).length, POLL).toBe(2);
  expect(botPushes(code).map((o) => o.endpoint).sort()).toEqual([OLYA, PETRO].sort());
  for (const o of botPushes(code)) expect(o.payload).toMatchObject({ kind: 'bot', planId: plan1.id, title: TITLE, code });
  expect(botPushes(null).length, 'the reminder is not repeated at the opening').toBe(2);
  const next = (await plansNow()).find((plan) => plan.status === 'scheduled' && plan.id !== plan1.id);
  expect(next, 'the weekly next plan').toBeDefined();
  seen.add(next!.id);
  const gap = (new Date(next!.startsAt).getTime() - start1) / 86_400_000;
  expect(gap).toBeGreaterThan(6.9);
  expect(gap).toBeLessThan(7.1);
  expect(wall(new Date(next!.startsAt).getTime()), 'the same wall time in Kyiv').toBe(wall(start1));
  expect(next).toMatchObject({ weekly: true, autoStartMin: 5, to: { kind: 'group', name: 'Малинські' } });
  await cards.filter({ hasText: 'Заплановано' }).filter({ hasText: 'Щотижня' }).waitFor();
  await section.getByRole('heading', { name: 'Розклад', ...exact }).scrollIntoViewIfNeeded();
  await view(admin, 'schedule56-opened-360');

  // ── 4. Оля відкриває /play/{код} (як із пуша) і входить у лобі; через 5 хв після відкриття гра стартує сама. ──
  await join(olya, code, 'Оля', false);
  const started = await ctx.botSchedule.tick(new Date(start1 + 5 * MINUTE));
  expect(started).not.toBe('busy');
  await ctx.botSchedule.idle();
  await olya.getByText(single.text, exact).first().waitFor({ timeout: 30_000 });
  await refresh();
  await cards.filter({ hasText: 'Зіграно' }).waitFor();
  const until = Date.now() + 240_000;
  while ((await olya.getByText('Гру завершено').count()) === 0) {
    expect(Date.now(), 'the bot game never finished').toBeLessThan(until);
    await olya.getByRole('button', { name: /Київ/ }).click({ timeout: 1500 }).catch(() => undefined);
    await olya.waitForTimeout(400);
  }
  await olya.getByText('Гру завершено').first().waitFor();

  // ── 5. Другий план для нікого: відкрито, а через 5 хв ніхто не прийшов — лобі закрито. ──
  await admin.goto(`${base}/admin/bot`);
  const plan = async (when: number, auto: number | null) => {
    await fillWhen(when);
    await section.getByLabel('Нікому', exact).check();
    const box = section.getByLabel('Почати автоматично, якщо є гравці', exact);
    if (auto !== null) {
      await box.check();
      await section.getByLabel('Через скільки хвилин (5–30)', exact).fill(String(auto));
    }
    await section.getByRole('button', { name: 'Запланувати', ...exact }).click();
    await section.getByRole('status').filter({ hasText: 'Гру заплановано.' }).waitFor();
    return newest();
  };
  const plan2 = await plan(Date.now() + MINUTE, 5);
  const start2 = new Date(plan2.startsAt).getTime();
  await ctx.botSchedule.tick(new Date(start2));
  await ctx.botSchedule.idle();
  await refresh();
  const nobodyCard = cards.filter({ hasText: 'Відкрито' });
  await nobodyCard.waitFor();
  const code2 = /Код (\d{6})/.exec(await nobodyCard.innerText())![1]!;
  await rooms.locator('li.admin-card', { hasText: `Код ${code2}` }).waitFor();
  await ctx.botSchedule.tick(new Date(start2 + 5 * MINUTE));
  await ctx.botSchedule.idle();
  await refresh();
  await cards.filter({ hasText: 'Ніхто не прийшов' }).waitFor();
  await expect.poll(() => rooms.locator('li.admin-card', { hasText: `Код ${code2}` }).count(), POLL).toBe(0);
  await section.getByRole('heading', { name: 'Розклад', ...exact }).scrollIntoViewIfNeeded();
  await cards.filter({ hasText: 'Ніхто не прийшов' }).scrollIntoViewIfNeeded();
  await view(admin, 'schedule56-nobody-360');
  expect(botPushes().length, 'plans for nobody push nothing').toBe(4);

  // ── 6. Третій план: «Скасувати» → підтвердження → «Скасовано»; у його час нової кімнати й наступника немає. ──
  const roomsBefore = await rooms.locator('li.admin-card').count();
  const plan3 = await plan(Date.now() + MINUTE, null);
  const start3 = new Date(plan3.startsAt).getTime();
  const own3 = cards.filter({ hasText: 'Заплановано' }).filter({ hasNotText: 'Щотижня' });
  await own3.getByRole('button', { name: 'Скасувати', ...exact }).click();
  await cards.filter({ hasText: 'Скасовано' }).waitFor();
  expect(await own3.count(), 'the cancelled plan is not scheduled any more').toBe(0);
  const scheduledBefore = (await plansNow()).filter((p) => p.status === 'scheduled').length;
  const idle = await ctx.botSchedule.tick(new Date(start3));
  expect(idle).toMatchObject({ opened: 0, failed: 0 });
  await ctx.botSchedule.idle();
  await refresh();
  await cards.filter({ hasText: 'Скасовано' }).waitFor();
  expect(await rooms.locator('li.admin-card').count(), 'a cancelled plan opens no room').toBe(roomsBefore);
  expect((await plansNow()).filter((p) => p.status === 'scheduled').length, 'no successor of a cancelled plan').toBe(scheduledBefore);
  expect((await plansNow()).find((p) => p.id === plan3.id)?.status).toBe('cancelled');

  // ── 7. Четвертий план, чий старт минув 11 хв тому: «Не вдалося: сервер був недоступний». ──
  const plan4 = await plan(Date.now() + MINUTE, null);
  await db.update(botPlan).set({ startsAt: new Date(Date.now() - 11 * MINUTE) }).where(eq(botPlan.id, plan4.id));
  const missed = await ctx.botSchedule.tick(new Date());
  expect(missed).toMatchObject({ opened: 0, failed: 1 });
  await ctx.botSchedule.idle();
  await refresh();
  await cards.filter({ hasText: 'Не вдалося: сервер був недоступний' }).waitFor();
  expect((await plansNow()).find((p) => p.id === plan4.id)).toMatchObject({ status: 'failed', reason: 'server_down' });
  expect(botPushes().length, 'no push for a missed start of a plan for nobody').toBe(4);
  expect(await section.innerText(), 'the schedule has an email').not.toContain('@');

  // Список зі станами: світла й темна теми, 360 px.
  await section.getByText(/Активних: \d+ з 20/).scrollIntoViewIfNeeded();
  await view(admin, 'schedule56-list-360');
  await section.getByRole('heading', { name: 'Запланувати гру', ...exact }).scrollIntoViewIfNeeded();
  await viewportShot(admin, 'schedule56-form-empty-360');
  const darkContext = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'uk-UA', timezoneId: KYIV, colorScheme: 'dark', storageState: { cookies: (await admin.context().storageState()).cookies, origins: [] } });
  contexts.push(darkContext);
  const dark = await darkContext.newPage();
  await dark.goto(`${base}/admin/bot`);
  const darkSection = dark.locator('section[aria-labelledby="admin-bot-schedule"]');
  await darkSection.getByRole('heading', { name: 'Розклад', ...exact }).waitFor();
  await darkSection.locator('ul.admin-list > li.admin-card').first().waitFor();
  expect(await isLight(dark), 'the dark page is dark').toBe(false);
  await darkSection.getByRole('heading', { name: 'Запланувати гру', ...exact }).scrollIntoViewIfNeeded();
  await view(dark, 'schedule56-form-dark-360');
  await darkSection.getByText(/Активних: \d+ з 20/).scrollIntoViewIfNeeded();
  await view(dark, 'schedule56-list-dark-360');
  await dark.close();

  // ── 8. Журнал: заплановано, відкрито за розкладом, скасовано, не відкрито. ──
  await admin.goto(`${base}/admin/log`);
  await admin.getByText(new RegExp(`запланував\\(-ла\\) гру бота «${TITLE}» на .*\\(Київ\\)`)).first().waitFor();
  await admin.getByText(new RegExp(`Розклад: бот відкрив гру «${TITLE}» \\(код ${code}\\)`)).first().waitFor();
  await admin.getByText(new RegExp(`Розклад: бот відкрив гру «${TITLE}» \\(код ${code2}\\)`)).first().waitFor();
  await admin.getByText(`скасував(-ла) гру бота «${TITLE}»`, { exact: false }).first().waitFor();
  await admin.getByText(`Розклад: гру бота «${TITLE}» не відкрито — сервер був недоступний`, { exact: false }).first().waitFor();
  expect(await admin.locator('main').innerText(), 'the log has an email').not.toContain('@');
  await view(admin, 'schedule56-log-360');

  // ── 9. Не-адмін і гість: 404 на кожен новий маршрут. ──
  const fakeId = '00000000-0000-4000-8000-000000000056';
  const body = { quizId: fakeId, startsAt: new Date(Date.now() + 3_600_000).toISOString(), recipients: { kind: 'none' }, autoStartMin: null, weekly: false };
  for (const who of [olya, guest]) {
    expect((await who.request.post(`${base}/api/admin/bot/plans`, { data: body })).status()).toBe(404);
    expect((await who.request.get(`${base}/api/admin/bot/people?q=${encodeURIComponent('Ол')}`)).status()).toBe(404);
    expect((await who.request.put(`${base}/api/admin/bot/plans/${fakeId}`, { data: body })).status()).toBe(404);
    expect((await who.request.post(`${base}/api/admin/bot/plans/${fakeId}/cancel`)).status()).toBe(404);
    expect((await who.request.get(`${base}/api/admin/bot`)).status()).toBe(404);
  }
  const adminSees = await admin.request.get(`${base}/api/admin/bot/people?q=${encodeURIComponent('Ол')}`);
  expect(adminSees.status()).toBe(200);
  expect(await adminSees.text(), 'the people JSON has an email').not.toContain('@');
  expect(await bodyText(olya), 'the schedule for a non-admin').not.toContain('Розклад');
  const botJson = await admin.request.get(`${base}/api/admin/bot`);
  expect(await botJson.text(), 'the bot JSON has an email').not.toContain('@');

  // Усі пуші розкладу — лише групі.
  expect([...new Set(botPushes().map((o) => o.endpoint))].sort()).toEqual([OLYA, PETRO].sort());
  const unexpected = problems.filter((line) => !/ (404|409) .*\/api\/admin\/bot/.test(line));
  expect(unexpected, `page errors (${unexpected.length}):\n${unexpected.join('\n')}`).toEqual([]);
}
