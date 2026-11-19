import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeRoundsQuiz, classicRound, single, text, timedlist } from '@quiz/engine/testing';
import { type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, join, register, POLL, seconds, sleep, step27a, reveal28a, next27a, png29d } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, noSplashLayer, ARTIFACTS, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 55 — липка смужка таймера на телефоні й пульті, «останні 5 с», сцена без змін.
 * Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

const scenario = (run: (sockets: Socket[]) => Promise<void>) => async () => {
  const sockets: Socket[] = [];
  try {
    await run(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
  expect(problems).toEqual([]);
};

it('part 55: phone 320×568 dark and 360×740 light — the strip appears when the question timer scrolls away, shows the same seconds, leaves when it is back, does not cover the focused answer field and does not scroll sideways', scenario(phones55), 600_000);
it('part 55: pause and the last five seconds — the strip says «Пауза» while the host pauses, then turns accent with the main timer in the last 5 s; reduced motion shows it without animation', scenario(pauseEnding55), 600_000);
it('part 55: host panel 360×740 — the strip appears on the host console when its timer scrolls away and is host-wide, the stage has none', scenario(hostPanel55), 600_000);

const strip55 = (page: Page) => page.locator('.timer-sticky');
const toBottom55 = (page: Page) => page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
const toTop55 = (page: Page) => page.evaluate('window.scrollTo(0, 0)');
const stripSeconds55 = async (page: Page): Promise<number> => Number((await page.locator('.timer-sticky-left').first().textContent())?.replace(/\D/g, ''));
const noSideScroll55 = async (page: Page, name: string) => expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), `${name}: horizontal scroll`).toBe(true);

/** Кадр лише області перегляду; тема перевіряється за прапорцем. */
async function vshot55(page: Page, name: string, light: boolean) {
  expect(await page.evaluate(() => document.documentElement.classList.contains('is-light')), `${name}: light theme`).toBe(light);
  if (process.env.E2E_SHOTS !== '1') return;
  await noSplashLayer(page);
  await sleep(400); // смужка домальовується 160 мс
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`), fullPage: false });
}

/** Довгий текст запитання (ліміт — 300 символів): про Дніпро, Дністер, Південний Буг і Десну. */
const longText = () =>
  'Дніпро впадає в Чорне море, Дністер тече до лиману біля Одеси, Південний Буг — до Миколаєва, а Десна — найбільша притока Дніпра, що тече повз Чернігів до Києва. Усі вони пов’язані з історією України. Яка з названих річок найдовша на території України, якщо рахувати лише український відтинок?';

const questions55 = (image: string, ...which: ('long' | 'list' | 'single')[]) =>
  which.map((kind, index) => {
    const id = `q55${index + 1}`;
    if (kind === 'long') return { ...text, id, text: longText(), imageUrl: image, accepted: ['Дніпро'], timeLimit: 60 };
    if (kind === 'list') {
      const items = ['Десна', 'Прип’ять', 'Інгулець', 'Сула', 'Псел', 'Ворскла'].map((name, i) => ({ id: `l${i + 1}`, text: name, accepted: [] }));
      return { ...timedlist, id, text: 'Притоки Дніпра', items, timeLimit: 60 };
    }
    return {
      ...single,
      id,
      text: 'Яка річка тече через Київ?',
      options: [
        { id: 'a', text: 'Дніпро' },
        { id: 'b', text: 'Дністер' },
        { id: 'c', text: 'Сіверський Донець' },
        { id: 'd', text: 'Тиса' },
      ],
      correctId: 'a',
      timeLimit: 25,
    };
  });

interface Phone55 {
  nickname: string;
  width: number;
  height: number;
  light: boolean;
  reduced?: boolean;
}

/** Ведучий, сцена й телефони з теми й розміру; гра доходить до першого запитання. */
async function game55(tag: string, kinds: ('long' | 'list' | 'single')[], specs: Phone55[]) {
  const host = await open(`host55${tag}`, 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', `host55${tag}@example.com`);
  // Текст запитання — до 300 символів, тож зверху — квадратна картинка: сторінка вища за екран телефона.
  const upload = await host.request.post(`${base}/api/uploads`, { data: png29d(600, 600, (x, y) => [40 + ((x + y) % 60), 90, 140]), headers: { 'content-type': 'image/png' } });
  expect(upload.ok(), await upload.text()).toBe(true);
  const image = ((await upload.json()) as { url: string }).url;
  const data = { ...makeRoundsQuiz([classicRound('r55', questions55(image, ...kinds) as never)], { leaderboard: 'end' }), title: 'Річки України 55' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Річки України 55' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open(`stage55${tag}`, 1280, 720);
  await stage.goto(stageUrl);
  const phones: Page[] = [];
  for (const spec of specs) {
    const page = await open(`${spec.nickname}55${tag}`, spec.width, spec.height, spec.reduced ? { reducedMotion: 'reduce' } : {});
    if (spec.light) await page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
    await join(page, code, spec.nickname, false);
    phones.push(page);
  }
  await stage.getByText(specs[specs.length - 1]!.nickname).waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  return { host, stage, phones };
}

/** Смужка видна, не вища за 40 px, ховається від читача екрана; секунди ті самі, що й на основному таблі. */
async function expectStrip55(page: Page, name: string) {
  await expect.poll(() => strip55(page).count(), POLL).toBe(1);
  await expect.poll(() => strip55(page).isVisible(), POLL).toBe(true);
  expect((await strip55(page).boundingBox())!.height, `${name}: strip height`).toBeLessThanOrEqual(40);
  expect(await strip55(page).getAttribute('aria-hidden'), `${name}: aria-hidden`).toBe('true');
  expect(await page.getByRole('timer').count(), `${name}: one timer for the reader`).toBe(1);
  await expect.poll(async () => Math.abs((await stripSeconds55(page)) - (await seconds(page))) <= 1, POLL).toBe(true);
}

async function strip55Run(page: Page, name: string, shot: string, light: boolean, field: boolean) {
  // 45b: поле відповіді отримує фокус саме й прокручує сторінку до себе — повертаємося нагору, щоб перевірити початок.
  await toTop55(page);
  await expect.poll(() => page.evaluate('window.scrollY'), POLL).toBe(0);
  // На 360×740 запитання вміщається без прокрутки: екран зменшується до висоти телефона з клавіатурою.
  if (!(await page.evaluate('document.documentElement.scrollHeight > innerHeight + 100'))) await page.setViewportSize({ width: 360, height: 420 });
  expect(await page.evaluate('document.documentElement.scrollHeight > innerHeight + 100'), `${name}: the page scrolls`).toBe(true);
  await expect.poll(() => strip55(page).count(), { ...POLL, message: `${name}: no strip at the top` }).toBe(0);
  await toBottom55(page);
  await expectStrip55(page, name);
  await noSideScroll55(page, name);
  await expect.poll(async () => (await strip55(page).boundingBox())!.y, POLL).toBe(0);
  const top = await page.evaluate(() => { const strip = document.querySelector<HTMLElement>('.timer-sticky')!;
    strip.style.pointerEvents = 'auto'; // elementFromPoint пропускає смужку з pointer-events: none
    const el = document.elementFromPoint(innerWidth / 2, 4)!;
    strip.style.pointerEvents = ''; return `${el.tagName}.${el.className} in strip: ${el.closest('.timer-sticky') !== null}; rect ${JSON.stringify(document.querySelector('.timer-sticky')!.getBoundingClientRect())}`; });
  expect(top, `${name}: the strip is the top layer`).toContain('in strip: true');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.timer-sticky')!).backgroundColor), `${name}: the strip is opaque`).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  await vshot55(page, shot, light);
  if (field) {
    const input = page.getByLabel('Ваша відповідь', exact);
    await input.focus();
    await input.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect.poll(async () => (await input.boundingBox())!.y >= (await strip55(page).boundingBox())!.y + (await strip55(page).boundingBox())!.height, POLL).toBe(true);
    await vshot55(page, `${shot}-field`, light);
    await input.blur();
  }
  await toTop55(page);
  await expect.poll(() => strip55(page).count(), POLL).toBe(0);
}

async function phones55(_sockets: Socket[]) {
  const { host, stage, phones } = await game55('a', ['long', 'list', 'single'], [
    { nickname: 'Оля', width: 320, height: 568, light: false },
    { nickname: 'Петро', width: 360, height: 740, light: true },
  ]);
  const [olya, petro] = phones as [Page, Page];
  await olya.getByLabel('Ваша відповідь', exact).waitFor();
  await petro.getByLabel('Ваша відповідь', exact).waitFor();
  expect(await stage.locator('.timer-sticky').count(), 'the stage at the start').toBe(0);

  await strip55Run(olya, 'Оля 320 dark', 'sticky55-320-dark', false, true);
  await strip55Run(petro, 'Петро 360 light', 'sticky55-360-light', true, true);
  expect(await stage.locator('.timer-sticky').count(), 'the stage has no strip').toBe(0);

  // ── Запитання 2 (timedlist): смужка з'являється після прокрутки. ──
  await reveal28a(host);
  await next27a(host);
  await afterSplash(host, stage, olya, petro);
  await olya.getByRole('timer').first().waitFor();
  await olya.getByText('Притоки Дніпра').first().waitFor();
  // 45b: поле відповіді отримує фокус саме й прокручує сторінку до себе — повертаємося нагору, щоб перевірити початок.
  await toTop55(olya);
  await expect.poll(() => olya.evaluate('window.scrollY'), POLL).toBe(0);
  // Шість пунктів вміщаються в 320×568: висота зменшується до телефона з клавіатурою.
  if (!(await olya.evaluate('document.documentElement.scrollHeight > innerHeight + 100'))) await olya.setViewportSize({ width: 320, height: 420 });
  expect(await olya.evaluate('document.documentElement.scrollHeight > innerHeight + 100'), 'the timedlist page scrolls').toBe(true);
  await expect.poll(() => strip55(olya).count(), { ...POLL, message: 'no strip at the top of the list' }).toBe(0);
  await toBottom55(olya);
  await expectStrip55(olya, 'Оля timedlist');
  await noSideScroll55(olya, 'Оля timedlist');
  await vshot55(olya, 'sticky55-320-list', false);
  await toTop55(olya);
  await expect.poll(() => strip55(olya).count(), POLL).toBe(0);
  expect(await stage.locator('.timer-sticky').count(), 'the stage on the list question').toBe(0);
}

async function pauseEnding55(_sockets: Socket[]) {
  const { host, stage, phones } = await game55('b', ['single'], [
    { nickname: 'Петро', width: 360, height: 740, light: true },
    { nickname: 'Віра', width: 360, height: 740, light: true, reduced: true },
  ]);
  const [petro, vira] = phones as [Page, Page];
  for (const page of phones) {
    await page.getByRole('timer').first().waitFor();
    if (!(await page.evaluate('document.documentElement.scrollHeight > innerHeight + 60'))) await page.setViewportSize({ width: 360, height: 420 });
    await toBottom55(page);
    await expectStrip55(page, 'before the pause');
  }
  await host.getByRole('button', { name: 'Пауза', ...exact }).first().click();
  for (const page of phones) {
    await expect.poll(() => page.locator('.timer-sticky-status').textContent(), POLL).toBe('Пауза');
    const first = await stripSeconds55(page);
    await sleep(1500);
    expect(await stripSeconds55(page), 'the strip stands while paused').toBe(first);
    expect(await page.locator('.timer.is-ending').count(), 'no last-five-seconds on pause').toBe(0);
    expect(await page.locator('.timer-sticky.is-ending').count(), 'no ending strip on pause').toBe(0);
  }
  expect(await stage.locator('.timer-sticky').count(), 'the stage has no strip').toBe(0);
  await click(host, 'Продовжити');
  for (const page of phones) await expect.poll(() => page.locator('.timer-sticky-status').count(), POLL).toBe(0);

  for (const page of phones) {
    await expect.poll(() => seconds(page), { timeout: 30_000, interval: 100 }).toBeLessThanOrEqual(5);
  }
  for (const page of phones) {
    await expect.poll(() => page.locator('.timer.is-ending').count(), { timeout: 3000 }).toBe(1);
    await expect.poll(() => page.locator('.timer-sticky.is-ending').count(), { timeout: 3000 }).toBe(1);
  }
  expect(await vira.evaluate(() => getComputedStyle(document.querySelector('.timer-sticky')!).animationName), 'reduced motion: no strip animation').toBe('none');
  await vshot55(petro, 'sticky55-360-ending-light', true);
}

async function hostPanel55(_sockets: Socket[]) {
  const { host, stage } = await game55('c', ['long'], [{ nickname: 'Оля', width: 360, height: 740, light: false }]);
  await host.setViewportSize({ width: 360, height: 740 });
  await host.getByRole('timer').first().waitFor();
  expect(await host.evaluate('document.documentElement.scrollHeight > innerHeight + 60'), 'the host panel scrolls').toBe(true);
  expect(await host.locator('.timer-sticky').count(), 'no strip at the top').toBe(0);
  await toBottom55(host);
  await expect.poll(() => host.locator('.timer-sticky.is-host').isVisible(), POLL).toBe(true);
  expect((await host.locator('.timer-sticky.is-host').boundingBox())!.height, 'the host strip height').toBeLessThanOrEqual(40);
  expect((await host.locator('.timer-sticky.is-host').boundingBox())!.width, 'the host strip is full width').toBeGreaterThanOrEqual(359);
  await noSideScroll55(host, 'host panel 360');
  await expect.poll(async () => Math.abs((await stripSeconds55(host)) - (await seconds(host))) <= 1, POLL).toBe(true);
  await vshot55(host, 'sticky55-host-360', false);
  await toTop55(host);
  await expect.poll(() => host.locator('.timer-sticky').count(), POLL).toBe(0);
  expect(await stage.locator('.timer-sticky').count(), 'the stage has no strip').toBe(0);
}
