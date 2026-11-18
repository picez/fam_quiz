// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Question } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkLadderWords } from '../api';
import { t } from '../i18n';
import { newQuestion } from './draft';
import { WordleEditor } from './WordleEditor';

vi.mock('../api', () => ({ checkLadderWords: vi.fn() }));

type Wordle = Extract<Question, { type: 'wordle' }>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(checkLadderWords).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const wordle = (patch: Partial<Wordle> = {}): Wordle => ({ ...(newQuestion('wordle') as Wordle), ...patch });
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(700)));
const status = () => screen.getByRole('status');

describe('WordleEditor', () => {
  it('edits the word and counts letters', () => {
    const onChange = vi.fn();
    const { rerender } = render(<WordleEditor question={wordle()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(t('wordleWord')), { target: { value: "м'ясо" } });
    expect((onChange.mock.calls.at(-1)?.[0] as Wordle).word).toBe("м'ясо");
    rerender(<WordleEditor question={wordle({ word: "м'ясо" })} onChange={onChange} />);
    screen.getByText(t('wordleLetterCount', { count: 4 }));
    screen.getByText(t('wordleWordHint'));
  });

  it('warns about a word outside the dictionary', async () => {
    vi.mocked(checkLadderWords).mockResolvedValue(['лампо']);
    render(<WordleEditor question={wordle({ word: 'лампо' })} onChange={vi.fn()} />);
    expect(vi.mocked(checkLadderWords)).not.toHaveBeenCalled();
    await settle();
    expect(vi.mocked(checkLadderWords)).toHaveBeenCalledWith(['лампо']);
    expect(status().textContent).toBe(t('wordleUnknown', { word: 'лампо' }));
  });

  it('says nothing for a known word or when the server does not answer', async () => {
    render(<WordleEditor question={wordle({ word: 'колос' })} onChange={vi.fn()} />);
    await settle();
    expect(status().textContent).toBe('');
    cleanup();
    vi.mocked(checkLadderWords).mockResolvedValue(null);
    render(<WordleEditor question={wordle({ word: 'колос' })} onChange={vi.fn()} />);
    await settle();
    expect(status().textContent).toBe('');
  });

  it('does not ask for a word of the wrong length or an empty one', async () => {
    render(<WordleEditor question={wordle({ word: 'кіт' })} onChange={vi.fn()} />);
    await settle();
    expect(vi.mocked(checkLadderWords)).not.toHaveBeenCalled();
    expect(status().textContent).toBe('');
  });

  it('ignores a stale answer after the word changed', async () => {
    let first!: (value: string[]) => void;
    vi.mocked(checkLadderWords).mockImplementationOnce(() => new Promise((resolve) => (first = resolve)));
    const { rerender } = render(<WordleEditor question={wordle({ word: 'лампо' })} onChange={vi.fn()} />);
    await settle();
    rerender(<WordleEditor question={wordle({ word: 'колос' })} onChange={vi.fn()} />);
    await act(async () => first(['лампо']));
    await settle();
    expect(status().textContent).toBe('');
  });
});
