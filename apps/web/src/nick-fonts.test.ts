// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NICK_FONTS } from '@quiz/shared';
import { loadNickFont, NICK_FONT_FAMILY, NICK_FONT_LOADERS, resetNickFontCache } from './nick-fonts';

afterEach(() => {
  vi.restoreAllMocks();
  resetNickFontCache();
});

describe('nick fonts', () => {
  it('loads each font once', async () => {
    const spy = vi.spyOn(NICK_FONT_LOADERS, 'pixel').mockResolvedValue(undefined);
    await loadNickFont('pixel');
    await loadNickFont('pixel');
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('a failed load resolves', async () => {
    vi.spyOn(NICK_FONT_LOADERS, 'heavy').mockRejectedValue(new Error('chunk'));
    await expect(loadNickFont('heavy')).resolves.toBeUndefined();
  });
  it('NICK_FONT_FAMILY matches styles.css', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string;
    for (const id of NICK_FONTS) {
      const rule = new RegExp(`\\.nick-font-${id}\\s*\\{[^}]*font-family:\\s*'([^']+)'`).exec(css);
      expect(rule?.[1]).toBe(NICK_FONT_FAMILY[id]);
    }
  });
  it('main.tsx imports no nick font', () => {
    const main = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8') as string;
    for (const pkg of ['caveat', 'comfortaa', 'fira-code', 'oswald', 'amatic-sc', 'pixelify-sans', 'cormorant', 'dela-gothic-one']) {
      expect(main).not.toContain(pkg);
    }
    expect(NICK_FONTS).toHaveLength(8);
  });
});
