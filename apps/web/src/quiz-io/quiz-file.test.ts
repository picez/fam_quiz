import { unzipSync, zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Quiz } from '@quiz/shared';
import { newQuestion, newQuiz } from '../editor/draft';
import { buildQuizFile, QUIZ_FILE_LIMITS, QUIZ_FILE_VERSION, readQuizFile } from './quiz-file';

const IMG = 'aaaaaaaaaaaaaaaa.png';
const SND = 'bbbbbbbbbbbbbbbb.mp3';

function classic(quiz: Quiz) {
  const round = quiz.rounds[0];
  if (round.type !== 'classic') throw new Error('classic');
  return round;
}

function makeQuiz(): Quiz {
  const quiz = newQuiz();
  const first = newQuestion('single');
  if (first.type !== 'single') throw new Error('single');
  const options = first.options.map((o, i) => ({ ...o, text: 'Варіант ' + (i + 1) }));
  const second = newQuestion('boolean');
  quiz.title = 'Зимова вікторина';
  classic(quiz).questions = [
    { ...first, options, text: 'Питання', imageUrl: `/uploads/${IMG}`, audio: { source: 'file', url: `/uploads/${SND}`, start: 0, duration: 10 } },
    { ...second, text: 'Так чи ні' },
  ];
  return quiz;
}

const media = () =>
  new Map<string, Uint8Array>([
    [IMG, new Uint8Array([1, 2, 3])],
    [SND, new Uint8Array([4, 5])],
  ]);

function pack(json: unknown, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({ 'quiz.json': strToU8(typeof json === 'string' ? json : JSON.stringify(json)), ...extra });
}

const file = (quiz: unknown, version: unknown = 1, format: unknown = 'quiz') => pack({ format, version, quiz });

describe('quiz file', () => {
  it('round trip keeps the quiz and the referenced media', () => {
    const quiz = makeQuiz();
    const result = readQuizFile(buildQuizFile(quiz, media()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quiz).toEqual(quiz);
    expect([...result.media.keys()]).toEqual([IMG, SND]);
    expect([...result.media.get(IMG)!]).toEqual([1, 2, 3]);
    expect([...result.media.get(SND)!]).toEqual([4, 5]);
  });

  it('quiz.json carries the format and version', () => {
    const quiz = { ...makeQuiz(), id: 'abc' } as Quiz;
    const entries = unzipSync(buildQuizFile(quiz, media()));
    const parsed = JSON.parse(new TextDecoder().decode(entries['quiz.json']));
    expect(parsed.format).toBe('quiz');
    expect(parsed.version).toBe(QUIZ_FILE_VERSION);
    expect('id' in parsed.quiz).toBe(false);
    expect(Object.keys(entries).sort()).toEqual(['quiz.json', `media/${IMG}`, `media/${SND}`].sort());
  });

  it('a newer version is refused', () => {
    expect(readQuizFile(file(makeQuiz(), 2))).toEqual({ ok: false, error: 'io_newer' });
    expect(readQuizFile(file(makeQuiz(), '1'))).toEqual({ ok: false, error: 'io_not_quiz' });
    expect(readQuizFile(file(makeQuiz(), 0))).toEqual({ ok: false, error: 'io_not_quiz' });
    expect(readQuizFile(file(makeQuiz(), 1.5))).toEqual({ ok: false, error: 'io_not_quiz' });
  });

  it('not a quiz file', () => {
    const notQuiz = { ok: false, error: 'io_not_quiz' };
    expect(readQuizFile(new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1]))).toEqual(notQuiz);
    expect(readQuizFile(zipSync({ 'other.txt': strToU8('x') }))).toEqual(notQuiz);
    expect(readQuizFile(pack('not json'))).toEqual(notQuiz);
    expect(readQuizFile(pack('[1]'))).toEqual(notQuiz);
    expect(readQuizFile(file(makeQuiz(), 1, 'other'))).toEqual(notQuiz);
  });

  it('content that fails the schema', () => {
    expect(readQuizFile(file({ ...makeQuiz(), title: '' }))).toEqual({ ok: false, error: 'io_invalid' });
    expect(readQuizFile(file(null))).toEqual({ ok: false, error: 'io_invalid' });
    const { rounds: _rounds, ...rest } = makeQuiz();
    const old = { ...rest, settings: { speedBonus: true, leaderboard: 'end', shuffleOptions: false }, questions: classic(makeQuiz()).questions.map((q) => ({ ...q, imageUrl: null, audio: undefined })) };
    const result = readQuizFile(file(old));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quiz.rounds).toHaveLength(1);
      expect(result.quiz.rounds[0].type).toBe('classic');
    }
  });

  it('missing media', () => {
    const quiz = makeQuiz();
    expect(readQuizFile(file(quiz))).toEqual({ ok: false, error: 'io_media_missing' });
    expect(readQuizFile(file(quiz, 1, 'quiz'))).toEqual({ ok: false, error: 'io_media_missing' });
    const onlyOne = pack({ format: 'quiz', version: 1, quiz }, { [`media/${IMG}`]: new Uint8Array([1]) });
    expect(readQuizFile(onlyOne)).toEqual({ ok: false, error: 'io_media_missing' });
  });

  it('too big', () => {
    const huge = { length: QUIZ_FILE_LIMITS.maxBytes + 1 } as Uint8Array;
    expect(readQuizFile(huge)).toEqual({ ok: false, error: 'io_too_big' });
    const bigJson = pack(`{"format":"quiz","version":1,"quiz":"${'a'.repeat(QUIZ_FILE_LIMITS.maxJsonBytes + 10)}"}`);
    expect(readQuizFile(bigJson)).toEqual({ ok: false, error: 'io_too_big' });
    const bigImage = pack({ format: 'quiz', version: 1, quiz: makeQuiz() }, {
      [`media/${IMG}`]: new Uint8Array(2 * 1024 * 1024 + 1),
      [`media/${SND}`]: new Uint8Array([1]),
    });
    expect(readQuizFile(bigImage)).toEqual({ ok: false, error: 'io_media_too_big' });
  });

  it('an oversized image nobody refers to is ignored', () => {
    const quiz = { ...makeQuiz() };
    classic(quiz).questions = [{ ...classic(quiz).questions[1] }];
    const bytes = pack({ format: 'quiz', version: 1, quiz }, { [`media/${IMG}`]: new Uint8Array(2 * 1024 * 1024 + 1) });
    const result = readQuizFile(bytes);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.media.size).toBe(0);
  });

  it('stray entries are ignored', () => {
    const bytes = pack(
      { format: 'quiz', version: 1, quiz: makeQuiz() },
      {
        [`media/${IMG}`]: new Uint8Array([1]),
        [`media/${SND}`]: new Uint8Array([2]),
        '../evil.png': new Uint8Array([3]),
        'media/../x.png': new Uint8Array([3]),
        'media/ABC.png': new Uint8Array([3]),
        'media/cccccccccccccccc.png': new Uint8Array([3]),
        'other.txt': new Uint8Array([3]),
      },
    );
    const result = readQuizFile(bytes);
    expect(result.ok).toBe(true);
    if (result.ok) expect([...result.media.keys()].sort()).toEqual([IMG, SND].sort());
  });

  it('only the first entries are looked at', () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < QUIZ_FILE_LIMITS.maxEntries + 5; i += 1) entries[`junk/${i}.txt`] = new Uint8Array([1]);
    entries['quiz.json'] = strToU8(JSON.stringify({ format: 'quiz', version: 1, quiz: makeQuiz() }));
    expect(readQuizFile(zipSync(entries))).toEqual({ ok: false, error: 'io_not_quiz' });
  });

  it('refuses a total unpacked size over the limit', () => {
    const zeros = new Uint8Array(5 * 1024 * 1024);
    const entries: Record<string, [Uint8Array, { level: 6 }]> = {};
    const count = Math.ceil(QUIZ_FILE_LIMITS.maxBytes / zeros.length) + 1;
    for (let i = 0; i < count; i += 1) entries[`media/${String(i).padStart(16, 'a')}.mp3`] = [zeros, { level: 6 }];
    const bytes = zipSync({ 'quiz.json': strToU8(JSON.stringify({ format: 'quiz', version: 1, quiz: makeQuiz() })), ...entries });
    expect(bytes.length).toBeLessThan(QUIZ_FILE_LIMITS.maxBytes);
    expect(readQuizFile(bytes)).toEqual({ ok: false, error: 'io_too_big' });
  });

  it('refuses a stored entry whose sizes disagree', () => {
    const json = strToU8(JSON.stringify({ format: 'quiz', version: 1, quiz: makeQuiz() }));
    const bytes = zipSync({ 'quiz.json': [json, { level: 0 }] });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i + 28 < bytes.length; i += 1) {
      // Central directory header: declare an uncompressed size below the stored size.
      if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, view.getUint32(i + 20, true) - 1, true);
    }
    expect(readQuizFile(bytes)).toEqual({ ok: false, error: 'io_not_quiz' });
  });
});
