import { answerKey, autopilotCheck, quizSchema, wordleKey, wordleWordIssue, type Question } from '@quiz/shared';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadNouns } from '../src/wordladder/nouns';
import { wordleQuiz } from './wordle-quiz';

const quiz = wordleQuiz();
const questions = quiz.rounds.flatMap((r) => ('questions' in r ? (r.questions as Question[]) : []));
const wordles = questions.flatMap((q) => (q.type === 'wordle' ? [q] : []));

/** Як у think-quiz.test.ts: нічого, пов'язаного з росією. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'менделєєв', 'пажитнов', 'тетріс',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe('the «Вгадай слово» seed', () => {
  it('passes the quiz schema and starts the autopilot', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(autopilotCheck(quiz).blocked).toEqual([]);
  });

  it('one classic round of six wordles, no teams', () => {
    expect(quiz.rounds.map((r) => r.type)).toEqual(['classic']);
    expect(questions).toHaveLength(6);
    expect(wordles).toHaveLength(6);
    expect(quiz.settings.teams).toBeUndefined();
  });

  it('timers are at least 25 seconds', () => {
    for (const q of wordles) expect(q.timeLimit, q.text).toBeGreaterThanOrEqual(25);
  });

  it('points follow difficulty', () => {
    const points = questions.map((q) => q.points);
    expect(Math.min(...points)).toBe(500);
    expect(Math.max(...points)).toBe(1000);
    points.slice(1).forEach((p, i) => expect(p, questions[i + 1]!.text).not.toBe(points[i]));
  });

  it('every word is in the dictionary', () => {
    const nouns = loadNouns();
    for (const q of wordles) {
      expect(nouns.isNoun(wordleKey(q.word)!), q.word).toBe(true);
      expect(wordleWordIssue(q.word), q.word).toBeNull();
    }
  });

  it('no word leaks into the texts', () => {
    const everything = answerKey(JSON.stringify({ title: quiz.title, description: quiz.description, rounds: quiz.rounds.map((r) => ({ title: r.title, description: r.description, texts: ('questions' in r ? r.questions : []).map((q) => q.text) })) }));
    for (const q of wordles) {
      expect(answerKey(q.text).includes(answerKey(q.word)), `${q.text} / ${q.word}`).toBe(false);
      expect(everything.includes(answerKey(q.word)), q.word).toBe(false);
    }
    const texts = questions.map((q) => answerKey(q.text));
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('words differ and lengths vary', () => {
    const keys = wordles.map((q) => wordleKey(q.word));
    expect(new Set(keys).size).toBe(6);
    expect(new Set(wordles.map((q) => [...wordleKey(q.word)!.replace(/'/g, '')].length)).size).toBeGreaterThanOrEqual(3);
  });

  it('repeats no question or answer of the other seeds', () => {
    const files = (folder: string): string[] =>
      readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(folder, entry.name)) : entry.name.endsWith('.ts') && !entry.name.startsWith('wordle-quiz') ? [join(folder, entry.name)] : [],
      );
    const others = files(import.meta.dirname).map((file) => readFileSync(file, 'utf8').toLowerCase());
    expect(others.length).toBeGreaterThan(20);
    const repeatedTexts = questions.filter((q) => others.some((source) => source.includes(q.text.toLowerCase()))).map((q) => q.text);
    expect(repeatedTexts).toEqual([]);
    const repeatedWords = wordles
      .filter((q) => {
        const w = q.word.toLowerCase();
        return others.some((source) => [`'${w}'`, `«${w}»`, `"${w}"`].some((quoted) => source.includes(quoted)));
      })
      .map((q) => q.word);
    expect(repeatedWords).toEqual([]);
  });

  it('nothing about russia', () => {
    const text = JSON.stringify(quiz).toLowerCase();
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
