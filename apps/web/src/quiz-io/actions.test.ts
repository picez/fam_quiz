// @vitest-environment jsdom
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Quiz } from '@quiz/shared';
import { newQuestion, newQuiz } from '../editor/draft';

vi.mock('../api', () => ({ getQuiz: vi.fn(), createQuiz: vi.fn() }));
vi.mock('./transfer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./transfer')>()),
  fetchMedia: vi.fn(),
  uploadMedia: vi.fn(),
}));
vi.mock('../share-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../share-image')>()),
  downloadFile: vi.fn(),
}));

import { createQuiz, getQuiz } from '../api';
import { downloadFile } from '../share-image';
import { downloadTemplate, exportQuizFile, exportQuizTable, importQuizFile, type IoProgress } from './actions';
import { buildQuizFile, readQuizFile } from './quiz-file';
import { templateRows } from './table';
import { fetchMedia, TransferError, uploadMedia } from './transfer';
import { readXlsx, writeXlsx } from './xlsx';

const IMG = 'aaaaaaaaaaaaaaaa.png';
const SND = 'bbbbbbbbbbbbbbbb.mp3';
const NEW_IMG = '/uploads/cccccccccccccccc.png';
const NEW_SND = '/uploads/dddddddddddddddd.mp3';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function mediaQuiz(): Quiz {
  const quiz = newQuiz();
  const first = newQuestion('single');
  if (first.type !== 'single') throw new Error('single');
  const options = first.options.map((o, i) => ({ ...o, text: 'Варіант ' + (i + 1) }));
  const second = newQuestion('boolean');
  quiz.title = 'Зимова вікторина';
  const round = quiz.rounds[0];
  if (round.type !== 'classic') throw new Error('classic');
  round.questions = [
    { ...first, options, text: 'Питання', imageUrl: `/uploads/${IMG}`, audio: { source: 'file', url: `/uploads/${SND}`, start: 0, duration: 10 } },
    { ...second, text: 'Так чи ні' },
  ];
  return quiz;
}

const mediaMap = () =>
  new Map<string, Uint8Array>([
    [IMG, new Uint8Array([1, 2, 3])],
    [SND, new Uint8Array([4, 5])],
  ]);

const withId = (quiz: Quiz): Quiz => ({ ...quiz, id: 'q1' }) as Quiz;
const blobBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
const lastBlob = (): { blob: Blob; name: string } => {
  const call = vi.mocked(downloadFile).mock.calls.at(-1);
  if (!call) throw new Error('no download');
  return { blob: call[0], name: call[1] };
};
const strings = (rows: (string | number | null)[][]) => rows.map((r) => r.map((c) => (c === null ? '' : String(c))));
const sentQuiz = () => vi.mocked(createQuiz).mock.calls[0]![0];

beforeEach(() => {
  vi.mocked(getQuiz).mockReset();
  vi.mocked(createQuiz).mockReset();
  vi.mocked(fetchMedia).mockReset();
  vi.mocked(uploadMedia).mockReset();
  vi.mocked(downloadFile).mockReset();
});

describe('exports', () => {
  it('exports a quiz file without the id', async () => {
    const source = mediaQuiz();
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: withId(source) });
    vi.mocked(fetchMedia).mockImplementation(async (_urls, onProgress) => {
      onProgress({ stage: 'media', done: 2, total: 2 });
      return mediaMap();
    });
    const progress: IoProgress[] = [];
    const result = await exportQuizFile('q1', (p) => progress.push(p));
    expect(result).toEqual({ ok: true });
    expect(vi.mocked(fetchMedia).mock.calls[0]![0]).toEqual([`/uploads/${IMG}`, `/uploads/${SND}`]);
    const { blob, name } = lastBlob();
    expect(blob.type).toBe('application/zip');
    expect(name).toBe('Зимова-вікторина.quiz');
    const read = readQuizFile(await blobBytes(blob));
    if (!read.ok) throw new Error(read.error);
    expect('id' in read.quiz).toBe(false);
    expect(read.quiz.rounds).toEqual(source.rounds);
    expect(progress.map((p) => p.stage)).toEqual(['preparing', 'media']);
  });

  it('exports a table and counts the skipped', async () => {
    const quiz = mediaQuiz();
    const round = quiz.rounds[0];
    if (round.type !== 'classic') throw new Error('classic');
    const plain = () => ({ ...newQuestion('boolean'), text: 'Просте' });
    const rich = (n: number) => ({ ...newQuestion('boolean'), text: 'Із картинкою ' + n, imageUrl: `/uploads/${IMG}` });
    round.questions = [plain(), plain(), plain(), plain(), rich(1), rich(2)];
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: withId(quiz) });
    expect(await exportQuizTable('q1')).toEqual({ ok: true, skipped: 2 });
    const { blob, name } = lastBlob();
    expect(name).toBe('Зимова-вікторина.xlsx');
    expect(blob.type).toBe(XLSX_TYPE);
    const read = readXlsx(await blobBytes(blob));
    if (!read.ok) throw new Error(read.error);
    expect(read.rows).toHaveLength(5);
  });

  it('export failures come back as codes', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: false, error: 'not_found' });
    expect(await exportQuizFile('q1', () => {})).toEqual({ ok: false, error: 'not_found' });
    expect(await exportQuizTable('q1')).toEqual({ ok: false, error: 'not_found' });
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: withId(mediaQuiz()) });
    vi.mocked(fetchMedia).mockRejectedValue(new TransferError('io_media_fetch'));
    expect(await exportQuizFile('q1', () => {})).toEqual({ ok: false, error: 'io_media_fetch' });
    expect(downloadFile).not.toHaveBeenCalled();
  });
});

describe('imports', () => {
  it('imports a quiz file with new media addresses', async () => {
    const file = new File([buildQuizFile(mediaQuiz(), mediaMap()) as BlobPart], 'a.quiz');
    vi.mocked(uploadMedia).mockImplementation(async (_media, onProgress) => {
      onProgress({ stage: 'media', done: 2, total: 2 });
      return new Map([
        [`/uploads/${IMG}`, NEW_IMG],
        [`/uploads/${SND}`, NEW_SND],
      ]);
    });
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'new1' });
    const progress: IoProgress[] = [];
    expect(await importQuizFile(file, (p) => progress.push(p))).toEqual({ ok: true, id: 'new1' });
    expect([...vi.mocked(uploadMedia).mock.calls[0]![0].keys()]).toEqual([IMG, SND]);
    const sent = JSON.stringify(sentQuiz());
    expect(sent).toContain(NEW_IMG);
    expect(sent).toContain(NEW_SND);
    expect(sent).not.toContain(IMG);
    expect(sent).not.toContain(SND);
    expect(sentQuiz().title).toBe('Зимова вікторина');
    expect(progress.map((p) => p.stage)).toEqual(['checking', 'media', 'creating']);
  });

  it('a newer file creates nothing', async () => {
    const bytes = zipSync({ 'quiz.json': strToU8(JSON.stringify({ format: 'quiz', version: 2, quiz: {} })) });
    expect(await importQuizFile(new File([bytes as BlobPart], 'a.quiz'), () => {})).toEqual({ ok: false, error: 'io_newer' });
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(createQuiz).not.toHaveBeenCalled();
  });

  it('imports an xlsx and a csv table', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'new1' });
    const xlsx = new File([writeXlsx(templateRows()) as BlobPart], 'Мій квіз.xlsx');
    expect(await importQuizFile(xlsx, () => {})).toEqual({ ok: true, id: 'new1' });
    expect(sentQuiz().title).toBe('Мій квіз');
    const round = sentQuiz().rounds[0];
    if (round.type !== 'classic') throw new Error('classic');
    expect(round.questions).toHaveLength(4);

    vi.mocked(createQuiz).mockClear();
    const quote = (c: string) => (/[";\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
    const csvText = strings(templateRows()).map((r) => r.map(quote).join(';')).join('\r\n');
    const csv = new File(['﻿' + csvText], 'Мій квіз.CSV');
    expect(await importQuizFile(csv, () => {})).toEqual({ ok: true, id: 'new1' });
    const round2 = sentQuiz().rounds[0];
    if (round2.type !== 'classic') throw new Error('classic');
    expect(sentQuiz().title).toBe('Мій квіз');
    expect(round2.questions).toHaveLength(4);
  });

  it('row errors create nothing', async () => {
    const rows = strings(templateRows());
    rows[1]![3] = '';
    const file = new File([writeXlsx(rows) as BlobPart], 'a.xlsx');
    expect(await importQuizFile(file, () => {})).toEqual({ ok: false, errors: [{ row: 2, code: 'no_answer' }] });
    expect(createQuiz).not.toHaveBeenCalled();
  });

  it('refuses unknown, too big and non-UTF-8 files', async () => {
    expect(await importQuizFile(new File(['x'], 'notes.txt'), () => {})).toEqual({ ok: false, error: 'io_unknown_file' });
    const big = (name: string, size: number) => {
      const file = new File(['x'], name);
      Object.defineProperty(file, 'size', { value: size });
      return file;
    };
    expect(await importQuizFile(big('a.xlsx', 5 * 1024 * 1024 + 1), () => {})).toEqual({ ok: false, error: 'io_too_big' });
    expect(await importQuizFile(big('a.csv', 2 * 1024 * 1024 + 1), () => {})).toEqual({ ok: false, error: 'io_too_big' });
    const cp1251 = new File([new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2])], 'a.csv');
    expect(await importQuizFile(cp1251, () => {})).toEqual({ ok: false, error: 'io_csv_encoding' });
    expect(createQuiz).not.toHaveBeenCalled();
  });

  it('server refusal is passed on', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: false, error: 'invalid_payload' });
    const xlsx = new File([writeXlsx(templateRows()) as BlobPart], 'a.xlsx');
    expect(await importQuizFile(xlsx, () => {})).toEqual({ ok: false, error: 'invalid_payload' });

    vi.mocked(uploadMedia).mockRejectedValue(new TransferError('unauthorized'));
    const quizFile = new File([buildQuizFile(mediaQuiz(), mediaMap()) as BlobPart], 'a.quiz');
    vi.mocked(createQuiz).mockClear();
    expect(await importQuizFile(quizFile, () => {})).toEqual({ ok: false, error: 'unauthorized' });
    expect(createQuiz).not.toHaveBeenCalled();
  });
});

describe('template', () => {
  it('downloads the template', async () => {
    downloadTemplate();
    const { blob, name } = lastBlob();
    expect(name).toBe('quiz-template.xlsx');
    expect(blob.type).toBe(XLSX_TYPE);
    const read = readXlsx(await blobBytes(blob));
    if (!read.ok) throw new Error(read.error);
    expect(read.rows).toHaveLength(5);
  });
});
