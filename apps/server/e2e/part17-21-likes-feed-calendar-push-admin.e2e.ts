import { resolve } from 'node:path';
import { bool as boolQ, classicRound, makeRoundsQuiz, single } from '@quiz/engine/testing';
import { type PushPayload } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import webpush from 'web-push';
import type { PushOptions } from '../src/push';
import { calendarEvent, feedEvent, game as gameRow, pushSubscription, quiz as quizRow, user, userLike } from '../src/db/schema';
import { adminEmails } from '../src/config';
import { kyivDay } from '../src/xp-rules';
import { open, click, field, join, expectNoSideScroll, MENU, MENU_ITEMS_23A, menuLinks, expectPhoneFit, register, myId, noSideScroll, POLL, decide, expectFiveItems, label } from './helpers/common';
import { exact, ctx, base, db, problems, snapshot, afterSplash, shot, relisten, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частини 17–21: вподобання, стрічка, календар, веб-пуш, адмінка.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

function likeQuestions17a() {
  const common = { imageUrl: null, video: null, timeLimit: 20, points: 100 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  return [
    { ...common, id: 'l1', type: 'single' as const, text: 'Яка річка тече через Київ?', options: options('Дніпро', 'Дністер', 'Південний Буг', 'Десна'), correctId: 'a' },
    { ...common, id: 'l2', type: 'boolean' as const, text: 'Говерла — найвища вершина України?', correct: true },
    { ...common, id: 'l3', type: 'boolean' as const, text: 'Азовське море — найглибше в Європі?', correct: false },
    { ...common, id: 'l4', type: 'boolean' as const, text: 'Софійський собор стоїть у Києві?', correct: true },
  ];
}

/**
 * Шапка телефона (17a) — один рядок у межах екрана: кожна пігулка (нік, «Таблиця», ❤️, реакція, бали, дуель чи крамниця,
 * якщо є) лежить у шапці, шапка не прокручується вбік, а значки, бали й «Таблиця» не обрізані.
 */
const BAR_FITS_17A = `(() => {
  const bar = document.querySelector('header.bar');
  if (!bar) return ['no header'];
  const bad = [];
  if (bar.scrollWidth > bar.clientWidth + 1) bad.push('the header scrolls: ' + bar.scrollWidth + ' > ' + bar.clientWidth);
  const br = bar.getBoundingClientRect();
  if (br.left < -0.5 || br.right > innerWidth + 0.5) bad.push('the header leaves the screen');
  const items = [...bar.children].filter((el) => el.getBoundingClientRect().width > 0);
  for (const el of items) {
    const r = el.getBoundingClientRect();
    const label = el.tagName.toLowerCase() + '.' + [...el.classList].join('.');
    if (r.left < br.left - 0.5 || r.right > br.right + 0.5) bad.push(label + ' leaves the header');
    if (r.left < -0.5 || r.right > innerWidth + 0.5) bad.push(label + ' leaves the screen');
  }
  const mids = items.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
  if (Math.max(...mids) - Math.min(...mids) > 4) bad.push('the header wraps');
  // Обрізане трикрапкою: розкладка вмісту (Range, дробові пікселі) ширша за поле вмісту пігулки (без рамки й відступів).
  // scrollWidth тут не годиться: він округлює (61,4 у полі 61 — уже «Табли…»), а дотикова зона 😀 (::after) його роздуває.
  const cut = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const content = range.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const left = box.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
    const right = box.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight);
    return content.left < left - 0.01 || content.right > right + 0.01;
  };
  for (const sel of ['.like-button', '.reaction-button', '.score', '.duel-button', '.shop-button']) {
    const el = bar.querySelector(sel);
    if (el && cut(el)) bad.push(sel + ' is cut');
  }
  const table = [...bar.querySelectorAll('.table-button')].find((el) => el.textContent.includes('Таблиця'));
  if (table && cut(table)) bad.push('«Таблиця» is cut');
  return bad;
})()`;

type Box17a = { x: number; y: number; width: number; height: number };
const overlaps17a = (a: Box17a, b: Box17a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function likes17a() {
  const TITLE = 'Вподобайка 17a';
  const OLYA = 'Оля Барвінок-Калинка';
  const PETRO = 'Петро Вербицький-Дуб';
  expect([OLYA.length, PETRO.length], 'the long nicknames have 20 characters').toEqual([20, 20]);
  const host = await open('host17a', 1280, 800);
  await register(host, 'host', 'Марко Ведучий', 'host17a@example.com');
  const olya = await open('olya17a', 375, 812);
  await register(olya, 'menu', OLYA, 'olya17a@example.com');
  const petro = await open('petro17a', 375, 812);
  await register(petro, 'menu', PETRO, 'petro17a@example.com');
  const ids = new Map<Page, string>();
  for (const page of [host, olya, petro]) ids.set(page, await myId(page));

  // ── 1. Лобі. ──
  const data = {
    ...makeRoundsQuiz([classicRound('r1', likeQuestions17a() as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]),
    title: TITLE,
  };
  const created = await host.request.post(`${base}/api/quizzes`, { data });
  expect(created.ok(), await created.text()).toBe(true);
  const quizId = ((await created.json()) as { id: string }).id;
  const stage = await open('stage17a', 1280, 720);
  const guest = await open('guest17a', 375, 812);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: TITLE }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  await stage.goto((await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
  await join(olya, code, OLYA, false);
  await join(petro, code, PETRO, false);
  await join(guest, code, 'Гість', false);
  await host.getByText('Гість', exact).first().waitFor();

  const phones = [olya, petro, guest];
  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  const answer = async (page: Page, text: string) => {
    const button = text === 'Так' || text === 'Ні' ? page.getByRole('button', { name: text, ...exact }) : page.getByRole('button', { name: new RegExp(text) });
    await button.waitFor();
    await button.click();
  };
  const toReveal = async (picks: [Page, string][]) => {
    for (const [page, text] of picks) await answer(page, text);
    await host.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
  };
  const toNext = async () => {
    await step('Далі');
    await step('Наступне запитання');
    await afterSplash(host, stage, ...phones);
  };
  const heart = (page: Page) => page.locator('header.bar .like-button');
  const likeIt = (page: Page) => page.getByRole('button', { name: 'Вподобати запитання', ...exact });
  const unlikeIt = (page: Page) => page.getByRole('button', { name: 'Прибрати вподобання', ...exact });
  const barHeight = async (page: Page) => (await page.locator('header.bar').boundingBox())!.height;

  // ── 2. Розкриття 1: ❤️ у шапці Олі нічого не зсуває. ──
  await step('Почати гру');
  await afterSplash(host, stage, ...phones);
  await step('Почати раунд');
  await afterSplash(host, stage, ...phones);
  await olya.getByRole('button', { name: /Дніпро/ }).waitFor();
  expect(await heart(olya).count(), 'a heart while the question is open').toBe(0);
  const questionBar = await barHeight(olya);
  await toReveal([[olya, 'Дніпро'], [petro, 'Дністер'], [guest, 'Десна']]);
  await likeIt(olya).waitFor();
  expect(await barHeight(olya), 'p17a-phone-reveal: the heart makes the header taller').toBe(questionBar);
  expect(await olya.locator('header.bar').getByRole('button', { name: /Таблиця/ }).count(), 'p17a: «Таблиця» in the header').toBe(1);
  expect(await olya.locator('header.bar .reaction-button').count(), 'p17a: the reaction button in the header').toBe(1);
  expect(await olya.evaluate(BAR_FITS_17A), 'p17a-phone-reveal: the header').toEqual([]);
  const titleBefore = (await olya.locator('h1.question').boundingBox())!;
  const strip = (await olya.locator('.reaction-strip').boundingBox())!;
  expect(await heart(olya).getAttribute('aria-pressed')).toBe('false');
  await likeIt(olya).click();
  await unlikeIt(olya).waitFor();
  expect(await heart(olya).getAttribute('aria-pressed')).toBe('true');
  expect(await olya.locator('h1.question').boundingBox(), 'p17a-phone-reveal: the like moves the question').toEqual(titleBefore);
  expect(await barHeight(olya), 'p17a-phone-reveal: the filled heart makes the header taller').toBe(questionBar);
  expect(overlaps17a((await heart(olya).boundingBox())!, strip), 'p17a-phone-reveal: the heart overlaps the reaction strip').toBe(false);
  expect(await olya.evaluate(BAR_FITS_17A), 'p17a-phone-reveal: the header after the like').toEqual([]);
  await expectNoSideScroll(olya, 'p17a-phone-reveal');
  // Подвійний дотик Петра: лайк і одразу зняття — нічого не лишається.
  await likeIt(petro).click();
  await unlikeIt(petro).waitFor();
  await unlikeIt(petro).click();
  await likeIt(petro).waitFor();
  expect(await heart(petro).getAttribute('aria-pressed')).toBe('false');
  expect(await petro.evaluate(BAR_FITS_17A), 'p17a-petro-reveal: the header').toEqual([]);
  await expectNoSideScroll(petro, 'p17a-petro-reveal');
  // Гість: серця немає.
  await guest.locator('header.bar').getByRole('button', { name: /Таблиця/ }).waitFor();
  expect(await heart(guest).count(), 'the guest has a heart').toBe(0);

  // ── 3. Розкриття 2–4. ──
  await toNext();
  await toReveal([[olya, 'Так'], [petro, 'Так'], [guest, 'Ні']]);
  await likeIt(olya).click();
  await unlikeIt(olya).waitFor();
  await toNext();
  await olya.getByRole('button', { name: 'Ні', ...exact }).waitFor();
  expect(await heart(olya).count(), 'a heart on question 3 before the reveal').toBe(0);
  await toReveal([[olya, 'Ні'], [petro, 'Так'], [guest, 'Ні']]);
  await likeIt(olya).waitFor();
  expect(await heart(olya).getAttribute('aria-pressed'), 'question 3 starts liked').toBe('false');
  await toNext();
  await toReveal([[olya, 'Так'], [petro, 'Ні'], [guest, 'Так']]);
  await likeIt(olya).waitFor();
  await step('Завершити гру');

  // ── 4. Фінал: «Сподобалось?». ──
  const panel = (page: Page) => page.locator('section.like-panel');
  const chip = (page: Page, name: string) => panel(page).getByRole('button', { name, ...exact });
  await olya.getByText('Гру завершено').first().waitFor();
  await panel(olya).getByRole('heading', { name: 'Сподобалось?', ...exact }).waitFor();
  for (const name of ['Вікторина', 'Ведучий', PETRO]) {
    await chip(olya, name).click();
    await expect.poll(() => chip(olya, name).getAttribute('aria-pressed'), POLL).toBe('true');
  }
  expect(await chip(olya, OLYA).count(), 'Оля can like herself').toBe(0);
  expect(await panel(olya).getByRole('button', { name: 'Гість', ...exact }).count(), 'the guest is in the list').toBe(0);
  await olya.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  const finalStrip = (await olya.locator('.reaction-strip').boundingBox())!;
  const panelBox = (await panel(olya).boundingBox())!;
  expect(overlaps17a(panelBox, finalStrip), 'p17a-phone-final: «Сподобалось?» overlaps the reaction strip').toBe(false);
  expect(panelBox.x + panelBox.width, 'p17a-phone-final: the panel leaves the phone').toBeLessThanOrEqual(375 + 0.5);
  for (const one of await panel(olya).locator('.like-chip').all()) {
    const box = (await one.boundingBox())!;
    expect(box.x >= 0 && box.x + box.width <= 375 + 0.5, 'p17a-phone-final: a chip leaves the phone').toBe(true);
  }
  await expectNoSideScroll(olya, 'p17a-phone-final');
  await olya.evaluate('window.scrollTo(0, 0)');
  // Фінал на 360 і 375 px з 20-символьним ніком (❤️ у шапці вже немає): «Таблиця» ціла — місце віддає нік, шапка в один рядок.
  for (const width of [360, 375]) {
    await olya.setViewportSize({ width, height: 812 });
    expect(await olya.locator('header.bar').getByRole('button', { name: /Таблиця/ }).count(), `p17a-phone-final-${width}: «Таблиця» in the header`).toBe(1);
    expect(await heart(olya).count(), `p17a-phone-final-${width}: a heart in the header`).toBe(0);
    await expect.poll(() => olya.evaluate(BAR_FITS_17A), POLL).toEqual([]);
    await shot(olya, `p17a-phone-final-header-${width}`);
    await expectNoSideScroll(olya, `p17a-phone-final-${width}`);
  }
  await panel(petro).waitFor();
  await chip(petro, OLYA).click();
  await expect.poll(() => chip(petro, OLYA).getAttribute('aria-pressed'), POLL).toBe('true');
  await chip(petro, 'Ведучий').waitFor();
  expect(await chip(petro, 'Ведучий').getAttribute('aria-pressed')).toBe('false');
  await expectNoSideScroll(petro, 'p17a-petro-final');
  await guest.getByText('Гру завершено').first().waitFor();
  expect(await panel(guest).count(), 'the guest has the like panel').toBe(0);

  // ── 5. Запис у user_like. ──
  const who = new Map([[ids.get(host)!, 'host'], [ids.get(olya)!, 'olya'], [ids.get(petro)!, 'petro']]);
  const likeRows = async () =>
    (await db.select().from(userLike))
      .filter((r) => who.has(r.userId))
      .map((r) => `${who.get(r.userId)} ${r.kind}${r.questionId !== null ? ` ${r.questionId}` : ''} → ${who.get(r.targetUserId) ?? r.targetUserId}${r.hidden ? ' hidden' : ''}`)
      .sort();
  await expect
    .poll(likeRows, { timeout: 15_000 })
    .toEqual(['olya host → host', 'olya player → petro', 'olya question l1 → host', 'olya question l2 → host', 'olya quiz → host', 'petro player → olya']);
  for (const r of await db.select().from(userLike)) if (r.kind === 'question' || r.kind === 'quiz') expect(r.quizId).toBe(quizId);

  // ── 6. Профілі. ──
  const tileValue = async (page: Page, label: string) =>
    (await page.locator('section.likes-card .likes-tile', { hasText: label }).locator('strong').innerText()).replace(/\D/g, '');
  await host.setViewportSize({ width: 375, height: 812 });
  await host.goto(`${base}/profile/likes`);
  // На сторінці «Вподобання» заголовок лише в шапці сторінки, картка без свого (24b).
  await host.locator('section.likes-card .likes-tile').first().waitFor();
  expect(await host.locator('section.likes-card h2').count(), 'no second «Вподобання» heading').toBe(0);
  expect([await tileValue(host, 'як автор'), await tileValue(host, 'як ведучий'), await tileValue(host, 'як гравець')], 'the host profile').toEqual(['3', '1', '0']);
  const tops = await Promise.all((await host.locator('.likes-tile').all()).map(async (one) => (await one.boundingBox())!.y));
  expect(new Set(tops).size, 'p17a-profile: the three tiles are not in one row').toBe(1);
  await expectNoSideScroll(host, 'p17a-profile');
  await olya.goto(`${base}/profile/${ids.get(petro)!}`);
  await olya.locator('section.likes-card').waitFor();
  await expect.poll(() => tileValue(olya, 'як гравець'), POLL).toBe('1');
  expect(await tileValue(olya, 'як автор')).toBe('0');
  await expectNoSideScroll(olya, 'p17a-public-profile');

  // ── 7. Редактор. ──
  await host.setViewportSize({ width: 1280, height: 800 });
  const openEditor = async (questions: number) => {
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: TITLE }).getByRole('link', { name: 'Редагувати' }).click();
    await host.locator('main.editor').waitFor();
    await expect.poll(() => host.locator('.question-list .question-item').count(), POLL).toBe(questions);
  };
  const counts = () => host.locator('.question-list .question-item').evaluateAll((items) => items.map((item) => item.querySelector('.like-count')?.textContent ?? null));
  await openEditor(4);
  await expect.poll(counts, POLL).toEqual(['❤️ 1', '❤️ 1', null, null]);
  await host.getByText('❤️ Вікторину вподобали: 1', exact).waitFor();
  expect(await host.locator('.question-list .like-count').first().getAttribute('aria-label')).toBe('Вподобали: 1');
  await shot(host, 'p17a-editor');
  await host.setViewportSize({ width: 375, height: 812 });
  // На телефоні список запитань згорнуто в «1 / 4 ☰»: серця видно, щойно його розгорнути.
  await host.locator('.question-nav-all').click();
  await host.locator('.question-list.is-open').waitFor();
  for (const count of await host.locator('.question-list .like-count').all()) {
    expect(await count.isVisible(), 'p17a-editor-375: a heart is hidden').toBe(true);
    const box = (await count.boundingBox())!;
    expect(box.x >= 0 && box.x + box.width <= 375 + 0.5, 'p17a-editor-375: a heart leaves the phone').toBe(true);
  }
  for (const item of await host.locator('.question-list .question-item').all()) {
    const box = (await item.boundingBox())!;
    expect(box.x + box.width, 'p17a-editor-375: a question row leaves the phone').toBeLessThanOrEqual(375 + 0.5);
  }
  await expectNoSideScroll(host, 'p17a-editor-375');
  await host.locator('.question-nav-all').click();
  await host.setViewportSize({ width: 1280, height: 800 });
  // Видалене запитання 2 більше не рахується.
  await host.locator('.question-list .question-item').nth(1).click();
  await click(host, 'Видалити запитання 2');
  await expect.poll(() => host.locator('.question-list .question-item').count(), POLL).toBe(3);
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  await expect.poll(likeRows, { timeout: 15_000 }).toContain('olya question l2 → host hidden');
  await host.goto(`${base}/profile/likes`);
  await host.locator('section.likes-card').waitFor();
  await expect.poll(() => tileValue(host, 'як автор'), POLL).toBe('2');
  await openEditor(3);
  await expect.poll(counts, POLL).toEqual(['❤️ 1', null, null]);

  expect(problems).toEqual([]);
}

it('part 17a: likes — Оля hearts questions 1 and 2 on the reveal without moving anything, Петро’s double tap leaves nothing, the guest has no heart, after the game Оля likes the quiz, the host and Петро and Петро likes Оля, the profiles count likes as author, host and player, the editor shows a heart per question, and a deleted question stops counting', async () => {
  try {
    await likes17a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

function feedQuestions18a() {
  const common = { imageUrl: null, video: null, timeLimit: 20, points: 100 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  return [
    { ...common, id: 'f1', type: 'single' as const, text: 'Яке місто — столиця України?', options: options('Київ', 'Львів', 'Одеса', 'Харків'), correctId: 'a' },
    { ...common, id: 'f2', type: 'boolean' as const, text: 'Чорне море омиває Україну?', correct: true },
    { ...common, id: 'f3', type: 'boolean' as const, text: 'Карпати — найвищі гори Європи?', correct: false },
  ];
}

/**
 * Бейдж «Стрічки» в меню телефона (18a): пункт «Стрічка» (другий) містить бейдж цілком, бейдж не налазить на сусідні пункти,
 * сторінка не гортається вбік. Повертає список порушень.
 */
const FEED_BADGE_FITS_18A = `(() => {
  const links = [...document.querySelectorAll('nav.menu a')];
  const badge = links[1]?.querySelector('.menu-badge');
  if (!badge) return ['no badge on the second item'];
  const bad = [];
  const b = badge.getBoundingClientRect();
  const own = links[1].getBoundingClientRect();
  if (b.left < own.left - 0.5 || b.right > own.right + 0.5 || b.top < own.top - 0.5 || b.bottom > own.bottom + 0.5)
    bad.push('the badge leaves its item: ' + [b.left, b.right, b.top, b.bottom].map((n) => n.toFixed(1)).join(',') + ' in ' + [own.left, own.right, own.top, own.bottom].map((n) => n.toFixed(1)).join(','));
  for (const i of [0, 2]) {
    const r = links[i].getBoundingClientRect();
    if (b.left < r.right - 0.5 && r.left < b.right - 0.5 && b.top < r.bottom && r.top < b.bottom) bad.push('the badge overlaps item ' + i);
  }
  if (document.documentElement.scrollWidth > innerWidth) bad.push('horizontal scroll');
  return bad;
})()`;

async function feed18a() {
  const TITLE = 'Стрічка 18a';
  const OLYA = 'Оля Смерічка-Яблунів';
  const PETRO = 'Петро Ковальчук';
  expect(OLYA.length, 'Оля has a 20-character nickname').toBe(20);
  const olya = await open('olya18a', 375, 812);
  await register(olya, 'menu', OLYA, 'olya18a@example.com');
  const petro = await open('petro18a', 375, 812);
  await register(petro, 'menu', PETRO, 'petro18a@example.com');
  const vira = await open('vira18a', 375, 812);
  await register(vira, 'menu', 'Віра Слухачка', 'vira18a@example.com');
  const host = await open('host18a', 1280, 800);
  await register(host, 'host', 'Марко Ведучий', 'host18a@example.com');
  const ids = new Map<Page, string>();
  for (const page of [host, olya, petro, vira]) ids.set(page, await myId(page));
  // Нік у стрічці — з профілю (за замовчуванням лише перше слово імені): Олі — повний, 20 символів.
  for (const [page, nickname] of [[olya, OLYA], [petro, PETRO]] as const) {
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
  }
  const feedLink = (page: Page) => page.locator(MENU).getByRole('link', { name: /^Стрічка/ });
  const menuBadge = (page: Page) => feedLink(page).locator('.menu-badge');

  // ── 1. Меню: п'ять пунктів на 360 і 375 px; бейдж «99+» і двоцифровий не виходять за пункт. ──
  await olya.goto(base);
  await feedLink(olya).waitFor();
  expect(await menuLinks(olya)).toEqual(MENU_ITEMS_23A);
  for (const width of [360, 375]) await expectFiveItems(olya, width);
  // The «99+» and 42 badges are stubbed here; the real badge is checked in step 4.
  for (const [count, label] of [[120, '99+'], [42, '42']] as const) {
    await olya.route('**/api/me/feed/badge', (route) => route.fulfill({ json: { events: count, requests: 0, decisions: 0 } }));
    await olya.reload();
    await expect.poll(() => menuBadge(olya).textContent({ timeout: 500 }).catch(() => null), POLL).toBe(label);
    expect(await feedLink(olya).getAttribute('aria-label')).toBe(`Стрічка, Нових подій: ${count}`);
    expect(await menuBadge(olya).getAttribute('aria-hidden'), 'the badge repeats the count to a screen reader').toBe('true');
    for (const width of [360, 375]) {
      await expectFiveItems(olya, width);
      expect(await olya.evaluate(FEED_BADGE_FITS_18A), `p18a-menu-${width} with «${label}»`).toEqual([]);
      await shot(olya, label === '99+' ? `p18a-menu-${width}` : `p18a-menu-${width}-two-digit`);
    }
    await olya.unroute('**/api/me/feed/badge');
  }
  await olya.reload();
  await feedLink(olya).waitFor();

  // ── 2. Дружба: Оля ↔ Петро взаємно, Віра → Петро в один бік. Ведучий — нікому. ──
  const follow = async (page: Page, target: Page) => {
    await page.goto(`${base}/profile/${ids.get(target)!}`);
    await page.getByRole('button', { name: 'Додати в друзі', ...exact }).click();
    await page.getByText('У друзях', exact).waitFor();
  };
  await follow(olya, petro);
  await follow(petro, olya);
  await follow(vira, petro);

  // ── 3. Гра: Оля — 3 з 3, Петро — 1 з 3; Петро вподобав запитання 1 і вікторину. ──
  const data = {
    ...makeRoundsQuiz([classicRound('r1', feedQuestions18a() as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]),
    title: TITLE,
  };
  const created = await host.request.post(`${base}/api/quizzes`, { data });
  expect(created.ok(), await created.text()).toBe(true);
  const stage = await open('stage18a', 1280, 720);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: TITLE }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  await stage.goto((await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
  await join(olya, code, OLYA, false);
  await join(petro, code, PETRO, false);
  await host.getByText(PETRO, exact).first().waitFor();
  const phones = [olya, petro];
  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  const answer = async (page: Page, text: string) => {
    const button = text === 'Так' || text === 'Ні' ? page.getByRole('button', { name: text, ...exact }) : page.getByRole('button', { name: new RegExp(text) });
    await button.waitFor();
    await button.click();
  };
  const toReveal = async (picks: [Page, string][]) => {
    for (const [page, text] of picks) await answer(page, text);
    await host.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
  };
  const toNext = async () => {
    await step('Далі');
    await step('Наступне запитання');
    await afterSplash(host, stage, ...phones);
  };
  await step('Почати гру');
  await afterSplash(host, stage, ...phones);
  await step('Почати раунд');
  await afterSplash(host, stage, ...phones);
  await toReveal([[olya, 'Київ'], [petro, 'Київ']]);
  await petro.getByRole('button', { name: 'Вподобати запитання', ...exact }).click();
  await petro.getByRole('button', { name: 'Прибрати вподобання', ...exact }).waitFor();
  await toNext();
  await toReveal([[olya, 'Так'], [petro, 'Ні']]);
  await toNext();
  await toReveal([[olya, 'Ні'], [petro, 'Так']]);
  await step('Завершити гру');
  const panel = (page: Page) => page.locator('section.like-panel');
  await petro.getByText('Гру завершено').first().waitFor();
  const quizChip = panel(petro).getByRole('button', { name: 'Вікторина', ...exact });
  await quizChip.click();
  await expect.poll(() => quizChip.getAttribute('aria-pressed'), POLL).toBe('true');

  const who = new Map([[ids.get(host)!, 'host'], [ids.get(olya)!, 'olya'], [ids.get(petro)!, 'petro'], [ids.get(vira)!, 'vira']]);
  const events = async () => (await db.select().from(feedEvent)).filter((r) => who.has(r.userId));
  const describeEvent = (r: Awaited<ReturnType<typeof events>>[number]) =>
    r.data.kind === 'game'
      ? `game ${who.get(r.userId)} ${r.data.place} of ${r.data.of}`
      : r.data.kind === 'achievement'
        ? `achievement ${who.get(r.userId)} ${r.data.achievementId}`
        : `${r.kind} ${who.get(r.userId)}`;
  await expect
    .poll(async () => (await events()).map(describeEvent), { timeout: 15_000 })
    .toEqual(expect.arrayContaining(['game olya 1 of 2', 'game petro 2 of 2', 'achievement olya first_win']));
  const all = await events();
  const olyaGame = all.find((r) => r.kind === 'game' && who.get(r.userId) === 'olya')!;
  const petroGame = all.find((r) => r.kind === 'game' && who.get(r.userId) === 'petro')!;
  expect(olyaGame.key).toBe(`game:${olyaGame.gameId}:${ids.get(olya)!}`);
  expect(all.some((r) => r.key === `achievement:${ids.get(olya)!}:first_win`), 'the key of Оля’s first win').toBe(true);
  expect(all.filter((r) => who.get(r.userId) === 'vira'), 'Віра did not play').toEqual([]);
  const gameId = olyaGame.gameId!;

  // ── 4. Бейдж Петра: нові події Олі (гра й досягнення). ──
  await petro.goto(`${base}/quizzes`);
  const badgeCount = async () => Number(((await menuBadge(petro).textContent({ timeout: 500 }).catch(() => null)) ?? '').replace(/\D/g, '') || 0);
  await expect.poll(badgeCount, { timeout: 35_000 }).toBeGreaterThanOrEqual(2);
  expect(await petro.evaluate(FEED_BADGE_FITS_18A), 'p18a-badge').toEqual([]);
  await shot(petro, 'p18a-badge');

  // ── 5. Стрічка Петра: перемога й досягнення Олі, своя гра; бейдж гасне. ──
  await feedLink(petro).click();
  await petro.waitForURL(`${base}/feed`);
  const tab = petro.locator('.history-tabs a', { hasText: 'Події друзів' });
  await tab.waitFor();
  expect(await tab.getAttribute('aria-current')).toBe('page');
  const olyaWin = petro.locator('.feed-card.is-win', { hasText: OLYA });
  await olyaWin.waitFor();
  expect(await olyaWin.innerText()).toContain(`виграв(-ла) «${TITLE}»!`);
  await petro.locator('.feed-card', { hasText: OLYA }).filter({ hasText: 'отримав(-ла) досягнення «Перша перемога»' }).waitFor();
  const ownGame = petro.locator('.feed-card', { hasText: `зіграв(-ла) «${TITLE}» — 2 місце з 2` });
  await ownGame.waitFor();
  expect(await ownGame.locator('.feed-text strong').first().innerText()).toBe('Ти');
  expect(await ownGame.locator('.feed-like').count(), 'own event has a heart button').toBe(0);
  expect(await ownGame.evaluate((el) => el.classList.contains('is-win')), 'the second place looks like a win').toBe(false);
  await expect.poll(() => menuBadge(petro).count(), { timeout: 10_000 }).toBe(0);
  await expectPhoneFit(petro, 'p18a-feed-375');
  await petro.evaluate('window.scrollTo(0, 0)');

  // ── 6. ❤️ під грою Олі — той самий рядок player, що й ❤️ гравця на фіналі. ──
  const playerLikes = async () =>
    (await db.select().from(userLike)).filter((r) => r.kind === 'player' && r.gameId === gameId && r.userId === ids.get(petro) && r.targetUserId === ids.get(olya)).length;
  const heart = olyaWin.locator('.feed-like');
  expect(await heart.getAttribute('aria-pressed')).toBe('false');
  await olyaWin.getByRole('button', { name: 'Вподобати подію', ...exact }).click();
  await expect.poll(() => heart.getAttribute('aria-pressed'), POLL).toBe('true');
  expect((await heart.innerText()).replace(/\D/g, '')).toBe('1');
  expect(await heart.getAttribute('aria-label')).toBe('Прибрати вподобання');
  await expect.poll(playerLikes, POLL).toBe(1);
  await shot(petro, 'p18a-feed-liked');
  await olyaWin.getByRole('button', { name: 'Прибрати вподобання', ...exact }).click();
  await expect.poll(() => heart.getAttribute('aria-pressed'), POLL).toBe('false');
  await expect.poll(playerLikes, POLL).toBe(0);
  expect((await heart.innerText()).replace(/\D/g, '')).toBe('');
  await olyaWin.getByRole('button', { name: 'Вподобати подію', ...exact }).click();
  await expect.poll(() => heart.getAttribute('aria-pressed'), POLL).toBe('true');
  await expect.poll(playerLikes, POLL).toBe(1);
  // Своєї події не вподобати й через API.
  const self = await petro.request.post(`${base}/api/feed/${petroGame.id}/like`, { data: { liked: true } });
  expect(self.status(), 'Петро likes his own event').toBe(403);
  expect(await self.json()).toEqual({ error: 'like_self' });

  // ── 7. Стрічка Олі: гра Петра з ❤️, своя перемога з лічильником «❤️ 1» без кнопки. ──
  await olya.setViewportSize({ width: 375, height: 812 });
  await olya.goto(`${base}/feed`);
  const petroCard = olya.locator('.feed-card', { hasText: PETRO }).filter({ hasText: `зіграв(-ла) «${TITLE}» — 2 місце з 2` });
  await petroCard.waitFor();
  expect(await petroCard.getByRole('button', { name: 'Вподобати подію', ...exact }).count()).toBe(1);
  const ownWin = olya.locator('.feed-card.is-win', { hasText: `виграв(-ла) «${TITLE}»!` });
  await ownWin.waitFor();
  expect(await ownWin.locator('.feed-text strong').first().innerText()).toBe('Ти');
  expect(await ownWin.locator('.feed-like').count(), 'Оля can like her own win').toBe(0);
  expect(await ownWin.locator('.feed-like-count').innerText()).toBe('❤️ 1');
  await expectNoSideScroll(olya, 'p18a-feed-olya');

  // ── 8. Віра стежить за Петром лише в один бік: нічого не бачить і не вподобає. ──
  await vira.goto(`${base}/feed`);
  await vira.locator('.feed-empty').waitFor();
  expect(await vira.locator('.feed-card').count(), 'Віра sees events').toBe(0);
  const viraLike = await vira.request.post(`${base}/api/feed/${petroGame.id}/like`, { data: { liked: true } });
  expect(viraLike.status(), 'Віра likes Петро’s event').toBe(404);
  const viraPage = (await (await vira.request.get(`${base}/api/me/feed`)).json()) as { events: unknown[] };
  expect(viraPage.events, 'Віра’s feed through the API').toEqual([]);
  await expectNoSideScroll(vira, 'p18a-feed-vira');

  // ── 9. Ведучий: одна картка лайків Петра, без ❤️; подій Олі й Петра немає. ──
  await host.setViewportSize({ width: 375, height: 812 });
  await host.goto(`${base}/feed`);
  const likeCard = host.locator('.feed-card', { hasText: PETRO });
  await likeCard.first().waitFor();
  expect(await likeCard.count(), 'one likes card from Петро').toBe(1);
  expect(await likeCard.innerText()).toContain(`вподобав(-ла) 1 твоє запитання і твою вікторину у «${TITLE}»`);
  expect(await likeCard.locator('.feed-like, .feed-like-count').count(), 'a heart under a likes card').toBe(0);
  expect(await host.locator('.feed-card', { hasText: OLYA }).count(), 'the host sees Оля').toBe(0);
  expect(await host.locator('.feed-card', { hasText: 'місце з' }).count(), 'the host sees a game').toBe(0);
  await expectNoSideScroll(host, 'p18a-feed-host');

  // ── 10. Сторінки: 25 подій рівня Петра за 30 днів → 20 карток і «Показати ще», далі решта без повторів. ──
  const now = Date.now();
  await db.insert(feedEvent).values(
    Array.from({ length: 25 }, (_, i) => {
      const at = new Date(now - (i + 1) * 26 * 3_600_000);
      return { key: `level:${ids.get(petro)!}:${100 + i}`, userId: ids.get(petro)!, kind: 'level' as const, gameId: null, data: { kind: 'level' as const, level: 100 + i }, at, createdAt: at };
    }),
  );
  const visible = (await events()).filter((r) => who.get(r.userId) === 'olya' || who.get(r.userId) === 'petro').length;
  await olya.reload();
  await olya.locator('.feed-card').first().waitFor();
  expect(await olya.locator('.feed-card').count()).toBe(20);
  await olya.getByRole('button', { name: 'Показати ще', ...exact }).waitFor();
  const firstIds = await olya.locator('.feed-card').evaluateAll((cards) => cards.map((c) => c.getAttribute('data-id')));
  await click(olya, 'Показати ще');
  await expect.poll(() => olya.getByRole('button', { name: 'Показати ще', ...exact }).count(), POLL).toBe(0);
  const allIds = await olya.locator('.feed-card').evaluateAll((cards) => cards.map((c) => c.getAttribute('data-id')));
  expect(allIds.length, 'the second page').toBeGreaterThan(20);
  expect(allIds.length, 'the second page').toBeLessThanOrEqual(40);
  expect(allIds.slice(0, 20)).toEqual(firstIds);
  expect(new Set(allIds).size, 'repeated cards').toBe(allIds.length);
  expect(allIds.every((id) => id !== null && id !== '')).toBe(true);
  // Усі події Олі й Петра плюс картки лайків Олі (Петро вподобав її як гравця).
  const likeCards = allIds.filter((id) => id!.startsWith('like:')).length;
  expect(likeCards, 'Оля’s likes card from Петро').toBe(1);
  // `visible` assumes every seeded event lies inside the 30/90-day retention window.
  expect(allIds.length - likeCards, 'events of Оля and Петро').toBe(visible);
  await expectPhoneFit(olya, 'p18a-feed-more');

  expect(problems).toEqual([]);
}

it('part 18a: feed — the seventh menu item fits 360 and 375 px, Оля and Петро as mutual friends see each other’s game, win and achievement, Віра who only follows Петро sees none of it, the badge counts new events and clears on opening, a heart under Петро’s game is the final screen’s player like, likes to the author show as one card, and «Показати ще» pages on', async () => {
  try {
    await feed18a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

function calendarQuestions19a() {
  const common = { imageUrl: null, video: null, timeLimit: 20, points: 100 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  return [
    { ...common, id: 'c1', type: 'single' as const, text: 'Яка річка тече через Київ?', options: options('Дніпро', 'Дністер', 'Південний Буг', 'Десна'), correctId: 'a' },
    { ...common, id: 'c2', type: 'boolean' as const, text: 'Говерла — найвища гора України?', correct: true },
    { ...common, id: 'c3', type: 'boolean' as const, text: 'Одеса — столиця України?', correct: false },
  ];
}

/** Календар на телефоні (19a): дві вкладки в одному рядку, бейдж вкладки не налазить на текст, кнопки не нижчі за 44 px, без прокрутки вбік. */
const CALENDAR_FITS_19A = `(() => {
  const bad = [];
  const tabs = [...document.querySelectorAll('.history-tabs a')];
  if (tabs.length !== 2) bad.push('tabs: ' + tabs.length);
  if (new Set(tabs.map((a) => Math.round(a.getBoundingClientRect().top))).size > 1) bad.push('the tabs are not in one row');
  for (const a of tabs) {
    if (a.scrollWidth > a.clientWidth) bad.push('a tab is wider than itself');
    const badge = a.querySelector('.menu-badge');
    if (!badge) continue;
    const b = badge.getBoundingClientRect();
    const r = a.getBoundingClientRect();
    if (b.left < r.left - 0.5 || b.right > r.right + 0.5) bad.push('the badge leaves its tab');
    const text = document.createRange();
    text.selectNodeContents(a.firstChild);
    const t = text.getBoundingClientRect();
    if (t.width > 0 && b.left < t.right - 0.5 && t.left < b.right - 0.5 && b.top < t.bottom && t.top < b.bottom) bad.push('the badge covers the tab text');
  }
  for (const el of document.querySelectorAll('.calendar-card button, .calendar-card a.button, .calendar-form button')) {
    const r = el.getBoundingClientRect();
    if (r.height < 43.5) bad.push('a short button: ' + el.textContent + ' ' + r.height.toFixed(1));
    if (r.right > innerWidth + 0.5 || r.left < -0.5) bad.push('a button leaves the phone: ' + el.textContent);
  }
  for (const el of document.querySelectorAll('.calendar-card')) {
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 0.5 || el.scrollWidth > el.clientWidth + 1) bad.push('a card is clipped');
  }
  if (document.documentElement.scrollWidth > innerWidth) bad.push('horizontal scroll');
  return bad;
})()`;

async function calendar19a() {
  const KYIV = 'Europe/Kyiv';
  const TITLE = 'Календар 19a';
  const EVENT = 'Вечір загадок';
  const SPARE = 'Запасний вечір';
  const MISSED = 'Не відбулась 19a';
  const kyivDate = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: KYIV }).format(ms);
  // «Завтра» — від сьогоднішньої дати за Києвом плюс день у UTC-арифметиці дат (без +24 год: зміна часу її ламає).
  const [ky, km, kd] = kyivDate(Date.now()).split('-').map(Number) as [number, number, number];
  const kyivDay = (plus: number) => Date.UTC(ky, km - 1, kd + plus, 12);
  const tomorrow = new Date(kyivDay(1)).toISOString().slice(0, 10);
  const afterTomorrow = new Date(kyivDay(2)).toISOString().slice(0, 10);
  const monthOf = (ms: number) => new Intl.DateTimeFormat('uk-UA', { timeZone: KYIV, month: 'long' }).format(ms);
  const clock = (value: Date) => new Intl.DateTimeFormat('uk-UA', { timeZone: KYIV, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);

  const olya = await open('olya19a', 375, 812, { timezoneId: KYIV });
  await register(olya, 'menu', 'Оля Календарна', 'olya19a@example.com');
  const petro = await open('petro19a', 375, 812, { timezoneId: KYIV });
  await register(petro, 'menu', 'Петро Календарний', 'petro19a@example.com');
  const vira = await open('vira19a', 375, 812, { timezoneId: KYIV });
  await register(vira, 'menu', 'Віра Слухачка', 'vira19a@example.com');
  const host = await open('host19a', 1280, 800, { timezoneId: KYIV });
  await register(host, 'host', 'Марко Ведучий', 'host19a@example.com');
  const ids = new Map<Page, string>();
  for (const page of [host, olya, petro, vira]) ids.set(page, await myId(page));
  for (const [page, nickname] of [[host, 'Марко Ведучий К'], [olya, 'Оля Календарна'], [petro, 'Петро Календарний'], [vira, 'Віра Календарна']] as const) {
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
  }
  const tabLink = (page: Page) => page.locator('.history-tabs a', { hasText: 'Календар' });
  const tabBadge = async (page: Page) => (await tabLink(page).locator('.menu-badge').textContent({ timeout: 500 }).catch(() => null)) ?? null;
  const feedLink = (page: Page) => page.locator(MENU).getByRole('link', { name: /^Стрічка/ });
  const menuBadge = (page: Page) => feedLink(page).locator('.menu-badge');
  const card = (page: Page, title: string) => page.locator('.calendar-card', { hasText: title });
  const apiBadge = async (page: Page) => {
    const b = (await (await page.request.get(`${base}/api/me/feed/badge`)).json()) as { requests: number; decisions: number };
    return b.requests + b.decisions;
  };
  /** Перезавантажити й дочекатися першої відповіді бейджа (та кадру після неї): лише тоді «бейджа немає» щось означає. */
  const reloadWithBadge = async (page: Page) => {
    const answered = page.waitForResponse((r) => r.url().endsWith('/api/me/feed/badge') && r.request().method() === 'GET');
    await page.reload();
    const response = await answered;
    expect(response.ok(), 'the badge answers').toBe(true);
    // Тіло читаємо окремим запитом: тіло відповіді старого документа після перезавантаження браузер уже не віддає.
    const body = (await (await page.request.get(`${base}/api/me/feed/badge`)).json()) as { requests: number; decisions: number };
    await page.evaluate(() => new Promise((resolve) => setTimeout(() => resolve(null), 50)));
    return body.requests + body.decisions;
  };
  /** Опитування бейджа раз на 30 с: перезавантажуємо сторінку, доки вкладка не покаже очікуване. */
  const reloadUntilTab = (page: Page, expected: string) =>
    expect
      .poll(
        async () => {
          await page.reload();
          await tabLink(page).waitFor();
          await page.waitForTimeout(700);
          return tabBadge(page);
        },
        { timeout: 40_000, interval: 2500 },
      )
      .toBe(expected);

  // ── 1. Меню: п'ять пунктів на 360 і 375 px. ──
  await olya.goto(base);
  await feedLink(olya).waitFor();
  expect(await menuLinks(olya)).toEqual(MENU_ITEMS_23A);
  for (const width of [360, 375]) await expectFiveItems(olya, width);

  // ── 2. Дружба: Марко → Оля, Марко → Петро, Віра → Марко (в один бік), Оля → Марко (взаємно). ──
  const follow = async (page: Page, target: Page) => {
    await page.goto(`${base}/profile/${ids.get(target)!}`);
    await page.getByRole('button', { name: 'Додати в друзі', ...exact }).click();
    await page.getByText('У друзях', exact).waitFor();
  };
  await follow(host, olya);
  await follow(host, petro);
  await follow(vira, host);
  await follow(olya, host);
  const data = {
    ...makeRoundsQuiz([classicRound('r1', calendarQuestions19a() as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]),
    title: TITLE,
  };
  const created = await host.request.post(`${base}/api/quizzes`, { data });
  expect(created.ok(), await created.text()).toBe(true);

  // ── 3. План: «Вечір загадок» завтра о 19:00 за Києвом. ──
  const plan = async (title: string, date: string, time: string) => {
    await click(host, 'Запланувати гру');
    await field(host, 'Назва').fill(title);
    await field(host, 'Дата й час').fill(`${date}T${time}`);
    await host.locator('.calendar-form select').selectOption({ label: TITLE });
    await click(host, 'Зберегти');
    await card(host, title).waitFor();
  };
  await host.goto(`${base}/feed`);
  await host.locator('.history-tabs a', { hasText: 'Календар' }).click();
  await host.waitForURL(`${base}/feed/calendar`);
  await plan(EVENT, tomorrow, '19:00');
  const dayHeading = host.locator('section.calendar-day', { has: card(host, EVENT) }).locator('h2');
  expect((await dayHeading.textContent())!.toLowerCase()).toContain(monthOf(kyivDay(1)));
  expect(await card(host, EVENT).locator('.calendar-when').innerText()).toContain('19:00');
  const eventRow = async () => (await db.select().from(calendarEvent)).find((r) => r.title === EVENT);
  await expect.poll(async () => (await eventRow()) !== undefined, POLL).toBe(true);
  const eventId = (await eventRow())!.id;
  expect(clock((await eventRow())!.startsAt), 'starts_at is 19:00 Kyiv time').toBe('19:00');
  await expect
    .poll(async () => (await db.select().from(feedEvent)).some((r) => r.key === `planned:${eventId}` && r.userId === ids.get(host)), POLL)
    .toBe(true);
  await shot(host, 'p19a-host-calendar');

  // ── 4. Друзі бачать, Віра (стежить в один бік) — ні. ──
  await olya.setViewportSize({ width: 375, height: 812 });
  await olya.goto(`${base}/feed`);
  const planned = olya.locator('.feed-card', { hasText: 'запланував(-ла)' });
  await planned.waitFor();
  const plannedText = await planned.innerText();
  expect(plannedText).toContain('Марко Ведучий');
  expect(plannedText).toContain(`запланував(-ла) «${EVENT}» на`);
  expect(plannedText).toMatch(/, 19:00/);
  await shot(olya, 'p19a-olya-feed');
  await planned.getByRole('link', { name: 'До календаря', ...exact }).click();
  await olya.waitForURL(`${base}/feed/calendar#event-${eventId}`);
  await card(olya, EVENT).waitFor();
  await vira.goto(`${base}/feed/calendar`);
  await vira.locator('.feed-empty').waitFor();
  expect(await vira.locator('.calendar-card').count(), 'Віра sees an event').toBe(0);
  await vira.goto(`${base}/feed`);
  await vira.locator('.feed-empty').waitFor();
  expect(await vira.locator('.feed-card', { hasText: 'запланував(-ла)' }).count(), 'Віра sees a planned card').toBe(0);
  const viraCalendar = (await (await vira.request.get(`${base}/api/me/calendar`)).json()) as { events: unknown[] };
  expect(viraCalendar.events, 'Віра’s calendar API').toEqual([]);
  const viraFeed = (await (await vira.request.get(`${base}/api/me/feed`)).json()) as { events: { data: { kind: string } }[] };
  expect(viraFeed.events.filter((e) => e.data.kind === 'planned'), 'Віра’s feed API has planned cards').toEqual([]);
  const viraAsk = await vira.request.post(`${base}/api/calendar/${eventId}/request`);
  expect(viraAsk.status(), 'Віра asks for a friend’s event').toBe(404);

  // ── 5. Запити: Оля просить, скасовує, просить знову; Петро просить. ──
  await olya.goto(`${base}/feed/calendar`);
  await card(olya, EVENT).waitFor();
  await click(olya, 'Хочу взяти участь');
  await card(olya, EVENT).getByText('Запит надіслано', exact).waitFor();
  await click(olya, 'Скасувати запит');
  await card(olya, EVENT).getByRole('button', { name: 'Хочу взяти участь', ...exact }).waitFor();
  await click(olya, 'Хочу взяти участь');
  await card(olya, EVENT).getByText('Запит надіслано', exact).waitFor();
  await petro.goto(`${base}/feed/calendar`);
  await card(petro, EVENT).waitFor();
  await click(petro, 'Хочу взяти участь');
  await card(petro, EVENT).getByText('Запит надіслано', exact).waitFor();
  await host.goto(`${base}/feed/calendar`);
  await reloadUntilTab(host, '2');
  await host.setViewportSize({ width: 375, height: 812 });
  await card(host, EVENT).locator('.calendar-request').nth(1).waitFor();
  expect(await host.evaluate(CALENDAR_FITS_19A), 'p19a-host-requests').toEqual([]);
  await shot(host, 'p19a-host-requests');
  await host.setViewportSize({ width: 1280, height: 800 });
  const requestRow = (page: Page, name: string) => card(page, EVENT).locator('.calendar-request', { hasText: name });
  await requestRow(host, 'Оля').getByRole('button', { name: 'Підтвердити', ...exact }).click();
  await requestRow(host, 'Оля').getByText('Підтверджено', exact).waitFor();
  await requestRow(host, 'Петро').getByRole('button', { name: 'Відхилити', ...exact }).click();
  await requestRow(host, 'Петро').getByText('Відхилено', exact).waitFor();
  await expect.poll(() => apiBadge(host), POLL).toBe(0);
  expect(await reloadWithBadge(host), 'the host’s badge answer after the decisions').toBe(0);
  await card(host, EVENT).waitFor();
  expect(await tabBadge(host), 'the host’s tab badge after the decisions').toBeNull();

  // ── 6. Рішення. ──
  await olya.goto(`${base}/quizzes`);
  await expect
    .poll(
      async () => {
        await olya.reload();
        await feedLink(olya).waitFor();
        await olya.waitForTimeout(700);
        return Number(((await menuBadge(olya).textContent({ timeout: 500 }).catch(() => null)) ?? '').replace(/\D/g, '') || 0);
      },
      { timeout: 40_000, interval: 2500 },
    )
    .toBeGreaterThanOrEqual(1);
  await feedLink(olya).click();
  await olya.waitForURL(`${base}/feed`);
  await olya.locator('.history-tabs a', { hasText: 'Календар' }).click();
  await olya.waitForURL(`${base}/feed/calendar`);
  await card(olya, EVENT).getByText('Підтверджено', exact).waitFor();
  await expect.poll(() => apiBadge(olya), POLL).toBe(0);
  expect(await reloadWithBadge(olya), 'Оля’s badge answer after seeing the decision').toBe(0);
  await card(olya, EVENT).waitFor();
  expect(await tabBadge(olya), 'Оля’s tab badge after seeing the decision').toBeNull();
  await petro.reload();
  await card(petro, EVENT).getByText('Відхилено', exact).waitFor();
  expect(await card(petro, EVENT).getByRole('button', { name: 'Хочу взяти участь', ...exact }).count(), 'Петро can ask again').toBe(0);
  expect(await olya.evaluate(CALENDAR_FITS_19A), 'p19a-olya-approved').toEqual([]);
  await expectPhoneFit(olya, 'p19a-olya-approved');

  // ── 7. Зміна: 20:30 запалює бейдж Олі. ──
  await click(host, 'Змінити');
  await field(host, 'Дата й час').fill(`${tomorrow}T20:30`);
  await click(host, 'Зберегти');
  await card(host, EVENT).getByText('Змінено', exact).waitFor();
  await olya.goto(`${base}/feed`);
  await reloadUntilTab(olya, '1');
  await tabLink(olya).click();
  await olya.waitForURL(`${base}/feed/calendar`);
  await card(olya, EVENT).getByText('Змінено', exact).waitFor();
  expect(await card(olya, EVENT).locator('.calendar-when').innerText()).toContain('20:30');
  expect(await card(olya, EVENT).getByText('Підтверджено', exact).count()).toBe(1);
  expect(await olya.evaluate(CALENDAR_FITS_19A), 'p19a-olya-edited').toEqual([]);

  // ── 8. Гра з події. ──
  await click(host, 'Відкрити гру');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  await expect.poll(async () => (await eventRow())?.gameCode, POLL).toBe(code);
  const stage = await open('stage19a', 1280, 720, { timezoneId: KYIV });
  await stage.goto((await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
  const olyaList = (await (await olya.request.get(`${base}/api/me/calendar`)).json()) as { events: { id: string; joinCode: string | null }[] };
  expect(olyaList.events.find((e) => e.id === eventId)?.joinCode, 'Оля gets the code once open').toBe(code);
  await olya.goto(`${base}/feed/calendar`);
  await card(olya, EVENT).getByRole('link', { name: 'Приєднатися', ...exact }).click();
  await olya.waitForURL(`${base}/play/${code}`);
  const input = field(olya, 'Ваше ім’я');
  await input.fill('Оля');
  if ((await input.inputValue()) !== 'Оля') await input.fill('Оля');
  await click(olya, 'Увійти в гру');
  await olya.getByText('Ви в грі. Чекаємо на старт.').waitFor();
  await petro.goto(`${base}/feed/calendar`);
  await card(petro, EVENT).getByText('Гра йде', exact).waitFor();
  expect(await card(petro, EVENT).getByRole('link', { name: 'Приєднатися', ...exact }).count(), 'Петро has a join link').toBe(0);
  expect(await card(petro, EVENT).innerText()).not.toContain(code);
  const petroList = (await (await petro.request.get(`${base}/api/me/calendar`)).json()) as { events: { joinCode?: string | null }[] };
  expect(petroList.events.map((e) => e.joinCode ?? null), 'Петро gets no code').toEqual([null]);
  await join(petro, code, 'Петро', false);
  // Друга вкладка ведучого: «До пульта» веде в ту саму кімнату.
  const host2 = await host.context().newPage();
  await host2.goto(`${base}/feed/calendar`);
  await card(host2, EVENT).waitFor();
  await host2.getByRole('button', { name: 'До пульта', ...exact }).click();
  await host2.waitForURL(`${base}/host/${code}`);
  expect((await eventRow())!.gameCode, 'the same room').toBe(code);
  await host2.close();
  await host.getByText('Петро', exact).first().waitFor();
  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  const answer = async (page: Page, text: string) => {
    const button = text === 'Так' || text === 'Ні' ? page.getByRole('button', { name: text, ...exact }) : page.getByRole('button', { name: new RegExp(text) });
    await button.waitFor();
    await button.click();
  };
  const phones = [olya, petro];
  const toReveal = async (picks: [Page, string][]) => {
    for (const [page, text] of picks) await answer(page, text);
    await host.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
  };
  const toNext = async () => {
    await step('Далі');
    await step('Наступне запитання');
    await afterSplash(host, stage, ...phones);
  };
  await step('Почати гру');
  await afterSplash(host, stage, ...phones);
  await step('Почати раунд');
  await afterSplash(host, stage, ...phones);
  await toReveal([[olya, 'Дніпро'], [petro, 'Десна']]);
  await toNext();
  await toReveal([[olya, 'Так'], [petro, 'Ні']]);
  await toNext();
  await toReveal([[olya, 'Ні'], [petro, 'Так']]);
  await step('Завершити гру');
  await expect
    .poll(async () => (await db.select().from(gameRow).where(eq(gameRow.code, code)))[0]?.status, { timeout: 15_000 })
    .toBe('finished');
  await host.goto(`${base}/feed/calendar`);
  await card(host, EVENT).getByText('Зіграно', exact).waitFor();
  expect(await card(host, EVENT).getByRole('button', { name: 'Відкрити гру', ...exact }).count(), 'a played event opens again').toBe(0);

  // ── 9. Скасування: «Запасний вечір» післязавтра о 18:00. ──
  await plan(SPARE, afterTomorrow, '18:00');
  await olya.goto(`${base}/feed/calendar`);
  await card(olya, SPARE).waitFor();
  await card(olya, SPARE).getByRole('button', { name: 'Хочу взяти участь', ...exact }).click();
  await card(olya, SPARE).getByText('Запит надіслано', exact).waitFor();
  await host.reload();
  await card(host, SPARE).locator('.calendar-request', { hasText: 'Оля' }).getByRole('button', { name: 'Підтвердити', ...exact }).click();
  await card(host, SPARE).locator('.calendar-request', { hasText: 'Оля' }).getByText('Підтверджено', exact).waitFor();
  // Оля бачить підтвердження в календарі (позначено переглянутим): після скасування «1» — саме скасування, а не підтвердження.
  await olya.goto(`${base}/feed/calendar`);
  await card(olya, SPARE).getByText('Підтверджено', exact).waitFor();
  await expect.poll(() => apiBadge(olya), POLL).toBe(0);
  // Діалог підтвердження приймає обробник за замовчуванням з open(); тут перевіряємо його текст.
  const confirmShown = host.waitForEvent('dialog');
  await card(host, SPARE).getByRole('button', { name: 'Скасувати подію', ...exact }).click();
  const confirmDialog = await confirmShown;
  expect(confirmDialog.type()).toBe('confirm');
  expect(confirmDialog.message()).toBe(`Скасувати «${SPARE}»? Учасники побачать, що гри не буде.`);
  await expect.poll(async () => (await db.select().from(calendarEvent)).find((r) => r.title === SPARE)?.cancelledAt != null, POLL).toBe(true);
  await olya.goto(`${base}/feed`);
  await reloadUntilTab(olya, '1');
  const olyaFeed = (await (await olya.request.get(`${base}/api/me/feed`)).json()) as { events: { data: { kind: string; title?: string } }[] };
  expect(olyaFeed.events.some((e) => e.data.kind === 'planned' && e.data.title === EVENT), 'Оля’s feed API still has the first planned card').toBe(true);
  expect(olyaFeed.events.some((e) => e.data.title === SPARE), 'a cancelled event stays in the feed API').toBe(false);
  await olya.locator('.feed-card').first().waitFor();
  expect(await olya.locator('.feed-card', { hasText: SPARE }).count(), 'a cancelled event stays in the feed').toBe(0);
  await tabLink(olya).click();
  await olya.waitForURL(`${base}/feed/calendar`);
  await card(olya, SPARE).getByText('Скасовано', exact).waitFor();
  expect(await card(olya, SPARE).getByRole('button').count(), 'a cancelled event has buttons').toBe(0);
  expect(await olya.evaluate(CALENDAR_FITS_19A), 'p19a-cancelled').toEqual([]);
  await shot(olya, 'p19a-cancelled');
  await vira.goto(`${base}/feed/calendar`);
  await vira.locator('.feed-empty').waitFor();
  expect(await vira.locator('.calendar-card').count(), 'Віра sees the spare event').toBe(0);

  // ── 10. Не відбулась: подія без гри, що почалася 7 годин тому, зникає. ──
  await db.insert(calendarEvent).values({ hostId: ids.get(host)!, title: MISSED, quizId: null, startsAt: new Date(Date.now() - 7 * 3_600_000), createdAt: new Date() });
  await host.goto(`${base}/feed/calendar`);
  await card(host, EVENT).waitFor();
  expect(await card(host, MISSED).count(), 'a missed event is listed').toBe(0);

  expect(problems).toEqual([]);
}

it('part 19a: calendar — the menu keeps five items, the host plans a game for tomorrow 19:00 Kyiv time, friends see it in the calendar tab and the feed while a one-way follower does not, Оля asks and is approved, Петро is rejected, an edit lights the badge, the host opens the game from the event and Оля joins from «Приєднатися», the event ends as played, and a cancelled event shows as cancelled to its participant', async () => {
  try {
    await calendar19a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

function pushQuestions20a() {
  const common = { imageUrl: null, video: null, timeLimit: 20, points: 100 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  return [
    { ...common, id: 'p1', type: 'single' as const, text: 'Яка річка тече через Київ?', options: options('Дніпро', 'Дністер', 'Південний Буг', 'Десна'), correctId: 'a' },
    { ...common, id: 'p2', type: 'boolean' as const, text: 'Говерла — найвища гора України?', correct: true },
    { ...common, id: 'p3', type: 'boolean' as const, text: 'Львів стоїть на березі моря?', correct: false },
  ];
}

/** Підміна справжнього push-сервісу в браузері: підписка живе в localStorage, ключ — з аргументу subscribe. */
const fakePushSubscription = (name: string) => `(() => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/e2e-${name}';
  const make = (key) => ({
    endpoint,
    options: { applicationServerKey: new Uint8Array(key).buffer },
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'BPe2e', auth: 'aue2e' } }),
    unsubscribe: async () => {
      localStorage.removeItem('e2e-sub');
      localStorage['e2e-unsub'] = '1';
      return true;
    },
  });
  const stored = () => {
    const raw = localStorage.getItem('e2e-sub');
    return raw === null ? null : make(JSON.parse(raw));
  };
  PushManager.prototype.subscribe = async function (options) {
    const k = options.applicationServerKey;
    const bytes = ArrayBuffer.isView(k) ? new Uint8Array(k.buffer, k.byteOffset, k.byteLength) : new Uint8Array(k);
    localStorage.setItem('e2e-sub', JSON.stringify(Array.from(bytes)));
    return stored();
  };
  PushManager.prototype.getSubscription = async function () {
    return stored();
  };
})()`;

/** Телефон (20a): без прокрутки вбік, кнопки не нижчі за 44 px, блок «Сповіщення» не виходить за екран. */
const PHONE_FITS_20A = `(() => {
  const bad = [];
  for (const el of document.querySelectorAll('.push-settings button')) {
    if (el.getBoundingClientRect().height < 43.5) bad.push('a button is under 44 px');
  }
  for (const el of document.querySelectorAll('.push-settings')) {
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 0.5 || r.left < -0.5 || el.scrollWidth > el.clientWidth + 1) bad.push('the block is clipped');
  }
  if (document.documentElement.scrollWidth > innerWidth) bad.push('horizontal scroll');
  return bad;
})()`;

/** Web Push (20a): заглушка замість справжньої доставки, фейкові підписки в браузері, сервіс-воркер показує сповіщення. */
async function push20a() {
  const KYIV = 'Europe/Kyiv';
  const EVENT = 'Вечір над Дніпром';
  const SPARE = 'Запасний вечір';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const endpointOf = (name: string) => `https://fcm.googleapis.com/fcm/send/e2e-${name}`;
  const { publicKey } = webpush.generateVAPIDKeys();
  const outbox: { endpoint: string; payload: PushPayload; options: PushOptions }[] = [];
  const gone = new Set<string>();
  const send = async (target: { endpoint: string }, payload: string, options: PushOptions) => {
    outbox.push({ endpoint: target.endpoint, payload: JSON.parse(payload) as PushPayload, options });
    return { status: gone.has(target.endpoint) ? 410 : 201 };
  };
  const rows = () => db.select().from(pushSubscription);
  const sentTo = (kind: PushPayload['kind'], endpoint?: string) => outbox.filter((o) => o.payload.kind === kind && (endpoint === undefined || o.endpoint === endpoint));

  try {
    const olya = await open('olya20a', 375, 812, { timezoneId: KYIV, permissions: ['notifications'] });
    await olya.context().addInitScript({ content: fakePushSubscription('olya20a') });
    await register(olya, 'menu', 'Оля Сповіщена', 'olya20a@example.com');
    const petro = await open('petro20a', 375, 812, { timezoneId: KYIV, permissions: ['notifications'] });
    await petro.context().addInitScript({ content: fakePushSubscription('petro20a') });
    await register(petro, 'menu', 'Петро Сповіщений', 'petro20a@example.com');
    const ira = await open('ira20a', 375, 812, { timezoneId: KYIV, userAgent: IPHONE });
    await ira.context().addInitScript({ content: "delete window.PushManager; delete window.Notification;" });
    await register(ira, 'menu', 'Іра Айфонна', 'ira20a@example.com');
    const host = await open('host20a', 1280, 800, { timezoneId: KYIV });
    await register(host, 'host', 'Марко Ведучий', 'host20a@example.com');
    const ids = new Map<Page, string>();
    for (const page of [host, olya, petro]) ids.set(page, await myId(page));
    for (const [page, nickname] of [[host, 'Марко Сповіщувач'], [olya, 'Оля Пушова'], [petro, 'Петро Пушовий'], [ira, 'Іра']] as const) {
      const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname, avatar: null } });
      expect(saved.ok(), await saved.text()).toBe(true);
    }
    const follow = async (target: Page) => {
      await host.goto(`${base}/profile/${ids.get(target)!}`);
      await host.getByRole('button', { name: 'Додати в друзі', ...exact }).click();
      await host.getByText('У друзях', exact).waitFor();
    };
    await follow(olya);
    await follow(petro);
    const created = await host.request.post(`${base}/api/quizzes`, {
      data: { ...makeRoundsQuiz([classicRound('r1', pushQuestions20a() as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]), title: 'Пуші 20a' },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const quizId = ((await created.json()) as { id: string }).id;
    const notificationsHeading = (page: Page) => page.getByRole('heading', { name: 'Сповіщення', ...exact });

    // ── 1. Без ключів: ключа немає, блок «Сповіщення» прихований. ──
    expect(await (await olya.request.get(`${base}/api/push/key`)).json()).toEqual({ publicKey: null });
    const keyAnswered = olya.waitForResponse((r) => r.url().endsWith('/api/push/key'));
    await olya.goto(`${base}/profile/settings`);
    await keyAnswered;
    await olya.getByRole('button', { name: 'Вийти', ...exact }).waitFor();
    await olya.waitForTimeout(500);
    expect(await notificationsHeading(olya).count(), 'the block without keys').toBe(0);

    // ── 2. Пуші ввімкнено: новий сервер із ключем і заглушкою. ──
    flags.restarting = true;
    await ctx.shutdown();
    await relisten({ push: { publicKey, send } });
    flags.restarting = false;
    expect(await (await olya.request.get(`${base}/api/push/key`)).json()).toEqual({ publicKey });

    // ── 3. Меню: п'ять пунктів. ──
    await olya.goto(base);
    await olya.locator(MENU).getByRole('link', { name: /^Стрічка/ }).waitFor();
    expect(await menuLinks(olya)).toEqual(MENU_ITEMS_23A);
    for (const width of [360, 375]) await expectFiveItems(olya, width);

    // ── 4. Сервіс-воркер: без fetch, зареєстрований на /. ──
    const sw = await fetch(`${base}/sw.js`);
    expect(sw.status).toBe(200);
    expect(sw.headers.get('content-type')).toContain('javascript');
    const swText = await sw.text();
    expect(swText).toContain('notificationclick');
    expect(swText).not.toContain('addEventListener("fetch"');
    expect(swText).not.toContain("addEventListener('fetch'");
    await expect
      .poll(() => olya.evaluate(`navigator.serviceWorker.getRegistration().then((r) => r?.active?.scriptURL ?? null)`), { timeout: 10_000 })
      .toBe(`${base}/sw.js`);

    // ── 5. Оля й Петро вмикають, Марко — через API. ──
    const enable = async (page: Page, name: string, shotName?: string) => {
      await page.goto(`${base}/profile/settings`);
      await click(page, 'Увімкнути сповіщення');
      await page.getByText('Сповіщення увімкнено на цьому пристрої.', exact).waitFor();
      await expect.poll(async () => (await rows()).find((r) => r.endpoint === endpointOf(name))?.userId, POLL).toBe(ids.get(page));
      if (shotName !== undefined) await shot(page, shotName);
    };
    await enable(olya, 'olya20a', 'p20a-profile-on');
    expect(await olya.evaluate(PHONE_FITS_20A), 'p20a-profile-on').toEqual([]);
    await enable(petro, 'petro20a');
    const hostSaved = await host.request.post(`${base}/api/me/push`, {
      data: { endpoint: endpointOf('host20a'), expirationTime: null, keys: { p256dh: 'BPe2e', auth: 'aue2e' } },
    });
    expect(hostSaved.status(), await hostSaved.text()).toBeLessThan(300);
    await expect.poll(async () => (await rows()).find((r) => r.endpoint === endpointOf('host20a'))?.userId, POLL).toBe(ids.get(host));

    // ── 6. iPhone: лише підказка, кнопки немає. ──
    await ira.goto(`${base}/profile/settings`);
    await notificationsHeading(ira).waitFor();
    expect(await ira.locator('.push-settings').innerText()).toContain('На початковий екран');
    expect(await ira.getByRole('button', { name: 'Увімкнути сповіщення', ...exact }).count(), 'iPhone has a button').toBe(0);
    expect(await ira.evaluate(PHONE_FITS_20A), 'p20a-ios-hint').toEqual([]);
    await shot(ira, 'p20a-ios-hint');
    await ira.goto(`${base}/feed/calendar`);
    await ira.locator('.push-settings.is-compact').waitFor();
    expect(await ira.locator('.push-settings.is-compact').innerText()).toContain('На початковий екран');
    expect(await ira.getByRole('button', { name: 'Увімкнути сповіщення', ...exact }).count()).toBe(0);
    expect(await ira.evaluate(PHONE_FITS_20A), 'p20a-ios-calendar').toEqual([]);
    await shot(ira, 'p20a-ios-calendar');

    // ── 7. Подія: Оля просить, Петро просить; Марко підтверджує Олю, Петро лишається в очікуванні. ──
    // Спершу далеко від початку, щоб щохвилинний тікер не нагадав раніше за мій виклик; потім «через 50 хв».
    const later = (ms: number) => new Date(Date.now() + ms).toISOString();
    const planned = await host.request.post(`${base}/api/calendar`, { data: { title: EVENT, startsAt: later(3 * 3_600_000), quizId } });
    expect(planned.status(), await planned.text()).toBe(201);
    const eventId = ((await planned.json()) as { id: string }).id;
    await olya.goto(`${base}/feed/calendar`);
    const card = (page: Page, title: string) => page.locator('.calendar-card', { hasText: title });
    await card(olya, EVENT).waitFor();
    await click(olya, 'Хочу взяти участь');
    await card(olya, EVENT).getByText('Запит надіслано', exact).waitFor();
    const petroAsk = await petro.request.post(`${base}/api/calendar/${eventId}/request`);
    expect(petroAsk.ok(), await petroAsk.text()).toBe(true);
    const decide = async (userId: string, decision: 'approved' | 'rejected', event = eventId) => {
      const done = await host.request.post(`${base}/api/calendar/${event}/requests/${userId}`, { data: { decision } });
      expect(done.status(), await done.text()).toBe(204);
    };
    await decide(ids.get(olya)!, 'approved');
    const moved = await host.request.put(`${base}/api/calendar/${eventId}`, { data: { title: EVENT, startsAt: later(50 * 60_000), quizId } });
    expect(moved.ok(), await moved.text()).toBe(true);

    // ── 8. Нагадування за годину: ведучому й підтвердженій Олі, один раз. ──
    // Тікер міг устигнути першим (раз на хвилину): тоді повертається 0, а пуші все одно рівно по одному.
    const claimed = await ctx.push!.remindDue(new Date());
    expect(claimed).toBeLessThanOrEqual(1);
    await ctx.push!.idle();
    await expect.poll(() => sentTo('reminder').length, POLL).toBe(2);
    const reminders = sentTo('reminder');
    expect(reminders.map((o) => o.endpoint).sort(), 'reminder recipients').toEqual([endpointOf('host20a'), endpointOf('olya20a')]);
    const startsAt = (reminders[0]!.payload as { startsAt: string }).startsAt;
    for (const r of reminders) {
      expect(r.payload).toEqual({ kind: 'reminder', eventId, title: EVENT, startsAt, locale: expect.any(String) });
      expect(r.options.ttl).toBe(3600);
    }
    const before = outbox.length;
    expect(await ctx.push!.remindDue(new Date()), 'a second reminder').toBe(0);
    await ctx.push!.idle();
    expect(outbox.length).toBe(before);

    // ── 9. «Відкрити гру»: пуш із кодом лише підтвердженій Олі. ──
    await host.goto(`${base}/feed/calendar`);
    await card(host, EVENT).waitFor();
    await click(host, 'Відкрити гру');
    await host.waitForURL(/\/host\/\d{6}$/);
    const code = host.url().slice(-6);
    await expect.poll(() => sentTo('opened').length, POLL).toBe(1);
    await ctx.push!.idle();
    const openedPush = sentTo('opened');
    expect(openedPush.map((o) => o.endpoint), 'opened recipients').toEqual([endpointOf('olya20a')]);
    expect(openedPush[0]!.payload).toEqual({ kind: 'opened', eventId, title: EVENT, code, locale: expect.any(String) });
    expect(openedPush[0]!.options.ttl).toBe(21_600);

    // ── 10. Сервіс-воркер показує українське сповіщення. ──
    const cdp = await olya.context().newCDPSession(olya);
    const registrationId = new Promise<string>((done) => {
      cdp.on('ServiceWorker.workerRegistrationUpdated', (event: { registrations: { registrationId: string; scopeURL: string }[] }) => {
        const found = event.registrations.find((r) => r.scopeURL === `${base}/`);
        if (found !== undefined) done(found.registrationId);
      });
    });
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: base, registrationId: await registrationId, data: JSON.stringify(openedPush[0]!.payload) });
    await expect
      .poll(() => olya.evaluate(`navigator.serviceWorker.ready.then((r) => r.getNotifications()).then((list) => list.map((n) => n.title))`), { timeout: 10_000 })
      .toContain('Гра «Вечір над Дніпром» почалась');
    await cdp.send('ServiceWorker.disable').catch(() => undefined);

    // ── 11. Скасування й 410. ──
    const kyivNow = new Intl.DateTimeFormat('en-CA', { timeZone: KYIV }).format(Date.now()).split('-').map(Number) as [number, number, number];
    const spareStart = new Date(Date.UTC(kyivNow[0], kyivNow[1] - 1, kyivNow[2] + 2, 12)).toISOString();
    const spare = await host.request.post(`${base}/api/calendar`, { data: { title: SPARE, startsAt: spareStart, quizId } });
    expect(spare.status(), await spare.text()).toBe(201);
    const spareId = ((await spare.json()) as { id: string }).id;
    for (const page of [olya, petro]) {
      const asked = await page.request.post(`${base}/api/calendar/${spareId}/request`);
      expect(asked.ok(), await asked.text()).toBe(true);
    }
    await decide(ids.get(petro)!, 'approved', spareId);
    gone.add(endpointOf('petro20a'));
    await host.goto(`${base}/feed/calendar`);
    await card(host, SPARE).getByRole('button', { name: 'Скасувати подію', ...exact }).click();
    await expect.poll(() => sentTo('cancelled').length, POLL).toBe(2);
    expect(sentTo('cancelled').map((o) => o.endpoint).sort(), 'cancel recipients').toEqual([endpointOf('olya20a'), endpointOf('petro20a')]);
    expect(sentTo('cancelled')[0]!.payload).toMatchObject({ kind: 'cancelled', eventId: spareId, title: SPARE });
    expect(sentTo('cancelled')[0]!.options.ttl).toBe(86_400);
    await expect.poll(async () => (await rows()).some((r) => r.endpoint === endpointOf('petro20a')), POLL).toBe(false);
    expect((await rows()).some((r) => r.endpoint === endpointOf('olya20a')), 'Оля keeps her subscription').toBe(true);

    // ── 12. Чужа підписка не видаляється. ──
    const foreign = await petro.request.delete(`${base}/api/me/push`, { data: { endpoint: endpointOf('olya20a') } });
    expect(foreign.status()).toBe(204);
    expect((await rows()).some((r) => r.endpoint === endpointOf('olya20a')), 'foreign delete').toBe(true);

    // ── 13. Вихід прибирає підписку пристрою. ──
    await olya.goto(`${base}/profile/settings`);
    await click(olya, 'Вийти');
    await olya.waitForURL(`${base}/`);
    await expect.poll(async () => (await rows()).some((r) => r.endpoint === endpointOf('olya20a')), POLL).toBe(false);
    expect(await olya.evaluate(`localStorage['e2e-unsub']`)).toBe('1');

    expect(problems).toEqual([]);
  } finally {
    flags.restarting = true;
    await ctx.shutdown();
    await relisten();
    flags.restarting = false;
  }
}

it('part 20a: web push — without VAPID keys the notifications block is hidden; with keys Оля and Петро enable notifications, an iPhone tab sees the home-screen hint, the one-hour reminder goes once to the host and the approved friend, «game opened» carries the room code to the approved friend only, a cancel reaches those who asked, a 410 drops a subscription, sign-out removes the device subscription, and the menu keeps five items', async () => {
  try {
    await push20a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Адмінка (21a): лише підтверджений акаунт з ADMIN_EMAILS; решті — простий 404. */
async function admin21a() {
  const ADMIN_EMAIL = 'admin21a@example.com';
  const BAN_QUIZ = 'Бан 21a';
  const KEEP_QUIZ = 'Карпати 21a';
  const CITY = 'Яке місто — столиця України?';
  const SEA = 'Одеса стоїть на Чорному морі?';
  const PRIZE = 'Кубок 21a';
  const PASSWORD = 'correct horse battery';

  flags.banExpected = true;
  try {
    // ── 1. Сервер з адміном і троє людей. ──
    flags.restarting = true;
    await ctx.shutdown();
    await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }) });
    flags.restarting = false;
    const admin = await open('admin21a', 375, 812);
    await register(admin, 'menu', 'Адмін 21a', ADMIN_EMAIL);
    const olya = await open('olya21a', 375, 812);
    await register(olya, 'menu', 'Оля 21a', 'olya21a@example.com');
    const bohdan = await open('bohdan21a', 1280, 800);
    await register(bohdan, 'menu', 'Богдан 21a', 'bohdan21a@example.com');
    for (const [page, nickname] of [[admin, 'Адмін 21a'], [olya, 'Оля 21a'], [bohdan, 'Богдан 21a']] as const) {
      const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname, avatar: null } });
      expect(saved.ok(), await saved.text()).toBe(true);
    }
    await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
    const bohdanId = await myId(bohdan);

    // ── 2. Не-адмін: простий 404 скрізь, «Адмінки» в профілі немає. ──
    const hidden = await olya.request.get(`${base}/api/admin/stats`);
    expect(hidden.status()).toBe(404);
    const hiddenBody = await hidden.json();
    expect(hiddenBody).toEqual({ error: 'not_found' });
    const unknown = await olya.request.get(`${base}/api/nope`);
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toEqual(hiddenBody);
    await olya.goto(`${base}/admin`);
    await expect.poll(() => new URL(olya.url()).pathname, POLL).toBe('/');
    await olya.goto(`${base}/profile/settings`);
    await olya.getByRole('button', { name: 'Вийти', ...exact }).waitFor();
    expect(await olya.getByRole('link', { name: 'Адмінка', ...exact }).count()).toBe(0);
    const olyaMe = (await (await olya.request.get(`${base}/api/me`)).json()) as { admin: boolean };
    expect(olyaMe.admin).toBe(false);

    // ── 3. Підготовка Богдана. ──
    const questions = [
      { ...single, id: 'q1', text: CITY, options: [{ id: 'a', text: 'Київ' }, { id: 'b', text: 'Львів' }, { id: 'c', text: 'Одеса' }], correctId: 'a' },
      { ...boolQ, id: 'q2', text: SEA, correct: true },
    ];
    const banQuiz = { ...makeRoundsQuiz([classicRound('r1', questions as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]), title: BAN_QUIZ };
    const keepQuiz = {
      ...makeRoundsQuiz([classicRound('r1', [{ ...boolQ, id: 'q1', text: 'Говерла нижча за Петрос?', correct: false }] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]),
      title: KEEP_QUIZ,
    };
    for (const data of [banQuiz, keepQuiz]) {
      const created = await bohdan.request.post(`${base}/api/quizzes`, { data });
      expect(created.ok(), await created.text()).toBe(true);
    }
    const prized = await bohdan.request.post(`${base}/api/me/prizes`, {
      data: { name: PRIZE, trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false },
    });
    expect(prized.status(), await prized.text()).toBe(201);
    await bohdan.goto(`${base}/quizzes`);
    await bohdan.locator('.quiz-list li', { hasText: BAN_QUIZ }).getByRole('button', { name: 'Грати', ...exact }).click();
    await bohdan.waitForURL(/\/host\/\d{6}$/);
    const code = bohdan.url().slice(-6);
    await join(olya, code, 'Оля', false);
    expect((await olya.request.put(`${base}/api/me/friends/${bohdanId}`)).ok()).toBe(true);
    expect((await olya.request.get(`${base}/api/profiles/${bohdanId}`)).status()).toBe(200);

    // ── 4. Адмін входить: статистика, меню з семи пунктів. ──
    await admin.goto(`${base}/profile/settings`);
    await admin.getByRole('link', { name: 'Адмінка', ...exact }).click();
    await admin.waitForURL(`${base}/admin`);
    await admin.getByText('Користувачів усього', exact).waitFor();
    await admin.getByText('Живих ігор зараз', exact).waitFor();
    expect(await menuLinks(admin)).toEqual(MENU_ITEMS_23A);
    for (const width of [360, 375]) await expectFiveItems(admin, width);
    expect(await noSideScroll(admin)).toBe(true);
    const tabs = admin.locator('.admin-tabs a');
    expect(await tabs.count()).toBe(4);
    for (let i = 0; i < 4; i++) expect((await tabs.nth(i).boundingBox())!.height, `tab ${i}`).toBeGreaterThanOrEqual(44);
    await shot(admin, 'p21a-stats');

    // ── 5. Пошук і бан. ──
    const tab = (name: string) => admin.locator('.admin-tabs').getByRole('link', { name, ...exact });
    await tab('Користувачі').click();
    await field(admin, 'Пошук за ніком чи email').fill('Богдан 21a');
    await click(admin, 'Шукати');
    await admin.locator('.admin-card', { hasText: 'bohdan21a@example.com' }).getByRole('link', { name: 'Богдан 21a', ...exact }).click();
    await admin.waitForURL(`${base}/admin/users/${bohdanId}`);
    await field(admin, 'Причина (бачать лише адміни)').fill('спам');
    await click(admin, 'Заблокувати');
    await admin.locator('.admin-mark.is-banned').waitFor();
    expect(await noSideScroll(admin)).toBe(true);
    expect((await admin.getByRole('button', { name: 'Розблокувати', ...exact }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await shot(admin, 'p21a-banned');
    await olya.getByText('Цієї гри вже немає', { exact: false }).waitFor();
    expect((await bohdan.request.get(`${base}/api/me`)).status()).toBe(401);
    await bohdan.goto(`${base}/login`);
    await field(bohdan, 'Email').fill('bohdan21a@example.com');
    await field(bohdan, 'Пароль').fill(PASSWORD);
    await click(bohdan, 'Увійти');
    await bohdan.getByRole('alert').filter({ hasText: 'Акаунт заблоковано.' }).waitFor();
    await shot(bohdan, 'p21a-login-banned');
    expect((await olya.request.get(`${base}/api/profiles/${bohdanId}`)).status()).toBe(404);
    const friends = await olya.request.get(`${base}/api/me/friends`);
    expect(JSON.stringify(await friends.json())).not.toContain(bohdanId);

    // ── 6. Видалення запитання, потім вікторини. ──
    await tab('Вікторини').click();
    await field(admin, 'Пошук за назвою чи автором').fill(BAN_QUIZ);
    await click(admin, 'Шукати');
    await admin.locator('.admin-card', { hasText: BAN_QUIZ }).getByRole('link', { name: 'Переглянути', ...exact }).click();
    const questionCard = (text: string) => admin.locator('.admin-card', { hasText: text });
    await questionCard(CITY).getByRole('button', { name: 'Видалити запитання', ...exact }).click();
    await questionCard(CITY).waitFor({ state: 'detached' });
    expect(await questionCard(SEA).getByRole('button', { name: 'Видалити запитання', ...exact }).isDisabled()).toBe(true);
    await admin.getByText('Видали вікторину цілком', exact).waitFor();
    expect(await noSideScroll(admin)).toBe(true);
    await shot(admin, 'p21a-quiz');
    await click(admin, 'Видалити вікторину');
    await admin.waitForURL(`${base}/admin/quizzes`);
    await field(admin, 'Пошук за назвою чи автором').fill(BAN_QUIZ);
    await click(admin, 'Шукати');
    await admin.getByText('Нічого не знайдено.', exact).waitFor();
    expect(await db.select().from(quizRow).where(eq(quizRow.title, BAN_QUIZ))).toHaveLength(0);
    expect(await db.select().from(quizRow).where(eq(quizRow.title, KEEP_QUIZ))).toHaveLength(1);

    // ── 7. Приз зі складу. ──
    await admin.goto(`${base}/admin/users/${bohdanId}`);
    await admin.getByText(PRIZE, exact).waitFor();
    await click(admin, 'Видалити приз');
    await expect.poll(() => admin.getByText('Порожньо.', exact).count(), POLL).toBe(2);
    expect(await admin.getByText(PRIZE, exact).count()).toBe(0);

    // ── 8. Журнал: найновіше згори, без email. ──
    const logResponse = await admin.request.get(`${base}/api/admin/log`);
    expect(logResponse.status()).toBe(200);
    const logText = await logResponse.text();
    expect(logText).not.toContain(ADMIN_EMAIL);
    const { rows } = JSON.parse(logText) as { rows: { kind: string; admin: string; details: { reason?: string } }[] };
    expect(rows.slice(0, 4).map((r) => r.kind)).toEqual(['prize_delete', 'quiz_delete', 'question_delete', 'ban']);
    expect(rows[3]!.details.reason).toBe('спам');
    expect(rows[0]!.admin).toBe('Адмін 21a');
    await tab('Журнал').click();
    await admin.getByText('Адмін 21a заблокував(-ла) Богдан 21a. Причина: спам', exact).waitFor();
    expect(await noSideScroll(admin)).toBe(true);
    await shot(admin, 'p21a-log');

    // ── 9. Розбан. ──
    await admin.goto(`${base}/admin/users/${bohdanId}`);
    await click(admin, 'Розблокувати');
    await admin.getByRole('button', { name: 'Заблокувати', ...exact }).waitFor();
    await bohdan.goto(`${base}/login`);
    await field(bohdan, 'Email').fill('bohdan21a@example.com');
    await field(bohdan, 'Пароль').fill(PASSWORD);
    await click(bohdan, 'Увійти');
    await bohdan.locator(MENU).getByRole('link', { name: 'Профіль' }).waitFor();
    expect((await olya.request.get(`${base}/api/profiles/${bohdanId}`)).status()).toBe(200);

    expect(problems).toEqual([]);
  } finally {
    flags.banExpected = false;
    flags.restarting = true;
    await ctx.shutdown();
    await relisten();
    flags.restarting = false;
  }
}

it('part 21a: admin panel — only a verified ADMIN_EMAILS account sees «Адмінка» in the profile while /admin and /api/admin stay a plain 404 for others, the menu keeps five items, the admin sees stats, finds and bans Богдан whose lobby closes for Оля, whose sessions end and whose sign-in says «Акаунт заблоковано» while his profile is gone for Оля, deletes one question then the whole quiz and a stock prize, reads the log newest first, and unbans him so he signs in again', async () => {
  try {
    await admin21a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});
