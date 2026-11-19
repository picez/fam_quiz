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
const legacy = (word: string) => t('spyLegacyWord', { word });

describe('SpyEditor', () => {
  it('edits the common word, the hint and the vote timer; no spy word field', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SpyEditor question={spy()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(t('spyPlayersWord'), { selector: 'input' }), { target: { value: 'потяг' } });
    expect(last(onChange).accepted).toEqual(['потяг']);
    rerender(<SpyEditor question={spy({ accepted: ['потяг'] })} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(t('spyHintField')), { target: { value: 'рейки' } });
    expect(last(onChange).spyHint).toBe('рейки');
    expect(screen.getByLabelText(t('spyHintField')).getAttribute('maxlength')).toBe('120');
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

  it('clearing the hint removes the key', () => {
    const onChange = vi.fn();
    render(<SpyEditor question={spy({ accepted: ['кава'], spyHint: 'напій' })} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(t('spyHintField')), { target: { value: '' } });
    expect(last(onChange)).not.toHaveProperty('spyHint');
  });

  it('a hint with the common word warns, a longer word does not', () => {
    const { rerender } = render(<SpyEditor question={spy({ accepted: ['кава'], spyHint: 'кава з молоком' })} onChange={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe(t('spyHintLeak'));
    rerender(<SpyEditor question={spy({ accepted: ['кава'], spyHint: 'Кавалерія' })} onChange={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('the hint field and the warning use the editor styles', () => {
    render(<SpyEditor question={spy({ accepted: ['кава'], spyHint: 'кава', spyWord: 'чай' })} onChange={vi.fn()} />);
    const hintLabel = screen.getByLabelText(t('spyHintField')).closest('label')!;
    expect(hintLabel.className).toBe('field compact');
    expect(hintLabel.querySelector('span')?.textContent).toBe(t('spyHintField'));
    expect(screen.getByRole('status').className).toContain('powers-warn');
    expect(screen.getByRole('status').className).toContain('spy-hint-warning');
    expect(screen.getByRole('button', { name: t('spyLegacyDrop') }).className).toContain('btn btn-small');
    expect(screen.getByText(legacy('чай')).closest('div')!.className).not.toContain('meta');
  });

  it('the legacy buttons are editor buttons in a wrapping row', () => {
    render(<SpyEditor question={spy({ accepted: ['кава'], spyWord: 'чай' })} onChange={vi.fn()} />);
    const toHint = screen.getByRole('button', { name: t('spyLegacyToHint') });
    expect(toHint.className).toBe('btn btn-small');
    expect(toHint.parentElement!.className).toBe('spy-legacy-actions');
    expect(toHint.parentElement).toBe(screen.getByRole('button', { name: t('spyLegacyDrop') }).parentElement);
  });

  it('an old spy word is offered as the hint', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SpyEditor question={spy({ accepted: ['кава'], spyWord: 'чай' })} onChange={onChange} />);
    screen.getByText(legacy('чай'));
    fireEvent.click(screen.getByRole('button', { name: t('spyLegacyToHint') }));
    expect(last(onChange).spyHint).toBe('чай');
    expect(last(onChange)).not.toHaveProperty('spyWord');
    fireEvent.click(screen.getByRole('button', { name: t('spyLegacyDrop') }));
    expect(last(onChange)).not.toHaveProperty('spyWord');
    expect(last(onChange)).not.toHaveProperty('spyHint');
    rerender(<SpyEditor question={spy({ accepted: ['кава'], spyWord: 'чай', spyHint: 'напій' })} onChange={onChange} />);
    screen.getByText(legacy('чай'));
    expect(screen.queryByRole('button', { name: t('spyLegacyToHint') })).toBeNull();
    rerender(<SpyEditor question={spy({ accepted: ['кава'] })} onChange={onChange} />);
    expect(screen.queryByText(legacy('чай'))).toBeNull();
  });
});
