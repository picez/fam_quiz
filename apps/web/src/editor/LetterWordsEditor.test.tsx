// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Question } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion } from './draft';
import { LetterWordsEditor } from './LetterWordsEditor';

type Letters = Extract<Question, { type: 'letterwords' }>;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const letters = (patch: Partial<Letters> = {}): Letters => ({ ...(newQuestion('letterwords') as Letters), ...patch });
const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as Letters;
const view = (question: Letters, onChange = vi.fn()) => render(<LetterWordsEditor question={question} onChange={onChange} />);
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('LetterWordsEditor', () => {
  it('opens with a random set of nine, most words, per word, the unit and the hint', () => {
    view(letters());
    expect(pressed(t('lettersSourceRandom'))).toBe('true');
    expect(pressed(t('lettersSourceFixed'))).toBe('false');
    expect(pressed(t('lettersGoalMost'))).toBe('true');
    expect(pressed(t('lettersPerWord'))).toBe('true');
    expect((screen.getByLabelText(t('lettersCount')) as HTMLInputElement).value).toBe('9');
    expect((screen.getByLabelText(t('lettersUnit')) as HTMLInputElement).value).toBe('20');
    expect(screen.queryByLabelText(t('lettersOwn'))).toBeNull();
    expect(screen.getByText(t('lettersHint'))).toBeTruthy();
  });

  it('switches the source, the goal and the unit and warns about a set without words', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const { letters: sent } = JSON.parse(String(init?.body)) as { letters: string };
      return new Response(JSON.stringify(sent === 'бджщ' ? { possible: 0, best: [] } : { possible: 5, best: ['морква', 'острів'] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onChange = vi.fn();
    const { rerender } = view(letters(), onChange);
    const show = (question: Letters) => rerender(<LetterWordsEditor question={question} onChange={onChange} />);

    // Кількість літер.
    fireEvent.change(screen.getByLabelText(t('lettersCount')), { target: { value: '12' } });
    expect(last(onChange).set).toEqual({ kind: 'random', count: 12 });

    // Свій набір: порожній, без перевірки словника.
    fireEvent.click(screen.getByRole('button', { name: t('lettersSourceFixed') }));
    expect(last(onChange).set).toEqual({ kind: 'fixed', letters: '' });
    show(letters({ set: { kind: 'fixed', letters: '' } }));
    expect(screen.queryByLabelText(t('lettersCount'))).toBeNull();
    const own = screen.getByLabelText(t('lettersOwn')) as HTMLInputElement;
    expect([own.getAttribute('lang'), own.getAttribute('autocapitalize'), own.getAttribute('spellcheck')]).toEqual(['uk', 'none', 'false']);
    fireEvent.change(own, { target: { value: 'морк' } });
    expect(last(onChange).set).toEqual({ kind: 'fixed', letters: 'морк' });
    expect(fetchMock).not.toHaveBeenCalled();

    // Набір готовий: після паузи — скільки слів і найдовші.
    show(letters({ set: { kind: 'fixed', letters: 'Морк васті' } }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(t('lettersCheckSome', { n: 5, words: 'морква, острів' })));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ letters: 'Морк васті' });

    // Набір без слів.
    show(letters({ set: { kind: 'fixed', letters: 'бджщ' } }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(t('lettersCheckNone')));

    // Ціль «найдовше»: спосіб лише «за літеру», типова сума стає десяткою; «за слово» вимкнено з підказкою.
    show(letters());
    fireEvent.click(screen.getByRole('button', { name: t('lettersGoalLongest') }));
    expect(last(onChange)).toMatchObject({ goal: 'longest', per: 'letter', points: 10 });
    show(letters({ goal: 'longest', per: 'letter', points: 10 }));
    expect((screen.getByRole('button', { name: t('lettersPerWord') }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(t('lettersLongestHint'))).toBeTruthy();

    // Спосіб «за літеру» міняє типову суму, а власну лишає.
    show(letters());
    fireEvent.click(screen.getByRole('button', { name: t('lettersPerLetter') }));
    expect(last(onChange)).toMatchObject({ per: 'letter', points: 10 });
    show(letters({ points: 35 }));
    fireEvent.click(screen.getByRole('button', { name: t('lettersPerLetter') }));
    expect(last(onChange)).toMatchObject({ per: 'letter', points: 35 });

    // Сума.
    fireEvent.change(screen.getByLabelText(t('lettersUnit')), { target: { value: '15' } });
    expect(last(onChange).points).toBe(15);
  });

  it('shows nothing when the check fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    view(letters({ set: { kind: 'fixed', letters: 'морквасті' } }));
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
