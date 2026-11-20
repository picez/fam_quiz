// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, rootTokens, tokenColor } from './theme.test';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string;
const clean = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));

const RULE = '.btn.btn-primary:not(.is-pacing):disabled';
const at = clean.indexOf(`\n${RULE} {`);
const body = clean.slice(clean.indexOf('{', at) + 1, clean.indexOf('}', at));

/** Позиція останнього правила з цим селектором, що задає прозорість вимкненої кнопки. */
const lastOpacityRule = (selector: string) => clean.lastIndexOf(`\n${selector} {`);

describe('disabled primary button (59)', () => {
  it('has a rule that drops the whole-button opacity for a muted accent fill', () => {
    expect(at).toBeGreaterThan(0);
    expect(body).toMatch(/opacity:\s*1;/);
    expect(body).toMatch(/background-color:\s*color-mix\(in srgb, var\(--accent\) 35%, var\(--surface\)\);/);
    expect(body).toMatch(/border-color:\s*color-mix\(in srgb, var\(--accent\) 35%, var\(--surface\)\);/);
    expect(body).toMatch(/color:\s*var\(--paper\);/);
  });

  it('comes after every rule that sets a disabled opacity, so it wins at equal specificity', () => {
    for (const selector of ['.btn:disabled', '.admin-card .btn:disabled', ':where(:root.is-easy) .btn:disabled', '.bluff-choice .btn:disabled', '.btn.is-pacing:disabled']) {
      expect(lastOpacityRule(selector), selector).toBeGreaterThan(0);
      expect(lastOpacityRule(selector), selector).toBeLessThan(at);
    }
  });

  it('does not touch other disabled buttons or the pacing fill', () => {
    expect(RULE.startsWith('.btn.btn-primary')).toBe(true);
    expect(RULE).toContain(':not(.is-pacing)');
    expect(body).not.toMatch(/background:|background-image/);
  });

  it.each(['dark', 'light'])('keeps the label readable on the muted fill in the %s theme', (theme) => {
    const dark = rootTokens(css);
    const lightBlock = /:root.is-lights*{([^}]*)}/.exec(css)?.[1] ?? '';
    const light = { ...dark, ...Object.fromEntries([...lightBlock.matchAll(/(--[w-]+)s*:s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])) };
    const tokens = theme === 'dark' ? dark : light;
    const accent = tokenColor(tokens, '--accent');
    const surface = tokenColor(tokens, '--surface');
    const fill = [0, 1, 2].map((n) => accent[n] * 0.35 + surface[n] * 0.65) as [number, number, number];
    expect(contrast(tokenColor(tokens, '--paper'), fill), theme).toBeGreaterThanOrEqual(7);
  });
});
