// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string;
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Тіло блока, що починається з `head` (до парної дужки); null, якщо такого немає. */
function block(source: string, head: string, from = 0): string | null {
  const start = source.indexOf(head, from);
  if (start < 0) return null;
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}' && --depth === 0) return source.slice(open + 1, index);
  }
  return null;
}

/** Усі @media (min-width: …) верхнього рівня: ширина й тіло. */
function minWidthMedia(source: string): { width: string; body: string }[] {
  const out: { width: string; body: string }[] = [];
  for (const match of source.matchAll(/@media \(min-width: (\d+)px\)\s*\{/g)) {
    const body = block(source, match[0], match.index);
    if (body !== null) out.push({ width: match[1]!, body });
  }
  return out;
}

/** Правила (селектор і тіло) без вкладених блоків; @media розкриваються, тож вкладені правила теж видно. */
function rules(source: string): { selector: string; body: string }[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1]!.trim(), body: match[2]! }));
}

const topRule = (selector: string) => topLevel(selector);
const inBig = (selector: string) =>
  minWidthMedia(clean)
    .filter(({ width }) => width === '1024')
    .flatMap(({ body }) => rules(body))
    .filter((rule) => rule.selector.replace(/\s+/g, ' ').includes(selector));

describe('67 wide layout tokens', () => {
  it('declares the width tokens once, in the first :root, with the pre-67 numbers below 1024 px', () => {
    const root = /^:root\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';
    for (const token of ['--w-phone: 34rem;', '--w-tablet: 46rem;', '--w-read: 42rem;', '--w-form: 36rem;', '--w-editor: 68rem;', '--w-stage-board: 60rem;']) {
      expect(root, token).toContain(token);
    }
    for (const name of ['--w-page', '--w-player', '--w-host', '--w-admin', '--side-w', '--card-min']) expect(root, name).toContain(`${name}:`);
  });

  it('the page column is a token: .app reads --app-w, falling back to the phone width', () => {
    const body = topRule('.app');
    expect(body).toContain('max-width: var(--app-w, var(--w-phone));');
    expect(body).toContain('--app-pad: 1.25rem;');
  });

  it('below 1024 px the modifiers keep their old widths', () => {
    expect(topRule('.app.host')).toContain('--app-w: var(--w-tablet);');
    expect(topRule('.app.wide,\n.app.editor')).toContain('--app-w: var(--w-tablet);');
    expect(topRule('.app.editor')).toContain('--app-w: var(--w-editor);');
    const offenders = rules(clean.slice(0, clean.indexOf('@media (min-width: 1024px)')))
      .filter(({ selector }) => /^\.app(\.|,|$)/.test(selector) && /max-width:\s*(34|46|68)rem/.test(topLevel(selector)));
    expect(offenders.map(({ selector }) => selector)).toEqual([]);
  });

  it('every rule for big screens sits inside min-width 1024, 1280 or 1600 px', () => {
    const widths = minWidthMedia(clean).filter(({ body }) => /--app-w|--w-/.test(body)).map(({ width }) => width);
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.filter((width) => !['1024', '1280', '1600'].includes(width))).toEqual([]);
  });

  it('no stacking context and no containment on the page column', () => {
    const BAD = /(container-type|contain\s*:|position:\s*sticky|isolation|z-index|transform|filter|opacity|will-change)/;
    // Лише правила самої колонки: селектор складається з .app-класів без нащадків.
    const COLUMN = /^\.(app|host-cols|host-main|host-side|admin-body)(\.[\w-]+|:[\w-]+\([^)]*\))*$/;
    const offenders = rules(clean).filter(({ selector, body }) => selector.split(',').some((part) => COLUMN.test(part.trim())) && BAD.test(body));
    expect(offenders.map(({ selector }) => selector)).toEqual([]);
  });

  it('the sticky timer row follows the column width', () => {
    expect(topRule('.timer-sticky-row')).toContain('max-width: var(--w-phone);');
    expect(topRule('.timer-sticky.is-host .timer-sticky-row')).toContain('max-width: var(--w-tablet);');
    expect(inBig('.timer-sticky.is-host .timer-sticky-row')[0]?.body).toContain('max-width: var(--w-host);');
    expect(inBig('.timer-sticky:not(.is-host) .timer-sticky-row')[0]?.body).toContain('max-width: var(--w-player);');
  });

  it('on a computer the pages and the host grow, running text keeps a readable line', () => {
    expect(inBig('.app.wide')[0]?.body).toContain('--app-w: var(--w-page);');
    expect(inBig('.app.host')[0]?.body).toContain('--app-w: var(--w-host);');
    expect(inBig('.app.player')[0]?.body).toContain('--app-w: var(--w-player);');
    expect(inBig('.app.wide > :is(p, .field, form)')[0]?.body).toContain('max-inline-size: var(--w-read);');
    expect(inBig('.admin-body > :is(p, .field, form:not(.admin-filters))')[0]?.body).toContain('max-inline-size: var(--w-read);');
  });
});

describe('67 the player phone screen on a computer', () => {
  it('on a computer the player phone screen is wider, the waiting pages stay narrow', () => {
    expect(inBig('.app.player')[0]?.body).toContain('--app-w: var(--w-player);');
    const touched = minWidthMedia(clean).flatMap(({ body }) => rules(body)).filter(({ selector, body }) => selector.includes('.app.narrow') && /--app-w|max-width/.test(body));
    expect(touched.map(({ selector }) => selector)).toEqual([]);
  });

  it('on a computer text choices stand in two columns, picture choices in three', () => {
    expect(inBig('.app.player .choices')[0]?.body).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(inBig('.app.player .choices.has-images')[0]?.body).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
  });

  it('from 1600 px the player column is 70 rem and the question and choice text grow', () => {
    const big = minWidthMedia(clean).find(({ width }) => width === '1600')?.body ?? '';
    expect(big).toContain('--w-player: 70rem;');
    expect(rules(big).find((rule) => rule.selector === '.app.player .question')?.body).toContain('font-size: 2.3rem;');
    expect(rules(big).find((rule) => rule.selector === '.app.player .choice')?.body).toContain('font-size: 1.25rem;');
  });

  it('answer fields keep a readable width and the duel bar follows the column', () => {
    expect(inBig('.app.player .field')[0]?.body).toContain('max-inline-size: var(--w-read);');
    expect(inBig('.app.player > .duel-banner')[0]?.body).toContain('max-width: min(calc(100vw - 2rem), var(--app-w, 30rem));');
    // Смуга на сцені (.app.stage без --app-w) не звужується.
    expect(inBig('.duel-banner').filter((rule) => !rule.selector.includes('.app.player >'))).toEqual([]);
    expect(inBig('.app.player .field + .btn')[0]?.body).toContain('max-inline-size: var(--w-read);');
    expect(inBig('.has-images:has(> :nth-child(4):last-child)')[0]?.body).toContain('repeat(2, minmax(0, 1fr))');
  });
});

describe('67 host console columns', () => {
  it('the lobby is one wide area, not a split with an empty main column', () => {
    const big = rules(minWidthMedia(clean).find(({ width }) => width === '1280')?.body ?? '');
    expect(big.find((rule) => rule.selector === '.host-cols.is-lobby')?.body).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(big.find((rule) => rule.selector === '.host-cols.is-lobby .host-side')?.body).toContain('repeat(auto-fit');
  });

  it('host columns are invisible wrappers below 1280 px and a grid from 1280 px', () => {
    const selectorOf = (rule: { selector: string }) => rule.selector.split(/[\s,]+/).join(' ');
    expect(rules(clean).find((rule) => selectorOf(rule) === '.host-cols .host-main .host-side')?.body).toContain('display: contents;');
    const big = rules(minWidthMedia(clean).find(({ width }) => width === '1280')?.body ?? '');
    const cols = big.find((rule) => rule.selector === '.host-cols')?.body ?? '';
    expect(cols).toContain('display: grid;');
    expect(cols).toContain('grid-template-columns: minmax(0, 1fr) var(--side-w);');
    const column = big.find((rule) => selectorOf(rule) === '.host-main .host-side')?.body ?? '';
    expect(column).toContain('display: flex;');
    expect(column).toContain('flex-direction: column;');
    expect(column).toContain('gap: 1.25rem;');
    expect(big.find((rule) => rule.selector === '.host-side .team-forms')?.body).toContain('grid-template-columns: minmax(0, 1fr);');
  });
});

describe('67 stage boards', () => {
  it('stage boards read one token and grow only from 1600 px', () => {
    const all = rules(clean);
    const top = (selector: string) => all.find((rule) => rule.selector === selector)?.body ?? '';
    expect(top('.stage-board')).toContain('width: min(100%, var(--w-stage-board));');
    expect(top('.stage-survey .survey-board')).toContain('max-width: var(--w-stage-board);');
    expect(top('.stage-bluff .bluff-board')).toContain('max-width: var(--w-stage-board);');
    for (const selector of ['.quest-stage-prompt', '.quest-stage .quest-lock', '.quest-table-wrap']) expect(top(selector), selector).toContain('max-width: var(--w-stage-board);');
    const media = minWidthMedia(clean);
    const changing = media.filter(({ body }) => rules(body).some((rule) => rule.selector === ':root' && rule.body.includes('--w-stage-board')));
    expect(changing.map(({ width }) => width)).toEqual(['1600']);
    expect(changing[0]!.body).toContain('--w-stage-board: 76rem;');
    // Усе, що в розділі 67 торкається сцени, — лише від 1600 px.
    const stageIn = media.filter(({ width, body }) => width !== '1600' && /--w-|--app-w/.test(body) && rules(body).some((rule) => /\.stage|\.truth-stage/.test(rule.selector)));
    expect(stageIn.map(({ width }) => width)).toEqual([]);
    const big = rules(media.find(({ width }) => width === '1600')?.body ?? '');
    expect(big.find((rule) => rule.selector === '.stage .question-video')?.body).toContain('max-width: min(100%, calc(62vh * 16 / 9));');
  });
});

describe('67 quiz editor', () => {
  it('the editor grows with --w-editor, the question list column grows with the screen', () => {
    const media = minWidthMedia(clean);
    const at = (width: string, selector: string) => media.filter((item) => item.width === width).flatMap(({ body }) => rules(body)).find((rule) => rule.selector === selector)?.body ?? '';
    expect(at('1280', '.editor-grid')).toContain('grid-template-columns: minmax(0, clamp(19rem, 22vw, 26rem)) minmax(0, 1fr);');
    expect(at('1280', '.editor-quiz')).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(at('1280', '.editor-quiz')).toContain('align-items: start;');
    expect(at('1280', '.editor-quiz > .field')).toContain('grid-column: 1 / -1;');
    expect(at('1600', '.answer-rows.option-rows')).toContain('repeat(2, minmax(0, 1fr))');
    expect(topLevel('.app.editor')).toContain('--app-w: var(--w-editor);');
  });
});

describe('67 admin', () => {
  it('admin: tabs on the side from 1280 px, card lists as a grid, row lists in one column', () => {
    const media = minWidthMedia(clean);
    const at = (width: string, selector: string) => media.filter((item) => item.width === width).flatMap(({ body }) => rules(body)).find((rule) => rule.selector === selector)?.body ?? '';
    expect(at('1024', '.app.admin-page')).toContain('--app-w: var(--w-admin);');
    expect(at('1024', '.admin-list:not(.is-rows)')).toContain('repeat(auto-fill, minmax(var(--card-min), 1fr))');
    expect(at('1280', '.app.admin-page')).toContain('display: grid;');
    expect(at('1280', '.app.admin-page')).toContain('grid-template-columns: minmax(12rem, 15rem) minmax(0, 1fr);');
    expect(at('1280', '.admin-page > .brand')).toContain('grid-column: 1 / -1;');
    expect(at('1280', '.admin-page > .admin-tabs')).toContain('flex-direction: column;');
    expect(at('1280', '.admin-page > .admin-tabs')).toContain('overflow-x: visible;');
    // Нижче 1280 вкладки лишаються рядком: сітка адмінки лише в min-width: 1280.
    expect(topLevel('.admin-body')).toContain('flex-direction: column;');
  });
});

describe('67 lists, start, history', () => {
  /** Правила з усіх @media (min-width: width), чий селектор містить part. */
  const found = (width: string, part: string) =>
    minWidthMedia(clean).filter((item) => item.width === width).flatMap(({ body }) => rules(body)).filter((rule) => rule.selector.replace(/\s+/g, ' ').includes(part));

  it('lists become card grids on a computer', () => {
    const list = found('1024', '.quiz-list')[0];
    expect(list?.body).toContain('grid-template-columns: repeat(auto-fill, minmax(var(--card-min), 1fr));');
    expect(list?.selector).toMatch(/\.library-list[\s\S]*\.feed-list/);
    expect(found('1024', '.start-menu')[0]?.body).toContain('repeat(auto-fit, minmax(12rem, 1fr))');
    expect(found('1024', '.app.start')[0]?.body).toContain('--app-w: 64rem;');
  });

  it('a library quiz takes the wide page (its text keeps the reading width), help lays topic cards out as a grid', () => {
    expect(found('1024', '.app.library-quiz')).toEqual([]);
    const help = found('1024', '.host-help > section').find((rule) => rule.body.includes('display: grid;'));
    expect(help?.body).toContain('grid-template-columns: repeat(auto-fill, minmax(26rem, 1fr));');
    expect(found('1024', '.host-help > section > h2')[0]?.body).toContain('grid-column: 1 / -1;');
  });

  it('a finished game page lays its panels out in two columns from 1280 px', () => {
    const grid = found('1280', '.app.game-history').find((rule) => rule.body.includes('display: grid;'));
    expect(grid?.body).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    const full = found('1280', '.app.game-history > :is(')[0];
    expect(full?.body).toContain('grid-column: 1 / -1;');
    expect(full?.selector).toContain('.wide-panel');
  });
});

describe('67 profile, groups, friends', () => {
  const found = (width: string, part: string) =>
    minWidthMedia(clean).filter((item) => item.width === width).flatMap(({ body }) => rules(body)).filter((rule) => rule.selector.replace(/\s+/g, ' ').includes(part));

  it('the profile keeps two columns from 960 px and grows with --w-page', () => {
    const wide = found('960', '.app.profile-main')[0];
    expect(wide?.body).toContain('display: grid;');
    expect(wide?.body).not.toContain('max-width: 64rem');
    // 960–1023 px — як до 67 (власний @media з обома межами); від 1024 колонку веде .app.wide.
    const tablet = block(clean, '@media (min-width: 960px) and (max-width: 1023px)') ?? '';
    expect(tablet).toContain('.app.profile-main');
    expect(tablet).toContain('--app-w: 64rem;');
    expect(found('1024', '.app.wide')[0]?.body).toContain('--app-w: var(--w-page);');
    expect(found('1600', '.app.profile-main')[0]?.body).toContain('grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);');
  });

  it('profile sub pages: card lists as grids, settings and one-action pages at a form width', () => {
    const list = found('1024', '.group-cards')[0];
    expect(list?.selector).toMatch(/\.friend-list[\s\S]*\.group-item-list[\s\S]*\.liked-list[\s\S]*\.prize-list/);
    expect(list?.body).toContain('display: grid;');
    expect(list?.body).toContain('grid-template-columns: repeat(auto-fill, minmax(var(--card-min), 1fr));');
    // 1024–1279: налаштування — колонка планшета (не вужча, ніж до 67); виклик і запрошення — форма.
    expect(found('1024', '.app.settings-page')[0]?.body).toContain('--app-w: var(--w-tablet);');
    const form = found('1024', '.app.challenge-page')[0];
    expect(form?.selector).toContain('.app.group-join');
    expect(form?.body).toContain('--app-w: var(--w-form);');
    // Сітки на сторінці (.app має min-height 100dvh) не розтягують рядки.
    for (const selector of ['.app.settings-page', '.app.game-history']) expect(found('1280', selector).find((rule) => rule.body.includes('display: grid;'))?.body, selector).toContain('align-content: start;');
    // Від 1280 налаштування — дві колонки.
    const settings = found('1280', '.app.settings-page').find((rule) => rule.body.includes('display: grid;'));
    expect(settings?.body).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(found('1280', '.app.settings-page > :is(')[0]?.body).toContain('grid-column: 1 / -1;');
    // «Учасники» групи: запрошення й склад — двома колонками.
    const members = found('1280', ".group-page [role='tabpanel']:has(> .group-invite-panel)").find((rule) => rule.body.includes('display: grid;'));
    expect(members?.body).toContain('grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);');
  });
});

/** Тіло верхньорівневого правила з цим селектором (для .app, .app.host тощо). */
function topLevel(selector: string): string {
  return rules(clean).find((rule) => rule.selector === selector)?.body ?? '';
}
