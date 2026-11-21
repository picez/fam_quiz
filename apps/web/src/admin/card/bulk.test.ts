import { describe, expect, it, vi } from 'vitest';
import { runEach } from './bulk';

describe('runEach (69)', () => {
  it('runs every item in order', async () => {
    const run = vi.fn(async () => ({ ok: true as const }));
    expect(await runEach(['a', 'b'], run)).toEqual({ ok: true, done: 2, skipped: 0 });
    expect(run.mock.calls.map((call) => (call as unknown[])[0])).toEqual(['a', 'b']);
  });

  it('skips an item that is already gone and goes on', async () => {
    const run = vi.fn(async (item: string) => (item === 'b' ? { ok: false as const, error: 'not_found' } : item === 'c' ? { ok: false as const, error: 'gift_not_found' } : { ok: true as const }));
    expect(await runEach(['a', 'b', 'c', 'd'], run)).toEqual({ ok: true, done: 2, skipped: 2 });
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('stops on any other error', async () => {
    const run = vi.fn(async (item: string) => (item === 'b' ? { ok: false as const, error: 'restarting' } : { ok: true as const }));
    expect(await runEach(['a', 'b', 'c'], run)).toEqual({ ok: false, error: 'restarting', done: 1 });
    expect(run).toHaveBeenCalledTimes(2);
  });
});
