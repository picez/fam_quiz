import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, multi, numeric, single, text } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { adminEmails } from '../src/config';
import { user } from '../src/db/schema';
import { open, register, join, click, field, png29d, step27a, reveal28a, next27a, pilotPlayer, emitOk, myId } from './helpers/common';
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
  await register(author, 'author', 'Марина Авторка', 'editor67@example.com');
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
        expect(rows.inFirstRow, `users ${tag}: two columns of rows`).toBeGreaterThanOrEqual(2);
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
