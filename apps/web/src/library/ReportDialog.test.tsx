// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { sendReport } from './library-api';
import { ReportDialog } from './ReportDialog';

vi.mock('./library-api', () => ({ sendReport: vi.fn() }));

const target = { kind: 'quiz' as const, entryId: 'e1' };
const onClose = vi.fn();
const show = () => render(<ReportDialog target={target} onClose={onClose} />);
const send = () => screen.getByRole('button', { name: t('reportSend') }) as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendReport).mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ReportDialog', () => {
  it('keeps «Send» disabled until a reason is chosen, with four labelled radios in a fieldset', () => {
    show();
    expect(screen.getByRole('group', { name: t('reportReason') })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect((screen.getAllByRole('radio') as HTMLInputElement[]).some((radio) => radio.checked)).toBe(false);
    expect(send().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(t('reportReason_spam')));
    expect(send().disabled).toBe(false);
  });

  it('sends the reason and the note, then thanks and closes after a moment', async () => {
    vi.useFakeTimers();
    show();
    fireEvent.click(screen.getByLabelText(t('reportReason_spam')));
    fireEvent.change(screen.getByLabelText(t('reportText')), { target: { value: '  реклама  ' } });
    expect(screen.getByText('11/300')).toBeTruthy();
    await act(async () => {
      fireEvent.click(send());
    });
    expect(sendReport).toHaveBeenCalledWith({ target, reason: 'spam', text: 'реклама' });
    expect(screen.getByText('Дякуємо, скаргу надіслано.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can be closed with the button after sending, and the focus moves to it', async () => {
    show();
    fireEvent.click(screen.getByLabelText(t('reportReason_other')));
    send().focus();
    fireEvent.click(send());
    const done = await screen.findByRole('button', { name: t('reportClose') });
    expect(document.activeElement).toBe(done);
    fireEvent.click(done);
    expect(onClose).toHaveBeenCalled();
  });

  it('leaves the text out when it is empty', async () => {
    show();
    fireEvent.click(screen.getByLabelText(t('reportReason_offensive')));
    fireEvent.change(screen.getByLabelText(t('reportText')), { target: { value: '   ' } });
    fireEvent.click(send());
    await waitFor(() => expect(sendReport).toHaveBeenCalledWith({ target, reason: 'offensive' }));
  });

  it('does not take the 301st character', () => {
    show();
    const box = screen.getByLabelText(t('reportText')) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(300);
    fireEvent.change(box, { target: { value: 'а'.repeat(301) } });
    expect(box.value).toHaveLength(300);
    expect(screen.getByText('300/300')).toBeTruthy();
  });

  it('shows the server error and stays open', async () => {
    vi.mocked(sendReport).mockResolvedValue({ ok: false, error: 'already_reported' });
    show();
    fireEvent.click(screen.getByLabelText(t('reportReason_spam')));
    fireEvent.click(send());
    expect((await screen.findByRole('alert')).textContent).toBe('Ти вже поскаржився(-лася) — скарга на перевірці.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape, but not while a help popover is open', () => {
    show();
    const pop = document.createElement('div');
    pop.className = 'help-pop';
    document.body.append(pop);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    pop.remove();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
