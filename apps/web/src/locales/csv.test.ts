import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv, toCsv } from './csv';

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

describe('csv delimiters and blank lines', () => {
  it('detectDelimiter picks the more frequent outside quotes', () => {
    expect(detectDelimiter('a;b;"c,d"\n')).toBe(';');
    expect(detectDelimiter('a,b\n')).toBe(',');
    expect(detectDelimiter('a\n')).toBe(',');
  });

  it('parseCsv with a semicolon', () => {
    expect(parseCsv('Тип;Запитання\r\nчисло;"Скільки; ніг?"\r\n', { delimiter: ';' })).toEqual([
      ['Тип', 'Запитання'],
      ['число', 'Скільки; ніг?'],
    ]);
  });

  it('keepEmpty keeps blank lines for row numbers', () => {
    expect(parseCsv('a\n\nb\n', { keepEmpty: true })).toEqual([['a'], [''], ['b']]);
    expect(parseCsv('a\n\nb\n')).toEqual([['a'], ['b']]);
  });
});
