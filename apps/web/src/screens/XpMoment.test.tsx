// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { levelProgress, xpForLevel, type GameXpMoment, type XpLine } from '@quiz/shared';
import { XpMoment, xpLineText } from './XpMoment';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function moment(over: Partial<GameXpMoment> = {}): GameXpMoment {
  const at = xpForLevel(5) + 20;
  return { gained: 165, lines: [], reason: null, before: levelProgress(at - 165 > 0 ? at - 165 : 0), after: levelProgress(at), unlocked: [], ...over };
}

const lines: XpLine[] = [
  { kind: 'join', xp: 50 },
  { kind: 'correct', xp: 30, count: 3 },
  { kind: 'place', xp: 100, place: 1 },
  { kind: 'cap', xp: -40 },
  { kind: 'achievement', xp: 25, id: 'first_game' },
];

describe('XpMoment', () => {
  it('renders nothing without a slice', () => {
    const { container } = render(<XpMoment xp={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('a guest gets one sign-in hint with a link', () => {
    render(<XpMoment xp={{ account: false }} />);
    expect(screen.getByText(/Увійдіть, щоб отримувати досвід і досягнення\./)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Увійти' });
    expect(link.getAttribute('href')).toBe('/login?next=%2Fprofile');
  });

  it('an account still being counted says so in a status region', () => {
    render(<XpMoment xp={{ account: true, moment: null }} />);
    expect(screen.getByText('Рахуємо досвід…')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('shows the lines and the sum', () => {
    render(<XpMoment xp={{ account: true, moment: moment({ lines, reason: 'cap' }) }} />);
    expect(screen.getByText('За участь').closest('li')?.textContent).toContain('+50');
    expect(screen.getByText('3 правильні відповіді').closest('li')?.textContent).toContain('+30');
    expect(screen.getByText('За 1-е місце').closest('li')?.textContent).toContain('+100');
    expect(screen.getByText('Денний ліміт').closest('li')?.textContent).toContain('−40');
    expect(screen.getByText('Досягнення «Перша гра»').closest('li')?.textContent).toContain('+25');
    expect(document.querySelector('.xp-moment-sum')?.textContent).toBe('+165 досвіду');
    expect(screen.getByText(/Денний ліміт 600 досвіду вичерпано/)).toBeTruthy();
  });

  it('two or more achievements fold into one closed row with the count and the sum', () => {
    const many: XpLine[] = [
      { kind: 'join', xp: 50 },
      { kind: 'achievement', xp: 25, id: 'first_game' },
      { kind: 'achievement', xp: 50, id: 'first_win' },
    ];
    render(<XpMoment xp={{ account: true, moment: moment({ lines: many, gained: 125 }) }} />);
    const details = document.querySelector('.xp-moment-group details') as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);
    const summary = details.querySelector('summary')!;
    expect(summary.querySelector('span')?.textContent).toBe('Досягнення (2)');
    expect(summary.querySelector('b')?.textContent).toBe('+75');
    // Назви — усередині згорнутого рядка; відкриття їх показує.
    const names = [...details.querySelectorAll('ul li span')].map((el) => el.textContent);
    expect(names).toEqual(['Досягнення «Перша гра»', 'Досягнення «Перша перемога»']);
    act(() => {
      details.open = true;
    });
    expect(details.open).toBe(true);
    expect(screen.getByText('Досягнення «Перша перемога»').closest('li')?.textContent).toContain('+50');
    // Рядки гри — поза групою.
    expect(screen.getByText('За участь').closest('.xp-moment-group')).toBeNull();
  });

  it('one achievement stays a plain row', () => {
    render(<XpMoment xp={{ account: true, moment: moment({ lines }) }} />);
    expect(document.querySelector('.xp-moment-group')).toBeNull();
    expect(screen.getByText('Досягнення «Перша гра»').closest('li')?.textContent).toContain('+25');
  });

  it('xpLineText names each kind', () => {
    expect(xpLineText({ kind: 'game', xp: 190 })).toBe('За гру');
    expect(xpLineText({ kind: 'join', xp: 50 })).toBe('За участь');
    expect(xpLineText({ kind: 'correct', xp: 10, count: 1 })).toBe('1 правильна відповідь');
    expect(xpLineText({ kind: 'correct', xp: 50, count: 5 })).toBe('5 правильних відповідей');
  });

  it('a zero game explains', () => {
    render(<XpMoment xp={{ account: true, moment: moment({ gained: 0, reason: 'few_accounts', before: levelProgress(100), after: levelProgress(100) }) }} />);
    expect(document.querySelector('.xp-moment-sum')?.textContent).toBe('+0 досвіду');
    expect(screen.getByText(/У грі менше 3 гравців з акаунтом/)).toBeTruthy();
  });

  it('a level up', () => {
    const before = levelProgress(xpForLevel(5) - 10);
    const after = levelProgress(xpForLevel(5) + 30);
    expect(before.level).toBe(4);
    render(<XpMoment xp={{ account: true, moment: moment({ gained: 40, before, after, unlocked: [{ level: 5, reward: { kind: 'perk', perk: 'time' } }] }) }} />);
    expect(document.querySelector('.xp-moment-levelup h3')?.textContent).toBe('Новий рівень 5!');
    expect(document.querySelector('[aria-live]')?.textContent).toBe('Новий рівень 5!');
    expect(screen.getByText(/Відкрито:/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Усі нагороди' }).getAttribute('href')).toBe('/profile/levels');
    expect(screen.getByText(`Ще ${after.nextAt - after.xp} досвіду до рівня 6`)).toBeTruthy();
  });

  it('the bar is a progress with the end value', () => {
    render(<XpMoment xp={{ account: true, moment: moment() }} />);
    const bar = document.querySelector('progress')!;
    expect(bar.getAttribute('aria-label')).toContain('5');
    expect(bar.max).toBe(levelProgress(xpForLevel(5)).nextAt - xpForLevel(5));
  });

  it('reduced motion shows the end at once', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    const m = moment();
    render(<XpMoment xp={{ account: true, moment: m }} />);
    const card = document.querySelector('.xp-moment')!;
    const bar = document.querySelector('progress')!;
    expect(bar.value).toBe(m.after.xp - m.after.levelAt);
    expect(card.classList.contains('is-still')).toBe(true);
    expect(card.classList.contains('is-animated')).toBe(false);
  });

  it('without it the bar is animated through css variables', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    render(<XpMoment xp={{ account: true, moment: moment() }} />);
    const card = document.querySelector('.xp-moment') as HTMLElement;
    expect(card.classList.contains('is-animated')).toBe(true);
    expect(card.style.getPropertyValue('--xp-from')).not.toBe('');
    expect(card.style.getPropertyValue('--xp-to')).not.toBe('');
  });

  it('one live region is there from the start and gets the level-up text after the card arrives', () => {
    const before = levelProgress(xpForLevel(5) - 10);
    const after = levelProgress(xpForLevel(5) + 30);
    const view = render(<XpMoment xp={{ account: true, moment: null }} />);
    const region = document.querySelector('[aria-live]')!;
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(region.textContent).toBe('');
    act(() => {
      view.rerender(<XpMoment xp={{ account: true, moment: moment({ gained: 40, before, after }) }} />);
    });
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(document.querySelector('[aria-live]')).toBe(region);
    expect(region.textContent).toBe('Новий рівень 5!');
  });

  it('a jump over several levels lists every unlocked reward', () => {
    const before = levelProgress(xpForLevel(4) + 5);
    const after = levelProgress(xpForLevel(7) + 5);
    const unlocked = [
      { level: 5, reward: { kind: 'perk' as const, perk: 'time' as const } },
      { level: 6, reward: { kind: 'perk' as const, perk: 'hint' as const } },
      { level: 7, reward: { kind: 'perk' as const, perk: 'ward' as const } },
    ];
    render(<XpMoment xp={{ account: true, moment: moment({ gained: 900, before, after, unlocked }) }} />);
    expect(document.querySelector('.xp-moment-levelup h3')?.textContent).toBe('Новий рівень 7!');
    const text = document.querySelector('.xp-moment-levelup p')!.textContent!;
    // Нагороди з двокрапками всередині — через « · », не через кому.
    expect(text.split(' · ')).toHaveLength(3);
  });

  it('the bar reads its value aloud', () => {
    const m = moment();
    render(<XpMoment xp={{ account: true, moment: m }} />);
    expect(document.querySelector('progress')!.getAttribute('aria-valuetext')).toBe(`Ще ${m.after.nextAt - m.after.xp} досвіду до рівня 6`);
  });
});
