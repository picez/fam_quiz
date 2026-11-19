import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeRoundsQuiz, think, thinkRound } from '@quiz/engine/testing';
import { type PlayerView, type ThinkWord } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { ukMessages } from '../../web/src/i18n';
import { open, click, join, openRoundSettings, bodyText, register, POLL, pilotSocket, pilotPlayer, frame, emitOk, createAutopilot, pickTeamOn, step27a, reveal28a, writeWord35, hearts35, type Pilot } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, noSplashLayer, ARTIFACTS, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 51 — раунд «Думай інакше»: «не на тему» (позначка ведучого й голосування автопілота).
 * Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

const scenario = (run: (sockets: Socket[]) => Promise<void>) => async () => {
  const sockets: Socket[] = [];
  try {
    await run(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
  expect(problems).toEqual([]);
};

it('part 51: the host marks an off-topic answer and takes it back, the stage and phones update, the match and off-topic cost one life', scenario(hostOff51), 600_000);
it('part 51: autopilot — the players vote off-topic by majority, the ballot is anonymous, a tie stays on topic, phone 360 px, light theme', scenario(autopilotVote51), 600_000);
it('part 51: autopilot — two players get no vote, the vote switched off in the editor gets none either', scenario(noVote51), 600_000);
it('part 51: autopilot in teams — captains vote for teams', scenario(teamsVote51), 600_000);

const words51 = (...list: [string, ...string[]][]): ThinkWord[] => list.map(([word, ...synonyms]) => ({ word, synonyms }));

/** Три запитання, таймер 30 с: слова ведучого «червоний», «яблуко», «зима». */
const questions51 = () => [
  think('q1', words51(['червоний']), { text: 'Напишіть колір веселки', timeLimit: 30 }),
  think('q2', words51(['яблуко']), { text: 'Напишіть фрукт', timeLimit: 30 }),
  think('q3', words51(['зима']), { text: 'Напишіть пору року', timeLimit: 30 }),
];

/** Сторінка зі світлою темою пристрою. */
async function openLight(name: string, width: number, height: number): Promise<Page> {
  const page = await open(name, width, height);
  await page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  return page;
}

/** Кадр лише області перегляду (не всієї сторінки), світла тема. */
async function vshot(page: Page, name: string) {
  expect(await page.evaluate(() => document.documentElement.classList.contains('is-light')), `${name}: light theme`).toBe(true);
  if (process.env.E2E_SHOTS !== '1') return;
  await noSplashLayer(page);
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`), fullPage: false });
}

const noSideScroll51 = async (page: Page, name: string) => expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), `${name}: horizontal scroll`).toBe(true);

const revealRow51 = (page: Page, nickname: string) => page.locator('.think-reveal-row', { has: page.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) });
const hostRow51 = (host: Page, nickname: string) => host.locator('.think-host-answers .think-answer', { has: host.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) });

async function startGame51(host: Page, stage: Page, phones: Page[]) {
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
}

async function hostOff51(_sockets: Socket[]) {
  const host = await openLight('host51', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host51@example.com');
  const round = thinkRound('th51', questions51(), { lives: 2, points: 1000 });
  const data = { ...makeRoundsQuiz([round], { leaderboard: 'end' }), title: 'Не на тему 51' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Не на тему 51' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await openLight('stage51', 1280, 720);
  await stage.goto(stageUrl);
  const olya = await openLight('olya51', 375, 812);
  const petro = await openLight('petro51', 360, 800);
  const vira = await openLight('vira51', 375, 812);
  const phones = [olya, petro, vira];
  await join(olya, code, 'Оля', false);
  await join(petro, code, 'Петро', false);
  await join(vira, code, 'Віра', false);
  await stage.getByText('Віра').waitFor();
  await startGame51(host, stage, phones);

  await stage.locator('.think-stage h1').getByText('Напишіть колір веселки', exact).waitFor();
  await writeWord35(olya, 'синій');
  await writeWord35(petro, 'банан');
  await writeWord35(vira, 'червоний');
  await reveal28a(host);
  await stage.locator('.think-reveal.is-big').waitFor();
  // Збіг Віри: −1 ❤️ (було 2). Петро й Оля — в безпеці.
  await olya.locator('.think-verdict').getByText('Ви в безпеці', exact).waitFor();
  await vira.locator('.think-verdict').getByText('Збіг: −1 ❤️', exact).waitFor();
  expect([await hearts35(olya), await hearts35(petro), await hearts35(vira)]).toEqual([2, 2, 1]);
  expect(await revealRow51(stage, 'Петро').locator('.think-off').count(), 'no off tag before the mark').toBe(0);

  // «Не на тему» біля «банан»: сцена й телефон Петра — тег, ❤️ гасне.
  const petroMark = hostRow51(host, 'Петро').getByRole('button', { name: 'Не на тему: Петро', ...exact });
  await petroMark.click();
  await expect.poll(() => revealRow51(stage, 'Петро').getAttribute('class'), POLL).toContain('is-off');
  expect(await revealRow51(stage, 'Петро').locator('.think-off').textContent(), 'the stage tag').toBe(ukMessages.thinkOffTag);
  expect(await revealRow51(stage, 'Петро').locator('.think-heart.is-lost').count(), 'the stage heart goes out').toBe(1);
  await petro.locator('.think-verdict').getByText(ukMessages.thinkVerdictOff, exact).waitFor();
  await expect.poll(() => hearts35(petro), POLL).toBe(1);
  expect(await revealRow51(petro, 'Петро').locator('.think-off').textContent(), 'the phone tag').toBe(ukMessages.thinkOffTag);
  expect(await hostRow51(host, 'Петро').locator('.think-off').textContent(), 'the host tag').toBe(ukMessages.thinkOffTag);

  // «Зняти «не на тему»»: ❤️ повертається.
  await hostRow51(host, 'Петро').getByRole('button', { name: `${ukMessages.thinkHostUnmarkOff}: Петро`, ...exact }).click();
  await expect.poll(() => hearts35(petro), POLL).toBe(2);
  await petro.locator('.think-verdict').getByText('Ви в безпеці', exact).waitFor();
  expect(await revealRow51(stage, 'Петро').getAttribute('class')).not.toContain('is-off');
  expect(await revealRow51(stage, 'Петро').locator('.think-off').count()).toBe(0);
  await expect.poll(() => hostRow51(host, 'Петро').locator('.think-off').count(), POLL).toBe(0);

  // Знову позначити; Вірі (збіг) «Не на тему» — у неї −1, не −2: серце лишається одне, вона не вибуває.
  await hostRow51(host, 'Петро').getByRole('button', { name: 'Не на тему: Петро', ...exact }).click();
  await expect.poll(() => hearts35(petro), POLL).toBe(1);
  await hostRow51(host, 'Віра').getByRole('button', { name: 'Не на тему: Віра', ...exact }).click();
  await expect.poll(() => revealRow51(stage, 'Віра').getAttribute('class'), POLL).toContain('is-off');
  await expect.poll(() => revealRow51(vira, 'Віра').locator('.think-off').count(), POLL).toBe(1);
  expect(await hearts35(vira), 'a match plus off-topic is one life').toBe(1);
  expect(await vira.getByText(ukMessages.thinkOutNow, exact).count(), 'Віра is not out').toBe(0);
  expect(await revealRow51(stage, 'Віра').locator('.think-heart.is-lost').count()).toBe(1);

  // Кадри: пульт (360 px) і телефон Петра.
  await vshot(stage, 'think51-stage-off-light');
  await host.setViewportSize({ width: 360, height: 900 });
  await hostRow51(host, 'Петро').scrollIntoViewIfNeeded();
  await noSideScroll51(host, 'host panel 360');
  await vshot(host, 'think51-host-off-light');
  await host.setViewportSize({ width: 1280, height: 900 });
  await noSideScroll51(petro, 'phone off tag 360');
  await vshot(petro, 'think51-phone-off-light-360');
}

/** Гравець-сокет бачить кадри; ключ відповіді в бюлетені — за текстом. */
const voteKey51 = (view: PlayerView, text: string): string => {
  const entry = view.me.think?.vote?.entries.find((e) => e.text === text);
  if (entry === undefined) throw new Error(`no «${text}» in the ballot`);
  return entry.key;
};

/** Кадри від початку етапу голосування до розкриття (не включно): жоден не пов'язує відповіді з авторами. */
function expectAnonymous51(player: Pilot, from: number, until: number, hidden: string[], label: string) {
  const window = player.frames.slice(from, until);
  expect(window.length, `${label}: vote frames`).toBeGreaterThan(0);
  for (const { view } of window) {
    const info = view.think!;
    expect(info.rows.every((row) => row.answer === null), `${label}: a row answer during the vote`).toBe(true);
    expect(info.rows.every((row) => row.off === null), `${label}: an off mark during the vote`).toBe(true);
    for (const entry of [...(info.vote?.entries ?? []), ...(view.me.think?.vote?.entries ?? [])]) expect(Object.keys(entry).sort(), `${label}: ballot entry fields`).toEqual(['key', 'text']);
    const rest = JSON.stringify({ think: { ...info, vote: null }, me: { ...view.me, think: view.me.think === undefined ? null : { ...view.me.think, vote: null } } });
    for (const text of hidden) expect(rest, `${label}: «${text}» outside the ballot`).not.toContain(`"${text}"`);
    // Бюлетень сам не несе чужих ключів-авторів: лише {key, text}; кількостей позначок немає.
    expect(JSON.stringify(info.vote ?? {})).not.toMatch(/marks|count|votes/);
  }
}

async function autopilotVote51(sockets: Socket[]) {
  const author = await openLight('author51', 375, 812);
  await register(author, 'host', 'Марта Авторка', 'author51@example.com');
  const data = { ...makeRoundsQuiz([thinkRound('th51', questions51(), { lives: 2, points: 1000 })], { leaderboard: 'end' }), title: 'Голосування 51' };
  const saved = await author.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const room = await createAutopilot(author, ((await saved.json()) as { id: string }).id);
  const { code } = room;
  const marta = await pilotSocket(sockets, code, room.token, 'Марта');
  const olya = await pilotPlayer(sockets, code, 'Оля');
  const vira = await pilotPlayer(sockets, code, 'Віра');
  const ihor = await pilotPlayer(sockets, code, 'Ігор');
  const marko = await pilotPlayer(sockets, code, 'Марко');
  const petro = await openLight('petro51a', 360, 800);
  await join(petro, code, 'Петро', false);
  const stage = await openLight('stage51a', 1280, 720);
  await stage.goto(`${base}/stage/${code}#${room.stageToken}`);
  await stage.getByText('Петро').waitFor();
  expect(await marta.emit('host:start')).toEqual({ ok: true });
  const socketPlayers = [olya, vira, ihor, marko];

  /** Запитання: відповіді (нік → слово), хто в яких голосує. */
  const play = async (text: string, answers: Record<string, string>) => {
    for (const player of socketPlayers) await frame(player, (v) => v.phase === 'question' && v.question?.text === text);
    await petro.locator('.think-field').waitFor({ timeout: 60_000 });
    await writeWord35(petro, answers['Петро']!);
    for (const player of socketPlayers) await emitOk(player, 'player:answer', { type: 'think', value: answers[player.nickname]! });
    // Усі відповіли — етап голосування на сцені й телефонах.
    await stage.locator('.think-stage-vote').waitFor({ timeout: 30_000 });
    await petro.locator('.think-vote').waitFor();
    const starts = new Map<Pilot, number>();
    for (const player of socketPlayers) starts.set(player, (await frame(player, (v) => v.me.think?.vote != null && v.question?.text === text)).index);
    return starts;
  };
  /** Голос сокета: ключі за текстами в його бюлетені. */
  const vote = async (player: Pilot, ...texts: string[]) => {
    const view = [...player.frames].reverse().find((f) => f.view.me.think?.vote != null)!.view;
    await emitOk(player, 'player:think-vote', { keys: texts.map((text) => voteKey51(view, text)) });
  };
  const afterReveal = async (text: string, starts: Map<Pilot, number>, answers: Record<string, string>) => {
    for (const player of socketPlayers) {
      const at = (await frame(player, (v) => v.phase === 'reveal' && v.question?.text === text, starts.get(player))).index;
      expectAnonymous51(player, starts.get(player)!, at, Object.values(answers).filter((word) => word !== answers[player.nickname]), `${text}: ${player.nickname}`);
    }
  };

  // ── Запитання 1: Петро «банан» (не на тему); Оля, Віра, Ігор позначають — троє з чотирьох можливих. ──
  const answers1 = { Оля: 'синій', Петро: 'банан', Віра: 'жовтий', Ігор: 'зелений', Марко: 'фіолетовий' };
  const first = await play('Напишіть колір веселки', answers1);
  // Сцена: «Чи всі на тему?», відповіді без імен, нікого ще не проголосувало.
  await stage.locator('.think-vote-title').getByText(ukMessages.thinkVoteTitle, exact).waitFor();
  expect((await stage.locator('.think-stage-vote .think-vote-entry').allTextContents()).sort()).toEqual(['банан', 'жовтий', 'зелений', 'синій', 'фіолетовий']);
  await stage.locator('.think-vote-voted').getByText(ukMessages.thinkVoteNobody, exact).waitFor();
  for (const name of ['Оля', 'Петро', 'Віра', 'Ігор', 'Марко']) expect(await stage.locator('.think-stage-vote .think-vote-entry', { hasText: name }).count(), `a name «${name}» next to an answer`).toBe(0);
  // Телефон Петра: чужі відповіді, власної «банан» немає; перемикач тримає aria-pressed.
  expect((await petro.locator('.think-vote-toggle').allTextContents()).sort()).toEqual(['жовтий', 'зелений', 'синій', 'фіолетовий']);
  expect(await bodyText(petro), 'Петро’s own answer in his ballot').not.toContain('банан');
  const toggle = petro.locator('.think-vote-toggle', { hasText: 'синій' });
  await toggle.click();
  expect(await toggle.getAttribute('aria-pressed')).toBe('true');
  const done = petro.getByRole('button', { name: ukMessages.thinkVoteDone, ...exact });
  const doneBottom = (await done.boundingBox())!.y + (await done.boundingBox())!.height;
  expect(doneBottom, '«Done» in the 360 px viewport').toBeLessThanOrEqual(800);
  await noSideScroll51(petro, 'phone ballot 360');
  // Таймер етапу — 25 с голосування, а не 30 с запитання (телефон і сцена).
  await petro.locator('.timer-total', { hasText: '/ 25 с' }).waitFor();
  await stage.locator('.timer-total', { hasText: '/ 25 с' }).waitFor();
  await vshot(petro, 'think51-ballot-phone-light-360');
  await toggle.click();
  expect(await toggle.getAttribute('aria-pressed')).toBe('false');
  await vote(olya, 'банан');
  await vote(vira, 'банан');
  await vote(ihor, 'банан');
  await stage.locator('.think-vote-voted').getByText('Проголосували: Оля, Віра, Ігор', exact).waitFor();
  await vshot(stage, 'think51-ballot-stage');
  await vote(marko);
  await done.click();
  // Рання кінцівка: усі п'ятеро надіслали — розкриття; Петро «не на тему (голосування)», ❤️ менше.
  await stage.locator('.think-reveal.is-big').waitFor({ timeout: 30_000 });
  await afterReveal('Напишіть колір веселки', first, answers1);
  await expect.poll(() => revealRow51(stage, 'Петро').getAttribute('class'), POLL).toContain('is-off');
  expect(await revealRow51(stage, 'Петро').locator('.think-off').textContent()).toBe(ukMessages.thinkOffVoteTag);
  await petro.locator('.think-verdict').getByText(ukMessages.thinkVerdictOff, exact).waitFor();
  expect(await hearts35(petro), 'Петро loses a heart').toBe(1);
  expect(await revealRow51(stage, 'Оля').locator('.think-off').count(), 'only the majority answer is off').toBe(0);
  await vshot(petro, 'think51-vote-reveal-light');
  await vshot(stage, 'think51-vote-reveal-stage');

  // ── Запитання 2: «кавун» Ігоря — 2 з 4 позначили: нічия, на тему, ❤️ ціле. ──
  const answers2 = { Оля: 'груша', Петро: 'слива', Віра: 'ківі', Ігор: 'кавун', Марко: 'манго' };
  const second = await play('Напишіть фрукт', answers2);
  await vote(olya, 'кавун');
  await vote(vira, 'кавун');
  await vote(marko);
  await vote(ihor);
  await petro.getByRole('button', { name: ukMessages.thinkVoteDone, ...exact }).click();
  await stage.locator('.think-reveal.is-big').waitFor({ timeout: 30_000 });
  await afterReveal('Напишіть фрукт', second, answers2);
  expect(await revealRow51(stage, 'Ігор').locator('.think-off').count(), 'a tie stays on topic').toBe(0);
  expect(await revealRow51(stage, 'Ігор').locator('.think-heart.is-lost').count(), 'Ігор keeps his heart').toBe(0);
  const reveal = await frame(ihor, (v) => v.phase === 'reveal' && v.question?.text === 'Напишіть фрукт');
  expect(reveal.view.me.think).toMatchObject({ lives: 2, off: null });
  expect(await hearts35(petro), 'Петро is safe on question 2').toBe(1);
}

async function noVote51(sockets: Socket[]) {
  const author = await openLight('author51n', 1280, 900);
  await register(author, 'host', 'Марта Авторка', 'author51n@example.com');
  const post = async (title: string) => {
    const data = { ...makeRoundsQuiz([thinkRound('th51n', questions51(), { lives: 2, points: 1000 })], { leaderboard: 'end' }), title };
    const saved = await author.request.post(`${base}/api/quizzes`, { data });
    expect(saved.ok(), await saved.text()).toBe(true);
    return ((await saved.json()) as { id: string }).id;
  };
  const noVoteFrames = (players: Pilot[], label: string) => {
    for (const player of players) {
      expect(player.frames.some((f) => f.view.think?.vote != null), `${label}: a vote frame for ${player.nickname}`).toBe(false);
      expect(player.frames.some((f) => f.view.me.think?.vote != null), `${label}: a phone vote frame for ${player.nickname}`).toBe(false);
    }
  };

  // ── Двоє гравців (автор — глядач): після таймера одразу розкриття, етапу голосування немає. ──
  const twoId = await post('Двоє 51');
  const room2 = await createAutopilot(author, twoId);
  const marta2 = await pilotSocket(sockets, room2.code, room2.token, 'Марта');
  const vira = await pilotPlayer(sockets, room2.code, 'Віра');
  const petro = await pilotPlayer(sockets, room2.code, 'Петро');
  expect(await marta2.emit('host:start')).toEqual({ ok: true });
  await frame(vira, (v) => v.phase === 'question' && v.question?.text === 'Напишіть колір веселки');
  await emitOk(vira, 'player:answer', { type: 'think', value: 'банан' });
  // Петро мовчить: до кінця таймера (30 с) — і одразу розкриття.
  const shown = await frame(vira, (v) => v.phase === 'reveal' && v.question?.text === 'Напишіть колір веселки');
  expect(shown.view.think!.rows.find((row) => row.nickname === 'Віра')!.off, 'no off mark without a vote').toBeNull();
  noVoteFrames([marta2, vira, petro], 'two players');

  // ── Редактор: прапорець знімається (360 px, світла тема), вікторина зберігається з offtopicVote: false. ──
  const offId = await post('Вимкнене 51');
  await author.setViewportSize({ width: 360, height: 800 });
  await author.goto(`${base}/quizzes`);
  await author.locator('.quiz-list li', { hasText: 'Вимкнене 51' }).getByRole('link', { name: 'Редагувати' }).click();
  await author.locator('.round-tab').first().waitFor().catch(() => undefined);
  await openRoundSettings(author);
  const box = author.getByRole('checkbox', { name: ukMessages.thinkOffVoteSetting, ...exact });
  expect(await box.isChecked(), 'on by default').toBe(true);
  await box.scrollIntoViewIfNeeded();
  await vshot(author, 'think51-editor-on-light-360');
  await box.uncheck();
  expect(await box.isChecked()).toBe(false);
  await noSideScroll51(author, 'editor 360');
  await vshot(author, 'think51-editor-off-light-360');
  await click(author, 'Зберегти');
  await author.getByRole('heading', { name: 'Вимкнене 51' }).waitFor();
  const stored = (await (await author.request.get(`${base}/api/quizzes/${offId}`)).json()) as { rounds: { offtopicVote?: boolean }[] };
  expect(stored.rounds[0]!.offtopicVote, 'saved with the vote off').toBe(false);

  // ── Троє гравців, але голосування вимкнене: усі відповіли — одразу розкриття. ──
  const room3 = await createAutopilot(author, offId);
  const marta3 = await pilotSocket(sockets, room3.code, room3.token, 'Марта');
  const players = [await pilotPlayer(sockets, room3.code, 'Оля'), await pilotPlayer(sockets, room3.code, 'Віра'), await pilotPlayer(sockets, room3.code, 'Ігор')];
  expect(await marta3.emit('host:start')).toEqual({ ok: true });
  for (const [index, player] of players.entries()) {
    await frame(player, (v) => v.phase === 'question' && v.question?.text === 'Напишіть колір веселки');
    await emitOk(player, 'player:answer', { type: 'think', value: ['синій', 'банан', 'жовтий'][index]! });
  }
  for (const player of players) await frame(player, (v) => v.phase === 'reveal' && v.question?.text === 'Напишіть колір веселки');
  noVoteFrames([marta3, ...players], 'vote switched off');
}

async function teamsVote51(sockets: Socket[]) {
  const author = await openLight('author51t', 375, 812);
  await register(author, 'host', 'Марта Авторка', 'author51t@example.com');
  // Автор — глядач у власній команді «Жовті»; три команди по двоє грають, капітани відповідають і голосують.
  const quiz = makeRoundsQuiz([thinkRound('th51t', questions51(), { lives: 2, points: 1000 })], {
    leaderboard: 'end',
    newcomers: false,
    teams: { count: 4, names: ['Червоні', 'Сині', 'Зелені', 'Жовті'], answerer: 'captain' },
  });
  const saved = await author.request.post(`${base}/api/quizzes`, { data: { ...quiz, title: 'Команди 51' } });
  expect(saved.ok(), await saved.text()).toBe(true);
  const room = await createAutopilot(author, ((await saved.json()) as { id: string }).id);
  const { code } = room;
  const marta = await pilotSocket(sockets, code, room.token, 'Марта');
  // Оля — капітан Червоних (першою), Петро — її товариш; обоє — на телефонах 360 px.
  const olya = await openLight('olya51t', 360, 800);
  const petro = await openLight('petro51t', 360, 800);
  for (const [page, nickname] of [[olya, 'Оля'], [petro, 'Петро']] as const) {
    await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, 'Червоні');
  }
  const vira = await pilotPlayer(sockets, code, 'Віра');
  const ihor = await pilotPlayer(sockets, code, 'Ігор');
  const marko = await pilotPlayer(sockets, code, 'Марко');
  const nastya = await pilotPlayer(sockets, code, 'Настя');
  const lobby = await frame(vira, (v) => (v.teams?.teams.length ?? 0) === 4);
  const teamId = (name: string) => lobby.view.teams!.teams.find((team) => team.name === name)!.id;
  for (const [player, team] of [[vira, 'Сині'], [ihor, 'Сині'], [marko, 'Зелені'], [nastya, 'Зелені'], [marta, 'Жовті']] as const) await emitOk(player, 'player:team', { teamId: teamId(team) });
  expect(await marta.emit('host:start')).toEqual({ ok: true });

  const text = 'Напишіть колір веселки';
  for (const player of [vira, ihor, marko, nastya]) await frame(player, (v) => v.phase === 'question' && v.question?.text === text);
  await olya.locator('.think-field').waitFor({ timeout: 60_000 });
  await writeWord35(olya, 'синій');
  await emitOk(vira, 'player:answer', { type: 'think', value: 'жовтий' });
  await emitOk(marko, 'player:answer', { type: 'think', value: 'банан' });
  // Етап голосування: у капітана Червоних — бюлетень, у члена команди — «Голосує капітан команди».
  await olya.locator('.think-vote-toggle').first().waitFor({ timeout: 30_000 });
  expect((await olya.locator('.think-vote-toggle').allTextContents()).sort(), 'the captain’s ballot has no own team').toEqual(['банан', 'жовтий']);
  await petro.locator('.think-vote').getByText(ukMessages.thinkVoteCaptain, exact).waitFor();
  expect(await petro.locator('.think-vote-toggle').count(), 'buttons for a teammate').toBe(0);
  await noSideScroll51(petro, 'teammate 360');
  await vshot(petro, 'think51-team-member-light-360');
  const start = (await frame(marko, (v) => v.me.think?.vote != null)).index;
  // Голос не-капітана (Ігор, Сині) відхилено.
  const rejected = await ihor.emit('player:think-vote', { keys: [] });
  expect(rejected.ok, 'a non-captain vote').toBe(false);
  // Капітани Червоних і Синіх позначають відповідь Зелених; капітан Зелених підтверджує без позначок.
  await olya.locator('.think-vote-toggle', { hasText: 'банан' }).click();
  await olya.getByRole('button', { name: ukMessages.thinkVoteDone, ...exact }).click();
  await olya.locator('.think-vote-sent').getByText(ukMessages.thinkVoteSent, exact).waitFor();
  const viraView = [...vira.frames].reverse().find((f) => f.view.me.think?.vote != null)!.view;
  await emitOk(vira, 'player:think-vote', { keys: [voteKey51(viraView, 'банан')] });
  await emitOk(marko, 'player:think-vote', { keys: [] });
  const shown = await frame(marko, (v) => v.phase === 'reveal' && v.question?.text === text, start);
  expect(shown.view.me.think, 'the team of «банан» is off by the vote').toMatchObject({ off: 'vote', lives: 1 });
  await olya.locator('.think-reveal-row .think-off').getByText(ukMessages.thinkOffVoteTag, exact).waitFor();
  expect(await revealRow51(olya, 'Зелені').locator('.think-off').textContent()).toBe(ukMessages.thinkOffVoteTag);
  expect(await revealRow51(olya, 'Сині').locator('.think-off').count(), 'other teams stay on topic').toBe(0);
  await vshot(olya, 'think51-team-reveal-light-360');
}

