// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Question } from '@quiz/shared';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorText, t } from '../i18n';
import { newQuestion, type MelodyQuestion } from './draft';

const uploadAudio = vi.fn();
const fileSeconds = vi.fn();
const play = vi.fn();
const stop = vi.fn();
let playing: number | null = null;

vi.mock('../api', () => ({ uploadAudio: (file: File) => uploadAudio(file) }));
vi.mock('./AudioField', async (importOriginal) => ({ ...(await importOriginal<typeof import('./AudioField')>()), fileSeconds: (file: File) => fileSeconds(file) }));
vi.mock('../live/useMelodyClip', () => ({ useMelodyClip: () => ({ play, stop, state: 'idle', playing, element: <span data-testid="clip" /> }) }));

import { MelodyEditor } from './MelodyEditor';

beforeEach(() => {
  playing = null;
  uploadAudio.mockReset();
  fileSeconds.mockReset();
  play.mockReset();
  stop.mockReset();
});
afterEach(cleanup);

function Harness({ initial, spy }: { initial: MelodyQuestion; spy: (q: MelodyQuestion) => void }) {
  const [question, setQuestion] = useState(initial);
  return (
    <MelodyEditor
      question={question}
      onChange={(next: Question) => {
        spy(next as MelodyQuestion);
        setQuestion(next as MelodyQuestion);
      }}
    />
  );
}

const view = (patch: Partial<MelodyQuestion> = {}) => {
  const spy = vi.fn<(q: MelodyQuestion) => void>();
  const base = newQuestion('melody') as MelodyQuestion;
  render(<Harness initial={{ ...base, ...patch }} spy={spy} />);
  return { last: () => spy.mock.calls.at(-1)![0], calls: spy.mock.calls };
};
const withTrack = { track: { source: 'file', url: '/uploads/0123456789abcdef0123.mp3', start: 0 } } as const;
const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });
const pickFile = (picked: File) => fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [picked] } });

describe('MelodyEditor', () => {
  it('a file upload sets the track', async () => {
    uploadAudio.mockResolvedValue({ ok: true, url: '/uploads/0123456789abcdef0123.mp3' });
    fileSeconds.mockResolvedValue(10);
    const { last } = view();
    pickFile(file('song.mp3', 'audio/mpeg'));
    await waitFor(() => expect(last().track).toEqual({ source: 'file', url: '/uploads/0123456789abcdef0123.mp3', start: 0 }));
    // Файл на 10 с при старті 0 коротший за останній шматок.
    expect(screen.getByText(t('melodyShortFile', { need: 16 }))).toBeTruthy();
    expect(screen.getByTestId('clip')).toBeTruthy();
  });

  it('a long enough file raises no warning', async () => {
    uploadAudio.mockResolvedValue({ ok: true, url: '/uploads/0123456789abcdef0123.mp3' });
    fileSeconds.mockResolvedValue(200);
    const { last } = view();
    pickFile(file('song.mp3', 'audio/mpeg'));
    await waitFor(() => expect(last().track.source).toBe('file'));
    expect(screen.queryByText(t('melodyShortFile', { need: 16 }))).toBeNull();
    fireEvent.change(screen.getByLabelText(t('melodyStart')), { target: { value: '190' } });
    expect(screen.getByText(t('melodyShortFile', { need: 206 }))).toBeTruthy();
  });

  it('a too large or wrong file is refused', () => {
    const { calls } = view();
    pickFile(file('song.mp3', 'audio/mpeg', 6 * 1024 * 1024));
    expect(screen.getByRole('alert').textContent).toBe(errorText('audio_too_large'));
    pickFile(file('song.wav', 'audio/wav'));
    expect(screen.getByRole('alert').textContent).toBe(errorText('bad_audio'));
    expect(uploadAudio).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('a failed upload shows the error and keeps the track', async () => {
    uploadAudio.mockResolvedValue({ ok: false, error: 'bad_audio' });
    fileSeconds.mockResolvedValue(30);
    const { calls } = view();
    pickFile(file('song.mp3', 'audio/mpeg'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(errorText('bad_audio')));
    expect(calls).toHaveLength(0);
  });

  it('a YouTube link sets the id and the start', () => {
    const { last, calls } = view();
    fireEvent.click(screen.getByRole('button', { name: t('melodySourceYoutube') }));
    expect(last().track).toEqual({ source: 'youtube', id: '', start: 0 });
    const input = screen.getByLabelText(t('melodyLinkLabel'));
    fireEvent.change(input, { target: { value: 'https://youtu.be/abcdefghijk?t=42' } });
    expect(last().track).toEqual({ source: 'youtube', id: 'abcdefghijk', start: 42 });
    const before = calls.length;
    fireEvent.change(input, { target: { value: 'https://example.com' } });
    expect(screen.getByText(t('melodyBadLink'))).toBeTruthy();
    expect(calls.length).toBe(before);
  });

  it('the start field moves the chunks', () => {
    const { last } = view(withTrack);
    fireEvent.change(screen.getByLabelText(t('melodyStart')), { target: { value: '30' } });
    expect(last().track).toEqual({ source: 'file', url: '/uploads/0123456789abcdef0123.mp3', start: 30 });
  });

  it('five preview buttons play the chunks', () => {
    view(withTrack);
    const labels = [1, 2, 4, 8, 16].map((seconds) => t('melodyPreview', { seconds }));
    for (const label of labels) expect((screen.getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: t('melodyPreview', { seconds: 4 }) }));
    expect(play).toHaveBeenCalledWith(4);
  });

  it('without a track the previews are off', () => {
    view();
    expect((screen.getByRole('button', { name: t('melodyPreview', { seconds: 1 }) }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('clip')).toBeNull();
  });

  it('a playing chunk stops on the second tap', () => {
    playing = 2;
    view(withTrack);
    fireEvent.click(screen.getByRole('button', { name: t('melodyPreview', { seconds: 2 }) }));
    expect(stop).toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it('spellings are edited as in text', () => {
    const { last } = view(withTrack);
    fireEvent.change(screen.getByLabelText(t('spellingN', { index: 1 })), { target: { value: 'Щедрик' } });
    expect(last().accepted).toEqual(['Щедрик']);
    fireEvent.click(screen.getByRole('button', { name: t('addSpelling') }));
    expect(last().accepted).toEqual(['Щедрик', '']);
    expect((screen.getByLabelText(t('spellingN', { index: 2 })) as HTMLInputElement).maxLength).toBe(200);
    expect(screen.getByText(t('melodyAcceptedHint'))).toBeTruthy();
  });
});
