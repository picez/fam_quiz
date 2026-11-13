import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { LIMITS } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import es from '../../web/src/locales/es.json';
import { open, click, liveRow, field, questionText, join, openRoundSettings, bodyText, expectNoSideScroll, register, POLL, socketFrames, NL, pickTeamOn, stageTeam, sleep, join22a, step27a, next27a, phoneScore27a, select27b, toWinners27c } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 27: ставки, аукціон, список на час, слова з літер.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 27a: a bets round — a partly visible question, a growing minimum, the bank split, a refund, a zero-score player skipping and the host opening early', async () => {
  try {
    await betsGame27a();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

/** Ставка на телефоні: заповнює поле й тисне «Поставити». confirm=false — остання ставка: запитання відкривається й форма зникає. Без refusal — чекає «Ваша ставка: N»; з refusal — рядок помилки. */
async function bet27a(page: Page, amount: number, refusal?: string, confirm = true) {
  await field(page, 'Ставка').fill(String(amount));
  await click(page, 'Поставити');
  if (!confirm) return;
  if (refusal === undefined) await page.locator('.wager-mine').getByText(`Ваша ставка: ${amount}`, exact).waitFor();
  else await expect.poll(() => page.locator('.bets-error').textContent(), POLL).toBe(refusal);
}

async function betsGame27a() {
  // ── Редактор: класичний раунд і «Ставки» 200 / 100 / найбільша 300 із трьома запитаннями. ──
  const host = await open('host27a', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host27a@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Ставки 27a');
  await openRoundSettings(host);
  await field(host, 'Бали за швидкість: швидша правильна відповідь дає більше').setChecked(false);
  await questionText(host).fill('Яка планета найбільша?');
  await field(host, 'Варіант 1').fill('Сатурн');
  await field(host, 'Варіант 2').fill('Юпітер');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Бали').fill('500');
  await click(host, 'Додати запитання');
  await click(host, 'текст');
  await questionText(host).fill('Столиця Франції?');
  await field(host, 'Написання 1').fill('Париж');
  await field(host, 'Бали').fill('300');

  await click(host, '+ Раунд');
  await click(host, 'Ставки');
  await openRoundSettings(host);
  await field(host, 'Назва раунду').fill('Тихий банк');
  await field(host, 'Стартова мінімальна ставка').fill('200');
  await field(host, 'На скільки мінімум росте з кожним запитанням').fill('100');
  await field(host, 'Найбільша ставка').fill('300');
  // Б1: один варіант, видно «Яке місто».
  await questionText(host).fill('Яке місто є столицею Австралії?');
  await field(host, 'Варіант 1').fill('Сідней');
  await field(host, 'Варіант 2').fill('Канберра');
  await host.keyboard.press('Enter');
  await host.keyboard.type('Мельбурн');
  await host.keyboard.press('Enter');
  await host.keyboard.type('Перт');
  await field(host, 'Правильний: варіант 2').click();
  await host.getByRole('radio', { name: 'місто', ...exact }).click();
  await host.getByText('Під час ставок видно: «Яке місто»', exact).waitFor();
  // Б2: так/ні, правильна «ні», нічого не видно.
  await click(host, 'Додати запитання');
  await click(host, 'так чи ні');
  await questionText(host).fill('Чи є кит рибою?');
  await click(host, 'Правильна відповідь: Ні');
  await host.getByRole('radio', { name: 'Нічого', ...exact }).click();
  await host.getByText('Під час ставок видно лише тему раунду й номер запитання', exact).waitFor();
  // Б3: число, видно весь текст.
  await click(host, 'Додати запитання');
  await click(host, 'число');
  await questionText(host).fill('Скільки ніг у павука?');
  await field(host, 'Правильне число').fill('8');
  await host.getByRole('radio', { name: 'Увесь текст', ...exact }).click();
  await host.getByText('Мінімальні ставки за запитаннями: 200, 300, 400', exact).waitFor();

  // Мінімум останнього запитання (400) більший за найбільшу ставку (300): збереження називає проблему.
  const problem = 'Мінімальна ставка останнього запитання (400) більша за найбільшу ставку (300)';
  await click(host, 'Зберегти');
  await host.getByText(problem).first().waitFor();
  await shot(host, 'bets27a-editor');
  await field(host, 'Найбільша ставка').fill('600');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Ставки 27a' }).waitFor();
  expect(await host.getByText(problem).count(), 'the minimum problem after raising the maximum').toBe(0);
  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Ставки 27a')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: Record<string, unknown>[] };
  const storedBets = stored.rounds[1] as { type: string; title: string; betStart: number; betStep: number; betMax: number | null; questions: { betsCut: number }[] };
  expect(storedBets).toMatchObject({ type: 'bets', title: 'Тихий банк', betStart: 200, betStep: 100, betMax: 600 });
  expect(storedBets.questions.map((question) => question.betsCut)).toEqual([2, 0, LIMITS.questionText]);

  // ── Гра: сцена 1600 × 900; Оля 375 × 812, Тарас 360 × 740, Іра 360 × 740, Хосе 320 × 640 (es). ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage27a', 1600, 900);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya27a', 375, 812);
  const taras = await open('taras27a', 360, 740);
  const ira = await open('ira27a', 360, 740);
  const jose = await open('jose27a', 320, 640, { locale: 'es-ES' });
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(ira, code, 'Іра', false);
  await join22a(jose, es, code, 'Хосе');
  await stage.getByText('Хосе').waitFor();
  const phones = [olya, taras, ira, jose];
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // Класика: Оля правильно на обидва (800), Тарас — на перше (500), Іра — на друге (300), Хосе — ні на що (0).
  await olya.getByRole('button', { name: /Юпітер/ }).click();
  await taras.getByRole('button', { name: /Юпітер/ }).click();
  await ira.getByRole('button', { name: /Сатурн/ }).click();
  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  await next27a(host);
  await field(olya, 'Ваша відповідь').waitFor();
  await field(olya, 'Ваша відповідь').fill('Париж');
  await click(olya, 'Відповісти');
  await field(taras, 'Ваша відповідь').fill('Рим');
  await click(taras, 'Відповісти');
  await field(ira, 'Ваша відповідь').fill('Париж');
  await click(ira, 'Відповісти');
  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');

  // ── Б1 (мінімум 200): видно лише «Яке місто». ──
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await stage.locator('.bets-stage-teaser').getByText('Яке місто', exact).waitFor();
  await olya.locator('.bets-teaser-text').getByText('Яке місто', exact).waitFor();
  for (const [name, page] of [['stage', stage], ['Оля', olya]] as const) {
    const html = await page.content();
    expect(html, `${name}: the full text during betting`).not.toContain('Австралії');
    expect(html, `${name}: an option during betting`).not.toContain('Канберра');
  }
  await stage.getByText('Запитання 1 з 3', exact).waitFor();
  await stage.getByText('Мінімальна ставка 200', exact).waitFor();
  await stage.getByText('Найбільша ставка 600', exact).waitFor();
  await stage.getByText('Ще ніхто не поставив', { exact: false }).waitFor();
  await olya.getByText('Ваша ставка від 200 до 600', exact).waitFor();
  // Хосе (0 балів, es): лише пояснення пропуску, без поля.
  const skipEs = (es as Record<string, string>).betsSkipLow!.replace('{min}', '200');
  await jose.locator('.bets-skip').getByText(skipEs, exact).waitFor();
  expect(await jose.locator('.bets-form input').count(), 'a bet field for a player below the minimum').toBe(0);
  await expectNoSideScroll(jose, 'bets27a-phone-low-es-320');
  // Ставка Олі: 700 — відмова; 400 — прийнято.
  await bet27a(olya, 700, 'Ставка має бути від мінімальної до найбільшої.');
  await shot(olya, 'bets27a-phone-wager');
  await bet27a(olya, 400);
  await bet27a(taras, 200);
  // Форма ставки не вилазить на 360 і 320 px.
  await expectNoSideScroll(ira, 'bets27a-phone-form-360');
  await ira.setViewportSize({ width: 320, height: 640 });
  await expectNoSideScroll(ira, 'bets27a-phone-form-320');
  await ira.setViewportSize({ width: 360, height: 740 });
  // Сцена: «Банк: 600», «Поставили: Оля, Тарас» — без жодної окремої суми.
  const strip = stage.locator('.bets-stage .bets-strip');
  await expect.poll(() => strip.textContent(), POLL).toBe('Поставили: Оля, Тарас');
  await stage.locator('.bank-meter').getByText('Банк: 600', exact).waitFor();
  expect(await bodyText(stage), 'a stake on the stage').not.toContain('400');
  // Пульт на ставках: повне запитання й суми.
  const panel = host.locator('.bets-host');
  await panel.waitFor();
  const panelText = await panel.innerText();
  expect(panelText).toContain('Яке місто є столицею Австралії?');
  expect(panelText).toContain('400');
  expect(panelText).toContain('Гравці бачать: Яке місто');
  await shot(stage, 'bets27a-stage-wager');
  await shot(host, 'bets27a-host-wager');
  // Іра — 300: поставили всі, хто може, і запитання відкрилося саме.
  await bet27a(ira, 300, undefined, false);
  await olya.getByRole('button', { name: /Канберра/ }).waitFor();
  await stage.getByText('Яке місто є столицею Австралії?', exact).waitFor();
  await stage.getByText('Банк: 900', { exact: false }).first().waitFor();
  expect(await jose.getByRole('button', { name: /Канберра/ }).count(), 'answer buttons for a player who skips').toBe(0);
  await olya.getByRole('button', { name: /Канберра/ }).click();
  await taras.getByRole('button', { name: /Сідней/ }).click();
  await ira.getByRole('button', { name: /Сідней/ }).click();
  // Відповіли всі, хто грає: запитання закрилося само.
  await step27a(host, 'Показати відповідь');
  const rows = stage.locator('.bets-results li');
  await rows.nth(2).waitFor();
  const read = async (index: number) => ({
    name: await rows.nth(index).locator('.name').textContent(),
    stake: await rows.nth(index).locator('.wager-stake').textContent(),
    delta: await rows.nth(index).locator('.wager-delta').textContent(),
  });
  expect(await read(0)).toEqual({ name: 'Оля', stake: 'ставка 400', delta: '+500' });
  expect(await read(1)).toEqual({ name: 'Тарас', stake: 'ставка 200', delta: '−200' });
  expect(await read(2)).toEqual({ name: 'Іра', stake: 'ставка 300', delta: '−300' });
  await stage.locator('.bets-skipping').getByText('Пропускають: Хосе', exact).waitFor();
  await shot(stage, 'bets27a-stage-reveal');
  await olya.locator('.bets-result').getByText('Ставка 400: +500 з банку', exact).waitFor();
  await shot(olya, 'bets27a-phone-won');
  for (const [page, score] of [[olya, '1300'], [taras, '300'], [ira, '0'], [jose, '0']] as const) {
    await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(score);
  }

  // ── Б2 (мінімум 300): на сцені лише тема й номер запитання. ──
  await next27a(host);
  await stage.getByText('Запитання 2 з 3', exact).waitFor();
  await stage.getByText('Мінімальна ставка 300', exact).waitFor();
  await stage.getByRole('heading', { name: 'Тихий банк' }).waitFor();
  expect(await bodyText(stage), 'the question text during betting').not.toContain('кит');
  expect(await stage.locator('.bets-stage-teaser').count(), 'a teaser with a zero cut').toBe(0);
  await bet27a(taras, 200, 'Ставка має бути від мінімальної до найбільшої.');
  await bet27a(taras, 300);
  await bet27a(olya, 500, undefined, false);
  // Іра теж пропускає: 0 балів.
  await ira.locator('.bets-skip').getByText('Ваших балів менше за мінімальну ставку 300 — це запитання ви пропускаєте', exact).waitFor();
  expect(await ira.locator('.bets-form input').count()).toBe(0);
  await olya.getByRole('button', { name: 'Так', ...exact }).click();
  await taras.getByRole('button', { name: 'Ні', ...exact }).click();
  await step27a(host, 'Показати відповідь');
  await rows.nth(1).waitFor();
  expect(await read(0)).toEqual({ name: 'Оля', stake: 'ставка 500', delta: '−500' });
  expect(await read(1)).toEqual({ name: 'Тарас', stake: 'ставка 300', delta: '+500' });
  await stage.locator('.bets-skipping').getByText('Пропускають: Іра, Хосе', exact).waitFor();
  for (const [page, score] of [[olya, '800'], [taras, '800']] as const) {
    await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(score);
  }

  // ── Б3 (мінімум 400): видно весь текст, ведучий відкриває сам. ──
  await next27a(host);
  await stage.getByText('Запитання 3 з 3', exact).waitFor();
  await stage.locator('.bets-stage-teaser').getByText('Скільки ніг у павука?', exact).waitFor();
  await olya.locator('.bets-teaser-text').getByText('Скільки ніг у павука?', exact).waitFor();
  expect(await field(olya, 'Ваша відповідь').count(), 'an answer field during betting').toBe(0);
  await bet27a(olya, 400);
  await step27a(host, 'Відкрити запитання');
  // Тарас не ставив: бачить пояснення й не має поля відповіді.
  await taras.locator('.bets-skip').getByText('Ставки закрито без вашої — це запитання ви пропускаєте', exact).waitFor();
  expect(await field(taras, 'Ваша відповідь').count(), 'an answer field for a player who did not bet').toBe(0);
  await shot(taras, 'bets27a-phone-late');
  await field(olya, 'Ваша відповідь').fill('6');
  await click(olya, 'Відповісти');
  // Відповіли всі, хто грає: запитання закрилося саме.
  await step27a(host, 'Показати відповідь');
  await stage.getByText('Ніхто не відповів правильно — ставки повернуто', exact).waitFor();
  await olya.locator('.bets-result').getByText('Ніхто не відповів правильно — ставку повернуто', exact).waitFor();
  await expect.poll(() => phoneScore27a(olya).textContent(), POLL).toBe('800');
  await shot(stage, 'bets27a-stage-refund');

  // ── Історія гри: «Оля: ставка 400, +500». ──
  await step27a(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Ставки 27a/ }).click();
  const question = host.locator('.rows.stacked > li', { hasText: 'Яке місто є столицею Австралії?' });
  const toggle = question.getByText(/Відповіді \(\d+\)/);
  if ((await toggle.count()) > 0) await toggle.click();
  await question.getByText('Оля: ставка 400, +500').waitFor();

  expect(problems).toEqual([]);
}

it('part 27b: an auction round — outbidding with a resetting clock, the host selling early, the winner right and wrong in both loss modes, nobody bidding and the score cap', async () => {
  try {
    await auctionGame27b();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

const es27b = es as Record<string, string>;

/** Чекає моменту at (Date.now()). */
async function until27b(at: number) {
  const left = at - Date.now();
  if (left > 0) await sleep(left);
}

/** Режим «фіксований крок»: одна кнопка «Поставити {amount}». */
async function raise27b(page: Page, amount: number) {
  await click(page, `Поставити ${amount}`);
}

/** Режим «будь-яка сума»: поле й «Поставити». Без refusal — чекає «Ваша ставка найбільша»; з refusal — рядок помилки. */
async function bid27b(page: Page, amount: number, { refusal, dict }: { refusal?: string; dict?: Record<string, string> } = {}) {
  await page.getByLabel(dict?.auctionBidLabel ?? 'Ставка', exact).fill(String(amount));
  await click(page, dict?.auctionBidPlace ?? 'Поставити');
  if (refusal === undefined) await page.locator('.auction-line').getByText('Ваша ставка найбільша', exact).waitFor();
  else await expect.poll(() => page.locator('.auction-error').textContent(), POLL).toBe(refusal);
}

async function auctionGame27b() {
  // ── Редактор: класика без швидкості й два раунди «Аукціон» — крок +100 «лише ставку» і будь-яка сума «ставку й ціну». ──
  const host = await open('host27b', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host27b@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Аукціон 27b');
  await host.locator('details.rules').first().locator('summary').click();
  await select27b(host, 'Показувати рейтинг', 'end');
  await openRoundSettings(host);
  await field(host, 'Бали за швидкість: швидша правильна відповідь дає більше').setChecked(false);
  await questionText(host).fill('Яка планета найбільша?');
  await field(host, 'Варіант 1').fill('Сатурн');
  await field(host, 'Варіант 2').fill('Юпітер');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Бали').fill('500');
  await click(host, 'Додати запитання');
  await click(host, 'текст');
  await questionText(host).fill('Столиця Франції?');
  await field(host, 'Написання 1').fill('Париж');
  await field(host, 'Бали').fill('300');

  // Раунд А: крок +100, помилка — лише ставка.
  await click(host, '+ Раунд');
  await click(host, 'Аукціон');
  await openRoundSettings(host);
  await field(host, 'Назва раунду').fill('Молоток');
  await select27b(host, 'Як ставлять', 'step');
  await field(host, 'Крок ставки').fill('100');
  await select27b(host, 'Що втрачає той, хто помилився', 'bid');
  // А1: один варіант, видно «Яке місто».
  await questionText(host).fill('Яке місто є столицею Австралії?');
  await field(host, 'Варіант 1').fill('Сідней');
  await field(host, 'Варіант 2').fill('Канберра');
  await host.keyboard.press('Enter');
  await host.keyboard.type('Мельбурн');
  await host.keyboard.press('Enter');
  await host.keyboard.type('Перт');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Бали').fill('200');
  await host.getByRole('radio', { name: 'місто', ...exact }).click();
  await host.getByText('Під час торгу видно: «Яке місто»', exact).waitFor();
  // А2: так/ні, правильна «ні», нічого не видно.
  await click(host, 'Додати запитання');
  await click(host, 'так чи ні');
  await questionText(host).fill('Чи є кит рибою?');
  await click(host, 'Правильна відповідь: Ні');
  await field(host, 'Бали').fill('300');
  await host.getByRole('radio', { name: 'Нічого', ...exact }).click();
  await host.getByText('Під час торгу видно лише тему раунду, номер і ціну запитання', exact).waitFor();
  // А3: число, видно весь текст.
  await click(host, 'Додати запитання');
  await click(host, 'число');
  await questionText(host).fill('Скільки ніг у павука?');
  await field(host, 'Правильне число').fill('8');
  await field(host, 'Бали').fill('200');
  await host.getByRole('radio', { name: 'Увесь текст', ...exact }).click();

  // Раунд Б: будь-яка сума, помилка — ставка й ціна.
  await click(host, '+ Раунд');
  await click(host, 'Аукціон');
  await openRoundSettings(host);
  await field(host, 'Назва раунду').fill('Вільний торг');
  await select27b(host, 'Як ставлять', 'free');
  expect(await field(host, 'Крок ставки').count(), 'the step field in the free mode').toBe(0);
  await select27b(host, 'Що втрачає той, хто помилився', 'bid_price');
  // Б1: текст, видно «Столиця».
  await click(host, 'текст');
  await questionText(host).fill('Столиця Японії?');
  await field(host, 'Написання 1').fill('Токіо');
  await field(host, 'Бали').fill('300');
  await host.getByRole('radio', { name: 'Столиця', ...exact }).click();
  // Б2: один варіант, обріз ще не вибрано.
  await click(host, 'Додати запитання');
  await questionText(host).fill('Який океан найбільший?');
  await field(host, 'Варіант 1').fill('Атлантичний');
  await field(host, 'Варіант 2').fill('Тихий');
  await host.keyboard.press('Enter');
  await host.keyboard.type('Індійський');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Бали').fill('400');

  // Без обрізу збереження називає проблему.
  const problem = 'Позначте, яку частину тексту видно під час торгу';
  await click(host, 'Зберегти');
  await host.getByText(problem).first().waitFor();
  await shot(host, 'auction27b-editor');
  await host.getByRole('radio', { name: 'океан', ...exact }).click();
  await host.getByText('Під час торгу видно: «Який океан»', exact).waitFor();
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Аукціон 27b' }).waitFor();
  expect(await host.getByText(problem).count(), 'the cut problem after choosing a cut').toBe(0);
  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Аукціон 27b')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as {
    settings: { leaderboard: string };
    rounds: { type: string; questions: { betsCut: number; points: number }[] }[];
  };
  expect(stored.settings.leaderboard).toBe('end');
  expect(stored.rounds[1]).toMatchObject({ type: 'auction', title: 'Молоток', bidMode: 'step', bidStep: 100, loss: 'bid' });
  expect(stored.rounds[1]!.questions.map((question) => [question.betsCut, question.points])).toEqual([[2, 200], [0, 300], [LIMITS.questionText, 200]]);
  expect(stored.rounds[2]).toMatchObject({ type: 'auction', title: 'Вільний торг', bidMode: 'free', loss: 'bid_price' });
  expect(stored.rounds[2]!.questions.map((question) => [question.betsCut, question.points])).toEqual([[1, 300], [2, 400]]);

  // ── Гра: сцена 1600 × 900; Оля 375 × 812, Тарас 360 × 740, Іра 360 × 740, Хосе 320 × 640 (es). ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage27b', 1600, 900);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya27b', 375, 812);
  const taras = await open('taras27b', 360, 740);
  const ira = await open('ira27b', 360, 740);
  const jose = await open('jose27b', 320, 640, { locale: 'es-ES' });
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(ira, code, 'Іра', false);
  await join22a(jose, es, code, 'Хосе');
  await stage.getByText('Хосе').waitFor();
  const phones = [olya, taras, ira, jose];
  const scores = async (wanted: [string, string, string, string]) => {
    for (const [at, page] of phones.entries()) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(wanted[at]);
  };
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // Класика: Оля правильно на обидва (800), Тарас — на перше (500), Іра — на друге (300), Хосе — ні на що (0).
  await olya.getByRole('button', { name: /Юпітер/ }).click();
  await taras.getByRole('button', { name: /Юпітер/ }).click();
  await ira.getByRole('button', { name: /Сатурн/ }).click();
  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  await step27a(host, 'Далі');
  await field(olya, 'Ваша відповідь').waitFor();
  await field(olya, 'Ваша відповідь').fill('Париж');
  await click(olya, 'Відповісти');
  await field(taras, 'Ваша відповідь').fill('Рим');
  await click(taras, 'Відповісти');
  await field(ira, 'Ваша відповідь').fill('Париж');
  await click(ira, 'Відповісти');
  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  await scores(['800', '500', '300', '0']);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');

  // ── А1 (крок +100, ціна 200): видно лише «Яке місто», торг із перебиванням. ──
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await stage.locator('.bets-stage-teaser').getByText('Яке місто', exact).waitFor();
  await olya.locator('.bets-teaser-text').getByText('Яке місто', exact).waitFor();
  await stage.getByText('Ціна запитання: 200', exact).waitFor();
  await olya.getByText('Ціна запитання: 200', exact).waitFor();
  for (const [name, page] of [['stage', stage], ['Оля', olya]] as const) {
    const html = await page.content();
    expect(html, `${name}: the full text during bidding`).not.toContain('Австралії');
    expect(html, `${name}: an option during bidding`).not.toContain('Канберра');
  }
  await stage.locator('.auction-clock').waitFor();
  await olya.locator('.auction-clock').waitFor();
  // Хосе (0 балів, es): лише пояснення, без кнопки.
  await jose.locator('.auction-line').getByText(es27b.auctionNone!, exact).waitFor();
  expect(await jose.locator('.auction-raise').count(), 'a bid button for a player without points').toBe(0);
  await expectNoSideScroll(jose, 'auction27b-phone-none-es-320');
  // Кнопка кроку не вилазить на 360 і 320 px.
  await ira.getByRole('button', { name: 'Поставити 100', ...exact }).waitFor();
  await expectNoSideScroll(ira, 'auction27b-phone-step-360');
  await ira.setViewportSize({ width: 320, height: 640 });
  await expectNoSideScroll(ira, 'auction27b-phone-step-320');
  await ira.setViewportSize({ width: 360, height: 740 });
  await shot(olya, 'auction27b-phone-step');
  // Тарас 100, Оля 200, Тарас 300.
  await raise27b(taras, 100);
  await olya.getByRole('button', { name: 'Поставити 200', ...exact }).waitFor();
  await raise27b(olya, 200);
  await taras.getByRole('button', { name: 'Поставити 300', ...exact }).waitFor();
  const tarasAt = Date.now();
  await raise27b(taras, 300);
  await taras.locator('.auction-line').getByText('Ваша ставка найбільша', exact).waitFor();
  expect(await taras.locator('.auction-raise').count(), 'a bid button for the leader').toBe(0);
  await olya.getByText('Найбільша ставка: 300 — Тарас', exact).waitFor();
  // Іра (300 балів) не переб'є 300: пояснення без кнопки.
  await ira.locator('.auction-line').getByText('Більше за ваші бали (300) поставити не можна', exact).waitFor();
  await shot(taras, 'auction27b-phone-leading');
  await shot(stage, 'auction27b-stage-bidding');
  // Пульт на торгу: повне запитання й межі всіх.
  const panel = host.locator('.auction-host');
  await panel.waitFor();
  const panelText = await panel.innerText();
  expect(panelText).toContain('Яке місто є столицею Австралії?');
  for (const limit of ['бали 800', 'бали 500', 'бали 300', 'бали 0']) expect(panelText).toContain(limit);
  expect(panelText).toContain('не може перебити');
  await shot(host, 'auction27b-host-bidding');
  // Через ~3 с Оля — 400: годинник починається знову.
  expect(Date.now() - tarasAt, 'the checks between the bids took too long').toBeLessThan(3000);
  await until27b(tarasAt + 3000);
  const olyaAt = Date.now();
  await raise27b(olya, 400);
  await stage.locator('.auction-stage-amount').getByText('400', exact).waitFor();
  await stage.locator('.auction-stage-leader').getByText('Оля', exact).waitFor();
  await taras.getByText('Найбільша ставка: 400 — Оля', exact).waitFor();
  // Через 3 с після ставки Олі (понад 5 с від ставки Тараса) торг ще йде.
  await until27b(olyaAt + 3000);
  expect(Date.now() - tarasAt).toBeGreaterThan(5500);
  expect(await stage.locator('.auction-stage').count(), 'bidding on the stage 3 s after the last bid').toBe(1);
  expect(await olya.getByRole('button', { name: /Канберра/ }).count(), 'the question opened 3 s after the last bid').toBe(0);
  // Годинник продає сам.
  await olya.getByRole('button', { name: /Канберра/ }).waitFor({ timeout: 8000 });
  const closedAfter = Date.now() - olyaAt;
  expect(closedAfter, 'the clock sold before 5 s').toBeGreaterThan(4500);
  expect(closedAfter, 'the clock sold after 7 s').toBeLessThanOrEqual(7000);
  for (const page of [taras, ira]) {
    await page.locator('.auction-who').getByText('Відповідає Оля — запитання куплено за 400', exact).waitFor();
    expect(await page.getByRole('button', { name: /Канберра/ }).count(), 'answer buttons for a watcher').toBe(0);
  }
  await stage.locator('.auction-strip').getByText('Продано: Оля за 400', exact).waitFor();
  await stage.getByText('Яке місто є столицею Австралії?', exact).waitFor();
  await shot(taras, 'auction27b-phone-watching');
  await olya.getByRole('button', { name: /Канберра/ }).click();
  // Відповів єдиний, хто грає: запитання закрилося само.
  await step27a(host, 'Показати відповідь');
  const row = stage.locator('.auction-results li');
  await row.waitFor();
  expect({
    name: await row.locator('.name').textContent(),
    stake: await row.locator('.wager-stake').textContent(),
    delta: await row.locator('.wager-delta').textContent(),
  }).toEqual({ name: 'Оля', stake: 'ставка 400', delta: '+600' });
  // Кадри розкриття — після появи підсвітки правильного варіанта й картки результату.
  if (process.env.E2E_SHOTS === '1') await sleep(1500);
  await shot(stage, 'auction27b-stage-reveal');
  // Переможець бачить звичайну картку результату з балами, решта — рядок «Правильно: +600».
  await olya.locator('.result').getByText('+600', exact).waitFor();
  await taras.locator('.auction-points').getByText('Правильно: +600', exact).waitFor();
  await shot(olya, 'auction27b-phone-winner');
  await scores(['1400', '500', '300', '0']);

  // ── А2 (ціна 300): нічого не видно, ведучий продає одразу після ставки. ──
  await step27a(host, 'Далі');
  await stage.getByText('Ціна запитання: 300', exact).waitFor();
  expect(await bodyText(stage), 'the question text during bidding').not.toContain('кит');
  expect(await stage.locator('.bets-stage-teaser').count(), 'a teaser with a zero cut').toBe(0);
  await taras.getByRole('button', { name: 'Поставити 100', ...exact }).waitFor();
  const soldFrom = Date.now();
  await raise27b(taras, 100);
  await taras.locator('.auction-line').getByText('Ваша ставка найбільша', exact).waitFor();
  await step27a(host, 'Продано');
  await taras.getByRole('button', { name: 'Так', ...exact }).waitFor();
  expect(Date.now() - soldFrom, 'the host sold before the clock').toBeLessThan(5000);
  await taras.locator('.auction-who').getByText('Ви купили запитання за 100 — відповідайте!', exact).waitFor();
  expect(await olya.getByRole('button', { name: 'Так', ...exact }).count(), 'yes/no for a watcher').toBe(0);
  await click(taras, 'Так');
  await step27a(host, 'Показати відповідь');
  await taras.locator('.result').getByText('−100', exact).waitFor();
  await olya.locator('.auction-points').getByText('Помилка: −100', exact).waitFor();
  await scores(['1400', '400', '300', '0']);

  // ── А3 (ціна 200): видно весь текст, ніхто не ставить, відповідають усі. ──
  await step27a(host, 'Далі');
  await stage.locator('.bets-stage-teaser').getByText('Скільки ніг у павука?', exact).waitFor();
  await olya.locator('.bets-teaser-text').getByText('Скільки ніг у павука?', exact).waitFor();
  expect(await field(olya, 'Ваша відповідь').count(), 'an answer field during bidding').toBe(0);
  await step27a(host, 'Продано');
  await stage.locator('.auction-strip').getByText('Ніхто не купив — відповідають усі', exact).waitFor();
  for (const page of [olya, taras, ira]) await page.locator('.auction-who').getByText('Ніхто не купив — відповідають усі', exact).waitFor();
  await jose.locator('.auction-who').getByText(es27b.auctionOpenAll!, exact).waitFor();
  await shot(stage, 'auction27b-stage-open');
  for (const [page, value] of [[olya, '8'], [taras, '8'], [ira, '6']] as const) {
    await field(page, 'Ваша відповідь').fill(value);
    await click(page, 'Відповісти');
  }
  await field(jose, es27b.yourAnswer!).fill('8');
  await click(jose, es27b.submit!);
  await step27a(host, 'Показати відповідь');
  await scores(['1600', '600', '300', '200']);

  // ── Б1 (будь-яка сума, ціна 300, помилка — ставка й ціна): межа ставки балами. ──
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await stage.locator('.bets-stage-teaser').getByText('Столиця', exact).waitFor();
  for (const [name, page] of [['stage', stage], ['Іра', ira]] as const) {
    expect(await page.content(), `${name}: the hidden word during bidding`).not.toContain('Японії');
  }
  await ira.getByText('Від 1 до 300', exact).waitFor();
  await bid27b(ira, 500, { refusal: 'Більше за свої бали поставити не можна.' });
  await shot(ira, 'auction27b-phone-free-over');
  await expectNoSideScroll(taras, 'auction27b-phone-free-360');
  await bid27b(ira, 150);
  const iraAt = Date.now();
  // Хосе (200 балів, es): 100 — уже перебили, 300 — більше за бали.
  await jose.getByText('De 151 a 200', exact).waitFor();
  await bid27b(jose, 100, { refusal: es27b.err_bid_low!, dict: es27b });
  await bid27b(jose, 300, { refusal: es27b.err_bid_over!, dict: es27b });
  await expectNoSideScroll(jose, 'auction27b-phone-free-es-320');
  expect(Date.now() - iraAt, 'the checks between the bids took too long').toBeLessThan(4000);
  await bid27b(taras, 250);
  await bid27b(ira, 300);
  // Годинник продає Ірі.
  await ira.locator('.auction-who').getByText('Ви купили запитання за 300 — відповідайте!', exact).waitFor({ timeout: 8000 });
  await field(ira, 'Ваша відповідь').fill('Кіото');
  await click(ira, 'Відповісти');
  await step27a(host, 'Показати відповідь');
  await ira.locator('.result').getByText('−600', exact).waitFor();
  await taras.locator('.auction-points').getByText('Помилка: −600', exact).waitFor();
  await scores(['1600', '600', '−300', '200']);

  // ── Б2 (ціна 400): Оля 1000, ведучий продає, правильно. ──
  await step27a(host, 'Далі');
  await stage.locator('.bets-stage-teaser').getByText('Який океан', exact).waitFor();
  await bid27b(olya, 1000);
  await step27a(host, 'Продано');
  await olya.getByRole('button', { name: /Тихий/ }).click();
  await step27a(host, 'Показати відповідь');
  await olya.locator('.result').getByText('+1400', exact).waitFor();
  await ira.locator('.auction-points').getByText('Правильно: +1400', exact).waitFor();
  await scores(['3000', '600', '−300', '200']);

  // ── Історія гри: покупець і непродане запитання. ──
  await step27a(host, 'Далі');
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Аукціон 27b/ }).click();
  const sold = host.locator('.rows.stacked > li', { hasText: 'Яке місто є столицею Австралії?' });
  const toggle = sold.getByText(/Відповіді \(\d+\)/);
  if ((await toggle.count()) > 0) await toggle.click();
  await sold.getByText('Оля — куплено за 400: +600').waitFor();
  await host.locator('.rows.stacked > li', { hasText: 'Скільки ніг у павука?' }).getByText('Ніхто не купив — відповідали всі', exact).waitFor();

  expect(problems).toEqual([]);
}

it('part 27c: a timed list — typos forgiven, repeats free, a minus only on enter, rarity points for four players, a team list, only counts on the stage', async () => {
  try {
    await timedListGame27c();
    await timedListTeams27c();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

/** Поле вводу списку на телефоні (підпис мовою телефона). */
const listInput27c = (page: Page) => page.locator('.timedlist-form input');

/** Вводить слово: з enter — тисне Enter, без — чекає авто-перевірки (400 мс) і відповіді сервера. */
async function listType27c(page: Page, word: string, { enter }: { enter: boolean }) {
  await listInput27c(page).fill(word);
  if (enter) await listInput27c(page).press('Enter');
  else await page.waitForTimeout(700);
}

/** Тексти клітинок по порядку; порожня клітинка — ''. */
const listCells27c = (page: Page) =>
  page.locator('.timedlist-cells .timedlist-cell').evaluateAll((all) => all.map((cell) => cell.querySelector('.timedlist-text')?.textContent ?? ''));

/** Лічильник «3 / 8» на телефоні (без «−50» поруч). */
const listCount27c = (page: Page) => page.locator('.timedlist-counter').evaluate((el) => el.firstChild?.textContent ?? '');

/** Кількість різних колонок у сітці клітинок. */
const listColumns27c = (page: Page) =>
  page.locator('.timedlist-cells .timedlist-cell').evaluateAll((all) => new Set(all.map((cell) => (cell as HTMLElement).offsetLeft)).size);

/** Рядок гравця (чи команди) на табло списку. */
const listRow27c = (page: Page, name: string) => page.locator('.timedlist-board li', { has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) });

/** Пункт розкритого списку за назвою. */
const listItem27c = (page: Page, text: string) => page.locator('.timedlist-reveal > li', { has: page.locator('.timedlist-text', { hasText: new RegExp(`^${text}$`) }) });

/** Пункт у редакторі: поле назви. */
const listItemInput27c = (page: Page, index: number) => page.locator(`input[aria-label="Пункт ${index}"]`);

/** Заповнює пункти поточного запитання-списку в редакторі (3 вже є, решту додає). */
async function fillList27c(host: Page, items: string[]) {
  for (let n = 3; n < items.length; n++) await click(host, 'Додати пункт');
  for (const [at, text] of items.entries()) await listItemInput27c(host, at + 1).fill(text);
}

const PLANETS27C = ['Меркурій', 'Венера', 'Земля', 'Марс', 'Юпітер', 'Сатурн', 'Уран', 'Нептун'];
const RAINBOW27C = ['Червоний', 'Помаранчевий', 'Жовтий', 'Зелений', 'Блакитний', 'Синій', 'Фіолетовий'];

async function timedListGame27c() {
  // ── Редактор: класичний раунд, два списки — планети (мінус 50, 90 с) і веселка (без мінуса, 60 с). ──
  const host = await open('host27c', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host27c@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Список 27c');
  await click(host, 'список на час');
  await questionText(host).fill('Планети Сонячної системи');
  expect(await host.getByLabel('Відео з YouTube', exact).count(), 'a timed list has no video').toBe(0);
  expect(await listItemInput27c(host, 3).count(), 'three blank items to start').toBe(1);
  await fillList27c(host, PLANETS27C);
  const mars = host.getByRole('group', { name: 'Інші написання пункту 4', ...exact });
  await mars.getByRole('button', { name: 'Додати написання', ...exact }).click();
  await mars.getByLabel('Написання 1', exact).fill('Червона планета');
  await field(host, 'Ціна пункту').fill('100');
  await field(host, 'Мінус за слово не зі списку').setChecked(true);
  expect(await field(host, 'Скільки знімати').inputValue(), 'the default minus').toBe('50');
  await field(host, 'Час, с').fill('90');

  await click(host, 'Додати запитання');
  await click(host, 'список на час');
  await questionText(host).fill('Кольори веселки');
  // Сьомий пункт спершу — «синій» удруге: збереження називає проблему.
  await fillList27c(host, [...RAINBOW27C.slice(0, 6), 'синій']);
  await field(host, 'Ціна пункту').fill('100');
  expect(await field(host, 'Мінус за слово не зі списку').isChecked(), 'a minus by default').toBe(false);
  await field(host, 'Час, с').fill('60');
  const duplicate = 'Запитання 2: «синій» веде у два пункти.';
  await click(host, 'Зберегти');
  await host.getByText(duplicate, exact).first().waitFor();
  await shot(host, 'timedlist27c-editor');
  await listItemInput27c(host, 7).fill('Фіолетовий');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Список 27c' }).waitFor();
  expect(await host.getByText(duplicate).count(), 'the duplicate problem after the fix').toBe(0);
  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Список 27c')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as {
    rounds: { type: string; questions: { type: string; items: { text: string; accepted: string[] }[] }[] }[];
  };
  expect(stored.rounds[0]!.type).toBe('classic');
  const [planets, rainbow] = stored.rounds[0]!.questions;
  expect(planets).toMatchObject({ type: 'timedlist', points: 100, minus: 50, timeLimit: 90, video: null });
  expect(planets!.items.map((item) => item.text)).toEqual(PLANETS27C);
  expect(planets!.items[3]!.accepted).toEqual(['Червона планета']);
  expect(rainbow).toMatchObject({ type: 'timedlist', points: 100, minus: null, timeLimit: 60 });
  expect(rainbow!.items.map((item) => item.text)).toEqual(RAINBOW27C);

  // ── Гра: сцена 1600 × 900; Оля 375 × 812, Тарас 360 × 740, Іра 360 × 740, Хосе 320 × 640 (es). ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage27c', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya27c', 375, 812);
  const taras = await open('taras27c', 360, 740);
  const tarasFrames = socketFrames(taras);
  const ira = await open('ira27c', 360, 740);
  const jose = await open('jose27c', 320, 640, { locale: 'es-ES' });
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(ira, code, 'Іра', false);
  await join22a(jose, es, code, 'Хосе');
  await stage.getByText('Хосе').waitFor();
  const phones = [olya, taras, ira, jose];
  const scores = async (wanted: [string, string, string, string]) => {
    for (const [at, page] of phones.entries()) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(wanted[at]);
  };
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await listInput27c(page).waitFor();

  // Сцена: підказка про телефон, рядки «0 / 8».
  await stage.getByText('Пишіть пункти на телефоні', exact).waitFor();
  await olya.getByText('Слово не зі списку: −50', exact).waitFor();
  expect(await listCells27c(olya), 'empty cells before any find').toEqual(Array(8).fill(''));
  expect(await olya.locator('.timedlist-cell .timedlist-n').allTextContents()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);

  // ── Оля: описка без Enter стає в клітинку 5. ──
  await listInput27c(olya).fill('Юпітр');
  await expect.poll(() => listCells27c(olya), POLL).toEqual(['', '', '', '', 'Юпітер', '', '', '']);
  expect(await listCount27c(olya)).toBe('1 / 8');
  await expect.poll(() => listInput27c(olya).inputValue(), POLL).toBe('');
  await olya.waitForTimeout(300);
  await shot(olya, 'timedlist27c-phone-found');
  // Повтор з Enter — без мінуса й без нової клітинки; знайдена клітинка блимає.
  await listType27c(olya, 'юпітер', { enter: true });
  await expect.poll(() => olya.locator('.timedlist-status').textContent(), POLL).toBe('Цей пункт уже знайдено');
  await olya.locator('.timedlist-cell.is-again').waitFor({ timeout: 2000 }).catch(() => undefined);
  await shot(olya, 'timedlist27c-phone-repeat');
  expect(await listCount27c(olya)).toBe('1 / 8');
  expect(await olya.locator('.timedlist-minus-flash').count(), 'a minus for a repeat').toBe(0);
  expect(await olya.locator('.timedlist-wrong').count(), 'a mistake for a repeat').toBe(0);
  await listType27c(olya, 'Венера', { enter: false });
  await listType27c(olya, 'червона планета', { enter: true });
  await expect.poll(() => listCount27c(olya), POLL).toBe('3 / 8');
  expect(await listCells27c(olya)).toEqual(['', 'Венера', '', 'Марс', 'Юпітер', '', '', '']);
  // «Плутон» без Enter — нічого: ні мінуса, ні помилки, слово лишається в полі.
  await listType27c(olya, 'Плутон', { enter: false });
  expect(await listInput27c(olya).inputValue()).toBe('Плутон');
  expect(await olya.locator('.timedlist-minus-flash').count(), 'a minus while typing').toBe(0);
  expect(await olya.locator('.timedlist-wrong').count(), 'a mistake while typing').toBe(0);
  await shot(olya, 'timedlist27c-phone-typing');
  // Тепер з Enter — «−50» біля лічильника і «Помилок: 1».
  await listInput27c(olya).press('Enter');
  await olya.locator('.timedlist-minus-flash').getByText('−50', exact).waitFor();
  await olya.locator('.timedlist-wrong').getByText('Помилок: 1', exact).waitFor();
  expect(await olya.locator('.timedlist-status').textContent()).toBe('Такого пункту немає в списку');
  await olya.waitForTimeout(350);
  await shot(olya, 'timedlist27c-phone-minus');

  // Тарас — три пункти, Іра й Хосе — Юпітер.
  await listType27c(taras, 'Юпітер', { enter: true });
  await listType27c(taras, 'Венера', { enter: false });
  await listType27c(taras, 'Меркурій', { enter: true });
  await expect.poll(() => listCount27c(taras), POLL).toBe('3 / 8');
  await listType27c(ira, 'Юпітер', { enter: false });
  await expect.poll(() => listCount27c(ira), POLL).toBe('1 / 8');
  await listType27c(jose, 'Юпітер', { enter: true });
  await expect.poll(() => listCount27c(jose), POLL).toBe('1 / 8');
  expect(await listCells27c(taras)).toEqual(['Меркурій', 'Венера', '', '', 'Юпітер', '', '', '']);

  // Хосе (es, 320): клітинки у дві колонки, без прокрутки вбік.
  await jose.getByText(es.listMinusNote!.replace('{minus}', '50'), exact).waitFor();
  expect(await listColumns27c(jose), 'cell columns at 320 px').toBe(2);
  // Кадр — після анімації появи щойно знайденої клітинки.
  await jose.waitForTimeout(300);
  await expectNoSideScroll(jose, 'timedlist27c-phone-es-320');
  expect(await listColumns27c(taras), 'cell columns at 360 px').toBe(2);
  await expectNoSideScroll(taras, 'timedlist27c-phone-360');

  // Сцена: лише лічильники; жодної назви пункту.
  for (const [name, count] of [['Оля', '3 / 8'], ['Тарас', '3 / 8'], ['Іра', '1 / 8'], ['Хосе', '1 / 8']] as const) {
    await expect.poll(() => listRow27c(stage, name).locator('.tag').first().textContent(), POLL).toBe(count);
  }
  await listRow27c(stage, 'Оля').getByText('Помилок: 1', exact).waitFor();
  const stageHtml = await stage.content();
  const stageSeen = stageFrames.join(NL);
  for (const hidden of ['Меркурій', 'Марс', 'Червона планета', 'Нептун', 'Юпітер']) {
    expect(stageHtml, `«${hidden}» in the stage DOM before the reveal`).not.toContain(hidden);
    expect(stageSeen, `«${hidden}» sent to the stage before the reveal`).not.toContain(hidden);
  }
  expect(tarasFrames.join(NL), 'Olya’s Mars sent to Taras').not.toContain('Марс');
  expect(tarasFrames.join(NL), 'a spelling sent to Taras').not.toContain('Червона планета');
  expect(await stage.locator('.timedlist-reveal').count(), 'the list on the stage before the reveal').toBe(0);
  await shot(stage, 'timedlist27c-stage-question');

  // Пульт: знахідки Олі наживо й увесь список.
  await host.locator('#live-answers').waitFor();
  await expect.poll(() => liveRow(host, 'Оля').innerText(), POLL).toContain('3 / 8');
  const olyaLive = await liveRow(host, 'Оля').innerText();
  for (const found of ['Юпітер', 'Венера', 'Марс']) expect(olyaLive, `«${found}» in Olya’s live row`).toContain(found);
  // Помилки словами, а не «−1», що читається як мінус бал.
  expect(olyaLive, 'mistakes in Olya’s live row').toContain('Помилок: 1');
  expect(olyaLive, 'a bare «−1» in Olya’s live row').not.toContain('−1');
  // Увесь список із номерами — у рядку правильної відповіді (панель списку ховається, поки є «Відповіді наживо», як у драбини).
  await host.getByText(`Правильна відповідь: ${PLANETS27C.map((text, at) => `${at + 1}. ${text}`).join(', ')}`, exact).waitFor();
  await shot(host, 'timedlist27c-host-live');

  // ── Закриття й розкриття: увесь список із тими, хто знайшов. ──
  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  await expect.poll(() => stage.locator('.timedlist-reveal > li').count(), POLL).toBe(8);
  expect(await stage.locator('.timedlist-reveal .timedlist-text').allTextContents()).toEqual(PLANETS27C);
  const jupiter = await listItem27c(stage, 'Юпітер').locator('.timedlist-finders').textContent();
  for (const name of ['Оля', 'Тарас', 'Іра', 'Хосе']) expect(jupiter, `${name} among the Jupiter finders`).toContain(name);
  expect(await listItem27c(stage, 'Юпітер').locator('.score').textContent()).toBe('+25');
  expect(await listItem27c(stage, 'Венера').locator('.timedlist-finders').textContent()).toBe('Знайшли: Оля, Тарас');
  expect(await listItem27c(stage, 'Венера').locator('.score').textContent()).toBe('+75');
  expect(await listItem27c(stage, 'Марс').locator('.timedlist-finders').textContent()).toBe('Знайшли: Оля');
  expect(await listItem27c(stage, 'Марс').locator('.score').textContent()).toBe('+100');
  expect(await listItem27c(stage, 'Меркурій').locator('.score').textContent()).toBe('+100');
  expect(await listItem27c(stage, 'Нептун').locator('.timedlist-finders').textContent()).toBe('Ніхто не знайшов');
  expect(await listItem27c(stage, 'Нептун').locator('.score').count()).toBe(0);
  // Спеллінги не потрапляють і на розкриття.
  expect(await stage.content(), 'a spelling on the reveal').not.toContain('Червона планета');
  for (const [name, points] of [['Оля', '+150'], ['Тарас', '+200'], ['Іра', '+25'], ['Хосе', '+25']] as const) {
    await expect.poll(() => listRow27c(stage, name).locator('.score').textContent(), POLL).toBe(points);
  }
  await scores(['150', '200', '25', '25']);
  await olya.locator('.timedlist-reveal > li.is-mine').first().waitFor();
  expect(await olya.locator('.timedlist-reveal > li.is-mine').count(), 'Olya’s own finds highlighted').toBe(3);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'timedlist27c-stage-reveal');
  const [height8, client8] = (await stage.evaluate('[document.documentElement.scrollHeight, document.documentElement.clientHeight]')) as [number, number];
  expect(height8, `the 8-item reveal with four players scrolls the stage (${height8} > ${client8})`).toBeLessThanOrEqual(client8);
  // Одна колонка: бали стоять поруч з назвами (одна спільна колонка за найдовшою назвою), «Знайшли: …» починається однаково в кожному рядку.
  const columnOf = (selector: string) => stage.locator(`.timedlist-reveal ${selector}`).evaluateAll((all) => [...new Set(all.map((el) => Math.round(el.getBoundingClientRect().left)))]);
  expect((await columnOf('.score')).length, 'item points in one column').toBe(1);
  expect((await columnOf('.timedlist-finders')).length, 'finders start in one column').toBe(1);
  const textRight = await stage.locator('.timedlist-reveal .timedlist-text').evaluateAll((all) => Math.max(...all.map((el) => el.getBoundingClientRect().right)));
  expect((await columnOf('.score'))[0] - textRight, 'item points next to the names').toBeLessThan(80);
  expect(await stage.getByText('Гравців: 4 · рідкісніше — дорожче', exact).count()).toBe(1);
  await shot(olya, 'timedlist27c-phone-reveal');
  // Частка «правильних» (знайшли все) для списку нічого не каже — рядка на телефоні немає.
  expect(await olya.getByText(/Правильно відповіли/).count(), 'the share line on a list reveal').toBe(0);
  await shot(jose, 'timedlist27c-phone-es-reveal');

  // ── Запитання 2 (без мінуса). ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await expect.poll(() => listCount27c(page).catch(() => ''), POLL).toBe('0 / 7');
  expect(await olya.getByText('Слово не зі списку', { exact: false }).count(), 'the minus note without a minus').toBe(0);
  await listType27c(olya, 'синій', { enter: false });
  await listType27c(olya, 'фіолетовй', { enter: false });
  await expect.poll(() => listCount27c(olya), POLL).toBe('2 / 7');
  await listType27c(olya, 'Плутон', { enter: true });
  await expect.poll(() => olya.locator('.timedlist-status').textContent(), POLL).toBe('Такого пункту немає в списку');
  expect(await olya.locator('.timedlist-minus-flash').count(), 'a minus with the minus off').toBe(0);
  expect(await olya.locator('.timedlist-wrong').count(), 'a mistake line with the minus off').toBe(0);
  await listType27c(taras, 'синій', { enter: true });
  await expect.poll(() => listCount27c(taras), POLL).toBe('1 / 7');
  expect(await listRow27c(stage, 'Оля').locator('.timedlist-wrong').count(), 'a mistake on the stage with the minus off').toBe(0);
  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  await expect.poll(() => listItem27c(stage, 'Синій').locator('.score').textContent(), POLL).toBe('+75');
  expect(await listItem27c(stage, 'Синій').locator('.timedlist-finders').textContent()).toBe('Знайшли: Оля, Тарас');
  expect(await listItem27c(stage, 'Фіолетовий').locator('.score').textContent()).toBe('+100');
  await expect.poll(() => listRow27c(stage, 'Оля').locator('.score').textContent(), POLL).toBe('+175');
  expect(await listRow27c(stage, 'Тарас').locator('.score').textContent()).toBe('+75');
  await scores(['325', '275', '25', '25']);

  // ── Історія гри. ──
  await toWinners27c(host, stage);
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Список 27c/ }).click();
  for (const [title, line] of [['Планети Сонячної системи', 'Знайдено 3 з 8 · помилок: 1'], ['Кольори веселки', 'Знайдено 2 з 7']] as const) {
    const question = host.locator('.rows.stacked > li', { hasText: title });
    await question.getByText(/Відповіді \(\d+\)/).click();
    await question.locator('.responses li', { hasText: 'Оля' }).getByText(line, exact).waitFor();
  }
  await shot(host, 'timedlist27c-history');

  expect(problems).toEqual([]);
}

const CITIES27C = ['Київ', 'Львів', 'Харків', 'Одеса', 'Дніпро', 'Вінниця', 'Полтава', 'Ужгород'];
/** 30 міст для перевірки, що розкриття на 30 пунктів уміщається на сцені 1600 × 900. */
const CITIES30_27C = [
  'Київ', 'Львів', 'Харків', 'Одеса', 'Дніпро', 'Запоріжжя', 'Вінниця', 'Полтава', 'Чернігів', 'Черкаси',
  'Житомир', 'Суми', 'Рівне', 'Луцьк', 'Тернопіль', 'Хмельницький', 'Ужгород', 'Чернівці', 'Івано-Франківськ', 'Кропивницький',
  'Миколаїв', 'Херсон', 'Кам’янець-Подільський', 'Білгород-Дністровський', 'Біла Церква', 'Кременчук', 'Мукачево', 'Умань', 'Ніжин', 'Дрогобич',
];

async function timedListTeams27c() {
  const host = await open('host27ct', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host27ct@example.com');
  const common = { imageUrl: null, video: null, timeLimit: 90, minus: null };
  const items = (texts: string[], prefix: string) => texts.map((text, at) => ({ id: `${prefix}${at + 1}`, text, accepted: [] as string[] }));
  const l1 = { ...common, id: 'l1', type: 'timedlist' as const, text: 'Обласні центри України', points: 100, items: items(CITIES27C, 'c') };
  const l2 = { ...common, id: 'l2', type: 'timedlist' as const, text: 'Міста України', points: 50, items: items(CITIES30_27C, 'm') };
  const round = classicRound('rt27c', [l1, l2] as never, { title: 'Команди 27c', speedBonus: false });
  const data = { ...makeRoundsQuiz([round], { leaderboard: 'each', teams: { count: 2, names: ['Червоні', 'Сині'] } }), title: 'Команди 27c' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Команди 27c' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage27ct', 1600, 900);
  await stage.goto(stageUrl);
  const olya = await open('olya27ct', 375, 812);
  const petro = await open('petro27ct', 375, 812);
  const ira = await open('ira27ct', 375, 812);
  const marko = await open('marko27ct', 375, 812);
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
  for (const page of phones) await listInput27c(page).waitFor();

  // Оля й Петро вводять різні міста — обидва лягають у спільний список Червоних.
  await listType27c(olya, 'Київ', { enter: true });
  await listType27c(petro, 'Харків', { enter: false });
  for (const page of [olya, petro]) await expect.poll(() => listCells27c(page), POLL).toEqual(['Київ', '', 'Харків', '', '', '', '', '']);
  // Петро вводить місто, яке вже знайшла Оля, — повтор.
  await listType27c(petro, 'київ', { enter: true });
  await expect.poll(() => petro.locator('.timedlist-status').textContent(), POLL).toBe('Цей пункт уже знайдено');
  expect(await listCount27c(petro)).toBe('2 / 8');
  // Іра (Сині) — Київ і Ужгород; Марко бачить їх, а знахідок Червоних — ні.
  await listType27c(ira, 'Київ', { enter: false });
  await listType27c(ira, 'Ужгород', { enter: true });
  await expect.poll(() => listCells27c(marko), POLL).toEqual(['Київ', '', '', '', '', '', '', 'Ужгород']);
  expect(markoFrames.join(NL), 'the Reds’ Kharkiv sent to Marko').not.toContain('Харків');
  await expect.poll(() => listRow27c(stage, 'Червоні').locator('.tag').first().textContent(), POLL).toBe('2 / 8');
  await expect.poll(() => listRow27c(stage, 'Сині').locator('.tag').first().textContent(), POLL).toBe('2 / 8');
  await petro.waitForTimeout(300);
  await shot(petro, 'timedlist27c-team-phone');

  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  await expect.poll(() => listItem27c(stage, 'Київ').locator('.score').textContent(), POLL).toBe('+50');
  const kyiv = await listItem27c(stage, 'Київ').locator('.timedlist-finders').textContent();
  for (const team of ['Червоні', 'Сині']) expect(kyiv, `${team} among the Kyiv finders`).toContain(team);
  expect(await listItem27c(stage, 'Харків').locator('.score').textContent()).toBe('+100');
  expect(await listItem27c(stage, 'Ужгород').locator('.score').textContent()).toBe('+100');
  await expect.poll(() => listRow27c(stage, 'Червоні').locator('.score').textContent(), POLL).toBe('+150');
  expect(await listRow27c(stage, 'Сині').locator('.score').textContent()).toBe('+150');
  // У командній грі N — це команди.
  await stage.getByText('Команд: 2 · рідкісніше — дорожче', exact).waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'timedlist27c-team-stage-reveal');

  // ── 30 пунктів: розкриття на сцені 1600 × 900 вміщається без прокрутки й без обрізаних назв. ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  await listInput27c(olya).waitFor();
  await expect.poll(() => listCount27c(olya), POLL).toBe('0 / 30');
  await listType27c(olya, 'Дрогобич', { enter: true });
  await listType27c(ira, 'Кам’янець-Подільський', { enter: true });
  await expect.poll(() => listCount27c(ira), POLL).toBe('1 / 30');
  await olya.waitForTimeout(300);
  await shot(olya, 'timedlist27c-phone-30');
  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  await expect.poll(() => stage.locator('.timedlist-reveal > li').count(), POLL).toBe(30);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'timedlist27c-stage-reveal-30');
  const [scroll, client] = (await stage.evaluate('[document.documentElement.scrollHeight, document.documentElement.clientHeight]')) as [number, number];
  expect(scroll, `the 30-item reveal scrolls the stage (${scroll} > ${client})`).toBeLessThanOrEqual(client);
  const columns = await stage.locator('.timedlist-reveal > li').evaluateAll((all) => new Set(all.map((li) => Math.round(li.getBoundingClientRect().left))).size);
  expect(columns, 'two columns for 30 items').toBe(2);
  const clipped = await stage.locator('.timedlist-reveal .timedlist-text').evaluateAll((all) => all.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
  expect(clipped, 'clipped item names').toEqual([]);

  expect(problems).toEqual([]);
}

it('part 27d: letter words — most words per word and per letter, the longest word from a random set, refusals and free repeats, a team list, only counts on the stage', async () => {
  try {
    await letterWordsGame27d();
    await letterWordsTeams27d();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

/** Поле вводу слова на телефоні. */
const lettersInput27d = (page: Page) => page.locator('.letterwords-form input');
/** Кнопка «Додати» (submit форми — і на іншій мові). */
const lettersAdd27d = (page: Page) => page.locator('.letterwords-form button[type="submit"]');

/** Вводить слово з клавіатури й тисне Enter. */
async function lettersType27d(page: Page, word: string) {
  await lettersInput27d(page).fill(word);
  await lettersInput27d(page).press('Enter');
}

/** Набирає слово плитками (по літері) і тисне «Додати». */
async function lettersTap27d(page: Page, word: string) {
  for (const letter of word) {
    const upper = letter.toLocaleUpperCase('uk');
    await page.locator('button.letterwords-tile:not([aria-disabled="true"])', { hasText: new RegExp(`^${upper}$`) }).first().click();
  }
  expect(await lettersInput27d(page).inputValue(), `tiles typed «${word}»`).toBe(word);
  await lettersAdd27d(page).click();
}

/** Літери плиток по порядку (малі); scope — де шукати (сцена: '.letterwords-stage'). */
const lettersTiles27d = (page: Page, scope = '') =>
  page.locator(`${scope} .letterwords-tiles .letterwords-tile`.trim()).evaluateAll((all) => all.map((el) => (el.textContent ?? '').toLocaleLowerCase('uk')));

/** Власні слова на телефоні (новіші зверху). */
const lettersMine27d = (page: Page) => page.locator('.letterwords-mine .letterwords-word').allTextContents();
/** Рядок причини під полем. */
const lettersStatus27d = (page: Page) => page.locator('.letterwords-status').textContent();
/** Рядок гравця (чи команди) на табло слів. */
const lettersRow27d = (page: Page, name: string) => page.locator('.letterwords-board li', { has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) });

/** Кількість літер слова: апостроф плитки не займає. */
const size27d = (word: string) => [...word.replace(/['’ʼ]/g, '')].length;
let dictionary27d: string[] | null = null;
/** Слова словника драбини, що складаються з набору (кожна плитка — один раз), за довжиною спадно, далі за абеткою. */
function formable27d(letters: string[]): string[] {
  dictionary27d ??= readFileSync(resolve(import.meta.dirname, '../data/wordladder-uk.txt'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  const have = new Map<string, number>();
  for (const l of letters) have.set(l, (have.get(l) ?? 0) + 1);
  return dictionary27d
    .filter((word) => {
      const need = new Map<string, number>();
      for (const l of word.replace(/['’ʼ]/g, '')) need.set(l, (need.get(l) ?? 0) + 1);
      return size27d(word) >= 3 && [...need].every(([l, n]) => (have.get(l) ?? 0) >= n);
    })
    .sort((a, b) => size27d(b) - size27d(a) || a.localeCompare(b, 'uk'));
}

/** Сцена 1600 × 900: без прокрутки вниз і вбік, жоден рядок слів і жодне найдовше слово не обрізано. */
async function expectLettersStageFits27d(stage: Page, name: string) {
  const [height, clientH, width, clientW] = (await stage.evaluate(
    '[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]',
  )) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const clipped = await stage
    .locator('.letterwords-board .letterwords-words, .letterwords-board .name, .letterwords-best .letterwords-word')
    .evaluateAll((all) => all.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
  expect(clipped, `${name}: clipped words`).toEqual([]);
}

async function letterWordsGame27d() {
  // ── Редактор: класичний раунд, три запитання — свій набір за слово, свій набір за літеру, випадковий набір на найдовше. ──
  const host = await open('host27d', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host27d@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Слова 27d');
  await click(host, 'слова з літер');
  await questionText(host).fill('Складіть якнайбільше слів');
  expect(await host.getByLabel('Відео з YouTube', exact).count(), 'letter words have no video').toBe(0);
  expect(await field(host, 'Скільки літер').inputValue(), 'a random set of 9 by default').toBe('9');
  await click(host, 'Свій набір');
  const checked = host.waitForResponse((response) => response.url().endsWith('/api/letterwords/check'));
  await field(host, 'Літери').fill('морквасті');
  expect((await checked).ok()).toBe(true);
  await host.locator('.letterwords-editor-check', { hasText: 'Складається слів:' }).waitFor();
  expect(await host.locator('.letterwords-editor-check').textContent()).toContain('комісар');
  // Добра новина — не попередження: рамка кольору «правильно», не червона.
  expect(await host.locator('.letterwords-editor-check').evaluate((el) => el.classList.contains('is-none')), 'the found words as a warning').toBe(false);
  expect(await field(host, 'Сума').inputValue(), 'the default sum per word').toBe('20');
  // Стеля балів: 20 × 10 слів.
  await host.getByText('За запитання — не більше 200 балів (це й ціна на табло); множник раунду й позначка клітинки її множать.', exact).waitFor();
  await field(host, 'Час, с').fill('90');
  await shot(host, 'letterwords27d-editor');

  await click(host, 'Додати запитання');
  await click(host, 'слова з літер');
  await questionText(host).fill('Кожна літера — бали');
  await click(host, 'Свій набір');
  // «abc» — не українські літери: збереження називає проблему.
  await field(host, 'Літери').fill('abc');
  await click(host, 'Зберегти');
  await host.getByText('Запитання 2: набір — від 4 до 12 українських літер.', exact).first().waitFor();
  await shot(host, 'letterwords27d-editor-problem');
  await field(host, 'Літери').fill('квітнесар');
  await click(host, 'За кожну літеру');
  await expect.poll(() => field(host, 'Сума').inputValue(), POLL).toBe('10');
  await field(host, 'Час, с').fill('60');

  await click(host, 'Додати запитання');
  await click(host, 'слова з літер');
  await questionText(host).fill('Найдовше слово');
  await field(host, 'Скільки літер').fill('9');
  await click(host, 'Найдовше слово');
  expect(await host.getByRole('button', { name: 'За кожне слово', ...exact }).isDisabled(), 'per word with the longest goal').toBe(true);
  expect(await host.getByRole('button', { name: 'За кожну літеру', ...exact }).getAttribute('aria-pressed')).toBe('true');
  await field(host, 'Сума').fill('10');
  await field(host, 'Час, с').fill('60');
  await shot(host, 'letterwords27d-editor-longest');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Слова 27d' }).waitFor();
  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Слова 27d')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { type: string; questions: Record<string, unknown>[] }[] };
  expect(stored.rounds[0]!.type).toBe('classic');
  const [q1, q2, q3] = stored.rounds[0]!.questions;
  expect(q1).toMatchObject({ type: 'letterwords', set: { kind: 'fixed', letters: 'морквасті' }, goal: 'most', per: 'word', points: 20, timeLimit: 90, video: null });
  expect(q2).toMatchObject({ type: 'letterwords', set: { kind: 'fixed', letters: 'квітнесар' }, goal: 'most', per: 'letter', points: 10, timeLimit: 60 });
  expect(q3).toMatchObject({ type: 'letterwords', set: { kind: 'random', count: 9 }, goal: 'longest', per: 'letter', points: 10, timeLimit: 60 });

  // ── Гра: сцена 1600 × 900; Оля 375 × 812, Тарас 360 × 740, Хосе 320 × 640 (es). ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage27d', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya27d', 375, 812);
  const taras = await open('taras27d', 360, 740);
  const tarasFrames = socketFrames(taras);
  const jose = await open('jose27d', 320, 640, { locale: 'es-ES' });
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
  for (const page of phones) await lettersInput27d(page).waitFor();

  // ── Запитання 1: «морквасті», якнайбільше, 20 за слово. ──
  const MORKVA = ['м', 'о', 'р', 'к', 'в', 'а', 'с', 'т', 'і'];
  await stage.getByText('Складайте слова на телефоні', exact).waitFor();
  expect(await lettersTiles27d(stage, '.letterwords-stage')).toEqual(MORKVA);
  for (const page of phones) expect(await lettersTiles27d(page)).toEqual(MORKVA);

  // Оля: дві плитки в полі — вони бліді, «Додати» ще неактивна.
  for (const letter of 'кі') await olya.locator('button.letterwords-tile', { hasText: new RegExp(`^${letter.toLocaleUpperCase('uk')}$`) }).click();
  expect(await olya.locator('button.letterwords-tile[aria-disabled="true"]').count(), 'used tiles').toBe(2);
  expect(await lettersAdd27d(olya).isDisabled(), 'Add with two letters').toBe(true);
  await shot(olya, 'letterwords27d-phone-tiles');
  await olya.getByRole('button', { name: 'Очистити', ...exact }).click();
  // «кіт» плитками.
  await lettersTap27d(olya, 'кіт');
  await olya.locator('.letterwords-mine h2').getByText('Ваші слова: 1', exact).waitFor();
  expect(await lettersInput27d(olya).inputValue(), 'the field after an accepted word').toBe('');
  expect(await lettersMine27d(olya)).toEqual(['кіт']);
  // Повтор з клавіатури великими — без кари, лічильник той самий.
  await lettersType27d(olya, 'КІТ');
  await expect.poll(() => lettersStatus27d(olya), POLL).toBe('Це слово вже є у списку');
  await olya.locator('.letterwords-mine li.is-again').waitFor({ timeout: 2000 }).catch(() => undefined);
  await shot(olya, 'letterwords27d-phone-repeat');
  expect(await lettersMine27d(olya)).toEqual(['кіт']);
  // Не з набору: «молоко» потребує трьох «о».
  await lettersType27d(olya, 'молоко');
  await expect.poll(() => lettersStatus27d(olya), POLL).toBe('Це слово не складається з літер набору');
  expect(await lettersInput27d(olya).inputValue(), 'a refused word stays in the field').toBe('молоко');
  await olya.waitForTimeout(350);
  await shot(olya, 'letterwords27d-phone-refused');
  await lettersType27d(olya, 'ворк');
  await expect.poll(() => lettersStatus27d(olya), POLL).toBe('Немає такого іменника в словнику');
  await lettersInput27d(olya).fill('ро');
  expect(await lettersAdd27d(olya).isDisabled(), 'Add with two letters').toBe(true);
  await lettersType27d(olya, 'сік');
  await expect.poll(() => lettersMine27d(olya), POLL).toEqual(['сік', 'кіт']);
  await lettersType27d(olya, 'морква');
  await expect.poll(() => lettersMine27d(olya), POLL).toEqual(['морква', 'сік', 'кіт']);
  await olya.locator('.letterwords-mine h2').getByText('Ваші слова: 3', exact).waitFor();
  await olya.waitForTimeout(300);
  await shot(olya, 'letterwords27d-phone-words');

  // Тарас: перемішані плитки — той самий набір; «рот» і «сом».
  await taras.getByRole('button', { name: 'Перемішати', ...exact }).click();
  expect([...(await lettersTiles27d(taras))].sort(), 'the shuffled set').toEqual([...MORKVA].sort());
  await lettersType27d(taras, 'рот');
  await expect.poll(() => lettersMine27d(taras), POLL).toEqual(['рот']);
  await lettersType27d(taras, 'сом');
  await expect.poll(() => lettersMine27d(taras), POLL).toEqual(['сом', 'рот']);
  // Хосе (es, 320): «ставок» з клавіатури; 9 плиток без прокрутки вбік.
  await lettersType27d(jose, 'ставок');
  await expect.poll(() => lettersMine27d(jose), POLL).toEqual(['ставок']);
  expect(await jose.locator('button.letterwords-tile').count()).toBe(9);
  const joseTile = (await jose.locator('button.letterwords-tile').first().boundingBox())!;
  expect(joseTile.width, 'a tile wide enough for a finger at 320 px').toBeGreaterThanOrEqual(40);
  expect(joseTile.height, 'a tile tall enough for a finger at 320 px').toBeGreaterThanOrEqual(40);
  await jose.waitForTimeout(300);
  await expectNoSideScroll(jose, 'letterwords27d-phone-es-320');
  await expectNoSideScroll(taras, 'letterwords27d-phone-360');

  // Сцена: лише кількість слів; ні слів, ні найдовших можливих.
  for (const [name, count] of [['Оля', 'Слів: 3'], ['Тарас', 'Слів: 2'], ['Хосе', 'Слів: 1']] as const) {
    await expect.poll(() => lettersRow27d(stage, name).locator('.tag').first().textContent(), POLL).toBe(count);
  }
  const stageHtml = await stage.content();
  const stageSeen = stageFrames.join(NL);
  for (const hidden of ['морква', 'комісар', 'самотік', 'ставок']) {
    expect(stageHtml, `«${hidden}» in the stage DOM before the reveal`).not.toContain(hidden);
    expect(stageSeen, `«${hidden}» sent to the stage before the reveal`).not.toContain(hidden);
  }
  expect(tarasFrames.join(NL), 'Olya’s word sent to Taras').not.toContain('морква');
  expect(tarasFrames.join(NL), 'the best words sent to Taras').not.toContain('комісар');
  expect(await stage.locator('.letterwords-best').count(), 'the best words on the stage before the reveal').toBe(0);
  await shot(stage, 'letterwords27d-stage-question');

  // Пульт: слова Олі наживо й найдовші можливі.
  await host.locator('#live-answers').waitFor();
  await expect.poll(() => liveRow(host, 'Оля').innerText(), POLL).toContain('Слів: 3');
  const olyaLive = await liveRow(host, 'Оля').innerText();
  for (const word of ['кіт', 'сік', 'морква']) expect(olyaLive, `«${word}» in Olya’s live row`).toContain(word);
  await host.getByText('комісар').first().waitFor();
  await shot(host, 'letterwords27d-host-live');

  // ── Розкриття: найкращі слова кожного, бали, найдовші можливі. ──
  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  for (const [name, points] of [['Оля', '+60'], ['Тарас', '+40'], ['Хосе', '+20']] as const) {
    await expect.poll(() => lettersRow27d(stage, name).locator('.score').textContent(), POLL).toBe(points);
  }
  const olyaTop = await lettersRow27d(stage, 'Оля').locator('.letterwords-words').textContent();
  for (const word of ['морква', 'кіт', 'сік']) expect(olyaTop, `«${word}» among Olya’s best`).toContain(word);
  expect(await stage.locator('.letterwords-best .letterwords-word').allTextContents()).toEqual(['комісар', 'самотік']);
  await stage.getByText(/^Усього слів у наборі: \d+$/).waitFor();
  await scores(['60', '40', '20']);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'letterwords27d-stage-reveal');
  await expectLettersStageFits27d(stage, 'q1 reveal');
  await olya.locator('.letterwords-board li.is-mine').waitFor();
  await olya.locator('.letterwords-best').waitFor();
  // Правильно — лише найкращий результат; менше слів — «частково».
  expect(await olya.locator('.result > h2').textContent(), 'Olya with the most words').toBe('Правильно!');
  expect(await taras.locator('.result > h2').textContent(), 'Taras with fewer words').toBe('Частково правильно');
  expect(await jose.locator('.result > h2').textContent(), 'Jose with one word').toBe('Correcto en parte');
  await shot(olya, 'letterwords27d-phone-reveal');
  await shot(jose, 'letterwords27d-phone-es-reveal');

  // ── Запитання 2: «квітнесар», 10 за кожну літеру. ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await expect.poll(() => lettersTiles27d(page).catch(() => []), POLL).toEqual(['к', 'в', 'і', 'т', 'н', 'е', 'с', 'а', 'р']);
  await lettersType27d(olya, 'сітка');
  await expect.poll(() => lettersMine27d(olya), POLL).toEqual(['сітка']);
  await lettersType27d(olya, 'рік');
  await expect.poll(() => lettersMine27d(olya), POLL).toEqual(['рік', 'сітка']);
  await lettersType27d(taras, 'верстак');
  await expect.poll(() => lettersMine27d(taras), POLL).toEqual(['верстак']);
  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  await expect.poll(() => lettersRow27d(stage, 'Оля').locator('.score').textContent(), POLL).toBe('+80');
  expect(await lettersRow27d(stage, 'Тарас').locator('.score').textContent()).toBe('+70');
  // Без слів — без запису: нуль балів, «Слів: 0».
  expect(await lettersRow27d(stage, 'Хосе').locator('.score').textContent(), 'points for Jose without words').toBe('0');
  expect(await lettersRow27d(stage, 'Хосе').locator('.tag').first().textContent()).toBe('Слів: 0');
  // Найдовші можливі — два перші за абеткою серед семилітерних (верстак і кентавр серед них не перші).
  expect(await stage.locator('.letterwords-best .letterwords-word').allTextContents()).toEqual(formable27d([...'квітнесар']).slice(0, 2));
  await scores(['140', '110', '20']);
  // Без слів — картка «неправильно»: заголовок найдовших слів не стає другим вердиктом (без «✗»).
  await jose.locator('.result .letterwords-best h2').waitFor();
  expect(await jose.locator('.result .letterwords-best h2').evaluate((el) => getComputedStyle(el, '::before').content), 'a ✗ before the best words title').toBe('none');
  await shot(jose, 'letterwords27d-phone-es-wrong');

  // ── Запитання 3: випадковий набір з 9 літер, найдовше слово, 10 за літеру. ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  await lettersInput27d(olya).waitFor();
  await expect.poll(() => lettersTiles27d(stage, '.letterwords-stage').then((tiles) => tiles.join('')), POLL).not.toBe('квітнесар');
  const random = await lettersTiles27d(stage, '.letterwords-stage');
  expect(random, 'nine random tiles').toHaveLength(9);
  for (const page of phones) await expect.poll(() => lettersTiles27d(page), POLL).toEqual(random);
  const words = formable27d(random);
  expect(words.length, `a word in the random set ${random.join('')}`).toBeGreaterThan(0);
  const w1 = words[0]!;
  const w2 = words.find((word) => size27d(word) < size27d(w1));
  expect(w2, `a shorter word in ${random.join('')}`).toBeDefined();
  const short = words.find((word) => size27d(word) === 3 && word !== w1);
  await lettersType27d(olya, w1);
  await expect.poll(() => lettersMine27d(olya), POLL).toEqual([w1]);
  if (short !== undefined) {
    await lettersType27d(olya, short);
    await expect.poll(() => lettersMine27d(olya), POLL).toEqual([short, w1]);
  }
  await lettersType27d(taras, w2!);
  await expect.poll(() => lettersMine27d(taras), POLL).toEqual([w2]);
  await expect.poll(() => lettersRow27d(stage, 'Оля').locator('.tag').first().textContent(), POLL).toBe(`Слів: ${short === undefined ? 1 : 2}`);
  expect(stageFrames.join(NL), `«${w1}» sent to the stage before the reveal`).not.toContain(`"${w1}"`);
  await shot(stage, 'letterwords27d-stage-random-question');
  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  await expect.poll(() => lettersRow27d(stage, 'Оля').locator('.score').textContent(), POLL).toBe(`+${10 * size27d(w1)}`);
  expect(await lettersRow27d(stage, 'Тарас').locator('.score').textContent()).toBe(`+${10 * size27d(w2!)}`);
  expect(await lettersRow27d(stage, 'Оля').locator('.letterwords-words').textContent(), 'only the longest word in Olya’s row').toBe(w1);
  const best = await stage.locator('.letterwords-best .letterwords-word').allTextContents();
  expect(best.some((word) => size27d(word) === size27d(w1)), `a longest possible word of ${size27d(w1)} letters among ${best.join(', ')}`).toBe(true);
  await scores([`${140 + 10 * size27d(w1)}`, `${110 + 10 * size27d(w2!)}`, '20']);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'letterwords27d-stage-random-reveal');
  await expectLettersStageFits27d(stage, 'q3 reveal');

  // ── Історія гри: «Слів: 3 · найдовше: 6 літ.» у Олі на першому запитанні. ──
  await toWinners27c(host, stage);
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Слова 27d/ }).click();
  const first = host.locator('.rows.stacked > li', { hasText: 'Складіть якнайбільше слів' });
  await first.getByText(/Відповіді \(\d+\)/).click();
  await first.locator('.responses li', { hasText: 'Оля' }).getByText('Слів: 3 · найдовше: 6 літ.', exact).waitFor();
  // Зараховано лише найкращому: Оля.
  await first.getByText('відповіли 3, правильно 1', exact).waitFor();
  expect(await first.locator('.responses li.is-correct').count(), 'accepted rows of the first question').toBe(1);
  await first.locator('.responses li.is-correct', { hasText: 'Оля' }).waitFor();
  // Випадковий набір в історії: роздані літери й найдовші можливі.
  const third = host.locator('.rows.stacked > li').filter({ has: host.locator('.letterwords-history') }).last();
  await third.getByText(`Набір: ${random.map((letter) => letter.toLocaleUpperCase('uk')).join(' ')}`, exact).waitFor();
  await third.getByText(`Найдовші можливі: ${best.join(', ')}`, exact).waitFor();
  await shot(host, 'letterwords27d-history');

  expect(problems).toEqual([]);
}

async function letterWordsTeams27d() {
  const host = await open('host27dt', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host27dt@example.com');
  const common = { imageUrl: null, video: null, timeLimit: 90, type: 'letterwords' as const, goal: 'most' as const, per: 'word' as const, points: 20 };
  const l1 = { ...common, id: 'w1', text: 'Слова з набору', set: { kind: 'fixed' as const, letters: 'морквасті' } };
  const l2 = { ...common, id: 'w2', text: 'Дванадцять літер', set: { kind: 'random' as const, count: 12 } };
  const round = classicRound('rt27d', [l1, l2] as never, { title: 'Команди 27d', speedBonus: false });
  const data = { ...makeRoundsQuiz([round], { leaderboard: 'each', teams: { count: 2, names: ['Червоні', 'Сині'] } }), title: 'Команди 27d' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Команди 27d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage27dt', 1600, 900);
  await stage.goto(stageUrl);
  const olya = await open('olya27dt', 375, 812);
  const petro = await open('petro27dt', 375, 812);
  const ira = await open('ira27dt', 375, 812);
  // Марко — найвужчий телефон: на ньому 12 плиток.
  const marko = await open('marko27dt', 320, 640);
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
  for (const page of phones) await lettersInput27d(page).waitFor();

  // Оля й Петро — один список Червоних.
  await lettersType27d(olya, 'острів');
  await expect.poll(() => lettersMine27d(olya), POLL).toEqual(['острів']);
  await lettersType27d(petro, 'ставок');
  for (const page of [olya, petro]) await expect.poll(() => lettersMine27d(page), POLL).toEqual(['ставок', 'острів']);
  // Петро — слово, яке вже додала Оля: повтор.
  await lettersType27d(petro, 'острів');
  await expect.poll(() => lettersStatus27d(petro), POLL).toBe('Це слово вже є у списку');
  expect((await lettersMine27d(petro)).length).toBe(2);
  // Іра (Сині) — «кіт»; Марко бачить його, а слів Червоних — ні.
  await lettersType27d(ira, 'кіт');
  await expect.poll(() => lettersMine27d(marko), POLL).toEqual(['кіт']);
  expect(markoFrames.join(NL), 'the Reds’ word sent to Marko').not.toContain('острів');
  await expect.poll(() => lettersRow27d(stage, 'Червоні').locator('.tag').first().textContent(), POLL).toBe('Слів: 2');
  await expect.poll(() => lettersRow27d(stage, 'Сині').locator('.tag').first().textContent(), POLL).toBe('Слів: 1');
  await petro.waitForTimeout(300);
  await shot(petro, 'letterwords27d-team-phone');

  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  await expect.poll(() => lettersRow27d(stage, 'Червоні').locator('.score').textContent(), POLL).toBe('+40');
  expect(await lettersRow27d(stage, 'Сині').locator('.score').textContent()).toBe('+20');
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'letterwords27d-team-stage-reveal');
  await expectLettersStageFits27d(stage, 'team reveal');

  // ── 12 випадкових літер: на 320 px — два ряди плиток без прокрутки вбік; на сцені — довгі слова без обрізання. ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  await expect.poll(() => lettersTiles27d(marko).then((tiles) => tiles.length).catch(() => 0), POLL).toBe(12);
  const twelve = await lettersTiles27d(marko);
  expect(await lettersTiles27d(stage, '.letterwords-stage')).toEqual(twelve);
  const rows = await marko.locator('button.letterwords-tile').evaluateAll((all) => new Set(all.map((el) => Math.round(el.getBoundingClientRect().top))).size);
  expect(rows, 'tile rows for 12 letters at 320 px').toBeLessThanOrEqual(2);
  const tile = (await marko.locator('button.letterwords-tile').first().boundingBox())!;
  expect(tile.width, 'a tile wide enough for a finger at 320 px').toBeGreaterThanOrEqual(40);
  const words = formable27d(twelve);
  expect(words.length, `words in ${twelve.join('')}`).toBeGreaterThanOrEqual(7);
  const reds = words.slice(0, 5);
  const blues = [words[0]!, ...words.slice(5, 7)];
  for (const [at, word] of reds.entries()) {
    await lettersType27d(olya, word);
    await expect.poll(() => lettersMine27d(olya).then((mine) => mine.length), POLL).toBe(at + 1);
  }
  for (const [at, word] of blues.entries()) {
    await lettersType27d(ira, word);
    await expect.poll(() => lettersMine27d(ira).then((mine) => mine.length), POLL).toBe(at + 1);
  }
  await expect.poll(() => lettersMine27d(marko).then((mine) => mine.length), POLL).toBe(blues.length);
  await lettersInput27d(marko).fill(words.at(-1)!);
  await marko.waitForTimeout(300);
  await expectNoSideScroll(marko, 'letterwords27d-phone-320-12');
  await step27a(host, 'Закрити запитання');
  await step27a(host, 'Показати відповідь');
  await expect.poll(() => lettersRow27d(stage, 'Червоні').locator('.score').textContent(), POLL).toBe(`+${20 * reds.length}`);
  expect(await lettersRow27d(stage, 'Сині').locator('.score').textContent()).toBe(`+${20 * blues.length}`);
  await lettersRow27d(stage, 'Червоні').getByText(`ще ${reds.length - 3}`, exact).waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'letterwords27d-team-stage-reveal-12');
  await expectLettersStageFits27d(stage, '12-letter reveal');
  await shot(marko, 'letterwords27d-phone-320-12-reveal');

  expect(problems).toEqual([]);
}
