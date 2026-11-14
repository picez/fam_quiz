import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { expectNoSideScroll, MENU, myId, open, register } from './helpers/common';
import { base, exact, problems, shot, snapshot, useE2eServer } from './helpers/setup';

/**
 * Наскрізний тест частини 12k: групи родини — створення, посилання з QR, вступ за посиланням і від друга,
 * записи з формою на один екран 375 px, «сюрприз», нове посилання, вихід, чужий і 320 px.
 * Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

const GROUP = 'Родина Квіткових';
const STORY = 'Як тато заблукав у лісі по гриби й вийшов до сусіднього села';
const CAKE = 'Оля колись спекла торт без борошна — і всі попросили добавки';
const GONE = 'Це посилання вже не діє. Попроси нове в того, хто тебе запросив.';

const texts = (page: Page) => page.locator('.group-item-text').allTextContents();
const groupHeading = (page: Page) => page.getByRole('heading', { level: 1, name: `🌻 ${GROUP}`, ...exact });
const tab = (page: Page, name: string) => page.getByRole('tab', { name, ...exact }).click();

/** Кнопка «Зберегти запис» видна без прокрутки сторінки й не заходить під меню. */
async function expectOneScreen(page: Page, name: string) {
  expect(await page.evaluate('window.scrollY'), `${name}: the page is scrolled`).toBe(0);
  const save = await page.getByRole('button', { name: 'Зберегти запис', ...exact }).boundingBox();
  const menu = await page.locator(MENU).boundingBox();
  expect(save).not.toBeNull();
  expect(menu).not.toBeNull();
  expect(save!.y + save!.height, `${name}: «Зберегти запис» under the menu`).toBeLessThanOrEqual(menu!.y + 0.5);
  expect(save!.y, `${name}: «Зберегти запис» above the screen`).toBeGreaterThanOrEqual(0);
}

async function groups12k() {
  // ── 1. Троє з акаунтами; Оля дружить з Ірою. ──
  const olya = await open('olya12k', 375, 812);
  await register(olya, 'menu', 'Оля Квіткова', 'olya12k@example.com');
  const petro = await open('petro12k', 375, 812);
  await register(petro, 'menu', 'Петро Гай', 'petro12k@example.com');
  const ira = await open('ira12k', 375, 812);
  await register(ira, 'menu', 'Іра Лис', 'ira12k@example.com');
  const olyaId = await myId(olya);
  const iraId = await myId(ira);
  expect((await olya.request.put(`${base}/api/me/friends/${iraId}`)).status()).toBeLessThan(300);

  // ── 2. Створення: «Профіль» → плитка «Групи» → порожньо → «Створити групу». ──
  await olya.locator(MENU).getByRole('link', { name: 'Профіль' }).click();
  await olya.locator('nav.profile-tiles a.is-wide').click();
  await olya.getByRole('heading', { level: 1, name: 'Групи', ...exact }).waitFor();
  await olya.getByText(/^Ще жодної групи\./).waitFor();
  await olya.getByRole('button', { name: 'Створити групу', ...exact }).click();
  await olya.getByLabel('Назва', exact).fill(GROUP);
  await olya.getByRole('radio', { name: '🌻', ...exact }).click();
  await olya.getByLabel('Опис (необов’язково)', exact).fill('Усі, хто збирається на свята в бабусі');
  await olya.getByRole('button', { name: 'Створити', ...exact }).click();
  await groupHeading(olya).waitFor();
  const groupId = /\/profile\/groups\/([0-9a-f-]{36})$/.exec(olya.url())![1]!;
  await olya.getByText(/Тут житимуть ваші історії/).waitFor();
  await shot(olya, 'p12k-olya-new-group');

  // ── 3. Посилання й QR у «Учасниках». ──
  await tab(olya, 'Учасники');
  const linkField = olya.getByRole('textbox', { name: 'Запросити', ...exact });
  await linkField.waitFor();
  await olya.locator('.group-invite-qr svg').waitFor();
  expect(await olya.locator('.group-invite-qr svg title').textContent()).toBe('QR-код посилання в групу');
  const qr = await olya.locator('.group-invite-qr svg').boundingBox();
  expect(qr!.x + qr!.width, 'the QR fits the screen').toBeLessThanOrEqual(375);
  await expectNoSideScroll(olya, 'p12k-invite-panel');
  const link = await linkField.inputValue();
  expect(link).toMatch(/\/groups\/join\/[a-z2-9]{10}$/);

  // ── 4. Петро — за посиланням; гість бачить лише «Увійди, щоб приєднатися». ──
  await petro.goto(link);
  await petro.getByText('Оля кличе тебе в групу', exact).waitFor();
  await petro.getByRole('heading', { name: GROUP, ...exact }).waitFor();
  await petro.getByText('1 людина', exact).waitFor();
  await shot(petro, 'p12k-join-card');
  await petro.getByRole('button', { name: 'Приєднатися', ...exact }).click();
  await groupHeading(petro).waitFor();
  expect(petro.url()).toBe(`${base}/profile/groups/${groupId}`);

  const guest = await open('guest12k', 375, 812);
  await guest.goto(link);
  await guest.getByText('Увійди, щоб приєднатися', exact).waitFor();
  expect(await guest.locator('body').innerText()).not.toContain(GROUP);
  await shot(guest, 'p12k-join-guest');

  // ── 5. Від друга: Оля запрошує Іру, Іра бачить бейдж і приєднується. ──
  await olya.reload();
  await olya.locator('.group-invite-friends label', { hasText: 'Іра' }).getByRole('checkbox').check();
  await olya.getByRole('button', { name: 'Надіслати запрошення', ...exact }).click();
  await olya.getByText('Запрошення надіслано', exact).waitFor();
  await olya.locator('.group-invite-pending li', { hasText: 'Іра' }).waitFor();

  await ira.reload();
  await ira.locator(MENU).getByRole('link', { name: 'Профіль, Запрошень: 1', ...exact }).waitFor();
  await ira.locator(MENU).getByRole('link', { name: 'Профіль, Запрошень: 1', ...exact }).click();
  const wide = ira.locator('nav.profile-tiles a.is-wide');
  await wide.locator('.menu-badge', { hasText: '1' }).waitFor();
  await wide.click();
  await ira.getByRole('heading', { name: 'Тебе запрошують', ...exact }).waitFor();
  await ira.getByText(`Оля запрошує в групу 🌻 «${GROUP}»`, exact).waitFor();
  await shot(ira, 'p12k-ira-invite');
  await ira.getByRole('button', { name: 'Приєднатися', ...exact }).click();
  await groupHeading(ira).waitFor();
  await expect.poll(() => ira.locator(`${MENU} .menu-badge`).count(), { timeout: 5000 }).toBe(0);

  // ── 6. Запис: форма на один екран 375 × 812, потім на 320 × 640. ──
  await petro.reload();
  await petro.getByRole('link', { name: 'Додати запис', ...exact }).click();
  await petro.getByRole('heading', { level: 1, name: 'Новий запис', ...exact }).waitFor();
  await petro.getByLabel('Текст', exact).waitFor();
  await expectOneScreen(petro, 'p12k-item-form');
  await expectNoSideScroll(petro, 'p12k-item-form');
  await tab(petro, 'Історія');
  await petro.getByLabel('Текст', exact).fill(STORY);
  const aboutName = petro.getByRole('textbox', { name: 'бабуся Ніна', ...exact });
  await aboutName.fill('тато');
  await aboutName.press('Enter');
  await petro.getByRole('button', { name: 'Прибрати: тато', ...exact }).waitFor();
  await petro.getByLabel('Коротка відповідь', exact).fill('Тато');
  await petro.getByLabel('Рік', exact).fill('1998');
  await expectOneScreen(petro, 'p12k-item-form-filled');
  await petro.getByRole('button', { name: 'Зберегти запис', ...exact }).click();
  await groupHeading(petro).waitFor();
  await expect.poll(() => texts(petro)).toEqual([STORY]);
  await petro.locator('article.group-item').first().getByText('✍️ Петро', exact).waitFor();

  await petro.setViewportSize({ width: 320, height: 640 });
  await petro.goto(`${base}/profile/groups/${groupId}/new`);
  await petro.getByLabel('Текст', exact).waitFor();
  await expectNoSideScroll(petro, 'p12k-item-form-320');
  await petro.setViewportSize({ width: 375, height: 812 });

  // ── 7. Сюрприз про Олю: Петро й Іра бачать, Оля — ні. ──
  await petro.getByLabel('Текст', exact).fill(CAKE);
  await petro.locator('.about-members').getByRole('button', { name: 'Оля', ...exact }).click();
  await petro.getByRole('checkbox', { name: 'Сюрприз', ...exact }).check();
  await petro.getByRole('button', { name: 'Зберегти запис', ...exact }).click();
  await groupHeading(petro).waitFor();
  await expect.poll(() => texts(petro)).toEqual([CAKE, STORY]);
  await petro.locator('article.group-item').first().getByText('🤫 Сюрприз для: Оля', exact).waitFor();
  await shot(petro, 'p12k-surprise-petro');

  await olya.goto(`${base}/profile/groups/${groupId}`);
  await groupHeading(olya).waitFor();
  await expect.poll(() => texts(olya)).toEqual([STORY]);
  await olya.getByText('3 людини · 1 запис', exact).waitFor();
  await shot(olya, 'p12k-olya-no-surprise');
  const olyaItems = await olya.request.get(`${base}/api/groups/${groupId}/items`);
  expect(await olyaItems.text()).not.toContain('торт');

  await ira.goto(`${base}/profile/groups/${groupId}`);
  await expect.poll(() => texts(ira)).toEqual([CAKE, STORY]);

  // ── 8. Пошук і фільтр виду. ──
  await ira.getByRole('searchbox', { name: 'Пошук у записах', ...exact }).fill('гриб');
  await expect.poll(() => texts(ira)).toEqual([STORY]);
  await ira.getByRole('searchbox', { name: 'Пошук у записах', ...exact }).fill('');
  await ira.getByRole('radio', { name: 'Факт', ...exact }).click();
  await expect.poll(() => texts(ira)).toEqual([CAKE]);
  await shot(ira, 'p12k-filters');

  // ── 9. Нове посилання: старе вже не діє. ──
  await tab(olya, 'Учасники');
  await olya.getByRole('button', { name: 'Нове посилання', ...exact }).click();
  await olya.getByText('Нове посилання готове, старе більше не діє', exact).waitFor();
  expect(await olya.getByRole('textbox', { name: 'Запросити', ...exact }).inputValue()).not.toBe(link);
  const vira = await open('vira12k', 375, 812);
  await register(vira, 'menu', 'Віра Сад', 'vira12k@example.com');
  await vira.goto(link);
  await vira.getByText(GONE, exact).waitFor();
  expect(await vira.getByRole('button', { name: 'Приєднатися', ...exact }).count()).toBe(0);
  await shot(vira, 'p12k-link-gone');

  // ── 10. Власниця не виходить, поки не передасть керування. ──
  const leaveOwn = olya.getByRole('button', { name: 'Вийти з групи', ...exact });
  expect(await leaveOwn.isDisabled()).toBe(true);
  await olya.getByText('Щоб вийти, спершу передай керування комусь іншому.', exact).waitFor();
  const refused = await olya.request.post(`${base}/api/groups/${groupId}/leave`);
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toEqual({ error: 'owner_must_transfer' });

  // ── 11. Петро виходить: його історія лишається з «вже не в групі». ──
  await petro.goto(`${base}/profile/groups/${groupId}?tab=people`);
  await petro.getByRole('button', { name: 'Вийти з групи', ...exact }).click();
  await petro.waitForURL(`${base}/profile/groups`);
  await petro.getByText(/^Ще жодної групи\./).waitFor();
  expect(await petro.locator('ul.group-cards').count()).toBe(0);

  await ira.goto(`${base}/profile/groups/${groupId}`);
  await expect.poll(() => texts(ira)).toEqual([CAKE, STORY]);
  await ira.locator('article.group-item', { hasText: STORY }).getByText('✍️ вже не в групі', exact).waitFor();
  await shot(ira, 'p12k-former-member');

  // ── 12. Чужа: 404 і в API, і в браузері. ──
  expect((await vira.request.get(`${base}/api/groups/${groupId}`)).status()).toBe(404);
  await vira.goto(`${base}/profile/groups/${groupId}`);
  await vira.getByText('Групу не знайдено — можливо, її видалили або тебе в ній немає.', exact).waitFor();

  // ── 13. Публічний профіль Олі не каже нічого про групи. ──
  await ira.goto(`${base}/profile/${olyaId}`);
  await ira.getByRole('heading', { level: 1 }).first().waitFor();
  expect(await ira.locator('body').innerText()).not.toContain(GROUP);

  // ── 14. 320 px: список, записи, учасники, вступ. ──
  await olya.setViewportSize({ width: 320, height: 640 });
  await olya.goto(`${base}/profile/groups`);
  await olya.locator('ul.group-cards').waitFor();
  await expectNoSideScroll(olya, 'p12k-groups-320');
  await olya.goto(`${base}/profile/groups/${groupId}`);
  await expect.poll(() => texts(olya)).toEqual([STORY]);
  await expectNoSideScroll(olya, 'p12k-items-320');
  await olya.goto(`${base}/profile/groups/${groupId}?tab=people`);
  await olya.locator('.group-invite-qr svg').waitFor();
  expect(await olya.locator('.group-invite-qr svg title').textContent()).toBe('QR-код посилання в групу');
  await expectNoSideScroll(olya, 'p12k-people-320');
  const fresh = await olya.getByRole('textbox', { name: 'Запросити', ...exact }).inputValue();
  await vira.setViewportSize({ width: 320, height: 640 });
  await vira.goto(fresh);
  await vira.getByRole('button', { name: 'Приєднатися', ...exact }).waitFor();
  await expectNoSideScroll(vira, 'p12k-join-320');

  // ── 15. Помилок консолі немає, крім очікуваних 404 чужій і за старим посиланням. ──
  const expected = (problem: string) => /404 \(Not Found\)/.test(problem) && /\/api\/groups\/(join\/[a-z2-9]{10}|[0-9a-f-]{36})$/.test(problem);
  expect(problems.filter((problem) => !expected(problem))).toEqual([]);
}

it('part 12k: Оля creates «Родина Квіткових» and shares the link with a QR, Петро joins by it while a guest is asked to sign in, Іра gets a friend invite with the «Профіль» badge, Петро writes a story and a surprise about Оля on the one-screen 375 form, Оля never sees the surprise, a refreshed link stops working, the owner cannot leave, Петро’s story stays as «вже не в групі», a stranger gets 404, and groups fit 320 px', async () => {
  try {
    await groups12k();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);
