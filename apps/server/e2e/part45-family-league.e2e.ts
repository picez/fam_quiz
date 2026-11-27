import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { previousMonth } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { expectNoSideScroll, expectPhoneFit, click, joinBy11h, launchBot11h, MENU, myId, open, pickOption, pickTeamOn, register, toNextQuestion } from './helpers/common';
import { ARTIFACTS, base, db, exact, problems, shot, snapshot, useE2eServer } from './helpers/setup';
import { kyivMonth } from '../src/league-store';
import { leagueGame, leaguePoint } from '../src/db/schema';

/**
 * Наскрізні тести: частина 45 — сімейна ліга (38b): ведучий позначає лобі групою, чотири члени групи грають дві ігри (одну командами),
 * «+N балів» на телефонах і бали членів на пульті, гра на двох членів не рахується, таблиця місяця лише для членів, закритий місяць
 * дає титул і «Залу переможців», хто вийшов — лишається в минулих місяцях; телефон 360 px, світла тема.
 */

useE2eServer();

it('part 45: family league — a group of four plays two league games (one in teams), the month table, a 2-member game does not count, the month is settled into a title and the hall of winners, phone 360 px, light theme', async () => {
  try {
    await league45();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 1_200_000);

const light = async (page: Page) => {
  await page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  return page;
};
const isLight = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('is-light'));
/** Кадр лише видимої частини екрана: видно, чи не закриває нижня панель кінець сторінки. */
const viewportShot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`) });
};
/** Сторінка з нижньою панеллю: кадр 360 × 740, потім перевірка 375 × 812 (без бокового скролу, панель не закриває кінець), назад до 360 × 740. */
const phoneFit = async (page: Page, name: string) => {
  await viewportShot(page, `${name}-viewport`);
  await expectPhoneFit(page, name);
  await page.setViewportSize({ width: 360, height: 740 });
};
/** Жодне слово не розірвано посеред слова: кожне слово тексту займає один рядок. */
const wordsWhole = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const broken: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        for (const match of text.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index!);
          range.setEnd(node, match.index! + match[0].length);
          if (new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1) broken.push(match[0]);
        }
      }
    }
    return broken;
  }, selector);

const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
const monthName = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

async function league45() {
  const GROUP = 'Родина Коваленків';
  const LONG = 'Петроярославовичко20';
  const common = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  const Q1 = 'Яке місто стоїть на Дніпрі?';
  const Q2 = 'Львів — столиця України?';
  const Q3 = 'Одеса стоїть на березі Чорного моря?';
  const rounds = () => [
    classicRound(
      'c1',
      [
        { ...common, id: 'q1', type: 'single', text: Q1, options: options('Київ', 'Львів', 'Луцьк', 'Ужгород'), correctId: 'a' },
        { ...common, id: 'q2', type: 'boolean', text: Q2, correct: false, timeLimit: 25 },
        { ...common, id: 'q3', type: 'boolean', text: Q3, correct: true, timeLimit: 25 },
      ] as never,
      { title: 'Міста', speedBonus: false, shuffleOptions: false },
    ),
  ];
  const quiz = { ...makeRoundsQuiz(rounds()), title: 'Міста 45' };
  const teamQuiz = { ...makeRoundsQuiz(rounds(), { teams: { count: 2, names: ['Червоні', 'Сині'] } }), title: 'Команди міст 45' };
  const irynaQuiz = { ...makeRoundsQuiz(rounds()), title: 'Міста 45 Ірини' };

  // ── 1. Група з чотирьох; «Оксана» поза групою. ──
  const olena = await light(await open('olena45', 360, 740));
  await register(olena, 'menu', 'Олена', 'olena45@example.com');
  const createdGroup = await olena.request.post(`${base}/api/groups`, { data: { name: GROUP, emoji: '👪', description: '' } });
  expect(createdGroup.status(), await createdGroup.text()).toBe(201);
  const created = (await createdGroup.json()) as { id: string; inviteCode: string };
  const groupId = created.id;
  const accounts: Record<string, Page> = {};
  for (const [key, name, email] of [['taras', 'Тарас', 'taras45@example.com'], ['iryna', 'Ірина', 'iryna45@example.com'], ['petro', LONG, 'petro45@example.com'], ['oksana', 'Оксана', 'oksana45@example.com']] as const) {
    const page = await light(await open(`${key}45`, 360, 740));
    await register(page, 'menu', name, email);
    accounts[key] = page;
  }
  const { taras, iryna, petro, oksana } = accounts as Record<'taras' | 'iryna' | 'petro' | 'oksana', Page>;
  for (const page of [taras, iryna, petro]) {
    const joined = await page.request.post(`${base}/api/groups/join/${created.inviteCode}`);
    expect(joined.status(), await joined.text()).toBeLessThan(300);
  }
  const guest = await light(await open('guest45', 360, 740));
  for (const body of [quiz, teamQuiz]) expect((await olena.request.post(`${base}/api/quizzes`, { data: body })).ok()).toBe(true);
  expect((await iryna.request.post(`${base}/api/quizzes`, { data: irynaQuiz })).ok()).toBe(true);

  // ── 2. Лобі: «🏆 Сімейна ліга», вибір групи, телефони з рядком «Гра для ліги». ──
  const hostLobby = async (title: string) => {
    await olena.goto(`${base}/quizzes`);
    await olena.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Провести', ...exact }).click();
    await olena.waitForURL(/\/host\/\d{6}$/);
    return olena.url().slice(-6);
  };
  const joinLobby = async (page: Page, code: string, nickname: string) => {
    await page.goto(`${base}/play/${code}`);
    const input = page.getByLabel('Ваше ім’я', exact);
    await input.fill(nickname);
    if ((await input.inputValue()) !== nickname) await input.fill(nickname);
    await click(page, 'Увійти в гру');
    await page.getByText('Ви в грі. Чекаємо на старт.').waitFor();
  };
  const code1 = await hostLobby('Міста 45');
  const panel = olena.locator('section.league-pick');
  await panel.getByRole('heading', { name: /Сімейна ліга/ }).waitFor();
  await panel.getByLabel('Гра для групи', { exact: true }).selectOption(groupId);
  await panel.getByText('Збережено', exact).waitFor();
  await panel.scrollIntoViewIfNeeded();
  await expectNoSideScroll(olena, 'p45-pick');
  await viewportShot(olena, 'p45-pick-viewport');
  expect(await wordsWhole(olena, 'section.league-pick'), 'no word of the league panel is broken').toEqual([]);

  const phones1: [Page, string][] = [[taras, 'Тарас'], [oksana, 'Оксана'], [iryna, 'Ірина'], [petro, 'Петро'], [guest, 'Гість']];
  for (const [page, nickname] of phones1) await joinLobby(page, code1, nickname);
  const mark = '🏆 Гра для ліги «Родина Коваленків»';
  for (const [page] of phones1) await page.getByText(mark, exact).waitFor();
  await expectNoSideScroll(taras, 'p45-lobby');
  await viewportShot(taras, 'p45-lobby-viewport');
  expect(await wordsWhole(taras, '.league-mark')).toEqual([]);
  await click(olena, 'Почати гру');
  // Після старту змінити не можна.
  const late = await olena.request.put(`${base}/api/games/by-code/${code1}/league`, { data: { groupId: null } });
  expect(late.status()).toBe(409);
  expect(await late.json()).toEqual({ error: 'wrong_phase' });
  await click(olena, 'Почати раунд');

  // ── 3. Гра 1: Тарас — три правильні, Оксана — дві, Ірина — одна, Петро й гість — жодної (рівний рахунок розвів би лише час відповідей). ──
  const plan: Record<string, [string, string, string]> = {
    Тарас: ['Київ', 'Ні', 'Так'],
    Оксана: ['Київ', 'Ні', 'Ні'],
    Ірина: ['Київ', 'Так', 'Ні'],
    Петро: ['Львів', 'Так', 'Ні'],
    Гість: ['Луцьк', 'Так', 'Ні'],
  };
  const questions = [Q1, Q2, Q3];
  for (const [index, text] of questions.entries()) {
    for (const [page] of phones1) await page.getByText(text).first().waitFor({ timeout: 120_000 });
    for (const [page, nickname] of phones1) {
      const answer = plan[nickname]![index]!;
      if (index === 0) await pickOption(page, answer);
      else await click(page, answer);
    }
    await olena.getByText('Запитання закрите').waitFor();
    await click(olena, 'Показати відповідь');
    if (index < 2) await toNextQuestion(olena);
  }
  await click(olena, 'Завершити гру');
  const gained = (page: Page) => page.locator('.league-gained');
  await gained(taras).waitFor({ timeout: 30_000 });
  expect(await gained(taras).innerText()).toBe('Ліга «Родина Коваленків»: +10 балів');
  await gained(iryna).waitFor();
  expect(await gained(iryna).innerText()).toBe('Ліга «Родина Коваленків»: +7 балів');
  expect(await gained(petro).innerText()).toBe('Ліга «Родина Коваленків»: +5 балів');
  expect(await gained(oksana).count(), 'a non-member has no league line').toBe(0);
  expect(await gained(guest).count(), 'a guest has no league line').toBe(0);
  await expectNoSideScroll(taras, 'p45-gained');
  await viewportShot(taras, 'p45-gained-viewport');
  expect(await wordsWhole(taras, '.league-gained')).toEqual([]);
  // Пульт: рядки трьох членів із балами; не-члена й гостя немає.
  const result = olena.locator('section.league-result');
  await result.waitFor();
  expect(await result.locator('h3').innerText()).toBe('Ліга «Родина Коваленків»');
  expect(await result.locator('li').allInnerTexts()).toEqual(['Тарас — +10 балів', 'Ірина — +7 балів', 'Петро — +5 балів']);
  await result.scrollIntoViewIfNeeded();
  await expectNoSideScroll(olena, 'p45-host-end');
  await viewportShot(olena, 'p45-host-end-viewport');
  expect(await wordsWhole(olena, 'section.league-result')).toEqual([]);

  // ── 4. Гра 2: командна — «Червоні» (Тарас + гість) виграють, «Сині» (Ірина + Петро) — другі. ──
  const code2 = await hostLobby('Команди міст 45');
  await olena.locator('section.league-pick').getByLabel('Гра для групи', { exact: true }).selectOption(groupId);
  await olena.locator('section.league-pick').getByText('Збережено', exact).waitFor();
  const phones2: [Page, string, string][] = [[taras, 'Тарас', 'Червоні'], [guest, 'Гість', 'Червоні'], [iryna, 'Ірина', 'Сині'], [petro, 'Петро', 'Сині']];
  for (const [page, nickname, team] of phones2) {
    await joinLobby(page, code2, nickname);
    await pickTeamOn(page, team);
  }
  await click(olena, 'Почати гру');
  await click(olena, 'Почати раунд');
  for (const [index, text] of questions.entries()) {
    for (const [page] of phones2) await page.getByText(text).first().waitFor({ timeout: 120_000 });
    // Відповідає капітан кожної команди: «Червоні» — правильно, «Сині» — навпаки.
    for (const team of ['Червоні', 'Сині']) {
      const pages = phones2.filter(([, , name]) => name === team).map(([page]) => page);
      let captain: Page | undefined;
      await expect
        .poll(async () => {
          for (const page of pages) if (await page.getByText('Ти капітан', exact).isVisible()) captain = page;
          return captain !== undefined;
        })
        .toBe(true);
      const right = [['Київ', 'Ні', 'Так'], ['Львів', 'Так', 'Ні']][team === 'Червоні' ? 0 : 1]![index]!;
      if (index === 0) await pickOption(captain!, right);
      else await click(captain!, right);
      // Капітан: вибір — чернетка команди, відповідь іде кнопкою «Відповісти».
      await click(captain!, 'Відповісти');
    }
    await olena.getByText('Запитання закрите').waitFor();
    await click(olena, 'Показати відповідь');
    if (index < 2) await toNextQuestion(olena);
  }
  await click(olena, 'Завершити гру');
  await gained(taras).waitFor({ timeout: 30_000 });
  expect(await gained(taras).innerText()).toBe('Ліга «Родина Коваленків»: +10 балів');
  await gained(iryna).waitFor();
  expect(await gained(iryna).innerText()).toBe('Ліга «Родина Коваленків»: +7 балів');
  expect(await gained(petro).innerText()).toBe('Ліга «Родина Коваленків»: +7 балів');
  expect(await gained(guest).count()).toBe(0);
  expect((await olena.locator('section.league-result li').allInnerTexts()).sort()).toEqual(['Ірина — +7 балів', 'Петро — +7 балів', 'Тарас — +10 балів']);

  // ── 5. Гра 3: автопілот Ірини, грають лише Ірина й Петро — замало членів групи. ──
  const code3 = await launchBot11h(iryna, 'Міста 45 Ірини', 'Ірина');
  const irynaPanel = iryna.locator('section.league-pick');
  await irynaPanel.getByLabel('Гра для групи', { exact: true }).selectOption(groupId);
  await irynaPanel.getByText('Збережено', exact).waitFor();
  await joinBy11h(petro, code3, 'Петро');
  await click(iryna, 'Почати гру');
  const auto: [Page, [string, string, string]][] = [[iryna, ['Київ', 'Ні', 'Так']], [petro, ['Київ', 'Ні', 'Так']]];
  for (const [index, text] of questions.entries()) {
    for (const [page] of auto) await page.getByText(text).first().waitFor({ timeout: 120_000 });
    for (const [page, answers] of auto) {
      if (index === 0) await pickOption(page, answers[0]);
      else await click(page, answers[index]!);
    }
  }
  await iryna.locator('.league-too-few').waitFor({ timeout: 180_000 });
  expect(await iryna.locator('.league-too-few').innerText()).toBe('Для ліги замало учасників групи');
  expect(await petro.locator('.league-too-few').count(), 'only the author is told').toBe(0);
  expect(await gained(iryna).count()).toBe(0);
  await expectNoSideScroll(iryna, 'p45-too-few');
  await viewportShot(iryna, 'p45-too-few-viewport');

  // ── 6. Таблиця поточного місяця для членів; Оксана — 404, гість — 401. ──
  const now = new Date();
  const thisMonth = kyivMonth(now);
  const open45 = async (page: Page) => {
    await page.goto(`${base}/profile`);
    await page.locator(MENU).getByRole('link', { name: 'Профіль' }).click();
    await page.locator('nav.profile-tiles a.is-wide').click();
    await page.getByRole('link', { name: new RegExp(GROUP) }).click();
    await page.getByRole('tab', { name: 'Ліга', ...exact }).click();
    await page.locator('section.group-league').waitFor();
  };
  await open45(taras);
  const rows = taras.locator('table.league-table tbody tr');
  await rows.nth(2).waitFor();
  const cells = async () => (await rows.evaluateAll((trs) => trs.map((tr) => [...tr.children].map((cell) => (cell.textContent ?? '').trim()))));
  const table = await cells();
  expect(table).toEqual([
    ['1', 'Тарас', '20', '2', '2'],
    ['2', 'Ірина', '14', '2', '0'],
    ['3', LONG, '12', '2', '0'],
  ]);
  expect(await taras.locator('table.league-table tr.is-me').innerText()).toContain('Тарас');
  expect(await taras.locator('.league-hall').count(), 'no champion yet').toBe(0);
  expect(await taras.getByText('Переможців ще немає', { exact: false }).count()).toBe(1);
  await expectNoSideScroll(taras, 'p45-table');
  await phoneFit(taras, 'p45-table');
  expect(await wordsWhole(taras, 'table.league-table th[scope="col"]'), 'column headings keep whole words').toEqual([]);
  expect((await oksana.request.get(`${base}/api/groups/${groupId}/league`)).status()).toBe(404);
  expect((await guest.request.get(`${base}/api/groups/${groupId}/league`)).status()).toBe(401);
  expect((await olena.request.get(`${base}/api/groups/${groupId}/league`)).status()).toBe(200);

  // ── 7. Підміна часу: усі ігри й бали — у минулому місяці; поточний порожній, минулий — та сама таблиця й «Зала переможців». ──
  const past = previousMonth(thisMonth);
  await db.update(leagueGame).set({ month: past }).where(eq(leagueGame.groupId, groupId));
  await db.update(leaguePoint).set({ month: past }).where(eq(leaguePoint.groupId, groupId));
  await taras.reload();
  await taras.getByRole('tab', { name: 'Ліга', ...exact }).click();
  await taras.getByText('Цього місяця ще не було ігор для ліги.', exact).waitFor();
  const picker = taras.getByLabel('Місяць', { exact: true });
  await picker.selectOption(past);
  await rows.nth(2).waitFor();
  expect(await cells()).toEqual(table);
  const hall = taras.locator('ul.league-hall li');
  await hall.first().waitFor();
  expect(await hall.allInnerTexts()).toEqual([`${monthName(past)} — Тарас`]);
  await taras.getByRole('heading', { name: 'Зала переможців', ...exact }).scrollIntoViewIfNeeded();
  await taras.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  await expectNoSideScroll(taras, 'p45-hall');
  await phoneFit(taras, 'p45-hall');

  // ── 8. Профіль Тараса — титул; публічний профіль для Оксани — лише рядок титулу. ──
  const title = `🏆 Перше місце в лізі «${GROUP}» — ${monthName(past)}`;
  await taras.locator(MENU).getByRole('link', { name: 'Профіль' }).click();
  const own = taras.locator('ul.league-titles li');
  await own.first().waitFor();
  expect(await own.allInnerTexts()).toEqual([title]);
  await expectNoSideScroll(taras, 'p45-title');
  await phoneFit(taras, 'p45-title');
  expect(await wordsWhole(taras, 'ul.league-titles')).toEqual([]);
  const tarasId = await myId(taras);
  await oksana.goto(`${base}/profile/${tarasId}`);
  const publicTitle = oksana.locator('ul.league-titles li');
  await publicTitle.first().waitFor();
  expect(await publicTitle.allInnerTexts()).toEqual([title]);
  expect(await oksana.locator('table.league-table').count(), 'no table in a public profile').toBe(0);
  expect(await oksana.locator(`a[href*="/profile/groups/${groupId}"]`).count(), 'no link to the group in a public profile').toBe(0);
  expect(await oksana.locator('body').innerText()).not.toContain('Бали');
  const publicProfile = await oksana.request.get(`${base}/api/profiles/${tarasId}`);
  if (publicProfile.ok()) {
    const text = await publicProfile.text();
    expect(text).not.toContain(groupId);
    expect(text).not.toContain('"points"');
  }
  await expectNoSideScroll(oksana, 'p45-title-public');
  await phoneFit(oksana, 'p45-title-public');

  // ── 9. Петро виходить із групи: з поточного місяця його немає, у минулому — з позначкою «вже не в групі». ──
  expect((await petro.request.post(`${base}/api/groups/${groupId}/leave`)).status()).toBeLessThan(300);
  const afterLeave = (await (await taras.request.get(`${base}/api/groups/${groupId}/league`)).json()) as { rows: unknown[] };
  expect(afterLeave.rows, 'nobody has points this month').toEqual([]);
  await taras.goto(`${base}/profile/groups/${groupId}`);
  await taras.getByRole('tab', { name: 'Ліга', ...exact }).click();
  await taras.getByLabel('Місяць', { exact: true }).selectOption(past);
  await rows.nth(2).waitFor();
  const former = taras.locator('table.league-table tbody tr', { hasText: LONG });
  expect(await former.innerText()).toContain('вже не в групі');
  expect((await cells()).map((row) => row[2])).toEqual(['20', '14', '12']);
  await expectNoSideScroll(taras, 'p45-table-former');
  await phoneFit(taras, 'p45-table-former');
  // Довгий нік без пробілів у вузькій колонці переноситься (overflow-wrap), а не розпирає таблицю: див. expectNoSideScroll вище.

  // Польською (після українських перевірок: вхід із мовою оновлює мову акаунта): довгі заголовки стовпців і «Galeria zwycięzców» на 360 px.
  const tarasPl = await light(await open('taras45pl', 360, 740, { locale: 'pl-PL' }));
  await tarasPl.context().addInitScript(() => localStorage.setItem('quiz:locale', 'pl'));
  await tarasPl.context().addCookies(await taras.context().cookies());
  await tarasPl.goto(`${base}/profile/groups/${groupId}`);
  await tarasPl.getByRole('tab', { name: 'Liga', ...exact }).click();
  await tarasPl.locator('section.group-league').waitFor();
  await tarasPl.getByLabel('Miesiąc', { exact: true }).selectOption(past);
  await tarasPl.locator('table.league-table tbody tr').nth(2).waitFor();
  await expectNoSideScroll(tarasPl, 'p45-table-pl');
  await phoneFit(tarasPl, 'p45-table-pl');
  expect(await wordsWhole(tarasPl, 'table.league-table th[scope="col"]'), 'Polish column headings keep whole words').toEqual([]);

  // ── 10. Світла тема на всіх кадрах. ──
  for (const [name, page] of [['olena', olena], ['taras', taras], ['tarasPl', tarasPl], ['iryna', iryna], ['petro', petro], ['oksana', oksana], ['guest', guest]] as const) {
    expect(await isLight(page), `${name}: light theme class`).toBe(true);
  }
  await shot(taras, 'p45-end');
  // Гість і чужий 401/404 — очікувані відповіді запитів, а не збої сторінок.
  expect(problems.filter((problem) => !/\b(401|404)\b/.test(problem))).toEqual([]);
}
