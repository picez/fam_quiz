import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import type { AchievementsPage } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { click, expectNoSideScroll, expectStageFits, expectStageInView, join, moreLess28a, morelessRun28a, open, register, type Pair28a } from './helpers/common';
import { afterSplash, ARTIFACTS, base, exact, problems, shot, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізний тест плану 33: досягнення за типи запитань і раунди — «Не монетка», «Класика жанру», «Чуття на числа»
 * й антидосягнення «Дзеркальна логіка». Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

/** Шість «Так / ні»: правильні навпіл «так» і «ні». */
const BOOLEANS33: [string, boolean][] = [
  ['Світязь — найглибше природне озеро України?', true],
  ['Дністер впадає в Азовське море?', false],
  ['Карпатський біосферний заповідник внесено до списку ЮНЕСКО?', true],
  ['Хокейна шайба важить понад кілограм?', false],
  ['Дніпро — найдовша річка, що тече Україною?', true],
  ['Футбольний матч триває 120 хвилин без додаткового часу?', false],
];

/** П'ять порівнянь «Більше чи менше» (природа, Україна, спорт). */
const PAIRS33: Pair28a[] = [
  ['Що вище?', 'Говерла', '2061 м', 'Петрос', '2020 м', 'a', 100],
  ['Що довше?', 'Дністер', '1362 км', 'Десна', '1130 км', 'a', 100],
  ['Чого більше?', 'Гравців у футбольній команді на полі', '11', 'Гравців у баскетбольній команді на полі', '5', 'a', 100],
  ['Що глибше?', 'Синевир', '22 м', 'Світязь', '58 м', 'b', 100],
  ['Що важче?', 'Тенісний м’яч', '58 г', 'Баскетбольний м’яч', '620 г', 'b', 100],
];

const RIGHT33 = PAIRS33.map((pair) => pair[5]);
const BACKWARDS33 = RIGHT33.map((side) => (side === 'a' ? 'b' : 'a'));

function questions33() {
  const common = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
  return [
    ...BOOLEANS33.map(([text, correct], i) => ({ ...common, id: `b${i + 1}`, type: 'boolean' as const, text, correct })),
    moreLess28a('m1', 'Більше чи менше', PAIRS33, 60),
  ];
}

/** Картка досягнення з назвою name на сторінці досягнень; заголовок закритої ще й має «, ще не отримано». */
const achievementCard = (page: Page, name: string) =>
  page.locator('.achievement-card', { has: page.getByRole('heading', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*, ще не отримано)?$`) }) });

async function typeAchievements33() {
  const host = await open('host33', 1280, 800);
  await register(host, 'host', 'Ліна Ведуча', 'host33@example.com');
  const data = {
    ...makeRoundsQuiz([classicRound('r1', questions33() as never, { title: 'Природа й спорт', speedBonus: false, shuffleOptions: false })], { leaderboard: 'each' }),
    title: 'Досягнення 33',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  const olya = await open('olya33', 375, 812);
  await register(olya, 'menu', 'Оля Квіткова', 'olya33@example.com');
  const petro = await open('petro33', 375, 812);
  await register(petro, 'menu', 'Петро Гай', 'petro33@example.com');
  const petroId = ((await (await petro.request.get(`${base}/api/me/profile`)).json()) as { id: string }).id;
  const ira = await open('ira33', 375, 812);
  const stage = await open('stage33', 1280, 720);
  const phones = [olya, petro, ira];
  const all = [host, stage, ...phones];

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Досягнення 33' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  await stage.goto((await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  for (const nickname of ['Оля', 'Петро', 'Іра']) await host.getByText(nickname, exact).first().waitFor();

  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  const closeAndShow = async () => {
    const close = host.getByRole('button', { name: 'Закрити запитання', ...exact });
    if (await close.isVisible()) await close.click();
    await host.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
  };

  // ── 1. Шість «Так / ні»: Оля — усі правильно, Петро — теж (його досягнення — у «Більше чи менше»), Іра навпереміну. ──
  await step('Почати гру');
  await afterSplash(...all);
  await step('Почати раунд');
  await afterSplash(...all);
  for (const [index, [, correct]] of BOOLEANS33.entries()) {
    if (index > 0) {
      await step('Наступне запитання');
      await afterSplash(...all);
    }
    const yes = correct ? 'Так' : 'Ні';
    const no = correct ? 'Ні' : 'Так';
    await click(olya, yes);
    await click(petro, index % 3 === 0 ? no : yes);
    await click(ira, index % 2 === 0 ? yes : no);
    await closeAndShow();
    await step('Далі');
    await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();
  }

  // ── 2. «Більше чи менше» з п'яти порівнянь: Оля — усе правильно, Петро — усе навпаки, Іра — як вийде. ──
  await step('Наступне запитання');
  await afterSplash(...all);
  for (const page of phones) await page.locator('button.moreless-option').first().waitFor();
  await morelessRun28a(olya, PAIRS33, RIGHT33);
  await morelessRun28a(petro, PAIRS33, BACKWARDS33);
  await morelessRun28a(ira, PAIRS33, ['a', 'b', 'a', 'a', 'b']);
  await closeAndShow();
  const finished = host.getByText('Гру завершено').first();
  for (let i = 0; i < 6 && !(await finished.isVisible()); i++) {
    await step('Далі').catch(() => undefined);
    await afterSplash(...all);
  }
  await finished.waitFor();

  // ── 3. Телефон Олі: «Не монетка», «Класика жанру», «Чуття на числа». ──
  const olyaBlock = olya.locator('section.new-achievements');
  await olyaBlock.waitFor({ timeout: 20_000 });
  expect(await olyaBlock.locator('h2').textContent()).toBe('Нові досягнення!');
  for (const name of ['Не монетка', 'Класика жанру', 'Чуття на числа']) {
    const card = olyaBlock.locator('li.new-achievement', { hasText: name });
    await card.waitFor();
    expect(await card.getAttribute('class'), name).not.toContain('is-anti');
  }
  await olyaBlock.locator('li.new-achievement', { hasText: 'Так чи ні — і щоразу в яблучко. Монетка так не вміє.' }).waitFor();
  expect(await olyaBlock.locator('li.new-achievement', { hasText: 'Дзеркальна логіка' }).count()).toBe(0);
  await olyaBlock.scrollIntoViewIfNeeded();
  await expectNoSideScroll(olya, 'p33-phone-olya-new');
  const cardsFit = (await olya.evaluate(
    `[...document.querySelectorAll('li.new-achievement')].every((card) => { const r = card.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })`,
  )) as boolean;
  expect(cardsFit, 'new achievement cards inside 375 px').toBe(true);
  // Картки з'являються по черзі (0,6 с кожна): кадр — коли проявилася остання.
  const lastCard = olyaBlock.locator('li.new-achievement').last();
  await lastCard.evaluate((card) => Promise.all(card.getAnimations().map((animation) => animation.finished)));
  await lastCard.scrollIntoViewIfNeeded();
  await shot(olya, 'p33-phone-olya-new');

  // ── 4. Телефон Петра: «Дзеркальна логіка» з «Ну… теж досягнення» в червонуватій рамці. ──
  const petroBlock = petro.locator('section.new-achievements');
  await petroBlock.waitFor({ timeout: 20_000 });
  const mirror = petroBlock.locator('li.new-achievement', { hasText: 'Дзеркальна логіка' });
  await mirror.waitFor();
  expect(await mirror.getAttribute('class')).toContain('is-anti');
  await mirror.getByText('Ну… теж досягнення', exact).waitFor();
  await mirror.getByText('Усе навпаки. Наступного разу просто тисни протилежне.', exact).waitFor();
  await petroBlock.scrollIntoViewIfNeeded();
  await expectNoSideScroll(petro, 'p33-phone-petro-new');
  await shot(petro, 'p33-phone-petro-new');

  // ── 5. Телефон гостя Іри: запрошення увійти. ──
  const guest = ira.locator('.new-achievements-guest');
  await guest.waitFor();
  expect(await guest.textContent()).toContain('Увійди, щоб збирати досягнення');
  expect(await ira.locator('li.new-achievement').count()).toBe(0);
  await guest.scrollIntoViewIfNeeded();
  await expectNoSideScroll(ira, 'p33-phone-guest');

  // ── 6. Сцена 1280 × 720: останній слайд нагород «Нові досягнення» з рядком Олі. ──
  const slide = stage.locator('.stage-board.is-new-achievements');
  const next = host.getByRole('button', { name: /^(Нагороди на сцені|Наступна нагорода)$/ });
  for (let i = 0; i < 12 && !(await slide.isVisible()); i++) {
    await next.click();
    await stage.waitForTimeout(400);
  }
  await slide.waitFor();
  await slide.getByRole('heading', { name: 'Нові досягнення', ...exact }).waitFor();
  const meta = (await slide.locator('.meta').textContent())!;
  const [, n, total] = meta.match(/^Нагороди гри · (\d+) з (\d+)$/) ?? [];
  expect(n, meta).toBe(total);
  await slide.locator('.stage-new-achievements-row', { hasText: 'Оля' }).waitFor();
  expect(await slide.locator('.stage-new-achievements-row', { hasText: 'Іра' }).count()).toBe(0);
  await expectStageFits(stage, 'p33-stage-new');
  await expectStageInView(stage, 'p33-stage-new');
  await shot(stage, 'p33-stage-new');

  // ── 7. Своя сторінка досягнень Олі: 102 у каталозі, нові — у «Влучності», сірі неотримані анти — в «Антидосягненнях». ──
  await olya.goto(`${base}/profile/achievements`);
  const count = (await olya.locator('.achievements-count').textContent({ timeout: 15_000 }))!;
  expect(count).toMatch(/^Отримано \d+ з 102$/);
  const accuracy = olya.locator('section.achievement-group', { has: olya.getByRole('heading', { level: 2, name: 'Влучність' }) });
  for (const name of ['Не монетка', 'Класика жанру', 'Чуття на числа']) {
    const card = achievementCard(olya, name);
    expect(await card.getAttribute('class'), name).toBe('achievement-card');
    expect(await accuracy.locator('.achievement-card', { has: olya.getByRole('heading', { name }) }).count(), `${name} in «Влучність»`).toBe(1);
  }
  const antiGroup = olya.locator('section.achievement-group', { has: olya.getByRole('heading', { level: 2, name: 'Антидосягнення' }) });
  for (const name of ['Дзеркальна логіка', 'Сучасне мистецтво', 'Останній шматочок']) {
    expect(await antiGroup.locator('.achievement-card', { has: olya.getByRole('heading', { name: new RegExp(`^${name}`) }) }).getAttribute('class'), name).toBe('achievement-card is-locked is-anti');
  }
  expect(await olya.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
  await achievementCard(olya, 'Не монетка').evaluate((card) => card.scrollIntoView({ block: 'start' }));
  if (process.env.E2E_SHOTS === '1') await olya.screenshot({ path: resolve(ARTIFACTS, 'shots', 'p33-page-accuracy.png') });
  await achievementCard(olya, 'Дзеркальна логіка').evaluate((card) => card.scrollIntoView({ block: 'start' }));
  if (process.env.E2E_SHOTS === '1') await olya.screenshot({ path: resolve(ARTIFACTS, 'shots', 'p33-page-anti.png') });

  // ── 8. Петро ховає антидосягнення: його публічна сторінка — «з 83» і без «Дзеркальної логіки». ──
  await petro.goto(`${base}/profile/achievements`);
  await achievementCard(petro, 'Дзеркальна логіка').waitFor({ timeout: 15_000 });
  const petroAnti = petro.locator('section.achievement-group', { has: petro.getByRole('heading', { level: 2, name: 'Антидосягнення' }) });
  const toggle = petroAnti.getByRole('checkbox', { name: 'Ховати антидосягнення від інших' });
  await toggle.check();
  await petroAnti.getByRole('status').getByText('Збережено', exact).waitFor();
  await olya.goto(`${base}/profile/${petroId}/achievements`);
  const olyaCount = olya.locator('.achievements-count');
  await olyaCount.waitFor();
  expect(await olyaCount.textContent()).toMatch(/^Отримано \d+ з 83$/);
  expect(await achievementCard(olya, 'Дзеркальна логіка').count()).toBe(0);
  const publicPage = (await (await olya.request.get(`${base}/api/profiles/${petroId}/achievements`)).json()) as AchievementsPage;
  expect(publicPage.total).toBe(83);
  expect(publicPage.items.map((item) => item.id)).not.toContain('mirror_logic');
  await expectNoSideScroll(olya, 'p33-public-hidden');

  expect(problems).toEqual([]);
}

it('part 33: Оля answers six true/false questions and a five-step more-or-less without a miss and her 375 phone shows «Не монетка», «Класика жанру» and «Чуття на числа», Петро gets every comparison backwards and sees «Дзеркальна логіка» with «Ну… теж досягнення», the guest Іра is asked to sign in, the 1280 × 720 stage ends with «Нові досягнення», and the achievements page counts 102 (83 with anti hidden)', async () => {
  try {
    await typeAchievements33();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);
