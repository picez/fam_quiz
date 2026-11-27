import { classicRound, makeRoundsQuiz, single, spy as spyQ, spy2 as spy2Q, spyLegacy as spyLegacyQ } from '@quiz/engine/testing';
import { type Locator, type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, field, questionText, join, expectNoSideScroll, register, POLL, socketFrames, RESTARTING_TEXT, NL, sleep, step27a, phoneScore27a, toWinners27c, reveal28a, framesBeforeReveal, pilotPlayer, frame, emitOk, type Pilot, pickType, typeOptions, roundAction, showProblems, editorTab } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, shot, restart, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 38 — «Шпигун» (spy): загальне слово й підказка в редакторі (лише класика, без команд; з 50 шпигун слова не бачить), шпигун з rng гри при відкритті,
 * слово на телефонах гравців і «Ви — шпигун» на телефоні шпигуна, нічого зайвого на сцені до розкриття, останній шанс викритого шпигуна, подвійна ціна непоміченого,
 * перезапуск з тим самим шпигуном і голосами, пропуск з двома гравцями, 24 гравці на сцені 1280×720.
 */

useE2eServer();

it('part 38: editor — a spy pair with a vote timer only in classic rounds, a warning with teams', async () => {
  try {
    await editor38();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 38: spy — own words on phones, nothing on the stage before reveal, a caught spy guesses, 320 px, light theme', async () => {
  try {
    await game38();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 38: spy — a restart keeps the spy and the votes, two players skip it', async () => {
  try {
    await restart38();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 38: 24 players — associations and the vote reveal stay inside 1280×720 in dark and light theme', async () => {
  const sockets: Socket[] = [];
  try {
    await crowd38(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

// ——— Помічники ———

/** Текст фікстур spy і spy2 (з 50 — про загальне слово). */
const SPY_TEXT38 = 'Напишіть одне слово-асоціацію до загального слова';
/** Текст старого запитання spyLegacy (до 50). */
const SPY_LEGACY_TEXT38 = 'Напишіть одне слово-асоціацію до свого слова';
/** Типовий текст нового запитання «Шпигун» у редакторі (з 50). */
const SPY_DEFAULT38 = 'Напишіть одне слово-асоціацію до загального слова';
const WORD_FIELD38 = 'Напишіть одне слово-асоціацію';
const HINT_FIELD38 = 'Підказка шпигуну (необов’язково)';
const CAUGHT38 = 'Вас викрили! Впишіть загальне слово';
const GUESS_FIELD38 = 'Загальне слово';
/** Власне «слово» на телефоні: гравцям — слово, шпигунові — «Ви — шпигун». */
const ownOf38 = (page: Page) => page.locator('.spy-me-word, .spy-you-role').first().textContent().catch(() => '');

/** Слово цілим (кирилиця): «чай» не в «звичайний», «кава» не в «цікава». */
const hasWord38 = (text: string, word: string) => new RegExp(`(^|[^\\p{L}'’])${word}($|[^\\p{L}'’])`, 'iu').test(text);

/** Пульт: «Шпигун: Оля» → «Оля». */
async function hostSpyName38(host: Page): Promise<string> {
  const title = host.locator('.host-spy .spy-title');
  await expect.poll(() => title.textContent().catch(() => ''), POLL).toMatch(/^Шпигун: .+$/);
  return (await title.textContent())!.replace(/^Шпигун: /, '');
}

/** Асоціація з телефона: поле, «Відповісти», своє слово з’являється замість поля. */
async function writeWord38(page: Page, word: string) {
  await field(page, WORD_FIELD38).fill(word);
  await click(page, 'Відповісти');
  // Останній, хто написав, одразу бачить голосування (слова етапу words уже немає).
  await page.locator('.spy-phone .spy-wrote', { hasText: word }).or(page.locator('.spy-vote')).first().waitFor();
}

/** Голос з телефона: кнопка з іменем, далі «Голос прийнято». */
async function vote38(page: Page, nickname: string) {
  await page.locator('.spy-vote button', { has: page.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) }).click();
  // Останній голос одразу закриває голосування: тоді кнопок просто більше немає.
  await page.getByText('Голос прийнято', exact).or(page.locator('.spy-caught-you, .spy-guess-stage, section.sent, section.result')).first().waitFor();
}

/** Рядки сцени чи телефона «ім'я — асоціація…» без зайвих пробілів. */
const rowsOf38 = (page: Page, scope: string) => page.locator(`${scope} .spy-row`).evaluateAll((all) => all.map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim()));

async function scores38(phones: Page[], wanted: number[]) {
  for (const [at, page] of phones.entries()) await expect.poll(() => phoneScore27a(page).textContent().then((t) => (t ?? '').replace(/\s/g, '')), POLL).toBe(String(wanted[at]));
}

/** Контраст тексту з його справжнім тлом (альфи предків змішано через canvas): відношення яскравостей WCAG. */
async function contrast38(scope: Locator): Promise<{ color: string; background: string; ratio: number }> {
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

async function expectReadable38(scope: Locator, name: string) {
  const { color, background, ratio } = await contrast38(scope);
  console.log(`part 38: ${name} — ${color} on ${background}, contrast ${ratio.toFixed(2)}`);
  expect(color, `${name}: the text colour is the background`).not.toBe(background);
  expect(ratio, `${name}: contrast ${color} on ${background}`).toBeGreaterThanOrEqual(3);
}

/** Позначка шпигуна на розкритті: рамка рядка шпигуна інша, ніж у звичайного, і текст у ньому читається. */
async function expectSpyMark38(page: Page, scope: string, name: string) {
  const [mark, plain] = await Promise.all([
    page.locator(`${scope} .spy-row.is-spy`).first().evaluate((el) => `${getComputedStyle(el).borderTopColor} / ${getComputedStyle(el).backgroundColor}`),
    page.locator(`${scope} .spy-row:not(.is-spy)`).first().evaluate((el) => `${getComputedStyle(el).borderTopColor} / ${getComputedStyle(el).backgroundColor}`),
  ]);
  console.log(`part 38: ${name} — the spy row ${mark}, a plain row ${plain}`);
  expect(mark, `${name}: the spy row looks like any row`).not.toBe(plain);
  await expectReadable38(page.locator(`${scope} .spy-row.is-spy .name`), `${name} spy name`);
}

/** Тема пристрою: light — quiz:theme = light; dark — ключа немає. Перезавантаження: гра повертається за токеном. */
async function theme38(page: Page, mode: 'light' | 'dark') {
  await page.evaluate((wanted) => (wanted === 'light' ? localStorage.setItem('quiz:theme', 'light') : localStorage.removeItem('quiz:theme')), mode);
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('is-light')), POLL).toBe(mode === 'light');
}

/**
 * Сцена: без прокрутки; дошка (.stage-question), блок selector і кожен рядок не виходять за край вікна;
 * рядки, заголовок і підсумок «Шпигуна» не під кнопками кута сцени («Читати вголос», тема) і не під смугою реакцій.
 */
async function expectBoardInView38(stage: Page, selector: string, name: string) {
  const [height, clientH, width, clientW] = (await stage.evaluate('[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]')) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const viewport = stage.viewportSize()!;
  for (const target of ['.stage-question', '.stage-question .spy-view', selector]) {
    const box = (await stage.locator(target).first().boundingBox())!;
    console.log(`part 38: ${name} — ${target} ${Math.round(box.width)}×${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)}, bottom ${Math.round(box.y + box.height)} of ${viewport.height}`);
    expect(box.y + box.height, `${name}: ${target} reaches below the ${viewport.height} px stage`).toBeLessThanOrEqual(viewport.height + 1);
  }
  const out = await stage.locator(`${selector} li, .stage-question .spy-view > *`).evaluateAll((all) => all.filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.left < -1 || r.top < -1); }).map((el) => el.textContent));
  expect(out, `${name}: items outside the stage`).toEqual([]);
  // Асоціації переносяться, а не обрізаються: рядок «ім'я — асоціація» вміщує весь текст.
  const clipped = await stage.locator(`${selector} .spy-line`).evaluateAll((all) => all.filter((el) => el.scrollHeight > el.clientHeight + 1).map((el) => el.textContent));
  expect(clipped, `${name}: clipped associations`).toEqual([]);
  const covered = await stage.evaluate(() => {
    const blockers = [...document.querySelectorAll('.stage-speech button, .reaction-strip')].map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
    return [...document.querySelectorAll('.stage-question .spy-row, .stage-question .spy-view > :not(ul), .stage-question .reveal-facts')]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return blockers.some((b) => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top);
      })
      .map((el) => el.textContent);
  });
  expect(covered, `${name}: rows under a fixed corner`).toEqual([]);
}

/** Телефон: кнопки голосу й рядки не ширші за екран, імена переносяться (нічого не обрізано вбік). */
async function expectPhoneRows38(page: Page, name: string) {
  const wide = await page.locator('.spy-vote button, .spy-row, .spy-me').evaluateAll((all) => all.filter((el) => el.getBoundingClientRect().right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1).map((el) => el.className + ': ' + el.textContent));
  expect(wide, `${name}: rows wider than the phone`).toEqual([]);
}

/** Витоки до розкриття: кадри (з from до першого reveal) без слів і ключів зі списку. */
function expectNoLeak38(who: string, frames: string[], from: number, words: string[], keys: string[], until?: number) {
  const text = (until === undefined ? framesBeforeReveal(frames.slice(from)) : frames.slice(from, until)).join(NL);
  expect(text.length, `${who}: no frames before reveal`).toBeGreaterThan(0);
  for (const word of words) expect(hasWord38(text, word), `«${word}» in the ${who} before reveal`).toBe(false);
  for (const key of keys) expect(text.includes(key), `${key} in the ${who} before reveal`).toBe(false);
}

/** Ключі, яких до розкриття немає ні на сцені, ні в чужих телефонах: шпигун, загальне слово, підказка, голоси. */
const SECRET_KEYS38 = ['"spyId"', '"spyName":"', '"spy":true', '"playersWord":"', '"spyHint":"', '"spyWord":"', '"voters":["', '"accepted"'];

// ——— 1. Редактор ———

async function editor38() {
  const host = await open('host38e', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host38e@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Шпигун 38');

  // ── Класика: «Шпигун» у меню; типовий текст, 40 с асоціацій, 30 с голосування. ──
  const types = host.locator('.editor-stage');
  expect((await typeOptions(types)).includes('spy'), 'spy in the classic menu').toBe(true);
  await pickType(types, 'spy');
  await expect.poll(() => questionText(host).inputValue(), POLL).toBe(SPY_DEFAULT38);
  await expect.poll(() => field(host, 'Час, с').inputValue(), POLL).toBe('40');
  await expect.poll(() => field(host, 'Час голосування, с').inputValue(), POLL).toBe('30');
  await host.getByText('Шпигуна вибере програма; він бачитиме лише «Ви — шпигун» і вашу підказку. Потрібно щонайменше 3 гравці; з меншою кількістю запитання пропуститься.', exact).waitFor();
  await host.getByRole('textbox', { name: 'Загальне слово', ...exact }).fill('потяг');
  await field(host, HINT_FIELD38).fill('їздить рейками');
  await field(host, 'Час голосування, с').fill('30');

  // ── Бліц: «Шпигуна» в меню немає; раунд прибрано. ──
  await click(host, '+ Раунд');
  await click(host, 'Бліц');
  await expect.poll(async () => (await typeOptions(types)).includes('single'), POLL).toBe(true);
  expect((await typeOptions(types)).includes('spy'), 'spy in the blitz menu').toBe(false);
  await roundAction(host, 'Видалити раунд');

  // ── Команди: проблема «„Шпигун“ не грається командами…», зберегти не можна. ──
  await editorTab(host, 'Загальне');
  const teams = host.locator('section.editor-card.teams');
  await teams.getByRole('checkbox', { name: 'Грати командами', ...exact }).check();
  await click(host, 'Зберегти');
  const teamsProblem = '«Шпигун» не грається командами — вимкніть команди або приберіть запитання (запитання 1)';
  await (await showProblems(host)).filter({ hasText: teamsProblem }).waitFor();
  const listed = async () => ((await (await host.request.get(`${base}/api/quizzes`)).json()) as { title: string }[]).filter((entry) => entry.title === 'Шпигун 38').length;
  expect(await listed(), 'a spy quiz with teams was saved').toBe(0);
  // Сервер теж не бере вікторину з командами й spy (spy_teams схеми).
  const bypass = await host.request.post(`${base}/api/quizzes`, {
    data: { ...makeRoundsQuiz([classicRound('ct38', [spyQ as never])], { teams: { count: 2, names: ['Соняшники', 'Маки'] } }), title: 'Шпигун команди 38' },
  });
  const refusal = await bypass.text();
  console.log(`part 38: the server on a spy quiz with teams — ${bypass.status()} ${refusal.slice(0, 200)}`);
  expect(bypass.ok(), 'the server saved a spy quiz with teams').toBe(false);
  expect(bypass.status(), 'the server refusal').toBe(400);
  // Та сама вікторина без команд сервер бере: відмова — саме через команди.
  const plain = await host.request.post(`${base}/api/quizzes`, { data: { ...makeRoundsQuiz([classicRound('ct38', [spyQ as never])]), title: 'Шпигун без команд 38' } });
  expect(plain.ok(), await plain.text()).toBe(true);

  // ── Вимкнули команди — зберігається. ──
  await editorTab(host, 'Загальне');
  await teams.getByRole('checkbox', { name: 'Грати командами', ...exact }).uncheck();
  await expect.poll(async () => (await host.locator('.issues-button').textContent()) ?? '', POLL).toMatch(/^ⓘ Нагадувань: \d+$|Усе заповнено/);
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Шпигун 38' }).waitFor();

  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Шпигун 38')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { settings: { teams?: unknown }; rounds: { type: string; questions: Record<string, unknown>[] }[] };
  expect(stored.rounds.map((round) => round.type)).toEqual(['classic']);
  expect(stored.settings.teams, 'teams after switching them off').toBeUndefined();
  expect(stored.rounds[0]!.questions[0]).toMatchObject({ type: 'spy', text: SPY_DEFAULT38, accepted: ['потяг'], spyHint: 'їздить рейками', timeLimit: 40, voteTime: 30 });
  expect(stored.rounds[0]!.questions[0], 'the stored question has no spy word').not.toHaveProperty('spyWord');

  // ── Повторне відкриття: загальне слово, підказка й час голосування на місці. ──
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Шпигун 38' }).getByRole('link', { name: 'Змінити' }).click();
  await host.locator('main.editor').waitFor();
  await expect.poll(() => host.getByRole('textbox', { name: 'Загальне слово', ...exact }).inputValue().catch(() => ''), POLL).toBe('потяг');
  expect(await field(host, HINT_FIELD38).inputValue()).toBe('їздить рейками');
  expect(await field(host, 'Час голосування, с').inputValue()).toBe('30');
  await shot(host, 'spy38-editor');

  expect(problems).toEqual([]);
}

// ——— 2. Гра: свої слова, викритий шпигун, непомічений шпигун ———

async function game38() {
  const host = await open('host38', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host38@example.com');
  const data = { ...makeRoundsQuiz([classicRound('c38', [spyQ as never, spy2Q as never], { speedBonus: false })], { leaderboard: 'end' }), title: 'Шпигун гра 38' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  const hostFrames = socketFrames(host);
  await host.locator('.quiz-list li', { hasText: 'Шпигун гра 38' }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage38', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya38', 320, 640, { hasTouch: true, isMobile: true });
  const taras = await open('taras38', 375, 812);
  const petro = await open('petro38', 360, 740);
  const hanna = await open('hanna38', 360, 740);
  const phones = [olya, taras, petro, hanna];
  const names = ['Оля', 'Тарас', 'Петро', 'Ганна'];
  const sizes = [{ width: 320, height: 640 }, { width: 375, height: 812 }, { width: 360, height: 740 }, { width: 360, height: 740 }];
  const phoneFrames = phones.map((page) => socketFrames(page));
  for (const [at, page] of phones.entries()) await join(page, code, names[at]!, false);
  await stage.getByText('Ганна').waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  const from = { host: hostFrames.length, stage: stageFrames.length, phones: phoneFrames.map((frames) => frames.length) };
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await stage.getByText(SPY_TEXT38, exact).first().waitFor();

  // ── Пульт: шпигун і обидва слова з відкриття. ──
  const spyName = await hostSpyName38(host);
  const spyAt = names.indexOf(spyName);
  expect(spyAt, `the spy «${spyName}» is a player`).toBeGreaterThanOrEqual(0);
  console.log(`part 38: the spy of question 1 is ${spyName}`);
  await host.locator('.host-spy .spy-words', { hasText: 'Загальне слово — кава' }).waitFor();
  await host.locator('.host-spy .spy-hint', { hasText: "Підказка шпигуну: Її п'ють зранку" }).waitFor();
  const spyPage = phones[spyAt]!;
  const others = phones.map((page, at) => ({ page, name: names[at]!, at })).filter((entry) => entry.at !== spyAt);

  // ── Телефони: шпигун бачить «Ви — шпигун» і підказку, решта — «кава»; поле асоціації в кожного. ──
  for (const [at, page] of phones.entries()) await expect.poll(() => ownOf38(page), POLL).toBe(at === spyAt ? 'Ви — шпигун' : 'кава');
  await spyPage.locator('.spy-hint', { hasText: "Підказка: Її п'ють зранку" }).waitFor();
  for (const entry of others) expect(await entry.page.locator('.spy-hint').count(), `${entry.name} sees the hint`).toBe(0);
  for (const page of phones) await field(page, WORD_FIELD38).waitFor();
  await stage.getByText('Відповіли 0 з 4', exact).first().waitFor();
  expect(await stage.locator('.stage-question .spy-board').count(), 'rows on the stage before the vote').toBe(0);

  // ── 320 px: обидва вигляди — шпигуна й гравця — без прокрутки вбік. Оля вже 320; другий телефон на час перевірки теж 320 × 640. ──
  const pair = spyAt === 0 ? { spy: olya, other: taras } : { spy: spyPage, other: olya };
  const narrowed = spyAt === 0 ? 1 : spyAt;
  await phones[narrowed]!.setViewportSize({ width: 320, height: 640 });
  await expectNoSideScroll(pair.spy, 'spy38-phone-320-spy-words');
  await expectNoSideScroll(pair.other, 'spy38-phone-320-other-words');
  await expectNoSideScroll(olya, 'spy38-phone-320');
  await shot(host, 'spy38-host');

  // ── Асоціації: шпигун «лимон», решта «ранок», «зерна», «філіжанка». ──
  const words1 = ['ранок', 'зерна', 'філіжанка'];
  for (const [at, entry] of others.entries()) await writeWord38(entry.page, words1[at]!);
  // Сцена до голосування: лише лічильник, без рядків.
  await stage.getByText('Відповіли 3 з 4', exact).first().waitFor();
  expect(await stage.locator('.stage-question .spy-board').count(), 'rows on the stage while writing').toBe(0);
  await writeWord38(spyPage, 'лимон');

  // ── Голосування: сцена — «Хто шпигун?» і рядки «ім'я — асоціація» без голосів і позначки. ──
  const wordOf1 = (name: string) => (name === spyName ? 'лимон' : words1[others.findIndex((entry) => entry.name === name)]!);
  await stage.locator('.stage-question .spy-view h2.spy-title', { hasText: 'Хто шпигун?' }).waitFor();
  await expect.poll(() => rowsOf38(stage, '.stage-question'), POLL).toEqual(names.map((name) => `${name} — ${wordOf1(name)}`));
  expect(await stage.locator('.stage-question .spy-row.is-spy, .stage-question .spy-votes, .stage-question .spy-voters').count(), 'votes or the spy mark at the vote').toBe(0);
  await stage.getByText('Проголосували 0 з 4', exact).first().waitFor();
  // Кожен телефон голосує за інших: себе в списку немає.
  for (const [at, page] of phones.entries()) {
    await page.locator('.spy-vote').waitFor();
    expect(await page.locator('.spy-vote .name').allTextContents(), `${names[at]} vote list`).toEqual(names.filter((name) => name !== names[at]));
  }
  await expectPhoneRows38(pair.spy, 'vote 320 spy');
  await expectNoSideScroll(pair.spy, 'spy38-phone-320-spy-vote');
  await expectNoSideScroll(pair.other, 'spy38-phone-320-other-vote');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView38(stage, '.spy-board', 'vote 1280×720');
  await shot(stage, 'spy38-vote-stage');
  await phones[narrowed]!.setViewportSize(sizes[narrowed]!);

  // ── Голоси: троє за шпигуна, шпигун — за першого з інших → викрито, останній шанс. ──
  for (const entry of others) await vote38(entry.page, spyName);
  await vote38(spyPage, others[0]!.name);
  await stage.locator('.stage-question .spy-guess-stage', { hasText: 'Останній шанс шпигуна…' }).waitFor();
  expect(await stage.locator('body').innerText(), 'the spy name on the stage at the last chance').not.toContain('Шпигун:');
  expect(await stage.locator('.stage-question .spy-row.is-spy').count(), 'the spy mark at the last chance').toBe(0);
  await spyPage.getByText(CAUGHT38, exact).waitFor();
  for (const entry of others) await entry.page.locator('.spy-phone .spy-guess-stage', { hasText: 'Останній шанс шпигуна…' }).waitFor();
  expect(await others[0]!.page.locator('input').count(), 'a field for a non-spy at the last chance').toBe(0);
  await expectNoSideScroll(spyPage, 'spy38-guess-phone');
  // Кадри шпигуна до здогадки: слова гравців немає.
  expect(hasWord38(phoneFrames[spyAt]!.slice(from.phones[spyAt]).join(NL), 'кава'), 'the players’ word on the spy phone before the guess').toBe(false);

  // До розкриття: сцена — жодного слова пари, шпигуна, голосів; чужі телефони — без слова шпигуна (DOM сцени — теж).
  const stageDom = await stage.locator('body').innerText();
  expect(hasWord38(stageDom, 'кава'), '«кава» in the stage DOM before reveal').toBe(false);
  expect(stageDom.includes('зранку'), 'the hint in the stage DOM before reveal').toBe(false);

  // ── Шпигун вписує загальне слово → закрито, розкриття. ──
  const beforeGuess = phoneFrames[spyAt]!.length;
  await field(spyPage, GUESS_FIELD38).fill('кава');
  await click(spyPage, 'Відповісти');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  expect(hasWord38(await stage.locator('body').innerText(), 'кава'), '«кава» in the stage DOM on locked').toBe(false);
  await reveal28a(host);

  // ── Розкриття: шпигун, обидва слова, «Шпигуна викрито!», «…і вгадав слово: +500»; голоси за шпигуна — 3. ──
  await stage.locator('.stage-question .spy-view h2.spy-title', { hasText: `Шпигун: ${spyName}` }).waitFor();
  await stage.locator('.stage-question .spy-words', { hasText: 'Загальне слово — кава' }).waitFor();
  await stage.locator('.stage-question .spy-hint', { hasText: "Підказка шпигуну: Її п'ють зранку" }).waitFor();
  await stage.locator('.stage-question .spy-caught', { hasText: 'Шпигуна викрито!' }).waitFor();
  expect((await stage.locator('.stage-question .spy-guess.is-guessed').textContent())!.replace(/\s/g, '')).toBe('…івгадавслово:+500');
  const spyRow = stage.locator('.stage-question .spy-row.is-spy');
  expect(await spyRow.locator('.name').textContent()).toBe(spyName);
  expect(await spyRow.locator('.spy-votes').textContent()).toBe('3 голоси');
  expect(await spyRow.locator('.spy-voters').textContent()).toBe(others.map((entry) => entry.name).join(', '));
  for (const entry of others) {
    const row = stage.locator('.stage-question .spy-row', { has: stage.locator('.name', { hasText: new RegExp(`^${entry.name}$`) }) });
    expect((await row.locator('.spy-points').textContent())!.replace(/\s/g, ''), `${entry.name} points`).toBe('+1000');
  }
  // Історія: 1000 тим, хто голосував за шпигуна, 500 — шпигунові.
  await scores38(phones, names.map((name) => (name === spyName ? 500 : 1000)));
  await spyPage.getByText('Ви були шпигуном', exact).waitFor();
  // Кадри до розкриття (усі телефони вже на reveal).
  for (const page of phones) await page.locator('section.result').first().waitFor();
  expectNoLeak38('stage frames', stageFrames, from.stage, ['кава', 'зранку'], SECRET_KEYS38);
  for (const entry of others) expectNoLeak38(`${entry.name} frames`, phoneFrames[entry.at]!, from.phones[entry.at]!, ['зранку'], SECRET_KEYS38);
  // Шпигун до власної здогадки: ні загального слова, ні ключів чужих секретів (свою підказку й «spy» він знає).
  expectNoLeak38(`${spyName} (spy) frames`, phoneFrames[spyAt]!, from.phones[spyAt]!, ['кава'], ['"spyId"', '"spyName":"', '"playersWord":"', '"spyWord":"', '"voters":["', '"accepted"'], beforeGuess);
  const hostText = framesBeforeReveal(hostFrames.slice(from.host)).join(NL);
  expect(hostText.includes('"spyId"') && hasWord38(hostText, 'кава') && hostText.includes('зранку'), 'the host gets the spy, the word and the hint before reveal').toBe(true);

  await expectPhoneRows38(olya, 'reveal 320');
  await expectNoSideScroll(olya, 'spy38-reveal-phone-320');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView38(stage, '.spy-board', 'reveal 1280×720');
  await expectSpyMark38(stage, '.stage-question', 'dark stage');
  await shot(stage, 'spy38-reveal-stage');

  // ── Світла тема: позначка шпигуна контрастна, телефон 320 px без прокрутки вбік. ──
  for (const page of [stage, olya]) await theme38(page, 'light');
  await stage.locator('.stage-question .spy-row.is-spy').waitFor();
  await olya.locator('.spy-row.is-spy').waitFor();
  await expectSpyMark38(stage, '.stage-question', 'light stage');
  await expectReadable38(stage.locator('.stage-question .spy-caught'), 'light «Шпигуна викрито!»');
  await expectReadable38(stage.locator('.stage-question .spy-row:not(.is-spy) .spy-points'), 'light stage points');
  await expectSpyMark38(olya, 'section.result', 'light phone');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView38(stage, '.spy-board', 'light reveal 1280×720');
  await shot(stage, 'spy38-light-stage');
  await expectPhoneRows38(olya, 'light reveal 320');
  await expectNoSideScroll(olya, 'spy38-light-phone-320');
  for (const page of [stage, olya]) await theme38(page, 'dark');

  // ── Друге: «гітара» без підказки; голоси 2 і 2 (нічия зі шпигуном) → «Шпигун лишився непоміченим — подвійна ціна», шпигун +1000. ──
  await step27a(host, 'Далі');
  await afterSplash(host, stage, ...phones);
  await host.locator('.host-spy .spy-words', { hasText: 'Загальне слово — гітара' }).waitFor();
  await host.locator('.host-spy .spy-hint', { hasText: 'Без підказки' }).waitFor();
  const spy2Name = await hostSpyName38(host);
  const spy2At = names.indexOf(spy2Name);
  console.log(`part 38: the spy of question 2 is ${spy2Name}`);
  const others2 = phones.map((page, at) => ({ page, name: names[at]!, at })).filter((entry) => entry.at !== spy2At);
  for (const [at, page] of phones.entries()) await expect.poll(() => ownOf38(page), POLL).toBe(at === spy2At ? 'Ви — шпигун' : 'гітара');
  expect(await phones[spy2At]!.locator('.spy-hint').count(), 'a hint on the spy phone of a question without one').toBe(0);
  const words2 = ['струни', 'вогнище', 'акорд'];
  for (const [at, entry] of others2.entries()) await writeWord38(entry.page, words2[at]!);
  await writeWord38(phones[spy2At]!, 'смичок');
  await stage.locator('.stage-question .spy-view h2.spy-title', { hasText: 'Хто шпигун?' }).waitFor();
  const [a, b, c] = others2 as [(typeof others2)[0], (typeof others2)[0], (typeof others2)[0]];
  await vote38(phones[spy2At]!, a.name);
  await vote38(b.page, a.name);
  await vote38(a.page, spy2Name);
  await vote38(c.page, spy2Name);
  await reveal28a(host);
  await stage.locator('.stage-question .spy-hidden', { hasText: 'Шпигун лишився непоміченим — подвійна ціна' }).waitFor();
  await stage.locator('.stage-question .spy-words', { hasText: 'Загальне слово — гітара' }).waitFor();
  const hidden = stage.locator('.stage-question .spy-row.is-spy');
  expect(await hidden.locator('.name').textContent()).toBe(spy2Name);
  expect((await hidden.locator('.spy-points').textContent())!.replace(/\s/g, '')).toBe('+1000');
  expect(await stage.locator('.stage-question .spy-row:not(.is-spy) .spy-points').count(), 'points for voters of a hidden spy').toBe(0);
  await scores38(phones, names.map((name) => (name === spyName ? 500 : 1000) + (name === spy2Name ? 1000 : 0)));
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView38(stage, '.spy-board', 'hidden reveal 1280×720');
  await shot(stage, 'spy38-hidden-stage');
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

// ——— 3. Перезапуск і двоє гравців ———

async function restart38() {
  const host = await open('host38r', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host38r@example.com');
  // Довгі таймери: перезапуск посеред голосування не має з’їсти його час.
  // Старе запитання (до 50) зі словом шпигуна: грається за новими правилами — шпигун його не бачить.
  const question = { ...spyLegacyQ, id: 'sr38', accepted: ['сонце'], spyWord: 'місяць', timeLimit: 60, voteTime: 90, points: 1000 };
  const data = { ...makeRoundsQuiz([classicRound('cr38', [question as never], { speedBonus: false })], { leaderboard: 'end' }), title: 'Шпигун перезапуск 38' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Шпигун перезапуск 38' }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage38r', 1280, 720);
  await stage.goto(stageUrl);
  const names = ['Оля', 'Тарас', 'Петро', 'Ганна'];
  const phones: Page[] = [];
  for (const name of names) {
    const page = await open(`phone38r-${phones.length}`, 360, 740);
    await join(page, code, name, false);
    phones.push(page);
  }
  await stage.getByText('Ганна').waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await stage.getByText(SPY_LEGACY_TEXT38, exact).first().waitFor();
  const spyName = await hostSpyName38(host);
  const spyAt = names.indexOf(spyName);
  const others = phones.map((page, at) => ({ page, name: names[at]!, at })).filter((entry) => entry.at !== spyAt);
  const words = ['промінь', 'літо', 'засмага'];
  for (const [at, entry] of others.entries()) await writeWord38(entry.page, words[at]!);
  await writeWord38(phones[spyAt]!, 'ніч');
  await stage.locator('.stage-question .spy-view h2.spy-title', { hasText: 'Хто шпигун?' }).waitFor();
  // Двоє голосують до перезапуску: перший з інших — за шпигуна, другий — за третього.
  await vote38(others[0]!.page, spyName);
  await vote38(others[1]!.page, others[2]!.name);
  await stage.getByText('Проголосували 2 з 4', exact).first().waitFor();
  const hostRows = await rowsOf38(host, '.host-spy');
  const ownWords = await Promise.all(phones.map((page) => ownOf38(page)));
  expect(ownWords).toEqual(names.map((name) => (name === spyName ? 'Ви — шпигун' : 'сонце')));
  for (const page of phones) expect(await page.locator('body').innerText(), 'the old spy word on a phone').not.toContain('місяць');

  await restart(async () => {
    await stage.getByText(RESTARTING_TEXT, exact).waitFor({ timeout: 15_000 });
  });
  for (const page of [stage, ...phones, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  const resume = host.getByRole('button', { name: 'Продовжити', ...exact }).first();
  if (await resume.waitFor({ timeout: 3000 }).then(() => true, () => false)) await resume.click();

  // Той самий шпигун, ті самі слова, ті самі голоси й асоціації.
  expect(await hostSpyName38(host), 'the spy after a restart').toBe(spyName);
  await expect.poll(() => rowsOf38(host, '.host-spy'), POLL).toEqual(hostRows);
  for (const [at, page] of phones.entries()) await expect.poll(() => ownOf38(page), POLL).toBe(ownWords[at]);
  for (const entry of others.slice(0, 2)) await entry.page.getByText('Голос прийнято', exact).waitFor();
  for (const page of [others[2]!.page, phones[spyAt]!]) await page.locator('.spy-vote button').first().waitFor();
  await stage.getByText('Проголосували 2 з 4', exact).first().waitFor();
  await expect.poll(() => rowsOf38(stage, '.stage-question'), POLL).toEqual(names.map((name) => `${name} — ${name === spyName ? 'ніч' : words[others.findIndex((entry) => entry.name === name)]}`));

  // Далі: третій — за шпигуна (2 проти 1), шпигун — за першого → викрито; здогадка «зірка» — мимо.
  await vote38(others[2]!.page, spyName);
  await vote38(phones[spyAt]!, others[0]!.name);
  await phones[spyAt]!.getByText(CAUGHT38, exact).waitFor();
  await field(phones[spyAt]!, GUESS_FIELD38).fill('зірка');
  await click(phones[spyAt]!, 'Відповісти');
  await reveal28a(host);
  await stage.locator('.stage-question .spy-caught').waitFor();
  expect((await stage.locator('.stage-question .spy-guess').textContent())!.trim()).toBe('…але не вгадав слова: зірка');
  await scores38(phones, names.map((name) => (name === spyName ? 0 : name === others[1]!.name ? 0 : 1000)));
  await toWinners27c(host, stage);

  // ── Двоє гравців: «Шпигун» пропускається — раунд відкривається одразу з single, «Далі» пропускає друге spy й закінчує гру. ──
  const host2 = await open('host38s', 1280, 900);
  await register(host2, 'host', 'Леся Ведуча', 'host38s@example.com');
  const skip = { ...makeRoundsQuiz([classicRound('cs38', [spyQ as never, { ...single, id: 'ss38', timeLimit: 30 } as never, spy2Q as never], { speedBonus: false })], { leaderboard: 'end' }), title: 'Шпигун двоє 38' };
  const skipSaved = await host2.request.post(`${base}/api/quizzes`, { data: skip });
  expect(skipSaved.ok(), await skipSaved.text()).toBe(true);
  await host2.goto(`${base}/quizzes`);
  await host2.locator('.quiz-list li', { hasText: 'Шпигун двоє 38' }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host2.waitForURL(/\/host\/\d{6}$/);
  const code2 = host2.url().slice(-6);
  const stage2Url = (await host2.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage2 = await open('stage38s', 1280, 720);
  await stage2.goto(stage2Url);
  const duo = [await open('duo38a', 360, 740), await open('duo38b', 360, 740)];
  await join(duo[0]!, code2, 'Оля', false);
  await join(duo[1]!, code2, 'Тарас', false);
  await stage2.getByText('Тарас').waitFor();
  await click(host2, 'Почати гру');
  await afterSplash(host2, stage2, ...duo);
  await step27a(host2, 'Почати раунд');
  await afterSplash(host2, stage2, ...duo);
  await stage2.getByText(single.text, exact).first().waitFor();
  expect(await host2.locator('.host-spy').count(), 'a spy panel with two players').toBe(0);
  expect(await stage2.getByText(SPY_TEXT38, exact).count(), 'a spy question with two players').toBe(0);
  await reveal28a(host2);
  await toWinners27c(host2, stage2);
  expect(await stage2.getByText(SPY_TEXT38, exact).count(), 'the second spy opened with two players').toBe(0);

  expect(problems).toEqual([]);
}

// ——— 4. 24 гравці: щільна сцена ———

const NAMES38 = [
  'Олександра Петренко', 'Богдана Коваленко', 'Ярослав Шевченко', 'Мирослава Бондар', 'Владислав Ткаченко', 'Анастасія Мельник',
  'Святослав Кравчук', 'Христина Олійник', 'Станіслав Лисенко', 'Катерина Руденко', 'Остап Марченко', 'Соломія Савченко',
  'Тарас Гончаренко', 'Ірина Кузьменко', 'Максим Литвиненко', 'Вероніка Захарчук', 'Назар Поліщук', 'Злата Тимошенко',
  'Дмитро Павленко', 'Олена Кириленко', 'Роман Мороз', 'Оксана Бойко', 'Левко Гнатюк', 'Дарина Ковальчук',
];
/** 24 різні асоціації до «море»; кілька довгих — до 40 символів. */
const ASSOC38 = [
  'хвилі', 'пляж', 'відпустка біля теплої води з друзями', 'сіль', 'маяк', 'чайки над берегом', 'пісок', 'корабель', 'шторм', 'дельфіни',
  'засмага', 'мушлі', 'серфінг на великих хвилях узимку', 'якір', 'бриз', 'горизонт', 'капітан', 'вітрило', 'рибалка', 'медузи',
  'причал', 'глибина', 'синій колір і безкраїй простір навколо', 'острів',
];

async function crowd38(sockets: Socket[]) {
  expect(new Set(ASSOC38).size, 'distinct associations').toBe(24);
  for (const word of ASSOC38) expect(word.length, word).toBeLessThanOrEqual(40);
  const host = await open('host38c', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host38c@example.com');
  const question = { ...spyQ, id: 'sc38', accepted: ['море'], timeLimit: 120, voteTime: 120 };
  const data = { ...makeRoundsQuiz([classicRound('cc38', [question as never], { speedBonus: false })], { leaderboard: 'end' }), title: 'Шпигун натовп 38' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Шпигун натовп 38' }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage38c', 1280, 720);
  await stage.goto(stageUrl);
  // 23 гравці — сокети, 24-й (Дарина) — телефон 320 px.
  const pilots: Pilot[] = [];
  for (const nickname of NAMES38.slice(0, 23)) pilots.push(await pilotPlayer(sockets, code, nickname));
  const phoneName = NAMES38[23]!;
  const phone = await open('phone38c', 320, 640, { hasTouch: true, isMobile: true });
  await join(phone, code, phoneName, false);
  await stage.getByText(phoneName).waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage, phone);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, phone);
  await stage.getByText(SPY_TEXT38, exact).first().waitFor();
  const spyName = await hostSpyName38(host);
  console.log(`part 38: the spy of 24 is ${spyName}`);

  // ── Асоціації: 24 різні. ──
  for (const [at, pilot] of pilots.entries()) await emitOk(pilot, 'player:spy-word', { text: ASSOC38[at] });
  await writeWord38(phone, ASSOC38[23]!);
  await stage.locator('.stage-question .spy-board.is-many').waitFor();
  await expect.poll(() => stage.locator('.stage-question .spy-row').count(), POLL).toBe(24);
  expect(await stage.locator('.stage-question .spy-row.is-spy, .stage-question .spy-votes').count(), 'votes or the spy mark at the vote').toBe(0);

  // ── Сцена 1280×720 на голосуванні: темна й світла тема. ──
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView38(stage, '.spy-board', '24 vote 1280×720');
  await shot(stage, 'spy38-24-vote-stage');
  await theme38(stage, 'light');
  await stage.locator('.stage-question .spy-board.is-many').waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView38(stage, '.spy-board', 'light 24 vote 1280×720');
  await shot(stage, 'spy38-24-light-vote-stage');
  await theme38(stage, 'dark');

  // ── Телефон 320 px: 23 імені без бокового скролу. ──
  await phone.locator('.spy-vote').waitFor();
  expect(await phone.locator('.spy-vote .name').allTextContents()).toEqual(NAMES38.filter((name) => name !== phoneName));
  await expectPhoneRows38(phone, '24 vote 320');
  await expectNoSideScroll(phone, 'spy38-24-phone-320');

  // ── Голоси: перші дев’ять (крім шпигуна) — за шпигуна, решта — за гравця через п’ять → шпигуна викрито. ──
  const voteView = await frame(pilots[0]!, (view) => view.spy?.stage === 'vote' && (view.spy.rows?.length ?? 0) === 24);
  const idOf = new Map(voteView.view.spy!.rows!.map((row) => [row.nickname, row.id]));
  const targetOf = (at: number) => (at < 9 && NAMES38[at] !== spyName ? spyName : NAMES38[(at + 5) % 24]!);
  await vote38(phone, targetOf(23));
  for (const [at, pilot] of pilots.entries()) await emitOk(pilot, 'player:spy-vote', { playerId: idOf.get(targetOf(at)) });
  const spyAt = NAMES38.indexOf(spyName);
  if (spyAt === 23) {
    await phone.getByText(CAUGHT38, exact).waitFor();
    await field(phone, GUESS_FIELD38).fill('річка');
    await click(phone, 'Відповісти');
  } else {
    await frame(pilots[spyAt]!, (view) => view.me.spy?.guessing === true);
    await emitOk(pilots[spyAt]!, 'player:spy-guess', { text: 'річка' });
  }
  await reveal28a(host);

  // ── Розкриття: голоси, слова, шпигун — усе в 1280×720, темна й світла тема. ──
  await stage.locator('.stage-question .spy-caught').waitFor();
  await stage.locator('.stage-question .spy-words', { hasText: 'Загальне слово — море' }).waitFor();
  expect(await stage.locator('.stage-question .spy-row.is-spy .name').textContent()).toBe(spyName);
  console.log(`part 38: 24 reveal — the spy row ${(await stage.locator('.stage-question .spy-row.is-spy').textContent())?.replace(/\s+/g, ' ')}`);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView38(stage, '.spy-board', '24 reveal 1280×720');
  await expectSpyMark38(stage, '.stage-question', 'dark 24 reveal');
  await shot(stage, 'spy38-24-reveal-stage');
  await theme38(stage, 'light');
  await stage.locator('.stage-question .spy-board.is-many').waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView38(stage, '.spy-board', 'light 24 reveal 1280×720');
  await expectSpyMark38(stage, '.stage-question', 'light 24 reveal');
  await shot(stage, 'spy38-24-light-stage');
  await expectPhoneRows38(phone, '24 reveal 320');
  await expectNoSideScroll(phone, 'spy38-24-phone-reveal-320');

  expect(problems).toEqual([]);
}
