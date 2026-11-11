import { describe, expect, it } from 'vitest';
import { LIMITS, QUESTION_TYPES, allSpares, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import { FUN_THEMES, funQuiz, funThemeOf, type FunTheme } from './fun-quiz';

const quiz = funQuiz();
const themes = Object.keys(FUN_THEMES) as FunTheme[];

const key = (text: string) => text.trim().toLocaleLowerCase('uk');
/** Запитання раундів разом із питаннями на виживання. */
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];

/** Усі типи, крім опитувань, «хмари слів» і «100 до 1» (реального опитування для цієї гри немає). */
const EXPECTED_TYPES = QUESTION_TYPES.filter((t) => t !== 'poll' && t !== 'wordcloud' && t !== 'survey' && t !== 'wordladder' && t !== 'timedlist' && t !== 'letterwords' && t !== 'moreless' && t !== 'drawing' && t !== 'sudoku' && t !== 'crossword' && t !== 'jigsaw' && t !== 'spotdiff'); // 26c: демо без драбини; 27c: новий тип, демо без списку; 27d: новий тип, демо без слів з літер; 28a: новий тип, демо без «Більше чи менше»; 28c: новий тип, демо без «Малюнка»; 28d: нові типи, демо без судоку й кросворду; 29c: новий тип, демо без пазла; 29d: новий тип, демо без відмінностей

/** Заборонені корені: росія й радянський період; шукаються на початку слова. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe('the «Швидка й весела вікторина» quiz', () => {
  it('passes the quiz schema, within the limits, and stays quick', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(played(quiz).length).toBeGreaterThanOrEqual(25);
    expect(played(quiz).length).toBeLessThanOrEqual(35);
  });

  it('plays a warm-up, a blitz, one small board, a wipeout and a final', () => {
    expect(quiz.rounds.map((r) => r.type)).toEqual(['classic', 'blitz', 'board', 'wipeout', 'final']);
    const board = quiz.rounds.find((r) => r.type === 'board');
    expect(board?.type === 'board' ? board.categories.map((c) => c.cells.length) : []).toEqual([3, 3, 3, 3]);
  });

  it('mixes question types, with no polls, word clouds or surveys', () => {
    expect(new Set(played(quiz).map((q) => q.type))).toEqual(new Set(EXPECTED_TYPES));
    const votes = [...played(quiz), ...allSpares(quiz)].filter((q) => q.type === 'poll' || q.type === 'wordcloud' || q.type === 'survey');
    expect(votes).toEqual([]);
  });

  it('is hosted solo with buffs, a debuff shop, duels and spares', () => {
    expect(quiz.settings.teams).toBeUndefined();
    expect(quiz.settings.buffs?.length).toBeGreaterThan(0);
    expect(quiz.settings.debuffShop).toBe(true);
    expect(quiz.duels).toBeDefined();
    expect(quiz.spares?.length).toBeGreaterThan(0);
  });

  it('uses every theme and keeps the timers short', () => {
    const used = new Set(played(quiz).map((q) => funThemeOf(q.id)));
    expect(themes.filter((theme) => !used.has(theme))).toEqual([]);
    const long = played(quiz).filter((q) => q.type !== 'wall' && q.type !== 'sort' && q.type !== 'chain' && q.type !== 'match' && q.type !== 'bluff' && q.timeLimit > 30);
    expect(long.map((q) => q.text)).toEqual([]);
  });

  it('has a fair mix of true and false in yes/no questions', () => {
    const bools = played(quiz).filter((q): q is Extract<Question, { type: 'boolean' }> => q.type === 'boolean');
    const trueCount = bools.filter((q) => q.correct).length;
    expect(trueCount).toBeGreaterThanOrEqual(Math.floor(bools.length * 0.35));
    expect(trueCount).toBeLessThanOrEqual(Math.ceil(bools.length * 0.65));
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
