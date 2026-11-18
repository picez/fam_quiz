import { unzipSync, zipSync, type Unzipped, type ZipOptions } from 'fflate';
import { AUDIO_LIMITS, IMAGE_LIMITS, quizSchema, upgradeQuiz, type Quiz } from '@quiz/shared';
import { MEDIA_NAME, MEDIA_URL, mediaKind, mediaUrls } from './media';

export const QUIZ_FILE_VERSION = 1;
export const QUIZ_FILE_LIMITS = { maxBytes: 100 * 1024 * 1024, maxJsonBytes: 1024 * 1024, maxEntries: 2000 } as const;

export type IoError = 'io_not_quiz' | 'io_newer' | 'io_invalid' | 'io_too_big' | 'io_media_missing' | 'io_media_too_big';

type Level = NonNullable<ZipOptions['level']>;

/** zip: quiz.json (формат, версія, вікторина без id) і media/<ім'я> для кожної різної адреси. */
export function buildQuizFile(quiz: Quiz, media: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const { id: _id, ...rest } = quiz as Quiz & { id?: string };
  const json = JSON.stringify({ format: 'quiz', version: QUIZ_FILE_VERSION, quiz: rest }, null, 2);
  const files: Record<string, [Uint8Array, { level: Level }]> = {
    'quiz.json': [new TextEncoder().encode(json), { level: 6 }],
  };
  for (const [name, bytes] of media) files[`media/${name}`] = [bytes, { level: 0 }];
  return zipSync(files);
}

export type QuizFileResult =
  | { ok: true; quiz: Quiz; media: Map<string, Uint8Array> }
  | { ok: false; error: IoError };

function mediaLimit(name: string): number {
  return mediaKind(name) === 'audio' ? AUDIO_LIMITS.maxBytes : IMAGE_LIMITS.maxBytes;
}

export function readQuizFile(bytes: Uint8Array): QuizFileResult {
  if (bytes.length > QUIZ_FILE_LIMITS.maxBytes) return { ok: false, error: 'io_too_big' };
  let jsonTooBig = false;
  const tooBig = new Set<string>();
  const declared = new Map<string, number>();
  let seen = 0;
  let files: Unzipped;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        seen += 1;
        if (seen > QUIZ_FILE_LIMITS.maxEntries) return false;
        if (file.name === 'quiz.json') {
          if (file.originalSize > QUIZ_FILE_LIMITS.maxJsonBytes) {
            jsonTooBig = true;
            return false;
          }
          declared.set(file.name, file.originalSize);
          return true;
        }
        if (!file.name.startsWith('media/')) return false;
        const name = file.name.slice('media/'.length);
        if (!MEDIA_NAME.test(name)) return false;
        if (file.originalSize > mediaLimit(name)) {
          tooBig.add(name);
          return false;
        }
        declared.set(file.name, file.originalSize);
        return true;
      },
    });
  } catch {
    return { ok: false, error: 'io_not_quiz' };
  }
  if (jsonTooBig) return { ok: false, error: 'io_too_big' };
  for (const [name, size] of declared) {
    if (files[name]?.length !== size) return { ok: false, error: 'io_not_quiz' };
  }
  const jsonBytes = files['quiz.json'];
  if (!jsonBytes) return { ok: false, error: 'io_not_quiz' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes));
  } catch {
    return { ok: false, error: 'io_not_quiz' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'io_not_quiz' };
  const head = parsed as { format?: unknown; version?: unknown; quiz?: unknown };
  if (head.format !== 'quiz') return { ok: false, error: 'io_not_quiz' };
  if (typeof head.version !== 'number' || !Number.isInteger(head.version) || head.version < 1) return { ok: false, error: 'io_not_quiz' };
  if (head.version > QUIZ_FILE_VERSION) return { ok: false, error: 'io_newer' };

  const result = quizSchema.safeParse(upgradeQuiz(head.quiz));
  if (!result.success) return { ok: false, error: 'io_invalid' };
  const quiz = result.data;

  const media = new Map<string, Uint8Array>();
  for (const url of mediaUrls(quiz)) {
    const name = MEDIA_URL.exec(url)?.[1] ?? '';
    if (tooBig.has(name)) return { ok: false, error: 'io_media_too_big' };
    const data = files[`media/${name}`];
    if (!data) return { ok: false, error: 'io_media_missing' };
    media.set(name, data);
  }
  return { ok: true, quiz, media };
}
