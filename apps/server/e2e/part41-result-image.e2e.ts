import { readFileSync } from 'node:fs';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { open, click, join, expectNoSideScroll, register, noSideScroll, pickOption } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 41 — картинка підсумку (38c): кнопка «📸 Підсумок картинкою» на фінальному екрані телефона
 * (після церемонії призів), в панелі фіналу пульта й на сторінці завершеної гри в історії (на сцені її немає), прев'ю
 * з «Завантажити» (без Web Share) і «Закрити», PNG 1080×1350 зі світлим тлом і текстом, кубки й досягнення гри
 * в GET /api/games/<id> без email, світла тема, телефон 360 px.
 */

useE2eServer();

const TITLE = 'Природа й річки України 41';
const BUTTON = /Підсумок картинкою/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const OLYA_EMAIL = 'olya41@example.com';

it('part 41: result image — a phone at 360 px and the host share a 1080×1350 summary, a preview opens, the history page draws the prizes and achievements', async () => {
  try {
    await resultImage41();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

/** Світла тема на всіх сторінках контексту до першого завантаження. */
async function light41(page: Page): Promise<Page> {
  await page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  return page;
}

/** Телефон без Web Share: «Завантажити» — єдина дія (canShare живе на прототипі, не на самому navigator). */
async function noShare41(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (Navigator.prototype as unknown as { canShare?: unknown }).canShare;
    delete (navigator as unknown as { canShare?: unknown }).canShare;
  });
}

function expectPng41(png: Buffer, label: string): void {
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE), `${label}: not a PNG`).toBe(true);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)], `${label}: size`).toEqual([1080, 1350]);
}

/**
 * Кнопка → діалог «Підсумок гри» з картинкою 1080×1350; shotName — кадр (і без бокового скролу) з відкритим діалогом;
 * «Завантажити» дає pidsumok-<назва>.png; Escape закриває діалог, фокус — на кнопці. Повертає PNG.
 */
async function previewAndDownload41(page: Page, label: string, shotName: string, { sideScroll = false }: { sideScroll?: boolean } = {}): Promise<Buffer> {
  const button = page.getByRole('button', { name: BUTTON });
  await button.waitFor({ timeout: 40_000 });
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Підсумок гри', ...exact });
  await dialog.waitFor();
  const image = dialog.getByRole('img', { name: 'Картинка з підсумком гри', ...exact });
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => [img.complete ? img.naturalWidth : 0, img.naturalHeight]), { message: `${label}: preview image`, timeout: 10_000 })
    .toEqual([1080, 1350]);
  // Кнопки діалогу в межах вікна.
  const viewport = page.viewportSize()!;
  for (const name of ['Завантажити', 'Закрити']) {
    const box = (await dialog.getByRole('button', { name, ...exact }).boundingBox())!;
    expect(box.x >= 0 && box.x + box.width <= viewport.width && box.y >= 0 && box.y + box.height <= viewport.height, `${label}: «${name}» leaves the window`).toBe(true);
  }
  if (sideScroll) await expectNoSideScroll(page, shotName);
  else await shot(page, shotName);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Завантажити', ...exact }).click()]);
  expect(download.suggestedFilename(), `${label}: file name`).toBe(`pidsumok-${TITLE.replace(/ /g, "-")}.png`);
  const png = readFileSync((await download.path())!);
  expectPng41(png, label);
  expect(await page.getByRole('alert').filter({ hasText: 'Не вдалося створити картинку.' }).count(), `${label}: failed`).toBe(0);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  expect(await button.evaluate((el) => el === document.activeElement), `${label}: focus did not return to the button`).toBe(true);
  return png;
}

async function resultImage41() {
  // ── 1. Ведучий: кубок на 1-ше місце; Оля з акаунтом, Петро й Іра — гості. ──
  const host = await light41(await open('host41', 1280, 800));
  await register(host, 'host', 'Марта Ведуча', 'host41@example.com');
  const cup = { name: 'Кубок 41', trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false };
  const made = await host.request.post(`${base}/api/me/prizes`, { data: cup });
  expect(made.status(), await made.text()).toBe(201);

  const common = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  const questions = [
    { ...common, id: 'n1', type: 'single' as const, text: 'Яка річка протікає через Київ?', options: options('Дніпро', 'Дністер', 'Південний Буг', 'Десна'), correctId: 'a' },
    { ...common, id: 'n2', type: 'single' as const, text: 'Яка з цих річок впадає в Чорне море на заході України?', options: options('Дністер', 'Дніпро', 'Десна', 'Сейм'), correctId: 'a' },
    { ...common, id: 'n3', type: 'single' as const, text: 'Яка гора найвища в Україні?', options: options('Говерла', 'Піп Іван', 'Петрос', 'Бребенескул'), correctId: 'a' },
  ];
  const quiz = { ...makeRoundsQuiz([classicRound('r1', questions as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]), title: TITLE };
  const created = await host.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(created.ok(), await created.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: TITLE }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);

  const stage = await light41(await open('stage41', 1280, 720));
  await stage.goto((await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
  const olya = await light41(await open('olya41', 360, 740));
  await noShare41(olya);
  await register(olya, 'menu', 'Оля', OLYA_EMAIL);
  const petro = await light41(await open('petro41', 360, 740));
  const ira = await light41(await open('ira41', 360, 740));
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await host.getByText('Іра', exact).first().waitFor();

  const panel = host.locator('section.prize-places');
  await panel.getByRole('heading', { name: 'Призи гри', ...exact }).waitFor();
  const firstPlace = panel.locator('.prize-place').nth(0).locator('select');
  await firstPlace.locator('option', { hasText: 'Кубок 41' }).waitFor({ state: 'attached' });
  await firstPlace.selectOption({ label: 'Кубок 41' });
  await panel.getByRole('button', { name: 'Покласти призи', ...exact }).click();
  await panel.getByText('Призи покладено.', exact).waitFor();

  // ── 2. Гра: Оля правильно на все, Петро на одне, Іра ні на що. ──
  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  const players = [olya, petro, ira];
  const answers = async (picks: [string, string, string]) => {
    for (const [index, page] of players.entries()) {
      await page.getByRole('button', { name: new RegExp(picks[index]!) }).waitFor();
      await pickOption(page, picks[index]!);
    }
    await host.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
  };
  await step('Почати гру');
  await afterSplash(host, stage, ...players);
  await step('Почати раунд');
  await afterSplash(host, stage, ...players);
  await answers(['Дніпро', 'Дніпро', 'Десна']);
  await step('Далі');
  await step('Наступне запитання');
  await afterSplash(host, stage, ...players);
  await answers(['Дністер', 'Дніпро', 'Сейм']);
  await step('Далі');
  await step('Наступне запитання');
  await afterSplash(host, stage, ...players);
  await answers(['Говерла', 'Піп Іван', 'Петрос']);
  await step('Завершити гру');

  // ── 3. Телефон Олі (360 px, без Web Share): кнопка після церемонії, прев'ю, завантаження, чорнила. ──
  await olya.locator('section.my-prize').getByRole('heading', { name: 'Твій приз', ...exact }).waitFor({ timeout: 40_000 });
  const olyaPng = await previewAndDownload41(olya, 'Оля', 'p41-phone-preview', { sideScroll: true });
  const dialogOpen = olya.getByRole('button', { name: BUTTON });
  await dialogOpen.click();
  const olyaDialog = olya.getByRole('dialog', { name: 'Підсумок гри', ...exact });
  await olyaDialog.waitFor();
  expect(await olyaDialog.getByRole('button', { name: 'Поділитися', ...exact }).count(), 'Share without Web Share').toBe(0);
  await olya.keyboard.press('Escape');
  await olyaDialog.waitFor({ state: 'detached' });
  expect(await noSideScroll(olya), 'the phone final screen scrolls sideways').toBe(true);

  // ── 4. Гості Петро й Іра: кнопка є, прев'ю відкривається, PNG 1080×1350. ──
  await previewAndDownload41(petro, 'Петро', 'p41-phone-preview-petro', { sideScroll: true });
  await previewAndDownload41(ira, 'Іра', 'p41-phone-preview-ira', { sideScroll: true });

  // ── 5. Пульт: 1280×800 і окремо 360 px. ──
  await previewAndDownload41(host, 'пульт 1280', 'p41-host-preview');
  await host.setViewportSize({ width: 360, height: 740 });
  await previewAndDownload41(host, 'пульт 360', 'p41-host-preview-360', { sideScroll: true });
  expect(await noSideScroll(host), 'the host final panel scrolls sideways at 360 px').toBe(true);
  await host.setViewportSize({ width: 1280, height: 800 });

  // ── 6. Сторінка гри в історії ведучого: кнопка, прев'ю, дані кубків і досягнень, без email. ──
  await host.goto(`${base}/history`);
  const [response] = await Promise.all([
    host.waitForResponse((r) => r.request().method() === 'GET' && /\/api\/games\/[^/?]+$/.test(r.url())),
    host.getByRole('link', { name: new RegExp(TITLE) }).click(),
  ]);
  const body = await response.text();
  const game = JSON.parse(body) as { result?: { prizes: { place: number; trophy: { kind: string } | null; winners: string[] }[]; achievements: { nickname: string; ids: string[] }[] } };
  expect(game.result?.prizes[0], 'history prizes').toMatchObject({ place: 1, trophy: { kind: 'cup' }, winners: ['Оля'] });
  expect(game.result?.achievements.map((a) => a.nickname), 'history achievements').toContain('Оля');
  expect(body, 'email in the history response').not.toContain(OLYA_EMAIL);
  const historyPng = await previewAndDownload41(host, 'історія', 'p41-history-preview');

  // ── 7. Сцена на фініші кнопки не має. ──
  await stage.locator('.stage-board.is-final').waitFor({ timeout: 20_000 });
  expect(await stage.getByRole('button', { name: BUTTON }).count(), 'the stage has the button').toBe(0);
  await shot(stage, 'p41-stage-final');

  // ── 8. Чорнила: картинка в <img> на сторінці 1080×1350 — текст є, тло світле. ──
  const check = await open('ink41', 1080, 1350);
  for (const [label, png] of [['Оля', olyaPng], ['історія', historyPng]] as const) {
    await check.setContent(`<!doctype html><body style="margin:0"><img id="d" src="data:image/png;base64,${png.toString('base64')}"></body>`);
    const ink = (await check.evaluate(`(async () => {
      const img = document.getElementById('d');
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(img, 0, 0);
      const { data } = context.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
      let dark = 0, sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const total = data[i] + data[i + 1] + data[i + 2];
        if (total < 200) dark++;
        sum += total / 3;
      }
      return { width: img.naturalWidth, height: img.naturalHeight, dark, mean: sum / (data.length / 4) };
    })()`)) as { width: number; height: number; dark: number; mean: number };
    expect([ink.width, ink.height], label).toEqual([1080, 1350]);
    expect(ink.dark, `${label}: the image has no text`).toBeGreaterThan(5000);
    expect(ink.mean, `${label}: the background is not light`).toBeGreaterThan(200);
    await shot(check, `p41-png-${label === 'Оля' ? 'phone' : 'history'}`);
  }

  expect(problems).toEqual([]);
}
