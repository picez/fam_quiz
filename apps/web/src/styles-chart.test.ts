// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, rootTokens, tokenColor } from './theme.test';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string;
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Змінні першого блока з цим селектором верхнього рівня. */
function blockTokens(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.]/g, '\\.');
  const block = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

/** Тіла всіх правил (без вкладених блоків) з точно цим селектором. */
function bodies(selector: string): string[] {
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) => match[1]!.trim() === selector).map((match) => match[2]!);
}

const dark = rootTokens(css);
const light = { ...dark, ...blockTokens(':root.is-light') };
const CHART = ['--chart-1', '--chart-2', '--chart-3'];

describe('71 chart tokens', () => {
  it.each([
    ['dark', dark],
    ['light', light],
  ])('%s theme has every chart token', (_name, tokens) => {
    for (const name of [...CHART, '--chart-grid']) expect(tokens[name], name).toBeTruthy();
    expect(tokens['--chart-1']).toBe('var(--accent)');
  });

  it.each([
    ['dark', dark],
    ['light', light],
  ])('%s theme: every series colour is at least 3:1 against the surface (WCAG 1.4.11)', (_name, tokens) => {
    for (const name of CHART) expect(contrast(tokenColor(tokens, name), tokenColor(tokens, '--surface')), name).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['dark', dark],
    ['light', light],
  ])('%s theme: series colours differ from each other, not only in hue', (_name, tokens) => {
    const colours = CHART.map((name) => tokenColor(tokens, name));
    for (let a = 0; a < colours.length; a++) {
      for (let b = a + 1; b < colours.length; b++) expect(contrast(colours[a]!, colours[b]!), `${CHART[a]} / ${CHART[b]}`).toBeGreaterThanOrEqual(1.3);
    }
  });
});

describe('71 chart classes', () => {
  it('keeps text a fixed pixel size: 12 px on a card, 13 px in the dialog', () => {
    expect(bodies('.chart-svg text').join('')).toMatch(/font-size:\s*12px/);
    expect(bodies('.chart-dialog .chart-svg text').join('')).toMatch(/font-size:\s*13px/);
  });

  it('keeps the time axis left to right', () => {
    expect(bodies('.chart-svg').join('')).toMatch(/direction:\s*ltr/);
  });

  it('lets the tooltip pass the pointer through', () => {
    expect(bodies('.chart-tip').join('')).toMatch(/pointer-events:\s*none/);
  });

  it('sizes bars by --share and the chart grid by the container', () => {
    expect(bodies('.hbar-fill').join('')).toMatch(/inline-size:\s*calc\(var\(--share, 0\) \* 100%\)/);
    expect(bodies('.day-bars-grid').join('')).toMatch(/minmax\(min\(100%, 20rem\), 1fr\)/);
  });

  it('opens the dialog full screen on a phone and up to the admin width elsewhere', () => {
    const phone = /@media \(max-width: 700px\)\s*\{\s*\.chart-sheet\s*\{[^}]*\}\s*\.chart-dialog\s*\{([^}]*)\}/.exec(clean)?.[1] ?? '';
    expect(phone).toMatch(/inset:\s*0/);
    expect(bodies('.chart-dialog').join('')).toMatch(/max-inline-size:\s*min\(96vw, var\(--w-admin, 72rem\)\)/);
  });

  it('gives period chips and expand buttons a 2.75rem touch target', () => {
    expect(bodies('.metric-period label').join('')).toMatch(/min-height:\s*2\.75rem/);
    expect(bodies('.chart-expand').join('')).toMatch(/min-height:\s*2\.75rem/);
  });

  it('uses no fixed pixel widths on chart cards', () => {
    for (const selector of ['.chart-card', '.chart-plot', '.chart-dialog', '.hbar-list']) {
      for (const body of bodies(selector)) expect(body, selector).not.toMatch(/(?:^|[\s;])(?:width|inline-size|min-width):\s*\d+px/);
    }
  });
});
