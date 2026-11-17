import { type Question } from '@quiz/shared';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { type Locator, type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, join, expectNoSideScroll, register, POLL, socketFrames, RESTARTING_TEXT, sleep, step27a, toWinners27c, reveal28a, seconds, writeLie, HEADER_ONE_LINE, slowSocket, pilotPlayer, pilotSocket, frame, emitOk, createAutopilot, type Pilot } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, shot, restart, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 40 — звуки на сцені (38d): кнопка «Увімкнути звуки» в куті сцени, рівно один звук на подію
 * (акорд чи «бу-у» на розкритті, п'ять цокань і гонг лише за часом, гонг на кінці кожного етапу блефу, акценти заставок,
 * фанфари), без повтору після перезавантаження, перезапуску й перепідключення, вимикачі ведучого й пристрою, автопілот,
 * тиша на телефонах і пульті, кут сцени 1280×720 у темній і світлій темі, шапка пульта на 360 px.
 */

useE2eServer();

it('part 40: stage sounds — the unlock button, one sound per event, five ticks and a gong on time, splash accents, a fanfare, silence on phones', async () => {
  try {
    await game40();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 40: stage sounds — the host switch and the stage switch mute, a restart and a reconnect repeat nothing, an autopilot room plays', async () => {
  const sockets: Socket[] = [];
  try {
    await switches40();
    await autopilot40(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

it('part 40: stage sounds — a bluff question gongs at the end of each stage timer, once each', async () => {
  try {
    await bluff40();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 40: stage sounds — the corner fits 1280×720 in dark and light theme, the host header fits 360 px', async () => {
  const sockets: Socket[] = [];
  try {
    await corner40(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

// ——— Помічники ———

/**
 * Підмінний Web Audio (ставиться до goto на кожну сторінку): контекст народжується призупиненим, resume() будить його
 * (state 'running' і onstatechange), методи розкладу нічого не роблять, start осцилятора рахується. Події quiz:stage-sound
 * пишуться в window.__audio.sounds з часом пристрою.
 */
const FAKE_AUDIO_INIT = `(() => {
  const audio = { contexts: 0, oscillators: 0, sounds: [] };
  window.__audio = audio;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = (extra) => Object.assign({ connect() {}, disconnect() {} }, extra);
  class FakeAudioContext {
    constructor() {
      audio.contexts += 1;
      this.state = 'suspended';
      this.onstatechange = null;
      this.sampleRate = 44100;
      this.destination = node({});
    }
    get currentTime() {
      return performance.now() / 1000;
    }
    resume() {
      return Promise.resolve().then(() => {
        if (this.state === 'running') return;
        this.state = 'running';
        if (this.onstatechange) this.onstatechange();
      });
    }
    suspend() {
      this.state = 'suspended';
      if (this.onstatechange) this.onstatechange();
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
    createOscillator() {
      return node({ type: 'sine', frequency: param(), detune: param(), onended: null, start() { audio.oscillators += 1; }, stop() {} });
    }
    createGain() {
      return node({ gain: param() });
    }
    createBuffer(channels, length, rate) {
      return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      return node({ buffer: null, onended: null, start() {}, stop() {} });
    }
  }
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;
  window.addEventListener('quiz:stage-sound', (event) => audio.sounds.push({ sound: event.detail, at: Date.now() }));
})()`;

/** Назви звуків сцени, які сторінка зіграла (з миті завантаження). */
const sounds40 = (page: Page) => page.evaluate('window.__audio.sounds.map((s) => s.sound)') as Promise<string[]>;
/** Звуки з часом пристрою, мс. */
const soundLog40 = (page: Page) => page.evaluate('window.__audio.sounds') as Promise<{ sound: string; at: number }[]>;
/** Скільки осциляторів запустила сторінка. */
const oscillators40 = (page: Page) => page.evaluate('window.__audio.oscillators') as Promise<number>;

/** Сторінка з підмінним звуком: init-скрипт до першого goto. */
async function open40(name: string, width: number, height: number): Promise<Page> {
  const page = await open(name, width, height);
  await page.addInitScript(FAKE_AUDIO_INIT);
  return page;
}

const unlockButton40 = (stage: Page) => stage.locator('.stage-sounds-unlock');
const toggleButton40 = (stage: Page) => stage.locator('.stage-sounds-toggle');
const hostSwitch40 = (host: Page) => host.getByRole('button', { name: 'Звуки на сцені', ...exact });

/** Клік «🔊 Увімкнути звуки»: кнопка зникає, з'являється «🔔 Звуки» (aria-pressed true). */
async function unlock40(stage: Page) {
  await unlockButton40(stage).getByText('🔊 Увімкнути звуки', exact).waitFor();
  await unlockButton40(stage).click();
  await toggleButton40(stage).getByText('🔔 Звуки', exact).waitFor();
  await expect.poll(() => toggleButton40(stage).getAttribute('aria-pressed'), POLL).toBe('true');
  expect(await unlockButton40(stage).count(), 'the unlock button after the click').toBe(0);
}

/** За ms нових звуків не з'явилося: список той самий. */
async function quiet40(stage: Page, before: string[], ms: number, why: string) {
  await sleep(ms);
  expect(await sounds40(stage), why).toEqual(before);
}

/** Чекає, поки звук name прозвучить count разів. */
async function heard40(stage: Page, name: string, count: number, timeout = 10_000) {
  await expect.poll(async () => (await sounds40(stage)).filter((s) => s === name).length, { timeout, message: `${name} × ${count}` }).toBe(count);
}

/** Вибір варіанта на телефоні за текстом; чекає, що відповідь прийнято. */
async function answer40(page: Page, text: string) {
  // Опитування показує живі голоси на кнопках («Осінь 0 %»), тож після тексту можуть іти ще слова.
  await page.getByRole('button', { name: new RegExp(`(^|\\s)${text}(\\s|$)`) }).click();
  await page.getByText(/^(Відповідь прийнято|Голос прийнято|Чекаємо на правильну відповідь)$/).first().waitFor();
}

const common = { imageUrl: null, video: null };
const single40 = (id: string, text: string, options: string[], timeLimit = 25): Question => ({
  ...common,
  id,
  type: 'single',
  text,
  points: 100,
  timeLimit,
  options: options.map((option, at) => ({ id: `${id}-${at}`, text: option })),
  correctId: `${id}-0`,
});
const bool40 = (id: string, text: string, correct: boolean): Question => ({ ...common, id, type: 'boolean', text, points: 100, timeLimit: 25, correct });

/** Сценарій 1: класика з трьох запитань і раунд з опитуванням (без балів). */
function quiz40(title: string) {
  const q1 = single40('q1', 'Яка річка тече через Київ?', ['Дніпро', 'Десна', 'Рось']);
  const q2 = bool40('q2', 'Чи є Ейфелева вежа в Римі?', false);
  const q3 = single40('q3', 'Найбільший океан?', ['Тихий', 'Атлантичний', 'Індійський']);
  const p1: Question = {
    ...common,
    id: 'p1',
    type: 'poll',
    text: 'Яка пора року вам до вподоби?',
    points: 0,
    timeLimit: 25,
    options: [
      { id: 'p1-a', text: 'Весна' },
      { id: 'p1-b', text: 'Літо' },
      { id: 'p1-c', text: 'Осінь' },
      { id: 'p1-d', text: 'Зима' },
    ],
  };
  const rounds = [classicRound('r1', [q1, q2, q3], { title: 'Природа', speedBonus: false }), classicRound('r2', [p1], { title: 'Опитування', speedBonus: false })];
  return { ...makeRoundsQuiz(rounds, { leaderboard: 'end' }), title };
}

/** Зберігає вікторину, відкриває кімнату й сцену 1280×720 з підмінним звуком; повертає код, сцену і її кадри. */
async function room40(host: Page, data: Record<string, unknown>, stageName: string) {
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: data.title as string }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open40(stageName, 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  return { code, stage, stageFrames };
}

/** Перезапуск сервера посеред гри; пульт продовжує, якщо гра стала на паузу. */
async function restart40(host: Page, stage: Page, phones: Page[]) {
  await restart(async () => {
    await stage.getByText(RESTARTING_TEXT, exact).waitFor({ timeout: 15_000 });
  });
  for (const page of [stage, ...phones, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  const resume = host.getByRole('button', { name: 'Продовжити', ...exact }).first();
  if (await resume.waitFor({ timeout: 3000 }).then(() => true, () => false)) await resume.click();
}

/** Телефони й пульт звуків 38d не грають: жодного осцилятора, жодної події quiz:stage-sound. */
async function expectSilent40(pages: [string, Page][]) {
  for (const [who, page] of pages) {
    expect(await oscillators40(page), `${who}: oscillators`).toBe(0);
    expect(await sounds40(page), `${who}: stage sounds`).toEqual([]);
  }
}

// ——— 1. Кнопка, один звук на подію, цокання й гонг, акценти, фанфари, тиша на телефонах ———

async function game40() {
  const host = await open40('host40', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host40@example.com');
  const { code, stage } = await room40(host, quiz40('Звуки 40'), 'stage40');
  const olya = await open40('olya40', 360, 740);
  const petro = await open40('petro40', 375, 812);
  const phones = [olya, petro];
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();

  // ── Лобі: у куті сцени — «🔊 Увімкнути звуки». ──
  await unlockButton40(stage).getByText('🔊 Увімкнути звуки', exact).waitFor();
  expect(await toggleButton40(stage).count(), 'the toggle before the unlock').toBe(0);
  await shot(stage, 'sounds40-unlock-stage');

  // ── Старт до кліку: заставка раунду звучить лише розблокованій сцені — тут тиша, і потім не наздоганяє. ──
  await click(host, 'Почати гру');
  await stage.locator('.splash.is-round').waitFor();
  await afterSplash(host, stage, ...phones);
  expect(await sounds40(stage), 'sounds before the unlock').toEqual([]);
  await unlock40(stage);
  await quiet40(stage, [], 1000, 'the round splash caught up after the unlock');
  await shot(stage, 'sounds40-toggle-stage');

  // ── q1: Оля правильно, Петро мовчить; «−15 с» → відлік до кінця: п'ять цокань по секунді, потім один гонг. ──
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await olya.locator('h1', { hasText: 'Яка річка тече через Київ?' }).waitFor();
  await answer40(olya, 'Дніпро');
  await click(host, '−15 с');
  await heard40(stage, 'gong', 1, 30_000);
  const q1 = await soundLog40(stage);
  console.log(`part 40: q1 countdown — ${JSON.stringify(q1.map((s, at) => `${s.sound}${at === 0 ? '' : ` +${s.at - q1[at - 1]!.at}`}`))}`);
  expect(q1.map((s) => s.sound), 'q1 countdown').toEqual(['tick', 'tick', 'tick', 'tick', 'tick', 'gong']);
  for (let at = 1; at < 5; at++) {
    const gap = q1[at]!.at - q1[at - 1]!.at;
    expect(gap, `tick ${at} → ${at + 1}`).toBeGreaterThanOrEqual(700);
    expect(gap, `tick ${at} → ${at + 1}`).toBeLessThanOrEqual(1300);
  }
  const lastTick = q1[5]!.at - q1[4]!.at;
  expect(lastTick, 'the last tick → the gong').toBeGreaterThanOrEqual(700);
  expect(lastTick, 'the last tick → the gong').toBeLessThanOrEqual(1300);
  await reveal28a(host);
  await heard40(stage, 'correct', 1);
  await quiet40(stage, [...q1.map((s) => s.sound), 'correct'], 1500, 'q1 reveal plays once');

  // ── q2: обидва «Так» (правильно «Ні») — усі відповіли, запитання закрилося раніше: без цокань і гонгу; розкриття → «бу-у». ──
  await step27a(host, 'Далі');
  await olya.locator('h1', { hasText: 'Чи є Ейфелева вежа в Римі?' }).waitFor();
  await answer40(olya, 'Так');
  await answer40(petro, 'Так');
  await reveal28a(host);
  await heard40(stage, 'wrong', 1);
  await quiet40(stage, ['tick', 'tick', 'tick', 'tick', 'tick', 'gong', 'correct', 'wrong'], 1500, 'q2: all answered — no tick, no gong');

  // ── q3: Петро правильно; ведучий закриває на 15-й секунді — без гонгу; розкриття → акорд. ──
  await step27a(host, 'Далі');
  await petro.locator('h1', { hasText: 'Найбільший океан?' }).waitFor();
  await answer40(petro, 'Тихий');
  await expect.poll(() => seconds(host), { timeout: 30_000 }).toBeLessThanOrEqual(10);
  await click(host, 'Закрити запитання');
  await reveal28a(host);
  await heard40(stage, 'correct', 2);
  await quiet40(stage, ['tick', 'tick', 'tick', 'tick', 'tick', 'gong', 'correct', 'wrong', 'correct'], 1500, 'q3: an early close — no gong');

  // ── Раунд 2: заставка раунду → акцент; опитування на розкритті мовчить. ──
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  await stage.locator('.splash.is-round').waitFor();
  await heard40(stage, 'accent', 1);
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  for (const page of phones) await page.locator('h1', { hasText: 'Яка пора року вам до вподоби?' }).waitFor();
  await answer40(olya, 'Весна');
  await answer40(petro, 'Осінь');
  await step27a(host, 'Показати результати');
  await stage.locator('h1', { hasText: 'Яка пора року вам до вподоби?' }).waitFor();
  await host.getByRole('button', { name: 'Далі', ...exact }).waitFor();
  await quiet40(stage, ['tick', 'tick', 'tick', 'tick', 'tick', 'gong', 'correct', 'wrong', 'correct', 'accent'], 1500, 'a poll reveal is silent');

  // ── Фініш → фанфари рівно раз. ──
  await toWinners27c(host, stage);
  await heard40(stage, 'fanfare', 1);
  const all = ['tick', 'tick', 'tick', 'tick', 'tick', 'gong', 'correct', 'wrong', 'correct', 'accent', 'fanfare'];
  await quiet40(stage, all, 2000, 'the whole game on the stage');
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'sounds40-finished-stage');

  // ── Перезавантаження на фініші: нічого не звучить — ні до кліку, ні після розблокування. ──
  await stage.reload();
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await unlock40(stage);
  await quiet40(stage, [], 2000, 'the finish after a reload');

  // ── Телефони й пульт — тиша. ──
  await expectSilent40([['Оля', olya], ['Петро', petro], ['host', host]]);
  expect(problems).toEqual([]);
}

// ——— 2. Вимикачі, перезапуск, перепідключення, автопілот ———

/** Сценарій 2: чотири запитання по 25 с. */
function switchQuiz40(title: string) {
  const a1 = single40('a1', 'Найвища гора України?', ['Говерла', 'Петрос', 'Піп Іван']);
  const a2 = bool40('a2', 'Чи впадає Дніпро в Балтійське море?', false);
  const a3 = single40('a3', 'Столиця Франції?', ['Париж', 'Ліон', 'Марсель']);
  const a4 = bool40('a4', 'Чи є Тихий океан найбільшим на Землі?', true);
  return { ...makeRoundsQuiz([classicRound('r1', [a1, a2, a3, a4], { title: 'Вимикачі', speedBonus: false })], { leaderboard: 'end' }), title };
}

async function switches40() {
  const host = await open40('host40s', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host40s@example.com');
  const { code, stage, stageFrames } = await room40(host, switchQuiz40('Звуки 40 вимикачі'), 'stage40s');
  // Сокет сцени — через проксі: його можна обірвати з боку сервера, щоб сцена перепідключилася.
  const stageSocket = await slowSocket(stage);
  await stage.reload();
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open40('olya40s', 360, 740);
  const petro = await open40('petro40s', 375, 812);
  const phones = [olya, petro];
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();

  // ── Розблокована сцена: заставка раунду звучить. ──
  await unlock40(stage);
  await click(host, 'Почати гру');
  await heard40(stage, 'accent', 1);
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  await olya.locator('h1', { hasText: 'Найвища гора України?' }).waitFor();

  // ── Ведучий вимикає звуки: на сцені підпис «Звуки вимкнув ведучий», кнопок звуку немає; розкриття a1 мовчить. ──
  await expect.poll(() => hostSwitch40(host).getAttribute('aria-pressed'), POLL).toBe('true');
  await hostSwitch40(host).click();
  await expect.poll(() => hostSwitch40(host).getAttribute('aria-pressed'), POLL).toBe('false');
  await stage.locator('.stage-sounds-off').getByText('Звуки вимкнув ведучий', exact).waitFor();
  expect(await stage.locator('.stage-sounds-unlock, .stage-sounds-toggle').count(), 'sound buttons under the host switch').toBe(0);
  await answer40(olya, 'Говерла');
  await answer40(petro, 'Петрос');
  await reveal28a(host);
  await stage.locator('.stage-sounds-off').waitFor();
  await quiet40(stage, ['accent'], 1500, 'a reveal with the host switch off');
  await shot(stage, 'sounds40-host-off');
  await host.setViewportSize({ width: 360, height: 740 });
  await expectHostSwitchFits40(host, 'sounds40-host-off-360');
  await host.setViewportSize({ width: 1280, height: 900 });

  // ── Перезапуск сервера: вимикач ведучого лишається вимкненим (soundsOff у кадрах сцени після перезапуску). ──
  const beforeRestart = stageFrames.length;
  await restart40(host, stage, phones);
  await expect.poll(() => stageFrames.slice(beforeRestart).some((f) => f.startsWith('42["state"') && f.includes('"soundsOff":true')), POLL).toBe(true);
  await expect.poll(() => hostSwitch40(host).getAttribute('aria-pressed'), POLL).toBe('false');
  await stage.locator('.stage-sounds-off').waitFor();
  await quiet40(stage, ['accent'], 1000, 'a restart with the host switch off');
  // Сцену перезавантажили, поки ведучий вимкнув звуки: «Увімкнути звуки» не з'являється.
  await stage.reload();
  await stage.locator('.stage-sounds-off').getByText('Звуки вимкнув ведучий', exact).waitFor();
  expect(await stage.locator('.stage-sounds-unlock, .stage-sounds-toggle').count(), 'sound buttons after a reload under the host switch').toBe(0);

  // ── Ведучий вмикає: кнопка розблокування повертається; a2 (обидва «Так», правильно «Ні») → «бу-у» рівно раз. ──
  await hostSwitch40(host).click();
  await expect.poll(() => hostSwitch40(host).getAttribute('aria-pressed'), POLL).toBe('true');
  await unlock40(stage);
  await quiet40(stage, [], 1000, 'the a1 reveal caught up after the host switch');
  await step27a(host, 'Далі');
  await olya.locator('h1', { hasText: 'Чи впадає Дніпро в Балтійське море?' }).waitFor();
  await answer40(olya, 'Так');
  await answer40(petro, 'Так');
  await reveal28a(host);
  await heard40(stage, 'wrong', 1);
  await quiet40(stage, ['wrong'], 1500, 'the a2 reveal');

  // ── Вимикач сцени: «🔔 Звуки» → aria-pressed false, localStorage 'off'; переживає перезавантаження; a3 мовчить. ──
  await toggleButton40(stage).click();
  await expect.poll(() => toggleButton40(stage).getAttribute('aria-pressed'), POLL).toBe('false');
  expect(await stage.evaluate("localStorage.getItem('quiz:stage-sounds')")).toBe('off');
  await stage.reload();
  await toggleButton40(stage).waitFor();
  await expect.poll(() => toggleButton40(stage).getAttribute('aria-pressed'), POLL).toBe('false');
  expect(await unlockButton40(stage).count(), 'the unlock button with the device switch off').toBe(0);
  await step27a(host, 'Далі');
  await olya.locator('h1', { hasText: 'Столиця Франції?' }).waitFor();
  await answer40(olya, 'Париж');
  await answer40(petro, 'Париж');
  await reveal28a(host);
  await stage.locator('h1', { hasText: 'Столиця Франції?' }).waitFor();
  await quiet40(stage, [], 1500, 'a reveal with the stage switch off');

  // ── Увімкнули кліком (він і розблоковує): a3 не наздоганяє, наступне розкриття звучить. ──
  await toggleButton40(stage).click();
  await expect.poll(() => toggleButton40(stage).getAttribute('aria-pressed'), POLL).toBe('true');
  expect(await stage.evaluate("localStorage.getItem('quiz:stage-sounds')")).toBeNull();
  await quiet40(stage, [], 1000, 'the a3 reveal caught up after the stage switch');
  await step27a(host, 'Далі');
  await olya.locator('h1', { hasText: 'Чи є Тихий океан найбільшим на Землі?' }).waitFor();
  await answer40(olya, 'Так');
  await answer40(petro, 'Ні');
  await reveal28a(host);
  await heard40(stage, 'correct', 1);
  await quiet40(stage, ['correct'], 1500, 'the a4 reveal');

  // ── Повтор: перезапуск на розкритті (пауза, той самий етап) і обрив сокета сцени — звуків стільки ж. ──
  await restart40(host, stage, phones);
  await stage.locator('h1', { hasText: 'Чи є Тихий океан найбільшим на Землі?' }).waitFor();
  await quiet40(stage, ['correct'], 2000, 'a restart on the reveal');
  const connections = stageSocket.connections;
  stageSocket.closeCurrent();
  await expect.poll(() => stageSocket.connections, { timeout: 15_000 }).toBeGreaterThan(connections);
  await stage.locator('h1', { hasText: 'Чи є Тихий океан найбільшим на Землі?' }).waitFor();
  await quiet40(stage, ['correct'], 2000, 'a reconnect on the reveal');
  console.log(`part 40: the stage socket connected ${stageSocket.connections} times`);

  await expectSilent40([['Оля', olya], ['Петро', petro], ['host', host]]);
  expect(problems).toEqual([]);
}

/** Автопілот: вимикача ведучого немає (soundsOff у кадрах сцени ніколи), акцент, акорд, «бу-у» і фанфари — кожен рівно раз. */
async function autopilot40(sockets: Socket[]) {
  const author = await open40('author40a', 1280, 900);
  await register(author, 'menu', 'Марта', 'author40a@example.com');
  const b1 = bool40('b1', 'Чи є Говерла найвищою горою України?', true);
  const b2 = single40('b2', 'Яке море омиває Одесу?', ['Чорне', 'Азовське', 'Балтійське']);
  const data = { ...makeRoundsQuiz([classicRound('r1', [b1, b2], { title: 'Автопілот', speedBonus: false })], { leaderboard: 'end' }), title: 'Звуки 40 автопілот' };
  const saved = await author.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await (await author.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[]).find((entry) => entry.title === 'Звуки 40 автопілот')!.id;
  const room = await createAutopilot(author, quizId);
  const marta = await pilotSocket(sockets, room.code, room.token, 'Марта');
  const vira = await pilotPlayer(sockets, room.code, 'Віра');
  const everyone: Pilot[] = [marta, vira];
  const stage = await open40('stage40a', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(`${base}/stage/${room.code}#${room.stageToken}`);
  await stage.getByText('Віра').waitFor();
  await unlock40(stage);
  expect(await marta.emit('host:start')).toEqual({ ok: true });

  // b1: обидва правильно → акорд; b2: обидва неправильно → «бу-у».
  const q1 = await frame(vira, (v) => v.phase === 'question');
  for (const player of everyone) await emitOk(player, 'player:answer', { type: 'boolean', value: true });
  const r1 = await frame(vira, (v) => v.phase === 'reveal', q1.index);
  const q2 = await frame(vira, (v) => v.phase === 'question', r1.index);
  for (const player of everyone) await emitOk(player, 'player:answer', { type: 'single', optionId: 'b2-1' });
  await frame(vira, (v) => v.phase === 'finished', q2.index, 120_000);
  await heard40(stage, 'fanfare', 1);
  await quiet40(stage, ['accent', 'correct', 'wrong', 'fanfare'], 2000, 'the autopilot game on the stage');
  expect(stageFrames.some((f) => f.includes('"soundsOff"')), 'soundsOff in an autopilot room').toBe(false);
  expect(await stage.locator('.stage-sounds-off').count(), 'the host-off note in an autopilot room').toBe(0);
  expect(problems).toEqual([]);
}

// ——— 3. Блеф: гонг на кінці кожного етапу ———

async function bluff40() {
  const host = await open40('host40b', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host40b@example.com');
  const b1: Question = {
    ...common,
    id: 'b1',
    type: 'bluff',
    text: 'Найдовша річка, що тече лише Україною, — …',
    points: 1000,
    timeLimit: 25,
    choiceTime: 25,
    accepted: ['Південний Буг', 'Буг'],
    lies: ['Сула', 'Псел', 'Рось'],
  };
  const data = { ...makeRoundsQuiz([classicRound('r1', [b1], { title: 'Блеф', speedBonus: false })], { leaderboard: 'end' }), title: 'Звуки 40 блеф' };
  const { code, stage } = await room40(host, data, 'stage40b');
  const olya = await open40('olya40b', 360, 740);
  const petro = await open40('petro40b', 375, 812);
  const phones = [olya, petro];
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await stage.getByText('Петро').waitFor();
  await unlock40(stage);
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  const start = (await sounds40(stage)).length;

  // ── Вигадки: Оля пише, Петро ні; «−15 с» → час вигадок спливає: п'ять цокань і гонг. ──
  await stage.getByText('Вигадайте відповідь на телефоні', exact).waitFor();
  await writeLie(olya, 'Десна');
  await olya.getByText('Твоя вигадка: «Десна»', { exact: false }).waitFor();
  await click(host, '−15 с');
  await stage.getByText('Що з цього правда?', exact).waitFor({ timeout: 30_000 });
  await heard40(stage, 'gong', 1);
  const lies = (await sounds40(stage)).slice(start);
  console.log(`part 40: bluff lies stage — ${JSON.stringify(lies)}`);
  expect(lies, 'the lies stage').toEqual(['tick', 'tick', 'tick', 'tick', 'tick', 'gong']);

  // ── Вибір: ніхто не вибирає; «−15 с» → час вибору спливає: ще п'ять цокань і другий гонг. ──
  await click(host, '−15 с');
  await host.getByText('Запитання закрите').waitFor({ timeout: 30_000 });
  await heard40(stage, 'gong', 2);
  await reveal28a(host);
  await sleep(2000);
  const all = (await sounds40(stage)).slice(start);
  console.log(`part 40: bluff whole question — ${JSON.stringify(all)}`);
  expect(all.slice(0, 12), 'two stage timers').toEqual(['tick', 'tick', 'tick', 'tick', 'tick', 'gong', 'tick', 'tick', 'tick', 'tick', 'tick', 'gong']);
  expect(all.length - 12, 'one reveal sound after the two gongs').toBeLessThanOrEqual(1);
  await expectSilent40([['Оля', olya], ['Петро', petro], ['host', host]]);
  expect(problems).toEqual([]);
}

// ——— 4. Кут сцени 1280×720 і шапка пульта 360 px ———

/** 24 імені без російського; найдовші — 20 символів (межа ніка). */
const NAMES40 = [
  'Анастасія Литвиненко', 'Святослав Гончаренко', 'Олександра Петренко', 'Богдана Коваленко', 'Ярослав Шевченко', 'Мирослава Бондар',
  'Владислав Ткаченко', 'Анастасія Мельник', 'Станіслав Лисенко', 'Катерина Руденко', 'Остап Марченко', 'Соломія Савченко',
  'Тарас Гончаренко', 'Ірина Кузьменко', 'Максим Литвиненко', 'Вероніка Захарчук', 'Назар Поліщук', 'Злата Тимошенко',
  'Дмитро Павленко', 'Олена Кириленко', 'Роман Мороз', 'Оксана Бойко', 'Левко Гнатюк', 'Дарина Ковальчук',
];

/**
 * Кут сцени: кожна кнопка кута в межах вікна, кнопки кута не налазять одна на одну, жодна не перетинає .stage-main,
 * таймер і смугу реакцій (прямокутники getBoundingClientRect).
 */
async function expectCorner40(stage: Page, name: string, strip: boolean) {
  const report = (await stage.evaluate(`(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const hit = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
    const corner = [...document.querySelectorAll('.stage-speech-buttons > *')].filter((el) => el.getBoundingClientRect().width > 0);
    const sound = document.querySelector('.stage-sounds-unlock, .stage-sounds-toggle');
    const out = corner.filter((el) => { const r = box(el); return r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1; }).map((el) => el.className);
    const pairs = [];
    for (let i = 0; i < corner.length; i++) for (let j = i + 1; j < corner.length; j++) if (hit(box(corner[i]), box(corner[j]))) pairs.push(corner[i].className + ' × ' + corner[j].className);
    const others = [...document.querySelectorAll('.stage-main, .stage-main > *, .stage-clock, .reaction-strip')].filter((el) => el.getBoundingClientRect().width > 0);
    const covered = [];
    for (const el of corner) for (const other of others) if (hit(box(el), box(other))) covered.push(el.className + ' over ' + other.className);
    // Лише для журналу: текст сцени поза .stage-main (рядок фактів розкриття), під яким опинився кут. Кут з «Читати вголос»
    // стоїть над смугою реакцій у нижньому запасі сцени (рішення 13a: запас — більше з двох, а не сума), тож останній рядок розкриття
    // на 1280×720 міг опинитися під ним і до 40.
    const texts = [...document.querySelectorAll('main *')].filter((el) => !el.closest('.stage-speech, .reaction-strip') && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== ''));
    const underText = [];
    for (const el of corner) for (const text of texts) if (hit(box(el), box(text))) underText.push(el.className + ' over «' + text.textContent.trim().slice(0, 40) + '»');
    return { sound: sound === null ? null : { cls: sound.className, ...box(sound) }, corner: corner.map((el) => el.className), others: others.map((el) => el.className + ' ' + Math.round(box(el).left) + ',' + Math.round(box(el).top) + '..' + Math.round(box(el).right) + ',' + Math.round(box(el).bottom)), out, pairs, covered, underText };
  })()`)) as { sound: { cls: string; left: number; top: number; right: number; bottom: number } | null; corner: string[]; others: string[]; out: string[]; pairs: string[]; covered: string[]; underText: string[] };
  const s = report.sound;
  console.log(`part 40: ${name} — sound ${s === null ? 'none' : `${s.cls} ${Math.round(s.left)},${Math.round(s.top)}..${Math.round(s.right)},${Math.round(s.bottom)}`}; corner [${report.corner.join(' | ')}]; others [${report.others.join(' | ')}]`);
  if (report.underText.length > 0) console.log(`part 40: ${name} — corner over stage text (known, see the report): ${report.underText.join(' | ')}`);
  expect(s, `${name}: no sound button in the corner`).not.toBeNull();
  expect(report.others.some((o) => o.startsWith('reaction-strip')), `${name}: the reaction strip`).toBe(strip);
  expect(report.out, `${name}: corner buttons outside the window`).toEqual([]);
  expect(report.pairs, `${name}: corner buttons over each other`).toEqual([]);
  expect(report.covered, `${name}: corner buttons over the stage content`).toEqual([]);
}

/**
 * Контраст тексту з його справжнім тлом: альфи фонів предків змішано через canvas, а opacity елемента й предків
 * (приглушена кнопка) змішує і текст, і тло кнопки з тим, що під ними. Відношення яскравостей WCAG.
 */
async function contrast40(scope: Locator): Promise<{ color: string; background: string; ratio: number; opacity: number }> {
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
    const over = (top: readonly number[], a: number, under: number[]) => [0, 1, 2].map((i) => top[i]! * a + under[i]! * (1 - a));
    // Тло під елементом: фони предків (без самого елемента), знизу — біле.
    const ancestors: Element[] = [];
    for (let node = el.parentElement; node !== null; node = node.parentElement) ancestors.push(node);
    let behind = [255, 255, 255];
    for (const node of ancestors.reverse()) {
      const [r, g, b, a] = rgba(getComputedStyle(node).backgroundColor);
      behind = over([r, g, b], a, behind);
    }
    let opacity = 1;
    for (let node: Element | null = el; node !== null; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    const [br, bg, bb, ba] = rgba(getComputedStyle(el).backgroundColor);
    const ownBg = over([br, bg, bb], ba, behind);
    const [fr, fg, fb, fa] = rgba(getComputedStyle(el).color);
    const ownFore = over([fr, fg, fb], fa, ownBg);
    const back = over(ownBg, opacity, behind);
    const fore = over(ownFore, opacity, behind);
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [hi, lo] = [lum(fore), lum(back)].sort((x, y) => y - x);
    return { color: `rgb(${fore.map(Math.round).join(', ')})`, background: `rgb(${back.map(Math.round).join(', ')})`, ratio: (hi! + 0.05) / (lo! + 0.05), opacity };
  });
}

async function expectReadable40(scope: Locator, name: string) {
  const { color, background, ratio, opacity } = await contrast40(scope);
  console.log(`part 40: ${name} — ${color} on ${background} (opacity ${opacity.toFixed(2)}), contrast ${ratio.toFixed(2)}`);
  expect(ratio, `${name}: contrast ${color} on ${background}`).toBeGreaterThanOrEqual(3);
}

/** Тема пристрою: light — quiz:theme = light; dark — ключа немає. Перезавантаження: сцена повертається за токеном. */
async function theme40(page: Page, mode: 'light' | 'dark') {
  await page.evaluate((wanted) => (wanted === 'light' ? localStorage.setItem('quiz:theme', 'light') : localStorage.removeItem('quiz:theme')), mode);
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('is-light')), POLL).toBe(mode === 'light');
}

/** Tab, доки фокус не стане на selector (до 15 натискань); фокус видно (:focus-visible). */
async function tabTo40(stage: Page, selector: string, name: string) {
  const trail: string[] = [];
  for (let presses = 0; presses < 15; presses++) {
    await stage.keyboard.press('Tab');
    trail.push((await stage.evaluate(`(document.activeElement?.tagName ?? '') + '.' + (document.activeElement?.className ?? '') + ' ' + (document.activeElement?.textContent ?? '').trim().slice(0, 20)`)) as string);
    if ((await stage.evaluate(`document.activeElement?.matches(${JSON.stringify(selector)}) ?? false`)) as boolean) break;
  }
  expect(await stage.evaluate(`document.activeElement?.matches(${JSON.stringify(selector)}) ?? false`), `${name}: Tab never reached ${selector}: ${trail.join(' → ')}`).toBe(true);
  expect(await stage.evaluate(`document.activeElement.matches(':focus-visible')`), `${name}: the focus is not visible`).toBe(true);
}

async function corner40(sockets: Socket[]) {
  const host = await open40('host40c', 1280, 900);
  await register(host, 'host', 'Віра Ведуча', 'host40c@example.com');
  const q1 = single40('c1', 'Яка річка тече через Київ?', ['Дніпро', 'Десна', 'Рось', 'Сула'], 120);
  const data = { ...makeRoundsQuiz([classicRound('r1', [q1], { title: 'Кут', speedBonus: false })], { leaderboard: 'end' }), title: 'Звуки 40 кут' };
  const { code, stage } = await room40(host, data, 'stage40c');
  const pilots: Pilot[] = [];
  for (const nickname of NAMES40) pilots.push(await pilotPlayer(sockets, code, nickname));
  await stage.getByText(NAMES40[23]!).waitFor();

  // ── Пульт 360 px у лобі: 🔔 у шапці, без бокового скролу. ──
  await host.setViewportSize({ width: 360, height: 740 });
  await expectHostSwitchFits40(host, 'sounds40-host-360-lobby');

  await click(host, 'Почати гру');
  await afterSplash(host, stage);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage);
  await stage.locator('h1', { hasText: 'Яка річка тече через Київ?' }).waitFor();
  for (const [at, pilot] of pilots.entries()) if (at % 2 === 0) await emitOk(pilot, 'player:answer', { type: 'single', optionId: 'c1-0' });
  await expectHostSwitchFits40(host, 'sounds40-host-360');

  // ── Запитання (реакцій на запитанні немає — REACTION_PHASES): кнопка розблокування не налазить на запитання й таймер. ──
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await unlockButton40(stage).waitFor();
  await expectCorner40(stage, 'dark question unlock 1280×720', false);
  await shot(stage, 'sounds40-24-stage');
  await expectReadable40(unlockButton40(stage), 'dark unlock button');

  // ── Розкриття з реакціями: кут і смуга реакцій разом; пульт 360 px з «↶ Бали» і реакцією в шапці. ──
  for (const [at, pilot] of pilots.entries()) if (at % 2 === 1) await emitOk(pilot, 'player:answer', { type: 'single', optionId: 'c1-1' });
  await reveal28a(host);
  for (const pilot of pilots.slice(0, 6)) await pilot.emit('player:react', { kind: 'emoji', value: '👏' });
  await stage.locator('.reaction-strip').waitFor();
  await expectHostSwitchFits40(host, 'sounds40-host-360-reveal');
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectCorner40(stage, 'dark reveal unlock 1280×720', true);
  await shot(stage, 'sounds40-24-reveal-stage');
  await unlock40(stage);
  await expectCorner40(stage, 'dark reveal toggle 1280×720', true);
  await shot(stage, 'sounds40-24-toggle-stage');

  // ── Світла тема (перезавантаження: звук знову заблоковано): кнопка розблокування читається, з фокусом — яскрава. ──
  await theme40(stage, 'light');
  await stage.locator('h1', { hasText: 'Яка річка тече через Київ?' }).waitFor();
  for (const pilot of pilots.slice(6, 12)) await pilot.emit('player:react', { kind: 'emoji', value: '😂' });
  await stage.locator('.reaction-strip').waitFor();
  await unlockButton40(stage).waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectCorner40(stage, 'light unlock 1280×720', true);
  await expectReadable40(unlockButton40(stage), 'light unlock button');
  await shot(stage, 'sounds40-light-stage');
  // Фокус (пульт ТВ): кнопка повністю яскрава. Програмний фокус — бо будь-яка клавіша сама розблоковує звук.
  await unlockButton40(stage).focus();
  await expect.poll(() => unlockButton40(stage).evaluate((el) => getComputedStyle(el).opacity), POLL).toBe('1');
  await expectReadable40(unlockButton40(stage), 'light focused unlock button');
  await shot(stage, 'sounds40-light-focus-stage');
  // Клавіша Tab — жест: перше ж натискання розблоковує звук, і замість кнопки в куті перемикач; Tab з початку сторінки
  // доходить до нього з видимим фокусом. (Фокус знято: кнопка, на якій він стояв, зникає з першим натисканням.)
  await stage.evaluate('document.activeElement?.blur()');
  await tabTo40(stage, '.stage-sounds-toggle', 'light toggle');
  await expect.poll(() => toggleButton40(stage).getAttribute('aria-pressed'), POLL).toBe('true');
  expect(await unlockButton40(stage).count(), 'the unlock button after a key press').toBe(0);
  await expectCorner40(stage, 'light toggle 1280×720', true);
  await expectReadable40(toggleButton40(stage), 'light toggle');
  await shot(stage, 'sounds40-light-toggle-stage');
  await theme40(stage, 'dark');
  expect(problems).toEqual([]);
}

/** Пульт: кнопка 🔔 «Звуки на сцені» в межах шапки й екрана, сторінка без бокового скролу. */
async function expectHostSwitchFits40(host: Page, name: string) {
  const button = hostSwitch40(host);
  await button.waitFor();
  const box = (await button.boundingBox())!;
  const width = host.viewportSize()!.width;
  console.log(`part 40: ${name} — 🔔 ${Math.round(box.width)}×${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)} of ${width}`);
  const wide = (await host.evaluate(
    `[...document.querySelectorAll('body *')].filter((el) => !el.closest('.reaction-strip') && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((el) => el.tagName + '.' + el.className + ' ' + Math.round(el.getBoundingClientRect().left) + '..' + Math.round(el.getBoundingClientRect().right))`,
  )) as string[];
  if (wide.length > 0) console.log(`part 40: ${name} — wider than the screen: ${wide.join(' | ')}`);
  expect(await host.evaluate(HEADER_ONE_LINE),`${name}: the host header is not one line inside the screen`).toBe(true);
  expect(box.x, `${name}: 🔔 left of the screen`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${name}: 🔔 past the right edge`).toBeLessThanOrEqual(width + 1);
  await expectNoSideScroll(host, name);
}
