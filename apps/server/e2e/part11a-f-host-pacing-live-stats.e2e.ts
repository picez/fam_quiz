import { boardRound, classicRound, finalRound, ladderRound, makeRoundsQuiz, single, survivalRound, wipeoutRound, withId, withPoints } from '@quiz/engine/testing';
import { DEFAULT_RULES, type StateMeta } from '@quiz/shared';
import { type Locator, type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, liveRow, field, questionText, join, bodyText, expectNoSideScroll, stat, register, myId, POLL, sortZone, sortCard, sortBy, socketFrames, pickOption, numericAnswer, guideOn, expectStageInView, answerSurvey, writeLie, pickBluff, decide, choiceOf, sideRow, NL, framesUntilNextReveal, podiumScore, pickTeamOn, stageTeam, sentFrames, scoreCells, breakdownTexts, socketPlayer, frame } from './helpers/common';
import { exact, base, problems, pages, rigged, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 11a–11f і 11i: опис раунду, темп, живі відповіді, видиме сортування, рішення ва-банку, статистика, сцена на 8+ гравців.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();
/** Скільки мс кнопка була неактивною від цієї миті (11b): чекає, доки вона стане активною. */
async function enabledAfter(button: Locator, timeout = 8000): Promise<number> {
  const from = Date.now();
  await expect.poll(() => button.isDisabled(), { timeout }).toBe(false);
  return Date.now() - from;
}
/** Заповнення кнопки, що чекає (11b), дійшло до частки `share` (або вікно вже скінчилося): для кадрів зі смужкою посередині. */
async function paceAt(button: Locator, share: number): Promise<void> {
  const pace = async () => Number((await button.getAttribute('style'))?.match(/--pace:\s*([\d.]+)/)?.[1] ?? 1);
  await expect.poll(pace, { timeout: 4000 }).toBeGreaterThanOrEqual(share);
}
/** Сокетні кадри з відкритим вибором (11e). */
const CHOICE = /"choice":"(took|stay|auto)"/;
/** Час сервера (meta.serverNow) першого кадру state з індексу from, текст якого збігається з test; null — такого ще немає. */
function serverTimeOf(frames: string[], from: number, test: RegExp): number | null {
  for (const text of frames.slice(from)) {
    if (!text.startsWith('42["state",') || !test.test(text)) continue;
    try {
      return (JSON.parse(text.slice(2)) as [string, unknown, StateMeta])[2].serverNow;
    } catch {
      // Кадр обрізано.
    }
  }
  return null;
}

const NOTE_TAIL = 'Удачі на полі!';
const NOTE_BODY =
  'Це поле — про річки, гори й острови світу. Кожен по черзі вибирає клітинку, а відповідає той, хто вибрав. ' +
  'Дешеві клітинки вгорі, дорогі внизу; дві клітинки приховують ×2, одна — бліц, де відповідає найшвидший. ' +
  'На усній клітинці відповідайте вголос, ведучий позначить результат. ';
const LONG_NOTE_TEXT = `${NOTE_BODY.repeat(4)
  .slice(0, 600 - NOTE_TAIL.length - 1)
  .trimEnd()
  .padEnd(600 - NOTE_TAIL.length - 1, '.')} ${NOTE_TAIL}`;
/** Скільки рядків опису видно на сцені: обмеження з data-lines або, без нього, висота ÷ інтервал. */
const VISIBLE_NOTE_LINES = `(() => {
  const note = document.querySelector('.round-brief-note');
  if (note === null) return 0;
  const lines = note.dataset.lines;
  return lines === undefined || lines === 'none' ? Math.round(note.clientHeight / parseFloat(getComputedStyle(note).lineHeight)) : Number(lines);
})()`;

it('part 11a: editor — a 600-character round description with a counter, readable on the 1280 × 720 stage (at least five lines, clipped with an ellipsis; the board intro in two columns keeps the first rule line before and after the dice; final, ladder, survival and wipeout intros too) next to the newcomers note but whole on the phone and the host; board cells marked empty, incomplete and ready by the same check as saving, per-category counts, a legend and a round tab badge (375 px too)', async () => {
  try {
    await editorGame11a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function editorGame11a() {
  expect(LONG_NOTE_TEXT.length).toBe(600);
  const host = await open('host11a', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host11a@example.com');

  const q = (id: string, text: string, a: string, b: string, points: number) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit: 30,
    points,
    options: [
      { id: `${id}-a`, text: a },
      { id: `${id}-b`, text: b },
    ],
    correctId: `${id}-a`,
  });
  const rb11a = boardRound(
    'rb11a',
    [
      {
        title: 'Річки',
        cells: [
          q('r1', 'Яка річка тече через Відень?', 'Дунай', 'Рейн', 100),
          { question: q('r2', 'Через яке місто тече Темза?', 'Лондон', 'Париж', 200), mark: 'x2' },
          { question: q('r3', 'Яка річка найдовша в Україні?', 'Дніпро', 'Дністер', 300), kind: 'blitz', penalty: 'all' },
        ],
      },
      {
        title: 'Гори',
        cells: [
          q('g1', 'Найвища гора України?', 'Говерла', 'Петрос', 100),
          { question: q('g2', 'Монблан стоїть на кордоні Франції та…', 'Італії', 'Іспанії', 200), answerMode: 'voice' },
          { question: q('g3', 'Найвища гора світу?', 'Еверест', 'Кіліманджаро', 300), mark: 'x3' },
        ],
      },
      {
        title: 'Острови',
        cells: [
          q('o1', 'Найбільший острів світу?', 'Гренландія', 'Мадагаскар', 100),
          q('o2', 'На якому острові стоїть Палермо?', 'Сицилія', 'Сардинія', 200),
          q('o3', 'Хортиця — острів на якій річці?', 'Дніпро', 'Дунай', 300),
        ],
      },
    ],
    {
      title: 'Поле 11a',
      description: LONG_NOTE_TEXT,
      answerMode: 'phone',
      check: 'auto',
      rules: { penalty: 'minus', partial: null, streak: { length: 3, bonus: { kind: 'percent', value: 50 } }, multiplier: 2 },
    },
  );
  const rc11a = {
    ...classicRound('rc11a', [q('c1', 'Скільки континентів на Землі за найпоширенішою моделлю?', '7', '6', 100)], {
      title: 'Розминка',
      speedBonus: false,
    }),
    description: 'Коротко: одне запитання для розгону.',
  };
  const data = { ...makeRoundsQuiz([rb11a, rc11a], { leaderboard: 'each', newcomers: true }), title: 'Редактор 11a' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1. Опис у редакторі.
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Редактор 11a' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  const settings = host.locator('details', { has: host.locator('summary', { hasText: 'Налаштування раунду' }) }).first();
  if (!(await field(host, 'Опис раунду для гравців').isVisible())) await settings.locator('summary').click();
  const description = field(host, 'Опис раунду для гравців');
  expect((await description.inputValue()).length).toBe(600);
  const count = host.locator('.field-count').first();
  expect((await count.textContent())?.trim()).toBe('600 / 600');
  expect(await count.getAttribute('class')).toContain('is-near');
  const tall = (await description.boundingBox())!.height;
  await description.fill('Коротко');
  expect((await count.textContent())?.trim()).toBe('7 / 600');
  expect(await count.getAttribute('class')).not.toContain('is-near');
  expect((await description.boundingBox())!.height, 'the field grows with the text').toBeLessThan(tall);
  await description.fill(LONG_NOTE_TEXT);
  expect((await description.boundingBox())!.height).toBeCloseTo(tall, 0);
  await description.scrollIntoViewIfNeeded();
  await shot(host, 'p11a-editor-description');

  // 2. Поле в редакторі: стани клітинок.
  const cells = (name: RegExp) => host.getByRole('button', { name });
  expect(await cells(/^Категорія \d, клітинка \d: .*, готова$/).count(), 'all nine cells are ready').toBe(9);
  expect(await host.locator('.board-edit-ready').allTextContents()).toEqual(['3 / 3 готово', '3 / 3 готово', '3 / 3 готово']);
  expect(await host.locator('.round-tab-badge').count()).toBe(0);
  await cells(/^Категорія 1, клітинка 1: 100/).click();
  await questionText(host).fill('');
  await host.getByRole('button', { name: 'Категорія 1, клітинка 1: 100, не заповнена', ...exact }).waitFor();
  await cells(/^Категорія 2, клітинка 3: 300/).click();
  await field(host, 'Варіант 2').fill('');
  await host.getByRole('button', { name: 'Категорія 2, клітинка 3: 300 ×3, не заповнена', ...exact }).waitFor();
  await field(host, 'Назва категорії 3').fill('');
  expect(await field(host, 'Назва категорії 3').getAttribute('class')).toContain('is-incomplete');
  expect((await host.locator('.board-edit-ready').allTextContents()).map((text) => text.trim())).toEqual([
    '2 / 3 готово',
    '2 / 3 готово',
    '! 3 / 3 готово',
  ]);
  expect(await host.locator('.board-legend').textContent()).toContain('2 не готові');
  const tab = host.locator('.round-tabs').getByRole('button', { name: 'Поле 11a', ...exact });
  expect((await tab.locator('.round-tab-badge').textContent())?.trim()).toBe('2 не готові');
  const picked = host.getByRole('button', { name: 'Категорія 2, клітинка 3: 300 ×3, не заповнена', ...exact });
  const pickedClass = (await picked.getAttribute('class')) ?? '';
  expect(pickedClass).toContain('is-on');
  expect(pickedClass).toContain('is-incomplete');
  expect(await host.evaluate("getComputedStyle(document.querySelector('.board-edit-cell.is-on')).outlineStyle")).toBe('solid');
  await host.locator('.board-frame').scrollIntoViewIfNeeded();
  await shot(host, 'p11a-editor-board');
  await host.setViewportSize({ width: 375, height: 812 });
  await host.locator('.board-frame').scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'p11a-editor-board-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  await click(host, 'Зберегти');
  const list = host.locator('ul.problems');
  await list.waitFor();
  const listed = await list.locator('li').allTextContents();
  expect(listed.length, listed.join(' | ')).toBe(3);
  const all = listed.join('\n');
  expect(all).toContain('Категорія 3: немає назви.');
  expect(all).toContain('Категорія 1, запитання 1: впишіть текст запитання.');
  expect(all).toContain('Категорія 2, запитання 3: заповніть усі варіанти');
  expect(host.url()).toMatch(/\/quizzes\/.+/);
  await shot(host, 'p11a-editor-problems');

  await cells(/^Категорія 1, клітинка 1: 100/).click();
  await questionText(host).fill('Яка річка тече через Відень?');
  await cells(/^Категорія 2, клітинка 3: 300/).click();
  await field(host, 'Варіант 2').fill('Кіліманджаро');
  await field(host, 'Назва категорії 3').fill('Острови');
  expect(await cells(/^Категорія \d, клітинка \d: .*, готова$/).count(), 'all nine cells are ready again').toBe(9);
  expect(await host.locator('.round-tab-badge').count()).toBe(0);
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);

  // 3. Гра.
  await host.locator('.quiz-list li', { hasText: 'Редактор 11a' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage11a', 1280, 720);
  await stage.goto(stageUrl);
  const olya = await open('olya11a', 375, 812);
  const petro = await open('petro11a', 375, 812);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await click(host, 'Почати гру');
  await guideOn(stage, 'Відповідайте з телефона');
  await click(host, 'До гри');
  await afterSplash(stage, olya, petro);

  // 4. Заставка поля на сцені у дві колонки: опис обрізано, але не менше п’яти рядків — правила поступаються (лише перший рядок), до кубиків і після.
  await stage.locator('.round-brief.is-long').waitFor();
  await stage.locator('.round-brief-how').waitFor();
  expect(await stage.locator('.round-brief-lines li').count(), 'four rule lines in the DOM').toBe(4);
  await expect.poll(() => stage.locator('.round-brief-lines li:visible').count(), POLL).toBe(1);
  const columns = await stage.evaluate(`[document.querySelector('.board-intro-main').getBoundingClientRect().right, document.querySelector('.stage-dice').getBoundingClientRect().left]`) as number[];
  expect(columns[0], 'the schedule stands beside the description').toBeLessThan(columns[1]);
  const note = stage.locator('.round-brief-note');
  expect(await note.textContent()).toBe(LONG_NOTE_TEXT);
  const lines = async () => Number(await stage.evaluate("document.querySelector('.round-brief-note').dataset.lines"));
  await expect.poll(lines, POLL).toBeGreaterThanOrEqual(5);
  const before = await lines();
  console.log(`p11a-stage-intro: ${before} description lines visible`);
  expect(before).toBeLessThanOrEqual(12);
  expect(await note.evaluate((el) => el.scrollHeight > el.clientHeight + 1), 'the description is clipped').toBe(true);
  await expectStageInView(stage, 'p11a-stage-intro');
  await shot(stage, 'p11a-stage-intro');
  rigged.push(4, 2);
  await click(host, 'Кидати кубики');
  await click(host, 'Кинути за тих, хто лишився');
  await stage.locator('.dice-rows .die').first().waitFor();
  await stage.getByText('Порядок визначено').waitFor();
  await expect.poll(async () => (await lines()) <= before, POLL).toBe(true);
  await expectStageInView(stage, 'p11a-stage-dice');
  expect(await lines()).toBeLessThanOrEqual(before);
  expect(await stage.evaluate(VISIBLE_NOTE_LINES), 'the description stays readable after the dice').toBeGreaterThanOrEqual(5);
  console.log(`p11a-stage-dice: ${await lines()} description lines visible`);
  await shot(stage, 'p11a-stage-dice');

  // 5. Телефон: опис повністю.
  const phoneNote = olya.locator('.round-brief-note');
  expect(await phoneNote.textContent()).toBe(LONG_NOTE_TEXT);
  expect(await phoneNote.getAttribute('class')).not.toContain('is-fit');
  expect(await phoneNote.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), 'the phone shows it whole').toBe(true);
  expect(await phoneNote.textContent()).toContain(NOTE_TAIL);
  expect(await olya.locator('.round-brief-lines li:visible').count(), 'the phone shows every rule line').toBe(4);
  await expectNoSideScroll(olya, 'p11a-phone-intro');

  // 6. Пульт: опис повністю.
  const hostNote = host.locator('.round-brief-note').first();
  expect(await hostNote.textContent()).toBe(LONG_NOTE_TEXT);
  expect(await hostNote.getAttribute('class')).not.toContain('is-fit');
  expect(await hostNote.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), 'the host shows it whole').toBe(true);
  expect(await host.locator('.round-brief').first().getAttribute('data-rules'), 'the host keeps every rule line').toBeNull();
  await shot(host, 'p11a-host-intro');
  await host.setViewportSize({ width: 375, height: 812 });
  await expectNoSideScroll(host, 'p11a-host-intro-375');
  await host.setViewportSize({ width: 1280, height: 900 });

  // 7. Заставки інших раундів на сцені: 600 символів опису й пам’ятка для новачків — без прокрутки, і опис читається (щонайменше п’ять рядків).
  const four = (id: string, text: string, options: string[]) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit: 30,
    points: 0,
    options: options.map((option, i) => ({ id: `${id}-${i}`, text: option })),
    correctId: `${id}-0`,
  });
  const steps = [
    q('i1', 'Столиця Канади?', 'Оттава', 'Торонто', 100),
    q('i2', 'Найбільша планета Сонячної системи?', 'Юпітер', 'Сатурн', 200),
    q('i3', 'Столиця Туреччини?', 'Анкара', 'Стамбул', 300),
    q('i4', 'Найбільший океан?', 'Тихий', 'Індійський', 400),
    q('i5', 'Столиця Австралії?', 'Канберра', 'Сідней', 500),
  ];
  const ladderSteps = [
    four('l1', 'Столиця Австралії?', ['Канберра', 'Сідней', 'Мельбурн', 'Перт']),
    four('l2', 'Хімічний символ золота?', ['Au', 'Ag', 'Gd', 'Go']),
    four('l3', 'Найбільший океан?', ['Тихий', 'Атлантичний', 'Індійський', 'Північний Льодовитий']),
    four('l4', 'Скільки хвилин у годині?', ['60', '30', '90', '100']),
    four('l5', 'Скільки сторін у трикутника?', ['3', '2', '4', '5']),
  ];
  const intros: { name: string; title: string; round: object; ready: string }[] = [
    { name: 'final', title: 'Фінал 11a', round: finalRound('rf11a', q('f1', 'Найвища гора світу?', 'Еверест', 'Кіліманджаро', 1000), { title: 'Гори світу' }), ready: '.wager-theme' },
    { name: 'ladder', title: 'Мільйонер 11a', round: ladderRound('rl11a', ladderSteps as never, { title: 'Драбина 11a', pick: 'host', timer: false, safe: [2] }), ready: '.ladder-stage-intro' },
    {
      name: 'survival',
      title: 'Вибування 11a',
      round: survivalRound('rs11a', steps.map((step) => ({ ...step, points: 100 })) as never, [{ ...q('t1', 'Сонце — зірка?', 'Так', 'Ні', 100), timeLimit: 15 }] as never, { title: 'Хто лишиться' }),
      ready: '.survival-board',
    },
    { name: 'wipeout', title: 'Ва-банк 11a', round: wipeoutRound('rw11a', steps as never, { title: 'Драбина ва-банк' }), ready: '.wipeout-ladder' },
  ];
  for (const intro of intros) {
    const quiz = { ...makeRoundsQuiz([{ ...intro.round, description: LONG_NOTE_TEXT } as never], { leaderboard: 'each', newcomers: true }), title: intro.title };
    const stored = await host.request.post(`${base}/api/quizzes`, { data: quiz });
    expect(stored.ok(), await stored.text()).toBe(true);
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: intro.title }).getByRole('button', { name: 'Грати', ...exact }).click();
    await host.waitForURL(/\/host\/\d{6}$/);
    const introCode = host.url().slice(-6);
    const introStage = await open(`stage11a-${intro.name}`, 1280, 720);
    await introStage.goto((await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
    const phones = [await open(`ira11a-${intro.name}`, 375, 812), await open(`maks11a-${intro.name}`, 375, 812)];
    await join(phones[0], introCode, 'Іра', false);
    await join(phones[1], introCode, 'Макс', false);
    await click(host, 'Почати гру');
    await click(host, 'До гри');
    await afterSplash(introStage, ...phones);
    await introStage.locator(intro.ready).first().waitFor();
    await introStage.locator('.round-brief-how').waitFor();
    expect(await introStage.locator('.round-brief-note').textContent()).toBe(LONG_NOTE_TEXT);
    const visible = () => introStage.evaluate(VISIBLE_NOTE_LINES) as Promise<number>;
    await expect.poll(visible, POLL).toBeGreaterThanOrEqual(5);
    console.log(`p11a-stage-${intro.name}: ${await visible()} description lines visible (data-lines ${await introStage.evaluate("document.querySelector('.round-brief-note').dataset.lines")})`);
    await expectStageInView(introStage, `p11a-stage-${intro.name}`);
    await shot(introStage, `p11a-stage-${intro.name}`);
  }

  expect(problems).toEqual([]);
}

it('part 11b: pacing — the host button stays disabled and fills while the minimum time runs (guide page 2 s, round intro 3 s after the longer splash, early close 3 s after the start, reveal and leaderboard 2 s, survey rows 1 s after the first), a double tap stops on the reveal without an error, «До гри», pause and end round never wait (375 px too)', async () => {
  try {
    await pacingGame11b();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function pacingGame11b() {
  const host = await open('host11b', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host11b@example.com');

  const q = (id: string, text: string, right: string, wrong: string) => ({
    id,
    type: 'single' as const,
    text,
    imageUrl: null,
    video: null,
    timeLimit: 30,
    points: 100,
    options: [
      { id: `${id}-a`, text: right },
      { id: `${id}-b`, text: wrong },
    ],
    correctId: `${id}-a`,
  });
  const fruit = (id: string, text: string, popularity: number) => ({ id, text, popularity, accepted: [] });
  const s1 = {
    id: 's1',
    type: 'survey' as const,
    text: 'Назвіть фрукт, який люблять діти',
    imageUrl: null,
    video: null,
    points: 1000,
    timeLimit: 45,
    answers: 3,
    rows: [
      fruit('row-apple', 'Яблуко', 32),
      fruit('row-banana', 'Банан', 25),
      fruit('row-straw', 'Полуниця', 15),
      fruit('row-melon', 'Кавун', 10),
      fruit('row-pear', 'Груша', 8),
    ],
  };
  const rc11b = classicRound('rc11b', [q('p1', 'Яка планета найбільша в Сонячній системі?', 'Юпітер', 'Сатурн'), q('p2', 'Скільки ніг у павука?', '8', '6')], {
    title: 'Розминка 11b',
    speedBonus: false,
    shuffleOptions: false,
  });
  const rs11b = classicRound('rs11b', [s1] as never, { title: 'Сто до одного 11b', speedBonus: false, shuffleOptions: false });
  const data = { ...makeRoundsQuiz([rc11b, rs11b], { leaderboard: 'each', newcomers: true }), title: 'Темп 11b' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Темп 11b' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage11b', 1280, 720);
  await stage.goto(stageUrl);
  const olya = await open('olya11b', 375, 812);
  const petro = await open('petro11b', 375, 812);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);

  const button = (name: string) => host.getByRole('button', { name, ...exact });
  const next = button('Далі');
  const noAlert = async () => expect(await host.getByRole('alert').count()).toBe(0);

  // 1. «Як грати»: «Далі» чекає 2 с і заповнюється, «До гри» не чекає.
  await click(host, 'Почати гру');
  expect(await next.isDisabled()).toBe(true);
  expect(await next.getAttribute('class')).toContain('is-pacing');
  const guideWaiting = enabledAfter(next);
  await paceAt(next, 0.4);
  await shot(host, 'p11b-host-guide-pacing');
  const guideWait = await guideWaiting;
  console.log(`p11b guide page: «Далі» enabled after ${guideWait} ms`);
  expect(guideWait).toBeGreaterThanOrEqual(1500);
  expect(guideWait).toBeLessThanOrEqual(4000);
  await next.click();
  // «До гри» звільняється, щойно сервер підтвердив крок, а «Далі» на новій сторінці ще чекає.
  const toGame = button('До гри');
  expect(await enabledAfter(toGame)).toBeLessThanOrEqual(1000);
  expect(await next.isDisabled()).toBe(true);
  await toGame.click();

  // 2. Заставка раунду (3,5 с), потім «Почати раунд» чекає ще 3 с.
  expect(await stage.locator('.splash').getAttribute('style')).toContain('--splash-ms: 3500ms');
  await afterSplash(stage, olya, petro);
  const startRound = button('Почати раунд');
  expect(await startRound.isDisabled()).toBe(true);
  expect(await startRound.getAttribute('class')).toContain('is-pacing');
  const introWaiting = enabledAfter(startRound);
  await paceAt(startRound, 0.4);
  await shot(host, 'p11b-host-intro-pacing');
  const introWait = await introWaiting;
  console.log(`p11b intro: «Почати раунд» enabled ${introWait} ms after the splash`);
  expect(introWait).toBeGreaterThanOrEqual(2300);
  expect(introWait).toBeLessThanOrEqual(6000);
  await startRound.click();

  // 3. Запитання 1: дострокове «Закрити запитання» — 3 с після кінця заставки.
  expect(await stage.locator('.splash').getAttribute('style')).toContain('--splash-ms: 1800ms');
  await afterSplash(stage, olya, petro);
  const lock = button('Закрити запитання');
  expect(await lock.isDisabled()).toBe(true);
  const lockWait = enabledAfter(lock);
  await olya.getByRole('button', { name: /Юпітер/ }).click();
  await olya.getByText('Відповідь прийнято').waitFor();
  expect(await lock.isDisabled()).toBe(true);
  const lockMs = await lockWait;
  console.log(`p11b early close: enabled ${lockMs} ms after the question splash`);
  expect(lockMs).toBeGreaterThanOrEqual(2300);
  await lock.click();

  // 4. Подвійний дотик по «Показати відповідь» зупиняється на розкритті без помилки.
  await button('Показати відповідь').dblclick();
  await stage.locator('.choice.is-correct', { hasText: 'Юпітер' }).waitFor();
  expect(await next.isDisabled()).toBe(true);
  await noAlert();
  const revealWaiting = enabledAfter(next);
  await shot(stage, 'p11b-stage-reveal');
  await paceAt(next, 0.4);
  await shot(host, 'p11b-host-reveal-pacing');
  const revealWait = await revealWaiting;
  console.log(`p11b reveal after a double tap: «Далі» enabled after ${revealWait} ms`);
  expect(revealWait).toBeGreaterThanOrEqual(1000);
  // Гра не проскочила: сцена досі на розкритті, пульт не показує таблиці.
  expect(await stage.locator('.choice.is-correct', { hasText: 'Юпітер' }).count()).toBe(1);
  expect(await button('Наступне запитання').count()).toBe(0);
  await noAlert();
  await next.click();
  const nextQuestion = button('Наступне запитання');
  expect(await nextQuestion.isDisabled()).toBe(true);
  const boardWaiting = enabledAfter(nextQuestion);
  // Пульт на телефоні, поки кнопка чекає: панель дій не ламається.
  await host.setViewportSize({ width: 375, height: 812 });
  await paceAt(nextQuestion, 0.4);
  expect(await nextQuestion.isDisabled()).toBe(true);
  await expectNoSideScroll(host, 'p11b-host-375');
  await host.setViewportSize({ width: 1280, height: 900 });
  const boardWait = await boardWaiting;
  console.log(`p11b leaderboard: «Наступне запитання» enabled after ${boardWait} ms`);
  expect(boardWait).toBeGreaterThanOrEqual(1500);
  await nextQuestion.click();
  await afterSplash(stage, olya, petro);

  // 5. Пауза, продовження й «Завершити раунд» не чекають.
  const pause = button('Пауза');
  expect(await pause.isDisabled()).toBe(false);
  await pause.click();
  const resume = button('Продовжити');
  expect(await resume.isDisabled()).toBe(false);
  await resume.click();
  await pause.waitFor();
  const endRound = button('Завершити раунд');
  expect(await endRound.isDisabled()).toBe(false);
  await endRound.click();
  const nextRound = button('Наступний раунд');
  await nextRound.waitFor();
  await noAlert();

  // 6. «100 до 1»: перший рядок — 2 с, кожен наступний — 1 с.
  const roundWait = await enabledAfter(nextRound);
  console.log(`p11b round end: «Наступний раунд» enabled after ${roundWait} ms`);
  expect(roundWait).toBeGreaterThanOrEqual(1500);
  await nextRound.click();
  await afterSplash(stage, olya, petro);
  expect(await enabledAfter(startRound)).toBeGreaterThanOrEqual(2300);
  await startRound.click();
  await afterSplash(stage, olya, petro);
  await answerSurvey(olya, ['Яблуко', 'Банан', 'Груша']);
  await answerSurvey(petro, ['Кавун', 'Полуниця', 'ананас']);
  await host.getByText('Запитання закрите').first().waitFor();
  await click(host, 'Показати відповідь');
  const row1 = button('Відкрити рядок 1 з 5');
  const allRows = button('Відкрити всі');
  expect(await row1.isDisabled()).toBe(true);
  expect(await allRows.isDisabled()).toBe(true);
  expect(await allRows.getAttribute('class')).toContain('is-pacing');
  const firstRowWaiting = enabledAfter(row1);
  await paceAt(allRows, 0.4);
  await shot(host, 'p11b-host-survey-first');
  const firstRowWait = await firstRowWaiting;
  console.log(`p11b survey: row 1 enabled after ${firstRowWait} ms`);
  expect(firstRowWait).toBeGreaterThanOrEqual(1500);
  await row1.click();
  const row2 = button('Відкрити рядок 2 з 5');
  expect(await row2.isDisabled()).toBe(true);
  const rowWaiting = enabledAfter(row2);
  await paceAt(row2, 0.3);
  await shot(host, 'p11b-host-survey-row');
  const rowWait = await rowWaiting;
  console.log(`p11b survey: row 2 enabled after ${rowWait} ms`);
  expect(rowWait).toBeGreaterThanOrEqual(600);
  expect(rowWait).toBeLessThanOrEqual(2000);
  await row2.click();
  await expect.poll(() => allRows.isDisabled(), POLL).toBe(true);
  expect(await enabledAfter(allRows)).toBeGreaterThanOrEqual(600);
  await allRows.click();
  await expect.poll(() => stage.locator('.survey-row:not(.is-closed)').count(), POLL).toBe(5);
  expect(await next.isDisabled()).toBe(true);
  const exitWait = await enabledAfter(next);
  console.log(`p11b survey: «Далі» after all rows enabled after ${exitWait} ms`);
  expect(exitWait).toBeGreaterThanOrEqual(1500);
  await shot(stage, 'p11b-stage-survey');

  // Останнє запитання гри: «Далі» веде до підсумків.
  await next.click();
  await host.getByText('Гру завершено').first().waitFor();

  await noAlert();
  expect(problems).toEqual([]);
}

it('part 11c: live answers on the host — the panel first under the question with answered N of M and waiting chips (an offline player grey), each answer with an auto-check verdict before the reveal and never on the stage or phones, the counter jumps to it on 375 px, a sort card and progress, bluff lies then picks; the plain responses come back on the reveal', async () => {
  try {
    await liveGame11c();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

it('part 11c: team live answers — the captain draft in italics with who acts on the host only, then the team answer with its verdict', async () => {
  try {
    await teamLive11c();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Чипи «Чекаємо» панелі наживо (лише імена, без позначки «поза зв’язком»). */
async function liveChips(host: Page): Promise<string[]> {
  const chips = host.locator('#live-answers .live-chip');
  const names: string[] = [];
  for (let i = 0; i < (await chips.count()); i++) names.push(((await chips.nth(i).evaluate((el) => el.firstChild?.textContent ?? '')) as string).trim());
  return names;
}

async function liveGame11c() {
  const host = await open('host11c', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host11c@example.com');

  const common = { imageUrl: null, video: null };
  const t1 = { ...common, id: 't1', type: 'text' as const, text: 'Яке місто називають перлиною біля моря?', accepted: ['Одеса'], timeLimit: 60, points: 100 };
  const s1 = {
    ...common,
    id: 's1',
    type: 'single' as const,
    text: 'Яка річка найдовша в Україні?',
    timeLimit: 60,
    points: 100,
    options: [
      { id: 's1-a', text: 'Дніпро' },
      { id: 's1-b', text: 'Дністер' },
      { id: 's1-c', text: 'Десна' },
    ],
    correctId: 's1-a',
  };
  const so1 = {
    ...common,
    id: 'so1',
    type: 'sort' as const,
    text: 'Овочі й фрукти',
    timeLimit: 60,
    points: 100,
    lockSeconds: 3,
    categories: [
      { id: 'so1-c0', text: 'Овочі' },
      { id: 'so1-c1', text: 'Фрукти' },
    ],
    words: [
      { id: 'so1-w0', text: 'Морква', categoryId: 'so1-c0' },
      { id: 'so1-w1', text: 'Буряк', categoryId: 'so1-c0' },
      { id: 'so1-w2', text: 'Яблуко', categoryId: 'so1-c1' },
      { id: 'so1-w3', text: 'Груша', categoryId: 'so1-c1' },
    ],
  };
  const b1 = {
    ...common,
    id: 'b1',
    type: 'bluff' as const,
    text: 'Найбільше природне озеро України — …',
    points: 1000,
    timeLimit: 60,
    choiceTime: 30,
    accepted: ['Ялпуг'],
    lies: ['Світязь', 'Синевир', 'Кагул'],
  };
  const rc11c = classicRound('rc11c', [t1, s1, so1, b1] as never, { title: 'Наживо 11c', speedBonus: false, shuffleOptions: false });
  const data = { ...makeRoundsQuiz([rc11c], { leaderboard: 'each' }), title: 'Наживо 11c' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Наживо 11c' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage11c', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya11c', 375, 812);
  const petro = await open('petro11c', 375, 812);
  const ira = await open('ira11c', 375, 812);
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await stage.getByText('Іра').first().waitFor();

  const panel = host.locator('#live-answers');
  const toNext = async () => {
    await click(host, 'Далі');
    await click(host, 'Наступне запитання');
    await afterSplash(host, stage, olya, petro);
  };

  // 1. Чекаємо: панель першою під запитанням, лічильник і чипи; Іра йде — її чип сірий.
  await click(host, 'Почати гру');
  await afterSplash(host, stage, olya, petro, ira);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, olya, petro, ira);
  await panel.waitFor();
  await panel.locator('.live-count').getByText('Відповіли 0 з 3', exact).waitFor();
  expect(await liveChips(host)).toEqual(['Оля', 'Петро', 'Іра']);
  const afterQuestion = await host.evaluate(`(() => {
    const panels = [...document.querySelectorAll('main section.panel')];
    const at = panels.findIndex((p) => p.querySelector('h1.question') !== null);
    return at < 0 ? null : panels[at + 1]?.id ?? null;
  })()`);
  expect(afterQuestion, 'the live panel stands first after the question').toBe('live-answers');
  await ira.context().close();
  pages.delete('ira11c');
  const iraChip = panel.locator('.live-chip.is-offline', { hasText: 'Іра' });
  await iraChip.waitFor();
  expect(await iraChip.innerText()).toContain('поза зв’язком');
  await shot(host, 'p11c-host-waiting');

  // 2. Рядок з відповіддю й вердиктом; сцена й телефони нічого з цього не бачать.
  await numericAnswer(olya, 'Одеса');
  await olya.getByText('Відповідь прийнято', exact).waitFor();
  const olyaRow = liveRow(host, 'Оля');
  await olyaRow.locator('.live-answer', { hasText: 'Одеса' }).waitFor();
  await olyaRow.locator('.tag.is-correct').getByText('правильно', exact).waitFor();
  await expect.poll(() => liveChips(host), POLL).toEqual(['Петро', 'Іра']);
  await panel.locator('.live-count').getByText('Відповіли 1 з 3', exact).waitFor();
  await shot(host, 'p11c-host-live-row');
  expect(await stage.locator('#live-answers, .live-answers').count()).toBe(0);
  expect(await stage.locator('.tag.is-correct, .tag.is-wrong').count()).toBe(0);
  expect(await bodyText(stage)).not.toContain('Одеса');
  expect(await bodyText(petro)).not.toContain('Одеса');
  for (const [who, frames] of [['stage', stageFrames], ['petro', petroFrames]] as const) {
    const text = frames.join(NL);
    expect(text, `${who} received the live answers`).not.toContain('"live"');
    expect(text, `${who} received an answer of Оля`).not.toContain('Одеса');
  }
  await numericAnswer(petro, 'Львів');
  await liveRow(host, 'Петро').locator('.tag.is-wrong').getByText('ні', exact).waitFor();
  // Іра поза зв’язком: запитання закривається само, панель лишається до розкриття.
  await host.getByText('Запитання закрите').first().waitFor();
  await panel.locator('.live-waiting').getByText('Не відповіли:', exact).waitFor();
  expect(await liveChips(host)).toEqual(['Іра']);
  await shot(host, 'p11c-host-locked');

  // 3. Розкриття: панелі наживо немає, звичайні «Відповіді» з «Зарахувати» біля Петра.
  await click(host, 'Показати відповідь');
  await host.locator('.rows li', { hasText: 'Петро' }).getByRole('button', { name: 'Зарахувати', ...exact }).waitFor();
  expect(await panel.count()).toBe(0);
  await toNext();

  // 4. Пульт на телефоні: панель видно без прокрутки, лічильник прокручує до неї.
  await host.setViewportSize({ width: 375, height: 812 });
  await panel.waitFor();
  expect((await panel.boundingBox())!.y, 'the live panel is visible without scrolling on 375 px').toBeLessThan(812);
  await host.evaluate('scrollTo(0, document.body.scrollHeight)');
  const jump = host.getByRole('button', { name: 'До відповідей наживо', ...exact });
  // Подія без прокрутки Playwright: прокручує сама кнопка.
  await jump.dispatchEvent('click');
  await expect.poll(async () => {
    const y = (await panel.boundingBox())!.y;
    return y >= 0 && y < 812;
  }, POLL).toBe(true);
  await expectNoSideScroll(host, 'p11c-host-375');
  await shot(host, 'p11c-host-375-live');
  await pickOption(olya, 'Дніпро');
  await pickOption(petro, 'Десна');
  await liveRow(host, 'Петро').locator('.tag.is-wrong').waitFor();
  await host.setViewportSize({ width: 1280, height: 900 });
  await host.getByText('Запитання закрите').first().waitFor();
  await click(host, 'Показати відповідь');
  await toNext();

  // 5. Сортування: поточна картка й поступ у рядку, окремої панелі «Сортування» немає.
  await olya.locator('.sort-card').waitFor();
  const card = (await sortCard(olya))!;
  await sortBy(olya, 'tap', ['Морква', 'Буряк'].includes(card) ? 'Овочі' : 'Фрукти');
  await olya.locator('.sort-progress', { hasText: '1 з 4' }).waitFor();
  const nextCard = (await sortCard(olya))!;
  await expect.poll(() => liveRow(host, 'Оля').innerText(), POLL).toContain('розкладено 1 з 4');
  expect(await liveRow(host, 'Оля').innerText()).toContain(`картка «${nextCard}»`);
  expect(await host.locator('.sort-board').count(), 'no separate sort panel during the question').toBe(0);
  await shot(host, 'p11c-host-sort');
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  await host.locator('.sort-board').waitFor();
  await toNext();

  // 6. Блеф: вигадка без вердикту, далі вибір з вердиктом; сцена вибору гравців не бачить.
  await writeLie(olya, 'Шацьке');
  await olya.getByText('Твоя вигадка: «Шацьке»', { exact: false }).waitFor();
  await liveRow(host, 'Оля').getByText('вигадка: «Шацьке»', exact).waitFor();
  expect(await liveRow(host, 'Оля').locator('.tag.is-correct, .tag.is-wrong, .tag.is-partial').count(), 'a lie has no verdict').toBe(0);
  expect(await bodyText(petro)).not.toContain('Шацьке');
  await shot(host, 'p11c-host-lies');
  // Іра поза зв’язком: друга вигадка одразу відкриває вибір.
  await writeLie(petro, 'Тилігул');
  await pickBluff(olya, 'тилігул');
  await liveRow(host, 'Оля').getByText('вибрав «тилігул»', exact).waitFor();
  await liveRow(host, 'Оля').locator('.tag.is-wrong').getByText('ні', exact).waitFor();
  await pickBluff(petro, 'ялпуг');
  await liveRow(host, 'Петро').getByText('вибрав «ялпуг»', exact).waitFor();
  await liveRow(host, 'Петро').locator('.tag.is-correct').getByText('правильно', exact).waitFor();
  await shot(host, 'p11c-host-bluff');
  expect(await bodyText(stage)).not.toContain('вибрав');

  expect(problems).toEqual([]);
}

async function teamLive11c() {
  const host = await open('host11ct', 1280, 900);
  const hostFrames = socketFrames(host);
  await register(host, 'host', 'Марта Ведуча', 'host11ct@example.com');

  const t1 = { imageUrl: null, video: null, id: 't1', type: 'text' as const, text: 'Яке місто називають перлиною біля моря?', accepted: ['Одеса'], timeLimit: 90, points: 100 };
  const rt11c = classicRound('rt11c', [t1] as never, { title: 'Команди 11c', speedBonus: false });
  const data = { ...makeRoundsQuiz([rt11c], { leaderboard: 'each', teams: { count: 2, names: ['Червоні', 'Сині'] } }), title: 'Команди 11c' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Команди 11c' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage11ct', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya11ct', 375, 812);
  const petro = await open('petro11ct', 375, 812);
  const ira = await open('ira11ct', 375, 812);
  const marko = await open('marko11ct', 375, 812);
  const iraFrames = socketFrames(ira);
  const markoFrames = socketFrames(marko);
  const phones = [olya, petro, ira, marko];
  for (const [page, nickname, team] of [
    [olya, 'Оля', 'Червоні'],
    [petro, 'Петро', 'Червоні'],
    [ira, 'Іра', 'Сині'],
    [marko, 'Марко', 'Сині'],
  ] as const) {
    await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
  }
  await expect.poll(() => stageTeam(stage, 'Червоні'), POLL).toEqual(['Оля', 'Петро']);
  await expect.poll(() => stageTeam(stage, 'Сині'), POLL).toEqual(['Іра', 'Марко']);

  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // 1. Чипи команд, рядків ще немає.
  const panel = host.locator('#live-answers');
  await panel.waitFor();
  expect(await liveChips(host)).toEqual(['Червоні', 'Сині']);
  expect(await panel.locator('.live-row').count()).toBe(0);

  // 2. Чернетка капітана Червоних: курсивом, з «діє: Оля», лише на пульті й у товариша.
  await field(olya, 'Ваша відповідь').fill('Одес');
  const red = liveRow(host, 'Червоні');
  await red.locator('.live-draft em', { hasText: 'Одес' }).waitFor({ timeout: 2000 });
  await red.getByText('діє: Оля', exact).waitFor();
  await red.locator('.live-draft .tag').getByText('ще не надіслали', exact).waitFor();
  await shot(host, 'p11c-host-draft');
  expect(hostFrames.join(NL), 'the host receives the captain draft').toContain('Одес');
  for (const [who, frames] of [['stage', stageFrames], ['ira', iraFrames], ['marko', markoFrames]] as const) {
    expect(frames.join(NL), `${who} received the captain draft`).not.toContain('Одес');
  }
  await petro.locator('.team-draft', { hasText: 'Одес' }).waitFor({ timeout: 2000 });

  // 3. Відповідь команди з вердиктом; чернетки більше немає.
  await field(olya, 'Ваша відповідь').fill('Одеса');
  await click(olya, 'Відповісти');
  await olya.getByText('Відповідь прийнято', exact).waitFor();
  await red.locator('.live-answer', { hasText: 'Одеса' }).waitFor();
  await red.locator('.tag.is-correct').getByText('правильно', exact).waitFor();
  expect(await red.locator('.live-draft').count()).toBe(0);
  await numericAnswer(ira, 'Львів');
  await liveRow(host, 'Сині').locator('.tag.is-wrong').getByText('ні', exact).waitFor();
  await shot(host, 'p11c-host-team');

  expect(problems).toEqual([]);
}

it('part 11d: sorting seen by all — classic keeps cards private (no tilt sent or received, own ✗N and «не встиг» on the phone, none on the stage), a board cell shows the chooser card on the 1280 × 720 stage and other phones with a live tilt toward a zone, a hit landing in its column, a miss with the lock, chips losing placed words, the host row heading, and per-word marks on the reveal', async () => {
  try {
    await visibleSort11d();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

it('part 11d: team sorting — a teammate watches the captain card, tilt and columns; the other team and the stage get nothing', async () => {
  try {
    await teamSort11d();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Тягне картку частку share шляху до зони й тримає палець (11d): нахил без ходу. */
async function holdToward(page: Page, zone: string, share: number) {
  const card = (await page.locator('.sort-card').boundingBox())!;
  const to = (await sortZone(page, zone).boundingBox())!;
  const [x0, y0] = [card.x + card.width / 2, card.y + card.height / 2];
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + (to.x + to.width / 2 - x0) * share, y0 + (to.y + to.height / 2 - y0) * share, { steps: 8 });
  return async () => {
    await page.mouse.move(x0, y0, { steps: 4 });
    await page.mouse.up();
  };
}
/** Текст картки глядача; null — картки немає. */
const liveCard = async (page: Page) => (await page.evaluate("document.querySelector('.sort-live-card')?.textContent ?? null")) as string | null;
/** Стовпець сортування за назвою категорії. */
const sortColumn = (page: Page, name: string) => page.locator('.sort-reveal-col', { has: page.locator('h3', { hasText: name }) });

/** Запитання-сортування 11d і правильна категорія кожного слова (лише в тесті). */
function sortQuestions11d() {
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
  const cs = sortQuestion('cs', 'Хто це?', ['Ссавці', 'Птахи'], [['Кит', 0], ['Сова', 1], ['Кажан', 0], ['Лелека', 1]], 100, 3, 60);
  const basket: [string, string[]][] = [
    ['Овочі', ['Морква', 'Буряк', 'Цибуля', 'Капуста', 'Гарбуз']],
    ['Фрукти', ['Яблуко', 'Груша', 'Слива', 'Персик', 'Абрикос']],
    ['Ягоди', ['Малина', 'Смородина', 'Аґрус', 'Ожина', 'Чорниця']],
    ['Горіхи', ['Фундук', 'Мигдаль', 'Фісташка', 'Пекан', 'Макадамія']],
  ];
  // Слова вперемішку за категоріями: черга не йде стовпцями.
  const bsWords: [string, number][] = [];
  for (let i = 0; i < 5; i++) for (const [at, [, words]] of basket.entries()) bsWords.push([words[i]!, at]);
  const bs = sortQuestion('bs', 'Що в кошику?', basket.map(([name]) => name), bsWords, 20, 3, 120);
  return { where, cs, bs, categories: basket.map(([name]) => name) };
}

async function visibleSort11d() {
  const host = await open('host11d', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host11d@example.com');

  const { where, cs, bs, categories } = sortQuestions11d();
  const cellQ = (id: string, text: string, points: number) => ({ ...withPoints(withId(single, id), points), text, timeLimit: 30 });
  const rounds = [
    classicRound('rc11d', [cs], { title: 'Класика 11d', speedBonus: false }),
    boardRound(
      'rb11d',
      [
        // Поле — щонайменше 3 категорії по 3 клітинки.
        { title: 'Кошик', cells: [{ question: bs, answerMode: 'phone' }, cellQ('b2', 'Яке місто стоїть на Дніпрі?', 100), cellQ('b5', 'Яке місто стоїть на Дністрі?', 200)] },
        { title: 'Міста', cells: [cellQ('b3', 'Столиця Франції?', 100), cellQ('b4', 'Столиця Італії?', 200), cellQ('b6', 'Столиця Іспанії?', 300)] },
        { title: 'Річки', cells: [cellQ('b7', 'Найдовша річка Європи?', 100), cellQ('b8', 'Найдовша річка Африки?', 200), cellQ('b9', 'Найдовша річка Америки?', 300)] },
      ],
      { title: 'Поле 11d' },
    ),
  ];
  const data = { ...makeRoundsQuiz(rounds, { leaderboard: 'end' }), title: 'Сортування 11d' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Сортування 11d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage11d', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya11d', 375, 812);
  const petro = await open('petro11d', 375, 812);
  const petroFrames = socketFrames(petro);
  const olyaSent = sentFrames(olya);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').first().waitFor();

  /** Сортує все правильно, поки є картка. */
  const sortRest = async (page: Page) => {
    for (let card = await sortCard(page); card !== null; card = await sortCard(page)) await sortBy(page, 'tap', where[card]!);
  };
  const otherThan = (category: string, list: string[]) => list.find((item) => item !== category)!;
  /** Скінченні анімації (поява підсумку, блимання вердикту) дограли: кадр без напівпрозорого підсумку. */
  const settled = (page: Page) =>
    page.waitForFunction("document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity)");
  /** Сцена вміщається: без прокрутки, стовпці й картка в межах 720 px. */
  const stageFits = async (name: string) => {
    expect(await stage.evaluate('document.documentElement.scrollHeight <= innerHeight'), `${name}: the stage scrolls`).toBe(true);
    const bottoms = (await stage.evaluate(
      "[...document.querySelectorAll('.sort-reveal-col, .sort-live-card')].map((el) => Math.round(el.getBoundingClientRect().bottom))",
    )) as number[];
    for (const bottom of bottoms) expect(bottom, `${name}: a column or the card below the screen edge`).toBeLessThanOrEqual(720);
    await expectStageInView(stage, name);
  };

  // 1. Класика: живого показу немає — телефон не шле нахилу, сцена й Петро нічого не отримують.
  await click(host, 'Почати гру');
  await afterSplash(host, stage, olya, petro);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, olya, petro);
  await olya.locator('.sort-card').waitFor();
  await petro.locator('.sort-card').waitFor();
  const back = await holdToward(olya, where[(await sortCard(olya))!]!, 0.6);
  // Глядача тут немає, тож чекати нема на що: пауза лише дає дроселю шанс надіслати нахил, якби телефон його слав.
  await olya.waitForTimeout(300);
  await back();
  expect(olyaSent.some((frame) => frame.includes('player:sort-tilt')), 'a classic phone sent a tilt').toBe(false);
  for (const [who, frames] of [['stage', stageFrames], ['petro', petroFrames]] as const) {
    expect(frames.join(NL), `${who} received a tilt in classic`).not.toContain('sort:tilt');
  }
  expect(await stage.locator('.sort-live-card, .stage-sort-live').count()).toBe(0);
  expect(await petro.locator('.sort-live-card').count()).toBe(0);
  // Оля помиляється раз, потім розкладає все; Петро робить один хід.
  const classicMissed = (await sortCard(olya))!;
  await sortBy(olya, 'tap', otherThan(where[classicMissed]!, ['Ссавці', 'Птахи']));
  await olya.locator('.sort-lock').waitFor();
  await olya.locator('.sort-lock').waitFor({ state: 'detached', timeout: 5000 });
  await sortRest(olya);
  await olya.locator('.sort-done').waitFor();
  await sortBy(petro, 'tap', where[(await sortCard(petro))!]!);
  await petro.locator('.sort-progress', { hasText: '1 з 4' }).waitFor();
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  // Свої позначки: в Олі «✗1» на помилковому слові, у Петра три «не встиг»; на сцені позначок немає.
  const olyaOpen = olya.locator('.sort-reveal.is-open');
  await olyaOpen.waitFor();
  await olyaOpen.locator('li', { hasText: classicMissed }).locator('.sort-mark').getByText('✗1', exact).waitFor();
  expect(await olyaOpen.locator('li.is-late').count()).toBe(0);
  const petroOpen = petro.locator('.sort-reveal.is-open');
  await petroOpen.waitFor();
  expect(await petroOpen.locator('li.is-late').count()).toBe(3);
  expect(await petroOpen.locator('li.is-late .sort-late').allTextContents()).toEqual(['не встиг', 'не встиг', 'не встиг']);
  await stage.locator('.sort-reveal.is-open').waitFor();
  expect(await stage.locator('.sort-mark, .sort-late').count(), 'the classic stage shows personal marks').toBe(0);
  await Promise.all([settled(olya), settled(petro)]);
  await shot(olya, 'p11d-classic-phone-marks');
  await shot(petro, 'p11d-classic-late');
  await shot(stage, 'p11d-classic-stage');
  await expectNoSideScroll(olya, 'p11d-classic-phone-marks');

  // 2. Поле: Оля вибирає «Кошик» (20 слів × 20 балів); сцена й Петро бачать її картку.
  await click(host, 'Далі');
  await click(host, 'Наступний раунд');
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await olya.getByRole('button', { name: 'Кошик, 400', ...exact }).click();
  await afterSplash(stage, olya, petro);
  await olya.locator('.sort-card').waitFor();
  const olyaCard = (await sortCard(olya))!;
  await expect.poll(() => liveCard(stage), POLL).toBe(olyaCard);
  await expect.poll(() => liveCard(petro), POLL).toBe(olyaCard);
  expect(await petro.locator('.sort-card').count()).toBe(0);
  expect(await petro.locator('button.sort-zone').count()).toBe(0);
  // Слово на картці чипом не дублюється: 19 з 20.
  expect(await stage.locator('.sort-words li').count()).toBe(19);
  expect(await stage.locator('.sort-words li', { hasText: olyaCard }).count()).toBe(0);
  expect(await stage.locator('.sort-reveal.is-open').count(), 'the board reveal opened early').toBe(0);
  // «Оля сортує слова» на сцені зайве: заголовок уже каже «Відповідає Оля».
  expect(await stage.locator('.stage-sort-live .sort-watching').count()).toBe(0);
  await stageFits('p11d-stage-start');
  await expectNoSideScroll(petro, 'p11d-watch-start');
  // Телефон-глядач: стовпців під час гри немає, лічильники в зонах, решта слів згорнута — усе на одному екрані.
  expect(await petro.locator('.sort-reveal').count(), 'the watcher shows columns while playing').toBe(0);
  await petro.locator('.sort-zone', { hasText: `${categories[0]} · 0` }).waitFor();
  await petro.locator('details.sort-rest summary', { hasText: 'Ще 19 слів' }).waitFor();
  const restBottom = (await petro.evaluate("Math.round(document.querySelector('.sort-rest').getBoundingClientRect().bottom)")) as number;
  expect(restBottom, 'the watcher does not fit one 812 px screen').toBeLessThanOrEqual(812);
  await shot(stage, 'p11d-stage-start');
  await shot(petro, 'p11d-watch-start');

  // 3. Нахил: Оля тримає картку на шляху до зони — сцена, Петро й пульт бачать напрям.
  const zone = where[olyaCard]!;
  const release = await holdToward(olya, zone, 0.6);
  await expect.poll(async () => (await sortColumn(stage, zone).getAttribute('class')) ?? '', POLL).toContain('is-toward');
  const stageCard = stage.locator('.sort-live-card');
  expect(await stageCard.getAttribute('data-toward')).toBe(bs.categories[categories.indexOf(zone)]!.id);
  expect(await stageCard.getAttribute('style')).toContain('--tilt');
  await petro.locator('.sort-zone.is-toward', { hasText: zone }).waitFor({ timeout: 2000 });
  await expect.poll(() => liveRow(host, 'Оля').innerText(), POLL).toContain(`→ «${zone}»`);
  await shot(stage, 'p11d-stage-tilt');
  await shot(petro, 'p11d-watch-tilt');
  await shot(host, 'p11d-host-tilt');
  await shot(olya, 'p11d-play-hold');
  await release();
  await expect.poll(() => stage.locator('.is-toward').count(), POLL).toBe(0);
  await expect.poll(() => petro.locator('.is-toward').count(), POLL).toBe(0);

  // 4. Влучання: слово лягає в стовпець і зникає з чипів; нова картка — та сама, що в Олі.
  await sortBy(olya, 'drag', zone);
  await sortColumn(stage, zone).locator('li', { hasText: olyaCard }).waitFor();
  await shot(stage, 'p11d-stage-hit');
  expect(await stage.locator('.sort-words li', { hasText: olyaCard }).count()).toBe(0);
  const second = await sortCard(olya);
  await expect.poll(() => liveCard(stage), POLL).toBe(second);
  await petro.locator('.sort-zone', { hasText: `${zone} · 1` }).waitFor();
  await expect.poll(() => liveCard(petro), POLL).toBe(second);

  // 5. Помилка: у глядачів підвисання з відліком і помилкове слово на картці.
  const missed = (await sortCard(olya))!;
  await sortBy(olya, 'tap', otherThan(where[missed]!, categories));
  for (const page of [stage, petro]) {
    await page.locator('.sort-lock', { hasText: 'Підвисання' }).waitFor({ timeout: 2000 });
    expect(await liveCard(page)).toBe(missed);
  }
  await shot(stage, 'p11d-stage-miss');
  await shot(petro, 'p11d-watch-miss');
  await olya.locator('.sort-lock').waitFor({ state: 'detached', timeout: 5000 });
  for (let i = 0; i < 3; i++) await sortBy(olya, 'tap', where[(await sortCard(olya))!]!);
  await olya.locator('.sort-progress', { hasText: '4 з 20' }).waitFor();
  // 4 у стовпцях, 1 на картці.
  await expect.poll(() => stage.locator('.sort-words li').count(), POLL).toBe(15);
  expect(await stage.locator('.sort-reveal.is-live li').count()).toBe(4);

  // 6. Розкриття: усі слова в стовпцях, «✗1» на помилковому, 16 «не встиг» — на сцені, у Петра й в Олі.
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  for (const page of [stage, petro, olya]) {
    const opened = page.locator('.sort-reveal.is-open');
    await opened.waitFor();
    await opened.locator('li', { hasText: missed }).locator('.sort-mark').getByText('✗1', exact).waitFor();
    expect(await opened.locator('li.is-late').count()).toBe(16);
    expect(await opened.locator('li.is-late', { hasText: missed }).count()).toBe(1);
  }
  await stageFits('p11d-stage-reveal');
  await expectNoSideScroll(petro, 'p11d-watch-reveal');
  await Promise.all([settled(stage), settled(petro), settled(olya)]);
  await shot(stage, 'p11d-stage-reveal');
  await shot(petro, 'p11d-watch-reveal');
  await shot(olya, 'p11d-play-reveal');

  expect(problems).toEqual([]);
}

async function teamSort11d() {
  const host = await open('host11dt', 1280, 900);
  const hostFrames = socketFrames(host);
  await register(host, 'host', 'Марта Ведуча', 'host11dt@example.com');

  const { where, cs } = sortQuestions11d();
  const rt11d = classicRound('rt11d', [cs], { title: 'Команди 11d', speedBonus: false });
  const data = { ...makeRoundsQuiz([rt11d], { leaderboard: 'each', teams: { count: 2, names: ['Червоні', 'Сині'] } }), title: 'Команди 11d' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Команди 11d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage11dt', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya11dt', 375, 812);
  const petro = await open('petro11dt', 375, 812);
  const ira = await open('ira11dt', 375, 812);
  const marko = await open('marko11dt', 375, 812);
  const petroFrames = socketFrames(petro);
  const iraFrames = socketFrames(ira);
  const markoFrames = socketFrames(marko);
  const phones = [olya, petro, ira, marko];
  for (const [page, nickname, team] of [
    [olya, 'Оля', 'Червоні'],
    [petro, 'Петро', 'Червоні'],
    [ira, 'Іра', 'Сині'],
    [marko, 'Марко', 'Сині'],
  ] as const) {
    await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
  }
  await expect.poll(() => stageTeam(stage, 'Червоні'), POLL).toEqual(['Оля', 'Петро']);
  await expect.poll(() => stageTeam(stage, 'Сині'), POLL).toEqual(['Іра', 'Марко']);

  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // 1. Петро дивиться на картку свого капітана.
  await olya.locator('.sort-card').waitFor();
  const card = (await sortCard(olya))!;
  await expect.poll(() => liveCard(petro), POLL).toBe(card);
  await petro.getByText('Команда «Червоні» сортує слова', exact).waitFor();
  expect(await petro.locator('.sort-card').count()).toBe(0);

  // 2. Нахил капітана бачать товариш і пульт; інша команда й сцена — нічого.
  const zone = where[card]!;
  const release = await holdToward(olya, zone, 0.6);
  await petro.locator('.sort-zone.is-toward', { hasText: zone }).waitFor({ timeout: 2000 });
  await expect.poll(() => hostFrames.some((frame) => frame.includes('sort:tilt')), POLL).toBe(true);
  expect(petroFrames.join(NL)).toContain('sort:tilt');
  for (const [who, frames] of [['stage', stageFrames], ['ira', iraFrames], ['marko', markoFrames]] as const) {
    expect(frames.join(NL), `${who} received the red captain tilt`).not.toContain('sort:tilt');
  }
  await shot(petro, 'p11d-team-watch-tilt');
  await release();

  // 3. Хід капітана: слово в стовпці товариша; у Синіх стовпці порожні, на сцені картки немає.
  await sortBy(olya, 'tap', zone);
  await petro.locator('.sort-zone', { hasText: `${zone} · 1` }).waitFor();
  await marko.locator('.sort-zone', { hasText: `${zone} · 0` }).waitFor();
  expect(await marko.locator('.sort-zone-count', { hasText: '1' }).count(), 'the other team sees the red columns').toBe(0);
  expect(await stage.locator('.sort-live-card').count()).toBe(0);
  for (const [who, frames] of [['stage', stageFrames], ['ira', iraFrames], ['marko', markoFrames]] as const) {
    expect(frames.join(NL), `${who} received the red captain tilt`).not.toContain('sort:tilt');
  }
  await shot(petro, 'p11d-team-watch-column');

  expect(problems).toEqual([]);
}

it('part 11e: wipeout decisions — banks of everyone in beside the question on the 1280 × 720 stage and in a phone strip, right and burned banks on the reveal for players and watchers, choices hidden while the 10 s window runs, then «Рішення» on the stage, phones and host with taken, going on and taken by default, the host waits 3 s, the round end groups as before', async () => {
  try {
    await wipeoutDecisions11e();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

it('part 11e: team wipeout decisions — teammates see the strip with team banks and «Рішення» with both teams after the captains decide', async () => {
  try {
    await teamWipeout11e();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Запитання «Ва-банк» 11e: ціни 100…500. */
function wipeoutQuestions11e() {
  const common = { imageUrl: null, video: null, timeLimit: 20 };
  const e1 = {
    ...common,
    id: 'e1',
    type: 'single' as const,
    text: 'Яка планета найближча до Сонця?',
    points: 100,
    options: [{ id: 'e1-a', text: 'Меркурій' }, { id: 'e1-b', text: 'Венера' }, { id: 'e1-c', text: 'Марс' }],
    correctId: 'e1-a',
  };
  const e2 = { ...common, id: 'e2', type: 'boolean' as const, text: 'Кит — ссавець', points: 200, correct: true };
  const e3 = { ...common, id: 'e3', type: 'numeric' as const, text: 'Скільки ніг у павука?', points: 300, correct: 8, tolerance: 0 };
  const e4 = { ...common, id: 'e4', type: 'text' as const, text: 'Столиця Японії?', points: 400, accepted: ['Токіо'] };
  const e5 = { ...common, id: 'e5', type: 'slider' as const, text: 'Скільки хвилин у годині?', points: 500, min: 0, max: 120, step: 1, correct: 60, tolerance: 2 };
  return [e1, e2, e3, e4, e5];
}

/** Смужка банків телефону (11e), коли вона з'явилася. */
async function stripOf(page: Page): Promise<string> {
  const strip = page.locator('.wipeout-strip-phone');
  await strip.waitFor();
  return (await strip.innerText()).trim();
}

/** Колонка банків сцени не налазить на запитання й варіанти і не виходить за низ екрана. */
async function expectSideApart(stage: Page, name: string) {
  const box = (await stage.evaluate(`(() => {
    const side = document.querySelector('aside.wipeout-side').getBoundingClientRect();
    const h1 = document.querySelector('.stage-main h1').getBoundingClientRect();
    const choices = [...document.querySelectorAll('.stage-question li.choice')].map((el) => el.getBoundingClientRect().right);
    return { left: side.left, bottom: side.bottom, h1: h1.right, choices };
  })()`)) as { left: number; bottom: number; h1: number; choices: number[] };
  expect(box.left, `${name}: the bank column covers the question`).toBeGreaterThanOrEqual(box.h1);
  for (const right of box.choices) expect(box.left, `${name}: the bank column covers an option`).toBeGreaterThanOrEqual(right);
  expect(box.bottom, `${name}: the bank column below the screen edge`).toBeLessThanOrEqual(720);
}

async function wipeoutDecisions11e() {
  const host = await open('host11e', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host11e@example.com');

  const data = {
    ...makeRoundsQuiz([wipeoutRound('rw11e', wipeoutQuestions11e() as never, { title: 'Драбина 11e', shuffleOptions: false })], { leaderboard: 'end' }),
    title: 'Ва-банк 11e',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Ва-банк 11e' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage11e', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya11e', 375, 812);
  const petro = await open('petro11e', 375, 812);
  const vira = await open('vira11e', 375, 812);
  const olyaFrames = socketFrames(olya);
  const viraFrames = socketFrames(vira);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(vira, code, 'Віра', false);
  const phones = [olya, petro, vira];
  const all = [host, stage, ...phones];
  await click(host, 'Почати гру');
  await afterSplash(...all);
  const fromE1 = { stage: stageFrames.length, vira: viraFrames.length };
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 1. e1: банки всіх у грі збоку від запитання й у смужці телефонів.
  await stage.getByText('Яка планета найближча до Сонця?', exact).waitFor();
  const side = stage.locator('aside.wipeout-side');
  await side.getByText('У грі · 3', exact).waitFor();
  expect(await side.locator('li .score').allTextContents()).toEqual(['0', '0', '0']);
  await expectStageInView(stage, 'p11e-stage-question');
  await expectSideApart(stage, 'p11e-stage-question');
  for (const page of phones) {
    const strip = await stripOf(page);
    expect(strip.startsWith('У грі:'), strip).toBe(true);
    for (const pair of ['Оля 0', 'Петро 0', 'Віра 0']) expect(strip).toContain(pair);
  }
  await expectNoSideScroll(olya, 'p11e-phone-strip');
  await shot(stage, 'p11e-stage-question');
  await shot(olya, 'p11e-phone-strip');

  // 2. Розкриття e1: «✓ 0 → 100» у колонці сцени й у списку сходинки телефонів; банк після відповіді до розкриття не приходив.
  for (const page of phones) await pickOption(page, 'Меркурій');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  for (const nick of ['Оля', 'Петро', 'Віра']) {
    const row = sideRow(stage, nick);
    await row.getByText('0 → 100', exact).waitFor();
    expect(await row.locator('.wipeout-verdict [aria-hidden="true"]').textContent()).toBe('✓');
  }
  for (const [who, frames, from] of [['stage', stageFrames, fromE1.stage], ['vira', viraFrames, fromE1.vira]] as const) {
    const text = framesUntilNextReveal(frames, from).join(NL);
    const at = text.search(/"prev":\d/);
    expect(at < 0, `${who} got a bank before the reveal: ${text.slice(Math.max(0, at - 150), at + 150)}`).toBe(true);
  }
  for (const page of phones) await expect.poll(() => page.locator('.wipeout-step-list li.is-right').count(), POLL).toBe(3);
  await expectStageInView(stage, 'p11e-stage-reveal');
  await expectNoSideScroll(olya, 'p11e-phone-reveal');
  await shot(stage, 'p11e-stage-reveal');
  await shot(olya, 'p11e-phone-reveal');

  // 3. Вікно рішення: Оля забирає, Петро йде далі, Віра чекає таймера; вибір інших прихований.
  await click(host, 'Далі');
  await stage.getByText('Вирішили 0 з 3', exact).waitFor();
  const from = { stage: stageFrames.length, olya: olyaFrames.length, vira: viraFrames.length };
  await decide(olya, true);
  await decide(petro, false);
  await stage.getByText('Вирішили 2 з 3', exact).waitFor();
  for (const [who, page] of [['stage', stage], ['vira', vira]] as const) {
    expect(await page.locator('.wipeout-group.is-choices').count(), `${who} shows choices while the window is open`).toBe(0);
    const text = await bodyText(page);
    expect(text, `${who} sees a choice`).not.toContain('Забрано 100');
    expect(text, `${who} sees a choice`).not.toContain('Далі з 100');
  }
  await host.locator('.host-wipeout li', { hasText: 'Оля' }).getByText('забирає', exact).waitFor();
  await host.locator('.host-wipeout li', { hasText: 'Петро' }).getByText('іде далі', exact).waitFor();
  await shot(stage, 'p11e-stage-window');

  // 4. Екран «Рішення» після таймера: три різні позначки скрізь, пульт чекає 3 с.
  // Спершу пульт: кнопка мусить застати очікування, тож між появою екрана й перевіркою не стоїть сцена.
  const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
  await next.waitFor({ timeout: 15_000 });
  expect(await next.isDisabled(), 'the host waits on the decisions screen').toBe(true);
  // Мінімум рахуємо від миті екрана «Рішення» за часом сервера (перший кадр з вибором), а не від того, коли тест помітив його на сцені:
  // опитування локатора й перемальовування сцени під навантаженням з'їдали б запас у 500 мс.
  const decisionsAt = await expect
    .poll(() => serverTimeOf(stageFrames, from.stage, CHOICE), { timeout: 5000 })
    .not.toBeNull()
    .then(() => serverTimeOf(stageFrames, from.stage, CHOICE)!);
  const waited = expect
    .poll(() => next.isEnabled(), { timeout: 6000 })
    .toBe(true)
    .then(() => Date.now() - decisionsAt);
  await stage.locator('.wipeout-group.is-choices').waitFor({ timeout: 15_000 });
  for (const [who, frames, start] of [['stage', stageFrames, from.stage], ['olya', olyaFrames, from.olya], ['vira', viraFrames, from.vira]] as const) {
    for (const frame of frames.slice(start)) {
      if (CHOICE.test(frame)) expect(frame, `${who} got a choice while the window was open`).toContain('"decide":null');
    }
  }
  await stage.locator('h1', { hasText: 'Рішення' }).waitFor();
  const choices: [string, string][] = [
    ['Оля', 'Забрано 100'],
    ['Петро', 'Далі з 100'],
    ['Віра', 'Без вибору — забрано 100'],
  ];
  for (const [who, page] of [['stage', stage], ['olya', olya], ['host', host]] as const) {
    await page.locator('.wipeout-group.is-choices').waitFor();
    for (const [nick, text] of choices) expect(await choiceOf(page, nick), `${who}: ${nick}`).toBe(text);
  }
  expect(await petro.locator('.wipeout-group.is-choices li.is-me .name').textContent()).toBe('Петро');
  await petro.getByText('Ти йдеш далі з 100', exact).waitFor();
  await vira.locator('p.wipeout-state', { hasText: 'Без вибору — забрано 100' }).waitFor();
  await expectStageInView(stage, 'p11e-stage-decisions');
  await expectNoSideScroll(petro, 'p11e-phone-decisions');
  await shot(stage, 'p11e-stage-decisions');
  await shot(petro, 'p11e-phone-decisions');
  await shot(vira, 'p11e-phone-decisions-auto');
  await shot(host, 'p11e-host-decisions');
  expect(await waited, 'the decisions screen minimum').toBeGreaterThanOrEqual(2500);

  // 5. e2: грає лише Петро — і його помилку бачать сцена та Віра.
  await click(host, 'Наступне запитання');
  await afterSplash(...all);
  await stage.getByText('Кит — ссавець', exact).waitFor();
  await side.getByText('У грі · 1', exact).waitFor();
  expect(await sideRow(stage, 'Петро').locator('.score').textContent()).toBe('100');
  await side.getByText('Забрали: 2 · Згоріли: 0', exact).waitFor();
  expect(await stripOf(olya)).toBe('У грі: Петро 100');
  await expectStageInView(stage, 'p11e-stage-e2');
  await expectSideApart(stage, 'p11e-stage-e2');
  await pickOption(petro, '(^|\\s)Ні$');
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  for (const page of [stage, vira]) {
    const row = sideRow(page, 'Петро');
    await row.getByText('банк 100 згорів', exact).waitFor();
    expect(await row.locator('.wipeout-verdict [aria-hidden="true"]').textContent()).toBe('✗');
  }
  await expectStageInView(stage, 'p11e-stage-burned');
  await shot(stage, 'p11e-stage-burned');
  await shot(vira, 'p11e-phone-burned-watch');

  // 6. Нікого в грі: раунд (тут і гра) закінчується без вікна й без «Рішення»; забране лишається, згоріле — ні.
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  for (const page of [stage, ...phones]) expect(await page.locator('.wipeout-group.is-choices').count()).toBe(0);
  for (const [nick, score] of [['Оля', 100], ['Віра', 100], ['Петро', 0]] as const) await expect.poll(() => podiumScore(host, nick), POLL).toBe(score);
  await shot(stage, 'p11e-stage-round-end');

  expect(problems).toEqual([]);
}

async function teamWipeout11e() {
  const host = await open('host11et', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host11et@example.com');

  const data = {
    ...makeRoundsQuiz([wipeoutRound('rt11e', wipeoutQuestions11e() as never, { title: 'Команди 11e', shuffleOptions: false })], {
      leaderboard: 'end',
      teams: { count: 2, names: ['Червоні', 'Сині'] },
    }),
    title: 'Команди 11e',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Команди 11e' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage11et', 1280, 720);
  await stage.goto(stageUrl);
  const olya = await open('olya11et', 375, 812);
  const petro = await open('petro11et', 375, 812);
  const ira = await open('ira11et', 375, 812);
  const marko = await open('marko11et', 375, 812);
  const phones = [olya, petro, ira, marko];
  for (const [page, nickname, team] of [
    [olya, 'Оля', 'Червоні'],
    [petro, 'Петро', 'Червоні'],
    [ira, 'Іра', 'Сині'],
    [marko, 'Марко', 'Сині'],
  ] as const) {
    await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
  }
  await expect.poll(() => stageTeam(stage, 'Червоні'), POLL).toEqual(['Оля', 'Петро']);
  await expect.poll(() => stageTeam(stage, 'Сині'), POLL).toEqual(['Іра', 'Марко']);

  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // 1. Товариші бачать смужку з банками команд; на сцені — обидві команди.
  await stage.getByText('Яка планета найближча до Сонця?', exact).waitFor();
  for (const page of [petro, marko]) expect(await stripOf(page)).toBe('У грі: Червоні 0 · Сині 0');
  await expect.poll(() => stage.locator('aside.wipeout-side li .name').allTextContents(), POLL).toEqual(['Червоні', 'Сині']);
  await expectStageInView(stage, 'p11e-team-stage');
  await expectNoSideScroll(petro, 'p11e-team-strip');
  await shot(petro, 'p11e-team-strip');

  // 2. Капітани відповідають; у товариша список сходинки з обома командами.
  for (const page of [olya, ira]) {
    await pickOption(page, 'Меркурій');
    await click(page, 'Відповісти');
  }
  await host.getByText('Запитання закрите').waitFor();
  await click(host, 'Показати відповідь');
  for (const team of ['Червоні', 'Сині']) await sideRow(petro, team).getByText('0 → 100', exact).waitFor();

  // 3. Вирішують капітани; обидва вирішили — вікно закривається одразу.
  await click(host, 'Далі');
  await petro.getByText('Капітан вирішує за команду…', exact).waitFor();
  await decide(olya, true);
  await decide(ira, false);

  // 4. «Рішення» з обома командами в товаришів.
  for (const [who, page] of [['petro', petro], ['marko', marko]] as const) {
    await page.locator('.wipeout-group.is-choices').waitFor();
    expect(await choiceOf(page, 'Червоні'), `${who}: Червоні`).toBe('Забрано 100');
    expect(await choiceOf(page, 'Сині'), `${who}: Сині`).toBe('Далі з 100');
  }
  expect(await petro.locator('.wipeout-group.is-choices li.is-me .name').textContent()).toBe('Червоні');
  expect(await petro.getByText('Капітан вирішує за команду…', exact).count()).toBe(0);
  await expectNoSideScroll(marko, 'p11e-team-decisions');
  await shot(marko, 'p11e-team-decisions');

  // 5. Кінець гри.
  await click(host, 'Завершити гру');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();

  expect(problems).toEqual([]);
}

it('part 11f: stats — round columns and the own plus / minus in the phone table (hidden until the reveal), «+N за раунд» with the best and the biggest climb on the 1280 × 720 stage round end, the folded host table opens anyone, the history shows participant × round with plus / minus, the profile counts the second place', async () => {
  try {
    await stats11f();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Ключі розбивок у сокетних кадрах (11f). */
const MY_BREAKDOWN = /"myBreakdown":\{/;
const ALL_BREAKDOWNS = /"breakdowns":\{/;

function statsQuestions11f() {
  const common = { imageUrl: null, video: null, timeLimit: 20 };
  const s1 = {
    ...common,
    id: 's1',
    type: 'single' as const,
    text: 'Яка найбільша планета Сонячної системи?',
    points: 100,
    options: [{ id: 's1-a', text: 'Юпітер' }, { id: 's1-b', text: 'Сатурн' }, { id: 's1-c', text: 'Марс' }],
    correctId: 's1-a',
  };
  const s2 = { ...common, id: 's2', type: 'boolean' as const, text: 'Бджола — комаха', points: 200, correct: true };
  const s3 = {
    ...common,
    id: 's3',
    type: 'single' as const,
    text: 'Скільки континентів на Землі?',
    points: 500,
    options: [{ id: 's3-a', text: '7' }, { id: 's3-b', text: '5' }, { id: 's3-c', text: '6' }],
    correctId: 's3-a',
  };
  const s4 = { ...common, id: 's4', type: 'boolean' as const, text: 'Сонце — зірка', points: 100, correct: true };
  return { s1, s2, s3, s4 };
}

async function stats11f() {
  const host = await open('host11f', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host11f@example.com');

  const { s1, s2, s3, s4 } = statsQuestions11f();
  const options = { speedBonus: false, shuffleOptions: false, rules: { ...DEFAULT_RULES, penalty: 'minus' as const } };
  const data = {
    ...makeRoundsQuiz(
      [
        classicRound('r1', [s1, s2] as never, { ...options, title: 'Розминка' }),
        classicRound('r2', [s3] as never, { ...options, title: 'Ривок' }),
        classicRound('r3', [s4] as never, { ...options, title: 'Фініш' }),
      ],
      { leaderboard: 'each' },
    ),
    title: 'Статистика 11f',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Статистика 11f' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage11f', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya11f', 375, 812);
  await register(olya, 'menu', 'Оля Гравець', 'olya11f@example.com');
  const vira = await open('vira11f', 375, 812);
  const petro = await open('petro11f', 375, 812);
  const marko = await open('marko11f', 375, 812);
  const olyaFrames = socketFrames(olya);
  await join(olya, code, 'Оля', false);
  await join(vira, code, 'Віра', false);
  await join(petro, code, 'Петро', false);
  await join(marko, code, 'Марко', false);
  await stage.getByText('Марко').waitFor();
  const phones = [olya, vira, petro, marko];
  const all = [host, stage, ...phones];

  /** Відповіді гравців; запитання закривається само, коли відповіли всі. */
  const answer = async (picks: [Page, string][]) => {
    for (const [page, option] of picks) await pickOption(page, option);
    await host.getByText('Запитання закрите').waitFor();
  };
  const yes = '(^|\\s)Так$';
  const no = '(^|\\s)Ні$';
  const sheet = olya.locator('.table-sheet');
  const openSheet = async () => {
    await olya.getByRole('button', { name: 'Таблиця', ...exact }).click();
    await sheet.getByRole('heading', { name: 'Таблиця', ...exact }).waitFor();
  };
  const closeSheet = async () => {
    await olya.keyboard.press('Escape');
    await sheet.waitFor({ state: 'detached' });
  };
  const gains = () => stage.locator('.round-gain').allTextContents();

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);

  // 1. Раунд 1: s1 — Петро помиляється; s2 — помиляються Оля й Марко.
  await stage.getByText('Яка найбільша планета Сонячної системи?', exact).waitFor();
  await answer([[olya, 'Юпітер'], [vira, 'Юпітер'], [marko, 'Юпітер'], [petro, 'Сатурн']]);
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await click(host, 'Наступне запитання');
  await afterSplash(...all);
  await stage.getByText('Бджола — комаха', exact).waitFor();
  await answer([[olya, no], [marko, no], [vira, yes], [petro, yes]]);
  await click(host, 'Показати відповідь');

  // 2. Ведучий дає Олі +50 на розкритті s2.
  const olyaRow = host.locator('.player-row', { hasText: 'Оля' });
  await olyaRow.getByRole('button', { name: 'Бали', ...exact }).click();
  await olyaRow.locator('.player-tools').waitFor();
  await olyaRow.getByLabel('Своя сума', exact).fill('50');
  await olyaRow.getByRole('button', { name: 'Нарахувати', ...exact }).click();
  await expect.poll(async () => (await olyaRow.locator('.score').textContent())?.trim(), POLL).toBe('−50');

  // 3. Підсумки раунду 1 на сцені: «+N за раунд», найкращий — Віра, ривка немає.
  await click(host, 'Далі');
  await expect.poll(gains, POLL).toEqual(['+300 за раунд', '+100 за раунд', '−50 за раунд', '−100 за раунд']);
  expect(await stage.locator('.round-best').textContent()).toBe('Найкращий у раунді: Віра · +300');
  expect(await stage.locator('.round-climb').count()).toBe(0);
  await expectStageInView(stage, 'p11f-stage-round1');
  await shot(stage, 'p11f-stage-round1');

  // 4. Аркуш «Таблиця» на телефоні під час запитання раунду 2: колонки раундів і своя розбивка.
  await click(host, 'Наступний раунд');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);
  await olya.getByText('Скільки континентів на Землі?', exact).waitFor();
  await openSheet();
  expect(await sheet.locator('thead th').allTextContents()).toEqual(['#', 'Учасник', 'Р1', 'Р2', 'Σ']);
  expect(await scoreCells(sheet, 'Оля')).toEqual(['−50', '0', '−50']);
  expect(await scoreCells(sheet, 'Віра')).toEqual(['300', '0', '300']);
  const toggle = sheet.locator('button.score-row-toggle');
  expect(await toggle.count()).toBe(1);
  await toggle.click();
  await sheet.locator('.score-breakdown').waitFor();
  expect(await sheet.isVisible(), 'the own breakdown closed the sheet').toBe(true);
  expect(await breakdownTexts(sheet)).toEqual(['Відповіді +100', 'Помилки −200', 'Ведучий +50']);
  expect(await sheet.locator('.score-breakdown-sum').textContent()).toBe('Плюс 150 · мінус 200');
  await expectNoSideScroll(olya, 'p11f-phone-table');
  await shot(olya, 'p11f-phone-table');
  await closeSheet();

  // 5. Бали s3 сховані до розкриття — і в аркуші, і в сокетних кадрах.
  await answer([[olya, '(^|\\s)7$'], [vira, '(^|\\s)7$'], [petro, '(^|\\s)5$'], [marko, '(^|\\s)5$']]);
  await openSheet();
  expect(await scoreCells(sheet, 'Оля'), 's3 points before the reveal').toEqual(['−50', '0', '−50']);
  await closeSheet();
  const lockedAt = olyaFrames.length;
  await click(host, 'Показати відповідь');
  await olya.locator('section.result').first().waitFor();
  for (const frame of olyaFrames.slice(0, lockedAt)) expect(frame, 'Оля got the s3 round column before the reveal').not.toContain('"rounds":[-50,500]');
  await openSheet();
  await expect.poll(() => scoreCells(sheet, 'Оля'), POLL).toEqual(['−50', '500', '450']);
  await closeSheet();

  // 6. Підсумки раунду 2: двоє найкращих і ривок Олі.
  await click(host, 'Далі');
  await expect.poll(gains, POLL).toEqual(['+500 за раунд', '+500 за раунд', '−500 за раунд', '−500 за раунд']);
  expect(await stage.locator('.round-best').textContent()).toBe('Найкращі в раунді: Віра, Оля · +500');
  expect(await stage.locator('.round-climb').textContent()).toBe('Найбільший ривок: Оля · +1 місце');
  await expectStageInView(stage, 'p11f-stage-round2');
  await shot(stage, 'p11f-stage-round2');

  // 7. Пульт: згорнута панель «Бали за раундами» відкриває будь-кого.
  const panel = host.locator('details.host-scores');
  expect(await panel.locator('tr.score-row').count(), 'the folded panel renders rows').toBe(0);
  await panel.locator('summary').click();
  await panel.locator('tr.score-row').first().waitFor();
  expect(await scoreCells(panel, 'Петро')).toEqual(['100', '−500', '−400']);
  await panel.locator('button.score-row-toggle', { hasText: 'Петро' }).click();
  await panel.locator('.score-breakdown').waitFor();
  expect(await breakdownTexts(panel)).toEqual(['Відповіді +200', 'Помилки −600']);
  await shot(host, 'p11f-host-scores');
  await panel.locator('summary').click();
  await expect.poll(() => panel.locator('tr.score-row').count(), POLL).toBe(0);

  // 8. Раунд 3: усі праві; подіум на сцені як раніше, без «+N за раунд».
  await click(host, 'Наступний раунд');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await afterSplash(...all);
  await stage.getByText('Сонце — зірка', exact).waitFor();
  await answer(phones.map((page) => [page, yes] as [Page, string]));
  await click(host, 'Показати відповідь');
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  const first = (await stage.locator('.standings li').first().textContent())!;
  expect(first).toContain('Віра');
  expect(first).toContain('900');
  expect(await stage.locator('.round-gain').count()).toBe(0);

  // 9. Таємність у кадрах: сцена без розбивок, телефон — лише своя.
  expect(stageFrames.length).toBeGreaterThan(0);
  for (const frame of stageFrames) {
    expect(MY_BREAKDOWN.test(frame), 'the stage got a breakdown').toBe(false);
    expect(ALL_BREAKDOWNS.test(frame), 'the stage got the host breakdowns').toBe(false);
  }
  expect(olyaFrames.some((frame) => MY_BREAKDOWN.test(frame)), 'Оля never got her breakdown').toBe(true);
  for (const frame of olyaFrames) {
    expect(ALL_BREAKDOWNS.test(frame), 'Оля got the host breakdowns').toBe(false);
    expect(frame, 'Оля got Віра’s breakdown').not.toContain('"plus":900');
  }

  // 10. Історія: учасник × раунд з «+ / −».
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Статистика 11f/ }).click();
  const section = host.locator('section.history-scores');
  await section.getByRole('heading', { name: 'Бали за раундами', ...exact }).waitFor();
  expect(await section.locator('thead th.round').allTextContents()).toEqual(['Р1', 'Р2', 'Р3']);
  expect(await scoreCells(section, 'Оля')).toEqual(['−50', '500', '100', '550']);
  expect(await scoreCells(section, 'Віра')).toEqual(['300', '500', '100', '900']);
  await section.locator('button.score-row-toggle', { hasText: 'Оля' }).click();
  await section.locator('.score-breakdown').waitFor();
  expect(await breakdownTexts(section)).toEqual(['Відповіді +700', 'Помилки −200', 'Ведучий +50']);
  await shot(host, 'p11f-history');

  // 11. Профіль Олі: друге місце, у трійці, найкращий рахунок, середнє місце; публічний профіль — те саме.
  await olya.goto(`${base}/profile/stats`);
  await olya.getByRole('heading', { level: 1, name: 'Статистика', exact: true }).waitFor();
  expect(await stat(olya, '2-е місце').textContent()).toBe('12-е місце');
  expect(await stat(olya, '1-е місце').textContent()).toBe('01-е місце');
  expect(await stat(olya, 'у трійці').textContent()).toBe('100%у трійці');
  expect(await stat(olya, 'найкращий рахунок').textContent()).toBe('550найкращий рахунок');
  expect(await stat(olya, 'середнє місце').textContent()).toBe('2середнє місце');
  expect(await stat(olya, 'гра').textContent()).toBe('1гра');
  expect(await stat(olya, 'перемог').textContent()).toBe('0перемог');
  await expectNoSideScroll(olya, 'p11f-profile');
  await shot(olya, 'p11f-profile');
  const olyaId = await myId(olya);
  await host.goto(`${base}/profile/${olyaId}`);
  await stat(host, '2-е місце').waitFor();
  expect(await stat(host, '2-е місце').textContent()).toBe('12-е місце');
  expect(await stat(host, 'середнє місце').textContent()).toBe('2середнє місце');

  expect(problems).toEqual([]);
}

it('part 11f: the 1280 × 720 stage round end fits eight long nicknames (six rows and «…і ще 2») with «+N за раунд», a five- and a three-way best of the round and the biggest climb', async () => {
  const sockets: Socket[] = [];
  try {
    await longRoundEnds11f(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
});

async function longRoundEnds11f(sockets: Socket[]) {
  const host = await open('host11f-long', 1280, 900);
  await register(host, 'host', 'Марта Довга', 'host11f-long@example.com');
  const common = { imageUrl: null, video: null, timeLimit: 20 };
  const q1 = { ...common, id: 'l1', type: 'boolean' as const, text: 'Дніпро впадає в Чорне море', points: 100, correct: true };
  const q2 = { ...common, id: 'l2', type: 'boolean' as const, text: 'Київ — столиця України', points: 500, correct: true };
  // Третій раунд лише для того, щоб після другого йшли підсумки раунду, а не подіум.
  const q3 = { ...common, id: 'l3', type: 'boolean' as const, text: 'Говерла — найвища гора України', points: 100, correct: true };
  const options = { speedBonus: false, shuffleOptions: false };
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [q1] as never, { ...options, title: 'Перший' }), classicRound('r2', [q2] as never, { ...options, title: 'Другий' }), classicRound('r3', [q3] as never, { ...options, title: 'Третій' })], { leaderboard: 'each' }),
    title: 'Довгі імена 11f',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Довгі імена 11f' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage11f-long', 1280, 720);
  await stage.goto(stageUrl);

  // Перші п'ятеро беруть раунд 1 (п'ятеро найкращих), останні троє — раунд 2 (троє найкращих і ривок).
  const names = ['Анастасія Мельник', 'Святослав Ткаченко', 'Ярослава Кравченко', 'Станіслав Олійник', 'Мирослава Петренко', 'Олександра Коваленко', 'Христина Бондаренко', 'Володимир Шевченко'];
  const players: Awaited<ReturnType<typeof socketPlayer>>[] = [];
  for (const name of names) players.push(await socketPlayer(sockets, code, name));
  await stage.getByText(names[7]).waitFor();
  const play = async (text: string, right: (index: number) => boolean) => {
    await stage.getByText(text, exact).waitFor();
    for (const [index, player] of players.entries()) await player.answer(right(index));
    await host.getByText('Запитання закрите').waitFor();
    await click(host, 'Показати відповідь');
    await click(host, 'Далі');
    // З рядком найкращих сцена показує 7 рядків, щоб не прокручуватись: 6 гравців і «…і ще 2» замість мовчки обрізаних місць.
    await expect.poll(() => stage.locator('.round-gain').count(), POLL).toBe(6);
    expect(await stage.locator('.standings-more').textContent()).toBe('…і ще 2');
  };

  await click(host, 'Почати гру');
  await afterSplash(host, stage);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage);
  await play('Дніпро впадає в Чорне море', (index) => index < 5);
  expect(await stage.locator('.round-best').textContent()).toBe(`Найкращі в раунді: ${names.slice(0, 5).join(', ')} · +100`);
  await expectStageInView(stage, 'p11f-stage-long-round1');
  await shot(stage, 'p11f-stage-long-round1');

  await click(host, 'Наступний раунд');
  await afterSplash(host, stage);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage);
  await play('Київ — столиця України', (index) => index >= 5);
  expect(await stage.locator('.round-best').textContent()).toBe(`Найкращі в раунді: ${names.slice(5).join(', ')} · +500`);
  expect(await stage.locator('.round-climb').textContent()).toMatch(/^Найбільший ривок: /);
  await expectStageInView(stage, 'p11f-stage-long-round2');
  await shot(stage, 'p11f-stage-long-round2');

  expect(problems).toEqual([]);
}

it('part 11i: the 1280 × 720 stage leaderboard and podium fit eight long nicknames, twelve in two columns and twenty as fifteen rows with «…і ще 5»', async () => {
  const sockets: Socket[] = [];
  try {
    for (const count of [8, 12, 20]) await longBoards11i(sockets, count);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
});

async function longBoards11i(sockets: Socket[], count: number) {
  const host = await open(`host11i-long${count}`, 1280, 900);
  await register(host, 'host', 'Марта Довга', `host11i-long${count}@example.com`);
  const common = { imageUrl: null, video: null, timeLimit: 20 };
  const q1 = { ...common, id: 'b1', type: 'boolean' as const, text: 'Дніпро впадає в Чорне море', points: 2000, correct: true };
  const q2 = { ...common, id: 'b2', type: 'boolean' as const, text: 'Київ — столиця України', points: 2000, correct: true };
  const options = { speedBonus: false, shuffleOptions: false };
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [q1, q2] as never, { ...options, title: 'Єдиний' })], { leaderboard: 'each' }),
    title: `Довгі імена 11i ${count}`,
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: `Довгі імена 11i ${count}` }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open(`stage11i-long${count}`, 1280, 720);
  await stage.goto(stageUrl);

  // Двадцять знаків — найдовший дозволений нікнейм; рахунки — тисячі.
  const names = ['Анастасія Мельниченк', 'Святослав Ткаченко-Ол', 'Ярослава Кравченко-Ш', 'Станіслав Олійник-Бо', 'Мирослава Петренко-Л', 'Олександра Коваленко', 'Христина Бондаренко-', 'Володимир Шевченко-К'].map((name) => name.slice(0, 20));
  // Перший — найширший нікнейм із «Ш»: у двох стовпчиках він не вміщається й має завершитись трикрапкою.
  const wide = 'Ш'.repeat(20);
  const roster = [wide, ...names.slice(1), ...Array.from({ length: Math.max(0, count - names.length) }, (_, i) => `Гравець ${i + 9} Мельниченко`.slice(0, 20))].slice(0, count);
  const players: Awaited<ReturnType<typeof socketPlayer>>[] = [];
  for (const name of roster) players.push(await socketPlayer(sockets, code, name));
  await stage.getByText(roster[count - 1]).waitFor();
  const shown = Math.min(count, 16);
  const fits = async (name: string) => {
    await expectStageInView(stage, name);
    const overflow = (await stage.evaluate(`({ doc: document.documentElement.scrollHeight, body: document.body.scrollHeight, main: document.querySelector('main.stage').scrollHeight, mainBox: document.querySelector('main.stage').getBoundingClientRect().bottom })`)) as { doc: number; body: number; main: number; mainBox: number };
    expect(overflow.doc, `${name}: document`).toBeLessThanOrEqual(720);
    expect(overflow.body, `${name}: body`).toBeLessThanOrEqual(720);
    expect(overflow.main, `${name}: main container`).toBeLessThanOrEqual(720);
    expect(overflow.mainBox, `${name}: main container bottom`).toBeLessThanOrEqual(720);
    if (count > 8) {
      const cut = (await stage.evaluate(`[...document.querySelectorAll('.standings .name')].filter((el) => el.scrollWidth > el.clientWidth).length`)) as number;
      expect(cut, `${name}: the wide nickname is cut with an ellipsis`).toBeGreaterThan(0);
    }
    if (count > 16) expect(await stage.locator('.standings-more').textContent(), name).toBe(`…і ще ${count - 15}`);
    await shot(stage, name);
  };
  const play = async (text: string) => {
    await stage.getByText(text, exact).waitFor();
    for (const player of players) await player.answer(true);
    await host.getByText('Запитання закрите').waitFor();
    await click(host, 'Показати відповідь');
  };

  await click(host, 'Почати гру');
  await afterSplash(host, stage);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage);
  await play('Дніпро впадає в Чорне море');
  await click(host, 'Далі');
  await stage.getByRole('heading', { name: 'Рейтинг', ...exact }).waitFor();
  await expect.poll(() => stage.locator('.standings li').count(), POLL).toBe(shown);
  await fits(`p11i-stage-leaderboard-${count}`);

  await click(host, 'Наступне запитання');
  await afterSplash(host, stage);
  await play('Київ — столиця України');
  await click(host, 'Завершити гру');
  await afterSplash(host, stage);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await expect.poll(() => stage.locator('.standings li').count(), POLL).toBe(shown);
  await fits(`p11i-stage-podium-${count}`);

  expect(problems).toEqual([]);
}
