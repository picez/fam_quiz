import { classicRound, makeRoundsQuiz, single, slider } from '@quiz/engine/testing';
import { DEBUFF_KINDS, type Question, type Quiz } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { open, click, field, seconds, join, expectNoSideScroll, expectStageInView, register, POLL, boxOf, pickOption, textAnswer, sleep, step27a, next27a, reveal28a, MENU } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 31 — «Легкий режим» на телефонах 375 і 320, «Сімейна гра», «Читати вголос» на сцені,
 * легкий режим у профілі. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 31: easy mode on 375 and 320 phones — 19 px type, tall options, no sideways scroll on single, text, slider and «так/ні», a calm shake, and the stage on the same phone is not in easy mode', async () => {
  try {
    await easyPhones31();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 31: a family game gives more time and drops the confusing debuffs — the editor, the lobby on the host, a phone and the stage', async () => {
  try {
    await familyGame31();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 31: the stage reads the question aloud with a Ukrainian voice only, never the answer, keeps quiet over video and says when there is no voice', async () => {
  try {
    await stageSpeech31();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 31: an account keeps easy mode in the profile and a new device without a choice turns it on', async () => {
  try {
    await accountEasy31();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

/** Заглушка мовлення: записує, що сцена сказала й скільки разів замовкала; голоси — лише ті, що в списку. */
const SPEECH_STUB31 = (voices: { lang: string; name: string }[]) => `(() => {
  window.__spoken = []; window.__cancels = 0;
  const list = ${JSON.stringify(voices)}.map((v) => ({ ...v, voiceURI: v.name, localService: true, default: false }));
  class Utterance { constructor(text) { this.text = text; this.lang = ''; this.voice = null; this.rate = 1; this.onend = null; } }
  const synth = {
    speaking: false, pending: false, paused: false,
    getVoices: () => list,
    speak(u) { window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.lang ?? null }); setTimeout(() => u.onend?.({}), 30); },
    cancel() { window.__cancels += 1; },
    pause() {}, resume() {},
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
})()`;

type Spoken31 = { text: string; lang: string; voice: string | null };
const spoken31 = async (stage: Page) => (await stage.evaluate('window.__spoken')) as Spoken31[];
const cancels31 = async (stage: Page) => (await stage.evaluate('window.__cancels')) as number;

/** Вікторина ведучого через API, «Грати»: код гри й посилання сцени. */
async function play31(host: Page, quiz: Quiz): Promise<{ code: string; stageUrl: string; id: string }> {
  const saved = await host.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(saved.ok(), await saved.text()).toBe(true);
  const id = ((await saved.json()) as { id: string }).id;
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: quiz.title }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  return { code, stageUrl, id };
}

/** Гість вмикає «Легкий режим» на формі входу й входить у гру. */
async function joinEasy31(page: Page, code: string, nickname: string, shotName: string) {
  await page.goto(`${base}/play/${code}`);
  await page.getByRole('checkbox', { name: 'Легкий режим', ...exact }).check();
  await expect.poll(() => page.evaluate("document.documentElement.classList.contains('is-easy')"), POLL).toBe(true);
  expect(await page.evaluate('getComputedStyle(document.documentElement).fontSize')).toBe('19px');
  expect(await page.evaluate("localStorage.getItem('quiz:easy')")).toBe('on');
  await expectNoSideScroll(page, `p31-join-easy-${shotName}`);
  await field(page, 'Ваше ім’я').fill(nickname);
  await click(page, 'Увійти в гру');
  await page.getByText('Ви в грі. Чекаємо на старт.').waitFor();
  await expectNoSideScroll(page, `p31-lobby-easy-${shotName}`);
}

const easyClass = (page: Page) => page.evaluate("document.documentElement.classList.contains('is-easy')") as Promise<boolean>;

async function easyPhones31() {
  const host = await open('host31a', 1280, 800);
  await register(host, 'host', 'Марта Ведуча', 'host31a@example.com');
  const questions: Question[] = [
    {
      ...single,
      id: 'e1',
      text: 'Яке місто стоїть на Дніпрі й має Андріївський узвіз?',
      options: [
        { id: 'a', text: 'Київ' },
        { id: 'b', text: 'Черкаси' },
        { id: 'c', text: 'Запоріжжя' },
        { id: 'd', text: 'Кременчук' },
      ],
      correctId: 'a',
      timeLimit: 30,
    },
    { id: 'e2', type: 'text', text: 'Яке місто називають столицею Галичини?', accepted: ['Львів'], imageUrl: null, video: null, timeLimit: 30, points: 1000 },
    { ...slider, id: 'e3', text: 'Скільки ніг у павука?', min: 0, max: 20, step: 1, correct: 8, tolerance: 0, zeroBeyond: 4, unit: 'ніг', timeLimit: 30 },
    { id: 'e4', type: 'boolean', text: 'Сонце обертається навколо Землі?', correct: false, imageUrl: null, video: null, timeLimit: 30, points: 1000 },
  ];
  const quiz = { ...makeRoundsQuiz([classicRound('r31a', questions, { speedBonus: false, shuffleOptions: false })], { leaderboard: 'each', debuffs: ['shake', 'fog'] }), title: 'Родинний вечір 31' };
  const { code, stageUrl } = await play31(host, quiz);

  const olya = await open('olya31a', 375, 812);
  await joinEasy31(olya, code, 'Оля', '375');
  const taras = await open('taras31a', 320, 568, { hasTouch: true, isMobile: true });
  await joinEasy31(taras, code, 'Тарас', '320');
  const petro = await open('petro31a', 375, 812);
  await join(petro, code, 'Петро', false);
  expect(await easyClass(petro)).toBe(false);
  const phones = [olya, taras, petro];

  await click(host, 'Почати гру');
  await afterSplash(host, ...phones);
  await click(host, 'Почати раунд');
  await afterSplash(host, ...phones);

  // ── Варіанти: без прокручування вбік; у легкому режимі варіант вищий за 75 px, у Петра — нижчий. ──
  await olya.locator('.choice').first().waitFor();
  await taras.locator('.choice').first().waitFor();
  await expectNoSideScroll(olya, 'p31-single-easy-375');
  await expectNoSideScroll(taras, 'p31-single-easy-320');
  expect((await boxOf(olya, '.choice')).height).toBeGreaterThanOrEqual(75);
  expect((await boxOf(taras, '.choice')).height).toBeGreaterThanOrEqual(75);
  expect((await boxOf(petro, '.choice')).height).toBeLessThan(75);

  // ── Марта насилає Олі «Тремтіння екрана» на наступне запитання. ──
  const row = (nickname: string) => host.locator('.player-row', { hasText: nickname });
  await row('Оля').getByRole('button', { name: 'Дебаф', ...exact }).click();
  await row('Оля').locator('.player-tools').getByRole('button', { name: /Тремтіння екрана/ }).click();
  await row('Оля').locator('.debuff-tag').waitFor();

  for (const page of phones) await pickOption(page, 'Київ');
  await reveal28a(host);
  await next27a(host);
  await afterSplash(host, ...phones);

  // ── text: дебаф на легкому телефоні — у спокійному вигляді. ──
  await olya.locator('.debuff-zone.is-shake.is-calm').waitFor();
  expect(await olya.evaluate("getComputedStyle(document.querySelector('.debuff-content')).animationName")).toBe('debuff-ghost');
  await shot(olya, 'p31-shake-calm-375');
  await expectNoSideScroll(taras, 'p31-text-easy-320');
  for (const page of phones) await textAnswer(page, 'Львів');
  await reveal28a(host);
  await next27a(host);
  await afterSplash(host, ...phones);

  // ── slider ──
  await taras.getByRole('slider', { name: 'Повзунок', ...exact }).waitFor();
  await expectNoSideScroll(taras, 'p31-slider-easy-320');
  for (const page of phones) {
    await page.getByRole('slider', { name: 'Повзунок', ...exact }).fill('8');
    await click(page, 'Відповісти');
  }
  await reveal28a(host);
  await next27a(host);
  await afterSplash(host, ...phones);

  // ── «так/ні»: правильна — «Ні». ──
  await olya.getByRole('button', { name: 'Ні', ...exact }).waitFor();
  await expectNoSideScroll(olya, 'p31-boolean-easy-375');
  for (const page of phones) await click(page, 'Ні');
  await reveal28a(host);
  await taras.locator('section.result').first().waitFor();
  await expectNoSideScroll(taras, 'p31-reveal-easy-320');
  await step27a(host, 'Далі');
  await sleep(1500);
  await expectNoSideScroll(olya, 'p31-table-easy-375');
  await expectNoSideScroll(taras, 'p31-table-easy-320');

  // ── Сцена на тому самому телефоні — без легкого режиму. ──
  const stageTab = await olya.context().newPage();
  await stageTab.goto(stageUrl);
  await stageTab.locator('.app.stage').first().waitFor();
  expect(await easyClass(stageTab)).toBe(false);
  await stageTab.close();
  expect(await easyClass(olya)).toBe(true);

  expect(problems).toEqual([]);
}

const FAMILY_LINE = '👪 Сімейна гра: більше часу на відповідь, без найзаплутаніших дебафів';

async function familyGame31() {
  const host = await open('host31b', 1280, 800);
  await register(host, 'host', 'Марта Ведуча', 'host31b@example.com');
  const questions: Question[] = [
    {
      ...single,
      id: 'f1',
      text: 'Яка гора — найвища в Україні?',
      options: [
        { id: 'a', text: 'Петрос' },
        { id: 'b', text: 'Говерла' },
        { id: 'c', text: 'Піп Іван' },
      ],
      correctId: 'b',
      timeLimit: 30,
    },
    { id: 'f2', type: 'text', text: 'Яка річка тече через Ужгород?', accepted: ['Уж'], imageUrl: null, video: null, timeLimit: 25, points: 1000 },
  ];
  const quiz = { ...makeRoundsQuiz([classicRound('r31b', questions, { speedBonus: false })], { leaderboard: 'end', family: true, debuffs: [...DEBUFF_KINDS] }), title: 'Сімейна розминка 31' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(saved.ok(), await saved.text()).toBe(true);
  const id = ((await saved.json()) as { id: string }).id;

  // ── Редактор: «Сімейна гра» увімкнено, «Тремтіння екрана» неактивне з поясненням. ──
  await host.goto(`${base}/quizzes/${id}`);
  // Налаштування вікторини — перший згорнутий розділ «rules» (без додаткового класу).
  const settings = host.locator('details.rules:not(.teams):not(.powers):not(.spares):not(.duels)').first();
  await settings.waitFor({ state: 'attached' });
  if ((await settings.getAttribute('open')) === null) await settings.locator('summary').first().click();
  const family = host.getByRole('checkbox', { name: 'Сімейна гра', ...exact });
  await family.waitFor();
  expect(await family.isChecked()).toBe(true);
  const powers = host.locator('details.powers');
  if ((await powers.getAttribute('open')) === null) await powers.locator('summary').click();
  const shake = powers.getByRole('checkbox', { name: /Тремтіння екрана/ });
  expect(await shake.isDisabled()).toBe(true);
  expect(await shake.isChecked()).toBe(false);
  await powers.getByText('У сімейній грі вимкнено').first().waitFor();
  expect(await powers.getByRole('checkbox', { name: /Туман/ }).isDisabled()).toBe(false);
  await powers.scrollIntoViewIfNeeded();
  await shot(host, 'p31-editor-family');

  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Сімейна розминка 31' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage31b', 1280, 720);
  await stage.goto(stageUrl);
  const petro = await open('petro31b', 375, 812);
  await join(petro, code, 'Петро', false);

  // ── Лобі: рядок сімейної гри на пульті, телефоні й сцені; на сцені ще порада. ──
  for (const page of [host, petro, stage]) await page.getByText(FAMILY_LINE, exact).waitFor();
  await stage.getByText('Увімкніть «Читати вголос» — сцена читатиме запитання.', exact).waitFor();
  await expectNoSideScroll(petro, 'p31-family-lobby-375');
  await shot(stage, 'p31-family-lobby-stage');

  await click(host, 'Почати гру');
  await afterSplash(host, stage, petro);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, petro);

  // ── 30 с + 15 с. ──
  await petro.getByRole('timer').first().waitFor();
  expect(await seconds(petro)).toBeGreaterThanOrEqual(43);
  const row = host.locator('.player-row', { hasText: 'Петро' });
  await row.getByRole('button', { name: 'Дебаф', ...exact }).click();
  const picks = row.locator('.player-tools .debuff-picks button');
  await picks.first().waitFor();
  const names = (await picks.allTextContents()).join(' | ');
  for (const off of ['Тремтіння екрана', 'Дзеркало', 'Догори дриґом', 'Ліхтарик', 'Бульбашки']) expect(names, off).not.toContain(off);
  expect(names).toContain('Туман');
  await shot(host, 'p31-family-host-debuffs');
  await row.getByRole('button', { name: 'Дебаф', ...exact }).click();

  await pickOption(petro, 'Говерла');
  await reveal28a(host);
  await next27a(host);
  await afterSplash(host, stage, petro);

  // ── 25 с + 13 с = 38 с; без сімейної гри було б не більше 25 (запас — на заставку й перемальовування). ──
  await petro.getByRole('timer').first().waitFor();
  const left = await seconds(petro);
  expect(left).toBeGreaterThan(30);
  expect(left).toBeLessThanOrEqual(38);

  expect(problems).toEqual([]);
}

async function stageSpeech31() {
  const host = await open('host31c', 1280, 800);
  await register(host, 'host', 'Марта Ведуча', 'host31c@example.com');
  const questions: Question[] = [
    {
      ...single,
      id: 's1',
      text: 'Яка річка тече через Київ?',
      options: [
        { id: 'a', text: 'Дніпро' },
        { id: 'b', text: 'Дунай' },
        { id: 'c', text: 'Десна' },
        { id: 'd', text: 'Рось' },
      ],
      correctId: 'a',
      timeLimit: 30,
    },
    { id: 's2', type: 'text', text: 'Назвіть столицю Польщі', accepted: ['Варшава'], imageUrl: null, video: null, timeLimit: 30, points: 1000 },
    { ...single, id: 's3', text: 'Що звучить у цьому відео?', options: [{ id: 'a', text: 'Пісня' }, { id: 'b', text: 'Тиша' }], correctId: 'a', video: { id: 'dQw4w9WgXcQ', start: 0 } },
  ];
  const quiz = { ...makeRoundsQuiz([classicRound('r31c', questions, { speedBonus: false, shuffleOptions: false })], { leaderboard: 'end' }), title: 'Читаємо вголос 31' };
  const { code, stageUrl } = await play31(host, quiz);

  const stage = await open('stage31c', 1280, 720);
  await stage.context().addInitScript(SPEECH_STUB31([{ lang: 'uk-UA', name: 'Тестовий голос' }, { lang: 'ru-RU', name: 'Інший' }]));
  await stage.goto(stageUrl);
  const speak = stage.getByRole('button', { name: '🔊 Читати вголос', ...exact });
  await speak.waitFor();
  expect(await speak.getAttribute('aria-pressed')).toBe('false');
  await speak.click();
  await expect.poll(() => speak.getAttribute('aria-pressed'), POLL).toBe('true');
  await stage.getByRole('button', { name: '🔁 Ще раз', ...exact }).waitFor();
  await expectStageInView(stage, 'p31-stage-lobby-speech');
  await shot(stage, 'p31-stage-lobby-speech');
  // Кнопка не лягає на QR.
  const button = (await stage.locator('.stage-speech').boundingBox())!;
  const qr = (await stage.locator('.stage-lobby .qr').boundingBox())!;
  const apart = button.x + button.width <= qr.x || qr.x + qr.width <= button.x || button.y + button.height <= qr.y || qr.y + qr.height <= button.y;
  expect(apart, 'the speech button covers the QR').toBe(true);

  const petro = await open('petro31c', 375, 812);
  await join(petro, code, 'Петро', false);
  await click(host, 'Почати гру');
  await afterSplash(host, stage, petro);
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, petro);

  // ── Перше запитання: текст і варіанти — українським голосом. ──
  const all = async () => (await spoken31(stage)).map((s) => s.text).join(' ');
  await expect.poll(all, POLL).toContain('Яка річка тече через Київ?');
  await expect.poll(all, POLL).toContain('Варіанти: Дніпро; Дунай; Десна; Рось.');
  for (const entry of await spoken31(stage)) expect(entry.voice, entry.text).toBe('uk-UA');
  await expectStageInView(stage, 'p31-stage-question-speech');
  await shot(stage, 'p31-stage-question-speech');
  const once = (await spoken31(stage)).filter((s) => s.text === 'Яка річка тече через Київ?').length;
  await click(stage, '🔁 Ще раз');
  await expect.poll(async () => (await spoken31(stage)).filter((s) => s.text === 'Яка річка тече через Київ?').length, POLL).toBe(once + 1);

  // ── Розкриття: замовкає, нового нічого. ──
  // Єдиний гравець відповів — запитання закривається само (locked), і сцена вже тоді замовкає.
  const beforeReveal = await cancels31(stage);
  await pickOption(petro, 'Дніпро');
  await sleep(500);
  const countBefore = (await spoken31(stage)).length;
  await reveal28a(host);
  await expect.poll(() => cancels31(stage), POLL).toBeGreaterThan(beforeReveal);
  await sleep(1000);
  expect((await spoken31(stage)).length).toBe(countBefore);
  await next27a(host);
  await afterSplash(host, stage, petro);

  // ── Друге (текст): читає запитання, «Варшави» не каже ніколи. ──
  await expect.poll(all, POLL).toContain('Назвіть столицю Польщі');
  // Без голосу: друга сцена з лише англійським голосом чесно каже, що не читає.
  const mute = await open('stage31c-mute', 1280, 720);
  await mute.context().addInitScript(SPEECH_STUB31([{ lang: 'en-US', name: 'English' }]));
  await mute.goto(stageUrl);
  await mute.getByRole('button', { name: '🔊 Читати вголос', ...exact }).click();
  await mute.getByRole('status').filter({ hasText: 'На цьому пристрої немає голосу для мови «Українська» — запитання не читаю.' }).waitFor();
  expect(await spoken31(mute)).toEqual([]);
  await shot(mute, 'p31-stage-no-voice');
  await textAnswer(petro, 'Варшава');
  await reveal28a(host);
  await sleep(1000);
  expect(await all()).not.toContain('Варшава');
  await next27a(host);
  await afterSplash(host, stage, petro);

  // ── Третє (відео): мовчить і каже чому. ──
  const countVideo = (await spoken31(stage)).length;
  await stage.getByRole('status').filter({ hasText: 'У запитанні є звук чи відео — вголос не читаю, щоб не заглушити.' }).waitFor();
  await sleep(1000);
  expect((await spoken31(stage)).length).toBe(countVideo);
  expect(await all()).not.toContain('Варшава');
  expect(await spoken31(mute)).toEqual([]);

  expect(problems).toEqual([]);
}

async function accountEasy31() {
  const email = 'hanna31@example.com';
  const hanna = await open('hanna31', 375, 812);
  await register(hanna, 'menu', 'Ганна', email);
  await hanna.goto(`${base}/profile/settings`);
  const box = hanna.getByRole('checkbox', { name: 'Легкий режим', ...exact });
  await box.waitFor();
  await hanna.getByText('Зберігається в профілі', { exact: false }).waitFor();
  const [saved] = await Promise.all([hanna.waitForResponse((r) => r.url().endsWith('/api/me/easy') && r.request().method() === 'PUT'), box.check()]);
  expect(saved.status()).toBe(200);
  await expect.poll(() => easyClass(hanna), POLL).toBe(true);
  await expectNoSideScroll(hanna, 'p31-settings-easy-375');

  // ── Новий пристрій без вибору: після входу режим уже є. ──
  const signIn = async (page: Page) => {
    const response = await page.request.post(`${base}/api/auth/sign-in/email`, { data: { email, password: 'correct horse battery' }, headers: { origin: base } });
    expect(response.ok(), await response.text()).toBe(true);
    await page.goto(base);
    await page.locator(MENU).getByRole('link', { name: 'Профіль' }).waitFor();
  };
  const fresh = await open('hanna31-new', 375, 812);
  await signIn(fresh);
  await expect.poll(() => easyClass(fresh), POLL).toBe(true);
  expect(await fresh.evaluate("localStorage.getItem('quiz:easy')")).toBeNull();
  await expectNoSideScroll(fresh, 'p31-new-device-easy-375');

  // ── Спільний планшет, де вже вибрали «вимкнено»: так і лишається. ──
  const shared = await open('hanna31-off', 375, 812);
  await shared.context().addInitScript("localStorage.setItem('quiz:easy', 'off')");
  await signIn(shared);
  await sleep(1000);
  expect(await easyClass(shared)).toBe(false);

  expect(problems).toEqual([]);
}
