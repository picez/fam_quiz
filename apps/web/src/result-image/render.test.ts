// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResultImageData } from './data';
import { resultLayout } from './layout';
import { renderResultImage } from './render';

afterEach(() => {
  vi.restoreAllMocks();
  delete document.documentElement.dataset.theme;
});

const data: ResultImageData = {
  quizTitle: 'Зимова вікторина',
  date: new Date('2026-11-18T10:00:00Z'),
  podium: [{ place: 1, name: 'Оля', score: 1500 }, { place: 2, name: 'Петро', score: 900 }],
  me: null,
  prizes: [{ place: 1, trophy: { kind: 'cup', material: 'gold' }, winners: ['Оля'] }],
  achievements: [{ id: 'sniper', nickname: 'Оля' }],
  moreAchievements: 0,
  site: 'quiz.example',
};
const fakeMeasure = (font: string, text: string): number => text.length * 10 + font.length * 0;

function fakeCanvas() {
  const texts: { text: string; font: string; fill: string }[] = [];
  const fills: string[] = [];
  const rects: string[] = [];
  const strokes: string[] = [];
  const context = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    direction: 'ltr',
    fillRect() {
      rects.push(this.fillStyle);
    },
    strokeRect() {
      strokes.push(this.strokeStyle);
    },
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillText(text: string) {
      texts.push({ text, font: this.font, fill: this.fillStyle });
      fills.push(this.fillStyle);
    },
  };
  const sizes: { width: number; height: number }[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
    sizes.push({ width: this.width, height: this.height });
    callback(new Blob(['png'], { type: 'image/png' }));
  });
  return { texts, fills, rects, strokes, sizes };
}

describe('renderResultImage', () => {
  it('renders 1080 by 1350 and draws every layout text', async () => {
    const canvas = fakeCanvas();
    await renderResultImage(data);
    expect(canvas.sizes).toEqual([{ width: 1080, height: 1350 }]);
    const expected = resultLayout(data, fakeMeasure, false).flatMap((op) => (op.kind === 'text' ? [op.text] : []));
    expect(canvas.texts.map((entry) => entry.text)).toEqual(expected);
    expect(canvas.rects).toEqual(['#FFF8EC']);
    expect(canvas.strokes).toHaveLength(1);
  });

  it('the look does not follow the app theme', async () => {
    const run = async (theme: string) => {
      document.documentElement.dataset.theme = theme;
      const canvas = fakeCanvas();
      await renderResultImage(data);
      const result = { fills: canvas.fills, rects: canvas.rects, strokes: canvas.strokes };
      vi.restoreAllMocks();
      return result;
    };
    const dark = await run('dark');
    const light = await run('light');
    expect(dark.fills.length).toBeGreaterThan(0);
    expect(dark).toEqual(light);
  });

  it('no 2d context rejects', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(renderResultImage(data)).rejects.toThrow('canvas_unavailable');
  });

  it('emoji use a visible colour', async () => {
    const canvas = fakeCanvas();
    await renderResultImage(data);
    const medal = canvas.texts.find((entry) => entry.text === '🥇')!;
    expect(medal.fill).not.toBe('#FFF8EC');
  });
});
