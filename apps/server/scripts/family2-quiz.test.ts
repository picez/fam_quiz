import { describe, expect, it } from 'vitest';
import { BUFF_KINDS, DEBUFF_KINDS, LIMITS, QUESTION_TYPES, ROUND_TYPES, allSpares, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import { FAMILY2_THEMES, family2Quiz, family2ThemeOf, type FamilyTheme } from './family2-quiz';
import { familyQuiz } from './family-quiz';
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

const quiz = family2Quiz();
const themes = Object.keys(FAMILY2_THEMES) as FamilyTheme[];

const key = (text: string) => text.trim().toLocaleLowerCase('uk');
/** Запитання раундів разом із питаннями на виживання. */
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
/** Тексти всіх запитань: раунди, питання на виживання, запасні (загальні й категорій) і дуелі. */
const texts = (q: Quiz) => [...played(q), ...allSpares(q)].map((x) => x.text).concat((q.duels?.categories ?? []).flatMap((c) => c.questions.map((x) => x.text)));

/** Заборонені корені: росія й радянський період; шукаються на початку слова. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'менделєєв', 'пажитнов', 'тетріс',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe('the «Родинний марафон ІІ» quiz', () => {
  it('passes the quiz schema within the limits and is medium-sized', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(played(quiz).length).toBeGreaterThanOrEqual(100);
    expect(played(quiz).length).toBeLessThanOrEqual(130);
  });

  it('has every round type and every scored type except «100 до 1», hosted solo with all buffs, debuffs, duels and spares', () => {
    expect(new Set(quiz.rounds.map((r) => r.type))).toEqual(new Set(ROUND_TYPES));
    const scored = QUESTION_TYPES.filter((type) => type !== 'poll' && type !== 'wordcloud' && type !== 'survey');
    expect(new Set(played(quiz).map((q) => q.type))).toEqual(new Set(scored));
    expect(quiz.settings.teams).toBeUndefined();
    expect(quiz.settings.buffs).toEqual([...BUFF_KINDS]);
    expect(quiz.settings.debuffs).toEqual([...DEBUFF_KINDS]);
    expect(quiz.settings.debuffShop).toBe(true);
    expect(quiz.duels?.categories).toHaveLength(3);
    const board = quiz.rounds.find((r) => r.type === 'board');
    for (const c of board?.type === 'board' ? board.categories : []) {
      expect(c.cells).toHaveLength(4);
      expect(c.spares).toHaveLength(1);
    }
  });

  it('covers all 16 themes, each with at least six questions', () => {
    const counts = new Map<FamilyTheme, number>();
    for (const q of played(quiz)) {
      const theme = family2ThemeOf(q.id);
      expect(theme).not.toBeNull();
      if (theme) counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
    for (const theme of themes) expect(counts.get(theme) ?? 0, theme).toBeGreaterThanOrEqual(6);
  });

  it('has unique ids and question texts that repeat none of the other demo quizzes', () => {
    const ids = [...played(quiz), ...allSpares(quiz)].map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const own = texts(quiz).map(key);
    expect(own.filter((text, i) => own.indexOf(text) !== i)).toEqual([]);
    const others = new Set(
      [demoQuiz, partyQuiz(), movieQuiz, eruditeQuiz, schoolQuiz, mosaicQuiz, horizonQuiz, compassQuiz, showcaseQuiz(), teamsQuiz(), grandQuiz(), familyQuiz()].flatMap(texts).map(key),
    );
    expect(own.filter((text) => others.has(text))).toEqual([]);
  });

  it('contains nothing related to russia or the Soviet period', () => {
    const text = JSON.stringify(quiz);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
