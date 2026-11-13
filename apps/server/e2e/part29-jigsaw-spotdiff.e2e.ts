import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { classicRound, makeRoundsQuiz, puzzlesRound, single, withId } from '@quiz/engine/testing';
import { jigsawTabs } from '@quiz/shared';
import { type BrowserContext, type Page } from 'playwright-core';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, field, questionText, join, expectNoSideScroll, register, POLL, socketFrames, RESTARTING_TEXT, NL, pickTeamOn, stageTeam, sleep, frame, stateViews, step27a, next27a, phoneScore27a, select27b, toWinners27c, reveal28a, done28d, png29d } from './helpers/common';
import { exact, base, problems, pages, ARTIFACTS, snapshot, afterSplash, shot, restart, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 29c, 29d, 29i (пазл на 320 px): пазл і знайди відмінності.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 29c: jigsaw after a classic round — upload and crop in the editor, taps turn, drags snap, the fastest gets the maximum, 320 px', async () => {
  try {
    await jigsawGame29c();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 29c: jigsaw in teams — one shared puzzle, a held piece is locked for two seconds, the stage shows member colours, a restart keeps the pieces', async () => {
  try {
    await jigsawTeams29c();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 29c: jigsaw with 24 players — the stage thumbnails fit 1600×900', async () => {
  const sockets: Socket[] = [];
  try {
    await jigsawCrowd29c(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

type Grid29c = { rows: number; cols: number };
type StoredJigsaw29c = { type: 'jigsaw'; imageUrl: string | null; photo: string; aspect: string; focus: { x: number; y: number }; rows: number; cols: number; seed: number; tabs: string; preview: boolean; timeLimit: number; points: number };
type Via29c = 'mouse' | 'touch';

/**
 * Синтетичне фото для пазла (жодних справжніх фото): шість кольорових секторів навколо центру, світліші догори, з білими кільцями —
 * кожен шматочок вирізняється. PNG, як avatarPng.
 */
function sectorsPng29c(width: number, height: number): Buffer {
  const hsl = (h: number, s: number, l: number) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  };
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const [cx, cy] = [width * 0.55, height * 0.45];
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const angle = (Math.atan2(y - cy, x - cx) / (2 * Math.PI) + 1) % 1;
      const ring = Math.hypot(x - cx, y - cy) % 70 < 5;
      const [r, g, b] = ring ? [245, 245, 240] : hsl(Math.floor(angle * 6) * 60 + ((angle * 360) % 60) / 2, 0.75, 0.3 + 0.4 * (1 - y / height));
      const at = y * (width * 3 + 1) + 1 + x * 3;
      [raw[at], raw[at + 1], raw[at + 2]] = [r!, g!, b!];
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Фото 800 × 450 (16:9) у полі «Пазла» редактора: загальне завантаження, потім рамка кадру над картинкою. */
async function uploadPhoto29c(page: Page) {
  await page.locator('.jigsaw-editor input[type="file"]').setInputFiles({ name: 'sectors.png', mimeType: 'image/png', buffer: sectorsPng29c(800, 450) });
  await page.locator('.jigsaw-editor-crop img').waitFor();
  await expect.poll(() => page.locator('.jigsaw-editor-crop img').evaluate((img) => (img as HTMLImageElement).naturalWidth), POLL).toBe(800);
}

/** Те саме фото через API завантажень (для вікторин, зібраних без редактора): адреса /uploads/…. */
async function apiPhoto29c(page: Page): Promise<string> {
  const response = await page.request.post(`${base}/api/uploads`, { data: sectorsPng29c(800, 450), headers: { 'content-type': 'image/png' } });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { url: string }).url;
}

/** «Пазл» для API: rows × cols, 4:3, виступи з seed 29, готова картинка поруч. */
function jigsaw29c(id: string, rows: number, cols: number, timeLimit: number, photo: string) {
  return { id, text: 'Складіть пазл', imageUrl: null, video: null, timeLimit, points: 300, type: 'jigsaw' as const, photo, aspect: '4:3' as const, focus: { x: 0.5, y: 0.5 }, rows, cols, seed: 29, tabs: jigsawTabs(rows, cols, 29), preview: true };
}

/** Ще не поставлений шматочок k на телефоні (у купці чи на рамці). */
const loose29c = (page: Page, k: number) => page.locator(`.jigsaw-play .jigsaw-piece.is-loose[data-piece="${k}"]`);
/** Поставлений шматочок k у рамці телефона. */
const placed29c = (page: Page, k: number) => page.locator(`.jigsaw-play .jigsaw-frame .jigsaw-piece.is-placed[data-piece="${k}"]`);
const placedCount29c = (page: Page) => page.locator('.jigsaw-play .jigsaw-frame .jigsaw-piece.is-placed').count();
/** Мініатюра дошки на сцені чи пульті за ім'ям. */
const thumb29c = (page: Page, scope: string, name: string) => page.locator(`${scope} .jigsaw-thumb`, { has: page.locator('.puzzle-thumb-name', { hasText: new RegExp(`^${name}$`) }) });
/** Дошки «Пазла» з останнього кадру сокета, де вони є (сцена). */
const jigsawBoards29c = (frames: string[]) => stateViews(frames).reverse().find((view) => view.jigsaw !== undefined)!.jigsaw!.boards;

/** Центр шматочка на екрані: спершу прокручує його у видиму частину купки; у цій точці під пальцем — саме він. */
async function pieceCenter29c(page: Page, k: number): Promise<{ x: number; y: number }> {
  const piece = loose29c(page, k);
  await piece.evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }));
  // Купка щойно могла перескладатися (товариш поставив шматочок): місце беремо, коли воно двічі поспіль те саме і під ним саме цей шматочок.
  let at = { x: NaN, y: NaN };
  await expect
    .poll(async () => {
      const box = (await piece.boundingBox())!;
      const next = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const still = Math.abs(next.x - at.x) < 0.5 && Math.abs(next.y - at.y) < 0.5;
      at = next;
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('[data-piece]')?.getAttribute('data-piece') ?? null, [at.x, at.y]);
      return still && hit === String(k);
    }, { ...POLL, interval: 60 })
    .toBe(true);
  return at;
}

/** Точка екрана, куди відпустити шматочок, щоб лівий верхній кут його ядра ліг у (x, y) клітинок рамки (палець — у центрі шматочка). */
async function cellPoint29c(page: Page, grid: Grid29c, to: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const frame = (await page.locator('.jigsaw-play .jigsaw-frame').boundingBox())!;
  const point = { x: frame.x + ((to.x + 0.5) * frame.width) / grid.cols, y: frame.y + ((to.y + 0.5) * frame.height) / grid.rows };
  const view = page.viewportSize()!;
  expect(point.y, 'the frame cell is on screen').toBeGreaterThanOrEqual(0);
  expect(point.y, 'the frame cell is on screen').toBeLessThanOrEqual(view.height);
  return point;
}

const cdp29c = new WeakMap<Page, Awaited<ReturnType<BrowserContext['newCDPSession']>>>();
/** Дотик через CDP Input.dispatchTouchEvent: Chrome робить з нього pointer-події з pointerType 'touch' (як touchDraw28c). */
async function touch29c(page: Page, points: { x: number; y: number }[]) {
  let cdp = cdp29c.get(page);
  if (cdp === undefined) {
    cdp = await page.context().newCDPSession(page);
    cdp29c.set(page, cdp);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]!] });
  for (const point of points.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    await sleep(8);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Точки від from до to: спершу короткий зсув (більший за поріг тапу), далі рівні кроки. */
function path29c(from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  const points = [from, { x: from.x + 8, y: from.y - 8 }];
  for (let i = 1; i <= steps; i++) points.push({ x: from.x + 8 + ((to.x - from.x - 8) * i) / steps, y: from.y - 8 + ((to.y - from.y + 8) * i) / steps });
  return points;
}

/** Перетягує шматочок k так, щоб лівий верхній кут ядра ліг у (x, y) клітинок рамки: мишею (pointer) чи пальцем (touch). */
async function dragPiece29c(page: Page, grid: Grid29c, k: number, to: { x: number; y: number }, via: Via29c = 'mouse') {
  const from = await pieceCenter29c(page, k);
  const target = await cellPoint29c(page, grid, to);
  if (via === 'touch') return touch29c(page, path29c(from, target));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (const point of path29c(from, target).slice(1)) await page.mouse.move(point.x, point.y);
  await page.mouse.up();
}

/** Тап по шматочку (поворот на 90°). */
async function tapPiece29c(page: Page, k: number, via: Via29c) {
  const at = await pieceCenter29c(page, k);
  if (via === 'touch') await touch29c(page, [at]);
  else await page.mouse.click(at.x, at.y);
}

/** Тапи по шматочку, доки він не стане прямо (data-rot '0'); шматочок на своєму місці від останнього тапу прилипає. */
async function turnUpright29c(page: Page, k: number, via: Via29c = 'mouse') {
  const piece = loose29c(page, k);
  const state = async () => ((await piece.count()) === 0 ? 'placed' : await piece.getAttribute('data-rot'));
  for (let taps = 0; taps < 4; taps++) {
    const rot = await state();
    if (rot === '0' || rot === 'placed') return;
    await tapPiece29c(page, k, via);
    await expect.poll(state, POLL).not.toBe(rot);
  }
  expect(await state(), `piece ${k} after four taps`).toMatch(/^(0|placed)$/);
}

/** Ставить шматочок: тапами прямо, потім перетягуванням на своє місце з невеликим зсувом (менше чверті клітинки); чекає, доки прилипне. */
async function placePiece29c(page: Page, grid: Grid29c, k: number, via: Via29c = 'mouse', nudge = { x: 0.08, y: -0.06 }) {
  await turnUpright29c(page, k, via);
  await dragPiece29c(page, grid, k, { x: (k % grid.cols) + nudge.x, y: Math.floor(k / grid.cols) + nudge.y }, via);
  await placed29c(page, k).waitFor({ timeout: 5000 });
}

/** Сцена 1600 × 900: без прокрутки, кожна мініатюра (і фото й таблиця розкриття) цілком у вікні. */
async function expectJigsawStageFits29c(stage: Page, name: string) {
  const [height, clientH, width, clientW] = (await stage.evaluate(
    '[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]',
  )) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const out = await stage
    .locator('.jigsaw-stage .puzzle-thumb, .jigsaw-stage .jigsaw-stage-photo, .jigsaw-stage .jigsaw-table')
    .evaluateAll((all) => all.filter((el) => { const box = el.getBoundingClientRect(); return box.bottom > innerHeight + 1 || box.right > innerWidth + 1 || box.left < -1 || box.top < -1; }).map((el) => el.textContent));
  expect(out, `${name}: parts outside the stage`).toEqual([]);
  const svg = stage.locator('.jigsaw-stage .jigsaw-thumb-svg').first();
  if ((await svg.count()) > 0) {
    const mini = (await svg.boundingBox())!;
    console.log(`jigsaw 29c: ${name} — a thumbnail ${Math.round(mini.width)}×${Math.round(mini.height)}`);
  }
}

async function jigsawGame29c() {
  // ── Редактор: класика з одним запитанням → класика з пазлом → «Головоломки» (судоку й пазл 3×2); у бліці пазла немає. ──
  const host = await open('host29c', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host29c@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Пазл 29c');
  await host.locator('details.rules').first().locator('summary').click();
  await select27b(host, 'Показувати рейтинг', 'end');
  await questionText(host).fill('Столиця України?');
  await field(host, 'Варіант 1').fill('Львів');
  await field(host, 'Варіант 2').fill('Київ');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Час, с').fill('30');

  await click(host, '+ Раунд');
  await click(host, 'Класичний');
  const types = host.getByRole('group', { name: 'Тип запитання', ...exact });
  await types.getByRole('button', { name: 'пазл', ...exact }).click();
  expect(await questionText(host).inputValue(), 'the default jigsaw text').toBe('Складіть пазл.');
  const grid = host.locator('.jigsaw-editor-pieces output');
  const slider = host.locator('.jigsaw-editor-pieces input[type="range"]');
  await expect.poll(() => grid.textContent(), POLL).toBe('4×3 = 12');
  expect(await field(host, 'Час, с').inputValue(), 'the default jigsaw time').toBe('120');
  await expect.poll(() => field(host, 'Бали').inputValue(), POLL).toBe('300');
  expect(await host.getByLabel('Відео з YouTube', exact).count(), 'a jigsaw has no video').toBe(0);
  await host.getByText('Додайте фото: з нього гра виріже шматочки.', exact).waitFor();
  await uploadPhoto29c(host);
  // Співвідношення й кількість: 16:9 — та сама сітка 4×3; 7 шматочків на 4:3 — 3×2 = 6; назад 12.
  await host.getByRole('radio', { name: '16:9', ...exact }).click();
  await expect.poll(() => grid.textContent(), POLL).toBe('4×3 = 12');
  await host.getByRole('radio', { name: '4:3', ...exact }).click();
  expect(await host.getByRole('radio', { name: '4:3', ...exact }).getAttribute('aria-checked')).toBe('true');
  await slider.fill('7');
  await expect.poll(() => grid.textContent(), POLL).toBe('3×2 = 6');
  await slider.fill('12');
  await expect.poll(() => grid.textContent(), POLL).toBe('4×3 = 12');
  expect(await host.locator('.jigsaw-cuts path').count(), 'cut lines over the crop').toBe(12);
  // Рамка кадру: фото 16:9 ширше за 4:3 — рамку тягнуть ліворуч.
  const frame = host.locator('.jigsaw-editor-frame');
  const leftOf = async () => Number((await frame.getAttribute('style'))?.match(/left:\s*([\d.]+)%/)?.[1] ?? NaN);
  const startLeft = await leftOf();
  expect(startLeft, 'the crop starts centred').toBeGreaterThan(5);
  const frameBox = (await frame.boundingBox())!;
  await host.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);
  await host.mouse.down();
  await host.mouse.move(frameBox.x + frameBox.width / 2 - 30, frameBox.y + frameBox.height / 2, { steps: 6 });
  await host.mouse.up();
  await expect.poll(leftOf, POLL).toBeLessThan(startLeft - 1);
  // «Інша форма»: ті самі шматочки, інші виступи.
  const cuts = () => host.locator('.jigsaw-cuts path').evaluateAll((all) => all.map((path) => path.getAttribute('d')).join('|'));
  const shape = await cuts();
  await click(host, 'Інша форма');
  await expect.poll(cuts, POLL).not.toBe(shape);
  await field(host, 'Показувати гравцям готову картинку поруч').check();
  await field(host, 'Час, с').fill('90');
  await shot(host, 'jigsaw29c-editor');

  await click(host, '+ Раунд');
  await click(host, 'Головоломки');
  await types.getByRole('button', { name: 'судоку', ...exact }).waitFor();
  expect(await types.getByRole('button', { name: 'пазл', ...exact }).count(), 'a jigsaw in the puzzles round').toBe(1);
  await field(host, 'Час, с').fill('60');
  await click(host, 'Додати запитання');
  await types.getByRole('button', { name: 'пазл', ...exact }).click();
  await uploadPhoto29c(host);
  await slider.fill('6');
  await expect.poll(() => grid.textContent(), POLL).toBe('3×2 = 6');
  await field(host, 'Час, с').fill('60');

  await click(host, '+ Раунд');
  await click(host, 'Бліц');
  await types.getByRole('button', { name: 'один варіант', ...exact }).waitFor();
  expect(await types.getByRole('button', { name: 'пазл', ...exact }).count(), 'a jigsaw in the blitz menu').toBe(0);
  await click(host, 'Видалити раунд');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Пазл 29c' }).waitFor();

  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Пазл 29c')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { type: string; questions: { type: string }[] }[] };
  expect(stored.rounds.map((round) => round.type)).toEqual(['classic', 'classic', 'puzzles']);
  expect(stored.rounds[2]!.questions.map((q) => q.type)).toEqual(['sudoku', 'jigsaw']);
  const big = stored.rounds[1]!.questions[0] as StoredJigsaw29c;
  const small = stored.rounds[2]!.questions[1] as StoredJigsaw29c;
  expect(big).toMatchObject({ type: 'jigsaw', imageUrl: null, aspect: '4:3', rows: 3, cols: 4, timeLimit: 90, points: 300, preview: true });
  expect(big.photo).toMatch(/^\/uploads\/[\w-]+\.png$/);
  expect(big.focus.x, 'the crop moved left').toBeLessThan(0.45);
  expect(big.tabs, 'the stored tabs are the seed’s tabs').toBe(jigsawTabs(3, 4, big.seed));
  expect(small).toMatchObject({ rows: 2, cols: 3, timeLimit: 60 });
  const g1: Grid29c = { rows: 3, cols: 4 };
  const g2: Grid29c = { rows: 2, cols: 3 };

  // ── Гра: сцена 1600 × 900; Оля 375 × 812 і Тарас 360 × 740 — миша; Петро 320 × 640 — пальцем. ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29c', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya29c', 375, 812);
  const olyaFrames = socketFrames(olya);
  const taras = await open('taras29c', 360, 740);
  const tarasFrames = socketFrames(taras);
  const petro = await open('petro29c', 320, 640, { hasTouch: true, isMobile: true });
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();
  const phones = [olya, taras, petro];
  const scores = async (wanted: [string, string, string]) => {
    for (const [at, page] of phones.entries()) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(wanted[at]);
  };

  // ── Раунд 1: класичне запитання (Петро — хибно). ──
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await petro.getByRole('button', { name: /Львів/ }).click();
  await reveal28a(host);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // ── Раунд 2: пазл 4×3 (90 с) — номер у раунді 0, індекс у plays 1. ──
  for (const page of phones) await page.locator('.jigsaw-play .jigsaw-pile').waitFor();
  const shown = stateViews(olyaFrames).reverse().find((view) => view.question?.jigsaw !== undefined)!;
  expect(shown.questionIndex, 'the phone’s question number in the round').toBe(0);
  expect(shown.question!.jigsaw).toMatchObject({ photo: big.photo, aspect: '4:3', rows: 3, cols: 4, tabs: big.tabs, preview: true });
  expect(await olya.locator('.jigsaw-play .jigsaw-piece.is-loose').count(), 'the pile on the phone').toBe(12);
  await olya.locator('.jigsaw-play .jigsaw-preview').waitFor();
  await stage.locator('.jigsaw-stage .jigsaw-thumb').nth(2).waitFor();
  expect(await stage.locator('.jigsaw-stage .jigsaw-thumb').count(), 'a board per player').toBe(3);
  // Купки різні на різних телефонах (порядок від гравця).
  const pileOrder = (page: Page) => page.locator('.jigsaw-pile .jigsaw-piece').evaluateAll((all) => all.map((el) => el.getAttribute('data-piece')).join(','));
  expect(await pileOrder(olya), 'the same pile order on two phones').not.toBe(await pileOrder(taras));

  // Петро (320 px, пальцем): три шматочки й не встигає.
  for (const k of [0, 5, 11]) await placePiece29c(petro, g1, k, 'touch');
  expect(await petro.evaluate('window.matchMedia("(pointer: coarse)").matches'), 'Petro’s phone is a touch screen').toBe(true);
  await sleep(1500);
  expect(await placedCount29c(petro), 'Petro’s pieces after the push window').toBe(3);
  await expect.poll(() => thumb29c(stage, '.jigsaw-stage', 'Петро').locator('.puzzle-thumb-count').textContent(), POLL).toBe('25 %');
  await expectNoSideScroll(petro, 'jigsaw29c-phone-320');
  const petroBoxes = await petro.locator('.jigsaw-play .jigsaw-frame, .jigsaw-play .jigsaw-pile').evaluateAll((all) => all.map((el) => { const box = el.getBoundingClientRect(); return [box.left, box.right] as const; }));
  for (const [left, right] of petroBoxes) {
    expect(left, 'the jigsaw starts off screen at 320 px').toBeGreaterThanOrEqual(0);
    expect(right, 'the jigsaw ends off screen at 320 px').toBeLessThanOrEqual(320);
  }

  // Оля (миша): повернутий шматочок на своєму місці не прилипає; тапами прямо — прилипає.
  const rots = await olya.locator('.jigsaw-pile .jigsaw-piece').evaluateAll((all) => all.map((el) => [Number(el.getAttribute('data-piece')), el.getAttribute('data-rot')] as const));
  let turned = rots.find(([, rot]) => rot !== '0')?.[0];
  if (turned === undefined) {
    turned = 0;
    await tapPiece29c(olya, 0, 'mouse');
  }
  await dragPiece29c(olya, g1, turned, { x: turned % 4, y: Math.floor(turned / 4) });
  const lying = olya.locator(`.jigsaw-frame .jigsaw-piece.is-loose[data-piece="${turned}"]`);
  await lying.waitFor();
  await sleep(600);
  expect(await placed29c(olya, turned).count(), 'a turned piece on its own place').toBe(0);
  expect(await lying.getAttribute('data-rot'), 'the piece is still turned').not.toBe('0');
  await turnUpright29c(olya, turned);
  await placed29c(olya, turned).waitFor();
  const rest = Array.from({ length: 12 }, (_, k) => k).filter((k) => k !== turned);
  for (const k of rest.slice(0, 5)) await placePiece29c(olya, g1, k);
  await expect.poll(() => thumb29c(stage, '.jigsaw-stage', 'Оля').locator('.puzzle-thumb-count').textContent(), POLL).toBe('50 %');
  await expect.poll(() => stage.locator('.jigsaw-stage .jigsaw-thumb image').count(), POLL).toBe(2);
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await shot(olya, 'jigsaw29c-phone-preview');
  await expectJigsawStageFits29c(stage, 'question');
  await shot(stage, 'jigsaw29c-stage');
  await thumb29c(host, '.host-jigsaw', 'Оля').locator('.puzzle-thumb-count').getByText('50 %', exact).waitFor();
  await shot(host, 'jigsaw29c-host');
  for (const k of rest.slice(5)) await placePiece29c(olya, g1, k);
  await olya.getByText(/^Готово за [\d,]+ с\. Чекаємо інших$/).first().waitFor();
  await sleep(1500);
  expect(await placedCount29c(olya), 'Olya’s pieces stay in the frame').toBe(12);
  expect(await olya.locator('.jigsaw-play .jigsaw-piece.is-loose').count(), 'loose pieces after done').toBe(0);

  // Тарас (миша, повільніше): прямий шматочок за 0,4 клітинки від місця не прилипає, точніше — прилипає.
  await turnUpright29c(taras, 6);
  await dragPiece29c(taras, g1, 6, { x: 2.4, y: 1 });
  await taras.locator('.jigsaw-frame .jigsaw-piece.is-loose[data-piece="6"]').waitFor();
  await sleep(600);
  expect(await placed29c(taras, 6).count(), 'a piece 0.4 cells off').toBe(0);
  await dragPiece29c(taras, g1, 6, { x: 2.1, y: 1.05 });
  await placed29c(taras, 6).waitFor();
  for (const k of [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11]) {
    await placePiece29c(taras, g1, k);
    await sleep(150);
  }
  await taras.getByText(/^Готово за [\d,]+ с\. Чекаємо інших$/).first().waitFor();
  await stage.getByText('Відповіли 2 з 3', exact).first().waitFor();
  await expect.poll(() => stage.locator('.jigsaw-stage .jigsaw-thumb.is-done').count(), POLL).toBe(2);
  for (const frames of [olyaFrames, tarasFrames, petroFrames]) expect(frames.join(NL), 'a stale refusal').not.toContain('jigsaw_stale');

  // Петро не встиг: час виходить, у нього 0.
  await petro.getByText('Час вийшов.', exact).first().waitFor({ timeout: 100_000 });
  await reveal28a(host);
  const table = stage.locator('.jigsaw-stage.is-reveal .jigsaw-table');
  await table.waitFor();
  await stage.locator('.jigsaw-stage.is-reveal .jigsaw-stage-photo img').waitFor();
  const boards = jigsawBoards29c(stageFrames);
  const [bOlya, bTaras, bPetro] = ['Оля', 'Тарас', 'Петро'].map((name) => boards.find((board) => board.nickname === name)!);
  expect(boards.map((board) => board.nickname), 'the reveal order').toEqual(['Оля', 'Тарас', 'Петро']);
  expect(bOlya).toMatchObject({ done: true, points: 300 });
  expect(bTaras!.done).toBe(true);
  const tarasPoints = Math.round((300 * bOlya!.timeMs!) / bTaras!.timeMs!);
  console.log(`jigsaw 29c: Оля ${bOlya!.timeMs} ms, Тарас ${bTaras!.timeMs} ms → ${tarasPoints}`);
  expect(tarasPoints, 'Taras was slower').toBeLessThan(300);
  expect(bTaras!.points, 'max × fastest / own').toBe(tarasPoints);
  expect(bPetro).toMatchObject({ done: false, timeMs: null, points: 0 });
  expect(bPetro!.placed.length).toBe(3);
  const rows = await table.locator('tbody tr').evaluateAll((all) => all.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '')));
  expect(rows.map((row) => [row[0], row[1], row[3]]), 'the time table').toEqual([['1', 'Оля', '+300'], ['2', 'Тарас', `+${tarasPoints}`], ['—', 'Петро', '0']]);
  expect(rows[2]![2], 'Petro’s row').toBe('Не склав · 25 %');
  await scores(['300', String(tarasPoints), '0']);
  await taras.locator('.jigsaw-reveal figcaption').getByText(/^Склав за [\d,]+ с$/).waitFor();
  await petro.locator('.jigsaw-reveal figcaption').getByText('Поставлено 3 з 12', exact).waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectJigsawStageFits29c(stage, 'reveal');
  await shot(stage, 'jigsaw29c-reveal-stage');
  await shot(petro, 'jigsaw29c-phone-320-reveal');

  // ── Раунд 3 «Головоломки»: судоку, потім пазл 3×2 — номер у раунді 1; усі складають, запитання закривається саме. ──
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await page.locator('.sudoku-play').waitFor();
  for (const page of phones) await done28d(page);
  await reveal28a(host);
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await page.locator('.jigsaw-play .jigsaw-pile').waitFor();
  const second = stateViews(petroFrames).reverse().find((view) => view.question?.jigsaw !== undefined)!;
  expect(second.questionIndex, 'the jigsaw after the sudoku is number 1 in the round').toBe(1);
  expect(second.question!.jigsaw).toMatchObject({ rows: 2, cols: 3 });
  const sentFrom = [olyaFrames.length, tarasFrames.length, petroFrames.length];
  for (const k of [0, 1, 2, 3, 4, 5]) await placePiece29c(olya, g2, k);
  for (const k of [5, 4, 3, 2, 1, 0]) await placePiece29c(taras, g2, k);
  for (const k of [2, 0, 4, 1, 5, 3]) await placePiece29c(petro, g2, k, 'touch');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor({ timeout: 10_000 });
  await stage.getByText('Відповіли 3 з 3', exact).first().waitFor();
  for (const [at, frames] of [olyaFrames, tarasFrames, petroFrames].entries()) {
    const sent = frames.slice(sentFrom[at]).join(NL);
    expect(sent, 'a stale refusal in the puzzles round').not.toContain('jigsaw_stale');
    expect(sent, 'a refused piece in the puzzles round').not.toMatch(/jigsaw_(miss|placed|done)/);
  }
  await reveal28a(host);
  await expect.poll(() => stage.locator('.jigsaw-stage.is-reveal .jigsaw-table tbody tr.is-done').count(), POLL).toBe(3);
  const second3 = jigsawBoards29c(stageFrames);
  expect(second3.map((board) => board.nickname)).toEqual(['Оля', 'Тарас', 'Петро']);
  expect(second3[0]!.points).toBe(300);
  await scores(['600', String(tarasPoints + second3[1]!.points!), String(second3[2]!.points!)]);
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

async function jigsawTeams29c() {
  const host = await open('host29ct', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host29ct@example.com');
  const photo = await apiPhoto29c(host);
  const question = jigsaw29c('t29c', 3, 4, 120, photo);
  const data = {
    ...makeRoundsQuiz([classicRound('ct29c', [{ ...withId(single, 'ct1'), timeLimit: 30 }], { speedBonus: false }), puzzlesRound('pt29c', [question as never], { title: 'Командний пазл' })], {
      leaderboard: 'end',
      teams: { count: 2, names: ['Соняшники', 'Маки'] },
    }),
    title: 'Пазл команд 29c',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Пазл команд 29c' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29ct', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya29ct', 375, 812);
  const taras = await open('taras29ct', 360, 740);
  const petro = await open('petro29ct', 375, 812);
  const hanna = await open('hanna29ct', 320, 640, { hasTouch: true, isMobile: true });
  const phones = [olya, taras, petro, hanna];
  for (const [page, nickname, team] of [
    [olya, 'Оля', 'Соняшники'],
    [taras, 'Тарас', 'Соняшники'],
    [petro, 'Петро', 'Маки'],
    [hanna, 'Ганна', 'Маки'],
  ] as const) {
    await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
  }
  await expect.poll(() => stageTeam(stage, 'Соняшники'), POLL).toEqual(['Оля', 'Тарас']);
  await expect.poll(() => stageTeam(stage, 'Маки'), POLL).toEqual(['Петро', 'Ганна']);
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  // Класичне запитання першого раунду: без відповідей.
  await reveal28a(host);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await page.locator('.jigsaw-play .jigsaw-pile').waitFor();
  const g: Grid29c = { rows: 3, cols: 4 };
  const stageThumb = (name: string) => thumb29c(stage, '.jigsaw-stage', name);
  const sameOn = async (pages: Page[], pieces: number[]) => {
    for (const page of pages) for (const k of pieces) await placed29c(page, k).waitFor();
  };
  // Спільна дошка: купка товариша перескладається, коли до нього доходить мій шматочок, — наступний хід чекає, доки дійде.
  const placeShared = async (page: Page, k: number, mates: Page[], via: Via29c = 'mouse') => {
    await placePiece29c(page, g, k, via);
    await sameOn(mates, [k]);
  };

  // ── Оля тримає шматочок 6: у Тараса він притемнений і не береться; Оля відпускає — за ≤ 2 с Тарас його бере. ──
  const held = 6;
  const from = await pieceCenter29c(olya, held);
  await olya.mouse.move(from.x, from.y);
  await olya.mouse.down();
  await olya.mouse.move(from.x + 12, from.y - 12, { steps: 3 });
  await olya.locator(`.jigsaw-play [data-dragging="${held}"]`).waitFor();
  const tarasPiece = loose29c(taras, held);
  await expect.poll(() => tarasPiece.getAttribute('class'), POLL).toMatch(/\bis-held\b/);
  expect(await tarasPiece.getAttribute('aria-disabled'), 'a held piece is disabled for a teammate').toBe('true');
  expect(await tarasPiece.getAttribute('aria-label')).toBe(`Шматочок ${held + 1} — тримає товариш`);
  // Суперники цього не бачать.
  expect(await loose29c(petro, held).getAttribute('class'), 'the other team sees the hold').not.toMatch(/\bis-held\b/);
  const box = (await tarasPiece.boundingBox())!;
  await taras.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await taras.mouse.down();
  await taras.mouse.move(box.x + box.width / 2 + 40, box.y - 60, { steps: 6 });
  expect(await taras.locator('.jigsaw-play [data-dragging]').count(), 'Taras lifts a held piece').toBe(0);
  await taras.mouse.up();
  // Тримання триває понад 2 с (Олин телефон повторює «тримаю»).
  await sleep(2600);
  expect(await tarasPiece.getAttribute('class'), 'the hold after 2.6 s of holding').toMatch(/\bis-held\b/);
  if (process.env.E2E_SHOTS === '1') await sleep(300);
  await shot(taras, 'jigsaw29c-teams-phone');
  // Відпускає над купкою: шматочок назад у купці.
  const pile = (await olya.locator('.jigsaw-play .jigsaw-pile').boundingBox())!;
  await olya.mouse.move(pile.x + pile.width / 2, pile.y + pile.height / 2, { steps: 6 });
  const released = Date.now();
  await olya.mouse.up();
  await expect.poll(() => tarasPiece.getAttribute('class'), { timeout: 5000 }).not.toMatch(/\bis-held\b/);
  const freeAfter = Date.now() - released;
  console.log(`jigsaw 29c: the held piece is free on the teammate’s phone ${freeAfter} ms after the release`);
  expect(freeAfter, 'the hold lapses about 1–2 s after the release').toBeGreaterThanOrEqual(700);
  expect(freeAfter, 'the hold lapses about 1–2 s after the release').toBeLessThanOrEqual(3500);
  await placeShared(taras, held, [olya]);

  // ── Обидва ставлять різні шматочки — однаково в обох телефонах і на сцені, кольорами учасників. ──
  await placeShared(olya, 0, [taras]);
  await placeShared(olya, 1, [taras]);
  await placeShared(taras, 10, [olya]);
  await placeShared(taras, 11, [olya]);
  const sunflowers = [held, 0, 1, 10, 11];
  await sameOn([olya, taras], sunflowers);
  await placeShared(petro, 3, [hanna]);
  await placeShared(hanna, 8, [petro], 'touch');
  await sameOn([petro, hanna], [3, 8]);
  expect(await placed29c(petro, 0).count(), 'a Sunflowers piece on a Poppies phone').toBe(0);
  await expect.poll(() => stageThumb('Соняшники').locator('.puzzle-thumb-count').textContent(), POLL).toBe(`${Math.round((100 * sunflowers.length) / 12)} %`);
  await expect.poll(() => jigsawBoards29c(stageFrames).find((board) => board.nickname === 'Соняшники')?.tones, POLL).toBe('21122');
  expect(jigsawBoards29c(stageFrames).find((board) => board.nickname === 'Соняшники')!.placed).toEqual(sunflowers);
  expect(jigsawBoards29c(stageFrames).find((board) => board.nickname === 'Маки')!.tones).toBe('12');
  expect(await stageThumb('Соняшники').locator('.jigsaw-thumb-tone.by-1').count(), 'Olya’s colour on the stage').toBe(2);
  expect(await stageThumb('Соняшники').locator('.jigsaw-thumb-tone.by-2').count(), 'Taras’s colour on the stage').toBe(3);
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectJigsawStageFits29c(stage, 'teams question');
  await shot(stage, 'jigsaw29c-teams-stage');
  await expectNoSideScroll(hanna, 'jigsaw29c-teams-phone-320');

  // ── Перезапуск сервера посеред пазла: шматочки на місці, телефони ставлять далі. ──
  await restart(async () => {
    await stage.getByText(RESTARTING_TEXT, exact).waitFor();
  });
  for (const page of [stage, ...phones, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();
  await sameOn([olya, taras], sunflowers);
  await sameOn([petro, hanna], [3, 8]);
  await expect.poll(() => stageThumb('Соняшники').locator('.jigsaw-thumb-tone').count(), POLL).toBe(sunflowers.length);
  await olya.locator('.jigsaw-play .jigsaw-piece.is-loose:not(.is-off)').first().waitFor();
  const left = Array.from({ length: 12 }, (_, k) => k).filter((k) => !sunflowers.includes(k));
  for (const [at, k] of left.entries()) await placeShared(at % 2 === 0 ? olya : taras, k, [at % 2 === 0 ? taras : olya]);
  await olya.getByText(/^Готово за [\d,]+ с\. Чекаємо інших$/).first().waitFor();
  await taras.getByText(/^Готово за [\d,]+ с\. Чекаємо інших$/).first().waitFor();
  await expect.poll(() => stageThumb('Соняшники').locator('.puzzle-thumb-done').count(), POLL).toBe(1);
  // Маки складають довше: решту ставлять Петро й Ганна.
  const poppies = Array.from({ length: 12 }, (_, k) => k).filter((k) => k !== 3 && k !== 8);
  for (const [at, k] of poppies.entries()) {
    if (at % 2 === 0) await placeShared(petro, k, [hanna]);
    else await placeShared(hanna, k, [petro], 'touch');
  }
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor({ timeout: 10_000 });
  await reveal28a(host);
  await stage.locator('.jigsaw-stage.is-reveal .jigsaw-table').waitFor();
  const boards = jigsawBoards29c(stageFrames);
  expect(boards.map((board) => board.nickname)).toEqual(['Соняшники', 'Маки']);
  const poppiesPoints = Math.round((300 * boards[0]!.timeMs!) / boards[1]!.timeMs!);
  expect(boards[0]!.points).toBe(300);
  expect(boards[1]!.points).toBe(poppiesPoints);
  for (const [page, score] of [[olya, '300'], [taras, '300'], [petro, String(poppiesPoints)], [hanna, String(poppiesPoints)]] as const) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(score);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectJigsawStageFits29c(stage, 'teams reveal');
  await shot(stage, 'jigsaw29c-teams-reveal-stage');
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

/** 24 гравці без браузера (сокети) ставлять шматочки; кожен третій складає весь пазл; мініатюри на сцені 1600 × 900 без прокрутки. */
async function jigsawCrowd29c(sockets: Socket[]) {
  const host = await open('host29cc', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host29cc@example.com');
  const photo = await apiPhoto29c(host);
  const question = jigsaw29c('c29c', 3, 4, 60, photo);
  const data = { ...makeRoundsQuiz([puzzlesRound('pc29c', [question as never])], { leaderboard: 'end' }), title: 'Пазл натовпу 29c' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Пазл натовпу 29c' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29cc', 1600, 900);
  await stage.goto(stageUrl);
  const names = [
    'Олександра Петренко', 'Богдана Коваленко', 'Ярослав Шевченко', 'Мирослава Бондар', 'Владислав Ткаченко', 'Анастасія Мельник',
    'Святослав Кравчук', 'Христина Олійник', 'Станіслав Лисенко', 'Катерина Руденко', 'Остап Марченко', 'Соломія Савченко',
    'Тарас Гончаренко', 'Ірина Кузьменко', 'Максим Литвиненко', 'Вероніка Захарчук', 'Назар Поліщук', 'Злата Тимошенко',
    'Дмитро Павленко', 'Олена Кириленко', 'Роман Мороз', 'Оксана Бойко', 'Левко Гнатюк', 'Дарина Ковальчук',
  ];
  const players: { nickname: string; socket: Socket }[] = [];
  for (const nickname of names) {
    const response = await fetch(`${base}/api/games/by-code/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname }) });
    expect(response.status, nickname).toBe(201);
    const { token } = (await response.json()) as { token: string };
    const socket = connectSocket(base, { auth: { code, role: 'player', token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((done, fail) => {
      socket.once('connect', () => done());
      socket.once('connect_error', fail);
    });
    players.push({ nickname, socket });
  }
  const emit = <T,>(socket: Socket, event: string, payload: unknown) => new Promise<T>((done) => socket.emit(event, payload, done));
  await click(host, 'Почати гру');
  await afterSplash(host, stage);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage);
  await stage.locator('.jigsaw-stage').waitFor();
  await expect.poll(() => stage.locator('.jigsaw-stage .jigsaw-thumb').count(), POLL).toBe(24);
  // Кожен — від 1 до 11 шматочків (порядок від номера гравця), кожен третій — усі 12; шматочки — на свої місця з малим зсувом.
  await Promise.all(
    players.map(async (player, k) => {
      const count = k % 3 === 2 ? 12 : 1 + (k % 11);
      const pieces = Array.from({ length: 12 }, (_, j) => (k * 5 + j * 7) % 12).slice(0, count);
      for (const piece of pieces) {
        const payload = { questionIndex: 0, piece, x: (piece % 4) + 0.1, y: Math.floor(piece / 4) - 0.1, rot: 0 };
        let ack = await emit<{ ok: boolean; error?: string }>(player.socket, 'player:jigsaw', payload);
        for (let tries = 0; !ack.ok && ack.error === 'too_soon' && tries < 10; tries++) {
          await sleep(300);
          ack = await emit<{ ok: boolean; error?: string }>(player.socket, 'player:jigsaw', payload);
        }
        expect(ack, `${player.nickname} places ${piece}`).toEqual({ ok: true });
      }
    }),
  );
  await expect.poll(() => stage.locator('.jigsaw-stage .jigsaw-thumb.is-done').count(), POLL).toBe(8);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectNoSideScroll(stage, 'jigsaw29c-24-stage');
  await expectJigsawStageFits29c(stage, '24 players');
  const clipped = await stage.locator('.jigsaw-stage .puzzle-thumb-name').evaluateAll((all) => all.filter((el) => el.getBoundingClientRect().width < 40).map((el) => el.textContent));
  expect(clipped, 'names squeezed to nothing').toEqual([]);
  await reveal28a(host);
  await stage.locator('.jigsaw-stage.is-reveal .jigsaw-table').waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectJigsawStageFits29c(stage, '24 players reveal');
  await shot(stage, 'jigsaw29c-24-reveal-stage');

  expect(problems).toEqual([]);
}

it('part 29i: jigsaw at 320 px — the last piece dropped by the edge stays on the frame and can be taken again, the preview opens full screen', async () => {
  try {
    await jigsawEdge29i();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

/** Шматочок на телефоні: центр його прямокутника (центр ядра за будь-якого повороту). */
async function pieceBoxCenter29i(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function jigsawEdge29i() {
  const host = await open('host29i', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host29i@example.com');
  const photo = await apiPhoto29c(host);
  const question = jigsaw29c('j29i', 2, 3, 120, photo);
  const data = {
    ...makeRoundsQuiz([classicRound('c29i', [{ ...withId(single, 'c29i1'), timeLimit: 30 }], { speedBonus: false }), puzzlesRound('p29i', [question as never])], { leaderboard: 'end' }),
    title: 'Пазл біля краю 29i',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Пазл біля краю 29i' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  // Оля — телефон 320 × 568 (миша); Тарас лише приєднався, щоб запитання не закрилося, коли Оля складе.
  const olya = await open('olya29i', 320, 568);
  const taras = await open('taras29i', 375, 812);
  const phones = [olya, taras];
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await click(host, 'Почати гру');
  await afterSplash(host, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, ...phones);
  await reveal28a(host);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, ...phones);
  for (const page of phones) await page.locator('.jigsaw-play .jigsaw-pile').waitFor();
  // Найменший пазл — 3×2 (JIGSAW_MIN_PIECES = 6).
  const g: Grid29c = { rows: 2, cols: 3 };

  // ── Прев'ю — кнопка: тап відкриває ту саму обрізку на весь екран, Escape закриває. На 320 × 568 воно 5rem (29j), ширше — 7rem. ──
  const preview = olya.locator('.jigsaw-play .jigsaw-preview-open');
  await preview.waitFor();
  const previewBox = (await olya.locator('.jigsaw-play .jigsaw-preview').boundingBox())!;
  expect(Math.round(previewBox.width), 'the preview width (5rem at 320×568)').toBe(80);
  expect(Math.round((await taras.locator('.jigsaw-play .jigsaw-preview').boundingBox())!.width), 'the preview width (7rem at 375×812)').toBe(112);
  // На 320 × 568 до 29j купка була нижче краю екрана (прокрутка вниз); щільніша обв'язка гравця тримає на екрані рамку й перший ряд купки.
  const frameBox = (await olya.locator('.jigsaw-play .jigsaw-frame').boundingBox())!;
  const pileBox = (await olya.locator('.jigsaw-play .jigsaw-pile').boundingBox())!;
  const firstRow = (await olya.locator('.jigsaw-play .jigsaw-pile-row').first().boundingBox())!;
  console.log(`jigsaw 29i: 320×568 — the frame ${Math.round(frameBox.y)}…${Math.round(frameBox.y + frameBox.height)}, the pile ${Math.round(pileBox.y)}…${Math.round(pileBox.y + pileBox.height)}, the first pile row bottom ${Math.round(firstRow.y + firstRow.height)}, page ${await olya.evaluate('document.documentElement.scrollHeight')}`);
  expect(frameBox.y + frameBox.height, 'the frame is on screen at 320×568').toBeLessThanOrEqual(568);
  expect(firstRow.y + firstRow.height, 'the first pile row is on screen at 320×568').toBeLessThanOrEqual(568);
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await shot(olya, 'jigsaw29i-phone-preview');
  await preview.click();
  const zoom = olya.locator('.image-zoom');
  await zoom.waitFor();
  const zoomImg = zoom.locator('img.jigsaw-zoom-img');
  await expect.poll(() => zoomImg.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0), POLL).toBe(true);
  const zoomBox = (await zoomImg.boundingBox())!;
  expect(zoomBox.x, 'the zoomed picture inside the window').toBeGreaterThanOrEqual(0);
  expect(zoomBox.y, 'the zoomed picture inside the window').toBeGreaterThanOrEqual(0);
  expect(zoomBox.x + zoomBox.width, 'the zoomed picture inside the window').toBeLessThanOrEqual(320);
  expect(zoomBox.y + zoomBox.height, 'the zoomed picture inside the window').toBeLessThanOrEqual(568);
  expect(zoomBox.width, 'the zoomed picture fills the width').toBeGreaterThan(290);
  expect(zoomBox.width / zoomBox.height, 'the zoom keeps the 4:3 crop').toBeCloseTo(4 / 3, 1);
  expect(await zoomImg.evaluate((img) => getComputedStyle(img).objectPosition), 'the zoom keeps the focus').toBe('50% 50%');
  await expectNoSideScroll(olya, 'jigsaw29i-phone-zoom');
  await olya.keyboard.press('Escape');
  await expect.poll(() => zoom.count(), POLL).toBe(0);

  // ── П'ять шматочків — на місця; останній (5, його місце — праворуч унизу) кинуто пальцем за 10 px від правого краю рамки вгорі. ──
  for (const k of [0, 1, 2, 3, 4]) await placePiece29c(olya, g, k);
  const last = 5;
  const from = await pieceCenter29c(olya, last);
  const frame = (await olya.locator('.jigsaw-play .jigsaw-frame').boundingBox())!;
  const cellW = frame.width / g.cols;
  const cellH = frame.height / g.rows;
  const target = { x: frame.x + frame.width - 10, y: frame.y + cellH / 2 };
  await olya.mouse.move(from.x, from.y);
  await olya.mouse.down();
  for (const point of path29c(from, target).slice(1)) await olya.mouse.move(point.x, point.y);
  await olya.mouse.up();
  const lying = `.jigsaw-play .jigsaw-frame .jigsaw-piece.is-loose[data-piece="${last}"]`;
  await olya.locator(lying).waitFor();
  expect(await olya.locator('.jigsaw-play [data-dragging]').count(), 'nothing left in the hand').toBe(0);
  const at = await pieceBoxCenter29i(olya, lying);
  console.log(`jigsaw 29i: the frame ${Math.round(frame.x)}…${Math.round(frame.x + frame.width)}, the piece centre ${Math.round(at.x)}, ${Math.round(at.y)}`);
  // Ядро цілком у рамці: центр не ближче за пів клітинки до її країв.
  expect(at.x, 'the piece core inside the frame').toBeLessThanOrEqual(frame.x + frame.width - cellW / 2 + 1);
  expect(at.x, 'the piece core inside the frame').toBeGreaterThanOrEqual(frame.x + cellW / 2 - 1);
  expect(at.y, 'the piece core inside the frame').toBeGreaterThanOrEqual(frame.y + cellH / 2 - 1);
  expect(at.y, 'the piece core inside the frame').toBeLessThanOrEqual(frame.y + frame.height - cellH / 2 + 1);
  expect(await olya.locator('.jigsaw-play .jigsaw-pile .jigsaw-piece').count(), 'the pile is empty').toBe(0);
  expect(await olya.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('[data-piece]')?.getAttribute('data-piece') ?? null, [at.x, at.y]), 'the piece is under the finger').toBe(String(last));
  if (process.env.E2E_SHOTS === '1') await sleep(400);
  await shot(olya, 'jigsaw29i-phone-edge');
  await expectNoSideScroll(olya, 'jigsaw29i-phone-edge-noscroll');

  // ── Його знову беруть: прямо й на своє місце — пазл складено. ──
  await placePiece29c(olya, g, last);
  await olya.getByText(/^Готово за [\d,]+ с\. Чекаємо інших$/).first().waitFor();
  expect(await placedCount29c(olya), 'all six pieces in the frame').toBe(6);
  if (process.env.E2E_SHOTS === '1') await sleep(400);
  await shot(olya, 'jigsaw29i-phone-done');

  expect(problems).toEqual([]);
}

it('part 29d: spotdiff after a classic round — two uploads and circles in the editor, near taps count, three misses freeze for a second, a share of the price per find, 320 px', async () => {
  try {
    await spotdiffGame29d();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 29d: spotdiff in teams — one shared board, a teammate find shows on both phones, a freeze is personal, a restart keeps the finds', async () => {
  try {
    await spotdiffTeams29d();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 29d: spotdiff with 24 players — the stage counters fit 1600×900', async () => {
  const sockets: Socket[] = [];
  try {
    await spotdiffCrowd29d(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

type Spot29d = { x: number; y: number; r: number };
type StoredSpotdiff29d = { type: 'spotdiff'; imageUrl: string | null; original: string; changed: string; aspect: number; spots: Spot29d[]; timeLimit: number; points: number };
type Pics29d = { original: string; changed: string };
type Picture29d = 'original' | 'changed';

/** Місця відмінностей на синтетичних картинках (частки ширини й висоти): квадрати в другій картинці стоять саме тут. */
const SPOTS29D = [
  { x: 0.22, y: 0.3 },
  { x: 0.72, y: 0.28 },
  { x: 0.5, y: 0.72 },
];

/**
 * Дві синтетичні картинки 800 × 600 (4:3): однаковий градієнтний фон зі смугами; у другій — кольорові квадрати в перших `count`
 * місцях SPOTS29D. Жодних справжніх фото.
 */
function spotPngs29d(count = 3, [width, height]: [number, number] = [800, 600]): { original: Buffer; changed: Buffer } {
  const background = (x: number, y: number): [number, number, number] => {
    const stripe = Math.floor((x + y) / 60) % 2 === 0 ? 0 : 18;
    return [Math.round(40 + (150 * x) / width) + stripe, Math.round(90 + (100 * y) / height) + stripe, 170 - stripe];
  };
  const colors: [number, number, number][] = [[230, 60, 50], [250, 210, 40], [40, 190, 90]];
  const side = 0.1 * width;
  const changed = (x: number, y: number): [number, number, number] => {
    for (const [k, spot] of SPOTS29D.slice(0, count).entries()) {
      if (Math.abs(x - spot.x * width) <= side / 2 && Math.abs(y - spot.y * height) <= side / 2) return colors[k]!;
    }
    return background(x, y);
  };
  return { original: png29d(width, height, background), changed: png29d(width, height, changed) };
}

/** Картинки через API завантажень (для вікторин, зібраних без редактора): адреси /uploads/…. */
async function apiPics29d(page: Page, count = 3, size?: [number, number]): Promise<Pics29d> {
  const pngs = spotPngs29d(count, size);
  const upload = async (data: Buffer) => {
    const response = await page.request.post(`${base}/api/uploads`, { data, headers: { 'content-type': 'image/png' } });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { url: string }).url;
  };
  return { original: await upload(pngs.original), changed: await upload(pngs.changed) };
}

/** «Знайди відмінності» для API: типово 4:3, кола в даних місцях. */
function spotdiff29d(id: string, spots: Spot29d[], timeLimit: number, pics: Pics29d, points = 300, aspect = 4 / 3) {
  return { id, text: 'Знайдіть відмінності', imageUrl: null, video: null, timeLimit, points, type: 'spotdiff' as const, original: pics.original, changed: pics.changed, aspect, spots };
}

/** Обидві картинки в редакторі «Знайди відмінності»: оригінал, потім зі змінами; чекає рамку з колами. */
async function uploadPics29d(page: Page, count = 3) {
  const pngs = spotPngs29d(count);
  await page.locator('.spotdiff-editor input[type="file"][aria-label="Оригінал"]').setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: pngs.original });
  await page.locator('.spotdiff-slot img[alt="Оригінал"]').waitFor();
  await page.locator('.spotdiff-editor input[type="file"][aria-label="Зі змінами"]').setInputFiles({ name: 'changed.png', mimeType: 'image/png', buffer: pngs.changed });
  await page.locator('.spotdiff-frame.is-draw img').waitFor();
  await expect.poll(() => page.locator('.spotdiff-frame.is-draw img').evaluate((img) => (img as HTMLImageElement).naturalWidth), POLL).toBe(800);
}

/** Точка рамки малювання в редакторі (частки її прямокутника). */
async function editorPoint29d(page: Page, x: number, y: number): Promise<{ x: number; y: number; width: number }> {
  // Рамка нижче вікна 900 px: клік за межами вікна нікуди не дійде — спершу прокрутка в центр (над липкою панеллю «Зберегти»).
  const frame = page.locator('.spotdiff-frame.is-draw');
  await frame.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const box = (await frame.boundingBox())!;
  return { x: box.x + x * box.width, y: box.y + y * box.height, width: box.width };
}

/** Коло в редакторі: клік у порожнє місце другої картинки. */
async function placeCircle29d(page: Page, x: number, y: number) {
  const count = await page.locator('.spotdiff-frame.is-draw .spotdiff-circles circle').count();
  const at = await editorPoint29d(page, x, y);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => page.locator('.spotdiff-frame.is-draw .spotdiff-circles circle').count(), POLL).toBe(count + 1);
}

/** Картинка «Знайди відмінності» на телефоні. */
const spotPic29d = (page: Page, picture: Picture29d) => page.locator(`.spot-play:not(.spot-reveal) .spot-pic[data-pic="${picture}"]`);

const cdp29d = new WeakMap<Page, Awaited<ReturnType<BrowserContext['newCDPSession']>>>();

/**
 * Тап у частках (x, y) рамки картинки на телефоні, з додатковим зсувом у CSS px (dx, dy): мишею чи пальцем (CDP, pointerType touch).
 * Спершу прокручує картинку у вікно. Повертає ширину картинки на екрані.
 */
async function tapShare29d(page: Page, picture: Picture29d, x: number, y: number, { via = 'mouse', dx = 0, dy = 0 }: { via?: Via29c; dx?: number; dy?: number } = {}): Promise<number> {
  const pic = spotPic29d(page, picture);
  await pic.evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }));
  const box = (await pic.boundingBox())!;
  const point = { x: box.x + x * box.width + dx, y: box.y + y * box.height + dy };
  if (via === 'touch') {
    let cdp = cdp29d.get(page);
    if (cdp === undefined) {
      cdp = await page.context().newCDPSession(page);
      cdp29d.set(page, cdp);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else await page.mouse.click(point.x, point.y);
  return box.width;
}

/** Кільця знахідок на телефоні (на другій картинці). */
const rings29d = (page: Page) => page.locator('.spot-play:not(.spot-reveal) .spot-pic[data-pic="changed"] .spot-ring').count();
/** Тап у центр кола k, і чекає його кільце на телефоні. */
async function find29d(page: Page, spots: Spot29d[], k: number, { via = 'mouse', picture = 'changed' }: { via?: Via29c; picture?: Picture29d } = {}) {
  const before = await rings29d(page);
  await tapShare29d(page, picture, spots[k]!.x, spots[k]!.y, { via });
  await expect.poll(() => rings29d(page), POLL).toBe(before + 1);
  // Не впертися в ліміт тапів (6 за секунду).
  await sleep(200);
}

/** Промахи в кутках (далеко від усіх кіл). */
const MISSES29D = [
  { x: 0.05, y: 0.93 },
  { x: 0.95, y: 0.93 },
  { x: 0.95, y: 0.62 },
];

/** Лічильник картки дошки на сцені чи пульті за ім'ям. */
const spotCard29d = (page: Page, scope: string, name: string) => page.locator(`${scope} .spotdiff-card`, { has: page.locator('.spotdiff-card-name', { hasText: new RegExp(`^${name}$`) }) });
const spotCount29d = (page: Page, scope: string, name: string) => spotCard29d(page, scope, name).locator('.spotdiff-card-count').textContent();
/** Дошки з останнього кадру сокета, де вони є. */
const spotBoards29d = (frames: string[]) => stateViews(frames).reverse().find((view) => view.spotdiff !== undefined)!.spotdiff!.boards;

/**
 * Сцена 1600 × 900: без прокрутки; картинки, картки й таблиця цілком у вікні. minShare — яку частку ширини вікна мають разом
 * займати дві картинки (розкриття горизонтальних картинок: ≈ 60 %, таблиця — решта).
 */
async function expectSpotdiffStageFits29d(stage: Page, name: string, minShare = 0) {
  const [height, clientH, width, clientW] = (await stage.evaluate(
    '[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]',
  )) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const out = await stage
    .locator('.spotdiff-stage .spot-pic, .spotdiff-stage .spotdiff-card, .spotdiff-stage .spotdiff-table')
    .evaluateAll((all) => all.filter((el) => { const box = el.getBoundingClientRect(); return box.bottom > innerHeight + 1 || box.right > innerWidth + 1 || box.left < -1 || box.top < -1; }).map((el) => el.className));
  expect(out, `${name}: parts outside the stage`).toEqual([]);
  const pic = (await stage.locator('.spotdiff-stage .spot-pic').first().boundingBox())!;
  const second = (await stage.locator('.spotdiff-stage .spot-pic').nth(1).boundingBox())!;
  const share = (second.x + second.width - pic.x) / 1600;
  console.log(`spotdiff 29d: ${name} — a picture ${Math.round(pic.width)}×${Math.round(pic.height)}, both ${Math.round(share * 100)} % of the width`);
  // Вертикальні картинки впираються у висоту: міряємо довшу сторону.
  expect(Math.max(pic.width, pic.height), `${name}: the stage pictures are big enough to search`).toBeGreaterThan(300);
  expect(share, `${name}: the pictures take ${Math.round(share * 100)} % of the stage width`).toBeGreaterThanOrEqual(minShare);
}

async function spotdiffGame29d() {
  // ── Редактор: класика з одним запитанням → класика зі «Знайди відмінності» → «Головоломки» (судоку й пошук на 2 кола); у бліці типу немає. ──
  const host = await open('host29d', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host29d@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Відмінності 29d');
  await host.locator('details.rules').first().locator('summary').click();
  await select27b(host, 'Показувати рейтинг', 'end');
  await questionText(host).fill('Столиця України?');
  await field(host, 'Варіант 1').fill('Львів');
  await field(host, 'Варіант 2').fill('Київ');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Час, с').fill('30');

  await click(host, '+ Раунд');
  await click(host, 'Класичний');
  const types = host.getByRole('group', { name: 'Тип запитання', ...exact });
  await types.getByRole('button', { name: 'відмінності', ...exact }).click();
  expect(await field(host, 'Час, с').inputValue(), 'the default spotdiff time').toBe('90');
  await expect.poll(() => field(host, 'Бали').inputValue(), POLL).toBe('300');
  expect(await host.getByLabel('Відео з YouTube', exact).count(), 'a spotdiff has no video').toBe(0);
  await questionText(host).fill('Знайдіть три відмінності');
  await uploadPics29d(host);
  for (const spot of SPOTS29D) await placeCircle29d(host, spot.x, spot.y);
  await host.locator('.spotdiff-editor-row output').getByText('Відмінностей: 3 з 10', exact).waitFor();
  // Кола дзеркально й на першій картинці.
  expect(await host.locator('.spotdiff-frame.is-mirror .spotdiff-circles circle').count(), 'mirrored circles').toBe(3);
  // Третє коло більшає: дотик у колі й перетягування на 0,1 ширини праворуч.
  const c3 = await editorPoint29d(host, SPOTS29D[2]!.x, SPOTS29D[2]!.y);
  await host.mouse.move(c3.x, c3.y);
  await host.mouse.down();
  await host.mouse.move(c3.x + 0.1 * c3.width, c3.y, { steps: 8 });
  await host.mouse.up();
  await expect.poll(async () => Number(await host.locator('.spotdiff-frame.is-draw .spotdiff-circles circle').nth(2).getAttribute('r')), POLL).toBeGreaterThan(0.09);
  await field(host, 'Час, с').fill('40');
  await shot(host, 'spotdiff29d-editor');

  // Окреме чернеткове запитання: десять кіл, одинадцяте не ставиться; потім запитання видаляється.
  await click(host, 'Додати запитання');
  await types.getByRole('button', { name: 'відмінності', ...exact }).click();
  await questionText(host).fill('Чернетка');
  await uploadPics29d(host);
  for (let k = 0; k < 10; k++) await placeCircle29d(host, 0.1 + 0.2 * (k % 5), k < 5 ? 0.2 : 0.8);
  const eleventh = await editorPoint29d(host, 0.5, 0.5);
  await host.mouse.click(eleventh.x, eleventh.y);
  await host.getByRole('alert').getByText('Не більше 10 відмінностей.', exact).waitFor();
  expect(await host.locator('.spotdiff-frame.is-draw .spotdiff-circles circle').count(), 'the eleventh circle').toBe(10);
  await host.locator('.spotdiff-editor-row output').getByText('Відмінностей: 10 з 10', exact).waitFor();
  await host.getByRole('button', { name: 'Видалити запитання 2', ...exact }).click();
  await expect.poll(() => host.getByRole('button', { name: 'Видалити запитання 2', ...exact }).count(), POLL).toBe(0);

  await click(host, '+ Раунд');
  await click(host, 'Головоломки');
  await types.getByRole('button', { name: 'судоку', ...exact }).waitFor();
  expect(await types.getByRole('button', { name: 'відмінності', ...exact }).count(), 'a spotdiff in the puzzles round').toBe(1);
  await field(host, 'Час, с').fill('60');
  await click(host, 'Додати запитання');
  await types.getByRole('button', { name: 'відмінності', ...exact }).click();
  await questionText(host).fill('Знайдіть дві відмінності');
  await uploadPics29d(host, 2);
  for (const spot of SPOTS29D.slice(0, 2)) await placeCircle29d(host, spot.x, spot.y);
  await field(host, 'Час, с').fill('30');

  await click(host, '+ Раунд');
  await click(host, 'Бліц');
  await types.getByRole('button', { name: 'один варіант', ...exact }).waitFor();
  expect(await types.getByRole('button', { name: 'відмінності', ...exact }).count(), 'a spotdiff in the blitz menu').toBe(0);
  await click(host, 'Видалити раунд');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Відмінності 29d' }).waitFor();

  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Відмінності 29d')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { type: string; questions: { type: string }[] }[] };
  expect(stored.rounds.map((round) => round.type)).toEqual(['classic', 'classic', 'puzzles']);
  expect(stored.rounds[1]!.questions.map((q) => q.type), 'the draft question was removed').toEqual(['spotdiff']);
  expect(stored.rounds[2]!.questions.map((q) => q.type)).toEqual(['sudoku', 'spotdiff']);
  const big = stored.rounds[1]!.questions[0] as StoredSpotdiff29d;
  const small = stored.rounds[2]!.questions[1] as StoredSpotdiff29d;
  expect(big).toMatchObject({ type: 'spotdiff', imageUrl: null, timeLimit: 40, points: 300 });
  expect(big.original).toMatch(/^\/uploads\/[\w-]+\.png$/);
  expect(big.changed).toMatch(/^\/uploads\/[\w-]+\.png$/);
  expect(big.changed).not.toBe(big.original);
  expect(big.aspect).toBeCloseTo(4 / 3, 3);
  expect(big.spots.length).toBe(3);
  for (const [k, spot] of big.spots.entries()) {
    expect(spot.x, `circle ${k + 1} x`).toBeCloseTo(SPOTS29D[k]!.x, 2);
    expect(spot.y, `circle ${k + 1} y`).toBeCloseTo(SPOTS29D[k]!.y, 2);
  }
  expect(big.spots[0]!.r).toBeCloseTo(0.06, 5);
  expect(big.spots[2]!.r, 'the dragged circle').toBeGreaterThan(0.09);
  expect(small).toMatchObject({ timeLimit: 30 });
  expect(small.spots.length).toBe(2);
  const spots = big.spots;

  // ── Гра: сцена 1600 × 900; Оля 320 × 640 — пальцем; Тарас 360 × 740 і Петро 375 × 812 — миша. ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29d', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya29d', 320, 640, { hasTouch: true, isMobile: true });
  const olyaFrames = socketFrames(olya);
  const taras = await open('taras29d', 360, 740);
  const tarasFrames = socketFrames(taras);
  const petro = await open('petro29d', 375, 812);
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();
  const phones = [olya, taras, petro];
  const scores = async (wanted: [string, string, string]) => {
    for (const [at, page] of phones.entries()) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(wanted[at]);
  };
  const stageCount = (name: string) => spotCount29d(stage, '.spotdiff-stage', name);

  // ── Раунд 1: класичне запитання (Петро — хибно). ──
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await petro.getByRole('button', { name: /Львів/ }).click();
  await reveal28a(host);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // ── Раунд 2: «Знайди відмінності» (40 с) — номер у раунді 0, індекс у plays 1. ──
  for (const page of phones) await spotPic29d(page, 'changed').locator('img').waitFor();
  const shown = stateViews(olyaFrames).reverse().find((view) => view.question?.spotdiff !== undefined)!;
  expect(shown.questionIndex, 'the phone’s question number in the round').toBe(0);
  expect(shown.question!.spotdiff).toMatchObject({ original: big.original, changed: big.changed, total: 3, spots: null });
  await expect.poll(() => stage.locator('.spotdiff-stage .spotdiff-card').count(), POLL).toBe(3);
  expect(await stageCount('Оля')).toBe('0 з 3');

  // Оля (320 px, пальцем): картинки одна над одною; тап на 40 px за краєм кола — промах, на 20 px — знахідка.
  const [first, second] = await Promise.all([spotPic29d(olya, 'original').boundingBox(), spotPic29d(olya, 'changed').boundingBox()]);
  expect(second!.y, 'the pictures are stacked at 320 px').toBeGreaterThanOrEqual(first!.y + first!.height - 1);
  for (const box of [first!, second!]) {
    expect(box.x, 'a picture starts off screen at 320 px').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, 'a picture ends off screen at 320 px').toBeLessThanOrEqual(320);
  }
  const olyaWidth = first!.width;
  console.log(`spotdiff 29d: a picture on the 320 px phone is ${Math.round(olyaWidth)} px wide → slack ${Math.round(Math.max(0.04 * olyaWidth, 24))} px`);
  expect(olyaWidth, 'the slack is the 24 px minimum on this phone').toBeLessThan(600);
  const edge = spots[0]!.r * olyaWidth;
  await tapShare29d(olya, 'changed', spots[0]!.x, spots[0]!.y, { via: 'touch', dy: edge + 40 });
  await olya.locator('.spot-play .spot-miss').first().waitFor();
  await sleep(300);
  expect(await rings29d(olya), 'a tap 40 px off the circle').toBe(0);
  await tapShare29d(olya, 'changed', spots[0]!.x, spots[0]!.y, { via: 'touch', dy: edge + 20 });
  await expect.poll(() => rings29d(olya), POLL).toBe(1);
  await expect.poll(() => stageCount('Оля'), POLL).toBe('1 з 3');
  await sleep(200);
  // Друге — тапом по першій картинці (кільце — на обох), третє — по другій.
  await find29d(olya, spots, 1, { via: 'touch', picture: 'original' });
  expect(await olya.locator('.spot-play .spot-pic[data-pic="original"] .spot-ring').count(), 'rings on the first picture too').toBe(2);
  await expectNoSideScroll(olya, 'spotdiff29d-phone-320');
  await find29d(olya, spots, 2, { via: 'touch' });
  await olya.getByText(/^Усе знайдено за [\d,]+ с\. Чекаємо інших$/).first().waitFor();
  await expect.poll(() => stageCount('Оля'), POLL).toMatch(/^3 з 3 ✓ [\d,]+ с$/);

  // Тарас: два з трьох.
  await find29d(taras, spots, 2);
  await find29d(taras, spots, 0);
  await expect.poll(() => stageCount('Тарас'), POLL).toBe('2 з 3');

  // Петро: три промахи поспіль — заморозка на секунду; тап по колу в цей час нічого не дає, після неї той самий тап — знахідка.
  for (const miss of MISSES29D) {
    await tapShare29d(petro, 'changed', miss.x, miss.y);
    await sleep(250);
  }
  const frozen = petro.locator('.spot-play .spot-pic.spot-frozen[data-pic="changed"]');
  await frozen.waitFor({ timeout: 2000 });
  const frozenAt = Date.now();
  await petro.getByText('Пауза.', exact).first().waitFor();
  await shot(petro, 'spotdiff29d-phone-frozen');
  await tapShare29d(petro, 'changed', spots[1]!.x, spots[1]!.y);
  await sleep(300);
  if (Date.now() - frozenAt < 900) expect(await stageCount('Петро'), 'a tap while frozen').toBe('0 з 3');
  expect(await rings29d(petro), 'a ring after a tap while frozen').toBe(0);
  await frozen.waitFor({ state: 'detached', timeout: 3000 });
  console.log(`spotdiff 29d: the freeze lasted about ${Date.now() - frozenAt} ms after it showed`);
  expect(await stageCount('Петро'), 'a tap while frozen').toBe('0 з 3');
  await find29d(petro, spots, 1);
  await expect.poll(() => stageCount('Петро'), POLL).toBe('1 з 3');
  expect(petroFrames.join(NL), 'the third miss freezes').toContain('spotdiff_freeze');

  // Сцена до розкриття: жодного кола й жодних місць у кадрах; пульт бачить кола з номерами й лічильники.
  expect(await stage.locator('.spotdiff-stage .spot-ring').count(), 'circles on the stage before reveal').toBe(0);
  for (const view of stateViews(stageFrames)) if (view.question?.spotdiff !== undefined) expect(view.question.spotdiff.spots, 'spots in a stage frame before reveal').toBeNull();
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectSpotdiffStageFits29d(stage, 'question');
  await shot(stage, 'spotdiff29d-stage');
  await expect.poll(() => host.locator('.host-spotdiff .spot-pic[data-pic="changed"] .spot-ring').count(), POLL).toBe(3);
  for (const [k, count] of [2, 2, 2].entries()) await host.locator(`.host-spotdiff .spotdiff-legend li[data-spot="${k}"]`).getByText(`Знайшли: ${count}`).waitFor();
  await expect.poll(() => spotCard29d(host, '.host-spotdiff', 'Тарас').locator('.spotdiff-card-spots').textContent(), POLL).toBe('3, 1');
  // Панель пульта — колонка flex: картинки мають свою висоту й стоять над картками, а не налазять на наступну панель.
  const hostPic = (await host.locator('.host-spotdiff .spot-pic').first().boundingBox())!;
  const hostCard = (await host.locator('.host-spotdiff .spotdiff-card').first().boundingBox())!;
  const hostPanel = (await host.locator('.host-spotdiff').boundingBox())!;
  expect(hostPic.height, 'the host pictures are squeezed').toBeGreaterThan(150);
  expect(hostCard.y, 'the host cards sit under the pictures').toBeGreaterThan(hostPic.y + hostPic.height);
  expect(hostPanel.y + hostPanel.height, 'the host cards stay inside the panel').toBeGreaterThanOrEqual(hostCard.y + hostCard.height);
  await shot(host, 'spotdiff29d-host');
  // Повний кадр пульта перекриває липка панель кнопок: окремо — сама панель «Знайди відмінності» з легендою й картками.
  if (process.env.E2E_SHOTS === '1') {
    await host.setViewportSize({ width: 1280, height: 2400 });
    await sleep(300);
    await host.locator('.host-spotdiff').screenshot({ path: resolve(ARTIFACTS, 'shots', 'spotdiff29d-host-panel.png') });
    await host.setViewportSize({ width: 1280, height: 900 });
  }

  // Тарас не встигає: час виходить.
  await taras.getByText('Час вийшов.', exact).first().waitFor({ timeout: 60_000 });
  await reveal28a(host);
  const table = stage.locator('.spotdiff-stage.is-reveal .spotdiff-table');
  await table.waitFor();
  await expect.poll(() => stage.locator('.spotdiff-stage.is-reveal .spot-pic[data-pic="changed"] .spot-ring').count(), POLL).toBe(3);
  expect(await stage.locator('.spotdiff-stage.is-reveal .spot-pic[data-pic="original"] .spot-ring').count(), 'circles on both stage pictures').toBe(3);
  const boards = spotBoards29d(stageFrames);
  expect(boards.map((board) => [board.nickname, board.found, board.points]), 'the reveal order and points').toEqual([['Оля', 3, 300], ['Тарас', 2, 200], ['Петро', 1, 100]]);
  const rows = await table.locator('tbody tr').evaluateAll((all) => all.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '')));
  expect(rows.map((row) => [row[0], row[1], row[3]]), 'the reveal table').toEqual([['1', 'Оля', '+300'], ['2', 'Тарас', '+200'], ['3', 'Петро', '+100']]);
  expect(rows[0]![2]).toMatch(/^3 з 3 · [\d,]+ с$/);
  expect(rows[2]![2]).toBe('1 з 3');
  await scores(['300', '200', '100']);
  await petro.locator('.spot-reveal .spot-pic[data-pic="changed"] .spot-ring').nth(2).waitFor();
  expect(await petro.locator('.spot-reveal .spot-pic[data-pic="changed"] .spot-ring.is-missed').count(), 'Petro’s missed circles are dashed').toBe(2);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectSpotdiffStageFits29d(stage, 'reveal', 0.55);
  // Таблиця поруч з великими картинками вужча, але ніки в ній не обрізаються.
  expect(await table.locator('td.name').evaluateAll((all) => all.filter((td) => td.scrollWidth > td.clientWidth + 1).map((td) => td.textContent)), 'cut nicknames in the reveal table').toEqual([]);
  await shot(stage, 'spotdiff29d-reveal-stage');
  await shot(olya, 'spotdiff29d-phone-320-reveal');
  for (const frames of [olyaFrames, tarasFrames, petroFrames]) expect(frames.join(NL), 'a stale refusal').not.toContain('spotdiff_stale');

  // ── Раунд 3 «Головоломки»: судоку, потім пошук на 2 кола — номер у раунді 1; усі знаходять усе, запитання закривається саме. ──
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await page.locator('.sudoku-play').waitFor();
  for (const page of phones) await done28d(page);
  await reveal28a(host);
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await spotPic29d(page, 'changed').locator('img').waitFor();
  const later = stateViews(petroFrames).reverse().find((view) => view.question?.spotdiff !== undefined)!;
  expect(later.questionIndex, 'the spotdiff after the sudoku is number 1 in the round').toBe(1);
  expect(later.question!.spotdiff).toMatchObject({ changed: small.changed, total: 2 });
  for (const page of phones) expect(await rings29d(page), 'a fresh board for another spotdiff').toBe(0);
  const sentFrom = [olyaFrames.length, tarasFrames.length, petroFrames.length];
  for (const k of [0, 1]) await find29d(olya, small.spots, k, { via: 'touch' });
  for (const k of [1, 0]) await find29d(taras, small.spots, k);
  for (const k of [0, 1]) await find29d(petro, small.spots, k, { picture: 'original' });
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor({ timeout: 10_000 });
  await stage.getByText('Відповіли 3 з 3', exact).first().waitFor();
  for (const [at, frames] of [olyaFrames, tarasFrames, petroFrames].entries()) {
    const sent = frames.slice(sentFrom[at]).join(NL);
    expect(sent, 'a stale refusal in the puzzles round').not.toContain('spotdiff_stale');
    expect(sent, 'a refused tap in the puzzles round').not.toMatch(/spotdiff_(miss|done|found|freeze|frozen)/);
  }
  await reveal28a(host);
  await expect.poll(() => stage.locator('.spotdiff-stage.is-reveal .spotdiff-table tbody tr.is-done').count(), POLL).toBe(3);
  await scores(['600', '500', '400']);
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

async function spotdiffTeams29d() {
  const host = await open('host29dt', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host29dt@example.com');
  // Вертикальні картинки 450 × 800 (9 : 16): на телефоні стоять поруч навіть на 320 px.
  const pics = await apiPics29d(host, 3, [450, 800]);
  const spots = SPOTS29D.map((spot) => ({ ...spot, r: 0.08 }));
  const question = spotdiff29d('t29d', spots, 120, pics, 300, 450 / 800);
  const data = {
    ...makeRoundsQuiz([classicRound('ct29d', [{ ...withId(single, 'ct1'), timeLimit: 30 }], { speedBonus: false }), classicRound('st29d', [question as never], { speedBonus: false })], {
      leaderboard: 'end',
      teams: { count: 2, names: ['Соняшники', 'Маки'] },
    }),
    title: 'Відмінності команд 29d',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Відмінності команд 29d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29dt', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya29dt', 375, 812);
  const taras = await open('taras29dt', 360, 740);
  const tarasFrames = socketFrames(taras);
  const petro = await open('petro29dt', 375, 812);
  const hanna = await open('hanna29dt', 320, 640, { hasTouch: true, isMobile: true });
  const phones = [olya, taras, petro, hanna];
  for (const [page, nickname, team] of [
    [olya, 'Оля', 'Соняшники'],
    [taras, 'Тарас', 'Соняшники'],
    [petro, 'Петро', 'Маки'],
    [hanna, 'Ганна', 'Маки'],
  ] as const) {
    await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
  }
  await expect.poll(() => stageTeam(stage, 'Соняшники'), POLL).toEqual(['Оля', 'Тарас']);
  await expect.poll(() => stageTeam(stage, 'Маки'), POLL).toEqual(['Петро', 'Ганна']);
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  // Класичне запитання першого раунду: без відповідей.
  await reveal28a(host);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await spotPic29d(page, 'changed').locator('img').waitFor();
  const stageCount = (name: string) => spotCount29d(stage, '.spotdiff-stage', name);
  await expect.poll(() => stage.locator('.spotdiff-stage .spotdiff-card').count(), POLL).toBe(2);
  // Вертикальні картинки на 320 px: поруч, кожна на всю свою половину й цілком у вікні.
  for (const page of [hanna, taras]) {
    const [left, right] = await Promise.all([spotPic29d(page, 'original').boundingBox(), spotPic29d(page, 'changed').boundingBox()]);
    const viewport = page.viewportSize()!;
    console.log(`spotdiff 29d: tall pictures on a ${viewport.width} px phone — ${Math.round(left!.width)}×${Math.round(left!.height)} each`);
    expect(Math.abs(left!.y - right!.y), 'tall pictures stand side by side').toBeLessThan(2);
    expect(right!.x, 'the changed picture is to the right').toBeGreaterThan(left!.x + left!.width - 1);
    expect(left!.width * 2, 'two tall pictures fill the phone width').toBeGreaterThan(viewport.width * 0.8);
    expect(left!.y + left!.height, 'a tall picture fits the screen').toBeLessThanOrEqual(viewport.height);
  }
  await shot(hanna, 'spotdiff29d-teams-phone-320-tall');

  // ── Оля знаходить коло 1: кільце й у Тараса; тап Тараса по ньому — ні промаху, ні знахідки. ──
  await find29d(olya, spots, 0);
  await expect.poll(() => rings29d(taras), POLL).toBe(1);
  expect(await rings29d(petro), 'a Sunflowers find on a Poppies phone').toBe(0);
  const tarasFrom = tarasFrames.length;
  await tapShare29d(taras, 'changed', spots[0]!.x, spots[0]!.y);
  await expect.poll(() => tarasFrames.slice(tarasFrom).join(NL), POLL).toContain('spotdiff_found');
  await sleep(300);
  expect(await taras.locator('.spot-play .spot-miss').count(), 'a cross for a teammate’s find').toBe(0);
  expect(await rings29d(taras)).toBe(1);
  expect(await stageCount('Соняшники')).toBe('1 з 3');

  // ── Оля тричі промахується й замерзає; Тарас тим часом знаходить друге коло. ──
  for (const miss of MISSES29D) {
    await tapShare29d(olya, 'changed', miss.x, miss.y);
    await sleep(250);
  }
  await olya.locator('.spot-play .spot-pic.spot-frozen[data-pic="changed"]').waitFor({ timeout: 2000 });
  expect(await taras.locator('.spot-play .spot-frozen').count(), 'a teammate’s freeze').toBe(0);
  await tapShare29d(taras, 'changed', spots[1]!.x, spots[1]!.y);
  await expect.poll(() => rings29d(taras), POLL).toBe(2);
  await expect.poll(() => rings29d(olya), POLL).toBe(2);
  await shot(taras, 'spotdiff29d-teams-phone');
  // Маки: Ганна (320 px, пальцем) знаходить одне.
  await find29d(hanna, spots, 2, { via: 'touch' });
  await expect.poll(() => rings29d(petro), POLL).toBe(1);
  await expect.poll(() => stageCount('Соняшники'), POLL).toBe('2 з 3');
  await expect.poll(() => stageCount('Маки'), POLL).toBe('1 з 3');
  expect(await stage.locator('.spotdiff-stage .spot-ring').count(), 'circles on the teams stage before reveal').toBe(0);
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectSpotdiffStageFits29d(stage, 'teams question');
  await shot(stage, 'spotdiff29d-teams-stage');
  await expectNoSideScroll(hanna, 'spotdiff29d-teams-phone-320');

  // ── Перезапуск сервера посеред пошуку: знахідки на місці, телефони тапають далі. ──
  const t0 = Date.now();
  const mark = (what: string) => console.log(`spotdiff 29d: teams restart — ${what} at ${Date.now() - t0} ms`);
  await restart(async () => {
    mark('the server stopped');
    await stage.getByText(RESTARTING_TEXT, exact).waitFor({ timeout: 15_000 });
  });
  mark('the server is up');
  for (const page of [stage, ...phones, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  mark('every page is back');
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click({ timeout: 15_000 });
  for (const page of [olya, taras]) await expect.poll(() => rings29d(page), POLL).toBe(2);
  for (const page of [petro, hanna]) await expect.poll(() => rings29d(page), POLL).toBe(1);
  await expect.poll(() => stageCount('Соняшники'), POLL).toBe('2 з 3');
  await olya.locator('.spot-play .spot-pic.is-tap[data-pic="changed"]').waitFor();
  await find29d(olya, spots, 2);
  await expect.poll(() => rings29d(taras), POLL).toBe(3);
  await taras.getByText(/^Усе знайдено за [\d,]+ с\. Чекаємо інших$/).first().waitFor();
  await expect.poll(() => stageCount('Соняшники'), POLL).toMatch(/^3 з 3 ✓/);
  await reveal28a(host);
  await stage.locator('.spotdiff-stage.is-reveal .spotdiff-table').waitFor();
  const boards = spotBoards29d(stageFrames);
  expect(boards.map((board) => [board.nickname, board.found, board.points])).toEqual([['Соняшники', 3, 300], ['Маки', 1, 100]]);
  for (const [page, score] of [[olya, '300'], [taras, '300'], [petro, '100'], [hanna, '100']] as const) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(score);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectSpotdiffStageFits29d(stage, 'teams reveal');
  await shot(stage, 'spotdiff29d-teams-reveal-stage');
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

/** 24 гравці без браузера (сокети): два промахи в кутку, потім від 0 до 3 знахідок; лічильники на сцені 1600 × 900 без прокрутки. */
async function spotdiffCrowd29d(sockets: Socket[]) {
  const host = await open('host29dc', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host29dc@example.com');
  const pics = await apiPics29d(host);
  const spots = SPOTS29D.map((spot) => ({ ...spot, r: 0.06 }));
  const question = spotdiff29d('c29d', spots, 60, pics);
  const data = { ...makeRoundsQuiz([puzzlesRound('pc29d', [question as never])], { leaderboard: 'end' }), title: 'Відмінності натовпу 29d' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Відмінності натовпу 29d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29dc', 1600, 900);
  await stage.goto(stageUrl);
  const names = [
    'Олександра Петренко', 'Богдана Коваленко', 'Ярослав Шевченко', 'Мирослава Бондар', 'Владислав Ткаченко', 'Анастасія Мельник',
    'Святослав Кравчук', 'Христина Олійник', 'Станіслав Лисенко', 'Катерина Руденко', 'Остап Марченко', 'Соломія Савченко',
    'Тарас Гончаренко', 'Ірина Кузьменко', 'Максим Литвиненко', 'Вероніка Захарчук', 'Назар Поліщук', 'Злата Тимошенко',
    'Дмитро Павленко', 'Олена Кириленко', 'Роман Мороз', 'Оксана Бойко', 'Левко Гнатюк', 'Дарина Ковальчук',
  ];
  const players: { nickname: string; socket: Socket }[] = [];
  for (const nickname of names) {
    const response = await fetch(`${base}/api/games/by-code/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname }) });
    expect(response.status, nickname).toBe(201);
    const { token } = (await response.json()) as { token: string };
    const socket = connectSocket(base, { auth: { code, role: 'player', token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((done, fail) => {
      socket.once('connect', () => done());
      socket.once('connect_error', fail);
    });
    players.push({ nickname, socket });
  }
  const emit = <T,>(socket: Socket, event: string, payload: unknown) => new Promise<T>((done) => socket.emit(event, payload, done));
  await click(host, 'Почати гру');
  await afterSplash(host, stage);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage);
  await stage.locator('.spotdiff-stage').waitFor();
  await expect.poll(() => stage.locator('.spotdiff-stage .spotdiff-card').count(), POLL).toBeGreaterThan(0);
  let seed = 29;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  // Кожен: два промахи в лівому нижньому кутку (випадкові точки), далі k % 4 знахідок; кожен четвертий знаходить усі 3.
  const plans = players.map((player, k) => ({
    player,
    taps: [
      ...[0, 1].map(() => ({ x: random() * 0.1, y: 0.88 + random() * 0.1, hit: false })),
      ...Array.from({ length: k % 4 }, (_, j) => ({ ...spots[(k + j) % 3]!, hit: true })),
    ],
    width: 200 + Math.floor(random() * 800),
  }));
  await Promise.all(
    plans.map(async ({ player, taps, width }) => {
      for (const tap of taps) {
        const payload = { questionIndex: 0, x: tap.x, y: tap.y, width };
        let ack = await emit<{ ok: boolean; error?: string }>(player.socket, 'player:spotdiff', payload);
        for (let tries = 0; !ack.ok && ack.error === 'too_soon' && tries < 10; tries++) {
          await sleep(300);
          ack = await emit<{ ok: boolean; error?: string }>(player.socket, 'player:spotdiff', payload);
        }
        expect(ack, `${player.nickname} taps ${tap.x.toFixed(2)}, ${tap.y.toFixed(2)}`).toEqual(tap.hit ? { ok: true } : { ok: false, error: 'spotdiff_miss' });
        await sleep(200);
      }
    }),
  );
  await expect.poll(() => stage.locator('.spotdiff-stage .spotdiff-card.is-done').count(), POLL).toBeGreaterThan(0);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectNoSideScroll(stage, 'spotdiff29d-24-stage');
  await expectSpotdiffStageFits29d(stage, '24 players');
  const cards = await stage.locator('.spotdiff-stage .spotdiff-card').count();
  console.log(`spotdiff 29d: ${cards} cards on a stage page for 24 players`);
  const clipped = await stage.locator('.spotdiff-stage .spotdiff-card-name').evaluateAll((all) => all.filter((el) => el.getBoundingClientRect().width < 40).map((el) => el.textContent));
  expect(clipped, 'names squeezed to nothing').toEqual([]);
  await reveal28a(host);
  await stage.locator('.spotdiff-stage.is-reveal .spotdiff-table').waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectSpotdiffStageFits29d(stage, '24 players reveal');
  await shot(stage, 'spotdiff29d-24-reveal-stage');

  expect(problems).toEqual([]);
}
