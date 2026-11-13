import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { blitzRound, boardRound, classicRound, finalRound, makeQuiz, makeRoundsQuiz, multi, order, single, withId, withPoints, withVideo } from '@quiz/engine/testing';
import { SPLASH_MS } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import ar from '../../web/src/locales/ar.json';
import es from '../../web/src/locales/es.json';
import { ukMessages } from '../../web/src/i18n';
import { open, click, liveRow, field, arrange, join, openRoundSettings, bodyText, expectNoSideScroll, register, noSideScroll, yOf, POLL, type Box, overlaps, expectApart, wipeWithMouse, sortZone, sortCard, sortZoneBoxes, sortBy, duelAnswer, answerAll, socketFrames, duelButton, frame, label, join22a } from './helpers/common';
import { avatarPng, exact, base, problems, pages, ARTIFACTS, rigged, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 7 (табло, миттєвий бліц, кубики, бали ведучого, ва-банк, сортування, дуелі) і 26a (клітинка-бліц).
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 7a: a bigger coloured board with a legend, round facts, the host timer, options and verdict blinks for everyone, a masked video, order labels and picture options', async () => {
  try {
    await clarityGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function clarityGame() {
  const host = await open('host7a', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host7a@example.com');

  // Картинки варіантів: завантаження у сховище, як у редакторі.
  const upload = async () => {
    const response = await host.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } });
    expect(response.ok()).toBe(true);
    return ((await response.json()) as { url: string }).url;
  };
  const [flagA, flagB] = [await upload(), await upload(), await upload(), await upload()];

  const oceans = {
    ...order,
    id: 'q-order',
    text: 'Розставте океани від найбільшого до найменшого',
    items: [
      { id: 'p', text: 'Тихий' },
      { id: 'a', text: 'Атлантичний' },
      { id: 'i', text: 'Індійський' },
      { id: 'n', text: 'Північний Льодовитий' },
    ],
    topLabel: 'Найбільший',
    bottomLabel: 'Найменший',
    timeLimit: 30,
  };
  const flags = {
    ...single,
    id: 'q-flag',
    text: 'Який прапор України?',
    options: [
      { id: 'a', text: '', imageUrl: flagA! },
      { id: 'b', text: 'Польща', imageUrl: flagB! },
      { id: 'c', text: 'Італія' },
    ],
    correctId: 'a',
    timeLimit: 20,
  };
  const titles = ['Географія та подорожі світом', 'Міста', 'Річки', 'Гори', 'Озера', 'Моря', 'Країни', 'Острови'];
  const special: Record<string, object> = {
    'Міста 200': { answerMode: 'voice' },
    'Міста 300': { mark: 'x2' },
    'Річки 100': { kind: 'blitz', penalty: 'all' },
    'Гори 300': { mark: 'x3' },
  };
  const categories = titles.map((title, column) => ({
    title,
    cells: [100, 200, 300].map((price) => ({
      ...special[`${title} ${price}`],
      question: withPoints(withId(single, `q-${column}-${price}`), price),
    })),
  }));
  const data = {
    ...makeRoundsQuiz([
      classicRound('r1', [oceans, flags, withId(withVideo(single), 'q-video')], { speedBonus: false }),
      boardRound('r2', categories),
    ]),
    title: 'Ясність',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7a', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya7a', 375, 812);
  const taras = await open('taras7a', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await stage.getByText('Тарас').waitFor();

  // 1. Заставка раунду 1: кількість запитань і час (відео без таймера не рахується).
  await click(host, 'Почати гру');
  for (const page of [stage, olya, host]) await page.locator('.round-facts', { hasText: '3 запитання · 20–30 с на кожне' }).waitFor();
  await shot(stage, 'intro-facts-stage');
  await shot(olya, 'intro-facts-phone');

  // 2. Порядок з підписами; таймер «/ 30 с» на сцені й у ведучого.
  await click(host, 'Почати раунд');
  await stage.locator('.bar', { hasText: 'Запитання 1 з 3 · лишилося 2' }).waitFor();
  await stage.locator('.timer-total', { hasText: '/ 30 с' }).waitFor();
  const top = olya.locator('.order-label.is-top');
  const bottom = olya.locator('.order-label.is-bottom');
  expect(await top.textContent()).toBe('↑ Найбільший');
  expect(await bottom.textContent()).toBe('↓ Найменший');
  const list = (await olya.locator('ol.order').boundingBox())!;
  expect((await top.boundingBox())!.y).toBeLessThan(list.y);
  expect((await bottom.boundingBox())!.y).toBeGreaterThan(list.y + list.height - 1);
  await stage.getByText('Розставте на телефоні: зверху — Найбільший, знизу — Найменший', exact).waitFor();
  await host.getByRole('timer').waitFor();
  await host.locator('.host-time .timer-total', { hasText: '/ 30 с' }).waitFor();
  await shot(olya, 'order-labels-phone');
  await shot(stage, 'order-labels-stage');
  await shot(host, 'timer-host');
  // Рядок таймера ведучого (таймер і ±15 с) на телефоні 375 px не виходить за край.
  await host.setViewportSize({ width: 375, height: 812 });
  const row = host.locator('.host-time');
  expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const rowBox = (await row.boundingBox())!;
  for (const part of await row.locator('.timer, button').all()) {
    const box = (await part.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(rowBox.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
  }
  await expectNoSideScroll(host, 'timer-host-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  await arrange(olya, ['Тихий', 'Атлантичний', 'Індійський', 'Північний Льодовитий']);
  await click(olya, 'Відповісти');
  await arrange(taras, ['Атлантичний', 'Тихий', 'Індійський', 'Північний Льодовитий']);
  await click(taras, 'Відповісти');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await stage.locator('.answer', { hasText: '(зверху — Найбільший, знизу — Найменший)' }).waitFor();
  await shot(stage, 'order-labels-reveal-stage');
  await click(host, 'Далі');
  await click(host, 'Наступне запитання');

  // 3. Варіанти-картинки: сітка з літерами на сцені, мініатюри на телефоні.
  await stage.locator('.choices.has-images img').first().waitFor();
  expect(await stage.locator('.choices.has-images img').count()).toBe(2);
  expect(await stage.locator('.choices.has-images .letter').allTextContents()).toEqual(['A', 'B', 'C']);
  await taras.getByRole('button').filter({ has: taras.locator('img[alt="Картинка A"]') }).waitFor();
  await shot(stage, 'image-options-stage');
  await shot(taras, 'image-options-phone');
  await expectNoSideScroll(olya, 'image-options-phone-375');
  // Лупа в куті варіанта відкриває його картинку на весь екран і не обирає варіант; на сцені луп немає.
  expect(await stage.locator('.choice-zoom').count(), 'no magnifiers on the stage').toBe(0);
  await olya.getByRole('button', { name: 'Відкрити картинку варіанта B', ...exact }).click();
  await olya.locator('.image-zoom-img').waitFor();
  await olya.getByRole('button', { name: 'Закрити картинку', ...exact }).click();
  expect(await olya.locator('.choice.is-picked').count(), 'the magnifier picks nothing').toBe(0);
  await olya.getByRole('button').filter({ has: olya.locator('img[alt="Картинка A"]') }).click();
  await taras.getByRole('button', { name: /Італія/ }).click();
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await stage.getByText('Правильна відповідь: A. картинка').waitFor();
  await click(host, 'Далі');
  await click(host, 'Наступне запитання');

  // 4. Відео: маска над назвою до розкриття ловить дотики.
  for (const page of [stage, olya]) await page.locator('.video-mask', { hasText: 'Назву відео приховано до відповіді' }).waitFor();
  const video = (await stage.locator('.question-video').boundingBox())!;
  const masked = await stage.evaluate(
    `document.elementFromPoint(${video.x + video.width / 2}, ${video.y + 10})?.closest('.video-mask') !== null`,
  );
  expect(masked).toBe(true);
  await shot(stage, 'video-mask-stage');
  await shot(olya, 'video-mask-phone');
  await olya.getByRole('button', { name: /Київ/ }).click();
  await taras.getByRole('button', { name: /Львів/ }).click();
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await stage.locator('.choice.is-correct', { hasText: 'Київ' }).waitFor();
  expect(await stage.locator('.video-mask').count()).toBe(0);
  await shot(stage, 'video-unmasked-stage');
  await click(host, 'Далі');

  // 5. Заставка поля.
  await click(host, 'Наступний раунд');
  for (const page of [stage, olya, host]) await page.locator('.round-facts', { hasText: '24 клітинки · 20 с на кожну' }).waitFor();
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');

  // 6. Поле з кольорами й легендою: на сцені збоку, на телефоні й у ведучого під полем.
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await stage.locator('.board-with-legend').waitFor();
  const legend = stage.getByRole('list', { name: 'Види клітинок' });
  for (const item of [
    'Звичайна',
    'Бліц: бали першому, хто правильно відповість',
    'Відповідь уголос',
    '×2 — подвійна ціна',
    '×3 — потрійна ціна',
    '−всім: мінус для всіх, хто не вгадав',
  ])
    await legend.getByText(item, exact).waitFor();
  expect(await legend.getByText('🎤 Бліц уголос').count()).toBe(0);
  for (const page of [host, stage, olya, taras]) {
    expect(await page.locator('.gb-cell.is-blitz').count()).toBe(1);
    expect(await page.locator('.gb-cell.is-voice').count()).toBe(1);
  }
  await expectNoSideScroll(olya, 'board-legend-phone-375');
  expect(await olya.locator('.gb-scroll').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  for (const page of [olya, stage]) {
    const longTitle = (await page.locator('.gb-title').first().boundingBox())!;
    const shortTitle = (await page.locator('.gb-title', { hasText: 'Міста' }).boundingBox())!;
    expect(longTitle.height, 'a long category title wraps').toBeGreaterThan(shortTitle.height);
  }
  console.log(`stage 1600: board ${Math.round((await stage.locator('.gb').boundingBox())!.width)} px wide`);
  await shot(stage, 'board-legend-stage');
  await shot(host, 'board-legend-host');
  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
  ] as const) {
    await stage.setViewportSize({ width, height });
    console.log(`stage ${width}: board ${Math.round((await stage.locator('.gb').boundingBox())!.width)} px wide`);
    expect(await noSideScroll(stage)).toBe(true);
    await shot(stage, `board-legend-stage-${width}`);
  }
  await stage.setViewportSize({ width: 1600, height: 900 });

  const cell = (page: Page, category: string, price: number) =>
    page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };

  // 7. Телефонна клітинка: варіанти бачать усі ще до відповіді, вердикт мигає.
  await cell(olya, 'Міста', 100).click();
  await taras.locator('.choice').first().waitFor();
  expect(await taras.locator('.choice').allTextContents()).toEqual(['AЛьвів', 'BКиїв', 'CОдеса']);
  await shot(taras, 'spotlight-before-answer-phone-other');
  await stage.locator('.bar', { hasText: 'Клітинка 1 з 24 · лишилося 23' }).waitFor();
  const before = (await taras.locator('.choice').first().boundingBox())!;
  await olya.getByRole('button', { name: /Київ/ }).click();
  for (const page of [taras, stage]) await page.locator('.choice.is-pending', { hasText: 'Київ' }).waitFor();
  await stage.getByText('Чекає рішення ведучого', exact).waitFor();
  // Стан годинника стає на місце «/ 20 с»: варіанти в Тараса не з’їжджають.
  await taras.locator('.timer-status', { hasText: 'Чекає рішення ведучого' }).waitFor();
  expect((await taras.locator('.choice').first().boundingBox())!.y, 'the phone does not jump when held').toBe(before.y);
  await shot(taras, 'held-phone-other');
  await click(host, 'Прийняти');
  for (const page of [stage, taras]) await page.locator('.choice.is-correct.is-blinking', { hasText: 'Київ' }).waitFor();
  await shot(stage, 'verdict-blink-stage');
  await shot(taras, 'verdict-blink-phone-other');
  await shot(host, 'verdict-blink-host');
  await expect.poll(() => stage.locator('.is-blinking').count(), { timeout: 6000 }).toBe(0);
  expect(await stage.locator('.choice.is-correct', { hasText: 'Київ' }).count()).toBe(1);
  await toBoard();

  // 8–9. Усна клітинка: ведучий позначає названий варіант; вердикт лише на розкритті; в Олі без анімації.
  await olya.emulateMedia({ reducedMotion: 'reduce' });
  await taras.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(taras, 'Міста', 200).click();
  await taras.getByText('Відповідайте вголос').waitFor();
  expect(await taras.locator('.choice').count()).toBe(3);
  await host.getByText('Торкніться варіанта, який назвав гравець', exact).waitFor();
  await host.locator('button.choice', { hasText: 'Одеса' }).click();
  for (const page of [stage, olya]) await page.locator('.choice.is-pending', { hasText: 'Одеса' }).waitFor();
  await shot(stage, 'voice-named-stage');
  await shot(olya, 'voice-named-phone-other');
  await shot(host, 'voice-named-host');
  await click(host, 'Не зараховувати');
  // Закрите запитання (locked): позначка лишається помаранчевою на сцені й на телефонах, вердикту ще немає.
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  for (const page of [stage, olya, taras]) await page.locator('.choice.is-pending', { hasText: 'Одеса' }).waitFor();
  for (const page of [stage, olya, taras]) expect(await page.locator('.is-wrong').count()).toBe(0);
  expect(await taras.locator('.choice').count()).toBe(3);
  await shot(taras, 'voice-locked-phone');
  await click(host, 'Показати відповідь');
  for (const page of [stage, taras]) {
    await page.locator('.choice.is-wrong.is-blinking', { hasText: 'Одеса' }).waitFor();
    await page.locator('.choice.is-correct', { hasText: 'Київ' }).waitFor();
  }
  await shot(stage, 'voice-verdict-stage');
  await shot(taras, 'voice-verdict-phone');
  const wrong = olya.locator('.choice.is-wrong', { hasText: 'Одеса' });
  await wrong.waitFor();
  expect(await wrong.evaluate((el) => (globalThis as unknown as { getComputedStyle: (e: unknown) => { animationName: string } }).getComputedStyle(el).animationName)).toBe('none');

  // 10. Кінець гри.
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  expect(problems).toEqual([]);
}

it('part 7b: an instant blitz — options at once, a live queue with times, a wrong head then the next, the winner closes, nothing moves; a voice blitz keeps its button', async () => {
  try {
    await instantBlitzGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});
/** Блок черги: верх і висота (резерв не змінюється від кількості рядків). */
const queueBox = (page: Page) =>
  page.locator('.blitz-queue').evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { top: Math.round(box.top), height: Math.round(box.height) };
  });
/** Верх кожного рядка черги (px). */
const rowsY = (page: Page) =>
  page.locator('.blitz-queue li').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));

async function instantBlitzGame() {
  const host = await open('host7b', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host7b@example.com');

  // Старі значення вікна й спроб (20 с, 3 спроби) миттєвий бліц ігнорує: одна спроба, без вікна.
  const capital = { ...single, id: 'q-capital', timeLimit: 30 };
  const river = {
    ...single,
    id: 'q-river',
    text: 'Найбільша річка?',
    options: [
      { id: 'a', text: 'Дніпро' },
      { id: 'b', text: 'Дунай' },
      { id: 'c', text: 'Десна' },
    ],
    correctId: 'a',
    timeLimit: 30,
  };
  const data = {
    ...makeRoundsQuiz([
      blitzRound('r1', [capital, river], {
        check: 'auto',
        answerWindow: 20,
        attempts: 3,
        rules: { penalty: 'minus', partial: null, streak: null, multiplier: 1 },
      }),
      boardRound('r2', [
        {
          title: 'Міста',
          cells: [
            { kind: 'blitz', question: withPoints(withId(single, 'q-c100'), 100) },
            { kind: 'blitz', answerMode: 'voice', question: withPoints(withId(single, 'q-c200'), 200) },
            withPoints(withId(single, 'q-c300'), 300),
          ],
        },
        // Поле потребує щонайменше трьох категорій; ці дві — звичайні клітинки.
        ...['Річки', 'Гори'].map((title, column) => ({
          title,
          cells: [100, 200, 300].map((price) => withPoints(withId(single, `q-${column}-${price}`), price)),
        })),
      ]),
    ]),
    title: 'Миттєвий бліц',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7b', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya7b', 375, 812);
  const taras = await open('taras7b', 360, 740);
  const ira = await open('ira7b', 390, 844);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();

  const score = async (nickname: string) =>
    Number(
      (await host.locator('.rows > li:has(button)', { hasText: nickname }).locator('.score').first().textContent())!
        .replace('−', '-')
        .replace(/\s/g, ''),
    );
  const answerButton = (page: Page) => page.getByRole('button', { name: 'Відповісти', ...exact });

  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');

  // 1. Варіанти одразу, без кнопки «Відповісти».
  for (const page of [olya, taras, ira]) {
    await page.getByRole('button', { name: /Київ/ }).waitFor();
    expect(await answerButton(page).count()).toBe(0);
  }
  await stage.locator('.blitz-queue', { hasText: 'Відповідей ще немає' }).waitFor();
  await shot(olya, 'blitz7b-options-phone');
  const olyaY = await yOf(olya);
  const stageY = await yOf(stage);
  expect(olyaY).toHaveLength(3);
  expect(stageY).toHaveLength(3);
  const olyaQueue = await queueBox(olya);
  const stageQueue = await queueBox(stage);
  expect(olyaQueue.height).toBeGreaterThan(0);

  // 2. Черга з часом: Тарас, потім Іра. Іншим видно лише ім'я, час і позначку.
  await taras.getByRole('button', { name: /Львів/ }).click();
  for (const page of [stage, olya]) await page.locator('.blitz-queue li', { hasText: 'Тарас' }).waitFor();
  const firstRow = { olya: (await rowsY(olya))[0], stage: (await rowsY(stage))[0] };
  await ira.getByRole('button', { name: /Київ/ }).click();
  for (const page of [stage, olya]) {
    const rows = page.locator('.blitz-queue li');
    await expect.poll(() => rows.count()).toBe(2);
    expect(await rows.nth(0).innerText()).toContain('Тарас');
    expect(await rows.nth(0).innerText()).toMatch(/\d+,\d с/);
    expect(await rows.nth(1).innerText()).toContain('Іра');
    expect(await page.locator('.blitz-queue .given').count()).toBe(0);
  }
  expect(await stage.locator('.blitz-queue').innerText()).not.toContain('Львів');
  await taras.locator('.choice.is-pending', { hasText: 'Львів' }).waitFor();
  await taras.getByText('Ведучий перевіряє вашу відповідь').waitFor();
  await ira.getByText(/ви 2-й у черзі/).waitFor();
  const hostRows = host.locator('.blitz-queue li');
  await expect.poll(() => hostRows.count()).toBe(2);
  const given = await host.locator('.blitz-queue .given').allInnerTexts();
  expect(given[0]).toContain('Львів');
  expect(given[1]).toContain('Київ');
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Тарас' }).waitFor();
  expect(await hostRows.first().getAttribute('class')).toContain('is-pending');
  await host.getByRole('button', { name: 'Прийняти', ...exact }).waitFor();
  await host.getByRole('button', { name: 'Перевибрати', ...exact }).waitFor();
  await shot(stage, 'blitz7b-queue-stage');
  await shot(olya, 'blitz7b-queue-phone-other');
  await shot(taras, 'blitz7b-queue-phone-mine');
  // Пульт вищий за вікно: на повному знімку нижня панель кнопок інакше лягає на чергу.
  await host.setViewportSize({ width: 1280, height: 1400 });
  await shot(host, 'blitz7b-queue-host');
  await host.setViewportSize({ width: 1280, height: 900 });
  // Нічого не рухається: варіанти, блок черги й перший рядок на своїх місцях.
  expect(await yOf(olya)).toEqual(olyaY);
  expect(await yOf(stage)).toEqual(stageY);
  expect(await queueBox(olya)).toEqual(olyaQueue);
  expect(await queueBox(stage)).toEqual(stageQueue);
  expect((await rowsY(olya))[0]).toBe(firstRow.olya);
  expect((await rowsY(stage))[0]).toBe(firstRow.stage);
  await expectNoSideScroll(olya, 'blitz7b-queue-phone-375');

  // 3. Хибна голова, далі наступний.
  await click(host, 'Прийняти');
  for (const page of [stage, olya]) await page.locator('.blitz-queue li', { hasText: 'Тарас' }).locator('.blitz-mark.is-wrong').waitFor();
  await stage.locator('.blitz-mark.is-blinking').waitFor();
  await taras.locator('.choice.is-wrong.is-blinking', { hasText: 'Львів' }).waitFor();
  await taras.getByText('Неправильно — чекаємо інших').waitFor();
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Іра' }).waitFor();
  await shot(stage, 'blitz7b-wrong-stage');
  await shot(taras, 'blitz7b-wrong-phone-mine');
  expect(await yOf(olya)).toEqual(olyaY);
  expect(await yOf(stage)).toEqual(stageY);
  expect(await queueBox(olya)).toEqual(olyaQueue);
  expect(await queueBox(stage)).toEqual(stageQueue);

  // 4. Переможець закриває запитання; хто що вибрав — лише з розкриттям.
  await click(host, 'Прийняти');
  for (const page of [stage, olya]) await page.getByText('Першим правильно відповів: Іра').waitFor();
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  expect(await olya.getByRole('button', { name: /Київ/ }).count()).toBe(0);
  expect(await stage.locator('.blitz-queue .given').count()).toBe(0);
  await shot(stage, 'blitz7b-winner-stage');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await stage.locator('.blitz-queue .given', { hasText: 'Львів' }).waitFor();
  await stage.locator('.blitz-queue .given', { hasText: 'Київ' }).waitFor();
  await stage.locator('.choice.is-correct', { hasText: 'Київ' }).waitFor();
  await shot(stage, 'blitz7b-reveal-stage');
  expect(await score('Іра')).toBe(1000);
  expect(await score('Тарас')).toBe(-1000);
  expect(await score('Оля')).toBe(0);
  await click(host, 'Далі');
  await click(host, 'Наступне запитання');

  // 5. Усі помилилися: запитання закривається само.
  await olya.getByRole('button', { name: /Дунай/ }).click();
  await taras.getByRole('button', { name: /Десна/ }).click();
  await ira.getByRole('button', { name: /Дунай/ }).click();
  await expect.poll(() => host.locator('.blitz-queue li').count()).toBe(3);
  for (const nickname of ['Оля', 'Тарас', 'Іра']) {
    await host.locator('.blitz-queue li.is-pending', { hasText: nickname }).waitFor();
    await click(host, 'Прийняти');
  }
  await stage.getByText('Ніхто не відповів правильно').waitFor();
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  expect(await host.getByRole('button', { name: 'Закрити запитання', ...exact }).count()).toBe(0);
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');

  // Заставка поля.
  await click(host, 'Наступний раунд');
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  const cell = (page: Page, category: string, price: number) =>
    page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };

  // 6. Бліц-клітинка телефоном: варіанти одразу і в того, хто вибрав, і в інших.
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(olya, 'Міста', 100).click();
  for (const page of [olya, taras]) {
    await page.getByRole('button', { name: /Київ/ }).waitFor();
    expect(await answerButton(page).count()).toBe(0);
  }
  await taras.getByRole('button', { name: /Київ/ }).click();
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Тарас' }).waitFor();
  await click(host, 'Прийняти');
  await stage.getByText('Першим правильно відповів: Тарас').waitFor();
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await shot(stage, 'blitz7b-cell-stage');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await toBoard();

  // 7. Усний бліц лишається з кнопкою, і рядок «Відповідає …» не зсуває варіантів.
  await taras.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(taras, 'Міста', 200).click();
  for (const page of [olya, ira]) await answerButton(page).waitFor();
  const iraY = await yOf(ira);
  expect(iraY).toHaveLength(3);
  await shot(ira, 'blitz7b-voice-button-phone');
  await click(olya, 'Відповісти');
  await ira.getByText('Відповідає Оля').waitFor();
  expect(await yOf(ira)).toEqual(iraY);
  await shot(ira, 'blitz7b-voice-answering-phone');
  await click(host, 'Закрити клітинку');
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await toBoard();

  // 8. Кінець гри.
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  expect(problems).toEqual([]);
}

it('part 26a: a blitz cell — the cell flips, «БЛІЦ!» stands 3 s on the stage, the phones and the host, then the question starts; a plain cell has no «БЛІЦ!»; reduced motion keeps the word still', async () => {
  try {
    await blitzSplashGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Напис «БЛІЦ!» шару заставки: текст, розмір шрифту (px) і чи вміщається він в один рядок. */
const blitzTitle = (page: Page) =>
  page.locator('.splash.is-blitz .splash-blitz-title').evaluate((el) => {
    const style = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    return { text: el.textContent, fontSize: Math.round(parseFloat(style.fontSize)), lines, fits: el.scrollWidth <= el.clientWidth + 1 };
  });
/** Вираз для waitForFunction: прозорість першого елемента за селектором; немає елемента — NaN (умова не справджується). */
const OPACITY = (selector: string) =>
  `((el) => (el === null ? NaN : Number(getComputedStyle(el).opacity)))(document.querySelector(${JSON.stringify(selector)}))`;

async function blitzSplashGame() {
  const host = await open('host26a', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host26a@example.com');

  const data = {
    ...makeRoundsQuiz([
      boardRound('r1', [
        {
          title: 'Міста',
          cells: [
            { kind: 'blitz', question: withPoints(withId(single, 'q-c100'), 100) },
            { kind: 'blitz', mark: 'x2', question: withPoints(withId(single, 'q-c200'), 200) },
            withPoints(withId(single, 'q-c300'), 300),
          ],
        },
        ...['Річки', 'Гори'].map((title, column) => ({
          title,
          cells: [100, 200, 300].map((price) => withPoints(withId(single, `q-${column}-${price}`), price)),
        })),
      ]),
    ]),
    title: 'Заставка бліцу',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage26a', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya26a', 375, 812);
  const taras = await open('taras26a', 360, 740);
  const ira = await open('ira26a', 360, 740);
  await ira.emulateMedia({ reducedMotion: 'reduce' });
  // Найвужчі телефони іншими мовами: «¡BLITZ!» і «خاطف!» теж мають стати в один рядок на 320 px.
  const jose = await open('jose26a', 320, 640, { locale: 'es-ES' });
  const amal = await open('amal26a', 320, 640, { locale: 'ar-EG' });
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(ira, code, 'Іра', false);
  await join22a(jose, es, code, 'Хосе');
  await join22a(amal, ar, code, 'Амаль');
  await stage.getByText('Амаль').waitFor();
  const phones = [olya, taras, ira, jose, amal];
  const all = [stage, host, ...phones];

  const score = async (nickname: string) =>
    Number(
      (await host.locator('.rows > li:has(button)', { hasText: nickname }).locator('.score').first().textContent())!
        .replace('−', '-')
        .replace(/\s/g, ''),
    );
  const cell = (page: Page, category: string, price: number) =>
    page.getByRole('button', { name: `${category}, ${price}`, ...exact });
  const kyiv = (page: Page) => page.getByRole('button', { name: /Київ/ });
  const shown = host.getByRole('button', { name: 'Показати відповідь', ...exact });
  const accept = host.getByRole('button', { name: 'Прийняти', ...exact });
  const after = host.getByRole('button', { name: 'Далі', ...exact });
  const toBoard = async () => {
    await click(host, 'Далі');
    const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
    const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
    await Promise.race([next.waitFor(), picking.waitFor()]);
    if (await next.isVisible()) await next.click();
    await picking.waitFor();
  };
  /** Поки шар «БЛІЦ!» на телефоні, варіантів ще немає або їх не натиснути. */
  const lockedUnder = async (page: Page) => {
    const options = page.locator('.choice');
    if ((await options.count()) === 0) return;
    for (const option of await options.all()) expect(await option.isDisabled(), 'an option is live under «БЛІЦ!»').toBe(true);
  };

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 1. Звичайна клітинка: перегортання, але без «БЛІЦ!».
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(olya, 'Річки', 100).click();
  await afterSplash(stage, olya);
  expect(await stage.locator('.splash.is-blitz').count(), 'no «БЛІЦ!» on a plain cell').toBe(0);
  const olyaBefore = await score('Оля');
  await kyiv(olya).click();
  await Promise.race([shown.waitFor(), accept.waitFor(), after.waitFor()]);
  if (await accept.isVisible()) await accept.click();
  await Promise.race([shown.waitFor(), after.waitFor()]);
  if (await shown.isVisible()) await shown.click();
  await after.waitFor();
  expect(await score('Оля')).toBe(olyaBefore + 100);
  await toBoard();

  // 2. Бліц-клітинка: спершу перегортання, далі «БЛІЦ!» з рядком правил на сцені, телефонах і пульті; запитання ще не почалося.
  await taras.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(taras, 'Міста', 100).click();
  await stage.locator('.splash.is-blitz').waitFor({ state: 'attached' });
  const layerAt = Date.now();
  await Promise.all(
    [stage, olya, taras, ira, host, jose, amal].map((page) => page.locator('.splash.is-blitz .splash-blitz-title').waitFor({ state: 'attached' })),
  );
  // «БЛІЦ!» проявляється після перегортання й стоїть видимим скрізь — і без руху теж.
  await Promise.all(
    [stage, olya, taras, ira, host, jose, amal].map((page) => page.waitForFunction(`${OPACITY('.splash-blitz')} > 0.99`, undefined, { timeout: 4000 })),
  );
  // На пульті шар над консоллю на все вікно.
  const hostLayer = (await host.locator('.splash.is-blitz').boundingBox())!;
  expect([hostLayer.x, hostLayer.y, hostLayer.width, hostLayer.height]).toEqual([0, 0, 1280, 900]);
  for (const page of [stage, olya, taras, host]) {
    const title = await blitzTitle(page);
    expect(title.text).toBe('БЛІЦ!');
    expect(title.lines, '«БЛІЦ!» in one line').toBe(1);
    expect(title.fits, '«БЛІЦ!» fits its box').toBe(true);
    expect(await page.locator('.splash.is-blitz .splash-blitz-rule').textContent()).toBe(ukMessages.cellBlitzRuleInstant);
  }
  const titles = {
    stage: await blitzTitle(stage),
    phone375: await blitzTitle(olya),
    phone360: await blitzTitle(taras),
    host: await blitzTitle(host),
    es320: await blitzTitle(jose),
    ar320: await blitzTitle(amal),
  };
  console.log(`26a «БЛІЦ!» font sizes: ${JSON.stringify(titles)}`);
  expect(titles.es320.text).toBe('¡BLITZ!');
  expect(titles.ar320.text).toBe('خاطف!');
  for (const title of [titles.es320, titles.ar320]) {
    expect(title.lines, `${title.text} in one line at 320 px`).toBe(1);
    expect(title.fits, `${title.text} fits at 320 px`).toBe(true);
  }
  await lockedUnder(olya);
  await lockedUnder(taras);
  // Без руху: напис просто стоїть (лише миттєва поява), анімації появи splash-blitz-in немає; з рухом — є.
  const animations = (page: Page) =>
    page.locator('.splash.is-blitz .splash-blitz').evaluate((el) => el.getAnimations().map((a) => (a as CSSAnimation).animationName));
  expect(await animations(ira)).not.toContain('splash-blitz-in');
  expect(await animations(olya)).toContain('splash-blitz-in');
  await Promise.all([
    shot(stage, 'blitz26a-splash-stage', { splash: true }),
    shot(taras, 'blitz26a-splash-phone', { splash: true }),
    shot(host, 'blitz26a-splash-host', { splash: true }),
    shot(ira, 'blitz26a-splash-phone-reduced', { splash: true }),
    shot(jose, 'blitz26a-splash-phone-es-320', { splash: true }),
    shot(amal, 'blitz26a-splash-phone-ar-320', { splash: true }),
  ]);
  await afterSplash(stage, olya, taras, host);
  const layerMs = Date.now() - layerAt;
  expect(layerMs, `«БЛІЦ!» stood ${layerMs} ms`).toBeGreaterThanOrEqual(SPLASH_MS.cell + SPLASH_MS.blitz - 300);
  await shot(stage, 'blitz26a-question-stage');

  // 3. Після шару — запитання: варіанти в усіх, далі як у 7b — відповідь, «Прийняти», бали.
  await expect.poll(() => kyiv(olya).isEnabled()).toBe(true);
  await expect.poll(() => kyiv(taras).isEnabled()).toBe(true);
  const olyaBeforeBlitz = await score('Оля');
  await kyiv(olya).click();
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Оля' }).waitFor();
  await click(host, 'Прийняти');
  await stage.getByText('Першим правильно відповів: Оля').waitFor();
  await click(host, 'Показати відповідь');
  await after.waitFor();
  expect(await score('Оля')).toBe(olyaBeforeBlitz + 100);
  await toBoard();

  // 4. Бліц ×2: на сцені спершу штамп «×2!», потім «БЛІЦ!».
  await ira.getByText('Ваш хід: виберіть клітинку').waitFor();
  await cell(ira, 'Міста', 200).click();
  await stage.locator('.splash.is-blitz .splash-surprise', { hasText: '×2!' }).waitFor({ state: 'attached' });
  await stage.waitForFunction(`${OPACITY('.splash.is-blitz .splash-surprise')} > 0.99 && ${OPACITY('.splash-blitz')} < 0.01`, undefined, { timeout: 4000 });
  if (process.env.E2E_SHOTS === '1') {
    mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
    await stage.screenshot({ path: resolve(ARTIFACTS, 'shots', 'blitz26a-x2-stage.png'), fullPage: true });
  }
  await stage.waitForFunction(`${OPACITY('.splash-blitz')} > 0.99 && ${OPACITY('.splash-blitz-lead')} < 0.01`, undefined, { timeout: 4000 });
  expect((await blitzTitle(stage)).text).toBe('БЛІЦ!');
  await shot(stage, 'blitz26a-x2-title-stage', { splash: true });
  await afterSplash(...all);
  await kyiv(taras).click();
  await host.locator('.blitz-queue li.is-pending', { hasText: 'Тарас' }).waitFor();
  await click(host, 'Прийняти');
  await stage.getByText('Першим правильно відповів: Тарас').waitFor();
  await click(host, 'Показати відповідь');
  await after.waitFor();
  await toBoard();

  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  expect(problems).toEqual([]);
}

it('part 7c: each phone rolls its die, everyone sees the spin and results, a tie re-rolls, the host rolls for an absent player, the schedule of circles and the turn queue beside the board', async () => {
  try {
    await diceGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});
/** Верх кожного рядка кидків (px): рядки не рухаються, коли приходять результати. */
const diceRowsY = (page: Page) =>
  page.locator('.dice-rows li').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
/** Рядок кидків гравця. */
const diceRow = (page: Page, nickname: string) =>
  page.locator('.dice-rows li').filter({ has: page.locator('.name').getByText(nickname, exact) });
const diceValue = (page: Page, nickname: string) => diceRow(page, nickname).locator('.dice-value').textContent();
/** Тексти кіл розкладу з нормалізованими пробілами. */
const circleTexts = (page: Page, scope = 'body') =>
  page
    .locator(`${scope} li.turn-circle`)
    .evaluateAll((els) => els.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()));

/** Вікторина з одним раундом поля 3×3 (9 клітинок, для 4 гравців — 3 кола); повертає код гри й посилання на сцену. */
async function hostDiceQuiz(host: Page): Promise<{ code: string; stageUrl: string }> {
  const data = {
    ...makeRoundsQuiz([
      boardRound(
        'r1',
        ['Міста', 'Річки', 'Гори'].map((title, column) => ({
          title,
          cells: [100, 200, 300].map((price) => withPoints(withId(single, `q-${column}-${price}`), price)),
        })),
      ),
    ]),
    title: 'Кубики',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  return { code, stageUrl: stageUrl! };
}

/** Заставка поля на сцені вміщається в екран: розклад і останній рядок кидків не нижче краю, без прокрутки вбік. */
async function expectIntroFits(stage: Page, name: string) {
  const height = (await stage.evaluate('innerHeight')) as number;
  const schedule = (await stage.locator('.turn-schedule').boundingBox())!;
  const lastRow = (await stage.locator('.dice-rows li').last().boundingBox())!;
  console.log(`${name}: schedule bottom ${Math.round(schedule.y + schedule.height)} px, last dice row bottom ${Math.round(lastRow.y + lastRow.height)} px of ${height}`);
  expect(schedule.y + schedule.height, `${name}: the schedule runs off the screen`).toBeLessThanOrEqual(height);
  expect(lastRow.y + lastRow.height, `${name}: the dice rows run off the screen`).toBeLessThanOrEqual(height);
  expect(await noSideScroll(stage), `${name}: horizontal scroll`).toBe(true);
}

async function diceGame() {
  const host = await open('host7c', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host7c@example.com');
  const { code, stageUrl } = await hostDiceQuiz(host);
  const stage = await open('stage7c', 1600, 900);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya7c', 375, 812);
  const petro = await open('petro7c', 360, 740);
  const ira = await open('ira7c', 390, 844);
  const maks = await open('maks7c', 375, 812);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await join(maks, code, 'Макс', false);
  await stage.getByText('Макс').waitFor();
  // Макс іде: за нього кидатиме ведучий.
  await maks.context().close();
  pages.delete('maks7c');
  await host.locator('.rows li', { hasText: 'Макс' }).getByText('немає зв’язку', exact).waitFor();

  // 1. Початок кидків.
  await click(host, 'Почати гру');
  await click(host, 'Кидати кубики');
  for (const page of [olya, petro, ira]) await page.getByRole('button', { name: 'Кинути кубик', ...exact }).waitFor();
  await stage.locator('.dice-rows li').nth(3).waitFor();
  expect(await stage.locator('.dice-rows li .name').allTextContents()).toEqual(['Оля', 'Петро', 'Іра', 'Макс']);
  expect(await stage.locator('.dice-rows li .die.is-empty').count()).toBe(4);
  await stage.locator('.dice-status').getByText('Кидають: Оля, Петро, Іра, Макс', exact).waitFor();
  const start = host.getByRole('button', { name: 'Почати раунд', ...exact });
  expect(await start.isDisabled()).toBe(true);
  await host.getByText('Ще не кинули: Оля, Петро, Іра, Макс. Можна кинути за них.', exact).waitFor();
  const stageY = await diceRowsY(stage);
  const olyaY = await diceRowsY(olya);
  expect(stageY).toHaveLength(4);
  expect(olyaY).toHaveLength(4);
  const dieBox = (await stage.locator('.dice-rows li .die').first().boundingBox())!;
  await shot(host, 'dice7c-start-host');

  // 2. Кожен телефон кидає сам: кубик крутиться на телефоні й на сцені, потім результат у всіх.
  rigged.push(5);
  // Кадри крутіння: заставка «Раунд 1» має зійти до кидка, інакше кубик докрутиться під нею.
  await afterSplash(stage, olya);
  await click(olya, 'Кинути кубик');
  await diceRow(olya, 'Оля').locator('.die.is-rolling').waitFor();
  await shot(olya, 'dice7c-rolling-phone-olya');
  await diceRow(stage, 'Оля').locator('.die.is-rolling').waitFor();
  await shot(stage, 'dice7c-rolling-stage');
  // Поки кубик крутиться, результату не видно.
  expect(await diceValue(stage, 'Оля')).toBe('');
  for (const page of [stage, petro, host]) await expect.poll(() => diceValue(page, 'Оля'), POLL).toBe('5');
  // Кубик з результатом займає те саме місце, що й порожній.
  const shownBox = (await diceRow(stage, 'Оля').locator('.die').boundingBox())!;
  expect([shownBox.x, shownBox.y, shownBox.width, shownBox.height]).toEqual([dieBox.x, dieBox.y, dieBox.width, dieBox.height]);

  rigged.push(5);
  await click(petro, 'Кинути кубик');
  await diceRow(petro, 'Петро').locator('.die.is-rolling').waitFor();
  await shot(petro, 'dice7c-rolling-phone-petro');
  for (const page of [stage, olya]) await expect.poll(() => diceValue(page, 'Петро'), POLL).toBe('5');

  rigged.push(2);
  await click(ira, 'Кинути кубик');
  await diceRow(ira, 'Іра').locator('.die.is-rolling').waitFor();
  await shot(ira, 'dice7c-rolling-phone-ira');
  for (const page of [stage, olya, ira]) await expect.poll(() => diceValue(page, 'Іра'), POLL).toBe('2');
  await ira.getByText('Кубик кинуто. Чекаємо інших', exact).waitFor();
  expect(await diceRowsY(stage), 'stage dice rows moved').toEqual(stageY);
  expect(await diceRowsY(olya), 'phone dice rows moved').toEqual(olyaY);
  await stage.locator('.dice-status').getByText('Кидають: Макс', exact).waitFor();
  await shot(stage, 'dice7c-results-stage');

  // 3. Перепідключення: результати одразу, без повторного кружляння.
  await ira.reload();
  await ira.locator('.dice-rows li').nth(3).waitFor();
  expect(await ira.locator('.die.is-rolling').count()).toBe(0);
  expect(await diceValue(ira, 'Іра')).toBe('2');
  expect(await diceValue(ira, 'Оля')).toBe('5');

  // 4. Ведучий кидає за відсутнього Макса.
  rigged.push(3);
  await click(host, 'Кинути за тих, хто лишився');
  for (const page of [host, stage]) await expect.poll(() => diceValue(page, 'Макс'), POLL).toBe('3');
  await shot(host, 'dice7c-roll-for-rest-host');

  // 5. Нічия між Олею й Петром: перекидають лише вони.
  await stage.locator('.dice-status').getByText('Нічия! Перекидають: Оля, Петро', exact).waitFor();
  for (const page of [olya, petro]) await page.getByRole('button', { name: 'Кинути кубик', ...exact }).waitFor();
  await ira.getByText('Кубик кинуто. Чекаємо інших', exact).waitFor();
  expect(await ira.getByRole('button', { name: 'Кинути кубик', ...exact }).count()).toBe(0);
  expect(await start.isDisabled()).toBe(true);
  await host.getByText('Ще не кинули: Оля, Петро. Можна кинути за них.', exact).waitFor();
  expect(await diceRowsY(stage), 'stage dice rows moved on the tie').toEqual(stageY);
  await shot(stage, 'dice7c-tie-stage');
  await shot(olya, 'dice7c-tie-phone-olya');
  rigged.push(6);
  await click(olya, 'Кинути кубик');
  await expect.poll(() => diceValue(stage, 'Оля'), POLL).toBe('6');
  rigged.push(1);
  await click(petro, 'Кинути кубик');
  await expect.poll(() => diceValue(stage, 'Петро'), POLL).toBe('1');
  await stage.locator('.dice-status').getByText('Порядок визначено', exact).waitFor();
  expect(await diceRow(olya, 'Оля').locator('.dice-throws').textContent()).toBe('5 →');
  await expect.poll(() => diceValue(olya, 'Оля'), POLL).toBe('6');
  expect(await diceRowsY(stage), 'stage dice rows moved after the re-roll').toEqual(stageY);
  expect(await diceRowsY(olya), 'phone dice rows moved after the re-roll').toEqual(olyaY);

  // 6. Розклад кіл, коли кубики зупинилися.
  const circles = ['Коло 1: Оля → Петро → Макс → Іра', 'Коло 2: Петро → Макс → Іра → Оля', 'Коло 3: Макс → Іра → Оля → Петро'];
  for (const page of [stage, olya, host]) {
    await page.getByRole('heading', { name: 'Розклад ходів', ...exact }).waitFor();
    expect(await circleTexts(page)).toEqual(circles);
    expect(await page.getByText('Далі черга повторюється').count()).toBe(0);
    const lastRow = (await page.locator('.dice-rows li').last().boundingBox())!;
    const schedule = (await page.locator('.turn-schedule').boundingBox())!;
    if (page === stage) {
      // Широка сцена: розклад праворуч від рядків кидків, а не під ними.
      expect(schedule.x, 'stage: the schedule is not beside the dice').toBeGreaterThan(lastRow.x + lastRow.width - 1);
      expect(schedule.y, 'stage: the schedule is not beside the dice').toBeLessThan(lastRow.y);
    } else {
      // Телефон і ведучий: розклад нижче рядків кидків.
      expect(schedule.y).toBeGreaterThan(lastRow.y + lastRow.height - 1);
    }
  }
  // Поява розкладу не зсуває рядки кидків.
  expect(await diceRowsY(stage), 'stage dice rows moved when the schedule appeared').toEqual(stageY);
  expect(await diceRowsY(olya), 'phone dice rows moved when the schedule appeared').toEqual(olyaY);
  // Кубик стоїть поруч з ім'ям, а не на іншому краю сцени.
  const olyaRow = diceRow(stage, 'Оля');
  const nameBox = (await olyaRow.locator('.name').boundingBox())!;
  const olyaDie = (await olyaRow.locator('.die').boundingBox())!;
  expect(olyaDie.x - nameBox.x, 'stage: the die is far from the name').toBeLessThan(600);
  await expectIntroFits(stage, '7c intro 1600×900');
  await shot(stage, 'dice7c-schedule-stage');
  // Телевізор 720p: заставка разом із розкладом вміщається без прокрутки.
  await stage.setViewportSize({ width: 1280, height: 720 });
  await expectIntroFits(stage, '7c intro 1280×720');
  await shot(stage, 'dice7c-schedule-stage-1280');
  await stage.setViewportSize({ width: 1600, height: 900 });
  await shot(olya, 'dice7c-schedule-phone');
  await shot(host, 'dice7c-schedule-host');
  await expectNoSideScroll(olya, 'dice7c-schedule-phone-375');
  expect(await noSideScroll(petro), 'the 360 px phone scrolls sideways').toBe(true);
  expect(await start.isDisabled()).toBe(false);

  // 7. «Черга ходів» під час вибору клітинки.
  await click(host, 'Почати раунд');
  const aside = stage.locator('.board-aside');
  await aside.getByRole('heading', { name: 'Черга ходів', ...exact }).waitFor();
  expect(await circleTexts(stage, '.board-aside')).toEqual(circles);
  expect(await aside.locator('.turn-name.is-turn').allTextContents()).toEqual(['Оля']);
  await shot(stage, 'dice7c-queue-stage');
  // Поле з панеллю черги: поле ліворуч від колонки, не стиснуте, без прокрутки вбік.
  for (const [width, height] of [
    [1600, 900],
    [1280, 720],
    [1920, 1080],
  ] as const) {
    await stage.setViewportSize({ width, height });
    const board = (await stage.locator('.gb').boundingBox())!;
    const column = (await aside.boundingBox())!;
    console.log(`7c stage ${width}: board ${Math.round(board.width)}×${Math.round(board.height)} px, aside ${Math.round(column.width)} px`);
    expect(board.x + board.width, `stage ${width}: the board runs under the queue`).toBeLessThanOrEqual(column.x);
    expect(board.width, `stage ${width}: the board is squeezed`).toBeGreaterThan(width * 0.5);
    expect(column.y + column.height, `stage ${width}: the queue runs off the screen`).toBeLessThanOrEqual(height);
    expect(await noSideScroll(stage), `stage ${width}: horizontal scroll`).toBe(true);
    if (width !== 1600) await shot(stage, `dice7c-queue-stage-${width}`);
  }
  await stage.setViewportSize({ width: 1600, height: 900 });

  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  const queue = olya.locator('.turn-schedule');
  await queue.getByRole('heading', { name: 'Черга ходів', ...exact }).waitFor();
  expect(await queue.locator('.turn-name.is-turn').allTextContents()).toEqual(['Оля']);
  const legend = olya.locator('.gb-legend');
  const anchor = (await legend.count()) > 0 ? (await legend.boundingBox())! : (await olya.locator('.gb').boundingBox())!;
  expect((await queue.boundingBox())!.y, 'the queue sits under the legend').toBeGreaterThan(anchor.y + anchor.height - 1);
  await shot(olya, 'dice7c-queue-phone');
  await expectNoSideScroll(olya, 'dice7c-queue-phone-375');

  await olya.getByRole('button', { name: 'Міста, 100', ...exact }).click();
  await olya.getByRole('button', { name: /Київ/ }).click();
  await click(host, 'Прийняти');
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await click(host, 'Далі');
  const nextQuestion = host.getByRole('button', { name: 'Наступне запитання', ...exact });
  const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
  await Promise.race([nextQuestion.waitFor(), picking.waitFor()]);
  if (await nextQuestion.isVisible()) await nextQuestion.click();
  await picking.waitFor();
  await expect.poll(() => aside.locator('.turn-name.is-turn').allTextContents(), POLL).toEqual(['Петро']);
  expect(await aside.locator('.turn-name.is-done').allTextContents()).toEqual(['Оля']);
  await shot(stage, 'dice7c-queue-next-stage');
  const hostQueue = host.locator('.turn-schedule');
  await hostQueue.getByRole('heading', { name: 'Черга ходів', ...exact }).waitFor();
  expect(await hostQueue.locator('.turn-name.is-turn').allTextContents()).toEqual(['Петро']);
  await shot(host, 'dice7c-queue-host');

  // 8. Кінець гри.
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  expect(problems).toEqual([]);
}

it('part 7c: eight players — the stage board intro with dice in two columns and the schedule fits a 720p screen', async () => {
  try {
    await eightDice();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function eightDice() {
  const host = await open('host7c8', 1280, 900);
  await register(host, 'host', 'Ніна Ведуча', 'host7c8@example.com');
  const { code, stageUrl } = await hostDiceQuiz(host);
  const stage = await open('stage7c8', 1280, 720);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const names = ['Оля', 'Петро', 'Іра', 'Макс', 'Анастасія', 'Богдан', 'Віра', 'Ґанна'];
  // Дешевше за вісім живих телефонів: кожен заходить і йде, за всіх кидає ведучий.
  for (const [index, nickname] of names.entries()) {
    const name = `p7c8-${index}`;
    const phone = await open(name, 360, 640);
    await join(phone, code, nickname, false);
    await phone.context().close();
    pages.delete(name);
  }
  await stage.getByText('Ґанна').waitFor();

  await click(host, 'Почати гру');
  await click(host, 'Кидати кубики');
  await stage.locator('.dice-rows li').nth(7).waitFor();
  expect(await stage.locator('.dice-rows.is-many').count()).toBe(1);
  const startY = await diceRowsY(stage);
  // Довгий рядок стану з вісьмома іменами видно цілим і без прокрутки вбік.
  const status = (await stage.locator('.dice-status').evaluate((el) => ({ full: el.scrollWidth <= el.clientWidth }))) as { full: boolean };
  expect(status.full, 'stage: the status line is cut').toBe(true);
  expect(await noSideScroll(stage), 'stage 8 players: horizontal scroll').toBe(true);
  await shot(stage, 'dice7c-start-stage-8-1280');
  // Нічия Олі з Вірою й Петра з Ґанною, потім перекидання без нічиєї.
  rigged.push(6, 5, 4, 3, 2, 1, 6, 5);
  await click(host, 'Кинути за тих, хто лишився');
  await stage.locator('.dice-status').getByText('Нічия! Перекидають: Оля, Петро, Віра, Ґанна', exact).waitFor();
  rigged.push(6, 5, 4, 3);
  await click(host, 'Кинути за тих, хто лишився');
  await stage.locator('.dice-status').getByText('Порядок визначено', exact).waitFor();
  await stage.getByRole('heading', { name: 'Розклад ходів', ...exact }).waitFor();
  expect(await diceRowsY(stage), 'stage dice rows moved').toEqual(startY);
  await expectIntroFits(stage, '7c 8 players 1280×720');
  await shot(stage, 'dice7c-schedule-stage-8-1280');
  await stage.setViewportSize({ width: 1600, height: 900 });
  await expectIntroFits(stage, '7c 8 players 1600×900');
  await shot(stage, 'dice7c-schedule-stage-8-1600');

  expect(problems).toEqual([]);
}

it('part 7d: host points with a notice everywhere, totals in the history and my games; six debuffs on the target phone only, a bug on the stage, cancel before it fires, answering still works', async () => {
  try {
    await pranksGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function pranksGame() {
  const host = await open('host7d', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host7d@example.com');
  const olya = await open('olya7d', 375, 812);
  await register(olya, 'menu', 'Оля', 'olya7d@example.com');

  // Шість запитань з одним варіантом і останнє з кнопкою «Відповісти»: сповіщення внизу не має її закривати.
  // Чотири варіанти: на сцені нижній правий кут зайнятий, значки й сповіщення не мають його накривати.
  const options = [...single.options, { id: 'd', text: 'Харків' }];
  const questions = [
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ ...withId(single, `q${n}`), options, text: `Запитання ${n}: столиця України?`, timeLimit: 30 })),
    { ...withId(multi, 'q7'), text: 'Запитання 7: які міста стоять на Дніпрі?', timeLimit: 30 },
  ];
  const data = { ...makeQuiz(questions, { speedBonus: false }), title: 'Пакості' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7d', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const petro = await open('petro7d', 360, 740);
  const ira = await open('ira7d', 390, 844);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const rowScore = async (nickname: string) => (await row(nickname).locator('.score').textContent())!;
  const tool = async (nickname: string, kind: 'Бали' | 'Дебаф') => {
    const button = row(nickname).getByRole('button', { name: kind, ...exact });
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await row(nickname).locator('.player-tools').waitFor();
  };
  const cast = async (nickname: string, kind: RegExp) => {
    await tool(nickname, 'Дебаф');
    await row(nickname).locator('.player-tools').getByRole('button', { name: kind }).click();
    await row(nickname).locator('.debuff-tag').waitFor();
  };
  const badge = (nickname: string) => stage.locator('.stage-debuffs li', { hasText: nickname });
  // Останній, хто відповів, одразу бачить «Чекаємо на правильну відповідь»: запитання закривається само.
  const answer = async (page: Page, text: RegExp) => {
    await page.getByRole('button', { name: text }).click();
    await page.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
  };
  const toTable = async () => {
    await click(host, 'Показати відповідь');
    await click(host, 'Далі');
    await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();
  };
  const nextQuestion = async (n: number) => {
    await click(host, 'Наступне запитання');
    await olya.locator('h1', { hasText: `Запитання ${n}:` }).waitFor();
  };
  const zoneKind = (page: Page) => page.locator('.debuff-zone').getAttribute('data-debuff');

  // 1. Лобі: біля гравця лише «Вилучити».
  await row('Оля').waitFor();
  expect(await row('Оля').getByRole('button', { name: 'Бали', ...exact }).count()).toBe(0);
  expect(await row('Оля').getByRole('button', { name: 'Дебаф', ...exact }).count()).toBe(0);
  expect(await row('Оля').getByRole('button', { name: 'Вилучити', ...exact }).count()).toBe(1);

  // 2. Бали з заставки: −100 Олі, сповіщення на сцені й у всіх телефонах, нічого не зсувається.
  await click(host, 'Почати гру');
  await petro.locator('h1').first().waitFor();
  const petroH1 = (await petro.locator('h1').first().boundingBox())!.y;
  await tool('Оля', 'Бали');
  await row('Оля').getByLabel('Своя сума', exact).waitFor();
  await shot(host, 'points7d-panel-host');
  await row('Оля').getByRole('button', { name: '−100', ...exact }).click();
  for (const page of [stage, olya, petro, ira]) await page.locator('.live-notice').getByText('Ведучий: −100 — Оля', exact).waitFor();
  await stage.waitForTimeout(300); // сповіщення проявляється 0,25 с
  await shot(stage, 'points7d-notice-stage');
  await shot(petro, 'points7d-notice-phone-petro');
  expect((await petro.locator('h1').first().boundingBox())!.y).toBe(petroH1);
  expect(await olya.locator('header.bar .score').textContent()).toBe('−100');
  expect(await rowScore('Оля')).toBe('−100');
  await petro.locator('.live-notice').waitFor({ state: 'detached', timeout: 6000 });
  await stage.locator('.live-notice').waitFor({ state: 'detached', timeout: 1000 });
  expect((await petro.locator('h1').first().boundingBox())!.y).toBe(petroH1);

  // 3. Туман Олі: значок на сцені, ціль до запитання нічого не бачить.
  await tool('Оля', 'Дебаф');
  await shot(host, 'debuff7d-panel-host');
  await row('Оля').locator('.player-tools').getByRole('button', { name: /Туман/ }).click();
  await row('Оля').locator('.debuff-tag').getByText('🌫️ Туман · чекає', exact).waitFor();
  await badge('Оля').getByText('🐞 Оля', exact).waitFor();
  await shot(stage, 'debuff7d-badge-stage');
  expect(await olya.locator('.debuff-zone').count()).toBe(0);
  expect(await olya.getByText('На вас наслано').count()).toBe(0);

  await click(host, 'Почати раунд');
  await olya.locator('.debuff-zone[data-debuff="fog"]').waitFor();
  await olya.getByText('На вас наслано: Туман').waitFor();
  // Банер — смужка внизу: запитання й варіанти під туманом лишаються видимими.
  await expectApart(olya, '.debuff-banner', ['.debuff-zone h1', '.choice'], 'fog banner 375×812');
  await shot(olya, 'debuff7d-fog-phone');
  for (const page of [petro, ira]) {
    await page.locator('.debuff-zone').waitFor();
    expect(await zoneKind(page)).toBeNull();
    expect(await page.locator('.debuff-layer').count()).toBe(0);
  }
  expect(await stage.locator('[data-debuff]').count()).toBe(0);
  await badge('Оля').waitFor();
  await row('Оля').locator('.debuff-tag').getByText('🌫️ Туман · діє', exact).waitFor();
  expect(await host.getByRole('button', { name: 'Скасувати дебаф', ...exact }).count()).toBe(0);
  const zone = (await olya.locator('.debuff-zone').boundingBox())!;
  await wipeWithMouse(
    olya,
    [[0.2, 0.3], [0.5, 0.35], [0.8, 0.4], [0.5, 0.6], [0.3, 0.7]].map(([fx, fy]) => [zone.x + zone.width * fx!, zone.y + zone.height * fy!]),
  );
  await expect.poll(async () => Number(await olya.locator('.debuff-fog').getAttribute('data-cleared'))).toBeGreaterThan(0);
  await olya.waitForTimeout(100);
  await shot(olya, 'debuff7d-fog-wiped');
  await answer(olya, /Київ/);
  await expectNoSideScroll(olya, 'debuff7d-fog-375');
  await answer(petro, /Львів/);
  await answer(ira, /Київ/);
  await stage.locator('.stage-debuffs').waitFor({ state: 'detached' });
  await toTable();

  // 4. Три дебафи разом: значки на сцені 1280×720 не накривають таблицю, запитання й таймер.
  await cast('Іра', /Тремтіння/);
  await cast('Петро', /Заморозка/);
  await cast('Оля', /Тремтіння/);
  await stage.locator('.stage-debuffs li').nth(2).waitFor();
  await stage.setViewportSize({ width: 1280, height: 720 });
  await expectApart(stage, '.stage-debuffs', ['.standings li', 'h1'], 'stage table 1280×720');
  await shot(stage, 'debuff7d-badges3-table-stage-1280');

  // 5. Тремтіння (Іра, Оля) і заморозка (Петро) на запитанні 2.
  await nextQuestion(2);
  await stage.getByRole('timer').first().waitFor();
  await expectApart(stage, '.stage-debuffs', ['h1', '[role="timer"]', '.choice', '.question-head'], 'stage question 1280×720');
  await shot(stage, 'debuff7d-badges3-question-stage-1280');
  await stage.setViewportSize({ width: 1600, height: 900 });
  await ira.locator('.debuff-zone.is-shake').waitFor();
  await shot(ira, 'debuff7d-shake-phone');
  await petro.locator('fieldset.debuff-content[disabled]').waitFor();
  await petro.locator('.debuff-ice').waitFor();
  // Банер живе 3 с від спрацювання: перевіряємо, якщо він ще на екрані.
  if ((await petro.locator('.debuff-banner').count()) > 0) {
    await expectApart(petro, '.debuff-banner', ['.debuff-zone h1', '.choice'], 'freeze banner 360×740');
  }
  await shot(petro, 'debuff7d-freeze-phone');
  const petroKyiv = petro.getByRole('button', { name: /Київ/ });
  expect(await petroKyiv.isDisabled()).toBe(true);
  await answer(ira, /Київ/);
  await answer(olya, /Київ/);
  await expect.poll(() => petroKyiv.isDisabled(), { timeout: 7000 }).toBe(false);
  await answer(petro, /Київ/);
  await toTable();

  // 6. Дзеркало (Іра) на запитанні 3: варіанти міняються місцями, вибір іде за id.
  await cast('Іра', /Дзеркало/);
  await nextQuestion(3);
  await ira.locator('.debuff-zone.is-mirror').waitFor();
  const transform = await ira
    .locator('.debuff-content')
    .evaluate((el) => (globalThis as unknown as { getComputedStyle: (e: unknown) => { transform: string } }).getComputedStyle(el).transform);
  expect(transform).toMatch(/^matrix\(-1/);
  const before = await ira.locator('.choice').allTextContents();
  await expect.poll(() => ira.locator('.choice').allTextContents(), { timeout: 5500 }).not.toEqual(before);
  await shot(ira, 'debuff7d-mirror-phone');
  await answer(ira, /Київ/);
  await answer(olya, /Київ/);
  await answer(petro, /Київ/);
  await click(host, 'Показати відповідь');
  await ira.getByText('Правильно!').waitFor();
  await click(host, 'Далі');
  await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();

  // 7. Скасування до спрацювання (Петро) і бруд (Оля) на запитанні 4.
  await cast('Петро', /Гості/);
  await badge('Петро').getByText('🐞 Петро', exact).waitFor();
  await row('Петро').getByRole('button', { name: 'Скасувати дебаф', ...exact }).click();
  await badge('Петро').waitFor({ state: 'detached' });
  await row('Петро').locator('.debuff-tag').waitFor({ state: 'detached' });
  await cast('Оля', /Брудний/);
  await nextQuestion(4);
  await petro.locator('.debuff-zone').waitFor();
  expect(await zoneKind(petro)).toBeNull();
  await olya.locator('.debuff-splat').nth(5).waitFor();
  expect(await olya.locator('.debuff-splat').count()).toBe(6);
  await olya.getByText('На вас наслано: Брудний екран').waitFor();
  await expectApart(olya, '.debuff-banner', ['.debuff-zone h1', '.choice'], 'mud banner 375×812');
  await shot(olya, 'debuff7d-mud-phone');
  const splat = (await olya.locator('.debuff-splat').first().boundingBox())!;
  await wipeWithMouse(
    olya,
    Array.from({ length: 5 }, (_, i) => [splat.x + splat.width / 2 + (i % 2 === 0 ? -2 : 2), splat.y + splat.height / 2]),
  );
  await expect.poll(() => olya.locator('.debuff-splat').count()).toBe(5);
  await answer(olya, /Київ/);
  await expectNoSideScroll(olya, 'debuff7d-mud-375');
  await answer(petro, /Київ/);
  await answer(ira, /Київ/);
  await toTable();

  // 8. Спокійні варіанти: гості (Оля) і тремтіння (Іра) зі зменшеною анімацією.
  await olya.emulateMedia({ reducedMotion: 'reduce' });
  await ira.emulateMedia({ reducedMotion: 'reduce' });
  await cast('Оля', /Гості/);
  await cast('Іра', /Тремтіння/);
  await nextQuestion(5);
  await olya.locator('.debuff-zone.is-guests.is-calm').waitFor();
  expect(await olya.locator('.debuff-guest').count()).toBe(5);
  await olya.waitForTimeout(2000); // спокійні гості повільно проявляються
  await shot(olya, 'debuff7d-guests-calm-phone');
  await expectNoSideScroll(olya, 'debuff7d-guests-375');
  await ira.locator('.debuff-zone.is-shake.is-calm').waitFor();
  await shot(ira, 'debuff7d-shake-calm-phone');
  await answer(olya, /Київ/);
  await answer(ira, /Київ/);
  await answer(petro, /Київ/);
  await olya.emulateMedia({ reducedMotion: 'no-preference' });
  await ira.emulateMedia({ reducedMotion: 'no-preference' });
  await toTable();

  // 9. Гості з анімацією (Петро) на запитанні 6; в інших дебафу немає.
  await cast('Петро', /Гості/);
  await nextQuestion(6);
  await petro.locator('.debuff-zone.is-guests:not(.is-calm)').waitFor();
  await petro.waitForTimeout(1500);
  await shot(petro, 'debuff7d-guests-phone');
  expect(await zoneKind(olya)).toBeNull();
  expect(await zoneKind(ira)).toBeNull();
  await answer(petro, /Київ/);
  await answer(olya, /Київ/);
  await answer(ira, /Київ/);
  await toTable();

  // 10. Своя сума посеред запитання 7: сповіщення внизу не заважає відповісти й не накриває запитання на сцені.
  await nextQuestion(7);
  const petroScore = await rowScore('Петро');
  await tool('Петро', 'Бали');
  await row('Петро').getByLabel('Своя сума', exact).fill('abc');
  await row('Петро').getByRole('button', { name: 'Нарахувати', ...exact }).click();
  await row('Петро').getByText('Введіть ціле число, наприклад −150 або 75.').waitFor();
  expect(await rowScore('Петро')).toBe(petroScore);
  await row('Петро').getByLabel('Своя сума', exact).fill('75');
  await row('Петро').getByRole('button', { name: 'Нарахувати', ...exact }).click();
  await olya.locator('.live-notice').getByText('Ведучий: +75 — Петро', exact).waitFor();
  await stage.locator('.live-notice').getByText('Ведучий: +75 — Петро', exact).waitFor();
  await olya.getByRole('button', { name: /Київ/ }).click();
  await olya.getByRole('button', { name: /Черкаси/ }).click();
  const submit = olya.getByRole('button', { name: 'Відповісти', ...exact });
  const noticeBox = (await olya.locator('.live-notice').boundingBox())!;
  expect(overlaps(noticeBox, (await submit.boundingBox())!), 'the notice covers «Відповісти» on 375').toBe(false);
  await olya.waitForTimeout(300); // сповіщення проявляється 0,25 с
  await shot(olya, 'points7d-notice-question-phone-375');
  await shot(stage, 'points7d-notice-question-stage');
  await expectApart(stage, '.live-notice', ['h1', '[role="timer"]', '.choice'], 'stage notice during a question');
  await submit.click();
  await olya.getByText('Відповідь прийнято').waitFor();
  expect(await olya.locator('.live-notice').count(), 'the answer went while the notice was still shown').toBe(1);
  for (const page of [petro, ira]) {
    await page.getByRole('button', { name: /Київ/ }).click();
    await page.getByRole('button', { name: /Черкаси/ }).click();
    await click(page, 'Відповісти');
  }
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');

  // 11. Підсумки: таблиця сцени = історія = «Мої ігри».
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const scores = async (page: Page) => {
    const rows = page.locator('.standings li');
    await rows.first().waitFor();
    const result: Record<string, string> = {};
    for (let i = 0; i < (await rows.count()); i++) {
      result[(await rows.nth(i).locator('.name').textContent())!] = (await rows.nth(i).locator('.score').textContent())!;
    }
    return result;
  };
  const totals = await scores(stage);
  expect(totals).toEqual({ Іра: '7000', Оля: '6900', Петро: '6075' });
  await shot(stage, 'points7d-final-stage');

  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Пакості/ }).click();
  expect(await scores(host)).toEqual(totals);
  await host.getByText('Бали від ведучого: Оля −100, Петро +75', exact).waitFor();
  await shot(host, 'points7d-history-host');

  await olya.goto(`${base}/me`);
  const mine = olya.locator('.quiz-list li', { hasText: 'Пакості' });
  await mine.waitFor();
  expect(await mine.textContent()).toContain(`${totals['Оля']} балів`);
  await expectNoSideScroll(olya, 'points7d-my-games-phone');

  expect(problems).toEqual([]);
}

it('part 7e: all-in on the phone and ВА-БАНК! on the stage, the wager type in the editor, a bank final with a growing bank and a proportional split with the remainder, a refund when nobody is right, the history and my games match', async () => {
  try {
    await bankGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function bankGame() {
  const host = await open('host7e', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host7e@example.com');
  const petro = await open('petro7e', 360, 740);
  await register(petro, 'menu', 'Петро', 'petro7e@example.com');

  // Класичний раунд без бонусу за швидкість і два фінали: «Космос» (поки класичний) і «Історія» (спільний банк).
  const question = (id: string, text: string, points: number) => ({ ...withId(withPoints(single, points), id), text, timeLimit: 30 });
  const rounds = [
    classicRound('r1', [question('q1', 'Запитання 1: столиця України?', 1000), question('q2', 'Запитання 2: столиця України?', 500)], {
      speedBonus: false,
    }),
    finalRound('r2', question('f1', 'Фінал 1: столиця України?', 1000), { title: 'Космос', wagerMode: 'classic' }),
    finalRound('r3', question('f2', 'Фінал 2: столиця України?', 1000), { title: 'Історія', wagerMode: 'bank' }),
  ];
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end' }), title: 'Банк' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Редактор: у фіналі «Космос» тип ставок стає «Спільний банк», з'являється підказка.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Банк' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.getByRole('button', { name: 'Космос', ...exact }).click();
  await openRoundSettings(host);
  const mode = host.locator('label.field', { hasText: 'Тип ставок' }).locator('select');
  expect(await mode.inputValue()).toBe('classic');
  await host.getByText('Правильна відповідь додає ставку, неправильна забирає.', exact).waitFor();
  await mode.selectOption('bank');
  await host
    .getByText('Хто помилився, віддає ставку в банк; хто відповів правильно, ділить банк пропорційно своїм ставкам.', exact)
    .waitFor();
  await shot(host, 'bank7e-editor-host');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'bank7e-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  await host.locator('.quiz-list li', { hasText: 'Банк' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7e', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya7e', 375, 812);
  const ira = await open('ira7e', 390, 844);
  const marko = await open('marko7e', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await join(marko, code, 'Марко', false);
  await stage.getByText('Марко').waitFor();

  const phones = [olya, petro, ira, marko];
  const pick = async (page: Page, right: boolean) => {
    await page.getByRole('button', { name: right ? /Київ/ : /Львів/ }).click();
    await page.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
  };
  const hostScore = async (nickname: string) => (await host.locator('.player-row', { hasText: nickname }).locator('.score').textContent())!;
  const flat = (text: string | null) => (text ?? '').replace(/\s/g, '');
  // Без коду гри: у ньому випадково можуть трапитися ті самі цифри, що й у частках.
  const visible = async (page: Page) => (await bodyText(page)).replaceAll(`${code.slice(0, 3)} ${code.slice(3)}`, '').replaceAll(code, '');
  const row = (nickname: string) => stage.locator('.wager-list li', { hasText: nickname });
  const rowText = async (nickname: string) => flat(await row(nickname).textContent());
  const meter = stage.locator('.bank-meter');
  const meterSays = (text: string) => meter.getByText(text, exact).waitFor();
  const meterY = async () => (await meter.boundingBox())!.y;
  const meterH = async () => (await meter.boundingBox())!.height;
  // Розташування колонок рядка на сцені: розподіл і повернення ставок не мають нічого зсувати.
  const columns = async (nickname: string) => {
    const box = async (selector: string) => {
      const b = (await row(nickname).locator(selector).boundingBox())!;
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width)];
    };
    return { given: await box('.given'), stake: await box('.wager-stake'), delta: await box('.wager-delta'), share: await box('.wager-share') };
  };

  // 1. Класичний раунд: Оля 1500, Петро 1000, Іра 500, Марко 1000.
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  await olya.locator('h1', { hasText: 'Запитання 1:' }).waitFor();
  await pick(olya, true);
  await pick(petro, true);
  await pick(ira, false);
  await pick(marko, true);
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await olya.locator('h1', { hasText: 'Запитання 2:' }).waitFor();
  await pick(olya, true);
  await pick(petro, false);
  await pick(ira, true);
  await pick(marko, false);
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await host.getByRole('button', { name: 'Наступний раунд', ...exact }).waitFor();
  await expect
    .poll(async () => [await hostScore('Оля'), await hostScore('Петро'), await hostScore('Іра'), await hostScore('Марко')])
    .toEqual(['1500', '1000', '500', '1000']);

  // 2. Заставка фіналу 1: тема й правило спільного банку.
  await click(host, 'Наступний раунд');
  await stage.getByRole('heading', { name: 'Космос' }).waitFor();
  await stage
    .getByText('Хто помилився або не відповів, віддає ставку в спільний банк; хто відповів правильно, зберігає свою й ділить банк пропорційно ставкам.', exact)
    .waitFor();
  await shot(stage, 'bank7e-intro-stage');

  // 3. Ставки: Іра — ва-банк кнопкою, Оля 1000, Петро 300, Марко 400.
  await click(host, 'Почати фінал');
  await ira.getByText('Ваша ставка від 0 до 500', exact).waitFor();
  await ira.getByText('Спільний банк: помилка віддає ставку в банк, правильні відповіді його ділять.', exact).waitFor();
  await click(ira, 'Ва-банк');
  await ira.getByText('Ваша ставка: 500 — ва-банк!', exact).waitFor();
  await shot(ira, 'bank7e-allin-phone');
  await olya.getByRole('button', { name: 'Ва-банк', ...exact }).waitFor();
  await expectNoSideScroll(olya, 'bank7e-wager-375');
  // «Ва-банк» стоїть у рядку з полем ставки й не переноситься.
  const input = (await olya.getByLabel('Ставка', exact).boundingBox())!;
  const allInButton = (await olya.getByRole('button', { name: 'Ва-банк', ...exact }).boundingBox())!;
  expect(allInButton.y).toBeLessThan(input.y + input.height);
  expect(allInButton.y + allInButton.height).toBeGreaterThan(input.y);
  await olya.getByLabel('Ставка', exact).fill('1000');
  await click(olya, 'Поставити');
  await olya.getByText('Ваша ставка: 1000', exact).waitFor();
  await petro.getByLabel('Ставка', exact).fill('300');
  await click(petro, 'Поставити');
  await petro.getByText('Ваша ставка: 300', exact).waitFor();
  await host.getByText('Поставили 3 з 4').waitFor();
  const allInRows = host.locator('li', { has: host.locator('.allin-tag') });
  await allInRows.first().waitFor();
  expect(await allInRows.count()).toBe(1);
  expect(await allInRows.textContent()).toContain('Іра');
  await shot(host, 'bank7e-wagers-host');
  await stage.getByText('Ставки зроблено: 3 з 4').waitFor();
  expect(await bodyText(stage)).not.toMatch(/ва-банк|Ставка/i);
  await marko.getByLabel('Ставка', exact).fill('400');
  await click(marko, 'Поставити');

  // 4. Запитання відкривається само: Оля й Іра помиляються, Петро й Марко відповідають правильно.
  await olya.locator('h1', { hasText: 'Фінал 1:' }).waitFor();
  await pick(olya, false);
  await pick(ira, false);
  await pick(petro, true);
  await pick(marko, true);
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  expect(await bodyText(stage)).not.toMatch(/ВА-БАНК|Банк:/);

  // 5. Розкриття від найменшого рахунку: Іра 500, Петро 1000, Марко 1000, Оля 1500.
  await click(host, 'Показати відповідь');
  await meterSays('Банк: 0');
  expect(await stage.locator('.wager-list li').count()).toBe(0);
  for (const page of [stage, ...phones]) expect(await visible(page)).not.toMatch(/ВА-БАНК|з банку|ставки повертаються/);
  // Від першого розкриття до розподілу лічильник банку стоїть на місці.
  const y0 = await meterY();

  await click(host, 'Наступний гравець');
  await row('Іра').waitFor();
  await meterSays('Банк: 500');
  const ira1 = await rowText('Іра');
  expect(ira1).toContain('ВА-БАНК!');
  expect(ira1).toContain('убанк');
  expect(ira1).toContain('500→0');
  expect(await stage.locator('.wager-list li').count()).toBe(1);
  expect(await meterY()).toBe(y0);
  await shot(stage, 'bank7e-allin-stage');

  await click(host, 'Наступний гравець');
  await row('Петро').waitFor();
  const petro1 = await rowText('Петро');
  expect(petro1).toContain('ставкузбережено');
  expect(petro1).toContain('1000→1000');
  expect(petro1).not.toContain('ВА-БАНК');
  await meterSays('Банк: 500');
  await petro.getByText('Ставку збережено — чекаємо на розподіл банку', exact).waitFor();
  expect(await row('Марко').count()).toBe(0);
  expect(await row('Оля').count()).toBe(0);
  for (const page of [stage, ...phones]) expect(await visible(page)).not.toMatch(/642|858|з банку|ставки повертаються/);
  expect(await meterY()).toBe(y0);

  await click(host, 'Наступний гравець');
  await row('Марко').waitFor();
  expect(await rowText('Марко')).toContain('1000→1000');
  await meterSays('Банк: 500');
  expect(await row('Оля').count()).toBe(0);
  await olya.getByText('Чекаємо на розкриття', exact).waitFor();
  for (const page of [stage, ...phones]) expect(await visible(page)).not.toMatch(/642|858|1500→500|з банку|ставки повертаються/);
  expect(await meterY()).toBe(y0);

  await click(host, 'Наступний гравець');
  await row('Оля').waitFor();
  await meterSays('Банк: 1500');
  const olya1 = await rowText('Оля');
  expect(olya1).toContain('убанк');
  expect(olya1).toContain('1500→500');
  expect(olya1).not.toContain('ВА-БАНК');
  for (const page of [stage, ...phones]) expect(await visible(page)).not.toMatch(/642|858|з банку|ставки повертаються|Розділити/);
  expect(await meterY()).toBe(y0);
  await shot(stage, 'bank7e-bank-grown-stage');

  // Розподіл: кнопку бачить лише ведучий; частки 642 і 858 (залишок 1 — Маркові з найбільшою ставкою).
  await host.getByRole('button', { name: 'Розділити банк', ...exact }).waitFor();
  const beforeSplit = { petro: await columns('Петро'), ira: await columns('Іра') };
  // «ВА-БАНК!» Іри живе в колонці імені: відповідь, ставка й рахунок стоять у тих самих колонках, що в Петра.
  expect(beforeSplit.ira.given[0]).toBe(beforeSplit.petro.given[0]);
  expect(beforeSplit.ira.stake[0]).toBe(beforeSplit.petro.stake[0]);
  expect(beforeSplit.ira.delta[0]).toBe(beforeSplit.petro.delta[0]);
  const hostShareBefore = (await host.locator('.wager-list li', { hasText: 'Петро' }).locator('.wager-share').boundingBox())!;
  await click(host, 'Розділити банк');
  await meterSays('Банк 1500 розділено');
  await expect.poll(() => rowText('Петро')).toContain('1000→1642');
  expect({ petro: await columns('Петро'), ira: await columns('Іра') }).toEqual(beforeSplit);
  await host.locator('.wager-list li', { hasText: 'Петро' }).getByText('+642 з банку', exact).waitFor();
  const hostShareAfter = (await host.locator('.wager-list li', { hasText: 'Петро' }).locator('.wager-share').boundingBox())!;
  expect([hostShareAfter.x, hostShareAfter.y, hostShareAfter.width]).toEqual([hostShareBefore.x, hostShareBefore.y, hostShareBefore.width]);
  expect(await rowText('Петро')).toContain('+642збанку');
  expect(await rowText('Марко')).toContain('1000→1858');
  expect(await rowText('Марко')).toContain('+858збанку');
  expect(await rowText('Оля')).toContain('1500→500');
  expect(await rowText('Іра')).toContain('500→0');
  expect(await meterY()).toBe(y0);
  await petro.getByText('+642 з банку', exact).waitFor();
  await petro.getByText('Рахунок: 1642', exact).waitFor();
  await olya.getByText('Ставка пішла в банк', exact).waitFor();
  await shot(stage, 'bank7e-split-stage');
  await shot(petro, 'bank7e-split-phone');
  await expectNoSideScroll(olya, 'bank7e-result-375');

  // 6. Фінал 2: ніхто не відповідає правильно — ставки повертаються.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await stage.getByRole('heading', { name: 'Історія' }).waitFor();
  await click(host, 'Почати фінал');
  await ira.getByRole('button', { name: 'Поставити 0', ...exact }).waitFor();
  expect(await ira.getByRole('button', { name: 'Ва-банк', ...exact }).count()).toBe(0);
  await click(ira, 'Поставити 0');
  await olya.getByText('Ваша ставка від 0 до 500', exact).waitFor();
  await click(olya, 'Ва-банк');
  await olya.getByText('Ваша ставка: 500 — ва-банк!', exact).waitFor();
  await petro.getByText('Ваша ставка від 0 до 1642', exact).waitFor();
  await petro.getByLabel('Ставка', exact).fill('600');
  await click(petro, 'Поставити');
  await petro.getByText('Ваша ставка: 600', exact).waitFor();
  await marko.getByLabel('Ставка', exact).fill('0');
  await click(marko, 'Поставити');
  await olya.locator('h1', { hasText: 'Фінал 2:' }).waitFor();
  await pick(ira, false);
  await pick(olya, false);
  await pick(petro, false);
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  await meterSays('Банк: 0');
  expect(await stage.locator('.wager-list li').count()).toBe(0);

  // Розкриття: Іра 0, Оля 500, Петро 1642, Марко 1858.
  await click(host, 'Наступний гравець');
  await row('Іра').waitFor();
  await meterSays('Банк: 0');
  expect(await rowText('Іра')).toContain('0→0');
  await click(host, 'Наступний гравець');
  await row('Оля').waitFor();
  await meterSays('Банк: 500');
  expect(await rowText('Оля')).toContain('ВА-БАНК!');
  expect(await rowText('Оля')).toContain('500→0');
  expect(await row('Петро').count()).toBe(0);
  for (const page of [stage, ...phones]) expect(await visible(page)).not.toMatch(/ставки повертаються|1100/);
  await click(host, 'Наступний гравець');
  await row('Петро').waitFor();
  await meterSays('Банк: 1100');
  expect(await rowText('Петро')).toContain('1642→1042');
  await click(host, 'Наступний гравець');
  await row('Марко').waitFor();
  await meterSays('Банк: 1100');
  expect(await rowText('Марко')).toContain('1858→1858');
  for (const page of [stage, ...phones]) expect(await visible(page)).not.toMatch(/ставки повертаються|Розділити/);
  expect(await rowText('Іра')).not.toContain('убанк');
  const beforeRefund = { olya: await columns('Оля'), meter: await meterH(), y: await meterY() };

  await click(host, 'Розділити банк');
  // На сцені коротко й в один рядок; повне пояснення — на телефоні.
  await meterSays('Ставки повернуто');
  await expect.poll(() => rowText('Оля')).toContain('500→500');
  expect(await rowText('Петро')).toContain('1642→1642');
  expect(await rowText('Оля')).toContain('ставкуповернуто');
  expect(await rowText('Петро')).toContain('ставкуповернуто');
  expect(await rowText('Іра')).not.toMatch(/убанк|повернуто/);
  expect(await visible(stage)).not.toMatch(/у банк|з банку/);
  expect({ olya: await columns('Оля'), meter: await meterH(), y: await meterY() }).toEqual(beforeRefund);
  await olya.getByText('Ніхто не відповів правильно — ставки повертаються', exact).waitFor();
  await shot(stage, 'bank7e-refund-stage');

  // 7. Переможці: Марко 1858, Петро 1642, Оля 500, Іра 0.
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const scores = async (page: Page) => {
    const rows = page.locator('.standings li');
    await rows.first().waitFor();
    const result: [string, string][] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      result.push([(await rows.nth(i).locator('.name').textContent())!, (await rows.nth(i).locator('.score').textContent())!]);
    }
    return result;
  };
  const totals = await scores(stage);
  expect(totals).toEqual([
    ['Марко', '1858'],
    ['Петро', '1642'],
    ['Оля', '500'],
    ['Іра', '0'],
  ]);
  await shot(stage, 'bank7e-final-stage');

  // 8. Історія: ті самі рахунки, ставки зі збереженої колонки, обидва фінали — спільний банк.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Банк/ }).click();
  expect(await scores(host)).toEqual(totals);
  const finals = host.locator('div.wager-list');
  await finals.nth(1).waitFor();
  expect(await finals.count()).toBe(2);
  const lines = async (at: number) => (await finals.nth(at).locator('li').allTextContents()).map(flat);
  expect(await finals.nth(0).locator('h4').textContent()).toBe('Ставки фіналу · спільний банк');
  expect(await finals.nth(1).locator('h4').textContent()).toBe('Ставки фіналу · спільний банк');
  expect(await lines(0)).toEqual(
    expect.arrayContaining(['Оля:ставка1000,−1000', 'Петро:ставка300,+642', 'Іра:ставка500,−500', 'Марко:ставка400,+858']),
  );
  expect(await lines(1)).toEqual(expect.arrayContaining(['Оля:ставка500,0', 'Петро:ставка600,0', 'Іра:ставка0,0', 'Марко:ставка0,0']));
  await shot(host, 'bank7e-history-host');

  // 9. «Мої ігри» й ачівка Петра.
  await petro.goto(`${base}/me`);
  const mine = petro.locator('.quiz-list li', { hasText: 'Банк' });
  await mine.waitFor();
  expect(await mine.textContent()).toContain('1642 бали');
  await expectNoSideScroll(petro, 'bank7e-my-games-phone');
  await petro.goto(`${base}/profile`);
  await petro.locator('.achievement-showcase').getByRole('button', { name: 'Влучна ставка', exact: true }).waitFor();

  expect(problems).toEqual([]);
}

it('part 7f: sorting — the editor, 2/3/4 zones by drag, tap and arrow, a mistake with a lock and a retry, stage progress without answers, the reveal by category, a board cell for the chooser only, a blitz won by the fastest, a final only for all words, the history', async () => {
  try {
    await sortGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Слово на 40 символів без пробілів: найгірший випадок для середини телефона з чотирма зонами. */
const LONG_SORT = 'Найнайнайзолотистожовтогарячолистопадний';

async function sortGame() {
  const host = await open('host7f', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host7f@example.com');

  /** Правильна категорія кожного слова: лише в тесті, телефон її не знає. */
  const where: Record<string, string> = {};
  const sortQuestion = (id: string, text: string, categories: string[], words: [string, number][], points: number, lockSeconds: number, timeLimit: number) => {
    for (const [word, at] of words) where[word] = categories[at]!;
    return {
      id,
      type: 'sort' as const,
      text,
      imageUrl: null,
      video: null,
      timeLimit,
      points,
      lockSeconds,
      categories: categories.map((category, at) => ({ id: `${id}-c${at}`, text: category })),
      words: words.map(([word, at], index) => ({ id: `${id}-w${index}`, text: word, categoryId: `${id}-c${at}` })),
    };
  };
  const s1Words = ['Морква', 'Яблуко', 'Буряк', 'Груша'];
  const s1 = sortQuestion('s1', 'Овочі чи фрукти?', ['Овочі', 'Фрукти'], [['Морква', 0], ['Яблуко', 1], ['Буряк', 0], ['Груша', 1]], 100, 3, 60);
  const s2Words = ['Кит', 'Сова', 'Щука', 'Кажан', 'Пінгвін', 'Карась'];
  const s2 = sortQuestion('s2', 'Хто це?', ['Ссавці', 'Птахи', 'Риби'], [['Кит', 0], ['Сова', 1], ['Щука', 2], ['Кажан', 0], ['Пінгвін', 1], ['Карась', 2]], 50, 3, 60);
  const s3 = sortQuestion('s3', 'Пори року', ['Зима', 'Весна', 'Літо', 'Осінь'], [['Січень', 0], ['Квітень', 1], ['Липень', 2], [LONG_SORT, 3]], 100, 1, 45);
  const s4Words = ['Яблуня', 'Смородина', 'Вишня', 'Аґрус'];
  const s4 = sortQuestion('s4', 'Дерево чи кущ?', ['Дерево', 'Кущ'], [['Яблуня', 0], ['Смородина', 1], ['Вишня', 0], ['Аґрус', 1]], 50, 3, 45);
  const s5 = sortQuestion('s5', 'Чай чи кава?', ['Чай', 'Кава'], [['Капучино', 1], ['Улун', 0], ['Еспресо', 1], ['Пуер', 0]], 100, 3, 45);
  const s6Words = ['Залізо', 'Кисень', 'Мідь', 'Сірка'];
  const s6 = sortQuestion('s6', 'Метал чи неметал?', ['Метал', 'Неметал'], [['Залізо', 0], ['Кисень', 1], ['Мідь', 0], ['Сірка', 1]], 100, 3, 30);
  const cellQ = (id: string, text: string, points: number) => ({ ...withPoints(withId(single, id), points), text, timeLimit: 30 });
  const rounds = [
    classicRound('r1', [s1, s2, s3], {
      title: 'Розминка',
      speedBonus: true,
      rules: { penalty: 'minus', partial: null, streak: { length: 2, bonus: { kind: 'fixed', value: 100 } }, multiplier: 1 },
    }),
    boardRound(
      'r2',
      [
        { title: 'Міста', cells: [cellQ('b11', 'Місто за 100?', 100), cellQ('b12', 'Місто за 200?', 200), cellQ('b13', 'Місто за 300?', 300)] },
        { title: 'Сад', cells: [cellQ('b21', 'Сад за 100?', 100), cellQ('b22', 'Сад за 300?', 300), { question: s4, mark: 'x2', answerMode: 'phone' }] },
        { title: 'Річки', cells: [cellQ('b31', 'Річка за 100?', 100), cellQ('b32', 'Річка за 200?', 200), cellQ('b33', 'Річка за 300?', 300)] },
      ],
      { title: 'Поле' },
    ),
    blitzRound('r3', [s5], { title: 'Бліц', check: 'auto' }),
    finalRound('r4', s6, { title: 'Хімія', wagerMode: 'classic' }),
  ];
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end' }), title: 'Сортування' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Редактор: категорії, слова з категорією, бали за слово з сумою; підвисання 3 → 2.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Сортування' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.getByRole('button', { name: /^Запитання 1 Овочі чи фрукти\?/ }).click();
  expect(await field(host, 'Категорія 1').inputValue()).toBe('Овочі');
  expect(await field(host, 'Категорія 2').inputValue()).toBe('Фрукти');
  for (const [index, word] of s1Words.entries()) {
    expect(await field(host, `Слово ${index + 1}`).inputValue()).toBe(word);
    expect(await host.getByLabel(`Категорія слова ${index + 1}`, exact).locator('option:checked').textContent()).toBe(where[word]);
  }
  expect(await field(host, 'Бали за слово').inputValue()).toBe('100');
  await host.getByText('Разом до 400 балів (не більше 2000)', exact).waitFor();
  const lock = field(host, 'Підвисання після помилки, с');
  expect(await lock.inputValue()).toBe('3');
  await lock.fill('2');
  await shot(host, 'sort7f-editor-host');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'sort7f-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  // Клітинка поля з сортуванням: ціна — найбільша сума (4 × 50), без перемикачів типу й способу.
  await host.getByRole('button', { name: 'Поле', ...exact }).click();
  await host.getByRole('button', { name: /^Категорія 2, клітинка 3: 200 ×2, / }).click();
  await host.getByText('Сортує лише той, хто вибрав клітинку, з телефона. Бали — за кожне відсортоване слово.', exact).waitFor();
  expect(await host.locator('label.field', { hasText: 'Тип клітинки' }).count()).toBe(0);
  expect(await host.locator('label.field', { hasText: 'Як відповідати' }).count()).toBe(0);
  await shot(host, 'sort7f-editor-board-cell');
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // 2. Гра: сцена, Оля 375 px, Петро 360 px.
  await host.locator('.quiz-list li', { hasText: 'Сортування' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7f', 1600, 900);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya7f', 375, 812);
  const petro = await open('petro7f', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();

  const hostScore = async (nickname: string) => (await host.locator('.player-row', { hasText: nickname }).locator('.score').textContent())!;
  const scores = async () => [await hostScore('Оля'), await hostScore('Петро')];
  /** До розкриття: у сторінці немає жодного слова, крім дозволеної картки. */
  const noLeaks = async (page: Page, words: string[], allowed: string | null, label: string) => {
    const html = await page.content();
    for (const word of words) if (word !== allowed) expect(html, `${label}: «${word}» leaked`).not.toContain(word);
  };
  const zonesAt = async (page: Page) =>
    Object.fromEntries(
      await Promise.all(
        (await page.locator('button.sort-zone').all()).map(async (zone) => [await zone.getAttribute('data-pos'), await zone.textContent()] as const),
      ),
    );
  /** Сортує все правильно, поки є картка; повертає слова в тому порядку, як вони приходили. */
  const sortRest = async (page: Page, how: 'tap' | 'key' | 'drag' = 'tap') => {
    const seen: string[] = [];
    for (let card = await sortCard(page); card !== null; card = await sortCard(page)) {
      seen.push(card);
      await sortBy(page, how, where[card]!);
    }
    return seen;
  };
  const stageRows = stage.locator('.sort-board li');
  const stageRowsShape = async () => {
    const result: number[] = [];
    for (let i = 0; i < (await stageRows.count()); i++) result.push(Math.round((await stageRows.nth(i).boundingBox())!.height));
    return result;
  };
  const toNextRound = async () => {
    await click(host, 'Далі');
    await click(host, 'Наступний раунд');
  };
  // Смужки прогресу плавно доростають (0,3 с): знімок — після того, як вони стали на місце.
  const barsSettled = () =>
    stage.waitForFunction("document.getAnimations().every((a) => a.playState === 'finished' || !a.effect?.target?.classList.contains('sort-bar-fill'))");

  // 3. s1, дві зони: Оля сортує перетягуванням, дотиком і стрілками; зони не рухаються.
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  await olya.locator('.sort-card').waitFor();
  await petro.locator('.sort-card').waitFor();
  expect(await zonesAt(olya)).toEqual({ left: 'Овочі', right: 'Фрукти' });
  await expectNoSideScroll(olya, 'sort7f-phone-2');
  await expectNoSideScroll(petro, 'sort7f-phone-2-360');
  await stageRows.nth(1).waitFor();
  expect(await stageRows.count()).toBe(2);
  const rowsBefore = await stageRowsShape();
  await noLeaks(stage, s1Words, null, 'stage s1');
  await noLeaks(olya, s1Words, await sortCard(olya), 'olya s1');
  await noLeaks(petro, s1Words, await sortCard(petro), 'petro s1');
  // Порядок слів однаковий для всіх.
  expect(await sortCard(petro)).toBe(await sortCard(olya));
  const olyaZones = await sortZoneBoxes(olya);
  for (const [index, how] of (['drag', 'tap', 'key', 'key'] as const).entries()) {
    const card = (await sortCard(olya))!;
    await noLeaks(olya, s1Words, card, `olya s1 move ${index + 1}`);
    await sortBy(olya, how, where[card]!);
    await olya.locator('.sort-progress', { hasText: `${index + 1} з 4` }).waitFor();
    expect(await olya.locator('.sort-lock').count(), `olya s1: ${how} was a mistake`).toBe(0);
    expect(await sortZoneBoxes(olya)).toEqual(olyaZones);
  }
  await olya.locator('.sort-done').waitFor();

  // Петро помиляється: картка трусить, підвисання з відліком, дотик під час нього нічого не робить.
  const missed = (await sortCard(petro))!;
  const wrong = where[missed] === 'Овочі' ? 'Фрукти' : 'Овочі';
  const petroZones = await sortZoneBoxes(petro);
  const shook = petro.locator('.sort-card.is-shaking').waitFor({ timeout: 5000 });
  await sortBy(petro, 'tap', wrong);
  await shook;
  await petro.locator('.sort-lock').getByText('Помилка! Підвисання: 2 с', exact).waitFor();
  expect(await sortCard(petro)).toBe(missed);
  expect(await sortZoneBoxes(petro)).toEqual(petroZones);
  await shot(petro, 'sort7f-lock-phone');
  await sortZone(petro, where[missed]!).click({ force: true });
  expect(await petro.locator('.sort-progress').textContent()).toBe('0 з 4');
  expect(await sortCard(petro)).toBe(missed);
  // Сцена: прогрес обох без жодного слова; рядків стільки ж і тієї самої висоти.
  await expect.poll(async () => (await stageRows.filter({ hasText: 'Петро' }).textContent()) ?? '').toContain('помилок: 1');
  const olyaRow = (await stageRows.filter({ hasText: 'Оля' }).innerText()).replace(/\s+/g, ' ');
  expect(olyaRow).toMatch(/4\/4 \d+(,\d)? с/);
  expect(await stageRowsShape()).toEqual(rowsBefore);
  await noLeaks(stage, s1Words, null, 'stage s1 progress');
  await barsSettled();
  await shot(stage, 'sort7f-stage-progress');
  await shot(host, 'sort7f-host-progress');
  // Пульт на телефоні 375 px: рядок з довгим іменем і помилками не дає бічної прокрутки, тисне лише ім'я.
  await host.setViewportSize({ width: 375, height: 812 });
  // 11c: під час запитання поступ сортування — у рядку «Відповідей наживо».
  const petroRow = liveRow(host, 'Петро');
  const petroName = petroRow.locator('.name');
  type NameCell = { textContent: string | null; dataset: Record<string, string | undefined>; scrollWidth: number; clientWidth: number };
  await petroName.evaluate((el: NameCell) => {
    el.dataset.was = el.textContent ?? '';
    el.textContent = 'Петро Довгопрізвищенко-Найдовшеімʼяненко';
  });
  expect(await petroRow.innerText()).toContain('помилок 1');
  await expectNoSideScroll(host, 'sort7f-host-progress-375');
  expect(await petroName.evaluate((el: NameCell) => el.scrollWidth > el.clientWidth), 'the long name is cut with an ellipsis').toBe(true);
  await petroName.evaluate((el: NameCell) => {
    el.textContent = el.dataset.was ?? '';
  });
  await host.setViewportSize({ width: 1280, height: 900 });
  await petro.locator('.sort-lock').waitFor({ state: 'detached', timeout: 5000 });
  const petroOrder = await sortRest(petro);
  expect(petroOrder.at(-1)).toBe(missed);
  expect(petroOrder).toHaveLength(4);
  // Обидва закінчили: запитання закривається саме.
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await noLeaks(stage, s1Words, null, 'stage s1 locked');
  await click(host, 'Показати відповідь');
  const column = (name: string) => stage.locator('.sort-reveal.is-open .sort-reveal-col', { has: stage.locator('h3', { hasText: name }) });
  await column('Овочі').waitFor();
  expect(await column('Овочі').locator('li').allTextContents()).toEqual(['Морква', 'Буряк']);
  expect(await column('Фрукти').locator('li').allTextContents()).toEqual(['Яблуко', 'Груша']);
  expect(await stage.evaluate('document.documentElement.scrollHeight <= innerHeight'), 'stage reveal scrolls').toBe(true);
  await barsSettled();
  await shot(stage, 'sort7f-stage-reveal');
  await expect.poll(scores).toEqual(['400', '400']);

  // 4. s2, три зони: «Риби» вгорі; Оля все, Петро три слова; ведучий закриває.
  await click(host, 'Далі');
  await petro.locator('h1', { hasText: 'Хто це?' }).waitFor();
  await petro.locator('.sort-card').waitFor();
  expect(await zonesAt(petro)).toEqual({ left: 'Ссавці', right: 'Птахи', top: 'Риби' });
  await expectNoSideScroll(petro, 'sort7f-phone-3');
  await noLeaks(stage, s2Words, null, 'stage s2');
  await noLeaks(petro, s2Words, await sortCard(petro), 'petro s2');
  await sortRest(olya, 'key');
  await olya.locator('.sort-done').waitFor();
  for (let i = 0; i < 3; i++) {
    const card = (await sortCard(petro))!;
    await sortBy(petro, i === 1 ? 'drag' : 'tap', where[card]!);
  }
  await petro.locator('.sort-progress', { hasText: '3 з 6' }).waitFor();
  await noLeaks(stage, s2Words, null, 'stage s2 progress');
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  await expect.poll(scores).toEqual(['800', '550']);

  // 5. s3, чотири зони, зменшений рух: помилка без трусіння, відлік видно; слово на 40 символів не розпирає екран.
  await olya.emulateMedia({ reducedMotion: 'reduce' });
  await click(host, 'Далі');
  await olya.locator('h1', { hasText: 'Пори року' }).waitFor();
  await olya.locator('.sort-card').waitFor();
  expect(await zonesAt(olya)).toEqual({ left: 'Зима', right: 'Весна', top: 'Літо', bottom: 'Осінь' });
  await shot(olya, 'sort7f-phone-4');
  await expectNoSideScroll(petro, 'sort7f-phone-4-360');
  const first = (await sortCard(olya))!;
  await sortBy(olya, 'key', where[first] === 'Осінь' ? 'Зима' : 'Осінь');
  await olya.locator('.sort-lock').getByText('Помилка! Підвисання: 1 с', exact).waitFor();
  expect(await olya.locator('.sort-card').getAttribute('class')).toBe('sort-card');
  await shot(olya, 'sort7f-reduced-lock');
  await olya.locator('.sort-lock').waitFor({ state: 'detached', timeout: 5000 });
  for (let card = await sortCard(olya); card !== null; card = await sortCard(olya)) {
    if (card === LONG_SORT) {
      await expectNoSideScroll(olya, 'sort7f-phone-4-375');
      await expectApart(olya, '.sort-card', ['.sort-zone'], 's3 long word');
    }
    await sortBy(olya, 'key', where[card]!);
  }
  await olya.locator('.sort-done').waitFor();
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  await expect.poll(scores).toEqual(['1300', '550']);
  await olya.emulateMedia({ reducedMotion: 'no-preference' });

  // 6. Поле: сортує лише Оля, Петро бачить, хто сортує й скільки лишилося.
  await toNextRound();
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await olya.getByRole('button', { name: 'Сад, 200', ...exact }).click();
  await olya.locator('.sort-card').waitFor();
  await petro.getByText('Оля сортує слова', exact).waitFor();
  await petro.locator('.sort-progress', { hasText: '0 з 4' }).waitFor();
  expect(await petro.locator('.sort-card').count()).toBe(0);
  expect(await petro.locator('button.sort-zone').count()).toBe(0);
  // План 9a: на полі глядачі й сцена бачать усі слова — за абеткою, без категорій, доки немає розкриття
  // (11d: крім слова на картці; на телефоні-глядачі вони згорнуті в «Ще N слів»).
  const boardCard = (await sortCard(olya))!;
  const boardWords = [...s4Words].sort((a, b) => a.localeCompare(b, 'uk')).filter((word) => word !== boardCard);
  for (const page of [petro, stage]) {
    await page.locator('.sort-words li').first().waitFor({ state: 'attached' });
    await expect.poll(() => page.locator('.sort-words li').allTextContents(), POLL).toEqual(boardWords);
    expect(await page.locator('.sort-reveal.is-open').count(), 'the board reveal opened early').toBe(0);
  }
  await expectNoSideScroll(petro, 'sort7f-board-watch-phone');
  // Глядач бачить живий прогрес того, хто сортує; останнє слово одразу відкриває відповідь.
  for (let i = 0; i < 3; i++) await sortBy(olya, 'tap', where[(await sortCard(olya))!]!);
  await petro.locator('.sort-progress', { hasText: '3 з 4' }).waitFor();
  expect(await petro.locator('.sort-reveal.is-open').count(), 'the board reveal opened early').toBe(0);
  await sortRest(olya);
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await expect.poll(async () => (await stageRows.filter({ hasText: 'Оля' }).textContent()) ?? '').toContain('4/4');
  expect(await stageRows.count()).toBe(1);
  await petro.getByText('Відповідав Оля', exact).waitFor();
  await shot(stage, 'sort7f-board-stage');
  await shot(petro, 'sort7f-board-reveal-phone');
  await expect.poll(scores).toEqual(['1700', '550']);
  await click(host, 'Далі');
  const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
  const picking = host.getByRole('button', { name: 'Пропустити хід', ...exact });
  await Promise.race([next.waitFor(), picking.waitFor()]);
  if (await next.isVisible()) await next.click();
  await picking.waitFor();
  await click(host, 'Завершити раунд');
  await click(host, 'Наступний раунд');

  // 7. Бліц: Петро першим сортує все й забирає суму, Оля — нуль.
  await click(host, 'Почати раунд');
  await olya.locator('.sort-card').waitFor();
  await petro.locator('.sort-card').waitFor();
  await sortBy(olya, 'tap', where[(await sortCard(olya))!]!);
  await sortRest(petro);
  for (const page of [stage, olya, petro]) await page.getByText('Найшвидше все відсортовано: Петро', exact).waitFor();
  await barsSettled();
  await shot(stage, 'sort7f-blitz-winner');
  await shot(olya, 'sort7f-blitz-winner-phone');
  await click(host, 'Показати відповідь');
  await expect.poll(scores).toEqual(['1700', '950']);

  // 8. Фінал: Оля ставить 1000, Петро ва-банк; сцена не бачить прогресу.
  await toNextRound();
  await stage.getByRole('heading', { name: 'Хімія' }).waitFor();
  await click(host, 'Почати фінал');
  await olya.getByLabel('Ставка', exact).fill('1000');
  await click(olya, 'Поставити');
  await olya.getByText('Ваша ставка: 1000', exact).waitFor();
  await click(petro, 'Ва-банк');
  await olya.locator('.sort-card').waitFor();
  await petro.locator('.sort-card').waitFor();
  await sortRest(olya);
  for (let i = 0; i < 3; i++) await sortBy(petro, 'tap', where[(await sortCard(petro))!]!);
  await petro.locator('.sort-progress', { hasText: '3 з 4' }).waitFor();
  expect(await stage.locator('.sort-board').count()).toBe(0);
  expect(await bodyText(stage)).not.toContain('Усе відсортували');
  await noLeaks(stage, s6Words, null, 'stage final');
  await shot(stage, 'sort7f-final-stage');
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  const wager = (nickname: string) => stage.locator('.wager-list li', { hasText: nickname });
  const flat = async (nickname: string) => ((await wager(nickname).textContent()) ?? '').replace(/\s/g, '');
  await click(host, 'Наступний гравець');
  await wager('Петро').waitFor();
  expect(await flat('Петро')).toContain('950→0');
  expect(await wager('Оля').count()).toBe(0);
  await click(host, 'Наступний гравець');
  await wager('Оля').waitFor();
  expect(await flat('Оля')).toContain('1700→2700');
  await shot(stage, 'sort7f-final-reveal');
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const standings = async (page: Page) => {
    const rows = page.locator('.standings li');
    await rows.first().waitFor();
    const result: [string, string][] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      result.push([(await rows.nth(i).locator('.name').textContent())!, (await rows.nth(i).locator('.score').textContent())!]);
    }
    return result;
  };
  const totals = await standings(stage);
  expect(totals).toEqual([
    ['Оля', '2700'],
    ['Петро', '0'],
  ]);

  // 9. Історія: ті самі рахунки, підсумки сортування й правильний розклад.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Сортування/ }).click();
  expect(await standings(host)).toEqual(totals);
  const played = (text: string) => host.locator('.rows.stacked > li', { hasText: text });
  const responses = async (text: string) => {
    await played(text).getByText(/^Відповіді \(\d+\)$/).click();
    return Object.fromEntries(
      await Promise.all(
        (await played(text).locator('.responses li').all()).map(
          async (row) => [await row.locator('.responses-name').textContent(), await row.locator('.responses-answer').textContent()] as const,
        ),
      ),
    );
  };
  const r1 = await responses('Овочі чи фрукти?');
  expect(r1['Оля']).toMatch(/^Відсортовано 4 з 4 за \d+(,\d)? с, помилок: 0$/);
  expect(r1['Петро']).toMatch(/^Відсортовано 4 з 4 за \d+(,\d)? с, помилок: 1$/);
  expect((await responses('Хто це?'))['Петро']).toBe('Відсортовано 3 з 6, помилок: 0');
  await played('Овочі чи фрукти?').getByText('Правильна відповідь: Овочі: Морква, Буряк; Фрукти: Яблуко, Груша', exact).waitFor();
  const cellRow = (await played('Дерево чи кущ?').innerText()).replace(/\s+/g, ' ');
  expect(cellRow).toContain('Сад · 200');
  expect(cellRow).toContain('×2');
  expect(cellRow).toContain('Оля: +400');
  await shot(host, 'sort7f-history-host');

  expect(problems).toEqual([]);
}

it('part 7g: duels — the editor section, the button after a third, an opponent picked, others disabled, the duel on the stage, phones and host, a category, first right answer wins, retries, a skip, a tie, a stake moved with a line in the history, a cancel, the game going on where it stood', async () => {
  try {
    await duelGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Прямокутники частин сцени дуелі, округлені до пікселя (null — немає), і чи вміщається сцена без прокрутки. */
const DUEL_STAGE_GEOMETRY = `(() => {
  const box = (selector) => {
    const element = document.querySelector(selector);
    if (element === null) return null;
    const r = element.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map(Math.round);
  };
  return {
    challenger: box('.duel-stage-side.is-challenger'),
    opponent: box('.duel-stage-side.is-opponent'),
    score: box('.duel-stage-score'),
    body: box('.duel-stage-body'),
    question: box('.duel-stage-question'),
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight,
    wide: document.documentElement.scrollWidth <= innerWidth,
  };
})()`;
type DuelGeometry = {
  challenger: number[] | null;
  opponent: number[] | null;
  score: number[] | null;
  body: number[] | null;
  question: number[] | null;
  scrollHeight: number;
  innerHeight: number;
  wide: boolean;
};
const duelGeometry = async (page: Page) => (await page.evaluate(DUEL_STAGE_GEOMETRY)) as DuelGeometry;

async function duelGame() {
  const host = await open('host7g', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host7g@example.com');

  const q = (n: number) => ({ ...withPoints(withId(single, `q${n}`), 100), text: `Запитання ${n}: столиця України?`, timeLimit: 20 });
  const rounds = [
    classicRound('r1', [q(1), q(2), q(3)], { title: 'Розминка', speedBonus: false }),
    classicRound('r2', [q(4), q(5), q(6)], { title: 'Другий', speedBonus: false }),
    finalRound('r3', { ...withPoints(withId(single, 'f1'), 100), text: 'Фінал: столиця України?' }, { title: 'Фінал' }),
  ];
  const duels = {
    categories: [
      {
        id: 'dc1',
        title: 'Столиці',
        questions: [
          { id: 'd1', text: 'Столиця Франції?', accepted: ['Париж'] },
          { id: 'd2', text: 'Столиця Італії?', accepted: ['Рим'] },
          { id: 'd3', text: 'Столиця Польщі?', accepted: ['Варшава'] },
        ],
      },
      {
        id: 'dc2',
        title: 'Хімія',
        questions: [
          { id: 'd4', text: 'Символ Fe — це…', accepted: ['Залізо', 'Ферум'] },
          { id: 'd5', text: 'Символ Au — це…', accepted: ['Золото', 'Аурум'] },
          { id: 'd6', text: 'Символ O — це…', accepted: ['Кисень', 'Оксиген'] },
        ],
      },
    ],
    questionsPerDuel: 2,
    timeLimit: 30,
    stake: 300,
  };
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end' }), title: 'Дуелі', duels };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Редактор: розділ «Дуелі» з пулом; 4 запитання за дуель не зберігаються.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Дуелі' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('details.duels > summary').click();
  expect(await field(host, 'Запитань за дуель').inputValue()).toBe('2');
  expect(await field(host, 'Ставка: програвший віддає переможцю').inputValue()).toBe('300');
  await host.getByRole('button', { name: 'Столиці · 3 запитання', ...exact }).waitFor();
  await host.getByRole('button', { name: 'Хімія · 3 запитання', ...exact }).waitFor();
  await field(host, 'Запитань за дуель').fill('4');
  await click(host, 'Зберегти');
  await host.locator('.problems', { hasText: 'Дуелі, «Столиці»: замало запитань — потрібно щонайменше 4.' }).waitFor();
  expect(host.url()).not.toMatch(/\/quizzes$/);
  await field(host, 'Запитань за дуель').fill('2');
  await shot(host, 'duel7g-editor');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'duel7g-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // Гра: сцена 1600 × 900, Оля 375, Петро 360, Іра 390.
  await host.locator('.quiz-list li', { hasText: 'Дуелі' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage = await open('stage7g', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl!);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya7g', 375, 812);
  const petro = await open('petro7g', 360, 740);
  const ira = await open('ira7g', 390, 844);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const iraFrames = socketFrames(ira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];

  const hostScore = async (nickname: string) => (await host.locator('.player-row', { hasText: nickname }).locator('.score').textContent())!;
  const scores = async () => ({ Оля: await hostScore('Оля'), Петро: await hostScore('Петро'), Іра: await hostScore('Іра') });
  /** Ні DOM сторінок, ні їхні сокети не містять тексту. */
  const nowhere = async (where: [Page, string[]][], text: string, label: string) => {
    for (const [page, frames] of where) {
      expect(await page.content(), `${label}: «${text}» in the DOM`).not.toContain(text);
      expect(
        frames.some((frame) => frame.includes(text)),
        `${label}: «${text}» came over the socket`,
      ).toBe(false);
    }
  };
  const stageSay = (text: string) => stage.locator('.duel-stage').getByText(text, exact).waitFor();
  const stageScore = (text: string) => stage.locator('.duel-stage-score', { hasText: text }).waitFor();
  const geometry: Record<string, DuelGeometry> = {};

  // 1. До третини: після q1 кнопки немає; після q2 — є в усіх, а шапка Петра не виросла.
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  await olya.locator('h1', { hasText: 'Запитання 1:' }).waitFor();
  await answerAll(host, phones);
  for (const page of phones) expect(await duelButton(page).count()).toBe(0);
  await click(host, 'Далі');
  await petro.locator('h1', { hasText: 'Запитання 2:' }).waitFor();
  expect(await duelButton(petro).count()).toBe(0);
  const petroQuestionY = (await petro.locator('h1.question').first().boundingBox())!.y;
  const petroBarHeight = (await petro.locator('header.bar').boundingBox())!.height;
  await answerAll(host, phones);
  for (const page of phones) await duelButton(page).waitFor();
  expect(await duelButton(olya).isEnabled()).toBe(true);
  expect((await petro.locator('header.bar').boundingBox())!.height).toBe(petroBarHeight);
  await shot(petro, 'duel7g-button-phone');

  // 2. Оголошення: Оля вибирає Петра; у Петра й Іри кнопка вимкнена, в Олі її немає; смуга всюди.
  await duelButton(olya).click();
  const dialog = olya.getByRole('dialog', { name: 'Кого викликати на дуель?' });
  await dialog.waitFor();
  expect(await dialog.getByRole('button').allTextContents()).toEqual(['Петро', 'Іра', 'Скасувати']);
  await shot(olya, 'duel7g-pick-phone');
  await expectNoSideScroll(olya, 'duel7g-pick-375');
  await dialog.getByRole('button', { name: 'Петро', ...exact }).click();
  const banner = '⚔ Дуель: Оля — Петро. Почнеться, щойно ведучий продовжить гру.';
  for (const page of [stage, ...phones]) await page.locator('.duel-banner').getByText(banner, exact).waitFor();
  await expect.poll(() => duelButton(petro).isDisabled()).toBe(true);
  await expect.poll(() => duelButton(ira).isDisabled()).toBe(true);
  expect(await duelButton(olya).count()).toBe(0);
  for (const [page, width] of [
    [olya, 375],
    [petro, 360],
    [ira, 390],
  ] as const)
    await expectNoSideScroll(page, `duel7g-banner-${width}`);
  // Смуга не закриває результату й запитання: сторінка тримає під нею запас.
  await petro.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  await expectApart(petro, '.duel-banner', ['section.result', 'h1.question'], 'declared banner 360');
  await shot(stage, 'duel7g-declared-stage');
  await host.getByText('Оголошено дуель: Оля — Петро', exact).waitFor();
  await host.getByRole('button', { name: 'Почати дуель', ...exact }).waitFor();
  expect(await host.getByRole('button', { name: 'Далі', ...exact }).count()).toBe(0);

  // 3. Категорія: вибирає Оля, Петро й сцена бачать, хто вибирає.
  await click(host, 'Почати дуель');
  await stageSay('Оля вибирає категорію');
  await stage.locator('.duel-stage-categories li', { hasText: 'Столиці · лишилося 3' }).waitFor();
  await stage.locator('.duel-stage-categories li', { hasText: 'Хімія · лишилося 3' }).waitFor();
  expect(await stage.locator('.duel-banner').count()).toBe(0);
  await petro.getByText('Оля вибирає категорію', exact).waitFor();
  expect(await petro.locator('.duel-categories').count()).toBe(0);
  await olya.getByRole('button', { name: 'Хімія · лишилося 3', ...exact }).waitFor();
  await shot(olya, 'duel7g-category-phone');
  await shot(stage, 'duel7g-category-stage');
  geometry.category = await duelGeometry(stage);
  rigged.push(1);
  await click(olya, 'Столиці · лишилося 3');

  // 4. Запитання 1: спробу Петра бачать лише він і ведучий; Оля відповідає правильно.
  await stage.locator('.duel-stage-question', { hasText: 'Столиця Франції?' }).waitFor();
  await stageScore('0 : 0');
  expect(await stage.locator('.duel-stage-side.is-challenger').textContent()).toBe('Оля');
  expect(await stage.locator('.duel-stage-side.is-opponent').textContent()).toBe('Петро');
  await stageSay('Запитання 1 з 2 · Столиці');
  await stage.locator('.duel-stage').getByRole('timer').waitFor();
  await olya.locator('.duel-score').getByText('Оля 0 : 0 Петро', exact).waitFor();
  await ira.locator('h1', { hasText: 'Столиця Франції?' }).waitFor();
  expect(await ira.locator('.duel-answer').count(), 'a watcher has no answer field').toBe(0);
  expect(await bodyText(stage)).not.toContain('Париж');
  expect(await bodyText(ira)).not.toContain('Париж');
  geometry.question = await duelGeometry(stage);
  const petroAnswerBox = (await petro.locator('.duel-answer').boundingBox())!;
  const petroTriesBox = (await petro.locator('.duel-tries').boundingBox())!;
  await duelAnswer(petro, 'Ліон');
  await petro.locator('.duel-tries').getByText('✗ Ліон', exact).waitFor();
  expect(await petro.locator('.duel-answer').boundingBox()).toEqual(petroAnswerBox);
  expect(await petro.locator('.duel-tries').boundingBox()).toEqual(petroTriesBox);
  await stageSay('Спроби: Оля 0 · Петро 1');
  await ira.getByText('Спроби: Оля 0 · Петро 1', exact).waitFor();
  await olya.getByText('Спроби: Оля 0 · Петро 1', exact).waitFor();
  await host.getByText('Прийнятні відповіді: Париж', exact).waitFor();
  // 11c: спроби дуелянтів на пульті — у рядках «Відповідей наживо» панелі дуелі.
  await host.locator('.duel-host .live-row', { has: host.locator('.name', { hasText: 'Петро' }) }).getByText('спроби: Ліон', exact).waitFor();
  await host.getByRole('button', { name: 'Пропустити запитання', ...exact }).waitFor();
  await host.getByRole('button', { name: 'Скасувати дуель', ...exact }).waitFor();
  await host.getByRole('button', { name: 'Пауза', ...exact }).first().waitFor();
  // Ведучий бачить таймер дуелі; «Завершити раунд» під час дуелі немає.
  await host.locator('.duel-host').getByRole('timer').waitFor();
  expect(await host.getByRole('button', { name: 'Завершити раунд', ...exact }).count()).toBe(0);
  await shot(host, 'duel7g-question-host');
  await nowhere(
    [
      [stage, stageFrames],
      [olya, olyaFrames],
      [ira, iraFrames],
    ],
    'Ліон',
    'a try of Петро',
  );
  await petro.reload();
  await field(petro, 'Ваша відповідь').waitFor();
  await petro.locator('.duel-tries').getByText('✗ Ліон', exact).waitFor();
  await expectNoSideScroll(petro, 'duel7g-question-360');
  await nowhere(
    [
      [stage, stageFrames],
      [olya, olyaFrames],
      [petro, petroFrames],
      [ira, iraFrames],
    ],
    'Париж',
    'the answer before it closed',
  );
  await duelAnswer(olya, 'париж');
  await stageSay('Правильна відповідь: Париж');
  await stageSay('Це запитання виграє Оля: «париж»');
  await stageScore('1 : 0');
  await olya.locator('.duel-score').getByText('Оля 1 : 0 Петро', exact).waitFor();
  geometry.answer = await duelGeometry(stage);
  await shot(stage, 'duel7g-answer-stage');

  // 5. Пропуск: «Столиця Італії?» знімається, приходить «Столиця Польщі?» тим самим номером.
  rigged.push(1);
  await click(host, 'Наступне запитання дуелі');
  await stage.locator('.duel-stage-question', { hasText: 'Столиця Італії?' }).waitFor();
  rigged.push(1);
  await click(host, 'Пропустити запитання');
  await stage.locator('.duel-stage-question', { hasText: 'Столиця Польщі?' }).waitFor();
  await stageSay('Запитання 2 з 2 · Столиці');
  await duelAnswer(petro, 'Варшава');
  await stageScore('1 : 1');
  await host.getByRole('button', { name: 'Підсумок дуелі', ...exact }).waitFor();

  // 6. Нічия: бали ті самі; гра йде далі з q3, смуги немає.
  await click(host, 'Підсумок дуелі');
  await stageSay('Нічия — бали не змінюються');
  for (const page of phones) await page.getByText('Нічия — бали не змінюються', exact).waitFor();
  geometry.result = await duelGeometry(stage);
  await shot(stage, 'duel7g-tie-stage');
  expect(await scores()).toEqual({ Оля: '200', Петро: '200', Іра: '200' });
  await click(host, 'Продовжити гру');
  await stage.locator('h1', { hasText: 'Запитання 3:' }).waitFor();
  await petro.locator('h1', { hasText: 'Запитання 3:' }).waitFor();
  for (const page of [stage, ...phones]) expect(await page.locator('.duel-banner').count()).toBe(0);
  await duelButton(petro).waitFor();
  expect((await petro.locator('h1.question').first().boundingBox())!.y, 'the header button moved the question').toBe(petroQuestionY);
  expect((await petro.locator('header.bar').boundingBox())!.height).toBe(petroBarHeight);
  // Сцена дуелі на 1600 × 900: без прокрутки, імена й рахунок між етапами на місці.
  console.log(`duel stage 1600×900: ${JSON.stringify(geometry)}`);
  for (const [name, at] of Object.entries(geometry)) {
    expect(at.wide && at.scrollHeight <= at.innerHeight, `stage duel ${name} overflows`).toBe(true);
    expect([at.challenger, at.opponent, at.score], `stage duel ${name} moved the names or the score`).toEqual([
      geometry.category!.challenger,
      geometry.category!.opponent,
      geometry.category!.score,
    ]);
  }
  await answerAll(host, phones);
  expect(await scores()).toEqual({ Оля: '300', Петро: '300', Іра: '300' });

  // 7. Ставка: Іра викликає Олю; ведучий вибирає категорію за Іру; Іра виграє 2 : 0.
  expect(await duelButton(olya).count(), 'Оля already used her duel').toBe(0);
  await duelButton(ira).click();
  await ira.getByRole('dialog').getByRole('button', { name: 'Оля', ...exact }).click();
  await ira.locator('.duel-banner').getByText('⚔ Дуель: Іра — Оля. Почнеться, щойно ведучий продовжить гру.', exact).waitFor();
  await expect.poll(() => duelButton(petro).isDisabled()).toBe(true);
  await click(host, 'Почати дуель');
  await stageSay('Іра вибирає категорію');
  const hostPanel = host.locator('.duel-host');
  await hostPanel.getByText('Категорію вибирає Іра. Якщо треба, виберіть за гравця:', exact).waitFor();
  await shot(host, 'duel7g-host-pick');
  rigged.push(1);
  await hostPanel.getByRole('button', { name: 'Хімія · лишилося 3', ...exact }).click();
  await stage.locator('.duel-stage-question', { hasText: 'Символ Fe — це…' }).waitFor();
  await duelAnswer(ira, 'Залізо');
  await stageScore('1 : 0');
  rigged.push(1);
  await click(host, 'Наступне запитання дуелі');
  await stage.locator('.duel-stage-question', { hasText: 'Символ Au — це…' }).waitFor();
  await duelAnswer(ira, 'Аурум');
  await stageScore('2 : 0');
  await stage.locator('.duel-stage-side.is-challenger', { hasText: 'Іра' }).waitFor();
  await click(host, 'Підсумок дуелі');
  await stageSay('Перемога в дуелі: Іра!');
  await stageSay('Іра +300 · Оля −300');
  await olya.getByText('Іра +300 · Оля −300', exact).waitFor();
  await shot(stage, 'duel7g-result-stage');
  await shot(olya, 'duel7g-result-phone');
  await expect.poll(scores).toEqual({ Оля: '0', Петро: '300', Іра: '600' });
  expect(await olya.locator('header.bar .score').textContent()).toBe('0');
  await click(host, 'Продовжити гру');
  await host.getByRole('button', { name: 'Наступний раунд', ...exact }).waitFor();

  // 8. Скасування: Петро викликає Іру на підсумках раунду; ведучий скасовує — ті самі підсумки, бали ті самі.
  await duelButton(petro).click();
  await petro.getByRole('dialog').getByRole('button', { name: 'Іра', ...exact }).click();
  await host.getByText('Оголошено дуель: Петро — Іра', exact).waitFor();
  await click(host, 'Почати дуель');
  await stageSay('Петро вибирає категорію');
  await hostPanel.getByRole('button', { name: 'Скасувати дуель', ...exact }).click();
  await host.getByRole('button', { name: 'Наступний раунд', ...exact }).waitFor();
  expect(await host.locator('.duel-host').count()).toBe(0);
  expect(await stage.locator('.duel-stage').count()).toBe(0);
  expect(await scores()).toEqual({ Оля: '0', Петро: '300', Іра: '600' });
  expect(await duelButton(petro).count()).toBe(0);
  await click(host, 'Наступний раунд');
  await stage.locator('h1', { hasText: 'Другий' }).waitFor();
  await ira.locator('h1', { hasText: 'Другий' }).waitFor();
  for (const page of phones) expect(await duelButton(page).count(), 'everyone used the duel').toBe(0);

  // 9. Історія: та сама таблиця й рядок дуелі в раунді 1, без «Бали від ведучого».
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Дуелі/ }).click();
  const rows = host.locator('.standings li');
  await rows.first().waitFor();
  const table: [string, string][] = [];
  for (let i = 0; i < (await rows.count()); i++) {
    table.push([(await rows.nth(i).locator('.name').textContent())!, (await rows.nth(i).locator('.score').textContent())!]);
  }
  expect(table).toEqual([
    ['Іра', '600'],
    ['Петро', '300'],
    ['Оля', '0'],
  ]);
  const roundOne = host.locator('.round-group', { has: host.locator('.round-title', { hasText: 'Розминка' }) });
  expect(await roundOne.locator('.history-duel').allTextContents()).toEqual(['Дуель: Іра +300, Оля −300']);
  expect(await host.locator('.history-duel').count()).toBe(1);
  expect(await host.getByText(/Бали від ведучого/).count()).toBe(0);
  await shot(host, 'duel7g-history-host');
  await expectNoSideScroll(olya, 'duel7g-phone-375');

  expect(problems).toEqual([]);
}

it('part 7g: duel layout — a debuff banner, the duel banner and a points notice stacked on 375 px, a long nickname keeps the header, a long duel question on 720p and 900p stages', async () => {
  try {
    await duelLayout();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Нік на 20 літер — найдовший дозволений. */
const LONG_NICK = 'Олександра-Марійка К';
/** Запитання дуелі на ~250 символів: найгірший випадок для сцени. */
const LONG_DUEL_1 =
  'Як називається явище, коли в довгому запитанні дуелі текст займає кілька рядків на великому екрані, а ведучий хоче, щоб імена суперників, рахунок, таймер і кількість спроб лишалися на своїх місцях між вибором категорії, запитанням, розкриттям і підсумком?';
const LONG_DUEL_2 =
  'Яке слово відповідає на друге довге запитання дуелі, у якому так само багато слів, ком і пояснень, щоб перевірити, що сцена на 1280 × 720 і на 1600 × 900 не прокручується, не обрізає таймер і не зсуває імена дуелянтів під час розкриття правильної відповіді?';

async function duelLayout() {
  expect(LONG_DUEL_1.length).toBeGreaterThanOrEqual(240);
  expect(LONG_DUEL_2.length).toBeGreaterThanOrEqual(240);
  const host = await open('host7gl', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host7gl@example.com');
  const q = (n: number) => ({ ...withPoints(withId(single, `q${n}`), 100), text: `Запитання ${n}: столиця України?`, timeLimit: 60 });
  const rounds = [
    classicRound('r1', [q(1), q(2), q(3), q(4)], { title: 'Розминка', speedBonus: false }),
    classicRound('r2', [q(5)], { title: 'Другий', speedBonus: false }),
  ];
  const duels = {
    categories: [
      {
        id: 'dl1',
        title: 'Довгі запитання',
        questions: [
          { id: 'l1', text: LONG_DUEL_1, accepted: ['Так'] },
          { id: 'l2', text: LONG_DUEL_2, accepted: ['Ні'] },
          { id: 'l3', text: 'Коротке?', accepted: ['Так'] },
        ],
      },
    ],
    questionsPerDuel: 2,
    timeLimit: 60,
    stake: 100,
  };
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end' }), title: 'Довгі дуелі', duels };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href');
  const stage900 = await open('stage7gl-900', 1600, 900);
  const stage720 = await open('stage7gl-720', 1280, 720);
  for (const stage of [stage900, stage720]) {
    await stage.goto(stageUrl!);
    await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  }
  const long = await open('long7gl', 375, 812);
  const olya = await open('olya7gl', 375, 812);
  const petro = await open('petro7gl', 360, 740);
  await join(long, code, LONG_NICK, false);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await stage900.getByText('Петро').waitFor();

  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const tool = async (nickname: string, kind: 'Бали' | 'Дебаф') => {
    const button = row(nickname).getByRole('button', { name: kind, ...exact });
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await row(nickname).locator('.player-tools').waitFor();
  };
  /** Запитання без відповідей: ведучий закриває й відкриває відповідь. */
  const closeAndReveal = async () => {
    await click(host, 'Закрити запитання');
    await click(host, 'Показати відповідь');
    await olya.locator('section.result').first().waitFor();
  };

  // 1. Довгий нік у шапці: поява кнопки «⚔ Дуель» не змінює висоти шапки.
  await click(host, 'Почати гру');
  await click(host, 'Почати раунд');
  await long.locator('h1', { hasText: 'Запитання 1:' }).waitFor();
  const bar = long.locator('header.bar');
  const barBefore = (await bar.boundingBox())!;
  expect(await duelButton(long).count()).toBe(0);
  await closeAndReveal();
  await click(host, 'Далі');
  await long.locator('h1', { hasText: 'Запитання 2:' }).waitFor();
  await closeAndReveal();
  await duelButton(long).waitFor();
  const barAfter = (await bar.boundingBox())!;
  expect(barAfter.height, 'the duel button made the header taller').toBe(barBefore.height);
  // Кнопка — на рядку шапки, праворуч від ніка, і не налазить на запитання.
  const buttonBox = (await duelButton(long).boundingBox())!;
  const nickBox = (await bar.locator('span').first().boundingBox())!;
  expect(buttonBox.y < nickBox.y + nickBox.height && nickBox.y < buttonBox.y + buttonBox.height, 'the button is on the nickname line').toBe(true);
  expect(nickBox.x + nickBox.width <= buttonBox.x + 0.5, 'the nickname runs under the button').toBe(true);
  expect(buttonBox.y + buttonBox.height <= (await long.locator('h1.question').first().boundingBox())!.y + 0.5, 'the button covers the question').toBe(true);
  await expectNoSideScroll(long, 'duel7g-long-name-375');

  // 2. Туман для Олі чекає наступного запитання; Петро відкриває діалог заздалегідь; панель балів Олі відкрита.
  await tool('Оля', 'Дебаф');
  await row('Оля').locator('.player-tools').getByRole('button', { name: /Туман/ }).click();
  await row('Оля').locator('.debuff-tag').waitFor();
  await tool('Оля', 'Бали');
  await duelButton(petro).click();
  const petroDialog = petro.getByRole('dialog');
  await petroDialog.waitFor();

  // 3. Запитання 3: банер дебафу (3 с), смуга дуелі й сповіщення про бали в Олі одночасно — стосом, без накладань.
  await click(host, 'Далі');
  await olya.locator('.debuff-banner').waitFor();
  await petroDialog.getByRole('button', { name: LONG_NICK, ...exact }).click();
  await row('Оля').getByRole('button', { name: '+100', ...exact }).click();
  await olya.locator('.duel-banner').waitFor();
  await olya.locator('.live-notice').waitFor();
  await olya.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  const stack = (await olya.evaluate(`(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (element === null) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const items = [...document.querySelectorAll('.choice, .debuff-content button, .debuff-content h1')];
    const content = items.length === 0 ? null : Math.max(...items.map((element) => element.getBoundingClientRect().bottom));
    return {
      notice: box('.live-notice'),
      duel: box('.duel-banner'),
      debuff: box('.debuff-banner'),
      content,
      wide: document.documentElement.scrollWidth <= innerWidth,
      width: innerWidth,
    };
  })()`)) as {
    notice: Box | null;
    duel: Box | null;
    debuff: Box | null;
    content: number | null;
    wide: boolean;
    width: number;
  };
  await shot(olya, 'duel7g-banners-375');
  console.log(`phone stack 375×812: ${JSON.stringify(stack)}`);
  expect(stack.debuff, 'the debuff banner was gone before the check (3 s)').not.toBeNull();
  expect(stack.duel).not.toBeNull();
  expect(stack.notice).not.toBeNull();
  const { notice, duel, debuff } = stack as { notice: Box; duel: Box; debuff: Box };
  expect(stack.wide, 'banners: horizontal scroll').toBe(true);
  for (const [name, box] of Object.entries({ notice, duel, debuff })) {
    expect(box.x >= 0 && box.x + box.width <= stack.width, `${name} leaves the screen`).toBe(true);
  }
  expect(overlaps(notice, duel) || overlaps(duel, debuff) || overlaps(notice, debuff), 'the banners overlap').toBe(false);
  expect(notice.y + notice.height <= duel.y + 0.5, 'the notice is above the duel banner').toBe(true);
  expect(duel.y + duel.height <= debuff.y + 0.5, 'the duel banner is above the debuff banner').toBe(true);
  expect(stack.content! <= duel.y + 0.5, 'the page padding does not clear the banners').toBe(true);
  await expectApart(long, '.duel-banner', ['h1.question', '.choice'], 'long-name duel banner 375');
  await expectNoSideScroll(long, 'duel7g-long-banner-375');

  // 4. Дуель Петро — довгий нік з довгими запитаннями: обидві сцени на кожному етапі.
  const geometry: Record<string, Record<string, DuelGeometry>> = { 900: {}, 720: {} };
  const measure = async (name: string) => {
    geometry[900]![name] = await duelGeometry(stage900);
    geometry[720]![name] = await duelGeometry(stage720);
  };
  await closeAndReveal();
  await click(host, 'Почати дуель');
  for (const stage of [stage900, stage720]) await stage.locator('.duel-stage').getByText('Петро вибирає категорію', exact).waitFor();
  await measure('category');
  await shot(stage720, 'duel7g-long-stage-720-category');
  rigged.push(1);
  await click(petro, 'Довгі запитання · лишилося 3');
  for (const stage of [stage900, stage720]) await stage.locator('.duel-stage-question', { hasText: LONG_DUEL_1 }).waitFor();
  await measure('question');
  await shot(stage720, 'duel7g-long-stage-720-question');
  await shot(stage900, 'duel7g-long-stage-900-question');
  await expectNoSideScroll(long, 'duel7g-long-question-375');
  await duelAnswer(long, 'Так');
  for (const stage of [stage900, stage720]) await stage.locator('.duel-stage-score', { hasText: '0 : 1' }).waitFor();
  await measure('answer');
  await shot(stage720, 'duel7g-long-stage-720-answer');
  await shot(stage900, 'duel7g-long-stage-900-answer');
  rigged.push(1);
  await click(host, 'Наступне запитання дуелі');
  for (const stage of [stage900, stage720]) await stage.locator('.duel-stage-question', { hasText: LONG_DUEL_2 }).waitFor();
  await measure('question2');
  await duelAnswer(long, 'Ні');
  for (const stage of [stage900, stage720]) await stage.locator('.duel-stage-score', { hasText: '0 : 2' }).waitFor();
  await click(host, 'Підсумок дуелі');
  for (const stage of [stage900, stage720]) await stage.locator('.duel-stage').getByText(`Перемога в дуелі: ${LONG_NICK}!`, exact).waitFor();
  await measure('result');
  await shot(stage720, 'duel7g-long-stage-720-result');
  await shot(stage900, 'duel7g-long-stage-900-result');
  console.log(`long duel stage: ${JSON.stringify(geometry)}`);
  for (const size of ['900', '720']) {
    for (const [name, at] of Object.entries(geometry[size]!)) {
      expect(at.wide, `stage ${size} duel ${name}: horizontal scroll`).toBe(true);
      expect(at.scrollHeight, `stage ${size} duel ${name}: vertical scroll`).toBeLessThanOrEqual(at.innerHeight);
    }
  }

  await click(host, 'Продовжити гру');
  await stage900.locator('h1', { hasText: 'Запитання 4:' }).waitFor();
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();
  expect(problems).toEqual([]);
}
