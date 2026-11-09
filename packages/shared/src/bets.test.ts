import { describe, expect, it } from 'vitest';
import { betMinimum, betsMinimums, betsRoundIssue, betsTeaser, betsWords } from './bets';

describe('bets minimums', () => {
  it('minimum grows by the step from zero', () => {
    expect(betMinimum({ betStart: 200, betStep: 100 }, 0)).toBe(200);
    expect(betMinimum({ betStart: 200, betStep: 100 }, 3)).toBe(500);
    expect(betsMinimums({ betStart: 200, betStep: 100 }, 3)).toEqual([200, 300, 400]);
    expect(betsMinimums({ betStart: 200, betStep: 0 }, 2)).toEqual([200, 200]);
  });

  it('last minimum over the maximum', () => {
    expect(betsRoundIssue({ betStart: 200, betStep: 100, betMax: 300 }, 3)).toBe('bets_max');
    expect(betsRoundIssue({ betStart: 200, betStep: 100, betMax: 400 }, 3)).toBeNull();
    expect(betsRoundIssue({ betStart: 200, betStep: 100, betMax: null }, 3)).toBeNull();
  });
});

describe('bets teaser', () => {
  it('teaser keeps the first words of the original text', () => {
    const text = 'Яке місто  є\nстолицею Австралії?';
    expect(betsTeaser(text, 2)).toBe('Яке місто');
    expect(betsTeaser(text, 3)).toBe('Яке місто  є');
    expect(betsTeaser(text, 0)).toBe('');
    expect(betsTeaser(text, 99)).toBe(text);
    expect(betsTeaser(`${text}  \n`, 99)).toBe(text);
    expect(betsWords('  а  б ')).toEqual(['а', 'б']);
  });
});
