import { describe, expect, it } from 'vitest';
import { LIMITS, QUESTION_TYPES, ROUND_TYPES, allSpares, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import { GRAND_IMAGES, GRAND_THEMES, grandQuiz, grandThemeOf, type GrandTheme } from './grand-quiz';

const images = Object.fromEntries(GRAND_IMAGES.map((key, i) => [key, `/uploads/${String(i).repeat(16)}.jpg`]));
const plain = grandQuiz();
const pictured = grandQuiz(images);
const themes = Object.keys(GRAND_THEMES) as GrandTheme[];

const key = (text: string) => text.trim().toLocaleLowerCase('uk');
/** Запитання раундів разом із питаннями на виживання. */
const played = (quiz: Quiz): Question[] => [...questionsOf(quiz), ...quiz.rounds.flatMap(roundTrials)];

/** Заборонені корені: росія й радянський період; шукаються на початку слова. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe('the «Велика вікторина» quiz', () => {
  it('passes the quiz schema with and without pictures, within the limits', () => {
    for (const quiz of [plain, pictured]) {
      const result = quizSchema.safeParse(quiz);
      expect(result.success ? [] : result.error.issues).toEqual([]);
      expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
      expect(played(quiz).length).toBeLessThanOrEqual(LIMITS.maxQuizQuestions);
    }
    expect(played(plain).length).toBeGreaterThanOrEqual(180);
    expect(questionsOf(pictured).filter((q) => q.reveal !== undefined).length).toBe(GRAND_IMAGES.length);
  });

  it('has every question type and every round type, hosted solo with buffs, debuffs, duels and spares', () => {
    expect(new Set(plain.rounds.map((r) => r.type))).toEqual(new Set(ROUND_TYPES));
    expect(new Set(played(plain).map((q) => q.type))).toEqual(new Set(QUESTION_TYPES));
    expect(plain.settings.teams).toBeUndefined();
    expect(plain.settings.leaderboard).toBe('each');
    expect(plain.settings.buffs?.length).toBeGreaterThan(0);
    expect(plain.settings.debuffShop).toBe(true);
    expect(plain.duels).toBeDefined();
    expect(plain.spares?.length).toBeGreaterThan(0);
    const boards = plain.rounds.flatMap((r) => (r.type === 'board' ? [r] : []));
    expect(boards.flatMap((b) => b.categories).length).toBe(themes.length);
    for (const board of boards) for (const c of board.categories) expect(c.cells.length).toBeGreaterThanOrEqual(5);
  });

  it('gives every theme at least 12 questions', () => {
    const counts = new Map<GrandTheme, number>();
    for (const q of played(plain)) {
      const theme = grandThemeOf(q.id);
      if (theme) counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
    expect(themes.filter((theme) => (counts.get(theme) ?? 0) < 12)).toEqual([]);
  });

  it('has no duplicate question texts', () => {
    const texts = [...played(plain), ...allSpares(plain)].map((q) => key(q.text));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
  });

  it('contains nothing related to russia or the Soviet period', () => {
    const text = JSON.stringify(pictured);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
