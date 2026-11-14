import { blitzRound, classicRound, finalRound, ladderRound, makeRoundsQuiz, single, survivalRound, wipeoutRound, withId, withPoints } from '@quiz/engine/testing';
import { DEFAULT_RULES } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { open, click, field, join, openRoundSettings, bodyText, expectNoSideScroll, stat, register, POLL, socketFrames, takeBuff, tapBuff, pickOption, numericAnswer, vote, RESTARTING_TEXT, toNextQuestion, framesBeforeReveal, totalOf, expectStageFits, expectStageInView, writeLie, pickBluff, decide, choiceOf, sideRow, NL, framesUntilNextReveal, survivalGroupOf, podiumScore, openTrialLeaks, pickTeamOn, stageTeam, sentFrames, teamRowOf, teamTotal, frame } from './helpers/common';
import { exact, ctx, base, problems, rigged, snapshot, afterSplash, shot, restart, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 10f–10j: блеф, ва-банк, виживання, драбина, команди.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

/** Тексти відкритих варіантів на сторінці (зверху вниз). */
const openOptions = async (page: Page) => page.locator('.bluff-row:not(.is-closed) .bluff-text').allTextContents();

/** Рядок варіанта блефу з точним текстом. */
const bluffRow = (scope: Page | ReturnType<Page['locator']>, text: string) => {
  const owner = 'goto' in scope ? scope : scope.page();
  return scope.locator('.bluff-row').filter({ has: owner.locator('.bluff-text').getByText(text, exact) });
};

it('part 10f: bluff — the editor builds a bluff (375 px too), the truth is refused as a lie, equal lies merge, spares fill up to five, truth, spares and authors never leak before their time, the host removes a lie, options open one by one with the truth last, truth and fooled-player scoring', async () => {
  try {
    await bluffGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function bluffGame() {
  const host = await open('host10f', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10f@example.com');

  const common = { imageUrl: null, video: null };
  const b1 = {
    ...common,
    id: 'b1',
    type: 'bluff' as const,
    text: 'Ейфелеву вежу спершу пропонували поставити в …, але місто відмовилося.',
    points: 1000,
    timeLimit: 60,
    choiceTime: 30,
    accepted: ['Барселона', 'Барселоні'],
    lies: ['Мадрид', 'Лондон', 'Брюссель'],
  };
  // Південний Буг (806 км) — найдовша річка лише в Україні: Дніпро й Дністер довші, але течуть і в інших країнах.
  const b2 = {
    ...common,
    id: 'b2',
    type: 'bluff' as const,
    text: 'Найдовша річка, що тече лише Україною, — …',
    points: 1000,
    timeLimit: 60,
    choiceTime: 30,
    accepted: ['Південний Буг', 'Буг'],
    lies: ['Сула', 'Псел'],
  };
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
    ...makeRoundsQuiz([classicRound('r1', [b1, b2, q1] as never, { title: 'Блеф', speedBonus: true, rules: DEFAULT_RULES, shuffleOptions: false })], { leaderboard: 'end' }),
    title: 'Блеф 10f',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Блеф 10f' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  await host.getByRole('button', { name: /^Запитання 1 / }).click();
  expect(await field(host, 'Правда').inputValue()).toBe('Барселона');
  expect(await field(host, 'Написання 1').inputValue()).toBe('Барселоні');
  for (const [i, lie] of ['Мадрид', 'Лондон', 'Брюссель'].entries()) expect(await field(host, `Запасна вигадка ${i + 1}`).inputValue()).toBe(lie);
  expect(await field(host, 'Час на вигадки, с').inputValue()).toBe('60');
  expect(await field(host, 'Час на вибір, с').inputValue()).toBe('30');
  await shot(host, 'p10f-editor-bluff');

  await field(host, 'Запасна вигадка 3').fill('барселоні');
  await click(host, 'Зберегти');
  await host.getByText('запасна вигадка «барселоні» — це правда', { exact: false }).waitFor();
  await shot(host, 'p10f-editor-bluff-problem');
  await field(host, 'Запасна вигадка 3').fill('Брюссель');

  await host.setViewportSize({ width: 375, height: 812 });
  await field(host, 'Правда').scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10f-editor-bluff-375');
  await field(host, 'Час на вибір, с').scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10f-editor-bluff-375-end');
  await host.setViewportSize({ width: 1280, height: 900 });

  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as {
    rounds: { questions?: { id: string; choiceTime?: number; lies?: string[] }[] }[];
  };
  const storedB1 = stored.rounds[0]!.questions!.find((q) => q.id === 'b1')!;
  expect(storedB1.choiceTime).toBe(30);
  expect(storedB1.lies).toHaveLength(3);

  // 2. Гра.
  await host.locator('.quiz-list li', { hasText: 'Блеф 10f' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10f', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya10f', 375, 812);
  const petro = await open('petro10f', 375, 812);
  const vira = await open('vira10f', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const viraFrames = socketFrames(vira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(vira, code, 'Віра', false);
  await click(host, 'Почати гру');
  await afterSplash(host, olya, petro, vira, stage);
  await click(host, 'Почати раунд');
  await afterSplash(host, olya, petro, vira, stage);

  // 3. b1, вигадки.
  await stage.getByText('Вигадайте відповідь на телефоні', exact).waitFor();
  await shot(stage, 'p10f-stage-lies');
  await writeLie(olya, 'Рим');
  await olya.getByText('Твоя вигадка: «Рим»', { exact: false }).waitFor();
  await stage.getByText('Вигадали 1 з 3', exact).waitFor();

  await writeLie(petro, 'барселоні');
  await petro.getByText('Це правда! Вигадай щось інше', exact).waitFor();
  expect(await field(petro, 'Твоя вигадка').inputValue(), 'a refused lie stays in the field').toBe('барселоні');
  await expectNoSideScroll(petro, 'p10f-phone-truth-refused');
  await writeLie(petro, 'РИМ');
  await petro.getByText('Твоя вигадка: «РИМ»', { exact: false }).waitFor();
  await stage.getByText('Вигадали 2 з 3', exact).waitFor();

  const liveLies = host.locator('.bluff-live');
  await liveLies.getByText('Оля: Рим', exact).waitFor();
  await liveLies.getByText('Петро: РИМ', exact).waitFor();
  await shot(host, 'p10f-host-lies');

  // Витік (вигадки): ні правди, ні запасних, ні чужих вигадок.
  const liesFrames = { stage: stageFrames.length, olya: olyaFrames.length, petro: petroFrames.length, vira: viraFrames.length };
  for (const [who, frames, upTo] of [['stage', stageFrames, liesFrames.stage], ['olya', olyaFrames, liesFrames.olya], ['petro', petroFrames, liesFrames.petro], ['vira', viraFrames, liesFrames.vira]] as const) {
    const text = frames.slice(0, upTo).join('\n');
    for (const secret of ['Барселона', 'Мадрид', 'Лондон', 'Брюссель']) {
      const at = text.indexOf(secret);
      expect(at < 0, `${who} got «${secret}» during the lies: ${text.slice(Math.max(0, at - 150), at + 150)}`).toBe(true);
    }
  }
  for (const [who, frames, upTo] of [['stage', stageFrames, liesFrames.stage], ['vira', viraFrames, liesFrames.vira]] as const) {
    expect(frames.slice(0, upTo).join('\n').includes('Рим'), `${who} got a lie of another player during the lies`).toBe(false);
  }
  const fromChoice = { stage: stageFrames.length, olya: olyaFrames.length, petro: petroFrames.length, vira: viraFrames.length };

  await writeLie(vira, 'Мілан');

  // 4. b1, вибір.
  await stage.getByText('Що з цього правда?', exact).waitFor();
  await expect.poll(() => stage.locator('.bluff-row').count()).toBe(5);
  const stageChoice = await stage.locator('.bluff-text').allTextContents();
  expect(stageChoice.filter((text) => text === 'рим'), 'merged lie appears once').toHaveLength(1);
  expect(stageChoice).toEqual(expect.arrayContaining(['мілан', 'барселона']));
  expect(stageChoice.filter((text) => ['мадрид', 'лондон', 'брюссель'].includes(text)), 'two spares fill up to five').toHaveLength(2);
  await expectStageFits(stage, 'p10f-stage-choice');
  await shot(stage, 'p10f-stage-choice');

  await expect.poll(() => olya.locator('.bluff-choice button').count()).toBe(5);
  const olyaRim = olya.locator('.bluff-choice button').filter({ has: olya.getByText('рим', exact) });
  expect(await olyaRim.isDisabled()).toBe(true);
  await olyaRim.getByText('Твоя вигадка', exact).waitFor();
  expect(await olya.locator('.bluff-choice button:disabled').count()).toBe(1);
  for (const button of await olya.locator('.bluff-choice button').all()) expect((await button.boundingBox())!.height, 'option is a tap target').toBeGreaterThanOrEqual(44);
  await expectNoSideScroll(olya, 'p10f-phone-choice');
  await petro.locator('.bluff-choice button').first().waitFor();
  expect(await petro.locator('.bluff-choice button').filter({ has: petro.getByText('рим', exact) }).isDisabled()).toBe(true);
  expect(await petro.locator('.bluff-choice button:disabled').count()).toBe(1);

  // Витік (вибір): варіанти без виду, авторів і виборів.
  const choiceLeak = (who: string, frames: string[], from: number) => {
    const text = framesBeforeReveal(frames).slice(from).join('\n');
    for (const secret of [/"kind":"(truth|lie|spare)"/, /"authors":\["/, /"pickedBy":\["/]) {
      const at = text.search(secret);
      expect(at < 0, `${who} got ${secret} before the reveal: ${text.slice(Math.max(0, at - 150), at + 150)}`).toBe(true);
    }
  };
  choiceLeak('stage', stageFrames, fromChoice.stage);
  choiceLeak('olya', olyaFrames, fromChoice.olya);
  choiceLeak('petro', petroFrames, fromChoice.petro);
  choiceLeak('vira', viraFrames, fromChoice.vira);

  await pickBluff(olya, 'мілан');
  await pickBluff(petro, 'барселона');
  await pickBluff(vira, 'рим');
  await host.getByText('Запитання закрите').waitFor();

  const hostBoard = host.locator('.bluff-host .bluff-board');
  await hostBoard.waitFor();
  const rimRow = bluffRow(hostBoard, 'рим');
  expect(await rimRow.innerText()).toContain('Вигадка: Оля, Петро');
  expect(await rimRow.innerText()).toContain('Купилися: Віра');
  expect(await bluffRow(hostBoard, 'барселона').innerText()).toContain('Правда');
  expect(await host.getByRole('button', { name: /^(Правильно|Частково|Не зараховувати)/ }).count(), 'no grading buttons').toBe(0);
  await hostBoard.scrollIntoViewIfNeeded();
  await shot(host, 'p10f-host-choice');

  // 5. b1, розкриття.
  await click(host, 'Показати відповідь');
  await host.getByRole('button', { name: 'Відкрити варіант 1 з 5', ...exact }).waitFor();
  expect(await openOptions(stage), 'nothing is open yet').toEqual([]);
  const nextOption = host.getByRole('button', { name: /^Відкрити варіант / });
  expect((await nextOption.boundingBox())!.height, 'next option button is a tap target').toBeGreaterThanOrEqual(44);
  let afterFour: string[] = [];
  for (let n = 1; n <= 4; n += 1) {
    await host.getByRole('button', { name: `Відкрити варіант ${n} з 5`, ...exact }).click();
    await expect.poll(async () => (await openOptions(stage)).length).toBe(n);
    afterFour = await openOptions(stage);
    expect(afterFour, `the truth opens last, not at step ${n}`).not.toContain('барселона');
  }
  const opened = (await stage.locator('.bluff-row:not(.is-closed)').allInnerTexts()).join('\n');
  expect((opened.match(/Запасна вигадка ведучого/g) ?? []).length).toBe(2);
  const stageMilan = await bluffRow(stage, 'мілан').innerText();
  expect(stageMilan).toContain('Вигадка: Віра');
  expect(stageMilan).toContain('Купилися: Оля');
  expect(await bluffRow(stage, 'рим').innerText()).toContain('Вигадка: Оля, Петро');
  expect(await stage.locator('.bluff-row.is-truth').count(), 'the truth is not marked yet').toBe(0);
  expect(await stage.locator('.bluff-row.is-closed').count()).toBe(1);
  expect(await stage.locator('.bluff-row.is-closed .bluff-text').innerText()).toBe('барселона');
  await expect.poll(() => stage.locator('.bluff-row.is-flipping').count()).toBe(0);
  await expectStageFits(stage, 'p10f-stage-reveal-half');
  await shot(stage, 'p10f-stage-reveal-half');

  await petro.getByText('Правду відкриють останньою', exact).waitFor();
  expect(await bodyText(petro)).not.toContain('Ти знайшов правду');
  expect(await bodyText(petro)).not.toMatch(/1\s?500/);
  for (const [who, frames] of [['stage', stageFrames], ['olya', olyaFrames], ['petro', petroFrames], ['vira', viraFrames]] as const) {
    expect(frames.join('\n').includes('"kind":"truth"'), `${who} got the truth before it was opened`).toBe(false);
  }

  await host.getByRole('button', { name: 'Відкрити варіант 5 з 5', ...exact }).click();
  await expect.poll(async () => (await openOptions(stage)).length).toBe(5);
  expect((await openOptions(stage)).filter((text) => !afterFour.includes(text))).toEqual(['барселона']);
  const truthRow = bluffRow(stage, 'барселона');
  expect(await truthRow.innerText()).toContain('Правда');
  expect(await truthRow.innerText()).toContain('Купилися: Петро');
  await expect.poll(() => stage.locator('.bluff-row.is-flipping').count()).toBe(0);
  await expectStageFits(stage, 'p10f-stage-reveal-full');
  await shot(stage, 'p10f-stage-reveal-full');
  expect(await host.getByRole('button', { name: /^Відкрити/ }).count(), 'no open buttons once everything is open').toBe(0);

  await petro.getByText('Ти знайшов правду!', exact).waitFor();
  await petro.getByText('На твою вигадку купилися: 1', exact).waitFor();
  expect(await bodyText(petro)).toMatch(/1\s?500/);
  await expectNoSideScroll(petro, 'p10f-phone-result');
  expect(await totalOf(host, 'Оля')).toBe(500);
  expect(await totalOf(host, 'Петро')).toBe(1500);
  expect(await totalOf(host, 'Віра')).toBe(500);
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, vira, stage);

  // 6. b2: без вигадки, «До вибору», «Прибрати».
  await stage.getByText('Вигадайте відповідь на телефоні', exact).waitFor();
  await writeLie(olya, 'Дурня');
  await writeLie(petro, 'Сула');
  await stage.getByText('Вигадали 2 з 3', exact).waitFor();
  await click(host, 'До вибору');
  await stage.getByText('Що з цього правда?', exact).waitFor();
  await expect.poll(() => stage.locator('.bluff-row').count()).toBe(4);
  expect(await stage.locator('.bluff-text').allTextContents()).toEqual(expect.arrayContaining(['дурня', 'південний буг', 'псел', 'сула']));

  const removeLie = host.getByRole('button', { name: 'Прибрати «дурня»', ...exact });
  expect((await removeLie.boundingBox())!.height, 'remove is a tap target').toBeGreaterThanOrEqual(44);
  await removeLie.click();
  await expect.poll(() => stage.locator('.bluff-row').count()).toBe(3);
  await expect.poll(() => vira.locator('.bluff-choice button').count()).toBe(3);
  await expect.poll(() => olya.locator('.bluff-choice button').count()).toBe(3);
  expect(await stage.locator('.bluff-text').allTextContents()).not.toContain('дурня');
  expect(await vira.locator('.bluff-choice').innerText()).not.toContain('дурня');
  await host.locator('.bluff-row.is-removed').waitFor();
  await host.locator('.bluff-host').scrollIntoViewIfNeeded();
  await shot(host, 'p10f-host-removed');

  await pickBluff(olya, 'південний буг');
  await pickBluff(petro, 'псел');
  await pickBluff(vira, 'сула');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Відкрити всі');
  await expect.poll(() => openOptions(stage)).toHaveLength(3);
  expect(await openOptions(stage)).not.toContain('дурня');
  await expect.poll(() => stage.locator('.bluff-row.is-flipping').count()).toBe(0);
  await expectStageFits(stage, 'p10f-stage-reveal-b2');
  await shot(stage, 'p10f-stage-reveal-b2');
  expect(await totalOf(host, 'Оля')).toBe(1500);
  expect(await totalOf(host, 'Петро')).toBe(2000);
  expect(await totalOf(host, 'Віра')).toBe(500);
  await toNextQuestion(host);
  await afterSplash(host, olya, petro, vira, stage);

  // 7. q1.
  await stage.getByText('Кінець?', exact).waitFor();
  await olya.getByRole('button', { name: /Так/ }).click();
  await petro.getByRole('button', { name: /Так/ }).click();
  await vira.getByRole('button', { name: /Ні/ }).click();
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');

  // 8. Історія.
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Блеф 10f/ }).click();
  const items = host.locator('.rows.stacked > li');
  await items.first().waitFor();
  const first = items.filter({ hasText: 'Ейфелеву вежу' });
  const history1 = await first.locator('.history-bluff').innerText();
  expect(history1).toContain('Правда');
  expect(history1).toContain('Вигадка: Оля, Петро');
  expect(history1).toContain('Купилися: Віра');
  await first.getByText('Відповіді (3)').click();
  await first.locator('.responses li', { hasText: 'Оля' }).getByText('вигадка «Рим» · вибір «Мілан» ✗ · купилися: 1', { exact: false }).waitFor();
  const second = items.filter({ hasText: 'Найдовша річка' });
  const history2 = await second.locator('.history-bluff').innerText();
  expect(history2).toContain('Дурня');
  expect(history2).toContain('Прибрано');
  await shot(host, 'p10f-history');

  expect(problems).toEqual([]);
}

/** Стан гравця на драбині сцени чи пульта: текст групи, у якій стоїть нікнейм. */
async function ladderGroupOf(page: Page, nickname: string): Promise<string> {
  const group = page.locator('.wipeout-group').filter({ has: page.locator('li .name', { hasText: new RegExp(`^${nickname}$`) }) });
  // Група вибору на сцені (11e) без h3: її назва — в aria-label.
  if ((await group.locator('h3').count()) === 0) return (await group.first().getAttribute('aria-label'))!.trim();
  return (await group.locator('h3').first().textContent())!.trim();
}

it('part 10g: wipeout — the editor builds a ladder with rising prices (375 px too), only players still in answer, a wrong answer burns the bank, take or go on the phone with a countdown, the host waits and pauses the window, a text verdict overridden on the reveal, survivors cash in at the end, no buffs or debuffs, the ladder instead of the leaderboard, banks never leak before the reveal, ladder states in the history', async () => {
  try {
    await wipeoutGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function wipeoutGame() {
  const host = await open('host10g', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10g@example.com');

  const common = { imageUrl: null, video: null, timeLimit: 20 };
  const q0 = { ...common, id: 'q0', type: 'single' as const, text: 'Розминка: 2 + 2?', points: 100, options: [{ id: 'q0-4', text: '4' }, { id: 'q0-5', text: '5' }], correctId: 'q0-4' };
  const w1 = {
    ...common,
    id: 'w1',
    type: 'single' as const,
    text: 'Столиця Канади?',
    points: 100,
    options: [{ id: 'w1-a', text: 'Оттава' }, { id: 'w1-b', text: 'Торонто' }, { id: 'w1-c', text: 'Монреаль' }],
    correctId: 'w1-a',
  };
  const w2 = { ...common, id: 'w2', type: 'boolean' as const, text: 'Канберра — столиця Австралії', points: 200, correct: true };
  const w3 = { ...common, id: 'w3', type: 'numeric' as const, text: 'Скільки сантиметрів в одному метрі?', points: 300, correct: 100, tolerance: 0 };
  const w4 = { ...common, id: 'w4', type: 'text' as const, text: 'Столиця Туреччини?', points: 400, accepted: ['Анкара'] };
  const w5 = { ...common, id: 'w5', type: 'slider' as const, text: 'Скільки країн-членів має ООН?', points: 500, min: 150, max: 210, step: 1, correct: 193, tolerance: 2 };
  const data = {
    ...makeRoundsQuiz(
      [
        classicRound('r1', [q0] as never, { title: 'Розминка', speedBonus: false, rules: DEFAULT_RULES, shuffleOptions: false }),
        wipeoutRound('rw', [w1, w2, w3, w4, w5] as never, { title: 'Драбина', shuffleOptions: false }),
        classicRound('r3', [{ ...q0, id: 'q9', text: 'Кінець?' }] as never, { title: 'Після драбини', speedBonus: false, rules: DEFAULT_RULES, shuffleOptions: false }),
      ],
      { leaderboard: 'each', buffs: ['double'], debuffs: ['fog'] },
    ),
    title: 'Ва-банк 10g',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Ва-банк 10g' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  await host.locator('.round-tab', { hasText: 'Драбина' }).click();
  await expect.poll(() => host.locator('.question-list .question-item-price').allTextContents()).toEqual(['100', '200', '300', '400', '500']);
  await openRoundSettings(host);
  const settingsPanel = host.locator('details.round-settings');
  await settingsPanel.getByText('Правил балів, бафів, дебафів і дуелей у «Ва-банк» немає.', exact).waitFor();
  await settingsPanel.locator('.with-help button').first().waitFor();
  expect(await settingsPanel.getByLabel(/Штраф|Мінус за помилку/).count(), 'no penalty rule in a wipeout').toBe(0);
  await shot(host, 'p10g-editor-wipeout');
  expect(await host.getByRole('group', { name: 'Тип запитання', ...exact }).getByRole('button').count(), 'five question types').toBe(5);

  await click(host, '+ Раунд');
  await click(host, 'Ва-банк');
  await expect.poll(() => host.locator('.question-list .question-item-price').allTextContents()).toEqual(['100', '200', '300', '400', '500']);
  await shot(host, 'p10g-editor-new-wipeout');
  await click(host, 'Додати запитання');
  await expect.poll(() => host.locator('.question-list .question-item-price').allTextContents()).toEqual(['100', '200', '300', '400', '500', '600']);
  await click(host, 'Видалити раунд');
  await host.locator('.round-tab', { hasText: 'Драбина' }).click();
  expect(await host.locator('.round-tab').count()).toBe(3);

  await host.setViewportSize({ width: 375, height: 812 });
  await settingsPanel.scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10g-editor-wipeout-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // 2. Гра.
  await host.locator('.quiz-list li', { hasText: 'Ва-банк 10g' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10g', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya10g', 375, 812);
  const petro = await open('petro10g', 375, 812);
  const vira = await open('vira10g', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const viraFrames = socketFrames(vira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(vira, code, 'Віра', false);
  const phones = [olya, petro, vira];
  const all = [host, stage, ...phones];
  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // Розминка: усі «4», по 100.
  for (const page of phones) await page.getByRole('button', { name: /(^|\s)4$/ }).click();
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await afterSplash(...all);

  // 3. Інтро «Ва-банк»: на сцені лише сходинки.
  await stage.locator('.wipeout-ladder').waitFor();
  await expect.poll(() => stage.locator('.wipeout-step').count()).toBe(5);
  expect(await stage.locator('.wipeout-group').count(), 'the intro ladder shows steps only').toBe(0);
  await expectStageFits(stage, 'p10g-stage-intro');
  await shot(stage, 'p10g-stage-intro');
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 4. w1.
  await stage.getByText('Столиця Канади?', exact).waitFor();
  await expectStageFits(stage, 'p10g-stage-question');
  await tapBuff(olya, 'Подвійні бали', 'У «Ва-банк» бафів немає.');
  await shot(olya, 'p10g-phone-no-buffs');
  expect(await host.locator('.player-row', { hasText: 'Оля' }).getByRole('button', { name: 'Дебаф', ...exact }).count(), 'no debuffs in a wipeout').toBe(0);
  for (const page of phones) await pickOption(page, 'Оттава');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  for (const page of phones) await page.getByText('Банк: 100', exact).waitFor();
  await shot(olya, 'p10g-phone-reveal');

  await click(host, 'Далі');
  await stage.getByText('Вирішили 0 з 3', exact).waitFor();
  await stage.locator('[role=timer]').waitFor();
  await expectStageFits(stage, 'p10g-stage-ladder');
  await shot(stage, 'p10g-stage-ladder');
  const deciding = host.getByRole('button', { name: /^Гравці вирішують/ });
  await deciding.waitFor();
  expect(await deciding.isDisabled(), 'the host waits while players decide').toBe(true);
  await shot(host, 'p10g-host-deciding');

  // Пауза: відлік стоїть, поки вікно на паузі (повільні перевірки — під паузою, щоб вікно не збігло).
  await host.getByRole('button', { name: 'Пауза', ...exact }).first().click();
  await petro.getByText('Не вибереш за 10 с — банк забереться сам.', exact).waitFor();
  await petro.getByRole('button', { name: 'Забрати 100', ...exact }).waitFor();
  await petro.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await expectNoSideScroll(petro, 'p10g-phone-decide');
  await vira.getByRole('button', { name: 'Таблиця', ...exact }).click();
  const sheet = vira.getByRole('dialog', { name: 'Таблиця', ...exact });
  await sheet.waitFor();
  for (const nick of ['Оля', 'Петро', 'Віра']) await sheet.getByText(nick, exact).first().waitFor();
  expect(await sheet.innerText()).toContain('100');
  await vira.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  const timerOf = () => petro.locator('[role=timer]').getAttribute('aria-label');
  const held = await timerOf();
  await petro.waitForTimeout(1500);
  expect(await timerOf(), 'the countdown stands still on pause').toBe(held);
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();

  // Рішення наживо: пульт бачить вибір, сцена й чужі телефони — лише «вирішив».
  await decide(petro, false);
  await host.locator('.host-wipeout li', { hasText: 'Петро' }).getByText('іде далі', exact).waitFor();
  await stage.locator('.wipeout-group li', { hasText: 'Петро' }).getByText('✓ вирішив', exact).waitFor();
  await stage.getByText('Вирішили 1 з 3', exact).waitFor();
  for (const [who, page] of [['stage', stage], ['olya', olya], ['vira', vira]] as const) {
    expect(await bodyText(page), `${who} sees a decision`).not.toMatch(/забирає|іде далі/);
  }
  await decide(olya, false);
  await decide(vira, false);
  await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();
  await expect.poll(() => stage.locator('[role=timer]').count(), POLL).toBe(0);
  // Після вікна сцена показує екран «Рішення» (11e): Петро в групі вибору, а не «У грі».
  await stage.locator('.wipeout-group.is-choices').waitFor();
  expect(await ladderGroupOf(stage, 'Петро')).toBe('Рішення');
  expect(await choiceOf(stage, 'Петро')).toBe('Далі з 100');

  const fromW2 = { stage: stageFrames.length, petro: petroFrames.length, vira: viraFrames.length };
  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 5. w2: Оля помиляється.
  await stage.getByText('Канберра — столиця Австралії', exact).waitFor();
  await pickOption(olya, '(^|\\s)Ні$');
  await pickOption(petro, '(^|\\s)Так$');
  await pickOption(vira, '(^|\\s)Так$');
  await host.getByText('Запитання закрите').waitFor();
  for (const [who, frames, from] of [['stage', stageFrames, fromW2.stage], ['petro', petroFrames, fromW2.petro], ['vira', viraFrames, fromW2.vira]] as const) {
    const text = framesUntilNextReveal(frames, from).join('\n');
    const at = text.indexOf('"status":"burned"');
    expect(at < 0, `${who} got a burned status before the reveal: ${text.slice(Math.max(0, at - 150), at + 150)}`).toBe(true);
  }
  await click(host, 'Показати відповідь');
  await olya.getByText('Банк згорів', exact).first().waitFor();
  await expectNoSideScroll(olya, 'p10g-phone-burned');
  await click(host, 'Далі');
  await stage.getByText('Вирішили 0 з 2', exact).waitFor();
  expect(await ladderGroupOf(stage, 'Оля')).toBe('Згоріли');
  expect(await olya.getByRole('button', { name: /^Забрати/ }).count(), 'a burned player cannot decide').toBe(0);
  await decide(petro, true);
  await host.locator('.host-wipeout li', { hasText: 'Петро' }).getByText('забирає', exact).waitFor();
  await shot(host, 'p10g-host-live');
  for (const [who, page] of [['stage', stage], ['olya', olya], ['vira', vira]] as const) {
    expect(await bodyText(page), `${who} sees the take`).not.toMatch(/забирає|іде далі/);
  }
  await decide(vira, false);
  await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();
  expect(await totalOf(host, 'Петро')).toBe(400);
  expect(await totalOf(host, 'Віра')).toBe(100);

  // Рішення інших не доходять до сцени; Оля й Віра не бачили, що забрав Петро (власне «далі» вони бачать).
  expect(stageFrames.join(NL), 'the stage got a live decision').not.toMatch(/"decision":"(take|stay)"/);
  for (const [who, frames] of [['olya', olyaFrames], ['vira', viraFrames]] as const) {
    expect(frames.join(NL), `${who} got the take of Petro`).not.toContain('"decision":"take"');
  }

  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 6. w3: грає лише Віра.
  await stage.getByText('Скільки сантиметрів в одному метрі?', exact).waitFor();
  await olya.getByText('Ти вже не граєш у цьому раунді — дивись.', exact).waitFor();
  expect(await field(olya, 'Ваша відповідь').count(), 'no answer field for a burned player').toBe(0);
  await shot(olya, 'p10g-phone-out');
  await petro.getByText('Ти вже не граєш у цьому раунді — дивись.', exact).waitFor();
  expect(await field(petro, 'Ваша відповідь').count()).toBe(0);
  await numericAnswer(vira, '100');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await vira.getByText('Банк: 600', exact).waitFor();
  for (const page of [olya, petro]) await page.getByText('Ти дивишся', exact).first().waitFor();
  for (const [who, page] of [['stage', stage], ['olya', olya], ['petro', petro]] as const) expect(await bodyText(page), `${who} sees the bank of Vira`).not.toContain('Банк: 600');
  // Банки інших тепер видно всім (11e): у списку сходинки Віри — «300 → 600».
  await sideRow(olya, 'Віра').getByText('300 → 600', exact).waitFor();
  await click(host, 'Далі');
  await decide(vira, false);
  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 7. w4: ручна оцінка.
  await stage.getByText('Столиця Туреччини?', exact).waitFor();
  await numericAnswer(vira, 'Стамбул');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await vira.getByText('Банк згорів', exact).first().waitFor();
  await host.locator('.rows li', { hasText: 'Віра' }).getByRole('button', { name: 'Зарахувати', ...exact }).click();
  await vira.getByText('Банк: 1000', exact).waitFor();
  await shot(host, 'p10g-host-override');
  await click(host, 'Далі');
  await decide(vira, false);
  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 8. w5: повзунок у межах допуску, банк доноситься до кінця.
  await stage.getByText('Скільки країн-членів має ООН?', exact).waitFor();
  await vira.getByRole('slider', { name: 'Повзунок', ...exact }).fill('195');
  await click(vira, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await vira.getByText('Банк: 1500', exact).waitFor();
  await click(host, 'Далі');
  await vira.getByText('Донесено до кінця: 1500', exact).waitFor();
  await olya.getByText('Банк згорів', exact).first().waitFor();
  await petro.getByText('Забрано 300', exact).first().waitFor();
  await expectNoSideScroll(vira, 'p10g-phone-survived');
  expect(await totalOf(host, 'Віра')).toBe(1600);
  expect(await totalOf(host, 'Петро')).toBe(400);
  expect(await totalOf(host, 'Оля')).toBe(100);
  await shot(stage, 'p10g-stage-round-end');
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  // 9. Історія.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Ва-банк 10g/ }).click();
  const items = host.locator('.rows.stacked > li');
  await items.first().waitFor();
  const history2 = await items.filter({ hasText: 'Канберра' }).innerText();
  expect(history2).toContain('Оля — банк згорів');
  expect(history2).toContain('Петро — забрав(-ла) 300');
  expect(await items.filter({ hasText: 'країн-членів' }).innerText()).toContain('Віра — доніс(-ла) 1500');
  await shot(host, 'p10g-history');

  expect(problems).toEqual([]);
}

/** Підкладає пастки й запасні двері для наступного випробування-удачі: пари [trap, fallback] у порядку гравців «на межі». Двері d → грань 2d + 1 (rng = 2d/6 + 0.01 → ⌊·3⌋ = d). */
function rigDoors(...pairs: [number, number][]): void {
  for (const [trap, fallback] of pairs) rigged.push(2 * trap + 1, 2 * fallback + 1);
}

/** Натискає двері n (0…2) на телефоні. */
async function pickDoor(page: Page, door: number): Promise<void> {
  const button = page.getByRole('button', { name: `Двері ${door + 1}`, ...exact });
  expect((await button.boundingBox())!.height, 'a door is big').toBeGreaterThanOrEqual(96);
  await button.click();
}

it('part 10h: survival — the editor builds a survival round with trials, bonus and survivors (375 px too), a mistake puts players on the edge, a survival question knocks one out, a ghost answers for herself without points, everyone wrong means nobody is out, luck with doors when trial questions run out (a trap picked, a door that picks itself), the round ends at one survivor with the bonus, no buffs, debuffs only on the living, the board instead of the leaderboard, nothing leaks before the reveal or the trial closing, survival details in the history', async () => {
  try {
    await survivalGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function survivalGame() {
  const host = await open('host10h', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10h@example.com');

  const common = { imageUrl: null, video: null, timeLimit: 20 };
  const s1 = { ...common, id: 's1', type: 'single' as const, text: 'Столиця Канади?', points: 100, options: [{ id: 's1-a', text: 'Оттава' }, { id: 's1-b', text: 'Торонто' }, { id: 's1-c', text: 'Монреаль' }], correctId: 's1-a' };
  const s2 = { ...common, id: 's2', type: 'boolean' as const, text: 'Сонце — зірка', points: 100, correct: true };
  const s3 = { ...common, id: 's3', type: 'numeric' as const, text: 'Скільки сантиметрів в одному метрі?', points: 100, correct: 100, tolerance: 0 };
  const s4 = { ...common, id: 's4', type: 'single' as const, text: 'Найбільша планета Сонячної системи?', points: 100, options: [{ id: 's4-a', text: 'Юпітер' }, { id: 's4-b', text: 'Сатурн' }, { id: 's4-c', text: 'Марс' }], correctId: 's4-a' };
  const s5 = { ...common, id: 's5', type: 'text' as const, text: 'Столиця Туреччини?', points: 100, accepted: ['Анкара'] };
  const t1 = { ...common, id: 't1', type: 'boolean' as const, text: 'Вода кипить при 100 °C на рівні моря', points: 100, correct: true, timeLimit: 15 };
  const data = {
    ...makeRoundsQuiz([survivalRound('rs', [s1, s2, s3, s4, s5] as never, [t1] as never, { title: 'Хто лишиться' })], { leaderboard: 'each', buffs: ['double'], debuffs: ['fog'] }),
    title: 'Вибування 10h',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Вибування 10h' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  await expect.poll(() => host.locator('.question-list .question-item').count()).toBe(5);
  await openRoundSettings(host);
  const settings = host.locator('.survival-settings');
  await settings.waitFor();
  await settings.locator('.with-help button').first().waitFor();
  expect(await settings.getByRole('radio', { name: 'Питання на виживання', ...exact }).isChecked()).toBe(true);
  expect(await field(host, 'Скільки має лишитися').inputValue()).toBe('1');
  expect(await field(host, 'Бонус виживання').inputValue()).toBe('500');
  expect(await settings.getByText(/^Питання \d+ ·/).count(), 'one survival question').toBe(1);
  await host.locator('details.round-settings').getByLabel(/^Штраф/).waitFor();
  await shot(host, 'p10h-editor-survival');
  for (const group of await host.getByRole('group', { name: 'Тип запитання', ...exact }).all()) expect(await group.getByRole('button').count(), 'five question types').toBe(5);

  await click(host, '+ Раунд');
  await click(host, 'Вибування');
  await expect.poll(() => host.locator('.question-list .question-item').count()).toBe(3);
  await openRoundSettings(host);
  await expect.poll(() => host.locator('.survival-settings').getByText(/^Питання \d+ ·/).count(), POLL).toBe(2);
  await shot(host, 'p10h-editor-new-survival');
  await host.locator('.survival-settings').getByRole('radio', { name: 'Удача (троє дверей)', ...exact }).check();
  await host.locator('.survival-settings').getByText('З удачею ці питання не потрібні.', exact).waitFor();
  await click(host, 'Видалити раунд');
  await expect.poll(() => host.locator('.question-list .question-item').count(), POLL).toBe(5);

  await host.setViewportSize({ width: 375, height: 812 });
  await host.locator('.survival-settings').scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10h-editor-survival-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // 2. Гра.
  await host.locator('.quiz-list li', { hasText: 'Вибування 10h' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10h', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya10h', 375, 812);
  const petro = await open('petro10h', 375, 812);
  const vira = await open('vira10h', 375, 812);
  const hlib = await open('hlib10h', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const viraFrames = socketFrames(vira);
  const hlibFrames = socketFrames(hlib);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(vira, code, 'Віра', false);
  await join(hlib, code, 'Гліб', false);
  const phones = [olya, petro, vira, hlib];
  const all = [host, stage, ...phones];
  await click(host, 'Почати гру');
  await afterSplash(...all);

  // 3. Інтро.
  await stage.locator('.survival-board').waitFor();
  await stage.getByText('Лишиться 1 · бонус 500', exact).waitFor();
  await stage.getByText('Живих: 4 · привидів: 0', exact).waitFor();
  expect(await survivalGroupOf(stage, 'Гліб')).toBe('Живі');
  await expectStageFits(stage, 'p10h-stage-intro');
  await shot(stage, 'p10h-stage-intro');
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 4. s1: питання на виживання.
  await stage.getByText('Столиця Канади?', exact).waitFor();
  await expectStageFits(stage, 'p10h-stage-question');
  await tapBuff(olya, 'Подвійні бали', 'У «Вибуванні» бафів немає.');
  await shot(olya, 'p10h-phone-no-buffs');
  expect(await host.locator('.player-row', { hasText: 'Петро' }).getByRole('button', { name: 'Дебаф', ...exact }).count(), 'a living player has debuffs').toBeGreaterThan(0);
  await pickOption(olya, 'Оттава');
  await pickOption(petro, 'Оттава');
  await pickOption(vira, 'Оттава');
  await pickOption(hlib, 'Торонто');
  await host.getByText('Запитання закрите').waitFor();
  for (const [who, frames] of [['stage', stageFrames], ['hlib', hlibFrames]] as const) {
    const text = framesBeforeReveal(frames).join(NL);
    const at = text.indexOf('"status":"edge"');
    expect(at < 0, `${who} got an edge status before the reveal: ${text.slice(Math.max(0, at - 150), at + 150)}`).toBe(true);
  }
  await click(host, 'Показати відповідь');
  await stage.locator('.survival-edge-line', { hasText: 'Гліб' }).waitFor();
  await shot(stage, 'p10h-stage-edge');
  await hlib.getByText('Ти на межі — зараз випробування.', exact).waitFor();

  await click(host, 'Далі');
  await stage.locator('.splash').waitFor({ state: 'attached' });
  await shot(stage, 'p10h-stage-trial-splash', { splash: true });
  await afterSplash(stage, hlib);
  await stage.getByText('Вода кипить при 100 °C на рівні моря', exact).waitFor();
  await stage.getByText('Відповіли 0 з 1', exact).waitFor();
  await expectStageFits(stage, 'p10h-stage-trial-question');
  await shot(stage, 'p10h-stage-trial-question');
  await host.getByRole('button', { name: 'Закрити випробування', ...exact }).waitFor();
  await hlib.getByText('Вода кипить при 100 °C на рівні моря', exact).waitFor();
  await expectNoSideScroll(hlib, 'p10h-phone-trial');
  await pickOption(hlib, '(^|\\s)Ні$');
  await hlib.getByText('Ти вибуваєш — тепер ти привид.', exact).waitFor();
  await shot(hlib, 'p10h-phone-out');
  await expect.poll(() => survivalGroupOf(stage, 'Гліб'), POLL).toBe('Привиди');
  expect(openTrialLeaks('stage', stageFrames, 'question'), 'the stage saw the open trial').toBeGreaterThan(0);
  expect(openTrialLeaks('hlib', hlibFrames, 'question'), 'Hlib saw the open trial').toBeGreaterThan(0);
  await vira.getByRole('button', { name: 'Таблиця', ...exact }).click();
  const sheet = vira.getByRole('dialog', { name: 'Таблиця', ...exact });
  await sheet.waitFor();
  expect(await sheet.innerText()).toContain('100');
  await vira.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  expect(await host.locator('.player-row', { hasText: 'Гліб' }).getByRole('button', { name: 'Дебаф', ...exact }).count(), 'no debuffs for a ghost').toBe(0);

  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 5. s2: помилилися всі живі, привид відгадав.
  await stage.getByText('Сонце — зірка', exact).waitFor();
  await hlib.locator('.survival-ghost-banner').waitFor();
  await shot(hlib, 'p10h-phone-ghost');
  await pickOption(hlib, '(^|\\s)Так$');
  for (const page of [olya, petro, vira]) await pickOption(page, '(^|\\s)Ні$');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await stage.getByText('Привиди: 1 з 1 відгадали', exact).waitFor();
  await shot(stage, 'p10h-stage-ghost-hits');
  await hlib.getByText('Відгадав(-ла) — для себе.', exact).waitFor();
  expect(await bodyText(hlib), 'a ghost gets no points').not.toMatch(/\+\d/);
  await click(host, 'Далі');
  await stage.getByText('Помилилися всі — ніхто не вибуває.', exact).waitFor();
  await expectStageFits(stage, 'p10h-stage-all-wrong');
  await shot(stage, 'p10h-stage-all-wrong');
  for (const nick of ['Оля', 'Петро', 'Віра']) expect(await survivalGroupOf(stage, nick)).toBe('Живі');
  expect(await survivalGroupOf(stage, 'Гліб')).toBe('Привиди');
  expect(await totalOf(host, 'Гліб'), 'a ghost scores nothing').toBe(0);

  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 6. s3: питання на виживання скінчились — удача.
  await stage.getByText('Скільки сантиметрів в одному метрі?', exact).waitFor();
  await numericAnswer(olya, '100');
  await numericAnswer(petro, '90');
  await numericAnswer(vira, '50');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await stage.locator('.survival-edge-line', { hasText: 'Петро, Віра' }).waitFor();
  rigDoors([0, 1], [2, 0]);
  await click(host, 'Далі');
  await afterSplash(stage, petro, vira);
  await petro.getByText('Питань на виживання не лишилося — удача.', exact).waitFor();
  for (const door of [1, 2, 3]) await petro.getByRole('button', { name: `Двері ${door}`, ...exact }).waitFor();
  await petro.getByText('Не вибереш за 10 с — двері виберуться самі.', exact).waitFor();
  await expectNoSideScroll(petro, 'p10h-phone-doors');
  await expectStageFits(stage, 'p10h-stage-trial-luck');
  await shot(stage, 'p10h-stage-trial-luck');
  await pickDoor(petro, 0);
  await petro.getByText('Двері 1. Чекаємо інших…', exact).waitFor();
  await stage.getByText('Відповіли 1 з 2', exact).waitFor();
  await host.locator('.host-survival li', { hasText: 'Петро' }).getByText('Двері 1', exact).waitFor();
  expect(await bodyText(stage), 'the stage sees a door of Petro').not.toContain('Двері 1');
  expect(await bodyText(vira), 'Vira sees a door of Petro').not.toContain('Двері 1. Чекаємо');
  await pickDoor(vira, 1);
  await petro.getByText('Ти вибуваєш — тепер ти привид.', exact).waitFor();
  await vira.getByText('Пронесло! Ти живий(-а).', exact).waitFor();
  expect(openTrialLeaks('stage', stageFrames, 'luck'), 'the stage saw the open luck').toBeGreaterThan(0);
  expect(openTrialLeaks('petro', petroFrames, 'luck'), 'Petro saw the open luck').toBeGreaterThan(0);
  expect(openTrialLeaks('vira', viraFrames, 'luck')).toBeGreaterThan(0);
  expect(openTrialLeaks('olya', olyaFrames, 'luck')).toBeGreaterThan(0);
  const doorRows = stage.locator('.survival-edge-rows li');
  expect(await doorRows.filter({ hasText: 'Петро' }).getByText('Пастка!', exact).count(), 'Petro has a trap').toBe(1);
  expect(await doorRows.filter({ hasText: 'Віра' }).getByText('Пастка!', exact).count(), 'Vira has a trap on another door').toBe(1);
  expect(await doorRows.filter({ hasText: 'Петро' }).locator('.survival-door.is-picked.is-trap').count(), 'Petro picked the trap').toBe(1);
  expect(await doorRows.filter({ hasText: 'Віра' }).locator('.survival-door.is-picked.is-trap').count(), 'Vira did not pick the trap').toBe(0);
  await expectStageFits(stage, 'p10h-stage-doors');
  await shot(stage, 'p10h-stage-doors');
  await shot(vira, 'p10h-phone-safe');
  expect(await survivalGroupOf(stage, 'Петро')).toBe('Привиди');
  expect(await survivalGroupOf(stage, 'Віра')).toBe('Живі');

  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 7. s4: двері вибираються самі, кінець раунду.
  await stage.getByText('Найбільша планета Сонячної системи?', exact).waitFor();
  // Привиди відповідають першими: живі, що відповіли, закривають запитання, а привиди його не тримають.
  await pickOption(petro, 'Марс');
  await pickOption(hlib, 'Юпітер');
  await pickOption(olya, 'Юпітер');
  await pickOption(vira, 'Сатурн');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await stage.locator('.survival-edge-line', { hasText: 'Віра' }).waitFor();
  rigDoors([1, 1]);
  await click(host, 'Далі');
  await afterSplash(stage, vira);
  await vira.getByRole('button', { name: 'Двері 1', ...exact }).waitFor();
  await host.getByRole('button', { name: 'Пауза', ...exact }).first().click();
  const timerOf = () => vira.locator('[role=timer]').getAttribute('aria-label');
  const held = await timerOf();
  await vira.waitForTimeout(1500);
  expect(await timerOf(), 'the countdown stands still on pause').toBe(held);
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();
  await stage.getByText('вибрано самі', exact).waitFor({ timeout: 20000 });
  await vira.getByText('Ти вибуваєш — тепер ти привид.', exact).waitFor();
  const viraRow = stage.locator('.survival-edge-rows li', { hasText: 'Віра' });
  expect(await viraRow.getByText('Пастка!', exact).count()).toBe(1);
  expect(await viraRow.locator('.survival-door.is-picked.is-trap').count(), 'the auto door is the trap').toBe(1);
  expect(await viraRow.locator('.survival-door.is-picked .survival-door-n').textContent()).toBe('2');
  expect(await survivalGroupOf(stage, 'Віра')).toBe('Привиди');
  const ending = host.getByRole('button', { name: /^(Підсумки раунду|Далі)$/ });
  await ending.waitFor();
  await shot(host, 'p10h-host-ending');
  await ending.click();
  await olya.getByText('Ти дожив(-ла) до кінця: +500', exact).waitFor();
  await shot(olya, 'p10h-phone-bonus');
  await vira.getByText('Ти вибув(-ла) після запитання 4.', exact).waitFor();
  expect(await podiumScore(host, 'Оля')).toBe(800);
  expect(await podiumScore(host, 'Петро')).toBe(100);
  expect(await podiumScore(host, 'Віра')).toBe(100);
  expect(await podiumScore(host, 'Гліб')).toBe(0);

  // 8. Історія.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Вибування 10h/ }).click();
  const items = host.locator('.rows.stacked > li');
  await items.first().waitFor();
  const h1 = await items.filter({ hasText: 'Столиця Канади?' }).innerText();
  expect(h1).toContain('Питання на виживання: Вода кипить');
  expect(h1).toContain('Гліб — вибув(-ла)');
  const h2 = await items.filter({ hasText: 'Сонце — зірка' }).innerText();
  expect(h2).toContain('Помилилися всі — ніхто не вибув');
  expect(h2).toContain('Привиди: 1 з 1 відгадали');
  const h3 = await items.filter({ hasText: 'сантиметрів' }).innerText();
  expect(h3).toContain('Удача (питань не лишилося)');
  expect(h3).toContain('Петро — вибув(-ла)');
  expect(h3).toContain('Віра — вижив(-ла)');
  expect(h3).toContain('двері 1, пастка 1');
  const h4 = await items.filter({ hasText: 'Найбільша планета' }).innerText();
  expect(h4).toContain('двері 2 (самі), пастка 2');
  await host.getByText('Бонус виживання: Оля +500', exact).waitFor();
  await shot(host, 'p10h-history');

  expect(problems).toEqual([]);
}

/** Сходинка, підсвічена на драбині сцени, пульта чи телефона (номер з 1). */
async function ladderCurrent(page: Page): Promise<number> {
  const text = await page.locator('.ladder-step.is-current .ladder-number').first().textContent();
  return Number(text);
}

/** Натискає підказку драбини на телефоні учасника. */
async function useLifeline(page: Page, name: '50/50' | 'Зал' | 'Підказка'): Promise<void> {
  const button = page.locator('.ladder-lifeline', { hasText: name });
  expect((await button.boundingBox())!.height, 'a lifeline is a tap target').toBeGreaterThanOrEqual(44);
  await button.click();
}

/** «Граю далі» чи «Забрати …» на телефоні учасника. */
async function ladderDecide(page: Page, take: boolean): Promise<void> {
  const button = take ? page.getByRole('button', { name: /^Забрати \d/ }) : page.getByRole('button', { name: 'Граю далі', ...exact });
  expect((await button.boundingBox())!.height, 'decision button is a tap target').toBeGreaterThanOrEqual(44);
  await button.click();
}

/** Усі підсумки голосування залу (об'єкти audience зі станом) у кадрах сокета. */
function ladderAudiences(frames: string[]): { state: string; tally: unknown }[] {
  const found: { state: string; tally: unknown }[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value === null || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    const audience = object.audience;
    if (audience !== null && typeof audience === 'object' && 'state' in audience && 'tally' in audience) found.push(audience as { state: string; tally: unknown });
    Object.values(object).forEach(walk);
  };
  for (const frame of frames) {
    const at = frame.indexOf('[');
    if (at < 0) continue;
    try {
      walk(JSON.parse(frame.slice(at)));
    } catch {
      // не JSON (службовий кадр)
    }
  }
  return found;
}

it('part 10i: ladder — the editor builds a ladder round with levels, safe steps, contestant pick, lifelines and a timer flag (375 px too), the host picks the contestant, 50/50 and ask the hall with the hall answering for itself for 10 %, play on and take the money at a safe level, a lowest-score contestant with the host hint falls to the safe sum, no buffs or debuffs, the ladder instead of the leaderboard, nothing leaks before the reveal or the hall vote closing, ladder details and the prize in the history', async () => {
  try {
    await ladderGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function ladderGame() {
  const host = await open('host10i', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10i@example.com');

  const common = { imageUrl: null, video: null, timeLimit: 20, points: 0 };
  const four = (id: string, text: string, options: string[], right: number) => ({
    ...common,
    id,
    type: 'single' as const,
    text,
    options: options.map((option, i) => ({ id: `${id}-${i}`, text: option })),
    correctId: `${id}-${right}`,
  });
  const a1 = four('a1', 'Столиця Австралії?', ['Сідней', 'Канберра', 'Мельбурн', 'Перт'], 1);
  const a2 = four('a2', 'Скільки континентів на Землі за найпоширенішою моделлю?', ['5', '6', '7', '8'], 2);
  const a3 = four('a3', 'Хімічний символ золота?', ['Ag', 'Au', 'Gd', 'Go'], 1);
  const a4 = four('a4', 'Хто написав «Кобзар»?', ['Франко', 'Шевченко', 'Леся Українка', 'Котляревський'], 1);
  const a5 = four('a5', 'Найбільший океан?', ['Атлантичний', 'Індійський', 'Тихий', 'Північний Льодовитий'], 2);
  const b1 = four('b1', 'Скільки днів у високосному році?', ['365', '366', '364', '360'], 1);
  const b2 = four('b2', 'Яка планета — Червона?', ['Венера', 'Марс', 'Юпітер', 'Меркурій'], 1);
  const b3 = four('b3', 'У якому році проголошено незалежність України?', ['1989', '1990', '1991', '1992'], 2);
  const b4 = four('b4', 'Скільки хвилин у годині?', ['30', '60', '90', '100'], 1);
  const b5 = four('b5', 'Скільки сторін у трикутника?', ['2', '3', '4', '5'], 1);
  const data = {
    ...makeRoundsQuiz(
      [
        ladderRound('rl1', [a1, a2, a3, a4, a5] as never, { title: 'Драбина Олі', pick: 'host', lifelines: ['fifty', 'audience', 'hint'], timer: false, safe: [2] }),
        ladderRound('rl2', [b1, b2, b3, b4, b5] as never, { title: 'Драбина за балами', pick: 'lowest', lifelines: ['hint'], timer: true, safe: [0] }),
      ],
      { leaderboard: 'each', buffs: ['double'], debuffs: ['fog'] },
    ),
    title: 'Мільйонер 10i',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Редактор.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Мільйонер 10i' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  await host.locator('.round-tab', { hasText: 'Драбина Олі' }).click();
  await expect.poll(() => host.locator('.question-list .question-item').count(), POLL).toBe(5);
  expect(await host.locator('.question-list .question-item-price').nth(2).innerText(), 'a safe step has a mark in the list').toContain('1000');
  await openRoundSettings(host);
  const settings = host.locator('.ladder-settings');
  await settings.waitFor();
  await settings.locator('.with-help button').first().waitFor();
  expect(await settings.getByRole('radio', { name: 'Вибирає ведучий', ...exact }).isChecked()).toBe(true);
  for (const name of ['50/50', 'Зал', 'Підказка']) expect(await settings.getByRole('checkbox', { name, ...exact }).isChecked(), `${name} is on`).toBe(true);
  expect(await settings.getByRole('checkbox', { name: 'Таймер на запитання', ...exact }).isChecked(), 'the timer is off').toBe(false);
  expect(await settings.locator('.ladder-level-row').count()).toBe(5);
  expect(await field(host, 'Сума сходинки 5').inputValue()).toBe('10000');
  expect(await field(host, 'Сума сходинки 1').inputValue()).toBe('100');
  expect(await field(host, 'неспалима 3').isChecked(), 'step 3 is safe').toBe(true);
  expect(await field(host, 'неспалима 2').isChecked(), 'step 2 is not safe').toBe(false);
  await shot(host, 'p10i-editor-ladder');
  expect(await host.getByRole('button', { name: 'Додати варіант', ...exact }).count(), 'exactly four options, no add button').toBe(0);
  expect(await host.getByLabel(/^Варіант \d$/).count(), 'four options').toBe(4);
  expect(await host.getByRole('group', { name: 'Тип запитання', ...exact }).getByRole('button').count(), 'only «один варіант»').toBe(1);

  await click(host, '+ Раунд');
  await click(host, 'Мільйонер');
  await expect.poll(() => host.locator('.question-list .question-item').count(), POLL).toBe(5);
  await expect.poll(() => host.locator('.round-tab').count(), POLL).toBe(3);
  await openRoundSettings(host);
  await host.locator('.ladder-settings').waitFor();
  await shot(host, 'p10i-editor-new-ladder');
  await click(host, 'Видалити раунд');
  await expect.poll(() => host.locator('.round-tab').count(), POLL).toBe(2);
  await host.locator('.round-tab', { hasText: 'Драбина Олі' }).click();
  await expect.poll(() => host.locator('.question-list .question-item').count(), POLL).toBe(5);

  await host.setViewportSize({ width: 375, height: 812 });
  await openRoundSettings(host);
  await host.locator('.ladder-settings').scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10i-editor-ladder-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // 2. Гра.
  await host.locator('.quiz-list li', { hasText: 'Мільйонер 10i' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10i', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya10i', 375, 812);
  const petro = await open('petro10i', 375, 812);
  const vira = await open('vira10i', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const viraFrames = socketFrames(vira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(vira, code, 'Віра', false);
  const phones = [olya, petro, vira];
  const all = [host, stage, ...phones];
  await click(host, 'Почати гру');
  await afterSplash(...all);

  // 3. Інтро «Драбини Олі».
  await stage.locator('.ladder-stage-intro').waitFor();
  await stage.getByText('Хто піде на драбину?', exact).waitFor();
  expect(await stage.locator('.ladder-step').count()).toBe(5);
  expect(await stage.locator('.ladder-step.is-safe').count(), 'one safe step').toBe(1);
  await expectStageInView(stage, 'p10i-stage-intro');
  await shot(stage, 'p10i-stage-intro');
  const pickFirst = host.getByRole('button', { name: 'Виберіть учасника', ...exact });
  await pickFirst.waitFor();
  expect(await pickFirst.isDisabled(), 'the host must pick first').toBe(true);
  await host.locator('.host-ladder-players').getByRole('button', { name: 'Оля', ...exact }).click();
  await stage.locator('.ladder-contestant-name', { hasText: 'Оля' }).waitFor();
  await olya.getByText('Ти йдеш на драбину!', exact).waitFor();
  await petro.getByText(/Драбину проходить Оля/).waitFor();
  await click(host, 'Почати драбину');
  await afterSplash(...all);

  // 4. a1: 50/50, зал відповідає за себе.
  await stage.getByText('Столиця Австралії?', exact).waitFor();
  expect(await ladderCurrent(stage)).toBe(1);
  expect(await stage.locator('[role=timer]').count(), 'no timer without the flag').toBe(0);
  expect(await olya.locator('[role=timer]').count(), 'no timer on the contestant phone').toBe(0);
  for (const name of ['50/50', 'Зал', 'Підказка']) await olya.locator('.ladder-lifeline', { hasText: name }).waitFor();
  expect(await olya.locator('.buff-row').count(), 'no buff row in a ladder').toBe(0);
  await expectNoSideScroll(olya, 'p10i-phone-contestant');
  await petro.locator('.ladder-hall', { hasText: 'Драбину проходить Оля' }).waitFor();
  expect(await petro.locator('.ladder-hall').innerText()).toContain('+10');
  await expectNoSideScroll(petro, 'p10i-phone-hall');
  expect(await host.locator('.player-row', { hasText: 'Петро' }).getByRole('button', { name: 'Дебаф', ...exact }).count(), 'no debuffs in a ladder').toBe(0);
  rigged.push(1, 1);
  await useLifeline(olya, '50/50');
  for (const page of [olya, petro, vira]) {
    await expect.poll(() => page.locator('.choice.is-removed').count(), POLL).toBe(2);
    expect(await page.locator('.choice:not(.is-removed)').count(), 'two options are left').toBe(2);
    for (const gone of ['Сідней', 'Мельбурн']) expect(await page.locator('.choice.is-removed', { hasText: gone }).count(), `${gone} is removed`).toBe(1);
  }
  await expect.poll(() => stage.locator('.stage-ladder .choice:not(.is-removed)').count(), POLL).toBe(2);
  await expectStageInView(stage, 'p10i-stage-fifty');
  await shot(stage, 'p10i-stage-fifty');
  await pickOption(petro, 'Канберра');
  await pickOption(vira, 'Перт');
  await pickOption(olya, 'Канберра');
  await host.getByText('Запитання закрите').waitFor();
  for (const [who, frames] of [['stage', stageFrames], ['olya', olyaFrames], ['petro', petroFrames], ['vira', viraFrames]] as const) {
    expect(framesBeforeReveal(frames).join(NL), `${who} got the correct answer before the reveal`).not.toContain('"correctId"');
  }
  const openStage = stageFrames.filter((frame) => frame.includes('"phase":"question"') && frame.includes('"contestantPick"'));
  expect(openStage.length, 'the stage saw the open question').toBeGreaterThan(0);
  for (const frame of openStage) expect(frame, 'the stage sees the pick of the contestant while the question is open').toContain('"contestantPick":null');
  await click(host, 'Показати відповідь');
  await stage.getByText('Зал: 1 з 2 відгадали — по +10', exact).waitFor();
  await expectStageInView(stage, 'p10i-stage-reveal');
  await shot(stage, 'p10i-stage-reveal');
  await petro.locator('.earned', { hasText: '+10' }).waitFor();
  await olya.getByText('Правильно! 100 у кишені.', exact).waitFor();

  await click(host, 'Далі');
  await stage.getByText(/Оля вирішує/).waitFor();
  const waiting = host.getByRole('button', { name: 'Учасник вирішує…', ...exact });
  await waiting.waitFor();
  expect(await waiting.isDisabled(), 'the host waits for the contestant').toBe(true);
  await expectStageInView(stage, 'p10i-stage-deciding');
  await shot(stage, 'p10i-stage-deciding');
  await olya.getByRole('button', { name: 'Забрати 100', ...exact }).waitFor();
  await expectNoSideScroll(olya, 'p10i-phone-decision');
  await vira.getByRole('button', { name: 'Таблиця', ...exact }).click();
  const sheet = vira.getByRole('dialog', { name: 'Таблиця', ...exact });
  await sheet.waitFor();
  await sheet.getByText('Оля', exact).first().waitFor();
  await vira.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  await ladderDecide(olya, false);
  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 5. a2: підказка «Зал».
  await stage.getByText('Скільки континентів на Землі за найпоширенішою моделлю?', exact).waitFor();
  expect(await ladderCurrent(stage)).toBe(2);
  await useLifeline(olya, 'Зал');
  await stage.getByText('Зал голосує: 0 з 2', exact).waitFor();
  await pickOption(petro, '(^|\\s)7$');
  await stage.getByText('Зал голосує: 1 з 2', exact).waitFor();
  await pickOption(vira, '(^|\\s)7$');
  const tally = stage.locator('.ladder-audience .vote-row', { hasText: '100 %' });
  await tally.waitFor();
  expect(await tally.innerText()).toContain('7');
  await olya.locator('.ladder-lifeline-info .vote-row', { hasText: '100 %' }).waitFor();
  await expectStageInView(stage, 'p10i-stage-hall-tally');
  await shot(stage, 'p10i-stage-hall-tally');
  await expectNoSideScroll(olya, 'p10i-phone-hall-tally');
  for (const [who, frames] of [['stage', stageFrames], ['olya', olyaFrames]] as const) {
    const audiences = ladderAudiences(frames);
    const voting = audiences.filter((audience) => audience.state === 'voting');
    expect(voting.length, `${who} saw the vote open`).toBeGreaterThan(0);
    for (const audience of voting) expect(audience.tally, `${who} sees the tally while the hall votes`).toBeNull();
    expect(audiences.some((audience) => audience.state === 'closed' && audience.tally !== null), `${who} sees the tally after the vote`).toBe(true);
  }
  // Зал уже проголосував: телефон Віри не дає відповісти знову, а Олі лишилось відповісти.
  await pickOption(olya, '(^|\\s)7$');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await stage.getByText('Зал: 2 з 2 відгадали — по +30', exact).waitFor();
  await click(host, 'Далі');
  await olya.getByRole('button', { name: 'Забрати 300', ...exact }).waitFor();
  await ladderDecide(olya, false);
  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  // 6. a3: неспалима сходинка, «Забрати».
  await stage.getByText('Хімічний символ золота?', exact).waitFor();
  expect(await ladderCurrent(stage)).toBe(3);
  await pickOption(petro, '(^|\\s)Ag$');
  await pickOption(vira, '(^|\\s)Gd$');
  await pickOption(olya, '(^|\\s)Au$');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await olya.getByRole('button', { name: 'Забрати 1000', ...exact }).waitFor();
  await ladderDecide(olya, true);
  await stage.getByText(/Оля забирає 1000/).waitFor();
  expect(await stage.locator('.ladder-step.is-passed').count(), 'three steps are passed').toBe(3);
  expect(await stage.locator('.ladder-step.is-passed.is-safe').count(), 'the safe step is among them').toBe(1);
  await expectStageInView(stage, 'p10i-stage-took');
  await shot(stage, 'p10i-stage-took');
  const toResults = host.getByRole('button', { name: 'Підсумки раунду', ...exact });
  await toResults.waitFor();
  await toResults.click();
  await stage.getByRole('heading', { name: /Підсумки раунду 1/ }).waitFor();
  expect(await totalOf(host, 'Оля')).toBe(1000);
  expect(await totalOf(host, 'Петро')).toBe(40);
  expect(await totalOf(host, 'Віра')).toBe(30);

  // 7. Інтро «Драбини за балами»: учасника вибирає найменший рахунок.
  await click(host, 'Наступний раунд');
  await afterSplash(...all);
  await stage.getByText('Хто піде на драбину?', exact).waitFor();
  await click(host, 'Вибрати учасника');
  await stage.locator('.ladder-contestant-name', { hasText: 'Віра' }).waitFor();
  await stage.getByText('найменше балів', exact).waitFor();
  await expectStageInView(stage, 'p10i-stage-drawn');
  await shot(stage, 'p10i-stage-drawn');
  await click(host, 'Почати драбину');
  await afterSplash(...all);

  // 8. b1–b3: підказка ведучого, падіння до неспалимої.
  await stage.getByText('Скільки днів у високосному році?', exact).waitFor();
  await vira.locator('[role=timer]').waitFor();
  await pickOption(olya, '(^|\\s)366$');
  await pickOption(petro, '(^|\\s)365$');
  await pickOption(vira, '(^|\\s)366$');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await ladderDecide(vira, false);
  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  await stage.getByText('Яка планета — Червона?', exact).waitFor();
  expect(await vira.locator('.ladder-lifeline').count(), 'only the host hint is on').toBe(1);
  await useLifeline(vira, 'Підказка');
  const request = host.locator('.hint-request', { hasText: 'Віра просить підказку' });
  await request.waitFor();
  await request.locator('textarea').fill('Її називають Червоною');
  await request.getByRole('button', { name: 'Надіслати', ...exact }).click();
  await vira.getByText(/Її називають Червоною/).waitFor();
  await expectNoSideScroll(vira, 'p10i-phone-hint');
  await stage.locator('.ladder-badge.is-used, .ladder-badge.is-active').first().waitFor();
  expect(await bodyText(stage), 'the stage must not see the hint text').not.toContain('Червоною');
  await pickOption(olya, '(^|\\s)Марс$');
  await pickOption(petro, '(^|\\s)Венера$');
  await pickOption(vira, '(^|\\s)Марс$');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await ladderDecide(vira, false);
  await click(host, 'Наступне запитання');
  await afterSplash(...all);

  await stage.getByText('У якому році проголошено незалежність України?', exact).waitFor();
  await pickOption(olya, '(^|\\s)1991$');
  await pickOption(petro, '(^|\\s)1990$');
  await pickOption(vira, '(^|\\s)1990$');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await stage.getByText('Помилка — Віра отримує 100', exact).waitFor();
  await expectStageInView(stage, 'p10i-stage-wrong');
  await shot(stage, 'p10i-stage-wrong');
  await click(host, 'Далі');
  await afterSplash(...all);
  await vira.getByText('Твій виграш: 100', exact).waitFor();
  await expectNoSideScroll(vira, 'p10i-phone-won');
  expect(await podiumScore(host, 'Віра')).toBe(130);
  expect(await podiumScore(host, 'Оля')).toBe(1140);
  expect(await podiumScore(host, 'Петро')).toBe(40);

  // 9. Історія.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Мільйонер 10i/ }).click();
  const items = host.locator('.rows.stacked > li');
  await items.first().waitFor();
  const h1 = await items.filter({ hasText: 'Столиця Австралії?' }).innerText();
  expect(h1).toContain('Оля · сходинка 1 · 100');
  expect(h1).toContain('50/50: прибрано Сідней, Мельбурн');
  expect(h1).toContain('Зал: 1 з 2 відгадали');
  expect(await items.filter({ hasText: 'континентів' }).innerText()).toContain('7 100 %');
  const h3 = await items.filter({ hasText: 'Хімічний символ золота?' }).innerText();
  expect(h3).toMatch(/Оля забрав\(-ла\) 1000/);
  expect(h3).toContain('(неспалима)');
  expect(await items.filter({ hasText: 'Яка планета' }).innerText()).toContain('Підказка ведучого: Її називають Червоною');
  expect(await items.filter({ hasText: 'незалежність' }).innerText()).toContain('Помилка — Віра отримує 100');
  await host.getByText('Виграш драбини: Оля +1000', exact).waitFor();
  await host.getByText('Виграш драбини: Віра +100', exact).waitFor();
  await shot(host, 'p10i-history');

  expect(problems).toEqual([]);
}

/** Бали команди за запитання з рядка відповідей пульта. */
async function teamScore(host: Page, name: string): Promise<number> {
  // 11c: до розкриття рядків відповідей немає (їх заступає панель наживо) — інакше .score знайшовся б у рядку «Гравці».
  await host.locator('#live-answers').waitFor({ state: 'detached' });
  const text = await host.locator('li', { hasText: new RegExp(`^${name}`) }).locator('.score').first().textContent();
  return Number(text!.replace(/[^\d-]/g, ''));
}

/** Смуга команди на телефоні (одним рядком, не вища за шапку). */
const teamBar = (page: Page) => page.locator('.team-bar');

it('part 10j: teams — the editor turns team play on (375 px too), the host forms teams by dice with a rerolled tie and names a captain, the captain answers while a teammate watches the live draft that no other team or the stage ever receives, everyone answers a word cloud, ask the hall is voted by the other team, anyone buzzes in blitz and answers, a bought debuff hits only the captain, a restart keeps the teams, the final wager by the captain, team line-ups in the history and the team win in a member profile', async () => {
  try {
    await teamsGame();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function teamsGame() {
  const host = await open('host10j', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10j@example.com');

  const common = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
  const c1 = { ...common, id: 'c1', type: 'text' as const, text: 'Столиця Австралії?', accepted: ['Канберра'] };
  const c2 = { ...common, id: 'c2', type: 'wordcloud' as const, text: 'Одне слово про осінь', points: 0, words: 1 };
  const c3 = {
    ...common,
    id: 'c3',
    type: 'single' as const,
    timeLimit: 120,
    text: 'Скільки ніг у павука?',
    options: ['6', '8', '10', '12'].map((option, i) => ({ id: `c3-${i}`, text: option })),
    correctId: 'c3-1',
  };
  const b1 = { ...common, id: 'b1', type: 'text' as const, text: 'Хімічний символ золота?', accepted: ['Au'] };
  const f1 = { ...common, id: 'f1', type: 'numeric' as const, text: 'Скільки днів у високосному році?', correct: 366, tolerance: 0 };
  const data = {
    ...makeRoundsQuiz(
      [
        classicRound('rt1', [c1, c2, c3] as never, { title: 'Класика', speedBonus: false, shuffleOptions: false }),
        blitzRound('rt2', [b1] as never, { title: 'Бліц', check: 'manual', attempts: 1 }),
        finalRound('rt3', f1 as never, { title: 'Фінал' }),
      ],
      { leaderboard: 'each', teams: { count: 2, names: ['Червоні', 'Сині'] }, buffs: ['audience'], debuffs: ['fog'] },
    ),
    title: 'Команди 10j',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Редактор: «Командна гра» (375 px теж).
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Команди 10j' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  const teamsBlock = host.locator('details.teams');
  await teamsBlock.locator('summary').click();
  expect(await teamsBlock.getByRole('checkbox', { name: 'Грати командами', ...exact }).isChecked(), 'team play is on').toBe(true);
  await teamsBlock.getByText('Команд: 2', exact).waitFor();
  expect(await field(host, 'Назва команди 1').inputValue()).toBe('Червоні');
  expect(await field(host, 'Назва команди 2').inputValue()).toBe('Сині');
  await teamsBlock.getByRole('button', { name: 'Довідка: Командна гра', ...exact }).click();
  await host.getByRole('dialog', { name: 'Командна гра', ...exact }).waitFor();
  await shot(host, 'p10j-editor-teams');
  await host.keyboard.press('Escape');
  await teamsBlock.getByRole('button', { name: 'Більше команд', ...exact }).click();
  await teamsBlock.getByText('Команд: 3', exact).waitFor();
  expect(await field(host, 'Назва команди 3').inputValue()).toBe('Зелені');
  await teamsBlock.getByRole('button', { name: 'Менше команд', ...exact }).click();
  await teamsBlock.getByText('Команд: 2', exact).waitFor();
  expect(await field(host, 'Назва команди 3').count(), 'the third name is gone').toBe(0);
  await host.setViewportSize({ width: 375, height: 812 });
  await teamsBlock.scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10j-editor-teams-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // 2. Лобі: чотири людини, вибір команди й кубики.
  await host.locator('.quiz-list li', { hasText: 'Команди 10j' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10j', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya10j', 375, 812);
  await register(olya, 'menu', 'Оля', 'olya10j@example.com');
  const petro = await open('petro10j', 375, 812);
  const vira = await open('vira10j', 375, 812);
  const ihor = await open('ihor10j', 375, 812);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const viraFrames = socketFrames(vira);
  const ihorFrames = socketFrames(ihor);
  const viraSent = sentFrames(vira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(vira, code, 'Віра', false);
  await join(ihor, code, 'Ігор', false);
  const phones = [olya, petro, vira, ihor];
  const all = [host, stage, ...phones];

  await petro.locator('.team-pick-grid').waitFor();
  expect(await petro.locator('.team-pick').count(), 'one button per team').toBe(2);
  await expectNoSideScroll(petro, 'p10j-phone-pick');
  await pickTeamOn(petro, 'Сині');
  await expect.poll(() => stageTeam(stage, 'Сині'), POLL).toEqual(['Петро']);

  await host.getByRole('radio', { name: 'Кубик', ...exact }).click();
  await expect.poll(() => host.getByRole('radio', { name: 'Кубик', ...exact }).isChecked(), POLL).toBe(true);
  await host.getByRole('button', { name: 'Довідка: Кубик', ...exact }).waitFor();
  await host.locator('.host-teams').waitFor();
  {
    // Рядок учасника: ім'я, «У команду» й «Вилучити» — в один рядок.
    const row = host.locator('.team-person', { hasText: 'Оля' });
    const select = await row.getByRole('combobox').boundingBox();
    const kick = await row.getByRole('button', { name: 'Вилучити: Оля', ...exact }).boundingBox();
    expect(select !== null && kick !== null && Math.abs(select.y + select.height / 2 - (kick.y + kick.height / 2)) < 4, 'kick beside the select').toBe(true);
  }
  await shot(host, 'p10j-host-lobby');
  await host.setViewportSize({ width: 375, height: 812 });
  await host.locator('.host-teams').scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p10j-host-lobby-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Кидаємо кубики');
  for (const page of phones) await page.getByRole('button', { name: 'Кинути кубик', ...exact }).waitFor();
  await expectNoSideScroll(olya, 'p10j-phone-dice');
  const roll = async (page: Page, face: number) => {
    rigged.push(face);
    await click(page, 'Кинути кубик');
  };
  await roll(olya, 6);
  await roll(petro, 2);
  await roll(vira, 5);
  await roll(ihor, 2);
  // Нічия Петро — Ігор: тур перекидається, обидва кидають ще раз.
  for (const page of [petro, ihor]) await page.getByText('Нічия — кидай ще раз', exact).waitFor();
  await roll(petro, 3);
  await roll(ihor, 1);
  await expect.poll(() => stageTeam(stage, 'Червоні'), POLL).toEqual(['Оля', 'Віра']);
  await expect.poll(() => stageTeam(stage, 'Сині'), POLL).toEqual(['Петро', 'Ігор']);
  await stage.locator('.dice-status').getByText('Порядок визначено', exact).waitFor();
  await expectStageInView(stage, 'p10j-stage-lobby-dice');
  await shot(stage, 'p10j-stage-lobby-dice');

  // Капітан Синіх — Ігор (за порядком був би Петро).
  await host.getByRole('button', { name: 'Капітан: Ігор', ...exact }).click();
  await stage.locator('.stage-team', { has: stage.locator('.stage-team-name', { hasText: 'Сині' }) }).locator('li', { hasText: 'Ігор' }).locator('.captain-mark').waitFor();
  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 3. c1: капітан, чернетка, нічого не витікає.
  await stage.getByText('Столиця Австралії?', exact).waitFor();
  await teamBar(olya).getByText('Ти капітан', exact).waitFor();
  await field(olya, 'Ваша відповідь').waitFor();
  await vira.getByText('Відповідає капітан Оля — радьте вголос', exact).waitFor();
  expect(await vira.locator('textarea, input').count(), 'a teammate has no answer field').toBe(0);
  expect(await vira.getByRole('button', { name: 'Відповісти', ...exact }).count(), 'a teammate has no submit button').toBe(0);
  await expectNoSideScroll(vira, 'p10j-phone-watch');
  await field(olya, 'Ваша відповідь').fill('Канбер');
  await vira.locator('.team-draft', { hasText: 'Канбер' }).waitFor({ timeout: 1500 });
  await expectNoSideScroll(vira, 'p10j-phone-draft');
  for (const [who, frames] of [['stage', stageFrames], ['petro', petroFrames], ['ihor', ihorFrames]] as const) {
    expect(frames.join(NL), `${who} received the captain draft`).not.toContain('Канбер');
  }
  expect(viraFrames.join(NL), 'a teammate receives the draft').toContain('Канбер');
  await vira.locator('main, body').first().click({ position: { x: 10, y: 300 } });
  expect(viraSent.filter((frame) => frame.includes('player:answer')), 'a teammate sent no answer').toEqual([]);
  await field(olya, 'Ваша відповідь').fill('Канберра');
  await click(olya, 'Відповісти');
  await olya.getByText('Відповідь прийнято', exact).waitFor();
  await vira.getByText('Команда відповіла', exact).waitFor();
  await field(ihor, 'Ваша відповідь').fill('Сідней');
  await click(ihor, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  for (const [who, frames] of [['stage', stageFrames], ['petro', petroFrames], ['ihor', ihorFrames], ['olya', olyaFrames], ['vira', viraFrames]] as const) {
    expect(framesBeforeReveal(frames).join(NL), `${who} got the correct answer before the reveal`).not.toContain('"accepted"');
  }
  await click(host, 'Показати відповідь');
  await stage.getByText('Правильна відповідь: Канберра', exact).waitFor();
  await vira.getByText('Правильно!').waitFor();
  expect(await teamScore(host, 'Червоні')).toBe(100);
  expect(await teamScore(host, 'Сині')).toBe(0);
  await click(host, 'Далі');
  await stage.locator('.standings li', { hasText: 'Червоні' }).waitFor();
  expect(await stage.locator('.standings li', { hasText: 'Червоні' }).innerText()).toMatch(/Оля, Віра/);
  await expectStageInView(stage, 'p10j-stage-standings');
  await shot(stage, 'p10j-stage-standings');

  // 4. c2: хмара — кожен пише окремо, бали команд не змінюються.
  await click(host, 'Наступне запитання');
  await afterSplash(...all);
  await stage.getByText('Одне слово про осінь', exact).waitFor();
  const word = async (page: Page, text: string) => {
    await field(page, 'Слово 1').fill(text);
    await click(page, 'Відповісти');
  };
  expect(await vira.locator('.team-watch').count(), 'a cloud has no watch mode: everyone writes').toBe(0);
  await word(olya, 'листя');
  await word(vira, 'дощ');
  await word(petro, 'листя');
  await stage.getByText('Написали 3 з 4', exact).waitFor();
  await word(ihor, 'гарбуз');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати результати');
  await stage.locator('.word-cloud').waitFor();
  await stage.getByText('Написали 4', exact).waitFor();
  const wordSize = async (text: string) =>
    parseFloat(await stage.locator('.word-cloud .word', { hasText: text }).evaluate((el) => (globalThis as unknown as { getComputedStyle: (e: unknown) => { fontSize: string } }).getComputedStyle(el).fontSize));
  expect(await wordSize('листя'), 'the most popular word is the biggest').toBeGreaterThan(await wordSize('гарбуз'));
  await expectStageInView(stage, 'p10j-stage-cloud');
  await shot(stage, 'p10j-stage-cloud');
  await click(host, 'Далі');
  expect(await teamTotal(host, 'Червоні')).toBe(100);
  expect(await teamTotal(host, 'Сині')).toBe(0);

  // 5. Між c2 і c3: ведучий дарує Синім бали, капітан Ігор купує Туман для Червоних.
  const teamRow = (name: string) => teamRowOf(host, name);
  await teamRow('Сині').getByRole('button', { name: 'Бали', ...exact }).click();
  await teamRow('Сині').getByLabel('Своя сума', exact).fill('200');
  await teamRow('Сині').getByRole('button', { name: 'Нарахувати', ...exact }).click();
  await expect.poll(() => teamTotal(host, 'Сині'), POLL).toBe(200);
  await ihor.getByRole('button', { name: 'Дебафи', ...exact }).click();
  const shop = ihor.getByRole('dialog', { name: 'Дебафи для суперників' });
  await shop.waitFor();
  await shop.locator('.shop-item', { hasText: /Туман/ }).click();
  await shop.locator('.shop-target', { hasText: 'Червоні' }).click();
  await expectNoSideScroll(ihor, 'p10j-phone-shop');
  await shop.getByRole('button', { name: 'Купити за 200', ...exact }).click();
  await shop.waitFor({ state: 'detached' });
  await expect.poll(() => teamTotal(host, 'Сині'), POLL).toBe(0);

  // 6. c3: туман лише на телефоні капітана Червоних; зал голосує інша команда.
  await click(host, 'Наступне запитання');
  await afterSplash(...all);
  await stage.getByText('Скільки ніг у павука?', exact).waitFor();
  await olya.locator('.debuff-zone[data-debuff="fog"]').waitFor();
  await vira.getByText('На капітані дебаф: Туман', exact).waitFor();
  expect(await vira.locator('.debuff-zone[data-debuff="fog"]').count(), 'only the captain is in the fog').toBe(0);
  await expectNoSideScroll(vira, 'p10j-phone-debuff');
  await shot(olya, 'p10j-phone-debuff-captain');
  await pickOption(ihor, '(^|\\s)8$');
  await click(ihor, 'Відповісти');
  await ihor.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
  await takeBuff(olya, 'Запитання в залі');
  for (const page of [petro, ihor]) await page.locator('.vote-sheet').getByText('Червоні питає зал: як думаєте?', { exact: false }).waitFor();
  expect(await vira.locator('.vote-sheet').count(), 'a teammate of the asking captain does not vote').toBe(0);
  expect(await olya.locator('.vote-sheet').count(), 'the asking captain does not vote').toBe(0);
  await petro.waitForTimeout(300);
  await vote(petro, '8');
  await vote(ihor, '8');
  await olya.locator('.buff-panel').getByText(/100 %/).waitFor();
  await shot(olya, 'p10j-phone-hall');
  await expectNoSideScroll(olya, 'p10j-phone-hall');
  expect(await bodyText(stage)).not.toContain('100 %');
  await pickOption(olya, '(^|\\s)8$');
  await click(olya, 'Відповісти');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  await olya.getByText('Правильно!').waitFor();
  expect(await teamScore(host, 'Червоні')).toBe(100);
  expect(await teamScore(host, 'Сині')).toBe(100);

  // 7. Перезапуск: команди, склад і капітан на місці.
  await restart(async () => {
    for (const page of [...phones, stage, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor();
  });
  for (const page of [...phones, stage, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().waitFor();
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();
  await teamBar(ihor).getByText('Ти капітан', exact).waitFor();
  await teamBar(vira).getByText('Капітан: Оля', exact).waitFor();
  await click(host, 'Далі');
  await stage.locator('.standings li', { hasText: 'Сині' }).waitFor();
  expect(await stage.locator('.standings li', { hasText: 'Червоні' }).innerText()).toMatch(/Оля, Віра/);
  expect((await stage.locator('.standings li', { hasText: 'Сині' }).innerText()).replace(/\s+/g, ' ')).toMatch(/Петро, Ігор|Ігор, Петро/);
  expect(await teamTotal(host, 'Червоні')).toBe(200);
  expect(await teamTotal(host, 'Сині')).toBe(100);
  await expectStageInView(stage, 'p10j-stage-after-restart');
  await shot(stage, 'p10j-stage-after-restart');
  await shot(host, 'p10j-host-after-restart');

  // 8. b1: у бліці натискає будь-хто, і відповідає той, хто натиснув.
  await click(host, 'Наступний раунд');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);
  await stage.getByText('Хімічний символ золота?', exact).waitFor();
  await click(vira, 'Відповісти');
  await teamBar(olya).getByText('Відповідає Віра', exact).waitFor();
  await teamBar(vira).getByText('Відповідає Віра', exact).waitFor();
  await field(vira, 'Ваша відповідь').waitFor();
  await olya.getByText('Відповідає Віра — радьте вголос', exact).waitFor();
  expect(await olya.locator('textarea, input').count(), 'the captain only watches while a teammate answers').toBe(0);
  await expectNoSideScroll(olya, 'p10j-phone-buzzer');
  await field(vira, 'Ваша відповідь').fill('Au');
  await click(vira, 'Відповісти');
  await vira.getByText('Чекаємо на рішення ведучого', exact).waitFor();
  await host.getByText('Відповідає Червоні', exact).waitFor();
  await host.getByRole('button', { name: 'Правильно', ...exact }).click();
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).click();
  await vira.getByText(/Правильно/).first().waitFor();
  expect(await teamScore(host, 'Червоні')).toBe(100);
  await click(host, 'Далі');
  expect(await teamTotal(host, 'Червоні')).toBe(300);
  await click(host, 'Наступний раунд');
  await afterSplash(...all);

  // 9. Фінал: ставку робить і відповідає капітан.
  await click(host, 'Почати фінал');
  await olya.getByText(/Ваша ставка від 0 до 300/).waitFor();
  await vira.getByText('Капітан ставить за команду', exact).waitFor();
  await expectNoSideScroll(vira, 'p10j-phone-final-watch');
  await field(olya, 'Ставка').fill('100');
  await click(olya, 'Поставити');
  await field(ihor, 'Ставка').fill('50');
  await click(ihor, 'Поставити');
  await field(olya, 'Ваша відповідь').fill('366');
  await click(olya, 'Відповісти');
  await field(ihor, 'Ваша відповідь').fill('365');
  await click(ihor, 'Відповісти');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).click();
  await click(host, 'Наступний гравець');
  await click(host, 'Наступний гравець');
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const podium = (await stage.locator('.standings li').allTextContents()).map((text) => text.replace(/\s+/g, ' '));
  expect(podium[0]).toContain('Червоні');
  expect(podium[0]).toContain('400');
  expect(podium[1]).toContain('Сині');
  expect(podium[1]).toContain('50');
  await expectStageInView(stage, 'p10j-stage-podium');
  await shot(stage, 'p10j-stage-podium');

  // 10. Історія: склад команд, голоси людей, відповідь бліцу, дебаф.
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Команди 10j/ }).click();
  await host.getByText('Командна гра', exact).first().waitFor();
  const hostRows = host.locator('.standings li');
  await hostRows.first().waitFor();
  const standingsText = (await hostRows.allTextContents()).map((text) => text.replace(/\s+/g, ' '));
  expect(standingsText[0]).toContain('Червоні');
  expect(standingsText[0]).toMatch(/Склад: (Оля, Віра|Віра, Оля)/);
  expect(standingsText[1]).toContain('Сині');
  expect(standingsText[1]).toMatch(/Склад: (Ігор, Петро|Петро, Ігор)/);
  const items = host.locator('.rows.stacked > li');
  const cloudItem = (await items.filter({ hasText: 'Одне слово про осінь' }).textContent())!;
  expect(cloudItem).toContain('Проголосували: 4');
  for (const person of ['Оля', 'Віра', 'Петро', 'Ігор']) expect(cloudItem, `${person} voted in the cloud`).toContain(person);
  expect(await items.filter({ hasText: 'Хімічний символ золота?' }).textContent()).toContain('Червоні');
  await host.getByText(/Сині купує.*Туман для гравця Червоні/).first().waitFor();
  await shot(host, 'p10j-history');

  // 11. Профіль Олі: командна перемога.
  await olya.goto(`${base}/me`);
  const mine = olya.locator('.quiz-list li', { hasText: 'Команди 10j' });
  await mine.waitFor();
  const mineText = (await mine.innerText()).replace(/\s+/g, ' ');
  expect(mineText).toContain('Команда «Червоні»');
  expect(mineText).toContain('1 місце з 2');
  await expectNoSideScroll(olya, 'p10j-my-games');
  await olya.goto(`${base}/profile/stats`);
  await olya.getByRole('heading', { level: 1, name: 'Статистика', exact: true }).waitFor();
  expect(await stat(olya, 'перемога').textContent()).toBe('1перемога');
  await shot(olya, 'p10j-profile');

  expect(problems).toEqual([]);
}

it('part 10j: a full team lobby fits the 1280 × 720 stage — six teams of eight, then a dice round of eight', async () => {
  try {
    await fullLobby();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function fullLobby() {
  const host = await open('host10j-full', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host10jfull@example.com');
  const six = ['Червоні', 'Сині', 'Зелені', 'Жовті', 'Фіолетові', 'Помаранчеві'];
  const data = {
    ...makeRoundsQuiz([classicRound('rf1', [withPoints(withId(single, 'f-q1'), 100)], { speedBonus: false })], { teams: { count: 6, names: six } }),
    title: 'Повне лобі 10j',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Повне лобі 10j' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage10j-full', 1280, 720);
  await stage.goto(stageUrl);

  const room = ctx.manager.get(code)!;
  const teamIds = room.state.teams!.list.map((team) => team.id);
  const members: string[] = [];
  for (let n = 1; n <= 48; n++) {
    const joined = ctx.manager.join(code, `Гравець ${n}`, null);
    if (!joined.ok) throw new Error(`join ${n}: ${joined.error}`);
    ctx.manager.connect(room, { role: 'player', playerId: joined.playerId });
    members.push(joined.playerId);
  }
  expect(ctx.manager.host(room, { type: 'team-form', form: 'host' }).ok).toBe(true);
  members.forEach((memberId, n) => {
    expect(ctx.manager.host(room, { type: 'team-assign', memberId, teamId: teamIds[n % 6]! }).ok).toBe(true);
  });
  await expect.poll(() => stage.locator('.stage-team-members li').count(), POLL).toBe(48);
  await expectStageInView(stage, 'p10j-stage-lobby-full');
  await shot(stage, 'p10j-stage-lobby-full');
  expect(await stage.locator('.stage-team-members li').first().evaluate((el) => el.scrollWidth <= el.clientWidth), 'a nickname is cut').toBe(true);

  // Кубик на вісім людей: решту вилучено.
  for (const [n, memberId] of members.entries()) {
    if (n >= 8) expect(ctx.manager.host(room, { type: 'kick', playerId: memberId }).ok).toBe(true);
  }
  expect(ctx.manager.host(room, { type: 'team-form', form: 'dice' }).ok).toBe(true);
  expect(ctx.manager.host(room, { type: 'team-dice' }).ok, 'the dice round starts').toBe(true);
  await stage.locator('.dice-rows li').first().waitFor();
  await expectStageInView(stage, 'p10j-stage-lobby-dice-full');
  await shot(stage, 'p10j-stage-lobby-dice-full');

  expect(problems).toEqual([]);
}
