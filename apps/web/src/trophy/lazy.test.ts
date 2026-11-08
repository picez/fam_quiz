// Типів node у вебі немає, тож fs описано тут вручну.
// @ts-expect-error node:fs без @types/node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Entry {
  name: string;
  isDirectory(): boolean;
}
const list = readdirSync as (dir: string, options: { withFileTypes: true }) => Entry[];
const read = (file: string) => readFileSync(file, 'utf8') as string;
const src = ['apps/web/src', 'src'].find((path) => existsSync(path) as boolean)!;
const web = src.slice(0, -'/src'.length) || '.';

function sources(dir: string): string[] {
  return list(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const relative = (file: string) => file.slice(src.length + 1);
const isTest = (file: string) => /\.test\.tsx?$/.test(file);
/** Модуль three чи його addons у рядку імпорту (статичному чи динамічному). */
const THREE = /(?:from\s*|import\s*\(?\s*)'three(?:\/[^']*)?'/;
/** Усі статичні імпорти файлу: шляхи після from чи голого import. */
const staticImports = (code: string) => [...code.matchAll(/^\s*import\s[^;]*?from\s*'([^']+)'|^\s*import\s*'([^']+)'/gm)].map((m) => (m[1] ?? m[2])!);
const MODEL_VIEWER = ['@google', 'model-viewer'].join('/');

describe('three stays lazy', () => {
  it('three is named only in trophy/engine/', () => {
    const users = sources(src)
      .filter((file) => THREE.test(read(file)))
      .map(relative)
      .filter((file) => !file.startsWith('trophy/engine/'));
    expect(users).toEqual([]);
  });

  it('trophy/engine/ is statically imported only by trophy/engine/ and tests', () => {
    const outside = sources(src)
      .filter((file) => !relative(file).startsWith('trophy/engine/') && !isTest(file))
      .filter((file) => staticImports(read(file)).some((path) => /(^|\/)engine\//.test(path)))
      .map(relative);
    expect(outside).toEqual([]);
  });

  it('loadEngine.ts reaches the engine only by import()', () => {
    const code = read(`${src}/trophy/loadEngine.ts`);
    expect(code).toMatch(/import\(\s*'\.\/engine\/trophy-engine'\s*\)/);
    const mentions = code.match(/.*'\.\/engine\/.*/g) ?? [];
    for (const line of mentions) expect(line).toMatch(/import\(\s*'\.\/engine\/trophy-engine'\s*\)/);
    expect(code).not.toMatch(/^\s*import\s[^(]*from\s*'\.\/engine\//m);
  });

  it('model-viewer is gone from the code and the package', () => {
    const users = sources(src)
      .filter((file) => read(file).includes(MODEL_VIEWER))
      .map(relative);
    expect(users).toEqual([]);
    const pkg = JSON.parse(read(`${web}/package.json`)) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain(MODEL_VIEWER);
    expect(pkg.dependencies).toHaveProperty('three');
    expect(existsSync(`${src}/trophy/loadViewer.ts`)).toBe(false);
  });
});

describe('pure decor modules do not import three', () => {
  it.each(['anchors.ts', 'decor-layout.ts', 'decor-canvas.ts', 'engine-types.ts', 'loadEngine.ts'])('%s', (name) => {
    expect(read(`${src}/trophy/${name}`)).not.toMatch(THREE);
  });
});
