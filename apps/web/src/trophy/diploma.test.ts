// @vitest-environment jsdom
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { contrast, diplomaFileName, diplomaLines, renderDiploma, shareDiploma, type DiplomaData } from './diploma';
import { MATERIAL_LOOK } from './trophy-meta';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const data: DiplomaData = {
  nickname: 'Оля',
  place: 1,
  quizTitle: 'Новорічна вікторина',
  date: new Date('2026-12-31T22:30:00Z'),
  engraving: 'Чемпіон 2026',
  trophy: { kind: 'cup', material: 'gold' },
};

describe('diplomaLines', () => {
  it('lists the lines top to bottom with the Kyiv date', () => {
    expect(diplomaLines(data)).toEqual(['Диплом', 'Оля', '1 місце', 'Новорічна вікторина', 'Чемпіон 2026', '01.01.2027']);
  });

  it('has no engraving line without an engraving', () => {
    expect(diplomaLines({ ...data, engraving: null, place: 3, trophy: null })).toEqual([
      'Диплом',
      'Оля',
      '3 місце',
      'Новорічна вікторина',
      '01.01.2027',
    ]);
  });
});

describe('renderDiploma', () => {
  /** Підроблений 2D-контекст: кожен fillText із тим fillStyle, що стояв у ту мить. */
  function fakeCanvas() {
    const texts: { text: string; y: number; fill: string }[] = [];
    const strokes: string[] = [];
    const context = {
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      fillRect: vi.fn(),
      strokeRect() {
        strokes.push(this.strokeStyle);
      },
      measureText: (text: string) => ({ width: text.length * 10 }),
      fillText(text: string, _x: number, y: number) {
        texts.push({ text, y, fill: this.fillStyle });
      },
    };
    // as never: @types/three тягне @webgpu/types, і остання перевантажена сигнатура getContext — 'webgpu'.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['png'], { type: 'image/png' })));
    return Object.assign(texts, { strokes });
  }

  it('draws every field in its own place and the emoji in a visible colour', async () => {
    const texts = fakeCanvas();
    await renderDiploma(data);
    const at = (text: string) => texts.find((entry) => entry.text === text);
    expect(at('🏆')!.fill).not.toBe('#FFFBF0');
    expect(at('ДИПЛОМ')!.y).toBe(300);
    expect(at('Оля')!.y).toBe(400);
    expect(at('1 місце')!.y).toBe(480);
    expect(at('Новорічна вікторина')).toBeDefined();
    expect(at('«Чемпіон 2026»')).toBeDefined();
    expect(at('01.01.2027')!.y).toBe(740);
  });

  it('without a quiz title the engraving and the date keep their places', async () => {
    const texts = fakeCanvas();
    await renderDiploma({ ...data, quizTitle: '  ' });
    const at = (text: string) => texts.find((entry) => entry.text === text);
    expect(at('Оля')!.y).toBe(400);
    expect(at('1 місце')!.y).toBe(480);
    expect(at('«Чемпіон 2026»')).toBeDefined();
    expect(at('01.01.2027')!.y).toBe(740);
    expect(texts.some((entry) => entry.text.trim() === '')).toBe(false);
  });

  it('light new materials get a darker frame that stands out on the paper', async () => {
    const frameOf = async (material: 'pearl' | 'marble' | 'platinum' | 'gold' | 'silver' | 'diamond') => {
      const texts = fakeCanvas();
      await renderDiploma({ ...data, trophy: { kind: 'cup', material } });
      return texts.strokes[0]!;
    };
    for (const material of ['pearl', 'marble', 'platinum'] as const) {
      expect(contrast(MATERIAL_LOOK[material].color, '#FFFBF0'), material).toBeLessThan(1.5);
      const frame = await frameOf(material);
      expect(frame, material).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrast(frame, '#FFFBF0'), material).toBeGreaterThanOrEqual(3);
    }
  });

  it('silver, gold and diamond get a clearly visible darker frame of the same hue with a thin stripe of the material colour', async () => {
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    for (const material of ['silver', 'gold', 'diamond'] as const) {
      const texts = fakeCanvas();
      await renderDiploma({ ...data, trophy: { kind: 'cup', material } });
      const [frame, stripe, inner] = texts.strokes;
      const color = MATERIAL_LOOK[material].color;
      expect(contrast(color, '#FFFBF0'), material).toBeLessThan(2);
      expect(contrast(frame!, '#FFFBF0'), material).toBeGreaterThanOrEqual(3.5);
      expect(Math.abs(hue(frame!) - hue(color)), material).toBeLessThanOrEqual(12);
      expect(stripe, material).toBe(color);
      expect(inner, material).toBe(frame);
    }
    // Бронза — як була: колір матеріалу, без смужки.
    const texts = fakeCanvas();
    await renderDiploma({ ...data, trophy: { kind: 'cup', material: 'bronze' } });
    expect(texts.strokes).toEqual([MATERIAL_LOOK.bronze.color, MATERIAL_LOOK.bronze.color]);
  });

  it('the frame takes the material colour and the place stays readable on stone frames', async () => {
    const placeFill = async (material: 'gold' | 'bronze' | 'silver' | 'diamond' | 'obsidian' | 'pearl' | 'copper') => {
      const texts = fakeCanvas();
      await renderDiploma({ ...data, trophy: { kind: 'cup', material } });
      return { frame: texts.strokes[0], place: texts.find((entry) => entry.text === '1 місце')!.fill };
    };
    expect(await placeFill('obsidian')).toEqual({ frame: '#1E1A24', place: '#3A7CA5' });
    expect((await placeFill('pearl')).place).toBe('#3A7CA5');
    expect((await placeFill('copper')).place).toBe('#7A5A12');
    // Старі — як були.
    expect((await placeFill('diamond')).place).toBe('#3A7CA5');
    for (const material of ['gold', 'bronze', 'silver'] as const) expect((await placeFill(material)).place).toBe('#7A5A12');
  });
});

describe('diplomaFileName', () => {
  it('keeps letters and digits and turns the rest into dashes', () => {
    expect(diplomaFileName('Оля Петрівна!')).toBe('dyplom-Оля-Петрівна.png');
    expect(diplomaFileName('  Max_2026  ')).toBe('dyplom-Max-2026.png');
  });
});

describe('shareDiploma', () => {
  const blob = new Blob(['png'], { type: 'image/png' });

  it('shares the file when the browser can', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await shareDiploma(blob, 'dyplom-Оля.png')).toBe('shared');
    const files = (share.mock.calls[0]![0] as { files: File[] }).files;
    expect(files[0]!.name).toBe('dyplom-Оля.png');
    expect(files[0]!.type).toBe('image/png');
  });

  it('downloads through a link without canShare', async () => {
    vi.stubGlobal('navigator', {});
    const created = vi.fn(() => 'blob:diploma');
    const revoked = vi.fn();
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = created;
    URL.revokeObjectURL = revoked;
    onTestFinished(() => {
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('dyplom-Оля.png');
      expect(this.href).toBe('blob:diploma');
    });
    expect(await shareDiploma(blob, 'dyplom-Оля.png')).toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('treats a cancelled share as shared, not an error', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'));
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await shareDiploma(blob, 'dyplom-Оля.png')).toBe('shared');
  });
});
