import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { STICKERS, TROPHY_KINDS, TROPHY_MATERIALS, xpForLevel, type PrizeContent } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { xpEntry } from '../src/db/schema';
import { kyivDay } from '../src/xp-rules';
import { open, click, field, join, expectNoSideScroll, register, myId, noSideScroll, POLL, answerAll, pickOption, frame, prizeQuestions14a, isTrophyRequest, openProfileTile, label, htmlLang } from './helpers/common';
import { exact, base, db, problems, pages, ARTIFACTS, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 25: трофеї.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 25a: trophy decor — Оля’s cup with three photos on the ring, a rim in the hand font, a two-line plaque and two stickers, a medal with a medallion photo and an engraved back, and a plain silver star show the same decor on the stage ceremony, Петро’s phone, the prize viewer and Петро’s showcase, with one WebGL context for three trophies, still under reduced motion, the emoji without WebGL, and no 3D in the lobby', async () => {
  try {
    await trophyDecor25a();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Лічильник запитів WebGL-контексту (webgl/webgl2) на сторінці: window.__webglCalls. */
const COUNT_WEBGL_25A = `(() => {
  const original = HTMLCanvasElement.prototype.getContext;
  window.__webglCalls = 0;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (type === 'webgl' || type === 'webgl2') window.__webglCalls++;
    return original.call(this, type, ...rest);
  };
})()`;

/** Браузер без WebGL: webgl/webgl2 повертають null. */
const NO_WEBGL_25A = `(() => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (type === 'webgl' || type === 'webgl2') return null;
    return original.call(this, type, ...rest);
  };
})()`;

/** Скільки непрозорих пікселів у центральній п'ятій частині кожного 2D-полотна трофея під selector. */
const opaqueCenters25a = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].map((canvas) => {
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return 0;
  const data = canvas.getContext('2d').getImageData(Math.floor(w * 0.4), Math.floor(h * 0.4), Math.max(1, Math.floor(w * 0.2)), Math.max(1, Math.floor(h * 0.2))).data;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 200) opaque++;
  return opaque;
})`;

/** Запити кожної сторінки за іменем: requests.get(name) — усі URL, які вона попросила. */
function trackRequests25a() {
  const requests = new Map<string, string[]>();
  const track = (name: string, page: Page) => {
    const list: string[] = [];
    requests.set(name, list);
    page.on('request', (request) => list.push(request.url()));
  };
  return { requests, track };
}

/** Діалог перегляду призу («Приз за N місце»). */
const prizeDialog25a = (page: Page) => page.getByRole('dialog', { name: /^Приз за \d місце$/ });

/** Приз лише з трофеєм. */
const prize25a = (name: string, trophy: PrizeContent['trophy']): PrizeContent => ({ name, trophy, engraving: null, real: null, title: null, diploma: false });

/** PNG 400×300 суцільного кольору, намальовані в сторінці (жодних файлів з диска), завантажені через /api/uploads: їхні URL. */
async function uploadPngs25a(page: Page, colors: string[]): Promise<string[]> {
  const urls = (await page.evaluate(`Promise.all(${JSON.stringify(colors)}.map((color) => new Promise((done) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const context = canvas.getContext('2d');
    context.fillStyle = color;
    context.fillRect(0, 0, 400, 300);
    canvas.toBlob(done, 'image/png');
  }).then((blob) => fetch('/api/uploads', { method: 'POST', body: blob, headers: { 'content-type': 'image/png' } }))
    .then(async (response) => {
      if (!response.ok) throw new Error('upload ' + response.status + ' ' + (await response.text()));
      return (await response.json()).url;
    })))`)) as string[];
  expect(urls).toHaveLength(colors.length);
  for (const url of urls) expect(url).toMatch(/^\/uploads\/[a-z0-9]{16,64}\.png$/);
  return urls;
}

/**
 * Лобі й гра частин 25a/25b: Оля (уже з призами places) запускає вікторину title, сцена (1280×720, з COUNT_WEBGL_25A) і
 * три телефони; місця 1, 2, 3 = places; у лобі жодного запиту на 3D; Петро 200, Іра 100, Богдан 0; «Завершити гру».
 * Петро завжди з акаунтом; Іра — лише з registerIra.
 */
async function playPrizeGame25a(
  olya: Page,
  tag: string,
  title: string,
  places: readonly [string, string, string],
  { requests, track }: ReturnType<typeof trackRequests25a>,
  { registerIra = false, inLobby }: { registerIra?: boolean; inLobby?: () => Promise<void> } = {},
): Promise<{ stage: Page; petro: Page; ira: Page; bohdan: Page }> {
  const data = {
    ...makeRoundsQuiz([classicRound('r1', prizeQuestions14a() as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })]),
    title,
  };
  const created = await olya.request.post(`${base}/api/quizzes`, { data });
  expect(created.ok(), await created.text()).toBe(true);
  await olya.goto(`${base}/quizzes`);
  await olya.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Грати', ...exact }).click();
  await olya.waitForURL(/\/host\/\d{6}$/);
  const code = olya.url().slice(-6);
  const stage = await open(`stage${tag}`, 1280, 720);
  await stage.addInitScript(COUNT_WEBGL_25A);
  track('stage', stage);
  await stage.goto((await olya.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!);
  const petro = await open(`petro${tag}`, 375, 812);
  track('petro', petro);
  await register(petro, 'menu', 'Петро', `petro${tag}@example.com`);
  const ira = await open(`ira${tag}`, 375, 812);
  track('ira', ira);
  if (registerIra) await register(ira, 'menu', 'Іра', `ira${tag}@example.com`);
  const bohdan = await open(`bohdan${tag}`, 375, 812);
  track('bohdan', bohdan);
  await join(petro, code, 'Петро', false);
  await join(ira, code, 'Іра', false);
  await join(bohdan, code, 'Богдан', false);
  await olya.getByText('Богдан', exact).first().waitFor();

  const panel = olya.locator('section.prize-places');
  await panel.getByRole('heading', { name: 'Призи гри', ...exact }).waitFor();
  const placeSelect = (index: number) => panel.locator('.prize-place').nth(index).locator('select');
  await placeSelect(0).locator('option', { hasText: places[0] }).waitFor({ state: 'attached' });
  for (const [index, name] of places.entries()) await placeSelect(index).selectOption({ label: name });
  await panel.getByRole('button', { name: 'Покласти призи', ...exact }).click();
  await panel.getByText('Призи покладено.', exact).waitFor();
  await stage.locator('.playing-for').getByText('Граємо за', exact).waitFor();
  await petro.locator('.playing-for').waitFor();
  for (const [name, list] of requests) expect(list.filter(isTrophyRequest), `${name} loaded 3D in the lobby`).toEqual([]);
  // Призи покладено, гра ще не почалась: тут вони зарезервовані (частина 25c дивиться на це з «Моїх призів»).
  await inLobby?.();

  const step = async (name: string) => {
    const button = olya.getByRole('button', { name, ...exact });
    await expect.poll(() => button.isDisabled(), { timeout: 10_000 }).toBe(false);
    await button.click();
  };
  const players = [petro, ira, bohdan];
  const answerAll = async (picks: [Page, string][]) => {
    for (const [page, text] of picks) {
      await page.getByRole('button', { name: new RegExp(text) }).waitFor();
      await pickOption(page, text);
    }
    await olya.getByText('Запитання закрите').waitFor();
    await step('Показати відповідь');
  };
  await step('Почати гру');
  await afterSplash(olya, stage, ...players);
  await step('Почати раунд');
  await afterSplash(olya, stage, ...players);
  await answerAll([[petro, 'Львів'], [ira, 'Львів'], [bohdan, 'Тернопіль']]);
  await step('Далі');
  await step('Наступне запитання');
  await afterSplash(olya, stage, ...players);
  await answerAll([[petro, 'Чорне'], [ira, 'Азовське'], [bohdan, 'Азовське']]);
  await step('Завершити гру');
  return { stage, petro, ira, bohdan };
}

async function trophyDecor25a() {
  const TITLE = 'Вікторина з оформленим кубком 25a';
  // 25d: кільце фото займає чашу — наліпка «Спереду» лягає на найближче вільне місце, «Основа праворуч».
  const CUP_DECOR = 'photos:ring:3;inscriptions:rim,plaque;stickers:front>base-right,base-left';
  const MEDAL_DECOR = 'photos:medallion:1;inscriptions:back';
  const tracking = trackRequests25a();
  const { requests, track } = tracking;
  const dialogOf = prizeDialog25a;

  // ── 1. Оля: три PNG, намальовані в сторінці (суцільні кольори 400×300; жодних файлів з диска), і три призи через API. ──
  const olya = await open('olya25a', 1280, 720);
  track('olya', olya);
  await register(olya, 'host', 'Оля', 'olya25a@example.com');
  const photos = await uploadPngs25a(olya, ['#d23c3c', '#2f9e44', '#1c64d8']);
  const crop = { x: 0.5, y: 0.5, scale: 1 };
  const prize = prize25a;
  const cup = prize('Кубок 25a', {
    kind: 'cup',
    material: 'gold',
    decor: {
      photos: photos.map((url) => ({ url, crop })),
      photoPlace: 'ring',
      frame: 'none',
      photoStyle: 'normal',
      inscriptions: [
        { place: 'rim', text: 'Чемпіон вікторини двадцять п’ять', font: 'hand', look: 'engraved', color: '#3a2a0e' },
        { place: 'plaque', text: 'Перше місце\nЧемпіон', font: null, look: 'engraved', color: '#3a2a0e' },
      ],
      effect: { kind: 'none' },
      appearance: 'spin',
      stickers: [
        { id: STICKERS[0]!.id, place: 'front' },
        { id: STICKERS[1]!.id, place: 'base-left' },
      ],
    },
  });
  const medal = prize('Медаль 25a', {
    kind: 'medal',
    material: 'bronze',
    decor: {
      photos: [{ url: photos[1]!, crop }],
      photoPlace: 'medallion',
      frame: 'gold',
      photoStyle: 'normal',
      inscriptions: [{ place: 'back', text: 'Дякуємо за гру', font: null, look: 'embossed', color: '#3a2a0e' }],
      effect: { kind: 'none' },
      appearance: 'spin',
      stickers: [],
    },
  });
  const star = prize('Зірка 25a', { kind: 'star', material: 'silver' });
  for (const content of [cup, medal, star]) {
    const made = await olya.request.post(`${base}/api/me/prizes`, { data: content });
    expect(made.status(), await made.text()).toBe(201);
  }

  // ── 2–3. Лобі (місця 1, 2, 3 = кубок, медаль, зірка; без 3D) і гра: Петро 200, Іра 100, Богдан 0. ──
  const { stage, petro } = await playPrizeGame25a(olya, '25a', TITLE, ['Кубок 25a', 'Медаль 25a', 'Зірка 25a'], tracking);

  // ── 4. Сцена: церемонія з трьома трофеями, один WebGL-контекст, те саме оформлення. ──
  const ceremony = stage.locator('.ceremony');
  const column = (place: number) => ceremony.locator(`.podium-col.is-place-${place}.is-shown`);
  await column(3).waitFor({ timeout: 20_000 });
  await column(1).waitFor({ timeout: 20_000 });
  expect(await column(1).locator('.podium-name').textContent()).toBe('Петро');
  expect(await column(2).locator('.podium-name').textContent()).toBe('Іра');
  expect(await column(3).locator('.podium-name').textContent()).toBe('Богдан');
  await expect.poll(() => ceremony.locator('.trophy-fallback').count(), POLL).toBe(0);
  expect(await ceremony.locator('canvas.trophy-canvas').count()).toBe(3);
  expect(await column(1).locator('canvas.trophy-canvas').getAttribute('data-decor')).toBe(CUP_DECOR);
  expect(await column(2).locator('canvas.trophy-canvas').getAttribute('data-decor')).toBe(MEDAL_DECOR);
  expect(await column(3).locator('canvas.trophy-canvas').getAttribute('data-decor')).toBe('');
  const centers = (await stage.evaluate(opaqueCenters25a('.ceremony canvas.trophy-canvas'))) as number[];
  expect(centers.every((n) => n > 0), `stage trophy centers: ${centers.join(', ')}`).toBe(true);
  // webglAvailable пробує один раз, рушій має один спільний WebGLRenderer на всі три трофеї.
  expect(await stage.evaluate('window.__webglCalls'), 'WebGL contexts on the stage').toBeLessThanOrEqual(2);
  await stage.evaluate(`Promise.all(
    [...document.querySelectorAll('.ceremony .is-place-1')].flatMap((el) => el.getAnimations({ subtree: true }))
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => undefined)),
  ).then(() => true)`);
  await shot(stage, 'p25a-stage-ceremony');
  // Пульт: «Медаль» під 2-м місцем відкриває медаль з тим самим оформленням (лицем: медальйон з фото й ободком).
  await click(olya, 'Церемонія тут');
  const hostSecond = olya.locator('.host-ceremony .ceremony .podium-col.is-place-2.is-shown');
  await hostSecond.waitFor({ timeout: 15_000 });
  await hostSecond.getByRole('button', { name: 'Медаль', ...exact }).click();
  const medalViewer = dialogOf(olya);
  await medalViewer.locator('canvas.trophy-canvas').waitFor();
  await expect.poll(() => medalViewer.locator('.trophy-fallback').count(), POLL).toBe(0);
  expect(await medalViewer.locator('canvas.trophy-canvas').getAttribute('data-decor')).toBe(MEDAL_DECOR);
  await shot(olya, 'p25a-medal-viewer');
  await olya.keyboard.press('Escape');
  await medalViewer.waitFor({ state: 'detached' });

  // ── 5. Телефон Петра: «Твій приз», перегляд «Кубок», власна вітрина; Оля бачить публічну вітрину Петра. ──
  const myPrize = petro.locator('section.my-prize');
  await myPrize.getByRole('heading', { name: 'Твій приз', ...exact }).waitFor({ timeout: 25_000 });
  const myCanvas = myPrize.locator('canvas.trophy-canvas');
  await myCanvas.waitFor();
  await expect.poll(() => myPrize.locator('.trophy-fallback').count(), POLL).toBe(0);
  expect(await myCanvas.getAttribute('data-decor')).toBe(CUP_DECOR);
  expect(((await petro.evaluate(opaqueCenters25a('section.my-prize canvas.trophy-canvas'))) as number[])[0], 'the phone cup is empty').toBeGreaterThan(0);
  await myCanvas.scrollIntoViewIfNeeded();
  await shot(petro, 'p25a-phone-myprize');
  await myPrize.getByRole('button', { name: 'Кубок', ...exact }).click();
  const viewer = dialogOf(petro);
  await viewer.waitFor();
  const viewerCanvas = viewer.locator('canvas.trophy-canvas');
  await viewerCanvas.waitFor();
  await expect.poll(() => viewer.locator('.trophy-fallback').count(), POLL).toBe(0);
  expect(await viewerCanvas.getAttribute('data-decor')).toBe(CUP_DECOR);
  await shot(petro, 'p25a-viewer');
  await petro.keyboard.press('Escape');
  await viewer.waitFor({ state: 'detached' });

  await petro.goto(`${base}/profile/prizes`);
  const card = petro.locator('section.showcase .award-card').first();
  await card.waitFor();
  await card.scrollIntoViewIfNeeded();
  // 29a: у вітрині — статична картинка кубка; 3D відкривається дотиком у діалозі перегляду (портал поза карткою).
  await card.locator('button.award-emoji').click();
  const cardViewer = dialogOf(petro);
  await cardViewer.locator('canvas.trophy-canvas').waitFor();
  expect(await cardViewer.locator('canvas.trophy-canvas').getAttribute('data-decor')).toBe(CUP_DECOR);
  await petro.keyboard.press('Escape');

  const petroId = await myId(petro);
  await olya.goto(`${base}/profile/${petroId}`);
  await olya.getByRole('heading', { level: 1, name: /Петро/ }).waitFor();
  const shelfCup = olya.locator('section.shelf button.shelf-cup');
  await shelfCup.waitFor();
  expect(await olya.locator('section.shelf .shelf-item').count()).toBe(1);
  await shelfCup.click();
  const publicViewer = dialogOf(olya);
  await publicViewer.locator('canvas.trophy-canvas').waitFor();
  await expect.poll(() => publicViewer.locator('.trophy-fallback').count(), POLL).toBe(0);
  expect(await publicViewer.locator('canvas.trophy-canvas').getAttribute('data-decor')).toBe(CUP_DECOR);
  await shot(olya, 'p25a-showcase');
  await olya.keyboard.press('Escape');

  // ── 6. reduced motion: кубок у вітрині Петра стоїть (два кадри з різницею 1 с однакові). ──
  const calm = await open('calm25a', 375, 812, { reducedMotion: 'reduce' });
  await calm.goto(`${base}/profile/${petroId}`);
  await calm.locator('section.shelf button.shelf-cup').click();
  const calmViewer = dialogOf(calm);
  await calmViewer.locator('canvas.trophy-canvas').waitFor();
  await expect.poll(() => calmViewer.locator('.trophy-fallback').count(), POLL).toBe(0);
  expect(await calmViewer.locator('canvas.trophy-canvas').getAttribute('data-decor')).toBe(CUP_DECOR);
  const frame = () => calm.evaluate(`document.querySelector('.prize-view canvas.trophy-canvas').toDataURL()`) as Promise<string>;
  const still = await frame();
  await calm.waitForTimeout(1000);
  expect((await frame()) === still, 'the cup moves under reduced motion').toBe(true);
  // Стрілки повертають і без обертання: 6 × 15° праворуч — лівий бік (наліпка base-left) до глядача.
  await calmViewer.locator('canvas.trophy-canvas').focus();
  for (let i = 0; i < 6; i++) await calm.keyboard.press('ArrowRight');
  await expect.poll(async () => (await frame()) !== still, POLL).toBe(true);
  await shot(calm, 'p25a-viewer-side');

  // ── 7. Без WebGL: значок 🏆 і жодного запиту на модель чи рушій. ──
  const noGl = await open('nogl25a', 375, 812);
  await noGl.addInitScript(NO_WEBGL_25A);
  track('nogl', noGl);
  await noGl.goto(`${base}/profile/${petroId}`);
  await noGl.locator('section.shelf button.shelf-cup').click();
  const noGlViewer = dialogOf(noGl);
  await noGlViewer.waitFor();
  expect(await noGlViewer.locator('.trophy-fallback').textContent()).toBe('🏆');
  expect(await noGlViewer.locator('canvas.trophy-canvas').count()).toBe(0);
  await noGl.waitForTimeout(500);
  expect(requests.get('nogl')!.filter(isTrophyRequest), 'the page without WebGL loaded 3D').toEqual([]);

  expect(problems).toEqual([]);
}

it('part 25b: trophy effects and appearances — Оля’s cup with fire that drops from the sky, a medal with a blue glow that flashes in, and a star with snow that rises from a pedestal play their appearance on the stage ceremony and show their effect with one WebGL context; sparks and rays show in the prize studio; under reduced motion the glow stands still and nothing plays; a prize without decor is unchanged', async () => {
  try {
    await trophyEffects25b();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/**
 * Скільки пікселів з alpha > 30 у смузі x ∈ [0.08w, 0.2w], y ∈ [0.35h, 0.65h] 2D-полотна трофея під selector —
 * поза силуетом медалі, тобто гало сяйва (прозоре полотно навколо лишається прозорим, а не чорним квадратом).
 */
const haloPixels25b = (selector: string) => `(() => {
  const canvas = document.querySelector(${JSON.stringify(selector)});
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return 0;
  const x = Math.floor(w * 0.08), y = Math.floor(h * 0.35);
  const data = canvas.getContext('2d').getImageData(x, y, Math.max(1, Math.floor(w * 0.2) - x), Math.max(1, Math.floor(h * 0.65) - y)).data;
  let lit = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 30) lit++;
  return lit;
})()`;

/** «w×h:» і RGBA-байти смуги x ∈ [x0·w, x1·w), y ∈ [y0·h, y1·h) 2D-полотна трофея під selector, рядком: для порівняння кадрів. */
const bandPixels25b = (selector: string, x0: number, x1: number, y0: number, y1: number) => `(() => {
  const canvas = document.querySelector(${JSON.stringify(selector)});
  const w = canvas.width, h = canvas.height;
  const x = Math.floor(w * ${x0}), y = Math.floor(h * ${y0});
  return w + 'x' + h + ':' + canvas.getContext('2d').getImageData(x, y, Math.max(1, Math.floor(w * ${x1}) - x), Math.max(1, Math.floor(h * ${y1}) - y)).data.join(',');
})()`;

async function trophyEffects25b() {
  const TITLE = 'Вікторина з ефектами кубків 25b';
  const tracking = trackRequests25a();
  const { track } = tracking;
  type Decor = NonNullable<NonNullable<PrizeContent['trophy']>['decor']>;
  const decor = (effect: Decor['effect'], appearance: Decor['appearance'], extra: Partial<Decor> = {}): Decor => ({
    photos: [],
    photoPlace: 'ring',
    frame: 'none',
    photoStyle: 'normal',
    inscriptions: [],
    stickers: [],
    effect,
    appearance,
    ...extra,
  });

  // ── 1. Оля: одне PNG, намальоване в сторінці, і п'ять призів з ефектами через API. ──
  const olya = await open('olya25b', 1280, 720);
  track('olya', olya);
  await register(olya, 'host', 'Оля', 'olya25b@example.com');
  const [photo] = await uploadPngs25a(olya, ['#d23c3c']);
  const crop = { x: 0.5, y: 0.5, scale: 1 };
  const prizes = [
    prize25a('Кубок 25b', { kind: 'cup', material: 'gold', decor: decor({ kind: 'fire' }, 'drop', { photos: [{ url: photo!, crop }], photoPlace: 'medallion' }) }),
    prize25a('Медаль 25b', { kind: 'medal', material: 'silver', decor: decor({ kind: 'glow', color: '#4fc3f7' }, 'flash') }),
    prize25a('Зірка 25b', { kind: 'star', material: 'bronze', decor: decor({ kind: 'snow' }, 'rise') }),
    prize25a('Іскри 25b', { kind: 'cup', material: 'gold', decor: decor({ kind: 'sparks' }, 'spin') }),
    prize25a('Промені 25b', { kind: 'cup', material: 'gold', decor: decor({ kind: 'rays' }, 'spin') }),
  ];
  for (const content of prizes) {
    const made = await olya.request.post(`${base}/api/me/prizes`, { data: content });
    expect(made.status(), await made.text()).toBe(201);
  }

  // ── 2–3. Лобі (місця 1, 2, 3 = кубок, медаль, зірка; без 3D) і гра: Петро перший, Іра друга, Богдан третій. ──
  const { stage, petro, ira } = await playPrizeGame25a(olya, '25b', TITLE, ['Кубок 25b', 'Медаль 25b', 'Зірка 25b'], tracking, { registerIra: true });
  // Сцена записує, коли вперше показано кожну колонку й кожен стан появи (performance.now): межі «≤ 5 с від появи колонки»
  // й порядок pending → playing → done перевіряються за цими мітками, а не за тим, коли тест дійшов до місця.
  await stage.evaluate(`(() => {
    window.__shown25b = {};
    window.__appear25b = {};
    const scan = () => {
      const now = performance.now();
      for (const col of document.querySelectorAll('.ceremony .podium-col.is-shown')) window.__shown25b[col.dataset.place] ??= now;
      for (const canvas of document.querySelectorAll('.ceremony canvas.trophy-canvas[data-appearance]')) window.__appear25b[canvas.dataset.appearance] ??= now;
    };
    scan();
    new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-appearance'] });
  })()`);
  // Низьке вікно Петра: кубок «Твого призу» з'явиться нижче згину (крок 5 перевіряє, що поява чекає, доки його видно).
  await petro.setViewportSize({ width: 375, height: 200 });

  // ── 4. Сцена: кожен трофей грає свою появу (3 → 2 → 1), ефекти живі, один WebGL-контекст. ──
  const ceremony = stage.locator('.ceremony');
  const column = (place: number) => ceremony.locator(`.podium-col.is-place-${place}.is-shown`);
  const canvasOf = (place: number) => column(place).locator('canvas.trophy-canvas');
  const appearance = (place: number) => canvasOf(place).getAttribute('data-appearance');
  const expected = { 1: ['fire:animated', 'drop'], 2: ['glow:animated', 'flash'], 3: ['snow:animated', 'rise'] } as const;
  const marks = () => stage.evaluate('({ shown: window.__shown25b, appear: window.__appear25b })') as Promise<{ shown: Record<string, number>; appear: Record<string, number> }>;
  for (const place of [3, 2, 1] as const) {
    await column(place).waitFor({ timeout: 20_000 });
    const [effect, kind] = expected[place];
    if (place === 1) {
      // Падіння з 3r: перші ~0.5 с кубок здебільшого над кадром. Знімок через 0.49 с від першого намальованого кадру — кубок
      // уже в кадрі, але ще в повітрі (на початку знімка lift ≈ 1.2r; удар об підлогу — на 0.65 с).
      await stage.waitForFunction(
        `(start => start !== undefined && performance.now() - start >= 490)(window.__appear25b['drop:playing'])`,
        null,
        { polling: 'raf', timeout: 10_000 },
      );
      await shot(stage, 'p25b-stage-appearing');
    }
    await expect.poll(() => appearance(place), { timeout: 10_000 }).toBe(`${kind}:done`);
    expect(await canvasOf(place).getAttribute('data-effect'), `place ${place} effect`).toBe(effect);
    // Перший намальований кадр — playing, потім done; done не пізніше 5 с від появи колонки.
    const { shown, appear } = await marks();
    expect(shown[place], `place ${place} shown`).toBeDefined();
    expect(appear[`${kind}:playing`], `place ${place} never played`).toBeDefined();
    expect(appear[`${kind}:playing`]!, `place ${place} order`).toBeLessThanOrEqual(appear[`${kind}:done`]!);
    expect(appear[`${kind}:done`]! - shown[place]!, `place ${place} appearance time from the column`).toBeLessThanOrEqual(5000);
  }
  expect(await column(1).locator('.podium-name').textContent()).toBe('Петро');
  expect(await column(2).locator('.podium-name').textContent()).toBe('Іра');
  expect(await column(3).locator('.podium-name').textContent()).toBe('Богдан');
  await expect.poll(() => ceremony.locator('.trophy-fallback').count(), POLL).toBe(0);
  expect(await ceremony.locator('canvas.trophy-canvas').count()).toBe(3);
  expect(await stage.evaluate('window.__webglCalls'), 'WebGL contexts on the stage').toBeLessThanOrEqual(2);
  // Ефекти живі там, куди трофей не дістає ні під яким кутом обертання (сам кадр крутиться завжди, тож цілий кадр нічого не доводить):
  // – сніг: ліва смуга полотна зірки x ∈ [0, 0.12w], y ∈ [0.1h, 0.6h] — це 0.83r–1.09r від осі, а півширина зірки ≈ 0.58r; снігова коробка — ±1.4r;
  // – сяйво: смуга гало медалі (як у haloPixels25b) пульсує.
  // Зі статичним ефектом (позиції частинок і прозорість сяйва незмінні) ці смуги між кадрами однакові.
  // Скільки пікселів смуги змінилися за 300 мс хоч в одному каналі на ≥ 3: перемальований нерухомий кадр дає ±1 (округлення
  // при копіюванні), тож такий шум не рахується; зміна розміру полотна (подіум перекладається) — теж не рух ефекту (0).
  const stageBand = (place: number, x0: number, x1: number, y0: number, y1: number) =>
    stage.evaluate(bandPixels25b(`.ceremony .podium-col.is-place-${place} canvas.trophy-canvas`, x0, x1, y0, y1)) as Promise<string>;
  const moved = async (place: number, x0: number, x1: number, y0: number, y1: number) => {
    const [sizeBefore, before] = (await stageBand(place, x0, x1, y0, y1)).split(':') as [string, string];
    await stage.waitForTimeout(300);
    const [sizeAfter, after] = (await stageBand(place, x0, x1, y0, y1)).split(':') as [string, string];
    if (sizeBefore !== sizeAfter) return 0;
    const a = before.split(',').map(Number);
    const b = after.split(',').map(Number);
    let count = 0;
    for (let i = 0; i < a.length; i += 4) if ([0, 1, 2, 3].some((c) => Math.abs(a[i + c]! - b[i + c]!) >= 3)) count++;
    return count;
  };
  await expect.poll(() => moved(3, 0, 0.12, 0.1, 0.6), { message: 'the snow stands still', timeout: 5000 }).toBeGreaterThan(5);
  await expect.poll(() => moved(2, 0.08, 0.2, 0.35, 0.65), { message: 'the glow stands still', timeout: 5000 }).toBeGreaterThan(5);
  // Блакитне гало навколо медалі: світлі пікселі поза її силуетом.
  const halo = (await stage.evaluate(haloPixels25b('.ceremony .podium-col.is-place-2 canvas.trophy-canvas'))) as number;
  expect(halo, 'the medal glow halo').toBeGreaterThan(50);
  await shot(stage, 'p25b-stage-ceremony');

  // ── 5. Телефон Петра: «Твій приз» (card) — вогонь статичний, поява грає; перегляд «Кубок» (view) — вогонь живий. ──
  const myPrize = petro.locator('section.my-prize');
  await myPrize.getByRole('heading', { name: 'Твій приз', ...exact }).waitFor({ timeout: 25_000 });
  const myCanvas = myPrize.locator('canvas.trophy-canvas');
  await myCanvas.waitFor({ state: 'attached' });
  expect(await myCanvas.getAttribute('data-effect')).toBe('fire:static');
  // Кубок нижче згину: поява чекає на перший намальований кадр і не грає невидимою.
  const below = petro.evaluate(`document.querySelector('section.my-prize canvas.trophy-canvas').getBoundingClientRect().top >= innerHeight`);
  expect(await below, 'the phone cup is below the fold of the low window').toBe(true);
  await petro.waitForTimeout(1500);
  expect(await myCanvas.getAttribute('data-appearance'), 'the appearance played out of view').toBe('drop:pending');
  await petro.setViewportSize({ width: 375, height: 812 });
  await myCanvas.scrollIntoViewIfNeeded();
  await expect.poll(() => myCanvas.getAttribute('data-appearance'), POLL).toBe('drop:done');
  await expect.poll(() => myPrize.locator('.trophy-fallback').count(), POLL).toBe(0);
  await shot(petro, 'p25b-phone-myprize');
  await myPrize.getByRole('button', { name: 'Кубок', ...exact }).click();
  const viewer = prizeDialog25a(petro);
  const viewerCanvas = viewer.locator('canvas.trophy-canvas');
  await viewerCanvas.waitFor();
  await expect.poll(() => viewer.locator('.trophy-fallback').count(), POLL).toBe(0);
  expect(await viewerCanvas.getAttribute('data-effect')).toBe('fire:animated');
  await expect.poll(() => viewerCanvas.getAttribute('data-appearance'), POLL).toBe('drop:done');
  await shot(petro, 'p25b-viewer');
  await petro.keyboard.press('Escape');
  await viewer.waitFor({ state: 'detached' });

  // ── 6. Оля, «Мої призи» → редактор (view): іскри й промені живі, поява не грає; новий приз — з порожнім оформленням чернетки. ──
  await olya.goto(`${base}/profile/prizes`);
  await olya.getByRole('heading', { name: 'Мої призи', ...exact }).waitFor();
  const preview = olya.locator('.prize-studio canvas.trophy-canvas');
  for (const [name, effect, shotName] of [
    ['Іскри 25b', 'sparks:animated', 'p25b-form-sparks'],
    ['Промені 25b', 'rays:animated', 'p25b-form-rays'],
  ] as const) {
    await olya.locator('.prize-list li', { hasText: name }).getByRole('button', { name: 'Змінити', ...exact }).click();
    await olya.waitForURL(/\/profile\/prizes\/[^/]+$/);
    await preview.waitFor();
    await expect.poll(() => olya.locator('.prize-studio .trophy-fallback').count(), POLL).toBe(0);
    expect(await preview.getAttribute('data-effect'), name).toBe(effect);
    expect(await preview.getAttribute('data-appearance'), name).toBe('spin:skipped');
    await shot(olya, shotName);
    await click(olya, 'Скасувати');
    await olya.waitForURL(/\/profile\/prizes$/);
    await preview.waitFor({ state: 'detached' });
  }
  await click(olya, 'Новий приз');
  await olya.waitForURL(/\/profile\/prizes\/new$/);
  await preview.waitFor();
  await expect.poll(() => olya.locator('.prize-studio .trophy-fallback').count(), POLL).toBe(0);
  // decorSummary('cup', EMPTY_DECOR): чернетка завжди має оформлення.
  expect(await preview.getAttribute('data-decor')).toBe('photos:none');
  expect(await preview.getAttribute('data-effect'), 'a new prize effect').toBe('none:off');
  expect(await preview.getAttribute('data-appearance'), 'a new prize appearance').toBe('spin:skipped');
  await click(olya, 'Скасувати');
  await olya.waitForURL(/\/profile\/prizes$/);

  // ── 7. reduced motion: вогонь вимкнений, сяйво стоїть, жодна поява не грає; кадри однакові. ──
  const petroId = await myId(petro);
  const iraId = await myId(ira);
  const calm = await open('calm25b', 375, 812, { reducedMotion: 'reduce' });
  for (const [id, effect, shown] of [
    [petroId, 'fire:off', 'drop:skipped'],
    [iraId, 'glow:static', 'flash:skipped'],
  ] as const) {
    await calm.goto(`${base}/profile/${id}`);
    await calm.locator('section.shelf button.shelf-cup').click();
    const calmViewer = prizeDialog25a(calm);
    const calmCanvas = calmViewer.locator('canvas.trophy-canvas');
    await calmCanvas.waitFor();
    await expect.poll(() => calmViewer.locator('.trophy-fallback').count(), POLL).toBe(0);
    expect(await calmCanvas.getAttribute('data-effect')).toBe(effect);
    expect(await calmCanvas.getAttribute('data-appearance')).toBe(shown);
    const frame = () => calm.evaluate(`document.querySelector('.prize-view canvas.trophy-canvas').toDataURL()`) as Promise<string>;
    // Спершу два кадри поспіль однакові (рушій домалював усе), далі — і з різницею 1 с.
    await expect
      .poll(async () => {
        const first = await frame();
        await calm.waitForTimeout(100);
        return (await frame()) === first;
      }, POLL)
      .toBe(true);
    const still = await frame();
    await calm.waitForTimeout(1000);
    expect((await frame()) === still, `${effect} moves under reduced motion`).toBe(true);
    if (effect === 'glow:static') await shot(calm, 'p25b-calm-viewer');
    await calm.keyboard.press('Escape');
    await calmViewer.waitFor({ state: 'detached' });
  }

  expect(problems).toEqual([]);
}

it('part 25c: trophy editor — Оля makes a gold cup in the fullscreen studio on a phone: three photos on the ring with one moved and one cropped in a gold frame, a rim inscription in the hand font with an embossed look, a two-line plaque, a front sticker, a blue glow and a drop from the sky that plays on «Показати появу»; the caption under the cup goes to the diploma; a locked font is shown with its level and refused by the server; a grail is open again; a reserved prize is view only; the cup looks the same on the stage ceremony and in Петро’s showcase; no WebGL explains, reduced motion keeps it still, Arabic mirrors the drawer', async () => {
  try {
    await trophyEditor25c();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** PNG 400×300 суцільного кольору, намальовані в сторінці (жодних файлів з диска): файли для setInputFiles. */
async function drawnPngs25c(page: Page, colors: string[]): Promise<{ name: string; mimeType: string; buffer: Buffer }[]> {
  const encoded = (await page.evaluate(`${JSON.stringify(colors)}.map((color) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const context = canvas.getContext('2d');
    context.fillStyle = color;
    context.fillRect(0, 0, 400, 300);
    return canvas.toDataURL('image/png').split(',')[1];
  })`)) as string[];
  return encoded.map((base64, index) => ({ name: `photo-${index + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') }));
}

/** Друга сторінка в контексті page (та сама сесія), з тими самими перевірками помилок, що й open(). */
async function samePersonPage25c(page: Page, name: string, width: number, height: number): Promise<Page> {
  const second = await page.context().newPage();
  await second.setViewportSize({ width, height });
  second.on('pageerror', (error) => problems.push(`${name}: ${error.message} @ ${second.url()}`));
  second.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) problems.push(`${name} console: ${message.text()} @ ${message.location().url}`);
  });
  second.on('dialog', (dialog) => void dialog.accept());
  pages.set(name, second);
  return second;
}

async function trophyEditor25c() {
  const TITLE = 'Вікторина з кубком із редактора 25c';
  // 25d: кільце фото займає чашу — наліпка «Спереду» переїжджає на «Основа ліворуч».
  const CUP_DECOR = 'photos:ring:3;inscriptions:rim,plaque;stickers:front>base-left';
  const tracking = trackRequests25a();
  const { requests, track } = tracking;
  const nya = STICKERS.find((sticker) => sticker.series === 'nya')!;

  const olya = await open('olya25c', 390, 844);
  track('olya', olya);
  await register(olya, 'menu', 'Оля', 'olya25c@example.com');
  const studio = olya.locator('.prize-studio');
  const studioCanvas = studio.locator('canvas.trophy-canvas');
  const tab = (page: Page, name: string) => page.getByRole('tab', { name, ...exact });
  const radio = (page: Page, name: string) => page.getByRole('radio', { name, ...exact });
  /** Частка висоти вікна під сценою над шухлядою: не менше 40 % (minmax(40dvh, 1fr), 0.399 — на округлення пікселів), тобто шухляда не закриває кубок. */
  const stageShare = (page: Page) =>
    page.evaluate(`document.querySelector('.studio-stage').getBoundingClientRect().height / innerHeight`) as Promise<number>;

  // ── 1. «Профіль → Призи» → «Новий приз»: шість вкладок, «Форма» вибрана; без бокового скролу на 390, 360 і 320. ──
  await openProfileTile(olya, 'Призи');
  await olya.waitForURL(/\/profile\/prizes$/);
  await click(olya, 'Новий приз');
  await olya.waitForURL(/\/profile\/prizes\/new$/);
  await studio.getByRole('heading', { level: 1, name: 'Новий приз', ...exact }).waitFor();
  expect(await studio.getByRole('tab').count()).toBe(6);
  expect(await tab(olya, 'Форма').getAttribute('aria-selected')).toBe('true');
  await studioCanvas.waitFor();
  await expect.poll(() => studio.locator('.trophy-fallback').count(), POLL).toBe(0);
  // Шапка й шухляда разом — не більше половини екрана телефона.
  expect(await stageShare(olya), 'the stage at 390×844').toBeGreaterThanOrEqual(0.5);
  await expectNoSideScroll(olya, 'p25c-studio-shape');
  for (const [width, height] of [[360, 640], [320, 568]] as const) {
    await olya.setViewportSize({ width, height });
    expect(await noSideScroll(olya), `studio ${width}×${height}: horizontal scroll`).toBe(true);
    expect(await stageShare(olya), `the stage at ${width}×${height}`).toBeGreaterThanOrEqual(0.399);
  }
  await shot(olya, 'p25c-studio-short-320');
  await olya.setViewportSize({ width: 390, height: 844 });

  // ── 2. «Форма»: кубок, золото, наліпка спереду — перша з серії nya. ──
  await radio(olya, 'кубок').check();
  await radio(olya, 'Золото').check();
  // 25d: «+ Додати наліпку» → вікно наліпки → місце «Спереду».
  await studio.getByRole('button', { name: '+ Додати наліпку', ...exact }).click();
  const stickerDialog = olya.getByRole('dialog', { name: 'Нова наліпка', ...exact });
  await stickerDialog.getByRole('button', { name: nya.id, ...exact }).click();
  await expect.poll(() => stickerDialog.getByRole('button', { name: nya.id, ...exact }).getAttribute('aria-pressed'), POLL).toBe('true');
  await stickerDialog.getByRole('radio', { name: 'Спереду', ...exact }).check();
  await stickerDialog.getByRole('button', { name: 'Готово', ...exact }).click();
  await stickerDialog.waitFor({ state: 'detached' });
  await studio.locator('.studio-sticker-row', { hasText: 'Спереду' }).waitFor();
  await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe('photos:none;stickers:front');

  // ── 3. «Фото»: три PNG на кільце, третє переставлено на початок, перше (тепер синє) кадроване в 2×, золота рамка. ──
  await tab(olya, 'Фото').click();
  await radio(olya, 'Кільце по чаші').check();
  await studio.locator('.studio-photo-add input[type="file"]').setInputFiles(await drawnPngs25c(olya, ['#d23c3c', '#2f9e44', '#1c64d8']));
  await studio.getByText('3 з 16', exact).waitFor();
  const thumbs = () => studio.locator('.studio-photos img').evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src')!));
  await expect.poll(async () => (await thumbs()).length, POLL).toBe(3);
  const [red, green, blue] = (await thumbs()) as [string, string, string];
  for (const url of [red, green, blue]) expect(url).toMatch(/^\/uploads\/[a-z0-9]{16,64}\.png$/);
  // «Раніше» пересуває на одне місце: синє з третього — на друге, далі на перше.
  await click(olya, 'Раніше: Фото 3');
  await expect.poll(thumbs, POLL).toEqual([red, blue, green]);
  await click(olya, 'Раніше: Фото 2');
  await expect.poll(thumbs, POLL).toEqual([blue, red, green]);
  await click(olya, 'Кадрувати: Фото 1');
  const cropDialog = olya.getByRole('dialog', { name: 'Кадрування', ...exact });
  await cropDialog.locator('canvas.crop-canvas[data-ready="true"]').waitFor();
  await cropDialog.getByLabel('Масштаб', exact).fill('2');
  await shot(olya, 'p25c-studio-crop');
  await cropDialog.getByRole('button', { name: 'Готово', ...exact }).click();
  await cropDialog.waitFor({ state: 'detached' });
  await radio(olya, 'Золота').check();
  await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe('photos:ring:3;stickers:front>base-left');
  await shot(olya, 'p25c-studio-photos');

  // ── 4. «Написи»: рим рукописним рельєфом, табличка у два рядки; «Грубий» закритий з рівнем. ──
  await tab(olya, 'Написи').click();
  const textPlace = (name: string) => studio.locator('fieldset.studio-text').filter({ has: olya.getByRole('checkbox', { name, ...exact }) });
  const rim = textPlace('По колу на вінці');
  await rim.getByRole('checkbox', { name: 'По колу на вінці', ...exact }).check();
  await rim.getByLabel('Текст', exact).fill('Чемпіон вечора');
  await rim.getByRole('radio', { name: 'Рукописний', ...exact }).check();
  await rim.getByRole('radio', { name: 'Рельєфний', ...exact }).check();
  const heavy = rim.locator('label', { hasText: 'Грубий' });
  expect(await heavy.locator('input').isDisabled(), 'the heavy font is open at level 1').toBe(true);
  expect(await heavy.locator('.look-lock').textContent()).toBe('🔒 з рівня 24');
  const plaque = textPlace('Табличка');
  await plaque.getByRole('checkbox', { name: 'Табличка', ...exact }).check();
  const plaqueText = plaque.getByLabel('Текст', exact);
  await plaqueText.fill('Оля дарує');
  await plaqueText.press('Enter');
  await plaqueText.pressSequentially('Петрові');
  await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe(CUP_DECOR);
  await shot(olya, 'p25c-studio-texts');

  // ── 5. «Ефекти»: блакитне сяйво, живе на view. ──
  await tab(olya, 'Ефекти').click();
  await radio(olya, 'Сяйво').check();
  // Зразок — схована радіокнопка під кружечком: дотик по кружечку (його підпис).
  await studio.locator('label.studio-swatch[title="Блакитний"]').click();
  expect(await radio(olya, 'Блакитний').isChecked()).toBe(true);
  await expect.poll(() => studioCanvas.getAttribute('data-effect'), POLL).toBe('glow:animated');
  await shot(olya, 'p25c-studio-effects');

  // ── 6. «Поява»: «Падіння з неба» грає одразу; «Показати появу» — ще раз: playing, потім done. ──
  await tab(olya, 'Поява').click();
  await olya.evaluate(`(() => {
    window.__studioAppear = [];
    new MutationObserver((records) => {
      for (const record of records) window.__studioAppear.push(record.target.dataset.appearance);
    }).observe(document.querySelector('.studio-stage'), { subtree: true, attributes: true, attributeFilter: ['data-appearance'] });
  })()`);
  await radio(olya, 'Падіння з неба').check();
  await expect.poll(() => studioCanvas.getAttribute('data-appearance'), POLL).toBe('drop:done');
  const appeared = () => olya.evaluate('window.__studioAppear') as Promise<string[]>;
  expect(await appeared(), 'the pick played the drop').toContain('drop:playing');
  await olya.evaluate('window.__studioAppear.length = 0');
  await click(olya, 'Показати появу');
  await expect.poll(async () => (await appeared()).includes('drop:done'), POLL).toBe(true);
  const replayed = await appeared();
  expect(replayed.indexOf('drop:playing'), `replay: ${replayed.join(' → ')}`).toBeGreaterThanOrEqual(0);
  expect(replayed.indexOf('drop:playing'), `replay: ${replayed.join(' → ')}`).toBeLessThan(replayed.lastIndexOf('drop:done'));

  // ── 7. «Приз»: назва, підпис під кубком і на дипломі, диплом; «Зберегти» → склад. ──
  await tab(olya, 'Приз').click();
  await field(olya, 'Назва').fill('Кубок 25c');
  await field(olya, 'Підпис під кубком і на дипломі').fill('За найкращу гру');
  await olya.getByRole('checkbox', { name: 'Диплом', ...exact }).check();
  await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe(CUP_DECOR);
  const studioDecor = (await studioCanvas.getAttribute('data-decor'))!;
  await shot(olya, 'p25c-studio-prize');
  await click(olya, 'Зберегти');
  await olya.waitForURL(/\/profile\/prizes$/);
  await olya.locator('.prize-list li', { hasText: 'Кубок 25c' }).waitFor();

  // ── 8. Збережене: усе, що зроблено в редакторі. ──
  type Item = { id: string; status: string; content: PrizeContent };
  const store = async () => (await (await olya.request.get(`${base}/api/me/prizes`)).json()) as Item[];
  const cup = (await store()).find((item) => item.content.name === 'Кубок 25c')!;
  expect(cup, 'the saved cup').toBeDefined();
  const decor = cup.content.trophy!.decor!;
  expect(cup.content.trophy!.kind).toBe('cup');
  expect(cup.content.trophy!.material).toBe('gold');
  expect(decor.photos.map((p) => p.url)).toEqual([blue, red, green]);
  expect(decor.photos[0]!.crop.scale).toBe(2);
  expect(decor.photoPlace).toBe('ring');
  expect(decor.frame).toBe('gold');
  expect(decor.inscriptions.map((i) => i.place)).toEqual(['rim', 'plaque']);
  expect(decor.inscriptions[0]).toMatchObject({ text: 'Чемпіон вечора', font: 'hand', look: 'embossed' });
  expect(decor.inscriptions[1]!.text).toBe('Оля дарує\nПетрові');
  expect(decor.effect).toEqual({ kind: 'glow', color: '#4fc3f7' });
  expect(decor.appearance).toBe('drop');
  expect(decor.stickers).toEqual([{ id: nya.id, place: 'front' }]);
  expect(cup.content.engraving).toBe('За найкращу гру');
  expect(cup.content.diploma).toBe(true);

  // ── 9. Сервер: закритий шрифт («Грубий» з рівня 24) — 409 decor_locked. ──
  const locked = await olya.request.post(`${base}/api/me/prizes`, {
    data: prize25a('Закритий шрифт 25c', {
      kind: 'cup',
      material: 'gold',
      decor: {
        photos: [],
        photoPlace: 'ring',
        frame: 'none',
        photoStyle: 'normal',
        inscriptions: [{ place: 'rim', text: 'Грубо', font: 'heavy', look: 'engraved', color: '#3a2a0e' }],
        effect: { kind: 'none' },
        appearance: 'spin',
        stickers: [],
      },
    }),
  });
  expect(locked.status(), await locked.text()).toBe(409);
  expect(await locked.json()).toEqual({ error: 'decor_locked' });

  // ── 10. Грааль знову можна вибрати: фото на медальйоні. ──
  await click(olya, 'Новий приз');
  await olya.waitForURL(/\/profile\/prizes\/new$/);
  await radio(olya, 'грааль').check();
  await tab(olya, 'Фото').click();
  await radio(olya, 'Медальйон спереду').check();
  await studio.locator('.studio-photo-add input[type="file"]').setInputFiles(await drawnPngs25c(olya, ['#d4a017']));
  await studio.getByText('1 з 1', exact).waitFor();
  await tab(olya, 'Приз').click();
  await field(olya, 'Назва').fill('Грааль 25c');
  await click(olya, 'Зберегти');
  await olya.waitForURL(/\/profile\/prizes$/);
  await olya.locator('.prize-list li', { hasText: 'Грааль 25c' }).waitFor();
  const grail = (await store()).find((item) => item.content.name === 'Грааль 25c')!;
  expect(grail.content.trophy!.kind).toBe('grail');
  expect(grail.content.trophy!.decor!.photoPlace).toBe('medallion');
  expect(grail.content.trophy!.decor!.photos).toHaveLength(1);
  const star = await olya.request.post(`${base}/api/me/prizes`, { data: prize25a('Зірка 25c', { kind: 'star', material: 'silver' }) });
  expect(star.status(), await star.text()).toBe(201);

  // ── 11–12. Лобі: місце 1 = кубок; зарезервований кубок у «Моїх призах» лише переглядають. Гра: Петро перший. ──
  // Редактор законно вантажив 3D: лобі перевіряє вже нові запити Олі, а ранні лишаються для перевірки грааля наприкінці.
  const studioRequests = requests.get('olya')!.splice(0);
  await olya.setViewportSize({ width: 1280, height: 720 });
  const { stage, petro } = await playPrizeGame25a(olya, '25c', TITLE, ['Кубок 25c', 'Грааль 25c', 'Зірка 25c'], tracking, {
    inLobby: async () => {
      const phone = await samePersonPage25c(olya, 'olyaStore25c', 390, 844);
      track('olyaStore', phone);
      await phone.goto(`${base}/profile/prizes`);
      const row = phone.locator('.prize-list li', { hasText: 'Кубок 25c' });
      await row.waitFor();
      expect(await row.getByRole('button', { name: 'Змінити', ...exact }).count(), 'a reserved prize can be edited').toBe(0);
      await row.getByRole('button', { name: 'Переглянути', ...exact }).click();
      await phone.waitForURL(/\/profile\/prizes\/[^/]+$/);
      const view = phone.locator('.prize-studio');
      await view.getByText('Приз лежить у грі — його можна лише переглянути.', exact).waitFor();
      await view.getByRole('heading', { level: 1, name: 'Перегляд призу', ...exact }).waitFor();
      expect(await view.getByRole('button', { name: 'Зберегти', ...exact }).count(), 'a reserved prize has «Зберегти»').toBe(0);
      expect(await view.getByRole('tab').count(), 'a reserved prize has tools').toBe(0);
      await view.locator('canvas.trophy-canvas').waitFor();
      await expect.poll(() => view.locator('.trophy-fallback').count(), POLL).toBe(0);
      await shot(phone, 'p25c-studio-readonly');
      await click(phone, 'Назад');
      await phone.waitForURL(/\/profile\/prizes$/);
      await phone.close();
      pages.delete('olyaStore25c');
    },
  });

  const ceremony = stage.locator('.ceremony');
  const first = ceremony.locator('.podium-col.is-place-1.is-shown');
  await first.waitFor({ timeout: 25_000 });
  expect(await first.locator('.podium-name').textContent()).toBe('Петро');
  await expect.poll(() => ceremony.locator('.trophy-fallback').count(), POLL).toBe(0);
  const stageCup = first.locator('canvas.trophy-canvas');
  await expect.poll(() => stageCup.getAttribute('data-appearance'), { timeout: 10_000 }).toBe('drop:done');
  expect(await stageCup.getAttribute('data-decor')).toBe(studioDecor);
  expect(await stageCup.getAttribute('data-effect')).toBe('glow:animated');
  expect(await first.locator('.engraving').textContent()).toBe('За найкращу гру');
  expect(await stage.evaluate('window.__webglCalls'), 'WebGL contexts on the stage').toBeLessThanOrEqual(2);
  await shot(stage, 'p25c-stage-ceremony');

  const myPrize = petro.locator('section.my-prize');
  await myPrize.getByRole('heading', { name: 'Твій приз', ...exact }).waitFor({ timeout: 25_000 });
  const myCanvas = myPrize.locator('canvas.trophy-canvas');
  await myCanvas.waitFor({ state: 'attached' });
  expect(await myCanvas.getAttribute('data-decor')).toBe(studioDecor);

  // ── 13. Вітрина Петра: Оля відкриває публічний профіль — той самий кубок. ──
  const petroId = await myId(petro);
  await olya.setViewportSize({ width: 390, height: 844 });
  await olya.goto(`${base}/profile/${petroId}`);
  await olya.getByRole('heading', { level: 1, name: /Петро/ }).waitFor();
  await olya.locator('section.shelf button.shelf-cup').click();
  const showcase = prizeDialog25a(olya);
  const showcaseCanvas = showcase.locator('canvas.trophy-canvas');
  await showcaseCanvas.waitFor();
  await expect.poll(() => showcase.locator('.trophy-fallback').count(), POLL).toBe(0);
  expect(await showcaseCanvas.getAttribute('data-decor')).toBe(studioDecor);
  expect(await showcaseCanvas.getAttribute('data-effect')).toBe('glow:animated');
  await expect.poll(() => showcaseCanvas.getAttribute('data-appearance'), { timeout: 10_000 }).toBe('drop:done');
  await shot(olya, 'p25c-showcase-viewer');
  await olya.keyboard.press('Escape');
  await showcase.waitFor({ state: 'detached' });

  // Та сама сесія Олі в окремому контексті (без WebGL, «менше руху»).
  const asOlya = async (name: string, options: { reducedMotion?: 'reduce' } = {}) => {
    const page = await open(name, 390, 844, options);
    await page.context().addCookies(await olya.context().cookies());
    track(name, page);
    return page;
  };

  // ── 14. Без WebGL: значок на місці кубка, пояснення над шухлядою, вкладки й поля працюють. ──
  const noGl = await asOlya('nogl25c');
  await noGl.addInitScript(NO_WEBGL_25A);
  await noGl.goto(`${base}/profile/prizes/new`);
  const noGlStudio = noGl.locator('.prize-studio');
  await noGlStudio.getByText('Цей пристрій не показує 3D. Приз збережеться з усім оформленням, а кубок побачать ті, у кого 3D працює.', exact).waitFor();
  expect(await noGlStudio.locator('.trophy-fallback').textContent()).toBe('🏆');
  expect(await noGlStudio.locator('canvas.trophy-canvas').count()).toBe(0);
  await radio(noGl, 'медаль').check();
  await tab(noGl, 'Ефекти').click();
  await radio(noGl, 'Іскри').check();
  await tab(noGl, 'Приз').click();
  await field(noGl, 'Назва').fill('Без 3D 25c');
  expect(await noGl.getByRole('button', { name: 'Зберегти', ...exact }).isDisabled()).toBe(false);
  await shot(noGl, 'p25c-studio-nowebgl');

  // ── 15. «Менше руху»: сяйво стоїть, пояснення видно, «Показати появу» вимкнена. ──
  const calm = await asOlya('calm25c', { reducedMotion: 'reduce' });
  await calm.goto(`${base}/profile/prizes/new`);
  const calmCanvas = calm.locator('.prize-studio canvas.trophy-canvas');
  await calmCanvas.waitFor();
  await tab(calm, 'Ефекти').click();
  await radio(calm, 'Сяйво').check();
  await expect.poll(() => calmCanvas.getAttribute('data-effect'), POLL).toBe('glow:static');
  const calmNote = 'Увімкнено «менше руху»: ефекти стоять, поява не грає.';
  await calm.getByText(calmNote, exact).waitFor();
  await tab(calm, 'Поява').click();
  expect(await calm.getByRole('button', { name: 'Показати появу', ...exact }).isDisabled()).toBe(true);
  await calm.getByText(calmNote, exact).waitFor();

  // ── 16. Арабська: шухляда дзеркальна, перша вкладка праворуч, без бокового скролу на 360. ──
  expect((await olya.request.put(`${base}/api/me/locale`, { data: { locale: 'ar' } })).status()).toBe(200);
  await olya.setViewportSize({ width: 360, height: 800 });
  await olya.goto(`${base}/profile/prizes/new`);
  await expect.poll(() => htmlLang(olya), POLL).toBe('ar');
  expect(await olya.evaluate('document.dir')).toBe('rtl');
  const arTabs = olya.locator('.prize-studio').getByRole('tab');
  expect(await arTabs.count()).toBe(6);
  const firstTab = (await arTabs.first().boundingBox())!;
  const lastTab = (await arTabs.last().boundingBox())!;
  expect(firstTab.x, 'the first tab is right of the last').toBeGreaterThan(lastTab.x);
  await olya.locator('.prize-studio canvas.trophy-canvas').waitFor();
  await expectNoSideScroll(olya, 'p25c-studio-ar');
  expect((await olya.request.put(`${base}/api/me/locale`, { data: { locale: 'uk' } })).status()).toBe(200);

  // ── 17. Запечені сімейні фото грааля ніде не вантажились; без помилок. ──
  for (const [name, list] of [...requests, ['olya studio', studioRequests] as const])
    expect(list.filter((url) => url.includes('grail-family.glb')), `${name} loaded the family grail`).toEqual([]);
  expect(problems).toEqual([]);
}

it('part 25d: trophy decor on the surface — Оля makes a cup with three photos on the ring, a back inscription that moves to the base back, a base band on the plinth face and stickers on the left and the base right, and a second cup with a medallion where the front sticker added first moves to the left; the studio says where things went and the sticker dialog shows only free places; both saved cups reopen with the same decor; a decorated grail, crown and star show their medallion, band, plaque and stickers on free places; screenshots from the front, the side and the back', async () => {
  try {
    await trophyDecals25d();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

async function trophyDecals25d() {
  // Кільце фото займає всю чашу: наліпка «Ліворуч» з першого кубка переїжджає на «Основа ліворуч».
  const RING_DECOR = 'photos:ring:3;inscriptions:band,plaque,back>base-back;stickers:left>base-left,base-right';
  const MEDALLION_DECOR = 'photos:medallion:1;stickers:front>left';
  const nya = STICKERS.filter((sticker) => sticker.series === 'nya');
  const [firstNya, secondNya] = [nya[0]!, nya[1]!];

  const olya = await open('olya25d', 1280, 800, { reducedMotion: 'reduce' });
  await register(olya, 'menu', 'Оля', 'olya25d@example.com');
  const studio = olya.locator('.prize-studio');
  const studioCanvas = studio.locator('canvas.trophy-canvas');
  const tab = (name: string) => studio.getByRole('tab', { name, ...exact });
  const radio = (name: string) => studio.getByRole('radio', { name, ...exact });
  const stickerRow = (where: string) => studio.locator('.studio-sticker-row', { has: olya.getByText(where, exact) });

  /** «+ Додати наліпку» → наліпка → вільне місце → «Готово». */
  const addSticker = async (id: string, place: string) => {
    await studio.getByRole('button', { name: '+ Додати наліпку', ...exact }).click();
    const dialog = olya.getByRole('dialog', { name: 'Нова наліпка', ...exact });
    await dialog.getByRole('button', { name: id, ...exact }).click();
    await dialog.getByRole('radio', { name: place, ...exact }).check();
    await dialog.getByRole('button', { name: 'Готово', ...exact }).click();
    await dialog.waitFor({ state: 'detached' });
  };

  /** Полотно студії спереду, збоку (90°) і, якщо треба, ззаду (180°): ArrowRight на полотні — 15°. Лише з E2E_SHOTS=1. */
  const threeSides = async (prefix: string, sides: readonly ('side' | 'back')[] = ['side', 'back']) => {
    if (process.env.E2E_SHOTS !== '1') return;
    // Декалі, фото й шрифти вантажаться після моделі: кадр — коли все намальовано.
    await olya.waitForTimeout(2500);
    mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
    const save = (name: string) => studioCanvas.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`) });
    await save(`${prefix}-front`);
    await studioCanvas.focus();
    for (const side of sides) {
      for (let step = 0; step < 6; step++) await studioCanvas.press('ArrowRight');
      await olya.waitForTimeout(400);
      await save(`${prefix}-${side}`);
    }
  };

  // ── 1. Перший кубок: золото, наліпки «Ліворуч» і «Основа праворуч» через вікно наліпок. ──
  await openProfileTile(olya, 'Призи');
  await olya.waitForURL(/\/profile\/prizes$/);
  await click(olya, 'Новий приз');
  await olya.waitForURL(/\/profile\/prizes\/new$/);
  await studioCanvas.waitFor();
  await expect.poll(() => studio.locator('.trophy-fallback').count(), POLL).toBe(0);
  await radio('кубок').check();
  await radio('Золото').check();
  await addSticker(firstNya.id, 'Ліворуч');
  await addSticker(secondNya.id, 'Основа праворуч');
  await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe('photos:none;stickers:left,base-right');

  // ── 2. Три намальовані PNG на кільце: наліпка з чаші переїжджає, і список це каже. ──
  await tab('Фото').click();
  await radio('Кільце по чаші').check();
  await studio.locator('.studio-photo-add input[type="file"]').setInputFiles(await drawnPngs25c(olya, ['#d23c3c', '#2f9e44', '#1c64d8']));
  await studio.getByText('3 з 16', exact).waitFor();
  await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe('photos:ring:3;stickers:left>base-left,base-right');

  // ── 3. Написи «Поясок», «Табличка», «Зворот»: зворот переїжджає на задню грань основи. ──
  await tab('Написи').click();
  const textPlace = (name: string) => studio.locator('fieldset.studio-text').filter({ has: olya.getByRole('checkbox', { name, ...exact }) });
  for (const [place, text] of [
    ['Зворот', 'Від усієї родини'],
    ['Поясок', 'Чемпіонка'],
    ['Табличка', 'Оля 2026'],
  ] as const) {
    const part = textPlace(place);
    await part.getByRole('checkbox', { name: place, ...exact }).check();
    await part.getByLabel('Текст', exact).fill(text);
  }
  await textPlace('Зворот').getByText('Місце «Зворот» зайняте (Кільце по чаші), тому тут: «Зворот основи».', exact).waitFor();
  await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe(RING_DECOR);
  await threeSides('p25d-ring');

  // ── 4. Наліпки: рядок переїхалої каже, куди й чому. ──
  await tab('Форма').click();
  await stickerRow('Основа ліворуч').getByText('Місце «Ліворуч» зайняте (Кільце по чаші), тому тут: «Основа ліворуч».', exact).waitFor();
  await stickerRow('Основа праворуч').waitFor();
  await shot(olya, 'p25d-ring-studio');

  await tab('Приз').click();
  await field(olya, 'Назва').fill('Кубок з кільцем 25d');
  await click(olya, 'Зберегти');
  await olya.waitForURL(/\/profile\/prizes$/);
  await olya.locator('.prize-list li', { hasText: 'Кубок з кільцем 25d' }).waitFor();

  // ── 5. Другий кубок: спершу наліпка «Спереду», потім медальйон — наліпка переїжджає ліворуч. ──
  await click(olya, 'Новий приз');
  await olya.waitForURL(/\/profile\/prizes\/new$/);
  await studioCanvas.waitFor();
  await radio('кубок').check();
  await addSticker(firstNya.id, 'Спереду');
  await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe('photos:none;stickers:front');
  await tab('Фото').click();
  await radio('Медальйон спереду').check();
  await studio.locator('.studio-photo-add input[type="file"]').setInputFiles(await drawnPngs25c(olya, ['#d4a017']));
  await studio.getByText('1 з 1', exact).waitFor();
  await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe(MEDALLION_DECOR);
  // Вкладка «Фото» теж каже, що медальйон посунув наліпку.
  await studio.getByText('Місце «Спереду» зайняте (Медальйон спереду), тому тут: «Ліворуч».', exact).waitFor();
  await tab('Форма').click();
  await stickerRow('Ліворуч').getByText('Місце «Спереду» зайняте (Медальйон спереду), тому тут: «Ліворуч».', exact).waitFor();

  // ── 6. Вікно нової наліпки: «Спереду» і «Ліворуч» зайняті й вимкнені з поясненням, решта вільні. ──
  await studio.getByRole('button', { name: '+ Додати наліпку', ...exact }).click();
  const dialog = olya.getByRole('dialog', { name: 'Нова наліпка', ...exact });
  await dialog.waitFor();
  const place = (name: string) => dialog.locator('.sticker-dialog-places label', { has: olya.locator('.sticker-dialog-place', { hasText: new RegExp(`^${name}$`) }) });
  for (const [name, by] of [
    ['Спереду', 'Медальйон спереду'],
    ['Ліворуч', 'наліпка'],
  ] as const) {
    expect(await place(name).locator('input').isDisabled(), `${name} is taken`).toBe(true);
    expect(await place(name).locator('.sticker-dialog-taken').textContent()).toBe(`Зайнято: ${by}`);
  }
  for (const name of ['Ззаду', 'Праворуч', 'Основа ліворуч', 'Основа праворуч']) {
    expect(await place(name).locator('input').isDisabled(), `${name} is free`).toBe(false);
    expect(await place(name).locator('.sticker-dialog-taken').count()).toBe(0);
  }
  await shot(olya, 'p25d-medallion-dialog');
  await dialog.getByRole('button', { name: 'Скасувати', ...exact }).click();
  await dialog.waitFor({ state: 'detached' });
  expect(await studioCanvas.getAttribute('data-decor')).toBe(MEDALLION_DECOR);
  await threeSides('p25d-medallion');

  await tab('Приз').click();
  await field(olya, 'Назва').fill('Кубок з медальйоном 25d');
  await click(olya, 'Зберегти');
  await olya.waitForURL(/\/profile\/prizes$/);
  await olya.locator('.prize-list li', { hasText: 'Кубок з медальйоном 25d' }).waitFor();

  // ── 7. Збережене відкривається з тим самим оформленням (вільний приз на складі відкривають «Змінити»). ──
  type Item = { id: string; content: PrizeContent };
  const store = (await (await olya.request.get(`${base}/api/me/prizes`)).json()) as Item[];
  const ring = store.find((item) => item.content.name === 'Кубок з кільцем 25d')!.content.trophy!.decor!;
  expect(ring.stickers).toEqual([
    { id: firstNya.id, place: 'left' },
    { id: secondNya.id, place: 'base-right' },
  ]);
  expect(ring.inscriptions.map((i) => i.place)).toEqual(['band', 'plaque', 'back']);
  const medallion = store.find((item) => item.content.name === 'Кубок з медальйоном 25d')!.content.trophy!.decor!;
  expect(medallion.stickers).toEqual([{ id: firstNya.id, place: 'front' }]);
  for (const [name, decor] of [
    ['Кубок з кільцем 25d', RING_DECOR],
    ['Кубок з медальйоном 25d', MEDALLION_DECOR],
  ] as const) {
    await olya.locator('.prize-list li', { hasText: name }).getByRole('button', { name: 'Змінити', ...exact }).click();
    await olya.waitForURL(/\/profile\/prizes\/[^/]+$/);
    await studioCanvas.waitFor();
    await expect.poll(() => studio.locator('.trophy-fallback').count(), POLL).toBe(0);
    await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe(decor);
    await click(olya, 'Скасувати');
    await olya.waitForURL(/\/profile\/prizes$/);
  }

  // ── 8. Грааль, корона й зірка з медальйоном, поясками, табличками й наліпками на вільних місцях: знімки спереду й збоку. ──
  for (const { kind, prefix, texts, places, decor } of [
    {
      kind: 'грааль',
      prefix: 'p25d-grail',
      texts: [['Поясок', 'Родина'], ['Табличка', 'Ася 2026']],
      places: ['Ліворуч', 'Ззаду'],
      decor: 'photos:medallion:1;inscriptions:band,plaque;stickers:back,left',
    },
    {
      kind: 'корона',
      prefix: 'p25d-crown',
      texts: [['Поясок', 'Королева'], ['Табличка', 'Оля']],
      places: ['Ліворуч', 'Основа ліворуч'],
      decor: 'photos:medallion:1;inscriptions:band,plaque;stickers:left,base-left',
    },
    {
      kind: 'зірка',
      prefix: 'p25d-star',
      texts: [['Табличка', 'Зірка вечора'], ['Зворот', 'Від Олі']],
      places: ['Основа ліворуч', 'Основа праворуч'],
      decor: 'photos:medallion:1;inscriptions:plaque,back;stickers:base-left,base-right',
    },
  ] as const) {
    await click(olya, 'Новий приз');
    await olya.waitForURL(/\/profile\/prizes\/new$/);
    await studioCanvas.waitFor();
    await radio(kind).check();
    await tab('Фото').click();
    await radio('Медальйон спереду').check();
    await studio.locator('.studio-photo-add input[type="file"]').setInputFiles(await drawnPngs25c(olya, ['#7b2cbf']));
    await studio.getByText('1 з 1', exact).waitFor();
    await tab('Написи').click();
    for (const [place, text] of texts) {
      const part = textPlace(place);
      await part.getByRole('checkbox', { name: place, ...exact }).check();
      await part.getByLabel('Текст', exact).fill(text);
    }
    await tab('Форма').click();
    await addSticker(firstNya.id, places[0]);
    await addSticker(secondNya.id, places[1]);
    await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe(decor);
    await threeSides(prefix, ['side']);
    // Не зберігаємо: «Скасувати» питає, і відповідь — так.
    await click(olya, 'Скасувати');
    await olya.waitForURL(/\/profile\/prizes$/);
  }

  expect(problems).toEqual([]);
}

it('part 25e: new trophy shapes and materials — at level 1 Оля sees the plate locked «з рівня 24» and the diadem marked premium, the server refuses a locked plate; at level 30 she builds every new shape in gold and every new material on a cup, saves a neon laurel wreath with a plaque and a base sticker (a wreath has no front place) that shows the same in the prize viewer; contact sheets of all shapes and materials', async () => {
  try {
    await trophyShapes25e();
  } catch (error) {
    await snapshot();
    throw error;
  }
});

/** Нові форми 25e: назва в редакторі й рід (для «Золотий» / «Золота»). */
const SHAPES_25E: Record<string, { name: string; gender: 'm' | 'f' }> = {
  lovingcup: { name: 'кубок з вухами', gender: 'm' },
  vase: { name: 'ваза', gender: 'f' },
  plate: { name: 'тарілка-трофей', gender: 'f' },
  goblet: { name: 'келих', gender: 'm' },
  starmedal: { name: 'медаль-зірка', gender: 'f' },
  cross: { name: 'хрест', gender: 'm' },
  octagon: { name: 'восьмикутна медаль', gender: 'f' },
  ribbon: { name: 'медаль на стрічці', gender: 'f' },
  diadem: { name: 'діадема', gender: 'f' },
  laurel: { name: 'лавровий вінок', gender: 'm' },
  olive: { name: 'оливковий вінок', gender: 'm' },
  figure: { name: 'фігурка на постаменті', gender: 'f' },
  flame: { name: 'вогонь', gender: 'm' },
  wings: { name: 'крилата статуетка', gender: 'f' },
  fist: { name: 'кулак', gender: 'm' },
};
/** Нові матеріали 25e: назва в редакторі й прикметник чоловічого роду (для «… кубок»). */
const MATERIALS_25E: Record<string, { name: string; male: string }> = {
  rosegold: { name: 'Рожеве золото', male: 'Рожевозолотий' },
  platinum: { name: 'Платина', male: 'Платиновий' },
  copper: { name: 'Мідь', male: 'Мідний' },
  obsidian: { name: 'Обсидіан', male: 'Обсидіановий' },
  jade: { name: 'Нефрит', male: 'Нефритовий' },
  pearl: { name: 'Перламутр', male: 'Перламутровий' },
  ruby: { name: 'Рубін', male: 'Рубіновий' },
  sapphire: { name: 'Сапфір', male: 'Сапфіровий' },
  neon: { name: 'Неон', male: 'Неоновий' },
  marble: { name: 'Мармур', male: 'Мармуровий' },
  wood: { name: 'Дерево', male: 'Дерев’яний' },
};

/** Контактний аркуш: сітка 5 стовпців зі знімків (data: URL, без мережі) на світлому тлі. */
function contactSheet25e(title: string, frames: readonly { id: string; png: Buffer }[]): string {
  const figures = frames
    .map(({ id, png }) => `<figure><img src="data:image/png;base64,${png.toString('base64')}" alt="${id}"><figcaption>${id}</figcaption></figure>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body { margin: 0; padding: 16px; background: #f4f1ea; font: 16px/1.3 sans-serif; color: #222; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
    figure { margin: 0; background: #fff; border: 1px solid #ccc; padding: 6px; }
    img { display: block; inline-size: 100%; block-size: auto; }
    figcaption { text-align: center; padding-block-start: 4px; font-weight: 600; }
  </style></head><body><h1>${title}</h1><div class="grid">${figures}</div></body></html>`;
}

async function trophyShapes25e() {
  const NEW_KINDS = TROPHY_KINDS.slice(6);
  const NEW_MATERIALS = TROPHY_MATERIALS.slice(4);
  expect(Object.keys(SHAPES_25E).sort()).toEqual([...NEW_KINDS].sort());
  expect(Object.keys(MATERIALS_25E).sort()).toEqual([...NEW_MATERIALS].sort());
  const nya = STICKERS.find((sticker) => sticker.series === 'nya')!;

  const olya = await open('olya25e', 1280, 800, { reducedMotion: 'reduce' });
  // Шейдери мармуру й дерева та світіння неону компілюються в справжньому GL: жодних помилок і попереджень GL чи three.
  // Виняток — примітки компілятора HLSL під ANGLE (Windows, D3D) «warning X4122 … double precision» про сталі вбудованих
  // шейдерів three: програма зібрана, це не помилка; будь-який інший рядок журналу програми — проблема.
  const glProblems: string[] = [];
  const hlslNotes = (text: string) =>
    /^THREE\.WebGLProgram: Program Info Log:/.test(text) &&
    text
      .replace(/^THREE\.WebGLProgram: Program Info Log:/, '')
      .split('\n')
      .every((line) => line.trim() === '' || /^\s*\(\d+,[\d-]+\): warning X4122: /.test(line));
  olya.on('console', (message) => {
    const text = message.text();
    if ((message.type() === 'error' || message.type() === 'warning') && /THREE\.|shader|WebGL|GL_INVALID/i.test(text) && !hlslNotes(text)) glProblems.push(text);
  });
  await register(olya, 'menu', 'Оля', 'olya25e@example.com');
  const olyaId = await myId(olya);
  const studio = olya.locator('.prize-studio');
  const studioCanvas = studio.locator('canvas.trophy-canvas');
  const tab = (name: string) => studio.getByRole('tab', { name, ...exact });
  /** Плитка форми чи матеріалу: назва, далі можуть іти «🔒 з рівня N» і «преміум». */
  const tileName = (name: string) => new RegExp(`^${name}(\\s*,\\s*🔒 з рівня \\d+)?(\\s*,\\s*преміум)?$`);
  const radio = (name: string) => studio.getByRole('radio', { name: tileName(name) });
  // has: — локатор від сторінки, бо внутрішній шукається всередині label.
  const tile = (name: string) => studio.locator('.studio-tiles label', { has: olya.getByRole('radio', { name: tileName(name) }) });
  const textPlace = (name: string) => studio.locator('fieldset.studio-text').filter({ has: olya.getByRole('checkbox', { name, ...exact }) });
  type Item = { id: string; content: PrizeContent };
  const store = async () => (await (await olya.request.get(`${base}/api/me/prizes`)).json()) as Item[];
  const newPrize = async () => {
    await click(olya, 'Новий приз');
    await olya.waitForURL(/\/profile\/prizes\/new$/);
    await studioCanvas.waitFor();
    await expect.poll(() => studio.locator('.trophy-fallback').count(), POLL).toBe(0);
  };
  const save = async (name: string) => {
    await tab('Приз').click();
    await field(olya, 'Назва').fill(name);
    await click(olya, 'Зберегти');
    await olya.waitForURL(/\/profile\/prizes$/);
    await olya.locator('.prize-list li', { hasText: name }).waitFor();
  };

  // ── 1. Рівень 1: тарілка закрита «з рівня 24», діадема закрита й «преміум», нові матеріали закриті; старі відкриті. ──
  await openProfileTile(olya, 'Призи');
  await olya.waitForURL(/\/profile\/prizes$/);
  await newPrize();
  const cups = studio.locator('fieldset.studio-tiles', { has: olya.locator('legend', { hasText: /^Кубки$/ }) });
  await cups.waitFor();
  const plate = cups.locator('label', { has: olya.getByRole('radio', { name: tileName('тарілка-трофей') }) });
  expect(await plate.locator('input').isDisabled(), 'the plate is open at level 1').toBe(true);
  expect(await plate.locator('.look-lock').textContent()).toBe('🔒 з рівня 24');
  const diadem = tile('діадема');
  expect(await diadem.locator('.studio-premium').textContent()).toBe('преміум');
  expect(await diadem.locator('.look-lock').textContent()).toBe('🔒 з рівня 22');
  for (const legend of ['Кубки', 'Медалі', 'Корони й вінки', 'Статуетки', 'Метали', 'Камені', 'Інше'])
    await studio.locator('fieldset.studio-tiles > legend', { hasText: new RegExp(`^${legend}$`) }).waitFor();
  for (const kind of NEW_KINDS) expect(await tile(SHAPES_25E[kind]!.name).locator('input').isDisabled(), `${kind} at level 1`).toBe(true);
  for (const material of NEW_MATERIALS) expect(await tile(MATERIALS_25E[material]!.name).locator('input').isDisabled(), `${material} at level 1`).toBe(true);
  expect(await tile('Неон').locator('.studio-premium').textContent()).toBe('преміум');
  for (const name of ['кубок', 'медаль', 'корона', 'зірка', 'статуетка', 'грааль', 'Бронза', 'Срібло', 'Золото', 'Діамант'])
    expect(await tile(name).locator('input').isDisabled(), `${name} at level 1`).toBe(false);
  await shot(olya, 'p25e-picker-level1');

  // Вибір на вузьких телефонах: жодна плитка не виходить за край і не обрізає текст.
  for (const [width, height] of [[320, 568], [375, 667]] as const) {
    await olya.setViewportSize({ width, height });
    expect(await noSideScroll(olya), `studio ${width}×${height}: horizontal scroll`).toBe(true);
    const clipped = (await olya.evaluate(
      `[...document.querySelectorAll('.prize-studio .studio-tiles label')].filter((label) => label.scrollWidth > label.clientWidth + 1 || label.getBoundingClientRect().right > innerWidth + 0.5).map((label) => label.textContent)`,
    )) as string[];
    expect(clipped, `studio ${width}×${height}: clipped tiles`).toEqual([]);
    await cups.scrollIntoViewIfNeeded();
    await shot(olya, `p25e-picker-${width}-shapes`);
    await tile('Неон').scrollIntoViewIfNeeded();
    await shot(olya, `p25e-picker-${width}-materials`);
  }
  await olya.setViewportSize({ width: 1280, height: 800 });

  // ── 2. Сервер: закриті тарілка й неон — 409 trophy_locked, навіть без decor. ──
  for (const trophy of [
    { kind: 'plate', material: 'gold' },
    { kind: 'cup', material: 'neon' },
  ] as const) {
    const locked = await olya.request.post(`${base}/api/me/prizes`, { data: prize25a('Закрите 25e', trophy) });
    expect(locked.status(), await locked.text()).toBe(409);
    expect(await locked.json()).toEqual({ error: 'trophy_locked' });
  }

  // ── 3. Старий приз до рівня 30: золотий кубок з табличкою. ──
  await radio('кубок').check();
  await radio('Золото').check();
  await tab('Написи').click();
  await textPlace('Табличка').getByRole('checkbox', { name: 'Табличка', ...exact }).check();
  await textPlace('Табличка').getByLabel('Текст', exact).fill('Чемпіонка');
  await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe('photos:none;inscriptions:plaque');
  await save('Кубок 25e');

  // ── 4. Рівень 30: усе відкрито, сервер приймає тарілку. ──
  await db.insert(xpEntry).values({ userId: olyaId, source: 'game', gameId: randomUUID(), amount: xpForLevel(30), day: kyivDay(new Date()), at: new Date(), createdAt: new Date() });
  const open30 = await olya.request.post(`${base}/api/me/prizes`, { data: prize25a('Тарілка 25e', { kind: 'plate', material: 'gold' }) });
  expect(open30.status(), await open30.text()).toBe(201);
  await olya.reload();
  await olya.locator('.prize-list li', { hasText: 'Тарілка 25e' }).waitFor();
  await newPrize();
  expect(await studio.locator('.studio-tiles label.is-locked').count(), 'locked tiles at level 30').toBe(0);
  expect(await diadem.locator('.studio-premium').textContent()).toBe('преміум');
  await shot(olya, 'p25e-picker-level30');

  /** Знімок полотна студії, коли рушій поставив вигляд із цим підписом і намалював кадр. */
  const frame = async (label: string, file: string): Promise<Buffer> => {
    await expect.poll(() => studioCanvas.getAttribute('aria-label'), { timeout: 10_000 }).toBe(label);
    expect(await studio.locator('.trophy-fallback').count()).toBe(0);
    await olya.waitForTimeout(600);
    const png = await studioCanvas.screenshot();
    if (process.env.E2E_SHOTS === '1') {
      mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
      writeFileSync(resolve(ARTIFACTS, 'shots', `${file}.png`), png);
    }
    return png;
  };

  // ── 5. Кожна нова форма в золоті. ──
  await radio('Золото').check();
  const shapes: { id: string; png: Buffer }[] = [];
  for (const kind of NEW_KINDS) {
    const { name, gender } = SHAPES_25E[kind]!;
    await radio(name).check();
    shapes.push({ id: kind, png: await frame(`${gender === 'm' ? 'Золотий' : 'Золота'} ${name}`, `p25e-shape-${kind}`) });
  }
  expect(new Set(shapes.map(({ png }) => png.toString('base64'))).size, 'every shape draws its own picture').toBe(NEW_KINDS.length);

  // ── 6. Кожен новий матеріал на кубку. ──
  await radio('кубок').check();
  const materials: { id: string; png: Buffer }[] = [];
  for (const material of NEW_MATERIALS) {
    const { name, male } = MATERIALS_25E[material]!;
    await radio(name).check();
    materials.push({ id: material, png: await frame(`${male} кубок`, `p25e-material-${material}`) });
  }
  expect(new Set(materials.map(({ png }) => png.toString('base64'))).size, 'every material draws its own picture').toBe(NEW_MATERIALS.length);
  expect(glProblems, 'WebGL or shader messages').toEqual([]);

  // ── 7. Контактні аркуші: усі форми й усі матеріали на одній сторінці. ──
  const sheet = await open('sheet25e', 1280, 800);
  for (const [name, title, frames] of [
    ['p25e-contact-shapes', 'Нові форми 25e (золото)', shapes],
    ['p25e-contact-materials', 'Нові матеріали 25e (кубок)', materials],
  ] as const) {
    await sheet.setContent(contactSheet25e(title, frames));
    await sheet.waitForFunction(`[...document.images].every((img) => img.complete && img.naturalWidth > 0)`);
    expect(await sheet.locator('figure').count()).toBe(frames.length);
    await shot(sheet, name);
  }
  await sheet.close();
  pages.delete('sheet25e');

  // ── 8. Неоновий лавровий вінок з табличкою й наліпкою спереду. ──
  // Вінки не мають місця «Спереду» (8b8ddf1: на гілці воно завбільшки з цятку): наліпка — на основі ліворуч.
  const WREATH_DECOR = 'photos:none;inscriptions:plaque;stickers:base-left';
  await radio('лавровий вінок').check();
  await radio('Неон').check();
  await tab('Написи').click();
  await textPlace('Табличка').getByRole('checkbox', { name: 'Табличка', ...exact }).check();
  await textPlace('Табличка').getByLabel('Текст', exact).fill('Оля 2026');
  await tab('Форма').click();
  await studio.getByRole('button', { name: '+ Додати наліпку', ...exact }).click();
  const dialog = olya.getByRole('dialog', { name: 'Нова наліпка', ...exact });
  await dialog.getByRole('button', { name: nya.id, ...exact }).click();
  expect(await dialog.getByRole('radio', { name: 'Спереду', ...exact }).count(), 'a wreath offers a front sticker').toBe(0);
  await dialog.getByRole('radio', { name: 'Основа ліворуч', ...exact }).check();
  await dialog.getByRole('button', { name: 'Готово', ...exact }).click();
  await dialog.waitFor({ state: 'detached' });
  await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe(WREATH_DECOR);
  await frame('Неоновий лавровий вінок', 'p25e-wreath-studio');
  await save('Вінок 25e');
  const wreath = (await store()).find((item) => item.content.name === 'Вінок 25e')!.content.trophy!;
  expect([wreath.kind, wreath.material]).toEqual(['laurel', 'neon']);
  expect(wreath.decor!.stickers).toEqual([{ id: nya.id, place: 'base-left' }]);
  expect(wreath.decor!.inscriptions.map((i) => i.place)).toEqual(['plaque']);

  // ── 9. Переглядач: вінок і старий кубок відкриваються з тим самим оформленням і підписом. ──
  for (const [name, decor, label] of [
    ['Вінок 25e', WREATH_DECOR, 'Неоновий лавровий вінок'],
    ['Кубок 25e', 'photos:none;inscriptions:plaque', 'Золотий кубок'],
  ] as const) {
    const row = olya.locator('.prize-list li', { hasText: name });
    expect(await row.locator('.meta').textContent()).toContain(label);
    await row.getByRole('button', { name: 'Змінити', ...exact }).click();
    await olya.waitForURL(/\/profile\/prizes\/[^/]+$/);
    await studioCanvas.waitFor();
    await expect.poll(() => studio.locator('.trophy-fallback').count(), POLL).toBe(0);
    await expect.poll(() => studioCanvas.getAttribute('data-decor'), POLL).toBe(decor);
    expect(await studioCanvas.getAttribute('aria-label')).toBe(label);
    await click(olya, 'Скасувати');
    await olya.waitForURL(/\/profile\/prizes$/);
  }

  expect(glProblems, 'WebGL or shader messages').toEqual([]);
  expect(problems).toEqual([]);
}
