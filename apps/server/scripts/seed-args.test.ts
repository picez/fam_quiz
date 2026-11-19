import { describe, expect, it } from 'vitest';
import { parseSeedArgs } from './seed-args';

const SEEDS = ['demo', 'spy', 'think'] as const;
const ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';

describe('seed arguments: an email, the bot or an update', () => {
  it('takes an email with an optional seed, demo by default', () => {
    expect(parseSeedArgs(['you@example.com'], SEEDS)).toEqual({ mode: 'email', email: 'you@example.com', seed: 'demo' });
    expect(parseSeedArgs(['--', 'you@example.com', 'spy'], SEEDS)).toEqual({ mode: 'email', email: 'you@example.com', seed: 'spy' });
  });

  it('takes --bot with a required, known seed', () => {
    expect(parseSeedArgs(['--bot', 'think'], SEEDS)).toEqual({ mode: 'bot', seed: 'think' });
    expect(parseSeedArgs(['--', '--bot', 'think'], SEEDS)).toEqual({ mode: 'bot', seed: 'think' });
    expect(parseSeedArgs(['--bot'], SEEDS)).toBeNull();
    expect(parseSeedArgs(['--bot', 'nope'], SEEDS)).toBeNull();
  });

  it('takes --update with a uuid and a known seed', () => {
    expect(parseSeedArgs(['--update', ID, 'spy'], SEEDS)).toEqual({ mode: 'update', quizId: ID, seed: 'spy' });
    expect(parseSeedArgs(['--update', 'abc', 'spy'], SEEDS)).toBeNull();
    expect(parseSeedArgs(['--update', ID, 'nope'], SEEDS)).toBeNull();
    expect(parseSeedArgs(['--update', ID], SEEDS)).toBeNull();
  });

  it('refuses nothing or something without an email', () => {
    expect(parseSeedArgs([], SEEDS)).toBeNull();
    expect(parseSeedArgs(['spy'], SEEDS)).toBeNull();
  });
});
