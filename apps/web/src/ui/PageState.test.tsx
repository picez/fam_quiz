// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState, LoadError, Loading } from './PageState';

afterEach(cleanup);

describe('page states (76)', () => {
  it('loading is a status line, or a hidden skeleton with the same line for screen readers', () => {
    const { container, unmount } = render(<Loading />);
    expect(screen.getByRole('status').textContent).toBe('Завантажуємо…');
    expect(container.querySelector('.skeleton-list')).toBeNull();
    unmount();
    const list = render(<Loading list />);
    expect(screen.getByRole('status').textContent).toBe('Завантажуємо…');
    expect(list.container.querySelector('.skeleton-list')?.getAttribute('aria-hidden')).toBe('true');
    expect(list.container.querySelectorAll('.skeleton-row')).toHaveLength(3);
  });

  it('an error offers «Спробувати ще раз»', () => {
    const retry = vi.fn();
    render(<LoadError message="Немає зв’язку" onRetry={retry} />);
    expect(screen.getByRole('alert').textContent).toBe('Немає зв’язку');
    screen.getByRole('button', { name: 'Спробувати ще раз' }).click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('an error without a way to retry is just the text', () => {
    render(<LoadError message="Не знайдено" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('an empty state carries its action', () => {
    render(
      <EmptyState text="Тут порожньо">
        <button type="button">Почати</button>
      </EmptyState>,
    );
    expect(screen.getByText('Тут порожньо').className).toBe('lead');
    expect(screen.getByRole('button', { name: 'Почати' })).toBeTruthy();
  });
});
