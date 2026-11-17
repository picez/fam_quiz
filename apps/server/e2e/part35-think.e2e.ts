import { makeRoundsQuiz, think, thinkRound } from '@quiz/engine/testing';
import { type ThinkWord } from '@quiz/shared';
import { type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import es from '../../web/src/locales/es.json';
import { ukMessages } from '../../web/src/i18n';
import { open, click, field, questionText, join, openRoundSettings, bodyText, expectNoSideScroll, register, POLL, socketFrames, NL, pickTeamOn, sleep, pilotPlayer, frame, emitOk, stateViews, join22a, step27a, next27a, phoneScore27a, select27b, reveal28a, writeWord35, hostWords35, hearts35 } from './helpers/common';
import { exact, base, problems, snapshot, afterSplash, shot, useE2eServer } from './helpers/setup';

/**
 * Наскрізні тести: частина 35 — раунд «Думай інакше» (think): слова ведучого заготовлені, дописані під час питання й після таймера,
 * м'яке порівняння, ручна оцінка, порожня відповідь, вибування, дострокове закінчення, місця й очки; соло, команди, автопилот.
 * Потребує зібраного клієнта (pnpm build) і встановленого Chrome.
 */

useE2eServer();

it('part 35: think different — host words prepared, added during the question and after the timer, soft matching with endings, a manual match, an empty answer, elimination, early end, places and points, 320 px, light theme', async () => {
  try {
    await thinkGame35();
  } catch (error) {
    await snapshot();
    throw error;
  }
  expect(problems).toEqual([]);
}, 600_000);

it('part 35: think different solo and in teams — the solo player walks the whole round, captains write for teams, team lives and places', async () => {
  try {
    await thinkSolo35();
    await thinkTeams35();
  } catch (error) {
    await snapshot();
    throw error;
  }
  expect(problems).toEqual([]);
}, 600_000);

it('part 35: think different on autopilot — a wordless question blocks the launch, prepared words play by themselves, the author watches', async () => {
  const sockets: Socket[] = [];
  try {
    await thinkAutopilot35(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
  expect(problems).toEqual([]);
}, 600_000);

it('part 35: think different with 24 players — the stage question, reveal and places fit 1280×720 with reactions', async () => {
  const sockets: Socket[] = [];
  try {
    await thinkCrowd35(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
  expect(problems).toEqual([]);
}, 600_000);

const es35 = es as Record<string, string>;

/** Кадри від позиції from до першого кадру розкриття (не включно). */
const beforeReveal35 = (frames: string[], from: number) => {
  const tail = frames.slice(from);
  const at = tail.findIndex((f) => f.includes('"phase":"reveal"'));
  return (at < 0 ? tail : tail.slice(0, at)).join(NL);
};

/** Рядок учасника на сцені під час питання / на розкритті / на пульті. */
const stageRow35 = (page: Page, nickname: string) => page.locator('.think-row', { has: page.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) });
const revealRow35 = (page: Page, nickname: string) => page.locator('.think-reveal-row', { has: page.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) });
const hostRow35 = (host: Page, nickname: string) => host.locator('.think-host-answers .think-answer', { has: host.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) });
/** Рядки таблиці місць: клітинки «місце | нік | стан | очки раунду | разом», пробіли в числах прибрано. */
const placeRows35 = (page: Page) =>
  page
    .locator('.think-places-table tbody tr')
    .evaluateAll((rows) => rows.map((row) => [...row.children].map((cell) => (cell.textContent ?? '').replace(/(\d)\s(?=\d)/g, '$1').replace(/\s+/g, ' ').trim()).join(' | ')));
const words35 = (...list: [string, ...string[]][]): ThinkWord[] => list.map(([word, ...synonyms]) => ({ word, synonyms }));

/** «Показати відповідь» з витримкою (після закриття таймером чи ведучим). */
async function show35(host: Page) {
  await step27a(host, 'Показати відповідь');
}

async function thinkGame35() {
  // ── Редактор: раунд «Думай інакше» — життя 2, бали 3000, 5 питань (2 і 3 — без слів). ──
  const host = await open('host35', 1280, 900);
  await register(host, 'host', 'Ірина Ведуча', 'host35@example.com');
  await host.getByRole('link', { name: 'Нова вікторина' }).click();
  await field(host, 'Назва вікторини').fill('Думай інакше 35');
  await host.locator('details.rules').first().locator('summary').click();
  await select27b(host, 'Показувати рейтинг', 'end');
  await click(host, '+ Раунд');
  await click(host, 'Думай інакше');
  // Класичний раунд нової вікторини не потрібен: лишається лише «Думай інакше» (з одним раундом смуги вкладок немає).
  await host.locator('.round-tab').first().click();
  await click(host, 'Видалити раунд');
  await expect.poll(() => host.locator('.round-tab').count(), POLL).toBe(0);
  await openRoundSettings(host);
  await field(host, 'Життя на старті').fill('2');
  await field(host, 'Бали за 1-ше місце').fill('3000');
  await expect.poll(() => host.locator('.question-list .question-item').count(), POLL).toBe(3);
  await click(host, 'Додати запитання');
  await click(host, 'Додати запитання');
  await expect.poll(() => host.locator('.question-list .question-item').count(), POLL).toBe(5);
  const prompts: [string, string[]][] = [
    ['Напишіть колір веселки', ['червоний', 'фіолетовий']],
    ['Напишіть фрукт', []],
    ['Напишіть тварину з зоопарку', []],
    ['Напишіть птаха', ['горобець']],
    ['Напишіть квітку', ['троянда']],
  ];
  for (const [index, [text, words]] of prompts.entries()) {
    await host.locator('.question-list .question-item').nth(index).click();
    await questionText(host).fill(text);
    for (const [at, word] of words.entries()) {
      await click(host, 'Додати слово');
      await field(host, `Слово ${at + 1}`).fill(word);
    }
    if (words.length === 0) await host.locator('.think-no-words').getByText(ukMessages.thinkNoWordsNote, exact).waitFor();
    if (index === 1) await shot(host, 'think35-editor');
  }
  expect(await host.locator('.think-no-words').count(), 'a note with words').toBe(0);
  await click(host, 'Зберегти');
  await host.getByRole('heading', { name: 'Думай інакше 35' }).waitFor();
  const list = (await (await host.request.get(`${base}/api/quizzes`)).json()) as { id: string; title: string }[];
  const quizId = list.find((entry) => entry.title === 'Думай інакше 35')!.id;
  const stored = (await (await host.request.get(`${base}/api/quizzes/${quizId}`)).json()) as { rounds: { type: string; lives: number; points: number; questions: { text: string; points: number; timeLimit: number; words: ThinkWord[] }[] }[] };
  expect(stored.rounds).toHaveLength(1);
  expect(stored.rounds[0]).toMatchObject({ type: 'think', lives: 2, points: 3000 });
  expect(stored.rounds[0]!.questions.map((q) => [q.text, q.points, q.timeLimit, q.words.map((w) => w.word)])).toEqual(prompts.map(([text, words]) => [text, 0, 30, words]));

  // ── Гра: сцена 1600 × 900; Оля 375 × 812, Тарас 360 × 740, Хосе 320 × 640 (es). ──
  await click(host, 'Грати');
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage35', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  await stage.getByText(`${code.slice(0, 3)} ${code.slice(3)}`).first().waitFor();
  const olya = await open('olya35', 375, 812);
  const taras = await open('taras35', 360, 740);
  const jose = await open('jose35', 320, 640, { locale: 'es-ES' });
  const phones = [olya, taras, jose];
  const frames = new Map<Page, string[]>(phones.map((page) => [page, socketFrames(page)]));
  await join(olya, code, 'Оля', false);
  await join(taras, code, 'Тарас', false);
  await join22a(jose, es, code, 'Хосе');
  await stage.getByText('Хосе').waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);

  /** Ні сцена, ні чужі телефони до розкриття не бачать слів ведучого й чужих слів: ні в DOM, ні в кадрах сокета. */
  const marks = () => new Map<Page, number>([[stage, stageFrames.length], ...phones.map((page): [Page, number] => [page, frames.get(page)!.length])]);
  const expectHidden = async (from: Map<Page, number>, hidden: string[], own: Map<Page, string[]>, label: string) => {
    for (const [page, list] of [[stage, stageFrames], ...phones.map((page): [Page, string[]] => [page, frames.get(page)!])] as [Page, string[]][]) {
      const mine = own.get(page) ?? [];
      const html = await page.content();
      const sent = beforeReveal35(list, from.get(page)!);
      for (const word of hidden.filter((w) => !mine.includes(w))) {
        expect(html, `${label}: «${word}» in the DOM of ${page === stage ? 'the stage' : 'a phone'}`).not.toContain(word);
        expect(sent, `${label}: «${word}» sent to ${page === stage ? 'the stage' : 'a phone'}`).not.toContain(word);
      }
    }
  };

  // ── Питання 1: заготовлені «червоний», «фіолетовий». Оля «Фіолетова» (закінчення — збіг), Тарас «зелений», Хосе мовчить. ──
  let from = marks();
  await stage.locator('.think-stage h1').getByText('Напишіть колір веселки', exact).waitFor();
  await expect.poll(() => stage.locator('.think-row').count(), POLL).toBe(3);
  for (const page of phones) expect(await hearts35(page), 'two hearts at the start').toBe(2);
  await expectNoSideScroll(jose, 'think35-phone-input-es-320');
  await writeWord35(olya, 'Фіолетова');
  await writeWord35(taras, 'зелений');
  await expect.poll(() => stageRow35(stage, 'Оля').locator('.think-answered').count(), POLL).toBe(1);
  await expect.poll(() => stageRow35(stage, 'Тарас').locator('.think-answered').count(), POLL).toBe(1);
  expect(await stageRow35(stage, 'Хосе').locator('.think-answered').count(), 'Jose answered').toBe(0);
  // Пульт: «Ваші слова» з заготовленими, слова гравців наживо з позначкою збігу.
  await expect.poll(() => host.locator('.think-host-words').getByLabel('Слово 2', exact).inputValue(), POLL).toBe('фіолетовий');
  await expect.poll(() => hostRow35(host, 'Оля').locator('.tag').first().textContent(), POLL).toBe('збіг');
  await expect.poll(() => hostRow35(host, 'Тарас').locator('.tag').first().textContent(), POLL).toBe('в безпеці');
  expect(await hostRow35(host, 'Оля').locator('.think-answer-word').textContent()).toBe('Фіолетова');
  await shot(stage, 'think35-stage-question');
  await shot(host, 'think35-host-words');
  await expectHidden(from, ['червоний', 'фіолетовий', 'Фіолетова', 'зелений'], new Map([[olya, ['Фіолетова']], [taras, ['зелений']]]), 'question 1');
  await reveal28a(host);
  await stage.locator('.think-reveal.is-big .think-word strong').getByText('фіолетовий', exact).waitFor();
  expect(await stage.locator('.think-reveal.is-big .think-word strong').allTextContents()).toEqual(['червоний', 'фіолетовий']);
  await expect.poll(() => revealRow35(stage, 'Оля').getAttribute('class'), POLL).toContain('is-hit');
  // Збіг названо: «Фіолетова» ≈ «фіолетовий» — на сцені й на телефоні Олі.
  expect(await revealRow35(stage, 'Оля').locator('.think-matched').textContent()).toBe('≈ фіолетовий');
  await expect.poll(() => revealRow35(olya, 'Оля').locator('.think-matched').textContent(), POLL).toBe('≈ фіолетовий');
  expect(await revealRow35(stage, 'Хосе').locator('.think-matched').count(), 'an empty answer names no word').toBe(0);
  expect(await revealRow35(stage, 'Тарас').getAttribute('class')).toContain('is-safe');
  expect(await revealRow35(stage, 'Хосе').getAttribute('class')).toContain('is-hit');
  expect(await revealRow35(stage, 'Хосе').locator('.think-reveal-word').textContent(), 'an empty answer on the stage').toBe('—');
  expect(await revealRow35(stage, 'Оля').locator('.think-heart.is-lost').count(), 'Olya’s heart goes out').toBe(1);
  await taras.locator('.think-verdict').getByText('Ви в безпеці', exact).waitFor();
  await olya.locator('.think-verdict').getByText('Збіг: −1 ❤️', exact).waitFor();
  await jose.locator('.think-verdict').getByText(es35.thinkEmpty!, exact).waitFor();
  expect([await hearts35(olya), await hearts35(taras), await hearts35(jose)]).toEqual([1, 2, 1]);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'think35-stage-reveal');
  await shot(olya, 'think35-phone-verdict');
  await expectNoSideScroll(jose, 'think35-phone-verdict-es-320');

  // ── Питання 2 (без слів): ведучий вписує «яблуко» (синонім «яблучко») під час таймера; Тарас «Яблука», Оля «груша», Хосе «манго». ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  from = marks();
  await stage.locator('.think-stage h1').getByText('Напишіть фрукт', exact).waitFor();
  await hostWords35(host, [['яблуко', 'яблучко']]);
  await writeWord35(taras, 'Яблука');
  await writeWord35(olya, 'груша');
  await writeWord35(jose, 'манго', es35);
  await expect.poll(() => hostRow35(host, 'Тарас').locator('.tag').first().textContent(), POLL).toBe('збіг');
  // Ведучий доповнює слова посеред питання: другий рядок «банан» — і далі нічого не витікає.
  await hostWords35(host, [['яблуко', 'яблучко'], ['банан']]);
  await expectHidden(from, ['яблуко', 'яблучко', 'банан', 'Яблука', 'груша', 'манго'], new Map([[taras, ['Яблука']], [olya, ['груша']], [jose, ['манго']]]), 'question 2');
  await reveal28a(host);
  await stage.locator('.think-reveal.is-big').getByText('яблучко', exact).waitFor();
  await expect.poll(() => revealRow35(stage, 'Тарас').getAttribute('class'), POLL).toContain('is-hit');
  await taras.locator('.think-verdict').getByText('Збіг: −1 ❤️', exact).waitFor();
  expect(await hearts35(taras)).toBe(1);
  // Ручна оцінка: «Зняти збіг» біля Тараса — він знову в безпеці, ❤️ повертається.
  await hostRow35(host, 'Тарас').getByRole('button', { name: 'Зняти збіг: Тарас', ...exact }).click();
  await hostRow35(host, 'Тарас').getByText('вручну', exact).waitFor();
  await expect.poll(() => hostRow35(host, 'Тарас').locator('.tag').first().textContent(), POLL).toBe('в безпеці');
  await taras.locator('.think-verdict').getByText('Ви в безпеці', exact).waitFor();
  await expect.poll(() => hearts35(taras), POLL).toBe(2);
  await expect.poll(() => revealRow35(stage, 'Тарас').getAttribute('class'), POLL).toContain('is-safe');
  await shot(host, 'think35-host-override');

  // ── Питання 3: без слів до кінця таймера. Оля «Левиця» (не збіг з «лев»), Тарас «жираф», Хосе «лев» — вибуває. ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  from = marks();
  await stage.locator('.think-stage h1').getByText('Напишіть тварину з зоопарку', exact).waitFor();
  await writeWord35(olya, 'Левиця');
  await writeWord35(taras, 'жираф');
  await writeWord35(jose, 'лев', es35);
  // З ведучим «усі відповіли» не закриває питання: таймер іде до кінця.
  await sleep(1500);
  expect(await host.getByRole('button', { name: 'Закрити запитання', ...exact }).count(), 'the question closed early').toBe(1);
  const show = host.getByRole('button', { name: 'Показати відповідь', ...exact });
  await show.waitFor({ timeout: 40_000 });
  expect(await show.isDisabled(), '«Show» without a word').toBe(true);
  expect(await show.getAttribute('title')).toBe(ukMessages.err_think_no_words);
  await host.locator('.think-host-late').getByText(ukMessages.thinkHostLate, exact).waitFor();
  await shot(host, 'think35-host-late');
  await hostWords35(host, [['лев']]);
  await expect.poll(() => show.isDisabled(), POLL).toBe(false);
  await host.locator('.think-host-locked').getByText(ukMessages.thinkHostLocked, exact).waitFor();
  await expectHidden(from, ['Левиця', 'жираф'], new Map([[olya, ['Левиця']], [taras, ['жираф']]]), 'question 3');
  expect(beforeReveal35(stageFrames, from.get(stage)!), '«лев» sent to the stage before the reveal').not.toMatch(/"лев"/);
  await show35(host);
  await expect.poll(() => revealRow35(stage, 'Хосе').getAttribute('class'), POLL).toContain('is-hit');
  expect(await revealRow35(stage, 'Оля').getAttribute('class'), '«Левиця» is not «лев»').toContain('is-safe');
  await jose.locator('.think-verdict').getByText(es35.thinkOutNow!, exact).waitFor();
  expect(await hearts35(jose)).toBe(0);
  await shot(jose, 'think35-phone-out-es-320');

  // ── Питання 4: заготовлене «горобець». Оля «горобці» (закінчення + описка — збіг, остання ❤️), Тарас «лелека»; Хосе — глядач. ──
  await next27a(host);
  await afterSplash(host, stage, ...phones);
  await stage.locator('.think-stage h1').getByText('Напишіть птаха', exact).waitFor();
  await jose.getByText(es35.thinkOutNow!, exact).waitFor();
  expect(await jose.locator('.think-field').count(), 'a field for an eliminated player').toBe(0);
  expect(await stageRow35(stage, 'Хосе').getAttribute('class'), 'Jose out on the stage').toContain('is-out');
  await writeWord35(olya, 'горобці');
  await writeWord35(taras, 'лелека');
  await expect.poll(() => hostRow35(host, 'Оля').locator('.tag').first().textContent(), POLL).toBe('збіг');
  await reveal28a(host);
  await expect.poll(() => revealRow35(stage, 'Оля').getAttribute('class'), POLL).toContain('is-hit');
  await olya.locator('.think-verdict').getByText(ukMessages.thinkOutNow, exact).waitFor();
  // Світла тема на сцені й телефоні Олі: перезавантаження — гра повертається за токеном.
  for (const page of [stage, olya]) {
    await page.evaluate(() => localStorage.setItem('quiz:theme', 'light'));
    await page.reload();
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('is-light')), POLL).toBe(true);
  }
  await stage.locator('.think-reveal.is-big').waitFor();
  await olya.locator('.think-verdict').waitFor();
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'think35-light-stage-reveal');
  await shot(olya, 'think35-light-phone-verdict');

  // ── «Далі»: живим лишився Тарас — раунд закінчується, «квітка» не з'являється. Раунд останній — одразу фініш: місця поряд із п'єдесталом.
  //    Місця: Тарас 1 (+3000), Оля 2 (+1500), Хосе 3 (0); «Разом» — загальний рахунок. ──
  await step27a(host, 'Далі');
  await stage.locator('.stage-board .think-places').waitFor();
  const placesWanted = ['1 місце | Тарас | ❤️❤️ | +3000 | 3000', '2 місце | Оля | вибування на питанні 4 | +1500 | 1500', '3 місце | Хосе | вибування на питанні 3 | 0 | 0'];
  await expect.poll(() => placeRows35(stage), POLL).toEqual(placesWanted);
  expect(await bodyText(stage), 'the fifth question shown').not.toContain('Напишіть квітку');
  for (const [page, score] of [[olya, '1500'], [taras, '3000'], [jose, '0']] as const) await expect.poll(() => phoneScore27a(page).textContent().then((t) => (t ?? '').replace(/\s/g, '')), POLL).toBe(score);
  await shot(stage, 'think35-light-stage-places');
  await stage.evaluate(() => localStorage.setItem('quiz:theme', 'dark'));
  await stage.reload();
  await stage.locator('.stage-board .think-places').waitFor();
  await shot(stage, 'think35-stage-places');
  await expectNoSideScroll(jose, 'think35-phone-places-es-320');
  await expectNoSideScroll(taras, 'think35-phone-places-360');

  // ── Історія: слова ведучого й вердикти. ──
  await host.goto(`${base}/history`);
  await host.getByRole('link', { name: /Думай інакше 35/ }).click();
  const fruit = host.locator('.rows.stacked > li', { hasText: 'Напишіть фрукт' });
  await fruit.locator('.think-history').getByText('Слова ведучого: яблуко (яблучко), банан', exact).waitFor();
  const lines = (await fruit.locator('.think-history-rows li').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
  // Рядки — у порядку відповідей; ручне «Зняти збіг» біля Тараса збережено.
  expect([...lines].sort()).toEqual(['Оля груша в безпеці ❤️ 1', 'Тарас Яблука в безпеці вручну ❤️ 2', 'Хосе манго в безпеці ❤️ 1']);
  const animal = host.locator('.rows.stacked > li', { hasText: 'Напишіть тварину з зоопарку' });
  await animal.locator('.think-history').getByText('Слова ведучого: лев', exact).waitFor();
  expect(await animal.locator('.think-history-rows li', { hasText: 'Хосе' }).innerText()).toContain('збіг');
  await shot(host, 'think35-history');
}

async function thinkSolo35() {
  // ── Соло: один гравець, життя 1, 3 питання, жодного збігу — проходить усі три й отримує P. ──
  const host = await open('host35s', 1280, 900);
  await register(host, 'host', 'Марта Ведуча', 'host35s@example.com');
  const round = thinkRound('th35s', [think('s1', words35(['кіт']), { text: 'Напишіть домашню тварину' }), think('s2', words35(['хліб']), { text: 'Напишіть, що їдять на сніданок' }), think('s3', words35(['море']), { text: 'Напишіть, куди їдуть улітку' })], { lives: 1, points: 2000 });
  const data = { ...makeRoundsQuiz([round], { leaderboard: 'end' }), title: 'Думай інакше соло 35' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Думай інакше соло 35' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage35s', 1600, 900);
  await stage.goto(stageUrl);
  const olya = await open('olya35s', 375, 812);
  await join(olya, code, 'Оля', false);
  await stage.getByText('Оля').waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage, olya);
  await step27a(host, 'Почати раунд');
  for (const [k, word] of ['папуга', 'каша', 'гори'].entries()) {
    if (k > 0) await next27a(host);
    await afterSplash(host, stage, olya);
    await olya.locator('.think-field').waitFor();
    await writeWord35(olya, word);
    await reveal28a(host);
    await olya.locator('.think-verdict').getByText('Ви в безпеці', exact).waitFor();
    expect(await hearts35(olya), `the solo heart after question ${k + 1}`).toBe(1);
  }
  await step27a(host, 'Далі');
  await stage.locator('.stage-board .think-places').waitFor();
  await expect.poll(() => placeRows35(stage), POLL).toEqual(['1 місце | Оля | ❤️ | +2000 | 2000']);
  await expect.poll(() => phoneScore27a(olya).textContent().then((t) => (t ?? '').replace(/\s/g, '')), POLL).toBe('2000');
  await shot(stage, 'think35-solo-places');
}

async function thinkTeams35() {
  // ── Команди: дві по двоє; капітан пише, товариш бачить слово лише для читання; ряд сцени — команди; місця й очки командні. ──
  const host = await open('host35t', 1280, 900);
  await register(host, 'host', 'Олег Ведучий', 'host35t@example.com');
  const round = thinkRound('th35t', [think('t1', words35(['сонце']), { text: 'Напишіть, що світить удень' }), think('t2', words35(['сніг']), { text: 'Напишіть, що буває взимку' }), think('t3', words35(['гриб']), { text: 'Напишіть, що росте в лісі' })], { lives: 1, points: 1000 });
  const data = { ...makeRoundsQuiz([round], { leaderboard: 'end', teams: { count: 2, names: ['Червоні', 'Сині'], answerer: 'captain' } }), title: 'Думай інакше команди 35' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Думай інакше команди 35' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage35t', 1600, 900);
  const stageFrames = socketFrames(stage);
  await stage.goto(stageUrl);
  const olya = await open('olya35t', 375, 812);
  const petro = await open('petro35t', 320, 640);
  const ira = await open('ira35t', 375, 812);
  const marko = await open('marko35t', 360, 740);
  const phones = [olya, petro, ira, marko];
  const markoFrames = socketFrames(marko);
  for (const [page, nickname, team] of [[olya, 'Оля', 'Червоні'], [petro, 'Петро', 'Червоні'], [ira, 'Іра', 'Сині'], [marko, 'Марко', 'Сині']] as const) {
    await join(page, code, nickname, false);
    await page.locator('.team-pick-grid').waitFor();
    await pickTeamOn(page, team);
  }
  await click(host, 'Почати гру');
  await afterSplash(host, stage, ...phones);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage, ...phones);
  const from = stageFrames.length;
  const markoFrom = markoFrames.length;
  await stage.locator('.think-stage h1').getByText('Напишіть, що світить удень', exact).waitFor();
  await expect.poll(() => stage.locator('.think-row .name').allTextContents(), POLL).toEqual(['Червоні', 'Сині']);
  // Капітани (перші в команді) пишуть; товариші поля не мають і бачать слово капітана лише для читання.
  await olya.locator('.think-field').waitFor();
  await ira.locator('.think-field').waitFor();
  expect(await petro.locator('.think-field').count(), 'a field for a teammate').toBe(0);
  expect(await marko.locator('.think-field').count(), 'a field for a teammate').toBe(0);
  await olya.locator('.think-field').fill('Сонце');
  await expect.poll(() => bodyText(petro), POLL).toContain('Сонце');
  await shot(olya, 'think35-team-captain');
  await shot(petro, 'think35-team-watch');
  await expectNoSideScroll(petro, 'think35-team-watch-320');
  await click(olya, 'Надіслати');
  await olya.locator('.think-sent').waitFor();
  await writeWord35(ira, 'місяць');
  expect(beforeReveal35(stageFrames, from), 'a team draft on the stage').not.toContain('Сонце');
  expect(beforeReveal35(markoFrames, markoFrom), 'another team’s word on a phone').not.toContain('Сонце');
  expect(beforeReveal35(stageFrames, from), 'the host word on the stage').not.toContain('сонце');
  await reveal28a(host);
  await expect.poll(() => revealRow35(stage, 'Червоні').getAttribute('class'), POLL).toContain('is-hit');
  await petro.locator('.think-verdict').getByText('Збіг: −1 ❤️', exact).waitFor();
  await marko.locator('.think-verdict').getByText('Ви в безпеці', exact).waitFor();
  // Одна команда лишилась — раунд закінчується. Сині 1 (+1000), Червоні 2 (0).
  await step27a(host, 'Далі');
  await stage.locator('.stage-board .think-places').waitFor();
  await expect.poll(() => placeRows35(stage), POLL).toEqual(['1 місце | Сині | ❤️ | +1000 | 1000', '2 місце | Червоні | вибування на питанні 1 | 0 | 0']);
  for (const [page, score] of [[olya, '0'], [petro, '0'], [ira, '1000'], [marko, '1000']] as const) await expect.poll(() => phoneScore27a(page).textContent().then((t) => (t ?? '').replace(/\s/g, '')), POLL).toBe(score);
  await shot(stage, 'think35-team-places');
}

async function thinkAutopilot35(sockets: Socket[]) {
  // ── Вікторина з питанням без слів: вікно запуску показує блок, «Створити кімнату» неактивна. ──
  const author = await open('author35a', 375, 812);
  await register(author, 'host', 'Марта Авторка', 'author35a@example.com');
  const qs = (words: [boolean, boolean, boolean]) => [
    think('a1', words[0] ? words35(['кава']) : [], { text: 'Напишіть гарячий напій', timeLimit: 25 }),
    think('a2', words[1] ? words35(['м’яч', 'мʼячик']) : [], { text: 'Напишіть іграшку', timeLimit: 25 }),
    think('a3', words[2] ? words35(['дощ']) : [], { text: 'Напишіть погоду восени', timeLimit: 25 }),
  ];
  for (const [title, words] of [['Без слів 35', [true, false, true]], ['Бот і слова 35', [true, true, true]]] as const) {
    const data = { ...makeRoundsQuiz([thinkRound('th35a', qs([...words]), { lives: 2, points: 1000 })], { leaderboard: 'end' }), title };
    const saved = await author.request.post(`${base}/api/quizzes`, { data });
    expect(saved.ok(), await saved.text()).toBe(true);
  }
  await author.goto(`${base}/quizzes`);
  await author.locator('.quiz-list li', { hasText: 'Без слів 35' }).getByRole('button', { name: 'Провести ботом', ...exact }).click();
  const dialog = author.getByRole('dialog', { name: 'Гра без ведучого', ...exact });
  await dialog.locator('.autopilot-blocks').getByText(ukMessages.autopilotBlock_think_words, exact).waitFor();
  expect(await dialog.locator('.autopilot-blocks li').innerText()).toMatch(/1$/);
  await dialog.getByLabel('Твій нікнейм у грі').fill('Марта');
  expect(await dialog.getByRole('button', { name: 'Створити кімнату', ...exact }).isDisabled(), '«Create» with a wordless question').toBe(true);
  await shot(author, 'think35-autopilot-blocked');
  await author.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  // ── Вікторина з усіма словами: запуск, автор — глядач, двоє гравців-сокетів пишуть. ──
  await author.locator('.quiz-list li', { hasText: 'Бот і слова 35' }).getByRole('button', { name: 'Провести ботом', ...exact }).click();
  await dialog.getByLabel('Твій нікнейм у грі').fill('Марта');
  const authorFrames = socketFrames(author);
  await dialog.getByRole('button', { name: 'Створити кімнату', ...exact }).click();
  await author.waitForURL(/\/play\/[^/]+$/);
  const code = author.url().split('/').pop()!;
  const vira = await pilotPlayer(sockets, code, 'Віра');
  const petro = await pilotPlayer(sockets, code, 'Петро');
  await author.getByText('Петро', exact).locator('visible=true').first().waitFor();
  await author.getByRole('button', { name: 'Почати гру', ...exact }).click();
  // Слова кожного питання: Віра збігається на першому, далі всі пишуть безпечні слова.
  let authorFrom = 0;
  const plan: [string, string, string][] = [['Напишіть гарячий напій', 'кава', 'чай'], ['Напишіть іграшку', 'лялька', 'юла'], ['Напишіть погоду восени', 'туман', 'вітер']];
  for (const [index, [text, viraWord, petroWord]] of plan.entries()) {
    const at = await frame(vira, (v) => v.phase === 'question' && v.question?.text === text);
    await author.getByText(text, exact).first().waitFor({ timeout: 60_000 });
    await author.locator('.think-status').getByText(ukMessages.thinkSpectatorAuthor, exact).waitFor();
    expect(await author.locator('.think-field').count(), 'a field for the author').toBe(0);
    if (index === 0) await shot(author, 'think35-autopilot-author');
    // Віра може сама написати слово ведучого — її кадри перевіряються до власної відповіді, Петрові — до розкриття.
    const viraAnswered = vira.raw.length;
    await emitOk(vira, 'player:answer', { type: 'think', value: viraWord });
    await emitOk(petro, 'player:answer', { type: 'think', value: petroWord });
    // Розкриття — саме (автопілот), і до нього в кадрах гравців немає слова ведучого.
    const shown = await frame(vira, (v) => v.phase === 'reveal' && v.question?.text === text, at.index);
    const hostWord = (['кава', 'м’яч', 'дощ'] as const)[index]!;
    expect(vira.raw.slice(at.index, viraAnswered).join(NL), `«${hostWord}» sent to Віра before the reveal`).not.toContain(hostWord);
    const petroShown = (await frame(petro, (v) => v.phase === 'reveal' && v.question?.text === text)).index;
    expect(petro.raw.slice(0, petroShown).join(NL), `«${hostWord}» sent to Петро before the reveal`).not.toContain(`"${hostWord}"`);
    expect(beforeReveal35(authorFrames, authorFrom), `«${hostWord}» sent to the author before the reveal`).not.toContain(`"${hostWord}"`);
    await author.locator('.think-reveal').waitFor();
    authorFrom = authorFrames.length;
    expect(shown.view.think?.words?.map((w) => w.word)).toEqual([hostWord]);
  }
  // Гра доходить до таблиці місць без автора: Петро 1 (❤️❤️, +1000), Віра 2 (❤️, 0).
  // Раунд останній — після розкриття одразу фініш, місця в зрізі там.
  const end = await frame(vira, (v) => (v.phase === 'round_end' || v.phase === 'finished') && (v.think?.places?.length ?? 0) > 0);
  expect(end.view.think!.places!.map((p) => [p.nickname, p.place, p.points])).toEqual([['Петро', 1, 1000], ['Віра', 2, 0]]);
  for (const view of stateViews(authorFrames)) expect(view.me.think?.status ?? 'spectator', 'the author plays the think round').toBe('spectator');
}

/** Сцена 1280 × 720 без прокрутки; жоден рядок не ховається під кутом «Читати вголос» чи смугою реакцій. */
async function expectThinkStageFits35(stage: Page, name: string) {
  const [height, clientH, width, clientW] = (await stage.evaluate(
    '[document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]',
  )) as number[];
  expect(height, `${name}: the stage scrolls down (${height} > ${clientH})`).toBeLessThanOrEqual(clientH!);
  expect(width, `${name}: the stage scrolls sideways (${width} > ${clientW})`).toBeLessThanOrEqual(clientW!);
  const covered = await stage.evaluate(() => {
    const blockers = [...document.querySelectorAll('.stage-speech .btn, .reaction-strip')].map((el) => el.getBoundingClientRect()).filter((box) => box.width > 0 && box.height > 0);
    return [...document.querySelectorAll('.think-row, .think-reveal-row, .think-places-table tr')]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        if (box.bottom > innerHeight + 1) return true;
        return blockers.some((b) => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top);
      })
      .map((el) => el.textContent);
  });
  expect(covered, `${name}: rows out of view or under a fixed corner`).toEqual([]);
}

async function thinkCrowd35(sockets: Socket[]) {
  const host = await open('host35c', 1280, 900);
  await register(host, 'host', 'Леся Ведуча', 'host35c@example.com');
  const round = thinkRound('th35c', [think('c1', words35(['червоний', 'багряний', 'алий'], ['синій', 'синенький'], ['зелений', 'смарагдовий'])), think('c2', words35(['яблуко'])), think('c3', words35(['лев']))], { lives: 3, points: 5000 });
  const data = { ...makeRoundsQuiz([round], { leaderboard: 'end' }), title: 'Думай інакше натовп 35' };
  const saved = await host.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  await host.goto(`${base}/quizzes`);
  await host.locator('.quiz-list li', { hasText: 'Думай інакше натовп 35' }).getByRole('button', { name: 'Грати', ...exact }).click();
  await host.waitForURL(/\/host\/\d{6}$/);
  const code = host.url().slice(-6);
  const stageUrl = (await host.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href'))!;
  const stage = await open('stage35c', 1280, 720);
  await stage.goto(stageUrl);
  // Довгі імена до 20 символів і довгі слова — найширші рядки.
  const names = [
    'Олександра Петренко', 'Богдана Коваленко', 'Ярослав Шевченко', 'Мирослава Бондар', 'Владислав Ткаченко', 'Анастасія Мельник',
    'Святослав Кравчук', 'Христина Олійник', 'Станіслав Лисенко', 'Катерина Руденко', 'Остап Марченко', 'Соломія Савченко',
    'Тарас Гончаренко', 'Ірина Кузьменко', 'Максим Литвиненко', 'Вероніка Захарчук', 'Назар Поліщук', 'Злата Тимошенко',
    'Дмитро Павленко', 'Олена Кириленко', 'Роман Мороз', 'Оксана Бойко', 'Іван Сидоренко', 'Марта Гнатюк',
  ];
  const colors = ['червоний', 'Синя', 'зелений', 'фіолетовий', 'помаранчевий', 'жовтий', 'блакитний', 'смарагдово-бірюзовий', 'Червона', 'індиго', 'бузковий', 'малиновий'];
  const players: Pilot35[] = [];
  for (const nickname of names) players.push(await pilotPlayer(sockets, code, nickname));
  await stage.getByText('Марта Гнатюк').waitFor();
  await click(host, 'Почати гру');
  await afterSplash(host, stage);
  await step27a(host, 'Почати раунд');
  await afterSplash(host, stage);
  await stage.locator('.think-stage h1').waitFor();
  // Половина відповідає — на сцені ✓; кожен гравець ставить реакцію, щоб смуга реакцій була на місці.
  for (const [index, player] of players.entries()) {
    if (index % 2 === 0) await emitOk(player, 'player:answer', { type: 'think', value: colors[index % colors.length]! });
  }
  for (const player of players.slice(0, 6)) await player.emit('player:react', { kind: 'emoji', value: '👏' });
  await expect.poll(() => stage.locator('.think-row .think-answered').count(), POLL).toBe(12);
  if (process.env.E2E_SHOTS === '1') await sleep(800);
  await shot(stage, 'think35-stage-question-24');
  await expectThinkStageFits35(stage, 'question with 24 players');
  for (const [index, player] of players.entries()) {
    if (index % 2 === 1) await emitOk(player, 'player:answer', { type: 'think', value: colors[index % colors.length]! });
  }
  await reveal28a(host);
  await stage.locator('.think-reveal.is-big').waitFor();
  await expect.poll(() => stage.locator('.think-reveal-row').count(), POLL).toBe(24);
  for (const player of players.slice(6, 12)) await player.emit('player:react', { kind: 'emoji', value: '😂' });
  if (process.env.E2E_SHOTS === '1') await sleep(1200);
  await shot(stage, 'think35-stage-reveal-24');
  await expectThinkStageFits35(stage, 'reveal with 24 players');
  // Довгі слова й імена переносяться за складами, а не посеред літер; синоніми в щільному режимі сховано.
  expect(await stage.locator('.think-reveal.is-big .think-synonyms').evaluateAll((all) => all.filter((el) => getComputedStyle(el).display !== 'none').length), 'synonyms with 24 players').toBe(0);
  expect(await stage.locator('.think-reveal-word').first().evaluate((el) => getComputedStyle(el).hyphens)).toBe('auto');
  await stage.setViewportSize({ width: 1600, height: 900 });
  await shot(stage, 'think35-stage-reveal-24-1600');
  await expectThinkStageFits35(stage, 'reveal with 24 players at 1600×900');
}

type Pilot35 = Awaited<ReturnType<typeof pilotPlayer>>;
