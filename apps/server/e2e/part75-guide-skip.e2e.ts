import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { AUTOPILOT_MS } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, register, socketFrames, pilotPlayer, frame, launchBot11h, joinBy11h, join, expectNoSideScroll, stateViews, type Pilot } from './helpers/common';
import { exact, base, problems, snapshot, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 75: гравці автопілота голосують «Пропустити пояснення».
 * Більшість людей на зв'язку пропускає «Як грати»; відключення теж може дати більшість; гра з ведучим без змін.
 * Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

const TITLE = 'Пропуск 75';

const choice = (id: string, text: string, options: string[]) => ({
  id,
  type: 'single' as const,
  text,
  imageUrl: null,
  video: null,
  points: 100,
  timeLimit: 30,
  options: options.map((option, i) => ({ id: `${id}-${i}`, text: option })),
  correctId: `${id}-0`,
});

const skipButton = (page: Page) => page.getByRole('button', { name: 'Пропустити пояснення', ...exact });
const cancelButton = (page: Page) => page.getByRole('button', { name: 'Скасувати', ...exact });
const countLine = (page: Page) => page.locator('.guide-skip-count');
const countIs = (page: Page, text: string) => page.locator('.guide-skip-count', { hasText: text }).waitFor();
/** Банер помилки на телефоні. */
const errorBanners = (page: Page) => page.locator('.error[role="alert"]').count();

/** Перший кадр «Як грати» сокета: мить і кількість сторінок. */
async function guideStart(player: Pilot) {
  const found = await frame(player, (v) => v.phase === 'guide' && v.guide !== null);
  return { at: found.at, pages: found.view.guide!.pages.length, index: found.index };
}

async function guideSkip75(sockets: Socket[]) {
  const marta = await open('marta75', 375, 812);
  await register(marta, 'host', 'Марта 75', 'marta75@example.com');
  const rounds = [
    classicRound(
      'r1',
      [
        choice('q1', 'Яка річка тече через Київ?', ['Дніпро', 'Дунай', 'Тиса']),
        choice('q2', 'Яке місто називають містом Лева?', ['Львів', 'Луцьк', 'Рівне']),
      ] as never,
      { title: 'Розминка', speedBonus: false, shuffleOptions: false },
    ),
  ];
  const saved = await marta.request.post(`${base}/api/quizzes`, {
    data: { ...makeRoundsQuiz(rounds as never, { newcomers: true, leaderboard: 'end', buffs: ['fifty', 'double'] }), title: TITLE },
  });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Кімната-автопілот: Марта (авторка), Віра на 360 × 800, Петро — сокет; сцена 1280 × 720. Троє людей → треба 2 голоси.
  const code = await launchBot11h(marta, TITLE, 'Марта');
  const vira = await open('vira75', 360, 800);
  const viraFrames = socketFrames(vira);
  await joinBy11h(vira, code, 'Віра 75');
  const petro = await pilotPlayer(sockets, code, 'Петро 75');
  const stageHref = (await marta.locator('.author-stage a', { hasText: 'Відкрити' }).getAttribute('href'))!;
  const stage = await open('stage75', 1280, 720);
  await stage.goto(stageHref.startsWith('http') ? stageHref : `${base}${stageHref}`);
  await stage.getByText('Петро 75').waitFor();
  const phones = [marta, vira];

  // 2. «Почати гру» → «Як грати» з кнопкою й рядком «0 з 3» на обох телефонах; на сцені рядка немає.
  await click(marta, 'Почати гру');
  const start = await guideStart(petro);
  expect(start.pages, 'enough guide pages for the vote').toBeGreaterThanOrEqual(3);
  for (const page of phones) {
    await page.locator('.guide').waitFor();
    await skipButton(page).waitFor();
    await countIs(page, 'Хочуть пропустити: 0 з 3');
  }
  await stage.locator('.guide').waitFor();
  expect(await countLine(stage).count(), 'no stage line with no votes').toBe(0);

  // 3. Віра голосує → «Скасувати» (aria-pressed), «1 з 3» скрізь; скасовує → «0 з 3», на сцені рядка немає; голосує знову.
  await skipButton(vira).click();
  await cancelButton(vira).waitFor();
  expect(await cancelButton(vira).getAttribute('aria-pressed')).toBe('true');
  for (const page of [...phones, stage]) await countIs(page, 'Хочуть пропустити: 1 з 3');
  expect(await skipButton(marta).getAttribute('aria-pressed')).toBe('false');
  await expectNoSideScroll(vira, '75-guide-vote-360');
  await shot(stage, '75-guide-vote-stage');
  await cancelButton(vira).click();
  await skipButton(vira).waitFor();
  for (const page of phones) await countIs(page, 'Хочуть пропустити: 0 з 3');
  await expect.poll(() => countLine(stage).count(), { timeout: 5000 }).toBe(0);
  await skipButton(vira).click();
  await cancelButton(vira).waitFor();
  for (const page of phones) await countIs(page, 'Хочуть пропустити: 1 з 3');

  // 4. Петро відключається → людей 2, голос 1 — більшість без нового голосу: гра в першому раунді.
  const left = Date.now();
  const naturalEnd = start.at + start.pages * AUTOPILOT_MS.guide;
  petro.close();
  await expect.poll(() => stateViews(viraFrames).some((v) => v.phase === 'intro'), { timeout: 10_000 }).toBe(true);
  const skippedAfter = Date.now() - left;
  expect(skippedAfter, 'the disconnect completes the majority at once').toBeLessThan(4000);
  expect(Date.now(), 'skipped before the guide ran out').toBeLessThan(naturalEnd);
  for (const page of phones) {
    await page.locator('.guide').waitFor({ state: 'detached', timeout: 10_000 });
    expect(await skipButton(page).count(), 'no skip button after the guide').toBe(0);
    await page.getByText('Розминка').first().waitFor();
  }
  await shot(vira, '75-guide-skipped-360');
  await stage.close();

  // 5. Друга кімната тієї ж вікторини: троє людей, Марта й Віра тиснуть одна за одною → перший раунд раніше, ніж минули б усі сторінки.
  const code2 = await launchBot11h(marta, TITLE, 'Марта');
  const viraFrames2Start = viraFrames.length;
  await joinBy11h(vira, code2, 'Віра 75');
  const petro2 = await pilotPlayer(sockets, code2, 'Петро 75');
  await click(marta, 'Почати гру');
  const start2 = await guideStart(petro2);
  for (const page of phones) await skipButton(page).waitFor();
  await skipButton(marta).click();
  for (const page of phones) await countIs(page, 'Хочуть пропустити: 1 з 3');
  await skipButton(vira).click();
  const intro2 = await frame(petro2, (v) => v.phase === 'intro', start2.index);
  expect(intro2.at - start2.at, 'skip before the guide ran out').toBeLessThan(AUTOPILOT_MS.guide * start2.pages);
  await expect.poll(() => stateViews(viraFrames.slice(viraFrames2Start)).some((v) => v.phase === 'intro'), { timeout: 5000 }).toBe(true);
  for (const page of phones) {
    await page.locator('.guide').waitFor({ state: 'detached', timeout: 10_000 });
    expect(await errorBanners(page), 'no error banner').toBe(0);
  }
  // Голос після пояснень відхилено.
  expect(await petro2.emit('player:guide-skip', { skip: true })).toEqual({ ok: false, error: 'wrong_phase' });

  // 6. Гра з живим ведучим: у гравця кнопки немає, подія → not_allowed, «До гри» ведучого працює.
  const host = await open('host75', 1280, 900);
  await register(host, 'host', 'Олена 75', 'host75@example.com');
  const hostSaved = await host.request.post(`${base}/api/quizzes`, {
    data: { ...makeRoundsQuiz(rounds as never, { newcomers: true, leaderboard: 'end' }), title: 'Ведучий 75' },
  });
  expect(hostSaved.ok(), await hostSaved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Ведучий 75' }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const hostCode = host.url().slice(-6);
  const lina = await open('lina75', 360, 800);
  await join(lina, hostCode, 'Ліна 75', false);
  const oles = await pilotPlayer(sockets, hostCode, 'Олесь 75');
  await click(host, 'Почати гру');
  await lina.locator('.guide').waitFor();
  const hostGuide = await frame(oles, (v) => v.phase === 'guide' && v.guide !== null);
  expect(hostGuide.view.guide!.skip, 'a host game has no skip key').toBeUndefined();
  expect(await skipButton(lina).count(), 'no skip button in a host game').toBe(0);
  expect(await countLine(lina).count()).toBe(0);
  expect(await oles.emit('player:guide-skip', { skip: true })).toEqual({ ok: false, error: 'not_allowed' });
  await expectNoSideScroll(lina, '75-host-guide-360');
  await click(host, 'До гри');
  await frame(oles, (v) => v.phase === 'intro', hostGuide.index);
  await lina.locator('.guide').waitFor({ state: 'detached', timeout: 10_000 });

  // 7. Без збоїв у консолі.
  expect(problems).toEqual([]);
}

it('part 75: players of an autopilot game vote «Пропустити пояснення» on the 360 phones — the count on phones and the stage, cancel, a disconnect completes the majority; three people need two votes; a host game has no vote and «До гри» works', async () => {
  const sockets: Socket[] = [];
  try {
    await guideSkip75(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);
