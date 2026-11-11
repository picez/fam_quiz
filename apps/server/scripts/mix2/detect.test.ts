import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fitsLetters, letterSet, questionPrice, questionSchema, type Question } from '@quiz/shared';
import { loadNouns } from '../../src/wordladder/nouns';
import { DETECT } from './detect';

const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris',
];

const all: Question[] = [...DETECT.warmup, ...DETECT.mind, ...DETECT.blitz, ...DETECT.board.cells.map((c) => c.question), DETECT.board.spare, ...DETECT.auction, DETECT.spare];
const norm = (s: string) => s.toLocaleLowerCase('uk').replace(/[«»"’'ʼ.,!?:]/g, '');
// «Хто збрехав»: підозрюваних неминуче названо в умові.
const named = ['Останній шматок торта'];

describe('mix2 detect theme', () => {
  it('passes the question schema', () => {
    all.forEach((q, i) => {
      const r = questionSchema.safeParse({ ...q, id: `detect-${i}` });
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
    expect(DETECT.warmup).toHaveLength(2);
    expect(DETECT.mind).toHaveLength(5);
    const clue = DETECT.mind.find((q) => q.type === 'clues');
    expect(clue?.text.startsWith('Хто я? Детектив')).toBe(true);
    const accepted = clue?.type === 'clues' ? clue.accepted.join(' ') : '';
    for (const old of ['Коломбо', 'Марпл', 'Дюпен']) expect(accepted).not.toContain(old);
    expect(DETECT.blitz).toHaveLength(1);
    expect(DETECT.blitz[0].type).toBe('boolean');
    expect(DETECT.auction.map((q) => q.points)).toEqual([1000, 1500]);
    for (const q of DETECT.auction) {
      expect(q.betsCut).toBeGreaterThan(0);
      expect(/^(Детектив|Загадка): /.test(q.text)).toBe(true);
    }
    const sp = DETECT.board.spare.points;
    expect(sp >= 200 && sp <= 300).toBe(true);
    expect(DETECT.board.cells.filter((c) => c.answerMode === 'voice').every((c) => c.question.type === 'clues')).toBe(true);
  });

  it('has board prices exactly 100–600', () => {
    expect(DETECT.board.cells.map((c) => questionPrice(c.question))).toEqual([100, 200, 300, 400, 500, 600]);
  });

  it('gives the longest-word set a seven-letter noun', () => {
    const nouns = [...loadNouns().keys()];
    for (const q of all) {
      if (q.type !== 'letterwords' || q.set.kind !== 'fixed') continue;
      const set = letterSet(q.set.letters) ?? [];
      expect(nouns.filter((w) => fitsLetters(w, set)).some((w) => w.replaceAll("'", '').length >= 7)).toBe(true);
    }
  });

  it('leaks no answer and repeats no text from other seed quizzes', () => {
    for (const q of all) {
      if (named.some((p) => q.text.startsWith(p))) continue;
      const where = norm(`${q.text} ${q.type === 'clues' ? q.clues.join(' ') : ''}`);
      const answers = q.type === 'single' ? [q.options.find((o) => o.id === q.correctId)?.text ?? ''] : q.type === 'text' || q.type === 'clues' ? q.accepted : [];
      for (const a of answers) if (norm(a).length >= 3 && !/^\d+$/.test(norm(a))) expect(where.includes(norm(a)), `${q.text}: ${a}`).toBe(false);
    }
    const dir = join(import.meta.dirname, '..');
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts') && !f.includes('mix2'));
    const others = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    expect(all.flatMap((q) => (q.type === 'clues' ? q.clues : [q.text])).filter((t) => others.includes(t))).toEqual([]);
  });
});
