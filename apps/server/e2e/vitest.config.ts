import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Наскрізні тести запускаються окремо від решти: pnpm e2e.
export default defineConfig({
  test: {
    root: resolve(import.meta.dirname, '../../..'),
    include: ['apps/server/e2e/**/*.e2e.ts'],
    // 30b: тести розділено на файли; кожен піднімає свій сервер, базу й Chrome — по одному файлу за раз (пам'ять, таймінги темпу).
    fileParallelism: false,
    // 11b: кожен крок ведучого чекає мінімальний час.
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
