import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Сторожа синтаксису: tsc -p apps/server бере лише src, а скрипти запускає tsx лише вручну, тож зламаний
// скрипт (оболонка з'їла зворотні скісні риски, як у 54) ніхто не помітить. Тут кожен scripts/*.ts
// проходить через esbuild — той самий, яким tsx їх і запускає.
const here = dirname(fileURLToPath(import.meta.url));
const esbuild = createRequire(createRequire(import.meta.url).resolve('tsx'))('esbuild') as {
  transformSync: (code: string, options: { loader: 'ts'; format: 'esm'; sourcefile: string }) => unknown;
};
const files = (readdirSync(here, { recursive: true }) as string[])
  .map((f) => f.replace(/\\/g, '/'))
  .filter((f) => f.endsWith('.ts') && !f.includes('node_modules'))
  .sort();

function parseError(code: string, file: string): string | null {
  try {
    esbuild.transformSync(code, { loader: 'ts', format: 'esm', sourcefile: file });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe('scripts parse', () => {
  it('finds the scripts', () => {
    expect(files).toContain('seed-demo.ts');
  });

  it('catches a broken file', () => {
    // Обидві вади з 54: справжній розрив рядка в лапках і `//` замість `/\/` у регулярному виразі.
    expect(parseError("const s = ['a'].join('\n');", 'bad.ts')).not.toBeNull();
    expect(parseError("const t = 'x'.replace(//$/, '');", 'bad.ts')).not.toBeNull();
    expect(parseError("const t = 'x'.replace(/\\/$/, '');", 'ok.ts')).toBeNull();
  });

  it.each(files)('%s parses', (file) => {
    expect(parseError(readFileSync(join(here, file), 'utf8'), file)).toBeNull();
  });
});
