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
});
