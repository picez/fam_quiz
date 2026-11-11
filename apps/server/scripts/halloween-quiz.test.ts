import { describe, expect, it } from 'vitest';
import { LIMITS, QUESTION_TYPES, ROUND_TYPES, allSpares, ladderKey, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import { loadNouns } from '../src/wordladder/nouns';
import { HALLOWEEN_THEMES, MIN_TIMER, halloweenQuiz, halloweenThemeOf, type HalloweenTheme } from './halloween-quiz';

const quiz = halloweenQuiz();
const themes = Object.keys(HALLOWEEN_THEMES) as HalloweenTheme[];

const key = (text: string) => text.trim().toLocaleLowerCase('uk');
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];

const EXPECTED_TYPES = QUESTION_TYPES.filter((t) => t !== 'poll' && t !== 'wordcloud' && t !== 'timedlist' && t !== 'letterwords' && t !== 'moreless' && t !== 'drawing' && t !== 'sudoku' && t !== 'crossword' && t !== 'jigsaw' && t !== 'spotdiff'); // 27c: новий тип, демо без списку; 27d: новий тип, демо без слів з літер; 28a: новий тип, демо без «Більше чи менше»; 28c: новий тип, демо без «Малюнка»; 28d: нові типи, демо без судоку й кросворду; 29c: новий тип, демо без пазла; 29d: новий тип, демо без відмінностей

const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe('the «Ніч, коли оживають тіні» Halloween quiz', () => {
  it('passes the quiz schema, within the limits, and is large', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(played(quiz).length).toBeLessThanOrEqual(LIMITS.maxQuizQuestions);
    expect(played(quiz).length).toBeGreaterThanOrEqual(130);
  });

  it('uses every round type and every question type except polls and word clouds', () => {
    // «Аукціон» (27b) з'явився після цієї вікторини; сід-скрипти не змінюються.
    expect(new Set(quiz.rounds.map((r) => r.type))).toEqual(new Set(ROUND_TYPES.filter((type) => type !== 'auction' && type !== 'truth' && type !== 'puzzles'))); // 28b: новий тип раунду, сід-скрипти не змінюються; 28d: так само «Головоломки»
    expect(new Set(played(quiz).map((q) => q.type))).toEqual(new Set(EXPECTED_TYPES));
  });

  it('gives every question, spare, blitz window and duel at least 25 seconds', () => {
    const all = [...played(quiz), ...allSpares(quiz)];
    expect(all.filter((q) => q.timeLimit < MIN_TIMER).map((q) => q.id)).toEqual([]);
    for (const q of all) if (q.type === 'bluff') expect(q.choiceTime).toBeGreaterThanOrEqual(MIN_TIMER);
    for (const r of quiz.rounds) if (r.type === 'blitz' && r.answerWindow !== null) expect(r.answerWindow).toBeGreaterThanOrEqual(MIN_TIMER);
    expect(quiz.duels?.timeLimit).toBeGreaterThanOrEqual(MIN_TIMER);
  });

  it('builds every word ladder from dictionary nouns', () => {
    const nouns = loadNouns();
    const ladders = played(quiz).filter((q): q is Extract<Question, { type: 'wordladder' }> => q.type === 'wordladder');
    expect(ladders.length).toBeGreaterThanOrEqual(2);
    for (const l of ladders) {
      const missing = l.path.filter((w) => {
        const k = ladderKey(w);
        return k === null || !nouns.isNoun(k);
      });
      expect(missing).toEqual([]);
      expect(l.path.length - 1).toBeLessThanOrEqual(l.maxSteps);
    }
  });

  it('gives every theme at least ten questions', () => {
    const counts = new Map<HalloweenTheme, number>();
    for (const q of played(quiz)) {
      const theme = halloweenThemeOf(q.id);
      if (theme) counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
    expect(themes.filter((theme) => (counts.get(theme) ?? 0) < 10)).toEqual([]);
  });

  it('has a fair mix of true and false in yes/no questions', () => {
    const bools = [...played(quiz), ...allSpares(quiz)].filter((q): q is Extract<Question, { type: 'boolean' }> => q.type === 'boolean');
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
