import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, numeric, single } from '@quiz/engine/testing';
import { open, register, join, click, field, png29d, step27a, reveal28a, next27a } from './helpers/common';
import { exact, base, ARTIFACTS, shot, snapshot, afterSplash, useE2eServer } from './helpers/setup';

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

/** Кадр лише видимої частини + повний кадр; без бічної прокрутки на кожному розмірі. */
async function wide67(page: Page, name: string, check?: (size: (typeof SIZES_67)[number]) => Promise<void>) {
  for (const size of SIZES_67) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.evaluate('new Promise(requestAnimationFrame)');
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), `${name}-${size.tag}: horizontal scroll`).toBe(true);
    await check?.(size);
    await viewportShot67(page, `${name}-${size.tag}`);
    await shot(page, `${name}-${size.tag}-full`);
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
    // Очікування — теж екран гравця (.app.player), а не .app.narrow: колонка телефона на ПК, не ширша за 56 rem.
    expect(await mainWidth67(taras), `wait ${tag}`).toBeLessThanOrEqual(tag === '375' ? 375 : 896);
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
      expect(main, `player ${tag}`).toBeLessThanOrEqual(width === 1920 ? 896 : 832);
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
    expect(firstRow, `images ${tag}: choices in the first row`).toBe(tag === '375' ? 2 : 3);
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

it('part 67 player: the player phone screen on a computer — the column grows to 52 rem at most, text choices in two columns and picture choices in three, the number field stays at a readable width, the join page stays narrow, the waiting page is the same phone column; the 375 phone is as before and nothing scrolls sideways', async () => {
  try {
    await player67();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 300_000);
