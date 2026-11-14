import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import type { AchievementsPage, PublicProfile } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { expectNoSideScroll, expectStageFits, expectStageInView, join, open, pickOption, register, takeBuff } from './helpers/common';
import { afterSplash, ARTIFACTS, base, exact, problems, shot, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізний тест частини 12j: антидосягнення, «Нове досягнення!» на телефоні й сцені, перемикач «Ховати антидосягнення від інших».
 * Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

function antiQuestions12j() {
  const common = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  return [
    { ...common, id: 'j1', type: 'single' as const, text: 'Яка річка тече через Київ?', options: options('Дніпро', 'Дністер', 'Десна', 'Південний Буг'), correctId: 'a' },
    { ...common, id: 'j2', type: 'single' as const, text: 'Яке місто — столиця Буковини?', options: options('Ужгород', 'Чернівці', 'Луцьк', 'Рівне'), correctId: 'b' },
    { ...common, id: 'j3', type: 'single' as const, text: 'Яка гора найвища в Україні?', options: options('Петрос', 'Піп Іван', 'Говерла', 'Бребенескул'), correctId: 'c' },
    { ...common, id: 'j4', type: 'single' as const, text: 'Хто написав «Лісову пісню»?', options: options('Ольга Кобилянська', 'Марко Вовчок', 'Ліна Костенко', 'Леся Українка'), correctId: 'd' },
    { ...common, id: 'j5', type: 'single' as const, text: 'Яке море омиває Одесу?', options: options('Чорне', 'Азовське', 'Балтійське', 'Середземне'), correctId: 'a' },
  ];
}

/** Правильна й хибна відповідь кожного запитання (тексти варіантів). */
const ANSWERS: [string, string][] = [
  ['Дніпро', 'Дністер'],
  ['Чернівці', 'Ужгород'],
  ['Говерла', 'Петрос'],
  ['Леся Українка', 'Марко Вовчок'],
  ['Чорне', 'Азовське'],
];

/** Підміняє рядки слайда «Нові досягнення» на 8 «важких»: довгі ніки, три найдовші назви значків (одна — анти) і «+4». */
const HEAVY_SLIDE = `(() => {
  const list = document.querySelector('.stage-new-achievements');
  list.classList.add('is-many');
  const names = ['Парасолька в сонячний день', 'Хтось мусить бути останнім', 'Ризик — справа шляхетна'];
  list.innerHTML = Array.from({ length: 8 }, (_, i) =>
    '<li class="stage-new-achievements-row"><span class="stage-new-achievements-name">Олександра-Марія ' + (i + 1) + '</span>' +
    names.map((name, k) => '<span class="stage-new-achievement' + (k === 0 ? ' is-anti' : '') + '"><span aria-hidden="true">🏅</span> <span class="stage-new-achievement-name">' + name + '</span></span>').join('') +
    '<span class="stage-new-achievements-more">+4</span></li>').join('');
})()`;

/** Картка досягнення з назвою name на сторінці досягнень; заголовок закритої ще й має «, ще не отримано». */
const achievementCard = (page: Page, name: string) =>
  page.locator('.achievement-card', { has: page.getByRole('heading', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*, ще не отримано)?$`) }) });

/** Помилка коштує балів: інакше «Щит» не потрібен і його не взяти. */
const MINUS = { penalty: 'minus' as const, partial: null, streak: null, multiplier: 1 as const };

async function anti12j() {
  const host = await open('host12j', 1280, 800);
  await register(host, 'host', 'Ліна Ведуча', 'host12j@example.com');
  const data = {
    ...makeRoundsQuiz([classicRound('r1', antiQuestions12j() as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false, rules: MINUS })], { leaderboard: 'each', buffs: ['risk', 'shield'] }),
    title: 'Антидосягнення 12j',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  const olya = await open('olya12j', 375, 812);
  await register(olya, 'menu', 'Оля Квіткова', 'olya12j@example.com');
  const petro = await open('petro12j', 375, 812);
  await register(petro, 'menu', 'Петро Гай', 'petro12j@example.com');
  const petroId = ((await (await petro.request.get(`${base}/api/me/profile`)).json()) as { id: string }).id;
  const ira = await open('ira12j', 375, 812);
  const stage = await open('stage12j', 1280, 720);
  const phones = [olya, petro, ira];
  const all = [host, stage, ...phones];

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Антидосягнення 12j' }).getByRole('button', { name: 'Грати', ...exact }).click();
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

  // ── 1. Гра: Петро бере «Ризик» і помиляється, Оля — «Щит» і влучає; далі Петро мимо, Іра навпереміну. ──
  await step('Почати гру');
  await afterSplash(...all);
  await step('Почати раунд');
  await afterSplash(...all);
  for (const [index, [right, wrong]] of ANSWERS.entries()) {
    if (index > 0) {
      await step('Наступне запитання');
      await afterSplash(...all);
    }
    if (index === 0) {
      await takeBuff(petro, 'Ризик');
      await takeBuff(olya, 'Щит');
    }
    await pickOption(olya, right);
    await pickOption(petro, wrong);
    await pickOption(ira, index % 2 === 0 ? right : wrong);
    await host.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
    if (index < ANSWERS.length - 1) {
      await step('Далі');
      await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();
    }
  }
  const finished = host.getByText('Гру завершено').first();
  for (let i = 0; i < 6 && !(await finished.isVisible()); i++) {
    await step('Далі').catch(() => undefined);
    await afterSplash(...all);
  }
  await finished.waitFor();

  // ── 2. Телефон Петра: «У мінусі» з «Ну… теж досягнення». ──
  const petroBlock = petro.locator('section.new-achievements');
  await petroBlock.waitFor({ timeout: 20_000 });
  expect(await petroBlock.locator('h2').textContent()).toMatch(/^Нов(е|і) досягнення!$/);
  const debt = petroBlock.locator('li.new-achievement', { hasText: 'У мінусі' });
  await debt.waitFor();
  expect(await debt.getAttribute('class')).toContain('is-anti');
  await debt.getByText('Борг — теж досягнення. Банк уже дзвонить.', exact).waitFor();
  await debt.getByText('Ну… теж досягнення', exact).waitFor();
  expect(await petroBlock.getByRole('link', { name: 'Усі досягнення', ...exact }).getAttribute('href')).toBe('/profile/achievements');
  await petroBlock.scrollIntoViewIfNeeded();
  await expectNoSideScroll(petro, 'p12j-phone-petro-new');

  // ── 3. Телефон Олі: «Парасолька в сонячний день» і звичайні — вище анти. ──
  const olyaBlock = olya.locator('section.new-achievements');
  await olyaBlock.waitFor({ timeout: 20_000 });
  const umbrella = olyaBlock.locator('li.new-achievement', { hasText: 'Парасолька в сонячний день' });
  await umbrella.waitFor();
  expect(await umbrella.getAttribute('class')).toContain('is-anti');
  await umbrella.getByText('Ну… теж досягнення', exact).waitFor();
  const classes = await olyaBlock.locator('li.new-achievement').evaluateAll((items) => items.map((item) => item.classList.contains('is-anti')));
  expect(classes[0], 'a common achievement first').toBe(false);
  expect(classes.indexOf(true)).toBeGreaterThan(classes.lastIndexOf(false));
  await olyaBlock.locator('li.new-achievement', { hasText: 'Перша гра' }).waitFor();
  await olyaBlock.scrollIntoViewIfNeeded();
  await expectNoSideScroll(olya, 'p12j-phone-olya-new');

  // ── 4. Телефон гостя Іри: запрошення увійти, без карток. ──
  const guest = ira.locator('.new-achievements-guest');
  await guest.waitFor();
  expect(await guest.textContent()).toContain('Увійди, щоб збирати досягнення');
  expect(await guest.getByRole('link', { name: 'Увійти', ...exact }).getAttribute('href')).toBe(`/login?next=${encodeURIComponent('/profile/achievements')}`);
  expect(await ira.locator('li.new-achievement').count()).toBe(0);
  await guest.scrollIntoViewIfNeeded();
  await expectNoSideScroll(ira, 'p12j-phone-guest');

  // ── 5. Сцена: ведуча гортає «Нагороди на сцені» до слайда «Нові досягнення» — останнього. ──
  const slide = stage.locator('.stage-board.is-new-achievements');
  // Перший дотик — «Нагороди на сцені», далі — «Наступна нагорода».
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
  const petroRow = slide.locator('.stage-new-achievements-row', { hasText: 'Петро' });
  expect(await petroRow.textContent()).toContain('🕳️ У мінусі');
  await slide.locator('.stage-new-achievements-row', { hasText: 'Оля' }).waitFor();
  expect(await slide.locator('.stage-new-achievements-row', { hasText: 'Іра' }).count()).toBe(0);
  await expectStageFits(stage, 'p12j-stage-new');
  await expectStageInView(stage, 'p12j-stage-new');
  await shot(stage, 'p12j-stage-new');

  // Важкий випадок (перевірка верстки справжніми стилями): 8 людей з довгими ніками, по 3 найдовші назви й «+N».
  await stage.evaluate(HEAVY_SLIDE);
  expect(await slide.locator('.stage-new-achievements-row').count()).toBe(8);
  const overflow = (await stage.evaluate(`[...document.querySelectorAll('.stage-new-achievements-row')].some((row) => row.scrollWidth > row.clientWidth + 1 && getComputedStyle(row).overflow !== 'visible')`)) as boolean;
  expect(overflow).toBe(false);
  await expectStageFits(stage, 'p12j-stage-heavy');
  await expectStageInView(stage, 'p12j-stage-heavy');
  await shot(stage, 'p12j-stage-heavy');

  // ── 6. Сторінка досягнень Петра: група «Антидосягнення» остання, «У мінусі» отримано в червонуватій рамці. ──
  await petro.goto(`${base}/profile/achievements`);
  const count = (await petro.locator('.achievements-count').textContent({ timeout: 15_000 }))!;
  expect(count).toMatch(/^Отримано \d+ з 71$/);
  const groups = await petro.locator('section.achievement-group h2').allTextContents();
  expect(groups.at(-1)).toBe('Антидосягнення');
  const debtCard = achievementCard(petro, 'У мінусі');
  expect(await debtCard.getAttribute('class')).toBe('achievement-card is-anti');
  expect(await debtCard.locator('.achievement-date').textContent()).toMatch(/^Отримано \d/);
  expect(await achievementCard(petro, 'Нуль без палички').getAttribute('class')).toBe('achievement-card is-locked is-anti');
  const antiGroup = petro.locator('section.achievement-group', { has: petro.getByRole('heading', { level: 2, name: 'Антидосягнення' }) });
  await antiGroup.evaluate((section) => section.scrollIntoView({ block: 'start' }));
  expect(await petro.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
  if (process.env.E2E_SHOTS === '1') await petro.screenshot({ path: resolve(ARTIFACTS, 'shots', 'p12j-page-anti.png') });

  // ── 7. Приватність: Оля бачить антидосягнення Петра, доки він їх не сховає. ──
  await olya.goto(`${base}/profile/${petroId}/achievements`);
  await achievementCard(olya, 'У мінусі').waitFor();
  await olya.getByRole('heading', { level: 2, name: 'Антидосягнення' }).waitFor();
  const toggle = antiGroup.getByRole('checkbox', { name: 'Ховати антидосягнення від інших' });
  expect(await toggle.isChecked()).toBe(false);
  await toggle.check();
  await antiGroup.getByRole('status').getByText('Збережено', exact).waitFor();
  await olya.reload();
  const olyaCount = olya.locator('.achievements-count');
  await olyaCount.waitFor();
  expect(await olyaCount.textContent()).toMatch(/^Отримано \d+ з 55$/);
  expect(await olya.getByRole('heading', { level: 2, name: 'Антидосягнення' }).count()).toBe(0);
  expect(await achievementCard(olya, 'У мінусі').count()).toBe(0);
  const publicProfile = (await (await olya.request.get(`${base}/api/profiles/${petroId}`)).json()) as PublicProfile;
  expect(publicProfile.achievements.map((a) => a.id)).not.toContain('in_debt');
  const publicPage = (await (await olya.request.get(`${base}/api/profiles/${petroId}/achievements`)).json()) as AchievementsPage;
  expect(publicPage.total).toBe(55);
  await expectNoSideScroll(olya, 'p12j-public-hidden');

  // ── 8. Профіль: свій у Петра й публічний очима Олі — без бічного скролу. ──
  await petro.goto(`${base}/profile`);
  await petro.locator('nav.profile-tiles').waitFor();
  await petro.locator('.achievement-showcase').waitFor();
  await expectNoSideScroll(petro, 'p12j-profile');
  await olya.goto(`${base}/profile/${petroId}`);
  await olya.locator('.achievement-showcase').waitFor();
  await expectNoSideScroll(olya, 'p12j-public-profile');

  expect(problems).toEqual([]);
}

it('part 12j: anti-achievements — Петро risks and ends in debt, his 375 phone shows «У мінусі» with «Ну… теж досягнення», Оля gets the umbrella under her common ones, the guest Іра is asked to sign in, the 1280 × 720 stage ends the awards with «Нові досягнення», the anti group sits last on the achievements page, and once Петро hides it Оля sees «з 55» and no anti-achievements on his public page and profile', async () => {
  try {
    await anti12j();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);
