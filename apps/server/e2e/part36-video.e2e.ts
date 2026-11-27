import { classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { type Page } from 'playwright-core';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, field, questionText, join, expectNoSideScroll, register, POLL, socketFrames, RESTARTING_TEXT, NL, pickTeamOn, stageTeam, sleep, stateViews, step27a, phoneScore27a, select27b, toWinners27c, reveal28a, pickType, typeOptions, roundAction, editorTab, showProblems } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, shot, restart, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 36 — «Відео за фрагментами» (videoclip). YouTube — лише заглушка (PLAYABLE_VIDEOS у helpers/setup.ts):
 * вона пише команди рамки в window.__yt і відповідає станом плеєра, тож видно, що й коли телефон, сцена й редактор кажуть плеєру.
 */

useE2eServer();

it('part 36: videoclip after a classic round — a YouTube link, a start second and sound off in the editor, chunks start by a tap with the frame covered outside them, points by the longest chunk, no answer before reveal, the video with sound on the stage, 320 px, light theme', async () => {
  try {
    await videoGame36();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 36: videoclip with sound in teams — unmute on the tap, anyone opens a shared chunk, a teammate sees it without playing, the first answer counts, a restart keeps the chunks, 320 px', async () => {
  try {
    await videoTeams36();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 36: videoclip with 24 players — the stage tiles fit 1600×900', async () => {
  const sockets: Socket[] = [];
  try {
    await videoCrowd36(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

type YtCommand36 = { func: string; args: unknown[] };

function videoclip36(id: string, clip: { id: string; start: number }, muted: boolean, accepted: string[], timeLimit: number) {
  return { id, text: 'Що це за відео?', imageUrl: null, video: null, timeLimit, points: 1000, type: 'videoclip' as const, clip, muted, accepted };
}

/** Журнал команд рамки YouTube з цим відео (перша така рамка на сторінці). */
async function ytLog36(page: Page, id: string): Promise<YtCommand36[]> {
  const frame = page.frames().find((f) => f.url().includes(id));
  if (frame === undefined) return [];
  return frame.evaluate(() => (window as unknown as { __yt?: YtCommand36[] }).__yt ?? []).catch(() => []);
}

/** Назви команд журналу, починаючи з from. */
const funcs36 = async (page: Page, id: string, from = 0) => (await ytLog36(page, id)).slice(from).map((c) => c.func).filter((f) => f !== 'addEventListener');

/** Адреса рамки телефона. */
const frameSrc36 = (page: Page) => page.locator('.videoclip-play iframe').getAttribute('src');

/** Затулка рамки телефона видна. */
const covered36 = (page: Page) => page.locator('.videoclip-play .videoclip-cover').isVisible();

const STEPS36 = [1, 2, 4, 8, 16];
const cell36 = (page: Page, seconds: number) => page.locator(`.videoclip-play .melody-step[data-step="${STEPS36.indexOf(seconds) + 1}"]`);

/** Дотик до комірки драбинки за її повним підписом («Дивитись 1 с · 100 %»). */
async function step36(page: Page, label: string) {
  await page.locator('.videoclip-play').getByRole('button', { name: label, ...exact }).click();
}

/** Шматок пішов (затулку знято), а за seconds + запас — затулка знову на місці. */
async function chunkRuns36(page: Page, seconds: number) {
  await expect.poll(() => covered36(page), { timeout: 3000, interval: 20 }).toBe(false);
  await expect.poll(() => covered36(page), { timeout: seconds * 1000 + 3000, interval: 50 }).toBe(true);
}

const answerField36 = (page: Page) => page.locator('.videoclip-play .typed input');

async function scores36(phones: Page[], wanted: number[]) {
  for (const [at, page] of phones.entries()) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(String(wanted[at]));
}

/** Непрозорий фон елемента (alpha = 1). */
const opaque36 = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const color = getComputedStyle(el).backgroundColor;
    const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
    return { color, opaque: parts.length === 3 || (parts.length === 4 && parts[3] === 1) };
  });

/** Телефон: без прокрутки вбік, рамка на всю ширину картки 16:9, драбинка в один ряд, підписи не ламаються посеред слова. */
async function expectVideoFit36(page: Page, name: string) {
  const fit = (await page.evaluate(`(() => {
    const cells = [...document.querySelectorAll('.videoclip-play .melody-step')];
    const tops = cells.map((el) => Math.round(el.getBoundingClientRect().top));
    const split = [];
    for (const el of document.querySelectorAll('.videoclip-play .melody-step-main, .videoclip-play .melody-step-share')) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top / 4)));
      if (lines.size > 1) split.push(el.textContent);
      if (el.scrollWidth > el.clientWidth + 1) split.push('cut ' + el.textContent);
    }
    const frame = document.querySelector('.videoclip-play .videoclip-frame').getBoundingClientRect();
    const play = document.querySelector('.videoclip-play').getBoundingClientRect();
    const last = cells[cells.length - 1].getBoundingClientRect();
    return { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, innerW: innerWidth, tops, split, frameW: frame.width, frameH: frame.height, frameL: frame.left, frameR: frame.right, playW: play.width, lastRight: Math.round(last.right) };
  })()`)) as { scrollW: number; clientW: number; innerW: number; tops: number[]; split: string[]; frameW: number; frameH: number; frameL: number; frameR: number; playW: number; lastRight: number };
  console.log(`video 36: ${name} — frame ${fit.frameW.toFixed(1)}×${fit.frameH.toFixed(1)} at ${fit.frameL.toFixed(0)}…${fit.frameR.toFixed(0)} of ${fit.innerW}, ladder tops ${fit.tops.join('/')}, last cell right ${fit.lastRight}`);
  expect(fit.scrollW, `${name}: horizontal scroll`).toBeLessThanOrEqual(fit.clientW);
  expect(Math.abs(fit.frameW - fit.playW), `${name}: the frame is the card’s width`).toBeLessThanOrEqual(1);
  expect(Math.abs(fit.frameW / fit.frameH - 16 / 9), `${name}: the frame is 16:9`).toBeLessThan(0.02);
  expect(fit.frameR, `${name}: the frame past the right edge`).toBeLessThanOrEqual(fit.innerW);
  expect(new Set(fit.tops).size, `${name}: the ladder is one row`).toBe(1);
  expect(fit.lastRight, `${name}: the ladder past the right edge`).toBeLessThanOrEqual(fit.innerW);
  expect(fit.split, `${name}: a ladder label breaks`).toEqual([]);
}

/** Сцена: без прокрутки; до розкриття плитки цілком видимі, на розкритті — таблиця й відео в межах екрана. */
async function expectVideoStageFits36(stage: Page, name: string, reveal: boolean) {
  const [height, clientH, width, clientW] = (await stage.evaluate('[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]')) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const viewport = stage.viewportSize()!;
  if (!reveal) {
    const out = await stage.locator('.videoclip-stage .melody-board').evaluateAll((all) => all.filter((el) => { const box = el.getBoundingClientRect(); return box.height < 10 || box.bottom > innerHeight + 1 || box.right > innerWidth + 1 || box.left < -1; }).map((el) => el.textContent));
    expect(out, `${name}: tiles outside the stage`).toEqual([]);
    return;
  }
  const table = (await stage.locator('.videoclip-stage .melody-table').boundingBox())!;
  expect(table.height, `${name}: the points table has no height`).toBeGreaterThan(40);
  expect(table.y + table.height, `${name}: the table reaches below the stage`).toBeLessThanOrEqual(viewport.height + 1);
  const video = (await stage.locator('.videoclip-stage .videoclip-frame').boundingBox())!;
  console.log(`video 36: ${name} — video ${Math.round(video.width)}×${Math.round(video.height)} at ${Math.round(video.x)},${Math.round(video.y)}; table ${Math.round(table.width)}×${Math.round(table.height)}`);
  expect(video.width, `${name}: the video is too small`).toBeGreaterThan(viewport.width * 0.3);
  expect(video.y + video.height, `${name}: the video below the stage`).toBeLessThanOrEqual(viewport.height + 1);
  expect(video.x + video.width, `${name}: the video overlaps the table`).toBeLessThanOrEqual(table.x + 1);
}

const ANSWER_RE36 = /take on me|тейк он мі/i;

async function videoGame36() {
  const host = await open('host36', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host36@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Відео 36');
  await editorTab(host, 'Загальне');
  await select27b(host, 'Показувати рейтинг', 'end');
  await editorTab(host, 'Раунди й запитання');
  await questionText(host).fill('Скільки днів у тижні?');
  await field(host, 'Варіант 1').fill('П’ять');
  await field(host, 'Варіант 2').fill('Сім');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Час, с').fill('30');

  // ── Раунд 2: класичний, «Відео за фрагментами»: порожнє посилання — проблема; посилання з t=42, секунда 12, «Без звуку». ──
  await click(host, '+ Раунд');
  await click(host, 'Класичний');
  const types = host.locator('.editor-stage');
  await pickType(types, 'videoclip');
  await host.locator('.videoclip-editor').waitFor();
  // Єдине поле посилання — власне поле типу (clip) у .videoclip-editor; загального «Відео з YouTube» запитання немає.
  expect(await host.locator('.video-field').count(), 'video link fields').toBe(1);
  expect(await host.locator('.videoclip-editor .video-field').count(), 'the link field belongs to the videoclip editor').toBe(1);
  expect(await questionText(host).inputValue(), 'the default text').toBe('Що це за відео?');
  await expect.poll(() => field(host, 'Час, с').inputValue(), POLL).toBe('60');
  const sound = host.getByRole('group', { name: 'Звук', ...exact });
  expect(await sound.getByRole('button', { name: 'Без звуку', ...exact }).getAttribute('aria-pressed'), '«Без звуку» by default').toBe('true');
  expect(await sound.getByRole('button', { name: 'Зі звуком', ...exact }).getAttribute('aria-pressed')).toBe('false');
  await click(host, 'Зберегти');
  await (await showProblems(host)).filter({ hasText: 'додайте посилання на YouTube' }).waitFor();
  await host.locator('.videoclip-editor .video-field input').fill('https://youtu.be/E2Evideo001?t=42');
  await expect.poll(() => field(host, 'З якої секунди').inputValue(), POLL).toBe('42');
  await field(host, 'З якої секунди').fill('12');
  await field(host, 'Написання 1').fill('Take On Me');
  await click(host, 'Додати написання');
  await field(host, 'Написання 2').fill('Тейк он мі');

  // «▶ 1 с» у редакторі: seekTo [12, true], mute, playVideo, а за секунду — pauseVideo.
  await host.locator('.videoclip-editor .videoclip-frame iframe').waitFor();
  await expect.poll(async () => (await ytLog36(host, 'E2Evideo001')).length, POLL).toBeGreaterThan(0);
  const editorFrom = (await ytLog36(host, 'E2Evideo001')).length;
  await host.getByRole('button', { name: '▶ 1 с', ...exact }).click();
  await expect.poll(() => funcs36(host, 'E2Evideo001', editorFrom), { timeout: 3000, interval: 40 }).toEqual(['seekTo', 'mute', 'playVideo']);
  const editorLog = (await ytLog36(host, 'E2Evideo001')).slice(editorFrom);
  expect(editorLog[0], 'the editor seeks to the start second').toEqual({ func: 'seekTo', args: [12, true] });
  await expect.poll(() => funcs36(host, 'E2Evideo001', editorFrom), { timeout: 2500, interval: 50 }).toEqual(['seekTo', 'mute', 'playVideo', 'pauseVideo']);
  await shot(host, 'video36-editor');

  // Бліц і «Головоломки»: «Відео за фрагментами» в меню немає.
  await click(host, '+ Раунд');
  await click(host, 'Бліц');
  await expect.poll(async () => (await typeOptions(types)).includes('single'), POLL).toBe(true);
  expect((await typeOptions(types)).includes('videoclip'), 'a videoclip in the blitz menu').toBe(false);
  await roundAction(host, 'Видалити раунд');
  await click(host, '+ Раунд');
  await click(host, 'Головоломки');
  await expect.poll(async () => (await typeOptions(types)).includes('sudoku'), POLL).toBe(true);
  expect((await typeOptions(types)).includes('videoclip'), 'a videoclip in the puzzles menu').toBe(false);
  await roundAction(host, 'Видалити раунд');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Відео 36' }).waitFor();

  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Відео 36')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { type: string; questions: { type: string; clip?: { id: string; start: number }; muted?: boolean; accepted?: string[] }[] }[] };
  expect(stored.rounds.map((round) => round.type)).toEqual(['classic', 'classic']);
  const saved = stored.rounds[1]!.questions[0]!;
  expect(saved.type).toBe('videoclip');
  expect(saved.clip).toEqual({ id: 'E2Evideo001', start: 12 });
  expect(saved.muted).toBe(true);
  expect(saved.accepted).toEqual(['Take On Me', 'Тейк он мі']);

  // ── Гра: сцена 1280 × 720; Оля 320 × 640 (дотик), Тарас 375 × 812, Петро 360 × 740. ──
  const hostFrames = socketFrames(host);
  await click(host, 'Провести');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage36', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya36', 320, 640, { hasTouch: true, isMobile: true });
  const olyaFrames = socketFrames(olya);
  const taras = await open('taras36', 375, 812);
  const tarasFrames = socketFrames(taras);
  const petro = await open('petro36', 360, 740);
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

  // ── Раунд 2: «Відео за фрагментами» — номер у раунді 0. ──
  const framesFrom = { stage: stageFrames.length, host: hostFrames.length, olya: olyaFrames.length, taras: tarasFrames.length, petro: petroFrames.length };
  for (const page of phones) await page.locator('.videoclip-play .melody-step').first().waitFor();
  const shown = stateViews(olyaFrames).reverse().find((view) => view.question?.videoclip !== undefined)!;
  expect(shown.questionIndex, 'the phone’s question number in the round').toBe(0);
  expect(shown.question!.videoclip!.clip).toEqual({ id: 'E2Evideo001', start: 12 });
  expect(shown.question!.videoclip!.muted).toBe(true);
  expect(shown.question!.videoclip!.answer, 'the answer before reveal').toBeNull();
  await expect.poll(() => stage.locator('.videoclip-stage .melody-board').count(), POLL).toBe(3);

  // Оля до першого шматка: затулка, поле неактивне, «Спершу перегляньте шматок», «🔇 Без звуку»; адреса рамки без керування й без звуку.
  expect(await covered36(olya), 'the cover before the first chunk').toBe(true);
  expect(await answerField36(olya).isDisabled(), 'the field before the first chunk').toBe(true);
  await olya.getByText('Спершу перегляньте шматок', exact).waitFor();
  await olya.getByText('🔇 Без звуку', exact).waitFor();
  const src = (await frameSrc36(olya))!;
  console.log(`video 36: the phone frame src ${src}`);
  for (const part of ['controls=0', 'rel=0', 'playsinline=1', 'disablekb=1', 'mute=1', 'start=12']) expect(src, `the frame src has ${part}`).toContain(part);
  expect(await olya.locator('.videoclip-play .videoclip-iframe').evaluate((el) => getComputedStyle(el).pointerEvents), 'the frame takes no taps').toBe('none');
  expect(await cell36(olya, 1).getAttribute('aria-label')).toBe('Дивитись 1 с · 100 %');
  expect(await olya.locator('.videoclip-play .melody-step').count()).toBe(5);
  const cover = await opaque36(olya, '.videoclip-play .videoclip-cover');
  expect(cover.opaque, `the cover is opaque (${cover.color})`).toBe(true);

  // Оля: «Дивитись 1 с» — seekTo [12, true], mute, playVideo у журналі рамки; затулка зникає й повертається.
  await expect.poll(async () => (await ytLog36(olya, 'E2Evideo001')).length, POLL).toBeGreaterThan(0);
  const olyaFrom = (await ytLog36(olya, 'E2Evideo001')).length;
  await step36(olya, 'Дивитись 1 с · 100 %');
  await expect.poll(() => covered36(olya), { timeout: 3000, interval: 20 }).toBe(false);
  // Поки шматок грає, маски назви й логотипа на місці й непрозорі.
  const maskTop = await opaque36(olya, '.videoclip-play .videoclip-mask-top');
  expect(maskTop.opaque, `the title mask is opaque (${maskTop.color})`).toBe(true);
  expect(await olya.locator('.videoclip-play .videoclip-mask-corner').count(), 'the logo mask').toBe(1);
  await expect.poll(() => covered36(olya), { timeout: 4000, interval: 50 }).toBe(true);
  const olyaLog = (await ytLog36(olya, 'E2Evideo001')).slice(olyaFrom).filter((c) => c.func !== 'addEventListener');
  expect(olyaLog.slice(0, 3)).toEqual([{ func: 'seekTo', args: [12, true] }, { func: 'mute', args: [] }, { func: 'playVideo', args: [] }]);
  expect(olyaLog.map((c) => c.func), 'the chunk stops').toContain('pauseVideo');
  await expect.poll(() => stage.locator('.melody-board', { hasText: 'Оля' }).textContent(), POLL).toContain('👁 1 с');
  await expect.poll(() => olya.locator('.melody-share').textContent(), POLL).toBe('Зараз: 100 % ціни');
  await answerField36(olya).fill('take on me');
  await expectVideoFit36(olya, 'video at 320×640');
  await expectNoSideScroll(olya, 'video36-phone-320');
  await olya.getByRole('button', { name: 'Відповісти', ...exact }).click();
  await olya.getByText('Відповідь прийнято на шматку 1 с', exact).waitFor();
  await expect.poll(() => stage.locator('.melody-board', { hasText: 'Оля' }).textContent(), POLL).toContain('✓');
  expect(await covered36(olya), 'the cover after the answer').toBe(true);

  // Тарас: 1, 2 і 4 с по черзі, переглядає 1 с, відповідає.
  for (const [seconds, label] of [[1, 'Дивитись 1 с · 100 %'], [2, 'Ще: 2 с · 80 %'], [4, 'Ще: 4 с · 60 %']] as const) {
    await step36(taras, label);
    await chunkRuns36(taras, seconds);
  }
  expect(await cell36(taras, 1).getAttribute('aria-label')).toBe('Переглянути 1 с · 100 %');
  await step36(taras, 'Переглянути 1 с · 100 %');
  await chunkRuns36(taras, 1);
  await expect.poll(() => taras.locator('.melody-share').textContent(), POLL).toBe('Зараз: 60 % ціни');
  await expect.poll(() => stage.locator('.melody-board', { hasText: 'Тарас' }).textContent(), POLL).toContain('👁 4 с');
  await answerField36(taras).fill('Тейк он мі');
  await expectVideoFit36(taras, 'video at 375×812');
  await shot(taras, 'video36-phone-steps');
  await taras.getByRole('button', { name: 'Відповісти', ...exact }).click();
  await taras.getByText('Відповідь прийнято на шматку 4 с', exact).waitFor();

  // Петро: 1 с і хибна відповідь — остання відповідь закриває запитання.
  await step36(petro, 'Дивитись 1 с · 100 %');
  await chunkRuns36(petro, 1);
  await expect.poll(() => answerField36(petro).isDisabled(), POLL).toBe(false);
  await answerField36(petro).fill('Hunting High and Low');
  await petro.getByRole('button', { name: 'Відповісти', ...exact }).click();
  await petro.getByText('Чекаємо на правильну відповідь', exact).waitFor();
  await expect.poll(() => stage.locator('.melody-board.is-answered').count(), POLL).toBe(3);

  // До розкриття відповіді немає ні в кадрах, ні в DOM (свою відповідь телефон бачить, тому вона вирізається); на сцені немає рамки YouTube.
  const own = (frames: string[], from: number, mine: string) => frames.slice(from).join(NL).split(`"value":"${mine}"`).join('');
  for (const [who, text] of [
    ['stage frames', stageFrames.slice(framesFrom.stage).join(NL)],
    ['Petro frames', petroFrames.slice(framesFrom.petro).join(NL)],
    ['Olya frames', own(olyaFrames, framesFrom.olya, 'take on me')],
    ['Taras frames', own(tarasFrames, framesFrom.taras, 'Тейк он мі')],
    ['stage DOM', await stage.locator('body').innerText()],
    ['Petro DOM', await petro.locator('body').innerText()],
    ['Olya DOM', (await olya.locator('body').innerText()).split('take on me').join('')],
    ['Taras DOM', (await taras.locator('body').innerText()).split('Тейк он мі').join('')],
  ] as const) {
    expect(text, `the answer in the ${who} before reveal`).not.toMatch(ANSWER_RE36);
  }
  expect(await stage.locator('iframe').count(), 'a YouTube frame on the stage before reveal').toBe(0);
  await expectVideoStageFits36(stage, 'video question 1280×720', false);
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await shot(stage, 'video36-stage');
  await shot(host, 'video36-host');

  // ── Розкриття: бали 1000 / 600 / 0, назва, таблиця, відео зі звуком на сцені; «Стоп» пульта — pauseVideo. ──
  await reveal28a(host);
  await stage.locator('.videoclip-stage.is-reveal .melody-table').waitFor();
  await expect.poll(() => stage.locator('.videoclip-title').textContent(), POLL).toBe('Це було: «Take On Me»');
  await scores36(phones, [1000, 600, 0]);
  const rows = await stage.locator('.videoclip-stage.is-reveal .melody-table tbody tr').evaluateAll((all) => all.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '')));
  expect(rows.map((row) => [row[0], row[1], row[2]])).toEqual([['1', 'Оля', '✓ 1 с'], ['2', 'Тарас', '✓ 4 с'], ['—', 'Петро', '✗ 1 с']]);
  expect(rows.map((row) => row[3]!.replace(/\D/g, ''))).toEqual(['1000', '600', '0']);
  const stageSrc = (await stage.locator('.videoclip-stage .videoclip-frame iframe').getAttribute('src'))!;
  expect(stageSrc, 'the stage video plays with sound').not.toContain('mute=1');
  expect(stageSrc).toContain('E2Evideo001');
  await expect.poll(() => funcs36(stage, 'E2Evideo001'), POLL).toEqual(expect.arrayContaining(['unMute', 'playVideo']));
  expect(await funcs36(stage, 'E2Evideo001'), 'the stage never mutes the reveal').not.toContain('mute');
  await expect.poll(() => stage.locator('.videoclip-stage .videoclip-cover').count(), POLL).toBe(0);
  // На розкритті назву вже можна бачити: масок назви й логотипа немає.
  expect(await stage.locator('.videoclip-stage .videoclip-mask-top, .videoclip-stage .videoclip-mask-corner').count(), 'no masks on reveal').toBe(0);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectVideoStageFits36(stage, 'video reveal 1280×720', true);
  await shot(stage, 'video36-reveal-stage');
  await stage.setViewportSize({ width: 1600, height: 900 });
  if (process.env.E2E_SHOTS === '1') await sleep(400);
  await expectVideoStageFits36(stage, 'video reveal 1600×900', true);
  await shot(stage, 'video36-reveal-stage-1600');
  const stageFrom = (await ytLog36(stage, 'E2Evideo001')).length;
  await click(host, 'Стоп');
  await expect.poll(() => funcs36(stage, 'E2Evideo001', stageFrom), POLL).toContain('pauseVideo');
  await expect.poll(() => stage.locator('.videoclip-stage .videoclip-cover').count(), POLL).toBe(1);
  await olya.getByRole('button', { name: 'Переглянути ще раз', ...exact }).waitFor();
  for (const frames of [olyaFrames, tarasFrames, petroFrames]) expect(frames.join(NL), 'a stale refusal').not.toContain('melody_stale');

  // ── Світла тема на сцені й в Олі: перезавантаження — гра повертається за токеном. ──
  for (const page of [stage, olya]) {
    await page.evaluate(() => localStorage.setItem('quiz:theme', 'light'));
    await page.reload();
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('is-light')), POLL).toBe(true);
  }
  await stage.locator('.videoclip-stage.is-reveal .melody-table').waitFor();
  await olya.getByRole('button', { name: 'Переглянути ще раз', ...exact }).waitFor();
  // Сцена після перезавантаження знову вмикає відео — без затулки й без масок (розкриття).
  await expect.poll(() => stage.locator('.videoclip-stage .videoclip-cover').count(), POLL).toBe(0);
  expect(await stage.locator('.videoclip-stage .videoclip-mask-top, .videoclip-stage .videoclip-mask-corner').count(), 'no masks on the light reveal').toBe(0);
  const lightCover = await opaque36(olya, '.player-videoclip .videoclip-cover');
  expect(lightCover.opaque, `the light-theme cover is opaque (${lightCover.color})`).toBe(true);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectVideoStageFits36(stage, 'light reveal 1600×900', true);
  await shot(stage, 'video36-light-stage-reveal');
  await expectNoSideScroll(olya, 'video36-light-phone-320');
  // «Переглянути ще раз»: дотик вмикає відео зі звуком (журнал рамки розкриття телефона).
  const againFrom = (await ytLog36(olya, 'E2Evideo001')).length;
  await olya.getByRole('button', { name: 'Переглянути ще раз', ...exact }).click();
  await expect.poll(() => funcs36(olya, 'E2Evideo001', againFrom), POLL).toEqual(expect.arrayContaining(['unMute', 'playVideo']));
  await expect.poll(() => olya.locator('.player-videoclip .videoclip-cover').count(), POLL).toBe(0);
  await shot(olya, 'video36-light-phone-again');
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

async function videoTeams36() {
  const host = await open('host36t', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host36t@example.com');
  const question = videoclip36('vt36', { id: 'E2Evideo002', start: 5 }, false, ['Магучіх'], 120);
  const data = {
    ...makeRoundsQuiz([classicRound('ct36', [{ ...withId(single, 'ct1'), timeLimit: 30 }], { speedBonus: false }), classicRound('vt36', [question as never], { speedBonus: false })], {
      leaderboard: 'end',
      teams: { count: 2, names: ['Соняшники', 'Маки'], answerer: 'captain' },
    }),
    title: 'Відео команд 36',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Відео команд 36' }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage36t', 1600, 900);
  await stage.goto(stageUrl);
  // А — Оля (капітан «Соняшників»), Б — Тарас (320 px).
  const olya = await open('olya36t', 375, 812);
  const taras = await open('taras36t', 320, 568, { hasTouch: true, isMobile: true });
  const petro = await open('petro36t', 375, 812);
  const hanna = await open('hanna36t', 360, 740);
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
  for (const page of phones) await page.locator('.videoclip-play .melody-step').first().waitFor();
  const by = (page: Page) => page.locator('.melody-by');

  // Зі звуком: в адресі рамки немає mute=1, рядка «Без звуку» немає.
  for (const page of [olya, taras]) {
    expect(await frameSrc36(page), 'a sound video src').not.toContain('mute=1');
    expect(await page.getByText('🔇 Без звуку', exact).count()).toBe(0);
  }
  for (const page of [olya, taras]) await expect.poll(async () => (await ytLog36(page, 'E2Evideo002')).length, POLL).toBeGreaterThan(0);
  const tarasFrom = (await ytLog36(taras, 'E2Evideo002')).length;

  // Оля (капітан) відкриває 1 с: у її рамці unMute і playVideo; Тарас бачить комірку й «Оля: відкрито 1 с», його рамка не грає.
  const olyaFrom = (await ytLog36(olya, 'E2Evideo002')).length;
  await step36(olya, 'Дивитись 1 с · 100 %');
  await chunkRuns36(olya, 1);
  const olyaLog = (await ytLog36(olya, 'E2Evideo002')).slice(olyaFrom).filter((c) => c.func !== 'addEventListener');
  expect(olyaLog.slice(0, 3)).toEqual([{ func: 'seekTo', args: [5, true] }, { func: 'unMute', args: [] }, { func: 'playVideo', args: [] }]);
  await expect.poll(() => cell36(taras, 1).getAttribute('class'), POLL).toContain('is-open');
  await expect.poll(() => by(taras).textContent(), POLL).toBe('Оля: відкрито 1 с');
  expect(await funcs36(taras, 'E2Evideo002', tarasFrom), 'a teammate’s frame stays still').not.toContain('playVideo');
  expect(await covered36(taras), 'a teammate’s frame stays covered').toBe(true);
  expect(await petro.locator('.videoclip-play .melody-step.is-open').count(), 'a rival’s ladder is untouched').toBe(0);
  await expectVideoFit36(taras, 'video teams at 320×568');
  await shot(taras, 'video36-teams-phone-320');

  // Тарас (не капітан) відкриває 2 с: грає в нього; в Олі «Тарас: відкрито 2 с».
  await step36(taras, 'Ще: 2 с · 80 %');
  await chunkRuns36(taras, 2);
  expect(await funcs36(taras, 'E2Evideo002', tarasFrom), 'Taras’s own chunk plays').toEqual(expect.arrayContaining(['unMute', 'playVideo']));
  await expect.poll(() => by(olya).textContent(), POLL).toBe('Тарас: відкрито 2 с');
  await expect.poll(() => stage.locator('.melody-board', { hasText: 'Соняшники' }).textContent(), POLL).toContain('👁 2 с');
  await expect.poll(() => answerField36(taras).isDisabled(), POLL).toBe(false);

  // Перезапуск посеред запитання: ті самі два шматки, наступний можна відкрити.
  await restart(async () => {
    await stage.getByText(RESTARTING_TEXT, exact).waitFor({ timeout: 15_000 });
  });
  for (const page of [stage, ...phones, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  await host.getByRole('button', { name: 'Продовжити', ...exact }).first().click({ timeout: 15_000 });
  for (const page of [olya, taras]) {
    await expect.poll(() => page.locator('.videoclip-play .melody-step.is-open').count(), POLL).toBe(2);
    await expect.poll(() => cell36(page, 4).isEnabled(), POLL).toBe(true);
    expect(await cell36(page, 4).getAttribute('aria-label'), 'the next chunk after the restart').toBe('Ще: 4 с · 60 %');
  }
  // Відкритий шматок після перезапуску переглядається (рамка знову відгукується).
  await expect.poll(async () => (await ytLog36(taras, 'E2Evideo002')).length, POLL).toBeGreaterThan(0);
  await step36(taras, 'Переглянути 2 с · 80 %');
  await chunkRuns36(taras, 2);

  // Тарас відповідає правильно: команда має 800 (шматок 2 с), поле Олі закрите.
  await answerField36(taras).fill('магучіх');
  await taras.getByRole('button', { name: 'Відповісти', ...exact }).click();
  await taras.getByText('Відповідь прийнято на шматку 2 с', exact).waitFor();
  await olya.getByText('Відповідь прийнято на шматку 2 с', exact).waitFor();
  await expect.poll(async () => (await answerField36(olya).count()) === 0 || (await answerField36(olya).isDisabled()), POLL).toBe(true);
  await expect.poll(() => stage.locator('.melody-board.is-answered').count(), POLL).toBe(1);
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await shot(stage, 'video36-teams-stage');
  // expectPhoneFit чекає меню акаунта (nav.menu), якого в грі немає: телефон гри перевіряють expectVideoFit36 і expectNoSideScroll.
  await expectVideoFit36(taras, 'video teams answered at 320×568');
  await expectNoSideScroll(taras, 'video36-teams-phone');
  await reveal28a(host);
  await stage.locator('.videoclip-stage.is-reveal .melody-table').waitFor();
  await scores36(phones, [800, 800, 0, 0]);
  await expectVideoStageFits36(stage, 'video teams reveal', true);
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

async function videoCrowd36(sockets: Socket[]) {
  const host = await open('host36c', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host36c@example.com');
  const question = videoclip36('vc36', { id: 'E2Evideo001', start: 12 }, true, ['Take On Me', 'Тейк он мі'], 60);
  const data = { ...makeRoundsQuiz([classicRound('vc36', [question as never], { speedBonus: false })], { leaderboard: 'end' }), title: 'Відео натовпу 36' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Відео натовпу 36' }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage36c', 1600, 900);
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
  await stage.locator('.videoclip-stage').waitFor();
  await expect.poll(() => stage.locator('.videoclip-stage .melody-board').count(), POLL).toBeGreaterThan(0);
  // Кожен відкриває k % 6 шматків (0…5); парні відповідають: кожен четвертий (k % 4 = 2) — правильно.
  await Promise.all(
    players.map(async ({ nickname, socket }, k) => {
      const opened = k % 6;
      for (let step = 1; step <= opened; step++) expect(await emit(socket, 'player:melody', { questionIndex: 0, step }), `${nickname} opens ${step}`).toEqual({ ok: true });
      if (opened > 0 && k % 2 === 0) expect(await emit(socket, 'player:answer', { type: 'videoclip', value: k % 4 === 2 ? 'Take On Me' : 'Hunting High and Low' }), `${nickname} answers`).toMatchObject({ ok: true });
    }),
  );
  await expect.poll(() => stage.locator('.melody-board.is-answered').count(), POLL).toBeGreaterThan(0);
  expect(await stage.locator('iframe').count(), 'a YouTube frame on the stage before reveal').toBe(0);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectVideoStageFits36(stage, 'video 24 players', false);
  await expectNoSideScroll(stage, 'video36-24-stage');
  const boards = await stage.locator('.videoclip-stage .melody-board').count();
  console.log(`video 36: ${boards} tiles on a stage page for 24 players`);
  const clipped = await stage.locator('.videoclip-stage .melody-board-name').evaluateAll((all) => all.filter((el) => el.getBoundingClientRect().width < 40).map((el) => el.textContent));
  expect(clipped, 'names squeezed to nothing').toEqual([]);
  await reveal28a(host);
  await stage.locator('.videoclip-stage.is-reveal .melody-table').waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectVideoStageFits36(stage, 'video 24 players reveal', true);
  await shot(stage, 'video36-24-reveal-stage');

  expect(problems).toEqual([]);
}
