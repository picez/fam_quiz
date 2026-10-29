// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Send } from '../live/types';
import { PeekSheet } from './PeekSheet';

afterEach(cleanup);

const peekable = [
  { playerId: 'p3', nickname: 'Іра' },
  { playerId: 'p4', nickname: 'Оля' },
];

function sheet(over: { send?: Send; list?: typeof peekable } = {}) {
  const send = over.send ?? (vi.fn().mockResolvedValue({ ok: true }) as unknown as Send);
  const onError = vi.fn();
  const onClose = vi.fn();
  const result = render(<PeekSheet peekable={over.list ?? peekable} send={send} onError={onError} onClose={onClose} />);
  return { send, onError, onClose, ...result };
}

describe('PeekSheet', () => {
  it('a name button sends the peek with its target and closes the sheet', async () => {
    const { send, onClose, onError } = sheet();
    const dialog = screen.getByRole('dialog', { name: 'Чию відповідь підглянути?' });
    expect(dialog.className).toContain('peek-sheet');
    expect(dialog.querySelector('h2')?.textContent).toBe('Чию відповідь підглянути?');
    const names = [...dialog.querySelectorAll('.peek-options button.peek-option')].map((button) => button.textContent);
    expect(names).toEqual(['Іра', 'Оля']);
    // Фокус — на першому імені.
    expect(document.activeElement?.textContent).toBe('Іра');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Іра' }));
    });
    expect(send).toHaveBeenCalledWith('player:buff', { kind: 'peek', targetId: 'p3' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenLastCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it('cancel and Escape close without sending', () => {
    const { send, onClose } = sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(send).not.toHaveBeenCalled();
  });

  it('a refused peek shows the reason', async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, error: 'peek_target' }) as unknown as Send;
    const { onError } = sheet({ send });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Оля' }));
    });
    expect(onError).toHaveBeenLastCalledWith('Цю відповідь зараз не підглянути.');
  });

  it('a double tap while the first peek is on its way sends once', async () => {
    const send = vi.fn(() => new Promise(() => {})) as unknown as Send;
    sheet({ send });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Іра' }));
      fireEvent.click(screen.getByRole('button', { name: 'Іра' }));
      fireEvent.click(screen.getByRole('button', { name: 'Оля' }));
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('nobody to peek at — nothing', () => {
    sheet({ list: [] });
    expect(document.querySelector('.peek-sheet')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the sheet lives outside the question zone, on the body', () => {
    const { container } = sheet();
    expect(container.querySelector('.peek-sheet')).toBeNull();
    expect(document.querySelector('.peek-sheet')?.closest('.debuff-zone')).toBeNull();
  });
});
