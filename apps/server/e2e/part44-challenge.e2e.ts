import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { blitzRound, classicRound, makeRoundsQuiz, truthRound } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { expectNoSideScroll, field, click, MENU, open, pickOption, register, socketFrames, cardAction } from './helpers/common';
import { ARTIFACTS, base, db, exact, flags, problems, shot, snapshot, useE2eServer } from './helpers/setup';
import { challenge } from '../src/db/schema';

/**
 * Наскрізні тести: частина 44 — виклик другові (38a): автор створює 7-денне посилання зі списком пропущеного, гість — на вхід, двоє гравців
 * проходять вікторину самі (один перериває й повертається з іншого пристрою), таблиця видна лише після власної гри, другої спроби немає,
 * після терміну й заміни нових спроб немає; телефон 360 px, світла тема.
 */

useE2eServer();

it('part 44: challenge — author creates a 7-day link, two accounts play alone (one interrupts and returns), shared results, no second attempt, guest sign-in, expiry, phone 360 px, light theme', async () => {
  try {
    await challenge44();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 900_000);

type Json = Record<string, unknown>;
type Row = { place: number; nickname: string; score: number; timeMs: number; done: boolean; author: boolean; me: boolean };

const light = async (page: Page) => {
  await page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  return page;
};
const isLight = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('is-light'));
/** Кадр лише видимої частини екрана: видно, чи не закриває нижня панель кінець сторінки. */
const viewportShot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`) });
};
const CODE = /\/challenge\/([a-z0-9]{12})$/;

async function challenge44() {
  const common = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  const Q1 = 'Яка річка найдовша в Україні?';
  const Q2 = 'Дністер впадає в Чорне море?';
  const POLL = 'Яка річка вам найближча?';
  const Q3 = 'Десна — притока Дністра?';
  const Q4 = 'Як називається найвища гора України?';
  const quiz = {
    ...makeRoundsQuiz([
      classicRound(
        'c1',
        [
          { ...common, id: 'q1', type: 'single', text: Q1, options: options('Дніпро', 'Дністер', 'Південний Буг', 'Десна'), correctId: 'a' },
          { ...common, id: 'q2', type: 'boolean', text: Q2, correct: true, timeLimit: 25, points: 500 },
          { ...common, id: 'q3', type: 'poll', text: POLL, options: options('Дніпро', 'Дністер', 'Тиса'), points: 0, timeLimit: 25 },
          { ...common, id: 'q4', type: 'boolean', text: Q3, correct: false, timeLimit: 25, points: 500 },
        ] as never,
        { title: 'Річки', speedBonus: false, shuffleOptions: false },
      ),
      truthRound('c2', { title: 'Правда' }),
      blitzRound('c3', [{ ...common, id: 'q5', type: 'text', text: Q4, accepted: ['Говерла'], timeLimit: 30, points: 400 }] as never, { title: 'Швидко' }),
    ]),
    title: 'Річки 44',
  };

  // ── 1. Автор «Олена» і вікторина. ──
  const olena = await light(await open('olena44', 360, 740, { permissions: ['clipboard-read', 'clipboard-write'] }));
  await register(olena, 'menu', 'Олена', 'olena44@example.com');
  const created = await olena.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(created.ok(), await created.text()).toBe(true);

  // ── 2. «🏁 Виклик»: що буде пропущено, створення, посилання, «Копіювати», рядок у списку. ──
  await olena.goto(`${base}/quizzes`);
  const item = olena.locator('.quiz-list li', { hasText: 'Річки 44' });
  await cardAction(olena, 'Річки 44', '🏁 Виклик');
  const dialog = olena.getByRole('dialog', { name: 'Виклик другові', ...exact });
  await dialog.getByText('Буде пропущено те, що потребує кількох гравців:', exact).waitFor();
  const skipped = (await dialog.locator('.autopilot-changes li').allTextContents()).join(' | ');
  expect(skipped).toContain('Раунд 2 (Правда про гравця)');
  expect(skipped).toMatch(/Раунд 1 \(.+\): буде пропущено 1 запитання/);
  expect(skipped).toContain('Крамниця дебафів');
  await viewportShot(olena, 'p44-launch-skipped-viewport');
  await expectNoSideScroll(olena, 'p44-launch');
  await viewportShot(olena, 'p44-launch-viewport');
  await dialog.getByRole('button', { name: 'Створити виклик', ...exact }).click();
  const link = dialog.getByLabel('Посилання на виклик', exact);
  await link.waitFor();
  const url = await link.inputValue();
  const code = CODE.exec(url)![1]!;
  await dialog.getByRole('button', { name: 'Копіювати', ...exact }).click();
  await dialog.getByText('Скопійовано', exact).waitFor();
  expect(await olena.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await expectNoSideScroll(olena, 'p44-launch-created');
  await viewportShot(olena, 'p44-launch-created-viewport');
  // Щойно створено: вступу й списку пропущеного вже немає, «Закрити» видно на 360 × 740 без прокручування.
  expect(await dialog.locator('.autopilot-changes').count()).toBe(0);
  expect(await dialog.getByText('Друзі проходять цю вікторину самі', { exact: false }).count()).toBe(0);
  expect(await dialog.getByRole('button', { name: 'Скасувати', ...exact }).count()).toBe(0);
  const closeButton = dialog.getByRole('button', { name: 'Закрити', ...exact });
  const closeBox = (await closeButton.boundingBox())!;
  expect(closeBox.x).toBeGreaterThanOrEqual(0);
  expect(closeBox.y).toBeGreaterThanOrEqual(0);
  expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(360);
  expect(closeBox.y + closeBox.height, 'Close is on screen without scrolling').toBeLessThanOrEqual(740);
  expect(await dialog.locator('.challenge-sheet').evaluate((card) => card.scrollTop)).toBe(0);
  await closeButton.click();
  await dialog.waitFor({ state: 'detached' });
  const line = item.locator('.challenge-line');
  await line.waitFor();
  expect(await line.innerText()).toContain('🏁 Виклик: лишилося 7 днів · зіграли 0 людей');
  await viewportShot(olena, 'p44-quizzes-line-viewport');
  // Знову «🏁 Виклик»: те саме посилання, «Копіювати» без заміни; «Новий виклик» — другорядна кнопка.
  await olena.evaluate(() => navigator.clipboard.writeText(''));
  await cardAction(olena, 'Річки 44', '🏁 Виклик');
  const again = olena.getByRole('dialog', { name: 'Виклик другові', ...exact });
  await expect.poll(async () => again.getByLabel('Посилання на виклик', exact).inputValue().catch(() => '')).toBe(url);
  await again.getByRole('button', { name: 'Копіювати', ...exact }).click();
  await again.getByText('Скопійовано', exact).waitFor();
  expect(await olena.evaluate(() => navigator.clipboard.readText())).toBe(url);
  expect(await again.getByRole('button', { name: 'Новий виклик', ...exact }).getAttribute('class')).not.toContain('btn-primary');
  await expectNoSideScroll(olena, 'p44-launch-active');
  await viewportShot(olena, 'p44-launch-active-viewport');
  await again.getByRole('button', { name: 'Скасувати', ...exact }).click();
  await again.waitFor({ state: 'detached' });
  expect(((await (await olena.request.get(`${base}/api/challenges`)).json()) as { code: string }[]).map((c) => c.code)).toEqual([code]);

  // ── 3. Гість: «Увійдіть, щоб прийняти виклик». ──
  const guest = await light(await open('guest44', 360, 740));
  await guest.goto(url);
  await guest.getByText('Увійдіть, щоб прийняти виклик.', exact).waitFor();
  const signIn = guest.getByRole('main').getByRole('link', { name: 'Увійти', ...exact });
  expect(await signIn.getAttribute('href')).toBe(`/login?next=${encodeURIComponent(`/challenge/${code}`)}`);
  await expectNoSideScroll(guest, 'p44-guest');
  await viewportShot(guest, 'p44-guest-viewport');
  expect((await guest.request.get(`${base}/api/challenges/${code}`)).status()).toBe(401);

  // ── 4. «Тарас»: картка, таблиця закрита, «Почати», лобі без коду. ──
  const taras = await light(await open('taras44', 360, 740));
  await register(taras, 'menu', 'Тарас', 'taras44@example.com');
  const tarasFrames = socketFrames(taras);
  await taras.goto(url);
  await taras.getByRole('heading', { name: 'Річки 44', ...exact }).waitFor();
  await taras.getByText('від Олена', exact).waitFor();
  await taras.getByText('Таблицю видно після власної гри.', exact).waitFor();
  expect((await taras.request.get(`${base}/api/challenges/${code}/results`)).status()).toBe(403);
  expect(await taras.locator('table.challenge-results').count()).toBe(0);
  await expectNoSideScroll(taras, 'p44-card');
  await viewportShot(taras, 'p44-card-viewport');
  await click(taras, 'Почати');
  await taras.waitForURL(/\/play\/[^/]+$/);
  const room = taras.url().split('/').pop()!;
  await taras.getByText('🏁 Виклик: Річки 44', exact).waitFor();
  await taras.getByText('Граєш наодинці; запитання для кількох гравців пропущено.', exact).waitFor();
  expect(await taras.locator('.author-code, .qr').count(), 'no room code or QR in a challenge lobby').toBe(0);
  expect(await taras.locator('body').innerText()).not.toContain(room.slice(0, 3));
  await expectNoSideScroll(taras, 'p44-lobby');
  await viewportShot(taras, 'p44-lobby-viewport');
  // Екран гри без нижньої панелі: на 375 px кнопка «Почати гру» видна цілком.
  await taras.setViewportSize({ width: 375, height: 812 });
  expect(await taras.locator(MENU).count(), 'the play screen has no bottom menu').toBe(0);
  const startBox = (await taras.getByRole('button', { name: 'Почати гру', ...exact }).boundingBox())!;
  expect(startBox.x).toBeGreaterThanOrEqual(0);
  expect(startBox.x + startBox.width).toBeLessThanOrEqual(375);
  expect(startBox.y + startBox.height).toBeLessThanOrEqual(812);
  await expectNoSideScroll(taras, 'p44-lobby-375');
  await taras.setViewportSize({ width: 360, height: 740 });
  await click(taras, 'Почати гру');
  await taras.getByText(Q1).first().waitFor({ timeout: 120_000 });
  await viewportShot(taras, 'p44-question-viewport');
  await pickOption(taras, 'Дніпро');

  // ── 5. Перериває посеред другого запитання; інший пристрій — «Продовжити» з тією самою грою. ──
  await taras.getByText(Q2).first().waitFor({ timeout: 120_000 });
  await taras.close();
  const taras2 = await light(await open('taras44b', 360, 740));
  await taras2.context().addCookies(await taras.context().cookies());
  const tarasFrames2 = socketFrames(taras2);
  await taras2.goto(url);
  await taras2.getByText('Ти вже зіграв(-ла) цей виклик.', exact).waitFor({ timeout: 500 }).then(
    () => {
      throw new Error('the interrupted attempt is not done');
    },
    () => undefined,
  );
  await click(taras2, 'Продовжити');
  await taras2.waitForURL(/\/play\/[^/]+$/);
  expect(taras2.url().split('/').pop(), 'the same room on the other device').toBe(room);
  await expect
    .poll(async () => Number(((await taras2.locator('.bar .score').first().textContent()) ?? '').replace(/[^\d-]/g, '')), { timeout: 30_000 })
    .toBeGreaterThan(0);
  await taras2.getByText(Q2).first().waitFor({ timeout: 120_000 });
  await click(taras2, 'Так');
  await taras2.getByText(Q3).first().waitFor({ timeout: 120_000 });
  await click(taras2, 'Ні');
  await taras2.getByText(Q4).first().waitFor({ timeout: 120_000 });
  await field(taras2, 'Ваша відповідь').fill('Говерла');
  await click(taras2, 'Відповісти');
  const boardLink = taras2.locator('a.challenge-board-link');
  await boardLink.waitFor({ timeout: 180_000 });
  expect(await boardLink.innerText()).toContain('🏁 Таблиця виклику');
  // Одразу під місцем; картинка підсумку — з назвою виклику, без запиту до кімнати.
  expect(await boardLink.evaluate((a) => a.previousElementSibling?.classList.contains('place') ?? false)).toBe(true);
  await viewportShot(taras2, 'p44-finished-viewport');
  const framesText = [...tarasFrames, ...tarasFrames2].join('\n');
  expect(framesText, 'the poll never reaches a challenge player').not.toContain(POLL);
  expect(framesText, 'the truth round never reaches a challenge player').not.toContain('"type":"truth"');
  // Позначка у window переживає лише перехід без перезавантаження сторінки.
  await taras2.evaluate(() => Object.assign(window, { noReload44: true }));
  await boardLink.click();
  await taras2.locator('table.challenge-results').waitFor();
  expect(await taras2.evaluate(() => (window as unknown as { noReload44?: boolean }).noReload44), 'the table link is a client-side route change, not a reload').toBe(true);
  await taras2.locator('table.challenge-results tbody tr.is-me').waitFor();
  expect(await taras2.locator('table.challenge-results tbody tr').count()).toBe(1);
  await expectNoSideScroll(taras2, 'p44-results');
  await viewportShot(taras2, 'p44-results-viewport');

  // ── 6. Другої спроби немає; чужий акаунт у кімнату Тараса не входить. ──
  expect((await taras2.request.post(`${base}/api/challenges/${code}/attempt`)).status()).toBe(409);
  expect(await (await taras2.request.post(`${base}/api/challenges/${code}/attempt`)).json()).toEqual({ error: 'challenge_done' });
  await taras2.goto(url);
  await taras2.getByText('Ти вже зіграв(-ла) цей виклик.', exact).waitFor();
  expect(await taras2.getByRole('button', { name: 'Почати', ...exact }).count()).toBe(0);
  expect(await taras2.getByRole('button', { name: 'Продовжити', ...exact }).count()).toBe(0);
  await expectNoSideScroll(taras2, 'p44-card-done');
  await viewportShot(taras2, 'p44-card-done-viewport');

  // Власна сторінка гри (/play) і «Мої вікторини» гравця не дають жодного 404 за кодом кімнати.
  const byCode404 = /404 \(Not Found\) @ .*\/api\/games\/by-code\//;
  expect(problems.filter((problem) => byCode404.test(problem)), 'no by-code 404 for the challenge player').toEqual([]);
  const iryna = await light(await open('iryna44', 360, 740));
  await register(iryna, 'menu', 'Ірина', 'iryna44@example.com');
  flags.slots404Expected = true;
  await iryna.goto(`${base}/play/${room}`);
  await field(iryna, 'Ваше ім’я').fill('Ірина');
  await click(iryna, 'Увійти в гру');
  await iryna.getByText('Гру з таким кодом не знайдено. Перевірте код.', exact).first().waitFor();
  expect(await iryna.getByText('Ви в грі. Чекаємо на старт.').count()).toBe(0);
  flags.slots404Expected = false;

  // ── 7. «Ірина» грає до кінця з гіршим рахунком; таблиця для обох і для автора. ──
  await iryna.goto(url);
  await iryna.getByText('Таблицю видно після власної гри.', exact).waitFor();
  await click(iryna, 'Почати');
  await iryna.waitForURL(/\/play\/[^/]+$/);
  expect(iryna.url().split('/').pop()).not.toBe(room);
  await click(iryna, 'Почати гру');
  await iryna.getByText(Q1).first().waitFor({ timeout: 120_000 });
  await pickOption(iryna, 'Дністер');
  await iryna.getByText(Q2).first().waitFor({ timeout: 120_000 });
  await click(iryna, 'Ні');
  await iryna.getByText(Q3).first().waitFor({ timeout: 120_000 });
  await click(iryna, 'Так');
  await iryna.getByText(Q4).first().waitFor({ timeout: 120_000 });
  await field(iryna, 'Ваша відповідь').fill('Роман-Кош');
  await click(iryna, 'Відповісти');
  await iryna.locator('a.challenge-board-link').waitFor({ timeout: 180_000 });
  await iryna.goto(url);
  await iryna.locator('table.challenge-results tbody tr').nth(1).waitFor();
  const rowsFor = async (page: Page, id = code) => (await (await page.request.get(`${base}/api/challenges/${id}/results`)).json()) as Row[];
  const tarasView = await rowsFor(taras2);
  const irynaView = await rowsFor(iryna);
  expect(tarasView.map((r) => [r.place, r.nickname, r.done, r.me])).toEqual([[1, 'Тарас', true, true], [2, 'Ірина', true, false]]);
  expect(irynaView.map((r) => [r.place, r.nickname, r.done, r.me])).toEqual([[1, 'Тарас', true, false], [2, 'Ірина', true, true]]);
  expect(tarasView[0]!.score).toBeGreaterThan(irynaView[1]!.score);
  expect(await iryna.locator('table.challenge-results tbody tr.is-me').innerText()).toContain('Ірина');
  await expectNoSideScroll(iryna, 'p44-results-two');
  await viewportShot(iryna, 'p44-results-two-viewport');
  expect((await rowsFor(olena)).length, 'the author sees both').toBe(2);

  // «Довгий» ім'я з 20 символів: стартує й нічого не грає — рядок «не завершено», без бокового скролу.
  const longName = 'Ярославдовгоіменник1';
  const long = await light(await open('long44', 360, 740));
  await register(long, 'menu', longName, 'long44@example.com');
  expect((await long.request.post(`${base}/api/challenges/${code}/attempt`)).status()).toBe(201);
  // Лише почав — таблиці ще не бачить.
  await long.goto(url);
  await long.getByText('Таблицю видно після власної гри.', exact).waitFor();
  await long.getByRole('button', { name: 'Продовжити', ...exact }).waitFor();
  expect(await long.locator('table.challenge-results').count()).toBe(0);
  expect((await long.request.get(`${base}/api/challenges/${code}/results`)).status()).toBe(403);
  // Автор бачить рядок: «не завершено», «—» замість часу, нижче тих, хто дограв, при рівних балах.
  await olena.goto(url);
  await olena.locator('table.challenge-results tbody tr').nth(2).waitFor();
  const table = olena.locator('table.challenge-results');
  expect(await table.innerText()).toContain(longName);
  const longRow = table.locator('tbody tr', { hasText: longName });
  expect(await longRow.innerText()).toContain('не завершено');
  expect(await longRow.locator('td.cr-num').nth(1).innerText()).toBe('—');
  const authorView = await rowsFor(olena);
  expect(authorView.map((r) => r.nickname).at(-1), 'an unfinished 0-point row sits below the finished ones').toBe(longName);
  // Час не переноситься: комірка в один рядок.
  for (const cell of await table.locator('td.cr-num').all()) {
    const lines = await cell.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    });
    expect(lines, await cell.innerText()).toBe(1);
  }
  await expectNoSideScroll(olena, 'p44-results-long-nick');
  await viewportShot(olena, 'p44-results-long-nick-viewport');

  // Автор теж грає: рядок «автор» (перше запитання, далі лишає).
  await olena.goto(url);
  await click(olena, 'Почати');
  await olena.waitForURL(/\/play\/[^/]+$/);
  await click(olena, 'Почати гру');
  await olena.getByText(Q1).first().waitFor({ timeout: 120_000 });
  await pickOption(olena, 'Дніпро');
  await olena.getByText(Q2).first().waitFor({ timeout: 120_000 });
  const olenaRoom = olena.url().split('/').pop()!;
  // «Мої вікторини»: банер «Повернутися до гри» веде назад у власну кімнату виклику (код кімнати відповідає своєму гравцеві).
  await olena.goto(`${base}/quizzes`);
  const banner = olena.locator('a.banner', { hasText: 'Повернутися до гри' });
  await banner.waitFor();
  expect(await banner.getAttribute('href')).toBe(`/play/${olenaRoom}`);
  expect(problems.filter((problem) => byCode404.test(problem) && !problem.startsWith('iryna44 ')), 'no by-code 404 on the author’s own pages').toEqual([]);
  await olena.goto(url);
  await olena.locator('table.challenge-results tbody tr').nth(3).waitFor();
  const authorRows = (await rowsFor(olena)).filter((r) => r.author);
  expect(authorRows.map((r) => [r.nickname, r.me, r.done])).toEqual([['Олена', true, false]]);
  expect(await olena.locator('table.challenge-results tr.is-me').innerText()).toContain('автор');
  await viewportShot(olena, 'p44-results-author-viewport');

  // 79: «Історія» → «Виклики»: надісланий виклик зі спробами, найкращим результатом і посиланням на таблицю.
  await olena.goto(`${base}/history/challenges`);
  await olena.getByRole('heading', { level: 1, name: 'Мої виклики', ...exact }).waitFor();
  const sentRow = olena.locator('section.challenges-part li', { hasText: 'Річки 44' });
  await sentRow.waitFor();
  expect(await sentRow.innerText()).toMatch(/зіграл[аи] \d+ (людина|людини|людей)/);
  expect(await sentRow.innerText()).toContain('Найкраще: ');
  expect(await sentRow.getByRole('link', { name: 'Таблиця', ...exact }).getAttribute('href')).toBe(new URL(url).pathname);
  await olena.getByText('Нових викликів від друзів немає.', exact).waitFor();
  expect(await olena.locator('nav.history-tabs a[aria-current="page"]').innerText()).toBe('Виклики');
  await expectNoSideScroll(olena, 'p79-my-challenges');
  await viewportShot(olena, 'p79-my-challenges-viewport');

  // ── 8. «Петро» стартує й кидає; термін спливає. ──
  const petro = await light(await open('petro44', 360, 740));
  await register(petro, 'menu', 'Петро', 'petro44@example.com');
  await petro.goto(url);
  await click(petro, 'Почати');
  await petro.waitForURL(/\/play\/[^/]+$/);
  await click(petro, 'Почати гру');
  await petro.getByText(Q1).first().waitFor({ timeout: 120_000 });
  await pickOption(petro, 'Дніпро');
  await petro.getByText(Q2).first().waitFor({ timeout: 120_000 });
  await db.update(challenge).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(challenge.code, code));
  await petro.goto(url);
  await petro.getByText('Виклик завершено.', exact).waitFor();
  expect(await petro.getByRole('button', { name: 'Продовжити', ...exact }).count()).toBe(0);
  const closed = await petro.request.post(`${base}/api/challenges/${code}/attempt`);
  expect(closed.status()).toBe(409);
  expect(await closed.json()).toEqual({ error: 'challenge_closed' });
  await petro.locator('table.challenge-results tbody tr').nth(4).waitFor();
  const petroRow = (await rowsFor(petro)).find((r) => r.nickname === 'Петро')!;
  expect(petroRow.done).toBe(false);
  expect(petroRow.score).toBeGreaterThan(0);
  expect(await petro.locator('table.challenge-results tr.is-me').innerText()).toContain('не завершено');
  await expectNoSideScroll(petro, 'p44-card-expired');
  await viewportShot(petro, 'p44-card-expired-viewport');

  const oksana = await light(await open('oksana44', 360, 740));
  await register(oksana, 'menu', 'Оксана', 'oksana44@example.com');
  await oksana.goto(url);
  await oksana.getByText('Виклик завершено.', exact).waitFor();
  expect(await oksana.getByRole('button', { name: 'Почати', ...exact }).count()).toBe(0);
  await oksana.getByText('Таблицю видно після власної гри.', exact).waitFor();
  expect((await oksana.request.get(`${base}/api/challenges/${code}/results`)).status()).toBe(403);
  expect((await oksana.request.post(`${base}/api/challenges/${code}/attempt`)).status()).toBe(409);

  // ── 9. Автор замінює виклик: старе посилання завершено, таблиця старого відкривається Тарасу. ──
  await olena.goto(`${base}/quizzes`);
  await cardAction(olena, 'Річки 44', '🏁 Виклик');
  const dialog2 = olena.getByRole('dialog', { name: 'Виклик другові', ...exact });
  const linkNow = async () => CODE.exec(await dialog2.getByLabel('Посилання на виклик', exact).inputValue())![1]!;
  // Виклик уже прострочено: активного немає, тож кнопка — «Створити виклик».
  await dialog2.getByRole('button', { name: /^(Створити виклик|Новий виклик)$/ }).click();
  await expect.poll(linkNow).not.toBe(code);
  const second = await linkNow();
  // Щойно створено — замінити в тому самому вікні нічим; знову «🏁 Виклик» — і «Новий виклик» замінює активний.
  expect(await dialog2.getByRole('button', { name: 'Новий виклик', ...exact }).count()).toBe(0);
  await dialog2.getByRole('button', { name: 'Закрити', ...exact }).click();
  await dialog2.waitFor({ state: 'detached' });
  await cardAction(olena, 'Річки 44', '🏁 Виклик');
  await expect.poll(linkNow).toBe(second);
  await dialog2.getByRole('button', { name: 'Новий виклик', ...exact }).click();
  await expect.poll(linkNow).not.toBe(second);
  const third = await linkNow();
  await expectNoSideScroll(olena, 'p44-launch-replaced');
  await dialog2.getByRole('button', { name: 'Закрити', ...exact }).click();
  await oksana.goto(`${base}/challenge/${second}`);
  await oksana.getByText('Виклик завершено.', exact).waitFor();
  expect(await oksana.getByRole('button', { name: 'Почати', ...exact }).count()).toBe(0);
  expect((await oksana.request.post(`${base}/api/challenges/${second}/attempt`)).status()).toBe(409);
  await oksana.goto(`${base}/challenge/${third}`);
  await click(oksana, 'Почати');
  await oksana.waitForURL(/\/play\/[^/]+$/);
  await taras2.goto(url);
  await taras2.getByText('Виклик завершено.', exact).waitFor();
  await taras2.locator('table.challenge-results tbody tr').first().waitFor();
  expect((await rowsFor(taras2)).length).toBeGreaterThanOrEqual(5);
  const mine = await olena.request.get(`${base}/api/challenges`);
  expect(((await mine.json()) as { code: string }[]).map((c) => c.code)).toEqual([third]);

  // ── 10. Світла тема на всіх кадрах. ──
  for (const [name, page] of [['olena', olena], ['guest', guest], ['taras2', taras2], ['iryna', iryna], ['long', long], ['petro', petro], ['oksana', oksana]] as const) {
    expect(await isLight(page), `${name}: light theme class`).toBe(true);
  }
  // Кімната виклику прихована від чужих: лише спроба Ірини увійти в кімнату Тараса (код, join, slots) дає очікуваний 404.
  const hiddenRoom404 = new RegExp(`^iryna44 console: .*404 \\(Not Found\\) @ .*/api/games/by-code/${room}(/join|/slots)?$`);
  expect(problems.filter((problem) => !hiddenRoom404.test(problem))).toEqual([]);
}
