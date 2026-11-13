import { boardRound, classicRound, makeRoundsQuiz, single, withId, withPoints } from '@quiz/engine/testing';
import { DEFAULT_RULES } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { open, click, field, seconds, join, bodyText, expectNoSideScroll, register, yOf, POLL, type Box, overlaps, expectApart, wipeWithMouse, sortCard, sortZoneBoxes, sortBy, buffButton, takeBuff, tapBuff, pickOption, boxOf, textAnswer, vote, splashOn, RESTARTING_TEXT, COVERED, HEADER_ONE_LINE } from './helpers/common';
import { exact, ctx, base, problems, snapshot, afterSplash, shot, restart, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 9: 50/50 і глядачі, перезапуск сервера, купівля дебафів, запасні запитання табло.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 9a: 50/50 struck through for the taker and on the stage for a board cell, the audience with +15 s and a folding sheet, buffs on a voice cell, «?» help and exact reasons, «Таблиця» at any time, hidden ×2 with a «×2!» surprise, board sorting for everybody with equal zones, «До меню» after the game', async () => {
  try {
    await afterThirdGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Тексти прибраних 50/50 варіантів без позначки «прибрано», літери й тексту для читачів екрана. */
async function removedTexts(page: Page): Promise<string[]> {
  return page.locator('.choice.is-removed').evaluateAll((els) =>
    els.map((el) => {
      const copy = el.cloneNode(true) as typeof el;
      copy.querySelectorAll('.removed-tag, .sr-only, .letter').forEach((node: { remove: () => void }) => node.remove());
      return (copy.textContent ?? '').trim();
    }),
  );
}

async function afterThirdGame() {
  const host = await open('host9a', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host9a@example.com');

  const options = (id: string, texts: string[]) => texts.map((text, at) => ({ id: `${id}o${at}`, text }));
  const choice = (id: string, text: string, texts: string[], points = 100) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit: 30,
    points,
    options: options(id, texts),
    correctId: `${id}o0`,
  });
  const q1 = choice('q1', 'Найбільше озеро України?', ['Ялпуг', 'Світязь', 'Синевир', 'Кагул']);
  const q2 = {
    id: 'q2',
    type: 'multi' as const,
    text: 'Які міста стоять на Дніпрі?',
    imageUrl: null,
    video: null,
    timeLimit: 30,
    points: 100,
    options: options('q2', ['Київ', 'Дніпро', 'Черкаси', 'Львів', 'Ужгород', 'Одеса']),
    correctIds: ['q2o0', 'q2o1', 'q2o2'],
  };
  const q3 = { id: 'q3', type: 'text' as const, text: 'Столиця Франції?', imageUrl: null, video: null, timeLimit: 30, points: 100, accepted: ['Париж'] };
  /** Правильна категорія кожного слова: лише в тесті. */
  const where: Record<string, string> = {};
  const sortCategories = ['Овочі', 'Фрукти', 'Ягоди'];
  const sortPairs: [string, number][] = [
    ['Морква', 0],
    ['Яблуко', 1],
    ['Малина', 2],
    ['Буряк', 0],
    ['Груша', 1],
    ['Смородина', 2],
  ];
  for (const [word, at] of sortPairs) where[word] = sortCategories[at]!;
  // 6 слів × 25 = клітинка «Їжа, 150»: ціна сортування — сума за всі слова.
  const sortQ = {
    id: 'b-sort',
    type: 'sort' as const,
    text: 'Овочі, фрукти чи ягоди?',
    imageUrl: null,
    video: null,
    timeLimit: 60,
    points: 25,
    lockSeconds: 1,
    categories: sortCategories.map((text, at) => ({ id: `bs-c${at}`, text })),
    words: sortPairs.map(([text, at], index) => ({ id: `bs-w${index}`, text, categoryId: `bs-c${at}` })),
  };
  const rounds = [
    classicRound('r1', [q1, q2, q3], { title: 'Розминка', speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' } }),
    boardRound(
      'r2',
      [
        {
          title: 'Міста',
          cells: [
            choice('b11', 'Столиця Італії?', ['Рим', 'Мілан', 'Неаполь', 'Турин'], 100),
            { answerMode: 'voice' as const, question: choice('b12', 'Столиця Іспанії?', ['Мадрид', 'Барселона', 'Севілья'], 200) },
            { mark: 'x2' as const, question: choice('b13', 'Столиця Польщі?', ['Варшава', 'Краків', 'Гданськ'], 300) },
          ],
        },
        {
          title: 'Їжа',
          cells: [
            { answerMode: 'phone' as const, question: sortQ },
            { kind: 'blitz' as const, question: choice('b22', 'Борщ — це суп?', ['Так, суп', 'Ні, салат'], 200) },
            choice('b23', 'Головне в варениках з картоплею?', ['Картопля', 'Рис'], 300),
          ],
        },
        { title: 'Гори', cells: [100, 200, 300].map((price) => choice(`b3${price}`, `Гори ${price}: найвища гора України?`, ['Говерла', 'Петрос'], price)) },
      ],
      { title: 'Поле', answerMode: 'phone', check: 'auto', rules: { ...DEFAULT_RULES, penalty: 'minus' } },
    ),
  ];
  const data = {
    ...makeRoundsQuiz(rounds, { leaderboard: 'end', buffs: ['fifty', 'double', 'retry', 'time', 'shield', 'audience', 'hint', 'swap'] }),
    spares: [{ id: 'sp1', type: 'boolean' as const, text: 'Сонце — зірка?', imageUrl: null, video: null, timeLimit: 30, points: 100, correct: true }],
    title: 'Після третьої гри',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Після третьої гри' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage9a', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya9a', 375, 812);
  const petro = await open('petro9a', 360, 740);
  const ira = await open('ira9a', 390, 844);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];
  const all = [stage, host, ...phones];

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const hostScore = async (nickname: string) =>
    Number((await row(nickname).locator('.score').textContent())!.replace('−', '-').replace(/\s/g, ''));
  const reveal = async () => {
    await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
    await click(host, 'Показати відповідь');
    for (const page of phones) await page.locator('section.result').first().waitFor();
  };
  const cell = (page: Page, category: string, price: number) => page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const shown = host.getByRole('button', { name: 'Показати відповідь', ...exact });
  const after = host.getByRole('button', { name: 'Далі', ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 1. q1, класика: «?» — вісім бафів із «Де: …»; 50/50 Олі закреслює два варіанти на місці, інші їх не бачать.
  for (const page of phones) await page.locator('h1', { hasText: 'Найбільше озеро України?' }).waitFor();
  await olya.getByRole('button', { name: 'Що роблять бафи', ...exact }).click();
  const help = olya.locator('.buff-help-sheet');
  await help.getByRole('heading', { name: 'Бафи', ...exact }).waitFor();
  expect(await help.locator('li').count()).toBe(8);
  const wheres = await help.locator('.buff-where').allTextContents();
  expect(wheres).toHaveLength(8);
  for (const line of wheres) expect(line).toMatch(/^Де: /);
  await shot(olya, 'buff9a-help-375');
  await expectNoSideScroll(olya, 'buff9a-help-375');
  await olya.keyboard.press('Escape');
  await help.waitFor({ state: 'detached' });
  const olyaChoices = await yOf(olya);
  await takeBuff(olya, '50/50');
  await expect.poll(() => olya.locator('.choice.is-removed').count()).toBe(2);
  const goneQ1 = await removedTexts(olya);
  expect(goneQ1).not.toContain('Ялпуг');
  for (const text of goneQ1) expect(['Світязь', 'Синевир', 'Кагул']).toContain(text);
  expect(await olya.locator('.choice.is-removed .removed-tag').allTextContents()).toEqual(['прибрано', 'прибрано']);
  expect(await yOf(olya), '50/50 moved the options').toEqual(olyaChoices);
  await shot(olya, 'buff9a-fifty-375');
  await expectNoSideScroll(olya, 'buff9a-fifty-375');
  await stage.locator('.live-notice.is-buff').getByText('Оля: 50/50', exact).waitFor();
  for (const page of [stage, petro, ira]) expect(await page.locator('.choice.is-removed').count(), 'classic: only the taker sees 50/50').toBe(0);
  await pickOption(olya, 'Ялпуг');
  await pickOption(petro, 'Ялпуг');
  await pickOption(ira, 'Світязь');
  await reveal();

  // 2. q2, кілька відповідей: 50/50 Петра прибирає 2 з 3 неправильних.
  await click(host, 'Далі');
  await afterSplash(...all);
  await petro.locator('h1', { hasText: 'Які міста стоять на Дніпрі?' }).waitFor();
  await takeBuff(petro, '50/50');
  await expect.poll(() => petro.locator('.choice.is-removed').count()).toBe(2);
  for (const text of await removedTexts(petro)) expect(['Львів', 'Ужгород', 'Одеса']).toContain(text);
  await shot(petro, 'buff9a-fifty-multi-360');
  await expectNoSideScroll(petro, 'buff9a-fifty-multi-360');
  for (const page of phones) {
    for (const text of ['Київ', 'Дніпро', 'Черкаси']) await pickOption(page, text);
    await click(page, 'Відповісти');
  }
  await reveal();

  // 3–4. q3: зал дає Олі +15 с; компактний аркуш, що згортається; «Таблиця» в Іри — лише власний рядок.
  await click(host, 'Далі');
  await afterSplash(...all);
  await olya.locator('h1', { hasText: 'Столиця Франції?' }).waitFor();
  await textAnswer(petro, 'Париж');
  await textAnswer(ira, 'Париж');
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await ira.getByText('Відповідь прийнято', exact).waitFor();
  await takeBuff(olya, 'Запитання в залі');
  await expect.poll(async () => (await seconds(olya)) - (await seconds(stage))).toBeGreaterThanOrEqual(14);
  const sheet = petro.locator('.vote-sheet');
  await sheet.getByText('Оля питає зал: як думаєте?', exact).waitFor();
  await petro.waitForTimeout(300);
  const openSheet = await boxOf(petro, '.vote-sheet');
  expect(openSheet.height, 'the vote sheet is taller than 35 % of the screen').toBeLessThanOrEqual(0.35 * 740 + 1);
  await shot(petro, 'buff9a-vote-360');
  await expectNoSideScroll(petro, 'buff9a-vote-360');
  await sheet.getByRole('button', { name: 'Згорнути', ...exact }).click();
  const unfold = sheet.getByRole('button', { name: 'Розгорнути', ...exact });
  await unfold.waitFor();
  expect(await unfold.getAttribute('aria-expanded')).toBe('false');
  expect((await boxOf(petro, '.vote-sheet')).height, 'folding did not shrink the sheet').toBeLessThan(openSheet.height);
  await shot(petro, 'buff9a-vote-folded-360');
  await unfold.click();
  await vote(petro, 'Париж');
  // «Таблиця» поверх запитання: leaderboard end — лише власне місце.
  const iraTitle = await boxOf(ira, 'h1');
  await ira.getByRole('button', { name: 'Таблиця', ...exact }).click();
  const table = ira.locator('.table-sheet');
  await table.getByRole('heading', { name: 'Таблиця', ...exact }).waitFor();
  expect(await table.locator('.score-table tr.score-row').count()).toBe(1);
  expect(await table.locator('.score-table tr.score-row').textContent()).toContain('Іра');
  await table.getByText('Повна таблиця — наприкінці гри.', exact).waitFor();
  await shot(ira, 'buff9a-table-390');
  await expectNoSideScroll(ira, 'buff9a-table-390');
  await table.locator('h2').click();
  await table.waitFor({ state: 'detached' });
  expect(await boxOf(ira, 'h1'), 'the table moved the question').toEqual(iraTitle);
  // Спільний час минає — чекаємо на Олю, вона відповідає у свій час.
  await stage.locator('.buff-wait', { hasText: /^Чекаємо: Оля · 0:\d\d$/ }).waitFor({ timeout: 40000 });
  await textAnswer(olya, 'Париж');
  await reveal();

  // 5. Поле: позначок немає на сцені й телефонах, у ведучого «×2»; легенда каже, що вони є.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await afterSplash(...all);
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  for (const page of [stage, ...phones]) expect(await page.locator('.gb-mark').count(), 'a mark before the choice').toBe(0);
  await host.locator('.gb-mark', { hasText: '×2' }).first().waitFor();
  const legend = stage.locator('.gb-legend');
  await legend.getByText('×2 — подвійна ціна', exact).waitFor();
  await legend.getByText('Де ×2 і ×3 — сюрприз.', exact).waitFor();
  await shot(stage, 'buff9a-board-stage');
  await shot(olya, 'buff9a-board-375');

  // 6. Оля сортує на полі; Петро, Іра й сцена бачать категорії й усі слова за абеткою (11d: крім слова на картці); зони рівні.
  await cell(olya, 'Їжа', 150).click();
  await afterSplash(...all);
  await olya.locator('.sort-card').waitFor();
  const firstCard = (await sortCard(olya))!;
  const sortWords = ['Буряк', 'Груша', 'Малина', 'Морква', 'Смородина', 'Яблуко'];
  const restWords = sortWords.filter((word) => word !== firstCard);
  for (const page of [petro, ira]) {
    await page.getByText('Оля сортує слова', exact).waitFor();
    expect(await page.locator('.sort-play.is-watching .sort-zone').count()).toBe(3);
    expect(await page.locator('button.sort-zone').count()).toBe(0);
    await expect.poll(() => page.locator('.sort-words li').allTextContents(), POLL).toEqual(restWords);
  }
  await stage.locator('.sort-words li').first().waitFor();
  await expect.poll(() => stage.locator('.sort-words li').allTextContents(), POLL).toEqual(restWords);
  for (const page of [olya, petro]) {
    const zones = await sortZoneBoxes(page);
    expect(zones).toHaveLength(3);
    for (const [, , width, height] of zones) {
      expect(Math.abs(width! - zones[0]![2]!), 'unequal zone widths').toBeLessThanOrEqual(1);
      expect(Math.abs(height! - zones[0]![3]!), 'unequal zone heights').toBeLessThanOrEqual(1);
    }
  }
  // Слова глядачів під ареною, а не поверх неї.
  const arenaBottom = await petro.locator('.sort-arena').evaluate((el) => el.getBoundingClientRect().bottom);
  const wordsTop = await petro.locator('.sort-rest').evaluate((el) => el.getBoundingClientRect().top);
  expect(wordsTop, 'the words overlap the arena').toBeGreaterThanOrEqual(arenaBottom - 0.5);
  await expectNoSideScroll(petro, 'sort9a-watch-360');
  await expectNoSideScroll(olya, 'sort9a-play-375');
  await Promise.all([shot(petro, 'sort9a-watch-360'), shot(olya, 'sort9a-play-375'), shot(stage, 'sort9a-stage')]);
  // Сортування на полі — без бафів: ряд є, усі кнопки неактивні з причиною.
  for (const button of await olya.locator('.buff-row .buff-btn').all()) expect(await button.getAttribute('aria-disabled')).toBe('true');
  await tapBuff(olya, 'Подвійні бали', 'На сортуванні бафів немає.');
  // Кожне слово в картці посередині «хреста» — цілим рядком, без розриву посеред слова.
  const cardLines = () =>
    olya.locator('.sort-card').evaluate((card) => {
      const range = card.ownerDocument.createRange();
      range.selectNodeContents(card);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    });
  for (let i = 0; i < sortWords.length; i++) {
    const card = await sortCard(olya);
    if (card === null) break;
    expect(await cardLines(), `«${card}» broke in the card`).toBe(1);
    await sortBy(olya, 'tap', where[card]!);
  }
  await after.waitFor();
  const petroReveal = petro.locator('.sort-reveal.is-open');
  await petroReveal.waitFor();
  for (const category of sortCategories) {
    const column = petroReveal.locator('.sort-reveal-col', { hasText: category });
    for (const word of sortWords.filter((w) => where[w] === category)) await column.getByText(word, exact).waitFor();
  }
  await shot(petro, 'sort9a-reveal-360');
  await toBoard();

  // 7. Усна клітинка Петра: «Друга спроба» пояснює причину, подвійні бали — +400 за ціну 200.
  await petro.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(petro, 'Міста', 200).click();
  await afterSplash(...all);
  await petro.getByText('Відповідайте вголос').waitFor();
  await tapBuff(petro, 'Друга спроба', 'Друга спроба не діє, коли відповідаєте вголос.');
  const petroBefore = await hostScore('Петро');
  await takeBuff(petro, 'Подвійні бали');
  await shot(petro, 'buff9a-voice-360');
  await expectNoSideScroll(petro, 'buff9a-voice-360');
  await host.locator('button.choice', { hasText: 'Мадрид' }).click();
  await host.getByRole('button', { name: /^(Прийняти|Зарахувати)$/ }).first().click();
  await Promise.race([shown.waitFor(), after.waitFor()]);
  if (await shown.isVisible()) await shown.click();
  await expect.poll(() => hostScore('Петро')).toBe(petroBefore + 400);
  await toBoard();

  // 8. Іра: «Міста, 300» — перегортання закінчується «×2!»; її 50/50 видно на сцені, у ведучого й на інших телефонах.
  await ira.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(ira, 'Міста', 300).click();
  await splashOn(stage, 'cell');
  await stage.locator('.splash-surprise', { hasText: '×2!' }).waitFor();
  await ira.locator('.splash-surprise', { hasText: '×2!' }).waitFor();
  await shot(ira, 'buff9a-surprise-390', { splash: true });
  // Штамп з'являється після перегортання (1 с із 1,8 с): кадр сцени — трохи пізніше за середину заставки.
  if (process.env.E2E_SHOTS === '1') await stage.waitForTimeout(250);
  await shot(stage, 'buff9a-surprise-stage', { splash: true });
  await afterSplash(...all);
  expect(await seconds(ira)).toBeGreaterThanOrEqual(19);
  await takeBuff(ira, '50/50');
  for (const page of [stage, host, olya, petro, ira]) {
    await expect.poll(() => page.locator('.choice.is-removed').count(), { message: 'one option removed' }).toBe(1);
    expect(await page.locator('.choice.is-removed .removed-tag').textContent()).toBe('прибрано');
    expect(await removedTexts(page)).not.toContain('Варшава');
  }
  await shot(stage, 'buff9a-board-fifty-stage');
  await shot(host, 'buff9a-board-fifty-host');
  await shot(olya, 'buff9a-board-fifty-375');
  await pickOption(ira, 'Варшава');
  await click(host, 'Прийняти');
  await ira.getByText('Правильно!').waitFor();
  await toBoard();

  // 9. Коло 2 починає Петро: бліц-клітинка — у кожного компактний рядок причини замість ряду бафів, черга лишається на екрані.
  await petro.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(petro, 'Їжа', 200).click();
  await afterSplash(...all);
  for (const page of phones) await page.locator('.buff-off').getByText('На бліц-клітинках бафів немає.', exact).waitFor();
  for (const page of phones) expect(await page.locator('.buff-row').count(), 'a buff row in a blitz cell').toBe(0);
  const queue = await olya.locator('.blitz-queue').boundingBox();
  expect(queue, 'no queue').not.toBeNull();
  expect(queue!.y + queue!.height, 'the queue fell below the screen').toBeLessThanOrEqual(812);
  await expectNoSideScroll(olya, 'buff9a-blitz-375');
  await shot(olya, 'buff9a-blitz-375');
  await olya.getByRole('button', { name: /Так, суп/ }).click();
  const acceptBlitz = host.getByRole('button', { name: 'Прийняти', ...exact });
  await Promise.race([shown.waitFor(), acceptBlitz.waitFor(), after.waitFor()]);
  if (await acceptBlitz.isVisible()) await acceptBlitz.click();
  await Promise.race([shown.waitFor(), after.waitFor()]);
  if (await shown.isVisible()) await shown.click();
  await after.waitFor();

  // 10. Кінець гри: «До меню» в гравця, «До вікторин» і «Історія ігор» у ведучого, мала кнопка на сцені.
  await click(host, 'Завершити гру');
  await afterSplash(...all);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const toMenu = olya.getByRole('link', { name: 'До меню', ...exact });
  await toMenu.waitFor();
  expect(await toMenu.getAttribute('href')).toBe('/');
  expect(await host.getByRole('link', { name: 'До вікторин', ...exact }).getAttribute('href')).toBe('/quizzes');
  expect(await host.getByRole('link', { name: 'Історія ігор', ...exact }).getAttribute('href')).toBe('/history');
  await stage.locator('.stage-menu').waitFor();
  expect(await stage.locator('.stage-menu').getAttribute('href')).toBe('/');
  await expectNoSideScroll(olya, 'menu9a-player-375');
  await Promise.all([shot(olya, 'menu9a-player-375'), shot(host, 'menu9a-host'), shot(stage, 'menu9a-stage')]);
  await toMenu.click();
  await olya.waitForURL(`${base}/`);
  await host.getByRole('link', { name: 'Історія ігор', ...exact }).click();
  await host.waitForURL(/\/history$/);
  await host.getByRole('link', { name: /Після третьої гри/ }).first().waitFor();

  expect(problems).toEqual([]);
}

it('part 9b: the server restarts in the middle of a question — the phones, the stage and the host show «Сервер перезапускається…», come back to a paused question with the answers kept, the host resumes and the game finishes into the history', async () => {
  // Крок 7: телефон на формі входу для коду, якого сервер не знає, тихо питає /slots — 404 там очікуваний.
  flags.slots404Expected = true;
  try {
    await restartGame();
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    flags.slots404Expected = false;
  }
  // Два перезапуски й ціла гра: довше за типові 180 с на повільній машині.
}, 300_000);

async function restartGame() {
  const host = await open('host9b', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host9b@example.com');

  const q1 = {
    id: 'q1',
    type: 'single' as const,
    text: 'Найбільше озеро України?',
    imageUrl: null,
    video: null,
    timeLimit: 60,
    points: 100,
    options: ['Ялпуг', 'Світязь', 'Синевир', 'Кагул'].map((option, at) => ({ id: `q1o${at}`, text: option })),
    correctId: 'q1o0',
  };
  const q2 = { id: 'q2', type: 'text' as const, text: 'Столиця Франції?', imageUrl: null, video: null, timeLimit: 30, points: 100, accepted: ['Париж'] };
  const rounds = [classicRound('r1', [q1, q2], { speedBonus: false, shuffleOptions: false })];
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'each', buffs: ['time'] }), title: 'Перезапуск' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Перезапуск' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage9b', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya9b', 375, 812);
  const petro = await open('petro9b', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();
  const phones = [olya, petro];
  const screens = [olya, petro, stage, host];

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const hostScore = async (nickname: string) => (await row(nickname).locator('.score').textContent())!;
  const scores = async () => ({ Оля: await hostScore('Оля'), Петро: await hostScore('Петро') });

  await click(host, 'Почати гру');
  await afterSplash(stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(stage, ...phones);
  for (const page of phones) await page.locator('h1', { hasText: 'Найбільше озеро України?' }).waitFor();

  // 1. До перезапуску: Оля бере «Додатковий час» і відповідає; Петро ще думає.
  await takeBuff(olya, 'Додатковий час');
  await pickOption(olya, 'Ялпуг');
  await olya.getByText('Відповідь прийнято', exact).waitFor();
  const sentBefore = await olya.locator('section.sent').textContent();
  expect(sentBefore).toContain('Ялпуг');
  const buffBefore = await buffButton(olya, 'Додатковий час').getAttribute('class');
  expect(buffBefore).toContain('is-active');
  const before = await seconds(stage);
  expect(before).toBeGreaterThan(40);

  // 2. Перезапуск: поки сервера немає, усі бачать «Сервер перезапускається…», а не «гри немає».
  await restart(async () => {
    for (const page of screens) await page.getByText(RESTARTING_TEXT, exact).waitFor();
    for (const page of screens) expect(await bodyText(page)).not.toContain('Цієї гри вже немає');
    await shot(olya, 'restart9b-down-375');
    await shot(stage, 'restart9b-down-stage');
    await shot(host, 'restart9b-down-host');
    await expectNoSideScroll(olya, 'restart9b-down-375');
    // Гра лишається під банером.
    await olya.locator('h1', { hasText: 'Найбільше озеро України?' }).waitFor();
  });

  // 3. Після перезапуску: без перезавантаження сторінок — те саме запитання на паузі, відповідь і баф Олі на місці.
  for (const page of screens) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  for (const page of [stage, ...phones]) {
    await page.locator('h1', { hasText: 'Найбільше озеро України?' }).waitFor();
    await page.locator('.banner', { hasText: 'Пауза' }).first().waitFor();
  }
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().waitFor();
  expect(await olya.locator('section.sent').textContent()).toBe(sentBefore);
  expect(await buffButton(olya, 'Додатковий час').getAttribute('class')).toBe(buffBefore);
  const back = await seconds(stage);
  expect(back).toBeLessThanOrEqual(before);
  expect(back).toBeGreaterThanOrEqual(before - 2);
  await stage.waitForTimeout(3000);
  expect(await seconds(stage), 'the paused timer ran').toBe(back);
  for (const page of screens) expect(await bodyText(page)).not.toContain('Цієї гри вже немає');
  await shot(olya, 'restart9b-back-375');
  await shot(stage, 'restart9b-back-stage');
  await shot(host, 'restart9b-back-host');

  // 4. Ведучий продовжує: таймер іде, Петро відповідає, розкриття рахує обох.
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();
  await expect.poll(() => seconds(stage), { timeout: 5000 }).toBeLessThan(back);
  await pickOption(petro, 'Світязь');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await click(host, 'Показати відповідь');
  for (const page of phones) await page.locator('section.result').first().waitFor();
  await olya.getByText('Правильно!').waitFor();
  await petro.getByText('Неправильно').waitFor();
  await expect.poll(scores).toEqual({ Оля: '100', Петро: '0' });

  // 5. Перезавантаження після перезапуску: Петро — тим самим токеном, ведучий — на тому самому пульті.
  await petro.reload();
  await petro.getByText('Неправильно').waitFor();
  expect(await petro.getByLabel('Ваше ім’я', exact).count(), 'Петро got the join form').toBe(0);
  await host.reload();
  // Відхід ведучого (перезавантаження) ставить гру на паузу, як і без перезапуску.
  await host.getByRole('button', { name: 'Продовжити', ...exact }).last().click();
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await expect.poll(scores).toEqual({ Оля: '100', Петро: '0' });

  // 6. Друге запитання й фініш; історія — завершена гра з тими самими балами.
  await click(host, 'Далі');
  await click(host, 'Наступне запитання');
  await afterSplash(stage, ...phones);
  for (const page of phones) {
    await page.locator('h1', { hasText: 'Столиця Франції?' }).waitFor();
    await field(page, 'Ваша відповідь').fill('Париж');
    await click(page, 'Відповісти');
  }
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await click(host, 'Показати відповідь');
  for (const page of phones) await page.getByText('Правильно!').waitFor();
  await expect.poll(scores).toEqual({ Оля: '200', Петро: '100' });
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();

  await host.goto(`${base}/history`);
  const top = host.locator('.quiz-list li').first();
  await top.getByRole('link', { name: 'Перезапуск', ...exact }).waitFor();
  expect(await top.locator('.meta').first().textContent()).toContain('завершено');
  await top.getByRole('link', { name: 'Перезапуск', ...exact }).click();
  const standings = host.locator('.standings li');
  await standings.first().waitFor();
  const table: [string, string][] = [];
  for (let i = 0; i < (await standings.count()); i++) {
    table.push([(await standings.nth(i).locator('.name').textContent())!, (await standings.nth(i).locator('.score').textContent())!]);
  }
  expect(table).toEqual([
    ['Оля', '200'],
    ['Петро', '100'],
  ]);

  // 7. «Цієї гри вже немає» — лише коли сервер справді не знає кімнати: сцена й телефон зі старим токеном.
  let gone = '000000';
  while (ctx.manager.get(gone) !== undefined) gone = String(Number(gone) + 1).padStart(6, '0');
  await stage.goto(stageUrl!.replace(`/stage/${code}`, `/stage/${gone}`));
  await stage.getByText('Цієї гри вже немає', { exact: false }).waitFor();
  await petro.evaluate(([key, token]) => localStorage.setItem(key, token), [`quiz:player:${gone}`, 'stale-token']);
  await petro.goto(`${base}/play/${gone}`);
  await petro.getByText('Цієї гри вже немає', { exact: false }).waitFor();
  expect(await bodyText(petro)).not.toContain('Сервер перезапускається');

  expect(problems).toEqual([]);
}

it('part 9c: a player buys every debuff for a rival with points — prices from the editor, not enough points, one per question, a busy rival, the buyer named on every screen; each debuff is clearly visible on a 375 px phone and the rival still answers; purchases in the history', async () => {
  try {
    await debuffShopGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/**
 * Розкид яскравості (стандартне відхилення luma 0…255) знімка елемента: однотонний «білий екран» дає ~0.
 * Декодування — у самій сторінці (createImageBitmap + canvas), без нових залежностей.
 */
async function lumaSpread(page: Page, selector: string): Promise<number> {
  const png = await page.locator(selector).first().screenshot();
  return (await page.evaluate(`(async () => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(png.toString('base64'))}), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let sum = 0;
    let squares = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += luma;
      squares += luma * luma;
    }
    return Math.sqrt(Math.max(0, squares / n - (sum / n) ** 2));
  })()`)) as number;
}

/**
 * Зсув .debuff-content по x за ~ms, вибірка на кожен кадр (requestAnimationFrame): найбільший |зсув|
 * і частка кадрів у спокої (|зсув| < 0,5 px).
 */
async function shakeSamples(page: Page, ms = 3000): Promise<{ max: number; calm: number }> {
  const xs = (await page.evaluate(`new Promise((done) => {
    const el = document.querySelector('.debuff-content');
    const out = [];
    const end = performance.now() + ${ms};
    const step = () => {
      out.push(parseFloat(getComputedStyle(el).translate) || 0);
      if (performance.now() < end) requestAnimationFrame(step);
      else done(out);
    };
    requestAnimationFrame(step);
  })`)) as number[];
  return { max: Math.max(...xs.map(Math.abs)), calm: xs.filter((x) => Math.abs(x) < 0.5).length / xs.length };
}

/** Висота найвищого видимого гостя, що перетинає зону, px; 0 — немає. */
const TALLEST_GUEST = `(() => {
  const zone = document.querySelector('.debuff-zone').getBoundingClientRect();
  let tallest = 0;
  for (const el of document.querySelectorAll('.debuff-guest')) {
    const r = el.getBoundingClientRect();
    const inside = r.right > zone.left && r.left < zone.right && r.bottom > zone.top && r.top < zone.bottom;
    if (inside && Number(getComputedStyle(el).opacity) > 0.5) tallest = Math.max(tallest, r.height);
  }
  return tallest;
})()`;

const CONTENT_X = `parseFloat(getComputedStyle(document.querySelector('.debuff-content')).translate) || 0`;

async function debuffShopGame() {
  const host = await open('host9c', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host9c@example.com');

  const options = [...single.options, { id: 'd', text: 'Харків' }];
  const questions = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    ...withId(single, `q${n}`),
    options,
    text: `Запитання ${n}: столиця України?`,
    points: 100,
    timeLimit: 30,
  }));
  const data = {
    ...makeRoundsQuiz([classicRound('r1', questions, { speedBonus: false, shuffleOptions: false })], {
      leaderboard: 'each',
      debuffs: ['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud'],
    }),
    title: 'Дебафи',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Редактор: ціни Туману й Тремтіння, решта — плейсхолдер 200.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Дебафи' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('details.powers > summary').click();
  const price = (name: string) => host.locator('.powers-row', { hasText: name }).getByLabel('Ціна, балів', exact);
  await price('Туман').fill('100');
  await price('Тремтіння').fill('150');
  for (const name of ['Заморозка', 'Дзеркало', 'Гості', 'Брудний']) {
    expect(await price(name).inputValue(), name).toBe('');
    expect(await price(name).getAttribute('placeholder'), name).toBe('200');
  }
  await shot(host, 'debuff9c-editor-prices');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'debuff9c-editor-prices-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  await host.locator('.quiz-list li', { hasText: 'Дебафи' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage9c', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya9c', 375, 812);
  const petro = await open('petro9c', 375, 812);
  const ira = await open('ira9c', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const all = [stage, host, olya, petro, ira];

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const rowScore = async (nickname: string) => (await row(nickname).locator('.score').textContent())!;
  const tool = async (nickname: string, kind: 'Бали' | 'Дебаф') => {
    const button = row(nickname).getByRole('button', { name: kind, ...exact });
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await row(nickname).locator('.player-tools').waitFor();
  };
  const give = async (nickname: string, points: number) => {
    await tool(nickname, 'Бали');
    await row(nickname).getByLabel('Своя сума', exact).fill(String(points));
    await row(nickname).getByRole('button', { name: 'Нарахувати', ...exact }).click();
    await expect.poll(() => rowScore(nickname)).toBe(String(points));
  };
  const sheet = (page: Page) => page.getByRole('dialog', { name: 'Дебафи для суперників' });
  const openShop = async (page: Page) => {
    await page.getByRole('button', { name: 'Дебафи', ...exact }).click();
    await sheet(page).waitFor();
  };
  const notice = (page: Page) => page.locator('.live-notice.is-debuff');
  const bought = 'Оля насилає дебаф на гравця Петро';
  /** Покупка в аркуші: дебаф → суперник → «Купити за …»; аркуш закривається, сповіщення в Іри (жертві — ні: банер назве покупця). */
  const buy = async (page: Page, debuff: RegExp, target: string, cost: number) => {
    await openShop(page);
    await sheet(page).locator('.shop-item', { hasText: debuff }).click();
    await sheet(page).locator('.shop-target', { hasText: target }).click();
    await sheet(page).getByRole('button', { name: `Купити за ${cost}`, ...exact }).click();
    await sheet(page).waitFor({ state: 'detached' });
    await notice(ira).getByText(bought, exact).waitFor();
    expect(await notice(petro).count(), 'the victim gets no purchase notice').toBe(0);
  };
  const answer = async (page: Page) => {
    await page.getByRole('button', { name: /Київ/ }).click();
    await page.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
  };
  const everyoneAnswers = async () => {
    await answer(petro);
    await answer(olya);
    await answer(ira);
  };
  const toTable = async () => {
    await click(host, 'Показати відповідь');
    await click(host, 'Далі');
    await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();
  };
  const nextQuestion = async (n: number) => {
    await click(host, 'Наступне запитання');
    await petro.locator('h1', { hasText: `Запитання ${n}:` }).waitFor();
  };

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await host.getByRole('button', { name: 'Почати раунд', ...exact }).waitFor();

  // 1. Без балів: усі шість вимкнені з «Не вистачає балів», ціни 150 / 100 / 200; Escape закриває, фокус на кнопці.
  await openShop(ira);
  const items = sheet(ira).locator('.shop-item');
  expect(await items.count()).toBe(6);
  for (let i = 0; i < 6; i++) {
    expect(await items.nth(i).isDisabled()).toBe(true);
    await items.nth(i).getByText('Не вистачає балів', exact).waitFor();
  }
  expect(await sheet(ira).locator('.shop-item-price').allTextContents()).toEqual(['150', '100', '200', '200', '200', '200']);
  await shot(ira, 'debuff9c-shop-poor-360');
  await expectNoSideScroll(ira, 'debuff9c-shop-poor-360');
  await ira.keyboard.press('Escape');
  await sheet(ira).waitFor({ state: 'detached' });
  expect(await ira.evaluate('document.activeElement?.getAttribute("aria-label")')).toBe('Дебафи');

  // 2–3. Бали Олі від ведучого; покупка Туману для Петра; сповіщення без виду дебафу на кожному екрані.
  await give('Оля', 2000);
  await olya.locator('header.bar .score').getByText('2000', exact).waitFor();
  expect(await olya.evaluate(HEADER_ONE_LINE), 'the phone header wraps at 375').toBe(true);
  await shot(olya, 'debuff9c-header-375');
  await openShop(olya);
  await sheet(olya).locator('.shop-item', { hasText: /Туман/ }).click();
  await sheet(olya).getByText('🌫️ Туман · 100').waitFor();
  await sheet(olya).locator('.shop-target', { hasText: 'Петро' }).click();
  await shot(olya, 'debuff9c-shop-pick-375');
  await expectNoSideScroll(olya, 'debuff9c-shop-pick-375');
  await sheet(olya).getByRole('button', { name: 'Купити за 100', ...exact }).click();
  await sheet(olya).waitFor({ state: 'detached' });
  await olya.locator('header.bar .score').getByText('1900', exact).waitFor();
  for (const page of [stage, host, olya, ira]) {
    await notice(page).getByText(bought, exact).waitFor();
    expect(await notice(page).textContent()).not.toContain('Туман');
  }
  // Жертві сповіщення про покупку немає: її дебаф чекає, а банер, коли спрацює, назве покупця.
  expect(await notice(petro).count(), 'the victim gets no purchase notice').toBe(0);
  await stage.waitForTimeout(300); // сповіщення проявляється 0,25 с
  await shot(stage, 'debuff9c-notice-stage');
  await shot(olya, 'debuff9c-notice-375');
  await expectApart(olya, '.live-notice.is-debuff', ['header.bar'], 'purchase notice 375×812');
  await row('Петро').locator('.debuff-tag').getByText('🌫️ Туман від гравця Оля · чекає', exact).waitFor();
  await tool('Петро', 'Дебаф');
  await row('Петро').getByText('Куплено гравцем — скасувати не можна.', exact).waitFor();
  expect(await host.getByRole('button', { name: 'Скасувати дебаф', ...exact }).count()).toBe(0);
  await shot(host, 'debuff9c-host-row');
  expect(await petro.locator('.debuff-zone').count()).toBe(0);

  // 4. Обмеження: друга покупка Олі в тому ж циклі; Петро вже має дебаф — в Іри він вимкнений.
  await openShop(olya);
  await sheet(olya).getByText('Ви вже купили дебаф до наступного запитання', exact).waitFor();
  for (let i = 0; i < 6; i++) expect(await sheet(olya).locator('.shop-item').nth(i).isDisabled()).toBe(true);
  await olya.keyboard.press('Escape');
  await sheet(olya).waitFor({ state: 'detached' });
  await give('Іра', 300);
  await ira.locator('header.bar .score').getByText('300', exact).waitFor();
  await openShop(ira);
  await sheet(ira).locator('.shop-item', { hasText: /Заморозка/ }).click();
  const petroTarget = sheet(ira).locator('.shop-target', { hasText: 'Петро' });
  expect(await petroTarget.isDisabled()).toBe(true);
  await petroTarget.getByText('Уже має дебаф', exact).waitFor();
  expect(await sheet(ira).locator('.shop-target', { hasText: 'Оля' }).isDisabled()).toBe(false);
  await shot(ira, 'debuff9c-shop-busy-360');
  await ira.keyboard.press('Escape');
  await sheet(ira).waitFor({ state: 'detached' });

  // 5. Туман (Q1): розмито, але не однотонно; протирається; відповідь проходить.
  await click(host, 'Почати раунд');
  await petro.locator('.debuff-zone[data-debuff="fog"]').waitFor();
  await petro.getByText('Оля насилає на вас: Туман', exact).waitFor();
  await afterSplash(...all);
  await olya.locator('.debuff-zone h1', { hasText: 'Запитання 1:' }).waitFor();
  if ((await petro.locator('.debuff-banner').count()) > 0) {
    await expectApart(petro, '.debuff-banner', ['.debuff-zone h1', '.choice'], 'fog banner 375×812');
  }
  const clear = await lumaSpread(olya, '.debuff-zone h1');
  const foggy = await lumaSpread(petro, '.debuff-zone h1');
  console.log(`fog luma spread: ${foggy.toFixed(1)} under fog vs ${clear.toFixed(1)} clear`);
  expect(foggy, `fog spread ${foggy} vs clear ${clear}: a flat wall`).toBeGreaterThan(0.15 * clear);
  expect(foggy, `fog spread ${foggy} vs clear ${clear}: not blurred`).toBeLessThan(0.9 * clear);
  const fogStyle = (await petro.evaluate(`(() => {
    const style = getComputedStyle(document.querySelector('.debuff-fog'));
    return { background: style.backgroundColor, filter: style.backdropFilter || style.webkitBackdropFilter };
  })()`)) as { background: string; filter: string };
  const alpha = /rgba?\(.*[,/]\s*([\d.]+)\)$/.exec(fogStyle.background)?.[1];
  // 23a «без скла»: туман — густіший серпанок (як колишній запасний варіант без розмиття), жодного backdrop-filter.
  expect(Number(alpha ?? 1), fogStyle.background).toBeLessThanOrEqual(0.6);
  expect(fogStyle.filter || 'none').toBe('none');
  await shot(petro, 'debuff9c-fog-375');
  const fogZone = (await petro.locator('.debuff-zone').boundingBox())!;
  await wipeWithMouse(
    petro,
    [0.1, 0.3, 0.5, 0.7, 0.9].map((fx) => [fogZone.x + fogZone.width * fx, fogZone.y + fogZone.height * 0.5]),
  );
  await expect.poll(async () => Number(await petro.locator('.debuff-fog').getAttribute('data-cleared'))).toBeGreaterThan(0);
  await petro.waitForTimeout(100);
  await shot(petro, 'debuff9c-fog-wiped-375');
  await answer(petro);
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await expectNoSideScroll(petro, 'debuff9c-fog-answered-375');
  await answer(olya);
  await answer(ira);
  await toTable();

  // 6. Тремтіння (Q2): сильні поштовхи й спокій між ними.
  await buy(olya, /Тремтіння/, 'Петро', 150);
  await nextQuestion(2);
  await petro.locator('.debuff-zone.is-shake').waitFor();
  await petro.getByText('Оля насилає на вас: Тремтіння екрана', exact).waitFor();
  await afterSplash(...all);
  await petro.waitForFunction(`Math.abs(${CONTENT_X}) > 6`, undefined, { timeout: 4000 });
  await shot(petro, 'debuff9c-shake-burst-375');
  const shake = await shakeSamples(petro);
  console.log(`shake samples: ${JSON.stringify(shake)}`);
  expect(shake.max, `shake ${JSON.stringify(shake)}`).toBeGreaterThanOrEqual(10);
  expect(shake.calm, `shake ${JSON.stringify(shake)}`).toBeGreaterThanOrEqual(0.5);
  // Кадр і відповідь у спокої між поштовхами.
  await petro.waitForFunction(`${CONTENT_X} === 0`);
  await shot(petro, 'debuff9c-shake-375');
  await answer(petro);
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await answer(olya);
  await answer(ira);
  await toTable();

  // 7. Заморозка (Q3): лід на всю зону, відповісти не можна; до 5,5 с лід тане, і відповідь проходить.
  await buy(olya, /Заморозка/, 'Петро', 200);
  await nextQuestion(3);
  // Лід тане через 5 с від кінця заставки «Запитання 3» (since = startedAt), а не від її появи.
  await afterSplash(petro);
  await petro.locator('.debuff-ice').waitFor();
  const kyiv = petro.getByRole('button', { name: /Київ/ });
  expect(await kyiv.isDisabled()).toBe(true);
  expect(await petro.evaluate(COVERED('.debuff-ice'))).toBeGreaterThanOrEqual(0.9);
  await shot(petro, 'debuff9c-freeze-375');
  await petro.locator('fieldset.debuff-content:not([disabled])').waitFor({ timeout: 5500 });
  expect(await kyiv.isDisabled()).toBe(false);
  await shot(petro, 'debuff9c-freeze-thawed-375');
  await answer(petro);
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await answer(olya);
  await answer(ira);
  await toTable();

  // 8. Дзеркало (Q4) на 375×667: банер жертви й сповіщення про бали — одне над одним, остання відповідь видна; перевернуто, але відповісти можна.
  await buy(olya, /Дзеркало/, 'Петро', 200);
  await petro.setViewportSize({ width: 375, height: 667 });
  await tool('Петро', 'Бали');
  await nextQuestion(4);
  await petro.locator('.debuff-banner').waitFor();
  await row('Петро').getByRole('button', { name: '+100', ...exact }).click();
  await petro.locator('.live-notice').waitFor();
  await petro.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  const victim = (await petro.evaluate(`(() => {
    const box = (element) => {
      if (element === null) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const choices = [...document.querySelectorAll('.choice')];
    return {
      banner: box(document.querySelector('.debuff-banner')),
      notices: [...document.querySelectorAll('.live-notice')].map(box),
      content: Math.max(...choices.map((element) => element.getBoundingClientRect().bottom)),
    };
  })()`)) as { banner: Box | null; notices: Box[]; content: number };
  console.log(`victim stack 375×667: ${JSON.stringify(victim)}`);
  await shot(petro, 'debuff9c-victim-notice-375x667');
  expect(victim.banner, 'the debuff banner was gone before the check (3 s)').not.toBeNull();
  expect(victim.notices.length).toBe(1);
  const [pointsNotice] = victim.notices as [Box];
  expect(overlaps(pointsNotice, victim.banner!), 'the notice covers the banner').toBe(false);
  expect(pointsNotice.y + pointsNotice.height <= victim.banner!.y + 0.5, 'the notice is above the banner').toBe(true);
  expect(victim.content <= pointsNotice.y + 0.5, 'the last answer is under the notice').toBe(true);
  await petro.setViewportSize({ width: 375, height: 812 });
  await petro.locator('.debuff-zone.is-mirror').waitFor();
  await afterSplash(...all);
  expect(await petro.evaluate(`getComputedStyle(document.querySelector('.debuff-content')).transform`)).toMatch(/^matrix\(-1/);
  await shot(petro, 'debuff9c-mirror-375');
  await everyoneAnswers();
  await toTable();

  // 9. Гості (Q5): великі, видно протягом 2 с; дотик крізь гостя проходить.
  await buy(olya, /Гості/, 'Петро', 200);
  await nextQuestion(5);
  await petro.locator('.debuff-zone.is-guests').waitFor();
  await afterSplash(...all);
  expect(await petro.locator('.debuff-guest').count()).toBe(5);
  await expect.poll(async () => (await petro.evaluate(TALLEST_GUEST)) as number, { timeout: 2000, interval: 100 }).toBeGreaterThanOrEqual(70);
  await shot(petro, 'debuff9c-guests-375');
  await everyoneAnswers();
  await toTable();

  // 10. Бруд (Q6): шість великих плям, протирання зменшує їх.
  await buy(olya, /Брудний/, 'Петро', 200);
  await nextQuestion(6);
  await petro.locator('.debuff-splat').nth(5).waitFor();
  await afterSplash(...all);
  expect(await petro.locator('.debuff-splat').count()).toBe(6);
  expect(await petro.evaluate(COVERED('.debuff-splat'))).toBeGreaterThanOrEqual(0.25);
  await shot(petro, 'debuff9c-mud-375');
  const mudLeft = async () =>
    ((await petro.evaluate(`[...document.querySelectorAll('.debuff-splat')].map((el) => Number(el.style.opacity))`)) as number[]).reduce(
      (a, b) => a + b,
      0,
    );
  const mudBefore = await mudLeft();
  const splat = (await petro.locator('.debuff-splat').first().boundingBox())!;
  await wipeWithMouse(
    petro,
    Array.from({ length: 4 }, (_, i) => [splat.x + splat.width / 2 + (i % 2 === 0 ? -2 : 2), splat.y + splat.height / 2]),
  );
  await expect.poll(mudLeft).toBeLessThan(mudBefore);
  await petro.waitForTimeout(250);
  await shot(petro, 'debuff9c-mud-wiped-375');
  await answer(petro);
  await petro.getByText('Відповідь прийнято', exact).waitFor();
  await expectNoSideScroll(petro, 'debuff9c-mud-answered-375');
  await answer(olya);
  await answer(ira);
  await toTable();

  // 11. Q7 без дебафу; рахунок Олі: 2000 + 7 × 100 − (100 + 150 + 4 × 200) = 1650 — шапка, пульт і сцена.
  await nextQuestion(7);
  expect(await petro.locator('.debuff-zone').getAttribute('data-debuff')).toBeNull();
  await everyoneAnswers();
  await click(host, 'Показати відповідь');
  await olya.getByText('Правильно!').waitFor();
  await olya.locator('header.bar .score').getByText('1650', exact).waitFor();
  expect(await rowScore('Оля')).toBe('1650');
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const standing = stage.locator('.standings li', { hasText: 'Оля' });
  await standing.waitFor();
  expect(await standing.locator('.score').textContent()).toBe('1650');

  // 12. Історія: шість рядків покупок.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Дебафи/ }).click();
  await host.getByText('Оля купує 🌫️ Туман для гравця Петро: −100', exact).waitFor();
  await host.getByText('Оля купує 📳 Тремтіння екрана для гравця Петро: −150', exact).waitFor();
  expect(await host.getByText(/^Оля купує .+ для гравця Петро: −200$/).count()).toBe(4);
  await shot(host, 'debuff9c-history');

  expect(problems).toEqual([]);
}

it('part 9d: spares of a board category — the editor adds a spare to a category and warns about an empty one, swap on a board cell takes a spare of the same category, an empty category explains why swap is off, a classic round keeps the global pool, category spares in the history', async () => {
  try {
    await categorySparesGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function categorySparesGame() {
  const host = await open('host9d', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host9d@example.com');

  const base9d = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
  const warmup = {
    ...base9d,
    id: 'q1',
    type: 'single' as const,
    text: 'Розминка: столиця України?',
    options: ['Київ', 'Львів', 'Одеса'].map((text, at) => ({ id: `q1o${at}`, text })),
    correctId: 'q1o0',
  };
  const cellQ = (category: string, price: number) => ({
    ...withPoints(withId(single, `b-${category}-${price}`), price),
    text: `${category} ${price}: столиця України?`,
  });
  const sportSpares = [
    { ...base9d, id: 'sp1', type: 'boolean' as const, text: 'Футбольний м’яч — круглий?', correct: true },
    { ...base9d, id: 'sp2', type: 'numeric' as const, text: 'Скільки гравців у волейбольній команді на майданчику?', correct: 6, tolerance: 0 },
  ];
  const rounds = [
    classicRound('r1', [warmup], { title: 'Розминка', speedBonus: false }),
    boardRound(
      'r2',
      ['Спорт', 'Міста', 'Річки'].map((title) => ({
        title,
        cells: [100, 200, 300].map((price) => cellQ(title, price)),
        ...(title === 'Спорт' ? { spares: sportSpares } : {}),
      })),
      { title: 'Поле', answerMode: 'phone', check: 'auto' },
    ),
  ];
  const spares = [{ ...base9d, id: 'g1', type: 'text' as const, text: 'Яке місто стоїть на Пруті?', accepted: ['Чернівці'] }];
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end', buffs: ['swap'] }), spares, title: 'Запасні 9d' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Редактор: попередження про категорії без запасних; запасне для «Міста»; збереження не блокується.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Запасні 9d' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('details.powers > summary').click();
  const buffGroup = host.locator('fieldset.powers-group').nth(1);
  const warns = () => buffGroup.locator('.powers-warn').allTextContents();
  await buffGroup
    .locator('.powers-warn')
    .getByText('Заміна запитання: немає запасних у категоріях: Поле · Міста, Поле · Річки — на їхніх клітинках заміни не буде.', exact)
    .waitFor();
  expect(await warns()).not.toContain('Заміна запитання: додайте запасні запитання');
  await host.locator('.round-tabs').getByRole('button', { name: 'Поле', ...exact }).click();
  await host.getByRole('button', { name: /^Категорія 2, клітинка 1: 100/ }).click();
  const citySpares = host.locator('section.category-spares');
  await citySpares.getByRole('heading', { name: /^Запасні категорії «Міста»/ }).waitFor();
  await citySpares.getByText('Немає запасних: на клітинках цієї категорії заміна буде недоступна.', exact).waitFor();
  await citySpares.scrollIntoViewIfNeeded();
  await shot(host, 'spares9d-editor-empty');
  await citySpares.getByRole('button', { name: 'Додати запасне', ...exact }).click();
  await citySpares.getByRole('button', { name: 'так чи ні', ...exact }).click();
  await citySpares.locator('.question-field textarea').fill('Львів — обласний центр?');
  await citySpares.getByRole('button', { name: 'Правильна відповідь: Так', ...exact }).click();
  await citySpares.getByRole('button', { name: 'Запасне 1 · так чи ні', ...exact }).waitFor();
  expect(await citySpares.getByText('Немає запасних: на клітинках цієї категорії заміна буде недоступна.', exact).count()).toBe(0);
  const badge = host.locator('.board-column').nth(1).locator('.board-edit-spares');
  expect(await badge.textContent()).toBe('⇄ 1');
  expect(await badge.getAttribute('aria-label')).toBe('Запасних: 1');
  expect(await host.locator('.board-column').nth(0).locator('.board-edit-spares').textContent()).toBe('⇄ 2');
  expect(await host.locator('.board-column').nth(2).locator('.board-edit-spares').count()).toBe(0);
  await expect.poll(warns).toContain('Заміна запитання: немає запасних у категоріях: Поле · Річки — на їхніх клітинках заміни не буде.');
  await shot(host, 'spares9d-editor-category');
  await host.setViewportSize({ width: 375, height: 812 });
  await citySpares.scrollIntoViewIfNeeded();
  await shot(host, 'spares9d-editor-category-375');
  await expectNoSideScroll(host, 'spares9d-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // 2. Гра: сцена 1600 × 900, три телефони 375 × 812; черга поля — Оля, Петро, Іра.
  await host.locator('.quiz-list li', { hasText: 'Запасні 9d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage9d', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya9d', 375, 812);
  const petro = await open('petro9d', 375, 812);
  const ira = await open('ira9d', 375, 812);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];
  const all = [stage, ...phones];
  const cell = (page: Page, category: string, price: number) => page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };
  const pick = async (page: Page, category: string, price: number) => {
    await page.getByText('Ваш хід: виберіть клітинку').waitFor();
    await cell(page, category, price).click();
    await afterSplash(...all);
    for (const each of all) await each.locator('h1', { hasText: `${category} ${price}` }).waitFor();
  };

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 3. Класика — загальний пул.
  for (const page of phones) await page.locator('h1', { hasText: 'Розминка: столиця України?' }).waitFor();
  await takeBuff(ira, 'Заміна запитання');
  await ira.locator('h1', { hasText: 'Яке місто стоїть на Пруті?' }).waitFor();
  await textAnswer(ira, 'Чернівці');
  await ira.getByText('Відповідь прийнято', exact).waitFor();
  await pickOption(olya, 'Київ');
  await pickOption(petro, 'Київ');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await click(host, 'Показати відповідь');
  for (const page of phones) await page.locator('section.result').first().waitFor();
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await afterSplash(...all);
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 4. «Спорт» — запасне Спорту, не загальне.
  await pick(olya, 'Спорт', 100);
  await takeBuff(olya, 'Заміна запитання');
  for (const page of all) await page.locator('h1', { hasText: 'Футбольний м’яч — круглий?' }).waitFor();
  for (const page of all) expect(await page.content()).not.toContain('Яке місто стоїть на Пруті?');
  await stage.locator('.stage-buffs li').getByText('⇄ Оля: запасне запитання', exact).waitFor();
  await shot(olya, 'spares9d-board-swap-375');
  await shot(stage, 'spares9d-board-swap-stage');
  await expectNoSideScroll(olya, 'spares9d-board-swap-375');
  await click(olya, 'Так');
  await click(host, 'Прийняти');
  await olya.getByText('Правильно!').waitFor();
  await toBoard();

  // 5. «Річки» — запасних немає: кнопка неактивна з причиною; «?» каже про категорію.
  await pick(petro, 'Річки', 100);
  await tapBuff(petro, 'Заміна запитання', 'У цій категорії немає запасних запитань.');
  expect(await buffButton(petro, 'Заміна запитання').getAttribute('aria-disabled')).toBe('true');
  await shot(petro, 'spares9d-swap-off-375');
  await expectNoSideScroll(petro, 'spares9d-swap-off-375');
  await petro.getByRole('button', { name: 'Що роблять бафи', ...exact }).click();
  const help = petro.locator('.buff-help-sheet');
  await help.getByRole('heading', { name: 'Бафи', ...exact }).waitFor();
  await help.locator('.buff-where').getByText('Де: класика й поле у свій хід. На полі — запасне з тієї ж категорії.', exact).waitFor();
  await shot(petro, 'spares9d-help-375');
  await expectNoSideScroll(petro, 'spares9d-help-375');
  await petro.keyboard.press('Escape');
  await help.waitFor({ state: 'detached' });
  await pickOption(petro, 'Київ');
  await click(host, 'Прийняти');
  await petro.getByText('Правильно!').waitFor();
  await toBoard();

  // 6. Іра вже використала заміну в класиці.
  await pick(ira, 'Міста', 100);
  await tapBuff(ira, 'Заміна запитання', 'Уже використано.');
  await pickOption(ira, 'Київ');
  await click(host, 'Прийняти');
  await ira.getByText('Правильно!').waitFor();
  await toBoard();

  // 7. Друге коло починає Петро: «Міста» — запасне з редактора, не Спорту й не загальне.
  await pick(petro, 'Міста', 200);
  await takeBuff(petro, 'Заміна запитання');
  for (const page of all) await page.locator('h1', { hasText: 'Львів — обласний центр?' }).waitFor();
  for (const page of all) {
    const html = await page.content();
    expect(html).not.toContain('Скільки гравців у волейбольній');
    expect(html).not.toContain('Яке місто стоїть на Пруті?');
  }
  await shot(petro, 'spares9d-board-swap-cities-375');
  await click(petro, 'Так');
  await click(host, 'Прийняти');
  await petro.getByText('Правильно!').waitFor();

  // 8. Історія: три запасні — загальне в класиці й два категорійні на полі.
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Запасні 9d/ }).click();
  await host.locator('.standings li').first().waitFor();
  await host.evaluate("document.querySelectorAll('details.responses').forEach((d) => { d.open = true; })");
  const line = (question: string, nickname: string) =>
    host
      .locator('.rows.stacked > li', { hasText: question })
      .locator('details.responses li', { has: host.locator('.responses-name', { hasText: nickname }) });
  expect(await line('Розминка: столиця', 'Іра').locator('.spare-text').textContent()).toBe('Запасне: Яке місто стоїть на Пруті?');
  expect(await line('Спорт 100', 'Оля').locator('.spare-text').textContent()).toBe('Запасне: Футбольний м’яч — круглий?');
  expect(await line('Міста 200', 'Петро').locator('.spare-text').textContent()).toBe('Запасне: Львів — обласний центр?');
  await shot(host, 'spares9d-history');

  expect(problems).toEqual([]);
}
