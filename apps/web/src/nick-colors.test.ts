// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NICK_COLORS, NICK_FONTS } from '@quiz/shared';
import { contrast, rootTokens, tokenColor } from './theme.test';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string;
const tokens = rootTokens(css);
const surface = tokenColor(tokens, '--surface');

function rule(selector: string): string {
  const escaped = selector.replace(/[.-]/g, (c) => '\\' + c);
  return new RegExp(escaped + '\\s*\\{([^}]*)\\}').exec(css)?.[1] ?? '';
}

function hexToRgb(hex: string): [number, number, number] {
  const d = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return [parseInt(d.slice(0, 2), 16), parseInt(d.slice(2, 4), 16), parseInt(d.slice(4, 6), 16)];
}

describe('nick colours and fonts in css', () => {
  it('has 13 colours', () => expect(NICK_COLORS).toHaveLength(13));
  for (const id of NICK_COLORS) {
    it(`colour ${id} has a rule and reads on the surface`, () => {
      const body = rule(`.nick-c-${id}`);
      expect(body).not.toBe('');
      const hexes = [...body.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map((m) => m[1]);
      expect(hexes.length).toBeGreaterThan(0);
      for (const hex of hexes) expect(contrast(hexToRgb(hex), surface)).toBeGreaterThanOrEqual(4.5);
    });
  }
  for (const id of NICK_FONTS) {
    it(`font ${id} has a rule with a system fallback`, () => {
      const body = rule(`.nick-font-${id}`);
      expect(/font-family:[^;]*system-ui, sans-serif\s*;/.test(body)).toBe(true);
    });
  }
});
