import { answerKey, autopilotCheck, quizSchema, type Question } from '@quiz/shared';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { spyQuiz } from './spy-quiz';

const quiz = spyQuiz();
const questions = quiz.rounds.flatMap((r) => ('questions' in r ? (r.questions as Question[]) : []));
const spies = questions.flatMap((q) => (q.type === 'spy' ? [q] : []));

/** Як у think-quiz.test.ts: нічого, пов'язаного з росією. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'менделєєв', 'пажитнов', 'тетріс',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe('the «Шпигун» seed', () => {
  it('passes the quiz schema and starts the autopilot', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(autopilotCheck(quiz).blocked).toEqual([]);
  });

  it('is one classic round of six spies, no teams', () => {
    expect(quiz.rounds.map((r) => r.type)).toEqual(['classic']);
    expect(questions).toHaveLength(6);
    expect(spies).toHaveLength(6);
    expect(quiz.settings.teams).toBeUndefined();
  });

  it('timers are at least 25 seconds', () => {
    for (const q of spies) {
      expect(q.timeLimit, q.text).toBeGreaterThanOrEqual(25);
      expect(q.voteTime, q.text).toBeGreaterThanOrEqual(25);
    }
  });

  it('points follow difficulty', () => {
    const points = questions.map((q) => q.points);
    expect(Math.min(...points)).toBe(500);
    expect(Math.max(...points)).toBe(1000);
    points.slice(1).forEach((p, i) => expect(p, questions[i + 1]!.text).not.toBe(points[i]));
  });

  it('no word leaks into the text', () => {
    const everything = answerKey(JSON.stringify({ title: quiz.title, description: quiz.description, rounds: quiz.rounds.map((r) => ({ title: r.title, description: r.description, texts: ('questions' in r ? r.questions : []).map((q) => q.text) })) }));
    for (const q of spies) {
      for (const word of [q.accepted[0]!, q.spyWord]) {
        expect(answerKey(q.text).includes(answerKey(word)), `${q.text} / ${word}`).toBe(false);
        // Слова пар не звучать ні в яких текстах вікторини (назва, опис раунду, запитання).
        expect(everything.includes(answerKey(word)), word).toBe(false);
      }
    }
    const texts = questions.map((q) => answerKey(q.text));
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('pairs are different words', () => {
    const keys = spies.flatMap((q) => [answerKey(q.accepted[0]!), answerKey(q.spyWord)]);
    expect(keys).toHaveLength(12);
    expect(new Set(keys).size).toBe(12);
    for (const q of spies) expect(q.accepted.map(answerKey), q.text).not.toContain(answerKey(q.spyWord));
  });

  it('repeats no question or pair of the other seeds', () => {
    const files = (folder: string): string[] =>
      readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(folder, entry.name)) : entry.name.endsWith('.ts') && !entry.name.startsWith('spy-quiz') ? [join(folder, entry.name)] : [],
      );
    const others = files(import.meta.dirname).map((file) => readFileSync(file, 'utf8').toLowerCase());
    expect(others.length).toBeGreaterThan(20);
    const repeatedTexts = questions.filter((q) => others.some((source) => source.includes(q.text.toLowerCase()))).map((q) => q.text);
    expect(repeatedTexts).toEqual([]);
    // Пара — обидва слова (перші 5 літер) разом в одному рядку іншого сіда.
    const stem = (word: string): string => word.toLowerCase().slice(0, 5);
    const repeatedPairs = spies
      .filter((q) => others.some((source) => source.split(/\r?\n/).some((line) => line.includes(stem(q.accepted[0]!)) && line.includes(stem(q.spyWord)))))
      .map((q) => `${q.accepted[0]} / ${q.spyWord}`);
    expect(repeatedPairs).toEqual([]);
  });

  it('nothing about russia', () => {
    const text = JSON.stringify(quiz).toLowerCase();
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
