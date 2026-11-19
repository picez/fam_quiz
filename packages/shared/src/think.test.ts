import { describe, expect, it } from 'vitest';
import { THINK_ENDINGS, thinkKey, thinkStem, thinkWordsIssue } from './think';
import { thinkOffSchema, thinkVoteSchema, thinkWordsEventSchema } from './events';
import { answerSchema } from './answer';
import { LIMITS, quizSchema } from './quiz';
import { factLimitMs } from './facts';

describe('think word keys (35)', () => {
  it('keys ignore case, apostrophes and spaces', () => {
    expect(thinkKey('  П’ЯТЬ ')).toBe('пять');
    expect(thinkKey('пʼять')).toBe('пять');
    expect(thinkKey("п'ять")).toBe('пять');
    expect(thinkKey('п`ять')).toBe('пять');
    expect(thinkKey('  темно   синій ')).toBe('темно синій');
    expect(thinkKey('   ')).toBe('');
    expect(thinkKey('п′ять')).toBe('пять');
    expect(thinkKey('п´ять')).toBe('пять');
  });

  it('punctuation, quotes, emoji and dashes become spaces', () => {
    for (const value of ['Червоний!', 'червоний.', '"Червоний"', '«червоний»', 'червоний , ', '🍎 червоний']) expect(thinkKey(value)).toBe('червоний');
    expect(thinkKey('темно-синій')).toBe('темно синій');
    expect(thinkKey('темно–синій')).toBe('темно синій');
    expect(thinkKey('темно — синій')).toBe('темно синій');
    expect(thinkKey('черво́ний')).toBe('червоний');
    expect(thinkKey('!!! ...')).toBe('');
    expect(thinkStem('синьою')).toBe('син');
    expect(thinkStem('синьої')).toBe('син');
  });

  it('endings come off, the stem stays at least three letters', () => {
    expect(thinkStem('фіолетовий')).toBe('фіолетов');
    expect(thinkStem('Фіолетова')).toBe('фіолетов');
    expect(thinkStem('фіолетові')).toBe('фіолетов');
    expect(thinkStem('рожеві')).toBe(thinkStem('рожевий'));
    expect(thinkStem('яблуко')).toBe('яблук');
    expect(thinkStem('яблука')).toBe('яблук');
    expect(thinkStem('яблуком')).toBe('яблук');
    expect(thinkStem('кіт')).toBe('кіт');
    expect(thinkStem('ліс')).toBe('ліс');
    expect(thinkStem('море')).toBe('мор');
    expect(thinkStem('темно синій')).toBe('темн син');
    expect(thinkStem('горобець')).toBe('горобец');
    expect(thinkStem('горобці')).toBe('горобц');
    expect(thinkStem('')).toBe('');
  });

  it('the endings go from longer to shorter', () => {
    const lengths = THINK_ENDINGS.map((e) => [...e].length);
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
    expect(new Set(THINK_ENDINGS).size).toBe(THINK_ENDINGS.length);
  });

  it('latin words keep their endings', () => {
    expect(thinkStem('Blue')).toBe('blue');
    expect(thinkStem('  Red  ')).toBe('red');
  });

  it('duplicates across words and synonyms', () => {
    expect(thinkWordsIssue([{ word: 'Червоний', synonyms: [] }, { word: 'синій', synonyms: ['червона'] }])).toBe('think_words_dup');
    expect(thinkWordsIssue([{ word: 'синій', synonyms: ['Сині'] }])).toBe('think_words_dup');
    expect(thinkWordsIssue([{ word: 'червоний', synonyms: ['багряний'] }, { word: 'синій', synonyms: ['блакитний'] }])).toBeNull();
    expect(thinkWordsIssue([])).toBeNull();
    expect(thinkWordsIssue([{ word: '!!!', synonyms: [] }])).toBe('think_word_empty');
    expect(thinkWordsIssue([{ word: 'червоний', synonyms: ['—'] }])).toBe('think_word_empty');
  });
});

describe('think payloads (35)', () => {
  it('a think answer is any storable text up to twice the word limit (the engine trims and measures)', () => {
    expect(answerSchema.safeParse({ type: 'think', value: '' }).success).toBe(true);
    expect(answerSchema.safeParse({ type: 'think', value: 'червоний' }).success).toBe(true);
    expect(answerSchema.safeParse({ type: 'think', value: 'а'.repeat(LIMITS.thinkWord * 2) }).success).toBe(true);
    expect(answerSchema.safeParse({ type: 'think', value: 'а'.repeat(LIMITS.thinkWord * 2 + 1) }).success).toBe(false);
    expect(answerSchema.safeParse({ type: 'think', value: 'a\u0000b' }).success).toBe(false);
  });

  it('the host words event carries 0–3 words with synonyms', () => {
    expect(thinkWordsEventSchema.safeParse({ words: [] }).success).toBe(true);
    expect(thinkWordsEventSchema.safeParse({ words: [{ word: 'червоний', synonyms: ['багряний'] }] }).success).toBe(true);
    const four = Array.from({ length: 4 }, (_, i) => ({ word: `слово${i}`, synonyms: [] }));
    expect(thinkWordsEventSchema.safeParse({ words: four }).success).toBe(false);
    expect(thinkWordsEventSchema.safeParse({ words: [{ word: '', synonyms: [] }] }).success).toBe(false);
    expect(thinkWordsEventSchema.safeParse({ words: [{ word: 'а'.repeat(41), synonyms: [] }] }).success).toBe(false);
    expect(thinkWordsEventSchema.safeParse({}).success).toBe(false);
  });
});

describe('think off-topic payloads (51)', () => {
  it('a vote carries up to maxPlayers answer keys', () => {
    expect(thinkVoteSchema.safeParse({ keys: [] }).success).toBe(true);
    expect(thinkVoteSchema.safeParse({ keys: ['банан'] }).success).toBe(true);
    expect(thinkVoteSchema.safeParse({ keys: ['а'.repeat(LIMITS.thinkWord + 1)] }).success).toBe(false);
    expect(thinkVoteSchema.safeParse({ keys: [''] }).success).toBe(false);
    expect(thinkVoteSchema.safeParse({ keys: Array.from({ length: LIMITS.maxPlayers + 1 }, (_, i) => `к${i}`) }).success).toBe(false);
    expect(thinkVoteSchema.safeParse({}).success).toBe(false);
  });

  it('the host off-topic mark names a participant and a flag', () => {
    expect(thinkOffSchema.safeParse({ playerId: 'p1', off: true }).success).toBe(true);
    expect(thinkOffSchema.safeParse({ playerId: 'p1', off: false }).success).toBe(true);
    expect(thinkOffSchema.safeParse({ playerId: 'p1' }).success).toBe(false);
    expect(thinkOffSchema.safeParse({ playerId: '', off: true }).success).toBe(false);
  });
});

describe('think facts (35)', () => {
  it('a think answer has no speed', () => {
    const quiz = quizSchema.parse({ title: 'T', description: '', settings: { leaderboard: 'each' }, rounds: [{
      id: 'th', type: 'think', title: '', lives: 3, points: 5000,
      questions: [1, 2, 3].map((i) => ({ id: `t${i}`, type: 'think', text: 'Колір', imageUrl: null, video: null, timeLimit: 30, points: 0, words: [] })),
    }] });
    const round = quiz.rounds[0]!;
    expect(round.type === 'think' && factLimitMs(round.questions[0]!, round, false)).toBeNull();
  });
});
