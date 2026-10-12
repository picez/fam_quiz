import { describe, expect, it } from 'vitest';
import { secretProblem } from './config';

describe('secretProblem', () => {
  it('accepts a long random secret', () => {
    expect(secretProblem('9f2c1e7a4b6d8035c1e9f7a2b4d6c8e0a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1')).toBeNull();
  });

  it('refuses the value from .env.example', () => {
    expect(secretProblem('change-me-to-a-long-random-string')).toContain('BETTER_AUTH_SECRET');
  });

  it('refuses a secret shorter than 32 characters', () => {
    expect(secretProblem('abc')).toContain('32');
    expect(secretProblem('x'.repeat(31))).toContain('32');
    expect(secretProblem('x1y2'.repeat(8))).toBeNull();
  });
});
