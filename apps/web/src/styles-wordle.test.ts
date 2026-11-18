// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string;

describe('«Вгадай слово»: сцена', () => {
  it('на розкритті (є бали) тримає запас під кутом «Читати вголос», з реакціями й без них', () => {
    expect(css).toContain('.app.stage:has(> .stage-speech):has(.wordle-board .score) {');
    expect(css).toContain('.app.stage.has-reactions:has(> .stage-speech):has(.wordle-board .score) {');
  });

  it('дванадцять гравців стоять в один ряд: колонка не ширша за 5,2 rem', () => {
    expect(css).toMatch(/\.wordle-board\.is-many \{\s*grid-template-columns: repeat\(auto-fill, minmax\(5\.2rem, 1fr\)\);/);
  });
});
