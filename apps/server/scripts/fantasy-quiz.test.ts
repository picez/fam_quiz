import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  answerKey,
  crosswordIssue,
  ladderPathIssue,
  questionPrice,
  questionsOf,
  quizSchema,
  roundTrials,
  sudokuIssue,
  wordleKey,
  wordleLeak,
  wordleWordIssue,
  type Question,
  type Quiz,
} from '@quiz/shared';
import { loadNouns } from '../src/wordladder/nouns';
import { FANTASY_PHOTOS, fantasyQuiz } from './fantasy-quiz';
import { MIN_TIMER } from './mix-quiz';

/** Заглушка завантаження: кожен ключ — своя адреса /uploads/…, як після uploadImages. */
const url = (key: string) => `/uploads/fy${key.toLowerCase().replace(/[^a-z0-9]/g, '')}0000000000000000.jpg`;
const used = new Set<string>();
const quiz = fantasyQuiz((key) => {
  if (!(key in FANTASY_PHOTOS)) throw new Error(`unknown photo ${key}`);
  used.add(key);
  return url(key);
});
/** Ключ тексту: малими, апострофи ’ ʼ ‘ ` — як «'», пробіли стиснуто. */
const key = (text: string) => text.trim().toLocaleLowerCase('uk').replace(/[’ʼ‘`]/g, "'").replace(/\s+/g, ' ');
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
const everything = played(quiz);
const withSpares = [...everything, ...(quiz.spares ?? [])];
const ofType = <T extends Question['type']>(type: T) => everything.filter((q): q is Extract<Question, { type: T }> => q.type === type);

/** Як у big1–big3: нічого, пов'язаного з росією. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград', 'ельбрус',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris',
];

const dir = import.meta.dirname;
/** Тексти інших сідів: усі .ts у scripts і підтеках, крім цього сіда й тестів. */
const otherSources = (): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.startsWith('fantasy') && !f.includes('.test.') && f !== 'question-db.ts' && f !== 'seed-demo.ts')
    .map((f) => readFileSync(join(dir, f), 'utf8'));

/**
 * Трейлери, перевірені 2026-11-22: oEmbed 200, playableInEmbed true; старт — за розкадровкою YouTube (кадр раз на 2 с):
 * після рейтингових заставок і логотипів студій, до старт + 16 с назви фільму в кадрі немає.
 */
const CLIPS: Record<string, number> = {
  '80kuiBq95So': 18, // «Келих вогню» — канал Harry Potter (офіційний)
  V75dMMIW2B4: 18, // «Хранителі Персня» — Movieclips
  LLAaW1EgyY8: 18, // «Орден Фенікса» — канал Harry Potter
  hYcw5ksV8YQ: 12, // «Дві вежі» — Rotten Tomatoes Classic Trailers
  tAiy66Xrsz4: 8, // «Напівкровний Принц» — канал Harry Potter
  Os1G8RtqY2c: 22, // «Пустка Смоґа» — Warner Bros.
};

/** Пісні — офіційні завантаження (YouTube Music «… - Topic», WaterTower Music); старт 0 — перша нота пісні (lrclib: перший рядок за 0–23 с). */
const MELODIES: Record<string, number> = {
  ukVkkP4r1XA: 0, // Ed Sheeran «I See Fire» — Ed Sheeran - Topic
  s4LX9NX7hS4: 0, // «Misty Mountains» — WaterTower Music
};
const AUDIO: Record<string, number> = {
  mvwysPNdthM: 0, // Enya «May It Be» — Enya - Topic
  'HvF31-2bVNE': 0, // Annie Lennox «Into the West» — Annie Lennox - Topic
  uj1K6OAJ8WE: 0, // Billy Boyd «The Last Goodbye» — WaterTower Music
  X7YLpHFFW64: 0, // John Williams «Double Trouble» — John Williams - Topic
};

describe('the «Гоґвортс і Середзем’я» fantasy quiz', () => {
  it('passes the quiz schema, fills the round cap and is huge', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBe(LIMITS.maxRounds);
    expect(everything.length).toBeGreaterThanOrEqual(110);
    expect(everything.length).toBeLessThanOrEqual(LIMITS.maxQuizQuestions);
    expect(new Set(quiz.rounds.map((r) => r.type)).size).toBeGreaterThanOrEqual(9);
  });

  it('uses many question types and no player polls, word clouds, surveys or opinion games', () => {
    const types = new Set<string>(everything.map((q) => q.type));
    expect(types.size).toBeGreaterThanOrEqual(25);
    for (const t of ['poll', 'wordcloud', 'survey', 'thinkalike', 'think', 'spy']) expect(types, t).not.toContain(t);
    expect(quiz.rounds.map((r) => r.type)).not.toContain('truth');
  });

  it('gives every question and choice phase at least 25 seconds', () => {
    expect(withSpares.filter((q) => q.timeLimit < MIN_TIMER).map((q) => q.id)).toEqual([]);
    for (const q of ofType('bluff')) expect(q.choiceTime, q.text).toBeGreaterThanOrEqual(MIN_TIMER);
  });

  it('prices the board 100…500 by difficulty and puts ×2/×3 and blitz cells on no fixed price', () => {
    const board = quiz.rounds.find((r) => r.type === 'board');
    if (board?.type !== 'board') throw new Error('no board');
    const marked = new Set<number>();
    for (const c of board.categories) {
      const prices = c.cells.map((cell) => questionPrice(cell.question));
      expect(prices.filter((p, i) => i > 0 && p < prices[i - 1]!), c.title).toEqual([]);
      const plain = c.cells.filter((cell) => !['timedlist', 'moreless', 'wall', 'clues'].includes(cell.question.type)).map((cell) => cell.question.points);
      for (const p of plain) expect([100, 200, 300, 400, 500]).toContain(p);
      c.cells.forEach((cell, i) => cell.mark !== 'none' && marked.add(i));
    }
    // Множники падають на різні позиції, а не щоразу на ту саму ціну.
    expect(marked.size).toBeGreaterThan(1);
  });

  it('raises the prices in «Ва-банк» and the auction', () => {
    for (const type of ['wipeout', 'auction'] as const) {
      const round = quiz.rounds.find((r) => r.type === type);
      const points = round && 'questions' in round ? round.questions.map((q) => q.points) : [];
      expect(points.filter((p, i) => i > 0 && p < points[i - 1]!), type).toEqual([]);
    }
  });

  it('plays every trailer from a verified clip at its verified start, muted, and every song from its first note', () => {
    expect(Object.fromEntries(ofType('videoclip').map((q) => [q.clip.id, q.clip.start]))).toEqual(CLIPS);
    expect(ofType('videoclip').every((q) => q.muted)).toBe(true);
    expect(Object.fromEntries(ofType('melody').map((q) => [q.track.source === 'youtube' ? q.track.id : '', q.track.start]))).toEqual(MELODIES);
    const audio = everything.filter((q) => q.audio !== undefined);
    expect(Object.fromEntries(audio.map((q) => [q.audio!.source === 'youtube' ? q.audio!.id : '', q.audio!.start]))).toEqual(AUDIO);
    expect(everything.filter((q) => q.video !== null)).toEqual([]);
    // Жоден ролик не повторює ролики інших сідів.
    const others = otherSources().join('\n');
    expect([...Object.keys(CLIPS), ...Object.keys(MELODIES), ...Object.keys(AUDIO)].filter((id) => others.includes(id))).toEqual([]);
  });

  it('uses every picture, each one a Wikimedia Commons file new to the seeds', () => {
    expect(Object.keys(FANTASY_PHOTOS).filter((k) => !used.has(k))).toEqual([]);
    for (const file of Object.values(FANTASY_PHOTOS)) expect(file).toMatch(/^File:.+\.(jpe?g|png)$/i);
    const pictures = withSpares.flatMap((q) => [
      q.imageUrl,
      ...(q.type === 'single' || q.type === 'multi' ? q.options.map((o) => o.imageUrl) : []),
      q.type === 'jigsaw' ? q.photo : null,
    ]);
    const shown = pictures.filter((p): p is string => typeof p === 'string');
    expect(new Set(shown)).toEqual(new Set(Object.keys(FANTASY_PHOTOS).map(url)));
    const others = otherSources().join('\n');
    expect(Object.values(FANTASY_PHOTOS).filter((f) => others.includes(f) || others.includes(f.replace(/ /g, '_')))).toEqual([]);
  });

  it('builds a valid sudoku, a key crossword of words new to the seeds, a word ladder and a wordle word from the dictionary', () => {
    for (const q of ofType('sudoku')) expect(sudokuIssue(q.givens, q.solution)).toBeNull();
    const nouns = loadNouns();
    const crosswords = ofType('crossword');
    expect(crosswords.length).toBeGreaterThan(0);
    for (const q of crosswords) {
      expect(crosswordIssue(q)).toBeNull();
      for (const e of q.entries) expect(key(e.clue)).not.toContain(key(e.answer));
    }
    const others = key(otherSources().join('\n'));
    const words = crosswords.flatMap((q) => q.entries.map((e) => e.answer));
    expect(words.filter((w) => others.includes(key(w)))).toEqual([]);
    for (const q of ofType('wordladder')) {
      expect(ladderPathIssue(q.path, q.maxSteps)).toBeNull();
      for (const w of q.path) expect(nouns.isNoun(w), w).toBe(true);
    }
    const texts = key(JSON.stringify(everything.map((q) => [q.text, q.type === 'single' || q.type === 'multi' ? q.options : []])));
    for (const q of ofType('wordle')) {
      expect(nouns.isNoun(wordleKey(q.word)!), q.word).toBe(true);
      expect(wordleWordIssue(q.word), q.word).toBeNull();
      expect(wordleLeak(q.word, q.text), q.word).toBe(false);
      expect(texts.includes(key(q.word)), q.word).toBe(false);
      expect([q.text, q.hint]).toEqual(['', undefined]);
    }
  });

  it('has a fair mix of true and false in yes/no questions', () => {
    const bools = withSpares.filter((q): q is Extract<Question, { type: 'boolean' }> => q.type === 'boolean');
    expect(bools.length).toBeGreaterThanOrEqual(12);
    const trueCount = bools.filter((q) => q.correct).length;
    expect(trueCount).toBeGreaterThanOrEqual(Math.ceil(bools.length * 0.4));
    expect(trueCount).toBeLessThanOrEqual(Math.floor(bools.length * 0.6));
  });

  it('leaks no answer into its question, hint or options of the same question', () => {
    const norm = (s: string) => key(s).replace(/[«»"'.,!?:;()—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    const leaks: string[] = [];
    for (const q of withSpares) {
      const where = ` ${norm(`${q.text} ${q.hint ?? ''}`)} `;
      const answers =
        q.type === 'single'
          ? [q.options.find((o) => o.id === q.correctId)?.text ?? '']
          : q.type === 'text' || q.type === 'videoclip' || q.type === 'bluff' || q.type === 'melody' || q.type === 'clues' || q.type === 'drawing'
            ? q.accepted
            : [];
      for (const a of answers) if (norm(a).length >= 3 && !/^\d+$/.test(norm(a)) && where.includes(` ${norm(a)} `)) leaks.push(`${q.id}: ${a}`);
    }
    expect(leaks).toEqual([]);
    // Код квесту не звучить у жодному тексті раунду.
    const quest = quiz.rounds.find((r) => r.type === 'quest');
    if (quest?.type !== 'quest') throw new Error('no quest');
    expect(answerKey(JSON.stringify([quest.prompt, quest.questions])).includes(answerKey(quest.code))).toBe(false);
    // Код квесту не підказують і раніші раунди.
    const before = quiz.rounds.slice(0, quiz.rounds.indexOf(quest)).flatMap((r) => questionsOf({ ...quiz, rounds: [r] }));
    expect(answerKey(JSON.stringify(before)).includes(answerKey(quest.code))).toBe(false);
  });

  it('has no duplicate question texts, here or in other seed quizzes', () => {
    const texts = withSpares.filter((q) => q.type !== 'wordle').map((q) => key(q.text));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    const others = key(otherSources().join('\n'));
    expect(texts.filter((text) => others.includes(text))).toEqual([]);
  });

  it('keeps the quiz description short and every round described', () => {
    expect(quiz.description.length).toBeLessThanOrEqual(200);
    for (const r of quiz.rounds) expect((r.description ?? '').length, r.title).toBeGreaterThan(80);
  });

  it('contains nothing related to russia or the Soviet period', () => {
    const text = JSON.stringify(quiz);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
