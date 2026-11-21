// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string;
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Тіло блока, що починається з `head` (до парної дужки); null, якщо такого немає. */
function block(source: string, head: string, from = 0): string | null {
  const start = source.indexOf(head, from);
  if (start < 0) return null;
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}' && --depth === 0) return source.slice(open + 1, index);
  }
  return null;
}

/** Усі @media (min-width: …) верхнього рівня: ширина й тіло. */
function minWidthMedia(source: string): { width: string; body: string }[] {
  const out: { width: string; body: string }[] = [];
  for (const match of source.matchAll(/@media \(min-width: (\d+)px\)\s*\{/g)) {
    const body = block(source, match[0], match.index);
    if (body !== null) out.push({ width: match[1]!, body });
  }
  return out;
}

/** Правила (селектор і тіло) без вкладених блоків; @media розкриваються, тож вкладені правила теж видно. */
function rules(source: string): { selector: string; body: string }[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1]!.trim(), body: match[2]! }));
}

const topRule = (selector: string) => topLevel(selector);
const inBig = (selector: string) =>
  minWidthMedia(clean)
    .filter(({ width }) => width === '1024')
    .flatMap(({ body }) => rules(body))
    .filter((rule) => rule.selector.replace(/\s+/g, ' ').includes(selector));

describe('67 wide layout tokens', () => {
  it('declares the width tokens once, in the first :root, with the pre-67 numbers below 1024 px', () => {
    const root = /^:root\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';
    for (const token of ['--w-phone: 34rem;', '--w-tablet: 46rem;', '--w-read: 42rem;', '--w-form: 36rem;', '--w-editor: 68rem;', '--w-stage-board: 60rem;']) {
      expect(root, token).toContain(token);
    }
    for (const name of ['--w-page', '--w-player', '--w-host', '--w-admin', '--side-w', '--card-min']) expect(root, name).toContain(`${name}:`);
  });

  it('the page column is a token: .app reads --app-w, falling back to the phone width', () => {
    const body = topRule('.app');
    expect(body).toContain('max-width: var(--app-w, var(--w-phone));');
    expect(body).toContain('--app-pad: 1.25rem;');
  });

  it('below 1024 px the modifiers keep their old widths', () => {
    expect(topRule('.app.host')).toContain('--app-w: var(--w-tablet);');
    expect(topRule('.app.wide,\n.app.editor')).toContain('--app-w: var(--w-tablet);');
    expect(topRule('.app.editor')).toContain('--app-w: var(--w-editor);');
    const offenders = rules(clean.slice(0, clean.indexOf('@media (min-width: 1024px)')))
      .filter(({ selector }) => /^\.app(\.|,|$)/.test(selector) && /max-width:\s*(34|46|68)rem/.test(topLevel(selector)));
    expect(offenders.map(({ selector }) => selector)).toEqual([]);
  });

  it('every rule for big screens sits inside min-width 1024, 1280 or 1600 px', () => {
    const widths = minWidthMedia(clean).filter(({ body }) => /--app-w|--w-/.test(body)).map(({ width }) => width);
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.filter((width) => !['1024', '1280', '1600'].includes(width))).toEqual([]);
  });

  it('no stacking context and no containment on the page column', () => {
    const BAD = /(container-type|contain\s*:|position:\s*sticky|isolation|z-index|transform|filter|opacity|will-change)/;
    // Лише правила самої колонки: селектор складається з .app-класів без нащадків.
    const COLUMN = /^\.(app|host-cols|host-main|host-side|admin-body)(\.[\w-]+|:[\w-]+\([^)]*\))*$/;
    const offenders = rules(clean).filter(({ selector, body }) => selector.split(',').some((part) => COLUMN.test(part.trim())) && BAD.test(body));
    expect(offenders.map(({ selector }) => selector)).toEqual([]);
  });

  it('the sticky timer row follows the column width', () => {
    expect(topRule('.timer-sticky-row')).toContain('max-width: var(--w-phone);');
    expect(topRule('.timer-sticky.is-host .timer-sticky-row')).toContain('max-width: var(--w-tablet);');
    expect(inBig('.timer-sticky.is-host .timer-sticky-row')[0]?.body).toContain('max-width: var(--w-host);');
    expect(inBig('.timer-sticky:not(.is-host) .timer-sticky-row')[0]?.body).toContain('max-width: var(--w-player);');
  });

  it('on a computer the pages and the host grow, running text keeps a readable line', () => {
    expect(inBig('.app.wide')[0]?.body).toContain('--app-w: var(--w-page);');
    expect(inBig('.app.host')[0]?.body).toContain('--app-w: var(--w-host);');
    expect(inBig('.app.player')[0]?.body).toContain('--app-w: var(--w-player);');
    expect(inBig('.app.wide > :is(p, .field, form)')[0]?.body).toContain('max-inline-size: var(--w-read);');
  });
});

/** Тіло верхньорівневого правила з цим селектором (для .app, .app.host тощо). */
function topLevel(selector: string): string {
  return rules(clean).find((rule) => rule.selector === selector)?.body ?? '';
}
