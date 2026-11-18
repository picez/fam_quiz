import { describe, expect, it } from 'vitest';
import type { ResultImageData } from './data';
import { resultFileName, resultLayout, type DrawOp } from './layout';

const measure = (font: string, text: string): number => text.length * parseInt(/(\d+)px/.exec(font)![1]!, 10) * 0.5;
const base: ResultImageData = {
  quizTitle: 'Зимова вікторина',
  date: new Date('2026-11-18T10:00:00Z'),
  podium: [{ place: 1, name: 'Оля', score: 1500 }, { place: 2, name: 'Петро', score: 900 }, { place: 3, name: 'Ася', score: 300 }],
  me: { place: 5, total: 6, score: 1200 },
  prizes: [{ place: 1, trophy: { kind: 'cup', material: 'gold' }, winners: ['Оля'] }],
  achievements: [{ id: 'sniper', nickname: 'Оля' }],
  moreAchievements: 0,
  site: 'quiz.example',
};
const texts = (ops: DrawOp[]) => ops.filter((op): op is Extract<DrawOp, { kind: 'text' }> => op.kind === 'text');
const layout = (data: Partial<ResultImageData> = {}, rtl = false) => texts(resultLayout({ ...base, ...data }, measure, rtl));

describe('resultLayout', () => {
  it('draws the blocks top to bottom', () => {
    const ops = layout();
    const order = ['title', 'date', 'podium', 'me', 'prizes', 'achievements', 'footer'];
    const seen = ops.map((op) => op.block).filter((block, index, all) => all.indexOf(block) === index);
    expect(seen).toEqual(order);
    expect(ops.some((op) => op.text === '🥇')).toBe(true);
    const footer = ops.find((op) => op.block === 'footer')!;
    expect(footer.text).toBe('Вікторина · quiz.example');
    expect(footer.y).toBe(1290);
  });

  it('a long title wraps to two lines with an ellipsis', () => {
    const quizTitle = Array.from({ length: 30 }, (_, i) => `слово${i}`).join(' ');
    const lines = layout({ quizTitle }).filter((op) => op.block === 'title');
    expect(lines).toHaveLength(2);
    expect(lines[1]!.text.endsWith('…')).toBe(true);
    for (const line of lines) expect(measure(line.font, line.text)).toBeLessThanOrEqual(936);
  });

  it('a 200 letter word without spaces is cut to the width', () => {
    const lines = layout({ quizTitle: 'я'.repeat(200) }).filter((op) => op.block === 'title');
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const line of lines) expect(measure(line.font, line.text)).toBeLessThanOrEqual(936);
    expect(lines[0]!.text.endsWith('…')).toBe(true);
  });

  it('long nicknames are cut to the row', () => {
    const rows = layout({ podium: [{ place: 1, name: 'а'.repeat(60), score: 1500 }] }).filter((op) => op.block === 'podium');
    const name = rows.find((op) => op.text.startsWith('а'))!;
    expect(name.text.endsWith('…')).toBe(true);
    const medal = rows.find((op) => op.text === '🥇')!;
    const score = rows.find((op) => op.text === '1500')!;
    const room = 936 - (Math.max(...['🥇', '🥈', '🥉'].map((m) => measure('600 52px x', m))) + 24) - (measure(score.font, '1500') + 24);
    expect(measure(name.font, name.text)).toBeLessThanOrEqual(room);
  });

  it('ties show the same medal', () => {
    const podium = [{ place: 1, name: 'a', score: 9 }, { place: 1, name: 'b', score: 9 }, { place: 3, name: 'c', score: 5 }];
    const medals = layout({ podium }).filter((op) => ['🥇', '🥈', '🥉'].includes(op.text)).map((op) => op.text);
    expect(medals).toEqual(['🥇', '🥇', '🥉']);
  });

  it('me line', () => {
    expect(layout().some((op) => op.block === 'me' && op.text === 'Моє місце: 5 з 6 · 1200')).toBe(true);
    expect(layout({ me: null }).some((op) => op.block === 'me')).toBe(false);
  });

  it('empty blocks take no space', () => {
    const ops = layout({ prizes: [], achievements: [], me: null, quizTitle: '' });
    expect(ops.some((op) => op.block === 'prizes' || op.block === 'achievements' || op.block === 'title')).toBe(false);
    expect(ops[0]!.block).toBe('date');
  });

  it('more achievements', () => {
    expect(layout({ moreAchievements: 3 }).some((op) => op.text === '+ ще 3')).toBe(true);
  });

  it('nothing goes below the footer', () => {
    const podium = [1, 2, 2, 2, 5].map((place, i) => ({ place, name: `гравець ${i}`, score: 100 - i }));
    const prizes = ([1, 2, 3] as const).map((place) => ({ place, trophy: { kind: 'cup' as const, material: 'gold' as const }, winners: ['Оля'] }));
    const achievements = (['sniper', 'first_game', 'first_win', 'host'] as const).map((id) => ({ id, nickname: 'Оля' }));
    const ops = layout({ podium, prizes, achievements, moreAchievements: 2, quizTitle: Array.from({ length: 30 }, () => 'слово').join(' ') });
    for (const op of ops.filter((item) => item.block !== 'footer')) expect(op.y).toBeLessThanOrEqual(1350 - 120);
    const blocks = new Set(ops.map((op) => op.block));
    // Блок або повний, або його немає: тут п'єдестал із 5 рядків, «Я» й кубки влазять, а 6 рядків досягнень — ні.
    expect(blocks.has('podium')).toBe(true);
    expect(blocks.has('me')).toBe(true);
    expect(blocks.has('prizes')).toBe(true);
    expect(ops.filter((op) => op.block === 'prizes')).toHaveLength(4);
    expect(blocks.has('achievements')).toBe(false);
  });

  it('the full phone picture keeps every block above the footer', () => {
    const prizes = ([1, 2, 3] as const).map((place) => ({ place, trophy: { kind: 'cup' as const, material: 'gold' as const }, winners: ['Оля'] }));
    const achievements = (['sniper', 'first_game', 'first_win', 'host'] as const).map((id) => ({ id, nickname: null }));
    const quizTitle = Array.from({ length: 30 }, () => 'слово').join(' ');
    const ops = layout({ quizTitle, prizes, achievements, moreAchievements: 2 });
    expect(ops.filter((op) => op.block === 'title')).toHaveLength(2);
    expect(new Set(ops.map((op) => op.block))).toEqual(new Set(['title', 'date', 'podium', 'me', 'prizes', 'achievements', 'footer']));
    expect(ops.filter((op) => op.block === 'prizes')).toHaveLength(4);
    expect(ops.filter((op) => op.block === 'achievements')).toHaveLength(6);
    for (const op of ops.filter((item) => item.block !== 'footer')) expect(op.y).toBeLessThanOrEqual(1230);
  });

  it('right to left mirrors medal rows', () => {
    const rows = layout({}, true).filter((op) => op.block === 'podium');
    const medal = rows.find((op) => op.text === '🥇')!;
    const score = rows.find((op) => op.text === '1500')!;
    expect(medal.x).toBeGreaterThan(score.x);
    expect(medal.align).toBe('right');
    expect(score.align).toBe('left');
  });

  it('names start at one column in every podium row, left to right and right to left', () => {
    const podium = [{ place: 1, name: 'Оля', score: 1500 }, { place: 2, name: 'Петро', score: 900 }, { place: 3, name: 'Іра', score: 300 }];
    for (const rtl of [false, true]) {
      const names = layout({ podium }, rtl).filter((op) => op.block === 'podium' && ['Оля', 'Петро', 'Іра'].includes(op.text));
      expect(names).toHaveLength(3);
      expect(new Set(names.map((op) => op.x)).size).toBe(1);
    }
  });

  it('the prize arrow follows the reading direction', () => {
    const prize = (rtl: boolean) => layout({}, rtl).find((op) => op.block === 'prizes' && op.text.includes('Оля'))!.text;
    expect(prize(false)).toContain('→');
    expect(prize(true)).toContain('←');
    expect(prize(true)).not.toContain('→');
  });

  it('spreads the content down to the footer instead of leaving the lower third empty', () => {
    const ops = resultLayout(base, measure, false);
    const content = ops.filter((op) => op.kind !== 'frame' && !(op.kind === 'rect' && op.w === 1080) && !(op.kind === 'text' && op.block === 'footer'));
    const bottom = Math.max(...content.map((op) => (op.kind === 'rect' ? op.y + op.h : op.kind === 'text' ? op.y : 0)));
    const topMost = Math.min(...content.map((op) => (op.kind === 'rect' ? op.y : op.kind === 'text' ? op.y - 64 : 0)));
    // Зверху від 72 і знизу до межі 1230 відступи різняться не більше ніж на проміжок (32).
    expect(Math.abs(topMost - 72 - (1230 - bottom))).toBeLessThanOrEqual(32 + 64);
    expect(bottom).toBeGreaterThan(900);
    expect(bottom).toBeLessThanOrEqual(1230);
  });

  it('the plaque moves together with the me line', () => {
    const ops = resultLayout(base, measure, false);
    const plaque = ops.find((op) => op.kind === 'rect' && op.w === 936)!;
    const me = ops.find((op) => op.kind === 'text' && op.block === 'me')!;
    expect(plaque.kind === 'rect' && plaque.y < me.y && me.y < plaque.y + plaque.h).toBe(true);
    expect(plaque.kind === 'rect' && me.y - plaque.y).toBe(Math.round((76 + 40 * 0.7) / 2));
  });

  it('resultFileName', () => {
    expect(resultFileName('Зимова вікторина')).toBe('pidsumok-Зимова-вікторина.png');
    expect(resultFileName('')).toBe('pidsumok.png');
  });
});
