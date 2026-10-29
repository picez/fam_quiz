// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultTeams } from '@quiz/shared';
import { TeamsEditor } from './TeamsEditor';

afterEach(cleanup);

describe('TeamsEditor', () => {
  it('off: only the toggle (and its help), no count and no names', () => {
    render(<TeamsEditor teams={undefined} onChange={vi.fn()} />);
    expect((screen.getByLabelText('Грати командами') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText(/Команд: /)).toBeNull();
    expect(screen.queryByLabelText(/Назва команди/)).toBeNull();
    screen.getByRole('button', { name: 'Довідка: Командна гра' });
  });

  it('turning it on gives two default teams', () => {
    const onChange = vi.fn();
    render(<TeamsEditor teams={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Грати командами'));
    expect(onChange).toHaveBeenCalledWith({ count: 2, names: ['Червоні', 'Сині'] });
  });

  it('+ adds the default name of the next position; − drops the last; the ends are disabled', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TeamsEditor teams={defaultTeams(2)} onChange={onChange} />);
    expect((screen.getByRole('button', { name: 'Менше команд' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Більше команд' }));
    expect(onChange).toHaveBeenLastCalledWith({ count: 3, names: ['Червоні', 'Сині', 'Зелені'] });
    rerender(<TeamsEditor teams={defaultTeams(3)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Менше команд' }));
    expect(onChange).toHaveBeenLastCalledWith({ count: 2, names: ['Червоні', 'Сині'] });
    rerender(<TeamsEditor teams={defaultTeams(6)} onChange={onChange} />);
    expect((screen.getByRole('button', { name: 'Більше команд' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renaming changes the names; turning it off clears the setting', () => {
    const onChange = vi.fn();
    render(<TeamsEditor teams={defaultTeams(2)} onChange={onChange} />);
    expect(screen.getByText('Команд: 2')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Назва команди 2'), { target: { value: 'Лисиці' } });
    expect(onChange).toHaveBeenLastCalledWith({ count: 2, names: ['Червоні', 'Лисиці'] });
    fireEvent.click(screen.getByLabelText('Грати командами'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  describe('who answers (12g)', () => {
    const names = ['Червоні', 'Сині'];

    it('shows «капітан» when the setting has no answerer, with its help button', () => {
      render(<TeamsEditor teams={{ count: 2, names }} onChange={vi.fn()} />);
      const select = screen.getByLabelText('Хто відповідає') as HTMLSelectElement;
      expect(select.value).toBe('captain');
      expect([...select.options].map((o) => o.textContent)).toEqual(['капітан', 'вибирає капітан', 'по черзі']);
      screen.getByRole('button', { name: 'Довідка: Хто відповідає' });
    });

    it('«по черзі» writes answerer; «капітан» drops the key', () => {
      const onChange = vi.fn();
      const { rerender } = render(<TeamsEditor teams={{ count: 2, names }} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText('Хто відповідає'), { target: { value: 'rotate' } });
      expect(onChange).toHaveBeenLastCalledWith({ count: 2, names, answerer: 'rotate' });
      rerender(<TeamsEditor teams={{ count: 2, names, answerer: 'rotate' }} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText('Хто відповідає'), { target: { value: 'captain' } });
      const last = onChange.mock.lastCall![0];
      expect(last).toEqual({ count: 2, names });
      expect('answerer' in last).toBe(false);
    });

    it('more teams and renaming keep the answerer', () => {
      const onChange = vi.fn();
      render(<TeamsEditor teams={{ count: 2, names, answerer: 'chosen' }} onChange={onChange} />);
      fireEvent.click(screen.getByRole('button', { name: 'Більше команд' }));
      expect(onChange).toHaveBeenLastCalledWith({ count: 3, names: ['Червоні', 'Сині', 'Зелені'], answerer: 'chosen' });
      fireEvent.change(screen.getByLabelText('Назва команди 2'), { target: { value: 'Лисиці' } });
      expect(onChange).toHaveBeenLastCalledWith({ count: 2, names: ['Червоні', 'Лисиці'], answerer: 'chosen' });
    });
  });
});
