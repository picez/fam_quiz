import { boardRound, classicRound, makeRoundsQuiz, single, text as textQ, withId, withPoints } from '@quiz/engine/testing';
import { DEFAULT_RULES } from '@quiz/shared';
import { PIN_PLACES } from '../scripts/pin-places';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { open, click, field, seconds, join, bodyText, expectNoSideScroll, register, POLL, socketFrames, silentMp3, scoreOf, toNextQuestion, clueTexts, framesBeforeReveal, totalOf, expectStageFits, fillSurvey, answerSurvey, frame } from './helpers/common';
import { avatarPng, exact, base, problems, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 10a–10e: довідка ведучого, слайдер/аудіо/картинка, «Хто я?» і шпильки, стіна й опитування, «100 до 1».
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 10a: host help — ⓘ in the editor for a setting, a buff, a blitz cell and a round type, a sheet on a phone, reading help leaves the quiz unchanged; the reference with topics, search and an anchor; ⓘ on the host console that never stops the game', async () => {
  try {
    await hostHelpGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function hostHelpGame() {
  const host = await open('host10a', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host10a@example.com');

  const warmup = {
    imageUrl: null,
    video: null,
    timeLimit: 30,
    points: 100,
    id: 'q1',
    type: 'single' as const,
    text: 'Столиця України?',
    options: ['Київ', 'Львів', 'Одеса'].map((text, at) => ({ id: `q1o${at}`, text })),
    correctId: 'q1o0',
  };
  const cellQ = (category: string, price: number) => ({
    ...withPoints(withId(single, `b-${category}-${price}`), price),
    text: `${category} ${price}: столиця України?`,
  });
  const cells = (title: string) =>
    [100, 200, 300].map((price) => {
      const question = cellQ(title, price);
      if (title === 'Міста' && price === 100) return { kind: 'blitz' as const, question };
      if (title === 'Річки' && price === 100) return { answerMode: 'voice' as const, question };
      if (title === 'Гори' && price === 300) return { mark: 'x2' as const, question };
      return question;
    });
  const rounds = [
    classicRound('r1', [warmup], { title: 'Розминка', speedBonus: true }),
    boardRound(
      'r2',
      ['Міста', 'Річки', 'Гори'].map((title) => ({ title, cells: cells(title) })),
      { title: 'Поле', answerMode: 'phone', check: 'auto' },
    ),
  ];
  const spares = [{ ...warmup, id: 'g1', type: 'text' as const, text: 'Яке місто стоїть на Пруті?', accepted: ['Чернівці'] }];
  const data = {
    ...makeRoundsQuiz(rounds, { leaderboard: 'end', buffs: ['fifty', 'double', 'retry', 'time', 'shield', 'audience', 'hint', 'swap'] }),
    spares,
    title: 'Довідка 10a',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Діалоги підтвердження (вихід зі зміненого редактора) не мають з'являтися.
  const dialogs: string[] = [];
  host.on('dialog', (dialog) => dialogs.push(dialog.message()));

  // 1. Список вікторин.
  await host.goto(`${base}/quizzes`);
  expect(await host.getByRole('link', { name: 'Довідка ведучого', ...exact }).getAttribute('href')).toBe('/help');

  // 2. Редактор.
  await host.locator('.quiz-list li', { hasText: 'Довідка 10a' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  expect(await host.locator('main.editor').getByRole('link', { name: 'Довідка ведучого', ...exact }).getAttribute('target')).toBe('_blank');
  const dialog = (name: string) => host.getByRole('dialog', { name, ...exact });

  await host.locator('details.rules').first().locator('summary').click();
  await host.getByRole('button', { name: 'Довідка: Показувати рейтинг', ...exact }).click();
  await dialog('Показувати рейтинг').waitFor();
  await dialog('Показувати рейтинг').getByText(/Лише в кінці гри/).first().waitFor();
  await shot(host, 'help10a-editor-setting');
  await host.keyboard.press('Escape');
  await dialog('Показувати рейтинг').waitFor({ state: 'detached' });
  expect(await host.evaluate("document.activeElement?.getAttribute('aria-label')")).toBe('Довідка: Показувати рейтинг');

  await host.locator('details.powers > summary').click();
  await host.getByRole('button', { name: 'Довідка: Заміна запитання', ...exact }).click();
  const buffDialog = dialog('Заміна запитання');
  await buffDialog.waitFor();
  for (const heading of ['Що це', 'Як іде в грі', 'Бали', 'Порада', 'Обмеження']) {
    await buffDialog.getByRole('heading', { name: heading, ...exact }).waitFor();
  }
  expect(await buffDialog.getByRole('link', { name: 'Усі пояснення' }).getAttribute('href')).toBe('/help#help-buff-swap');
  await shot(host, 'help10a-editor-buff');
  await host.keyboard.press('Escape');
  await buffDialog.waitFor({ state: 'detached' });

  await host.locator('.round-tabs').getByRole('button', { name: 'Поле', ...exact }).click();
  await host.getByRole('button', { name: /^Категорія 1, клітинка 1: 100 бліц/ }).click();
  await host.getByRole('button', { name: 'Довідка: Бліц-клітинка', ...exact }).first().click();
  await dialog('Бліц-клітинка').getByText(/Мінус для всіх/).first().waitFor();
  await shot(host, 'help10a-editor-cell');
  await host.keyboard.press('Escape');
  await dialog('Бліц-клітинка').waitFor({ state: 'detached' });

  await click(host, '+ Раунд');
  await host.getByRole('button', { name: 'Довідка: Фінал', ...exact }).click();
  await dialog('Фінал').waitFor();
  await shot(host, 'help10a-editor-round');
  await dialog('Фінал').getByRole('button', { name: 'Закрити', ...exact }).click();
  await dialog('Фінал').waitFor({ state: 'detached' });

  await host.setViewportSize({ width: 375, height: 812 });
  await host.locator('.round-tabs').getByRole('button', { name: 'Розминка', ...exact }).click();
  await host.getByRole('button', { name: 'Довідка: Один правильний варіант', ...exact }).click();
  const sheet = dialog('Один правильний варіант');
  await sheet.waitFor();
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(375);
  // На телефоні аркуш висить зверху (до половини екрана) і лишає нижню частину доступною.
  expect(box.y).toBeLessThanOrEqual(1);
  expect(box.height).toBeLessThanOrEqual(812 / 2 + 1);
  await sheet.getByRole('button', { name: 'Закрити', ...exact }).waitFor();
  await shot(host, 'help10a-editor-sheet-375');
  await expectNoSideScroll(host, 'help10a-editor-375');
  await host.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  await host.setViewportSize({ width: 1280, height: 900 });

  await click(host, 'Скасувати');
  await host.waitForURL(/\/quizzes$/);
  expect(dialogs).toEqual([]);

  // 3. Довідник.
  await host.goto(`${base}/help`);
  await host.getByRole('heading', { level: 1, name: 'Довідка ведучого', ...exact }).waitFor();
  expect(await host.locator('h2').allTextContents()).toEqual(['Раунди', 'Типи запитань', 'Клітинки поля', 'Бафи', 'Дебафи', 'Налаштування', 'Команди']);
  await shot(host, 'help10a-reference');
  const search = host.getByLabel('Пошук за назвою', exact);
  await search.fill('щит');
  await expect.poll(() => host.locator('h3:visible').allTextContents()).toEqual(['🛡 Щит']);
  await shot(host, 'help10a-reference-search');
  await search.fill('зззз');
  await host.getByText('Нічого не знайдено.', exact).waitFor();
  await search.fill('');
  await host.goto(`${base}/help#help-buff-swap`);
  const target = host.locator('article#help-buff-swap');
  await target.waitFor();
  expect(await target.getAttribute('class')).toContain('is-target');
  await expect.poll(async () => (await target.boundingBox())!.y).toBeLessThan(900);
  await host.setViewportSize({ width: 375, height: 812 });
  await host.goto(`${base}/help`);
  await host.getByRole('heading', { level: 1, name: 'Довідка ведучого', ...exact }).waitFor();
  await expectNoSideScroll(host, 'help10a-reference-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  // 4. Пульт.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Довідка 10a' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const helpLink = host.getByRole('link', { name: 'Довідка ведучого', ...exact });
  expect(await helpLink.getAttribute('href')).toBe('/help');
  expect(await helpLink.getAttribute('target')).toBe('_blank');
  const olya = await open('olya10a', 375, 812);
  await join(olya, code, 'Оля', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olya);
  await host.getByRole('button', { name: 'Довідка: Класичний', ...exact }).waitFor();
  await click(host, 'Почати раунд');
  await afterSplash(host, olya);

  const context = host.locator('.host-context');
  await expect.poll(() => context.textContent()).toContain('Розминка');
  expect(await context.textContent()).toContain('Один правильний варіант');
  await host.getByRole('button', { name: 'Довідка: Один правильний варіант', ...exact }).click();
  await dialog('Один правильний варіант').waitFor();
  await shot(host, 'help10a-host-popover');
  const before = await seconds(host);
  await host.waitForTimeout(1500);
  expect(await seconds(host)).toBeLessThan(before);
  expect(await host.locator('p.banner[role="status"]', { hasText: 'Пауза' }).count()).toBe(0);
  await click(host, 'Пауза');
  await host.locator('p.banner[role="status"]', { hasText: 'Пауза' }).waitFor();
  await click(host, 'Продовжити');
  await host.locator('p.banner[role="status"]', { hasText: 'Пауза' }).waitFor({ state: 'detached' });

  await olya.getByRole('button', { name: /Київ/ }).click();
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await dialog('Один правильний варіант').waitFor({ state: 'detached' });
  await host.getByText(/Правильна відповідь: .*Київ/).first().waitFor();
  await shot(host, 'help10a-host-reveal');

  expect(problems).toEqual([]);
}

it('part 10b: slider, audio and revealing picture — the editor builds them, the host plays a clip without a stage, the stage plays and obeys replay/stop, the timer waits for a long clip, the slider scale on the reveal, the picture sharpens with time and pays less later', async () => {
  try {
    await sliderAudioRevealGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Стадія проявлення картинки на сторінці (data-stage). */
const revealStageOf = async (page: Page) => Number(await page.locator('[data-stage]').first().getAttribute('data-stage'));

async function sliderAudioRevealGame() {
  const host = await open('host10b', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10b@example.com');
  const img = ((await (await host.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } })).json()) as { url: string }).url;

  const common = { imageUrl: null, video: null, points: 1000 };
  const options = (id: string, right: string, wrong: string) => [
    { id: `${id}o0`, text: right },
    { id: `${id}o1`, text: wrong },
  ];
  const questions = [
    { ...common, id: 'a1', type: 'single' as const, text: 'Що це за звук?', options: options('a1', 'Тиша', 'Дзвін'), correctId: 'a1o0', timeLimit: 20 },
    {
      ...common,
      id: 's1',
      type: 'slider' as const,
      text: 'Скільки відсотків поверхні Землі вкриває вода?',
      min: 0,
      max: 100,
      step: 1,
      correct: 71,
      tolerance: 2,
      zeroBeyond: 12,
      unit: '%',
      timeLimit: 30,
    },
    {
      ...common,
      id: 'y1',
      type: 'single' as const,
      text: 'Назвіть гурт',
      options: options('y1', 'Queen', 'ABBA'),
      correctId: 'y1o0',
      timeLimit: 5,
      audio: { source: 'youtube' as const, id: 'fJ9rUzIMcZQ', start: 0, duration: 8 },
    },
    { ...common, id: 'p1', type: 'text' as const, text: 'Що на картинці?', accepted: ['Коло', 'Жовте коло'], imageUrl: img, reveal: 'pixels' as const, timeLimit: 12 },
  ];
  const data = {
    ...makeRoundsQuiz([classicRound('r1', questions as never, { title: 'Звуки й картинки', speedBonus: true })]),
    title: 'Звуки й картинки 10b',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Звуки й картинки 10b' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();

  await host.getByRole('button', { name: /^Запитання 1 / }).click();
  await host.locator('.audio-field input[type=file]').setInputFiles({ name: 'silence.mp3', mimeType: 'audio/mpeg', buffer: silentMp3() });
  await host.getByText('Аудіофайл', exact).first().waitFor();
  await field(host, 'Початок, с').waitFor();
  const duration = field(host, 'Тривалість, с');
  await duration.waitFor();
  expect(Number(await duration.inputValue())).toBeLessThanOrEqual(15);
  await duration.fill('2');
  await host.getByText('Таймер іде разом зі звуком.', exact).waitFor();
  await shot(host, 'p10b-editor-audio');

  await host.getByRole('button', { name: /^Запитання 2 / }).click();
  await field(host, 'Мінімум').waitFor();
  expect(await field(host, 'Мінімум').inputValue()).toBe('0');
  expect(await field(host, 'Максимум').inputValue()).toBe('100');
  expect(await field(host, 'Правильне значення').inputValue()).toBe('71');
  expect(await field(host, 'Нуль балів далі ніж ±').inputValue()).toBe('12');
  await shot(host, 'p10b-editor-slider');
  await field(host, 'Мінімум').fill('100');
  await click(host, 'Зберегти');
  await host.locator('ul.problems').getByText('повзунок — перевірте мінімум, максимум і крок', { exact: false }).waitFor();
  await field(host, 'Мінімум').fill('0');

  await host.getByRole('button', { name: /^Запитання 4 / }).click();
  const pixels = host.getByRole('button', { name: 'З пікселів', ...exact });
  await pixels.waitFor();
  expect(await pixels.getAttribute('aria-pressed')).toBe('true');
  await shot(host, 'p10b-editor-reveal');

  await host.getByRole('button', { name: /^Запитання 3 / }).click();
  await host.getByText('YouTube — лише звук', { exact: false }).first().waitFor();
  await host.getByText('Фрагмент 8 с довший за час 5 с: таймер стартує після фрагмента (разом 13 с).', exact).waitFor();

  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'p10b-editor-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { questions: { id: string; audio?: { source: string; url?: string; duration: number } }[] }[] };
  const audio = stored.rounds[0]!.questions.find((question) => question.id === 'a1')!.audio!;
  expect(audio.source).toBe('file');
  expect(audio.url).toMatch(/^\/uploads\/[0-9a-f]+\.mp3$/);
  expect(audio.duration).toBe(2);

  // 2. Гра без сцени.
  await host.locator('.quiz-list li', { hasText: 'Звуки й картинки 10b' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const olya = await open('olya10b', 375, 812);
  const petro = await open('petro10b', 375, 812);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olya, petro);
  await click(host, 'Почати раунд');
  await afterSplash(host, olya, petro);

  await host.getByText('🎵 Сцена не відкрита — звук грає тут', exact).waitFor();
  const unlock = host.getByRole('button', { name: '🔊 Увімкнути звук', ...exact });
  if (await unlock.isVisible()) await unlock.click();
  await expect.poll(() => host.locator('[data-plays]').getAttribute('data-plays'), POLL).toBe('1');
  await shot(host, 'p10b-audio-host-local');
  await click(host, 'Програти ще раз');
  await expect.poll(() => host.locator('[data-plays]').getAttribute('data-plays'), POLL).toBe('2');
  // 16b: телефон гри з ведучим сам не грає, лише пропонує «Прослухати».
  for (const phone of [olya, petro]) {
    await phone.getByRole('button', { name: '🔊 Прослухати', ...exact }).waitFor();
    expect(await phone.locator('.audio-card').getAttribute('data-plays')).toBe('0');
    expect(await phone.locator('.audio-card').getAttribute('data-state')).toBe('idle');
  }
  await olya.getByRole('button', { name: /Тиша/ }).click();
  await petro.getByRole('button', { name: /Дзвін/ }).click();
  await click(host, 'Показати відповідь');
  await toNextQuestion(host);
  await afterSplash(host, olya, petro);

  // 3. Сцена й повзунок.
  const stage = await open('stage10b', 1280, 720);
  await stage.goto(stageUrl);
  await stage.getByText('Тягніть повзунок на телефоні: від 0 до 100 %', exact).waitFor();
  await expect.poll(() => olya.locator('.slider-value').textContent(), POLL).toMatch(/^50\s*%$/);
  for (let i = 0; i < 3; i++) await olya.getByRole('button', { name: 'Більше на 1', ...exact }).click();
  await expect.poll(() => olya.locator('.slider-value').textContent(), POLL).toMatch(/^53\s*%$/);
  await olya.getByRole('slider', { name: 'Повзунок', ...exact }).fill('70');
  await expect.poll(() => olya.locator('.slider-value').textContent(), POLL).toMatch(/^70\s*%$/);
  await shot(olya, 'p10b-phone-slider');
  await expectNoSideScroll(olya, 'p10b-phone-slider');
  await click(olya, 'Відповісти');
  await petro.getByRole('slider', { name: 'Повзунок', ...exact }).fill('80');
  await click(petro, 'Відповісти');
  await click(host, 'Показати відповідь');
  const scale = stage.locator('.slider-scale');
  await scale.waitFor();
  await scale.getByRole('img', { name: 'Оля: 70 %', ...exact }).first().waitFor({ state: 'attached' });
  await scale.getByRole('img', { name: 'Петро: 80 %', ...exact }).first().waitFor({ state: 'attached' });
  await scale.getByText('71 %', exact).first().waitFor();
  await shot(stage, 'p10b-stage-scale');
  await olya.getByText(/Твоя відповідь: 70\s*% · правильна: 71\s*% \(± 2\)/).first().waitFor();
  const olyaScore = await scoreOf(host, 'Оля');
  const petroScore = await scoreOf(host, 'Петро');
  expect(olyaScore).toBeGreaterThan(0);
  expect(petroScore).toBeGreaterThan(0);
  expect(petroScore).toBeLessThan(olyaScore);
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 4. Аудіо з YouTube, довгий фрагмент.
  const stageUnlock = stage.getByRole('button', { name: '🔊 Увімкнути звук', ...exact });
  if (await stageUnlock.isVisible()) await stageUnlock.click();
  await expect.poll(() => stage.locator('[data-plays]').getAttribute('data-plays'), POLL).toBe('1');
  expect(await stage.locator('.audio-only-frame').getAttribute('aria-hidden')).toBe('true');
  await stage.getByText('🎵 Слухайте', exact).first().waitFor();
  await shot(stage, 'p10b-audio-stage-listening');
  await host.getByText('🎵 Звук грає на сцені', exact).waitFor();
  expect(await host.locator('[data-plays]').count()).toBe(0);
  await click(host, 'Програти ще раз');
  await expect.poll(() => stage.locator('[data-plays]').getAttribute('data-plays'), POLL).toBe('2');
  await click(host, 'Стоп');
  await expect.poll(() => stage.locator('[data-plays]').getAttribute('data-state'), POLL).toBe('stopped');
  await shot(host, 'p10b-audio-host-controls');
  await stage.waitForTimeout(1000);
  expect(await seconds(stage)).toBe(5);
  await olya.getByRole('button', { name: /Queen/ }).click();
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  // Запитання з проявленням відкривається не раніше цієї миті й не пізніше, ніж зникне заставка:
  // очікувана стадія виводиться з виміряного часу, а не з припущень про швидкість машини.
  const revealOpenedAfter = Date.now();
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);
  const revealOpenedBy = Date.now();
  const REVEAL_WINDOW_MS = 12_000;
  const stageAt = (ms: number) => Math.floor((Math.max(0, ms) / REVEAL_WINDOW_MS) * 10);
  /** Стадія на сторінці в межах того, що дозволяє виміряний час (± 1 на округлення й годинники). */
  const expectRevealStage = async (page: Page) => {
    const at = Date.now();
    const shown = await revealStageOf(page);
    const after = Date.now();
    expect(shown).toBeGreaterThanOrEqual(Math.max(0, stageAt(at - revealOpenedBy) - 1));
    expect(shown).toBeLessThanOrEqual(Math.min(9, stageAt(after - revealOpenedAfter) + 1));
    return shown;
  };

  // 5. Картинка, що проявляється.
  await expectRevealStage(stage);
  await shot(stage, 'p10b-reveal-stage-early');
  await petro.getByText('Картинка проявляється: що раніше відповіси, то більше балів.').waitFor();
  await olya.waitForTimeout(1000);
  await field(olya, 'Ваша відповідь').fill('Коло');
  await click(olya, 'Відповісти');
  const olyaAnsweredBy = Date.now();
  await olya.waitForTimeout(6000);
  // Хто вже відповів, бачить стадію за часом, а не повну картинку.
  await expectRevealStage(olya);
  await shot(olya, 'p10b-reveal-phone-mid');
  await field(petro, 'Ваша відповідь').fill('Квадрат');
  await click(petro, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  await expect
    .poll(async () => (await stage.locator('canvas[data-stage]').count()) === 0 || (await revealStageOf(stage)) === 10, POLL)
    .toBe(true);
  await shot(stage, 'p10b-reveal-stage-full');
  await click(host, 'Показати відповідь');
  const gained = await scoreOf(host, 'Оля');
  // Ціна спадає зі 100 до 30 % за 12 с; Оля відповіла не пізніше olyaAnsweredBy.
  const latest = Math.min(1, (olyaAnsweredBy - revealOpenedAfter) / REVEAL_WINDOW_MS);
  expect(gained).toBeGreaterThanOrEqual(Math.floor(1000 * (1 - 0.7 * latest)) - 1);
  expect(gained).toBeLessThan(1000);
  expect(await scoreOf(host, 'Петро')).toBe(0);

  expect(problems).toEqual([]);
}

/** Дотик у частку (x, y) мапи: рахує піксель з рамки .pin-frame (без наближення). */
async function tapMap(page: Page, point: { x: number; y: number }): Promise<void> {
  const frame = page.locator('.pin-frame').first();
  await frame.scrollIntoViewIfNeeded();
  const box = (await frame.boundingBox())!;
  await page.mouse.click(box.x + point.x * box.width, box.y + point.y * box.height);
}

/** Тексти відкритих підказок на сторінці (з номерами: `.clue-n` + `.clue-text`). */
const shownClues = async (page: Page) => page.locator('.clue:not(.is-hidden)').allTextContents();

it('part 10c: «Who am I?» and pins — the editor builds both (375 px too), clues open one by one and never leak, the pin moves until submit and zooms, the stage reveals every pin with circles, the host opens clues on a voice cell', async () => {
  try {
    await cluesPinGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function cluesPinGame() {
  const host = await open('host10c', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10c@example.com');
  // Збірка кладе поруч із мапами стиснені копії, сервер віддає їх за Accept-Encoding.
  for (const encoding of ['br', 'gzip']) {
    const map = await host.request.get(`${base}/maps/world.svg`, { headers: { 'accept-encoding': encoding } });
    expect(map.ok()).toBe(true);
    expect(map.headers()['content-encoding'], `/maps/world.svg with ${encoding}`).toBe(encoding);
  }

  const common = { imageUrl: null, video: null, points: 1000 };
  const FIVE = 'Я написав «Кобзар».';
  const c1 = {
    ...common,
    id: 'c1',
    type: 'clues' as const,
    text: 'Хто я?',
    clues: ['Я народився в Моринцях.', 'Я був кріпаком.', 'Я художник і поет.', 'Мій портрет — на 100 гривнях.'],
    accepted: ['Шевченко', 'Тарас Шевченко'],
    // 3 × 8 + 5 = 29 ≤ 30; між підказками досить часу, щоб гравці встигли відповісти саме на потрібній.
    interval: 8,
    timeLimit: 30,
  };
  const p1 = {
    ...common,
    id: 'p1',
    type: 'pin' as const,
    text: 'Де на мапі Львів?',
    map: 'world' as const,
    aspect: 2,
    target: { x: 0.5, y: 0.5 },
    fullRadius: 3,
    zeroRadius: 15,
    timeLimit: 30,
  };
  const voiceClues = {
    ...common,
    id: 'v1',
    type: 'clues' as const,
    text: 'Хто я?',
    clues: ['Я народилася в Новограді-Волинському.', 'Я писала «Лісову пісню».', 'Мій псевдонім — Леся.'],
    accepted: ['Леся Українка'],
    interval: 8,
    timeLimit: 30,
    points: 300,
  };
  const filler = (category: string, row: number) => ({ ...withPoints(withId(textQ, `f-${category}-${row}`), (row + 3) * 100), text: `${category} ${row + 1}?` });
  const categories = ['Міста', 'Річки', 'Гори'].map((title, column) => ({
    title,
    cells: [0, 1, 2].map((row) => (column === 0 && row === 0 ? voiceClues : filler(title, row))),
  }));
  const data = {
    ...makeRoundsQuiz(
      [
        classicRound('r1', [c1, p1] as never, { title: 'Хто я й де це', speedBonus: false, rules: DEFAULT_RULES }),
        boardRound('r2', categories as never, { title: 'Поле', answerMode: 'voice', check: 'manual' }),
      ],
      { leaderboard: 'end' },
    ),
    title: 'Хто я й де це 10c',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Хто я й де це 10c' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();

  await host.getByRole('button', { name: /^Запитання 1 / }).click();
  for (const n of [1, 2, 3, 4]) await field(host, `Підказка ${n}`).waitFor();
  await host.getByText('Остання підказка відкриється на 24-й секунді з 30.', exact).waitFor();
  await click(host, 'Додати підказку');
  await field(host, 'Підказка 5').fill(FIVE);
  // П'ята підказка піднімає час до 4 × 8 + 5 = 37 с.
  await host.getByText('Остання підказка відкриється на 32-й секунді з 37.', exact).waitFor();
  await shot(host, 'p10c-editor-clues');

  await host.getByRole('button', { name: /^Запитання 2 / }).click();
  const baseChips = host.getByRole('group', { name: 'Основа точки', ...exact });
  await baseChips.getByRole('button', { name: 'Україна', ...exact }).click();
  expect(await baseChips.getByRole('button', { name: 'Україна', ...exact }).getAttribute('aria-pressed')).toBe('true');
  await tapMap(host, PIN_PLACES.ukraine.lviv);
  await host.locator('.pin-frame .pin-target').waitFor();
  await host.locator('.pin-frame .pin-circle-full').waitFor({ state: 'attached' });
  await host.locator('.pin-frame .pin-circle-zero').waitFor({ state: 'attached' });
  await shot(host, 'p10c-editor-pin');

  await field(host, 'Нуль балів далі ніж, %').fill('2');
  await click(host, 'Зберегти');
  await host.locator('ul.problems').getByText('радіус нуля має бути більшим', { exact: false }).waitFor();
  await field(host, 'Нуль балів далі ніж, %').fill('15');

  await host.setViewportSize({ width: 375, height: 812 });
  await click(host, 'Попереднє запитання');
  await field(host, 'Підказка 5').waitFor();
  await expectNoSideScroll(host, 'p10c-editor-clues-375');
  await click(host, 'Наступне запитання');
  await host.locator('.pin-frame').waitFor();
  await expectNoSideScroll(host, 'p10c-editor-pin-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as {
    rounds: { questions?: { id: string; clues?: string[]; map?: string; aspect?: number; target?: { x: number; y: number } }[] }[];
  };
  const [storedClues, storedPin] = [stored.rounds[0]!.questions![0]!, stored.rounds[0]!.questions![1]!];
  expect(storedClues.clues).toHaveLength(5);
  expect(storedClues.clues![4]).toBe(FIVE);
  expect(storedPin.map).toBe('ukraine');
  expect(storedPin.aspect).toBeCloseTo(16 / 11, 5);
  expect(Math.abs(storedPin.target!.x - PIN_PLACES.ukraine.lviv.x)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(storedPin.target!.y - PIN_PLACES.ukraine.lviv.y)).toBeLessThanOrEqual(0.01);

  // 2. Гра.
  await host.locator('.quiz-list li', { hasText: 'Хто я й де це 10c' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10c', 1280, 720);
  await stage.goto(stageUrl);
  const olya = await open('olya10c', 375, 812);
  const petro = await open('petro10c', 375, 812);
  const frames = socketFrames(olya);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olya, petro, stage);
  await click(host, 'Почати раунд');
  await afterSplash(host, olya, petro, stage);

  // 3. «Хто я?» (класика).
  await olya.locator('.clues-list').waitFor();
  expect(await clueTexts(olya)).toEqual([c1.clues[0]]);
  expect(await clueTexts(stage)).toEqual([c1.clues[0]]);
  expect((await shownClues(olya)).length).toBe(1);
  await olya.locator('.clue.is-hidden').first().getByText(/^Підказка 2 — за \d+ с$/).waitFor();
  await expect.poll(async () => (await clueTexts(olya)).length, { timeout: 15000 }).toBe(2);
  await olya.getByText(/Підказка 2 з 5: правильна відповідь зараз — 80\s*%\s*ціни/).waitFor();
  await shot(olya, 'p10c-phone-clues');
  await expectNoSideScroll(olya, 'p10c-phone-clues');
  const early = frames.join('\n');
  for (const secret of ['Я художник і поет.', 'Мій портрет — на 100 гривнях.', FIVE, 'Шевченко']) {
    expect(early.includes(secret), `a clue or spelling leaked to the phone: ${secret}`).toBe(false);
  }
  await field(olya, 'Ваша відповідь').fill('Шевченко');
  await click(olya, 'Відповісти');
  await expect.poll(async () => (await clueTexts(petro)).length, { timeout: 15000 }).toBe(3);
  await field(petro, 'Ваша відповідь').fill('Франко');
  await click(petro, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await expect.poll(async () => (await clueTexts(stage)).length).toBe(5);
  await host.locator('li', { hasText: 'Оля' }).getByText('на підказці 2', exact).waitFor();
  expect(await scoreOf(host, 'Оля')).toBe(800);
  expect(await scoreOf(host, 'Петро')).toBe(0);
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 4. Точка (класика).
  await stage.locator('img.pin-base[src*="/maps/ukraine.svg"]').waitFor();
  await stage.getByText('Ставте точку на телефоні', exact).waitFor();
  expect(await stage.locator('.pin-target').count()).toBe(0);
  const submit = olya.getByRole('button', { name: 'Відповісти', ...exact });
  await olya.locator('.pin-frame').waitFor();
  expect(await submit.isDisabled()).toBe(true);
  await tapMap(olya, PIN_PLACES.ukraine.kharkiv);
  await tapMap(olya, PIN_PLACES.ukraine.lviv);
  expect(await olya.locator('.pin-mark.is-mine').count()).toBe(1);
  expect(await submit.isDisabled()).toBe(false);
  await click(olya, 'Наблизити');
  expect(await olya.locator('.pin-zoom-layer').getAttribute('style')).toMatch(/scale\(1\.5\)/);
  await shot(olya, 'p10c-phone-pin');
  await expectNoSideScroll(olya, 'p10c-phone-pin');
  await click(olya, 'Уся мапа');
  expect(await olya.locator('.pin-zoom-layer').getAttribute('style')).toMatch(/scale\(1\)/);
  await submit.click();
  await tapMap(petro, PIN_PLACES.ukraine.kharkiv);
  await click(petro, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  const beforeReveal = frames.join('\n');
  for (const key of ['"target"', '"fullRadius"', '"zeroRadius"']) {
    expect(beforeReveal.includes(key), `the pin answer leaked to the phone before the reveal: ${key}`).toBe(false);
  }
  await expect.poll(() => host.locator('.host-pin .pin-mark').count()).toBe(2);
  await host.locator('.host-pin .pin-target').waitFor();
  await shot(host, 'p10c-host-pins');
  await click(host, 'Показати відповідь');
  await stage.locator('.pin-mark.is-best[aria-label="Оля"]').waitFor();
  await stage.locator('.pin-mark[aria-label="Петро"]').waitFor();
  await stage.locator('.pin-target').waitFor();
  await stage.locator('.pin-circle-full').waitFor({ state: 'attached' });
  await stage.locator('.pin-circle-zero').waitFor({ state: 'attached' });
  await stage.getByText(/Найближче: Оля/).waitFor();
  await shot(stage, 'p10c-stage-pins');
  // Сцена 1280 × 720 вміщає все разом із «Найближче», а мапа бере решту висоти.
  const pageHeight = (await stage.evaluate('document.documentElement.scrollHeight')) as number;
  const best = (await stage.locator('.pin-best').boundingBox())!;
  const board = (await stage.locator('.stage-pin .pin-board').boundingBox())!;
  expect(pageHeight, 'the stage pin reveal scrolls').toBeLessThanOrEqual(720);
  expect(best.y + best.height).toBeLessThanOrEqual(720);
  expect(board.height, 'the stage map is too small').toBeGreaterThanOrEqual(400);
  // Рядок пульта показує бали за запитання: коло повних балів, без бонусу за швидкість.
  expect(await scoreOf(host, 'Оля')).toBe(1000);
  expect(await scoreOf(host, 'Петро')).toBe(0);
  await olya.locator('.pin-mark').first().waitFor();
  await olya.locator('.pin-target').waitFor();
  await olya.locator('.pin-circle-full').waitFor({ state: 'attached' });
  await olya.locator('.pin-circle-zero').waitFor({ state: 'attached' });
  await shot(olya, 'p10c-phone-pin-reveal');

  // 5. «Хто я?» на усній клітинці.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await afterSplash(host, olya, petro, stage);
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await olya.getByRole('button', { name: 'Міста, 300', ...exact }).click();
  await afterSplash(host, olya, petro, stage);
  const panel = host.locator('.host-clues');
  await panel.waitFor();
  expect(await panel.locator('.clue-state', { hasText: 'відкрито' }).count()).toBe(1);
  await click(host, 'Відкрити підказку 2');
  await expect.poll(async () => (await clueTexts(stage)).length).toBe(2);
  await expect.poll(async () => (await clueTexts(petro)).length).toBe(2);
  await host.getByText(/Відкрито 2 з 3: правильна відповідь зараз — 67\s*%\s*ціни/).waitFor();
  await shot(host, 'p10c-host-clues');
  await stage.waitForTimeout(10_000);
  expect((await clueTexts(stage)).length, 'a voice cell opens no clue by itself').toBe(2);
  expect(await panel.locator('.clue-state', { hasText: 'відкрито' }).count()).toBe(2);
  await click(host, 'Зарахувати');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await click(host, 'Показати відповідь');
  // 300 × 2 / 3: відкрито дві підказки з трьох.
  expect(await scoreOf(host, 'Оля')).toBe(200);

  expect(problems).toEqual([]);
}

/** Торкається плиток стіни за текстами й (якщо не просили інакше) натискає «Перевірити». */
async function pickWall(page: Page, texts: string[], submit = true): Promise<void> {
  for (const text of texts) await page.locator(`.wall-tile[aria-label="${text}"]`).click();
  if (submit) await click(page, 'Перевірити');
}

it('part 10d: wall, poll and word cloud — the editor builds a wall (375 px too), wall groups never leak to phones or the stage, the phone finds groups and locks at the limit, the stage reveals groups with names, poll bars and a word cloud on the reveal, the host hides a word', async () => {
  try {
    await wallPollCloudGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function wallPollCloudGame() {
  const host = await open('host10d', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10d@example.com');

  const common = { imageUrl: null, video: null };
  const tile = (prefix: string, texts: string[]) => texts.map((text, i) => ({ id: `${prefix}-${i + 1}`, text }));
  const w1 = {
    ...common,
    id: 'w1',
    type: 'wall' as const,
    text: 'Знайдіть зв’язки',
    points: 1000,
    timeLimit: 90,
    mistakes: 2,
    groups: [
      { id: 'g-river', name: 'Річки', tiles: tile('river', ['Дніпро', 'Десна', 'Рось', 'Псел']) },
      { id: 'g-peak', name: 'Гори', tiles: tile('peak', ['Говерла', 'Петрос', 'Піп Іван', 'Бребенескул']) },
      { id: 'g-lake', name: 'Озера', tiles: tile('lake', ['Світязь', 'Синевир', 'Ялпуг', 'Кагул']) },
      { id: 'g-isle', name: 'Ост', tiles: tile('isle', ['Хортиця', 'Джарилгач', 'Зміїний', 'Бірючий']) },
    ],
  };
  const season = (id: string, text: string) => ({ id, text });
  const p1 = {
    ...common,
    id: 'p1',
    type: 'poll' as const,
    text: 'Найкраща пора року?',
    points: 0,
    timeLimit: 20,
    options: [season('p1-spring', 'Весна'), season('p1-summer', 'Літо'), season('p1-autumn', 'Осінь'), season('p1-winter', 'Зима')],
  };
  const k1 = { ...common, id: 'k1', type: 'wordcloud' as const, text: 'Одним словом: з чим асоціюється Київ?', points: 0, timeLimit: 30, words: 3 };
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [w1, p1, k1] as never, { title: 'Стіна й голоси', speedBonus: false, rules: DEFAULT_RULES, shuffleOptions: false })]),
    title: 'Стіна й голоси 10d',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Стіна й голоси 10d' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();

  await host.getByRole('button', { name: /^Запитання 1 / }).click();
  expect(await host.locator('.wall-group-edit').count()).toBe(4);
  expect(await field(host, 'Помилок до замикання').inputValue()).toBe('2');
  await host.getByText('Кожна група — 250 балів. Остання складається сама, тож за всю стіну — 750.', exact).waitFor();
  await field(host, 'Назва групи 4').fill('Острови');
  await shot(host, 'p10d-editor-wall');

  const second = host.getByRole('group', { name: 'Група 2', ...exact });
  await second.getByLabel('Плитка 1', exact).fill('Дніпро');
  await click(host, 'Зберегти');
  await host.locator('ul.problems').getByText('плитка «дніпро» повторюється', { exact: false }).waitFor();
  await second.getByLabel('Плитка 1', exact).fill('Говерла');

  await host.setViewportSize({ width: 375, height: 812 });
  await host.locator('.wall-group-edit').last().scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10d-editor-wall-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  await host.getByRole('button', { name: /^Запитання 2 / }).click();
  await host.getByText('Правильної відповіді немає', { exact: false }).waitFor();
  expect(await field(host, 'Бали').count(), 'a poll has no points field').toBe(0);
  await host.getByText('Без балів', { exact: false }).first().waitFor();
  await shot(host, 'p10d-editor-poll');

  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as {
    rounds: { questions?: { id: string; points: number; groups?: { name: string }[] }[] }[];
  };
  const [storedWall, storedPoll] = [stored.rounds[0]!.questions![0]!, stored.rounds[0]!.questions![1]!];
  expect(storedWall.groups![3]!.name).toBe('Острови');
  expect(storedWall.groups![1]!.name).toBe('Гори');
  expect(storedPoll.points).toBe(0);

  // 2. Гра.
  await host.locator('.quiz-list li', { hasText: 'Стіна й голоси 10d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10d', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya10d', 375, 812);
  const petro = await open('petro10d', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olya, petro, stage);
  await click(host, 'Почати раунд');
  await afterSplash(host, olya, petro, stage);

  // 3. Стіна.
  await stage.locator('.wall-tile').first().waitFor();
  expect(await stage.locator('.wall-tile').count()).toBe(16);
  expect(await stage.locator('[class*="wall-color-"]').count()).toBe(0);
  await stage.getByText('Шукайте групи на телефоні', exact).waitFor();
  await expectStageFits(stage, 'stage wall');
  await shot(stage, 'p10d-stage-wall-question');

  await olya.locator('.wall-tile').first().waitFor();
  expect(await olya.getByRole('button', { name: 'Перевірити', ...exact }).isDisabled()).toBe(true);
  await pickWall(olya, ['Дніпро', 'Десна', 'Рось', 'Псел']);
  await expect.poll(async () => (await olya.locator('.wall-tile.wall-color-0').allTextContents()).sort()).toEqual(['Десна', 'Дніпро', 'Псел', 'Рось']);
  expect(await olya.locator('.wall-grid .wall-tile').first().getAttribute('class')).toContain('wall-color-0');
  await olya.getByRole('img', { name: 'Помилок: 0 з 2', ...exact }).waitFor();

  await pickWall(olya, ['Говерла', 'Петрос', 'Світязь', 'Хортиця']);
  await olya.getByRole('img', { name: 'Помилок: 1 з 2', ...exact }).waitFor();
  expect(await olya.locator('.wall-tile.is-selected').count()).toBe(0);

  await pickWall(olya, ['Світязь', 'Синевир'], false);
  await olya.getByText('Вибрано 2 з 4', exact).waitFor();
  await shot(olya, 'p10d-phone-wall');
  await expectNoSideScroll(olya, 'p10d-phone-wall');
  await pickWall(olya, ['Ялпуг', 'Кагул']);
  await expect.poll(() => olya.locator('.wall-tile.wall-color-1').count()).toBe(4);

  await pickWall(petro, ['Дніпро', 'Говерла', 'Світязь', 'Хортиця']);
  await petro.getByRole('img', { name: 'Помилок: 1 з 2', ...exact }).waitFor();
  await pickWall(petro, ['Десна', 'Петрос', 'Синевир', 'Джарилгач']);
  await petro.getByText('Стіну замкнено', { exact: false }).waitFor();

  await pickWall(olya, ['Говерла', 'Петрос', 'Піп Іван', 'Бребенескул']);
  // Обидва закінчили: запитання закривається одразу, тож «Стіну складено!» може не встигнути з'явитися.
  await host.getByText('Запитання закрите').waitFor();
  await expect.poll(() => olya.locator('.wall-tile.wall-color-3').count()).toBe(4);

  // Витік: до розкриття жодних груп, назв чи id плиток.
  await click(host, 'Показати відповідь');
  await stage.locator('.wall-reveal').waitFor();
  for (const [who, frames] of [['olya', olyaFrames], ['petro', petroFrames], ['stage', stageFrames]] as const) {
    const early = framesBeforeReveal(frames);
    expect(early.length, `${who}: no frames before the reveal`).toBeGreaterThan(0);
    const text = early.join('\n');
    // Власна відповідь телефона містить лише число груп (`"groups":4`), а не самі групи.
    for (const secret of ['Річки', 'Гори', 'Озера', 'Острови', '"groups":[', 'river-1', 'peak-1', 'lake-1', 'isle-1', 'g-river']) {
      const at = text.indexOf(secret);
      expect(at < 0, `${who} got «${secret}» before the reveal: ${text.slice(Math.max(0, at - 150), at + 150)}`).toBe(true);
    }
  }

  const groups = stage.locator('.wall-reveal .wall-group');
  expect(await groups.count()).toBe(4);
  expect(await groups.allTextContents()).toEqual(
    expect.arrayContaining([expect.stringContaining('Річки'), expect.stringContaining('Гори'), expect.stringContaining('Озера'), expect.stringContaining('Острови')]),
  );
  const olyaRow = stage.locator('.wall-table tbody tr', { hasText: 'Оля' });
  const petroRow = stage.locator('.wall-table tbody tr', { hasText: 'Петро' });
  expect(await olyaRow.textContent()).toMatch(/4 \/ 4.*склав/);
  expect(await petroRow.textContent()).toMatch(/0 \/ 4.*замкнено/);
  await expectStageFits(stage, 'stage wall reveal');
  await shot(stage, 'p10d-stage-wall');
  expect(await scoreOf(host, 'Оля')).toBe(750);
  expect(await scoreOf(host, 'Петро')).toBe(0);
  await olya.getByText('Груп: 4 з 4 · 750', { exact: false }).waitFor();
  expect(await olya.locator('.wall-reveal .wall-group').count()).toBe(4);
  await shot(olya, 'p10d-phone-wall-reveal');
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 4. Опитування.
  await stage.getByText('Проголосували 0 з 2', exact).waitFor();
  for (const name of ['Весна', 'Літо', 'Осінь', 'Зима']) await stage.getByText(name, exact).waitFor();
  expect(await stage.locator('.poll-bars').count()).toBe(0);
  await olya.getByRole('button', { name: /Літо/ }).click();
  await petro.getByRole('button', { name: /Літо/ }).click();
  await olya.getByText('Голос прийнято', exact).waitFor();
  const sent = await olya.locator('.sent').innerText();
  expect(sent).not.toMatch(/бал|правильно/i);
  const pollBar = (page: Page | ReturnType<Page['locator']>, name: string) => page.locator('.poll-bar', { hasText: name });
  await host.getByText('Запитання закрите').waitFor();
  await expect.poll(async () => await pollBar(host.locator('.host-poll'), 'Літо').textContent()).toContain('100 % · 2');
  await click(host, 'Показати результати');
  await stage.locator('.poll-bars').waitFor();
  expect(await pollBar(stage, 'Літо').textContent()).toContain('100 % · 2');
  expect(await pollBar(stage, 'Весна').textContent()).toContain('0 % · 0');
  expect(await stage.getByText('Правильна відповідь', { exact: false }).count()).toBe(0);
  await expectStageFits(stage, 'stage poll');
  await shot(stage, 'p10d-stage-poll');
  expect(await totalOf(host, 'Оля')).toBe(750);
  expect(await totalOf(host, 'Петро')).toBe(0);
  await olya.getByText('Результати — на екрані.', exact).waitFor();
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 5. Хмара слів.
  await stage.getByText('Пишіть до 3 слів на телефоні', exact).waitFor();
  expect(await stage.locator('.word-cloud').count()).toBe(0);
  await field(olya, 'Слово 1').fill('Каштани');
  await click(olya, '＋ Ще слово');
  await field(olya, 'Слово 2').fill('Лайкаслово');
  await click(olya, 'Відповісти');
  await field(petro, 'Слово 1').fill(' каштани ');
  await click(petro, '＋ Ще слово');
  await field(petro, 'Слово 2').fill('Дніпро');
  await click(petro, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();

  const hostWord = (name: string) => host.locator('.host-cloud').getByRole('button', { name, ...exact });
  await hostWord('Лайкаслово').waitFor();
  await hostWord('Дніпро').waitFor();
  expect(await host.locator('.host-cloud li', { hasText: /каштани/i }).locator('.host-cloud-count').textContent()).toBe('2');
  await hostWord('Лайкаслово').click();
  await expect.poll(() => hostWord('Лайкаслово').getAttribute('aria-pressed')).toBe('true');
  const box = (await hostWord('Лайкаслово').boundingBox())!;
  expect(box.height, 'cloud word button is a tap target').toBeGreaterThanOrEqual(44);
  await shot(host, 'p10d-host-cloud-hide');

  await click(host, 'Показати результати');
  await stage.locator('.word-cloud').waitFor();
  const sizeOf = async (word: RegExp) =>
    parseFloat(await stage.locator('.word-cloud .word', { hasText: word }).evaluate((el) => (globalThis as unknown as { getComputedStyle: (e: unknown) => { fontSize: string } }).getComputedStyle(el).fontSize));
  expect(await sizeOf(/каштани/i)).toBeGreaterThan(await sizeOf(/Дніпро/));
  expect(await stage.locator('.word-cloud').innerText()).not.toContain('Лайкаслово');
  await expectStageFits(stage, 'stage cloud');
  await shot(stage, 'p10d-stage-cloud');
  for (const [who, frames] of [['stage', stageFrames], ['petro', petroFrames]] as const) {
    expect(frames.join('\n').includes('Лайкаслово'), `${who} got the hidden word`).toBe(false);
  }

  // Повернути слово й сховати знову.
  await hostWord('Лайкаслово').click();
  await expect.poll(() => stage.locator('.word-cloud .word', { hasText: 'Лайкаслово' }).count()).toBe(1);
  await hostWord('Лайкаслово').click();
  await expect.poll(() => stage.locator('.word-cloud .word', { hasText: 'Лайкаслово' }).count()).toBe(0);
  expect(await totalOf(host, 'Оля')).toBe(750);
  expect(await totalOf(host, 'Петро')).toBe(0);

  // 6. Історія.
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Стіна й голоси 10d/ }).click();
  const items = host.locator('.rows.stacked > li');
  await items.first().waitFor();
  expect(await items.count()).toBe(3);
  expect(await items.nth(0).locator('.wall-reveal .wall-group').count()).toBe(4);
  expect(await items.nth(0).textContent()).toContain('Острови');
  await items.nth(0).getByText('Відповіді (2)').click();
  await items.nth(0).locator('.responses li', { hasText: 'Оля' }).getByText('Стіну складено, помилок: 1', { exact: false }).waitFor();
  await items.nth(0).locator('.responses li', { hasText: 'Петро' }).getByText('0 з 4 груп, помилок: 2', { exact: false }).waitFor();
  await items.nth(1).getByText('Проголосували: 2', exact).waitFor();
  expect(await pollBar(items.nth(1), 'Літо').textContent()).toContain('100 % · 2');
  await items.nth(2).getByText('Проголосували: 2', exact).waitFor();
  const cloudWords = await items.nth(2).locator('.history-cloud li').allTextContents();
  expect(cloudWords.some((w) => /^каштани · 2$/i.test(w))).toBe(true);
  expect(cloudWords).toContain('Дніпро · 1');
  expect(cloudWords).toContain('приховано · 1');
  expect(cloudWords.join('\n')).not.toContain('Лайкаслово');
  await shot(host, 'p10d-history');

  expect(problems).toEqual([]);
}

/** Тексти відкритих рядків табло на сторінці (зверху вниз). */
const openRows = async (page: Page) => page.locator('.survey-row:not(.is-closed) .survey-text').allTextContents();

/** Кадри сокета від `from` до першого кадру з phase "reveal" після нього (для перевірки витоку). */
const framesUntilReveal = (frames: string[], from: number) => {
  const tail = frames.slice(from);
  const at = tail.findIndex((f) => f.includes('"phase":"reveal"'));
  return at < 0 ? tail : tail.slice(0, at);
};

/** Відкритий рядок табло з текстом. */
const surveyRow = (scope: Page | ReturnType<Page['locator']>, text: string) => scope.locator('.survey-row:not(.is-closed)', { hasText: text });

it('part 10e: «100 до 1» — the editor builds a host board and a cloud board (375 px too), rows never leak before the reveal, the stage opens rows bottom-up with names, popularity scoring with the cap, a cloud board without hidden words, a skipped survey warns the host', async () => {
  try {
    await surveyGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function surveyGame() {
  const host = await open('host10e', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10e@example.com');

  const common = { imageUrl: null, video: null };
  const fruit = (id: string, text: string, popularity: number, accepted: string[] = []) => ({ id, text, popularity, accepted });
  const k1 = { ...common, id: 'k1', type: 'wordcloud' as const, text: 'Назвіть фрукт', points: 0, timeLimit: 30, words: 3 };
  const s1 = {
    ...common,
    id: 's1',
    type: 'survey' as const,
    text: 'Назвіть фрукт, який люблять діти',
    points: 1000,
    timeLimit: 45,
    answers: 3,
    rows: [
      fruit('row-apple', 'Яблуко', 32, ['яблучко']),
      fruit('row-banana', 'Банан', 25),
      fruit('row-straw', 'Полуниця', 15),
      fruit('row-melon', 'Кавун', 10),
      fruit('row-pear', 'Груша', 8),
    ],
  };
  const s2 = { ...common, id: 's2', type: 'survey' as const, text: 'Фрукти залу: назвіть два', points: 1000, timeLimit: 45, answers: 2, cloudId: 'k1', rows: [] };
  const k2 = { ...common, id: 'k2', type: 'wordcloud' as const, text: 'Назвіть овоч', points: 0, timeLimit: 20, words: 1 };
  const s3 = { ...common, id: 's3', type: 'survey' as const, text: 'Овочі залу', points: 1000, timeLimit: 45, answers: 2, cloudId: 'k2', rows: [] };
  const q1 = {
    ...common,
    id: 'q1',
    type: 'single' as const,
    text: 'Кінець?',
    points: 100,
    timeLimit: 20,
    options: [
      { id: 'q1-yes', text: 'Так' },
      { id: 'q1-no', text: 'Ні' },
    ],
    correctId: 'q1-yes',
  };
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [k1, s1, s2, k2, s3, q1] as never, { title: 'Сто до одного', speedBonus: false, rules: DEFAULT_RULES, shuffleOptions: false })], { leaderboard: 'end' }),
    title: 'Сто до одного 10e',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Сто до одного 10e' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();

  await host.getByRole('button', { name: /^Запитання 2 / }).click();
  expect(await host.locator('.survey-row-edit').count()).toBe(5);
  await host.getByText('Разом: 90 зі 100', exact).waitFor();
  expect(await field(host, 'Відповідей від гравця').inputValue()).toBe('3');
  await field(host, 'Людей зі 100').first().fill('50');
  await host.getByText('Разом: 108 зі 100', { exact: false }).waitFor();
  await host.getByText('Понад 100', { exact: false }).waitFor();
  await field(host, 'Людей зі 100').first().fill('32');
  await host.getByText('Разом: 90 зі 100', exact).waitFor();
  await shot(host, 'p10e-editor-survey');

  await host.setViewportSize({ width: 375, height: 812 });
  await host.locator('.survey-row-edit').first().scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10e-editor-survey-375');
  await host.locator('.survey-row-edit').last().scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10e-editor-survey-375-end');
  await host.setViewportSize({ width: 1280, height: 900 });

  await host.getByRole('button', { name: /^Запитання 3 / }).click();
  expect(await host.getByRole('button', { name: 'Відповіді з хмари', ...exact }).getAttribute('aria-pressed')).toBe('true');
  expect(await host.getByLabel('Хмара слів для дошки').inputValue()).toBe('k1');
  expect(await host.locator('select option:checked').filter({ hasText: 'Хмара №1: «Назвіть фрукт»' }).count()).toBeGreaterThan(0);
  await host.getByText('Якщо хмара не дасть жодного слова, запитання пропуститься.', exact).waitFor();
  await shot(host, 'p10e-editor-survey-cloud');

  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as {
    rounds: { questions?: { id: string; cloudId?: string; rows?: unknown[] }[] }[];
  };
  const storedS2 = stored.rounds[0]!.questions!.find((q) => q.id === 's2')!;
  expect(storedS2.cloudId).toBe('k1');
  expect(storedS2.rows).toEqual([]);

  // 2. Гра.
  await host.locator('.quiz-list li', { hasText: 'Сто до одного 10e' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10e', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya10e', 375, 812);
  const petro = await open('petro10e', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olya, petro, stage);
  await click(host, 'Почати раунд');
  await afterSplash(host, olya, petro, stage);

  // 3. Хмара k1.
  await stage.getByText('Пишіть до 3 слів на телефоні', exact).waitFor();
  const cloudWords = async (page: Page, words: string[]) => {
    await field(page, 'Слово 1').fill(words[0]!);
    for (const [i, word] of words.slice(1).entries()) {
      await click(page, '＋ Ще слово');
      await field(page, `Слово ${i + 2}`).fill(word);
    }
    await click(page, 'Відповісти');
  };
  await cloudWords(olya, ['Яблуко', 'Банан', 'Вишня']);
  await cloudWords(petro, ['яблуко', 'Слива']);
  await host.getByText('Запитання закрите').waitFor();
  const hostWord = (name: string) => host.locator('.host-cloud').getByRole('button', { name, ...exact });
  await hostWord('Слива').click();
  await expect.poll(() => hostWord('Слива').getAttribute('aria-pressed')).toBe('true');
  await click(host, 'Показати результати');
  await stage.locator('.word-cloud').waitFor();
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 4. Дошка ведучого s1.
  const from = { stage: stageFrames.length, olya: olyaFrames.length, petro: petroFrames.length };
  await stage.locator('.survey-row.is-closed').first().waitFor();
  expect(await stage.locator('.survey-row.is-closed').count()).toBe(5);
  expect(await stage.locator('.survey-row:not(.is-closed)').count()).toBe(0);
  await stage.getByText('Пишіть до 3 відповідей на телефоні', exact).waitFor();
  await shot(stage, 'p10e-stage-survey-question');

  await field(olya, 'Відповідь 3').waitFor();
  await fillSurvey(olya, ['яблучко', 'Банан']);
  await expectNoSideScroll(olya, 'p10e-phone-survey');
  const inputBox = (await field(olya, 'Відповідь 1').boundingBox())!;
  expect(inputBox.height, 'survey field is a tap target').toBeGreaterThanOrEqual(44);
  await answerSurvey(olya, ['яблучко', 'Банан', 'ананас']);
  await olya.getByText('Відповіді надіслано', exact).waitFor();

  await field(petro, 'Відповідь 2').waitFor();
  await fillSurvey(petro, ['Яблуко', ' яблуко ']);
  await petro.getByText('Ця відповідь уже є', exact).first().waitFor();
  await answerSurvey(petro, ['Яблуко', ' яблуко ', 'Кавун']);
  await petro.getByText('Відповіді надіслано', exact).waitFor();
  await host.getByText('Запитання закрите').waitFor();

  const hostBoard = host.locator('.host-survey');
  await hostBoard.waitFor();
  expect(await hostBoard.locator('.survey-row').count()).toBe(5);
  const apple = await surveyRow(hostBoard, 'Яблуко').textContent();
  expect(apple).toContain('Оля');
  expect(apple).toContain('Петро');
  const melon = await surveyRow(hostBoard, 'Кавун').textContent();
  expect(melon).toContain('Петро');
  expect(melon).not.toContain('Оля');
  expect(await host.getByRole('button', { name: /^(Правильно|Частково|Не зараховувати)/ }).count(), 'no grading buttons').toBe(0);
  await hostBoard.scrollIntoViewIfNeeded();
  await shot(host, 'p10e-host-survey');

  // До розкриття на телефони й сцену не потрапляє жоден рядок дошки.
  await click(host, 'Показати відповідь');
  await stage.locator('.survey-row.is-closed').first().waitFor();
  for (const [who, frames, start] of [['olya', olyaFrames, from.olya], ['petro', petroFrames, from.petro], ['stage', stageFrames, from.stage]] as const) {
    const early = framesUntilReveal(frames, start);
    expect(early.length, `${who}: no frames before the reveal`).toBeGreaterThan(0);
    const text = early.join('\n');
    for (const secret of ['Полуниця', 'Груша', 'row-straw', 'row-pear', '"popularity":3']) {
      const at = text.indexOf(secret);
      expect(at < 0, `${who} got «${secret}» before the reveal: ${text.slice(Math.max(0, at - 150), at + 150)}`).toBe(true);
    }
  }

  // Розкриття знизу вгору: рядок за рядком.
  const nextRow = host.getByRole('button', { name: /^Відкрити рядок / });
  await host.getByRole('button', { name: 'Відкрити рядок 1 з 5', ...exact }).waitFor();
  expect((await nextRow.boundingBox())!.height, 'next row button is a tap target').toBeGreaterThanOrEqual(44);
  await nextRow.click();
  await expect.poll(() => openRows(stage)).toHaveLength(1);
  await host.getByRole('button', { name: 'Відкрити рядок 2 з 5', ...exact }).click();
  await expect.poll(async () => (await openRows(stage)).map((text) => (text.startsWith('Кавун') ? 'Кавун' : text.startsWith('Груша') ? 'Груша' : text))).toEqual(['Кавун', 'Груша']);
  expect(await surveyRow(stage, 'Груша').textContent()).toContain('Ніхто не назвав');
  const stageMelon = await surveyRow(stage, 'Кавун').textContent();
  expect(stageMelon).toContain('Петро');
  expect(stageMelon).not.toContain('Оля');
  expect(await bodyText(stage)).not.toContain('Яблуко');
  expect(await stage.locator('.survey-row.is-closed').count()).toBe(3);
  // Телефон до повного розкриття: власні рядки без результату.
  await olya.getByText('ананас', { exact: false }).first().waitFor();
  expect(await bodyText(olya)).not.toContain('місце');
  await expect.poll(() => stage.locator('.survey-row.is-flipping').count()).toBe(0);
  await shot(stage, 'p10e-stage-survey-half');

  await click(host, 'Відкрити всі');
  await expect.poll(() => openRows(stage)).toHaveLength(5);
  const apples = await surveyRow(stage, 'Яблуко').textContent();
  expect(apples).toContain('Оля');
  expect(apples).toContain('Петро');
  expect((await openRows(stage))[0]).toContain('Яблуко');
  await expect.poll(() => stage.locator('.survey-row.is-flipping').count()).toBe(0);
  await expectStageFits(stage, 'p10e-stage-survey-full');
  await shot(stage, 'p10e-stage-survey-full');

  await olya.getByText('яблучко — місце 1, 32', exact).waitFor();
  await olya.getByText('Банан — місце 2, 25', exact).waitFor();
  await olya.getByText('ананас — немає на табло', exact).waitFor();
  expect(await bodyText(olya)).toContain('570');
  await expectNoSideScroll(olya, 'p10e-phone-survey-result');
  expect(await scoreOf(host, 'Оля')).toBe(570);
  expect(await scoreOf(host, 'Петро')).toBe(420);
  expect(await totalOf(host, 'Оля')).toBe(570);
  expect(await totalOf(host, 'Петро')).toBe(420);
  expect(await host.getByRole('button', { name: /^Відкрити/ }).count(), 'no row buttons once everything is open').toBe(0);
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 5. Дошка з хмари s2.
  await stage.locator('.survey-row.is-closed').first().waitFor();
  expect(await stage.locator('.survey-row.is-closed').count()).toBe(3);
  await stage.getByText('Дошка з ваших відповідей у хмарі слів', exact).waitFor();
  const cloudBoard = host.locator('.host-survey');
  await cloudBoard.waitFor();
  expect(await cloudBoard.locator('.survey-row').count()).toBe(3);
  expect(await surveyRow(cloudBoard, 'Яблуко').locator('.survey-pop').textContent()).toContain('100');
  expect(await surveyRow(cloudBoard, 'Банан').locator('.survey-pop').textContent()).toContain('50');
  expect(await surveyRow(cloudBoard, 'Вишня').locator('.survey-pop').textContent()).toContain('50');
  expect(await cloudBoard.innerText()).not.toContain('Слива');
  await answerSurvey(olya, ['яблуко', 'банан']);
  await answerSurvey(petro, ['Слива', 'Вишня']);
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Відкрити всі');
  await expect.poll(() => openRows(stage)).toHaveLength(3);
  await expect.poll(() => stage.locator('.survey-row.is-flipping').count()).toBe(0);
  expect(await stage.locator('.stage-survey').innerText()).not.toContain('Слива');
  await expectStageFits(stage, 'p10e-stage-survey-cloud');
  await shot(stage, 'p10e-stage-survey-cloud');
  expect(await scoreOf(host, 'Оля')).toBe(1000);
  expect(await scoreOf(host, 'Петро')).toBe(500);
  expect(await totalOf(host, 'Оля')).toBe(1570);
  expect(await totalOf(host, 'Петро')).toBe(920);
  for (const [who, frames] of [['stage', stageFrames], ['olya', olyaFrames], ['petro', petroFrames]] as const) {
    expect(frames.join('\n').includes('"text":"Слива"'), `${who} got the hidden word as a board row`).toBe(false);
  }
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);

  // 6. Пропуск s3: хмара k2 порожня.
  await stage.getByText('Пишіть до 1 слів на телефоні', { exact: false }).waitFor();
  await click(host, 'Закрити запитання');
  await click(host, 'Показати результати');
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, stage);
  await stage.getByText('Кінець?', exact).waitFor();
  expect(await bodyText(stage)).not.toContain('Овочі залу');
  const warning = host.locator('.host-warning');
  await warning.getByText('Запитання «Овочі залу» пропущено: хмара не дала слів', { exact: false }).waitFor();
  expect(await host.locator('main').innerText()).toMatch(/Запитання \d+ з 5\b/);
  await shot(host, 'p10e-host-skip');
  await olya.getByRole('button', { name: /Так/ }).click();
  await petro.getByRole('button', { name: /Ні/ }).click();
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');

  // 7. Історія.
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Сто до одного 10e/ }).click();
  const items = host.locator('.rows.stacked > li');
  await items.first().waitFor();
  expect(await host.locator('main').innerText()).not.toContain('Овочі залу');
  const first = items.filter({ hasText: 'Назвіть фрукт, який люблять діти' });
  const history1 = await first.locator('.history-survey').innerText();
  expect(history1).toContain('Яблуко');
  expect(history1).toContain('Оля');
  expect(history1).toContain('Петро');
  expect(history1).not.toContain('Дошка з хмари слів');
  await first.getByText('Відповіді (2)').click();
  await first.locator('.responses li', { hasText: 'Оля' }).getByText('яблучко ✓, Банан ✓, ананас ✗', { exact: false }).waitFor();
  const second = items.filter({ hasText: 'Фрукти залу' });
  const history2 = await second.locator('.history-survey').innerText();
  expect(history2).toContain('Дошка з хмари слів');
  for (const word of ['Яблуко', 'Банан', 'Вишня']) expect(history2).toContain(word);
  expect(history2).not.toContain('Слива');
  await shot(host, 'p10e-history');

  expect(problems).toEqual([]);
}
