import { boardRound, classicRound, makeRoundsQuiz, order, single, withId, withPoints } from '@quiz/engine/testing';
import { DEFAULT_RULES } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, field, questionText, seconds, join, openRoundSettings, expectNoSideScroll, register, POLL, socketFrames, pickOption, RESTARTING_TEXT, pickTeamOn, stageTeam, sleep, frame, label, step27a, toWinners27c, PAIRS28A_TEAM, moreLess28a, morelessRun28a, reveal28a } from './helpers/common';
import { exact, ctx, base, problems, pages, snapshot, afterSplash, shot, restart, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 29i (більше чи менше на табло), 29h (невидимка), 29g (квест).
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 29i: more or less on a board cell — the stage and the other phone see who chooses, the pair and the picks', async () => {
  try {
    await morelessWatch29i();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 300_000);

async function morelessWatch29i() {
  const host = await open('host29i', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', `host29i-${Date.now()}@example.com`);
  const plain = (id: string, text: string, points: number) => ({ ...withPoints(withId(single, id), points), text, timeLimit: 30 });
  const cell = moreLess28a('w1', 'Пари для Олі', PAIRS28A_TEAM, 60);
  const round = boardRound(
    'r29i',
    [
      { title: 'Порівняння', cells: [cell as never, plain('w12', 'Порівняння за 200?', 200), plain('w13', 'Порівняння за 400?', 400)] },
      { title: 'Міста', cells: [plain('w21', 'Місто за 100?', 100), plain('w22', 'Місто за 200?', 200), plain('w23', 'Місто за 300?', 300)] },
      { title: 'Річки', cells: [plain('w31', 'Річка за 100?', 100), plain('w32', 'Річка за 200?', 200), plain('w33', 'Річка за 300?', 300)] },
    ],
    { title: 'Поле 29i' },
  );
  const data = { ...makeRoundsQuiz([round], { leaderboard: 'end' }), title: 'Поле 29i' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Поле 29i' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29i', 1600, 900);
  await stage.goto(stageUrl);
  const olya = await open('olya29i', 375, 812);
  const taras = await open('taras29i', 360, 740);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await stage.getByText('Тарас').waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage, olya, taras);
  await click(host, 'За порядком приєднання');
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, olya, taras);

  await olya.getByText('Ваш хід: виберіть клітинку').waitFor();
  await olya.getByRole('button', { name: 'Порівняння, 300', ...exact }).click();
  await olya.locator('button.moreless-option').first().waitFor();
  for (const [name, page] of [['stage', stage], ['phone', taras]] as const) {
    await page.locator('.moreless-watch').waitFor();
    await expect.poll(() => page.locator('.moreless-watch-chooser').textContent(), POLL).toBe('Вибирає Оля');
    expect(await page.locator('button.moreless-option').count(), `buttons for a viewer on the ${name}`).toBe(0);
  }
  await morelessRun28a(olya, PAIRS28A_TEAM, ['a']);
  await expect.poll(() => taras.locator('.moreless-watch-picks li').count(), POLL).toBe(1);
  await expect.poll(() => stage.locator('.moreless-watch-picks li').count(), POLL).toBe(1);
  expect(await stage.locator('.moreless-watch').textContent()).not.toMatch(/[✓✗]/);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'moreless29i-watch-stage');
  await shot(taras, 'moreless29i-watch-phone');
  await expectNoSideScroll(taras, 'moreless29i-watch-phone-360');
  expect(problems).toEqual([]);
}

it('part 29h: stealth — turned on silently from the debuff sheet at 320 px, the next purchase is anonymous on the stage, the host and every phone, the second purchase is named, the history shows the buyer after the game', async () => {
  try {
    await stealthGame29h();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 29h: stealth in teams — the captain turns it on, the whole team sees the mark, the rivals see nothing, a restart keeps it, the attack is anonymous, 320 px', async () => {
  try {
    await stealthTeams29h();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

/** Два класичні раунди по два запитання (≥ 25 с), баф «Прихований напад», дебафи «Туман» і «Тремтіння» по 200. */
function stealthQuiz29h(title: string, teams: boolean) {
  const options = [...single.options, { id: 'd', text: 'Харків' }];
  const questions = (from: number) =>
    [from, from + 1].map((n) => ({ ...withId(single, `s${n}`), options, text: `Запитання ${n}: столиця України?`, points: 500, timeLimit: 30 }));
  return {
    ...makeRoundsQuiz([classicRound('sr1', questions(1), { speedBonus: false, shuffleOptions: false }), classicRound('sr2', questions(3), { speedBonus: false, shuffleOptions: false })], {
      leaderboard: 'each',
      buffs: ['stealth'],
      debuffs: ['fog', 'shake'],
      ...(teams ? { teams: { count: 2, names: ['Соняшники', 'Маки'] } } : {}),
    }),
    title,
  };
}

/** Де кадри називають покупця в полях дебафу: notice.buyer, me.debuff.by, players[].debuff.by. */
function buyerNamed29h(frames: string[], names: string[]): string[] {
  const found: string[] = [];
  const walk = (value: unknown, key: string, parent: string): void => {
    if (Array.isArray(value)) return value.forEach((item) => walk(item, key, parent));
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'string' && ((key === 'by' && parent === 'debuff') || key === 'buyer') && names.includes(value)) found.push(`${parent}.${key}=${value}`);
      return;
    }
    for (const [k, v] of Object.entries(value)) {
      if (key === 'buyer' && (k === 'id' || k === 'nickname') && typeof v === 'string' && names.includes(v)) found.push(`buyer.${k}=${v}`);
      walk(v, k, key);
    }
  };
  for (const frame of frames) {
    const at = frame.indexOf('[');
    if (at < 0) continue;
    try {
      walk(JSON.parse(frame.slice(at)), '', '');
    } catch {
      /* не JSON */
    }
  }
  return found;
}

/** Жоден з кадрів не називає покупця в полях дебафу (і кадри були). */
function noBuyer29h(frames: string[], names: string[], who: string) {
  expect(frames.length, `${who}: frames to check`).toBeGreaterThan(0);
  expect(buyerNamed29h(frames, names), `${who}: a frame names the buyer`).toEqual([]);
}

const stealthSheet29h = (page: Page) => page.getByRole('dialog', { name: 'Дебафи для суперників' });
const stealthNotice29h = (page: Page) => page.locator('.live-notice.is-debuff');

async function openShop29h(page: Page) {
  await page.getByRole('button', { name: 'Дебафи', ...exact }).click();
  await stealthSheet29h(page).waitFor();
}

async function buy29h(page: Page, debuff: RegExp, target: string, cost: number) {
  await openShop29h(page);
  await stealthSheet29h(page).locator('.shop-item', { hasText: debuff }).click();
  await stealthSheet29h(page).locator('.shop-target', { hasText: target }).click();
  await stealthSheet29h(page).getByRole('button', { name: `Купити за ${cost}`, ...exact }).click();
  await stealthSheet29h(page).waitFor({ state: 'detached' });
}

async function answer29h(page: Page) {
  await page.getByRole('button', { name: /Київ/ }).click();
  await page.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
}

/** Кнопка пульта: перша доступна з переліку. */
async function advance29h(host: Page, names: string[]) {
  for (const until = Date.now() + 20_000; Date.now() < until; await sleep(200)) {
    for (const name of names) {
      const button = host.getByRole('button', { name, ...exact });
      if ((await button.count()) > 0 && (await button.isEnabled())) return void (await button.click());
    }
  }
  throw new Error(`no ${names.join(' / ')} on the host`);
}

/** Дія, після якої за секунду жоден із цих екранів не отримує кадру. */
async function quiet29h(pages: [string, string[]][], act: () => Promise<void>) {
  const before = pages.map(([, frames]) => frames.length);
  await act();
  await sleep(1000);
  pages.forEach(([who, frames], i) => expect(frames.slice(before[i]), `${who}: frames after the toggle`).toEqual([]));
}

/** Позначка власника: один рядок, у межах екрана, без горизонтальної прокрутки. */
async function expectMark29h(page: Page, name: string) {
  const mark = page.locator('.stealth-mark');
  await mark.getByText('🥷 Наступний напад анонімний', exact).waitFor();
  const box = (await mark.boundingBox())!;
  expect(box.height, `${name}: the mark is one line`).toBeLessThan(30);
  expect(box.x + box.width, `${name}: the mark fits the screen`).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 0.5);
  await expectNoSideScroll(page, name);
}

async function stealthGame29h() {
  const host = await open('host29h', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host29h@example.com');
  const TITLE = 'Прихований напад 29h';
  const saved = await host.request.post(`${base}/api/quizzes`, { data: stealthQuiz29h(TITLE, false) });
  expect(saved.ok(), await saved.text()).toBe(true);
  const stage = await open('stage29h', 1600, 900);
  const stageFrames = socketFrames(stage);
  const hostFrames = socketFrames(host);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: TITLE }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  await stage.goto(stageUrl);
  const olya = await open('olya29h', 320, 568, { hasTouch: true, isMobile: true });
  const petro = await open('petro29h', 375, 812);
  const taras = await open('taras29h', 360, 740);
  const petroFrames = socketFrames(petro);
  const tarasFrames = socketFrames(taras);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(taras, code, 'Тарас', false);
  await stage.getByText('Тарас').waitFor();
  const phones = [olya, petro, taras];
  const all = [stage, host, ...phones];
  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  const rowScore = async (nickname: string) => (await row(nickname).locator('.score').textContent())!;
  const headerScore = (page: Page) => page.locator('header.bar .score');

  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await petro.locator('h1', { hasText: 'Запитання 1:' }).waitFor();
  await afterSplash(...all);
  for (const page of phones) await answer29h(page);
  await click(host, 'Показати відповідь');
  for (const page of phones) await page.getByText('Правильно!').waitFor();
  await click(host, 'Далі');
  await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();
  await headerScore(olya).getByText('500', exact).waitFor();
  expect(await olya.locator('.stealth-mark').count(), 'no mark before it is on').toBe(0);

  // ── Увімкнення: аркуш «😈», рядок «Прихований напад» на 320 px; ніхто, крім Олі, не отримує жодного кадру. ──
  await openShop29h(olya);
  const stealthRow = stealthSheet29h(olya).locator('.shop-stealth');
  await stealthRow.getByText(/Прихований напад/).first().waitFor();
  const turnOn = stealthRow.getByRole('button', { name: 'Увімкнути', ...exact });
  const rowBox = (await stealthRow.boundingBox())!;
  const buttonBox = (await turnOn.boundingBox())!;
  expect(buttonBox.x + buttonBox.width, 'the toggle stays inside the row').toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
  expect(rowBox.x + rowBox.width, 'the row stays on the 320 px screen').toBeLessThanOrEqual(320.5);
  await expectNoSideScroll(olya, 'stealth29h-sheet-off-320');
  await quiet29h(
    [
      ['stage', stageFrames],
      ['host', hostFrames],
      ['Петро', petroFrames],
      ['Тарас', tarasFrames],
    ],
    async () => {
      await turnOn.click();
      await stealthRow.getByText('🥷 Наступний напад анонімний', exact).waitFor();
    },
  );
  await shot(olya, 'stealth29h-sheet-320');
  await expectNoSideScroll(olya, 'stealth29h-sheet-on-320');
  expect(await stealthSheet29h(olya).locator('.shop-item').count(), 'the debuff list is intact').toBe(2);
  await olya.keyboard.press('Escape');
  await stealthSheet29h(olya).waitFor({ state: 'detached' });
  await expectMark29h(olya, 'stealth29h-mark-320');
  for (const page of [petro, taras, stage, host]) expect(await page.locator('body').innerText(), 'the mark is the owner’s only').not.toContain('Наступний напад анонімний');

  // ── Покупка «Туману» для Петра: бали не рухаються до розкриття, усі називають покупця «Хтось». ──
  const from = [stageFrames.length, hostFrames.length, petroFrames.length, tarasFrames.length];
  await buy29h(olya, /Туман/, 'Петро', 200);
  for (const page of [stage, host, taras]) await stealthNotice29h(page).getByText('Хтось насилає дебаф на гравця Петро', exact).waitFor();
  for (const page of [stage, host, taras]) expect(await stealthNotice29h(page).textContent()).not.toContain('Оля');
  expect(await stealthNotice29h(petro).count(), 'the victim gets no purchase notice').toBe(0);
  expect(await olya.locator('.stealth-mark').count(), 'the mark is spent').toBe(0);
  await headerScore(olya).getByText('500', exact).waitFor();
  expect(await rowScore('Оля'), 'the price waits for the reveal').toBe('500');
  await openShop29h(olya);
  await stealthSheet29h(olya).locator('.shop-stealth').getByText('Використано', exact).waitFor();
  expect(await stealthSheet29h(olya).locator('.shop-stealth button').isDisabled()).toBe(true);
  await expectNoSideScroll(olya, 'stealth29h-sheet-used-320');
  await olya.keyboard.press('Escape');
  await stealthSheet29h(olya).waitFor({ state: 'detached' });
  await stage.waitForTimeout(300);
  await shot(stage, 'stealth29h-stage-notice');
  await row('Петро').locator('.debuff-tag').getByText('🌫️ Туман від когось · чекає', exact).waitFor();
  expect(await row('Петро').locator('.debuff-tag').textContent()).not.toContain('Оля');
  await row('Петро').getByRole('button', { name: 'Дебаф', ...exact }).click();
  await row('Петро').locator('.player-tools').waitFor();
  expect(await host.getByRole('button', { name: 'Скасувати дебаф', ...exact }).count(), 'an anonymous debuff cannot be cancelled').toBe(0);
  await shot(host, 'stealth29h-host-tag');

  // ── Запитання 2: Петро бачить «Хтось насилає на вас: Туман»; ціна списується на розкритті. ──
  await click(host, 'Наступне запитання');
  await petro.locator('h1', { hasText: 'Запитання 2:' }).waitFor();
  await petro.getByText('Хтось насилає на вас: Туман', exact).waitFor();
  expect(await petro.locator('.debuff-banner').textContent()).not.toContain('Оля');
  await shot(petro, 'stealth29h-victim-375');
  await afterSplash(...all);
  for (const page of [olya, taras]) await answer29h(page);
  expect(await rowScore('Оля'), 'still no charge before the reveal').toBe('500');
  await reveal28a(host);
  await olya.getByText('Правильно!').waitFor();
  await headerScore(olya).getByText('800', exact).waitFor();
  expect(await rowScore('Оля'), '500 + 500 − 200').toBe('800');
  expect(await rowScore('Тарас')).toBe('1000');
  const names = ['Оля'];
  noBuyer29h(stageFrames.slice(from[0]!), names, 'stage');
  noBuyer29h(hostFrames.slice(from[1]!), names, 'host');
  noBuyer29h(petroFrames.slice(from[2]!), names, 'Петро');
  noBuyer29h(tarasFrames.slice(from[3]!), names, 'Тарас');

  // ── Історія незавершеної гри не показує покупок. ──
  const mine = { id: ctx.manager.get(code)!.id };
  const midGame = await (await host.request.get(`${base}/api/games/${mine.id}`)).text();
  expect(midGame, 'an unfinished history names no purchase').not.toMatch(/"source":"debuff"/);
  expect(midGame).not.toContain('Туман');

  // ── Другий раунд: друга покупка — вже з ім’ям. ──
  await click(host, 'Далі');
  await advance29h(host, ['Наступний раунд']);
  await host.getByRole('button', { name: 'Почати раунд', ...exact }).waitFor();
  await buy29h(olya, /Тремтіння/, 'Тарас', 200);
  for (const page of [stage, host, petro]) await stealthNotice29h(page).getByText('Оля насилає дебаф на гравця Тарас', exact).waitFor();
  expect(await olya.locator('.stealth-mark').count()).toBe(0);
  await click(host, 'Почати раунд');
  await taras.getByText('Оля насилає на вас: Тремтіння екрана', exact).waitFor();
  await afterSplash(...all);
  for (const page of [olya, petro]) await answer29h(page);
  await reveal28a(host);
  await olya.getByText('Правильно!').waitFor();
  await headerScore(olya).getByText('1100', exact).waitFor();
  await expectNoSideScroll(olya, 'stealth29h-after-second-320');

  // ── Кінець гри: історія називає обидві покупки. ──
  await click(host, 'Далі');
  await advance29h(host, ['Наступне запитання']);
  await petro.locator('h1', { hasText: 'Запитання 4:' }).waitFor();
  await afterSplash(...all);
  for (const page of [olya, petro]) await answer29h(page);
  await reveal28a(host);
  await toWinners27c(host, stage);
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Прихований напад 29h/ }).first().click();
  await host.getByText('Оля купує 🌫️ Туман для гравця Петро: −200', exact).waitFor();
  await host.getByText('Оля купує 📳 Тремтіння екрана для гравця Тарас: −200', exact).waitFor();
  await shot(host, 'stealth29h-history');

  expect(problems).toEqual([]);
}

async function stealthTeams29h() {
  const host = await open('host29ht', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host29ht@example.com');
  const TITLE = 'Прихований напад команд 29h';
  const saved = await host.request.post(`${base}/api/quizzes`, { data: stealthQuiz29h(TITLE, true) });
  expect(saved.ok(), await saved.text()).toBe(true);
  const stage = await open('stage29ht', 1600, 900);
  const stageFrames = socketFrames(stage);
  const hostFrames = socketFrames(host);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: TITLE }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  await stage.goto(stageUrl);
  const olya = await open('olya29ht', 375, 812);
  const taras = await open('taras29ht', 320, 568, { hasTouch: true, isMobile: true });
  const petro = await open('petro29ht', 375, 812);
  const hanna = await open('hanna29ht', 360, 740);
  const petroFrames = socketFrames(petro);
  const hannaFrames = socketFrames(hanna);
  const phones = [olya, taras, petro, hanna];
  for (const [page, nickname, team] of [
    [olya, 'Оля', 'Соняшники'],
    [taras, 'Тарас', 'Соняшники'],
    [petro, 'Петро', 'Маки'],
    [hanna, 'Ганна', 'Маки'],
  ] as const) {
    await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
  }
  await expect.poll(() => stageTeam(stage, 'Соняшники'), POLL).toEqual(['Оля', 'Тарас']);
  await expect.poll(() => stageTeam(stage, 'Маки'), POLL).toEqual(['Петро', 'Ганна']);
  const all = [stage, host, ...phones];
  await click(host, 'Почати гру');
  await afterSplash(...all);
  await click(host, 'Почати раунд');
  await petro.locator('h1', { hasText: 'Запитання 1:' }).waitFor();
  await afterSplash(...all);
  await pickOption(olya, 'Київ');
  await click(olya, 'Відповісти');
  await olya.getByText('Відповідь прийнято', exact).waitFor();
  // Відповіла одна команда з двох — запитання ще відкрите: ведучий закриває його сам, не чекаючи таймера.
  await click(host, 'Закрити запитання');
  await click(host, 'Показати відповідь');
  await olya.locator('section.result').first().waitFor();
  await click(host, 'Далі');
  await host.getByRole('button', { name: 'Наступне запитання', ...exact }).waitFor();

  // Капітан (Оля) вмикає: кнопка «😈» лише в неї, позначку бачить уся команда, суперники й сцена — жодного кадру.
  expect(await taras.getByRole('button', { name: 'Дебафи', ...exact }).count(), 'a teammate has no shop button').toBe(0);
  await openShop29h(olya);
  const turnOn = stealthSheet29h(olya).locator('.shop-stealth').getByRole('button', { name: 'Увімкнути', ...exact });
  await quiet29h(
    [
      ['stage', stageFrames],
      ['host', hostFrames],
      ['Петро', petroFrames],
      ['Ганна', hannaFrames],
    ],
    async () => {
      await turnOn.click();
      await stealthSheet29h(olya).locator('.shop-stealth').getByText('🥷 Наступний напад анонімний', exact).waitFor();
    },
  );
  await olya.keyboard.press('Escape');
  await stealthSheet29h(olya).waitFor({ state: 'detached' });
  await expectMark29h(olya, 'stealth29h-teams-captain-375');
  await expectMark29h(taras, 'stealth29h-teams-mark-320');
  for (const page of [petro, hanna, stage, host]) expect(await page.locator('body').innerText(), 'the rivals see no mark').not.toContain('Наступний напад анонімний');

  // Перезапуск: позначка лишилася в обох учасників.
  await restart(async () => {
    await stage.getByText(RESTARTING_TEXT, exact).waitFor({ timeout: 15_000 });
  });
  for (const page of [stage, ...phones, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click({ timeout: 15_000 });
  await expectMark29h(olya, 'stealth29h-teams-captain-restart-375');
  await expectMark29h(taras, 'stealth29h-teams-restart-320');

  // Покупка «Туману» для «Маків»: у Маків і на сцені — «Хтось».
  const from = [stageFrames.length, hostFrames.length, petroFrames.length, hannaFrames.length];
  await buy29h(olya, /Туман/, 'Маки', 200);
  await stealthNotice29h(stage).getByText('Хтось насилає дебаф на гравця Маки', exact).waitFor();
  await stealthNotice29h(host).getByText('Хтось насилає дебаф на гравця Маки', exact).waitFor();
  await stealthNotice29h(taras).getByText('Хтось насилає дебаф на гравця Маки', exact).waitFor();
  expect(await olya.locator('.stealth-mark').count()).toBe(0);
  expect(await taras.locator('.stealth-mark').count()).toBe(0);
  await stage.waitForTimeout(300);
  await shot(stage, 'stealth29h-teams-stage');
  await click(host, 'Наступне запитання');
  await petro.locator('h1', { hasText: 'Запитання 2:' }).waitFor();
  await petro.getByText('Хтось насилає на вас: Туман', exact).waitFor();
  expect(await petro.locator('.debuff-banner').textContent()).not.toContain('Оля');
  await shot(petro, 'stealth29h-teams-victim-375');
  // Товариш по команді-жертві не в тумані: йому лише «На капітані дебаф».
  await hanna.locator('h1', { hasText: 'Запитання 2:' }).waitFor();
  await hanna.getByText('На капітані дебаф: Туман', exact).waitFor();
  const names = ['Оля', 'Тарас', 'Соняшники'];
  noBuyer29h(stageFrames.slice(from[0]!), names, 'stage');
  noBuyer29h(hostFrames.slice(from[1]!), names, 'host');
  noBuyer29h(petroFrames.slice(from[2]!), names, 'Петро');
  noBuyer29h(hannaFrames.slice(from[3]!), names, 'Ганна');
  await expectNoSideScroll(taras, 'stealth29h-teams-after-320');

  expect(problems).toEqual([]);
}

/* ───────────────────────────── part 29g: «Квест із кодом» ───────────────────────────── */

it('part 29g: a quest after a classic round — the code and its order in the editor, a code entered in the middle of a question, the bonus by the questions revealed, the thirty-second window, no code on phones before it is shown, 320 px', async () => {
  try {
    await questGame29g();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 29g: a quest in teams — any member enters, tries and characters are shared, a buff bonus for the first team only, a restart keeps the tries and the window, 320 px', async () => {
  try {
    await questTeams29g();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 29g: a quest with 24 players — the stage rows fit 1600×900', async () => {
  const sockets: Socket[] = [];
  try {
    await questCrowd29g(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

const CODE29G = 'СОВА';
const PROMPT29G = 'Нічний птах — символ мудрості (4 літери)';
const BASE29G = { imageUrl: null, video: null, timeLimit: 30, points: 500 };

/** П'ять запитань квесту: що вводить гравець, коли відповідає правильно й неправильно. */
const QUESTIONS29G = [
  { question: { ...BASE29G, id: 'k1', type: 'numeric', text: 'Скільки ніг у павука?', correct: 8, tolerance: 0 }, kind: 'field', right: '8', wrong: '9' },
  { question: { ...BASE29G, id: 'k2', type: 'boolean', text: 'Чи є кит рибою?', correct: false }, kind: 'bool', right: 'Ні', wrong: 'Так' },
  { question: { ...BASE29G, id: 'k3', type: 'text', text: 'Столиця Японії?', accepted: ['Токіо'] }, kind: 'field', right: 'Токіо', wrong: 'Осака' },
  { question: { ...BASE29G, id: 'k4', type: 'single', text: 'Яка планета найбільша?', options: [{ id: 'a', text: 'Сатурн' }, { id: 'b', text: 'Юпітер' }, { id: 'c', text: 'Марс' }], correctId: 'b' }, kind: 'option', right: 'Юпітер', wrong: 'Сатурн' },
  { question: { ...BASE29G, id: 'k5', type: 'numeric', text: 'Скільки континентів на Землі?', correct: 7, tolerance: 0 }, kind: 'field', right: '7', wrong: '6' },
] as const;

type Bonus29g = { kind: 'points'; points: number } | { kind: 'buff'; buff: 'fifty'; first: number | null };

function quest29g(code: string, order: number[], tries: number, bonus: Bonus29g, questions: readonly unknown[], id = 'qr29g') {
  return { id, type: 'quest' as const, title: '', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES, prompt: PROMPT29G, code, order, tries, bonus, questions };
}

/** Телефон відповідає на запитання квесту: правильно чи ні. */
async function answer29g(page: Page, index: number, right: boolean) {
  const entry = QUESTIONS29G[index]!;
  const value = right ? entry.right : entry.wrong;
  if (entry.kind === 'field') {
    await field(page, 'Ваша відповідь').fill(value);
    await click(page, 'Відповісти');
  } else if (entry.kind === 'bool') await click(page, value);
  else await page.getByRole('button', { name: new RegExp(value) }).click();
  await page.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
}

const sheet29g = (page: Page) => page.getByRole('dialog', { name: 'Квест', ...exact });

/** Пігулка → аркуш (якщо панель не основний вміст) → поле → «Відкрити скриню». Аркуш лишається відкритим. */
async function enterCode29g(page: Page, code: string) {
  if ((await page.locator('.quest-input').count()) === 0) {
    await page.locator('.quest-button').click();
    await sheet29g(page).waitFor();
  }
  await page.locator('.quest-input').fill(code);
  await click(page, 'Відкрити скриню');
}

async function closeSheet29g(page: Page) {
  if ((await sheet29g(page).count()) === 0) return;
  await page.keyboard.press('Escape');
  await sheet29g(page).waitFor({ state: 'detached' });
}

/** Символи комірок замка (порожня — ''); за потреби відкриває аркуш і закриває його. */
async function lock29g(page: Page): Promise<string[]> {
  const had = (await page.locator('.quest-panel .quest-cell').count()) > 0;
  if (!had) {
    await page.locator('.quest-button').click();
    await sheet29g(page).waitFor();
  }
  const cells = (await page.locator('.quest-panel .quest-cell').allTextContents()).map((text) => text.trim());
  if (!had) await closeSheet29g(page);
  return cells;
}

/** Код ніде не з'являється у кадрах сокета екрана (у будь-якому регістрі). */
function noCode29g(frames: string[], who: string) {
  expect(frames.join('\n').toUpperCase(), `${who}: the code in a socket frame`).not.toContain(CODE29G);
}

/** Усі масиви slots із кадрів телефона. */
function slotsIn29g(frames: string[]): string[][] {
  const found: string[][] = [];
  for (const frame of frames) for (const match of frame.matchAll(/"slots":\[([^\]]*)\]/g)) found.push(match[1]!.split(','));
  return found;
}

/** Шапка телефона: без прокрутки вбік, усе в межах екрана й одного рядка шапки. */
async function expectHeaderFit29g(page: Page, name: string) {
  const fit = (await page.evaluate(`(() => {
    const bar = document.querySelector('header.bar');
    const box = bar.getBoundingClientRect();
    const kids = [...bar.children].map((el) => { const r = el.getBoundingClientRect(); return { name: (el.className || el.tagName) + ':' + (el.textContent || '').slice(0, 12), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) }; }).filter((kid) => kid.right > kid.left);
    return { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, barScroll: bar.scrollWidth, barClient: bar.clientWidth, barTop: Math.round(box.top), barBottom: Math.round(box.bottom), kids };
  })()`)) as { scrollW: number; innerW: number; barScroll: number; barClient: number; barTop: number; barBottom: number; kids: { name: string; left: number; right: number; top: number; bottom: number }[] };
  console.log(`quest 29g: ${name} header ${fit.barBottom - fit.barTop} px high — ${fit.kids.map((kid) => `${kid.name} ${kid.left}-${kid.right} y${kid.top}-${kid.bottom}`).join(' | ')}`);
  expect(fit.scrollW, `${name}: page scrolls sideways`).toBeLessThanOrEqual(fit.innerW);
  expect(fit.barScroll, `${name}: the header scrolls sideways`).toBeLessThanOrEqual(fit.barClient + 1);
  for (const kid of fit.kids) {
    expect(kid.right, `${name}: ${kid.name} sticks out on the right`).toBeLessThanOrEqual(fit.innerW + 0.5);
    expect(kid.left, `${name}: ${kid.name} sticks out on the left`).toBeGreaterThanOrEqual(-0.5);
  }
  // Пігулка квесту не вища й не нижча за сусідню пігулку шапки («😈», «Таблиця»): та сама лінія рядка.
  const mine = fit.kids.find((kid) => kid.name.startsWith('table-button quest-button'));
  const others = fit.kids.filter((kid) => kid.name.startsWith('table-button') && kid !== mine);
  expect(mine, `${name}: no quest pill`).toBeDefined();
  for (const other of others) {
    expect(mine!.bottom - mine!.top, `${name}: the pill is taller than ${other.name}`).toBeLessThanOrEqual(other.bottom - other.top + 1);
    expect(mine!.top, `${name}: the pill rises above ${other.name}`).toBeGreaterThanOrEqual(other.top - 1);
    expect(mine!.bottom, `${name}: the pill drops below ${other.name}`).toBeLessThanOrEqual(other.bottom + 1);
  }
  await expectNoSideScroll(page, name);
}

/** Аркуш квесту: в межах екрана, не заходить на шапку, комірки коду в один ряд. */
async function expectSheetFit29g(page: Page, name: string) {
  const geo = (await page.evaluate(`(() => {
    const card = document.querySelector('.quest-card').getBoundingClientRect();
    const bar = document.querySelector('header.bar').getBoundingClientRect();
    const cells = [...document.querySelectorAll('.quest-card .quest-cell')].map((el) => el.getBoundingClientRect());
    return { cardTop: Math.round(card.top), cardBottom: Math.round(card.bottom), cardLeft: Math.round(card.left), cardRight: Math.round(card.right), barBottom: Math.round(bar.bottom), innerH: innerHeight, innerW: innerWidth, tops: cells.map((r) => Math.round(r.top)), lastRight: Math.round(cells[cells.length - 1].right), scrollW: document.documentElement.scrollWidth };
  })()`)) as { cardTop: number; cardBottom: number; cardLeft: number; cardRight: number; barBottom: number; innerH: number; innerW: number; tops: number[]; lastRight: number; scrollW: number };
  console.log(`quest 29g: ${name} sheet ${geo.cardTop}-${geo.cardBottom} of ${geo.innerH}, header bottom ${geo.barBottom}, lock tops ${geo.tops.join('/')}, last cell right ${geo.lastRight} of ${geo.innerW}`);
  expect(new Set(geo.tops).size, `${name}: the lock is one row`).toBe(1);
  expect(geo.lastRight, `${name}: the lock sticks out`).toBeLessThanOrEqual(geo.innerW);
  expect(geo.cardLeft, `${name}: the sheet on the left`).toBeGreaterThanOrEqual(-0.5);
  expect(geo.cardRight, `${name}: the sheet on the right`).toBeLessThanOrEqual(geo.innerW + 0.5);
  expect(geo.cardTop, `${name}: the sheet covers the header`).toBeGreaterThanOrEqual(geo.barBottom - 1);
  expect(geo.cardBottom, `${name}: the sheet below the screen`).toBeLessThanOrEqual(geo.innerH + 0.5);
  expect(geo.scrollW, `${name}: scroll sideways`).toBeLessThanOrEqual(geo.innerW);
}

/** Сцена: без прокрутки, імена в рядках цілі, таблиця (якщо є) має висоту й не виходить за сцену. */
async function expectQuestStage29g(stage: Page, name: string) {
  const geo = (await stage.evaluate(`(() => {
    const clipped = [...document.querySelectorAll('.quest-row-name, .quest-table .name')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent);
    const squeezed = [...document.querySelectorAll('.quest-row-name')].filter((el) => el.getBoundingClientRect().width < 40).map((el) => el.textContent);
    const rows = [...document.querySelectorAll('.quest-row')].map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.height), Math.round(r.bottom), Math.round(r.right)]; });
    const table = document.querySelector('.quest-table');
    const tableBox = table === null ? null : table.getBoundingClientRect();
    const bodyRows = [...document.querySelectorAll('.quest-table tbody tr')].map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.height), Math.round(r.bottom)]; });
    return { clipped, squeezed, rows, table: tableBox === null ? null : [Math.round(tableBox.height), Math.round(tableBox.bottom)], bodyRows, scrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
  })()`)) as { clipped: string[]; squeezed: string[]; rows: number[][]; table: number[] | null; bodyRows: number[][]; scrollH: number; clientH: number; scrollW: number; clientW: number };
  console.log(`quest 29g: ${name} — ${geo.rows.length} stage rows (last bottom ${geo.rows.at(-1)?.[1] ?? '-'}), table ${geo.table === null ? '-' : `${geo.table[0]} px, bottom ${geo.table[1]}`}, ${geo.bodyRows.length} table rows, page ${geo.scrollH}/${geo.clientH}`);
  expect(geo.scrollW, `${name}: the stage scrolls sideways`).toBeLessThanOrEqual(geo.clientW);
  expect(geo.scrollH, `${name}: the stage scrolls down`).toBeLessThanOrEqual(geo.clientH);
  expect(geo.clipped, `${name}: clipped names`).toEqual([]);
  expect(geo.squeezed, `${name}: names squeezed to nothing`).toEqual([]);
  for (const [height, bottom, right] of geo.rows) {
    expect(height, `${name}: a collapsed row`).toBeGreaterThan(10);
    expect(bottom, `${name}: a row below the stage`).toBeLessThanOrEqual(900 + 1);
    expect(right, `${name}: a row right of the stage`).toBeLessThanOrEqual(1600 + 1);
  }
  if (geo.table !== null) {
    expect(geo.table[0], `${name}: the table has no height`).toBeGreaterThan(40);
    expect(geo.table[1], `${name}: the table below the stage`).toBeLessThanOrEqual(900 + 1);
    expect(geo.bodyRows.length, `${name}: table rows`).toBeGreaterThan(0);
    for (const [height, bottom] of geo.bodyRows) {
      expect(height, `${name}: a collapsed table row`).toBeGreaterThan(8);
      expect(bottom, `${name}: a table row below the stage`).toBeLessThanOrEqual(900 + 1);
    }
  }
}

/** Вибір запитання n (з 1) у списку редактора. */
const pickQuestion29g = (host: Page, n: number) => host.locator('.question-list .question-item').nth(n - 1).click();

async function questGame29g() {
  // ── Редактор: класика з одним запитанням і «Квест із кодом»: код, порядок, запитання, бонус. ──
  const host = await open('host29g', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host29g@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Квест 29g');
  await questionText(host).fill('Скільки днів у тижні?');
  await field(host, 'Варіант 1').fill('П’ять');
  await field(host, 'Варіант 2').fill('Сім');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Час, с').fill('30');
  await click(host, '+ Раунд');
  await click(host, 'Квест із кодом');
  await openRoundSettings(host);

  // Порожній квест: проблеми називають запитання й код.
  await click(host, 'Зберегти');
  await host.locator('.problems', { hasText: 'Квест із кодом: напишіть глобальне запитання.' }).waitFor();
  await host.locator('.problems', { hasText: 'Квест із кодом: код — від 3 до 8 цифр чи літер.' }).waitFor();
  const types = host.getByRole('group', { name: 'Тип запитання', ...exact });
  for (const missing of [/ланцюжок/i, /мелодія/i, /пазл/i]) expect(await types.getByRole('button', { name: missing }).count(), `a ${missing} in the quest menu`).toBe(0);
  await types.getByRole('button', { name: 'один варіант', ...exact }).waitFor();

  await host.locator('.quest-prompt').fill(PROMPT29G);
  await host.locator('.quest-code').fill('со ва');
  expect(await host.locator('.quest-code').inputValue(), 'the code is normalised on the fly').toBe(CODE29G);
  await host.locator('.quest-count').getByText('4 з 3–8', exact).waitFor();
  // Позиція 1 → «2», позиція 2 → «1»: першою відкривається друга літера «О».
  await host.getByLabel('Позиція 1', exact).selectOption('2');
  expect(await host.getByLabel('Позиція 2', exact).inputValue(), 'the other position took the freed rank').toBe('1');
  await field(host, 'Спроб').fill('3');
  await field(host, 'Бонус, балів').fill('1200');
  expect(await host.locator('.quest-settings option[value="buff"]').evaluate((el) => (el as HTMLOptionElement).disabled), 'a buff bonus without allowed buffs').toBe(true);
  await host.locator('.quest-buff-none').getByText('Увімкніть бафи у вікторині, щоб дати баф', exact).waitFor();

  // Три запитання: число, так/ні, текст — а потрібно щонайменше 4.
  await pickQuestion29g(host, 1);
  await click(host, 'число');
  await questionText(host).fill(QUESTIONS29G[0].question.text);
  await field(host, 'Правильне число').fill('8');
  await field(host, 'Час, с').fill('30');
  await pickQuestion29g(host, 2);
  await click(host, 'так чи ні');
  await questionText(host).fill(QUESTIONS29G[1].question.text);
  await click(host, 'Правильна відповідь: Ні');
  await field(host, 'Час, с').fill('30');
  await pickQuestion29g(host, 3);
  await click(host, 'текст');
  await questionText(host).fill(QUESTIONS29G[2].question.text);
  await field(host, 'Написання 1').fill('Токіо');
  await field(host, 'Час, с').fill('30');
  await click(host, 'Зберегти');
  await host.locator('.problems', { hasText: 'Квест із кодом: запитань має бути щонайменше 4.' }).waitFor();
  await host.locator('.quest-short').getByText('Запитань має бути щонайменше 4', exact).waitFor();
  // Ще два — проблема зникає.
  await click(host, 'Додати запитання');
  await questionText(host).fill(QUESTIONS29G[3].question.text);
  await field(host, 'Варіант 1').fill('Сатурн');
  await field(host, 'Варіант 2').fill('Юпітер');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Час, с').fill('30');
  await click(host, 'Додати запитання');
  await click(host, 'число');
  await questionText(host).fill(QUESTIONS29G[4].question.text);
  await field(host, 'Правильне число').fill('7');
  await field(host, 'Час, с').fill('30');
  await expect.poll(() => host.locator('.quest-short').count(), POLL).toBe(0);
  await shot(host, 'quest29g-editor');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Квест 29g' }).waitFor();

  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Квест 29g')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { title: string; description: string; settings: Record<string, unknown>; rounds: { type: string; code?: string; order?: number[]; tries?: number; bonus?: unknown; prompt?: string; questions: { type: string }[] }[] };
  expect(stored.rounds.map((round) => round.type)).toEqual(['classic', 'quest']);
  const round = stored.rounds[1]!;
  expect(round).toMatchObject({ code: CODE29G, order: [1, 0, 2, 3], tries: 3, bonus: { kind: 'points', points: 1200 }, prompt: PROMPT29G });
  expect(round.questions.map((question) => question.type)).toEqual(['numeric', 'boolean', 'text', 'single', 'numeric']);
  // Рейтинг після кожного запитання і дебафи для «😈» в шапці — через API: редактор лишається чистим.
  const settings = { ...stored.settings, leaderboard: 'each', debuffs: ['fog', 'shake'] };
  const put = await host.request.put(`${base}/api/quizzes/${quizId}`, { data: { title: stored.title, description: stored.description, settings, rounds: stored.rounds } });
  expect(put.ok(), await put.text()).toBe(true);

  // ── Гра: сцена 1600 × 900; Оля 320 × 568, Петро 375, Тарас 360. ──
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Квест 29g' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29g', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya29g', 320, 568, { hasTouch: true, isMobile: true });
  const petro = await open('petro29g', 375, 812);
  const taras = await open('taras29g', 360, 740);
  const olyaFrames = socketFrames(olya);
  const petroFrames = socketFrames(petro);
  const tarasFrames = socketFrames(taras);
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(taras, code, 'Тарас', false);
  await stage.getByText('Тарас').waitFor();
  const phones = [olya, petro, taras];
  const all = [stage, host, ...phones];
  const pill = (page: Page) => page.locator('.quest-button');

  // Перший, класичний раунд: без квесту ніде.
  await click(host, 'Почати гру');
  await afterSplash(...all);
  await step27a(host, 'Почати раунд');
  await afterSplash(...all);
  for (const page of phones) expect(await pill(page).count(), 'no quest pill in a classic round').toBe(0);
  for (const page of phones) await page.getByRole('button', { name: /Сім/ }).click();
  await reveal28a(host);
  await click(host, 'Далі');
  await advance29h(host, ['Наступний раунд']);

  // ── Заставка квесту: глобальне запитання й 4 порожні комірки; на телефонах — панель коду. ──
  await afterSplash(...all);
  await stage.locator('.quest-stage.is-intro').getByText(PROMPT29G, exact).waitFor();
  expect(await stage.locator('.quest-stage .quest-cell').count(), 'four cells of the lock').toBe(4);
  expect((await stage.locator('.quest-stage .quest-cell').allTextContents()).join(''), 'an empty lock on the stage').toBe('');
  for (const page of phones) await page.locator('.quest-panel .quest-input').waitFor();
  await shot(stage, 'quest29g-stage-intro');
  await expectHeaderFit29g(olya, 'quest29g-intro-header-320');
  // Петро вводить «СОВИ» просто на заставці: код не той, спроба згоріла.
  await enterCode29g(petro, 'СОВИ');
  await petro.locator('.quest-error').getByText('Не той код', exact).waitFor();
  await petro.locator('.quest-left').getByText('Лишилися 2 спроби', exact).waitFor();
  await petro.locator('.quest-tries del', { hasText: 'СОВИ' }).waitFor();
  // Довжина не та — спроба не згоріла.
  await enterCode29g(petro, 'СОВ');
  await petro.locator('.quest-error').getByText('Потрібно символів: 4', exact).waitFor();
  await petro.locator('.quest-left').getByText('Лишилися 2 спроби', exact).waitFor();
  await petro.locator('.quest-input').fill('');
  await shot(petro, 'quest29g-phone-intro-375');
  const questFrom = [stageFrames.length, olyaFrames.length, petroFrames.length, tarasFrames.length];

  // ── Запитання 1: Оля й Тарас — правильно, Петро — ні. Цифра з'являється на розкритті. ──
  await step27a(host, 'Почати раунд');
  await petro.locator('h1', { hasText: QUESTIONS29G[0].question.text }).waitFor();
  await afterSplash(...all);
  expect(await stage.locator('.quest-strip').textContent(), 'the compact strip over the question').toContain('скриню відкрили: 0');
  await answer29g(olya, 0, true);
  await answer29g(taras, 0, true);
  await answer29g(petro, 0, false);
  expect(await pill(olya).textContent(), 'a symbol does not appear on the answer').toBe('🔐0/4');
  await reveal28a(host);
  await olya.getByText('Правильно!').waitFor();
  await expect.poll(() => pill(olya).textContent(), POLL).toBe('🔐1/4');
  await expect.poll(() => pill(taras).textContent(), POLL).toBe('🔐1/4');
  expect(await pill(petro).textContent()).toBe('🔐0/4');
  expect(await lock29g(olya), 'Оля: the second symbol opens first').toEqual(['', 'О', '', '']);
  expect(await lock29g(petro)).toEqual(['', '', '', '']);
  await expectHeaderFit29g(olya, 'quest29g-header-320');
  await step27a(host, 'Далі');
  await step27a(host, 'Наступне запитання');

  // ── Запитання 2: посеред запитання Тарас відкриває аркуш і вводить «сова» — +1000 (k = 1). ──
  await taras.locator('h1', { hasText: QUESTIONS29G[1].question.text }).waitFor();
  await afterSplash(...all);
  const heading = (page: Page) => page.locator('h1', { hasText: QUESTIONS29G[1].question.text });
  const before = (await heading(taras).boundingBox())!;
  const noButton = taras.getByRole('button', { name: 'Ні', ...exact });
  await noButton.evaluate((el) => el.setAttribute('data-mark', 'kept'));
  await taras.locator('.quest-button').click();
  await sheet29g(taras).waitFor();
  expect((await heading(taras).boundingBox())!.y, 'the question does not move under the sheet').toBe(before.y);
  await enterCode29g(taras, 'сова');
  await taras.locator('.quest-solved').getByText('Скриню відкрито! +1000', exact).waitFor();
  await closeSheet29g(taras);
  expect(await noButton.getAttribute('data-mark'), 'the answer buttons were not remounted').toBe('kept');
  await expect.poll(() => stage.locator('.quest-strip').textContent(), POLL).toContain('скриню відкрили: 1');
  await answer29g(taras, 1, true);
  await answer29g(olya, 1, true);
  await answer29g(petro, 1, false);
  await reveal28a(host);
  await olya.getByText('Правильно!').waitFor();
  await expect.poll(() => pill(olya).textContent(), POLL).toBe('🔐2/4');
  await stage.locator('.quest-strip.is-full').waitFor();
  await shot(stage, 'quest29g-stage-strip');
  await step27a(host, 'Далі');
  await step27a(host, 'Наступне запитання');

  // ── Запитання 3–5: Оля правильно на всі; Петро — ні. ──
  for (const index of [2, 3, 4]) {
    await petro.locator('h1', { hasText: QUESTIONS29G[index]!.question.text }).waitFor();
    await afterSplash(...all);
    if (index === 3) {
      await olya.locator('.quest-button').click();
      await sheet29g(olya).waitFor();
      await expectSheetFit29g(olya, 'quest29g-sheet-320');
      await shot(olya, 'quest29g-phone-sheet-320');
      await closeSheet29g(olya);
    }
    await answer29g(olya, index, true);
    await answer29g(petro, index, false);
    await answer29g(taras, index, index !== 4);
    await reveal28a(host);
    await olya.getByText('Правильно!').waitFor();
    if (index < 4) {
      await step27a(host, 'Далі');
      await step27a(host, 'Наступне запитання');
    }
  }
  await expect.poll(() => pill(olya).textContent(), POLL).toBe('🔐4/4');
  expect(await lock29g(olya), 'Оля has all four symbols after question five').toEqual([...CODE29G]);
  expect(await pill(petro).textContent()).toBe('🔐0/4');
  await expectHeaderFit29g(olya, 'quest29g-header-full-320');

  // ── Ніде до показу: ні кадрів сокета, ні DOM; у Петра в slots лише null. ──
  noCode29g(stageFrames.slice(questFrom[0]!), 'stage');
  noCode29g(olyaFrames.slice(questFrom[1]!), 'Оля');
  noCode29g(petroFrames.slice(questFrom[2]!), 'Петро');
  noCode29g(tarasFrames.slice(questFrom[3]!), 'Тарас');
  expect(stageFrames.slice(questFrom[0]!).join('\n'), 'a slots field in the stage frames').not.toContain('"slots"');
  const petroSlots = slotsIn29g(petroFrames.slice(questFrom[2]!));
  expect(petroSlots.length, 'Петро has frames with slots').toBeGreaterThan(0);
  for (const slots of petroSlots) expect(slots.every((slot) => slot === 'null'), `Петро: a symbol in slots ${slots.join(',')}`).toBe(true);
  expect((await stage.locator('body').innerText()).toUpperCase(), 'the code on the stage').not.toContain(CODE29G);
  expect((await stage.locator('.quest-cell').allTextContents()).join(''), 'symbols in the stage cells').toBe('');
  expect((await petro.locator('body').innerText()).toUpperCase(), 'the code on Петро’s phone').not.toContain(CODE29G);
  expect((await lock29g(petro)).join('')).toBe('');

  // ── Вікно 30 с: годинник на сцені; Оля вводить «СОВА» → +200 (k = 5); Петро пробує «ЛИСА». ──
  await step27a(host, 'Далі');
  await stage.locator('.quest-stage.is-window .quest-clock').waitFor();
  for (const page of [olya, petro]) await page.locator('.quest-panel .quest-input').waitFor();
  await taras.locator('.quest-panel .quest-solved').waitFor();
  await host.locator('.quest-host .quest-clock').waitFor();
  await host.getByRole('button', { name: 'Показати код', ...exact }).waitFor();
  expect(await seconds(stage), 'a fresh thirty-second clock').toBeGreaterThanOrEqual(27);
  await shot(stage, 'quest29g-stage-window');
  await enterCode29g(olya, CODE29G);
  await olya.locator('.quest-solved').getByText('Скриню відкрито! +200', exact).waitFor();
  await enterCode29g(petro, 'ЛИСА');
  await petro.locator('.quest-left').getByText('Лишилася 1 спроба', exact).waitFor();
  await expectHeaderFit29g(olya, 'quest29g-window-header-320');
  await shot(olya, 'quest29g-phone-window-320');
  await expect.poll(() => host.locator('.quest-host').textContent(), POLL).toContain('ЛИСА');
  await shot(host, 'quest29g-host');
  // Пульт показує час спроб «м:сс» від початку раунду.
  const tryTimes = await host.locator('.quest-host-tries li').allTextContents();
  expect(tryTimes.length, 'tries on the host').toBeGreaterThanOrEqual(4);
  for (const text of tryTimes) expect(text, 'a try time as m:ss').toMatch(/\d+:\d\d/);

  // Пауза на 5 с не з'їдає залишку.
  const left = await seconds(stage);
  await host.getByRole('button', { name: 'Пауза', ...exact }).first().click();
  await stage.locator('.banner', { hasText: 'Пауза' }).waitFor();
  const held = await seconds(stage);
  await sleep(5000);
  expect(await seconds(stage), 'the clock stands during a pause').toBe(held);
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();
  await stage.locator('.banner', { hasText: 'Пауза' }).waitFor({ state: 'detached' });
  expect(await seconds(stage), 'the pause did not eat the rest').toBeGreaterThanOrEqual(held - 2);
  expect(left - held, 'a little time passed before the pause').toBeLessThan(8);

  // Годинник сплив — код бачать усі.
  await stage.locator('.quest-stage.is-shown').waitFor({ timeout: 40_000 });
  await expect.poll(async () => (await stage.locator('.quest-stage .quest-cell').allTextContents()).join(''), POLL).toBe(CODE29G);
  for (const page of phones) await page.locator('.quest-shown').getByText('Код: СОВА', { exact: false }).waitFor();
  expect(await olya.locator('.quest-verdict').textContent()).toBe('✓');
  expect(await petro.locator('.quest-verdict').textContent()).toBe('✗');
  await stage.locator('.quest-table').waitFor();
  await expectQuestStage29g(stage, 'quest29g-shown');
  await shot(stage, 'quest29g-stage-shown');
  await expectHeaderFit29g(olya, 'quest29g-shown-header-320');
  await shot(olya, 'quest29g-phone-shown-320');
  expect(await host.locator('.quest-host-code .quest-cell').count()).toBe(4);

  // Квест — останній раунд: «Далі» веде до переможців.
  await toWinners27c(host, stage);

  // Бали з історії: коригування «Квест» Тараса 1000, Олі 200; множник раунду не діє.
  const mine = { id: ctx.manager.get(code)!.id };
  const gameJson = await (await host.request.get(`${base}/api/games/${mine.id}`)).text();
  const found: unknown[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value !== null && typeof value === 'object') {
      if ((value as { source?: unknown }).source === 'quest') found.push(value);
      Object.values(value).forEach(walk);
    }
  };
  walk(JSON.parse(gameJson));
  const adjustments = (found as { nickname?: string; points?: number }[]).filter((entry) => entry.nickname !== undefined).map((entry) => [entry.nickname, entry.points]);
  console.log(`quest 29g: adjustments ${JSON.stringify(adjustments)}`);
  expect(adjustments, 'the quest adjustments in the history').toEqual([['Тарас', 1000], ['Оля', 200]]);
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Квест 29g/ }).first().click();
  await host.getByText('Квест', { exact: false }).first().waitFor();
  await shot(host, 'quest29g-history');

  expect(problems).toEqual([]);
}

/** Чотири запитання `single` (a, b — правильний, c) по 30 с для квестів з гравцями-сокетами й командами. */
const singles29g = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => ({
    ...BASE29G,
    id: `${prefix}${i + 1}`,
    type: 'single' as const,
    text: `Запитання ${i + 1}: столиця України?`,
    options: [
      { id: 'a', text: 'Львів' },
      { id: 'b', text: 'Київ' },
      { id: 'c', text: 'Одеса' },
      { id: 'd', text: 'Харків' },
    ],
    correctId: 'b',
  }));

/** Капітан тисне варіант і чекає підтвердження. */
async function captainPick29g(page: Page, option: RegExp) {
  await page.getByRole('button', { name: option }).click();
  // У командах вибір варіанта ще треба підтвердити.
  const send = page.getByRole('button', { name: 'Відповісти', ...exact });
  if (await send.waitFor({ timeout: 1500 }).then(() => true, () => false)) await send.click();
  await page.getByText(/^(Відповідь прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
}

async function questTeams29g() {
  const host = await open('host29gt', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host29gt@example.com');
  const data = {
    ...makeRoundsQuiz([quest29g(CODE29G, [0, 1, 2, 3], 3, { kind: 'buff', buff: 'fifty', first: 1 }, singles29g(4, 'qt'), 'qrt29g') as never, classicRound('ct29g', singles29g(2, 'ct'), { speedBonus: false })], {
      leaderboard: 'each',
      buffs: ['fifty'],
      teams: { count: 3, names: ['Соняшники', 'Маки', 'Лілії'], answerer: 'captain' },
    }),
    title: 'Квест команд 29g',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const hostFrames = socketFrames(host);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Квест команд 29g' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29gt', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya29gt', 375, 812);
  const taras = await open('taras29gt', 320, 568, { hasTouch: true, isMobile: true });
  const petro = await open('petro29gt', 375, 812);
  const hanna = await open('hanna29gt', 360, 740);
  const lilia = await open('lilia29gt', 360, 740);
  const phones = [olya, taras, petro, hanna, lilia];
  const all = [stage, host, ...phones];
  for (const [page, nickname, team] of [
    [olya, 'Оля', 'Соняшники'],
    [taras, 'Тарас', 'Соняшники'],
    [petro, 'Петро', 'Маки'],
    [hanna, 'Ганна', 'Маки'],
    [lilia, 'Лілія', 'Лілії'],
  ] as const) {
    await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
  }
  await expect.poll(() => stageTeam(stage, 'Соняшники'), POLL).toEqual(['Оля', 'Тарас']);
  const pill = (page: Page) => page.locator('.quest-button');
  const questFrames = { stage: stageFrames.length, host: hostFrames.length };
  void questFrames;

  await click(host, 'Почати гру');
  await afterSplash(...all);
  for (const page of phones) await page.locator('.quest-panel .quest-input').waitFor();
  await step27a(host, 'Почати раунд');
  await petro.locator('h1', { hasText: 'Запитання 1:' }).waitFor();
  await afterSplash(...all);

  // Відповідає один капітан за запитання (Соняшники) — правильно; після розкриття символ в обох учасників однаково.
  await captainPick29g(olya, /Київ/);
  await reveal28a(host);
  await olya.getByText('Правильно!').waitFor();
  await expect.poll(() => pill(olya).textContent(), POLL).toBe('🔐1/4');
  await expect.poll(() => pill(taras).textContent(), POLL).toBe('🔐1/4');
  expect(await pill(petro).textContent()).toBe('🔐0/4');
  expect(await lock29g(olya)).toEqual(['С', '', '', '']);
  expect(await lock29g(taras), 'a teammate sees the same lock').toEqual(['С', '', '', '']);

  // Тарас (не капітан) вводить «СОВИ»: в Олі закреслене «СОВИ» і «Лишилися 2 спроби»; пульт називає, хто ввів.
  await enterCode29g(taras, 'СОВИ');
  await taras.locator('.quest-error').getByText('Не той код', exact).waitFor();
  await olya.locator('.quest-button').click();
  await sheet29g(olya).waitFor();
  await olya.locator('.quest-tries del', { hasText: 'СОВИ' }).waitFor();
  await olya.locator('.quest-left').getByText('Лишилися 2 спроби', exact).waitFor();
  await shot(taras, 'quest29g-teams-phone');
  await expectSheetFit29g(taras, 'quest29g-teams-sheet-320');
  await closeSheet29g(olya);
  await closeSheet29g(taras);
  await expect.poll(() => host.locator('.quest-host').textContent(), POLL).toContain('ввів(-ла) Тарас');
  await shot(host, 'quest29g-teams-host');
  // Маки про це нічого не знають.
  await petro.locator('.quest-button').click();
  await sheet29g(petro).waitFor();
  expect(await petro.locator('.quest-tries').count(), 'a rival sees no tries').toBe(0);
  await petro.locator('.quest-left').getByText('Лишилися 3 спроби', exact).waitFor();
  await closeSheet29g(petro);

  await step27a(host, 'Далі');
  await step27a(host, 'Наступне запитання');
  for (const index of [2, 3, 4]) {
    await petro.locator('h1', { hasText: `Запитання ${index}:` }).waitFor();
    await afterSplash(...all);
    await captainPick29g(olya, /Київ/);
    await reveal28a(host);
    await olya.getByText('Правильно!').waitFor();
    if (index < 4) {
      await step27a(host, 'Далі');
      await step27a(host, 'Наступне запитання');
    }
  }
  // ── Вікно: перезапуск сервера посеред нього. ──
  await step27a(host, 'Далі');
  await stage.locator('.quest-stage.is-window .quest-clock').waitFor();
  await expectNoSideScroll(taras, 'quest29g-teams-window-320');
  const clockBefore = await seconds(stage);
  await restart(async () => {
    await stage.getByText(RESTARTING_TEXT, exact).waitFor({ timeout: 15_000 });
  });
  for (const page of all) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click({ timeout: 15_000 });
  for (const page of [olya, taras]) {
    await page.locator('.quest-tries del', { hasText: 'СОВИ' }).waitFor();
    await page.locator('.quest-left').getByText('Лишилися 2 спроби', exact).waitFor();
  }
  await expect.poll(() => seconds(stage), POLL).toBeLessThanOrEqual(clockBefore);
  expect(await seconds(stage), 'the window clock goes on from the rest').toBeGreaterThan(0);
  expect(await lock29g(olya)).toEqual(['С', 'О', 'В', 'А'].map((char, i) => (i < 4 ? char : '')));

  // Тарас вводить «СОВА»: баф «50/50» — першій команді; Маки (теж правильно) — «бафи вже розібрали».
  await enterCode29g(taras, CODE29G);
  await taras.locator('.quest-solved').getByText('Скриню відкрито! Ваш баф: «50/50»', exact).waitFor();
  await olya.locator('.quest-solved').getByText('Скриню відкрито! Ваш баф: «50/50»', exact).waitFor();
  await enterCode29g(hanna, CODE29G);
  await hanna.locator('.quest-solved').getByText('Скриню відкрито — бафи вже розібрали', exact).waitFor();
  await petro.locator('.quest-solved').getByText('Скриню відкрито — бафи вже розібрали', exact).waitFor();
  // Лілії ще не вводили код — вікно відкрите; ведучий показує код сам.
  await stage.locator('.quest-stage.is-window').waitFor();
  await click(host, 'Показати код');
  await stage.locator('.quest-stage.is-shown').waitFor();
  expect((await stage.locator('.quest-stage .quest-cell').allTextContents()).join('')).toBe(CODE29G);
  await expectNoSideScroll(taras, 'quest29g-teams-shown-320');

  // ── Наступний, класичний раунд: капітан Соняшників бере «50/50» двічі, Маки — один раз. ──
  await step27a(host, 'Далі');
  // Кінець раунду: код лишається на сцені.
  await stage.locator('.quest-stage.is-shown .quest-lock').waitFor();
  expect((await stage.locator('.quest-stage .quest-cell').allTextContents()).join('')).toBe(CODE29G);
  await advance29h(host, ['Наступний раунд']);
  await step27a(host, 'Почати раунд');
  await afterSplash(...all);
  const fifty = (page: Page) => page.locator('.buff-row').getByRole('button', { name: /^50\/50/ });
  const label = async (page: Page) => (await fifty(page).getAttribute('aria-label'))!;
  console.log(`quest 29g: fifty before the classic round — Оля "${await label(olya)}", Петро "${await label(petro)}"`);
  expect(await label(olya), 'a granted use shows how many are left').toMatch(/×\d/);
  expect(await label(petro), 'a team without the bonus has no counter').toBe('50/50');
  const take = async (page: Page) => {
    await fifty(page).click();
    await page.locator('.buff-why').getByText('Ще раз — узяти «50/50»', exact).waitFor();
    await fifty(page).click();
    await expect.poll(() => fifty(page).getAttribute('class'), POLL).toContain('is-active');
  };
  await take(olya);
  await take(petro);
  await captainPick29g(olya, /Київ/);
  await reveal28a(host);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступне запитання');
  await olya.locator('h1', { hasText: 'Запитання 2:' }).waitFor();
  await afterSplash(...all);
  expect(await fifty(olya).getAttribute('class'), 'a second use is open').not.toContain('is-used');
  expect(await fifty(petro).getAttribute('class'), 'the rival has used its only one').toContain('is-used');
  await take(olya);
  await expectNoSideScroll(taras, 'quest29g-teams-classic-320');
  await captainPick29g(olya, /Київ/);
  await reveal28a(host);
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

async function questCrowd29g(sockets: Socket[]) {
  const host = await open('host29gc', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host29gc@example.com');
  const data = { ...makeRoundsQuiz([quest29g(CODE29G, [0, 1, 2, 3], 3, { kind: 'points', points: 1200 }, singles29g(4, 'qc'), 'qrc29g') as never], { leaderboard: 'each' }), title: 'Квест натовпу 29g' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Квест натовпу 29g' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29gc', 1600, 900);
  await stage.goto(stageUrl);
  const names = [
    'Олександра Петренко', 'Богдана Коваленко', 'Ярослав Шевченко', 'Мирослава Бондар', 'Владислав Ткаченко', 'Анастасія Мельник',
    'Святослав Кравчук', 'Христина Олійник', 'Станіслав Лисенко', 'Катерина Руденко', 'Остап Марченко', 'Соломія Савченко',
    'Тарас Гончаренко', 'Ірина Кузьменко', 'Максим Литвиненко', 'Вероніка Захарчук', 'Назар Поліщук', 'Злата Тимошенко',
    'Дмитро Павленко', 'Олена Кириленко', 'Роман Мороз', 'Оксана Бойко', 'Левко Гнатюк', 'Дарина Ковальчук',
  ];
  const players: { nickname: string; socket: Socket }[] = [];
  for (const nickname of names) {
    const response = await fetch(`${base}/api/games/by-code/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname }) });
    expect(response.status, nickname).toBe(201);
    const { token } = (await response.json()) as { token: string };
    // Сервер міг щойно перезапуститися (попередній сценарій): перші спроби WebSocket можуть не вдатися.
    let socket!: Socket;
    for (let attempt = 0; ; attempt++) {
      socket = connectSocket(base, { auth: { code, role: 'player', token }, transports: ['websocket'], reconnection: false });
      sockets.push(socket);
      const ok = await new Promise<boolean>((done) => {
        socket.once('connect', () => done(true));
        socket.once('connect_error', () => done(false));
      });
      if (ok) break;
      socket.close();
      if (attempt >= 5) throw new Error('websocket does not connect');
      await sleep(1000);
    }
    players.push({ nickname, socket });
  }
  const emit = <T,>(socket: Socket, event: string, payload: unknown) => new Promise<T>((done) => socket.emit(event, payload, done));
  const enter = (k: number, text: string) => emit<{ ok: boolean }>(players[k]!.socket, 'player:quest', { code: text });
  await click(host, 'Почати гру');
  await stage.locator('.quest-stage.is-intro').waitFor();
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage);

  // Кожен відповідає навмання: кожен третій — неправильно.
  const playQuestion = async (index: number) => {
    await stage.getByText(`Запитання ${index + 1}:`).first().waitFor();
    await Promise.all(players.map(({ nickname, socket }, k) => emit<{ ok: boolean }>(socket, 'player:answer', { type: 'single', optionId: k % 3 === 0 ? 'a' : 'b' }).then((ack) => expect(ack, `${nickname} answers`).toMatchObject({ ok: true }))));
    await reveal28a(host);
  };
  await playQuestion(0);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступне запитання');
  await afterSplash(host, stage);
  await playQuestion(1);
  // Половина вводить правильний код (k % 4 === 0), непарні — неправильний.
  await Promise.all(players.map(async (_, k) => expect(await enter(k, k % 4 === 0 ? CODE29G : k % 2 === 1 ? 'ЛИСА' : 'ВОВК'), `${names[k]} enters`).toEqual({ ok: true })));
  await expect.poll(() => stage.locator('.quest-strip').textContent(), POLL).toContain('скриню відкрили: 6');
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectNoSideScroll(stage, 'quest29g-24-stage');
  await expectQuestStage29g(stage, 'quest29g-24-strip');
  expect((await stage.locator('body').innerText()).toUpperCase(), 'the code on a stage with 24 players').not.toContain(CODE29G);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступне запитання');
  await afterSplash(host, stage);
  await playQuestion(2);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступне запитання');
  await afterSplash(host, stage);
  await playQuestion(3);
  await step27a(host, 'Далі');
  await stage.locator('.quest-stage.is-window').waitFor();
  // У вікні решта правильних вводить код.
  await Promise.all(players.map(async (_, k) => (k % 4 === 2 ? expect(await enter(k, CODE29G), `${names[k]} enters in the window`).toEqual({ ok: true }) : undefined)));
  await expect.poll(() => stage.locator('.quest-row.is-solved').count(), POLL).toBeGreaterThan(0);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectQuestStage29g(stage, 'quest29g-24-window');
  await shot(stage, 'quest29g-24-window');
  await click(host, 'Показати код');
  await stage.locator('.quest-stage.is-shown .quest-table').waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectNoSideScroll(stage, 'quest29g-24-shown');
  await expectQuestStage29g(stage, 'quest29g-24-shown');
  expect((await stage.locator('.quest-stage .quest-cell').allTextContents()).join('')).toBe(CODE29G);
  await shot(stage, 'quest29g-24-shown');

  expect(problems).toEqual([]);
}
