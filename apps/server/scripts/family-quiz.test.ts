import { describe, expect, it } from 'vitest';
import { LIMITS, QUESTION_TYPES, ROUND_TYPES, allSpares, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import { FAMILY_IMAGES, FAMILY_THEMES, familyQuiz, familyThemeOf, type FamilyTheme } from './family-quiz';
import { demoQuiz } from './demo-quiz';
import { partyQuiz } from './party-quiz';
import { movieQuiz } from './movie-quiz';
import { eruditeQuiz } from './erudite-quiz';
import { schoolQuiz } from './school-quiz';
import { mosaicQuiz } from './mosaic-quiz';
import { horizonQuiz } from './horizon-quiz';
import { compassQuiz } from './compass-quiz';
import { showcaseQuiz } from './showcase-quiz';
import { teamsQuiz } from './teams-quiz';
import { grandQuiz } from './grand-quiz';

const images = Object.fromEntries(FAMILY_IMAGES.map((key, i) => [key, `/uploads/${String(i).repeat(16)}.jpg`]));
const plain = familyQuiz();
const pictured = familyQuiz(images);
const themes = Object.keys(FAMILY_THEMES) as FamilyTheme[];

const key = (text: string) => text.trim().toLocaleLowerCase('uk');
/** Запитання раундів разом із питаннями на виживання. */
const played = (quiz: Quiz): Question[] => [...questionsOf(quiz), ...quiz.rounds.flatMap(roundTrials)];
/** Тексти всіх запитань: раунди, питання на виживання, запасні (загальні й категорій) і дуелі. */
const texts = (quiz: Quiz) => [...played(quiz), ...allSpares(quiz)].map((q) => q.text).concat((quiz.duels?.categories ?? []).flatMap((c) => c.questions.map((q) => q.text)));

/** Заборонені корені: росія й радянський період; шукаються на початку слова. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'менделєєв', 'мафі', 'ерудит', 'садко', 'молотов', 'кинцуги',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe('the «Родинний марафон» quiz', () => {
  it('passes the quiz schema with and without pictures, within the limits', () => {
    for (const quiz of [plain, pictured]) {
      const result = quizSchema.safeParse(quiz);
      expect(result.success ? [] : result.error.issues).toEqual([]);
      expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
      expect(played(quiz).length).toBeLessThanOrEqual(LIMITS.maxQuizQuestions);
    }
    expect(played(plain).length).toBeGreaterThanOrEqual(190);
    expect(questionsOf(pictured).filter((q) => q.reveal !== undefined).length).toBe(FAMILY_IMAGES.length);
  });

  it('has every scored question type and every round type, with no polls or word clouds, hosted solo with buffs, debuffs, duels and spares', () => {
    expect(new Set(plain.rounds.map((r) => r.type))).toEqual(new Set(ROUND_TYPES));
    const scored = QUESTION_TYPES.filter((type) => type !== 'poll' && type !== 'wordcloud');
    expect(new Set(played(plain).map((q) => q.type))).toEqual(new Set(scored));
    expect(played(plain).filter((q) => q.type === 'survey' && q.cloudId !== undefined)).toEqual([]);
    expect(plain.settings.teams).toBeUndefined();
    expect(plain.settings.leaderboard).toBe('each');
    expect(plain.settings.buffs?.length).toBeGreaterThan(0);
    expect(plain.settings.debuffShop).toBe(true);
    expect(plain.duels).toBeDefined();
    expect(plain.spares?.length).toBe(themes.length);
    const boards = plain.rounds.flatMap((r) => (r.type === 'board' ? [r] : []));
    expect(boards.flatMap((b) => b.categories).length).toBe(themes.length);
    for (const board of boards) for (const c of board.categories) {
      expect(c.cells.length).toBe(5);
      expect(c.spares?.length).toBe(2);
    }
  });

  it('names the data source in every «100 до 1» question', () => {
    const surveys = played(plain).filter((q) => q.type === 'survey');
    expect(surveys.length).toBeGreaterThan(0);
    for (const q of surveys) expect(q.text).toMatch(/даних|довідник/u);
  });

  it('spreads the themes evenly: exactly 12 questions each', () => {
    const counts = new Map<FamilyTheme, number>();
    for (const q of played(plain)) {
      const theme = familyThemeOf(q.id);
      expect(theme).not.toBeNull();
      if (theme) counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
    expect(Object.fromEntries(themes.map((theme) => [theme, counts.get(theme) ?? 0]))).toEqual(Object.fromEntries(themes.map((theme) => [theme, 12])));
  });

  it('has unique ids and question texts that repeat none of the other demo quizzes', () => {
    const ids = [...played(plain), ...allSpares(plain)].map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const own = texts(plain).map(key);
    expect(own.filter((text, i) => own.indexOf(text) !== i)).toEqual([]);
    const others = new Set(
      [demoQuiz, partyQuiz(), movieQuiz, eruditeQuiz, schoolQuiz, mosaicQuiz, horizonQuiz, compassQuiz, showcaseQuiz(), teamsQuiz(), grandQuiz()].flatMap(texts).map(key),
    );
    expect(own.filter((text) => others.has(text))).toEqual([]);
  });

  it('contains nothing related to russia or the Soviet period', () => {
    const text = JSON.stringify(pictured);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
