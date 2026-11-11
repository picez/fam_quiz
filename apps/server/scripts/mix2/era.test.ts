import { describe, expect, it } from 'vitest';
import { questionPrice, questionSchema, type Question } from '@quiz/shared';
import { ERA } from './era';

const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris',
];

const all: Question[] = [
  ...ERA.warmup,
  ...ERA.blitz,
  ...ERA.board.cells.map((c) => c.question),
  ERA.board.spare,
  ...ERA.retro,
  ERA.bets,
  ERA.auction,
  ERA.spare,
];

describe('mix2 era theme', () => {
  it('passes the question schema', () => {
    all.forEach((q, i) => {
      const r = questionSchema.safeParse({ ...q, id: `era-${i}` });
      expect(r.success ? [] : r.error.issues, q.text).toEqual([]);
    });
  });

  it('has timers of at least 25 s', () => {
    for (const q of all) expect(q.timeLimit, q.text).toBeGreaterThanOrEqual(25);
  });

  it('has no banned roots', () => {
    for (const q of all) {
      const s = JSON.stringify(q).toLowerCase();
      for (const b of BANNED) expect(s.includes(b), `${b} in ${q.text}`).toBe(false);
    }
  });

  it('has exact slot counts and kinds', () => {
    expect(ERA.warmup).toHaveLength(2);
    expect(ERA.blitz).toHaveLength(1);
    expect(ERA.blitz[0].type).toBe('boolean');
    expect(ERA.retro).toHaveLength(12);
    const types = ERA.retro.map((q) => q.type);
    expect(types.filter((t) => t === 'drawing')).toHaveLength(3);
    expect(ERA.retro.filter((q) => q.audio?.source === 'youtube')).toHaveLength(4);
    for (const t of ['timedlist', 'order', 'moreless', 'multi', 'clues']) expect(types).toContain(t);
    expect(ERA.bets.points).toBe(0);
    expect(ERA.bets.betsCut).toBeGreaterThan(0);
    expect(ERA.auction.points).toBe(1000);
    expect(ERA.auction.betsCut).toBeGreaterThan(0);
    expect(['single', 'boolean', 'numeric']).toContain(ERA.spare.type);
    expect(ERA.spare.audio ?? null).toBeNull();
  });

  it('keeps points in range', () => {
    for (const q of ERA.warmup) expect(q.points).toBeGreaterThanOrEqual(500), expect(q.points).toBeLessThanOrEqual(1000);
    expect(ERA.blitz[0].points).toBeGreaterThanOrEqual(500);
    expect(ERA.blitz[0].points).toBeLessThanOrEqual(700);
    expect(ERA.spare.points).toBeGreaterThanOrEqual(500);
    expect(ERA.spare.points).toBeLessThanOrEqual(1000);
    expect(ERA.board.spare.points).toBe(200);
  });

  it('has board prices exactly 100–600', () => {
    expect(ERA.board.cells.map((c) => questionPrice(c.question))).toEqual([100, 200, 300, 400, 500, 600]);
  });
});
