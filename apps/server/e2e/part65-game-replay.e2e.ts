import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { DEFAULT_RULES } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { adminEmails } from '../src/config';
import { game, gameEvent, user } from '../src/db/schema';
import { click, expectNoSideScroll, field, join, myId, next27a, open, POLL, reveal28a, register, sleep, step27a, takeBuff, textAnswer, pickOption } from './helpers/common';
import { ARTIFACTS, base, browser, contexts, ctx, db, exact, flags, problems, relisten, snapshot, useE2eServer, afterSplash } from './helpers/setup';

/**
 * Наскрізні тести: частина 65 — повтор гри для адміністратора: коротка гра з текстовим і двома вибірковими запитаннями, ручне рішення ведучого,
 * апеляція, яку виграв зал, баф, пауза, пізнє приєднання й вилучення; адмін проходить гру по кроках на широкому екрані й на телефоні 360 px (світла тема);
 * стара гра (без подій) показує примітку й прочерки; перегляд — один рядок журналу; не-адміну — 404.
 */

useE2eServer();

it('part 65: game replay — a short game with a text and two choice questions, a host decision, an appeal won by the hall, a buff, a pause, a late join and a kick, replayed step by step by the admin on a wide screen and a 360 px phone in the light theme; an old game shows the note and dashes; the view is logged once; 404 to a player', async () => {
  try {
    await replay65();
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    // Сервер лишається з адміном лише на цей тест.
    flags.restarting = true;
    await ctx.shutdown().catch(() => undefined);
    await relisten();
    flags.restarting = false;
  }
}, 1_200_000);

const light = async (page: Page) => {
  await page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  return page;
};
const isLight = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('is-light'));
/** Кадр лише видимої частини екрана: що бачить людина без прокручування. */
const viewportShot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}-viewport.png`) });
};
/** Кадр екрана (повний і видимий) і перевірка без бокового скролу. */
const view = async (page: Page, name: string) => {
  await viewportShot(page, name);
  await expectNoSideScroll(page, name);
};

const TITLE = 'Повтор 65';
const Q1 = 'Як називається найбільша річка України?';
const Q2 = 'Скільки областей в Україні?';
const Q3 = 'Яке місто — столиця Львівської області?';

const card = (page: Page) => page.locator('section.replay-step');
const rowOf = (page: Page, name: string) => card(page).locator('li.replay-row').filter({ has: page.locator('.replay-player', { hasText: name }) });
const cellOf = (page: Page, name: string, cell: 'answer' | 'time' | 'verdict' | 'points' | 'score') => rowOf(page, name).locator(`.replay-${cell} .replay-value`).innerText();
const eventTexts = async (page: Page) => (await card(page).locator('ul.replay-events li').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
const jump = (page: Page) => page.locator('.replay-nav select');

/** Відкриває повтор гри за адресою й чекає крок n (від 1). */
async function openStep(page: Page, gameId: string, n: number) {
  await page.goto(`${base}/admin/games/${gameId}/replay?q=${n}`);
  await card(page).waitFor();
  await page.locator('.replay-nav-buttons [role="status"]', { hasText: `Запитання ${n} з 3` }).waitFor();
}

async function replay65() {
  const ADMIN_EMAIL = 'admin65@example.com';

  // ── 0. Сервер з адміном; адмін «Адмін 65» веде гру, Оля, Петро, Марко й (пізніше) Ірина — гості на телефонах 360 × 740, світла тема. ──
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }) });
  flags.restarting = false;
  const admin = await light(await open('admin65', 1280, 800));
  await register(admin, 'menu', 'Адмін 65', ADMIN_EMAIL);
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const adminId = await myId(admin);

  const common = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
  const q1 = { ...common, id: 'q65-1', type: 'text' as const, text: Q1, accepted: ['Дніпро'] };
  const q2 = {
    ...common,
    id: 'q65-2',
    type: 'single' as const,
    text: Q2,
    options: [{ id: 'q2-a', text: '24' }, { id: 'q2-b', text: '20' }, { id: 'q2-c', text: '27' }, { id: 'q2-d', text: '22' }],
    correctId: 'q2-a',
  };
  const q3 = {
    ...common,
    id: 'q65-3',
    type: 'single' as const,
    text: Q3,
    options: [{ id: 'q3-a', text: 'Львів' }, { id: 'q3-b', text: 'Дрогобич' }, { id: 'q3-c', text: 'Червоноград' }, { id: 'q3-d', text: 'Стрий' }],
    correctId: 'q3-a',
  };
  const data = {
    ...makeRoundsQuiz([classicRound('r65', [q1, q2, q3] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES })], { buffs: ['double'], debuffs: [] }),
    title: TITLE,
  };
  const saved = await admin.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await admin.goto(`${base}/quizzes`);
  await admin.locator('.quiz-list li', { hasText: TITLE }).getByRole('button', { name: 'Грати', ...exact }).click();
  await admin.waitForURL(/\/host\/\d{6}$/);
  const code = admin.url().slice(-6);
  // Оля, Петро й Марко — із акаунтами: після збереження гри й продовження кожен повертається на своє місце сам.
  const olya = await light(await open('olya65', 360, 740));
  const petro = await light(await open('petro65', 360, 740));
  const marko = await light(await open('marko65', 360, 740));
  const iryna = await light(await open('iryna65', 360, 740));
  await register(olya, 'menu', 'Оля', 'olya65@example.com');
  await register(petro, 'menu', 'Петро', 'petro65@example.com');
  await register(marko, 'menu', 'Марко', 'marko65@example.com');
  const playerIds = [await myId(olya), await myId(petro), await myId(marko)];
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(marko, code, 'Марко', false);
  const phones = [olya, petro, marko];
  const all = [admin, ...phones];
  const playerRow = (name: string) => admin.locator('.player-row', { has: admin.locator('.name', { hasText: new RegExp(`^${name}$`) }) });

  await click(admin, 'Почати гру');
  await afterSplash(...all);
  await click(admin, 'Почати раунд');
  await afterSplash(...all);

  // ── 1. Запитання 1 (текст): Оля — «Дніпро», Петро — написання з двома латинськими літерами (одруківка в одну літеру ще прощається), Марко мовчить; ведучий зараховує Петра вручну. ──
  for (const page of phones) await page.locator('h1', { hasText: Q1 }).waitFor();
  await textAnswer(olya, 'Дніпро');
  await textAnswer(petro, 'Днiпрo');
  await reveal28a(admin);
  const petroRowOnHost = admin.locator('.rows li', { hasText: 'Петро' }).first();
  await petroRowOnHost.getByRole('button', { name: 'Зарахувати', ...exact }).click();
  await petroRowOnHost.getByRole('button', { name: 'Зарахувати', ...exact }).waitFor({ state: 'detached' });
  await expect.poll(async () => (await playerRow('Петро').locator('.score').textContent())?.trim(), POLL).toBe('100');

  // Пізно приєднатися до гри, що вже йде, можна лише в продовженій: ведучий зберігає гру на початку запитання 2 й продовжує з історії;
  // Оля, Петро й Марко повертаються на свої місця, Ірина приєднується новенькою — подія приєднання після запитання 1.
  await next27a(admin);
  await afterSplash(...all);
  await step27a(admin, 'Зберегти й продовжити пізніше');
  for (const page of [admin, ...phones]) await page.getByText('Гру збережено — продовжимо пізніше.', exact).first().waitFor();
  await admin.getByRole('link', { name: 'До історії ігор', ...exact }).click();
  await admin.waitForURL(/\/history$/);
  await admin.locator('section.saved-games li.is-saved', { hasText: TITLE }).getByRole('button', { name: 'Продовжити', ...exact }).click();
  await admin.waitForURL(/\/host\/\d{6}$/);
  const next = admin.url().slice(-6);
  expect(next, 'the continuation opens a new code').not.toBe(code);
  for (const page of phones) await page.goto(`${base}/play/${next}`);
  await iryna.goto(`${base}/play/${next}`);
  await field(iryna, 'Ваше ім’я').fill('Ірина');
  await click(iryna, 'Увійти в гру');
  for (const name of ['Оля', 'Петро', 'Марко', 'Ірина']) await playerRow(name).waitFor();
  await admin.getByRole('button', { name: 'Продовжити', ...exact }).last().click();

  // ── 2. Запитання 2: Оля бере «Подвійні бали», пауза ~3 с, Марко відповідає неправильно й оскаржує, зал голосує «так». ──
  await step27a(admin, 'Наступне запитання');
  await afterSplash(...all, iryna);
  for (const page of [...phones, iryna]) await page.locator('h1', { hasText: Q2 }).waitFor();
  await takeBuff(olya, 'Подвійні бали');
  await admin.getByRole('button', { name: 'Пауза', ...exact }).first().click();
  const resume = admin.getByRole('button', { name: 'Продовжити', ...exact }).first();
  await resume.waitFor();
  await sleep(3000);
  await resume.click();
  await resume.waitFor({ state: 'detached' });
  await pickOption(olya, '24');
  await pickOption(petro, '24');
  await pickOption(marko, '20');
  await pickOption(iryna, '24');
  await reveal28a(admin);
  const appealButton = marko.locator('button.appeal-button');
  await appealButton.waitFor();
  await appealButton.click();
  for (const page of [olya, petro, iryna]) {
    const sheet = page.locator('section.appeal-sheet');
    await sheet.waitFor();
    await sheet.getByRole('button', { name: 'Так', ...exact }).click();
  }
  await expect.poll(async () => squash((await marko.locator('p.appeal-result').first().textContent({ timeout: 500 }).catch(() => null)) ?? ''), POLL).toMatch(/Зараховано! \+100/);

  // ── 3. Запитання 3: ведучий вилучає Ірину, інші відповідають; фініш. ──
  await next27a(admin);
  await afterSplash(...all);
  for (const page of phones) await page.locator('h1', { hasText: Q3 }).waitFor();
  await playerRow('Ірина').getByRole('button', { name: 'Вилучити', ...exact }).click();
  await playerRow('Ірина').waitFor({ state: 'detached' });
  for (const page of phones) await pickOption(page, 'Львів');
  await reveal28a(admin);
  await click(admin, 'Завершити гру');
  for (const page of phones) await page.getByText('Гру завершено').first().waitFor({ timeout: 30_000 });

  // Гра записана як завершена, і рекордер записав усі види подій цього сценарію.
  const [row] = await db.select({ id: game.id }).from(game).where(eq(game.title, TITLE));
  expect(row, 'the game is in the database').toBeDefined();
  const gameId = row!.id;
  await expect
    .poll(async () => {
      const [state] = await db.select({ status: game.status }).from(game).where(eq(game.id, gameId));
      const kinds = (await db.select({ kind: gameEvent.kind }).from(gameEvent).where(eq(gameEvent.gameId, gameId))).map((one) => one.kind);
      return state?.status === 'finished' ? [...new Set(kinds)].sort() : null;
    }, { timeout: 30_000 })
    .toEqual(['join', 'leave', 'pause', 'resume', 'start', 'verdict']);

  // ── 4. Адмін на широкому екрані: перегляд гри → «Повтор по кроках». ──
  await admin.setViewportSize({ width: 1280, height: 800 });
  await admin.goto(`${base}/admin/games/${gameId}`);
  expect(await isLight(admin), 'the admin page is light').toBe(true);
  await admin.locator('ol.standings li').first().waitFor();
  const table: Record<string, string> = {};
  for (const item of await admin.locator('ol.standings li').all()) table[(await item.locator('.name').innerText()).trim()] = (await item.locator('.score').innerText()).trim();
  for (const name of ['Оля', 'Петро', 'Марко']) expect(table[name], `${name} is in the table`).toBeDefined();
  await admin.getByRole('link', { name: 'Повтор по кроках', ...exact }).click();
  await admin.waitForURL(`${base}/admin/games/${gameId}/replay`);
  await card(admin).waitFor();
  await admin.getByRole('heading', { name: `Повтор: «${TITLE}»`, ...exact }).waitFor();
  expect(await admin.locator('.replay-note').count(), 'a new game has no «played before events» note').toBe(0);

  // Крок 1: текст — Оля зараховано з часом, Петро зараховано вручну, подія ручного рішення й приєднання Ірини.
  await admin.locator('.replay-nav-buttons [role="status"]', { hasText: 'Запитання 1 з 3' }).waitFor();
  expect(squash(await card(admin).locator('h3').first().innerText())).toBe(Q1);
  expect(await cellOf(admin, 'Оля', 'answer')).toContain('Дніпро');
  const olyaTime = (await cellOf(admin, 'Оля', 'time')).trim();
  expect(olyaTime, 'a time in seconds').toMatch(/^\d+,\d$/);
  expect((await cellOf(admin, 'Оля', 'verdict')).trim()).toBe('зараховано');
  expect((await cellOf(admin, 'Петро', 'verdict')).trim()).toBe('зараховано (вручну)');
  expect((await cellOf(admin, 'Марко', 'verdict')).trim(), 'Марко stayed silent').toBe('—');
  let events = await eventTexts(admin);
  expect(events).toContain('Петро: ведучий вирішив вручну — не зараховано → зараховано');
  expect(events.some((line) => /приєднався\(-лася\) Ірина$/.test(line)), `Ірина's join in ${JSON.stringify(events)}`).toBe(true);
  await view(admin, 'part65-replay-step1-wide');

  // Крок 2: баф Олі, пауза з секундами, апеляція Марка й її коригування.
  await click(admin, 'Далі →');
  await admin.waitForURL(`${base}/admin/games/${gameId}/replay?q=2`);
  await admin.locator('.replay-nav-buttons [role="status"]', { hasText: 'Запитання 2 з 3' }).waitFor();
  expect(squash(await card(admin).locator('h3').first().innerText())).toBe(Q2);
  events = await eventTexts(admin);
  expect(events, 'the buff of Оля').toContain('Оля: баф «Подвійні бали»');
  expect(events.some((line) => /пауза [3-5] с$/.test(line)), `a pause of about 3 s in ${JSON.stringify(events)}`).toBe(true);
  expect(events.some((line) => /^Марко оскаржує: .*зараховано \d:\d/.test(line)), `the appeal of Марко in ${JSON.stringify(events)}`).toBe(true);
  expect(events).toContain('Марко: +100 — Апеляція');
  expect((await cellOf(admin, 'Оля', 'points')).trim(), 'the buff doubles the points').toBe('200');
  expect((await cellOf(admin, 'Марко', 'verdict')).trim()).toBe('не зараховано');
  await view(admin, 'part65-replay-step2-wide');

  // Крок 3 — вибором у списку: вилучення Ірини з рахунком; останній рахунок кожного збігається з підсумками гри.
  expect(await jump(admin).locator('optgroup').getAttribute('label')).toBe('Раунд 1. Розминка');
  expect(await jump(admin).locator('option').count()).toBe(3);
  await jump(admin).selectOption('2');
  await admin.waitForURL(`${base}/admin/games/${gameId}/replay?q=3`);
  await admin.locator('.replay-nav-buttons [role="status"]', { hasText: 'Запитання 3 з 3' }).waitFor();
  events = await eventTexts(admin);
  expect(events.some((line) => /вилучено Ірина \(рахунок 100\)$/.test(line)), `the kick of Ірина in ${JSON.stringify(events)}`).toBe(true);
  for (const name of ['Оля', 'Петро', 'Марко']) expect((await cellOf(admin, name, 'score')).trim(), `${name}: the last score is the table score`).toBe(table[name]);
  expect(await admin.getByRole('button', { name: 'Далі →', ...exact }).isDisabled(), 'no step after the last').toBe(true);
  await view(admin, 'part65-replay-step3-wide');

  // ── 5. Те саме на телефоні 360 × 740 (світла тема), потім темна тема. ──
  const phone = await light(await open('adminphone65', 360, 740));
  await phone.context().addCookies((await admin.context().storageState()).cookies);
  const darkContext = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'uk-UA', colorScheme: 'dark', storageState: { cookies: (await admin.context().storageState()).cookies, origins: [] } });
  contexts.push(darkContext);
  const dark = await darkContext.newPage();
  dark.on('pageerror', (error) => problems.push(`dark: ${error.message} @ ${dark.url()}`));
  for (const [page, suffix] of [[phone, 'phone'], [dark, 'dark']] as const) {
    await openStep(page, gameId, 1);
    if (page === phone) expect(await isLight(page), 'the phone replay is light').toBe(true);
    else expect(await isLight(page), 'the dark replay is dark').toBe(false);
    // На телефоні в рядку видно підписи полів.
    expect(await rowOf(page, 'Оля').locator('.replay-label').first().isVisible(), `${suffix}: field labels are shown`).toBe(true);
    expect((await cellOf(page, 'Оля', 'time')).trim()).toBe(olyaTime);
    expect((await cellOf(page, 'Петро', 'verdict')).trim()).toBe('зараховано (вручну)');
    await view(page, `part65-replay-step1-${suffix}`);
    await page.locator('ul.replay-events').scrollIntoViewIfNeeded();
    await viewportShot(page, `part65-replay-step1-events-${suffix}`);
    await openStep(page, gameId, 2);
    expect(await eventTexts(page)).toContain('Оля: баф «Подвійні бали»');
    await view(page, `part65-replay-step2-${suffix}`);
    await page.locator('ul.replay-events').scrollIntoViewIfNeeded();
    await viewportShot(page, `part65-replay-step2-events-${suffix}`);
    // Список переходу: три запитання під заголовком раунду; вибір веде на крок 3.
    await page.evaluate(() => scrollTo(0, 0));
    await jump(page).focus();
    await viewportShot(page, `part65-replay-jump-${suffix}`);
    await jump(page).selectOption('2');
    await page.waitForURL(`${base}/admin/games/${gameId}/replay?q=3`);
    await page.locator('.replay-nav-buttons [role="status"]', { hasText: 'Запитання 3 з 3' }).waitFor();
    expect((await eventTexts(page)).some((line) => /вилучено Ірина \(рахунок 100\)$/.test(line))).toBe(true);
    await view(page, `part65-replay-step3-${suffix}`);
    // Місця дотику: кнопки «Назад» / «Далі» і список переходу не нижчі за 36 px, у межах екрана.
    for (const box of [await page.getByRole('button', { name: '← Назад', ...exact }).boundingBox(), await page.getByRole('button', { name: 'Далі →', ...exact }).boundingBox(), await jump(page).boundingBox()]) {
      expect(box, `${suffix}: a navigation control is shown`).not.toBeNull();
      expect(box!.height, `${suffix}: a tap target is too low (${box!.height}px)`).toBeGreaterThanOrEqual(36);
      expect(box!.x + box!.width, `${suffix}: a control is out of the screen`).toBeLessThanOrEqual(360);
    }
  }

  // ── 6. Журнал: кілька переглядів у межах хвилини — один рядок; не-адміну — 404. ──
  const replayUrl = `${base}/api/admin/games/${gameId}/replay`;
  // Три запити підряд: перший міг записати рядок (якщо від попереднього перегляду минула хвилина), решта двох — ні.
  const first = await admin.request.get(replayUrl);
  expect(first.status()).toBe(200);
  const body = await first.text();
  expect(body, 'the replay has an email').not.toContain('@');
  for (const id of [adminId, ...playerIds]) expect(body, 'the replay has an account id').not.toContain(id);
  for (let i = 0; i < 2; i += 1) expect((await admin.request.get(replayUrl)).status()).toBe(200);
  await admin.goto(`${base}/admin/log`);
  const logLine = admin.getByText(new RegExp(`переглянув\\(-ла\\) повтор гри «${TITLE}»`));
  await logLine.first().waitFor();
  expect(await logLine.count(), 'one log line for many views within a minute').toBe(1);
  await view(admin, 'part65-replay-log-wide');
  expect((await olya.request.get(replayUrl)).status(), 'a player gets 404').toBe(404);
  expect((await olya.request.get(`${base}/api/admin/games/not-a-game/replay`)).status()).toBe(404);

  // ── 7. Стара гра: без рядків game_event — примітка, прочерк в «було» ручного рішення, час відповідей той самий, без приєднань і пауз. ──
  await db.delete(gameEvent).where(eq(gameEvent.gameId, gameId));
  for (const [page, suffix] of [[phone, 'phone'], [dark, 'dark'], [admin, 'wide']] as const) {
    await openStep(page, gameId, 1);
    await page.locator('.replay-note').waitFor();
    expect(squash(await page.locator('.replay-note').innerText())).toBe('Ця гра зіграна до запису подій: приєднання, вилучення, паузи й оцінка до ручного рішення не збереглися (—).');
    events = await eventTexts(page);
    expect(events, `${suffix}: the manual decision has dashes`).toContain('Петро: ведучий вирішив вручну — — → зараховано');
    expect(events.some((line) => /приєднався/.test(line)), `${suffix}: a join survived`).toBe(false);
    expect((await cellOf(page, 'Оля', 'time')).trim(), `${suffix}: the time stays`).toBe(olyaTime);
    await view(page, `part65-replay-old-${suffix}`);
  }
  await openStep(admin, gameId, 2);
  events = await eventTexts(admin);
  expect(events.some((line) => /пауза/.test(line)), 'a pause survived in the old game').toBe(false);
  expect(events, 'the buff and the appeal stay').toContain('Оля: баф «Подвійні бали»');

  // Очікувана відповідь: 404 не-адміну (запит сторінки не пише в консоль).
  const unexpected = problems.filter((line) => !/ 404 .*\/api\/admin\//.test(line));
  expect(unexpected, `page errors (${unexpected.length}):\n${unexpected.join('\n')}`).toEqual([]);
}
