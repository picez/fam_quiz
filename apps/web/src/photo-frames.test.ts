// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { PHOTO_FRAMES } from '@quiz/shared';
import { describe, expect, it } from 'vitest';

const css = (readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string).replace(/\/\*[\s\S]*?\*\//g, '');

/** Тіло @media (prefers-reduced-motion: no-preference) блоків (з вкладеними дужками). */
function motionBlocks(source: string): string[] {
  const out: string[] = [];
  const head = '@media (prefers-reduced-motion: no-preference)';
  let from = 0;
  for (;;) {
    const start = source.indexOf(head, from);
    if (start < 0) return out;
    let depth = 0;
    let i = source.indexOf('{', start);
    const open = i;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(source.slice(open + 1, i));
    from = i;
  }
}

describe('photo frame css', () => {
  it.each(PHOTO_FRAMES)('has a rule for .photo-frame-%s', (id) => {
    expect(css).toContain(`.photo-frame-${id}`);
  });

  it('moves only inside prefers-reduced-motion: no-preference, and at least once', () => {
    let rest = css;
    for (const block of motionBlocks(css)) rest = rest.replace(block, '');
    const moving = (source: string) =>
      [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector, body]) => /\.photo-frame/.test(selector) && /(^|[;\s])animation(-name)?\s*:/.test(body));
    expect(moving(rest).map((match) => match[1].trim())).toEqual([]);
    expect(motionBlocks(css).some((block) => moving(block).length > 0 && /aura/.test(block))).toBe(true);
  });

  it('mirrors crows and storm bolts in RTL, and paints no background-coloured cut over the eclipse', () => {
    expect(css).toContain("[dir='rtl'] .photo-frame-crows .photo-frame-art");
    expect(css).toContain("[dir='rtl'] .photo-frame-storm .photo-frame-art");
    expect(css).not.toContain('pf-moon-cut');
  });
});

describe('looks layout css', () => {
  /** Тіло правила з точним селектором (останнє, якщо їх кілька). */
  const rules = (selector: string) => css.split('}').filter((chunk) => chunk.split('{')[0]!.trim() === selector);

  it('the header nick wraps instead of being clipped by the hero', () => {
    const [rule] = rules('.profile-head h1 .nick-name');
    expect(rule).toMatch(/white-space:\s*normal/);
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule).toMatch(/overflow:\s*visible/);
  });

  it('defines each look tile rule once, with equal-height rows and a ✓ on the chosen tile', () => {
    for (const selector of ['.look-option', '.look-option:has(input:checked)', '.look-group-badge .look-option', '.look-group']) expect(rules(selector), selector).toHaveLength(1);
    expect(rules('.look-group')[0]).toMatch(/grid-auto-rows:\s*1fr/);
    expect(rules('.look-option:has(input:checked)::after')[0]).toContain("content: '✓'");
    expect(rules('.look-option:has(input:focus-visible)')[0]).toMatch(/outline:\s*2px solid/);
  });
});
