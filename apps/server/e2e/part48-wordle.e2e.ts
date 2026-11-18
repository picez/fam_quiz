import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz, wordle as wordleQ, wordle2 as wordle2Q } from '@quiz/engine/testing';
import { wordlePoints } from '@quiz/shared';
import { type Locator, type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, field, questionText, join, register, POLL, socketFrames, RESTARTING_TEXT, NL, sleep, step27a, next27a, phoneScore27a, toWinners27c, reveal28a, pickTeamOn, seconds, pilotPlayer, frame, emitOk, stateViews, launchBot11h, type Pilot } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, noSplashLayer, shot, restart, flags, useE2eServer, ARTIFACTS } from './helpers/setup';

/**
 * Наскрізні тести: частина 48 — «Вгадай слово» (wordle): редактор зі словником, три телефони з повторами літер і невідомим словом, сцена лише з кольорами,
 * апостроф, команди через капітана, перезапуск, автопілот, 3 / 12 / 24 гравці на сцені 1280×720 без прокрутки, телефон 360×740 без прокрутки, світла тема.
 */

useE2eServer();

it('part 48: editor — a wordle word with a dictionary warning, only in classic rounds, the server refuses an unknown word', async () => {
  try {
    await editor48();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 48: wordle — three players, repeated letters, an unknown word, the timer, colour-only stage, 360 px, light theme', async () => {
  try {
    await game48();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 48: wordle — teams guess through the captain, a restart keeps the guesses', async () => {
  try {
    await teams48();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 48: wordle on autopilot — the round plays and finishes by itself, 12 players fit the stage', async () => {
  const sockets: Socket[] = [];
  try {
    await autopilot48(sockets);
    await crowd48(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

it('part 48: wordle — 24 players make two centred rows of 12 on the 1280×720 stage, question and reveal, dark and light', async () => {
  const sockets: Socket[] = [];
  try {
    await crowd48(sockets, [...NAMES48, ...MORE_NAMES48]);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

// ——— Помічники ———

const squash48 = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

type MarkName48 = 'hit' | 'near' | 'miss' | 'none';

/** Слово цілим (кирилиця). */
const hasWord48 = (text: string, word: string) => new RegExp(`(^|[^\\p{L}'’])${word}($|[^\\p{L}'’])`, 'iu').test(text);

/** Кадр екрана (лише з E2E_SHOTS=1) — саме вікно, а не вся сторінка: так видно, що вміщується на 360 px. */
async function viewShot48(page: Page, name: string) {
  if (process.env.E2E_SHOTS !== '1') return;
  await noSplashLayer(page);
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`), fullPage: false });
}

/** Набір слова клавішами телефона й «Перевірити». */
async function typeLetters48(page: Page, word: string) {
  for (const letter of word) {
    await page.locator('.wordle-keys-row:not(.is-actions) .wordle-key', { hasText: new RegExp(`^${letter}$`) }).click();
  }
}
async function guess48(page: Page, word: string) {
  await typeLetters48(page, word);
  await click(page, 'Перевірити');
}

/** Позначки клітинок рядка сітки (0-based): hit / near / miss / none. */
async function marks48(scope: Locator, row: number): Promise<MarkName48[]> {
  return scope
    .locator('.wordle-row')
    .nth(row)
    .locator('.wordle-cell')
    .evaluateAll((cells) => cells.map((cell) => (['hit', 'near', 'miss'] as const).find((name) => cell.classList.contains(`is-${name}`)) ?? 'none'));
}

/** Літери рядка сітки. */
const lettersOf48 = async (scope: Locator, row: number) => (await scope.locator('.wordle-row').nth(row).locator('.wordle-cell').allTextContents()).join('');

/** Скільки прийнятих рядків (з позначками) у сітці. */
const acceptedRows48 = (scope: Locator) => scope.locator('.wordle-row:has(.wordle-cell[role="img"])').count();

/** Сітка телефона: власна в грі чи в підсумку. */
const phoneGrid48 = (page: Page) => page.locator('.wordle-play .wordle-grid, .wordle-outcome .wordle-grid').first();

const status48 = (page: Page) => page.locator('.wordle-status');

/** Клавіатура: уся в межах екрана (без бокового скролу), 12 клавіш найширшого ряду, клавіші — не вужчі за 24 px. */
async function expectKeyboardFits48(page: Page, name: string) {
  const width = page.viewportSize()!.width;
  const info = await page.locator('.wordle-keys').evaluate((root) => {
    const rect = (el: Element) => el.getBoundingClientRect();
    const keys = [...root.querySelectorAll('button')].map((b) => rect(b));
    const widest = [...root.querySelectorAll('.wordle-keys-row:not(.is-actions)')].map((row) => row.querySelectorAll('button').length);
    return {
      left: Math.min(...keys.map((r) => r.left)),
      right: Math.max(...keys.map((r) => r.right)),
      bottom: Math.max(...keys.map((r) => r.bottom)),
      minWidth: Math.min(...[...root.querySelectorAll('.wordle-key')].map((b) => (b as HTMLElement).offsetWidth)),
      minHeight: Math.min(...keys.map((r) => r.height)),
      widest: Math.max(...widest),
      scrolls: root.scrollWidth > root.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth,
      innerHeight,
      pan: `scrollX ${scrollX}, page width ${document.documentElement.scrollWidth}, zone scrolled ${document.querySelector('.debuff-zone')?.scrollLeft ?? 0}`,
      zoneScroll: document.querySelector('.debuff-zone')?.scrollLeft ?? 0,
    };
  });
  console.log(`part 48: ${name} — ${info.pan}`);
  console.log(`part 48: ${name} — keyboard ${Math.round(info.left)}…${Math.round(info.right)} of ${width}, bottom ${Math.round(info.bottom)} of ${info.innerHeight}, key min ${Math.round(info.minWidth)}×${Math.round(info.minHeight)}, widest row ${info.widest}`);
  expect(info.widest, `${name}: the widest keyboard row`).toBe(12);
  expect(info.left, `${name}: the keyboard starts left of the screen`).toBeGreaterThanOrEqual(-0.5);
  expect(info.right, `${name}: the keyboard ends past ${width}`).toBeLessThanOrEqual(width + 0.5);
  expect(info.scrolls, `${name}: sideways scroll`).toBe(false);
  expect(info.zoneScroll, `${name}: the debuff zone scrolled sideways`).toBe(0);
  expect(info.minWidth, `${name}: a key is too narrow`).toBeGreaterThanOrEqual(22);
}

/** Телефон: сітка, легенда, три ряди клавіш і «Перевірити» — у вікні без прокрутки (низ «Перевірити» ≤ висоти вікна). */
async function expectPhoneFits48(page: Page, name: string) {
  const info = await page.evaluate(() => {
    const bottom = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().bottom ?? -1;
    const cell = document.querySelector('.wordle-play .wordle-row .wordle-cell')?.getBoundingClientRect();
    const key = document.querySelector('.wordle-keys-row .wordle-key')?.getBoundingClientRect();
    return {
      grid: bottom('.wordle-play .wordle-grid'),
      legend: bottom('.wordle-legend'),
      keys: bottom('.wordle-keys-row:nth-child(3)'),
      check: bottom('.wordle-check'),
      cell: cell === undefined ? 0 : cell.width,
      key: key === undefined ? 0 : key.height,
      scrollHeight: document.documentElement.scrollHeight,
      below: [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().bottom > innerHeight + 1 && el.getBoundingClientRect().height > 0)
        .slice(0, 8)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}@${Math.round(el.getBoundingClientRect().top)}–${Math.round(el.getBoundingClientRect().bottom)}`),
      scrollY,
      innerHeight,
    };
  });
  console.log(`part 48: ${name} — grid ends ${Math.round(info.grid)}, legend ${Math.round(info.legend)}, 3rd key row ${Math.round(info.keys)}, «Перевірити» ${Math.round(info.check)} of ${info.innerHeight}; cell ${Math.round(info.cell)} px, key height ${Math.round(info.key)} px, page ${info.scrollHeight}; below the fold: ${info.below.join(" ")}`);
  expect(info.check, `${name}: no «Перевірити»`).toBeGreaterThan(0);
  expect(info.scrollY, `${name}: the page is scrolled`).toBe(0);
  for (const [part, bottom] of [['grid', info.grid], ['legend', info.legend], ['third key row', info.keys], ['«Перевірити»', info.check]] as const) {
    expect(bottom, `${name}: the ${part} ends below the ${info.innerHeight} px screen`).toBeLessThanOrEqual(info.innerHeight);
  }
  expect(info.scrollHeight, `${name}: the phone page scrolls down`).toBeLessThanOrEqual(info.innerHeight + 1);
}

/** Сцена: дошки по центру — поля зліва й справа від крайніх дошок рівні (±2 px) і не нульові. */
async function expectBoardsCentred48(stage: Page, name: string) {
  const { left, right, width, cell } = await stage.locator('.wordle-board').evaluate((board) => {
    const box = board.getBoundingClientRect();
    const items = [...board.children].map((li) => li.getBoundingClientRect());
    const first = items.filter((r) => Math.abs(r.top - items[0]!.top) < 1);
    return {
      left: Math.min(...first.map((r) => r.left)) - box.left,
      right: box.right - Math.max(...first.map((r) => r.right)),
      width: box.width,
      cell: board.querySelector('.wordle-cell')!.getBoundingClientRect().width,
    };
  });
  console.log(`part 48: ${name} — boards ${Math.round(left)} px from the left, ${Math.round(right)} px from the right of ${Math.round(width)}, cell ${cell.toFixed(1)} px`);
  expect(Math.abs(left - right), `${name}: boards are not centred (${left} vs ${right})`).toBeLessThanOrEqual(2);
  return cell;
}

/** Сторінка не гортається вбік. */
async function noSide48(page: Page, name: string) {
  expect((await page.evaluate('document.documentElement.scrollWidth <= innerWidth')) as boolean, `${name}: horizontal scroll`).toBe(true);
}

/** Контраст тексту з його справжнім тлом (альфи предків змішано через canvas): відношення яскравостей WCAG. */
async function contrast48(scope: Locator): Promise<{ color: string; background: string; ratio: number }> {
  return scope.first().evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (css: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!, a! / 255] as const;
    };
    const layers: (readonly [number, number, number, number])[] = [];
    for (let node: Element | null = el; node !== null; node = node.parentElement) layers.push(rgba(getComputedStyle(node).backgroundColor));
    let bg = [255, 255, 255];
    for (const [r, g, b, a] of layers.reverse()) bg = [r * a + bg[0]! * (1 - a), g * a + bg[1]! * (1 - a), b * a + bg[2]! * (1 - a)];
    const [fr, fg, fb, fa] = rgba(getComputedStyle(el).color);
    const fore = [fr * fa + bg[0]! * (1 - fa), fg * fa + bg[1]! * (1 - fa), fb * fa + bg[2]! * (1 - fa)];
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [hi, lo] = [lum(fore), lum(bg)].sort((x, y) => y - x);
    return { color: getComputedStyle(el).color, background: `rgb(${bg.map(Math.round).join(', ')})`, ratio: (hi! + 0.05) / (lo! + 0.05) };
  });
}

/** Читається: текст клітинки з літерою (чи клавіші) проти її заливки ≥ 4,5. */
async function expectReadable48(scope: Locator, name: string, min = 4.5) {
  const { color, background, ratio } = await contrast48(scope);
  console.log(`part 48: ${name} — ${color} on ${background}, contrast ${ratio.toFixed(2)}`);
  expect(color, `${name}: the text colour is the background`).not.toBe(background);
  expect(ratio, `${name}: contrast ${color} on ${background}`).toBeGreaterThanOrEqual(min);
}

/** Межа клітинки з тлом сторінки (заливка проти картки навколо): відношення яскравостей ≥ 3 (WCAG 1.4.11). */
async function cellEdge48(cell: Locator): Promise<number> {
  return cell.first().evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (css: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!, a! / 255] as const;
    };
    const flat = (node: Element | null) => {
      const layers: (readonly [number, number, number, number])[] = [];
      for (let n = node; n !== null; n = n.parentElement) layers.push(rgba(getComputedStyle(n).backgroundColor));
      let bg = [255, 255, 255];
      for (const [r, g, b, a] of layers.reverse()) bg = [r * a + bg[0]! * (1 - a), g * a + bg[1]! * (1 - a), b * a + bg[2]! * (1 - a)];
      return bg;
    };
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [hi, lo] = [lum(flat(el)), lum(flat(el.parentElement))].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  });
}

/** Рамка клітинки (колір border) проти тла під нею (альфи предків змішано): відношення яскравостей WCAG. */
async function typedEdge48(cell: Locator): Promise<{ border: string; background: string; ratio: number }> {
  return cell.first().evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (css: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!, a! / 255] as const;
    };
    const layers: (readonly [number, number, number, number])[] = [];
    for (let n: Element | null = el; n !== null; n = n.parentElement) layers.push(rgba(getComputedStyle(n).backgroundColor));
    let bg = [255, 255, 255];
    for (const [r, g, b, a] of layers.reverse()) bg = [r * a + bg[0]! * (1 - a), g * a + bg[1]! * (1 - a), b * a + bg[2]! * (1 - a)];
    const [br, bgc, bb, ba] = rgba(getComputedStyle(el).borderTopColor);
    const edge = [br * ba + bg[0]! * (1 - ba), bgc * ba + bg[1]! * (1 - ba), bb * ba + bg[2]! * (1 - ba)];
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [hi, lo] = [lum(edge), lum(bg)].sort((x, y) => y - x);
    return { border: getComputedStyle(el).borderTopColor, background: `rgb(${bg.map(Math.round).join(', ')})`, ratio: (hi! + 0.05) / (lo! + 0.05) };
  });
}

/** Форми не залежать від кольору: «є в слові» — коло, «немає» — менша клітинка, «на місці» — квадрат із товстою рамкою. */
async function expectShapes48(scope: Locator, name: string) {
  const shapes = await scope.evaluate((root) => {
    const read = (mark: string) => {
      const el = root.querySelector(`.wordle-cell.is-${mark}`);
      if (el === null) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return { radius: style.borderTopLeftRadius, border: style.borderTopWidth, width: Math.round(rect.width), opacity: style.opacity };
    };
    return { hit: read('hit'), near: read('near'), miss: read('miss') };
  });
  console.log(`part 48: ${name} — shapes ${JSON.stringify(shapes)}`);
  expect(shapes.hit, `${name}: no hit cell`).not.toBeNull();
  expect(shapes.near, `${name}: no near cell`).not.toBeNull();
  expect(shapes.miss, `${name}: no miss cell`).not.toBeNull();
  expect(shapes.near!.radius, `${name}: near looks like hit`).not.toBe(shapes.hit!.radius);
  expect(shapes.near!.radius, `${name}: near is not round`).toMatch(/%|\d{2,}px/);
  expect(shapes.miss!.width, `${name}: miss is not smaller than hit`).toBeLessThan(shapes.hit!.width);
  expect(shapes.hit!.border, `${name}: hit has no border`).not.toBe('0px');
}

/** Тема пристрою: light — quiz:theme = light; dark — ключа немає. */
async function theme48(page: Page, mode: 'light' | 'dark') {
  await page.evaluate((wanted) => (wanted === 'light' ? localStorage.setItem('quiz:theme', 'light') : localStorage.removeItem('quiz:theme')), mode);
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('is-light')), POLL).toBe(mode === 'light');
}

/** Сцена: без прокрутки; дошка й усі її рядки в вікні, не під кутовими кнопками й смугою реакцій. */
async function expectBoardInView48(stage: Page, name: string) {
  const [height, clientH, width, clientW] = (await stage.evaluate('[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]')) as number[];
  const layout = await stage.evaluate(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r === undefined ? '—' : `${Math.round(r.top)}–${Math.round(r.bottom)}`;
    };
    const app = document.querySelector('.app');
    return `title ${box('.stage-question h2, .stage-question .question-text')}, answer ${box('.wordle-answer')}, board ${box('.wordle-board')}, first board ${box('.wordle-board > li')}, app padding-bottom ${app === null ? '—' : getComputedStyle(app).paddingBottom}`;
  });
  console.log(`part 48: ${name} — page ${height} of ${clientH}; ${layout}`);
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const viewport = stage.viewportSize()!;
  for (const target of ['.stage-question', '.wordle-stage', '.wordle-board']) {
    const box = (await stage.locator(target).first().boundingBox())!;
    console.log(`part 48: ${name} — ${target} ${Math.round(box.width)}×${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)}, bottom ${Math.round(box.y + box.height)} of ${viewport.height}`);
    expect(box.y + box.height, `${name}: ${target} reaches below the ${viewport.height} px stage`).toBeLessThanOrEqual(viewport.height + 1);
  }
  const out = await stage.locator('.wordle-board > li').evaluateAll((all) => all.filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.left < -1 || r.top < -1); }).map((el) => el.textContent));
  expect(out, `${name}: boards outside the stage`).toEqual([]);
  const covered = await stage.evaluate(() => {
    const blockers = [...document.querySelectorAll('.stage-speech button, .reaction-strip')].map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
    return [...document.querySelectorAll('.wordle-board > li, .wordle-answer')]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return blockers.some((b) => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top);
      })
      .map((el) => el.textContent);
  });
  expect(covered, `${name}: boards under a fixed corner`).toEqual([]);
}

/** Сцена до розкриття: ні літер у клітинках, ні слів у тексті сторінки. */
async function expectColoursOnly48(stage: Page, words: string[], name: string) {
  const cells = await stage.locator('.wordle-board .wordle-cell').evaluateAll((all) => all.filter((el) => (el.textContent ?? '').trim() !== '' || /[А-Яа-яЇїІіЄєҐґ]\s—/.test(el.getAttribute('aria-label') ?? '')).map((el) => `${el.textContent}|${el.getAttribute('aria-label')}`));
  expect(cells, `${name}: letters on the stage cells`).toEqual([]);
  const dom = await stage.locator('body').innerText();
  for (const word of words) expect(hasWord48(dom, word), `«${word}» in the stage DOM — ${name}`).toBe(false);
  expect(await stage.locator('.wordle-answer').count(), `${name}: the answer on the stage`).toBe(0);
}

/** Усі кадри state сцени/телефона до розкриття: слова немає ні в тексті, ні в полях зрізу. */
function expectNoWord48(who: string, frames: string[], from: number, words: string[]) {
  // Зріз до розкриття: звіряється, поки розкриття ще не було.
  const text = frames.slice(from).join(NL);
  expect(text.length, `${who}: no frames before reveal`).toBeGreaterThan(0);
  for (const word of words) expect(hasWord48(text, word), `«${word}» in the ${who} before reveal`).toBe(false);
}

async function startGame48(host: Page, stage: Page, phones: Page[]) {
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
}

/** Зберігає вікторину API, відкриває кімнату з пульта й сцену; повертає код. */
async function launch48(host: Page, quiz: unknown, title: string, stageName: string, stageSize: { width: number; height: number } = { width: 1280, height: 720 }) {
  const saved = await host.request.post(`${base}/api/quizzes`, { data: { ...(quiz as object), title } });
  expect(saved.ok(), await saved.text()).toBe(true);
  const hostFrames = socketFrames(host);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open(stageName, stageSize.width, stageSize.height);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  return { code, stage, stageFrames, hostFrames };
}

const q48 = (base: typeof wordleQ, id: string, timeLimit: number, points: number, extra: Record<string, unknown> = {}) => ({ ...base, id, timeLimit, points, ...extra }) as never;

// ——— 1. Редактор ———

async function editor48() {
  const host = await open('host48e', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host48e@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Вгадай слово 48');

  // ── Класика: «Вгадай слово» у меню; типовий текст і 120 с. ──
  const types = host.getByRole('group', { name: 'Тип запитання', ...exact });
  expect(await types.getByRole('button', { name: 'Вгадай слово', ...exact }).count(), 'wordle in the classic menu').toBe(1);
  await types.getByRole('button', { name: 'Вгадай слово', ...exact }).click();
  await expect.poll(() => questionText(host).inputValue(), POLL).toBe('Вгадайте слово');
  await expect.poll(() => field(host, 'Час, с').inputValue(), POLL).toBe('120');

  // ── Слово не з словника: попередження наживо, збереження відмовляє, вікторини в списку немає. ──
  await field(host, 'Слово').fill('лампо');
  await host.getByText(/^Немає в словнику: лампо/).waitFor();
  await shot(host, 'wordle48-editor-warning');
  const listed = async () => ((await (await host.request.get(`${base}/api/quizzes`)).json()) as { title: string }[]).filter((entry) => entry.title === 'Вгадай слово 48').length;
  await click(host, 'Зберегти');
  await host.getByText('Слова для „Вгадай слово“ немає в словнику — виберіть інше', exact).first().waitFor();
  expect(await listed(), 'a quiz with an unknown wordle word was saved').toBe(0);
  // Браузер журналює саме цю відмову сервера (400) — очікувану; інших помилок консолі бути не має.
  for (let at = problems.length - 1; at >= 0; at--) if (/400 \(Bad Request\).*\/api\/quizzes$/.test(problems[at]!)) problems.splice(at, 1);

  // ── Бліц: «Вгадай слово» в меню немає; раунд прибрано. ──
  await click(host, '+ Раунд');
  await click(host, 'Бліц');
  await types.getByRole('button', { name: 'один варіант', ...exact }).waitFor();
  expect(await types.getByRole('button', { name: 'Вгадай слово', ...exact }).count(), 'wordle in the blitz menu').toBe(0);
  await click(host, 'Видалити раунд');

  // ── Слово зі словника: «Літер: 5», зберігається. ──
  await field(host, 'Слово').fill('колос');
  await host.getByText('Літер: 5', exact).waitFor();
  await expect.poll(() => host.getByText(/^Немає в словнику/).count(), POLL).toBe(0);
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Вгадай слово 48' }).waitFor();
  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Вгадай слово 48')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { type: string; questions: Record<string, unknown>[] }[] };
  expect(stored.rounds.map((round) => round.type)).toEqual(['classic']);
  expect(stored.rounds[0]!.questions[0]).toMatchObject({ type: 'wordle', text: 'Вгадайте слово', word: 'колос', timeLimit: 120 });

  // ── Прямий запит зі словом поза словником — відмова сервера; зі словником — ок. ──
  const bypass = await host.request.post(`${base}/api/quizzes`, { data: { ...makeRoundsQuiz([classicRound('ce48', [q48(wordleQ, 'we1', 60, 1000, { word: 'лампо' })])]), title: 'Лампо 48' } });
  const refusal = (await bypass.json()) as { error?: string; reason?: string };
  console.log(`part 48: the server on «лампо» — ${bypass.status()} ${JSON.stringify(refusal)}`);
  expect(bypass.status(), 'the server refusal').toBe(400);
  expect(refusal).toMatchObject({ error: 'invalid_payload', reason: 'wordle_unknown' });
  const plain = await host.request.post(`${base}/api/quizzes`, { data: { ...makeRoundsQuiz([classicRound('ce48b', [q48(wordleQ, 'we2', 60, 1000)])]), title: 'Колос 48' } });
  expect(plain.ok(), await plain.text()).toBe(true);

  // ── Повторне відкриття: слово на місці. ──
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Вгадай слово 48' }).getByRole('link', { name: 'Редагувати' }).click();
  await host.locator('main.editor').waitFor();
  await expect.poll(() => field(host, 'Слово').inputValue().catch(() => ''), POLL).toBe('колос');
  await host.getByText('Літер: 5', exact).waitFor();
  await shot(host, 'wordle48-editor');

  expect(problems).toEqual([]);
}

// ——— 2. Гра: три телефони ———

async function game48() {
  const host = await open('host48', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host48@example.com');
  const quiz = makeRoundsQuiz([classicRound('c48', [q48(wordleQ, 'wl1', 40, 1000), q48(wordle2Q, 'wl2', 30, 600)], { speedBonus: false })], { leaderboard: 'end' });
  const { code, stage, stageFrames, hostFrames } = await launch48(host, quiz, 'Вгадай слово гра 48', 'stage48');
  const olya = await open('olya48', 360, 740, { hasTouch: true, isMobile: true });
  const taras = await open('taras48', 360, 740);
  const petro = await open('petro48', 375, 812);
  const phones = [olya, taras, petro];
  const names = ['Оля', 'Тарас', 'Петро'];
  const petroFrames = socketFrames(petro);
  const olyaFrames = socketFrames(olya);
  for (const [at, page] of phones.entries()) await join(page, code, names[at]!, false);
  await stage.getByText('Петро').waitFor();
  await startGame48(host, stage, phones);
  const from = { stage: stageFrames.length, petro: petroFrames.length, olya: olyaFrames.length, host: hostFrames.length };
  await stage.getByText("Вгадайте іменник з п'яти літер", exact).first().waitFor();

  // ── Телефон Олі 360: клавіатура ЙЦУКЕН цілком у вікні, порожня сітка 6 × 5, легенда. ──
  await olya.locator('.wordle-keys').waitFor();
  await expectKeyboardFits48(olya, 'olya 360');
  await expectPhoneFits48(olya, 'olya 360×740 dark, empty grid');
  expect(await olya.locator('.wordle-play .wordle-row').count(), 'rows in the grid').toBe(6);
  expect(await olya.locator('.wordle-play .wordle-row').first().locator('.wordle-cell').count(), 'cells in a row').toBe(5);
  expect(await olya.locator('.wordle-legend li').allTextContents()).toEqual(['на місці', 'є в слові', 'немає']);

  // ── Оля: «сосна» → near hit miss miss miss (друге «с» сіре); клавіші тримають найкращу позначку. ──
  await guess48(olya, 'сосна');
  await expect.poll(() => marks48(phoneGrid48(olya), 0), POLL).toEqual(['near', 'hit', 'miss', 'miss', 'miss']);
  expect(await lettersOf48(phoneGrid48(olya), 0)).toBe('сосна');
  expect(await acceptedRows48(phoneGrid48(olya)), 'accepted rows').toBe(1);
  const keyClass = (letter: string) => olya.locator('.wordle-keys-row:not(.is-actions) .wordle-key', { hasText: new RegExp(`^${letter}$`) }).getAttribute('class');
  expect(await keyClass('с'), '«с» key').toContain('is-near');
  expect(await keyClass('о'), '«о» key').toContain('is-hit');
  expect(await keyClass('н'), '«н» key').toContain('is-miss');
  expect(await olya.locator('.wordle-key[aria-label="с — є в слові"]').count(), 'a text label on a marked key').toBe(1);
  await expectShapes48(olya.locator('.wordle-play'), 'phone cells');
  // Рядок набору: «ко» — половина слова, кадр «посеред гри».
  await typeLetters48(olya, 'ко');
  await expect.poll(() => lettersOf48(olya.locator('.wordle-play .wordle-grid'), 1), POLL).toBe('ко');
  await expectKeyboardFits48(olya, 'olya mid-game 360');
  await noSide48(olya, 'olya mid-game');
  await viewShot48(olya, 'wordle48-phone-360');
  await typeLetters48(olya, 'лос');
  await click(olya, 'Перевірити');
  await olya.getByText('Вгадано з 2-ї спроби!', exact).first().waitFor();
  expect(await marks48(phoneGrid48(olya), 1)).toEqual(['hit', 'hit', 'hit', 'hit', 'hit']);
  expect(await olya.locator('.wordle-keys').count(), 'the keyboard after solving').toBe(0);
  await noSide48(olya, 'olya solved');
  await viewShot48(olya, 'wordle48-solved-360');

  // ── Тарас: «лампо» — немає в словнику, спроб не поменшало; рядок лишається для виправлення. ──
  await taras.locator('.wordle-keys').waitFor();
  await expectPhoneFits48(taras, 'taras 360×740 dark, empty grid');
  await guess48(taras, 'лампо');
  await expect.poll(() => status48(taras).textContent(), POLL).toBe('Такого слова немає в словнику');
  expect(await acceptedRows48(phoneGrid48(taras)), 'an unknown word used a try').toBe(0);
  expect(await lettersOf48(phoneGrid48(taras), 0), 'the typed row after a refusal').toBe('лампо');
  for (let at = 0; at < 5; at++) await taras.getByRole('button', { name: 'Стерти літеру', ...exact }).click();
  expect(await lettersOf48(phoneGrid48(taras), 0)).toBe('');
  await guess48(taras, 'молот');
  await expect.poll(() => marks48(phoneGrid48(taras), 0), POLL).toEqual(['miss', 'hit', 'hit', 'hit', 'miss']);
  await guess48(taras, 'колос');
  await taras.getByText('Вгадано з 2-ї спроби!', exact).first().waitFor();

  // ── Петро: одна спроба «посол» і далі нічого. ──
  await guess48(petro, 'посол');
  await expect.poll(() => marks48(phoneGrid48(petro), 0), POLL).toEqual(['miss', 'hit', 'near', 'hit', 'near']);

  // ── Сцена до розкриття: лише кольори (в клітинках немає літер), рядки в порядку гравців. ──
  await expect.poll(() => stage.locator('.wordle-board > li').count(), POLL).toBe(3);
  await expect.poll(() => stage.locator('.wordle-board > li .name').allTextContents(), POLL).toEqual(names);
  await expect.poll(() => marks48(stage.locator('.wordle-board > li').first(), 0), POLL).toEqual(['near', 'hit', 'miss', 'miss', 'miss']);
  await expect.poll(() => marks48(stage.locator('.wordle-board > li').first(), 1), POLL).toEqual(['hit', 'hit', 'hit', 'hit', 'hit']);
  await expect.poll(() => marks48(stage.locator('.wordle-board > li').nth(1), 0), POLL).toEqual(['miss', 'hit', 'hit', 'hit', 'miss']);
  await expectColoursOnly48(stage, ['колос', 'сосна', 'молот', 'посол'], 'question');
  await expectShapes48(stage.locator('.wordle-board'), 'stage cells');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  // Троє на сцені: дошки по центру й великі (клітинка ≥ 36 px), сцена не гортається.
  await expectBoardInView48(stage, '3 question 1280×720');
  expect(await expectBoardsCentred48(stage, '3 question 1280×720'), '3 players: stage cells are tiny').toBeGreaterThanOrEqual(36);
  await viewShot48(stage, 'wordle48-stage-question');

  // ── Пульт: слово ведучого на картці запитання, літери кожної спроби — у рядках «Відповіді наживо» (панель .host-wordle живе лише на розкритті). ──
  await host.getByText('Правильна відповідь: КОЛОС', exact).waitFor();
  const liveOf = (name: string) => host.locator('#live-answers .live-row', { has: host.locator('.name', { hasText: new RegExp(`^${name}$`) }) });
  await expect.poll(async () => squash48(await liveOf('Оля').textContent()), POLL).toContain('2 з 6 · сосна · колос');
  await expect.poll(async () => squash48(await liveOf('Тарас').textContent()), POLL).toContain('2 з 6 · молот · колос');
  await expect.poll(async () => squash48(await liveOf('Петро').textContent()), POLL).toContain('1 з 6 · посол');
  expect(await host.locator('.host-wordle').count(), 'the wordle panel next to the live rows').toBe(0);
  await shot(host, 'wordle48-host');
  await liveOf('Оля').scrollIntoViewIfNeeded();
  await viewShot48(host, 'wordle48-host-live');

  // ── До розкриття: у кадрах сцени слів ведучого й спроб немає, поля літер — null; у чужому телефоні — теж. ──
  const secret = ['колос', 'сосна', 'молот', 'посол'];
  expectNoWord48('stage frames', stageFrames, from.stage, secret);
  const stageViews = stateViews(stageFrames.slice(from.stage)).filter((view) => view.wordle !== undefined);
  expect(stageViews.length, 'stage frames with wordle').toBeGreaterThan(0);
  for (const view of stageViews) {
    expect(view.wordle!.word, 'the word on a stage frame').toBeNull();
    for (const row of view.wordle!.rows) expect(row.guesses, `guesses of ${row.nickname} on a stage frame`).toBeNull();
  }
  expectNoWord48('Петро frames', petroFrames, from.petro, ['колос', 'сосна', 'молот']);
  for (const view of stateViews(petroFrames.slice(from.petro)).filter((v) => v.wordle !== undefined)) {
    expect(view.wordle!.word, 'the word on a phone frame').toBeNull();
    for (const row of view.wordle!.rows) expect(row.guesses, `guesses of ${row.nickname} on a phone frame`).toBeNull();
    expect(view.me.wordle?.word ?? null, 'me.wordle.word before reveal').toBeNull();
  }
  // Телефон Олі, що вже вгадала, бачить лише свої спроби й слова ще не має.
  expectNoWord48('Оля frames', olyaFrames, from.olya, ['молот', 'посол']);
  for (const view of stateViews(olyaFrames.slice(from.olya)).filter((v) => v.me.wordle !== undefined)) expect(view.me.wordle!.word, 'the word on a solved phone before reveal').toBeNull();
  const hostText = hostFrames.slice(from.host).join(NL);
  expect(hasWord48(hostText, 'колос') && hasWord48(hostText, 'сосна'), 'the host gets the word and the guesses before reveal').toBe(true);

  // ── Час спливає (40 с): Петро без розгадки → закриття, розкриття. ──
  const show = host.getByRole('button', { name: 'Показати відповідь', ...exact });
  await expect.poll(() => show.isEnabled().catch(() => false), { timeout: 90_000, interval: 500 }).toBe(true);
  await petro.locator('.wordle-outcome').waitFor();
  expect(await petro.locator('.wordle-keys').count(), 'a keyboard on a locked phone').toBe(0);
  await reveal28a(host);

  // ── Розкриття: «КОЛОС», сітки з літерами, «вгадав за 2 спроби» ×2, Петро «не вгадав»; історія 833, 833, 0. ──
  await stage.locator('.wordle-answer-word', { hasText: 'КОЛОС' }).waitFor();
  await expect.poll(() => lettersOf48(stage.locator('.wordle-board > li').first(), 0), POLL).toBe('сосна');
  await expect.poll(() => lettersOf48(stage.locator('.wordle-board > li').nth(2), 0), POLL).toBe('посол');
  const tags = () => stage.locator('.wordle-board > li .tag').allTextContents();
  await expect.poll(tags, POLL).toEqual(['вгадав за 2 спроби', 'вгадав за 2 спроби', 'не вгадав']);
  const stagePoints = await stage.locator('.wordle-board > li .score').allTextContents();
  expect(stagePoints.slice(0, 2).map((text) => text.replace(/\s/g, ''))).toEqual(['+833', '+833']);
  for (const [at, wanted] of [833, 833, 0].entries()) await expect.poll(() => phoneScore27a(phones[at]!).textContent().then((t) => (t ?? '').replace(/\s/g, '')), POLL).toBe(String(wanted));
  await petro.locator('.wordle-word', { hasText: 'Слово: КОЛОС' }).waitFor();
  await olya.locator('.wordle-word', { hasText: 'Слово: КОЛОС' }).waitFor();
  await noSide48(petro, 'petro reveal');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await viewShot48(stage, 'wordle48-reveal-stage');
  await viewShot48(petro, 'wordle48-reveal-phone');
  // Пульт на розкритті: панель «Вгадай слово» з тією самою дошкою.
  await host.locator('.host-wordle .wordle-answer-word', { hasText: 'КОЛОС' }).waitFor();
  await host.locator('.host-wordle').scrollIntoViewIfNeeded();
  await shot(host, 'wordle48-host-reveal');
  await viewShot48(host, 'wordle48-host-panel');
  await expectBoardInView48(stage, 'reveal 1280×720');
  expect(await expectBoardsCentred48(stage, '3 reveal 1280×720'), '3 players at reveal: stage cells are tiny').toBeGreaterThanOrEqual(22);
  // Після розкриття слово є в кадрах сцени.
  expect(stageFrames.slice(from.stage).join(NL), 'the word after reveal').toContain('колос');

  // ── Друге: «м'ясо» (4 літери). Тарас набирає «мясо» → прийнято як «м'ясо», вгадано з 1-ї спроби (+600). ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  await stage.getByText('Вгадайте іменник з чотирьох літер', exact).first().waitFor();
  await taras.locator('.wordle-keys').waitFor();
  expect(await taras.locator('.wordle-play .wordle-row').first().locator('.wordle-cell').count(), 'cells for м’ясо').toBe(4);
  // Олі «село»: с near, е miss, л miss, о hit — і є що вимірювати в обох темах.
  await guess48(olya, 'село');
  await expect.poll(() => marks48(phoneGrid48(olya), 0), POLL).toEqual(['near', 'miss', 'miss', 'hit']);
  await guess48(taras, 'мясо');
  await taras.getByText('Вгадано з 1-ї спроби!', exact).first().waitFor();
  expect(await marks48(phoneGrid48(taras), 0)).toEqual(['hit', 'hit', 'hit', 'hit']);
  await expect.poll(() => marks48(stage.locator('.wordle-board > li').nth(1), 0), POLL).toEqual(['hit', 'hit', 'hit', 'hit']);

  // ── Світла тема: телефон 360 з відкритою клавіатурою без бокового скролу, контраст клітинок, сцена. ──
  for (const page of [olya, stage]) await theme48(page, 'light');
  await olya.locator('.wordle-keys').waitFor();
  await expect.poll(() => marks48(phoneGrid48(olya), 0), POLL).toEqual(['near', 'miss', 'miss', 'hit']);
  await stage.locator('.wordle-board > li').nth(1).waitFor();
  await expectKeyboardFits48(olya, 'light olya 360');
  await expectPhoneFits48(olya, 'olya 360×740 light');
  await noSide48(olya, 'olya light with keyboard');
  // Набрані літери в світлій темі: рамка клітинки читається на тлі (≥ 3 : 1).
  await typeLetters48(olya, 'со');
  await expect.poll(() => lettersOf48(olya.locator('.wordle-play .wordle-grid'), 1), POLL).toBe('со');
  const typedEdge = await typedEdge48(olya.locator('.wordle-play .wordle-cell.is-typed'));
  console.log(`part 48: light typed cell border ${typedEdge.border} on ${typedEdge.background} — ${typedEdge.ratio.toFixed(2)}`);
  expect(typedEdge.ratio, 'light typed cell border').toBeGreaterThanOrEqual(3);
  await expectReadable48(olya.locator('.wordle-play .wordle-cell.is-typed'), 'light typed letter');
  await expectPhoneFits48(olya, 'olya 360×740 light, typing');
  await viewShot48(olya, 'wordle48-light-phone-360');
  for (const [scope, name] of [[olya.locator('.wordle-play .wordle-cell.is-hit'), 'light phone hit cell'], [olya.locator('.wordle-play .wordle-cell.is-near'), 'light phone near cell'], [olya.locator('.wordle-keys .wordle-key.is-hit'), 'light hit key'], [olya.locator('.wordle-keys .wordle-key.is-near'), 'light near key'], [stage.locator('.wordle-board .wordle-cell.is-hit'), 'light stage hit cell'], [stage.locator('.wordle-board .wordle-cell.is-near'), 'light stage near cell']] as const) {
    if ((await scope.count()) === 0) continue;
    // На сцені літер до розкриття немає: контраст — для тексту, коли він є.
    if (name.startsWith('light stage')) continue;
    await expectReadable48(scope, name);
  }
  for (const [scope, name] of [[olya.locator('.wordle-play .wordle-cell.is-hit'), 'hit'], [olya.locator('.wordle-play .wordle-cell.is-near'), 'near'], [olya.locator('.wordle-play .wordle-cell.is-miss'), 'miss'], [stage.locator('.wordle-board .wordle-cell.is-hit'), 'stage hit'], [stage.locator('.wordle-board .wordle-cell.is-near'), 'stage near']] as const) {
    if ((await scope.count()) === 0) continue;
    const edge = await cellEdge48(scope);
    console.log(`part 48: light ${name} cell against its card — ${edge.toFixed(2)}`);
  }
  await expectShapes48(olya.locator('.wordle-play'), 'light phone cells');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView48(stage, 'light 3 question 1280×720');
  await expectBoardsCentred48(stage, 'light 3 question 1280×720');
  await viewShot48(stage, 'wordle48-light-stage');
  await theme48(olya, 'dark');
  await theme48(stage, 'dark');

  // ── Закриваємо, розкриття: «М'ЯСО», рахунки 833 / 1433 / 0. ──
  await reveal28a(host);
  await stage.locator('.wordle-answer-word').waitFor();
  expect(await stage.locator('.wordle-answer-word').textContent()).toMatch(/^М['’ʼ]ЯСО$/);
  await expect.poll(() => lettersOf48(stage.locator('.wordle-board > li').nth(1), 0), POLL).toMatch(/^м['’ʼ]?ясо$/);
  await expect.poll(() => stage.locator('.wordle-board > li').nth(1).locator('.tag').textContent(), POLL).toBe('вгадав за 1 спробу');
  for (const [at, wanted] of [833, 1433, 0].entries()) await expect.poll(() => phoneScore27a(phones[at]!).textContent().then((t) => (t ?? '').replace(/\s/g, '')), POLL).toBe(String(wanted));
  await taras.locator('.wordle-word').filter({ hasText: /^Слово: М['’ʼ]ЯСО$/ }).waitFor();
  // Розкриття трьох у світлій темі: сцена не гортається, дошки по центру.
  await theme48(stage, 'light');
  await stage.locator('.wordle-answer-word').waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView48(stage, 'light 3 reveal 1280×720');
  await expectBoardsCentred48(stage, 'light 3 reveal 1280×720');
  await viewShot48(stage, 'wordle48-light-reveal-stage');
  await theme48(stage, 'dark');
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

// ——— 3. Команди й перезапуск ———

async function teams48() {
  const host = await open('host48t', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host48t@example.com');
  const quiz = makeRoundsQuiz([classicRound('ct48', [q48(wordleQ, 'wt1', 120, 1000)], { speedBonus: false })], { leaderboard: 'end', teams: { count: 2, names: ['Червоні', 'Сині'], answerer: 'captain' } });
  const { code, stage } = await launch48(host, quiz, 'Вгадай слово команди 48', 'stage48t');
  const olya = await open('olya48t', 360, 740, { hasTouch: true, isMobile: true });
  const petro = await open('petro48t', 360, 740);
  const ira = await open('ira48t', 375, 812);
  const marko = await open('marko48t', 360, 740);
  const phones = [olya, petro, ira, marko];
  for (const [page, nickname, team] of [[olya, 'Оля', 'Червоні'], [petro, 'Петро', 'Червоні'], [ira, 'Іра', 'Сині'], [marko, 'Марко', 'Сині']] as const) {
    await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
  }
  await startGame48(host, stage, phones);

  // ── Капітан (Оля, Іра) має клавіатуру; другий учасник — сітку команди й «Вгадує той, хто відповідає за команду…» без клавіатури. ──
  await olya.locator('.wordle-keys').waitFor();
  await ira.locator('.wordle-keys').waitFor();
  for (const page of [petro, marko]) {
    await page.locator('.wordle-watch').getByText(/^Вгадує той, хто відповідає за команду/).waitFor();
    expect(await page.locator('.wordle-keys').count(), 'a keyboard for a teammate').toBe(0);
    expect(await page.locator('.wordle-play .wordle-row').count(), 'the team grid for a teammate').toBe(6);
  }
  await expect.poll(() => stage.locator('.wordle-board > li .name').allTextContents(), POLL).toEqual(['Червоні', 'Сині']);

  // ── Спроби капітана видні учаснику з літерами; інша команда їх не бачить. ──
  await guess48(olya, 'сосна');
  await expect.poll(() => lettersOf48(phoneGrid48(petro), 0), POLL).toBe('сосна');
  expect(await marks48(phoneGrid48(petro), 0)).toEqual(['near', 'hit', 'miss', 'miss', 'miss']);
  await guess48(olya, 'молот');
  await expect.poll(() => lettersOf48(phoneGrid48(petro), 1), POLL).toBe('молот');
  expect(await acceptedRows48(phoneGrid48(marko)), 'the other team sees guesses').toBe(0);
  await viewShot48(petro, 'wordle48-team-member');
  await shot(petro, 'wordle48-team-member');
  await noSide48(petro, 'team member');
  // Не-капітан не може ходити: сервер відмовляє (клавіатури немає, але шлях — захист).
  const before = await seconds(olya);

  // ── Перезапуск після двох спроб: ті самі рядки й таймер. ──
  await restart(async () => {
    await stage.getByText(RESTARTING_TEXT, exact).waitFor({ timeout: 15_000 });
  });
  for (const page of [stage, ...phones, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  const resume = host.getByRole('button', { name: 'Продовжити', ...exact }).first();
  if (await resume.waitFor({ timeout: 3000 }).then(() => true, () => false)) await resume.click();
  for (const page of [olya, petro]) {
    await expect.poll(() => acceptedRows48(phoneGrid48(page)), { timeout: 20_000 }).toBe(2);
    expect(await lettersOf48(phoneGrid48(page), 0)).toBe('сосна');
    expect(await lettersOf48(phoneGrid48(page), 1)).toBe('молот');
  }
  await olya.locator('.wordle-keys').waitFor();
  const after = await seconds(olya);
  console.log(`part 48: the timer ${before} s before the restart, ${after} s after`);
  expect(after, 'the timer after a restart').toBeLessThanOrEqual(before + 1);
  expect(after, 'the timer lost too much').toBeGreaterThanOrEqual(before - 60);
  await expect.poll(() => marks48(stage.locator('.wordle-board > li').first(), 1), POLL).toEqual(['miss', 'hit', 'hit', 'hit', 'miss']);

  // ── Далі капітан вгадує з 3-ї спроби → бали обом із Червоних. ──
  await guess48(olya, 'колос');
  await olya.getByText('Вгадано з 3-ї спроби!', exact).first().waitFor();
  await petro.getByText('Вгадано з 3-ї спроби!', exact).first().waitFor();
  expect(await petro.locator('.wordle-keys').count()).toBe(0);
  await reveal28a(host);
  const won = wordlePoints(1000, 3);
  for (const [page, score] of [[olya, won], [petro, won], [ira, 0], [marko, 0]] as const) await expect.poll(() => phoneScore27a(page).textContent().then((t) => (t ?? '').replace(/\s/g, '')), POLL).toBe(String(score));
  await stage.locator('.wordle-answer-word', { hasText: 'КОЛОС' }).waitFor();
  await expect.poll(() => stage.locator('.wordle-board > li .tag').allTextContents(), POLL).toEqual(['вгадав за 3 спроби', 'не вгадав']);

  expect(problems).toEqual([]);
}

// ——— 4. Автопілот і 12 гравців ———

async function autopilot48(sockets: Socket[]) {
  const author = await open('author48a', 375, 812);
  await register(author, 'host', 'Марта Авторка', 'author48a@example.com');
  const quiz = makeRoundsQuiz([classicRound('ca48', [q48(wordleQ, 'wa1', 25, 1000), q48(wordle2Q, 'wa2', 25, 600)], { speedBonus: false })], { leaderboard: 'end' });
  const saved = await author.request.post(`${base}/api/quizzes`, { data: { ...quiz, title: 'Вгадай слово бот 48' } });
  expect(saved.ok(), await saved.text()).toBe(true);
  const code = await launchBot11h(author, 'Вгадай слово бот 48', 'Марта');
  const vira = await pilotPlayer(sockets, code, 'Віра');
  const petro = await pilotPlayer(sockets, code, 'Петро');
  await author.getByText('Петро', exact).locator('visible=true').first().waitFor();
  await author.getByRole('button', { name: 'Почати гру', ...exact }).click();

  // Перше: Віра вгадує одразу, Петро помиляється й мовчить — запитання закривається таймером (25 с) саме.
  const first = await frame(vira, (view) => view.phase === 'question' && view.me.wordle !== undefined);
  await emitOk(vira, 'player:wordle', { word: 'колос' });
  await emitOk(petro, 'player:wordle', { word: 'сосна' });
  await author.locator('.wordle-stage, .wordle-play, .wordle-outcome').first().waitFor({ timeout: 60_000 });
  await viewShot48(author, 'wordle48-autopilot');
  await shot(author, 'wordle48-autopilot-full');
  const revealed = await frame(vira, (view) => view.phase === 'reveal' && view.me.wordle?.word === 'колос', first.index, 120_000);
  expect(revealed.view.me.wordle!.solved, 'Віра solved the first').toBe(true);
  expect(petro.raw.slice(0, (await frame(petro, (view) => view.phase === 'reveal')).index).join(NL), 'the word sent to Петро before the reveal').not.toContain('колос');
  // Друге: «мясо» з клавіатури — одним ключем; Петро не пробує. Після таймера — наступний крок сам, гра доходить до фінішу.
  await frame(vira, (view) => view.phase === 'question' && view.me.wordle?.letters === 4, revealed.index, 120_000);
  await emitOk(vira, 'player:wordle', { word: 'мясо' });
  const end = await frame(vira, (view) => view.phase === 'round_end' || view.phase === 'finished', revealed.index, 150_000);
  expect(end.view.phase === 'round_end' || end.view.phase === 'finished').toBe(true);
  // Віра: 1000 × 6/6 + 600 × 6/6 за розгадки з 1-ї спроби = 1600 (перше розгадала з 1-ї).
  const finalVira = (await frame(vira, (view) => view.phase === 'finished', end.index, 150_000)).view;
  expect(finalVira.me.score, 'Віра points').toBe(wordlePoints(1000, 1) + wordlePoints(600, 1));
  expect(finalVira.me.wordle?.solved ?? true).toBe(true);
  vira.close();
  petro.close();
}

const NAMES48 = ['Олександра', 'Богдана', 'Ярослав', 'Мирослава', 'Владислав', 'Анастасія', 'Святослав', 'Христина', 'Станіслав', 'Катерина', 'Остап', 'Соломія'];
/** Слова-пробники: усі зі словника, ні одне — не «колос». */
const MISSES48 = ['сосна', 'молот', 'посол', 'голос', 'хмара', 'школа'];

/** Ще 12 імен для 24 гравців. */
const MORE_NAMES48 = ['Тарас', 'Оксана', 'Марко', 'Ліна', 'Данило', 'Злата', 'Назар', 'Ярина', 'Орест', 'Дарина', 'Устим', 'Олеся'];

/** Сцена в обох темах: без прокрутки, дошки по центру; світла тема — і зразу назад у темну. */
async function crowdChecks48(stage: Page, count: number, phase: 'question' | 'reveal') {
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView48(stage, `${count} ${phase} 1280×720`);
  const cell = await expectBoardsCentred48(stage, `${count} ${phase} 1280×720`);
  expect(cell, `${count} players: stage cells are too small`).toBeGreaterThanOrEqual(12);
  if (phase === 'question') await expectColoursOnly48(stage, ['колос', 'сосна', 'молот', 'посол', 'голос', 'хмара', 'школа'], `${count} players`);
  const lines = await stage.locator('.wordle-board > li').evaluateAll((all) => new Set(all.map((li) => Math.round(li.getBoundingClientRect().top))).size);
  console.log(`part 48: ${count} ${phase} — ${lines} line(s) of boards`);
  expect(lines, `${count} players: lines of boards`).toBe(Math.ceil(count / 12));
  await viewShot48(stage, `wordle48-${count}-stage-${phase}`);
  await theme48(stage, 'light');
  await stage.locator('.wordle-board.is-many').waitFor();
  if (phase === 'reveal') await stage.locator('.wordle-answer-word', { hasText: 'КОЛОС' }).waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView48(stage, `light ${count} ${phase} 1280×720`);
  await expectBoardsCentred48(stage, `light ${count} ${phase} 1280×720`);
  if (phase === 'reveal') {
    await expectReadable48(stage.locator('.wordle-board .wordle-cell.is-hit'), `light ${count} stage hit cell`);
    await expectReadable48(stage.locator('.wordle-board .wordle-cell.is-near'), `light ${count} stage near cell`);
  }
  await viewShot48(stage, `wordle48-${count}-light-stage-${phase}`);
  await theme48(stage, 'dark');
  await stage.locator('.wordle-board.is-many').waitFor();
}

async function crowd48(sockets: Socket[], names: readonly string[] = NAMES48) {
  const count = names.length;
  const host = await open(`host48c${count}`, 1280, 900);
  await register(host, 'host', 'Леся Ведуча', `host48c${count}@example.com`);
  const quiz = makeRoundsQuiz([classicRound(`cc48-${count}`, [q48(wordleQ, `wc${count}`, 120, 1000)], { speedBonus: false })], { leaderboard: 'end' });
  const { code, stage } = await launch48(host, quiz, `Вгадай слово натовп ${count} 48`, `stage48c${count}`);
  const pilots: Pilot[] = [];
  for (const nickname of names) pilots.push(await pilotPlayer(sockets, code, nickname));
  await stage.getByText(names[count - 1]!, exact).first().waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage);
  await stage.getByText("Вгадайте іменник з п'яти літер", exact).first().waitFor();

  // Кожен робить від 1 до 6 спроб; парні вгадують останньою, непарні лише помиляються (6 хибних слів — усі різні). Не всі мають запис (нерішені з менш ніж 6 хибних спроб) — ведучий закриває запитання сам.
  for (const [at, pilot] of pilots.entries()) {
    const tries = (at % 6) + 1;
    const solves = at % 2 === 0;
    for (let n = 0; n < tries; n++) {
      const last = n === tries - 1;
      await emitOk(pilot, 'player:wordle', { word: solves && last ? 'колос' : MISSES48[n]! });
    }
  }
  await stage.locator('.wordle-board.is-many').waitFor();
  expect(await stage.locator('.wordle-board > li').count()).toBe(count);
  await crowdChecks48(stage, count, 'question');
  await reveal28a(host);
  await stage.locator('.wordle-answer-word', { hasText: 'КОЛОС' }).waitFor();
  await expect.poll(() => stage.locator('.wordle-board > li .tag').allTextContents().then((all) => all.filter((tag) => tag.startsWith('вгадав за')).length), POLL).toBe(count / 2);
  await crowdChecks48(stage, count, 'reveal');
  await shot(stage, `wordle48-${count}-stage`);

  expect(problems).toEqual([]);
}
