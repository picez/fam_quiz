import { describe, expect, it } from 'vitest';
import { BUFF_ICONS } from './buff-meta';

describe('BUFF_ICONS', () => {
  it('the buffs with others are monochrome text glyphs, not colour emoji', () => {
    for (const kind of ['audience', 'hint', 'swap'] as const) {
      const points = [...BUFF_ICONS[kind]].map((ch) => ch.codePointAt(0)!);
      // Кольорові емодзі живуть від U+1F000; U+FE0F просить емодзі-подання.
      expect(points.every((point) => point < 0x1f000 && point !== 0xfe0f)).toBe(true);
    }
  });
});
