// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string;
const lines = css.split('\n');

const PHYSICAL = [/(margin|padding|border)-(left|right)/, /\b(left|right)\s*:/, /text-align:\s*(left|right)/, /float:\s*(left|right)/];

describe('styles.css right to left', () => {
  it('uses logical properties; the physical ones left are marked /* phys */', () => {
    const offenders = lines
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => PHYSICAL.some((pattern) => pattern.test(line)) && !line.includes('/* phys */'));
    expect(offenders.map(({ number, line }) => `${number}: ${line.trim()}`)).toEqual([]);
  });

  it('mirrors .flip-rtl icons under [dir=rtl]', () => {
    expect(/\[dir='rtl'\]\s+\.flip-rtl\s*\{[^}]*display:\s*inline-block;[^}]*transform:\s*scaleX\(-1\);[^}]*\}/.test(css)).toBe(true);
  });

  it('Arabic gets system fonts and no letter spacing', () => {
    const block = /:root:lang\(ar\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(block).toContain("--body: system-ui, 'Segoe UI', Tahoma, 'Noto Sans Arabic', sans-serif;");
    expect(block).toContain("--display: system-ui, 'Segoe UI', Tahoma, 'Noto Sans Arabic', sans-serif;");
    expect(/:lang\(ar\)[^{]*\{[^}]*letter-spacing:\s*0[;\s]/.test(css)).toBe(true);
  });

  it('has the .ltr-isolate class', () => {
    expect(/\.ltr-isolate\s*\{\s*direction:\s*ltr;\s*unicode-bidi:\s*isolate;\s*\}/.test(css)).toBe(true);
  });
});
