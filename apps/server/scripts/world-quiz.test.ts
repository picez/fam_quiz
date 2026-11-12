import { describe, expect, it } from 'vitest';
import { LIMITS, QUESTION_TYPES, ROUND_TYPES, allSpares, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import { WORLD_THEMES, worldQuiz, worldThemeOf, type WorldTheme } from './world-quiz';

const quiz = worldQuiz();
const themes = Object.keys(WORLD_THEMES) as WorldTheme[];

const key = (text: string) => text.trim().toLocaleLowerCase('uk');
/** Запитання раундів разом із питаннями на виживання. */
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];

/** Усі типи, крім опитувань і «хмари слів» — їх у вікторинах для власника не використовуємо (реальні опитування лише як «100 до 1»). */
const EXPECTED_TYPES = QUESTION_TYPES.filter((t) => t !== 'poll' && t !== 'wordcloud' && t !== 'wordladder' && t !== 'timedlist' && t !== 'letterwords' && t !== 'moreless' && t !== 'drawing' && t !== 'sudoku' && t !== 'crossword' && t !== 'jigsaw' && t !== 'spotdiff' && t !== 'memory'); // 26c: демо без драбини; 27c: новий тип, демо без списку; 27d: новий тип, демо без слів з літер; 28a: новий тип, демо без «Більше чи менше»; 28c: новий тип, демо без «Малюнка»; 28d: нові типи, демо без судоку й кросворду; 29c: новий тип, демо без пазла; 29d: новий тип, демо без відмінностей; 29f: новий тип, демо без «Пам'яті»

/** Заборонені корені: росія й радянський період; шукаються на початку слова. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe('the «Все на світі: десять тем» quiz', () => {
  it('passes the quiz schema, within the limits, and is large', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(played(quiz).length).toBeLessThanOrEqual(LIMITS.maxQuizQuestions);
    expect(played(quiz).length).toBeGreaterThanOrEqual(140);
  });

  it('uses every round type and every question type except polls and word clouds', () => {
    expect(new Set(quiz.rounds.map((r) => r.type))).toEqual(new Set(ROUND_TYPES.filter((type) => type !== 'bets' && type !== 'auction' && type !== 'truth' && type !== 'puzzles'))); // 28b: новий тип раунду, сід-скрипти не змінюються; 28d: так само «Головоломки»
    expect(new Set(played(quiz).map((q) => q.type))).toEqual(new Set(EXPECTED_TYPES));
    const votes = played(quiz).filter((q) => q.type === 'poll' || q.type === 'wordcloud');
    expect(votes).toEqual([]);
  });

  it('is hosted solo with buffs, a debuff shop, duels and spares', () => {
    expect(quiz.settings.teams).toBeUndefined();
    expect(quiz.settings.leaderboard).toBe('each');
    expect(quiz.settings.buffs?.length).toBeGreaterThan(0);
    expect(quiz.settings.debuffShop).toBe(true);
    expect(quiz.duels).toBeDefined();
    expect(quiz.spares?.length).toBeGreaterThan(0);
  });

  it('splits the ten themes across two boards, five cells each', () => {
    const boards = quiz.rounds.flatMap((r) => (r.type === 'board' ? [r] : []));
    expect(boards.length).toBe(2);
    expect(boards.flatMap((b) => b.categories).length).toBe(themes.length);
    for (const board of boards) for (const c of board.categories) expect(c.cells.length).toBeGreaterThanOrEqual(5);
  });

  it('gives every theme at least ten questions', () => {
    const counts = new Map<WorldTheme, number>();
    for (const q of played(quiz)) {
      const theme = worldThemeOf(q.id);
      if (theme) counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
    expect(themes.filter((theme) => (counts.get(theme) ?? 0) < 10)).toEqual([]);
  });

  it('has a fair mix of true and false in yes/no questions', () => {
    const bools = played(quiz).filter((q): q is Extract<Question, { type: 'boolean' }> => q.type === 'boolean');
    const trueCount = bools.filter((q) => q.correct).length;
    expect(trueCount).toBeGreaterThanOrEqual(Math.floor(bools.length * 0.35));
    expect(trueCount).toBeLessThanOrEqual(Math.ceil(bools.length * 0.65));
  });

  it('builds every «100 до 1» from a poll that names its year', () => {
    const surveys = played(quiz).filter((q): q is Extract<Question, { type: 'survey' }> => q.type === 'survey');
    expect(surveys.length).toBeGreaterThanOrEqual(1);
    for (const s of surveys) expect(s.text).toMatch(/опитуванн/i);
    for (const s of surveys) expect(s.text).toMatch(/\d{4}/);
  });

  it('has no duplicate question texts', () => {
    const texts = [...played(quiz), ...allSpares(quiz)].map((q) => key(q.text));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
  });

  it('contains nothing related to russia or the Soviet period', () => {
    const text = JSON.stringify(quiz);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
