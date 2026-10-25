import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Наскрізні тести запускаються окремо від решти: pnpm e2e.
export default defineConfig({
  test: {
    root: resolve(import.meta.dirname, '../../..'),
    include: ['apps/server/e2e/**/*.e2e.ts'],
    // 11b: кожен крок ведучого чекає мінімальний час.
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
