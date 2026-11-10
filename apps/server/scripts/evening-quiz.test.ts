import { describe, expect, it } from 'vitest';
import { BUFF_KINDS, DEBUFF_KINDS, LIMITS, QUESTION_TYPES, ROUND_TYPES, allSpares, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENING_IMAGES, EVENING_THEMES, eveningQuiz, eveningThemeOf } from './evening-quiz';
import * as science from './evening/science';
import * as world from './evening/world';
import * as culture from './evening/culture';
import * as secret from './evening/secret';
import type { EveningTheme } from './evening/kit';

const quiz = eveningQuiz((key) => `/uploads/${key.replace(/[^a-z0-9]/gi, '').toLowerCase().padEnd(16, '0').slice(0, 64)}.jpg`);
const themes = Object.keys(EVENING_THEMES) as EveningTheme[];
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
const everything = (q: Quiz): Question[] => [...played(q), ...allSpares(q)];

const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'менделєєв', 'пажитнов', 'тетріс',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe('the «Вечір тринадцяти тем» quiz', () => {
  it('passes the quiz schema within the limits', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(played(quiz).length).toBeLessThanOrEqual(LIMITS.maxQuizQuestions);
  });

  it('has every round type and every question type, all buffs and debuffs, duels', () => {
    expect(new Set(quiz.rounds.map((r) => r.type))).toEqual(new Set(ROUND_TYPES.filter((type) => type !== 'bets' && type !== 'auction')));
    // Без опитувань і «хмари» серед гравців: «100 до 1» лише за справжніми опитуваннями.
    expect(new Set(played(quiz).map((q) => q.type))).toEqual(new Set(QUESTION_TYPES.filter((type) => type !== 'poll' && type !== 'wordcloud' && type !== 'wordladder' && type !== 'timedlist'))); // 26c: демо без драбини; 27c: новий тип, демо без списку
    expect(played(quiz).filter((q) => q.type === 'survey' && ('cloudId' in q)).length).toBe(0);
    expect(quiz.settings.buffs).toEqual([...BUFF_KINDS]);
    expect(quiz.settings.debuffs).toEqual([...DEBUFF_KINDS]);
    expect(quiz.duels?.categories).toHaveLength(3);
  });

  it('has pictures, video and audio', () => {
    const qs = played(quiz);
    expect(qs.filter((q) => q.imageUrl).length).toBeGreaterThanOrEqual(5);
    expect(qs.filter((q) => q.video).length).toBeGreaterThanOrEqual(2);
    expect(qs.filter((q) => q.audio).length).toBeGreaterThanOrEqual(1);
    const keys = [science, world, culture, secret].flatMap((m) => Object.keys(m.IMAGES));
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(EVENING_IMAGES)).toHaveLength(keys.length);
  });

  it('never times a question under 20 seconds and keeps yes/no answers mixed', () => {
    expect(everything(quiz).filter((q) => q.timeLimit < 20).map((q) => q.text)).toEqual([]);
    expect(quiz.duels?.timeLimit).toBeGreaterThanOrEqual(20);
    const blitz = quiz.rounds.find((r) => r.type === 'blitz');
    expect(blitz?.type === 'blitz' ? blitz.answerWindow : 0).toBeGreaterThanOrEqual(20);
    const bools = everything(quiz).flatMap((q) => (q.type === 'boolean' ? [q.correct] : []));
    const no = bools.filter((b) => !b).length;
    expect(no).toBeGreaterThanOrEqual(Math.floor(bools.length * 0.35));
    expect(no).toBeLessThanOrEqual(Math.ceil(bools.length * 0.65));
  });

  it('prices board cells 100–400 in order and makes the wipeout bank grow', () => {
    for (const round of quiz.rounds) {
      if (round.type === 'board') for (const c of round.categories) expect(c.cells.map((x) => x.question.points), c.title).toEqual([100, 200, 300, 400]);
      if (round.type === 'wipeout') {
        const pts = round.questions.map((q) => q.points);
        expect(pts).toEqual([...pts].sort((a, b) => a - b));
      }
    }
  });

  it('covers all 13 themes and never names the two secret ones', () => {
    const counts = new Map<EveningTheme, number>();
    for (const q of played(quiz)) {
      const theme = eveningThemeOf(q.id);
      if (theme) counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
    for (const theme of themes) expect(counts.get(theme) ?? 0, theme).toBeGreaterThanOrEqual(6);
    const text = JSON.stringify(quiz).toLocaleLowerCase('uk');
    expect(text).not.toMatch(/дурнуват|загадк/u);
  });

  it('has unique ids and texts that appear in no other quiz', () => {
    const ids = everything(quiz).map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const texts = everything(quiz).map((q) => q.text);
    expect(texts.filter((x, i) => texts.indexOf(x) !== i)).toEqual([]);
    const dir = import.meta.dirname;
    const others = readdirSync(dir)
      .filter((f) => f.endsWith('-quiz.ts') && f !== 'evening-quiz.ts')
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    expect(texts.filter((x) => others.includes(x))).toEqual([]);
  });

  it('contains nothing related to russia or the Soviet period', () => {
    const text = JSON.stringify(quiz);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
