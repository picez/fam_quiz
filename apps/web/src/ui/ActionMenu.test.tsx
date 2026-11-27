// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionMenu } from './ActionMenu';

afterEach(cleanup);

function setup(disabledSecond = false) {
  const one = vi.fn();
  const two = vi.fn();
  const three = vi.fn();
  render(
    <>
      <p>поза меню</p>
      <ActionMenu
        label="Ще дії: Географія"
        items={[
          { label: 'Перша', onSelect: one },
          { label: 'Друга', onSelect: two, disabled: disabledSecond },
          { label: 'Видалити', onSelect: three, danger: true },
        ]}
      />
    </>,
  );
  return { one, two, three, button: screen.getByRole('button', { name: 'Ще дії: Географія' }) };
}

describe('ActionMenu (77)', () => {
  it('is a menu button that opens a menu and focuses its first item', () => {
    const { button } = setup();
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(button);
    const menu = screen.getByRole('menu', { name: 'Ще дії: Географія' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(menu.id);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Перша', 'Друга', 'Видалити']);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Перша' }));
    expect(screen.getByRole('menuitem', { name: 'Видалити' }).classList.contains('btn-danger')).toBe(true);
  });

  it('arrows, Home and End move between enabled items and skip disabled ones', () => {
    const { button } = setup(true);
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');
    const focused = () => document.activeElement?.textContent;
    expect(focused()).toBe('Перша');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(focused()).toBe('Видалити');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(focused()).toBe('Перша');
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(focused()).toBe('Видалити');
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(focused()).toBe('Перша');
    fireEvent.keyDown(menu, { key: 'End' });
    expect(focused()).toBe('Видалити');
  });

  it('ArrowUp on the button opens at the last item', () => {
    const { button } = setup();
    fireEvent.keyDown(button, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toBe('Видалити');
  });

  it('Escape closes and gives focus back to «⋯»', () => {
    const { button } = setup();
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('a click outside closes, a click inside does not', () => {
    const { button } = setup();
    fireEvent.click(button);
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Друга' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(screen.getByText('поза меню'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('choosing an item closes the menu, returns focus and runs the action', () => {
    const { button, two, one } = setup();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Друга' }));
    expect(two).toHaveBeenCalledTimes(1);
    expect(one).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('a second click on «⋯» closes the open menu', () => {
    const { button } = setup();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
