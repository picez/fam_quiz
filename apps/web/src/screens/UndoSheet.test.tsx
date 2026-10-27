// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UndoPanel, UndoRow } from '@quiz/shared';
import { helpEntry } from '../help/host-help';
import { t } from '../i18n';
import type { Send, SendResult } from '../live/types';
import { UndoButton } from './UndoSheet';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const row = (over: Partial<UndoRow> = {}): UndoRow => ({ kind: 'answer', playerId: 'p1', nickname: 'Оля', points: 200, target: { question: 0, playerId: 'p1' }, undoneBy: null, ...over });
const panel: UndoPanel = {
  rounds: [
    { index: 1, title: 'Фініш', type: 'classic', loose: [], questions: [{ index: 2, number: 1, text: 'Скільки континентів на Землі?', rows: [row({ target: { question: 2, playerId: 'p1' } })] }] },
    {
      index: 0,
      title: 'Розминка',
      type: 'classic',
      loose: [],
      questions: [
        {
          index: 0,
          number: 1,
          text: 'Яка найбільша планета?',
          rows: [
            row(),
            row({ playerId: 'p2', nickname: 'Петро', points: -100, target: { question: 0, playerId: 'p2' }, undoneBy: 4 }),
            row({ kind: 'host', playerId: 'p3', nickname: 'Іра', points: 50, target: { seq: 1 } }),
          ],
        },
      ],
    },
  ],
};

const ok = () => vi.fn<Send>(async () => ({ ok: true }) as SendResult);
const SHEET = { name: 'Скасування балів' };

function open(undo: UndoPanel = panel, send: Send = ok(), teams = false) {
  render(<UndoButton undo={undo} teams={teams} send={send} />);
  fireEvent.click(screen.getByRole('button', { name: '↶ Бали' }));
  return screen.getByRole('dialog', SHEET);
}

const warmup = (dialog: HTMLElement) => dialog.querySelectorAll('section.undo-round')[1] as HTMLElement;
// Рядки Розминки (Оля є і у «Фініші»).
const rowOf = (dialog: HTMLElement, text: string) =>
  [...warmup(dialog).querySelectorAll('li.undo-row')].find((li) => li.querySelector('.undo-row-text')?.textContent === text) as HTMLElement;
const rowButton = (dialog: HTMLElement, text: string) => within(rowOf(dialog, text)).getByRole('button') as HTMLButtonElement;

describe('UndoButton', () => {
  it('opens the sheet with rounds and questions newest first', () => {
    const dialog = open();
    expect([...dialog.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Фініш', 'Розминка']);
    expect(dialog.querySelector('h4')?.textContent).toBe('1. Скільки континентів на Землі?');
    expect([...warmup(dialog).querySelectorAll('.undo-row-text')].map((s) => s.textContent)).toEqual(['Оля +200', 'Петро −100 (штраф)', 'Ведучий: Іра +50']);
    const petro = rowOf(dialog, 'Петро −100 (штраф)');
    expect(petro.classList.contains('is-undone')).toBe(true);
    expect(petro.querySelector('s')).not.toBeNull();
    expect(rowButton(dialog, 'Петро −100 (штраф)').textContent).toBe('Повернути');
    expect(rowButton(dialog, 'Оля +200').textContent).toBe('Скасувати');
    expect(rowButton(dialog, 'Ведучий: Іра +50').textContent).toBe('Скасувати');
    expect(rowOf(dialog, 'Оля +200').classList.contains('is-undone')).toBe(false);
    expect(dialog.querySelector('.help-button')?.getAttribute('aria-label')).toBe(t('helpOpen', { title: helpEntry('setting.undo').title }));
  });

  it('undoes one row and returns an undone row with one tap', async () => {
    const send = ok();
    const confirm = vi.spyOn(window, 'confirm');
    const dialog = open(panel, send);
    await act(async () => fireEvent.click(rowButton(dialog, 'Оля +200')));
    expect(send).toHaveBeenCalledWith('host:undo', { target: { question: 0, playerId: 'p1' } });
    await act(async () => fireEvent.click(rowButton(dialog, 'Петро −100 (штраф)')));
    expect(send).toHaveBeenLastCalledWith('host:undo', { target: { seq: 4 } });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('undoes a whole question after a confirm', async () => {
    const send = ok();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const dialog = open(panel, send);
    const button = within(warmup(dialog)).getByRole('button', { name: 'Скасувати все за запитання 1' });
    expect(button.textContent).toBe('Скасувати все');
    await act(async () => fireEvent.click(button));
    expect(confirm).toHaveBeenCalledWith('Скасувати бали 2 гравців за запитання 1?');
    expect(send).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => fireEvent.click(button));
    expect(send).toHaveBeenCalledWith('host:undo', { target: { question: 0 } });
  });

  it('undoes a round after a confirm, counting teams in a team game', async () => {
    const send = ok();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const dialog = open(panel, send);
    await act(async () => fireEvent.click(within(warmup(dialog)).getByRole('button', { name: 'Скасувати раунд' })));
    expect(confirm).toHaveBeenCalledWith('Скасувати бали 2 гравців за раунд 1?');
    expect(send).toHaveBeenCalledWith('host:undo', { target: { round: 0 } });
    cleanup();
    const teamDialog = open(panel, ok(), true);
    await act(async () => fireEvent.click(within(warmup(teamDialog)).getByRole('button', { name: 'Скасувати раунд' })));
    expect(confirm).toHaveBeenLastCalledWith('Скасувати бали 2 команд за раунд 1?');
  });

  it('disables the bulk buttons when every row is undone', () => {
    const undone: UndoPanel = { rounds: [{ index: 0, title: 'Розминка', type: 'classic', loose: [], questions: [{ index: 0, number: 1, text: 'Яка найбільша планета?', rows: [row({ undoneBy: 3 })] }] }] };
    const dialog = open(undone);
    expect((within(dialog).getByRole('button', { name: 'Скасувати все за запитання 1' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole('button', { name: 'Скасувати раунд' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows loose host points without a bulk button', () => {
    const loose: UndoPanel = { rounds: [{ index: 0, title: 'Розминка', type: 'classic', loose: [row({ kind: 'host', target: { seq: 2 } })], questions: [] }] };
    const dialog = open(loose);
    const block = dialog.querySelector('.undo-question.is-loose') as HTMLElement;
    expect(block.querySelector('h4')?.textContent).toBe('Поза запитаннями');
    expect(within(block).queryByRole('button', { name: /^Скасувати все/ })).toBeNull();
    expect(within(block).getByRole('button', { name: 'Скасувати' })).toBeTruthy();
  });

  it('shows a refusal in the sheet and clears it after a success', async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'already_undone' }));
    const dialog = open(panel, send);
    await act(async () => fireEvent.click(rowButton(dialog, 'Оля +200')));
    expect(within(dialog).getByRole('alert').textContent).toBe('Ці бали вже скасовано.');
    send.mockResolvedValue({ ok: false, error: 'not_allowed' });
    await act(async () => fireEvent.click(rowButton(dialog, 'Оля +200')));
    expect(within(dialog).getByRole('alert').textContent).toBe('Ці бали скасувати не можна.');
    send.mockResolvedValue({ ok: true });
    await act(async () => fireEvent.click(rowButton(dialog, 'Оля +200')));
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('tells a dropped connection when the send rejects and lets the host try again', async () => {
    const send = vi.fn<Send>(async () => {
      throw new Error('disconnected');
    });
    const dialog = open(panel, send);
    await act(async () => fireEvent.click(rowButton(dialog, 'Оля +200')));
    expect(within(dialog).getByRole('alert').textContent).toBe('Немає зв’язку із сервером.');
    expect(rowButton(dialog, 'Оля +200').disabled).toBe(false);
  });

  it('sends one action at a time', async () => {
    let finish: (result: SendResult) => void = () => {};
    const send = vi.fn<Send>(() => new Promise<SendResult>((resolve) => (finish = resolve)));
    const dialog = open(panel, send);
    fireEvent.click(rowButton(dialog, 'Оля +200'));
    fireEvent.click(rowButton(dialog, 'Ведучий: Іра +50'));
    expect(send).toHaveBeenCalledTimes(1);
    expect(rowButton(dialog, 'Ведучий: Іра +50').disabled).toBe(true);
    await act(async () => finish({ ok: true }));
    expect(rowButton(dialog, 'Ведучий: Іра +50').disabled).toBe(false);
  });

  it('says there is nothing to undo yet', () => {
    const dialog = open({ rounds: [] });
    expect(dialog.querySelector('p.meta.undo-empty')?.textContent).toMatch(/^Скасовувати ще нічого/);
  });

  it('closes on a tap outside the card, on Escape and on «Закрити», not on a tap inside', () => {
    const dialog = open();
    fireEvent.click(dialog.querySelector('.undo-card') as HTMLElement);
    expect(screen.queryByRole('dialog', SHEET)).not.toBeNull();
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog', SHEET)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '↶ Бали' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', SHEET)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '↶ Бали' }));
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(screen.queryByRole('dialog', SHEET)).toBeNull();
  });

  it('lets Escape close an open help first', () => {
    const dialog = open();
    fireEvent.click(dialog.querySelector('.help-button') as HTMLElement);
    expect(document.querySelector('.help-pop')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.help-pop')).toBeNull();
    expect(screen.queryByRole('dialog', SHEET)).not.toBeNull();
  });
});
