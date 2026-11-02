// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Vitest підміняє CSS порожнім рядком, тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { LikeButton, LikePanel } from './Likes';

// Тести запускаються з кореня репозиторію або з apps/web.
const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');

afterEach(cleanup);

describe('LikeButton', () => {
  it('not liked: the pill likes on tap', () => {
    const onToggle = vi.fn();
    render(<LikeButton liked={false} onToggle={onToggle} busy={false} />);
    const button = screen.getByRole('button', { name: 'Вподобати запитання' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('liked: the pill takes the like back', () => {
    const onToggle = vi.fn();
    render(<LikeButton liked onToggle={onToggle} busy={false} />);
    const button = screen.getByRole('button', { name: 'Прибрати вподобання' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('undefined draws nothing', () => {
    const { container } = render(<LikeButton liked={undefined} onToggle={vi.fn()} busy={false} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('LikePanel', () => {
  it('shows the quiz, the host and the people', () => {
    const onLike = vi.fn();
    render(<LikePanel likes={{ quiz: false, host: true, people: [{ id: 'p', nickname: 'Петро', liked: false }] }} onLike={onLike} busy={false} />);
    expect(screen.getByText('Сподобалось?')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Ведучий/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Вікторина/ }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /Петро/ }));
    expect(onLike).toHaveBeenCalledWith({ target: 'player', id: 'p', liked: true });
    fireEvent.click(screen.getByRole('button', { name: /Ведучий/ }));
    expect(onLike).toHaveBeenCalledWith({ target: 'host', liked: false });
    fireEvent.click(screen.getByRole('button', { name: /Вікторина/ }));
    expect(onLike).toHaveBeenCalledWith({ target: 'quiz', liked: true });
  });

  it('nothing to like draws nothing', () => {
    expect(render(<LikePanel likes={{}} onLike={vi.fn()} busy={false} />).container.innerHTML).toBe('');
    cleanup();
    expect(render(<LikePanel likes={undefined} onLike={vi.fn()} busy={false} />).container.innerHTML).toBe('');
    cleanup();
    expect(render(<LikePanel likes={{ people: [] }} onLike={vi.fn()} busy={false} />).container.innerHTML).toBe('');
  });
});

describe('the phone header with a heart', () => {
  const narrow = [...css.matchAll(/@media \(max-width: 400px\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]!).join('\n');
  /** Тіло правила, чий рядок — рівно цей селектор (з відступом чи без). */
  const rule = (source: string, selector: string) => {
    const head = source.split('\n').findIndex((line) => line.trim() === `${selector} {`);
    if (head < 0) return undefined;
    const rest = source.split('\n').slice(head + 1).join('\n');
    return rest.slice(0, rest.indexOf('}'));
  };

  it('the heart has a touch area of at least 44 px, like «😀»', () => {
    expect(rule(css, '.bar .like-button')).toMatch(/position:\s*relative;/);
    const after = rule(css, '.bar .like-button::after');
    expect(after).toMatch(/content:\s*'';/);
    expect(after).toMatch(/position:\s*absolute;/);
    expect(after).toMatch(/inset:\s*-0\.375rem -0\.25rem;/);
  });

  // 360 / 375 px, будь-яка фаза (і finished без ❤️ у шапці): спершу стискається нік (трикрапкою), «Таблиця» лишається цілою.
  it('on a narrow phone the nickname gives way before «Таблиця» in every phase, not only with a heart', () => {
    const body = rule(narrow, '.bar > span:first-child');
    expect(body).toBeDefined();
    expect(Number(body!.match(/flex-shrink:\s*(\d+)/)?.[1])).toBeGreaterThanOrEqual(100);
    expect(body).toMatch(/min-width:\s*0;/);
    expect(rule(narrow, '.bar > .table-button:not(.reaction-button, .shop-button, .author-menu-btn, .like-button)')).toMatch(/flex-shrink:\s*0;/);
    expect(narrow).not.toContain(':has(.like-button)');
  });

  it('«⚔ Дуель» stays the only text pill that ellipsizes; «Таблиця» is never squeezed', () => {
    const duel = rule(narrow, '.bar:has(.reaction-button) > .duel-button');
    expect(duel).toMatch(/flex-shrink:\s*1;/);
    expect(duel).toMatch(/text-overflow:\s*ellipsis;/);
    const squeezed = [...narrow.matchAll(/([^{}\n][^{}]*)\{([^}]*)\}/g)].filter((m) => /flex-shrink:\s*[1-9]/.test(m[2]!) || /text-overflow/.test(m[2]!)).map((m) => m[1]!.trim());
    expect(squeezed.filter((selector) => selector.includes('table-button'))).toEqual([]);
  });
});
