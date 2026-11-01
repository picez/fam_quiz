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

function sources(dir: string): string[] {
  return list(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('model-viewer stays lazy', () => {
  it('is named only in trophy/loadViewer.ts and only as a dynamic import', () => {
    const users = sources(src)
      .filter((file) => !file.endsWith('trophy/lazy.test.ts'))
      .filter((file) => read(file).includes('@google/model-viewer'))
      .map((file) => file.slice(src.length + 1));
    expect(users).toEqual(['trophy/loadViewer.ts']);
    const code = read(`${src}/trophy/loadViewer.ts`);
    const mentions = code.match(/.*@google\/model-viewer.*/g) ?? [];
    expect(mentions.length).toBeGreaterThan(0);
    for (const line of mentions) expect(line).toMatch(/import\(\s*'@google\/model-viewer'\s*\)/);
    expect(code).not.toMatch(/import\s[^(]*from\s*'@google\/model-viewer'/);
    expect(code).not.toMatch(/^\s*import\s*'@google\/model-viewer'/m);
  });
});
