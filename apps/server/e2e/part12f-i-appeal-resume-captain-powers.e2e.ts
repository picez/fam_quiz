import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { blitzRound, classicRound, makeRoundsQuiz, single, text as textQ, withId } from '@quiz/engine/testing';
import { AUTOPILOT_MS, DEFAULT_RULES, type AchievementsPage } from '@quiz/shared';
import { type Locator, type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import ar from '../../web/src/locales/ar.json';
import es from '../../web/src/locales/es.json';
import { open, click, liveRow, field, questionText, join, openRoundSettings, bodyText, expectNoSideScroll, MENU, MENU_ITEMS_23A, register, POLL, socketFrames, buffButton, takeBuff, tapBuff, pickOption, numericAnswer, vote, splashOn, COVERED, HEADER_ONE_LINE, expectStageFits, expectStageInView, NL, pickTeamOn, stageTeam, teamTotal, scoreCells, breakdownTexts, sleep, pilotSocket, frame, expectGap, createAutopilot, stateViews, launchBot11h, joinBy11h, undoRows, revealLine, squash, expectFitsWidth13a, openProfileTile, htmlDir, ownDir, join22a } from './helpers/common';
import { exact, browser, base, problems, ARTIFACTS, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 12f–12i, 12r, 29k, backlog 3, 26b, 26c: апеляції, продовження гри, капітан, нові бафи, досягнення, серії бліцу, драбина слів.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

function appealQuestions12f() {
  const common = { imageUrl: null, video: null, timeLimit: 60 };
  const p1 = { ...common, id: 'p1', type: 'text' as const, text: 'Хто написав «Заповіт»?', points: 200, accepted: ['Тарас Шевченко'] };
  const p2 = {
    ...common,
    id: 'p2',
    type: 'single' as const,
    text: 'Яка гора найвища в Україні?',
    points: 100,
    options: [{ id: 'p2-a', text: 'Говерла' }, { id: 'p2-b', text: 'Петрос' }, { id: 'p2-c', text: 'Піп Іван' }],
    correctId: 'p2-a',
  };
  const p3 = { ...common, id: 'p3', type: 'boolean' as const, text: 'Дунай впадає в Чорне море', points: 100, correct: true };
  return { p1, p2, p3 };
}

/** Картка апеляції на сцені не налазить на рядок правильної відповіді й варіанти: перетини прямокутників. */
const APPEAL_STAGE_OVERLAP = `(() => {
  const card = document.querySelector('.appeal-card.is-stage');
  if (card === null) return ['no stage card'];
  const c = card.getBoundingClientRect();
  const out = [];
  for (const el of document.querySelectorAll('.lead.answer, ul.choices')) {
    const r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    if (r.bottom > c.top + 1 && r.top < c.bottom - 1 && r.right > c.left + 1 && r.left < c.right - 1) out.push(el.className + ' ' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' vs card ' + Math.round(c.top));
  }
  return out;
})()`;

/** Аркуш голосу на телефоні: прокручено донизу — результат над аркушем, аркуш у межах екрана. */
const APPEAL_SHEET_CLEAR = `(() => {
  window.scrollTo(0, document.documentElement.scrollHeight);
  const sheet = document.querySelector('.appeal-sheet');
  if (sheet === null) return ['no sheet'];
  const s = sheet.getBoundingClientRect();
  const out = [];
  if (s.left < -1 || s.right > innerWidth + 1 || s.bottom > innerHeight + 1) out.push('sheet out of the screen');
  for (const el of document.querySelectorAll('section.result')) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.bottom > s.top + 1) out.push('result under the sheet ' + Math.round(r.bottom) + ' > ' + Math.round(s.top));
  }
  return out;
})()`;

async function appeal12f() {
  const host = await open('host12f', 375, 812);
  await register(host, 'host', 'Ліна Ведуча', 'host12f@example.com');
  const hostFrames = socketFrames(host);

  const { p1, p2, p3 } = appealQuestions12f();
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [p1, p2, p3] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES })], {
      leaderboard: 'each',
    }),
    title: 'Апеляція 12f',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Апеляція 12f' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage12f', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya12f', 375, 812);
  const petro = await open('petro12f', 375, 812);
  const ira = await open('ira12f', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const iraFrames = socketFrames(ira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];
  const all = [host, stage, ...phones];

  const textOf = async (locator: Locator) => squash(await locator.first().textContent({ timeout: 500 }).catch(() => null)) || null;
  const appealButton = (page: Page) => page.locator('button.appeal-button');
  const sheet = (page: Page) => page.locator('section.appeal-sheet');
  const card = (page: Page) => page.locator('.appeal-card');
  const count = (page: Page) => card(page).locator('.appeal-count');
  const result = (page: Page) => page.locator('p.appeal-result');
  const stageTime = () => textOf(stage.locator('.appeal-card.is-stage .appeal-time'));
  const sheetCount = (page: Page) => sheet(page).locator('p.appeal-count');
  const sheetButton = (page: Page, name: 'Так' | 'Ні') => sheet(page).getByRole('button', { name, ...exact });
  const voting = host.getByRole('button', { name: 'Голосує зал', ...exact });
  const next = host.getByRole('button', { name: 'Далі', ...exact });
  /** Головна кнопка пульта активна (11b тримає її кілька секунд) — і натиснута. */
  const step = async (button: Locator) => {
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  const playerRow = (name: string) => host.locator('.player-row', { has: host.locator('.name', { hasText: new RegExp(`^${name}$`) }) });
  const rowScore = async (name: string) => (await playerRow(name).locator('.score').textContent())?.trim();
  const standing = (name: string) => stage.locator('.standings li', { has: stage.locator('.name', { hasText: new RegExp(`^${name}`) }) }).locator('.score');
  const answerText = async (page: Page, text: string) => {
    await page.getByLabel('Ваша відповідь', exact).fill(text);
    await click(page, 'Відповісти');
  };
  const yes = '(^|\\s)Так$';
  const no = '(^|\\s)Ні$';
  const ASK = 'Відповідь «Шевченко», правильна — «Тарас Шевченко». Зарахувати?';

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 1. p1: Оля «Шевченко», Петро правильно, Іра «Франко»; на розкритті кнопка в Олі й Іри, у Петра — ні.
  await stage.getByText('Хто написав «Заповіт»?', exact).waitFor();
  await answerText(olya, 'Шевченко');
  await answerText(petro, 'Тарас Шевченко');
  await answerText(ira, 'Франко');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await expect.poll(() => textOf(appealButton(olya)), POLL).toBe('⚖️ Оскаржити (лишилось 2)');
  await expect.poll(() => textOf(appealButton(ira)), POLL).toBe('⚖️ Оскаржити (лишилось 2)');
  await petro.locator('section.result').first().waitFor();
  expect(await appealButton(petro).count(), 'Петро answered right and got the button').toBe(0);
  expect(await olya.locator('.appeal-block').count()).toBe(0);
  // Кнопка на всю ширину й не налазить на результат.
  const fit = (await olya.evaluate(`(() => {
    const b = document.querySelector('button.appeal-button').getBoundingClientRect();
    const r = [...document.querySelectorAll('section.result')].map((el) => el.getBoundingClientRect()).filter((x) => x.height > 0).at(-1);
    return { width: b.width, right: b.right, overlap: r ? r.bottom > b.top + 1 : false };
  })()`)) as { width: number; right: number; overlap: boolean };
  expect(fit.overlap, 'the appeal button sits on the result').toBe(false);
  expect(fit.right, 'the appeal button is out of the screen').toBeLessThanOrEqual(375);
  expect(fit.width, 'the appeal button is not full width').toBeGreaterThan(300);
  await expectNoSideScroll(olya, 'p12f-phone-button');

  // 2. Оля оскаржує: сцена, пульт, телефони.
  await appealButton(olya).click();
  await card(stage).waitFor();
  expect(await stage.locator('main.app.stage.has-appeal').count()).toBe(1);
  await expect.poll(() => textOf(stage.locator('.appeal-card.is-stage h2.appeal-title')), POLL).toBe('⚖️ Оля оскаржує');
  expect(await textOf(stage.locator('.appeal-card.is-stage .appeal-ask'))).toBe(ASK);
  await expect.poll(() => textOf(count(stage)), POLL).toBe('так 0 · ні 0 · ще думають 2');
  expect(await stageTime()).toMatch(/^0:(30|2\d)$/);
  for (const part of ['.appeal-bar', '.appeal-bar-yes', '.appeal-bar-no']) expect(await stage.locator(`.appeal-card.is-stage ${part}`).count(), part).toBe(1);
  expect(await stage.evaluate(APPEAL_STAGE_OVERLAP), 'the stage card covers the reveal').toEqual([]);
  await expectStageInView(stage, 'p12f-stage-vote');
  await shot(stage, 'p12f-stage-vote');

  await voting.waitFor();
  expect(await voting.isDisabled(), '«Голосує зал» is enabled').toBe(true);
  expect(await next.count(), '«Далі» during the vote').toBe(0);
  await host.locator('.appeal-card.is-host').waitFor();
  await expect.poll(() => textOf(count(host)), POLL).toBe('так 0 · ні 0 · ще думають 2');
  expect(await host.evaluate(HEADER_ONE_LINE), 'p12f-host-vote: the host header wraps').toBe(true);
  await expectNoSideScroll(host, 'p12f-host-vote');

  await expect.poll(() => textOf(olya.locator('section.appeal-card.is-phone p.appeal-hall')), POLL).toBe('⚖️ Зал голосує…');
  expect(await appealButton(olya).count(), 'the button stays during the vote').toBe(0);
  expect(await sheet(olya).count(), 'Оля got the voter sheet').toBe(0);
  await shot(olya, 'p12f-phone-waiting');

  await sheet(petro).waitFor();
  await petro.getByRole('heading', { name: '⚖️ Оля оскаржує', ...exact }).waitFor();
  expect(await textOf(sheet(petro).locator('p.appeal-ask'))).toBe(ASK);
  expect(await sheetButton(petro, 'Так').getAttribute('aria-pressed')).toBe('false');
  expect(await sheetButton(petro, 'Ні').getAttribute('aria-pressed')).toBe('false');
  expect(await sheet(petro).locator('p.appeal-mine').count()).toBe(0);
  expect(await textOf(sheet(petro).locator('span.appeal-time'))).toMatch(/^0:(30|2\d)$/);
  expect(await petro.evaluate(APPEAL_SHEET_CLEAR), 'p12f-phone-vote: the sheet covers the result').toEqual([]);
  await expectNoSideScroll(petro, 'p12f-phone-vote');

  // 3. Іра «Ні», потім «Так»; Петро «Так» — голосування закривається одразу.
  await sheetButton(ira, 'Ні').click();
  await expect.poll(() => textOf(count(stage)), POLL).toBe('так 0 · ні 1 · ще думає 1');
  await expect.poll(() => sheetButton(ira, 'Ні').getAttribute('aria-pressed'), POLL).toBe('true');
  await expect.poll(() => textOf(sheet(ira).locator('p.appeal-mine')), POLL).toBe('Твій голос: ні · можна змінити до кінця');
  await expect.poll(() => sheetButton(ira, 'Так').getAttribute('aria-disabled'), POLL).toBe('false');
  await sheetButton(ira, 'Так').click();
  await expect.poll(() => textOf(count(stage)), POLL).toBe('так 1 · ні 0 · ще думає 1');
  await expect.poll(() => sheetButton(ira, 'Так').getAttribute('aria-pressed'), POLL).toBe('true');
  expect(await sheetButton(ira, 'Ні').getAttribute('aria-pressed')).toBe('false');
  await expect.poll(() => textOf(sheet(ira).locator('p.appeal-mine')), POLL).toBe('Твій голос: так · можна змінити до кінця');
  await expect.poll(() => textOf(sheetCount(petro)), POLL).toBe('так 1 · ні 0 · ще думає 1');
  await expect.poll(() => textOf(count(host)), POLL).toBe('так 1 · ні 0 · ще думає 1');
  await shot(ira, 'p12f-phone-voted');
  await sheetButton(petro, 'Так').click();

  // 4. «Так»: +200 Олі на сцені, пульті й телефоні; рядок Олі на пульті без кнопок оцінки.
  await expect.poll(() => textOf(result(stage)), POLL).toBe('⚖️ Зараховано! +200');
  expect(await stage.evaluate(APPEAL_STAGE_OVERLAP), 'the stage result card covers the reveal').toEqual([]);
  await expectStageInView(stage, 'p12f-stage-yes');
  await shot(stage, 'p12f-stage-yes');
  await expect.poll(() => textOf(result(olya)), POLL).toBe('⚖️ Зараховано! +200');
  await expect.poll(() => sheet(petro).count(), POLL).toBe(0);
  await expect.poll(() => textOf(result(petro)), POLL).toBe('⚖️ Зараховано! +200');
  await expect.poll(() => rowScore('Оля'), POLL).toBe('200');
  await next.waitFor();
  const passed = host.locator('.rows > li', { has: host.locator('.appeal-passed') });
  await expect.poll(() => passed.count(), POLL).toBe(1);
  expect(await textOf(passed.locator('.appeal-passed'))).toBe('Зал уже зарахував — щоб змінити оцінку, скасуйте бали в «↶ Бали», коли перейдете далі');
  expect(await passed.textContent()).toContain('Оля');
  expect(await passed.getByRole('button').count(), 'the passed row keeps grade buttons').toBe(0);
  expect(await host.evaluate(HEADER_ONE_LINE), 'p12f-host-yes: the host header wraps').toBe(true);
  await expectNoSideScroll(host, 'p12f-host-yes');
  await step(next);
  await expect.poll(() => textOf(standing('Оля')), POLL).toBe('200');
  expect(await textOf(standing('Петро'))).toBe('200');
  expect(await textOf(standing('Іра'))).toBe('0');
  expect(await card(stage).count(), 'the card outlives the reveal').toBe(0);

  // 5. p2: друга апеляція, пауза зупиняє відлік, нічия нічого не змінює.
  const nextQuestion = host.getByRole('button', { name: 'Наступне запитання', ...exact });
  await step(nextQuestion);
  await afterSplash(...all);
  await stage.getByText('Яка гора найвища в Україні?', exact).waitFor();
  await pickOption(olya, 'Петрос');
  await pickOption(petro, 'Говерла');
  await pickOption(ira, 'Говерла');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await expect.poll(() => textOf(appealButton(olya)), POLL).toBe('⚖️ Оскаржити (лишилось 1)');
  expect(await appealButton(petro).count()).toBe(0);
  expect(await appealButton(ira).count()).toBe(0);
  await appealButton(olya).click();
  await expect.poll(() => textOf(count(stage)), POLL).toBe('так 0 · ні 0 · ще думають 2');
  expect(await stage.evaluate(APPEAL_STAGE_OVERLAP), 'the stage card covers the options').toEqual([]);
  await expectStageInView(stage, 'p12f-stage-vote-options');
  await shot(stage, 'p12f-stage-vote-options');
  await host.getByRole('button', { name: 'Пауза', ...exact }).first().click();
  await stage.locator('.banner', { hasText: 'Пауза' }).waitFor();
  await expect.poll(() => textOf(sheet(petro).locator('p.appeal-paused')), POLL).toBe('Пауза: голосувати можна після неї');
  const held = await stageTime();
  await sleep(1500);
  expect(await stageTime(), 'the countdown runs on pause').toBe(held);
  for (const name of ['Так', 'Ні'] as const) {
    expect(await sheetButton(petro, name).getAttribute('aria-disabled'), `«${name}» is live on pause`).toBe('true');
    // aria-disabled, а не disabled: фокус лишається на кнопці (Playwright вважає aria-disabled неактивною, тож — властивість DOM).
    expect(await sheetButton(petro, name).evaluate((el) => (el as unknown as { disabled: boolean }).disabled), `«${name}» is disabled, not aria-disabled`).toBe(false);
  }
  await sheetButton(petro, 'Так').evaluate((el) => (el as unknown as { click(): void }).click());
  await sleep(300);
  expect(await textOf(count(stage)), 'a vote got through on pause').toBe('так 0 · ні 0 · ще думають 2');
  await expectNoSideScroll(petro, 'p12f-phone-paused');
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();
  await stage.locator('.banner', { hasText: 'Пауза' }).waitFor({ state: 'detached' });
  await expect.poll(() => sheet(petro).locator('p.appeal-paused').count(), POLL).toBe(0);
  await expect.poll(() => sheetButton(petro, 'Так').getAttribute('aria-disabled'), POLL).toBe('false');
  await sheetButton(petro, 'Так').click();
  await expect.poll(() => textOf(count(stage)), POLL).toBe('так 1 · ні 0 · ще думає 1');
  await sheetButton(ira, 'Ні').click();
  await expect.poll(() => textOf(result(stage)), POLL).toBe('⚖️ Лишається як було · так 1 · ні 1');
  await expect.poll(() => textOf(result(olya)), POLL).toBe('⚖️ Лишається як було · так 1 · ні 1');
  await expectNoSideScroll(olya, 'p12f-phone-tie');
  await shot(stage, 'p12f-stage-tie');
  expect(await rowScore('Оля')).toBe('200');
  expect(await host.locator('.appeal-passed').count(), 'a tie shows «Зал уже зарахував»').toBe(0);
  await step(next);
  await expect.poll(() => textOf(standing('Оля')), POLL).toBe('200');

  // 6. p3: ліміт вичерпано — у Олі третьої кнопки немає, в Іри (правильно) теж.
  await step(nextQuestion);
  await afterSplash(...all);
  await stage.getByText('Дунай впадає в Чорне море', exact).waitFor();
  await pickOption(olya, no);
  await pickOption(petro, yes);
  await pickOption(ira, yes);
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await olya.locator('section.result').first().waitFor();
  for (let i = 0; i < 4; i += 1) {
    expect(await appealButton(olya).count(), 'Оля got a third appeal').toBe(0);
    expect(await appealButton(ira).count(), 'Іра answered right and got the button').toBe(0);
    await olya.waitForTimeout(250);
  }
  expect(await card(stage).count(), 'a card without an appeal').toBe(0);

  // 7. Аркуш скасування: «Оля +200 (апеляція)» під запитанням 1, нічия рядка не додала.
  const undoSheet = host.locator('.undo-sheet');
  await host.locator('header.bar').getByRole('button', { name: '↶ Бали', ...exact }).click();
  await undoSheet.getByRole('heading', { name: 'Скасування балів', ...exact }).waitFor();
  const undoQuestion = (title: string) => undoSheet.locator('.undo-question', { has: host.locator('.undo-question-title', { hasText: title }) });
  await expect.poll(() => undoRows(undoQuestion('Хто написав «Заповіт»?')), POLL).toContain('Оля +200 (апеляція)');
  expect((await undoRows(undoQuestion('Яка гора найвища в Україні?'))).some((row) => row.includes('апеляц')), 'a tie added a row').toBe(false);
  expect(await host.evaluate(HEADER_ONE_LINE), 'p12f-host-sheet: the host header wraps').toBe(true);
  await expectNoSideScroll(host, 'p12f-host-sheet');
  await host.keyboard.press('Escape');
  await undoSheet.waitFor({ state: 'detached' });
  await step(next);
  await afterSplash(...all);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  // «Твоя гра» Олі: виграно 1 · програно 1; в Іри рядка немає.
  const gameLines = async (page: Page) => (await page.locator('section.game-card li').allTextContents()).map(squash);
  await olya.locator('section.game-card').waitFor();
  expect(await gameLines(olya)).toContain('⚖️ Апеляції: виграно 1 · програно 1');
  await ira.locator('section.game-card').waitFor();
  expect((await gameLines(ira)).some((line) => line.includes('⚖️')), 'Іра got an appeal line').toBe(false);
  await expectNoSideScroll(olya, 'p12f-phone-game');

  // 8. Таємність у кадрах: лише лічильники; свій голос — лише свій.
  const hostViews = stateViews(hostFrames) as unknown as { players?: { id: string; nickname: string }[] }[];
  const idOf = (name: string) => hostViews.flatMap((view) => view.players ?? []).find((player) => player.nickname === name)?.id;
  const petroId = idOf('Петро');
  const iraId = idOf('Іра');
  expect(petroId, 'no id of Петро').toBeTruthy();
  expect(iraId, 'no id of Іра').toBeTruthy();
  const frameSets = { stage: stageFrames, host: hostFrames, olya: olyaFrames, petro: petroFrames, ira: iraFrames };
  for (const [name, frames] of Object.entries(frameSets)) {
    expect(frames.length, `${name} got no frames`).toBeGreaterThan(0);
    expect(frames.join(NL), `${name} got the votes`).not.toContain('"votes"');
    const appeals = (stateViews(frames) as unknown as { appeal?: unknown }[]).filter((view) => view.appeal != null);
    expect(appeals.length, `${name} never got the appeal`).toBeGreaterThan(0);
    for (const view of appeals) {
      const text = JSON.stringify(view.appeal);
      // Імена — як рядки JSON: варіант «Петрос» містить «Петро».
      for (const secret of [petroId!, iraId!, '"Петро"', '"Іра"']) expect(text, `${name}: the appeal names a voter`).not.toContain(secret);
    }
  }
  const ownVotes = (frames: string[]) =>
    stateViews(frames).map((view) => (view.me as unknown as { appeal?: { vote: boolean | null } | null } | null)?.appeal?.vote ?? null);
  // Петро голосував лише «так»: «ні» Іри до нього не дійшло.
  expect(ownVotes(petroFrames).includes(true), 'Петро never saw the own yes').toBe(true);
  expect(ownVotes(petroFrames).includes(false), 'Петро got the no of Іра').toBe(false);
  expect(ownVotes(iraFrames).includes(false), 'Іра never saw the own no').toBe(true);
  expect(ownVotes(olyaFrames).every((vote) => vote === null), 'Оля got a vote').toBe(true);

  // 9. Історія: ⚖️ біля відповідей Олі на запитання 1 і 2.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Апеляція 12f/ }).click();
  const responses = host.locator('details.responses');
  await responses.first().waitFor();
  const appealOf = async (index: number) => {
    const details = responses.nth(index);
    await details.locator('summary').click();
    const row = details.locator('li', { has: host.locator('.responses-name', { hasText: /^Оля$/ }) });
    return textOf(row.locator('.history-appeal'));
  };
  expect(await appealOf(0)).toBe('⚖️ зараховано 2:0');
  expect(await appealOf(1)).toBe('⚖️ лишилось як було 1:1');
  expect(await host.locator('.history-appeal').count(), 'more ⚖️ than appeals').toBe(2);
  await expectNoSideScroll(host, 'p12f-history');

  expect(problems).toEqual([]);
}

it('part 12f: the player appeal — Оля appeals «Шевченко» from a 375 phone, Петро and Іра vote on a bottom sheet (Іра changes «Ні» to «Так») while the 1280 × 720 stage and the 375 host show only «так · ні · ще думають» and «Голосує зал», two yes add 200 and the table and stage update, a pause stops the countdown, the second appeal ends in a tie and changes nothing, there is no third button, the host sheet lists «Оля +200 (апеляція)», the history shows ⚖️, and no frame names a voter', async () => {
  try {
    await appeal12f();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** 29k: черга апеляцій у грі з ведучим-ботом — автор Марта (сокет), Оля й Петро на телефонах 375. */
async function appealQueue29k(sockets: Socket[]) {
  const author = await open('author29k', 1280, 900);
  await register(author, 'host', 'Марта Черга', 'author29k@example.com');
  const common = { imageUrl: null, video: null, timeLimit: 60 };
  const q1 = { ...common, id: 'k1', type: 'text' as const, text: 'Хто написав «Заповіт»?', points: 200, accepted: ['Тарас Шевченко'] };
  const q2 = { ...common, id: 'k2', type: 'boolean' as const, text: 'Дунай впадає в Чорне море', points: 100, correct: true };
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [q1, q2] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES })], { leaderboard: 'each' }),
    title: 'Черга апеляцій 29k',
  };
  const saved = await author.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const room = await createAutopilot(author, ((await saved.json()) as { id: string }).id);
  const { code } = room;
  const marta = await pilotSocket(sockets, code, room.token, 'Марта');
  const olya = await open('olya29k', 375, 812);
  const petro = await open('petro29k', 375, 812);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  const phones = [olya, petro];

  const textOf = async (locator: Locator) => squash(await locator.first().textContent({ timeout: 500 }).catch(() => null)) || null;
  const sheet = (page: Page) => page.locator('section.appeal-sheet');
  const appealButton = (page: Page) => page.locator('button.appeal-button');
  const answerText = async (page: Page, text: string) => {
    await page.getByLabel('Ваша відповідь', exact).fill(text);
    await click(page, 'Відповісти');
  };

  expect(await marta.emit('host:start')).toEqual({ ok: true });
  await afterSplash(...phones);
  await olya.getByText('Хто написав «Заповіт»?', exact).waitFor({ timeout: 60_000 });
  await afterSplash(...phones);

  // 1. Марта правильно, Оля «Шевченко», Петро «Франко»: на розкритті кнопка в обох.
  expect(await marta.emit('player:answer', { type: 'text', value: 'Тарас Шевченко' })).toEqual({ ok: true });
  await answerText(olya, 'Шевченко');
  await answerText(petro, 'Франко');
  await expect.poll(() => textOf(appealButton(olya)), { timeout: 15_000 }).toBe('⚖️ Оскаржити (лишилось 2)');
  await expect.poll(() => textOf(appealButton(petro)), POLL).toBe('⚖️ Оскаржити (лишилось 2)');

  // 2. Оля оскаржує; Петро бачить аркуш голосу, а в ньому — свою кнопку: вона активна.
  await appealButton(olya).click();
  await sheet(petro).waitFor();
  await petro.getByRole('heading', { name: '⚖️ Оля оскаржує', ...exact }).waitFor();
  const own = sheet(petro).locator('button.appeal-button');
  await expect.poll(() => textOf(own), POLL).toBe('⚖️ Оскаржити (лишилось 2)');
  expect(await own.isDisabled(), 'the second appeal button is disabled during the vote').toBe(false);
  expect(await appealButton(petro).count(), 'two appeal buttons on the phone').toBe(1);
  await shot(petro, 'p29k-phone-vote-and-file');
  // Петро подає свою під час голосування за Олину: «розглянуть після поточної».
  await own.click();
  await expect.poll(() => textOf(sheet(petro).locator('p.appeal-queued')), POLL).toBe('Вашу апеляцію розглянуть після поточної');
  await expect.poll(() => appealButton(petro).count(), POLL).toBe(0);
  await expectNoSideScroll(petro, 'p29k-phone-queued');
  await shot(petro, 'p29k-phone-queued');

  // 3. Голоси за Олину: Марта «ні», Петро «так» — нічия; Петрова апеляція відкривається одразу.
  expect(await marta.emit('player:appeal-vote', { appealId: 1, yes: false })).toEqual({ ok: true });
  await sheet(petro).getByRole('button', { name: 'Так', ...exact }).click();
  const second = await frame(marta, (v) => v.appeal?.id === 2 && v.appeal.outcome === null);
  expect(second.view.phase).toBe('reveal');
  await sheet(olya).waitFor();
  await olya.getByRole('heading', { name: '⚖️ Петро оскаржує', ...exact }).waitFor();
  await expect.poll(() => sheet(petro).count(), POLL).toBe(0);
  await expect.poll(() => textOf(petro.locator('section.appeal-card.is-phone p.appeal-hall')), POLL).toBe('⚖️ Зал голосує…');

  // 4. Бот не йде далі, поки зал голосує за другу: 5 с — та сама фаза.
  await sleep(5000);
  expect(marta.frames.slice(second.index).every((f) => f.view.phase === 'reveal'), 'the bot moved on during the second appeal').toBe(true);

  // 5. Марта й Оля «так» — Петрові +200; оскаржити більше нікому, тож за appealShown бот іде далі.
  expect(await marta.emit('player:appeal-vote', { appealId: 2, yes: true })).toEqual({ ok: true });
  await sheet(olya).getByRole('button', { name: 'Так', ...exact }).click();
  const decided = await frame(marta, (v) => v.appeal?.id === 2 && v.appeal.outcome === 'yes', second.index);
  await expect.poll(() => textOf(petro.locator('p.appeal-result')), POLL).toBe('⚖️ Зараховано! +200');
  const moved = await frame(marta, (v) => v.phase !== 'reveal', decided.index, 30_000);
  expectGap(moved.at - decided.at, AUTOPILOT_MS.appealShown, 'the bot after the last appeal');
  const appeals = marta.frames.slice(0, moved.index).filter((f) => f.view.appeal !== null).map((f) => `${f.view.appeal!.id}:${f.view.appeal!.outcome ?? 'open'}`);
  // Рішення першої й відкриття другої — один кадр: між ними гра не стоїть без апеляції.
  expect([...new Set(appeals)]).toEqual(['1:open', '2:open', '2:yes']);

  expect(problems).toEqual([]);
}

it('part 29k: the appeal queue with the bot host — Петро files his appeal from the vote sheet while the hall votes on Оля, sees «Вашу апеляцію розглянуть після поточної», his appeal opens right after Оля’s tie, the bot waits for it and moves on appealShown after the last decision', async () => {
  const sockets: Socket[] = [];
  try {
    await appealQueue29k(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 300_000);

function resumeQuestions12r() {
  const common = { imageUrl: null, video: null, timeLimit: 30 };
  const yes = (id: string, text: string) => ({ ...common, id, type: 'boolean' as const, text, points: 100, correct: true });
  return {
    r1: [yes('w1', 'Говерла — найвища гора України'), yes('w2', 'Світязь — озеро на Волині')],
    r2: [yes('v1', 'Дніпро тече через Київ')],
    r3: [yes('g1', 'Дунай впадає в Чорне море')],
  };
}

/** Панель «Продовжити попередню гру» (12r) на 375 px: кожен її блок у межах панелі й екрана, поле балів не вужче за 8rem і не обрізає значення. */
const RESUME_PANEL_FITS = `(() => {
  const panel = document.querySelector('details.resume-panel');
  if (panel === null) return ['no panel'];
  const box = panel.getBoundingClientRect();
  const out = [];
  if (box.left < -1 || box.right > innerWidth + 1) out.push('panel out of the screen');
  if (panel.scrollWidth > panel.clientWidth + 1) out.push('panel scrolls sideways');
  for (const el of panel.querySelectorAll('summary, select, button, input, .resume-name, p')) {
    const r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    if (r.left < box.left - 1 || r.right > box.right + 1) out.push('out of the panel: ' + el.tagName + ' ' + (el.textContent || el.id).slice(0, 40));
  }
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  for (const input of panel.querySelectorAll('input')) {
    if (input.getBoundingClientRect().width < 8 * rem - 1) out.push('points field narrower than 8rem: ' + input.id);
    if (input.scrollWidth > input.clientWidth + 1) out.push('points field clips its value: ' + input.value + ' ' + input.scrollWidth + ' > ' + input.clientWidth);
  }
  return out;
})()`;

/** Таблиця 11f на 375 px (12r): за scrollLeft = 0 остання колонка раунду не заходить під закріплену Σ (або таблиця не прокручується). */
const SCORE_TABLE_FITS = `(() => {
  const problems = [];
  let rounds = [];
  for (const wrap of document.querySelectorAll('.score-table-wrap')) {
    if (wrap.getBoundingClientRect().height === 0) continue;
    wrap.scrollLeft = 0;
    const heads = [...wrap.querySelectorAll('thead th.round')];
    rounds = heads.map((th) => th.textContent.trim());
    const total = wrap.querySelector('thead th.total');
    const last = heads.at(-1);
    const fits = wrap.scrollWidth <= wrap.clientWidth || (last !== undefined && total !== null && last.getBoundingClientRect().right <= total.getBoundingClientRect().left + 0.5);
    if (!fits) problems.push('scroll ' + wrap.scrollWidth + ' > ' + wrap.clientWidth + (last ? ', last round right ' + Math.round(last.getBoundingClientRect().right) + ' > Σ left ' + Math.round(total.getBoundingClientRect().left) : ''));
    const box = wrap.getBoundingClientRect();
    if (box.left < -1 || box.right > innerWidth + 1) problems.push('table out of the screen');
  }
  return { rounds, problems };
})()`;

async function resume12r() {
  const host = await open('host12r', 375, 812);
  await register(host, 'host', 'Ліна Ведуча', 'host12r@example.com');

  const { r1, r2, r3 } = resumeQuestions12r();
  const options = { speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES };
  const data = {
    ...makeRoundsQuiz(
      [
        classicRound('r1', r1 as never, { ...options, title: 'Розминка' }),
        classicRound('r2', r2 as never, { ...options, title: 'Річки' }),
        classicRound('r3', r3 as never, { ...options, title: 'Гори й моря' }),
      ],
      { leaderboard: 'each', newcomers: false },
    ),
    title: 'Продовження 12r',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  const textOf = async (locator: Locator) => squash(await locator.first().textContent({ timeout: 500 }).catch(() => null)) || null;
  const panel = (page: Page) => page.locator('details.resume-panel');
  // За підписом, а не за роллю: поле може бути й текстовим.
  const pointsField = (page: Page, nickname: string) => panel(page).getByLabel(nickname, exact);
  // Підпис з htmlFor: доступне ім'я — рівно «Почати з раунду».
  const roundSelect = (page: Page) => panel(page).getByRole('combobox', { name: 'Почати з раунду', ...exact });
  const selectedRound = (page: Page) => roundSelect(page).evaluate((el) => (el as unknown as { selectedOptions: { text: string }[] }).selectedOptions[0].text);
  const isOpen = (page: Page) => panel(page).evaluate((el) => (el as unknown as { open: boolean }).open);
  const startButton = host.getByRole('button', { name: 'Почати гру', ...exact });
  /** Головна кнопка пульта активна (11b тримає її кілька секунд) — і натиснута. */
  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  const yes = '(^|\\s)Так$';
  const no = '(^|\\s)Ні$';
  const expectPanelFits = async (page: Page, name: string) => {
    expect(await page.evaluate(RESUME_PANEL_FITS), `${name}: the resume panel overflows`).toEqual([]);
    await expectNoSideScroll(page, name);
  };
  const playQuiz = async () => {
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: 'Продовження 12r' }).getByRole('button', { name: 'Грати', ...exact }).click();
    await host.waitForURL(/\/host\/\d{6}$/);
    return host.url().slice(-6);
  };

  // Гра A: обривається на заставці раунду 2. Оля 200, Петро 100, Іра 0.
  {
    const code = await playQuiz();
    const olya = await open('olya12r-a', 375, 812);
    const petro = await open('petro12r-a', 375, 812);
    const ira = await open('ira12r-a', 375, 812);
    await join(olya, code, 'Оля', false);
    await join(petro, code, 'Петро', false);
    await join(ira, code, 'Іра', false);
    await host.getByText('Іра').first().waitFor();
    // Згорнута панель нічого не змінює: звичайний старт.
    expect(await isOpen(host)).toBe(false);
    const all = [host, olya, petro, ira];
    await step('Почати гру');
    await afterSplash(...all);
    await step('Почати раунд');
    await afterSplash(...all);
    await olya.getByText('Говерла — найвища гора України', exact).waitFor();
    await pickOption(olya, yes);
    await pickOption(petro, yes);
    await pickOption(ira, no);
    await host.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
    await step('Далі');
    await step('Наступне запитання');
    await afterSplash(...all);
    await olya.getByText('Світязь — озеро на Волині', exact).waitFor();
    await pickOption(olya, yes);
    await pickOption(petro, no);
    await pickOption(ira, no);
    await host.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
    await step('Далі');
    await step('Наступний раунд');
    await afterSplash(...all);
    await step('Завершити гру');
    await olya.locator('section.game-card').waitFor();
    for (const page of [olya, petro, ira]) await page.close();
  }

  // 1. Гра B: панель на пульті 375 px, згорнута.
  const code = await playQuiz();
  const hostFrames = socketFrames(host);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage12r', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya12r', 375, 812);
  const petro = await open('petro12r', 375, 812);
  const taras = await open('taras12r', 375, 812);
  const tarasFrames = socketFrames(taras);
  await join(olya, code, 'оля', false);
  await join(petro, code, 'Петро', false);
  await join(taras, code, 'Тарас', false);
  await stage.getByText('Тарас').waitFor();
  await panel(host).waitFor();
  expect(await isOpen(host), 'the panel is open by default').toBe(false);
  expect(await startButton.isDisabled()).toBe(false);
  for (const page of [olya, petro, taras]) expect(await panel(page).count(), 'a phone got the panel').toBe(0);
  await panel(host).locator('summary').click();
  await expect.poll(() => isOpen(host), POLL).toBe(true);
  expect(squash(await panel(host).locator('summary').textContent())).toBe('Продовжити попередню гру');
  expect(await selectedRound(host)).toBe('Раунд 1 · Розминка');
  expect(await roundSelect(host).locator('option').allTextContents()).toEqual(['Раунд 1 · Розминка', 'Раунд 2 · Річки', 'Раунд 3 · Гори й моря']);
  expect(await host.evaluate(HEADER_ONE_LINE), 'p12r-host-panel-empty: the host header wraps').toBe(true);
  await expectPanelFits(host, 'p12r-host-panel-empty');

  // 2. «Підставити з попередньої гри»: одна гра — заповнює одразу.
  await panel(host).locator('button.resume-fill').click();
  await expect.poll(() => textOf(panel(host).locator('p.resume-unmatched')), POLL).toBe('Не знайдено в тій грі, лишається 0: Тарас');
  expect(await textOf(panel(host).locator('p.resume-filled'))).toMatch(/^Підставлено гру від .+\. Усе можна змінити\.$/);
  expect(await panel(host).locator('section.resume-pick').count(), 'one game asks which').toBe(0);
  expect(await selectedRound(host)).toBe('Раунд 2 · Річки');
  expect(await pointsField(host, 'оля').inputValue()).toBe('200');
  expect(await pointsField(host, 'Петро').inputValue()).toBe('100');
  expect(await pointsField(host, 'Тарас').inputValue()).toBe('0');
  expect(await textOf(panel(host).locator('p.resume-summary'))).toBe('Старт: Раунд 2 · Річки. Перенесені бали: 2 з 3.');

  // 3. Найширше дозволене значення влазить у поле; потім 42434 вручну, пізній вхід Іри, хибне значення.
  await pointsField(host, 'Тарас').fill('-9999999');
  expect(await host.evaluate(RESUME_PANEL_FITS), 'p12r: −9999999 does not fit').toEqual([]);
  await pointsField(host, 'Тарас').fill('42434');
  await expect.poll(() => textOf(panel(host).locator('p.resume-summary')), POLL).toBe('Старт: Раунд 2 · Річки. Перенесені бали: 3 з 3.');
  const ira = await open('ira12r', 375, 812);
  await join(ira, code, 'Іра', false);
  await pointsField(host, 'Іра').waitFor();
  expect(await pointsField(host, 'Іра').inputValue()).toBe('0');
  expect(await pointsField(host, 'оля').inputValue()).toBe('200');
  expect(await pointsField(host, 'Петро').inputValue()).toBe('100');
  expect(await pointsField(host, 'Тарас').inputValue()).toBe('42434');
  expect(await selectedRound(host)).toBe('Раунд 2 · Річки');
  await expect.poll(() => textOf(panel(host).locator('p.resume-summary')), POLL).toBe('Старт: Раунд 2 · Річки. Перенесені бали: 3 з 4.');
  expect(await textOf(panel(host).locator('p.resume-summary + p'))).toBe('Хто зайде пізніше, почне з 0.');
  await pointsField(host, 'оля').fill('10000000');
  await expect.poll(() => pointsField(host, 'оля').getAttribute('aria-invalid'), POLL).toBe('true');
  expect(await textOf(panel(host).locator('p.error.resume-invalid'))).toBe('Ціле число від −9 999 999 до 9 999 999');
  await expect.poll(() => startButton.isDisabled(), POLL).toBe(true);
  await expectPanelFits(host, 'p12r-host-panel-invalid');
  await pointsField(host, 'оля').fill('200');
  await expect.poll(() => pointsField(host, 'оля').getAttribute('aria-invalid'), POLL).toBe(null);
  expect(await panel(host).locator('p.error.resume-invalid').count()).toBe(0);
  await expect.poll(() => startButton.isDisabled(), POLL).toBe(false);
  expect(await host.evaluate(HEADER_ONE_LINE), 'p12r-host-panel: the host header wraps').toBe(true);
  await expectPanelFits(host, 'p12r-host-panel');

  // 4. Старт: заставка «Раунд 2», перенесені бали ще до запитання.
  const phones = [olya, petro, taras, ira];
  const all = [host, stage, ...phones];
  await startButton.click();
  await splashOn(stage, 'round');
  expect(squash(await stage.locator('.splash.is-round').textContent())).toContain('Раунд 2');
  expect(squash(await stage.locator('.splash.is-round').textContent())).not.toContain('Раунд 1');
  await shot(stage, 'p12r-stage-splash', { splash: true });
  await afterSplash(...all);
  await expect
    .poll(() => stateViews(tarasFrames).some((view) => view.phase === 'intro' && view.round?.index === 1 && view.me.score === 42434), POLL)
    .toBe(true);
  expect(stateViews(tarasFrames).some((view) => view.round?.index === 0), 'Тарас got round 1').toBe(false);
  await step('Почати раунд');
  await afterSplash(...all);
  await stage.getByText('Дніпро тече через Київ', exact).waitFor();
  for (const page of phones) await pickOption(page, yes);
  await host.getByText('Запитання закрите').waitFor();
  await step('Показати відповідь');
  await step('Далі');
  const standingRow = (name: string) => stage.locator('.standings li', { has: stage.locator('.name', { hasText: new RegExp(`^${name}`) }) });
  await expect.poll(() => textOf(standingRow('Тарас').locator('.score')), POLL).toMatch(/^42\s?534$/);
  expect(await textOf(standingRow('оля').locator('.score'))).toBe('300');
  expect(await textOf(standingRow('Петро').locator('.score'))).toBe('200');
  expect(await textOf(standingRow('Іра').locator('.score'))).toBe('100');
  expect(squash(await stage.locator('.standings li').first().textContent())).toContain('Тарас');
  await expectStageInView(stage, 'p12r-stage-table');
  await shot(stage, 'p12r-stage-table');

  // 5. «↶ Бали»: лише відповіді v1, перенесених рядків немає.
  const sheet = host.locator('.undo-sheet');
  await host.locator('header.bar').getByRole('button', { name: '↶ Бали', ...exact }).click();
  await sheet.getByRole('heading', { name: 'Скасування балів', ...exact }).waitFor();
  await expect.poll(async () => (await undoRows(sheet)).length, POLL).toBe(4);
  const rows = await undoRows(sheet);
  expect(rows.slice().sort()).toEqual(['Іра +100', 'Петро +100', 'Тарас +100', 'оля +100'].sort());
  expect(squash(await sheet.textContent())).not.toMatch(/42|Перенесено/);
  expect(await sheet.locator('.undo-question').count(), 'the sheet lists more than v1').toBe(1);
  expect(await host.evaluate(HEADER_ONE_LINE), 'p12r-host-sheet: the host header wraps').toBe(true);
  await expectNoSideScroll(host, 'p12r-host-sheet');
  await host.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });

  // 6. Кінець гри B на заставці раунду 3: раунд 2 зіграно повністю.
  await step('Наступний раунд');
  await afterSplash(...all);
  await step('Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  for (const page of [petro, ira]) await page.close();

  // 7. Гра C: бот, автор (той самий акаунт) на телефоні 375 px вибирає новішу з двох ігор.
  const botCode = await launchBot11h(host, 'Продовження 12r', 'Ліна');
  const authorFrames = socketFrames(host);
  const olya3 = await open('olya12r-c', 375, 812);
  const taras3 = await open('taras12r-c', 375, 812);
  const olya3Frames = socketFrames(olya3);
  await joinBy11h(olya3, botCode, 'Оля');
  await joinBy11h(taras3, botCode, 'Тарас');
  await panel(host).waitFor();
  await pointsField(host, 'Тарас').waitFor({ state: 'attached' });
  expect(await isOpen(host), 'the author panel is open by default').toBe(false);
  await panel(host).locator('summary').click();
  await expect.poll(() => isOpen(host), POLL).toBe(true);
  await panel(host).locator('button.resume-fill').click();
  const pick = panel(host).locator('section.resume-pick');
  await pick.getByRole('heading', { name: 'Яку гру продовжити?', ...exact }).waitFor();
  const picks = (await pick.locator('.btn').allTextContents()).map(squash);
  expect(picks).toHaveLength(2);
  expect(picks[0]).toMatch(/^.+ · зіграно 1 з 4 · далі Раунд 3 · Гори й моря$/);
  expect(picks[1]).toMatch(/^.+ · зіграно 2 з 4 · далі Раунд 2 · Річки$/);
  await expectPanelFits(host, 'p12r-author-pick');
  await pick.locator('.btn').first().click();
  await expect.poll(() => textOf(panel(host).locator('p.resume-unmatched')), POLL).toBe('Не знайдено в тій грі, лишається 0: Ліна');
  expect(await selectedRound(host)).toBe('Раунд 3 · Гори й моря');
  expect(await pointsField(host, 'Оля').inputValue()).toBe('300');
  expect(await pointsField(host, 'Тарас').inputValue()).toBe('42534');
  expect(await pointsField(host, 'Ліна').inputValue()).toBe('0');
  expect(await textOf(panel(host).locator('p.resume-summary'))).toBe('Старт: Раунд 3 · Гори й моря. Перенесені бали: 2 з 3.');
  await expectPanelFits(host, 'p12r-author-panel');
  for (const page of [olya3, taras3]) expect(await panel(page).count(), 'a player phone got the panel').toBe(0);
  for (const view of stateViews(olya3Frames)) expect(view.author ?? null, 'Оля got the author view').toBeNull();

  // 8. Бот продовжує з «Раунд 3».
  await host.locator('button.author-start').click();
  await splashOn(olya3, 'round');
  expect(squash(await olya3.locator('.splash.is-round').textContent())).toContain('Раунд 3');
  await shot(olya3, 'p12r-bot-splash', { splash: true });
  for (const page of [host, olya3, taras3]) await page.getByText('Дунай впадає в Чорне море', exact).waitFor({ timeout: 60_000 });
  for (const page of [host, olya3, taras3]) await pickOption(page, yes);
  const table = olya3.locator('.table-sheet');
  await olya3.locator('header.bar').getByRole('button', { name: 'Таблиця', ...exact }).click();
  await table.getByRole('heading', { name: 'Таблиця', ...exact }).waitFor();
  const total = async (name: string) => (await scoreCells(table, name).catch(() => [] as string[])).at(-1) ?? null;
  await expect.poll(() => total('Тарас'), { timeout: 30_000 }).toMatch(/^42\s?634$/);
  expect(await total('Оля')).toBe('400');
  expect(await total('Ліна')).toBe('100');
  await expectNoSideScroll(olya3, 'p12r-bot-table');
  await olya3.keyboard.press('Escape');
  await expect.poll(() => stateViews(olya3Frames).some((view) => view.phase === 'finished'), { timeout: 90_000 }).toBe(true);
  for (const view of stateViews(olya3Frames)) expect(view.round?.index ?? 2, 'Оля got a skipped round').toBe(2);
  for (const view of stateViews(olya3Frames)) expect(view.author ?? null, 'Оля got the author view').toBeNull();
  expect(stateViews(authorFrames).some((view) => view.author != null), 'the author never got the author view').toBe(true);

  // 9. Історія: розділу пропущеного раунду немає, під стартовим — перенесені бали.
  await host.goto(`${base}/history`);
  const links = host.getByRole('link', { name: 'Продовження 12r', ...exact });
  await expect.poll(() => links.count(), { timeout: 15_000 }).toBe(3);
  const hrefs = await Promise.all((await links.all()).map((link) => link.getAttribute('href')));
  const games: { href: string; bot: boolean; carry: string[] }[] = [];
  for (const href of hrefs) {
    await host.goto(`${base}${href}`);
    await host.locator('section.history-scores').waitFor();
    games.push({ href: href!, bot: (await host.locator('.autopilot-mark').count()) > 0, carry: (await host.locator('.history-carry').allTextContents()).map(squash) });
  }
  const gameB = games.find((game) => !game.bot && game.carry.length > 0);
  const gameC = games.find((game) => game.bot);
  expect(gameB, 'no game B in the history').toBeTruthy();
  expect(gameC, 'no game C in the history').toBeTruthy();
  expect(games.filter((game) => !game.bot && game.carry.length === 0), 'no game A in the history').toHaveLength(1);

  await host.goto(`${base}${gameB!.href}`);
  const groups = host.locator('.round-group');
  await groups.first().waitFor();
  const titlesB = (await host.locator('h3.round-title').allTextContents()).map(squash);
  expect(titlesB.some((title) => title.includes('Розминка')), `game B shows the skipped round: ${titlesB.join(' | ')}`).toBe(false);
  expect(titlesB.some((title) => title.includes('Річки')), `game B has no «Річки»: ${titlesB.join(' | ')}`).toBe(true);
  const riversCarry = host.locator('.round-group', { hasText: 'Річки' }).locator('.history-carry');
  expect(await textOf(riversCarry)).toMatch(/^Перенесено з попередньої гри: оля \+200, Петро \+100, Тарас \+42\s?434$/);
  const scores = host.locator('section.history-scores');
  // Пропущений раунд 1 колонки не має: лише «Р2» (гра скінчилася на заставці раунду 3).
  expect((await scores.locator('thead th.round').allTextContents()).map(squash)).toEqual(['Р2']);
  const tarasCells = await scoreCells(scores, 'Тарас');
  expect(tarasCells, 'Р2 and Σ of Тарас').toHaveLength(2);
  expect(tarasCells[0], 'Р2 of Тарас').toBe('100');
  expect(tarasCells.at(-1)).toMatch(/^42\s?534$/);
  await scores.locator('button.score-row-toggle', { hasText: 'Тарас' }).click();
  await scores.locator('.score-breakdown').waitFor();
  const breakdown = await breakdownTexts(scores);
  expect(breakdown.some((line) => /^Перенесено з попередньої гри \+42\s?434$/.test(line)), breakdown.join(' | ')).toBe(true);
  await expectNoSideScroll(host, 'p12r-history');

  await host.goto(`${base}${gameC!.href}`);
  await host.locator('.autopilot-mark').waitFor();
  expect(await textOf(host.locator('.autopilot-mark'))).toBe('Провів бот');
  const titlesC = (await host.locator('h3.round-title').allTextContents()).map(squash);
  expect(titlesC.some((title) => /Розминка|Річки/.test(title)), `game C shows a skipped round: ${titlesC.join(' | ')}`).toBe(false);
  const seaCarry = await textOf(host.locator('.round-group', { hasText: 'Гори й моря' }).locator('.history-carry'));
  expect(seaCarry).toContain('Оля +300');
  expect(seaCarry).toMatch(/Тарас \+42\s?534/);
  expect(seaCarry).not.toContain('Ліна');
  await expectNoSideScroll(host, 'p12r-history-bot');

  // 10. Сцена й гравці не отримують панелі; пульт отримує.
  expect(stageFrames.length).toBeGreaterThan(0);
  expect(stageFrames.join(NL), 'the stage got the resume panel').not.toContain('"resume":');
  expect(tarasFrames.join(NL), 'a phone got the resume panel').not.toContain('"resume":{');
  expect(hostFrames.join(NL), 'the host never got the resume panel').toContain('"resume":{');

  // 11. Гра D: з «Раунд 1» з перенесеними 9 999 599 Олі — три зіграні раунди й семизначна Σ влазять у таблицю
  // телефона 375 px і пульта 375 px без прокрутки: остання колонка раунду не ховається під закріплену Σ.
  {
    const codeD = await playQuiz();
    const olyaD = await open('olya12r-d', 375, 812);
    const petroD = await open('petro12r-d', 375, 812);
    await join(olyaD, codeD, 'Оля', false);
    await join(petroD, codeD, 'Петро', false);
    await pointsField(host, 'Петро').waitFor({ state: 'attached' });
    await panel(host).locator('summary').click();
    await expect.poll(() => isOpen(host), POLL).toBe(true);
    await pointsField(host, 'Оля').fill('9 999 599');
    await expect.poll(() => textOf(panel(host).locator('p.resume-summary')), POLL).toBe('Старт: Раунд 1 · Розминка. Перенесені бали: 1 з 2.');
    const allD = [host, olyaD, petroD];
    await startButton.click();
    await afterSplash(...allD);
    const playRound = async (texts: string[], last: boolean) => {
      await step('Почати раунд');
      await afterSplash(...allD);
      for (const [i, text] of texts.entries()) {
        await olyaD.getByText(text, exact).waitFor();
        await pickOption(olyaD, yes);
        await pickOption(petroD, no);
        await host.getByText('Запитання закрите').waitFor();
        await step('Показати відповідь');
        await step('Далі');
        if (i < texts.length - 1) {
          await step('Наступне запитання');
          await afterSplash(...allD);
        } else if (!last) {
          await step('Наступний раунд');
          await afterSplash(...allD);
        }
      }
    };
    await playRound(['Говерла — найвища гора України', 'Світязь — озеро на Волині'], false);
    await playRound(['Дніпро тече через Київ'], false);
    await playRound(['Дунай впадає в Чорне море'], true);

    const tableD = olyaD.locator('.table-sheet');
    await olyaD.locator('header.bar').getByRole('button', { name: 'Таблиця', ...exact }).click();
    await tableD.getByRole('heading', { name: 'Таблиця', ...exact }).waitFor();
    await expect.poll(async () => (await scoreCells(tableD, 'Оля').catch(() => [] as string[])).at(-1) ?? null, POLL).toMatch(/^9\s?999\s?999$/);
    expect(await scoreCells(tableD, 'Оля')).toEqual(['200', '100', '100', expect.stringMatching(/^9\s?999\s?999$/)]);
    expect(await olyaD.evaluate(SCORE_TABLE_FITS), 'p12r-phone-table: the last round hides under Σ').toEqual({ rounds: ['Р1', 'Р2', 'Р3'], problems: [] });
    await expectNoSideScroll(olyaD, 'p12r-phone-table');
    await olyaD.keyboard.press('Escape');

    const hostScores = host.locator('details.host-scores');
    await hostScores.locator('summary').click();
    await hostScores.locator('tr.score-row').first().waitFor();
    expect(await host.evaluate(SCORE_TABLE_FITS), 'p12r-host-table: the last round hides under Σ').toEqual({ rounds: ['Р1', 'Р2', 'Р3'], problems: [] });
    await hostScores.scrollIntoViewIfNeeded();
    await expectNoSideScroll(host, 'p12r-host-table');
    await hostScores.locator('summary').click();
    for (const page of [olyaD, petroD]) await page.close();
  }

  // 12. Гра E: з «Раунд 3» з −9 999 999 у довгого нікнейма — таблиця сцени 1280 × 720 влазить.
  {
    const codeE = await playQuiz();
    const stageE = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
    await stage.goto(stageE);
    const longName = 'Максиміліана Шевчук';
    const longE = await open('long12r-e', 375, 812);
    const olyaE = await open('olya12r-e', 375, 812);
    await join(longE, codeE, longName, false);
    await join(olyaE, codeE, 'Оля', false);
    await stage.getByText('Оля').waitFor();
    await pointsField(host, 'Оля').waitFor({ state: 'attached' });
    await panel(host).locator('summary').click();
    await expect.poll(() => isOpen(host), POLL).toBe(true);
    await roundSelect(host).selectOption('2');
    await pointsField(host, longName).fill('−9 999 999');
    await expect.poll(() => textOf(panel(host).locator('p.resume-summary')), POLL).toBe('Старт: Раунд 3 · Гори й моря. Перенесені бали: 1 з 2.');
    const allE = [host, stage, longE, olyaE];
    await startButton.click();
    await afterSplash(...allE);
    await step('Почати раунд');
    await afterSplash(...allE);
    await stage.getByText('Дунай впадає в Чорне море', exact).waitFor();
    for (const page of [longE, olyaE]) await pickOption(page, yes);
    await host.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
    await step('Далі');
    await expect.poll(() => textOf(standingRow(longName).locator('.score')), POLL).toMatch(/^−9\s?999\s?899$/);
    await expectStageInView(stage, 'p12r-stage-long');
    await shot(stage, 'p12r-stage-long');
    for (const page of [longE, olyaE]) await page.close();
  }

  expect(problems).toEqual([]);
}

it('part 12r: resume a game — after a game stops in round 2 the 375 host opens «Продовжити попередню гру», «Підставити з попередньої гри» fills «Раунд 2» and the points by nickname, a new player gets 42434 by hand and a late joiner 0, the stage says «Раунд 2» and the table shows the carried points that the undo sheet never lists; then the author of a bot game picks the newer of two games on a 375 phone and the bot goes on from «Раунд 3»; the history hides the skipped rounds and lists «Перенесено з попередньої гри»', async () => {
  try {
    await resume12r();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 900_000);

function answererQuestions12g() {
  const common = { imageUrl: null, video: null, timeLimit: 90, points: 100 };
  const q = (id: string, text: string, accepted: string[]) => ({ ...common, id, type: 'text' as const, text, accepted });
  return [
    q('a1', 'Хто написав «Кобзар»?', ['Тарас Шевченко', 'Шевченко']),
    q('a2', 'Яка гора найвища в Україні?', ['Говерла']),
    q('a3', 'Яка річка тече через Київ?', ['Дніпро']),
    q('a4', 'Яке місто на Поділлі славиться фортецею над каньйоном Смотрича?', ['Кам’янець-Подільський', 'Кам’янець']),
  ];
}

/** Вибір капітана (12g) у кадрах стану телефона: memberId чи null. */
function answererPicks(frames: string[]): (string | null)[] {
  return stateViews(frames).map((view) => view.team?.answererPick?.memberId ?? null);
}

async function answerer12g() {
  const host = await open('host12g', 375, 812);
  await register(host, 'host', 'Ліна Ведуча', 'host12g@example.com');
  const hostFrames = socketFrames(host);

  const [a1, a2, a3, a4] = answererQuestions12g();
  const options = { speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES };
  const chosen = {
    ...makeRoundsQuiz(
      [classicRound('r1', [a1, a2, a3] as never, { ...options, title: 'Розминка' }), classicRound('r2', [a4] as never, { ...options, title: 'Другий' })],
      { leaderboard: 'each', debuffs: [], teams: { count: 2, names: ['Червоні', 'Сині'], answerer: 'chosen' } },
    ),
    title: 'Відповідач 12g',
  };
  const rotate = {
    ...makeRoundsQuiz([classicRound('r1', [a1, a2, a3, a4] as never, { ...options, title: 'Розминка' })], {
      leaderboard: 'each',
      debuffs: ['mirror'],
      debuffPrices: { mirror: 100 },
      teams: { count: 2, names: ['Червоні', 'Сині'], answerer: 'rotate' },
    }),
    title: 'По черзі 12g',
  };
  for (const data of [chosen, rotate]) {
    const saved = await host.request.post(`${base}/api/quizzes`, { data });
    expect(saved.ok(), await saved.text()).toBe(true);
  }

  const stage = await open('stage12g', 1280, 720);
  const stageFrames = socketFrames(stage);
  const olya = await open('olya12g', 375, 812);
  const petro = await open('petro12g', 375, 812);
  const ira = await open('ira12g', 375, 812);
  const marko = await open('marko12g', 375, 812);
  const nata = await open('nata12g', 375, 812);
  const olyaFrames = socketFrames(olya);
  const markoFrames = socketFrames(marko);
  const nataFrames = socketFrames(nata);
  const phones = [olya, petro, ira, marko, nata];
  const all = [host, stage, ...phones];
  const roster = [
    [olya, 'Оля', 'Червоні'],
    [petro, 'Петро', 'Червоні'],
    [ira, 'Іра', 'Червоні'],
    [marko, 'Марко', 'Сині'],
    [nata, 'Ната', 'Сині'],
  ] as const;

  /** Нова гра з вікторини title: сцена й п'ять телефонів у командах (капітан — перший у команді). */
  const launch = async (title: string) => {
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Грати', ...exact }).click();
    await host.waitForURL(/\/host\/\d{6}$/);
    const code = host.url().slice(-6);
    await stage.goto((await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
    for (const [page, nickname, team] of roster) {
      await join(page, code, nickname, false);
      await page.locator('.team-pick-grid').waitFor();
      await pickTeamOn(page, team);
    }
    await expect.poll(() => stageTeam(stage, 'Червоні'), POLL).toEqual(['Оля', 'Петро', 'Іра']);
    await expect.poll(() => stageTeam(stage, 'Сині'), POLL).toEqual(['Марко', 'Ната']);
  };

  const textOf = async (locator: Locator) => squash(await locator.first().textContent({ timeout: 500 }).catch(() => null)) || null;
  const picker = (page: Page) => page.locator('section.answerer-picker');
  const option = (page: Page, name: string) => picker(page).getByRole('button', { name, ...exact });
  /** Імена кнопок без позначки ✓ натиснутої. */
  const optionNames = async (page: Page) => (await picker(page).locator('.answerer-options button.answerer-option').allTextContents()).map((name) => squash(name).replace(/^✓ /, ''));
  const roundBox = (page: Page) => picker(page).getByRole('checkbox', { name: 'на весь раунд', ...exact });
  const hint = (page: Page) => picker(page).locator('p.meta.answerer-hint');
  const banner = (page: Page) => page.locator('p.lead.team-answerer-banner');
  const barLine = (page: Page) => page.locator('.team-bar-line');
  const watchLead = (page: Page) => page.locator('.team-watch-lead');
  const answerField = (page: Page) => field(page, 'Ваша відповідь');
  const stageLine = () => stage.locator('.stage-answerers');
  const stageNames = async () => (await stage.locator('.stage-answerers .stage-answerer').allTextContents()).map(squash);
  const mic = () => host.getByRole('img', { name: 'відповідає', ...exact });
  /** Кадр одного блоку: у кадрі на всю сторінку липкий підвал пульта й редактора лягає посеред сторінки й закриває блок. */
  const blockShot = async (block: Locator, name: string) => {
    if (process.env.E2E_SHOTS !== '1') return;
    mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
    // Висока сторінка на мить кадру: підвал іде вниз і блок не закриває.
    const page = block.page();
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width, height: 3000 });
    await block.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`) });
    await page.setViewportSize(size);
  };
  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  /** Обидві команди відповіли — ведучий розкриває. */
  const reveal = async () => {
    await host.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
    await stage.locator('.stage .lead.answer').waitFor();
  };
  const question = async (text: string) => {
    await afterSplash(...all);
    await stage.getByText(text, exact).waitFor();
  };

  // ── Гра A: «вибирає капітан». ──
  await launch('Відповідач 12g');
  await step('Почати гру');
  await afterSplash(...all);

  // 1. Смужка капітана на заставці раунду.
  await picker(olya).waitFor();
  expect(await textOf(picker(olya).locator('p.lead'))).toBe('Відповідає:');
  expect(await optionNames(olya)).toEqual(['Я', 'Петро', 'Іра']);
  expect(await option(olya, 'Я').getAttribute('aria-pressed')).toBe('true');
  expect(await option(olya, 'Петро').getAttribute('aria-pressed')).toBe('false');
  expect(await roundBox(olya).isChecked()).toBe(false);
  expect(await hint(olya).count(), 'no hint before a pick').toBe(0);
  await picker(marko).waitFor();
  expect(await optionNames(marko)).toEqual(['Я', 'Ната']);
  for (const page of [petro, ira, nata]) expect(await picker(page).count(), 'a strip on a teammate phone').toBe(0);
  await expectNoSideScroll(olya, 'p12g-captain-strip');
  await shot(olya, 'p12g-captain-strip');
  await option(olya, 'Петро').click();
  await expect.poll(() => option(olya, 'Петро').getAttribute('aria-pressed'), POLL).toBe('true');
  expect(await option(olya, 'Я').getAttribute('aria-pressed')).toBe('false');
  expect(await textOf(hint(olya))).toBe('Лише наступне запитання');
  expect(await textOf(option(olya, 'Петро')), 'the pressed one carries a ✓').toBe('✓ Петро');
  await expect.poll(() => textOf(barLine(petro)), POLL).toBe('Ти відповідаєш');
  await expect.poll(() => textOf(barLine(ira)), POLL).toBe('Відповідає Петро');
  await shot(olya, 'p12g-captain-picked');

  // 2. a1: відповідає Петро, в Олі поля немає.
  await step('Почати раунд');
  await question(a1!.text);
  await banner(petro).waitFor();
  expect(await textOf(banner(petro))).toBe('Ти відповідаєш за команду');
  await answerField(petro).waitFor();
  {
    // Банер — над запитанням і не налазить на поле.
    const b = (await banner(petro).boundingBox())!;
    const h1 = (await petro.locator('h1', { hasText: a1!.text }).boundingBox())!;
    const input = (await answerField(petro).boundingBox())!;
    expect(b.y + b.height, 'the banner is not above the question').toBeLessThanOrEqual(h1.y + 1);
    expect(b.y + b.height, 'the banner covers the field').toBeLessThanOrEqual(input.y + 1);
  }
  expect(await textOf(barLine(petro))).toBe('Ти відповідаєш');
  await expectNoSideScroll(petro, 'p12g-phone-answerer');
  await shot(petro, 'p12g-phone-answerer');
  await expect.poll(() => textOf(watchLead(olya)), POLL).toBe('Відповідає Петро — радьте вголос');
  expect(await answerField(olya).count(), 'the captain has an answer field').toBe(0);
  expect(await banner(olya).count()).toBe(0);
  expect(await textOf(barLine(olya))).toBe('Відповідає Петро');
  expect(await textOf(watchLead(ira))).toBe('Відповідає Петро — радьте вголос');
  // У Синіх відповідає капітан Марко.
  await banner(marko).waitFor();
  expect(await textOf(watchLead(nata))).toBe('Відповідає капітан Марко — радьте вголос');

  await answerField(petro).fill('Шевч');
  for (const page of [olya, ira]) await page.locator('.team-draft', { hasText: 'Шевч' }).waitFor({ timeout: 3000 });
  await expectNoSideScroll(olya, 'p12g-phone-teammate');
  await shot(olya, 'p12g-phone-teammate');
  await liveRow(host, 'Червоні').locator('.live-draft em', { hasText: 'Шевч' }).waitFor({ timeout: 3000 });
  for (const [who, frames] of [['stage', stageFrames], ['marko', markoFrames], ['nata', nataFrames]] as const) {
    expect(frames.join(NL), `${who} received the draft of Петро`).not.toContain('Шевч');
  }

  await stageLine().waitFor();
  expect(await stageNames()).toEqual(['Червоні — відповідає: Петро', 'Сині — відповідає: Марко']);
  {
    // Рядок одразу під шапкою сцени, в один рядок.
    const line = (await stageLine().boundingBox())!;
    const bar = (await stage.locator('.stage-question > header.bar').boundingBox())!;
    expect(line.y, 'the stage line is not under the header').toBeGreaterThanOrEqual(bar.y + bar.height - 1);
    expect(line.height, 'the stage line wraps').toBeLessThan(80);
    expect(await stage.locator('.stage-question > header.bar + p.stage-answerers').count(), 'the line is not right after the header').toBe(1);
  }
  await expectStageInView(stage, 'p12g-stage-question');
  await shot(stage, 'p12g-stage-question');

  await liveRow(host, 'Червоні').getByText('діє: Петро', exact).waitFor();
  await mic().waitFor();
  expect(await mic().count()).toBe(1);
  expect(await host.evaluate(HEADER_ONE_LINE), 'p12g-host-row: the host header wraps').toBe(true);
  await expectNoSideScroll(host, 'p12g-host-row');
  await shot(host, 'p12g-host-row');
  await blockShot(host.locator('#live-answers'), 'p12g-host-live');
  await blockShot(host.locator('.team-people').first(), 'p12g-host-mic');

  await numericAnswer(petro, 'Тарас Шевченко');
  await numericAnswer(marko, 'Франко');
  await reveal();
  await expect.poll(() => revealLine(stage), POLL).toMatch(/^Правильно 1 з 2/);
  expect(await stageNames(), 'the stage line on the reveal').toEqual(['Червоні — відповідає: Петро', 'Сині — відповідає: Марко']);
  await expectStageInView(stage, 'p12g-stage-reveal');
  await shot(stage, 'p12g-stage-reveal');

  // Апеляція капітана Синіх на тому самому розкритті: картка, рядок 12d і рядок 12g — у 1280 × 720.
  const appealButton = marko.locator('button.appeal-button');
  await appealButton.waitFor();
  await appealButton.click();
  await stage.locator('.appeal-card.is-stage').waitFor();
  expect(await stage.evaluate(APPEAL_STAGE_OVERLAP), 'the stage card covers the reveal').toEqual([]);
  await expectStageInView(stage, 'p12g-stage-reveal-appeal');
  await shot(stage, 'p12g-stage-reveal-appeal');
  for (const page of [olya, petro, ira]) await page.locator('section.appeal-sheet').getByRole('button', { name: 'Ні', ...exact }).click();
  await stage.locator('p.appeal-result').waitFor();
  await step('Далі');
  await expect.poll(() => teamTotal(host, 'Червоні'), POLL).toBe(100);
  expect(await teamTotal(host, 'Сині')).toBe(0);

  // 3. a2: знову капітан.
  await picker(olya).waitFor();
  expect(await option(olya, 'Я').getAttribute('aria-pressed'), 'the one-question pick outlived the question').toBe('true');
  await step('Наступне запитання');
  await question(a2!.text);
  await answerField(olya).waitFor();
  expect(await textOf(banner(olya)), 'the captain who answers in chosen sees the banner').toBe('Ти відповідаєш за команду');
  expect(await answerField(petro).count()).toBe(0);
  expect(await banner(petro).count()).toBe(0);
  await expect.poll(() => textOf(watchLead(petro)), POLL).toBe('Відповідає капітан Оля — радьте вголос');
  await expect.poll(() => stageNames(), POLL).toEqual(['Червоні — відповідає: Оля', 'Сині — відповідає: Марко']);
  expect(await mic().count(), '🎤 beside the captain').toBe(0);
  await numericAnswer(olya, 'Говерла');
  await numericAnswer(marko, 'Говерла');
  await reveal();

  // 4. «На весь раунд»: Іра до кінця раунду «Розминка».
  await picker(olya).waitFor();
  await roundBox(olya).check();
  await option(olya, 'Іра').click();
  await expect.poll(() => option(olya, 'Іра').getAttribute('aria-pressed'), POLL).toBe('true');
  await expect.poll(() => textOf(hint(olya)), POLL).toMatch(/кінця раунду/);
  expect(await roundBox(olya).isChecked()).toBe(true);
  await expectNoSideScroll(olya, 'p12g-captain-round');
  await shot(olya, 'p12g-captain-round');
  await step('Далі');
  await step('Наступне запитання');
  await question(a3!.text);
  await banner(ira).waitFor();
  expect(await answerField(olya).count()).toBe(0);
  await expect.poll(() => stageNames(), POLL).toEqual(['Червоні — відповідає: Іра', 'Сині — відповідає: Марко']);
  await numericAnswer(ira, 'Дніпро');
  await numericAnswer(marko, 'Дніпро');
  await reveal();
  // Після останнього запитання раунду вибору «на раунд» уже нічого не лишилось: наступне — знову капітан.
  await expect.poll(() => option(olya, 'Я').getAttribute('aria-pressed'), POLL).toBe('true');
  expect(await option(olya, 'Іра').getAttribute('aria-pressed'), 'the round pick outlived the round').toBe('false');
  await step('Далі');
  await step('Наступний раунд');
  await afterSplash(...all);
  await picker(olya).waitFor();
  await expect.poll(() => option(olya, 'Я').getAttribute('aria-pressed'), POLL).toBe('true');
  expect(await option(olya, 'Іра').getAttribute('aria-pressed')).toBe('false');
  expect(await stageLine().count(), 'the stage line on the round intro').toBe(0);
  await step('Почати раунд');
  await question(a4!.text);
  await answerField(olya).waitFor();
  await expect.poll(() => stageNames(), POLL).toEqual(['Червоні — відповідає: Оля', 'Сині — відповідає: Марко']);
  await numericAnswer(olya, 'Кам’янець');
  await numericAnswer(marko, 'Кам’янець');
  await reveal();
  await step('Далі');
  await afterSplash(...all);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  expect(await stageLine().count(), 'the stage line on the podium').toBe(0);

  // 5. Редактор: у «По черзі 12g» — «по черзі».
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'По черзі 12g' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  const teamsBlock = host.locator('details.teams');
  await teamsBlock.locator('summary').click();
  const mode = host.getByLabel('Хто відповідає', exact);
  await mode.waitFor();
  expect(await mode.inputValue()).toBe('rotate');
  expect(await mode.evaluate((el) => (el as unknown as { selectedOptions: { text: string }[] }).selectedOptions[0]!.text)).toBe('по черзі');
  await mode.scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p12g-editor');
  await shot(host, 'p12g-editor');
  await blockShot(teamsBlock, 'p12g-editor-teams');

  // ── Гра B: «по черзі». ──
  await launch('По черзі 12g');
  await step('Почати гру');
  await afterSplash(...all);
  await picker(olya).waitFor();
  expect(await optionNames(olya)).toEqual(['Я', 'Петро', 'Іра', 'Черга']);
  expect(await option(olya, 'Черга').getAttribute('aria-pressed'), 'the queue is not pressed without a pick').toBe('true');
  expect(await option(olya, 'Я').getAttribute('aria-pressed')).toBe('false');
  await expectNoSideScroll(olya, 'p12g-captain-rotate');
  await shot(olya, 'p12g-captain-rotate');
  await step('Почати раунд');

  // a1: перший хід — капітани.
  await question(a1!.text);
  await expect.poll(() => stageNames(), POLL).toEqual(['Червоні — відповідає: Оля', 'Сині — відповідає: Марко']);
  await numericAnswer(olya, 'Тарас Шевченко');
  await numericAnswer(marko, 'Франко');
  await reveal();
  await step('Далі');
  await expect.poll(() => teamTotal(host, 'Червоні'), POLL).toBe(100);

  // Оля купує Синім «Дзеркало»: воно на телефоні того, хто відповідатиме (Ната), а не капітана Марка.
  await olya.getByRole('button', { name: 'Дебафи', ...exact }).click();
  const shop = olya.getByRole('dialog', { name: 'Дебафи для суперників' });
  await shop.waitFor();
  await shop.locator('.shop-item', { hasText: /Дзеркало/ }).click();
  await shop.locator('.shop-target', { hasText: 'Сині' }).click();
  await shop.getByRole('button', { name: 'Купити за 100', ...exact }).click();
  await shop.waitFor({ state: 'detached' });

  // a2: Петро й Ната.
  await step('Наступне запитання');
  await question(a2!.text);
  await expect.poll(() => stageNames(), POLL).toEqual(['Червоні — відповідає: Петро', 'Сині — відповідає: Ната']);
  await expectStageInView(stage, 'p12g-stage-rotate');
  await shot(stage, 'p12g-stage-rotate');
  await nata.locator('.debuff-zone[data-debuff="mirror"]').waitFor();
  await banner(nata).waitFor();
  await marko.locator('.team-debuff-strip').waitFor();
  expect(await textOf(marko.locator('.team-debuff-strip'))).toContain('Дзеркало');
  expect(await marko.locator('.debuff-zone[data-debuff="mirror"]').count(), 'the mirror on the captain phone').toBe(0);
  expect(await answerField(marko).count(), 'the captain has an answer field in turns').toBe(0);
  await expectNoSideScroll(nata, 'p12g-phone-debuff');
  await shot(nata, 'p12g-phone-debuff');
  await shot(marko, 'p12g-phone-debuff-strip');
  await numericAnswer(petro, 'Говерла');
  await numericAnswer(nata, 'Говерла');
  await reveal();

  // На розкритті a2 Оля бере наступне запитання собі.
  await option(olya, 'Я').click();
  await expect.poll(() => option(olya, 'Я').getAttribute('aria-pressed'), POLL).toBe('true');
  expect(await option(olya, 'Черга').getAttribute('aria-pressed')).toBe('false');
  await step('Далі');
  await step('Наступне запитання');
  await question(a3!.text);
  await expect.poll(() => stageNames(), POLL).toEqual(['Червоні — відповідає: Оля', 'Сині — відповідає: Марко']);
  await numericAnswer(olya, 'Дніпро');
  await numericAnswer(marko, 'Дніпро');
  await reveal();
  await expect.poll(() => option(olya, 'Черга').getAttribute('aria-pressed'), POLL).toBe('true');
  await step('Далі');
  await step('Наступне запитання');
  await question(a4!.text);
  await expect.poll(() => stageNames(), POLL).toEqual(['Червоні — відповідає: Іра', 'Сині — відповідає: Ната']);
  await numericAnswer(ira, 'Кам’янець');
  await numericAnswer(nata, 'Кам’янець');
  await reveal();
  await step('Далі');
  await afterSplash(...all);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  // Таємність: вибір Олі приходить лише Червоним; Сині й сцена його не отримують.
  const hostViews = stateViews(hostFrames) as unknown as { teams?: { teams: { name: string; members: { id: string; nickname: string }[] }[] } | null }[];
  const redIds = new Set(hostViews.flatMap((view) => view.teams?.teams ?? []).filter((team) => team.name === 'Червоні').flatMap((team) => team.members.map((m) => m.id)));
  expect(redIds.size, 'no ids of Червоні').toBeGreaterThanOrEqual(3);
  const olyaPicks = answererPicks(olyaFrames).filter((id) => id !== null);
  expect(olyaPicks.length, 'Оля never saw the own pick').toBeGreaterThan(0);
  for (const [who, frames] of [['marko', markoFrames], ['nata', nataFrames]] as const) {
    expect(stateViews(frames).length, `${who} got no frames`).toBeGreaterThan(0);
    const leaks = answererPicks(frames).filter((id) => id !== null && redIds.has(id));
    expect(leaks, `${who} received the pick of Червоні`).toEqual([]);
  }
  expect(stageFrames.join(NL), 'the stage received a pick').not.toContain('"answererPick"');

  expect(problems).toEqual([]);
}

it('part 12g: the captain picks who answers — on a 375 phone Оля picks Петро for one question, Петро sees «Ти відповідаєш за команду» and answers while Оля cannot, teammates watch his draft that the other team never gets, the 1280 × 720 stage says «Червоні — відповідає: Петро», the 375 host row says «діє: Петро», the next question is the captain again, «на весь раунд» gives Іра the rest of the round and ends with it, the editor sets «по черзі», and in turns the stage goes Оля, Петро, Оля by the captain, Іра', async () => {
  try {
    await answerer12g();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

function powersQuestions12h() {
  const common = { imageUrl: null, video: null, timeLimit: 60, points: 100 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  return [
    { ...common, id: 'h1', type: 'single' as const, text: 'Яка річка тече через Київ?', options: options('Дніпро', 'Дністер', 'Десна', 'Південний Буг'), correctId: 'a' },
    { ...common, id: 'h2', type: 'text' as const, text: 'Хто написав «Лісову пісню»?', accepted: ['Леся Українка'] },
    { ...common, id: 'h3', type: 'slider' as const, text: 'У якому році заснували Києво-Могилянську академію?', min: 1500, max: 1800, step: 1, correct: 1615, tolerance: 5 },
    { ...common, id: 'h4', type: 'single' as const, text: 'Яке місто — столиця Буковини?', options: options('Чернівці', 'Ужгород', 'Луцьк', 'Рівне'), correctId: 'a' },
  ];
}

/** Числа в тексті (пробіли-розділювачі тисяч не ріжуть число). */
const numbersIn = (text: string) => [...text.matchAll(/\d[\d\s  ]*/g)].map((m) => Number(m[0].replace(/\D/g, '')));

/** Сторінка «Як грати» без прокрутки вниз (12h: густі сторінки бафів і дебафів). */
const GUIDE_FITS = 'document.scrollingElement.scrollHeight <= 720';

/** Бульбашки (12h), що перетинають варіант text, — центри, px. */
const BUBBLES_OVER = (text: string) => `(() => {
  const button = [...document.querySelectorAll('.debuff-content button')].find((b) => b.textContent.includes(${JSON.stringify(text)}));
  const r = button.getBoundingClientRect();
  return [...document.querySelectorAll('button.debuff-bubble:not(.is-popped)')]
    .map((b) => b.getBoundingClientRect())
    .filter((b) => b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom)
    .map((b) => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 }));
})()`;

async function powers12h() {
  const host = await open('host12h', 375, 812);
  await register(host, 'host', 'Ліна Ведуча', 'host12h@example.com');

  const questions = powersQuestions12h();
  const [h1, h2, h3, h4] = questions;
  const rules = { penalty: 'none' as const, partial: null, streak: { length: 2, bonus: { kind: 'fixed' as const, value: 50 } }, multiplier: 1 as const };
  const round = () => classicRound('r1', questions as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false, rules });
  const allBuffs = ['fifty', 'double', 'retry', 'time', 'shield', 'audience', 'hint', 'swap', 'risk', 'letter', 'scope', 'guard', 'peek'] as const;
  const allDebuffs = ['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud', 'flip', 'torch', 'sticky', 'noclock', 'bubbles'] as const;
  const quizzes = [
    {
      ...makeRoundsQuiz([round()], { leaderboard: 'each', buffs: ['risk', 'letter', 'scope', 'guard', 'peek'], debuffs: ['flip', 'torch', 'sticky', 'noclock', 'bubbles'] }),
      title: 'Сили 12h',
    },
    { ...makeRoundsQuiz([round()], { leaderboard: 'each' }), title: 'Стара 12h' },
    {
      ...makeRoundsQuiz([classicRound('g1', [h1, h4] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false, rules })], {
        leaderboard: 'each',
        newcomers: true,
        buffs: [...allBuffs],
        debuffs: [...allDebuffs],
      }),
      title: 'Гайд 12h',
      // «Заміна запитання» потребує запасних.
      spares: [{ ...h4!, id: 's1', text: 'Яка річка тече через Чернівці?', options: ['Прут', 'Дунай', 'Тиса', 'Сян'].map((text, i) => ({ id: 'abcd'[i]!, text })) }],
    },
  ];
  for (const data of quizzes) {
    const saved = await host.request.post(`${base}/api/quizzes`, { data });
    expect(saved.ok(), await saved.text()).toBe(true);
  }

  const stage = await open('stage12h', 1280, 720);
  const stageFrames = socketFrames(stage);
  const olya = await open('olya12h', 375, 812);
  const petro = await open('petro12h', 375, 812);
  const ira = await open('ira12h', 375, 812, { reducedMotion: 'reduce' });
  const phones = [olya, petro, ira];
  const all = [host, stage, ...phones];

  /** Нова гра з вікторини title: сцена й телефони players. */
  const launch = async (title: string, players: [Page, string][]) => {
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Грати', ...exact }).click();
    await host.waitForURL(/\/host\/\d{6}$/);
    const code = host.url().slice(-6);
    await stage.goto((await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
    await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
    for (const [page, nickname] of players) await join(page, code, nickname, false);
    for (const [, nickname] of players) await stage.getByText(nickname, exact).first().waitFor();
  };

  const zone = (page: Page) => page.locator('.debuff-zone');
  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const tool = async (nickname: string) => {
    const button = row(nickname).getByRole('button', { name: 'Дебаф', ...exact });
    await button.waitFor();
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await row(nickname).locator('.player-tools').waitFor();
  };
  const picks = async (nickname: string) => (await row(nickname).locator('.player-tools .debuff-picks button').allTextContents()).map(squash);
  const cast = async (nickname: string, name: string) => {
    await tool(nickname);
    await row(nickname).locator('.player-tools').getByRole('button', { name: new RegExp(name) }).click();
    await row(nickname).locator('.debuff-tag').waitFor();
  };
  const score = async (nickname: string) => Number((await row(nickname).locator('.score').first().textContent())!.replace('−', '-').replace(/[^\d-]/g, ''));
  const scores = async () => ({ Оля: await score('Оля'), Петро: await score('Петро'), Іра: await score('Іра') });
  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  const accepted = (page: Page) => page.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first();
  const answerOption = async (page: Page, text: string) => {
    await pickOption(page, text);
    await accepted(page).waitFor();
  };
  const answerText = async (page: Page, text: string) => {
    await numericAnswer(page, text);
    await accepted(page).waitFor();
  };
  /** Усі відповіли: розкриття (onReveal — перевірки на ньому), таблиця. */
  const toTable = async (onReveal?: () => Promise<void>) => {
    await host.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
    await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
    if (onReveal) await onReveal();
    await step('Далі');
    await host.getByRole('button', { name: /^(Наступне запитання|Далі)$/ }).waitFor();
  };
  const question = async (text: string) => {
    await step('Наступне запитання');
    await afterSplash(...all);
    await stage.getByText(text, exact).waitFor();
  };
  const banner = (page: Page) => page.locator('.debuff-banner');
  const buffIcons = async (page: Page) => (await page.locator('.buff-row button').allTextContents()).map(squash);
  const stageBuffs = async () => (await stage.locator('.stage-buffs li').allTextContents()).map(squash).sort();

  // ── Підготовка: «Сили 12h», ведучий на заставці раунду насилає Ірі «Догори дриґом». ──
  await launch('Сили 12h', [
    [olya, 'Оля'],
    [petro, 'Петро'],
    [ira, 'Іра'],
  ]);
  await step('Почати гру');
  await afterSplash(...all);
  await host.getByRole('button', { name: 'Почати раунд', ...exact }).waitFor();
  await tool('Іра');
  expect(await picks('Іра'), 'only the allowed debuffs on the host').toEqual(['🙃 Догори дриґом', '🔦 Ліхтарик', '🍯 Липкі кнопки', '⌛ Без годинника', '🫧 Бульбашки']);
  expect(await host.evaluate(HEADER_ONE_LINE), 'p12h-host-debuffs: the host header wraps').toBe(true);
  await expectNoSideScroll(host, 'p12h-host-debuffs');
  await cast('Іра', 'Догори дриґом');

  // ── 1. h1: «Ризик» і «Догори дриґом». ──
  await step('Почати раунд');
  await afterSplash(...all);
  await stage.getByText(h1!.text, exact).waitFor();
  for (const page of phones) {
    await page.locator('.buff-row').waitFor();
    expect(await buffIcons(page)).toEqual(['⚄', 'А…', '◎', '∞', '◉']);
  }
  await expectNoSideScroll(olya, 'p12h-buff-row');
  await tapBuff(olya, 'Підглянути', 'Ще немає жодної відповіді.');
  await tapBuff(olya, 'Перша літера', 'Перша літера діє лише на тексті й «Хто я?».');
  expect(await buffButton(olya, 'Запобіжник').getAttribute('aria-disabled'), 'the safety catch is ready').not.toBe('true');
  await takeBuff(olya, 'Ризик');
  await takeBuff(petro, 'Ризик');
  await olya.locator('.buff-why').getByText('⚄ Ризик: правильно — ×3, помилка чи мовчання — мінус повна ціна', exact).waitFor();
  await shot(olya, 'p12h-risk');
  await expect.poll(stageBuffs, POLL).toEqual(['⚄ Оля', '⚄ Петро'].sort());
  await expectStageInView(stage, 'p12h-stage-risk');
  await shot(stage, 'p12h-stage-risk');

  // Іра: усе догори дриґом, без руху («Зменшити рух»).
  await expect.poll(() => zone(ira).getAttribute('class'), POLL).toMatch(/is-flip/);
  expect(await zone(ira).getAttribute('class')).toMatch(/is-calm/);
  const flip = (await ira.evaluate(
    `(() => { const s = getComputedStyle(document.querySelector('.debuff-content')); return { rotate: s.rotate, transition: s.transitionDuration }; })()`,
  )) as { rotate: string; transition: string };
  expect(flip.rotate).toBe('180deg');
  expect(flip.transition).toBe('0s');
  await banner(ira).getByText('Тримайтеся: усе догори дриґом').waitFor();
  await expectNoSideScroll(ira, 'p12h-flip');
  await answerOption(ira, 'Дніпро');
  await answerOption(olya, 'Дніпро');
  await answerOption(petro, 'Дністер');
  await toTable();
  expect(await scores()).toEqual({ Оля: 300, Петро: -100, Іра: 100 });

  // ── 2. Між h1 і h2: крамниця Олі й «Ліхтарик» від ведучого. ──
  const shop = olya.getByRole('dialog', { name: 'Дебафи для суперників' });
  await olya.getByRole('button', { name: 'Дебафи', ...exact }).click();
  await shop.waitFor();
  const shopNames = (await shop.locator('.shop-item').allTextContents()).map(squash);
  expect(shopNames).toHaveLength(5);
  for (const [at, name] of ['Догори дриґом', 'Ліхтарик', 'Липкі кнопки', 'Без годинника', 'Бульбашки'].entries()) expect(shopNames[at]).toContain(name);
  expect(await shop.locator('.shop-item-price').allTextContents()).toEqual(['200', '200', '200', '200', '200']);
  await shop.locator('.shop-item', { hasText: /Липкі кнопки/ }).click();
  await shop.locator('.shop-target', { hasText: 'Петро' }).click();
  await expectNoSideScroll(olya, 'p12h-shop');
  await shop.getByRole('button', { name: 'Купити за 200', ...exact }).click();
  await shop.waitFor({ state: 'detached' });
  await expect.poll(() => score('Оля'), POLL).toBe(100);
  await row('Петро').locator('.debuff-tag').waitFor();
  await cast('Іра', 'Ліхтарик');
  expect(await host.evaluate(HEADER_ONE_LINE), 'the host header wraps between questions').toBe(true);

  // ── 3. h2: «Ліхтарик», «Перша літера», «Підглянути», «Липкі кнопки». ──
  await question(h2!.text);
  await expect.poll(() => zone(ira).getAttribute('class'), POLL).toMatch(/is-torch/);
  await ira.locator('.debuff-torch').waitFor({ state: 'attached' });
  expect(await ira.evaluate(COVERED('.debuff-torch')), 'the torch covers the zone').toBeGreaterThan(0.95);
  await shot(ira, 'p12h-torch');
  await answerText(ira, 'Леся Українка');

  await takeBuff(olya, 'Перша літера');
  await expect.poll(async () => squash(await olya.locator('.letter-hint').textContent()), POLL).toBe('Л _ _ _ · _ _ _ _ _ _ _ _ (12)');
  {
    const hint = (await olya.locator('.letter-hint').boundingBox())!;
    expect(hint.x + hint.width, 'the letter mask is wider than the phone').toBeLessThanOrEqual(375);
  }
  await olya.locator('.buff-why').getByText('А… Перша літера: бали — 75 %', exact).waitFor();
  await expectNoSideScroll(olya, 'p12h-letter');

  await buffButton(petro, 'Підглянути').click();
  await petro.locator('.buff-why').getByText('Ще раз — узяти «Підглянути»', exact).waitFor();
  await buffButton(petro, 'Підглянути').click();
  const peekSheet = petro.getByRole('dialog', { name: 'Чию відповідь підглянути?' });
  await peekSheet.waitFor();
  expect((await peekSheet.locator('button.peek-option').allTextContents()).map(squash)).toEqual(['Іра']);
  await expectNoSideScroll(petro, 'p12h-peek-sheet');
  await peekSheet.locator('button.peek-option', { hasText: 'Іра' }).click();
  await peekSheet.waitFor({ state: 'detached' });
  await expect.poll(async () => squash(await petro.locator('.peek-answer').textContent()), POLL).toBe('👀 Іра: Леся Українка');
  expect(squash(await zone(petro).textContent()), 'a verdict next to the peek').not.toMatch(/правильн/i);
  {
    // Рядок підгляду не налазить на поле відповіді.
    const line = (await petro.locator('.peek-answer').boundingBox())!;
    const input = (await field(petro, 'Ваша відповідь').boundingBox())!;
    expect(line.y + line.height <= input.y + 1 || line.y >= input.y + input.height - 1, 'the peek line covers the answer field').toBe(true);
  }
  await shot(petro, 'p12h-peek');
  await ira.locator('.live-notices .live-notice.is-peek').getByText('👀 У вашу відповідь підглянули: Петро', exact).waitFor();
  await shot(ira, 'p12h-peeked');
  await stage.locator('.live-notice.is-buff').getByText('👀 Підгляд: Петро → Іра', exact).waitFor();
  await olya.locator('.live-notice.is-buff').getByText('👀 Підгляд: Петро → Іра', exact).waitFor();
  expect(await petro.locator('.live-notice.is-buff').count(), 'the taker gets the own notice').toBe(0);
  await expect.poll(stageBuffs, POLL).toEqual(['А… Оля', '◉ Петро → Іра'].sort());
  await stage.waitForTimeout(300); // сповіщення проявляється 0,25 с
  await expectStageInView(stage, 'p12h-stage-peek');
  await shot(stage, 'p12h-stage-peek');

  // Петро під «Липкими кнопками»: перший дотик «Відповісти» лише липне, другий відповідає.
  expect(await zone(petro).getAttribute('class')).toMatch(/is-sticky/);
  await field(petro, 'Ваша відповідь').fill('Леся Українка');
  await click(petro, 'Відповісти');
  await expect.poll(async () => squash(await petro.locator('p.sticky-note').textContent()), POLL).toBe('Ой, липко!');
  expect(await accepted(petro).count(), 'the first tap answered').toBe(0);
  await shot(petro, 'p12h-sticky');
  await click(petro, 'Відповісти');
  await accepted(petro).waitFor();
  await answerText(olya, 'Леся Українка');
  await host.getByText('Запитання закрите').waitFor();
  expect(stageFrames.join(NL), 'the stage received the peeked answer before the reveal').not.toContain('Леся Українка');
  await toTable(async () => {
    await host.locator('.buff-tag', { hasText: 'А…' }).first().waitFor();
    await host.locator('.buff-tag', { hasText: '◉' }).first().waitFor();
    await expectNoSideScroll(host, 'p12h-host-live');
  });
  expect(await scores()).toEqual({ Оля: 225, Петро: 0, Іра: 250 });

  // ── 4. h3: «Без годинника», «Бінокль», «Запобіжник». ──
  await cast('Оля', 'Без годинника');
  await question(h3!.text);
  await expect.poll(() => zone(olya).getAttribute('class'), POLL).toMatch(/is-noclock/);
  expect(await olya.locator('.question-head [role="timer"]').count(), 'a timer under «Без годинника»').toBe(0);
  await olya.getByRole('img', { name: /^Годинник сховано/ }).first().waitFor();
  await shot(olya, 'p12h-noclock');
  await takeBuff(olya, 'Бінокль');
  await olya.locator('.scope-hint').waitFor();
  const [from, to] = numbersIn(squash(await olya.locator('.scope-hint').textContent()));
  expect(squash(await olya.locator('.scope-hint').textContent())).toMatch(/^Відповідь між /);
  // Межі прилипають до кроку назовні: 60 років, або 61, коли межа випала посеред року.
  expect(to! - from!, `range ${from}..${to}`).toBeGreaterThanOrEqual(60);
  expect(to! - from!, `range ${from}..${to}`).toBeLessThanOrEqual(61);
  expect(from!).toBeLessThanOrEqual(1615);
  expect(to!).toBeGreaterThanOrEqual(1615);
  await olya.locator('.slider-input .slider-track .slider-band').waitFor();
  await expectNoSideScroll(olya, 'p12h-scope');
  await olya.getByRole('slider', { name: 'Повзунок', ...exact }).fill('1615');
  await click(olya, 'Відповісти');
  await accepted(olya).waitFor();
  await takeBuff(ira, 'Запобіжник');
  await ira.locator('.buff-why').getByText('∞ Запобіжник: помилка не обірве серію', exact).waitFor();
  await ira.getByRole('slider', { name: 'Повзунок', ...exact }).fill('1700');
  await shot(ira, 'p12h-guard');
  await click(ira, 'Відповісти');
  await accepted(ira).waitFor();
  await click(petro, 'Відповісти');
  await accepted(petro).waitFor();
  await toTable();
  expect(await scores()).toEqual({ Оля: 375, Петро: 0, Іра: 250 });

  // ── 5. h4: «Бульбашки». ──
  await cast('Петро', 'Бульбашки');
  await question(h4!.text);
  await expect.poll(() => zone(petro).getAttribute('class'), POLL).toMatch(/is-bubbles/);
  const bubbles = petro.locator('button.debuff-bubble:not(.is-popped)');
  await expect.poll(() => bubbles.count(), POLL).toBe(12);
  expect(await petro.getByRole('button', { name: 'Лопнути бульбашку', ...exact }).count()).toBe(12);
  expect(await petro.locator('fieldset button.debuff-bubble').count(), 'bubbles inside the fieldset').toBe(0);
  await shot(petro, 'p12h-bubbles');
  // Дотик варіанта під бульбашкою лопає бульбашку, а не відповідає.
  let over = (await petro.evaluate(BUBBLES_OVER('Чернівці'))) as { x: number; y: number }[];
  for (const text of ['Ужгород', 'Луцьк', 'Рівне']) if (over.length === 0) over = (await petro.evaluate(BUBBLES_OVER(text))) as { x: number; y: number }[];
  expect(over.length, 'no bubble over any option').toBeGreaterThan(0);
  await petro.mouse.click(over[0]!.x, over[0]!.y);
  await expect.poll(() => bubbles.count(), POLL).toBe(11);
  expect(await accepted(petro).count(), 'a tap through a bubble answered').toBe(0);
  for (let i = 0; i < 12; i++) {
    const left = (await petro.evaluate(BUBBLES_OVER('Чернівці'))) as { x: number; y: number }[];
    if (left.length === 0) break;
    const before = await bubbles.count();
    await petro.mouse.click(left[0]!.x, left[0]!.y);
    await expect.poll(() => bubbles.count(), POLL).toBe(before - 1);
  }
  await shot(petro, 'p12h-bubbles-popped');
  await answerOption(petro, 'Чернівці');
  await answerOption(olya, 'Чернівці');
  await answerOption(ira, 'Чернівці');
  // Останнє запитання: «Далі» з розкриття веде одразу до кінця гри.
  await host.getByText('Запитання закрите').waitFor();
  await step('Показати відповідь');
  await expect.poll(scores, POLL).toEqual({ Оля: 525, Петро: 100, Іра: 400 });
  await step('Далі');
  await afterSplash(...all);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor({ timeout: 15_000 });
  await expectStageFits(stage, 'p12h-stage-final');
  await shot(stage, 'p12h-stage-final');

  // ── 6. Редактор: 13 бафів і 11 дебафів; стара вікторина — шість старих. ──
  const powersOf = async (title: string) => {
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: title }).getByRole('link', { name: 'Редагувати' }).click();
    await host.locator('details.powers > summary').click();
    const checked = async (group: number) => {
      const items = host.locator('fieldset.powers-group').nth(group).locator('label.powers-item');
      const on: string[] = [];
      for (let i = 0; i < (await items.count()); i++) if (await items.nth(i).locator('input').isChecked()) on.push(squash(await items.nth(i).textContent()));
      return { total: await items.count(), on };
    };
    return { debuffs: await checked(0), buffs: await checked(1) };
  };
  const fresh = await powersOf('Сили 12h');
  expect(fresh.debuffs.total).toBe(11);
  // 29h додав 14-й баф «Прихований напад»: у редакторі тепер 14 бафів.
  expect(fresh.buffs.total).toBe(14);
  expect(fresh.debuffs.on.length).toBe(5);
  for (const [at, name] of ['Догори дриґом', 'Ліхтарик', 'Липкі кнопки', 'Без годинника', 'Бульбашки'].entries()) expect(fresh.debuffs.on[at]).toContain(name);
  expect(fresh.buffs.on.length).toBe(5);
  for (const [at, name] of ['Ризик', 'Перша літера', 'Бінокль', 'Запобіжник', 'Підглянути'].entries()) expect(fresh.buffs.on[at]).toContain(name);
  await expectNoSideScroll(host, 'p12h-editor');
  const old = await powersOf('Стара 12h');
  expect(old.debuffs.total).toBe(11);
  expect(old.debuffs.on.length, `old quiz debuffs: ${old.debuffs.on.join(', ')}`).toBe(6);
  for (const name of ['Догори дриґом', 'Ліхтарик', 'Липкі кнопки', 'Без годинника', 'Бульбашки']) expect(old.debuffs.on.join(' | ')).not.toContain(name);
  expect(old.buffs.on).toEqual([]);
  await expectNoSideScroll(host, 'p12h-editor-old');

  // ── 7. Стара вікторина в грі: на пульті шість дебафів без нових. ──
  await launch('Стара 12h', [[olya, 'Оля']]);
  await step('Почати гру');
  await afterSplash(host, stage, olya);
  await tool('Оля');
  const oldPicks = await picks('Оля');
  expect(oldPicks).toHaveLength(6);
  expect(oldPicks.join(' | ')).not.toMatch(/Бульбашки|Догори|Ліхтарик|Липкі|Без годинника/);

  // ── 8. «Гайд 12h»: 13 бафів і 11 дебафів у «Як грати» на сцені 1280 × 720, на телефоні й на пульті 375. ──
  await launch('Гайд 12h', [[olya, 'Оля']]);
  await step('Почати гру');
  const seen = new Set<string>();
  for (let page = 0; page < 10 && seen.size < 2; page++) {
    await stage.locator('.guide-title').first().waitFor();
    const title = squash(await stage.locator('.guide-title').first().textContent());
    const kind = title.startsWith('Бафи') ? 'buffs' : title.startsWith('Дебафи') ? 'debuffs' : null;
    if (kind !== null) {
      await expect.poll(() => stage.locator('.guide-items.is-many .guide-item').count(), POLL).toBe(kind === 'buffs' ? 13 : 11);
      await shot(stage, `p12h-guide-${kind}`);
      // GUIDE FIT: густа сторінка «Як грати» в 1280 × 720 без прокрутки.
      const height = (await stage.evaluate('document.scrollingElement.scrollHeight')) as number;
      expect(await stage.evaluate(GUIDE_FITS), `GUIDE FIT p12h-guide-${kind}: the stage scrolls (${height}px)`).toBe(true);
      await olya.locator('.guide-items .guide-item').first().waitFor();
      await expectNoSideScroll(olya, `p12h-guide-${kind}-phone`);
      seen.add(kind);
    }
    if (seen.size < 2) {
      await step('Далі');
      await stage.locator('.guide-title', { hasNotText: title }).first().waitFor();
    }
  }
  expect([...seen].sort()).toEqual(['buffs', 'debuffs']);
  await step('До гри');
  await afterSplash(host, stage, olya);
  await step('Почати раунд');
  await afterSplash(host, stage, olya);
  await olya.locator('.buff-row').waitFor();
  expect(await olya.locator('.buff-row button').count()).toBe(13);
  const rightmost = (await olya.evaluate(`Math.max(...[...document.querySelectorAll('.buff-row button')].map((b) => b.getBoundingClientRect().right))`)) as number;
  expect(rightmost, 'a buff button off the 375 phone').toBeLessThanOrEqual(375);
  await expectNoSideScroll(olya, 'p12h-buff-row-13');
  await tool('Оля');
  expect(await picks('Оля')).toHaveLength(11);
  expect(await host.evaluate(HEADER_ONE_LINE), 'p12h-host-debuffs-11: the host header wraps').toBe(true);
  await expectNoSideScroll(host, 'p12h-host-debuffs-11');

  expect(problems).toEqual([]);
}

it('part 12h: new buffs and debuffs — on 375 phones Оля risks and wins ×3 while Петро risks and loses 100 with no penalty round, Іра answers upside down with reduced motion, then under a torch, Петро peeks at Іра and sees «Леся Українка» with no verdict while Іра reads «👀 У вашу відповідь підглянули: Петро» and the 1280 × 720 stage says «👀 Підгляд: Петро → Іра», Оля gets «Л _ _ _ · _ _ _ _ _ _ _ _ (12)» and 75 %, sticky buttons say «Ой, липко!», the binoculars give a 60-year range with 1615 inside, the safety catch keeps Іра on a streak, the clock vanishes, twelve bubbles pop one by one, the editor shows thirteen buffs and eleven debuffs and an old quiz keeps six, the guide pages with thirteen and eleven items fit the stage, and thirteen buffs fit a 375 phone', async () => {
  try {
    await powers12h();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

function achievementQuestions12i() {
  const common = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  return [
    { ...common, id: 'i1', type: 'single' as const, text: 'Яка річка тече через Київ?', options: options('Дніпро', 'Дністер', 'Десна', 'Південний Буг'), correctId: 'a' },
    { ...common, id: 'i2', type: 'single' as const, text: 'Яке місто — столиця Буковини?', options: options('Чернівці', 'Ужгород', 'Луцьк', 'Рівне'), correctId: 'a' },
  ];
}

/** Картка ачівки з назвою name на сторінці ачівок (12i); заголовок закритої ще й каже читачеві екрана «, ще не отримано» (Chromium ставить перед прихованим span пробіл). */
const achievementCard = (page: Page, name: string) =>
  page.locator('.achievement-card', { has: page.getByRole('heading', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*, ще не отримано)?$`) }) });

/** Сьогоднішня дата так, як її пише сторінка ачівок: «29 жовтня 2026», за Києвом. */
const todayOn = async (page: Page) =>
  ((await page.evaluate(
    `new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv' }).format(new Date())`,
  )) as string).replace(/\s*р\.$/, '');

async function achievements12i() {
  const host = await open('host12i', 1280, 800);
  await register(host, 'host', 'Ліна Ведуча', 'host12i@example.com');
  const questions = achievementQuestions12i();
  const data = {
    ...makeRoundsQuiz([classicRound('r1', questions as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]),
    title: 'Досягнення 12i',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  const olya = await open('olya12i', 375, 812);
  await register(olya, 'menu', 'Оля Квіткова', 'olya12i@example.com');
  const olyaProfile = (await (await olya.request.get(`${base}/api/me/profile`)).json()) as { id: string; nickname: string };
  const olyaId = olyaProfile.id;

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Досягнення 12i' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  await join(olya, code, 'Оля', false);
  const petro = await open('petro12i', 375, 812);
  await join(petro, code, 'Петро', false);
  await host.getByText('Петро', exact).first().waitFor();

  const step = async (name: string) => {
    const button = host.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };

  // ── 1. Гра: Оля відповідає одразу й правильно, Петро — ні. ──
  await step('Почати гру');
  await afterSplash(host, olya, petro);
  await step('Почати раунд');
  await afterSplash(host, olya, petro);
  await pickOption(olya, 'Дніпро');
  await pickOption(petro, 'Дністер');
  await step('Показати відповідь');
  await step('Далі');
  await step('Наступне запитання');
  await afterSplash(host, olya, petro);
  await pickOption(olya, 'Чернівці');
  await pickOption(petro, 'Ужгород');
  await step('Показати відповідь');
  const finished = host.getByText('Гру завершено').first();
  for (let i = 0; i < 6 && !(await finished.isVisible()); i++) {
    await step('Далі').catch(() => undefined);
    await afterSplash(host);
  }
  await finished.waitFor();

  // ── 2. Нагорода записана після фінішу. ──
  const ownPage = async () => (await (await olya.request.get(`${base}/api/me/achievements`)).json()) as AchievementsPage;
  await expect.poll(async () => (await ownPage()).items.find((i) => i.id === 'fast_answer')?.earned, POLL).toBe(true);

  // ── 3. Меню з п'ятьма пунктами (23a); «Досягнення» — плитка профілю. ──
  await olya.goto(base);
  await olya.locator(MENU).getByRole('link', { name: 'Профіль' }).waitFor();
  expect((await olya.locator(MENU).getByRole('link').allTextContents()).map((text) => text.replace(/[^\p{L}\s’]/gu, '').trim())).toEqual(MENU_ITEMS_23A);
  await expectNoSideScroll(olya, 'p12i-menu');
  // Підпис у два рядки («Мої вікторини») не робить нижню панель вищою: --menu-h = 60 px.
  expect((await olya.locator(MENU).boundingBox())!.height, 'the 375 menu grows taller').toBeLessThanOrEqual(60.5);
  await openProfileTile(olya, 'Досягнення');
  await olya.waitForURL(`${base}/profile/achievements`);

  // ── 4. Сторінка на телефоні. ──
  await olya.getByRole('heading', { level: 1, name: 'Досягнення', exact: true }).waitFor();
  const count = (await olya.locator('.achievements-count').textContent())!;
  const earnedCount = Number(count.match(/^Отримано (\d+) з 71$/)?.[1]);
  expect(earnedCount, count).toBeGreaterThanOrEqual(3);
  expect(await olya.locator('section.achievement-group h2').allTextContents()).toEqual([
    'Перші кроки',
    'Влучність',
    'Швидкість',
    'Формати',
    'Бафи й дебафи',
    'Компанія',
    'Ведення й авторство',
    // 12j: група антидосягнень — остання, поки що сірі неотримані.
    'Антидосягнення',
  ]);
  const today = await todayOn(olya);
  const fast = achievementCard(olya, 'Швидкі пальці');
  expect(await fast.getAttribute('class')).not.toContain('is-locked');
  await fast.getByText('Відповідь є, а запитання ще не дочитане. Сміливо!', exact).waitFor();
  await fast.getByText('Правильна відповідь швидше ніж за 2 с', exact).waitFor();
  await fast.getByText(`Отримано ${today}`, exact).waitFor();
  for (const name of ['Перша гра', 'Перша перемога']) expect(await achievementCard(olya, name).getAttribute('class')).not.toContain('is-locked');
  const ten = achievementCard(olya, '10 ігор');
  expect(await ten.getAttribute('class')).toContain('is-locked');
  expect(await ten.getByRole('heading').textContent()).toBe('10 ігор, ще не отримано');
  expect(await ten.getAttribute('aria-label')).toBeNull();
  expect(await ten.locator('progress').getAttribute('value')).toBe('1');
  await ten.getByText('1 / 10', exact).waitFor();
  await expectNoSideScroll(olya, 'p12i-page-phone');
  if (process.env.E2E_SHOTS === '1') {
    await olya.getByRole('heading', { level: 2, name: 'Швидкість' }).evaluate((h) => h.scrollIntoView({ block: 'start' }));
    await olya.screenshot({ path: resolve(ARTIFACTS, 'shots', 'p12i-page-phone-speed.png') });
  }

  // ── 5. Сторінка на 1280: кілька колонок. ──
  await olya.setViewportSize({ width: 1280, height: 800 });
  {
    const cards = olya.locator('section.achievement-group').first().locator('.achievement-card');
    const [a, b] = [(await cards.nth(0).boundingBox())!, (await cards.nth(1).boundingBox())!];
    expect(a.y, 'the first two cards on one row at 1280').toBe(b.y);
    expect(a.x).not.toBe(b.x);
  }
  await expectNoSideScroll(olya, 'p12i-page-desktop');
  await olya.setViewportSize({ width: 375, height: 812 });

  // ── 6. Профіль Олі: вітрина ачівок — до 5 квадратів (23a). ──
  await olya.goto(`${base}/profile`);
  await olya.locator('nav.profile-tiles').waitFor();
  const strip = olya.locator('.achievement-showcase .achievement-square');
  await strip.first().waitFor();
  const stripCount = await strip.count();
  expect(stripCount).toBeGreaterThanOrEqual(3);
  expect(stripCount).toBeLessThanOrEqual(5);
  expect(await olya.locator('.achievement-showcase').getByRole('button', { name: 'Швидкі пальці', ...exact }).count()).toBe(1);
  const more = olya.locator('.achievement-showcase .profile-section-head a');
  expect((await more.textContent())?.trim()).toBe('усі ›');
  expect(await more.getAttribute('href')).toBe('/profile/achievements');
  await expectNoSideScroll(olya, 'p12i-profile-strip');

  // ── 7. Чужа сторінка: лише отримані, без поступу. ──
  await host.goto(`${base}/profile/${olyaId}`);
  await host.locator('.achievement-showcase .achievement-square').first().waitFor();
  await host.locator('.achievement-showcase .profile-section-head a').click();
  await host.waitForURL(`${base}/profile/${olyaId}/achievements`);
  await host.getByRole('heading', { level: 1, name: `Досягнення: ${olyaProfile.nickname}` }).waitFor();
  await achievementCard(host, 'Швидкі пальці').waitFor();
  expect(await host.locator('.achievement-card.is-locked').count()).toBe(0);
  expect(await host.locator('.achievements-page progress').count()).toBe(0);
  expect(await achievementCard(host, '10 ігор').count()).toBe(0);
  await expectNoSideScroll(host, 'p12i-public-desktop');

  // ── 8. Своя сторінка ведучої: «За пультом» сьогодні. ──
  await host.goto(`${base}/achievements`);
  const desk = achievementCard(host, 'За пультом');
  await desk.waitFor();
  expect(await desk.getAttribute('class')).not.toContain('is-locked');
  await desk.getByText(`Отримано ${today}`, exact).waitFor();
  await expectNoSideScroll(host, 'p12i-host-own');

  // ── 9. API: чужа сторінка — лише отримані, анонім — 401. ──
  const publicPage = (await (await host.request.get(`${base}/api/profiles/${olyaId}/achievements`)).json()) as AchievementsPage;
  expect(publicPage.own).toBe(false);
  expect(publicPage.total).toBe(71);
  expect(publicPage.items.length).toBe(earnedCount);
  for (const item of publicPage.items) {
    expect(item.earned, item.id).toBe(true);
    expect(item.progress, item.id).toBeNull();
  }
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`${base}/api/me/achievements`)).status()).toBe(401);
  await anonymous.close();

  expect(problems).toEqual([]);
}

it('part 12i: achievements I — after Оля answers «Дніпро» in under two seconds on a 375 phone, «🏅 Досягнення» between «Історія» and «Профіль» opens «Отримано N з 71» with «Швидкі пальці» dated today, grey «10 ігор» at «1 / 10», the grey «Антидосягнення» group last, cards in several columns at 1280, the profile shows a row of the newest badges, the host sees only Оля’s earned cards with no progress on her public page and «За пультом» on own page, and an anonymous visitor gets 401', async () => {
  try {
    await achievements12i();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

/** Верх і висота елемента (px), округлені. */
const rectOf = (locator: Locator) =>
  locator.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { top: Math.round(box.top), height: Math.round(box.height) };
  });

it('backlog 3: blitz answer fields never move — a buzzer blitz keeps the queued field in place when the opponent before it is judged and the own answer window opens; an instant text blitz keeps the queue in place when the second player sends', async () => {
  try {
    const host = await open('host-b3', 1280, 900);
    await register(host, 'host', 'Ірина Ведуча', 'host-b3@example.com');
    const capital = { ...single, id: 'q-b3-1', timeLimit: 60 };
    const gold = { ...withId(textQ, 'q-b3-2'), text: 'Хімічний символ золота?', accepted: ['Au'], timeLimit: 60 };
    const silver = { ...withId(textQ, 'q-b3-3'), text: 'Хімічний символ срібла?', accepted: ['Ag'], timeLimit: 60 };
    const data = {
      ...makeRoundsQuiz([
        blitzRound('rb1', [capital, gold] as never, { title: 'Бліц з кнопкою', check: 'manual', attempts: 1, answerWindow: 20 }),
        blitzRound('rb2', [silver] as never, { title: 'Миттєвий бліц', check: 'auto', attempts: 1 }),
      ]),
      title: 'Бліц без стрибків',
    };
    const saved = await host.request.post(`${base}/api/quizzes`, { data });
    expect(saved.ok(), await saved.text()).toBe(true);
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: 'Бліц без стрибків' }).getByRole('button', { name: 'Грати', ...exact }).click();
    await host.waitForURL(/\/host\/\d{6}$/);
    const code = host.url().slice(-6);
    const olya = await open('olya-b3', 375, 812);
    const taras = await open('taras-b3', 375, 812);
    await join(olya, code, 'Оля', false);
    await join(taras, code, 'Тарас', false);
    await host.getByText('Тарас').first().waitFor();
    await click(host, 'Почати гру');
    await click(host, 'Почати раунд');

    for (const kind of ['choice', 'text'] as const) {
      // Оля перша: її відповідь чекає ведучого (помаранчева).
      await olya.getByRole('button', { name: 'Відповісти', ...exact }).waitFor();
      await click(olya, 'Відповісти');
      if (kind === 'choice') await olya.locator('fieldset.inputs').getByRole('button', { name: /Київ/ }).click();
      else {
        await olya.locator('fieldset.inputs').getByRole('textbox').fill('Ag');
        await olya.locator('fieldset.inputs').getByRole('button', { name: 'Відповісти', ...exact }).click();
      }
      await taras.locator('.choice.is-pending, .is-pending').first().waitFor();
      // Тарас тисне «Відповісти» другим: поле з'являється під відповіддю Олі.
      await click(taras, 'Відповісти');
      await taras.getByText('Ви 2-й у черзі').waitFor();
      const queued = await rectOf(taras.locator('fieldset.inputs'));
      await shot(taras, `b3-${kind}-queued`);
      // Ведучий: Оля неправильно — Тарас голова, його вікно відповіді відкривається.
      await click(host, 'Неправильно');
      await taras.getByText('Ви 1-й у черзі').waitFor();
      await taras.locator('.timer').first().waitFor();
      await shot(taras, `b3-${kind}-head`);
      expect(await rectOf(taras.locator('fieldset.inputs')), `the ${kind} field moves when Тарас becomes the head`).toEqual(queued);
      if (kind === 'choice') await taras.locator('fieldset.inputs').getByRole('button', { name: /Київ/ }).click();
      else {
        await taras.locator('fieldset.inputs').getByRole('textbox').fill('Au');
        await taras.locator('fieldset.inputs').getByRole('button', { name: 'Відповісти', ...exact }).click();
      }
      await click(host, 'Правильно');
      await click(host, 'Показати відповідь');
      await click(host, 'Далі');
      if (kind === 'choice') await click(host, 'Наступне запитання');
      else {
        await click(host, 'Наступний раунд');
        await click(host, 'Почати раунд');
      }
    }

    // Миттєвий бліц, текст: Оля надсилає першою, потім Тарас — черга в Тараса на місці.
    await olya.locator('fieldset.inputs').getByRole('textbox').waitFor();
    await olya.locator('fieldset.inputs').getByRole('textbox').fill('Ag');
    await olya.locator('fieldset.inputs').getByRole('button', { name: 'Відповісти', ...exact }).click();
    await taras.locator('.blitz-queue li', { hasText: 'Оля' }).waitFor();
    const queue = await rectOf(taras.locator('.blitz-queue'));
    await taras.locator('fieldset.inputs').getByRole('textbox').fill('Au');
    await taras.locator('fieldset.inputs').getByRole('button', { name: 'Відповісти', ...exact }).click();
    await taras.locator('.blitz-queue li', { hasText: 'Тарас' }).waitFor();
    await shot(taras, 'b3-instant-text-sent');
    expect(await rectOf(taras.locator('.blitz-queue')), 'the instant queue moves when Тарас sends a text answer').toEqual(queue);
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 300_000);

const PLUS_26B = 'Плюсова серія: кожна правильна поспіль дає на крок більше';
const MINUS_26B = 'Мінусова серія: кожна помилка поспіль знімає на крок більше';
/** Рядок серії на телефоні (26b) — рівно цей текст. */
async function seriesLine26b(page: Page, text: string) {
  await page.locator('.blitz-series', { hasText: text }).waitFor();
  expect(await page.locator('.blitz-series').textContent()).toBe(text);
}
/** Позначка серії в рядку гравця name (26b): сцена — таблиця, пульт — список гравців. */
async function seriesMark26b(rows: Locator, name: string, text: string) {
  const row = rows.filter({ has: rows.page().locator('.name', { hasText: name }) });
  await row.locator('.series', { hasText: text }).waitFor();
  expect(await row.locator('.series').textContent()).toBe(text);
}

it('part 26b: blitz streaks — a plus series grows by the step, a minus series takes a step more, the phone shows the next step, stage and host mark the series, the editor sets them', async () => {
  try {
    // ── Редактор: обидві серії з кроком, штраф тримається ввімкненим. ──
    const host = await open('host26b', 1280, 900);
    await register(host, 'host', 'Ірина Ведуча', 'host26b@example.com');
    await host.getByRole('link', { name: 'Нова вікторина' }).click();
    await field(host, 'Назва вікторини').fill('Серії в бліці');
    await click(host, '+ Раунд');
    await click(host, 'Бліц');
    await host.getByRole('button', { name: 'Раунд 1', ...exact }).click();
    await click(host, 'Видалити раунд');
    await openRoundSettings(host);
    await host.getByRole('checkbox', { name: PLUS_26B, ...exact }).check();
    await host.getByRole('checkbox', { name: MINUS_26B, ...exact }).check();
    const plusStep = host.getByRole('group', { name: PLUS_26B, ...exact }).getByLabel('Крок, балів', exact);
    expect(await plusStep.inputValue(), 'the default plus step').toBe('250');
    await plusStep.fill('250');
    expect(await host.getByRole('group', { name: MINUS_26B, ...exact }).getByLabel('Крок, балів', exact).inputValue(), 'the default minus step').toBe('250');
    const penalty = field(host, 'Штраф: мінус ціна запитання за хибну відповідь');
    expect(await penalty.isChecked(), 'the minus series turns the penalty on').toBe(true);
    expect(await penalty.isDisabled(), 'the penalty stays locked under the minus series').toBe(true);
    await host.getByText('Мінусова серія вже штрафує за помилки', exact).waitFor();
    // Плюсова серія замінює стару «Серії»: її перемикача немає.
    expect(await host.getByRole('checkbox', { name: 'Серії: бонус за правильні відповіді підряд', ...exact }).count()).toBe(0);
    const preview = host.locator('details.round-settings .round-brief-preview');
    await preview.getByText('серія: кожна правильна поспіль +250').waitFor();
    await preview.getByText('серія: кожна помилка поспіль −250').waitFor();
    await questionText(host).fill('Столиця України?');
    await field(host, 'Варіант 1').fill('Львів');
    await field(host, 'Варіант 2').fill('Київ');
    await field(host, 'Правильний: варіант 2').click();
    await shot(host, '26b-editor');
    await host.setViewportSize({ width: 375, height: 812 });
    await host.getByRole('checkbox', { name: MINUS_26B, ...exact }).scrollIntoViewIfNeeded();
    await expectFitsWidth13a(host, '26b-editor-phone');
    await expectNoSideScroll(host, '26b-editor-phone');
    await shot(host, '26b-editor-phone');
    await host.setViewportSize({ width: 1280, height: 900 });
    await click(host, 'Зберегти');
    await host.getByRole('heading', { name: 'Серії в бліці' }).waitFor();
    const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
    const editedId = list.find((entry) => entry.title === 'Серії в бліці')!.id;
    const stored = (await (await host.request.get(`${base}/api/quizzes/${editedId}`)).json()) as { rounds: { type: string; rules: Record<string, unknown> }[] };
    expect(stored.rounds).toHaveLength(1);
    expect(stored.rounds[0]!.type).toBe('blitz');
    expect(stored.rounds[0]!.rules).toMatchObject({ streakPlus: { step: 250 }, streakMinus: { step: 250 }, penalty: 'minus' });

    // ── Гра: три запитання по 500, бліц з кнопкою. ──
    const q1 = { ...single, id: 'q26b-1', points: 500, timeLimit: 60 };
    const q2 = {
      ...single,
      id: 'q26b-2',
      points: 500,
      timeLimit: 60,
      text: 'Найбільша річка України?',
      options: [
        { id: 'a', text: 'Дніпро' },
        { id: 'b', text: 'Дунай' },
        { id: 'c', text: 'Десна' },
      ],
      correctId: 'a',
    };
    const q3 = {
      ...single,
      id: 'q26b-3',
      points: 500,
      timeLimit: 60,
      text: 'Найвища гора України?',
      options: [
        { id: 'a', text: 'Петрос' },
        { id: 'b', text: 'Піп Іван' },
        { id: 'c', text: 'Говерла' },
      ],
      correctId: 'c',
    };
    // q4 — лише щоб телефони показали серію після q3 (рядок живе на відкритому запитанні); на нього не відповідають.
    const q4 = {
      ...single,
      id: 'q26b-4',
      points: 500,
      timeLimit: 60,
      text: 'Яке місто стоїть на Ужі?',
      options: [
        { id: 'a', text: 'Ужгород' },
        { id: 'b', text: 'Луцьк' },
        { id: 'c', text: 'Рівне' },
      ],
      correctId: 'a',
    };
    const data = {
      ...makeRoundsQuiz([
        blitzRound('r26b', [q1, q2, q3, q4] as never, {
          title: 'Бліц із серіями',
          check: 'manual',
          attempts: 1,
          answerWindow: 20,
          rules: { ...DEFAULT_RULES, partial: null, penalty: 'minus', streakPlus: { step: 250 }, streakMinus: { step: 250 } },
        }),
      ]),
      title: 'Бліц із серіями',
    };
    const saved = await host.request.post(`${base}/api/quizzes`, { data });
    expect(saved.ok(), await saved.text()).toBe(true);
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: 'Бліц із серіями' }).getByRole('button', { name: 'Грати', ...exact }).click();
    await host.waitForURL(/\/host\/\d{6}$/);
    const code = host.url().slice(-6);
    const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
    const stage = await open('stage26b', 1280, 720);
    await stage.goto(stageUrl);
    const olya = await open('olya26b', 375, 812);
    const taras = await open('taras26b', 375, 812);
    await join(olya, code, 'Оля', false);
    await join(taras, code, 'Тарас', false);
    await host.getByText('Тарас').first().waitFor();
    await click(host, 'Почати гру');
    await click(host, 'Почати раунд');

    const buzz = async (page: Page, option: string) => {
      await page.getByRole('button', { name: 'Відповісти', ...exact }).waitFor();
      await click(page, 'Відповісти');
      await page.locator('fieldset.inputs').getByRole('button', { name: new RegExp(option) }).click();
    };
    const hostRows = host.locator('.player-row');

    // q1 і q2: Тарас перший і помиляється, Оля відповідає правильно.
    // Рядок серії живе, поки запитання відкрите: після «Правильно» запитання закрите й телефон чекає розкриття.
    for (const [wrong, right] of [['Львів', 'Київ'], ['Дунай', 'Дніпро']] as const) {
      if (wrong === 'Дунай') {
        await olya.getByRole('button', { name: 'Відповісти', ...exact }).waitFor();
        await seriesLine26b(olya, 'Серія +1 · наступна правильна +750');
      }
      await buzz(taras, wrong);
      await click(host, 'Неправильно');
      // Помилка Тараса оцінена, а запитання ще відкрите для Олі: рядок уже з цим кроком.
      await seriesLine26b(taras, wrong === 'Львів' ? 'Серія −1 · наступна помилка −750' : 'Серія −2 · наступна помилка −1000');
      await buzz(olya, right);
      await click(host, 'Правильно');
      await click(host, 'Показати відповідь');
      await click(host, 'Далі');
      if (wrong === 'Дунай') {
        // Між запитаннями сцена показує таблицю з позначками серій.
        await seriesMark26b(stage.locator('.standings li'), 'Оля', 'Серія +2');
        await seriesMark26b(stage.locator('.standings li'), 'Тарас', 'Серія −2');
        await shot(stage, '26b-stage');
      }
      await click(host, 'Наступне запитання');
    }

    // q3 до відповідей: телефони кажуть наступний крок, пульт позначає серії.
    await olya.getByRole('button', { name: 'Відповісти', ...exact }).waitFor();
    await seriesLine26b(olya, 'Серія +2 · наступна правильна +1000');
    await seriesLine26b(taras, 'Серія −2 · наступна помилка −1000');
    await expectFitsWidth13a(olya, '26b-olya-plus');
    await expectFitsWidth13a(taras, '26b-taras-minus');
    await shot(olya, '26b-olya-plus');
    await shot(taras, '26b-taras-minus');
    await seriesMark26b(hostRows, 'Оля', 'Серія +2');
    await seriesMark26b(hostRows, 'Тарас', 'Серія −2');
    await shot(host, '26b-host');

    // q3: Оля не тисне; Тарас відповідає правильно — мінус обнуляється, плюс з першого кроку.
    await buzz(taras, 'Говерла');
    await click(host, 'Правильно');
    // Пульт бачить серію наживо; телефон Тараса — з наступного відкритого запитання (q4 нижче).
    await seriesMark26b(hostRows, 'Тарас', 'Серія +1');
    await seriesMark26b(hostRows, 'Оля', 'Серія +2');
    await click(host, 'Показати відповідь');

    // Рахунок: Оля 500 + 750, Тарас −500 − 750 + 500.
    const score = (name: string) => hostRows.filter({ has: host.locator('.name', { hasText: name }) }).locator('.score');
    await expect.poll(() => score('Оля').textContent(), POLL).toBe('1250');
    await expect.poll(() => score('Тарас').textContent(), POLL).toBe('−750');
    await click(host, 'Далі');
    const stageScore = (name: string) => stage.locator('.standings li', { has: stage.locator('.name', { hasText: name }) }).locator('.score');
    await expect.poll(() => stageScore('Оля').textContent(), POLL).toBe('1250');
    await expect.poll(() => stageScore('Тарас').textContent(), POLL).toBe('−750');
    await seriesMark26b(stage.locator('.standings li'), 'Тарас', 'Серія +1');
    await seriesMark26b(stage.locator('.standings li'), 'Оля', 'Серія +2');
    await shot(stage, '26b-stage-after-q3');

    // q4 (без відповідей, рахунку не змінює): телефони показують серії після q3.
    await click(host, 'Наступне запитання');
    await taras.getByRole('button', { name: 'Відповісти', ...exact }).waitFor();
    await seriesLine26b(taras, 'Серія +1 · наступна правильна +750');
    await seriesLine26b(olya, 'Серія +2 · наступна правильна +1000');
    await shot(taras, '26b-taras-plus');
    expect(problems).toEqual([]);
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 26c: a word ladder — one-letter moves checked by the dictionary, step back, only counts on the stage, the fewest steps win', async () => {
  try {
    await wordLadderGame26c();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

/** Поле вводу драбини на телефоні (підпис мовою телефона). */
const ladderInput26c = (page: Page) => page.locator('.wordladder-form input');
/** Слова стовпчика драбини, як у DOM (без text-transform). */
const ladderColumn26c = (page: Page) => page.locator('.wordladder-play .wordladder-column li:not(.is-next)').allTextContents();

/** Вводить слово драбини й тисне «Додати» (кнопку submit форми, тож і на іншій мові). Прийняте — поле очищується або форма зникає (фініш). */
async function ladderMove26c(page: Page, word: string, refusal?: string) {
  await ladderInput26c(page).fill(word);
  await page.locator('.wordladder-form button[type="submit"]').click();
  if (refusal === undefined) {
    await page.waitForFunction("(() => { const input = document.querySelector('.wordladder-form input'); return input === null || input.value === ''; })()");
    // Після фінішу форми з рядком причини вже немає.
    expect(await page.evaluate("document.querySelector('.wordladder-status')?.textContent ?? ''"), `«${word}» refused`).toBe('');
  } else {
    await expect.poll(() => page.locator('.wordladder-status').textContent(), POLL).toBe(refusal);
  }
}

/** Поле вводу на телефоні не сховане: у межах ширини, а після прокрутки до нього — у видимій частині. */
async function expectLadderInputShown26c(page: Page, name: string) {
  const input = ladderInput26c(page);
  await input.scrollIntoViewIfNeeded();
  const box = (await input.boundingBox())!;
  const [width, height] = (await page.evaluate('[innerWidth, innerHeight]')) as [number, number];
  expect(box.x, `${name}: the input starts off the screen`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${name}: the input runs past the right edge`).toBeLessThanOrEqual(width + 1);
  expect(box.y + box.height, `${name}: the input stays below the screen`).toBeLessThanOrEqual(height + 1);
  const buttons = await page.locator('.wordladder-actions .btn').evaluateAll((all) => all.map((b) => ({ right: b.getBoundingClientRect().right, height: b.getBoundingClientRect().height })));
  expect(Math.max(...buttons.map((b) => b.right)), `${name}: a button runs past the right edge`).toBeLessThanOrEqual(width + 1);
  // «Крок назад» не переноситься на другий рядок: обидві кнопки однієї висоти в один рядок.
  expect(Math.max(...buttons.map((b) => b.height)), `${name}: a button label wraps`).toBeLessThan(60);
}

async function wordLadderGame26c() {
  // ── Редактор: ПОЛЕ → ПОЛА → ПОРА → ПАРА → ТАРА, максимум 8, ціна 500, 90 с. ──
  const host = await open('host26c', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host26c@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Драбина слів');
  await click(host, 'драбина слів');
  await questionText(host).fill('Від поля до тари');
  expect(await host.getByLabel('Відео з YouTube', exact).count(), 'a word ladder has no video').toBe(0);
  await field(host, 'Стартове слово').fill('ПОЛЕ');
  await field(host, 'Крок 1').fill('поси');
  await field(host, 'Цільове слово').fill('ТАРА');
  expect(await field(host, 'Найбільше кроків').inputValue(), 'the default maximum').toBe('8');
  await field(host, 'Найбільше кроків').fill('8');
  await field(host, 'Бали').fill('500');
  await field(host, 'Час, с').fill('90');
  // «поси» ламає крок: збереження називає проблему, вікторина не зберігається.
  await click(host, 'Зберегти');
  await host.getByText('Запитання 1: кожне наступне слово має відрізнятися від попереднього рівно однією літерою.', exact).first().waitFor();
  await field(host, 'Крок 1').fill('ПОЛА');
  await click(host, 'Додати слово');
  await field(host, 'Крок 2').fill('ПОРА');
  await click(host, 'Додати слово');
  // Після останньої зміни редактор питає словник; усі слова шляху в словнику — попередження немає.
  const checked = host.waitForResponse((response) => response.url().endsWith('/api/wordladder/check'));
  await field(host, 'Крок 3').fill('ПАРА');
  const check = await checked;
  expect(check.ok()).toBe(true);
  expect(await check.json()).toEqual({ unknown: [] });
  await host.waitForTimeout(200);
  expect(await host.locator('.wordladder-unknown').textContent(), 'a dictionary warning for a valid path').toBe('');
  await shot(host, 'wordladder26c-editor');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Драбина слів' }).waitFor();
  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Драбина слів')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { type: string; questions: Record<string, unknown>[] }[] };
  expect(stored.rounds[0]!.type).toBe('classic');
  expect(stored.rounds[0]!.questions[0]).toMatchObject({ type: 'wordladder', path: ['ПОЛЕ', 'ПОЛА', 'ПОРА', 'ПАРА', 'ТАРА'], maxSteps: 8, points: 500, timeLimit: 90, video: null });

  // ── Гра: сцена 1600 × 900, телефони Олі, Тараса, Іри, Хосе (es) і Віри (ar, 320 × 568). ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage26c', 1600, 900);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya26c', 375, 812);
  const taras = await open('taras26c', 360, 740);
  const ira = await open('ira26c', 360, 740);
  const jose = await open('jose26c', 320, 640, { locale: 'es-ES' });
  const vira = await open('vira26c', 320, 568, { locale: 'ar-EG' });
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(ira, code, 'Іра', false);
  await join22a(jose, es, code, 'Хосе');
  await join22a(vira, ar, code, 'Віра');
  await stage.getByText('Віра').waitFor();
  const phones = [olya, taras, ira, jose, vira];
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await ladderInput26c(page).waitFor();

  // Сцена: старт → ціль, «Дійшли 0 з 5», підказка про телефон.
  await stage.locator('.wordladder-goal').getByText('ПОЛЕ → ТАРА', exact).waitFor();
  await stage.getByText('Дійшли 0 з 5', exact).waitFor();
  await stage.getByText('Ведіть драбину на телефоні', exact).waitFor();
  await taras.getByText('Бали — за щонайбільше 8 кроків', exact).waitFor();

  // ── Тарас: дві відмови, слово й «Крок назад». ──
  await ladderMove26c(taras, 'ПІЛА', 'Ви замінили більше ніж одну літеру');
  expect(await ladderColumn26c(taras), 'a refusal keeps the column').toEqual(['ПОЛЕ']);
  await ladderMove26c(taras, 'ПОСЕ', 'Немає такого іменника в словнику');
  await expectLadderInputShown26c(taras, 'wordladder26c-phone-error');
  await shot(taras, 'wordladder26c-phone-error');
  await ladderMove26c(taras, 'пола');
  expect(await ladderColumn26c(taras)).toEqual(['ПОЛЕ', 'пола']);
  await shot(taras, 'wordladder26c-phone-move');
  await click(taras, 'Крок назад');
  await expect.poll(() => ladderColumn26c(taras), POLL).toEqual(['ПОЛЕ']);
  expect(await taras.getByRole('button', { name: 'Крок назад', ...exact }).isDisabled(), 'step back with no words').toBe(true);
  await ladderMove26c(taras, 'ПОЛА');
  await ladderMove26c(taras, 'ПОРА');

  // Пульт бачить слова Тараса наживо; сцена — лише кроки.
  // 11c: під час запитання поступ живе у «Відповідях наживо»; шлях ведучого — у рядку правильної відповіді.
  await host.locator('#live-answers').waitFor();
  await liveRow(host, 'Тарас').getByText('Кроків: 2 · пола → пора').waitFor();
  await host.getByText('Правильна відповідь: ПОЛЕ → ПОЛА → ПОРА → ПАРА → ТАРА', exact).waitFor();
  const stageRow = (name: string) => stage.locator('.wordladder-board li', { has: stage.getByText(name, exact) });
  const stageTaras = stageRow('Тарас');
  await expect.poll(() => stageTaras.locator('.tag').textContent(), POLL).toBe('кроків: 2');
  expect(await stageTaras.locator('.wordladder-words').count(), 'words on the stage before the reveal').toBe(0);
  await shot(host, 'wordladder26c-host-live');

  // Хосе (es, 320) не грає: його екран — іспанською, поле й кнопки на місці.
  await jose.getByRole('button', { name: es.wordLadderBack, ...exact }).waitFor();
  await jose.getByText('ПОЛЕ → ТАРА', exact).waitFor();
  await expectLadderInputShown26c(jose, 'wordladder26c-phone-es-320');
  await expectNoSideScroll(jose, 'wordladder26c-phone-es-320');

  // Тарас доходить за 5 кроків: стовпчик згорнуто (6 слів: перші два, «…», два останні).
  await ladderMove26c(taras, 'КОРА');
  await ladderMove26c(taras, 'КАРА');
  await ladderMove26c(taras, 'ТАРА');
  await taras.getByRole('heading', { name: 'Готово! Кроків: 5', ...exact }).waitFor();
  expect(await ladderColumn26c(taras), 'the collapsed column').toEqual(['ПОЛЕ', 'пола', '…', 'кара', 'тара']);
  expect(await taras.locator('.wordladder-gap').getAttribute('aria-label')).toBe('Пропущені слова');
  await expectNoSideScroll(taras, 'wordladder26c-phone-360');
  await shot(taras, 'wordladder26c-phone-done');

  // Оля — за 4 кроки; Іра робить один крок і зупиняється.
  for (const word of ['ПОЛА', 'ПОРА', 'ПАРА', 'ТАРА']) await ladderMove26c(olya, word);
  await olya.getByRole('heading', { name: 'Готово! Кроків: 4', ...exact }).waitFor();
  await ladderMove26c(ira, 'ПОЛА');

  // Віра (ar, 320 × 568) робить п'ять кроків без фінішу: стовпчик згорнуто, а поле й кнопки на місці; слова — зліва направо.
  for (const word of ['ПОЛА', 'ПОРА', 'КОРА', 'КАРА', 'ПАРА']) await ladderMove26c(vira, word);
  expect(await ladderColumn26c(vira), 'the collapsed column in play').toEqual(['ПОЛЕ', 'пола', '…', 'кара', 'пара']);
  expect(await htmlDir(vira)).toBe('rtl');
  expect(await ownDir(vira.locator('.wordladder-column')), 'the column in Arabic').toBe('ltr');
  expect(await ownDir(vira.locator('.wordladder-goal')), 'start → target in Arabic').toBe('ltr');
  expect(await ownDir(ladderInput26c(vira)), 'the input in Arabic').toBe('ltr');
  await expectLadderInputShown26c(vira, 'wordladder26c-phone-ar-320x568');
  await expectNoSideScroll(vira, 'wordladder26c-phone-ar-320x568');
  await vira.setViewportSize({ width: 375, height: 667 });
  await expectLadderInputShown26c(vira, 'wordladder26c-phone-ar-375x667');
  await expectNoSideScroll(vira, 'wordladder26c-phone-ar-375x667');
  // Іра (uk) на найменших телефонах: стовпчик із двох слів і поле.
  for (const [width, height] of [[320, 568], [375, 667]] as const) {
    await ira.setViewportSize({ width, height });
    await expectLadderInputShown26c(ira, `wordladder26c-phone-${width}x${height}`);
    await expectNoSideScroll(ira, `wordladder26c-phone-${width}x${height}`);
  }

  // До розкриття на сцені немає жодного проміжного слова — ні в тексті, ні в DOM; рядки показують кроки й фініш.
  await stage.getByText('Дійшли 2 з 5', exact).waitFor();
  await expect.poll(() => stageRow('Оля').locator('.tag').textContent(), POLL).toBe('фініш');
  await expect.poll(() => stageRow('Віра').locator('.tag').textContent(), POLL).toBe('кроків: 5');
  expect(await stageRow('Іра').locator('.tag').textContent()).toBe('кроків: 1');
  const stageText = (await bodyText(stage)).toLowerCase();
  const stageHtml = (await stage.content()).toLowerCase();
  for (const hidden of ['пола', 'пора', 'пара', 'кора', 'кара']) {
    expect(stageText, `«${hidden}» on the stage before the reveal`).not.toContain(hidden);
    expect(stageHtml, `«${hidden}» in the stage DOM before the reveal`).not.toContain(hidden);
  }
  await shot(stage, 'wordladder26c-stage-question');

  // ── Ведучий закриває запитання; розкриття: шлях ведучого, Оля +500, Тарас +400, Іра без балів. ──
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  const path = stage.locator('.wordladder-path li');
  await path.first().waitFor();
  expect(await path.allTextContents()).toEqual(['ПОЛЕ', 'ПОЛА', 'ПОРА', 'ПАРА', 'ТАРА']);
  // Записи після закриття має й той, хто не дійшов, а «дійшли» — лише двоє.
  await stage.getByText('Дійшли 2 з 5', exact).waitFor();
  await expect.poll(() => stageRow('Оля').locator('.score').textContent(), POLL).toBe('+500');
  expect(await stageRow('Тарас').locator('.score').textContent()).toBe('+400');
  expect(await stageRow('Оля').locator('.wordladder-words').textContent()).toBe('пола → пора → пара → тара');
  expect(await stageRow('Тарас').locator('.wordladder-words').textContent()).toBe('пола → пора → кора → кара → тара');
  expect(await stageRow('Оля').locator('.rank').textContent()).toBe('1');
  expect(await stageRow('Тарас').locator('.rank').textContent()).toBe('2');
  // Хто не дійшов — без балів і без слів.
  for (const name of ['Іра', 'Віра']) {
    const score = await stageRow(name).locator('.score').textContent().catch(() => null);
    expect(score === null || !/\+\d/.test(score), `${name} gets points`).toBe(true);
    expect(await stageRow(name).locator('.wordladder-words').count(), `${name}’s words on the reveal`).toBe(0);
  }
  await shot(stage, 'wordladder26c-stage-reveal');
  await expect.poll(() => taras.locator('.earned').textContent(), POLL).toBe('+400');
  await expect.poll(() => olya.locator('.earned').textContent(), POLL).toBe('+500');
  await ira.getByText('Не встигли дійти до цілі', exact).first().waitFor();
  // Швидкість на драбині не рахується: ні «найшвидшої» на телефоні, ні «найшвидше» на сцені.
  expect(await bodyText(taras)).not.toContain('найшвидша');
  expect(await bodyText(stage)).not.toContain('найшвидше');
  await shot(taras, 'wordladder26c-phone-reveal');
  await shot(vira, 'wordladder26c-phone-ar-reveal');

  // ── Історія гри: «Дійшли за кроків: 4». ──
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Драбина слів/ }).click();
  const question = host.locator('.rows.stacked > li', { hasText: 'Від поля до тари' });
  await question.getByText(/Відповіді \(\d+\)/).click();
  await question.locator('.responses li', { hasText: 'Оля' }).getByText('Дійшли за кроків: 4').waitFor();
  await question.locator('.responses li', { hasText: 'Тарас' }).getByText('Дійшли за кроків: 5').waitFor();
  expect(await bodyText(host), 'a speed award for the word ladder').not.toContain('Блискавка');
  await shot(host, 'wordladder26c-history');

  expect(problems).toEqual([]);
}
