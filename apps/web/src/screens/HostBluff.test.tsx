// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BluffInfo, BluffOptionView } from '@quiz/shared';
import { HostBluff } from './HostBluff';

afterEach(cleanup);

const opt = (id: string, text: string, over: Partial<BluffOptionView> = {}): BluffOptionView => ({ id, text, open: false, kind: 'lie', authors: ['Оля'], pickedBy: [], removed: false, ...over });
const info = (over: Partial<BluffInfo> = {}): BluffInfo => ({
  stage: 'lies',
  written: 2,
  picked: 0,
  options: [],
  shown: 0,
  total: 0,
  lastOpenedId: null,
  lies: [
    { nickname: 'Оля', text: 'Рим' },
    { nickname: 'Петро', text: 'Мілан' },
  ],
  ...over,
});

describe('HostBluff', () => {
  it('lies phase lists the lies live with authors and the count', () => {
    render(<HostBluff info={info()} act={vi.fn()} />);
    expect(screen.getByText('Оля: Рим')).toBeTruthy();
    expect(screen.getByText('Петро: Мілан')).toBeTruthy();
    expect(screen.getByText('Вигадок: 2')).toBeTruthy();
  });

  it('choice: «Прибрати» only next to live player lies, confirmation sends host:bluff-remove', () => {
    const act = vi.fn();
    const options = [opt('b1', 'Рим'), opt('b2', 'Мілан', { kind: 'spare', authors: [] }), opt('b3', 'Правда', { kind: 'truth', authors: [] }), opt('b4', 'Дурня', { removed: true })];
    render(<HostBluff info={info({ stage: 'choice', options, total: 4, lies: null })} act={act} />);
    const buttons = screen.getAllByRole('button', { name: 'Прибрати «Рим»' });
    expect(buttons).toHaveLength(1);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(buttons[0]);
    expect(act).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(buttons[0]);
    expect(confirm).toHaveBeenCalledWith('Прибрати «Рим»? Автори нічого за неї не отримають.');
    expect(act).toHaveBeenCalledWith('host:bluff-remove', { optionId: 'b1' });
    confirm.mockRestore();
  });

  it('while busy the buttons are disabled, and on pause «Відкрити всі» is gone while «Прибрати» stays', () => {
    const options = [opt('b1', 'Рим'), opt('b2', 'Правда', { kind: 'truth', authors: [] })];
    render(<HostBluff info={info({ stage: 'choice', options, total: 2, lies: null })} act={vi.fn()} busy />);
    expect((screen.getByRole('button', { name: 'Прибрати «Рим»' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const closed = [opt('b1', 'Рим', { open: true }), opt('b2', 'Правда', { kind: 'truth', authors: [] })];
    render(<HostBluff info={info({ stage: 'reveal', options: closed, shown: 1, total: 2, lies: null })} act={vi.fn()} paused />);
    expect(screen.queryByRole('button', { name: 'Відкрити всі' })).toBeNull();
    cleanup();
    render(<HostBluff info={info({ stage: 'choice', options, total: 2, lies: null })} act={vi.fn()} paused />);
    expect(screen.getByRole('button', { name: 'Прибрати «Рим»' })).toBeTruthy();
  });

  it('reveal: «Відкрити всі» while closed options remain', () => {
    const act = vi.fn();
    const options = [opt('b1', 'Рим', { open: true }), opt('b2', 'Правда', { kind: 'truth', authors: [] })];
    render(<HostBluff info={info({ stage: 'reveal', options, shown: 1, total: 2, lies: null })} act={act} />);
    fireEvent.click(screen.getByRole('button', { name: 'Відкрити всі' }));
    expect(act).toHaveBeenCalledWith('host:bluff-all');
    cleanup();
    render(<HostBluff info={info({ stage: 'reveal', options: options.map((o) => ({ ...o, open: true })), shown: 2, total: 2, lies: null })} act={act} />);
    expect(screen.queryByRole('button', { name: 'Відкрити всі' })).toBeNull();
  });
});
