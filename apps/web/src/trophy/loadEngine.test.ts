// Типів node у вебі немає, тож fs описано тут вручну.
// @ts-expect-error node:fs без @types/node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('./engine/trophy-engine');
  vi.resetModules();
});

describe('loadTrophyEngine', () => {
  it('a failed chunk gives null and is not loaded again', async () => {
    const factory = vi.fn(() => {
      throw new Error('chunk failed');
    });
    vi.doMock('./engine/trophy-engine', factory);
    const { loadTrophyEngine } = await import('./loadEngine');
    await expect(loadTrophyEngine()).resolves.toBeNull();
    await expect(loadTrophyEngine()).resolves.toBeNull();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('a loaded engine is the same object twice', async () => {
    const engine = { mount: vi.fn() };
    const factory = vi.fn(() => ({ engine }));
    vi.doMock('./engine/trophy-engine', factory);
    const { loadTrophyEngine } = await import('./loadEngine');
    const first = await loadTrophyEngine();
    expect(first).toBe(engine);
    expect(await loadTrophyEngine()).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

interface Entry {
  name: string;
  isDirectory(): boolean;
}
const list = readdirSync as (dir: string, options: { withFileTypes: true }) => Entry[];
const read = (file: string) => readFileSync(file, 'utf8') as string;
const src = ['apps/web/src', 'src'].find((path) => existsSync(path) as boolean)!;

function sources(dir: string): string[] {
  return list(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('three stays lazy', () => {
  it('is imported only under trophy/engine, and the engine only through import()', () => {
    const files = sources(src).map((file) => file.slice(src.length + 1));
    const threeUsers = files.filter((file) => /from\s*'three(\/[^']*)?'/.test(read(`${src}/${file}`)));
    expect(threeUsers.length).toBeGreaterThan(0);
    for (const file of threeUsers) expect(file).toMatch(/^trophy\/engine\//);
    const engineUsers = files.filter(
      (file) => !file.startsWith('trophy/engine/') && !file.endsWith('.test.ts') && read(`${src}/${file}`).includes('engine/'),
    );
    expect(engineUsers).toEqual(['trophy/loadEngine.ts']);
    const code = read(`${src}/trophy/loadEngine.ts`);
    expect(code).toMatch(/import\(\s*'\.\/engine\/trophy-engine'\s*\)/);
    expect(code).not.toMatch(/from\s*'\.\/engine\//);
  });
});
