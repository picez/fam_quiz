import { answerKey, autopilotCheck, quizSchema, type Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { videoQuiz } from './video-quiz';

const quiz = videoQuiz();
const questions = quiz.rounds.flatMap((r) => ('questions' in r ? (r.questions as Question[]) : []));
const clips = questions.flatMap((q) => (q.type === 'videoclip' ? [q] : []));

/** Як у think-quiz.test.ts: нічого, пов'язаного з росією. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'менделєєв', 'пажитнов', 'тетріс',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe('the «Кадр за кадром» video quiz', () => {
  it('passes the quiz schema and starts the autopilot', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(autopilotCheck(quiz).blocked).toEqual([]);
    expect(quiz.rounds.map((r) => r.type)).toEqual(['classic']);
  });

  it('every question is a videoclip with a valid clip', () => {
    expect(questions.length).toBeGreaterThanOrEqual(5);
    expect(questions.length).toBeLessThanOrEqual(6);
    expect(clips).toHaveLength(questions.length);
    for (const q of clips) {
      expect(q.clip.id, q.text).toMatch(/^[\w-]{11}$/);
      expect(q.clip.start, q.text).toBeGreaterThanOrEqual(0);
    }
    const ids = clips.map((q) => q.clip.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sound is mostly off', () => {
    const muted = clips.filter((q) => q.muted).length;
    expect(muted).toBeGreaterThan(clips.length / 2);
    expect(clips.some((q) => !q.muted)).toBe(true);
  });

  it('timers are at least 25 seconds', () => {
    for (const q of questions) expect(q.timeLimit, q.text).toBeGreaterThanOrEqual(25);
  });

  it('points follow difficulty', () => {
    const points = questions.map((q) => q.points);
    expect(new Set(points).size).toBeGreaterThan(1);
    points.slice(1).forEach((p, i) => expect(p, questions[i + 1]!.text).not.toBe(points[i]));
  });

  it('no answer leaks into the text and no spelling repeats', () => {
    for (const q of clips) {
      const text = answerKey(q.text);
      for (const spelling of q.accepted) expect(text.includes(answerKey(spelling)), `${q.text} ← ${spelling}`).toBe(false);
      const keys = q.accepted.map(answerKey);
      expect(new Set(keys).size, q.text).toBe(keys.length);
    }
  });

  it('nothing about russia', () => {
    const text = JSON.stringify(quiz).toLowerCase();
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
