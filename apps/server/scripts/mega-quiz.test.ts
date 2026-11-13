import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITS, allSpares, crosswordIssue, fitsLetters, ladderKey, letterSet, questionPrice, questionsOf, quizSchema, roundTrials, sudokuIssue, type Question, type Quiz } from '@quiz/shared';
import { loadNouns } from '../src/wordladder/nouns';
import { MEGA_FILES, MEGA_IMAGES, megaQuiz } from './mega-quiz';

const MIN_TIMER = 25;
const photoUrl = (k: string) => `/uploads/${k.toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(16, '0').slice(0, 64)}.jpg`;
const keys: string[] = [...MEGA_FILES, ...Object.keys(MEGA_IMAGES)];
const used = new Set<string>();
const quiz = megaQuiz((k) => {
  if (!keys.includes(k)) throw new Error(`Unknown picture ${k}`);
  used.add(k);
  return photoUrl(k);
});

const key = (text: string) => text.trim().toLocaleLowerCase('uk');
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
const everything = [...played(quiz), ...allSpares(quiz)];
const ofType = <T extends Question['type']>(type: T) => played(quiz).filter((q): q is Extract<Question, { type: T }> => q.type === type);

const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград', 'ломоносов',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris', 'mendeleev',
];

describe('the «Великий шкільний марафон» quiz', () => {
  it('passes the quiz schema within the limits and is huge', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(played(quiz).length).toBeGreaterThanOrEqual(120);
  });

  it('uses every picture key it declares', () => {
    expect(keys.filter((k) => !used.has(k))).toEqual([]);
  });

  it('covers the new rounds and question types, and no polls or word clouds', () => {
    const rounds = new Set<string>(quiz.rounds.map((r) => r.type));
    for (const type of ['classic', 'quest', 'board', 'blitz', 'ladder', 'puzzles', 'bets', 'auction', 'final']) expect(rounds).toContain(type);
    const types = new Set<string>(played(quiz).map((q) => q.type));
    const wanted = ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'wordladder', 'sort', 'slider', 'clues', 'pin', 'wall'];
    wanted.push('timedlist', 'letterwords', 'moreless', 'drawing', 'sudoku', 'crossword', 'jigsaw', 'spotdiff', 'memory', 'melody', 'bluff');
    expect(wanted.filter((t) => !types.has(t))).toEqual([]);
    for (const type of ['poll', 'wordcloud']) expect(types).not.toContain(type);
    // Картинки і в запитаннях, і у варіантах.
    expect(played(quiz).filter((q) => q.imageUrl !== null).length).toBeGreaterThanOrEqual(7);
    expect(played(quiz).filter((q) => (q.type === 'single' || q.type === 'multi') && q.options.some((o) => o.imageUrl)).length).toBeGreaterThanOrEqual(5);
  });

  it('mentions nothing related to russia', () => {
    const all = JSON.stringify(quiz).toLocaleLowerCase('uk').replace(/натуральн|відокремл|росінант/g, '');
    expect(BANNED.filter((b) => all.includes(b))).toEqual([]);
  });

  it('gives every question, spare, blitz window and duel at least 25 seconds', () => {
    expect(everything.filter((q) => q.timeLimit < MIN_TIMER).map((q) => `${q.id} ${q.timeLimit}`)).toEqual([]);
    for (const q of everything) if (q.type === 'bluff') expect(q.choiceTime).toBeGreaterThanOrEqual(MIN_TIMER);
    for (const r of quiz.rounds) if (r.type === 'blitz') expect(r.answerWindow ?? MIN_TIMER).toBeGreaterThanOrEqual(MIN_TIMER);
    expect(quiz.duels?.timeLimit).toBeGreaterThanOrEqual(MIN_TIMER);
  });

  it('has valid puzzles: sudoku and both crossword modes', () => {
    for (const q of ofType('sudoku')) expect(sudokuIssue(q.givens, q.solution)).toBeNull();
    const crosswords = ofType('crossword');
    expect(new Set(crosswords.map((q) => q.mode))).toEqual(new Set(['key', 'full']));
    for (const q of crosswords) {
      expect(crosswordIssue(q)).toBeNull();
      for (const e of q.entries) expect(key(e.clue)).not.toContain(key(e.answer));
    }
  });

  it('builds every word ladder from dictionary nouns', () => {
    const nouns = loadNouns();
    for (const l of ofType('wordladder')) {
      const missing = l.path.filter((w) => {
        const k = ladderKey(w);
        return k === null || !nouns.isNoun(k);
      });
      expect(missing).toEqual([]);
      expect(l.path.length - 1).toBeLessThanOrEqual(l.maxSteps);
    }
  });

  it('gives every letter set enough dictionary words', () => {
    const nouns = [...loadNouns().keys()];
    for (const q of ofType('letterwords')) {
      const set = q.set.kind === 'fixed' ? letterSet(q.set.letters) : null;
      if (set === null) continue;
      const fit = nouns.filter((w) => fitsLetters(w, set));
      if (q.goal === 'most') expect(fit.length).toBeGreaterThanOrEqual(30);
      else expect(fit.some((w) => w.replaceAll('\'', '').length >= 7)).toBe(true);
    }
  });

  it('has a fair mix of true and false in yes/no questions', () => {
    const bools = everything.filter((q): q is Extract<Question, { type: 'boolean' }> => q.type === 'boolean');
    const trueCount = bools.filter((q) => q.correct).length;
    expect(trueCount).toBeGreaterThanOrEqual(Math.ceil(bools.length * 0.35));
    expect(trueCount).toBeLessThanOrEqual(Math.floor(bools.length * 0.65));
  });

  it('marks the board with one random ×2/×3 per category and prices 100…500', () => {
    for (const r of quiz.rounds) {
      if (r.type !== 'board') continue;
      expect(new Set(r.categories.map((c) => c.cells.findIndex((x) => x.mark !== 'none'))).size).toBeGreaterThan(1);
      for (const c of r.categories) {
        expect(c.cells.filter((x) => x.mark !== 'none')).toHaveLength(1);
        expect(c.cells.map((x) => questionPrice(x.question))).toEqual([100, 200, 300, 400, 500]);
      }
    }
  });

  it('leaks no answer into its question', () => {
    const norm = (s: string) => s.toLocaleLowerCase('uk').replace(/[«»"’'ʼ.,!?]/g, '');
    const leaks: string[] = [];
    for (const q of everything) {
      const where = norm(`${q.text} ${q.hint ?? ''} ${q.type === 'clues' ? q.clues.join(' ') : ''}`);
      const answers =
        q.type === 'single'
          ? [q.options.find((o) => o.id === q.correctId)?.text ?? '']
          : q.type === 'text' || q.type === 'clues' || q.type === 'drawing' || q.type === 'melody'
            ? q.accepted
            : q.type === 'timedlist'
              ? q.items.flatMap((i) => [i.text, ...i.accepted])
              : q.type === 'wordladder'
                ? q.path.slice(1, -1)
                : [];
      for (const a of answers) if (norm(a).length >= 3 && !/^\d+$/.test(norm(a)) && where.includes(norm(a))) leaks.push(`${q.id}: ${a}`);
    }
    for (const c of quiz.duels?.categories ?? [])
      for (const d of c.questions) for (const a of d.accepted) if (norm(a).length >= 3 && norm(d.text).includes(norm(a))) leaks.push(`duel ${d.text}: ${a}`);
    expect(leaks).toEqual([]);
  });

  it('has no duplicate question texts, here or in other seed quizzes', () => {
    const texts = everything.map((q) => key(q.text));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    const dir = import.meta.dirname;
    const others = readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') && !f.startsWith('mega') && !f.includes('.test.'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    const duels = (quiz.duels?.categories ?? []).flatMap((c) => c.questions.map((d) => d.text));
    expect([...everything.map((q) => q.text), ...duels].filter((text) => others.includes(text))).toEqual([]);
  });
});
