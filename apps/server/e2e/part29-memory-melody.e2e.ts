import { classicRound, makeRoundsQuiz, puzzlesRound, single, withId } from '@quiz/engine/testing';
import { memoryCardAt, memoryLayout } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, field, questionText, seconds, join, expectNoSideScroll, register, POLL, socketFrames, RESTARTING_TEXT, silentMp3, NL, pickTeamOn, stageTeam, sleep, frame, stateViews, step27a, next27a, phoneScore27a, select27b, toWinners27c, reveal28a, done28d, png29d } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, shot, restart, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 29f і 29e: мемо й мелодія.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 29f: memory after a classic round — pairs with text and picture halves in the editor, a wrong pair closes after a second, the fastest gets the maximum, 320 px', async () => {
  try {
    await memoryGame29f();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 29f: memory in teams — one shared grid, one move at a time, a teammate sees the open card, a restart keeps the pairs, 4×5 at 320 px', async () => {
  try {
    await memoryTeams29f();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 29f: memory with 24 players — the stage mini grids fit 1600×900', async () => {
  const sockets: Socket[] = [];
  try {
    await memoryCrowd29f(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

type Half29f = { text: string; imageUrl?: string };
type Pair29f = { a: Half29f; b: Half29f };
type Grid29f = '3x4' | '4x4' | '4x5';
type StoredMemory29f = { type: 'memory'; grid: Grid29f; pairs: Pair29f[]; seed: number; timeLimit: number; points: number; imageUrl: string | null };

/** «Пам'ять» для API: рівно стільки пар, скільки хоче сітка; картинки-половини — /uploads/…. */
function memory29f(id: string, grid: Grid29f, pairs: Pair29f[], timeLimit: number, seed: number) {
  return { id, text: 'Знайдіть пари', imageUrl: null, video: null, timeLimit, points: 300, type: 'memory' as const, grid, pairs, seed };
}

/** Синтетичний прапор 200 × 140: три кольорові смуги (без справжніх прапорів і фото). */
function flagPng29f(): Buffer {
  const stripes: [number, number, number][] = [[0, 87, 183], [255, 205, 0], [200, 40, 50]];
  return png29d(200, 140, (_x, y) => stripes[Math.min(2, Math.floor((y * 3) / 140))]!);
}

/** Нейтральні пари «країна — столиця». */
const CAPITALS29F: [string, string][] = [
  ['Україна', 'Київ'],
  ['Польща', 'Варшава'],
  ['Франція', 'Париж'],
  ['Японія', 'Токіо'],
  ['Канада', 'Оттава'],
  ['Італія', 'Рим'],
  ['Іспанія', 'Мадрид'],
  ['Німеччина', 'Берлін'],
  ['Австрія', 'Відень'],
  ['Велика Британія', 'Лондон'],
];
const textPairs29f = (count: number): Pair29f[] => CAPITALS29F.slice(0, count).map(([a, b]) => ({ a: { text: a }, b: { text: b } }));

/** Клітинки пари за розкладом із seed: [клітинка половини a, клітинка половини b]. */
function cellsOf29f(question: { pairs: unknown[]; seed: number }, pair: number): [number, number] {
  const layout = memoryLayout(question.pairs.length, question.seed);
  return [layout.indexOf(2 * pair), layout.indexOf(2 * pair + 1)];
}

/** Що має бути в підписі відкритої картки: текст чи слово «Картинка». */
function cardWord29f(question: { pairs: Pair29f[]; seed: number }, cell: number): string {
  const card = memoryCardAt(question, memoryLayout(question.pairs.length, question.seed), cell);
  return card.imageUrl !== undefined ? 'Картинка' : card.text;
}

/** Тап по закритій картці за підписом. */
async function flip29f(page: Page, cell: number) {
  await page.getByRole('button', { name: `Картка ${cell + 1}, закрита`, ...exact }).click();
}

const cardOf29f = (page: Page, cell: number) => page.locator(`.memory-play .memory-card[data-cell="${cell}"]`);
const STATE_LABEL29F = { open: ':', matched: ', знайдено:', shown: ', не пара:' } as const;

/** Чекає, поки картка стане відкритою / показаною / знайденою з даним вмістом. */
async function seeCard29f(page: Page, question: { pairs: Pair29f[]; seed: number }, cell: number, state: keyof typeof STATE_LABEL29F) {
  await expect.poll(() => cardOf29f(page, cell).getAttribute('aria-label'), POLL).toBe(`Картка ${cell + 1}${STATE_LABEL29F[state]} ${cardWord29f(question, cell)}`);
}

const closedCount29f = (page: Page) => page.locator('.memory-play .memory-card.is-closed').count();
const matchedCount29f = (page: Page) => page.locator('.memory-play .memory-card.is-matched').count();

/** Відкриває обидві половини пари підряд і чекає, поки вони стануть знайденими. */
async function match29f(page: Page, question: { pairs: Pair29f[]; seed: number }, pair: number) {
  const [a, b] = cellsOf29f(question, pair);
  await flip29f(page, a);
  await seeCard29f(page, question, a, 'open');
  await flip29f(page, b);
  await seeCard29f(page, question, a, 'matched');
  await seeCard29f(page, question, b, 'matched');
  // Не впертися в ліміт відкриттів (4 за секунду).
  await sleep(250);
}

/** Тон (колір) знайденої картки: клас by-N. */
async function toneOf29f(page: Page, cell: number): Promise<string> {
  const match = /\bby-(\d)\b/.exec((await cardOf29f(page, cell).getAttribute('class')) ?? '');
  return match?.[1] ?? '';
}

/** Телефон у справжньому PlayerScreen: без горизонтальної прокрутки, сітка цілком у вікні; висоти сторінки й вікна — у журнал. */
async function expectMemoryFit29f(page: Page, name: string) {
  const fit = (await page.evaluate(`(() => {
    const grid = document.querySelector('.memory-grid');
    const box = grid.getBoundingClientRect();
    const cards = [...grid.querySelectorAll('.memory-card')].map((el) => el.getBoundingClientRect());
    const cut = [...grid.querySelectorAll('.memory-text')].filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map((el) => el.textContent + ' [' + el.scrollWidth + '/' + el.clientWidth + ' x ' + el.scrollHeight + '/' + el.clientHeight + ', ' + getComputedStyle(el).fontSize + ', card ' + Math.round(el.parentElement.getBoundingClientRect().width) + ']');
    return {
      docScrollH: document.documentElement.scrollHeight, docClientH: document.documentElement.clientHeight,
      scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
      bodyScrollH: document.body.scrollHeight, bodyClientH: document.body.clientHeight,
      above: (() => { const out = []; let el = grid; while (el && el !== document.body) { let sib = el.previousElementSibling; while (sib) { const r = sib.getBoundingClientRect(); if (r.height > 0) out.push(sib.tagName + '.' + sib.className + ' ' + Math.round(r.top) + '-' + Math.round(r.bottom)); sib = sib.previousElementSibling; } el = el.parentElement; } return out.join(' | '); })(),
      lowest: [...document.querySelectorAll('body *')].map((el) => [el.tagName + '.' + el.className, Math.round(el.getBoundingClientRect().bottom)]).sort((x, y) => y[1] - x[1]).slice(0, 5).map((x) => x.join('@')).join(' | '),
      gridBottom: box.bottom, innerH: innerHeight, innerW: innerWidth, right: box.right, card: Math.round(cards[0].width), cut,
    };
  })()`)) as { docScrollH: number; docClientH: number; scrollW: number; clientW: number; bodyScrollH: number; bodyClientH: number; gridBottom: number; innerH: number; innerW: number; right: number; card: number; cut: string[]; lowest: string; above: string };
  console.log(`memory 29f: ${name} — scrollHeight ${fit.docScrollH} vs clientHeight ${fit.docClientH} (body ${fit.bodyScrollH} vs ${fit.bodyClientH}), grid bottom ${Math.round(fit.gridBottom)} of ${fit.innerH}, card ${fit.card} px, scrollWidth ${fit.scrollW} vs ${fit.clientW}; lowest ${fit.lowest}; above the grid ${fit.above}`);
  expect(fit.scrollW, `${name}: horizontal scroll`).toBeLessThanOrEqual(fit.clientW);
  // Сама сітка цілком у вікні; сторінка ж гортається ще на «Гравців завершило…» і запас під нижню смугу (спільна рамка PlayerScreen): це в звіті.
  // 29j: на 320×568 щільніша обв'язка гравця — уся сітка 4×5 (і в команді) у вікні, картки не менші за 52 px.
  expect(fit.gridBottom, `${name}: the grid reaches below the screen`).toBeLessThanOrEqual(fit.innerH);
  expect(fit.card, `${name}: cards stay a tap target`).toBeGreaterThanOrEqual(52);
  expect(fit.right, `${name}: the grid reaches past the right edge`).toBeLessThanOrEqual(fit.innerW);
  expect(fit.cut, `${name}: card texts cut`).toEqual([]);
}

/** Сцена 1600 × 900: без прокрутки, мініатюри, пари й таблиця цілком у вікні. */
async function expectMemoryStageFits29f(stage: Page, name: string) {
  const [height, clientH, width, clientW] = (await stage.evaluate('[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]')) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const out = await stage
    .locator('.memory-stage .memory-board, .memory-stage .memory-reveal-pair, .memory-stage .memory-table, .memory-stage .memory-pairs-box')
    .evaluateAll((all) => all.filter((el) => { const box = el.getBoundingClientRect(); return box.bottom > innerHeight + 1 || box.right > innerWidth + 1 || box.left < -1 || box.top < -1; }).map((el) => el.className));
  expect(out, `${name}: parts outside the stage`).toEqual([]);
}

/** Картка дошки на сцені чи пульті за ім'ям. */
const memBoard29f = (page: Page, scope: string, name: string) => page.locator(`${scope} .memory-board`, { has: page.locator('.memory-board-name', { hasText: new RegExp(`^${name}$`) }) });
const memCount29f = (page: Page, scope: string, name: string) => memBoard29f(page, scope, name).locator('.memory-board-count').textContent();
/** Дошки з останнього кадру сокета, де вони є. */
const memBoards29f = (frames: string[]) => stateViews(frames).reverse().find((view) => view.memory !== undefined)!.memory!.boards;

/** Сеансове сховище чернетки: насіння розкладів усіх запитань «Пам'ять». */
const draftSeeds29f = (page: Page) =>
  page.evaluate(`(() => {
    const seeds = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      try {
        const quiz = JSON.parse(sessionStorage.getItem(sessionStorage.key(i)) ?? 'null');
        for (const round of quiz?.rounds ?? []) for (const question of round.questions ?? []) if (question.type === 'memory') seeds.push(question.seed);
      } catch {}
    }
    return seeds;
  })()`) as Promise<number[]>;

/** Тексти пар у редакторі: починає з пари from. */
async function fillPairs29f(host: Page, pairs: [string, string][], from = 0) {
  for (const [at, [a, b]] of pairs.entries()) {
    await field(host, `Пара ${from + at + 1}: Питання`).fill(a);
    await field(host, `Пара ${from + at + 1}: Відповідь`).fill(b);
  }
}

/** Рахунки на телефонах. */
async function scores29f(phones: Page[], wanted: number[]) {
  for (const [at, page] of phones.entries()) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(String(wanted[at]));
}

async function memoryGame29f() {
  const host = await open('host29f', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host29f@example.com');
  const hostFrames = socketFrames(host);
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Пам’ять 29f');
  await host.locator('details.rules').first().locator('summary').click();
  await select27b(host, 'Показувати рейтинг', 'end');
  await questionText(host).fill('Скільки днів у тижні?');
  await field(host, 'Варіант 1').fill('П’ять');
  await field(host, 'Варіант 2').fill('Сім');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Час, с').fill('30');

  // ── Раунд 2: класичний, «Пам'ять» 3×4: п'ять текстових пар і пара «прапор — країна» із завантаженням. ──
  await click(host, '+ Раунд');
  await click(host, 'Класичний');
  const types = host.getByRole('group', { name: 'Тип запитання', ...exact });
  await types.getByRole('button', { name: 'пам’ять', ...exact }).click();
  expect(await host.getByLabel('Відео з YouTube', exact).count(), 'a memory has no video').toBe(0);
  await host.getByRole('button', { name: '3×4 · 6 пар', ...exact }).waitFor();
  expect(await host.getByRole('button', { name: '3×4 · 6 пар', ...exact }).getAttribute('aria-pressed'), 'the default grid').toBe('true');
  expect(await host.getByRole('group', { name: /^Пара \d+$/ }).count(), 'six pairs on 3×4').toBe(6);
  expect(await field(host, 'Час, с').inputValue(), 'the default memory time').toBe('90');
  const firstFive = CAPITALS29F.slice(0, 5);
  await fillPairs29f(host, firstFive);
  // Шоста пара: картинка-прапор ↔ текст.
  const sixth = host.getByRole('group', { name: 'Пара 6', ...exact });
  const sixthA = sixth.locator('.memory-half').nth(0);
  await sixthA.getByRole('button', { name: 'Картинка', ...exact }).click();
  await sixthA.locator('input[type="file"]').setInputFiles({ name: 'flag.png', mimeType: 'image/png', buffer: flagPng29f() });
  await sixthA.locator('img').waitFor();
  await field(host, 'Пара 6: Відповідь').fill('Італія');
  // Повтор картки: «Польща» вже є в парі 2 — не дозволено; виправлення знімає.
  await field(host, 'Пара 1: Питання').fill('Польща');
  await click(host, 'Зберегти');
  await host.locator('.problems', { hasText: 'однакові картки' }).waitFor();
  await field(host, 'Пара 1: Питання').fill('Україна');
  // «Перемішати» міняє seed (чернетка в сеансовому сховищі).
  await expect.poll(async () => (await draftSeeds29f(host)).length, POLL).toBeGreaterThan(0);
  const seedBefore = (await draftSeeds29f(host))[0]!;
  await click(host, 'Перемішати');
  await host.getByText('Розклад перемішано', exact).waitFor();
  await expect.poll(async () => (await draftSeeds29f(host))[0], POLL).not.toBe(seedBefore);
  await field(host, 'Час, с').fill('60');
  await shot(host, 'memory29f-editor');

  // ── Раунд 3: «Головоломки» — судоку й «Пам'ять» 4×4. ──
  await click(host, '+ Раунд');
  await click(host, 'Головоломки');
  await types.getByRole('button', { name: 'судоку', ...exact }).waitFor();
  expect(await types.getByRole('button', { name: 'пам’ять', ...exact }).count(), 'a memory in the puzzles round').toBe(1);
  await field(host, 'Час, с').fill('60');
  await click(host, 'Додати запитання');
  await types.getByRole('button', { name: 'пам’ять', ...exact }).click();
  await host.getByRole('button', { name: '4×4 · 8 пар', ...exact }).click();
  expect(await host.getByRole('group', { name: /^Пара \d+$/ }).count(), 'eight pairs on 4×4').toBe(8);
  await fillPairs29f(host, CAPITALS29F.slice(0, 8));
  await host.locator('.memory-editor').getByLabel('Час, с', exact).fill('40');

  // Бліц: типу «Пам'ять» у меню немає.
  await click(host, '+ Раунд');
  await click(host, 'Бліц');
  await types.getByRole('button', { name: 'один варіант', ...exact }).waitFor();
  expect(await types.getByRole('button', { name: 'пам’ять', ...exact }).count(), 'a memory in the blitz menu').toBe(0);
  await click(host, 'Видалити раунд');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Пам’ять 29f' }).waitFor();

  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Пам’ять 29f')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { type: string; questions: { type: string }[] }[] };
  expect(stored.rounds.map((round) => round.type)).toEqual(['classic', 'classic', 'puzzles']);
  expect(stored.rounds[2]!.questions.map((q) => q.type)).toEqual(['sudoku', 'memory']);
  const q2 = stored.rounds[1]!.questions[0] as StoredMemory29f;
  const q3 = stored.rounds[2]!.questions[1] as StoredMemory29f;
  expect(q2).toMatchObject({ type: 'memory', grid: '3x4', timeLimit: 60, points: 300, imageUrl: null });
  expect(q2.seed).not.toBe(seedBefore);
  expect(q2.pairs.length).toBe(6);
  expect(q2.pairs.slice(0, 5).map((pair) => [pair.a.text, pair.b.text])).toEqual(firstFive);
  expect(q2.pairs[5]!.a.text).toBe('');
  expect(q2.pairs[5]!.a.imageUrl).toMatch(/^\/uploads\/[\w-]+\.png$/);
  expect(q2.pairs[5]!.b).toEqual({ text: 'Італія' });
  expect(q3).toMatchObject({ grid: '4x4', timeLimit: 40 });
  expect(q3.pairs.length).toBe(8);
  const words2 = [...new Set(q2.pairs.flatMap((pair) => [pair.a.text, pair.b.text]).filter((text) => text !== ''))];

  // ── Гра: сцена 1600 × 900; Оля 360 × 740, Тарас 375 × 812, Петро 320 × 640 (дотик). ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29f', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya29f', 360, 740);
  const olyaFrames = socketFrames(olya);
  const taras = await open('taras29f', 375, 812);
  const tarasFrames = socketFrames(taras);
  const petro = await open('petro29f', 320, 640, { hasTouch: true, isMobile: true });
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();
  const phones = [olya, taras, petro];

  // Раунд 1: класичне запитання (Петро — хибно).
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await petro.getByRole('button', { name: /П’ять/ }).click();
  await reveal28a(host);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // ── Раунд 2: «Пам'ять» — номер у раунді 0, індекс у plays 1. ──
  const framesFrom = { stage: stageFrames.length, host: hostFrames.length, olya: olyaFrames.length, taras: tarasFrames.length, petro: petroFrames.length };
  for (const page of phones) await page.locator('.memory-play .memory-card').first().waitFor();
  const shown = stateViews(olyaFrames).reverse().find((view) => view.question?.memory !== undefined)!;
  expect(shown.questionIndex, 'the phone’s question number in the round').toBe(0);
  expect(shown.question!.memory).toMatchObject({ grid: '3x4', cols: 3, rows: 4, total: 6, pairs: null });
  for (const page of phones) expect(await closedCount29f(page), 'twelve closed cards at the start').toBe(12);
  await expect.poll(() => stage.locator('.memory-stage .memory-board').count(), POLL).toBe(3);
  expect(await memCount29f(stage, '.memory-stage', 'Оля')).toBe('0 з 6');

  // Петро (320 px): жодного тексту закритих карток ні в DOM, ні в кадрах сокета.
  const petroText = await petro.locator('body').innerText();
  for (const word of words2) expect(petroText, `a closed card “${word}” in Petro’s DOM`).not.toContain(word);
  const petroBefore = petroFrames.slice(framesFrom.petro).join(NL);
  for (const word of words2) expect(petroBefore, `a closed card “${word}” in Petro’s frames`).not.toContain(word);
  expect(petroBefore, 'a flag picture in Petro’s frames').not.toContain(q2.pairs[5]!.a.imageUrl!);
  expect(petroBefore, 'a layout seed in Petro’s frames').not.toContain('"seed"');
  expect(petroBefore, 'the pairs in Petro’s frames').not.toMatch(/"pairs":\[/);

  // Непара: відкрито картку пари 1 (a) і пари 2 (a) — обидві видно, червона рамка; тап по третій у цей час нічого не відкриває; за ~1 с обидві закриті.
  const [p0a] = cellsOf29f(q2, 0);
  const [p1a] = cellsOf29f(q2, 1);
  const [p2a] = cellsOf29f(q2, 2);
  await flip29f(petro, p0a);
  await seeCard29f(petro, q2, p0a, 'open');
  expect(await petro.locator('.memory-card.is-open').count()).toBe(1);
  await flip29f(petro, p1a);
  await seeCard29f(petro, q2, p1a, 'shown');
  const wrongAt = Date.now();
  await seeCard29f(petro, q2, p0a, 'shown');
  expect(await petro.locator('.memory-card.is-shown').count(), 'a wrong pair shows two red cards').toBe(2);
  await shot(petro, 'memory29f-phone-wrong-pair');
  if (Date.now() - wrongAt < 700) {
    await petro.getByRole('button', { name: `Картка ${p2a + 1}, закрита`, ...exact }).click({ force: true });
    await sleep(100);
    expect(await petro.getByRole('button', { name: `Картка ${p2a + 1}, закрита`, ...exact }).count(), 'a tap while a wrong pair is shown opens nothing').toBe(1);
  }
  await expect.poll(() => petro.locator('.memory-card.is-shown').count(), { timeout: 3000 }).toBe(0);
  const closedAfter = Date.now() - wrongAt;
  console.log(`memory 29f: a wrong pair stayed ${closedAfter} ms after it showed on the phone`);
  expect(closedAfter, 'a wrong pair closes about a second after it shows').toBeGreaterThan(400);
  expect(closedAfter, 'a wrong pair does not hang open').toBeLessThan(2500);
  expect(await closedCount29f(petro), 'both cards are backs again').toBe(12);
  expect(await petro.getByRole('button', { name: `Картка ${p0a + 1}, закрита`, ...exact }).count()).toBe(1);
  // Петро знаходить дві пари й відкриває ще одну картку — і більше не грає: не встигає.
  await match29f(petro, q2, 0);
  await match29f(petro, q2, 1);
  await flip29f(petro, p2a);
  await seeCard29f(petro, q2, p2a, 'open');
  expect(await matchedCount29f(petro)).toBe(4);
  await expectNoSideScroll(petro, 'memory29f-phone-320');
  await expectMemoryFit29f(petro, 'memory 3×4 at 320×640');
  await expect.poll(() => memCount29f(stage, '.memory-stage', 'Петро'), POLL).toBe('2 з 6');

  // Оля: усі шість пар першою (без жодної помилки).
  const olyaBefore = olyaFrames.slice(framesFrom.olya).join(NL);
  for (const word of words2) expect(olyaBefore, `a closed card “${word}” in Olya’s frames before she flips`).not.toContain(word);
  for (let pair = 0; pair < 6; pair++) await match29f(olya, q2, pair);
  await olya.getByText(/^Усі пари знайдено за [\d,]+ с\. Чекаємо інших$/).first().waitFor();
  await expect.poll(() => memCount29f(stage, '.memory-stage', 'Оля'), POLL).toMatch(/^6 з 6 ✓ [\d,]+ с$/);
  // Картинка-прапор на телефоні цілком.
  const flagCell = cellsOf29f(q2, 5)[0];
  const flag = olya.locator(`.memory-card[data-cell="${flagCell}"] img.memory-img`);
  await expect.poll(() => flag.evaluate((img) => (img as HTMLImageElement).naturalWidth), POLL).toBe(200);
  const flagBox = (await flag.boundingBox())!;
  const flagCard = (await cardOf29f(olya, flagCell).boundingBox())!;
  expect(flagBox.x, 'the flag is whole inside its card (left)').toBeGreaterThanOrEqual(flagCard.x - 1);
  expect(flagBox.x + flagBox.width, 'the flag is whole inside its card (right)').toBeLessThanOrEqual(flagCard.x + flagCard.width + 1);
  expect(flagBox.y + flagBox.height, 'the flag is whole inside its card (bottom)').toBeLessThanOrEqual(flagCard.y + flagCard.height + 1);
  await shot(olya, 'memory29f-phone-done');
  await expectMemoryFit29f(olya, 'memory 3×4 at 360×740');

  // Тарас: одна помилка, потім усі шість — пізніше за Олю.
  const tarasBefore = tarasFrames.slice(framesFrom.taras).join(NL);
  for (const word of words2) expect(tarasBefore, `a closed card “${word}” in Taras’s frames before he flips`).not.toContain(word);
  await flip29f(taras, cellsOf29f(q2, 3)[0]);
  await seeCard29f(taras, q2, cellsOf29f(q2, 3)[0], 'open');
  await flip29f(taras, cellsOf29f(q2, 4)[1]);
  await expect.poll(() => taras.locator('.memory-card.is-shown').count(), POLL).toBe(2);
  await expect.poll(() => taras.locator('.memory-card.is-shown').count(), { timeout: 3000 }).toBe(0);
  for (let pair = 0; pair < 6; pair++) await match29f(taras, q2, pair);
  await taras.getByText(/^Усі пари знайдено за [\d,]+ с\. Чекаємо інших$/).first().waitFor();
  await expect.poll(() => memCount29f(stage, '.memory-stage', 'Тарас'), POLL).toMatch(/^6 з 6 ✓ [\d,]+ с$/);
  await expect.poll(() => memCount29f(host, '.host-memory', 'Тарас'), POLL).toMatch(/^6 з 6 ✓/);

  // Сцена до розкриття: лише лічильники — жодного тексту карток ні в DOM, ні в кадрах; світяться 12 клітинок Олі.
  const stageText = await stage.locator('body').innerText();
  for (const word of words2) expect(stageText, `a card “${word}” on the stage before reveal`).not.toContain(word);
  expect(await stage.locator('.memory-stage img').count(), 'pictures on the stage before reveal').toBe(0);
  expect(await memBoard29f(stage, '.memory-stage', 'Оля').locator('.memory-mini-cell.is-lit').count(), 'lit cells for 6 pairs').toBe(12);
  expect(await memBoard29f(stage, '.memory-stage', 'Петро').locator('.memory-mini-cell.is-lit').count(), 'lit cells for 2 pairs').toBe(4);
  for (const [who, frames, from] of [['stage', stageFrames, framesFrom.stage], ['host', hostFrames, framesFrom.host]] as const) {
    const text = frames.slice(from).join(NL);
    for (const word of words2) expect(text, `a card “${word}” in the ${who} frames before reveal`).not.toContain(word);
    expect(text, `a flag picture in the ${who} frames`).not.toContain(q2.pairs[5]!.a.imageUrl!);
    // Ключ запитання пульта несе лише занулений seed ("seed":0) і порожні пари; справжній розклад не йде нікуди.
    expect(text, `the layout seed in the ${who} frames`).not.toContain(`"seed":${q2.seed}`);
    expect(text, `a non-zero seed in the ${who} frames`).not.toMatch(/"seed":[1-9]/);
    expect(text, `the pairs with text in the ${who} frames`).not.toMatch(/"pairs":\[\{"a":\{"text":"[^"]/);
  }
  await expectMemoryStageFits29f(stage, 'question');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await shot(stage, 'memory29f-stage');
  await expect.poll(() => host.locator('.host-memory .memory-board').count(), POLL).toBe(3);
  await expect.poll(() => memBoard29f(host, '.host-memory', 'Оля').locator('.memory-board-moves').textContent(), POLL).toBe('ходи: 6');
  await shot(host, 'memory29f-host');

  // Петро не встигає: ведучий закриває запитання.
  await reveal28a(host);
  await stage.locator('.memory-stage.is-reveal .memory-table').waitFor();
  expect(await stage.locator('.memory-stage.is-reveal .memory-reveal-pair').count(), 'every pair listed on the reveal').toBe(6);
  expect(await stage.locator('.memory-stage.is-reveal .memory-reveal-pair img').count(), 'the flag in the pair list').toBe(1);
  const revealText = await stage.locator('.memory-stage.is-reveal .memory-pairs-box').innerText();
  for (const word of words2) expect(revealText, `a pair “${word}” on the reveal`).toContain(word);
  const boards = memBoards29f(stageFrames);
  const [boardOlya, boardTaras, boardPetro] = ['Оля', 'Тарас', 'Петро'].map((name) => boards.find((board) => board.nickname === name)!);
  expect(boards.map((board) => board.nickname), 'the reveal order').toEqual(['Оля', 'Тарас', 'Петро']);
  console.log(`memory 29f: Olya ${boardOlya!.timeMs} ms, Taras ${boardTaras!.timeMs} ms`);
  expect(boardOlya!.done && boardTaras!.done && !boardPetro!.done).toBe(true);
  expect(boardTaras!.timeMs!, 'Taras was slower').toBeGreaterThan(boardOlya!.timeMs!);
  expect(boardOlya!.points, 'the fastest gets the maximum').toBe(300);
  const tarasPoints = Math.round((300 * boardOlya!.timeMs!) / boardTaras!.timeMs!);
  expect(boardTaras!.points, 'the second by time').toBe(tarasPoints);
  expect(tarasPoints, 'less than the maximum').toBeLessThan(300);
  expect(boardPetro!.points, 'the one who did not finish').toBe(0);
  expect(boardPetro!.pairs).toBe(2);
  const rows = await stage.locator('.memory-stage.is-reveal .memory-table tbody tr').evaluateAll((all) => all.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '')));
  expect(rows.map((row) => [row[0], row[1], row[3]])).toEqual([['1', 'Оля', '+300'], ['2', 'Тарас', `+${tarasPoints}`], ['—', 'Петро', '0']]);
  expect(rows[0]![2]).toMatch(/^[\d,]+ с$/);
  expect(rows[2]![2]).toBe('2 з 6');
  await scores29f(phones, [300, tarasPoints, 0]);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectMemoryStageFits29f(stage, 'reveal');
  await shot(stage, 'memory29f-reveal-stage');
  await shot(petro, 'memory29f-phone-320-reveal');
  for (const frames of [olyaFrames, tarasFrames, petroFrames]) expect(frames.join(NL), 'a stale refusal').not.toContain('memory_stale');

  // ── Раунд 3 «Головоломки»: судоку, потім «Пам'ять» 4×4 — номер у раунді 1; відкриття проходять. ──
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await page.locator('.sudoku-play').waitFor();
  for (const page of phones) await done28d(page);
  await reveal28a(host);
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await page.locator('.memory-play .memory-card').first().waitFor();
  const later = stateViews(petroFrames).reverse().find((view) => view.question?.memory !== undefined)!;
  expect(later.questionIndex, 'the memory after the sudoku is number 1 in the round').toBe(1);
  expect(later.question!.memory).toMatchObject({ grid: '4x4', total: 8 });
  for (const page of phones) expect(await closedCount29f(page), 'a fresh 4×4 board').toBe(16);
  const sentFrom = [olyaFrames.length, tarasFrames.length, petroFrames.length];
  await match29f(olya, q3, 0);
  await match29f(taras, q3, 1);
  await match29f(petro, q3, 2);
  for (const [at, frames] of [olyaFrames, tarasFrames, petroFrames].entries()) {
    expect(frames.slice(sentFrom[at]).join(NL), 'a refused flip in the puzzles round').not.toMatch(/memory_(stale|wait|busy|done|cell|matched|open)/);
  }
  await expect.poll(() => memCount29f(stage, '.memory-stage', 'Оля'), POLL).toBe('1 з 8');
  await reveal28a(host);
  await stage.locator('.memory-stage.is-reveal .memory-table').waitFor();
  expect(await stage.locator('.memory-stage.is-reveal .memory-reveal-pair').count()).toBe(8);
  await scores29f(phones, [300, tarasPoints, 0]);
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

async function memoryTeams29f() {
  const host = await open('host29ft', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host29ft@example.com');
  // 29k: назва запитання на два-три рядки на 320 px — сітка 4×5 усе одно вміщається (розмір картки міряється в рантаймі).
  const question = { ...memory29f('t29f', '4x5', textPairs29f(10), 120, 2911), text: 'Знайдіть усі пари «країна — столиця» якнайшвидше, відкриваючи по дві картки за раз, і не забудьте, що ходить уся команда' };
  const q = { pairs: question.pairs as Pair29f[], seed: question.seed };
  const data = {
    ...makeRoundsQuiz([classicRound('ct29f', [{ ...withId(single, 'ct1'), timeLimit: 30 }], { speedBonus: false }), classicRound('mt29f', [question as never], { speedBonus: false })], {
      leaderboard: 'end',
      teams: { count: 2, names: ['Соняшники', 'Маки'] },
    }),
    title: 'Пам’ять команд 29f',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Пам’ять команд 29f' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29ft', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya29ft', 375, 812);
  const taras = await open('taras29ft', 320, 568, { hasTouch: true, isMobile: true });

  const petro = await open('petro29ft', 375, 812);
  const hanna = await open('hanna29ft', 360, 740);
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
  await reveal28a(host);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await page.locator('.memory-play .memory-card').first().waitFor();
  for (const page of phones) expect(await closedCount29f(page), 'twenty closed cards on 4×5').toBe(20);
  await expect.poll(() => stage.locator('.memory-stage .memory-board').count(), POLL).toBe(2);
  const stageCount = (name: string) => memCount29f(stage, '.memory-stage', name);
  const cell = (pair: number, side: 0 | 1) => cellsOf29f(q, pair)[side];

  // ── Оля (А) відкриває картку: Тарас (Б) бачить її й рядок «Оля ходить»; тап Тараса нічого не відкриває. ──
  await flip29f(olya, cell(0, 0));
  await seeCard29f(olya, q, cell(0, 0), 'open');
  await seeCard29f(taras, q, cell(0, 0), 'open');
  await expect.poll(() => taras.locator('.memory-busy').textContent(), POLL).toBe('Оля ходить');
  expect(await olya.locator('.memory-busy').count(), 'a busy line for the one who moves').toBe(0);
  await shot(taras, 'memory29f-teams-phone');
  // force: картка aria-disabled, а звичайний click чекає, поки вона стане активною (хід Олі спливе за 5 с).
  await taras.getByRole('button', { name: `Картка ${cell(1, 0) + 1}, закрита`, ...exact }).click({ force: true });
  await sleep(500);
  expect(await taras.getByRole('button', { name: `Картка ${cell(1, 0) + 1}, закрита`, ...exact }).count(), 'a teammate’s tap while Olya moves').toBe(1);
  expect(await taras.locator('.memory-card.is-open').count()).toBe(1);
  await expectMemoryFit29f(taras, 'memory 4×5 at 320×568, a card open');
  // Суперники мають свою сітку: Петро картки Олі не бачить.
  expect(await closedCount29f(petro), 'a rival grid is untouched').toBe(20);

  // ── Оля відкриває непару: обидва телефони бачать її, за ~1 с вона закрита. ──
  await flip29f(olya, cell(1, 0));
  for (const page of [olya, taras]) {
    await seeCard29f(page, q, cell(0, 0), 'shown');
    await seeCard29f(page, q, cell(1, 0), 'shown');
  }
  const wrongAt = Date.now();
  await expect.poll(() => closedCount29f(taras), { timeout: 3000 }).toBe(20);
  await expect.poll(() => closedCount29f(olya), { timeout: 3000 }).toBe(20);
  console.log(`memory 29f: a team wrong pair closed ${Date.now() - wrongAt} ms after the shown frame`);

  // ── Ходить Тарас і знаходить пару 1: на телефоні Олі вона кольору Тараса. ──
  await match29f(taras, q, 0);
  await seeCard29f(olya, q, cell(0, 0), 'matched');
  await seeCard29f(olya, q, cell(0, 1), 'matched');
  const tarasTone = await toneOf29f(taras, cell(0, 0));
  expect(tarasTone, 'a tone on Taras’s own find').not.toBe('');
  expect(await toneOf29f(olya, cell(0, 0)), 'Taras’s find on Olya’s phone is Taras’s colour').toBe(tarasTone);
  expect(await toneOf29f(olya, cell(0, 1))).toBe(tarasTone);
  // Оля знаходить пару 2 — інший колір.
  await match29f(olya, q, 1);
  const olyaTone = await toneOf29f(olya, cell(1, 0));
  expect(olyaTone, 'Olya’s own tone').not.toBe('');
  expect(olyaTone, 'two members, two colours').not.toBe(tarasTone);
  expect(await toneOf29f(taras, cell(1, 0)), 'Olya’s find on Taras’s phone is Olya’s colour').toBe(olyaTone);

  // ── Оля відкриває картку й відходить: за 5 с вона закривається, Тарас може ходити. ──
  await flip29f(olya, cell(2, 0));
  await seeCard29f(taras, q, cell(2, 0), 'open');
  const heldAt = Date.now();
  await expect.poll(() => closedCount29f(taras), { timeout: 9000 }).toBe(16);
  const held = Date.now() - heldAt;
  console.log(`memory 29f: an abandoned first card closed after ${held} ms`);
  expect(held, 'an abandoned card is held about 5 s').toBeGreaterThan(3500);
  expect(held, 'an abandoned card does not stay forever').toBeLessThan(8000);
  await expect.poll(() => taras.locator('.memory-busy').count(), POLL).toBe(0);
  await match29f(taras, q, 2);

  // ── Маки: Петро знаходить пару 4 — суперники її не бачать. ──
  await match29f(petro, q, 3);
  await expect.poll(() => matchedCount29f(hanna), POLL).toBe(2);
  expect(await matchedCount29f(olya), 'a Poppies find on a Sunflowers phone').toBe(6);
  expect(await olya.getByRole('button', { name: `Картка ${cell(3, 0) + 1}, закрита`, ...exact }).count()).toBe(1);
  await expect.poll(() => stageCount('Соняшники'), POLL).toBe('3 з 10');
  await expect.poll(() => stageCount('Маки'), POLL).toBe('1 з 10');
  const teamsStageText = await stage.locator('body').innerText();
  for (const word of CAPITALS29F.flat()) expect(teamsStageText, `a card “${word}” on the teams stage`).not.toContain(word);
  expect(await stage.locator('.memory-stage .memory-board').first().locator('.memory-mini-cell').count(), 'twenty mini cells').toBe(20);
  await expectMemoryStageFits29f(stage, 'teams question');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await shot(stage, 'memory29f-teams-stage');

  // ── Перезапуск сервера посеред гри: знайдені пари на місці, телефони продовжують. ──
  const t0 = Date.now();
  const mark = (what: string) => console.log(`memory 29f: teams restart — ${what} at ${Date.now() - t0} ms`);
  await restart(async () => {
    mark('the server stopped');
    await stage.getByText(RESTARTING_TEXT, exact).waitFor({ timeout: 15_000 });
  });
  mark('the server is up');
  for (const page of [stage, ...phones, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  mark('every page is back');
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click({ timeout: 15_000 });
  for (const page of [olya, taras]) await expect.poll(() => matchedCount29f(page), POLL).toBe(6);
  for (const page of [petro, hanna]) await expect.poll(() => matchedCount29f(page), POLL).toBe(2);
  expect(await toneOf29f(olya, cell(0, 0)), 'the colours survive the restart').toBe(tarasTone);
  await expect.poll(() => stageCount('Соняшники'), POLL).toBe('3 з 10');

  // Оля добирає решту сім пар: команда закінчує; Тарас бачить «усі пари».
  for (let pair = 3; pair < 10; pair++) await match29f(olya, q, pair);
  await taras.getByText(/^Усі пари знайдено за [\d,]+ с\. Чекаємо інших$/).first().waitFor();
  await expect.poll(() => stageCount('Соняшники'), POLL).toMatch(/^10 з 10 ✓ [\d,]+ с$/);
  await expectMemoryFit29f(taras, 'memory 4×5 at 320×568, all found');
  await reveal28a(host);
  await stage.locator('.memory-stage.is-reveal .memory-table').waitFor();
  expect(await stage.locator('.memory-stage.is-reveal .memory-reveal-pair').count()).toBe(10);
  const boards = memBoards29f(stageFrames);
  expect(boards.map((board) => [board.nickname, board.pairs, board.points])).toEqual([['Соняшники', 10, 300], ['Маки', 1, 0]]);
  await scores29f(phones, [300, 300, 0, 0]);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectMemoryStageFits29f(stage, 'teams reveal');
  await shot(stage, 'memory29f-teams-reveal-stage');
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

/** 24 гравці без браузера (сокети): від 0 до 10 знайдених пар за розкладом; мініатюри на сцені 1600 × 900 без прокрутки. */
async function memoryCrowd29f(sockets: Socket[]) {
  const host = await open('host29fc', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host29fc@example.com');
  const question = memory29f('c29f', '4x5', textPairs29f(10), 60, 77);
  const q = { pairs: question.pairs as Pair29f[], seed: question.seed };
  const data = { ...makeRoundsQuiz([puzzlesRound('pc29f', [question as never])], { leaderboard: 'end' }), title: 'Пам’ять натовпу 29f' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Пам’ять натовпу 29f' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29fc', 1600, 900);
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
  await stage.locator('.memory-stage').waitFor();
  await expect.poll(() => stage.locator('.memory-stage .memory-board').count(), POLL).toBeGreaterThan(0);
  // Кожен k знаходить k % 11 пар (10 — усі), потім відкриває ще одну картку.
  const flipOf = async (socket: Socket, cellNo: number) => {
    const payload = { questionIndex: 0, cell: cellNo };
    let ack = await emit<{ ok: boolean; error?: string }>(socket, 'player:memory', payload);
    for (let tries = 0; !ack.ok && ack.error === 'too_soon' && tries < 10; tries++) {
      await sleep(300);
      ack = await emit<{ ok: boolean; error?: string }>(socket, 'player:memory', payload);
    }
    return ack;
  };
  await Promise.all(
    players.map(async ({ nickname, socket }, k) => {
      const matches = k % 11;
      for (let pair = 0; pair < matches; pair++) {
        for (const cellNo of cellsOf29f(q, pair)) {
          expect(await flipOf(socket, cellNo), `${nickname} flips cell ${cellNo}`).toEqual({ ok: true });
          await sleep(260);
        }
      }
      if (matches < 10) expect(await flipOf(socket, cellsOf29f(q, matches)[0]), `${nickname} opens one more card`).toEqual({ ok: true });
    }),
  );
  await expect.poll(() => stage.locator('.memory-stage .memory-board.is-done').count(), POLL).toBeGreaterThan(0);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectNoSideScroll(stage, 'memory29f-24-stage');
  await expectMemoryStageFits29f(stage, '24 players');
  const boardsOnPage = await stage.locator('.memory-stage .memory-board').count();
  console.log(`memory 29f: ${boardsOnPage} mini grids on a stage page for 24 players`);
  const clipped = await stage.locator('.memory-stage .memory-board-name').evaluateAll((all) => all.filter((el) => el.getBoundingClientRect().width < 40).map((el) => el.textContent));
  expect(clipped, 'names squeezed to nothing').toEqual([]);
  const mini = (await stage.locator('.memory-stage .memory-mini').first().boundingBox())!;
  console.log(`memory 29f: a mini grid is ${Math.round(mini.width)}×${Math.round(mini.height)} px`);
  expect(Math.min(mini.width, mini.height), 'a mini grid is readable').toBeGreaterThan(24);
  await reveal28a(host);
  await stage.locator('.memory-stage.is-reveal .memory-table').waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectMemoryStageFits29f(stage, '24 players reveal');
  await shot(stage, 'memory29f-24-reveal-stage');

  expect(problems).toEqual([]);
}

it('part 29e: melody after a classic round — a tagged mp3 and spellings in the editor, chunks start by a tap on the phone, points by the longest chunk, no title before reveal, the track on the stage, 320 px', async () => {
  try {
    await melodyGame29e();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 29e: melody in teams — anyone opens a shared chunk, a teammate sees it without sound, the first answer counts, a restart keeps the chunks, 320 px', async () => {
  try {
    await melodyTeams29e();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 29e: melody with 24 players — the stage tiles fit 1600×900', async () => {
  const sockets: Socket[] = [];
  try {
    await melodyCrowd29e(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

const STEPS29E = [1, 2, 4, 8, 16];

/** MP3 з тегами (ID3v2 «TIT2» і ID3v1 «TAG» із назвою) навколо синтетичної тиші: сервер має їх зрізати. Справжньої музики немає. */
function taggedMp3_29e(seconds: number): Buffer {
  const title = Buffer.from('Shchedryk', 'latin1');
  const frame = Buffer.concat([Buffer.from('TIT2', 'latin1'), Buffer.from([0, 0, 0, title.length + 1, 0, 0, 0]), title]);
  const size = frame.length;
  const header = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]);
  const v1 = Buffer.alloc(128);
  v1.write('TAG', 0, 'latin1');
  v1.write('Shchedryk', 3, 'latin1');
  v1.write('Carol', 33, 'latin1');
  return Buffer.concat([header, frame, silentMp3(38 * seconds), v1]);
}

type Track29e = { source: 'file'; url: string; start: number } | { source: 'youtube'; id: string; start: number };

function melody29e(id: string, track: Track29e, accepted: string[], timeLimit: number) {
  return { id, text: 'Що це за пісня?', imageUrl: null, video: null, timeLimit, points: 1000, type: 'melody' as const, track, accepted };
}

/** Заливка тегованого MP3 через API ведучого: адреса вже без тегів. */
async function uploadTagged29e(host: Page): Promise<string> {
  const upload = await host.request.post(`${base}/api/uploads/audio`, { data: taggedMp3_29e(20), headers: { 'content-type': 'audio/mpeg' } });
  expect(upload.status(), await upload.text()).toBe(201);
  return ((await upload.json()) as { url: string }).url;
}

/** Комірка драбинки за секундами шматка (1, 2, 4, 8, 16). */
const stepCell29e = (page: Page, seconds: number) => page.locator(`.melody-play .melody-step[data-step="${STEPS29E.indexOf(seconds) + 1}"]`);

/** Дотик до комірки драбинки. */
async function step29e(page: Page, seconds: number) {
  await stepCell29e(page, seconds).click();
}

/** Стан звуку телефона: <audio> драбинки. */
const phoneClip29e = (page: Page) => page.locator('.melody-play audio').evaluate((el) => ({ paused: (el as HTMLAudioElement).paused, currentTime: (el as HTMLAudioElement).currentTime }));

/** Шматок почав грати, а за seconds + запас — закінчив. */
async function chunkRuns29e(page: Page, seconds: number) {
  await expect.poll(async () => (await phoneClip29e(page)).paused, { timeout: 3000, interval: 40 }).toBe(false);
  await expect.poll(async () => (await phoneClip29e(page)).paused, { timeout: seconds * 1000 + 3000, interval: 100 }).toBe(true);
}

/** Телефон «Мелодії»: без прокрутки вбік, драбинка в один ряд, жодний підпис не ламається посеред слова; висоти — у журнал і звіт. */
async function expectMelodyFit29e(page: Page, name: string) {
  const fit = (await page.evaluate(`(() => {
    const cells = [...document.querySelectorAll('.melody-play .melody-step')];
    const tops = cells.map((el) => Math.round(el.getBoundingClientRect().top));
    const split = [];
    for (const el of document.querySelectorAll('.melody-step-main, .melody-step-share')) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top / 4)));
      if (lines.size > 1) split.push(el.textContent);
      if (el.scrollWidth > el.clientWidth + 1) split.push('cut ' + el.textContent);
    }
    const input = document.querySelector('.melody-play input[type=text], .melody-play .typed input');
    const submit = document.querySelector('.melody-play .typed button');
    const bottom = (el) => (el ? Math.round(el.getBoundingClientRect().bottom) : null);
    const last = cells[cells.length - 1].getBoundingClientRect();
    return { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, scrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight, innerH: innerHeight, innerW: innerWidth, tops, split, inputBottom: bottom(input), submitBottom: bottom(submit), lastRight: Math.round(last.right) };
  })()`)) as { scrollW: number; clientW: number; scrollH: number; clientH: number; innerH: number; innerW: number; tops: number[]; split: string[]; inputBottom: number | null; submitBottom: number | null; lastRight: number };
  console.log(`melody 29e: ${name} — scrollHeight ${fit.scrollH} vs clientHeight ${fit.clientH}, input bottom ${fit.inputBottom}, submit bottom ${fit.submitBottom} of ${fit.innerH}, ladder tops ${fit.tops.join('/')}, last cell right ${fit.lastRight} of ${fit.innerW}`);
  expect(fit.scrollW, `${name}: horizontal scroll`).toBeLessThanOrEqual(fit.clientW);
  expect(new Set(fit.tops).size, `${name}: the ladder is one row`).toBe(1);
  expect(fit.lastRight, `${name}: the ladder reaches past the right edge`).toBeLessThanOrEqual(fit.innerW);
  expect(fit.split, `${name}: a ladder label breaks`).toEqual([]);
  // 29j: на 320×568 кнопка «Відповісти» видна без прокрутки (і в команді).
  if (fit.innerH <= 568 && fit.submitBottom !== null) expect(fit.submitBottom, `${name}: «Відповісти» below the screen`).toBeLessThanOrEqual(fit.innerH);
}

/** Сцена 1600 × 900: без прокрутки, плитки й (на розкритті) таблиця з рядками видимі цілком. */
async function expectMelodyStageFits29e(stage: Page, name: string, reveal: boolean) {
  const [height, clientH, width, clientW] = (await stage.evaluate('[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]')) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  if (!reveal) {
    const out = await stage.locator('.melody-stage .melody-board').evaluateAll((all) => all.filter((el) => { const box = el.getBoundingClientRect(); return box.height < 10 || box.bottom > innerHeight + 1 || box.right > innerWidth + 1 || box.left < -1; }).map((el) => el.textContent));
    expect(out, `${name}: tiles outside the stage`).toEqual([]);
    return;
  }
  const table = (await stage.locator('.melody-stage .melody-table').boundingBox())!;
  expect(table.height, `${name}: the points table has no height`).toBeGreaterThan(40);
  expect(table.y + table.height, `${name}: the table reaches below the stage`).toBeLessThanOrEqual(900 + 1);
  const rows = await stage.locator('.melody-stage .melody-table tbody tr').evaluateAll((all) => all.map((el) => { const box = el.getBoundingClientRect(); return [Math.round(box.height), Math.round(box.bottom)]; }));
  expect(rows.length, `${name}: table rows`).toBeGreaterThan(0);
  console.log(`melody 29e: ${name} — table ${Math.round(table.height)} px, ${rows.length} rows, last row bottom ${rows[rows.length - 1]![1]}`);
  for (const [rowHeight, bottom] of rows) {
    expect(rowHeight, `${name}: a collapsed table row`).toBeGreaterThan(8);
    expect(bottom, `${name}: a row below the stage`).toBeLessThanOrEqual(900 + 1);
  }
}

const TITLE_RE29E = /щедрик|shchedryk/i;

async function melodyGame29e() {
  const host = await open('host29e', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host29e@example.com');
  const hostFrames = socketFrames(host);
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Мелодія 29e');
  await host.locator('details.rules').first().locator('summary').click();
  await select27b(host, 'Показувати рейтинг', 'end');
  await questionText(host).fill('Скільки днів у тижні?');
  await field(host, 'Варіант 1').fill('П’ять');
  await field(host, 'Варіант 2').fill('Сім');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Час, с').fill('30');

  // ── Раунд 2: класичний, «Мелодія»: порожній трек — проблема; файл із тегами, секунда, написання. ──
  await click(host, '+ Раунд');
  await click(host, 'Класичний');
  const types = host.getByRole('group', { name: 'Тип запитання', ...exact });
  await types.getByRole('button', { name: 'Мелодія', ...exact }).click();
  await host.locator('.melody-editor').waitFor();
  expect(await host.getByLabel('Відео з YouTube', exact).count(), 'a melody has no video field').toBe(0);
  expect(await questionText(host).inputValue(), 'the default text').toBe('Що це за пісня?');
  await expect.poll(() => field(host, 'Час, с').inputValue(), POLL).toBe('60');
  await click(host, 'Зберегти');
  await host.locator('.problems', { hasText: 'додайте файл або посилання на YouTube' }).waitFor();
  await host.locator('.melody-file input[type=file]').setInputFiles({ name: 'shchedryk.mp3', mimeType: 'audio/mpeg', buffer: taggedMp3_29e(20) });
  await host.getByText('Аудіофайл', exact).first().waitFor();
  await field(host, 'З якої секунди').fill('2');
  await field(host, 'Написання 1').fill('Щедрик');
  await click(host, 'Додати написання');
  await field(host, 'Написання 2').fill('Shchedryk');

  // YouTube: посилання з t=42 дає start 42; «Файл» повертає залитий файл; секунду знову 2.
  await host.locator('.melody-source').getByRole('button', { name: 'YouTube', ...exact }).click();
  await field(host, 'Посилання на відео').fill('https://youtu.be/abcdefghijk?t=42');
  await expect.poll(() => field(host, 'З якої секунди').inputValue(), POLL).toBe('42');
  await host.locator('.melody-source').getByRole('button', { name: 'Файл', ...exact }).click();
  await host.getByText('Аудіофайл', exact).first().waitFor();
  await field(host, 'З якої секунди').fill('2');

  // «▶ 1 с» у редакторі грає й зупиняється.
  const editorClip = () => host.locator('.melody-editor audio').evaluate((el) => (el as HTMLAudioElement).paused);
  await host.getByRole('button', { name: '▶ 1 с', ...exact }).click();
  await expect.poll(editorClip, { timeout: 3000, interval: 40 }).toBe(false);
  await expect.poll(editorClip, { timeout: 2500, interval: 100 }).toBe(true);
  await shot(host, 'melody29e-editor');

  // Бліц і «Головоломки»: «Мелодії» в меню немає.
  await click(host, '+ Раунд');
  await click(host, 'Бліц');
  await types.getByRole('button', { name: 'один варіант', ...exact }).waitFor();
  expect(await types.getByRole('button', { name: 'Мелодія', ...exact }).count(), 'a melody in the blitz menu').toBe(0);
  await click(host, 'Видалити раунд');
  await click(host, '+ Раунд');
  await click(host, 'Головоломки');
  await types.getByRole('button', { name: 'судоку', ...exact }).waitFor();
  expect(await types.getByRole('button', { name: 'Мелодія', ...exact }).count(), 'a melody in the puzzles menu').toBe(0);
  await click(host, 'Видалити раунд');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Мелодія 29e' }).waitFor();

  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Мелодія 29e')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { type: string; questions: { type: string; track?: { source: string; url: string; start: number }; accepted?: string[] }[] }[] };
  expect(stored.rounds.map((round) => round.type)).toEqual(['classic', 'classic']);
  const saved = stored.rounds[1]!.questions[0]!;
  expect(saved.type).toBe('melody');
  expect(saved.track).toMatchObject({ source: 'file', start: 2 });
  expect(saved.track!.url).toMatch(/^\/uploads\/[0-9a-f]+\.mp3$/);
  expect(saved.accepted).toEqual(['Щедрик', 'Shchedryk']);
  const bytes = Buffer.from(await (await host.request.get(`${base}${saved.track!.url}`)).body());
  expect(bytes.length, 'the uploaded file').toBeGreaterThan(1000);
  expect(bytes.includes(Buffer.from('Shchedryk')), 'a title tag in the uploaded file').toBe(false);
  expect(bytes.subarray(0, 3).toString('latin1'), 'an ID3v2 header kept').not.toBe('ID3');
  expect(bytes.subarray(bytes.length - 128, bytes.length - 125).toString('latin1'), 'an ID3v1 tag kept').not.toBe('TAG');
  const trackUrl = saved.track!.url;

  // ── Гра: сцена 1600 × 900; Оля 320 × 568 (дотик), Тарас 375 × 812, Петро 360 × 740. ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29e', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya29e', 320, 568, { hasTouch: true, isMobile: true });
  const olyaFrames = socketFrames(olya);
  const taras = await open('taras29e', 375, 812);
  const tarasFrames = socketFrames(taras);
  const petro = await open('petro29e', 360, 740);
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();
  const phones = [olya, taras, petro];

  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await petro.getByRole('button', { name: /П’ять/ }).click();
  await reveal28a(host);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // ── Раунд 2: «Мелодія» — номер у раунді 0. ──
  const framesFrom = { stage: stageFrames.length, host: hostFrames.length, olya: olyaFrames.length, taras: tarasFrames.length, petro: petroFrames.length };
  for (const page of phones) await page.locator('.melody-play .melody-step').first().waitFor();
  const shown = stateViews(olyaFrames).reverse().find((view) => view.question?.melody !== undefined)!;
  expect(shown.questionIndex, 'the phone’s question number in the round').toBe(0);
  expect(shown.question!.melody!.track).toMatchObject({ source: 'file', url: trackUrl, start: 2 });
  expect(shown.question!.melody!.answer, 'the answer before reveal').toBeNull();
  await expect.poll(() => stage.locator('.melody-stage .melody-board').count(), POLL).toBe(3);

  // Петро до першого шматка: поле неактивне, підказка.
  const answerField = (page: Page) => page.locator('.melody-play .typed input');
  expect(await answerField(petro).isDisabled(), 'the field before the first chunk').toBe(true);
  await petro.getByText('Спершу послухайте шматок', exact).waitFor();
  expect(await petro.locator('.melody-step.is-next').getAttribute('aria-label')).toBe('Слухати 1 с · 100 %');

  // Оля (320 px): «Слухати 1 с» — звук пішов і зупинився на 1 с від початку фрагмента.
  expect(await olya.locator('.melody-step').count()).toBe(5);
  await step29e(olya, 1);
  await chunkRuns29e(olya, 1);
  const clipOlya = await phoneClip29e(olya);
  console.log(`melody 29e: Olya’s 1 s chunk stopped at currentTime ${clipOlya.currentTime.toFixed(2)}`);
  expect(clipOlya.currentTime, 'the 1 s chunk from second 2').toBeGreaterThanOrEqual(2.8);
  expect(clipOlya.currentTime, 'the 1 s chunk from second 2').toBeLessThanOrEqual(3.6);
  await expect.poll(() => stage.locator('.melody-board', { hasText: 'Оля' }).textContent(), POLL).toContain('🎧 1 с');
  await expect.poll(() => olya.locator('.melody-share').textContent(), POLL).toBe('Зараз: 100 % ціни');
  await answerField(olya).fill('щедрік');
  await expectMelodyFit29e(olya, 'melody at 320×568');
  await shot(olya, 'melody29e-phone-320');
  await olya.getByRole('button', { name: 'Відповісти', ...exact }).click();
  await olya.getByText('Відповідь прийнято на шматку 1 с', exact).waitFor();
  await expect.poll(() => stage.locator('.melody-board', { hasText: 'Оля' }).textContent(), POLL).toContain('✓');

  // Тарас: 1, 2 і 4 с по черзі, переслуховує 1 с, відповідає.
  for (const seconds of [1, 2, 4]) {
    await step29e(taras, seconds);
    await chunkRuns29e(taras, seconds);
  }
  expect(await stepCell29e(taras, 1).getAttribute('aria-label')).toBe('Переслухати 1 с · 100 %');
  expect(await stepCell29e(taras, 8).isEnabled(), 'the 8 s chunk is next').toBe(true);
  await step29e(taras, 1);
  await chunkRuns29e(taras, 1);
  await expect.poll(() => taras.locator('.melody-share').textContent(), POLL).toBe('Зараз: 60 % ціни');
  await expect.poll(() => stage.locator('.melody-board', { hasText: 'Тарас' }).textContent(), POLL).toContain('🎧 4 с');
  await answerField(taras).fill('Shchedryk');
  await shot(taras, 'melody29e-phone-steps');
  await taras.getByRole('button', { name: 'Відповісти', ...exact }).click();
  await taras.getByText('Відповідь прийнято на шматку 4 с', exact).waitFor();

  // Петро: 1 с і хибна відповідь.
  await step29e(petro, 1);
  await chunkRuns29e(petro, 1);
  await expect.poll(() => answerField(petro).isDisabled(), POLL).toBe(false);
  await answerField(petro).fill('Колядка');
  await petro.getByRole('button', { name: 'Відповісти', ...exact }).click();
  // Остання відповідь закриває запитання (усі відповіли): телефон показує «Чекаємо на правильну відповідь».
  await petro.getByText('Чекаємо на правильну відповідь', exact).waitFor();
  await expect.poll(() => stage.locator('.melody-board.is-answered').count(), POLL).toBe(3);

  // До розкриття назви немає ні в кадрах, ні в DOM (свою відповідь телефон бачить, тому вона вирізається).
  const own = (frames: string[], from: number, mine: string) => frames.slice(from).join(NL).split(`"value":"${mine}"`).join('');
  for (const [who, text] of [
    ['stage frames', stageFrames.slice(framesFrom.stage).join(NL)],
    ['Petro frames', petroFrames.slice(framesFrom.petro).join(NL)],
    ['Olya frames', own(olyaFrames, framesFrom.olya, 'щедрік')],
    ['Taras frames', own(tarasFrames, framesFrom.taras, 'Shchedryk')],
    ['stage DOM', await stage.locator('body').innerText()],
    ['Petro DOM', await petro.locator('body').innerText()],
    ['Olya DOM', await olya.locator('body').innerText()],
    ['Taras DOM', (await taras.locator('body').innerText()).split('Shchedryk').join('')],
  ] as const) {
    expect(text, `the title in the ${who} before reveal`).not.toMatch(TITLE_RE29E);
  }
  expect(await stage.locator('.audio-card').count(), 'sound on the stage before reveal').toBe(0);
  await expectMelodyStageFits29e(stage, 'melody question', false);
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await shot(stage, 'melody29e-stage');
  await shot(host, 'melody29e-host');

  // ── Розкриття. ──
  await reveal28a(host);
  await stage.locator('.melody-stage.is-reveal .melody-table').waitFor();
  await expect.poll(() => stage.locator('.melody-title').textContent(), POLL).toBe('Звучала пісня «Щедрик»');
  await scores29f(phones, [1000, 600, 0]);
  const rows = await stage.locator('.melody-stage.is-reveal .melody-table tbody tr').evaluateAll((all) => all.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '')));
  expect(rows.map((row) => [row[0], row[1], row[2]])).toEqual([['1', 'Оля', '✓ 1 с'], ['2', 'Тарас', '✓ 4 с'], ['—', 'Петро', '✗ 1 с']]);
  expect(rows.map((row) => row[3]!.replace(/\D/g, ''))).toEqual(['1000', '600', '0']);
  const unlock = stage.getByRole('button', { name: '🔊 Увімкнути звук', ...exact });
  if (await unlock.isVisible()) await unlock.click();
  expect(await stage.locator('.audio-card audio').getAttribute('src'), 'the track on the stage').toBe(trackUrl);
  await expect.poll(() => stage.locator('.audio-card').getAttribute('data-plays'), POLL).not.toBe('0');
  await click(host, 'Стоп');
  await expect.poll(() => stage.locator('.audio-card').getAttribute('data-state'), POLL).toBe('stopped');
  await olya.getByRole('button', { name: '🔊 Прослухати ще раз', ...exact }).waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectMelodyStageFits29e(stage, 'melody reveal', true);
  await shot(stage, 'melody29e-reveal-stage');
  for (const frames of [olyaFrames, tarasFrames, petroFrames]) expect(frames.join(NL), 'a stale refusal').not.toContain('melody_stale');
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

async function melodyTeams29e() {
  const host = await open('host29et', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host29et@example.com');
  const url = await uploadTagged29e(host);
  const question = melody29e('mt29e', { source: 'file', url, start: 2 }, ['Щедрик', 'Shchedryk'], 120);
  const data = {
    ...makeRoundsQuiz([classicRound('ct29e', [{ ...withId(single, 'ct1'), timeLimit: 30 }], { speedBonus: false }), classicRound('mt29e', [question as never], { speedBonus: false })], {
      leaderboard: 'end',
      teams: { count: 2, names: ['Соняшники', 'Маки'], answerer: 'captain' },
    }),
    title: 'Мелодія команд 29e',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Мелодія команд 29e' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29et', 1600, 900);
  await stage.goto(stageUrl);
  const olya = await open('olya29et', 375, 812);
  const taras = await open('taras29et', 320, 568, { hasTouch: true, isMobile: true });
  const petro = await open('petro29et', 375, 812);
  const hanna = await open('hanna29et', 360, 740);
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
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await reveal28a(host);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await page.locator('.melody-play .melody-step').first().waitFor();
  const by = (page: Page) => page.locator('.melody-by');
  const answerField = (page: Page) => page.locator('.melody-play .typed input');

  // Оля (капітан) відкриває 1 с: Тарас бачить комірку й «Оля: відкрито 1 с», звук у нього мовчить.
  await step29e(olya, 1);
  await chunkRuns29e(olya, 1);
  await expect.poll(() => stepCell29e(taras, 1).getAttribute('class'), POLL).toContain('is-open');
  await expect.poll(() => by(taras).textContent(), POLL).toBe('Оля: відкрито 1 с');
  expect((await phoneClip29e(taras)).paused, 'a teammate’s sound stays off').toBe(true);
  expect((await phoneClip29e(taras)).currentTime, 'a teammate’s clip is untouched').toBe(0);
  expect(await closedChunks29e(petro), 'a rival’s ladder is untouched').toBe(0);
  await shot(taras, 'melody29e-teams-phone');

  // Тарас (не капітан) відкриває 2 с: звук грає в нього; в Олі «Тарас: відкрито 2 с».
  await step29e(taras, 2);
  await chunkRuns29e(taras, 2);
  await expect.poll(() => by(olya).textContent(), POLL).toBe('Тарас: відкрито 2 с');
  await expect.poll(() => stageTeamTile29e(stage, 'Соняшники'), POLL).toContain('🎧 2 с');
  await expectMelodyFit29e(taras, 'melody teams at 320×568');
  await expect.poll(() => answerField(taras).isDisabled(), POLL).toBe(false);

  // Перезапуск посеред запитання: ті самі два шматки, наступний можна відкрити.
  await restart(async () => {
    await stage.getByText(RESTARTING_TEXT, exact).waitFor({ timeout: 15_000 });
  });
  for (const page of [stage, ...phones, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click({ timeout: 15_000 });
  for (const page of [olya, taras]) {
    await expect.poll(() => page.locator('.melody-play .melody-step.is-open').count(), POLL).toBe(2);
    await expect.poll(() => stepCell29e(page, 4).isEnabled(), POLL).toBe(true);
    expect(await stepCell29e(page, 4).getAttribute('aria-label'), 'the next chunk after the restart').toBe('Ще: 4 с · 60 %');
  }

  // Тарас відповідає правильно: команда має 800 (шматок 2 с), поле Олі закрите.
  await answerField(taras).fill('щедрик');
  await taras.getByRole('button', { name: 'Відповісти', ...exact }).click();
  await taras.getByText('Відповідь прийнято на шматку 2 с', exact).waitFor();
  await olya.getByText('Відповідь прийнято на шматку 2 с', exact).waitFor();
  await expect.poll(async () => (await answerField(olya).count()) === 0 || (await answerField(olya).isDisabled()), POLL).toBe(true);
  await expect.poll(() => stage.locator('.melody-board.is-answered').count(), POLL).toBe(1);
  await shot(stage, 'melody29e-teams-stage');
  await reveal28a(host);
  await stage.locator('.melody-stage.is-reveal .melody-table').waitFor();
  await scores29f(phones, [800, 800, 0, 0]);
  await expectMelodyStageFits29e(stage, 'melody teams reveal', true);
  await toWinners27c(host, stage);

  // Перезапуск тестового сервера скидає його сховище в пам'яті: файл треку після нього віддає 404 (на Render файли лежать в R2).
  problems.splice(0, problems.length, ...problems.filter((problem) => !/404 \(Not Found\) @ \S+\/uploads\//.test(problem)));
  expect(problems).toEqual([]);
}

/** Скільки комірок драбинки відкрито. */
const closedChunks29e = (page: Page) => page.locator('.melody-play .melody-step.is-open').count();
/** Плитка команди на сцені. */
const stageTeamTile29e = (stage: Page, name: string) => stage.locator('.melody-board', { hasText: name }).textContent();

async function melodyCrowd29e(sockets: Socket[]) {
  const host = await open('host29ec', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host29ec@example.com');
  const url = await uploadTagged29e(host);
  const question = melody29e('mc29e', { source: 'file', url, start: 2 }, ['Щедрик', 'Shchedryk'], 60);
  const data = { ...makeRoundsQuiz([classicRound('mc29e', [question as never], { speedBonus: false })], { leaderboard: 'end' }), title: 'Мелодія натовпу 29e' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Мелодія натовпу 29e' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage29ec', 1600, 900);
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
  await stage.locator('.melody-stage').waitFor();
  await expect.poll(() => stage.locator('.melody-stage .melody-board').count(), POLL).toBeGreaterThan(0);
  // Кожен відкриває k % 6 шматків (0…5); парні відповідають: кожен четвертий (k % 4 = 2) — правильно.
  await Promise.all(
    players.map(async ({ nickname, socket }, k) => {
      const opened = k % 6;
      for (let step = 1; step <= opened; step++) expect(await emit(socket, 'player:melody', { questionIndex: 0, step }), `${nickname} opens ${step}`).toEqual({ ok: true });
      if (opened > 0 && k % 2 === 0) expect(await emit(socket, 'player:answer', { type: 'melody', value: k % 4 === 2 ? 'Щедрик' : 'Колядка' }), `${nickname} answers`).toMatchObject({ ok: true });
    }),
  );
  await expect.poll(() => stage.locator('.melody-board.is-answered').count(), POLL).toBeGreaterThan(0);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectNoSideScroll(stage, 'melody29e-24-stage');
  await expectMelodyStageFits29e(stage, 'melody 24 players', false);
  const boards = await stage.locator('.melody-stage .melody-board').count();
  console.log(`melody 29e: ${boards} tiles on a stage page for 24 players`);
  const clipped = await stage.locator('.melody-stage .melody-board-name').evaluateAll((all) => all.filter((el) => el.getBoundingClientRect().width < 40).map((el) => el.textContent));
  expect(clipped, 'names squeezed to nothing').toEqual([]);
  await reveal28a(host);
  await stage.locator('.melody-stage.is-reveal .melody-table').waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectMelodyStageFits29e(stage, 'melody 24 players reveal', true);
  await shot(stage, 'melody29e-24-reveal-stage');

  expect(problems).toEqual([]);
}
