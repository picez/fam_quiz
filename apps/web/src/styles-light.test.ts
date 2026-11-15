// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { NICK_COLORS } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { contrast, rootTokens, tokenColor } from './theme.test';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string;
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8') as string;

/** Змінні блока з цим селектором (перший такий блок). */
function blockTokens(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.]/g, '\\.');
  const block = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

const dark = rootTokens(css);
const light = { ...dark, ...blockTokens(':root.is-light') };
const lightEasy = { ...dark, ...blockTokens(':root.is-easy'), ...light, ...blockTokens(':root.is-light.is-easy') };

describe('light theme tokens', () => {
  it('is a light colour scheme with a light stage and dark text', () => {
    expect(/:root\.is-light\s*\{[^}]*color-scheme: light;/.test(css)).toBe(true);
    expect(light['--stage']).toBe('#f7f2f1');
    expect(light['--surface']).toBe('#ffffff');
    expect(light['--paper']).toBe('#1f1515');
  });

  it('leaves the dark theme untouched', () => {
    expect(dark['--stage']).toBe('#060505');
    expect(dark['--paper']).toBe('#f3eaea');
    expect(dark['--accent']).toBe('#e02531');
  });

  it.each([
    ['--paper', '--stage'],
    ['--paper', '--surface'],
    ['--dim', '--stage'],
    ['--dim', '--surface'],
    ['--accent-text', '--stage'],
    ['--accent-text', '--surface'],
    ['--link', '--stage'],
    ['--link', '--surface'],
    ['--on-accent', '--accent'],
    ['--correct', '--stage'],
    ['--wrong', '--stage'],
    ['--signal', '--stage'],
    ['--pending', '--stage'],
    ['--bank', '--stage'],
    ['--voice', '--stage'],
    ['--buff-accent', '--stage'],
    ['--buff-active', '--stage'],
    ['--duel-accent', '--stage'],
    ['--guide-accent', '--stage'],
    ['--appeal-accent', '--stage'],
    ['--spare-accent', '--stage'],
    ['--final-gold', '--stage'],
    ['--removed-tag', '--stage'],
    // Смуга «Помилка! Підвисання» в сортуванні й сповіщення: темний текст на світлій підкладці.
    ['--paper', '--sort-lock-strip'],
    ['--paper', '--notice-bg'],
    // Заливки зі світлим текстом --stage (банер офлайн, правильна відповідь, бейджі).
    ['--stage', '--signal'],
    ['--stage', '--correct'],
    ['--stage', '--wrong'],
    ['--stage', '--accent-text'],
    ['--stage', '--pending'],
    ['--stage', '--buff-accent'],
    ['--stage', '--buff-active'],
  ])('%s on %s reaches WCAG AA (4.5:1)', (text, background) => {
    expect(contrast(tokenColor(light, text), tokenColor(light, background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['--team-0', '--team-1', '--team-2', '--team-3', '--team-4', '--team-5'])('team colour %s keeps the light --stage name readable (3:1, bold large text)', (team) => {
    expect(contrast(tokenColor(light, '--stage'), tokenColor(light, team))).toBeGreaterThanOrEqual(3);
  });

  it('the progress track is a soft step off the stage, not a dark bar', () => {
    const ratio = contrast(tokenColor(light, '--track'), tokenColor(light, '--stage'));
    expect(ratio).toBeLessThan(1.5);
  });

  it('light + easy mode keeps dark text (not the white text of the dark easy mode)', () => {
    expect(contrast(tokenColor(lightEasy, '--paper'), tokenColor(lightEasy, '--stage'))).toBeGreaterThanOrEqual(15);
    expect(contrast(tokenColor(lightEasy, '--dim'), tokenColor(lightEasy, '--stage'))).toBeGreaterThanOrEqual(7);
  });
});

describe('light theme rules', () => {
  /** Тіла правил :where(:root.is-light) <selector> (без коментарів). */
  const lightRule = (selector: string) => {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((match) => match[1].split(',').map((part) => part.trim()).includes(`:where(:root.is-light) ${selector}`))
      .map((match) => match[2])
      .join('');
  };

  it.each(NICK_COLORS)('nick colour %s has a darker light variant readable on the surface', (id) => {
    const body = lightRule(`.nick-c-${id}`);
    const hexes = [...body.matchAll(/#([0-9a-f]{6})\b/gi)].map((match) => match[1]);
    expect(hexes.length).toBeGreaterThan(0);
    for (const hex of hexes) {
      const rgb: [number, number, number] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
      expect(contrast(rgb, [255, 255, 255]), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    '.nick-x-sparks::before',
    '.nick-x-sparks::after',
    '.nick-x-sparks > .nick-name::after',
    '.nick-x-stardust::before',
    '.nick-x-stardust::after',
    '.nick-x-stardust > .nick-name::after',
  ])('light %s draws coloured stars (no white or pastel ones) with a dark outline', (selector) => {
    const body = lightRule(selector);
    expect(body).toContain('radial-gradient');
    expect(body).not.toMatch(/#ffffff|#f5f3ff|#ede9fe|#fff7d6/i);
    expect(body).toMatch(/filter: drop-shadow/);
  });

  it('light shimmer and bolt are coloured, not the white overlay sweep and the near-white bolt of the dark theme', () => {
    expect(lightRule('.nick-x-shimmer::after')).toMatch(/content: none/);
    const sweep = lightRule('.nick-x-shimmer > .nick-name[data-fx-text]::after');
    expect(sweep).toMatch(/background-clip: text/);
    expect(sweep).toMatch(/linear-gradient\(100deg, transparent [^)]*#9333ea/);
    expect(lightRule('.nick-x-bolt::after')).toContain("stroke='%230e7490'");
  });

  it('dark nick effects stay as they were: white stars, white overlay sweep', () => {
    expect(/\n\.nick-x-stardust::before \{[^}]*#ffffff/.test(css)).toBe(true);
    expect(/\n\.nick-x-shimmer::after \{[^}]*mix-blend-mode: overlay;/.test(css)).toBe(true);
  });

  it('the light overrides come after the rules they override, so equal specificity wins', () => {
    const at = (needle: string) => css.indexOf(needle);
    expect(at(':where(:root.is-light) .nick-c-sky')).toBeGreaterThan(at('.nick-c-sky {'));
    expect(at(':where(:root.is-light) .profile-edit')).toBeGreaterThan(at('\n.profile-edit {'));
    expect(at(':where(:root.is-light) .question-image')).toBeGreaterThan(at('\n.question-image {'));
  });

  it('the wall keeps dark text on its bright tiles in both themes', () => {
    expect(dark['--ink']).toBe('#060505');
    expect(light['--ink']).toBe('#060505');
    expect(/\n\.wall-tile\.is-found\s*\{[^}]*color: var\(--ink\);/.test(css)).toBe(true);
    expect(/\n\.wall-group\s*\{[^}]*color: var\(--ink\);/.test(css)).toBe(true);
  });
});

describe('index.html', () => {
  it('sets is-light before the first paint from quiz:theme (light, or system + light scheme)', () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? '';
    expect(script).toContain("localStorage.getItem('quiz:theme')");
    expect(script).toContain("theme === 'light'");
    expect(script).toContain("theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches");
    expect(script).toContain("classList.add('is-light')");
    // Скрипт стоїть до модуля застосунку.
    expect(indexHtml.indexOf('<script>')).toBeLessThan(indexHtml.indexOf('src="/src/main.tsx"'));
  });
});
