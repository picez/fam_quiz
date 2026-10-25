// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Send } from '../live/types';
import { DuelistPicker } from './DuelistPicker';
import { teamPlayerView } from './team-test-view';

afterEach(cleanup);

describe('DuelistPicker', () => {
  it('lists the teammates online, marks the chosen one and sends player:duelist', async () => {
    const send: Send = vi.fn(async () => ({ ok: true as const }));
    render(<DuelistPicker view={teamPlayerView({ phase: 'question' }, { canPickDuelist: true, duelistId: 'u2' })} send={send} onError={() => undefined} />);
    expect(screen.getByText('Хто з команди піде на дуель?')).toBeTruthy();
    // Ната поза зв'язком.
    expect(screen.queryByRole('button', { name: 'Ната' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Оля' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Петро' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Петро' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:duelist', { memberId: 'u3' }));
  });

  it('renders nothing without the right to pick', () => {
    const { container } = render(<DuelistPicker view={teamPlayerView({}, { canPickDuelist: false })} send={vi.fn()} onError={() => undefined} />);
    expect(container.innerHTML).toBe('');
  });
});
