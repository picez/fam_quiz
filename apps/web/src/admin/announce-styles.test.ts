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
