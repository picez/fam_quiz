import { describe, expect, it } from 'vitest';
import { createPool } from './client';

describe('database pool', () => {
  it('survives an error on an idle connection instead of crashing the process', async () => {
    const seen: Error[] = [];
    const pool = createPool('postgres://nobody@127.0.0.1:1/none', (error) => seen.push(error));
    expect(() => pool.emit('error', new Error('terminating connection due to administrator command'))).not.toThrow();
    expect(seen).toHaveLength(1);
    await pool.end();
  });
});
