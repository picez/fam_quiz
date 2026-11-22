import { describe, expect, it } from 'vitest';
import { sanitizeNumber } from './sanitize-number';

describe('sanitizeNumber', () => {
  it('keeps plain digits', () => {
    expect(sanitizeNumber('12345')).toBe('12345');
    expect(sanitizeNumber('')).toBe('');
  });

  it('drops letters, e, E, + and spaces', () => {
    expect(sanitizeNumber('abc')).toBe('');
    expect(sanitizeNumber('1e5')).toBe('15');
    expect(sanitizeNumber('2E3')).toBe('23');
    expect(sanitizeNumber('+75')).toBe('75');
    expect(sanitizeNumber(' 1 000 ')).toBe('1000');
    expect(sanitizeNumber('сто')).toBe('');
  });

  it('keeps the digits of pasted text', () => {
    expect(sanitizeNumber('12abc34')).toBe('1234');
  });

  it('drops emoji and symbols', () => {
    expect(sanitizeNumber('5😀0')).toBe('50');
    expect(sanitizeNumber('1👍🏽2')).toBe('12');
    expect(sanitizeNumber('#$%^&*()=_[]{}<>?/\\|"\'`~!@3')).toBe('3');
  });

  it('turns Arabic-Indic, Persian and full-width digits into Latin', () => {
    expect(sanitizeNumber('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(sanitizeNumber('۱۲۳')).toBe('123');
    expect(sanitizeNumber('４２')).toBe('42');
  });

  it('drops a minus unless negative values are allowed', () => {
    expect(sanitizeNumber('-5')).toBe('5');
    expect(sanitizeNumber('-5', { negative: true })).toBe('-5');
    expect(sanitizeNumber('−150', { negative: true })).toBe('-150');
  });

  it('keeps only one leading minus', () => {
    expect(sanitizeNumber('--5', { negative: true })).toBe('-5');
    expect(sanitizeNumber('5-3', { negative: true })).toBe('53');
    expect(sanitizeNumber('-', { negative: true })).toBe('-');
  });

  it('drops decimal separators unless decimals are allowed', () => {
    expect(sanitizeNumber('1,5')).toBe('15');
    expect(sanitizeNumber('1.5')).toBe('15');
  });

  it('keeps one decimal separator, normalized to a dot', () => {
    expect(sanitizeNumber('1,5', { decimal: true })).toBe('1.5');
    expect(sanitizeNumber('1.5', { decimal: true })).toBe('1.5');
    expect(sanitizeNumber('1.2.3', { decimal: true })).toBe('1.23');
    expect(sanitizeNumber('1,2.3', { decimal: true })).toBe('1.23');
    expect(sanitizeNumber('٣٫٥', { decimal: true })).toBe('3.5');
    expect(sanitizeNumber('-2,5', { negative: true, decimal: true })).toBe('-2.5');
  });

  it('cuts to maxLength', () => {
    expect(sanitizeNumber('1234567', { maxLength: 4 })).toBe('1234');
    expect(sanitizeNumber('ab12cd34ef56', { maxLength: 4 })).toBe('1234');
  });
});
