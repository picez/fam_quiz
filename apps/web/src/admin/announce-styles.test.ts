// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Тести запускаються з кореня репозиторію або з apps/web.
const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
const rule = (selector: string): string => {
  const at = css.indexOf(selector);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
};

describe('announcement form styles (53)', () => {
  it('radio buttons in a «.field-check» label keep the checkbox size instead of the wide text-field box', () => {
    expect(rule(".field.field-check input[type='checkbox'],\n.field.field-check input[type='radio'] {")).toContain('width: 1.375rem');
  });

  it('the text, link and date fields look like the other fields of the app', () => {
    const block = rule(".admin-announce textarea,\n.admin-announce input[type='text'],");
    for (const part of ['border: 2px solid var(--line)', 'background: var(--surface)', 'color: var(--paper)', 'min-height: 3.25rem']) expect(block).toContain(part);
  });
});

describe('53 fix wave styles', () => {
  it('chart labels stay inside the frame in Arabic: the chart svg is always left-to-right', () => {
    expect(rule('.day-bars svg {')).toContain('direction: ltr');
  });

  it('the banner × sits in the top corner (logical sides, so RTL mirrors it) with room reserved for it', () => {
    const banner = rule('.announce-banner {');
    expect(banner).toContain('position: relative');
    expect(banner).toContain('padding-inline-end: 3.25rem');
    const close = rule('.announce-banner .announce-close {');
    for (const part of ['position: absolute', 'inset-block-start: 0.25rem', 'inset-inline-end: 0.25rem', 'border: 0', 'background: transparent', 'color: inherit', 'cursor: pointer']) expect(close).toContain(part);
    expect(rule('.announce-banner .announce-close:hover {')).toContain('background: var(--line)');
    expect(rule('.announce-banner .announce-close:focus-visible {')).toContain('var(--accent)');
  });
});

describe('64 fix wave styles', () => {
  it('the «Збої» filter buttons use the compact tab padding, so two fit in a row at 360 px', () => {
    const block = rule('.admin-errors-filter .btn {');
    expect(block).toContain('padding: 0.5rem 1rem');
    expect(block).toContain('flex: 1 1 auto');
    expect(block).toContain('min-height: 2.75rem');
  });
});
