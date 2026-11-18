// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string;

/** Тіло правила з точним і єдиним селектором (перше входження, не частина списку через кому). */
const rule = (selector: string) => {
  let at = css.indexOf(`\n${selector} {`);
  while (at > 0 && css[at - 1] === ',') at = css.indexOf(`\n${selector} {`, at + 1);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
};

describe('«Вгадай слово»: телефон', () => {
  it('клітинку сітки задає висота вікна: сітка, легенда, клавіші й «Перевірити» вміщаються в 360×740', () => {
    // Запас 36 rem враховує й нижнє поле телефона під сповіщення (--notice-room, 4 rem).
    expect(rule('.wordle-play')).toContain('--wordle-room: 36rem');
    expect(rule('.wordle-play')).toMatch(/--wordle-cell: clamp\(1\.5rem, calc\(\(100vh - var\(--wordle-room\)\) \/ 6\), 3\.25rem\)/);
    expect(css).toMatch(/@supports \(height: 1dvh\) \{\s*\.wordle-play \{\s*--wordle-cell: clamp\(1\.5rem, calc\(\(100dvh - var\(--wordle-room\)\) \/ 6\), 3\.25rem\);/);
    expect(rule('.app.player.has-reactions .wordle-play')).toContain('--wordle-room: calc(36rem + var(--reaction-strip-h))');
    expect(rule('.wordle-play .wordle-row')).toContain('minmax(0, var(--wordle-cell))');
    expect(rule('.wordle-play .wordle-keys')).toContain('margin-inline: calc(0.25rem - var(--app-pad))');
    // Клавіші виходять за зону дебафів: та не гортається вбік (clip), а крайні клавіші видно (clip-margin).
    expect(rule('.debuff-zone:has(.wordle-play)')).toContain('overflow: clip');
    expect(rule('.debuff-zone:has(.wordle-play)')).toContain('overflow-clip-margin: var(--app-pad)');
  });

  it('підсумок (вгадано / розкриття) лишає свої більші клітинки', () => {
    expect(css).not.toMatch(/\.wordle-outcome \.wordle-row \{[^}]*--wordle-cell/);
  });
});

describe('«Вгадай слово»: сцена', () => {
  it('на розкритті (є бали) тримає запас під кутом «Читати вголос», з реакціями й без них', () => {
    expect(css).toContain('.app.stage:has(> .stage-speech):has(.wordle-board .score) {');
    expect(css).toContain('.app.stage.has-reactions:has(> .stage-speech):has(.wordle-board .score) {');
  });

  it('дошки стоять по центру, клітинку задає місце (--boards, --lines), а не фіксований розмір', () => {
    const board = rule('.wordle-board');
    expect(board).toContain('display: flex');
    expect(board).toContain('justify-content: center');
    expect(board).toMatch(/--board-cell: clamp\(0\.85rem, min\(.*var\(--boards, 1\).*var\(--lines, 1\).*\), 2\.75rem\)/);
    expect(rule('.wordle-board .wordle-row')).toContain('repeat(var(--letters), var(--board-cell))');
    expect(css).not.toMatch(/\.wordle-board\.is-many \.wordle-row \{/);
    expect(rule('.wordle-answer-word')).toContain('font-size: clamp(2rem, 7vh, 3rem)');
  });
});
