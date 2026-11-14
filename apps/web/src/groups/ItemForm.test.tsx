// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GroupMember } from '@quiz/shared';
import { ItemForm } from './ItemForm';

vi.mock('../api', () => ({ uploadImage: vi.fn(() => new Promise(() => {})) }));

afterEach(cleanup);

const at = '2026-11-14T10:00:00.000Z';
const members: GroupMember[] = [
  { id: 'u1', nickname: 'Оля', avatar: null, role: 'owner', joinedAt: at, you: false },
  { id: 'u2', nickname: 'Петро', avatar: null, role: 'member', joinedAt: at, you: true },
];

const text = () => screen.getByLabelText('Текст') as HTMLTextAreaElement;

describe('ItemForm (12k)', () => {
  it('the kind tab changes the hint', () => {
    render(<ItemForm members={members} onSubmit={vi.fn(async () => null)} onCancel={vi.fn()} />);
    expect(text().placeholder).toBe('Бабуся Ніна свистить двома пальцями голосніше за всіх');
    fireEvent.click(screen.getByRole('radio', { name: 'Цитата' }));
    expect(screen.getByRole('radio', { name: 'Цитата' }).getAttribute('aria-checked')).toBe('true');
    expect(text().placeholder).toBe('„Хто рано встає, тому кава гаряча“ — дідусь Іван');
  });

  it('picks a member and a free name, stops at five, and sends the full body', async () => {
    const onSubmit = vi.fn(async () => null);
    render(<ItemForm members={members} onSubmit={onSubmit} onCancel={vi.fn()} />);
    const surprise = screen.getByRole('checkbox', { name: 'Сюрприз' }) as HTMLInputElement;
    expect(surprise.disabled).toBe(true);
    expect(screen.getByText('Познач, для кого сюрприз: вибери учасника групи.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Історія' }));
    fireEvent.change(text(), { target: { value: 'Як тато заблукав у лісі по гриби' } });
    fireEvent.click(screen.getByRole('button', { name: 'Оля' }));
    expect(screen.getByRole('button', { name: 'Оля' }).getAttribute('aria-pressed')).toBe('true');
    const name = screen.getByRole('textbox', { name: 'бабуся Ніна' });
    fireEvent.change(name, { target: { value: 'бабуся Ніна' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Прибрати: бабуся Ніна' })).toBeTruthy();
    expect(surprise.disabled).toBe(false);
    fireEvent.click(surprise);
    fireEvent.change(screen.getByLabelText('Рік'), { target: { value: '1998' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти запис' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        kind: 'story',
        text: 'Як тато заблукав у лісі по гриби',
        about: [{ kind: 'member', userId: 'u1' }, { kind: 'name', name: 'бабуся Ніна' }],
        answer: null,
        year: 1998,
        photo: null,
        surprise: true,
      }),
    );
  });

  it('a sixth name is not added', () => {
    render(<ItemForm members={members} onSubmit={vi.fn(async () => null)} onCancel={vi.fn()} />);
    const name = screen.getByRole('textbox', { name: 'бабуся Ніна' });
    for (const each of ['мама', 'тато', 'бабуся', 'дідусь', 'тітка']) {
      fireEvent.change(name, { target: { value: each } });
      fireEvent.keyDown(name, { key: 'Enter' });
    }
    expect((name as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Уже п’ятеро — більше не можна')).toBeTruthy();
    fireEvent.change(name, { target: { value: 'дядько' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(screen.queryByRole('button', { name: 'Прибрати: дядько' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Петро' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a year outside 1800–2100 disables save with a visible reason', () => {
    render(<ItemForm members={members} onSubmit={vi.fn(async () => null)} onCancel={vi.fn()} />);
    fireEvent.change(text(), { target: { value: 'Щось' } });
    const save = screen.getByRole('button', { name: 'Зберегти запис' }) as HTMLButtonElement;
    const year = screen.getByLabelText('Рік');
    fireEvent.change(year, { target: { value: '2101' } });
    expect(save.disabled).toBe(true);
    const hint = screen.getByText('Рік — від 1800 до 2100.');
    expect(year.getAttribute('aria-describedby')).toBe(hint.id);
    fireEvent.change(year, { target: { value: '1998' } });
    expect(save.disabled).toBe(false);
    expect(screen.queryByText('Рік — від 1800 до 2100.')).toBeNull();
  });

  it('a photo upload says «Завантаження…» like the editor', async () => {
    const { container } = render(<ItemForm members={members} onSubmit={vi.fn(async () => null)} onCancel={vi.fn()} />);
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(await screen.findByText('Завантаження…')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Зберегти запис' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('save is disabled for an empty text and shows the reason of a failure', async () => {
    render(<ItemForm members={members} onSubmit={vi.fn(async () => 'invalid_payload:item_text')} onCancel={vi.fn()} />);
    const save = screen.getByRole('button', { name: 'Зберегти запис' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(text(), { target: { value: 'Щось' } });
    fireEvent.click(save);
    expect((await screen.findByRole('alert')).textContent).toBe('Текст — від 1 до 1000 символів.');
  });
});
