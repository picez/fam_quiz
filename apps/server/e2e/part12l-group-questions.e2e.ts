import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { expectNoSideScroll, field, join, myId, open, pickOption, questionText, register, scoreOf, toNextQuestion } from './helpers/common';
import { afterSplash, avatarPng, base, exact, problems, shot, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізний тест частини 12l: запитання вікторини із записів групи — панель «Із групи» в редакторі 1280 і на телефоні
 * 375 / 320, неактивні шаблони з поясненням, чесна «Вигадка», «використано у «…»», гра, клітинка поля,
 * «Вікторина з групи» і «📜 Літописець». Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

const GROUP = 'Родина Квіткових';
const STORY = 'Як тато заблукав у лісі по гриби й вийшов до сусіднього села. Шукали всім селом. Знайшовся з повним кошиком.';
const GRANDMA = 'Бабуся Ніна свистить двома пальцями голосніше за всіх';
const TRIP = 'Перша поїздка на море всією родиною у 2004 році';
const CAKE = 'Оля колись спекла торт без борошна — і всі попросили добавки';
const QUIZ = 'Родинна розминка';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Запитання з групи' });
const record = (page: Page, text: string) => dialog(page).locator('button.group-picker-item', { hasText: text });
const template = (page: Page, name: string) => dialog(page).locator('button.group-template', { has: page.getByText(name, exact) });
const insert = (page: Page) => dialog(page).getByRole('button', { name: 'Вставити запитання', ...exact });
const draftOf = async (page: Page) =>
  JSON.parse((await page.evaluate("sessionStorage.getItem('quiz:draft:new')")) as string) as {
    title: string;
    rounds: { type: string; title: string; questions: { type: string; text: string; timeLimit: number; correct?: boolean; choiceTime?: number }[] }[];
  };

/** Сьогоднішня дата так, як її пише сторінка ачівок: «14 листопада 2026», за Києвом. */
const todayOn = async (page: Page) =>
  ((await page.evaluate(
    `new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv' }).format(new Date())`,
  )) as string).replace(/\s*р\.$/, '');

async function groupQuestions12l() {
  // ── 1. Люди й група через API (інтерфейс груп перевірив 12k). ──
  const olya = await open('olya12l', 1280, 800);
  await register(olya, 'menu', 'Оля Квіткова', 'olya12l@example.com');
  const petro = await open('petro12l', 375, 812);
  await register(petro, 'menu', 'Петро Гай', 'petro12l@example.com');
  const olyaId = await myId(olya);
  const created = await olya.request.post(`${base}/api/groups`, { data: { name: GROUP, emoji: '🌻', description: '' } });
  expect(created.status(), await created.text()).toBe(201);
  const { id: groupId, inviteCode } = (await created.json()) as { id: string; inviteCode: string };
  expect((await petro.request.post(`${base}/api/groups/join/${inviteCode}`)).status()).toBe(200);
  const write = async (page: Page, data: object) => {
    const answer = await page.request.post(`${base}/api/groups/${groupId}/items`, {
      data: { kind: 'fact', about: [], answer: null, year: null, photo: null, surprise: false, ...data },
    });
    expect(answer.status(), await answer.text()).toBe(201);
  };
  // Фото історії стає картинкою запитання; над ним — нагадування перевірити, чи фото не підказує.
  const uploaded = await olya.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } });
  const photo = ((await uploaded.json()) as { url: string }).url;
  await write(olya, { kind: 'story', text: STORY, about: [{ kind: 'name', name: 'тато' }], answer: 'Тато', year: 1998, photo });
  await write(olya, { text: GRANDMA, about: [{ kind: 'name', name: 'бабуся Ніна' }] });
  await write(petro, { kind: 'date', text: TRIP, answer: 'Затока', year: 2004 });
  await write(petro, { text: CAKE, about: [{ kind: 'member', userId: olyaId }], surprise: true });

  // ── 2. Редактор 1280: «Із групи» відкриває записи єдиної групи; сюрпризу про Олю немає. ──
  await olya.goto(`${base}/quizzes/new`);
  await field(olya, 'Назва вікторини').fill(QUIZ);
  await olya.getByRole('button', { name: 'Із групи', ...exact }).click();
  await record(olya, 'Як тато заблукав').waitFor();
  await record(olya, GRANDMA).waitFor();
  await record(olya, TRIP).waitFor();
  expect(await dialog(olya).innerText()).not.toContain('торт без борошна');
  await shot(olya, 'p12l-picker-items-1280');

  // ── 3. Неактивні шаблони пояснюють чому. ──
  await record(olya, GRANDMA).click();
  await template(olya, 'Коли це було?').getByText('Потрібен рік', exact).waitFor();
  expect(await template(olya, 'Коли це було?').isDisabled()).toBe(true);
  expect(await template(olya, 'Відкрите запитання').isDisabled()).toBe(true);
  await template(olya, 'Відкрите запитання').getByText('Потрібна коротка відповідь', exact).waitFor();
  expect(await template(olya, 'Хто це?').isDisabled()).toBe(false);
  await shot(olya, 'p12l-picker-disabled');
  await dialog(olya).getByRole('button', { name: '‹ Назад', ...exact }).click();

  // ── 4. «Хто це?» з історії про тата. ──
  await record(olya, 'Як тато заблукав').click();
  await template(olya, 'Хто це?').click();
  const preview = dialog(olya).getByRole('region', { name: 'Як вийде', ...exact });
  await preview.getByText(/^Хто це\? Як ___ заблукав/).waitFor();
  expect(await preview.locator('li').allTextContents()).toContain('тато ✓');
  await insert(olya).click();
  await dialog(olya).waitFor({ state: 'detached' });
  await expect.poll(() => olya.locator('.question-list li').count()).toBe(2);
  expect(await questionText(olya).inputValue()).toMatch(/^Хто це\? Як ___ заблукав/);
  const notes = olya.getByRole('note', { name: 'Із запису групи' });
  await notes.getByText('Перевір, чи фото не підказує відповідь.', exact).waitFor();
  await shot(olya, 'p12l-editor-who-1280');
  // Порожнє перше запитання нової вікторини — прибираємо.
  await olya.locator('.question-list li').first().getByRole('button').first().click();
  await olya.getByRole('button', { name: 'Видалити запитання 1', ...exact }).click();
  await expect.poll(() => olya.locator('.question-list li').count()).toBe(1);

  // ── 5. «Правда чи вигадка?»: типово «Вигадка» з підміною; без зміни «ні» не вставляється. ──
  await olya.getByRole('button', { name: 'Із групи', ...exact }).click();
  await record(olya, TRIP).click();
  await template(olya, 'Правда чи вигадка?').click();
  await dialog(olya).getByText('У раунді: «так» — 0, «ні» — 0', exact).waitFor();
  expect(await dialog(olya).getByRole('radio', { name: 'Вигадка', ...exact }).getAttribute('aria-checked')).toBe('true');
  await dialog(olya).getByText(/^Підмінено: 2004 → \d{4}\. Перевір, чи звучить природно\.$/).waitFor();
  const fiction = dialog(olya).getByLabel('Текст вигадки', exact);
  const suggested = await fiction.inputValue();
  expect(suggested).not.toBe(TRIP);
  await fiction.fill(TRIP);
  await dialog(olya).getByText('Текст ще такий самий, як у записі, — зміни деталь.', exact).waitFor();
  expect(await insert(olya).isDisabled()).toBe(true);
  await fiction.fill(suggested);
  await insert(olya).click();
  await dialog(olya).waitFor({ state: 'detached' });
  await expect.poll(() => olya.locator('.question-list li').count()).toBe(2);
  const drafted = (await draftOf(olya)).rounds[0]!.questions;
  expect(drafted.map((q) => q.type)).toEqual(['single', 'boolean']);
  expect(drafted[1]).toMatchObject({ correct: false, text: `Правда чи вигадка? ${suggested}` });
  for (const question of drafted) expect(question.timeLimit).toBeGreaterThanOrEqual(25);

  // ── 6. Збереження ставить «використано» записам, що є у вікторині. ──
  await olya.getByRole('button', { name: 'Зберегти', ...exact }).click();
  await olya.waitForURL(`${base}/quizzes`);
  const items = async () =>
    (await (await petro.request.get(`${base}/api/groups/${groupId}/items`)).json()) as { text: string; uses: { title: string }[] }[];
  await expect.poll(async () => (await items()).find((item) => item.text === STORY)?.uses.map((use) => use.title)).toEqual([QUIZ]);
  const marked = await items();
  expect(marked.find((item) => item.text === TRIP)?.uses.map((use) => use.title)).toEqual([QUIZ]);
  expect(marked.find((item) => item.text === GRANDMA)?.uses).toEqual([]);

  // ── 7. Петро на телефоні бачить позначку; «Ще не використані» її ховає. ──
  await petro.goto(`${base}/profile/groups/${groupId}`);
  const storyCard = petro.locator('article.group-item', { hasText: 'Як тато заблукав' });
  await storyCard.getByText(`Використано у «${QUIZ}»`, exact).waitFor();
  await expectNoSideScroll(petro, 'p12l-group-used-375');
  await petro.getByRole('button', { name: 'Ще не використані', ...exact }).click();
  await expect.poll(() => storyCard.count()).toBe(0);
  await petro.locator('article.group-item', { hasText: GRANDMA }).waitFor();

  // ── 8. Гра: Петро з телефона відповідає на обидва запитання. ──
  await olya.locator('.quiz-list li', { hasText: QUIZ }).getByRole('button', { name: 'Грати', ...exact }).click();
  await olya.waitForURL(/\/host\/\d{6}$/);
  const code = olya.url().slice(-6);
  await join(petro, code, 'Петро', false);
  await olya.getByText('Петро', exact).first().waitFor();
  const step = async (name: string) => {
    const button = olya.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  await step('Почати гру');
  await afterSplash(olya, petro);
  await step('Почати раунд');
  await afterSplash(olya, petro);
  await petro.getByText(/^Хто це\? Як ___ заблукав/).first().waitFor();
  await shot(petro, 'p12l-play-who-375');
  await pickOption(petro, 'тато');
  await olya.getByText('Запитання закрите').waitFor();
  await step('Показати відповідь');
  await petro.getByText(/правильн/i).first().waitFor();
  await expect.poll(() => scoreOf(olya, 'Петро')).toBeGreaterThan(0);
  await toNextQuestion(olya);
  await afterSplash(olya, petro);
  await petro.getByText(/^Правда чи вигадка\?/).first().waitFor();
  await petro.getByRole('button', { name: 'Ні', ...exact }).click();
  await olya.getByText('Запитання закрите').waitFor();
  await step('Показати відповідь');
  await petro.getByText(/правильн/i).first().waitFor();
  const finished = olya.getByText('Гру завершено').first();
  for (let i = 0; i < 6 && !(await finished.isVisible()); i++) {
    await step('Далі').catch(() => undefined);
    await afterSplash(olya, petro);
  }
  await finished.waitFor();

  // ── 9. Панель Петра на телефоні: на весь екран, його сюрприз про Олю є; 375 і 320 без прокрутки вбік. ──
  await petro.goto(`${base}/quizzes/new`);
  await petro.getByRole('button', { name: 'Із групи', ...exact }).click();
  await record(petro, 'торт без борошна').waitFor();
  const box = (await dialog(petro).boundingBox())!;
  expect([box.x, box.y, box.width]).toEqual([0, 0, 375]);
  await expectNoSideScroll(petro, 'p12l-picker-375');
  await record(petro, GRANDMA).click();
  await template(petro, 'Хто я?').waitFor();
  await expectNoSideScroll(petro, 'p12l-picker-templates-375');
  await petro.setViewportSize({ width: 320, height: 640 });
  await expectNoSideScroll(petro, 'p12l-picker-320');
  const narrow = await dialog(petro).locator('button.group-template').evaluateAll((buttons) =>
    buttons.every((button) => button.getBoundingClientRect().right <= innerWidth + 0.5),
  );
  expect(narrow, 'template cards fit 320').toBe(true);
  await dialog(petro).getByRole('button', { name: 'Закрити', ...exact }).click();
  await dialog(petro).waitFor({ state: 'detached' });
  await petro.setViewportSize({ width: 375, height: 812 });

  // ── 10. Клітинка поля: «Блеф» неактивний, «Хто я?» стає в клітинку з її ціною. ──
  await olya.goto(`${base}/quizzes/new`);
  await field(olya, 'Назва вікторини').fill('Поле родини');
  await olya.getByRole('button', { name: '+ Раунд', ...exact }).click();
  await olya.getByRole('button', { name: 'Ігрове поле', ...exact }).click();
  const stage = olya.locator('.editor-stage');
  const price = await stage.getByLabel('Бали', exact).inputValue();
  await stage.getByRole('button', { name: 'Із групи', ...exact }).click();
  await record(olya, 'Як тато заблукав').click();
  expect(await template(olya, 'Блеф').isDisabled()).toBe(true);
  await template(olya, 'Блеф').getByText('У цьому раунді таких запитань немає', exact).waitFor();
  await template(olya, 'Хто я?').click();
  await insert(olya).click();
  await dialog(olya).waitFor({ state: 'detached' });
  expect(await questionText(olya).inputValue()).toBe('Хто я?');
  expect(await stage.getByLabel('Бали', exact).inputValue()).toBe(price);
  await shot(olya, 'p12l-board-cell');
  await olya.getByRole('button', { name: 'Скасувати', ...exact }).click();
  await olya.waitForURL(`${base}/quizzes`);

  // ── 11. «Вікторина з групи»: три записи, «Змішано», один раунд у редакторі. ──
  await olya.goto(`${base}/profile/groups/${groupId}`);
  await olya.getByRole('button', { name: 'Вікторина з групи', ...exact }).click();
  for (const text of ['Як тато заблукав', GRANDMA, TRIP]) {
    await olya.locator('article.group-item', { hasText: text }).getByRole('checkbox', { name: 'Узяти у вікторину', ...exact }).check();
  }
  expect(await olya.getByLabel('Шаблон', exact).inputValue()).toBe('mixed');
  await olya.getByRole('button', { name: 'Скласти вікторину · 3', ...exact }).click();
  await olya.waitForURL(`${base}/quizzes/new`);
  await olya.getByText('Вікторину складено з записів групи. Над кожним запитанням — що варто перевірити.', exact).waitFor();
  expect(await field(olya, 'Назва вікторини').inputValue()).toBe(`Вікторина: ${GROUP}`);
  await expect.poll(() => olya.locator('.question-list li').count()).toBe(3);
  const made = await draftOf(olya);
  expect(made.rounds).toHaveLength(1);
  expect(made.rounds[0]).toMatchObject({ type: 'classic', title: GROUP });
  for (const question of made.rounds[0]!.questions) expect(question.timeLimit, question.text).toBeGreaterThanOrEqual(25);
  await shot(olya, 'p12l-group-quiz-editor');
  await olya.getByRole('button', { name: 'Скасувати', ...exact }).click();
  await olya.waitForURL(`${base}/quizzes`);

  // ── 12. «📜 Літописець»: двадцятий запис Петра. ──
  for (let n = 3; n <= 20; n++) await write(petro, { text: `Родинна дрібниця №${n}` });
  await petro.goto(`${base}/profile/achievements`);
  const today = await todayOn(petro);
  const chronicler = petro.locator('.achievement-card', { has: petro.getByRole('heading', { name: 'Літописець', ...exact }) });
  await chronicler.waitFor();
  expect(await chronicler.getAttribute('class')).not.toContain('is-locked');
  await chronicler.getByText(`Отримано ${today}`, exact).waitFor();
  expect(await chronicler.innerText()).toContain('📜');
  expect(await petro.locator('.achievements-count').textContent()).toMatch(/^Отримано \d+ з 102$/);
  await chronicler.scrollIntoViewIfNeeded();
  await shot(petro, 'p12l-chronicler-375');

  // ── 13. Помилок консолі немає. ──
  expect(problems).toEqual([]);
}

it('part 12l: Оля drafts «Хто це?» and an honest «Вигадка» from family records on 1280 without ever seeing Петро’s surprise about her, saves, the records show «Використано у «Родинна розминка»» to Петро on 375, the game plays both questions on a phone, Петро’s own picker shows his surprise and fits 375 and 320, a board cell refuses «Блеф» and takes «Хто я?» at its price, «Вікторина з групи» opens a three-question round in the editor, and 20 records earn «📜 Літописець»', async () => {
  try {
    await groupQuestions12l();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);
