import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { type Locator, type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { adminEmails } from '../src/config';
import { user } from '../src/db/schema';
import { bodyText, click, expectNoSideScroll, field, join, MENU, myId, open, POLL, register } from './helpers/common';
import { ARTIFACTS, base, browser, contexts, ctx, db, exact, flags, problems, relisten, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 66 — об'єднання акаунтів: два акаунти однієї людини з іграми, друзями й групою; адмін відкриває перегляд і бачить відмову, поки хтось із двох у лобі,
 * тоді бачить, що перейде, друкує нік і зливає; сесію другого акаунта закрито, людина входить обома адресами в один акаунт з повною історією, реєстрація на злитій адресі — відмова,
 * рядок журналу з підсумком; телефон 360 px, світла тема (і темна — кадри перегляду).
 */

useE2eServer();

it('part 66: merge accounts — two accounts of one person with games, friends and a group: the admin previews what moves, refuses while one plays, merges after typing the nickname; the person signs in with either address into one account whose history is complete; phone 360 px, light theme', async () => {
  try {
    await merge66();
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
/** Прокручує елемент до верху (чи середини) екрана й знімає видиму частину. */
const shotAt = async (page: Page, target: Locator, name: string, block: 'start' | 'center' = 'start') => {
  await target.evaluate((node, where) => node.scrollIntoView({ block: where as ScrollLogicalPosition }), block);
  await view(page, name);
};
const section = (page: Page, heading: string) => page.locator('section.admin-card-section').filter({ has: page.getByRole('heading', { name: heading, level: 2, ...exact }) });

const QUESTION = 'Одеса стоїть на березі Чорного моря?';
const PASSWORD = 'correct horse battery';
const HEADING = 'Об\'єднати з іншим акаунтом';
const T_OLYA = 'Міста 66 Олі';
const T_PETRO = 'Міста 66 Петра';
const T_LOBBY = 'Лобі 66 Петра';
const GROUP = 'Родина';

/** Пошук другого акаунта в розділі й вибір його рядка. */
async function pickOther(page: Page, merge: Locator) {
  await merge.getByLabel('Знайти акаунт (нік чи email)', exact).fill('olya66b');
  await merge.locator('button.admin-merge-pick', { hasText: 'olya66b@example.com' }).click();
}

async function merge66() {
  const ADMIN_EMAIL = 'admin66@example.com';
  const OLYA_EMAIL = 'olya66@example.com';
  const OLYA_B_EMAIL = 'olya66b@example.com';

  // ── 0. Сервер з адміном; адмін, Оля (головний), «Оля Нова» (другий акаунт), Петро. Кожен — в окремому контексті. ──
  flags.restarting = true;
  await ctx.shutdown();
  await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: ADMIN_EMAIL }) });
  flags.restarting = false;
  const named: Record<string, Page> = {};
  for (const [key, name, email] of [
    ['admin', 'Адмін 66', ADMIN_EMAIL],
    ['olya', 'Оля', OLYA_EMAIL],
    ['olyaB', 'Оля Нова', OLYA_B_EMAIL],
    ['petro', 'Петро', 'petro66@example.com'],
  ] as const) {
    const page = await light(await open(`${key}66`, 360, 740));
    await register(page, 'menu', name, email);
    const saved = await page.request.put(`${base}/api/me/profile`, { data: { nickname: name, avatar: null } });
    expect(saved.ok(), await saved.text()).toBe(true);
    named[key] = page;
  }
  const { admin, olya, olyaB, petro } = named as Record<'admin' | 'olya' | 'olyaB' | 'petro', Page>;
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, ADMIN_EMAIL));
  const olyaId = await myId(olya);
  const olyaBId = await myId(olyaB);
  const petroId = await myId(petro);
  expect(olyaBId).not.toBe(olyaId);

  // ── 1. Друзі: Петро додає обох, обидва акаунти Олі додають Петра. Група «Родина»: створює «Оля Нова», Петро й Оля вступають за кодом. ──
  for (const [from, to] of [[petro, olyaId], [petro, olyaBId], [olya, petroId], [olyaB, petroId]] as const) expect((await from.request.put(`${base}/api/me/friends/${to}`)).ok()).toBe(true);
  const created = await olyaB.request.post(`${base}/api/groups`, { data: { name: GROUP, emoji: '🌻', description: '' } });
  expect(created.status(), await created.text()).toBe(201);
  const { inviteCode } = (await created.json()) as { inviteCode: string };
  for (const page of [petro, olya]) expect((await page.request.post(`${base}/api/groups/join/${inviteCode}`)).ok()).toBe(true);

  // ── 2. Ігри: Оля веде першу (Петро грає); Петро веде другу з одного запитання, де грають обидва акаунти Олі («Оля Нова» — правильно, Оля — ні). ──
  const common = { imageUrl: null, video: null, timeLimit: 25, points: 1000 };
  const makeQuiz = (title: string) => ({ ...makeRoundsQuiz([classicRound('c66', [{ ...common, id: 'q66', type: 'boolean', text: QUESTION, correct: true }] as never, { title: 'Міста', speedBonus: false, shuffleOptions: false })]), title });
  expect((await olya.request.post(`${base}/api/quizzes`, { data: makeQuiz(T_OLYA) })).ok()).toBe(true);
  expect((await petro.request.post(`${base}/api/quizzes`, { data: makeQuiz(T_PETRO) })).ok()).toBe(true);
  expect((await petro.request.post(`${base}/api/quizzes`, { data: makeQuiz(T_LOBBY) })).ok()).toBe(true);
  const lobby = async (host: Page, title: string) => {
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Грати', ...exact }).click();
    await host.waitForURL(/\/host\/\d{6}$/);
    return host.url().slice(-6);
  };
  const play = async (host: Page, title: string, players: [Page, string, string][]) => {
    const code = await lobby(host, title);
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
  await play(olya, T_OLYA, [[petro, 'Петро', 'Так']]);
  await play(petro, T_PETRO, [[olyaB, 'Оля Нова', 'Так'], [olya, 'Оля', 'Ні']]);
  // Рівні й досвід осіли: перегляд не залежить від наздоганяння.
  await expect.poll(async () => ((await (await olya.request.get(`${base}/api/me/profile`)).json()) as { level: { progress: { level: number } } }).level.progress.level, POLL).toBeGreaterThan(0);

  // ── 3. «Оля Нова» у лобі гри Петра: перегляд — відмова «Хтось із двох зараз у живій грі…», кнопки немає. ──
  const lobbyCode = await lobby(petro, T_LOBBY);
  await join(olyaB, lobbyCode, 'Оля Нова', false);
  await admin.goto(`${base}/admin/users/${olyaId}`);
  expect(await isLight(admin)).toBe(true);
  const merge = section(admin, HEADING);
  await merge.waitFor();
  await pickOther(admin, merge);
  await merge.getByText('Хтось із двох зараз у живій грі', { exact: false }).waitFor();
  expect(await merge.getByRole('button', { name: 'Об\'єднати', ...exact }).count(), 'no merge button while one plays').toBe(0);
  await shotAt(admin, merge, 'merge66-refused-360');
  // Петро закриває лобі: у лобі кнопки завершення немає, тож починає й одразу завершує гру.
  await click(petro, 'Почати гру');
  await click(petro, 'Завершити гру');
  await olyaB.getByText('Гру завершено').first().waitFor({ timeout: 30_000 });

  // ── 4. Перегляд (знову): головний Оля, що перейде, що злиється, способи входу, червоний рядок про пароль. ──
  // Кімната в базі пишеться із затримкою: поки рядок live_room не став «завершено», відмова лишається — перегляд перезапитуємо перемиканням головного.
  await expect
    .poll(async () => {
      await merge.getByRole('radio', { name: 'Головним лишається: Оля Нова', ...exact }).check();
      await merge.getByRole('radio', { name: 'Головним лишається: Оля', ...exact }).check();
      return merge.getByText(/^Перейде на головний: /).waitFor({ timeout: 2000 }).then(() => true, () => false);
    }, { timeout: 30_000 })
    .toBe(true);
  expect(await merge.getByRole('radio', { name: 'Головним лишається: Оля', ...exact }).isChecked()).toBe(true);
  const preview = await merge.innerText();
  expect(preview).toMatch(/Перейде на головний: .*ігор: 2/);
  expect(preview).toMatch(/Злиються: .*тих самих ігор: 1/);
  expect(preview).toMatch(/Злиються: .*спільних груп: 1/);
  expect(preview).toMatch(/Злиються: .*спільних друзів: \d+/);
  expect(preview).toContain('Способи входу: Пошта й пароль');
  const warning = merge.locator('p.error', { hasText: 'Пароль акаунта Оля Нова перестане діяти' });
  await warning.waitFor();
  expect(await merge.getByRole('button', { name: 'Об\'єднати', ...exact }).isDisabled(), 'nothing typed yet').toBe(true);
  await shotAt(admin, merge, 'merge66-preview-360');
  await shotAt(admin, warning, 'merge66-password-360', 'center');

  // Темна тема: той самий перегляд в окремому контексті з тим самим входом (без злиття).
  const darkContext = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'uk-UA', colorScheme: 'dark', storageState: { cookies: (await admin.context().storageState()).cookies, origins: [] } });
  contexts.push(darkContext);
  const dark = await darkContext.newPage();
  await dark.goto(`${base}/admin/users/${olyaId}`);
  const darkMerge = section(dark, HEADING);
  await darkMerge.waitFor();
  expect(await isLight(dark), 'the dark page is dark').toBe(false);
  await pickOther(dark, darkMerge);
  await darkMerge.getByText(/^Перейде на головний: /).waitFor();
  await shotAt(dark, darkMerge, 'merge66-preview-dark-360');
  await shotAt(dark, darkMerge.locator('p.error', { hasText: 'Пароль акаунта Оля Нова перестане діяти' }), 'merge66-password-dark-360', 'center');
  await darkMerge.getByLabel('Щоб підтвердити, введи нік акаунта, що зникне: Оля Нова', exact).fill('Оля Нова');
  await shotAt(dark, darkMerge.getByRole('button', { name: 'Об\'єднати', ...exact }), 'merge66-typed-dark-360', 'center');

  // ── 5. Нік: невірний — кнопка неактивна; точний «Оля Нова» — активна; підтвердження → картка Олі. ──
  const typed = merge.getByLabel('Щоб підтвердити, введи нік акаунта, що зникне: Оля Нова', exact);
  const button = merge.getByRole('button', { name: 'Об\'єднати', ...exact });
  await typed.fill('Оля');
  expect(await button.isDisabled(), 'a wrong nickname').toBe(true);
  await shotAt(admin, typed, 'merge66-wrong-360', 'center');
  await typed.fill('Оля Нова');
  expect(await button.isDisabled(), 'the exact nickname').toBe(false);
  await shotAt(admin, button, 'merge66-typed-360', 'center');
  await button.click();
  // Другого акаунта немає: розділ знову порожній (рядок пошуку без вибору), картка Олі перечитана.
  await expect.poll(() => merge.getByRole('button', { name: 'Об\'єднати', ...exact }).count(), POLL).toBe(0);
  await expect.poll(async () => ((await admin.request.get(`${base}/api/admin/users/${olyaBId}`)).status()), POLL).toBe(404);
  expect(admin.url()).toBe(`${base}/admin/users/${olyaId}`);
  const games = section(admin, 'Останні ігри');
  await games.getByRole('link', { name: T_PETRO, ...exact }).waitFor();
  expect(await games.getByRole('link', { name: T_PETRO, ...exact }).count(), 'the shared game is listed once').toBe(1);
  await admin.evaluate(() => scrollTo(0, 0));
  await view(admin, 'merge66-done-360');
  await shotAt(admin, games, 'merge66-done-games-360');
  await dark.reload();
  await section(dark, 'Останні ігри').waitFor();
  await shotAt(dark, section(dark, 'Останні ігри'), 'merge66-done-dark-360');
  await dark.close();

  // ── 6. Сесія «Оля Нова» закрита: після перезавантаження — гість. Вхід обома адресами — той самий акаунт Олі з повною історією. ──
  await olyaB.reload();
  expect((await olyaB.request.get(`${base}/api/me`)).status(), 'the secondary session is closed').toBe(401);
  const signIn = async (email: string) => {
    await olyaB.goto(`${base}/login`);
    await field(olyaB, 'Email').fill(email);
    await field(olyaB, 'Пароль').fill(PASSWORD);
    await click(olyaB, 'Увійти');
    await olyaB.locator(MENU).getByRole('link', { name: 'Профіль' }).waitFor();
    expect(await myId(olyaB), `${email} signs in to the primary account`).toBe(olyaId);
  };
  const signOut = async () => {
    await olyaB.goto(`${base}/profile/settings`);
    await click(olyaB, 'Вийти');
    await olyaB.waitForURL(`${base}/`);
  };
  await signIn(OLYA_B_EMAIL);
  const profile = (await (await olyaB.request.get(`${base}/api/me/profile`)).json()) as { nickname: string };
  expect(profile.nickname).toBe('Оля');
  // Історія: «Зіграні» — гра Петра один раз, «Проведені» — гра Олі.
  await olyaB.goto(`${base}/history`);
  await olyaB.locator('.history-tabs a', { hasText: 'Зіграні' }).click();
  await olyaB.getByText('Завантажуємо…').waitFor({ state: 'detached' });
  await olyaB.getByRole('heading', { name: T_PETRO, ...exact }).first().waitFor();
  expect(await olyaB.getByRole('heading', { name: T_PETRO, ...exact }).count(), 'the shared game once in the history').toBe(1);
  await view(olyaB, 'merge66-history-played-360');
  await olyaB.locator('.history-tabs a', { hasText: 'Проведені' }).click();
  await olyaB.getByText('Завантажуємо…').waitFor({ state: 'detached' });
  await olyaB.getByRole('heading', { name: T_OLYA, ...exact }).waitFor();
  await view(olyaB, 'merge66-history-hosted-360');
  // Друг Петро один раз, група «Родина» одна, Оля — власниця.
  const friends = (await (await olyaB.request.get(`${base}/api/me/friends`)).json()) as { id: string }[];
  expect(friends.filter((friend) => friend.id === petroId)).toHaveLength(1);
  const groups = ((await (await olyaB.request.get(`${base}/api/groups`)).json()) as { groups: { name: string; role: string }[] }).groups;
  expect(groups.map((group) => [group.name, group.role])).toEqual([[GROUP, 'owner']]);
  await olyaB.goto(`${base}/profile/groups`);
  await olyaB.getByText(GROUP, exact).first().waitFor();
  await view(olyaB, 'merge66-groups-360');
  await signOut();
  await signIn(OLYA_EMAIL);
  await signOut();

  // ── 7. Реєстрація на злитій адресі — відмова. ──
  await olyaB.locator(MENU).getByRole('link', { name: 'Увійти' }).click();
  await click(olyaB, 'Створити акаунт');
  await field(olyaB, 'Ваше ім’я').fill('Оля Третя');
  await field(olyaB, 'Email').fill(OLYA_B_EMAIL);
  await field(olyaB, 'Пароль').fill(PASSWORD);
  await click(olyaB, 'Зареєструватися');
  await olyaB.getByRole('alert').filter({ hasText: 'Ця адреса вже приєднана до іншого акаунта' }).waitFor();
  await view(olyaB, 'merge66-signup-refused-360');

  // ── 8. Журнал: один рядок з підсумком, без email. ──
  await admin.goto(`${base}/admin/log`);
  const line = admin.getByText(/об'єднав\(-ла\) акаунт Оля Нова з акаунтом Оля: .*ігор: 2/).first();
  await line.waitFor();
  expect(await admin.getByText(/об'єднав\(-ла\) акаунт/).count(), 'one merge line').toBe(1);
  await view(admin, 'merge66-log-360');
  expect(await admin.locator('main').innerText(), 'the log has no email').not.toContain('@');
  expect(await bodyText(admin)).not.toContain(OLYA_B_EMAIL);

  // Очікувані відповіді: 400/401/404/409 на адмінських і авторизаційних запитах (відмова реєстрації, вхід гостя, зниклий акаунт).
  const unexpected = problems.filter((entry) => !/\b(409|404|400|401|403)\b.*\/api\/(admin|auth)\//.test(entry));
  expect(unexpected, `page errors (${unexpected.length}):\n${unexpected.join('\n')}`).toEqual([]);
}
