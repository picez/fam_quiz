import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { achievementScarcity, levelOf, levelProgress, xpForLevel, type AchievementShares } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { type Locator, type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { forgetAchievementShares } from '../src/achievement-shares';
import { game, participant, user, xpEntry } from '../src/db/schema';
import { kyivDay } from '../src/xp-rules';
import { open, click, join, register, myId, POLL, pickOption, step27a, next27a, reveal28a } from './helpers/common';
import { exact, base, db, problems, snapshot, afterSplash, noSplashLayer, ARTIFACTS, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 49 — «Досвід за гру» на екрані фінішу (рядки, новий рівень, причина нуля, запрошення гостю), частка гравців і досвід
 * у досягненнях, карта нагород за 40 рівнів, остання форма у власному й публічному профілі; телефон 360 px, світла тема, зменшений рух.
 * Сценарії йдуть підряд: 3–5 спираються на акаунти й ігри сценарію 1. Потребує pnpm build і Chrome.
 */

useE2eServer();

it('part 49: end of game — the xp card with lines, a new level and what opened, a guest hint, phone 360 px, light theme', async () => {
  try {
    await xpCard49();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 49: a solo game says why there is no xp', async () => {
  try {
    await solo49();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 49: achievements show the share of players and the xp, the showcase caption tells it', async () => {
  try {
    await rarity49();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 49: the level rewards map — 40 levels, the current one highlighted, grey silhouettes ahead', async () => {
  try {
    await map49();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 49: the recent form on the own and public profile', async () => {
  try {
    await form49();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

// ——— Помічники ———

const PASSWORD49 = 'correct horse battery';
const squash49 = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

/** Текст елемента (пробіли стиснуто) за кілька спроб: рядок — точно, вираз — за збігом. */
const text49 = (scope: Locator, wanted: string | RegExp) => {
  const read = expect.poll(async () => squash49(await scope.textContent()), POLL);
  return typeof wanted === 'string' ? read.toBe(wanted) : read.toMatch(wanted);
};
const count49 = (scope: Locator, wanted: number) => expect.poll(() => scope.count(), POLL).toBe(wanted);
const class49 = (scope: Locator, wanted: RegExp, has: boolean) => expect.poll(async () => wanted.test((await scope.getAttribute('class')) ?? ''), POLL).toBe(has);

/** Що сценарії передають одне одному: акаунти, створені сценарієм 1. */
const state49 = { olya: '', taras: '', petro: '', olyaTotal: 0 };

const TITLE49 = 'Родинна вікторина 49';
const SOLO49 = 'Тиха вікторина 49';

type Q49 = { kind: 'single'; text: string; options: [string, string, string, string]; correct: 'a' | 'b' | 'c' | 'd' } | { kind: 'boolean'; text: string; correct: boolean };

/** П'ять запитань, таймери 25–30 с; серед «так / ні» і так, і ні. */
const QUESTIONS49: Q49[] = [
  { kind: 'single', text: 'Яка річка тече через Вінницю?', options: ['Південний Буг', 'Дністер', 'Рось', 'Десна'], correct: 'a' },
  { kind: 'boolean', text: 'Дністер впадає в Азовське море?', correct: false },
  { kind: 'single', text: 'Скільки струн у класичної гітари?', options: ['Чотири', 'П’ять', 'Шість', 'Вісім'], correct: 'c' },
  { kind: 'boolean', text: 'Світязь — найглибше природне озеро України?', correct: true },
  { kind: 'single', text: 'Яке місто називають містом лева?', options: ['Львів', 'Харків', 'Одеса', 'Луцьк'], correct: 'a' },
];

function quizData49(title: string) {
  const common = { imageUrl: null, video: null, points: 1000 };
  const questions = QUESTIONS49.map((q, i) =>
    q.kind === 'boolean'
      ? { ...common, id: `q${i + 1}`, type: 'boolean' as const, text: q.text, correct: q.correct, timeLimit: i % 2 === 0 ? 25 : 30 }
      : { ...common, id: `q${i + 1}`, type: 'single' as const, text: q.text, options: q.options.map((text, at) => ({ id: 'abcd'[at]!, text })), correctId: q.correct, timeLimit: i % 2 === 0 ? 30 : 25 },
  );
  return { ...makeRoundsQuiz([classicRound('r49', questions as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })], { leaderboard: 'end' }), title };
}

/** Відповідь телефона на запитання index: правильна чи хибна. */
async function answer49(page: Page, index: number, right: boolean) {
  const q = QUESTIONS49[index]!;
  if (q.kind === 'boolean') return click(page, right === q.correct ? 'Так' : 'Ні');
  const correctAt = 'abcd'.indexOf(q.correct);
  return pickOption(page, q.options[right ? correctAt : (correctAt + 1) % 4]!);
}

const yesterday49 = () => new Date(Date.now() - 24 * 3600 * 1000);

/** Акаунт: реєстрація, профіль (мітка «ретро» ставиться), досвід учорашнім числом. */
async function account49(page: Page, name: string, email: string, xp = 0): Promise<string> {
  await register(page, 'menu', name, email);
  await page.goto(`${base}/profile/looks`);
  await page.locator('section.level-card').waitFor();
  const id = await myId(page);
  const at = yesterday49();
  if (xp > 0) await db.insert(xpEntry).values({ userId: id, source: 'game', gameId: randomUUID(), amount: xp, counted: false, day: kyivDay(at), at, createdAt: at });
  return id;
}

/** Повторний вхід у новому вікні (cookie лишається в контексті). */
async function signIn49(page: Page, email: string) {
  const response = await page.request.post(`${base}/api/auth/sign-in/email`, { data: { email, password: PASSWORD49 }, headers: { origin: base } });
  expect(response.ok(), await response.text()).toBe(true);
}

/** Зберігає вікторину API, відкриває кімнату з пульта (й сцену, якщо просять); повертає код. */
async function launch49(host: Page, title: string, withStage: boolean) {
  const saved = await host.request.post(`${base}/api/quizzes`, { data: quizData49(title) });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  let stage: Page | null = null;
  if (withStage) {
    const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
    stage = await open(`stage49-${code}`, 1280, 720);
    await stage.goto(stageUrl);
    await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  }
  return { code, stage };
}

/** Від «Почати гру» до «Гру завершено»: phones відповідають за планом plan[телефон][запитання] (true — правильно). */
async function play49(host: Page, stage: Page | null, phones: Page[], plan: boolean[][]) {
  const screens = stage === null ? [host, ...phones] : [host, stage, ...phones];
  await step27a(host, 'Почати гру');
  await afterSplash(...screens);
  await step27a(host, 'Почати раунд');
  await afterSplash(...screens);
  for (const index of QUESTIONS49.keys()) {
    for (const [at, page] of phones.entries()) await answer49(page, index, plan[at]![index]!);
    await reveal28a(host);
    if (index < QUESTIONS49.length - 1) {
      await next27a(host);
      await afterSplash(...screens);
    }
  }
  await step27a(host, 'Далі');
  const finished = host.getByText('Гру завершено').first();
  for (let tries = 0; tries < 6 && !(await finished.waitFor({ timeout: 3000 }).then(() => true, () => false)); tries++) {
    for (const name of ['Наступне запитання', 'Далі', 'Завершити гру']) {
      const button = host.getByRole('button', { name, ...exact });
      if ((await button.count()) > 0 && (await button.isEnabled())) {
        await button.click();
        break;
      }
    }
  }
  await finished.waitFor();
}

/** Кадр екрана (лише з E2E_SHOTS=1): саме вікно телефона, а не вся сторінка. */
async function viewShot49(page: Page, name: string) {
  if (process.env.E2E_SHOTS !== '1') return;
  await noSplashLayer(page);
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`), fullPage: false });
}

/** Усі анімації сторінки доходять кінця (кадр без напівпрозорих елементів). */
const settle49 = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined));

async function noSide49(page: Page, name: string) {
  expect((await page.evaluate('document.documentElement.scrollWidth <= innerWidth')) as boolean, `${name}: horizontal scroll`).toBe(true);
}

/** Тема пристрою: light — quiz:theme = light; dark — ключа немає. */
async function theme49(page: Page, mode: 'light' | 'dark') {
  await page.evaluate((wanted) => (wanted === 'light' ? localStorage.setItem('quiz:theme', 'light') : localStorage.removeItem('quiz:theme')), mode);
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('is-light')), POLL).toBe(mode === 'light');
}

/** Контраст тексту з його справжнім тлом: альфи й прозорість предків змішано (opacity піддерева множить і фон, і текст). */
async function contrast49(scope: Locator): Promise<{ color: string; background: string; ratio: number }> {
  return scope.first().evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (css: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!, a! / 255] as const;
    };
    const chain: Element[] = [];
    for (let node: Element | null = el; node !== null; node = node.parentElement) chain.unshift(node);
    let bg = [255, 255, 255];
    let cumulative = 1;
    for (const node of chain) {
      const style = getComputedStyle(node);
      cumulative *= Number(style.opacity);
      const [r, g, b, a] = rgba(style.backgroundColor);
      const alpha = a * cumulative;
      bg = [r * alpha + bg[0]! * (1 - alpha), g * alpha + bg[1]! * (1 - alpha), b * alpha + bg[2]! * (1 - alpha)];
    }
    const [fr, fg, fb, fa] = rgba(getComputedStyle(el).color);
    const alpha = fa * cumulative;
    const fore = [fr * alpha + bg[0]! * (1 - alpha), fg * alpha + bg[1]! * (1 - alpha), fb * alpha + bg[2]! * (1 - alpha)];
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [hi, lo] = [lum(fore), lum(bg)].sort((x, y) => y - x);
    return { color: getComputedStyle(el).color, background: `rgb(${bg.map(Math.round).join(', ')})`, ratio: (hi! + 0.05) / (lo! + 0.05) };
  });
}

async function expectReadable49(scope: Locator, name: string, min = 4.5) {
  const { color, background, ratio } = await contrast49(scope);
  console.log(`part 49: ${name} — ${color} on ${background}, contrast ${ratio.toFixed(2)}`);
  expect(ratio, `${name}: contrast ${color} on ${background}`).toBeGreaterThanOrEqual(min);
}

/** Сума досвіду акаунта в базі. */
async function totalXp49(userId: string): Promise<number> {
  const rows = await db.select({ amount: xpEntry.amount }).from(xpEntry).where(eq(xpEntry.userId, userId));
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

// ——— 1. Картка досвіду після гри ———

async function xpCard49() {
  const host = await open('host49', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host49@example.com');
  const olya = await open('olya49', 360, 740, { hasTouch: true, isMobile: true });
  const taras = await open('taras49', 360, 740);
  const petro = await open('petro49', 360, 740);
  const ira = await open('ira49', 360, 740);
  // Оля — на 20 досвіду до другого рівня з учорашнього дня: гра підніме її.
  state49.olya = await account49(olya, 'Оля', 'olya49@example.com', xpForLevel(2) - 20);
  state49.taras = await account49(taras, 'Тарас', 'taras49@example.com');
  state49.petro = await account49(petro, 'Петро', 'petro49@example.com');

  const { code, stage } = await launch49(host, TITLE49, true);
  const phones = [olya, taras, petro, ira];
  for (const [page, name] of [[olya, 'Оля'], [taras, 'Тарас'], [petro, 'Петро'], [ira, 'Іра']] as const) await join(page, code, name, false);
  await stage!.getByText('Іра').waitFor();
  await play49(host, stage, phones, [
    [true, true, true, true, true],
    [true, true, false, false, false],
    [true, false, false, false, false],
    [false, false, false, false, false],
  ]);

  // ── Оля: рядки досвіду, підсумок, новий рівень, що відкрилось, посилання на карту. ──
  const card = olya.locator('.xp-moment');
  await card.waitFor({ timeout: 30_000 });
  await card.getByRole('heading', { name: 'Досвід за гру', ...exact }).waitFor();
  const value49 = (line: string) => Number(/([+\-−]\d+)$/.exec(line)![1]!.replace('−', '-'));
  // Рядки гри — прямі рядки картки; два й більше досягнень згорнуті в один рядок «Досягнення (N)» із сумою.
  const lines = (await card.locator(':scope > .xp-moment-lines > li:not(.xp-moment-group)').allTextContents()).map(squash49);
  const group = card.locator('.xp-moment-group');
  let achievementLines = lines.filter((line) => line.startsWith('Досягнення «'));
  let groupValue = 0;
  if ((await group.count()) > 0) {
    const details = group.locator('details');
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open), 'the group is closed at first').toBe(false);
    const summary = squash49(await group.locator('summary').textContent());
    const count = /^Досягнення \((\d+)\)/.exec(summary)?.[1];
    expect(count, `the group summary «${summary}»`).toBeDefined();
    groupValue = value49(summary);
    await group.locator('summary').click();
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open), 'the group opens').toBe(true);
    achievementLines = (await group.locator('details li').allTextContents()).map(squash49);
    expect(achievementLines.length, 'names in the group').toBe(Number(count));
    expect(achievementLines.length).toBeGreaterThanOrEqual(2);
    expect(achievementLines.every((line) => line.startsWith('Досягнення «')), JSON.stringify(achievementLines)).toBe(true);
    expect(achievementLines.reduce((sum, line) => sum + value49(line), 0), 'the group value is the sum of its rows').toBe(groupValue);
    // Знімок — згорнутої картки.
    await group.locator('summary').click();
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open), 'the group closes again').toBe(false);
  }
  console.log(`part 49: Olya's lines — ${JSON.stringify(lines)}, achievements ${JSON.stringify(achievementLines)}`);
  for (const wanted of [/^За участь\s*\+50$/, /^5 правильних відповідей\s*\+50$/, /^За 1-е місце\s*\+100$/]) {
    expect(lines.some((line) => wanted.test(line)), `${wanted} in ${JSON.stringify(lines)}`).toBe(true);
  }
  expect(achievementLines.some((line) => /^Досягнення «Перша гра»\s*\+25$/.test(line)), JSON.stringify(achievementLines)).toBe(true);
  expect(achievementLines.length, 'achievements of the game among the lines').toBeGreaterThanOrEqual(1);
  const gained = lines.reduce((sum, line) => sum + value49(line), 0) + groupValue;
  expect(squash49(await card.locator('.xp-moment-sum').textContent()), 'the sum under the lines').toBe(`+${gained} досвіду`);
  expect(await card.locator('.xp-moment-reason').count(), 'a reason for zero next to a positive game').toBe(0);

  const total = await totalXp49(state49.olya);
  state49.olyaTotal = total;
  const level = levelOf(total);
  expect(level, 'the level after the game').toBeGreaterThanOrEqual(2);
  await text49(card.locator('.xp-moment-levelup h3'), `Новий рівень ${level}!`);
  const unlocked = squash49(await card.locator('.xp-moment-levelup p').textContent());
  expect(unlocked, 'what opened').toMatch(/^Відкрито: .+/);
  expect(await card.getByRole('link', { name: 'Усі нагороди', ...exact }).getAttribute('href')).toBe('/profile/levels');
  const after = levelProgress(total);
  await text49(card.locator('.xp-moment-next'), `Ще ${after.nextAt - after.xp} досвіду до рівня ${level + 1}`);
  // Область оголошень стояла від початку й вимовила «Новий рівень N!».
  await expect.poll(() => olya.locator('.sr-only[role="status"]').first().textContent(), POLL).toBe(`Новий рівень ${level}!`);
  await settle49(olya);
  await card.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await noSide49(olya, 'olya xp card dark');
  await viewShot49(olya, 'xp49-phone-360');

  // ── Тарас і Петро: свої картки (Петро — 3-є місце). ──
  await taras.locator('.xp-moment').waitFor({ timeout: 30_000 });
  await petro.locator('.xp-moment').waitFor({ timeout: 30_000 });
  expect(squash49(await petro.locator('.xp-moment > .xp-moment-lines').textContent()), 'Petro on the third place').toMatch(/За 3-е місце\s*\+30/);
  await noSide49(taras, 'taras xp card');
  await noSide49(petro, 'petro xp card');

  // ── Гість: одне запрошення, без другого в «Нових досягненнях», без картки. ──
  const hint = ira.locator('.xp-moment-guest');
  await hint.waitFor({ timeout: 30_000 });
  expect(squash49(await hint.textContent())).toBe('Увійдіть, щоб отримувати досвід і досягнення. Увійти');
  expect(await hint.getByRole('link', { name: 'Увійти', ...exact }).getAttribute('href')).toContain('/login');
  expect(await ira.locator('.xp-moment').count(), 'a card for a guest').toBe(0);
  expect(await ira.locator('.new-achievements-guest').count(), 'a second sign-in invitation').toBe(0);
  await hint.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await noSide49(ira, 'ira guest');
  await viewShot49(ira, 'xp49-guest-360');

  // ── Сцена й пульт — без картки. ──
  for (const [page, name] of [[stage!, 'stage'], [host, 'host']] as const) {
    expect(await page.locator('.xp-moment, .xp-moment-guest, .xp-moment-pending').count(), `${name}: an xp card`).toBe(0);
    expect(await page.locator('body').innerText(), `${name}: the xp title`).not.toContain('Досвід за гру');
  }

  // ── Світла тема: картка читається (≥ 4,5 : 1), без бокового скролу. ──
  await theme49(olya, 'light');
  await card.waitFor({ timeout: 30_000 });
  await settle49(olya);
  await text49(card.locator('.xp-moment-levelup h3'), `Новий рівень ${level}!`);
  for (const [scope, name] of [
    [card.locator('h2'), 'title'],
    [card.locator('.xp-moment-lines li span').first(), 'a line'],
    [card.locator('.xp-moment-lines li b').first(), 'a line value'],
    [card.locator('.xp-moment-sum'), 'the sum'],
    [card.locator('.xp-moment-levelup h3'), 'new level'],
    [card.locator('.xp-moment-levelup p'), 'what opened'],
    [card.locator('.xp-moment-levelup a'), 'the rewards link'],
    [card.locator('.xp-moment-next'), 'to the next level'],
  ] as const) await expectReadable49(scope, `light ${name}`);
  await card.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await noSide49(olya, 'olya xp card light');
  await viewShot49(olya, 'xp49-light-phone-360');

  // ── Зменшений рух: шкала одразу на кінцевому значенні, «Новий рівень» одразу видно. ──
  await olya.emulateMedia({ reducedMotion: 'reduce' });
  await olya.reload();
  await card.waitFor({ timeout: 30_000 });
  await class49(card, /is-still/, true);
  await class49(card, /is-animated/, false);
  const bar = await card.locator('progress.xp-moment-bar').evaluate((el: HTMLProgressElement) => ({ value: el.value, max: el.max, animation: getComputedStyle(el).animationName }));
  expect(bar).toEqual({ value: after.xp - after.levelAt, max: after.nextAt - after.levelAt, animation: 'none' });
  expect(await card.locator('.xp-moment-levelup').evaluate((el) => getComputedStyle(el).opacity), 'new level text under reduced motion').toBe('1');
  expect(await card.locator('.xp-moment-levelup').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await noSide49(olya, 'olya xp card reduced motion');

  expect(problems).toEqual([]);
}

// ——— 2. Гра наодинці: причина замість мовчання ———

async function solo49() {
  const host = await open('host49s', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host49s@example.com');
  const olya = await open('olya49s', 360, 740, { hasTouch: true, isMobile: true });
  await signIn49(olya, 'olya49@example.com');
  const { code } = await launch49(host, SOLO49, false);
  await join(olya, code, 'Оля', false);
  await play49(host, null, [olya], [[true, true, true, true, true]]);

  const card = olya.locator('.xp-moment');
  await card.waitFor({ timeout: 30_000 });
  await text49(card.locator('.xp-moment-reason'), 'У грі менше 3 гравців з акаунтом (або гра наодинці) — досвіду немає.');
  // Прямі рядки картки й згорнутий рядок досягнень (два й більше) — його сума в підсумку.
  const lines = (await card.locator(':scope > .xp-moment-lines > li:not(.xp-moment-group)').allTextContents()).map(squash49);
  const groups = (await card.locator('.xp-moment-group summary').allTextContents()).map(squash49);
  console.log(`part 49: solo lines — ${JSON.stringify(lines)}, groups ${JSON.stringify(groups)}`);
  // Участі, відповідей і місця немає; якщо щось є — лише досягнення (вони поза правилами гри).
  expect(lines.filter((line) => !line.startsWith('Досягнення «')), 'game lines in a solo game').toEqual([]);
  expect(groups.every((line) => /^Досягнення \(\d+\)/.test(line)), JSON.stringify(groups)).toBe(true);
  const sum = [...lines, ...groups].reduce((total, line) => total + Number(/\+(\d+)$/.exec(line)![1]), 0);
  await text49(card.locator('.xp-moment-sum'), `+${sum} досвіду`);
  await settle49(olya);
  await card.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await noSide49(olya, 'olya solo reason');
  await viewShot49(olya, 'xp49-solo-reason');
  expect(problems).toEqual([]);
}

// ——— 3. Частка гравців і досвід у досягненнях ———

/** n акаунтів-«гравців»: у кожного місце в завершеній грі (база часток). Повторний виклик нічого не дублює. */
async function seedPlayers49(count: number): Promise<string[]> {
  const ids = Array.from({ length: count }, (_, i) => `seed49-${i + 1}`);
  await db
    .insert(user)
    .values(ids.map((id) => ({ id, name: `Гравець ${id.slice(7)}`, email: `${id}@example.com`, emailVerified: true })))
    .onConflictDoNothing();
  return ids;
}

/** Завершена гра зі знімком справжньої: учасники [userId, нік, місце] (бали спадають за місцем). */
async function seedGame49(title: string, startedAt: Date, rows: [string | null, string, number][]): Promise<string> {
  const [real] = await db.select().from(game).where(eq(game.title, TITLE49));
  const id = randomUUID();
  await db.insert(game).values({ ...real!, id, title, code: String(100000 + Math.floor(Math.random() * 800000)), status: 'finished', startedAt, finishedAt: startedAt });
  await db.insert(participant).values(rows.map(([userId, nickname, rank]) => ({ id: randomUUID(), gameId: id, nickname, userId, score: 6000 - rank * 100, totalTimeMs: 40_000, rank })));
  return id;
}

async function rarity49() {
  // Олю бачимо з телефона; 57 «гравців» із місцем у завершеній грі — разом із трьома живими їх 60: 1 з 60 — дуже рідкісне, 3 з 60 — рідкісне.
  const seeded = await seedPlayers49(57);
  await seedGame49('Давня гра 49', yesterday49(), seeded.map((id, at) => [id, `Гравець ${at + 1}`, at + 1]));
  forgetAchievementShares();

  const olya = await open('olya49r', 360, 740, { hasTouch: true, isMobile: true });
  await signIn49(olya, 'olya49@example.com');
  const shares = (await (await olya.request.get(`${base}/api/achievements/shares`)).json()) as AchievementShares;
  console.log(`part 49: shares ${JSON.stringify(shares)}`);
  expect(shares.players, 'players with a finished game').toBeGreaterThanOrEqual(60);
  const holders = shares.holders.first_game ?? 0;
  expect(holders, 'first_game holders').toBeGreaterThanOrEqual(3);
  const { percent, tier } = achievementScarcity(holders, shares.players);

  await olya.goto(`${base}/profile/achievements`);
  const first = olya.locator('.achievement-card', { has: olya.getByRole('heading', { name: 'Перша гра', ...exact }) });
  await first.locator('.achievement-share').waitFor();
  expect(squash49(await first.locator('.achievement-share').textContent())).toContain(`Є в ${percent} % гравців`);
  await text49(first.locator('.achievement-xp'), '+25 досвіду');
  if (tier === 'rare') await text49(first.locator('.achievement-rarity.is-rare'), 'рідкісне');
  // Закрите досягнення: частка є, досвіду й дати немає.
  const locked = olya.locator('.achievement-card.is-locked').first();
  await locked.locator('.achievement-share').waitFor();
  expect(await locked.locator('.achievement-xp').count(), 'xp on a locked card').toBe(0);
  // «Ще ні в кого»: досягнення без власників.
  const nobody = olya.locator('.achievement-card .achievement-share', { hasText: 'Ще ні в кого' });
  expect(await nobody.count(), 'achievements nobody has').toBeGreaterThan(0);

  // Досягнення, яке має лише Оля з 60, — «дуже рідкісне».
  const onlyOlya = Object.entries(shares.holders).find(([id, n]) => n === 1 && id !== 'first_game');
  expect(onlyOlya, `an achievement held by one account: ${JSON.stringify(shares.holders)}`).toBeDefined();
  const veryRare = olya.locator('.achievement-card:not(.is-locked) .achievement-rarity.is-very-rare').first();
  await veryRare.waitFor();
  await text49(veryRare, 'дуже рідкісне');
  await veryRare.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await noSide49(olya, 'olya achievements dark');
  await viewShot49(olya, 'rarity49-own-360');

  // ── Світла тема: пігулки й рядок частки читаються. ──
  await theme49(olya, 'light');
  await veryRare.waitFor();
  await veryRare.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expectReadable49(olya.locator('.achievement-share').first(), 'light share line');
  await expectReadable49(veryRare, 'light very rare pill');
  await expectReadable49(olya.locator('.achievement-rarity.is-rare').first(), 'light rare pill');
  await expectReadable49(olya.locator('.achievement-xp').first(), 'light xp line');
  await noSide49(olya, 'olya achievements light');
  await viewShot49(olya, 'rarity49-light-360');

  // ── Вітрина власного профілю: дотик до рідкісного — підпис з часткою. ──
  await olya.goto(`${base}/profile`);
  const square = olya.locator('.achievement-square.is-very-rare, .achievement-square.is-rare').first();
  await square.waitFor();
  await square.click();
  const caption = olya.locator('.achievement-caption');
  await text49(caption, / · є в \d+ % гравців · (дуже )?рідкісне$/);
  console.log(`part 49: own showcase caption — ${squash49(await caption.textContent())}`);

  // ── Чужий погляд: Тарас на сторінці досягнень і вітрині Олі. ──
  const taras = await open('taras49r', 360, 740);
  await signIn49(taras, 'taras49@example.com');
  await taras.goto(`${base}/profile/${state49.olya}/achievements`);
  await taras.locator('.achievement-card .achievement-share').first().waitFor();
  expect(await taras.locator('.achievement-rarity.is-very-rare').count(), 'very rare on the public page').toBeGreaterThan(0);
  expect(await taras.locator('.achievement-card .achievement-xp').count(), 'xp of an earned card on the public page').toBeGreaterThan(0);
  await noSide49(taras, 'public achievements');
  await taras.goto(`${base}/profile/${state49.olya}`);
  const publicSquare = taras.locator('.achievement-square.is-very-rare, .achievement-square.is-rare').first();
  await publicSquare.waitFor();
  await publicSquare.click();
  await text49(taras.locator('.achievement-caption'), / · є в \d+ % гравців · (дуже )?рідкісне$/);
  await noSide49(taras, 'public showcase');
  expect(problems).toEqual([]);
}

// ——— 4. Карта нагород ———

async function map49() {
  const olya = await open('olya49m', 360, 740, { hasTouch: true, isMobile: true });
  await signIn49(olya, 'olya49@example.com');
  const level = levelOf(await totalXp49(state49.olya));
  await olya.goto(`${base}/profile`);
  await olya.getByRole('link', { name: /Усі нагороди/ }).first().click();
  await olya.waitForURL(/\/profile\/levels$/);
  const rows = olya.locator('ol.level-map > li');
  await count49(rows, 40);
  const current = olya.locator('.level-row.is-current');
  await count49(current, 1);
  expect(squash49(await current.locator('.level-row-head').textContent())).toContain('Ти тут');
  expect(squash49(await current.locator('strong').first().textContent())).toBe(`Рівень ${level}`);
  expect(await current.locator('.level-row-next').count(), 'how much is left').toBe(1);
  expect(await olya.locator('.level-row.is-got').count(), 'received rows').toBe(level - 1);
  expect(await olya.locator('.level-row.is-future').count(), 'future rows').toBe(40 - level);
  // Поточний рядок — у вікні (прокручується до центра), навіть коли рівень високий.
  await expect.poll(() => current.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), POLL).toBe(true);
  // Майбутні: заголовок «Рівень N» без повтору «з рівня N», замок «Ще закрито» для читача з екрана і сірий силует картинки.
  const future = olya.locator('.level-row.is-future').first();
  await future.scrollIntoViewIfNeeded();
  expect(squash49(await future.locator('.level-row-head').textContent())).not.toContain('з рівня');
  expect(await future.getByRole('img', { name: 'Ще закрито', ...exact }).count(), 'the lock of a future row').toBe(1);
  const art = await future.locator('.reward-art').first().evaluate((el) => ({ filter: getComputedStyle(el).filter, opacity: getComputedStyle(el).opacity }));
  console.log(`part 49: a future reward — ${JSON.stringify(art)}`);
  expect(art.filter, 'a grey silhouette').toContain('grayscale(1)');
  expect(Number(art.opacity), 'a faded silhouette').toBeLessThan(1);
  // Темна тема: силует не тоне у тлі (не притемнений, прозорість ≥ 0,6).
  expect(Number(art.opacity), 'a visible silhouette').toBeGreaterThanOrEqual(0.6);
  expect(art.filter, 'not darkened in the dark theme').not.toMatch(/brightness\(0\.\d+\)/);
  // Однакові квадратні рамки картинок, і всередині нічого не обрізано: жоден текст чи елемент не виходить за рамку
  // (кільце рамки фото обертається псевдоелементом — його квадрат ширший за коло, тож scrollWidth тут не мірило).
  const boxes = await olya.locator('.reward-art').evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect();
      const out = [...el.querySelectorAll('*')].filter((child) => {
        const r = child.getBoundingClientRect();
        return r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1);
      });
      const clipped = [...el.querySelectorAll('.nick-name')].some((name) => name.scrollWidth > name.clientWidth + 1);
      return { w: Math.round(box.width), h: Math.round(box.height), over: out.length > 0 || clipped, what: out.map((child) => child.className.toString()).join(' | ') || el.innerHTML.slice(0, 120) };
    }),
  );
  const sizes = [...new Set(boxes.map((b) => `${b.w}x${b.h}`))];
  console.log(`part 49: art boxes — ${JSON.stringify(sizes)}`);
  expect(sizes, 'all art boxes are the same size').toHaveLength(1);
  expect(boxes.filter((b) => b.over), 'art wider than its box').toEqual([]);
  const got = olya.locator('.level-row.is-got .reward-art').first();
  expect(await got.evaluate((el) => getComputedStyle(el).filter), 'a received reward stays in colour').toBe('none');
  await text49(olya.locator('.level-row.is-got .level-row-date').first(), /^Отримано \d{2}\.\d{2}\.\d{4}$/);
  // Кожен з 40 рівнів має нагороду: рядка «Лише досвід» немає.
  await count49(olya.locator('.level-row-none'), 0);
  await count49(olya.locator('.level-row-lock'), 40 - level);
  await noSide49(olya, 'levels map dark');
  await current.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await viewShot49(olya, 'levels49-map-360');
  // Силует сірий, а підписи читаються.
  await expectReadable49(olya.locator('.level-row.is-future strong').first(), 'dark future level name');

  await theme49(olya, 'light');
  await current.waitFor();
  await current.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await expectReadable49(olya.locator('.level-row.is-future strong').first(), 'light future level name');
  await expectReadable49(olya.locator('.level-row.is-future .level-row-rewards span:not(.reward-art)').first(), 'light future reward name');
  await expectReadable49(olya.locator('.level-row-here'), 'light here label');
  await expectReadable49(olya.locator('.level-row-next'), 'light to next');
  await noSide49(olya, 'levels map light');
  await viewShot49(olya, 'levels49-map-light-360');

  // Прокрутка до кінця: сорокова строка без бокового скролу.
  await rows.last().scrollIntoViewIfNeeded();
  await noSide49(olya, 'levels map end');
  expect(problems).toEqual([]);
}

// ——— 5. Остання форма ———

async function form49() {
  const seeded = await seedPlayers49(57);
  // Нова виграна гра (друга поспіль) і давня програна (5-е місце): форма — 🥇 🥇 5; серія — «2 перемоги поспіль» (соло-гра не рахується).
  await seedGame49('Нова гра 49', new Date(), [
    [state49.olya, 'Оля', 1],
    [state49.taras, 'Тарас', 2],
    [seeded[0]!, 'Гравець 1', 3],
    [null, 'Гість', 4],
  ]);
  await seedGame49('Минулого тижня 49', new Date(Date.now() - 3 * 24 * 3600 * 1000), [
    [seeded[1]!, 'Гравець 2', 1],
    [seeded[2]!, 'Гравець 3', 2],
    [seeded[3]!, 'Гравець 4', 3],
    [seeded[4]!, 'Гравець 5', 4],
    [state49.olya, 'Оля', 5],
    [state49.taras, 'Тарас', 6],
  ]);

  // ── Власний профіль 360 px. ──
  const olya = await open('olya49f', 360, 740, { hasTouch: true, isMobile: true });
  await signIn49(olya, 'olya49@example.com');
  await olya.goto(`${base}/profile`);
  const own = olya.locator('.recent-form');
  await own.waitFor();
  await own.getByRole('heading', { name: 'Остання форма', ...exact }).waitFor();
  expect(await own.locator('.recent-form-chip').allTextContents(), 'medals and a number').toEqual(['🥇', '🥇', '5']);
  await text49(own.locator('.recent-form-streak'), '2 перемоги поспіль');
  const chip = own.locator('.recent-form-chip').first();
  expect(await chip.getAttribute('aria-label')).toMatch(/^1-е місце, Нова гра 49, \d{2}\.\d{2}\.\d{4}$/);
  expect((await chip.boundingBox())!.height, 'a chip is too small to tap').toBeGreaterThanOrEqual(32);
  await own.locator('.recent-form-chip').nth(2).click();
  await text49(own.locator('.recent-form-caption'), /^Минулого тижня 49 · \d{2}\.\d{2}\.\d{4}$/);
  await own.locator('.recent-form-chip').nth(1).click();
  await text49(own.locator('.recent-form-caption'), new RegExp(`^${TITLE49} · \\d{2}\\.\\d{2}\\.\\d{4}$`));
  expect(await own.locator('.recent-form-caption').getAttribute('aria-live')).toBe('polite');
  await noSide49(olya, 'own profile form');
  await own.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await viewShot49(olya, 'form49-own-360');

  // ── Публічний профіль Олі з акаунта Тараса, світла тема: місця й дати, без назв ігор. ──
  const taras = await open('taras49f', 360, 740, { hasTouch: true, isMobile: true });
  await taras.addInitScript("localStorage.setItem('quiz:theme', 'light')");
  await signIn49(taras, 'taras49@example.com');
  await taras.goto(`${base}/profile/${state49.olya}`);
  const pub = taras.locator('.recent-form');
  await pub.waitFor();
  await expect.poll(() => taras.evaluate(() => document.documentElement.classList.contains('is-light')), POLL).toBe(true);
  expect(await pub.locator('.recent-form-chip').allTextContents(), 'the public form').toEqual(['🥇', '🥇', '5']);
  await text49(pub.locator('.recent-form-streak'), '2 перемоги поспіль');
  await pub.locator('.recent-form-chip').first().click();
  await text49(pub.locator('.recent-form-caption'), /^\d{2}\.\d{2}\.\d{4}$/);
  const publicText = await pub.innerText();
  expect(publicText, 'a game title on the public form').not.toContain('Нова гра 49');
  expect(await pub.locator('.recent-form-chip').first().getAttribute('aria-label')).toMatch(/^1-е місце, \d{2}\.\d{2}\.\d{4}$/);
  await expectReadable49(pub.locator('h2'), 'light form title');
  await expectReadable49(pub.locator('.recent-form-caption'), 'light form caption');
  await expectReadable49(pub.locator('.recent-form-streak'), 'light form streak');
  await expectReadable49(pub.locator('.recent-form-chip').nth(2), 'light form number chip');
  await noSide49(taras, 'public profile form light');
  await pub.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await viewShot49(taras, 'form49-public-light-360');
  expect(problems).toEqual([]);
}

