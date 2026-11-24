import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { calendarEvent, feedEvent } from '../src/db/schema';
import { open, register, myId, expectNoSideScroll } from './helpers/common';
import { exact, base, ARTIFACTS, snapshot, useE2eServer, db, problems } from './helpers/setup';

/**
 * Наскрізні тести: частина 76 — стрічка однією колонкою однакових карток, «Показати ще» й «Запланувати гру» — звичайні кнопки застосунку.
 * Потребує зібраного клієнта (pnpm build) і встановленого Chrome; кадри — E2E_SHOTS=1.
 */

useE2eServer();

/** Кадр видимої частини екрана. */
async function view76(page: Page, name: string) {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`) });
}

/** Кадр усієї сторінки. */
async function full76(page: Page, name: string) {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`), fullPage: true });
}

/** Розміри карток, кнопки «Показати ще» й колонки. */
const geometry76 = (page: Page) =>
  page.evaluate(() => {
    const cards = [...document.querySelectorAll('.feed-card')].map((el) => el.getBoundingClientRect());
    const list = document.querySelector('.feed-list')!.getBoundingClientRect();
    const more = document.querySelector('.feed-more')?.getBoundingClientRect() ?? null;
    const main = document.querySelector('main')!.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return {
      heights: [...new Set(cards.map((r) => Math.round(r.height)))],
      lefts: [...new Set(cards.map((r) => Math.round(r.left)))],
      widths: [...new Set(cards.map((r) => Math.round(r.width)))],
      list: { left: list.left, width: list.width },
      more: more && { left: more.left, width: more.width, height: more.height },
      main: { left: main.left, width: main.width },
      rem,
      innerWidth,
    };
  });

async function feed76() {
  const olya = await open('olya76', 1920, 1080);
  await register(olya, 'menu', 'Оля Стрічкова', 'olya76@example.com');
  const petro = await open('petro76', 1920, 1080);
  await register(petro, 'menu', 'Петро Довгоназвенко-Вишиваний', 'petro76@example.com');
  const olyaId = await myId(olya);
  const petroId = await myId(petro);
  expect((await olya.request.put(`${base}/api/me/friends/${petroId}`)).ok()).toBe(true);
  expect((await petro.request.put(`${base}/api/me/friends/${olyaId}`)).ok()).toBe(true);

  // Події різної довжини: короткі рівні, перемоги з довгими назвами, досягнення, запланована гра; разом понад 20 — є «Показати ще».
  const titles = ['Писанки', 'Велика родинна вікторина про Карпати, Полісся, Поділля й усе, що між ними, від прадіда до правнуків', 'Кіно 90-х', 'Хто з нас першим побачив море і чому це був дядько Богдан'];
  const now = Date.now();
  const rows = Array.from({ length: 26 }, (_, i) => {
    const at = new Date(now - (i + 1) * 5 * 3_600_000);
    const userId = i % 3 === 2 ? olyaId : petroId;
    const title = titles[i % titles.length]!;
    const data =
      i % 5 === 0
        ? { kind: 'game' as const, title, place: 1, of: 6, team: null }
        : i % 5 === 1
          ? { kind: 'level' as const, level: 10 + i }
          : i % 5 === 2
            ? { kind: 'game' as const, title, place: 3, of: 5, team: i % 2 === 0 ? 'Сови' : null }
            : i % 5 === 3
              ? { kind: 'achievement' as const, achievementId: 'night_owl' as never }
              : { kind: 'game' as const, title, place: 2, of: 4, team: null };
    return { key: `test76:${i}`, userId, kind: data.kind, gameId: null, data, at, createdAt: at };
  });
  await db.insert(feedEvent).values(rows);
  const [planned] = await db.insert(calendarEvent).values({ hostId: petroId, title: 'Вечір загадок 76', quizId: null, startsAt: new Date(now + 2 * 86_400_000), createdAt: new Date() }).returning();
  const plannedAt = new Date(now - 60_000);
  await db.insert(feedEvent).values({ key: `test76:planned`, userId: petroId, kind: 'planned', gameId: null, data: { kind: 'planned', eventId: planned!.id, title: 'Вечір загадок 76', startsAt: planned!.startsAt.toISOString() }, at: plannedAt, createdAt: plannedAt });

  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') await olya.evaluate(() => localStorage.setItem('quiz:theme', 'light'));
    for (const [width, height] of [
      [1920, 1080],
      [360, 740],
    ] as const) {
      await olya.setViewportSize({ width, height });
      await olya.goto(`${base}/feed`);
      await olya.locator('.feed-card').first().waitFor();
      await olya.getByRole('button', { name: 'Показати ще', ...exact }).waitFor();
      if (theme === 'light') expect(await olya.evaluate(() => document.documentElement.classList.contains('is-light'))).toBe(true);
      const g = await geometry76(olya);
      const tag = `${theme}-${width}`;
      expect(g.heights, `${tag}: every card has the same height`).toHaveLength(1);
      expect(g.lefts, `${tag}: one column`).toHaveLength(1);
      expect(g.widths, `${tag}: every card has the same width`).toHaveLength(1);
      expect(g.main.width, `${tag}: the column is at most 44 rem`).toBeLessThanOrEqual(44 * g.rem + 0.5);
      if (width === 1920) expect(Math.abs(g.main.left + g.main.width / 2 - g.innerWidth / 2), `${tag}: centred`).toBeLessThanOrEqual(1);
      expect(g.more, `${tag}: «Показати ще»`).not.toBeNull();
      expect(Math.abs(g.more!.width - g.list.width), `${tag}: «Показати ще» spans the column`).toBeLessThanOrEqual(1);
      expect(g.more!.height, `${tag}: «Показати ще» is a comfortable button`).toBeGreaterThanOrEqual(44);
      // «До календаря» видно повністю всередині картки.
      const link = await olya.evaluate(() => {
        const a = document.querySelector('.feed-card .feed-link')!.getBoundingClientRect();
        const card = document.querySelector('.feed-card .feed-link')!.closest('.feed-card')!.querySelector('.feed-body')!.getBoundingClientRect();
        return { inside: a.right <= card.right + 0.5 && a.width > 20 };
      });
      expect(link.inside, `${tag}: «До календаря» is whole`).toBe(true);
      await expectNoSideScroll(olya, `76-feed-${tag}`);
      await view76(olya, `76-feed-${tag}`);
      if (width === 1920) {
        await olya.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await view76(olya, `76-feed-${tag}-bottom`);
      }
      if (width === 360) await full76(olya, `76-feed-${tag}-full`);
    }
  }

  // Друга сторінка: картки й далі однакові.
  await olya.setViewportSize({ width: 1920, height: 1080 });
  await olya.evaluate(() => localStorage.setItem('quiz:theme', 'dark'));
  await olya.goto(`${base}/feed`);
  await olya.getByRole('button', { name: 'Показати ще', ...exact }).click();
  await expect.poll(() => olya.getByRole('button', { name: 'Показати ще', ...exact }).count()).toBe(0);
  expect((await geometry76(olya)).heights, 'after paging: the same height').toHaveLength(1);

  // Календар: «Запланувати гру» — кнопка застосунку.
  for (const theme of ['dark', 'light'] as const) {
    await olya.evaluate((value) => localStorage.setItem('quiz:theme', value), theme);
    await olya.goto(`${base}/feed/calendar`);
    const plan = olya.getByRole('button', { name: 'Запланувати гру', ...exact });
    await plan.waitFor();
    await olya.locator('.calendar-card').first().waitFor();
    const box = (await plan.boundingBox())!;
    expect(box.height, `calendar ${theme}: a comfortable button`).toBeGreaterThanOrEqual(44);
    expect(await plan.evaluate((el) => getComputedStyle(el).borderTopLeftRadius), `calendar ${theme}: the app button`).not.toBe('0px');
    await expectNoSideScroll(olya, `76-calendar-${theme}-1920`);
    await view76(olya, `76-calendar-${theme}-1920`);
  }

  expect(problems).toEqual([]);
}

it('part 76: the feed is one centred column of equal cards (1920 and 360, dark and light), «Показати ще» spans the column, «Запланувати гру» is an app button', async () => {
  try {
    await feed76();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 300_000);
