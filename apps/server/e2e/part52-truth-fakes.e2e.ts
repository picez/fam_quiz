import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz, single, truthRound, withId, withPoints } from '@quiz/engine/testing';
import { type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, field, questionText, join, openRoundSettings, bodyText, expectNoSideScroll, register, POLL, socketFrames, NL, sleep, pilotPlayer, pilotSocket, createAutopilot, frame, emitOk, step27a, next27a, phoneScore27a, select27b, toWinners27c, reveal28a, writeFact28b, pickName28b } from './helpers/common';
import { ARTIFACTS, exact, base, problems, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 52: вигадані факти ведучого в «Правді про гравця».
 * Потребує зібраного клієнта (pnpm build) і встановленого Chrome. Телефони — 360 px, світла тема.
 */

useE2eServer();

/** Сторінка зі світлою темою пристрою (тема ставиться до першого завантаження). */
async function openLight(name: string, width: number, height: number): Promise<Page> {
  const page = await open(name, width, height);
  await page.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  return page;
}

/** Знімок лише видимої області (як її бачить користувач): E2E_SHOTS=1. */
async function viewportShot(page: Page, name: string) {
  if (process.env.E2E_SHOTS !== '1') return;
  await afterSplash(page);
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`), fullPage: false });
}

const isLight = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('is-light'));

const SIGHT = 'Я тричі бачила північне сяйво';
const JUGGLE = 'Я вмію жонглювати п’ятьма м’ячами';
const JUGGLE_NEW = 'Я вмію жонглювати трьома м’ячами';
const FACTS = { olya: 'Я стрибала з парашутом', petro: 'Я їв сарану в Таїланді', marko: 'Я вивчив іспанську за рік' };

it('part 52: editor — preset fakes for the truth round are saved, empty ones dropped', async () => {
  try {
    await presetEditor52();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 52: the host adds a fake in the lobby, «made up» in every question, a fake guessed and missed, «made up» on a real fact, phone 360 px, light theme', async () => {
  try {
    await lobbyFakes52();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 52: without a host only the presets play and a player cannot add a fake', async () => {
  const sockets: Socket[] = [];
  try {
    await autopilotFakes52(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

async function presetEditor52() {
  const host = await openLight('host52e', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host52e@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Вигадки 52');
  await openRoundSettings(host);
  await field(host, 'Бали за швидкість: швидша правильна відповідь дає більше').setChecked(false);
  await questionText(host).fill('Яка планета найбільша?');
  await field(host, 'Варіант 1').fill('Сатурн');
  await field(host, 'Варіант 2').fill('Юпітер');
  await field(host, 'Правильний: варіант 2').click();
  await field(host, 'Бали').fill('100');
  await click(host, '+ Раунд');
  await click(host, 'Правда про гравця');
  await openRoundSettings(host);
  await field(host, 'Ціна запитання').fill('300');
  await field(host, 'Час на запитання, с').fill('30');
  // Дві заготовлені вигадки: друга лишається порожньою й відкинеться під час збереження.
  await host.getByText('Заготовлені вигадки (необов’язково)', exact).waitFor();
  await click(host, 'Додати вигадку');
  await click(host, 'Додати вигадку');
  await field(host, 'Вигадка 1').fill(SIGHT);
  expect(await field(host, 'Вигадка 2').inputValue()).toBe('');
  expect(await host.locator('fieldset.truth-presets textarea[rows="2"]').count(), 'two two-line preset fields').toBe(2);
  // Вузький екран: поля й кнопки заготовлених вигадок у видимій області.
  await host.setViewportSize({ width: 360, height: 740 });
  await host.locator('fieldset.truth-presets').scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'truth52-editor-360-full');
  await viewportShot(host, 'truth52-editor-360');
  await host.setViewportSize({ width: 1280, height: 900 });
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Вигадки 52' }).waitFor();
  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Вигадки 52')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: Record<string, unknown>[] };
  expect(stored.rounds[1]).toMatchObject({ type: 'truth', points: 300, timeLimit: 30, fakes: [SIGHT] });
  expect(stored.rounds[0], 'a classic round has no fakes').not.toHaveProperty('fakes');
  expect(await isLight(host), 'the light theme').toBe(true);
  expect(problems).toEqual([]);
}

/** Імена кнопками на телефоні, що вгадує; «Вигадка» — останньою. */
const NAMES = ['Марко', 'Ната', 'Оля', 'Петро', 'Вигадка'];
const phoneButtons52 = (page: Page) => page.locator('button.truth-name').allTextContents();
const phoneButtonClasses52 = (page: Page) => page.locator('button.truth-name').evaluateAll((all) => all.map((el) => el.className));

/** Кадри від позиції from не мають жодної ознаки вигадки: ні "fake":true, ні fake-N, ні правильної відповіді. */
function expectNoFakeIn52(frames: string[], from: number, label: string, texts: string[]) {
  const seen = frames.slice(from).join(NL);
  for (const hidden of ['"fake":true', 'fake-1', 'fake-2', 'fake-3', '"correctId"', '"authorId"', '"actorId"']) expect(seen, `«${hidden}» sent to ${label} before the final reveal`).not.toContain(hidden);
  void texts;
}

async function lobbyFakes52() {
  // ── Вікторина: класика (100) і раунд «Правда» (300, 30 с) з однією заготовленою вигадкою. ──
  const host = await openLight('host52', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host52@example.com');
  const classic = { ...withPoints(withId(single, 'c52'), 100), text: 'Яка планета найбільша?', timeLimit: 30, options: [{ id: 'a', text: 'Сатурн' }, { id: 'b', text: 'Юпітер' }], correctId: 'b' };
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [classic as never], { speedBonus: false, shuffleOptions: false } as never), truthRound('r2', { points: 300, timeLimit: 30, fakes: [SIGHT] })], { leaderboard: 'end' }),
    title: 'Вигадки в лобі 52',
  };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Вигадки в лобі 52' }).getByRole('button', { name: 'Провести', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await openLight('stage52', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await openLight('olya52', 360, 740);
  const petro = await openLight('petro52', 360, 740);
  const marko = await openLight('marko52', 360, 740);
  const nata = await openLight('nata52', 360, 740);
  const phones = new Map<string, Page>([['Оля', olya], ['Петро', petro], ['Марко', marko], ['Ната', nata]]);
  const frames = new Map<string, string[]>([...phones].map(([name, page]) => [name, socketFrames(page)]));
  for (const [name, page] of phones) await join(page, code, name, false);
  await stage.getByText('Ната').waitFor();

  // ── Лобі: три справжні факти; Ната не пише. ──
  await writeFact28b(olya, FACTS.olya);
  await writeFact28b(petro, FACTS.petro);
  await writeFact28b(marko, FACTS.marko);
  await stage.getByText('Фактів: 3', exact).waitFor();
  // Пульт: заготовлена вигадка «з редактора»; додаємо свою, змінюємо, додаємо зайву й прибираємо.
  const panel = host.locator('.truth-fakes');
  await panel.getByRole('heading', { name: 'Вигадані факти', ...exact }).waitFor();
  const preset = panel.locator('.truth-fake', { hasText: SIGHT });
  await preset.getByText('з редактора', exact).waitFor();
  await field(host, 'Вигадані факти').fill(JUGGLE);
  await click(host, 'Додати вигаданий факт');
  const added = panel.locator('.truth-fake').nth(1);
  await added.getByText(JUGGLE, exact).waitFor();
  await added.waitFor();
  expect(await added.getByText('з редактора', exact).count(), 'a host fake is not a preset').toBe(0);
  // Дії ведучого над вигадками — не частіше двох за секунду (як приховування фактів): між ними пауза.
  await sleep(700);
  await added.getByRole('button', { name: 'Змінити', ...exact }).click();
  await added.locator('textarea').fill(JUGGLE_NEW);
  await sleep(700);
  await added.getByRole('button', { name: 'Зберегти', ...exact }).click();
  const edited = panel.locator('.truth-fake', { hasText: JUGGLE_NEW });
  await edited.waitFor();
  await sleep(700);
  await field(host, 'Вигадані факти').fill('Тимчасова вигадка');
  await click(host, 'Додати вигаданий факт');
  const temp = panel.locator('.truth-fake', { hasText: 'Тимчасова вигадка' });
  await temp.waitFor();
  await sleep(700);
  await temp.getByRole('button', { name: 'Прибрати', ...exact }).click();
  await expect.poll(() => panel.locator('.truth-fake').count(), POLL).toBe(2);
  expect(await panel.locator('.truth-fakes-over').textContent(), 'no limit notice with 2 fakes and 3 facts').toBe('');
  // Сцена й телефони: ні вигадок, ні їх числа — лише «Фактів: 3».
  for (const [label, page] of [['stage', stage], ['Оля', olya], ['Ната', nata]] as const) {
    const html = await page.content();
    expect(html, `${label}: a fake in the lobby`).not.toContain('сяйво');
    expect(html, `${label}: a fake in the lobby`).not.toContain('жонглювати');
  }
  expect(await bodyText(stage)).toContain('Фактів: 3');
  expect([...frames.values(), stageFrames].map((list) => list.join(NL)).join(NL), 'a fake text sent in the lobby').not.toMatch(/сяйво|жонглювати/);
  await host.setViewportSize({ width: 360, height: 800 });
  // Низ панелі з «Додати вигаданий факт» — над липкою смугою «Почати гру» (scroll-margin-block-end панелі).
  await panel.evaluate((node) => node.scrollIntoView({ block: 'end' }));
  const addBox = await host.getByRole('button', { name: 'Додати вигаданий факт', ...exact }).boundingBox();
  const barBox = await host.locator('footer.actions').last().boundingBox();
  expect(addBox !== null && barBox !== null && addBox.y + addBox.height <= barBox.y, '«Додати вигаданий факт» above the sticky bar').toBe(true);
  await expectNoSideScroll(host, 'truth52-host-lobby-full');
  await viewportShot(host, 'truth52-host-lobby');
  await host.setViewportSize({ width: 1280, height: 900 });

  // ── Класика: усі правильно (по 100). ──
  const scores = async (wanted: Record<string, string>) => {
    for (const [name, page] of phones) await expect.poll(() => phoneScore27a(page).textContent(), POLL).toBe(wanted[name]);
  };
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones.values());
  await click(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones.values());
  for (const page of phones.values()) await page.getByRole('button', { name: /Юпітер/ }).click();
  await reveal28a(host);
  await scores({ Оля: '100', Петро: '100', Марко: '100', Ната: '100' });
  await step27a(host, 'Далі');
  await step27a(host, 'Наступний раунд');
  // Заставка рахує й вигадки, що зіграються (три факти + дві вигадки), — як «Факт 1 з 5»; котре вигадка, не видає.
  await stage.locator('.round-facts').getByText('5 запитань · 30 с на кожне', exact).waitFor();
  await step27a(host, 'Почати раунд');

  // ── Раунд: п'ять запитань; яка вигадка — лише на пульті. ──
  const roundFrom = new Map<string, number>([['stage', stageFrames.length], ...[...frames].map(([name, list]): [string, number] => [name, list.length])]);
  const picks: Record<string, [string, string][]> = {
    Марко: [['Оля', 'Вигадка'], ['Петро', 'Марко'], ['Ната', 'Оля']],
    Оля: [['Петро', 'Оля'], ['Марко', 'Петро'], ['Ната', 'Марко']],
    Петро: [['Оля', 'Марко'], ['Марко', 'Ната'], ['Ната', 'Оля']],
  };
  const fakePicks: [string, string][][] = [
    [['Ната', 'Вигадка'], ['Петро', 'Оля'], ['Оля', 'Марко'], ['Марко', 'Оля']],
    [['Ната', 'Марко'], ['Оля', 'Петро'], ['Петро', 'Марко'], ['Марко', 'Петро']],
  ];
  const recap: string[] = [];
  const seenReal: string[] = [];
  let fakeCount = 0;
  let previous = '';
  let firstReal: string[] | null = null;
  let firstFake: string[] | null = null;
  let firstFakeClasses: string[] = [];
  let firstRealClasses: string[] = [];
  for (let k = 0; k < 5; k++) {
    if (k > 0) await next27a(host);
    await afterSplash(host, stage, ...phones.values());
    await expect.poll(() => stage.locator('.truth-stage h1').textContent(), POLL).not.toBe(previous);
    const factText = (await stage.locator('.truth-stage h1').textContent())!;
    previous = factText;
    await stage.getByText(`Факт ${k + 1} з 5`, exact).waitFor();
    await host.locator('.truth-host-author').waitFor();
    // Пульт знає, яке запитання вигадка; зал — ні.
    const fake = (await host.locator('.truth-fake-mark').count()) > 0;
    const author = fake ? null : (await host.locator('.truth-host-author').textContent())!.replace(/^Автор: /, '');
    if (fake) {
      await host.locator('.truth-fake-mark').getByText('вигадка', exact).waitFor();
      await host.locator('.truth-host-author').getByText('Вигадка ведучого — правильна відповідь «Вигадка»', exact).waitFor();
      expect([SIGHT, JUGGLE_NEW], 'a fake text').toContain(factText);
    } else {
      expect(Object.values(FACTS), 'a real fact').toContain(factText);
      expect(seenReal, 'a fact asked twice').not.toContain(author);
      seenReal.push(author!);
    }
    // Однаково для обох видів: «Вигадка» останньою, жодного «Відповіли N з M».
    await expect.poll(() => nata.locator('button.truth-name').count(), POLL).toBe(5);
    expect(await phoneButtons52(nata), `buttons on Ната’s phone, question ${k + 1}`).toEqual(NAMES);
    expect(await stage.locator('.truth-stage-names li').allTextContents(), `names on the stage, question ${k + 1}`).toEqual(NAMES);
    expect(await stage.getByText(/Відповіли/).count(), 'an answered counter on the stage').toBe(0);
    expect(await bodyText(nata), 'an answered counter on the phone').not.toMatch(/Відповіли/);
    const classes = await phoneButtonClasses52(nata);
    if (fake) {
      firstFake ??= await phoneButtons52(nata);
      if (firstFakeClasses.length === 0) {
        firstFakeClasses = classes;
        await viewportShot(nata, 'truth52-phone-pick-light-360');
        await expectNoSideScroll(nata, 'truth52-phone-pick-fake-full-360');
      }
    } else {
      firstReal ??= await phoneButtons52(nata);
      if (firstRealClasses.length === 0) {
        firstRealClasses = classes;
        await viewportShot(nata, 'truth52-phone-pick-real-light-360');
      }
    }
    if (k === 0) {
      expect(await isLight(stage), 'the light stage').toBe(true);
      expect(await isLight(nata), 'the light phone').toBe(true);
      if (process.env.E2E_SHOTS === '1') await sleep(800);
      await viewportShot(stage, 'truth52-stage-question');
    }
    // Вибір за сценарієм: автор справжнього факту нічого не обирає (лише читає); на вигадці вгадують усі.
    const wanted = fake ? fakePicks[fakeCount++]! : picks[author!]!;
    if (!fake) expect(await phones.get(author!)!.locator('.truth-own').count(), `the author notice for ${author}`).toBe(1);
    for (const [name, pick] of wanted) await pickName28b(phones.get(name)!, pick);
    recap.push(
      fake
        ? `${factText}Вигадка${wanted.some(([, p]) => p === 'Вигадка') ? 'Вгадали: Ната' : 'Ніхто не вгадав'}`
        : `${factText}${author}${author === 'Марко' || author === 'Оля' ? 'Вгадали: Петро' : 'Ніхто не вгадав'}Автор: +${author === 'Петро' ? 300 : 200}`,
    );
    if (k < 4) {
      // До останнього розкриття ні сцена, ні телефони ознак вигадки не отримали.
      expectNoFakeIn52(stageFrames, roundFrom.get('stage')!, 'the stage', []);
      for (const [name, list] of frames) expectNoFakeIn52(list, roundFrom.get(name)!, name, []);
      const stageHtml = await stage.content();
      for (const hidden of ['Це вигадка ведучого', 'Вигадка ведучого', 'truth-fake-mark', 'is-fake']) expect(stageHtml, `«${hidden}» on the stage before the recap`).not.toContain(hidden);
    }
    await reveal28a(host);
    if (k < 4) {
      await stage.locator('.truth-seal').getByText('Відповіді прийнято', exact).waitFor();
      for (const [name, page] of phones) if (name !== author) await page.locator('.truth-held, .truth-own').first().waitFor();
      expectNoFakeIn52(stageFrames, roundFrom.get('stage')!, 'the stage after a sealed reveal', []);
      for (const [name, list] of frames) expectNoFakeIn52(list, roundFrom.get(name)!, `${name} after a sealed reveal`, []);
    }
  }
  // Запитання вигадки й факту однакові за складом, порядком і класами кнопок.
  expect(firstFake, 'buttons of a fake question').toEqual(firstReal);
  expect(firstFakeClasses, 'button classes of a fake question').toEqual(firstRealClasses);
  expect(fakeCount).toBe(2);
  expect(seenReal.sort()).toEqual(['Марко', 'Оля', 'Петро']);

  // ── Підсумок раунду: картки «Вигадка» (одним словом, як ім'я), бали. ──
  await expect.poll(() => stage.locator('.truth-recap-card').count(), POLL).toBe(5);
  expect(await stage.locator('.truth-recap-card').allTextContents()).toEqual(recap);
  expect(await stage.locator('.truth-recap-card.is-fake').count()).toBe(2);
  expect(await stage.locator('.truth-recap-card.is-fake .truth-recap-author').getByText('Вигадка', exact).count()).toBe(2);
  expect(await stage.locator('.truth-recap-card.is-fake').getByText(/Автор:/).count(), 'author points on a fake').toBe(0);
  await expect.poll(() => nata.locator('.truth-recap-card').count(), POLL).toBe(5);
  await nata.locator('.truth-recap-mine.is-correct').getByText('Ваш вибір: Вигадка ✓', exact).waitFor();
  await nata.locator('.truth-recap-score').getByText('Ви вгадали 1 з 5', exact).waitFor();
  await petro.locator('.truth-recap-card.is-fake .truth-recap-author').first().getByText('Вигадка', exact).waitFor();
  // Оля на картці Марка обрала «Вигадка»: ✗, а Марко отримав частку й за цей вибір (200 з 300).
  await olya.locator('.truth-recap-mine.is-wrong').getByText('Ваш вибір: Вигадка ✗', exact).waitFor();
  await expect.poll(() => host.locator('.truth-recap-card').count(), POLL).toBe(5);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'truth52-recap-light');
  await viewportShot(nata, 'truth52-recap-phone-360');
  await nata.locator('.truth-recap-card.is-fake').first().scrollIntoViewIfNeeded();
  await viewportShot(nata, 'truth52-recap-phone-fake-360');
  await expectNoSideScroll(nata, 'truth52-recap-phone-full-360');
  await expectNoSideScroll(petro, 'truth52-recap-petro-full-360');
  await shot(host, 'truth52-host-recap');
  // Рахунки: Оля 100 + 200; Петро 100 + 300 + 300 + 300; Марко 100 + 200; Ната 100 + 300 за вигадку.
  await scores({ Оля: '300', Петро: '1000', Марко: '300', Ната: '400' });

  // ── Історія гри. ──
  await toWinners27c(host, stage);
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Вигадки в лобі 52/ }).click();
  await host.getByText('Запитань зіграно: 6 з 6', exact).waitFor();
  const fakeRow = host.locator('.rows.stacked > li', { hasText: SIGHT });
  expect(await fakeRow.locator('.truth-history').textContent()).toContain('Вигадка ведучого');
  expect(await fakeRow.locator('.truth-history').textContent(), 'an author on a fake').not.toContain('Факт написав');
  expect(problems).toEqual([]);
}

async function autopilotFakes52(sockets: Socket[]) {
  const author = await openLight('author52', 1280, 900);
  await register(author, 'host', 'Марта Авторка', 'author52@example.com');
  const data = { ...makeRoundsQuiz([truthRound('t52', { points: 300, timeLimit: 30, fakes: [SIGHT] })], { leaderboard: 'end' }), title: 'Автопілот вигадки 52' };
  const saved = await author.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await saved.json()) as { id: string }).id;
  const room = await createAutopilot(author, quizId);
  const { code } = room;
  const marta = await pilotSocket(sockets, code, room.token, 'Марта');
  const vira = await pilotPlayer(sockets, code, 'Віра');
  const petro = await openLight('petro52a', 360, 740);
  await join(petro, code, 'Петро', false);

  // Лобі: факти пишуть усі троє; вигадку гравець додати не може (навіть автор кімнати), заготовлена — вже є.
  await emitOk(marta, 'player:truth', { text: 'Я стрибала з парашутом' });
  await emitOk(vira, 'player:truth', { text: 'Я їла сарану в Таїланді' });
  await writeFact28b(petro, 'Я вивчив іспанську за рік');
  expect(await vira.emit('host:truth-fake', { id: null, text: 'Я бігала марафон' })).toEqual({ ok: false, error: 'not_allowed' });
  expect(await marta.emit('host:truth-fake', { id: null, text: 'Я бігала марафон' })).toEqual({ ok: false, error: 'not_allowed' });
  expect(await marta.emit('host:truth-fake', { id: 'fake-1', text: '' })).toEqual({ ok: false, error: 'not_allowed' });
  expect(await bodyText(petro), 'a fake panel for a player').not.toContain('Вигадані факти');
  expect(await marta.emit('host:start')).toEqual({ ok: true });

  // П'ять запитань? Ні: три факти й одна вигадка — чотири. Усі, хто не автор, обирають «Вигадка»: на вигадці це ціна, на фактах — промах.
  let lastId = '';
  let from = 0;
  for (let k = 0; k < 4; k++) {
    const q = await frame(vira, (v) => v.phase === 'question' && v.question !== null && v.question.text !== lastId && v.truth != null, from, 120_000);
    lastId = q.view.question!.text;
    from = q.index;
    const text = q.view.question!.text;
    expect(q.view.question!.choices?.at(-1)?.id, 'the fake option comes last in every question').toBe('fake');
    for (const pilot of [marta, vira]) {
      const mine = await frame(pilot, (v) => v.phase === 'question' && v.question?.text === lastId, 0, 20_000);
      if (mine.view.me.truth?.own === true) continue;
      await emitOk(pilot, 'player:answer', { type: 'single', optionId: 'fake' });
    }
    await petro.getByText(text, exact).first().waitFor();
    await expect.poll(async () => (await petro.locator('button.truth-name').count()) + (await petro.locator('.truth-own').count()), POLL).toBeGreaterThan(0);
    if ((await petro.locator('button.truth-name').count()) > 0) {
      if (k === 0) {
        expect(await phoneButtons52(petro)).toContain('Вигадка');
        await viewportShot(petro, 'truth52-autopilot-pick-360');
      }
      await pickName28b(petro, 'Вигадка');
    }
  }
  // Підсумок: «Вигадка», вигадка — ціна (+300 кожному), справжні факти — частка автора (+300): по 600.
  await petro.locator('.truth-recap-card.is-fake').first().waitFor({ timeout: 90_000 });
  await petro.locator('.truth-recap-card.is-fake .truth-recap-author').getByText('Вигадка', exact).waitFor();
  expect(await petro.locator('.truth-recap-card.is-fake').locator('.truth-recap-fact').textContent()).toBe(SIGHT);
  expect(await petro.locator('.truth-recap-card').count()).toBe(4);
  await expect.poll(() => phoneScore27a(petro).textContent(), POLL).toBe('600');
  await petro.locator('.truth-recap-card.is-fake').first().scrollIntoViewIfNeeded();
  await expectNoSideScroll(petro, 'truth52-autopilot-full-360');
  await viewportShot(petro, 'truth52-autopilot-360');
  expect(await isLight(petro), 'the light phone').toBe(true);
  expect(problems).toEqual([]);
}
