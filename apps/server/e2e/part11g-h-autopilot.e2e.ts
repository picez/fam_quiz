import { boardRound, classicRound, finalRound, ladderRound, makeRoundsQuiz, text as textQ, withId, withPoints } from '@quiz/engine/testing';
import { type StageView, type StateMeta } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, field, bodyText, expectPhoneFit, register, socketFrames, silentMp3, expectStageFits, expectStageInView, writeLie, pickBluff, sleep, EARLY, pilotSocket, type Pilot, pilotPlayer, frame, emitOk, expectGap, createAutopilot, stateViews, launchBot11h, joinBy11h, label } from './helpers/common';
import { exact, base, problems, rigged, snapshot, shot, restart, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 11g–11h: автопілот.
 * Виділено з full-game.e2e.ts (30b) без змін логіки. Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

/** Мить (час сервера) першого кадру з етапом phase з індексу from. */
function phaseAt(player: Pilot, phase: string, from = 0): number {
  const found = player.frames.find((f, i) => i >= from && f.view.phase === phase);
  if (found === undefined) throw new Error(`${player.nickname} has no ${phase} frame`);
  return found.at;
}

/** Кадри state сторінки сцени з часом сервера (через перепідключення теж). */
function stageTimeline(page: Page): { view: StageView; meta: StateMeta; at: number }[] {
  const list: { view: StageView; meta: StateMeta; at: number }[] = [];
  page.on('websocket', (socket) =>
    socket.on('framereceived', (data) => {
      const payload = String(data.payload);
      if (!payload.startsWith('42["state",')) return;
      try {
        const [, view, meta] = JSON.parse(payload.slice(2)) as [string, StageView, StateMeta];
        list.push({ view, meta, at: meta.serverNow });
      } catch {
        // Не кадр state.
      }
    }),
  );
  return list;
}

/** Жоден кадр не віддає пульт: ні ролі ведучого, ні відповідей наживо. */
function expectNoHostFrames(label: string, frames: string[]) {
  for (const text of frames) {
    for (const needle of ['"role":"host"', '"live":{', '"responses":[']) expect(text.includes(needle), `${label} got ${needle}`).toBe(false);
  }
}

async function autopilot11g(sockets: Socket[]) {
  const author = await open('author11g', 1280, 900);
  await register(author, 'host', 'Марта Авторка', 'author11g@example.com');

  const common = { imageUrl: null, video: null };
  const g1 = { ...common, id: 'g1', type: 'boolean' as const, text: 'Говерла — найвища гора України', points: 100, timeLimit: 20, correct: true };
  const g2 = { ...common, id: 'g2', type: 'wordcloud' as const, text: 'Одне слово про літо', points: 0, timeLimit: 20, words: 1 };
  // Блеф без балів: рахунок розминки лишається 100 у кожного.
  const g3 = {
    ...common,
    id: 'g3',
    type: 'bluff' as const,
    text: 'Ейфелеву вежу спершу пропонували поставити в …, але місто відмовилося.',
    points: 0,
    timeLimit: 60,
    choiceTime: 30,
    accepted: ['Барселона'],
    lies: ['Мадрид', 'Лондон', 'Брюссель'],
  };
  const answers = new Map<string, string>();
  const column = (title: string, rows: [string, string][]) => ({
    title,
    cells: rows.map(([question, answer], index) => {
      const id = `${title}-${(index + 1) * 100}`;
      answers.set(id, answer.toLowerCase());
      return { ...withPoints(withId(textQ, id), (index + 1) * 100), text: question, accepted: [answer] };
    }),
  });
  const description = 'Карпати — найбільший гірський масив України: верхи Чорногори, ліси з буків і смерек, полонини, швидкі потоки й десятки рідкісних птахів.';
  const rounds = [
    classicRound('r1', [g1, g2, g3] as never, { title: 'Розминка', description, speedBonus: false, shuffleOptions: false } as never),
    boardRound(
      'r2',
      [
        column('Річки', [['Яка річка тече через Київ?', 'Дніпро'], ['Яка річка тече через Ужгород?', 'Уж'], ['Яка річка тече через Вінницю?', 'Південний Буг']]),
        column('Гори', [['Яка найвища гора України?', 'Говерла'], ['Який гірський масив займає захід України?', 'Карпати'], ['Яка найвища гора Кримських гір?', 'Роман-Кош']]),
        column('Міста', [['Яке місто називають містом Лева?', 'Львів'], ['Яке місто — найбільший порт України на Чорному морі?', 'Одеса'], ['Яке місто стоїть на Дніпрі поруч із островом Хортиця?', 'Запоріжжя']]),
      ],
      { title: 'Поле', answerMode: 'voice', check: 'manual' },
    ),
    finalRound('r3', { ...withPoints(withId(textQ, 'f1'), 100), text: 'Яке місто — столиця України?', accepted: ['Київ'] } as never, { title: 'Фінал', check: 'manual', wagerMode: 'classic' }),
  ];
  const data = { ...makeRoundsQuiz(rounds as never, { leaderboard: 'end' }), title: 'Автопілот 11g' };
  const saved = await author.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // Сумісність: поле «вголос» і ручні перевірки поля й фіналу будуть змінені.
  const check = await author.request.get(`${base}/api/quizzes/${quizId}/autopilot`);
  expect(await check.json()).toEqual({
    blocked: [],
    changed: [
      { code: 'voice', rounds: [1] },
      { code: 'manual', rounds: [1, 2] },
    ],
  });

  // Кімната: токена ведучого немає, а сокет ролі host не підключається.
  const room = await createAutopilot(author, quizId);
  const { code } = room;
  const hostSocket = connectSocket(base, { auth: { code, role: 'host', token: 'x'.repeat(32) }, transports: ['websocket'], reconnection: false });
  sockets.push(hostSocket);
  await new Promise<void>((done, fail) => {
    hostSocket.once('connect', () => fail(new Error('a host socket connected to an autopilot room')));
    hostSocket.once('connect_error', () => done());
  });
  const marta = await pilotSocket(sockets, code, room.token, 'Марта');
  const vira = await pilotPlayer(sockets, code, 'Віра');
  const petro = await pilotPlayer(sockets, code, 'Петро');
  const everyone = [marta, vira, petro];

  const stage = await open('stage11g', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(`${base}/stage/${code}#${room.stageToken}`);
  await stage.getByText('Петро').waitFor();

  // 1. Не автор не починає гру, зайва дія автора відхилена, автор починає з телефона.
  expect(await vira.emit('host:start')).toEqual({ ok: false, error: 'not_allowed' });
  expect(await marta.emit('host:next')).toEqual({ ok: false, error: 'not_allowed' });
  expect(await marta.emit('host:start')).toEqual({ ok: true });

  // 2. Заставка раунду, потім опис (11 с) від кінця заставки, потім запитання.
  const intro = await frame(vira, (v) => v.phase === 'intro');
  const question1 = await frame(vira, (v) => v.phase === 'question', intro.index);
  const splashEnd = intro.view.splash?.kind === 'round' ? Math.max(intro.view.splash.until, intro.at) : intro.at;
  expectGap(question1.at - splashEnd, 11_000, 'intro to the first question', 2000);
  await stage.getByText('Говерла — найвища гора України', exact).waitFor();
  await shot(stage, 'p11g-stage-question');

  // 3. g1: усі «Так» → закрито → розкриття через 1,5 с → таблиці немає (leaderboard 'end'), g2 через 6 с.
  for (const player of everyone) await emitOk(player, 'player:answer', { type: 'boolean', value: true });
  const locked1 = await frame(vira, (v) => v.phase === 'locked', question1.index);
  const reveal1 = await frame(vira, (v) => v.phase === 'reveal', locked1.index);
  expectGap(reveal1.at - locked1.at, 1500, 'locked to reveal', 1000);
  const question2 = await frame(vira, (v) => v.phase === 'question', reveal1.index);
  expectGap(question2.at - reveal1.at, 6000, 'reveal to the next question');
  expect(vira.frames.slice(reveal1.index, question2.index).some((f) => f.view.phase === 'leaderboard'), 'no table between questions').toBe(false);

  // 4. «Хмара»: слова бачить лише автор; сховати слово може тільки він.
  await emitOk(vira, 'player:answer', { type: 'wordcloud', words: ['сонце'] });
  await emitOk(petro, 'player:answer', { type: 'wordcloud', words: ['сонце'] });
  await emitOk(marta, 'player:answer', { type: 'wordcloud', words: ['море'] });
  const cloud = await frame(marta, (v) => v.phase === 'reveal' && v.author?.cloud != null, question2.index);
  const words = cloud.view.author!.cloud!;
  expect(words.find((w) => w.key === 'сонце')).toMatchObject({ count: 2, hidden: false });
  expect(words.find((w) => w.key === 'море')).toMatchObject({ count: 1, hidden: false });
  const viraCloud = await frame(vira, (v) => v.phase === 'reveal', question2.index);
  expect(viraCloud.view.author, 'a plain player has no author view').toBeNull();
  expect(await vira.emit('host:cloud-hide', { key: 'море', hidden: true })).toEqual({ ok: false, error: 'not_allowed' });
  expect(await marta.emit('host:cloud-hide', { key: 'море', hidden: true })).toEqual({ ok: true });
  const cloudText = async () => (await stage.locator('.word-cloud').innerText().catch(() => '')).toLowerCase();
  await expect.poll(async () => (await cloudText()).includes('сонце') && !(await cloudText()).includes('море'), { timeout: 4000 }).toBe(true);
  await shot(stage, 'p11g-stage-cloud');

  // 4b. Блеф: автор — гравець, тож вигадку прибирає лише після свого вибору; до нього відмова однакова для правди й вигадок.
  const lies = await frame(vira, (v) => v.phase === 'question' && v.bluff?.stage === 'lies', viraCloud.index);
  await emitOk(marta, 'player:lie', { text: 'Рим' });
  await emitOk(vira, 'player:lie', { text: 'Мілан' });
  await emitOk(petro, 'player:lie', { text: 'Париж' });
  const choice = await frame(marta, (v) => v.phase === 'question' && (v.author?.bluff?.length ?? 0) > 0, cloud.index);
  const optionOf = (text: string) => choice.view.author!.bluff!.find((o) => o.text === text.toLowerCase())!.id;
  expect(await marta.emit('host:bluff-remove', { optionId: optionOf('Париж') })).toEqual({ ok: false, error: 'pick_first' });
  expect(await marta.emit('host:bluff-remove', { optionId: optionOf('Барселона') })).toEqual({ ok: false, error: 'pick_first' });
  expect(await vira.emit('host:bluff-remove', { optionId: optionOf('Париж') })).toEqual({ ok: false, error: 'not_allowed' });
  await emitOk(marta, 'player:bluff', { optionId: optionOf('Мілан') });
  expect(await marta.emit('host:bluff-remove', { optionId: optionOf('Барселона') })).toEqual({ ok: false, error: 'not_allowed' });
  expect(await marta.emit('host:bluff-remove', { optionId: optionOf('Мілан') })).toEqual({ ok: false, error: 'not_allowed' });
  expect(await marta.emit('host:bluff-remove', { optionId: optionOf('Париж') })).toEqual({ ok: true });
  const trimmed = await frame(vira, (v) => v.bluff?.stage === 'choice' && v.bluff.options.length > 0 && !v.bluff.options.some((o) => o.text === 'париж'), lies.index);
  expect(trimmed.view.bluff!.options).toHaveLength(4);
  await emitOk(vira, 'player:bluff', { optionId: optionOf('Барселона') });
  await emitOk(petro, 'player:bluff', { optionId: optionOf('Барселона') });
  await frame(vira, (v) => v.phase === 'reveal' && v.bluff != null, trimmed.index);

  // 5. Кінець раунду → 8 с → заставка «Поля».
  const roundEnd = await frame(vira, (v) => v.phase === 'round_end', viraCloud.index);
  const intro2 = await frame(vira, (v) => v.phase === 'intro', roundEnd.index);
  expectGap(phaseAt(vira, 'intro', roundEnd.index) - phaseAt(vira, 'round_end', cloud.index), 8000, 'round end to the next round');

  // 6. Кубики кидаються самі: Віра й Петро кидають, Марта ні — за неї кине сервер через 10 с.
  const diceStart = await frame(vira, (v) => v.phase === 'intro' && v.board?.dice != null && !v.board.dice.done, intro2.index);
  expect(diceStart.view.board!.dice!.rows).toHaveLength(3);
  rigged.push(6, 4, 2);
  await emitOk(vira, 'player:roll');
  await emitOk(petro, 'player:roll');
  const diceDone = await frame(vira, (v) => v.board?.dice?.done === true, diceStart.index);
  expectGap(diceDone.at - diceStart.at, 10_000, 'dice tour');
  expect(diceDone.view.board!.dice!.tieBreak).toBe(false);
  const board1 = await frame(vira, (v) => v.phase === 'board', diceDone.index);
  // Результат кубиків видно 4 с після закриття туру, але не раніше кінця опису заставки (8 с).
  expectGap(board1.at - Math.max(intro2.at + 8000, diceDone.at + 4000), 0, 'dice result stays 4 s, the intro 8 s', 1500);

  // 7. Усне поле з телефона: хто ходить, той вибирає клітинку й пише відповідь; Петро вперше помиляється.
  const byName = new Map(everyone.map((p) => [p.nickname, p]));
  // Розминка вже дала по 100 (g1); поле додає лише ціну клітинки.
  const scores = new Map(everyone.map((p) => [p.nickname, p.frames.at(-1)!.view.me.score]));
  expect([...scores.values()]).toEqual([100, 100, 100]);
  let cursor = board1.index;
  let petroWrong = false;
  for (let played = 0; played < 9; played++) {
    const turn = await frame(vira, (v) => v.phase === 'board' && v.board?.turn != null && v.board.categories.flatMap((c) => c.cells).filter((c) => c.played).length === played, cursor);
    const name = turn.view.board!.turn!.nickname;
    const chooser = byName.get(name)!;
    const open = turn.view.board!.categories.flatMap((c) => c.cells).find((c) => !c.played)!;
    const mark = chooser.frames.length;
    await emitOk(chooser, 'player:pick', { cellId: open.id });
    const asked = await frame(chooser, (v) => v.phase === 'question', mark);
    const wrong = name === 'Петро' && !petroWrong;
    if (wrong) petroWrong = true;
    await emitOk(chooser, 'player:answer', { type: 'text', value: wrong ? 'нептун' : answers.get(open.id)! });
    const shown = await frame(chooser, (v) => v.phase === 'reveal', asked.index);
    const before = scores.get(name)!;
    const gain = wrong ? 0 : open.price;
    expect(shown.view.me.result?.accepted, `${name} on ${open.id}`).toBe(!wrong);
    expect(shown.view.me.score - before, `${name} score on ${open.id}`).toBe(gain);
    scores.set(name, before + gain);
    if (played === 0) {
      await stage.getByText('Яка річка тече через Київ?', exact).waitFor();
      await expectStageInView(stage, 'p11g-stage-board');
      await shot(stage, 'p11g-stage-board');
    }
    cursor = vira.frames.length;
  }
  expect(petroWrong, 'Петро answered wrongly once').toBe(true);

  // 8. Фінал: ручну перевірку замінив ключ; ставки → запитання саме; кожен гравець розкривається через 3 с.
  const wagerFrame = await frame(vira, (v) => v.phase === 'wager', cursor);
  const wagers: [Pilot, number][] = [[marta, 0], [vira, 100], [petro, 50]];
  const beforeFinal = new Map<string, number>();
  for (const [player, amount] of wagers) {
    const own = await frame(player, (v) => v.phase === 'wager', 0);
    beforeFinal.set(player.nickname, own.view.me.score);
    expect(own.view.me.score, `${player.nickname} can stake ${amount}`).toBeGreaterThanOrEqual(amount);
  }
  for (const [player, amount] of wagers) await emitOk(player, 'player:wager', { amount });
  const finalQuestion = await frame(vira, (v) => v.phase === 'question' && v.final !== null, wagerFrame.index);
  await emitOk(marta, 'player:answer', { type: 'text', value: 'київ' });
  await emitOk(vira, 'player:answer', { type: 'text', value: 'київ' });
  await emitOk(petro, 'player:answer', { type: 'text', value: 'Львів' });
  await frame(vira, (v) => v.phase === 'reveal' && (v.final?.shown.length ?? 0) >= 3, finalQuestion.index);
  const steps = vira.frames
    .slice(finalQuestion.index)
    .filter((f) => f.view.phase === 'reveal' && (f.view.final?.shown.length ?? 0) >= 1)
    .filter((f, i, all) => i === 0 || f.view.final!.shown.length !== all[i - 1]!.view.final!.shown.length);
  expect(steps.length).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < steps.length; i++) expectGap(steps[i]!.at - steps[i - 1]!.at, 3000, `final reveal step ${i}`);

  await frame(vira, (v) => v.phase === 'finished', finalQuestion.index);
  const finalScore = async (player: Pilot) => (await frame(player, (v) => v.phase === 'finished', 0)).view.me.score;
  expect((await finalScore(marta)) - beforeFinal.get('Марта')!).toBe(0);
  expect((await finalScore(vira)) - beforeFinal.get('Віра')!).toBe(100);
  expect((await finalScore(petro)) - beforeFinal.get('Петро')!).toBe(-50);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await expectStageFits(stage, 'p11g-stage-podium');
  await shot(stage, 'p11g-stage-podium');
  expect(await bodyText(stage)).not.toContain('Чекаємо ведучого');

  // 9. Таємність: пульта немає в жодному кадрі; чужі гравці не бачать меню автора; ведучий «на зв'язку» завжди.
  for (const player of everyone) expectNoHostFrames(player.nickname, player.raw);
  expectNoHostFrames('stage', stageFrames);
  for (const player of [vira, petro]) {
    for (const text of player.raw) expect(text.includes('"author":{'), `${player.nickname} got the author view`).toBe(false);
  }
  for (const player of everyone) expect(player.frames.every((f) => f.meta.hostOnline), `${player.nickname}: hostOnline`).toBe(true);
  expect(stageFrames.length).toBeGreaterThan(0);

  // 10.
  expect(problems).toEqual([]);
}

it('part 11g: autopilot — no host token or view, the author starts from the phone, the server opens, closes, reveals and moves on by the stage times on top of 11b, voice board cells and manual checks go by the key from the phone, dice start and finish by themselves, the author hides a cloud word on the 1280 × 720 stage while others get not_allowed, the author removes a bluff lie only after their own pick, the game reaches the podium', async () => {
  const sockets: Socket[] = [];
  try {
    await autopilot11g(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

async function autopilotPauses11g(sockets: Socket[]) {
  const author = await open('author11g-pause', 1280, 900);
  await register(author, 'host', 'Марта Пауза', 'pause11g@example.com');
  const common = { imageUrl: null, video: null, points: 100, timeLimit: 20, correct: true };
  const questions = ['Дніпро впадає в Чорне море', 'Карпати — гори', 'Світязь — озеро'].map((text, i) => ({ ...common, id: `p${i + 1}`, type: 'boolean' as const, text }));
  const data = {
    ...makeRoundsQuiz([classicRound('r1', questions as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })], { leaderboard: 'each' }),
    title: 'Пауза 11g',
  };
  const saved = await author.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const room = await createAutopilot(author, ((await saved.json()) as { id: string }).id);
  const { code } = room;
  const marta = await pilotSocket(sockets, code, room.token, 'Марта');
  const vira = await pilotPlayer(sockets, code, 'Віра');
  const stage = await open('stage11g-pause', 1280, 720);
  const timeline = stageTimeline(stage);
  const stageFrames = socketFrames(stage);
  await stage.goto(`${base}/stage/${code}#${room.stageToken}`);
  await stage.getByText('Віра').waitFor();
  const both = [marta, vira];

  // 1. Старт; нікого на зв'язку → пауза; через 5 с ще пауза; повернулася Віра → гра йде через 3 с.
  expect(await marta.emit('host:start')).toEqual({ ok: true });
  const question1 = await frame(vira, (v) => v.phase === 'question');
  for (const player of both) player.close();
  const closedAt = Date.now();
  await expect.poll(() => timeline.some((f) => f.view.paused && f.at >= closedAt - 500), { timeout: 5000 }).toBe(true);
  await sleep(5000);
  expect(timeline.at(-1)!.view.paused, 'still paused after 5 s with nobody online').toBe(true);
  const viraMark = vira.frames.length;
  await vira.reconnect();
  const back = await frame(vira, () => true, viraMark);
  const resumed = await expect.poll(() => timeline.find((f) => f.at > back.at && !f.view.paused) ?? null, { timeout: 8000 }).not.toBeNull().then(() => timeline.find((f) => f.at > back.at && !f.view.paused)!);
  expectGap(resumed.at - back.at, 3000, 'the first player returns');
  await marta.reconnect();

  // 2. Обоє відповіли → розкриття; через 2 с розкриття сервер перезапускається.
  const asked = await frame(vira, (v) => v.phase === 'question' && !v.paused, vira.frames.length - 1);
  expect(asked.view.questionIndex).toBe(question1.view.questionIndex);
  for (const player of both) await emitOk(player, 'player:answer', { type: 'boolean', value: true });
  const reveal = await frame(marta, (v) => v.phase === 'reveal', 0);
  await sleep(Math.max(0, reveal.at + 2000 - Date.now()));
  // Залишок розкриття сервер рахує від миті знімка в shutdown, а не від «через 2 с»: під навантаженням таймер тесту й зупинка
  // запізнюються на сотні мілісекунд. Знімок — між restartedAt і кінцем shutdown (between іде після нього, до нового сервера).
  const restartedAt = Date.now();
  let stoppedAt = restartedAt;
  await restart(async () => {
    stoppedAt = Date.now();
  });
  const restMax = reveal.at + 6000 - restartedAt;
  const restMin = reveal.at + 6000 - stoppedAt;
  expect(restMin, 'the restart happened in the middle of the reveal').toBeGreaterThan(1000);
  await sleep(2000);
  // Сцена перепідключається сама й показує паузу, поки ніхто не повернувся.
  await expect.poll(() => timeline.some((f) => f.view.paused && f.at >= restartedAt), { timeout: 20_000 }).toBe(true);
  const pausedCount = timeline.length;
  const martaMark = marta.frames.length;
  await marta.reconnect();
  const martaBack = await frame(marta, () => true, martaMark);
  const goOn = await expect
    .poll(() => timeline.slice(pausedCount - 1).find((f) => f.at > martaBack.at && !f.view.paused) ?? null, { timeout: 10_000 })
    .not.toBeNull()
    .then(() => timeline.slice(pausedCount - 1).find((f) => f.at > martaBack.at && !f.view.paused)!);
  expectGap(goOn.at - martaBack.at, 3000, 'after the restart the first player returns');
  const leaderboard = await frame(marta, (v) => v.phase === 'leaderboard', 0);
  const rest = leaderboard.at - goOn.at;
  const restNote = `the rest of the reveal after the restart: ${rest} ms, wanted ${restMin}…${restMax} −${EARLY} … +2000`;
  expect(rest, restNote).toBeGreaterThanOrEqual(restMin - EARLY);
  expect(rest, restNote).toBeLessThanOrEqual(restMax + 2000);
  await vira.reconnect();

  // 3. Таблиця між запитаннями → наступне запитання через 5 с.
  const question2 = await frame(vira, (v) => v.phase === 'question' && v.questionIndex === 1, 0);
  expectGap(question2.at - leaderboard.at, 5000, 'table to the next question');

  // 4. Пауза автора тримається, поки автор не продовжить; Віра не може.
  for (const player of both) await emitOk(player, 'player:answer', { type: 'boolean', value: true });
  // Індекси кадрів у кожного учасника свої: question2.index — з кадрів Віри, тож для Марти шукаємо від її власного кадру.
  const martaQuestion2 = await frame(marta, (v) => v.phase === 'question' && v.questionIndex === 1, 0);
  const reveal2 = await frame(marta, (v) => v.phase === 'reveal' && v.questionIndex === 1, martaQuestion2.index);
  const pauseMark = timeline.length;
  expect(await marta.emit('host:pause')).toEqual({ ok: true });
  await expect.poll(() => timeline.at(-1)!.view.paused, { timeout: 4000 }).toBe(true);
  // Залишок розкриття — від миті паузи за часом сервера (кадр сцени), а не від того, коли тест побачив розкриття.
  const pausedAt = timeline.slice(pauseMark).find((f) => f.view.paused)!.at;
  const left2 = reveal2.at + 6000 - pausedAt;
  await sleep(8000);
  expect(timeline.at(-1)!.view.paused, 'the author pause holds').toBe(true);
  expect(timeline.at(-1)!.view.phase).toBe('reveal');
  expect(await vira.emit('host:resume')).toEqual({ ok: false, error: 'not_allowed' });
  const resumeAt = Date.now();
  expect(await marta.emit('host:resume')).toEqual({ ok: true });
  const leaderboard2 = await frame(marta, (v) => v.phase === 'leaderboard' && v.questionIndex === 1, reveal2.index);
  expect(left2, 'the pause came in the middle of the reveal').toBeGreaterThan(1000);
  expectGap(leaderboard2.at - resumeAt, left2, 'the reveal goes on with the time left');

  // 5. Третє запитання, до подіуму.
  const question3 = await frame(vira, (v) => v.phase === 'question' && v.questionIndex === 2, 0);
  for (const player of both) await emitOk(player, 'player:answer', { type: 'boolean', value: true });
  await frame(vira, (v) => v.phase === 'finished', question3.index);
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor();
  await expectStageFits(stage, 'p11g-stage-pause-podium');
  await shot(stage, 'p11g-stage-pause-podium');
  expectNoHostFrames('stage', stageFrames);
  for (const player of both) expectNoHostFrames(player.nickname, player.raw);
  expect(problems).toEqual([]);
}

it('part 11g: autopilot pauses with nobody online and after a restart, goes on 3 s after the first player returns with the time left, and the author pause holds until the author resumes', async () => {
  const sockets: Socket[] = [];
  try {
    await autopilotPauses11g(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

// ——— 11h: інтерфейс гри без ведучого. Автор і Віра — справжні сторінки (телефони 375 × 812), Петро — сокет, сцена — 1280 × 720. ———

/** Видимий текст сторінки (innerText body, title й aria-label усіх елементів) не згадує ведучого (план 11h). */
async function expectNoHost(page: Page, where: string): Promise<void> {
  const seen = (await page.evaluate(`(() => {
    const parts = [document.title, document.body.innerText];
    for (const element of document.querySelectorAll('[title],[aria-label],[placeholder],[alt]'))
      for (const name of ['title', 'aria-label', 'placeholder', 'alt']) parts.push(element.getAttribute(name) ?? '');
    return parts.join('\\n');
  })()`)) as string;
  const lines = seen.split('\n').filter((line) => /ведуч/i.test(line));
  expect(lines, `${where}: the page names a host`).toEqual([]);
}

/**
 * Телефон автора на своїй ширині: без прокрутки вбік, шапка в один рядок (усе в ній на одній висоті, шапка не вища за свої рядки тексту, тож «⋯» її не збільшує).
 * Нижньої панелі меню на сторінці гри немає, тому expectPhoneFit тут не підходить.
 */
async function expectPhonePlay(page: Page, name: string): Promise<void> {
  const fit = (await page.evaluate(`(() => {
    const bar = document.querySelector('header.bar');
    const button = document.querySelector('.author-menu-btn');
    const centers = bar ? [...bar.children].map((child) => { const r = child.getBoundingClientRect(); return r.top + r.height / 2; }) : [];
    return {
      wide: document.documentElement.scrollWidth <= innerWidth,
      width: innerWidth,
      rects: bar ? [...bar.children, bar].map((c) => c.className + ':' + Math.round(c.getBoundingClientRect().top) + '+' + Math.round(c.getBoundingClientRect().height)).join(' | ') : '',
      oneRow: centers.length === 0 || Math.max(...centers) - Math.min(...centers) <= 6,
      // Кнопки шапки мають від'ємні поля, тож шапка не вища за свої рядки тексту: поява «⋯» не зсуває екран.
      tall: bar && button ? bar.getBoundingClientRect().height <= Math.max(...[...bar.children].filter((c) => !c.matches('button')).map((c) => c.getBoundingClientRect().height)) + 2 : true,
    };
  })()`)) as { wide: boolean; width: number; rects: string; oneRow: boolean; tall: boolean };
  expect(fit.width, `${name}: a phone`).toBe(375);
  expect(fit.wide, `${name}: horizontal scroll`).toBe(true);
  expect(fit.oneRow, `${name}: the header wraps`).toBe(true);
  expect(fit.tall, `${name}: the «⋯» makes the header taller than its row (${fit.rects})`).toBe(true);
  await shot(page, name);
}

/** Меню автора: відкрити «⋯». */
const authorMenu = async (page: Page) => {
  await page.getByRole('button', { name: 'Меню автора', ...exact }).click();
  const sheet = page.getByRole('dialog', { name: 'Меню автора', ...exact });
  await sheet.waitFor();
  return sheet;
};

async function authorInterface11h(sockets: Socket[]) {
  const marta = await open('marta11h', 375, 812);
  const martaFrames = socketFrames(marta);
  await register(marta, 'host', 'Марта Авторка', 'marta11h@example.com');

  const common = { imageUrl: null, video: null };
  const b1 = { ...common, id: 'b1', type: 'boolean' as const, text: 'Говерла — найвища гора України', points: 100, timeLimit: 20, correct: true };
  const c1 = { ...common, id: 'c1', type: 'wordcloud' as const, text: 'Одне слово про осінь', points: 0, timeLimit: 20, words: 1 };
  // Південний Буг (806 км) — найдовша річка лише в Україні.
  const f1 = {
    ...common,
    id: 'f1',
    type: 'bluff' as const,
    text: 'Найдовша річка, що тече лише Україною, — …',
    points: 0,
    timeLimit: 60,
    choiceTime: 30,
    accepted: ['Південний Буг'],
    lies: ['Сула', 'Псел'],
  };
  const rounds = [
    classicRound('r1', [b1, c1, f1] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false }),
    finalRound('r2', { ...withPoints(withId(textQ, 'q1'), 100), text: 'Яке місто — столиця України?', accepted: ['Київ'] } as never, { title: 'Фінал', check: 'manual', wagerMode: 'classic' }),
  ];
  const data = { ...makeRoundsQuiz(rounds as never, { leaderboard: 'end', newcomers: false }), title: 'Бот веде 11h' };
  const saved = await marta.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);

  // 1–2. Вікно запуску на телефоні: зміни, «грай чесно», нікнейм профілю, довідка.
  await marta.goto(`${base}/quizzes`);
  await marta.locator('.quiz-list li', { hasText: 'Бот веде 11h' }).getByRole('button', { name: 'Провести ботом', ...exact }).click();
  const dialog = marta.getByRole('dialog', { name: 'Гра без ведучого', ...exact });
  await dialog.locator('.autopilot-changes li').first().waitFor();
  const changes = await dialog.locator('.autopilot-changes li').allTextContents();
  expect(changes).toHaveLength(1);
  expect(changes[0]).toContain('Ручну перевірку замінить ключ відповіді');
  expect(changes[0]).toContain('Раунд 2');
  await dialog.getByText('Ти автор і знаєш відповіді — грай чесно.', exact).waitFor();
  const profileNickname = ((await (await marta.request.get(`${base}/api/me/profile`)).json()) as { nickname: string }).nickname;
  await expect.poll(() => dialog.getByLabel('Твій нікнейм у грі').inputValue()).toBe(profileNickname);
  await dialog.getByRole('button', { name: 'Довідка: Гра без ведучого', ...exact }).click();
  await marta.locator('.help-pop').getByRole('heading', { name: 'Гра без ведучого', ...exact }).waitFor();
  // Escape закриває довідку, а не вікно запуску.
  await marta.keyboard.press('Escape');
  await marta.locator('.help-pop').waitFor({ state: 'detached' });
  await dialog.waitFor();
  await expectPhoneFit(marta, 'p11h-launch-375');

  // 3. Нікнейм «Марта» → кімната: код, QR, посилання на сцену, «Почати гру».
  await dialog.getByLabel('Твій нікнейм у грі').fill('Марта');
  await dialog.getByRole('button', { name: 'Створити кімнату', ...exact }).click();
  await marta.waitForURL(/\/play\/[^/]+$/);
  const code = marta.url().split('/').pop()!;
  await expect.poll(() => marta.locator('.author-code').textContent()).toBe(`${code.slice(0, 3)} ${code.slice(3)}`);
  const qr = marta.locator('.author-qr svg');
  await qr.waitFor();
  expect((await qr.boundingBox())!.width, 'the QR is readable').toBeGreaterThanOrEqual(150);
  const stageHref = (await marta.locator('.author-stage a', { hasText: 'Відкрити' }).getAttribute('href'))!;
  expect(stageHref).toMatch(new RegExp(`/stage/${code}#.+`));
  await marta.getByText(stageHref, exact).waitFor();
  await marta.getByRole('button', { name: 'Почати гру', ...exact }).waitFor();
  await expectNoHost(marta, 'author lobby');
  await expectPhonePlay(marta, 'p11h-author-lobby-375');

  // 4. Сцена за посиланням: «Гру веде бот».
  const stage = await open('stage11h', 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageHref);
  await stage.getByText('Гру веде бот').waitFor();
  await expectNoHost(stage, 'stage lobby');
  await expectStageFits(stage, 'p11h-stage-lobby');
  await shot(stage, 'p11h-stage-lobby');

  // 5. Віра заходить формою: ні «Почати гру», ні «⋯». Петро — сокет.
  const vira = await open('vira11h', 375, 812);
  const viraFrames = socketFrames(vira);
  await joinBy11h(vira, code, 'Віра');
  expect(await vira.getByRole('button', { name: 'Почати гру', ...exact }).count()).toBe(0);
  expect(await vira.getByRole('button', { name: 'Меню автора', ...exact }).count()).toBe(0);
  await expectNoHost(vira, 'player lobby');
  const petro = await pilotPlayer(sockets, code, 'Петро');
  await stage.getByText('Петро').waitFor();

  // 6. Старт автором: заставка → b1 на сцені й телефонах.
  await marta.getByRole('button', { name: 'Почати гру', ...exact }).click();
  for (const page of [stage, marta, vira]) await page.getByText('Говерла — найвища гора України', exact).waitFor({ timeout: 60_000 });
  await expectNoHost(stage, 'stage question');
  await expectNoHost(marta, 'author question');
  await expectNoHost(vira, 'player question');
  await expectPhonePlay(marta, 'p11h-author-question-375');

  // 7. Пауза з меню: Віра й сцена бачать «Пауза», через 4 с ще пауза, банер автора має «Продовжити».
  const sheet = await authorMenu(marta);
  await expectNoHost(marta, 'author menu');
  await shot(marta, 'p11h-author-menu-375');
  await sheet.getByRole('button', { name: 'Пауза', ...exact }).click();
  await vira.locator('.banner', { hasText: 'Пауза' }).waitFor();
  await expect.poll(async () => (await bodyText(stage)).includes('Пауза')).toBe(true);
  await expectNoHost(marta, 'author pause');
  await expectNoHost(vira, 'player pause');
  await sleep(4000);
  expect(await vira.locator('.banner', { hasText: 'Пауза' }).count(), 'still paused after 4 s').toBe(1);
  await marta.locator('.author-paused').getByRole('button', { name: 'Продовжити', ...exact }).click();
  await expect.poll(() => vira.locator('.banner', { hasText: 'Пауза' }).count()).toBe(0);
  await click(marta, 'Так');
  await click(vira, 'Так');
  await emitOk(petro, 'player:answer', { type: 'boolean', value: true });

  // 8. «Хмара»: Марта «море», Віра й Петро «сонце»; на розкритті гру ставлять на паузу, автор ховає «море».
  await field(marta, 'Слово 1').waitFor({ timeout: 60_000 });
  await field(vira, 'Слово 1').waitFor();
  await field(marta, 'Слово 1').fill('море');
  await click(marta, 'Відповісти');
  await field(vira, 'Слово 1').fill('сонце');
  await click(vira, 'Відповісти');
  await emitOk(petro, 'player:answer', { type: 'wordcloud', words: ['сонце'] });
  await frame(petro, (v) => v.phase === 'reveal' && v.questionIndex === 1, 0);
  await (await authorMenu(marta)).getByRole('button', { name: 'Пауза', ...exact }).click();
  const hide = await authorMenu(marta);
  await hide.getByRole('button', { name: 'Приховати…', ...exact }).click();
  const cloudWord = (word: string) => hide.locator('.host-cloud').getByRole('button', { name: word, ...exact });
  await cloudWord('море').waitFor();
  await cloudWord('сонце').waitFor();
  expect(await cloudWord('море').getAttribute('aria-pressed')).toBe('false');
  expect(await hide.locator('.host-cloud-by').count(), 'the menu does not show who wrote a word').toBe(0);
  const cloudText = async () => (await stage.locator('.word-cloud').innerText().catch(() => '')).toLowerCase();
  await expect.poll(async () => (await cloudText()).includes('море')).toBe(true);
  await cloudWord('море').click();
  await expect.poll(() => cloudWord('море').getAttribute('aria-pressed')).toBe('true');
  await expect.poll(async () => !(await cloudText()).includes('море') && (await cloudText()).includes('сонце')).toBe(true);
  await expectNoHost(marta, 'author hides a cloud word');
  await shot(marta, 'p11h-author-hide-cloud-375');
  await marta.keyboard.press('Escape');
  await hide.waitFor({ state: 'detached' });
  await marta.locator('.author-paused').getByRole('button', { name: 'Продовжити', ...exact }).click();
  await expectNoHost(vira, 'player cloud reveal');

  // 9. Блеф: вигадки, відмова до власного вибору, вибір, прибрати вигадку, вибраний варіант не прибирається.
  await field(marta, 'Твоя вигадка').waitFor({ timeout: 60_000 });
  await writeLie(marta, 'Орель');
  await writeLie(vira, 'Інгулець');
  await emitOk(petro, 'player:lie', { text: 'Рось' });
  await marta.locator('.bluff-choice button').first().waitFor();
  await expect.poll(() => stage.locator('.bluff-text', { hasText: 'Рось' }).count()).toBe(1);
  const refuse = await authorMenu(marta);
  await refuse.getByRole('button', { name: 'Приховати…', ...exact }).click();
  await refuse.getByRole('button', { name: 'Прибрати «рось»', ...exact }).click();
  await refuse.getByRole('alert').filter({ hasText: 'Спершу зробіть свій вибір.' }).waitFor();
  await expectNoHost(marta, 'author bluff refusal');
  await shot(marta, 'p11h-author-hide-bluff-375');
  await marta.keyboard.press('Escape');
  await refuse.waitFor({ state: 'detached' });
  await pickBluff(marta, 'південний буг');
  const trim = await authorMenu(marta);
  await trim.getByRole('button', { name: 'Приховати…', ...exact }).click();
  const choiceMark = petro.frames.length;
  await trim.getByRole('button', { name: 'Прибрати «рось»', ...exact }).click();
  await trim.getByRole('button', { name: 'Прибрати «рось»', ...exact }).waitFor({ state: 'detached' });
  await expect.poll(() => stage.locator('.bluff-text', { hasText: 'Рось' }).count()).toBe(0);
  expect(await vira.locator('.bluff-choice button', { hasText: 'Рось' }).count(), 'the removed lie left the phone of another player').toBe(0);
  const trimmed = await frame(petro, (v) => v.bluff?.stage === 'choice' && v.bluff.options.length > 0 && !v.bluff.options.some((o) => o.text === 'рось'), choiceMark);
  expect(petro.frames.slice(trimmed.index).some((f) => f.view.bluff?.options.some((o) => o.text === 'рось')), 'Петро never sees the removed lie again').toBe(false);
  await trim.getByRole('button', { name: 'Прибрати «південний буг»', ...exact }).click();
  await trim.getByRole('alert').filter({ hasText: 'Цей варіант прибрати не можна.' }).waitFor();
  await shot(marta, 'p11h-author-hide-bluff-refused-375');
  await marta.keyboard.press('Escape');
  await trim.waitFor({ state: 'detached' });
  await pickBluff(vira, 'південний буг');
  await emitOk(petro, 'player:bluff', { optionId: trimmed.view.bluff!.options.find((o) => o.text === 'південний буг')!.id });
  await expectNoHost(marta, 'author bluff reveal');
  await expectNoHost(vira, 'player bluff reveal');

  // 10. Вилучення: на кінці раунду Марта вилучає Петра; у списку лишається Віра.
  await frame(petro, (v) => v.phase === 'round_end', trimmed.index);
  const kick = await authorMenu(marta);
  await kick.getByRole('button', { name: 'Вилучити гравця', ...exact }).click();
  const people = await kick.locator('.author-menu-people button').allTextContents();
  expect(people.join(' ')).toContain('Віра');
  expect(people.join(' ')).toContain('Петро');
  await kick.locator('.author-menu-people button', { hasText: 'Петро' }).click();
  await expect.poll(() => petro.closed).toEqual(['kicked']);
  await expect.poll(async () => (await kick.locator('.author-menu-people button').allTextContents()).join(' ')).toContain('Віра');
  expect((await kick.locator('.author-menu-people button').allTextContents()).join(' ')).not.toContain('Петро');
  await marta.keyboard.press('Escape');
  await kick.waitFor({ state: 'detached' });

  // 11. Фінал: ставки (Марта 0, Віра 100) → «київ» → подіум.
  const bet = async (page: Page, amount: number) => {
    await page.getByRole('button', { name: /^Поставити/ }).first().waitFor({ timeout: 90_000 });
    await page.getByLabel('Ставка', exact).fill(String(amount));
    await page.getByRole('button', { name: /^Поставити/ }).first().click();
  };
  await bet(marta, 0);
  await bet(vira, 100);
  await expectNoHost(marta, 'author final');
  for (const page of [marta, vira]) {
    await field(page, 'Ваша відповідь').fill('київ');
    await click(page, 'Відповісти');
  }
  await stage.getByRole('heading', { name: 'Переможці' }).waitFor({ timeout: 90_000 });
  await expectStageFits(stage, 'p11h-stage-podium');
  await shot(stage, 'p11h-stage-podium');
  await expectNoHost(stage, 'stage podium');
  await expectNoHost(marta, 'author podium');
  await expectNoHost(vira, 'player podium');

  // 13. Історія: «Провів бот» у списку, деталях і «Моїх іграх»; «Проведені ігри» — 0, перша гра в досягненнях гравця.
  const mark = marta.locator('.panel', { hasText: 'Бот веде 11h' }).locator('.autopilot-mark');
  await expect
    .poll(
      async () => {
        await marta.goto(`${base}/history`);
        await marta.getByText('Завантажуємо…').waitFor({ state: 'detached' });
        return (await mark.allTextContents()).join();
      },
      { timeout: 15_000 },
    )
    .toBe('Провів бот');
  await expectPhoneFit(marta, 'p11h-history-375');
  await marta.getByRole('link', { name: 'Бот веде 11h', ...exact }).click();
  await marta.locator('.autopilot-mark').waitFor();
  expect(await marta.locator('.autopilot-mark').textContent()).toBe('Провів бот');
  await marta.goto(`${base}/me`);
  await mark.waitFor();
  expect(await mark.textContent()).toBe('Провів бот');
  const profile = (await (await marta.request.get(`${base}/api/me/profile`)).json()) as { stats: { hosted: number; games: number }; achievements: { id: string; earned: boolean }[] };
  expect(profile.stats.hosted, 'a game with no host is not a hosted game').toBe(0);
  expect(profile.stats.games).toBe(1);
  expect(profile.achievements.find((a) => a.id === 'host')?.earned).toBe(false);
  expect(profile.achievements.find((a) => a.id === 'first_game')?.earned).toBe(true);

  // 14. Таємність: Віра й Петро не отримали вигляду автора; кадри Марти без авторів слів і без видів вигадок.
  for (const text of viraFrames) expect(text.includes('"author":{'), 'Віра got the author view').toBe(false);
  for (const text of petro.raw) expect(text.includes('"author":{'), 'Петро got the author view').toBe(false);
  const mine = stateViews(martaFrames);
  expect(mine.some((v) => v.author?.cloud != null)).toBe(true);
  expect(mine.some((v) => (v.author?.bluff?.length ?? 0) > 0)).toBe(true);
  for (const view of mine) {
    for (const word of view.author?.cloud ?? []) expect('by' in word, 'a cloud word carries its authors').toBe(false);
    for (const option of view.author?.bluff ?? []) expect('kind' in option, 'a bluff option carries its kind').toBe(false);
  }
  expectNoHostFrames('stage', stageFrames);
  expect(problems).toEqual([]);
}

it('part 11h: the author launches a game with no host from the quiz list on a 375 phone — the changes and «грай чесно», the lobby with code, QR, stage link and «Почати гру», «Гру веде бот» on the 1280 × 720 stage, the «⋯» menu pauses, hides a cloud word, refuses a bluff lie before the own pick and removes one after it, kicks a player; no screen names a host; the history says «Провів бот» and hosted games stay 0', async () => {
  const sockets: Socket[] = [];
  try {
    await authorInterface11h(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 900_000);

async function noStageInterface11h(sockets: Socket[]) {
  const marta = await open('marta11h-b', 375, 812);
  await register(marta, 'host', 'Марта Авторка', 'marta11h-b@example.com');
  const audio = await marta.request.post(`${base}/api/uploads/audio`, { data: silentMp3(), headers: { 'content-type': 'audio/mpeg' } });
  expect(audio.status(), await audio.text()).toBe(201);
  const audioUrl = ((await audio.json()) as { url: string }).url;

  const common = { imageUrl: null, video: null };
  const choice = (id: string, text: string, options: string[]) => ({
    ...common,
    id,
    type: 'single' as const,
    text,
    points: 100,
    timeLimit: 30,
    options: options.map((option, i) => ({ id: `${id}-${i}`, text: option })),
    correctId: `${id}-0`,
  });
  const a1 = { ...choice('a1', 'Що звучить?', ['Тиша', 'Дощ', 'Вітер']), audio: { source: 'file' as const, url: audioUrl, start: 0, duration: 2 } };
  const a2 = { ...common, id: 'a2', type: 'boolean' as const, text: 'Світязь — озеро', points: 100, timeLimit: 20, correct: true };
  const ladder = [
    choice('l1', 'Яка річка тече через Київ?', ['Дніпро', 'Сена', 'Дунай', 'Тиса']),
    choice('l2', 'Яке місто називають містом Лева?', ['Львів', 'Одеса', 'Харків', 'Луцьк']),
    choice('l3', 'Яка найвища гора України?', ['Говерла', 'Роман-Кош', 'Піп Іван', 'Бребенескул']),
    choice('l4', 'Яке море омиває південь України?', ['Чорне', 'Балтійське', 'Біле', 'Червоне']),
    choice('l5', 'Яка річка тече через Ужгород?', ['Уж', 'Дніпро', 'Прип’ять', 'Дністер']),
  ];
  const quiz = makeRoundsQuiz(
    [
      classicRound('r1', [a1, a2] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false }),
      ladderRound('r2', ladder as never, { title: 'Драбина', pick: 'host', lifelines: ['fifty', 'hint'], timer: true, safe: [1] }),
    ],
    { leaderboard: 'end', newcomers: false },
  );
  const saved = await marta.request.post(`${base}/api/quizzes`, { data: { ...quiz, title: 'Без сцени 11h' } });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;

  // 1. Перевірка: жереб і підказка змінюються в раунді 2.
  const check = (await (await marta.request.get(`${base}/api/quizzes/${quizId}/autopilot`)).json()) as { blocked: unknown[]; changed: { code: string; rounds: number[] }[] };
  expect(check.blocked).toEqual([]);
  expect(check.changed.find((c) => c.code === 'ladder_pick')?.rounds).toEqual([1]);
  expect(check.changed.find((c) => c.code === 'hint')?.rounds).toEqual([1]);

  // 2. Кімната з вікна запуску, Віра входить формою, сцени немає.
  const code = await launchBot11h(marta, 'Без сцени 11h', 'Марта');
  const vira = await open('vira11h-b', 375, 812);
  const viraFrames = socketFrames(vira);
  await joinBy11h(vira, code, 'Віра');
  await marta.getByText('Віра').first().waitFor().catch(() => undefined);
  const stageHref = (await marta.locator('.author-stage a', { hasText: 'Відкрити' }).getAttribute('href'))!;

  // 3. Старт: після кінця заставки запитання без сцени — звук на обох телефонах.
  await marta.getByRole('button', { name: 'Почати гру', ...exact }).click();
  const phones = [marta, vira];
  for (const page of phones) await page.getByText('Що звучить?', exact).waitFor({ timeout: 60_000 });
  for (const page of phones) await expect.poll(() => page.locator('audio').count(), { timeout: 15_000 }).toBe(1);
  for (const page of phones) expect(await page.locator('audio').getAttribute('src')).toBe(audioUrl);
  await expectNoHost(vira, 'player audio question');
  await expectPhonePlay(vira, 'p11h-phone-audio-375');

  // 4. Сцена відкрилась: телефони замовкають (звук грає сцена), але джерело лишається — «Прослухати» (16b).
  const stage = await open('stage11h-b', 1280, 720);
  const opened = viraFrames.length;
  await stage.goto(stageHref);
  await stage.getByText('Що звучить?', exact).waitFor({ timeout: 30_000 });
  for (const page of phones) await expect.poll(() => page.locator('.audio-card').getAttribute('data-state'), { timeout: 5000 }).not.toBe('playing');
  for (const page of phones) expect(await page.locator('audio').evaluate((el) => (el as unknown as { paused: boolean }).paused)).toBe(true);
  for (const page of phones) await page.getByRole('button', { name: '🔊 Прослухати', ...exact }).waitFor();
  for (const view of stateViews(viraFrames.slice(opened)).filter((v) => v.question?.audio != null)) expect(view.question!.audio!.clip, 'a phone keeps the source for «Прослухати»').toEqual({ source: 'file', url: audioUrl, start: 0, duration: 2 });

  // 5. Сцену закрито. a1 і a2 → кінець раунду → жереб «Мільйонера» без «ведучого».
  await stage.close();
  for (const page of phones) await page.getByRole('button', { name: /Тиша/ }).click();
  for (const page of phones) await page.getByRole('button', { name: 'Так', ...exact }).waitFor({ timeout: 60_000 });
  for (const page of phones) await page.getByRole('button', { name: 'Так', ...exact }).click();
  // Заставка «Мільйонера»: жереб вибирає учасника (текст без «ведучого»), учасник чує «Ти йдеш на драбину!».
  const draw = /Жереб вибирає, хто піде на драбину…|Ти йдеш на драбину!/;
  await expect.poll(async () => draw.test(await bodyText(marta)) || draw.test(await bodyText(vira)), { timeout: 120_000, interval: 100 }).toBe(true);
  await expectNoHost(marta, 'ladder draw, author');
  await expectNoHost(vira, 'ladder draw, player');
  await expect.poll(async () => (await marta.locator('.ladder-lifeline').count()) + (await vira.locator('.ladder-lifeline').count()), { timeout: 60_000 }).toBeGreaterThan(0);
  const climber = (await marta.locator('.ladder-lifeline').count()) > 0 ? marta : vira;
  const other = climber === marta ? vira : marta;
  await expectNoHost(climber, 'climber');
  await expectNoHost(other, 'ladder spectator');
  const off = climber.locator('.ladder-lifeline.is-off');
  await off.waitFor();
  expect(await off.isDisabled(), 'the off hint cannot be pressed').toBe(true);
  expect(await off.textContent()).toContain('Підказка');
  const why = climber.locator('.ladder-lifeline-off');
  expect(await why.isVisible(), 'the reason is visible text, not sr-only').toBe(true);
  expect(await why.textContent()).toBe('Для цього запитання підказки немає.');
  await expectNoHost(climber, 'ladder hint off');
  await expectPhonePlay(climber, 'p11h-ladder-off-375');

  // 6. До кінця: правильно на першому запитанні, потім «Забрати».
  await climber.getByRole('button', { name: /Дніпро/ }).click();
  await climber.getByRole('button', { name: /^Забрати \d/ }).click({ timeout: 60_000 });
  await expect.poll(() => stateViews(viraFrames).some((v) => v.phase === 'finished'), { timeout: 90_000 }).toBe(true);
  expect(viraFrames.length).toBeGreaterThan(0);

  // 7. Команди: окрема кімната.
  const teamQuiz = makeRoundsQuiz([classicRound('t1', [a2] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false })], {
    leaderboard: 'end',
    newcomers: false,
    teams: { count: 2, names: ['Червоні', 'Сині'] },
  });
  const teamSaved = await marta.request.post(`${base}/api/quizzes`, { data: { ...teamQuiz, title: 'Команди 11h' } });
  expect(teamSaved.ok(), await teamSaved.text()).toBe(true);
  const teamCode = await launchBot11h(marta, 'Команди 11h', 'Марта');
  await joinBy11h(vira, teamCode, 'Віра');
  // Спосіб за замовчуванням — «Гравці обирають»: автор у меню вибирає «Випадково», і Віра читає, що команди розподілить бот.
  await vira.getByText('Обери команду', exact).waitFor();
  await expectNoHost(vira, 'team lobby, players pick');
  await expectNoHost(marta, 'author team lobby');
  await expectPhonePlay(vira, 'p11h-team-lobby-375');
  const forms = await authorMenu(marta);
  await forms.getByRole('button', { name: 'Як формуємо команди', ...exact }).click();
  expect(await forms.getByRole('button', { name: 'Розподіляю сам', ...exact }).count(), 'no separate «Розподіляю сам» for a bot').toBe(0);
  expect(await forms.getByRole('button', { name: 'Гравці обирають', ...exact }).getAttribute('aria-pressed')).toBe('true');
  await forms.getByRole('button', { name: 'Випадково', ...exact }).click();
  await expect.poll(() => forms.getByRole('button', { name: 'Випадково', ...exact }).getAttribute('aria-pressed')).toBe('true');
  await expectPhonePlay(marta, 'p11h-team-form-375');
  await vira.getByText('Команди розподілить бот, щойно автор почне гру.', exact).waitFor();
  await expectNoHost(vira, 'team lobby, the bot deals');
  await forms.getByRole('button', { name: 'Кубик', ...exact }).click();
  await expect.poll(() => forms.getByRole('button', { name: 'Кубик', ...exact }).getAttribute('aria-pressed')).toBe('true');
  await marta.keyboard.press('Escape');
  await forms.waitFor({ state: 'detached' });
  await marta.getByRole('button', { name: 'Почати гру', ...exact }).click();
  await vira.getByText('Кидаємо кубики: найбільші — в одну команду', exact).waitFor({ timeout: 30_000 });
  await expectNoHost(vira, 'team dice');
  await expectNoHost(marta, 'author team dice');
  await expectPhonePlay(vira, 'p11h-team-dice-375');
  expect(problems).toEqual([]);
}

it('part 11h: with no stage the question sound plays on the 375 phones and falls silent once a stage opens, a ladder hint lifeline that is off says why in visible text, and team lobby texts name the bot', async () => {
  const sockets: Socket[] = [];
  try {
    await noStageInterface11h(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 900_000);
