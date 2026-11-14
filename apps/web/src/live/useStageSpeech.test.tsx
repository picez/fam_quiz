// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StageView } from '@quiz/shared';
import { useStageSpeech, VOICES_WAIT_MS } from './speech';
import { installSpeech, removeSpeech, speechQuestion, speechView, type FakeSynth } from './speech-fixtures';

const UK = [{ lang: 'uk-UA', name: 'Тестовий голос' }, { lang: 'ru-RU', name: 'Інший' }];
let synth: FakeSynth;

function mount(view: StageView, splashing = false, enabled = true) {
  return renderHook((props: { view: StageView; splashing: boolean; enabled: boolean }) => useStageSpeech(props), {
    initialProps: { view, splashing, enabled },
  });
}
const texts = () => synth.spoken.map((s) => s.text);

beforeEach(() => {
  vi.useFakeTimers();
  synth = installSpeech(UK);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  removeSpeech();
});

describe('useStageSpeech (31)', () => {
  it('reads the question and its options after the splash with the Ukrainian voice, slowly', () => {
    const hook = mount(speechView(), true);
    expect(synth.spoken).toEqual([]);
    hook.rerender({ view: speechView(), splashing: false, enabled: true });
    expect(texts()).toEqual(['Яка річка тече через Київ?', 'Варіанти: Дніпро; Дунай; Десна.']);
    for (const entry of synth.spoken) expect(entry).toMatchObject({ voice: 'uk-UA', lang: 'uk-UA', rate: 0.9 });
    expect(hook.result.current.status).toBe('speaking');
    expect(hook.result.current.language).toBe('uk');
  });

  it('a pause cancels and does not read again by itself; repeat() reads again', () => {
    const hook = mount(speechView());
    expect(synth.spoken).toHaveLength(2);
    const before = synth.cancels;
    hook.rerender({ view: speechView({ paused: true }), splashing: false, enabled: true });
    expect(synth.cancels).toBeGreaterThan(before);
    hook.rerender({ view: speechView(), splashing: false, enabled: true });
    expect(synth.spoken).toHaveLength(2);
    act(() => hook.result.current.repeat());
    expect(texts()).toEqual(['Яка річка тече через Київ?', 'Варіанти: Дніпро; Дунай; Десна.', 'Яка річка тече через Київ?', 'Варіанти: Дніпро; Дунай; Десна.']);
  });

  it('the next question cancels and reads the new text', () => {
    const hook = mount(speechView());
    const before = synth.cancels;
    hook.rerender({ view: speechView({ questionIndex: 1, question: speechQuestion({ type: 'text', text: 'Назвіть столицю Польщі', choices: [] }) }), splashing: false, enabled: true });
    expect(synth.cancels).toBeGreaterThan(before);
    expect(texts().at(-1)).toBe('Назвіть столицю Польщі');
  });

  it('never says anything from the reveal', () => {
    const hook = mount(speechView({ question: speechQuestion({ type: 'text', text: 'Яка найдовша річка України?', choices: [] }) }));
    const before = synth.cancels;
    const reveal = speechView({ phase: 'reveal', question: speechQuestion({ type: 'text', text: 'Яка найдовша річка України?', choices: [] }), reveal: { accepted: ['Дніпро'] } as never });
    hook.rerender({ view: reveal, splashing: false, enabled: true });
    expect(synth.cancels).toBeGreaterThan(before);
    expect(synth.spoken).toHaveLength(1);
    act(() => hook.result.current.repeat());
    expect(synth.spoken).toHaveLength(1);
    for (const entry of synth.spoken) expect(entry.text).not.toContain('Дніпро');
  });

  it('turning it off and unmounting cancel', () => {
    const hook = mount(speechView());
    let before = synth.cancels;
    hook.rerender({ view: speechView(), splashing: false, enabled: false });
    expect(synth.cancels).toBeGreaterThan(before);
    expect(hook.result.current.status).toBe('off');
    hook.rerender({ view: speechView(), splashing: false, enabled: true });
    before = synth.cancels;
    hook.unmount();
    expect(synth.cancels).toBeGreaterThan(before);
  });

  it('without a voice of that language it says no_voice and reads nothing; a voice that comes during the same question reads it', () => {
    removeSpeech();
    synth = installSpeech([{ lang: 'en-US', name: 'English' }]);
    const hook = mount(speechView());
    act(() => vi.advanceTimersByTime(VOICES_WAIT_MS));
    expect(hook.result.current.status).toBe('no_voice');
    expect(hook.result.current.language).toBe('uk');
    expect(synth.spoken).toEqual([]);
    act(() => synth.setVoices(UK));
    expect(texts()).toEqual(['Яка річка тече через Київ?', 'Варіанти: Дніпро; Дунай; Десна.']);
    expect(synth.spoken[0]!.voice).toBe('uk-UA');
    hook.rerender({ view: speechView({ questionIndex: 1, question: speechQuestion({ type: 'text', text: 'Назвіть столицю Польщі', choices: [] }) }), splashing: false, enabled: true });
    expect(texts().at(-1)).toBe('Назвіть столицю Польщі');
  });

  it('waits for voices that come late instead of saying no_voice at once', () => {
    removeSpeech();
    synth = installSpeech([]);
    const hook = mount(speechView());
    expect(hook.result.current.status).toBe('idle');
    act(() => synth.setVoices(UK));
    expect(texts()[0]).toBe('Яка річка тече через Київ?');
  });

  it('a question with video says media and reads nothing', () => {
    const hook = mount(speechView({ question: speechQuestion({ video: { id: 'dQw4w9WgXcQ', start: 0 } as never }) }));
    expect(hook.result.current.status).toBe('media');
    expect(synth.spoken).toEqual([]);
  });

  it('without speechSynthesis the status is unsupported', () => {
    removeSpeech();
    const hook = mount(speechView());
    expect(hook.result.current.status).toBe('unsupported');
  });

  it('Latin or number-only question text with Cyrillic options needs a Ukrainian voice: with only English and Russian voices it stays silent', () => {
    removeSpeech();
    synth = installSpeech([{ lang: 'en-US', name: 'English' }, { lang: 'ru-RU', name: 'Інший' }]);
    const question = speechQuestion({ text: '1991?', choices: [{ id: 'a', text: 'Незалежність' }, { id: 'b', text: 'Олімпіада' }] });
    const hook = mount(speechView({ question }));
    act(() => vi.advanceTimersByTime(VOICES_WAIT_MS));
    expect(hook.result.current.status).toBe('no_voice');
    expect(hook.result.current.language).toBe('uk');
    expect(synth.spoken).toEqual([]);
  });
});
