import { blitzRound, bool as boolQ, boardRound, classicRound, duels as duelPool, finalRound, makeRoundsQuiz, match as matchQ, multi, numeric as numericQ, order, single, text as textQ, withId, withPoints } from '@quiz/engine/testing';
import { DEFAULT_RULES } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { open, click, field, seconds, arrange, join, bodyText, expectNoSideScroll, register, noSideScroll, yOf, duelAnswer, duelButton, buffButton, takeBuff, tapBuff, pickOption, numericAnswer, boxOf, textAnswer, vote, splashOn, guideOn, label } from './helpers/common';
import { exact, base, problems, pages, rigged, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 8: бафи й дебафи, підказки, заставки раундів, «Як грати».
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 8a: buffs and debuffs in the editor, a buff row on the phone, 50/50, double points, a second try with a choice, extra time with «Не чекати», a shield, double points on a x2 cell, icons and totals in the history', async () => {
  try {
    await buffsGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function buffsGame() {
  const host = await open('host8a', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host8a@example.com');

  const choice = (id: string, text: string, timeLimit: number, options: string[]) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit,
    points: 100,
    options: options.map((option, at) => ({ id: `${id}o${at}`, text: option })),
    correctId: `${id}o0`,
  });
  const base8a = { imageUrl: null, video: null, points: 100 };
  const q1 = choice('q1', 'Найбільше озеро України?', 20, ['Ялпуг', 'Світязь', 'Синевир', 'Кугурлуй']);
  const q2 = { ...base8a, id: 'q2', type: 'numeric' as const, text: 'Рік проголошення незалежності України?', timeLimit: 30, correct: 1991, tolerance: 10 };
  const q3 = choice('q3', 'Столиця Буковини?', 5, ['Чернівці', 'Ужгород', 'Луцьк']);
  const q4 = { ...base8a, id: 'q4', type: 'boolean' as const, text: 'Дніпро впадає в Чорне море?', timeLimit: 5, correct: true };
  const cellQ = (category: string, price: number) => ({
    ...withPoints(withId(single, `b-${category}-${price}`), price),
    text: `${category} ${price}: столиця України?`,
  });
  const rounds = [
    classicRound('r1', [q1, q2, q3, q4], { title: 'Розминка', speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' } }),
    boardRound(
      'r2',
      ['Міста', 'Річки', 'Гори'].map((title, column) => ({
        title,
        cells: [100, 200, 300].map((price) =>
          column === 0 && price === 100 ? { question: cellQ(title, price), mark: 'x2' as const } : cellQ(title, price),
        ),
      })),
      { title: 'Поле', answerMode: 'phone', check: 'auto' },
    ),
  ];
  const data = {
    ...makeRoundsQuiz(rounds, { leaderboard: 'end', debuffs: ['fog', 'shake'], buffs: ['fifty', 'double', 'retry', 'time', 'shield'] }),
    title: 'Бафи',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Редактор: розділ «Бафи й дебафи» з чинними значеннями; «Жодного» / «Усі» / знову два дебафи.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Бафи' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('details.powers > summary').click();
  const debuffGroup = host.locator('fieldset.powers-group').nth(0);
  const buffGroup = host.locator('fieldset.powers-group').nth(1);
  const box = (group: typeof debuffGroup, name: string) => group.locator('label.powers-item', { hasText: name }).locator('input');
  const debuffNames = ['Тремтіння екрана', 'Туман', 'Заморозка', 'Дзеркало', 'Гості на екрані', 'Брудний екран'];
  const checkedDebuffs = async () => {
    const on: string[] = [];
    for (const name of debuffNames) if (await box(debuffGroup, name).isChecked()) on.push(name);
    return on;
  };
  expect(await checkedDebuffs()).toEqual(['Тремтіння екрана', 'Туман']);
  for (const name of ['50/50', 'Подвійні бали', 'Друга спроба', 'Додатковий час', 'Щит']) expect(await box(buffGroup, name).isChecked(), name).toBe(true);
  // Усі вісім бафів можна вибрати: жодного «скоро».
  for (const name of ['Запитання в залі', 'Підказка ведучого', 'Заміна запитання']) {
    expect(await box(buffGroup, name).isDisabled(), name).toBe(false);
    expect(await box(buffGroup, name).isChecked(), name).toBe(false);
  }
  expect(await buffGroup.getByText('скоро').count()).toBe(0);
  await shot(host, 'buff8a-editor');
  await debuffGroup.getByRole('button', { name: 'Жодного', ...exact }).click();
  expect(await checkedDebuffs()).toEqual([]);
  await debuffGroup.getByRole('button', { name: 'Усі', ...exact }).click();
  expect(await checkedDebuffs()).toEqual(debuffNames);
  // «Усі» вмикає й п'ять дебафів 12h — вимикаємо їх разом зі старими чотирма.
  for (const name of ['Заморозка', 'Дзеркало', 'Гості на екрані', 'Брудний екран', 'Догори дриґом', 'Ліхтарик', 'Липкі кнопки', 'Без годинника', 'Бульбашки']) await box(debuffGroup, name).uncheck();
  expect(await checkedDebuffs()).toEqual(['Тремтіння екрана', 'Туман']);
  expect(await debuffGroup.locator('input:checked').count()).toBe(2);
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'buff8a-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // Гра: сцена 1600 × 900, Оля 375, Петро 360, Іра 390.
  await host.locator('.quiz-list li', { hasText: 'Бафи' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage8a', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya8a', 375, 812);
  const petro = await open('petro8a', 360, 740);
  const ira = await open('ira8a', 390, 844);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const hostScore = async (nickname: string) => (await row(nickname).locator('.score').textContent())!;
  const scores = async () => ({ Оля: await hostScore('Оля'), Петро: await hostScore('Петро'), Іра: await hostScore('Іра') });
  const response = (nickname: string) => host.locator('.rows li', { has: host.locator('.given') }).filter({ hasText: nickname });
  const reveal = async () => {
    await click(host, 'Показати відповідь');
    for (const page of phones) await page.locator('section.result').first().waitFor();
  };

  // Пульт: «Дебаф» біля Олі пропонує лише «Тремтіння екрана» і «Туман».
  await click(host, 'Почати гру');
  await row('Оля').getByRole('button', { name: 'Дебаф', ...exact }).click();
  const picks = row('Оля').locator('.player-tools .debuff-picks button');
  await picks.first().waitFor();
  const pickTexts = await picks.allTextContents();
  expect(pickTexts).toHaveLength(2);
  expect(pickTexts[0]).toMatch(/Тремтіння екрана$/);
  expect(pickTexts[1]).toMatch(/Туман$/);
  await shot(host, 'buff8a-host-debuffs');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'buff8a-host-debuffs-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await row('Оля').getByRole('button', { name: 'Дебаф', ...exact }).click();
  await row('Оля').locator('.player-tools').waitFor({ state: 'detached' });

  // 1. q1: ряд із п'яти бафів у кожного; 50/50 Олі прибирає «Світязь» і «Синевир» на місці.
  await click(host, 'Почати раунд');
  for (const page of phones) {
    await page.locator('h1', { hasText: 'Найбільше озеро України?' }).waitFor();
    expect(await page.locator('.buff-row .buff-btn').count()).toBe(5);
  }
  await expectNoSideScroll(olya, 'buff8a-row-375');
  const petroQuestion = await boxOf(petro, 'h1.question');
  const petroRow = await boxOf(petro, '.buff-row');
  const olyaChoices = await yOf(olya);
  rigged.push(1, 1);
  await takeBuff(olya, '50/50');
  for (const text of ['Світязь', 'Синевир']) await olya.locator('.choice.is-removed', { hasText: text }).waitFor();
  for (const text of ['Ялпуг', 'Кугурлуй']) expect(await olya.getByRole('button', { name: new RegExp(text) }).isEnabled(), text).toBe(true);
  expect(await olya.locator('.choice.is-removed').count()).toBe(2);
  expect(await yOf(olya), '50/50 moved the options').toEqual(olyaChoices);
  await stage.locator('.stage-buffs li').getByText('½ Оля', exact).waitFor();
  await stage.locator('.live-notice.is-buff').getByText('Оля: 50/50', exact).waitFor();
  await petro.locator('.live-notice.is-buff').getByText('Оля: 50/50', exact).waitFor();
  expect(await boxOf(petro, 'h1.question'), 'a buff of Оля moved the question of Петро').toEqual(petroQuestion);
  expect(await boxOf(petro, '.buff-row'), 'a buff of Оля moved the buff row of Петро').toEqual(petroRow);
  expect(await bodyText(stage)).not.toContain('прибрано');
  expect(await bodyText(petro)).not.toContain('прибрано');
  await expectNoSideScroll(olya, 'buff8a-fifty-375');
  await shot(stage, 'buff8a-fifty-stage');
  await shot(petro, 'buff8a-notice-phone');
  await takeBuff(petro, 'Подвійні бали');
  await takeBuff(ira, 'Щит');
  await stage.locator('.stage-buffs li').getByText('🛡 Іра', exact).waitFor();
  await pickOption(olya, 'Ялпуг');
  await pickOption(petro, 'Ялпуг');
  await pickOption(ira, 'Синевир');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await reveal();
  await response('Петро').locator('.buff-tag').getByText('×2', exact).waitFor();
  await response('Іра').locator('.buff-tag').getByText('🛡', exact).waitFor();
  await response('Оля').locator('.buff-tag').getByText('½', exact).waitFor();
  await shot(host, 'buff8a-reveal-host');
  await expect.poll(scores).toEqual({ Оля: '100', Петро: '200', Іра: '0' });

  // 2. q2: 50/50 Олі вже використано; друга спроба з вибором (Оля) і після помилки (Петро).
  await click(host, 'Далі');
  await olya.locator('h1', { hasText: 'Рік проголошення' }).waitFor();
  expect(await buffButton(olya, '50/50').getAttribute('class')).toContain('is-used');
  await tapBuff(olya, '50/50', 'Уже використано.');
  await takeBuff(olya, 'Друга спроба');
  await numericAnswer(olya, '1996');
  await olya.getByText(/^Частково правильно: \+75\. Залишити чи ще спроба\?$/).waitFor();
  await shot(olya, 'buff8a-retry-choice');
  await click(olya, 'Ще спроба');
  await numericAnswer(olya, '1991');
  await olya.getByText('Відповідь прийнято', exact).waitFor();
  const petroBar = await boxOf(petro, '.buff-bar');
  await takeBuff(petro, 'Друга спроба');
  await numericAnswer(petro, '2005');
  await petro.locator('.buff-why').getByText('Неправильно, ще одна спроба', exact).waitFor();
  expect(await boxOf(petro, '.buff-bar'), 'the retry prompt changed the buff row').toEqual(petroBar);
  await shot(petro, 'buff8a-retry-again');
  for (const page of [stage, ira]) {
    const html = await page.content();
    expect(html, 'a first try leaked').not.toContain('1996');
    expect(html, 'a first try leaked').not.toContain('2005');
  }
  await numericAnswer(petro, '1991');
  await numericAnswer(ira, '1991');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await reveal();
  await expect.poll(scores).toEqual({ Оля: '200', Петро: '300', Іра: '100' });
  for (const page of [stage, ira]) {
    const text = await bodyText(page);
    expect(text).not.toContain('1996');
    expect(text).not.toContain('2005');
  }

  // 3. q3 (5 с): Іра бере додатковий час; після спільних 5 с усі чекають на неї, вона відповідає сама.
  await click(host, 'Далі');
  await ira.locator('h1', { hasText: 'Столиця Буковини?' }).waitFor();
  await takeBuff(ira, 'Додатковий час');
  await ira.locator('.buff-why').getByText('+30 с — ваш час', exact).waitFor();
  await pickOption(olya, 'Чернівці');
  await pickOption(petro, 'Чернівці');
  const stageWait = stage.locator('.buff-wait');
  await stageWait.waitFor({ timeout: 8000 });
  expect(await stageWait.textContent()).toMatch(/^Чекаємо: Іра · 0:\d\d$/);
  await host.getByRole('button', { name: 'Не чекати', ...exact }).waitFor();
  await petro.locator('.question-head .buff-wait', { hasText: /^Чекаємо: Іра · 0:\d\d$/ }).waitFor();
  await shot(stage, 'buff8a-overtime-stage');
  await shot(petro, 'buff8a-overtime-phone');
  await shot(ira, 'buff8a-overtime-mine');
  await shot(host, 'buff8a-overtime-host');
  await host.setViewportSize({ width: 375, height: 812 });
  await host.getByRole('button', { name: 'Не чекати', ...exact }).waitFor();
  await expectNoSideScroll(host, 'buff8a-overtime-host-375');
  // На 375 px імена в рядках пульта не рвуться посеред слова, а відлік «Чекаємо» видно повністю.
  const brokenNames = await host.locator('.rows .name').evaluateAll((names) =>
    names
      .filter((name) => !/\s/.test(name.textContent ?? '') && name.getClientRects().length > 0)
      .filter((name) => {
        const range = name.ownerDocument.createRange();
        range.selectNodeContents(name);
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1;
      })
      .map((name) => name.textContent),
  );
  expect(brokenNames).toEqual([]);
  const timeShown = async (page: Page) =>
    page.locator('.buff-wait').evaluate((line) => {
      const time = line.querySelector('.buff-wait-time')!.getBoundingClientRect();
      return time.width > 0 && time.right <= line.getBoundingClientRect().right + 0.5;
    });
  expect(await timeShown(host)).toBe(true);
  expect(await timeShown(petro)).toBe(true); // телефон Петра — 360 px
  expect(await timeShown(stage)).toBe(true);
  await host.setViewportSize({ width: 1280, height: 900 });
  await stage.waitForTimeout(1500);
  await pickOption(ira, 'Чернівці');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await reveal();
  await expect.poll(scores).toEqual({ Оля: '300', Петро: '400', Іра: '200' });

  // 4. q4 (5 с): 50/50 не діє на «так / ні»; Петро бере час, ведучий не чекає.
  await click(host, 'Далі');
  await ira.locator('h1', { hasText: 'Дніпро впадає' }).waitFor();
  const iraBar = await boxOf(ira, '.buff-bar');
  await tapBuff(ira, '50/50', '50/50 діє лише на запитаннях з варіантами.');
  expect(await boxOf(ira, '.buff-bar'), 'the reason changed the buff row').toEqual(iraBar);
  await takeBuff(petro, 'Додатковий час');
  await click(olya, 'Так');
  await click(ira, 'Так');
  await host.getByRole('button', { name: 'Не чекати', ...exact }).waitFor({ timeout: 8000 });
  await click(host, 'Не чекати');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await shot(host, 'buff8a-nowait-host');
  await reveal();
  await expect.poll(scores).toEqual({ Оля: '400', Петро: '400', Іра: '300' });

  // 5. Поле: Оля вибирає «×2» за 100; щит тут не потрібен; подвійні бали на ×2 — +400.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await olya.getByRole('button', { name: 'Міста, 100', ...exact }).click();
  for (const page of phones) await page.locator('h1', { hasText: 'Міста 100' }).waitFor();
  await tapBuff(olya, 'Щит', 'Щит не потрібен: у цьому раунді помилка не коштує балів.');
  expect(await petro.locator('.buff-row').count(), 'not the chooser: no buff row').toBe(0);
  expect(await ira.locator('.buff-row').count(), 'not the chooser: no buff row').toBe(0);
  await takeBuff(olya, 'Подвійні бали');
  await pickOption(olya, 'Київ');
  await click(host, 'Прийняти');
  await olya.getByText('Правильно!').waitFor();
  await shot(olya, 'buff8a-board-phone');
  await expect.poll(scores).toEqual({ Оля: '800', Петро: '400', Іра: '300' });

  // 6. Історія: та сама таблиця, значки бафів біля відповідей.
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();
  await expectNoSideScroll(olya, 'buff8a-phone-375');
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Бафи/ }).click();
  const standings = host.locator('.standings li');
  await standings.first().waitFor();
  const table: [string, string][] = [];
  for (let i = 0; i < (await standings.count()); i++) {
    table.push([(await standings.nth(i).locator('.name').textContent())!, (await standings.nth(i).locator('.score').textContent())!]);
  }
  expect(table).toEqual([
    ['Оля', '800'],
    ['Петро', '400'],
    ['Іра', '300'],
  ]);
  await host.evaluate("document.querySelectorAll('details.responses').forEach((d) => { d.open = true; })");
  const line = (question: string, nickname: string) =>
    host
      .locator('.rows.stacked > li', { hasText: question })
      .locator('details.responses li', { has: host.locator('.responses-name', { hasText: nickname }) });
  const badgeOf = async (question: string, nickname: string) => {
    const tags = await line(question, nickname).locator('.buff-tag').allTextContents();
    return tags.length === 0 ? null : tags.join(' ');
  };
  expect(await badgeOf('Найбільше озеро', 'Оля')).toBe('½');
  expect(await badgeOf('Найбільше озеро', 'Петро')).toBe('×2');
  expect(await badgeOf('Найбільше озеро', 'Іра')).toBe('🛡');
  expect(await badgeOf('Рік проголошення', 'Оля')).toBe('↻');
  expect(await badgeOf('Рік проголошення', 'Петро')).toBe('↻');
  expect(await badgeOf('Рік проголошення', 'Іра')).toBe(null);
  for (const nickname of ['Оля', 'Петро']) expect(await line('Рік проголошення', nickname).locator('.responses-answer').textContent()).toBe('1991');
  expect(await badgeOf('Столиця Буковини', 'Іра')).toBe('⏱');
  expect(await badgeOf('Міста 100', 'Оля')).toBe('×2');
  await shot(host, 'buff8a-history-host');

  expect(problems).toEqual([]);
}

it('part 8b: hints and spares in the editor, a written hint, the audience vote with percentages and guesses, a host hint and «Підказав уголос», a spare question on one phone and on the board stage, «Не чекати» for a swap, spares in the history', async () => {
  try {
    await sparesGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function sparesGame() {
  const host = await open('host8b', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host8b@example.com');

  const choice = (id: string, text: string, timeLimit: number, options: string[]) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit,
    points: 100,
    options: options.map((option, at) => ({ id: `${id}o${at}`, text: option })),
    correctId: `${id}o0`,
  });
  const base8b = { imageUrl: null, video: null, points: 100 };
  const q1 = { ...choice('q1', 'Найдовша річка України?', 30, ['Дніпро', 'Дністер', 'Південний Буг', 'Десна']), hint: 'Тече через Київ' };
  const q2 = { ...base8b, id: 'q2', type: 'numeric' as const, text: 'Скільки областей в Україні?', timeLimit: 30, correct: 24, tolerance: 0 };
  // 60 с: на цьому запитанні — підказка від ведучого, заміна й два голосування, а кадри з E2E_SHOTS забирають час.
  const q3 = { ...base8b, id: 'q3', type: 'text' as const, text: 'Столиця Галичини?', timeLimit: 60, accepted: ['Львів'] };
  // 8 с замість 5: підказку «уголос» і заміну треба встигнути до спільного кінця.
  const q4 = choice('q4', 'Найвища гора України?', 8, ['Говерла', 'Піп Іван', 'Петрос']);
  const cellQ = (category: string, price: number) => ({
    ...withPoints(withId(single, `b-${category}-${price}`), price),
    text: `${category} ${price}: столиця України?`,
  });
  const rounds = [
    classicRound('r1', [q1, q2, q3, q4], { title: 'Розминка', speedBonus: false }),
    boardRound(
      'r2',
      ['Міста', 'Річки', 'Гори'].map((title) => ({ title, cells: [100, 200, 300].map((price) => cellQ(title, price)) })),
      { title: 'Поле', answerMode: 'phone', check: 'auto' },
    ),
  ];
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end', buffs: ['audience', 'hint'] }), title: 'Бафи 2' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Редактор: підказка q1; заміна без пулу не зберігається; три запасні без часу, балів і підказки.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Бафи 2' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('label.hint-field', { hasText: "Підказка (необов'язково)" }).first().waitFor();
  expect(await host.locator('.hint-field textarea').first().inputValue()).toBe('Тече через Київ');
  await shot(host, 'buff8b-editor-hint');
  await host.locator('details.powers > summary').click();
  const buffGroup = host.locator('fieldset.powers-group').nth(1);
  expect(await buffGroup.getByText('скоро').count()).toBe(0);
  for (const item of await buffGroup.locator('label.powers-item input').all()) expect(await item.isDisabled()).toBe(false);
  await buffGroup.locator('label.powers-item', { hasText: 'Заміна запитання' }).locator('input').check();
  await buffGroup.locator('.powers-warn').getByText('Заміна запитання: додайте запасні запитання', exact).waitFor();
  const sparesBox = host.locator('details.spares');
  expect(await sparesBox.getAttribute('open')).toBeNull();
  await click(host, 'Зберегти');
  await host.getByText('Заміна запитання: додайте запасні запитання.', exact).waitFor();
  await expect.poll(() => sparesBox.getAttribute('open')).not.toBeNull();
  expect(host.url()).not.toMatch(/\/quizzes$/);
  await shot(host, 'buff8b-editor-empty');
  const spareText = sparesBox.locator('.question-field textarea');
  await sparesBox.getByRole('button', { name: 'Додати запасне', ...exact }).click();
  await sparesBox.getByRole('button', { name: 'так чи ні', ...exact }).click();
  await spareText.fill('Чорне море солоніше за Азовське?');
  await sparesBox.getByRole('button', { name: 'Правильна відповідь: Так', ...exact }).click();
  await sparesBox.getByRole('button', { name: 'Додати запасне', ...exact }).click();
  await sparesBox.getByRole('button', { name: 'текст', ...exact }).click();
  await spareText.fill('Столиця Буковини?');
  await sparesBox.getByLabel('Написання 1', exact).fill('Чернівці');
  await sparesBox.getByRole('button', { name: 'Додати запасне', ...exact }).click();
  await sparesBox.getByRole('button', { name: 'число', ...exact }).click();
  await spareText.fill('Скільки днів у високосному році?');
  await sparesBox.getByLabel('Правильне число', exact).fill('366');
  for (const label of ['Запасне 1 · так чи ні', 'Запасне 2 · текст', 'Запасне 3 · число']) await sparesBox.getByRole('button', { name: label, ...exact }).waitFor();
  expect(await sparesBox.getByLabel('Час, с', exact).count()).toBe(0);
  expect(await sparesBox.getByLabel('Бали', exact).count()).toBe(0);
  expect(await sparesBox.locator('.hint-field').count()).toBe(0);
  await shot(host, 'buff8b-editor-spares');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'buff8b-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // Гра: сцена 1600 × 900, Оля 375, Петро 360, Іра 390.
  await host.locator('.quiz-list li', { hasText: 'Бафи 2' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage8b', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya8b', 375, 812);
  const petro = await open('petro8b', 360, 740);
  const ira = await open('ira8b', 390, 844);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const hostScore = async (nickname: string) => (await row(nickname).locator('.score').textContent())!;
  const scores = async () => ({ Оля: await hostScore('Оля'), Петро: await hostScore('Петро'), Іра: await hostScore('Іра') });
  const response = (nickname: string) => host.locator('.rows li', { has: host.locator('.given') }).filter({ hasText: nickname });
  const reveal = async () => {
    await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
    await click(host, 'Показати відповідь');
    for (const page of phones) await page.locator('section.result').first().waitFor();
  };
  const panel = (page: Page) => page.locator('.buff-panel');
  const answerY = async (page: Page) => Math.round((await field(page, 'Ваша відповідь').boundingBox())!.y);

  // 1. q1: підказка з редактора — одразу й лише в Олі; на сцені значок і сповіщення.
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  for (const page of phones) {
    await page.locator('h1', { hasText: 'Найдовша річка України?' }).waitFor();
    expect(await page.locator('.buff-row .buff-btn').allTextContents()).toEqual(['%', '?', '⇄']);
  }
  await takeBuff(olya, 'Підказка ведучого');
  await panel(olya).getByText('? Тече через Київ', exact).waitFor();
  await shot(olya, 'buff8b-hint-written');
  await expectNoSideScroll(olya, 'buff8b-hint-375');
  await stage.locator('.stage-buffs li').getByText('? Оля', exact).waitFor();
  await stage.locator('.live-notice.is-buff').getByText('Оля: Підказка ведучого', exact).waitFor();
  for (const page of [stage, petro, ira]) expect(await page.content()).not.toContain('Тече через Київ');
  await pickOption(olya, 'Дніпро');
  await pickOption(petro, 'Дніпро');
  await pickOption(ira, 'Дністер');
  await reveal();
  for (const page of [stage, petro, ira]) expect(await page.content()).not.toContain('Тече через Київ');
  await expect.poll(scores).toEqual({ Оля: '100', Петро: '100', Іра: '0' });

  // 2. q2: зал голосує числом; аркуш не зсуває запитання; здогадки лише в Олі.
  await click(host, 'Далі');
  await petro.locator('h1', { hasText: 'Скільки областей' }).waitFor();
  await numericAnswer(petro, '24');
  await numericAnswer(ira, '25');
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await ira.getByText('Відповідь прийнято', exact).waitFor();
  const petroQuestion = await boxOf(petro, 'h1.question');
  await takeBuff(olya, 'Запитання в залі');
  for (const page of [petro, ira]) await page.locator('.vote-sheet').getByText('Оля питає зал: як думаєте?', exact).waitFor();
  await petro.waitForTimeout(300); // аркуш виїжджає 0,2 с: кадр — після анімації
  await shot(petro, 'buff8b-vote-sheet');
  expect(await boxOf(petro, 'h1.question'), 'the vote sheet moved the question').toEqual(petroQuestion);
  expect(await noSideScroll(petro), 'vote sheet: horizontal scroll').toBe(true);
  await vote(petro, '24');
  await panel(olya).getByText('Здогадки залу: 24 ×1', exact).waitFor();
  await vote(ira, '25');
  await panel(olya).getByText('Здогадки залу: 24 ×1, 25 ×1', exact).waitFor();
  await shot(olya, 'buff8b-vote-guesses');
  expect(await bodyText(stage)).not.toContain('Здогадки');
  expect(await bodyText(ira)).not.toContain('Здогадки');
  await numericAnswer(olya, '24');
  await reveal();
  await expect.poll(scores).toEqual({ Оля: '200', Петро: '200', Іра: '0' });

  // 3. q3: голосувати нікому; підказка від ведучого; заміна в Олі; голос текстом.
  await click(host, 'Далі');
  await ira.locator('h1', { hasText: 'Столиця Галичини?' }).waitFor();
  await tapBuff(ira, 'Запитання в залі', 'Поки ніхто не може проголосувати.');
  await takeBuff(petro, 'Підказка ведучого');
  await panel(petro).getByText('Ведучий думає…', exact).waitFor();
  const petroPanel = await boxOf(petro, '.buff-panel');
  const petroField = await answerY(petro);
  const card = host.locator('.hint-request', { hasText: 'Петро просить підказку' });
  await card.waitFor();
  await shot(host, 'buff8b-hint-request');
  await host.setViewportSize({ width: 375, height: 812 });
  await card.scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'buff8b-hint-request-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await card.locator('textarea').fill('Місто Лева');
  await card.getByRole('button', { name: 'Надіслати', ...exact }).click();
  await panel(petro).getByText('? Місто Лева', exact).waitFor();
  await card.waitFor({ state: 'detached' });
  expect(await answerY(petro), 'the host hint moved the answer field').toBe(petroField);
  expect(await boxOf(petro, '.buff-panel'), 'the host hint resized the panel').toEqual(petroPanel);
  for (const page of [stage, olya, ira]) expect(await page.content()).not.toContain('Місто Лева');
  await takeBuff(olya, 'Заміна запитання');
  await olya.locator('h1', { hasText: 'Чорне море солоніше за Азовське?' }).waitFor();
  for (const name of ['Так', 'Ні']) await olya.getByRole('button', { name, ...exact }).waitFor();
  await olya.locator('.question-meta .spare-tag').getByText('Запасне запитання', exact).waitFor();
  await olya.locator('.buff-why').getByText('⇄ Запасне запитання: щонайменше 20 с', exact).waitFor();
  await shot(olya, 'buff8b-swap-phone');
  await expectNoSideScroll(olya, 'buff8b-swap-375');
  await stage.locator('.stage-buffs li').getByText('⇄ Оля відповідає на запасне', exact).waitFor();
  await stage.locator('h1', { hasText: 'Столиця Галичини?' }).waitFor();
  for (const page of [stage, petro, ira]) expect(await page.content()).not.toContain('Чорне море');
  await shot(stage, 'buff8b-swap-stage');
  await textAnswer(petro, 'Львів');
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await takeBuff(ira, 'Запитання в залі');
  await petro.locator('.vote-sheet').getByText('Іра питає зал: як думаєте?', exact).waitFor();
  expect(await olya.locator('.vote-sheet').count(), 'a player on a spare votes on the main question').toBe(0);
  await vote(petro, 'Львів');
  await panel(ira).getByText('Здогадки залу: Львів ×1', exact).waitFor();
  await textAnswer(ira, 'Львів');
  await click(olya, 'Так');
  await reveal();
  await olya.getByText('Правильна відповідь: Так', exact).waitFor();
  expect(await bodyText(stage)).not.toContain('Чорне море');
  await response('Оля').locator('.spare-tag').getByText('запасне', exact).waitFor();
  expect(await response('Оля').locator('.spare-tag').getAttribute('title')).toBe('Чорне море солоніше за Азовське?');
  expect(await response('Оля').locator('.given').textContent()).toBe('Так');
  await shot(host, 'buff8b-swap-reveal-host');
  await expect.poll(scores).toEqual({ Оля: '300', Петро: '300', Іра: '100' });

  // 4. q4 (8 с): Іра просить підказку, ведучий «Підказав уголос»; заміна Петра чекає 20 с, ведучий не чекає.
  await click(host, 'Далі');
  await ira.locator('h1', { hasText: 'Найвища гора України?' }).waitFor();
  await takeBuff(ira, 'Підказка ведучого');
  await panel(ira).getByText('Ведучий думає…', exact).waitFor();
  await host.locator('.hint-request', { hasText: 'Іра просить підказку' }).getByRole('button', { name: 'Підказав уголос', ...exact }).click();
  await panel(ira).getByText('Ведучий підказав уголос', exact).waitFor();
  await takeBuff(petro, 'Заміна запитання');
  await petro.locator('h1', { hasText: 'Столиця Буковини?' }).waitFor();
  await field(petro, 'Ваша відповідь').waitFor();
  expect(await seconds(petro)).toBeGreaterThanOrEqual(17);
  await pickOption(olya, 'Говерла');
  await pickOption(ira, 'Говерла');
  const stageWait = stage.locator('.buff-wait');
  await stageWait.waitFor({ timeout: 10000 });
  expect(await stageWait.textContent()).toMatch(/^Чекаємо: Петро · 0:1\d$/);
  await shot(stage, 'buff8b-swap-wait-stage');
  await click(host, 'Не чекати');
  await reveal();
  await expect.poll(scores).toEqual({ Оля: '400', Петро: '300', Іра: '200' });

  // 5. Поле: голосують усі, крім вибравшого; заміна на полі — запасне бачать усі.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  const cell = (page: Page, category: string, price: number) => page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(olya, 'Міста', 100).click();
  await olya.locator('h1', { hasText: 'Міста 100' }).waitFor();
  await pickOption(olya, 'Київ');
  await click(host, 'Прийняти');
  await olya.getByText('Правильно!').waitFor();
  await expect.poll(scores).toEqual({ Оля: '500', Петро: '300', Іра: '200' });
  await toBoard();

  await petro.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(petro, 'Річки', 100).click();
  for (const page of phones) await page.locator('h1', { hasText: 'Річки 100' }).waitFor();
  await takeBuff(petro, 'Запитання в залі');
  for (const page of [olya, ira]) await page.locator('.vote-sheet').getByText('Петро питає зал: як думаєте?', exact).waitFor();
  await olya.waitForTimeout(300);
  await expectNoSideScroll(olya, 'buff8b-vote-board-375');
  await vote(olya, 'Київ');
  await vote(ira, 'Київ');
  await panel(petro).locator('.vote-row', { hasText: 'Київ' }).locator('.vote-pct').getByText('100 %', exact).waitFor();
  await shot(petro, 'buff8b-vote-board-pct');
  // Усі варіанти влазять у панель сталої висоти: прокрутки всередині немає.
  expect(await panel(petro).evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  expect(await bodyText(stage)).not.toContain(' %');
  await pickOption(petro, 'Київ');
  await click(host, 'Прийняти');
  await petro.getByText('Правильно!').waitFor();
  await expect.poll(scores).toEqual({ Оля: '500', Петро: '400', Іра: '200' });
  await toBoard();

  await ira.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(ira, 'Гори', 100).click();
  await ira.locator('h1', { hasText: 'Гори 100' }).waitFor();
  await takeBuff(ira, 'Заміна запитання');
  for (const page of [stage, ...phones]) await page.locator('h1', { hasText: 'Скільки днів у високосному році?' }).waitFor();
  await stage.locator('.stage-buffs li').getByText('⇄ Іра: запасне запитання', exact).waitFor();
  await shot(stage, 'buff8b-swap-board-stage');
  await numericAnswer(ira, '366');
  await click(host, 'Прийняти');
  await ira.getByText('Правильно!').waitFor();
  await expect.poll(scores).toEqual({ Оля: '500', Петро: '400', Іра: '300' });

  // 6. Історія: та сама таблиця; запасні з текстом і відповіддю, значки бафів.
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();
  await expectNoSideScroll(olya, 'buff8b-phone-375');
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Бафи 2/ }).click();
  const standings = host.locator('.standings li');
  await standings.first().waitFor();
  const table: [string, string][] = [];
  for (let i = 0; i < (await standings.count()); i++) {
    table.push([(await standings.nth(i).locator('.name').textContent())!, (await standings.nth(i).locator('.score').textContent())!]);
  }
  expect(table).toEqual([
    ['Оля', '500'],
    ['Петро', '400'],
    ['Іра', '300'],
  ]);
  await host.evaluate("document.querySelectorAll('details.responses').forEach((d) => { d.open = true; })");
  const line = (question: string, nickname: string) =>
    host
      .locator('.rows.stacked > li', { hasText: question })
      .locator('details.responses li', { has: host.locator('.responses-name', { hasText: nickname }) });
  expect(await line('Найдовша річка', 'Оля').locator('.buff-tag').allTextContents()).toEqual(['?']);
  const olyaSpare = line('Столиця Галичини', 'Оля');
  expect(await olyaSpare.locator('.buff-tag').allTextContents()).toEqual(['⇄']);
  expect(await olyaSpare.locator('.spare-tag').textContent()).toBe('запасне');
  expect(await olyaSpare.locator('.spare-text').textContent()).toBe('Запасне: Чорне море солоніше за Азовське?');
  expect(await olyaSpare.locator('.responses-answer').textContent()).toBe('Так');
  const iraSpare = line('Гори 100', 'Іра');
  expect(await iraSpare.locator('.spare-text').textContent()).toBe('Запасне: Скільки днів у високосному році?');
  expect(await iraSpare.locator('.responses-answer').textContent()).toBe('366');
  await shot(host, 'buff8b-history-host');

  expect(problems).toEqual([]);
}

it('part 8c: «Раунд N» on the stage and phones, «Запитання N» with the timer after it, ±15 s during a splash, a pause mid-splash, a flipping cell, «Дуель!», a festive final with a reconnect mid-splash, «Підсумки» before the podium, reduced motion', async () => {
  try {
    await transitionsGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function transitionsGame() {
  const host = await open('host8c', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host8c@example.com');

  const choice = (id: string, text: string, timeLimit: number, options: string[]) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit,
    points: 100,
    options: options.map((option, at) => ({ id: `${id}o${at}`, text: option })),
    correctId: `${id}o0`,
  });
  const LONG_ROUND = 'Столиці дуже далеких і дуже цікавих країн світу';
  const cellQ = (category: string, price: number) => ({
    ...withPoints(withId(single, `b-${category}-${price}`), price),
    text: `${category} ${price}: столиця України?`,
    timeLimit: 20,
  });
  const rounds = [
    classicRound(
      'r1',
      [
        choice('q1', 'Столиця Франції?', 20, ['Париж', 'Ліон', 'Марсель']),
        choice('q2', 'Столиця Італії?', 20, ['Рим', 'Мілан', 'Неаполь']),
        choice('q3', 'Столиця Іспанії?', 20, ['Мадрид', 'Барселона', 'Севілья']),
      ],
      { title: LONG_ROUND, speedBonus: false },
    ),
    boardRound(
      'r2',
      ['Міста', 'Річки', 'Гори'].map((title) => ({
        title,
        cells: [100, 200, 300].map((price) =>
          title === 'Міста' && price === 300 ? { question: cellQ(title, price), mark: 'x2' as const } : cellQ(title, price),
        ),
      })),
      { title: 'Поле', answerMode: 'phone', check: 'auto' },
    ),
    finalRound('r3', choice('f1', 'Перша людина в космосі?', 30, ['Гагарін', 'Армстронг']), { title: 'Космос' }),
  ];
  const duels = {
    categories: [
      {
        id: 'dc1',
        title: 'Мови',
        questions: [
          { id: 'd1', text: 'Hello українською?', accepted: ['привіт'] },
          { id: 'd2', text: 'Thank you українською?', accepted: ['дякую'] },
        ],
      },
    ],
    questionsPerDuel: 1,
    timeLimit: 20,
    stake: 0,
  };
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end' }), title: 'Переходи', duels };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Гра: сцена 1600 × 900, Оля 375, Петро 360, Іра 390 з «менше руху».
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Переходи' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage8c', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya8c', 375, 812);
  const petro = await open('petro8c', 360, 740);
  const calm = await open('calm8c', 390, 844, { reducedMotion: 'reduce' });
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(calm, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, calm];
  const all = [stage, ...phones];
  const splashText = async (page: Page) => (await page.locator('.splash').textContent()) ?? '';
  const reveal = async () => {
    await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
    await click(host, 'Показати відповідь');
    for (const page of phones) await page.locator('section.result').first().waitFor();
  };

  // 1. «Раунд 1» з довгою назвою на сцені й меншим шаром на телефоні; пульт вільний.
  await click(host, 'Почати гру');
  await splashOn(stage, 'round');
  expect(await splashText(stage)).toContain('Раунд 1');
  expect(await splashText(stage)).toContain(LONG_ROUND);
  await olya.locator('.splash.is-round.is-phone').waitFor();
  expect(await noSideScroll(olya), 'transition8c-round-375: horizontal scroll').toBe(true);
  expect(await host.locator('.splash').count(), 'the host console is covered').toBe(0);
  await host.getByText('На екрані заставка', exact).waitFor();
  // 11b: «Почати раунд» на місці, але чекає 3 с після кінця заставки — неактивна й заповнюється.
  const startRound = host.getByRole('button', { name: 'Почати раунд', ...exact });
  expect(await startRound.isDisabled()).toBe(true);
  expect(await startRound.getAttribute('class')).toContain('is-pacing');
  await Promise.all([shot(stage, 'transition8c-round-stage', { splash: true }), shot(olya, 'transition8c-round-375', { splash: true })]);
  await afterSplash(stage, olya);
  await stage.locator('.round-facts', { hasText: '3 запитання · 20 с' }).waitFor();
  expect(await stage.locator('.splash').count()).toBe(0);
  await host.getByText('На екрані заставка', exact).waitFor({ state: 'detached' });

  // 2. «Запитання 1 з 3»; запитання вже стоїть під шаром і не зсувається; таймер — повний після заставки.
  await click(host, 'Почати раунд');
  await splashOn(stage, 'question');
  await olya.locator('.splash.is-question.is-phone').waitFor();
  const under = (await olya.evaluate(
    "(() => ({ splash: document.querySelector('.splash') !== null, y: Math.round(document.querySelector('h1.question').getBoundingClientRect().top) }))()",
  )) as { splash: boolean; y: number };
  expect(under.splash, 'the question was measured after the splash').toBe(true);
  expect(await splashText(stage)).toContain('Запитання 1');
  expect(await splashText(stage)).toContain('з 3');
  await petro.locator('.splash.is-question.is-phone').waitFor();
  await Promise.all([shot(stage, 'transition8c-question-stage', { splash: true }), shot(petro, 'transition8c-question-360', { splash: true })]);
  await afterSplash(olya, stage);
  expect(Math.round((await olya.locator('h1.question').boundingBox())!.y), 'the question moved after the splash').toBe(under.y);
  expect(await seconds(olya)).toBeGreaterThanOrEqual(19);
  expect(await seconds(stage)).toBeGreaterThanOrEqual(19);
  for (const page of phones) await pickOption(page, 'Париж');
  await reveal();

  // 3. «+15 с» посеред заставки рахується від старту запитання.
  await click(host, 'Далі');
  await splashOn(stage, 'question');
  await click(host, '+15 с');
  await afterSplash(stage);
  expect(await host.getByRole('alert').count(), 'the host got an error for +15 s').toBe(0);
  expect(await seconds(stage)).toBeGreaterThanOrEqual(34);
  await afterSplash(...phones);
  await pickOption(olya, 'Рим');
  await pickOption(petro, 'Рим');
  await pickOption(calm, 'Неаполь');
  await reveal();

  // Пауза посеред заставки: шару немає; після «Продовжити» догравається решта, таймер повний.
  await click(host, 'Далі');
  await host.getByRole('button', { name: 'Пауза', ...exact }).first().click();
  await stage.locator('.banner', { hasText: 'Пауза' }).waitFor();
  for (const page of all) expect(await page.locator('.splash').count(), 'a splash during the pause').toBe(0);
  await shot(stage, 'transition8c-paused-stage');
  await stage.waitForTimeout(2000);
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();
  await splashOn(stage, 'question');
  expect(await splashText(stage)).toContain('Запитання 3');
  await afterSplash(...all);
  expect(await seconds(stage)).toBeGreaterThanOrEqual(19);
  for (const page of phones) await pickOption(page, 'Мадрид');
  await reveal();

  // 4. «Раунд 2» — у Іри лише проявлення; поле; клітинка перегортається.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await splashOn(stage, 'round');
  await splashOn(calm, 'round');
  const motion = (await calm.evaluate(
    "(() => ({ layer: getComputedStyle(document.querySelector('.splash')).animationName, card: getComputedStyle(document.querySelector('.splash-card')).animationName }))()",
  )) as { layer: string; card: string };
  expect(motion).toEqual({ layer: 'splash-fade', card: 'none' });
  await shot(calm, 'transition8c-reduced-390', { splash: true });
  await afterSplash(...all);
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await olya.getByRole('button', { name: 'Міста, 300', ...exact }).click();
  await splashOn(stage, 'cell');
  await olya.locator('.splash.is-cell.is-phone').waitFor();
  const flip = (await stage.locator('.splash-flip').textContent()) ?? '';
  expect(flip).toContain('Міста · 300');
  // План 9a: позначка — сюрприз наприкінці перегортання, штамп «×2!» поверх картки.
  await stage.locator('.splash-surprise', { hasText: '×2!' }).waitFor();
  await Promise.all([shot(stage, 'transition8c-cell-stage', { splash: true }), shot(olya, 'transition8c-cell-375', { splash: true })]);
  await afterSplash(...all);
  expect(await seconds(olya)).toBeGreaterThanOrEqual(19);
  await pickOption(olya, 'Київ');
  await click(host, 'Прийняти');
  await olya.getByText('Правильно!').waitFor();

  // 5. «Дуель!»: категорію ведучий вибирає ще під час заставки (у претендентки кнопки вимкнені), таймер дуелі стартує після неї.
  await duelButton(olya).click();
  await olya.getByRole('dialog').getByRole('button', { name: 'Петро', ...exact }).click();
  await host.getByText('Оголошено дуель: Оля — Петро', exact).waitFor();
  await click(host, 'Почати дуель');
  await splashOn(stage, 'duel');
  // Претендентка під шаром «Дуель!» наосліп категорію не вибере: кнопки вимкнені, вибирає ведучий.
  await olya.locator('.splash.is-duel.is-phone').waitFor();
  expect(await olya.getByRole('button', { name: 'Мови · лишилося 2', ...exact }).isDisabled(), 'a category under the splash').toBe(true);
  rigged.push(1);
  await host.locator('.duel-host').getByRole('button', { name: 'Мови · лишилося 2', ...exact }).click();
  const pair = await splashText(stage);
  for (const part of ['Дуель!', 'Оля', '⚔', 'Петро']) expect(pair).toContain(part);
  await petro.locator('.splash.is-duel.is-phone').waitFor();
  await Promise.all([shot(stage, 'transition8c-duel-stage', { splash: true }), shot(petro, 'transition8c-duel-360', { splash: true })]);
  await afterSplash(stage);
  await stage.locator('.duel-stage-question', { hasText: 'Hello українською?' }).waitFor();
  expect(await seconds(stage)).toBeGreaterThanOrEqual(19);
  await afterSplash(olya);
  await duelAnswer(olya, 'привіт');
  await stage.locator('.duel-stage-score', { hasText: '1 : 0' }).waitFor();
  await click(host, 'Підсумок дуелі');
  await click(host, 'Продовжити гру');
  await stage.locator('.duel-stage').waitFor({ state: 'detached' });

  // 6. Фінал: урочиста заставка; телефон перезавантажується посеред неї й продовжує з того самого місця.
  await click(host, 'Завершити раунд');
  await host.getByRole('button', { name: 'Наступний раунд', ...exact }).waitFor();
  expect(await stage.locator('.splash').count(), 'round results have no splash').toBe(0);
  await click(host, 'Наступний раунд');
  await splashOn(stage, 'final');
  const finalSeen = Date.now();
  expect(await splashText(stage)).toContain('Фінал');
  expect(await splashText(stage)).toContain('Космос');
  await stage.locator('.splash-rays').waitFor();
  await shot(stage, 'transition8c-final-stage', { splash: true });
  // Перезавантаження локально триває ~50 мс: спершу частина заставки минає, щоб «з того самого місця» було видно.
  await olya.waitForTimeout(Math.max(0, 600 - (Date.now() - finalSeen)));
  await olya.reload();
  await olya.locator('.splash.is-final').waitFor();
  const style = (await olya.locator('.splash').getAttribute('style')) ?? '';
  const resumedAt = Number.parseFloat(/--splash-elapsed:\s*(-?[\d.]+)ms/.exec(style)?.[1] ?? 'NaN');
  expect(resumedAt, `the final splash started over after the reload: ${style}`).toBeLessThanOrEqual(-300);
  await shot(olya, 'transition8c-final-reconnect-375', { splash: true });
  await afterSplash(...all);
  await click(host, 'Почати фінал');
  // Остання ставка одразу відкриває запитання: підтвердження чекаємо лише в перших двох.
  for (const page of phones) {
    await page.getByLabel('Ставка', exact).fill('0');
    await click(page, 'Поставити');
    if (page !== calm) await page.getByText('Ваша ставка: 0').waitFor();
  }
  await splashOn(stage, 'question');
  expect(await splashText(stage)).toContain('Запитання фіналу');
  expect(await splashText(stage)).not.toContain('з 1');
  await afterSplash(...all);
  expect(await seconds(stage)).toBeGreaterThanOrEqual(29);
  for (const page of phones) await pickOption(page, 'Гагарін');

  // 7. «Підсумки» перед п'єдесталом.
  await click(host, 'Показати відповідь');
  for (let i = 0; i < phones.length; i++) await click(host, 'Наступний гравець');
  await click(host, 'Далі');
  await splashOn(stage, 'podium');
  expect(await splashText(stage)).toContain('Підсумки');
  expect(await splashText(stage)).toContain('Хто ж переміг?');
  await olya.locator('.splash.is-podium.is-phone').waitFor();
  await shot(stage, 'transition8c-podium-stage', { splash: true });
  await afterSplash(stage, olya);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await shot(stage, 'transition8c-podium-after');
  await expectNoSideScroll(olya, 'transition8c-phone-375');

  expect(problems).toEqual([]);
}

it('part 8d: «Як грати» built from the quiz on the stage, phones and host — paging, a reload mid-guide, «До гри», then «Раунд 1»; a round reminder; a tip above the first question of each type with the timer running; the editor flag', async () => {
  try {
    await newcomersGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function newcomersGame() {
  const host = await open('host8d', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host8d@example.com');

  const choice = (id: string, text: string, timeLimit: number, options: string[]) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit,
    points: 100,
    options: options.map((option, at) => ({ id: `${id}o${at}`, text: option })),
    correctId: `${id}o0`,
  });
  const OCEANS = ['Тихий', 'Атлантичний', 'Індійський'];
  const oceans = {
    id: 'q2',
    type: 'order' as const,
    text: 'Розставте океани за площею',
    imageUrl: null,
    video: null,
    timeLimit: 30,
    points: 100,
    items: OCEANS.map((text, at) => ({ id: `q2i${at}`, text })),
    topLabel: 'Найбільший',
    bottomLabel: 'Найменший',
  };
  const rounds = [
    classicRound(
      'r1',
      [choice('q1', 'Столиця Франції?', 20, ['Париж', 'Ліон', 'Марсель']), oceans, choice('q3', 'Столиця Італії?', 20, ['Рим', 'Мілан'])],
      { title: 'Розминка', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES },
    ),
    finalRound('r2', choice('f1', 'Перша людина в космосі?', 30, ['Гагарін', 'Армстронг']), { title: 'Космос', wagerMode: 'bank' }),
  ];
  const duels = {
    categories: [
      {
        id: 'dc1',
        title: 'Мови',
        questions: [
          { id: 'd1', text: 'Hello українською?', accepted: ['привіт'] },
          { id: 'd2', text: 'Thank you українською?', accepted: ['дякую'] },
        ],
      },
    ],
    questionsPerDuel: 1,
    timeLimit: 20,
    stake: 200,
  };
  const data = {
    ...makeRoundsQuiz(rounds, { leaderboard: 'end', newcomers: true, buffs: ['fifty', 'double'], debuffs: ['fog'] }),
    title: 'Для новачків',
    duels,
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Редактор: у «Правилах гри» прапорець «Пояснення для новачків» увімкнений.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Для новачків' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('details.rules > summary', { hasText: 'Правила гри' }).click();
  const flag = host.locator('label.field-check', { hasText: 'Пояснення для новачків' }).locator('input');
  expect(await flag.isChecked(), 'the newcomers flag').toBe(true);
  await shot(host, 'guide8d-editor');
  await host.goto(`${base}/quizzes`);

  // Гра: сцена 1280 × 720, Оля 375, Петро 360.
  await host.locator('.quiz-list li', { hasText: 'Для новачків' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage8d', 1280, 720);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya8d', 375, 812);
  const petro = await open('petro8d', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();
  const phones = [olya, petro];
  const all = [stage, ...phones];
  const kicker = (page: Page) => page.locator('.guide-kicker').textContent();
  const hostButton = (name: string) => host.getByRole('button', { name, ...exact });
  const fitsStage = () => stage.evaluate('document.documentElement.scrollHeight <= innerHeight');
  const reveal = async () => {
    await hostButton('Показати відповідь').waitFor();
    await click(host, 'Показати відповідь');
    for (const page of phones) await page.locator('section.result').first().waitFor();
  };

  // 2. Сторінка 1: «Як грати» до заставки раунду.
  await click(host, 'Почати гру');
  await guideOn(stage, 'Відповідайте з телефона');
  expect(await kicker(stage)).toBe('Як грати · 1 з 6');
  for (const page of phones) await guideOn(page, 'Відповідайте з телефона');
  for (const page of all) expect(await page.locator('.splash').count(), 'a splash before the guide ends').toBe(0);
  for (const name of ['Далі', 'До гри', 'Пауза', 'Завершити гру']) await hostButton(name).waitFor();
  expect(await hostButton('Завершити раунд').count(), 'end round in the guide').toBe(0);
  expect(await fitsStage(), 'guide8d-phone-page-stage: vertical scroll').toBe(true);
  await Promise.all([shot(stage, 'guide8d-phone-page-stage'), shot(olya, 'guide8d-phone-page-375'), shot(host, 'guide8d-host')]);

  // 3. Раунди: класика й фінал із банком; на телефоні без значків.
  await click(host, 'Далі');
  await guideOn(stage, 'Раунди цієї гри');
  const stageGuide = stage.locator('.guide');
  for (const name of ['Класичний', 'Фінал']) await stageGuide.locator('.guide-name', { hasText: name }).waitFor();
  expect(await stageGuide.textContent()).toContain('віддає ставку в спільний банк');
  await guideOn(olya, 'Раунди цієї гри');
  for (const name of ['Класичний', 'Фінал']) await olya.locator('.guide-name', { hasText: name }).waitFor();
  expect(await olya.locator('.guide-icon').count(), 'icons on the phone').toBe(0);
  expect(await fitsStage(), 'guide8d-rounds-stage: vertical scroll').toBe(true);
  await Promise.all([shot(stage, 'guide8d-rounds-stage'), shot(olya, 'guide8d-rounds-375')]);

  // 4. Перезавантаження посеред «Як грати» — та сама сторінка.
  await olya.reload();
  await guideOn(olya, 'Раунди цієї гри');
  expect(await kicker(olya)).toContain('2 з 6');

  // 5. Типи запитань з підписом порядку.
  await click(host, 'Далі');
  for (const page of all) {
    await guideOn(page, 'Типи запитань');
    const text = (await page.locator('.guide').textContent()) ?? '';
    expect(text).toContain('Торкніться одного правильного варіанта.');
    expect(text).toContain('Розставте рядки стрілками ↑ ↓ (зверху — найбільший) і натисніть «Відповісти».');
  }
  expect(await noSideScroll(olya), 'guide8d-types-375: horizontal scroll').toBe(true);
  expect(await noSideScroll(petro), 'guide8d-types-360: horizontal scroll').toBe(true);
  expect(await fitsStage(), 'guide8d-types-stage: vertical scroll').toBe(true);
  await Promise.all([shot(stage, 'guide8d-types-stage'), shot(olya, 'guide8d-types-375'), shot(petro, 'guide8d-types-360')]);

  // 6. Бафи; пауза ховає «Далі» й «До гри», сторінка та сама.
  await click(host, 'Далі');
  await guideOn(stage, 'Бафи — ваші допомоги');
  const buffsText = (await stageGuide.textContent()) ?? '';
  for (const part of ['50/50', 'Подвійні бали', 'Кнопки — під запитанням']) expect(buffsText).toContain(part);
  expect(buffsText).not.toContain('Заміна запитання');
  expect(await fitsStage(), 'guide8d-buffs-stage: vertical scroll').toBe(true);
  await shot(stage, 'guide8d-buffs-stage');
  await hostButton('Пауза').click();
  await stage.locator('.banner', { hasText: 'Пауза' }).waitFor();
  await hostButton('Далі').waitFor({ state: 'detached' });
  expect(await hostButton('До гри').count(), '«До гри» on pause').toBe(0);
  await hostButton('Продовжити').click();
  await hostButton('Далі').waitFor();
  await hostButton('До гри').waitFor();
  await guideOn(stage, 'Бафи — ваші допомоги');
  expect(await kicker(stage)).toBe('Як грати · 4 з 6');

  // 7. «До гри» → заставка «Раунд 1» → пам'ятка раунду.
  await click(host, 'До гри');
  await splashOn(stage, 'round');
  expect((await stage.locator('.splash').textContent()) ?? '').toContain('Раунд 1');
  await afterSplash(stage, olya, petro);
  for (const page of [stage, olya]) {
    const text = await page.locator('body').innerText();
    expect(text).toContain('Як проходить раунд');
    expect(text).toContain('Запитання йдуть по черзі');
  }
  expect(await noSideScroll(olya), 'guide8d-reminder-375: horizontal scroll').toBe(true);
  await Promise.all([shot(stage, 'guide8d-reminder-stage'), shot(olya, 'guide8d-reminder-375')]);

  // 8. Підказка над першим single: з першої миті, таймер іде, відповідь приймається.
  await click(host, 'Почати раунд');
  await splashOn(stage, 'question');
  await olya.locator('.splash.is-question.is-phone').waitFor();
  const under = (await olya.evaluate(
    "(() => ({ splash: document.querySelector('.splash') !== null, tip: document.querySelector('.type-tip') !== null, y: Math.round(document.querySelector('h1.question').getBoundingClientRect().top) }))()",
  )) as { splash: boolean; tip: boolean; y: number };
  expect(under.splash, 'the question was measured after the splash').toBe(true);
  expect(under.tip, 'the tip is there under the splash').toBe(true);
  await afterSplash(...all);
  expect(Math.round((await olya.locator('h1.question').boundingBox())!.y), 'the question moved after the splash').toBe(under.y);
  for (const page of phones) expect(await page.locator('.type-tip').textContent()).toContain('Торкніться одного правильного варіанта.');
  expect(await stage.locator('.type-tip').count(), 'a tip on the stage').toBe(0);
  const before = await seconds(olya);
  await olya.waitForTimeout(2000);
  expect(await seconds(olya), 'the timer stopped for the tip').toBeLessThan(before);
  expect(await noSideScroll(olya), 'guide8d-tip-single-375: horizontal scroll').toBe(true);
  await shot(olya, 'guide8d-tip-single-375');
  for (const page of phones) await pickOption(page, 'Париж');
  await reveal();

  // 9. Порядок: підказка з підписом верху.
  await click(host, 'Далі');
  await afterSplash(...all);
  await olya.locator('h1.question', { hasText: 'Розставте океани за площею' }).waitFor();
  expect(await olya.locator('.type-tip').textContent()).toContain('зверху — найбільший');
  expect(await noSideScroll(olya), 'guide8d-tip-order-375: horizontal scroll').toBe(true);
  expect(await noSideScroll(petro), 'guide8d-tip-order-360: horizontal scroll').toBe(true);
  await Promise.all([shot(olya, 'guide8d-tip-order-375'), shot(petro, 'guide8d-tip-order-360')]);
  for (const page of phones) {
    await arrange(page, OCEANS);
    await click(page, 'Відповісти');
  }
  await reveal();

  // 10. Повторний тип — без підказки.
  await click(host, 'Далі');
  await afterSplash(...all);
  await olya.locator('h1.question', { hasText: 'Столиця Італії?' }).waitFor();
  for (const page of phones) expect(await page.locator('.type-tip').count(), 'a tip for a repeated type').toBe(0);
  for (const page of phones) await pickOption(page, 'Рим');
  await reveal();

  // 11. Фінал: пам'ятка зі ставкою, підказки немає.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await splashOn(stage, 'final');
  await afterSplash(...all);
  const finalText = await stage.locator('body').innerText();
  expect(finalText).toContain('Як проходить раунд');
  expect(finalText).toContain('Спершу таємна ставка');
  expect(await fitsStage(), 'guide8d-reminder-final-stage: vertical scroll').toBe(true);
  await shot(stage, 'guide8d-reminder-final-stage');
  await click(host, 'Почати фінал');
  // Остання ставка одразу відкриває запитання: підтвердження чекаємо лише в першій.
  await olya.getByLabel('Ставка', exact).fill('0');
  await click(olya, 'Поставити');
  await olya.getByText('Ваша ставка: 0').waitFor();
  await petro.getByLabel('Ставка', exact).fill('0');
  await click(petro, 'Поставити');
  await splashOn(stage, 'question');
  await afterSplash(...all);
  await olya.locator('h1.question', { hasText: 'Перша людина в космосі?' }).waitFor();
  for (const page of phones) expect(await page.locator('.type-tip').count(), 'a tip in the final').toBe(0);
  for (const page of phones) await pickOption(page, 'Гагарін');
  await click(host, 'Показати відповідь');
  for (let i = 0; i < phones.length; i++) await click(host, 'Наступний гравець');
  await click(host, 'Далі');
  await splashOn(stage, 'podium');
  await afterSplash(stage);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  expect(problems).toEqual([]);
}

it('part 8d: the densest «Як грати» pages — four kinds of rounds, five question types, all eight buffs, six debuffs and duels — fit the 1280×720 stage without scrolling', async () => {
  try {
    await denseGuide();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function denseGuide() {
  const host = await open('host8d2', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host8d2@example.com');
  const cells = ['Міста', 'Річки', 'Гори'].map((title, column) => ({
    title,
    cells: [100, 200, 300].map((price) => withPoints(withId(single, `b-${column}-${price}`), price)),
  }));
  const rounds = [
    classicRound('r1', [single, multi, boolQ, textQ, numericQ, { ...order, topLabel: 'Захід', bottomLabel: 'Схід' }, matchQ]),
    blitzRound('r2', [withId(single, 'z1'), withId(single, 'z2')]),
    boardRound('r3', cells),
    finalRound('r4', withId(single, 'f1'), { wagerMode: 'bank' }),
  ];
  const data = {
    ...makeRoundsQuiz(rounds, {
      newcomers: true,
      buffs: ['fifty', 'double', 'retry', 'time', 'shield', 'audience', 'hint', 'swap'],
      debuffs: ['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud'],
    }),
    title: 'Щільний гайд',
    spares: [withId(single, 's1')],
    duels: duelPool,
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Щільний гайд' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage8d2', 1280, 720);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya8d2', 375, 812);
  await join(olya, code, 'Оля', false);
  await stage.getByText('Оля').waitFor();

  await click(host, 'Почати гру');
  const pages: [string, string, number][] = [
    ['Відповідайте з телефона', 'phone', 0],
    ['Раунди цієї гри', 'rounds', 4],
    ['Типи запитань', 'types-5', 5],
    ['Типи запитань', 'types-2', 2],
    ['Бафи — ваші допомоги', 'buffs-8', 8],
    ['Дебафи', 'debuffs-6', 6],
    ['Дуелі', 'duels', 0],
  ];
  for (const [at, [title, name, items]] of pages.entries()) {
    await stage.locator('.guide-kicker', { hasText: `${at + 1} з ${pages.length}` }).waitFor();
    await guideOn(stage, title);
    expect(await stage.locator('.guide-item').count(), `guide8d-dense-${name}: items`).toBe(items);
    await shot(stage, `guide8d-dense-${name}-stage`);
    expect(await stage.evaluate('document.documentElement.scrollHeight <= innerHeight'), `guide8d-dense-${name}-stage: vertical scroll`).toBe(true);
    if (at < pages.length - 1) await click(host, 'Далі');
  }
  expect(await stage.locator('.guide').textContent()).toContain('Викликати можна до фіналу.');
  await click(host, 'До гри');
  await stage.locator('.splash').first().waitFor();

  expect(problems).toEqual([]);
}
