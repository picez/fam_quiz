import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { DEFAULT_RULES } from '@quiz/shared';
import { type Locator, type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { open, click, liveRow, field, arrange, join, bodyText, expectNoSideScroll, register, POLL, socketFrames, pickOption, HEADER_ONE_LINE, scoreOf, toNextQuestion, clueTexts, expectStageInView, writeLie, pickBluff, NL, scoreCells, breakdownTexts, sleep, frame, stateViews, undoRows, revealLine, squash } from './helpers/common';
import { exact, base, problems, ARTIFACTS, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 12a–12e: скасування балів, живі вибори, «Хто я?» у власному темпі, статистика в грі, антигуглення.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

/** Ключ панелі скасування в сокетних кадрах (12a): лише в зрізі пульта. */
const UNDO_PANEL = /"undo":\{"rounds":/;

function undoQuestions12a() {
  const common = { imageUrl: null, video: null, timeLimit: 20 };
  const u1 = {
    ...common,
    id: 'u1',
    type: 'single' as const,
    text: 'Яка найбільша планета Сонячної системи?',
    points: 100,
    options: [{ id: 'u1-a', text: 'Юпітер' }, { id: 'u1-b', text: 'Сатурн' }, { id: 'u1-c', text: 'Марс' }],
    correctId: 'u1-a',
  };
  const u2 = { ...common, id: 'u2', type: 'boolean' as const, text: 'Бджола — комаха', points: 200, correct: true };
  const u3 = {
    ...common,
    id: 'u3',
    type: 'single' as const,
    text: 'Скільки континентів на Землі?',
    points: 300,
    options: [{ id: 'u3-a', text: '7' }, { id: 'u3-b', text: '5' }, { id: 'u3-c', text: '6' }],
    correctId: 'u3-a',
  };
  const u4 = { ...common, id: 'u4', type: 'boolean' as const, text: 'Сонце — зірка', points: 100, correct: true };
  return { u1, u2, u3, u4 };
}

async function undo12a() {
  const host = await open('host12a', 375, 812);
  await register(host, 'host', 'Ліна Ведуча', 'host12a@example.com');
  const hostFrames = socketFrames(host);

  const { u1, u2, u3, u4 } = undoQuestions12a();
  const options = { speedBonus: false, shuffleOptions: false, rules: { ...DEFAULT_RULES, penalty: 'minus' as const } };
  const data = {
    ...makeRoundsQuiz(
      [
        classicRound('r1', [u1, u2] as never, { ...options, title: 'Розминка' }),
        classicRound('r2', [u3, u4] as never, { ...options, title: 'Фініш' }),
      ],
      { leaderboard: 'each' },
    ),
    title: 'Скасування 12a',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Скасування 12a' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage12a', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya12a', 375, 812);
  const petro = await open('petro12a', 375, 812);
  const ira = await open('ira12a', 375, 812);
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];
  const all = [host, stage, ...phones];

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  const sheet = host.locator('.undo-sheet');
  const openUndo = async () => {
    await host.getByRole('button', { name: '↶ Бали', ...exact }).click();
    await sheet.getByRole('heading', { name: 'Скасування балів', ...exact }).waitFor();
  };
  const closeUndo = async () => {
    await host.keyboard.press('Escape');
    await sheet.waitFor({ state: 'detached' });
  };
  const playerRow = (name: string) => host.locator('.player-row', { has: host.locator('.name', { hasText: new RegExp(`^${name}$`) }) });
  const rowScore = async (name: string) => (await playerRow(name).locator('.score').textContent())?.trim();
  const notice = (page: Page) => page.locator('.live-notice.is-undo');
  const noticeText = async (page: Page) => (await notice(page).textContent({ timeout: 500 }).catch(() => null))?.trim() ?? null;
  const undoRow = (text: string) => sheet.locator('.undo-row', { has: host.locator('.undo-row-text', { hasText: new RegExp(`^${text}$`) }) });
  /** Відповіді гравців; запитання закривається само, коли відповіли всі. */
  const answer = async (picks: [Page, string][]) => {
    for (const [page, option] of picks) await pickOption(page, option);
    await host.getByText('Запитання закрите').waitFor();
  };
  /** Аркуш на 375 px: картка не прокручується вбік, кожна кнопка всередині картки; код гри в шапці — в один рядок. */
  const expectSheetFits = async (name: string) => {
    const overflow = (await host.evaluate(`(() => {
      const card = document.querySelector('.undo-card');
      const box = card.getBoundingClientRect();
      const out = [...card.querySelectorAll('button')]
        .map((button) => ({ text: button.textContent, r: button.getBoundingClientRect() }))
        .filter(({ r }) => r.left < box.left - 1 || r.right > box.right + 1)
        .map(({ text }) => text);
      return card.scrollWidth > card.clientWidth ? ['card scrolls sideways', ...out] : out;
    })()`)) as string[];
    expect(overflow, `${name}: the undo card overflows`).toEqual([]);
    const code = (await host.locator('header.bar .code').boundingBox())!;
    const lineHeight = (await host.evaluate("parseFloat(getComputedStyle(document.querySelector('header.bar .code')).lineHeight) || 30")) as number;
    expect(code.height, `${name}: the game code wraps in the header`).toBeLessThan(lineHeight * 1.5);
  };
  const yes = '(^|\\s)Так$';
  const no = '(^|\\s)Ні$';
  const dialogs: string[] = [];
  host.on('dialog', (dialog) => dialogs.push(dialog.message()));

  // 1. u1 на розкритті: Петро помиляється, ведучий дає Ірі +50; поточне запитання ще поза аркушем.
  await stage.getByText('Яка найбільша планета Сонячної системи?', exact).waitFor();
  await answer([[olya, 'Юпітер'], [petro, 'Сатурн'], [ira, 'Юпітер']]);
  await click(host, 'Показати відповідь');
  const iraRow = playerRow('Іра');
  await iraRow.getByRole('button', { name: 'Бали', ...exact }).click();
  await iraRow.locator('.player-tools').waitFor();
  await iraRow.getByLabel('Своя сума', exact).fill('50');
  await iraRow.getByRole('button', { name: 'Нарахувати', ...exact }).click();
  await expect.poll(() => rowScore('Іра'), POLL).toBe('150');
  await openUndo();
  await sheet.locator('.undo-empty').waitFor();
  expect(await sheet.locator('.undo-row').count(), 'the question on its reveal is in the sheet').toBe(0);
  await closeUndo();

  // 2. Після розкриття: аркуш з раундом, запитанням і чотирма рядками.
  await click(host, 'Далі');
  await openUndo();
  await expect.poll(() => sheet.locator('h3').allTextContents(), POLL).toEqual(['Розминка']);
  expect(await sheet.locator('.undo-question-title').allTextContents()).toEqual(['1. Яка найбільша планета Сонячної системи?']);
  expect(await undoRows(sheet)).toEqual(['Оля +100', 'Петро −100 (штраф)', 'Іра +100', 'Ведучий: Іра +50']);
  await expectSheetFits('p12a-host-sheet');
  await expectNoSideScroll(host, 'p12a-host-sheet');

  // 3. Штраф Петра — одним дотиком; сповіщення на сцені й телефонах.
  const petroPenalty = undoRow('Петро −100 \\(штраф\\)');
  await petroPenalty.getByRole('button', { name: 'Скасувати', ...exact }).click();
  await expect.poll(() => petroPenalty.getAttribute('class'), POLL).toBe('undo-row is-undone');
  await petroPenalty.getByRole('button', { name: 'Повернути', ...exact }).waitFor();
  const undone = 'Ведучий скасував бали: Петро +100 (раунд 1, запитання 1)';
  await Promise.all([stage, petro, olya].map((page) => expect.poll(() => noticeText(page), POLL).toBe(undone)));
  await closeUndo();
  await expect.poll(() => rowScore('Петро'), POLL).toBe('0');
  await stage.waitForTimeout(300);
  await shot(stage, 'p12a-stage-notice');
  await shot(petro, 'p12a-phone-notice');

  // 4. Розбивка Петра: «Скасовано ведучим».
  const petroTable = petro.locator('.table-sheet');
  await petro.getByRole('button', { name: 'Таблиця', ...exact }).click();
  await petroTable.getByRole('heading', { name: 'Таблиця', ...exact }).waitFor();
  await petroTable.locator('button.score-row-toggle').click();
  await petroTable.locator('.score-breakdown').waitFor();
  expect(await breakdownTexts(petroTable)).toEqual(['Помилки −100', 'Скасовано ведучим +100']);
  await expectNoSideScroll(petro, 'p12a-phone-breakdown');
  await petro.keyboard.press('Escape');
  await petroTable.waitFor({ state: 'detached' });

  // 5. «Повернути» штраф.
  await openUndo();
  await petroPenalty.getByRole('button', { name: 'Повернути', ...exact }).click();
  await expect.poll(() => noticeText(petro), POLL).toBe('Ведучий повернув бали: Петро −100 (раунд 1, запитання 1)');
  await expect.poll(() => petroPenalty.getAttribute('class'), POLL).toBe('undo-row');
  await closeUndo();
  await expect.poll(() => rowScore('Петро'), POLL).toBe('−100');

  // 6. u2 і «Скасувати раунд» після підтвердження.
  await click(host, 'Наступне запитання');
  await afterSplash(...all);
  await stage.getByText('Бджола — комаха', exact).waitFor();
  await answer([[olya, no], [petro, yes], [ira, yes]]);
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  const gains = () => stage.locator('.round-gain').allTextContents();
  await expect.poll(gains, POLL).toEqual(['+350 за раунд', '+100 за раунд', '−100 за раунд']);
  await openUndo();
  await sheet
    .locator('.undo-round', { has: host.locator('h3', { hasText: 'Розминка' }) })
    .getByRole('button', { name: 'Скасувати раунд', ...exact })
    .click();
  await expect.poll(() => dialogs.at(-1), POLL).toBe('Скасувати бали 3 гравців за раунд 1?');
  await expect.poll(() => sheet.locator('.undo-row:not(.is-undone)').count(), POLL).toBe(0);
  await expect.poll(() => noticeText(stage), POLL).toBe('Ведучий скасував бали 3 гравців (раунд 1)');
  await closeUndo();
  await expect.poll(gains, POLL).toEqual(['0 за раунд', '0 за раунд', '0 за раунд']);
  expect(await stage.locator('.standings .score').allTextContents()).toEqual(['0', '0', '0']);
  await expectStageInView(stage, 'p12a-stage-round');
  await shot(stage, 'p12a-stage-round');

  // 7. «Повернути» бали ведучого.
  await openUndo();
  await undoRow('Ведучий: Іра \\+50').getByRole('button', { name: 'Повернути', ...exact }).click();
  await expect.poll(() => noticeText(ira), POLL).toBe('Ведучий повернув бали: Іра +50 (раунд 1, запитання 1)');
  await closeUndo();
  await expect.poll(() => rowScore('Іра'), POLL).toBe('50');

  // 8. u3: поточне запитання на розкритті — поза аркушем.
  await click(host, 'Наступний раунд');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);
  await stage.getByText('Скільки континентів на Землі?', exact).waitFor();
  await answer([[olya, '(^|\\s)7$'], [petro, '(^|\\s)5$'], [ira, '(^|\\s)7$']]);
  await click(host, 'Показати відповідь');
  await openUndo();
  expect(await sheet.locator('h3').allTextContents()).toEqual(['Розминка']);
  await closeUndo();

  // 9. «Скасувати все за запитання» і «Повернути» Петра.
  await click(host, 'Далі');
  await openUndo();
  await expect.poll(() => sheet.locator('h3').allTextContents(), POLL).toEqual(['Фініш', 'Розминка']);
  await sheet.locator('.undo-question').first().getByRole('button', { name: 'Скасувати все за запитання 1', ...exact }).click();
  await expect.poll(() => dialogs.at(-1), POLL).toBe('Скасувати бали 3 гравців за запитання 1?');
  await expect.poll(() => noticeText(olya), POLL).toBe('Ведучий скасував бали 3 гравців (раунд 2, запитання 1)');
  await undoRow('Петро −300 \\(штраф\\)').getByRole('button', { name: 'Повернути', ...exact }).click();
  await expect.poll(() => noticeText(petro), POLL).toBe('Ведучий повернув бали: Петро −300 (раунд 2, запитання 1)');
  await expectSheetFits('p12a-host-sheet-two-rounds');
  await shot(host, 'p12a-host-sheet-two-rounds');
  await closeUndo();
  await expect.poll(() => rowScore('Оля'), POLL).toBe('0');
  expect(await rowScore('Петро')).toBe('−300');
  expect(await rowScore('Іра')).toBe('50');

  // 10. u4 і кінець: на пульті «↶ Бали» більше немає.
  await click(host, 'Наступне запитання');
  await afterSplash(...all);
  await stage.getByText('Сонце — зірка', exact).waitFor();
  await answer(phones.map((page) => [page, yes] as [Page, string]));
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const first = (await stage.locator('.standings li').first().textContent())!;
  expect(first).toContain('Іра');
  expect(first).toContain('150');
  await expect.poll(() => host.getByRole('button', { name: '↶ Бали', ...exact }).count(), POLL).toBe(0);

  // 11. Таємність у кадрах: панель скасування лише в пульта.
  expect(stageFrames.length).toBeGreaterThan(0);
  for (const frame of stageFrames) expect(UNDO_PANEL.test(frame), 'the stage got the undo panel').toBe(false);
  for (const frame of petroFrames) expect(UNDO_PANEL.test(frame), 'Петро got the undo panel').toBe(false);
  expect(hostFrames.some((frame) => UNDO_PANEL.test(frame)), 'the host never got the undo panel').toBe(true);

  // 12. Історія: рахунок, розбивка, закреслені рядки й «↶».
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Скасування 12a/ }).click();
  const section = host.locator('section.history-scores');
  await section.getByRole('heading', { name: 'Бали за раундами', ...exact }).waitFor();
  expect(await scoreCells(section, 'Іра')).toEqual(['50', '100', '150']);
  expect(await scoreCells(section, 'Оля')).toEqual(['0', '100', '100']);
  expect(await scoreCells(section, 'Петро')).toEqual(['0', '−200', '−200']);
  await section.locator('button.score-row-toggle', { hasText: 'Петро' }).click();
  await section.locator('.score-breakdown').waitFor();
  expect(await breakdownTexts(section)).toEqual(['Відповіді +300', 'Помилки −400', 'Скасовано ведучим +500', 'Скасовано ведучим −600']);
  const group = (title: string) => host.locator('.round-group', { has: host.locator('h3.round-title', { hasText: new RegExp(`^${title}$`) }) });
  const warmup = group('Розминка');
  expect((await warmup.locator('.history-adjustments').textContent())?.trim()).toBe('Бали від ведучого: Іра +50');
  expect(await warmup.locator('.history-adjustments s').count()).toBe(0);
  const warmupUndo = warmup.locator('.history-undo');
  expect(await warmupUndo.count()).toBe(10);
  expect((await warmupUndo.first().textContent())?.trim()).toBe('↶ Скасовано: Петро +100 (запитання 1)');
  expect(await warmupUndo.first().locator('s').count()).toBe(1);
  const finish = group('Фініш');
  const finishUndo = finish.locator('.history-undo');
  expect(await finishUndo.count()).toBe(4);
  expect((await finishUndo.last().textContent())?.trim()).toBe('↶ Повернуто: Петро −300 (запитання 1)');
  const u3Answers = finish.locator('details.responses').first();
  await u3Answers.locator('summary').click();
  const responseOf = (name: string) => u3Answers.locator('li', { has: host.locator('.responses-name', { hasText: new RegExp(`^${name}$`) }) });
  expect(await responseOf('Оля').getAttribute('class')).toContain('is-undone');
  expect(await responseOf('Іра').getAttribute('class')).toContain('is-undone');
  expect(await responseOf('Петро').getAttribute('class')).not.toContain('is-undone');
  await expectNoSideScroll(host, 'p12a-history');

  expect(problems).toEqual([]);
}

it('part 12a: undo points — the host sheet on a 375 phone lists closed questions newest first, undoes a penalty with one tap and returns it, undoes a whole round and a whole question after a confirm, phones and the 1280 × 720 stage get the notice and the new table, the phone breakdown says «Скасовано ведучим», the current question stays out until its reveal ends, the panel never reaches the stage, and the history strikes what was undone', async () => {
  try {
    await undo12a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Пакет живих виборів у сокетних кадрах (12b): лише пульт із «наживо». */
const DRAFTS_EVENT = /\["host:drafts",/;
/** Скільки пакетів живих виборів отримала сторінка. */
const draftBatches = (frames: string[]) => frames.filter((frame) => DRAFTS_EVENT.test(frame)).length;

function liveQuestions12b() {
  const common = { imageUrl: null, video: null, timeLimit: 60, points: 100 };
  const l1 = {
    ...common,
    id: 'l1',
    type: 'multi' as const,
    text: 'Які з цих тварин — ссавці?',
    options: ['Кит', 'Дельфін', 'Акула', 'Пінгвін'].map((text, at) => ({ id: `l1-${'abcd'[at]}`, text })),
    correctIds: ['l1-a', 'l1-b'],
  };
  const l2 = { ...common, id: 'l2', type: 'text' as const, text: 'Столиця Японії?', accepted: ['Токіо'] };
  const l3 = {
    ...common,
    id: 'l3',
    type: 'order' as const,
    text: 'Від найменшого до найбільшого',
    items: ['Миша', 'Кіт', 'Кінь'].map((text, at) => ({ id: `l3-${at}`, text })),
    topLabel: 'Найменший',
    bottomLabel: 'Найбільший',
  };
  return { l1, l2, l3 };
}

async function live12b() {
  const host = await open('host12b', 375, 812);
  await register(host, 'host', 'Ліна Ведуча', 'host12b@example.com');
  const hostFrames = socketFrames(host);

  const { l1, l2, l3 } = liveQuestions12b();
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [l1, l2, l3] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES })], {
      leaderboard: 'each',
    }),
    title: 'Наживо 12b',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Наживо 12b' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage12b', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya12b', 375, 812);
  const petro = await open('petro12b', 375, 812);
  const ira = await open('ira12b', 375, 812);
  const petroFrames = socketFrames(petro);
  const iraFrames = socketFrames(ira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];
  const all = [host, stage, ...phones];

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  const toggle = host.locator('header.bar').getByRole('button', { name: 'Наживо', ...exact });
  const panel = host.locator('#live-answers');
  const row = (name: string) => liveRow(host, name);
  const draftOf = (name: string) => row(name).locator('.live-draft em');
  const textOf = async (locator: Locator) => (await locator.textContent({ timeout: 500 }).catch(() => null))?.trim() ?? null;
  const draftText = (name: string) => textOf(draftOf(name));
  /** Кадр самої панелі: на повній сторінці її частину ховає закріплена смуга кнопок пульта. */
  const panelShot = async (name: string) => {
    if (process.env.E2E_SHOTS !== '1') return;
    mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
    await panel.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await panel.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`) });
    await host.evaluate('scrollTo(0, 0)');
  };
  const toNextQuestion = async () => {
    await click(host, 'Показати відповідь');
    await click(host, 'Далі');
    await click(host, 'Наступне запитання');
    await afterSplash(...all);
  };

  // 1. Шапка: «👁 Наживо» увімкнено, в один рядок на 375 px.
  await stage.getByText('Які з цих тварин — ссавці?', exact).waitFor();
  await panel.waitFor();
  await toggle.waitFor();
  expect(await toggle.getAttribute('aria-pressed')).toBe('true');
  expect(await host.evaluate(HEADER_ONE_LINE), 'the host header wraps with «Наживо»').toBe(true);

  // 2. Позначки до «Надіслати».
  await pickOption(olya, 'Кит');
  await pickOption(olya, 'Дельфін');
  await expect.poll(() => draftText('Оля'), POLL).toBe('позначає Кит, Дельфін');
  expect(await textOf(row('Оля').locator('.live-draft .tag'))).toBe('ще не надіслав');
  expect(await textOf(row('Оля').locator('.live-thinking'))).toMatch(/^думає \d+ с$/);
  await pickOption(petro, 'Акула');
  await expect.poll(() => draftText('Петро'), POLL).toBe('позначає Акула');
  await pickOption(petro, 'Кит');
  await expect.poll(() => draftText('Петро'), POLL).toBe('позначає Кит, Акула');
  await pickOption(petro, 'Акула');
  await expect.poll(() => draftText('Петро'), POLL).toBe('позначає Кит');
  await expect.poll(() => textOf(row('Петро').locator('.live-changes')), POLL).toBe('змінював 2 рази');
  await expectNoSideScroll(host, 'p12b-host-live');
  await panelShot('p12b-host-live-panel');
  const phoneText = (await bodyText(olya)).toLowerCase();
  expect(phoneText, 'the phone says «наживо»').not.toContain('наживо');
  expect(phoneText, 'the phone says «чернетка»').not.toContain('чернетка');
  await olya.getByRole('button', { name: 'Відповісти', ...exact }).waitFor();
  await expectNoSideScroll(olya, 'p12b-phone-draft');

  // 3. Подання: рядок показує відповідь, чернетки немає.
  await click(olya, 'Відповісти');
  await row('Оля').locator('.live-answer', { hasText: 'Кит' }).waitFor();
  expect(await row('Оля').locator('.live-answer').textContent()).toContain('Дельфін');
  await expect.poll(() => row('Оля').locator('.live-draft').count(), POLL).toBe(0);

  // 4. Вимкнення: панель згортається, пакетів немає — і після перезавантаження.
  await toggle.click();
  await expect.poll(() => toggle.getAttribute('aria-pressed'), POLL).toBe('false');
  await expect.poll(() => panel.locator('.live-row').count(), POLL).toBe(0);
  await expect.poll(() => textOf(panel.locator('.live-count')), POLL).toBe('Відповіли 1 з 3');
  expect(await panel.locator('.live-waiting').count()).toBe(0);
  expect(await panel.locator('.live-aside').count()).toBe(0);
  expect(await panel.getAttribute('class')).toContain('is-collapsed');
  const before = draftBatches(hostFrames);
  await pickOption(petro, 'Дельфін');
  await host.waitForTimeout(1000);
  expect(draftBatches(hostFrames), 'a batch reached the host with «наживо» off').toBe(before);
  expect(await host.evaluate(HEADER_ONE_LINE), 'the host header wraps with «Наживо» off').toBe(true);
  await expectNoSideScroll(host, 'p12b-host-off');
  await panelShot('p12b-host-off-panel');
  await host.reload();
  await panel.waitFor();
  await toggle.waitFor();
  expect(await toggle.getAttribute('aria-pressed')).toBe('false');
  // Відхід ведучого (перезавантаження) ставить гру на паузу.
  await host.getByRole('button', { name: 'Продовжити', ...exact }).last().click();
  await expect.poll(() => petro.locator('.choice', { hasText: 'Пінгвін' }).isEnabled(), POLL).toBe(true);
  await pickOption(petro, 'Пінгвін');
  await host.waitForTimeout(1000);
  expect(draftBatches(hostFrames), 'a batch reached the host with «наживо» off after a reload').toBe(before);
  expect(await panel.locator('.live-row').count()).toBe(0);

  // 5. Увімкнення: пакет приходить одразу.
  await toggle.click();
  await expect.poll(() => toggle.getAttribute('aria-pressed'), POLL).toBe('true');
  await expect.poll(() => draftText('Петро'), POLL).toBe('позначає Кит, Дельфін, Пінгвін');
  await click(petro, 'Відповісти');
  await pickOption(ira, 'Кит');
  await pickOption(ira, 'Дельфін');
  await click(ira, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  await toNextQuestion();

  // 6. Текст: «друкує «Осака»», потім «Токіо» зі змінами.
  await stage.getByText('Столиця Японії?', exact).waitFor();
  await field(ira, 'Ваша відповідь').fill('Осака');
  await expect.poll(() => draftText('Іра'), POLL).toBe('друкує «Осака»');
  await expectNoSideScroll(host, 'p12b-host-typing');
  await panelShot('p12b-host-typing-panel');
  await field(ira, 'Ваша відповідь').fill('');
  await field(ira, 'Ваша відповідь').fill('Токіо');
  await expect.poll(() => draftText('Іра'), POLL).toBe('друкує «Токіо»');
  await expect.poll(async () => (await textOf(row('Іра').locator('.live-changes'))) ?? '', POLL).toMatch(/^змінював \d+ раз(и|ів)?$/);
  await panelShot('p12b-host-typing-changes-panel');
  await click(ira, 'Відповісти');
  await field(olya, 'Ваша відповідь').fill('Токіо');
  await click(olya, 'Відповісти');
  await field(petro, 'Ваша відповідь').fill('Кіото');
  await click(petro, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  await expect.poll(() => textOf(row('Іра').locator('.live-answer')), POLL).toBe('Токіо');

  // 7. Сцена без нових написів.
  await expectStageInView(stage, 'p12b-stage-question');
  await shot(stage, 'p12b-stage-question');
  expect((await bodyText(stage)).toLowerCase()).not.toContain('наживо');

  // 8. Впорядкування: «порядок: Кінь → …».
  await toNextQuestion();
  await stage.getByText('Від найменшого до найбільшого', exact).waitFor();
  await olya.locator('.order').waitFor();
  const now = await olya.locator('.order .order-text').allTextContents();
  const rest = now.filter((text) => text !== 'Кінь');
  // Кінь угору; якщо він уже вгорі після перемішування — міняємо двох інших, щоб вибір змінився.
  const wanted = now[0] === 'Кінь' ? ['Кінь', rest[1]!, rest[0]!] : ['Кінь', ...rest];
  await arrange(olya, wanted);
  await expect.poll(() => draftText('Оля'), POLL).toBe(`порядок: ${wanted.join(' → ')}`);
  await shot(host, 'p12b-host-order');
  await panelShot('p12b-host-order-panel');
  await click(olya, 'Відповісти');
  await click(petro, 'Відповісти');
  await click(ira, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  // 9. Таємність у кадрах: живі вибори — лише в пульта.
  expect(draftBatches(hostFrames)).toBeGreaterThan(0);
  expect(hostFrames.join(NL), 'the host never got «Осака»').toContain('Осака');
  expect(stageFrames.length).toBeGreaterThan(0);
  for (const [who, frames] of [['stage', stageFrames], ['Петро', petroFrames], ['Іра', iraFrames]] as const) {
    expect(draftBatches(frames), `${who} got host:drafts`).toBe(0);
    expect(frames.join(NL), `${who} got «Осака»`).not.toContain('Осака');
  }
  for (const [who, frames] of [['stage', stageFrames], ['Петро', petroFrames]] as const) {
    expect(frames.join(NL), `${who} got the marks of Оля`).not.toContain('"optionIds":["l1-a","l1-b"]');
  }

  expect(problems).toEqual([]);
}

it('part 12b: live choices — «👁 Наживо» in a one-line host header on a 375 phone shows in italics what players mark, type and order before «Надіслати» with «ще не надіслав», «змінював N разів» and «думає N с», a one-tap pick shows as an answer, turning it off folds the panel and stops every batch even after a reload, turning it on brings them back, and the stage and other phones never receive a draft', async () => {
  try {
    await live12b();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

const SKOVORODA = {
  id: 's1',
  type: 'clues' as const,
  text: 'Хто я?',
  imageUrl: null,
  video: null,
  timeLimit: 60,
  points: 1000,
  clues: [
    'Я народився 1722 року на Полтавщині.',
    'Я багато років мандрував пішки.',
    'Я писав байки, пісні й філософські діалоги.',
    'На моєму надгробку: «Світ ловив мене, та не спіймав».',
    'Мій портрет — на 500 гривнях.',
  ],
  accepted: ['Сковорода', 'Григорій Сковорода'],
  interval: 8,
  cluePace: 'self' as const,
};

async function selfClues12c() {
  const host = await open('host12c', 375, 812);
  await register(host, 'host', 'Ліна Ведуча', 'host12c@example.com');
  const hostFrames = socketFrames(host);

  const data = {
    ...makeRoundsQuiz([classicRound('r1', [SKOVORODA] as never, { title: 'Хто я', speedBonus: false, rules: DEFAULT_RULES })], {
      leaderboard: 'end',
      // Підказка типу над першим «Хто я?» на телефоні (8d) — лише з поясненнями для новачків.
      newcomers: true,
    }),
    title: 'Хто я 12c',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // 1. Редактор на 375 px.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Хто я 12c' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  // На 375 px єдине запитання вже відкрите (перемикач «1 / 1»), кнопки «Запитання 1» немає.
  const pace = host.getByRole('group', { name: 'Підказки відкриваються' });
  const self = pace.getByRole('radio', { name: 'кожен сам', ...exact });
  const timer = pace.getByRole('radio', { name: 'за таймером', ...exact });
  const interval = field(host, 'Нова підказка кожні, с');
  await self.waitFor();
  expect(await self.isChecked()).toBe(true);
  expect(await interval.count()).toBe(0);
  expect(await host.getByText(/^Остання підказка відкриється на/).count()).toBe(0);
  await host.getByText(/Кожен гравець сам відкриває наступну підказку/).waitFor();
  await expectNoSideScroll(host, 'p12c-editor-375');
  await timer.click();
  await interval.waitFor();
  await host.getByText(/^Остання підказка відкриється на/).waitFor();
  await shot(host, 'p12c-editor-timer-375');
  await self.click();
  await expect.poll(() => interval.count(), POLL).toBe(0);
  expect(await self.isChecked()).toBe(true);
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as {
    rounds: { questions?: { cluePace?: string; timeLimit: number }[] }[];
  };
  expect(stored.rounds[0]!.questions![0]!.cluePace).toBe('self');
  expect(stored.rounds[0]!.questions![0]!.timeLimit).toBe(60);

  // Гра.
  await host.locator('.quiz-list li', { hasText: 'Хто я 12c' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage12c', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya12c', 375, 812);
  const petro = await open('petro12c', 375, 812);
  const ira = await open('ira12c', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const iraFrames = socketFrames(ira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];
  const all = [host, stage, ...phones];

  await click(host, 'Почати гру');
  await stage.locator('.guide').waitFor();
  await click(host, 'До гри');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  const more = (page: Page) => page.locator('.clue-more');
  const moreText = async (page: Page) => (await more(page).textContent({ timeout: 500 }).catch(() => null))?.trim() ?? null;
  const opensLine = stage.locator('.clue-opens');
  const opens = () => opensLine.locator('.clue-open').allTextContents();
  const row = (name: string) => liveRow(host, name);
  const rowText = async (name: string, selector: string) => (await row(name).locator(selector).allTextContents()).join(' ');
  const [c1, c2, c3, c4, c5] = SKOVORODA.clues as [string, string, string, string, string];

  // 2. Перша підказка всюди.
  for (const page of [...phones, stage]) {
    await page.locator('.clues-list').waitFor();
    await expect.poll(() => clueTexts(page), POLL).toEqual([c1]);
  }
  await expect.poll(opens, POLL).toEqual(['Оля 1', 'Петро 1', 'Іра 1']);
  expect(await opensLine.getAttribute('class')).toContain('is-big');
  expect(await opensLine.getAttribute('aria-label')).toBe('Скільки підказок відкрив кожен');
  expect(await stage.locator('.clues-list .clue:not(.is-hidden)').count()).toBe(1);
  await stage.getByText('Кожен відкриває підказки на телефоні сам: що менше підказок, то більше балів.', exact).waitFor();
  await expect.poll(() => moreText(olya), POLL).toBe('Ще підказка · ціна стане 80 %');
  await olya.getByRole('note').filter({ hasText: 'Підказки відкриваєш сам кнопкою «Ще підказка»' }).first().waitFor();
  await host.getByText('Кожен відкриває підказки сам: ціна — за тим, скільки відкрив.', exact).waitFor();
  expect(await host.locator('.host-clues li').count()).toBe(5);
  expect(await host.locator('.host-clues .clue-state').count()).toBe(0);

  // 3. Петро відкриває дві.
  await expect.poll(() => more(petro).isEnabled(), POLL).toBe(true);
  await more(petro).click();
  await expect.poll(async () => (await clueTexts(petro)).length, POLL).toBe(2);
  await expect.poll(() => moreText(petro), POLL).toBe('Ще підказка · ціна стане 60 %');
  await more(petro).click();
  await expect.poll(() => clueTexts(petro), POLL).toEqual([c1, c2, c3]);
  await expect.poll(() => moreText(petro), POLL).toBe('Ще підказка · ціна стане 40 %');
  await petro.getByText(/Підказка 3 з 5: правильна відповідь зараз — 60\s*%\s*ціни/).waitFor();
  expect(await clueTexts(olya)).toEqual([c1]);
  expect(await clueTexts(stage)).toEqual([c1]);
  await expect.poll(opens, POLL).toEqual(['Оля 1', 'Петро 3', 'Іра 1']);
  await expect.poll(() => rowText('Петро', '.live-answer'), POLL).toContain('підказка 3/5');
  await expect.poll(() => rowText('Оля', '.live-answer'), POLL).toContain('підказка 1/5');
  await expect.poll(() => host.locator('.host-clues .clue-opens .clue-open').allTextContents(), POLL).toEqual(['Оля 1', 'Петро 3', 'Іра 1']);
  expect(await host.locator('#live-answers').getByText('Чекаємо:').count()).toBe(0);
  expect(await host.evaluate(HEADER_ONE_LINE), 'the host header wraps').toBe(true);
  await expectNoSideScroll(petro, 'p12c-phone-more');
  await expectNoSideScroll(host, 'p12c-host-live');
  if (process.env.E2E_SHOTS === '1') {
    const panel = host.locator('#live-answers');
    await panel.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await panel.screenshot({ path: resolve(ARTIFACTS, 'shots', 'p12c-host-live-panel.png') });
    await host.evaluate('scrollTo(0, 0)');
  }

  // 4. Пауза вимикає кнопку.
  await host.getByRole('button', { name: 'Пауза', ...exact }).first().click();
  await expect.poll(() => more(ira).isDisabled(), POLL).toBe(true);
  await shot(ira, 'p12c-phone-paused');
  await host.getByRole('button', { name: 'Продовжити', ...exact }).last().click();
  await expect.poll(() => more(ira).isEnabled(), POLL).toBe(true);
  await more(ira).click();
  await expect.poll(() => clueTexts(ira), POLL).toEqual([c1, c2]);
  await expect.poll(opens, POLL).toEqual(['Оля 1', 'Петро 3', 'Іра 2']);

  // 5. Перепідключення: свої підказки лишаються.
  await petro.reload();
  await petro.locator('.clues-list').waitFor();
  await expect.poll(() => clueTexts(petro), POLL).toEqual([c1, c2, c3]);
  await expect.poll(() => moreText(petro), POLL).toBe('Ще підказка · ціна стане 40 %');

  // 6. Сцена.
  expect(await stage.locator('.clues-list .clue:not(.is-hidden)').count()).toBe(1);
  expect(await stage.locator('.clues-list .clue.is-hidden').count()).toBe(4);
  await expectStageInView(stage, 'p12c-stage-question');
  await shot(stage, 'p12c-stage-question');

  // 7. Таємність до розкриття.
  const stageText = stageFrames.join(NL);
  expect(stageFrames.length).toBeGreaterThan(0);
  for (const secret of [c2, c3, c4, c5, 'Сковорода']) expect(stageText, `the stage got «${secret}» before the reveal`).not.toContain(secret);
  for (const [who, frames, secrets] of [
    ['Оля', olyaFrames, [c2, c3, c4, c5]],
    ['Іра', iraFrames, [c3, c4, c5]],
    ['Петро', petroFrames, [c4, c5]],
  ] as const) {
    const text = frames.join(NL);
    expect(text, `${who}: no frames`).toContain(c1);
    for (const secret of secrets) expect(text, `${who} got «${secret}» before the reveal`).not.toContain(secret);
  }
  expect(hostFrames.join(NL), 'the host frames miss the last clue').toContain(c5);

  // 8. Відповіді.
  await field(olya, 'Ваша відповідь').fill('Сковорода');
  await click(olya, 'Відповісти');
  await expect.poll(() => more(olya).count(), POLL).toBe(0);
  await expect.poll(() => rowText('Оля', '.meta'), POLL).toContain('на підказці 1');
  await field(petro, 'Ваша відповідь').fill('Григорій Сковорода');
  await click(petro, 'Відповісти');
  await expect.poll(() => more(petro).count(), POLL).toBe(0);
  await click(host, 'Закрити запитання');
  await host.getByText('Запитання закрите').waitFor();

  // 9. Розкриття.
  await click(host, 'Показати відповідь');
  await expect.poll(async () => (await clueTexts(stage)).length, POLL).toBe(5);
  await stage.locator('.clue-opens.is-big.is-revealed').waitFor();
  await expect.poll(opens, POLL).toEqual(['Оля — на підказці 1', 'Петро — на підказці 3', 'Іра — без відповіді']);
  await host.locator('li', { hasText: 'Петро' }).getByText('на підказці 3', exact).first().waitFor();
  expect(await scoreOf(host, 'Оля')).toBe(1000);
  expect(await scoreOf(host, 'Петро')).toBe(600);
  expect(await scoreOf(host, 'Іра')).toBe(0);
  await expectStageInView(stage, 'p12c-stage-reveal');
  await shot(stage, 'p12c-stage-reveal');
  await expect.poll(async () => (await clueTexts(petro)).length, POLL).toBe(5);
  await expectNoSideScroll(petro, 'p12c-phone-reveal');
  await shot(host, 'p12c-host-reveal');

  // 10. П'єдестал.
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  expect(problems).toEqual([]);
}

it('part 12c: «Хто я?» at own pace — the editor switch on 375 px, each phone opens its own clues with «Ще підказка · ціна стане N %», the 1280 × 720 stage shows only the first clue and «Оля 1 · Петро 3 · Іра 2», the host sees «підказка 3/5» live, a pause disables the button, a reload keeps the own clues, different prices for the same right answer, and the reveal names the clue each answered on', async () => {
  try {
    await selfClues12c();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

function factsQuestions12d() {
  const common = { imageUrl: null, video: null, timeLimit: 20 };
  const f1 = {
    ...common,
    id: 'f1',
    type: 'single' as const,
    text: 'Яка найдовша річка України?',
    points: 100,
    options: [{ id: 'f1-a', text: 'Дніпро' }, { id: 'f1-b', text: 'Дністер' }, { id: 'f1-c', text: 'Південний Буг' }],
    correctId: 'f1-a',
  };
  const f2 = { ...common, id: 'f2', type: 'boolean' as const, text: 'Кит — риба', points: 200, correct: false };
  const f3 = {
    ...common,
    id: 'f3',
    type: 'bluff' as const,
    text: 'Яке озеро найглибше в Україні?',
    points: 300,
    accepted: ['Синевир'],
    lies: ['Світязь', 'Ялпуг', 'Кугурлуй'],
    choiceTime: 20,
  };
  const f4 = { ...common, id: 'f4', type: 'boolean' as const, text: 'Говерла — найвища гора України', points: 500, correct: true };
  const f5 = { ...common, id: 'f5', type: 'boolean' as const, text: 'Бджоли бачать ультрафіолет', points: 100, correct: true };
  return { f1, f2, f3, f4, f5 };
}

async function stats12d() {
  const host = await open('host12d', 375, 812);
  await register(host, 'host', 'Ліна Ведуча', 'host12d@example.com');

  const { f1, f2, f3, f4, f5 } = factsQuestions12d();
  const options = { speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES };
  const data = {
    ...makeRoundsQuiz(
      [
        classicRound('r1', [f1, f2, f3] as never, { ...options, title: 'Розминка' }),
        classicRound('r2', [f4] as never, { ...options, title: 'Ривок' }),
        classicRound('r3', [f5] as never, { ...options, title: 'Фініш' }),
      ],
      { leaderboard: 'end' },
    ),
    title: 'Цікавинки 12d',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Цікавинки 12d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage12d', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya12d', 375, 812);
  const petro = await open('petro12d', 375, 812);
  const ira = await open('ira12d', 375, 812);
  const marko = await open('marko12d', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await join(marko, code, 'Марко', false);
  await stage.getByText('Марко').waitFor();
  const phones = [olya, petro, ira, marko];
  const all = [host, stage, ...phones];
  const yes = '(^|\\s)Так$';
  const no = '(^|\\s)Ні$';
  const textOf = async (locator: Locator) => (await locator.textContent({ timeout: 500 }).catch(() => null))?.trim() ?? null;

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 1. f1 — рядок розкриття: Оля перша, далі Іра, Марко й Петро (помиляється).
  await stage.getByText('Яка найдовша річка України?', exact).waitFor();
  await pickOption(olya, 'Дніпро');
  await sleep(1500);
  await pickOption(ira, 'Дніпро');
  await pickOption(marko, 'Дніпро');
  await pickOption(petro, 'Дністер');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await stage.locator('.stage .lead.answer').waitFor();
  await expect.poll(() => revealLine(stage), POLL).toMatch(/^Правильно 3 з 4 · найшвидше — Оля, \d+,\d\u00a0с$/);
  expect(await stage.locator('.reveal-facts.is-big').count()).toBe(1);
  await expect.poll(() => revealLine(olya), POLL).toBe('Твоя правильна відповідь — найшвидша!');
  await expect.poll(() => revealLine(ira), POLL).toMatch(/^Твоя правильна відповідь — (2-а|3-я) за швидкістю$/);
  await expect.poll(() => revealLine(petro), POLL).toBe('Правильно відповіли 75\u00a0%');
  await expect.poll(() => revealLine(host), POLL).toMatch(/^Правильно 3 з 4 · найшвидше — Оля/);
  await expectStageInView(stage, 'p12d-stage-reveal');
  await shot(stage, 'p12d-stage-reveal');
  await expectNoSideScroll(ira, 'p12d-phone-reveal');
  await shot(ira, 'p12d-phone-reveal');
  await shot(host, 'p12d-host-reveal');

  // 2. f2 — самотній геній: права лише Іра.
  await click(host, 'Далі');
  await afterSplash(...all);
  await stage.getByText('Кит — риба', exact).waitFor();
  await sleep(1500);
  await pickOption(ira, no);
  for (const page of [olya, petro, marko]) await pickOption(page, yes);
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await expect.poll(() => revealLine(stage), POLL).toMatch(/^Правильно 1 з 4/);

  // 3. f3 — блеф: вигадку Петра обирають Оля й Марко; рядок — лише після правди.
  await click(host, 'Далі');
  await afterSplash(...all);
  await stage.getByText('Вигадайте відповідь на телефоні', exact).waitFor();
  await writeLie(petro, 'Ворскла');
  await writeLie(olya, 'Тиса');
  await writeLie(ira, 'Десна');
  await writeLie(marko, 'Рось');
  await stage.getByText('Що з цього правда?', exact).waitFor();
  await expect.poll(() => olya.locator('.bluff-choice button').count(), POLL).toBe(5);
  await sleep(1500);
  await pickBluff(olya, 'ворскла');
  await pickBluff(marko, 'ворскла');
  await pickBluff(ira, 'синевир');
  await pickBluff(petro, 'рось');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Відкрити всі', ...exact }).waitFor();
  await stage.waitForTimeout(500);
  expect(await stage.locator('.reveal-facts').count(), 'the bluff line before the truth').toBe(0);
  const beforeTruth = stageFrames.length;
  await click(host, 'Відкрити всі');
  await expect.poll(() => stage.locator('.bluff-row:not(.is-closed)').count(), POLL).toBe(5);
  await expect.poll(() => revealLine(stage), POLL).toBe('Найбільше голосів: вигадка від Петро — 2 голоси');
  expect(await stage.locator('.stage-bluff .reveal-facts').count()).toBe(1);
  await expect.poll(() => stage.locator('.bluff-row.is-flipping').count(), POLL).toBe(0);
  await expectStageInView(stage, 'p12d-stage-bluff');
  await shot(stage, 'p12d-stage-bluff');

  // 4. Підсумки раунду 1: три картки праворуч від таблиці, «Твій раунд», частки на пульті.
  await click(host, 'Далі');
  const roundFacts = stage.locator('aside.round-facts');
  await roundFacts.waitFor();
  await stage.locator('.stage-board.is-round-end.has-facts').waitFor();
  await roundFacts.getByRole('heading', { name: 'Цікавинки раунду', ...exact }).waitFor();
  expect(await roundFacts.locator('.fact-title').allTextContents()).toEqual(['⚡ Блискавка', '🎯 Снайпер', '🔥 Серія']);
  expect(await roundFacts.locator('.fact-streak .fact-body').textContent()).toContain('Іра');
  // Після раунду раунд запитання не називається: «запитання 1», а не «запитання 1 раунду 1».
  const roundLightning = await textOf(roundFacts.locator('.fact-lightning .fact-body'));
  expect(roundLightning).toMatch(/запитання \d+$/);
  expect(roundLightning).not.toContain('раунду');
  await stage.locator('.round-best').waitFor();
  await afterSplash(stage);
  await expectStageInView(stage, 'p12d-stage-round1');
  await shot(stage, 'p12d-stage-round1');

  const olyaRound = olya.locator('section.round-card');
  await olyaRound.getByRole('heading', { name: 'Твій раунд', ...exact }).waitFor();
  expect(await textOf(olyaRound.locator('p'))).toMatch(
    // Перший раунд: місця «до» немає (саме місце вже над карткою), серія 0 — без частини.
    /^правильно 1 з 3 · середній час \d+,\d\u00a0с · найшвидша \d+,\d\u00a0с · тебе обдурили 1 раз$/,
  );
  const olyaCards = olya.locator('section.fact-cards');
  await olyaCards.getByRole('heading', { name: 'Цікавинки раунду', ...exact }).waitFor();
  expect(await olyaCards.locator('.fact-card').count()).toBe(3);
  await expectNoSideScroll(olya, 'p12d-phone-round1');
  await shot(olya, 'p12d-phone-round1');

  const shares = host.locator('ol.round-shares[aria-label="Запитання раунду"] li');
  await expect.poll(() => shares.count(), POLL).toBe(3);
  expect(await textOf(shares.first().locator('.name'))).toBe('1. Яка найдовша річка України?');
  expect(await shares.first().locator('.name').getAttribute('title')).toBe('Яка найдовша річка України?');
  expect(await shares.locator('.score').allTextContents()).toEqual(['3 з 4', '1 з 4', '1 з 4']);
  expect(await host.locator('section.fact-cards .fact-card').count()).toBe(3);
  await expectNoSideScroll(host, 'p12d-host-round1');
  expect(await host.evaluate(HEADER_ONE_LINE), 'the host header wraps on the round end').toBe(true);
  await shot(host, 'p12d-host-round1');

  // 5. Раунд 2 — ривок Петра з другого місця.
  await click(host, 'Наступний раунд');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);
  await stage.getByText('Говерла — найвища гора України', exact).waitFor();
  await pickOption(petro, yes);
  for (const page of [olya, ira, marko]) await pickOption(page, no);
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  const petroRound = petro.locator('section.round-card');
  await petroRound.waitFor();
  // Після раунду 1: Іра 600, Петро 300 (дві обдурені), Марко 250, Оля 100.
  expect(await textOf(petroRound.locator('p'))).toContain('місце: 2 → 1');
  await expectNoSideScroll(petro, 'p12d-phone-round2');
  await shot(petro, 'p12d-phone-round2');

  // 6. Раунд 3 і кінець: п'єдестал чекає ведучого, далі «Нагороди гри».
  await click(host, 'Наступний раунд');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);
  await stage.getByText('Бджоли бачать ультрафіолет', exact).waitFor();
  await sleep(500);
  for (const page of phones) await pickOption(page, yes);
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await afterSplash(...all);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await stage.waitForTimeout(5000);
  expect(await stage.locator('.is-award').count(), 'the awards started without the host').toBe(0);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  const hostAwards = host.locator('section.fact-cards');
  await hostAwards.getByRole('heading', { name: 'Нагороди гри', ...exact }).waitFor();
  const awardTitles = await hostAwards.locator('.fact-title').allTextContents();
  expect(awardTitles).toEqual(['⚡ Блискавка', '🎯 Снайпер', '🔥 Серія', '📈 Камбек гри', '🎭 Майстер блефу', '🧠 Самотній геній']);
  expect(await host.evaluate(HEADER_ONE_LINE), 'the host header wraps on the podium').toBe(true);
  await expectNoSideScroll(host, 'p12d-host-awards');
  await shot(host, 'p12d-host-awards');
  const awardTitle = stage.locator('.awards-live[aria-live="polite"] .stage-board.is-award .award-title');
  await click(host, 'Нагороди на сцені');
  await expect.poll(() => textOf(awardTitle), POLL).toBe('⚡ Блискавка');
  expect(await textOf(stage.locator('.is-award .meta'))).toBe(`Нагороди гри · 1 з ${awardTitles.length}`);
  expect(await stage.locator('.is-award .award-body').textContent()).toMatch(/\d+,\d\u00a0с/);
  await expectStageInView(stage, 'p12d-stage-awards');
  await shot(stage, 'p12d-stage-awards');
  await click(host, 'Наступна нагорода');
  await expect.poll(() => textOf(awardTitle), POLL).toBe('🎯 Снайпер');
  // Далі слайди йдуть самі по 4 с, після останнього — знову п'єдестал.
  const shown = ['⚡ Блискавка', '🎯 Снайпер'];
  const until = Date.now() + 40_000;
  while (Date.now() < until) {
    const now = await textOf(awardTitle);
    if (now === null) break;
    if (shown.at(-1) !== now) shown.push(now);
    await stage.waitForTimeout(200);
  }
  expect(shown).toEqual(awardTitles);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await stage.waitForTimeout(4500);
  expect(await stage.locator('.is-award').count(), 'the carousel went round again').toBe(0);

  const gameCard = olya.locator('section.game-card');
  await gameCard.getByRole('heading', { name: 'Твоя гра', ...exact }).waitFor();
  // Місце стоїть над карткою, у самій картці його немає.
  expect(await gameCard.locator('.lead').count()).toBe(0);
  expect(await gameCard.locator('.round-bars[role="img"] .round-bar').count()).toBe(3);
  const gameLines = (await gameCard.locator('li').allTextContents()).map((line) => line.trim());
  expect(gameLines).toContain('Точність: 40\u00a0% (2 з 5)');
  expect(gameLines).toContain('Блеф: тебе обдурили 1 раз');
  await expectNoSideScroll(olya, 'p12d-phone-game');
  await shot(olya, 'p12d-phone-game');

  // 7. Таємність у кадрах.
  const olyaViews = stateViews(olyaFrames);
  expect(olyaViews.some((view) => view.own?.round?.correct === 1 && view.own.round.answered === 3), 'Оля never got her round card').toBe(true);
  const petroCards = new Set<string>();
  for (const view of stateViews(petroFrames)) {
    if (view.own?.round) petroCards.add(JSON.stringify(view.own.round));
    if (view.own?.game) petroCards.add(JSON.stringify(view.own.game));
  }
  expect(petroCards.size, 'Петро never got his cards').toBeGreaterThan(1);
  for (const view of olyaViews) {
    if (view.own?.round) expect(petroCards.has(JSON.stringify(view.own.round)), 'Оля got the round card of Петро').toBe(false);
    if (view.own?.game) expect(petroCards.has(JSON.stringify(view.own.game)), 'Оля got the game card of Петро').toBe(false);
  }
  const olyaText = olyaFrames.join(NL);
  for (const card of petroCards) expect(olyaText.includes(card), 'a card of Петро reached Оля').toBe(false);
  expect(stageFrames.length).toBeGreaterThan(0);
  const stageText = stageFrames.join(NL);
  expect(stageText, 'the stage got own facts').not.toContain('"own":{');
  expect(stageText, 'the stage got the question shares').not.toContain('"roundQuestions":[');
  expect(stageText, 'the stage never got the bluff line').toMatch(/"bluff":\{"names"/);
  expect(stageFrames.slice(0, beforeTruth).join(NL), 'the stage got the bluff line before the truth').not.toMatch(/"bluff":\{"names"/);

  // 8. Історія: ті самі нагороди й таблиця учасників.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Цікавинки 12d/ }).click();
  await host.getByRole('heading', { name: 'Нагороди гри', ...exact }).waitFor();
  expect(await host.locator('.fact-card .fact-title').allTextContents()).toEqual(awardTitles);
  await host.getByRole('heading', { name: 'Учасники', ...exact }).waitFor();
  const table = host.getByRole('table', { name: 'Учасники', ...exact });
  expect((await table.locator('thead th').allTextContents()).map((text) => text.trim())).toEqual(['Учасник', 'Точність', 'Середній час', 'Найкраща серія']);
  const iraCells = (await table.locator('tbody tr', { hasText: 'Іра' }).locator('th, td').allTextContents()).map((text) => text.trim());
  expect(iraCells).toHaveLength(4);
  expect(iraCells[0]).toBe('Іра');
  expect(iraCells[1]).toBe('80\u00a0% (4 з 5)');
  expect(iraCells[2]).toMatch(/^\d+,\d\u00a0с$/);
  expect(iraCells[3]).toBe('3');
  await expectNoSideScroll(host, 'p12d-history');
  await shot(host, 'p12d-history');

  expect(problems).toEqual([]);
}

it('part 12d: in-game stats — «Правильно 3 з 4 · найшвидше — Оля» under the answer on the 1280 × 720 stage and the own speed place on a 375 phone, the best bluff after the truth, three «Цікавинки раунду» beside the round end table, «Твій раунд» with «місце: 2 → 1» on the phone, question shares on the host, «Нагороди гри» moved by the host after the podium, «Твоя гра» with round bars, the same awards in the history, and no other player card in phone frames', async () => {
  try {
    await stats12d();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/**
 * Телефон, який уміє «ховатися» (12e): у headless-браузері visibilityState не змінюється сам, тож геттери document.visibilityState
 * і document.hidden читають window.__vis; AudioContext.prototype.createOscillator рахує виклики у window.__osc (сирена тривоги).
 * Скрипт стоїть на сторінці, тож переживає оновлення.
 */
const AWAY_PHONE_INIT = `(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis ?? 'visible' });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => (window.__vis ?? 'visible') === 'hidden' });
  window.__osc = 0;
  const Context = window.AudioContext ?? window.webkitAudioContext;
  if (Context) {
    const create = Context.prototype.createOscillator;
    Context.prototype.createOscillator = function (...args) {
      window.__osc += 1;
      return create.apply(this, args);
    };
  }
})()`;

/** Сторінка ховається чи повертається (12e): visibilityState і hidden підмінено (AWAY_PHONE_INIT), подія visibilitychange — як у справжнього телефона. */
async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate(`window.__vis = '${hidden ? 'hidden' : 'visible'}'; document.dispatchEvent(new Event('visibilitychange'));`);
}

/** Позначки «🙈» пульта на 375 px: рядок і чип не прокручуються вбік, позначка всередині свого рядка чи чипа. */
const AWAY_MARKS_FIT = `(() => {
  const out = [];
  for (const mark of document.querySelectorAll('.live-away, .response-away')) {
    const holder = mark.closest('.live-row, .live-chip, li') ?? mark.parentElement;
    const r = mark.getBoundingClientRect();
    const box = holder.getBoundingClientRect();
    if (r.left < box.left - 1 || r.right > box.right + 1 || r.right > innerWidth) out.push('mark out of its row: ' + mark.textContent);
    if (holder.scrollWidth > holder.clientWidth + 1) out.push('row scrolls sideways: ' + holder.textContent);
  }
  return out;
})()`;

function awayQuestions12e() {
  const common = { imageUrl: null, video: null };
  const a1 = {
    ...common,
    id: 'a1',
    type: 'single' as const,
    text: 'Яка річка тече через Київ?',
    points: 200,
    // Довше за 30 с: тривога, оновлення сторінки й кадри йдуть, поки Оля ще не відповіла.
    timeLimit: 60,
    options: [{ id: 'a1-a', text: 'Дніпро' }, { id: 'a1-b', text: 'Десна' }, { id: 'a1-c', text: 'Рось' }],
    correctId: 'a1-a',
  };
  const a2 = { ...common, id: 'a2', type: 'boolean' as const, text: 'Пінгвіни живуть в Антарктиді', points: 100, timeLimit: 30, correct: true };
  return { a1, a2 };
}

async function away12e() {
  const host = await open('host12e', 375, 812);
  await register(host, 'host', 'Ліна Ведуча', 'host12e@example.com');

  const { a1, a2 } = awayQuestions12e();
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [a1, a2] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES })], {
      leaderboard: 'each',
      awayPenalty: true,
    }),
    title: 'Антигугл 12e',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Редактор на 375 px: прапорець «Штраф за вихід із гри» позначено, довідка поруч.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Антигугл 12e' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  await host.locator('details.rules').first().locator('summary').click();
  const penaltySwitch = host.getByLabel('Штраф за вихід із гри', exact);
  await penaltySwitch.waitFor();
  expect(await penaltySwitch.isChecked()).toBe(true);
  await host.getByText(/Якщо гравець пробув поза грою від 3/).waitFor();
  await penaltySwitch.scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p12e-editor');
  // На кадрі всієї сторінки прапорець ховається під липкими панелями: окремий кадр екрана з прапорцем посередині.
  await penaltySwitch.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  if (process.env.E2E_SHOTS === '1') await host.screenshot({ path: resolve(ARTIFACTS, 'shots', 'p12e-editor-switch.png') });
  await host.getByRole('button', { name: 'Довідка: Поза грою й штраф за вихід', ...exact }).click();
  const help = host.getByRole('dialog', { name: 'Поза грою й штраф за вихід', ...exact });
  await help.getByText(/вкривається червоним/).first().waitFor();
  await expectNoSideScroll(host, 'p12e-editor-help');
  await host.keyboard.press('Escape');
  await help.waitFor({ state: 'detached' });

  // Гра.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Антигугл 12e' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage12e', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya12e', 375, 812);
  const petro = await open('petro12e', 375, 812);
  const ira = await open('ira12e', 375, 812);
  for (const page of [olya, petro, ira]) await page.addInitScript(AWAY_PHONE_INIT);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const iraFrames = socketFrames(ira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').waitFor();
  const phones = [olya, petro, ira];
  const all = [host, stage, ...phones];
  const yes = '(^|\\s)Так$';

  const textOf = async (locator: Locator) => squash(await locator.first().textContent({ timeout: 500 }).catch(() => null)) || null;
  const chipAway = (name: string) => host.locator('#live-answers .live-chip', { hasText: name }).locator('.live-away');
  const rowAway = (name: string) => liveRow(host, name).locator('.live-away');
  const alarm = (page: Page) => page.locator('.away-alarm');
  const oscillators = async (page: Page) => (await page.evaluate('window.__osc ?? 0')) as number;
  const sheet = host.locator('.undo-sheet');
  const openUndo = async () => {
    await host.locator('header.bar').getByRole('button', { name: '↶ Бали', ...exact }).click();
    await sheet.getByRole('heading', { name: 'Скасування балів', ...exact }).waitFor();
  };
  const closeUndo = async () => {
    await host.keyboard.press('Escape');
    await sheet.waitFor({ state: 'detached' });
  };
  const undoRow = (text: string) => sheet.locator('li.undo-row', { has: host.locator('.undo-row-text', { hasText: new RegExp(`^${text}$`) }) });
  const playerRow = (name: string) => host.locator('.player-row', { has: host.locator('.name', { hasText: new RegExp(`^${name}$`) }) });
  const rowScore = async (name: string) => (await playerRow(name).locator('.score').textContent())?.trim();
  const noticeText = async (page: Page) => textOf(page.locator('.live-notice.is-undo'));
  const expectMarksFit = async (name: string) => {
    expect(await host.evaluate(AWAY_MARKS_FIT), `${name}: an away mark overflows`).toEqual([]);
    expect(await host.evaluate(HEADER_ONE_LINE), `${name}: the host header wraps`).toBe(true);
  };
  /** Рядок сцени «🙈 …»: в один рядок, без секунд, з повним списком у title. */
  const expectStageLine = async (name: string, names: string) => {
    const line = stage.locator('header.bar .away-line');
    await expect.poll(() => textOf(line), POLL).toBe(`🙈 ${names}`);
    expect(await line.getAttribute('title')).toBe(names);
    expect(squash(await line.textContent())).not.toMatch(/\d+\s?с/);
    const box = (await line.boundingBox())!;
    const lineHeight = (await stage.evaluate("parseFloat(getComputedStyle(document.querySelector('header.bar .away-line')).lineHeight) || 40")) as number;
    expect(box.height, `${name}: the away line wraps`).toBeLessThan(lineHeight * 1.5);
  };

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 2. a1: Іра відповідає, Оля ховає телефон уже після заставки.
  await stage.getByText('Яка річка тече через Київ?', exact).waitFor();
  await olya.getByRole('button', { name: /Дніпро/ }).waitFor();
  // Петро відповідає після оновлення сторінки Олі: поки Оля без зв'язку, а решта відповіла, запитання закрилося б.
  await pickOption(ira, 'Дніпро');
  await setHidden(olya, true);
  await expect.poll(() => textOf(chipAway('Оля')), POLL).toBe('🙈 зараз поза грою');
  expect(await chipAway('Петро').count()).toBe(0);
  await expectMarksFit('p12e-host-out');
  await expectNoSideScroll(host, 'p12e-host-out');
  await sleep(4000);
  await setHidden(olya, false);

  // 3. Тривога лише на телефоні Олі: червоний шар на весь екран, сирена, штраф.
  await alarm(olya).waitFor();
  expect(await alarm(olya).getAttribute('role')).toBe('alert');
  expect(squash(await olya.locator('.away-alarm-title').textContent())).toContain('Вихід із гри під час запитання!');
  expect(squash(await olya.locator('.away-alarm-penalty').textContent())).toBe('0 балів за це запитання');
  expect(await alarm(olya).boundingBox()).toEqual({ x: 0, y: 0, width: 375, height: 812 });
  await expect.poll(() => oscillators(olya), POLL).toBeGreaterThanOrEqual(1);
  await expectNoSideScroll(olya, 'p12e-phone-alarm');
  for (const page of [petro, ira]) expect(await alarm(page).count(), 'another phone got the alarm').toBe(0);
  const seen = (await olya.evaluate("localStorage.getItem('quiz:alarm')")) as string;
  expect(seen).toMatch(new RegExp(`^${code}:[^:]+:0:1$`));
  // Шар зникає сам за 2,5 с.
  await expect.poll(() => alarm(olya).count(), { timeout: 4000 }).toBe(0);
  const note = olya.locator('.away-note');
  await expect.poll(() => textOf(note), POLL).toMatch(/^Тебе не було в грі [45] с — ведучий і екран це бачать ?За це запитання буде 0 балів$/);
  await expectNoSideScroll(olya, 'p12e-phone-note');

  // 4. Позначки: пульт із секундами, сцена — лише ім'я.
  await expect.poll(() => textOf(chipAway('Оля')), POLL).toMatch(/^🙈 поза грою [45] с \(1 раз\)$/);
  await expectMarksFit('p12e-host-mark');
  await expectNoSideScroll(host, 'p12e-host-mark');
  await expectStageLine('p12e-stage-mark', 'Оля');
  await expectStageInView(stage, 'p12e-stage-mark');
  await shot(stage, 'p12e-stage-mark');

  // 5. Оновлення сторінки не повторює тривогу; рядок під запитанням лишається.
  await olya.reload();
  await note.waitFor();
  for (let i = 0; i < 8; i += 1) {
    expect(await alarm(olya).count(), 'the alarm came back after a reload').toBe(0);
    await olya.waitForTimeout(250);
  }
  expect(await olya.evaluate("localStorage.getItem('quiz:alarm')")).toBe(seen);

  // 6. Петро помиляється, Оля відповідає правильно; на розкритті позначка в таблиці відповідей і на сцені, бали ще 200.
  await pickOption(petro, 'Десна');
  await pickOption(olya, 'Дніпро');
  await host.getByText('Запитання закрите').waitFor();
  await expect.poll(() => textOf(rowAway('Оля')), POLL).toMatch(/^🙈 поза грою [45] с \(1 раз\)$/);
  await expectMarksFit('p12e-host-locked');
  await shot(host, 'p12e-host-locked');
  await click(host, 'Показати відповідь');
  const responseAway = host.locator('.response-away');
  await expect.poll(() => responseAway.count(), POLL).toBe(1);
  expect(squash(await responseAway.textContent())).toMatch(/^🙈 поза грою [45] с \(1 раз\)$/);
  expect(await host.locator('li', { has: responseAway }).last().textContent()).toContain('Оля');
  // Позначка не стискає відповідь до «Дніп / ро»: відповідь Олі — в один рядок.
  const given = (await host.evaluate(`(() => {
    const el = document.querySelector('.rows > li:has(.response-away) .given');
    return { height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) || 24 };
  })()`)) as { height: number; line: number };
  expect(given.height, 'the away mark squeezes the answer').toBeLessThan(given.line * 1.5);
  await expectStageLine('p12e-stage-reveal', 'Оля');
  await expect.poll(() => rowScore('Оля'), POLL).toBe('200');
  // Пульт уже на розкритті знає, що штраф зніме ці бали.
  await host.locator('.rows > li:has(.response-away) .response-penalty', { hasText: '→ 0 (вихід із гри)' }).waitFor();
  await expectMarksFit('p12e-host-reveal');
  await expectNoSideScroll(host, 'p12e-host-reveal');
  await shot(stage, 'p12e-stage-reveal');

  // 7. Штраф на виході з розкриття: Оля 0, Іра 200; рядок «(вихід із гри)» в аркуші.
  await click(host, 'Далі');
  await expect.poll(() => rowScore('Оля'), POLL).toBe('0');
  expect(await rowScore('Іра')).toBe('200');
  await openUndo();
  await expect.poll(() => undoRows(sheet), POLL).toEqual(['Оля +200', 'Іра +200', 'Оля −200 (вихід із гри)']);
  await expectNoSideScroll(host, 'p12e-host-sheet');

  // 8. Скасування штрафу: бали повертаються, сповіщення на сцені й телефонах.
  const olyaPenalty = undoRow('Оля −200 \\(вихід із гри\\)');
  await olyaPenalty.getByRole('button', { name: 'Скасувати', ...exact }).click();
  await expect.poll(() => olyaPenalty.getAttribute('class'), POLL).toBe('undo-row is-undone');
  await olyaPenalty.getByRole('button', { name: 'Повернути', ...exact }).waitFor();
  const undone = 'Ведучий скасував бали: Оля +200 (запитання 1)';
  await Promise.all([stage, olya, petro].map((page) => expect.poll(() => noticeText(page), POLL).toBe(undone)));
  await shot(host, 'p12e-host-sheet-undone');
  await closeUndo();
  await expect.poll(() => rowScore('Оля'), POLL).toBe('200');

  // 9. a2: Оля й Іра без виходу; Петро ховає телефон на 4 с, тривогу закриває дотиком.
  await click(host, 'Наступне запитання');
  await afterSplash(...all);
  await stage.getByText('Пінгвіни живуть в Антарктиді', exact).waitFor();
  await petro.getByRole('button', { name: new RegExp(yes) }).waitFor();
  await pickOption(olya, yes);
  await pickOption(ira, yes);
  await setHidden(petro, true);
  await expect.poll(() => textOf(chipAway('Петро')), POLL).toBe('🙈 зараз поза грою');
  await sleep(4000);
  await setHidden(petro, false);
  await alarm(petro).waitFor();
  expect(squash(await petro.locator('.away-alarm-penalty').textContent())).toBe('0 балів за це запитання');
  for (const page of [olya, ira]) expect(await alarm(page).count(), 'another phone got the alarm on a2').toBe(0);
  await alarm(petro).click();
  await expect.poll(() => alarm(petro).count(), { timeout: 1000 }).toBe(0);
  await pickOption(petro, yes);
  await host.getByText('Запитання закрите').waitFor();
  expect(await rowAway('Оля').count(), 'Оля has a mark on a2').toBe(0);
  expect(await rowAway('Іра').count(), 'Іра has a mark on a2').toBe(0);
  await click(host, 'Показати відповідь');
  await expectStageLine('p12e-stage-a2', 'Петро');
  expect(await host.locator('.response-away').count()).toBe(1);
  await click(host, 'Далі');
  await afterSplash(...all);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  // 10. Після кінця гри «↶ Бали» лишається лише зі штрафами; штраф Петра скасовується й зараз.
  const finalScore = async (name: string) =>
    (await host.locator('.standings li', { has: host.locator('.name', { hasText: new RegExp(`^${name}`) }) }).locator('.score').textContent())?.trim();
  await expect.poll(() => finalScore('Петро'), POLL).toBe('0');
  await openUndo();
  await expect.poll(() => undoRows(sheet), POLL).toEqual(['Петро −100 (вихід із гри)', 'Оля −200 (вихід із гри)']);
  const petroPenalty = undoRow('Петро −100 \\(вихід із гри\\)');
  await petroPenalty.getByRole('button', { name: 'Скасувати', ...exact }).click();
  await expect.poll(() => petroPenalty.getAttribute('class'), POLL).toBe('undo-row is-undone');
  await expectNoSideScroll(host, 'p12e-host-sheet-finished');
  await closeUndo();
  await expect.poll(() => finalScore('Петро'), POLL).toBe('100');
  expect(await host.evaluate(HEADER_ONE_LINE), 'the host header wraps on the podium').toBe(true);

  // 11. «Твоя гра» Олі: «🙈 Поза грою: на 1 запитанні»; у Іри цього рядка немає.
  const gameLines = async (page: Page) => (await page.locator('section.game-card li').allTextContents()).map(squash);
  await olya.locator('section.game-card').waitFor();
  expect(await gameLines(olya)).toContain('🙈 Поза грою: на 1 запитанні');
  await ira.locator('section.game-card').waitFor();
  expect((await gameLines(ira)).some((line) => line.includes('🙈'))).toBe(false);
  await expectNoSideScroll(olya, 'p12e-phone-game');

  // 12. Таємність у кадрах: сцена — лише імена; чужі виходи до телефонів не доходять.
  expect(stageFrames.length).toBeGreaterThan(0);
  const stageViews = stateViews(stageFrames) as unknown as { away?: unknown }[];
  expect(stageViews.length).toBeGreaterThan(0);
  for (const view of stageViews) {
    expect(Array.isArray(view.away), 'the stage away is not a list').toBe(true);
    expect((view.away as unknown[]).every((x) => typeof x === 'string'), 'the stage got more than names').toBe(true);
  }
  expect(stageViews.some((view) => (view.away as string[]).includes('Оля')), 'the stage never got «Оля»').toBe(true);
  const stageText = stageFrames.join(NL);
  expect(stageText).not.toContain('"lastAway"');
  expect(stageText).not.toMatch(/"away":\[[^\]]*\{/);
  const iraViews = stateViews(iraFrames);
  expect(iraViews.length).toBeGreaterThan(0);
  for (const view of iraViews) {
    expect(view.away, 'Іра got an away').toBeNull();
    expect(view.lastAway, 'Іра got a last away').toBeNull();
  }
  for (const view of stateViews(petroFrames)) {
    expect(view.away?.play ?? 1, 'Петро got the away of a1').not.toBe(0);
    expect(view.lastAway?.play ?? 1, 'Петро got the last away of a1').not.toBe(0);
  }
  expect(petroFrames.join(NL)).not.toContain('Тебе не було');
  const olyaViews = stateViews(olyaFrames);
  expect(olyaViews.some((view) => view.away?.play === 0 && view.away.ms >= 2000), 'Оля never got her own away').toBe(true);
  for (const view of olyaViews) expect(view.away?.play ?? 0, 'Оля got the away of a2').not.toBe(1);

  // 13. Історія: 🙈 біля відповіді Олі, рядки скасування, розбивка «Вихід із гри».
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Антигугл 12e/ }).click();
  const section = host.locator('section.history-scores');
  await section.getByRole('heading', { name: 'Бали за раундами', ...exact }).waitFor();
  const answers = host.locator('details.responses').first();
  await answers.locator('summary').click();
  const responseOf = (name: string) => answers.locator('li', { has: host.locator('.responses-name', { hasText: new RegExp(`^${name}$`) }) });
  expect(squash(await responseOf('Оля').locator('.history-away').textContent())).toMatch(/^🙈 [45] с$/);
  expect(await responseOf('Іра').locator('.history-away').count()).toBe(0);
  const undoLines = (await host.locator('.history-undo').allTextContents()).map(squash);
  expect(undoLines).toContain('↶ Скасовано: Оля +200 (вихід із гри)');
  expect(undoLines).toContain('↶ Скасовано: Петро +100 (вихід із гри)');
  await section.locator('button.score-row-toggle', { hasText: 'Петро' }).click();
  await section.locator('.score-breakdown').waitFor();
  expect(await breakdownTexts(section)).toContain('Вихід із гри −100');
  await expectNoSideScroll(host, 'p12e-history');

  expect(problems).toEqual([]);
}

it('part 12e: anti-googling — a phone hidden for 4 s during a question gives «🙈 поза грою 4 с (1 раз)» on the 375 host and only «🙈 Оля» on the 1280 × 720 stage, the phone turns red with «Вихід із гри під час запитання!», the siren and «0 балів за це запитання» once per leave even after a reload, the penalty zeroes the right answer when the reveal ends, the host undoes «Оля −200 (вихід із гри)» and the points come back, a penalty is undone after the finish too, the editor shows the switch, the history shows 🙈, and no seconds reach the stage or other phones', async () => {
  try {
    await away12e();
  } catch (error) {
    await snapshot();
    throw error;
  }
});
