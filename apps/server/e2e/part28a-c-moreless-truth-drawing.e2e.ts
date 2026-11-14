import { boardRound, classicRound, makeRoundsQuiz, single, withId, withPoints } from '@quiz/engine/testing';
import { LIMITS, quizSchema } from '@quiz/shared';
import { type Locator, type Page } from 'playwright-core';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import ar from '../../web/src/locales/ar.json';
import es from '../../web/src/locales/es.json';
import { ukMessages } from '../../web/src/i18n';
import { open, click, liveRow, field, questionText, join, openRoundSettings, bodyText, expectNoSideScroll, register, POLL, socketFrames, RESTARTING_TEXT, NL, pickTeamOn, stageTeam, sleep, pilotPlayer, frame, emitOk, stateViews, type Dict22a, label, ownDir, join22a, step27a, next27a, phoneScore27a, select27b, toWinners27c, type Pair28a, PAIRS28A_TEAM, moreLess28a, morelessCounter28a, morelessRun28a, reveal28a, writeFact28b, hostAuthor28b, pickName28b } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, shot, restart, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 28a–28c: більше чи менше, правда про гравця, малюнок.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 28a: more or less — own pace, a miss does not stop the row, out of time, no spoilers on the stage, values on reveal, a team answerer, a board cell, 320 px', async () => {
  const sockets: Socket[] = [];
  try {
    await moreLessGame28a();
    await moreLessTeams28a(sockets);
    await moreLessBoard28a();
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

/** Набір плану: правильні варіанти перемішані; другий варіант Б — довгий, щоб на 320 px він переносився. */
const PAIRS28A: Pair28a[] = [
  ['Що вище?', 'Говерла', '2061 м', 'Ейфелева вежа', '330 м', 'a', 100],
  ['Що довше?', 'Рейн', '1233 км', 'Дунай, що тече через десять країн', '2850 км', 'b', 100],
  ['Що глибше?', 'Світязь', '58 м', 'Синевир', '22 м', 'a', 100],
  ['Хто важчий?', 'Бегемот', '1500 кг', 'Африканський слон', '6000 кг', 'b', 100],
  ['Чого більше?', 'Клавіш у фортепіано', '88', 'Кісток у дорослої людини', '206', 'b', 100],
  ['Що старше?', 'Софійський собор', '1037', 'Собор Паризької Богоматері', '1163', 'a', 200],
];

/** Друге запитання на 25 с. */
const PAIRS28A_Q2: Pair28a[] = [
  ['Що довше?', 'Дніпро', '2201 км', 'Дністер', '1362 км', 'a', 100],
  ['Чого більше?', 'Клітинок на шаховій дошці', '64', 'Днів у високосному році', '366', 'b', 100],
  ['Хто швидший?', 'Гепард', '110 км/год', 'Людина', '44 км/год', 'a', 100],
  ['Що старше?', 'Львівський університет', '1661', 'Гарвардський університет', '1636', 'b', 100],
];

/** 20 порівнянь — найбільший ряд: таблиця розкриття на сцені 1600 × 900 у два стовпці. */
const PAIRS28A_20: Pair28a[] = [
  ...PAIRS28A.map(([prompt, a, va, b, vb, correct]): Pair28a => [prompt, a, va, b, vb, correct, 50]),
  ...PAIRS28A_Q2.map(([prompt, a, va, b, vb, correct]): Pair28a => [prompt, a, va, b, vb, correct, 50]),
  ...PAIRS28A_TEAM.map(([prompt, a, va, b, vb, correct]): Pair28a => [prompt, a, va, b, vb, correct, 50]),
  ['Що вище?', 'Київська телевежа', '385 м', 'Монумент «Батьківщина-мати»', '102 м', 'a', 50],
  ['Що довше?', 'Південний Буг', '806 км', 'Десна', '1130 км', 'b', 50],
  ['Що вище?', 'Бурдж-Халіфа', '828 м', 'Емпайр-стейт-білдінг', '443 м', 'a', 50],
  ['Кого більше на полі?', 'Гравців футбольної команди', '11', 'Гравців волейбольної команди на майданчику', '6', 'a', 50],
  ['Хто важчий?', 'Зубр', '900 кг', 'Лось', '500 кг', 'a', 50],
  ['Що старше?', 'Ейфелева вежа', '1889', 'Статуя Свободи', '1886', 'b', 50],
  ['Чого більше?', 'Струн у класичній гітарі', '6', 'Струн у бандури', 'до 65', 'b', 50],
];
/** Рядок гравця (чи команди) на табло «Більше чи менше». */
const morelessRow28a = (page: Page, nickname: string) => page.locator('.moreless-board li', { has: page.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) });

/** Сцена 1600 × 900: без прокрутки вниз і вбік, жоден текст таблиці й рядків не обрізано. */
async function expectMoreLessStageFits28a(stage: Page, name: string) {
  const [height, clientH, width, clientW] = (await stage.evaluate(
    '[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]',
  )) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const clipped = await stage
    .locator('.moreless-reveal .moreless-row-prompt, .moreless-reveal .moreless-side-text, .moreless-reveal .moreless-side-value, .moreless-reveal .moreless-row-count, .moreless-board .name')
    .evaluateAll((all) => all.filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map((el) => el.textContent));
  expect(clipped, `${name}: clipped texts`).toEqual([]);
  // Таблиця й рядки гравців — у межах вікна.
  const out = await stage
    .locator('.moreless-reveal > li, .moreless-board li')
    .evaluateAll((all) => all.filter((el) => { const box = el.getBoundingClientRect(); return box.bottom > innerHeight + 1 || box.right > innerWidth + 1 || box.left < -1; }).map((el) => el.textContent));
  expect(out, `${name}: rows outside the stage`).toEqual([]);
}

/** Заповнює порівняння index (з 1) у редакторі. */
async function fillPair28a(host: Page, index: number, [prompt, a, va, b, vb, correct, points]: Pair28a) {
  const group = host.getByRole('group', { name: `Порівняння ${index}`, ...exact });
  await group.getByLabel('Запитання порівняння', exact).fill(prompt);
  await group.getByLabel('Варіант А', exact).fill(a);
  await group.getByLabel('Значення', exact).nth(0).fill(va);
  await group.getByLabel('Варіант Б', exact).fill(b);
  await group.getByLabel('Значення', exact).nth(1).fill(vb);
  await group.getByLabel('Правильний варіант', exact).nth(correct === 'a' ? 0 : 1).check();
  await group.getByLabel('Бали', exact).fill(String(points));
}

async function moreLessGame28a() {
  // ── Редактор: класичний раунд, два запитання — 6 порівнянь на 60 с і 4 на 25 с. ──
  const host = await open('host28a', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host28a@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Більше чи менше 28a');
  await click(host, 'більше чи менше');
  await questionText(host).fill('Порівняйте пари');
  expect(await host.getByLabel('Відео з YouTube', exact).count(), 'more or less has no video').toBe(0);
  expect(await host.getByRole('group', { name: /^Порівняння \d+$/ }).count(), 'three blank comparisons').toBe(3);
  await host.getByText('Разом: 300', exact).waitFor();
  for (let i = 3; i < PAIRS28A.length; i++) await click(host, '+ Порівняння');
  for (const [at, pair] of PAIRS28A.entries()) await fillPair28a(host, at + 1, at === PAIRS28A.length - 1 ? [...pair.slice(0, 6), 100] as Pair28a : pair);
  await host.getByText('Разом: 600', exact).waitFor();
  // Останнє порівняння — 200: сума оновлюється сама.
  await host.getByRole('group', { name: 'Порівняння 6', ...exact }).getByLabel('Бали', exact).fill('200');
  await host.getByText('Разом: 700', exact).waitFor();
  await field(host, 'Час, с').fill('60');
  // Однакові варіанти пари — проблема при збереженні.
  const second = host.getByRole('group', { name: 'Порівняння 2', ...exact });
  await second.getByLabel('Варіант Б', exact).fill('рейн');
  await click(host, 'Зберегти');
  await host.getByText('Запитання 1: два варіанти одного порівняння однакові.', exact).first().waitFor();
  await second.getByLabel('Варіант Б', exact).fill(PAIRS28A[1]![3]);
  await shot(host, 'moreless28a-editor');

  await click(host, 'Додати запитання');
  await click(host, 'більше чи менше');
  await questionText(host).fill('Ще чотири пари');
  await click(host, '+ Порівняння');
  for (const [at, pair] of PAIRS28A_Q2.entries()) await fillPair28a(host, at + 1, pair);
  await host.getByText('Разом: 400', exact).waitFor();
  await field(host, 'Час, с').fill('25');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Більше чи менше 28a' }).waitFor();
  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Більше чи менше 28a')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { type: string; questions: Record<string, unknown>[] }[] };
  expect(stored.rounds[0]!.type).toBe('classic');
  const [q1, q2] = stored.rounds[0]!.questions as { type: string; points: number; timeLimit: number; pairs: { prompt: string; a: { text: string; value: string }; b: { text: string; value: string }; correct: string; points: number }[] }[];
  expect(q1).toMatchObject({ type: 'moreless', points: 700, timeLimit: 60 });
  expect(q1!.pairs.map((pair) => [pair.prompt, pair.a.text, pair.a.value, pair.b.text, pair.b.value, pair.correct, pair.points])).toEqual(PAIRS28A);
  expect(q2).toMatchObject({ type: 'moreless', points: 400, timeLimit: 25 });
  expect(q2!.pairs.map((pair) => pair.correct)).toEqual(['a', 'b', 'a', 'b']);

  // ── Гра: сцена 1600 × 900; Оля 375 × 812, Тарас 360 × 740, Хосе 320 × 640 (es). ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage28a', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya28a', 375, 812);
  const taras = await open('taras28a', 360, 740);
  const tarasFrames = socketFrames(taras);
  const jose = await open('jose28a', 320, 640, { locale: 'es-ES' });
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join22a(jose, es, code, 'Хосе');
  await stage.getByText('Хосе').waitFor();
  const phones = [olya, taras, jose];
  const scores = async (wanted: [string, string, string]) => {
    for (const [at, page] of phones.entries()) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(wanted[at]);
  };
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await page.locator('button.moreless-option').first().waitFor();

  // ── Запитання 1: власний темп; помилка (друге порівняння) ряду не зупиняє. ──
  expect(await morelessCounter28a(olya)).toBe('1 / 6');
  await shot(olya, 'moreless28a-phone-pick');
  await morelessRun28a(olya, PAIRS28A, ['a', 'a', 'a', 'b', 'b', 'a']);
  await olya.getByText('Готово! Чекаємо на відкриття', exact).waitFor();
  expect(await olya.locator('button.moreless-option').count(), 'buttons after the whole row').toBe(0);
  await shot(olya, 'moreless28a-phone-done');
  // Тарас: два вибори й чекає — у нього «3 / 6», а в Олі вже «Готово».
  await morelessRun28a(taras, PAIRS28A, ['a', 'b']);
  expect(await morelessCounter28a(taras)).toBe('3 / 6');
  expect(await morelessCounter28a(olya), 'Olya has no counter when done').toBeNull();
  // Подвійний дотик Хосе відповідає лише за одне порівняння.
  await jose.locator('button.moreless-option').first().dblclick();
  await expect.poll(() => morelessCounter28a(jose), POLL).toBe('2 / 6');
  await jose.waitForTimeout(600);
  expect(await morelessCounter28a(jose), 'a double tap answered two comparisons').toBe('2 / 6');
  // 320 px: кнопки в межах екрана, довгий варіант переноситься, а не ріже.
  const joseButtons = await jose.locator('button.moreless-option').evaluateAll((all) =>
    all.map((el) => { const box = el.getBoundingClientRect(); return { left: box.left, right: box.right, height: box.height, clipped: el.scrollWidth > el.clientWidth + 1, text: el.textContent }; }),
  );
  for (const button of joseButtons) {
    expect(button.left, `«${button.text}» starts off screen`).toBeGreaterThanOrEqual(0);
    expect(button.right, `«${button.text}» ends off screen`).toBeLessThanOrEqual(320);
    expect(button.height, `«${button.text}» is a tap target`).toBeGreaterThanOrEqual(44);
    expect(button.clipped, `«${button.text}» clipped`).toBe(false);
  }
  await expectNoSideScroll(jose, 'moreless28a-phone-es-320');
  await expectNoSideScroll(taras, 'moreless28a-phone-360');

  // Сцена: лише скільки пройшов кожен; ні значень, ні правильних, ні балів.
  for (const [name, done] of [['Оля', '6 / 6'], ['Тарас', '2 / 6'], ['Хосе', '1 / 6']] as const) {
    await expect.poll(() => morelessRow28a(stage, name).locator('.tag').first().textContent(), POLL).toBe(done);
  }
  expect(await stage.locator('.moreless-right-of, .moreless-board .score, .moreless-reveal').count(), 'right counts or points on the stage before the reveal').toBe(0);
  const stageHtml = await stage.content();
  for (const [label, seen] of [['stage DOM', stageHtml], ['stage frames', stageFrames.join(NL)], ['Taras frames', tarasFrames.join(NL)]] as const) {
    for (const hidden of ['2061 м', '330 м', '"correct"', '6000 кг', '"206"']) expect(seen, `«${hidden}» in the ${label} before the reveal`).not.toContain(hidden);
  }
  await shot(stage, 'moreless28a-stage-question');

  // Пульт (з «Відповідями наживо»): значення, правильні й вибори кожного.
  await host.locator('#live-answers').waitFor();
  await expect.poll(() => liveRow(host, 'Оля').innerText(), POLL).toContain('6 / 6 · правильно 5');
  await expect.poll(() => liveRow(host, 'Тарас').innerText(), POLL).toContain('2 / 6 · правильно 2');
  await host.locator('.host-moreless').getByText('2061 м', exact).waitFor();
  await host.locator('.host-moreless').getByText('2850 км', exact).waitFor();
  expect(await morelessRow28a(host, 'Оля').locator('.moreless-pick').count(), 'Olya’s picks on the host').toBe(6);
  expect(await morelessRow28a(host, 'Оля').locator('.moreless-pick.is-wrong').count(), 'Olya’s miss on the host').toBe(1);
  // «Відповіли» — ті, хто пройшов увесь ряд: на пульті так само, як на сцені; рядка «Правильна відповідь: —» немає.
  await expect.poll(() => host.locator('.live-jump').textContent(), POLL).toBe('Відповіли 1 з 3');
  expect(await host.locator('.live-count').textContent(), 'the live panel count').toBe('Відповіли 1 з 3');
  await expect.poll(() => stage.getByText('Відповіли 1 з 3', exact).count(), POLL).toBe(1);
  expect(await host.getByText(/Правильна відповідь/).count(), 'an empty right answer line on the host').toBe(0);
  await shot(host, 'moreless28a-host-live');

  // Ведучий закриває раніше часу: «Запитання закрито», а не «Час вийшов».
  await click(host, 'Закрити запитання');
  await taras.getByText('Запитання закрито: пройдено 2 з 6', exact).waitFor();
  await jose.getByText('Pregunta cerrada: 1 de 6 hechas', exact).waitFor();
  expect(await taras.getByText(/Час вийшов/).count(), 'time up after the host closed').toBe(0);

  // ── Розкриття: таблиця зі значеннями, правильний підсвічено, «Правильно: N»; бали. ──
  await reveal28a(host);
  for (const [name, points] of [['Оля', '+600'], ['Тарас', '+200'], ['Хосе', '+100']] as const) {
    await expect.poll(() => morelessRow28a(stage, name).locator('.score').textContent(), POLL).toBe(points);
  }
  expect(await morelessRow28a(stage, 'Оля').locator('.moreless-right-of').textContent()).toBe('правильно 5 з 6');
  const table = stage.locator('.moreless-reveal > li');
  expect(await table.count()).toBe(6);
  for (const value of ['2061 м', '330 м', '2850 км', '1163']) await stage.locator('.moreless-reveal').getByText(value, exact).waitFor();
  expect(await table.nth(0).locator('.moreless-right .moreless-side-text').textContent(), 'the right side of pair 1').toBe('Говерла');
  expect(await table.nth(1).locator('.moreless-right .moreless-side-text').textContent(), 'the right side of pair 2').toBe(PAIRS28A[1]![3]);
  expect(await table.locator('.moreless-row-count').allTextContents()).toEqual(['Правильно: 3', 'Правильно: 1', 'Правильно: 1', 'Правильно: 1', 'Правильно: 1', 'Правильно: 1']);
  await scores(['600', '200', '100']);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'moreless28a-stage-reveal');
  await expectMoreLessStageFits28a(stage, 'q1 reveal');
  // Телефони: свої позначки — у Тараса чотири «без відповіді».
  await taras.locator('.moreless-reveal').waitFor();
  expect(await taras.locator('.moreless-mark').allTextContents()).toEqual(['правильно', 'правильно', 'без відповіді', 'без відповіді', 'без відповіді', 'без відповіді']);
  expect(await olya.locator('.moreless-mark.is-wrong').count(), 'Olya’s miss').toBe(1);
  expect(await olya.locator('.result > h2').textContent(), 'Olya with one miss').toBe('Частково правильно');
  await shot(taras, 'moreless28a-phone-reveal');
  await shot(olya, 'moreless28a-phone-reveal-olya');
  await expectNoSideScroll(jose, 'moreless28a-phone-es-reveal');

  // ── Запитання 2: Тарас не встигає — 1 вибір і 25 с очікування. ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  await expect.poll(() => morelessCounter28a(olya), POLL).toBe('1 / 4');
  await morelessRun28a(olya, PAIRS28A_Q2, ['a', 'b', 'a', 'b']);
  await olya.getByText('Готово! Чекаємо на відкриття', exact).waitFor();
  await expect.poll(() => morelessCounter28a(taras), POLL).toBe('1 / 4');
  await morelessRun28a(taras, PAIRS28A_Q2, ['a']);
  await taras.getByText('Час вийшов: пройдено 1 з 4', exact).waitFor({ timeout: 40_000 });
  for (const button of await taras.locator('button.moreless-option').all()) expect(await button.getAttribute('aria-disabled'), 'a button after the time').toBe('true');
  await shot(taras, 'moreless28a-phone-late');
  await reveal28a(host);
  await expect.poll(() => morelessRow28a(stage, 'Тарас').locator('.score').textContent(), POLL).toBe('+100');
  expect(await morelessRow28a(stage, 'Оля').locator('.score').textContent()).toBe('+400');
  expect(await morelessRow28a(stage, 'Хосе').locator('.score').textContent(), 'Jose without picks').toBe('0');
  await scores(['1000', '300', '100']);

  // ── Історія гри: «Правильно: 5 з 6» в Олі. ──
  await toWinners27c(host, stage);
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Більше чи менше 28a/ }).click();
  const first = host.locator('.rows.stacked > li', { hasText: 'Порівняйте пари' });
  await first.getByText(/Відповіді \(\d+\)/).click();
  await first.locator('.responses li', { hasText: 'Оля' }).getByText('Правильно: 5 з 6', exact).waitFor();
  await first.locator('.responses li', { hasText: 'Тарас' }).getByText('Правильно: 2 з 6', exact).waitFor();
  await shot(host, 'moreless28a-history');

  expect(problems).toEqual([]);
}

async function moreLessTeams28a(sockets: Socket[]) {
  const host = await open('host28at', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host28at@example.com');
  const round = classicRound('rt28a', [moreLess28a('mt1', 'Командні пари', PAIRS28A_TEAM, 60), moreLess28a('mt2', 'Двадцять пар', PAIRS28A_20, 90)] as never, { title: 'Команди 28a', speedBonus: false });
  const data = { ...makeRoundsQuiz([round], { leaderboard: 'each', teams: { count: 2, names: ['Червоні', 'Сині'] } }), title: 'Команди 28a' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Команди 28a' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage28at', 1600, 900);
  await stage.goto(stageUrl);
  const olya = await open('olya28at', 375, 812);
  const petro = await open('petro28at', 375, 812);
  // Іра — капітан Синіх арабською: порядок кнопок як у редакторі.
  const ira = await open('ira28at', 375, 812, { locale: 'ar-EG' });
  const marko = await open('marko28at', 320, 640);
  const markoFrames = socketFrames(marko);
  const phones = [olya, petro, ira, marko];
  for (const [page, nickname, team] of [
    [olya, 'Оля', 'Червоні'],
    [petro, 'Петро', 'Червоні'],
    [ira, 'Іра', 'Сині'],
    [marko, 'Марко', 'Сині'],
  ] as const) {
    if (page === ira) await join22a(page, ar, code, nickname);
    else await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
  }
  // Богдан (сокет) — ще один у Червоних: його вибір сервер відхиляє, бо відповідає капітан.
  const bohdan = await pilotPlayer(sockets, code, 'Богдан');
  const lobby = await frame(bohdan, (v) => (v.teams?.teams.length ?? 0) === 2);
  const redId = lobby.view.teams!.teams.find((team) => team.name === 'Червоні')!.id;
  await emitOk(bohdan, 'player:team', { teamId: redId });
  await expect.poll(() => stageTeam(stage, 'Червоні'), POLL).toEqual(['Оля', 'Петро', 'Богдан']);
  await expect.poll(() => stageTeam(stage, 'Сині'), POLL).toEqual(['Іра', 'Марко']);
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await olya.locator('button.moreless-option').first().waitFor();
  await ira.locator('button.moreless-option').first().waitFor();

  // Капітан Червоних проходить ряд; товариш бачить поступ без кнопок.
  await morelessRun28a(olya, PAIRS28A_TEAM, ['a', 'b']);
  await petro.getByText('Відповідає Оля: 2 / 3', exact).waitFor();
  expect(await petro.locator('button.moreless-option').count(), 'buttons for a teammate').toBe(0);
  await shot(petro, 'moreless28a-team-watch');
  const refused = await bohdan.emit('player:moreless', { index: 2, pick: 'b' });
  expect(refused, 'a pick from a teammate').toEqual({ ok: false, error: 'not_captain' });
  await morelessRun28a(olya, PAIRS28A_TEAM, ['b'], 2);
  await petro.getByText('Відповідає Оля: 3 / 3', exact).waitFor();
  // Сині: капітан — один вибір.
  expect(await ownDir(ira.locator('.moreless-options'))).toBe('rtl');
  expect(await ira.locator('button.moreless-option').allTextContents(), 'the editor order in Arabic').toEqual([PAIRS28A_TEAM[0]![1], PAIRS28A_TEAM[0]![3]]);
  await shot(ira, 'moreless28a-phone-ar');
  await morelessRun28a(ira, PAIRS28A_TEAM, ['a']);
  await marko.locator('.moreless-team-watch').waitFor();
  await expect.poll(() => morelessRow28a(stage, 'Червоні').locator('.tag').first().textContent(), POLL).toBe('3 / 3');
  await expect.poll(() => morelessRow28a(stage, 'Сині').locator('.tag').first().textContent(), POLL).toBe('1 / 3');
  for (const hidden of ['"1440"', '"3600"', '"8 кг"', '"correct"']) expect(markoFrames.join(NL), `«${hidden}» sent to Marko before the reveal`).not.toContain(hidden);

  await reveal28a(host);
  await expect.poll(() => morelessRow28a(stage, 'Червоні').locator('.score').textContent(), POLL).toBe('+300');
  expect(await morelessRow28a(stage, 'Сині').locator('.score').textContent()).toBe('+100');
  // Бали команди спільні: у кожного учасника на телефоні той самий рахунок.
  for (const [page, score] of [[olya, '300'], [petro, '300'], [ira, '100'], [marko, '100']] as const) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(score);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'moreless28a-team-stage-reveal');
  await expectMoreLessStageFits28a(stage, 'team reveal');
  await shot(ira, 'moreless28a-phone-ar-reveal');

  // ── 20 порівнянь: таблиця розкриття на 1600 × 900 у два стовпці, нічого не обрізано. ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  await expect.poll(() => morelessCounter28a(olya), POLL).toBe('1 / 20');
  await morelessRun28a(olya, PAIRS28A_20, ['a', 'b', 'a', 'b']);
  await expectNoSideScroll(marko, 'moreless28a-team-watch-320');
  await reveal28a(host);
  await expect.poll(() => stage.locator('.moreless-reveal > li').count(), POLL).toBe(20);
  await expect.poll(() => morelessRow28a(stage, 'Червоні').locator('.score').textContent(), POLL).toBe('+200');
  expect(await stage.locator('.moreless-reveal.is-two').count(), 'two columns for 20 comparisons').toBe(1);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'moreless28a-stage-reveal-20');
  await expectMoreLessStageFits28a(stage, '20 comparisons');
  await expectNoSideScroll(marko, 'moreless28a-phone-320-reveal-20');

  expect(problems).toEqual([]);
}

async function moreLessBoard28a() {
  const host = await open('host28ab', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host28ab@example.com');
  const plain = (id: string, text: string, points: number) => ({ ...withPoints(withId(single, id), points), text, timeLimit: 30 });
  const cellOlya = moreLess28a('mb1', 'Пари для Олі', PAIRS28A_TEAM, 60);
  const cellTaras = moreLess28a('mb2', 'Пари для Тараса', PAIRS28A_Q2.slice(0, 2), 25);
  const round = boardRound(
    'rb28a',
    [
      { title: 'Порівняння', cells: [{ question: cellOlya as never, mark: 'x2' }, cellTaras as never, plain('b13', 'Порівняння за 400?', 400)] },
      { title: 'Міста', cells: [plain('b21', 'Місто за 100?', 100), plain('b22', 'Місто за 200?', 200), plain('b23', 'Місто за 300?', 300)] },
      { title: 'Річки', cells: [plain('b31', 'Річка за 100?', 100), plain('b32', 'Річка за 200?', 200), plain('b33', 'Річка за 300?', 300)] },
    ],
    { title: 'Поле 28a' },
  );
  const data = { ...makeRoundsQuiz([round], { leaderboard: 'end' }), title: 'Поле 28a' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Поле 28a' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage28ab', 1600, 900);
  await stage.goto(stageUrl);
  const olya = await open('olya28ab', 375, 812);
  const taras = await open('taras28ab', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await stage.getByText('Тарас').waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage, olya, taras);
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, olya, taras);

  // Оля вибирає клітинку ×2 і проходить ряд — одразу розкриття, бали ×2.
  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await olya.getByRole('button', { name: 'Порівняння, 300', ...exact }).click();
  await olya.locator('button.moreless-option').first().waitFor();
  // Глядач клітинки (29i) бачить, хто вибирає, поточну пару й вибрані тексти — без правильності.
  await expect.poll(() => taras.locator('.moreless-watch-chooser').textContent(), POLL).toBe('Вибирає Оля');
  expect(await taras.locator('button.moreless-option').count(), 'buttons for a viewer of the cell').toBe(0);
  expect(await taras.locator('.moreless-watch-picks li').count(), 'no picks yet').toBe(0);
  await morelessRun28a(olya, PAIRS28A_TEAM, ['a', 'b']);
  await expect.poll(() => taras.locator('.moreless-watch-picks li').count(), POLL).toBe(2);
  await expect.poll(() => stage.locator('.moreless-watch-picks li').count(), POLL).toBe(2);
  expect(await stage.locator('.moreless-watch-chooser').textContent()).toBe('Вибирає Оля');
  expect(await morelessRow28a(stage, 'Тарас').count(), 'a row for a viewer of the cell').toBe(0);
  expect(await stage.locator('.moreless-watch').textContent(), 'no marks before the reveal').not.toMatch(/[✓✗]/);
  await shot(taras, 'moreless28a-board-cell');
  await morelessRun28a(olya, PAIRS28A_TEAM, ['b'], 2);
  await expect.poll(() => morelessRow28a(stage, 'Оля').locator('.score').textContent(), POLL).toBe('+600');
  await stage.locator('.moreless-reveal').waitFor();
  await expect.poll(() => phoneScore27a(olya).textContent(), POLL).toBe('600');
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'moreless28a-board-stage-reveal');
  await expectMoreLessStageFits28a(stage, 'board reveal');

  // Друга клітинка: Тарас вибирає й мовчить до кінця часу — запис 0, рахунок не зменшився.
  await step27a(host, 'Далі');
  const next = host.getByRole('button', { name: 'Наступне запитання', ...exact });
  if (await next.waitFor({ timeout: 3000 }).then(() => true, () => false)) await next.click();
  await taras.getByText('Ваш хід: виберіть клітинку').waitFor();
  await taras.getByRole('button', { name: 'Порівняння, 200', ...exact }).click();
  await taras.locator('button.moreless-option').first().waitFor();
  await taras.getByText('Час вийшов: пройдено 0 з 2', exact).waitFor({ timeout: 40_000 });
  await reveal28a(host);
  await expect.poll(() => morelessRow28a(stage, 'Тарас').locator('.score').textContent(), POLL).toBe('0');
  expect(await morelessRow28a(stage, 'Тарас').locator('.moreless-right-of').textContent()).toBe('правильно 0 з 2');
  await expect.poll(() => phoneScore27a(taras).textContent(), POLL).toBe('0');
  expect(await phoneScore27a(olya).textContent()).toBe('600');

  expect(problems).toEqual([]);
}

it('part 28b: player truth — facts in the lobby, the host hiding one, guessing names, the author sitting out, the author’s share, an empty round skipped', async () => {
  try {
    await truthGame28b();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 28b: player truth in teams — every member writes, captains guess, the author’s team waits and takes the share', async () => {
  try {
    await truthTeams28b();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 28b: player truth with 22 players — the stage question and reveal fit 1600×900', async () => {
  const sockets: Socket[] = [];
  try {
    await truthCrowd28b(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

/** 22 гравці без браузера (сокети): один пише факт, решта вгадують; сцена 1600×900 вміщає 22 імена й 21 рядок розкриття. */
async function truthCrowd28b(sockets: Socket[]) {
  const host = await open('host28bc', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host28bc@example.com');
  const round = { id: 'tr28bc', type: 'truth', title: '', points: 300, timeLimit: 60 };
  const data = { ...makeRoundsQuiz([round as never], { leaderboard: 'end' }), title: 'Правда натовпу 28b' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Правда натовпу 28b' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage28bc', 1600, 900);
  await stage.goto(stageUrl);
  // Довгі імена — до межі в 20 символів: так рядки розкриття найширші.
  const names = [
    'Олександра Петренко', 'Богдана Коваленко', 'Ярослав Шевченко', 'Мирослава Бондар', 'Владислав Ткаченко', 'Анастасія Мельник',
    'Святослав Кравчук', 'Христина Олійник', 'Станіслав Лисенко', 'Катерина Руденко', 'Остап Марченко', 'Соломія Савченко',
    'Тарас Гончаренко', 'Ірина Кузьменко', 'Максим Литвиненко', 'Вероніка Захарчук', 'Назар Поліщук', 'Злата Тимошенко',
    'Дмитро Павленко', 'Олена Кириленко', 'Роман Мороз', 'Оксана Бойко',
  ];
  const players: { nickname: string; socket: Socket; id: string }[] = [];
  for (const nickname of names) {
    const response = await fetch(`${base}/api/games/by-code/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname }) });
    expect(response.status, nickname).toBe(201);
    const { token, playerId } = (await response.json()) as { token: string; playerId: string };
    const socket = connectSocket(base, { auth: { code, role: 'player', token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((done, fail) => {
      socket.once('connect', () => done());
      socket.once('connect_error', fail);
    });
    players.push({ nickname, socket, id: playerId });
  }
  const emit = <T,>(socket: Socket, event: string, payload: unknown) => new Promise<T>((done) => socket.emit(event, payload, done));
  const [author, ...guessers] = players;
  expect(await emit<{ ok: boolean }>(author!.socket, 'player:truth', { text: 'Я тричі перепливла Дніпро біля Києва' }), 'the fact').toEqual({ ok: true });
  await stage.getByText('Фактів: 1', exact).waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage);
  await stage.locator('.truth-stage .truth-who').waitFor();
  await expect.poll(() => stage.locator('.truth-stage-names li').count(), POLL).toBe(22);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'truth28b-stage-question-22');
  await expectTruthStageFits28b(stage, 'question with 22 players');
  // Половина вгадує, половина — ні, один мовчить.
  for (const [at, guesser] of guessers.entries()) {
    if (at === guessers.length - 1) break;
    const optionId = at % 2 === 0 ? author!.id : guessers[(at + 1) % guessers.length]!.id;
    expect(await emit<{ ok: boolean }>(guesser.socket, 'player:answer', { type: 'single', optionId }), `${guesser.nickname} picks`).toEqual({ ok: true });
  }
  await reveal28a(host);
  await stage.locator('.truth-reveal').getByText(`Це написав(ла) ${author!.nickname}`, exact).waitFor();
  await expect.poll(() => stage.locator('.truth-pick-row').count(), POLL).toBe(21);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'truth28b-stage-reveal-22');
  await expectTruthStageFits28b(stage, 'reveal with 22 players');
}

const es28b = es as Record<string, string>;

/** Рядок факту людини на пульті. */
const hostFact28b = (host: Page, nickname: string) => host.locator('.truth-host .truth-fact', { has: host.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) });

/** Імена на сцені (дрібно) чи на телефоні (кнопки або список для читання). */
const stageNames28b = (stage: Page) => stage.locator('.truth-stage-names li').allTextContents();
const phoneNames28b = (page: Page) => page.locator('.truth-names .truth-name').allTextContents();

/** Кадри від позиції from без ознак автора: ні own: true, ні correctId, ні authorId / actorId. */
function expectNoAuthorIn28b(frames: string[], from: number, label: string) {
  const seen = frames.slice(from).join(NL);
  for (const hidden of ['"own":true', '"correctId"', '"authorId"', '"actorId"']) expect(seen, `«${hidden}» sent to ${label} before the reveal`).not.toContain(hidden);
}

/** Останній зріз гравця з кадрів сокета. */
const lastView28b = (frames: string[]) => stateViews(frames).at(-1)!;

/** Сцена 1600 × 900: без прокрутки, факт, імена й розкриття в межах вікна. */
async function expectTruthStageFits28b(stage: Page, name: string) {
  const [height, clientH, width, clientW] = (await stage.evaluate(
    '[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]',
  )) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const out = await stage
    .locator('.truth-stage h1, .truth-stage-names li, .truth-reveal p, .truth-pick-row')
    .evaluateAll((all) => all.filter((el) => { const box = el.getBoundingClientRect(); return box.bottom > innerHeight + 1 || box.right > innerWidth + 1 || box.left < -1; }).map((el) => el.textContent));
  expect(out, `${name}: texts outside the stage`).toEqual([]);
}

const FACTS28B = {
  olya: 'Я стрибала з парашутом',
  taras: 'Я вмію жонглювати п’ятьма м’ячами',
  tarasNew: 'Я вивчив іспанську за рік',
  iraFirst: 'Я бачила полярне сяйво',
  ira: 'Я їла сарану',
};

async function truthGame28b() {
  // ── Редактор: класика «один варіант» за 100 і раунд «Правда про гравця» — ціна 300, час 30. ──
  const host = await open('host28b', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host28b@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Правда 28b');
  await host.locator('details.rules').first().locator('summary').click();
  await select27b(host, 'Показувати рейтинг', 'end');
  await openRoundSettings(host);
  await field(host, 'Бали за швидкість: швидша правильна відповідь дає більше').setChecked(false);
  await questionText(host).fill('Яка планета найбільша?');
  await field(host, 'Варіант 1').fill('Сатурн');
  await field(host, 'Варіант 2').fill('Юпітер');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Бали').fill('100');
  await click(host, '+ Раунд');
  await click(host, 'Правда про гравця');
  await openRoundSettings(host);
  await field(host, 'Ціна запитання').fill('300');
  await field(host, 'Час на запитання, с').fill('30');
  await host.locator('.truth-editor-note').getByText(ukMessages.truthEditorNote, exact).waitFor();
  expect(await host.getByRole('button', { name: 'Додати запитання', ...exact }).count(), 'a question list in a truth round').toBe(0);
  expect(await questionText(host).count(), 'a question text in a truth round').toBe(0);
  await shot(host, 'truth28b-editor');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Правда 28b' }).waitFor();
  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Правда 28b')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: Record<string, unknown>[] };
  expect(stored.rounds[1]).toMatchObject({ type: 'truth', points: 300, timeLimit: 30 });
  expect(stored.rounds[1], 'a truth round has no questions').not.toHaveProperty('questions');

  // ── Гра: сцена 1600 × 900; Оля 375 × 812, Тарас 360 × 740, Іра 360 × 740, Хосе 320 × 640 (es). ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage28b', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya28b', 375, 812);
  const taras = await open('taras28b', 360, 740);
  const ira = await open('ira28b', 360, 740);
  const jose = await open('jose28b', 320, 640, { locale: 'es-ES' });
  const frames = new Map<Page, string[]>([olya, taras, ira, jose].map((page) => [page, socketFrames(page)]));
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(ira, code, 'Іра', false);
  await join22a(jose, es, code, 'Хосе');
  await stage.getByText('Хосе').waitFor();
  const phones = [olya, taras, ira, jose];
  const named = new Map<string, Page>([['Оля', olya], ['Тарас', taras], ['Іра', ira], ['Хосе', jose]]);
  const nameOf = (page: Page) => [...named].find(([, p]) => p === page)![0];

  // ── Лобі: факти. ──
  await field(olya, 'Ваш маловідомий факт').waitFor();
  await olya.getByText('Фактів: 0', exact).waitFor();
  await stage.getByText('Фактів: 0', exact).waitFor();
  await host.locator('.truth-host').getByText('Ще ніхто не написав факт', exact).waitFor();
  await writeFact28b(olya, FACTS28B.olya);
  await writeFact28b(taras, FACTS28B.taras);
  await writeFact28b(ira, FACTS28B.iraFirst);
  await writeFact28b(ira, FACTS28B.ira);
  await stage.getByText('Фактів: 3', exact).waitFor();
  // Хосе: понад 200 символів — лічильник зупиняється на 200; він зберігає, потім стирає й лишається без факту.
  const long = 'Una vez crucé a nado un lago helado en pleno invierno con mis amigos del barrio. '.repeat(4);
  expect(long.length).toBeGreaterThan(LIMITS.truthText);
  await field(jose, es28b.truthFactLabel!).fill(long);
  await expect.poll(() => jose.locator('.truth-count').textContent(), POLL).toBe('200 / 200');
  expect((await field(jose, es28b.truthFactLabel!).inputValue()).length, 'the fact field takes more than 200').toBe(LIMITS.truthText);
  await expectNoSideScroll(jose, 'truth28b-phone-fact-es-320');
  await click(jose, es28b.truthFactSave!);
  await jose.locator('.truth-saved').waitFor();
  await stage.getByText('Фактів: 4', exact).waitFor();
  await writeFact28b(jose, '', es28b);
  await expect.poll(() => jose.locator('.truth-count').textContent(), POLL).toBe('0 / 200');
  await stage.getByText('Фактів: 3', exact).waitFor();
  await olya.getByText('Фактів: 3', exact).waitFor();
  await expectNoSideScroll(taras, 'truth28b-phone-fact-360');
  await shot(olya, 'truth28b-phone-fact');
  // Сцена й інші телефони — лише число: ні чужих фактів, ні хто написав.
  for (const [label, page, list] of [['stage', stage, stageFrames], ['Оля', olya, frames.get(olya)!]] as const) {
    const html = await page.content();
    expect(html, `${label}: a foreign fact in the lobby`).not.toContain('жонглювати');
    expect(html, `${label}: a foreign fact in the lobby`).not.toContain('сарану');
    expect(list.join(NL), `${label}: a foreign fact sent in the lobby`).not.toContain('жонглювати');
  }
  expect(await bodyText(stage), 'the stage DOM in the lobby').not.toContain(FACTS28B.olya);
  // Пульт: три факти з іменами.
  await expect.poll(() => host.locator('.truth-host .truth-fact').count(), POLL).toBe(3);
  for (const [name, text] of [['Оля', FACTS28B.olya], ['Тарас', FACTS28B.taras], ['Іра', FACTS28B.ira]] as const) {
    expect(await hostFact28b(host, name).locator('.truth-fact-text').textContent(), `${name}’s fact on the host`).toBe(text);
  }
  // Ведучий ховає факт Тараса: Тарас бачить позначку й пише інший — на пульті знову видно, з «новий текст».
  await hostFact28b(host, 'Тарас').getByRole('button', { name: 'Сховати', ...exact }).click();
  await hostFact28b(host, 'Тарас').getByText('сховано', exact).waitFor();
  await taras.locator('.truth-hidden').getByText('Ведучий сховав ваш факт — напишіть інший.', exact).waitFor();
  await stage.getByText('Фактів: 2', exact).waitFor();
  await shot(taras, 'truth28b-phone-hidden');
  await expectNoSideScroll(taras, 'truth28b-phone-hidden-360');
  await field(taras, 'Ваш маловідомий факт').fill(FACTS28B.tarasNew);
  await click(taras, 'Зберегти');
  await expect.poll(() => taras.locator('.truth-saved').textContent(), POLL).toBe(`Ваш факт: «${FACTS28B.tarasNew}»`);
  expect(await taras.locator('.truth-hidden').count(), 'the hidden mark after a new text').toBe(0);
  await expect.poll(() => hostFact28b(host, 'Тарас').locator('.truth-fact-text').textContent(), POLL).toBe(FACTS28B.tarasNew);
  await hostFact28b(host, 'Тарас').getByText('новий текст', exact).waitFor();
  expect(await hostFact28b(host, 'Тарас').getByText('сховано', exact).count(), 'a new text is hidden').toBe(0);
  // Факт Іри — сховано остаточно.
  await hostFact28b(host, 'Іра').getByRole('button', { name: 'Сховати', ...exact }).click();
  await hostFact28b(host, 'Іра').getByText('сховано', exact).waitFor();
  await hostFact28b(host, 'Іра').getByRole('button', { name: 'Показати', ...exact }).waitFor();
  await host.locator('.truth-host').getByText('Фактів: 2', exact).waitFor();
  await stage.getByText('Фактів: 2', exact).waitFor();
  await shot(host, 'truth28b-host-facts');
  await shot(stage, 'truth28b-stage-lobby');
  expect(await bodyText(stage), 'the stage DOM after the rewrite').not.toContain(FACTS28B.tarasNew);

  // ── Класика: Оля й Тарас правильно (по 100). ──
  const scores = async (wanted: [string, string, string, string]) => {
    for (const [at, page] of phones.entries()) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(wanted[at]);
  };
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  expect(await field(olya, 'Ваш маловідомий факт').count(), 'the fact form after the start').toBe(0);
  await olya.getByRole('button', { name: /Юпітер/ }).click();
  await taras.getByRole('button', { name: /Юпітер/ }).click();
  await ira.getByRole('button', { name: /Сатурн/ }).click();
  await jose.getByRole('button', { name: /Сатурн/ }).click();
  await reveal28a(host);
  await scores(['100', '100', '0', '0']);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  // Заставка раунду truth: число фактів і час раунду, а не «0 запитань · без таймера».
  await stage.locator('.round-facts').getByText('2 запитання · 30 с на кожне', exact).waitFor();
  await host.locator('.round-facts').getByText('2 запитання · 30 с на кожне', exact).waitFor();
  await step27a(host, 'Почати раунд');

  // ── Раунд «Правда про гравця»: два запитання (Оля, Тарас — порядок з rng кімнати). ──
  const facts: Record<string, string> = { Оля: FACTS28B.olya, Тарас: FACTS28B.tarasNew };
  const seenAuthors: string[] = [];
  for (let k = 0; k < 2; k++) {
    if (k > 0) await next27a(host);
    await afterSplash(host, stage, ...phones);
    await stage.locator('.truth-stage .truth-who').getByText('Хто це написав?', exact).waitFor();
    const author = await hostAuthor28b(host);
    expect(['Оля', 'Тарас'], `the author of question ${k + 1}`).toContain(author);
    expect(seenAuthors, 'a fact asked twice').not.toContain(author);
    seenAuthors.push(author);
    const authorPage = named.get(author)!;
    const others = phones.filter((page) => page !== authorPage);
    const from = new Map<Page, number>([[stage, stageFrames.length], ...phones.map((page): [Page, number] => [page, frames.get(page)!.length])]);
    // Сцена: «Хто це написав?», факт, «Факт k з 2», чотири імена за абеткою.
    await expect.poll(() => stage.locator('.truth-stage h1').textContent(), POLL).toBe(facts[author]);
    await stage.getByText(`Факт ${k + 1} з 2`, exact).waitFor();
    expect(await stageNames28b(stage)).toEqual(['Іра', 'Оля', 'Тарас', 'Хосе']);
    // Автор: «Це ваш факт — вгадують інші.» без кнопок.
    await authorPage.locator('.truth-own').getByText('Це ваш факт — вгадують інші.', exact).waitFor();
    expect(await authorPage.locator('button.truth-name').count(), 'name buttons for the author').toBe(0);
    // Лічильник запитань на телефоні — з колоди, а не з вікторини (де запитань раунду немає).
    expect(await bodyText(authorPage), 'the question counter on the phone').toMatch(new RegExp(`Запитання ${k + 1} з 2`));
    // Решта: ті самі імена кнопками, що й на сцені; жодної ознаки автора.
    for (const page of others) {
      await expect.poll(() => page.locator('button.truth-name').count(), POLL).toBe(4);
      expect(await phoneNames28b(page), `names on ${nameOf(page)}’s phone`).toEqual(['Іра', 'Оля', 'Тарас', 'Хосе']);
      expect(await page.locator('.truth-own').count(), `the author notice on ${nameOf(page)}’s phone`).toBe(0);
      const html = await page.content();
      expect(html, `the author notice in ${nameOf(page)}’s DOM`).not.toContain('Це ваш факт');
      expect(html, `the author notice in ${nameOf(page)}’s DOM`).not.toContain(es28b.truthOwn!);
    }
    const stageHtml = await stage.content();
    for (const hidden of ['Це ваш факт', 'Автор:', 'truth-own', 'truth-host-author', 'is-correct', 'is-picked']) expect(stageHtml, `«${hidden}» on the stage during the question`).not.toContain(hidden);
    // Ведучий бачить автора.
    expect(await hostAuthor28b(host)).toBe(author);
    if (k === 0) {
      await shot(stage, 'truth28b-stage-question');
      await expectTruthStageFits28b(stage, 'question');
      await shot(authorPage, 'truth28b-phone-own');
      await shot(host, 'truth28b-host-question');
      await jose.getByText(es28b.truthWho!, exact).waitFor();
      await expectNoSideScroll(jose, 'truth28b-phone-pick-es-320');
      await expectNoSideScroll(ira, 'truth28b-phone-pick-360');
    }
    // Вибір: про Олю — Тарас вгадує, Іра — ні, Хосе мовчить; про Тараса — не вгадує ніхто.
    if (author === 'Оля') {
      await pickName28b(taras, 'Оля');
      await pickName28b(ira, 'Хосе');
      await stage.getByText('Відповіли 2 з 3', exact).waitFor();
    } else {
      await pickName28b(olya, 'Іра');
      await pickName28b(ira, 'Оля');
      await pickName28b(jose, 'Оля');
    }
    // До розкриття ні сцена, ні ті, хто вгадує, ознак автора не отримали; автор свій знак має.
    expectNoAuthorIn28b(stageFrames, from.get(stage)!, 'the stage');
    for (const page of others) expectNoAuthorIn28b(frames.get(page)!, from.get(page)!, nameOf(page));
    expect(lastView28b(frames.get(authorPage)!).me.truth?.own, 'own on the author phone').toBe(true);
    for (const page of others) expect(lastView28b(frames.get(page)!).truth?.reveal ?? null, `a reveal for ${nameOf(page)} before the reveal`).toBeNull();

    await reveal28a(host);
    await stage.locator('.truth-reveal').getByText(`Це написав(ла) ${author}`, exact).waitFor();
    const rows = async () => (await stage.locator('.truth-pick-row').allTextContents()).sort();
    if (author === 'Оля') {
      await stage.locator('.truth-author-points').getByText('Автор: +200', exact).waitFor();
      expect(await rows()).toEqual(['Іра → Хосе ✗', 'Тарас → Оля ✓', 'Хосе — без вибору'].sort());
    } else {
      await stage.locator('.truth-author-points').getByText('Автор: +300', exact).waitFor();
      expect(await rows()).toEqual(['Іра → Оля ✗', 'Оля → Іра ✗', 'Хосе → Оля ✗'].sort());
    }
    await authorPage.locator('.truth-reveal').getByText(`Це написав(ла) ${author}`, exact).waitFor();
    await jose.locator('.truth-reveal').getByText(es28b.truthAuthorIs!.replace('{nickname}', author), exact).waitFor();
    // Пульт: правильна відповідь — ім'я без літери варіанта; телефон автора не повторює «Це написав(ла) …» рядком відповіді.
    await host.getByText(`Правильна відповідь: ${author}`, exact).waitFor();
    for (const page of phones) expect(await bodyText(page), `the right answer line on ${nameOf(page)}’s phone`).not.toContain('Правильна відповідь');
    if (author === 'Оля') {
      if (process.env.E2E_SHOTS === '1') await sleep(800);
      await shot(stage, 'truth28b-stage-reveal');
      await expectTruthStageFits28b(stage, 'reveal');
      await shot(taras, 'truth28b-phone-reveal');
      await expectNoSideScroll(jose, 'truth28b-phone-reveal-es-320');
    }
  }
  // Рахунки: Оля 100 + 200 (частка), Тарас 100 + 300 (вгадав) + 300 (частка), Іра й Хосе — 0.
  await scores(['300', '700', '0', '0']);

  // ── Історія гри. ──
  await toWinners27c(host, stage);
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Правда 28b/ }).click();
  await host.getByText('Запитань зіграно: 3 з 3', exact).waitFor();
  const olyaRow = host.locator('.rows.stacked > li', { hasText: FACTS28B.olya });
  expect(await olyaRow.locator('.truth-history').textContent()).toContain('Факт написав(ла): Оля · автор +200');
  // У списку відповідей автор — окремий рядок з позначкою «автор факту» і часткою; «Відповіді (2)» — лише ті, хто вгадував.
  await olyaRow.locator('.responses summary').click();
  await olyaRow.locator('.truth-author-row').getByText('автор факту', exact).waitFor();
  expect(await olyaRow.locator('.truth-author-row .responses-name').textContent()).toBe('Оля');
  expect(await olyaRow.locator('.truth-author-row .responses-answer').textContent()).toBe('+200');
  expect(await olyaRow.locator('.responses summary').textContent()).toBe('Відповіді (2)');
  const tarasRow = host.locator('.rows.stacked > li', { hasText: FACTS28B.tarasNew });
  expect(await tarasRow.locator('.truth-history').textContent()).toContain('Факт написав(ла): Тарас · автор +300');
  expect(await host.locator('.rows.stacked > li', { hasText: FACTS28B.ira }).count(), 'a hidden fact in the history').toBe(0);
  await shot(host, 'truth28b-history');

  // ── Друга кімната: ніхто не пише факт — раунд пропущено. ──
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Правда 28b' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code2 = host.url().slice(-6);
  const stageUrl2 = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage2 = await open('stage28b2', 1600, 900);
  await stage2.goto(stageUrl2);
  const olya2 = await open('olya28b2', 375, 812);
  const taras2 = await open('taras28b2', 360, 740);
  await join(olya2, code2, 'Оля', false);
  await join(taras2, code2, 'Тарас', false);
  await stage2.getByText('Тарас').waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage2, olya2, taras2);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage2, olya2, taras2);
  await olya2.getByRole('button', { name: /Юпітер/ }).click();
  await taras2.getByRole('button', { name: /Сатурн/ }).click();
  await reveal28a(host);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage2, olya2, taras2);
  const skipped = 'Фактів немає — раунд «Правда про гравця» пропущено.';
  for (const page of [stage2, olya2, taras2]) await page.locator('.truth-skipped').getByText(skipped, exact).waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage2, 'truth28b-stage-skipped');
  await shot(olya2, 'truth28b-phone-skipped');
  // Раунд останній: гра одразу на підсумках, повідомлення — над переможцями.
  await stage2.getByRole('heading', { name: 'Переможці' }).waitFor();
  expect(await host.getByRole('button', { name: 'Наступний раунд', ...exact }).count(), 'a next round after the skipped last round').toBe(0);

  expect(problems).toEqual([]);
}

async function truthTeams28b() {
  const host = await open('host28bt', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host28bt@example.com');
  const round = { id: 'tr28b', type: 'truth', title: 'Хто з нас?', points: 300, timeLimit: 30 };
  const data = { ...makeRoundsQuiz([round as never], { leaderboard: 'end', teams: { count: 2, names: ['Червоні', 'Сині'], answerer: 'chosen' } }), title: 'Правда команд 28b' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Правда команд 28b' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage28bt', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya28bt', 375, 812);
  const petro = await open('petro28bt', 375, 812);
  const ira = await open('ira28bt', 375, 812);
  const marko = await open('marko28bt', 320, 640);
  const phones = [olya, petro, ira, marko];
  const people: [Page, string, string, string][] = [
    [olya, 'Оля', 'Червоні', 'Я двічі бачила дельфінів у Чорному морі'],
    [petro, 'Петро', 'Червоні', 'Я зібрав сто кубиків Рубіка'],
    [ira, 'Іра', 'Сині', 'Я пробігла марафон за чотири години'],
    [marko, 'Марко', 'Сині', 'Я грав на трембіті на весіллі'],
  ];
  for (const [page, nickname, team, fact] of people) {
    await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
    // Кожен учасник пише свій факт.
    await writeFact28b(page, fact);
  }
  await expect.poll(() => stageTeam(stage, 'Червоні'), POLL).toEqual(['Оля', 'Петро']);
  await expect.poll(() => stageTeam(stage, 'Сині'), POLL).toEqual(['Іра', 'Марко']);
  await stage.getByText('Фактів: 4', exact).waitFor();
  await expect.poll(() => host.locator('.truth-host .truth-fact').count(), POLL).toBe(4);
  await expectNoSideScroll(marko, 'truth28b-team-fact-320');
  expect(stageFrames.join(NL), 'a fact sent to the stage in the lobby').not.toContain('дельфінів');

  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');

  const teamOf = new Map(people.map(([, nickname, teamName, fact]) => [nickname, { teamName, fact }]));
  const captainOf = (teamName: string) => (teamName === 'Червоні' ? olya : ira);
  const mateOf = (teamName: string) => (teamName === 'Червоні' ? petro : marko);
  const score: Record<string, number> = { Червоні: 0, Сині: 0 };
  let blueQuestions = 0;
  let shotOwn = false;
  let shotReveal = false;
  for (let k = 0; k < 4; k++) {
    if (k > 0) await next27a(host);
    await afterSplash(host, stage, ...phones);
    await stage.locator('.truth-stage .truth-who').waitFor();
    const author = await hostAuthor28b(host);
    const { teamName, fact } = teamOf.get(author)!;
    const otherTeam = teamName === 'Червоні' ? 'Сині' : 'Червоні';
    await expect.poll(() => stage.locator('.truth-stage h1').textContent(), POLL).toBe(fact);
    // Сцена: рядок відповідачів — обидві команди, команда автора не випадає.
    const line = stage.locator('.truth-stage > .stage-answerers');
    await line.waitFor();
    expect(await line.textContent()).toContain('Червоні — відповідає: Оля');
    expect(await line.textContent()).toContain('Сині — відповідає: Іра');
    expect(await stageNames28b(stage)).toEqual(['Іра', 'Марко', 'Оля', 'Петро']);
    // Команда автора: обоє бачать «Це факт вашої команди…», без кнопок.
    for (const page of [captainOf(teamName), mateOf(teamName)]) {
      await page.locator('.truth-own').getByText('Це факт вашої команди — вгадують інші.', exact).waitFor();
      expect(await page.locator('button.truth-name').count(), 'name buttons in the author’s team').toBe(0);
    }
    // Інша команда: капітан вибирає, товариш бачить імена лише для читання.
    const captain = captainOf(otherTeam);
    const mate = mateOf(otherTeam);
    await expect.poll(() => captain.locator('button.truth-name').count(), POLL).toBe(4);
    await mate.locator('.truth-names.is-readonly').waitFor();
    expect(await mate.locator('button.truth-name').count(), 'name buttons for a teammate').toBe(0);
    expect(await phoneNames28b(mate)).toEqual(['Іра', 'Марко', 'Оля', 'Петро']);
    expect(await mate.content(), 'the author notice for the guessing team').not.toContain('Це факт вашої команди');
    expect(await stage.content(), 'the author notice on the stage').not.toContain('Це факт вашої команди');
    if (teamName === 'Червоні' && !shotOwn) {
      shotOwn = true;
      await shot(captainOf(teamName), 'truth28b-team-own');
      await shot(captain, 'truth28b-team-pick');
      await shot(mate, 'truth28b-team-watch');
      await shot(stage, 'truth28b-team-stage-question');
      await expectNoSideScroll(marko, 'truth28b-team-names-320');
    }
    // Факт Червоних: Сині не вгадують — частка Червоним. Факт Синіх: Червоні вгадують перший, на другому помиляються.
    let right: boolean;
    if (teamName === 'Червоні') {
      await pickName28b(ira, 'Марко');
      right = false;
    } else {
      blueQuestions++;
      right = blueQuestions === 1;
      await pickName28b(olya, right ? author : 'Петро');
    }
    score[right ? otherTeam : teamName]! += 300;
    await reveal28a(host);
    await stage.locator('.truth-reveal').getByText(`Це написав(ла) ${author}`, exact).waitFor();
    await stage.locator('.truth-author-points').getByText(`Автор: ${right ? '0' : '+300'}`, exact).waitFor();
    for (const [page, , teamName2] of people) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(String(score[teamName2]));
    if (teamName === 'Червоні' && !shotReveal) {
      shotReveal = true;
      if (process.env.E2E_SHOTS === '1') await sleep(800);
      await shot(stage, 'truth28b-team-stage-reveal');
      await expectTruthStageFits28b(stage, 'team reveal');
    }
  }
  // Два факти Червоних без вгадування — 600 Червоним; факти Синіх: один вгадали Червоні (+300), другий ні (+300 Синім).
  expect(score).toEqual({ Червоні: 900, Сині: 300 });
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

it('part 28c: drawing — turns, mouse and touch, a typo forgiven, the drawer\'s share, a team, reconnect and restart keep the drawing, no word on the stage', async () => {
  try {
    await drawingEditor28c();
    await drawingGame28c();
    await drawingTeams28c();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

/** Запитання «Малюнок» для API. */
function drawing28c(id: string, text: string, accepted: string[], timeLimit: number, points = 100) {
  return { id, text, imageUrl: null, video: null, timeLimit, points, type: 'drawing' as const, accepted };
}

/** Поверхня малювання художника. */
const surface28c = (page: Page) => page.locator('.drawing-pad .drawing-surface');

/** Художник нічого не має в дорозі: перо підняте, усі пакети підтверджено. */
async function idle28c(page: Page) {
  await expect.poll(() => surface28c(page).getAttribute('data-idle'), POLL).toBe('true');
}

/** Точка шляху (частки 0..1 полотна) у пікселях вікна. */
async function surfaceAt28c(page: Page): Promise<(point: [number, number]) => [number, number]> {
  await surface28c(page).scrollIntoViewIfNeeded();
  const box = (await surface28c(page).boundingBox())!;
  return ([x, y]) => [box.x + x * box.width, box.y + y * box.height];
}

/** Малює мишею по полотну: точки в частках 0..1 полотна. */
async function mouseDraw28c(page: Page, path: [number, number][]) {
  const at = await surfaceAt28c(page);
  const [x0, y0] = at(path[0]!);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (const point of path.slice(1)) {
    const [x, y] = at(point);
    await page.mouse.move(x, y, { steps: 8 });
  }
  await page.mouse.up();
  await idle28c(page);
}

/** Малює дотиком через CDP Input.dispatchTouchEvent (touchStart / touchMove / touchEnd) — Chrome робить з нього pointer-події з pointerType 'touch'. */
async function touchDraw28c(page: Page, path: [number, number][]) {
  await page.evaluate("window.__pointers28c ?? ((window.__pointers28c = []), document.addEventListener('pointerdown', (e) => window.__pointers28c.push(e.pointerType), true))");
  const at = await surfaceAt28c(page);
  const points: [number, number][] = [at(path[0]!)];
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1]!;
    const [bx, by] = path[i]!;
    for (let k = 1; k <= 8; k++) points.push(at([ax + ((bx - ax) * k) / 8, ay + ((by - ay) * k) / 8]));
  }
  const cdp = await page.context().newCDPSession(page);
  const [x0, y0] = points[0]!;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (const [x, y] of points.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await sleep(8);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  expect(await page.evaluate('window.__pointers28c.at(-1) ?? null'), 'the pointer type of a touch').toBe('touch');
  await idle28c(page);
}

/** Стан полотна: data-strokes, data-points і кількість нетлових пікселів (getImageData). */
async function canvasOf28c(scope: Page | Locator): Promise<{ strokes: number; points: number; inked: number }> {
  return scope
    .locator('canvas.drawing-canvas')
    .first()
    .evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let inked = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i]! < 240 || data[i + 1]! < 240 || data[i + 2]! < 240) inked++;
      return { strokes: Number(canvas.dataset.strokes), points: Number(canvas.dataset.points), inked };
    });
}

/** Полотна інших екранів збігаються з полотном художника (штрихи й точки, є фарба); повертає малюнок художника. */
async function sameDrawing28c(drawer: Page, others: (Page | Locator)[]) {
  await idle28c(drawer);
  const mine = await canvasOf28c(drawer.locator('.drawing-pad'));
  for (const other of others) {
    await expect
      .poll(async () => {
        const seen = await canvasOf28c(other);
        return [seen.strokes, seen.points, seen.inked > 0];
      }, POLL)
      .toEqual([mine.strokes, mine.points, mine.strokes > 0]);
  }
  return mine;
}

/** Вгадування з телефона: поле й «Вгадати». */
async function guess28c(page: Page, text: string) {
  await page.locator('.drawing-guess-form input').fill(text);
  await page.locator('.drawing-guess-form button[type="submit"]').click();
}

/** Полотно сцени (до відкриття й на відкритті). */
const stageCanvas28c = (stage: Page) => stage.locator('.drawing-stage');

/** Коло з 16 відрізків, стебло, листок, зигзаг. */
const CIRCLE28C: [number, number][] = Array.from({ length: 17 }, (_, k): [number, number] => [0.5 + 0.18 * Math.cos((k * Math.PI) / 8), 0.35 + 0.22 * Math.sin((k * Math.PI) / 8)]);
const STEM28C: [number, number][] = [[0.5, 0.58], [0.5, 0.9]];
const LEAF28C: [number, number][] = [[0.5, 0.75], [0.62, 0.68], [0.7, 0.72]];
const ZIGZAG28C: [number, number][] = [[0.15, 0.2], [0.3, 0.5], [0.45, 0.2], [0.6, 0.5], [0.75, 0.2]];

/** Сцена 1600 × 900: без прокрутки, полотно 4:3 і цілком у вікні. */
async function expectDrawingStageFits28c(stage: Page, name: string) {
  const [height, clientH, width, clientW] = (await stage.evaluate(
    '[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]',
  )) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const box = (await stage.locator('.drawing-stage canvas.drawing-canvas').boundingBox())!;
  expect(Math.abs(box.width / box.height - 4 / 3), `${name}: the canvas is not 4:3 (${box.width}×${box.height})`).toBeLessThan(0.02);
  expect(box.y + box.height, `${name}: the canvas ends below the stage`).toBeLessThanOrEqual(900 + 1);
  expect(box.x + box.width, `${name}: the canvas ends right of the stage`).toBeLessThanOrEqual(1600 + 1);
  expect(box.width, `${name}: a small canvas on the stage`).toBeGreaterThanOrEqual(480);
  console.log(`drawing 28c: ${name} — the stage canvas ${Math.round(box.width)}×${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)}`);
}

/** Телефон художника на своїй ширині: полотно й інструменти в межах екрана, кнопки — під палець. */
async function expectPadFits28c(page: Page, name: string) {
  const width = page.viewportSize()!.width;
  const boxes = await page.locator('.drawing-pad canvas, .drawing-pad button').evaluateAll((all) =>
    all.map((el) => {
      const box = el.getBoundingClientRect();
      return { left: box.left, right: box.right, height: box.height, button: el.tagName === 'BUTTON', text: el.getAttribute('aria-label') ?? el.textContent };
    }),
  );
  expect(boxes.filter((box) => box.button).length, `${name}: tools`).toBe(14);
  for (const box of boxes) {
    expect(box.left, `${name}: «${box.text}» starts off screen`).toBeGreaterThanOrEqual(0);
    expect(box.right, `${name}: «${box.text}» ends off screen`).toBeLessThanOrEqual(width);
    if (box.button) expect(box.height, `${name}: «${box.text}» is a tap target`).toBeGreaterThanOrEqual(32);
  }
  await expectNoSideScroll(page, name);
}

/** Телефон вгадувача: полотно, поле й «Вгадати» цілком у межах екрана (сторінка ріже зайве, тож прокрутки вбік може й не бути). */
async function expectWatchFits28c(page: Page, name: string) {
  const width = page.viewportSize()!.width;
  const boxes = await page.locator('.drawing-watch .drawing-frame, .drawing-guess-form input, .drawing-guess-form button').evaluateAll((all) =>
    all.map((el) => { const box = el.getBoundingClientRect(); return { left: box.left, right: box.right, text: el.className || el.tagName }; }),
  );
  expect(boxes.length, `${name}: the canvas and the guess field`).toBeGreaterThanOrEqual(1);
  for (const box of boxes) {
    expect(box.left, `${name}: «${box.text}» starts off screen`).toBeGreaterThanOrEqual(0);
    expect(box.right, `${name}: «${box.text}» ends off screen (${box.right} > ${width})`).toBeLessThanOrEqual(width);
  }
  await expectNoSideScroll(page, name);
}

async function drawingEditor28c() {
  // ── Редактор: «малюнок» є лише в класичному раунді — ні на полі, ні в бліці. ──
  const host = await open('host28ce', 1280, 900);
  await register(host, 'host', 'Ліна Ведуча', 'host28ce@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Малюнок 28c редактор');
  const types = host.getByRole('group', { name: 'Тип запитання', ...exact });
  await click(host, 'малюнок');
  await host.getByText(ukMessages.drawingWordHint, exact).waitFor();
  expect(await host.getByLabel('Відео з YouTube', exact).count(), 'a drawing has no video').toBe(0);
  await click(host, '+ Раунд');
  await click(host, 'Ігрове поле');
  await host.getByRole('button', { name: /^Категорія 1, клітинка 1:/ }).click();
  await types.waitFor();
  expect(await types.getByRole('button', { name: 'один варіант', ...exact }).count(), 'the type picker on a board').toBe(1);
  expect(await types.getByRole('button', { name: 'малюнок', ...exact }).count(), 'a drawing offered on a board').toBe(0);
  await click(host, '+ Раунд');
  await click(host, 'Бліц');
  await types.waitFor();
  expect(await types.getByRole('button', { name: 'один варіант', ...exact }).count(), 'the type picker in a blitz').toBe(1);
  expect(await types.getByRole('button', { name: 'малюнок', ...exact }).count(), 'a drawing offered in a blitz').toBe(0);
  // Сервер теж не прийме малюнок поза класикою.
  const cell = (id: string, points: number) => ({ ...withPoints(withId(single, id), points), timeLimit: 30 });
  const board = boardRound('rb28c', [
    { title: 'Природа', cells: [drawing28c('bd1', 'Що це?', ['маяк'], 60) as never, cell('bd2', 200), cell('bd3', 300)] },
    { title: 'Міста', cells: [cell('bd4', 100), cell('bd5', 200), cell('bd6', 300)] },
    { title: 'Річки', cells: [cell('bd7', 100), cell('bd8', 200), cell('bd9', 300)] },
  ]);
  const boardQuiz = { ...makeRoundsQuiz([board]), title: 'Поле 28c' };
  const refused = await host.request.post(`${base}/api/quizzes`, { data: boardQuiz });
  expect(refused.status(), 'a drawing on a board saved').toBe(400);
  // Причина — саме місце малюнка (сервер відповідає лише invalid_payload).
  const issues = quizSchema.safeParse(boardQuiz).error?.issues.map((issue) => issue.message) ?? [];
  expect(issues, 'why the board quiz is refused').toEqual(['drawing_place']);
}

async function drawingGame28c() {
  const host = await open('host28c', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host28c@example.com');
  const plain = { ...withPoints(withId(single, 's28c'), 100), text: 'Яка річка тече через Київ?', timeLimit: 30 };
  const round = classicRound(
    'r28c',
    [
      drawing28c('d1', 'Малюнок перший', ['соняшник'], 60),
      plain,
      // Друге — довше: посеред нього перезавантаження й перезапуск сервера.
      drawing28c('d2', 'Малюнок другий', ['парасолька', 'парасоля'], 90),
      drawing28c('d3', 'Малюнок третій', ['маяк'], 30),
    ] as never,
    { title: 'Малюємо', speedBonus: false, shuffleOptions: false },
  );
  const data = { ...makeRoundsQuiz([round], { leaderboard: 'end' }), title: 'Малюнок 28c' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // ── Гра: сцена 1600 × 900; Оля 375 × 812 (dpr 2), Тарас 360 × 740, Петро — дотиковий телефон, Ганна 320 × 640. ──
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Малюнок 28c' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage28c', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya28c', 375, 812, { deviceScaleFactor: 2 });
  const taras = await open('taras28c', 360, 740);
  const tarasFrames = socketFrames(taras);
  const petro = await open('petro28c', 375, 812, { hasTouch: true, isMobile: true });
  const hanna = await open('hanna28c', 320, 640);
  const hannaFrames = socketFrames(hanna);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(petro, code, 'Петро', false);
  await join(hanna, code, 'Ганна', false);
  await stage.getByText('Ганна').waitFor();
  const scores = async (wanted: [Page, string][]) => {
    for (const [page, score] of wanted) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(score);
  };
  /** Слово не потрапило ні в DOM, ні в кадри сокета. */
  const noWord = async (word: string, watched: [string, Page, string[]][]) => {
    for (const [label, page, frames] of watched) {
      expect(await page.content(), `«${word}» in the ${label} DOM`).not.toContain(word);
      expect(frames.join(NL), `«${word}» sent to the ${label}`).not.toContain(word);
    }
  };
  await click(host, 'Почати гру');
  await afterSplash(host, stage, olya, taras, petro, hanna);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, olya, taras, petro, hanna);

  // ── Запитання 1: малює Оля (перша за порядком приходу); слово — лише в неї й на пульті. ──
  await olya.locator('.drawing-pad .drawing-word strong').getByText('соняшник', exact).waitFor();
  for (const page of [taras, petro, hanna]) await page.locator('.drawing-guess-form input').waitFor();
  await stage.locator('.drawing-stage .drawing-drawer').getByText('Малює: Оля', exact).waitFor();
  await host.locator('.host-drawing .drawing-word-was').getByText('Слово: соняшник', exact).waitFor();
  // Полотно не розмите: на dpr 2 буфер удвічі ширший за CSS-ширину.
  const sharp = await olya.locator('.drawing-pad canvas').evaluate((element) => [(element as HTMLCanvasElement).width, element.clientWidth]);
  expect(sharp[0], `the canvas buffer at dpr 2 (${sharp.join(' / ')})`).toBe(Math.round(sharp[1]! * 2));

  // Коло й стебло мишею; жовтий, «Товста», «Крок назад» (стебла немає), листок.
  await mouseDraw28c(olya, CIRCLE28C);
  await mouseDraw28c(olya, STEM28C);
  await sameDrawing28c(olya, [stageCanvas28c(stage), host.locator('.host-drawing'), taras]);
  await olya.getByRole('button', { name: 'Колір 4', ...exact }).click();
  await olya.getByRole('button', { name: 'Товста', ...exact }).click();
  expect(await olya.getByRole('button', { name: 'Колір 4', ...exact }).getAttribute('aria-pressed')).toBe('true');
  expect(await olya.getByRole('button', { name: 'Товста', ...exact }).getAttribute('aria-pressed')).toBe('true');
  await click(olya, 'Крок назад');
  await expect.poll(() => canvasOf28c(stageCanvas28c(stage)).then((c) => c.strokes), POLL).toBe(1);
  await expect.poll(() => canvasOf28c(taras).then((c) => c.strokes), POLL).toBe(1);
  await mouseDraw28c(olya, LEAF28C);
  const first = await sameDrawing28c(olya, [stageCanvas28c(stage), host.locator('.host-drawing'), taras, petro, hanna]);
  expect(first.strokes, 'strokes after an undo and one more').toBe(2);
  // Жовтий товстий листок справді жовтий на сцені.
  const yellow = await stage.locator('.drawing-stage canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! > 230 && data[i + 1]! > 190 && data[i + 2]! < 100) count++;
    return count;
  });
  expect(yellow, 'yellow pixels of the leaf on the stage').toBeGreaterThan(100);
  await expectPadFits28c(olya, 'drawing-phone-drawer');

  // Слово не потрапило ні на сцену, ні до вгадувачів.
  await noWord('соняшник', [['stage', stage, stageFrames], ['Тарас', taras, tarasFrames], ['Ганна', hanna, hannaFrames]]);
  await expectDrawingStageFits28c(stage, 'question');
  await shot(stage, 'drawing-stage-question');
  await shot(taras, 'drawing-phone-guess');
  await expectWatchFits28c(taras, 'drawing-phone-guess-360');
  await expectWatchFits28c(hanna, 'drawing-phone-guess-320');

  // Тарас — з опискою, і її прощено; Ганна — «ромашка» (ні); Петро — точно.
  await guess28c(taras, 'соняшнк');
  await taras.locator('.drawing-guess.is-done').getByText('Вгадано!', exact).waitFor();
  expect(await taras.locator('.drawing-guess-form').count(), 'the guess field after a right guess').toBe(0);
  await shot(taras, 'drawing-phone-guessed');
  await guess28c(hanna, 'ромашка');
  await expect.poll(() => hanna.locator('.drawing-guess-status').textContent(), POLL).toBe('Ні');
  expect(await hanna.locator('.drawing-guess-form input').inputValue(), 'the field after a miss').toBe('');
  await expect.poll(() => hanna.locator('.drawing-guess-status').textContent(), { timeout: 4000 }).toBe('');
  expect(await hanna.locator('.drawing-guess-form input').isVisible(), 'the field after the miss faded').toBe(true);
  await guess28c(petro, 'соняшник');
  await petro.locator('.drawing-guess.is-done').getByText('Вгадано!', exact).waitFor();
  // Сцена: лише «Вгадали 2 з 3», без імен; пульт — з іменами.
  await expect.poll(() => stage.locator('.drawing-stage .drawing-count').textContent(), POLL).toBe('Вгадали 2 з 3');
  expect(await stage.locator('.drawing-guessers').count(), 'names on the stage before the reveal').toBe(0);
  expect(await stage.locator('.drawing-stage').innerText(), 'a guesser name on the stage').not.toMatch(/Тарас|Петро/);
  await expect.poll(() => host.locator('.host-drawing .drawing-guessers .name').allTextContents(), POLL).toEqual(['Тарас', 'Петро']);
  await shot(host, 'drawing-host');
  await noWord('соняшник', [['stage', stage, stageFrames], ['Тарас', taras, tarasFrames], ['Ганна', hanna, hannaFrames]]);

  // ── Відкриття: слово, малюнок, хто вгадав; Оля — 100 × 2 / 3 = 67. ──
  await reveal28a(host);
  const reveal = stage.locator('.drawing-stage.is-reveal');
  await reveal.locator('.drawing-word-was').getByText('Слово: соняшник', exact).waitFor();
  expect(await reveal.locator('.drawing-guessers .name').allTextContents()).toEqual(['Тарас', 'Петро']);
  expect(await reveal.locator('.drawing-guessers .score').allTextContents()).toEqual(['+100', '+100']);
  expect(await reveal.locator('.drawing-artist').innerText()).toMatch(/Художник: Оля\s*\+67/);
  expect((await canvasOf28c(reveal)).strokes, 'the drawing on the reveal').toBe(2);
  await scores([[olya, '67'], [taras, '100'], [petro, '100'], [hanna, '0']]);
  await taras.locator('.drawing-reveal .drawing-word-was').getByText('Слово: соняшник', exact).waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectDrawingStageFits28c(stage, 'reveal');
  await shot(stage, 'drawing-stage-reveal');
  await shot(taras, 'drawing-phone-reveal');

  // ── Звичайне запитання; Тарас закриває сторінку до наступного малюнка. ──
  await next27a(host);
  await afterSplash(host, stage, olya, petro, hanna);
  await taras.close();
  await reveal28a(host);
  await next27a(host);
  await afterSplash(host, stage, olya, petro, hanna);

  // ── Запитання 2: Тарас поза грою — малює Петро, дотиком. ──
  await petro.locator('.drawing-pad .drawing-word strong').getByText('парасолька', exact).waitFor();
  await stage.locator('.drawing-stage .drawing-drawer').getByText('Малює: Петро', exact).waitFor();
  await expect.poll(() => stage.locator('.drawing-stage .drawing-count').textContent(), POLL).toBe('Вгадали 0 з 2');
  // Полотно попереднього малюнка не лишилося.
  expect((await canvasOf28c(stageCanvas28c(stage))).strokes, 'old strokes on the new drawing').toBe(0);
  await touchDraw28c(petro, ZIGZAG28C);
  await touchDraw28c(petro, STEM28C);
  await sameDrawing28c(petro, [stageCanvas28c(stage), olya, hanna]);
  // «Очистити»: усі полотна білі.
  await click(petro, 'Очистити');
  for (const scope of [stageCanvas28c(stage), olya, hanna, petro.locator('.drawing-pad')]) await expect.poll(() => canvasOf28c(scope), POLL).toEqual({ strokes: 0, points: 0, inked: 0 });
  // Парасолька: купол і ручка.
  await touchDraw28c(petro, [[0.2, 0.5], [0.3, 0.3], [0.5, 0.2], [0.7, 0.3], [0.8, 0.5], [0.2, 0.5]]);
  await touchDraw28c(petro, [[0.5, 0.5], [0.5, 0.85], [0.42, 0.88]]);
  const before = await sameDrawing28c(petro, [stageCanvas28c(stage), olya, hanna, host.locator('.host-drawing')]);
  expect(before.strokes).toBe(2);

  // Петро перезавантажує сторінку: полотно те саме, малює далі.
  await petro.reload();
  await surface28c(petro).waitFor();
  await expect.poll(() => canvasOf28c(petro.locator('.drawing-pad')).then((c) => [c.strokes, c.points, c.inked > 0]), POLL).toEqual([before.strokes, before.points, true]);
  await touchDraw28c(petro, [[0.35, 0.3], [0.38, 0.45]]);
  const afterReload = await sameDrawing28c(petro, [stageCanvas28c(stage), olya, hanna]);
  expect(afterReload.strokes).toBe(3);
  // Сцена перезавантажується: малюнок той самий.
  await stage.reload();
  await stage.locator('.drawing-stage canvas').waitFor();
  await expect.poll(() => canvasOf28c(stageCanvas28c(stage)).then((c) => [c.strokes, c.points, c.inked > 0]), POLL).toEqual([afterReload.strokes, afterReload.points, true]);

  // Перезапуск сервера: після повернення сцена, пульт і телефони мають ті самі штрихи.
  await restart(async () => {
    await stage.getByText(RESTARTING_TEXT, exact).waitFor();
  });
  for (const page of [stage, olya, petro, hanna, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();
  await petro.locator('.drawing-pad:not(.is-off)').waitFor();
  await sameDrawing28c(petro, [stageCanvas28c(stage), olya, hanna, host.locator('.host-drawing')]);
  expect((await canvasOf28c(petro.locator('.drawing-pad'))).points, 'the drawer’s canvas after the restart').toBe(afterReload.points);
  await touchDraw28c(petro, [[0.62, 0.3], [0.65, 0.45]]);
  const afterRestart = await sameDrawing28c(petro, [stageCanvas28c(stage), olya, hanna]);
  expect(afterRestart.strokes).toBe(4);
  await noWord('парасол', [['stage', stage, stageFrames], ['Ганна', hanna, hannaFrames]]);
  // Оля й Ганна вгадують — усі, хто міг (Тарас поза грою), вгадали: запитання закривається саме.
  await guess28c(olya, 'парасолька');
  await olya.locator('.drawing-guess.is-done').waitFor();
  await guess28c(hanna, 'Парасоля');
  await expect.poll(() => stage.locator('.drawing-count').first().textContent(), POLL).toBe('Вгадали 2 з 2');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor({ timeout: 10_000 });
  await reveal28a(host);
  await expect.poll(() => reveal.locator('.drawing-artist').innerText(), POLL).toMatch(/Художник: Петро\s*\+100/);
  expect((await canvasOf28c(reveal)).strokes, 'the drawing on the reveal after the restart').toBe(4);
  await scores([[olya, '167'], [petro, '200'], [hanna, '100']]);

  // ── Запитання 3: далі за колом — Ганна на 320 px. Петро вгадує, Оля — ні: Ганні 100 × 1 / 2. ──
  await next27a(host);
  await afterSplash(host, stage, olya, petro, hanna);
  await hanna.locator('.drawing-pad .drawing-word strong').getByText('маяк', exact).waitFor();
  await mouseDraw28c(hanna, [[0.45, 0.85], [0.48, 0.25], [0.52, 0.25], [0.55, 0.85], [0.45, 0.85]]);
  await mouseDraw28c(hanna, [[0.52, 0.25], [0.85, 0.12]]);
  await sameDrawing28c(hanna, [stageCanvas28c(stage), olya, petro]);
  await expectPadFits28c(hanna, 'drawing-phone-drawer-320');
  const tools = (await hanna.locator('.drawing-tools').boundingBox())!;
  console.log(`drawing 28c: 320 × 640 — the tools end at ${Math.round(tools.y + tools.height)} px`);
  await guess28c(petro, 'маяк');
  await petro.locator('.drawing-guess.is-done').waitFor();
  await reveal28a(host);
  await expect.poll(() => reveal.locator('.drawing-artist').innerText(), POLL).toMatch(/Художник: Ганна\s*\+50/);
  await scores([[olya, '167'], [petro, '300'], [hanna, '150']]);
  await expectNoSideScroll(hanna, 'drawing-phone-reveal-320');

  // ── Історія: малюнок першого запитання й «Оля». ──
  await toWinners27c(host, stage);
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Малюнок 28c/ }).click();
  const row = host.locator('.rows.stacked > li', { hasText: 'Малюнок перший' });
  await row.locator('.history-drawing').getByText('Художник: Оля', exact).waitFor();
  const kept = await canvasOf28c(row.locator('.history-drawing'));
  expect([kept.strokes, kept.points], 'the drawing in the history').toEqual([first.strokes, first.points]);
  expect(kept.inked).toBeGreaterThan(0);
  await host.locator('.rows.stacked > li', { hasText: 'Малюнок другий' }).locator('.history-drawing').getByText('Художник: Петро', exact).waitFor();
  await row.scrollIntoViewIfNeeded();
  await shot(host, 'drawing-history');

  expect(problems).toEqual([]);
}

async function drawingTeams28c() {
  const host = await open('host28ct', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host28ct@example.com');
  const round = classicRound('rt28c', [drawing28c('t1', 'Командний малюнок', ['вишиванка'], 60), drawing28c('t2', 'Ще один малюнок', ['равлик'], 30)] as never, { title: 'Команди малюють', speedBonus: false });
  const data = { ...makeRoundsQuiz([round], { leaderboard: 'end', teams: { count: 2, names: ['Соняшники', 'Маки'] } }), title: 'Малюнок команд 28c' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Малюнок команд 28c' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage28ct', 1600, 900);
  await stage.goto(stageUrl);
  const olya = await open('olya28ct', 375, 812);
  const taras = await open('taras28ct', 360, 740);
  const tarasFrames = socketFrames(taras);
  // Петро — арабською.
  const petro = await open('petro28ct', 375, 812, { locale: 'ar-EG' });
  const hanna = await open('hanna28ct', 360, 740);
  const hannaFrames = socketFrames(hanna);
  const phones = [olya, taras, petro, hanna];
  for (const [page, nickname, team] of [
    [olya, 'Оля', 'Соняшники'],
    [taras, 'Тарас', 'Соняшники'],
    [petro, 'Петро', 'Маки'],
    [hanna, 'Ганна', 'Маки'],
  ] as const) {
    if (page === petro) await join22a(page, ar, code, nickname);
    else await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
  }
  await expect.poll(() => stageTeam(stage, 'Соняшники'), POLL).toEqual(['Оля', 'Тарас']);
  await expect.poll(() => stageTeam(stage, 'Маки'), POLL).toEqual(['Петро', 'Ганна']);
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // ── Перший малюнок: малює Оля (Соняшники); Тарас — лише «Малює Оля з вашої команди», без слова й поля. ──
  await olya.locator('.drawing-pad .drawing-word strong').getByText('вишиванка', exact).waitFor();
  await taras.locator('.drawing-team-watch').getByText('Малює Оля з вашої команди — ви не вгадуєте', exact).waitFor();
  expect(await taras.locator('.drawing-guess-form').count(), 'a guess field for the drawer’s teammate').toBe(0);
  await mouseDraw28c(olya, [[0.3, 0.2], [0.7, 0.2], [0.75, 0.9], [0.25, 0.9], [0.3, 0.2]]);
  await mouseDraw28c(olya, [[0.4, 0.4], [0.5, 0.5], [0.6, 0.4]]);
  await sameDrawing28c(olya, [stageCanvas28c(stage), taras, petro, hanna]);
  for (const [label, page, frames] of [['Тарас', taras, tarasFrames], ['Ганна', hanna, hannaFrames]] as const) {
    expect(await page.content(), `the word in the ${label} DOM`).not.toContain('вишиванк');
    expect(frames.join(NL), `the word sent to ${label}`).not.toContain('вишиванк');
  }
  await shot(taras, 'drawing-phone-team-watch');
  await expectWatchFits28c(taras, 'drawing-phone-team-watch-360');
  await expectWatchFits28c(petro, 'drawing-phone-guess-ar');
  // Ганна вгадує за Маків — Петро бачить «Вгадано!» на своєму телефоні; усі, хто міг, вгадали — запитання закрите.
  await guess28c(hanna, 'вишиванка');
  await petro.getByText((ar as Dict22a).drawingGuessed!, exact).first().waitFor();
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor({ timeout: 10_000 });
  await reveal28a(host);
  const reveal = stage.locator('.drawing-stage.is-reveal');
  await reveal.locator('.drawing-word-was').getByText('Слово: вишиванка', exact).waitFor();
  expect(await reveal.locator('.drawing-guessers .name').allTextContents()).toEqual(['Маки']);
  expect(await reveal.locator('.drawing-artist').innerText()).toMatch(/Художник: Оля\s*\+100/);
  for (const page of phones) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe('100');

  // ── Другий малюнок: черга команд — малює Петро (Маки) арабською; ніхто не вгадав — частка 0. ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  await petro.locator('.drawing-pad .drawing-word strong').getByText('равлик', exact).waitFor();
  await hanna.locator('.drawing-team-watch').getByText('Малює Петро з вашої команди — ви не вгадуєте', exact).waitFor();
  expect(await ownDir(petro.locator('.drawing-tools')), 'the Arabic pad direction').toBe('rtl');
  await mouseDraw28c(petro, CIRCLE28C);
  await mouseDraw28c(petro, [[0.3, 0.7], [0.85, 0.7]]);
  await sameDrawing28c(petro, [stageCanvas28c(stage), olya, taras, hanna]);
  await expectPadFits28c(petro, 'drawing-phone-drawer-ar');
  expect(await hanna.content(), 'the word in the DOM of the drawer’s teammate').not.toContain('равлик');
  expect(hannaFrames.join(NL), 'the word sent to the drawer’s teammate').not.toContain('равлик');
  await guess28c(taras, 'слимак');
  await expect.poll(() => taras.locator('.drawing-guess-status').textContent(), POLL).toBe('Ні');
  await reveal28a(host);
  await reveal.locator('.drawing-word-was').getByText('Слово: равлик', exact).waitFor();
  expect(await reveal.locator('.drawing-artist').innerText()).toMatch(/Художник: Петро\s*0$/);
  await reveal.locator('.drawing-nobody').waitFor();
  for (const page of phones) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe('100');
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}
