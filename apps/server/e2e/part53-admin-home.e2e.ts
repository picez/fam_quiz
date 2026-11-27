import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { adminEmails } from '../src/config';
import { user } from '../src/db/schema';
import { click, expectNoSideScroll, field, join, myId, open, pickOption, POLL, register } from './helpers/common';
import { afterSplash, ARTIFACTS, base, ctx, db, exact, flags, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 53 — адмінка («Живі ігри», графіки й стан, оголошення) і нова головна («Створити гру» та «Приєднатися»,
 * картки «Продовжити гру» й «Найближча подія»); телефон 360 px, світла тема (одне темне фото головної).
 */

useE2eServer();

const ADMIN_EMAIL = 'admin53@example.com';
const PASSWORD = 'correct horse battery';
const TITLE = 'Річки України 53';
const BACKUP = { key: 'backups/db/2026-11-16T10-05-00Z-m0041.jsonl.gz', size: 3_500_000, lastModified: new Date('2026-11-16T10:05:00Z') };

/** Світла тема на кожному завантаженні, поки пристрій не позначено «темним» (для одного темного кадру). */
const light = async (page: Page) => {
  await page.context().addInitScript(() => {
    if (localStorage.getItem('quiz:force-dark') !== '1') localStorage.setItem('quiz:theme', 'light');
  });
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

/** Сервер з адміном і підміненим списком копій бази — лише на один сценарій. */
async function withAdmin(run: () => Promise<void>) {
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }), backupList: async () => [BACKUP] });
  flags.restarting = false;
  try {
    await run();
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    flags.restarting = true;
    await ctx.shutdown().catch(() => undefined);
    await relisten();
  }
}

const nickname = async (page: Page, nick: string) => {
  const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: nick, avatar: null } });
  expect(saved.ok(), await saved.text()).toBe(true);
};

/** Людина з акаунтом на телефоні 360 px, світла тема. */
async function person(key: string, nick: string, email: string): Promise<Page> {
  const page = await light(await open(key, 360, 740));
  await register(page, 'menu', nick, email);
  await nickname(page, nick);
  return page;
}

/** Адмін: другий і третій сценарії входять тим самим акаунтом, перший його створює. */
async function adminPage(key: string): Promise<Page> {
  const page = await light(await open(key, 360, 740));
  await page.goto(base);
  const signedIn = await page.request.post(`${base}/api/auth/sign-in/email`, { data: { email: ADMIN_EMAIL, password: PASSWORD }, headers: { origin: base } });
  if (!signedIn.ok()) {
    await register(page, 'menu', 'Адмін 53', ADMIN_EMAIL);
    await nickname(page, 'Адмін 53');
  }
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  return page;
}

const common = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
/** Класичний раунд: три запитання з одним варіантом, по 30 с. */
const quizBody = (title: string) => ({
  ...makeRoundsQuiz([
    classicRound(
      'c1',
      [
        { ...common, id: 'q1', type: 'single', text: 'Яка річка тече через Київ?', options: options('Дніпро', 'Дністер', 'Прут', 'Тиса'), correctId: 'a' },
        { ...common, id: 'q2', type: 'single', text: 'На якій річці стоїть Ужгород?', options: options('Тиса', 'Уж', 'Латориця', 'Дністер'), correctId: 'b' },
        { ...common, id: 'q3', type: 'single', text: 'Яка річка тече через Чернівці?', options: options('Прут', 'Дніпро', 'Десна', 'Сула'), correctId: 'a' },
      ] as never,
      { title: 'Річки', speedBonus: false, shuffleOptions: false },
    ),
  ]),
  title,
  description: '',
});
const createQuiz = async (page: Page, title: string): Promise<string> => {
  const response = await page.request.post(`${base}/api/quizzes`, { data: quizBody(title) });
  expect(response.status(), await response.text()).toBeLessThan(300);
  return ((await response.json()) as { id: string }).id;
};
/** Зберігає вікторину, відкриває з неї лобі на пульті; повертає код. */
async function hostLobby(page: Page, title: string): Promise<string> {
  await createQuiz(page, title);
  await page.goto(`${base}/quizzes`);
  await page.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Провести', ...exact }).click();
  await page.waitForURL(/\/host\/\d{6}$/);
  return page.url().slice(-6);
}
const step = async (host: Page, name: string) => {
  const button = host.getByRole('button', { name, ...exact }).first();
  await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
  await button.click();
};
/** Від лобі до першого запитання на телефонах. */
async function startRound(host: Page, players: Page[]) {
  await step(host, 'Почати гру');
  await afterSplash(host, ...players);
  await step(host, 'Почати раунд');
  await afterSplash(host, ...players);
  await players[0]!.getByRole('button', { name: /Дніпро/ }).waitFor();
}
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

it('part 53: live games — the admin sees a lobby and a running game with nickname, players and state, the list refreshes by itself, opens the stage and closes the running game; Оля sees the end of the game, the log has it, no email anywhere, phone 360 px, light theme', async () => {
  await withAdmin(live53);
}, 600_000);

async function live53() {
  const admin = await adminPage('admin53-live');
  const olya = await person('olya53-live', 'Оля', 'olya53live@example.com');
  const petro = await person('petro53-live', 'Петро', 'petro53live@example.com');
  const guest = await light(await open('guest53-live', 360, 740));
  const ira = await light(await open('ira53-live', 360, 740));

  // ── 1. Не-адмін адмінки не бачить: та сама 404, що й невідомий маршрут. ──
  expect((await olya.request.get(`${base}/api/admin/live`)).status()).toBe(404);
  expect((await guest.request.get(`${base}/api/admin/live`)).status()).toBe(404);

  // ── 2. Оля відкрила лобі, Петро — гру з двома гравцями на запитанні. ──
  const lobbyCode = await hostLobby(olya, TITLE);
  const gameCode = await hostLobby(petro, TITLE);
  await join(guest, gameCode, 'Гість', false);
  await join(ira, gameCode, 'Ірина', false);
  await startRound(petro, [guest, ira]);

  // ── 3. Адмін: дві картки, без email у тексті й у JSON. ──
  await admin.goto(`${base}/admin/live`);
  expect(await isLight(admin)).toBe(true);
  const cards = admin.locator('li.admin-card');
  await expect.poll(() => cards.count(), POLL).toBe(2);
  const lobbyCard = cards.filter({ hasText: 'Ведучий: Оля' });
  const gameCard = cards.filter({ hasText: 'Ведучий: Петро' });
  await lobbyCard.getByText('Лобі', exact).waitFor();
  await lobbyCard.getByText(spaced(lobbyCode), { exact: false }).first().waitFor();
  expect(await gameCard.innerText()).toMatch(/Гравці: 2 на зв.язку з 2/);
  expect(await gameCard.innerText()).toContain('Раунд 1 з 1');
  expect(await gameCard.innerText()).toContain(TITLE);
  const json = await admin.request.get(`${base}/api/admin/live`);
  expect(json.status()).toBe(200);
  expect(await json.text(), 'the live JSON has an email').not.toContain('@');
  expect(await admin.locator('main').innerText(), 'the live page has an email').not.toContain('@');
  await view(admin, 'admin53-live-360');

  // ── 4. Список оновлюється сам: Петро ставить гру на паузу, картка змінюється без натискань за ≤ 12 с. ──
  await petro.getByRole('button', { name: 'Пауза', ...exact }).first().click();
  await expect.poll(() => gameCard.innerText(), { timeout: 12_500, interval: 500 }).toContain('Пауза · раунд 1 з 1');

  // ── 5. «Відкрити сцену» — нова вкладка сцени цієї кімнати. ──
  const [stage] = await Promise.all([admin.context().waitForEvent('page'), gameCard.getByRole('link', { name: 'Відкрити сцену', ...exact }).click()]);
  await stage.waitForURL(new RegExp(`/stage/${gameCode}`));
  await stage.close();

  // ── 6. «Закрити гру» → підтвердження (його приймає open()) → гравці бачать кінець гри. ──
  await gameCard.getByRole('button', { name: 'Закрити гру', ...exact }).click();
  await admin.getByRole('status').filter({ hasText: 'закрито' }).waitFor();
  await guest.getByText('Гру завершено').first().waitFor();
  await ira.getByText('Гру завершено').first().waitFor();
  await expect.poll(() => gameCard.innerText(), POLL).toContain('Кінець');
  expect(await gameCard.getByRole('button', { name: 'Закрити гру', ...exact }).count()).toBe(0);
  expect(await lobbyCard.innerText(), 'the lobby stays').toContain('Лобі');

  // ── 7. Журнал: запис про закриття. ──
  await admin.goto(`${base}/admin/log`);
  await admin.getByText(new RegExp(`закрив\\(-ла\\) гру «${TITLE}» \\(код \\d{6}\\)`)).first().waitFor();
  expect(await admin.locator('main').innerText(), 'the log has an email').not.toContain('@');
  await view(admin, 'admin53-log-360');
}

it('part 53: charts and health — the four former 30-day charts (now in «Метрики за період») with tables for screen readers and the health block with the last backup, uptime, memory, rooms and connections', async () => {
  await withAdmin(charts53);
}, 300_000);

async function charts53() {
  const admin = await adminPage('admin53-stats');
  const guest = await open('guest53-stats', 360, 740);
  for (const path of ['metrics?period=30', 'health']) {
    expect((await guest.request.get(`${base}/api/admin/${path}`)).status()).toBe(404);
    const own = await admin.request.get(`${base}/api/admin/${path}`);
    expect(own.status()).toBe(200);
    expect(await own.text(), `${path} has an email`).not.toContain('@');
  }

  await admin.goto(`${base}/admin`);
  expect(await isLight(admin)).toBe(true);
  await admin.locator('.admin-metrics figure.chart-card').first().waitFor();
  // Чотири колишні графіки — за заголовками (71: тепер серед карток «Метрик за період», 30 днів за замовчуванням).
  const FORMER = ['Активні гравці (акаунти, що зіграли гру)', 'Ігор за день', 'Дограно до кінця, %', 'Повернення, %'];
  const figures = FORMER.map((title) => admin.locator('.admin-metrics figure.chart-card', { has: admin.getByRole('heading', { name: title, ...exact }) }));
  for (const figure of figures) expect(await figure.count()).toBe(1);
  // У свіжій e2e-базі частина графіків — самі нулі й прогалини: тоді рядок «Немає даних…» замість порожньої рамки.
  let drawn = 0;
  for (let i = 0; i < 4; i++) {
    const figure = figures[i]!;
    if ((await figure.locator('svg[role="img"]').count()) === 1) {
      drawn += 1;
      expect(await figure.locator('table.sr-only tbody tr').count(), `chart ${i}: 30 days`).toBe(30);
      // Нульовий день — без стовпчика, тож червоних рисок на осі немає.
      const zeroDays = await figure.locator('table.sr-only tbody tr td:nth-child(2)').evaluateAll((cells) => cells.filter((cell) => cell.textContent === '0' || cell.textContent === '—').length);
      expect(await figure.locator('rect.chart-bar').count(), `chart ${i}: bars only for non-zero days`).toBe(30 - zeroDays);
    } else {
      await figure.getByText('Немає даних за ці дні.', exact).waitFor();
      expect(await figure.locator('table').count()).toBe(0);
    }
  }
  expect(drawn, 'at least the players or games chart has data').toBeGreaterThan(0);
  await admin.getByRole('heading', { name: 'Метрики за період', ...exact }).scrollIntoViewIfNeeded();
  await viewportShot(admin, 'admin53-charts-360');

  const health = admin.locator('.admin-health');
  await health.waitFor();
  const backup = health.locator('.admin-stat', { has: admin.locator('dt', { hasText: 'Остання копія бази' }) });
  const line = await backup.locator('dd').innerText();
  expect(line).toContain('16 листопада 2026');
  expect(line).toContain('3,3 МБ');
  // 71: час роботи — у рядку «Запущено» («… (працює …)»), окремого «Сервер працює» вже немає.
  for (const label of ['Запущено', 'Живі кімнати']) await health.getByText(label, exact).waitFor();
  await health.getByText(/\(працює /).waitFor();
  expect(await health.getByText('Сервер працює', exact).count()).toBe(0);
  await health.getByText(/Пам.ять процесу/).waitFor();
  await health.getByText(/З.єднання/).waitFor();
  await health.scrollIntoViewIfNeeded();
  await viewportShot(admin, 'admin53-health-360');
  await expectNoSideScroll(admin, 'admin53-stats-360');
}

it('part 53: announcement — the admin publishes one with a link and a time limit, a guest and Оля see it on the home page and the library but not on the stage, the host panel or the game phone, × hides it until a new one, and it leaves at its time', async () => {
  await withAdmin(announcement53);
}, 600_000);

async function announcement53() {
  const FIRST = 'Субота — сімейна гра о 19:00';
  const SECOND = 'Неділя — гра про річки';
  const LONG = 'Довгеслово'.repeat(20);
  const admin = await adminPage('admin53-news');
  const olya = await person('olya53-news', 'Оля н53', 'olya53news@example.com');
  const guest = await light(await open('guest53-news', 360, 740));
  const banner = (page: Page) => page.locator('aside.announce-banner');
  const homeOf = async (page: Page, path = '/') => {
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/api/announcement')), page.goto(`${base}${path}`)]);
  };
  const settled = (page: Page) => page.waitForTimeout(400);
  const openAdmin = async () => {
    await admin.goto(`${base}/admin/announcement`);
    await field(admin, 'Текст оголошення').waitFor();
  };
  const publishApi = async (data: object) => {
    const response = await admin.request.put(`${base}/api/admin/announcement`, { data });
    expect(response.status(), await response.text()).toBe(200);
  };

  // ── 1. Адмін публікує: текст, посилання на календар, показ до дати й часу; попередній перегляд. ──
  expect((await olya.request.put(`${base}/api/admin/announcement`, { data: { text: 'x', url: null, expiresAt: null } })).status()).toBe(404);
  await openAdmin();
  await admin.getByText('Оголошення немає.', exact).waitFor();
  await field(admin, 'Текст оголошення').fill(FIRST);
  await field(admin, 'Посилання (необов\'язково)').fill('/feed/calendar');
  await admin.getByRole('radio', { name: 'До дати й часу', ...exact }).check();
  const until = await admin.evaluate(() => {
    const d = new Date(Date.now() + 2 * 86_400_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  });
  await admin.locator('input[type="datetime-local"]').fill(until);
  await admin.getByText('Так його побачать', exact).waitFor();
  await click(admin, 'Опублікувати');
  await admin.getByText('Оголошення опубліковано.', exact).waitFor();
  await admin.getByText(/Показується до /).waitFor();
  await admin.getByRole('button', { name: 'Замінити оголошення', ...exact }).waitFor();
  await admin.getByRole('heading', { name: 'Зараз показується', ...exact }).scrollIntoViewIfNeeded();
  await view(admin, 'announce53-admin-360');

  // ── 2. Гість і Оля бачать банер на головній і в бібліотеці; «Детальніше» веде в календар. ──
  for (const page of [guest, olya]) {
    await homeOf(page);
    expect(await isLight(page)).toBe(true);
    await banner(page).waitFor();
    expect(await banner(page).innerText()).toContain(FIRST);
    await homeOf(page, '/library');
    await banner(page).waitFor();
  }
  expect(await banner(guest).getByRole('link', { name: 'Детальніше', ...exact }).getAttribute('href')).toBe('/feed/calendar');
  await homeOf(guest);
  await banner(guest).waitFor();
  await expectNoSideScroll(guest, 'announce53-home-light-360');
  await viewportShot(guest, 'announce53-home-light-360');
  await homeOf(olya);
  await banner(olya).getByRole('link', { name: 'Детальніше', ...exact }).click();
  await olya.waitForURL(`${base}/feed/calendar`);

  // ── 3. У грі банера немає й запиту за ним теж: пульт, сцена, телефон гравця. ──
  const code = await hostLobby(olya, TITLE);
  const stage = await light(await open('stage53-news', 1280, 720));
  const calls: string[] = [];
  for (const page of [olya, stage, guest]) page.on('request', (request) => request.url().includes('/api/announcement') && calls.push(`${page.url()} ${request.url()}`));
  await olya.reload();
  await olya.getByRole('link', { name: 'Відкрити сцену', ...exact }).waitFor();
  await stage.goto((await olya.getByRole('link', { name: 'Відкрити сцену', ...exact }).getAttribute('href'))!);
  await guest.goto(`${base}/play/${code}`);
  await field(guest, 'Ваше ім’я').waitFor();
  for (const page of [olya, stage, guest]) {
    await settled(page);
    expect(await banner(page).count(), `${page.url()}: banner in a game`).toBe(0);
  }
  expect(calls, 'the game pages asked for the announcement').toEqual([]);

  // ── 4. × ховає в Олі (після перезавантаження немає), у гостя лишається. ──
  await homeOf(olya);
  await banner(olya).getByRole('button', { name: 'Закрити оголошення', ...exact }).click();
  expect(await banner(olya).count()).toBe(0);
  await homeOf(olya);
  await settled(olya);
  expect(await banner(olya).count(), 'hidden after reload').toBe(0);
  await homeOf(guest);
  await banner(guest).waitFor();

  // ── 5. Нове оголошення — новий id: в Олі знову видно. ──
  await openAdmin();
  await expect.poll(() => admin.getByText(FIRST, exact).count(), POLL).toBeGreaterThan(0);
  await field(admin, 'Текст оголошення').fill(SECOND);
  await field(admin, 'Посилання (необов\'язково)').fill('');
  await admin.getByRole('radio', { name: 'Доки не приберу', ...exact }).check();
  await click(admin, 'Замінити оголошення');
  await admin.getByText('Оголошення опубліковано.', exact).waitFor();
  await homeOf(olya);
  await banner(olya).waitFor();
  expect(await banner(olya).innerText()).toContain(SECOND);
  expect(await banner(olya).getByRole('link', { name: 'Детальніше', ...exact }).count()).toBe(0);

  // ── 6. 200 символів без пробілів: без бічного скролу на телефоні (банер, головна, адмінка). ──
  await publishApi({ text: LONG, url: '/library', expiresAt: null });
  await homeOf(guest);
  await banner(guest).waitFor();
  expect(await banner(guest).innerText()).toContain(LONG);
  await expectNoSideScroll(guest, 'announce53-long-360');
  await openAdmin();
  await admin.getByRole('heading', { name: 'Зараз показується', ...exact }).waitFor();
  await expectNoSideScroll(admin, 'announce53-admin-long-360');

  // ── 7. «Прибрати оголошення» (підтвердження приймає open()) — немає ні в кого. ──
  await click(admin, 'Прибрати оголошення');
  await admin.getByText('Оголошення немає.', exact).waitFor();
  for (const page of [guest, olya]) {
    await homeOf(page);
    await settled(page);
    expect(await banner(page).count(), 'removed for everyone').toBe(0);
  }

  // ── 8. Із строком «через 20 с»: відкрита сторінка ховає банер сама, перезавантаження — теж без нього. ──
  await publishApi({ text: 'Скоро зникне 53', url: null, expiresAt: new Date(Date.now() + 20_000).toISOString() });
  await homeOf(olya);
  await banner(olya).waitFor();
  await banner(olya).waitFor({ state: 'detached', timeout: 25_000 });
  await homeOf(olya);
  await settled(olya);
  expect(await banner(olya).count(), 'expired').toBe(0);
  await homeOf(guest);
  await settled(guest);
  expect(await banner(guest).count(), 'expired for the guest').toBe(0);

  // ── 9. Журнал: чотири публікації й одне прибирання. ──
  await admin.goto(`${base}/admin/log`);
  await admin.getByText(/прибрав\(-ла\) оголошення/).first().waitFor();
  const log = await admin.locator('main').innerText();
  expect(log.match(/опублікував\(-ла\) оголошення/g)?.length).toBe(4);
  expect(log.match(/прибрав\(-ла\) оголошення/g)?.length).toBe(1);
}

it('part 53: home — two big buttons on top, «Продовжити гру» for a running game and then for a saved one, «Найближча подія» from the calendar, and nothing when there is nothing, phone 360 px, light theme', async () => {
  try {
    await home53();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

async function home53() {
  const EVENT = 'Родинна гра 53';
  const olya = await person('olya53-home', 'Оля д53', 'olya53home@example.com');
  const petro = await person('petro53-home', 'Петро д53', 'petro53home@example.com');
  const ira = await light(await open('ira53-home', 360, 740));
  const guest = await light(await open('guest53-home', 360, 740));
  const card = olya.locator('section.next-up');
  const homeOf = async (page: Page) => {
    await page.goto(base);
    await page.locator('.home-actions').waitFor();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
  };
  const forgetGame = (page: Page) => page.evaluate(() => localStorage.removeItem('quiz:last-game'));

  // ── 1. Оля без ігор і подій: дві кнопки поруч над меню, шість плиток, жодної картки. ──
  await homeOf(olya);
  expect(await isLight(olya)).toBe(true);
  const actions = await olya.locator('.home-actions').evaluate((el) => [...el.children].map((child) => ({ text: child.textContent, top: child.getBoundingClientRect().top, width: child.getBoundingClientRect().width })));
  expect(actions.map((a) => a.text)).toEqual(['Провести гру', 'Приєднатися']);
  expect(actions[0]!.top).toBe(actions[1]!.top);
  expect(Math.min(...actions.map((a) => a.width))).toBeGreaterThan(140);
  expect(await olya.locator('nav.start-menu > *').count()).toBe(6);
  expect(await card.count(), 'no card without games and events').toBe(0);
  await expectNoSideScroll(olya, 'home53-buttons-light-360');
  await viewportShot(olya, 'home53-buttons-light-360');

  // ── 2. «Приєднатися» з кодом — у лобі. ──
  const petroCode = await hostLobby(petro, TITLE);
  await join(olya, petroCode, 'Оля', true);
  await olya.goto(base);

  // ── 3. Оля запускає гру й повертається на «/» → «Продовжити гру» → «Повернутися» на пульт. ──
  const code = await hostLobby(olya, 'Річки України 53 (Оля)');
  await homeOf(olya);
  await card.waitFor();
  await card.getByRole('heading', { name: 'Продовжити гру', ...exact }).waitFor();
  expect(await card.innerText()).toContain('Річки України 53 (Оля)');
  expect(await card.innerText()).toContain(`Гра ${spaced(code)} ще триває`);
  await expectNoSideScroll(olya, 'home53-running-light-360');
  await viewportShot(olya, 'home53-running-light-360');
  await card.getByRole('link', { name: 'Повернутися', ...exact }).click();
  await olya.waitForURL(`${base}/host/${code}`);

  // ── 4. «Зберегти й продовжити пізніше»; пристрій забуває гру → картка збереженої гри; «Продовжити» відкриває нову кімнату. ──
  await join(ira, code, 'Ірина', false);
  await startRound(olya, [ira]);
  await pickOption(ira, 'Дніпро');
  await olya.getByText('Запитання закрите').waitFor();
  await step(olya, 'Показати відповідь');
  await step(olya, 'Далі');
  await step(olya, 'Наступне запитання');
  await afterSplash(olya, ira);
  await step(olya, 'Зберегти й продовжити пізніше');
  await olya.getByText('Гру збережено — продовжимо пізніше.', exact).first().waitFor();
  await forgetGame(olya);
  await homeOf(olya);
  await card.waitFor();
  await card.getByRole('heading', { name: 'Продовжити гру', ...exact }).waitFor();
  expect(await card.innerText()).toContain('Збережено');
  await expectNoSideScroll(olya, 'home53-continue-light-360');
  await viewportShot(olya, 'home53-continue-light-360');
  await card.getByRole('button', { name: 'Продовжити', ...exact }).click();
  await olya.waitForURL(/\/host\/\d{6}$/);
  expect(olya.url().slice(-6), 'the continuation opens a new room').not.toBe(code);

  // ── 5. Без живої й збереженої (нова кімната вже відкрита): Петрова подія календаря, де Олю схвалено → «Найближча подія». ──
  const petroQuiz = await createQuiz(petro, 'Родинна вікторина 53');
  const olyaId = await myId(olya);
  await petro.goto(`${base}/profile/${olyaId}`);
  await petro.getByRole('button', { name: 'Додати в друзі', ...exact }).click();
  await petro.getByText('У друзях', exact).waitFor();
  const planned = await petro.request.post(`${base}/api/calendar`, { data: { title: EVENT, startsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(), quizId: petroQuiz } });
  expect(planned.status(), await planned.text()).toBe(201);
  const eventId = ((await planned.json()) as { id: string }).id;
  const asked = await olya.request.post(`${base}/api/calendar/${eventId}/request`);
  expect(asked.ok(), await asked.text()).toBe(true);
  const approved = await petro.request.post(`${base}/api/calendar/${eventId}/requests/${olyaId}`, { data: { decision: 'approved' } });
  expect(approved.status(), await approved.text()).toBe(204);
  await forgetGame(olya);
  await homeOf(olya);
  await card.waitFor();
  await card.getByRole('heading', { name: 'Найближча подія', ...exact }).waitFor();
  expect(await card.innerText()).toContain(EVENT);
  expect(await card.innerText()).toContain('Веде Петро д53');
  await expectNoSideScroll(olya, 'home53-event-light-360');
  await viewportShot(olya, 'home53-event-light-360');
  await card.getByRole('link', { name: 'До календаря', ...exact }).click();
  await olya.waitForURL(`${base}/feed/calendar`);

  // ── 6. Гість: лише кнопки й форма коду. ──
  await guest.goto(base);
  await guest.locator('.home-actions').waitFor();
  await field(guest, 'Код гри').waitFor();
  await guest.waitForLoadState('networkidle');
  expect(await guest.locator('section.next-up').count()).toBe(0);
  expect(await guest.locator('nav.start-menu').count()).toBe(0);
  expect(await guest.locator('.home-actions > *').count()).toBe(2);

  // ── 7. Темна тема: той самий екран. ──
  await olya.evaluate(() => {
    localStorage.setItem('quiz:force-dark', '1');
    localStorage.removeItem('quiz:theme');
  });
  await homeOf(olya);
  expect(await isLight(olya), 'the device is dark').toBe(false);
  await expectNoSideScroll(olya, 'home53-buttons-dark-360');
  await viewportShot(olya, 'home53-buttons-dark-360');
}
