import { autopilotCheck, quizSchema, thinkKey, thinkStem, thinkWordsIssue, type Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { thinkQuiz } from './think-quiz';

const quiz = thinkQuiz();
const questions = quiz.rounds.flatMap((r) => ('questions' in r ? (r.questions as Question[]) : []));
const thinks = questions.flatMap((q) => (q.type === 'think' ? [q] : []));

/** Як у evening-quiz.test.ts: нічого, пов'язаного з росією. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'менделєєв', 'пажитнов', 'тетріс',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe('the «Думай інакше» quiz', () => {
  it('passes the quiz schema and starts the autopilot', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(autopilotCheck(quiz).blocked).toEqual([]);
    expect(quiz.rounds.map((r) => r.type)).toEqual(['think']);
    const round = quiz.rounds[0]!;
    expect(round.type === 'think' ? [round.lives, round.points] : []).toEqual([3, 5000]);
  });

  it('every question asks for one word with three host words', () => {
    expect(thinks).toHaveLength(14);
    expect(questions).toHaveLength(14);
    for (const q of thinks) {
      expect(q.words, q.text).toHaveLength(3);
      expect(thinkWordsIssue(q.words), q.text).toBeNull();
      expect(q.points).toBe(0);
    }
  });

  it('timers are at least 25 seconds', () => {
    for (const q of questions) expect(q.timeLimit, q.text).toBeGreaterThanOrEqual(25);
  });

  it('no repeated prompts and no shared stems across questions', () => {
    const prompts = thinks.map((q) => thinkKey(q.text));
    expect(new Set(prompts).size).toBe(prompts.length);
    const stems = thinks.flatMap((q) => q.words.flatMap((w) => [w.word, ...w.synonyms]).map(thinkStem));
    expect(stems.filter((s, i) => stems.indexOf(s) !== i)).toEqual([]);
  });

  it('nothing about russia', () => {
    const text = JSON.stringify(quiz).toLowerCase();
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
