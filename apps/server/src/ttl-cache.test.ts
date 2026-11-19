import { describe, expect, it } from 'vitest';
import { ttlCache } from './ttl-cache';

describe('ttlCache', () => {
  it('serves one load for 10 minutes, shares a pending load, does not keep a failure, clears on demand', async () => {
    let time = 0;
    let loads = 0;
    const cache = ttlCache(async () => (loads += 1), 600_000, () => time);
    const [x, y] = await Promise.all([cache.get(), cache.get()]);
    expect([x, y, loads]).toEqual([1, 1, 1]);
    time = 599_999;
    expect(await cache.get()).toBe(1);
    time = 600_000;
    expect(await cache.get()).toBe(2);
    cache.clear();
    expect(await cache.get()).toBe(3);

    let fail = true;
    const flaky = ttlCache(async () => {
      if (fail) throw new Error('down');
      return 'ok';
    }, 600_000, () => time);
    await expect(flaky.get()).rejects.toThrow('down');
    fail = false;
    expect(await flaky.get()).toBe('ok');
  });
});
