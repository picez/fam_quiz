import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Наскрізні тести запускаються окремо від решти: pnpm e2e.
export default defineConfig({
  test: {
    root: resolve(import.meta.dirname, '../../..'),
    include: ['apps/server/e2e/**/*.e2e.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
