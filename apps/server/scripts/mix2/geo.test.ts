import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crosswordIssue, duelQuestionSchema, questionPrice, questionSchema, type Question } from '@quiz/shared';
import { GEO_PHOTOS, geo } from './geo';
import { PIN_PLACES } from './kit';

const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris',
];
/** Слова вчорашніх кросвордів «Сім доріг», записані задом наперед: тест mix-quiz шукає їх у всіх інших файлах, тож прямо їх тут не пишемо. */
const YESTERDAY = ['навіл', 'натуб', 'аднагу', 'йавгарап', 'галепіхра', 'нахраб', 'віртсовіп', 'камуч', 'акамадйаг', 'кучнуб', 'ялліпирт', 'ьлопорка', 'ноігел', 'суріпап'].map((w) => [...w].reverse().join(''));

// Ключі фото мусять пройти IMAGE_URL (/uploads/[a-z0-9]{16,64}.jpg), тож доповнюємо їх нулями; оригінальні ключі збираємо.
const used: string[] = [];
const photos = (k: string) => {
  used.push(k);
  return `/uploads/${k.padEnd(16, '0')}.jpg`;
};
const G = geo(photos);
const all: Question[] = [...G.warmup, G.warmupJigsaw, ...G.blitz, ...G.board.cells.map((c) => c.question), G.board.spare, ...G.world, G.bets, G.auction, ...G.puzzles, G.spare];
const lower = (s: string) => s.toLocaleLowerCase('uk');
const norm = (s: string) => lower(s).replace(/[«»"’'ʼ.,!?]/g, '');

describe('mix2 geo theme', () => {
  it('passes the question schema, including the duel questions', () => {
    all.forEach((q, i) => {
      const r = questionSchema.safeParse({ ...q, id: `geo-${i}` });
      expect(r.success ? [] : r.error.issues, q.text).toEqual([]);
    });
    for (const d of G.duel.questions) expect(duelQuestionSchema.safeParse(d).success, d.text).toBe(true);
  });

  it('has timers of at least 25 s', () => {
    for (const q of all) expect(q.timeLimit, q.text).toBeGreaterThanOrEqual(25);
  });

  it('has no banned roots and no word of yesterday’s crosswords', () => {
    const s = lower(JSON.stringify(G) + readFileSync(join(import.meta.dirname, 'geo.ts'), 'utf8'));
    expect(BANNED.filter((b) => s.includes(b))).toEqual([]);
    expect(YESTERDAY.filter((w) => s.includes(w))).toEqual([]);
  });

  it('has exact slot counts and kinds', () => {
    expect(G.warmup).toHaveLength(2);
    expect(G.warmupJigsaw.type).toBe('jigsaw');
    expect(G.blitz.map((q) => q.type)).toEqual(['boolean']);
    expect(G.world).toHaveLength(6);
    expect(G.world.filter((q) => q.type === 'pin').length).toBeGreaterThanOrEqual(2);
    expect(G.bets.points).toBe(0);
    expect(G.bets.betsCut).toBeGreaterThan(0);
    expect(G.bets.text.startsWith('Географія: ')).toBe(true);
    expect(G.auction.points).toBe(1000);
    expect(G.auction.betsCut).toBeGreaterThan(0);
    expect(G.puzzles.map((q) => q.type)).toEqual(['crossword', 'jigsaw']);
    expect(['single', 'boolean', 'numeric', 'text']).toContain(G.spare.type);
    expect(G.duel.questions).toHaveLength(5);
  });

  it('has board prices exactly 100–600 with a pin and a list or more-or-less', () => {
    expect(G.board.cells.map((c) => questionPrice(c.question))).toEqual([100, 200, 300, 400, 500, 600]);
    const types = G.board.cells.map((c) => c.question.type);
    expect(types.filter((t) => t === 'pin')).toHaveLength(1);
    expect(types.filter((t) => t === 'timedlist' || t === 'moreless')).toHaveLength(1);
    expect(questionPrice(G.board.spare)).toBeGreaterThanOrEqual(200);
    expect(questionPrice(G.board.spare)).toBeLessThanOrEqual(300);
  });

  it('puts every pin on a built-in map at a known place', () => {
    for (const q of all) {
      if (q.type !== 'pin') continue;
      expect(q.map, q.text).not.toBeNull();
      const places = Object.values(PIN_PLACES[q.map as keyof typeof PIN_PLACES]);
      expect(places.some((p) => p.x === q.target.x && p.y === q.target.y), q.text).toBe(true);
    }
  });

  it('builds the jigsaws from known photos with the requested sizes', () => {
    expect(new Set(used)).toEqual(new Set(Object.keys(GEO_PHOTOS)));
    const [warm, big] = [G.warmupJigsaw, G.puzzles[1]];
    if (warm.type !== 'jigsaw' || big.type !== 'jigsaw') throw new Error('jigsaw expected');
    expect(warm.rows * warm.cols).toBe(12);
    expect([warm.points, warm.timeLimit]).toEqual([1000, 120]);
    expect(big.rows * big.cols).toBe(20);
    expect([big.points, big.timeLimit]).toEqual([1500, 180]);
  });

  it('lays out the key crossword with fresh words and clues that do not name them', () => {
    const cw = G.puzzles[0];
    if (cw.type !== 'crossword') throw new Error('crossword expected');
    expect(crosswordIssue(cw)).toBeNull();
    expect(cw.mode).toBe('key');
    expect(cw.entries.length).toBeGreaterThanOrEqual(6);
    expect(cw.entries.length).toBeLessThanOrEqual(8);
    expect(cw.points).toBe(1500);
    for (const e of cw.entries) expect(lower(e.clue)).not.toContain(lower(e.answer));
    const dir = join(import.meta.dirname, '..');
    const others = readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') && !/mix2[\\/](geo|hist)(\.test)?\.ts$/.test(f))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n')
      .toLocaleLowerCase('uk');
    expect(cw.entries.map((e) => lower(e.answer)).filter((w) => others.includes(w))).toEqual([]);
  });

  it('leaks no answer into its question text', () => {
    const leaks: string[] = [];
    for (const q of all) {
      const answers = q.type === 'single' ? [q.options.find((o) => o.id === q.correctId)?.text ?? ''] : q.type === 'text' ? q.accepted : [];
      for (const a of answers) if (norm(a).length >= 3 && norm(q.text).includes(norm(a))) leaks.push(`${q.text}: ${a}`);
      if (q.type === 'moreless') for (const p of q.pairs) for (const v of [p.a.value, p.b.value]) if (norm(`${q.text} ${p.prompt} ${p.a.text} ${p.b.text}`).includes(norm(v))) leaks.push(`${p.prompt}: ${v}`);
    }
    for (const d of G.duel.questions) for (const a of d.accepted) if (norm(d.text).includes(norm(a))) leaks.push(`${d.text}: ${a}`);
    expect(leaks).toEqual([]);
  });
});
