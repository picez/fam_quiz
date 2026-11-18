import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from './unique';

describe('isUniqueViolation', () => {
  it('finds 23505 on the error or down its cause chain', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation(new Error('wrapped', { cause: { code: '23505' } }))).toBe(true);
    expect(isUniqueViolation(new Error('deep', { cause: new Error('mid', { cause: { code: '23505' } }) }))).toBe(true);
  });

  it('anything else is not a unique violation', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('plain'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});
