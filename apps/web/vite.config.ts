import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import react from '@vitejs/plugin-react';
import { build, defineConfig, type Plugin } from 'vite';

/**
 * Після збірки кладе поруч із мапами dist/maps/*.svg і хешованими dist/assets/*.{js,css} (понад 1 КБ) стиснені
 * .br (q11) і .gz (-9): сервер віддає їх сам (preCompressed), а Cloudflare передає brotli з origin як є.
 * Головний чанк важить 565 КБ при brotli на льоту і 435 КБ при q11 (32).
 */
function precompress(): Plugin {
  let outDir = 'dist';
  const targets: { dir: string; match: RegExp }[] = [
    { dir: 'maps', match: /\.svg$/ },
    { dir: 'assets', match: /\.(js|css)$/ },
  ];
  return {
    name: 'quiz-precompress',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const { dir, match } of targets) {
        const folder = join(outDir, dir);
        if (!existsSync(folder)) continue;
        for (const name of readdirSync(folder).filter((file) => match.test(file))) {
          const file = join(folder, name);
          const body = readFileSync(file);
          if (body.length <= 1024) continue;
          writeFileSync(`${file}.br`, brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: body.length } }));
          writeFileSync(`${file}.gz`, gzipSync(body, { level: 9 }));
        }
      }
    },
  };
}

/** Збирає src/sw.ts окремим класичним скриптом dist/sw.js (IIFE, без хешу): модульні сервіс-воркери в Safari ненадійні. */
function serviceWorker(): Plugin {
  let root = '.';
  let outDir = 'dist';
  return {
    name: 'quiz-service-worker',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await build({
        root,
        configFile: false,
        logLevel: 'warn',
        publicDir: false,
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          lib: { entry: resolve(root, 'src/sw.ts'), formats: ['iife'], name: 'quizSw', fileName: () => 'sw.js' },
        },
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), precompress(), serviceWorker()],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
      '/stickers': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
