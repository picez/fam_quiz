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

/** Нижній регістр і один апостроф: ’ ʼ ‘ ` → '. */
const norm = (s: string) => s.toLowerCase().replace(/[’ʼ‘`]/g, "'");
/** Рядок-коментар (// … чи рядок блоку /* … *\/) — не вміст сіду. */
const COMMENT = /^\s*(\/\/|\/\*|\*)/;
/** Рядкові літерали ('…', "…", `…`) з сирого тексту, уже нормалізовані (апостроф ’ усередині '…' не рве літерал). */
const literals = (source: string) =>
  [...source.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((match) => norm(match[1] ?? match[2] ?? match[3] ?? ''));

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

  it('no wordle has a text or a hint: in the game there is only the grid (61)', () => {
    for (const q of wordles) {
      expect(q.text, q.word).toBe('');
      expect(q.hint, q.word).toBeUndefined();
    }
    // Опис раунду не обіцяє підказок, яких немає.
    expect(JSON.stringify(quiz).toLowerCase()).not.toContain('підказк');
  });

  it('timers are at least 25 seconds', () => {
    for (const q of wordles) expect(q.timeLimit, q.word).toBeGreaterThanOrEqual(25);
  });

  it('points follow difficulty', () => {
    const points = questions.map((q) => q.points);
    expect(Math.min(...points)).toBe(500);
    expect(Math.max(...points)).toBe(1000);
    points.slice(1).forEach((p, i) => expect(p, wordles[i + 1]!.word).not.toBe(points[i]));
  });

  it('every word is in the dictionary', () => {
    const nouns = loadNouns();
    for (const q of wordles) {
      expect(nouns.isNoun(wordleKey(q.word)!), q.word).toBe(true);
      expect(wordleWordIssue(q.word), q.word).toBeNull();
    }
  });

  it('no word leaks into the title or descriptions', () => {
    const everything = answerKey(JSON.stringify({ title: quiz.title, description: quiz.description, rounds: quiz.rounds.map((r) => ({ title: r.title, description: r.description })) }));
    for (const q of wordles) expect(everything.includes(answerKey(q.word)), q.word).toBe(false);
  });

  it('words differ and lengths vary', () => {
    const keys = wordles.map((q) => wordleKey(q.word));
    expect(new Set(keys).size).toBe(6);
    expect(new Set(wordles.map((q) => [...wordleKey(q.word)!.replace(/'/g, '')].length)).size).toBeGreaterThanOrEqual(3);
  });

  it('repeats no question or answer of the other seeds', () => {
    const files = (folder: string): string[] =>
      readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? files(join(folder, entry.name))
          : entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.startsWith('wordle-quiz')
            ? [join(folder, entry.name)]
            : [],
      );
    const raw = files(import.meta.dirname).map((file) => readFileSync(file, 'utf8').split('\n').filter((line) => !COMMENT.test(line)).join('\n'));
    expect(raw.length).toBeGreaterThan(20);
    const others = raw.map(norm);
    // Короткі рядки (до трьох слів, без «?») — відповіді й варіанти; слово в них цілим — повтор.
    const answers = raw.flatMap((source) => literals(source).filter((text) => !text.includes('?') && text.trim().split(/\s+/).length <= 3));
    const repeatedWords = wordles
      .filter((q) => {
        const w = norm(q.word);
        const whole = new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, 'u');
        return others.some((source) => [`'${w}'`, `«${w}»`, `"${w}"`].some((quoted) => source.includes(quoted))) || answers.some((text) => whole.test(text));
      })
      .map((q) => q.word);
    expect(repeatedWords).toEqual([]);
  });

  it('the repeat check sees every apostrophe and an answer inside a longer option', () => {
    for (const source of ["['пір’я']", "['пірʼя']", "['пір‘я']", '["пір`я"]', `["пір'я"]`, "«пір’я»"]) expect(norm(source), source).toMatch(/['«"]пір'я['»"]/);
    expect(literals("bluff('…', ['гусячим пір’ям', 'пір’я'])")).toEqual(['…', "гусячим пір'ям", "пір'я"]);
    expect(literals('x("м\'ясо", `жито`)')).toEqual(["м'ясо", "жито"]);
  });

  it('nothing about russia', () => {
    const text = JSON.stringify(quiz).toLowerCase();
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
