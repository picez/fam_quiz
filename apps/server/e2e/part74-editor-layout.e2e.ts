import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { click, editorTab, expectNoSideScroll, field, open, pickType, POLL, questionText, register, roundAction, roundNames, showProblems } from './helpers/common';
import { base, exact, shot, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 74 — нове компонування редактора: вкладки «Загальне» / «Раунди й запитання» (у адресі ?tab=general),
 * картки запитання, комбобокс типу з пошуком (нижній аркуш на телефоні, список під кнопкою на ПК), «торкнуті» помилки,
 * сіре нагадування про короткий таймер, панель «⚠ N» з переходом на місце, збереження з нагадуванням, смуга раунду з «⋯» і «⚙».
 * Телефон 360 × 800 і ПК 1920 × 1080, без бічної прокрутки.
 */

useE2eServer();

it('part 74: editor layout — rounds tab by default, «⚠ Помилок: 2 · нагадувань: 1» and no red on a fresh quiz; the type combobox is a bottom sheet with 5 groups, search and Esc; a left empty question turns red, a 15 s timer gives a grey reminder and ⓘ; the issues panel jumps to question 2; the general tab keeps ?tab=general across a reload; saving goes through with a reminder; at 1920 px a list beside the editor, the general cards in two columns, a dropdown under the button, «⋯» moves a round and «⚙» sits in the round bar; no side scroll', async () => {
  try {
    await layout74();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

const issuesButton = (page: Page) => page.locator('.issues-button');
const typeCombo = (page: Page) => page.locator('.editor-stage .combo:has(> button.combo-trigger[aria-label^="Тип запитання:"])').first();
const typeTrigger = (page: Page) => typeCombo(page).locator(':scope > button.combo-trigger');
const listItem = (page: Page, index: number) => page.locator('.question-list > li').nth(index - 1);
/** Список запитань на телефоні схований за кнопкою «☰». */
async function showList(page: Page) {
  const all = page.getByRole('button', { name: 'Усі запитання', ...exact });
  if ((await all.isVisible()) && (await all.getAttribute('aria-expanded')) !== 'true') await all.click();
}
const questionCard = (page: Page) => page.locator('.editor-stage [data-card="question"]');
const timeCard = (page: Page) => page.locator('.editor-stage [data-card="time"]');
const isFocused = (page: Page, selector: string) => page.evaluate((s) => document.activeElement === document.querySelector(s), selector);

async function layout74() {
  // ── 1. Марта відкриває нову вікторину на телефоні. ──
  const marta = await open('marta74', 360, 800);
  await register(marta, 'menu', 'Марта 74', 'marta74@example.com');
  await marta.goto(`${base}/quizzes/new`);
  await field(marta, 'Назва вікторини').waitFor();
  expect(await marta.locator('#editor-tab-rounds').getAttribute('aria-selected'), 'the rounds tab is the default').toBe('true');
  expect(marta.url(), 'no tab in the URL by default').not.toContain('tab=');
  expect((await issuesButton(marta).textContent())?.trim()).toBe('⚠ Помилок: 2 · нагадувань: 1');
  expect(await marta.locator('.has-error').count(), 'no red on a fresh quiz').toBe(0);
  expect(await issuesButton(marta).getAttribute('class'), 'the counter is not red on a fresh quiz').not.toContain('has-errors');
  expect(await marta.locator('.field-error, .card-error').count(), 'no inline errors on a fresh quiz').toBe(0);
  await expectNoSideScroll(marta, '74-editor-360');

  // ── 2. Комбобокс типу: нижній аркуш, групи, пошук, Esc, Enter. ──
  expect(await typeTrigger(marta).getAttribute('aria-label')).toBe('Тип запитання: Один правильний варіант');
  await typeTrigger(marta).click();
  const popup = typeCombo(marta).locator('.combo-popup');
  await popup.waitFor();
  const sheet = (await popup.boundingBox())!;
  expect(sheet.x, 'the sheet starts on the screen').toBeGreaterThanOrEqual(0);
  expect(sheet.x + sheet.width, 'the sheet ends on the screen').toBeLessThanOrEqual(360);
  expect(sheet.y + sheet.height, 'the sheet sits at the bottom of the screen').toBeGreaterThan(800 - 2);
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(800 + 1);
  expect(await popup.locator('[role="group"]').count(), 'five type groups').toBe(5);
  expect(await isFocused(marta, '.editor-stage .combo-search'), 'the search takes the focus').toBe(true);
  await shot(marta, '74-type-sheet-360');
  await expectNoSideScroll(marta, '74-type-sheet-360-open');
  await marta.keyboard.type('хто я');
  await expect.poll(() => popup.locator('[role="option"]').count(), POLL).toBe(1);
  expect(await popup.locator('[role="option"]').getAttribute('data-value')).toBe('clues');
  expect(await popup.locator('[role="option"]').getAttribute('aria-label')).toBe('Хто я?');
  await marta.keyboard.press('Escape');
  await popup.waitFor({ state: 'detached' });
  expect(await isFocused(marta, '.editor-stage .combo > button.combo-trigger'), 'Esc returns the focus to the button').toBe(true);
  expect(await typeTrigger(marta).getAttribute('aria-label'), 'Esc keeps the type').toBe('Тип запитання: Один правильний варіант');
  await typeTrigger(marta).click();
  await popup.waitFor();
  await marta.keyboard.type('так чи');
  await marta.keyboard.press('Enter');
  await popup.waitFor({ state: 'detached' });
  expect(await typeTrigger(marta).getAttribute('aria-label')).toBe('Тип запитання: Так чи ні');

  // ── 3. Покинуте порожнє запитання стає червоним. ──
  expect(await questionCard(marta).getAttribute('class'), 'still no red before leaving').not.toContain('has-error');
  await click(marta, 'Додати запитання');
  await showList(marta);
  await listItem(marta, 1).locator('.question-item-mark.is-error').waitFor();
  expect((await listItem(marta, 1).locator('.question-item-mark').textContent())?.trim()).toBe('⚠');
  expect(await listItem(marta, 2).locator('.question-item-mark').count(), 'the new question is not red yet').toBe(0);
  await listItem(marta, 1).locator('button.question-item').click();
  await expect.poll(() => questionCard(marta).getAttribute('class'), POLL).toContain('has-error');
  expect((await questionCard(marta).locator('.card-error').textContent())?.trim()).toBe('Запитання 1: впишіть текст запитання.');
  await shot(marta, '74-touched-360');

  // ── 4. Текст є, таймер 15 с: сіре нагадування в «Час і бали», ⓘ у списку, розділ нагадувань у панелі. ──
  await questionText(marta).fill('Дністер довший за Дніпро?');
  await click(marta, 'Правильна відповідь: Ні');
  await field(marta, 'Час, с').fill('15');
  await timeCard(marta).locator('.card-note', { hasText: 'Таймер коротший за 25 с — гравці можуть не встигнути прочитати. Зберегти можна.' }).waitFor();
  expect(await timeCard(marta).getAttribute('class'), 'a reminder is not red').not.toContain('has-error');
  await showList(marta);
  await expect.poll(async () => (await listItem(marta, 1).locator('.question-item-mark').textContent())?.trim(), POLL).toBe('ⓘ');
  await issuesButton(marta).click();
  const panel = marta.locator('.issues-panel');
  await panel.waitFor();
  await panel.getByRole('heading', { name: 'Нагадування — зберегти можна', ...exact }).waitFor();
  await panel.locator('ul.reminders', { hasText: 'Запитання 1: таймер 15 с — менше за 25 с, гравці можуть не встигнути.' }).waitFor();
  await shot(marta, '74-issues-360');
  await expectNoSideScroll(marta, '74-issues-360-open');

  // ── 5. Рядок помилки веде на запитання 2. ──
  await panel.locator('ul.problems').getByRole('button', { name: 'Запитання 2: впишіть текст запитання.', ...exact }).click();
  await panel.waitFor({ state: 'detached' });
  await showList(marta);
  await expect.poll(() => listItem(marta, 2).locator('button.question-item').getAttribute('aria-current'), POLL).toBe('true');
  await expect.poll(() => questionCard(marta).evaluate((el) => {
    const box = el.getBoundingClientRect();
    return box.bottom > 0 && box.top < innerHeight;
  }), POLL).toBe(true);

  // ── 6. «Загальне»: картки, згорнуті підсумки, вкладка в адресі й після перезавантаження. ──
  await editorTab(marta, 'Загальне');
  await expect.poll(() => marta.url(), POLL).toContain('tab=general');
  const general = marta.locator('#editor-panel-general');
  for (const title of ['Про вікторину', 'Як грати', 'Командна гра']) {
    await general.locator('section.editor-card', { has: marta.getByRole('heading', { name: title, ...exact }) }).waitFor();
  }
  const folded = async (kind: string) => {
    const box = general.locator(`details.${kind}`);
    expect(await box.getAttribute('open'), `${kind} is folded`).toBeNull();
    return (await box.locator(':scope > summary').innerText()).replace(/\s+/g, ' ').trim();
  };
  // Нова вікторина має типові бафи.
  expect(await folded('powers')).toMatch(/^Бафи й дебафи увімкнено: \d+$/);
  expect(await folded('spares')).toBe('Запасні запитання запасних: 0');
  expect(await folded('duels')).toBe('Дуелі вимкнено');
  await expectNoSideScroll(marta, '74-general-360');
  await marta.reload();
  await marta.locator('#editor-panel-general').waitFor();
  expect(await marta.locator('#editor-tab-general').getAttribute('aria-selected')).toBe('true');
  const banner = marta.locator('p.banner', { hasText: 'Відновлено незбережені зміни.' });
  await banner.waitFor();
  expect((await banner.boundingBox())!.y, 'the draft banner is above the tabs').toBeLessThan((await marta.locator('.editor-tabs').boundingBox())!.y);

  // ── 7. Дописати назву й запитання 2 → збережено попри нагадування (таймер 15 с, без опису). ──
  await field(marta, 'Назва вікторини').fill('Ріки 74');
  await editorTab(marta, 'Раунди й запитання');
  expect(marta.url()).not.toContain('tab=');
  await showList(marta);
  await listItem(marta, 2).locator('button.question-item').click();
  await questionText(marta).fill('Яка ріка тече через Київ?');
  await field(marta, 'Варіант 1').fill('Дніпро');
  await field(marta, 'Варіант 2').fill('Дунай');
  await expect.poll(async () => (await issuesButton(marta).textContent())?.trim(), POLL).toBe('ⓘ Нагадувань: 2');
  expect(await issuesButton(marta).getAttribute('class'), 'reminders only are not red').not.toContain('has-errors');
  await click(marta, 'Зберегти');
  await marta.waitForURL(`${base}/quizzes`);
  const row = marta.locator('ul.quiz-list > li', { has: marta.getByRole('heading', { name: 'Ріки 74', ...exact }) });
  await row.waitFor();
  const editHref = await row.getByRole('link', { name: 'Редагувати' }).getAttribute('href');
  expect(editHref).toMatch(/^\/quizzes\/[^/]+$/);

  // ── 8. ПК 1920 × 1080: список ліворуч, картки праворуч, «Загальне» у два стовпці, список типів під кнопкою. ──
  await marta.setViewportSize({ width: 1920, height: 1080 });
  await marta.goto(`${base}${editHref}`);
  await questionCard(marta).waitFor();
  const side = (await marta.locator('.editor-side').boundingBox())!;
  const stage = (await marta.locator('.editor-stage').boundingBox())!;
  expect(side.x + side.width, 'the list is left of the editor').toBeLessThanOrEqual(stage.x + 1);
  expect(Math.abs(side.y - stage.y), 'the list and the editor start on one line').toBeLessThan(40);
  expect(await marta.locator('.question-list').isVisible(), 'the list is open on a PC').toBe(true);
  for (const card of ['question', 'answers', 'time']) await marta.locator(`.editor-stage [data-card="${card}"]`).waitFor();
  await expectNoSideScroll(marta, '74-editor-1920');
  await typeTrigger(marta).click();
  await popup.waitFor();
  const trigger = (await typeTrigger(marta).boundingBox())!;
  const dropdown = (await popup.boundingBox())!;
  expect(dropdown.y, 'the list opens under the button').toBeGreaterThanOrEqual(trigger.y + trigger.height - 1);
  expect(dropdown.width, 'not a full-width sheet').toBeLessThan(1920 / 2);
  expect(Math.abs(dropdown.x - trigger.x), 'aligned with the button').toBeLessThan(2);
  await shot(marta, '74-type-dropdown-1920');
  await marta.keyboard.press('Escape');
  await popup.waitFor({ state: 'detached' });

  await editorTab(marta, 'Загальне');
  const cards = await marta.locator('.editor-general > .editor-card').evaluateAll((els) => els.slice(0, 2).map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
  expect(cards.length).toBe(2);
  expect(Math.abs(cards[0]!.top - cards[1]!.top), 'the first two general cards share a row').toBeLessThanOrEqual(1);
  expect(cards[1]!.left, 'two columns').toBeGreaterThan(cards[0]!.right - 1);
  await expectNoSideScroll(marta, '74-general-1920');

  // ── 9. Два раунди: «+ Раунд» → «Фінал», «⋯» → вище, «⚙» у смузі раунду. ──
  await editorTab(marta, 'Раунди й запитання');
  await click(marta, '+ Раунд');
  await click(marta, 'Фінал');
  expect(await roundNames(marta)).toEqual(['Раунд 1', 'Фінал']);
  await roundAction(marta, 'Раунд 2 вище');
  await expect.poll(() => roundNames(marta), POLL).toEqual(['Фінал', 'Раунд 2']);
  const pick = (await marta.locator('.combo.round-pick > button.combo-trigger').boundingBox())!;
  const gear = marta.locator('details.round-settings > summary');
  const gearBox = (await gear.boundingBox())!;
  expect(Math.abs(gearBox.y + gearBox.height / 2 - (pick.y + pick.height / 2)), '⚙ sits in the round bar').toBeLessThanOrEqual(8);
  expect(await gear.innerText()).toContain('Налаштування раунду');
  await gear.click();
  await marta.locator('details.round-settings[open]').waitFor();
  await expectNoSideScroll(marta, '74-rounds-1920');
}
