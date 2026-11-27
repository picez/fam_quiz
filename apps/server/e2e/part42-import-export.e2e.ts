import { readFileSync } from 'node:fs';
import { blitzRound, classicRound, makeRoundsQuiz } from '@quiz/engine/testing';
import { type Download, type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { open, expectNoSideScroll, register, silentMp3 } from './helpers/common';
import { exact, base, problems, snapshot, shot, useE2eServer, avatarPng } from './helpers/setup';

/**
 * Наскрізні тести: частина 42 — імпорт і експорт вікторин (38e): файл .quiz з медіа туди й назад (нові адреси, ті самі байти),
 * таблиця .xlsx для чотирьох типів із лічильником пропущених, звіт помилок рядків CSV без створення вікторини, шаблон,
 * невідомий файл; телефон 360 px, світла тема.
 */

useE2eServer();

const TITLE = 'Річки й природа 42';
const FILE_BASE = 'Річки-й-природа-42';
const NEW_URL = /^\/uploads\/[a-z0-9]{16,64}\./;
const MEDIA_URL = /^\/uploads\/[a-z0-9]{16,64}\.(?:jpg|png|webp|mp3|ogg|m4a)$/;

it('part 42: import export — a quiz file round trip with media, a table round trip for four types, the row report and the template, phone 360 px, light theme', async () => {
  try {
    await importExport42();
  } catch (error) {
    await snapshot();
    throw error;
  }
}, 600_000);

type Json = Record<string, unknown>;

/** Адреси медіа у вмісті в порядку обходу (будь-який рядок, що повністю збігається з шаблоном). */
function mediaUrls(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') {
    if (MEDIA_URL.test(value)) into.push(value);
  } else if (Array.isArray(value)) for (const item of value) mediaUrls(item, into);
  else if (value !== null && typeof value === 'object') for (const item of Object.values(value)) mediaUrls(item, into);
  return into;
}

/** Копія без поля id вікторини (решту полів — як є). */
function withoutId(quiz: Json): Json {
  const { id: _id, ...rest } = quiz;
  return rest;
}

async function pickedDownload(page: Page, action: () => Promise<void>): Promise<{ download: Download; name: string; bytes: Buffer }> {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);
  return { download, name: download.suggestedFilename(), bytes: readFileSync((await download.path())!) };
}

async function importExport42() {
  const author = await open('author42', 360, 740);
  await author.context().addInitScript(() => localStorage.setItem('quiz:theme', 'light'));
  await register(author, 'menu', 'Марта Автор', 'author42@example.com');

  // ── 1. Вікторина: медіа, шість запитань у класичному раунді, бліц, запасні. ──
  const upload = async (path: string, data: Buffer, type: string) => {
    const response = await author.request.post(`${base}${path}`, { data, headers: { 'content-type': type } });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { url: string }).url;
  };
  const picture = await upload('/api/uploads', avatarPng(), 'image/png');
  const optionPicture = await upload('/api/uploads', avatarPng(), 'image/png');
  const sound = await upload('/api/uploads/audio', silentMp3(), 'audio/mpeg');

  const common = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
  const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i]!, text }));
  const classic = [
    { ...common, id: 'q1', type: 'single', text: 'Яка річка протікає через Київ?', options: options('Дніпро', 'Дністер', 'Південний Буг', 'Десна'), correctId: 'a', hint: 'Найдовша річка України' },
    {
      ...common,
      id: 'q2',
      type: 'single',
      text: 'Яка з цих річок на картинці?',
      imageUrl: picture,
      timeLimit: 40,
      options: [
        { id: 'a', text: 'Десна', imageUrl: optionPicture },
        { id: 'b', text: 'Сейм' },
      ],
      correctId: 'a',
    },
    { ...common, id: 'q3', type: 'boolean', text: 'Дністер впадає в Балтійське море?', correct: false, points: 500, timeLimit: 25 },
    { ...common, id: 'q4', type: 'text', text: 'Як називається найвища гора України?', accepted: ['Говерла', 'гора Говерла'] },
    { ...common, id: 'q5', type: 'numeric', text: 'Скільки ніг у павука?', correct: 8, tolerance: 0, timeLimit: 25 },
    {
      ...common,
      id: 'q6',
      type: 'single',
      text: 'Яка тварина так співає?',
      audio: { source: 'file', url: sound, start: 0, duration: 5 },
      options: options('Соловей', 'Ворона'),
      correctId: 'a',
    },
  ];
  const blitz = [
    { ...common, id: 'b1', type: 'single', text: 'Яке дерево символ України?', options: options('Калина', 'Дуб'), correctId: 'a' },
    { ...common, id: 'b2', type: 'single', text: 'Яка квітка жовта навесні?', options: options('Кульбаба', 'Троянда'), correctId: 'a' },
  ];
  const spare = { ...common, id: 's1', type: 'single', text: 'Яка пташка приносить весну?', options: options('Ластівка', 'Горобець'), correctId: 'a' };
  const quiz = {
    ...makeRoundsQuiz([
      classicRound('r1', classic as never, { title: 'Річки', speedBonus: false, shuffleOptions: false }),
      blitzRound('r2', blitz as never, { title: 'Бліц' }),
    ]),
    title: TITLE,
    spares: [spare],
  };
  const created = await author.request.post(`${base}/api/quizzes`, { data: quiz });
  expect(created.ok(), await created.text()).toBe(true);
  const oldId = ((await created.json()) as { id: string }).id;
  const oldQuiz = (await (await author.request.get(`${base}/api/quizzes/${oldId}`)).json()) as Json;
  const oldMedia = mediaUrls(oldQuiz);
  expect(oldMedia.length, 'media in the source quiz').toBe(3);
  const row = (id: string) => author.locator('.quiz-list li', { has: author.locator(`a[href="/quizzes/${id}"]`) });

  // ── 2. Експорт файлу вікторини. ──
  await author.goto(`${base}/quizzes`);
  await row(oldId).waitFor();
  // 77: експорт — пункти меню «⋯» картки.
  const more = () => row(oldId).getByRole('button', { name: /^Ще дії: / }).click();
  await more();
  await row(oldId).getByRole('menuitem', { name: 'Експорт: файл вікторини', ...exact }).waitFor();
  const lastItem = await row(oldId).getByRole('menuitem', { name: 'Видалити', ...exact }).boundingBox();
  const navBox = await author.locator('.menu').boundingBox();
  expect(lastItem && navBox && lastItem.y + lastItem.height <= navBox.y, 'the opened «⋯» menu ends above the bottom nav').toBe(true);
  await expectNoSideScroll(author, 'p42-export-menu');
  const file = await pickedDownload(author, () => row(oldId).getByRole('menuitem', { name: 'Експорт: файл вікторини', ...exact }).click());
  expect(file.name).toBe(`${FILE_BASE}.quiz`);
  expect(file.bytes.subarray(0, 2).toString('latin1'), 'a zip signature').toBe('PK');

  // ── 3. Імпорт цього файлу → нова вікторина, медіа завантажено заново. ──
  await author.getByRole('button', { name: 'Імпорт', ...exact }).click();
  const dialog = author.getByRole('dialog', { name: 'Імпорт вікторини', ...exact });
  await dialog.waitFor();
  expect(await dialog.getByRole('button', { name: 'Вибрати файл', ...exact }).evaluate((el) => el === document.activeElement), 'initial focus').toBe(true);
  await expectNoSideScroll(author, 'p42-import-dialog');
  await dialog.locator('input[type=file]').setInputFiles({ name: file.name, mimeType: 'application/zip', buffer: file.bytes });
  await author.waitForURL(/\/quizzes\/[^/]+$/);
  const newId = author.url().split('/').pop()!;
  expect(newId).not.toBe(oldId);
  const imported = (await (await author.request.get(`${base}/api/quizzes/${newId}`)).json()) as Json;
  const newMedia = mediaUrls(imported);
  expect(newMedia.length).toBe(oldMedia.length);
  for (const [index, url] of newMedia.entries()) {
    expect(url, 'new media address').toMatch(NEW_URL);
    expect(url, 'is a new address').not.toBe(oldMedia[index]);
    const [fresh, old] = await Promise.all([author.request.get(`${base}${url}`), author.request.get(`${base}${oldMedia[index]}`)]);
    expect(fresh.ok() && old.ok(), `fetch ${url}`).toBe(true);
    expect((await fresh.body()).equals(await old.body()), `bytes of ${url}`).toBe(true);
  }
  let restored = JSON.stringify(withoutId(imported));
  for (const [index, url] of newMedia.entries()) restored = restored.split(url).join(oldMedia[index]!);
  expect(JSON.parse(restored)).toEqual(withoutId(oldQuiz));

  await author.goto(`${base}/quizzes`);
  await row(newId).waitFor();
  expect(await author.locator('.quiz-list li h2', { hasText: TITLE }).count(), 'two quizzes with the same title').toBe(2);

  // ── 4. Експорт таблиці старої вікторини: чотири типи, чотири пропущених. ──
  await more();
  const table = await pickedDownload(author, () => row(oldId).getByRole('menuitem', { name: 'Експорт: таблиця (Excel)', ...exact }).click());
  expect(table.name).toBe(`${FILE_BASE}.xlsx`);
  await row(oldId).getByText('Пропущено 4 запитання інших типів чи з медіа (вони є лише у файлі вікторини)', exact).waitFor();
  expect(table.bytes.subarray(0, 2).toString('latin1'), 'an xlsx zip signature').toBe('PK');

  // ── 5. Імпорт таблиці → нова вікторина з назвою з імені файлу. ──
  await author.getByRole('button', { name: 'Імпорт', ...exact }).click();
  await author.getByRole('dialog', { name: 'Імпорт вікторини', ...exact }).locator('input[type=file]').setInputFiles({
    name: table.name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: table.bytes,
  });
  await author.waitForURL((url) => /\/quizzes\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith(`/${newId}`));
  const tableId = author.url().split('/').pop()!;
  const fromTable = (await (await author.request.get(`${base}/api/quizzes/${tableId}`)).json()) as { title: string; rounds: { type: string; title: string; questions: Json[] }[] };
  expect(fromTable.title).toBe(FILE_BASE);
  expect(fromTable.rounds.map((r) => [r.type, r.title, r.questions.length])).toEqual([['classic', 'Річки', 4]]);
  const pick = (q: Json) => ({ type: q.type, text: q.text, points: q.points, timeLimit: q.timeLimit, hint: q.hint });
  const fromTableQuestions = fromTable.rounds[0]!.questions;
  expect(fromTableQuestions.map(pick)).toEqual(
    [classic[0]!, classic[2]!, classic[3]!, classic[4]!].map((q) => ({ type: q.type, text: q.text, points: q.points, timeLimit: q.timeLimit, hint: (q as Json).hint })),
  );
  const first = fromTableQuestions[0] as { options: { id: string; text: string }[]; correctId: string };
  expect(first.options.map((o) => o.text)).toEqual(['Дніпро', 'Дністер', 'Південний Буг', 'Десна']);
  expect(first.options.find((o) => o.id === first.correctId)!.text).toBe('Дніпро');
  expect(fromTableQuestions[1]).toMatchObject({ correct: false });
  expect(fromTableQuestions[2]).toMatchObject({ accepted: ['Говерла', 'гора Говерла'] });
  expect(fromTableQuestions[3]).toMatchObject({ correct: 8, tolerance: 0 });

  // ── 6. Звіт помилок: CSV з BOM і «;» — нічого не створено. ──
  await author.goto(`${base}/quizzes`);
  await row(tableId).waitFor();
  const countBefore = ((await (await author.request.get(`${base}/api/quizzes`)).json()) as unknown[]).length;
  await author.getByRole('button', { name: 'Імпорт', ...exact }).click();
  const importDialog = author.getByRole('dialog', { name: 'Імпорт вікторини', ...exact });
  const csv = '﻿Раунд;Тип;Запитання;Правильна відповідь;Варіант 1;Варіант 2;Бали;Таймер (с)\n' +
    'Природа;текст;Яка річка найдовша в Україні?;;;;1000;30\n' +
    'Природа;варіанти;Яке дерево символ України?;Калина;Калина;;1000;30\n';
  await importDialog.locator('input[type=file]').setInputFiles({ name: 'pomylky.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await importDialog.getByText('У таблиці є помилки — нічого не створено:', exact).waitFor();
  await importDialog.getByText('Рядок 2: немає правильної відповіді', exact).waitFor();
  await importDialog.getByText('Рядок 3: потрібно щонайменше 2 варіанти', exact).waitFor();
  expect(((await (await author.request.get(`${base}/api/quizzes`)).json()) as unknown[]).length, 'quizzes after the report').toBe(countBefore);
  expect(new URL(author.url()).pathname).toBe('/quizzes');
  await expectNoSideScroll(author, 'p42-row-report');

  // ── 7. Шаблон: завантажити й імпортувати. ──
  const template = await pickedDownload(author, () => importDialog.getByRole('button', { name: 'Завантажити шаблон', ...exact }).click());
  expect(template.name).toBe('quiz-template.xlsx');
  await importDialog.locator('input[type=file]').setInputFiles({
    name: template.name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: template.bytes,
  });
  await author.waitForURL((url) => /\/quizzes\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith(`/${tableId}`));
  const templateId = author.url().split('/').pop()!;
  const fromTemplate = (await (await author.request.get(`${base}/api/quizzes/${templateId}`)).json()) as { rounds: { questions: Json[] }[] };
  const sample = fromTemplate.rounds.flatMap((r) => r.questions);
  expect(sample.map((q) => q.type)).toEqual(['single', 'boolean', 'text', 'numeric']);
  expect(sample[1]).toMatchObject({ correct: false });
  for (const q of sample) expect(q.timeLimit as number, 'template timer').toBeGreaterThanOrEqual(25);

  // ── 8. Невідомий файл. ──
  await author.goto(`${base}/quizzes`);
  await author.getByRole('button', { name: 'Імпорт', ...exact }).click();
  const lastDialog = author.getByRole('dialog', { name: 'Імпорт вікторини', ...exact });
  await lastDialog.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('просто текст') });
  await lastDialog.getByRole('alert').filter({ hasText: 'Вибери файл .quiz, .xlsx або .csv.' }).waitFor();
  await shot(author, 'p42-unknown-file');

  // ── 9. Світла тема на кадрах. ──
  expect(await author.evaluate(() => document.documentElement.classList.contains('is-light')), 'light theme class').toBe(true);

  expect(problems).toEqual([]);
}
