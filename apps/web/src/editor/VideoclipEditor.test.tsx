// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LIMITS, type Question } from '@quiz/shared';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion, type VideoclipQuestion } from './draft';

const play = vi.fn();
const stop = vi.fn();
let duration: number | null = null;
const hookArgs = vi.fn();

vi.mock('../live/useVideoClip', () => ({
  useVideoClip: (clip: unknown, opts: unknown) => {
    hookArgs(clip, opts);
    return { play, stop, unmute: vi.fn(), state: 'idle', playing: null, covered: true, duration, element: <span data-testid="clip" /> };
  },
}));

import { VideoclipEditor } from './VideoclipEditor';

beforeEach(() => {
  duration = null;
  play.mockReset();
  stop.mockReset();
  hookArgs.mockReset();
});
afterEach(cleanup);

function Harness({ initial, spy }: { initial: VideoclipQuestion; spy: (q: VideoclipQuestion) => void }) {
  const [question, setQuestion] = useState(initial);
  return (
    <VideoclipEditor
      question={question}
      onChange={(next: Question) => {
        spy(next as VideoclipQuestion);
        setQuestion(next as VideoclipQuestion);
      }}
    />
  );
}

const view = (patch: Partial<VideoclipQuestion> = {}) => {
  const spy = vi.fn<(q: VideoclipQuestion) => void>();
  const base = newQuestion('videoclip') as VideoclipQuestion;
  render(<Harness initial={{ ...base, ...patch }} spy={spy} />);
  return { last: () => spy.mock.calls.at(-1)![0], calls: spy.mock.calls };
};
const linked = { clip: { id: 'E2Evideo001', start: 0 } } as const;
const linkInput = () => screen.getByLabelText(t('videoLabel')) as HTMLInputElement;

describe('VideoclipEditor', () => {
  it('a YouTube link sets the id and the start', () => {
    const { last, calls } = view();
    fireEvent.change(linkInput(), { target: { value: 'https://example.com' } });
    expect(screen.getByText(t('videoInvalid'))).toBeTruthy();
    expect(calls.every(([q]) => q.clip.id === '')).toBe(true);
    fireEvent.change(linkInput(), { target: { value: 'https://youtu.be/E2Evideo001?t=42' } });
    expect(last().clip).toEqual({ id: 'E2Evideo001', start: 42 });
    // Попередній перегляд дає useVideoClip: звичайного плеєра немає.
    expect(document.querySelector('.question-video')).toBeNull();
    expect(screen.getByTestId('clip')).toBeTruthy();
  });

  it('the start field moves the chunks', () => {
    const { last } = view(linked);
    fireEvent.change(screen.getByLabelText(t('videoclipStart')), { target: { value: '30' } });
    expect(last().clip).toEqual({ id: 'E2Evideo001', start: 30 });
    expect(hookArgs.mock.calls.at(-1)![0]).toEqual({ id: 'E2Evideo001', start: 30 });
  });

  it('sound is off by default and can be switched', () => {
    const { last } = view(linked);
    const off = screen.getByRole('button', { name: t('videoclipMuted') });
    const on = screen.getByRole('button', { name: t('videoclipSound') });
    expect(off.getAttribute('aria-pressed')).toBe('true');
    expect(on.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(t('videoclipSoundHint'))).toBeTruthy();
    fireEvent.click(on);
    expect(last().muted).toBe(false);
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(hookArgs.mock.calls.at(-1)![1]).toMatchObject({ muted: false });
  });

  it('five preview buttons', () => {
    view(linked);
    for (const seconds of [1, 2, 4, 8, 16]) expect(screen.getByRole('button', { name: t('videoclipPreview', { seconds }) })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('videoclipPreview', { seconds: 4 }) }));
    expect(play).toHaveBeenCalledWith(4);
  });

  it('previews wait for a link', () => {
    view();
    expect((screen.getByRole('button', { name: t('videoclipPreview', { seconds: 1 }) }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('clip')).toBeNull();
  });

  it('a short video is flagged', () => {
    duration = 14;
    view(linked);
    expect(screen.getByText(t('videoclipShortVideo', { need: 16 }))).toBeTruthy();
    cleanup();
    duration = 60;
    view(linked);
    expect(screen.queryByText(t('videoclipShortVideo', { need: 16 }))).toBeNull();
  });

  it('spellings are edited as in text', () => {
    const { last } = view(linked);
    const first = screen.getByLabelText(t('spellingN', { index: 1 })) as HTMLInputElement;
    expect(first.maxLength).toBe(LIMITS.answerText);
    expect(LIMITS.answerText).toBe(200);
    fireEvent.change(first, { target: { value: 'Шрек' } });
    fireEvent.click(screen.getByRole('button', { name: t('addSpelling') }));
    expect(last().accepted).toEqual(['Шрек', '']);
  });
});
