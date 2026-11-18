import type { Quiz } from '@quiz/shared';
import { createQuiz, getQuiz } from '../api';
import { detectDelimiter, parseCsv } from '../locales/csv';
import { downloadFile } from '../share-image';
import { mediaUrls, quizFileName, replaceMedia } from './media';
import { buildQuizFile, readQuizFile } from './quiz-file';
import { quizToRows, rowsToQuiz, TABLE_LIMITS, templateRows, type RowError } from './table';
import { fetchMedia, TransferError, uploadMedia, type TransferProgress } from './transfer';
import { readXlsx, writeXlsx } from './xlsx';

export type IoProgress = { stage: 'preparing' | 'checking' | 'creating' } | TransferProgress;
export type IoFailure = { ok: false; error: string } | { ok: false; errors: RowError[] };

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TEMPLATE_WIDTHS = [14, 12, 40, 28, 18, 18, 18, 18, 18, 18, 8, 12, 36];

const failure = (error: unknown): IoFailure => ({ ok: false, error: error instanceof TransferError ? error.code : 'network' });

function withoutId(quiz: Quiz & { id?: string }): Quiz {
  const { id: _id, ...rest } = quiz;
  return rest;
}

export async function exportQuizFile(id: string, onProgress: (p: IoProgress) => void): Promise<{ ok: true } | IoFailure> {
  onProgress({ stage: 'preparing' });
  const loaded = await getQuiz(id);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const quiz = withoutId(loaded.data);
  try {
    const media = await fetchMedia(mediaUrls(quiz), onProgress);
    const blob = new Blob([buildQuizFile(quiz, media) as BlobPart], { type: 'application/zip' });
    downloadFile(blob, quizFileName(quiz.title, 'quiz'));
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function exportQuizTable(id: string): Promise<{ ok: true; skipped: number } | IoFailure> {
  const loaded = await getQuiz(id);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { rows, skipped } = quizToRows(loaded.data);
  const blob = new Blob([writeXlsx(rows, { boldFirstRow: true, widths: TEMPLATE_WIDTHS }) as BlobPart], { type: XLSX_TYPE });
  downloadFile(blob, quizFileName(loaded.data.title, 'xlsx'));
  return { ok: true, skipped };
}

export function downloadTemplate(): void {
  const blob = new Blob([writeXlsx(templateRows(), { boldFirstRow: true, widths: TEMPLATE_WIDTHS }) as BlobPart], { type: XLSX_TYPE });
  downloadFile(blob, 'quiz-template.xlsx');
}

const extensionOf = (name: string): string => /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';
const titleOf = (name: string): string => name.replace(/\.[^.]*$/, '').trim();

async function create(quiz: Quiz, onProgress: (p: IoProgress) => void): Promise<{ ok: true; id: string } | IoFailure> {
  onProgress({ stage: 'creating' });
  const created = await createQuiz(quiz);
  return created.ok ? { ok: true, id: created.id } : { ok: false, error: created.error };
}

async function importQuizArchive(file: File, onProgress: (p: IoProgress) => void): Promise<{ ok: true; id: string } | IoFailure> {
  const read = readQuizFile(new Uint8Array(await file.arrayBuffer()));
  if (!read.ok) return { ok: false, error: read.error };
  try {
    const map = read.media.size > 0 ? await uploadMedia(read.media, onProgress) : new Map<string, string>();
    return await create(replaceMedia(read.quiz, map), onProgress);
  } catch (error) {
    return failure(error);
  }
}

async function importTable(file: File, ext: 'xlsx' | 'csv', onProgress: (p: IoProgress) => void): Promise<{ ok: true; id: string } | IoFailure> {
  let rows: string[][];
  if (ext === 'xlsx') {
    if (file.size > TABLE_LIMITS.maxXlsxBytes) return { ok: false, error: 'io_too_big' };
    const read = readXlsx(new Uint8Array(await file.arrayBuffer()));
    if (!read.ok) return { ok: false, error: read.error };
    rows = read.rows;
  } else {
    if (file.size > TABLE_LIMITS.maxCsvBytes) return { ok: false, error: 'io_too_big' };
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      return { ok: false, error: 'io_csv_encoding' };
    }
    rows = parseCsv(text, { delimiter: detectDelimiter(text), keepEmpty: true });
  }
  const built = rowsToQuiz(rows, titleOf(file.name));
  if (!built.ok) return built;
  return create(built.quiz, onProgress);
}

/** За розширенням (.quiz / .xlsx / .csv, без регістру); успіх — id нової вікторини. */
export async function importQuizFile(file: File, onProgress: (p: IoProgress) => void): Promise<{ ok: true; id: string } | IoFailure> {
  const ext = extensionOf(file.name);
  if (ext !== 'quiz' && ext !== 'xlsx' && ext !== 'csv') return { ok: false, error: 'io_unknown_file' };
  onProgress({ stage: 'checking' });
  if (ext === 'quiz') {
    if (file.size > 100 * 1024 * 1024) return { ok: false, error: 'io_too_big' };
    return importQuizArchive(file, onProgress);
  }
  return importTable(file, ext, onProgress);
}
