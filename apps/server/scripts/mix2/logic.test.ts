import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fitsLetters, generateSudoku, ladderKey, letterSet, questionPrice, questionSchema, sudokuIssue, type Question } from '@quiz/shared';
import { loadNouns } from '../../src/wordladder/nouns';
import { LOGIC } from './logic';

const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris',
];

const all: Question[] = [...LOGIC.warmup, ...LOGIC.mind, ...LOGIC.blitz, ...LOGIC.board.cells.map((c) => c.question), LOGIC.board.spare, LOGIC.bets, LOGIC.auction, ...LOGIC.puzzles, LOGIC.spare];
const norm = (s: string) => s.toLocaleLowerCase('uk').replace(/[«»"’'ʼ.,!?:]/g, '');

describe('mix2 logic theme', () => {
  it('passes the question schema', () => {
    all.forEach((q, i) => {
      const r = questionSchema.safeParse({ ...q, id: `logic-${i}` });
      expect(r.success ? [] : r.error.issues, q.text).toEqual([]);
    });
  });

  it('has timers of at least 25 s', () => {
    for (const q of all) expect(q.timeLimit, q.text).toBeGreaterThanOrEqual(25);
  });

  it('has no banned roots', () => {
    for (const q of all) {
      const s = JSON.stringify(q).toLocaleLowerCase('uk');
      for (const b of BANNED) expect(s.includes(b), `${b} in ${q.text}`).toBe(false);
    }
  });

  it('has exact slot counts and kinds', () => {
    expect(LOGIC.warmup).toHaveLength(2);
    expect(LOGIC.mind).toHaveLength(5);
    const types = LOGIC.mind.map((q) => q.type);
    expect(types.filter((t) => t === 'wordladder')).toHaveLength(1);
    expect(types.filter((t) => t === 'letterwords')).toHaveLength(1);
    expect(types.some((t) => t === 'sort' || t === 'order')).toBe(true);
    expect(LOGIC.blitz).toHaveLength(1);
    expect(LOGIC.blitz[0].type).toBe('boolean');
    expect(LOGIC.bets.points).toBe(0);
    expect(LOGIC.bets.betsCut).toBeGreaterThan(0);
    expect(LOGIC.bets.text.startsWith('Логіка: ')).toBe(true);
    expect(LOGIC.auction.points).toBe(1000);
    expect(LOGIC.auction.betsCut).toBeGreaterThan(0);
    expect(LOGIC.puzzles.map((q) => [q.type, q.points])).toEqual([['sudoku', 1000], ['sudoku', 1500]]);
    const sp = LOGIC.board.spare.points;
    expect(sp >= 200 && sp <= 300).toBe(true);
  });

  it('has board prices exactly 100–600', () => {
    expect(LOGIC.board.cells.map((c) => questionPrice(c.question))).toEqual([100, 200, 300, 400, 500, 600]);
  });

  it('builds the sudoku with the shared generator and avoids yesterday seeds', () => {
    const levels = LOGIC.puzzles.map((q) => (q.type === 'sudoku' ? q.level : null));
    expect(levels).toEqual(['easy', 'hard']);
    for (const q of LOGIC.puzzles) {
      if (q.type !== 'sudoku' || q.level === 'custom') throw new Error('not a generated sudoku');
      expect([2811, 2812]).not.toContain(q.seed);
      expect({ givens: q.givens, solution: q.solution }).toEqual(generateSudoku(q.seed ?? 0, q.level));
      expect(sudokuIssue(q.givens, q.solution)).toBeNull();
    }
  });

  it('builds the word ladder from dictionary nouns', () => {
    const nouns = loadNouns();
    for (const l of all) {
      if (l.type !== 'wordladder') continue;
      expect(l.path.filter((w) => { const k = ladderKey(w); return k === null || !nouns.isNoun(k); })).toEqual([]);
      for (let i = 1; i < l.path.length; i++) {
        const [a, b] = [l.path[i - 1], l.path[i]];
        expect(a.length).toBe(b.length);
        expect([...a].filter((ch, j) => ch !== b[j])).toHaveLength(1);
      }
      expect(l.path.length - 1).toBeLessThanOrEqual(l.maxSteps);
    }
  });

  it('gives the letter set at least 30 nouns and 9+ letters', () => {
    const nouns = [...loadNouns().keys()];
    for (const q of all) {
      if (q.type !== 'letterwords' || q.set.kind !== 'fixed') continue;
      expect(q.set.letters.length).toBeGreaterThanOrEqual(9);
      const set = letterSet(q.set.letters) ?? [];
      expect(nouns.filter((w) => fitsLetters(w, set)).length).toBeGreaterThanOrEqual(30);
    }
  });

  it('leaks no answer and repeats no text from other seed quizzes', () => {
    for (const q of all) {
      const answers = q.type === 'single' ? [q.options.find((o) => o.id === q.correctId)?.text ?? ''] : q.type === 'text' ? q.accepted : q.type === 'wordladder' ? q.path.slice(1, -1) : [];
      for (const a of answers) if (norm(a).length >= 3 && !/^\d+$/.test(norm(a))) expect(norm(q.text).includes(norm(a)), `${q.text}: ${a}`).toBe(false);
    }
    const dir = join(import.meta.dirname, '..');
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts') && !f.includes('mix2'));
    const others = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    expect(all.map((q) => q.text).filter((t) => others.includes(t))).toEqual([]);
  });
});
