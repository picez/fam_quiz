// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Question } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion } from './draft';
import { SpyEditor } from './SpyEditor';

type Spy = Extract<Question, { type: 'spy' }>;

afterEach(cleanup);

const spy = (patch: Partial<Spy> = {}): Spy => ({ ...(newQuestion('spy') as Spy), ...patch });
const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as Spy;

describe('SpyEditor', () => {
  it('edits both words and the vote timer', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SpyEditor question={spy()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(t('spyPlayersWord'), { selector: 'input' }), { target: { value: 'потяг' } });
    expect(last(onChange).accepted).toEqual(['потяг']);
    rerender(<SpyEditor question={spy({ accepted: ['потяг'] })} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(t('spySpyWord')), { target: { value: 'автобус' } });
    expect(last(onChange).spyWord).toBe('автобус');
    fireEvent.change(screen.getByLabelText(t('spyVoteTime')), { target: { value: '35' } });
    expect(last(onChange).voteTime).toBe(35);
    screen.getByText(t('spyEditorHint'));
  });

  it('extra spellings are accepted[1…]', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SpyEditor question={spy({ accepted: ['потяг'] })} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: t('addSpelling') }));
    expect(last(onChange).accepted).toEqual(['потяг', '']);
    rerender(<SpyEditor question={spy({ accepted: ['потяг', ''] })} onChange={onChange} />);
    fireEvent.change(within(screen.getByRole('group', { name: t('spyPlayersWord') })).getByLabelText(t('spellingN', { index: 1 })), { target: { value: 'поїзд' } });
    expect(last(onChange).accepted).toEqual(['потяг', 'поїзд']);
  });

  it('same words warn', () => {
    const { rerender } = render(<SpyEditor question={spy({ accepted: ['Потяг'], spyWord: 'автобус' })} onChange={vi.fn()} />);
    expect(screen.queryByText(t('problemSpySame'))).toBeNull();
    rerender(<SpyEditor question={spy({ accepted: ['Потяг'], spyWord: 'потяг' })} onChange={vi.fn()} />);
    screen.getByText(t('problemSpySame'));
  });
});
