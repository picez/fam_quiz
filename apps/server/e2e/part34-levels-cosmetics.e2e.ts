import { randomUUID } from 'node:crypto';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { STICKERS_BY_PACK, xpForLevel, type NickEffect, type NickColor, type NickFrame, type ReactionItem, type StickerPackId } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { profile, userAchievement, xpEntry } from '../src/db/schema';
import { settleStickerLegacy } from '../src/xp-store';
import { kyivDay } from '../src/xp-rules';
import { open, click, join, expectNoSideScroll, expectStageInView, register, myId, POLL, pickOption } from './helpers/common';
import { exact, base, db, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 34 — ефекти ніку на телефонах 375 і 320 та на сцені, нерухомий кадр за зменшеного руху й у легкому
 * режимі, стікери за наборами (гість, досягнення, успадкування — рішення власника «м'якше») і рівень 40. Потребує pnpm build і Chrome.
 */

useE2eServer();

it('part 34: every nick effect on 375 and 320 phones and in the 1280 stage lobby and leaderboard, never widening a nickname; the flame stands still with reduced motion and in easy mode', async () => {
  try {
    await effects34();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 34: stickers open by packs — a guest sees «Смаколики» folded with a preview and the server refuses it, «Нічна сова» opens «Моторошики» early, an existing account keeps what the old series rule gave', async () => {
  try {
    await stickers34();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 34: level 40 shows everything open and wears the flame with sunflowers in the profile header on 375 and 320', async () => {
  try {
    await level40();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

const yesterday = () => new Date(Date.now() - 24 * 3600 * 1000);

/** Акаунт: реєстрація, профіль (мітка ретро), досвід до рівня level учорашнім числом. */
async function account34(page: Page, name: string, email: string, level: number): Promise<string> {
  await register(page, 'menu', name, email);
  await page.goto(`${base}/profile/looks`);
  await page.locator('section.level-card').waitFor();
  const id = await myId(page);
  const at = yesterday();
  if (level > 1) await db.insert(xpEntry).values({ userId: id, source: 'game', gameId: randomUUID(), amount: xpForLevel(level), counted: false, day: kyivDay(at), at, createdAt: at });
  return id;
}

async function wear34(page: Page, looks: { color?: NickColor; frame?: NickFrame; effect: NickEffect }) {
  const saved = await page.request.put(`${base}/api/me/looks`, { data: { color: looks.color ?? null, frame: looks.frame ?? null, badge: null, photo: null, font: null, effect: looks.effect } });
  expect(saved.ok(), await saved.text()).toBe(true);
}

/** Вікторина через API, «Грати», сцена: код і сцена. */
async function game34(host: Page, title: string): Promise<{ code: string; stageUrl: string }> {
  const common = { imageUrl: null, video: null, points: 1000 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  const questions = [
    { ...common, id: 'v1', type: 'single' as const, text: 'Яка річка тече через Вінницю?', options: options('Південний Буг', 'Дністер', 'Рось', 'Десна'), correctId: 'a', timeLimit: 30 },
    { ...common, id: 'v2', type: 'boolean' as const, text: 'Чи є у вовка смугастий хвіст?', correct: false, timeLimit: 25 },
  ];
  const data = { ...makeRoundsQuiz([classicRound('r34', questions as never, { title: 'Родинна розминка', speedBonus: false, shuffleOptions: false })], { leaderboard: 'each' }), title };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  return { code, stageUrl };
}

const step34 = async (host: Page, name: string) => {
  const button = host.getByRole('button', { name, ...exact });
  await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
  await button.click();
};

/** Перше запитання до таблиці: усі відповідають, «Показати відповідь», «Далі». */
async function toLeaderboard34(host: Page, stage: Page, phones: Page[]) {
  await step34(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step34(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  for (const page of phones) {
    await page.getByRole('button', { name: /Південний Буг/ }).waitFor();
    await pickOption(page, 'Південний Буг');
  }
  await host.getByText('Запитання закрите').waitFor();
  await step34(host, 'Показати відповідь');
  await step34(host, 'Далі');
  await stage.locator('.standings').waitFor();
  for (const page of phones) await page.locator('.standings').first().waitFor();
}

/** Шари ефекту на ніку: ім'я анімації й прозорість псевдоелемента. */
const layer34 = (page: Page, selector: string, pseudo: '::before' | '::after') =>
  page.evaluate(
    ([sel, which]) => {
      const el = document.querySelector(sel!);
      if (el === null) return null;
      const style = getComputedStyle(el, which);
      return { animation: style.animationName, opacity: Number(style.opacity) };
    },
    [selector, pseudo],
  ) as Promise<{ animation: string; opacity: number } | null>;

const PLAYERS34: { name: string; email: string; effect: NickEffect; color?: NickColor; frame?: NickFrame; width: 375 | 320 }[] = [
  { name: 'Оленка Вогняна', email: 'olenka34@example.com', effect: 'flame', color: 'flame', width: 375 },
  { name: 'Тарасик', email: 'tarasyk34@example.com', effect: 'light', width: 320 },
  { name: 'Соломія Зоряна', email: 'solomiia34@example.com', effect: 'stardust', width: 375 },
  { name: 'Богдан Наддніпрянець', email: 'bohdan34@example.com', effect: 'bolt', width: 320 },
  { name: 'Ярина', email: 'yaryna34@example.com', effect: 'frost', frame: 'glacier', width: 375 },
  { name: 'Остап', email: 'ostap34@example.com', effect: 'sparks', width: 320 },
  { name: 'Мирослава Переливна', email: 'myroslava34@example.com', effect: 'shimmer', frame: 'aurora', width: 375 },
];

async function effects34() {
  const host = await open('host34a', 1280, 800);
  await register(host, 'host', 'Марта Ведуча', 'host34a@example.com');
  const phones: Page[] = [];
  for (const player of PLAYERS34) {
    const page = await open(`p34-${player.effect}`, player.width, player.width === 320 ? 568 : 812, player.width === 320 ? { hasTouch: true, isMobile: true } : {});
    await account34(page, player.name, player.email, 40);
    await wear34(page, player);
    phones.push(page);
  }
  const { code, stageUrl } = await game34(host, 'Вечір косметики 34');
  const stage = await open('stage34a', 1280, 720);
  await stage.goto(stageUrl);
  for (const [i, player] of PLAYERS34.entries()) await join(phones[i]!, code, player.name, false);

  // ── Лобі: на кожному телефоні власний нік з ефектом; ширина та сама, довгий нік на 320 — «…». ──
  for (const [i, player] of PLAYERS34.entries()) {
    const page = phones[i]!;
    const mine = page.locator(`.chips li.is-me .nick-fx.nick-x-${player.effect} > .nick-name`);
    await mine.waitFor();
    for (const other of PLAYERS34) await page.locator(`.chips .nick-x-${other.effect}`).first().waitFor();
    const box = (await mine.boundingBox())!;
    expect(box.x + box.width, `${player.name}: the nick leaves the ${player.width} phone`).toBeLessThanOrEqual(player.width + 0.5);
    const [scroll, client, overflow] = (await mine.evaluate((el) => [el.scrollWidth, el.clientWidth, getComputedStyle(el).textOverflow])) as [number, number, string];
    expect(overflow).toBe('ellipsis');
    if (player.name === 'Богдан Наддніпрянець') expect(scroll, 'the long nick is cut on 320').toBeGreaterThanOrEqual(client);
    await expectNoSideScroll(page, `p34-lobby-${player.effect}-${player.width}`);
  }
  // Без зменшеного руху полум'я рухається.
  const flame = '.chips li.is-me .nick-x-flame';
  expect((await layer34(phones[0]!, flame, '::before'))!.animation).toMatch(/^nick-fx-flame/);

  // ── Сцена 1280 × 720: у кожного чипа свій ефект. ──
  for (const player of PLAYERS34) await stage.locator('ul.chips li', { hasText: player.name }).locator(`.nick-fx.nick-x-${player.effect}`).waitFor();
  await expectStageInView(stage, 'p34-stage-lobby-effects');

  // ── Таблиця після першого запитання. ──
  await toLeaderboard34(host, stage, phones);
  for (const player of PLAYERS34) await stage.locator('.standings li', { hasText: player.name }).locator(`.nick-x-${player.effect}`).waitFor();
  await shot(stage, 'p34-stage-leaderboard-effects');
  expect(await stage.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'the stage scrolls sideways').toBe(true);
  const taras = phones[1]!;
  await taras.locator('.standings .nick-x-light').first().waitFor();
  await expectNoSideScroll(taras, 'p34-table-effects-320');
  for (const score of await taras.locator('.standings li .score').all()) {
    const scoreBox = (await score.boundingBox())!;
    expect(scoreBox.x + scoreBox.width, 'a score leaves the 320 phone').toBeLessThanOrEqual(320 + 0.5);
  }

  // ── Нерухомість: Оленка на 375 у профілі за зменшеного руху й у легкому режимі. ──
  const cookies = await phones[0]!.context().cookies();
  const header = 'h1 .nick-fx.nick-x-flame';
  const still = await open('olenka34-still', 375, 812, { reducedMotion: 'reduce' });
  await still.context().addCookies(cookies);
  await still.goto(`${base}/profile`);
  await still.locator(header).waitFor();
  const reduced = (await layer34(still, header, '::before'))!;
  expect(reduced.animation).toBe('none');
  expect(reduced.opacity).toBeGreaterThan(0);
  await expectNoSideScroll(still, 'p34-flame-still-375');
  const easy = await open('olenka34-easy', 375, 812);
  await easy.context().addCookies(cookies);
  await easy.addInitScript("localStorage.setItem('quiz:easy', 'on')");
  await easy.goto(`${base}/profile`);
  await easy.locator(header).waitFor();
  await expect.poll(() => easy.evaluate("document.documentElement.classList.contains('is-easy')"), POLL).toBe(true);
  const calm = (await layer34(easy, header, '::before'))!;
  expect(calm.animation).toBe('none');
  expect(calm.opacity).toBeGreaterThan(0);
  expect(calm.opacity).toBeLessThanOrEqual(0.35);
  await expectNoSideScroll(easy, 'p34-flame-easy-375');
}

/** Реакція з того самого місця, що й телефон: токен гравця з localStorage, окремий сокет. */
async function reactAs34(sockets: Socket[], page: Page, code: string) {
  const token = (await page.evaluate(`localStorage.getItem('quiz:player:${code}')`)) as string;
  expect(token, 'the player token').toBeTruthy();
  const socket = connectSocket(base, { auth: { code, role: 'player', token }, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  await new Promise<void>((done, fail) => {
    socket.once('connect', () => done());
    socket.once('connect_error', fail);
  });
  return (item: ReactionItem) => new Promise<{ ok: boolean; error?: string }>((done) => socket.emit('player:react', item, done));
}

/** Стікер набору поза давньою серією nya (її мають усі). */
const notNya34 = (pack: StickerPackId) => STICKERS_BY_PACK[pack].filter((s) => s.series !== 'nya');
const sticker34 = (value: string): ReactionItem => ({ kind: 'sticker', value });

async function openSheet34(page: Page) {
  await page.getByRole('button', { name: '😀 Реакція', ...exact }).click();
  const sheet = page.getByRole('dialog', { name: 'Реакція', ...exact });
  await sheet.waitFor();
  return sheet.getByRole('group', { name: 'Усі стікери', ...exact });
}

async function stickers34() {
  const sockets: Socket[] = [];
  try {
    const host = await open('host34b', 1280, 800);
    await register(host, 'host', 'Леся Ведуча', 'host34b@example.com');
    const hanna = await open('hanna34', 375, 812);
    const hannaId = await account34(hanna, 'Ганна', 'hanna34@example.com', 18);
    await db.insert(userAchievement).values({ userId: hannaId, achievementId: 'night_owl', earnedAt: yesterday() });
    // Іван — наявний акаунт рівня 6 до переходу на набори: знімок успадкування робить старт сервера (тут — той самий виклик).
    const ivan = await open('ivan34', 375, 812);
    const ivanId = await account34(ivan, 'Іван', 'ivan34@example.com', 6);
    await db.update(profile).set({ stickersSettled: false }).where(eq(profile.userId, ivanId));
    await settleStickerLegacy(db);
    const [settled] = await db.select({ legacy: profile.stickersLegacyLevel, done: profile.stickersSettled }).from(profile).where(eq(profile.userId, ivanId));
    expect(settled).toEqual({ legacy: 6, done: true });

    const { code, stageUrl } = await game34(host, 'Стікерний вечір 34');
    const stage = await open('stage34b', 1280, 720);
    await stage.goto(stageUrl);
    const petryk = await open('petryk34', 375, 812);
    const vasylko = await open('vasylko34', 320, 568, { hasTouch: true, isMobile: true });
    await join(petryk, code, 'Гість Петрик', false);
    await join(vasylko, code, 'Гість Василько', false);
    await join(hanna, code, 'Ганна', false);
    await join(ivan, code, 'Іван', false);
    const phones = [petryk, vasylko, hanna, ivan];
    await toLeaderboard34(host, stage, phones);

    // ── Гості: «Привітики» відкрито, «Смаколики» — рядок із чотирма картинками. ──
    for (const [page, width] of [[petryk, 375], [vasylko, 320]] as const) {
      const all = await openSheet34(page);
      expect(await all.getByRole('group', { name: 'Привітики', ...exact }).locator('.reaction-pick').count()).toBe(STICKERS_BY_PACK.basic.length);
      const food = all.getByRole('group', { name: 'Смаколики', ...exact }).locator('.sticker-pack-locked');
      expect(await food.locator('.sticker-pack-lock-text').textContent()).toBe('Смаколики — відкриється з рівня 3');
      expect(await food.locator('.sticker-pack-preview img').count()).toBe(4);
      await food.scrollIntoViewIfNeeded();
      const line = (await food.boundingBox())!;
      expect(line.x + line.width, `the locked line leaves the ${width} phone`).toBeLessThanOrEqual(width + 0.5);
      await expectNoSideScroll(page, `p34-sticker-locked-${width}`);
      await page.getByRole('button', { name: 'Закрити', ...exact }).click();
    }

    // ── Ганна (рівень 18, «Нічна сова»): «Моторошики» відкрито, «Пустуни» — за «Капості» або з 38-го. ──
    const hannaAll = await openSheet34(hanna);
    expect(await hannaAll.getByRole('group', { name: 'Моторошики', ...exact }).locator('.reaction-pick').count()).toBe(STICKERS_BY_PACK.spooky.length);
    expect(await hannaAll.locator('.sticker-pack-lock-text', { hasText: 'Пустуни' }).textContent()).toBe('Пустуни — за досягнення «Капості» або з рівня 38');
    await expectNoSideScroll(hanna, 'p34-sticker-spooky-375');
    await hanna.getByRole('button', { name: 'Закрити', ...exact }).click();

    // ── Іван (успадкований рівень 6): серія nyas лишилась і в «Затишку», хоч той відкривається з 9-го. ──
    const cozyNyas = STICKERS_BY_PACK.cozy.find((s) => s.series === 'nyas')!;
    const ivanAll = await openSheet34(ivan);
    await ivanAll.getByRole('group', { name: 'Затишок', ...exact }).getByRole('button', { name: `Стікер ${cozyNyas.id}`, ...exact }).waitFor();
    await expectNoSideScroll(ivan, 'p34-sticker-kept-375');
    await ivan.getByRole('button', { name: 'Закрити', ...exact }).click();

    // ── Сервер: відмова не займає вікна частоти, тож спершу закрите, потім відкрите. ──
    const guestReact = await reactAs34(sockets, petryk, code);
    expect(await guestReact(sticker34(notNya34('food')[0]!.id))).toEqual({ ok: false, error: 'sticker_locked' });
    expect(await guestReact(sticker34(STICKERS_BY_PACK.basic[0]!.id))).toEqual({ ok: true });
    const hannaReact = await reactAs34(sockets, hanna, code);
    expect(await hannaReact(sticker34(notNya34('mischief')[0]!.id))).toEqual({ ok: false, error: 'sticker_locked' });
    expect(await hannaReact(sticker34(notNya34('spooky')[0]!.id))).toEqual({ ok: true });
    const ivanReact = await reactAs34(sockets, ivan, code);
    expect(await ivanReact(sticker34(STICKERS_BY_PACK.extra[0]!.id))).toEqual({ ok: false, error: 'sticker_locked' });
    expect(await ivanReact(sticker34(cozyNyas.id))).toEqual({ ok: true });

    // ── Профіль Ганни: «Світло» відкрите, «Полум'я» — з 31-го; «Далі» — рівні 19–21. ──
    await hanna.goto(`${base}/profile/looks`);
    const effects = hanna.getByRole('radiogroup', { name: 'Ефект ніку', ...exact });
    await effects.waitFor();
    expect(await effects.getByRole('radio', { name: 'Світло', ...exact }).isDisabled()).toBe(false);
    // Ім'я закритої плитки — з рядком замка: «Полум'я 🔒 з рівня 31».
    const flame = effects.getByRole('radio', { name: /^Полум'я/ });
    expect(await flame.isDisabled()).toBe(true);
    expect(await flame.locator('xpath=ancestor::label[1]').locator('.look-lock').textContent()).toBe('🔒 з рівня 31');
    const next = await hanna.getByTestId('level-next').allTextContents();
    expect(next.map((line) => Number(/з рівня (\d+)$/.exec(line)![1]))).toEqual([19, 19, 19, 19, 20, 20, 20, 21, 21, 21]);
    await expectNoSideScroll(hanna, 'p34-looks-375');
  } finally {
    for (const socket of sockets) socket.disconnect();
  }
}

async function level40() {
  const page = await open('myroslava34', 375, 812);
  await account34(page, 'Мирослава', 'myroslava40@example.com', 40);
  await page.goto(`${base}/profile/looks`);
  const card = page.locator('section.level-card');
  await card.getByText('Усі нагороди рівнів відкрито — далі рахуємо лише досвід.', exact).waitFor();
  expect(await card.getByRole('heading', { name: 'Далі', ...exact }).count()).toBe(0);
  const unlocked = await page.getByTestId('level-unlocked').allTextContents();
  expect(unlocked[0]).toContain('Рівень 40 · Ефект ніку: Перелив, Рамка: Полярне сяйво, Значок 🌠');
  // Радіо приховане під плиткою: обирає дотик по плитці.
  const tile = (group: string, name: string) => card.getByRole('radiogroup', { name: group, ...exact }).getByRole('radio', { name, ...exact }).locator('xpath=ancestor::label[1]');
  await tile('Ефект ніку', "Полум'я").click();
  await tile('Рамка фото', 'Соняшники').click();
  await card.locator('[data-testid="look-preview"] .nick-fx.nick-x-flame').waitFor();
  const [saved] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/me/looks') && r.request().method() === 'PUT'), click(page, 'Зберегти вигляд')]);
  expect(saved.ok(), await saved.text()).toBe(true);
  expect(await saved.json()).toMatchObject({ looks: { effect: 'flame', photo: 'sunflowers' } });
  await page.goto(`${base}/profile`);
  await page.locator('h1 .nick-fx.nick-x-flame > .nick-name').waitFor();
  await page.locator('.profile-head .photo-frame-sunflowers .pf-petal').first().waitFor();
  await expectNoSideScroll(page, 'p34-profile-40-375');
  await page.setViewportSize({ width: 320, height: 568 });
  await expectNoSideScroll(page, 'p34-profile-40-320');
}
