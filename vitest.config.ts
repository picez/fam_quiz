import { defineConfig } from 'vitest/config';

// `pnpm test` (vitest run у корені) сам тестів не шукає: лише чотири проєкти нижче, кожен у своїй теці.
// Тож не збираються робочі дерева агентів (.claude/worktrees), .superpowers, dist, node_modules і наскрізні
// тести (apps/server/e2e — окремо: pnpm e2e зі своїм apps/server/e2e/vitest.config.ts).
// Середовище не задаємо: веб-тести самі вмикають jsdom коментарем `// @vitest-environment jsdom`.
// На слабкій машині: pnpm test --maxWorkers=2. Один пакет: pnpm test --project web.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'shared', root: './packages/shared', include: ['src/**/*.test.ts'] } },
      { test: { name: 'engine', root: './packages/engine', include: ['src/**/*.test.ts'] } },
      { test: { name: 'server', root: './apps/server', include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'] } },
      { test: { name: 'web', root: './apps/web', include: ['src/**/*.test.{ts,tsx}'] } },
    ],
  },
});
