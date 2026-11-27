import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { type Locator, type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { adminEmails } from '../src/config';
import { user } from '../src/db/schema';
import { bodyText, click, expectNoSideScroll, field, join, myId, open, openSection, POLL, register } from './helpers/common';
import { ARTIFACTS, avatarPng, base, browser, contexts, ctx, db, exact, flags, problems, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 58 — картка гравця в адмінці: адмін відкриває картку Олі, видає й забирає досягнення, додає досвід (рівень змінюється й видно Олі), дарує кубок (вітрина Олі, стрічка Петра), забирає його,
 * скидає аватар, видаляє тестовий акаунт Тараса (його ігри лишаються в історії Олі з «Видалений гравець»); не-адмін отримує 404; телефон 360 px, світла тема.
 */

useE2eServer();

it('part 58: player card — the admin opens Olia\'s card, grants and revokes an achievement, adds xp and the level changes, gifts a trophy seen in her showcase and Petro\'s feed, revokes it, and deletes Taras whose games stay in Olia\'s history as «Видалений гравець»; a non-admin gets 404; phone 360 px, light theme', async () => {
  const sockets: Socket[] = [];
  try {
    await card58();
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
/** Кадр екрана й перевірка без бокового скролу. */
const view = async (page: Page, name: string) => {
  await viewportShot(page, name);
  await expectNoSideScroll(page, name);
};
/** Розділ картки гравця за заголовком. */
const section = (page: Page, heading: string) => page.locator('section.admin-card-section').filter({ has: page.getByRole('heading', { name: heading, level: 2, ...exact }) });
/** Прокручує розділ до верху екрана й знімає видиму частину. */
const sectionShot = async (page: Page, target: Locator, name: string) => {
  await target.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await view(page, name);
};

/** Нік «Тарас» як окреме слово: у назві гри «Міста 58 Тараса» він є лише частиною слова. */
const TARAS_WORD = /(^|[^А-Яа-яІіЇїЄє])Тарас([^А-Яа-яІіЇїЄє]|$)/;
const QUESTION = 'Одеса стоїть на березі Чорного моря?';
const PRIZE = 'Кубок весни 58';
const NOTE = 'З весною';
const REASON = 'Переможниця шкільної вікторини';
const ACHIEVEMENT = 'Перша перемога';

async function card58() {
  const ADMIN_EMAIL = 'admin58@example.com';
  const TARAS_EMAIL = 'taras58@example.com';

  // ── 0. Сервер з адміном; адмін «Адмін 58», Оля, Тарас (тестовий акаунт), Петро (друг Олі), гість. ──
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }) });
  flags.restarting = false;
  const named: Record<string, Page> = {};
  for (const [key, name, email] of [
    ['admin', 'Адмін 58', ADMIN_EMAIL],
    ['olya', 'Оля', 'olya58@example.com'],
    ['taras', 'Тарас', TARAS_EMAIL],
    ['petro', 'Петро', 'petro58@example.com'],
  ] as const) {
    const page = await light(await open(`${key}58`, 360, 740));
    await register(page, 'menu', name, email);
    const upload = await page.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } });
    expect(upload.ok(), await upload.text()).toBe(true);
    const avatarUrl = ((await upload.json()) as { url: string }).url;
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: name, avatar: avatarUrl } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olya, taras, petro } = named as Record<'admin' | 'olya' | 'taras' | 'petro', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const guest = await light(await open('guest58', 360, 740));
  const adminId = await myId(admin);
  const olyaId = await myId(olya);
  const tarasId = await myId(taras);
  const petroId = await myId(petro);
  // Петро й Оля — взаємні друзі: її подарунок буде в його стрічці.
  expect((await petro.request.put(`${base}/api/me/friends/${olyaId}`)).ok()).toBe(true);
  expect((await olya.request.put(`${base}/api/me/friends/${petroId}`)).ok()).toBe(true);

  // ── Дві ігри через інтерфейс: Петро веде першу (Оля й Тарас грають), Тарас — другу (Оля й Петро); Оля щоразу програє, щоб «Перша перемога» не з'явилась сама. ──
  const common = { imageUrl: null, video: null, timeLimit: 25, points: 1000 };
  const makeQuiz = (title: string) => ({ ...makeRoundsQuiz([classicRound('c58', [{ ...common, id: 'q58', type: 'boolean', text: QUESTION, correct: true }] as never, { title: 'Міста', speedBonus: false, shuffleOptions: false })]), title });
  const FIRST = 'Міста 58 Петра';
  const SECOND = 'Міста 58 Тараса';
  expect((await petro.request.post(`${base}/api/quizzes`, { data: makeQuiz(FIRST) })).ok()).toBe(true);
  expect((await taras.request.post(`${base}/api/quizzes`, { data: makeQuiz(SECOND) })).ok()).toBe(true);
  const play = async (host: Page, title: string, players: [Page, string, string][]) => {
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Провести', ...exact }).click();
    await host.waitForURL(/\/host\/\d{6}$/);
    const code = host.url().slice(-6);
    for (const [page, nickname] of players) await join(page, code, nickname, false);
    await click(host, 'Почати гру');
    await click(host, 'Почати раунд');
    for (const [page] of players) await page.getByText(QUESTION).first().waitFor({ timeout: 120_000 });
    for (const [page, , answer] of players) await click(page, answer);
    await host.getByText('Запитання закрите').waitFor();
    await click(host, 'Показати відповідь');
    await click(host, 'Завершити гру');
    for (const [page] of players) await page.getByText('Гру завершено').first().waitFor({ timeout: 30_000 });
  };
  await play(petro, FIRST, [[taras, 'Тарас', 'Так'], [olya, 'Оля', 'Ні']]);
  await play(taras, SECOND, [[petro, 'Петро', 'Так'], [olya, 'Оля', 'Ні']]);
  // Сервер лічить досвід за гру (стелі, наздоганяння) після завершення: поки він не осів, рівень Олі міг би ще змінитись.
  await expect.poll(async () => ((await (await olya.request.get(`${base}/api/me/profile`)).json()) as { level: { progress: { level: number } } }).level.progress.level, POLL).toBe(1);

  // ── 1. /admin/users → Оля → картка: огляд з рівнем 1 і двома іграми. ──
  await admin.goto(`${base}/admin/users`);
  expect(await isLight(admin)).toBe(true);
  await admin.getByLabel('Пошук за ніком чи email', exact).fill('olya58');
  await click(admin, 'Шукати');
  await admin.locator('li.admin-user-row', { hasText: 'olya58@example.com' }).waitFor();
  await view(admin, 'users69-list-360');
  await admin.locator('li.admin-user-row', { hasText: 'olya58@example.com' }).getByRole('link', { name: 'Оля', ...exact }).click();
  await admin.waitForURL(`${base}/admin/users/${olyaId}`);
  const overview = section(admin, 'Огляд');
  await overview.waitFor();
  expect(await overview.innerText()).toContain('Рівень 1');
  expect(await overview.innerText()).toMatch(/Ігор: 2 /);
  await admin.evaluate(() => scrollTo(0, 0));
  await view(admin, 'card58-overview-360');
  // 69: на картці спершу відкритий лише «Огляд», решта згорнута — картка вміщається майже на один екран.
  expect(await admin.locator('details.admin-fold[open]').count(), 'only the overview is open').toBe(1);
  expect(await admin.locator('details.admin-fold').count(), 'every section folds').toBeGreaterThan(5);
  await view(admin, 'card69-folded-360');
  // Усі розділи — без бокового скролу, кожен кадром.
  for (const heading of ['Досягнення', 'Досвід', 'Останні ігри', 'Вікторини', 'Бани']) {
    await sectionShot(admin, await openSection(admin, heading), `card58-${heading === 'Досвід' ? 'xp-section' : heading === 'Останні ігри' ? 'games' : heading === 'Бани' ? 'bans' : heading === 'Вікторини' ? 'quizzes' : 'achievements'}-360`);
  }

  // Те саме в темній темі: окремий контекст з тим самим входом.
  const darkContext = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'uk-UA', colorScheme: 'dark', storageState: { cookies: (await admin.context().storageState()).cookies, origins: [] } });
  contexts.push(darkContext);
  const dark = await darkContext.newPage();
  await dark.goto(`${base}/admin/users`);
  await dark.locator('li.admin-user-row').first().waitFor();
  await view(dark, 'users69-list-dark-360');
  await dark.goto(`${base}/admin/users/${olyaId}`);
  await section(dark, 'Огляд').waitFor();
  expect(await isLight(dark), 'the dark page is dark').toBe(false);
  await view(dark, 'card58-overview-dark-360');
  for (const [heading, name] of [['Досягнення', 'achievements'], ['Досвід', 'xp-section'], ['Останні ігри', 'games']] as const) await sectionShot(dark, await openSection(dark, heading), `card58-${name}-dark-360`);
  await openSection(dark, 'Призи');
  await dark.getByRole('heading', { name: 'Призи', level: 2 }).evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await view(dark, 'card58-prizes-dark-360');
  await dark.close();

  // ── 2. Видати «Перша перемога» → у списку з датою; у Олі є. «Забрати» → немає, і після перезавантаження теж. ──
  const earned = (page: Page) => page.locator('.achievement-card:not(.is-locked)', { has: page.getByRole('heading', { name: /^Перша перемога/ }) }).count();
  const achievements = await openSection(admin, 'Досягнення');
  expect(await achievements.locator('li.admin-pick-row', { hasText: ACHIEVEMENT }).count()).toBe(0);
  await achievements.getByLabel('Оберіть досягнення').selectOption({ label: ACHIEVEMENT });
  await achievements.getByRole('button', { name: 'Видати досягнення', ...exact }).click();
  const granted = achievements.locator('li.admin-pick-row', { hasText: ACHIEVEMENT });
  await granted.waitFor();
  expect(await granted.locator('.meta').count(), 'the grant date').toBeGreaterThan(0);
  await granted.scrollIntoViewIfNeeded();
  await view(admin, 'card58-grant-360');
  await olya.goto(`${base}/profile/achievements`);
  await olya.getByRole('heading', { name: ACHIEVEMENT, ...exact }).waitFor();
  expect(await earned(olya), 'granted achievement in her list').toBe(1);
  await achievements.getByRole('checkbox', { name: ACHIEVEMENT, ...exact }).check();
  await achievements.getByRole('button', { name: 'Відібрати вибрані', ...exact }).click();
  await achievements.locator('li.admin-pick-row', { hasText: ACHIEVEMENT }).waitFor({ state: 'detached' });
  await achievements.getByText(`${ACHIEVEMENT} — Забрано адміністратором`, exact).waitFor();
  await olya.goto(`${base}/profile/achievements`);
  await olya.locator('.achievement-card.is-locked', { has: olya.getByRole('heading', { name: /^Перша перемога/ }) }).waitFor();
  expect(await earned(olya), 'revoked achievement is gone').toBe(0);
  await olya.reload();
  await olya.locator('.achievement-card.is-locked', { has: olya.getByRole('heading', { name: /^Перша перемога/ }) }).waitFor();
  expect(await earned(olya), 'revoked achievement stays gone after a reload').toBe(0);

  // ── 3. Досвід: +300 з причиною → рівень 2; Оля бачить рівень 2 і розділ «Від адміністратора» з причиною. ──
  const xp = await openSection(admin, 'Досвід');
  await xp.getByLabel('Зміна (від’ємне число — відняти)', exact).fill('300');
  expect(await xp.getByRole('button', { name: 'Додати / відняти досвід', ...exact }).isDisabled(), 'no reason, no button').toBe(true);
  await xp.getByLabel('Причина (обов’язково)', exact).fill(REASON);
  await xp.scrollIntoViewIfNeeded();
  await viewportShot(admin, 'card58-xp-form-360');
  await xp.getByRole('button', { name: 'Додати / відняти досвід', ...exact }).click();
  await xp.getByRole('status').filter({ hasText: /^Тепер: рівень 2, / }).waitFor();
  await xp.getByText(REASON, exact).first().waitFor();
  await section(admin, 'Огляд').getByText('Рівень 2', { exact: false }).waitFor();
  await xp.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await view(admin, 'card58-xp-360');
  await olya.goto(`${base}/profile/levels`);
  await olya.locator('.level-admin-xp').getByRole('heading', { name: 'Від адміністратора', ...exact }).waitFor();
  await olya.locator('.level-admin-xp').getByText(REASON, exact).waitFor();
  await olya.locator('.level-row.is-current', { hasText: 'Рівень 2' }).waitFor();
  await olya.locator('.level-admin-xp').scrollIntoViewIfNeeded();
  await view(olya, 'card58-levels-360');

  // ── 4. Подарунок: створити приз у студії (повернення на картку), вибрати, підпис → «Подарувати приз». ──
  const prizes = await openSection(admin, 'Призи');
  await prizes.scrollIntoViewIfNeeded();
  await prizes.getByRole('link', { name: 'Створити новий приз', ...exact }).click();
  await admin.waitForURL(`${base}/profile/prizes/new?back=/admin/users/${olyaId}`);
  await admin.getByRole('tab', { name: 'Приз', ...exact }).click();
  await field(admin, 'Назва').fill(PRIZE);
  await field(admin, 'Підпис під кубком і на дипломі').fill(PRIZE);
  await admin.getByRole('button', { name: 'Зберегти', ...exact }).click();
  await admin.waitForURL(`${base}/admin/users/${olyaId}`);
  await openSection(admin, 'Призи');
  await prizes.getByLabel('Оберіть приз зі свого складу').selectOption({ label: PRIZE });
  await prizes.getByLabel('Підпис (необов’язково)', exact).fill(NOTE);
  await prizes.getByRole('button', { name: 'Подарувати приз', ...exact }).scrollIntoViewIfNeeded();
  await viewportShot(admin, 'card58-gift-form-360');
  await prizes.getByRole('button', { name: 'Подарувати приз', ...exact }).click();
  const giftRow = prizes.locator('li.admin-pick-row', { hasText: 'Подарунок від адміністратора' });
  await giftRow.waitFor();
  expect(await giftRow.innerText()).toContain(NOTE);
  // Вітрина Олі (бачить Петро): «Подарунок від адміністратора» і підпис (назву призу бачить лише власник).
  await petro.goto(`${base}/profile/${olyaId}`);
  const award = petro.locator('.shelf-item', { hasText: 'Подарунок від адміністратора' });
  await award.waitFor();
  expect(await award.innerText()).toContain(NOTE);
  await award.scrollIntoViewIfNeeded();
  await view(petro, 'card58-gift-360');
  // Стрічка Петра: подія подарунка.
  await petro.goto(`${base}/feed`);
  const feedLine = petro.getByText(`отримав(-ла) приз «${PRIZE}» — подарунок від адміністратора`);
  await feedLine.first().waitFor();
  await feedLine.first().scrollIntoViewIfNeeded();
  await viewportShot(petro, 'card58-feed-360');
  // «Забрати подарунок»: вітрина й подія зникли; приз адміна лишається в його складі.
  await giftRow.getByRole('checkbox').check();
  await prizes.getByRole('button', { name: 'Прибрати вибрані', ...exact }).click();
  await giftRow.waitFor({ state: 'detached' });
  await petro.goto(`${base}/profile/${olyaId}`);
  await petro.locator('.showcase, main').first().waitFor();
  expect(await petro.locator('.shelf-item', { hasText: 'Подарунок від адміністратора' }).count(), 'the gift left the showcase').toBe(0);
  await petro.goto(`${base}/feed`);
  await petro.getByText('Міста 58 Тараса', { exact: false }).first().waitFor();
  expect(await petro.getByText('подарунок від адміністратора', { exact: false }).count(), 'the gift left the feed').toBe(0);
  const adminStock = (await (await admin.request.get(`${base}/api/me/prizes`)).json()) as { content: { name: string } }[];
  expect(adminStock.map((prize) => prize.content.name), 'the admin keeps the prize').toContain(PRIZE);

  // ── 5. «Останні ігри» → гра → адмінський перегляд із таблицею; «Скинути аватар» → аватар Олі типовий. ──
  await admin.goto(`${base}/admin/users/${olyaId}`);
  const games = await openSection(admin, 'Останні ігри');
  await games.getByRole('link', { name: FIRST, ...exact }).click();
  await admin.waitForURL(/\/admin\/games\/[\w-]+$/);
  await admin.getByText('Тарас', exact).first().waitFor();
  expect(await admin.locator('table').count(), 'the admin game view has a table').toBeGreaterThan(0);
  await view(admin, 'card58-game-360');
  await admin.goBack();
  await section(admin, 'Останні ігри').waitFor();
  expect(((await (await olya.request.get(`${base}/api/me/profile`)).json()) as { avatar: string | null }).avatar).not.toBeNull();
  const moderation = await openSection(admin, 'Модерація');
  await moderation.scrollIntoViewIfNeeded();
  await view(admin, 'card58-moderation-360');
  await moderation.getByRole('button', { name: 'Скинути аватар', ...exact }).click();
  await moderation.getByRole('button', { name: 'Скинути аватар', ...exact }).waitFor({ state: 'detached' });
  expect(((await (await olya.request.get(`${base}/api/me/profile`)).json()) as { avatar: string | null }).avatar, 'the avatar is the default').toBeNull();

  // ── 6. Картка Тараса: «Видалити акаунт» неактивна; «Петро» — неактивна; «Тарас» → підтвердження → список без Тараса. ──
  await admin.goto(`${base}/admin/users/${tarasId}`);
  const removal = await openSection(admin, 'Видалити акаунт');
  const removeButton = removal.getByRole('button', { name: 'Видалити акаунт', ...exact });
  expect(await removeButton.isDisabled(), 'no nickname typed').toBe(true);
  const typed = removal.getByLabel('Введіть нік «Тарас», щоб підтвердити', exact);
  await typed.fill('Петро');
  expect(await removeButton.isDisabled(), 'a wrong nickname').toBe(true);
  await removal.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await view(admin, 'card58-delete-wrong-360');
  await typed.fill('Тарас');
  expect(await removeButton.isDisabled(), 'the exact nickname').toBe(false);
  await removal.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await view(admin, 'card58-delete-confirm-360');
  await removeButton.click();
  await admin.waitForURL(`${base}/admin/users`);
  await admin.locator('li.admin-user-row').first().waitFor();
  expect(await admin.locator('li.admin-user-row', { hasText: TARAS_EMAIL }).count(), 'Taras left the list').toBe(0);
  expect((await admin.request.get(`${base}/api/admin/users/${tarasId}`)).status()).toBe(404);
  // Його вхід — відмова.
  const signIn = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ email: TARAS_EMAIL, password: 'correct horse battery' }) });
  expect(signIn.ok, 'Taras cannot sign in').toBe(false);
  // Історія Олі: обидві гри на місці (її таблиця «Зіграні»), а в таблиці першої гри в адмінському перегляді Тарас — «Видалений гравець».
  await olya.goto(`${base}/history`);
  await olya.locator('.history-tabs a', { hasText: 'Зіграні' }).click();
  await olya.getByText('Завантажуємо…').waitFor({ state: 'detached' });
  for (const title of [FIRST, SECOND]) await olya.getByRole('heading', { name: title, ...exact }).waitFor();
  expect(await bodyText(olya), 'Taras is not named in the history of Olia').not.toMatch(TARAS_WORD);
  await view(olya, 'card58-deleted-history-360');
  await admin.goto(`${base}/admin/users/${olyaId}`);
  const olyaGames = await openSection(admin, 'Останні ігри');
  for (const title of [FIRST, SECOND]) await olyaGames.getByRole('link', { name: title, ...exact }).waitFor();
  await olyaGames.getByRole('link', { name: FIRST, ...exact }).click();
  await admin.getByText('Видалений гравець', { exact: false }).first().waitFor();
  expect(await bodyText(admin), 'Taras is not named in the game table').not.toMatch(TARAS_WORD);
  await view(admin, 'card58-deleted-360');

  // ── 7. Журнал: видача, забирання, досвід, подарунок, забирання подарунка, скидання аватара, видалення акаунта. ──
  await admin.goto(`${base}/admin/log`);
  for (const line of [
    new RegExp(`видав\\(-ла\\) Оля досягнення «${ACHIEVEMENT}»`),
    new RegExp(`забрав\\(-ла\\) у Оля досягнення «${ACHIEVEMENT}»`),
    /змінив\(-ла\) досвід Оля: /,
    new RegExp(`подарував\\(-ла\\) Оля приз «${PRIZE}»`),
    new RegExp(`забрав\\(-ла\\) у Оля подарунок «${PRIZE}»`),
    /скинув\(-ла\) аватар Оля/,
    /видалив\(-ла\) акаунт Тарас/,
  ])
    await admin.getByText(line).first().waitFor();
  await view(admin, 'card58-log-360');
  const logText = await admin.locator('main').innerText();
  expect(logText, 'the log has an email').not.toContain('@');

  // ── 8. Не-адмін і гість: 404; на картці адміна (свій акаунт) розділу видалення немає. ──
  expect((await olya.request.post(`${base}/api/admin/users/${olyaId}/xp`, { data: { amount: 5, reason: 'спроба' } })).status()).toBe(404);
  expect((await olya.request.delete(`${base}/api/admin/users/${petroId}`, { data: { confirm: 'Петро' } })).status()).toBe(404);
  expect((await olya.request.get(`${base}/api/admin/users/${petroId}`)).status()).toBe(404);
  expect((await guest.request.post(`${base}/api/admin/users/${olyaId}/xp`, { data: { amount: 5, reason: 'спроба' } })).status()).toBe(404);
  expect((await guest.request.delete(`${base}/api/admin/users/${petroId}`, { data: { confirm: 'Петро' } })).status()).toBe(404);
  // Адмін не видаляє себе й інших адмінів: 409, акаунт цілий.
  const self = await admin.request.delete(`${base}/api/admin/users/${adminId}`, { data: { confirm: 'Адмін 58' } });
  expect(self.status()).toBe(409);
  expect(await self.json()).toEqual({ error: 'cannot_delete_admin' });
  // Чужий нік у підтвердженні — 400, акаунт цілий.
  const wrong = await admin.request.delete(`${base}/api/admin/users/${petroId}`, { data: { confirm: 'Оля' } });
  expect(wrong.status()).toBe(400);
  expect((await admin.request.get(`${base}/api/admin/users/${petroId}`)).status()).toBe(200);
  await admin.goto(`${base}/admin/users/${adminId}`);
  await section(admin, 'Огляд').waitFor();
  expect(await admin.locator('section.admin-card-delete').count(), 'no delete section on the admin card').toBe(0);
  expect(await admin.getByRole('button', { name: 'Видалити акаунт', ...exact }).count()).toBe(0);
  await admin.evaluate(() => scrollTo(0, 0));
  await view(admin, 'card58-own-360');

  // Очікувані відповіді: 404 не-адміну й гостю, 409 і 400 на видаленні, 404 картки видаленого.
  const unexpected = problems.filter((line) => !/ (409|404|400) .*\/api\/admin\//.test(line) && !/ 401 .*\/api\/auth\/sign-in/.test(line));
  expect(unexpected, `page errors (${unexpected.length}):\n${unexpected.join('\n')}`).toEqual([]);
}
