import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { type Locator, type Page } from 'playwright-core';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, field, questionText, join, expectNoSideScroll, register, POLL, socketFrames, RESTARTING_TEXT, NL, pickTeamOn, stageTeam, sleep, step27a, phoneScore27a, toWinners27c, reveal28a, textAnswer, pickType, typeOptions, roundAction, showProblems } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, shot, restart, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 37 — крок «Більше чи менше» в редакторі (37b), «Не перебільш» у числовому (37d)
 * і «Думай як усі» (thinkalike, 37e): групи схожих слів, правки ведучого, нічого чужого до розкриття.
 */

useE2eServer();

it('part 37: editor — a more-or-less step fills points upward and keeps manual ones, no overshoot hides tolerance, thinkalike only in classic rounds', async () => {
  try {
    await editor37();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 37: thinkalike and no overshoot — the biggest group scores, the host splits and joins, the closest from below wins, nothing leaks before reveal, 320 px, light theme', async () => {
  try {
    await game37();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 37: thinkalike in teams — the captain writes, a restart keeps host groups, 320 px', async () => {
  try {
    await teams37();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 37: 24 players — dense thinkalike groups and no-overshoot rows stay inside 1280×720 in dark and light theme', async () => {
  const sockets: Socket[] = [];
  try {
    await crowd37(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

// ——— Дані ———

const ALIKE_TEXT37 = 'Назвіть фрукт, який першим спадає на думку';
const NUMERIC_TEXT37 = 'Скільки клавіш у фортепіано?';

function alike37(id: string) {
  return { id, text: ALIKE_TEXT37, imageUrl: null, video: null, timeLimit: 30, points: 1000, type: 'thinkalike' as const };
}

function overshoot37(id: string) {
  return { id, text: NUMERIC_TEXT37, imageUrl: null, video: null, timeLimit: 30, points: 1000, type: 'numeric' as const, correct: 88, tolerance: 0, noOvershoot: true };
}

type Pair37 = [prompt: string, a: string, va: string, b: string, vb: string, correct: 'a' | 'b'];
const PAIRS37: Pair37[] = [
  ['Що довше?', 'Дніпро', '2201 км', 'Дунай', '2850 км', 'b'],
  ['Що старше?', 'Софійський собор', '1037', 'Видубицький монастир', '1070', 'a'],
  ['Кого більше?', 'Днів у лютому', '28', 'Днів у квітні', '30', 'b'],
  ['Хто важчий?', 'Слон', '5000 кг', 'Бегемот', '1500 кг', 'a'],
];

/** Заповнює порівняння index (з 1) без балів — бали задає крок. */
async function fillPair37(host: Page, index: number, [prompt, a, va, b, vb, correct]: Pair37) {
  const group = host.getByRole('group', { name: `Порівняння ${index}`, ...exact });
  await group.getByLabel('Запитання порівняння', exact).fill(prompt);
  await group.getByLabel('Варіант А', exact).fill(a);
  await group.getByLabel('Значення', exact).nth(0).fill(va);
  await group.getByLabel('Варіант Б', exact).fill(b);
  await group.getByLabel('Значення', exact).nth(1).fill(vb);
  await group.getByLabel('Правильний варіант', exact).nth(correct === 'a' ? 0 : 1).check();
}

const pairPoints37 = (host: Page, index: number) => host.getByRole('group', { name: `Порівняння ${index}`, ...exact }).getByLabel('Бали', exact);

async function pointsOf37(host: Page, count: number): Promise<string[]> {
  const all: string[] = [];
  for (let index = 1; index <= count; index++) all.push(await pairPoints37(host, index).inputValue());
  return all;
}

async function scores37(phones: Page[], wanted: number[]) {
  for (const [at, page] of phones.entries()) await expect.poll(() => phoneScore27a(page).textContent().then((t) => (t ?? '').replace(/\s/g, '')), POLL).toBe(String(wanted[at]));
}

/** Пульт «Думай як усі»: учасник групи за іменем. */
const hostMember37 = (host: Page, nickname: string) => host.locator('.host-alike .alike-member', { has: host.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) });
/** Група (картка) з учасником. */
const groupOf37 = (page: Page, scope: string, nickname: string) => page.locator(`${scope} .alike-group`, { has: page.locator('.alike-member .name', { hasText: new RegExp(`^${nickname}$`) }) });

/** Учасники груп сцени по картках: [["Оля","Тарас"],["Петро"]]. */
const groupMembers37 = (page: Page, scope: string) =>
  page.locator(`${scope} .alike-group`).evaluateAll((all) => all.map((group) => [...group.querySelectorAll('.alike-member .name')].map((el) => el.textContent ?? '')));

/** «Об’єднати з…» на групі учасника from: пункт групи, де перший учасник — to. */
async function joinOn37(host: Page, from: string, to: string) {
  const select = groupOf37(host, '.host-alike', from).locator('select.alike-join');
  const value = await select.locator('option').evaluateAll((all, name) => all.find((option) => option.textContent?.endsWith(`· ${name}`))?.getAttribute('value') ?? null, to);
  expect(value, `a join option «… · ${to}»`).not.toBeNull();
  await select.selectOption(value!);
}

/** Контраст тексту з його справжнім тлом (альфи предків змішано через canvas): відношення яскравостей WCAG. */
async function contrast37(scope: Locator): Promise<{ color: string; background: string; ratio: number }> {
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

async function expectReadable37(scope: Locator, name: string) {
  const { color, background, ratio } = await contrast37(scope);
  console.log(`part 37: ${name} — ${color} on ${background}, contrast ${ratio.toFixed(2)}`);
  expect(color, `${name}: the text colour is the background`).not.toBe(background);
  expect(ratio, `${name}: contrast ${color} on ${background}`).toBeGreaterThanOrEqual(3);
}

/** Тема пристрою: light — quiz:theme = light; dark — ключа немає. Перезавантаження: гра повертається за токеном. */
async function theme37(page: Page, mode: 'light' | 'dark') {
  await page.evaluate((wanted) => (wanted === 'light' ? localStorage.setItem('quiz:theme', 'light') : localStorage.removeItem('quiz:theme')), mode);
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('is-light')), POLL).toBe(mode === 'light');
}

/** Сцена: без прокрутки, і дошка (.stage-question) та блок selector не виходять за нижній край вікна. */
async function expectBoardInView37(stage: Page, selector: string, name: string) {
  const [height, clientH, width, clientW] = (await stage.evaluate('[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]')) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const viewport = stage.viewportSize()!;
  for (const target of ['.stage-question', selector]) {
    const box = (await stage.locator(target).first().boundingBox())!;
    console.log(`part 37: ${name} — ${target} ${Math.round(box.width)}×${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)}, bottom ${Math.round(box.y + box.height)} of ${viewport.height}`);
    expect(box.y + box.height, `${name}: ${target} reaches below the ${viewport.height} px stage`).toBeLessThanOrEqual(viewport.height + 1);
  }
  const out = await stage.locator(`${selector} li`).evaluateAll((all) => all.filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.left < -1); }).map((el) => el.textContent));
  expect(out, `${name}: items outside the stage`).toEqual([]);
  // Картки груп і рядки не під кнопками кута сцени («Читати вголос», тема) і не під смугою реакцій.
  const covered = await stage.evaluate((sel) => {
    const blockers = [...document.querySelectorAll('.stage-speech button, .reaction-strip')].map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
    return [...document.querySelectorAll(`${sel} .alike-group, ${sel} .alike-silent-names li, ${sel} .overshoot-rows > li`)]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return blockers.some((b) => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top);
      })
      .map((el) => el.textContent);
  }, selector);
  expect(covered, `${name}: cards under a fixed corner`).toEqual([]);
}

/** Телефон: картки груп і рядки «Не перебільш» не ширші за екран, слова переносяться (нічого не обрізано вбік). */
async function expectPhoneCards37(page: Page, name: string) {
  const wide = await page.locator('.alike-group, .alike-words, .overshoot-row').evaluateAll((all) => all.filter((el) => el.getBoundingClientRect().right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1).map((el) => el.className + ': ' + el.textContent));
  expect(wide, `${name}: cards wider than the phone`).toEqual([]);
}

// ——— 1. Редактор ———

async function editor37() {
  const host = await open('host37e', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host37e@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Крок 37');

  // ── «Більше чи менше»: три порівняння, перше 100, «Крок» 50 → 100/150/200; 3-є вручну 500; «+ Порівняння» → 550; разом 1300. ──
  await pickType(host, 'moreless');
  await questionText(host).fill('Порівняйте пари');
  expect(await host.getByRole('group', { name: /^Порівняння \d+$/ }).count(), 'three blank comparisons').toBe(3);
  for (const [at, pair] of PAIRS37.slice(0, 3).entries()) await fillPair37(host, at + 1, pair);
  await pairPoints37(host, 1).fill('100');
  expect(await field(host, 'Крок').inputValue(), 'no step at first').toBe('');
  await field(host, 'Крок').fill('50');
  await expect.poll(() => pointsOf37(host, 3), POLL).toEqual(['100', '150', '200']);
  await pairPoints37(host, 3).fill('500');
  await host.getByText('Разом: 750', exact).waitFor();
  await click(host, '+ Порівняння');
  await fillPair37(host, 4, PAIRS37[3]!);
  // Ручні 500 лишаються, нове — 500 + крок.
  await expect.poll(() => pointsOf37(host, 4), POLL).toEqual(['100', '150', '500', '550']);
  await host.getByText('Разом: 1300', exact).waitFor();
  await field(host, 'Час, с').fill('30');

  // ── Числове: «Не перебільш» ховає «Допустиме відхилення»; вимкнули — поле знову є. ──
  await click(host, 'Додати запитання');
  await pickType(host, 'numeric');
  await questionText(host).fill(NUMERIC_TEXT37);
  await field(host, 'Правильне число').fill('88');
  await field(host, 'Час, с').fill('30');
  expect(await host.getByLabel('Допустиме відхилення', exact).count(), 'tolerance before the switch').toBe(1);
  await host.getByLabel('Не перебільш', exact).check();
  await expect.poll(() => host.getByLabel('Допустиме відхилення', exact).count(), POLL).toBe(0);
  await host.getByText('Більше за правильну — 0. Усю ціну отримують найближчі знизу; точна — найближча. Допуск не діє.', exact).waitFor();
  await host.getByLabel('Не перебільш', exact).uncheck();
  await expect.poll(() => host.getByLabel('Допустиме відхилення', exact).count(), POLL).toBe(1);
  await host.getByLabel('Не перебільш', exact).check();

  // ── «Думай як усі» в меню класики: типовий текст і 30 с. ──
  const types = host.locator('.editor-stage');
  await click(host, 'Додати запитання');
  expect((await typeOptions(types)).includes('thinkalike'), 'thinkalike in the classic menu').toBe(true);
  await pickType(types, 'thinkalike');
  await expect.poll(() => questionText(host).inputValue(), POLL).toBe(ALIKE_TEXT37);
  await expect.poll(() => field(host, 'Час, с').inputValue(), POLL).toBe('30');
  await host.getByText('Тема — у тексті запитання. Схожі слова програма об’єднає сама; на розкритті ви зможете виправити групи.', exact).waitFor();

  // ── Бліц: «Як усі» в меню немає; числове з «Не перебільш» — проблема місця. ──
  await click(host, '+ Раунд');
  await click(host, 'Бліц');
  await expect.poll(async () => (await typeOptions(types)).includes('single'), POLL).toBe(true);
  expect((await typeOptions(types)).includes('thinkalike'), 'thinkalike in the blitz menu').toBe(false);
  await pickType(types, 'numeric');
  await questionText(host).fill('Скільки струн у скрипки?');
  await field(host, 'Правильне число').fill('4');
  await host.getByLabel('Не перебільш', exact).check();
  await click(host, 'Зберегти');
  await (await showProblems(host)).filter({ hasText: /«Не перебільш» — лише в класичному раунді\./ }).waitFor();
  await roundAction(host, 'Видалити раунд');
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Крок 37' }).waitFor();

  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Крок 37')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { type: string; questions: Record<string, unknown>[] }[] };
  expect(stored.rounds.map((round) => round.type)).toEqual(['classic']);
  const [moreless, numeric, alike] = stored.rounds[0]!.questions as [
    { type: string; step?: number; points: number; pairs: { points: number }[] },
    { type: string; noOvershoot?: boolean; correct: number },
    { type: string; text: string; timeLimit: number },
  ];
  expect(moreless).toMatchObject({ type: 'moreless', step: 50, points: 1300 });
  expect(moreless.pairs.map((pair) => pair.points)).toEqual([100, 150, 500, 550]);
  expect(numeric).toMatchObject({ type: 'numeric', correct: 88, noOvershoot: true });
  expect(alike).toMatchObject({ type: 'thinkalike', text: ALIKE_TEXT37, timeLimit: 30 });

  // ── Повторне відкриття: «Крок» 50, бали ті самі; у числовому — перемикач увімкнено, допуску немає. ──
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Крок 37' }).getByRole('link', { name: 'Змінити' }).click();
  await host.getByRole('button', { name: /^Запитання 1 Порівняйте пари/ }).click();
  await expect.poll(() => field(host, 'Крок').inputValue(), POLL).toBe('50');
  expect(await pointsOf37(host, 4)).toEqual(['100', '150', '500', '550']);
  await shot(host, 'step37-editor');
  await host.getByRole('button', { name: /^Запитання 2 Скільки клавіш/ }).click();
  await expect.poll(() => host.getByLabel('Не перебільш', exact).isChecked(), POLL).toBe(true);
  expect(await host.getByLabel('Допустиме відхилення', exact).count(), 'tolerance with no overshoot after reopening').toBe(0);

  expect(problems).toEqual([]);
}

// ——— 2. Гра: «Думай як усі» й «Не перебільш» ———

async function game37() {
  const host = await open('host37', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host37@example.com');
  const data = { ...makeRoundsQuiz([classicRound('c37', [alike37('a37') as never, overshoot37('n37') as never], { speedBonus: false })], { leaderboard: 'end' }), title: 'Як усі 37' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  const hostFrames = socketFrames(host);
  await host.locator('.quiz-list li', { hasText: 'Як усі 37' }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage37', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya37', 320, 640, { hasTouch: true, isMobile: true });
  const olyaFrames = socketFrames(olya);
  const taras = await open('taras37', 375, 812);
  const tarasFrames = socketFrames(taras);
  const petro = await open('petro37', 360, 740);
  const petroFrames = socketFrames(petro);
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();
  const phones = [olya, taras, petro];
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  // ── «Думай як усі»: Оля «Яблуко», Тарас «яблука», Петро «груша». ──
  const from = { stage: stageFrames.length, olya: olyaFrames.length, taras: tarasFrames.length, petro: petroFrames.length };
  await stage.getByText(ALIKE_TEXT37, exact).first().waitFor();
  await field(olya, 'Ваша відповідь').fill('Яблуко');
  expect(await field(olya, 'Ваша відповідь').getAttribute('placeholder')).toBe('Напишіть те, що напише більшість');
  await expectNoSideScroll(olya, 'alike37-phone-320');
  await click(olya, 'Відповісти');
  await textAnswer(taras, 'яблука');
  await textAnswer(petro, 'груша');
  // Відповіли всі — запитання закривається само; пульт бачить групи вже на locked, але без правок.
  await host.locator('.host-alike .alike-group').first().waitFor();
  expect(await host.locator('.host-alike select.alike-join').count(), 'join selects on locked').toBe(0);
  expect(await host.getByRole('button', { name: 'Окремо', ...exact }).count(), 'split buttons on locked').toBe(0);
  await stage.getByText(/Відповіли:? 3 з 3/).first().waitFor();

  // До розкриття чужих слів немає ні в кадрах телефонів і сцени, ні в DOM сцени; груп (alike) — теж.
  const leaks: [string, string, string[]][] = [
    ['stage frames', stageFrames.slice(from.stage).join(NL), ['Яблуко', 'яблука', 'груша']],
    ['Olya frames', olyaFrames.slice(from.olya).join(NL), ['яблука', 'груша']],
    ['Taras frames', tarasFrames.slice(from.taras).join(NL), ['Яблуко', 'груша']],
    ['Petro frames', petroFrames.slice(from.petro).join(NL), ['Яблуко', 'яблука']],
    ['stage DOM', await stage.locator('body').innerText(), ['Яблуко', 'яблука', 'груша']],
  ];
  for (const [who, text, words] of leaks) {
    for (const word of words) expect(text.includes(word), `«${word}» in the ${who} before reveal`).toBe(false);
    expect(text.includes('"alike":'), `alike groups in the ${who} before reveal`).toBe(false);
  }
  expect(hostFrames.join(NL), 'the host gets the groups on locked').toContain('"alike":');

  // ── Розкриття: дві групи, «Найбільша» — Оля й Тарас з «+1000»; бали 1000, 1000, 0. ──
  await reveal28a(host);
  await stage.locator('.stage-question .alike-reveal').waitFor();
  await expect.poll(() => groupMembers37(stage, '.stage-question'), POLL).toEqual([['Оля', 'Тарас'], ['Петро']]);
  const top = stage.locator('.stage-question .alike-group.alike-top');
  expect(await top.count(), 'one top group').toBe(1);
  expect(await top.locator('.alike-top-tag').textContent()).toBe('Найбільша');
  expect((await top.locator('.alike-points').textContent())!.replace(/\s/g, '')).toBe('+1000');
  expect(await top.locator('.alike-words').textContent()).toBe('Яблуко, яблука');
  // Слова на сцені більші (1.75rem), ніж на телефоні.
  expect(await top.locator('.alike-words').evaluate((el) => getComputedStyle(el).fontSize), 'stage word size').toBe('28px');
  expect(await stage.locator('.stage-question .alike-group:not(.alike-top) .alike-points').count(), 'points on a smaller group').toBe(0);
  await scores37(phones, [1000, 1000, 0]);
  await olya.locator('.alike-group.is-me.alike-top').waitFor();
  await expectPhoneCards37(olya, 'alike reveal 320');
  await expectNoSideScroll(olya, 'alike37-phone-reveal-320');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView37(stage, '.alike-reveal', 'alike reveal 1280×720');
  await shot(stage, 'alike37-stage');

  // ── Пульт: «Окремо» біля Тараса — усі слова різні, Оля 0; «Об’єднати з…» назад — знову 1000. ──
  await hostMember37(host, 'Тарас').getByRole('button', { name: 'Окремо', ...exact }).click();
  await stage.getByText('Усі слова різні — балів немає', exact).waitFor();
  await expect.poll(() => groupMembers37(stage, '.stage-question'), POLL).toEqual([['Оля'], ['Тарас'], ['Петро']]);
  await scores37(phones, [0, 0, 0]);
  await joinOn37(host, 'Тарас', 'Оля');
  await expect.poll(() => groupMembers37(stage, '.stage-question'), POLL).toEqual([['Оля', 'Тарас'], ['Петро']]);
  expect(await stage.getByText('Усі слова різні — балів немає', exact).count()).toBe(0);
  await scores37(phones, [1000, 1000, 0]);
  await shot(host, 'alike37-host');

  // ── Світла тема на сцені й в Олі: групи читаються, підсвітка найбільшої контрастна. ──
  for (const page of [stage, olya]) await theme37(page, 'light');
  await stage.locator('.stage-question .alike-group.alike-top').waitFor();
  await olya.locator('.alike-group.is-me.alike-top').waitFor();
  await expectReadable37(stage.locator('.stage-question .alike-top .alike-top-tag'), 'light stage top tag');
  await expectReadable37(stage.locator('.stage-question .alike-top .alike-words'), 'light stage top words');
  await expectReadable37(stage.locator('.stage-question .alike-top .alike-points'), 'light stage top points');
  await expectReadable37(olya.locator('.alike-top .alike-points'), 'light phone top points');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView37(stage, '.alike-reveal', 'light alike reveal 1280×720');
  await shot(stage, 'alike37-light-stage');
  await expectNoSideScroll(olya, 'alike37-light-phone-320');
  for (const page of [stage, olya]) await theme37(page, 'dark');
  await expectReadable37(stage.locator('.stage-question .alike-top .alike-top-tag'), 'dark stage top tag');
  await expectReadable37(stage.locator('.stage-question .alike-top .alike-points'), 'dark stage top points');

  // ── «Не перебільш»: Оля 85, Тарас 90, Петро 80 → +1000, 0, 0 (найближче знизу — Оля). ──
  await step27a(host, 'Далі');
  await afterSplash(host, stage, ...phones);
  await stage.getByText(NUMERIC_TEXT37, exact).first().waitFor();
  const next = { stage: stageFrames.length, olya: olyaFrames.length, taras: tarasFrames.length, petro: petroFrames.length };
  await textAnswer(olya, '85');
  await textAnswer(taras, '90');
  await textAnswer(petro, '80');
  await stage.getByText(/Відповіли:? 3 з 3/).first().waitFor();
  // Тимчасовий запис — 0: телефон не каже «правильно» до розкриття; чужих чисел і рядків overshoot ніде немає.
  for (const [who, text, values] of [
    ['stage frames', stageFrames.slice(next.stage).join(NL), [85, 90, 80]],
    ['Olya frames', olyaFrames.slice(next.olya).join(NL), [90, 80]],
    ['Taras frames', tarasFrames.slice(next.taras).join(NL), [85, 80]],
    ['Petro frames', petroFrames.slice(next.petro).join(NL), [85, 90]],
  ] as const) {
    for (const value of values) expect(text.includes(`"value":${value}`), `${value} in the ${who} before reveal`).toBe(false);
    expect(text.includes('"overshoot":'), `overshoot rows in the ${who} before reveal`).toBe(false);
  }
  await reveal28a(host);
  await stage.locator('.stage-question .overshoot').waitFor();
  await expect.poll(() => stage.locator('.stage-question .overshoot-limit').textContent(), POLL).toBe('');
  const rows = await stage.locator('.stage-question .overshoot-rows > li').evaluateAll((all) => all.map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim()));
  expect(rows).toEqual(['Оля85+1000', 'Петро800', '', 'Тарас90перебільшили']);
  await stage.locator('.stage-question .overshoot-row.overshoot-over', { hasText: 'Тарас' }).getByText('перебільшили', exact).waitFor();
  expect(await stage.locator('.stage-question .overshoot-row.is-best .name').allTextContents()).toEqual(['Оля']);
  await taras.locator('.overshoot-row.overshoot-over.is-me').getByText('перебільшили', exact).waitFor();
  expect((await olya.locator('.overshoot-row.is-me .overshoot-points').textContent())!.replace(/\s/g, '')).toBe('+1000');
  await scores37(phones, [2000, 1000, 0]);
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView37(stage, '.overshoot', 'overshoot reveal 1280×720');
  await shot(stage, 'overshoot37-stage');
  await shot(taras, 'overshoot37-phone-over');
  await expectReadable37(stage.locator('.stage-question .overshoot-over .overshoot-points'), 'dark «перебільшили»');

  // ── Світла тема: «перебільшили» й найближчий знизу читаються, телефон 320 px без прокрутки вбік. ──
  for (const page of [stage, olya, taras]) await theme37(page, 'light');
  await stage.locator('.stage-question .overshoot-over').waitFor();
  await olya.locator('.overshoot-row.is-me').waitFor();
  await expectReadable37(stage.locator('.stage-question .overshoot-over .overshoot-points'), 'light «перебільшили»');
  await expectReadable37(stage.locator('.stage-question .overshoot-row.is-best .overshoot-points'), 'light best points');
  await expectReadable37(taras.locator('.overshoot-row.is-me .overshoot-points'), 'light phone «перебільшили»');
  await expectPhoneCards37(olya, 'overshoot reveal 320');
  await expectNoSideScroll(olya, 'overshoot37-light-phone-320');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await shot(stage, 'overshoot37-light-stage');
  await shot(taras, 'overshoot37-light-phone-over');
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

// ——— 3. Команди ———

async function teams37() {
  const host = await open('host37t', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host37t@example.com');
  const data = {
    ...makeRoundsQuiz([classicRound('ct37', [alike37('at37') as never], { speedBonus: false })], { leaderboard: 'end', teams: { count: 2, names: ['Соняшники', 'Маки'], answerer: 'captain' } }),
    title: 'Як усі команди 37',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Як усі команди 37' }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage37t', 1600, 900);
  await stage.goto(stageUrl);
  // Капітани — перші в команді: Оля («Соняшники») і Петро («Маки»); Тарас — товариш Олі на 320 px.
  const olya = await open('olya37t', 375, 812);
  const taras = await open('taras37t', 320, 568, { hasTouch: true, isMobile: true });
  const petro = await open('petro37t', 375, 812);
  const hanna = await open('hanna37t', 360, 740);
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
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await stage.getByText(ALIKE_TEXT37, exact).first().waitFor();

  // Капітан пише; у товариша поля немає — він бачить чернетку капітана лише для читання.
  await field(olya, 'Ваша відповідь').fill('груша');
  await taras.locator('.team-draft', { hasText: 'груша' }).waitFor();
  expect(await taras.locator('input, textarea').count(), 'a teammate has an answer field').toBe(0);
  expect(await taras.getByRole('button', { name: 'Відповісти', ...exact }).count(), 'a teammate has a submit button').toBe(0);
  await expectNoSideScroll(taras, 'alike37-teams-phone');
  await click(olya, 'Відповісти');
  await textAnswer(petro, 'Груша');
  await reveal28a(host);

  // Обидві команди — одна група з двох: по 1000 кожному гравцеві.
  await stage.locator('.stage-question .alike-group.alike-top').waitFor();
  const before = await groupMembers37(host, '.host-alike');
  console.log(`part 37: team groups on the host ${JSON.stringify(before)}; silent ${JSON.stringify(await host.locator('.host-alike .alike-silent-names li').allTextContents())}`);
  expect(await host.locator('.host-alike .alike-group').count(), 'one group of both teams').toBe(1);
  await scores37(phones, [1000, 1000, 1000, 1000]);
  await expectPhoneCards37(taras, 'teams reveal 320');
  await expectNoSideScroll(taras, 'alike37-teams-phone-reveal');

  // Пульт: «Окремо» → усі різні, по 0; перезапуск — групи пульта ті самі.
  const firstMember = before[0]![0]!;
  await hostMember37(host, firstMember).getByRole('button', { name: 'Окремо', ...exact }).click();
  await host.getByText('Усі слова різні — балів немає', exact).waitFor();
  await scores37(phones, [0, 0, 0, 0]);
  const split = await groupMembers37(host, '.host-alike');
  expect(split.length, 'two groups after the split').toBe(2);
  await restart(async () => {
    await stage.getByText(RESTARTING_TEXT, exact).waitFor({ timeout: 15_000 });
  });
  for (const page of [stage, ...phones, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  const resume = host.getByRole('button', { name: 'Продовжити', ...exact }).first();
  if (await resume.waitFor({ timeout: 3000 }).then(() => true, () => false)) await resume.click();
  await expect.poll(() => groupMembers37(host, '.host-alike'), POLL).toEqual(split);
  await host.getByText('Усі слова різні — балів немає', exact).waitFor();
  await stage.getByText('Усі слова різні — балів немає', exact).waitFor();
  await scores37(phones, [0, 0, 0, 0]);
  // Після перезапуску правки й далі працюють: об’єднання назад — по 1000.
  await joinOn37(host, split[1]![0]!, split[0]![0]!);
  await scores37(phones, [1000, 1000, 1000, 1000]);
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await shot(stage, 'alike37-teams-stage');
  await toWinners27c(host, stage);

  expect(problems).toEqual([]);
}

// ——— 4. 24 гравці: щільна сцена ———

const NAMES37 = [
  'Олександра Петренко', 'Богдана Коваленко', 'Ярослав Шевченко', 'Мирослава Бондар', 'Владислав Ткаченко', 'Анастасія Мельник',
  'Святослав Кравчук', 'Христина Олійник', 'Станіслав Лисенко', 'Катерина Руденко', 'Остап Марченко', 'Соломія Савченко',
  'Тарас Гончаренко', 'Ірина Кузьменко', 'Максим Литвиненко', 'Вероніка Захарчук', 'Назар Поліщук', 'Злата Тимошенко',
  'Дмитро Павленко', 'Олена Кириленко', 'Роман Мороз', 'Оксана Бойко', 'Левко Гнатюк', 'Дарина Ковальчук',
];
/** 21 слово (3 гравці мовчать): «яблуко» ×3, «груша» ×2 і 16 різних — 18 груп, понад 12 (is-many). */
const FRUITS37 = ['яблуко', 'груша', 'Яблуко', 'слива', 'вишня', 'абрикос', 'персик', 'банан', 'лимон', 'ківі', 'яблука', 'ананас', 'манго', 'гранат', 'диня', 'кавун', 'хурма', 'полуниця', 'Груша', 'інжир', 'смородина-порічка'];
/** 24 різні числа навколо 88: 16 ≤ 88, 8 більше. */
const NUMBERS37 = [88, 87, 86.5, 85, 84, 80, 75, 70, 66, 60, 55, 50, 44, 40, 30, 20, 89, 90, 92, 95, 100, 110, 120, 150];

async function crowd37(sockets: Socket[]) {
  const host = await open('host37c', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host37c@example.com');
  const data = { ...makeRoundsQuiz([classicRound('cc37', [alike37('ac37') as never, overshoot37('nc37') as never], { speedBonus: false })], { leaderboard: 'end' }), title: 'Як усі натовп 37' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Як усі натовп 37' }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage37c', 1280, 720);
  await stage.goto(stageUrl);
  const players: Socket[] = [];
  for (const nickname of NAMES37) {
    const response = await fetch(`${base}/api/games/by-code/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname }) });
    expect(response.status, nickname).toBe(201);
    const { token } = (await response.json()) as { token: string };
    const socket = connectSocket(base, { auth: { code, role: 'player', token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((done, fail) => {
      socket.once('connect', () => done());
      socket.once('connect_error', fail);
    });
    players.push(socket);
  }
  const answer = (socket: Socket, payload: unknown) => new Promise<{ ok: boolean }>((done) => socket.emit('player:answer', payload, done));
  await stage.getByText('Дарина Ковальчук').waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage);
  await stage.getByText(ALIKE_TEXT37, exact).first().waitFor();

  // ── «Думай як усі»: 21 слово — 18 груп, найбільша «яблуко» з трьох. ──
  for (const [at, word] of FRUITS37.entries()) expect(await answer(players[at]!, { type: 'thinkalike', value: word }), `${NAMES37[at]} answers`).toMatchObject({ ok: true });
  await reveal28a(host);
  await stage.locator('.stage-question .alike-groups.is-many').waitFor();
  const groups = await stage.locator('.stage-question .alike-group').count();
  console.log(`part 37: ${groups} thinkalike groups on the 24-player stage`);
  expect(groups, 'distinct groups').toBeGreaterThanOrEqual(13);
  expect(await stage.locator('.stage-question .alike-group.alike-top .alike-member').count(), 'the top group').toBe(3);
  expect(await stage.locator('.stage-question .alike-silent-names li').count(), 'silent players').toBe(3);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView37(stage, '.alike-reveal', 'alike 24 players 1280×720');
  await shot(stage, 'alike37-24-stage');
  await theme37(stage, 'light');
  await stage.locator('.stage-question .alike-groups.is-many').waitFor();
  await expectReadable37(stage.locator('.stage-question .alike-top .alike-top-tag'), 'light dense top tag');
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView37(stage, '.alike-reveal', 'light alike 24 players 1280×720');
  await shot(stage, 'alike37-24-light-stage');
  await theme37(stage, 'dark');

  // ── «Не перебільш»: 24 числа — 25 рядків з межею, щільний вигляд. ──
  await step27a(host, 'Далі');
  await afterSplash(host, stage);
  await stage.getByText(NUMERIC_TEXT37, exact).first().waitFor();
  for (const [at, value] of NUMBERS37.entries()) expect(await answer(players[at]!, { type: 'numeric', value }), `${NAMES37[at]} answers`).toMatchObject({ ok: true });
  await reveal28a(host);
  await stage.locator('.stage-question .overshoot-rows.is-many').waitFor();
  const rows = await stage.locator('.stage-question .overshoot-row').count();
  console.log(`part 37: ${rows} no-overshoot rows on the 24-player stage`);
  expect(rows, 'no-overshoot rows').toBeGreaterThanOrEqual(13);
  expect(await stage.locator('.stage-question .overshoot-row.overshoot-over').count(), 'overshot rows').toBe(8);
  expect(await stage.locator('.stage-question .overshoot-row.is-best .name').allTextContents(), 'the exact answer wins').toEqual([NAMES37[0]]);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView37(stage, '.overshoot', 'overshoot 24 players 1280×720');
  await shot(stage, 'overshoot37-24-stage');
  await theme37(stage, 'light');
  await stage.locator('.stage-question .overshoot-rows.is-many').waitFor();
  await expectReadable37(stage.locator('.stage-question .overshoot-over .overshoot-points'), 'light dense «перебільшили»');
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView37(stage, '.overshoot', 'light overshoot 24 players 1280×720');
  await shot(stage, 'overshoot37-24-light-stage');

  expect(problems).toEqual([]);
}
