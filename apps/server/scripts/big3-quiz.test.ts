import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  QUESTION_TYPES,
  ROUND_TYPES,
  answerKey,
  autopilotCheck,
  crosswordIssue,
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
import { big1Quiz } from './big1-quiz';
import { big2Quiz } from './big2-quiz';
import { BIG3_FILES, BIG3_PHOTOS, big3Quiz } from './big3-quiz';
import { SPOT_EDITS, SPOT_H, SPOT_W } from './big3/spot';
import { MIN_TIMER } from './mix-quiz';

/** Заглушка завантаження: кожен ключ — своя адреса /uploads/…, як після uploadImages. */
const url = (key: string) => `/uploads/big3${key.toLowerCase().replace(/[^a-z0-9]/g, '')}0000000000000000.jpg`;
const keys = [...Object.keys(BIG3_PHOTOS), ...BIG3_FILES];
const used = new Set<string>();
const quiz = big3Quiz((key) => {
  if (!keys.includes(key)) throw new Error(`unknown photo ${key}`);
  used.add(key);
  return url(key);
});
/** Ключ тексту: малими, апострофи ’ ʼ ‘ ` — як «'», пробіли стиснуто. */
const key = (text: string) => text.trim().toLocaleLowerCase('uk').replace(/[’ʼ‘`]/g, "'").replace(/\s+/g, ' ');
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
const everything = played(quiz);
const ofType = <T extends Question['type']>(type: T) => everything.filter((q): q is Extract<Question, { type: T }> => q.type === type);

/** Як у big1/big2: нічого, пов'язаного з росією. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград', 'мазеп', 'полтавськ', 'ельбрус',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris',
];

const dir = import.meta.dirname;
/** Тексти інших сідів: усі .ts у scripts і підтеках, крім цього сіда й тестів. */
const otherSources = (): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.startsWith('big3') && !f.includes('.test.'))
    .map((f) => readFileSync(join(dir, f), 'utf8'));

/**
 * Трейлери, перевірені 2026-11-19: oEmbed 200 (офіційні канали студій і Rotten Tomatoes Classic Trailers), старт — за розкадровкою YouTube:
 * після рейтингової заставки й логотипів, до старт + 16 с назви фільму немає.
 */
const CLIPS: Record<string, number> = {
  jEDaVHmw7r4: 8, // «Сам удома» — Rotten Tomatoes Classic Trailers
  CHekzSiZjrY: 6, // «Титанік» — 20th Century Studios
  lFzVJEksoDY: 7, // «Король Лев» — Disney Plus
  vKQi3bBA1y8: 10, // «Матриця» — Rotten Tomatoes Classic Trailers
  eTjHiQKJUDY: 2, // «Аладдін» — Rotten Tomatoes Classic Trailers
  bLvqoHBptjg: 6, // «Форрест Гамп» — Paramount Movies
};

describe('the big «Велика гра ІІІ» quiz', () => {
  it('passes the quiz schema within the limits and is huge', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(everything.length).toBeGreaterThanOrEqual(80);
    expect(everything.length).toBeLessThanOrEqual(110);
  });

  it('runs on the autopilot without a host: nothing blocked, only the manual blitz is checked by key', () => {
    const blitz = quiz.rounds.findIndex((r) => r.type === 'blitz');
    expect(autopilotCheck(quiz)).toEqual({ blocked: [], changed: [{ code: 'manual', rounds: [blitz] }] });
  });

  it('covers what big1 and big2 left: auction, spotdiff, videoclip, one poll, one word cloud and their settings', () => {
    expect(quiz.rounds.map((r) => r.type)).toContain('auction');
    const types = new Set<string>(everything.map((q) => q.type));
    for (const t of ['spotdiff', 'videoclip', 'poll', 'wordcloud', 'survey']) expect(types, t).toContain(t);
    expect(ofType('poll')).toHaveLength(1);
    expect(ofType('wordcloud')).toHaveLength(1);
    const [cloud] = ofType('wordcloud');
    expect(ofType('survey').map((q) => q.cloudId)).toEqual([cloud!.id]);
    const survival = quiz.rounds.find((r) => r.type === 'survival');
    expect(survival?.type === 'survival' ? [survival.trial, survival.trials.length] : null).toEqual(['luck', 0]);
    const quest = quiz.rounds.find((r) => r.type === 'quest');
    expect(quest?.type === 'quest' ? quest.bonus : null).toEqual({ kind: 'buff', buff: 'double', first: 3 });
    expect(quiz.settings.teams?.count).toBe(2);
    expect(types).not.toContain('spy');
    const blitz = quiz.rounds.find((r) => r.type === 'blitz');
    expect(blitz?.type === 'blitz' ? blitz.check : null).toBe('manual');
    expect(keys.filter((k) => !used.has(k))).toEqual([]);
  });

  it('together with big1 and big2 covers every round type and every question type', () => {
    const all = [big1Quiz(), big2Quiz((k) => `/uploads/big2${k.replace(/[^a-z0-9]/gi, '')}0000000000000000.jpg`), quiz];
    expect(ROUND_TYPES.filter((t) => !all.some((q) => q.rounds.some((r) => r.type === t)))).toEqual([]);
    expect(QUESTION_TYPES.filter((t) => !all.some((q) => played(q).some((x) => x.type === t)))).toEqual([]);
  });

  it('gives every question and choice phase at least 25 seconds', () => {
    expect(everything.filter((q) => q.timeLimit < MIN_TIMER).map((q) => q.id)).toEqual([]);
    for (const q of ofType('bluff')) expect(q.choiceTime, q.text).toBeGreaterThanOrEqual(MIN_TIMER);
  });

  it('plays every trailer from a verified clip at its verified start, muted, and no other media', () => {
    expect(Object.fromEntries(ofType('videoclip').map((q) => [q.clip.id, q.clip.start]))).toEqual(CLIPS);
    expect(ofType('videoclip').every((q) => q.muted)).toBe(true);
    expect(everything.filter((q) => q.audio !== undefined || q.video !== null)).toEqual([]);
    // Жоден трейлер не повторює ролики інших сідів.
    const others = otherSources().join('\n');
    expect(Object.keys(CLIPS).filter((id) => others.includes(id))).toEqual([]);
  });

  it('builds the spot-the-difference from two uploaded pictures with a circle on every edit', () => {
    const [spot] = ofType('spotdiff');
    expect(spot!.original).toMatch(/^\/uploads\//);
    expect(spot!.changed).toMatch(/^\/uploads\//);
    expect(spot!.original).not.toBe(spot!.changed);
    expect(spot!.spots).toHaveLength(SPOT_EDITS.length);
    for (const [i, e] of SPOT_EDITS.entries()) {
      const s = spot!.spots[i]!;
      expect(Math.abs(s.x * SPOT_W - e.x)).toBeLessThan(2);
      expect(Math.abs(s.y * SPOT_H - e.y)).toBeLessThan(2);
      expect(s.r * SPOT_W).toBeGreaterThanOrEqual(Math.max(e.rx, e.ry));
    }
    // Змінена копія лежить у git і вміщується в ліміт завантаження (2 МБ).
    expect(statSync(join(dir, 'big3', 'img', 'spot-b.png')).size).toBeLessThan(2 * 1024 * 1024);
  });

  it('builds a valid sudoku, a key crossword of words new to the seeds and a wordle word from the dictionary', () => {
    for (const q of ofType('sudoku')) expect(sudokuIssue(q.givens, q.solution)).toBeNull();
    const crosswords = ofType('crossword');
    for (const q of crosswords) {
      expect(crosswordIssue(q)).toBeNull();
      for (const e of q.entries) expect(key(e.clue)).not.toContain(key(e.answer));
    }
    const others = otherSources().join('\n').toLocaleLowerCase('uk');
    const words = crosswords.flatMap((q) => q.entries.map((e) => e.answer));
    expect(words.filter((w) => others.includes(key(w)))).toEqual([]);
    const nouns = loadNouns();
    const texts = key(JSON.stringify(everything.map((q) => [q.text, q.type === 'single' || q.type === 'multi' ? q.options : []])));
    for (const q of ofType('wordle')) {
      expect(nouns.isNoun(wordleKey(q.word)!), q.word).toBe(true);
      expect(wordleWordIssue(q.word), q.word).toBeNull();
      expect(wordleLeak(q.word, q.text), q.word).toBe(false);
      expect(texts.includes(key(q.word)), q.word).toBe(false);
    }
  });

  it('has a fair mix of true and false in yes/no questions', () => {
    const bools = ofType('boolean');
    expect(bools.length).toBeGreaterThanOrEqual(8);
    const trueCount = bools.filter((q) => q.correct).length;
    expect(trueCount).toBeGreaterThanOrEqual(Math.ceil(bools.length * 0.35));
    expect(trueCount).toBeLessThanOrEqual(Math.floor(bools.length * 0.65));
  });

  it('leaks no answer into its question', () => {
    const norm = (s: string) => key(s).replace(/[«»"'.,!?]/g, '');
    const leaks: string[] = [];
    // Справи «хто бреше»: підозрюваних неминуче названо в умові.
    const named = ['Справа «Різдвяний ранок»', 'Логіка: Оля, Петро й Ліна'];
    for (const q of everything) {
      if (named.some((p) => q.text.startsWith(p))) continue;
      const where = norm(`${q.text} ${q.hint ?? ''}`);
      const answers =
        q.type === 'single'
          ? [q.options.find((o) => o.id === q.correctId)?.text ?? '']
          : q.type === 'text' || q.type === 'videoclip' || q.type === 'bluff'
            ? q.accepted
            : [];
      for (const a of answers) if (norm(a).length >= 3 && !/^\d+$/.test(norm(a)) && where.includes(norm(a))) leaks.push(`${q.id}: ${a}`);
    }
    expect(leaks).toEqual([]);
    // Код квесту не звучить у жодному тексті раунду.
    const quest = quiz.rounds.find((r) => r.type === 'quest');
    const questText = answerKey(JSON.stringify(quest?.type === 'quest' ? [quest.prompt, quest.questions] : []));
    expect(questText.includes(answerKey(quest?.type === 'quest' ? quest.code : 'x'))).toBe(false);
  });

  it('has no duplicate question texts, here or in other seed quizzes', () => {
    const texts = everything.map((q) => key(q.text));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    const others = key(otherSources().join('\n'));
    expect(texts.filter((text) => others.includes(text))).toEqual([]);
  });

  it('contains nothing related to russia or the Soviet period', () => {
    const text = JSON.stringify(quiz);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
