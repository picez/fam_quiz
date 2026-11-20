import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { DEFAULT_RULES } from '@quiz/shared';
import { type Locator, type Page } from 'playwright-core';
import { type Socket } from 'socket.io-client';
import { expect, it } from 'vitest';
import { open, click, field, join, expectFitsWidth13a, POLL, pilotSocket, pilotPlayer, frame, emitOk, createAutopilot, register, squash, sleep, writeLie, socketFrames, stateViews } from './helpers/common';
import { exact, base, problems, ARTIFACTS, snapshot, afterSplash, useE2eServer } from './helpers/setup';

/**
 * Наскрізний тест частини 60 (дрібні правки гри, 45a–45c): телефон 360 × 740 у світлій темі, кімната-автопілот.
 * Автор Марта й Петро — сокети, Оля — сторінка; сцена 1280 × 720 за stageToken. Потребує зібраного клієнта (pnpm build) і Chrome.
 */

useE2eServer();

/** Кадр екрана телефона (лише вікно, без прокрутки): E2E_SHOTS=1. */
async function viewportShot(page: Page, name: string) {
  if (process.env.E2E_SHOTS !== '1') return;
  mkdirSync(resolve(ARTIFACTS, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS, 'shots', `${name}.png`) });
}

/** Той самий кадр у темній темі (клас is-light знято на мить): нові рядки 45a/45c читаються й там. */
async function darkShot(page: Page, name: string) {
  if (process.env.E2E_SHOTS !== '1') return;
  await page.evaluate("document.documentElement.classList.remove('is-light')");
  await viewportShot(page, `${name}-dark`);
  await page.evaluate("document.documentElement.classList.add('is-light')");
}

async function smallFixes60(sockets: Socket[]) {
  const author = await open('author60', 1280, 900);
  await register(author, 'host', 'Марта Правки', 'author60@example.com');
  const common = { imageUrl: null, video: null };
  const q1 = { ...common, id: 'f1', type: 'text' as const, text: 'Хто написав «Кобзар»?', points: 200, timeLimit: 40, accepted: ['Тарас Шевченко'] };
  const q2 = { ...common, id: 'f2', type: 'numeric' as const, text: 'Скільки областей в Україні?', points: 100, timeLimit: 40, correct: 24, tolerance: 0 };
  const q3 = { ...common, id: 'f3', type: 'text' as const, text: 'Як звали київську княжну, що стала королевою Франції?', points: 100, timeLimit: 40, accepted: ['Анна Ярославна', 'Анна'] };
  const q4 = {
    ...common,
    id: 'f4',
    type: 'bluff' as const,
    text: 'Найглибше озеро України — …',
    points: 1000,
    timeLimit: 60,
    choiceTime: 30,
    accepted: ['Світязь'],
    lies: ['Синевир', 'Несамовите'],
  };
  const data = {
    ...makeRoundsQuiz([classicRound('r1', [q1, q2, q3, q4] as never, { title: 'Розминка', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES })], {}),
    title: 'Дрібні правки 60',
  };
  const saved = await author.request.post(`${base}/api/quizzes`, { data });
  expect(saved.ok(), await saved.text()).toBe(true);
  // Автор — автопілот-кімната: гра без ведучого, Марта — сокет автора.
  const room = await createAutopilot(author, ((await saved.json()) as { id: string }).id);
  const { code } = room;
  const marta = await pilotSocket(sockets, code, room.token, 'Марта');
  const petro = await pilotPlayer(sockets, code, 'Петро');

  // Оля: телефон 360 × 740 зі світлою темою (до першого завантаження).
  const olya = await open('olya60', 360, 740);
  await olya.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  const olyaFrames = socketFrames(olya);
  await join(olya, code, 'Оля', false);
  const stage = await open('stage60', 1280, 720);
  await stage.goto(`${base}/stage/${code}#${room.stageToken}`);

  const textOf = async (locator: Locator) => squash(await locator.first().textContent({ timeout: 500 }).catch(() => null)) || null;
  const appealButton = (page: Page) => page.locator('button.appeal-button');
  const answerField = (page: Page) => field(page, 'Ваша відповідь');
  const focused = (locator: Locator) => locator.evaluate((el) => el === document.activeElement).catch(() => false);
  const olyaLeft = () => (stateViews(olyaFrames).at(-1)?.me as unknown as { appeal?: { left: number } | null } | null)?.appeal?.left ?? null;
  const BUTTON = (left: number) => `⚖️ Оскаржити (лишилось ${left})`;

  expect(await marta.emit('host:start')).toEqual({ ok: true });
  await afterSplash(olya);
  await olya.getByText('Хто написав «Кобзар»?', exact).waitFor({ timeout: 60_000 });
  await afterSplash(olya);

  // 1. q1: після заставки курсор у полі відповіді (без кліку), на сцені фокуса немає.
  await expect.poll(() => focused(answerField(olya)), POLL).toBe(true);
  expect(await stage.evaluate('document.activeElement === document.body'), 'the stage has a focused element').toBe(true);
  await expectFitsWidth13a(olya, 'p60-focus-text-360');
  await olya.keyboard.type('Шевченко');
  expect(await answerField(olya).inputValue(), 'the typed text did not reach the field').toBe('Шевченко');
  await viewportShot(olya, 'p60-focus-text-360');
  await click(olya, 'Відповісти');
  await emitOk(marta, 'player:answer', { type: 'text', value: 'Тарас Шевченко' });
  await emitOk(petro, 'player:answer', { type: 'text', value: 'Тарас Шевченко' });

  // 2. Розкриття q1: «лишилось 2»; прийнята апеляція лишається у гравця.
  await expect.poll(() => textOf(appealButton(olya)), { timeout: 15_000 }).toBe(BUTTON(2));
  const before1 = marta.frames.length;
  await appealButton(olya).click();
  const open1 = await frame(marta, (v) => v.appeal !== null && v.appeal.outcome === null, before1);
  await expect.poll(() => appealButton(olya).count(), POLL).toBe(0);
  await expect.poll(() => olyaLeft(), POLL).toBe(1);
  const id1 = open1.view.appeal!.id;
  expect(await marta.emit('player:appeal-vote', { appealId: id1, yes: true })).toEqual({ ok: true });
  expect(await petro.emit('player:appeal-vote', { appealId: id1, yes: true })).toEqual({ ok: true });
  await expect.poll(() => textOf(olya.locator('p.appeal-result')), POLL).toBe('⚖️ Зараховано! +200');
  await expect.poll(() => textOf(olya.locator('p.appeal-kept')), POLL).toBe('Оскарження прийнято — воно лишається у вас');
  await expectFitsWidth13a(olya, 'p60-appeal-kept-360');
  await viewportShot(olya, 'p60-appeal-kept-360');
  await darkShot(olya, 'p60-appeal-kept-360');
  expect(await olya.locator('p.appeal-kept').count()).toBe(1);

  // 3. q2 (число): курсор у полі; відхилена апеляція (ні) — рядка «лишається у вас» немає.
  await olya.getByText('Скільки областей в Україні?', exact).waitFor({ timeout: 60_000 });
  await afterSplash(olya);
  await expect.poll(() => focused(answerField(olya)), POLL).toBe(true);
  expect(await stage.evaluate('document.activeElement === document.body'), 'the stage has a focused element on the number question').toBe(true);
  await viewportShot(olya, 'p60-focus-number-360');
  await olya.keyboard.type('25');
  await click(olya, 'Відповісти');
  await emitOk(marta, 'player:answer', { type: 'numeric', value: 24 });
  await emitOk(petro, 'player:answer', { type: 'numeric', value: 24 });
  await expect.poll(() => textOf(appealButton(olya)), { timeout: 15_000 }).toBe(BUTTON(2));
  const before2 = marta.frames.length;
  await appealButton(olya).click();
  const open2 = await frame(marta, (v) => v.appeal !== null && v.appeal.outcome === null, before2);
  expect(await marta.emit('player:appeal-vote', { appealId: open2.view.appeal!.id, yes: false })).toEqual({ ok: true });
  expect(await petro.emit('player:appeal-vote', { appealId: open2.view.appeal!.id, yes: false })).toEqual({ ok: true });
  await expect.poll(() => textOf(olya.locator('p.appeal-result')), POLL).toBe('⚖️ Лишається як було · так 0 · ні 2');
  expect(await olya.locator('p.appeal-kept').count(), 'a rejected appeal says it is kept').toBe(0);

  // 4. q3: Оля помиляється — лишилась одна апеляція (відхилена згоріла, прийнята — ні); кнопку не тиснемо.
  await olya.getByText('Як звали київську княжну, що стала королевою Франції?', exact).waitFor({ timeout: 60_000 });
  await afterSplash(olya);
  await olya.getByLabel('Ваша відповідь', exact).fill('Ольга');
  await click(olya, 'Відповісти');
  await emitOk(marta, 'player:answer', { type: 'text', value: 'Анна Ярославна' });
  await emitOk(petro, 'player:answer', { type: 'text', value: 'Анна' });
  await expect.poll(() => textOf(appealButton(olya)), { timeout: 15_000 }).toBe(BUTTON(1));
  await expectFitsWidth13a(olya, 'p60-appeal-used-360');
  await viewportShot(olya, 'p60-appeal-used-360');

  // 5. q4, блеф: Оля надсилає вигадку, «Змінити» відкриває поле зі старим текстом; етап чекає на неї.
  await olya.getByText('Найглибше озеро України — …', exact).waitFor({ timeout: 60_000 });
  await afterSplash(olya);
  await writeLie(olya, 'Тисове');
  await expect.poll(() => textOf(olya.locator('section.bluff-play p.lead')), POLL).toBe('Твоя вигадка: «Тисове». Чекаємо на інших.');
  const edit = olya.getByRole('button', { name: 'Змінити', ...exact });
  await edit.waitFor();
  await expectFitsWidth13a(olya, 'p60-bluff-sent-360');
  await viewportShot(olya, 'p60-bluff-sent-360');
  await darkShot(olya, 'p60-bluff-sent-360');
  await edit.click();
  const lieField = field(olya, 'Твоя вигадка');
  await lieField.waitFor();
  expect(await lieField.inputValue(), 'the field reopens with the old lie').toBe('Тисове');
  await expect.poll(() => focused(lieField), POLL).toBe(true);
  await expectFitsWidth13a(olya, 'p60-bluff-edit-360');
  await viewportShot(olya, 'p60-bluff-edit-360');
  const mark = marta.frames.length;
  await emitOk(marta, 'player:lie', { text: 'Ялпуг' });
  await emitOk(petro, 'player:lie', { text: 'Бребенескул' });
  await frame(marta, (v) => v.bluff?.stage === 'lies' && v.bluff.written === 2, mark);
  await sleep(2000);
  const waiting = marta.frames.slice(mark);
  expect(waiting.every((f) => f.view.bluff?.stage === 'lies'), 'the stage closed while Оля rewrites').toBe(true);
  expect(marta.frames.at(-1)!.view.bluff!.written, 'written count').toBe(2);
  await olya.getByText('Вигадали 2 з 3', exact).waitFor();

  // Оля стирає й пише нову: етап закривається, у варіантах — лише нова вигадка.
  await lieField.fill('');
  await lieField.fill('Шацьке');
  await click(olya, 'Надіслати вигадку');
  await frame(marta, (v) => v.bluff?.stage === 'choice', mark);
  const choice = await frame(petro, (v) => v.bluff?.stage === 'choice' && v.bluff.options.length > 0);
  const texts = choice.view.bluff!.options.map((option) => option.text.toLowerCase());
  expect(texts, 'the new lie is among the options').toContain('шацьке');
  expect(texts, 'the old lie is gone').not.toContain('тисове');
  await expectFitsWidth13a(olya, 'p60-bluff-choice-360');
  await viewportShot(olya, 'p60-bluff-choice-360');

  // 6. Світла тема й чиста консоль.
  expect(await olya.evaluate("document.documentElement.classList.contains('is-light')"), 'the light theme is on').toBe(true);
  expect(problems).toEqual([]);
}

it('part 60: small game fixes — on a 360 phone in the light theme the answer field has the cursor right after the splash on a text and a number question while the stage has no focus; Оля’s accepted appeal stays («лишилось 2» again) and the rejected one is used («лишилось 1»); in bluff Оля sends a lie, taps «Змінити», the field reopens with it, the stage waits for her and the choice shows only her new lie', async () => {
  const sockets: Socket[] = [];
  try {
    await smallFixes60(sockets);
  } catch (error) {
    await snapshot();
    throw error;
  } finally {
    for (const socket of sockets) socket.close();
  }
}, 300_000);
