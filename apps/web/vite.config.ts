import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

interface ManifestChunk {
  file: string;
  css?: string[];
  imports?: string[];
}

/** Файли оболонки з маніфесту Vite: вхід index.html, його css і статичні імпорти (рекурсивно), з / на початку. */
function shellFiles(manifest: Record<string, ManifestChunk>): string[] {
  const files = new Set<string>();
  const seen = new Set<string>();
  const visit = (key: string): void => {
    const chunk = manifest[key];
    if (chunk === undefined || seen.has(key)) return;
    seen.add(key);
    files.add(`/${chunk.file}`);
    for (const css of chunk.css ?? []) files.add(`/${css}`);
    for (const next of chunk.imports ?? []) visit(next);
  };
  visit('index.html');
  return [...files];
}

/**
 * Збирає src/sw.ts окремим класичним скриптом dist/sw.js (IIFE, без хешу): модульні сервіс-воркери в Safari ненадійні.
 * Список файлів оболонки (__SHELL__) і версію кешу (__SHELL_VERSION__, перші 10 знаків sha256 списку) бере з
 * dist/.vite/manifest.json; сам маніфест після цього видаляє, щоб сервер його не віддавав (32).
 */
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
      const manifestDir = join(outDir, '.vite');
      const manifest = JSON.parse(readFileSync(join(manifestDir, 'manifest.json'), 'utf8')) as Record<string, ManifestChunk>;
      const shell = shellFiles(manifest);
      const version = createHash('sha256').update(JSON.stringify(shell)).digest('hex').slice(0, 10);
      await build({
        root,
        configFile: false,
        logLevel: 'warn',
        publicDir: false,
        define: { __SHELL__: JSON.stringify(shell), __SHELL_VERSION__: JSON.stringify(version) },
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          manifest: false,
          lib: { entry: resolve(root, 'src/sw.ts'), formats: ['iife'], name: 'quizSw', fileName: () => 'sw.js' },
        },
      });
      rmSync(manifestDir, { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), precompress(), serviceWorker()],
  // Маніфест потрібен воркеру: з нього береться список файлів оболонки (32). Плагін видаляє його після збірки.
  build: { manifest: true },
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
