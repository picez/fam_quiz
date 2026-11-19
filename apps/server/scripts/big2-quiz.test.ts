import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  answerKey,
  autopilotCheck,
  crosswordIssue,
  questionsOf,
  quizSchema,
  roundTrials,
  sudokuIssue,
  type Question,
  type Quiz,
} from '@quiz/shared';
import { BIG2_PHOTOS, big2Quiz } from './big2-quiz';
import { MIN_TIMER } from './mix-quiz';

/** Заглушка завантаження: кожен ключ — своя адреса /uploads/…, як після uploadImages. */
const url = (key: string) => `/uploads/big2${key.toLowerCase().replace(/[^a-z0-9]/g, '')}0000000000000000.jpg`;
const used = new Set<string>();
const quiz = big2Quiz((key) => {
  if (!(key in BIG2_PHOTOS)) throw new Error(`unknown photo ${key}`);
  used.add(key);
  return url(key);
});
/** Ключ тексту: малими, апострофи ’ ʼ ‘ ` — як «'», пробіли стиснуто. */
const key = (text: string) => text.trim().toLocaleLowerCase('uk').replace(/[’ʼ‘`]/g, "'").replace(/\s+/g, ' ');
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
const everything = played(quiz);
const ofType = <T extends Question['type']>(type: T) => everything.filter((q): q is Extract<Question, { type: T }> => q.type === type);
const duelQuestions = (quiz.duels?.categories ?? []).flatMap((c) => c.questions);

/** Як у big1-quiz.test.ts: нічого, пов'язаного з росією. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград', 'мазеп', 'полтавськ', 'ельбрус',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris',
];

const dir = import.meta.dirname;
/** Тексти інших сідів: усі .ts у scripts і підтеках, крім цього сіда й тестів. */
const otherSources = (): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.startsWith('big2') && !f.includes('.test.'))
    .map((f) => readFileSync(join(dir, f), 'utf8'));
const ownSources = (): string =>
  readdirSync(join(dir, 'big2'))
    .map((f) => readFileSync(join(dir, 'big2', f), 'utf8'))
    .join('\n');

/** Мелодії, перевірені 2026-11-19: oEmbed (канал) + lrclib (тривалість збігається з відео, старт — перший куплет/такти пісні). */
const MELODIES: Record<string, number> = {
  kyzIQKuSqBs: 3, // Eiffel 65 - Topic, «Blue (Da Ba Dee) (Video Edit)», перший рядок 0:03,85
  dEOmR6b0IqM: 40, // Haddaway - Topic, «What Is Love (7" Mix)», куплет 0:40,72
  'VnULE-d14TA': 43, // Scatman John - Topic, «Scatman», куплет 0:43,35
  EK_LN3XEcnw: 17, // LouBegaVEVO, «Mambo No. 5», «One, two, three…» 0:17,44
  vx2u5uUu3DE: 34, // BonJoviVEVO, «It's My Life», перший рядок 0:34,19
};

describe('the big «Велика гра ІІ» quiz', () => {
  it('passes the quiz schema within the limits and is huge', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(everything.length).toBeGreaterThanOrEqual(80);
    expect(everything.length).toBeLessThanOrEqual(110);
  });

  it('runs on the autopilot without a host: nothing blocked, only the untimed millionaire is noted', () => {
    const ladder = quiz.rounds.findIndex((r) => r.type === 'ladder');
    expect(autopilotCheck(quiz)).toEqual({ blocked: [], changed: [{ code: 'untimed', rounds: [ladder] }] });
  });

  it('covers its share of the coverage matrix: round types, question types and their settings', () => {
    expect(new Set(quiz.rounds.map((r) => r.type))).toEqual(new Set(['classic', 'blitz', 'bets', 'survival', 'quest', 'puzzles', 'ladder', 'final']));
    const types = new Set<string>(everything.map((q) => q.type));
    for (const t of ['wall', 'survey', 'melody', 'bluff', 'jigsaw', 'crossword', 'sudoku', 'memory', 'clues']) expect(types, t).toContain(t);
    // Опитування гравців і «хмари слів» чекають рішення власника.
    for (const t of ['poll', 'wordcloud']) expect(types).not.toContain(t);
    expect(ofType('clues').every((q) => q.cluePace === 'timer')).toBe(true);
    expect(ofType('crossword').map((q) => q.mode)).toEqual(['full']);
    expect(ofType('sudoku').map((q) => q.level)).toEqual(['custom']);
    expect(ofType('memory').every((q) => q.pairs.some((p) => p.a.imageUrl !== undefined || p.b.imageUrl !== undefined))).toBe(true);
    expect(ofType('survey').every((q) => q.cloudId === undefined)).toBe(true);
    const final = quiz.rounds.find((r) => r.type === 'final');
    expect(final?.type === 'final' ? final.wagerMode : null).toBe('bank');
    const ladder = quiz.rounds.find((r) => r.type === 'ladder');
    expect(ladder?.type === 'ladder' ? [ladder.pick, ladder.timer] : null).toEqual(['random', false]);
    const survival = quiz.rounds.find((r) => r.type === 'survival');
    expect(survival?.type === 'survival' ? [survival.trial, survival.trials.length > 0] : null).toEqual(['question', true]);
    const blitz = quiz.rounds.find((r) => r.type === 'blitz');
    expect(blitz?.type === 'blitz' ? [blitz.check, blitz.rules.streakPlus?.step, blitz.rules.streakMinus?.step] : null).toEqual(['auto', 50, 50]);
    expect(quiz.duels?.betStake).toBeGreaterThan(0);
    // Усі картинки використано.
    expect(Object.keys(BIG2_PHOTOS).filter((k) => !used.has(k))).toEqual([]);
  });

  it('gives every question, choice phase and duel at least 25 seconds', () => {
    expect(everything.filter((q) => q.timeLimit < MIN_TIMER).map((q) => q.id)).toEqual([]);
    for (const q of ofType('bluff')) expect(q.choiceTime, q.text).toBeGreaterThanOrEqual(MIN_TIMER);
    expect(quiz.duels?.timeLimit).toBeGreaterThanOrEqual(MIN_TIMER);
  });

  it('plays every melody from a verified clip at its verified start', () => {
    const tracks = ofType('melody').map((q) => (q.track.source === 'youtube' ? [q.track.id, q.track.start] : null));
    expect(Object.fromEntries(tracks.map((t) => t ?? ['file', 0]))).toEqual(MELODIES);
    // Без звуку на інших запитаннях: музика — лише в мелодіях.
    expect(everything.filter((q) => q.audio !== undefined || q.video !== null)).toEqual([]);
  });

  it('takes «100 до 1» only from a real published poll, with the source in a comment', () => {
    expect(ofType('survey')).toHaveLength(1);
    expect(ownSources()).toContain('https://news.gallup.com/poll/12007/math-teens-favorite-school-subject.aspx');
    const [survey] = ofType('survey');
    expect(survey!.rows.map((r) => r.popularity)).toEqual([23, 13, 12, 7, 5, 5]);
  });

  it('builds a unique custom sudoku and a full crossword of words new to the seeds', () => {
    for (const q of ofType('sudoku')) expect(sudokuIssue(q.givens, q.solution)).toBeNull();
    const crosswords = ofType('crossword');
    for (const q of crosswords) {
      expect(crosswordIssue(q)).toBeNull();
      expect(q.key).toBeNull();
      for (const e of q.entries) expect(key(e.clue)).not.toContain(key(e.answer));
    }
    const others = otherSources().join('\n').toLocaleLowerCase('uk');
    const words = crosswords.flatMap((q) => q.entries.map((e) => e.answer));
    expect(words.filter((w) => others.includes(key(w)))).toEqual([]);
  });

  it('builds jigsaws and memory cards from uploaded pictures only', () => {
    for (const q of ofType('jigsaw')) expect(q.photo).toMatch(/^\/uploads\//);
    for (const q of ofType('memory')) for (const p of q.pairs) for (const c of [p.a, p.b]) expect((c.imageUrl ?? '/uploads/').startsWith('/uploads/')).toBe(true);
  });

  it('gives the millionaire four options on every step', () => {
    const round = quiz.rounds.find((r) => r.type === 'ladder');
    for (const q of round?.type === 'ladder' ? round.questions : []) expect(q.type === 'single' ? q.options.length : 0, q.text).toBe(4);
  });

  it('has a fair mix of true and false in yes/no questions', () => {
    const bools = ofType('boolean');
    expect(bools.length).toBeGreaterThanOrEqual(8);
    const trueCount = bools.filter((q) => q.correct).length;
    expect(trueCount).toBeGreaterThanOrEqual(Math.ceil(bools.length * 0.35));
    expect(trueCount).toBeLessThanOrEqual(Math.floor(bools.length * 0.65));
  });

  it('leaks no answer into its question', () => {
    const norm = (s: string) => key(s).replace(/[«»"'.,!?]/g, '');
    const leaks: string[] = [];
    // Справи «хто бреше / хто видав себе / хто вбивця»: підозрюваних неминуче названо в умові.
    const named = ['Справа про розбиту вазу', 'Поліція повідомила', 'Справа «Дощова ніч»'];
    for (const q of everything) {
      if (named.some((p) => q.text.startsWith(p))) continue;
      const where = norm(`${q.text} ${q.hint ?? ''} ${q.type === 'clues' ? q.clues.join(' ') : ''}`);
      const answers =
        q.type === 'single'
          ? [q.options.find((o) => o.id === q.correctId)?.text ?? '']
          : q.type === 'text' || q.type === 'clues' || q.type === 'melody' || q.type === 'bluff'
            ? q.accepted
            : [];
      for (const a of answers) if (norm(a).length >= 3 && !/^\d+$/.test(norm(a)) && where.includes(norm(a))) leaks.push(`${q.id}: ${a}`);
    }
    for (const q of duelQuestions) for (const a of q.accepted) if (norm(a).length >= 3 && norm(q.text).includes(norm(a))) leaks.push(`${q.id}: ${a}`);
    expect(leaks).toEqual([]);
    // Код квесту не звучить у жодному тексті раунду.
    const quest = quiz.rounds.find((r) => r.type === 'quest');
    const questText = answerKey(JSON.stringify(quest?.type === 'quest' ? [quest.prompt, quest.questions] : []));
    expect(questText.includes(answerKey(quest?.type === 'quest' ? quest.code : 'x'))).toBe(false);
  });

  it('has no duplicate question texts, here or in other seed quizzes', () => {
    const texts = [...everything.map((q) => key(q.text)), ...duelQuestions.map((q) => key(q.text))];
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    const others = key(otherSources().join('\n'));
    expect(texts.filter((text) => others.includes(text))).toEqual([]);
  });

  it('contains nothing related to russia or the Soviet period', () => {
    const text = JSON.stringify(quiz);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
