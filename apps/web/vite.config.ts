import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import react from '@vitejs/plugin-react';
import { build, defineConfig, type Plugin } from 'vite';

/** Після збірки кладе поруч із мапами dist/maps/*.svg стиснені .br і .gz: сервер віддає їх сам (preCompressed). */
function compressMaps(): Plugin {
  let outDir = 'dist';
  return {
    name: 'quiz-compress-maps',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const dir = join(outDir, 'maps');
      for (const name of readdirSync(dir).filter((file) => file.endsWith('.svg'))) {
        const file = join(dir, name);
        const body = readFileSync(file);
        writeFileSync(`${file}.br`, brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
        writeFileSync(`${file}.gz`, gzipSync(body, { level: 9 }));
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
  plugins: [react(), compressMaps(), serviceWorker()],
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
