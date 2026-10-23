// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBrief, type BoardInfo, type DuelInfo, type FinalInfo, type RoundInfo, type StageView } from '@quiz/shared';
// Vitest підміняє CSS порожнім рядком (і з ?raw), тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { Splash, SplashChip } from './Splash';

const T = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const stage = (over: Partial<StageView> = {}): StageView => ({
  role: 'stage',
  phase: 'lobby',
  paused: false,
  blitz: null,
  board: null,
  spotlight: null,
  final: null,
  chain: null,
  sort: null,
  notice: null,
  buffs: [],
  buffNotice: null,
  splash: null,
  overtime: [],
  guide: null,
  newcomers: false,
  duel: null,
  debuffs: [],
  round: null,
  questionIndex: -1,
  total: 3,
  question: null,
  endsAt: null,
  remainingMs: null,
  playerCount: 0,
  answeredCount: 0,
  limitMs: null,
  held: false,
  players: [],
  reveal: null,
  stats: null,
  standings: null,
  ...over,
});

const round: RoundInfo = { index: 1, total: 3, title: 'Столиці', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null };
const finalRound: RoundInfo = { ...round, index: 2, title: 'Космос', type: 'final', brief: emptyBrief('final') };
const final: FinalInfo = { theme: 'Космос', placed: 0, total: 2, shown: [], left: 0, mode: 'classic', bank: 0, split: null };
const board: BoardInfo = {
  categories: [],
  order: [],
  turn: null,
  cell: { id: 'c1', category: 'Міста', price: 300, mark: 'x2', kind: 'normal', answerMode: 'phones', penalty: 'none' },
  dice: null,
  schedule: [],
  scheduleRepeats: false,
  skipAt: null,
} as unknown as BoardInfo;
const duel = {
  challenger: { playerId: 'p1', nickname: 'Іра' },
  opponent: { playerId: 'p2', nickname: 'Оля' },
  stage: 'category',
} as unknown as DuelInfo;

const at = (kind: NonNullable<StageView['splash']>['kind'], ms = 2000) => ({ kind, at: T, until: T + ms });

describe('Splash', () => {
  it('shows «Запитання 3 з 10» and goes away exactly at until by the server clock', () => {
    const { container } = render(
      <Splash view={stage({ phase: 'question', questionIndex: 2, total: 10, splash: { kind: 'question', at: T, until: T + 1200 } })} offsetMs={0} size="stage" />,
    );
    expect(container.querySelector('.splash.is-question')?.textContent).toContain('Запитання 3');
    expect(container.textContent).toContain('з 10');
    act(() => vi.advanceTimersByTime(1199));
    expect(container.querySelector('.splash')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector('.splash')).toBeNull();
  });

  it('a splash joined midway continues from the same point', () => {
    const view = stage({ phase: 'question', questionIndex: 0, splash: { kind: 'question', at: T - 600, until: T + 600 } });
    const { container, rerender } = render(<Splash view={view} offsetMs={0} size="stage" />);
    const layer = container.querySelector<HTMLElement>('.splash')!;
    expect(layer.style.getPropertyValue('--splash-ms')).toBe('1200ms');
    expect(layer.style.getPropertyValue('--splash-elapsed')).toBe('-600ms');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    rerender(<Splash view={view} offsetMs={300} size="stage" />);
    expect(container.querySelector<HTMLElement>('.splash')!.style.getPropertyValue('--splash-elapsed')).toBe('-900ms');
  });

  it('re-renders do not move the animation: elapsed is frozen for the same splash', () => {
    const view = stage({ phase: 'question', questionIndex: 0, splash: { kind: 'question', at: T, until: T + 1200 } });
    const { container, rerender } = render(<Splash view={view} offsetMs={0} size="stage" />);
    act(() => vi.advanceTimersByTime(500));
    rerender(<Splash view={{ ...view, answeredCount: 1 }} offsetMs={0} size="stage" />);
    expect(container.querySelector<HTMLElement>('.splash')!.style.getPropertyValue('--splash-elapsed')).toBe('0ms');
  });

  it('a new splash restarts the animation on a fresh layer', () => {
    const first = stage({ phase: 'question', questionIndex: 0, splash: { kind: 'question', at: T, until: T + 1200 } });
    const { container, rerender } = render(<Splash view={first} offsetMs={0} size="stage" />);
    const layer = container.querySelector('.splash');
    act(() => vi.advanceTimersByTime(500));
    rerender(<Splash view={{ ...first, questionIndex: 1, splash: { kind: 'question', at: T + 500, until: T + 1700 } }} offsetMs={0} size="stage" />);
    expect(container.querySelector('.splash')).not.toBe(layer);
  });

  it('a timer that fires early re-arms instead of leaving the splash forever', () => {
    const { container } = render(
      <Splash view={stage({ phase: 'question', questionIndex: 0, splash: { kind: 'question', at: T, until: T + 1200 } })} offsetMs={0} size="stage" />,
    );
    // Годинник пристрою відстає від таймера на 1 мс: таймер спрацював, а заставка ще «йде».
    const realNow = Date.now.bind(Date);
    const lag = vi.spyOn(Date, 'now').mockImplementation(() => realNow() - 1);
    act(() => vi.advanceTimersByTime(1200));
    expect(container.querySelector('.splash')).not.toBeNull();
    lag.mockRestore();
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector('.splash')).toBeNull();
  });

  it('no splash while paused or after it ended', () => {
    const { container, rerender } = render(
      <Splash view={stage({ phase: 'question', questionIndex: 0, paused: true, splash: at('question', 1200) })} offsetMs={0} size="stage" />,
    );
    expect(container.querySelector('.splash')).toBeNull();
    rerender(<Splash view={stage({ phase: 'question', questionIndex: 0, splash: { kind: 'question', at: T - 2000, until: T - 800 } })} offsetMs={0} size="stage" />);
    expect(container.querySelector('.splash')).toBeNull();
  });

  it('each kind has its own content', () => {
    const show = (view: StageView, size: 'stage' | 'phone' = 'stage') => {
      cleanup();
      return render(<Splash view={view} offsetMs={0} size={size} />).container;
    };

    let box = show(stage({ phase: 'intro', round, splash: at('round', 2500) }));
    expect(box.querySelector('.splash.is-round .splash-title')?.textContent).toBe('Раунд 2');
    expect(box.querySelector('.splash-sub')?.textContent).toBe('Столиці');

    box = show(stage({ phase: 'intro', round: finalRound, final, splash: at('final', 3200) }));
    expect(box.querySelector('.splash.is-final .splash-title')?.textContent).toBe('Фінал');
    expect(box.querySelector('.splash-sub')?.textContent).toBe('Космос');
    expect(box.querySelector('.splash-rays')).not.toBeNull();
    expect(box.querySelector('.splash-sparks')).not.toBeNull();

    box = show(stage({ phase: 'question', round: finalRound, final, questionIndex: 0, total: 1, splash: at('question', 1200) }));
    expect(box.querySelector('.splash-title')?.textContent).toBe('Запитання фіналу');
    expect(box.textContent).not.toContain('з 1');

    box = show(stage({ phase: 'question', round: { ...round, type: 'board' }, board, questionIndex: 0, splash: at('cell', 1000) }));
    expect(box.querySelector('.splash.is-cell .splash-face.is-front')?.textContent).toContain('300');
    const back = box.querySelector('.splash-face.is-back')?.textContent;
    expect(back).toContain('Міста · 300');
    expect(back).toContain('×2');

    box = show(stage({ phase: 'duel', duel, splash: at('duel') }));
    expect(box.querySelector('.splash.is-duel .splash-title')?.textContent).toBe('Дуель!');
    expect(box.querySelector('.splash-side.is-challenger')?.textContent).toBe('Іра');
    expect(box.querySelector('.splash-cross')?.textContent).toBe('⚔');
    expect(box.querySelector('.splash-side.is-opponent')?.textContent).toBe('Оля');

    box = show(stage({ phase: 'finished', splash: at('podium', 2500) }), 'phone');
    expect(box.querySelector('.splash.is-podium.is-phone .splash-title')?.textContent).toBe('Підсумки');
    expect(box.querySelector('.splash-sub')?.textContent).toBe('Хто ж переміг?');
  });

  it('the host chip shows only during a splash', () => {
    const { container } = render(<SplashChip view={stage({ phase: 'question', questionIndex: 0, splash: at('question', 1200) })} offsetMs={0} />);
    expect(container.querySelector('.splash-chip')?.textContent).toBe('На екрані заставка');
    act(() => vi.advanceTimersByTime(1200));
    expect(container.querySelector('.splash-chip')).toBeNull();
  });
});

// Тести запускаються з кореня репозиторію або з apps/web.
const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');

/** Тіло першого правила з точно цим селектором у styles.css. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
}

/** Чи стоїть позиція всередині блоку @media (prefers-reduced-motion: no-preference). */
function insideNoPreference(index: number): boolean {
  const open = css.lastIndexOf('@media (prefers-reduced-motion: no-preference) {', index);
  if (open < 0) return false;
  // Блок @media закривається рядком «}» без відступу.
  const close = css.indexOf('\n}\n', open);
  return close > index;
}

describe('splash styles', () => {
  it('the splash is a fixed layer and moves only without reduced motion', () => {
    expect(rule('.splash')).toContain('position: fixed');
    expect(rule('.splash')).toContain('inset: 0');
    // Згасла (fill both) заставка ніколи не лишає невидимий шар, що ковтає натискання.
    expect(rule('.splash')).toContain('pointer-events: none');
    expect(rule('.splash')).toContain('splash-fade');
    const fade = css.slice(css.indexOf('@keyframes splash-fade'), css.indexOf('}\n}', css.indexOf('@keyframes splash-fade')));
    expect(fade).toContain('opacity');
    expect(fade).not.toContain('transform');
    expect(insideNoPreference(css.indexOf('@keyframes splash-fade'))).toBe(false);
    for (const name of ['splash-zoom', 'splash-rays', 'splash-sparks', 'splash-flip', 'splash-slide-left', 'splash-slide-right']) {
      const index = css.indexOf(`@keyframes ${name} `);
      expect(index, name).toBeGreaterThanOrEqual(0);
      expect(insideNoPreference(index), name).toBe(true);
    }
  });

  // «Запитання» заголовком 9rem ширше за 60rem: у вужчій картці слово ламалося посеред літер («Запитанн / я 1»).
  it('the title card takes the whole layer width, so «Запитання N» on the stage never breaks inside the word', () => {
    expect(rule('.splash-card')).toContain('max-width: 100%');
    expect(rule('.splash-card')).not.toContain('rem');
  });

  // Знімок transition8c-round-stage: крізь напівпрозорий шар проступав вступ раунду («Раунд 1 з 3», опис).
  it('on its plateau the splash hides the screen under it completely, for every kind', () => {
    const bg = /--splash-bg:\s*([^;]+);/.exec(css)?.[1].trim() ?? '';
    expect(bg).toMatch(/^(#[0-9a-f]{6}|rgb\(\d+ \d+ \d+\))$/i);
    // Кожен шар із власним тлом закінчується непрозорим var(--splash-bg); прозорість (opacity) — лише в анімації.
    for (const selector of ['.splash', '.splash.is-final']) {
      expect(rule(selector).replace(/\s+/g, ' '), selector).toMatch(/background: [^;]*var\(--splash-bg\);/);
    }
    for (const kind of ['round', 'final', 'question', 'cell', 'duel', 'podium']) {
      for (const size of ['', '.is-stage', '.is-phone']) {
        const selector = `.splash.is-${kind}${size}`;
        if (!css.includes(`\n${selector} {`)) continue;
        const body = rule(selector).replace(/\s+/g, ' ');
        expect(body, selector).not.toContain('opacity');
        // Власне тло виду — шари поверх непрозорого var(--splash-bg) останнім.
        if (body.includes('background:')) expect(body, selector).toMatch(/background: [^;]*var\(--splash-bg\);/);
      }
    }
    const fade = css.slice(css.indexOf('@keyframes splash-fade'), css.indexOf('}\n}', css.indexOf('@keyframes splash-fade')));
    expect(fade.replace(/\s+/g, ' ')).toContain('10% { opacity: 1; } 90% { opacity: 1; }');
  });

  it('toasts (±15 s, buffs) stay above the splash', () => {
    const z = (selector: string) => Number(/z-index:\s*(\d+)/.exec(rule(selector))?.[1]);
    expect(z('.live-notice')).toBeGreaterThan(z('.splash'));
  });

  // Знімок transition8c-question-360: «Запитання 1» ламалося на два рядки.
  it('on a 360 px phone «Запитання 12» and «Запитання фіналу» fit one line and never break inside a word', () => {
    /** font-size clamp(min, Nvw, max) у px для ширини екрана width. */
    const sizeAt = (selector: string, width: number) => {
      const match = /font-size:\s*clamp\(([\d.]+)rem,\s*([\d.]+)vw,\s*([\d.]+)rem\)/.exec(rule(selector));
      expect(match, selector).not.toBeNull();
      const [min, vw, max] = [Number(match![1]) * 16, (Number(match![2]) * width) / 100, Number(match![3]) * 16];
      return Math.min(Math.max(min, vw), max);
    };
    // Ширини в em, виміряні в Chrome для Unbounded 800 з letter-spacing -0.02em.
    const em = { question12: 8.6, finalQuestion: 12.04 };
    for (const width of [320, 360, 414]) {
      const room = width - 32; // padding шару 1rem з боків
      expect(sizeAt('.splash.is-phone .splash-title', width) * em.question12, `${width}`).toBeLessThanOrEqual(room);
      expect(sizeAt('.splash.is-phone .splash-title.is-long', width) * em.finalQuestion, `${width}`).toBeLessThanOrEqual(room);
    }
    expect(rule('.splash.is-phone .splash-title')).toContain('overflow-wrap: normal');
    for (const width of [1280, 1600, 1920]) {
      expect(sizeAt('.splash-title.is-long', width) * em.finalQuestion, `${width}`).toBeLessThanOrEqual(width - 32);
      expect(sizeAt('.splash-title', width) * em.question12, `${width}`).toBeLessThanOrEqual(width - 32);
    }
  });

  it('the host chip is fixed and never shifts the console', () => {
    expect(rule('.splash-chip')).toContain('position: fixed');
    expect(rule('.splash-chip')).toContain('pointer-events: none');
  });
});
