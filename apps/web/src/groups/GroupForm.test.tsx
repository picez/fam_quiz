// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupForm } from './GroupForm';

afterEach(cleanup);

describe('GroupForm (12k)', () => {
  it('counts the name, picks a badge and sends the group', async () => {
    const onSubmit = vi.fn(async () => null);
    render(<GroupForm submit="groupCreateSubmit" onSubmit={onSubmit} />);
    const create = screen.getByRole('button', { name: 'Створити' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Родина Квіткових' } });
    expect(screen.getByText('16 / 40')).toBeTruthy();
    expect(create.disabled).toBe(false);
    const sunflower = screen.getByRole('radio', { name: '🌻' });
    fireEvent.click(sunflower);
    expect(sunflower.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '👪' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getAllByRole('radio')).toHaveLength(24);
    fireEvent.click(create);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Родина Квіткових', emoji: '🌻', description: '' }));
  });

  it('arrows walk the badges', () => {
    render(<GroupForm submit="groupCreateSubmit" onSubmit={vi.fn(async () => null)} />);
    const group = screen.getByRole('radiogroup', { name: 'Значок' });
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: '🏡' }).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '🏡' }));
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: '⭐' }).getAttribute('aria-checked')).toBe('true');
  });

  it('shows the error from the server', async () => {
    render(<GroupForm submit="save" initial={{ name: 'Квіткові', emoji: '🏡', description: '' }} onSubmit={vi.fn(async () => 'invalid_payload:group_name')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Назва — від 1 до 40 символів.');
  });
});
