import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { open, register } from './helpers/common';
import { base, ARTIFACTS, shot, snapshot, useE2eServer } from './helpers/setup';

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
