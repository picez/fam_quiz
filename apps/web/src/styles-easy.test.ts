// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string;

/** Коментарі замінено пробілами тієї ж довжини: позиції (і номери рядків) не зсуваються. */
const clean = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
const lineOf = (index: number) => clean.slice(0, index).split('\n').length;

interface Rule {
  prelude: string;
  body: string;
  at: number;
}

/** Інструкції блоку: селектор чи at-правило з тілом у фігурних дужках (простий розбір, рядків з дужками в CSS немає). */
function statements(text: string, offset = 0): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    let depth = 0;
    let close = open;
    for (; close < text.length; close++) {
      if (text[close] === '{') depth++;
      else if (text[close] === '}' && --depth === 0) break;
    }
    const prelude = text.slice(i, open);
    out.push({ prelude: prelude.trim(), body: text.slice(open + 1, close), at: offset + i + (prelude.length - prelude.trimStart().length) });
    i = close + 1;
  }
  return out;
}

const top = statements(clean);
const media = (query: string) => top.filter((s) => s.prelude === `@media (prefers-reduced-motion: ${query})`);
const selectorsOf = (prelude: string) => prelude.split(/,(?![^(]*\))/).map((s) => s.trim().replace(/\s+/g, ' '));
const declarations = (body: string) =>
  body
    .split(';')
    .map((d) => d.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

/** Правила (не @keyframes) усередині блоку, разом із вкладеними at-правилами. */
function rulesIn(block: Rule): Rule[] {
  const inner = statements(block.body, block.at + block.prelude.length + 1);
  return inner.flatMap((s) => (s.prelude.startsWith('@keyframes') ? [] : s.prelude.startsWith('@') ? rulesIn(s) : [s]));
}

const topRule = (selector: string) => top.filter((s) => selectorsOf(s.prelude).join(', ') === selector);

describe('styles.css easy mode (31)', () => {
  it(':root.is-easy scales the type and lightens the text', () => {
    const block = topRule(':root.is-easy').map((r) => r.body).join('');
    expect(block).toContain('font-size: 118.75%');
    expect(block).toContain('--paper: #ffffff');
    expect(block).toContain('--dim: rgb(255 255 255 / 0.88)');
  });

  it('every no-preference rule waits for :not(.is-easy)', () => {
    const blocks = media('no-preference');
    expect(blocks.length).toBeGreaterThanOrEqual(30);
    const offenders = blocks
      .flatMap(rulesIn)
      .flatMap((rule) => selectorsOf(rule.prelude).map((selector) => ({ selector, line: lineOf(rule.at) })))
      .filter(({ selector }) => !selector.startsWith(':where(:root:not(.is-easy))'))
      .map(({ selector, line }) => `${line}: ${selector}`);
    expect(offenders).toEqual([]);
  });

  it('every reduce rule has an is-easy twin outside the media', () => {
    const blocks = media('reduce');
    expect(blocks.length).toBeGreaterThanOrEqual(9);
    const missing = blocks.flatMap(rulesIn).flatMap((rule) => {
      const twin = selectorsOf(rule.prelude)
        .map((s) => `:where(:root.is-easy) ${s}`)
        .join(', ');
      const found = topRule(twin).some((r) => declarations(r.body).join(';') === declarations(rule.body).join(';'));
      return found ? [] : [`${lineOf(rule.at)}: ${twin}`];
    });
    expect(missing).toEqual([]);
  });

  it('options and buttons are taller', () => {
    expect(topRule(':where(:root.is-easy) .choice').map((r) => r.body).join('')).toContain('min-height: 4.25rem');
    expect(topRule(':where(:root.is-easy) .btn:where(:not(.btn-small))').map((r) => r.body).join('')).toContain('min-height: 3.5rem');
  });

  it('the easy rules come after the rules they override, so equal specificity wins', () => {
    const at = (selector: string) => topRule(selector)[0]?.at ?? -1;
    expect(at(':where(:root.is-easy) .choice')).toBeGreaterThan(at('.choice'));
    expect(at(':where(:root.is-easy) .btn:where(:not(.btn-small))')).toBeGreaterThan(at('.btn'));
    expect(at(':where(:root.is-easy) .meta')).toBeGreaterThan(at('.meta'));
  });
});
