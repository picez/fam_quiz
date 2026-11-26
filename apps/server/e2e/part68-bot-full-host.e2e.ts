import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { boardRound, classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { AUTOPILOT_MS, BOT_MANUAL_GRACE_MS } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { adminEmails } from '../src/config';
import { user } from '../src/db/schema';
import { click, emitOk, expectNoSideScroll, frame, joinBy11h, numericAnswer, open, pilotPlayer, pilotSocket, register, sleep, type Pilot } from './helpers/common';
import { ARTIFACTS, base, ctx, db, exact, flags, problems, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 68 — адмін веде гру бота з справжнього пульта: «Відкрити як ведучий» на картці, смуга «Гру веде бот», «Почати гру», оцінка й скасування балів
 * під час темпу бота, «Взяти керування» (бот кроків не робить, відповідь поля чекає «Прийняти»), «Віддати боту», вилучення; не-адмін — 404 і жодного сокета пульта; телефон 360 px.
 */

useE2eServer();

it('part 68: the admin hosts a bot game from the real host screen — open as host, regrade and undo while the bot paces, take over so the bot stops (a board answer waits for «Прийняти»), give back, kick, log lines; a non-admin gets 404 and no host socket', async () => {
  const sockets: Socket[] = [];
  try {
    await full68(sockets);
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
}, 1_500_000);

const TITLE = 'Говерла й Дніпро 68';
const num = (text: string | null) => Number((text ?? '').replace(/[^\d-]/g, ''));
const phaseOf = (pilot: Pilot) => pilot.frames.at(-1)?.view.phase;
/** Кадр лише видимої частини екрана. */
const viewportShot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`) });
};

const base68 = { imageUrl: null, video: null, timeLimit: 25, points: 1000 };
const cell = (id: string, text: string, answer: string, points: number) =>
  ({ id, type: 'text', text, ...base68, points, accepted: [answer] }) as never;

async function full68(sockets: Socket[]) {
  const ADMIN_EMAIL = 'admin68@example.com';

  // ── 0. Сервер з адміном; акаунти «Адмін 68» і Оля (не адмін). ──
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }) });
  flags.restarting = false;
  const named: Record<string, Page> = {};
  for (const [key, name, email, width, height] of [
    ['admin', 'Адмін 68', ADMIN_EMAIL, 1280, 800],
    ['olya', 'Оля', 'olya68@example.com', 360, 740],
  ] as const) {
    const page = await open(`${key}68`, width, height);
    await register(page, 'menu', name, email);
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: name, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olya } = named as Record<'admin' | 'olya', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  await olya.addInitScript(() => localStorage.setItem('quiz:theme', 'light'));

  // ── 1. Вікторина: клас (текст «Говерла 68», вибір, так/ні з правильною «ні») і поле з ручною перевіркою (дві клітинки). ──
  const single = { id: 'q68b', type: 'single', text: 'Яка річка найдовша в Україні?', ...base68, options: [{ id: 'q68b0', text: 'Дніпро 68' }, { id: 'q68b1', text: 'Дністер 68' }], correctId: 'q68b0' };
  const bool = { id: 'q68c', type: 'boolean', text: 'Говерла стоїть у Кримських горах?', ...base68, correct: false };
  const quiz = {
    ...makeRoundsQuiz(
      [
        classicRound('c68', [cell('q68a', 'Найвища гора України?', 'Говерла 68', 1000), single, bool] as never[], { title: 'Класика', speedBonus: false, shuffleOptions: false }),
        boardRound(
          'b68',
          [
            ...['Гори', 'Річки', 'Міста'].map((title, c) => ({ title, cells: [1, 2, 3].map((n) => cell(`b68-${c}-${n}`, `${title}: питання ${n}?`, 'Говерла 68', n * 100)) })),
          ],
          { title: 'Поле', answerMode: 'phone', check: 'manual' },
        ),
      ],
      { leaderboard: 'end' },
    ),
    title: TITLE,
  };
  const created = await admin.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(created.status(), await created.text()).toBeLessThan(300);
  const quizId = ((await created.json()) as { id: string }).id;
  const copied = await admin.request.post(`${base}/api/admin/bot/copies`, { data: { quizId } });
  expect(copied.status(), await copied.text()).toBeLessThan(300);
  const botQuizId = ((await copied.json()) as { id: string }).id;
  const launched = await admin.request.post(`${base}/api/admin/bot/quizzes/${botQuizId}/games`);
  expect(launched.status(), await launched.text()).toBeLessThan(300);
  const code = ((await launched.json()) as { code: string }).code;

  // ── 2. Двоє гравців: Оля — сторінкою 360 px (і сокетом тим самим токеном для дій), Тарас — сокетом. ──
  await joinBy11h(olya, code, 'Оля');
  const token = await olya.evaluate((c) => localStorage.getItem(`quiz:player:${c}`), code);
  expect(token).not.toBeNull();
  const olyaP = await pilotSocket(sockets, code, token!, 'Оля');
  const taras = await pilotPlayer(sockets, code, 'Тарас');
  await expectNoSideScroll(olya, 'p68-phone-lobby-360');

  // ── 3. Не-адмін: host-access — 404, сокет ролі host не підключається, сторінка пульта — «немає доступу». ──
  const denied = await olya.request.post(`${base}/api/admin/bot/rooms/${code}/host-access`);
  expect(denied.status()).toBe(404);
  const rogue = connectSocket(base, { auth: { code, role: 'host', token: 'x'.repeat(32) }, transports: ['websocket'], reconnection: false });
  sockets.push(rogue);
  await new Promise<void>((done, fail) => {
    rogue.once('connect', () => fail(new Error('a host socket connected with a random token')));
    rogue.once('connect_error', () => done());
  });
  await olya.goto(`${base}/bot-host/${code}`);
  await olya.getByText('Гри вже немає, або ця кімната не бота, або ти не адмін').waitFor();
  await olya.goto(`${base}/play/${code}`);
  await olya.getByText('Ви в грі. Чекаємо на старт.').waitFor();

  // ── 4. Картка: «Відкрити як ведучий» у новій вкладці; смуга «Гру веде бот». ──
  await admin.goto(`${base}/admin/bot`);
  const card = admin.locator('li.admin-card', { hasText: `Код ${code}` });
  await card.waitFor();
  const link = card.getByRole('link', { name: 'Відкрити як ведучий', ...exact });
  expect(await link.getAttribute('target')).toBe('_blank');
  const [host] = await Promise.all([admin.context().waitForEvent('page'), link.click()]);
  host.on('dialog', (dialog) => void dialog.accept());
  host.on('pageerror', (error) => problems.push(`host68: ${error.message} @ ${host.url()}`));
  await host.waitForURL(`${base}/bot-host/${code}`);
  const bar = host.locator('.bot-host-bar');
  await bar.getByText('Гру веде бот — ти допомагаєш: будь-яка кнопка діє одразу').waitFor();
  expect(await host.getByRole('button', { name: 'Зберегти й продовжити пізніше', ...exact }).count(), 'no save button on the admin screen').toBe(0);
  await expect.poll(() => card.getByText(/Пультів адмінів: 1/).count().then(async (n) => { if (n === 0) await click(admin, 'Оновити'); return n; }), { timeout: 15_000, interval: 600 }).toBe(1);
  await host.setViewportSize({ width: 1920, height: 1080 });
  await viewportShot(host, 'p68-host-lobby-1920');
  await host.setViewportSize({ width: 375, height: 740 });
  await expectNoSideScroll(host, 'p68-host-lobby-375');
  await viewportShot(host, 'p68-host-lobby-375-view');
  await host.setViewportSize({ width: 1280, height: 800 });

  // ── 5. «Почати гру» з пульта; бот сам доводить до першого запитання; Оля відповідає «Говерла» без «68» — неправильно. ──
  await click(host, 'Почати гру');
  await frame(olyaP, (v) => v.phase === 'question' && v.questionIndex === 0, 0, 120_000);
  await olya.getByLabel('Ваша відповідь', exact).waitFor();
  await numericAnswer(olya, 'Говерла');
  await emitOk(taras, 'player:answer', { type: 'text', value: 'Говерла 68' });
  const shown = await frame(olyaP, (v) => v.phase === 'reveal', 0, 60_000);
  expect(shown.view.me.result?.accepted, 'a bare «Говерла» is wrong').toBe(false);
  expect(shown.view.me.score).toBe(0);
  // «Змінити оцінку»: «Зарахувати» у рядку Олі на розкритті.
  const row = host.getByRole('listitem').filter({ hasText: 'Оля' }).filter({ has: host.getByRole('button', { name: 'Зарахувати', ...exact }) });
  await row.getByRole('button', { name: 'Зарахувати', ...exact }).click();
  await expect.poll(async () => num(await olya.locator('.bar .score').first().textContent()), { timeout: 10_000 }).toBeGreaterThan(0);
  const gained = num(await olya.locator('.bar .score').first().textContent());
  await expectNoSideScroll(olya, 'p68-phone-regraded-360');

  // ── 6. «Скасування балів»: після кроку бота відкат цієї оцінки — бали повернулися. ──
  await frame(olyaP, (v) => v.phase !== 'reveal' && v.questionIndex >= 0 && v.phase !== 'lobby', shown.index + 1, 60_000);
  const sheet = host.locator('.undo-sheet');
  await host.getByRole('button', { name: '↶ Бали', ...exact }).click();
  await sheet.getByRole('heading', { name: 'Скасування балів', ...exact }).waitFor();
  const undoRow = sheet.locator('.undo-row', { hasText: /Оля/ }).first();
  await undoRow.getByRole('button', { name: 'Скасувати', ...exact }).click();
  await expect.poll(async () => num(await olya.locator('.bar .score').first().textContent()), { timeout: 10_000 }).toBeLessThan(gained);
  await host.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });

  // ── 7. «Взяти керування» на другому запитанні: бот кроків не робить; на розкритті чекаємо reveal + 3 с — фаза та сама; адмін «Далі». ──
  await frame(olyaP, (v) => v.phase === 'question' && v.questionIndex === 1, 0, 120_000);
  await click(host, 'Взяти керування');
  await bar.getByText('Керуєш ти: бот не робить кроків').waitFor();
  await click(admin, 'Оновити');
  await card.getByText('Керує адмін', exact).waitFor();
  await emitOk(olyaP, 'player:answer', { type: 'single', optionId: 'q68b1' });
  await emitOk(taras, 'player:answer', { type: 'single', optionId: 'q68b0' });
  await frame(olyaP, (v) => v.phase === 'locked' && v.questionIndex === 1, 0, 60_000);
  await sleep(AUTOPILOT_MS.locked + 3000);
  expect(phaseOf(olyaP), 'the bot makes no step in manual mode').toBe('locked');
  await click(host, 'Показати відповідь');
  await frame(olyaP, (v) => v.phase === 'reveal' && v.questionIndex === 1, 0, 10_000);
  await sleep(AUTOPILOT_MS.reveal + 3000);
  expect(phaseOf(olyaP), 'still on the reveal after the bot pause').toBe('reveal');
  await host.setViewportSize({ width: 375, height: 740 });
  await expectNoSideScroll(host, 'p68-host-manual-375');
  await viewportShot(host, 'p68-host-manual-375-view');
  await host.setViewportSize({ width: 1280, height: 800 });
  await click(host, 'Далі');
  await frame(olyaP, (v) => v.phase === 'question' && v.questionIndex === 2, 0, 20_000);

  // ── 8. «Віддати боту»: бот сам закриває, розкриває й іде далі в межах таблиці часу. ──
  await click(host, 'Віддати боту');
  await bar.getByText('Гру веде бот — ти допомагаєш: будь-яка кнопка діє одразу').waitFor();
  await emitOk(olyaP, 'player:answer', { type: 'boolean', value: false });
  await emitOk(taras, 'player:answer', { type: 'boolean', value: false });
  const lockedAt = await frame(olyaP, (v) => v.phase === 'locked' && v.questionIndex === 2, 0, 20_000);
  const revealAt = await frame(olyaP, (v) => v.phase === 'reveal' && v.questionIndex === 2, lockedAt.index, AUTOPILOT_MS.locked + 8000);
  expect(revealAt.at - lockedAt.at, 'the bot reveals by its own table').toBeLessThanOrEqual(AUTOPILOT_MS.locked + 3000);
  await frame(olyaP, (v) => v.phase !== 'reveal' && v.phase !== 'locked' && v.phase !== 'question', revealAt.index + 1, AUTOPILOT_MS.reveal + 8000);

  // ── 9. Поле: хто ходить, бере керування; відповідь з ручною перевіркою чекає «Прийняти», бот її не оцінює. ──
  const turn = await frame(olyaP, (v) => v.phase === 'board' && v.board?.turn != null, 0, 180_000);
  await click(host, 'Взяти керування');
  await bar.getByText('Керуєш ти: бот не робить кроків').waitFor();
  const chooserName = turn.view.board!.turn!.nickname;
  const chooser = chooserName === 'Оля' ? olyaP : taras;
  const open1 = turn.view.board!.categories.flatMap((c) => c.cells).find((c) => !c.played)!;
  const mark = chooser.frames.length;
  await emitOk(chooser, 'player:pick', { cellId: open1.id });
  await frame(chooser, (v) => v.phase === 'question', mark, 20_000);
  await emitOk(chooser, 'player:answer', { type: 'text', value: 'Говерла 68' });
  await sleep(AUTOPILOT_MS.locked + 3000);
  expect(phaseOf(chooser), 'a manual-check answer waits for the admin').not.toBe('reveal');
  await host.getByRole('button', { name: 'Правильно', ...exact }).click();
  const accepted = await frame(chooser, (v) => v.phase === 'reveal', mark, 20_000);
  expect(accepted.view.me.result?.accepted).toBe(true);

  // ── 10. Вилучення з пульта: гравець бачить вилучення. ──
  const kickRow = host.getByRole('listitem').filter({ hasText: 'Тарас' }).filter({ has: host.getByRole('button', { name: 'Вилучити', ...exact }) });
  await kickRow.first().getByRole('button', { name: 'Вилучити', ...exact }).click();
  await expect.poll(() => taras.closed, { timeout: 10_000 }).toContain('kicked');

  // ── 11. «Віддати боту»: бот іде далі сам. ──
  await click(host, 'Віддати боту');
  await frame(olyaP, (v) => v.phase !== 'reveal', accepted.index + 1, AUTOPILOT_MS.reveal + 10_000);

  // ── 12. «Взяти керування» і закрита вкладка: за BOT_MANUAL_GRACE_MS картка без тегу, бот веде далі. ──
  await click(host, 'Взяти керування');
  await bar.getByText('Керуєш ти: бот не робить кроків').waitFor();
  await host.close();
  await sleep(BOT_MANUAL_GRACE_MS + 5000);
  await click(admin, 'Оновити');
  await expect.poll(() => card.getByText('Керує адмін', exact).count(), { timeout: 10_000 }).toBe(0);

  // ── 13. Кінець гри з картки; журнал: відкриття пульта один раз, керування, оцінка, скасування, вилучення. ──
  await card.getByRole('button', { name: 'Завершити гру', ...exact }).click();
  await card.locator('.admin-mark', { hasText: 'Кінець' }).waitFor();
  await admin.goto(`${base}/admin/log`);
  await admin.getByText(`відкрив(-ла) пульт ведучого в грі бота (код ${code})`, { exact: false }).first().waitFor();
  expect(await admin.getByText(`відкрив(-ла) пульт ведучого в грі бота (код ${code})`, { exact: false }).count(), 'the host screen open is logged once').toBe(1);
  await admin.getByText(`взяв(-ла) керування грою бота (код ${code})`, { exact: false }).first().waitFor();
  await admin.getByText(`віддав(-ла) керування боту (код ${code})`, { exact: false }).first().waitFor();
  await admin.getByText('оцінив(-ла) відповідь у грі бота — Оля', { exact: false }).first().waitFor();
  await admin.getByText('скасував(-ла) бали в грі бота', { exact: false }).first().waitFor();
  await admin.getByText('вилучив(-ла) Тарас з гри бота', { exact: false }).first().waitFor();
  const unexpected = problems.filter((line) => !/ (403|404|409) .*\/api\/(admin\/bot|games\/by-code)/.test(line));
  expect(unexpected, `page errors (${unexpected.length}):\n${unexpected.join('\n')}`).toEqual([]);
}
