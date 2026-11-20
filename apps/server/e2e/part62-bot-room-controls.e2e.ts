import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { LOBBY_POLL_MS } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { adminEmails } from '../src/config';
import { user } from '../src/db/schema';
import { bodyText, click, expectNoSideScroll, field, homeCodeField, open, pilotSocket, register, socketFrames, stateViews } from './helpers/common';
import { ARTIFACTS, base, browser, contexts, ctx, db, exact, flags, problems, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 62 — керування кімнатою бота з вкладки «Бот»: кімната в списку лобі з «Квіз-бот», пароль із замком і запитом при вході,
 * прихована кімната, вилучення гравця, «+30 с» і «Пропустити запитання» без відповідей на картці, рядки журналу без пароля, не-адмін отримує 404; телефон 360 px, світла тема.
 */

useE2eServer();

it('part 62: bot room controls — a bot room is in the lobby list with «Квіз-бот», a password puts a lock and is asked on join, a hidden room is not listed, the admin kicks a player, adds 30 s and skips the question from the bot tab with log lines and no answers on the card; phone 360 px, light theme', async () => {
  const sockets: Socket[] = [];
  try {
    await controls62(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
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
/** Кадр лише видимої частини екрана 360 × 740: що бачить людина без прокручування. */
const viewportShot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}-viewport.png`) });
};
/** Кадр екрана й повного, без бокового скролу. */
const view = async (page: Page, name: string) => {
  await viewportShot(page, name);
  await expectNoSideScroll(page, name);
};

const TITLE = 'Річки й гори 62';
const SECRET = 'сова62';
const WRONG = 'сова00';
const RIGHT_ANSWERS = ['Дніпро 62', 'Говерла 62'];

const question = (id: string, text: string, options: string[], correct: number) => ({
  id,
  type: 'single',
  text,
  imageUrl: null,
  video: null,
  timeLimit: 60,
  points: 1000,
  options: options.map((option, i) => ({ id: `${id}${i}`, text: option })),
  correctId: `${id}${correct}`,
});

/** Поле імені (і пароля) форми входу; нік профілю підставляється сам, тож повторюємо fill. */
async function fillJoin(page: Page, nickname: string, password?: string) {
  const input = field(page, 'Ваше ім’я');
  await input.fill(nickname);
  if ((await input.inputValue()) !== nickname) await input.fill(nickname);
  if (password !== undefined) await field(page, 'Пароль гри').fill(password);
}

async function controls62(sockets: Socket[]) {
  const ADMIN_EMAIL = 'admin62@example.com';

  // ── 0. Сервер з адміном; «Адмін 62», Оля й Тарас (акаунти, не адміни). ──
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }) });
  flags.restarting = false;
  const named: Record<string, Page> = {};
  for (const [key, name, email] of [
    ['admin', 'Адмін 62', ADMIN_EMAIL],
    ['olya', 'Оля', 'olya62@example.com'],
    ['taras', 'Тарас', 'taras62@example.com'],
  ] as const) {
    const page = await light(await open(`${key}62`, 360, 740));
    await register(page, 'menu', name, email);
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: name, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olya, taras } = named as Record<'admin' | 'olya' | 'taras', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const olyaFrames = socketFrames(olya);

  // ── Вікторина «Річки й гори 62»: три «single» по 60 с, правильні «Дніпро 62», «Говерла 62» і «Ні» (так/ні). ──
  const quiz = {
    ...makeRoundsQuiz(
      [
        classicRound(
          'c62',
          [
            question('r62a', 'Яка річка тече через Київ?', ['Дніпро 62', 'Десна 62', 'Прип’ять 62'], 0),
            question('r62b', 'Найвища гора України?', ['Піп Іван 62', 'Говерла 62', 'Петрос 62'], 1),
            question('r62c', 'Дніпро впадає в Балтійське море?', ['Так', 'Ні'], 1),
          ] as never[],
          { title: 'Річки', speedBonus: false, shuffleOptions: false },
        ),
      ],
      { leaderboard: 'end' },
    ),
    title: TITLE,
  };
  const created = await admin.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(created.status(), await created.text()).toBeLessThan(300);

  const rooms = admin.locator('section[aria-labelledby="admin-bot-rooms"]');
  const botQuizzes = admin.locator('section[aria-labelledby="admin-bot-quizzes"]');
  const copySection = admin.locator('section[aria-labelledby="admin-bot-copy"]');
  const noticeText = async () => (await admin.getByRole('status').filter({ hasText: /Кімнату \d{6} створено\./ }).first().textContent({ timeout: 2_000 }).catch(() => '')) ?? '';

  // ── 1. Копія вікторини боту, «Запустити гру» → картка «Лобі» з прапорцем «Показувати в списку лобі» увімкненим. ──
  await admin.goto(`${base}/admin/bot`);
  expect(await isLight(admin)).toBe(true);
  await copySection.locator('li', { hasText: TITLE }).waitFor();
  await copySection.getByRole('button', { name: 'Передати боту копію', ...exact }).click();
  await admin.getByRole('status').filter({ hasText: `Копію «${TITLE}» передано боту.` }).waitFor();
  await botQuizzes.locator('li', { hasText: TITLE }).waitFor();
  await botQuizzes.getByRole('button', { name: 'Запустити гру', ...exact }).click();
  await admin.getByRole('status').filter({ hasText: /Кімнату \d{6} створено\./ }).waitFor();
  const code = /(\d{6})/.exec(await noticeText())![1]!;
  const card = rooms.locator('li.admin-card', { hasText: `Код ${code}` });
  await card.waitFor();
  await card.locator('.admin-mark', { hasText: 'Лобі' }).waitFor();
  const listed = card.getByLabel('Показувати в списку лобі', exact);
  expect(await listed.isChecked(), 'a new bot room is listed').toBe(true);
  expect(await card.getByText('з паролем', exact).count(), 'a lock before any password').toBe(0);

  // ── 2. Оля на «/»: рядок «Річки й гори 62» з ведучим «Квіз-бот» і його картинкою. ──
  const rowOf = (page: Page) => page.locator('section.lobby-list a.lobby-row', { hasText: TITLE });
  const toList = async (page: Page) => {
    await page.goto(base);
    await homeCodeField(page);
    await page.locator('section.lobby-list').waitFor();
  };
  await toList(olya);
  const row = rowOf(olya);
  await row.waitFor();
  expect(await row.textContent()).toContain('Квіз-бот');
  expect(await row.locator('img[src="/quiz-bot.svg"]').count(), 'the bot picture in the row').toBeGreaterThan(0);
  expect(await row.getByRole('img', { name: 'з паролем', ...exact }).count(), 'a lock before any password').toBe(0);
  await olya.locator('section.lobby-list').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await view(olya, 'bot62-lobby-list-360');

  // ── 3. Пароль «сова62» → «Збережено»; у Олі замок; без пароля не ввійти, хибний — помилка, правильний — «Ви в грі». ──
  await card.getByLabel('Пароль гри (необов’язково)', exact).fill(SECRET);
  await card.getByRole('button', { name: 'Зберегти пароль', ...exact }).click();
  await expect.poll(() => card.getByText('з паролем', exact).count(), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect.poll(() => rowOf(olya).getByRole('img', { name: 'з паролем', ...exact }).count(), { timeout: LOBBY_POLL_MS * 3 }).toBe(1);
  const lobbies = await olya.request.get(`${base}/api/lobbies`);
  expect(lobbies.status()).toBe(200);
  const lobbiesBody = await lobbies.text();
  expect(lobbiesBody, 'the lobby list says the room is locked').toContain('"locked":true');
  expect(lobbiesBody, 'the password in the lobby list').not.toContain(SECRET);
  await olya.locator('section.lobby-list').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await view(olya, 'bot62-lobby-list-locked-360');
  // Тарас без пароля й з хибним — відмова (мережею, без браузера).
  const attempt = (password?: string) =>
    fetch(`${base}/api/games/by-code/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'Підбирач', ...(password === undefined ? {} : { password }) }) });
  const none = await attempt();
  expect([none.status, ((await none.json()) as { error: string }).error]).toEqual([403, 'password_required']);
  const wrong = await attempt(WRONG);
  expect([wrong.status, ((await wrong.json()) as { error: string }).error]).toEqual([403, 'password_wrong']);

  await rowOf(olya).click();
  await olya.waitForURL(`${base}/play/${code}`);
  const asked = field(olya, 'Пароль гри');
  await asked.waitFor();
  await fillJoin(olya, 'Оля', WRONG);
  await click(olya, 'Увійти в гру');
  await olya.getByText('Неправильний пароль. Перевір і спробуй ще').waitFor();
  await viewportShot(olya, 'bot62-password-360');
  await asked.fill(SECRET);
  await click(olya, 'Увійти в гру');
  await olya.getByText('Ви в грі. Чекаємо на старт.').waitFor();
  expect(await bodyText(olya), 'the password on the player page').not.toContain(SECRET);
  await expectNoSideScroll(olya, 'bot62-password-360-full');

  // ── 4. Без прапорця «Показувати в списку лобі» рядка в Тараса немає; вхід кодом з паролем; з прапорцем — рядок знову. ──
  await toList(taras);
  await rowOf(taras).waitFor();
  await listed.click();
  await expect.poll(() => listed.isChecked(), { timeout: 10_000 }).toBe(false);
  await expect.poll(() => rowOf(taras).count(), { timeout: LOBBY_POLL_MS * 3 }).toBe(0);
  expect(await taras.locator('section.lobby-list').getByRole('link', { name: new RegExp(TITLE) }).count()).toBe(0);
  expect((await (await taras.request.get(`${base}/api/lobbies`)).text()), 'a hidden room in the lobby list').not.toContain(TITLE);
  await taras.goto(`${base}/play/${code}`);
  await fillJoin(taras, 'Тарас', SECRET);
  await click(taras, 'Увійти в гру');
  await taras.getByText('Ви в грі. Чекаємо на старт.').waitFor();
  await listed.click();
  await expect.poll(() => listed.isChecked(), { timeout: 10_000 }).toBe(true);
  await toList(taras);
  await expect.poll(async () => { await toList(taras); return rowOf(taras).count(); }, { timeout: LOBBY_POLL_MS * 3 }).toBe(1);

  // ── 5. Петро (сокет) входить кодом із паролем; у «Гравці» троє; «Вилучити» біля Петра → сокет отримує kicked, лишається двоє. ──
  const joined = await fetch(`${base}/api/games/by-code/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'Петро', password: SECRET }) });
  expect(joined.status).toBe(201);
  const petro = await pilotSocket(sockets, code, ((await joined.json()) as { token: string }).token, 'Петро');
  const peopleList = card.locator('.admin-bot-room-list li');
  await expect
    .poll(
      async () => {
        await click(admin, 'Оновити');
        return peopleList.count();
      },
      { timeout: 15_000, interval: 500 },
    )
    .toBe(3);
  expect(await card.getByRole('heading', { name: 'Гравці', ...exact }).count()).toBe(1);
  for (const name of ['Оля', 'Тарас', 'Петро']) expect(await peopleList.filter({ hasText: name }).count(), name).toBe(1);
  await card.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await viewportShot(admin, 'bot62-room-lobby-360');
  await card.locator('.admin-bot-room-people').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await viewportShot(admin, 'bot62-room-people-360');
  await peopleList.filter({ hasText: 'Петро' }).getByRole('button', { name: 'Вилучити', ...exact }).click();
  await expect.poll(() => petro.closed, { timeout: 10_000 }).toContain('kicked');
  await expect.poll(() => peopleList.count(), { timeout: 10_000 }).toBe(2);
  await card.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await view(admin, 'bot62-room-lobby-360');

  // Те саме в темній темі: окремі контексти з тими самими входами, без ключа теми.
  const darkOf = async (source: Page) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'uk-UA', colorScheme: 'dark', storageState: { cookies: (await source.context().storageState()).cookies, origins: [] } });
    contexts.push(context);
    return context.newPage();
  };
  const darkAdmin = await darkOf(admin);
  await darkAdmin.goto(`${base}/admin/bot`);
  const darkCard = darkAdmin.locator('li.admin-card', { hasText: `Код ${code}` });
  await darkCard.waitFor();
  expect(await isLight(darkAdmin), 'the dark page is dark').toBe(false);
  await darkCard.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await view(darkAdmin, 'bot62-room-lobby-dark-360');
  await darkCard.locator('.admin-bot-room-people').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await viewportShot(darkAdmin, 'bot62-room-people-dark-360');
  await darkAdmin.close();
  const darkOlya = await darkOf(olya);
  await toList(darkOlya);
  await rowOf(darkOlya).waitFor();
  await darkOlya.locator('section.lobby-list').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  expect(await isLight(darkOlya), 'the dark page is dark').toBe(false);
  await view(darkOlya, 'bot62-lobby-list-dark-360');
  await darkOlya.close();

  // ── 6. «Почати гру»; на запитанні «+30 с» і «Пропустити запитання», у картці й JSON немає відповіді. ──
  await card.getByRole('button', { name: 'Почати гру', ...exact }).click();
  await card.locator('.admin-mark', { hasText: 'Гра йде' }).waitFor();
  const skip = card.getByRole('button', { name: 'Пропустити запитання', ...exact });
  const plus = card.getByRole('button', { name: '+30 с', ...exact });
  await expect
    .poll(
      async () => {
        await click(admin, 'Оновити');
        return skip.count();
      },
      { timeout: 90_000, interval: 700 },
    )
    .toBe(1);
  expect(await plus.count(), '+30 s on an open question').toBe(1);
  const mainText = await admin.locator('main').innerText();
  for (const answer of RIGHT_ANSWERS) expect(mainText, `the answer ${answer} on the bot tab`).not.toContain(answer);
  for (const text of ['Яка річка', 'Піп Іван', 'Десна 62', 'Балтійське']) expect(mainText, `question text «${text}» on the bot tab`).not.toContain(text);
  const botJson = await (await admin.request.get(`${base}/api/admin/bot`)).text();
  for (const answer of [...RIGHT_ANSWERS, 'Десна 62', 'Яка річка']) expect(botJson, `the answer ${answer} in the bot JSON`).not.toContain(answer);
  expect(botJson, 'the password in the bot JSON of a started game is allowed only as the lobby password').toContain(SECRET);

  const deadline = () => stateViews(olyaFrames).filter((v) => v.phase === 'question' && v.endsAt !== null).at(-1)?.endsAt ?? null;
  await expect.poll(deadline, { timeout: 10_000 }).not.toBeNull();
  const before = deadline()!;
  await plus.click();
  await expect.poll(() => (deadline() ?? 0) - before, { timeout: 10_000 }).toBeGreaterThanOrEqual(29_000);
  await card.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await view(admin, 'bot62-room-playing-360');

  await skip.click();
  await expect.poll(() => stateViews(olyaFrames).some((v) => v.phase === 'reveal'), { timeout: 20_000 }).toBe(true);
  await olya.locator('.reveal, section.result, .result').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  await expect
    .poll(
      async () => {
        await click(admin, 'Оновити');
        return skip.count();
      },
      { timeout: 10_000, interval: 400 },
    )
    .toBe(0);

  // ── 7. Пауза: «+30 с», «Пропустити запитання», «Завершити раунд» зникли; «Продовжити» → «Завершити гру». ──
  await card.getByRole('button', { name: 'Пауза', ...exact }).click();
  await card.locator('.admin-mark', { hasText: 'Пауза' }).waitFor();
  for (const name of ['+30 с', 'Пропустити запитання', 'Завершити раунд']) expect(await card.getByRole('button', { name, ...exact }).count(), `«${name}» on pause`).toBe(0);
  await card.getByRole('button', { name: 'Продовжити', ...exact }).click();
  await card.locator('.admin-mark', { hasText: 'Гра йде' }).waitFor();
  await card.getByRole('button', { name: 'Завершити гру', ...exact }).click();
  await card.locator('.admin-mark', { hasText: 'Кінець' }).waitFor();

  // ── 8. Журнал: лобі, вилучення, початок, +30 с, пропуск — і жодного пароля. ──
  await admin.goto(`${base}/admin/log`);
  const lobbyLine = (what: string) => new RegExp(`змінив\\(-ла\\) лобі гри бота \\(код ${code}\\): ${what}`);
  await admin.getByText(lobbyLine('у списку лобі, з паролем')).first().waitFor();
  await admin.getByText(lobbyLine('лише за кодом, з паролем')).first().waitFor();
  await admin.getByText('вилучив(-ла) Петро з гри бота', { exact: false }).first().waitFor();
  await admin.getByText('почав(-ла) гру бота', { exact: false }).first().waitFor();
  await admin.getByText('додав(-ла) 30 с у грі бота', { exact: false }).first().waitFor();
  await admin.getByText('пропустив(-ла) запитання в грі бота', { exact: false }).first().waitFor();
  const logText = await admin.locator('main').innerText();
  expect(logText, 'the password in the log').not.toContain(SECRET);
  expect(logText, 'an email in the log').not.toContain('@');
  await view(admin, 'bot62-log-360');

  // ── 9. Не-адмін: лобі й вилучення — 404, як невідомий маршрут. ──
  const put = await olya.request.put(`${base}/api/admin/bot/rooms/${code}/lobby`, { data: { listed: true, password: null } });
  expect(put.status()).toBe(404);
  const kicked = await olya.request.post(`${base}/api/admin/bot/rooms/${code}/kick`, { data: { playerId: 'someone' } });
  expect(kicked.status()).toBe(404);
  const unexpected = problems.filter((line) => !/ (403|404|409) .*\/api\/(admin\/bot|games\/by-code)/.test(line));
  expect(unexpected, `page errors (${unexpected.length}):\n${unexpected.join('\n')}`).toEqual([]);
}
