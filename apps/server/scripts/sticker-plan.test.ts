import { describe, expect, it } from 'vitest';
import { planStickers, renderStickerList, type SourceFile } from './sticker-plan';

const enc = (s: string) => new TextEncoder().encode(s);
const GIF = enc('GIF89a....');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const file = (name: string): SourceFile => ({
  name,
  bytes: name.toLowerCase().endsWith('.png') ? PNG : GIF,
});
const plan = (...names: string[]) => planStickers(names.map(file));
const ids = (...names: string[]) => plan(...names).stickers.map((s) => s.id);

describe('planStickers', () => {
  it('drops a «~1» twin of a file without the tail', () => {
    const p = plan('nyaChips.png', 'nyaChips~1.gif');
    expect(p.stickers).toEqual([
      { id: 'nyaChips', ext: 'png', series: 'nya', source: 'nyaChips.png' },
    ]);
    expect(p.skipped).toEqual([{ name: 'nyaChips~1.gif', reason: 'duplicate' }]);
  });

  it('keeps a tailed file that has no pair under its core', () => {
    expect(plan('nyaBoba~1.gif').stickers).toEqual([
      { id: 'nyaBoba', ext: 'gif', series: 'nya', source: 'nyaBoba~1.gif' },
    ]);
  });

  it('drops long-number twins', () => {
    const p = plan('nyasSleep.png', 'nyasSleep-661665921831665684.png');
    expect(p.stickers.map((s) => s.id)).toEqual(['nyasSleep']);
    expect(p.skipped).toEqual([
      { name: 'nyasSleep-661665921831665684.png', reason: 'duplicate' },
    ]);
  });

  it('prefers the gif over a static png with the same core', () => {
    const p = plan('nyaNana.gif', 'nyaNana.png');
    expect(p.stickers.map((s) => [s.id, s.ext])).toEqual([['nyaNana', 'gif']]);
    expect(p.skipped).toEqual([{ name: 'nyaNana.png', reason: 'duplicate' }]);
  });

  it('skips strangers', () => {
    expect(plan('notes.txt').skipped).toEqual([{ name: 'notes.txt', reason: 'not_image' }]);
    expect(plan('кіт.png', 'nya Cat.png').skipped.map((s) => s.reason)).toEqual([
      'bad_name',
      'bad_name',
    ]);
    const fake = planStickers([{ name: 'fake.gif', bytes: PNG }]);
    expect(fake.skipped).toEqual([{ name: 'fake.gif', reason: 'content_mismatch' }]);
  });

  it('accepts an upper-case extension and keeps the id as is', () => {
    expect(plan('UPPER.GIF').stickers).toEqual([
      { id: 'UPPER', ext: 'gif', series: 'other', source: 'UPPER.GIF' },
    ]);
  });

  it('orders by series, then naturally', () => {
    expect(ids('yay.gif', 'nyasHug1.gif', 'nyaaBox.gif', 'nyaCute10.gif', 'nyaCute2.gif')).toEqual([
      'nyaCute2',
      'nyaCute10',
      'nyaaBox',
      'nyasHug1',
      'yay',
    ]);
  });
});

describe('renderStickerList', () => {
  it('starts with a warning and reproduces its input', () => {
    const input = [
      { id: 'nyaA', ext: 'gif' as const, series: 'nya' as const },
      { id: 'yay', ext: 'png' as const, series: 'other' as const },
    ];
    const text = renderStickerList(input);
    expect(text.startsWith('// Згенеровано apps/server/scripts/upload-stickers.ts')).toBe(true);
    expect(text).toContain("import type { Sticker } from './stickers';");
    const back = [...text.matchAll(/\{ id: '(\w+)', ext: '(gif|png)', series: '(\w+)' \},/g)].map(
      (m) => ({ id: m[1], ext: m[2], series: m[3] }),
    );
    expect(back).toEqual(input);
  });
});
