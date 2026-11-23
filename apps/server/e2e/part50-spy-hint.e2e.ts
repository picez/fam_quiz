import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz, spy as spyQ, spy2 as spy2Q, spyLegacy as spyLegacyQ } from '@quiz/engine/testing';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { open, click, field, questionText, join, register, POLL, socketFrames, NL, sleep, step27a, phoneScore27a, toWinners27c, reveal28a, framesBeforeReveal, noSideScroll, pickType } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, noSplashLayer, ARTIFACTS, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 50 — «Шпигун» без слова для шпигуна: у редакторі загальне слово й необов'язкова підказка шпигуну (попередження, якщо підказка містить
 * саме загальне слово; старе слово шпигуна — підказкою або геть), на телефоні шпигуна лише «Ви — шпигун» і підказка, на телефонах гравців — слово, нічого з цього
 * на сцені до розкриття; викритий шпигун вписує загальне слово, непомічений без підказки бере подвійну ціну. Телефон 360 px, світла тема. Потребує pnpm build і Chrome.
 */

useE2eServer();

it('part 50: editor — the common word and a spy hint, a warning when the hint holds the word, an old spy word becomes the hint', async () => {
  try {
    await editor50();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 50: the spy sees only «you are the spy» and the hint, the others see the word, caught and guessed, phone 360 px, light theme', async () => {
  try {
    await hinted50();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 50: no hint — the spy sees only the role and stays hidden for double points', async () => {
  try {
    await unhinted50();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

// ——— Помічники ———

const HINT_FIELD50 = 'Підказка шпигуну (необов’язково)';
const LEAK50 = 'Підказка містить саме загальне слово — шпигун його просто прочитає';
const ROLE50 = 'Ви — шпигун';
const HINT50 = "Її п'ють зранку";
const WORD_FIELD50 = 'Напишіть одне слово-асоціацію';
const CAUGHT50 = 'Вас викрили! Впишіть загальне слово';
/** Як писати шпигунові (замість тексту запитання про загальне слово). */
const HOW50 = 'Напишіть асоціацію так, щоб вас не викрили';
const NAMES50 = ['Оля', 'Тарас', 'Петро', 'Ганна'];

/** Слово цілим (кирилиця): «кава» не в «цікава». */
const hasWord50 = (text: string, word: string) => new RegExp(`(^|[^\\p{L}'’])${word}($|[^\\p{L}'’])`, 'iu').test(text);

/** Світла тема пристрою ще до першого завантаження сторінки. */
const light50 = (page: Page) => page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
const isLight50 = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('is-light'));

/** Кадр лише видимої частини екрана (не всієї сторінки): те, що гравець бачить без прокрутки. */
async function vshot50(page: Page, name: string) {
  if (process.env.E2E_SHOTS !== '1') return;
  await noSplashLayer(page);
  await sleep(600);
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`) });
}

/** Власне «слово» на телефоні: гравцеві — слово, шпигунові — «Ви — шпигун». */
const ownOf50 = (page: Page) => page.locator('.spy-me-word, .spy-you-role').first().textContent().catch(() => '');

/** Пульт: «Шпигун: Оля» → «Оля». */
async function hostSpyName50(host: Page): Promise<string> {
  const title = host.locator('.host-spy .spy-title');
  await expect.poll(() => title.textContent().catch(() => ''), POLL).toMatch(/^Шпигун: .+$/);
  return (await title.textContent())!.replace(/^Шпигун: /, '');
}

/** Асоціація з телефона: поле, «Відповісти», далі своє слово чи вже голосування. */
async function writeWord50(page: Page, word: string) {
  await field(page, WORD_FIELD50).fill(word);
  await click(page, 'Відповісти');
  await page.locator('.spy-phone .spy-wrote', { hasText: word }).or(page.locator('.spy-vote')).first().waitFor();
}

/** Голос з телефона: кнопка з іменем; останній голос одразу закриває голосування. */
async function vote50(page: Page, nickname: string) {
  await page.locator('.spy-vote button', { has: page.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) }).click();
  await page.getByText('Голос прийнято', exact).or(page.locator('.spy-caught-you, .spy-guess-stage, section.sent, section.result')).first().waitFor();
}

async function scores50(phones: Page[], wanted: number[]) {
  for (const [at, page] of phones.entries()) await expect.poll(() => phoneScore27a(page).textContent().then((t) => (t ?? '').replace(/\s/g, '')), POLL).toBe(String(wanted[at]));
}

/** Витоки до розкриття: кадри (з from до першого reveal, чи до until) без слів і ключів зі списку. */
function expectNoLeak50(who: string, frames: string[], from: number, words: string[], keys: string[], until?: number) {
  const text = (until === undefined ? framesBeforeReveal(frames.slice(from)) : frames.slice(from, until)).join(NL);
  expect(text.length, `${who}: no frames before reveal`).toBeGreaterThan(0);
  for (const word of words) expect(hasWord50(text, word) || text.includes(word), `«${word}» in the ${who} before reveal`).toBe(false);
  for (const key of keys) expect(text.includes(key), `${key} in the ${who} before reveal`).toBe(false);
}

/** Ключі, яких до розкриття немає ні на сцені, ні в чужих телефонах. */
const SECRET_KEYS50 = ['"spyId"', '"spyName":"', '"spy":true', '"playersWord":"', '"spyHint":"', '"spyWord":"', '"voters":["', '"accepted"'];

type Lobby50 = { host: Page; stage: Page; phones: Page[]; hostFrames: string[]; stageFrames: string[]; phoneFrames: string[][]; from: { host: number; stage: number; phones: number[] } };

/** Гра з одним запитанням «Шпигун»: ведучий, сцена 1280×720 і чотири телефони 360 px (світла тема) до відкриття запитання. */
async function lobby50(tag: string, title: string, question: Record<string, unknown>): Promise<Lobby50> {
  const host = await open(`host50${tag}`, 1280, 900);
  await light50(host);
  await register(host, 'host', 'Марта Ведуча', `host50${tag}@example.com`);
  const data = { ...makeRoundsQuiz([classicRound(`c50${tag}`, [question as never], { speedBonus: false })], { leaderboard: 'end' }), title };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  const hostFrames = socketFrames(host);
  await host.locator('.quiz-list li', { hasText: title }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open(`stage50${tag}`, 1280, 720);
  await light50(stage);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const phones: Page[] = [];
  const phoneFrames: string[][] = [];
  for (const name of NAMES50) {
    const page = await open(`phone50${tag}-${phones.length}`, 360, 740, { hasTouch: true, isMobile: true });
    await light50(page);
    phoneFrames.push(socketFrames(page));
    await join(page, code, name, false);
    phones.push(page);
  }
  await stage.getByText('Ганна').waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  const from = { host: hostFrames.length, stage: stageFrames.length, phones: phoneFrames.map((frames) => frames.length) };
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await stage.getByText(spyQ.text, exact).first().waitFor();
  for (const page of [host, stage, ...phones]) expect(await isLight50(page), 'the light theme').toBe(true);
  return { host, stage, phones, hostFrames, stageFrames, phoneFrames, from };
}

// ——— 1. Редактор ———

async function editor50() {
  const host = await open('host50e', 1280, 900);
  await light50(host);
  await register(host, 'host', 'Ірина Ведуча', 'host50e@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Шпигун 50');
  const types = host.locator('.editor-stage');
  await pickType(types, 'spy');
  await expect.poll(() => questionText(host).inputValue(), POLL).toBe('Напишіть одне слово-асоціацію до загального слова');
  await host.getByText('Шпигуна вибере програма; він бачитиме лише «Ви — шпигун» і вашу підказку. Потрібно щонайменше 3 гравці; з меншою кількістю запитання пропуститься.', exact).waitFor();
  expect(await host.getByLabel('Слово шпигуна', exact).count(), 'the old spy word field').toBe(0);

  // ── Загальне слово й підказка з цим самим словом: попередження, але зберегти можна. ──
  await host.getByRole('textbox', { name: 'Загальне слово', ...exact }).fill('кава');
  await field(host, HINT_FIELD50).fill('кава з молоком');
  const warning = host.getByText(LEAK50, exact);
  await warning.waitFor();
  expect(await host.getByRole('button', { name: 'Зберегти', ...exact }).isEnabled(), 'save with a leaking hint').toBe(true);
  // Підказка, що видає слово, — лише нагадування: лічильник без помилок і не червоний.
  expect(await host.locator('.issues-button').getAttribute('class'), 'a blocking problem for a leaking hint').not.toContain('has-errors');
  expect((await host.locator('.issues-button').textContent())?.trim(), 'no errors for a leaking hint').toMatch(/^ⓘ Нагадувань: \d+$/);
  await host.setViewportSize({ width: 360, height: 800 });
  await field(host, HINT_FIELD50).scrollIntoViewIfNeeded();
  expect(await noSideScroll(host), 'the editor scrolls sideways at 360 px').toBe(true);
  await vshot50(host, 'spy50-editor-360');
  await host.setViewportSize({ width: 1280, height: 900 });

  // ── Виправили підказку — попередження зникло. ──
  await field(host, HINT_FIELD50).fill(HINT50);
  await expect.poll(() => host.getByText(LEAK50, exact).count(), POLL).toBe(0);
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Шпигун 50' }).waitFor();
  const list = async () => (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const stored = async (title: string) => {
    const id = (await list()).find((entry) => entry.title === title)!.id;
    const quiz = (await (await host.request.get(`${base}/api/quizzes/${id}`)).json()) as { rounds: { questions: Record<string, unknown>[] }[] };
    return quiz.rounds[0]!.questions[0]!;
  };
  expect(await stored('Шпигун 50')).toMatchObject({ type: 'spy', accepted: ['кава'], spyHint: HINT50 });
  expect(await stored('Шпигун 50'), 'a spy word in a new question').not.toHaveProperty('spyWord');

  // ── Старе запитання (до 50) зі словом шпигуна «чай»: рядок про нього, «Зробити підказкою» переносить слово в підказку. ──
  const legacy = (title: string) => ({ ...makeRoundsQuiz([classicRound(`lg50${title.length}`, [{ ...spyLegacyQ, id: `lg50q${title.length}`, accepted: ['кава'], spyWord: 'чай', timeLimit: 30, voteTime: 25 } as never])]), title });
  for (const title of ['Шпигун старий 50', 'Шпигун старий без дій 50']) {
    const response = await host.request.post(`${base}/api/quizzes`, { data: legacy(title) });
    expect(response.ok(), await response.text()).toBe(true);
  }
  const edit = async (title: string) => {
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: title }).getByRole('link', { name: 'Редагувати' }).click();
    await host.locator('main.editor').waitFor();
    await expect.poll(() => host.getByRole('textbox', { name: 'Загальне слово', ...exact }).inputValue().catch(() => ''), POLL).toBe('кава');
  };
  await edit('Шпигун старий 50');
  const note = host.getByText('Раніше тут було слово шпигуна «чай». Тепер шпигун його не бачить.', exact);
  await note.waitFor();
  expect(await field(host, HINT_FIELD50).inputValue(), 'the hint before the transfer').toBe('');
  await host.setViewportSize({ width: 360, height: 800 });
  await note.scrollIntoViewIfNeeded();
  await vshot50(host, 'spy50-editor-legacy-360');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зробити підказкою');
  await expect.poll(() => field(host, HINT_FIELD50).inputValue(), POLL).toBe('чай');
  await expect.poll(() => host.getByText('Раніше тут було слово шпигуна', { exact: false }).count(), POLL).toBe(0);
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Шпигун старий 50' }).waitFor();
  const moved = await stored('Шпигун старий 50');
  expect(moved).toMatchObject({ accepted: ['кава'], spyHint: 'чай' });
  expect(moved, 'the old spy word after «Зробити підказкою»').not.toHaveProperty('spyWord');

  // ── Збереження без натискань теж відкидає старе слово. ──
  await edit('Шпигун старий без дій 50');
  await host.getByText('Раніше тут було слово шпигуна «чай». Тепер шпигун його не бачить.', exact).waitFor();
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Шпигун старий без дій 50' }).waitFor();
  const dropped = await stored('Шпигун старий без дій 50');
  expect(dropped, 'the old spy word after a plain save').not.toHaveProperty('spyWord');
  expect(dropped, 'a hint appeared from nowhere').not.toHaveProperty('spyHint');

  expect(problems).toEqual([]);
}

// ——— 2. Підказка: шпигун бачить роль і підказку, решта — слово; викрито й вгадав ———

async function hinted50() {
  const question = { ...spyQ, id: 'sp50a', timeLimit: 30, voteTime: 25, points: 1000 };
  const { host, stage, phones, hostFrames, stageFrames, phoneFrames, from } = await lobby50('a', 'Шпигун підказка 50', question);

  // ── Пульт: шпигун, загальне слово й підказка з відкриття. ──
  const spyName = await hostSpyName50(host);
  const spyAt = NAMES50.indexOf(spyName);
  expect(spyAt, `the spy «${spyName}» is a player`).toBeGreaterThanOrEqual(0);
  console.log(`part 50: the spy of the hinted question is ${spyName}`);
  await host.locator('.host-spy .spy-words', { hasText: 'Загальне слово — кава' }).waitFor();
  await host.locator('.host-spy .spy-hint', { hasText: `Підказка шпигуну: ${HINT50}` }).waitFor();
  const spyPage = phones[spyAt]!;
  const others = phones.map((page, at) => ({ page, name: NAMES50[at]!, at })).filter((entry) => entry.at !== spyAt);

  // ── Телефони: шпигун — «Ви — шпигун» і підказка, без слова; решта — «Ваше слово» «кава», без підказки. ──
  for (const [at, page] of phones.entries()) await expect.poll(() => ownOf50(page), POLL).toBe(at === spyAt ? ROLE50 : 'кава');
  await spyPage.locator('.spy-hint', { hasText: `Підказка: ${HINT50}` }).waitFor();
  expect(await spyPage.locator('.spy-you-how').textContent(), 'how the spy writes').toBe(HOW50);
  for (const entry of others) expect(await entry.page.locator('.spy-you-how').count(), `${entry.name} sees the spy instruction`).toBe(0);
  for (const page of phones) await field(page, WORD_FIELD50).waitFor();
  const spyText = await spyPage.locator('body').innerText();
  expect(hasWord50(spyText, 'кава'), '«кава» on the spy phone').toBe(false);
  expect(spyText, 'the old «Ваше слово» on the spy phone').not.toContain('Ваше слово');
  for (const entry of others) {
    const text = await entry.page.locator('body').innerText();
    expect(text, `${entry.name} sees «Ваше слово»`).toContain('Ваше слово');
    expect(text.includes('зранку') || text.includes('Підказка'), `${entry.name} sees the hint`).toBe(false);
    expect(text.includes(ROLE50), `${entry.name} sees the role line`).toBe(false);
  }
  // Сцена до розкриття: ні підказки, ні шпигуна, ні слова.
  await stage.getByText('Відповіли 0 з 4', exact).first().waitFor();
  const stageText = await stage.locator('body').innerText();
  expect(stageText.includes('зранку') || stageText.includes('Шпигун:') || hasWord50(stageText, 'кава'), 'the hint, the spy or the word on the stage').toBe(false);
  for (const page of phones) expect(await noSideScroll(page), 'a phone scrolls sideways at 360 px').toBe(true);
  await vshot50(spyPage, 'spy50-spy-phone-light-360');
  await vshot50(others[0]!.page, 'spy50-player-phone-light-360');

  // ── Асоціації: шпигун «лимон», решта «ранок», «зерна», «філіжанка». ──
  const words = ['ранок', 'зерна', 'філіжанка'];
  for (const [at, entry] of others.entries()) await writeWord50(entry.page, words[at]!);
  await writeWord50(spyPage, 'лимон');
  await expect.poll(() => spyPage.locator('.spy-you-how').count(), POLL).toBe(0);
  await stage.locator('.stage-question .spy-view h2.spy-title', { hasText: 'Хто шпигун?' }).waitFor();
  // Голосування: спільні телефони без підказки, на телефоні шпигуна роль і підказка лишаються.
  await spyPage.locator('.spy-vote').waitFor();
  await spyPage.locator('.spy-you-role').waitFor();
  expect(await spyPage.locator('.spy-hint').textContent(), 'the hint at the vote').toBe(`Підказка: ${HINT50}`);
  await vshot50(spyPage, 'spy50-spy-vote-light-360');

  // ── Голоси: троє за шпигуна, шпигун — за першого з інших → викрито, останній шанс. ──
  for (const entry of others) await vote50(entry.page, spyName);
  await vote50(spyPage, others[0]!.name);
  await stage.locator('.stage-question .spy-guess-stage', { hasText: 'Останній шанс шпигуна…' }).waitFor();
  await spyPage.getByText(CAUGHT50, exact).waitFor();
  // Останній шанс: підказка лишається на телефоні викритого шпигуна, над полем.
  expect(await spyPage.locator('.spy-phone .spy-hint').textContent(), 'the hint at the guess').toBe(`Підказка: ${HINT50}`);
  for (const entry of others) await entry.page.locator('.spy-phone .spy-guess-stage', { hasText: 'Останній шанс шпигуна…' }).waitFor();
  expect(await noSideScroll(spyPage), 'the caught spy phone scrolls sideways').toBe(true);
  await vshot50(spyPage, 'spy50-caught-phone-light-360');
  // До здогадки загального слова в кадрах шпигуна немає, на DOM сцени — теж.
  const beforeGuess = phoneFrames[spyAt]!.length;
  expect(hasWord50(await spyPage.locator('body').innerText(), 'кава'), '«кава» on the caught spy phone').toBe(false);
  expect(hasWord50(await stage.locator('body').innerText(), 'кава'), '«кава» on the stage at the last chance').toBe(false);

  // ── Шпигун вписує загальне слово → закрито, розкриття. ──
  await field(spyPage, 'Загальне слово').fill('кава');
  await click(spyPage, 'Відповісти');
  await host.getByRole('button', { name: 'Показати відповідь', ...exact }).waitFor();
  await reveal28a(host);

  // ── Розкриття: загальне слово, підказка шпигуну, шпигун +половина ціни, голосувальники — ціна. ──
  await stage.locator('.stage-question .spy-view h2.spy-title', { hasText: `Шпигун: ${spyName}` }).waitFor();
  await stage.locator('.stage-question .spy-words', { hasText: 'Загальне слово — кава' }).waitFor();
  await stage.locator('.stage-question .spy-hint', { hasText: `Підказка шпигуну: ${HINT50}` }).waitFor();
  await stage.locator('.stage-question .spy-caught', { hasText: 'Шпигуна викрито!' }).waitFor();
  expect((await stage.locator('.stage-question .spy-guess.is-guessed').textContent())!.replace(/\s/g, '')).toBe('…івгадавслово:+500');
  const spyRow = stage.locator('.stage-question .spy-row.is-spy');
  expect(await spyRow.locator('.name').textContent()).toBe(spyName);
  expect(await spyRow.locator('.spy-votes').textContent()).toBe('3 голоси');
  for (const entry of others) {
    const row = stage.locator('.stage-question .spy-row', { has: stage.locator('.name', { hasText: new RegExp(`^${entry.name}$`) }) });
    expect((await row.locator('.spy-points').textContent())!.replace(/\s/g, ''), `${entry.name} points`).toBe('+1000');
  }
  await scores50(phones, NAMES50.map((name) => (name === spyName ? 500 : 1000)));
  await spyPage.getByText('Ви були шпигуном', exact).waitFor();
  for (const page of phones) await page.locator('section.result').first().waitFor();
  await vshot50(stage, 'spy50-reveal-light');
  await vshot50(spyPage, 'spy50-reveal-phone-light-360');
  for (const page of phones) expect(await noSideScroll(page), 'a reveal phone scrolls sideways').toBe(true);

  // ── Кадри до розкриття: сцена й чужі телефони без слова, підказки й ключів-секретів; шпигун — без слова до своєї здогадки. ──
  expectNoLeak50('stage frames', stageFrames, from.stage, ['кава', 'зранку'], SECRET_KEYS50);
  for (const entry of others) expectNoLeak50(`${entry.name} frames`, phoneFrames[entry.at]!, from.phones[entry.at]!, ['зранку'], SECRET_KEYS50);
  expectNoLeak50(`${spyName} (spy) frames`, phoneFrames[spyAt]!, from.phones[spyAt]!, ['кава'], ['"spyId"', '"spyName":"', '"playersWord":"', '"spyWord":"', '"voters":["', '"accepted"'], beforeGuess);
  const hostText = framesBeforeReveal(hostFrames.slice(from.host)).join(NL);
  expect(hostText.includes('"spyId"') && hasWord50(hostText, 'кава') && hostText.includes('зранку'), 'the host gets the spy, the word and the hint before reveal').toBe(true);

  await toWinners27c(host, stage);
  expect(problems).toEqual([]);
}

// ——— 3. Без підказки: лише роль; непомічений шпигун — подвійна ціна ———

async function unhinted50() {
  const question = { ...spy2Q, id: 'sp50b', timeLimit: 30, voteTime: 25, points: 500 };
  const { host, stage, phones, phoneFrames, stageFrames, from } = await lobby50('b', 'Шпигун без підказки 50', question);

  const spyName = await hostSpyName50(host);
  const spyAt = NAMES50.indexOf(spyName);
  console.log(`part 50: the spy of the question without a hint is ${spyName}`);
  await host.locator('.host-spy .spy-words', { hasText: 'Загальне слово — гітара' }).waitFor();
  await host.locator('.host-spy .spy-hint', { hasText: 'Без підказки' }).waitFor();
  const spyPage = phones[spyAt]!;
  const others = phones.map((page, at) => ({ page, name: NAMES50[at]!, at })).filter((entry) => entry.at !== spyAt);

  // ── Телефон шпигуна: лише «Ви — шпигун», без підказки й слова. ──
  for (const [at, page] of phones.entries()) await expect.poll(() => ownOf50(page), POLL).toBe(at === spyAt ? ROLE50 : 'гітара');
  expect(await spyPage.locator('.spy-hint').count(), 'a hint line on the spy phone').toBe(0);
  const spyText = await spyPage.locator('body').innerText();
  expect(spyText.includes('Підказка') || hasWord50(spyText, 'гітара'), 'a hint or the word on the spy phone').toBe(false);
  expect(spyText).toContain(ROLE50);
  expect(await spyPage.locator('.spy-you-how').textContent(), 'how the spy writes without a hint').toBe(HOW50);
  for (const entry of others) expect(await entry.page.locator('.spy-you-how').count(), `${entry.name} sees the spy instruction`).toBe(0);
  expect(await noSideScroll(spyPage), 'the spy phone scrolls sideways').toBe(true);
  await vshot50(spyPage, 'spy50-nohint-phone-360');

  // ── Асоціації й голоси розкидано: 2 за шпигуна, 2 за гравця → непомічений. ──
  const words = ['струни', 'вогнище', 'акорд'];
  for (const [at, entry] of others.entries()) await writeWord50(entry.page, words[at]!);
  await writeWord50(spyPage, 'смичок');
  await stage.locator('.stage-question .spy-view h2.spy-title', { hasText: 'Хто шпигун?' }).waitFor();
  const [a, b, c] = others as [(typeof others)[0], (typeof others)[0], (typeof others)[0]];
  await vote50(spyPage, a.name);
  await vote50(b.page, a.name);
  await vote50(a.page, spyName);
  await vote50(c.page, spyName);
  await reveal28a(host);

  await stage.locator('.stage-question .spy-hidden', { hasText: 'Шпигун лишився непоміченим — подвійна ціна' }).waitFor();
  await stage.locator('.stage-question .spy-words', { hasText: 'Загальне слово — гітара' }).waitFor();
  expect(await stage.locator('.stage-question .spy-hint').count(), 'a hint line at the reveal of a question without one').toBe(0);
  const hidden = stage.locator('.stage-question .spy-row.is-spy');
  expect(await hidden.locator('.name').textContent()).toBe(spyName);
  expect((await hidden.locator('.spy-points').textContent())!.replace(/\s/g, '')).toBe('+1000');
  expect(await stage.locator('.stage-question .spy-row:not(.is-spy) .spy-points').count(), 'points for voters of a hidden spy').toBe(0);
  await scores50(phones, NAMES50.map((name) => (name === spyName ? 1000 : 0)));
  for (const page of phones) await page.locator('section.result').first().waitFor();
  expectNoLeak50('stage frames', stageFrames, from.stage, ['гітара'], SECRET_KEYS50);
  expectNoLeak50(`${spyName} (spy) frames`, phoneFrames[spyAt]!, from.phones[spyAt]!, ['гітара'], ['"spyId"', '"spyName":"', '"playersWord":"', '"spyWord":"', '"spyHint":"', '"voters":["', '"accepted"']);
  await vshot50(stage, 'spy50-nohint-reveal-light');
  await toWinners27c(host, stage);
  expect(problems).toEqual([]);
}
