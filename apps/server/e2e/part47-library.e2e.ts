import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { adminEmails } from '../src/config';
import { user } from '../src/db/schema';
import { bodyText, click, expectNoSideScroll, expectPhoneFit, MENU, MENU_ITEMS_23A, menuLinks, myId, open, pickOption, register, toNextQuestion } from './helpers/common';
import { ARTIFACTS, avatarPng, base, db, exact, flags, problems, relisten, shot, snapshot, useE2eServer, ctx } from './helpers/setup';

/**
 * Наскрізні тести: частина 47 — бібліотека вікторин (38g + 39-A2): автор відкриває вікторину для всіх (мінімум 5 запитань, знімок і «Оновити»),
 * гість шукає її й не бачить відповідей, акаунт ставить ❤️ і копіює з рядком «Автор: …», копію грають, три скарги ховають вікторину,
 * адмін ховає, автор оскаржує один раз, адмін повертає, скинутий нік; телефон 360 px, світла тема.
 */

useE2eServer();

it('part 47: library — open for everyone, guest and account browse, like, copy with «Author», play the copy, three reports hold the quiz, the admin hides it, the author appeals once, a nickname is reset, phone 360 px, light theme', async () => {
  try {
    await library47();
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    // Сервер лишається з адміном лише на цей тест.
    flags.restarting = true;
    await ctx.shutdown().catch(() => undefined);
    await relisten();
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
/** Кадр екрана й повного, без бокового скролу. */
const view = async (page: Page, name: string) => {
  await viewportShot(page, name);
  await expectNoSideScroll(page, name);
};
/** Сторінка з нижньою панеллю: перевірка 375 × 812 і назад до 360 × 740. */
const phoneFit = async (page: Page, name: string) => {
  await viewportShot(page, name);
  await expectPhoneFit(page, name);
  await page.setViewportSize({ width: 360, height: 740 });
};
/** Жодне слово не розірвано посеред слова. */
const wordsWhole = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const broken: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        for (const match of text.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index!);
          range.setEnd(node, match.index! + match[0].length);
          if (new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1) broken.push(match[0]);
        }
      }
    }
    return broken;
  }, selector);

type Card = { id: string; title: string; plays: number; likes: number };
type Entry = { entryId: string; quizId: string; moderation: string; listed: boolean; appealed: boolean };

async function library47() {
  const ADMIN_EMAIL = 'admin47@example.com';
  const TITLE = 'Річки України 47';
  const NEW_TITLE = 'Річки України 47 (нова)';
  const SMALL = 'Мала вікторина 47';
  const LONG_TITLE = 'Дуже довга назва вікторини про міста, річки, гори, парки, музеї та старовинні вулиці України, яку не вмістити в рядокааа';
  const LONG_NICK = 'Петроярославовичко20';
  const DESCRIPTION = 'Вікторина про Дніпро, Дністер і Південний Буг.';
  const common = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  const Q1 = 'Яка річка тече через Київ?';
  const Q2 = 'Дністер впадає в Азовське море?';
  const Q3 = 'Південний Буг впадає в Чорне море?';
  const Q4 = 'На якій річці стоїть Ужгород?';
  const Q5 = 'Десна — притока Дніпра?';
  const Q6 = 'Прут тече через Харків?';
  const ALL_QUESTIONS = [Q1, Q2, Q3, Q4, Q5, Q6];

  // ── 1. Сервер з адміном; Олена, Тарас, Ірина, Петро й адмін. ──
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }) });
  flags.restarting = false;
  const named: Record<string, Page> = {};
  for (const [key, name, email, nick] of [
    ['admin', 'Адмін 47', ADMIN_EMAIL, 'Адмін 47'],
    ['olena', 'Олена', 'olena47@example.com', 'Олена'],
    ['taras', 'Тарас', 'taras47@example.com', LONG_NICK],
    ['iryna', 'Ірина', 'iryna47@example.com', 'Ірина'],
    ['petro', 'Петро', 'petro47@example.com', 'Петро'],
  ] as const) {
    const page = await light(await open(`${key}47`, 360, 740));
    await register(page, 'menu', name, email);
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: nick, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olena, taras, iryna, petro } = named as Record<'admin' | 'olena' | 'taras' | 'iryna' | 'petro', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const guest = await light(await open('guest47', 360, 740));
  const petroId = await myId(petro);

  const uploaded = await olena.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } });
  const picture = ((await uploaded.json()) as { url: string }).url;
  expect(picture).toMatch(/^\/uploads\//);
  const questions = [
    { ...common, id: 'q1', type: 'single', text: Q1, options: [{ id: 'a', text: 'Дніпро', imageUrl: picture }, ...options('', 'Дністер', 'Південний Буг', 'Прут').slice(1)], correctId: 'a' },
    { ...common, id: 'q2', type: 'boolean', text: Q2, correct: false, timeLimit: 25 },
    { ...common, id: 'q3', type: 'boolean', text: Q3, correct: true, timeLimit: 25 },
    { ...common, id: 'q4', type: 'single', text: Q4, options: options('Тиса', 'Уж', 'Латориця', 'Дністер'), correctId: 'b' },
    { ...common, id: 'q5', type: 'boolean', text: Q5, correct: true, timeLimit: 25 },
    { ...common, id: 'q6', type: 'boolean', text: Q6, correct: false, timeLimit: 25 },
  ];
  const withTitle = (title: string, list: unknown[], description = '') => ({
    ...makeRoundsQuiz([classicRound('c1', list as never, { title: 'Річки', speedBonus: false, shuffleOptions: false })]),
    title,
    description,
  });
  const create = async (page: Page, body: unknown) => {
    const response = await page.request.post(`${base}/api/quizzes`, { data: body });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return ((await response.json()) as { id: string }).id;
  };
  const riversId = await create(olena, withTitle(TITLE, questions, DESCRIPTION));
  await create(olena, withTitle(SMALL, [questions[0], questions[1], questions[2], questions[4]]));
  const cities = [
    { ...common, id: 'c1', type: 'single', text: 'Яке місто стоїть на Дніпрі?', options: options('Київ', 'Львів', 'Луцьк', 'Ужгород'), correctId: 'a' },
    { ...common, id: 'c2', type: 'boolean', text: 'Львів — столиця України?', correct: false, timeLimit: 25 },
    { ...common, id: 'c3', type: 'boolean', text: 'Одеса стоїть на березі Чорного моря?', correct: true, timeLimit: 25 },
    { ...common, id: 'c4', type: 'boolean', text: 'Ужгород стоїть на Дністрі?', correct: false, timeLimit: 25 },
    { ...common, id: 'c5', type: 'boolean', text: 'Харків — друге за розміром місто?', correct: true, timeLimit: 25 },
  ];
  const longId = await create(taras, withTitle(LONG_TITLE, cities, 'Міста, парки й вулиці.'));
  const opened = await taras.request.put(`${base}/api/library/mine/${longId}`, { data: { language: 'uk' } });
  expect(opened.status(), await opened.text()).toBeLessThan(300);

  // ── 2. Олена: п'ять запитань — мінімум; знімок і «Оновити в бібліотеці». ──
  await olena.goto(`${base}/quizzes`);
  await olena.getByRole('link', { name: '📚 Бібліотека', ...exact }).waitFor();
  const rowOf = (page: Page, title: string) => page.locator('.quiz-list li', { hasText: title });
  const sheet = (page: Page) => page.getByRole('dialog', { name: '📚 Відкрити для всіх', ...exact });
  await rowOf(olena, SMALL).getByRole('button', { name: '📚 Бібліотека', ...exact }).click();
  await sheet(olena).waitFor();
  await click(olena, 'Відкрити для всіх');
  await olena.getByRole('alert').filter({ hasText: 'Для бібліотеки потрібно щонайменше 5 запитань.' }).waitFor();
  await click(olena, 'Скасувати');
  await sheet(olena).waitFor({ state: 'detached' });

  await rowOf(olena, TITLE).getByRole('button', { name: '📚 Бібліотека', ...exact }).click();
  await sheet(olena).waitFor();
  await sheet(olena).getByText('Вікторину побачать усі користувачі сайту', { exact: false }).waitFor();
  await sheet(olena).locator('select').selectOption({ label: 'Українська' });
  expect(await sheet(olena).locator('select').inputValue()).toBe('uk');
  await view(olena, 'p47-share');
  expect(await wordsWhole(olena, '.library-sheet')).toEqual([]);
  await click(olena, 'Відкрити для всіх');
  await sheet(olena).getByText('📚 Відкрито для всіх', exact).waitFor();
  await click(olena, 'Скасувати');
  await sheet(olena).waitFor({ state: 'detached' });
  await rowOf(olena, TITLE).getByText('📚 Відкрито для всіх', exact).waitFor();

  const catalog = async (page: Page, query = '') => (await (await page.request.get(`${base}/api/library${query}`)).json()) as { items: Card[]; next: number | null };
  const titles = async (page: Page, query = '') => (await catalog(page, query)).items.map((card) => card.title);
  expect(await titles(guest, '?q=%D0%B4%D0%BD%D1%96%D0%BF%D1%80')).toEqual([TITLE]);
  // Правка автора не потрапляє в каталог, поки він не натисне «Оновити в бібліотеці».
  await olena.goto(`${base}/quizzes/${riversId}`);
  await olena.getByLabel('Назва вікторини', exact).fill(NEW_TITLE);
  await Promise.all([
    olena.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/quizzes/${riversId}`)),
    click(olena, 'Зберегти'),
  ]);
  expect(await titles(guest, '?q=%D0%B4%D0%BD%D1%96%D0%BF%D1%80')).toEqual([TITLE]);
  await olena.goto(`${base}/quizzes`);
  await rowOf(olena, NEW_TITLE).getByRole('button', { name: '📚 Бібліотека', ...exact }).click();
  await sheet(olena).getByText('У бібліотеці — знімок на мить відкриття', { exact: false }).waitFor();
  await click(olena, 'Оновити в бібліотеці');
  await expect.poll(() => titles(guest, '?q=%D0%B4%D0%BD%D1%96%D0%BF%D1%80')).toEqual([NEW_TITLE]);
  await click(olena, 'Скасувати');
  const entryId = (await catalog(guest, '?q=%D0%B4%D0%BD%D1%96%D0%BF%D1%80')).items[0]!.id;
  const mine = async () => ((await (await olena.request.get(`${base}/api/library/mine`)).json()) as Entry[]).find((one) => one.entryId === entryId)!;
  expect((await mine()).moderation).toBe('ok');

  // ── 3. Гість: меню з «Бібліотекою», пошук «дніпр» за описом, сторінка без запитань, 401 на ❤️ й копію. ──
  await guest.goto(base);
  await guest.locator(MENU).getByRole('link', { name: 'Увійти' }).waitFor();
  expect(await menuLinks(guest)).toEqual(['Меню', 'Бібліотека', 'Увійти']);
  await phoneFit(guest, 'p47-guest-home');
  await guest.getByRole('link', { name: '📚 Бібліотека вікторин', ...exact }).click();
  await guest.waitForURL(/\/library$/);
  const cards = guest.locator('ul.library-list > li');
  await expect.poll(() => cards.count()).toBe(2);
  await cards.filter({ hasText: LONG_TITLE }).waitFor();
  await cards.filter({ hasText: LONG_NICK }).waitFor();
  await view(guest, 'p47-catalog-long');
  expect(await wordsWhole(guest, '.library-card h2')).toEqual([]);
  await guest.getByLabel('Пошук за назвою чи описом', exact).fill('дніпр');
  await expect.poll(() => cards.count()).toBe(1);
  await cards.first().getByText(NEW_TITLE, { exact: false }).waitFor();
  await view(guest, 'p47-catalog');
  await cards.first().click();
  await guest.waitForURL(new RegExp(`/library/${entryId}$`));
  await guest.getByRole('heading', { name: NEW_TITLE, ...exact }).waitFor();
  await guest.getByText('Річки — Класичний', exact).first().waitFor();
  await guest.getByText('Увійди, щоб копіювати, вподобати чи поскаржитись', exact).waitFor();
  const guestText = await bodyText(guest);
  for (const text of [...ALL_QUESTIONS, 'Дністер впадає', 'Тиса', 'Латориця']) expect(guestText, `no «${text}» on the guest page`).not.toContain(text);
  await view(guest, 'p47-guest');
  const detail = await guest.request.get(`${base}/api/library/${entryId}`);
  expect(detail.status()).toBe(200);
  const detailText = await detail.text();
  for (const text of [...ALL_QUESTIONS, 'Прут', 'Тиса', 'correctId', 'accepted', 'ownerId', 'quizId', 'example.com']) expect(detailText, `no «${text}» in the JSON`).not.toContain(text);
  expect(JSON.parse(detailText)).toMatchObject({ id: entryId, title: NEW_TITLE, author: 'Олена', questionCount: 6, roundTypes: ['classic'], rounds: [{ title: 'Річки', type: 'classic' }] });
  const listText = JSON.stringify(await catalog(guest));
  for (const text of [...ALL_QUESTIONS, 'correctId', 'accepted', 'ownerId', 'quizId', 'example.com']) expect(listText).not.toContain(text);
  expect((await guest.request.put(`${base}/api/library/${entryId}/like`, { data: { liked: true } })).status()).toBe(401);
  expect((await guest.request.post(`${base}/api/library/${entryId}/copy`, { data: { locale: 'uk' } })).status()).toBe(401);
  expect((await guest.request.post(`${base}/api/reports`, { data: { target: { kind: 'quiz', entryId }, reason: 'spam' } })).status()).toBe(401);

  // ── 4. Тарас: ❤️, копія з «Автор: Олена», та сама картинка; гра копії; «зіграли 1 раз». ──
  await taras.goto(`${base}/library`);
  await taras.locator('ul.library-list > li').filter({ hasText: NEW_TITLE }).waitFor();
  await view(taras, 'p47-catalog-account');
  await taras.locator('ul.library-list > li').filter({ hasText: NEW_TITLE }).click();
  await taras.getByRole('heading', { name: NEW_TITLE, ...exact }).waitFor();
  const likeButton = taras.getByRole('button', { name: /Подобається/ });
  await likeButton.click();
  await taras.getByRole('button', { name: '❤️ Подобається 1', ...exact }).waitFor();
  expect((await catalog(guest)).items.find((card) => card.id === entryId)!.likes).toBe(1);
  await click(taras, 'Копіювати собі');
  await taras.getByText('Скопійовано в «Мої вікторини»', { exact: false }).waitFor();
  await taras.getByRole('link', { name: 'Відкрити копію', ...exact }).click();
  await taras.getByLabel('Назва вікторини', exact).waitFor();
  await expect.poll(() => taras.getByLabel('Короткий опис', { exact: false }).inputValue()).toBe(`Автор: Олена\n${DESCRIPTION}`);
  await view(taras, 'p47-copy');
  const copyId = new URL(taras.url()).pathname.split('/').pop()!;
  const copy = (await (await taras.request.get(`${base}/api/quizzes/${copyId}`)).json()) as { quiz?: { description: string; rounds: { questions: { options?: { imageUrl?: string }[] }[] }[] } } & { description?: string; rounds?: { questions: { options?: { imageUrl?: string }[] }[] }[] };
  const copied = copy.quiz ?? copy;
  expect(copied.description).toBe(`Автор: Олена\n${DESCRIPTION}`);
  expect(copied.rounds![0]!.questions[0]!.options![0]!.imageUrl, 'the picture keeps its address').toBe(picture);
  // Не можна скопіювати власну вікторину.
  expect((await olena.request.post(`${base}/api/library/${entryId}/copy`, { data: { locale: 'uk' } })).status()).toBe(409);

  await taras.goto(`${base}/quizzes`);
  await rowOf(taras, NEW_TITLE).getByRole('button', { name: 'Грати', ...exact }).click();
  await taras.waitForURL(/\/host\/\d{6}$/);
  const code = taras.url().slice(-6);
  await iryna.goto(`${base}/play/${code}`);
  const nameInput = iryna.getByLabel('Ваше ім’я', exact);
  await nameInput.fill('Ірина');
  if ((await nameInput.inputValue()) !== 'Ірина') await nameInput.fill('Ірина');
  await click(iryna, 'Увійти в гру');
  await iryna.getByText('Ви в грі. Чекаємо на старт.').waitFor();
  await click(taras, 'Почати гру');
  await click(taras, 'Почати раунд');
  const answers: [string, string][] = [[Q1, 'Дніпро'], [Q2, 'Ні'], [Q3, 'Так'], [Q4, 'Уж'], [Q5, 'Так'], [Q6, 'Ні']];
  for (const [index, [text, answer]] of answers.entries()) {
    await iryna.getByText(text).first().waitFor({ timeout: 120_000 });
    if (index === 0 || index === 3) await pickOption(iryna, answer);
    else await click(iryna, answer);
    await taras.getByText('Запитання закрите').waitFor();
    await click(taras, 'Показати відповідь');
    if (index < answers.length - 1) await toNextQuestion(taras);
  }
  await click(taras, 'Завершити гру');
  await expect.poll(async () => (await catalog(guest)).items.find((card) => card.id === entryId)!.plays, { timeout: 30_000 }).toBe(1);
  await iryna.goto(`${base}/library/${entryId}`);
  await iryna.getByText('зіграли 1 раз', { exact: false }).waitFor();

  // ── 5. Три скарги від різних людей ховають вікторину; повторна — «Ти вже поскаржився(-лася)…». ──
  const report = async (page: Page, reason: string, text?: string, shotName?: string) => {
    await page.goto(`${base}/library/${entryId}`);
    await page.getByRole('heading', { name: NEW_TITLE, ...exact }).waitFor();
    await click(page, 'Поскаржитись');
    const dialog = page.getByRole('dialog', { name: 'Скарга', ...exact });
    await dialog.waitFor();
    await dialog.getByLabel(reason, exact).check();
    if (text !== undefined) await dialog.getByLabel('Пояснення (необов’язково)', exact).fill(text);
    if (shotName !== undefined) await view(page, shotName);
    await click(page, 'Надіслати');
    return dialog;
  };
  const first = await report(taras, 'Спам');
  await first.getByText('Дякуємо, скаргу надіслано.', exact).waitFor();
  const again = await report(taras, 'Спам');
  await again.getByRole('alert').filter({ hasText: 'Ти вже поскаржився(-лася)' }).waitFor();
  await click(taras, 'Скасувати');
  expect(await titles(guest, '?q=%D0%B4%D0%BD%D1%96%D0%BF%D1%80'), 'two reports do not hide').toEqual([NEW_TITLE]);
  const NOTE = 'На картинці видно чужі особисті дані.';
  const second = await report(iryna, 'Особисті дані', NOTE, 'p47-report');
  await second.getByText('Дякуємо, скаргу надіслано.', exact).waitFor();
  expect(await titles(guest, '?q=%D0%B4%D0%BD%D1%96%D0%BF%D1%80'), 'still visible after two different reports').toEqual([NEW_TITLE]);
  const third = await report(petro, 'Інше');
  await third.getByText('Дякуємо, скаргу надіслано.', exact).waitFor();
  expect(await titles(guest, '?q=%D0%B4%D0%BD%D1%96%D0%BF%D1%80')).toEqual([]);
  expect((await guest.request.get(`${base}/api/library/${entryId}`)).status()).toBe(404);
  await olena.goto(`${base}/quizzes`);
  await rowOf(olena, NEW_TITLE).getByText('⏳ Тимчасово приховано: скарги на перевірці', exact).waitFor();
  expect((await mine()).moderation).toBe('auto_hidden');

  // ── 6. Адмін: черга «Звернення → Скарги», причини й текст; «Сховати вікторину»; відкрити знову не можна; журнал. ──
  await admin.goto(`${base}/admin`);
  await admin.locator('nav.admin-tabs a[href="/admin/appeals"]').click(); // 70: «Скарги» стали підвкладкою «Звернень»
  const card = admin.locator('ul.admin-reports > li', { hasText: NEW_TITLE });
  await card.waitFor();
  await card.getByText('3 скарги', exact).waitFor();
  await card.getByText('Спам × 1', exact).waitFor();
  await card.getByText('Особисті дані × 1', exact).waitFor();
  await card.getByText('Інше × 1', exact).waitFor();
  await card.getByText(NOTE, exact).waitFor();
  await card.getByText('⏳ Тимчасово приховано: скарги на перевірці', exact).waitFor();
  await view(admin, 'p47-admin');
  expect(await wordsWhole(admin, 'ul.admin-reports')).toEqual([]);
  // «Переглянути вікторину» — знімок із каталогу, на який скаржились, лише для перегляду й без скаржників.
  await card.getByRole('link', { name: 'Переглянути вікторину', ...exact }).click();
  await admin.waitForURL(`${base}/admin/appeals/complaints/quiz/${entryId}`);
  await admin.getByRole('heading', { name: NEW_TITLE, ...exact }).waitFor();
  await admin.getByText(/^Знімок у бібліотеці від .+ — саме його бачать гравці.$/).waitFor();
  expect(await admin.getByRole('button', { name: 'Видалити запитання', ...exact }).count()).toBe(0);
  expect(await admin.getByRole('button', { name: 'Видалити вікторину', ...exact }).count()).toBe(0);
  const snapshotText = (await admin.locator('main').textContent()) ?? '';
  for (const secret of [NOTE, 'Ірина', 'Петро', LONG_NICK]) expect(snapshotText, 'no reporter in the snapshot view').not.toContain(secret);
  await view(admin, 'p47-admin-snapshot');
  await admin.getByRole('link', { name: 'До списку', ...exact }).click();
  await card.waitFor();
  await card.getByRole('button', { name: 'Сховати вікторину', ...exact }).click();
  await admin.getByText('Відкритих скарг немає.', exact).waitFor();
  await expect.poll(async () => (await mine()).moderation).toBe('hidden');
  await olena.goto(`${base}/quizzes`);
  await rowOf(olena, NEW_TITLE).getByText('🚫 Приховано модератором', exact).waitFor();
  // Закрити й відкрити знову — приховування не знімає.
  const closed = await olena.request.delete(`${base}/api/library/mine/${riversId}`);
  expect(closed.status()).toBeLessThan(300);
  const reopened = await olena.request.put(`${base}/api/library/mine/${riversId}`, { data: { language: 'uk' } });
  expect(reopened.status()).toBe(409);
  expect(await reopened.json()).toEqual({ error: 'library_hidden' });
  await rowOf(olena, NEW_TITLE).getByRole('button', { name: '📚 Бібліотека', ...exact }).click();
  await sheet(olena).waitFor();
  expect(await sheet(olena).getByRole('button', { name: 'Відкрити для всіх', ...exact }).count(), 'no way to open a hidden quiz').toBe(0);
  expect(await titles(guest, '?q=%D0%B4%D0%BD%D1%96%D0%BF%D1%80')).toEqual([]);
  await view(olena, 'p47-hidden');
  await admin.getByRole('link', { name: 'Журнал', ...exact }).click();
  await admin.getByText(/сховав\(-ла\) вікторину «Річки України 47 \(нова\)»/).waitFor();

  // ── 7. Олена оскаржує один раз; адмін повертає; нове приховування — вже без оскарження. ──
  await click(olena, 'Оскаржити');
  await sheet(olena).getByText('Оскарження надіслано', exact).waitFor();
  await click(olena, 'Скасувати');
  await admin.locator('nav.admin-tabs a[href="/admin/appeals"]').click(); // 70: «Скарги» стали підвкладкою «Звернень»
  const appealCard = admin.locator('ul.admin-reports > li', { hasText: NEW_TITLE });
  await appealCard.getByText('Автор оскаржує приховування', exact).waitFor();
  await appealCard.getByText('🚫 Приховано модератором', exact).waitFor();
  await view(admin, 'p47-admin-appeal');
  await appealCard.getByRole('button', { name: 'Зняти приховування', ...exact }).click();
  await admin.getByText('Відкритих скарг немає.', exact).waitFor();
  await expect.poll(async () => (await mine()).moderation).toBe('ok');
  // Автор сам закрив вікторину до оскарження: модератор знімає приховування, а в каталог вона вертається, коли автор відкриє її знову.
  expect(await titles(guest, '?q=%D0%B4%D0%BD%D1%96%D0%BF%D1%80')).toEqual([]);
  const again47 = await olena.request.put(`${base}/api/library/mine/${riversId}`, { data: { language: 'uk' } });
  expect(again47.status(), await again47.text()).toBeLessThan(300);
  expect(await titles(guest, '?q=%D0%B4%D0%BD%D1%96%D0%BF%D1%80')).toEqual([NEW_TITLE]);
  const rehide = await admin.request.post(`${base}/api/admin/reports/quiz/${entryId}`, { data: { action: 'hide' } });
  expect(rehide.status(), await rehide.text()).toBeLessThan(300);
  expect(await titles(guest, '?q=%D0%B4%D0%BD%D1%96%D0%BF%D1%80')).toEqual([]);
  const second409 = await olena.request.post(`${base}/api/library/mine/${riversId}/appeal`, { data: {} });
  expect(second409.status()).toBe(409);
  expect(await second409.json()).toEqual({ error: 'library_appeal_used' });
  await olena.goto(`${base}/quizzes`);
  await rowOf(olena, NEW_TITLE).getByRole('button', { name: '📚 Бібліотека', ...exact }).click();
  await sheet(olena).getByText('Оскарження вже використано', exact).waitFor();
  expect(await sheet(olena).getByRole('button', { name: 'Оскаржити', ...exact }).count()).toBe(0);
  await click(olena, 'Скасувати');

  // ── 8. Петро ставить нік; Ірина скаржиться на його профіль; адмін скидає нік; копія Тараса лишилась з «Автор: Олена». ──
  const NICK = 'Петро Кривий 47';
  expect((await petro.request.put(`${base}/api/me/profile`, { data: { nickname: NICK, avatar: null } })).ok()).toBe(true);
  await iryna.goto(`${base}/profile/${petroId}`);
  await iryna.getByRole('heading', { name: NICK, ...exact }).waitFor();
  await click(iryna, 'Поскаржитись');
  const profileDialog = iryna.getByRole('dialog', { name: 'Скарга', ...exact });
  await profileDialog.getByLabel('Образливе', exact).check();
  await click(iryna, 'Надіслати');
  await profileDialog.getByText('Дякуємо, скаргу надіслано.', exact).waitFor();
  // Стара адреса веде на нову без зайвого кроку в історії (70).
  await admin.goto(`${base}/admin/reports`);
  await admin.waitForURL(`${base}/admin/appeals/complaints`);
  const profileCard = admin.locator('ul.admin-reports > li', { hasText: `Профіль ${NICK}` });
  await profileCard.waitFor();
  await profileCard.getByText('Образливе × 1', exact).waitFor();
  await profileCard.getByRole('button', { name: 'Скинути нік', ...exact }).click();
  await admin.getByText('Відкритих скарг немає.', exact).waitFor();
  await iryna.goto(`${base}/profile/${petroId}`);
  await iryna.getByRole('heading', { name: 'Гравець', ...exact }).waitFor();
  expect(await bodyText(iryna)).not.toContain(NICK);
  await view(iryna, 'p47-reset');
  const profile = (await (await iryna.request.get(`${base}/api/profiles/${petroId}`)).json()) as { nickname: string | null };
  expect(profile.nickname).toBeNull();
  await admin.getByRole('link', { name: 'Журнал', ...exact }).click();
  await admin.getByText(/скинув\(-ла\) нік/).first().waitFor();
  const copyAfter = (await (await taras.request.get(`${base}/api/quizzes/${copyId}`)).json()) as { quiz?: { description: string }; description?: string };
  expect((copyAfter.quiz ?? copyAfter).description).toBe(`Автор: Олена\n${DESCRIPTION}`);

  // ── 9. Головна з плиткою «Бібліотека» й меню з п'яти пунктів (з акаунтом); світла тема на кожному екрані. ──
  await olena.goto(base);
  await olena.locator('nav.start-menu').getByRole('link', { name: /Бібліотека/ }).waitFor();
  expect(await menuLinks(olena)).toEqual(MENU_ITEMS_23A);
  await phoneFit(olena, 'p47-home');
  for (const [name, page] of [['admin', admin], ['olena', olena], ['taras', taras], ['iryna', iryna], ['petro', petro], ['guest', guest]] as const) {
    expect(await isLight(page), `${name}: light theme class`).toBe(true);
  }
  await shot(olena, 'p47-end');
  // 401/404/409 — очікувані відповіді запитів (гість, прихована вікторина, повторна скарга), а не збої сторінок.
  expect(problems.filter((problem) => !/\b(401|404|409)\b/.test(problem))).toEqual([]);
}
