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
  // 375 px: нік, крамниця, «Таблиця», ❤️, 😀 і бали. Стискається спершу нік (трикрапкою), а «Таблиця» лишається цілою.
  it('on a narrow phone the nickname gives way before «Таблиця»', () => {
    const narrow = [...css.matchAll(/@media \(max-width: 400px\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]!).join('\n');
    const body = narrow.match(/\.bar:has\(\.like-button\) > span:first-child \{([^}]*)\}/)?.[1];
    expect(body).toBeDefined();
    const shrink = Number(body!.match(/flex-shrink:\s*(\d+)/)?.[1]);
    expect(shrink).toBeGreaterThanOrEqual(100);
    // «Таблиця» (звичайна .table-button) не стискається: навіть частка пікселя малює «Табли…».
    const table = narrow.match(/\.bar:has\(\.like-button\) > \.table-button:not\(\.like-button, \.reaction-button, \.shop-button, \.author-menu-btn\) \{([^}]*)\}/)?.[1];
    expect(table).toMatch(/flex-shrink:\s*0;/);
  });
});
