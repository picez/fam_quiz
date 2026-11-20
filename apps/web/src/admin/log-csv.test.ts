import type { AdminLogEntry } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { logCsv, logFileName } from './log-csv';

const entry = (over: Partial<AdminLogEntry> = {}): AdminLogEntry => ({
  id: 'a1',
  at: '2026-11-20T21:30:00.000Z',
  kind: 'group_hide',
  admin: 'Ганна',
  target: 'Оля',
  details: { title: 'Родина', reason: null },
  ...over,
});

describe('logCsv (63)', () => {
  it('starts with a BOM, a header and semicolons', () => {
    const csv = logCsv([]);
    expect(csv.startsWith('﻿')).toBe(true);
    const [head] = csv.slice(1).split('\r\n');
    expect(head!.split(';')).toHaveLength(5);
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('Kyiv time and the kind code', () => {
    const rows = logCsv([entry(), entry({ at: '2026-07-01T09:05:07.000Z' })])
      .slice(1)
      .split('\r\n');
    const first = rows[1]!.split(';');
    expect(first[0]).toBe('2026-11-20 23:30:00');
    expect(first[2]).toBe('group_hide');
    expect(rows[2]!.split(';')[0]).toBe('2026-07-01 12:05:07');
  });

  it('quotes and formulas are safe', () => {
    const rows = logCsv([
      entry({ target: 'Оля "Сонце"' }),
      entry({ admin: '=1+1', target: '-5' }),
      entry({ kind: 'group_item_hide', details: { title: 'Родина', text: 'один; два\nтри' } }),
    ])
      .slice(1)
      .split('\r\n');
    expect(rows[1]).toContain(';"Оля ""Сонце"""');
    expect(rows[2]!.startsWith('2026-11-20 23:30:00;\'=1+1;group_hide;\'-5;')).toBe(true);
    expect(rows[3]).toContain('"');
    expect(rows[1]!.split(';')[1]).toBe('Ганна');
    const last = logCsv([entry({ kind: 'group_item_hide', details: { title: 'Родина', text: 'один; два\nтри' } })]);
    expect(last).toContain('"');
    expect(last).toContain('один; два\nтри');
  });

  it('names the file by the Kyiv date', () => {
    expect(logFileName(new Date('2026-11-20T22:30:00Z'))).toBe('admin-log-2026-11-21.csv');
  });
});
