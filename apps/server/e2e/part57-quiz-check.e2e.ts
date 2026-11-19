import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { adminEmails } from '../src/config';
import { user } from '../src/db/schema';
import { type CheckFetch } from '../src/quiz-check';
import { expectNoSideScroll, open, register } from './helpers/common';
import { ARTIFACTS, avatarPng, base, browser, contexts, ctx, db, exact, flags, problems, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 57 — перегляд і перевірка вікторини: адмін відкриває вікторину бота з відповідями, написаннями, підказками, мініатюрами, початком відео, балами й таймерами,
 * перегляд лишає рядок у журналі, перевірка знаходить відсутній файл і мертве відео та веде до запитання, вкладка «Бот» показує ⚠ 2 і питає перед запуском; не-адмін отримує 404; телефон 360 px, світла тема.
 */

useE2eServer();

it('part 57: quiz preview and check — the admin previews a bot quiz with answers, spellings, hints, thumbnails, video start, points and timers, the view is logged, the check finds the missing picture and the dead video and jumps to the question, the bot tab shows ⚠ 2 and asks before launching; a non-admin gets 404; phone 360 px, light theme', async () => {
  try {
    await check57();
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    flags.restarting = true;
    await ctx.shutdown().catch(() => undefined);
    await relisten();
    flags.restarting = false;
  }
}, 600_000);

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

const TITLE = 'Гори й ріки 57';
const MISSING = '/uploads/e2emissing00000000.jpg';
const DEAD = 'E2Edeadvid1';

/** Заглушка мережі: oEmbed мертвого відео — 404, інші — 200; сторінка відео каже «60 с»; усе інше — 404. Назовні нічого не йде. */
const calls: string[] = [];
const stub: CheckFetch = async (url) => {
  calls.push(url);
  if (url.startsWith('https://www.youtube.com/oembed')) {
    return new Response('{}', { status: url.includes(encodeURIComponent(`watch?v=${DEAD}`)) ? 404 : 200 });
  }
  if (url.startsWith('https://www.youtube.com/watch?v=')) return new Response('..."lengthSeconds":"60"...', { status: 200 });
  return new Response('', { status: 404 });
};

async function check57() {
  const ADMIN_EMAIL = 'admin57@example.com';
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }), checkFetch: stub });
  flags.restarting = false;

  const named: Record<string, Page> = {};
  for (const [key, name, email] of [
    ['admin', 'Адмін 57', ADMIN_EMAIL],
    ['olya', 'Оля', 'olya57@example.com'],
  ] as const) {
    const page = await light(await open(`${key}57`, 360, 740));
    await register(page, 'menu', name, email);
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: name, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olya } = named as Record<'admin' | 'olya', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const guest = await light(await open('guest57', 360, 740));

  // ── Вікторина «Гори й ріки 57»: у першому раунді три запитання з розбіжностями, у другому ще 20; усі таймери ≥ 25 с. ──
  const uploaded = await admin.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } });
  expect(uploaded.ok(), await uploaded.text()).toBe(true);
  const photo = ((await uploaded.json()) as { url: string }).url;
  const common = { imageUrl: null, video: null, points: 1000, timeLimit: 30 };
  const first = [
    {
      ...common,
      id: 'g57a',
      type: 'single' as const,
      text: 'Яка гора найвища в Карпатах?',
      options: [
        { id: 'g57a0', text: 'Говерла' },
        { id: 'g57a1', text: 'Піп Іван' },
        { id: 'g57a2', text: 'Петрос' },
      ],
      correctId: 'g57a0',
      hint: 'Її висота понад дві тисячі метрів',
      imageUrl: photo,
    },
    { ...common, id: 'g57b', type: 'text' as const, text: 'Яка річка тече через Київ?', accepted: ['Дніпро', 'Днепр'], imageUrl: MISSING },
    { ...common, id: 'g57c', type: 'boolean' as const, text: 'Дунай впадає в Балтійське море', correct: false, video: { id: DEAD, start: 75 } },
  ];
  const facts: [string, boolean][] = [
    ['Монблан розташований в Альпах', true],
    ['Ніл тече на південь до Середземного моря', false],
    ['Амазонка є найповноводнішою річкою світу', true],
    ['Еверест розташований в Андах', false],
    ['Дністер бере початок у Карпатах', true],
    ['Рейн впадає в Чорне море', false],
    ['Кіліманджаро знаходиться в Африці', true],
    ['Ніагарський водоспад розташований в Африці', false],
    ['Дніпро впадає в Чорне море', true],
    ['Альпи простягаються через Австралію', false],
    ['Янцзи є найдовшою річкою Азії', true],
    ['Фудзіяма розташована в Китаї', false],
    ['Мисисипі тече в Північній Америці', true],
    ['Сена протікає через Рим', false],
    ['Карпати лежать у Центральній Європі', true],
    ['Ґанґ тече в Південній Америці', false],
    ['Тиса бере початок у Закарпатті', true],
    ['Анди простягаються вздовж Європи', false],
    ['Говерла розташована в Україні', true],
    ['Дунай протікає через Відень', true],
  ];
  const rest = facts.map(([text, correct], index) => ({ ...common, id: `g57f${index}`, type: 'boolean' as const, text, correct }));
  const quiz = {
    ...makeRoundsQuiz([
      classicRound('r57a', first as never, { title: 'Гори', speedBonus: false, shuffleOptions: false }),
      classicRound('r57b', rest as never, { title: 'Ріки', speedBonus: false, shuffleOptions: false }),
    ]),
    title: TITLE,
  };
  const saved = await admin.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(saved.status(), await saved.text()).toBeLessThan(300);

  // ── 1. Передати боту копію: у картці «Переглянути», значка немає. ──
  const botQuizzes = admin.locator('section[aria-labelledby="admin-bot-quizzes"]');
  const copySection = admin.locator('section[aria-labelledby="admin-bot-copy"]');
  await admin.goto(`${base}/admin/bot`);
  expect(await isLight(admin)).toBe(true);
  await copySection.locator('li', { hasText: TITLE }).waitFor();
  await copySection.getByRole('button', { name: 'Передати боту копію', ...exact }).click();
  await admin.getByRole('status').filter({ hasText: `Копію «${TITLE}» передано боту.` }).waitFor();
  const botCard = botQuizzes.locator('li', { hasText: TITLE });
  await botCard.waitFor();
  await botCard.getByRole('link', { name: `Переглянути: ${TITLE}`, ...exact }).waitFor();
  expect(await botCard.locator('.admin-check-badge').count(), 'a badge before any check').toBe(0);

  // ── 2. Перегляд: раунди згорнуті; відповіді, написання, підказка, мініатюра, відео з 1:15, бали й таймер; без видалення. ──
  await botCard.getByRole('link', { name: `Переглянути: ${TITLE}`, ...exact }).click();
  await admin.waitForURL(/\/admin\/bot\/quizzes\/[0-9a-f-]{36}$/);
  const quizId = admin.url().split('/').pop()!;
  await admin.locator('h2.admin-title', { hasText: TITLE }).waitFor();
  const rounds = admin.locator('details.admin-round');
  expect(await rounds.count()).toBe(2);
  expect(await admin.locator('details.admin-round[open]').count(), 'rounds start folded in a long quiz').toBe(0);
  await rounds.first().scrollIntoViewIfNeeded();
  await view(admin, 'check57-folded-360');
  await rounds.first().locator('summary').click();
  const q1 = admin.locator('#q-g57a');
  await q1.waitFor();
  await q1.locator('li.is-correct').getByRole('img', { name: 'Правильна відповідь', ...exact }).waitFor();
  expect(await q1.locator('li.is-correct').innerText()).toContain('Говерла');
  expect(await q1.locator('.admin-preview-mark').count(), 'only the right option is marked').toBe(1);
  await q1.getByText('Підказка: Її висота понад дві тисячі метрів', exact).waitFor();
  expect(await q1.locator('img.admin-thumb').count()).toBe(1);
  await q1.getByText('Бали: 1000 · Таймер: 30 с', exact).waitFor();
  const q2 = admin.locator('#q-g57b');
  await q2.getByText('Написання: Дніпро, Днепр', exact).waitFor();
  const q3 = admin.locator('#q-g57c');
  const videoLink = q3.getByRole('link', { name: 'Відео з 1:15', ...exact });
  await videoLink.waitFor();
  expect(await videoLink.getAttribute('target')).toBe('_blank');
  expect(await videoLink.getAttribute('rel')).toBe('noopener noreferrer');
  await q3.getByText('Бали: 1000 · Без таймера (відео)', exact).waitFor();
  expect(await admin.getByRole('button', { name: /Видалити/ }).count(), 'delete buttons in a bot quiz').toBe(0);
  await q1.scrollIntoViewIfNeeded();
  await view(admin, 'check57-preview-360');
  expect(await admin.locator('main').innerText(), 'the preview has an email').not.toContain('@');

  // Те саме в темній темі: окремий контекст з тим самим входом.
  const darkContext = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'uk-UA', colorScheme: 'dark', storageState: { cookies: (await admin.context().storageState()).cookies, origins: [] } });
  contexts.push(darkContext);
  const dark = await darkContext.newPage();
  await dark.goto(`${base}/admin/bot/quizzes/${quizId}`);
  await dark.locator('details.admin-round').first().locator('summary').click();
  await dark.locator('#q-g57a').scrollIntoViewIfNeeded();
  expect(await isLight(dark), 'the dark page is dark').toBe(false);
  await view(dark, 'check57-preview-dark-360');
  await dark.close();

  // ── 3. Перевірка: «Помилки» з двома пунктами; «До запитання» у другому відкриває раунд і показує відео. ──
  expect(calls.length, 'no network call before the check').toBe(0);
  await admin.getByRole('button', { name: 'Перевірити вікторину', ...exact }).click();
  await admin.getByRole('heading', { name: 'Помилки', ...exact }).waitFor();
  const panel = admin.locator('.admin-check');
  await panel.getByText(`Файл ${MISSING} не знайдено у сховищі`, { exact: false }).waitFor();
  await panel.getByText(`Відео ${DEAD} не існує`, { exact: false }).waitFor();
  expect(await panel.getByRole('button', { name: 'До запитання', ...exact }).count()).toBe(2);
  expect(await panel.getByRole('heading', { name: 'Попередження', ...exact }).count(), 'a warning group with no warnings').toBe(0);
  expect(calls.some((url) => url.includes('/oembed')), 'oEmbed was asked').toBe(true);
  await panel.getByRole('heading', { name: 'Помилки', ...exact }).scrollIntoViewIfNeeded();
  await view(admin, 'check57-result-360');
  await admin.locator('details.admin-round').first().locator('summary').click(); // згортаємо, щоб перехід довів, що раунд відкривається
  expect(await admin.locator('#q-g57c').isVisible()).toBe(false);
  await panel.getByRole('button', { name: 'До запитання', ...exact }).nth(1).click();
  await admin.locator('#q-g57c').waitFor({ state: 'visible' });
  await expect.poll(() => admin.locator('#q-g57c').evaluate((el) => {
    const box = el.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight;
  })).toBe(true);
  await viewportShot(admin, 'check57-jump-360');

  // ── 4. «Бот»: ⚠ 2; «Запустити гру» питає — «Скасувати» без кімнати, «Так» створює кімнату. ──
  await admin.goto(`${base}/admin/bot`);
  const badge = botQuizzes.locator('li', { hasText: TITLE }).locator('.admin-check-badge');
  await badge.waitFor();
  expect((await badge.innerText()).trim()).toBe('⚠ 2');
  expect(await badge.getAttribute('aria-label')).toBe('Помилок у перевірці: 2');
  await botQuizzes.scrollIntoViewIfNeeded();
  await view(admin, 'check57-badge-360');
  admin.removeAllListeners('dialog');
  const messages: string[] = [];
  let answer = false;
  admin.on('dialog', (dialog) => {
    messages.push(dialog.message());
    void (answer ? dialog.accept() : dialog.dismiss());
  });
  const rooms = admin.locator('section[aria-labelledby="admin-bot-rooms"]');
  const launch = botQuizzes.locator('li', { hasText: TITLE }).getByRole('button', { name: 'Запустити гру', ...exact });
  await launch.click();
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toBe(`Остання перевірка знайшла у «${TITLE}» помилок: 2. Однаково запустити гру?`);
  await admin.waitForTimeout(500);
  expect(await rooms.locator('li.admin-card').count(), 'a room after «Скасувати»').toBe(0);
  expect(await admin.getByRole('status').filter({ hasText: /Кімнату \d{6} створено\./ }).count()).toBe(0);
  answer = true;
  await launch.click();
  await admin.getByRole('status').filter({ hasText: /Кімнату \d{6} створено\./ }).waitFor();
  expect(messages.length).toBe(2);
  await rooms.locator('li.admin-card').first().waitFor();

  // ── 5. Журнал: перегляд вікторини бота — рядок, і лише один (перегляд відкрито двічі в одному контексті — повтор за хвилину не пишеться). ──
  await admin.goto(`${base}/admin/log`);
  await admin.getByText(`переглянув(-ла) вікторину «${TITLE}» (Квіз-бот)`, { exact: false }).first().waitFor();
  expect(await admin.getByText(`переглянув(-ла) вікторину «${TITLE}»`, { exact: false }).count(), 'one view line per minute').toBe(1);
  expect(await admin.locator('main').innerText(), 'the log has an email').not.toContain('@');
  await view(admin, 'check57-log-360');

  // ── 6. Не-адмін і гість: 404 без жодного вихідного запиту. ──
  const before = calls.length;
  expect((await olya.request.post(`${base}/api/admin/quizzes/${quizId}/check`)).status()).toBe(404);
  expect((await guest.request.post(`${base}/api/admin/quizzes/${quizId}/check`)).status()).toBe(404);
  expect((await olya.request.get(`${base}/api/admin/quizzes/${quizId}`)).status()).toBe(404);
  expect(calls.length, 'a non-admin caused outgoing requests').toBe(before);
  // Заглушка не бачила жодної адреси, крім YouTube (файл зі сховища перевіряє сховище, не мережа).
  expect(calls.every((url) => url.startsWith('https://www.youtube.com/')), calls.join('\n')).toBe(true);

  // Очікувані відповіді: 404 мініатюри файла, якого немає, і 404 не-адміну на адмінці.
  const unexpected = problems.filter((line) => !line.includes(MISSING) && !/ 404 .*\/api\/admin\//.test(line));
  expect(unexpected, `page errors (${unexpected.length}):\n${unexpected.join('\n')}`).toEqual([]);
}
