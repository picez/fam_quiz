import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  allSpares,
  answerKey,
  autopilotCheck,
  crosswordIssue,
  fitsLetters,
  generateSudoku,
  ladderKey,
  letterSet,
  questionPrice,
  questionsOf,
  quizSchema,
  roundTrials,
  sudokuIssue,
  thinkWordsIssue,
  wordIn,
  wordleKey,
  wordleLeak,
  wordleWordIssue,
  type Question,
  type Quiz,
} from '@quiz/shared';
import { loadNouns } from '../src/wordladder/nouns';
import { big1Quiz } from './big1-quiz';
import { MIN_TIMER } from './mix-quiz';

const quiz = big1Quiz();
/** Ключ тексту: малими, апострофи ’ ʼ ‘ ` — як «'», пробіли стиснуто. */
const key = (text: string) => text.trim().toLocaleLowerCase('uk').replace(/[’ʼ‘`]/g, "'").replace(/\s+/g, ' ');
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
const everything = [...played(quiz), ...allSpares(quiz)];
const ofType = <T extends Question['type']>(type: T) => everything.filter((q): q is Extract<Question, { type: T }> => q.type === type);

/** Як у school3-quiz.test.ts: нічого, пов'язаного з росією. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград', 'мазеп', 'полтавськ', 'ельбрус',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris',
];

/** Тексти інших сідів: усі .ts у scripts і підтеках, крім цього сіда й тестів. */
const otherSources = (): string[] => {
  const dir = import.meta.dirname;
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.startsWith('big1') && !f.includes('.test.'))
    .map((f) => readFileSync(join(dir, f), 'utf8'));
};

describe('the big «Велика гра І» quiz', () => {
  it('passes the quiz schema within the limits and is huge', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(played(quiz).length).toBeGreaterThanOrEqual(80);
    expect(played(quiz).length).toBeLessThanOrEqual(110);
  });

  it('runs on the autopilot without a host: nothing blocked, nothing changed', () => {
    expect(autopilotCheck(quiz)).toEqual({ blocked: [], changed: [] });
  });

  it('covers its share of the coverage matrix: eight round types and 24 question types with their settings', () => {
    expect(new Set(quiz.rounds.map((r) => r.type))).toEqual(new Set(['classic', 'board', 'puzzles', 'think', 'wipeout', 'truth', 'ladder', 'final']));
    const types = new Set<string>(everything.map((q) => q.type));
    const wanted = [
      'single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'wordladder', 'sort', 'slider', 'clues', 'pin',
      'timedlist', 'letterwords', 'wordle', 'moreless', 'drawing', 'sudoku', 'crossword', 'memory', 'thinkalike', 'spy', 'think',
    ];
    expect(wanted.filter((t) => !types.has(t))).toEqual([]);
    // Без опитувань гравців і без «100 до 1» (вони — у big3/big2 за матрицею).
    for (const type of ['poll', 'wordcloud', 'survey']) expect(types).not.toContain(type);
    expect(ofType('clues').some((q) => q.cluePace === 'self')).toBe(true);
    expect(ofType('numeric').filter((q) => q.noOvershoot === true).length).toBeGreaterThanOrEqual(3);
    for (const q of ofType('moreless')) {
      expect(q.step, q.text).toBeGreaterThan(0);
      q.pairs.slice(1).forEach((p, i) => expect(p.points - q.pairs[i]!.points, q.text).toBe(q.step));
    }
    expect(ofType('spy').some((q) => q.spyHint !== undefined)).toBe(true);
    expect(ofType('spy').some((q) => q.spyHint === undefined)).toBe(true);
    const truth = quiz.rounds.find((r) => r.type === 'truth');
    expect(truth?.type === 'truth' ? truth.fakes?.length : 0).toBeGreaterThanOrEqual(3);
    // «Шпигун» не працює в командній грі.
    expect(quiz.settings.teams).toBeUndefined();
  });

  it('gives every question, spare, vote and truth round at least 25 seconds', () => {
    expect(everything.filter((q) => q.timeLimit < MIN_TIMER).map((q) => q.id)).toEqual([]);
    for (const q of ofType('spy')) expect(q.voteTime, q.text).toBeGreaterThanOrEqual(MIN_TIMER);
    for (const r of quiz.rounds) if (r.type === 'truth') expect(r.timeLimit).toBeGreaterThanOrEqual(MIN_TIMER);
  });

  it('builds the sudoku and the key crossword with the shared editor helpers; crossword words are new', () => {
    for (const q of ofType('sudoku')) {
      if (q.level !== 'custom') expect({ givens: q.givens, solution: q.solution }).toEqual(generateSudoku(q.seed ?? 0, q.level));
      expect(sudokuIssue(q.givens, q.solution)).toBeNull();
    }
    const crosswords = ofType('crossword');
    expect(crosswords.map((q) => q.mode)).toEqual(['key']);
    for (const q of crosswords) {
      expect(crosswordIssue(q)).toBeNull();
      for (const e of q.entries) expect(key(e.clue)).not.toContain(key(e.answer));
    }
    const others = otherSources().join('\n').toLocaleLowerCase('uk');
    const words = crosswords.flatMap((q) => q.entries.map((e) => e.answer));
    expect(words.filter((w) => others.includes(key(w)))).toEqual([]);
  });

  it('builds word ladders, wordle words and the letter set from dictionary nouns', () => {
    const nouns = loadNouns();
    for (const l of ofType('wordladder')) {
      expect(l.path.filter((w) => {
        const k = ladderKey(w);
        return k === null || !nouns.isNoun(k);
      })).toEqual([]);
      expect(l.path.length - 1).toBeLessThanOrEqual(l.maxSteps);
    }
    for (const q of ofType('wordle')) {
      expect(nouns.isNoun(wordleKey(q.word)!), q.word).toBe(true);
      expect(wordleWordIssue(q.word), q.word).toBeNull();
      expect(wordleLeak(q.word, q.text), q.word).toBe(false);
    }
    const all = [...nouns.keys()];
    for (const q of ofType('letterwords')) {
      const set = q.set.kind === 'fixed' ? letterSet(q.set.letters) : null;
      expect(set).not.toBeNull();
      expect(all.filter((w) => fitsLetters(w, set ?? [])).length).toBeGreaterThanOrEqual(30);
    }
  });

  it('gives every «Думай інакше» topic three host words, so the autopilot can run it', () => {
    for (const q of ofType('think')) {
      expect(q.words, q.text).toHaveLength(3);
      expect(thinkWordsIssue(q.words), q.text).toBeNull();
      expect(q.points).toBe(0);
    }
  });

  it('gives the millionaire four options and a host hint on every step', () => {
    const round = quiz.rounds.find((r) => r.type === 'ladder');
    expect(round?.type).toBe('ladder');
    for (const q of round?.type === 'ladder' ? round.questions : []) {
      expect(q.type === 'single' ? q.options.length : 0, q.text).toBe(4);
      expect(q.hint, q.text).toBeDefined();
    }
  });

  it('has a fair mix of true and false in yes/no questions', () => {
    const bools = ofType('boolean');
    expect(bools.length).toBeGreaterThanOrEqual(8);
    const trueCount = bools.filter((q) => q.correct).length;
    expect(trueCount).toBeGreaterThanOrEqual(Math.ceil(bools.length * 0.35));
    expect(trueCount).toBeLessThanOrEqual(Math.floor(bools.length * 0.65));
  });

  it('marks the board with random ×2/×3 and prices that grow from 100 to 500', () => {
    for (const r of quiz.rounds) {
      if (r.type !== 'board') continue;
      const marked = r.categories.map((c) => c.cells.findIndex((x) => x.mark !== 'none'));
      expect(new Set(marked).size).toBeGreaterThan(2);
      expect(new Set(r.categories.flatMap((c) => c.cells.filter((x) => x.mark !== 'none').map((x) => x.mark))).size).toBe(2);
      expect(r.categories.some((c) => c.cells.some((x) => x.kind === 'blitz'))).toBe(true);
      for (const c of r.categories) {
        expect(c.cells.filter((x) => x.mark !== 'none')).toHaveLength(1);
        expect(c.cells.map((x) => questionPrice(x.question))).toEqual([100, 200, 300, 400, 500]);
      }
    }
  });

  it('leaks no answer into its question, and no spy or wordle word into any text of the quiz', () => {
    const norm = (s: string) => key(s).replace(/[«»"'.,!?]/g, '');
    const leaks: string[] = [];
    // Справи «хто бреше / хто винен»: підозрюваних неминуче названо в умові.
    const named = ['Пана Грея', 'Ігор, Петро й Сашко', 'Фінальна справа'];
    for (const q of everything) {
      if (named.some((p) => q.text.startsWith(p))) continue;
      const where = norm(`${q.text} ${q.hint ?? ''} ${q.type === 'clues' ? q.clues.join(' ') : ''}`);
      const answers =
        q.type === 'single'
          ? [q.options.find((o) => o.id === q.correctId)?.text ?? '']
          : q.type === 'text' || q.type === 'clues'
            ? q.accepted
            : [];
      for (const a of answers) if (norm(a).length >= 3 && !/^\d+$/.test(norm(a)) && where.includes(norm(a))) leaks.push(`${q.id}: ${a}`);
      if (q.type === 'moreless')
        for (const p of q.pairs) for (const v of [p.a.value, p.b.value]) if (norm(`${q.text} ${p.prompt} ${p.a.text} ${p.b.text}`).includes(norm(v))) leaks.push(`${q.id} ${p.id}: ${v}`);
    }
    expect(leaks).toEqual([]);
    const truth = quiz.rounds.flatMap((r) => (r.type === 'truth' ? (r.fakes ?? []) : []));
    const texts = answerKey(
      JSON.stringify({
        title: quiz.title,
        description: quiz.description,
        rounds: quiz.rounds.map((r) => [r.title, r.description]),
        questions: everything.map((q) => [
          q.text,
          q.hint ?? '',
          q.type === 'single' || q.type === 'multi' ? q.options.map((o) => o.text) : [],
          q.type === 'clues' ? q.clues : [],
          q.type === 'chain' ? q.words : [],
          q.type === 'memory' ? q.pairs.map((p) => [p.a.text, p.b.text]) : [],
          q.type === 'crossword' ? q.entries.map((e) => e.clue) : [],
        ]),
        truth,
      }),
    );
    for (const q of ofType('spy')) {
      const word = q.accepted[0]!;
      expect(texts.includes(answerKey(word)), word).toBe(false);
      if (q.spyHint !== undefined) {
        for (const w of q.accepted) expect(wordIn(q.spyHint, w), `${q.spyHint} / ${w}`).toBe(false);
        expect(answerKey(q.spyHint).includes(answerKey(word).slice(0, 5)), `${q.spyHint} / ${word}`).toBe(false);
      }
    }
    for (const q of ofType('wordle')) expect(texts.includes(answerKey(q.word)), q.word).toBe(false);
  });

  it('has no duplicate question texts or spy hints, here or in other seed quizzes', () => {
    const texts = everything.map((q) => key(q.text));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    const others = key(otherSources().join('\n'));
    expect(texts.filter((text) => others.includes(text))).toEqual([]);
    const hints = ofType('spy').flatMap((q) => (q.spyHint === undefined ? [] : [key(q.spyHint)]));
    expect(hints.filter((hint) => others.includes(hint))).toEqual([]);
    const fakes = quiz.rounds.flatMap((r) => (r.type === 'truth' ? (r.fakes ?? []) : [])).map(key);
    expect(fakes.filter((f) => others.includes(f))).toEqual([]);
  });

  it('contains nothing related to russia or the Soviet period', () => {
    const text = JSON.stringify(quiz);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
