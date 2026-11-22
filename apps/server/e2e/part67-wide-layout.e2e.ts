import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, multi, numeric, single, text } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { adminEmails } from '../src/config';
import { calendarEvent, user } from '../src/db/schema';
import { open, register, join, click, field, png29d, step27a, reveal28a, next27a, pilotPlayer, emitOk, myId, pickOption, expectPhoneFit } from './helpers/common';
import { exact, base, ARTIFACTS, shot, snapshot, afterSplash, useE2eServer, ctx, db, flags, relisten } from './helpers/setup';

/**
 * Наскрізні тести: частина 67 — адаптивна верстка для великих екранів (колонка сторінки, ПК 1920 і 1366, телефон 375 без змін).
 * Потребує зібраного клієнта (pnpm build) і встановленого Chrome; кадри — E2E_SHOTS=1.
 */

useE2eServer();

/** Три екрани 67: великий ПК, ноутбук, телефон. */
const SIZES_67 = [
  { tag: '1920', width: 1920, height: 1080 },
  { tag: '1366', width: 1366, height: 768 },
  { tag: '375', width: 375, height: 812 },
] as const;

/** Кадр лише видимої частини (що бачить людина): E2E_SHOTS=1. */
async function viewportShot67(page: Page, name: string) {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`) });
}

/** Кадр лише видимої частини (повний — лише з E2E_FULL=1); без бічної прокрутки на кожному розмірі. */
async function wide67(page: Page, name: string, check?: (size: (typeof SIZES_67)[number]) => Promise<void>) {
  for (const size of SIZES_67) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.evaluate('new Promise(requestAnimationFrame)');
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), `${name}-${size.tag}: horizontal scroll`).toBe(true);
    await check?.(size);
    await viewportShot67(page, `${name}-${size.tag}`);
    if (process.env.E2E_FULL === '1') await shot(page, `${name}-${size.tag}-full`);
  }
}

/** Ширина main (px) — для перевірок «на ПК колонка ширша за 736 px, на телефоні — як була». */
const mainWidth67 = (page: Page) => page.evaluate(`document.querySelector('main').getBoundingClientRect().width`) as Promise<number>;

/** Найдовший абзац прямо в main не ширший за 42 rem (672 px) плюс допуск. */
const paragraphWidth67 = (page: Page) =>
  page.evaluate(`Math.max(0, ...[...document.querySelectorAll('main > p')].map((el) => el.getBoundingClientRect().width))`) as Promise<number>;

async function shell67() {
  const page = await open('menu67', 1920, 1080);
  await register(page, 'menu', 'Оксана Широка', 'wide67@example.com');

  await page.goto(`${base}/`);
  await page.locator('main').waitFor();
  await wide67(page, 'shell67-home', async ({ tag }) => {
    if (tag === '375') expect(await mainWidth67(page), 'home 375').toBe(375);
    else expect(await mainWidth67(page), `home ${tag}`).toBeGreaterThan(736);
    expect(await paragraphWidth67(page), `home ${tag}: line length`).toBeLessThanOrEqual(672 + 1);
  });

  await page.goto(`${base}/quizzes`);
  await page.locator('main').waitFor();
  await wide67(page, 'shell67-quizzes', async ({ tag, width }) => {
    const main = await mainWidth67(page);
    if (tag === '375') expect(main, 'quizzes 375').toBe(375);
    else if (tag === '1366') expect(main, 'quizzes 1366').toBeGreaterThan(736);
    else {
      expect(main, 'quizzes 1920').toBeGreaterThan(1200);
      // 96 rem колонки й по 2,5 vw поля з боків.
      expect(main, 'quizzes 1920').toBeLessThanOrEqual(1536 + 2 * 48);
    }
    expect(main, `quizzes ${tag}`).toBeLessThanOrEqual(width);
  });

  // Без входу: «Вхід» лишається вузькою сторінкою на будь-якому екрані.
  const guest = await open('guest67', 1920, 1080);
  await guest.goto(`${base}/login`);
  await guest.locator('main').waitFor();
  await wide67(guest, 'shell67-login', async ({ tag }) => {
    expect(await mainWidth67(guest), `login ${tag}`).toBeLessThanOrEqual(544);
  });
}

it('part 67 shell: width tokens — on 1920 and 1366 the pages are far wider than the old 736 px column and the running text keeps 42 rem, on a 375 phone the column is exactly as before, the login page stays narrow everywhere, no side scroll', async () => {
  try {
    await shell67();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 300_000);

/** Три запитання для екрана гравця: текстові варіанти (один дуже довгий), варіанти-картинки, число; правильні відповіді в різних місцях. */
const questions67 = (image: string) => [
  {
    ...single,
    id: 'q671',
    text: 'Яка річка тече через Київ?',
    options: [
      { id: 'a', text: 'Дністер' },
      { id: 'b', text: 'Сіверський Донець' },
      { id: 'c', text: 'Дніпро' },
      { id: 'd', text: 'Одна дуже довга відповідь про річку, яка протікає через столицю й має понад вісімдесят знаків' },
    ],
    correctId: 'c',
    timeLimit: 40,
  },
  {
    ...single,
    id: 'q672',
    text: 'Який малюнок показує Говерлу?',
    options: [
      { id: 'a', text: 'Перший', imageUrl: image },
      { id: 'b', text: 'Другий', imageUrl: image },
      { id: 'c', text: 'Третій', imageUrl: image },
      { id: 'd', text: 'Четвертий', imageUrl: image },
    ],
    correctId: 'b',
    timeLimit: 40,
  },
  { ...numeric, id: 'q673', text: 'Яка висота Говерли в метрах?', correct: 2061, tolerance: 100, timeLimit: 40 },
];

async function player67() {
  const host = await open('host67', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host67@example.com');
  const upload = await host.request.post(`${base}/api/uploads`, { data: png29d(400, 300, (x, y) => [40 + ((x + y) % 80), 90, 140]), headers: { 'content-type': 'image/png' } });
  expect(upload.ok(), await upload.text()).toBe(true);
  const image = ((await upload.json()) as { url: string }).url;
  const data = { ...makeRoundsQuiz([classicRound('r67', questions67(image) as never)], { leaderboard: 'end' }), title: 'Вікторина для ПК 67' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Вікторина для ПК 67' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage67', 1920, 1080);
  await stage.goto(stageUrl);

  // Сторінка входу в гру до нікнейма: вузька на будь-якому екрані.
  const taras = await open('taras67', 1920, 1080);
  await taras.goto(`${base}/play/${code}`);
  await field(taras, 'Ваше ім’я').waitFor();
  await wide67(taras, 'player67-join', async ({ tag }) => {
    expect(await mainWidth67(taras), `join ${tag}`).toBeLessThanOrEqual(544);
  });
  await join(taras, code, 'Тарас', false);
  await stage.getByText('Тарас').waitFor();
  await wide67(taras, 'player67-wait', async ({ tag }) => {
    // Очікування — теж екран гравця (.app.player), а не .app.narrow: колонка телефона на ПК, не ширша за 70 rem (1920) чи 52 rem (1366).
    expect(await mainWidth67(taras), `wait ${tag}`).toBeLessThanOrEqual(tag === '375' ? 375 : tag === '1920' ? 1120 : 832);
  });

  await click(host, 'Почати гру');
  await afterSplash(host, stage, taras);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, taras);

  const choiceBoxes = (page: Page) =>
    page.evaluate(`[...document.querySelectorAll('.app.player .choices .choice')].map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, right: r.right }; })`) as Promise<{ x: number; y: number; w: number; right: number }[]>;

  // ── Запитання 1: чотири текстові варіанти, один дуже довгий. ──
  await taras.locator('.choices .choice').first().waitFor();
  await wide67(taras, 'player67-choices', async ({ tag, width }) => {
    const main = await mainWidth67(taras);
    const boxes = await choiceBoxes(taras);
    expect(boxes.length, `choices ${tag}`).toBe(4);
    for (const box of boxes) expect(box.right, `choices ${tag}: inside the window`).toBeLessThanOrEqual(width + 0.5);
    if (tag === '375') {
      expect(main, 'player 375').toBe(375);
      expect(boxes[1]!.y, 'phone: the second choice under the first').toBeGreaterThan(boxes[0]!.y + 10);
    } else {
      expect(main, `player ${tag}`).toBeGreaterThan(544);
      expect(main, `player ${tag}`).toBeLessThanOrEqual(width === 1920 ? 1120 : 832);
      expect(Math.abs(boxes[1]!.y - boxes[0]!.y), `${tag}: two choices in a row`).toBeLessThanOrEqual(1);
      expect(boxes[1]!.x, `${tag}: the second to the side of the first`).toBeGreaterThan(boxes[0]!.x + boxes[0]!.w / 2);
    }
  });
  await taras.locator('.choices .choice').nth(2).click();

  // ── Запитання 2: варіанти-картинки — три в рядку на ПК, два на телефоні. ──
  await reveal28a(host);
  await next27a(host);
  await afterSplash(host, stage, taras);
  await taras.locator('.choices.has-images .choice').first().waitFor();
  await wide67(taras, 'player67-images', async ({ tag }) => {
    const boxes = await choiceBoxes(taras);
    expect(boxes.length, `images ${tag}`).toBe(4);
    const firstRow = boxes.filter((box) => Math.abs(box.y - boxes[0]!.y) <= 1).length;
    expect(firstRow, `images ${tag}: choices in the first row (four pictures stand 2 x 2)`).toBe(2);
  });
  await taras.locator('.choices.has-images .choice').nth(1).click();

  // ── Запитання 3: число — поле не ширше за 42 rem. ──
  await reveal28a(host);
  await next27a(host);
  await afterSplash(host, stage, taras);
  await field(taras, 'Ваша відповідь').waitFor();
  await wide67(taras, 'player67-number', async ({ tag }) => {
    const input = (await field(taras, 'Ваша відповідь').boundingBox())!;
    expect(input.width, `number ${tag}: the field`).toBeLessThanOrEqual(672 + 1);
  });
}

it('part 67 player: the player phone screen on a computer — the column grows to 52 rem (70 rem from 1600 px) at most, text choices in two columns and picture choices in three, the number field stays at a readable width, the join page stays narrow, the waiting page is the same phone column; the 375 phone is as before and nothing scrolls sideways', async () => {
  try {
    await player67();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 300_000);

/** Ведучий, сцена 1920 × 1080 і четверо гравців-телефонів (один із 20-літерним ніком); гра на одне текстове запитання. */
async function hostGame67() {
  const host = await open('host67h', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host67h@example.com');
  const data = { ...makeRoundsQuiz([classicRound('r67h', [{ ...text, id: 'q67h', text: 'Яке місто називають перлиною біля моря?', accepted: ['Одеса'], timeLimit: 40 }] as never)], { leaderboard: 'end' }), title: 'Пульт на ПК 67' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Пульт на ПК 67' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage67h', 1920, 1080);
  await stage.goto(stageUrl);
  const phones: Page[] = [];
  for (const nick of ['Олена', 'Тарас', 'Максим', 'Олександрович-Довгий']) {
    const page = await open(`${nick}67h`, 375, 812);
    await join(page, code, nick, false);
    phones.push(page);
  }
  await stage.getByText('Олександрович-Довгий').waitFor();
  return { host, stage, phones, code };
}

/** Бічна колонка праворуч від основної на ПК, під нею — на телефоні; нижня липка панель не накриває останній рядок бічної. */
async function expectColumns67(host: Page, tag: string, lobby = false) {
  const geometry = (await host.evaluate(`(() => {
    const box = (selector) => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, bottom: r.bottom, right: r.right }; };
    return { main: box('.host-main'), side: box('.host-side'), footer: box('footer.actions') };
  })()`)) as { main: { x: number; y: number; w: number; bottom: number } | null; side: { x: number; y: number; w: number; bottom: number } | null; footer: { y: number } | null };
  expect(geometry.main, `${tag}: host-main`).not.toBeNull();
  expect(geometry.side, `${tag}: host-side`).not.toBeNull();
  if (tag === '375') {
    // display: contents: обгортки не мають власного прямокутника — порядок блоків як до 67 перевіряє нульова ширина.
    expect(geometry.side!.w, 'phone: no side column box').toBe(0);
  } else if (lobby) {
    // Лобі: порожньої головної колонки немає — бічні блоки на всю ширину під рядком фази.
    expect(geometry.side!.w, `${tag}: the lobby uses the full width`).toBeGreaterThan(geometry.main!.w - 2);
  } else {
    expect(geometry.side!.x, `${tag}: the side column is to the right of the main one`).toBeGreaterThan(geometry.main!.x + geometry.main!.w - 1);
  }
}

async function host67() {
  const { host, stage, phones } = await hostGame67();
  // ── Лобі: список гравців і додатки лобі в бічній колонці. ──
  await host.getByRole('heading', { name: 'Гравці: 4' }).waitFor();
  await wide67(host, 'host67-lobby', async ({ tag }) => {
    await expectColumns67(host, tag, true);
    expect(await mainWidth67(host), `lobby ${tag}`).toBeLessThanOrEqual(tag === '1920' ? 1664 : 1408);
  });

  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await phones[0]!.getByLabel('Ваша відповідь', exact).waitFor();
  await phones[0]!.getByLabel('Ваша відповідь', exact).fill('Одеса');
  await click(phones[0]!, 'Відповісти');
  await phones[1]!.getByLabel('Ваша відповідь', exact).fill('Львів');
  await click(phones[1]!, 'Відповісти');
  await host.getByRole('timer').first().waitFor();

  // ── Запитання: на ПК гравці видно без прокрутки (1920), бічна колонка праворуч. ──
  await wide67(host, 'host67-question', async ({ tag }) => {
    await expectColumns67(host, tag);
    const heading = host.getByRole('heading', { name: 'Гравці: 4' });
    const box = (await heading.boundingBox())!;
    if (tag === '1920') expect(box.y + box.height, '1920: the players list is visible without scrolling').toBeLessThanOrEqual(1080);
    // Липка панель дій не накриває останній рядок бічної колонки, коли сторінку прокручено донизу.
    await host.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    const bottoms = (await host.evaluate(`(() => ({ side: document.querySelector('.host-side').lastElementChild.getBoundingClientRect().bottom, footer: document.querySelector('footer.actions').getBoundingClientRect().top }))()`)) as { side: number; footer: number };
    expect(bottoms.side, `${tag}: the last side element above the sticky actions`).toBeLessThanOrEqual(bottoms.footer + 0.5);
    await host.evaluate('window.scrollTo(0, 0)');
  });

  // ── Підсумок: у головній колонці. ──
  await reveal28a(host);
  await next27a(host);
  await host.getByText('Гру завершено').first().waitFor();
  await wide67(host, 'host67-finished', async ({ tag }) => {
    await expectColumns67(host, tag);
    expect(await host.locator('.host-main').getByText('Гру завершено').count(), `${tag}: the summary in the main column`).toBeGreaterThan(0);
    expect(await host.locator('.host-side').getByText('Гру завершено').count(), `${tag}: no summary in the side column`).toBe(0);
  });
}

it('part 67 host: the host console on a computer — from 1280 px the question and live answers fill the main column while the players, scores and links stand in a side column (nothing is hidden behind the sticky actions), the 375 phone keeps the old order, the finished summary stays in the main column', async () => {
  try {
    await host67();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 300_000);

/** Сцена не гортається й не має бічної прокрутки на екрані ПК і ноутбука; на 375 лише без бічної прокрутки (її робить wide67). */
async function expectStageFits67(stage: Page, name: string, size: (typeof SIZES_67)[number]) {
  if (size.tag === '375') return;
  const height = (await stage.evaluate('document.documentElement.scrollHeight')) as number;
  expect(height, `${name}-${size.tag}: the stage scrolls (${height}px of ${size.height})`).toBeLessThanOrEqual(size.height);
}

async function stage67() {
  const sockets: Socket[] = [];
  try {
    const host = await open('host67s', 1280, 900);
    await register(host, 'host', 'Ірина Ведуча', 'host67s@example.com');
    const data = { ...makeRoundsQuiz([classicRound('r67s', [{ ...text, id: 'q67s', text: 'Яке місто називають перлиною біля моря?', accepted: ['Одеса'], timeLimit: 40 }] as never)], { leaderboard: 'end' }), title: 'Сцена на ПК 67' };
    const saved = await host.request.post(`${base}/api/quizzes`, { data });
    expect(saved.ok(), await saved.text()).toBe(true);
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: 'Сцена на ПК 67' }).getByRole('button', { name: 'Грати', ...exact }).click();
    await host.waitForURL(/\/host\/\d{6}$/);
    const code = host.url().slice(-6);
    const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
    const stage = await open('stage67s', 1920, 1080);
    await stage.goto(stageUrl);
    const nicks = ['Олена', 'Тарас', 'Максим', 'Олександрович-Довгий', 'Ліда', 'Назар'];
    const pilots = [];
    for (const nick of nicks) pilots.push(await pilotPlayer(sockets, code, nick));
    await stage.getByText('Назар').waitFor();
    await click(host, 'Почати гру');
    await afterSplash(host, stage);
    await step27a(host, 'Почати раунд');
    await afterSplash(host, stage);
    for (const [index, pilot] of pilots.entries()) await emitOk(pilot, 'player:answer', { type: 'text', value: index % 2 === 0 ? 'Одеса' : 'Львів' });

    await stage.getByText('Яке місто називають перлиною біля моря?').first().waitFor();
    await wide67(stage, 'stage67-question', async (size) => {
      await expectStageFits67(stage, 'question', size);
      if (size.tag === '1920') {
        // Дошка .stage-board є лише в частині розкладок: де вона є, на 1920 вона ширша за 960 px.
        const boards = stage.locator('.stage-board');
        if ((await boards.count()) > 0) expect((await boards.first().boundingBox())!.width, '1920: the stage board is wider than 960 px').toBeGreaterThan(960);
      }
    });
    await reveal28a(host);
    await next27a(host);
    await host.getByText('Гру завершено').first().waitFor();
    await afterSplash(stage);
    await stage.locator('.standings').first().waitFor();
    await wide67(stage, 'stage67-standings', async (size) => {
      await expectStageFits67(stage, 'standings', size);
    });
  } finally {
    for (const socket of sockets) socket.close();
  }
}

it('part 67 stage: the stage on a big screen — the question and the standings of six players fit 1920 × 1080 and 1366 × 768 without scrolling, boards grow past 960 px from 1600 px, nothing scrolls sideways on a 375 screen', async () => {
  try {
    await stage67();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 300_000);

async function editor67() {
  const author = await open('author67e', 1920, 1080);
  await register(author, 'menu', 'Марина Авторка', 'editor67@example.com');
  const data = {
    ...makeRoundsQuiz(
      [
        classicRound('r67e1', [{ ...single, id: 'q67e1', text: 'Яке місто називають перлиною біля моря?' }, { ...multi, id: 'q67e2', text: 'Які з цих міст стоять на Дніпрі?' }] as never),
        classicRound('r67e2', [{ ...numeric, id: 'q67e3', text: 'Скільки хвилин у годині?' }, { ...text, id: 'q67e4', text: 'Столиця Франції?', accepted: ['Париж'] }] as never),
      ],
      { leaderboard: 'end' },
    ),
    title: 'Редактор на ПК 67',
  };
  const saved = await author.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const id = ((await saved.json()) as { id: string }).id;
  await author.goto(`${base}/quizzes/${id}`);
  await author.locator('.editor-grid').waitFor();
  await wide67(author, 'editor67', async ({ tag }) => {
    const geometry = (await author.evaluate(`(() => {
      const box = (selector) => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, right: r.right }; };
      const rules = [...document.querySelectorAll('.editor-quiz > details.rules')].slice(0, 2).map((el) => el.getBoundingClientRect());
      return { main: box('main'), side: box('.editor-side'), stage: box('.editor-stage'), nav: box('.question-nav'), rowY: rules.map((r) => r.y), rowX: rules.map((r) => r.x) };
    })()`)) as { main: { w: number }; side: { x: number; w: number }; stage: { x: number; w: number }; nav: { w: number } | null; rowY: number[]; rowX: number[] };
    if (tag === '375') {
      expect(geometry.main.w, 'editor 375').toBe(375);
      expect(geometry.nav!.w, 'editor 375: the question switcher is shown').toBeGreaterThan(0);
      return;
    }
    expect(geometry.main.w, `editor ${tag}`).toBeGreaterThan(1088);
    expect(geometry.stage.x, `editor ${tag}: the list is on the left`).toBeGreaterThan(geometry.side.x + geometry.side.w - 1);
    expect(Math.abs(geometry.rowY[1]! - geometry.rowY[0]!), `editor ${tag}: settings in two columns`).toBeLessThanOrEqual(1);
    expect(geometry.rowX[1]!, `editor ${tag}: the second settings block is to the right`).toBeGreaterThan(geometry.rowX[0]! + 100);
    if (tag === '1920') expect(geometry.side.w, 'editor 1920: the list column is 26 rem at most').toBeLessThanOrEqual(416 + 1);
  });
}

it('part 67 editor: the quiz editor on a computer — the page is wider than 68 rem, the question list column stands on the left, the quiz settings blocks stand in two columns, the 375 phone is as before and nothing scrolls sideways', async () => {
  try {
    await editor67();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 300_000);

const ADMIN_EMAIL_67 = 'admin67@example.com';

async function admin67() {
  const admin = await open('admin67a', 1920, 1080);
  await register(admin, 'menu', 'Адмін 67', ADMIN_EMAIL_67);
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL_67));
  const authors: Page[] = [];
  for (const [index, name] of ['Оксана', 'Богдан', 'Дмитро'].entries()) {
    const person = await open(`67a${index}`, 1280, 800);
    await register(person, 'menu', name, `person67a${index}@example.com`);
    const data = { ...makeRoundsQuiz([classicRound(`r67a${index}`, [{ ...single, id: `q67a${index}`, text: `Запитання ${index + 1}: яке місто називають перлиною біля моря?` }] as never)], { leaderboard: 'end' }), title: `Вікторина адмінки 67 ${index + 1}` };
    const saved = await person.request.post(`${base}/api/quizzes`, { data });
    expect(saved.ok(), await saved.text()).toBe(true);
    authors.push(person);
  }
  const someone = await myId(authors[0]!);

  const side = (tag: string) =>
    admin.evaluate(`(() => { const n = document.querySelector('nav.admin-tabs').getBoundingClientRect(); const b = document.querySelector('.admin-body').getBoundingClientRect(); return { navX: n.x, navW: n.width, bodyX: b.x, bodyW: b.width, scrolls: document.querySelector('nav.admin-tabs').scrollWidth > document.querySelector('nav.admin-tabs').clientWidth }; })()`) as Promise<{ navX: number; navW: number; bodyX: number; bodyW: number; scrolls: boolean }>;
  const sameRow = (selector: string) =>
    admin.evaluate(`(() => { const r = [...document.querySelectorAll('${selector}')].map((el) => el.getBoundingClientRect()); return { count: r.length, inFirstRow: r.filter((box) => Math.abs(box.y - r[0].y) <= 1).length }; })()`) as Promise<{ count: number; inFirstRow: number }>;

  for (const [name, path] of [
    ['admin67-stats', '/admin'],
    ['admin67-users', '/admin/users'],
    ['admin67-user', `/admin/users/${someone}`],
    ['admin67-log', '/admin/log'],
    ['admin67-quizzes', '/admin/quizzes'],
  ] as const) {
    await admin.goto(`${base}${path}`);
    await admin.locator('.admin-body').waitFor();
    await admin.waitForLoadState('networkidle');
    await wide67(admin, name, async ({ tag }) => {
      const box = await side(tag);
      if (tag === '375') {
        expect(box.navX, `${name} 375: tabs as a row above`).toBeLessThanOrEqual(box.bodyX + 1);
        expect(box.navW, `${name} 375`).toBeLessThanOrEqual(375);
        return;
      }
      if (tag === '1920') expect(box.bodyW, `${name}: the body is wide`).toBeGreaterThan(1200);
      expect(box.bodyX, `${name} ${tag}: tabs on the left`).toBeGreaterThan(box.navX + box.navW - 1);
      if (name === 'admin67-users') {
        const rows = await sameRow('.admin-user-row');
        expect(rows.inFirstRow, `users ${tag}: columns of rows`).toBeGreaterThanOrEqual(tag === '1920' ? 3 : 2);
      }
      if (name === 'admin67-quizzes') {
        const cards = await sameRow('.admin-list:not(.is-rows) > li');
        expect(cards.count, 'quizzes: three cards').toBeGreaterThanOrEqual(3);
        expect(cards.inFirstRow, `quizzes ${tag}: cards in a grid`).toBeGreaterThanOrEqual(3);
      }
    });
  }
}

it('part 67 admin: the admin on a computer — wider page, tabs as a side column from 1280 px, user rows in two columns, quiz cards in a grid, the player card in two columns; on a 375 phone the tabs are a scrolling row and nothing scrolls sideways', async () => {
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL_67 }) });
  flags.restarting = false;
  try {
    await admin67();
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    flags.restarting = true;
    await ctx.shutdown().catch(() => undefined);
    await relisten();
  }
}, 300_000);

const LIST_TITLES_67 = ['Річки України', 'Міста над морем', 'Українські страви', 'Карпатські гори', 'Озера Шацька', 'Парки Києва', 'Мости Дніпра'];

async function lists67() {
  const host = await open('lists67h', 1920, 1080);
  await register(host, 'host', 'Ірина Ведуча', 'lists67h@example.com');
  const options = (...names: string[]) => names.map((text, index) => ({ id: `o${index}`, text }));
  const quizData = (title: string, id: string) => ({
    ...makeRoundsQuiz(
      [
        classicRound(
          `r-${id}`,
          [0, 1, 2, 3, 4].map((n) => ({ ...single, id: `${id}-${n}`, text: `${title}: запитання ${n + 1}`, options: options('Київ', 'Львів', 'Одеса', 'Харків'), correctId: 'o0', timeLimit: 30 })) as never,
        ),
      ],
      { leaderboard: 'end' },
    ),
    title,
  });
  let firstId = '';
  for (const [index, title] of LIST_TITLES_67.entries()) {
    const saved = await host.request.post(`${base}/api/quizzes`, { data: quizData(title, `q67l${index}`) });
    expect(saved.ok(), await saved.text()).toBe(true);
    if (index === 0) firstId = ((await saved.json()) as { id: string }).id;
  }
  // Одну вікторину відкриваємо для всіх: бібліотека не порожня.
  const opened = await host.request.put(`${base}/api/library/mine/${firstId}`, { data: { language: 'uk' } });
  expect(opened.status(), await opened.text()).toBeLessThan(300);

  // Зіграна гра: ведучий і гравець з акаунтом — тоді з'являються «Мої ігри» і сторінка гри.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: LIST_TITLES_67[1]! }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const olena = await open('lists67p', 375, 812);
  await register(olena, 'menu', 'Олена', 'lists67p@example.com');
  await join(olena, code, 'Олена', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olena);
  await click(host, 'Почати раунд');
  await afterSplash(host, olena);
  for (let n = 1; n <= 5; n++) {
    await olena.locator('h1', { hasText: `запитання ${n}` }).waitFor();
    await pickOption(olena, n % 2 === 0 ? 'Львів' : 'Київ');
    await reveal28a(host);
    if (n < 5) {
      await next27a(host);
      await afterSplash(host, olena);
    }
  }
  await click(host, 'Завершити гру');
  await olena.getByText('Гру завершено').first().waitFor({ timeout: 30_000 });
  // Ще одна гра в лобі — другий рядок історії.
  const second = await host.request.post(`${base}/api/games`, { data: { quizId: firstId } });
  expect(second.status(), await second.text()).toBe(201);
  // Подія в календарі.
  await db.insert(calendarEvent).values({ hostId: await myId(host), title: 'Вечір загадок 67', quizId: null, startsAt: new Date(Date.now() + 2 * 86_400_000), createdAt: new Date() });

  const cardsInFirstRow = (selector: string) =>
    host.evaluate(`(() => { const r = [...document.querySelectorAll('${selector}')].map((el) => el.getBoundingClientRect()); return { count: r.length, inFirstRow: r.filter((box) => r.length > 0 && Math.abs(box.y - r[0].y) <= 1).length }; })()`) as Promise<{ count: number; inFirstRow: number }>;

  const pages: [string, string, string | null][] = [
    ['lists67-home', '/', null],
    ['lists67-quizzes', '/quizzes', '.quiz-list > li'],
    ['lists67-library', '/library', '.library-list > li'],
    ['lists67-feed', '/feed', null],
    ['lists67-calendar', '/feed/calendar', null],
    ['lists67-history', '/history', null],
    ['lists67-help', '/help', null],
  ];
  for (const [name, path, cards] of pages) {
    await host.goto(`${base}${path}`);
    await host.locator('main').waitFor();
    await host.waitForLoadState('networkidle');
    await wide67(host, name, async ({ tag }) => {
      const width = await mainWidth67(host);
      if (tag === '375') expect(width, `${name} 375`).toBeLessThanOrEqual(375);
      else expect(width, `${name} ${tag}`).toBeGreaterThan(560);
      if (cards !== null && tag === '1920') {
        const row = await cardsInFirstRow(cards);
        if (name === 'lists67-quizzes') expect(row.inFirstRow, 'quizzes 1920: at least three cards in the first row').toBeGreaterThanOrEqual(3);
        else expect(row.inFirstRow, `${name} 1920: cards in a row`).toBeGreaterThanOrEqual(Math.min(row.count, 1));
      }
      if (cards !== null && tag === '375') {
        const row = await cardsInFirstRow(cards);
        expect(row.inFirstRow, `${name} 375: one under another`).toBe(1);
      }
    });
    await expectPhoneFit(host, name);
  }

  // Сторінка вікторини в бібліотеці.
  await host.goto(`${base}/library`);
  const libraryHref = (await host.locator('a.library-card').first().getAttribute('href'))!;
  await host.goto(`${base}${libraryHref}`);
  await host.locator('main.library-quiz').waitFor();
  await wide67(host, 'lists67-library-quiz', async ({ tag }) => {
    if (tag === '375') expect(await mainWidth67(host), 'library quiz 375').toBeLessThanOrEqual(375);
    else expect(await mainWidth67(host), `library quiz ${tag}`).toBeLessThanOrEqual(672 + 2 * 48);
  });

  // Перегляд зіграної гри й «Мої ігри» (гравець).
  await host.goto(`${base}/history`);
  const href = (await host.locator('a[href^="/history/"]').first().getAttribute('href'))!;
  for (const [name, path, page] of [
    ['lists67-game', href, host],
    ['lists67-mygames', '/me', olena],
  ] as const) {
    await page.goto(`${base}${path}`);
    await page.locator('main').waitFor();
    await page.waitForLoadState('networkidle');
    await wide67(page, name, async ({ tag }) => {
      if (tag === '1920') expect(await mainWidth67(page), `${name} 1920`).toBeGreaterThan(1200);
    });
    // Сторінка гри на телефоні довга й закінчується розкритими відповідями: нижня панель накриває її кінець, як і до 67 (перевіряємо лише «Мої ігри»).
    if (name === 'lists67-mygames') await expectPhoneFit(page, name);
  }
}

it('part 67 lists: my quizzes, library, feed, calendar, history, a finished game and help on a computer — card grids, a two-column game page, reading width for help; 375 phone lists stay one under another', async () => {
  try {
    await lists67();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 400_000);

async function profile67() {
  const olena = await open('profile67o', 1920, 1080);
  await register(olena, 'menu', 'Олена Профільна', 'profile67o@example.com');
  const friends: Page[] = [];
  for (const [index, name] of ['Петро Гай', 'Оксана Друг', 'Богдан Лис'].entries()) {
    const person = await open(`profile67f${index}`, 1366, 768);
    await register(person, 'menu', name, `profile67f${index}@example.com`);
    friends.push(person);
  }
  const olenaId = await myId(olena);
  for (const person of friends) {
    expect((await olena.request.put(`${base}/api/me/friends/${await myId(person)}`)).ok()).toBe(true);
    expect((await person.request.put(`${base}/api/me/friends/${olenaId}`)).ok()).toBe(true);
  }
  const created = await olena.request.post(`${base}/api/groups`, { data: { name: 'Родина Квіткових', emoji: '🌻', description: 'Наші запитання про рідню' } });
  expect(created.status(), await created.text()).toBe(201);
  const { id: groupId, inviteCode } = (await created.json()) as { id: string; inviteCode: string };
  for (const person of friends.slice(0, 2)) expect((await person.request.post(`${base}/api/groups/join/${inviteCode}`)).status()).toBe(200);
  for (const [index, kind] of ['fact', 'fact', 'fact'].entries()) {
    const made = await olena.request.post(`${base}/api/groups/${groupId}/items`, {
      data: { kind, about: [], answer: null, year: null, photo: null, surprise: false, text: `Родинна історія номер ${index + 1}: хто з нас першим побачив море?` },
    });
    expect(made.status(), await made.text()).toBe(201);
  }
  // Ще одна вікторина в профілі й одна група для порожніх сітки/списку.
  const saved = await olena.request.post(`${base}/api/quizzes`, { data: { ...makeRoundsQuiz([classicRound('r67p', [{ ...single, id: 'q67p', text: 'Яке місто називають перлиною біля моря?' }] as never)], { leaderboard: 'end' }), title: 'Профіль 67' } });
  expect(saved.ok(), await saved.text()).toBe(true);

  const boxes = (page: Page, selector: string) =>
    page.evaluate(`(() => { const r = [...document.querySelectorAll('${selector}')].map((el) => el.getBoundingClientRect()); return { count: r.length, inFirstRow: r.filter((box) => r.length > 0 && Math.abs(box.y - r[0].y) <= 1).length }; })()`) as Promise<{ count: number; inFirstRow: number }>;
  const columns = (page: Page) =>
    page.evaluate(`(() => { const r = [...document.querySelectorAll('main > .profile-col')].map((el) => el.getBoundingClientRect()); return { count: r.length, x: r.map((b) => b.x), w: r.map((b) => b.width) }; })()`) as Promise<{ count: number; x: number[]; w: number[] }>;

  const pages: { name: string; path: string; page: Page; check?: (tag: string, page: Page) => Promise<void> }[] = [
    {
      name: 'profile67-main',
      path: '/profile',
      page: olena,
      check: async (tag, page) => {
        const cols = await columns(page);
        expect(cols.count, `profile ${tag}: two columns`).toBe(2);
        if (tag === '375') expect(cols.x[1]!, 'profile 375: the columns stand one under another').toBe(cols.x[0]);
        else expect(cols.x[1]!, `profile ${tag}: the second column is on the right`).toBeGreaterThan(cols.x[0]! + cols.w[0]! - 1);
        if (tag === '1920') expect(cols.w[1]!, 'profile 1920: the right column is wider').toBeGreaterThan(cols.w[0]!);
        if (tag === '1920') expect(await mainWidth67(page), 'profile 1920').toBeGreaterThan(1200);
      },
    },
    { name: 'profile67-public', path: `/profile/${olenaId}`, page: friends[0]!, check: async (tag, page) => {
        const cols = await columns(page);
        expect(cols.count, `public ${tag}: two columns`).toBe(2);
        if (tag !== '375') expect(cols.x[1]!, `public ${tag}: the second column is on the right`).toBeGreaterThan(cols.x[0]! + cols.w[0]! - 1);
      } },
    { name: 'profile67-achievements', path: '/profile/achievements', page: olena, check: async (tag, page) => {
        const cards = await boxes(page, '.achievement-cards > li');
        if (tag === '1920') expect(cards.inFirstRow, 'achievements 1920: at least three in a row').toBeGreaterThanOrEqual(3);
        if (tag === '375') expect(cards.inFirstRow, 'achievements 375').toBeLessThanOrEqual(2);
      } },
    { name: 'profile67-groups', path: '/profile/groups', page: olena },
    { name: 'profile67-group', path: `/profile/groups/${groupId}`, page: olena },
    { name: 'profile67-friends', path: '/profile/friends', page: olena, check: async (tag, page) => {
        const cards = await boxes(page, '.friend-list > li');
        if (tag === '1920') expect(cards.inFirstRow, 'friends 1920: at least three in a row').toBeGreaterThanOrEqual(3);
        if (tag === '375') expect(cards.inFirstRow, 'friends 375: one under another').toBe(1);
      } },
    { name: 'profile67-settings', path: '/profile/settings', page: olena, check: async (tag, page) => {
        const width = await mainWidth67(page);
        if (tag === '375') return;
        expect(width, `settings ${tag}`).toBeLessThanOrEqual(1024 + 1);
        // Від 1280 px розділи налаштувань стоять у дві колонки (кадр 1366 і 1920).
        const rows = await boxes(page, '.settings-page > .profile-section');
        expect(rows.inFirstRow, `settings ${tag}: two columns`).toBeGreaterThanOrEqual(2);
      } },
    { name: 'profile67-stats', path: '/profile/stats', page: olena },
    { name: 'profile67-levels', path: '/profile/levels', page: olena },
    { name: 'profile67-looks', path: '/profile/looks', page: olena },
    { name: 'profile67-likes', path: '/profile/likes', page: olena },
    { name: 'profile67-quizzes', path: '/profile/quizzes', page: olena },
    { name: 'profile67-prizes', path: '/profile/prizes', page: olena },
    { name: 'profile67-join', path: `/groups/join/${inviteCode}`, page: friends[2]!, check: async (tag, page) => {
        if (tag !== '375') expect(await mainWidth67(page), `join ${tag}`).toBeLessThanOrEqual(576 + 1);
      } },
  ];
  // Вкладки групи: учасники, ліга, налаштування — кадри на трьох розмірах.
  await olena.setViewportSize({ width: 1920, height: 1080 });
  await olena.goto(`${base}/profile/groups/${groupId}`);
  for (const [index, label] of ['Учасники', 'Ліга', 'Налаштування'].entries()) {
    await olena.locator('.group-tabs').getByText(label, exact).click();
    await olena.waitForLoadState('networkidle');
    await wide67(olena, `profile67-group-tab${index}`);
  }

  for (const { name, path, page, check } of pages) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${base}${path}`);
    await page.locator('main').waitFor();
    await page.waitForLoadState('networkidle');
    await wide67(page, name, async ({ tag }) => {
      if (tag === '375') expect(await mainWidth67(page), `${name} 375`).toBeLessThanOrEqual(375);
      await check?.(tag, page);
    });
    // Довгі сторінки з прокручуваними вкладеними блоками (вигляд) закінчуються під нижньою панеллю й до 67 — їх перевіряє лише відсутність бічної прокрутки.
    if (name !== 'profile67-looks') await expectPhoneFit(page, name);
  }
}

it('part 67 profile: the profile, a public profile, achievements, groups, a group, friends, settings, stats, levels, prizes and an invite on a computer — columns grow with the page, card lists as grids, settings and invites at a form width; the 375 phone stays one column', async () => {
  try {
    await profile67();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 400_000);

/** Легкий режим (rem = 19 px), світла тема й арабська (RTL): колонка не вилазить за вікно, пульт і вкладки адмінки стоять дзеркально. */
async function easyLightRtl67() {
  const setStore = (page: Page, key: string, value: string) => page.context().addInitScript(([k, v]) => localStorage.setItem(k!, v!), [key, value]);
  const fits = (page: Page) => page.evaluate('document.documentElement.scrollWidth <= innerWidth');
  const rect = (page: Page, selector: string) =>
    page.evaluate(`(() => { const r = document.querySelector('${selector}').getBoundingClientRect(); return { x: r.x, right: r.right, w: r.width }; })()`) as Promise<{ x: number; right: number; w: number }>;

  // ── Адмінка арабською: вкладки з правого боку. ──
  const admin = await open('admin67r', 1920, 1080);
  await register(admin, 'menu', 'Адмін 67 RTL', 'admin67r@example.com');
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, 'admin67r@example.com'));
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin67r@example.com' }) });
  flags.restarting = false;
  await setStore(admin, 'quiz:locale', 'ar');
  await admin.goto(`${base}/admin/users`);
  await admin.locator('.admin-body').waitFor();
  expect(await admin.evaluate('document.documentElement.dir'), 'admin: rtl').toBe('rtl');
  await wide67(admin, 'easy67-admin-rtl', async ({ tag }) => {
    if (tag === '375') return;
    const nav = await rect(admin, 'nav.admin-tabs');
    const body = await rect(admin, '.admin-body');
    expect(nav.x, `admin ${tag}: tabs on the right in rtl`).toBeGreaterThan(body.x + body.w - 1);
  });
  flags.restarting = true;
  await ctx.shutdown().catch(() => undefined);
  await relisten();
  flags.restarting = false;

  // ── Легкий режим і світла тема: меню гравця, пульт у лобі й на запитанні, екран гравця. ──
  const { host, stage, phones } = await hostGame67();
  await setStore(host, 'quiz:easy', 'on');
  await setStore(host, 'quiz:theme', 'light');
  await host.reload();
  await host.getByRole('heading', { name: 'Гравці: 4' }).waitFor();
  expect(await host.evaluate("document.documentElement.classList.contains('is-easy')"), 'easy class on html').toBe(true);
  await wide67(host, 'easy67-host-lobby', async ({ tag, width }) => {
    expect(await fits(host), `easy lobby ${tag}`).toBe(true);
    expect(await mainWidth67(host), `easy lobby ${tag}: the column fits the window`).toBeLessThanOrEqual(width);
  });
  await host.goto(`${base}/quizzes`);
  await host.locator('main').waitFor();
  await wide67(host, 'easy67-quizzes', async ({ tag, width }) => {
    expect(await mainWidth67(host), `easy quizzes ${tag}`).toBeLessThanOrEqual(width);
  });
  await host.goBack();
  await host.getByRole('heading', { name: 'Гравці: 4' }).waitFor();

  await setStore(phones[0]!, 'quiz:easy', 'on');
  await setStore(phones[0]!, 'quiz:theme', 'light');
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await phones[0]!.reload();
  await phones[0]!.getByLabel('Ваша відповідь', exact).waitFor();
  await host.getByRole('timer').first().waitFor();
  await wide67(host, 'easy67-host-question', async ({ tag, width }) => {
    expect(await fits(host), `easy question ${tag}`).toBe(true);
    expect(await mainWidth67(host), `easy question ${tag}`).toBeLessThanOrEqual(width);
    await expectColumns67(host, tag);
  });
  await wide67(phones[0]!, 'easy67-player-question', async ({ tag, width }) => {
    expect(await fits(phones[0]!), `easy player ${tag}`).toBe(true);
    expect(await mainWidth67(phones[0]!), `easy player ${tag}`).toBeLessThanOrEqual(width);
  });

  // ── Пульт арабською на запитанні: основна колонка праворуч, бічна ліворуч. ──
  await setStore(host, 'quiz:locale', 'ar');
  await host.reload();
  await host.locator('.host-main').waitFor();
  expect(await host.evaluate('document.documentElement.dir'), 'host: rtl').toBe('rtl');
  await wide67(host, 'easy67-host-rtl', async ({ tag }) => {
    if (tag === '375') return;
    const main = await rect(host, '.host-main');
    const side = await rect(host, '.host-side');
    expect(side.right, `host ${tag}: the side column on the left in rtl`).toBeLessThanOrEqual(main.x + 1);
  });
}

it('part 67 easy, light and right to left: the easy mode (19 px rem) and the light theme keep the columns inside the window on a computer and a phone, the host side column and the admin tabs mirror in Arabic', async () => {
  try {
    await easyLightRtl67();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 400_000);
