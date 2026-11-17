import { classicRound, makeRoundsQuiz, single, withId, withPoints } from '@quiz/engine/testing';
import { type Locator, type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, field, join, expectNoSideScroll, register, POLL, socketFrames, RESTARTING_TEXT, NL, sleep, step27a, phoneScore27a, reveal28a, pilotPlayer, pilotSocket, frame, emitOk, expectGap, createAutopilot, duelButton, duelAnswer, answerAll, slowSocket, pickTeamOn, teamRowOf, expectApart, type Pilot } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, shot, restart, flags, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 39 — ставки на дуелянтів: ставка інших гравців у редакторі (100 типово, 0 — без ставок), ставки й зміна
 * вибору до першого запитання дуелі, хто на кого на сцені, виграш і програш ставки, нічия, мінус, перезапуск, капітани команд,
 * 24 гравці на сцені 1280×720 у темній і світлій темі, телефон 320 px, автопілот чекає ставок 25 с.
 */

useE2eServer();

it('part 39: editor — a bet stake for the other players, 100 by default, 0 turns bets off', async () => {
  try {
    await editor39();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 39: duel bets — others bet and change their minds until the first duel question, the stage shows who, the result pays them, 320 px, light theme', async () => {
  try {
    await game39();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 39: duel bets — a tie pays nothing, a loser goes below zero, a withdrawn bet pays nothing, a restart keeps the bets', async () => {
  try {
    await tie39();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 39: teams — a captain of a third team bets for the team, a restart keeps the bet, two teams have no bets', async () => {
  try {
    await teams39();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

it('part 39: 24 players — bettors under the duellists stay inside 1280×720 in dark and light theme, the autopilot waits 25 s for bets', async () => {
  const sockets: Socket[] = [];
  try {
    await crowd39(sockets);
    await autopilot39(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 600_000);

// ——— Помічники ———

/** Відповіді запитань дуелей: столиці (не росії) і природа. */
const ANSWERS39: Record<string, string> = {
  'Столиця Франції?': 'Париж',
  'Столиця Італії?': 'Рим',
  'Столиця Польщі?': 'Варшава',
  'Столиця Іспанії?': 'Мадрид',
  'Найбільший океан Землі?': 'Тихий',
  'Найвища гора світу?': 'Еверест',
  'Найдовша річка України?': 'Дніпро',
};

/** Пул дуелей e2e: дві категорії, 2 запитання за дуель, 30 с, ставка 300; betStake — лише якщо задано. */
function duels39(betStake?: number) {
  return {
    categories: [
      {
        id: 'dc1',
        title: 'Столиці',
        questions: [
          { id: 'd1', text: 'Столиця Франції?', accepted: ['Париж'] },
          { id: 'd2', text: 'Столиця Італії?', accepted: ['Рим'] },
          { id: 'd3', text: 'Столиця Польщі?', accepted: ['Варшава'] },
          { id: 'd4', text: 'Столиця Іспанії?', accepted: ['Мадрид'] },
        ],
      },
      {
        id: 'dc2',
        title: 'Природа',
        questions: [
          { id: 'd5', text: 'Найбільший океан Землі?', accepted: ['Тихий', 'Тихий океан'] },
          { id: 'd6', text: 'Найвища гора світу?', accepted: ['Еверест', 'Джомолунгма'] },
          { id: 'd7', text: 'Найдовша річка України?', accepted: ['Дніпро'] },
        ],
      },
    ],
    questionsPerDuel: 2,
    timeLimit: 30,
    stake: 300,
    ...(betStake === undefined ? {} : { betStake }),
  };
}

/** Дві класики по 3 запитання (поріг дуелі 2), 30 с, без бонусу швидкості. */
function quiz39(title: string, betStake: number | undefined, settings: Record<string, unknown> = {}) {
  const q = (n: number) => ({ ...withPoints(withId(single, `q${n}`), 100), text: `Запитання ${n}: столиця України?`, timeLimit: 30 });
  const rounds = [
    classicRound('r1', [q(1), q(2), q(3)], { title: 'Розминка', speedBonus: false }),
    classicRound('r2', [q(4), q(5), q(6)], { title: 'Другий', speedBonus: false }),
  ];
  return { ...makeRoundsQuiz(rounds, { leaderboard: 'end', ...settings }), title, duels: duels39(betStake) };
}

/** Зберігає вікторину, відкриває кімнату й сцену 1280×720; повертає код, сцену і її кадри. */
async function room39(host: Page, data: Record<string, unknown>, stageName: string) {
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: data.title as string }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open(stageName, 1280, 720);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  return { code, stage, stageFrames };
}

/** Рахунок рядка гравця на пульті (знак мінуса «−» → «-»). */
async function hostScore39(host: Page, nickname: string): Promise<number> {
  const text = await host.locator('.player-row', { hasText: nickname }).locator('.score').first().textContent();
  return Number(text!.replace('−', '-').replace(/[^\d-]/g, ''));
}

async function scores39(host: Page, wanted: Record<string, number>) {
  for (const [nickname, score] of Object.entries(wanted)) await expect.poll(() => hostScore39(host, nickname), POLL).toBe(score);
}

/** Кнопка ставки на телефоні за іменем дуелянта (чи «Без ставки»). */
const betButton39 = (page: Page, name: string) => page.locator('.duel-bet').getByRole('button', { name, ...exact });

/** Ставка з телефона: кнопка стає натиснутою. */
async function bet39(page: Page, name: string) {
  const button = betButton39(page, name);
  await expect.poll(() => button.isEnabled().catch(() => false), POLL).toBe(true);
  await button.click();
  await expect.poll(() => button.getAttribute('aria-pressed'), POLL).toBe('true');
}

/** Імена на кнопках ставки й позначки aria-pressed. */
const betLook39 = (page: Page) =>
  page.locator('.duel-bet button').evaluateAll((all) => all.map((el) => `${(el.textContent ?? '').trim()}:${el.getAttribute('aria-pressed')}:${(el as HTMLButtonElement).disabled ? 'off' : 'on'}`));

/** Сцена: «Поставили n» і імена під кожним дуелянтом. */
const stageBets39 = (stage: Page) =>
  stage.locator('.duel-stage-flank').evaluateAll((all) =>
    all.map((flank) => ({
      count: (flank.querySelector('.duel-stage-bets-count')?.textContent ?? '').trim(),
      names: [...flank.querySelectorAll('.duel-stage-bets li')].map((li) => (li.textContent ?? '').trim()),
    })),
  );

/** Запитання дуелі на сцені → відповідь з ANSWERS39. */
async function duelQuestion39(stage: Page, except?: string): Promise<{ text: string; answer: string }> {
  const scope = stage.locator('.duel-stage-question');
  await expect.poll(async () => {
    const text = ((await scope.textContent().catch(() => '')) ?? '').trim();
    return text !== '' && text !== except && ANSWERS39[text] !== undefined;
  }, { timeout: 15_000 }).toBe(true);
  const text = (await scope.textContent())!.trim();
  return { text, answer: ANSWERS39[text]! };
}

/** Дуелянт відповідає на запитання дуелі правильно; сцена показує, хто виграв запитання. */
async function winQuestion39(stage: Page, duellist: Page, name: string, except?: string): Promise<string> {
  const { text, answer } = await duelQuestion39(stage, except);
  await duelAnswer(duellist, answer);
  await stage.locator('.duel-stage').getByText(`Це запитання виграє ${name}: «${answer}»`, exact).waitFor();
  return text;
}

/** Контраст тексту з його справжнім тлом (альфи предків змішано через canvas): відношення яскравостей WCAG. */
async function contrast39(scope: Locator): Promise<{ color: string; background: string; ratio: number }> {
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

async function expectReadable39(scope: Locator, name: string) {
  const { color, background, ratio } = await contrast39(scope);
  console.log(`part 39: ${name} — ${color} on ${background}, contrast ${ratio.toFixed(2)}`);
  expect(color, `${name}: the text colour is the background`).not.toBe(background);
  expect(ratio, `${name}: contrast ${color} on ${background}`).toBeGreaterThanOrEqual(3);
}

/** Вибрана кнопка ставки виглядає інакше, ніж невибрана (рамка чи тло), і її текст читається. */
async function expectPressedMark39(page: Page, name: string) {
  const look = (selector: string) => page.locator(selector).first().evaluate((el) => `${getComputedStyle(el).borderTopColor} ${getComputedStyle(el).borderLeftColor} / ${getComputedStyle(el).backgroundColor}`);
  const [pressed, plain] = await Promise.all([look('.duel-bet-sides .btn[aria-pressed="true"]'), look('.duel-bet-sides .btn[aria-pressed="false"]')]);
  console.log(`part 39: ${name} — the pressed bet ${pressed}, a plain one ${plain}`);
  expect(pressed, `${name}: the pressed bet looks like a plain one`).not.toBe(plain);
  await expectReadable39(page.locator('.duel-bet-sides .btn[aria-pressed="true"]'), `${name} pressed name`);
}

/** Тема пристрою: light — quiz:theme = light; dark — ключа немає. Перезавантаження: гра повертається за токеном. */
async function theme39(page: Page, mode: 'light' | 'dark') {
  await page.evaluate((wanted) => (wanted === 'light' ? localStorage.setItem('quiz:theme', 'light') : localStorage.removeItem('quiz:theme')), mode);
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('is-light')), POLL).toBe(mode === 'light');
}

/**
 * Сцена дуелі: без прокрутки; selector, обидва боки, ставці й підсумок не виходять за край вікна; імена ставців не обрізано вбік;
 * нічого з дуелі не під кнопками кута сцени («Читати вголос», тема) і не під смугою реакцій.
 */
async function expectBoardInView39(stage: Page, selector: string, name: string) {
  const [height, clientH, width, clientW] = (await stage.evaluate('[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]')) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const viewport = stage.viewportSize()!;
  for (const target of [selector, '.duel-stage-flank >> nth=0', '.duel-stage-flank >> nth=1', '.duel-stage-center']) {
    const box = (await stage.locator(target).first().boundingBox())!;
    console.log(`part 39: ${name} — ${target} ${Math.round(box.width)}×${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)}, bottom ${Math.round(box.y + box.height)} of ${viewport.height}`);
    expect(box.y + box.height, `${name}: ${target} reaches below the ${viewport.height} px stage`).toBeLessThanOrEqual(viewport.height + 1);
    expect(box.x + box.width, `${name}: ${target} reaches past the right edge`).toBeLessThanOrEqual(viewport.width + 1);
  }
  const out = await stage
    .locator('.duel-stage-bets li, .duel-stage-bets p, .duel-stage-side, .duel-stage-center > *, .duel-stage-body > *')
    .evaluateAll((all) => all.filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.left < -1 || r.top < -1); }).map((el) => el.textContent));
  expect(out, `${name}: items outside the stage`).toEqual([]);
  const clipped = await stage.locator('.duel-stage-bets li, .duel-stage-bet-outcome').evaluateAll((all) => all.filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map((el) => el.textContent));
  expect(clipped, `${name}: clipped bettor names`).toEqual([]);
  // Списки двох боків не налазять на центр: стовпці сітки не перекриваються.
  const overlap = await stage.evaluate(() => {
    const [left, right] = [...document.querySelectorAll('.duel-stage-flank')].map((el) => el.getBoundingClientRect());
    const center = document.querySelector('.duel-stage-center')!.getBoundingClientRect();
    return left!.right > center.left + 1 || right!.left < center.right - 1;
  });
  expect(overlap, `${name}: a side column runs into the centre`).toBe(false);
  const covered = await stage.evaluate(() => {
    const blockers = [...document.querySelectorAll('.stage-speech button, .reaction-strip')].map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
    return [...document.querySelectorAll('.duel-stage-bets li, .duel-stage-bets p, .duel-stage-side, .duel-stage-bet-outcome, .duel-stage-score')]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return blockers.some((b) => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top);
      })
      .map((el) => el.textContent);
  });
  expect(covered, `${name}: duel items under a fixed corner`).toEqual([]);
}

/** Телефон: кнопки ставки не ширші за екран і не обрізають імен; смуга дуелі не накриває кнопок. */
async function expectBetFits39(page: Page, name: string) {
  await page.locator('.duel-bet').waitFor();
  const wide = await page.locator('.duel-bet, .duel-bet button').evaluateAll((all) => all.filter((el) => el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1 || el.scrollWidth > el.clientWidth + 1).map((el) => el.className + ': ' + el.textContent));
  expect(wide, `${name}: bet buttons wider than the phone`).toEqual([]);
  // Імена переносяться між словами: найдовше слово (до 10 літер, як «Литвиненко») вміщається в кнопку цілим.
  const broken = await page.locator('.duel-bet-sides button').evaluateAll((all) =>
    all.flatMap((button) => {
      const style = getComputedStyle(button);
      const room = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return (button.textContent ?? '').split(/\s+/).filter((word) => {
        const probe = document.createElement('span');
        probe.textContent = word;
        probe.style.cssText = `font: ${style.font}; letter-spacing: ${style.letterSpacing}; white-space: nowrap; position: absolute; visibility: hidden;`;
        document.body.append(probe);
        const fits = probe.getBoundingClientRect().width <= room + 0.5;
        probe.remove();
        return !fits;
      });
    }),
  );
  expect(broken, `${name}: words broken inside a bet button`).toEqual([]);
  // Смуга дуелі внизу не накриває ні кнопок, ні результату, ні запитання, коли сторінку прокручено донизу.
  if ((await page.locator('.duel-banner').count()) > 0) {
    await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await expectApart(page, '.duel-banner', ['.duel-bet button', 'section.result', 'h1.question'], `${name} banner`);
    await page.evaluate('window.scrollTo(0, 0)');
  }
  const covered = await page.evaluate(() => {
    const banner = document.querySelector('.duel-banner')?.getBoundingClientRect();
    if (banner === undefined) return [];
    // Кнопки прокручено в поле зору: смуга закріплена, тож перевіряємо кожну там, де її видно.
    return [...document.querySelectorAll('.duel-bet button')]
      .filter((el) => {
        el.scrollIntoView({ block: 'center' });
        const box = el.getBoundingClientRect();
        const bar = document.querySelector('.duel-banner')!.getBoundingClientRect();
        return box.top < bar.bottom && box.bottom > bar.top;
      })
      .map((el) => el.textContent);
  });
  expect(covered, `${name}: bet buttons under the duel banner`).toEqual([]);
  await expectNoSideScroll(page, name);
}

/** Кадри з from: без прийнятних відповідей дуелі й без текстів спроб. */
function expectNoDuelSecrets39(who: string, frames: string[], from: number) {
  const text = frames.slice(from).join(NL);
  expect(text.length, `${who}: no frames at the category`).toBeGreaterThan(0);
  expect(text.includes('"tryTexts"'), `${who}: tryTexts at the category`).toBe(false);
  expect(/"accepted":\["/.test(text), `${who}: accepted answers at the category`).toBe(false);
}

/** Кожен кадр state телефона з from несе щонайбільше один «bet» — свій. */
function ownBetOnly39(who: string, frames: string[], from: number): string[] {
  const states = frames.slice(from).filter((f) => f.startsWith('42["state"'));
  expect(states.length, `${who}: no state frames`).toBeGreaterThan(0);
  for (const f of states) expect(f.match(/"bet":/g)?.length ?? 0, `${who}: more than one bet in a frame`).toBeLessThanOrEqual(1);
  return states.map((f) => f.match(/"bet":(null|\{[^}]*\})/)?.[1] ?? 'none');
}

/** Перезапуск сервера посеред гри; пульт продовжує, якщо гра стала на паузу. */
async function restart39(host: Page, stage: Page, phones: Page[]) {
  await restart(async () => {
    await stage.getByText(RESTARTING_TEXT, exact).waitFor({ timeout: 15_000 });
  });
  for (const page of [stage, ...phones, host]) await page.getByText(RESTARTING_TEXT, exact).waitFor({ state: 'detached', timeout: 15_000 });
  flags.restarting = false;
  const resume = host.getByRole('button', { name: 'Продовжити', ...exact }).first();
  if (await resume.waitFor({ timeout: 3000 }).then(() => true, () => false)) await resume.click();
}

/** Сума команди на пульті зі знаком (мінус «−»). */
async function teamTotal39(host: Page, name: string): Promise<number> {
  const text = await teamRowOf(host, name).locator('.score').first().textContent();
  return Number(text!.replace('−', '-').replace(/[^\d-]/g, ''));
}

/** До раунду: «Почати гру», «Почати раунд». */
async function startRound39(host: Page, stage: Page, phones: Page[]) {
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
}

// ——— 1. Редактор ———

async function editor39() {
  const host = await open('host39e', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host39e@example.com');
  // Вікторина без дуелей: дуелі вмикаються в редакторі.
  const { duels: _none, ...plain } = quiz39('Ставки 39 редактор', undefined);
  const saved = await host.request.post(`${base}/api/quizzes`, { data: plain });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[]).find((entry) => entry.title === 'Ставки 39 редактор')!.id;
  const stored = async () => ((await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { duels?: { betStake?: number; stake: number } }).duels;
  const edit = async () => {
    await host.goto(`${base}/quizzes`);
    await host.locator('.quiz-list li', { hasText: 'Ставки 39 редактор' }).getByRole('link', { name: 'Редагувати' }).click();
    await host.locator('main.editor').waitFor();
    const section = host.locator('details.duels');
    if ((await section.getAttribute('open')) === null) await section.locator('summary').click();
    return section;
  };

  // ── Увімкнули дуелі: поле ставки інших — 100, підказка поруч. ──
  const section = await edit();
  await section.getByRole('checkbox', { name: 'Дуелі між гравцями', ...exact }).check();
  const betField = () => field(host, 'Ставка інших гравців на дуелянта');
  await expect.poll(() => betField().inputValue(), POLL).toBe('100');
  await section.getByText('Поки дуель не почалася, інші гравці можуть поставити на одного з дуелянтів: вгадав — +ставка, ні — −ставка, нічия — 0. 0 — ставок немає.', exact).waitFor();
  expect(await field(host, 'Ставка: програвший віддає переможцю').inputValue()).toBe('300');
  // Пул: одна категорія з трьома запитаннями.
  await section.getByLabel('Назва категорії', exact).fill('Природа');
  const pool = [
    ['Найбільший океан Землі?', 'Тихий'],
    ['Найвища гора світу?', 'Еверест'],
    ['Найдовша річка України?', 'Дніпро'],
  ];
  for (const [at, [text, answer]] of pool.entries()) {
    const block = section.locator('.duel-question').nth(at);
    await block.locator('textarea').fill(text!);
    await block.getByLabel('Написання 1', exact).fill(answer!);
  }
  await shot(host, 'bets39-editor');
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  expect(await stored(), 'the duels after the first save').toMatchObject({ betStake: 100, stake: 300 });

  // ── 5001 — проблема налаштувань дуелей, зберегти не можна. ──
  await edit();
  await expect.poll(() => betField().inputValue(), POLL).toBe('100');
  await betField().fill('5001');
  await click(host, 'Зберегти');
  await host.locator('.problems', { hasText: 'Дуелі: запитань за дуель — від 1 до 7, час — від 5 до 120 с, ставка — від 0 до 5000.' }).waitFor();
  expect(host.url(), 'a 5001 bet stake was saved').not.toMatch(/\/quizzes$/);
  expect((await stored())?.betStake, 'the stored bet stake after a refused save').toBe(100);
  await shot(host, 'bets39-editor-5001');

  // ── 0 — ставок немає, зберігається. ──
  await betField().fill('0');
  await expect.poll(() => host.locator('.problems', { hasText: 'Дуелі: запитань за дуель' }).count(), POLL).toBe(0);
  await click(host, 'Зберегти');
  await host.waitForURL(/\/quizzes$/);
  expect((await stored())?.betStake, 'a zero bet stake').toBe(0);
  await edit();
  await expect.poll(() => betField().inputValue(), POLL).toBe('0');
  await host.setViewportSize({ width: 375, height: 812 });
  await betField().scrollIntoViewIfNeeded();
  await expectNoSideScroll(host, 'bets39-editor-375');

  expect(problems).toEqual([]);
}

// ——— 2. Гра: ставки, зміна вибору, закриття, виграш ———

async function game39() {
  const host = await open('host39', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host39@example.com');
  // Без поля betStake: стара вікторина з дуелями — ставки 100.
  const { code, stage, stageFrames } = await room39(host, quiz39('Ставки 39 гра', undefined), 'stage39');
  const olya = await open('olya39', 320, 640, { hasTouch: true, isMobile: true });
  const petro = await open('petro39', 375, 812);
  const ira = await open('ira39', 360, 740);
  const taras = await open('taras39', 360, 740);
  const hanna = await open('hanna39', 360, 740);
  // Іра — через проксі сокета: її кадри можна затримати, щоб натиснути ставку вже після закриття.
  const iraSocket = await slowSocket(ira);
  const phones = [olya, petro, ira, taras, hanna];
  const names = ['Оля', 'Петро', 'Іра', 'Тарас', 'Ганна'];
  const frames = new Map<string, string[]>([['Оля', socketFrames(olya)], ['Петро', socketFrames(petro)], ['Тарас', socketFrames(taras)], ['Ганна', socketFrames(hanna)]]);
  for (const [at, page] of phones.entries()) await join(page, code, names[at]!, false);
  await stage.getByText('Ганна').waitFor();
  await startRound39(host, stage, phones);

  // ── Два запитання: усі правильно (по 200); після другого Оля викликає Петра. ──
  for (const n of [1, 2]) {
    await olya.locator('h1', { hasText: `Запитання ${n}:` }).waitFor();
    await answerAll(host, phones);
    if (n === 1) await step27a(host, 'Далі');
  }
  await duelButton(olya).click();
  await olya.getByRole('dialog', { name: 'Кого викликати на дуель?' }).getByRole('button', { name: 'Петро', ...exact }).click();
  await host.getByText('Оголошено дуель: Оля — Петро', exact).waitFor();

  // ── Оголошено: ставці бачать «На кого ставите?» з кнопками «Оля»/«Петро» і «Без ставки»; дуелянти — ні. ──
  for (const page of [ira, taras, hanna]) {
    await page.locator('.duel-bet .lead', { hasText: 'На кого ставите?' }).waitFor();
    await page.locator('.duel-bet').getByText('Ставка: 100', exact).waitFor();
    await expect.poll(() => betLook39(page), POLL).toEqual(['Оля:false:on', 'Петро:false:on', 'Без ставки:true:on']);
  }
  for (const page of [olya, petro]) expect(await page.locator('.duel-bet').count(), 'a duellist gets bet buttons').toBe(0);
  await bet39(ira, 'Оля');
  await bet39(taras, 'Петро');
  await bet39(hanna, 'Петро');
  await bet39(hanna, 'Оля');
  await expect.poll(() => betLook39(hanna), POLL).toEqual(['Оля:true:on', 'Петро:false:on', 'Без ставки:false:on']);
  for (const page of [stage, ...phones]) await page.locator('.duel-banner .duel-banner-bets').getByText('Ставки: Оля — 2, Петро — 1', exact).waitFor();
  await host.locator('.duel-host-bets').waitFor();
  console.log(`part 39: host bets at declared — ${(await host.locator('.duel-host-bets').innerText()).replace(/\s+/g, ' ')}`);
  await expectNoSideScroll(olya, 'bets39-phone-320');
  await ira.setViewportSize({ width: 320, height: 640 });
  await expectBetFits39(ira, 'bets39-phone-320-bettor');
  await ira.setViewportSize({ width: 360, height: 740 });
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await shot(stage, 'bets39-banner-stage');

  // ── Категорія: під Олею «Поставили 2» з іменами, під Петром «Поставив 1»; кадри без відповідей і спроб. ──
  const from = { stage: stageFrames.length, ...Object.fromEntries([...frames].map(([who, list]) => [who, list.length])) } as Record<string, number>;
  await click(host, 'Почати дуель');
  await afterSplash(stage, ...phones);
  await stage.locator('.duel-stage').getByText('Оля вибирає категорію', exact).waitFor();
  await expect.poll(() => stageBets39(stage), POLL).toEqual([
    { count: 'Поставили 2', names: ['Іра', 'Ганна'] },
    { count: 'Поставив 1', names: ['Тарас'] },
  ]);
  await host.locator('.duel-host-bets', { hasText: 'Оля: Поставили 2' }).waitFor();
  expect(await stage.locator('.duel-banner').count(), 'the banner during the duel').toBe(0);
  // Ставці на телефонах — ті самі кнопки в DuelPlay; Тарас міняє на Олю до вибору категорії.
  await expect.poll(() => betLook39(taras), POLL).toEqual(['Оля:false:on', 'Петро:true:on', 'Без ставки:false:on']);
  for (const page of [olya, petro]) expect(await page.locator('.duel-bet').count(), 'a duellist gets bet buttons on the category').toBe(0);
  await bet39(taras, 'Оля');
  await expect.poll(() => stageBets39(stage), POLL).toEqual([
    { count: 'Поставили 3', names: ['Іра', 'Тарас', 'Ганна'] },
    { count: 'Поставили 0', names: [] },
  ]);
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView39(stage, '.duel-stage', 'category 1280×720');
  await shot(stage, 'bets39-category-stage');
  await shot(host, 'bets39-category-host');

  // ── Світла тема: сцена й телефон 320 px; вибрана кнопка помітна й читається. ──
  await hanna.setViewportSize({ width: 320, height: 640 });
  for (const page of [stage, hanna]) await theme39(page, 'light');
  await stage.locator('.duel-stage-bets li').first().waitFor();
  await expectReadable39(stage.locator('.duel-stage-bets-count').first(), 'light stage bet count');
  await expectReadable39(stage.locator('.duel-stage-bets li').first(), 'light stage bettor');
  await expectPressedMark39(hanna, 'light phone');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView39(stage, '.duel-stage', 'light category 1280×720');
  await shot(stage, 'bets39-light-stage');
  await expectBetFits39(hanna, 'bets39-light-phone-320');
  await expectPressedMark39(taras, 'dark phone');
  for (const page of [stage, hanna]) await theme39(page, 'dark');
  await hanna.setViewportSize({ width: 360, height: 740 });

  // Кадри на category: ні прийнятних відповідей, ні спроб; кожен телефон несе лише свою ставку.
  expectNoDuelSecrets39('stage', stageFrames, from.stage!);
  for (const [who, list] of frames) expectNoDuelSecrets39(who, list, from[who]!);
  const olyaBets = ownBetOnly39('Оля', frames.get('Оля')!, from['Оля']!);
  expect(new Set(olyaBets), 'Оля (duellist) bet frames').toEqual(new Set(['null']));
  expect(ownBetOnly39('Тарас', frames.get('Тарас')!, from['Тарас']!).at(-1)).toBe('{"side":"challenger","can":true}');
  expect(ownBetOnly39('Ганна', frames.get('Ганна')!, from['Ганна']!).at(-1)).toBe('{"side":"challenger","can":true}');

  // ── Оля вибирає «Столиці»: ставки закрито. Кадри Іри затримано — її дотик іде вже після вибору → «Ставки вже закрито…». ──
  iraSocket.delayMs = 1500;
  await sleep(200);
  await olya.getByRole('button', { name: 'Столиці · лишилося 4', ...exact }).click();
  await betButton39(ira, 'Петро').click();
  await stage.locator('.duel-stage-question').waitFor();
  await ira.getByText('Ставки вже закрито — дуель почалася.', exact).waitFor({ timeout: 15_000 });
  iraSocket.delayMs = 0;
  await expect.poll(() => ira.locator('.duel-bet').count(), POLL).toBe(0);
  await expect.poll(() => stageBets39(stage), POLL).toEqual([
    { count: 'Поставили 3', names: [] },
    { count: 'Поставили 0', names: [] },
  ]);

  // ── Оля виграє обидва запитання → підсумок: «Вгадали: Іра, Тарас, Ганна +100». ──
  const first = await winQuestion39(stage, olya, 'Оля');
  await click(host, 'Наступне запитання дуелі');
  await winQuestion39(stage, olya, 'Оля', first);
  await click(host, 'Підсумок дуелі');
  await stage.locator('.duel-stage').getByText('Перемога в дуелі: Оля!', exact).waitFor();
  await stage.locator('.duel-stage-bet-outcome.is-won').getByText('Вгадали: Іра, Тарас, Ганна +100', exact).waitFor();
  expect(await stage.locator('.duel-stage-bet-outcome.is-lost').count(), 'a losers line with no losers').toBe(0);
  expect(await stage.getByText('Ніхто не ставив', exact).count()).toBe(0);
  for (const page of [ira, taras, hanna]) await page.locator('.duel-bet-result.is-won').getByText('Ставка зіграла: +100', exact).waitFor();
  for (const page of [olya, petro]) expect(await page.locator('.duel-bet-result').count(), 'a bet line for a duellist').toBe(0);
  await scores39(host, { Оля: 500, Петро: -100, Іра: 300, Тарас: 300, Ганна: 300 });
  await expect.poll(() => phoneScore27a(ira).textContent(), POLL).toBe('300');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView39(stage, '.duel-stage', 'result 1280×720');
  await shot(stage, 'bets39-result-stage');
  await ira.setViewportSize({ width: 320, height: 640 });
  await expectNoSideScroll(ira, 'bets39-result-phone');
  await shot(host, 'bets39-result-host');

  // ── Історія: рядок дуелі й рядок ставок. ──
  await click(host, 'Продовжити гру');
  await stage.locator('h1', { hasText: 'Запитання 3:' }).waitFor();
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Ставки 39 гра/ }).click();
  await host.locator('.history-duel').first().waitFor();
  expect(await host.locator('.history-duel').allTextContents()).toEqual(['Дуель: Оля +300, Петро −300', 'Ставки на дуель: Іра +100 (на Оля), Тарас +100 (на Оля), Ганна +100 (на Оля)']);
  await shot(host, 'bets39-history-host');

  expect(problems).toEqual([]);
}

// ——— 3. Нічия, мінус, зняття ставки, перезапуск ———

async function tie39() {
  const host = await open('host39t', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host39t@example.com');
  const { code, stage } = await room39(host, quiz39('Ставки 39 нічия', 100), 'stage39t');
  const names = ['Оля', 'Петро', 'Іра', 'Тарас'];
  const phones: Page[] = [];
  for (const name of names) {
    const page = await open(`phone39t-${phones.length}`, 360, 740);
    await join(page, code, name, false);
    phones.push(page);
  }
  const [olya, petro, ira, taras] = phones as [Page, Page, Page, Page];
  await stage.getByText('Тарас').waitFor();
  await startRound39(host, stage, phones);
  // Тарас не відповідає: 0 балів.
  for (const n of [1, 2]) {
    await olya.locator('h1', { hasText: `Запитання ${n}:` }).waitFor();
    await answerAll(host, [olya, petro, ira]);
    if (n === 1) await step27a(host, 'Далі');
  }
  await scores39(host, { Оля: 200, Петро: 200, Іра: 200, Тарас: 0 });
  await duelButton(olya).click();
  await olya.getByRole('dialog').getByRole('button', { name: 'Петро', ...exact }).click();
  await host.getByText('Оголошено дуель: Оля — Петро', exact).waitFor();
  await bet39(taras, 'Петро');
  await bet39(ira, 'Оля');
  await click(host, 'Почати дуель');
  await stage.locator('.duel-stage').getByText('Оля вибирає категорію', exact).waitFor();
  await expect.poll(() => stageBets39(stage), POLL).toEqual([
    { count: 'Поставив 1', names: ['Іра'] },
    { count: 'Поставив 1', names: ['Тарас'] },
  ]);

  // ── Перезапуск на category: ті самі ставки на телефонах, сцені й пульті. ──
  await restart39(host, stage, phones);
  await stage.locator('.duel-stage').getByText('Оля вибирає категорію', exact).waitFor();
  await expect.poll(() => stageBets39(stage), POLL).toEqual([
    { count: 'Поставив 1', names: ['Іра'] },
    { count: 'Поставив 1', names: ['Тарас'] },
  ]);
  await expect.poll(() => betLook39(taras), POLL).toEqual(['Оля:false:on', 'Петро:true:on', 'Без ставки:false:on']);
  await expect.poll(() => betLook39(ira), POLL).toEqual(['Оля:true:on', 'Петро:false:on', 'Без ставки:false:on']);
  await host.locator('.duel-host-bets', { hasText: 'Петро: Поставив 1' }).waitFor();
  await shot(stage, 'bets39-restart-stage');

  // ── Нічия 1 : 1 → «Нічия — ставки без змін», бали ті самі. ──
  await olya.getByRole('button', { name: 'Природа · лишилося 3', ...exact }).click();
  const first = await winQuestion39(stage, olya, 'Оля');
  await click(host, 'Наступне запитання дуелі');
  await winQuestion39(stage, petro, 'Петро', first);
  await click(host, 'Підсумок дуелі');
  await stage.locator('.duel-stage').getByText('Нічия — бали не змінюються', exact).waitFor();
  await stage.locator('.duel-stage-bet-outcome').getByText('Нічия — ставки без змін', exact).waitFor();
  for (const page of [ira, taras]) await page.locator('.duel-bet-result').getByText('Нічия — ставка без змін', exact).waitFor();
  await scores39(host, { Оля: 200, Петро: 200, Іра: 200, Тарас: 0 });
  await shot(stage, 'bets39-tie-stage');
  await click(host, 'Продовжити гру');
  await stage.locator('h1', { hasText: 'Запитання 3:' }).waitFor();
  await click(host, 'Завершити гру');
  await olya.getByText('Гру завершено').first().waitFor();

  // ── Друга кімната: Тарас (0 балів) ставить на переможеного → −100; Іра ставить і знімає ставку → без змін. ──
  const host2 = await open('host39m', 1280, 900);
  await register(host2, 'host', 'Леся Ведуча', 'host39m@example.com');
  const second = await room39(host2, quiz39('Ставки 39 мінус', 100), 'stage39m');
  const phones2: Page[] = [];
  for (const name of names) {
    const page = await open(`phone39m-${phones2.length}`, 360, 740);
    await join(page, second.code, name, false);
    phones2.push(page);
  }
  const [olya2, , ira2, taras2] = phones2 as [Page, Page, Page, Page];
  await second.stage.getByText('Тарас').waitFor();
  await startRound39(host2, second.stage, phones2);
  // Ніхто не відповідає: усі з нулем.
  await reveal28a(host2);
  await step27a(host2, 'Далі');
  await reveal28a(host2);
  await duelButton(olya2).click();
  await olya2.getByRole('dialog').getByRole('button', { name: 'Петро', ...exact }).click();
  await host2.getByText('Оголошено дуель: Оля — Петро', exact).waitFor();
  await bet39(taras2, 'Петро');
  await bet39(ira2, 'Оля');
  await second.stage.locator('.duel-banner-bets').getByText('Ставки: Оля — 1, Петро — 1', exact).waitFor();
  await bet39(ira2, 'Без ставки');
  await expect.poll(() => betLook39(ira2), POLL).toEqual(['Оля:false:on', 'Петро:false:on', 'Без ставки:true:on']);
  await second.stage.locator('.duel-banner-bets').getByText('Ставки: Оля — 0, Петро — 1', exact).waitFor();
  await click(host2, 'Почати дуель');
  await second.stage.locator('.duel-stage').getByText('Оля вибирає категорію', exact).waitFor();
  await expect.poll(() => stageBets39(second.stage), POLL).toEqual([
    { count: 'Поставили 0', names: [] },
    { count: 'Поставив 1', names: ['Тарас'] },
  ]);
  await olya2.getByRole('button', { name: 'Столиці · лишилося 4', ...exact }).click();
  const one = await winQuestion39(second.stage, olya2, 'Оля');
  await click(host2, 'Наступне запитання дуелі');
  await winQuestion39(second.stage, olya2, 'Оля', one);
  await click(host2, 'Підсумок дуелі');
  await second.stage.locator('.duel-stage-bet-outcome.is-lost').getByText('Не вгадали: Тарас −100', exact).waitFor();
  expect(await second.stage.locator('.duel-stage-bet-outcome.is-won').count(), 'a winners line with no winners').toBe(0);
  await taras2.locator('.duel-bet-result.is-lost').getByText('Ставка не зіграла: −100', exact).waitFor();
  expect(await ira2.locator('.duel-bet-result').count(), 'a result line for a withdrawn bet').toBe(0);
  await scores39(host2, { Оля: 300, Петро: -300, Іра: 0, Тарас: -100 });
  await expect.poll(() => phoneScore27a(taras2).textContent(), POLL).toBe('−100');
  if (process.env.E2E_SHOTS === '1') await sleep(600);
  await expectBoardInView39(second.stage, '.duel-stage', 'lost bet 1280×720');
  await shot(second.stage, 'bets39-lost-stage');
  await expectNoSideScroll(taras2, 'bets39-lost-phone');

  expect(problems).toEqual([]);
}

// ——— 4. Команди ———

async function teams39() {
  const host = await open('host39k', 1280, 900);
  await register(host, 'host', 'Ганна Ведуча', 'host39k@example.com');
  const teams = ['Соняшники', 'Маки', 'Волошки'];
  const { code, stage } = await room39(host, quiz39('Ставки 39 команди', 100, { teams: { count: 3, names: teams } }), 'stage39k');
  // Капітан — перший, хто вибрав команду: Оля (Соняшники), Петро (Маки), Іра (Волошки).
  const people: [string, string, number][] = [
    ['Оля', 'Соняшники', 360],
    ['Петро', 'Маки', 360],
    ['Іра', 'Волошки', 360],
    ['Віра', 'Соняшники', 360],
    ['Ігор', 'Маки', 360],
    ['Тарас', 'Волошки', 320],
  ];
  const pages: Page[] = [];
  for (const [name, team, width] of people) {
    const page = await open(`phone39k-${pages.length}`, width, width === 320 ? 640 : 740);
    await join(page, code, name, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
    pages.push(page);
  }
  const [olya, petro, ira, vira, ihor, taras] = pages as [Page, Page, Page, Page, Page, Page];
  await startRound39(host, stage, pages);
  await reveal28a(host);
  await step27a(host, 'Далі');
  await reveal28a(host);

  // ── Капітан Соняшників викликає Маки. ──
  await duelButton(olya).click();
  await olya.getByRole('dialog', { name: 'Кого викликати на дуель?' }).getByRole('button', { name: 'Маки', ...exact }).click();
  await host.getByText('Оголошено дуель: Соняшники — Маки', exact).waitFor();

  // Капітан Волошок бачить кнопки, другий з Волошок — підпис без активних кнопок; команди дуелі — без ставки.
  await expect.poll(() => betLook39(ira), POLL).toEqual(['Соняшники:false:on', 'Маки:false:on', 'Без ставки:true:on']);
  await taras.locator('.duel-bet').getByText('Ставить капітан за команду', exact).waitFor();
  await expect.poll(() => betLook39(taras), POLL).toEqual(['Соняшники:false:off', 'Маки:false:off', 'Без ставки:true:off']);
  for (const page of [olya, vira, petro, ihor]) expect(await page.locator('.duel-bet').count(), 'a duel team member gets bet buttons').toBe(0);
  await bet39(ira, 'Соняшники');
  await expect.poll(() => betLook39(taras), POLL).toEqual(['Соняшники:true:off', 'Маки:false:off', 'Без ставки:false:off']);
  await stage.locator('.duel-banner-bets').getByText('Ставки: Соняшники — 1, Маки — 0', exact).waitFor();
  await expectBetFits39(taras, 'bets39-team-phone-320');

  // ── Перезапуск, поки ставки відкриті: ставка команди на місці. ──
  await restart39(host, stage, pages);
  await stage.locator('.duel-banner-bets').getByText('Ставки: Соняшники — 1, Маки — 0', exact).waitFor();
  await expect.poll(() => betLook39(ira), POLL).toEqual(['Соняшники:true:on', 'Маки:false:on', 'Без ставки:false:on']);
  await expect.poll(() => betLook39(taras), POLL).toEqual(['Соняшники:true:off', 'Маки:false:off', 'Без ставки:false:off']);
  await taras.locator('.duel-bet').getByText('Ставить капітан за команду', exact).waitFor();

  // ── Категорія: капітан Соняшників вибирає, на сцені — Волошки під Соняшниками. ──
  await click(host, 'Почати дуель');
  await stage.locator('.duel-stage').getByText('Соняшники вибирає категорію', exact).waitFor();
  await expect.poll(() => stageBets39(stage), POLL).toEqual([
    { count: 'Поставив 1', names: ['Волошки'] },
    { count: 'Поставили 0', names: [] },
  ]);
  await expect.poll(() => betLook39(taras), POLL).toEqual(['Соняшники:true:off', 'Маки:false:off', 'Без ставки:false:off']);
  await shot(stage, 'bets39-team-category-stage');
  await olya.getByRole('button', { name: 'Столиці · лишилося 4', ...exact }).click();
  const first = await winQuestion39(stage, olya, 'Соняшники');
  await click(host, 'Наступне запитання дуелі');
  await winQuestion39(stage, olya, 'Соняшники', first);
  await click(host, 'Підсумок дуелі');
  await stage.locator('.duel-stage-bet-outcome.is-won').getByText('Вгадали: Волошки +100', exact).waitFor();
  for (const page of [ira, taras]) await page.locator('.duel-bet-result.is-won').getByText('Ставка зіграла: +100', exact).waitFor();
  await expect.poll(() => teamTotal39(host, 'Волошки'), POLL).toBe(100);
  await expect.poll(() => teamTotal39(host, 'Соняшники'), POLL).toBe(300);
  await expect.poll(() => teamTotal39(host, 'Маки'), POLL).toBe(-300);
  await shot(stage, 'bets39-team-result-stage');

  // ── Дві команди: ставців немає — панелі ставок немає ніде. ──
  const host2 = await open('host39k2', 1280, 900);
  await register(host2, 'host', 'Віра Ведуча', 'host39k2@example.com');
  const duo = await room39(host2, quiz39('Ставки 39 дві команди', 100, { teams: { count: 2, names: ['Соняшники', 'Маки'] } }), 'stage39k2');
  const two: Page[] = [];
  for (const [name, team] of [['Оля', 'Соняшники'], ['Петро', 'Маки'], ['Віра', 'Соняшники'], ['Ігор', 'Маки']] as const) {
    const page = await open(`phone39k2-${two.length}`, 360, 740);
    await join(page, duo.code, name, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
    two.push(page);
  }
  await startRound39(host2, duo.stage, two);
  await reveal28a(host2);
  await step27a(host2, 'Далі');
  await reveal28a(host2);
  await duelButton(two[0]!).click();
  await two[0]!.getByRole('dialog').getByRole('button', { name: 'Маки', ...exact }).click();
  await host2.getByText('Оголошено дуель: Соняшники — Маки', exact).waitFor();
  const noBets = async (where: string) => {
    for (const page of [duo.stage, host2, ...two]) {
      expect(await page.locator('.duel-bet, .duel-banner-bets, .duel-stage-bets, .duel-host-bets, .duel-banner.has-bets').count(), `${where}: bets in a two-team game`).toBe(0);
    }
  };
  await duo.stage.locator('.duel-banner').waitFor();
  await noBets('declared');
  await click(host2, 'Почати дуель');
  await duo.stage.locator('.duel-stage').getByText('Соняшники вибирає категорію', exact).waitFor();
  await noBets('category');
  await host2.locator('.duel-host').getByRole('button', { name: 'Скасувати дуель', ...exact }).click();
  await expect.poll(() => duo.stage.locator('.duel-stage').count(), POLL).toBe(0);

  expect(problems).toEqual([]);
}

// ——— 5. 24 гравці й автопілот ———

/** 24 імені без російського; дуелянти — найдовші (20 символів — межа ніка LIMITS.nicknameMax). */
const NAMES39 = [
  'Анастасія Литвиненко', 'Святослав Гончаренко', 'Олександра Петренко', 'Богдана Коваленко', 'Ярослав Шевченко', 'Мирослава Бондар',
  'Владислав Ткаченко', 'Анастасія Мельник', 'Станіслав Лисенко', 'Катерина Руденко', 'Остап Марченко', 'Соломія Савченко',
  'Тарас Гончаренко', 'Ірина Кузьменко', 'Максим Литвиненко', 'Вероніка Захарчук', 'Назар Поліщук', 'Злата Тимошенко',
  'Дмитро Павленко', 'Олена Кириленко', 'Роман Мороз', 'Оксана Бойко', 'Левко Гнатюк', 'Дарина Ковальчук',
];

async function crowd39(sockets: Socket[]) {
  expect(new Set(NAMES39).size).toBe(24);
  for (const name of NAMES39) expect(name.length, name).toBeLessThanOrEqual(20);
  expect([NAMES39[0]!.length, NAMES39[1]!.length]).toEqual([20, 20]);
  const host = await open('host39c', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host39c@example.com');
  const { code, stage } = await room39(host, quiz39('Ставки 39 натовп', 100), 'stage39c');
  // 23 гравці — сокети, 24-й (Дарина, ставить на виклик) — телефон 320 px.
  const pilots: Pilot[] = [];
  for (const nickname of NAMES39.slice(0, 23)) pilots.push(await pilotPlayer(sockets, code, nickname));
  const phoneName = NAMES39[23]!;
  const phone = await open('phone39c', 320, 640, { hasTouch: true, isMobile: true });
  await join(phone, code, phoneName, false);
  await stage.getByText(phoneName).waitFor();
  await startRound39(host, stage, [phone]);
  await reveal28a(host);
  await step27a(host, 'Далі');
  await reveal28a(host);
  const [challenger, opponent] = pilots as [Pilot, Pilot];
  const opponentId = (await frame(opponent, () => true)).view.me.id;
  await emitOk(challenger, 'player:duel', { opponentId });
  await host.getByText(`Оголошено дуель: ${NAMES39[0]} — ${NAMES39[1]}`, exact).waitFor();

  // ── Телефон 320 px: кнопки з довгими іменами дуелянтів переносяться, без бокового скролу. ──
  await expect.poll(() => betLook39(phone), POLL).toEqual([`${NAMES39[0]}:false:on`, `${NAMES39[1]}:false:on`, 'Без ставки:true:on']);
  await bet39(phone, NAMES39[0]!);
  await expectBetFits39(phone, 'bets39-24-phone-320');

  // ── 22 ставки: 12 на виклик (11 сокетів + телефон), 10 на суперника. ──
  for (const [at, pilot] of pilots.entries()) {
    if (at < 2) continue;
    await emitOk(pilot, 'player:duel-bet', { side: at <= 12 ? 'challenger' : 'opponent' });
  }
  await stage.locator('.duel-banner-bets').getByText(`Ставки: ${NAMES39[0]} — 12, ${NAMES39[1]} — 10`, exact).waitFor();
  await click(host, 'Почати дуель');
  await afterSplash(stage, phone);
  await stage.locator('.duel-stage-bets.is-many').first().waitFor();
  await expect.poll(() => stage.locator('.duel-stage-bets li').count(), POLL).toBe(22);
  await expect.poll(async () => (await stageBets39(stage)).map((side) => side.count), POLL).toEqual(['Поставили 12', 'Поставили 10']);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView39(stage, '.duel-stage', '24 category 1280×720');
  await shot(stage, 'bets39-24-category-stage');
  await theme39(stage, 'light');
  await stage.locator('.duel-stage-bets.is-many').first().waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView39(stage, '.duel-stage', 'light 24 category 1280×720');
  await shot(stage, 'bets39-24-light-category-stage');
  await theme39(stage, 'dark');
  // Телефон на category (DuelPlay): ті самі кнопки, без бокового скролу.
  await expectBetFits39(phone, 'bets39-24-phone-320-category');

  // ── Дуель: виклик виграє обидва запитання. ──
  await emitOk(challenger, 'player:duel-category', { categoryId: 'dc2' });
  const firstText = (await duelQuestion39(stage)).text;
  await emitOk(challenger, 'player:duel-answer', { text: ANSWERS39[firstText] });
  await stage.locator('.duel-stage-score', { hasText: '1 : 0' }).waitFor();
  await click(host, 'Наступне запитання дуелі');
  const secondText = (await duelQuestion39(stage, firstText)).text;
  await emitOk(challenger, 'player:duel-answer', { text: ANSWERS39[secondText] });
  await stage.locator('.duel-stage-score', { hasText: '2 : 0' }).waitFor();
  await click(host, 'Підсумок дуелі');
  await stage.locator('.duel-stage-bet-outcome.is-won').waitFor();
  await stage.locator('.duel-stage-bet-outcome.is-lost').waitFor();
  const winners = NAMES39.filter((_, at) => (at >= 2 && at <= 12) || at === 23);
  const losers = NAMES39.slice(13, 23);
  expect((await stage.locator('.duel-stage-bet-outcome.is-won').textContent())!.trim()).toBe(`Вгадали: ${winners.join(', ')} +100`);
  expect((await stage.locator('.duel-stage-bet-outcome.is-lost').textContent())!.trim()).toBe(`Не вгадали: ${losers.join(', ')} −100`);
  await phone.locator('.duel-bet-result.is-won').getByText('Ставка зіграла: +100', exact).waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView39(stage, '.duel-stage', '24 result 1280×720');
  await shot(stage, 'bets39-24-result-stage');
  await theme39(stage, 'light');
  await stage.locator('.duel-stage-bet-outcome.is-won').waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await expectBoardInView39(stage, '.duel-stage', 'light 24 result 1280×720');
  await expectReadable39(stage.locator('.duel-stage-bet-outcome.is-won'), 'light winners line');
  await expectReadable39(stage.locator('.duel-stage-bet-outcome.is-lost'), 'light losers line');
  await shot(stage, 'bets39-24-light-stage');
  await expectNoSideScroll(phone, 'bets39-24-phone-320-result');
  await click(host, 'Продовжити гру');
}

/** Автопілот: на category зі ставцем вибір категорії чекає 25 с після заставки (не 15 с), а ставка в цьому вікні приймається. */
async function autopilot39(sockets: Socket[]) {
  const author = await open('author39a', 1280, 900);
  await register(author, 'menu', 'Марта', 'author39a@example.com');
  const data = quiz39('Ставки 39 автопілот', 100);
  const saved = await author.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  const quizId = ((await (await author.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[]).find((entry) => entry.title === 'Ставки 39 автопілот')!.id;
  const room = await createAutopilot(author, quizId);
  const marta = await pilotSocket(sockets, room.code, room.token, 'Марта');
  const vira = await pilotPlayer(sockets, room.code, 'Віра');
  const petro = await pilotPlayer(sockets, room.code, 'Петро');
  const everyone = [marta, vira, petro];
  expect(await marta.emit('host:start')).toEqual({ ok: true });
  let cursor = 0;
  for (let n = 0; n < 2; n++) {
    const question = await frame(vira, (v) => v.phase === 'question', cursor);
    for (const player of everyone) await emitOk(player, 'player:answer', { type: 'single', optionId: 'b' });
    cursor = (await frame(vira, (v) => v.phase === 'reveal', question.index)).index;
  }
  // Віра викликає Петра на розкритті другого запитання; Марта — ставець.
  const petroId = (await frame(petro, () => true)).view.me.id;
  await emitOk(vira, 'player:duel', { opponentId: petroId });
  const category = await frame(marta, (v) => v.duel?.stage === 'category');
  const splashUntil = category.view.splash?.kind === 'duel' ? category.view.splash.until : category.at;
  console.log(`part 39: autopilot category splash ${JSON.stringify(category.view.splash)}`);
  await emitOk(marta, 'player:duel-bet', { side: 'opponent' });
  const bet = await frame(marta, (v) => v.me.duel?.bet?.side === 'opponent', category.index);
  expect(bet.view.duel?.bets?.opponent.map((p) => p.nickname)).toEqual(['Марта']);
  const question = await frame(marta, (v) => v.duel?.stage === 'question', category.index, 60_000);
  const gap = question.at - splashUntil;
  console.log(`part 39: the autopilot picked the duel category ${gap} ms after the duel splash (bets window ${25_000} ms)`);
  expectGap(gap, 25_000, 'autopilot bets window');
  expect(question.view.duel?.bets?.open, 'bets after the category').toBe(false);
}
