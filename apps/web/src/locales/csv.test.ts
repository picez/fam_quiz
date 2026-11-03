import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('csv', () => {
  it('round-trips commas, quotes and line breaks inside a cell', () => {
    const rows = [['a,b', 'він сказав "так"', 'рядок\nдругий']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('starts with a BOM and ends every row with CRLF', () => {
    const text = toCsv([['a'], ['b']]);
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toBe('﻿a\r\nb\r\n');
  });

  it('reads a Google Sheets export: no BOM, LF only', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });

  it('keeps empty cells and skips blank lines', () => {
    expect(parseCsv('a,,c\r\n\r\n,,\r\n')).toEqual([['a', '', 'c'], ['', '', '']]);
  });
});
