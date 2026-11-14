import { randomUUID } from 'node:crypto';
import { bool as boolQ, classicRound, makeQuiz, makeRoundsQuiz, order, single } from '@quiz/engine/testing';
import { LOCALES, xpForLevel, type PrizeContent } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { prizeAward, userAchievement, userLike, xpEntry } from '../src/db/schema';
import { deleteAward } from '../src/prizes';
import { kyivDay } from '../src/xp-rules';
import ar from '../../web/src/locales/ar.json';
import de from '../../web/src/locales/de.json';
import en from '../../web/src/locales/en.json';
import { ukMessages } from '../../web/src/i18n';
import { open, click, field, homeCodeField, join, expectNoSideScroll, MENU, MENU_ITEMS_23A, menuLinks, register, myId, noSideScroll, POLL, socketFrames, MENU_FITS_14A, expectFiveItems, openProfileTile, label, htmlLang, htmlDir, ownDir, join22a } from './helpers/common';
import { exact, base, db, problems, snapshot, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частини 22–24: локалізація, кривавий місяць, стартове меню, вподобані вікторини, список лобі, вигляд профілю.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

async function l10n22a() {
  const LANGS = ['uk', 'en', 'pl', 'de', 'es', 'it', 'ar'] as const;
  const PAGES = ['/', '/feed', '/feed/calendar', '/quizzes', '/quizzes/new', '/history', '/prizes', '/achievements', '/profile', '/help'];
  const CITY = 'Яке місто — столиця України?';
  const RIVER = 'Дніпро впадає в Балтійське море?';
  const QUIZ = 'Мови 22a';
  const PASSWORD = 'correct horse battery';

  // ── 1. Браузер вирішує: німецький браузер без збереженої мови відкриває сайт німецькою. ──
  const guest = await open('guest22a', 375, 812, { locale: 'de-DE' });
  await guest.goto(base);
  await expect.poll(() => htmlLang(guest), POLL).toBe('de');
  expect(await htmlDir(guest)).toBe('ltr');
  await guest.locator(MENU).getByRole('link', { name: de.menuJoin, ...exact }).waitFor();
  await shot(guest, 'p22a-de-home');

  // ── 2. Меню й прокрутка вбік у кожній мові. ──
  const olya = await open('olya22a', 375, 812);
  await register(olya, 'menu', 'Оля 22a', 'olya22a@example.com');
  const named = await olya.request.put(`${base}/api/me/profile`, { data: { nickname: 'Оля 22a', avatar: null } });
  expect(named.ok(), await named.text()).toBe(true);
  // ~80 переходів за хвилину: значки меню (запрошення, стрічка — по 60 на хвилину на людину) відповідають один раз, далі
  // сторінки отримують ту саму відповідь, інакше сервер чесно дасть 429. Для макета меню вони однакові.
  const BADGES = /\/api\/me\/(invites|feed\/badge)(\?|$)/;
  const badges = new Map<string, string>();
  await olya.context().route(BADGES, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!badges.has(path)) badges.set(path, await (await route.fetch()).text());
    await route.fulfill({ contentType: 'application/json', body: badges.get(path)! });
  });
  for (const lang of LANGS) {
    const saved = await olya.request.put(`${base}/api/me/locale`, { data: { locale: lang } });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toEqual({ locale: lang });
    await olya.setViewportSize({ width: 375, height: 812 });
    await olya.goto(`${base}/profile`);
    await expect.poll(() => htmlLang(olya), POLL).toBe(lang);
    expect(await htmlDir(olya)).toBe(lang === 'ar' ? 'rtl' : 'ltr');
    await expect.poll(() => olya.locator(`${MENU} a`).count(), POLL).toBe(5);
    await expectFiveItems(olya, 360);
    await shot(olya, `p22a-${lang}-menu-360`);
    await expectFiveItems(olya, 375);
    for (const path of PAGES) {
      await olya.goto(`${base}${path}`);
      await expect.poll(() => olya.locator(`${MENU} a`).count(), POLL).toBe(5);
      expect(await htmlLang(olya)).toBe(lang);
      const name = path === '/' ? 'start' : path.slice(1).replaceAll('/', '-');
      await expectNoSideScroll(olya, `p22a-${lang}-${name}`);
    }
    if (lang === 'de' || lang === 'uk') {
      // 401–700 px: і тут короткі підписи (uk теж), усі п'ять в одному рядку, жоден не вилазить за свій пункт.
      await olya.setViewportSize({ width: 412, height: 812 });
      await olya.goto(`${base}/profile`);
      await expect.poll(() => olya.locator(`${MENU} a`).count(), POLL).toBe(5);
      await expectFiveItems(olya, 412);
      const shown = (await olya.evaluate(MENU_FITS_14A)) as { shown: string[] };
      expect(shown.shown.every((content) => content.includes('"')), `p22a-${lang}-menu-412: short labels are not shown`).toBe(true);
      expect(await noSideScroll(olya), `p22a-${lang}-menu-412: horizontal scroll`).toBe(true);
      await shot(olya, `p22a-${lang}-menu-412`);
      await olya.setViewportSize({ width: 375, height: 812 });
    }
    if (lang === 'de' || lang === 'uk' || lang === 'it') {
      // 701–800 px: меню вже вгорі з повними підписами — один рядок, жоден підпис не переноситься й не вилазить за пункт.
      await olya.goto(`${base}/profile`);
      await expect.poll(() => olya.locator(`${MENU} a`).count(), POLL).toBe(5);
      for (const width of [701, 750, 800]) {
        await expectFiveItems(olya, width);
        const top = (await olya.locator(`${MENU} a`).evaluateAll((links) =>
          links.map((a) => {
            // Повний підпис — flex-елемент (одна рамка навіть із переносом), тож рядки рахуємо через Range по тексту.
            const full = a.querySelector('.menu-full');
            const box = a.getBoundingClientRect();
            let lines = 0;
            if (full) {
              const range = a.ownerDocument.createRange();
              range.selectNodeContents(full);
              lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
            }
            return { y: Math.round(box.top), lines, height: box.height };
          }),
        )) as { y: number; lines: number; height: number }[];
        expect(new Set(top.map((r) => r.y)).size, `p22a-${lang}-menu-${width}: the items are not in one row`).toBe(1);
        expect(top.filter((r) => r.lines !== 1).length, `p22a-${lang}-menu-${width}: a full label wraps (${JSON.stringify(top)})`).toBe(0);
        expect((await olya.locator(MENU).boundingBox())!.height, `p22a-${lang}-menu-${width}: height`).toBeLessThanOrEqual(60);
        expect(await noSideScroll(olya), `p22a-${lang}-menu-${width}: horizontal scroll`).toBe(true);
      }
      await shot(olya, `p22a-${lang}-menu-750`);
      await olya.setViewportSize({ width: 375, height: 812 });
    }
  }

  await olya.context().unroute(BADGES);

  // ── 3. Перемикач у налаштуваннях профілю; мова йде за акаунтом у новий український браузер. ──
  await olya.goto(`${base}/profile/settings`);
  await expect.poll(() => htmlLang(olya), POLL).toBe('ar');
  // Підпис поля обгортає select, тож його ім'я — «Мова» плюс вибрана мова.
  await olya.getByRole('combobox', { name: new RegExp(`^${ar.languageLabel}`) }).selectOption({ label: 'Deutsch' });
  await expect.poll(() => htmlLang(olya), POLL).toBe('de');
  expect(await htmlDir(olya)).toBe('ltr');
  await expect
    .poll(async () => {
      const me = await olya.request.get(`${base}/api/me`);
      return ((await me.json()) as { locale: string | null }).locale;
    }, POLL)
    .toBe('de');
  const olya2 = await open('olya22a-2', 375, 812);
  await olya2.goto(`${base}/login`);
  await expect.poll(() => htmlLang(olya2), POLL).toBe('uk');
  await field(olya2, 'Email').fill('olya22a@example.com');
  await field(olya2, 'Пароль').fill(PASSWORD);
  await click(olya2, 'Увійти');
  await expect.poll(() => htmlLang(olya2), POLL).toBe('de');
  await olya2.locator(MENU).getByRole('link', { name: de.menuProfile, ...exact }).waitFor();
  expect(await olya2.evaluate("localStorage.getItem('quiz:locale')")).toBe('de');
  await olya2.goto(`${base}/profile/settings`);
  await expect.poll(() => htmlLang(olya2), POLL).toBe('de');
  await olya2.getByRole('combobox', { name: new RegExp(`^${de.languageLabel}`) }).waitFor();
  expect(await noSideScroll(olya2)).toBe(true);
  await shot(olya2, 'p22a-de-profile');

  // ── 4. Одна гра трьома мовами: Богдан веде англійською, Оля грає німецькою, Віра — арабською справа наліво. ──
  const bohdan = await open('bohdan22a', 1280, 800, { locale: 'en-GB' });
  await bohdan.goto(`${base}/login`);
  await expect.poll(() => htmlLang(bohdan), POLL).toBe('en');
  await click(bohdan, label(en, 'Створити акаунт'));
  await field(bohdan, label(en, 'Ваше ім’я')).fill('Богдан 22a');
  await field(bohdan, label(en, 'Email')).fill('bohdan22a@example.com');
  await field(bohdan, label(en, 'Пароль')).fill(PASSWORD);
  await click(bohdan, label(en, 'Зареєструватися'));
  await bohdan.locator(MENU).getByRole('link', { name: en.menuProfile, ...exact }).waitFor();
  const bohdanNamed = await bohdan.request.put(`${base}/api/me/profile`, { data: { nickname: 'Богдан 22a', avatar: null } });
  expect(bohdanNamed.ok(), await bohdanNamed.text()).toBe(true);
  const questions = [
    { ...single, id: 'q1', text: CITY, options: [{ id: 'a', text: 'Київ' }, { id: 'b', text: 'Львів' }, { id: 'c', text: 'Одеса' }], correctId: 'a' },
    { ...boolQ, id: 'q2', text: RIVER, correct: false },
  ];
  const quiz = { ...makeRoundsQuiz([classicRound('r1', questions as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]), title: QUIZ };
  const created = await bohdan.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(created.status()).toBe(201);
  await bohdan.goto(`${base}/quizzes`);
  await bohdan.locator('.quiz-list li', { hasText: QUIZ }).getByRole('button', { name: label(en, 'Грати'), ...exact }).click();
  await bohdan.waitForURL(/\/host\/\d{6}$/);
  const code = bohdan.url().slice(-6);
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  expect(await htmlLang(bohdan)).toBe('en');
  await bohdan.getByRole('button', { name: label(en, 'Почати гру'), ...exact }).waitFor();
  await shot(bohdan, 'p22a-en-host-lobby');
  // Англійську лише вгадали з мов браузера, Богдан її не вибирав: профіль лишається без мови.
  const bohdanMe = (await (await bohdan.request.get(`${base}/api/me`)).json()) as { locale: string | null };
  expect(bohdanMe.locale, 'a browser-detected locale is not written to the profile').toBeNull();

  const stageHref = await bohdan.locator('a[href*="/stage/"]').first().getAttribute('href');
  const stage = await open('stage22a', 1280, 720, { locale: 'en-GB' });
  await stage.goto(new URL(stageHref!, base).href);
  await expect.poll(() => htmlLang(stage), POLL).toBe('en');
  await stage.getByText(spaced).first().waitFor();

  const vira = await open('vira22a', 375, 812, { locale: 'ar-EG' });
  await vira.goto(`${base}/play/${code}`);
  await expect.poll(() => htmlLang(vira), POLL).toBe('ar');
  expect(await htmlDir(vira)).toBe('rtl');
  const roomCode = vira.getByText(spaced, exact).first();
  await roomCode.waitFor();
  expect(await ownDir(roomCode), 'the room code reads left to right').toBe('ltr');
  expect(await noSideScroll(vira)).toBe(true);
  await shot(vira, 'p22a-ar-join');
  await join22a(vira, ar, code, 'Віра');
  await join22a(olya2, de, code, 'Оля');

  await click(bohdan, label(en, 'Почати гру'));
  await click(bohdan, label(en, 'Почати раунд'));
  const heading = vira.getByRole('heading', { name: CITY, ...exact });
  await heading.waitFor();
  expect(await heading.textContent()).toBe(CITY);
  expect(await heading.getAttribute('dir')).toBe('auto');
  const timer = vira.locator('.timer').first();
  expect(await timer.getAttribute('dir')).toBe('ltr');
  expect(await ownDir(timer)).toBe('ltr');
  expect(await noSideScroll(vira)).toBe(true);
  await shot(vira, 'p22a-ar-question');
  await stage.getByRole('heading', { name: CITY, ...exact }).waitFor();
  await shot(stage, 'p22a-en-stage-question');

  await vira.getByRole('button', { name: /Київ/ }).click();
  await olya2.getByRole('button', { name: /Львів/ }).click();
  await click(bohdan, label(en, 'Показати відповідь'));
  await bohdan.getByRole('button', { name: label(en, 'Далі'), ...exact }).waitFor();
  await vira.getByText(ar.resultCorrect, exact).first().waitFor();
  expect(await noSideScroll(vira)).toBe(true);
  await shot(vira, 'p22a-ar-reveal');

  // «Далі»: рейтинг після запитання (якщо він є), потім «Наступне запитання».
  await click(bohdan, label(en, 'Далі'));
  const nextQuestion = bohdan.getByRole('button', { name: label(en, 'Наступне запитання'), ...exact });
  const river = vira.getByRole('heading', { name: RIVER, ...exact });
  await Promise.race([nextQuestion.waitFor(), river.waitFor()]);
  if (await nextQuestion.isVisible()) await nextQuestion.click();
  await river.waitFor();
  await vira.getByRole('button', { name: ar.no, ...exact }).click();
  await olya2.getByRole('button', { name: de.yes, ...exact }).click();
  await click(bohdan, label(en, 'Показати відповідь'));
  await bohdan.getByRole('button', { name: label(en, 'Далі'), ...exact }).waitFor();
  await click(bohdan, label(en, 'Далі'));
  await vira.getByText(ar.gameOver, exact).first().waitFor();
  await olya2.getByText(de.gameOver, exact).first().waitFor();

  const viraRow = vira.locator('.standings li', { hasText: 'Віра' });
  await viraRow.waitFor();
  const viraScore = viraRow.locator('.score');
  expect(await viraScore.getAttribute('dir')).toBe('ltr');
  expect(await viraScore.textContent()).toMatch(/^[0-9]+$/);
  expect(await noSideScroll(vira)).toBe(true);
  await shot(vira, 'p22a-ar-scores');
  await olya2.locator('.standings li', { hasText: 'Віра' }).waitFor();
  expect(await noSideScroll(olya2)).toBe(true);
  await shot(olya2, 'p22a-de-scores');
  await stage.getByText('Віра').first().waitFor();
  await shot(stage, 'p22a-en-stage-scores');

  expect(problems).toEqual([]);
}

it('part 22a: localisation — a German browser opens the site in German, every language keeps the five-item menu within 60 px on 360 and 375 px with no side scroll, Оля picks Deutsch in the profile and gets it back on a fresh Ukrainian browser after sign-in, Богдан hosts in English, Віра plays from an Arabic phone right to left with the room code, timer and scores left to right and the Ukrainian questions untranslated', async () => {
  try {
    await l10n22a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Скінченні анімації (розкриття, мигання вердикту) скінчились; нескінченні (мотиви) не рахуються. */
const VERDICT_SETTLED_23A = `document.getAnimations().every((a) => a.playState !== 'running' || a.effect.getComputedTiming().iterations === Infinity)`;

/** getComputedStyle сторінки: у типах сервера немає DOM. */
type Css23a = { getComputedStyle: (element: unknown, pseudo?: string) => Record<string, string | undefined> };

/** Нагорода Олі прямою вставкою (23a): place 1, своя дата, вміст за зразком складу призів. */
function award23a(userId: string, quizTitle: string, awardedAt: Date, content: Partial<PrizeContent>) {
  return {
    id: randomUUID(),
    userId,
    prizeId: randomUUID(),
    gameId: randomUUID(),
    place: 1 as const,
    content: { name: quizTitle, trophy: null, engraving: null, real: null, title: null, diploma: false, ...content },
    quizTitle,
    nickname: 'Оля 23a',
    awardedAt,
  };
}

/** Полиця: назви вікторин предметів у DOM-порядку, центральний і його підпис. */
async function shelf23a(page: Page): Promise<{ order: string[]; main: string; caption: string }> {
  const shelf = page.locator('section.shelf');
  await shelf.locator('.shelf-item').first().waitFor();
  const order = await shelf.locator('.shelf-item .shelf-quiz').allTextContents();
  const main = (await shelf.locator('.shelf-item.is-main .shelf-quiz').textContent())!;
  const caption = (await shelf.locator('.shelf-item.is-main .shelf-caption').textContent())!;
  return { order, main, caption };
}

async function bloodMoon23a() {
  const PASSWORD = 'correct horse battery';
  const K = 'Кубок Києва 23a';
  const M = 'Медаль Львова 23a';
  const S = 'Зірка Одеси 23a';
  const D = 'Диплом Полтави 23a';
  const R = 'Вареники 23a';
  const QUIZ = 'Дніпро 23a';
  const ACCENT = 'rgb(224, 37, 49)';

  // ── 1. Акаунти; нагороди й ачівки Олі — прямо в базу. ──
  const olya = await open('olya23a', 375, 812);
  const petro = await open('petro23a', 1280, 800);
  const taras = await open('taras23a', 1280, 800);
  for (const [page, nickname, email] of [
    [olya, 'Оля 23a', 'olya23a@example.com'],
    [petro, 'Петро 23a', 'petro23a@example.com'],
    [taras, 'Тарас 23a', 'taras23a@example.com'],
  ] as const) {
    await register(page, 'menu', nickname, email);
    const named = await page.request.put(`${base}/api/me/profile`, { data: { nickname, avatar: null } });
    expect(named.ok(), await named.text()).toBe(true);
  }
  const olyaId = await myId(olya);
  const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12));
  // K — найновіший трофей; D і R новіші за M і S, але без трофея, тож на автополицю не потрапляють.
  const awards = {
    K: award23a(olyaId, K, day(20), { trophy: { kind: 'cup', material: 'gold' }, engraving: 'Найкраща в Києві' }),
    M: award23a(olyaId, M, day(18), { trophy: { kind: 'medal', material: 'silver' } }),
    S: award23a(olyaId, S, day(16), { trophy: { kind: 'star', material: 'bronze' } }),
    D: award23a(olyaId, D, day(19), { diploma: true }),
    R: award23a(olyaId, R, day(21), { real: { text: R, photoUrl: null } }),
  };
  await db.insert(prizeAward).values(Object.values(awards));
  const ACHIEVED = ['first_game', 'host', 'sniper', 'games_10', 'fast_answer', 'night_owl'] as const;
  await db.insert(userAchievement).values(ACHIEVED.map((achievementId, index) => ({ userId: olyaId, achievementId, earnedAt: day(10 + index) })));

  // ── 2. Меню у всіх семи мовах на 320–1280 px; плитки профілю не обрізані на 320. ──
  await olya.goto(`${base}/profile`);
  await olya.locator('nav.profile-tiles').waitFor();
  expect(await menuLinks(olya)).toEqual(MENU_ITEMS_23A);
  for (const lang of LOCALES) {
    const saved = await olya.request.put(`${base}/api/me/locale`, { data: { locale: lang } });
    expect(saved.status()).toBe(200);
    await olya.setViewportSize({ width: 375, height: 812 });
    await olya.goto(`${base}/profile`);
    await expect.poll(() => htmlLang(olya), POLL).toBe(lang);
    await olya.locator('nav.profile-tiles a').nth(7).waitFor();
    for (const width of [320, 360, 375, 414, 701, 768, 1024, 1280]) await expectFiveItems(olya, width);
    await olya.setViewportSize({ width: 320, height: 812 });
    const clipped = await olya.locator('.profile-tiles a').evaluateAll((tiles) =>
      tiles.filter((tile) => tile.scrollWidth > tile.clientWidth).map((tile) => tile.textContent),
    );
    expect(clipped, `p23a-${lang}-320: clipped tiles`).toEqual([]);
    // Слово підпису не розривається посеред (як «Налаштуванн-я»): кожне слово — один рядок.
    const split = await olya.locator('.profile-tiles .tile-label').evaluateAll((labels) =>
      labels.flatMap((label) => {
        const node = label.firstChild;
        if (node === null) return [];
        return [...(node.textContent ?? '').matchAll(/\S+/g)].flatMap((match) => {
          const range = label.ownerDocument.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1 ? [match[0]] : [];
        });
      }),
    );
    expect(split, `p23a-${lang}-320: tile words split`).toEqual([]);
    expect(await noSideScroll(olya), `p23a-${lang}-320: horizontal scroll`).toBe(true);
    await shot(olya, `p23a-menu-${lang}-320`);
    if (lang === 'ar') {
      const [first, second] = await olya.locator('.profile-tiles a').evaluateAll((tiles) => tiles.slice(0, 2).map((tile) => tile.getBoundingClientRect().left));
      expect(first!, 'ar: the first tile is right of the second').toBeGreaterThan(second!);
      await olya.setViewportSize({ width: 375, height: 812 });
      await shot(olya, 'p23a-profile-ar');
    }
  }
  const back = await olya.request.put(`${base}/api/me/locale`, { data: { locale: 'uk' } });
  expect(back.status()).toBe(200);

  // ── 3. Шапка й плитки на 375. ──
  await olya.setViewportSize({ width: 375, height: 812 });
  await olya.goto(`${base}/profile`);
  await expect.poll(() => htmlLang(olya), POLL).toBe('uk');
  expect(await olya.evaluate('getComputedStyle(document.body).backgroundColor')).toBe('rgb(6, 5, 5)');
  await olya.getByRole('heading', { level: 1, name: 'Оля 23a', ...exact }).waitFor();
  await olya.locator('.profile-head .profile-pills').getByText(/^Рів\. \d+$/).waitFor();
  expect(await olya.locator('.headline-stats dd').count()).toBe(4);
  expect(await olya.locator('nav.profile-tiles a').count()).toBe(8);
  await olya.locator('nav.profile-tiles').getByRole('link', { name: 'Призи, 5', ...exact }).waitFor();
  await olya.locator('nav.profile-tiles').getByRole('link', { name: 'Досягнення, 6', ...exact }).waitFor();
  expect(await noSideScroll(olya)).toBe(true);
  await shot(olya, 'p23a-profile');

  // ── 4. Автополиця: три трофеї, найновіший кубок у центрі; без диплома й вареників. ──
  const auto = await shelf23a(olya);
  expect(auto.main).toBe(K);
  expect(auto.caption.toLowerCase()).toContain('кубок');
  expect(auto.order).toEqual([M, K, S]);
  await olya.locator('section.shelf .shelf-item.is-main').getByRole('button').click();
  const viewer = olya.getByRole('dialog', { name: /^Приз за \d місце$/ });
  await viewer.waitFor();
  await shot(olya, 'p23a-shelf');
  await viewer.getByRole('button', { name: 'Закрити', ...exact }).click();
  await viewer.waitFor({ state: 'detached' });

  // ── 5. Закріплення призів: D, M, K; четвертий (S) — повідомлення про ліміт. ──
  await openProfileTile(olya, 'Призи');
  expect(new URL(olya.url()).pathname).toBe('/profile/prizes');
  await olya.getByRole('heading', { level: 2, name: 'Нагороди', ...exact }).waitFor();
  const pinPrize = (quiz: string) => olya.getByRole('button', { name: new RegExp(`^📌 На вітрину: .* · ${quiz}$`) });
  const unpinPrize = (quiz: string) => olya.getByRole('button', { name: new RegExp(`^📌 Прибрати з вітрини: .* · ${quiz}$`) });
  for (const quiz of [D, M, K]) {
    await pinPrize(quiz).click();
    await unpinPrize(quiz).waitFor();
  }
  await pinPrize(S).click();
  await olya.locator('.pin-message').getByText('На вітрині вже 3 кубки — спершу прибери один.', exact).waitFor();
  // Стан каже лише підпис (без aria-pressed, задача 11): у S він лишився «На вітрину».
  expect(await pinPrize(S).count(), 'S stays unpinned').toBe(1);
  expect(await pinPrize(S).getAttribute('aria-pressed')).toBeNull();
  await shot(olya, 'p23a-pin-limit');
  await olya.getByRole('link', { name: 'Назад', ...exact }).click();
  await olya.waitForURL(`${base}/profile`);
  const pinned = await shelf23a(olya);
  expect(pinned.order).toEqual([M, D, K]);
  expect(pinned.main).toBe(D);
  expect(pinned.caption).toBe('Диплом');
  await shot(olya, 'p23a-pinned');

  // ── 6. Ачівки через стару адресу /achievements: п'ять закріплених, шоста — ліміт. ──
  await olya.goto(`${base}/achievements`);
  await olya.getByRole('heading', { level: 1, name: 'Досягнення', ...exact }).waitFor();
  await olya.getByRole('link', { name: 'Назад', ...exact }).waitFor();
  expect(await olya.locator(MENU).getByRole('link', { name: 'Профіль' }).getAttribute('aria-current')).toBe('page');
  const NAMES = { sniper: 'Снайперська точність', host: 'За пультом', first_game: 'Перша гра', games_10: '10 ігор', fast_answer: 'Швидкі пальці', night_owl: 'Нічна сова' };
  const PINNED = ['sniper', 'host', 'first_game', 'games_10', 'fast_answer'] as const;
  for (const id of PINNED) {
    await olya.getByRole('button', { name: `📌 На вітрину: ${NAMES[id]}`, ...exact }).click();
    await olya.getByRole('button', { name: `📌 Прибрати з вітрини: ${NAMES[id]}`, ...exact }).waitFor();
  }
  await olya.getByRole('button', { name: `📌 На вітрину: ${NAMES.night_owl}`, ...exact }).click();
  await olya.locator('.pin-message').getByText('На вітрині вже 5 ачівок — спершу прибери одну.', exact).waitFor();
  await olya.goto(`${base}/profile`);
  const squares = olya.locator('.achievement-showcase .achievement-square');
  await squares.first().waitFor();
  expect(await squares.evaluateAll((list) => list.map((square) => square.getAttribute('aria-label')))).toEqual(PINNED.map((id) => NAMES[id]));
  await squares.first().click();
  await olya.locator('.achievement-caption').getByText(NAMES.sniper, exact).waitFor();

  // ── 7. Видалена нагорода сходить з полиці; місце звільнилось — S закріплюється без повідомлення. ──
  expect(await deleteAward(db, awards.M.id)).not.toBeNull();
  await olya.reload();
  await expect.poll(async () => (await shelf23a(olya)).order, POLL).toEqual([D, K]);
  await shot(olya, 'p23a-shelf-two');
  await olya.goto(`${base}/profile/prizes`);
  await pinPrize(S).click();
  await unpinPrize(S).waitFor();
  expect((await olya.locator('.pin-message').textContent())?.trim() ?? '').toBe('');
  await olya.goto(`${base}/profile`);
  const own = await shelf23a(olya);
  expect(own.order).toEqual([K, D, S]);
  const ownNumbers = await olya.locator('.headline-stats dd').allTextContents();

  // ── 8. Петро бачить публічний профіль Олі: ті самі числа, полиця й ачівки, без плиток. ──
  await petro.goto(`${base}/profile/${olyaId}`);
  await petro.getByRole('heading', { level: 1, name: 'Оля 23a', ...exact }).waitFor();
  expect(await petro.locator('.headline-stats dd').allTextContents()).toEqual(ownNumbers);
  expect(await petro.locator('.profile-tiles').count()).toBe(0);
  expect(await shelf23a(petro)).toEqual(own);
  const publicSquares = petro.locator('.achievement-showcase .achievement-square');
  expect(await publicSquares.evaluateAll((list) => list.map((square) => square.getAttribute('aria-label')))).toEqual(PINNED.map((id) => NAMES[id]));
  await petro.getByRole('button', { name: 'Усі нагороди (4)', ...exact }).click();
  await expect.poll(() => petro.locator('.award-card').count(), POLL).toBe(4);
  expect(await noSideScroll(petro)).toBe(true);
  await shot(petro, 'p23a-public');

  // ── 9. Старі й нові адреси без сесії ведуть на вхід і назад. ──
  for (const [path, title] of [
    ['/friends', 'Друзі'],
    ['/profile/settings', 'Налаштування'],
  ] as const) {
    const visitor = await open(`visitor23a${path.replaceAll('/', '-')}`, 375, 812);
    await visitor.goto(`${base}${path}`);
    await visitor.waitForURL(`${base}/login?next=${encodeURIComponent(path)}`);
    await field(visitor, 'Email').fill('olya23a@example.com');
    await field(visitor, 'Пароль').fill(PASSWORD);
    await click(visitor, 'Увійти');
    await visitor.waitForURL(`${base}${path}`);
    await visitor.getByRole('heading', { level: 1, name: title, ...exact }).waitFor();
  }

  // ── 10. Гра: неправильна відповідь — ✗ у своєму тоні на телефоні, правильний варіант на сцені. ──
  const questions = [
    { ...boolQ, id: 'q1', text: 'Дніпро впадає в Чорне море?', correct: true },
    { ...boolQ, id: 'q2', text: 'Говерла вища за Монблан?', correct: false },
  ];
  const quiz = { ...makeRoundsQuiz([classicRound('r1', questions as never, { title: 'Річки й гори', speedBonus: false, shuffleOptions: false })]), title: QUIZ };
  const created = await taras.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(created.status()).toBe(201);
  await taras.goto(`${base}/quizzes`);
  await taras.locator('.quiz-list li', { hasText: QUIZ }).getByRole('button', { name: 'Грати', ...exact }).click();
  await taras.waitForURL(/\/host\/\d{6}$/);
  const code = taras.url().slice(-6);
  const stageHref = await taras.locator('a[href*="/stage/"]').first().getAttribute('href');
  const stage = await open('stage23a', 1280, 800);
  await stage.goto(new URL(stageHref!, base).href);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  await join(olya, code, 'Оля 23a', false);

  await click(taras, 'Почати гру');
  await click(taras, 'Почати раунд');
  await olya.getByRole('heading', { name: questions[0]!.text, ...exact }).waitFor();
  await stage.getByRole('heading', { name: questions[0]!.text, ...exact }).waitFor();
  await click(olya, 'Ні');
  await click(taras, 'Показати відповідь');
  const wrong = olya.locator('.result.is-wrong');
  await wrong.locator('h2').waitFor();
  const tone = await wrong.evaluate((section) => {
    const { getComputedStyle: style } = globalThis as unknown as Css23a;
    const h2 = section.querySelector('h2')!;
    return { mark: style(h2, '::before').content!, border: style(section).borderColor!, color: style(h2).color! };
  });
  expect(tone.mark).toContain('✗');
  expect(tone.border, 'the wrong frame is not the accent red').not.toBe(ACCENT);
  expect(tone.color, 'the wrong text is not the accent red').not.toBe(ACCENT);
  // Так/ні на сцені — рядок «Правильна відповідь» у тоні --correct (варіантів-карток там немає).
  await stage.locator('.answer', { hasText: 'Правильна відповідь: Так' }).waitFor();
  for (const page of [olya, stage, taras]) expect(await page.locator('.game-bg').count()).toBeGreaterThan(0);
  expect(await noSideScroll(olya)).toBe(true);
  // Кадри — після розкриття й мигання вердикту (3 с): інакше на знімку напівпрозорий вердикт.
  for (const page of [olya, stage, taras]) await page.waitForFunction(VERDICT_SETTLED_23A, undefined, { timeout: 6000 });
  await shot(olya, 'p23a-phone-wrong');
  await shot(stage, 'p23a-stage');
  await shot(taras, 'p23a-host');

  await click(taras, 'Далі');
  const nextQuestion = taras.getByRole('button', { name: 'Наступне запитання', ...exact });
  const second = olya.getByRole('heading', { name: questions[1]!.text, ...exact });
  await Promise.race([nextQuestion.waitFor(), second.waitFor()]);
  if (await nextQuestion.isVisible()) await nextQuestion.click();
  await second.waitFor();
  await click(olya, 'Ні');
  await click(taras, 'Показати відповідь');
  await olya.locator('.result.is-correct').waitFor();
  await shot(olya, 'p23a-phone-right');
  await click(taras, 'Далі');
  await olya.getByText('Гру завершено').first().waitFor();
  // Інші сторінки в новій темі (лише кадри для огляду): вікторини, редактор, історія.
  const quizId = ((await created.json()) as { id: string }).id;
  for (const [path, name] of [
    ['/quizzes', 'p23a-quizzes'],
    [`/quizzes/${quizId}`, 'p23a-editor'],
    ['/history', 'p23a-history'],
  ] as const) {
    await taras.goto(`${base}${path}`);
    await taras.locator('main h1, main h2').first().waitFor();
    expect(await noSideScroll(taras), `${name}: horizontal scroll`).toBe(true);
    await shot(taras, name);
  }

  // ── 11. Менше руху: місяць і ворони стоять; без емуляції ворони летять. ──
  await olya.emulateMedia({ reducedMotion: 'reduce' });
  await olya.goto(`${base}/profile`);
  const crows = olya.locator('.profile-hero .crows');
  await crows.waitFor();
  expect(await crows.evaluate((el) => (globalThis as unknown as Css23a).getComputedStyle(el).animationName)).toBe('none');
  // Ворони не торкаються ніка на вузьких телефонах: низ найнижчого силуету вище верху тексту ніка (дрейф на телефоні — лише вбік).
  for (const width of [320, 360, 375]) {
    await olya.setViewportSize({ width, height: 812 });
    const gap = (await olya.evaluate(`(() => {
      const nick = document.createRange();
      nick.selectNodeContents(document.querySelector('.profile-hero h1'));
      const text = nick.getBoundingClientRect();
      const birds = [...document.querySelectorAll('.profile-hero .crows .crow')].map((crow) => crow.getBoundingClientRect());
      const bottom = Math.max(...birds.map((box) => box.bottom));
      const apart = birds.every((box) => box.bottom <= text.top || box.left >= text.right || box.right <= text.left);
      return { apart, gap: text.top - bottom };
    })()`)) as { apart: boolean; gap: number };
    expect(gap.apart, `crows touch the nick at ${width}px (gap ${gap.gap})`).toBe(true);
    expect(gap.gap, `crows sit above the nick at ${width}px`).toBeGreaterThanOrEqual(4);
  }
  await shot(olya, 'p23a-crows-375');
  await olya.emulateMedia({ reducedMotion: 'no-preference' });
  await olya.reload();
  await crows.waitFor();
  expect(await crows.evaluate((el) => (globalThis as unknown as Css23a).getComputedStyle(el).animationName)).not.toBe('none');

  expect(problems).toEqual([]);
}

it('part 23a: blood moon — five menu items fit 320–1280 px in all seven languages, the profile is a header with four numbers and eight tiles, the auto shelf puts the newest cup in the middle, Оля pins three prizes and five achievements with a clear limit message, a deleted award leaves the shelf, Петро sees her pinned shelf on the public profile, old addresses open the new sub-pages, a wrong answer shows ✗ in its own tone on the phone and the stage, and motifs stay still under reduced motion', async () => {
  try {
    await bloodMoon23a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

it('part 24a: start menu — a signed-in player sees seven tiles on «/» that fit 320 and 1280 px in Ukrainian and Arabic without side scroll, «Створити гру» → «Почати гру» opens the host room, «Доєднатись до гри» with the code brings Оля to the lobby, and a guest on «/» still gets the code form', async () => {
  try {
    await startMenu24a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function startMenu24a() {
  const START = 'nav.start-menu';
  const TILES = ['Створити гру', 'Доєднатись до гри', 'Друзі', 'Стрічка', 'Мої вікторини', 'Історія', 'Профіль'];
  const host = await open('host24a', 1280, 800);
  const olya = await open('olya24a', 375, 812);
  await register(host, 'menu', 'Ведуча 24a', 'host24a@example.com');
  await register(olya, 'menu', 'Оля 24a', 'olya24a@example.com');

  // ── 1. Сім плиток у порядку; 320 і 1280 px у uk та ar без бокового скролу; ar — дзеркально. ──
  for (const lang of ['uk', 'ar'] as const) {
    expect((await olya.request.put(`${base}/api/me/locale`, { data: { locale: lang } })).status()).toBe(200);
    for (const width of [320, 375, 1280]) {
      await olya.setViewportSize({ width, height: 812 });
      await olya.goto(base);
      await expect.poll(() => htmlLang(olya), POLL).toBe(lang);
      await olya.locator(`${START} > *`).nth(6).waitFor();
      expect(await olya.locator(`${START} > *`).count()).toBe(7);
      if (lang === 'uk') expect(await olya.locator(`${START} .start-label`).allTextContents()).toEqual(TILES);
      expect(await noSideScroll(olya), `p24a-${lang}-${width}: horizontal scroll`).toBe(true);
      const clipped = await olya.locator(`${START} > *`).evaluateAll((tiles) => tiles.filter((tile) => tile.scrollWidth > tile.clientWidth).map((tile) => tile.textContent));
      expect(clipped, `p24a-${lang}-${width}: clipped tiles`).toEqual([]);
      const boxes = await olya.locator(`${START} > *`).evaluateAll((tiles) => tiles.map((tile) => tile.getBoundingClientRect()).map((r) => ({ left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width) })));
      const columns = new Set(boxes.slice(0, 4).map((box) => box.top)).size === 1 ? 4 : 2;
      expect(columns, `p24a-${lang}-${width}: columns`).toBe(width > 700 ? 4 : 2);
      // На телефоні сьома плитка — на всю ширину сітки.
      if (width <= 700) expect(boxes[6]!.width).toBeGreaterThan(boxes[0]!.width * 1.8);
      if (lang === 'ar') expect(boxes[0]!.left, `p24a-ar-${width}: the first tile is right of the second`).toBeGreaterThan(boxes[1]!.left);
      await shot(olya, `p24a-start-${lang}-${width}`);
    }
  }
  expect((await olya.request.put(`${base}/api/me/locale`, { data: { locale: 'uk' } })).status()).toBe(200);

  // ── 2. «Створити гру» → «Почати гру» відкриває кімнату ведучого. ──
  const saved = await host.request.post(`${base}/api/quizzes`, { data: { ...makeQuiz([single], { speedBonus: false }), title: 'Старт 24a' } });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(base);
  await host.locator(START).getByRole('link', { name: 'Створити гру', ...exact }).click();
  await host.waitForURL(`${base}/create`);
  await host.getByRole('heading', { level: 1, name: 'Створити гру', ...exact }).waitFor();
  await host.getByRole('heading', { level: 2, name: 'Старт 24a', ...exact }).waitFor();
  await shot(host, 'p24a-create');
  await click(host, 'Почати гру');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);

  // ── 3. «Доєднатись до гри» з кодом — у лобі. ──
  await olya.setViewportSize({ width: 375, height: 812 });
  await olya.goto(base);
  await expect.poll(() => htmlLang(olya), POLL).toBe('uk');
  const joinTile = olya.getByRole('button', { name: 'Доєднатись до гри', ...exact });
  await joinTile.waitFor();
  expect(await field(olya, 'Код гри').count()).toBe(0);
  await joinTile.click();
  expect(await joinTile.getAttribute('aria-expanded')).toBe('true');
  await field(olya, 'Код гри').fill(code);
  await shot(olya, 'p24a-join-open');
  await click(olya, 'Увійти');
  await olya.waitForURL(`${base}/play/${code}`);
  const nick = field(olya, 'Ваше ім’я');
  await nick.waitFor();
  if ((await nick.inputValue()) === '') await nick.fill('Оля 24a');
  await click(olya, 'Увійти в гру');
  await olya.getByText('Ви в грі. Чекаємо на старт.').waitFor();
  await host.getByText('Оля 24a').first().waitFor();

  // ── 4. Гість на «/» бачить форму коду й «Я ведучий», без стартового меню. ──
  const guest = await open('guest24a', 320, 700);
  await guest.goto(base);
  await field(guest, 'Код гри').waitFor();
  await guest.getByRole('link', { name: 'Я ведучий' }).waitFor();
  expect(await guest.locator(START).count()).toBe(0);
  expect(await noSideScroll(guest)).toBe(true);
}

it('part 24b: liked quizzes — Оля sees the quizzes she liked newest first with the author link and her liked question texts, a deleted quiz stays as «Вікторину видалено», the author sees «Сподобались іншим» with totals, people and top questions that open the editor, Петро gets the empty hints, the tabs work from the keyboard, 320 px in uk and ar has no side scroll, and the public profile shows no lists', async () => {
  try {
    await likedQuizzes24b();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function likedQuizzes24b() {
  const MINE = 'Мені сподобались';
  const OTHERS = 'Сподобались іншим';
  const author = await open('author24b', 1280, 800);
  const olya = await open('olya24b', 375, 812);
  const petro = await open('petro24b', 375, 812);
  await register(author, 'menu', 'Авторка 24b', 'author24b@example.com');
  await register(olya, 'menu', 'Оля 24b', 'olya24b@example.com');
  await register(petro, 'menu', 'Петро 24b', 'petro24b@example.com');
  const [authorId, olyaId, petroId] = [await myId(author), await myId(olya), await myId(petro)];

  // ── 1. Три вікторини авторки. ──
  const q = (id: string, text: string) => ({ ...single, id, text });
  const create = async (title: string, questions: ReturnType<typeof q>[]) => {
    const saved = await author.request.post(`${base}/api/quizzes`, { data: { ...makeQuiz(questions, { speedBonus: false }), title } });
    expect(saved.ok(), await saved.text()).toBe(true);
    return ((await saved.json()) as { id: string }).id;
  };
  const forest = await create('Ліси Карпат 24b', [q('k1', 'Яка гора найвища в Карпатах?'), q('k2', 'Який звір живе в карпатських лісах?'), q('k3', 'Скільки ярусів має бук?')]);
  const rivers = await create('Річки 24b', [q('r1', 'Яка річка тече через Ужгород?'), q('r2', 'Куди впадає Черемош?')]);
  const temp = await create('Тимчасова 24b', [q('t1', 'Питання тимчасової вікторини?')]);

  // ── 2. Вподобання прямою вставкою, з різницею в хвилину; потім видалення «Тимчасової». ──
  const start = Date.now() - 3_600_000;
  let step = 0;
  const like = async (userId: string, kind: 'quiz' | 'question', quizId: string, questionId: string | null) => {
    await db.insert(userLike).values({ userId, kind, targetUserId: authorId, quizId, questionId, gameId: randomUUID(), hidden: false, createdAt: new Date(start + 60_000 * step++) });
  };
  await like(olyaId, 'quiz', temp, null);
  await like(olyaId, 'question', rivers, 'r1');
  await like(olyaId, 'question', forest, 'k1');
  await like(olyaId, 'question', forest, 'k2');
  await like(olyaId, 'quiz', forest, null);
  await like(petroId, 'question', forest, 'k1');
  expect((await author.request.delete(`${base}/api/quizzes/${temp}`)).ok()).toBe(true);

  const tab = (page: Page, name: string) => page.getByRole('tab', { name, ...exact });
  const titles = (page: Page, panel: string) => page.locator(`#liked-panel-${panel} .liked-title`).allTextContents();

  // ── 3. Оля: «Мені сподобались». ──
  await olya.goto(`${base}/profile/likes`);
  await tab(olya, MINE).waitFor();
  expect(await tab(olya, MINE).getAttribute('aria-selected')).toBe('true');
  await olya.locator('#liked-panel-mine li.liked-row').nth(2).waitFor();
  expect(await titles(olya, 'mine')).toEqual(['Ліси Карпат 24b', 'Річки 24b', 'Вікторину видалено']);
  const first = olya.locator('#liked-panel-mine li.liked-row').nth(0);
  expect(await first.locator('.liked-count [aria-hidden="true"]').textContent()).toBe('❤️ 3');
  await first.locator('a.liked-author').click();
  await olya.waitForURL(`${base}/profile/${authorId}`);
  await olya.goBack();
  await tab(olya, MINE).waitFor();
  const first2 = olya.locator('#liked-panel-mine li.liked-row').nth(0);
  await first2.getByRole('button', { name: 'Запитання', ...exact }).click();
  await first2.getByText('Яка гора найвища в Карпатах?').waitFor();
  await first2.getByText('Який звір живе в карпатських лісах?').waitFor();
  expect(await first2.getByText('Скільки ярусів має бук?').count()).toBe(0);
  await first2.getByText('уся вікторина', exact).waitFor();
  expect(await olya.locator('#liked-panel-mine li.liked-row').nth(2).getByRole('button', { name: 'Запитання', ...exact }).count()).toBe(0);
  await shot(olya, 'p24b-mine');

  // ── 4. Клавіатура: ArrowRight на другу вкладку; у Олі порожньо. ──
  await tab(olya, MINE).focus();
  await olya.keyboard.press('ArrowRight');
  await expect.poll(() => tab(olya, OTHERS).getAttribute('aria-selected'), POLL).toBe('true');
  expect(await olya.evaluate('document.activeElement?.id')).toBe('liked-tab-others');
  await olya.locator('#liked-panel-others p.liked-empty').waitFor();
  expect((await olya.locator('#liked-panel-others p.liked-empty').textContent())!.trim()).toBe(ukMessages.likedOthersEmpty);

  // ── 5. Авторка: «Сподобались іншим». ──
  await author.goto(`${base}/profile/likes`);
  await tab(author, OTHERS).click();
  await author.locator('#liked-panel-others li.liked-row').nth(1).waitFor();
  expect(await titles(author, 'others')).toEqual(['Ліси Карпат 24b', 'Річки 24b']);
  const top = author.locator('#liked-panel-others li.liked-row').nth(0);
  expect(await top.locator('.liked-meta [aria-hidden="true"]').first().textContent()).toBe('❤️ 4');
  await top.getByText('2 людини', exact).waitFor();
  const topFirst = top.locator('ol.liked-top li').first();
  expect(await topFirst.textContent()).toContain('Яка гора найвища в Карпатах?');
  expect(await topFirst.locator('[aria-hidden="true"]').textContent()).toBe('❤️ 2');
  await shot(author, 'p24b-others');
  await top.locator('.liked-title a').click();
  await author.waitForURL(new RegExp(`/quizzes/${forest}$`));

  // ── 6. Порожні стани і Петро. ──
  await author.goto(`${base}/profile/likes`);
  await author.locator('#liked-panel-mine p.liked-empty').waitFor();
  expect((await author.locator('#liked-panel-mine p.liked-empty').textContent())!.trim()).toBe(ukMessages.likedMineEmpty);
  await petro.goto(`${base}/profile/likes`);
  await petro.locator('#liked-panel-mine li.liked-row').first().waitFor();
  expect(await titles(petro, 'mine')).toEqual(['Ліси Карпат 24b']);
  expect(await petro.locator('#liked-panel-mine li.liked-row .liked-count [aria-hidden="true"]').textContent()).toBe('❤️ 1');
  await tab(petro, OTHERS).click();
  await petro.locator('#liked-panel-others p.liked-empty').waitFor();
  expect((await petro.locator('#liked-panel-others p.liked-empty').textContent())!.trim()).toBe(ukMessages.likedOthersEmpty);

  // ── 7. Розкладка: uk і ar, 320 і 375 px, розгорнутий перший рядок, обидві вкладки. ──
  for (const lang of ['uk', 'ar'] as const) {
    expect((await olya.request.put(`${base}/api/me/locale`, { data: { locale: lang } })).status()).toBe(200);
    for (const width of [320, 375]) {
      await olya.setViewportSize({ width, height: 812 });
      await olya.goto(`${base}/profile/likes`);
      await expect.poll(() => htmlLang(olya), POLL).toBe(lang);
      await olya.locator('#liked-panel-mine li.liked-row').nth(2).waitFor();
      await olya.locator('#liked-panel-mine li.liked-row').nth(0).locator('button.liked-toggle').click();
      expect(await olya.locator('#liked-panel-mine li.liked-row').nth(0).locator('ul.liked-questions li').count()).toBe(3);
      if (lang === 'ar') {
        expect(await olya.evaluate('document.documentElement.dir')).toBe('rtl');
        const box = await olya.locator('#liked-panel-mine li.liked-row').nth(0).locator('a.liked-author').boundingBox();
        expect(box!.x + box!.width / 2, 'p24b-ar: author link sits on the right half').toBeGreaterThan(width / 2);
      }
      await expectNoSideScroll(olya, `p24b-mine-${lang}-${width}`);
      await olya.locator('#liked-tab-others').click();
      await olya.locator('#liked-panel-others p.liked-empty').waitFor();
      await expectNoSideScroll(olya, `p24b-others-${lang}-${width}`);
    }
  }
  // Авторка: «Сподобались іншим» в ar на 320 px.
  expect((await author.request.put(`${base}/api/me/locale`, { data: { locale: 'ar' } })).status()).toBe(200);
  await author.setViewportSize({ width: 320, height: 812 });
  await author.goto(`${base}/profile/likes`);
  await expect.poll(() => htmlLang(author), POLL).toBe('ar');
  await author.locator('#liked-tab-others').click();
  await author.locator('#liked-panel-others li.liked-row').nth(1).waitFor();
  await expectNoSideScroll(author, 'p24b-others-ar-author-320');
  expect((await author.request.put(`${base}/api/me/locale`, { data: { locale: 'uk' } })).status()).toBe(200);
  expect((await olya.request.put(`${base}/api/me/locale`, { data: { locale: 'uk' } })).status()).toBe(200);

  // ── 8. Публічний профіль не має списків. ──
  await olya.setViewportSize({ width: 375, height: 812 });
  await olya.goto(`${base}/profile/${authorId}`);
  await expect.poll(() => htmlLang(olya), POLL).toBe('uk');
  await olya.locator('section.likes-card').waitFor();
  expect(await olya.locator('section.liked-quizzes').count()).toBe(0);
}

it('part 24c: lobby list — the host keeps «Лише друзі» by default, Оля sees the lobby under the code field with the host, player count and «друзі тут», a guest sees it only after «Усі», a password shows 🔒 and is asked on tap and by code, a wrong one is refused and the sixth try is limited, an invited friend and a rejoining player skip it, «Прихована» hides the row while the code still works, the password never reaches players, and 375/320 px in uk and ar has no side scroll', async () => {
  try {
    await lobbyList24c();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function lobbyList24c() {
  const TITLE = 'Лобі 24c';
  const SECRET = 'сова42';
  const EMPTY = 'Зараз немає відкритих ігор — введи код або створи свою';
  const host = await open('host24c', 1280, 900);
  const olya = await open('olya24c', 375, 812);
  const petro = await open('petro24c', 375, 812);
  await register(host, 'menu', 'Галина 24c', 'host24c@example.com');
  await register(olya, 'menu', 'Оля 24c', 'olya24c@example.com');
  await register(petro, 'menu', 'Петро 24c', 'petro24c@example.com');
  const [olyaId, petroId] = [await myId(olya), await myId(petro)];
  // ── 1. Галина підписана на Олю, Оля — на Петра. ──
  expect((await host.request.put(`${base}/api/me/friends/${olyaId}`)).ok()).toBe(true);
  expect((await olya.request.put(`${base}/api/me/friends/${petroId}`)).ok()).toBe(true);
  const olyaFrames = socketFrames(olya);
  const guest = await open('guest24c', 375, 812);
  const guestFrames = socketFrames(guest);

  // ── 2. Галина створює гру з «Мої вікторини»; у лобі «Хто бачить гру» з «Лише друзі». ──
  const saved = await host.request.post(`${base}/api/quizzes`, { data: { ...makeQuiz([single], { speedBonus: false }), title: TITLE } });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const access = host.locator('.lobby-access');
  await access.waitFor();
  await access.getByText('Хто бачить гру', exact).first().waitFor();
  await expect.poll(() => access.getByRole('radio', { name: 'Лише друзі', ...exact }).isChecked(), POLL).toBe(true);
  await shot(host, 'part24c-host-lobby-desktop');
  await host.setViewportSize({ width: 375, height: 812 });
  expect(await noSideScroll(host), 'host lobby panel 375: horizontal scroll').toBe(true);
  await shot(host, 'part24c-host-lobby-phone');
  await host.setViewportSize({ width: 1280, height: 900 });

  // Петро входить за кодом.
  await join(petro, code, 'Петро 24c', false);

  // ── 3. Оля бачить рядок; гість — порожній список. ──
  const listOf = async (page: Page, lang = 'uk') => {
    await page.goto(base);
    await expect.poll(() => htmlLang(page), POLL).toBe(lang);
    if (lang === 'uk') await (await homeCodeField(page)).waitFor();
    else await page.locator('nav.start-menu > *').nth(1).click();
    await page.locator('section.lobby-list').waitFor();
    return page.locator('section.lobby-list');
  };
  const rowOf = (page: Page) => page.locator('section.lobby-list a.lobby-row', { hasText: TITLE });
  await listOf(olya);
  const row = rowOf(olya);
  await row.waitFor();
  const text = (await row.textContent())!;
  expect(text).toContain('Галина');
  expect(text).toContain('гравців: 1 з 50');
  expect(text).toContain('друзі тут: Петро');
  expect(await row.getByRole('button', { name: 'Увійти', ...exact }).count()).toBe(0);
  await shot(olya, 'part24c-list-olya-375-uk');
  expect(await olya.locator('input[type="password"]').count()).toBe(0);

  const guestList = await listOf(guest);
  await guestList.getByText(EMPTY, exact).waitFor();
  expect(await rowOf(guest).count()).toBe(0);

  // ── 4. «Усі» — у гостя рядок з'являється без перезавантаження. ──
  await access.getByRole('radio', { name: 'Усі', ...exact }).click();
  await expect.poll(() => access.getByRole('radio', { name: 'Усі', ...exact }).isChecked(), POLL).toBe(true);
  await expect.poll(() => rowOf(guest).count(), { timeout: 12_000 }).toBe(1);

  // ── 5. Пароль: 🔒 у гостя, поле при дотику, хибний — відмова, правильний — у грі. ──
  await access.getByLabel('Пароль гри (необов’язково)', exact).fill(SECRET);
  await click(host, 'Зберегти пароль');
  await expect.poll(() => rowOf(guest).getByRole('img', { name: 'з паролем', ...exact }).count(), { timeout: 12_000 }).toBe(1);
  await rowOf(guest).click();
  await guest.waitForURL(`${base}/play/${code}`);
  const password = field(guest, 'Пароль гри');
  await password.waitFor();
  await field(guest, 'Ваше ім’я').fill('Гість 24c');
  await password.fill('хибний');
  await click(guest, 'Увійти в гру');
  await guest.getByText('Неправильний пароль. Перевір і спробуй ще').waitFor();
  await shot(guest, 'part24c-password-wrong-375-uk');
  await password.fill(SECRET);
  await click(guest, 'Увійти в гру');
  await guest.getByText('Ви в грі. Чекаємо на старт.').waitFor();

  // ── 6. Шоста хибна спроба з іншого пристрою — 429 password_limited. ──
  let last = { status: 0, error: '' };
  for (let i = 0; i < 6; i++) {
    const res = await guest.request.post(`${base}/api/games/by-code/${code}/join`, { data: { nickname: 'Підбирач', password: 'x', device: 'brute-24c' } });
    last = { status: res.status(), error: ((await res.json()) as { error: string }).error };
    if (i < 5) expect(last, `try ${i + 1}`).toEqual({ status: 403, error: 'password_wrong' });
  }
  expect(last).toEqual({ status: 429, error: 'password_limited' });

  // ── 7. Запрошена Оля входить дотиком без пароля; повторний вхід того, хто вже в кімнаті, — теж. ──
  await click(host, 'Запросити друзів');
  const invite = host.locator('.invite-friends li', { hasText: 'Оля' });
  await invite.getByRole('button', { name: 'Запросити', ...exact }).click();
  await invite.getByRole('button', { name: 'Запрошено', ...exact }).waitFor();
  await listOf(olya);
  await rowOf(olya).getByRole('img', { name: 'з паролем', ...exact }).waitFor();
  await rowOf(olya).click();
  await olya.waitForURL(`${base}/play/${code}`);
  expect(await olya.locator('input[type="password"]').count()).toBe(0);
  const nick = field(olya, 'Ваше ім’я');
  await nick.waitFor();
  if ((await nick.inputValue()) === '') await nick.fill('Оля 24c');
  await click(olya, 'Увійти в гру');
  await olya.getByText('Ви в грі. Чекаємо на старт.').waitFor();
  await expect.poll(() => host.getByRole('button', { name: /Вилучити/ }).count(), POLL).toBe(3);
  const again = await olya.request.post(`${base}/api/games/by-code/${code}/join`, { data: { nickname: 'Оля 24c', device: 'olya-dev' } });
  expect([403, 429], `rejoin: ${again.status()}`).not.toContain(again.status());

  // ── 8. Розкладка списку: uk і ar, 375 і 320. ──
  for (const lang of ['uk', 'ar'] as const) {
    expect((await olya.request.put(`${base}/api/me/locale`, { data: { locale: lang } })).status()).toBe(200);
    for (const width of [375, 320]) {
      await olya.setViewportSize({ width, height: 812 });
      await listOf(olya, lang);
      await olya.locator('section.lobby-list a.lobby-row').first().waitFor();
      if (lang === 'ar') expect(await olya.evaluate('document.documentElement.dir')).toBe('rtl');
      const clipped = await olya.locator('section.lobby-list a.lobby-row').evaluateAll((rows) => rows.filter((r) => r.scrollWidth > r.clientWidth).map((r) => r.textContent));
      expect(clipped, `p24c-${lang}-${width}: clipped rows`).toEqual([]);
      await expectNoSideScroll(olya, `part24c-list-olya-${width}-${lang}`);
    }
  }
  expect((await olya.request.put(`${base}/api/me/locale`, { data: { locale: 'uk' } })).status()).toBe(200);
  // Форма пароля гостя на 320 px у uk й ar.
  for (const [lang, locale] of [['uk', 'uk-UA'], ['ar', 'ar-EG']] as const) {
    const visitor = await open(`visitor24c-${lang}`, 320, 700, { locale });
    await visitor.goto(`${base}/play/${code}`);
    await expect.poll(() => htmlLang(visitor), POLL).toBe(lang);
    await visitor.locator('input[type="password"]').waitFor();
    await expectNoSideScroll(visitor, `part24c-password-guest-320-${lang}`);
  }

  // ── 9. «Прихована»: рядок зникає, а код працює. ──
  await access.getByRole('radio', { name: 'Прихована (лише за кодом)', ...exact }).click();
  await expect.poll(() => access.getByRole('radio', { name: 'Прихована (лише за кодом)', ...exact }).isChecked(), POLL).toBe(true);
  await listOf(olya);
  await olya.locator('section.lobby-list').getByText(EMPTY, exact).waitFor();
  await listOf(guest);
  await guest.locator('section.lobby-list').getByText(EMPTY, exact).waitFor();
  expect(await rowOf(guest).count()).toBe(0);
  const late = await open('late24c', 375, 812);
  await late.goto(base);
  await (await homeCodeField(late)).fill(code);
  await click(late, 'Увійти');
  await late.waitForURL(`${base}/play/${code}`);
  await field(late, 'Пароль гри').waitFor();
  await field(late, 'Ваше ім’я').fill('Пізній 24c');
  await field(late, 'Пароль гри').fill(SECRET);
  await click(late, 'Увійти в гру');
  await late.getByText('Ви в грі. Чекаємо на старт.').waitFor();

  // ── 10. Пароль не виходить до гравців: кадри сокетів, список і відповідь за кодом. ──
  const bodies = [
    await (await guest.request.get(`${base}/api/lobbies`)).text(),
    await (await olya.request.get(`${base}/api/lobbies`)).text(),
    await (await guest.request.get(`${base}/api/games/by-code/${code}`)).text(),
    await (await olya.request.get(`${base}/api/games/by-code/${code}`)).text(),
  ];
  for (const body of [...bodies, ...olyaFrames, ...guestFrames]) expect(body.includes(SECRET)).toBe(false);
  expect(olyaFrames.length).toBeGreaterThan(0);
  expect(guestFrames.length).toBeGreaterThan(0);
}

it('part 24d: profile looks — Оля at level 17 picks the «Вогонь» photo frame, the «Піксельний» font, «Отрута» and 🌻 on «Вигляд» with a live preview, a level-30 frame stays locked and the server refuses it, her profile header and public profile show the frame and font, the font reaches the host lobby and her phone with an ellipsis, a fresh page loads no nick font, and 375/320 px in uk and ar has no side scroll', async () => {
  try {
    await profileLooks24d();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function profileLooks24d() {
  const LONG = 'Олександра-Вікторія 24d з дуже довгим ніком';
  const host = await open('host24d', 1280, 800);
  const olya = await open('olya24d', 375, 812);
  const petro = await open('petro24d', 375, 812);
  await register(host, 'menu', 'Галина 24d', 'host24d@example.com');
  await register(olya, 'menu', 'Оля 24d', 'olya24d@example.com');
  await register(petro, 'menu', 'Петро 24d', 'petro24d@example.com');
  const [olyaId, petroId] = [await myId(olya), await myId(petro)];
  void petroId;
  const pour = (userId: string, amount: number) => {
    const at = new Date(Date.now() - 24 * 3600 * 1000);
    return db.insert(xpEntry).values({ userId, source: 'game', gameId: randomUUID(), amount, counted: false, day: kyivDay(at), at, createdAt: at });
  };
  await pour(olyaId, xpForLevel(17));
  const lookTile = (page: Page, text: string) => page.locator('[role="radiogroup"]:not([data-slot="frame"]) label.look-option', { hasText: text });

  // ── 2. Свіжа сторінка не вантажить жодного шрифту ніку. ──
  await petro.goto(base);
  await petro.waitForLoadState('load');
  const fontFiles = (await petro.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name))) as string[];
  expect(fontFiles.filter((name) => /caveat|comfortaa|fira-code|oswald|amatic|pixelify|cormorant|dela-gothic/i.test(name)), 'fresh page font files').toEqual([]);

  // ── 3. «Вигляд»: закрите лишається закритим, вибір із живим переглядом, збереження. ──
  await olya.goto(`${base}/profile/looks`);
  await olya.locator('section.level-card').waitFor();
  const aura = lookTile(olya, 'Сяйво');
  await aura.waitFor();
  expect(await aura.locator('input').isDisabled()).toBe(true);
  expect(await aura.textContent()).toContain('з рівня 30');
  await lookTile(olya, 'Вогонь').click();
  await lookTile(olya, 'Піксельний').click();
  await lookTile(olya, 'Отрута').click();
  await lookTile(olya, '🌻').click();
  const preview = olya.getByTestId('look-preview');
  await preview.locator('.photo-frame-fire').waitFor();
  await preview.locator('.nick-font-pixel').waitFor();
  expect(await preview.textContent()).toContain('🌻');
  await shot(olya, 'p24d-looks-picked-375');
  const [saved] = await Promise.all([olya.waitForResponse((r) => r.url().endsWith('/api/me/looks') && r.request().method() === 'PUT'), click(olya, 'Зберегти вигляд')]);
  expect(saved.status()).toBe(200);
  await olya.reload();
  await olya.locator('section.level-card').waitFor();
  expect(await lookTile(olya, 'Вогонь').locator('input').isChecked()).toBe(true);
  expect(await lookTile(olya, 'Піксельний').locator('input').isChecked()).toBe(true);
  expect(await lookTile(olya, 'Отрута').locator('input').isChecked()).toBe(true);
  expect(await lookTile(olya, '🌻').locator('input').isChecked()).toBe(true);

  // ── 4. Сервер не пускає закритого. ──
  const refused = await olya.request.put(`${base}/api/me/looks`, { data: { color: 'venom', frame: null, badge: '🌻', photo: 'aura', font: 'pixel' } });
  expect(refused.status()).toBe(409);

  // ── 5. Шапка власного й публічного профілю. ──
  await olya.goto(`${base}/profile`);
  await olya.locator('.profile-head .photo-frame-fire').waitFor();
  const title = olya.locator('.profile-head h1 .nick-font-pixel').first();
  await title.waitFor();
  expect(await title.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Pixelify Sans');
  await expect.poll(() => olya.evaluate(() => document.fonts.check('16px "Pixelify Sans Variable"')), POLL).toBe(true);
  await shot(olya, 'p24d-header-own-375');
  await petro.goto(`${base}/profile/${olyaId}`);
  await petro.locator('.profile-head .photo-frame-fire').waitFor();
  const publicTitle = petro.locator('.profile-head h1 .nick-font-pixel').first();
  await publicTitle.waitFor();
  expect(await publicTitle.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Pixelify Sans');
  await expect.poll(() => petro.evaluate(() => document.fonts.check('16px "Pixelify Sans Variable"')), POLL).toBe(true);
  await shot(petro, 'p24d-header-public-375');

  // ── 6. Шрифт у грі: пульт ведучої й телефон Олі, довгий нік обрізано «…». ──
  const quiz24d = await host.request.post(`${base}/api/quizzes`, { data: { ...makeQuiz([single], { speedBonus: false }), title: 'Вікторина 24d' } });
  expect(quiz24d.ok(), await quiz24d.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  await olya.setViewportSize({ width: 320, height: 640 });
  await join(olya, code, LONG, false);
  for (const [who, page] of [['host', host], ['olya', olya]] as const) {
    const nameEl = page.locator('.nick-name.nick-font-pixel', { hasText: 'Олександра' }).first();
    await nameEl.waitFor();
    // Нік у грі обмежений 18 знаками, тож на цих екранах він ще вміщається; перевіряємо правило обрізання і що рядок не виходить із батька.
    const style = await nameEl.evaluate((el) => ({ overflow: getComputedStyle(el).textOverflow, white: getComputedStyle(el).whiteSpace, fits: el.scrollWidth <= (el.parentElement?.clientWidth ?? 0) }));
    expect(style, `${who}: nick-name rule`).toEqual({ overflow: 'ellipsis', white: 'nowrap', fits: true });
  }
  expect(await noSideScroll(olya), 'olya phone 320: horizontal scroll').toBe(true);
  expect(await noSideScroll(host), 'host 1280: horizontal scroll').toBe(true);
  await shot(host, 'p24d-lobby-host-1280');
  await shot(olya, 'p24d-lobby-olya-320');

  // ── 7. uk й ar, 375 і 320: «Вигляд» і шапка без бокового скролу. ──
  for (const lang of ['uk', 'ar'] as const) {
    expect((await olya.request.put(`${base}/api/me/locale`, { data: { locale: lang } })).status()).toBe(200);
    for (const width of [375, 320]) {
      await olya.setViewportSize({ width, height: 812 });
      await olya.goto(`${base}/profile/looks`);
      await expect.poll(() => htmlLang(olya), POLL).toBe(lang);
      await olya.locator('section.level-card').waitFor();
      if (lang === 'ar') expect(await olya.evaluate('document.documentElement.dir')).toBe('rtl');
      await expectNoSideScroll(olya, `p24d-looks-${lang}-${width}`);
      await olya.goto(`${base}/profile`);
      await olya.locator('.profile-head').waitFor();
      await expectNoSideScroll(olya, `p24d-header-${lang}-${width}`);
    }
  }
  expect((await olya.request.put(`${base}/api/me/locale`, { data: { locale: 'uk' } })).status()).toBe(200);

  // ── 7б. Довгий нік без пробілів (18 знаків) найширшим шрифтом у шапці на 320 px переноситься, а не обрізається. ──
  const longNick = await open('long24d', 320, 700);
  await register(longNick, 'menu', 'ОлександраВікторія', 'long24d@example.com');
  await pour(await myId(longNick), xpForLevel(30));
  expect((await longNick.request.put(`${base}/api/me/looks`, { data: { color: 'venom', frame: null, badge: '🌻', photo: 'eclipse', font: 'heavy' } })).status()).toBe(200);
  await longNick.goto(`${base}/profile`);
  const longName = longNick.locator('.profile-head h1 .nick-name.nick-font-heavy');
  await longName.waitFor();
  await longNick.evaluate('document.fonts.ready');
  const fit = await longName.evaluate((el) => {
    const h1 = el.closest('h1')!;
    const hero = el.closest('.motif-hero') ?? h1.parentElement!;
    const [name, box] = [el.getBoundingClientRect(), hero.getBoundingClientRect()];
    return { h1: h1.scrollWidth <= h1.clientWidth, inHero: name.left >= box.left - 0.5 && name.right <= box.right + 0.5 };
  });
  expect(fit.h1, 'long nick: h1 scrolls sideways').toBe(true);
  expect(fit.inHero, 'long nick: clipped by the hero').toBe(true);
  await expectNoSideScroll(longNick, 'p24d-header-long-320');
  // Сторінка «Вигляд» на 320 px не розтягується стіною тексту: вибір угорі, «Відкрито» згорнуте.
  await longNick.goto(`${base}/profile/looks`);
  await longNick.locator('section.level-card').waitFor();
  expect(await longNick.locator('details.level-unlocked').evaluate((el) => el.hasAttribute('open'))).toBe(false);
  const photoTops = await longNick.getByRole('radiogroup', { name: 'Рамка фото', exact: true }).evaluate((group) => [...group.querySelectorAll('label.look-option')].slice(0, 3).map((tile) => (tile as unknown as { offsetTop: number }).offsetTop));
  expect(photoTops[0], 'photo tiles: two per row at 320 px').toBe(photoTops[1]);
  expect(photoTops[2]!, 'photo tiles: the third starts a new row').toBeGreaterThan(photoTops[0]!);
  for (const name of ['Шрифт ніку', 'Колір ніку']) {
    const tops = await longNick.getByRole('radiogroup', { name, exact: true }).evaluate((group) => [...group.querySelectorAll('label.look-option')].slice(0, 2).map((tile) => (tile as unknown as { offsetTop: number }).offsetTop));
    expect(tops[0], `${name}: two per row at 320 px`).toBe(tops[1]);
  }
  await expectNoSideScroll(longNick, 'p24d-looks-long-320');

  // ── 8. Рівень 30: Оля вмикає «Сяйво», рух живий; з reduce — обертання вимкнене. ──
  await pour(olyaId, xpForLevel(30) - xpForLevel(17));
  await olya.setViewportSize({ width: 375, height: 812 });
  await olya.goto(`${base}/profile/looks`);
  await olya.locator('section.level-card').waitFor();
  expect(await lookTile(olya, 'Сяйво').locator('input').isDisabled()).toBe(false);
  await lookTile(olya, 'Сяйво').click();
  await Promise.all([olya.waitForResponse((r) => r.url().endsWith('/api/me/looks') && r.request().method() === 'PUT'), click(olya, 'Зберегти вигляд')]);
  await olya.goto(`${base}/profile`);
  const auraOf = (page: Page) => page.locator('.profile-head .photo-frame-aura');
  await auraOf(olya).waitFor();
  expect(await auraOf(olya).evaluate((el) => getComputedStyle(el, '::before').animationName)).not.toBe('none');

  const calm = await open('calm24d', 375, 812, { reducedMotion: 'reduce' });
  await register(calm, 'menu', 'Ігор 24d', 'igor24d@example.com');
  await pour(await myId(calm), xpForLevel(30));
  await calm.goto(`${base}/profile/looks`);
  await calm.locator('section.level-card').waitFor();
  // Усі 12 рамок фото й 8 шрифтів поруч у сітках — 375 і 1280 px.
  expect(await calm.getByRole('radiogroup', { name: 'Рамка фото', exact: true }).locator('label.look-option').count()).toBe(13);
  expect(await calm.getByRole('radiogroup', { name: 'Шрифт ніку', exact: true }).locator('label.look-option').count()).toBe(9);
  expect(await calm.locator('label.look-option.is-locked').count()).toBe(0);
  await shot(calm, 'p24d-all-frames-fonts-375');
  await calm.setViewportSize({ width: 1280, height: 900 });
  await shot(calm, 'p24d-all-frames-fonts-1280');
  await calm.setViewportSize({ width: 375, height: 812 });
  await lookTile(calm, 'Сяйво').click();
  await click(calm, 'Зберегти вигляд');
  await calm.goto(`${base}/profile`);
  await auraOf(calm).waitFor();
  expect(await auraOf(calm).evaluate((el) => getComputedStyle(el, '::before').animationName)).toBe('none');
}
