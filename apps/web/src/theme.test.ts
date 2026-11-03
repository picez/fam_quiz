// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string;

/** Значення змінних із першого блока :root у styles.css. */
export function rootTokens(source: string): Record<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(source)?.[1] ?? '';
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

type Rgba = [number, number, number, number];

function parseColor(tokens: Record<string, string>, value: string, depth = 0): Rgba {
  if (depth > 8) throw new Error(`token loop at ${value}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  if (ref) {
    const next = tokens[ref[1]];
    if (next === undefined) throw new Error(`unknown token ${ref[1]}`);
    return parseColor(tokens, next, depth + 1);
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    return [parseInt(digits.slice(0, 2), 16), parseInt(digits.slice(2, 4), 16), parseInt(digits.slice(4, 6), 16), 1];
  }
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)\s*)?\)$/.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  throw new Error(`not a colour: ${value}`);
}

/** Колір змінної: hex або rgb(r g b / a), змішаний з тлом --stage, якщо є альфа. */
export function tokenColor(tokens: Record<string, string>, name: string): [number, number, number] {
  const value = tokens[name];
  if (value === undefined) throw new Error(`unknown token ${name}`);
  const [r, g, b, a] = parseColor(tokens, value);
  if (a >= 1) return [r, g, b];
  const [sr, sg, sb] = parseColor(tokens, tokens['--stage']);
  return [r * a + sr * (1 - a), g * a + sg * (1 - a), b * a + sb * (1 - a)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme tokens «Кривавий місяць»', () => {
  const tokens = rootTokens(css);

  it('has the fixed palette values', () => {
    expect(tokens['--stage']).toBe('#060505');
    expect(tokens['--surface']).toBe('#0f0b0b');
    expect(tokens['--line']).toBe('#2a1a1a');
    expect(tokens['--accent']).toBe('#e02531');
    expect(tokens['--paper']).toBe('#f3eaea');
    expect(tokens['--wrong']).toBe('#ff8fa3');
    expect(tokens['--radius']).toBe('0.5rem');
  });

  it.each([
    ['--paper', '--stage'],
    ['--paper', '--surface'],
    ['--dim', '--stage'],
    ['--dim', '--surface'],
    ['--accent-text', '--stage'],
    ['--accent-text', '--surface'],
    ['--link', '--stage'],
    ['--on-accent', '--accent'],
    ['--correct', '--stage'],
    ['--wrong', '--stage'],
    ['--stage', '--accent-text'],
  ])('%s on %s reaches WCAG AA (4.5:1)', (text, background) => {
    expect(contrast(tokenColor(tokens, text), tokenColor(tokens, background))).toBeGreaterThanOrEqual(4.5);
  });

  it('the fill red is too dark for text on the stage, so red text uses --accent-text', () => {
    expect(contrast(tokenColor(tokens, '--accent'), tokenColor(tokens, '--stage'))).toBeLessThan(4.5);
  });

  it('has no glass (backdrop-filter)', () => {
    expect(css).not.toContain('backdrop-filter');
  });

  it('uses the sharper radius instead of the old large ones', () => {
    const offenders = css.split('\n').filter((line) => /border-radius:[^;]*(?<![\d.])(0\.75rem|0\.875rem|1rem|0\.625rem)/.test(line));
    expect(offenders).toEqual([]);
  });

  it('the primary button is a red fill with white text', () => {
    const rule = /\n\.btn-primary\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('background: var(--accent);');
    expect(rule).toContain('color: var(--on-accent);');
  });
});

/** Вирізає всі блоки `@media (prefers-reduced-motion: no-preference) { … }` разом із вкладеними дужками. */
export function withoutMotionBlocks(source: string): string {
  const head = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{/g;
  let out = '';
  let from = 0;
  for (let match = head.exec(source); match !== null; match = head.exec(source)) {
    out += source.slice(from, match.index);
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
    from = i;
    head.lastIndex = i;
  }
  return out + source.slice(from);
}

/** Правила (селектор і тіло) без коментарів; @media-обгортки розкриваються. */
function cssRules(source: string): { selector: string; body: string }[] {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1].trim(), body: match[2] }));
}

describe('motifs', () => {
  const MOTIF = /\.(moon|crows|cloud-motif|tomoe-ring)\b/;

  it('strips no-preference blocks with nested braces', () => {
    const sample = 'a { x: 1; }\n@media (prefers-reduced-motion: no-preference) {\n  .crows { animation: drift 30s; }\n  @keyframes drift { from { y: 0; } to { y: 1; } }\n}\nb { y: 2; }';
    expect(withoutMotionBlocks(sample).replace(/\s+/g, ' ').trim()).toBe('a { x: 1; } b { y: 2; }');
  });

  it('motifs exist and do not move outside prefers-reduced-motion: no-preference', () => {
    const rules = cssRules(css).filter(({ selector }) => MOTIF.test(selector));
    expect(rules.length).toBeGreaterThan(0);
    const moving = cssRules(withoutMotionBlocks(css)).filter(
      ({ selector, body }) => MOTIF.test(selector) && /(^|[;\s])(animation|transition)(-[\w-]+)?\s*:/.test(body),
    );
    expect(moving.map(({ selector }) => selector)).toEqual([]);
  });

  it('the crows drift only when motion is welcome', () => {
    expect(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.crows\s*\{[^}]*animation:[^}]*30s/.test(css)).toBe(true);
  });

  it('the moon is a gradient with a glow, never blurred', () => {
    const moonRules = cssRules(css).filter(({ selector }) => /\.moon\b/.test(selector));
    expect(moonRules.some(({ body }) => body.includes('radial-gradient('))).toBe(true);
    expect(moonRules.some(({ body }) => body.includes('box-shadow: 0 0 80px rgb(179 16 26 / 0.6)'))).toBe(true);
    expect(moonRules.filter(({ body }) => /filter\s*:[^;]*blur/.test(body)).map(({ selector }) => selector)).toEqual([]);
  });

  it('mirrors the moon highlight for right-to-left pages', () => {
    const rule = /\[dir='rtl'\] \.moon\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('radial-gradient(circle at 60% 40%,');
  });

  it('the hero reaches the screen edge through the shared page padding, not a copied number', () => {
    const app = /\n\.app\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const hero = /\n\.motif-hero\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(app).toContain('--app-pad: 1.25rem;');
    expect(app).toMatch(/padding:[^;]*var\(--app-pad\)/);
    expect(hero).toContain('margin-inline: calc(-1 * var(--app-pad, 0rem));');
  });
});

describe('game verdicts', () => {
  const rules = cssRules(css);
  /** Значення властивостей кольору (color, background*, border*-color) у тілі правила. */
  const colourValues = (body: string) =>
    [...body.matchAll(/(?:^|[;\s])(color|background(?:-color|-image)?|border(?:-[\w-]+)?-color|border(?:-(?:top|bottom|left|right|block|inline)(?:-start|-end)?)?)\s*:\s*([^;]+)/g)].map((match) => match[2]);

  it('every wrong verdict is painted in --wrong, never in the red accent or the danger red', () => {
    const wrongRules = rules.filter(({ selector }) => selector.includes('.is-wrong'));
    expect(wrongRules.length).toBeGreaterThan(5);
    const offenders = wrongRules
      .map(({ selector, body }) => ({ selector, values: colourValues(body) }))
      .filter(({ values }) => values.length > 0)
      .filter(({ selector, values }) => {
        const text = values.join(' ');
        const banned = /var\(--(signal|accent|amber|accent-text)\)/.test(text);
        // Бейдж уже має текст (✗ / «відключився»): йому дозволено --wrong і нейтральні кольори.
        if (selector === '.tag.is-wrong') return banned;
        return banned || !text.includes('var(--wrong)');
      })
      .map(({ selector }) => selector);
    expect(offenders).toEqual([]);
  });

  it.each(['.choice.is-wrong::after', '.spotlight-answer.is-wrong::after', '.duel-stage-answer.is-wrong::after', '.result.is-wrong h2::before'])(
    '%s carries a ✗ that screen readers skip',
    (selector) => {
      const rule = rules.find((candidate) => candidate.selector.split(',').map((part) => part.trim()).includes(selector));
      expect(rule?.body).toContain("content: '✗' / '';");
    },
  );

  it('the ✗ on a choice sits at the inline end, with room kept for it, not over the text', () => {
    const mark = rules.find(({ selector }) => selector.split(',').map((part) => part.trim()).includes('.choice.is-wrong::after'))?.body ?? '';
    expect(mark).toContain('position: absolute;');
    expect(mark).toMatch(/inset-inline-end:/);
    const room = rules.filter(({ selector }) => /(^|,)\s*\.choice\.is-wrong\s*(,|$)/.test(selector)).map(({ body }) => body).join('');
    expect(room).toMatch(/padding-inline-end:/);
  });

  it('the moon behind the game is faint, still and never catches a tap', () => {
    const before = rules.filter(({ selector }) => selector === '.game-bg::before').map(({ body }) => body).join('');
    expect(before).toContain('pointer-events: none;');
    expect(before).toContain('z-index: -1;');
    expect(before).toMatch(/inset-inline-end:/);
    const opacity = Number(/opacity:\s*([\d.]+)/.exec(before)?.[1] ?? NaN);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(0.12);
    const anyMoving = cssRules(css).filter(({ selector, body }) => /\.game-bg\b/.test(selector) && /(^|[;\s])(animation|transition)(-[\w-]+)?\s*:/.test(body));
    expect(anyMoving.map(({ selector }) => selector)).toEqual([]);
    const host = rules.find(({ selector }) => selector === '.game-bg')?.body ?? '';
    expect(host).toContain('position: relative;');
    expect(host).toContain('isolation: isolate;');
  });
});
