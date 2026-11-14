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

  it('right-to-left numbers in dir=ltr cells line up with their headers (end = left)', () => {
    const rule = /\[dir='rtl'\] \.score-table td\[dir='ltr'\],\s*\[dir='rtl'\] \.wall-table \.score\[dir='ltr'\],\s*\[dir='rtl'\] \.sort-board \.score\[dir='ltr'\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('text-align: left; /* phys */');
  });

  it('bars fill from the inline start: the vote bar is logical, scaleX and gradient fills flip under [dir=rtl]', () => {
    const voteBar = /\n\.vote-bar\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(voteBar).toContain('inset-block: 0;');
    expect(voteBar).toContain('inset-inline: 0 auto;');
    expect(voteBar).not.toMatch(/\binset:/);
    expect(/\[dir='rtl'\] \.sort-bar-fill,\s*\[dir='rtl'\] \.bank-meter-text\s*\{[^}]*transform-origin: right center;[^}]*\}/.test(css)).toBe(true);
    expect(/\[dir='rtl'\] \.btn\.is-pacing\s*\{[^}]*linear-gradient\(270deg,[^}]*\}/.test(css)).toBe(true);
  });

  it('names with their own dir follow the page alignment, after every other .name rule', () => {
    const at = css.search(/\n\.name\[dir\]\s*\{\s*text-align:\s*match-parent;\s*\}/);
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at + 1).replace(/^[^}]*\}/, '')).not.toMatch(/\.name\b[^{]*\{[^}]*text-align/);
  });

  it('every language, uk too, shows the short menu labels at 401–700 px', () => {
    const block = css.slice(css.indexOf('@media (min-width: 401px) and (max-width: 700px)'));
    expect(block).toMatch(/^@media[^{]*\{\s*\.menu a \.menu-full\s*\{\s*display: none;\s*\}\s*\.menu a::after\s*\{/);
  });

  it('has the .ltr-isolate class', () => {
    expect(/\.ltr-isolate\s*\{\s*direction:\s*ltr;\s*unicode-bidi:\s*isolate;\s*\}/.test(css)).toBe(true);
  });
});

describe('styles.css: «Вікторина з групи» bar (12l)', () => {
  it('has no own bottom offset: only the phone menu rule (≤ 700 px) lifts sticky .actions', () => {
    const rule = /\.group-quiz-bar \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(rule).not.toBe('');
    expect(rule).not.toMatch(/bottom\s*:/);
    expect(css).toMatch(/@media \(max-width: 700px\) \{[^@]*\.with-menu \.actions \{\s*bottom: calc\(var\(--menu-h\)/);
  });
});
