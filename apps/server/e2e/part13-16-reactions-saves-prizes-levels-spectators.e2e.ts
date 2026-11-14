import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { classicRound, makeRoundsQuiz, survivalRound } from '@quiz/engine/testing';
import { ACHIEVEMENT_XP, STICKERS, achievementRarity, levelOf, stickerPath, xpForLevel, type OwnLevel, type ReactionItem } from '@quiz/shared';
import { and, eq } from 'drizzle-orm';
import { type Locator, type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { xpEntry } from '../src/db/schema';
import { kyivDay } from '../src/xp-rules';
import { open, click, field, seconds, join, bodyText, expectNoSideScroll, register, myId, POLL, socketFrames, pickOption, silentMp3, scoreOf, toNextQuestion, expectStageFits, survivalGroupOf, openTrialLeaks, socketPlayer, expectFitsWidth13a, MENU_FITS_14A, prizeQuestions14a, isTrophyRequest, openProfileTile, label } from './helpers/common';
import { avatarPng, exact, base, db, problems, pages, snapshot, afterSplash, shot, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частини 13–16: реакції, збережені ігри, призи, рівні, глядачі виживання, звук на телефонах.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

const sticker13a = STICKERS[0]!;
const src13a = stickerPath(sticker13a);
/** Рядок гравця name у таблиці (13a). */
const row13a = (page: Page, name: string) => page.locator('.standings li', { has: page.locator('.name', { hasText: name }) });
/** Бейдж першого стікера в межах scope (13a). */
const badgeImg13a = (scope: Locator) => scope.locator(`.reaction-badge img[src="${src13a}"]`);
const reactionButton13a = (page: Page) => page.getByRole('button', { name: '😀 Реакція', ...exact });
/** Картинка бейджа справді намалювалась (фікстура віддалась). */
const drawn13a = (image: Locator) => image.evaluate((el) => { const img = el as unknown as { complete: boolean; naturalWidth: number }; return img.complete && img.naturalWidth > 0; });
/** Сцена без прокрутки вниз — з цифрами. */
async function expectFitsHeight13a(page: Page, name: string) {
  const [scroll, client] = (await page.evaluate('[document.documentElement.scrollHeight, document.documentElement.clientHeight]')) as [number, number];
  // Для розбору: та сама сцена без запасу під смугу (як до 13a).
  const bare = await page.evaluate(`(() => { const m = document.querySelector('main.has-reactions'); if (!m) return -1; m.classList.remove('has-reactions'); const h = document.documentElement.scrollHeight; m.classList.add('has-reactions'); return h; })()`);
  expect.soft(scroll, `${name}: the stage scrolls (${scroll} > ${client}; without the strip room ${bare})`).toBeLessThanOrEqual(client);
}

function reactionQuestions13a() {
  const common = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  return [
    { ...common, id: 'r1', type: 'single' as const, text: 'Яка річка тече через Київ?', options: options('Дніпро', 'Дністер', 'Десна', 'Південний Буг'), correctId: 'a' },
    { ...common, id: 'r2', type: 'single' as const, text: 'Яке місто — столиця Буковини?', options: options('Чернівці', 'Ужгород', 'Луцьк', 'Рівне'), correctId: 'a' },
  ];
}

async function reactions13a() {
  const host = await open('host13a', 1280, 800);
  await register(host, 'host', 'Ганна Ведуча', 'host13a@example.com');
  const data = {
    ...makeRoundsQuiz([classicRound('r1', reactionQuestions13a() as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]),
    title: 'Реакції 13a',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Реакції 13a' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage13a', 1280, 720);
  await stage.goto(stageUrl);
  const olya = await open('olya13a', 375, 812);
  const petro = await open('petro13a', 375, 812);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await host.getByText('Петро', exact).first().waitFor();

  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };

  // ── 1. Гра й перше запитання: кнопки реакції немає. ──
  await step('Почати гру');
  await afterSplash(host, stage, olya, petro);
  await step('Почати раунд');
  await afterSplash(host, stage, olya, petro);
  await olya.getByRole('button', { name: /Дніпро/ }).waitFor();
  await petro.getByRole('button', { name: /Дністер/ }).waitFor();
  expect(await reactionButton13a(olya).count(), 'a reaction button on Оля’s question').toBe(0);
  expect(await reactionButton13a(host).count(), 'a reaction button on the host’s question').toBe(0);
  await pickOption(olya, 'Дніпро');
  await pickOption(petro, 'Дністер');
  await step('Показати відповідь');
  // Відкрита відповідь із чотирма варіантами на сцені 1280 × 720 із запасом під смугу.
  await stage.locator('main.has-reactions').waitFor();
  await expectFitsHeight13a(stage, 'p13a-stage-reveal');
  await shot(stage, 'p13a-stage-reveal');
  await step('Далі');
  await stage.locator('.standings').waitFor();
  await petro.locator('.standings').waitFor();

  // ── 2. Стікер Олі. ──
  const olyaButton = reactionButton13a(olya);
  await olyaButton.click();
  const olyaSheet = olya.getByRole('dialog', { name: 'Реакція', ...exact });
  await olyaSheet.waitFor();
  await olyaSheet.getByRole('group', { name: 'Усі стікери', ...exact }).getByRole('button', { name: `Стікер ${sticker13a.id}`, ...exact }).click();
  await olyaSheet.waitFor({ state: 'detached' });
  expect(await olyaButton.isDisabled(), 'Оля’s button rests after a sticker').toBe(true);

  const stageBadge = badgeImg13a(row13a(stage, 'Оля'));
  await stageBadge.waitFor();
  await expect.poll(() => drawn13a(stageBadge), POLL).toBe(true);
  const petroBadge = badgeImg13a(row13a(petro, 'Оля'));
  await petroBadge.waitFor();
  await expect.poll(() => drawn13a(petroBadge), POLL).toBe(true);
  await expectFitsWidth13a(petro, 'p13a-petro');
  await expectNoSideScroll(petro, 'p13a-petro');
  await shot(stage, 'p13a-stage-badge');
  await shot(petro, 'p13a-petro-badge');
  await expectFitsHeight13a(stage, 'p13a-stage-badge');
  expect(await stage.evaluate('document.documentElement.scrollHeight <= innerHeight'), 'the stage standings scroll').toBe(true);
  // Бейдж стоїть поруч із ніком, а не поверх рахунку.
  const badgeBox = (await stageBadge.boundingBox())!;
  const scoreBox = (await row13a(stage, 'Оля').locator('.score').first().boundingBox())!;
  expect(badgeBox.x + badgeBox.width, 'the badge covers the score').toBeLessThanOrEqual(scoreBox.x + 1);

  await expect.poll(() => olyaButton.isDisabled(), { timeout: 3000 }).toBe(false);
  await expect.poll(() => badgeImg13a(row13a(stage, 'Оля')).count(), { timeout: 6000 }).toBe(0);
  expect(await badgeImg13a(row13a(petro, 'Оля')).count()).toBe(0);

  // ── 3. Смуга ведучого. ──
  await reactionButton13a(host).click();
  const hostSheet = host.getByRole('dialog', { name: 'Реакція', ...exact });
  await hostSheet.getByRole('button', { name: '👏', ...exact }).click();
  await hostSheet.waitFor({ state: 'detached' });
  for (const page of [stage, petro]) {
    const strip = page.locator('.reaction-strip');
    await strip.getByText('Ведучий', exact).waitFor();
    expect(await strip.locator('.reaction-badge.is-emoji').getAttribute('aria-label')).toBe('Реакція 👏');
    expect(await strip.innerText()).toContain('👏');
    expect(await page.locator('.standings .reaction-badge').count(), 'the host badge in the table').toBe(0);
  }
  await expectFitsHeight13a(stage, 'p13a-stage-strip');
  await shot(stage, 'p13a-stage-strip');
  await shot(petro, 'p13a-petro-strip');

  // ── 4. Улюблені гостя переживають перезавантаження. ──
  await olyaButton.click();
  await olyaSheet.waitFor();
  await olyaSheet.getByRole('button', { name: `Додати ${sticker13a.id} в улюблені`, ...exact }).first().click();
  const favorites = olyaSheet.getByRole('group', { name: '★ Мої улюблені', ...exact });
  await favorites.getByRole('button', { name: `Стікер ${sticker13a.id}`, ...exact }).waitFor();
  await olyaSheet.getByRole('button', { name: 'Закрити', ...exact }).click();
  await olyaSheet.waitFor({ state: 'detached' });
  await olya.reload();
  await olya.locator('.standings').waitFor();
  await reactionButton13a(olya).click();
  await olyaSheet.waitFor();
  await favorites.getByRole('button', { name: `Стікер ${sticker13a.id}`, ...exact }).waitFor();
  expect(await favorites.getByRole('button', { name: `Прибрати ${sticker13a.id} з улюблених`, ...exact }).getAttribute('aria-pressed')).toBe('true');
  await shot(olya, 'p13a-sheet-phone');
  await expectFitsWidth13a(olya, 'p13a-sheet-phone');
  await expectNoSideScroll(olya, 'p13a-sheet-phone');
  // Аркуш на 375 px вміщає три частини, а «Усі стікери» прокручуються всередині.
  const all = olyaSheet.getByRole('group', { name: 'Усі стікери', ...exact }).locator('.reaction-grid.is-all');
  const [inner, outer] = (await all.evaluate((el) => [el.scrollHeight, el.clientHeight])) as [number, number];
  expect(inner, 'all stickers scroll inside their box').toBeGreaterThan(outer);
  const sheetBox = (await olyaSheet.boundingBox())!;
  expect(sheetBox.y + sheetBox.height, 'the sheet goes below the phone').toBeLessThanOrEqual(812 + 1);
  await olyaSheet.getByRole('button', { name: 'Закрити', ...exact }).click();
  await olyaSheet.waitFor({ state: 'detached' });

  // ── 5. Друге запитання: ні кнопок, ні смуги. ──
  await step('Наступне запитання');
  await afterSplash(host, stage, olya, petro);
  await olya.getByRole('button', { name: /Чернівці/ }).waitFor();
  await petro.getByRole('button', { name: /Чернівці/ }).waitFor();
  await stage.getByText('Яке місто — столиця Буковини?', exact).first().waitFor();
  expect(await reactionButton13a(olya).count(), 'a reaction button on Оля’s second question').toBe(0);
  expect(await reactionButton13a(petro).count(), 'a reaction button on Петро’s second question').toBe(0);
  expect(await stage.locator('.reaction-strip').count(), 'the strip on the stage question').toBe(0);

  expect(problems).toEqual([]);
}

it('part 13a: reactions — between questions Оля on a 375 phone opens «😀 Реакція», sends the first cat sticker, and it shows beside «Оля» in the 1280 × 720 stage standings and on Петро’s phone for about 4 s while her button rests; the host’s 👏 lands in the strip as «Ведучий»; a ☆ favourite survives a reload for a guest; and no reaction button exists while a question is open', async () => {
  try {
    await reactions13a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Реакція гравця без браузера (13a): відповідь сервера. */
const socketReact13a = (socket: Socket, item: ReactionItem) =>
  new Promise<{ ok: boolean; error?: string }>((done) => socket.emit('player:react', item, done));

async function reactionLayout13a(sockets: Socket[]) {
  const host = await open('host13a-layout', 1280, 900);
  await register(host, 'host', 'Марина Ведуча', 'host13a-layout@example.com');
  const image = ((await (await host.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } })).json()) as { url: string }).url;
  const common = { video: null, timeLimit: 30, points: 100 };
  const q1 = {
    ...common,
    imageUrl: image,
    id: 'k1',
    type: 'single' as const,
    text: 'Яка річка тече через Київ?',
    options: ['Дніпро', 'Дністер', 'Десна', 'Південний Буг'].map((text, i) => ({ id: 'abcd'[i]!, text })),
    correctId: 'a',
  };
  const s1 = { ...common, imageUrl: null, id: 'k2', type: 'boolean' as const, text: 'Чернівці — столиця Буковини', correct: true };
  const s2 = { ...common, imageUrl: null, id: 'k3', type: 'boolean' as const, text: 'Дніпро впадає в Чорне море', correct: true };
  const s3 = { ...common, imageUrl: null, id: 'k6', type: 'boolean' as const, text: 'Ужгород стоїть на річці Уж', correct: true };
  const t1 = { ...common, imageUrl: null, id: 'k4', type: 'boolean' as const, text: 'Говерла — найвища гора України', correct: true, timeLimit: 15 };
  const last = { ...common, imageUrl: null, id: 'k5', type: 'boolean' as const, text: 'Київ — столиця України', correct: true };
  const options = { speedBonus: false, shuffleOptions: false };
  const data = {
    ...makeRoundsQuiz(
      [
        classicRound('rk1', [q1] as never, { ...options, title: 'Розминка' }),
        survivalRound('rk2', [s1, s2, s3] as never, [t1] as never, { title: 'Хто лишиться' }),
        classicRound('rk3', [last] as never, { ...options, title: 'Фінал' }),
      ],
      { leaderboard: 'each' },
    ),
    title: 'Реакції 13a: макет',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Реакції 13a: макет' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage13a-layout', 1280, 720);
  await stage.goto(stageUrl);

  const names = ['Анастасія Мельник', 'Святослав Ткаченко', 'Ярослава Кравченко', 'Станіслав Олійник', 'Мирослава Петренко', 'Олександра Коваленко', 'Христина Бондаренко', 'Володимир Шевченко'];
  const players: Awaited<ReturnType<typeof socketPlayer>>[] = [];
  for (const name of names) players.push(await socketPlayer(sockets, code, name));
  await stage.getByText(names[7]!).waitFor();
  const sticker = { kind: 'sticker' as const, value: sticker13a.id };

  // ── Відкрита відповідь: картинка, чотири варіанти й реакція в смузі. ──
  await click(host, 'Почати гру');
  await afterSplash(host, stage);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage);
  await stage.getByText(q1.text, exact).first().waitFor();
  const pictureOnQuestion = (await stage.locator('.question-image').boundingBox())!.height;
  for (const [index, player] of players.entries()) {
    const ack = await new Promise<{ ok: boolean }>((done) => player.socket.emit('player:answer', { type: 'single', optionId: index < 5 ? 'a' : 'b' }, done));
    expect(ack.ok, `${player.nickname} answers`).toBe(true);
  }
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await stage.locator('main.has-reactions').waitFor();
  expect((await socketReact13a(players[0]!.socket, sticker)).ok).toBe(true);
  await badgeImg13a(stage.locator('.reaction-strip')).waitFor();
  // Картинка не змінює висоту на відкритті відповіді: варіанти не стрибають.
  expect((await stage.locator('.question-image').boundingBox())!.height, 'the picture jumps at the reveal').toBeCloseTo(pictureOnQuestion, 0);
  // Відкрита відповідь з картинкою й чотирма варіантами вже до 13a не вміщалась у 720 (≈808 px) — це поза 13a.
  // Тут: смуга не робить сцену вищою, ніж без неї, і не накриває рядок «Правильна відповідь».
  const [withStrip, client, bare] = (await stage.evaluate(`(() => {
    const root = document.documentElement;
    const main = document.querySelector('main.has-reactions');
    const now = root.scrollHeight;
    main.classList.remove('has-reactions');
    const before = root.scrollHeight;
    main.classList.add('has-reactions');
    return [now, root.clientHeight, before];
  })()`)) as [number, number, number];
  expect(withStrip, `p13a-stage-reveal-image: the strip room makes the stage taller (${withStrip} > ${bare})`).toBeLessThanOrEqual(bare + 8);
  const answerLine = (await stage.locator('.lead.answer', { hasText: 'Правильна відповідь' }).boundingBox())!;
  const stripBox = (await stage.locator('.reaction-strip').boundingBox())!;
  expect(
    answerLine.y + answerLine.height <= stripBox.y || answerLine.y >= stripBox.y + stripBox.height,
    `p13a-stage-reveal-image: the strip (${Math.round(stripBox.y)}..${Math.round(stripBox.y + stripBox.height)}) covers «Правильна відповідь» (${Math.round(answerLine.y)}..${Math.round(answerLine.y + answerLine.height)})`,
  ).toBe(true);
  await shot(stage, 'p13a-stage-reveal-image');

  // ── Підсумок раунду з повною таблицею: видимий рядок — бейдж, обрізаний «…і ще 2» — смуга. ──
  await click(host, 'Далі');
  await expect.poll(() => stage.locator('.standings-more').count(), POLL).toBe(1);
  const shown = (await stage.locator('.standings li .name').allInnerTexts()).join('\n');
  const visible = names.find((name) => shown.includes(name))!;
  const hidden = names.find((name) => !shown.includes(name))!;
  expect(hidden, 'a trimmed player').toBeTruthy();
  expect((await socketReact13a(players[names.indexOf(visible)]!.socket, sticker)).ok).toBe(true);
  expect((await socketReact13a(players[names.indexOf(hidden)]!.socket, { kind: 'emoji', value: '🔥' })).ok).toBe(true);
  await badgeImg13a(row13a(stage, visible)).waitFor();
  await stage.locator('.reaction-strip', { hasText: hidden }).waitFor();
  await expectFitsHeight13a(stage, 'p13a-stage-round-end');
  await shot(stage, 'p13a-stage-round-end');

  // ── Вибування: таблиця живих із бейджем. ──
  await click(host, 'Наступний раунд');
  await afterSplash(host, stage);
  await stage.locator('.survival-board').waitFor();
  await click(host, 'Почати раунд');
  await afterSplash(host, stage);
  await stage.getByText(s1.text, exact).first().waitFor();
  for (const player of players) await player.answer(true);
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await stage.locator('main.has-reactions .survival-board').waitFor();
  expect((await socketReact13a(players[2]!.socket, sticker)).ok).toBe(true);
  await badgeImg13a(stage.locator('.survival-board')).waitFor();
  await expectFitsHeight13a(stage, 'p13a-stage-survival');
  await shot(stage, 'p13a-stage-survival');

  expect(problems).toEqual([]);
}

it('part 13a: reaction layout — on the 1280 × 720 stage an open answer with a picture and four options, a round end with eight long nicknames (a badge in a row and a trimmed player in the strip) and a survival board with a badge fit without scrolling', async () => {
  const sockets: Socket[] = [];
  try {
    await reactionLayout13a(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
});

/** Рядок гравця name у таблиці (13b). */
const row13b = (page: Page, name: string) => page.locator('.standings li', { has: page.locator('.name', { hasText: name }) });
/** Телефон без прокрутки вбік (13b) — з цифрами в повідомленні. */
async function expectFitsWidth13b(page: Page, name: string) {
  const [scroll, client] = (await page.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth]')) as [number, number];
  expect(scroll, `${name}: horizontal scroll (${scroll} > ${client})`).toBeLessThanOrEqual(client);
}

function savedQuestions13b() {
  const common = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  return [
    { ...common, id: 's1', type: 'single' as const, text: 'Яка річка тече через Київ?', options: options('Дніпро', 'Дністер', 'Десна', 'Південний Буг'), correctId: 'a' },
    { ...common, id: 's2', type: 'single' as const, text: 'Яке місто — столиця Буковини?', options: options('Чернівці', 'Ужгород', 'Луцьк', 'Рівне'), correctId: 'a' },
    { ...common, id: 's3', type: 'single' as const, text: 'Яка гора — найвища в Україні?', options: options('Говерла', 'Петрос', 'Піп Іван', 'Бребенескул'), correctId: 'a' },
  ];
}

async function savedGames13b() {
  const TITLE = 'Збережена гра 13b';
  const host = await open('host13b', 1280, 800);
  await register(host, 'host', 'Галина Ведуча', 'host13b@example.com');
  const olya = await open('olya13b', 375, 812);
  await register(olya, 'menu', 'Оля', 'olya13b@example.com');
  const data = {
    ...makeRoundsQuiz([classicRound('r1', savedQuestions13b() as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]),
    title: TITLE,
  };
  const created = await host.request.post(`${base}/api/quizzes`, { data });
  expect(created.ok(), await created.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: TITLE }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stage = await open('stage13b', 1280, 720);
  await stage.goto((await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
  const petro = await open('petro13b', 375, 812);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await host.getByText('Петро', exact).first().waitFor();

  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  const SAVED = 'Гру збережено — продовжимо пізніше.';
  const scoreOf = (page: Page, name: string) => row13b(page, name).locator('.score').first().textContent({ timeout: 1000 }).catch(() => null);

  // ── 1. Перша частина: запитання 1, таблиця, посеред запитання 2. ──
  await step('Почати гру');
  await afterSplash(host, stage, olya, petro);
  await step('Почати раунд');
  await afterSplash(host, stage, olya, petro);
  await olya.getByRole('button', { name: /Дніпро/ }).waitFor();
  await petro.getByRole('button', { name: /Дністер/ }).waitFor();
  await pickOption(olya, 'Дніпро');
  await pickOption(petro, 'Дністер');
  await host.getByText('Запитання закрите').waitFor();
  await step('Показати відповідь');
  await step('Далі');
  await stage.locator('.standings').waitFor();
  await expect.poll(() => scoreOf(stage, 'Оля'), POLL).toBe('100');
  await expect.poll(() => scoreOf(stage, 'Петро'), POLL).toBe('0');
  await step('Наступне запитання');
  await afterSplash(host, stage, olya, petro);
  await olya.getByRole('button', { name: /Чернівці/ }).waitFor();
  await pickOption(olya, 'Чернівці');

  // ── 2. Збереження (діалог підтверджує обробник з open()). ──
  await step('Зберегти й продовжити пізніше');
  for (const page of [host, stage, olya, petro]) await page.getByText(SAVED, exact).first().waitFor();
  await shot(stage, 'p13b-stage-saved');
  await shot(olya, 'p13b-phone-saved');

  // ── 3. Історія: «Не завершені» → «Продовжити». ──
  await host.getByRole('link', { name: 'До історії ігор', ...exact }).click();
  await host.waitForURL(/\/history$/);
  const savedSection = host.locator('section.saved-games');
  await savedSection.getByRole('heading', { name: 'Не завершені', ...exact }).waitFor();
  const savedCard = savedSection.locator('li.is-saved', { hasText: TITLE });
  await savedCard.waitFor();
  expect(await savedCard.count()).toBe(1);
  expect(await savedCard.locator('.saved-mark').textContent()).toBe('Не завершена');
  await shot(host, 'p13b-history');
  // Той самий список на телефоні 375 px.
  await host.setViewportSize({ width: 375, height: 812 });
  await expectFitsWidth13b(host, 'p13b-history-phone');
  await expectNoSideScroll(host, 'p13b-history-phone');
  await host.setViewportSize({ width: 1280, height: 800 });

  await savedCard.getByRole('button', { name: 'Продовжити', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const next = host.url().slice(-6);
  expect(next, 'the continuation opens a NEW code').not.toBe(code);
  await stage.goto((await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
  const games = (await (await host.request.get(`${base}/api/games`)).json()) as { title: string; saved?: { open: boolean } }[];
  const listed = games.filter((game) => game.title === TITLE);
  expect(listed).toHaveLength(1);
  expect(listed[0]!.saved?.open).toBe(true);

  // ── 4. Повернення: Петро вибирає себе, Оля — сама, Ірина — новенька. ──
  await petro.goto(`${base}/play/${next}`);
  const who = petro.getByRole('group', { name: 'Хто ти?', ...exact });
  await who.getByRole('radio', { name: 'Петро', ...exact }).waitFor();
  await who.getByRole('radio', { name: 'Я новий гравець', ...exact }).waitFor();
  expect(await who.getByRole('radio', { name: 'Оля', ...exact }).count(), 'Оля’s account slot is offered to a guest').toBe(0);
  await expectFitsWidth13b(petro, 'p13b-who');
  await expectNoSideScroll(petro, 'p13b-who');
  // Ірина відкриває форму, поки місце Петра ще вільне: тоді «Хто ти?» є й у неї (без вільних місць форма звичайна).
  const iryna = await open('iryna13b', 375, 812);
  await iryna.goto(`${base}/play/${next}`);
  await iryna.getByRole('radio', { name: 'Я новий гравець', ...exact }).check();
  await who.getByRole('radio', { name: 'Петро', ...exact }).check();
  await click(petro, 'Увійти в гру');
  await who.waitFor({ state: 'detached' });

  await olya.goto(`${base}/play/${next}`);
  await expect.poll(() => scoreOf(olya, 'Оля'), { timeout: 10_000 }).toBe('100');
  expect(await olya.getByRole('group', { name: 'Хто ти?', ...exact }).count(), 'Оля got the slot form').toBe(0);

  await field(iryna, 'Ваше ім’я').fill('Ірина');
  await click(iryna, 'Увійти в гру');
  await iryna.getByRole('group', { name: 'Хто ти?', ...exact }).waitFor({ state: 'detached' });

  const slots = host.locator('details.slots-panel');
  await slots.getByText('Місця збереженої гри', exact).waitFor();
  for (const name of ['Оля', 'Петро']) await expect.poll(() => slots.locator('li', { hasText: name }).textContent(), POLL).toContain('на місці');
  await shot(host, 'p13b-host-slots');
  // Панель місць не накриває кнопок пульта.
  const panelBox = (await slots.boundingBox())!;
  for (const button of await host.locator('footer.actions button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.y >= panelBox.y + panelBox.height || box.y + box.height <= panelBox.y, 'the slots panel covers a console button').toBe(true);
  }

  // ── 5. Друга частина: запитання 2 з початку. ──
  await host.getByRole('button', { name: 'Продовжити', ...exact }).last().click();
  await stage.locator('.standings').waitFor();
  for (const [name, score] of [['Оля', '100'], ['Петро', '0'], ['Ірина', '0']] as const) {
    await expect.poll(() => scoreOf(stage, name), POLL).toBe(score);
  }
  await step('Наступне запитання');
  await afterSplash(host, stage, olya, petro, iryna);
  await stage.getByText('Яке місто — столиця Буковини?', exact).first().waitFor();
  await olya.getByRole('button', { name: /Чернівці/ }).waitFor();
  expect(await olya.locator('[aria-pressed="true"], .is-picked').count(), 'Оля’s old answer survived the save').toBe(0);
  await pickOption(olya, 'Чернівці');
  await pickOption(petro, 'Ужгород');
  await pickOption(iryna, 'Чернівці');
  await host.getByText('Запитання закрите').waitFor();
  await step('Показати відповідь');
  await step('Далі');
  await step('Наступне запитання');
  await afterSplash(host, stage, olya, petro, iryna);
  for (const page of [olya, petro, iryna]) {
    await page.getByRole('button', { name: /Говерла/ }).waitFor();
    await pickOption(page, 'Говерла');
  }
  await host.getByText('Запитання закрите').waitFor();
  await step('Показати відповідь');
  await step('Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();

  // ── 6. Одна гра в історії. ──
  await host.goto(`${base}/history`);
  const card = host.locator('.quiz-list li', { hasText: TITLE });
  await card.first().waitFor();
  expect(await host.getByRole('heading', { name: 'Не завершені', ...exact }).count()).toBe(0);
  expect(await card.count()).toBe(1);
  expect(await card.locator('.meta').first().textContent()).toContain('завершено');
  expect(await card.innerText()).toContain('Запитань зіграно: 3 з 3');
  await shot(host, 'p13b-history-finished');
  await card.getByRole('link', { name: TITLE, ...exact }).click();
  const standings = host.locator('.standings li');
  await standings.first().waitFor();
  const table: [string, string][] = [];
  for (let i = 0; i < (await standings.count()); i++) {
    table.push([(await standings.nth(i).locator('.name').textContent())!, (await standings.nth(i).locator('.score').textContent())!]);
  }
  expect(table).toEqual([
    ['Оля', '300'],
    ['Ірина', '200'],
    ['Петро', '100'],
  ]);
  const mine = (await (await olya.request.get(`${base}/api/me/history`)).json()) as { title: string }[];
  expect(mine.filter((game) => game.title === TITLE)).toHaveLength(1);

  expect(problems).toEqual([]);
}

it('part 13b: saved games — the host saves in the middle of question 2 and every screen says «Гру збережено — продовжимо пізніше»; «Історія ігор» lists it as «Не завершена»; «Продовжити» opens a new code where the signed-in Оля comes back by herself with her 100 points, Петро picks himself from «Хто ти?» and Ірина joins as a new player with 0; question 2 starts afresh, the game finishes, and the history shows one finished game', async () => {
  flags.slots404Expected = true;
  try {
    await savedGames13b();
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    flags.slots404Expected = false;
  }
});

/** Меню з п'ятьма пунктами (23a) на ширині width: не вище 60 px, без прокрутки вбік, жоден короткий підпис не обрізано. */
async function expectPhoneMenu14a(page: Page, width: number) {
  await page.setViewportSize({ width, height: 812 });
  const fit = (await page.evaluate(MENU_FITS_14A)) as { count: number; height: number; wide: boolean; shown: string[]; clipped: string[] };
  expect(fit.count, `menu ${width}: items`).toBe(5);
  expect(fit.height, `menu ${width}: height`).toBeLessThanOrEqual(60);
  expect(fit.wide, `menu ${width}: horizontal scroll`).toBe(true);
  expect(fit.clipped, `menu ${width}: clipped labels`).toEqual([]);
  expect(fit.shown.every((content) => content.includes('"')), `menu ${width}: short labels are not shown (${fit.shown.join(', ')})`).toBe(true);
  await shot(page, `p14a-menu-${width}`);
}

/** Перегляд призу (кнопка з видом трофея, тут «Кубок»): модальний діалог у межах вузького екрана, × не менше 44 px; закривається Escape, тоді тлом, тоді ×. */
async function expectPrizeViewer(page: Page, opener: Locator, label: string, engraving: string) {
  await opener.click();
  const dialog = page.getByRole('dialog', { name: /^Приз за \d місце$/ });
  await dialog.waitFor();
  expect(await dialog.getAttribute('aria-modal')).toBe('true');
  expect(await dialog.locator('.engraving').textContent()).toBe(engraving);
  const width = page.viewportSize()!.width;
  const box = (await dialog.boundingBox())!;
  expect(box.x >= 0 && box.x + box.width <= width, `${label}: the viewer leaves the screen`).toBe(true);
  const close = dialog.getByRole('button', { name: 'Закрити', ...exact });
  const closeBox = (await close.boundingBox())!;
  expect(closeBox.width >= 44 && closeBox.height >= 44, `${label}: × is under 44 px`).toBe(true);
  expect(await page.evaluate('document.activeElement?.getAttribute("aria-label")'), `${label}: focus is not on ×`).toBe('Закрити');
  await expectNoSideScroll(page, label);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await opener.click();
  await dialog.waitFor();
  // Дотик тла поза вікном (верхній лівий кут) закриває.
  await page.mouse.click(2, 2);
  await dialog.waitFor({ state: 'detached' });
  await opener.click();
  await close.click();
  await dialog.waitFor({ state: 'detached' });
}

async function prizes14a() {
  const TITLE = 'Призова вікторина 14a';
  const ENGRAVING = 'Чемпіон призової вікторини 2026';
  const KING = '👑 Король вікторини';
  const requests = new Map<string, string[]>();
  const track = (name: string, page: Page) => {
    const list: string[] = [];
    requests.set(name, list);
    page.on('request', (request) => list.push(request.url()));
  };
  /** Телефон без Web Share: «Диплом» гарантовано завантажує файл (canShare живе на прототипі, не на самому navigator). */
  const noShare = (page: Page) =>
    page.addInitScript(() => {
      delete (Navigator.prototype as unknown as { canShare?: unknown }).canShare;
      delete (navigator as unknown as { canShare?: unknown }).canShare;
    });

  // ── 1. Склад: ведучий на телефонному вікні створює два призи. ──
  const host = await open('host14a', 1280, 800);
  track('host', host);
  await register(host, 'host', 'Марта Ведуча', 'host14a@example.com');
  const olya = await open('olya14a', 375, 812);
  await noShare(olya);
  track('olya', olya);
  await register(olya, 'menu', 'Оля', 'olya14a@example.com');

  // Друга сторінка того самого контексту (та сама сесія): «Мої призи» на 375 px.
  const hostPhone = await host.context().newPage();
  await hostPhone.setViewportSize({ width: 375, height: 812 });
  hostPhone.on('pageerror', (error) => problems.push(`hostPhone14a: ${error.message} @ ${hostPhone.url()}`));
  hostPhone.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) problems.push(`hostPhone14a console: ${message.text()} @ ${message.location().url}`);
  });
  hostPhone.on('dialog', (dialog) => void dialog.accept());
  pages.set('hostPhone14a', hostPhone);
  await hostPhone.goto(base);
  await openProfileTile(hostPhone, 'Призи');
  await hostPhone.waitForURL(/\/prizes$/);
  await hostPhone.getByRole('heading', { name: 'Мої призи', ...exact }).waitFor();

  // Призи створюються в повноекранному редакторі (25c): «Форма» — вид і матеріал, «Приз» — назва, підпис, справжній приз, титул, диплом.
  const check = (label: string) => hostPhone.getByRole('checkbox', { name: label, ...exact }).check();
  const tool = (name: string) => hostPhone.getByRole('tab', { name, ...exact }).click();
  await click(hostPhone, 'Новий приз');
  await hostPhone.waitForURL(/\/profile\/prizes\/new$/);
  await hostPhone.getByRole('radio', { name: 'кубок', ...exact }).check();
  await hostPhone.getByRole('radio', { name: 'Золото', ...exact }).check();
  await tool('Приз');
  await field(hostPhone, 'Назва').fill('Головний приз');
  await field(hostPhone, 'Підпис під кубком і на дипломі').fill(ENGRAVING);
  await check('Справжній приз');
  await field(hostPhone, 'Що за приз').fill('Піца 🍕');
  await field(hostPhone, 'Який титул (на 7 днів)').fill(KING);
  await check('Диплом');
  await expectNoSideScroll(hostPhone, 'p14a-prize-editor');
  await click(hostPhone, 'Зберегти');
  await hostPhone.waitForURL(/\/profile\/prizes$/);
  await hostPhone.locator('.prize-list li', { hasText: 'Головний приз' }).waitFor();

  await click(hostPhone, 'Новий приз');
  await hostPhone.waitForURL(/\/profile\/prizes\/new$/);
  await hostPhone.getByRole('radio', { name: 'медаль', ...exact }).check();
  await hostPhone.getByRole('radio', { name: 'Срібло', ...exact }).check();
  await tool('Приз');
  await field(hostPhone, 'Назва').fill('Друге місце');
  await click(hostPhone, 'Зберегти');
  await hostPhone.waitForURL(/\/profile\/prizes$/);
  await hostPhone.locator('.prize-list li', { hasText: 'Друге місце' }).waitFor();
  expect(await hostPhone.locator('.prize-list li').count()).toBe(2);
  await expectNoSideScroll(hostPhone, 'p14a-prizes');
  // Меню з п'ятьма пунктами: 412, 375 і 360 px (з 22a і uk на 401–700 px показує короткі підписи).
  await expectPhoneMenu14a(hostPhone, 412);
  await expectPhoneMenu14a(hostPhone, 375);
  await expectPhoneMenu14a(hostPhone, 360);
  await hostPhone.close();
  pages.delete('hostPhone14a');

  // ── 2. Лобі: призи на 1-ше й 2-ге місця, «Граємо за» на сцені й телефонах. ──
  const data = {
    ...makeRoundsQuiz([classicRound('r1', prizeQuestions14a() as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]),
    title: TITLE,
  };
  const created = await host.request.post(`${base}/api/quizzes`, { data });
  expect(created.ok(), await created.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: TITLE }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stage = await open('stage14a', 1280, 720);
  track('stage', stage);
  await stage.goto((await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
  const petro = await open('petro14a', 375, 812);
  await noShare(petro);
  track('petro', petro);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await host.getByText('Петро', exact).first().waitFor();

  const panel = host.locator('section.prize-places');
  await panel.getByRole('heading', { name: 'Призи гри', ...exact }).waitFor();
  const placeSelect = (index: number) => panel.locator('.prize-place').nth(index).locator('select');
  await placeSelect(0).locator('option', { hasText: 'Головний приз' }).waitFor({ state: 'attached' });
  await placeSelect(0).selectOption({ label: 'Головний приз' });
  await placeSelect(1).selectOption({ label: 'Друге місце' });
  await panel.getByRole('button', { name: 'Покласти призи', ...exact }).click();
  await panel.getByText('Призи покладено.', exact).waitFor();
  await shot(host, 'p14a-host-lobby');

  const stageFor = stage.locator('.playing-for');
  await stageFor.getByText('Граємо за', exact).waitFor();
  for (const text of ['Золотий кубок', 'Піца 🍕', 'Срібна медаль']) expect(await stageFor.innerText()).toContain(text);
  // «Граємо за» не виштовхує QR за межі 720 px, сцена не гортається.
  const qr = (await stage.locator('.qr').boundingBox())!;
  expect(qr.y + qr.height, 'p14a-stage-lobby: the QR is pushed below 720').toBeLessThanOrEqual(720);
  const forBox = (await stageFor.boundingBox())!;
  expect(forBox.y + forBox.height, 'p14a-stage-lobby: «Граємо за» is below 720').toBeLessThanOrEqual(720);
  expect(await stage.evaluate('document.scrollingElement.scrollHeight <= innerHeight'), 'p14a-stage-lobby: the stage scrolls').toBe(true);
  await shot(stage, 'p14a-stage-lobby');

  const phoneFor = olya.locator('.playing-for');
  await phoneFor.waitFor();
  const phoneLine = (await phoneFor.textContent())!;
  expect(phoneLine.startsWith('Граємо за: '), phoneLine).toBe(true);
  for (const text of ['🏆 Золотий кубок', '🎁 Піца 🍕', '🏅 Срібна медаль']) expect(phoneLine).toContain(text);
  await expectNoSideScroll(olya, 'p14a-phone-lobby');
  await petro.locator('.playing-for').waitFor();

  // Лобі без трофеїв: жодного запиту на модель чи чанк рушія.
  for (const [name, list] of requests) expect(list.filter(isTrophyRequest), `${name} loaded 3D in the lobby`).toEqual([]);

  // ── 3. Гра: Оля 200, Петро 100. ──
  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  await step('Почати гру');
  await afterSplash(host, stage, olya, petro);
  await step('Почати раунд');
  await afterSplash(host, stage, olya, petro);
  await olya.getByRole('button', { name: /Львів/ }).waitFor();
  await petro.getByRole('button', { name: /Тернопіль/ }).waitFor();
  await pickOption(olya, 'Львів');
  await pickOption(petro, 'Тернопіль');
  await host.getByText('Запитання закрите').waitFor();
  await step('Показати відповідь');
  await step('Далі');
  await step('Наступне запитання');
  await afterSplash(host, stage, olya, petro);
  for (const page of [olya, petro]) {
    await page.getByRole('button', { name: /Чорне/ }).waitFor();
    await pickOption(page, 'Чорне');
  }
  await host.getByText('Запитання закрите').waitFor();
  await step('Показати відповідь');
  await step('Завершити гру');

  // ── 4. Церемонія: спершу 2-ге місце, тоді переможець. ──
  const ceremony = stage.locator('.ceremony');
  const second = ceremony.locator('.podium-col.is-place-2.is-shown');
  const first = ceremony.locator('.podium-col.is-place-1.is-shown');
  await second.waitFor({ timeout: 20_000 });
  expect(await second.locator('.podium-name').textContent()).toBe('Петро');
  expect(await first.count(), 'the winner is shown before the 2nd place').toBe(0);
  await first.waitFor({ timeout: 10_000 });
  expect(await first.locator('.podium-name').textContent()).toBe('Оля');
  expect(await first.locator('.engraving').textContent()).toBe(ENGRAVING);
  // Титул уже з короною: друга 👑 не додається.
  expect(await first.locator('.podium-title').textContent()).toBe(KING);
  expect(await first.locator('.podium-real').textContent()).toContain('Піца 🍕');
  // Призи лише на 1-му й 2-му місцях: подіум у дві колонки, 2 — 1, без порожньої третьої.
  expect(await ceremony.locator('.podium-col').evaluateAll((cols) => cols.map((col) => col.getAttribute('data-place')))).toEqual(['2', '1']);
  expect(await stage.evaluate(`getComputedStyle(document.querySelector('.ceremony .podium')).gridTemplateColumns.split(' ').length`)).toBe(2);
  // Гравіювання не обрізане й не виходить за сцену.
  const engraving = first.locator('.engraving');
  expect(await engraving.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight + 1), 'the engraving is clipped').toBe(true);
  const engravingBox = (await engraving.boundingBox())!;
  expect(engravingBox.x >= 0 && engravingBox.x + engravingBox.width <= 1280 && engravingBox.y + engravingBox.height <= 720, 'the engraving leaves the stage').toBe(true);
  expect(await stage.evaluate('document.scrollingElement.scrollHeight <= innerHeight'), 'p14a-stage-ceremony: the stage scrolls').toBe(true);
  // 3D є (запит моделі кубка) або, без WebGL у безголовому браузері, значок-емодзі.
  await expect
    .poll(async () => requests.get('stage')!.some((url) => url.endsWith('/models/cup.glb')) || (await first.locator('.trophy-fallback').count()) > 0, POLL)
    .toBe(true);
  const stage3d = requests.get('stage')!.some((url) => url.endsWith('/models/cup.glb'));
  console.log(`p14a: stage trophy — ${stage3d ? 'cup.glb requested (3D)' : 'emoji fallback (no WebGL)'}`);
  // Кадр — коли колонка переможця вже піднялась (скінченні анімації скінчились), а модель кубка намалювалась.
  await stage.evaluate(`Promise.all(
    [...document.querySelectorAll('.ceremony .is-place-1')].flatMap((el) => el.getAnimations({ subtree: true }))
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => undefined)),
  ).then(() => true)`);
  if (stage3d) await first.locator('.trophy-fallback').waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
  await shot(stage, 'p14a-stage-ceremony');
  // Після церемонії — звичайний п'єдестал.
  await stage.locator('.stage-board.is-final').waitFor({ timeout: 15_000 });
  expect(await ceremony.count()).toBe(0);

  // Телефон Олі: «Твій приз» і диплом файлом.
  const olyaPrize = olya.locator('section.my-prize');
  await olyaPrize.getByRole('heading', { name: 'Твій приз', ...exact }).waitFor({ timeout: 25_000 });
  expect(await olyaPrize.innerText()).toContain('1 місце');
  expect(await olyaPrize.getByText('Ти граєш як гість: у вітрину приз не потрапить.', exact).count()).toBe(0);
  expect(await olyaPrize.locator('.podium-title').textContent()).toBe(KING);
  const [download] = await Promise.all([olya.waitForEvent('download'), olyaPrize.getByRole('button', { name: 'Диплом', ...exact }).click()]);
  expect(download.suggestedFilename()).toBe('dyplom-Оля.png');
  const png = readFileSync((await download.path())!);
  expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'the diploma is not a PNG').toBe(true);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 850]);
  expect(await olyaPrize.getByRole('alert').count(), 'the diploma failed').toBe(0);
  await expectNoSideScroll(olya, 'p14a-phone-prize');
  // «Кубок» поруч із «Диплом»: великий трофей на весь екран 375 px.
  await expectPrizeViewer(olya, olyaPrize.getByRole('button', { name: 'Кубок', ...exact }), 'p14a-phone-prize-view', ENGRAVING);

  // Пульт: церемонія й на ньому — «Церемонія тут» з «Кубок» під місцем переможця.
  await click(host, 'Церемонія тут');
  const hostCeremony = host.locator('.host-ceremony .ceremony');
  await hostCeremony.locator('.podium-col.is-place-1.is-shown').waitFor({ timeout: 15_000 });
  expect(await hostCeremony.locator('.podium-col.is-place-1 .podium-name').textContent()).toBe('Оля');
  await expectPrizeViewer(host, hostCeremony.locator('.podium-col.is-place-1').getByRole('button', { name: 'Кубок', ...exact }), 'p14a-host-prize-view', ENGRAVING);

  // Диплом у <img>: він малюється, і на ньому є текст (темні пікселі на кремовому тлі), а не лише рамка.
  const diplomaPage = await open('diploma14a', 1200, 850);
  await diplomaPage.setContent(`<!doctype html><body style="margin:0"><img id="d" src="data:image/png;base64,${png.toString('base64')}"></body>`);
  const ink = (await diplomaPage.evaluate(`(async () => {
    const img = document.getElementById('d');
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0);
    const { data } = context.getImageData(100, 100, img.naturalWidth - 200, img.naturalHeight - 200);
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 200) dark++;
    return { width: img.naturalWidth, height: img.naturalHeight, dark };
  })()`)) as { width: number; height: number; dark: number };
  expect([ink.width, ink.height]).toEqual([1200, 850]);
  expect(ink.dark, 'the diploma has no text').toBeGreaterThan(2000);
  await shot(diplomaPage, 'p14a-diploma');

  // Телефон Петра (гість, 2-ге місце): приз, нотатка гостя, без диплома.
  const petroPrize = petro.locator('section.my-prize');
  await petroPrize.getByRole('heading', { name: 'Твій приз', ...exact }).waitFor({ timeout: 25_000 });
  expect(await petroPrize.innerText()).toContain('2 місце');
  await petroPrize.getByText('Ти граєш як гість: у вітрину приз не потрапить.', exact).waitFor();
  expect(await petroPrize.getByRole('button', { name: 'Диплом', ...exact }).count()).toBe(0);
  await expectNoSideScroll(petro, 'p14a-phone-guest');

  // ── 5. Склад і вітрина. ──
  await expect
    .poll(async () => {
      const items = (await (await host.request.get(`${base}/api/me/prizes`)).json()) as { content: { name: string }; status: string }[];
      return items.map((item) => [item.content.name, item.status]);
    }, POLL)
    .toEqual([['Друге місце', 'free']]);

  // На головній профілю — полиця кубків (23a); повна вітрина «Нагороди» — на /profile/prizes.
  await olya.goto(`${base}/profile`);
  const shelf = olya.locator('section.shelf');
  await shelf.locator('.shelf-item').first().waitFor();
  expect(await shelf.locator('.shelf-item').count()).toBe(1);
  expect(await shelf.locator('.shelf-quiz').textContent()).toBe(TITLE);
  // Бейдж титулу біля ніку в шапці профілю (поза вітриною).
  await olya.locator('.nick-title', { hasText: KING }).first().waitFor();
  expect(await olya.locator('.nick-title').evaluateAll((els) => els.filter((el) => !el.closest('section.showcase')).map((el) => el.textContent))).toContain(KING);
  await expectFullHeadTitle(olya, KING, 'p14a-own-profile');
  await olya.goto(`${base}/profile/prizes`);
  const showcase = olya.locator('section.showcase');
  await showcase.getByRole('heading', { name: 'Нагороди', ...exact }).waitFor();
  const card = showcase.locator('.award-card');
  expect(await card.count()).toBe(1);
  expect(await card.locator('.award-line').textContent()).toContain('1 місце · Призова вікторина 14a');
  expect(await card.locator('.engraving').textContent()).toBe(ENGRAVING);
  expect(await showcase.getByRole('button', { name: 'Диплом', ...exact }).count()).toBe(1);
  // Вітрина — одна колонка, картка в межах екрана.
  await card.scrollIntoViewIfNeeded();
  const cardBox = (await card.boundingBox())!;
  expect(cardBox.x >= 0 && cardBox.x + cardBox.width <= 375, 'the award card leaves the 375 phone').toBe(true);
  await expectNoSideScroll(olya, 'p14a-showcase');
  await expectPrizeViewer(olya, card.getByRole('button', { name: 'Кубок', ...exact }), 'p14a-showcase-view', ENGRAVING);

  const olyaId = await myId(olya);
  const response = await petro.request.get(`${base}/api/profiles/${olyaId}`);
  expect(response.ok(), await response.text()).toBe(true);
  const profile = (await response.json()) as { showcase: { title: { text: string } | null; awards: unknown[] } };
  expect(profile.showcase.awards).toHaveLength(1);
  expect(profile.showcase.title?.text).toBe(KING);

  // Публічний профіль Олі очима Петра (375 px): полиця з кубком (23a; гравіювання — у перегляді) і титул біля ніку в шапці.
  await petro.goto(`${base}/profile/${olyaId}`);
  await petro.getByRole('heading', { level: 1, name: /Оля/ }).waitFor();
  const publicShelf = petro.locator('section.shelf');
  await publicShelf.locator('.shelf-item').first().waitFor();
  expect(await publicShelf.locator('.shelf-item').count()).toBe(1);
  expect(await publicShelf.locator('.shelf-quiz').textContent()).toBe(TITLE);
  await expectPrizeViewer(petro, publicShelf.locator('button.shelf-cup'), 'p14a-public-shelf-view', ENGRAVING);
  await expectFullHeadTitle(petro, KING, 'p14a-public-profile');
  await expectNoSideScroll(petro, 'p14a-public-profile');
  await shot(petro, 'p14a-public-profile');

  expect(problems).toEqual([]);
}

/** Титул у шапці профілю на вузькому екрані: окремим рядком під ніком, повністю (не обрізаний). */
async function expectFullHeadTitle(page: Page, title: string, label: string) {
  const badge = page.locator('.profile-head .nick-title');
  await badge.waitFor();
  expect(await badge.textContent(), label).toBe(title);
  // Нік — перший текстовий вузол h1: його рамка через Range, титул має починатися нижче.
  const layout = await page.evaluate(`(() => {
    const el = document.querySelector('.profile-head .nick-title');
    const range = document.createRange();
    range.selectNodeContents(el.parentElement.firstChild);
    const nickBox = range.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return { clipped: el.scrollWidth > el.clientWidth + 1, below: box.top >= nickBox.bottom - 1, display: getComputedStyle(el).display };
  })()`);
  expect(layout, `${label}: the title next to the nickname`).toEqual({ clipped: false, below: true, display: 'block' });
}

it('part 14a: prizes — the host makes a gold cup with an engraving, a pizza, a title and a diploma and a silver medal in «Мої призи», puts them on places 1 and 2 in the lobby, the stage and the phones show «Граємо за», the finish raises the podium with the winner last, the signed-in Оля gets «Твій приз» and downloads the diploma, the cup moves to her showcase with the title, and the medal of the guest Петро goes back to the store', async () => {
  try {
    await prizes14a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

function levelQuestions15a() {
  const common = { imageUrl: null, video: null, timeLimit: 20, points: 100 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  return [
    { ...common, id: 'l1', type: 'single' as const, text: 'Яка річка тече через Київ?', options: options('Дніпро', 'Дністер', 'Південний Буг', 'Десна'), correctId: 'a', hint: 'Найдовша річка України' },
    { ...common, id: 'l2', type: 'boolean' as const, text: 'Говерла — найвища вершина України?', correct: true },
    { ...common, id: 'l3', type: 'boolean' as const, text: 'Чорне море — прісне?', correct: false },
    { ...common, id: 'l4', type: 'single' as const, text: 'Яке місто стоїть на семи пагорбах над Дніпром?', options: options('Київ', 'Харків', 'Полтава', 'Чернігів'), correctId: 'a' },
    { ...common, id: 'l5', type: 'boolean' as const, text: 'Карпати лежать на сході України?', correct: false },
  ];
}

/**
 * Рамки ніків (15a) не обрізані: обведення (outline + offset) кожного .nick з рамкою лежить у межах екрана й кожного
 * предка з overflow ≠ visible, а сам нік не скорочено трикрапкою.
 */
const FRAMES_FIT_15A = `(() => {
  const bad = [];
  for (const el of document.querySelectorAll('.nick[class*="nick-f-"]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    const pad = parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset);
    const label = el.textContent;
    if (r.left - pad < -0.5 || r.right + pad > innerWidth + 0.5) bad.push(label + ': the frame leaves the screen');
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue;
      const pr = p.getBoundingClientRect();
      const l = pr.left + p.clientLeft, t = pr.top + p.clientTop, rr = l + p.clientWidth, bb = t + p.clientHeight;
      const insideX = r.left >= l - 0.5 && r.right <= rr + 0.5;
      const insideY = r.top >= t - 0.5 && r.bottom <= bb + 0.5;
      if (insideX && insideY && (r.left - pad < l - 0.5 || r.right + pad > rr + 0.5 || r.top - pad < t - 0.5 || r.bottom + pad > bb + 0.5)) {
        bad.push(label + ': the frame is clipped by ' + p.tagName.toLowerCase() + '.' + [...p.classList].join('.'));
      }
    }
    const name = el.querySelector('.nick-name');
    if (name && name.scrollWidth > name.clientWidth + 1) bad.push(label + ': the nickname is cut');
  }
  return bad;
})()`;

async function expectFramesFit15a(page: Page, label: string) {
  const frames = await page.locator('.nick[class*="nick-f-"]').count();
  expect(frames, `${label}: no framed nickname on the screen`).toBeGreaterThan(0);
  expect(await page.evaluate(FRAMES_FIT_15A), `${label}: framed nicknames`).toEqual([]);
}

async function levels15a() {
  const TITLE = 'Рівнева вікторина 15a';
  const host = await open('host15a', 1280, 800);
  await register(host, 'host', 'Марко Ведучий', 'host15a@example.com');
  const olya = await open('olya15a', 375, 812);
  await register(olya, 'menu', 'Оля', 'olya15a@example.com');
  const petro = await open('petro15a', 375, 812);
  await register(petro, 'menu', 'Петро', 'petro15a@example.com');
  const iryna = await open('iryna15a', 375, 812);
  await register(iryna, 'menu', 'Ірина', 'iryna15a@example.com');

  // ── 1. Сід і вбрання: кожен раз відкрив профіль (мітка ретро), далі досвід прямо в журнал. ──
  const ids = new Map<Page, string>();
  for (const page of [host, olya, petro, iryna]) {
    await page.goto(`${base}/profile/looks`);
    await page.locator('section.level-card').waitFor();
    ids.set(page, await myId(page));
  }
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  for (const [page, amount] of [[olya, 3200], [petro, 5900]] as const) {
    await db.insert(xpEntry).values({ userId: ids.get(page)!, source: 'game', gameId: randomUUID(), amount, counted: false, day: kyivDay(yesterday), at: yesterday, createdAt: yesterday });
  }
  await olya.goto(`${base}/profile`);
  // Шкала — одразу під ніком (section.level-bar) на /profile; нагороди й вигляд (section.level-card) — на /profile/looks (23a).
  const bar = olya.locator('section.level-bar');
  await bar.getByRole('heading', { name: 'Рівень 10', ...exact }).waitFor();
  expect(await bar.locator('p.meta').first().textContent()).toBe(`3200 / ${xpForLevel(11)} досвіду`);
  await olya.goto(`${base}/profile/looks`);
  const card = olya.locator('section.level-card');
  await card.getByRole('radiogroup', { name: 'Колір ніку', ...exact }).getByRole('radio', { name: 'Небо', ...exact }).check();
  await card.getByRole('radiogroup', { name: 'Рамка ніку', ...exact }).getByRole('radio', { name: 'Бронза', ...exact }).check();
  await card.getByRole('radiogroup', { name: 'Значок', ...exact }).getByRole('radio', { name: '⭐', ...exact }).check();
  const [saved] = await Promise.all([olya.waitForResponse((r) => r.url().endsWith('/api/me/looks') && r.request().method() === 'PUT'), click(olya, 'Зберегти вигляд')]);
  expect(saved.ok(), await saved.text()).toBe(true);
  expect(await saved.json()).toMatchObject({ looks: { color: 'sky', frame: 'bronze', badge: '⭐' } });
  // Розділ «Рівень» і вибір вбрання — одна колонка в межах 375 px.
  const cardBox = (await card.boundingBox())!;
  expect(cardBox.x >= 0 && cardBox.x + cardBox.width <= 375, 'p15a-profile: the level card leaves the phone').toBe(true);
  for (const option of await card.locator('.look-option').all()) {
    const box = (await option.boundingBox())!;
    expect(box.x + box.width, 'p15a-profile: a look option leaves the phone').toBeLessThanOrEqual(375 + 0.5);
  }
  await expectNoSideScroll(olya, 'p15a-profile');

  // ── 2. Лобі: «Рів. N», колір і рамка біля ніку. ──
  const data = {
    ...makeRoundsQuiz([classicRound('r1', levelQuestions15a() as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]),
    title: TITLE,
  };
  const created = await host.request.post(`${base}/api/quizzes`, { data });
  expect(created.ok(), await created.text()).toBe(true);
  const quizId = ((await created.json()) as { id: string }).id;
  const guest = await open('guest15a', 375, 812);
  const stage = await open('stage15a', 1280, 720);

  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  const openGame = async () => {
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: TITLE }).getByRole('button', { name: 'Грати', ...exact }).click();
    await host.waitForURL(/\/host\/\d{6}$/);
    const code = host.url().slice(-6);
    await stage.goto((await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
    return code;
  };
  const answer = async (page: Page, text: string) => {
    const button = text === 'Так' || text === 'Ні' ? page.getByRole('button', { name: text, ...exact }) : page.getByRole('button', { name: new RegExp(text) });
    await button.waitFor();
    await button.click();
  };
  /** Запитання: відповіді, «Показати відповідь», далі «Далі» → «Наступне запитання» або, після останнього, «Завершити гру». */
  const play = async (players: Page[], picks: [Page, string][], last: boolean) => {
    for (const [page, text] of picks) await answer(page, text);
    await host.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
    if (last) {
      await step('Завершити гру');
      return;
    }
    await step('Далі');
    await step('Наступне запитання');
    await afterSplash(host, stage, ...players);
  };
  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const castFog = async (nickname: string) => {
    const button = row(nickname).getByRole('button', { name: 'Дебаф', ...exact });
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await row(nickname).locator('.player-tools').getByRole('button', { name: /Туман/ }).click();
  };

  let code = await openGame();
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(iryna, code, 'Ірина', false);
  await join(guest, code, 'Гість', false);
  await host.getByText('Гість', exact).first().waitFor();

  const chip = (nickname: string) => stage.locator('ul.chips li', { hasText: nickname });
  await chip('Оля').locator('.nick-level').getByText('Рів. 10', exact).waitFor();
  await chip('Оля').locator('.nick-name.nick-c-sky').waitFor();
  expect(await chip('Оля').locator('.nick.nick-f-bronze').count(), 'Оля’s bronze frame on the stage').toBe(1);
  await chip('Петро').locator('.nick-level').getByText('Рів. 15', exact).waitFor();
  expect(await chip('Гість').locator('.nick-level').count(), 'a level badge next to the guest').toBe(0);
  expect(await chip('Ірина').locator('.nick-level').count(), 'a level badge next to the level 1 Ірина').toBe(0);
  expect(await stage.evaluate('document.scrollingElement.scrollHeight <= innerHeight'), 'p15a-stage-lobby: the stage scrolls').toBe(true);
  await expectFramesFit15a(stage, 'p15a-stage-lobby');
  await shot(stage, 'p15a-stage-lobby');
  await host.getByText('Бонуси рівнів увімкнено', exact).waitFor();
  await row('Оля').locator('.nick-level').getByText('Рів. 10', exact).waitFor();
  // Рамка Олі в рядку гравця на пульті не виходить за межі рядка.
  await row('Оля').locator('.nick.nick-f-bronze').waitFor();
  await expectFramesFit15a(host, 'p15a-host-lobby');
  await expectNoSideScroll(olya, 'p15a-phone-lobby');

  // ── 3. Бонуси рівня: підказка й +5 с у Олі, оберіг Петра гасить Туман ведучого. ──
  const all = [olya, petro, iryna, guest];
  await step('Почати гру');
  await afterSplash(host, stage, ...all);
  await step('Почати раунд');
  await afterSplash(host, stage, ...all);
  const olyaAnswer = olya.getByRole('button', { name: /Дніпро/ });
  await olyaAnswer.waitFor();
  const hintButton = olya.getByRole('button', { name: '💡 Підказка рівня', ...exact });
  const timeButton = olya.getByRole('button', { name: '⏱ +5 с', ...exact });
  await hintButton.waitFor();
  await expect.poll(() => hintButton.isDisabled(), { timeout: 10_000 }).toBe(false);
  // Ірина (рівень 1) і гість бонусів не мають.
  for (const page of [iryna, guest]) expect(await page.locator('.perk-bar').count(), 'a perk row without a level').toBe(0);
  const answerY = async (page: Page, text: RegExp) => (await page.getByRole('button', { name: text }).boundingBox())!.y;
  const before = await answerY(olya, /Дніпро/);
  await hintButton.click();
  await olya.locator('.perk-hint').getByText('💡 Найдовша річка України', exact).waitFor();
  await expect.poll(() => hintButton.isDisabled(), { timeout: 5000 }).toBe(true);
  expect(await answerY(olya, /Дніпро/), 'the level hint moves the answers').toBe(before);
  const secondsBefore = await seconds(olya);
  await expect.poll(() => timeButton.isDisabled(), { timeout: 5000 }).toBe(false);
  await timeButton.click();
  await expect.poll(() => timeButton.isDisabled(), { timeout: 5000 }).toBe(true);
  await expect.poll(() => seconds(olya), { timeout: 3000 }).toBeGreaterThanOrEqual(secondsBefore + 3);
  expect(await answerY(olya, /Дніпро/), '+5 s moves the answers').toBe(before);
  // Реакцій під час запитання немає: смуга не накриває бонусів, бо її немає зовсім.
  expect(await olya.locator('.reaction-strip').count(), 'a reaction strip during a question').toBe(0);
  await expectNoSideScroll(olya, 'p15a-phone-perks');

  await row('Петро').locator('.ward-tag').waitFor();
  const petroBefore = await answerY(petro, /Дніпро/);
  await castFog('Петро');
  await petro.getByText('🛡 Оберіг погасив дебаф', exact).waitFor({ timeout: 3000 });
  await shot(petro, 'p15a-phone-ward');
  expect(await answerY(petro, /Дніпро/), 'the ward moment moves Петро’s answers').toBe(petroBefore);
  await expectNoSideScroll(petro, 'p15a-phone-ward');
  // Мить оберегу минає (WARD_SPENT_MS = 4 с), а поля відповіді стоять на місці до кінця запитання.
  await petro.getByText('🛡 Оберіг погасив дебаф', exact).waitFor({ state: 'hidden', timeout: 6000 });
  expect(await answerY(petro, /Дніпро/), 'the end of the ward moment moves Петро’s answers').toBe(petroBefore);
  await row('Петро').locator('.ward-tag').waitFor({ state: 'detached' });
  expect(await row('Петро').locator('.debuff-tag').count(), 'the host fog stuck on the warded Петро').toBe(0);

  await play(all, [[olya, 'Дніпро'], [petro, 'Дніпро'], [iryna, 'Десна'], [guest, 'Дністер']], false);
  for (const page of [olya, petro]) await page.getByRole('button', { name: 'Так', ...exact }).waitFor();
  expect(await petro.locator('.debuff-zone[data-debuff="fog"], .debuff-fog').count(), 'the quenched fog fired on Петро').toBe(0);
  await play(all, [[olya, 'Так'], [petro, 'Так'], [iryna, 'Ні'], [guest, 'Ні']], false);
  await play(all, [[olya, 'Ні'], [petro, 'Так'], [iryna, 'Ні'], [guest, 'Так']], false);
  await play(all, [[olya, 'Київ'], [petro, 'Київ'], [iryna, 'Харків'], [guest, 'Полтава']], false);
  await play(all, [[olya, 'Ні'], [petro, 'Так'], [iryna, 'Так'], [guest, 'Так']], true);

  // ── 4. Фінал: рамки в таблицях на 375 px; стікери Ірини (рівень 1): серія nyaa закрита, nya — ні. ──
  await iryna.getByText('Гру завершено').first().waitFor();
  for (const [page, name] of [[petro, 'petro'], [iryna, 'iryna']] as const) {
    await page.locator('.standings').first().waitFor();
    await expectFramesFit15a(page, `p15a-final-table-${name}`);
    for (const score of await page.locator('.standings li .score').all()) {
      const box = (await score.boundingBox())!;
      expect(box.x + box.width, `p15a-final-table-${name}: a score leaves the 375 phone`).toBeLessThanOrEqual(375 + 0.5);
    }
  }
  await shot(petro, 'p15a-phone-final');
  await expectFramesFit15a(stage, 'p15a-stage-final');
  await shot(stage, 'p15a-stage-final');
  const nyaa = STICKERS.find((sticker) => sticker.series === 'nyaa')!;
  const nya = STICKERS.find((sticker) => sticker.series === 'nya')!;
  await iryna.getByRole('button', { name: '😀 Реакція', ...exact }).click();
  const sheet = iryna.getByRole('dialog', { name: 'Реакція', ...exact });
  const allStickers = sheet.getByRole('group', { name: 'Усі стікери', ...exact });
  const locked = allStickers.locator('.reaction-pick', { has: iryna.locator(`img[src="${stickerPath(nyaa)}"]`) });
  expect(await locked.getAttribute('aria-label')).toBe('Відкриється з рівня 3');
  expect(await locked.isDisabled(), 'a locked sticker is clickable').toBe(true);
  expect(await locked.locator('.reaction-lock').textContent()).toBe('🔒');
  await shot(iryna, 'p15a-stickers');
  await expectNoSideScroll(iryna, 'p15a-stickers');
  // Закрита серія nyaa з 🔒 у полі зору.
  await locked.scrollIntoViewIfNeeded();
  expect(await locked.locator('.reaction-lock').isVisible(), 'the 🔒 of a locked sticker').toBe(true);
  await shot(iryna, 'p15a-stickers-locked');
  await allStickers.getByRole('button', { name: `Стікер ${nya.id}`, ...exact }).click();
  await sheet.waitFor({ state: 'detached' });
  await stage.locator(`.reaction-badge img[src="${stickerPath(nya)}"]`).first().waitFor();

  // ── 5. Досвід: Оля 200, Петро 140, Ірина 90; ведучий-автор і гість — нічого. ──
  await expect
    .poll(async () => ((await (await iryna.request.get(`${base}/api/me/profile`)).json()) as { level: OwnLevel }).level.progress.xp, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const quizRows = () => db.select().from(xpEntry).where(and(eq(xpEntry.source, 'game'), eq(xpEntry.quizId, quizId)));
  await expect.poll(async () => (await quizRows()).length, { timeout: 15_000 }).toBe(3);
  const firstRows = await quizRows();
  const firstGame = firstRows[0]!.gameId;
  expect(firstRows.every((r) => r.gameId === firstGame)).toBe(true);
  const byUser = (rows: typeof firstRows) => Object.fromEntries(rows.map((r) => [r.userId, { amount: r.amount, counted: r.counted, reason: r.reason }]));
  expect(byUser(firstRows)).toEqual({
    [ids.get(olya)!]: { amount: 200, counted: true, reason: null },
    [ids.get(petro)!]: { amount: 140, counted: true, reason: null },
    [ids.get(iryna)!]: { amount: 90, counted: true, reason: null },
  });
  expect(firstRows.some((r) => r.userId === ids.get(host)), 'the host-author got a game row').toBe(false);
  const irynaAchievements = () => db.select().from(xpEntry).where(and(eq(xpEntry.userId, ids.get(iryna)!), eq(xpEntry.source, 'achievement')));
  await expect.poll(async () => (await irynaAchievements()).map((r) => r.achievementId), { timeout: 15_000 }).toContain('first_game');
  for (const r of await irynaAchievements()) expect(r.amount, r.achievementId!).toBe(ACHIEVEMENT_XP[achievementRarity(r.achievementId!)]);
  // Картка «Рівень» Олі: 3200 із сіду + 200 за гру + досягнення гри — рівно сума її журналу.
  const olyaXp = async () => (await db.select().from(xpEntry).where(eq(xpEntry.userId, ids.get(olya)!))).reduce((sum, r) => sum + r.amount, 0);
  await expect
    .poll(async () => {
      const own = ((await (await olya.request.get(`${base}/api/me/profile`)).json()) as { level: OwnLevel }).level.progress.xp;
      return own === (await olyaXp()) ? own : -1;
    }, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(3200 + 200);
  const olyaTotal = await olyaXp();
  await olya.goto(`${base}/profile`);
  const after = olya.locator('section.level-bar');
  await after.waitFor();
  expect(await after.locator('p.meta').first().textContent()).toBe(`${olyaTotal} / ${xpForLevel(levelOf(olyaTotal) + 1)} досвіду`);
  await expectNoSideScroll(olya, 'p15a-profile-after');

  // ── 6. Повтор тієї самої вікторини: усім трьом 0 з repeat_quiz. ──
  const three = [olya, petro, iryna];
  code = await openGame();
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(iryna, code, 'Ірина', false);
  await host.getByText('Ірина', exact).first().waitFor();
  await step('Почати гру');
  await afterSplash(host, stage, ...three);
  await step('Почати раунд');
  await afterSplash(host, stage, ...three);
  await play(three, [[olya, 'Дніпро'], [petro, 'Дніпро'], [iryna, 'Дніпро']], false);
  await play(three, [[olya, 'Так'], [petro, 'Так'], [iryna, 'Так']], false);
  await play(three, [[olya, 'Ні'], [petro, 'Ні'], [iryna, 'Так']], false);
  await play(three, [[olya, 'Київ'], [petro, 'Харків'], [iryna, 'Київ']], false);
  await play(three, [[olya, 'Ні'], [petro, 'Ні'], [iryna, 'Ні']], true);
  await expect.poll(async () => (await quizRows()).filter((r) => r.gameId !== firstGame).length, { timeout: 15_000 }).toBe(3);
  const secondRows = (await quizRows()).filter((r) => r.gameId !== firstGame);
  expect(byUser(secondRows)).toEqual({
    [ids.get(olya)!]: { amount: 0, counted: false, reason: 'repeat_quiz' },
    [ids.get(petro)!]: { amount: 0, counted: false, reason: 'repeat_quiz' },
    [ids.get(iryna)!]: { amount: 0, counted: false, reason: 'repeat_quiz' },
  });

  // ── 7. Вимикач у редакторі: без бонусів і без оберегу. ──
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: TITLE }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('details.powers > summary').click();
  const bonuses = host.locator('label.powers-item', { hasText: 'Бонуси рівнів' }).locator('input');
  expect(await bonuses.isChecked()).toBe(true);
  await bonuses.uncheck();
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  code = await openGame();
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(iryna, code, 'Ірина', false);
  await host.getByText('Бонуси рівнів вимкнено', exact).waitFor();
  await olya.getByText('Бонуси рівнів вимкнено ведучим', exact).waitFor();
  await shot(host, 'p15a-off-host-lobby');
  await step('Почати гру');
  await afterSplash(host, stage, ...three);
  expect(await row('Петро').locator('.ward-tag').count(), 'a ward with level bonuses off').toBe(0);
  await castFog('Петро');
  await row('Петро').locator('.debuff-tag').waitFor();
  await step('Почати раунд');
  await afterSplash(host, stage, ...three);
  await olyaAnswer.waitFor();
  await petro.locator('.debuff-zone[data-debuff="fog"]').waitFor();
  await petro.locator('.debuff-fog').waitFor();
  expect(await olya.getByRole('button', { name: /\+5 с/ }).count(), '+5 s with level bonuses off').toBe(0);
  expect(await olya.locator('.perk-bar').count(), 'a perk row with level bonuses off').toBe(0);
  await shot(olya, 'p15a-off');
  await shot(petro, 'p15a-off-petro');
  await step('Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();

  expect(problems).toEqual([]);
}

it('part 15a: levels — Оля (level 10) and Петро (level 15) wear their level badges, nick colour and frame in the lobby and tables, Оля takes +5 s and the level hint, Петро’s ward quenches the host’s debuff, Ірина sees locked sticker series, the finished game credits XP to the three accounts but not to the host-author or the guest, a second game of the same quiz gives nothing, and the switch in the editor turns level bonuses off', async () => {
  try {
    await levels15a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

it('part 16a: survival spectators — Оля errs and gets the survival question on her 375 phone, while Петро (safe) and Віра (a ghost) see it read-only with «Питання на виживання для: Оля», the picture and the options but no controls and no answer, clear of the reaction strip and without side scroll; the stage shows it with the picture; after the close everyone sees the correct answer and that Оля survived', async () => {
  try {
    await survivalWatch16a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Телефон (16a): прокручено донизу — панель випробування й дошка закінчуються над смугою реакцій. */
async function expectClearOfStrip16a(page: Page, name: string) {
  await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  const strip = await page.locator('.reaction-strip').boundingBox();
  expect(strip, `${name}: the reaction strip is there`).not.toBeNull();
  for (const selector of ['.survival-trial', '.survival-board']) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box, `${name}: ${selector}`).not.toBeNull();
    expect(box!.y + box!.height, `${name}: ${selector} runs under the reaction strip`).toBeLessThanOrEqual(strip!.y + 0.5);
  }
  await page.evaluate('window.scrollTo(0, 0)');
}

async function survivalWatch16a() {
  const host = await open('host16a', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host16a@example.com');
  const image = ((await (await host.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } })).json()) as { url: string }).url;
  const common = { imageUrl: null, video: null, timeLimit: 20, points: 100 };
  const s1 = { ...common, id: 's1', type: 'single' as const, text: 'Столиця Канади?', options: [{ id: 's1-a', text: 'Оттава' }, { id: 's1-b', text: 'Торонто' }, { id: 's1-c', text: 'Монреаль' }], correctId: 's1-a' };
  const s2 = { ...common, id: 's2', type: 'single' as const, text: 'Скільки континентів на Землі?', options: [{ id: 's2-a', text: 'Сім' }, { id: 's2-b', text: 'Шість' }, { id: 's2-c', text: 'Дев’ять' }], correctId: 's2-a' };
  const s3 = { ...common, id: 's3', type: 'text' as const, text: 'Столиця Туреччини?', accepted: ['Анкара'] };
  const t1 = { ...common, id: 't1', type: 'boolean' as const, text: 'Місяць більший за Землю', correct: false, timeLimit: 30 };
  const t2 = {
    ...common,
    id: 't2',
    type: 'single' as const,
    text: 'Яка річка тече через Київ?',
    imageUrl: image,
    timeLimit: 30,
    options: [{ id: 't2-a', text: 'Дніпро' }, { id: 't2-b', text: 'Дністер' }, { id: 't2-c', text: 'Десна' }],
    correctId: 't2-a',
  };
  const data = { ...makeRoundsQuiz([survivalRound('rs', [s1, s2, s3] as never, [t1, t2] as never, { title: 'Хто лишиться' })], { leaderboard: 'each' }), title: 'Вибування 16a' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Вибування 16a' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage16a', 1280, 720);
  await stage.goto(stageUrl);
  const olya = await open('olya16a', 375, 812);
  const petro = await open('petro16a', 375, 812);
  const vira = await open('vira16a', 375, 812);
  const petroFrames = socketFrames(petro);
  const viraFrames = socketFrames(vira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(vira, code, 'Віра', false);
  const phones = [olya, petro, vira];
  const all = [host, stage, ...phones];
  await click(host, 'Почати гру');
  await afterSplash(...all);
  await stage.locator('.survival-board').waitFor();
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 1. s1: Віра помиляється, не проходить питання на виживання й стає привидом; Оля дивиться.
  await stage.getByText('Столиця Канади?', exact).waitFor();
  await pickOption(olya, 'Оттава');
  await pickOption(petro, 'Оттава');
  await pickOption(vira, 'Торонто');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await vira.getByText('Ти на межі — зараз випробування.', exact).waitFor();
  await click(host, 'Далі');
  await afterSplash(stage, ...phones);
  await vira.getByText('Місяць більший за Землю', exact).waitFor();
  const olyaWatch = olya.locator('.survival-trial.is-watch');
  await olyaWatch.getByRole('heading', { name: 'Питання на виживання для: Віра', ...exact }).waitFor();
  await olyaWatch.getByText('Місяць більший за Землю', exact).waitFor();
  await pickOption(vira, '(^|\\s)Так$');
  await vira.getByText('Ти вибуваєш — тепер ти привид.', exact).waitFor();
  await olyaWatch.locator('.survival-watch-outcome li.is-out', { hasText: 'Віра — вибуває' }).waitFor();
  await olyaWatch.getByText('Правильна відповідь: Ні', exact).waitFor();
  await expect.poll(() => survivalGroupOf(stage, 'Віра'), POLL).toBe('Привиди');
  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 2. s2: Оля помиляється, Петро ні, привид Віра відповідає для себе.
  await stage.getByText('Скільки континентів на Землі?', exact).waitFor();
  await vira.locator('.survival-ghost-banner').waitFor();
  await pickOption(vira, 'Сім');
  await pickOption(olya, 'Шість');
  await pickOption(petro, 'Сім');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await olya.getByText('Ти на межі — зараз випробування.', exact).waitFor();
  await click(host, 'Далі');
  await afterSplash(stage, ...phones);

  // 3. Питання на виживання для Олі: у неї — кнопки, у Петра й Віри — лише читання.
  await olya.getByRole('button', { name: /Дніпро/ }).waitFor();
  await expectNoSideScroll(olya, 'p16a-olya-trial');
  await stage.getByText('Яка річка тече через Київ?', exact).waitFor();
  const stageImage = stage.locator('.survival-trial-area img.question-image');
  expect(await stageImage.count(), 'the stage shows the picture').toBe(1);
  await expect.poll(() => stageImage.evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth), POLL).toBeGreaterThan(0);
  await expectStageFits(stage, 'p16a-stage-trial');
  await shot(stage, 'p16a-stage-trial');
  for (const [who, page] of [['petro', petro], ['vira', vira]] as const) {
    const panel = page.locator('.survival-trial.is-watch');
    await panel.getByRole('heading', { name: 'Питання на виживання для: Оля', ...exact }).waitFor();
    await panel.getByText('Яка річка тече через Київ?', exact).waitFor();
    expect(await panel.locator('img.question-image').count(), `${who} sees the picture`).toBe(1);
    await panel.getByText('Ти дивишся — відповідають інші', exact).waitFor();
    expect(await panel.locator('ul.survival-watch-choices').getAttribute('aria-disabled'), `${who}: the options are not for tapping`).toBe('true');
    expect(await panel.locator('.choice').first().evaluate((el) => (globalThis as unknown as { getComputedStyle: (e: unknown) => { pointerEvents: string } }).getComputedStyle(el).pointerEvents), `${who}: an option takes no taps`).toBe('none');
    const options = await panel.locator('.choice').allInnerTexts();
    expect(options.length, `${who} sees three options`).toBe(3);
    for (const [i, text] of ['Дніпро', 'Дністер', 'Десна'].entries()) expect(options[i], `${who}: option ${i + 1}`).toContain(text);
    expect(await panel.locator('button:not(.question-image-zoom, .choice-zoom), input, textarea, select').count(), `${who} has no answer controls`).toBe(0);
    expect(await page.getByRole('button', { name: /Дніпро|Дністер|Десна/ }).count(), `${who} has no option buttons`).toBe(0);
    expect(await panel.locator('.choice.is-correct').count(), `${who} sees no correct option before the close`).toBe(0);
    expect(await bodyText(page), `${who} sees the answer before the close`).not.toContain('Правильна відповідь');
    await panel.getByText('Відповіли 0 з 1', exact).waitFor();
    await expectNoSideScroll(page, `p16a-${who}-watch`);
    await expectClearOfStrip16a(page, `p16a-${who}-watch`);
  }
  expect(openTrialLeaks('petro', petroFrames, 'question'), 'Петро saw the open trial').toBeGreaterThan(0);
  expect(openTrialLeaks('vira', viraFrames, 'question'), 'Віра saw the open trial').toBeGreaterThan(0);

  // 4. Оля відповідає правильно: усі бачать правильну відповідь і що вона вижила.
  await pickOption(olya, 'Дніпро');
  await olya.getByText('Пронесло! Ти живий(-а).', exact).waitFor();
  await olya.getByText('Правильна відповідь: A. Дніпро', exact).waitFor();
  await shot(olya, 'p16a-olya-safe');
  for (const [who, page] of [['petro', petro], ['vira', vira]] as const) {
    const panel = page.locator('.survival-trial.is-watch');
    await panel.locator('.survival-watch-outcome li.is-safe', { hasText: 'Оля — вижив(-ла)' }).waitFor();
    await panel.getByText('Правильна відповідь: A. Дніпро', exact).waitFor();
    expect(await panel.locator('.choice.is-correct').innerText(), `${who}: the correct option`).toContain('Дніпро');
    expect(await panel.locator('img.question-image').count(), `${who} still sees the picture`).toBe(1);
    expect(await panel.locator('button:not(.question-image-zoom, .choice-zoom), input, textarea, select').count(), `${who} has no controls after the close`).toBe(0);
    await expectNoSideScroll(page, `p16a-${who}-outcome`);
    await expectClearOfStrip16a(page, `p16a-${who}-outcome`);
  }
  await stage.getByText('Правильна відповідь: A. Дніпро', exact).waitFor();
  await stage.locator('.survival-edge-rows li.is-safe', { hasText: 'Оля' }).waitFor();
  await expectStageFits(stage, 'p16a-stage-outcome');
  await shot(stage, 'p16a-stage-outcome');
  expect(await survivalGroupOf(stage, 'Оля')).toBe('Живі');
}

/** Стан звуку телефона (16b): справжній <audio> — грає чи ні, і що каже картка. */
async function phoneSound16b(page: Page) {
  const playing = await page.locator('.player-audio audio').evaluate((audio) => !(audio as unknown as { paused: boolean }).paused);
  const card = page.locator('.player-audio .audio-card');
  return { playing, state: await card.getAttribute('data-state'), plays: await card.getAttribute('data-plays') };
}

/** Верхні краї варіантів відповіді (16b): дотик до «Прослухати» не має їх зсунути. */
async function answerTops16b(page: Page, names: RegExp[]) {
  return Promise.all(names.map(async (name) => Math.round((await page.getByRole('button', { name }).boundingBox())!.y)));
}

async function listenOnPhone16b() {
  const host = await open('host16b', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host16b@example.com');
  // 10 секунд тиші: фрагмент 8 с справді грає, поки ми дивимось.
  const upload = await host.request.post(`${base}/api/uploads/audio`, { data: silentMp3(380), headers: { 'content-type': 'audio/mpeg' } });
  expect(upload.status(), await upload.text()).toBe(201);
  const audioUrl = ((await upload.json()) as { url: string }).url;
  const common = { imageUrl: null, video: null, points: 100 };
  const q1 = {
    ...common,
    id: 'q1',
    type: 'single' as const,
    text: 'Який інструмент звучить?',
    timeLimit: 30,
    options: [
      { id: 'q1-a', text: 'Бандура' },
      { id: 'q1-b', text: 'Скрипка' },
      { id: 'q1-c', text: 'Трембіта' },
      { id: 'q1-d', text: 'Сопілка' },
    ],
    correctId: 'q1-a',
    audio: { source: 'file' as const, url: audioUrl, start: 1, duration: 8 },
  };
  const q2 = { ...common, id: 'q2', type: 'boolean' as const, text: 'Скрипка має смичок', timeLimit: 20, correct: true };
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [q1, q2] as never, { title: 'Звуки', speedBonus: false, shuffleOptions: false })], { leaderboard: 'end' }),
    title: 'Прослухати 16b',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Прослухати 16b' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage16b', 1280, 720);
  await stage.goto(stageUrl);
  const olya = await open('olya16b', 375, 812);
  const petro = await open('petro16b', 375, 812);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  const phones = [olya, petro];
  const all = [host, stage, ...phones];
  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 1. Сцена відкрита: звук грає там, телефони мовчать і пропонують «Прослухати».
  await stage.getByText('Який інструмент звучить?', exact).waitFor();
  const stageUnlock = stage.getByRole('button', { name: '🔊 Увімкнути звук', ...exact });
  if (await stageUnlock.isVisible()) await stageUnlock.click();
  await expect.poll(() => stage.locator('[data-plays]').getAttribute('data-plays'), POLL).toBe('1');
  const options = [/Бандура/, /Скрипка/, /Трембіта/, /Сопілка/];
  for (const page of phones) {
    await page.getByRole('button', { name: '🔊 Прослухати', ...exact }).waitFor();
    expect(await phoneSound16b(page), 'a phone plays by itself while the stage is open').toEqual({ playing: false, state: 'idle', plays: '0' });
  }
  const toggle = olya.locator('.audio-toggle');
  const box = (await toggle.boundingBox())!;
  expect(box.x, 'p16b: the button leaves the phone on the left').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'p16b: the button leaves the phone on the right').toBeLessThanOrEqual(375 + 0.5);
  const before = await answerTops16b(olya, options);
  const cardHeight = (await olya.locator('.player-audio .audio-card').boundingBox())!.height;
  await shot(olya, 'p16b-phone-listen-375');
  await expectNoSideScroll(olya, 'p16b-phone-listen-375');

  // 2. Дотик: фрагмент грає на телефоні Олі (справжній <audio> не на паузі), кнопка — «Зупинити»; варіанти на місці.
  await toggle.click();
  await expect.poll(async () => (await phoneSound16b(olya)).playing, POLL).toBe(true);
  expect(await phoneSound16b(olya)).toEqual({ playing: true, state: 'playing', plays: '1' });
  await expect.poll(() => olya.locator('.player-audio audio').evaluate((a) => (a as unknown as { currentTime: number }).currentTime), POLL).toBeGreaterThan(1);
  expect(await toggle.textContent()).toBe('⏹ Зупинити');
  expect(await toggle.getAttribute('aria-pressed')).toBe('true');
  await olya.getByText('🎵 Слухайте', exact).waitFor();
  expect(await answerTops16b(olya, options), 'p16b: «Прослухати» moves the answers').toEqual(before);
  expect((await olya.locator('.player-audio .audio-card').boundingBox())!.height, 'p16b: the audio card changes height').toBe(cardHeight);
  expect(await phoneSound16b(petro), 'a tap plays on that one phone only').toEqual({ playing: false, state: 'idle', plays: '0' });
  await shot(olya, 'p16b-phone-playing-375');
  await expectNoSideScroll(olya, 'p16b-phone-playing-375');

  // 3. Ще дотик — тиша; варіанти й далі на місці.
  await toggle.click();
  await expect.poll(async () => (await phoneSound16b(olya)).playing, POLL).toBe(false);
  expect((await phoneSound16b(olya)).state).toBe('stopped');
  expect(await toggle.textContent()).toBe('🔊 Прослухати');
  expect(await answerTops16b(olya, options), 'p16b: «Зупинити» moves the answers').toEqual(before);
  expect((await olya.locator('.player-audio .audio-card').boundingBox())!.height).toBe(cardHeight);

  // 4. Знову грає, а кінець запитання (усі відповіли — закрито) зупиняє його сам.
  await toggle.click();
  await expect.poll(async () => (await phoneSound16b(olya)).playing, POLL).toBe(true);
  await pickOption(olya, 'Бандура');
  await pickOption(petro, 'Трембіта');
  await host.getByText('Запитання закрите').waitFor();
  await expect.poll(async () => (await phoneSound16b(olya)).playing, POLL).toBe(false);
  await click(host, 'Показати відповідь');

  // 5. Розкриття: «Прослухати ще раз» — над смугою реакцій, без бічної прокрутки.
  const again = olya.getByRole('button', { name: '🔊 Прослухати ще раз', ...exact });
  await again.waitFor();
  await olya.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  const strip = await olya.locator('.reaction-strip').boundingBox();
  const againBox = (await again.boundingBox())!;
  if (strip !== null) expect(againBox.y + againBox.height, 'p16b: «Прослухати ще раз» runs under the reaction strip').toBeLessThanOrEqual(strip.y + 0.5);
  await again.click();
  await expect.poll(async () => (await phoneSound16b(olya)).playing, POLL).toBe(true);
  expect(await olya.locator('.audio-toggle').textContent()).toBe('⏹ Зупинити');
  await shot(olya, 'p16b-phone-reveal-again-375');
  await expectNoSideScroll(olya, 'p16b-phone-reveal-again-375');
  await olya.evaluate('window.scrollTo(0, 0)');

  // 6. Наступне запитання без звуку: картки звуку немає.
  await toNextQuestion(host);
  await afterSplash(...all);
  await olya.getByText('Скрипка має смичок', exact).waitFor();
  expect(await olya.locator('.player-audio').count()).toBe(0);
  expect(problems).toEqual([]);
}

it('part 16b: every phone can listen — with the stage open the 375 phones stay silent and show «🔊 Прослухати»; a tap plays the clip on that phone only, «⏹ Зупинити» stops it, the answers never move; the question end stops it and the reveal offers «Прослухати ще раз» clear of the reaction strip', async () => {
  try {
    await listenOnPhone16b();
  } catch (error) {
    await snapshot();
    throw error;
  }
});
