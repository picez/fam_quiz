import { blitzRound, classicRound, ladderRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { type Locator, type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { expectNoSideScroll, join, open, pickOption, register } from './helpers/common';
import { afterSplash, avatarPng, base, exact, problems, shot, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 43 — банк запитань (38f): пошук і фільтр за типом у власних вікторинах, чужа вікторина нікому не видна,
 * кілька запитань копіюються в раунд з новими id і тією самою картинкою, збереження, картинка жива після видалення джерела,
 * гра з копією; вимкнений рядок із причиною, «Вміщається ще N»; телефон 360 px, світла тема.
 */

useE2eServer();

it('part 43: question bank — search own quizzes, filter by type, copy several into a round, save and play the copy, phone 360 px, light theme', async () => {
  try {
    await questionBank43();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

type Json = Record<string, unknown>;
type Opt = { id: string; text: string; imageUrl?: string };
type Saved = { rounds: { type: string; title: string; questions: ({ id: string; text: string; imageUrl: string | null; points: number; timeLimit: number; options?: Opt[]; correctId?: string; correct?: unknown; accepted?: string[] })[] }[] };

const light = async (page: Page) => {
  await page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  return page;
};
const isLight = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('is-light'));

async function questionBank43() {
  // ── 1. Другий акаунт «Тарас»: його вікторина з тим самим словом, яку автор не має бачити. ──
  const taras = await light(await open('taras43', 360, 740));
  await register(taras, 'menu', 'Тарас', 'taras43@example.com');
  const common = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  const post = async (page: Page, quiz: Json) => {
    const response = await page.request.post(`${base}/api/quizzes`, { data: quiz });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { id: string }).id;
  };
  const get = async (page: Page, id: string) => (await (await page.request.get(`${base}/api/quizzes/${id}`)).json()) as Saved & Json;
  await post(taras, {
    ...makeRoundsQuiz([
      classicRound('t1', [{ ...common, id: 't1q', type: 'single', text: 'Яка річка тече через Відень?', options: options('Дунай', 'Влтава'), correctId: 'a' }] as never, { title: 'Чужа' }),
    ]),
    title: 'Чужі річки 43',
  });

  // ── 2. Автор: дві вікторини-джерела й вікторина-ціль. ──
  const author = await light(await open('author43', 360, 740));
  await register(author, 'menu', 'Марта Автор', 'author43@example.com');
  const uploaded = await author.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } });
  expect(uploaded.ok(), await uploaded.text()).toBe(true);
  const picture = ((await uploaded.json()) as { url: string }).url;

  const longest = { ...common, id: 'r1', type: 'single', text: 'Яка річка найдовша в Україні?', imageUrl: picture, timeLimit: 35, points: 800, options: options('Дніпро', 'Дністер', 'Південний Буг', 'Десна'), correctId: 'a' };
  const rivers = await post(author, {
    ...makeRoundsQuiz([
      classicRound(
        'r1',
        [
          longest,
          { ...common, id: 'r2', type: 'boolean', text: 'Дністер впадає в Чорне море?', correct: true, points: 500, timeLimit: 25 },
          { ...common, id: 'r3', type: 'text', text: 'Як називається найвища гора України?', accepted: ['Говерла'], timeLimit: 40 },
        ] as never,
        { title: 'Річки', speedBonus: false, shuffleOptions: false },
      ),
    ]),
    title: 'Річки 43',
  });
  const mountains = await post(author, {
    ...makeRoundsQuiz([
      classicRound(
        'm1',
        [
          { ...common, id: 'm1a', type: 'numeric', text: 'Скільки метрів має Говерла?', correct: 2061, tolerance: 0, timeLimit: 30 },
          { ...common, id: 'm1b', type: 'boolean', text: 'Говерла вища за Монблан?', correct: false, points: 600, timeLimit: 25 },
          { ...common, id: 'm1c', type: 'pin', text: 'Де на мапі Львів?', map: 'world', aspect: 2, target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 },
        ] as never,
        { title: 'Гори', speedBonus: false },
      ),
      blitzRound('m2', [{ ...common, id: 'm2a', type: 'single', text: 'Яка річка тече через Київ?', options: options('Дніпро', 'Дністер', 'Тиса'), correctId: 'a', timeLimit: 25, points: 300 }] as never, { title: 'Швидко' }),
    ]),
    title: 'Гори 43',
  });
  const sums = Array.from({ length: 14 }, (_, i) => {
    const sum = 2 * i + 8;
    const texts = [sum + 1, sum + 2, sum + 3, sum + 4].map(String);
    texts[i % 4] = String(sum);
    return { ...common, id: `l${i + 1}`, type: 'single', text: `Скільки буде ${i + 3} + ${i + 5}?`, options: options(...texts), correctId: 'abcd'[i % 4] };
  });
  const mix = await post(author, {
    ...makeRoundsQuiz([
      classicRound('x1', [{ ...common, id: 'x1a', type: 'single', text: 'Яка тварина живе в Карпатах?', options: options('Рись', 'Пінгвін', 'Верблюд'), correctId: 'a' }] as never, { title: 'Класика', speedBonus: false, shuffleOptions: false }),
      blitzRound('x2', [{ ...common, id: 'x2a', type: 'single', text: 'Яке дерево росте в Карпатах?', options: options('Ялина', 'Пальма'), correctId: 'a', timeLimit: 25 }] as never, { title: 'Бліц' }),
      ladderRound('x3', sums as never, { title: 'Мільйонер', levels: sums.map((_, i) => (i + 1) * 100), safe: [4, 9] }),
    ]),
    title: 'Мікс 43',
  });
  const riversBefore = await get(author, rivers);
  const mountainsBefore = await get(author, mountains);

  // ── 3. Панель: на весь екран, обидві вікторини автора, чужої немає. ──
  await author.goto(`${base}/quizzes/${mix}`);
  await author.getByRole('button', { name: 'Класика', ...exact }).click();
  const bankButton = author.getByRole('button', { name: '📚 З банку запитань', ...exact });
  const dialog = author.getByRole('dialog', { name: 'Банк запитань', ...exact });
  const items = dialog.locator('.question-bank-item');
  const search = dialog.getByLabel('Пошук у своїх вікторинах', exact);
  const pick = (text: string) => dialog.getByRole('checkbox', { name: `Вибрати: ${text}`, ...exact });
  const copyButton = (count: number) => dialog.getByRole('button', { name: `Копіювати в цей раунд (${count})`, ...exact });
  const settle = async () => {
    await dialog.getByText('Завантаження…').waitFor({ state: 'detached' }).catch(() => undefined);
    await author.waitForTimeout(100);
  };
  const find = async (query: string) => {
    await search.fill(query);
    await settle();
    await expect.poll(async () => (await dialog.getByText('Завантаження…').count()) === 0).toBe(true);
  };
  await bankButton.click();
  await dialog.waitFor();
  await items.first().waitFor();
  const box = (await dialog.boundingBox())!;
  expect([box.x, box.y, box.width, box.height], 'the bank panel fills the 360 px screen').toEqual([0, 0, 360, 740]);
  if (process.env.E2E_SHOTS === '1') await author.screenshot({ path: 'apps/server/e2e/artifacts/shots/p43-bank-viewport.png' });
  const listed = await dialog.innerText();
  for (const text of ['Яка річка найдовша в Україні?', 'Дністер впадає в Чорне море?', 'Говерла вища за Монблан?', 'Яка річка тече через Київ?', '«Річки 43»', '«Гори 43»']) {
    expect(listed, text).toContain(text);
  }
  expect(listed).toContain('ця вікторина');
  expect(listed).not.toContain('Відень');
  const thumb = dialog.locator('img.question-bank-thumb').first();
  await thumb.waitFor();
  expect(await thumb.getAttribute('src')).toBe(picture);
  await expectNoSideScroll(author, 'p43-bank-open');
  await find('Відень');
  await dialog.getByText('Нічого не знайдено.', exact).waitFor();
  expect(await items.count(), 'the other account question is never found').toBe(0);

  // ── 4. Пошук «говерла» і фільтр «Тип». ──
  await find('говерла');
  await expect.poll(() => items.count()).toBe(3);
  const found = await items.allInnerTexts();
  expect(found.some((text) => text.includes('Як називається найвища гора України?'))).toBe(true);
  expect(found.some((text) => text.includes('Скільки метрів має Говерла?'))).toBe(true);
  expect(found.some((text) => text.includes('Говерла вища за Монблан?'))).toBe(true);
  await dialog.locator('.question-bank-type select').selectOption('boolean');
  await expect.poll(() => items.count()).toBe(1);
  expect(await items.first().innerText()).toContain('Говерла вища за Монблан?');
  await shot(author, 'p43-bank-filter');

  // ── 5. Позначити два запитання (з мініатюрою) → скопіювати; потім ще одне. ──
  await dialog.locator('.question-bank-type select').selectOption('');
  await find('річка');
  await expect.poll(() => items.count()).toBe(2);
  await pick('Яка річка найдовша в Україні?').check();
  await pick('Яка річка тече через Київ?').check();
  expect(await copyButton(2).isDisabled()).toBe(false);
  await shot(author, 'p43-bank-picked');
  await copyButton(2).click();
  await dialog.waitFor({ state: 'detached' });
  const list = author.locator('.question-list li');
  await expect.poll(() => list.count()).toBe(3);
  await bankButton.click();
  await dialog.waitFor();
  await find('говерла');
  await expect.poll(() => items.count()).toBe(3);
  await pick('Говерла вища за Монблан?').check();
  await copyButton(1).click();
  await dialog.waitFor({ state: 'detached' });
  await expect.poll(() => list.count()).toBe(4);

  // ── 6. Бліц: недопустимих типів у фільтрі немає, їх запитань теж. ──
  await author.getByRole('button', { name: 'Бліц', ...exact }).click();
  await bankButton.click();
  await dialog.waitFor();
  await items.first().waitFor();
  const blitzTypes = await dialog.locator('.question-bank-type select').locator('option').allTextContents();
  expect(blitzTypes[0]).toBe('Усі дозволені типи');
  expect(blitzTypes.join('|')).not.toContain('Точка на мапі');
  expect(blitzTypes.join('|')).toContain('Так чи ні');
  await find('Львів');
  await dialog.getByText('Нічого не знайдено.', exact).waitFor();
  expect(await items.count()).toBe(0);
  await dialog.getByRole('button', { name: 'Закрити банк запитань', ...exact }).click();
  await dialog.waitFor({ state: 'detached' });

  // ── 6b. «Мільйонер» на 14 з 15: запитання з 3 варіантами вимкнене з причиною; позначено 2 — «Вміщається ще 1». ──
  await author.getByRole('button', { name: 'Мільйонер', ...exact }).click();
  await bankButton.click();
  await dialog.waitFor();
  await items.first().waitFor();
  await find('Київ');
  await expect.poll(() => items.count()).toBe(1);
  expect(await pick('Яка річка тече через Київ?').isDisabled()).toBe(true);
  await dialog.getByText('У «Мільйонері» — лише «один варіант» з 4 варіантами.', exact).waitFor();
  await shot(author, 'p43-bank-greyed');
  await find('Скільки буде');
  await expect.poll(() => items.count()).toBe(14);
  await pick('Скільки буде 3 + 5?').check();
  await pick('Скільки буде 4 + 6?').check();
  expect(await copyButton(2).isDisabled()).toBe(true);
  await dialog.getByRole('status').filter({ hasText: 'Вміщається ще 1' }).waitFor();
  await expectNoSideScroll(author, 'p43-bank-room-left');
  await pick('Скільки буде 4 + 6?').uncheck();
  expect(await copyButton(1).isDisabled()).toBe(false);
  await dialog.getByRole('button', { name: 'Закрити банк запитань', ...exact }).click();
  await dialog.waitFor({ state: 'detached' });

  // ── 7. Зберегти: нові id, ті самі тексти, відповіді, бали, таймери й картинка; джерела не змінились. ──
  await author.getByRole('button', { name: 'Зберегти', ...exact }).click();
  await author.waitForURL(`${base}/quizzes`);
  const saved = await get(author, mix);
  const classic = saved.rounds[0]!;
  expect(classic.questions.map((q) => q.text)).toEqual([
    'Яка тварина живе в Карпатах?',
    'Яка річка найдовша в Україні?',
    'Яка річка тече через Київ?',
    'Говерла вища за Монблан?',
  ]);
  const sources = new Map([...riversBefore.rounds, ...mountainsBefore.rounds].flatMap((r) => r.questions).map((q) => [q.text, q]));
  const allSourceIds = new Set([...sources.values()].flatMap((q) => [q.id, ...(q.options ?? []).map((o) => o.id)]));
  for (const copy of classic.questions.slice(1)) {
    const source = sources.get(copy.text)!;
    expect(copy.id, 'a new question id').not.toBe(source.id);
    for (const option of copy.options ?? []) expect(allSourceIds.has(option.id), 'a new option id').toBe(false);
    expect([copy.points, copy.timeLimit, copy.imageUrl]).toEqual([source.points, source.timeLimit, source.imageUrl]);
    expect(copy.options?.map((o) => o.text)).toEqual(source.options?.map((o) => o.text));
    expect(copy.options?.find((o) => o.id === copy.correctId)?.text).toBe(source.options?.find((o) => o.id === source.correctId)?.text);
    expect(copy.correct).toEqual(source.correct);
    expect(copy.timeLimit).toBeGreaterThanOrEqual(25);
  }
  const copiedImage = classic.questions[1]!.imageUrl!;
  expect(copiedImage).toBe(picture);
  expect(await get(author, rivers), 'the source quiz «Річки 43» is untouched').toEqual(riversBefore);
  expect(await get(author, mountains), 'the source quiz «Гори 43» is untouched').toEqual(mountainsBefore);

  // ── 8. Видалити «Річки 43» → картинка копії відкривається, ті самі байти. ──
  const removed = await author.request.delete(`${base}/api/quizzes/${rivers}`);
  expect(removed.ok(), await removed.text()).toBe(true);
  const image = await author.request.get(`${base}${copiedImage}`);
  expect(image.status()).toBe(200);
  expect((await image.body()).equals(avatarPng()), 'the picture bytes').toBe(true);

  // ── 9. Гра «Мікс 43»: перше запитання своє, друге — копія з картинкою. ──
  await author.setViewportSize({ width: 1280, height: 800 });
  await author.goto(`${base}/quizzes`);
  await author.locator('.quiz-list li', { hasText: 'Мікс 43' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await author.waitForURL(/\/host\/\d{6}$/);
  const code = author.url().slice(-6);
  const stage = await light(await open('stage43', 1280, 720));
  await stage.goto((await author.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
  const olya = await light(await open('olya43', 360, 740));
  await join(olya, code, 'Оля', false);
  await author.getByText('Оля', exact).first().waitFor();
  const step = async (name: string) => {
    const button = author.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  await step('Почати гру');
  await afterSplash(author, stage, olya);
  await step('Почати раунд');
  await afterSplash(author, stage, olya);
  await pickOption(olya, 'Рись');
  await author.getByText('Запитання закрите').waitFor();
  await step('Показати відповідь');
  await step('Далі');
  await step('Наступне запитання');
  await afterSplash(author, stage, olya);
  for (const page of [stage, olya] as const) {
    await page.getByText('Яка річка найдовша в Україні?').first().waitFor();
    const picture43: Locator = page.locator(`img[src="${copiedImage}"]`).first();
    await picture43.waitFor();
    expect(await picture43.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), 'the copied picture loads').toBe(true);
  }
  await shot(olya, 'p43-play-copy-phone');
  await pickOption(olya, 'Дніпро');
  await author.getByText('Запитання закрите').waitFor();
  await step('Показати відповідь');
  await olya.getByText(/правильн/i).first().waitFor();
  await expect.poll(async () => Number((await author.locator('li', { hasText: 'Оля' }).locator('.score').first().textContent())!.replace(/[^\d-]/g, ''))).toBeGreaterThan(0);

  // ── 10. Світла тема на всіх кадрах. ──
  for (const [name, page] of [['author', author], ['stage', stage], ['olya', olya], ['taras', taras]] as const) {
    expect(await isLight(page), `${name}: light theme class`).toBe(true);
  }
  expect(problems).toEqual([]);
}
