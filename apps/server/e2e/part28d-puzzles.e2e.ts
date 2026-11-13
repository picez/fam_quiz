import { classicRound, makeRoundsQuiz, puzzlesRound, single, truthRound, withId } from '@quiz/engine/testing';
import { countSudoku, crosswordCells, generateSudoku, layoutCrossword, pickKeyCells, type CrosswordLayout, type PublicPuzzle, type SudokuLevel } from '@quiz/shared';
import { type Locator, type Page } from 'playwright-core';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, liveRow, field, questionText, join, expectNoSideScroll, register, POLL, socketFrames, RESTARTING_TEXT, NL, pickTeamOn, stageTeam, sleep, stateViews, label, step27a, next27a, phoneScore27a, select27b, toWinners27c, reveal28a, writeFact28b, hostAuthor28b, pickName28b, done28d } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, shot, restart, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 28d: судоку й кросворди.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 28d: puzzles — a generated and a custom sudoku, both crossword modes, no values on the stage, values on the host, done closes, 320 px', async () => {
  try {
    await puzzlesGame28d();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 28d: puzzles in teams — one shared grid, any member writes, the last write wins, the stage shows who filled, a restart keeps the grids', async () => {
  try {
    await puzzlesTeams28d();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 28d: puzzles with 24 players — the stage thumbnails fit 1600×900', async () => {
  const sockets: Socket[] = [];
  try {
    await puzzlesCrowd28d(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

it('part 28d: puzzles after a classic and a truth round — digits and letters stay, an incomplete grid is done', async () => {
  try {
    await puzzlesAfterTruth28d();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

type Crossword28d = Extract<PublicPuzzle, { kind: 'crossword' }>;
type StoredSudoku28d = { type: 'sudoku'; level: string; seed: number | null; givens: string; solution: string; timeLimit: number; points: number };
type StoredCrossword28d = { type: 'crossword'; mode: 'full' | 'key'; key: string | null; entries: { id: string; answer: string; clue: string }[]; layout: CrosswordLayout; timeLimit: number };

/** Кросворд «увесь» (план): [слово, підказка]. */
const WORDS28D: [string, string][] = [
  ['калина', 'Кущ із червоними ягодами біля хати'],
  ['лелека', 'Птах, що гніздиться на стовпі'],
  ['вишня', 'Садок … коло хати'],
  ['соняшник', 'Жовта квітка, що повертається до сонця'],
  ['криниця', 'Глибока яма з водою у дворі'],
  ['мак', 'Червона квітка з чорним насінням'],
];
/** Кросворд з ключем «ліс»: у словах плану літери «і» немає, тож тут ще ліщина й сосна. */
const KEY_WORDS28D: [string, string][] = [
  ['ліщина', 'Кущ, що дає горіхи'],
  ['калина', 'Ягоди, що червоніють восени'],
  ['сосна', 'Хвойне дерево з довгими голками'],
  ['лелека', 'Білий птах із червоним дзьобом'],
  ['вишня', 'Дерево з кислими червоними ягодами'],
];

/** Судоку для API: сітка з generateSudoku (seed, level). */
function sudoku28d(id: string, seed: number, level: SudokuLevel, timeLimit: number, points = 300) {
  return { id, text: 'Розв’яжіть судоку', imageUrl: null, video: null, timeLimit, points, type: 'sudoku' as const, level, seed, ...generateSudoku(seed, level) };
}

/** Кросворд для API: розкладка — той самий компонувальник, що в редакторі; з ключем — ще й ключові клітинки. */
function crossword28d(id: string, words: [string, string][], key: string | null, timeLimit: number, points = 300) {
  const entries = words.map(([answer, clue], at) => ({ id: `${id}w${at + 1}`, answer, clue }));
  const laid = layoutCrossword(entries);
  if (!laid.ok) throw new Error(`crossword ${id}: ${laid.reason}`);
  const keyCells = key === null ? [] : pickKeyCells(laid.layout, entries, key);
  if (!Array.isArray(keyCells)) throw new Error(`crossword ${id}: missing ${keyCells.missing.join(',')}`);
  return { id, text: key === null ? 'Розгадайте кросворд' : 'Знайдіть ключове слово', imageUrl: null, video: null, timeLimit, points, type: 'crossword' as const, mode: key === null ? ('full' as const) : ('key' as const), entries, key, layout: { ...laid.layout, keyCells } };
}

/** Порожні клітинки сітки судоку. */
const empties28d = (givens: string) => [...givens].flatMap((digit, i) => (digit === '0' ? [i] : []));
/** Клітинка судоку на телефоні (усі 36 у порядку читання; задані — span). */
const sudokuCell28d = (page: Page, i: number) => page.locator('.sudoku-play .sudoku-grid > *').nth(i);
/** Сітка судоку на телефоні одним рядком ('0' — порожньо). */
const phoneSudoku28d = async (page: Page) => (await page.locator('.sudoku-play .sudoku-grid > *').allTextContents()).map((text) => text.trim() || '0').join('');
/** Клітинка кросворду на телефоні (у порядку читання, блоки теж). */
const crosswordCell28d = (page: Page, i: number) => page.locator('.crossword-play .crossword-grid > *').nth(i);
/** Мініатюра дошки гравця (команди) за ім'ям. */
const thumb28d = (page: Page, scope: string, name: string) => page.locator(`${scope} .puzzle-thumb`, { has: page.locator('.puzzle-thumb-name', { hasText: new RegExp(`^${name}$`) }) });
/** Значення мініатюри одним рядком ('0' — порожньо чи блок). */
const thumbGrid28d = async (thumb: Locator) => (await thumb.locator('.puzzle-thumb-cell').allTextContents()).map((text) => text.trim() || '0').join('');

/** Вписує цифри на телефоні: тап по клітинці, потім цифра — власною клавіатурою 1–6 чи фізичною. */
async function fillSudoku28d(page: Page, cells: [number, string][], via: 'keypad' | 'keyboard') {
  for (const [i, digit] of cells) {
    await sudokuCell28d(page, i).click();
    if (via === 'keypad') await page.locator('.puzzle-keypad').getByRole('button', { name: digit, ...exact }).click();
    else await page.keyboard.press(digit);
    await expect.poll(() => sudokuCell28d(page, i).textContent(), POLL).toBe(digit);
  }
}

/** Слова кросворду з клітинками, як їх бачить телефон. */
function words28d(puzzle: Crossword28d) {
  return puzzle.words.map((word) => ({ ...word, cells: Array.from({ length: word.length }, (_, j) => (word.dir === 'across' ? word.row * puzzle.width + word.col + j : (word.row + j) * puzzle.width + word.col)) }));
}
const arrow28d = (dir: 'across' | 'down') => (dir === 'across' ? '→' : '↓');

/**
 * Набирає кросворд з фізичної клавіатури: тап по першій клітинці першого слова (і ще раз, якщо телефон узяв інший напрямок),
 * далі лише літери — курсор сам іде клітинками слова, а з кінця слова перескакує на перше порожнє місце наступного
 * незаповненого слова (перевіряється за активною підказкою після кожного слова). letters — '' там, де вписувати не треба.
 */
async function typeCrossword28d(page: Page, puzzle: Crossword28d, letters: string[], only?: number) {
  const words = words28d(puzzle);
  const wordAt = (cell: number, dir: 'across' | 'down') => words.find((word) => word.dir === dir && word.cells.includes(cell));
  const active = page.locator('.crossword-active');
  const values = await page.locator('.crossword-play .crossword-grid > *').evaluateAll((all) => all.map((el) => el.querySelector('.crossword-letter')?.textContent ?? ''));
  const first = words[only ?? 0]!;
  let at = { cell: first.cells[0]!, dir: first.dir };
  await crosswordCell28d(page, at.cell).click();
  if (!(await active.innerText()).startsWith(`${first.number} ${arrow28d(at.dir)}`)) await crosswordCell28d(page, at.cell).click();
  await expect.poll(() => active.innerText(), POLL).toBe(`${first.number} ${arrow28d(at.dir)} ${first.clue}`);
  for (let guard = 0; guard < words.length * 2; guard++) {
    const word = wordAt(at.cell, at.dir)!;
    const from = word.cells.indexOf(at.cell);
    const text = word.cells.slice(from).map((cell) => letters[cell]).join('');
    await page.keyboard.type(text);
    for (const cell of word.cells.slice(from)) values[cell] = letters[cell]!;
    if (only !== undefined) break;
    // Куди піде курсор: наступне за кругом слово з порожньою клітинкою.
    const k = words.indexOf(word);
    let next: { cell: number; dir: 'across' | 'down' } | null = null;
    for (let step = 1; step <= words.length && next === null; step++) {
      const other = words[(k + step) % words.length]!;
      const empty = other.cells.find((cell) => values[cell] === '');
      if (empty !== undefined) next = { cell: empty, dir: other.dir };
    }
    if (next === null) break;
    const target = wordAt(next.cell, next.dir)!;
    await expect.poll(() => active.innerText(), POLL).toBe(`${target.number} ${arrow28d(target.dir)} ${target.clue}`);
    at = next;
  }
  for (const [i, letter] of letters.entries()) if (letter !== '' && values[i] === letter) await expect.poll(() => crosswordCell28d(page, i).locator('.crossword-letter').textContent(), POLL).toBe(letter);
}

/** Ключові клітинки: тап по клітинці смужки ключа й літера з клавіатури. */
async function typeKey28d(page: Page, letters: string[]) {
  for (const [n, letter] of letters.entries()) {
    await page.locator('.crossword-key .crossword-key-cell').nth(n).click();
    await page.keyboard.type(letter);
    await expect.poll(() => page.locator('.crossword-key .crossword-key-cell').nth(n).textContent(), POLL).toBe(letter);
  }
}

/** Слова кросворду в редакторі: дописує рядки «+ Слово» й заповнює слово й підказку. */
async function fillWords28d(host: Page, words: [string, string][]) {
  while ((await host.getByRole('group', { name: /^Слово \d+$/ }).count()) < words.length) await click(host, '+ Слово');
  for (const [at, [answer, clue]] of words.entries()) {
    const row = host.getByRole('group', { name: `Слово ${at + 1}`, ...exact });
    await row.getByLabel('Слово', exact).fill(answer);
    await row.getByLabel('Підказка', exact).fill(clue);
  }
}

/**
 * До розкриття сцена (чи чужий телефон) не має значень: мініатюри порожні (DOM), у кадрах сокета від from — дошки без cells
 * і без розв'язку, а прихованих рядків (слова, сітки) — ні в DOM, ні в кадрах.
 */
async function expectNoValues28d(page: Page, frames: string[], from: number, label: string, hidden: string[], { dom = true }: { dom?: boolean } = {}) {
  if (dom) {
    const minis = await page.locator('.puzzle-stage .puzzle-mini').allInnerTexts();
    expect(minis.length, `${label}: thumbnails`).toBeGreaterThan(0);
    expect(minis.join('').trim(), `${label}: values in the thumbnails`).toBe('');
  }
  const html = await page.content();
  const sent = frames.slice(from).join(NL);
  for (const text of hidden) {
    if (dom) expect(html, `«${text}» in the ${label} DOM`).not.toContain(text);
    expect(sent, `«${text}» sent to the ${label}`).not.toContain(text);
  }
  const views = stateViews(frames.slice(from)).filter((view) => view.puzzle !== undefined);
  expect(views.length, `${label}: puzzle frames`).toBeGreaterThan(0);
  for (const view of views) {
    expect(view.puzzle!.solution, `${label}: a solution in a frame`).toBeNull();
    for (const board of view.puzzle!.boards) expect(board.cells, `${label}: ${board.nickname}’s values in a frame`).toBeNull();
  }
}

/** Сцена 1600 × 900: без прокрутки, кожна мініатюра (і розв'язок) цілком у вікні. */
async function expectPuzzleStageFits28d(stage: Page, name: string) {
  const [height, clientH, width, clientW] = (await stage.evaluate(
    '[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]',
  )) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const out = await stage
    .locator('.puzzle-stage .puzzle-thumb, .puzzle-stage .puzzle-solution')
    .evaluateAll((all) => all.filter((el) => { const box = el.getBoundingClientRect(); return box.bottom > innerHeight + 1 || box.right > innerWidth + 1 || box.left < -1 || box.top < -1; }).map((el) => el.textContent));
  expect(out, `${name}: parts outside the stage`).toEqual([]);
  const mini = (await stage.locator('.puzzle-stage .puzzle-mini').first().boundingBox())!;
  console.log(`puzzles 28d: ${name} — a thumbnail ${Math.round(mini.width)}×${Math.round(mini.height)}`);
}

/** Остання публічна сітка запитання з кадрів телефона. */
function lastPuzzle28d(frames: string[]): PublicPuzzle {
  const view = stateViews(frames).reverse().find((v) => v.question?.puzzle !== undefined);
  return view!.question!.puzzle!;
}

async function puzzlesGame28d() {
  // ── Редактор: раунд «Головоломки» замість класичного; типи — лише судоку й кросворд. ──
  const host = await open('host28d', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host28d@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Головоломки 28d');
  await host.locator('details.rules').first().locator('summary').click();
  await select27b(host, 'Показувати рейтинг', 'end');
  await click(host, '+ Раунд');
  await click(host, 'Головоломки');
  await host.getByRole('button', { name: 'Раунд 1', ...exact }).click();
  await click(host, 'Видалити раунд');
  const types = host.getByRole('group', { name: 'Тип запитання', ...exact });
  await types.getByRole('button', { name: 'кросворд', ...exact }).waitFor();
  expect(await types.getByRole('button', { name: 'судоку', ...exact }).count(), 'sudoku in the puzzles round').toBe(1);
  expect(await types.getByRole('button', { name: 'один варіант', ...exact }).count(), 'a single choice in the puzzles round').toBe(0);

  // Запитання 1: «Згенерувати» — легко, потім середньо й нова сітка; 60 с.
  expect(await field(host, 'Згенерувати').isChecked(), 'a new sudoku is generated').toBe(true);
  const givenCount = host.locator('.sudoku-editor > p.meta').first();
  await field(host, 'Легко').check();
  await expect.poll(() => givenCount.textContent(), POLL).toMatch(/^Задано \d+ з 36$/);
  await field(host, 'Середньо').check();
  await click(host, 'Нова сітка');
  expect(await field(host, 'Середньо').isChecked(), 'the level after a new grid').toBe(true);
  expect(await host.locator('.sudoku-editor-grid .is-given').count(), 'givens of a medium grid').toBeGreaterThanOrEqual(16);
  await field(host, 'Час, с').fill('60');
  await shot(host, 'puzzles28d-editor-sudoku');

  // Запитання 2: «Задати свої» — чотири цифри дають кілька розв'язків, повтор підсвічено, повна сітка — єдиний.
  await click(host, 'Додати запитання');
  await field(host, 'Задати свої').check();
  const inputs = host.locator('.sudoku-editor-grid input');
  expect(await inputs.count(), 'custom digit fields').toBe(36);
  for (let i = 0; i < 36; i++) if ((await inputs.nth(i).inputValue()) !== '') await inputs.nth(i).fill('');
  const status = host.locator('.sudoku-editor-status');
  await host.getByText('Задано 0 з 36', exact).waitFor();
  const custom = generateSudoku(28, 'medium');
  const customGivens = [...custom.givens].flatMap((digit, i): [number, string][] => (digit === '0' ? [] : [[i, digit]]));
  for (const [i, digit] of customGivens.slice(0, 4)) await inputs.nth(i).fill(digit);
  await expect.poll(() => status.textContent(), POLL).toBe('Розв’язків кілька — додайте цифри.');
  await shot(host, 'puzzles28d-editor-custom-many');
  const [i0, d0] = customGivens[0]!;
  const twin = Math.floor(i0 / 6) * 6 + (((i0 % 6) + 1) % 6);
  const twinWas = await inputs.nth(twin).inputValue();
  await inputs.nth(twin).fill(d0);
  await expect.poll(() => status.textContent(), POLL).toBe('Повтор у рядку, стовпці чи блоці — клітинки підсвічено.');
  expect(await host.locator('.sudoku-editor-grid .is-conflict').count(), 'conflicting cells').toBe(2);
  await inputs.nth(twin).fill(twinWas);
  for (const [i, digit] of customGivens.slice(4)) await inputs.nth(i).fill(digit);
  await expect.poll(() => status.textContent(), POLL).toBe('Розв’язок єдиний ✓');
  await host.getByText(`Задано ${customGivens.length} з 36`, exact).waitFor();
  await field(host, 'Час, с').fill('30');
  await shot(host, 'puzzles28d-editor-custom');

  // Запитання 3: «Увесь кросворд» із шести слів; прев'ю складається саме.
  await click(host, 'Додати запитання');
  await types.getByRole('button', { name: 'кросворд', ...exact }).click();
  expect(await questionText(host).inputValue(), 'the default text after switching to a crossword').toBe('Розгадайте кросворд.');
  await fillWords28d(host, WORDS28D);
  expect(await field(host, 'Увесь кросворд').isChecked(), 'the full mode by default').toBe(true);
  const planEntries = WORDS28D.map(([answer, clue], at) => ({ id: String(at), answer, clue }));
  const fullLaid = layoutCrossword(planEntries);
  if (!fullLaid.ok) throw new Error('the plan words do not cross');
  await expect.poll(() => host.locator('.crossword-editor-grid tr').count(), POLL).toBe(fullLaid.layout.height);
  expect(await host.locator('.crossword-editor-grid tr').first().locator('td').count(), 'the preview width').toBe(fullLaid.layout.width);
  expect(await host.locator('.crossword-editor-grid td.is-letter').count(), 'letter cells in the preview').toBe(crosswordCells(fullLaid.layout, planEntries).filter((c) => c !== null).length);
  expect(await host.locator('.crossword-editor-warning').textContent(), 'a warning for crossing words').toBe('');
  await field(host, 'Час, с').fill('90');
  await shot(host, 'puzzles28d-editor-crossword');

  // Запитання 4: «Ключове слово»: «футбол» — бракує літер, «ліс» — три ключові клітинки.
  await click(host, 'Додати запитання');
  await types.getByRole('button', { name: 'кросворд', ...exact }).click();
  await fillWords28d(host, KEY_WORDS28D);
  await field(host, 'Ключове слово').check();
  await field(host, 'Слово-ключ').fill('футбол');
  await expect.poll(() => host.locator('.crossword-editor-warning').textContent(), POLL).toBe('У словах бракує літер для ключа: ф, у, т, б — додайте слово з ними або змініть ключ.');
  expect(await host.locator('.crossword-editor-grid td.is-key').count(), 'key cells for a key with missing letters').toBe(0);
  await shot(host, 'puzzles28d-editor-key-missing');
  await field(host, 'Слово-ключ').fill('ліс');
  await expect.poll(() => host.locator('.crossword-editor-grid td.is-key').count(), POLL).toBe(3);
  expect(await host.locator('.crossword-editor-warning').textContent(), 'a warning for «ліс»').toBe('');
  expect((await host.locator('.crossword-editor-grid td.is-key .crossword-key-n').allTextContents()).sort(), 'key positions').toEqual(['1', '2', '3']);
  await field(host, 'Час, с').fill('60');
  await shot(host, 'puzzles28d-editor-key');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Головоломки 28d' }).waitFor();

  // Збережене: та сама сітка з того самого seed, свої цифри з розв'язком, розкладка — та, що дає компонувальник.
  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Головоломки 28d')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { type: string; questions: unknown[] }[] };
  expect(stored.rounds.map((round) => round.type)).toEqual(['puzzles']);
  const [q1, q2, q3, q4] = stored.rounds[0]!.questions as [StoredSudoku28d, StoredSudoku28d, StoredCrossword28d, StoredCrossword28d];
  expect([q1.type, q2.type, q3.type, q4.type]).toEqual(['sudoku', 'sudoku', 'crossword', 'crossword']);
  expect(q1).toMatchObject({ level: 'medium', timeLimit: 60, points: 300 });
  expect({ givens: q1.givens, solution: q1.solution }, 'the stored grid is the seed’s grid').toEqual(generateSudoku(q1.seed!, 'medium'));
  expect(countSudoku(q1.givens).count, 'solutions of the generated grid').toBe(1);
  expect(q2).toMatchObject({ level: 'custom', seed: null, givens: custom.givens, solution: custom.solution, timeLimit: 30 });
  expect(q3).toMatchObject({ mode: 'full', key: null, timeLimit: 90 });
  expect(q3.entries.map((entry) => entry.answer)).toEqual(WORDS28D.map(([word]) => word));
  const q3Laid = layoutCrossword(q3.entries);
  expect(q3Laid.ok && { ...q3Laid.layout, keyCells: [] }, 'the stored full layout').toEqual(q3.layout);
  expect(q4).toMatchObject({ mode: 'key', key: 'ліс', timeLimit: 60 });
  const q4Laid = layoutCrossword(q4.entries);
  expect(q4Laid.ok && pickKeyCells(q4Laid.layout, q4.entries, 'ліс'), 'the stored key cells').toEqual(q4.layout.keyCells);

  // ── Гра: сцена 1600 × 900; Оля 375 × 812, Тарас 360 × 740, Петро 320 × 640. ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage28d', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya28d', 375, 812);
  const taras = await open('taras28d', 360, 740);
  const tarasFrames = socketFrames(taras);
  const petro = await open('petro28d', 320, 640);
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();
  const phones = [olya, taras, petro];
  const scores = async (wanted: [string, string, string]) => {
    for (const [at, page] of phones.entries()) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(wanted[at]);
  };
  const hostGrid = (name: string) => thumbGrid28d(thumb28d(host, '.host-puzzle', name));
  const stageThumb = (name: string) => thumb28d(stage, '.puzzle-stage', name);
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // ── Запитання 1 (згенероване, 60 с): Оля — правильно власною клавіатурою; Тарас — фізичною, з перезавантаженням і однією помилкою; Петро не встигає. ──
  for (const page of phones) await page.locator('.sudoku-play').waitFor();
  let from = stageFrames.length;
  let rivalFrom = tarasFrames.length;
  expect(await phoneSudoku28d(olya), 'the givens on the phone').toBe(q1.givens);
  const e1 = empties28d(q1.givens);
  expect(await olya.locator('.sudoku-play .sudoku-grid button').count(), 'givens are not buttons').toBe(e1.length);
  const sol1 = (i: number) => q1.solution[i]!;
  await fillSudoku28d(olya, e1.map((i): [number, string] => [i, sol1(i)]), 'keypad');
  await expect.poll(() => hostGrid('Оля'), POLL).toBe(q1.solution);
  const half = Math.floor(e1.length / 2);
  await fillSudoku28d(taras, e1.slice(0, half).map((i): [number, string] => [i, sol1(i)]), 'keyboard');
  const tarasHalf = [...q1.givens].map((digit, i) => (e1.slice(0, half).includes(i) ? sol1(i) : digit)).join('');
  await expect.poll(() => hostGrid('Тарас'), POLL).toBe(tarasHalf);
  // Перезавантаження посеред запитання: сітка та сама.
  await taras.reload();
  await taras.locator('.sudoku-play').waitFor();
  await expect.poll(() => phoneSudoku28d(taras), POLL).toBe(tarasHalf);
  const wrongCell = e1.at(-1)!;
  const wrongDigit = String((Number(sol1(wrongCell)) % 6) + 1);
  await fillSudoku28d(taras, [...e1.slice(half, -1).map((i): [number, string] => [i, sol1(i)]), [wrongCell, wrongDigit]], 'keyboard');
  const tarasGrid = q1.solution.slice(0, wrongCell) + wrongDigit + q1.solution.slice(wrongCell + 1);
  await expect.poll(() => hostGrid('Тарас'), POLL).toBe(tarasGrid);
  await fillSudoku28d(petro, e1.slice(0, 3).map((i): [number, string] => [i, sol1(i)]), 'keypad');
  await sudokuCell28d(petro, e1[3]!).click();
  // 320 px: сітка й клавіатура в межах екрана, клітинки й клавіші — під палець.
  const sudokuBoxes = await petro.locator('.sudoku-play .sudoku-cell, .puzzle-keypad button').evaluateAll((all) => all.map((el) => { const box = el.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width, height: box.height, text: el.textContent }; }));
  for (const box of sudokuBoxes) {
    expect(box.left, `«${box.text}» starts off screen`).toBeGreaterThanOrEqual(0);
    expect(box.right, `«${box.text}» ends off screen`).toBeLessThanOrEqual(320);
    expect(Math.min(box.width, box.height), `«${box.text}» is a tap target`).toBeGreaterThanOrEqual(36);
  }
  console.log(`puzzles 28d: a sudoku cell on 320 px — ${sudokuBoxes[0]!.width.toFixed(1)}×${sudokuBoxes[0]!.height.toFixed(1)}`);
  await expectNoSideScroll(petro, 'puzzles28d-sudoku-phone-320');

  // Сцена: маски без значень; пульт — значення кожного й розв'язок.
  await expect.poll(() => stageThumb('Петро').locator('.is-filled').count(), POLL).toBe(3);
  await expect.poll(() => stageThumb('Оля').locator('.is-filled').count(), POLL).toBe(e1.length);
  expect(await stageThumb('Оля').locator('.is-given').count(), 'givens on the stage').toBe(36 - e1.length);
  await expectNoValues28d(stage, stageFrames, from, 'stage', [q1.solution, tarasGrid]);
  await expectNoValues28d(taras, tarasFrames, rivalFrom, 'Taras phone', [q1.solution], { dom: false });
  for (const view of stateViews(tarasFrames.slice(rivalFrom))) if (view.role === 'player' && view.me.puzzle !== undefined) expect(view.me.puzzle.result, 'a result before the reveal').toBeNull();
  await expectPuzzleStageFits28d(stage, 'sudoku question');
  await shot(stage, 'puzzles28d-sudoku-stage');
  await host.locator('#live-answers').waitFor();
  await expect.poll(() => liveRow(host, 'Петро').innerText(), POLL).toContain(`Заповнено 3 з ${e1.length}`);
  await expect.poll(() => hostGrid('Петро'), POLL).toBe([...q1.givens].map((digit, i) => (e1.slice(0, 3).includes(i) ? sol1(i) : digit)).join(''));
  expect((await host.locator('.host-puzzle .puzzle-solution .sudoku-cell').allTextContents()).join(''), 'the solution on the host').toBe(q1.solution);

  // «Готово»: Оля й Тарас; Петро ні — запитання чекає часу.
  await done28d(olya);
  expect(await olya.locator('.puzzle-keypad').count(), 'the keypad after done').toBe(0);
  await done28d(taras);
  await expect.poll(() => stage.locator('.puzzle-stage .puzzle-thumb.is-done').count(), POLL).toBe(2);
  await stage.getByText('Відповіли 2 з 3', exact).first().waitFor();
  await expect.poll(() => liveRow(host, 'Оля').innerText(), POLL).toContain('Готово ✓');
  await shot(host, 'puzzles28d-sudoku-host');
  await petro.getByText('Час вийшов — сітку зафіксовано.', exact).first().waitFor({ timeout: 70_000 });
  await expectNoValues28d(stage, stageFrames, from, 'stage after the time', [q1.solution]);

  // ── Розкриття: розв'язок, хибна клітинка Тараса, бали лише Олі. ──
  await reveal28a(host);
  const reveal = stage.locator('.puzzle-stage.is-reveal');
  await reveal.locator('.puzzle-solution').waitFor();
  expect((await reveal.locator('.puzzle-solution .sudoku-cell').allTextContents()).join(''), 'the solution on the stage').toBe(q1.solution);
  await expect.poll(() => stageThumb('Тарас').locator('.is-wrong').count(), POLL).toBe(1);
  expect(await stageThumb('Оля').locator('.is-wrong').count()).toBe(0);
  expect(await stageThumb('Оля').locator('.score').textContent()).toBe('+300');
  expect(await stageThumb('Тарас').locator('.score').count(), 'points for one wrong cell').toBe(0);
  expect(await thumbGrid28d(stageThumb('Тарас')), 'Taras’s grid on the reveal').toBe(tarasGrid);
  await scores(['300', '0', '0']);
  await taras.locator('.puzzle-reveal').waitFor();
  expect(await taras.locator('.puzzle-reveal .is-wrong').count(), 'the wrong cell on Taras’s phone').toBe(1);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectPuzzleStageFits28d(stage, 'sudoku reveal');
  await shot(stage, 'puzzles28d-sudoku-reveal-stage');
  await shot(taras, 'puzzles28d-sudoku-phone-reveal');

  // ── Запитання 2 (свої цифри, 30 с): «Готово» всіх закриває запитання саме, і з порожньою сіткою. ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  await expect.poll(() => phoneSudoku28d(olya), POLL).toBe(q2.givens);
  const e2 = empties28d(q2.givens);
  await fillSudoku28d(olya, [[e2[0]!, q2.solution[e2[0]!]!]], 'keypad');
  await done28d(olya);
  await done28d(taras);
  await done28d(petro);
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor({ timeout: 10_000 });
  await stage.getByText('Відповіли 3 з 3', exact).first().waitFor();
  await reveal28a(host);
  await scores(['300', '0', '0']);

  // ── Запитання 3 (кросворд «увесь», 90 с): Петро на 320 px — з фізичної клавіатури, з перескоком і зміною напрямку. ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await page.locator('.crossword-play').waitFor();
  await stage.locator('.puzzle-stage .puzzle-mini.is-crossword').first().waitFor();
  from = stageFrames.length;
  rivalFrom = tarasFrames.length;
  const cross = lastPuzzle28d(petroFrames) as Crossword28d;
  expect(cross).toMatchObject({ kind: 'crossword', mode: 'full', width: q3.layout.width, height: q3.layout.height, keyCells: [] });
  expect(JSON.stringify(cross), 'answers in the public crossword').not.toMatch(/калина|"answer"|"key":/);
  const letters3 = crosswordCells(q3.layout, q3.entries).map((letter) => letter ?? '');
  // Клітинки на 320 px — не менші за 24 px, сітка в межах екрана.
  const cellBoxes = await petro.locator('.crossword-play .crossword-play-cell:not(.is-block)').evaluateAll((all) => all.map((el) => { const box = el.getBoundingClientRect(); return [box.left, box.right, box.width, box.height] as const; }));
  for (const [left, right, w, h] of cellBoxes) {
    expect(left, 'a crossword cell starts off screen').toBeGreaterThanOrEqual(0);
    expect(right, 'a crossword cell ends off screen').toBeLessThanOrEqual(320);
    expect(Math.min(w, h), 'a crossword cell on 320 px').toBeGreaterThanOrEqual(24);
  }
  console.log(`puzzles 28d: a crossword cell on 320 px (${cross.width}×${cross.height}) — ${cellBoxes[0]![2].toFixed(1)}×${cellBoxes[0]![3].toFixed(1)}`);
  // Зміна напрямку: на перетині спершу горизонталь, повторний тап — вертикаль.
  const words3 = words28d(cross);
  // Перетин не в кінці вертикального слова: після літери курсор лишається в слові, і Backspace повертається на неї.
  const crossing = words3.filter((w) => w.dir === 'across').flatMap((w) => w.cells).find((cell) => words3.some((w) => w.dir === 'down' && w.cells.includes(cell) && w.cells.at(-1) !== cell))!;
  const acrossHere = words3.find((w) => w.dir === 'across' && w.cells.includes(crossing))!;
  const downHere = words3.find((w) => w.dir === 'down' && w.cells.includes(crossing))!;
  const activeClue = petro.locator('.crossword-active');
  await expect.poll(() => activeClue.innerText(), POLL).toBe('Торкніться клітинки, щоб вибрати слово.');
  await crosswordCell28d(petro, crossing).click();
  await expect.poll(() => activeClue.innerText(), POLL).toBe(`${acrossHere.number} → ${acrossHere.clue}`);
  await crosswordCell28d(petro, crossing).click();
  await expect.poll(() => activeClue.innerText(), POLL).toBe(`${downHere.number} ↓ ${downHere.clue}`);
  expect(await petro.locator('.crossword-play-cell.is-word').count(), 'the cells of the chosen word').toBe(downHere.length);
  // Латиниця не вписується; хибна літера — Backspace стирає її й повертає курсор.
  await petro.keyboard.type('q');
  await sleep(300);
  expect(await crosswordCell28d(petro, crossing).locator('.crossword-letter').textContent(), 'a Latin letter written').toBe('');
  await petro.keyboard.type('ґ');
  await expect.poll(() => crosswordCell28d(petro, crossing).locator('.crossword-letter').textContent(), POLL).toBe('ґ');
  await petro.keyboard.press('Backspace');
  await expect.poll(() => crosswordCell28d(petro, crossing).locator('.crossword-letter').textContent(), POLL).toBe('');
  await typeCrossword28d(petro, cross, letters3);
  await expect.poll(() => hostGrid('Петро'), POLL).toBe(letters3.map((letter) => letter || '0').join(''));
  await expectNoSideScroll(petro, 'puzzles28d-crossword-phone-320');
  await petro.locator('.crossword-clues summary').click();
  await expectNoSideScroll(petro, 'puzzles28d-crossword-phone-320-clues');
  // Оля — лише перше слово.
  await typeCrossword28d(olya, cross, letters3, 0);
  await expect.poll(() => stageThumb('Оля').locator('.is-filled').count(), POLL).toBe(words3[0]!.length);
  await expect.poll(() => stageThumb('Петро').locator('.is-filled').count(), POLL).toBe(letters3.filter(Boolean).length);
  const longWords = WORDS28D.map(([word]) => word).filter((word) => word.length > 3);
  await expectNoValues28d(stage, stageFrames, from, 'stage', longWords);
  await expectNoValues28d(taras, tarasFrames, rivalFrom, 'Taras phone', longWords, { dom: false });
  expect(await taras.content(), 'a word in Taras’s DOM').not.toContain('калина');
  await expectPuzzleStageFits28d(stage, 'crossword question');
  await shot(stage, 'puzzles28d-crossword-stage');
  await host.locator('.host-puzzle').getByText('к', exact).first().waitFor();
  await shot(host, 'puzzles28d-crossword-host');
  await done28d(olya);
  await done28d(taras);
  await done28d(petro);
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor({ timeout: 10_000 });
  await reveal28a(host);
  await reveal.locator('.puzzle-words').waitFor();
  for (const [word] of WORDS28D) await reveal.locator('.puzzle-words strong').getByText(word.toLocaleUpperCase('uk'), exact).waitFor();
  expect(await stageThumb('Петро').locator('.score').textContent()).toBe('+300');
  await scores(['300', '0', '300']);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectPuzzleStageFits28d(stage, 'crossword reveal');
  await shot(stage, 'puzzles28d-crossword-reveal-stage');

  // ── Запитання 4 (кросворд з ключем «ліс», 60 с): Оля вписує лише ключові клітинки — правильно; Тарас — «лис». ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  await olya.locator('.crossword-play .crossword-key').waitFor();
  await stage.locator('.puzzle-stage:not(.is-reveal) .puzzle-mini.is-crossword').first().waitFor();
  from = stageFrames.length;
  const keyPuzzle = lastPuzzle28d(petroFrames) as Crossword28d;
  expect(keyPuzzle).toMatchObject({ kind: 'crossword', mode: 'key', keyCells: q4.layout.keyCells });
  expect(JSON.stringify(keyPuzzle), 'the key in the public crossword').not.toMatch(/"key":|"answer"|ліщина/);
  expect(await olya.locator('.crossword-play-cell.is-key').count(), 'key cells on the phone').toBe(3);
  expect((await olya.locator('.crossword-play-cell.is-key .crossword-key-n').allTextContents()).sort()).toEqual(['1', '2', '3']);
  await typeKey28d(olya, ['л', 'і', 'с']);
  await typeKey28d(taras, ['л', 'и', 'с']);
  await expect.poll(() => stageThumb('Оля').locator('.is-filled').count(), POLL).toBe(3);
  await expect.poll(() => stageThumb('Тарас').locator('.is-filled').count(), POLL).toBe(3);
  await expectNoValues28d(stage, stageFrames, from, 'stage', ['ліщина', 'лелека', 'сосна']);
  await expectNoSideScroll(olya, 'puzzles28d-key-phone');
  await done28d(olya);
  await done28d(taras);
  await done28d(petro);
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor({ timeout: 10_000 });
  await reveal28a(host);
  await expect.poll(() => reveal.locator('.puzzle-key-word strong').textContent(), POLL).toBe('ЛІС');
  expect(await stageThumb('Оля').locator('.score').textContent()).toBe('+300');
  expect(await stageThumb('Тарас').locator('.is-wrong').count(), 'Taras’s wrong key letter').toBe(1);
  await scores(['600', '0', '300']);
  await olya.locator('.puzzle-reveal').waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectPuzzleStageFits28d(stage, 'key reveal');
  await shot(stage, 'puzzles28d-key-reveal-stage');
  await shot(olya, 'puzzles28d-key-phone-reveal');
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

/**
 * Регресія «Пробного забігу»: раунд «Головоломки» після класики й «Правди про гравця». Телефон шле номер запитання в раунді
 * (view.questionIndex), сервер порівнював його з індексом plays — цифри й літери одразу стиралися, «Готово» повертало назад.
 */
async function puzzlesAfterTruth28d() {
  const host = await open('host28dx', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host28dx@example.com');
  const sudoku = sudoku28d('x28d', 11, 'easy', 120);
  const cross = crossword28d('y28d', WORDS28D, null, 120);
  const data = {
    ...makeRoundsQuiz(
      [
        classicRound('cx28d', [withId(single, 'cx1')], { speedBonus: false }),
        truthRound('tx28d', { title: 'Правда', timeLimit: 25 }),
        puzzlesRound('px28d', [sudoku as never, cross as never]),
      ],
      { leaderboard: 'end' },
    ),
    title: 'Головоломки після правди 28d',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Головоломки після правди 28d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage28dx', 1600, 900);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya28dx', 375, 812);
  const taras = await open('taras28dx', 360, 740);
  const olyaFrames = socketFrames(olya);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await stage.getByText('Тарас').waitFor();
  const phones = [olya, taras];
  const named = new Map<string, Page>([['Оля', olya], ['Тарас', taras]]);
  // Факти в лобі: раунд «Правда» матиме два запитання.
  await writeFact28b(olya, 'Я стрибала з парашутом');
  await writeFact28b(taras, 'Я вивчив іспанську за рік');

  // ── Класика й «Правда про гравця». ──
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await olya.getByRole('button', { name: /Київ/ }).click();
  await reveal28a(host);
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  for (let k = 0; k < 2; k++) {
    if (k > 0) await next27a(host);
    await afterSplash(host, stage, ...phones);
    const author = await hostAuthor28b(host);
    const guesser = [...named].find(([name]) => name !== author)![1];
    await pickName28b(guesser, author);
    await reveal28a(host);
  }
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // ── Судоку: цифра лишається, «Заповнено 1 з N» на пульті, «Готово» з неповною сіткою спрацьовує. ──
  for (const page of phones) await page.locator('.sudoku-play').waitFor();
  const shown = stateViews(olyaFrames).at(-1)!;
  expect(shown.questionIndex, 'the phone’s question number in the round').toBe(0);
  const e = empties28d(sudoku.givens);
  const sendsFrom = olyaFrames.length;
  await fillSudoku28d(olya, [[e[0]!, sudoku.solution[e[0]!]!]], 'keypad');
  // Довше за вікно пакета й тротл розсилки: цифра не відкочується.
  await sleep(1500);
  expect(await sudokuCell28d(olya, e[0]!).textContent(), 'the digit after the batch went out').toBe(sudoku.solution[e[0]!]);
  await host.locator('#live-answers').waitFor();
  await expect.poll(() => liveRow(host, 'Оля').innerText(), POLL).toContain(`Заповнено 1 з ${e.length}`);
  const sent = olyaFrames.slice(sendsFrom).join(NL);
  expect(sent, 'a stale refusal to the phone').not.toContain('puzzle_stale');
  await done28d(olya);
  expect(await olya.locator('.puzzle-keypad').count(), 'the keypad after done').toBe(0);
  await done28d(taras);
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor({ timeout: 10_000 });
  await reveal28a(host);

  // ── Кросворд (друге запитання раунду): літери лишаються, «Готово» з неповною сіткою. ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await page.locator('.crossword-play').waitFor();
  const puzzle = lastPuzzle28d(olyaFrames) as Crossword28d;
  const letters = crosswordCells(cross.layout, cross.entries).map((letter) => letter ?? '');
  await typeCrossword28d(olya, puzzle, letters, 0);
  await sleep(1500);
  const word = words28d(puzzle)[0]!;
  for (const cell of word.cells) expect(await crosswordCell28d(olya, cell).locator('.crossword-letter').textContent(), `the letter in cell ${cell}`).toBe(letters[cell]);
  await expect.poll(() => liveRow(host, 'Оля').innerText(), POLL).toContain(`Заповнено ${word.cells.length} з ${letters.filter((l) => l !== '').length}`);
  await done28d(olya);
  await done28d(taras);
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor({ timeout: 10_000 });
}

async function puzzlesTeams28d() {
  const host = await open('host28dt', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host28dt@example.com');
  const question = sudoku28d('t28d', 5, 'easy', 120);
  const data = { ...makeRoundsQuiz([puzzlesRound('pt28d', [question as never], { title: 'Командні головоломки' })], { leaderboard: 'end', teams: { count: 2, names: ['Соняшники', 'Маки'] } }), title: 'Головоломки команд 28d' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Головоломки команд 28d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage28dt', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya28dt', 375, 812);
  const taras = await open('taras28dt', 360, 740);
  const petro = await open('petro28dt', 375, 812);
  const petroFrames = socketFrames(petro);
  const hanna = await open('hanna28dt', 320, 640);
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
  for (const page of phones) await page.locator('.sudoku-play').waitFor();
  const from = stageFrames.length;
  const rivalFrom = petroFrames.length;
  const hostGrid = (name: string) => thumbGrid28d(thumb28d(host, '.host-puzzle', name));
  const stageThumb = (name: string) => thumb28d(stage, '.puzzle-stage', name);
  const e = empties28d(question.givens);
  const sol = (i: number) => question.solution[i]!;
  const withCells = (cells: number[], at: (i: number) => string = sol) => [...question.givens].map((digit, i) => (cells.includes(i) ? at(i) : digit)).join('');

  // ── Обидва Соняшники пишуть у ту саму клітинку: Оля — хибну цифру, потім Тарас — правильну; лишається остання. ──
  const shared = e[0]!;
  const wrong = String((Number(sol(shared)) % 6) + 1);
  await fillSudoku28d(olya, [[shared, wrong]], 'keypad');
  await expect.poll(() => hostGrid('Соняшники'), POLL).toBe(withCells([shared], () => wrong));
  // Товариш бачить значення одразу.
  await expect.poll(() => sudokuCell28d(taras, shared).textContent(), POLL).toBe(wrong);
  await fillSudoku28d(taras, [[shared, sol(shared)]], 'keyboard');
  await expect.poll(() => hostGrid('Соняшники'), POLL).toBe(withCells([shared]));
  await expect.poll(() => sudokuCell28d(olya, shared).textContent(), POLL).toBe(sol(shared));
  // На сцені клітинка — кольору Тараса (другий учасник).
  await expect.poll(() => stageThumb('Соняшники').locator('.puzzle-thumb-cell').nth(shared).getAttribute('class'), POLL).toMatch(/\bby-2\b/);

  // Оля — шість клітинок, Тарас — ще чотири; Маки — Петро три клітинки з кінця.
  const olyaCells = e.slice(1, 7);
  const tarasCells = e.slice(7, 11);
  const makiCells = e.slice(-3);
  await fillSudoku28d(olya, olyaCells.map((i): [number, string] => [i, sol(i)]), 'keypad');
  await fillSudoku28d(taras, tarasCells.map((i): [number, string] => [i, sol(i)]), 'keyboard');
  await fillSudoku28d(petro, makiCells.map((i): [number, string] => [i, sol(i)]), 'keypad');
  const sunflowers = withCells([shared, ...olyaCells, ...tarasCells]);
  await expect.poll(() => hostGrid('Соняшники'), POLL).toBe(sunflowers);
  await expect.poll(() => phoneSudoku28d(olya), POLL).toBe(sunflowers);
  await expect.poll(() => phoneSudoku28d(taras), POLL).toBe(sunflowers);
  await expect.poll(() => hostGrid('Маки'), POLL).toBe(withCells(makiCells));
  await expect.poll(() => phoneSudoku28d(hanna), POLL).toBe(withCells(makiCells));
  // Суперник — лише маски: Маки не бачать значень Соняшників ні в DOM, ні в кадрах.
  expect(await phoneSudoku28d(petro), 'Petro sees only his team’s digits').toBe(withCells(makiCells));
  await expectNoValues28d(petro, petroFrames, rivalFrom, 'Petro phone', [question.solution], { dom: false });
  for (const view of stateViews(petroFrames.slice(rivalFrom))) {
    if (view.role !== 'player' || view.me.puzzle === undefined) continue;
    for (const i of [shared, ...olyaCells, ...tarasCells]) expect(view.me.puzzle.cells[i], `a Sunflowers cell ${i} sent to Petro`).toBe('');
  }
  // Сцена: хто що вписав — кольори учасників, під мініатюрою — імена тими ж кольорами.
  const cellClass = async (i: number) => (await stageThumb('Соняшники').locator('.puzzle-thumb-cell').nth(i).getAttribute('class')) ?? '';
  for (const i of olyaCells) expect(await cellClass(i), `Olya’s cell ${i} on the stage`).toMatch(/\bby-1\b/);
  for (const i of tarasCells) expect(await cellClass(i), `Taras’s cell ${i} on the stage`).toMatch(/\bby-2\b/);
  expect(await stageThumb('Соняшники').locator('.puzzle-thumb-members span').allTextContents()).toEqual(['Оля', 'Тарас']);
  expect(await olya.locator('.puzzle-legend li').allTextContents(), 'the legend on the phone').toEqual(['Оля', 'Тарас']);
  expect(await sudokuCell28d(olya, olyaCells[0]!).getAttribute('class'), 'Olya’s colour on her phone').toMatch(/\bby-1\b/);
  expect(await sudokuCell28d(olya, tarasCells[0]!).getAttribute('class'), 'Taras’s colour on Olya’s phone').toMatch(/\bby-2\b/);
  await expectNoValues28d(stage, stageFrames, from, 'stage', [question.solution, sunflowers]);
  await expectPuzzleStageFits28d(stage, 'teams question');
  await shot(stage, 'puzzles28d-teams-stage');
  await shot(olya, 'puzzles28d-teams-phone');
  await expectNoSideScroll(hanna, 'puzzles28d-teams-phone-320');

  // ── Перезапуск сервера посеред судоку: сітки ті самі, телефони пишуть далі. ──
  await restart(async () => {
    await stage.getByText(RESTARTING_TEXT, exact).waitFor();
  });
  for (const page of [stage, ...phones, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click();
  await expect.poll(() => hostGrid('Соняшники'), POLL).toBe(sunflowers);
  await expect.poll(() => hostGrid('Маки'), POLL).toBe(withCells(makiCells));
  await expect.poll(() => phoneSudoku28d(olya), POLL).toBe(sunflowers);
  await expect.poll(() => phoneSudoku28d(petro), POLL).toBe(withCells(makiCells));
  await expect.poll(() => cellClass(tarasCells[0]!), POLL).toMatch(/\bby-2\b/);
  await olya.locator('.sudoku-play:not(.is-off)').waitFor();
  const rest = e.slice(11, -3);
  await fillSudoku28d(olya, rest.filter((_, at) => at % 2 === 0).map((i): [number, string] => [i, sol(i)]), 'keypad');
  await fillSudoku28d(taras, [...rest.filter((_, at) => at % 2 === 1), ...makiCells].map((i): [number, string] => [i, sol(i)]), 'keyboard');
  await expect.poll(() => hostGrid('Соняшники'), POLL).toBe(question.solution);
  await fillSudoku28d(hanna, [[e[0]!, sol(e[0]!)]], 'keypad');

  // «Готово» Тараса фіксує сітку всієї команди: у Олі клавіатури вже немає.
  await done28d(taras);
  await olya.getByText('Розв’язання зафіксовано. Чекаємо інших', exact).first().waitFor();
  expect(await olya.locator('.puzzle-keypad').count(), 'Olya’s keypad after Taras’s done').toBe(0);
  await expect.poll(() => stageThumb('Соняшники').locator('.puzzle-thumb-done').count(), POLL).toBe(1);
  await done28d(hanna);
  await petro.getByText('Розв’язання зафіксовано. Чекаємо інших', exact).first().waitFor();
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor({ timeout: 10_000 });
  await reveal28a(host);
  await expect.poll(() => stageThumb('Соняшники').locator('.score').textContent(), POLL).toBe('+300');
  expect(await stageThumb('Маки').locator('.score').count(), 'points for the unsolved grid').toBe(0);
  for (const [page, score] of [[olya, '300'], [taras, '300'], [petro, '0'], [hanna, '0']] as const) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(score);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectPuzzleStageFits28d(stage, 'teams reveal');
  await shot(stage, 'puzzles28d-teams-reveal-stage');
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

/** 24 гравці без браузера (сокети) заповнюють випадкові клітинки; мініатюри на сцені 1600 × 900 без прокрутки. */
async function puzzlesCrowd28d(sockets: Socket[]) {
  const host = await open('host28dc', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host28dc@example.com');
  const question = sudoku28d('c28d', 9, 'hard', 60);
  const data = { ...makeRoundsQuiz([puzzlesRound('pc28d', [question as never])], { leaderboard: 'end' }), title: 'Головоломки натовпу 28d' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Головоломки натовпу 28d' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage28dc', 1600, 900);
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
  await stage.locator('.puzzle-stage').waitFor();
  await expect.poll(() => stage.locator('.puzzle-stage .puzzle-thumb').count(), POLL).toBe(24);
  // Кожен — від 1 до 12 клітинок (порядок і цифри від номера гравця; частина хибних); кожен третій тисне «Готово».
  const e = empties28d(question.givens);
  for (const [k, player] of players.entries()) {
    const count = 1 + (k % Math.min(12, e.length));
    const cells = Array.from({ length: count }, (_, j) => e[(k * 5 + j * 7) % e.length]!).filter((cell, at, all) => all.indexOf(cell) === at);
    const payload = { questionIndex: 0, cells: cells.map((i, j) => ({ i, v: (k + j) % 4 === 0 ? String((Number(question.solution[i]) % 6) + 1) : question.solution[i]! })) };
    let ack = await emit<{ ok: boolean; error?: string }>(player.socket, 'player:puzzle', payload);
    for (let tries = 0; !ack.ok && ack.error === 'too_soon' && tries < 5; tries++) {
      await sleep(300);
      ack = await emit<{ ok: boolean; error?: string }>(player.socket, 'player:puzzle', payload);
    }
    expect(ack, `${player.nickname} fills`).toEqual({ ok: true });
    if (k % 3 === 2) expect(await emit(player.socket, 'player:puzzle-done', { questionIndex: 0 }), `${player.nickname} is done`).toEqual({ ok: true });
  }
  await expect.poll(() => stage.locator('.puzzle-stage .puzzle-thumb.is-done').count(), POLL).toBe(8);
  await expect.poll(() => stage.locator('.puzzle-stage .puzzle-thumb-cell.is-filled').count(), POLL).toBeGreaterThan(100);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectNoSideScroll(stage, 'puzzles28d-24-stage');
  await expectPuzzleStageFits28d(stage, '24 players');
  const clipped = await stage.locator('.puzzle-stage .puzzle-thumb-name').evaluateAll((all) => all.filter((el) => el.getBoundingClientRect().width < 40).map((el) => el.textContent));
  expect(clipped, 'names squeezed to nothing').toEqual([]);
  await reveal28a(host);
  await stage.locator('.puzzle-stage.is-reveal .puzzle-solution').waitFor();
  await expect.poll(() => stage.locator('.puzzle-stage .puzzle-thumb').count(), POLL).toBe(24);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectPuzzleStageFits28d(stage, '24 players reveal');
  await shot(stage, 'puzzles28d-24-reveal-stage');
}
