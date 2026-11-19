import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz, spy as spyQ, think, thinkRound } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { adminEmails } from '../src/config';
import { user } from '../src/db/schema';
import { bodyText, click, emitOk, expectNoSideScroll, field, frame, join, myId, open, pilotPlayer, POLL, register, sleep, socketFrames, stateViews } from './helpers/common';
import { afterSplash, ARTIFACTS, base, browser, contexts, ctx, db, exact, flags, problems, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 54 — бот-ведучий: адмін передає боту копію вікторини, запускає гру, приєднується звичайним гравцем (він у складі «Шпигуна» й пише слово «Думай інакше» без обмежень автора),
 * керує кімнатою з вкладки «Бот» (старт, пауза, продовження, кінець), доходить до межі трьох кімнат, видаляє вікторину; не-адмін отримує 404 і вкладки не бачить, бота в пошуку друзів немає; телефон 360 px, світла тема.
 */

useE2eServer();

it('part 54: bot host — the admin copies a quiz to the bot, starts a bot game, joins as a plain player who is in the spy cast and writes in think different, the players get the game in history, the log has the start, the copy and the delete; a non-admin gets no «Бот» tab and 404, the bot is not found in friend search, phone 360 px, light theme', async () => {
  const sockets: Socket[] = [];
  try {
    await bot54(sockets);
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

const WORD_FIELD = 'Напишіть одне слово-асоціацію';
const CAUGHT = 'Вас викрили! Впишіть загальне слово';
const GUESS_FIELD = 'Загальне слово';
const TITLE = 'Ліс і море 54';
const SPY_TEXT = 'Напишіть одне слово-асоціацію до загального слова';
const THINK_TEXT = 'Напишіть гарячий напій';
/** Як у «Моїх іграх»: «Провів бот» стоїть біля гри в історії. */
const AUTHOR_SPECTATOR = 'Ви автор вікторини — у цьому раунді ви глядач';
const SPY_SPECTATOR = 'Ви автор — дивіться, як грають інші';

async function bot54(sockets: Socket[]) {
  const ADMIN_EMAIL = 'admin54@example.com';

  // ── 0. Сервер з адміном; адмін «Адмін 54», Оля (акаунт, не адмін), гість. ──
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }) });
  flags.restarting = false;
  const named: Record<string, Page> = {};
  for (const [key, name, email] of [
    ['admin', 'Адмін 54', ADMIN_EMAIL],
    ['olya', 'Оля', 'olya54@example.com'],
  ] as const) {
    const page = await light(await open(`${key}54`, 360, 740));
    await register(page, 'menu', name, email);
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: name, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olya } = named as Record<'admin' | 'olya', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const guest = await light(await open('guest54', 360, 740));
  const adminId = await myId(admin);

  // ── Вікторина «Ліс і море 54»: «Шпигун» (таймер 40 с, голосування 30 с) і «Думай інакше» з одним словом ведучого (60 с). ──
  const quiz = {
    ...makeRoundsQuiz(
      [
        classicRound('c54', [spyQ as never], { title: 'Ліс', speedBonus: false, shuffleOptions: false }),
        thinkRound(
          't54',
          [
            think('t54a', [{ word: 'кава', synonyms: [] }], { text: THINK_TEXT, timeLimit: 60 }),
            think('t54b', [{ word: 'м’яч', synonyms: [] }], { text: 'Напишіть іграшку', timeLimit: 60 }),
            think('t54c', [{ word: 'дощ', synonyms: [] }], { text: 'Напишіть погоду восени', timeLimit: 60 }),
          ],
          { lives: 2, points: 1000 },
        ),
      ],
      { leaderboard: 'end' },
    ),
    title: TITLE,
  };
  const saved = await admin.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(saved.status(), await saved.text()).toBeLessThan(300);

  const rooms = admin.locator('section[aria-labelledby="admin-bot-rooms"]');
  const botQuizzes = admin.locator('section[aria-labelledby="admin-bot-quizzes"]');
  const copySection = admin.locator('section[aria-labelledby="admin-bot-copy"]');
  const noticeText = async () => (await admin.getByRole('status').first().textContent().catch(() => '')) ?? '';

  // ── 1. «Передати боту копію» → вікторина у «Вікторини бота»; без email і без бокового скролу. ──
  await admin.goto(`${base}/admin/bot`);
  expect(await isLight(admin)).toBe(true);
  await admin.locator('.admin-tabs').getByRole('link', { name: 'Бот', ...exact }).waitFor();
  await copySection.locator('li', { hasText: TITLE }).waitFor();
  await copySection.scrollIntoViewIfNeeded();
  await viewportShot(admin, 'bot54-copy-picker-360');
  await copySection.getByRole('button', { name: 'Передати боту копію', ...exact }).click();
  await admin.getByRole('status').filter({ hasText: `Копію «${TITLE}» передано боту.` }).waitFor();
  await botQuizzes.locator('li', { hasText: TITLE }).waitFor();
  await botQuizzes.getByText('2 раунди', { exact: false }).waitFor();
  await admin.evaluate(() => scrollTo(0, 0));
  await admin.getByText('Квіз-бот', exact).first().waitFor();
  expect(await admin.locator('.admin-bot-head img, .admin-bot-head svg').count(), 'the bot avatar').toBeGreaterThan(0);
  expect(await admin.locator('main').innerText(), 'the bot tab has an email').not.toContain('@');
  const botJson = await admin.request.get(`${base}/api/admin/bot`);
  expect(botJson.status()).toBe(200);
  expect(await botJson.text(), 'the bot JSON has an email').not.toContain('@');
  await view(admin, 'bot54-tab-360');

  // ── 2. «Запустити гру» → кімната в лобі, «Відкрити сцену» відкриває сцену з кодом. ──
  await botQuizzes.getByRole('button', { name: 'Запустити гру', ...exact }).click();
  await admin.getByRole('status').filter({ hasText: /Кімнату \d{6} створено\./ }).waitFor();
  const code = /(\d{6})/.exec(await noticeText())![1]!;
  const card = rooms.locator('li.admin-card', { hasText: `Код ${code}` });
  await card.waitFor();
  await card.locator('.admin-mark', { hasText: 'Лобі' }).waitFor();
  const [stage] = await Promise.all([admin.context().waitForEvent('page'), card.getByRole('link', { name: 'Відкрити сцену', ...exact }).click()]);
  await stage.waitForURL(new RegExp(`/stage/${code}`));
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  await stage.close();
  await rooms.scrollIntoViewIfNeeded();
  await viewportShot(admin, 'bot54-rooms-lobby-360');

  // Те саме в темній темі: окремий контекст з тим самим входом, без ключа теми.
  const darkContext = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'uk-UA', colorScheme: 'dark', storageState: { cookies: (await admin.context().storageState()).cookies, origins: [] } });
  contexts.push(darkContext);
  const dark = await darkContext.newPage();
  await dark.goto(`${base}/admin/bot`);
  await dark.locator('li.admin-card', { hasText: `Код ${code}` }).waitFor();
  expect(await isLight(dark), 'the dark page is dark').toBe(false);
  await view(dark, 'bot54-tab-dark-360');
  await dark.close();

  // ── 3. Гравці: адмін (друга сторінка його контексту, «Приєднатися як гравець»), Оля, Петро й Тарас. ──
  const phone = await admin.context().newPage();
  await phone.setViewportSize({ width: 360, height: 740 });
  const adminFrames = socketFrames(phone);
  await phone.goto(`${base}/admin/bot`);
  await phone.locator('li.admin-card', { hasText: `Код ${code}` }).getByRole('link', { name: 'Приєднатися як гравець', ...exact }).click();
  await phone.waitForURL(new RegExp(`/play/${code}$`));
  const nick = field(phone, 'Ваше ім’я');
  await nick.fill('Адмін 54');
  if ((await nick.inputValue()) !== 'Адмін 54') await nick.fill('Адмін 54');
  await click(phone, 'Увійти в гру');
  await phone.getByText('Ви в грі. Чекаємо на старт.').waitFor();
  await join(olya, code, 'Оля', false);
  const petro = await pilotPlayer(sockets, code, 'Петро');
  const taras = await pilotPlayer(sockets, code, 'Тарас');
  await expect
    .poll(
      async () => {
        await click(admin, 'Оновити');
        return card.innerText();
      },
      { timeout: 15_000, interval: 500 },
    )
    .toMatch(/Гравці: 4 на зв.язку з 4/);
  await card.getByRole('button', { name: 'Почати гру', ...exact }).click();
  await card.locator('.admin-mark', { hasText: 'Гра йде' }).waitFor();

  // ── 4. «Шпигун»: адмін — звичайний учасник: поле асоціації, жодного «Ви автор…», у кадрах — роль учасника. ──
  await phone.locator('.spy-phone').waitFor({ timeout: 90_000 });
  await field(phone, WORD_FIELD).waitFor();
  expect(await bodyText(phone), 'a spectator line for the admin').not.toContain(SPY_SPECTATOR);
  expect(await phone.getByText(SPY_SPECTATOR, exact).count()).toBe(0);
  await expect.poll(() => phone.locator('.spy-me-word, .spy-you-role').first().textContent().catch(() => ''), POLL).toMatch(/кава|Ви — шпигун/);
  const adminIsSpy = (await phone.locator('.spy-you-role').count()) > 0;
  console.log(`part 54: the admin is ${adminIsSpy ? 'the spy' : 'a player with the word'}`);
  await afterSplash(phone);
  await viewportShot(phone, 'bot54-spy-360');
  await expectNoSideScroll(phone, 'bot54-spy-360-full');
  await olya.locator('.spy-phone').waitFor();
  const writeWord = async (page: Page, word: string) => {
    await field(page, WORD_FIELD).fill(word);
    await click(page, 'Відповісти');
    await page.locator('.spy-phone .spy-wrote', { hasText: word }).or(page.locator('.spy-vote')).first().waitFor();
  };
  await emitOk(petro, 'player:spy-word', { text: 'зерно' });
  await emitOk(taras, 'player:spy-word', { text: 'пара' });
  await writeWord(olya, 'чашка');
  await writeWord(phone, 'ранок');
  // Голосування: сокети голосують за адміна, Оля й адмін — за першого в списку.
  const voting = (await frame(petro, (v) => v.spy?.stage === 'vote' && (v.spy.rows?.length ?? 0) === 4)).view;
  const idOf = new Map(voting.spy!.rows!.map((row) => [row.nickname, row.id]));
  await emitOk(petro, 'player:spy-vote', { playerId: idOf.get('Тарас') });
  await emitOk(taras, 'player:spy-vote', { playerId: idOf.get('Петро') });
  for (const page of [olya, phone]) {
    await page.locator('.spy-vote button').first().click();
    await page.getByText('Голос прийнято', exact).or(page.locator('.spy-caught-you, .spy-guess-stage, section.sent, section.result')).first().waitFor();
  }
  // Викритий шпигун (хто б ним не був) пише загальне слово; далі автопілот сам відкриває розкриття.
  const guessed = new Set<string>();
  const until = Date.now() + 120_000;
  for (;;) {
    for (const pilot of [petro, taras]) {
      if (!guessed.has(pilot.nickname) && pilot.frames.at(-1)?.view.me.spy?.guessing === true) {
        guessed.add(pilot.nickname);
        await emitOk(pilot, 'player:spy-guess', { text: 'кава' });
      }
    }
    for (const [name, page] of [['Оля', olya], ['Адмін', phone]] as const) {
      if (!guessed.has(name) && (await page.getByText(CAUGHT, exact).count()) > 0) {
        guessed.add(name);
        await field(page, GUESS_FIELD).fill('кава');
        await click(page, 'Відповісти');
      }
    }
    if (petro.frames.at(-1)?.view.phase === 'reveal' || petro.frames.at(-1)?.view.question?.text === THINK_TEXT) break;
    expect(Date.now(), 'the spy question never reached the reveal').toBeLessThan(until);
    await sleep(300);
  }
  const spyViews = stateViews(adminFrames).filter((v) => v.me.spy !== undefined);
  expect(spyViews.length, 'the admin got spy slices').toBeGreaterThan(0);
  for (const v of spyViews) expect(v.me.spy!.spectator, 'the admin is a spectator of the spy question').toBeFalsy();
  expect(stateViews(adminFrames).some((v) => v.spy?.total === 4), 'the spy cast is the four players').toBe(true);
  if (adminIsSpy) expect(spyViews.some((v) => v.me.spy!.spy === true)).toBe(true);

  // ── 5. «Думай інакше»: поле слова є, «Ви автор…» немає, у кадрах учасник; Оля й сокети слів не пишуть — гра чекає. ──
  await phone.locator('.think-field').waitFor({ timeout: 150_000 });
  expect(await phone.getByText(AUTHOR_SPECTATOR, exact).count(), 'the author spectator line in think').toBe(0);
  expect(await bodyText(phone)).not.toContain(AUTHOR_SPECTATOR);
  await afterSplash(phone);
  await viewportShot(phone, 'bot54-think-360');
  await phone.locator('.think-field').fill('чай');
  await click(phone, 'Надіслати');
  await phone.locator('.think-sent').waitFor();
  const thinkViews = stateViews(adminFrames).filter((v) => v.me.think !== undefined);
  expect(thinkViews.length, 'the admin got think slices').toBeGreaterThan(0);
  for (const v of thinkViews) expect(v.me.think!.status, 'the admin is not a spectator of think').not.toBe('spectator');
  await expectNoSideScroll(phone, 'bot54-think-sent-360');

  // ── 6. Пауза, продовження й кінець з вкладки «Бот»; Оля бачить кінець гри. ──
  await click(admin, 'Оновити');
  await card.locator('.admin-mark', { hasText: 'Гра йде' }).waitFor();
  await rooms.scrollIntoViewIfNeeded();
  await viewportShot(admin, 'bot54-rooms-playing-360');
  await card.getByRole('button', { name: 'Пауза', ...exact }).click();
  await card.locator('.admin-mark', { hasText: 'Пауза' }).waitFor();
  expect(await card.getByRole('button', { name: 'Продовжити', ...exact }).count()).toBe(1);
  await viewportShot(admin, 'bot54-rooms-paused-360');
  await card.getByRole('button', { name: 'Продовжити', ...exact }).click();
  await card.locator('.admin-mark', { hasText: 'Гра йде' }).waitFor();
  await card.getByRole('button', { name: 'Завершити гру', ...exact }).click();
  await card.locator('.admin-mark', { hasText: 'Кінець' }).waitFor();
  expect(await card.getByRole('button').count(), 'a finished room has no buttons').toBe(0);
  await olya.getByText('Гру завершено').first().waitFor();
  await phone.getByText('Гру завершено').first().waitFor();
  // «Історія»: гра з позначкою «Провів бот» у адміна й Олі (гравці отримують гру, бот — нічого).
  for (const page of [admin, olya]) {
    const mark = page.locator('.panel', { hasText: TITLE }).locator('.autopilot-mark');
    await expect
      .poll(
        async () => {
          await page.goto(`${base}/history`);
          await page.locator('.history-tabs a', { hasText: 'Зіграні' }).click();
          await page.getByText('Завантажуємо…').waitFor({ state: 'detached' });
          return (await mark.allTextContents()).join();
        },
        { timeout: 20_000 },
      )
      .toBe('Провів бот');
  }
  expect(adminId.length).toBeGreaterThan(0);

  // ── 7. Межа: перша кімната — «Кінець» і не рахується; три запуски — три «Лобі», четвертий — відмова. ──
  await admin.goto(`${base}/admin/bot`);
  await card.locator('.admin-mark', { hasText: 'Кінець' }).waitFor();
  const lobbies = rooms.locator('li.admin-card', { has: admin.locator('.admin-mark', { hasText: 'Лобі' }) });
  const launch = () => botQuizzes.getByRole('button', { name: 'Запустити гру', ...exact }).click();
  let previous = '';
  for (let n = 1; n <= 3; n++) {
    await launch();
    await expect.poll(async () => { const text = await noticeText(); return /Кімнату \d{6} створено\./.test(text) && text !== previous; }, POLL).toBe(true);
    previous = await noticeText();
    await expect.poll(() => lobbies.count(), POLL).toBe(n);
  }
  await admin.getByText('3 з 3', exact).waitFor();
  await launch();
  await admin.getByRole('alert').filter({ hasText: 'У бота вже три кімнати. Заверши одну, щоб запустити нову.' }).waitFor();
  expect(await lobbies.count(), 'a fourth room appeared').toBe(3);
  await rooms.scrollIntoViewIfNeeded();
  await viewportShot(admin, 'bot54-rooms-full-360');
  // Лобі закривається «Завершити гру» (його підтвердження приймає open()) — і запуск знову вдається.
  await lobbies.first().getByRole('button', { name: 'Завершити гру', ...exact }).click();
  await expect.poll(() => lobbies.count(), POLL).toBe(2);
  await launch();
  await expect.poll(() => lobbies.count(), POLL).toBe(3);

  // ── 8. Видалення вікторини бота; журнал із запуском, копією й видаленням. ──
  await botQuizzes.locator('li', { hasText: TITLE }).getByRole('button', { name: 'Видалити', ...exact }).click();
  await botQuizzes.getByText('У бота ще немає вікторин.', { exact: false }).waitFor();
  expect(await botQuizzes.locator('li').count()).toBe(0);
  await admin.goto(`${base}/admin/log`);
  await admin.getByText(new RegExp(`запустив\\(-ла\\) гру бота «${TITLE}» \\(код \\d{6}\\)`)).first().waitFor();
  await admin.getByText(`передав(-ла) боту копію «${TITLE}»`, { exact: false }).first().waitFor();
  await admin.getByText(`видалив(-ла) вікторину бота «${TITLE}»`, { exact: false }).first().waitFor();
  expect(await admin.locator('main').innerText(), 'the log has an email').not.toContain('@');
  await view(admin, 'bot54-log-360');

  // ── 9. Не-адмін: 404 без вкладки, переходу додому, бота в пошуку друзів немає; гість — 404. ──
  expect((await olya.request.get(`${base}/api/admin/bot`)).status()).toBe(404);
  const copyTry = await olya.request.post(`${base}/api/admin/bot/copies`, { data: { quizId: '00000000-0000-4000-8000-000000000054' } });
  expect(copyTry.status()).toBe(404);
  expect((await guest.request.get(`${base}/api/admin/bot`)).status()).toBe(404);
  expect((await guest.request.post(`${base}/api/admin/bot/copies`, { data: { quizId: '00000000-0000-4000-8000-000000000054' } })).status()).toBe(404);
  await olya.goto(`${base}/admin/bot`);
  await olya.waitForURL(`${base}/`);
  expect(await olya.locator('.admin-tabs').count(), 'the admin tabs for a non-admin').toBe(0);
  expect(await bodyText(olya), 'a «Бот» tab for a non-admin').not.toContain('Кімнати бота');
  const found = await olya.request.get(`${base}/api/profiles/search?q=${encodeURIComponent('Квіз')}`);
  expect(found.status()).toBe(200);
  expect(await found.text(), 'the bot in friend search').not.toContain('Квіз-бот');
  const direct = await olya.request.get(`${base}/api/profiles/quiz-bot`);
  expect(direct.status(), 'the bot profile').toBe(404);
  // Очікувані відповіді: 409 четвертого запуску і 404 для не-адміна на /api/admin/bot.
  expect(problems.filter((line) => !/ (409|404) .*\/api\/admin\/bot/.test(line)), 'page errors').toEqual([]);
}
