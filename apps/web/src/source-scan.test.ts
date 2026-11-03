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

/** Файли, де українські рядки дозволені: словники, граматика, вміст власника, назви мов, фікстури. */
const ALLOWED = ['i18n.ts', 'help/help-uk.ts', 'push/push-strings.ts', 'locales/grammar.ts', 'locales/locales.ts', 'locales/review-sheet.ts', 'demo-quiz.ts'];

function allowed(file: string): boolean {
  if (ALLOWED.includes(file)) return true;
  if (/\.test\.tsx?$/.test(file) || /-fixtures\.ts$/.test(file) || /(^|\/)team-test-view\.ts$/.test(file)) return true;
  return file.split('/').includes('__fixtures__');
}

function sources(dir: string): string[] {
  return list(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

const CYRILLIC = /[Ѐ-ӿ]/;

/**
 * Вирізає коментарі `//` і `/* *\/` (зокрема JSX `{/* *\/}`), лишаючи рядки, шаблони, регулярні вирази й JSX-текст.
 * Переноси рядків зберігаються, щоб номери рядків лишилися правильними.
 */
function stripComments(code: string): string {
  let out = '';
  let i = 0;
  // Чи може тут починатися регулярний вираз (а не ділення).
  const regexAllowed = () => {
    const before = out.replace(/\s+$/, '');
    if (before === '') return true;
    if (/[(,=:[!&|?{};+\-*%<>~^]$/.test(before)) return true;
    return /\b(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/.test(before);
  };
  while (i < code.length) {
    const ch = code[i]!;
    const next = code[i + 1];
    if (ch === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      out += code.slice(i, stop).replace(/[^\n]/g, '');
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== ch) {
        if (code[j] === '\\') j += 1;
        else if (ch !== '`' && code[j] === '\n') break;
        j += 1;
      }
      out += code.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '/' && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      while (j < code.length && code[j] !== '\n' && (inClass || code[j] !== '/')) {
        if (code[j] === '\\') j += 1;
        else if (code[j] === '[') inClass = true;
        else if (code[j] === ']') inClass = false;
        j += 1;
      }
      out += code.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function violations(file: string): string[] {
  const lines = stripComments(read(`${src}/${file}`)).split('\n');
  return lines.flatMap((line, index) => (CYRILLIC.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : []));
}

describe('source scan', () => {
  it('strips comments but keeps literals', () => {
    const code = [`const a = 'так'; // коментар`, `/* блок`, `ще */ const b = "x";`, `<p>{/* jsx */}Текст</p>`, `const r = /а\\/б/; const url = 'http://x';`].join('\n');
    const stripped = stripComments(code).split('\n');
    expect(stripped).toHaveLength(5);
    expect(stripped[0]).toBe(`const a = 'так'; `);
    expect(stripped[1]).toBe('');
    expect(stripped[2]).toBe(` const b = "x";`);
    expect(stripped[3]).toBe('<p>{}Текст</p>');
    expect(stripped[4]).toBe(`const r = /а\\/б/; const url = 'http://x';`);
  });

  it('finds no Cyrillic literals outside the dictionaries, grammar, fixtures and tests', () => {
    const files = sources(src)
      .map((file) => file.slice(src.length + 1))
      .filter((file) => !allowed(file));
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap(violations)).toEqual([]);
  });
});
