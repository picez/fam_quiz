// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StageView } from '@quiz/shared';
import { VOICES_WAIT_MS } from '../live/speech';
import { installSpeech, removeSpeech, speechQuestion, speechView, type FakeSynth } from '../live/speech-fixtures';
import { StageSpeech } from './StageSpeech';

const UK = [{ lang: 'uk-UA', name: 'Тестовий голос' }];
let synth: FakeSynth;
const setActivation = (value: unknown) => Object.defineProperty(navigator, 'userActivation', { value, configurable: true });

const show = (view: StageView = speechView(), splashing = false) => render(<StageSpeech view={view} splashing={splashing} />);
const toggle = () => screen.getByRole('button', { name: /вголос/i });

beforeEach(() => {
  vi.useFakeTimers();
  synth = installSpeech(UK);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  removeSpeech();
  localStorage.clear();
  Reflect.deleteProperty(navigator, 'userActivation');
});

describe('StageSpeech (31)', () => {
  it('the button turns reading on and off; on a question after the splash it reads', () => {
    show();
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(toggle().textContent).toBe('🔊 Читати вголос');
    expect(screen.queryByRole('button', { name: '🔁 Ще раз' })).toBeNull();
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('quiz:stage-speech')).toBe('on');
    expect(screen.getByRole('button', { name: '🔁 Ще раз' })).toBeTruthy();
    expect(synth.spoken.map((s) => s.text)).toEqual(['Яка річка тече через Київ?', 'Варіанти: Дніпро; Дунай; Десна.']);
    const before = synth.cancels;
    fireEvent.click(toggle());
    expect(synth.cancels).toBeGreaterThan(before);
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('quiz:stage-speech')).toBeNull();
  });

  it('«🔁 Ще раз» reads the same text again', () => {
    show();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: '🔁 Ще раз' }));
    expect(synth.spoken.map((s) => s.text)).toEqual([
      'Яка річка тече через Київ?',
      'Варіанти: Дніпро; Дунай; Десна.',
      'Яка річка тече через Київ?',
      'Варіанти: Дніпро; Дунай; Десна.',
    ]);
  });

  it('after a reload without a tap it asks for one and stays silent until the click', () => {
    localStorage.setItem('quiz:stage-speech', 'on');
    setActivation({ hasBeenActive: false });
    show();
    expect(toggle().textContent).toBe('🔊 Торкніться, щоб знову читати вголос');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(synth.spoken).toEqual([]);
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(synth.spoken).toHaveLength(2);
  });

  it('a remembered choice on a page that was already touched turns on at once', () => {
    localStorage.setItem('quiz:stage-speech', 'on');
    setActivation({ hasBeenActive: true });
    show();
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(synth.spoken).toHaveLength(2);
  });

  it('says when there is no voice, when the question has sound or video, and when the browser cannot speak', () => {
    removeSpeech();
    synth = installSpeech([{ lang: 'en-US', name: 'English' }]);
    show();
    fireEvent.click(toggle());
    act(() => vi.advanceTimersByTime(VOICES_WAIT_MS));
    expect(screen.getByRole('status').textContent).toBe('На цьому пристрої немає голосу для мови «Українська» — запитання не читаю.');
    expect(synth.spoken).toEqual([]);
    cleanup();
    localStorage.clear();
    show(speechView({ question: speechQuestion({ video: { id: 'dQw4w9WgXcQ', start: 0 } as never }) }));
    fireEvent.click(toggle());
    expect(screen.getByRole('status').textContent).toBe('У запитанні є звук чи відео — вголос не читаю, щоб не заглушити.');
    cleanup();
    removeSpeech();
    show();
    expect((toggle() as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById(toggle().getAttribute('aria-describedby') ?? '')?.textContent).toBe('Цей браузер не вміє читати вголос.');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
