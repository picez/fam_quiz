import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { duelCategorySchema, questionPrice, questionSchema, type Question } from '@quiz/shared';
import { PSY } from './psy';
import { TF } from './tf';

const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris',
];

const tf: Question[] = [...TF.warmup, ...TF.blitz, ...TF.board.cells.map((c) => c.question), TF.board.spare, TF.bets, TF.auction, TF.spare];
const psy: Question[] = [...PSY.warmup, ...PSY.mind, ...PSY.blitz, ...PSY.board.cells.map((c) => c.question), PSY.board.spare, PSY.bets, PSY.auction, PSY.spare];
const all = [...tf, ...psy];
const norm = (s: string) => s.toLocaleLowerCase('uk').replace(/[«»"’'ʼ.,!?]/g, '');

describe('mix2 tf + psy themes', () => {
  it('passes the question and duel schemas', () => {
    all.forEach((q, i) => {
      const r = questionSchema.safeParse({ ...q, id: `q-${i}` });
      expect(r.success ? [] : r.error.issues, q.text).toEqual([]);
    });
    const d = duelCategorySchema.safeParse(PSY.duel);
    expect(d.success ? [] : d.error.issues).toEqual([]);
  });

  it('has timers of at least 25 s', () => {
    for (const q of all) expect(q.timeLimit, q.text).toBeGreaterThanOrEqual(25);
  });

  it('has no banned roots', () => {
    const texts = [...all.map((q) => JSON.stringify(q)), JSON.stringify(PSY.duel), readFileSync(join(import.meta.dirname, 'tf.ts'), 'utf8'), readFileSync(join(import.meta.dirname, 'psy.ts'), 'utf8')];
    for (const s of texts) for (const b of BANNED) expect(s.toLowerCase().includes(b), `${b} in ${s.slice(0, 80)}`).toBe(false);
  });

  it('has exact slot counts and kinds', () => {
    expect(TF.warmup).toHaveLength(2);
    expect(TF.blitz).toHaveLength(8);
    for (const q of TF.blitz) {
      expect(q.type).toBe('boolean');
      expect(q.points).toBeGreaterThanOrEqual(500);
      expect(q.points).toBeLessThanOrEqual(700);
    }
    const blitzTrue = TF.blitz.filter((q) => q.type === 'boolean' && q.correct).length;
    expect(blitzTrue).toBe(4);
    expect(TF.bets.points).toBe(0);
    expect(TF.bets.betsCut).toBeGreaterThan(0);
    expect(TF.bets.text.startsWith('Правда чи брехня: ')).toBe(true);
    expect(TF.auction.points).toBe(1000);
    expect(TF.auction.betsCut).toBeGreaterThan(0);

    expect(PSY.warmup).toHaveLength(2);
    expect(PSY.mind).toHaveLength(5);
    expect(new Set(PSY.mind.map((q) => q.type)).size).toBe(5);
    expect(PSY.blitz).toHaveLength(1);
    expect(PSY.blitz[0].type).toBe('boolean');
    expect(PSY.bets.points).toBe(0);
    expect(PSY.bets.betsCut).toBeGreaterThan(0);
    expect(PSY.bets.text.startsWith('Психологія: ')).toBe(true);
    expect(PSY.auction.points).toBe(1000);
    expect(PSY.auction.betsCut).toBeGreaterThan(0);
    expect(PSY.duel.questions).toHaveLength(5);

    for (const q of [...TF.warmup, ...PSY.warmup]) {
      expect(q.points).toBeGreaterThanOrEqual(500);
      expect(q.points).toBeLessThanOrEqual(1000);
    }
    for (const s of [TF.spare, PSY.spare]) {
      expect(['single', 'boolean', 'numeric']).toContain(s.type);
      expect(s.audio ?? null).toBeNull();
      expect(s.imageUrl).toBeNull();
    }
    for (const slot of [TF.board, PSY.board]) expect(slot.spare.points).toBe(200);
  });

  it('has board prices exactly 100–600', () => {
    for (const slot of [TF.board, PSY.board]) expect(slot.cells.map((c) => questionPrice(c.question))).toEqual([100, 200, 300, 400, 500, 600]);
  });

  it('keeps yes/no answers balanced', () => {
    for (const set of [tf, psy]) {
      const bools = set.filter((q): q is Extract<Question, { type: 'boolean' }> => q.type === 'boolean');
      const t = bools.filter((q) => q.correct).length;
      expect(t).toBeGreaterThanOrEqual(Math.floor(bools.length * 0.35));
      expect(t).toBeLessThanOrEqual(Math.ceil(bools.length * 0.65));
    }
  });

  it('leaks no answer into its question', () => {
    const leaks: string[] = [];
    for (const q of all) {
      const where = norm(`${q.text} ${q.type === 'clues' ? q.clues.join(' ') : ''}`);
      const answers = q.type === 'single' ? [q.options.find((o) => o.id === q.correctId)?.text ?? ''] : q.type === 'text' || q.type === 'clues' ? q.accepted : [];
      for (const a of answers) if (norm(a).length >= 3 && where.includes(norm(a))) leaks.push(`${q.text}: ${a}`);
      if (q.type === 'moreless') for (const p of q.pairs) for (const v of [p.a.value, p.b.value]) if (norm(`${q.text} ${p.prompt} ${p.a.text} ${p.b.text}`).includes(norm(v))) leaks.push(`${p.prompt}: ${v}`);
    }
    for (const d of PSY.duel.questions) for (const a of d.accepted) if (norm(d.text).includes(norm(a))) leaks.push(`duel ${d.text}: ${a}`);
    expect(leaks).toEqual([]);
  });

  it('repeats no question text from other seed quizzes', () => {
    const dir = join(import.meta.dirname, '..');
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts') && !f.includes('mix2'));
    const others = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    const texts = [...all.map((q) => q.text), ...PSY.duel.questions.map((d) => d.text)];
    expect(texts.filter((t) => others.includes(t))).toEqual([]);
    expect(texts.filter((t, i) => texts.indexOf(t) !== i)).toEqual([]);
  });
});
