import { describe, expect, it } from 'vitest';
// Vitest підміняє CSS порожнім рядком, тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';

// Тести запускаються з кореня репозиторію або з apps/web.
const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');

/** Тіло першого правила з точно цим селектором у styles.css. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
}

describe('the question list rows', () => {
  // 375 px: довгий текст запитання обрізається трикрапкою, а «❤️ N» і тип стоять у межах рядка. Без minmax(0, 1fr) колонка сітки
  // росте до повної ширини тексту (white-space: nowrap), і серце з типом виїжджають за край списку.
  it('the list column never grows past the list', () => {
    expect(rule('.question-list')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });
});
