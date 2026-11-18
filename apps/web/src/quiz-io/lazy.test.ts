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
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

const files = sources(src).filter((file) => !/\.test\.tsx?$/.test(file));
const rel = (file: string) => file.slice(src.length + 1);
/** Статичні імпорти й реекспорти (не `import type`, не `import(`). */
const staticImports = (code: string) => Array.from(code.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s+['"]([^'"]+)['"]/gm), (m) => m[1]!);
const LAZY = ['actions', 'quiz-file', 'xlsx', 'table', 'table-words', 'transfer', 'media'];

describe('quiz-io loads only on use', () => {
  it('the scanner sees imports wrapped over several lines', () => {
    const wrapped = ["import {", "  a,", "  b,", "} from '../quiz-io/actions';", "import type { X } from '../quiz-io/table';", "import { c } from './ok';"].join('\n');
    expect(staticImports(wrapped)).toEqual(['../quiz-io/actions', './ok']);
    expect(staticImports(["export {", "  p", "} from './table';"].join('\n'))).toEqual(['./table']);
  });

  it('fflate is imported only by the quiz file and the xlsx modules', () => {
    const users = files.filter((file) => /from\s+['"]fflate['"]/.test(read(file))).map(rel).sort();
    expect(users).toEqual(['quiz-io/quiz-file.ts', 'quiz-io/xlsx.ts']);
  });

  it('no file outside quiz-io imports the heavy modules statically', () => {
    const bad = files
      .filter((file) => !rel(file).startsWith('quiz-io/'))
      .filter((file) => staticImports(read(file)).some((spec) => new RegExp(`quiz-io/(${LAZY.join('|')})$`).test(spec)));
    expect(bad.map(rel)).toEqual([]);
  });

  it('the menu and the dialog reach actions only through import()', () => {
    for (const name of ['ExportMenu.tsx', 'ImportDialog.tsx']) {
      const code = read(`${src}/quiz-io/${name}`);
      expect(staticImports(code).filter((spec) => spec === './actions'), name).toEqual([]);
      expect(code, name).toContain("import('./actions')");
    }
  });
});
