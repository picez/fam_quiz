// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { NICK_EFFECTS } from '@quiz/shared';
import { describe, expect, it } from 'vitest';

const css = (readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string).replace(/\/\*[\s\S]*?\*\//g, '');

/** Тіла блоків з цим заголовком (з вкладеними дужками). */
function blocks(source: string, head: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(head, from);
    if (start < 0) return out;
    let depth = 0;
    let i = source.indexOf('{', start);
    const open = i;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(source.slice(open + 1, i));
    from = i;
  }
}

const motion = blocks(css, '@media (prefers-reduced-motion: no-preference)');
const keyframes = [...css.matchAll(/@keyframes (nick-fx-[\w-]+)\s*\{/g)].map((m) => ({ name: m[1]!, body: blocks(css.slice(m.index), m[0])[0]! }));
/** Прості правила (селектор { тіло }) без вкладень. */
const rulesOf = (source: string) => [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector!.trim(), body: body! }));
let still = css;
for (const block of motion) still = still.replace(block, '');
for (const frames of keyframes) still = still.replace(frames.body, '');
const fxRules = rulesOf(css).filter((r) => /nick-x-|nick-fx/.test(r.selector) && !/^\d|^from|^to/.test(r.selector));

describe('nick effects css (34)', () => {
  it.each(NICK_EFFECTS)('has a layer rule for .nick-x-%s', (id) => {
    expect(rulesOf(still).some((r) => new RegExp(`\.nick-x-${id}::(before|after)`).test(r.selector))).toBe(true);
  });

  it('adds only vertical room: padding-block and margin-block on the wrapper, nothing that widens a nickname', () => {
    const wrapper = rulesOf(still).find((r) => r.selector === '.nick-fx')!;
    expect(wrapper.body).toMatch(/padding-block:\s*0\.4em/);
    expect(wrapper.body).toMatch(/margin-block:\s*-0\.4em/);
    for (const rule of fxRules) expect(rule.body, rule.selector).not.toMatch(/(^|[;\s])(padding-inline|margin-inline|padding-left|padding-right|margin-left|margin-right|width|min-width)\s*:/);
  });

  it('every nick-fx keyframe moves only transform and opacity', () => {
    expect(keyframes.length).toBeGreaterThanOrEqual(NICK_EFFECTS.length);
    for (const { name, body } of keyframes) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
      expect(props.filter((p) => p !== 'transform' && p !== 'opacity'), name).toEqual([]);
    }
  });

  it('animates only when motion is welcome and not in easy mode, each effect at least once', () => {
    expect(fxRules.filter((r) => rulesOf(still).some((s) => s.selector === r.selector && s.body === r.body) && /(^|[;\s])animation(-name)?\s*:/.test(r.body))).toEqual([]);
    const moving = motion.flatMap(rulesOf).filter((r) => /nick-x-/.test(r.selector) && /animation\s*:\s*nick-fx-/.test(r.body));
    for (const r of moving) expect(r.selector).toMatch(/^:where\(:root:not\(\.is-easy\)\)/);
    for (const id of NICK_EFFECTS) expect(moving.some((r) => r.selector.includes(`.nick-x-${id}::`)), id).toBe(true);
  });

  it('dims the layer behind the letters in easy mode for light, flame and frost', () => {
    for (const id of ['light', 'flame', 'frost']) {
      const rule = rulesOf(still).find((r) => r.selector.includes(`:where(:root.is-easy) .nick-x-${id}::before`));
      expect(rule, id).toBeDefined();
      expect(Number(/opacity:\s*([\d.]+)/.exec(rule!.body)![1])).toBeLessThanOrEqual(0.35);
    }
  });

  it('the bolt cycle is at least 3 s (no strobe)', () => {
    const rule = motion.flatMap(rulesOf).find((r) => r.selector.includes('.nick-x-bolt::after'))!;
    expect(Number(/nick-fx-bolt\s+([\d.]+)s/.exec(rule.body)![1])).toBeGreaterThanOrEqual(3);
  });
});
